#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// M1 CRM「商机」那一类的场景门：在真栈上取读数。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-crm-business-scenarios.mjs
//
// 商机与合同、回款同形：行范围不在一个属主列里，而在模块自己的 `crm_permission` 表（负责人 + 参与方），
// 且带一个阶段流转的写（`CrmBusinessStatusService` 的状态组 / 状态）。本门禁断言四条验收 + 商机特有的三条：
//
//   1. 在**显式身份**下可达：调用方驱动 AI 读工具，审计轨记下的是**这位调用方**；
//   2. 越权被拒：无权限行的调用方读不到别人的商机，也改不了；
//   3. 高危写被扣下、经人批准后才落库（`create_crm_business`，R3）；
//   4. 副作用台账可审计 —— **best-effort**：它记下「这次写发生过」，**不是**可撤销性的保证；
//   5. 分页「不传场景 ≠ 全部行」；
//   6. 参与方可读、写只认负责人（D3 丙 读宽写严）；
//   7. 阶段流转：非负责人改阶段被拒、负责人改阶段能走通。**按切面的实际语义**断 ——
//      `CrmBusinessGovernance` 把 `updateBusinessStatus` 单独拿出来、**要求负责人（OWNER）**
//      （模块自己只要 `WRITE`），故这条门断的正是「比模块更严」的那一处，不改产品码。
//
// **第 5、6、7 条为什么从模块自己的端点断。** 运行时不上线工具的结果（冻结的 `chat-response` 只有
// `reply`/`toolCalls`），而工具面**只开了读与新建一条**（改 / 阶段流转都不在 AI 侧）；故这三条只能从模块
// 自己的分页 / 按 id 读 / 改状态端点读。它们与工具走**同一个**被切的服务方法（`getBusinessPage` /
// `getBusiness` 由本切面收窄，改状态由本切面要求负责人），故断的是**两条路径共用的那条接缝**。
// 对本门禁而言这是**声明范围**：第 5 条断的是「一个非管理员不带场景地调分页，切面把 null 补成我负责的、
// 于是他看不到别人的行」；第 7 条断的是「同一行上，WRITE 参与方被本切面拒、OWNER 被放行」。
//
// **第 3 条的驱动方式。** `/ai/chat` 只有一个结构化槽（`targetId`），而商机的 create route 把三个必填项
// 从用户**明确写出的文字**里读出来：`客户=<id> 状态组=<id> 名称=<名称>`。这不是猜——是用户写下的值；
// 缺一个，这笔商机就提交不了：路由缺项 ⇒ 引擎在**人批准之前**以 `invalid_arguments` 拒掉提议；
// 工具漏填 VO 必填字段 ⇒ 服务端 bean 校验在**人批准之后**拒绝。两者都是本线实测过的缺陷，故门禁按这个形状问。
//
// 每条断言都用**本次唯一**的标记收束，不按整表计数；它造的东西（客户、状态组与状态、商机、权限行、
// 副作用、确认单、写占位）都按该标记收回。**审计行刻意不动**：那是一条哈希链，剪断一环比凌乱更坏。
//
// M1's business class in CRM: the scenario gate that takes readings on a real stack.
//
// A business is money, shaped like a contract or a receivable: the row range lives in the module's own
// `crm_permission` table (owner plus participants), and it carries one stage-transition write
// (`CrmBusinessStatusService`, status group and status). This gate asserts the four acceptance readings
// plus the three business-specific ones: reachable under an explicit identity; out-of-scope reads and
// writes refused; the high-risk create held for a human and landed only after approval; the side-effect
// ledger auditable (**best-effort** — it records that the write happened, it is **not** a guarantee of
// revocability); a page with no scene is not every row; a participant may read but only the owner may
// write (D3: wide reads, strict writes); and the stage transition — refused for a non-owner, allowed for
// the owner — read from the advice's **actual** meaning: `CrmBusinessGovernance` handles
// `updateBusinessStatus` on its own and requires **OWNER** where the module itself asks only `WRITE`.
//
// **Why 5, 6 and 7 read the module's own endpoints.** The runtime does not put tool results on the wire
// (the frozen `chat-response` carries only `reply`/`toolCalls`), and the tool face opens **only** the
// read and one create (no update, no stage transition on the AI side). So these three are read from the
// module's page, read-by-id and update-status endpoints — which cross the **same** advised service
// methods the tool would. That is a declared scope: reading 5 says "a non-administrator calling the page
// with no scene gets it filled to mine and does not see another caller's rows"; reading 7 says "on the
// same row, a WRITE participant is refused by this advice and the OWNER is let through".
//
// **How reading 3 is driven.** `/ai/chat` carries one structured slot (`targetId`), and the business
// create route reads its three required values from what the caller **explicitly typed** —
// `客户=<id> 状态组=<id> 名称=<name>`. A missing one makes the creation unsubmittable: a route that cannot
// fill it is refused **before** a person is asked (`invalid_arguments`), and a tool that omits a required
// VO field is refused by bean validation **after** approval. Both are defects this line measured, so the
// gate asks in exactly this shape.
//
// Every assertion is scoped by a **name unique to this run**, never by a whole-table count; everything
// it creates (customer, status group and statuses, businesses, permission rows, effects, confirmations,
// write claims) is removed again by that marker. The audit rows are deliberately left alone: that is a
// hash chain, and cutting a link to tidy up is a worse act than the untidiness.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const SECOND_USER = process.env.BUSINESS_SECOND_USER || 'gatebusiness2';
const SECOND_PASS = process.env.BUSINESS_SECOND_PASS || 'gate-pass-1234';
const WRITER_USER = process.env.BUSINESS_WRITER_USER || 'gatebusinessw';
const WRITER_PASS = process.env.BUSINESS_WRITER_PASS || 'gate-pass-1234';
const BUSINESS = 'crm_business';
const CUSTOMER = 'crm_customer';
const PERMISSION = 'crm_permission';
const STATUS = 'crm_business_status';
const STATUS_TYPE = 'crm_business_status_type';
const BIZ_TYPE_BUSINESS = 4; // CrmBizTypeEnum.CRM_BUSINESS
const LEVEL_OWNER = 1; // CrmPermissionLevelEnum.OWNER
const LEVEL_WRITE = 3; // CrmPermissionLevelEnum.WRITE

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const checkNot = (name, forbidden, got) =>
  String(got).includes(forbidden) ? bad(name, `must not contain ${forbidden}`, got) : ok(name);
const note = (name, got) => console.log(`  note  ${name} → ${got}`);
// 拒绝的信封整个打出来：`code` 只说「拒了」，而**拒的是哪一层**（本切面 / 模块自己的数据权限切面 / 安全链）
// 要看 `errorCode` / `reason` / `nextStep`。这是读数的一部分、不作断言 —— 断言的是「拒了，且没写进去」。
//
// Print the whole refusal envelope: `code` only says "refused", while **which layer refused** (this
// advice / the module's own data-permission aspect / the security chain) shows in `errorCode`, `reason`
// and `nextStep`. It is part of the reading, not an assertion — the assertions are "refused" and "not
// written".
const refusal = (answer) => {
  const { data, ...rest } = answer || {};
  return JSON.stringify(rest).slice(0, 240);
};

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
    body: JSON.stringify({ message, conversationId: `gate-business-${Date.now()}`, ...extra })
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

// 商机的 args 里虽带名称（本轮唯一），但确认单的定位仍按「本轮之后、这个调用方、这个工具」——
// 与回款门同形，且不依赖 `args_json` 的序列化形状。
// The business args do carry this run's name, but the confirmation is still located by "after this run
// started, this caller, this tool" — the receivable gate's shape, independent of how `args_json` serializes.
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
      body: { name, code, sort: 99, status: 0, remark: 'business gate: the codes this scenario needs' }
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
// 故给它一小段窗口；窗口内该出现，始终没出现就是**失败**。按**商机名称**找（本轮唯一）。
//
// Who: the row the host logged for this write must name the caller. It is written **asynchronously**, so
// give it a short window; it must appear within it, and not appearing is a failure. Located by the
// **business name**, which is unique to this run.
async function hostLoggedWho(nameLike) {
  for (let i = 0; i < 12; i += 1) {
    const who = psql(`select coalesce(user_id::text, '<null>') from system_operate_log`
      + ` where type = 'CRM 商机' and action like '%${nameLike}%' order by id desc limit 1`);
    if (who) return who;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return '';
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
// B：只有查/改的权限码，且**没有**任何商机的权限行 —— 越权那半要的正是「有码、但没有这一行」。
// W：多一个创建码，并且会被种成 A 那一份的**参与方**（WRITE）——「可读不可写」「非负责人不能改阶段」两半要的正是这个。
//
// B: read/update codes only, and **no** permission row on any business — the cross-scope half needs
// "has the code, does not own the row". W: additionally the create code, and seeded as a **participant**
// (WRITE) on A's business — which is exactly what "may read, may not write" and "a non-owner may not
// move the stage" both need.
let second; let secondToken;
let writer; let writerToken;
try {
  const commonRole = psql(`select id from system_role where code = 'common' and deleted = 0 limit 1`);
  const readerRole = await ensureRole(admin, 'gate_business_reader', 'gate-business-reader',
    ['crm:business:query', 'crm:business:update']);
  const writerRole = await ensureRole(admin, 'gate_business_writer', 'gate-business-writer',
    ['crm:business:query', 'crm:business:create', 'crm:business:update']);
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

// ── 1) 夹具：客户、状态组与两个状态、两份商机、三条权限行 ─────────────────────────────────────────
console.log('== 夹具 ==');
const marker = `gate-business-${Date.now()}`;
const customerName = `${marker}-customer`;
const statusTypeName = `${marker}-type`;
const adminBusinessName = `${marker}-admin`;
const secondBusinessName = `${marker}-second`;
const deniedBusinessName = `${marker}-denied`;
const writerBusinessName = `${marker}-writer`;
const originalRemark = `${marker}-original`;
putBack = () => psql([
  // 被**拒绝**的创建会留下一个没有效应的认领，而「按效应收」够不到它；已执行那次的认领则指向一条效应。
  // A refused create leaves a claim with no effect; an executed one has a claim pointing at an effect.
  `delete from write_claims where user_id in ('${second.id}', '${writer.id}') and tool_name = 'create_crm_business' and effect_id is null`,
  `delete from write_claims where effect_id in (select id from side_effects where result_type = 'crm_business'`
    + ` and result_id in (select id from ${BUSINESS} where name like '${marker}%'))`,
  `delete from side_effects where result_type = 'crm_business' and result_id in`
    + ` (select id from ${BUSINESS} where name like '${marker}%')`,
  `delete from confirmation_requests where args_json like '%${marker}%'`,
  `delete from ${PERMISSION} where biz_type = ${BIZ_TYPE_BUSINESS} and biz_id in`
    + ` (select id from ${BUSINESS} where name like '${marker}%')`,
  `delete from ${BUSINESS} where name like '${marker}%'`,
  `delete from ${STATUS} where type_id in (select id from ${STATUS_TYPE} where name like '${marker}%')`,
  `delete from ${STATUS_TYPE} where name like '${marker}%'`,
  `delete from ${CUSTOMER} where name like '%${marker}%'`,
].join('; '));

// `tenant_id` 不是可选的：租户拦截器给这些表加 `tenant_id = ?`，不带它的行经模块的每条路都看不见。
// `tenant_id` is not optional: the tenant interceptor appends `tenant_id = ?` to these tables, and a row
// without it is invisible to every path through the module.
psql(`insert into ${CUSTOMER}(id, name, owner_user_id, tenant_id) values (nextval('crm_customer_seq'), '${customerName}', 1, ${TENANT})`);
const customerId = psql(`select id from ${CUSTOMER} where name = '${customerName}'`);
check('客户已种', true, customerId !== '');

// 状态组与两个状态：创建商机时模块取该组的**第一个**状态（按 `sort`）作为默认状态；阶段流转要一个
// **同组、不同**的状态，故这一组种两个。两者都带 `tenant_id`，否则模块的分页与校验都读不到它们。
// A status group with two statuses: on create the module takes the group's **first** status (by `sort`)
// as the default, and the stage transition needs a **different** status in the **same** group. Both rows
// carry `tenant_id`, without which the module cannot read them.
psql(`insert into ${STATUS_TYPE}(id, name, tenant_id) values (nextval('${STATUS_TYPE}_seq'), '${statusTypeName}', ${TENANT})`);
const statusTypeId = psql(`select id from ${STATUS_TYPE} where name = '${statusTypeName}'`);
psql(`insert into ${STATUS}(id, type_id, name, percent, sort, tenant_id)`
  + ` values (nextval('${STATUS}_seq'), ${statusTypeId}, '${marker}-s1', 10, 0, ${TENANT})`);
psql(`insert into ${STATUS}(id, type_id, name, percent, sort, tenant_id)`
  + ` values (nextval('${STATUS}_seq'), ${statusTypeId}, '${marker}-s2', 60, 1, ${TENANT})`);
const statusOne = psql(`select id from ${STATUS} where type_id = ${statusTypeId} and name = '${marker}-s1'`);
const statusTwo = psql(`select id from ${STATUS} where type_id = ${statusTypeId} and name = '${marker}-s2'`);
check('状态组与两个状态已种', 'true/true/true', `${statusTypeId !== ''}/${statusOne !== ''}/${statusTwo !== ''}`);

// `creator` 写成数字字符串：模块的分页与详情把 `creator` 当用户 id 解析（`parseLong`）。夹具直插表，
// 故这一步得自己补上；`status_id` 给组内第一个状态，与模块自己创建时同形。
// `creator` is a numeric string: the module's page and detail parse it as a user id. The fixture inserts
// straight into the table, so it supplies this itself; `status_id` names the group's first status, the
// shape the module itself creates.
psql(`insert into ${BUSINESS}(id, name, customer_id, owner_user_id, status_type_id, status_id, remark, tenant_id, creator, updater)`
  + ` values (nextval('${BUSINESS}_seq'), '${adminBusinessName}', ${customerId}, 1, ${statusTypeId}, ${statusOne}, '${originalRemark}', ${TENANT}, '1', '1')`);
psql(`insert into ${BUSINESS}(id, name, customer_id, owner_user_id, status_type_id, status_id, remark, tenant_id, creator, updater)`
  + ` values (nextval('${BUSINESS}_seq'), '${secondBusinessName}', ${customerId}, ${second.id}, ${statusTypeId}, ${statusOne}, '${originalRemark}', ${TENANT}, '${second.id}', '1')`);
const adminBusinessId = psql(`select id from ${BUSINESS} where name = '${adminBusinessName}'`);
const secondBusinessId = psql(`select id from ${BUSINESS} where name = '${secondBusinessName}'`);
check('管理员那一份已种', true, adminBusinessId !== '');
check('第二个调用方那一份已种', true, secondBusinessId !== '');

// 负责人行：模块自己创建商机时也会写，这里手写是因为夹具直接插表。
// Owner rows: the module writes these on create; they are written by hand here because the fixture
// inserts straight into the table.
psql(`insert into ${PERMISSION}(id, biz_type, biz_id, user_id, level, tenant_id)`
  + ` values (nextval('${PERMISSION}_seq'), ${BIZ_TYPE_BUSINESS}, ${adminBusinessId}, 1, ${LEVEL_OWNER}, ${TENANT})`);
psql(`insert into ${PERMISSION}(id, biz_type, biz_id, user_id, level, tenant_id)`
  + ` values (nextval('${PERMISSION}_seq'), ${BIZ_TYPE_BUSINESS}, ${secondBusinessId}, ${second.id}, ${LEVEL_OWNER}, ${TENANT})`);
// W 是 A 那一份的**参与方**（读写、非负责人）——「参与方可读但不可写（D3 丙）」与「非负责人不能改阶段」的夹具。
// W is a **participant** (write, not owner) on A's business — the fixture for "participants may read, may
// not write" (D3) and for "a non-owner may not move the stage".
psql(`insert into ${PERMISSION}(id, biz_type, biz_id, user_id, level, tenant_id)`
  + ` values (nextval('${PERMISSION}_seq'), ${BIZ_TYPE_BUSINESS}, ${adminBusinessId}, ${writer.id}, ${LEVEL_WRITE}, ${TENANT})`);
check('三条权限行已种', 3, Number(psql(`select count(*) from ${PERMISSION}`
  + ` where biz_type = ${BIZ_TYPE_BUSINESS} and biz_id in (${adminBusinessId}, ${secondBusinessId})`)));

// ── 2) 场景 1 · 显式身份下可达 ─────────────────────────────────────────────────────────────────────
console.log('== 场景 1 · 显式身份下可达 ==');
{
  const a = await chat(admin, '列出商机');
  check('管理员触发商机读工具', 'list_crm_businesses', (a.toolCalls || [])[0]);
  check('管理员那次以本人身份在案', '1', psql(`select user_id from ai_audit_logs`
    + ` where tool = 'list_crm_businesses' and outcome = 'executed' order by id desc limit 1`));

  const s = await chat(secondToken, '列出商机');
  check('第二个调用方触发同一个工具', 'list_crm_businesses', (s.toolCalls || [])[0]);
  // 「身份」不是听答案说的：审计行的 `user_id` 必须是他本人。工具路径跑在请求的安全过滤器链之外，
  // 这个值只能来自运行时发布的调用方。
  // "Identity" is not what the answer says: the audit row's `user_id` must be the caller. The tool path
  // runs outside the request's security filter chain, so that value can only come from the runtime.
  check('第二个调用方那次以本人身份在案', String(second.id), psql(`select user_id from ai_audit_logs`
    + ` where tool = 'list_crm_businesses' and outcome = 'executed' order by id desc limit 1`));
  check('两次读都真跑了（审计轨）', 2, Number(psql("select count(*) from ai_audit_logs"
    + " where tool = 'list_crm_businesses' and outcome = 'executed'")));
}

// ── 3) 场景 2 · 越权被拒（读别人的商机、改别人的商机） ──────────────────────────────────────────────
console.log('== 场景 2 · 越权读 / 越权写 ==');
{
  const getAs = (token, id) => api(`/crm/business/get?id=${id}`, { token });
  const remarkOf = (id) => psql(`select remark from ${BUSINESS} where id = ${id}`);

  // 无权限行的 B：按 id 读，**读不到**。两种回答都算数，且各自说得出是谁拒的：
  // REST 上模块自己的 `@CrmPermission(READ)` 先拒（信封 `1020007001`，CRM_PERMISSION_DENIED）；
  // 工具路径上没有登录用户、模块切面放行，拒绝由本治理切面把行**当作不存在**交回（null）。本门禁在 REST 上
  // 读到的是前者，故断言「不可读」，并把实际读数记下来，而不是把某一层的形状写死。
  //
  // B, with no permission row: a read by id is **not readable**. Either answer counts, and each names its
  // layer: on REST the module's own `@CrmPermission(READ)` refuses first; on the tool path this governance
  // advice hands the row back **as nothing** (null). This gate reads the former on REST, so it asserts
  // "not readable" and records the actual reading rather than pinning one layer's shape.
  const bGetsA = await getAs(secondToken, adminBusinessId);
  note('B 取 A 的商机读数', JSON.stringify({ code: bGetsA.code, msg: bGetsA.msg, data: bGetsA.data == null ? null : '<row>' }).slice(0, 160));
  check('B 取 A 的商机：读不到', 'not readable',
    bGetsA.code !== 0 || bGetsA.data == null ? 'not readable' : 'row');
  const bGetsOwn = await getAs(secondToken, secondBusinessId);
  check('B 取自己的商机：读得到', String(secondBusinessId), String(bGetsOwn.data?.id));

  // 更新 VO 把 name/customerId/ownerUserId/statusTypeId/discountPercent 都声明为必填；`@Valid` 在方法体之前跑，
  // 故请求体必须给齐（模块随后自己把属主与状态组清掉）。用 `remark` 断「有没有改到」：`updateById` 忽略 null，
  // 故一个被放行的写会把 remark 写进去。
  //
  // The save VO declares name/customerId/ownerUserId/statusTypeId/discountPercent required; `@Valid` runs
  // before the method body, so the request must carry them (the module then nulls owner and status group
  // itself). `remark` is the witness of "did it change": `updateById` skips null fields.
  const body = (id, remark) => ({
    id: Number(id), name: 'unchanged-by-this-call', customerId: Number(customerId),
    ownerUserId: Number(second.id), statusTypeId: Number(statusTypeId), discountPercent: 0, remark
  });
  const updateAs = (token, id, remark) =>
    api('/crm/business/update', { method: 'PUT', token, body: body(id, remark) });

  // B 改 A 的商机：B 有 `crm:business:update` 这条码（故越过了 @PreAuthorize），但没有 A 那一份的任何
  // 权限行 —— 拒绝来自模块自己的数据权限切面或本治理切面，不是权限码。
  // B writes A's business: B holds `crm:business:update` (so it passes @PreAuthorize) but has no permission
  // row for A's row — the refusal comes from the module's data-permission aspect or this governance advice,
  // never from the code.
  const bHijack = await updateAs(secondToken, adminBusinessId, `${marker}-hijack-b`);
  check('B 改 A 的商机被拒（信封 code 非 0）', true, bHijack.code !== 0);
  note('B 改 A 的拒绝读数', refusal(bHijack));
  check('A 的商机未被 B 改', originalRemark, remarkOf(adminBusinessId));

  // 正对照：B 改**自己**那一行。属主 = 调用方，模块与本切面都放行；没有它，上面那条拒绝也可能只是
  // 「更新这条路径整个坏了」。
  // The positive control: B writes **its own** row. Owner = caller, so the module and this advice both
  // allow it; without it, the refusal above could just mean "update is broken entirely".
  const bOwn = await updateAs(secondToken, secondBusinessId, `${marker}-second-renamed`);
  check('B 改自己的商机成功', 0, bOwn.code);
  check('B 自己的商机确实改了', `${marker}-second-renamed`, remarkOf(secondBusinessId));
}

// ── 4) 场景 3 · 高危写：扣下、批准、落库（以及无码被拒） ───────────────────────────────────────────
console.log('== 场景 3 · 高危写被扣下、批准后落库 ==');
// 三个必填项都用**明确写出来的值**：路由从文字里读它们，而不是从 `targetId` 猜。
// The three required values are written **explicitly**: the route reads them from the text.
const asked = (name) => `新建商机 客户=${customerId} 状态组=${statusTypeId} 名称=${name}`;
let createdBusinessId = '';
{
  const deniedBaseline = maxConfirmationId();
  // 无码调用方：引擎照旧扣下，批准后拒绝它的是工具自己的权限判据。
  // The no-code caller: the engine still holds it, and after approval the tool's own permission
  // judgement refuses it.
  const deniedHeld = pendingCount(second.id);
  const deniedAnswer = await chat(secondToken, asked(deniedBusinessName));
  // 被拒**也要读得懂**：路由没填齐必填项时，引擎在任何确认行存在之前就答 `invalid_arguments`。
  // A red must be legible: when the route does not fill the required arguments, the engine answers
  // `invalid_arguments` before any confirmation row exists.
  note('无码调用方的写读数', JSON.stringify({ toolCalls: deniedAnswer.toolCalls, reply: String(deniedAnswer.reply || '').slice(0, 160) }).slice(0, 260));
  check('无码调用方的写被扣下', deniedHeld + 1, pendingCount(second.id));
  const deniedToken = pendingTokenForTool(second.id, 'create_crm_business', deniedBaseline);
  checkNot('扣下时给出 token', 'undefined', deniedToken);
  const deniedOutcome = await confirm(secondToken, deniedToken, 'approve');
  check('批准后仍不执行（受治理失败）', true, deniedOutcome.status !== 'executed');
  check('失败理由点名 crm:business:create', true,
    psql(`select coalesce(execution_error, '') from confirmation_requests where token = '${deniedToken}'`)
      .includes('crm:business:create'));
  check('无码调用方一行未落库', 0,
    Number(psql(`select count(*) from ${BUSINESS} where name = '${deniedBusinessName}'`)));
  check('无码那次的失败在审计轨', true, Number(psql(`select count(*) from ai_audit_logs`
    + ` where tool = 'create_crm_business' and outcome = 'failed' and detail like '%crm:business:create%'`)) > 0);

  // 有码调用方：同一个工具，持有所需的那条码。
  // The code-holding caller: the same tool, with the code it asks for.
  const writerBaseline = maxConfirmationId();
  const writerHeld = pendingCount(writer.id);
  const writerAnswer = await chat(writerToken, asked(writerBusinessName));
  note('有码调用方的写读数', JSON.stringify({ toolCalls: writerAnswer.toolCalls, reply: String(writerAnswer.reply || '').slice(0, 160) }).slice(0, 260));
  check('有码调用方的写被扣下', writerHeld + 1, pendingCount(writer.id));
  const writerTokenId = pendingTokenForTool(writer.id, 'create_crm_business', writerBaseline);
  checkNot('有码那次扣下时给出 token', 'undefined', writerTokenId);
  // 红也要读得懂：把批准后的结局与运行时记下的执行错误一起打出来（本行本身就是读数的一部分）。
  // A red must still be readable: print the outcome and the execution error the runtime recorded.
  note('有码那次扣下时的参数', (psql(`select args_json from confirmation_requests`
    + ` where token = '${writerTokenId}'`) || '').slice(0, 240));
  const writerOutcome = await confirm(writerToken, writerTokenId, 'approve');
  note('有码调用方批准后的结局', writerOutcome.status || JSON.stringify(writerOutcome).slice(0, 160));
  note('有码那次批准后的执行错误', (psql(`select coalesce(execution_error, '') from confirmation_requests`
    + ` where token = '${writerTokenId}'`) || '').slice(0, 240));
  check('有码调用方批准后执行', 'executed', writerOutcome.status);
  createdBusinessId = psql(`select id from ${BUSINESS} where name = '${writerBusinessName}' order by id desc limit 1`);
  check('有码调用方那一行落地', true, createdBusinessId !== '');
  if (createdBusinessId) {
    // 属主由切面**盖章**：保存 VO 的 `ownerUserId` 是客户端可填的必填项，工具刻意不填它。
    // The owner is **stamped** by the advice: the save VO's `ownerUserId` is a client-fillable required
    // field, and the tool deliberately does not fill it.
    check('新行的属主 = 调用方', String(writer.id),
      psql(`select owner_user_id from ${BUSINESS} where id = ${createdBusinessId}`));
    check('新行的租户 = 本租户', TENANT,
      psql(`select tenant_id from ${BUSINESS} where id = ${createdBusinessId}`));
    check('新行的客户来自路由 / VO', customerId,
      psql(`select customer_id from ${BUSINESS} where id = ${createdBusinessId}`));
    // 默认状态是该组按 `sort` 的第一个——模块自己取的，不是工具填的。
    // The default status is the group's first by `sort` — read by the module, not filled by the tool.
    check('新行的状态组 = 路由读出的那组', statusTypeId,
      psql(`select status_type_id from ${BUSINESS} where id = ${createdBusinessId}`));
    check('新行的状态 = 该组第一个状态', statusOne,
      psql(`select status_id from ${BUSINESS} where id = ${createdBusinessId}`));
    // 盖章之后模块为它开的那行负责人权限，也必须是调用方。
    // The owner permission row the module opens for it must name the caller too.
    check('新行的负责人权限行 = 调用方', String(writer.id),
      psql(`select user_id from ${PERMISSION} where biz_type = ${BIZ_TYPE_BUSINESS}`
        + ` and biz_id = ${createdBusinessId} and level = ${LEVEL_OWNER}`));
  } else {
    bad('新行的属主 = 调用方', String(writer.id), '<no row>');
    bad('新行的租户 = 本租户', TENANT, '<no row>');
    bad('新行的客户来自路由 / VO', customerId, '<no row>');
    bad('新行的状态组 = 路由读出的那组', statusTypeId, '<no row>');
    bad('新行的状态 = 该组第一个状态', statusOne, '<no row>');
    bad('新行的负责人权限行 = 调用方', String(writer.id), '<no row>');
  }
}

// ── 5) 场景 4 · 副作用台账（best-effort）与审计链 ──────────────────────────────────────────────────
console.log('== 场景 4 · 台账与审计链 ==');
{
  // **best-effort，照实声明**：这一条断言的是「一次已执行的写留下了可审计的副作用行」。它**不是**
  // 可撤销性的保证 —— 撤销能力取决于该工具的补偿器与业务事实，不取决于本行存在。
  //
  // **Best-effort, declared as such**: this asserts that an executed write left an auditable effect
  // row. It is **not** a guarantee of revocability — that depends on the tool's compensator and the
  // business fact, not on this row existing.
  const effect = psql(`select coalesce(user_id, '') || '|' || tool_name || '|' || result_type`
    + ` from side_effects where tool_name = 'create_crm_business' and result_type = 'crm_business'`
    + ` order by id desc limit 1`);
  check('副作用台账记下这次写（best-effort）', `${writer.id}|create_crm_business|crm_business`, effect);

  check('有码那次执行在审计轨以本人身份在案', true, Number(psql(`select count(*) from ai_audit_logs`
    + ` where tool = 'create_crm_business' and outcome = 'executed' and user_id = '${writer.id}'`)) > 0);
  check('宿主操作日志记下了调用方', String(writer.id), await hostLoggedWho(writerBusinessName));

  const rows = Number(psql('select count(*) from ai_audit_logs'));
  check('审计行在（>0）', true, rows > 0);
  const verify = await (await fetch(`${HOST}/audit/verify`, { headers: { Authorization: `Bearer ${admin}` } })).json();
  check('链校验通过', true, verify.data && verify.data.valid);
}

// ── 6) 场景 5 · 分页「不传场景 ≠ 全部行」 ──────────────────────────────────────────────────────────
console.log('== 场景 5 · 分页不传场景 ==');
{
  const pageOf = (token, query = '') => api(`/crm/business/page?pageSize=100${query}`, { token });
  const idsOn = (answer) => (((answer || {}).data || {}).list || []).map((row) => String(row.id));

  // 分页：**不传场景**。切面把 null 补成「我负责的」，故 B 的页里没有 A 那一行，但有自己的那一行 ——
  // 两条都要断：只断前者，一处根本没种 A 的夹具也会绿；只断后者，收窄被删掉也绿。
  //
  // The page **with no scene**. The advice fills null with "mine", so B's page has none of A's row but
  // does have B's own — both halves are required: the first alone is green on a fixture that never
  // seeded A, the second alone is green with the narrowing deleted.
  const bPage = await pageOf(secondToken);
  check('B 的分页取到了', 0, bPage.code);
  check('B 的页里没有 A 的商机（不传场景 ≠ 全部行）', false, idsOn(bPage).includes(String(adminBusinessId)));
  check('B 的页里有自己的商机（页不是空着蒙对的）', true, idsOn(bPage).includes(String(secondBusinessId)));
}

// ── 7) 场景 6 · 参与方可读、写只认负责人（D3 丙） ─────────────────────────────────────────────────
console.log('== 场景 6 · 参与方可读 / 写只认负责人 ==');
{
  // 参与方可读：W 在 A 那一份上是 WRITE，故「我参与的」页里有它，按 id 也读得到。
  // A participant may read: W holds WRITE on A's business, so it is on the "involved" page and reads by id.
  const wInvolved = await api(`/crm/business/page?pageSize=100&sceneType=2`, { token: writerToken });
  const involvedIds = (((wInvolved || {}).data || {}).list || []).map((row) => String(row.id));
  check('参与方的“我参与的”页取到了', 0, wInvolved.code);
  check('参与方的“我参与的”页里有 A 的商机', true, involvedIds.includes(String(adminBusinessId)));
  const wGetsA = await api(`/crm/business/get?id=${adminBusinessId}`, { token: writerToken });
  check('参与方按 id 读得到 A 的商机', String(adminBusinessId), String(wGetsA.data?.id));

  // 写只认负责人：模块自己的接缝只要求 WRITE（W 有），本治理切面只认 OWNER（W 不是）——这正是
  // 「比模块更严」的那一处。正对照（本路径能改）在场景 2：B 改自己那一行成功。
  //
  // Writes need the owner: the module's own seam asks only WRITE (W has it), while this governance advice
  // asks only OWNER (W is not) — exactly the "stricter than the module" point. The positive control (this
  // path does work) is in scenario 2: B changing its own row succeeds.
  const wHijack = await api('/crm/business/update', {
    method: 'PUT', token: writerToken,
    body: { id: Number(adminBusinessId), name: 'unchanged-by-this-call', customerId: Number(customerId),
      ownerUserId: Number(writer.id), statusTypeId: Number(statusTypeId), discountPercent: 0,
      remark: `${marker}-hijack-w` }
  });
  check('参与方改 A 的商机被拒（信封 code 非 0）', true, wHijack.code !== 0);
  note('参与方改 A 的拒绝读数', refusal(wHijack));
  check('A 的商机未被参与方改', originalRemark,
    psql(`select remark from ${BUSINESS} where id = ${adminBusinessId}`));
}

// ── 8) 场景 7 · 阶段流转：非负责人被拒、负责人走通 ────────────────────────────────────────────────
console.log('== 场景 7 · 阶段流转 ==');
{
  // 切面的实际语义（类注释原文）：`updateBusinessStatus` **不拒绝、也不套「按 id 更新」那一档，而是要求负责人
  // （OWNER）**；模块自己只要 WRITE。故这里断三件事：WRITE 参与方被拒、无权限行调用方被拒（模块那一层）、
  // 负责人能走通。状态**确实没变**也要断——只看信封 code，一处「拒了但先写了」的缺陷也会绿。
  //
  // The advice's actual meaning (its class comment): `updateBusinessStatus` is **neither refused nor folded
  // into the "update by id" tier — it requires the owner**, where the module asks only `WRITE`. Three
  // readings follow: a WRITE participant is refused, a caller with no permission row is refused (at the
  // module's layer), and the owner gets through. The status **must also be unchanged**, or a defect that
  // refuses after writing would still be green.
  const updateStatusAs = (token, id, statusId) => api('/crm/business/update-status', {
    method: 'PUT', token, body: { id: Number(id), statusId: Number(statusId) }
  });
  const statusOf = (id) => psql(`select status_id from ${BUSINESS} where id = ${id}`);

  check('A 的初始状态 = 组内第一个', statusOne, statusOf(adminBusinessId));

  const wTransition = await updateStatusAs(writerToken, adminBusinessId, statusTwo);
  check('参与方改 A 的阶段被拒（信封 code 非 0）', true, wTransition.code !== 0);
  note('参与方改 A 的阶段的拒绝读数', refusal(wTransition));
  check('A 的阶段未被参与方改', statusOne, statusOf(adminBusinessId));

  const bTransition = await updateStatusAs(secondToken, adminBusinessId, statusTwo);
  check('无权限行的调用方改 A 的阶段被拒（信封 code 非 0）', true, bTransition.code !== 0);
  note('无权限行改 A 的阶段的拒绝读数', refusal(bTransition));
  check('A 的阶段未被无权限行调用方改', statusOne, statusOf(adminBusinessId));

  // 负责人走通：B 改**自己**那一份的阶段。模块要求 WRITE（负责人满足），本切面要求 OWNER（B 满足）。
  // The owner gets through: B moves **its own** business's stage. The module asks WRITE (an owner has it)
  // and this advice asks OWNER (B has it).
  const ownTransition = await updateStatusAs(secondToken, secondBusinessId, statusTwo);
  check('负责人改自己的阶段成功', 0, ownTransition.code);
  note('负责人改阶段的读数', refusal(ownTransition));
  check('负责人自己的阶段确实改了', statusTwo, statusOf(secondBusinessId));
  check('阶段流转没有改动结束状态', '', psql(`select coalesce(end_status::text, '') from ${BUSINESS} where id = ${secondBusinessId}`));
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
