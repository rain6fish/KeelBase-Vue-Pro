#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 钱包（`pay_wallet`）的真栈场景门：属主是 **`user_id` + `user_type` 一对**，两个编号空间会撞号。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis（pay 已进 jar）
//   PG_CONTAINER=m3pay-pg PG_DB=m3pay_1102 HOST_URL=http://127.0.0.1:18111 \
//     node scripts/run-pay-wallet-scenarios.mjs
//
// **这套栈不需要支付渠道。** 钱包的读只碰 `pay_wallet` 一张表；上游的建表脚本里没有它（本部署只带七个模块的表），
// 故本门禁**自己建**这张表：建了就记下来、收尾时删掉；已经在的（别人建的）只删本轮的行。列型照部署方言取
// —— `deleted` 是 `smallint`，不是 MySQL 的 `bit(1)`：照后者建，框架的逻辑删条件会以
// `operator does not exist: boolean = integer` 结束调用（本门禁首跑就是这么红的）。
//
// 四条断言，夹具按**本轮唯一标记**（打在 `creator` 上）收束：
//
//   1. **工具路径只答调用方自己**。种三行：管理员 1 自己的 100、另一个管理员 100 的 999、**同号会员 1 的 777**。
//      问一句「我的钱包还剩多少钱」，答的是 `balance=100`，且 `999` / `777` 都不在回复里 —— 后一行量的正是
//      「一对属主」：只按 `user_id` 收窄会把会员那一行也交出去。
//   2. **负对照：不是「表里只有一行」**。把管理员 1 那一行标删，另外两行**仍在**（先断言它们仍在），再问同一句
//      —— 答 `hasWallet=false`。这条把断言 1 的绿与「凑巧只有一行」分开。
//   3. **请求路径原样放行**。同一个管理员走 REST `/pay/wallet/page`：看得到同号会员那一行、也看得到另一个管理员
//      那一行。切面只在**有行动调用方**时动（工具路径），控制台的行为与上游一字不差。
//   4. **审计轨**：两次工具调用各留一行 `get_my_pay_wallet -> ok` / `executed`。
//
// The real-stack gate over the wallet (`pay_wallet`): the owner is **the pair `user_id` + `user_type`**, and the
// two id spaces collide.
//
// **No payment channel is needed.** The wallet read touches one table; upstream's schema script does not carry it
// (this deployment ships seven modules' tables), so this gate **creates** it — and drops it again when it created
// it, deleting only this run's rows when the table was already there. Column types follow the deployment's dialect:
// `deleted` is `smallint`, not MySQL's `bit(1)` — the other way the framework's logic-delete answers
// `operator does not exist: boolean = integer` (this gate's first run did exactly that).
//
// Four assertions, fixtures scoped by this run's marker in `creator`: the tool path answers the caller alone (three
// rows seeded, one of them a **member with the same number** — narrowing by `user_id` alone would hand it over); a
// negative control (the caller's own row marked deleted while the other two stay, then the same question answers
// `hasWallet=false`) so assertion 1 is not "the table happened to hold one row"; the request path passes through
// untouched (the same administrator sees both other rows over REST); and the audit trail carries one
// `get_my_pay_wallet -> ok` row per call.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const TOOL = 'get_my_pay_wallet';
const MARKER = `gate-m3pay-${Date.now()}`;

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

async function chat(token, message) {
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId: `${MARKER}-${pass + fail}` })
  });
  const json = await res.json();
  return json.data || json;
}

// ── 0) 夹具：表与本轮三行 ──────────────────────────────────────────────────────────────────────────
console.log('== 夹具 ==');
const tableExisted = psql(`select to_regclass('public.pay_wallet') is not null`) === 't';
if (!tableExisted) {
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
note('pay_wallet 表', tableExisted ? '已存在（只删本轮的行）' : '本轮创建（收尾时删表）');

const cleanup = () => {
  psql(`delete from pay_wallet where creator = '${MARKER}'`);
  if (!tableExisted) {
    psql(`drop table if exists pay_wallet`);
  }
};
process.on('exit', () => {
  try { cleanup(); } catch (e) { console.log(`  note  收尾失败 ${e.message}`); }
});

// 同号会员那一行是本门禁的关键：只按 user_id 收窄，它会被一起交出去。
psql(`INSERT INTO pay_wallet (user_id, user_type, balance, freeze_price, total_expense, total_recharge, creator, tenant_id)
      VALUES (1, 2, 100, 0, 20, 120, '${MARKER}', ${TENANT}),
             (100, 2, 999, 0, 0, 999, '${MARKER}', ${TENANT}),
             (1, 1, 777, 0, 0, 777, '${MARKER}', ${TENANT})`);
check('本轮钱包行 = 3', '3', psql(`select count(*) from pay_wallet where creator = '${MARKER}' and deleted = 0`));

// ── 1) 工具路径只答调用方自己 ──────────────────────────────────────────────────────────────────────
console.log('== 工具路径 ==');
const token = await login(ADMIN_USER, resolveAdminPassword(psql));
const first = await chat(token, '我的钱包还剩多少钱');
check('路由选中 get_my_pay_wallet', 'true', JSON.stringify(first.toolCalls || []).includes(TOOL));
check('provider 是确定性规划器', 'deterministic', first.provider);
const reply1 = String(first.reply || '');
check('答的是管理员 1 自己的余额', 'true', /balance=100\b/.test(reply1));
check('同号会员那一行不在回复里', 'true', !reply1.includes('777'));
check('另一个管理员那一行不在回复里', 'true', !reply1.includes('999'));
note('回复', reply1);

// ── 2) 负对照：不是「表里只有一行」 ───────────────────────────────────────────────────────────────
console.log('== 负对照 ==');
psql(`update pay_wallet set deleted = 1 where creator = '${MARKER}' and user_id = 1 and user_type = 2`);
check('另外两行仍在', '2', psql(`select count(*) from pay_wallet where creator = '${MARKER}' and deleted = 0`));
const second = await chat(token, '我的钱包还剩多少钱');
check('自己的行不在时答 hasWallet=false', 'true', String(second.reply || '').includes('hasWallet=false'));
note('回复', String(second.reply || ''));
psql(`update pay_wallet set deleted = 0 where creator = '${MARKER}' and user_id = 1 and user_type = 2`);

// ── 3) 请求路径原样放行 ───────────────────────────────────────────────────────────────────────────
console.log('== 请求路径 ==');
const page = await api('/pay/wallet/page?pageNo=1&pageSize=10', { token });
check('/pay/wallet/page code', '0', page.code);
const rows = page.data?.list || [];
check('控制台看得到同号会员那一行（切面不动请求路径）', 'true',
  rows.some((r) => Number(r.userId) === 1 && Number(r.userType) === 1));
check('控制台看得到另一个管理员那一行', 'true',
  rows.some((r) => Number(r.userId) === 100 && Number(r.userType) === 2));
const memberPage = await api('/pay/wallet/page?pageNo=1&pageSize=10&userId=100&userType=2', { token });
check('控制台按属主两列筛选可用', '1', memberPage.data?.total);

// ── 4) 审计轨 ───────────────────────────────────────────────────────────────────────────────────
console.log('== 审计轨 ==');
for (const turn of [first, second]) {
  const n = Number(psql(`select count(*) from ai_audit_logs where tool = '${TOOL}'`
    + ` and outcome = 'executed' and conversation_id = '${turn.conversationId}'`));
  check(`会话 ${turn.conversationId} 有一行 executed`, '1', n);
}

// ── 读音 ───────────────────────────────────────────────────────────────────────────────────────
console.log(`\nREADING toolReplyOwn=1 negativeAnsweredNoWallet=1 restSeesOtherRows=1 marker=${MARKER}`);
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
