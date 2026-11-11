#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 支付单（`pay_order`）的真栈场景门：属主仍是 **`user_id` + `user_type` 一对**，但分页没有属主过滤位，
// 故接的是**按标识符读 + 事后判属主**。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis（pay 已进 jar）
//   PG_CONTAINER=m3pay2-pg PG_DB=m3pay2_1102 HOST_URL=http://127.0.0.1:18112 \
//     node scripts/run-pay-order-scenarios.mjs
//
// **这套栈不需要支付渠道。** 本面只碰 `pay_order` 一张表，且只做 `selectById` / `selectByNo`。上游的建表脚本里
// 没有它（本部署只带七个模块的表），故本门禁**自己建**这张表：建了就记下来、收尾时删掉；已经在的只删本轮的行。
// 列型照部署方言：`deleted` 是 **`smallint`**（钱包那条门禁实测过 `boolean` 会让框架的逻辑删条件报
// `operator does not exist: boolean = integer`）。
//
// **红对照（本门禁可证伪的做法）**：把 `PayOrderGovernance#withholdOthersOrder` 改成直接返回 `call.proceed()`、
// 重建宿主再跑本脚本——证伪面必须转红（别人的单答 `hasOrder=true` 且带 9999）。`READING` 行由断言算出，
// 红灯时不会再打印全 1。
//
// 五条断言，夹具按**本轮唯一标记**（打在 `creator` 上）收束：
//
//   1. **工具路径只答调用方自己的那一单**（按支付单号）。种三行：管理员 1 自己的 100、另一个管理员 100 的 9999、
//      **同号会员 1 的 7777**。问「查一下支付单 P-OWN」答 `hasOrder=true`，9999 / 7777 都不在回复里——后一行量的
//      正是「一对属主」。
//   2. **证伪面：别人的单与不存在的单同一个答案**。问另一个管理员的 P-OTHER、再问一个根本不存在的 P-NONE，
//      两次都必须答 `hasOrder=false`，且都不带 9999。**不接**时第一次会拿到 9999——这就是「接」与「豁免」的差别。
//   3. **负对照：不是「表里只有一行」**。把自己那一行标删，另外两行**仍在**（先断言它们仍在），再问自己那单
//      ——答 `hasOrder=false`。
//   4. **请求路径原样放行**。同一个管理员走 REST `/pay/order/get?id=<别人的单>`：照旧拿得到那一行。切面只在
//      **有行动调用方**时动（工具路径），控制台的行为与上游一字不差。
//   5. **审计轨**：每次工具调用各留一行 `get_my_pay_order -> ok` / `executed`。
//
// **Red control (how this gate is shown to be falsifiable)**: make
// `PayOrderGovernance#withholdOthersOrder` return `call.proceed()` directly, rebuild the host and rerun this script —
// the falsifiable group must go red (another's order answers `hasOrder=true` with 9999). The `READING` line is computed
// from the assertions, so it cannot print all ones while the gate is red.
//
// The real-stack gate over the payment order (`pay_order`): the owner is still **the pair `user_id` + `user_type`**,
// but the page has no owner slot, so this face reads **by identifier and decides the owner afterwards**.
//
// **No payment channel is needed.** This face touches one table and only does `selectById` / `selectByNo`. Upstream's
// schema script does not carry it, so this gate **creates** it and drops it again when it created it, deleting only
// this run's rows when it was already there. Column types follow the deployment's dialect: `deleted` is `smallint`
// (the wallet gate measured that `boolean` makes the framework's logic-delete answer `operator does not exist:
// boolean = integer`).
//
// Five assertions, fixtures scoped by this run's marker in `creator`: the tool path answers the caller's own order by
// number, with a same-number member row and another administrator's row planted (narrowing by `user_id` alone would
// hand one over); the falsifiable face — another's order and a missing order answer `hasOrder=false` alike, which is
// exactly what "not connected" would fail; a negative control (the caller's own row marked deleted while the other
// two stay); the request path passes through untouched over REST; and one audit row per call.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const TOOL = 'get_my_pay_order';
const MARKER = `gate-m3pay2-${Date.now()}`;

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

// Identity and internal columns that must not leave the projection. `orderId` / `orderNo` are the
// business identifier and stay; these are who the row belongs to and how the table is administered.
const HIDDEN = ['userId', 'user_id', 'userType', 'user_type', 'userIp', 'user_ip',
  'channelUserId', 'channel_user_id', 'appId', 'app_id', 'tenantId', 'tenant_id', 'creator', 'updater', 'deleted'];
const leaks = (reply, hidden) => hidden.filter((key) => String(reply).includes(key));

const psql = (sql) => execFileSync('docker',
  ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-U', 'root', '-d', DB, '-tAc', sql],
  { encoding: 'utf8' }).trim();

async function api(path, { method = 'GET', token, body } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(`${HOST}/admin-api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const json = await res.json();
    if (json.code !== 500 || attempt > 1) {
      return json;
    }
    console.log(`  note  ${path} 第一次答 500 —— 宿主的瞬时故障，重试一次`);
    await new Promise((done) => setTimeout(done, 300));
  }
}

async function login(username, password) {
  const r = await api('/system/auth/login', { method: 'POST', body: { username, password } });
  if (r.code !== 0) throw new Error(`login(${username}) -> ${r.code}: ${r.msg}`);
  return r.data.accessToken;
}

let turns = 0;
async function chat(token, message) {
  turns += 1;
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId: `${MARKER}-${turns}` })
  });
  const json = await res.json();
  return json.data || json;
}

const OWN = `P-OWN-${MARKER}`;
const OTHER = `P-OTHER-${MARKER}`;
const MEMBER = `P-MEMBER-${MARKER}`;
const NONE = `P-NONE-${MARKER}`;

// ── 0) 夹具：表与本轮三行 ──────────────────────────────────────────────────────────────────────────
console.log('== 夹具 ==');
const tableExisted = psql(`select to_regclass('public.pay_order') is not null`) === 't';
if (!tableExisted) {
  psql(`CREATE TABLE pay_order (
    id bigserial PRIMARY KEY,
    app_id bigint,
    channel_id bigint,
    channel_code varchar(32),
    user_id bigint,
    user_type int4,
    merchant_order_id varchar(64),
    subject varchar(128),
    body varchar(256),
    notify_url varchar(256),
    price int4,
    channel_fee_rate float8,
    channel_fee_price int4,
    status int4,
    user_ip varchar(64),
    expire_time timestamp,
    success_time timestamp,
    extension_id bigint,
    no varchar(64),
    refund_price int4 DEFAULT 0,
    channel_user_id varchar(64),
    channel_order_no varchar(64),
    creator varchar(64) DEFAULT '',
    create_time timestamp NOT NULL DEFAULT now(),
    updater varchar(64) DEFAULT '',
    update_time timestamp NOT NULL DEFAULT now(),
    deleted smallint NOT NULL DEFAULT 0,
    tenant_id bigint NOT NULL DEFAULT 0
  )`);
}
note('pay_order 表', tableExisted ? '已存在（只删本轮的行）' : '本轮创建（收尾时删表）');

const cleanup = () => {
  psql(`delete from pay_order where creator = '${MARKER}'`);
  if (!tableExisted) {
    psql(`drop table if exists pay_order`);
  }
};
process.on('exit', () => {
  try { cleanup(); } catch (e) { console.log(`  note  收尾失败 ${e.message}`); }
});

// 同号会员那一行是本门禁的关键之一：只按 user_id 收窄，它会被一起交出去。
psql(`INSERT INTO pay_order (user_id, user_type, no, price, refund_price, status, channel_code, creator, tenant_id)
      VALUES (1, 2, '${OWN}', 100, 0, 10, 'wx_app', '${MARKER}', ${TENANT}),
             (100, 2, '${OTHER}', 9999, 0, 10, 'wx_app', '${MARKER}', ${TENANT}),
             (1, 1, '${MEMBER}', 7777, 0, 10, 'wx_app', '${MARKER}', ${TENANT})`);
check('本轮支付单行 = 3', '3', psql(`select count(*) from pay_order where creator = '${MARKER}' and deleted = 0`));
const otherId = psql(`select id from pay_order where creator = '${MARKER}' and no = '${OTHER}'`);

// ── 1) 工具路径只答调用方自己的那一单 ─────────────────────────────────────────────────────────────
console.log('== 工具路径 ==');
const token = await login(ADMIN_USER, resolveAdminPassword(psql));
const own = await chat(token, `查一下支付单 ${OWN} 的状态`);
check('路由选中 get_my_pay_order', 'true', JSON.stringify(own.toolCalls || []).includes(TOOL));
check('provider 是确定性规划器', 'deterministic', own.provider);
const ownReply = String(own.reply || '');
check('答的是管理员 1 自己的支付单', 'true', /hasOrder=true/.test(ownReply));
check('回复带自己的单号', 'true', ownReply.includes(OWN));
check('同号会员那一单不在回复里', 'true', !ownReply.includes('7777'));
check('另一个管理员那一单不在回复里', 'true', !ownReply.includes('9999'));
check('投影带业务标识（不是空回复）', 'true', /orderId=/.test(ownReply));
check('投影不含身份/内部字段', '[]', JSON.stringify(leaks(ownReply, HIDDEN)));
note('回复', ownReply);

// ── 2) 证伪面：别人的单与不存在的单同一个答案 ─────────────────────────────────────────────────────
console.log('== 证伪面 ==');
const other = await chat(token, `查一下支付单 ${OTHER} 的状态`);
const none = await chat(token, `查一下支付单 ${NONE} 的状态`);
const otherReply = String(other.reply || '');
const noneReply = String(none.reply || '');
check('别人的单答 hasOrder=false', 'true', /hasOrder=false/.test(otherReply));
check('不存在的单答 hasOrder=false', 'true', /hasOrder=false/.test(noneReply));
check('别人的单不带它的金额', 'true', !otherReply.includes('9999'));
check('两次答案的可观测形态相同', 'true', /hasOrder=false/.test(otherReply) && /hasOrder=false/.test(noneReply));
const otherWithheld = /hasOrder=false/.test(otherReply) && !otherReply.includes('9999');
const noneWithheld = /hasOrder=false/.test(noneReply);
note('别人的单', otherReply);
note('不存在的单', noneReply);

// ── 3) 负对照：不是「表里只有一行」 ───────────────────────────────────────────────────────────────
console.log('== 负对照 ==');
psql(`update pay_order set deleted = 1 where creator = '${MARKER}' and user_id = 1 and user_type = 2`);
check('另外两行仍在', '2', psql(`select count(*) from pay_order where creator = '${MARKER}' and deleted = 0`));
const gone = await chat(token, `查一下支付单 ${OWN} 的状态`);
check('自己的单不在时答 hasOrder=false', 'true', String(gone.reply || '').includes('hasOrder=false'));
note('回复', String(gone.reply || ''));
psql(`update pay_order set deleted = 0 where creator = '${MARKER}' and user_id = 1 and user_type = 2`);

// ── 4) 请求路径原样放行 ───────────────────────────────────────────────────────────────────────────
console.log('== 请求路径 ==');
const viaRest = await api(`/pay/order/get?id=${otherId}`, { token });
check('/pay/order/get code', '0', viaRest.code);
check('控制台照旧看得到别人的单（切面不动请求路径）', String(otherId), viaRest.data?.id);
check('控制台拿到的是那一单的金额', '9999', viaRest.data?.price);
const restSeesOtherRow = String(viaRest.data?.id) === String(otherId) && String(viaRest.data?.price) === '9999';

// ── 5) 审计轨 ───────────────────────────────────────────────────────────────────────────────────
console.log('== 审计轨 ==');
for (const turn of [own, other, none, gone]) {
  const n = Number(psql(`select count(*) from ai_audit_logs where tool = '${TOOL}'`
    + ` and outcome = 'executed' and conversation_id = '${turn.conversationId}'`));
  check(`会话 ${turn.conversationId} 有一行 executed`, '1', n);
}

// ── 读音 ───────────────────────────────────────────────────────────────────────────────────────
// 读数由断言算出，不写死：红灯时汇总行也必须跟着变红（这是探针自己的可证伪面）。
const reading = {
  toolReplyOwn: /hasOrder=true/.test(ownReply) && ownReply.includes(OWN)
    && !ownReply.includes('7777') && !ownReply.includes('9999'),
  otherAndMissingAlike: /hasOrder=false/.test(otherReply) && /hasOrder=false/.test(noneReply)
    && !otherReply.includes('9999'),
  projectionClean: /orderId=/.test(ownReply) && leaks(ownReply, HIDDEN).length === 0,
  restSeesOtherRow: String(viaRest.data?.id) === String(otherId) && String(viaRest.data?.price) === '9999'
};
console.log(`\nREADING toolReplyOwn=${+reading.toolReplyOwn} otherAndMissingAlike=${+reading.otherAndMissingAlike}`
  + ` projectionClean=${+reading.projectionClean} restSeesOtherRow=${+reading.restSeesOtherRow} marker=${MARKER}`);
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
