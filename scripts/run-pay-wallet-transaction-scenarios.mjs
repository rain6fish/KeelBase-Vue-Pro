#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 钱包流水（`pay_wallet_transaction`）的真栈场景门：属主**不在这一行上**——行里只有 `wallet_id`，属主对
// `(user_id, user_type)` 在 `pay_wallet` 那一行。接法是**按流水号读 + 沿 `wallet_id` 走一跳判属主**。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis（pay 已进 jar）
//   PG_CONTAINER=payrem-pg PG_DB=payrem_1103 HOST_URL=http://127.0.0.1:18116 \
//     node scripts/run-pay-wallet-transaction-scenarios.mjs
//
// **这套栈不需要支付渠道。** 本面只做 `selectByNo`（流水）与 `selectById`（钱包）；上游的建表脚本里没有这两张表
// （本部署只带七个模块的表），故本门禁**自己建**它们：建了就记下来、收尾时删掉；已经在的只删本轮的行。列型照部署
// 方言：`deleted` 是 **`smallint`**（钱包那条门禁实测过 `boolean` 会让框架的逻辑删条件报
// `operator does not exist: boolean = integer`）。
//
// 五条断言，夹具按**本轮唯一标记**（打在 `creator` 上）收束：
//
//   1. **工具路径只答调用方自己的那一笔**（按流水号）。种三个钱包：管理员 1 自己的、另一个管理员 100 的、**同号会员 1 的**；
//      每个钱包一笔流水，金额分别 100 / 9999 / 7777。问「查一下流水号 T-OWN」答 `hasTransaction=true`，回复带自己的
//      流水号与金额，9999 / 7777 都不在。
//   2. **证伪面：别人的流水与不存在的流水同一个答案**。问另一个管理员的 T-OTHER、再问一个不存在的 T-NONE，两次都必须答
//      `hasTransaction=false`，且都不带 9999。**不接**时第一次会拿到 9999——这就是「接」与「豁免」的差别。
//   3. **负对照：不是「表里只有一笔」**。把自己那一笔标删，另外两笔**仍在**（先断言它们仍在），再问自己那笔——答
//      `hasTransaction=false`。
//   4. **请求路径原样放行**。同一个管理员走 REST `/pay/wallet-transaction/page?walletId=<别人的钱包>`：照旧拿得到
//      别人的流水。切面只在**有行动调用方**时动（工具路径），控制台的行为与上游一字不差。
//   5. **审计轨**：每次工具调用各留一行 `get_my_pay_wallet_transaction -> ok` / `executed`。
//
// The real-stack gate over the wallet transaction (`pay_wallet_transaction`): the owner is **not on this row** — only
// `wallet_id`, with the owner pair on the `pay_wallet` row. The form is **read by transaction number, then follow
// `wallet_id` one hop to decide the owner**.
//
// **No payment channel is needed.** This face only does `selectByNo` and `selectById`; upstream's schema script does not
// carry the two tables, so this gate **creates** them and drops them again when it created them, deleting only this
// run's rows when they were already there. Column types follow the deployment's dialect: `deleted` is `smallint`.
//
// Five assertions, fixtures scoped by this run's marker in `creator`: the tool path answers the caller's own flow by
// number, with another administrator's wallet and a **member with the same number** planted (a check on `user_id` alone
// would hand one over); the falsifiable face — another's flow and a missing flow answer `hasTransaction=false` alike,
// which is exactly what "not connected" would fail; a negative control (the caller's own row marked deleted while the
// other two stay); the request path passes through untouched over REST; and one audit row per call.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const TOOL = 'get_my_pay_wallet_transaction';
const MARKER = `gate-m3pay3-${Date.now()}`;

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

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

const OWN = `T-OWN-${MARKER}`;
const OTHER = `T-OTHER-${MARKER}`;
const MEMBER = `T-MEMBER-${MARKER}`;
const NONE = `T-NONE-${MARKER}`;

// ── 0) 夹具：两张表、三个钱包、三笔流水 ────────────────────────────────────────────────────────────
console.log('== 夹具 ==');
const walletExisted = psql(`select to_regclass('public.pay_wallet') is not null`) === 't';
if (!walletExisted) {
  psql(`CREATE TABLE pay_wallet (
    id bigserial PRIMARY KEY,
    user_id bigint NOT NULL,
    user_type int4 NOT NULL,
    balance int4 NOT NULL DEFAULT 0,
    freeze_price int4 NOT NULL DEFAULT 0,
    total_expense int4 NOT NULL DEFAULT 0,
    total_recharge int4 NOT NULL DEFAULT 0,
    creator varchar(64) DEFAULT '',
    create_time timestamp NOT NULL DEFAULT now(),
    updater varchar(64) DEFAULT '',
    update_time timestamp NOT NULL DEFAULT now(),
    deleted smallint NOT NULL DEFAULT 0,
    tenant_id bigint NOT NULL DEFAULT 0
  )`);
}
note('pay_wallet 表', walletExisted ? '已存在（只删本轮的行）' : '本轮创建（收尾时删表）');

const transactionExisted = psql(`select to_regclass('public.pay_wallet_transaction') is not null`) === 't';
if (!transactionExisted) {
  psql(`CREATE TABLE pay_wallet_transaction (
    id bigserial PRIMARY KEY,
    no varchar(64) NOT NULL,
    wallet_id bigint NOT NULL,
    biz_type int4,
    biz_id varchar(64),
    title varchar(128),
    price int4 NOT NULL DEFAULT 0,
    balance int4 NOT NULL DEFAULT 0,
    creator varchar(64) DEFAULT '',
    create_time timestamp NOT NULL DEFAULT now(),
    updater varchar(64) DEFAULT '',
    update_time timestamp NOT NULL DEFAULT now(),
    deleted smallint NOT NULL DEFAULT 0,
    tenant_id bigint NOT NULL DEFAULT 0
  )`);
}
note('pay_wallet_transaction 表', transactionExisted ? '已存在（只删本轮的行）' : '本轮创建（收尾时删表）');

const cleanup = () => {
  psql(`delete from pay_wallet_transaction where creator = '${MARKER}'`);
  psql(`delete from pay_wallet where creator = '${MARKER}'`);
  if (!transactionExisted) {
    psql(`drop table if exists pay_wallet_transaction`);
  }
  if (!walletExisted) {
    psql(`drop table if exists pay_wallet`);
  }
};
process.on('exit', () => {
  try { cleanup(); } catch (e) { console.log(`  note  收尾失败 ${e.message}`); }
});

// 同号会员那个钱包是本门禁的关键之一：只按 user_id 收窄，它会被一起交出去。
psql(`INSERT INTO pay_wallet (user_id, user_type, balance, creator, tenant_id)
      VALUES (1, 2, 100, '${MARKER}', ${TENANT}),
             (100, 2, 9999, '${MARKER}', ${TENANT}),
             (1, 1, 7777, '${MARKER}', ${TENANT})`);
const ownWalletId = psql(`select id from pay_wallet where creator = '${MARKER}' and user_id = 1 and user_type = 2`);
const otherWalletId = psql(`select id from pay_wallet where creator = '${MARKER}' and user_id = 100 and user_type = 2`);
const memberWalletId = psql(`select id from pay_wallet where creator = '${MARKER}' and user_id = 1 and user_type = 1`);
check('本轮钱包行 = 3', '3', psql(`select count(*) from pay_wallet where creator = '${MARKER}' and deleted = 0`));

psql(`INSERT INTO pay_wallet_transaction (no, wallet_id, biz_type, biz_id, title, price, balance, creator, tenant_id)
      VALUES ('${OWN}', ${ownWalletId}, 10, 'order-own', '钱包余额充值', 100, 100, '${MARKER}', ${TENANT}),
             ('${OTHER}', ${otherWalletId}, 10, 'order-other', '钱包余额充值', 9999, 9999, '${MARKER}', ${TENANT}),
             ('${MEMBER}', ${memberWalletId}, 10, 'order-member', '钱包余额充值', 7777, 7777, '${MARKER}', ${TENANT})`);
check('本轮流水行 = 3', '3', psql(`select count(*) from pay_wallet_transaction where creator = '${MARKER}' and deleted = 0`));

// ── 1) 工具路径只答调用方自己的那一笔 ─────────────────────────────────────────────────────────────
console.log('== 工具路径 ==');
const token = await login(ADMIN_USER, resolveAdminPassword(psql));
const own = await chat(token, `查一下流水号 ${OWN}`);
check('路由选中 get_my_pay_wallet_transaction', 'true', JSON.stringify(own.toolCalls || []).includes(TOOL));
check('provider 是确定性规划器', 'deterministic', own.provider);
const ownReply = String(own.reply || '');
check('答的是管理员 1 自己的流水', 'true', /hasTransaction=true/.test(ownReply));
check('回复带自己的流水号', 'true', ownReply.includes(OWN));
check('同号会员那一笔不在回复里', 'true', !ownReply.includes('7777'));
check('另一个管理员那一笔不在回复里', 'true', !ownReply.includes('9999'));
note('回复', ownReply);

// ── 2) 证伪面：别人的流水与不存在的流水同一个答案 ─────────────────────────────────────────────────
console.log('== 证伪面 ==');
const other = await chat(token, `查一下流水号 ${OTHER}`);
const none = await chat(token, `查一下流水号 ${NONE}`);
const otherReply = String(other.reply || '');
const noneReply = String(none.reply || '');
check('别人的流水答 hasTransaction=false', 'true', /hasTransaction=false/.test(otherReply));
check('不存在的流水答 hasTransaction=false', 'true', /hasTransaction=false/.test(noneReply));
check('别人的流水不带它的金额', 'true', !otherReply.includes('9999'));
check('两次答案的可观测形态相同', 'true', /hasTransaction=false/.test(otherReply) && /hasTransaction=false/.test(noneReply));
note('别人的流水', otherReply);
note('不存在的流水', noneReply);

// ── 3) 负对照：不是「表里只有一笔」 ───────────────────────────────────────────────────────────────
console.log('== 负对照 ==');
psql(`update pay_wallet_transaction set deleted = 1 where creator = '${MARKER}' and no = '${OWN}'`);
check('另外两笔仍在', '2', psql(`select count(*) from pay_wallet_transaction where creator = '${MARKER}' and deleted = 0`));
const gone = await chat(token, `查一下流水号 ${OWN}`);
check('自己的流水不在时答 hasTransaction=false', 'true', String(gone.reply || '').includes('hasTransaction=false'));
note('回复', String(gone.reply || ''));
psql(`update pay_wallet_transaction set deleted = 0 where creator = '${MARKER}' and no = '${OWN}'`);

// ── 4) 请求路径原样放行 ───────────────────────────────────────────────────────────────────────────
console.log('== 请求路径 ==');
const viaRest = await api(`/pay/wallet-transaction/page?pageNo=1&pageSize=10&walletId=${otherWalletId}`, { token });
check('/pay/wallet-transaction/page code', '0', viaRest.code);
check('控制台按别人的钱包编号照旧读得到（切面不动请求路径）', '1', viaRest.data?.total);
check('控制台拿到的是那一笔的金额', '9999', viaRest.data?.list?.[0]?.price);

// ── 5) 审计轨 ───────────────────────────────────────────────────────────────────────────────────
console.log('== 审计轨 ==');
for (const turn of [own, other, none, gone]) {
  const n = Number(psql(`select count(*) from ai_audit_logs where tool = '${TOOL}'`
    + ` and outcome = 'executed' and conversation_id = '${turn.conversationId}'`));
  check(`会话 ${turn.conversationId} 有一行 executed`, '1', n);
}

// ── 读音 ───────────────────────────────────────────────────────────────────────────────────────
// 读数由断言算出，不写死：红灯时汇总行也必须跟着变红（这是探针自己的可证伪面）。
// The readings are computed from the assertions, never hardcoded: a red run must show red here too.
const reading = {
  toolReplyOwn: /hasTransaction=true/.test(ownReply) && ownReply.includes(OWN)
    && !ownReply.includes('7777') && !ownReply.includes('9999'),
  otherAndMissingAlike: /hasTransaction=false/.test(otherReply) && /hasTransaction=false/.test(noneReply)
    && !otherReply.includes('9999'),
  restSeesOtherRow: String(viaRest.data?.total) === '1'
    && String(viaRest.data?.list?.[0]?.price) === '9999'
};
console.log(`\nREADING toolReplyOwn=${+reading.toolReplyOwn} otherAndMissingAlike=${+reading.otherAndMissingAlike}`
  + ` restSeesOtherRow=${+reading.restSeesOtherRow} marker=${MARKER}`);
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
