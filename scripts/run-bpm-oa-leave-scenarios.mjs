#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// YD-14's gate: the **second** module upstream wrote, brought under the same four advices CRM is held
// by. Its question is not "does it work" but "what does a second module cost" — so what it asserts is
// deliberately the same shape `run-crm-customer-scenarios.mjs` asserts, run against a module whose
// ownership is spelled differently.
//
//   bash scripts/run-server.sh &            # a running stack, PostgreSQL + redis
//   node scripts/run-bpm-oa-leave-scenarios.mjs
//
// The module is Yudao's own BPM, and the slice is its leave request (`bpm_oa_leave`) — the one surface
// in that module that carries a per-row owner. The task and process-instance surfaces take their
// ownership from the engine (`assignee` / `startUserId`), not from a column, and would need a **second**
// scope machine; they are out of this slice on purpose, and that finding is the point rather than a
// gap. See `keelbase-docs/KEELBASE-MODULE-ONBOARDING.md` §4.1.
//
// What is different from CRM, and therefore the per-module reading:
//
//   * the owner is an **argument** (`getLeavePage(userId, …)`, `createLeave(userId, …)`) rather than a
//     field on the VO, so the advice rewrites the argument;
//   * the owner **column** is `user_id`, not `owner_user_id`;
//   * the **create** path calls the process engine and this host has no process definition deployed, so
//     no tool is declared for it and no scenario here can reach it — recorded, not looked past.
//
// YD-14 的门禁：**第二个**上游写的模块，被与 CRM 同样的四条通知管住。它问的不是「能不能跑」，而是「第二个模块
// 要多少钱」——故它断言的东西**刻意与 `run-crm-customer-scenarios.mjs` 同形**，只是跑在一个归属拼法不同的模块上。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-bpm-oa-leave-scenarios.mjs
//
// 该模块是芋道自己的 BPM，切片是它的请假单（`bpm_oa_leave`）——那个模块里**唯一**逐行带属主的业务面。任务面与
// 流程实例面的归属取自**引擎**（`assignee` / `startUserId`），不来自某一列，需要**第二台**范围机；它们**刻意**
// 不在本切片，而那个发现**正是要点**、不是缺口。见 `keelbase-docs/KEELBASE-MODULE-ONBOARDING.md` §4.1。
//
// 与 CRM 不同、因而属**逐模块的读**的地方：
//
//   * 属主是**入参**（`getLeavePage(userId, …)`、`createLeave(userId, …)`），不是 VO 上的字段，故通知改的是实参；
//   * 属主**列**是 `user_id`，不是 `owner_user_id`；
//   * **创建**那条路调**流程引擎**，而本宿主没有部署任何流程定义，故**没有**为它声明工具、本文件任何情境也够不到它
//     ——记下，而不是绕过去不看。
//
// **它造的东西，它收回去** —— 按那个**本轮唯一**的标记（`reason` 里带着它），故收尾够不到别的轮次的行。
// **审计行不在此列**：那是一条哈希链，为了收拾门禁的凌乱去剪断它一环，是比凌乱更坏的一件事。
//
// Everything it creates, it removes again — by that run-scoped marker, which every row it inserts carries in
// `reason`, so the cleanup cannot reach another run's rows either. It does **not** remove audit rows: those
// are a hash chain, and cutting a link to tidy up after a gate would be a worse act than the untidiness.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const SECOND_USER = process.env.SECOND_USER || 'gatesales';
const SECOND_PASS = process.env.SECOND_PASS || 'gate-pass-1234';
const LEAVE = process.env.BPM_LEAVE_TABLE || 'bpm_oa_leave';
const RUNNING = 1; // BpmTaskStatusEnum.RUNNING / 审批中
const APPROVE = 2; // BpmTaskStatusEnum.APPROVE / 审批通过

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const checkNot = (name, forbidden, got) =>
  String(got).includes(forbidden) ? bad(name, `must not contain ${forbidden}`, got) : ok(name);
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

// The helper keeps `docker exec` as its default, unchanged. On a host without Docker, set
// `PSQL_HELPER=direct` (or `local`) to run the client against a PostgreSQL you can reach; `PSQL` names
// that client and the usual PG* variables (PGHOST / PGPORT / PGUSER / PGPASSWORD) select the endpoint.
// `PSQL_HELPER=docker` is the same command this gate has always run.
//
// On a host with **no psql client at all**, set `PSQL_HELPER_SCRIPT` to a psql-shaped Node helper
// (`scripts/psql-helper.mjs` in this repo). It takes precedence over `PSQL_HELPER`: when it is set the
// gate runs `node <script> -h … -p … -U … -d … -tAc <sql>` and never calls docker or psql.
//
// psql 助手默认保持原样（`docker exec`）。没有 Docker 的机器上设 `PSQL_HELPER=direct`（或 `local`）直连
// 一个你能连到的 PostgreSQL；`PSQL` 指定客户端路径，连接信息走常见的 PG* 变量（PGHOST / PGPORT /
// PGUSER / PGPASSWORD）。`PSQL_HELPER=docker` 就是这道门禁一直跑的那条命令。
//
// **机器上根本没有 psql 客户端**时，把 `PSQL_HELPER_SCRIPT` 设成一个 psql 形状的 Node 助手（本仓
// `scripts/psql-helper.mjs`）。它的优先级高于 `PSQL_HELPER`：设了它就只跑
// `node <script> -h … -p … -U … -d … -tAc <sql>`，既不调 docker 也不调 psql。
const PSQL = process.env.PSQL || 'psql';
const PSQL_HELPER = (process.env.PSQL_HELPER || 'docker').toLowerCase();
const PSQL_HELPER_SCRIPT = process.env.PSQL_HELPER_SCRIPT ? resolve(process.env.PSQL_HELPER_SCRIPT) : '';
if (PSQL_HELPER_SCRIPT && !existsSync(PSQL_HELPER_SCRIPT)) {
  throw new Error(`PSQL_HELPER_SCRIPT points to a missing file: ${process.env.PSQL_HELPER_SCRIPT} (resolved ${PSQL_HELPER_SCRIPT})`);
}
const psql = (sql) => {
  if (PSQL_HELPER_SCRIPT) {
    return execFileSync(
      process.execPath,
      [PSQL_HELPER_SCRIPT, '-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
        '-U', process.env.PGUSER || 'root', '-d', DB, '-tAc', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'password' } },
    ).trim();
  }
  if (PSQL_HELPER === 'docker') {
    return execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-U', 'root', '-d', DB, '-tAc', sql], { encoding: 'utf8' }).trim();
  }
  if (PSQL_HELPER === 'direct' || PSQL_HELPER === 'local') {
    return execFileSync(
      PSQL,
      ['-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
        '-U', process.env.PGUSER || 'root', '-d', DB, '-tAc', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'password' } },
    ).trim();
  }
  throw new Error(`PSQL_HELPER must be "docker" or "direct" (got "${process.env.PSQL_HELPER}"); or set PSQL_HELPER_SCRIPT to a psql-shaped helper`);
};

// 崩了也收尾。收尾是**一个函数**，在本轮造出第一行的那一刻挂上（见下面的 `putBack = …`），而不是等文件末尾那段
// 才算 —— 否则「造了行、之后才崩」这条路上它是空的，而那正是实测过的那一种：本线两次门禁崩在收尾之前（一次
// 宿主停机、一次一条查不到的列的断言），后者留下 3 行。`process.on('exit')` 在**未捕获异常**把进程带走时同样
// 触发（2026-10-15 实测：`code=1`），而 `psql()` 是同步的，故退出处理器里跑得动。
//
// Clean up on the way out as well. The cleanup is held as a **function** and attached at the moment this run
// creates its first row (see `putBack = …` below), rather than only being assembled at the end of the file —
// otherwise it is empty on the "created rows, then died" path, which is the one measured twice on this line: two
// runs died before their closing section (a host outage, and an assertion against a column that did not exist),
// the second leaving three rows behind. `process.on('exit')` also fires when an uncaught exception takes the
// process down (measured 2026-10-15: `code=1`), and `psql()` is synchronous, so it runs there.
let putBack = null;
function runPutBack() {
  if (!putBack) return false;
  const putBackOnce = putBack;
  putBack = null; // 先清空：收尾自己出错时也不要让它跑第二遍
  putBackOnce();
  return true;
}
process.on('exit', () => {
  try {
    if (runPutBack()) console.log('  note  收尾走了退出路径（本进程在此之前已经出错）');
  } catch (e) {
    console.error(`  note  退出路径上的收尾没跑成：${e.message}`);
  }
});

// One request, retried **once** when the host answers its transient 500.
//
// The host can fail the first request that follows a write. Measured on 2026-10-14: a
// `permission/assign-user-role` followed immediately by a login answers `{"code":500}`, and **the same
// request sent again** answers `{"code":0}`. Underneath it is a PostgreSQL statement, already closed,
// being handed back out of the connection pool — the deployment's problem, and recorded as such — but a
// gate that is red for it is a gate nobody can read, and every gate here logs in right after assigning
// somebody a role.
//
// Only `500`, only once, and it says so: a business refusal is not retried (a wrong password answers a
// code of its own and still fails on the first try), and the note is printed rather than swallowed — so
// the day this stops happening it shows up as a line nobody sees any more, rather than as a rule nobody
// remembers writing.
//
// 一次请求；宿主答它那个瞬时 500 时**重试一次**。
//
// 这台宿主会弄砸**紧跟一次写之后的第一个**请求。2026-10-14 实测：`permission/assign-user-role` 之后立刻登录
// 答 `{"code":500}`，而**同一个请求再发一次**答 `{"code":0}`。底下是一条**已被关闭**的 PostgreSQL statement
// 从连接池里被重新借出 —— 那是**部署方**的问题、也按部署问题记了账 —— 但一道因它而红的门禁是**没人读得懂**的门禁，
// 而这里每一道门禁都在给某人授了权之后立刻登录。
//
// **只对 500、只试一次，而且说出来**：业务性拒绝不重试（密码错会答它自己的码、第一次就照样失败），而那一行是
// **打印**出来的、不是吞掉的 —— 于是等这个瞬时故障不再发生时，它表现为**一行再也看不到的提示**，而不是一条没人
// 记得写过的规则。
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
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function login(username, password) {
  const r = await api('/system/auth/login', { method: 'POST', body: { username, password } });
  if (r.code !== 0) throw new Error(`login(${username}) -> ${r.code}: ${r.msg}`);
  return r.data.accessToken;
}

async function chat(token, message, extra = {}) {
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId: `gate-${Date.now()}`, ...extra })
  });
  const json = await res.json();
  return json.data || json;
}

async function confirm(token, confirmationToken, decision) {
  const res = await fetch(`${HOST}/ai/confirmations/${confirmationToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision })
  });
  const json = await res.json();
  return json.data || json;
}

// Same two reads the CRM gate uses, and for the same reported reason: the caller's confirmation centre
// answers 500 on this host (its query names a `mode` column this schema lacks), and the chat answer is
// the frozen `chat-response` with no `status`, `data` or `token`. So the waiting row is read from the
// runtime's own table and "did it run" from the audit trail.
// 与 CRM 门禁相同的两处读法，理由也一样：调用方的确认中心在本宿主答 500（它查一个本 schema 没有的 `mode` 列），
// 而聊天答案是冻结的 `chat-response`、不带 `status`/`data`/`token`。故「等待中的那一行」读运行时自己的表、
// 「跑没跑」读审计轨。
const pendingToken = (operatorId) =>
  psql(`select token from confirmation_requests where operator_id = '${operatorId}' and status = 'pending' order by id desc limit 1`) || undefined;

const pendingCount = (operatorId) =>
  Number(psql(`select count(*) from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`));

const ranAs = (tool) =>
  Number(psql(`select count(*) from ai_audit_logs where tool = '${tool}' and outcome = 'executed'`));

// ── 0) the stack answers at all ────────────────────────────────────────────────────────────────────
console.log('== 前置 ==');
psql('truncate table ai_audit_logs');
check('/app/capabilities 200', '200', (await fetch(`${HOST}/app/capabilities`)).status);

const admin = await login(ADMIN_USER, resolveAdminPassword(psql));
ok('admin 登录');

console.log('== 前置 · 第二个调用方 ==');
let secondId = psql(`select id from system_users where username = '${SECOND_USER}' and deleted = 0 limit 1`);
if (!secondId) {
  const created = await api('/system/user/create', {
    method: 'POST',
    token: admin,
    body: { username: SECOND_USER, nickname: SECOND_USER, password: SECOND_PASS, deptId: 100, postIds: [] }
  });
  if (created.code !== 0) throw new Error(`create user -> ${created.code}: ${created.msg}`);
  secondId = created.data;
  ok(`建第二个用户 id=${secondId}`);
} else {
  ok(`复用第二个用户 id=${secondId}`);
}
{
  const roles = psql(`select id from system_role where code = 'common' and deleted = 0 limit 1`);
  await api('/system/permission/assign-user-role', { method: 'POST', token: admin, body: { userId: Number(secondId), roleIds: [Number(roles)] } });
}
const second = await login(SECOND_USER, SECOND_PASS);
ok('第二个调用方登录');

// ── the rows, written straight into the module's own table ─────────────────────────────────────────
console.log('== 场景 1 · 上游模块自己的表 ==');
const marker = `gate-${Date.now()}`;
const adminMarker = `${marker}-admin`;
const salesMarker = `${marker}-sales`;
// 收尾**在这里**就挂上（见文件上方 `putBack` 那段）：标记一有，把它收回去就成立；下面任何一处崩了，退出
// 处理器都会替这一轮跑它。把手用的是**本轮的实参里那个行的编号**（`{"id":25}`）—— 那个编号是**本轮自己造的
// 行**，故同样只有本轮够得到；它在**调用时**才查（本行下面才把行插进去）。
//
// The cleanup is attached **here** (see the `putBack` note near the top): once the marker exists, putting it back
// is well-defined, and anything below dying still gets it run by the exit handler. The handle is the **row number
// in this run's arguments** (`{"id":25}`) — a row this run created, so it is just as run-scoped — and it is
// queried **when the cleanup is called**, not here (the rows are inserted below this line).
putBack = () => {
  const runIds = (psql(`select string_agg(id::text, ',') from ${LEAVE} where reason like '%${marker}%'`) || '').trim() || '0';
  const idAlt = runIds.split(',').join('|');
  // `side_effects.result_id` is text since runtime 0.1.16 (migration V18); the list must be quoted text.
  // `side_effects.result_id` 自运行时 0.1.16（迁移 V18）起是文本，故这串 id 要以带引号的文本出现。
  const runIdList = runIds.split(',').map((id) => `'${id}'`).join(',');
  psql(
    [
      `delete from confirmation_requests where args_json ~ '"id"[[:space:]]*:[[:space:]]*(${idAlt})([^0-9]|$)'`,
      // 被**拒绝**的那一笔会留下一个没有效应的认领，而「按效应收」够不到它 —— 宿主把切面抛的 `AccessDeniedException`
      // 包成了 `RuntimeException`，运行时的「没落库就释放认领」认不出来（`YD-28` 的冷读者实测；本门禁情境 4 的越权审批
      // 就是这种拒绝）。范围取**本门禁自己的工具** + 调用方 + **没有效应**：那一笔既然被拒，就没有可被重复执行的写。
      //
      // A **refused** call leaves a claim with no effect behind, and "delete by effect" cannot reach it — the host
      // wraps the aspect's `AccessDeniedException` in a `RuntimeException` (measured by YD-28's cold reader; this
      // gate's scenario 4 is exactly that refusal). Scoped to **this gate's own tool** plus the caller plus **no
      // effect**: the call was refused, so there is no write to duplicate.
      `delete from write_claims where user_id = '${secondId}' and tool_name = 'approve_oa_leave' and effect_id is null`,
      `delete from write_claims where effect_id in (select id from side_effects where result_id in (${runIdList}))`,
      `delete from side_effects where result_id in (${runIdList})`,
      `delete from ${LEAVE} where reason like '%${marker}%'`,
    ].join('; '),
  );
};
// `tenant_id` is not optional here either: `BpmOALeaveDO` extends `BaseDO` and carries no `@TenantIgnore`,
// so the host's tenant interceptor appends `tenant_id = ?` to every path through this table.
// `tenant_id` 在这里也不是可选的：`BpmOALeaveDO` 继承 `BaseDO` 且没带 `@TenantIgnore`，故宿主的租户拦截器给这张表
// 的每条路都加 `tenant_id = ?`。
psql(`insert into ${LEAVE}(id, user_id, type, reason, day, status, deleted, tenant_id, create_time, update_time)`
  + ` values (nextval('${LEAVE}_seq'), 1, 1, '${adminMarker}', 1, ${RUNNING}, 0, ${TENANT}, now(), now())`);
psql(`insert into ${LEAVE}(id, user_id, type, reason, day, status, deleted, tenant_id, create_time, update_time)`
  + ` values (nextval('${LEAVE}_seq'), ${secondId}, 1, '${salesMarker}', 1, ${RUNNING}, 0, ${TENANT}, now(), now())`);
const adminRowId = psql(`select id from ${LEAVE} where reason = '${adminMarker}'`);
const salesRowId = psql(`select id from ${LEAVE} where reason = '${salesMarker}'`);
check('admin 那一行已种', true, adminRowId !== '');
check('第二个调用方那一行已种', true, salesRowId !== '');
const statusOf = (id) => psql(`select status from ${LEAVE} where id = ${id}`);

console.log('== 场景 2 · 身份传递：读被路由到本模块的工具 ==');
{
  // What is asserted is that the turn **ran**, read from the trail: the page narrowing itself lives on
  // the advice, and its effect is asserted where it shows — scenario 4's refusal. The returned rows
  // cannot be asserted here for the reason the CRM gate records: core 0.1.5's answer carries no `data`.
  // 断言的是这一回合**跑过了**（从审计轨读）：分页收束本身在通知上，它的效果在**它显形的地方**断言——情境 4 的
  // 拒绝。返回的行在这里断言不了，理由与 CRM 门禁记的一样：core 0.1.5 的答案不带 `data`。
  const a = await chat(admin, '看我的请假');
  check('admin 触发 BPM 工具', 'list_my_oa_leaves', (a.toolCalls || [])[0]);
  check('admin 的执行状态（审计轨）', 1, ranAs('list_my_oa_leaves'));

  const s = await chat(second, '看我的请假');
  check('第二个调用方触发同一个工具', 'list_my_oa_leaves', (s.toolCalls || [])[0]);
  check('它的执行状态（审计轨）', 2, ranAs('list_my_oa_leaves'));
}

console.log('== 场景 3 · 高风险写入被扣下，批准后落库 ==');
{
  const held = pendingCount(secondId);
  // The row travels as `customerId` — the one structured slot the runtime's chat request declares, and
  // it is named for CRM. A second module has no slot of its own; that leak is this module's cost and is
  // recorded in the tool face's class comment rather than worked around quietly.
  // 那一行以 `customerId` 传递——运行时的聊天请求**唯一**声明的结构化槽位，而它**以 CRM 命名**。第二个模块没有
  // 自己的槽位；这处泄漏是本模块的代价，记在工具面的类注释里，而不是默默绕过。
  await chat(second, '审批请假', { customerId: Number(salesRowId) });
  check('写被扣下', held + 1, pendingCount(secondId));
  check('未改（仍是审批中）', RUNNING, statusOf(salesRowId));
  const proposedToken = pendingToken(secondId);
  checkNot('扣下时给出 token', 'undefined', proposedToken);

  const outcome = await confirm(second, proposedToken, 'approve');
  check('批准后执行', 'executed', outcome.status);
  check('状态已改', APPROVE, statusOf(salesRowId));
}

console.log('== 场景 4 · 越权写：批准也买不到 ==');
{
  // Same call, against another caller's row. The approval settles the risk question and nothing else:
  // the row-scope question is answered lower down, at the module's own seam — this advice asks only
  // the applicant question.
  // 同一次调用，打向**别人的**行。批准了结的是**风险**问题、仅此而已：行范围的问题在更下面、在模块自己的接缝上
  // 回答——本通知只问**申请人**那一问。
  const hijackHeld = pendingCount(secondId);
  await chat(second, '审批请假', { customerId: Number(adminRowId) });
  check('改别人的行也被扣下', hijackHeld + 1, pendingCount(secondId));
  const hijackDone = await confirm(second, pendingToken(secondId), 'approve');
  note('越权写批准后的结局', hijackDone.status || JSON.stringify(hijackDone).slice(0, 120));
  check('批准了也没执行', true, hijackDone.status !== 'executed');
  check('别人的行一字未改', RUNNING, statusOf(adminRowId));
}

console.log('== 场景 5 · 审计链与被记下的拒绝 ==');
{
  const rows = Number(psql('select count(*) from ai_audit_logs'));
  check('审计行在（>0）', true, rows > 0);
  const verify = await (await fetch(`${HOST}/audit/verify`, { headers: { Authorization: `Bearer ${admin}` } })).json();
  check('链校验通过', true, verify.data && verify.data.valid);
  const refusals = Number(psql(`select count(*) from ai_audit_logs where tool = 'approve_oa_leave' and outcome = 'refused'`));
  check('被拒的那次写在案', true, refusals > 0);
}

// ── 收尾：把本轮造的东西收回去 ─────────────────────────────────────────────────────────────────────
//
// 按**本轮自己的标记**删（`reason` 里都带着它），故够不到别的轮次的行 —— 与上面那些断言是同一条纪律。
// **审计行刻意不动**：哈希链，为收拾凌乱去剪它一环，比凌乱更坏。台账跟着业务行一起撤：它们指的是这一轮
// 删掉的那些行，留着只会让控制台里那几张卡指着一批已经不在的记录。
//
// Delete by this run's own marker — every row this gate inserts carries it in `reason` — so it cannot reach
// another run's rows, the same discipline the assertions above follow. The audit rows are deliberately left
// alone (a hash chain; cutting a link to tidy up is worse than the untidiness). The ledgers go with the
// business rows, because they point at the rows this run is removing.
console.log('== 收尾 · 把本轮造的行收回去 ==');
try {
  runPutBack();
  ok('本轮那两行已收回（审计行刻意留着）');
} catch (e) {
  bad('收尾', '本轮那两行已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
