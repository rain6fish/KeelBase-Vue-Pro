#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// M1 CRM「钱」那一类的第三条：**回款计划**的场景门，在真栈上取读数。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-crm-receivable-plan-scenarios.mjs
//
// 回款计划与回款、合同同形：行范围在模块自己的 `crm_permission` 表里。本门禁断言四条验收 + 回款计划特有的三条：
//
//   1. 在**显式身份**下可达：调用方驱动 AI 读工具，审计轨记下的是**这位调用方**；
//   2. 越权被拒：无权限行的调用方读不到别人的计划，也改不了；
//   3. 高危写被扣下、经人批准后才落库（`create_crm_receivable_plan`，R3）；
//   4. 副作用台账可审计 —— **best-effort**：它记下「这次写发生过」，**不是**可撤销性的保证；
//   5. 分页「不传场景 ≠ 全部行」；
//   6. 参与方可读但不可写（D3 丙 读宽写严）；
//   7. **按谁的权限行判**：计划按**它自己的**权限行判，不按客户、也不按合同 —— 「这个客户有哪些计划」那一条
//      是唯一的例外，上游按**客户**判（`@CrmPermission(CRM_CUSTOMER, …)`）。本门禁把两种调用方都种出来：
//      能读客户、却没有计划权限行的 B，按 id 与计划分页都读不到 A 的计划，可**从客户那一页**看得到它（上游
//      就是这么写的）；没有客户权限行的 W 从客户那一页也读不到。**声明范围**：这不是缺陷，是切面注释里写明的
//      口径；门禁把它原样断出来，免得下一轮把「按客户判」误当成「按计划判」。
//
// **第 5、6 条为什么从模块自己的分页/读端点断。** 运行时不上线工具的结果（冻结的 `chat-response` 只有
// `reply`/`toolCalls`），故「页里有没有这一行」只能从模块自己的端点读；而该端点与工具走的是**同一个**被切的
// 服务方法。工具路径**总是**显式给场景（默认「我负责的」），故「没给场景」这个洞在工具路径上不会出现；本门禁
// 断的是**两条路径共用的那条接缝**：一个非管理员调用方不带场景地调分页，切面把 null 补成「我负责的」，于是他
// 看不到别人的行。这是本门禁对第 5 条的**声明范围**，不夸大。
//
// **第 3 条的驱动方式。** `/ai/chat` 只有一个结构化槽（`targetId`），而回款计划的 create route **刻意**不把它
// 当作合同编号（那个槽讲的是「目标」，硬填是猜）。所以这条路由从用户**明确写出的文字**里读三个必填项：
// `合同=<id> 金额=<金额> 日期=<yyyy-MM-dd>`。这不是猜——是用户写下的值；而三个值缺一个，这笔计划就登记不了。
//
// **触发词不再撞车（2026-11-02 起）。** `CrmReceivableTools` 的触发词是 `登记回款`/`列出回款` 等短词，本对象的
// 短语已改成不包含它们的写法（`列出所有回款计划` / `录入回款计划` 等）。门禁仍断言**工具名**
// （`create_crm_receivable_plan` / `list_crm_receivable_plans`）：若以后有谁的词表把另一条路由排到前面，
// 这里会当场读成红，而不是悄悄量到另一个对象。
//
// 每条断言都用**本次唯一**的标记收束，不按整表计数；它造的东西（客户、合同、计划、权限行、副作用、确认单、
// 写占位）都按该标记收回。**审计行刻意不动**：那是一条哈希链，剪断一环比凌乱更坏。
//
// M1, CRM receivable plans: the scenario gate that takes readings on a real stack.
//
// Plans share the receivable and contract shape — the row range lives in the module's own `crm_permission`
// table. This gate asserts the four acceptance readings plus three plan-specific ones: reachable under an
// explicit identity; out-of-scope reads and writes refused; the high-risk create held for a human and landed
// only after approval; the side-effect ledger auditable (**best-effort**); a page with no scene is not every
// row; a participant may read but not write (D3); and **whose permission rows judge a plan** — its own, not
// the customer's and not the contract's, with "which plans does this customer have" as the single exception
// upstream judges by the **customer**. Both callers are seeded: B, who may read the customer but holds no
// plan row, cannot read A's plan by id or on the plan page yet does see it through the customer page — which
// is exactly how upstream writes it. **Declared scope**: that is the documented口径, not a defect, and the
// gate asserts it so the next round does not read "judged by the customer" into "judged by the plan".
//
// **Why 5 and 6 read the module's own page/row endpoints.** The runtime does not put tool results on the
// wire, so "is that row on the page" is read from the module's endpoint — the **same** advised service
// method the tool crosses. The tool path always names a scene, so the null-scene hole never arises there;
// what this gate asserts is the **seam both paths share**: a non-administrator calling the page with no
// scene gets it filled to "mine" and does not see another caller's rows.
//
// **How reading 3 is driven.** `/ai/chat` carries one structured slot (`targetId`), and the plan create
// route deliberately does **not** read it as a contract id. It reads the three required values from what
// the user explicitly typed — `合同=<id> 金额=<amount> 日期=<yyyy-MM-dd>` — and a plan cannot be registered
// without all three.
//
// **The trigger collision, known before the run.** `CrmReceivableTools` carries the **short** triggers
// (`登记回款`, `列出回款`), this object's are the long ones, and the long ones **contain** the short ones
// while routes are taken in declaration order with `contains`. The gate therefore asserts the **tool name**:
// if some assembly order puts the receivable route first, this reads red on the spot instead of quietly
// measuring a different object.
//
// Every assertion is scoped by a **name unique to this run**; everything it creates is removed again by that
// marker. The audit rows are deliberately left alone.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48101';
const PG = process.env.PG_CONTAINER || 'crmrplan-1031-pg';
const DB = process.env.PG_DB || 'crm_rplan_gate';
const TENANT = process.env.TENANT_ID || '1';
const SECOND_USER = process.env.RPLAN_SECOND_USER || 'gaterplan2';
const SECOND_PASS = process.env.RPLAN_SECOND_PASS || 'gate-pass-1234';
const WRITER_USER = process.env.RPLAN_WRITER_USER || 'gaterplanw';
const WRITER_PASS = process.env.RPLAN_WRITER_PASS || 'gate-pass-1234';
const PLAN = 'crm_receivable_plan';
const CONTRACT = 'crm_contract';
const CUSTOMER = 'crm_customer';
const PERMISSION = 'crm_permission';
const BIZ_TYPE_CUSTOMER = 2; // CrmBizTypeEnum.CRM_CUSTOMER
const BIZ_TYPE_RECEIVABLE_PLAN = 8; // CrmBizTypeEnum.CRM_RECEIVABLE_PLAN
const LEVEL_OWNER = 1; // CrmPermissionLevelEnum.OWNER
const LEVEL_READ = 2; // CrmPermissionLevelEnum.READ
const LEVEL_WRITE = 3; // CrmPermissionLevelEnum.WRITE
const AUDIT_APPROVE = 20; // CrmAuditStatusEnum.APPROVE

// 两次写的金额刻意互不相同，故「有没有落地」不必看属主（无码调用方自己就有一行夹具）。
// The two writes carry distinct amounts, so "did it land" never has to look at the owner (the no-code
// caller owns one fixture row of its own).
const FIXTURE_PRICE = 10;
const DENIED_PRICE = 100;
const CREATED_PRICE = 200;
const UPDATED_PRICE = 11;

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
    body: JSON.stringify({ message, conversationId: `gate-rplan-${Date.now()}`, ...extra })
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

// 计划的 args 里**没有**门禁标记（三个必填项都是数字/日期），故按「本轮之后、这个调用方、这个工具」
// 定位，而不是按标记搜 `args_json`。
// The plan args carry **no** gate marker (the three required values are numbers and a date), so the row is
// located by "after this run started, this caller, this tool" rather than by a marker in `args_json`.
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
      body: { name, code, sort: 99, status: 0, remark: 'receivable-plan gate: the codes this scenario needs' }
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
// 计划的创建日志模板按**期数**定位（本轮该合同的期数唯一）；模板里的合同名会走合同
// 治理切面，而调用方不是那份合同的负责人 ⇒ 名字读成空串，期数不受影响。
//
// Who: the row the host logged for this write must name the caller. It is written **asynchronously**, so
// poll with a deadline (30s by default; `SCENARIO_OPERATE_LOG_TIMEOUT_MS` overrides) and carry the
// evidence in the reading. The plan template is located by its **period** (unique for this contract in
// this run); its contract name crosses the contract governance advice and renders empty for a non-owner
// caller, while the period does not.
const OPERATE_LOG_WAIT_MS = Number(process.env.SCENARIO_OPERATE_LOG_TIMEOUT_MS || 30000) || 30000;
async function hostLoggedWho(period) {
  const filter = `type = 'CRM 回款计划' and action like '%第【${period}】期回款计划%'`;
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
// B：只有查/改的权限码，且**没有**任何计划的权限行 —— 越权那半要的正是「有码、但没有这一行」。
//    它**有**本客户的一行 READ（第 7 条要它：能读客户，仍读不到计划）。
// W：多一个创建码，并且会被种成 A 那一份的**参与方**（WRITE）——「可读不可写」那半要的正是这个；
//    它**没有**客户权限行（第 7 条要它：从客户那一页也读不到）。
//
// B: read/update codes only, **no** permission row on any plan — the cross-scope half needs "has the code,
// does not own the row". B **does** hold a READ row on this customer (reading 7 needs it: may read the
// customer, still cannot read the plan). W: additionally the create code, seeded as a **participant**
// (WRITE) on A's plan, and with **no** customer row (reading 7 needs it: the customer page refuses too).
let second; let secondToken;
let writer; let writerToken;
try {
  const commonRole = psql(`select id from system_role where code = 'common' and deleted = 0 limit 1`);
  const readerRole = await ensureRole(admin, 'gate_rplan_reader', 'gate-rplan-reader',
    ['crm:receivable-plan:query', 'crm:receivable-plan:update']);
  const writerRole = await ensureRole(admin, 'gate_rplan_writer', 'gate-rplan-writer',
    ['crm:receivable-plan:query', 'crm:receivable-plan:create', 'crm:receivable-plan:update']);
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

// ── 1) 夹具：客户、一份合同、两条计划、四条权限行 ─────────────────────────────────────────────────
console.log('== 夹具 ==');
const marker = `gate-rplan-${Date.now()}`;
const customerName = `${marker}-customer`;
const contractName = `${marker}-contract`;
const adminRemark = `${marker}-original`;
putBack = () => psql([
  // 被**拒绝**的创建会留下一个没有效应的认领，而「按效应收」够不到它；已执行那次的认领则指向一条效应。
  // A refused create leaves a claim with no effect; an executed one has a claim pointing at an effect.
  `delete from write_claims where user_id in ('${second.id}', '${writer.id}') and tool_name = 'create_crm_receivable_plan' and effect_id is null`,
  `delete from write_claims where effect_id in (select id from side_effects where result_type = 'crm_receivable_plan'`
    + ` and result_id in (select id::text from ${PLAN} where contract_id in`
    + ` (select id from ${CONTRACT} where name like '${marker}%')))`,
  `delete from side_effects where result_type = 'crm_receivable_plan' and result_id in`
    + ` (select id::text from ${PLAN} where contract_id in (select id from ${CONTRACT} where name like '${marker}%'))`,
  // 计划的 args 两个形状（数字或字符串）都要够到；合同编号本轮唯一，故这就是本轮的范围。
  // Catch both argument shapes (number or string); the contract id is unique to this run, so that is
  // this run's scope.
  `delete from confirmation_requests where tool_name = 'create_crm_receivable_plan' and args_json like '%'`
    + ` || (select id::text from ${CONTRACT} where name like '${marker}%' limit 1) || '%'`,
  `delete from ${PERMISSION} where biz_type = ${BIZ_TYPE_RECEIVABLE_PLAN} and biz_id in`
    + ` (select id from ${PLAN} where contract_id in (select id from ${CONTRACT} where name like '${marker}%'))`,
  `delete from ${PERMISSION} where biz_type = ${BIZ_TYPE_CUSTOMER} and biz_id in`
    + ` (select id from ${CUSTOMER} where name = '${customerName}')`,
  `delete from ${PLAN} where contract_id in (select id from ${CONTRACT} where name like '${marker}%')`,
  `delete from ${CONTRACT} where name like '${marker}%'`,
  `delete from ${CUSTOMER} where name = '${customerName}'`,
].join('; '));

// `tenant_id` 不是可选的：租户拦截器给这些表加 `tenant_id = ?`，不带它的行经模块的每条路都看不见。
// `tenant_id` is not optional: the tenant interceptor appends `tenant_id = ?` to these tables, and a row
// without it is invisible to every path through the module.
psql(`insert into ${CUSTOMER}(id, name, owner_user_id, tenant_id, creator, updater)`
  + ` values (nextval('${CUSTOMER}_seq'), '${customerName}', 1, ${TENANT}, '1', '1')`);
const customerId = psql(`select id from ${CUSTOMER} where name = '${customerName}'`);
check('客户已种', true, customerId !== '');

// `creator` 写成数字字符串：分页与详情会把它当用户 id 解析（`NumberUtils.parseLong`）。合同的审批状态取**已审批**，
// 与生产里能挂计划的合同同形（回款创建会校验它；计划创建只校验合同存在，这里也不依赖审批）。
// `creator` is a numeric string: the page and detail parse it as a user id. The contract is seeded
// **approved**, the shape a contract carrying plans has in production (receivable creation checks it; plan
// creation only checks existence, and nothing here depends on the approval).
psql(`insert into ${CONTRACT}(id, name, customer_id, owner_user_id, audit_status, total_price, tenant_id, creator, updater)`
  + ` values (nextval('${CONTRACT}_seq'), '${contractName}', ${customerId}, 1, ${AUDIT_APPROVE}, 1000000, ${TENANT}, '1', '1')`);
const contractId = psql(`select id from ${CONTRACT} where name = '${contractName}'`);
check('合同已种', true, contractId !== '');

const insertPlan = (period, owner, remark) =>
  psql(`insert into ${PLAN}(id, period, customer_id, contract_id, owner_user_id, return_time, price, remark, tenant_id, creator, updater)`
    + ` values (nextval('${PLAN}_seq'), ${period}, ${customerId}, ${contractId}, ${owner}, now(), ${FIXTURE_PRICE},`
    + ` '${remark}', ${TENANT}, '${owner}', '1')`);
insertPlan(1, 1, adminRemark);
insertPlan(2, second.id, `${marker}-second-original`);
const adminPlanId = psql(`select id from ${PLAN} where contract_id = ${contractId} and period = 1`);
const secondPlanId = psql(`select id from ${PLAN} where contract_id = ${contractId} and period = 2`);
check('管理员那一份已种', true, adminPlanId !== '');
check('第二个调用方那一份已种', true, secondPlanId !== '');

// 负责人行：模块自己创建计划时也会写，这里手写是因为夹具直接插表。
// Owner rows: the module writes these on create; they are written by hand here because the fixture
// inserts straight into the table.
const insertPermission = (bizType, bizId, userId, level) =>
  psql(`insert into ${PERMISSION}(id, biz_type, biz_id, user_id, level, tenant_id)`
    + ` values (nextval('${PERMISSION}_seq'), ${bizType}, ${bizId}, ${userId}, ${level}, ${TENANT})`);
insertPermission(BIZ_TYPE_RECEIVABLE_PLAN, adminPlanId, 1, LEVEL_OWNER);
insertPermission(BIZ_TYPE_RECEIVABLE_PLAN, secondPlanId, second.id, LEVEL_OWNER);
// W 是 A 那一份的**参与方**（读写、非负责人）——「参与方可读但不可写（D3 丙）」的夹具。
// W is a **participant** (write, not owner) on A's plan — the fixture for "participants may read,
// may not write" (D3).
insertPermission(BIZ_TYPE_RECEIVABLE_PLAN, adminPlanId, writer.id, LEVEL_WRITE);
// 客户上有一行**负责人**（管理员）：没有它，这个客户在模块眼里就是「有行却没有负责人」的孤儿，谁都能读 ——
// 那样 W 的「读不到」就断不成立（夹具的错，不是对象的）。B 再拿一行 READ —— 第 7 条的对照：能读客户，
// 仍读不到计划；客户那一页则看得到。
// The customer gets an **owner** row (the administrator): without it the module reads this customer as
// "rows exist but no owner" — an orphan anyone may read — and W's "cannot read" would not hold (a fixture
// fault, not the object's). B additionally holds a READ row — reading 7's contrast: may read the customer,
// still cannot read the plan, while the customer page does show it.
insertPermission(BIZ_TYPE_CUSTOMER, customerId, 1, LEVEL_OWNER);
insertPermission(BIZ_TYPE_CUSTOMER, customerId, second.id, LEVEL_READ);
check('五条权限行已种（计划 A/B 各一行负责人、A 一行参与方、客户一行负责人与一行 READ）', 5,
  Number(psql(`select count(*) from ${PERMISSION}`
    + ` where (biz_type = ${BIZ_TYPE_RECEIVABLE_PLAN} and biz_id in (${adminPlanId}, ${secondPlanId}))`
    + ` or (biz_type = ${BIZ_TYPE_CUSTOMER} and biz_id = ${customerId})`)));

// ── 2) 场景 1 · 显式身份下可达 ─────────────────────────────────────────────────────────────────────
console.log('== 场景 1 · 显式身份下可达 ==');
{
  const a = await chat(admin, '列出所有回款计划');
  // 短语不再包含回款面的 `列出回款`；仍断工具名，确认读到的是本对象这条路由。
  // Trigger collision: the long phrase contains the short one. Asserting the tool name is what makes this
  // reading come from this object's route.
  check('管理员触发计划读工具', 'list_crm_receivable_plans', (a.toolCalls || [])[0]);
  check('管理员那次以本人身份在案', '1', psql(`select user_id from ai_audit_logs`
    + ` where tool = 'list_crm_receivable_plans' and outcome = 'executed' order by id desc limit 1`));

  const s = await chat(secondToken, '列出所有回款计划');
  check('第二个调用方触发同一个工具', 'list_crm_receivable_plans', (s.toolCalls || [])[0]);
  // 「身份」不是听答案说的：审计行的 `user_id` 必须是他本人。工具路径跑在请求的安全过滤器链之外，
  // 这个值只能来自运行时发布的调用方。
  // "Identity" is not what the answer says: the audit row's `user_id` must be the caller. The tool path
  // runs outside the request's security filter chain, so that value can only come from the runtime.
  check('第二个调用方那次以本人身份在案', String(second.id), psql(`select user_id from ai_audit_logs`
    + ` where tool = 'list_crm_receivable_plans' and outcome = 'executed' order by id desc limit 1`));
  check('两次读都真跑了（审计轨）', 2, Number(psql("select count(*) from ai_audit_logs"
    + " where tool = 'list_crm_receivable_plans' and outcome = 'executed'")));
}

// ── 3) 场景 2 · 越权读被拒；分页「不传场景 ≠ 全部行」；参与方可读 ─────────────────────────────────
console.log('== 场景 2 · 越权读 / 分页不传场景 / 参与方可读 ==');
{
  const getAs = (token, id) => api(`/crm/receivable-plan/get?id=${id}`, { token });
  const pageOf = (token, query = '') =>
    api(`/crm/receivable-plan/page?pageSize=100&contractId=${contractId}${query}`, { token });
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
  const bGetsA = await getAs(secondToken, adminPlanId);
  note('B 取 A 的计划读数', JSON.stringify({ code: bGetsA.code, msg: bGetsA.msg, data: bGetsA.data == null ? null : '<row>' }).slice(0, 160));
  check('B 取 A 的计划：读不到', 'not readable',
    bGetsA.code !== 0 || bGetsA.data == null ? 'not readable' : 'row');
  const bGetsOwn = await getAs(secondToken, secondPlanId);
  check('B 取自己的计划：读得到', String(secondPlanId), String(bGetsOwn.data?.id));

  // 分页：**不传场景**。切面把 null 补成「我负责的」，故 B 的页里没有 A 那一行，但有自己的那一行 ——
  // 两条都要断：只断前者，一处根本没种 A 的夹具也会绿；只断后者，收窄被删掉也绿。
  // 豁免调用方（种子管理员）不补场景，故它看到的是模块自己的「全部」：同一个合同的两条。
  //
  // The page **with no scene**. The advice fills null with "mine", so B's page has none of A's row but does
  // have B's own — both halves are required. The exempt caller (seed administrator) gets no scene supplied,
  // so it reads the module's own "all": both plans on the contract.
  const adminPage = await pageOf(admin);
  check('豁免调用方的分页取到了', 0, adminPage.code);
  check('豁免调用方：不传场景就是模块的全部', 2, adminPage.data?.total);
  const bPage = await pageOf(secondToken);
  check('B 的分页取到了', 0, bPage.code);
  check('B 的页里没有 A 的计划（不传场景 ≠ 全部行）', false, idsOn(bPage).includes(String(adminPlanId)));
  check('B 的页里有自己的计划（页不是空着蒙对的）', true, idsOn(bPage).includes(String(secondPlanId)));
  check('B 的页 total 也按场景算', 1, bPage.data?.total);

  // 参与方可读：W 在 A 那一份上是 WRITE，故「我参与的」页里有它，按 id 也读得到；而**不传场景**时
  // 切面补的是「我负责的」，W 不是负责人 ⇒ 页里没有它。
  // A participant may read: W holds WRITE on A's plan, so it is on the "involved" page and reads by id;
  // with **no scene** the advice fills "mine", and W is not the owner ⇒ not on that page.
  const wInvolved = await pageOf(writerToken, '&sceneType=2');
  check('参与方的“我参与的”页取到了', 0, wInvolved.code);
  check('参与方的“我参与的”页里有 A 的计划', true, idsOn(wInvolved).includes(String(adminPlanId)));
  const wGetsA = await getAs(writerToken, adminPlanId);
  check('参与方按 id 读得到 A 的计划', String(adminPlanId), String(wGetsA.data?.id));
  const wOwnerPage = await pageOf(writerToken);
  check('参与方不传场景时页里没有 A（补的是“我负责的”）', false, idsOn(wOwnerPage).includes(String(adminPlanId)));
}

// ── 4) 场景 3 · 高危写：扣下、批准、落库（以及无码被拒） ───────────────────────────────────────────
console.log('== 场景 3 · 高危写被扣下、批准后落库 ==');
// 三个必填项都用**明确写出来的值**：路由从文字里读它们，而不是从 `targetId` 猜合同。
// The three required values are written **explicitly**: the route reads them from the text rather than
// guessing a contract out of `targetId`.
const asked = (price, date) => `录入回款计划 合同=${contractId} 金额=${price} 日期=${date}`;
let createdPlanId = '';
let createdPeriod = '';
{
  const deniedBaseline = maxConfirmationId();
  // 无码调用方：引擎照旧扣下，批准后拒绝它的是工具自己的权限判据。
  // The no-code caller: the engine still holds it, and after approval the tool's own permission judgement
  // refuses it.
  const deniedHeld = pendingCount(second.id);
  const deniedAnswer = await chat(secondToken, asked(DENIED_PRICE, '2027-02-01'));
  // 被拒**也要读得懂**：路由没填齐必填项时，引擎在任何确认行存在之前就答 `invalid_arguments`。
  // A red must be legible: when the route does not fill the required arguments, the engine answers
  // `invalid_arguments` before any confirmation row exists.
  note('无码调用方的写读数', JSON.stringify({ toolCalls: deniedAnswer.toolCalls, reply: String(deniedAnswer.reply || '').slice(0, 160) }).slice(0, 260));
  check('无码调用方的写落在计划工具上（触发词不撞车）', 'create_crm_receivable_plan', (deniedAnswer.toolCalls || [])[0]);
  check('无码调用方的写被扣下', deniedHeld + 1, pendingCount(second.id));
  const deniedToken = pendingTokenForTool(second.id, 'create_crm_receivable_plan', deniedBaseline);
  checkNot('扣下时给出 token', 'undefined', deniedToken);
  note('无码那次扣下时的参数', (psql(`select args_json from confirmation_requests`
    + ` where token = '${deniedToken}'`) || '').slice(0, 260));
  const deniedOutcome = await confirm(secondToken, deniedToken, 'approve');
  check('批准后仍不执行（受治理失败）', true, deniedOutcome.status !== 'executed');
  check('失败理由点名 crm:receivable-plan:create', true,
    psql(`select coalesce(execution_error, '') from confirmation_requests where token = '${deniedToken}'`)
      .includes('crm:receivable-plan:create'));
  check('无码调用方一行未落库', 0,
    Number(psql(`select count(*) from ${PLAN} where contract_id = ${contractId} and price = ${DENIED_PRICE}`)));
  check('无码那次的失败在审计轨', true, Number(psql(`select count(*) from ai_audit_logs`
    + ` where tool = 'create_crm_receivable_plan' and outcome = 'failed' and detail like '%crm:receivable-plan:create%'`)) > 0);

  // 有码调用方：同一个工具，持有所需的那条码。
  // The code-holding caller: the same tool, with the code it asks for.
  const writerBaseline = maxConfirmationId();
  const writerHeld = pendingCount(writer.id);
  const writerAnswer = await chat(writerToken, asked(CREATED_PRICE, '2027-03-01'));
  note('有码调用方的写读数', JSON.stringify({ toolCalls: writerAnswer.toolCalls, reply: String(writerAnswer.reply || '').slice(0, 160) }).slice(0, 260));
  check('有码调用方的写落在计划工具上', 'create_crm_receivable_plan', (writerAnswer.toolCalls || [])[0]);
  check('有码调用方的写被扣下', writerHeld + 1, pendingCount(writer.id));
  const writerTokenId = pendingTokenForTool(writer.id, 'create_crm_receivable_plan', writerBaseline);
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
  createdPlanId = psql(`select id from ${PLAN} where contract_id = ${contractId}`
    + ` and price = ${CREATED_PRICE} order by id desc limit 1`);
  check('有码调用方那一行落地', true, createdPlanId !== '');
  if (createdPlanId) {
    check('新行的属主 = 调用方', String(writer.id),
      psql(`select owner_user_id from ${PLAN} where id = ${createdPlanId}`));
    check('新行的租户 = 本租户', TENANT,
      psql(`select tenant_id from ${PLAN} where id = ${createdPlanId}`));
    // 客户不由工具填：模块自己从合同上读（`validateRelationDataExists`）。断它落到了同一份合同的客户上。
    // The customer is not filled by the tool: the module reads it off the contract. Assert it landed on that
    // contract's customer.
    check('新行的客户来自合同', customerId,
      psql(`select customer_id from ${PLAN} where id = ${createdPlanId}`));
    // `price` 是 `numeric(24,6)`，文本形状带六位小数；比数值，不比字面。
    // `price` is `numeric(24,6)`, whose text form carries six decimals; compare the number, not the text.
    check('新行的金额 = 文字里写的金额', String(CREATED_PRICE),
      String(Number(psql(`select price from ${PLAN} where id = ${createdPlanId}`))));
    // 期数由模块自己按合同算：本合同的既有期数是 1、2，故新行是第 3 期。
    // The period is computed by the module from the contract: the existing periods are 1 and 2, so the new
    // row is the third.
    createdPeriod = psql(`select period from ${PLAN} where id = ${createdPlanId}`);
    check('新行的期数按合同续上（第 3 期）', '3', createdPeriod);
    check('新行的计划日期 = 文字里写的日期', true,
      String(psql(`select return_time::date from ${PLAN} where id = ${createdPlanId}`)) === '2027-03-01');
    // 集成面：一行**工具建出来**的计划，模块自己的端点必须读得回来。`creator` 在工具路径上没有登录用户，
    // 框架的审计字段处理器盖不上；而模块的详情构建器把它当用户 id 解析（`Long.parseLong`），空值会让
    // `/page`、`/get`、`/page-by-customer` 一起 500。故这里同时断 `creator` 与三个端点。
    // The integration face: a row the **tool** created must be readable back through the module's own
    // endpoints. `creator` has no login user on the tool path, so the framework's audit-field handler cannot
    // fill it; the module's detail builder parses it as a user id (`Long.parseLong`), and NULL makes
    // `/page`, `/get` and `/page-by-customer` answer 500 together. Both the column and the endpoints are read.
    check('工具建的计划带调用方作为 creator（工具路径补盖）', String(writer.id),
      psql(`select coalesce(creator, '<null>') from ${PLAN} where id = ${createdPlanId}`));
    const createdDetail = await api(`/crm/receivable-plan/get?id=${createdPlanId}`, { token: admin });
    check('模块自己的详情端点读得到工具建的计划', 0, createdDetail.code);
    const createdPage = await api(`/crm/receivable-plan/page?pageSize=100&contractId=${contractId}`, { token: admin });
    check('模块自己的分页里看得到工具建的计划', true,
      ((((createdPage || {}).data || {}).list) || []).map((row) => String(row.id)).includes(String(createdPlanId)));
  } else {
    bad('新行的属主 = 调用方', String(writer.id), '<no row>');
    bad('新行的租户 = 本租户', TENANT, '<no row>');
    bad('新行的客户来自合同', customerId, '<no row>');
    bad('新行的金额 = 文字里写的金额', String(CREATED_PRICE), '<no row>');
    bad('新行的期数按合同续上（第 3 期）', '3', '<no row>');
    bad('新行的计划日期 = 文字里写的日期', '2027-03-01', '<no row>');
    bad('工具建的计划带调用方作为 creator（工具路径补盖）', String(writer.id), '<no row>');
    bad('模块自己的详情端点读得到工具建的计划', 0, '<no row>');
    bad('模块自己的分页里看得到工具建的计划', true, '<no row>');
  }
}

// ── 5) 场景 4 · 越权写被拒；参与方可读但不可写（D3 丙） ───────────────────────────────────────────
console.log('== 场景 4 · 越权写 / 参与方不可写 ==');
{
  // 更新 VO 把 contractId / ownerUserId / returnTime / price 都声明为必填；`@Valid` 在方法体之前跑，
  // 故请求体必须给齐（更新路径随后自己把属主/合同清掉、用库里旧值填回）。`returnTime` 走宿主的
  // timestamp-long 反序列化。用 `remark` 断「有没有改到」：模块的 `updateById` 忽略 null 字段，
  // 故一个被放行的写会把 remark 写进去。
  //
  // The save VO declares contractId/ownerUserId/returnTime/price required; `@Valid` runs before the method
  // body, so the request must carry them (the update then nulls owner/contract and refills from the stored
  // row). `returnTime` goes through the host's timestamp-long deserializer. `remark` is the witness of "did
  // it change": `updateById` skips null fields, so an allowed write stores it.
  const body = (id, remark) => ({
    id: Number(id), ownerUserId: Number(second.id), contractId: Number(contractId),
    price: UPDATED_PRICE, returnTime: Date.now(), remark
  });
  const updateAs = (token, id, remark) =>
    api('/crm/receivable-plan/update', { method: 'PUT', token, body: body(id, remark) });
  const remarkOf = (id) => psql(`select remark from ${PLAN} where id = ${id}`);

  // B 改 A 的计划：B 有 `crm:receivable-plan:update` 这条码（故越过了 @PreAuthorize），但没有 A 那一份的
  // 任何权限行 —— 拒绝来自模块自己的数据权限切面。
  // B writes A's plan: B holds `crm:receivable-plan:update` (so it passes @PreAuthorize) but has no
  // permission row for A's row — the refusal comes from the module's own data-permission aspect.
  const bHijack = await updateAs(secondToken, adminPlanId, `${marker}-hijack-b`);
  check('B 改 A 的计划被拒（信封 code 非 0）', true, bHijack.code !== 0);
  note('B 改 A 的拒绝读数', JSON.stringify({ code: bHijack.code, msg: bHijack.msg }).slice(0, 160));
  check('A 的计划未被 B 改', adminRemark, remarkOf(adminPlanId));

  // 参与方改 A 的计划：模块自己的接缝只要求 WRITE（W 有），本治理切面只认 OWNER（W 不是）——
  // 这正是「比模块更严」的那一处。
  // A participant writes A's plan: the module's own seam asks only WRITE (W has it), while this governance
  // advice asks only OWNER (W is not) — exactly the "stricter than the module" point.
  const wHijack = await updateAs(writerToken, adminPlanId, `${marker}-hijack-w`);
  check('参与方改 A 的计划被拒（信封 code 非 0）', true, wHijack.code !== 0);
  note('参与方改 A 的拒绝读数', JSON.stringify({ code: wHijack.code, msg: wHijack.msg }).slice(0, 160));
  check('A 的计划未被参与方改', adminRemark, remarkOf(adminPlanId));

  // 正对照：B 改**自己**那一行。属主 = 调用方，模块与本切面都放行；没有它，上面两条拒绝也可能只是
  // 「更新这条路径整个坏了」。
  // The positive control: B writes **its own** row. Owner = caller, so the module and this advice both
  // allow it; without it, the two refusals above could just mean "update is broken entirely".
  const secondRenamed = `${marker}-second-renamed`;
  const bOwn = await updateAs(secondToken, secondPlanId, secondRenamed);
  check('B 改自己的计划成功', 0, bOwn.code);
  check('B 自己的计划确实改了', secondRenamed, remarkOf(secondPlanId));
}

// ── 6) 场景 5 · 按谁的权限行判：计划自己的，不是客户 / 合同的 ─────────────────────────────────────
console.log('== 场景 5 · 按计划自己的权限行判（客户那一页是例外） ==');
{
  const byCustomerAs = (token) =>
    api(`/crm/receivable-plan/page-by-customer?pageSize=100&customerId=${customerId}`, { token });
  const idsOn = (answer) => (((answer || {}).data || {}).list || []).map((row) => String(row.id));

  // B 能读这个客户（一行 READ），却没有 A 计划的权限行：按 id 与计划分页都读不到（场景 2 已断）。
  // 而「这个客户有哪些计划」这条端点上游按**客户**权限判，故 B 从这里看得到 A 的计划 —— 这就是切面注释里
  // 写明的口径，本门禁原样断出来，免得下一轮把它误当成缺陷或误当成「按计划判」。
  //
  // B may read this customer (a READ row) but holds no permission row on A's plan: neither by id nor on the
  // plan page (asserted in scenario 2). The "which plans does this customer have" endpoint is judged
  // upstream by the **customer** row, so B does see A's plan there — the口径 the aspect comment declares,
  // asserted as it is so no later round reads it as a defect or as "judged by the plan".
  const bByCustomer = await byCustomerAs(secondToken);
  check('B 从客户那一页取到了', 0, bByCustomer.code);
  check('B 从客户那一页看得到 A 的计划（上游按客户判）', true, idsOn(bByCustomer).includes(String(adminPlanId)));

  // W 没有客户权限行：同一条端点也读不到 A 的计划。**形状是「空页」，不是错误** —— 切面把读不到的客户交回
  // `PageResult.empty()`，与「这个客户没有计划」同形（类注释里写明的口径）。本门禁断的是语义：看不到 A 的计划；
  // 拒（信封 code 非 0）与空页都算数，实际读数记下来，不把某一层的形状写死。
  //
  // W holds no customer row: the same endpoint cannot show A's plan either. The **shape is an empty page,
  // not an error** — the advice hands an unreadable customer back as `PageResult.empty()`, the same shape as
  // "this customer has no plans" (the口径 the class comment declares). The gate asserts the semantics — A's
  // plan is not visible; a refusal (non-zero envelope) and an empty page both count — and records the actual
  // reading rather than pinning one layer's shape.
  const wByCustomer = await byCustomerAs(writerToken);
  note('W 从客户那一页的读数', JSON.stringify({
    code: wByCustomer.code, rows: idsOn(wByCustomer).length, msg: String(wByCustomer.msg || '').slice(0, 80)
  }).slice(0, 160));
  check('W 从客户那一页看不到 A 的计划（拒或空页，同形）', true,
    wByCustomer.code !== 0 || !idsOn(wByCustomer).includes(String(adminPlanId)));
}

// ── 7) 场景 6 · 副作用台账（best-effort）与审计链 ──────────────────────────────────────────────────
console.log('== 场景 6 · 台账与审计链 ==');
{
  // **best-effort，照实声明**：这一条断言的是「一次已执行的写留下了可审计的副作用行」。它**不是**
  // 可撤销性的保证 —— 撤销能力取决于该工具的补偿器与业务事实，不取决于本行存在。
  //
  // **Best-effort, declared as such**: this asserts that an executed write left an auditable effect
  // row. It is **not** a guarantee of revocability — that depends on the tool's compensator and the
  // business fact, not on this row existing.
  const effect = psql(`select coalesce(user_id, '') || '|' || tool_name || '|' || result_type`
    + ` from side_effects where tool_name = 'create_crm_receivable_plan' and result_type = 'crm_receivable_plan'`
    + ` order by id desc limit 1`);
  check('副作用台账记下这次写（best-effort）',
    `${writer.id}|create_crm_receivable_plan|crm_receivable_plan`, effect);

  check('有码那次执行在审计轨以本人身份在案', true, Number(psql(`select count(*) from ai_audit_logs`
    + ` where tool = 'create_crm_receivable_plan' and outcome = 'executed' and user_id = '${writer.id}'`)) > 0);

  // 宿主操作日志按期数找（本轮该合同的期数唯一）；没有期数就没有可点名的对象。
  // The host operate log is located by the period (unique for this contract in this run); with no period
  // there is nothing to name.
  if (createdPeriod) {
    check('宿主操作日志记下了调用方', String(writer.id), await hostLoggedWho(createdPeriod));
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
