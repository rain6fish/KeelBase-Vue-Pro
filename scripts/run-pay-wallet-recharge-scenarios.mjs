#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 钱包充值单（`pay_wallet_recharge`）的真栈场景门：属主**不在这一行上**——行里只有 `wallet_id`，属主对
// `(user_id, user_type)` 在 `pay_wallet` 那一行。接法是**按充值单编号读 + 沿 `wallet_id` 走一跳判属主**。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis（pay 已进 jar）
//   PG_CONTAINER=payrech-pg PG_DB=payrech_1103 HOST_URL=http://127.0.0.1:18119 \
//     node scripts/run-pay-wallet-recharge-scenarios.mjs
//
// **这套栈不需要支付渠道。** 本面只做 `selectById`（充值单）与 `selectById`（钱包）；上游的建表脚本里没有这两张表
// （本部署只带七个模块的表），故本门禁**自己建**它们：建了就记下来、收尾时删掉；已经在的只删本轮的行。列型照部署
// 方言：`deleted` 是 **`smallint`**（钱包那条门禁实测过 `boolean` 会让框架的逻辑删条件报
// `operator does not exist: boolean = integer`）。
//
// 六组断言，夹具按**本轮唯一标记**（打在 `creator` 上）收束：
//
//   1. **工具路径只答调用方自己的那一笔**（按充值单编号）。种三个钱包：管理员 1 自己的、另一个管理员 100 的、
//      **同号会员 1 的**；每个钱包一笔充值，到账金额分别 120 / 9999 / 7777。问「查一下充值单 <自己的编号>」答
//      `hasRecharge=true`，回复带自己的编号与金额，9999 / 7777 都不在，`walletId` 也不在。
//   2. **证伪面：别人的充值单与不存在的充值单同一个答案**。问另一个管理员的编号、再问一个不存在的编号，两次都必须答
//      `hasRecharge=false`，且都不带 9999。**不接**时第一次会拿到 9999——这就是「接」与「豁免」的差别。
//   3. **负对照：不是「表里只有一笔」**。把自己那一笔标删，另外两笔**仍在**（先断言它们仍在），再问自己那笔——答
//      `hasRecharge=false`。
//   4. **请求路径：本部署没有可达的请求路径**。本对象唯一的分页读在 APP 端（`controller/app`），`/app-api` 要**会员**
//      令牌（userType=1），而本部署只有管理员令牌（userType=2）、schema 也不带 `member_user` 表 ⇒ 没有一条可达的请求
//      路径去观测「切面不动请求路径」。该行为由 `PayWalletRechargeGovernanceTest#theRequestPathPageProceeds` 单测证明；
//      本门禁把 APP 端口的答案如实记成读数，不拿它冒充断言。
//   5. **工具面只有一读、没有写，也没有分页**：`/ai/tools` 清单里本对象只有 `get_my_pay_wallet_recharge`（R1、无需确认），
//      名字里没有写动作；一条「列出我的充值单」的分页样消息**不落到任何分页/列表工具**（若被路由，只能落到那条读工具且
//      因缺编号不交出任何行）；一条写样消息不落到任何写工具、不动业务行。
//      **边界**：`getWalletRechargePackagePage` 在工具路径上的**拒绝**没有 HTTP 观测面（面上没有分页工具），它由
//      `PayWalletRechargeGovernanceTest#thePageIsRefusedOnTheToolPath` 单测证明。
//   6. **审计轨**：每次工具调用各留一行 `get_my_pay_wallet_recharge -> ok` / `executed`。
//
// The real-stack gate over the wallet recharge (`pay_wallet_recharge`): the owner is **not on this row** — only
// `wallet_id`, with the owner pair on the `pay_wallet` row. The form is **read by recharge id, then follow
// `wallet_id` one hop to decide the owner**.
//
// **No payment channel is needed.** This face only does `selectById` on the recharge and the wallet; upstream's schema
// script does not carry the two tables, so this gate **creates** them and drops them again when it created them,
// deleting only this run's rows when they were already there. Column types follow the deployment's dialect: `deleted`
// is `smallint`.
//
// Six assertion groups, fixtures scoped by this run's marker in `creator`: the tool path answers the caller's own
// recharge by id, with another administrator's wallet and a **member with the same number** planted; the falsifiable
// face — another's recharge and a missing one answer `hasRecharge=false` alike, and a row whose wallet cannot be read
// back is withheld too; a negative control; the app endpoint's answer is recorded as a reading rather than an assertion
// because this deployment can mint only administrator tokens while `/app-api` requires a member token (that half is
// proven by the aspects' unit test); the face has one read, no write and no page (the page's refusal on the tool path
// has no HTTP surface and is proven by the same unit test); and one audit row per call.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const TOOL = 'get_my_pay_wallet_recharge';
const MARKER = `gate-m3pay4-${Date.now()}`;

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

// ── 0) 夹具：两张表、三个钱包、三笔充值 ────────────────────────────────────────────────────────────
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

const rechargeExisted = psql(`select to_regclass('public.pay_wallet_recharge') is not null`) === 't';
if (!rechargeExisted) {
  psql(`CREATE TABLE pay_wallet_recharge (
    id bigserial PRIMARY KEY,
    wallet_id bigint NOT NULL,
    total_price int4 NOT NULL DEFAULT 0,
    pay_price int4 NOT NULL DEFAULT 0,
    bonus_price int4 NOT NULL DEFAULT 0,
    package_id bigint,
    pay_status boolean NOT NULL DEFAULT false,
    pay_order_id bigint,
    pay_channel_code varchar(64),
    pay_time timestamp,
    pay_refund_id bigint,
    refund_total_price int4,
    refund_pay_price int4,
    refund_bonus_price int4,
    refund_time timestamp,
    refund_status int4,
    creator varchar(64) DEFAULT '',
    create_time timestamp NOT NULL DEFAULT now(),
    updater varchar(64) DEFAULT '',
    update_time timestamp NOT NULL DEFAULT now(),
    deleted smallint NOT NULL DEFAULT 0,
    tenant_id bigint NOT NULL DEFAULT 0
  )`);
}
note('pay_wallet_recharge 表', rechargeExisted ? '已存在（只删本轮的行）' : '本轮创建（收尾时删表）');

const cleanup = () => {
  psql(`delete from pay_wallet_recharge where creator = '${MARKER}'`);
  psql(`delete from pay_wallet where creator = '${MARKER}'`);
  if (!rechargeExisted) {
    psql(`drop table if exists pay_wallet_recharge`);
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

// 自己的那一笔 `pay_status = true`，好让 APP 端分页口（它写死只取已支付）读得到它。
psql(`INSERT INTO pay_wallet_recharge (wallet_id, total_price, pay_price, bonus_price, pay_status, pay_channel_code, creator, tenant_id)
      VALUES (${ownWalletId}, 120, 100, 20, true, 'wallet', '${MARKER}', ${TENANT}),
             (${otherWalletId}, 9999, 9999, 0, false, 'wallet', '${MARKER}', ${TENANT}),
             (${memberWalletId}, 7777, 7777, 0, false, 'wallet', '${MARKER}', ${TENANT}),
             (987654321, 4242, 4242, 0, false, 'wallet', '${MARKER}', ${TENANT})`);
const ownId = psql(`select id from pay_wallet_recharge where creator = '${MARKER}' and total_price = 120`);
const otherId = psql(`select id from pay_wallet_recharge where creator = '${MARKER}' and total_price = 9999`);
const danglingId = psql(`select id from pay_wallet_recharge where creator = '${MARKER}' and total_price = 4242`);
const NONE_ID = '99999999';
check('本轮充值单行 = 4', '4', psql(`select count(*) from pay_wallet_recharge where creator = '${MARKER}' and deleted = 0`));
note('自己的充值单编号', ownId);

// ── 1) 工具路径只答调用方自己的那一笔 ─────────────────────────────────────────────────────────────
console.log('== 工具路径 ==');
const token = await login(ADMIN_USER, resolveAdminPassword(psql));
const own = await chat(token, `查一下充值单 ${ownId}`);
check('路由选中 get_my_pay_wallet_recharge', 'true', JSON.stringify(own.toolCalls || []).includes(TOOL));
check('provider 是确定性规划器', 'deterministic', own.provider);
const ownReply = String(own.reply || '');
check('答的是管理员 1 自己的充值单', 'true', /hasRecharge=true/.test(ownReply));
check('回复带自己的充值单编号', 'true', ownReply.includes(String(ownId)));
check('回复带自己的到账金额 120', 'true', ownReply.includes('120'));
check('同号会员那一笔不在回复里', 'true', !ownReply.includes('7777'));
check('另一个管理员那一笔不在回复里', 'true', !ownReply.includes('9999'));
check('投影不带钱包编号', 'true', !ownReply.includes('walletId'));
note('回复', ownReply);

// ── 2) 证伪面：别人的充值单与不存在的充值单同一个答案 ─────────────────────────────────────────────
console.log('== 证伪面 ==');
const other = await chat(token, `查一下充值单 ${otherId}`);
const none = await chat(token, `查一下充值单 ${NONE_ID}`);
const otherReply = String(other.reply || '');
const noneReply = String(none.reply || '');
check('别人的充值单答 hasRecharge=false', 'true', /hasRecharge=false/.test(otherReply));
check('不存在的充值单答 hasRecharge=false', 'true', /hasRecharge=false/.test(noneReply));
check('别人的充值单不带它的金额', 'true', !otherReply.includes('9999'));
check('两次答案的可观测形态相同', 'true', /hasRecharge=false/.test(otherReply) && /hasRecharge=false/.test(noneReply));
note('别人的充值单', otherReply);
note('不存在的充值单', noneReply);

// 悬空的 `wallet_id`：行在，但它指的钱包读不回来 ⇒ 工具路径同样不交出（属主判不出来就不答）。
const dangling = await chat(token, `查一下充值单 ${danglingId}`);
check('钱包读不回来的充值单答 hasRecharge=false', 'true', /hasRecharge=false/.test(String(dangling.reply || '')));
check('钱包读不回来的充值单不带它的金额', 'true', !String(dangling.reply || '').includes('4242'));
note('悬空钱包的充值单', String(dangling.reply || ''));

// ── 3) 负对照：不是「表里只有一笔」 ───────────────────────────────────────────────────────────────
console.log('== 负对照 ==');
psql(`update pay_wallet_recharge set deleted = 1 where creator = '${MARKER}' and id = ${ownId}`);
check('另外三笔仍在', '3', psql(`select count(*) from pay_wallet_recharge where creator = '${MARKER}' and deleted = 0`));
const gone = await chat(token, `查一下充值单 ${ownId}`);
check('自己的充值单不在时答 hasRecharge=false', 'true', String(gone.reply || '').includes('hasRecharge=false'));
note('回复', String(gone.reply || ''));
psql(`update pay_wallet_recharge set deleted = 0 where creator = '${MARKER}' and id = ${ownId}`);

// ── 4) 请求路径：本部署不可达，记录读数而不冒充断言 ─────────────────────────────────────────────
console.log('== 请求路径（边界） ==');
const viaApp = await (async () => {
  const res = await fetch(`${HOST}/app-api/pay/wallet-recharge/page?pageNo=1&pageSize=10`, {
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, Authorization: `Bearer ${token}` }
  });
  return res.json();
})();
note('/app-api/pay/wallet-recharge/page', `code=${viaApp.code} msg=${viaApp.msg}`);
note('为什么只有读数', '本部署只铸得出管理员令牌（userType=2），而 /app-api 要会员（userType=1），schema 也不带 member 表；'
  + '故没有可达的请求路径可观测。切面「请求路径原样放行」由 PayWalletRechargeGovernanceTest#theRequestPathPageProceeds 证明');

// ── 5) 工具面：一读、无写、无分页 ────────────────────────────────────────────────────────────────
console.log('== 工具面 ==');
const toolsRaw = await (await fetch(`${HOST}/ai/tools`, { headers: { Authorization: `Bearer ${token}`, 'tenant-id': TENANT } })).text();
const listed = (JSON.parse(toolsRaw).data || []);
const ours = listed.filter((t) => String(t.name).includes('pay_wallet_recharge'));
check('本对象的工具清单里只有一读', 1, ours.length);
check('那条读就是 get_my_pay_wallet_recharge', 'true', ours.some((t) => t.name === TOOL));
check('它是 R1 且无需确认', 'true', ours.every((t) => t.riskLevel === 'R1' && t.requiresConfirmation === false && t.requiresApproval === false));
const WRITE_WORDS = /(save|create|update|delete|close|cancel|import|transfer|generate|revoke)/i;
check('名字里没有写动作', 0, ours.filter((t) => WRITE_WORDS.test(t.name)).length);

const pageAsk = await chat(token, '列出我的充值单');
const pageCalls = pageAsk.toolCalls || [];
check('分页样消息不落到任何分页/列表工具', 0, pageCalls.filter((n) => /(list|page|search)/i.test(n)).length);
check('分页样消息若被路由，落到的是那条读工具', 'true', pageCalls.every((n) => n === TOOL));
check('没有编号时那条读不交出任何行', 'true', !/hasRecharge=true/.test(String(pageAsk.reply || '')));
const before = psql(`select count(*) from pay_wallet_recharge where creator = '${MARKER}' and deleted = 0`);
const writeAsk = await chat(token, '帮我创建一笔充值单');
const writeCalls = writeAsk.toolCalls || [];
check('写样消息不落到任何写工具', 0, writeCalls.filter((n) => WRITE_WORDS.test(n)).length);
check('写样消息若被路由，落到的是那条读工具', 'true', writeCalls.every((n) => n === TOOL));
check('写样消息前后业务行一行未动', before, psql(`select count(*) from pay_wallet_recharge where creator = '${MARKER}' and deleted = 0`));
note('分页的拒绝面', '工具面上没有分页工具；切面对 getWalletRechargePackagePage 的拒绝由单测证明');

// ── 6) 审计轨 ───────────────────────────────────────────────────────────────────────────────────
console.log('== 审计轨 ==');
for (const turn of [own, other, none, dangling, gone]) {
  const n = Number(psql(`select count(*) from ai_audit_logs where tool = '${TOOL}'`
    + ` and outcome = 'executed' and conversation_id = '${turn.conversationId}'`));
  check(`会话 ${turn.conversationId} 有一行 executed`, '1', n);
}

// ── 读音 ───────────────────────────────────────────────────────────────────────────────────────
console.log(`\nREADING toolReplyOwn=1 otherAndMissingAlike=1 danglingWalletWithheld=1 oneReadNoWriteNoPage=1 marker=${MARKER}`);
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
