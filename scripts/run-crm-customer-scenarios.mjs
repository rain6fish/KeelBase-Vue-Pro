#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// YD-2's gate: governance over a module **upstream wrote**, not one the adapter generated.
//
//   bash scripts/run-server.sh &            # a running stack, PostgreSQL + redis
//   node scripts/run-crm-customer-scenarios.mjs
//
// The module is Yudao's own CRM — 283 Java files that we did not write, did not regenerate, and did
// not edit. What is asserted here is what `D28 ④` calls the first acceptance gate: an existing
// business module, reachable by AI under an explicit identity, with out-of-scope access refused,
// a high-risk write held for a human, and the side effect auditable — all of it through tests.
//
// Every assertion is scoped by a **name unique to this run** — never by a count of the whole table —
// so the gate holds both on a database it has already been run against **and alongside another run of
// itself**. The one place that used to count whole rows was measured the hard way: with two runs side
// by side it failed `落库 — expected [11], got [12]`, and the failure pointed at this gate rather than
// at the other writer.
//
// Everything it creates, it removes again — by that same run-scoped marker, so the cleanup cannot reach
// another run's rows either. It does **not** remove audit rows: those are a hash chain, and cutting a
// link to tidy up after a gate would be a worse act than the untidiness.
//
// YD-2 的门禁：治理一个**上游写的**模块，而不是适配器生成的那个。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-crm-customer-scenarios.mjs
//
// 该模块是芋道自己的 CRM——我们没写、没重新生成、也没改过的 283 个 Java 文件。这里断言的是 `D28 ④` 所称的
// **第一道验收门**：一个既有业务模块，能被 AI 以**明确身份**访问、越权被拒、高风险写入被扣下等人、副作用可审计
// ——且这一切都由测试证明。
//
// 每条断言都用**本次唯一的名字**收束——**不**按整张表计数——故本门禁**在一个已经跑过的库上**、**以及跟它自己的
// 另一次运行并排**时都成立。曾经按整表计数的那一处是**实测出来**的：两次并排跑时它报
// `落库 — expected [11], got [12]`，而那个失败看上去指着本门禁、不指着另一个写手。
//
// **它造的东西，它收回去** —— 用的还是那个**本轮唯一**的标记，故收尾同样够不到别的轮次的行。**审计行不在此列**：
// 那是一条哈希链，为了收拾门禁的凌乱去剪断它一环，是比凌乱更坏的一件事。
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
const CUSTOMER = process.env.CRM_TABLE || 'crm_customer';

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
  // The token is inside the envelope's `data`, not on the envelope. / token 在信封的 `data` 里、不在信封上。
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

// 同一个写在 REST 那一侧的回答。**要的是信封里的 `code`，不是 HTTP 状态码**：本宿主把业务性拒绝
// 也包在 HTTP 200 里（`{"code":403,...}`），故拿状态码断言会把 403 读成 200。本门禁权限那半的要点正是
// REST 继续答 `403`，而工具路径现在也拒。
//
// The REST side of the same write. **It is the envelope's `code`, not the HTTP status**: this host wraps
// business refusals in HTTP 200 (`{"code":403,...}`), so asserting on the status would read 403 as 200.
// The point of this gate's permission half is that REST keeps answering `403` while the tool path now
// refuses too.
async function restCode(path, token, body) {
  const res = await fetch(`${HOST}/admin-api${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => null);
  return typeof json?.code === 'number' ? json.code : res.status;
}

// What is waiting on this caller.
//
// **Read from the runtime's own table, and the reason is reported rather than worked around quietly**:
// `/ai/my/confirmations` — the caller's confirmation centre, and the surface the console shows them —
// **answers 500 on this host**. Its query names a `mode` column that this deployment's schema does not
// have (see the table's columns), which is a finding about this host, not about the gate. The chat
// answer cannot be the source either: as of core 0.1.5 it is the frozen `chat-response` and carries no
// `status`, no `data` and no `token`.
//
// 正在等**这位调用方**的是什么。
//
// **从运行时自己的表读，而理由报出来、不默默绕过**：`/ai/my/confirmations` —— 调用方的确认中心、也是控制台
// 给他们看的那条面 —— **在本宿主上答 500**。它的查询点名了一个本部署 schema **没有的 `mode` 列**（见该表的列）；
// 那是**关于本宿主**的发现，不是关于这道门禁的。聊天答案也不能当来源：core 0.1.5 起它就是冻结的
// `chat-response`，不带 `status`/`data`/`token`。
//
// ⚠ **For the host line, not for this gate**: the 500 belongs on that line's list — the console's
// "waiting on me" page cannot load here until the schema catches up with the runtime.
// ⚠ **这是宿主线的事、不是本门禁的事**：那个 500 该记在那条线的清单上 —— 在 schema 追上运行时之前，
// 控制台的「待我确认」页在本部署上打不开。
const pendingToken = (operatorId) =>
  psql(`select token from confirmation_requests where operator_id = '${operatorId}' and status = 'pending' order by id desc limit 1`) || undefined;

// 按**本轮标记**收束，故别的腿留下的待确认不会被认成这一腿提的那一条。标记在提议自己的入参里。
//
// Scoped to **this run's marker**, so a pending row another leg left behind cannot be mistaken for
// the one this leg proposed. The marker is in the proposal's own arguments.
const pendingTokenFor = (operatorId, marker) =>
  psql(`select token from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`
    + ` and args_json like '%${marker}%' order by id desc limit 1`) || undefined;

/**
 * 一名**持有 REST 那两个权限码**的调用方：新角色 + 新用户，菜单授予直接按 `crm:customer:create` /
 * `crm:customer:update` 查出来。它**不是**管理员，故行范围仍然管得住（越权那半要的正是这个）。
 *
 * 与 `gatesales` 同样的手法：同名就复用。**不给 `common` 加写权**——那会同时放宽 REST，而本门禁要证的
 * 恰恰是「REST 拒的，工具也拒」。
 *
 * A caller **holding the two REST permission codes**: a new role and user, with the menu grants looked
 * up from `crm:customer:create` / `crm:customer:update`. It is **not** an administrator, so row scope
 * still binds it (which is what the cross-row half needs).
 *
 * Same approach as `gatesales`: reuse by name. **`common` is not given the write codes** — that would
 * widen REST too, and this gate exists to show "what REST refuses, the tool refuses".
 */
async function ensureCrmWriter(adminToken) {
  const menuIds = psql("select string_agg(id::text, ',') from system_menu"
    + " where permission in ('crm:customer:create', 'crm:customer:update') and deleted = 0");
  let roleId = psql("select id from system_role where code = 'gate_crm_writer' and deleted = 0 limit 1");
  if (!roleId) {
    const role = await api('/system/role/create', {
      method: 'POST', token: adminToken,
      body: { name: 'gate-crm-writer', code: 'gate_crm_writer', sort: 99, status: 0, remark: 'M7 gate: the REST permission codes, granted' }
    });
    if (role.code !== 0) throw new Error(`create writer role -> ${role.code}: ${role.msg}`);
    roleId = role.data;
  }
  await api('/system/permission/assign-role-menu', {
    method: 'POST', token: adminToken,
    body: { roleId: Number(roleId), menuIds: menuIds.split(',').map(Number) }
  });
  // 新角色的数据范围默认是 `ALL`（1），而 `ALL` 会让行范围那半整条放过——越权那半要的是「有权限、
  // 但没有这一行」。设成 `SELF`（5），与普通调用方一样被约束到自己的行。
  //
  // A new role's data scope defaults to `ALL` (1), and `ALL` makes the row-scope half stand down — the
  // cross-row half needs "has the permission, does not own the row". Set `SELF` (5), held to its own
  // rows like the ordinary caller.
  await api('/system/permission/assign-role-data-scope', {
    method: 'POST', token: adminToken,
    body: { roleId: Number(roleId), dataScope: 5, dataScopeDeptIds: [] }
  });
  const existing = psql("select id from system_users where username = 'gatecrmwriter' and deleted = 0 limit 1");
  let id = existing ? Number(existing) : null;
  if (!id) {
    const created = await api('/system/user/create', {
      method: 'POST', token: adminToken,
      body: { username: 'gatecrmwriter', nickname: 'gatecrmwriter', password: 'gate-pass-1234', deptId: 100, postIds: [] }
    });
    if (created.code !== 0) throw new Error(`create writer user -> ${created.code}: ${created.msg}`);
    id = created.data;
  }
  await api('/system/permission/assign-user-role', {
    method: 'POST', token: adminToken, body: { userId: Number(id), roleIds: [Number(roleId)] }
  });
  return { id, username: 'gatecrmwriter', password: 'gate-pass-1234' };
}

/**
 * A caller holding **only** the read code, and a scope of SELF so that the narrowing stands up.
 *
 * Scenario 2 asserts the **page's content**, and the runtime puts no tool result on the wire: the
 * frozen `chat-response` has no `data`, and the streaming `tool_end` carries only success. So "is that
 * row on the page" can only be read from the **module's own page endpoint** — it and the tool cross the
 * **same** service method `CrmCustomerService.getCustomerPage`, which is where the narrowing advice
 * sits. `common` does not hold `crm:customer:query`, and should not be widened for a gate, so this run
 * gives the second caller a role carrying **that one code**. The data scope must be `SELF` (5) — a new
 * role defaults to `ALL` (1), and `callerToEnforce()` answers null for a caller whose scope is every
 * row, which stands the narrowing down; what scenario 2 needs is exactly that it stands up.
 *
 * 一名**只**持读权限码的调用方，数据范围 `SELF`，好让收窄站得住。
 *
 * 场景 2 断的是**页的内容**，而运行时不上线工具的结果：冻结的 `chat-response` 没有 `data`，流式的 `tool_end`
 * 也只有成功与否。故「页里有没有那一行」只能从**模块自己的分页端点**读——它与工具走的是**同一个**服务方法
 * `CrmCustomerService.getCustomerPage`，而收窄那条通知正切在它上面。`common` 没有 `crm:customer:query`，也不该
 * 为一道门禁去放宽它，故本轮给第二个调用方一条**只带这一个码**的角色。数据范围必须是 `SELF`（5）——新角色默认
 * `ALL`（1），而 `callerToEnforce()` 对「范围 = 全部行」的调用方返回 null，收窄就整条不发；场景 2 要的恰恰是它发。
 */
async function ensureCrmReader(adminToken) {
  const menuIds = psql("select string_agg(id::text, ',') from system_menu"
    + " where permission = 'crm:customer:query' and deleted = 0");
  if (!menuIds) {
    throw new Error('crm:customer:query 不在 system_menu 里 —— 这套库的菜单种子缺这一条，场景 2 的页就读不到');
  }
  let roleId = psql("select id from system_role where code = 'gate_crm_reader' and deleted = 0 limit 1");
  if (!roleId) {
    const role = await api('/system/role/create', {
      method: 'POST', token: adminToken,
      body: { name: 'gate-crm-reader', code: 'gate_crm_reader', sort: 99, status: 0,
        remark: 'CRM gate: the page permission only, so the read narrowing is asserted by content' }
    });
    if (role.code !== 0) throw new Error(`create reader role -> ${role.code}: ${role.msg}`);
    roleId = role.data;
  }
  await api('/system/permission/assign-role-menu', {
    method: 'POST', token: adminToken,
    body: { roleId: Number(roleId), menuIds: menuIds.split(',').map(Number) }
  });
  await api('/system/permission/assign-role-data-scope', {
    method: 'POST', token: adminToken,
    body: { roleId: Number(roleId), dataScope: 5, dataScopeDeptIds: [] }
  });
  // 与 `gatesales` 一样**按名复用、不收尾**：这条角色是夹具的一部分，不是本轮的业务行。
  // Reused by name and **not** removed on the way out, like `gatesales`: the role is part of the
  // fixture, not this run's business rows.
  return Number(roleId);
}

const pendingCount = (operatorId) =>
  Number(psql(`select count(*) from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`));

// Whether a turn actually ran, read from the trail rather than from the answer — same reason: the
// answer reports no outcome any more, and an audit row is where the runtime says a call happened.
//
// 一个回合**有没有真跑**，从**审计轨**读、不从答案读 —— 同一个理由：答案不再报结果，而**审计行**才是运行时
// 说「这次调用发生过」的地方。
const ranAs = (tool) =>
  Number(psql(`select count(*) from ai_audit_logs where tool = '${tool}' and outcome = 'executed'`));

// 「谁」：宿主为这一次写记下的那行操作日志，它的 `user_id` 必须是调用方。
//
// 这一腿的调用方**只能**来自运行时发布的那一个 —— 引擎的工具路径跑在请求的安全过滤器链**之外**，
// `SecurityFrameworkUtils` 在那里答不出人（宿主那条接缝 `OperateLogOperatorSource` 正是为此存在）。
// 这里为空，就是审计的「谁」那一列空着的原因，而审计最需要「谁」的恰恰是 AI 写下的那些行。
//
// 读法是**有窗口的**：这一行由宿主**异步**写下（`createOperateLogAsync`），故给它一小段窗口；窗口内该出现，
// 始终没出现就是**失败**，而不是「读得慢」——窗口只是不让异步把一条真断言读成假红。
//
// Who: the row the host logged for this write must carry the caller in `user_id`. The caller on this leg
// can only come from what the runtime publishes — the engine's tool path runs outside the request's
// security filter chain, where `SecurityFrameworkUtils` answers nobody (that seam exists for exactly
// this). An empty id here is why an auditor's "who" was blank, and those are the rows that need it most.
async function hostLoggedWho(actionLike) {
  for (let i = 0; i < 12; i += 1) {
    const who = psql(`select coalesce(user_id::text, '<null>') from system_operate_log`
      + ` where type = 'CRM 客户' and action like '%${actionLike}%' order by id desc limit 1`);
    if (who) return who;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return '';
}

// ── 0) the stack answers at all ────────────────────────────────────────────────────────────────────
console.log('== 前置 ==');
// The audit chain is signed with `keelbase.audit.hmac-key`, so rows written under a different key can
// never verify. This gate clears the table first and says so, rather than reporting a failure it caused.
// 审计链用 `keelbase.audit.hmac-key` 签名，故换过 key 的行永远验不过。本门禁先清表并说出来。
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
  // 读的那个码单独一条角色（见 `ensureCrmReader`）：`common` 不该为一道门禁放宽，而场景 2 的页要它。
  // The read code rides on a role of its own (see `ensureCrmReader`): `common` should not be widened for
  // a gate, and scenario 2's page needs it.
  const readerRoleId = await ensureCrmReader(admin);
  await api('/system/permission/assign-user-role', {
    method: 'POST', token: admin, body: { userId: Number(secondId), roleIds: [Number(roles), readerRoleId] }
  });
}
const second = await login(SECOND_USER, SECOND_PASS);
ok('第二个调用方登录');

// 持有 REST 权限码的调用方——权限那半的正向对照。
// A caller with the REST codes — the positive control for the permission half.
let writer; let writerToken;
try {
  writer = await ensureCrmWriter(admin);
  writerToken = await login(writer.username, writer.password);
  ok(`有码调用方就绪（id=${writer.id}）`);
} catch (e) {
  bad('有码调用方就绪', 'ok', e.message);
  throw e;
}

// ── the rows, written straight into the module's own table ─────────────────────────────────────────
console.log('== 场景 1 · 上游模块自己的表 ==');
const marker = `gate-${Date.now()}`;
const adminMarker = `${marker}-admin`;
const salesMarker = `${marker}-sales`;
// 收尾**在这里**就挂上（见文件上方 `putBack` 那段）：标记一有，把它收回去就成立；下面任何一处崩了，退出
// 处理器都会替这一轮跑它。
// The cleanup is attached **here** (see the `putBack` note near the top of the file): once the marker exists,
// putting it back is well-defined, and if anything below dies the exit handler runs it for this run.
putBack = () =>
  psql(
    [
      // 被**拒绝**的那一笔会留下一个没有效应的认领，而「按效应收」够不到它 —— 宿主把切面抛的 `AccessDeniedException`
      // 包成了 `RuntimeException`，运行时的「没落库就释放认领」认不出来（`YD-28` 的冷读者实测；本门禁的越权写就是这种
      // 拒绝）。范围取**本门禁自己的工具** + 调用方 + **没有效应**：那一笔既然被拒，就不存在可被重复执行的写。
      //
      // A **refused** call leaves a claim with no effect behind, and "delete by effect" cannot reach it — the host
      // wraps the aspect's `AccessDeniedException` in a `RuntimeException` (measured by YD-28's cold reader; this
      // gate's cross-scope write is exactly that refusal). Scoped to **this gate's own tool** plus the caller plus
      // **no effect**: the call was refused, so there is no write to duplicate.
      `delete from write_claims where user_id = '${secondId}' and tool_name = 'update_crm_customer' and effect_id is null`,
      // 有码调用方的越权写同样可能留下一条没有效应的认领（见上一条的同一条理由）。
      // The granted caller's cross-row write can leave a claim with no effect behind, for the same reason.
      `delete from write_claims where user_id = '${writer.id}' and tool_name = 'update_crm_customer' and effect_id is null`,
      // `side_effects.result_id` 自 0.1.16 起是文本（效果 id 可能是 UUID），而客户表的 `id` 是 bigint ——
      // 不转就 `character varying = bigint`、整句失败，收尾一条也删不掉。与 `run-bypass-audit-scenarios.mjs`
      // 同一处修法。
      //
      // `side_effects.result_id` is text as of 0.1.16 (an effect id can be a UUID) while the customer table's
      // `id` is bigint; without the cast this is `character varying = bigint`, the statement fails, and the
      // cleanup removes nothing. The same fix as `run-bypass-audit-scenarios.mjs`.
      `delete from write_claims where effect_id in (select id from side_effects where result_type = '${CUSTOMER}' and result_id in (select id::text from ${CUSTOMER} where name like '%${marker}%'))`,
      `delete from side_effects where result_type = '${CUSTOMER}' and result_id in (select id::text from ${CUSTOMER} where name like '%${marker}%')`,
      // 一次性栈（CI）保留确认行，好让 RY-19 的确认率有分母；共用库上照旧收干净。
      // An ephemeral stack (CI) keeps the confirmation rows so RY-19's confirmation rate has a
      // denominator; a shared database still cleans them up.
      ...(process.env.KEEP_CONFIRMATIONS === '1' ? [] : [`delete from confirmation_requests where args_json like '%${marker}%'`]),
      `delete from ${CUSTOMER} where name like '%${marker}%'`,
    ].join('; '),
  );
// `tenant_id` is not optional here: the host's tenant interceptor appends `tenant_id = ?` to this
// table, because `CrmCustomerDO` extends `BaseDO` and carries no `@TenantIgnore`. A row inserted
// without it is invisible to every path through the module.
// `tenant_id` 在这里不是可选的：宿主的租户拦截器给这张表加 `tenant_id = ?`，因为 `CrmCustomerDO` 继承
// `BaseDO` 且没带 `@TenantIgnore`。不带它的行，经模块的每条路都看不见。
psql(`insert into ${CUSTOMER}(id, name, owner_user_id, tenant_id) values (nextval('${CUSTOMER}_seq'), '${adminMarker}', 1, ${TENANT})`);
psql(`insert into ${CUSTOMER}(id, name, owner_user_id, tenant_id) values (nextval('${CUSTOMER}_seq'), '${salesMarker}', ${secondId}, ${TENANT})`);
const writerMarker = `${marker}-writer`;
psql(`insert into ${CUSTOMER}(id, name, owner_user_id, tenant_id) values (nextval('${CUSTOMER}_seq'), '${writerMarker}', ${writer.id}, ${TENANT})`);
const adminRowId = psql(`select id from ${CUSTOMER} where name = '${adminMarker}'`);
const salesRowId = psql(`select id from ${CUSTOMER} where name = '${salesMarker}'`);
const writerRowId = psql(`select id from ${CUSTOMER} where name = '${writerMarker}'`);
check('admin 那一行已种', true, adminRowId !== '');
check('第二个调用方那一行已种', true, salesRowId !== '');
check('有码调用方那一行已种', true, writerRowId !== '');

console.log('== 场景 2 · 身份传递与读侧收窄：断页的内容，不只数调用次数 ==');
{
  // 前半：两个调用方各触发一次读工具。它断言的是这一回合**跑过了**（从审计轨读），证明的是**路由** —— 身份被
  // 传到了本模块的工具上。它**不**证明收窄：把 `narrowToCaller` 删掉，这个计数照样是 2（2026-10-24 反向实验，
  // 与 FMS 门禁同一次复核的同一个结论）。收窄也不在**写**那条路上显形 —— 场景 4 的拒绝来自 `requireOwned`
  // 或写侧的 `appendPermissionCondition`，而收窄落在**读**的 `getCustomerPage` 上，两条是不同的机制。
  //
  // 后半：**页的内容**，这才是收窄的效果。三条都要断 —— 只断「乙的页里没有甲那一行」，一处根本没种甲那行的
  // 夹具也会绿；只断「甲的页里有那一行」，收窄被删掉也绿。第三条（乙的页里有自己那一行）挡住第三种假绿：页
  // 整个空着。页从**模块自己的分页端点**读、不走工具，因为运行时不上线工具的结果（见 `ensureCrmReader`
  // 上方的注解）；而该端点与工具调用的是**同一个**被切的服务方法。
  //
  // The first half: each caller drives the tool once. It asserts the turn **ran** (read from the trail), which
  // proves **routing** — the identity reached this module's tool. It does **not** prove the narrowing: delete
  // `narrowToCaller` and the count is still 2 (2026-10-24 negative experiment, the same finding the FMS gate
  // recorded). The narrowing does not show on the **write** path either — scenario 4's refusal comes from the
  // write side — while this one sits on the **read**'s `getCustomerPage`: two mechanisms.
  //
  // The second half: the **page's content**, which is what the narrowing does. All three checks are required —
  // "the second caller's page lacks the admin's row" alone is green on a fixture that never seeded it, and
  // "the admin's page has it" alone is green with the narrowing deleted. A third check (the second caller's
  // page has its own row) blocks a third false green: a page that is empty entirely. The page is read from the
  // **module's own page endpoint** rather than the tool because the runtime puts no tool result on the wire
  // (see the note above `ensureCrmReader`); that endpoint and the tool cross the **same** advised service
  // method, so what it reads is the page this advice produced.
  const a = await chat(admin, '列出客户');
  check('admin 触发 CRM 工具', 'list_crm_customers', (a.toolCalls || [])[0]);
  check('admin 的执行状态（审计轨）', 1, ranAs('list_crm_customers'));

  const s = await chat(second, '列出客户');
  check('第二个调用方触发同一个工具', 'list_crm_customers', (s.toolCalls || [])[0]);
  check('它的执行状态（审计轨）', 2, ranAs('list_crm_customers'));

  const pageOf = (token) => api('/crm/customer/page?pageSize=100', { token });
  const idsOn = (answer) => (((answer || {}).data || {}).list || []).map((row) => String(row.id));
  const adminPage = await pageOf(admin);
  const secondPage = await pageOf(second);
  check('甲的页取到了', 0, adminPage.code);
  check('乙的页取到了', 0, secondPage.code);
  check('甲的页里有甲那一行（夹具确实种了它）', true, idsOn(adminPage).includes(String(adminRowId)));
  check('乙的页里没有甲那一行（收窄真的发生了）', false, idsOn(secondPage).includes(String(adminRowId)));
  check('乙的页里有乙自己那一行（页不是空着蒙对的）', true, idsOn(secondPage).includes(String(salesRowId)));
}

console.log('== 场景 3 · 同一权限码：REST 拒的，工具也拒；有码的照做 ==');
const writeDeniedMarker = `${marker}-write-denied`;
const writeAllowedMarker = `${marker}-write-allowed`;
{
  // Both halves of this scene count **this run's own row**, not the table. A whole-table delta
  // (`before` … `before + 1`) reads correctly only while nothing else writes, and two gates running at
  // once is exactly the case where it does not: it then fails with `expected [N], got [N+1]`, and the
  // failure points at the gate rather than at the other writer. Counting by this run's marker is both
  // immune to that and strictly stronger — it asserts *this* row landed, not that the table grew by one.
  // 本场两半都数**本轮自己那一行**、不数整张表。整表增量（`before` … `before + 1`）只在没有别人写的时候读起来对，
  // 而「两道门禁同时跑」正是它不对的那种情形：它会以 `expected [N], got [N+1]` 失败，而那个失败看上去指着门禁、
  // 不指着另一个写手。按本轮的标记计数**既免疫这个问题、又更强**——它断言的是**这一行**落了，不是表多了一行。

  // REST 那半保持原样：`common` 答 403。本改动**不放宽** REST。
  // The REST half stays as it was: `common` answers 403. The change does not widen REST.
  check('REST 对 common 仍答 403', 403,
    await restCode('/crm/customer/create', second, { name: writeDeniedMarker, ownerUserId: secondId }));

  // AI 那半：引擎照旧把写扣下等人（那是 R3 的问题）；批准之后拒绝它的，是工具自己的权限判据。
  // The AI half: the engine still holds the write for a person (that is R3's question), and the tool's
  // own permission judgement is what refuses it once approved.
  const held = pendingCount(secondId);
  await chat(second, `新建客户 ${writeDeniedMarker}`);
  // "Held" is **one more waiting row for this caller**, which is also where the token comes from: the
  // answer carries neither (core 0.1.5).
  // 「被扣下」就是**这个调用方多了一行**待确认 —— token 也正是从那儿来的：答案两样都不带（core 0.1.5）。
  check('无码调用方的写仍被扣下（确认卡不变）', held + 1, pendingCount(secondId));
  const deniedToken = pendingTokenFor(secondId, writeDeniedMarker);
  checkNot('扣下时给出 token', 'undefined', deniedToken);

  const deniedOutcome = await confirm(second, deniedToken, 'approve');
  check('批准后仍不执行（受治理失败）', true, deniedOutcome.status !== 'executed');
  check('失败理由点名所缺权限码', true,
    psql(`select coalesce(execution_error, '') from confirmation_requests where token = '${deniedToken}'`)
      .includes('crm:customer:create'));
  check('无码调用方一行未落库', 0,
    Number(psql(`select count(*) from ${CUSTOMER} where name like '%${writeDeniedMarker}%'`)));
  check('审计轨记下这次受治理失败（含权限码）', true,
    Number(psql(`select count(*) from ai_audit_logs where tool = 'create_crm_customer'`
      + ` and outcome = 'failed' and detail like '%crm:customer:create%'`)) > 0);

  // 正向对照：**同一个工具**，调用方持有 REST 所问的那条权限码。
  // The positive control: the **same tool**, a caller holding the same code REST asks for.
  const allowedHeld = pendingCount(writer.id);
  await chat(writerToken, `新建客户 ${writeAllowedMarker}`);
  check('有码调用方的写被扣下', allowedHeld + 1, pendingCount(writer.id));
  const allowedToken = pendingTokenFor(writer.id, writeAllowedMarker);
  const allowedOutcome = await confirm(writerToken, allowedToken, 'approve');
  check('有码调用方批准后执行', 'executed', allowedOutcome.status);
  check('有码调用方那行落地', 1,
    Number(psql(`select count(*) from ${CUSTOMER} where name like '%${writeAllowedMarker}%'`)));
  // The owner is stamped by the governance advice, not named by the tool — the write VO carries the
  // column and a client could have pointed it at someone else.
  // 属主由治理通知盖章、不由工具点名——保存 VO 带着那一列，客户端本可以把它指到别人身上。
  check('新行的属主 = 调用方', writer.id,
    psql(`select owner_user_id from ${CUSTOMER} where name like '%${writeAllowedMarker}%'`));
  // The host's own leg: the row it logged for this write has to name the caller (see `hostLoggedWho`).
  // 宿主那一腿：它为这次写记下的那行，必须说出调用方（见 `hostLoggedWho`）。
  check('宿主操作日志记下了调用方', writer.id, await hostLoggedWho(writeAllowedMarker));
}

console.log('== 场景 4 · 权限过了，行范围仍拒；没权限连执行都不进 ==');
const ownMarker = `${marker}-own`;
const hijackMarker = `${marker}-hijack`;
const updateDeniedMarker = `${marker}-update-denied`;
{
  // 先来一条正对照：持有 `crm:customer:update` 的调用方，改**自己**那一行。
  // A positive control first: a caller holding `crm:customer:update`, a row that IS theirs.
  const mineHeld = pendingCount(writer.id);
  await chat(writerToken, `修改客户 ${ownMarker}`, { customerId: Number(writerRowId) });
  check('改自己的行被扣下', mineHeld + 1, pendingCount(writer.id));
  const mineDone = await confirm(writerToken, pendingTokenFor(writer.id, ownMarker), 'approve');
  check('改自己的行批准后执行', 'executed', mineDone.status);
  check('自己那一行确实改了', true,
    psql(`select name from ${CUSTOMER} where id = ${writerRowId}`).includes(ownMarker));

  // YD-31：账本留下那一行**原先**的样子，于是轨迹答得出「这次改了什么」、而不只是「它现在是什么」。两半都要断，
  // 因为任一半单独都能空过：`before` 必须点名**旧**值、且**不得**点名新值 —— 一条「非空即可」的断言分不出两者。
  //
  // YD-31: the ledger keeps the row as it was, so a trace answers "what did this change" and not only
  // "what is it now". Both halves are asserted because either alone passes vacuously: `before` must
  // name the OLD value and must not name the new one — a "non-empty" check would not tell them apart.
  // `result_id` 是文本（见收尾那处注记），故与 id 按文本比。
  // `result_id` is text (see the cleanup note), so it is compared to the id as text.
  const beforeSnap = psql(`select coalesce(before_snapshot, '') from side_effects`
    + ` where tool_name = 'update_crm_customer' and result_id = '${writerRowId}' order by id desc limit 1`);
  check('改动前的那一行被记下（含旧值）', true, beforeSnap.includes(writerMarker));
  check('且记的是改之前、不是改之后', true, !beforeSnap.includes(ownMarker));

  // 然后是同一次调用、打向**别人的**行。批准了结的是**风险**问题、仅此而已：行范围的问题在更下面、在模块
  // 自己的接缝上回答。这里的调用方**有**权限——正因如此，这是一次行范围拒绝，不是权限拒绝。
  //
  // Then the same call against another caller's row. The approval settles the risk question and
  // nothing else: the row-scope question is answered lower down, at the module's own seam. The caller
  // **has** the permission here, which is what makes this a row-scope refusal and not a permission one.
  const hijackHeld = pendingCount(writer.id);
  await chat(writerToken, `修改客户 ${hijackMarker}`, { customerId: Number(adminRowId) });
  check('改别人的行也被扣下', hijackHeld + 1, pendingCount(writer.id));
  const hijackDone = await confirm(writerToken, pendingTokenFor(writer.id, hijackMarker), 'approve');
  note('越权写批准后的结局', hijackDone.status || JSON.stringify(hijackDone).slice(0, 120));
  check('批准了也没执行', true, hijackDone.status !== 'executed');
  // The refusal must arrive as the **runtime's** error body, not the host's bare 403: the envelope's
  // `errorCode` names why it was refused, and the host's message never did. `.errorCode` is read off the
  // envelope because `data` is null on an error, so `confirm()` hands the whole body back.
  //
  // 拒绝必须以**运行时**的错误体到达，而不是宿主那句光秃秃的 403：信封的 `errorCode` 说得出为什么被拒，
  // 而宿主那句从来不说。`.errorCode` 读的是信封本身 —— 出错时 `data` 为 null，故 `confirm()` 交回整个 body。
  check('拒绝响应带运行时 errorCode', 'ROW_OUT_OF_SCOPE', hijackDone.errorCode);
  // `explanation` 要运行时那半（core 0.1.12）才渲染出来：行拒绝不声称依据，但仍点名拒了哪个主体、哪个动作。
  // 这两条与抬 pin **同船** —— 在 pin 还停在 0.1.11 时必红，那正是它们不能先落地的理由。
  // `explanation` needs the runtime half (core 0.1.12): a row denial claims no basis, but it still names
  // the subject and the action it refused. These two ride with the pin bump — they are red while the pin
  // is still 0.1.11, which is exactly why they must not land before it moves.
  check('拒绝点名主体', 'Customer', hijackDone.explanation?.subject);
  check('拒绝点名动作', 'update', hijackDone.explanation?.action);
  check('别人的行一字未改', adminMarker, psql(`select name from ${CUSTOMER} where id = ${adminRowId}`));

  // 同一个问题的另一半：没有 `crm:customer:update`，这次写根本到不了行范围那道接缝。那一行**是**调用方
  // 自己的，故除了权限码，没有别的东西能拒它。
  //
  // The other half of the same question: without `crm:customer:update`, the write does not even reach
  // the ownership seam. The row is the caller's own, so nothing but the permission code can refuse it.
  const deniedHeld = pendingCount(secondId);
  await chat(second, `修改客户 ${updateDeniedMarker}`, { customerId: Number(salesRowId) });
  check('无码调用方改自己的行也被扣下', deniedHeld + 1, pendingCount(secondId));
  const updateDeniedToken = pendingTokenFor(secondId, updateDeniedMarker);
  const updateDeniedDone = await confirm(second, updateDeniedToken, 'approve');
  check('无码调用方批准后不执行', true, updateDeniedDone.status !== 'executed');
  check('失败理由点名 crm:customer:update', true,
    psql(`select coalesce(execution_error, '') from confirmation_requests where token = '${updateDeniedToken}'`)
      .includes('crm:customer:update'));
  check('自己那一行一字未改', salesMarker, psql(`select name from ${CUSTOMER} where id = ${salesRowId}`));
}

console.log('== 场景 5 · 审计链与被记下的拒绝 ==');
{
  const rows = Number(psql('select count(*) from ai_audit_logs'));
  check('审计行在（>0）', true, rows > 0);
  const verify = await (await fetch(`${HOST}/audit/verify`, { headers: { Authorization: `Bearer ${admin}` } })).json();
  check('链校验通过', true, verify.data && verify.data.valid);
  // The half a list view can never produce: the refusal itself is on the record. The tool name lives
  // in `detail`, not in `action` — `action` says what kind of event it was (`tool_call`), and the
  // first version of this assertion looked in the wrong column and read a pass as a failure.
  // 菜单列表那一侧永远产生不了的那一半：**被拒本身**在案。工具名在 `detail` 里、不在 `action` 里——`action`
  // 说的是这是哪一类事件（`tool_call`）；本断言的**第一版**查错了列，把一次通过读成了失败。
  const refusals = Number(psql(`select count(*) from ai_audit_logs where tool = 'update_crm_customer' and outcome = 'refused'`));
  check('被拒的那次写在案', true, refusals > 0);
}

// ── 收尾：把本轮造的东西收回去 ─────────────────────────────────────────────────────────────────────
//
// 本门禁造的行**都带着本轮的标记**（`gate-<时间戳>`），故「收回去」就是按那个标记删 —— 它够不到别的轮次的
// 行，这正是上面那两处**按标记计数**的断言所需要的同一个性质（两道门禁同时跑也相容）。
//
// **审计行刻意不动**：那是一条哈希链，为了收拾门禁的凌乱去剪断它一环，是比凌乱更坏的一件事。
//
// **台账跟着业务行一起撤。** 副作用与幂等占用指的是**这一轮删掉的那些行**；留着它们，只会让控制台抽屉里
// 「我最近的写」指着一批已经不在的记录 —— 而那正是这条门禁跑完留下的凌乱里，看得见的那一份。
//
// Everything this gate creates carries the run's own marker (`gate-<timestamp>`), so putting it back is a
// delete by that marker: it cannot reach another run's rows, which is the same property the counting
// assertions above need in order to survive two gates running at once. The audit rows are deliberately left
// alone — that is a hash chain, and cutting a link to tidy up after a gate is a worse act than the
// untidiness. The effect and idempotency ledgers go with the business rows: they point at the rows this run
// is removing, and leaving them only makes the console drawer's "recent writes" card name records that are
// gone — which is the visible half of the untidiness this gate used to leave behind.
//
// having been made is a **record** — which is what the line's application-conformance record reads (the
// Confirmation column in `run-app-conformance.mjs`). The panel lists only pending ones, so the decided rows
// take no room on screen either.
console.log('== 收尾 · 把本轮造的行收回去 ==');
try {
  runPutBack();
  ok('本轮那几行已收回（审计行刻意留着）');
} catch (e) {
  bad('收尾', '本轮那几行已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
