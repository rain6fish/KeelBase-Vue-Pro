#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// M1 CRM「产品目录」的场景门：在真栈上取读数。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-crm-product-scenarios.mjs
//
// 产品与合同、回款同形：行范围在模块自己的 `crm_permission` 表里（创建时开一行 `OWNER`），不是 demo01 那种
// 「没有属主列」的形态。本门禁断言四条验收 + 产品特有的三条：
//
//   1. 在**显式身份**下可达：调用方驱动 AI 读工具，审计轨记下的是**这位调用方**；
//   2. 越权被拒：无权限行的调用方读不到别人的产品，也改不了；
//   3. 高危写被扣下、经人批准后才落库（`create_crm_product`，R3）；
//   4. 副作用台账可审计 —— **best-effort**：它记下「这次写发生过」，**不是**可撤销性的保证；
//   5. 分页：上游没有场景入参可补，切面是**后过滤 + 重算 total**，故此条断的是 **total 的语义**；
//   6. 参与方可读但不可写（D3 丙 读宽写严）；
//   7. 产品特有的两种「无属主」：**没有任何权限行**（公海）与**有行却没有负责人**（孤儿）都读得到 ——
//      切面照抄模块自己的 READ 规则，本门禁把这两种都种出来、与「有属主」那一份对照。
//
// **第 5 条为什么断 total，而不是断「页里有没有 A 的行」。** 产品的分页上游**没有** `userId` / `sceneType`
// 入参（`getProductPage` 只收名称与状态），切面只能在模块答完之后按权限行**后过滤**，并按本页留下的行数
// **重算 total**。于是这一条要断两半、缺一不可：**豁免调用方**（种子管理员）看到的是模块自己的 total（整页
// 三行）；**收窄调用方**看到的是本页收窄后的行数（一行）。只断前者，收窄被删掉也绿；只断后者，一个根本没收窄的
// 夹具也会绿。**声明范围**：这里的 total 描述的是**这一页**，不是整张表 —— 上游的分页对任何有 `crm:product:query`
// 的人都是全表，而本切面让 REST 与 AI 一起只看到自己读得到的行；要一个真正的按人总量，得由模块自己的查询带
// 调用方条件，切面编不出来（与类注释、`Demo01ContactGovernance` 同一口径）。
//
// **第 1、2、4、6 条的读法。** 运行时**不上线**工具结果（冻结的 `chat-response` 只有 `reply`/`toolCalls`），
// 故「页里有没有这一行」只能从模块自己的端点读；而该端点与工具走的是**同一个**被切的服务方法。第 1 条读审计轨
// 的 `user_id`（工具路径跑在安全过滤器链之外，这个值只能来自运行时发布的调用方）；第 2、6 条的写走 REST，拒绝
// 来自模块自己的数据权限切面（无权限行）或本治理切面（有 WRITE 却不是 OWNER）。
//
// **第 3 条的消息形状与触发词。** 五个必填项由路由从用户**明确写出的文字**里读：`名称= 编码= 价格= 状态= 分类=`；
// 缺一个，引擎就会在**人批准之前**以 `invalid_arguments` 拒掉提议（回款门、合同门各红过一次）。触发词用
// `加产品` —— 本仓还有一个**生成的样例模块** `generated/ProductsTools`（另一个对象、另一张表），它
// **曾经**也吃 `新建产品`/`创建产品`/`列出产品`/`产品列表`；现在样例模块只用自己的说法（`新建生成产品` 等），
// 但路由按声明次序取第一个命中，故本门禁仍只用本对象自己的词。读工具同理用 `有哪些产品`。
// **这是让门禁量到本对象的那条路由，不是样式偏好。**
//
// 每条断言都用**本次唯一**的标记收束，不按整表计数；它造的东西（分类、产品、权限行、副作用、确认单、写占位）都按
// 该标记收回。**审计行刻意不动**：那是一条哈希链，剪断一环比凌乱更坏。
//
// M1, the CRM product catalogue: the scenario gate that takes readings on a real stack.
//
// Products share the contract and receivable shape — the row range lives in the module's own `crm_permission`
// table (an `OWNER` row opened on create), not the ownerless demo01 shape. This gate asserts the four
// acceptance readings plus three product-specific ones: reachable under an explicit identity; out-of-scope
// reads and writes refused; the high-risk create held for a human and landed only after approval; the
// side-effect ledger auditable (**best-effort** — it records that the write happened, it is **not** a
// guarantee of revocability); the page (post-filtered, **recomputed total**) asserts **what its total
// means**; a participant may read but not write (D3); and the two "no owner" cases — **no permission rows at
// all** (public sea) and **rows without an owner** (orphaned) — stay readable, exactly as the module's own
// READ rule says, contrasted against the owned row.
//
// **Why reading 5 asserts the total.** Upstream's product page takes **no** `userId`/`sceneType`, so the
// aspect can only post-filter the answered page and recompute `total` from the rows this page kept. Both
// halves are required: the **exempt** caller (seed administrator) sees the module's own total (three rows on
// the page); the **narrowed** caller sees the rows kept on this page (one). Asserting only the first is green
// with the narrowing deleted; only the second is green on a fixture that never narrowed. **Declared scope**:
// this total describes **this page**, not the table — upstream's page is global to anyone holding
// `crm:product:query`, while this aspect shows REST and AI callers alike only their readable rows. A true
// per-caller total would have to come from the module's own query carrying the caller's condition.
//
// **How 1, 2, 4 and 6 are read.** The runtime does not put tool results on the wire (the frozen
// `chat-response` carries only `reply`/`toolCalls`), so "is that row on the page" is read from the module's
// own endpoint — the **same** advised service method the tool crosses. Reading 1 reads the audit row's
// `user_id` (the tool path runs outside the security filter chain, so that value can only come from the
// runtime). Readings 2 and 6 drive REST writes, and the refusal comes either from the module's own data
// permission aspect (no row) or from this governance advice (WRITE is not OWNER).
//
// **Why the triggers are what they are.** This repo also ships a **generated sample module**
// (`generated/ProductsTools`) — a different object on a different table — which **used to** eat the same
// generic phrases (`新建产品` / `创建产品` / `列出产品` / `产品列表`); the sample now carries only phrases of its
// own (`新建生成产品`, and so on). Routes are still taken in declaration order, so this gate uses this
// object's own words (`加产品`, `有哪些产品`) — that is what makes the readings come from this route.
//
// Every assertion is scoped by a **name unique to this run**, never by a whole-table count; everything it
// creates (category, products, permission rows, effects, confirmations, write claims) is removed again by
// that marker. The audit rows are deliberately left alone: that is a hash chain, and cutting a link to
// tidy up is a worse act than the untidiness.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48100';
const PG = process.env.PG_CONTAINER || 'crmproduct-1031-pg';
const DB = process.env.PG_DB || 'crm_product_gate';
const TENANT = process.env.TENANT_ID || '1';
const SECOND_USER = process.env.PRODUCT_SECOND_USER || 'gateprod2';
const SECOND_PASS = process.env.PRODUCT_SECOND_PASS || 'gate-pass-1234';
const WRITER_USER = process.env.PRODUCT_WRITER_USER || 'gateprodw';
const WRITER_PASS = process.env.PRODUCT_WRITER_PASS || 'gate-pass-1234';
const PRODUCT = 'crm_product';
const CATEGORY = 'crm_product_category';
const PERMISSION = 'crm_permission';
const BIZ_TYPE_PRODUCT = 6; // CrmBizTypeEnum.CRM_PRODUCT
const LEVEL_OWNER = 1; // CrmPermissionLevelEnum.OWNER
const LEVEL_READ = 2; // CrmPermissionLevelEnum.READ
const LEVEL_WRITE = 3; // CrmPermissionLevelEnum.WRITE

// 三次写的价格刻意互不相同，故「有没有落地」不必看属主。
// The three writes carry distinct prices, so "did it land" never has to look at the owner.
const FIXTURE_PRICE = 10;
const DENIED_PRICE = 100;
const CREATED_PRICE = 200;

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const checkNot = (name, forbidden, got) =>
  String(got).includes(forbidden) ? bad(name, `must not contain ${forbidden}`, got) : ok(name);
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

// psql 助手：默认 `docker exec`（与本线其它门禁相同）；`PSQL_HELPER=direct` 直连；没有 psql 客户端时
// 用 `PSQL_HELPER_SCRIPT` 指向 `scripts/psql-helper.mjs`。
//
// The psql helper: `docker exec` by default (the same as this line's other gates); `PSQL_HELPER=direct`
// for a reachable client; `PSQL_HELPER_SCRIPT` for a psql-shaped Node helper on a host with no psql.
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

// 收尾在**本轮造出第一行的那一刻**挂上，而不是等到文件末尾：否则「造了行、随后崩了」那条路上它是空的。
// `process.on('exit')` 在未捕获异常把进程带走时同样触发，而 `psql()` 是同步的，故退出处理器里跑得动。
//
// The cleanup is attached at the moment this run creates its first row, not assembled at the end of the
// file: otherwise it is empty on the "created rows, then died" path. `process.on('exit')` fires when an
// uncaught exception takes the process down too, and `psql()` is synchronous, so it runs there.
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

// 宿主答它那个瞬时 500 时**重试一次**、且说出来；业务性拒绝不重试。
// Retry **once** on the host's transient 500 and say so; a business refusal is not retried.
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
    body: JSON.stringify({ message, conversationId: `gate-product-${Date.now()}`, ...extra })
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

// 业务性拒绝也包在 HTTP 200 里，故断言读的是信封的 `code`、不是 HTTP 状态码。
// Business refusals are wrapped in HTTP 200, so the assertion reads the envelope's `code`, not the status.
const pendingCount = (operatorId) =>
  Number(psql(`select count(*) from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`));

const maxConfirmationId = () => Number(psql('select coalesce(max(id), 0) from confirmation_requests'));

// 产品的 args 里**有**门禁标记（名称与编码都带它），但仍按「本轮之后、这个调用方、这个工具」定位：
// 同一调用方的两次写（无码被拒 / 有码执行）本来就分得开，这样也不必依赖 args 的形状。
// The product args **do** carry the gate marker (name and code), but the row is still located by
// "after this run started, this caller, this tool": one caller's two attempts are already distinguishable,
// and this does not depend on the argument shape.
const pendingTokenForTool = (operatorId, tool, sinceId) =>
  psql(`select token from confirmation_requests where operator_id = '${operatorId}' and tool_name = '${tool}'`
    + ` and status = 'pending' and id > ${sinceId} order by id desc limit 1`) || undefined;

// 一个角色：按权限码查出菜单行、建角色（同名复用）、授菜单、数据范围设 `SELF`（5）。新角色默认 `ALL`（1），
// 而 `callerToEnforce()` 对「范围 = 全部行」的调用方返回 null，收窄就整条不发。
// A role: resolve menu rows by permission code, create it (reuse by name), grant the menus, and set the
// data scope to `SELF` (5). A new role defaults to `ALL` (1), for which `callerToEnforce()` answers null
// and the narrowing stands down entirely.
async function ensureRole(adminToken, code, name, permissionCodes) {
  const inList = permissionCodes.map((permission) => `'${permission}'`).join(',');
  const menuIds = psql(`select string_agg(id::text, ',') from system_menu where permission in (${inList}) and deleted = 0`);
  if (!menuIds) {
    throw new Error(`这些权限码不在 system_menu 里：${permissionCodes.join(', ')} —— 这套库的菜单种子缺了它们`);
  }
  let roleId = psql(`select id from system_role where code = '${code}' and deleted = 0 limit 1`);
  if (!roleId) {
    const role = await api('/system/role/create', {
      method: 'POST', token: adminToken,
      body: { name, code, sort: 99, status: 0, remark: 'product gate: the codes this scenario needs' }
    });
    if (role.code !== 0) throw new Error(`create role ${code} -> ${role.code}: ${role.msg}`);
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
  return Number(roleId);
}

// 一个调用方：按名复用；每次都重授角色（幂等），使夹具不依赖上一次运行留下的关系。
// A caller: reuse by name, and re-assign the roles every time (idempotent), so the fixture does not
// depend on relationships left behind by an earlier run.
async function ensureUser(adminToken, username, password, roleIds) {
  let id = Number(psql(`select id from system_users where username = '${username}' and deleted = 0 limit 1`)) || null;
  if (!id) {
    const created = await api('/system/user/create', {
      method: 'POST', token: adminToken,
      body: { username, nickname: username, password, deptId: 100, postIds: [] }
    });
    if (created.code !== 0) throw new Error(`create user ${username} -> ${created.code}: ${created.msg}`);
    id = Number(created.data);
  }
  await api('/system/permission/assign-user-role', {
    method: 'POST', token: adminToken, body: { userId: id, roleIds: roleIds.map(Number) }
  });
  return { id, username, password };
}

// 「谁」：宿主为这一次写记下的那行操作日志，它的 `user_id` 必须是调用方。这行由宿主**异步**写下，
// 故有上限地轮询到它出现（默认 30s，`SCENARIO_OPERATE_LOG_TIMEOUT_MS` 可覆盖），读数里带上证据。
// 产品的创建日志模板里是**产品名称**（`createReqVO.name`，本轮唯一），按它定位。
//
// Who: the row the host logged for this write must name the caller. It is written **asynchronously**, so
// poll with a deadline (30s by default; `SCENARIO_OPERATE_LOG_TIMEOUT_MS` overrides) and carry the
// evidence in the reading. The product create template names the **product** (`createReqVO.name`, unique
// to this run), which is what locates the row.
const OPERATE_LOG_WAIT_MS = Number(process.env.SCENARIO_OPERATE_LOG_TIMEOUT_MS || 30000) || 30000;
async function hostLoggedWho(productName) {
  const filter = `type = 'CRM 产品' and action like '%${productName}%'`;
  const deadline = Date.now() + OPERATE_LOG_WAIT_MS;
  while (Date.now() < deadline) {
    const who = psql(`select coalesce(user_id::text, '<null>') from system_operate_log`
      + ` where ${filter} order by id desc limit 1`);
    if (who) return who;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  // 读数带上证据：有几行匹配、表里最新一行是哪条 —— 让「没等到」与「没写」在日志里可分辨。
  // The reading carries its evidence: how many rows match and the newest operate-log id, so "never
  // appeared" and "was never written" are distinguishable in the log.
  const matching = psql(`select count(*) from system_operate_log where ${filter}`);
  const newest = psql(`select coalesce(max(id)::text, '<none>') from system_operate_log`);
  return `<no row within ${OPERATE_LOG_WAIT_MS}ms: matching=${matching}, newest operate_log id=${newest}>`;
}

// ── 0) 前置 ──────────────────────────────────────────────────────────────────────────────────────
console.log('== 前置 ==');
// 审计链用 `keelbase.audit.hmac-key` 签名，换过 key 的行永远验不过；先清表并说出来。
// The audit chain is signed with `keelbase.audit.hmac-key`, so rows signed under another key can never
// verify. Clear the table first and say so.
psql('truncate table ai_audit_logs');
check('/app/capabilities 200', '200', (await fetch(`${HOST}/app/capabilities`)).status);

const admin = await login(ADMIN_USER, resolveAdminPassword(psql));
ok('admin 登录');

console.log('== 前置 · 两个调用方 ==');
// B：只有查/改的权限码，且**没有**任何产品的权限行 —— 越权那半要的正是「有码、但没有这一行」。
// W：多一个创建码，并且会被种成 A 那一份的**参与方**（WRITE）——「可读不可写」那半要的正是这个。
//
// B: read/update codes only, and **no** permission row on any product — the cross-scope half needs
// "has the code, does not own the row". W: additionally the create code, and seeded as a **participant**
// (WRITE) on A's product — which is exactly what the "may read, may not write" half needs.
let second; let secondToken;
let writer; let writerToken;
try {
  const commonRole = psql(`select id from system_role where code = 'common' and deleted = 0 limit 1`);
  const readerRole = await ensureRole(admin, 'gate_product_reader', 'gate-product-reader',
    ['crm:product:query', 'crm:product:update']);
  const writerRole = await ensureRole(admin, 'gate_product_writer', 'gate-product-writer',
    ['crm:product:query', 'crm:product:create', 'crm:product:update']);
  second = await ensureUser(admin, SECOND_USER, SECOND_PASS, [commonRole, readerRole]);
  secondToken = await login(SECOND_USER, SECOND_PASS);
  ok(`第二个调用方就绪（id=${second.id}）`);
  writer = await ensureUser(admin, WRITER_USER, WRITER_PASS, [commonRole, writerRole]);
  writerToken = await login(WRITER_USER, WRITER_PASS);
  ok(`有码调用方就绪（id=${writer.id}）`);
} catch (e) {
  bad('调用方就绪', 'ok', e.message);
  throw e;
}

// ── 1) 夹具：一个分类、三件「有属主」的产品、两件「无属主」的产品、四条权限行 ─────────────────────
console.log('== 夹具 ==');
const marker = `gate-product-${Date.now()}`;
const categoryName = `${marker}-category`;
const pageA = `${marker}-page-a`;
const pageB = `${marker}-page-b`;
const pageC = `${marker}-page-c`;
const pubName = `${marker}-public`;
const orphanName = `${marker}-orphan`;
const noOf = (suffix) => `${marker}-no-${suffix}`;

putBack = () => psql([
  // 被**拒绝**的创建会留下一个没有效应的认领，而「按效应收」够不到它；已执行那次的认领则指向一条效应。
  // A refused create leaves a claim with no effect; an executed one has a claim pointing at an effect.
  `delete from write_claims where user_id in ('${second.id}', '${writer.id}') and tool_name = 'create_crm_product' and effect_id is null`,
  // `side_effects.result_id` 自 0.1.16 起是文本（效果 id 可能是 UUID），而产品表的 `id` 是 bigint ——
  // 不转就 `character varying = bigint`、整句失败，收尾一条也删不掉。与 `run-bypass-audit-scenarios.mjs`
  // 同一处修法。
  //
  // `side_effects.result_id` is text as of 0.1.16 (an effect id can be a UUID) while the product table's
  // `id` is bigint; without the cast this is `character varying = bigint`, the statement fails, and the
  // cleanup removes nothing. The same fix as `run-bypass-audit-scenarios.mjs`.
  `delete from write_claims where effect_id in (select id from side_effects where result_type = 'crm_product'`
    + ` and result_id in (select id::text from ${PRODUCT} where name like '${marker}%'))`,
  `delete from side_effects where result_type = 'crm_product' and result_id in`
    + ` (select id::text from ${PRODUCT} where name like '${marker}%')`,
  `delete from confirmation_requests where tool_name = 'create_crm_product' and args_json like '%${marker}%'`,
  `delete from ${PERMISSION} where biz_type = ${BIZ_TYPE_PRODUCT} and biz_id in`
    + ` (select id from ${PRODUCT} where name like '${marker}%')`,
  `delete from ${PRODUCT} where name like '${marker}%'`,
  `delete from ${CATEGORY} where name like '${marker}%'`,
].join('; '));

// `tenant_id` 不是可选的：租户拦截器给这些表加 `tenant_id = ?`，不带它的行经模块的每条路都看不见。
// `tenant_id` is not optional: the tenant interceptor appends `tenant_id = ?` to these tables, and a row
// without it is invisible to every path through the module.
psql(`insert into ${CATEGORY}(id, name, parent_id, tenant_id, creator, updater)`
  + ` values (nextval('${CATEGORY}_seq'), '${categoryName}', null, ${TENANT}, '1', '1')`);
const categoryId = psql(`select id from ${CATEGORY} where name = '${categoryName}'`);
check('产品分类已种', true, categoryId !== '');

// `creator` 写成数字字符串：模块的分页与详情会把它当用户 id 解析。`unit` 是实体里的基本类型 `int`，
// 与模块自己造的行同形，夹具写 0。
// `creator` is a numeric string: the module's page and detail parse it as a user id. `unit` is a bare
// `int` in the entity, so the fixture writes 0, the same shape the module itself creates.
const insertProduct = (name, suffix, owner, price) =>
  psql(`insert into ${PRODUCT}(id, name, no, unit, price, status, category_id, description, owner_user_id, tenant_id, creator, updater)`
    + ` values (nextval('${PRODUCT}_seq'), '${name}', '${noOf(suffix)}', 0, ${price}, 1, ${categoryId},`
    + ` '${marker}-original', ${owner}, ${TENANT}, '${owner}', '1')`);
insertProduct(pageA, 'a', 1, FIXTURE_PRICE);
insertProduct(pageB, 'b', second.id, FIXTURE_PRICE + 10);
insertProduct(pageC, 'c', 1, FIXTURE_PRICE + 20);
// 公海：**一条权限行都没有**，且属主列留 0（上游公海的写法）。切面照模块的 READ 规则放行。
// Public sea: **no permission rows at all**, owner column left at 0 (upstream's public-sea shape). The
// aspect lets it through, mirroring the module's READ rule.
insertProduct(pubName, 'public', 0, FIXTURE_PRICE);
// 孤儿：**有权限行、却没有负责人**（只有一行 READ）。切面同样放行。
// Orphaned: **rows exist but no owner** (one READ row). The aspect lets it through too.
insertProduct(orphanName, 'orphan', 1, FIXTURE_PRICE);
const idA = psql(`select id from ${PRODUCT} where name = '${pageA}'`);
const idB = psql(`select id from ${PRODUCT} where name = '${pageB}'`);
const idC = psql(`select id from ${PRODUCT} where name = '${pageC}'`);
const idPub = psql(`select id from ${PRODUCT} where name = '${pubName}'`);
const idOrphan = psql(`select id from ${PRODUCT} where name = '${orphanName}'`);
check('三件「有属主」的产品已种', true, idA !== '' && idB !== '' && idC !== '');
check('两件「无属主」的产品已种', true, idPub !== '' && idOrphan !== '');

// 负责人行：模块自己创建产品时也会写，这里手写是因为夹具直接插表。
// Owner rows: the module writes these on create; they are written by hand here because the fixture
// inserts straight into the table.
const insertPermission = (bizId, userId, level) =>
  psql(`insert into ${PERMISSION}(id, biz_type, biz_id, user_id, level, tenant_id)`
    + ` values (nextval('${PERMISSION}_seq'), ${BIZ_TYPE_PRODUCT}, ${bizId}, ${userId}, ${level}, ${TENANT})`);
insertPermission(idA, 1, LEVEL_OWNER);
insertPermission(idB, second.id, LEVEL_OWNER);
insertPermission(idC, 1, LEVEL_OWNER);
// W 是 A 那一份的**参与方**（读写、非负责人）——「参与方可读但不可写（D3 丙）」的夹具。
// W is a **participant** (write, not owner) on A's product — the fixture for "participants may read,
// may not write" (D3).
insertPermission(idA, writer.id, LEVEL_WRITE);
// 孤儿那一件：只有一行 READ，没有 OWNER —— 模块与本切面的「无负责人即可读」都对它生效。
// The orphaned row: a READ row and no OWNER — both the module's rule and this aspect's let it through.
insertPermission(idOrphan, 1, LEVEL_READ);
check('五条权限行已种（A/B/C 各一行负责人、A 一行参与方、孤儿一行 READ）', 5,
  Number(psql(`select count(*) from ${PERMISSION}`
    + ` where biz_type = ${BIZ_TYPE_PRODUCT} and biz_id in (${idA}, ${idB}, ${idC}, ${idOrphan})`)));

// ── 2) 场景 1 · 显式身份下可达 ─────────────────────────────────────────────────────────────────────
console.log('== 场景 1 · 显式身份下可达 ==');
{
  const a = await chat(admin, '有哪些产品');
  check('管理员触发产品读工具', 'list_crm_products', (a.toolCalls || [])[0]);
  check('管理员那次以本人身份在案', '1', psql(`select user_id from ai_audit_logs`
    + ` where tool = 'list_crm_products' and outcome = 'executed' order by id desc limit 1`));

  const s = await chat(secondToken, '有哪些产品');
  check('第二个调用方触发同一个工具', 'list_crm_products', (s.toolCalls || [])[0]);
  // 「身份」不是听答案说的：审计行的 `user_id` 必须是他本人。工具路径跑在请求的安全过滤器链之外，
  // 这个值只能来自运行时发布的调用方。
  // "Identity" is not what the answer says: the audit row's `user_id` must be the caller. The tool path
  // runs outside the request's security filter chain, so that value can only come from the runtime.
  check('第二个调用方那次以本人身份在案', String(second.id), psql(`select user_id from ai_audit_logs`
    + ` where tool = 'list_crm_products' and outcome = 'executed' order by id desc limit 1`));
  check('两次读都真跑了（审计轨）', 2, Number(psql("select count(*) from ai_audit_logs"
    + " where tool = 'list_crm_products' and outcome = 'executed'")));
}

// ── 3) 场景 2 · 越权读被拒；分页的 total 语义；参与方可读；两种「无属主」可读 ─────────────────────
console.log('== 场景 2 · 越权读 / 分页 total / 参与方可读 / 无属主可读 ==');
{
  const getAs = (token, id) => api(`/crm/product/get?id=${id}`, { token });
  const pageOf = (token, name) => api(`/crm/product/page?pageSize=100&name=${encodeURIComponent(name)}`, { token });
  const idsOn = (answer) => (((answer || {}).data || {}).list || []).map((row) => String(row.id));

  // 无权限行的 B：按 id 读，**读不到**。REST 上模块自己的 `@CrmPermission(READ)` 先拒（信封 `1020007001`，
  // CRM_PERMISSION_DENIED）；AI 路径上没有登录用户、模块切面放行，拒绝由本治理切面把行**当作不存在**交回（null）。
  // 本门禁在 REST 上读到的是前者，故断言「不可读」，并把实际读数记下来，而不是把某一层的形状写死。
  //
  // B, with no permission row: a read by id is **not readable**. On REST the module's own
  // `@CrmPermission(READ)` refuses first (envelope `1020007001`, CRM_PERMISSION_DENIED); on the tool path
  // there is no login user, the module aspect stands aside, and this governance advice hands the row back
  // **as nothing** (null). This gate reads the former on REST, so it asserts "not readable" and records the
  // actual reading rather than pinning one layer's shape.
  const bGetsA = await getAs(secondToken, idA);
  note('B 取 A 的产品读数', JSON.stringify({ code: bGetsA.code, msg: bGetsA.msg, data: bGetsA.data == null ? null : '<row>' }).slice(0, 160));
  check('B 取 A 的产品：读不到', 'not readable',
    bGetsA.code !== 0 || bGetsA.data == null ? 'not readable' : 'row');
  const bGetsOwn = await getAs(secondToken, idB);
  check('B 取自己的产品：读得到', String(idB), String(bGetsOwn.data?.id));

  // 分页：上游**没有场景入参**，切面是后过滤 + 重算 total。两半都要断：豁免调用方看到模块自己的 total，
  // 收窄调用方看到本页留下的行数。
  //
  // The page: upstream has **no scene argument**, so the aspect post-filters and recomputes. Both halves
  // are required: the exempt caller reads the module's own total, the narrowed caller the rows this page kept.
  const adminPage = await pageOf(admin, `${marker}-page`);
  check('豁免调用方的分页取到了', 0, adminPage.code);
  check('豁免调用方：total 是模块这一页的总量', 3, adminPage.data?.total);
  check('豁免调用方：本页行数', 3, idsOn(adminPage).length);

  const bPage = await pageOf(secondToken, `${marker}-page`);
  check('收窄调用方的分页取到了', 0, bPage.code);
  check('收窄调用方：total 是**本页**收窄后的行数（不是整张表）', 1, bPage.data?.total);
  check('收窄调用方：没有 A 的产品（不传场景 ≠ 全部行）', false, idsOn(bPage).includes(String(idA)));
  check('收窄调用方：有自己那件产品（页不是空着蒙对的）', true, idsOn(bPage).includes(String(idB)));

  // 参与方可读：W 在 A 那一份上是 WRITE，故后过滤留下的正是 A；按 id 也读得到。
  // A participant may read: W holds WRITE on A's product, so the post-filter keeps exactly A; it reads by
  // id as well.
  const wPage = await pageOf(writerToken, `${marker}-page`);
  check('参与方的分页取到了', 0, wPage.code);
  check('参与方的页里有 A 的产品', true, idsOn(wPage).includes(String(idA)));
  const wGetsA = await getAs(writerToken, idA);
  check('参与方按 id 读得到 A 的产品', String(idA), String(wGetsA.data?.id));

  // 产品特有的两种「无属主」：**一条权限行都没有**（公海）与**有行却没有负责人**（孤儿），都读得到；
  // 与上面「有属主」的 A 读不到，构成对照。
  // The two product-specific "no owner" cases: **no permission rows at all** (public sea) and **rows with
  // no owner** (orphaned) both read; contrasted with the owned A above, which does not.
  const bGetsPub = await getAs(secondToken, idPub);
  check('B 读公海产品（无任何权限行）：读得到', String(idPub), String(bGetsPub.data?.id));
  const bGetsOrphan = await getAs(secondToken, idOrphan);
  check('B 读孤儿产品（有 READ 行、无负责人）：读得到', String(idOrphan), String(bGetsOrphan.data?.id));

  // 这两个也出现在收窄后的页里（同名过滤各取一件）——「按 id 读得到」与「页里也留得下」是两件事。
  // They also survive the narrowed page (one each, same-name filter): "reads by id" and "is kept on the
  // page" are two different readings.
  const bPubPage = await pageOf(secondToken, pubName);
  check('公海产品留在 B 的页里', true, idsOn(bPubPage).includes(String(idPub)));
  const bOrphanPage = await pageOf(secondToken, orphanName);
  check('孤儿产品留在 B 的页里', true, idsOn(bOrphanPage).includes(String(idOrphan)));
}

// ── 4) 场景 3 · 高危写：扣下、批准、落库（以及无码被拒） ───────────────────────────────────────────
console.log('== 场景 3 · 高危写被扣下、批准后落库 ==');
// 五个必填项都用**明确写出来的值**：路由从文字里读它们，缺一个引擎就在人批准之前拒掉提议。
// The five required values are written **explicitly**: the route reads them from the text, and one missing
// is refused before a person is asked.
const asked = (name, suffix, price) =>
  `加产品 名称=${name} 编码=${noOf(suffix)} 价格=${price} 状态=1 分类=${categoryId}`;
const createdName = `${marker}-created`;
let createdProductId = '';
{
  const deniedBaseline = maxConfirmationId();
  // 无码调用方：引擎照旧扣下，批准后拒绝它的是工具自己的权限判据。
  // The no-code caller: the engine still holds it, and after approval the tool's own permission judgement
  // refuses it.
  const deniedHeld = pendingCount(second.id);
  const deniedAnswer = await chat(secondToken, asked(`${marker}-denied`, 'denied', DENIED_PRICE));
  // 被拒**也要读得懂**：路由没填齐必填项时，引擎在任何确认行存在之前就答 `invalid_arguments`。
  // A red must be legible: when the route does not fill the required arguments, the engine answers
  // `invalid_arguments` before any confirmation row exists.
  note('无码调用方的写读数', JSON.stringify({ toolCalls: deniedAnswer.toolCalls, reply: String(deniedAnswer.reply || '').slice(0, 160) }).slice(0, 260));
  check('无码调用方的写被扣下', deniedHeld + 1, pendingCount(second.id));
  const deniedToken = pendingTokenForTool(second.id, 'create_crm_product', deniedBaseline);
  checkNot('扣下时给出 token', 'undefined', deniedToken);
  note('无码那次扣下时的参数', (psql(`select args_json from confirmation_requests`
    + ` where token = '${deniedToken}'`) || '').slice(0, 260));
  const deniedOutcome = await confirm(secondToken, deniedToken, 'approve');
  check('批准后仍不执行（受治理失败）', true, deniedOutcome.status !== 'executed');
  check('失败理由点名 crm:product:create', true,
    psql(`select coalesce(execution_error, '') from confirmation_requests where token = '${deniedToken}'`)
      .includes('crm:product:create'));
  check('无码调用方一行未落库', 0,
    Number(psql(`select count(*) from ${PRODUCT} where no = '${noOf('denied')}'`)));
  check('无码那次的失败在审计轨', true, Number(psql(`select count(*) from ai_audit_logs`
    + ` where tool = 'create_crm_product' and outcome = 'failed' and detail like '%crm:product:create%'`)) > 0);

  // 有码调用方：同一个工具，持有所需的那条码。
  // The code-holding caller: the same tool, with the code it asks for.
  const writerBaseline = maxConfirmationId();
  const writerHeld = pendingCount(writer.id);
  const writerAnswer = await chat(writerToken, asked(createdName, 'created', CREATED_PRICE));
  note('有码调用方的写读数', JSON.stringify({ toolCalls: writerAnswer.toolCalls, reply: String(writerAnswer.reply || '').slice(0, 160) }).slice(0, 260));
  check('有码调用方的写被扣下', writerHeld + 1, pendingCount(writer.id));
  const writerTokenId = pendingTokenForTool(writer.id, 'create_crm_product', writerBaseline);
  checkNot('有码那次扣下时给出 token', 'undefined', writerTokenId);
  // 红也要读得懂：把扣下时的参数与批准后的执行错误一起打出来（本行本身就是读数的一部分）。
  // A red must still be readable: print the held arguments and the execution error the runtime recorded.
  note('有码那次扣下时的参数', (psql(`select args_json from confirmation_requests`
    + ` where token = '${writerTokenId}'`) || '').slice(0, 300));
  const writerOutcome = await confirm(writerToken, writerTokenId, 'approve');
  note('有码调用方批准后的结局', writerOutcome.status || JSON.stringify(writerOutcome).slice(0, 160));
  note('有码那次批准后的执行错误', (psql(`select coalesce(execution_error, '') from confirmation_requests`
    + ` where token = '${writerTokenId}'`) || '').slice(0, 240));
  check('有码调用方批准后执行', 'executed', writerOutcome.status);
  createdProductId = psql(`select id from ${PRODUCT} where no = '${noOf('created')}' order by id desc limit 1`);
  check('有码调用方那一行落地', true, createdProductId !== '');
  if (createdProductId) {
    check('新行的属主 = 调用方', String(writer.id),
      psql(`select owner_user_id from ${PRODUCT} where id = ${createdProductId}`));
    check('新行的租户 = 本租户', TENANT,
      psql(`select tenant_id from ${PRODUCT} where id = ${createdProductId}`));
    check('新行的分类 = 文字里写的分类', categoryId,
      psql(`select category_id from ${PRODUCT} where id = ${createdProductId}`));
    // `price` 是 `numeric(24,6)`，文本形状带六位小数；比数值，不比字面。
    // `price` is `numeric(24,6)`, whose text form carries six decimals; compare the number, not the text.
    check('新行的价格 = 文字里写的价格', String(CREATED_PRICE),
      String(Number(psql(`select price from ${PRODUCT} where id = ${createdProductId}`))));
    // `unit` 不是必填，工具**不替调用方编**一个：落库是实体基本类型的 0。
    // `unit` is not required and the tool does not invent one: it lands as the entity's primitive 0.
    check('新行的单位 = 未给时的 0', '0',
      psql(`select unit from ${PRODUCT} where id = ${createdProductId}`));
    // 集成面：一行**工具建出来**的产品，模块自己的端点必须读得回来。创建走的是工具路径（没有登录用户），
    // 故这一条同时看详情与分页 —— 上一批的教训是「集成问题到合并才发现」。
    // The integration face: a row the **tool** created must be readable back through the module's own
    // endpoints. Create runs on the tool path (no login user), so both the detail and the page are read —
    // the previous batch's lesson being that integration problems only surfaced at merge.
    const createdDetail = await api(`/crm/product/get?id=${createdProductId}`, { token: admin });
    check('模块自己的详情端点读得到工具建的产品', 0, createdDetail.code);
    const createdPage = await api(`/crm/product/page?pageSize=100&name=${encodeURIComponent(createdName)}`, { token: admin });
    check('模块自己的分页里看得到工具建的产品', true,
      ((((createdPage || {}).data || {}).list) || []).map((row) => String(row.id)).includes(String(createdProductId)));
  } else {
    bad('新行的属主 = 调用方', String(writer.id), '<no row>');
    bad('新行的租户 = 本租户', TENANT, '<no row>');
    bad('新行的分类 = 文字里写的分类', categoryId, '<no row>');
    bad('新行的价格 = 文字里写的价格', String(CREATED_PRICE), '<no row>');
    bad('新行的单位 = 未给时的 0', '0', '<no row>');
    bad('模块自己的详情端点读得到工具建的产品', 0, '<no row>');
    bad('模块自己的分页里看得到工具建的产品', true, '<no row>');
  }
}

// ── 5) 场景 4 · 越权写被拒；参与方可读但不可写（D3 丙） ───────────────────────────────────────────
console.log('== 场景 4 · 越权写 / 参与方不可写 ==');
{
  // 更新 VO 把 name / no / price / status / categoryId / ownerUserId 都声明为必填；`@Valid` 在方法体之前跑，
  // 故请求体必须给齐（更新路径随后自己把属主清掉、不修改负责人）。`name` 用来断「有没有改到」：
  // 模块的 `updateById` 忽略 null 字段，故一个被放行的写会把 name 写进去。
  //
  // The save VO declares name/no/price/status/categoryId/ownerUserId required; `@Valid` runs before the
  // method body, so the request must carry them (the update then nulls the owner itself). `name` is the
  // witness of "did it change": `updateById` skips null fields, so an allowed write stores it.
  const body = (id, name, no, price) => ({
    id: Number(id), name, no, price, status: 1, categoryId: Number(categoryId), ownerUserId: Number(second.id)
  });
  const updateAs = (token, id, name, no, price) =>
    api('/crm/product/update', { method: 'PUT', token, body: body(id, name, no, price) });
  const nameOf = (id) => psql(`select name from ${PRODUCT} where id = ${id}`);

  // B 改 A 的产品：B 有 `crm:product:update` 这条码（故越过了 @PreAuthorize），但没有 A 那一份的
  // 任何权限行 —— 拒绝来自模块自己的数据权限切面。
  // B writes A's product: B holds `crm:product:update` (so it passes @PreAuthorize) but has no permission
  // row for A's row — the refusal comes from the module's own data-permission aspect.
  const bHijack = await updateAs(secondToken, idA, `${marker}-hijack-b`, noOf('a'), FIXTURE_PRICE);
  check('B 改 A 的产品被拒（信封 code 非 0）', true, bHijack.code !== 0);
  note('B 改 A 的拒绝读数', JSON.stringify({ code: bHijack.code, msg: bHijack.msg }).slice(0, 160));
  check('A 的产品未被 B 改', pageA, nameOf(idA));

  // 参与方改 A 的产品：模块自己的接缝只要求 WRITE（W 有），本治理切面只认 OWNER（W 不是）——
  // 这正是「比模块更严」的那一处。
  // A participant writes A's product: the module's own seam asks only WRITE (W has it), while this
  // governance advice asks only OWNER (W is not) — exactly the "stricter than the module" point.
  const wHijack = await updateAs(writerToken, idA, `${marker}-hijack-w`, noOf('a'), FIXTURE_PRICE);
  check('参与方改 A 的产品被拒（信封 code 非 0）', true, wHijack.code !== 0);
  note('参与方改 A 的拒绝读数', JSON.stringify({ code: wHijack.code, msg: wHijack.msg }).slice(0, 160));
  check('A 的产品未被参与方改', pageA, nameOf(idA));

  // 正对照：B 改**自己**那一件。属主 = 调用方，模块与本切面都放行；没有它，上面两条拒绝也可能只是
  // 「更新这条路径整个坏了」。
  // The positive control: B writes **its own** row. Owner = caller, so the module and this advice both
  // allow it; without it, the two refusals above could just mean "update is broken entirely".
  const renamed = `${marker}-page-b2`;
  const bOwn = await updateAs(secondToken, idB, renamed, noOf('b'), FIXTURE_PRICE + 10);
  check('B 改自己的产品成功', 0, bOwn.code);
  check('B 自己的产品确实改了', renamed, nameOf(idB));
}

// ── 6) 场景 5 · 副作用台账（best-effort）与审计链 ──────────────────────────────────────────────────
console.log('== 场景 5 · 台账与审计链 ==');
{
  // **best-effort，照实声明**：这一条断言的是「一次已执行的写留下了可审计的副作用行」。它**不是**
  // 可撤销性的保证 —— 撤销能力取决于该工具的补偿器与业务事实，不取决于本行存在。
  //
  // **Best-effort, declared as such**: this asserts that an executed write left an auditable effect
  // row. It is **not** a guarantee of revocability — that depends on the tool's compensator and the
  // business fact, not on this row existing.
  const effect = psql(`select coalesce(user_id, '') || '|' || tool_name || '|' || result_type`
    + ` from side_effects where tool_name = 'create_crm_product' and result_type = 'crm_product'`
    + ` order by id desc limit 1`);
  check('副作用台账记下这次写（best-effort）', `${writer.id}|create_crm_product|crm_product`, effect);

  check('有码那次执行在审计轨以本人身份在案', true, Number(psql(`select count(*) from ai_audit_logs`
    + ` where tool = 'create_crm_product' and outcome = 'executed' and user_id = '${writer.id}'`)) > 0);

  // 宿主操作日志按**产品名称**找（本轮唯一）；没有名字就没有可点名的对象，空串去 `like '%%'` 会匹配任意一行。
  // The host operate log is located by the **product name** (unique to this run); with no name there is
  // nothing to name, and an empty `like '%%'` matches any row, which would be a false green.
  if (createdProductId) {
    check('宿主操作日志记下了调用方', String(writer.id), await hostLoggedWho(createdName));
  } else {
    bad('宿主操作日志记下了调用方', String(writer.id), '<no row to name>');
  }

  const rows = Number(psql('select count(*) from ai_audit_logs'));
  check('审计行在（>0）', true, rows > 0);
  const verify = await (await fetch(`${HOST}/audit/verify`, { headers: { Authorization: `Bearer ${admin}` } })).json();
  check('链校验通过', true, verify.data && verify.data.valid);
}

// ── 收尾 ─────────────────────────────────────────────────────────────────────────────────────────
console.log('== 收尾 · 把本轮造的行收回去 ==');
try {
  runPutBack();
  ok('本轮那几行已收回（审计行刻意留着）');
} catch (e) {
  bad('收尾', '本轮那几行已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
