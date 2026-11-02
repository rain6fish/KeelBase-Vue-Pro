#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// M1 CRM「联系人」的场景门：在真栈上取读数。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-crm-contact-scenarios.mjs
//
// 联系人挂在这条商业关系本身上（谁在对谁说话），行范围在模块自己的 `crm_permission` 表里。本门禁断言四条验收 +
// 联系人特有的三条：
//
//   1. 在**显式身份**下可达：调用方驱动 AI 读工具，审计轨记下的是**这位调用方**；
//   2. 越权被拒：无权限行的调用方读不到别人的联系人，也改不了；
//   3. 高危写被扣下、经人批准后才落库（`create_crm_contact`，R3）；
//   4. 副作用台账可审计 —— **best-effort**：它记下「这次写发生过」，**不是**可撤销性的保证；
//   5. 分页「不传场景 ≠ 全部行」；
//   6. 参与方可读但不可写（D3 丙 读宽写严）；
//   7. 联系人特有的两条例外：
//      (a) 工具输出（`list_crm_contacts` 的结果）**不含任何联系方式**（手机 / 电话 / QQ / 微信 / 邮箱 / 地址 /
//          跟进内容）。**声明范围**：两个运行时都**不把工具结果放上线**（冻结的 `chat-response` 只有
//          `reply`/`toolCalls`，流式的 `tool_end` 只有成功与否），故「返回结构」只能直读 `ToolResult.data()`。
//          本门禁分两半断言：真栈那一半证明工具**确实在那条挂满联系方式的联系人上行过**（审计行 `executed`，
//          且夹具行六列联系方式都非空）；返回结构那一半由同仓的 `CrmContactToolsTest` 在**同一次运行**里直读
//          返回值，本门禁以子进程跑它并取 surefire 的读数。**不**从答复、页面或库反推。
//      (b) 把联系人建在**调用方看不见的客户**名下被拒 —— 切面比上游严的那一处（上游只校验客户**存在**）。
//          归因靠**同一调用方、同一工具、同一种文字形状**两侧对照：看得见的客户下建成了（第 3 条），看不见的
//          客户下批准后仍被切面拒、且无行落地；两次只差客户。
//
// **第 5、6 条为什么从模块自己的分页/读端点断。** 运行时不上线工具的结果，故「页里有没有这一行」只能从模块
// 自己的端点读；而该端点与工具走的是**同一个**被切的服务方法。工具路径**总是**显式给场景（默认「我负责的」），
// 故「没给场景」这个洞在工具路径上不会出现；本门禁断的是**两条路径共用的那条接缝**：一个非管理员调用方不带场景地
// 调分页，切面把 null 补成「我负责的」，于是他看不到别人的行。这是本门禁对第 5 条的**声明范围**，不夸大。
//
// **第 3 条的消息形状。** `/ai/chat` 只有一个结构化槽（`targetId`），而联系人的创建路由从用户**明确写出的文字**里
// 读两个必填项。触发短语用 `加联系人` —— 它是本工具**独有**的（`新建联系人` 同时是 infra 示例联系人那条路由的触发
// 短语，路由按声明次序取第一个命中的，共用就会把这一笔导到另一个模块）。这条消息的形状就是门禁里的那一句。
//
// 每条断言都用**本次唯一**的标记收束，不按整表计数；它造的东西（客户、联系人、权限行、副作用、确认单、写占位）都按
// 该标记收回。**审计行刻意不动**：那是一条哈希链，剪断一环比凌乱更坏。
//
// M1, CRM contacts: the scenario gate that takes readings on a real stack.
//
// Contacts hang from the business relation itself, and their row range lives in the module's own
// `crm_permission` table. This gate asserts the four acceptance readings plus the three contact-specific
// ones: reachable under an explicit identity; out-of-scope reads and writes refused; the high-risk create
// held for a human and landed only after approval; the side-effect ledger auditable (**best-effort** — it
// records that the write happened, it is **not** a guarantee of revocability); a page with no scene is not
// every row; a participant may read but not write (D3); and two exceptions of this object: the list tool's
// result carries no contact channel (**declared scope**: neither runtime puts tool results on the wire, so
// the returned structure is read straight from `ToolResult.data()` by `CrmContactToolsTest`, which this gate
// runs as a subprocess, while the stack half proves the tool ran over a row that really carries every
// channel); and a contact may not be created under a customer the caller cannot see (stricter than upstream,
// which only checks that the customer exists), attributed by the same caller, tool and text shape under a
// visible customer.
//
// Every assertion is scoped by a **name unique to this run**, never by a whole-table count; everything it
// creates (customer, contacts, permission rows, effects, confirmations, write claims) is removed again by that
// marker. The audit rows are deliberately left alone: that is a hash chain, and cutting a link to tidy up is a
// worse act than the untidiness.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.HOST_URL || 'http://127.0.0.1:48096';
const PG = process.env.PG_CONTAINER || 'crmcontact-1031-pg';
const DB = process.env.PG_DB || 'crm_contact_gate';
const TENANT = process.env.TENANT_ID || '1';
const SECOND_USER = process.env.CONTACT_SECOND_USER || 'gatecontact2';
const SECOND_PASS = process.env.CONTACT_SECOND_PASS || 'gate-pass-1234';
const WRITER_USER = process.env.CONTACT_WRITER_USER || 'gatecontactw';
const WRITER_PASS = process.env.CONTACT_WRITER_PASS || 'gate-pass-1234';
const CUSTOMER = 'crm_customer';
const CONTACT = 'crm_contact';
const PERMISSION = 'crm_permission';
const BIZ_TYPE_CUSTOMER = 2; // CrmBizTypeEnum.CRM_CUSTOMER
const BIZ_TYPE_CONTACT = 3; // CrmBizTypeEnum.CRM_CONTACT
const LEVEL_OWNER = 1; // CrmPermissionLevelEnum.OWNER
const LEVEL_WRITE = 3; // CrmPermissionLevelEnum.WRITE

// 投影那一半在进程内跑：Maven 与专用仓库可覆盖，默认照本机（与建栈时用的那条一致）。
// The projection half runs in-process: Maven and its dedicated repository are overridable, defaulting to
// this machine's (the same pair the stack was built with).
const MVN = process.env.MVN || 'D:/Develop/apache-maven-3.9.16/bin/mvn';
const MVN_REPO = process.env.MVN_REPO || 'D:/Rain6fish/.m2-contact-gate';

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
    body: JSON.stringify({ message, conversationId: `gate-contact-${Date.now()}`, ...extra })
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

const pendingTokenFor = (operatorId, marker) =>
  psql(`select token from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`
    + ` and args_json like '%${marker}%' order by id desc limit 1`) || undefined;

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
      body: { name, code, sort: 99, status: 0, remark: 'contact gate: the codes this scenario needs' }
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
// 故给它一小段窗口；窗口内该出现，始终没出现就是**失败**。按本轮唯一的联系人姓名定位。
// Who: the row the host logged for this write must name the caller. It is written **asynchronously**,
// so give it a short window; it must appear within it, and not appearing is a failure. Located by the
// contact name, which is unique to this run.
async function hostLoggedWho(actionLike) {
  for (let i = 0; i < 12; i += 1) {
    const who = psql(`select coalesce(user_id::text, '<null>') from system_operate_log`
      + ` where type = 'CRM 联系人' and action like '%${actionLike}%' order by id desc limit 1`);
    if (who) return who;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return '';
}

// 第 7(a) 条的返回结构那一半：在同一次运行里跑同仓的 `CrmContactToolsTest`，直读 `ToolResult.data()`。
// 唯一理由是运行时不上线工具结果；它的读数是 surefire 的计数，不是答复、不是页面。
// The returned-structure half of reading 7(a): run the repo's own `CrmContactToolsTest` inside this
// invocation and read `ToolResult.data()` directly. The only reason it lives here is that neither runtime
// puts a tool result on the wire; its reading is the surefire count, not a reply and not a page.
function runProjectionTest() {
  const report = resolve(ROOT, 'yudao-server/target/surefire-reports/TEST-cn.iocoder.yudao.server.keelbase.CrmContactToolsTest.xml');
  const args = ['scripts/jdk25.sh', MVN, '-B', '-pl', 'yudao-server', '-am',
    '-Dtest=CrmContactToolsTest', '-DfailIfNoTests=false', '-Dsurefire.failIfNoSpecifiedTests=false',
    `-Dmaven.repo.local=${MVN_REPO}`, 'test'];
  let output = '';
  let failure = '';
  try {
    output = execFileSync('bash', args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 20 * 60 * 1000 });
  } catch (e) {
    output = `${e.stdout || ''}\n${e.stderr || ''}`;
    failure = e.signal ? `signal ${e.signal}` : `exit ${e.status}`;
  }
  if (!existsSync(report)) {
    return { verdict: `no surefire report (${failure || 'missing'})`, tail: output.slice(-1200) };
  }
  const xml = readFileSync(report, 'utf8');
  const attr = (name) => {
    const found = xml.match(new RegExp(`\\b${name}="(\\d+)"`));
    return found ? Number(found[1]) : -1;
  };
  const tests = attr('tests');
  const failures = attr('failures');
  const errors = attr('errors');
  const verdict = tests > 0 && failures === 0 && errors === 0
    ? `ok (${tests} tests, 0 failures, 0 errors)`
    : `red (tests=${tests}, failures=${failures}, errors=${errors}${failure ? `, ${failure}` : ''})`;
  return { verdict, tail: output.slice(-1200) };
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
// B：只有查/改的权限码，且**没有**任何联系人的权限行 —— 越权那半要的正是「有码、但没有这一行」。
// W：多一个创建码，并且会被种成 A 那一份的**参与方**（WRITE）——「可读不可写」那半要的正是这个。
//
// B: read/update codes only, and **no** permission row on any contact — the cross-scope half needs
// "has the code, does not own the row". W: additionally the create code, and seeded as a **participant**
// (WRITE) on A's contact — which is exactly what the "may read, may not write" half needs.
let second; let secondToken;
let writer; let writerToken;
try {
  const commonRole = psql(`select id from system_role where code = 'common' and deleted = 0 limit 1`);
  const readerRole = await ensureRole(admin, 'gate_contact_reader', 'gate-contact-reader',
    ['crm:contact:query', 'crm:contact:update']);
  const writerRole = await ensureRole(admin, 'gate_contact_writer', 'gate-contact-writer',
    ['crm:contact:query', 'crm:contact:create', 'crm:contact:update']);
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

// ── 1) 夹具：两个客户、两位联系人、三条联系人权限行、一条客户权限行 ───────────────────────────────
console.log('== 夹具 ==');
const marker = `gate-contact-${Date.now()}`;
const customerName = `${marker}-customer`;
const hiddenCustomerName = `${marker}-hidden-customer`;
const adminContactName = `${marker}-admin`;
const secondContactName = `${marker}-second`;
// 六列联系方式全部写死：第 7(a) 条的「真栈那一半」要证明工具确实跑在这条**挂满联系方式**的行上。
// All six channel columns are populated: the stack half of 7(a) proves the tool ran over a row that really
// carries every channel.
const SEEDED_CHANNELS = ['13800000000', '021-0029922', '197272662', 'gate-wechat-seed',
  'gate-contact@example.com', 'gate address seed', 'gate private note seed'];
putBack = () => psql([
  // 被**拒绝**的创建会留下一个没有效应的认领，而「按效应收」够不到它。范围取本门禁自己的工具 + 两个调用方 +
  // 没有效应：那些笔既然被拒，就不存在可被重复执行的写。
  // A refused create leaves a claim with no effect, unreachable by "delete by effect". Scope it to this
  // gate's own tool plus its two callers plus no effect: those calls were refused, so there is no write
  // to duplicate.
  `delete from write_claims where user_id in ('${second.id}', '${writer.id}') and tool_name = 'create_crm_contact' and effect_id is null`,
  `delete from write_claims where effect_id in (select id from side_effects where result_type = 'crm_contact'`
    + ` and result_id in (select id::text from ${CONTACT} where name like '%${marker}%'))`,
  `delete from side_effects where result_type = 'crm_contact' and result_id in`
    + ` (select id::text from ${CONTACT} where name like '%${marker}%')`,
  `delete from confirmation_requests where args_json like '%${marker}%'`,
  `delete from ${PERMISSION} where biz_type = ${BIZ_TYPE_CONTACT} and biz_id in (select id from ${CONTACT} where name like '%${marker}%')`,
  `delete from ${PERMISSION} where biz_type = ${BIZ_TYPE_CUSTOMER} and biz_id in (select id from ${CUSTOMER} where name like '%${marker}%')`,
  `delete from ${CONTACT} where name like '%${marker}%'`,
  `delete from ${CUSTOMER} where name like '%${marker}%'`,
].join('; '));

// `tenant_id` 不是可选的：租户拦截器给这些表加 `tenant_id = ?`，不带它的行经模块的每条路都看不见。
// `tenant_id` is not optional: the tenant interceptor appends `tenant_id = ?` to these tables, and a row
// without it is invisible to every path through the module.
//
// 客户 A **没有**权限行 ⇒ 公海 ⇒ 任何调用方都读得到（切面的两条例外之一），用作 writer 建联系人时那个
// 「看得见的客户」。客户 B 有一行指给种子的负责人 ⇒ 不是公海 ⇒ writer 读不到，用作第 7(b) 条的目标。
// Customer A has **no** permission rows ⇒ public sea ⇒ readable by every caller (one of the aspect's two
// exceptions); it is the "visible customer" the writer creates under. Customer B has a row pointing at the
// seed owner ⇒ not public sea ⇒ unreadable by the writer; it is the target of reading 7(b).
psql(`insert into ${CUSTOMER}(id, name, owner_user_id, tenant_id) values (nextval('${CUSTOMER}_seq'), '${customerName}', 1, ${TENANT})`);
psql(`insert into ${CUSTOMER}(id, name, owner_user_id, tenant_id) values (nextval('${CUSTOMER}_seq'), '${hiddenCustomerName}', 1, ${TENANT})`);
const customerId = psql(`select id from ${CUSTOMER} where name = '${customerName}'`);
const hiddenCustomerId = psql(`select id from ${CUSTOMER} where name = '${hiddenCustomerName}'`);
check('公海客户已种', true, customerId !== '');
check('看不见的客户已种', true, hiddenCustomerId !== '');
psql(`insert into ${PERMISSION}(id, biz_type, biz_id, user_id, level, tenant_id)`
  + ` values (nextval('${PERMISSION}_seq'), ${BIZ_TYPE_CUSTOMER}, ${hiddenCustomerId}, 1, ${LEVEL_OWNER}, ${TENANT})`);

// `creator` 写成数字字符串：模块的分页会把 `creator` 当用户 id 解析，空串会抛 NumberFormatException。
// `creator` is a numeric string: the module's page parses it as a user id, and an empty string throws
// NumberFormatException.
psql(`insert into ${CONTACT}(id, name, customer_id, owner_user_id, mobile, telephone, qq, wechat, email, detail_address,`
  + ` contact_last_content, tenant_id, creator, updater)`
  + ` values (nextval('${CONTACT}_seq'), '${adminContactName}', ${customerId}, 1, '${SEEDED_CHANNELS[0]}',`
  + ` '${SEEDED_CHANNELS[1]}', ${SEEDED_CHANNELS[2]}, '${SEEDED_CHANNELS[3]}', '${SEEDED_CHANNELS[4]}',`
  + ` '${SEEDED_CHANNELS[5]}', '${SEEDED_CHANNELS[6]}', ${TENANT}, '1', '1')`);
psql(`insert into ${CONTACT}(id, name, customer_id, owner_user_id, tenant_id, creator, updater)`
  + ` values (nextval('${CONTACT}_seq'), '${secondContactName}', ${customerId}, ${second.id}, ${TENANT}, '${second.id}', '1')`);
const adminContactId = psql(`select id from ${CONTACT} where name = '${adminContactName}'`);
const secondContactId = psql(`select id from ${CONTACT} where name = '${secondContactName}'`);
check('管理员那一份已种', true, adminContactId !== '');
check('第二个调用方那一份已种', true, secondContactId !== '');

// 负责人行：模块自己创建联系人时也会写，这里手写是因为夹具直接插表。
// Owner rows: the module writes these on create; they are written by hand here because the fixture
// inserts straight into the table.
psql(`insert into ${PERMISSION}(id, biz_type, biz_id, user_id, level, tenant_id)`
  + ` values (nextval('${PERMISSION}_seq'), ${BIZ_TYPE_CONTACT}, ${adminContactId}, 1, ${LEVEL_OWNER}, ${TENANT})`);
psql(`insert into ${PERMISSION}(id, biz_type, biz_id, user_id, level, tenant_id)`
  + ` values (nextval('${PERMISSION}_seq'), ${BIZ_TYPE_CONTACT}, ${secondContactId}, ${second.id}, ${LEVEL_OWNER}, ${TENANT})`);
// W 是 A 那一份的**参与方**（读写、非负责人）——「参与方可读但不可写（D3 丙）」的夹具。
// W is a **participant** (write, not owner) on A's contact — the fixture for "participants may read,
// may not write" (D3).
psql(`insert into ${PERMISSION}(id, biz_type, biz_id, user_id, level, tenant_id)`
  + ` values (nextval('${PERMISSION}_seq'), ${BIZ_TYPE_CONTACT}, ${adminContactId}, ${writer.id}, ${LEVEL_WRITE}, ${TENANT})`);
check('三条联系人权限行已种', 3, Number(psql(`select count(*) from ${PERMISSION}`
  + ` where biz_type = ${BIZ_TYPE_CONTACT} and biz_id in (${adminContactId}, ${secondContactId})`)));

// ── 2) 场景 1 · 显式身份下可达 ─────────────────────────────────────────────────────────────────────
console.log('== 场景 1 · 显式身份下可达 ==');
{
  const a = await chat(admin, '列出联系人');
  check('管理员触发联系人读工具', 'list_crm_contacts', (a.toolCalls || [])[0]);
  check('管理员那次以本人身份在案', '1', psql(`select user_id from ai_audit_logs`
    + ` where tool = 'list_crm_contacts' and outcome = 'executed' order by id desc limit 1`));

  const s = await chat(secondToken, '列出联系人');
  check('第二个调用方触发同一个工具', 'list_crm_contacts', (s.toolCalls || [])[0]);
  // 「身份」不是听答案说的：审计行的 `user_id` 必须是他本人。工具路径跑在请求的安全过滤器链之外，
  // 这个值只能来自运行时发布的调用方。
  // "Identity" is not what the answer says: the audit row's `user_id` must be the caller. The tool path
  // runs outside the request's security filter chain, so that value can only come from the runtime.
  check('第二个调用方那次以本人身份在案', String(second.id), psql(`select user_id from ai_audit_logs`
    + ` where tool = 'list_crm_contacts' and outcome = 'executed' order by id desc limit 1`));
  check('两次读都真跑了（审计轨）', 2, Number(psql("select count(*) from ai_audit_logs"
    + " where tool = 'list_crm_contacts' and outcome = 'executed'")));
}

// ── 3) 场景 2 · 越权读被拒；分页「不传场景 ≠ 全部行」；参与方可读 ─────────────────────────────────
console.log('== 场景 2 · 越权读 / 分页不传场景 / 参与方可读 ==');
{
  const getAs = (token, id) => api(`/crm/contact/get?id=${id}`, { token });
  const pageOf = (token, query = '') => api(`/crm/contact/page?pageSize=100${query}`, { token });
  const idsOn = (answer) => (((answer || {}).data || {}).list || []).map((row) => String(row.id));

  // 无权限行的 B：按 id 读，**读不到**。两种回答都算数，且各自说得出是谁拒的：
  // REST 上模块自己的 `@CrmPermission(READ)` 先拒（信封 `1020007001`，CRM_PERMISSION_DENIED）；
  // 工具路径上没有登录用户、模块切面放行，拒绝由本治理切面把行**当作不存在**交回（null）。本门禁在 REST 上
  // 读到的是前者，故断言「不可读」，并把实际读数记下来，而不是把某一层的形状写死。
  //
  // B, with no permission row: a read by id is **not readable**. Either answer counts, and each names its
  // layer: on REST the module's own `@CrmPermission(READ)` refuses first (envelope `1020007001`,
  // CRM_PERMISSION_DENIED); on the tool path there is no login user, the module aspect stands aside, and
  // this governance advice hands the row back **as nothing** (null). This gate reads the former on REST,
  // so it asserts "not readable" and records the actual reading rather than pinning one layer's shape.
  const bGetsA = await getAs(secondToken, adminContactId);
  note('B 取 A 的联系人读数', JSON.stringify({ code: bGetsA.code, msg: bGetsA.msg, data: bGetsA.data == null ? null : '<row>' }).slice(0, 160));
  check('B 取 A 的联系人：读不到', 'not readable',
    bGetsA.code !== 0 || bGetsA.data == null ? 'not readable' : 'row');
  const bGetsOwn = await getAs(secondToken, secondContactId);
  check('B 取自己的联系人：读得到', String(secondContactId), String(bGetsOwn.data?.id));

  // 分页：**不传场景**。切面把 null 补成「我负责的」，故 B 的页里没有 A 那一行，但有自己的那一行 ——
  // 两条都要断：只断前者，一处根本没种 A 的夹具也会绿；只断后者，收窄被删掉也绿。
  //
  // The page **with no scene**. The advice fills null with "mine", so B's page has none of A's row but
  // does have B's own — both halves are required: the first alone is green on a fixture that never
  // seeded A, the second alone is green with the narrowing deleted.
  const bPage = await pageOf(secondToken);
  check('B 的分页取到了', 0, bPage.code);
  check('B 的页里没有 A 的联系人（不传场景 ≠ 全部行）', false, idsOn(bPage).includes(String(adminContactId)));
  check('B 的页里有自己的联系人（页不是空着蒙对的）', true, idsOn(bPage).includes(String(secondContactId)));

  // 参与方可读：W 在 A 那一份上是 WRITE，故「我参与的」页里有它，按 id 也读得到。
  // A participant may read: W holds WRITE on A's contact, so it is on the "involved" page and reads by id.
  const wInvolved = await pageOf(writerToken, '&sceneType=2');
  check('参与方的“我参与的”页取到了', 0, wInvolved.code);
  check('参与方的“我参与的”页里有 A 的联系人', true, idsOn(wInvolved).includes(String(adminContactId)));
  const wGetsA = await getAs(writerToken, adminContactId);
  check('参与方按 id 读得到 A 的联系人', String(adminContactId), String(wGetsA.data?.id));
}

// ── 4) 场景 3 · 高危写：扣下、批准、落库（以及无码被拒） ───────────────────────────────────────────
console.log('== 场景 3 · 高危写被扣下、批准后落库 ==');
const deniedMarker = `${marker}-denied`;
const writerMarker = `${marker}-writer`;
// 两个必填项都写在文字里；`加联系人` 是本工具独有的触发短语（`新建联系人` 与 infra 示例联系人那条路由共用）。
// Both required values are written into the text; `加联系人` is this tool's own trigger phrase
// (`新建联系人` is shared with the infra demo contact's route).
const asked = (customer, name) => `加联系人 客户=${customer} 姓名=${name}`;
let createdContactId = '';
{
  // 无码调用方：引擎照旧扣下，批准后拒绝它的是工具自己的权限判据。
  // The no-code caller: the engine still holds it, and after approval the tool's own permission
  // judgement refuses it.
  const deniedHeld = pendingCount(second.id);
  const deniedAnswer = await chat(secondToken, asked(customerId, deniedMarker));
  // 被拒**也要读得懂**：路由没读齐必填项时，引擎在任何确认行存在之前就答 `invalid_arguments`。
  // A red must be legible: when the route does not fill the required arguments, the engine answers
  // `invalid_arguments` before any confirmation row exists.
  note('无码调用方的写读数', JSON.stringify({ toolCalls: deniedAnswer.toolCalls, reply: String(deniedAnswer.reply || '').slice(0, 160) }).slice(0, 260));
  check('无码调用方的写被扣下', deniedHeld + 1, pendingCount(second.id));
  const deniedToken = pendingTokenFor(second.id, deniedMarker);
  checkNot('扣下时给出 token', 'undefined', deniedToken);
  const deniedOutcome = await confirm(secondToken, deniedToken, 'approve');
  check('批准后仍不执行（受治理失败）', true, deniedOutcome.status !== 'executed');
  check('失败理由点名 crm:contact:create', true,
    psql(`select coalesce(execution_error, '') from confirmation_requests where token = '${deniedToken}'`)
      .includes('crm:contact:create'));
  check('无码调用方一行未落库', 0,
    Number(psql(`select count(*) from ${CONTACT} where name like '%${deniedMarker}%'`)));
  check('无码那次的失败在审计轨', true, Number(psql(`select count(*) from ai_audit_logs`
    + ` where tool = 'create_crm_contact' and outcome = 'failed' and detail like '%crm:contact:create%'`)) > 0);

  // 有码调用方：同一个工具，持有所需的那条码，挂在**看得见**的客户下。
  // The code-holding caller: the same tool, with the code it asks for, under a customer it can see.
  const writerHeld = pendingCount(writer.id);
  const writerAnswer = await chat(writerToken, asked(customerId, writerMarker));
  note('有码调用方的写读数', JSON.stringify({ toolCalls: writerAnswer.toolCalls, reply: String(writerAnswer.reply || '').slice(0, 160) }).slice(0, 260));
  check('有码调用方的写被扣下', writerHeld + 1, pendingCount(writer.id));
  const writerTokenId = pendingTokenFor(writer.id, writerMarker);
  checkNot('有码那次扣下时给出 token', 'undefined', writerTokenId);
  note('有码那次扣下时的参数', (psql(`select args_json from confirmation_requests`
    + ` where token = '${writerTokenId}'`) || '').slice(0, 240));
  const writerOutcome = await confirm(writerToken, writerTokenId, 'approve');
  // 红也要读得懂：把批准后的结局与运行时记下的执行错误一起打出来（本行本身就是读数的一部分）。
  // A red must still be readable: print the outcome and the execution error the runtime recorded.
  note('有码调用方批准后的结局', writerOutcome.status || JSON.stringify(writerOutcome).slice(0, 160));
  note('有码那次批准后的执行错误', (psql(`select coalesce(execution_error, '') from confirmation_requests`
    + ` where token = '${writerTokenId}'`) || '').slice(0, 240));
  check('有码调用方批准后执行', 'executed', writerOutcome.status);
  createdContactId = psql(`select id from ${CONTACT} where name like '%${writerMarker}%' order by id desc limit 1`);
  check('有码调用方那一行落地', true, createdContactId !== '');
  if (createdContactId) {
    check('新行的属主 = 调用方', String(writer.id),
      psql(`select owner_user_id from ${CONTACT} where id = ${createdContactId}`));
    check('新行的租户 = 本租户', TENANT,
      psql(`select tenant_id from ${CONTACT} where id = ${createdContactId}`));
    check('新行的客户 = 文字里点名的客户', customerId,
      psql(`select customer_id from ${CONTACT} where id = ${createdContactId}`));
    check('模块为新行写了负责人权限行', 1, Number(psql(`select count(*) from ${PERMISSION}`
      + ` where biz_type = ${BIZ_TYPE_CONTACT} and biz_id = ${createdContactId}`
      + ` and user_id = ${writer.id} and level = ${LEVEL_OWNER}`)));
  } else {
    bad('新行的属主 = 调用方', String(writer.id), '<no row>');
    bad('新行的租户 = 本租户', TENANT, '<no row>');
    bad('新行的客户 = 文字里点名的客户', customerId, '<no row>');
    bad('模块为新行写了负责人权限行', 1, '<no row>');
  }
}

// ── 5) 场景 4 · 越权写被拒；参与方可读但不可写（D3 丙） ───────────────────────────────────────────
console.log('== 场景 4 · 越权写 / 参与方不可写 ==');
{
  // 更新 VO 把 name / customerId / ownerUserId 都声明为必填；`@Valid` 在方法体之前跑，故请求体必须给齐
  // （更新路径随后按切面把属主盖成调用方）。用 `name` 断「有没有改到」：模块的 `updateById` 忽略 null 字段。
  //
  // The save VO declares name/customerId/ownerUserId required; `@Valid` runs before the method body, so
  // the request must carry them (the advice then stamps the owner from the caller). `name` is the witness
  // of "did it change": `updateById` skips null fields.
  const body = (id, name) => ({
    id: Number(id), name, customerId: Number(customerId), ownerUserId: Number(second.id)
  });
  const updateAs = (token, id, name) =>
    api('/crm/contact/update', { method: 'PUT', token, body: body(id, name) });
  const nameOf = (id) => psql(`select name from ${CONTACT} where id = ${id}`);

  // B 改 A 的联系人：B 有 `crm:contact:update` 这条码（故越过了 @PreAuthorize），但没有 A 那一份的
  // 任何权限行 —— 拒绝来自模块自己的数据权限切面。
  // B writes A's contact: B holds `crm:contact:update` (so it passes @PreAuthorize) but has no permission
  // row for A's row — the refusal comes from the module's own data-permission aspect.
  const bHijack = await updateAs(secondToken, adminContactId, `${marker}-hijack-b`);
  check('B 改 A 的联系人被拒（信封 code 非 0）', true, bHijack.code !== 0);
  note('B 改 A 的拒绝读数', JSON.stringify({ code: bHijack.code, msg: bHijack.msg }).slice(0, 160));
  check('A 的联系人未被 B 改', adminContactName, nameOf(adminContactId));

  // 参与方改 A 的联系人：模块自己的接缝只要求 WRITE（W 有），本治理切面只认 OWNER（W 不是）——
  // 这正是「比模块更严」的那一处。
  // A participant writes A's contact: the module's own seam asks only WRITE (W has it), while this
  // governance advice asks only OWNER (W is not) — exactly the "stricter than the module" point.
  const wHijack = await updateAs(writerToken, adminContactId, `${marker}-hijack-w`);
  check('参与方改 A 的联系人被拒（信封 code 非 0）', true, wHijack.code !== 0);
  note('参与方改 A 的拒绝读数', JSON.stringify({ code: wHijack.code, msg: wHijack.msg }).slice(0, 160));
  check('A 的联系人未被参与方改', adminContactName, nameOf(adminContactId));

  // 正对照：B 改**自己**那一行。属主 = 调用方，模块与本切面都放行；没有它，上面两条拒绝也可能只是
  // 「更新这条路径整个坏了」。
  // The positive control: B writes **its own** row. Owner = caller, so the module and this advice both
  // allow it; without it, the two refusals above could just mean "update is broken entirely".
  const bOwn = await updateAs(secondToken, secondContactId, `${marker}-second-renamed`);
  check('B 改自己的联系人成功', 0, bOwn.code);
  check('B 自己的联系人确实改了', `${marker}-second-renamed`, nameOf(secondContactId));
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
    + ` from side_effects where tool_name = 'create_crm_contact' and result_type = 'crm_contact'`
    + ` order by id desc limit 1`);
  check('副作用台账记下这次写（best-effort）', `${writer.id}|create_crm_contact|crm_contact`, effect);

  check('有码那次执行在审计轨以本人身份在案', true, Number(psql(`select count(*) from ai_audit_logs`
    + ` where tool = 'create_crm_contact' and outcome = 'executed' and user_id = '${writer.id}'`)) > 0);

  // 宿主操作日志按**本轮唯一的联系人姓名**找：它就是日志模板里 {{#contact.name}} 的值。
  // The host operate log is located by the **contact name unique to this run**: it is the template's
  // `{{#contact.name}}`.
  if (createdContactId) {
    check('宿主操作日志记下了调用方', String(writer.id), await hostLoggedWho(writerMarker));
  } else {
    // 没有姓名就没有可点名的对象；空串去 `like '%%'` 会匹配任意一行，那是假绿。
    // With no name there is nothing to name; an empty `like '%%'` matches any row, which would be a false green.
    bad('宿主操作日志记下了调用方', String(writer.id), '<no row to name>');
  }

  const rows = Number(psql('select count(*) from ai_audit_logs'));
  check('审计行在（>0）', true, rows > 0);
  const verify = await (await fetch(`${HOST}/audit/verify`, { headers: { Authorization: `Bearer ${admin}` } })).json();
  check('链校验通过', true, verify.data && verify.data.valid);
}

// ── 7) 场景 6 · 7(a) 工具输出不含联系方式 ─────────────────────────────────────────────────────────
console.log('== 场景 6 · 7(a) 工具输出不含任何联系方式 ==');
{
  // 真栈那一半：夹具那条联系人的六列联系方式与跟进内容都非空，而场景 1 里读工具确实在这套数据上执行过。
  // The stack half: the fixture contact really carries all six channels plus follow-up content, and the
  // read tool did execute against this data in scene 1.
  check('夹具的联系人确实挂着全部联系方式', 1, Number(psql(`select count(*) from ${CONTACT}`
    + ` where id = ${adminContactId} and mobile is not null and telephone is not null and qq is not null`
    + ` and wechat is not null and email is not null and detail_address is not null`
    + ` and contact_last_content is not null`)));
  check('读工具在这套数据上真执行过', true, Number(psql(`select count(*) from ai_audit_logs`
    + ` where tool = 'list_crm_contacts' and outcome = 'executed' and user_id = '1'`)) > 0);

  // 返回结构那一半：运行时不上线工具结果，故直读 `ToolResult.data()` —— 见文件头对声明范围的说明。
  // The returned-structure half: the runtime does not put tool results on the wire, so read
  // `ToolResult.data()` directly — see the declared scope in the file header.
  const projection = runProjectionTest();
  note('投影测试读数', projection.verdict);
  if (!String(projection.verdict).startsWith('ok')) {
    console.log(`  note  投影测试输出尾部 →\n${projection.tail}`);
  }
  check('返回结构只有业务事实，不含任何联系方式', 'ok', String(projection.verdict).split(' ')[0]);
}

// ── 8) 场景 7 · 7(b) 看不见的客户名下建联系人被拒 ──────────────────────────────────────────────────
console.log('== 场景 7 · 7(b) 看不见的客户名下建联系人被拒 ==');
{
  // 同一调用方、同一工具、同一种文字形状，只把客户换成**它读不到**的那一个：客户 B 有权限行（非公海）、
  // 且没有 writer 的一行 ⇒ 切面在批准后的执行里拒掉它。上游只校验客户**存在**，故这一条比上游严。
  //
  // Same caller, same tool, same text shape; only the customer changes to one it cannot read: customer B
  // has permission rows (not public sea) and none for the writer, so the advice refuses it during the
  // post-approval execution. Upstream only checks that the customer exists, so this is stricter.
  const hiddenMarker = `${marker}-hidden`;
  const hiddenHeld = pendingCount(writer.id);
  const hiddenAnswer = await chat(writerToken, asked(hiddenCustomerId, hiddenMarker));
  note('看不见的客户那次的写读数', JSON.stringify({ toolCalls: hiddenAnswer.toolCalls, reply: String(hiddenAnswer.reply || '').slice(0, 160) }).slice(0, 260));
  check('看不见的客户那次的写也被扣下', hiddenHeld + 1, pendingCount(writer.id));
  const hiddenToken = pendingTokenFor(writer.id, hiddenMarker);
  checkNot('扣下时给出 token', 'undefined', hiddenToken);
  const hiddenOutcome = await confirm(writerToken, hiddenToken, 'approve');
  note('看不见的客户那次批准后的结局', hiddenOutcome.status || JSON.stringify(hiddenOutcome).slice(0, 160));
  const hiddenError = psql(`select coalesce(execution_error, '') from confirmation_requests where token = '${hiddenToken}'`);
  note('看不见的客户那次批准后的执行错误', hiddenError.slice(0, 240));
  check('批准后仍不执行（切面拒）', true, hiddenOutcome.status !== 'executed');
  check('拒绝的理由点名了数据范围', true, hiddenError.includes('该行不在你的数据范围内'));
  check('客户确实存在（不是「客户不存在」那类失败）', 1, Number(psql(`select count(*) from ${CUSTOMER} where id = ${hiddenCustomerId}`)));
  check('那一行没有落地', 0, Number(psql(`select count(*) from ${CONTACT} where name like '%${hiddenMarker}%'`)));
  check('那次拒绝在审计轨', true, Number(psql(`select count(*) from ai_audit_logs`
    + ` where tool = 'create_crm_contact' and outcome = 'refused' and detail like '%该行不在你的数据范围内%'`)) > 0);
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
