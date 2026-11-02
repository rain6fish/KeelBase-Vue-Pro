#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// The flagship loop, end to end: an assistant that answers "who is worth following up, and why",
// records the follow-up a person picks, and leaves a trail that answers for all of it.
//
//   bash scripts/run-server.sh &            # a running stack, PostgreSQL + redis
//   node scripts/run-flagship-crm-scenarios.mjs
//
// What it asserts, and what it deliberately does not:
//
//   * **The two tools run, under the caller, within one conversation.** Read from the audit trail and
//     scoped to this run's conversation id — the column the runtime stamps on every row of a turn — so
//     another run's rows cannot satisfy it.
//   * **The write is held and then lands.** A follow-up record appears in the module's own table,
//     attached to the customer the turn named, and the ledger carries a snapshot of it.
//   * **Out of scope is refused even after approval** — the module's own seam answers, not this gate.
//   * **The trace is one story.** The conversation's own endpoint returns the tool calls, the decision
//     and the effect on one timeline.
//   * **A withdrawal reaches the module.** Revoking the effect soft-deletes the record it created and
//     leaves exactly one line saying so.
//
//   * **What is NOT asserted, and why**: the queue's *contents* — how many rows, and the reason on
//     each. Neither runtime puts a tool's result on the wire (the answer is the frozen
//     `chat-response`), so the shape of that payload is the tool's own projection and is checked where
//     it is written, not here. Saying so is the point: a green line here must not be read as "the
//     ranking was right".
//
// 旗舰闭环，端到端：一个回答「谁值得跟进、为什么」、把**人选的那一条**记成跟进、并为这一切留下可核痕迹的助手。
//
// 断的是：两个工具在**这一轮会话**里、以**该调用方**跑过（从审计轨读，按本轮会话号收束，故别的轮次满足不了）；
// 写被扣下、确认后落在**模块自己的表**上并挂在**本轮点名的那个客户**上，账本留下它的快照；越权**批准了也拒**
// （拒的是**模块自己**那条缝，不是本门禁）；轨迹是**一个故事**（该会话自己的端点把工具调用、裁决、副作用并成一条
// 时间线）；撤销**够得着模块**（撤销那笔副作用会把它建的那条记录软删，且**恰好**多一行说明它）。
//
// ⚠ **没有断、以及为什么**：队列的**内容** —— 几条、每行那句理由。两个运行时都**不把工具结果放上线**（答案是
// 冻结的 `chat-response`），故那份载荷的形状是**工具自己的投影**、在写它的地方核，不在这里。**把这一点说出来
// 才是要点**：这一行绿**不能**被读成「排序是对的」。
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const SECOND_USER = process.env.SECOND_USER || 'gatesales';
const SECOND_PASS = process.env.SECOND_PASS || 'gate-pass-1234';
const CUSTOMER = process.env.CRM_TABLE || 'crm_customer';
const FOLLOWUP = 'crm_follow_up_record';

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

const psql = (sql) =>
  execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-U', 'root', '-d', DB, '-tAc', sql], { encoding: 'utf8' }).trim();

// Clean up on the way out, attached the moment this run creates its first row — a run that dies
// half-way must still put back what it made. Same shape and same reason as the sibling gates.
// 崩了也收尾，在本轮造出第一行的那一刻挂上 —— 半路死掉的轮次也得把它造的东西收回去。与兄弟门禁同形、同理。
let putBack = null;
function runPutBack() {
  if (!putBack) return false;
  const once = putBack;
  putBack = null;
  once();
  return true;
}
process.on('exit', () => {
  try {
    if (runPutBack()) console.log('  note  收尾走了退出路径（本进程在此之前已经出错）');
  } catch (e) {
    console.error(`  note  退出路径上的收尾没跑成：${e.message}`);
  }
});

// One request, retried once on the host's transient 500 — see the sibling gate for the measurement.
// 一次请求；宿主答它那个瞬时 500 时重试一次 —— 实测见兄弟门禁。
async function api(path, { method = 'GET', token, body } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(`${HOST}/admin-api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const json = await res.json();
    if (json.code !== 500 || attempt > 1) return json;
    console.log(`  note  ${path} 第一次答 500 —— 宿主的瞬时故障，重试一次`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function login(username, password) {
  const r = await api('/system/auth/login', { method: 'POST', body: { username, password } });
  if (r.code !== 0) throw new Error(`login(${username}) -> ${r.code}: ${r.msg}`);
  return r.data.accessToken;
}

// One turn, in a named conversation. The id is the run's own, so every assertion below can be scoped
// to it — and so the trace in scene 5 is the story of *these* turns.
// 一个回合，跑在**点名的那条会话**里。号是本轮自己的，故下面每条断言都能按它收束 —— 第 5 场那条轨迹也就正是
// **这几轮**的故事。
async function chat(token, message, conversationId, extra = {}) {
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId, ...extra })
  });
  const json = await res.json();
  return json.data || json;
}

async function confirm(token, confirmationToken, decision) {
  const res = await fetch(`${HOST}/ai/confirmations/${confirmationToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision })
  });
  const json = await res.json();
  return json.data || json;
}

const pendingCount = (operatorId) =>
  Number(psql(`select count(*) from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`));

const pendingToken = (operatorId) =>
  psql(`select token from confirmation_requests where operator_id = '${operatorId}' and status = 'pending' order by id desc limit 1`) || undefined;

/** How many times this tool ran **in this run's conversation** — read from the trail, not the answer. */
const ranIn = (conversationId, tool) =>
  Number(psql(`select count(*) from ai_audit_logs where tool = '${tool}' and conversation_id = '${conversationId}' and outcome = 'executed'`));

// ── 0) the stack answers at all ────────────────────────────────────────────────────────────────────
console.log('== 前置 ==');
check('/app/capabilities 200', '200', (await fetch(`${HOST}/app/capabilities`)).status);
const admin = await login(ADMIN_USER, resolveAdminPassword(psql));
ok('admin 登录');

// The first turn is opened with a name this run chooses; from then on it continues the id the
// **runtime issued**, because that is the one the audit rows and the trace carry. Asserting against the
// name we sent would read as a failure while the trail was in fact complete.
// 第一轮用本轮回自己起的名；此后接着**运行时签发**的那个 id —— 审计行与轨迹带的是它。拿我们传进去的名去收束，
// 会在痕迹其实完整时报成失败。
const seedConv = `flagship-${Date.now()}`;
let conv = seedConv;
const marker = `flagship-${Date.now()}`;
let callerId = psql(`select id from system_users where username = '${SECOND_USER}' and deleted = 0 limit 1`);
if (!callerId) {
  const created = await api('/system/user/create', {
    method: 'POST',
    token: admin,
    body: { username: SECOND_USER, nickname: SECOND_USER, password: SECOND_PASS, deptId: 100, postIds: [] }
  });
  if (created.code !== 0) throw new Error(`create user -> ${created.code}: ${created.msg}`);
  callerId = created.data;
  const roles = psql(`select id from system_role where code = 'common' and deleted = 0 limit 1`);
  await api('/system/permission/assign-user-role', { method: 'POST', token: admin, body: { userId: Number(callerId), roleIds: [Number(roles)] } });
}
const caller = await login(SECOND_USER, SECOND_PASS);
ok(`第二个调用方登录（id=${callerId}）`);

// ── the rows: three customers, one of them the caller's and overdue, one never contacted ───────────
console.log('== 种子 · 三个客户：调用方的两个 + 管理员的一个 ==');
// Inserts and reads are separate statements on purpose: `psql -tAc` prints a returned `id` **and** the
// command tag when they are one, which turns the id into a string nobody can use. Measured here.
// 插入与读取**分开**两条语句：合在一起时 `psql -tAc` 会把回来的 `id` **连命令行标签一起**印出来，id 就成了
// 一个没人能用的串。本门禁实测过。
psql(`insert into ${CUSTOMER}(id, name, owner_user_id, deal_status, follow_up_status, contact_next_time, contact_last_time, tenant_id)`
  + ` values (nextval('${CUSTOMER}_seq'), '${marker}-overdue', ${callerId}, false, false, now() - interval '2 day', now() - interval '40 day', ${TENANT})`);
psql(`insert into ${CUSTOMER}(id, name, owner_user_id, deal_status, follow_up_status, tenant_id)`
  + ` values (nextval('${CUSTOMER}_seq'), '${marker}-never', ${callerId}, false, false, ${TENANT})`);
psql(`insert into ${CUSTOMER}(id, name, owner_user_id, deal_status, follow_up_status, tenant_id)`
  + ` values (nextval('${CUSTOMER}_seq'), '${marker}-closed', ${callerId}, true, false, ${TENANT})`);
psql(`insert into ${CUSTOMER}(id, name, owner_user_id, deal_status, follow_up_status, tenant_id)`
  + ` values (nextval('${CUSTOMER}_seq'), '${marker}-admin', 1, false, false, ${TENANT})`);
const overdueId = psql(`select id from ${CUSTOMER} where name = '${marker}-overdue'`);
const adminRowId = psql(`select id from ${CUSTOMER} where name = '${marker}-admin'`);
// 模块自己的授权模型：**一条权限行**才让某人是某业务对象的负责人。合规的客户由模块自己建时会带上它，而本门禁是
// 裸 SQL 种的 ⇒ 得自己补 —— 否则模块自己的**删除**会以「没有权限」拒掉一次**它本该允许的撤销**（实测过一次）。
//
// The module's own authorization model: a **permission row** is what makes somebody a business object's
// owner. A customer the module creates carries one, and this gate seeds by raw SQL, so it has to add
// them — otherwise the module's own delete refuses a withdrawal it should have allowed. Measured once.
for (const rowId of [overdueId, psql(`select id from ${CUSTOMER} where name = '${marker}-never'`),
  psql(`select id from ${CUSTOMER} where name = '${marker}-closed'`)]) {
  psql(`insert into crm_permission(id, biz_type, biz_id, user_id, level, tenant_id)`
    + ` values (nextval('crm_permission_seq'), 2, ${rowId}, ${callerId}, 1, ${TENANT})`);
}
putBack = () => psql([
  // 被**拒绝**的那一笔会留下一个没有效应的认领，而「按效应收」够不到它 —— 宿主把切面抛的 `AccessDeniedException`
  // 包成了 `RuntimeException`，运行时的「没落库就释放认领」认不出来（`YD-28` 的冷读者实测；本线这类残留里
  // `record_crm_followup` 有 7 条）。范围取**本门禁自己的工具** + **没有效应**：那一笔既然被拒，就没有可被重复执行的写。
  //
  // A **refused** call leaves a claim with no effect behind, and "delete by effect" cannot reach it — the host wraps
  // the aspect's `AccessDeniedException` in a `RuntimeException` (measured by YD-28's cold reader; seven such rows
  // were measured for `record_crm_followup`). Scoped to **this gate's own tool** plus **no effect**: the call was
  // refused, so there is no write to duplicate.
  `delete from write_claims where tool_name = 'record_crm_followup' and effect_id is null`,
  `delete from write_claims where effect_id in (select id from side_effects where tool_name = 'record_crm_followup' and result_id in (select id::text from ${FOLLOWUP} where content like '%${marker}%'))`,
  `delete from side_effects where tool_name = 'record_crm_followup' and result_id in (select id::text from ${FOLLOWUP} where content like '%${marker}%')`,
  `delete from confirmation_requests where args_json like '%${marker}%'`,
  `delete from ${FOLLOWUP} where content like '%${marker}%'`,
  `delete from crm_permission where biz_type = 2 and biz_id in (select id from ${CUSTOMER} where name like '%${marker}%')`,
  `delete from ${CUSTOMER} where name like '%${marker}%'`,
].join('; '));
check('调用方那三个已种', '3', psql(`select count(*) from ${CUSTOMER} where name like '${marker}%' and owner_user_id = ${callerId}`));
check('管理员那一个已种', '1', psql(`select count(*) from ${CUSTOMER} where name like '${marker}%' and owner_user_id = 1`));

// ── 1) the read: who is worth following up ─────────────────────────────────────────────────────────
console.log('== 场景 1 · 助手按权限给出该跟进的队列（读）==');
{
  const turn = await chat(caller, '该跟进哪些客户', conv);
  conv = turn.conversationId || conv;
  note('本轮会话（运行时签发的那个）', conv);
  check('路由到队列工具', 'crm_follow_up_queue', (turn.toolCalls || [])[0]);
  check('它在**这一轮**真跑过（审计轨）', 1, ranIn(conv, 'crm_follow_up_queue'));
  check('它记在这一位调用方名下', callerId,
    psql(`select user_id from ai_audit_logs where tool = 'crm_follow_up_queue' and conversation_id = '${conv}' order by id desc limit 1`));
  // 读不占位：一次读不留待确认行。写才留。
  // A read holds nothing: one leaves no pending row. A write does.
  check('读没有留下待确认行', 0, Number(psql(`select count(*) from confirmation_requests where args_json like '%${marker}%'`)));
}

// ── 2) the write: held for a person ────────────────────────────────────────────────────────────────
console.log('== 场景 2 · 人选一条，助手去记跟进 —— 被扣下 ==');
let effectId = '';
{
  const held = pendingCount(callerId);
  const turn = await chat(caller, `记一条跟进：${marker}`, conv, { targetId: Number(overdueId) });
  check('路由到跟进工具', 'record_crm_followup', (turn.toolCalls || [])[0]);
  check('写被扣下', held + 1, pendingCount(callerId));
  check('扣下时客户行还没动', '0', psql(`select count(*) from ${FOLLOWUP} where content like '%${marker}%'`));
}

// ── 3) approved: it lands, and the ledger keeps a snapshot ─────────────────────────────────────────
console.log('== 场景 3 · 确认后执行，副作用登记 ==');
{
  const done = await confirm(caller, pendingToken(callerId), 'approve');
  check('批准后执行', 'executed', done.status);
  effectId = String(done.effectId || '');
  check('跟进记录挂在**本轮点名的那个客户**上', '1',
    psql(`select count(*) from ${FOLLOWUP} where biz_id = ${overdueId} and content like '%${marker}%'`));
  check('它属于跟进对象类型（biz_type=2 客户）', '2',
    psql(`select biz_type from ${FOLLOWUP} where content like '%${marker}%' order by id desc limit 1`));
  check('那次执行在审计轨上', 1, ranIn(conv, 'record_crm_followup'));
  check('扣下那次给了副作用号', true, effectId !== '');
  check('账本留下了它产出的那一行', '1',
    psql(`select count(*) from side_effects where id = ${effectId || 0} and after_snapshot is not null`));
}

// ── 4) out of scope: approval buys nothing ────────────────────────────────────────────────────────
console.log('== 场景 4 · 越权：记到别人的客户上，批准了也拒 ==');
{
  const held = pendingCount(callerId);
  await chat(caller, `记一条跟进：${marker}-hijack`, conv, { targetId: Number(adminRowId) });
  check('越权写也被扣下', held + 1, pendingCount(callerId));
  const done = await confirm(caller, pendingToken(callerId), 'approve');
  note('越权写批准后的结局', done.status || JSON.stringify(done).slice(0, 120));
  check('批准了也没执行', true, done.status !== 'executed');
  check('别人的客户上一条跟进都没落', '0', psql(`select count(*) from ${FOLLOWUP} where biz_id = ${adminRowId}`));
}

// ── 5) one conversation, one story ────────────────────────────────────────────────────────────────
console.log('== 场景 5 · 同一条会话看得见全过程 ==');
{
  const res = await fetch(`${HOST}/ai/conversations/${conv}/trace`, { headers: { 'tenant-id': TENANT, Authorization: `Bearer ${caller}` } });
  const body = await res.json();
  const trace = body.data || body;
  const types = (trace.steps || []).map((s) => s.type);
  check('轨迹上有工具调用', true, types.includes('tool_call'));
  check('有那次裁决', true, types.includes('confirmation'));
  check('有那笔副作用', true, types.includes('effect'));
  note('轨迹步数', types.length);
}

// ── 6) a withdrawal reaches the module ────────────────────────────────────────────────────────────
console.log('== 场景 6 · 撤销：够得着模块自己的那张表 ==');
{
  const before = Number(psql(`select count(*) from ai_audit_logs where action = 'effect_revoke' and tool = 'record_crm_followup'`));
  note('要撤的那笔副作用', `${effectId} 读数=${psql(`select revoke_status from side_effects where id = ${effectId || 0}`)}`);
  const res = await fetch(`${HOST}/ai/tool-effects/${effectId}`, { method: 'DELETE', headers: { 'tenant-id': TENANT, Authorization: `Bearer ${caller}` } });
  note('撤销的结局', `${res.status} ${(await res.text()).slice(0, 200)}`);
  note('撤之后那一行的读数', psql(`select revoke_status from side_effects where id = ${effectId || 0}`));
  check('账本行读作已撤销', 'revoked',
    psql(`select revoke_status from side_effects where id = ${effectId || 0}`));
  check('它建的那条记录被软删', '1',
    psql(`select count(*) from ${FOLLOWUP} where content like '%${marker}%' and deleted = 1`));
  check('审计恰好多一行撤销', before + 1,
    Number(psql(`select count(*) from ai_audit_logs where action = 'effect_revoke' and tool = 'record_crm_followup'`)));
}

// ── put the scene back ─────────────────────────────────────────────────────────────────────────────
console.log('== 收尾 · 把本轮造的行收回去 ==');
try {
  runPutBack();
  ok('本轮那几行已收回（审计行刻意留着）');
} catch (e) {
  bad('收尾', '本轮那几行已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
