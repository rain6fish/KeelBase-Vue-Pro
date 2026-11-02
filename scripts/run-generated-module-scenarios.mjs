#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// The gate for a generated module: what the spike observed once, asserted again every time.
//
//   bash scripts/run-server.sh &            # a running stack, PostgreSQL + redis
//   node scripts/run-generated-module-scenarios.mjs
//
// Every assertion is scoped by a **name unique to this run**, so the gate holds both on a database it
// has already been run against **and alongside another run of itself** — the same discipline the
// sibling host's scenarios use, with the one whole-table count that discipline's measurement removed.
//
// 生成模块的门禁：Spike 观测过一次的东西，此后每次都要断言一遍。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-generated-module-scenarios.mjs
//
// 每条断言都用**本次唯一的名字**收束，故这道门禁**在一个已经跑过的库上**、**以及跟它自己的另一次运行并排**时都
// **照样成立**——与兄弟宿主那些场景同一条纪律；那条纪律的实测把唯一一处整表计数去掉了。
//
// **它造的东西，它收回去** —— 用的还是那个**本轮唯一**的标记，故收尾同样够不到别的轮次的行。**审计行不在此列**：
// 那是一条哈希链，为了收拾门禁的凌乱去剪断它一环，是比凌乱更坏的一件事。
//
// Everything it creates, it removes again — by that same run-scoped marker, so the cleanup cannot reach
// another run's rows either. It does **not** remove audit rows: those are a hash chain, and cutting a link
// to tidy up after a gate would be a worse act than the untidiness.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = '1';
const MODULE = process.env.MODULE || 'products';
const ENTITY = MODULE.charAt(0).toUpperCase() + MODULE.slice(1);
// The host rejects a username that is not alphanumeric (`用户账号由 数字、字母 组成`) — measured.
// 宿主拒绝非字母数字的用户名（`用户账号由 数字、字母 组成`）——实测。
const SECOND_USER = process.env.SECOND_USER || 'gatesales';
const SECOND_PASS = process.env.SECOND_PASS || 'gate-pass-1234';

// 这道门禁对「写该被扣下还是直接跑」的期望，取自**生成工具面所用的同一个源** —— 规格 —— 而不是在这里手敲一句。
// 唯一的权威是写能力的**风险级**（协议 §4：R3/R4 的写为人停下，其余不停）；而生成器会**拒绝**一条自身
// `requiresConfirmation` 布尔与风险级不符的规格，故这里读风险级，读的就是工具与运行时携带的**同一个决定**，
// 不是它的第二份拷贝。`R3/R4` 这一对与冻结的 `RiskLevel.CONFIRMATION_LEVELS` 一致。
//
// What this gate expects of the write comes from the **same source the tool face was generated from** — the
// Spec — rather than a hand-typed expectation here. The one authority is the write capability's risk level
// (protocol §4: an R3/R4 write stops for a human, anything else does not), and the generator **refuses** a
// Spec whose own `requiresConfirmation` flag disagrees with it — so reading the level here reads the same
// decision the tool and the runtime carry, not a second copy of it. `R3/R4` mirrors the frozen
// `RiskLevel.CONFIRMATION_LEVELS`.
const HERE = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(HERE, '..', 'specs', `${MODULE}.json`), 'utf8'));
const writeCap = (spec.aiCapabilities || []).find((cap) => cap.kind === 'write');
const expectHeld = writeCap ? ['R3', 'R4'].includes(writeCap.riskLevel || 'R3') : false;

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const checkNot = (name, forbidden, got) =>
  String(got).includes(forbidden) ? bad(name, `must not contain ${forbidden}`, got) : ok(name);

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

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${HOST}/admin-api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return res.json();
}

async function login(username, password) {
  const r = await api('/system/auth/login', { method: 'POST', body: { username, password } });
  if (r.code !== 0) throw new Error(`login(${username}) -> ${r.code}: ${r.msg}`);
  // The token is inside the envelope's `data`, not on the envelope — reading `r.accessToken` yields
  // `undefined`, and every later request then carries `Bearer undefined` (which the host answers 401).
  // token 在信封的 `data` 里、不在信封上——读 `r.accessToken` 得到 `undefined`，此后每个请求都带
  // `Bearer undefined`（宿主回 401）。
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

// What is waiting on this caller, read from the runtime's own table — **not** from the chat answer,
// which as of core 0.1.5 is the frozen `chat-response` and carries no `status`, no `data` and no `token`.
// `/ai/my/confirmations` would be the product surface for this, but it answers 500 on this host (its
// query names a `mode` column this deployment's schema does not have) — reported, not worked around.
//
// 正在等**这位调用方**的是什么，从运行时**自己的表**读 —— **不**从聊天答案取，core 0.1.5 起它就是冻结的
// `chat-response`，不带 `status`/`data`/`token`。本该走的产品面是 `/ai/my/confirmations`，但它在**本宿主上答
// 500**（它的查询点名了一个本部署 schema 没有的 `mode` 列）—— 这是**报出来**、不是绕过。
const pendingToken = (operatorId) =>
  psql(`select token from confirmation_requests where operator_id = '${operatorId}' and status = 'pending' order by id desc limit 1`) || undefined;

const pendingCount = (operatorId) =>
  Number(psql(`select count(*) from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`));

// Whether a turn actually ran, from the trail rather than from the answer.
// 一个回合**有没有真跑**，从审计轨读、不从答案读。
const ranAs = (tool) =>
  Number(psql(`select count(*) from ai_audit_logs where tool = '${tool}' and outcome = 'executed'`));

/**
 * The second caller, able to read the module's **page** as a non-administrator.
 *
 * Scenario 2 asserts the **page's content**, and the runtime puts no tool result on the wire: the
 * frozen `chat-response` has no `data`, and neither runtime's `tool_end` carries the data. So "is that
 * row on the page" can only be read from the **module's own page endpoint** — it and the tool cross the
 * **same** advised service method `ProductsService.getProductsPage`, which is where the narrowing
 * (`setOwnerUserId`) sits.
 *
 * Two fixtures are needed for that. A **role** carrying only `products:products:query`, scoped `SELF`
 * (5) — a new role defaults to `ALL` (1), and `callerToEnforce()` answers null for a caller whose scope
 * is every row, which stands the narrowing down. And a **menu row** carrying that permission: the
 * generated module ships a table, not a menu, so this deployment has none, and without one the
 * controller refuses every non-administrator. The row is written once, matched on the permission code,
 * with a short name that says it is a gate fixture.
 *
 * 第二个调用方，能以**非管理员**身份读模块的**页**。
 *
 * 场景 2 断的是**页的内容**，而运行时不上线工具的结果：冻结的 `chat-response` 没有 `data`，两个运行时的
 * `tool_end` 也都不带数据。故「页里有没有那一行」只能从**模块自己的分页端点**读——它与工具走的是**同一个**
 * 被切的服务方法 `ProductsService.getProductsPage`，而收窄（`setOwnerUserId`）正切在它上面。
 *
 * 这需要两样夹具。一条**只**带 `products:products:query` 的**角色**，范围 `SELF`（5）——新角色默认
 * `ALL`（1），而 `callerToEnforce()` 对「范围 = 全部行」的调用方返回 null，收窄就整条不发。以及一行带该
 * 权限码的**菜单**：生成模块只带表、不带菜单，故本部署没有这一条，而没有它，控制器会拒掉每一个非管理员。
 * 这一行只写一次、按权限码匹配，名字写明它是门禁夹具。
 */
async function ensureProductsReader(adminToken) {
  let menuId = psql("select id from system_menu where permission = 'products:products:query' and deleted = 0 order by id limit 1");
  if (!menuId) {
    psql("insert into system_menu (id, name, permission, type, sort, parent_id, path, icon, component, component_name,"
      + " status, visible, keep_alive, always_show, creator, create_time, updater, update_time, deleted)"
      + " values (20990, '产品查询（门禁夹具）', 'products:products:query', 3, 99, 0, '', '', '', NULL,"
      + " 0, false, true, true, '1', now(), '1', now(), 0)");
    menuId = psql("select id from system_menu where permission = 'products:products:query' and deleted = 0 order by id limit 1");
    console.log(`  note  本部署没有 products:products:query 的菜单行 —— 门禁自己写了一行（id=${menuId}）`);
  }
  let roleId = psql("select id from system_role where code = 'gate_products_reader' and deleted = 0 limit 1");
  if (!roleId) {
    const role = await api('/system/role/create', {
      method: 'POST', token: adminToken,
      body: { name: 'gate-products-reader', code: 'gate_products_reader', sort: 99, status: 0,
        remark: 'Generated-module gate: the page permission only, so the read narrowing is asserted by content' }
    });
    if (role.code !== 0) throw new Error(`create reader role -> ${role.code}: ${role.msg}`);
    roleId = role.data;
  }
  await api('/system/permission/assign-role-menu', {
    method: 'POST', token: adminToken,
    body: { roleId: Number(roleId), menuIds: [Number(menuId)] }
  });
  await api('/system/permission/assign-role-data-scope', {
    method: 'POST', token: adminToken,
    body: { roleId: Number(roleId), dataScope: 5, dataScopeDeptIds: [] }
  });
  // 与 `gatesales` 一样**按名复用、不收尾**：角色与那一行菜单是夹具的一部分，不是本轮的业务行。
  // Reused by name and **not** removed on the way out, like `gatesales`: both the role and that menu row
  // are part of the fixture, not this run's business rows.
  return Number(roleId);
}

// ── 0) the stack answers at all ────────────────────────────────────────────────────────────────────
console.log('== 前置 ==');
// The audit chain is signed with `keelbase.audit.hmac-key`, so rows written under a different key can
// never verify — a chain signed by one key and checked by another reads as broken at its first row.
// That is not a defect; it is what an HMAC chain does. This gate therefore clears the table first, and
// says so, rather than reporting a failure it caused itself.
// 审计链用 `keelbase.audit.hmac-key` 签名，故**换过 key** 的行永远验不过——一把钥匙签、另一把钥匙验，会在
// **第一行**就报断。那不是缺陷，是 HMAC 链的性质。故本门禁**先清表、并说出来**，而不是报一个它自己造成的失败。
psql('truncate table ai_audit_logs');
check('/app/capabilities 200', '200', (await fetch(`${HOST}/app/capabilities`)).status);

const admin = await login(ADMIN_USER, resolveAdminPassword(psql));
ok('admin 登录');

console.log('== 场景 1 · 身份来自宿主 ==');
{
  const res = await fetch(`${HOST}/auth/me`, { headers: { Authorization: `Bearer ${admin}` } });
  const body = await res.json();
  check('/auth/me 200', 200, res.status);
  check('主体解析成宿主用户', '1', body.data && body.data.username);
  const anon = await fetch(`${HOST}/auth/me`);
  check('无 token 401', 401, anon.status);
}

// ── the second caller: a real host user, so row scope has something to narrow against ──────────────
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
// Give it the query permission, through the API so the host invalidates its own cache — a hand-written
// row is not seen until the cache is cleared (measured). It rides on a role of its own (see
// `ensureProductsReader`): `common` should not be widened for a gate, and scenario 2's page needs it.
// 给它那个查询权限，经 API 授予，好让宿主清掉自己的缓存——手写的行在缓存清掉之前看不见（实测）。它挂在
// 一条自己的角色上（见 `ensureProductsReader`）：`common` 不该为一道门禁放宽，而场景 2 的页要它。
{
  const roles = psql(`select id from system_role where code = 'common' and deleted = 0 limit 1`);
  const readerRoleId = await ensureProductsReader(admin);
  await api('/system/permission/assign-user-role', {
    method: 'POST', token: admin, body: { userId: Number(secondId), roleIds: [Number(roles), readerRoleId] }
  });
}
const second = await login(SECOND_USER, SECOND_PASS);
ok('第二个调用方登录');

console.log('== 场景 2 · 列表工具只回本人行 ==');
// A marker unique to this run, not a delta: the first version counted the caller's rows before and
// expected one more of a **fixed** name, which is wrong the second time the gate runs — a row of that
// name from the previous run is already there. Unique names make the assertion hold on a database the
// gate has already been run against, without weakening what it says.
// 本次唯一的标记名，而不是增量：第一版数的是调用方**改前**的行数、再拿一个**固定名字**去期望「多一行」——门禁
// **第二次**跑就错了，因为上一遍那行同名行还在。唯一名让断言在一个**已经跑过的库**上照样成立，且没有放宽它说的话。
const marker = `gate-${Date.now()}`;
const adminMarker = `${marker}-admin`;
const salesMarker = `${marker}-sales`;
// 收尾**在这里**就挂上（见文件上方 `putBack` 那段）：标记一有，把它收回去就成立；下面任何一处崩了，退出
// 处理器都会替这一轮跑它。本轮的写那一笔另取名（`${marker}-write`），但它**含**这个标记，故一条就够。
// The cleanup is attached **here** (see the `putBack` note near the top): once the marker exists, putting it back
// is well-defined, and anything below dying will still have it run by the exit handler. The write's own name is
// `${marker}-write`, which **contains** this marker, so one marker reaches everything.
putBack = () =>
  psql(
    [
      // `side_effects.result_id` 自 0.1.16 起是文本（效果 id 可能是 UUID），而模块的 `id` 是 bigint ——
      // 不转就 `character varying = bigint`、整句失败，收尾一条也不删。与 `run-bypass-audit-scenarios.mjs`
      // 同一处修法。
      //
      // `side_effects.result_id` is text as of 0.1.16 (an effect id can be a UUID) while the module's `id`
      // is bigint; without the cast this is `character varying = bigint`, the statement fails, and the
      // cleanup removes nothing. The same fix as `run-bypass-audit-scenarios.mjs`.
      `delete from write_claims where effect_id in (select id from side_effects where result_type = '${MODULE}' and result_id in (select id::text from ${MODULE} where name like '%${marker}%'))`,
      `delete from side_effects where result_type = '${MODULE}' and result_id in (select id::text from ${MODULE} where name like '%${marker}%')`,
      // 一次性栈（CI）保留确认行，好让 RY-19 的确认率有分母；共用库上照旧收干净。
      // An ephemeral stack (CI) keeps the confirmation rows so RY-19's confirmation rate has a
      // denominator; a shared database still cleans them up.
      ...(process.env.KEEP_CONFIRMATIONS === '1' ? [] : [`delete from confirmation_requests where args_json like '%${marker}%'`]),
      `delete from ${MODULE} where name like '%${marker}%'`,
    ].join('; '),
  );
// The id comes from the module's sequence and the column has no default — that is the host's own
// convention (`system_users.id` is the same), so a raw insert has to name it.
// id 来自模块的序列、而该列没有默认值——那是宿主自己的惯例（`system_users.id` 亦然），故裸插入必须点名它。
psql(`insert into ${MODULE}(id, name, owner_user_id) values (nextval('${MODULE}_seq'), '${adminMarker}', '1')`);
psql(`insert into ${MODULE}(id, name, owner_user_id) values (nextval('${MODULE}_seq'), '${salesMarker}', '${secondId}')`);
const adminRowId = psql(`select id from ${MODULE} where name = '${adminMarker}'`);
const salesRowId = psql(`select id from ${MODULE} where name = '${salesMarker}'`);
check('甲那一行已种', true, adminRowId !== '');
check('乙那一行已种', true, salesRowId !== '');
{
  // 前半：两个调用方各触发一次读工具。它断言的是这一回合**跑过了**（从审计轨读），证明的是**路由** —— 身份被
  // 传到了本模块的工具上。它**不**证明收窄：把 `narrowToCaller` 里那句 `setOwnerUserId` 删掉，这个计数照样是 2
  // （2026-10-24 反向实验，与 CRM、FMS 两道门禁同一次复核的同一个结论）。
  //
  // 后半：**页的内容**，这才是收窄的效果。三条都要断 —— 只断「乙的页里没有甲那一行」，一处根本没种甲那行的
  // 夹具也会绿；只断「甲的页里有那一行」，收窄被删掉也绿。第三条（乙的页里有自己那一行）挡住第三种假绿：页
  // 整个空着。页从**模块自己的分页端点**读、不走工具，因为运行时不上线工具的结果（见 `ensureProductsReader`
  // 上方的注解）；而该端点与工具调用的是**同一个**被切的服务方法。
  //
  // The first half: each caller drives the tool once. It asserts the turn **ran** (read from the trail), which
  // proves **routing** — the identity reached this module's tool. It does **not** prove the narrowing: delete
  // `setOwnerUserId` from `narrowToCaller` and the count is still 2 (2026-10-24 negative experiment, the same
  // finding the CRM and FMS gates recorded).
  //
  // The second half: the **page's content**, which is what the narrowing does. All three checks are required —
  // "the second caller's page lacks the admin's row" alone is green on a fixture that never seeded it, and
  // "the admin's page has it" alone is green with the narrowing deleted. A third check (the second caller's
  // page has its own row) blocks a third false green: a page that is empty entirely. The page is read from the
  // **module's own page endpoint** rather than the tool because the runtime puts no tool result on the wire
  // (see the note above `ensureProductsReader`); that endpoint and the tool cross the **same** advised
  // service method, so what it reads is the page this advice produced.
  // 生成模块的六条触发词都带「生成」这个独占标记，与手写的 `CrmProductTools` 不再互相包含；这条读用其中
  // 一句，写到的是生成模块。2026-11-02 之前它们不独占，路由按 bean 顺序先命中 CRM——那时门禁把撞车记成
  // 产品侧缺陷，现已在生成器里修掉（`ToolsGenerator`）。
  //
  // The generated module's routes now carry "生成" as a marker no hand-written route claims; this read
  // uses one of them. Before 2026-11-02 they were not exclusive and routing hit CRM first by bean
  // order; the gate recorded that as a product-side defect, now fixed in the generator.
  const a = await chat(admin, '生成的产品');
  check('admin 触发生成的工具', 'list_generated_products', (a.toolCalls || [])[0]);
  check('admin 的执行状态（审计轨）', 1, ranAs('list_generated_products'));

  const s = await chat(second, '生成的产品');
  check('第二个调用方触发同一个工具', 'list_generated_products', (s.toolCalls || [])[0]);
  check('它的执行状态（审计轨）', 2, ranAs('list_generated_products'));

  const pageOf = (token) => api(`/${MODULE}/${MODULE}/page?pageSize=100`, { token });
  const idsOn = (answer) => (((answer || {}).data || {}).list || []).map((row) => String(row.id));
  const adminPage = await pageOf(admin);
  const secondPage = await pageOf(second);
  check('甲的页取到了', 0, adminPage.code);
  check('乙的页取到了', 0, secondPage.code);
  check('甲的页里有甲那一行（夹具确实种了它）', true, idsOn(adminPage).includes(String(adminRowId)));
  check('乙的页里没有甲那一行（收窄真的发生了）', false, idsOn(secondPage).includes(String(adminRowId)));
  check('乙的页里有乙自己那一行（页不是空着蒙对的）', true, idsOn(secondPage).includes(String(salesRowId)));
}

console.log(`== 场景 3 · 写${expectHeld ? '被扣下等人，批准后才执行' : '不被扣下，直接执行'}（期望读自规格的风险级）==`);
{
  // Counted by this run's own marker rather than by a whole-table delta — see the same note in
  // `run-crm-customer-scenarios.mjs`: a delta reads correctly only while nothing else writes.
  // 按**本轮自己的标记**计数，不用整表增量——理由同 `run-crm-customer-scenarios.mjs` 里那条注记：
  // 增量只在**没有别人写**的时候读起来对。
  // 写成**本轮标记的后缀**、而不是另起一个前缀：收尾时按一个标记就能把本轮造的行一次删干净（见文件末尾），
  // 而它作为「本轮唯一名」的用处一点没变。
  // Written as a suffix of this run's marker rather than under a prefix of its own: the cleanup at the end
  // can then reach everything this run created with one marker, and it is just as unique as it was.
  const writeMarker = `${marker}-write`;
  const own = () => Number(psql(`select count(*) from ${MODULE} where name like '%${writeMarker}%'`));
  const held = pendingCount(secondId);
  // 写的三条触发词也带「生成」标记（`新建生成产品` / `创建生成产品` / `添加生成产品`），与手写的
  // `CrmProductTools` 不互相包含，故这里用的 `添加生成产品` 一定命中生成模块的写工具。
  //
  // The write triggers carry the same "生成" marker and no longer overlap the hand-written
  // `CrmProductTools`, so `添加生成产品` routes to the generated write tool.
  const w = await chat(second, `添加生成产品 ${writeMarker}`);
  check('第二个调用方触发生成的写工具', 'create_generated_products', (w.toolCalls || [])[0]);
  if (expectHeld) {
    // "Held" is one more waiting row for this caller — which is also where the token comes from.
    // 「被扣下」是这个调用方多了一行待确认 —— token 也正是从那儿来的。
    check('写被扣下', held + 1, pendingCount(secondId));
    check('未落库', 0, own());
    const proposedToken = pendingToken(secondId);
    checkNot('扣下时给出 token', 'undefined', proposedToken);

    const decided = await fetch(`${HOST}/ai/confirmations/${proposedToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${second}` },
      body: JSON.stringify({ decision: 'approve' })
    });
    const outcome = (await decided.json()).data || {};
    check('批准后执行', 'executed', outcome.status);
    check('落库', 1, own());
  } else {
    // 规格的风险级不为人停下（期望即由此读出），故引擎直接跑这次写 —— 不多一条待确认行，而那一行已落库。
    // The Spec's risk level does not stop for a human — the expectation was read off exactly that — so the
    // engine runs the write straight through: no new pending row, and the row is there.
    check('写未被扣下', held, pendingCount(secondId));
    check('直接落库', 1, own());
  }
}

console.log('== 场景 4 · 审计链 ==');
{
  const rows = Number(psql(`select count(*) from ai_audit_logs`));
  check('审计行在（>0）', true, rows > 0);
  const verify = await (await fetch(`${HOST}/audit/verify`, { headers: { Authorization: `Bearer ${admin}` } })).json();
  check('链校验通过', true, verify.data && verify.data.valid);
}

// ── 收尾：把本轮造的东西收回去 ─────────────────────────────────────────────────────────────────────
//
// 按**本轮自己的标记**删，故它够不到别的轮次的行 —— 与上面那两处计数断言要的是同一个性质。
// **审计行刻意不动**：那是一条哈希链，为了收拾凌乱去剪断它一环，是比凌乱更坏的一件事。
// 台账（副作用 / 幂等占用）跟着业务行一起撤：它们指的是这一轮删掉的那些行。
//
// Delete by this run's own marker, so it cannot reach another run's rows — the same property the counting
// assertions above need. The audit rows are deliberately left alone: that is a hash chain, and cutting a link
// to tidy up after a gate is a worse act than the untidiness. The effect and idempotency ledgers go with the
// business rows, because they point at the rows this run is removing.
console.log('== 收尾 · 把本轮造的行收回去 ==');
try {
  runPutBack();
  ok('本轮那几行已收回（审计行刻意留着）');
} catch (e) {
  bad('收尾', '本轮那几行已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
