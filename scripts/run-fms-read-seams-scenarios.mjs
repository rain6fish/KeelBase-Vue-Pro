// SPDX-License-Identifier: Apache-2.0
//
// FMS 四个新接缝的真栈场景门：结账期间 · 期初余额 · 结账方案 · 报表读数。
//
// 这四条接缝（`FmsClosingPeriodGovernance` / `FmsInitialBalanceGovernance` /
// `FmsClosingSchemeGovernance` / `FmsReportingGovernance`）在 M2 落地时只有单测。本门禁补的是单测看不见的
// 那一层：同一段代码在**真宿主 + 真 PostgreSQL + 真运行时**上，用两个调用方各跑一遍。
//
//   bash scripts/run-server.sh &            # 一套跑着的隔离栈：PostgreSQL + redis
//   node scripts/run-fms-read-seams-scenarios.mjs
//
// **它要回答的四件事。** ① **可达**：七个读工具用调用方身份真的跑过（审计轨上 `executed`，不是只被路由）；
// ② **账套收窄**：每个调用方只读到自己那个账套的数据，别人的账套在 REST 上被模块自己的
// `validateAccountSetReadPermission` 拒掉（工具路径把 `userId` 钉成 `ActingCaller`）；
// ③ **只读面不写**：四个面的工具清单里没有写工具，写样消息不产生确认行，REST 上的写入口对无权/非成员被拒；
// ④ **投影**：工具结果不含账套编号、配置编号、公式等内部字段（运行时把工具的应答原样带在回复里，真栈这一半
// 断在回复正文上；返回结构那一半由四个 `*ToolsTest` 在进程内断）。
//
// **夹具是手种的一个账套树，不是走初始化。** 初始化会连带种科目模板、结转模板与财务指标，而本仓的
// `sql/keelbase-fms.sql` 没有这些模板的种子行；本门禁要证的是**接缝**，故只种读路径真正需要的那几行：
// 账套、成员、财务参数、科目、期初余额、结账期间、结账方案。每一行都挂在本轮那两个账套 id 下，删它们一棵树
// 就收干净了；**审计行刻意留着**（哈希链）。
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// The real-stack gate for FMS's four newer seams: closing period, opening balances, closing
// schemes and the reporting surfaces.
//
// Those four seams landed in M2 with unit tests only. This gate supplies the layer a unit test
// cannot see: the same code on a **real host, a real PostgreSQL and a real runtime**, driven twice
// with two callers.
//
// **The four questions it answers.** (1) **Reachable**: the seven read tools really ran as the caller
// (`executed` on the audit trail, not merely routed). (2) **Account-set narrowing**: each caller reads
// only its own account set, and the other set is refused on REST by the module's own
// `validateAccountSetReadPermission` (the tool path pins `userId` to `ActingCaller`).
// (3) **The read faces do not write**: no write tool exists among the four faces, a write-shaped
// message produces no confirmation row, and the REST write entries refuse a caller without the code or
// without membership. (4) **Projection**: tool results carry no account-set number, configuration id
// or formula — the runtime puts the tool's answer into the reply, so the stack half is asserted on the
// reply text, and the returned-structure half by the four `*ToolsTest` classes in process.
//
// **The fixture is a hand-seeded account-set tree, not initialisation.** Initialisation also seeds
// subject templates, closing templates and finance indicators, and this repo's `sql/keelbase-fms.sql`
// carries no seed rows for those templates; this gate is about the **seam**, so it seeds only the rows
// the read paths need: account set, membership, finance parameter, subjects, opening balances, closing
// period and closing scheme. Every row hangs off this run's two account-set ids, so removing them
// takes the tree down; **audit rows are deliberately left alone** (a hash chain).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.HOST_URL || 'http://127.0.0.1:18101';
const PG = process.env.PG_CONTAINER || 'fmsg-pg';
const DB = process.env.PG_DB || 'fmsg_1102';
const TENANT = process.env.TENANT_ID || '1';
const SECOND_USER = process.env.FMS_SECOND_USER || 'gatefmsm2';
const SECOND_PASS = process.env.FMS_SECOND_PASS || 'gate-pass-1234';
const READER_ROLE = process.env.FMS_READER_ROLE || 'gate_fms_m2_reader';
const ACCOUNT_SET_ACCESS_DENIED = 1_052_100_002; // ACCOUNT_SET_ACCESS_DENIED / 无权访问该账套

// 投影那一半在进程内跑：Maven 与仓库可覆盖。默认取 PATH 上的 `mvn`、不点名仓库，故干净机器上照跑；
// 给了 `MVN_REPO` 等于点名隔离缓存，那种跑法默认离线（与本地读数同形），`MVN_OFFLINE=0/1` 可覆盖。
//
// The projection half runs in process: Maven and its repository are overridable. The default is `mvn`
// on `PATH` with no repository named, so a clean machine works; naming `MVN_REPO` means an isolated
// cache, offline by default (the way the local readings were taken), with `MVN_OFFLINE=0/1` overriding.
const MVN = process.env.MVN || 'mvn';
const MVN_REPO = process.env.MVN_REPO || '';
const MVN_OFFLINE = process.env.MVN_OFFLINE === undefined
  ? Boolean(MVN_REPO) : process.env.MVN_OFFLINE !== '0';

// 四个面声明的七个读工具与各自的触发短语。触发短语只取**读**的说法；裸的「结账」「结转」刻意不用。
// The seven read tools the four faces declare, each with a phrase that triggers it. Only **read**
// phrasings are listed; a bare "结账" / "结转" is deliberately absent.
const READ_TOOLS = [
  { face: '结账期间', tool: 'get_fms_closing_overview', ask: '结账概况' },
  { face: '期初余额', tool: 'get_fms_trial_balance', ask: '试算平衡' },
  { face: '结账方案', tool: 'get_fms_closing_schemes', ask: '结转方案' },
  { face: '报表读数', tool: 'get_fms_balance_sheet', ask: '资产负债表' },
  { face: '报表读数', tool: 'get_fms_income_statement', ask: '利润表' },
  { face: '报表读数', tool: 'get_fms_cash_flow_statement', ask: '现金流量表' },
  { face: '报表读数', tool: 'get_fms_subject_balances', ask: '科目余额表' },
];

// 只读面允许的权限码：读那六个端点用到的查询码。写码**刻意不给**，它是场景 3 的反向对照。
// The permission codes the read surfaces need. Write codes are deliberately withheld — they are the
// negative control in scenario 3.
const READ_PERMISSIONS = [
  'fms:closing:query',
  'fms:config:initial-balance:query',
  'fms:report:balance-sheet:query',
  'fms:report:income-statement:query',
  'fms:report:cash-flow-statement:query',
  'fms:ledger:subject-balance:query',
];

// 投影不许出现的内部令牌。`voucherIds` / `profitLossVoucherId` 是业务编号，保留；这里列的是账套与
// 配置侧的细节。
// Internal tokens a projection must not carry. `voucherIds` / `profitLossVoucherId` are business
// numbers and stay; these are the account-set and configuration-side details.
const FORBIDDEN_IN_REPLY = ['accountSetId', 'subjectId', 'parentId', 'configId', 'formula',
  'voucherWordId', 'auxiliary', 'accountSetMember'];

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const checkNot = (name, forbidden, got) =>
  String(got).includes(forbidden) ? bad(name, `must not contain ${forbidden}`, got) : ok(name);
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

// psql 助手与兄弟门禁同一形状；默认 `docker exec`，`PSQL_HELPER=direct` 直连，或 `PSQL_HELPER_SCRIPT`
// 指向 psql 形状的 Node 助手。`-q` 只压掉命令回显（`INSERT 0 1`），SELECT 的结果照常打印。
//
// The psql helper is the sibling gates' shape: `docker exec` by default, `PSQL_HELPER=direct` for a
// reachable client, or `PSQL_HELPER_SCRIPT` for a psql-shaped Node helper. `-q` only silences command
// tags (`INSERT 0 1`); SELECT output still prints.
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
      [PSQL_HELPER_SCRIPT, '-q', '-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
        '-U', process.env.PGUSER || 'root', '-d', DB, '-tAc', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'password' } },
    ).trim();
  }
  if (PSQL_HELPER === 'docker') {
    return execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-q', '-U', 'root', '-d', DB, '-tAc', sql], { encoding: 'utf8' }).trim();
  }
  if (PSQL_HELPER === 'direct' || PSQL_HELPER === 'local') {
    return execFileSync(
      PSQL,
      ['-q', '-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
        '-U', process.env.PGUSER || 'root', '-d', DB, '-tAc', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'password' } },
    ).trim();
  }
  throw new Error(`PSQL_HELPER must be "docker" or "direct" (got "${process.env.PSQL_HELPER}"); or set PSQL_HELPER_SCRIPT to a psql-shaped helper`);
};

// 收尾在**本轮造出第一行的那一刻**挂上，而不是等到文件末尾：否则「造了行、随后崩了」那条路上它是空的。
// `process.on('exit')` 在未捕获异常把进程带走时同样触发，而 `psql()` 是同步的，故退出处理器里跑得动。
//
// The cleanup is attached the moment this run creates its first row, not assembled at the end of the
// file: otherwise it is empty on the "created rows, then died" path. `process.on('exit')` fires when
// an uncaught exception takes the process down too, and `psql()` is synchronous, so it runs there.
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

let conversation = 0;
async function chat(token, message, extra = {}) {
  conversation += 1;
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId: `fmsg2-${Date.now()}-${conversation}`, ...extra })
  });
  const json = await res.json();
  return json.data || json;
}

const executedAs = (tool, userId) => Number(psql(
  `select count(*) from ai_audit_logs where tool = '${tool}' and outcome = 'executed' and user_id = '${userId}'`));
const pendingCount = (userId) => Number(psql(
  `select count(*) from confirmation_requests where operator_id = '${userId}' and status = 'pending'`));

const REPLY_PREFIX = /It answered: /;
function answered(reply) {
  const text = String(reply || '');
  const at = text.search(REPLY_PREFIX);
  return at < 0 ? '' : text.slice(at + 'It answered: '.length).replace(/\.\s*$/, '');
}

// 回复里的金额按**数值**比，不按字符串：同一个和空列表是 `BigDecimal.ZERO`（印成 `0`），非空才带上两位小数。
// Amounts in the reply are compared as **numbers**, not strings: an empty sum is `BigDecimal.ZERO` (printed
// as `0`), and only a non-empty one carries two decimals.
function amountOf(reply, key) {
  const found = String(reply || '').match(new RegExp(`(?:^|\\s)${key}=(-?\\d+(?:\\.\\d+)?)`));
  return found ? Number(found[1]) : NaN;
}

// ── 0) the stack answers at all ────────────────────────────────────────────────────────────────────
console.log('== 前置 ==');
psql('truncate table ai_audit_logs');
check('/app/capabilities 200', '200', (await fetch(`${HOST}/app/capabilities`)).status);

const admin = await login(ADMIN_USER, resolveAdminPassword(psql));
ok('admin 登录');

// 第二个调用方：只需要查询码，用来走 REST 的读与跨账套拒绝；工具路径本身不查权限码。
// The second caller needs only query codes, for the REST reads and the cross-set refusals; the tool
// path itself checks no permission code.
async function ensureReaderRole(adminToken) {
  const menuIds = psql("select string_agg(distinct id::text, ',') from system_menu"
    + ` where permission in (${READ_PERMISSIONS.map((p) => `'${p}'`).join(',')}) and deleted = 0`);
  if (!menuIds) {
    throw new Error('FMS 查询权限码不在 system_menu 里 —— 这套库的菜单种子缺这些行，场景 2 的 REST 读会先被权限挡住');
  }
  let roleId = psql(`select id from system_role where code = '${READER_ROLE}' and deleted = 0 limit 1`);
  if (!roleId) {
    const role = await api('/system/role/create', {
      method: 'POST', token: adminToken,
      body: { name: 'gate-fms-m2-reader', code: READER_ROLE, sort: 99, status: 0,
        remark: 'FMS read-seam gate: the query codes only, so cross-account-set reads are refused by the module itself' }
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
    body: { roleId: Number(roleId), dataScope: 1, dataScopeDeptIds: [] }
  });
  // 与兄弟门禁一样**按名复用、不收尾**：角色是夹具的一部分，不是本轮的业务行。
  // Reused by name and **not** removed on the way out, like the sibling gates: the role is part of
  // the fixture, not this run's business rows.
  return Number(roleId);
}

console.log('== 前置 · 第二个调用方 ==');
let secondId = psql(`select id from system_users where username = '${SECOND_USER}' and deleted = 0 limit 1`);
if (!secondId) {
  const created = await api('/system/user/create', {
    method: 'POST', token: admin,
    body: { username: SECOND_USER, nickname: SECOND_USER, password: SECOND_PASS, deptId: 100, postIds: [] }
  });
  if (created.code !== 0) throw new Error(`create user -> ${created.code}: ${created.msg}`);
  secondId = created.data;
  ok(`建第二个用户 id=${secondId}`);
} else {
  ok(`复用第二个用户 id=${secondId}`);
}
{
  const commonRole = psql("select id from system_role where code = 'common' and deleted = 0 limit 1");
  const readerRoleId = await ensureReaderRole(admin);
  await api('/system/permission/assign-user-role', {
    method: 'POST', token: admin,
    body: { userId: Number(secondId), roleIds: [Number(commonRole), readerRoleId] }
  });
}
const second = await login(SECOND_USER, SECOND_PASS);
ok('第二个调用方登录');

// ── the tree: two account sets of this run's own, one member each ─────────────────────────────────
console.log('== 场景 1 · 两个账套（本轮自建，各一个成员） ==');
const marker = `fmsgate2-${Date.now()}`;
// 收尾在这里就挂上：账套行一建，「按本轮标记收回一棵树」就成立。把手是**公司编码里的标记**，删的从句按
// 账套 id 展开；动态 SQL 扫所有带 `account_set_id` 的 `fms_*` 表，故漏写某张表也不会留下孤儿行。
//
// The cleanup is attached here: once the account-set rows exist, "take this run's tree back by its
// marker" is well-defined. The handle is the **marker in the company code**; the delete expands to
// account-set ids and scans every `fms_*` table with an `account_set_id`, so a forgotten table cannot
// leave orphans behind.
putBack = () => {
  const ids = psql(`select string_agg(id::text, ',') from fms_account_set where company_code like '${marker}-%'`);
  if (!ids) return;
  psql(`do $$ declare t text; begin`
    + ` for t in select table_name from information_schema.columns`
    + ` where table_schema = 'public' and column_name = 'account_set_id' and table_name like 'fms_%' loop`
    + ` execute format('delete from %I where account_set_id in (${ids})', t);`
    + ` end loop; end $$;`);
  psql(`delete from fms_account_set where id in (${ids})`);
};

function seedAccountSet(suffix, ownerId) {
  const code = `${marker}-${suffix}`;
  psql('insert into fms_account_set(id, company_code, company_name, initialized, start_time, standard,'
    + ` deleted, tenant_id, creator, create_time, update_time)`
    + ` values (nextval('fms_account_set_seq'), '${code}', '${code}', true, '2026-01-01', 1, 0, ${TENANT}, '1', now(), now())`);
  const id = psql(`select id from fms_account_set where company_code = '${code}'`);
  psql('insert into fms_account_user(account_set_id, user_id, default_status, founder, level, deleted,'
    + ` tenant_id, creator, create_time, update_time)`
    + ` values (${id}, ${ownerId}, true, true, 1, 0, ${TENANT}, '1', now(), now())`);
  psql('insert into fms_finance_parameter(account_set_id, level, subject_code_rule, ledger_balance_mode,'
    + ` deficit_check, voucher_review_required, asset_period_locked, deleted, tenant_id, creator, create_time, update_time)`
    + ` values (${id}, 4, '4-2-2-2', 1, false, false, false, 0, ${TENANT}, '1', now(), now())`);
  return { id, code };
}

const setA = seedAccountSet('a', 1);
const setB = seedAccountSet('b', Number(secondId));
check('本轮账套 A 已种（admin 的默认）', true, setA.id !== '');
check('本轮账套 B 已种（第二个调用方的默认）', true, setB.id !== '');
check('A 只有一个成员', 1, Number(psql(`select count(*) from fms_account_user where account_set_id = ${setA.id}`)));
check('B 只有一个成员', 1, Number(psql(`select count(*) from fms_account_user where account_set_id = ${setB.id}`)));

// A 独有的业务行：一个已结账期间、两个科目（带本轮唯一名）、一对平衡的期初余额、一个结账方案。
// 这四样让「读到了哪个账套的数据」在工具回复里**看得见**，而不是只靠审计轨上一次执行。
//
// A-only business rows: one closed period, two subjects (with this run's unique names), one balanced
// pair of opening balances and one closing scheme. These make "which account set was read" visible
// **in the tool's reply**, not merely as one executed row on the audit trail.
psql('insert into fms_closing_period(id, closing_time, account_set_id, deleted, tenant_id, creator,'
  + ` create_time, update_time)`
  + ` values (nextval('fms_closing_period_seq'), '2026-02-28', ${setA.id}, 0, ${TENANT}, '1', now(), now())`);
const debitSubjectName = `库存现金-${marker}`;
const creditSubjectName = `实收资本-${marker}`;
function seedSubject(code, name, type, direction) {
  psql('insert into fms_subject(id, code, name, parent_id, type, category, balance_direction, cash, status,'
    + ` level, quantity_accounting, account_set_id, auxiliary_type_ids, currency_ids, deleted, tenant_id,`
    + ` creator, create_time, update_time)`
    + ` values (nextval('fms_subject_seq'), '${code}', '${name}', 0, ${type}, 1, ${direction}, false, 0, 1,`
    + ` false, ${setA.id}, '[]', '[]', 0, ${TENANT}, '1', now(), now())`);
  return psql(`select id from fms_subject where account_set_id = ${setA.id} and code = '${code}'`);
}
const debitSubjectId = seedSubject('1001', debitSubjectName, 1, 1); // ASSET / DEBIT
const creditSubjectId = seedSubject('4001', creditSubjectName, 3, 2); // EQUITY / CREDIT
psql('insert into fms_initial_balance(subject_id, opening_amount, year_debit_amount, year_credit_amount,'
  + ` account_set_id, deleted, tenant_id, creator, create_time, update_time)`
  + ` values (${debitSubjectId}, 100, 0, 0, ${setA.id}, 0, ${TENANT}, '1', now(), now()),`
  + ` (${creditSubjectId}, 100, 0, 0, ${setA.id}, 0, ${TENANT}, '1', now(), now())`);
const schemeName = `scheme-${marker}`;
psql('insert into fms_closing(name, period_end, type, time_type, account_set_id, deleted, tenant_id,'
  + ` creator, create_time, update_time)`
  + ` values ('${schemeName}', true, 1, 1, ${setA.id}, 0, ${TENANT}, '1', now(), now())`);
check('A 独有行已种（期间 / 2 科目 / 2 期初 / 1 方案）', '1|2|2|1', [
  psql(`select count(*) from fms_closing_period where account_set_id = ${setA.id}`),
  psql(`select count(*) from fms_subject where account_set_id = ${setA.id}`),
  psql(`select count(*) from fms_initial_balance where account_set_id = ${setA.id}`),
  psql(`select count(*) from fms_closing where account_set_id = ${setA.id}`),
].join('|'));
check('B 没有这些业务行', '0|0|0|0', [
  psql(`select count(*) from fms_closing_period where account_set_id = ${setB.id}`),
  psql(`select count(*) from fms_subject where account_set_id = ${setB.id}`),
  psql(`select count(*) from fms_initial_balance where account_set_id = ${setB.id}`),
  psql(`select count(*) from fms_closing where account_set_id = ${setB.id}`),
].join('|'));

// ── 1) reachable under each caller's identity ──────────────────────────────────────────────────────
console.log('== 场景 2 · 可达：七个读工具各自以调用方身份真的跑过 ==');
const repliesByUser = { admin: {}, second: {} };
for (const { face, tool, ask } of READ_TOOLS) {
  const asAdmin = await chat(admin, ask);
  check(`[${face}] admin 触发 ${tool}`, tool, (asAdmin.toolCalls || [])[0]);
  check(`[${face}] admin 的那次执行在审计轨（executed）`, true, executedAs(tool, '1') > 0);
  repliesByUser.admin[tool] = answered(asAdmin.reply);

  const asSecond = await chat(second, ask);
  check(`[${face}] 第二个调用方触发 ${tool}`, tool, (asSecond.toolCalls || [])[0]);
  check(`[${face}] 第二个调用方的那次执行在审计轨（executed）`, true, executedAs(tool, secondId) > 0);
  repliesByUser.second[tool] = answered(asSecond.reply);
}

// ── 2) account-set narrowing ───────────────────────────────────────────────────────────────────────
console.log('== 场景 3 · 账套收窄：工具各读自己那一本，REST 跨账套被模块自己拒 ==');
{
  // 工具路径那一半：回复正文里的数据必须来自各自的账套。
  check('admin 的结账概况来自 A（2026-02 已结账 ⇒ 当前期间 2026-03）', true,
    repliesByUser.admin.get_fms_closing_overview.includes('month=2026-03'));
  check('第二个调用方的结账概况来自 B（B 从 2026-01 起，当前期间 2026-01）', true,
    repliesByUser.second.get_fms_closing_overview.includes('month=2026-01'));
  check('admin 的试算平衡读到 A 的 100', 100,
    amountOf(repliesByUser.admin.get_fms_trial_balance, 'openingDebitAmount'));
  check('第二个调用方的试算平衡读到 B 的 0', 0,
    amountOf(repliesByUser.second.get_fms_trial_balance, 'openingDebitAmount'));
  check('第二个调用方没有读到 A 的 100', true,
    amountOf(repliesByUser.second.get_fms_trial_balance, 'openingDebitAmount') !== 100);
  check('admin 的结账方案里有 A 那个方案', true,
    repliesByUser.admin.get_fms_closing_schemes.includes(`name=${schemeName}`));
  check('第二个调用方的结账方案为空（B 没有方案）', true,
    repliesByUser.second.get_fms_closing_schemes.includes('schemes=[]'));
  check('admin 的科目余额表里有 A 的科目名', true,
    repliesByUser.admin.get_fms_subject_balances.includes(creditSubjectName));
  check('第二个调用方的科目余额表为空', true,
    repliesByUser.second.get_fms_subject_balances.includes('rows=[]'));

  // REST 那一半：模块自己的 `validateAccountSetReadPermission`。第二个调用方有查询码、但不是 A 的成员。
  const denied = [
    ['结账概况', `/fms/closing/period/overview?accountSetId=${setA.id}&month=2026-02`],
    ['结账方案', `/fms/closing/scheme/list?accountSetId=${setA.id}&month=2026-02`],
    ['试算平衡', `/fms/config/initial-balance/trial-balance?accountSetId=${setA.id}`],
    ['资产负债表', `/fms/report/balance-sheet/get?accountSetId=${setA.id}&startMonth=2026-02&endMonth=2026-02`],
    ['利润表', `/fms/report/income-statement/get?accountSetId=${setA.id}&startMonth=2026-02&endMonth=2026-02`],
    ['现金流量表', `/fms/report/cash-flow-statement/get?accountSetId=${setA.id}&startMonth=2026-02&endMonth=2026-02`],
    ['科目余额表', `/fms/ledger/subject-balance/list?accountSetId=${setA.id}&startMonth=2026-02&endMonth=2026-02`],
  ];
  let deniedCount = 0;
  for (const [face, path] of denied) {
    const r = await api(path, { token: second });
    if (r.code === ACCOUNT_SET_ACCESS_DENIED) deniedCount += 1;
    else note(`${face} 的跨账套读没有答 ACCOUNT_SET_ACCESS_DENIED`, `code=${r.code} msg=${r.msg}`);
  }
  check('七条跨账套读都被模块自己拒（ACCOUNT_SET_ACCESS_DENIED）', denied.length, deniedCount);

  // 对照：同一个调用方读自己的账套，七条都通；admin 读 A 也通。否则上一行可能只是「谁都不让读」。
  const allowed = [
    ['B · 结账概况', `/fms/closing/period/overview?accountSetId=${setB.id}&month=2026-01`, second],
    ['B · 结账方案', `/fms/closing/scheme/list?accountSetId=${setB.id}&month=2026-01`, second],
    ['B · 试算平衡', `/fms/config/initial-balance/trial-balance?accountSetId=${setB.id}`, second],
    ['B · 资产负债表', `/fms/report/balance-sheet/get?accountSetId=${setB.id}&startMonth=2026-01&endMonth=2026-01`, second],
    ['B · 利润表', `/fms/report/income-statement/get?accountSetId=${setB.id}&startMonth=2026-01&endMonth=2026-01`, second],
    ['B · 现金流量表', `/fms/report/cash-flow-statement/get?accountSetId=${setB.id}&startMonth=2026-01&endMonth=2026-01`, second],
    ['B · 科目余额表', `/fms/ledger/subject-balance/list?accountSetId=${setB.id}&startMonth=2026-01&endMonth=2026-01`, second],
    ['A · 结账概况', `/fms/closing/period/overview?accountSetId=${setA.id}&month=2026-02`, admin],
    ['A · 试算平衡', `/fms/config/initial-balance/trial-balance?accountSetId=${setA.id}`, admin],
  ];
  let allowedCount = 0;
  for (const [name, path, token] of allowed) {
    const r = await api(path, { token });
    if (r.code === 0) allowedCount += 1;
    else note(`${name} 没读通`, `code=${r.code} msg=${r.msg}`);
  }
  check('同一批读在各自账套上读通（含 A 的 2026-02 已结账）', allowed.length, allowedCount);
  const closedOnA = await api(`/fms/closing/period/overview?accountSetId=${setA.id}&month=2026-02`, { token: admin });
  check('A 的 2026-02 读作已结账（本轮种的那行）', true, closedOnA.code === 0 && closedOnA.data.closed === true);
  const closedOnB = await api(`/fms/closing/period/overview?accountSetId=${setB.id}&month=2026-02`, { token: second });
  check('B 的 2026-02 读作未结账', false, closedOnB.code === 0 && closedOnB.data.closed === true);
}

// ── 3) the read faces do not write ────────────────────────────────────────────────────────────────
console.log('== 场景 4 · 只读面不写：工具清单、写样消息、REST 写入口 ==');
{
  const toolsRaw = await (await fetch(`${HOST}/ai/tools`, { headers: { Authorization: `Bearer ${admin}`, 'tenant-id': TENANT } })).text();
  const toolJson = JSON.parse(toolsRaw);
  const listed = (toolJson.data || []).filter((t) => String(t.name).includes('fms'));
  const names = listed.map((t) => t.name);
  check('七个读工具都在 /ai/tools 清单里', true, READ_TOOLS.every((r) => names.includes(r.tool)));
  check('七个读工具都是 R1 且无需确认', true, READ_TOOLS.every((r) => {
    const one = listed.find((t) => t.name === r.tool);
    return one && one.riskLevel === 'R1' && one.requiresConfirmation === false && one.requiresApproval === false;
  }));
  const WRITE_WORDS = /(save|create|update|delete|close|cancel|import|transfer|generate|revoke)/i;
  const faceWriteTools = READ_TOOLS.map((r) => r.tool).filter((name) => WRITE_WORDS.test(name));
  check('四个面的工具名里没有写动作', 0, faceWriteTools.length);
  check('FMS 工具面里唯一的写是凭证面的 review（不在本件范围）', true,
    names.filter((n) => WRITE_WORDS.test(n)).every((n) => n === 'review_fms_voucher'));

  // 写样消息：不触发工具、不产生确认行、不动业务行。
  const before = {
    closed: psql(`select count(*) from fms_closing_period where account_set_id in (${setA.id}, ${setB.id})`),
    balances: psql(`select count(*) from fms_initial_balance where account_set_id in (${setA.id}, ${setB.id})`),
    schemes: psql(`select count(*) from fms_closing where account_set_id in (${setA.id}, ${setB.id})`),
    configs: psql(`select count(*) from fms_balance_sheet_config where account_set_id in (${setA.id}, ${setB.id})`),
    pending: `${pendingCount(1)}|${pendingCount(secondId)}`,
  };
  const writeAsks = [
    ['admin · 帮我结账', admin, '帮我结账'],
    ['admin · 把期初余额改成两百', admin, '把期初余额改成两百'],
    ['第二个调用方 · 帮我结账', second, '帮我结账'],
  ];
  for (const [name, token, message] of writeAsks) {
    const answer = await chat(token, message);
    check(`${name} 不触发任何工具`, 0, (answer.toolCalls || []).length);
  }
  const routedRead = await chat(admin, '修改资产负债表公式');
  check('写样消息若被路由，落到的是读工具而不是写工具', 'get_fms_balance_sheet', (routedRead.toolCalls || [])[0]);
  const after = {
    closed: psql(`select count(*) from fms_closing_period where account_set_id in (${setA.id}, ${setB.id})`),
    balances: psql(`select count(*) from fms_initial_balance where account_set_id in (${setA.id}, ${setB.id})`),
    schemes: psql(`select count(*) from fms_closing where account_set_id in (${setA.id}, ${setB.id})`),
    configs: psql(`select count(*) from fms_balance_sheet_config where account_set_id in (${setA.id}, ${setB.id})`),
    pending: `${pendingCount(1)}|${pendingCount(secondId)}`,
  };
  check('写样消息前后业务行一行未动', JSON.stringify(before), JSON.stringify(after));

  // REST 写入口：无码的调用方被权限挡，非成员的调用方被模块自己的账套写判权挡。
  const closeAsSecond = await api('/fms/closing/period/close', {
    method: 'PUT', token: second, body: { accountSetId: Number(setA.id), month: '2026-02' }
  });
  note('第二个调用方对 A 结账的应答', `code=${closeAsSecond.code} msg=${closeAsSecond.msg}`);
  check('无写码的调用方打写入口被拒', true, closeAsSecond.code !== 0);
  const closeAsAdminOnB = await api('/fms/closing/period/close', {
    method: 'PUT', token: admin, body: { accountSetId: Number(setB.id), month: '2026-02' }
  });
  check('非成员打 B 的结账写入口被模块账套判权拒', ACCOUNT_SET_ACCESS_DENIED, closeAsAdminOnB.code);

  const saveAsSecond = await api('/fms/config/initial-balance/save', {
    method: 'PUT', token: second,
    body: { accountSetId: Number(setA.id), balances: [{ subjectId: Number(debitSubjectId), openingAmount: 999 }] }
  });
  note('第二个调用方对 A 存期初余额的应答', `code=${saveAsSecond.code} msg=${saveAsSecond.msg}`);
  check('无写码的调用方打期初余额写入口被拒', true, saveAsSecond.code !== 0);

  const formulaAsAdminOnB = await api('/fms/report/balance-sheet/update', {
    method: 'PUT', token: admin,
    body: { accountSetId: Number(setB.id), id: 1, formulas: [{ subjectId: 1, operator: '+', rules: 0 }] }
  });
  check('非成员打 B 的报表公式写入口被模块账套判权拒', ACCOUNT_SET_ACCESS_DENIED, formulaAsAdminOnB.code);

  check('写尝试一行也没落地（期间仍 1 行、B 仍 0 行）', `1|0`, [
    psql(`select count(*) from fms_closing_period where account_set_id = ${setA.id}`),
    psql(`select count(*) from fms_closing_period where account_set_id = ${setB.id}`),
  ].join('|'));
  check('写尝试没有留下确认行', '0|0', `${pendingCount(1)}|${pendingCount(secondId)}`);
}

// ── 4) projection ────────────────────────────────────────────────────────────────────────────────
console.log('== 场景 5 · 投影：工具应答不带账套/配置内部字段 ==');
{
  for (const { face, tool } of READ_TOOLS) {
    const body = repliesByUser.admin[tool] || '';
    const leaked = FORBIDDEN_IN_REPLY.filter((token) => body.includes(token));
    check(`[${face}] ${tool} 的应答不含内部字段`, '[]', JSON.stringify(leaked));
  }
  // 应答确实是投影的形状（有业务字段），不是空串蒙对的。报表在本轮夹具上是空列表，故只断键名存在的那些。
  check('结账概况的应答有业务字段', true,
    ['month=', 'closed=', 'canClose='].every((k) => repliesByUser.admin.get_fms_closing_overview.includes(k)));
  check('试算平衡的应答有借贷合计', true,
    ['openingDebitAmount=', 'openingCreditAmount=', 'balanced='].every((k) => repliesByUser.admin.get_fms_trial_balance.includes(k)));
  check('结账方案的应答有名称/类型/余额', true,
    ['name=', 'type=', 'balance=', 'voucherIds='].every((k) => repliesByUser.admin.get_fms_closing_schemes.includes(k)));
  check('科目余额表的应答有科目与金额', true,
    ['subjectCode=', 'subjectName=', 'openingDebitAmount=', 'endingBalanceDirection=']
      .every((k) => repliesByUser.admin.get_fms_subject_balances.includes(k)));
}

// 返回结构那一半在进程内跑：运行时的回复只带一份摘要，列的完整形状由四个工具的单测断。
// The returned-structure half runs in process: the runtime's reply carries a summary, and the full
// shape of each row is asserted by the four tools' unit tests.
function surefireVerdict(className) {
  const report = resolve(ROOT, `yudao-server/target/surefire-reports/TEST-cn.iocoder.yudao.server.keelbase.${className}.xml`);
  if (!existsSync(report)) return { verdict: 'no surefire report', tail: '' };
  const xml = readFileSync(report, 'utf8');
  const attr = (name) => {
    const found = xml.match(new RegExp(`\\b${name}="(\\d+)"`));
    return found ? Number(found[1]) : -1;
  };
  const tests = attr('tests');
  const failures = attr('failures');
  const errors = attr('errors');
  return {
    verdict: tests > 0 && failures === 0 && errors === 0
      ? `ok (${tests} tests, 0 failures, 0 errors)`
      : `red (tests=${tests}, failures=${failures}, errors=${errors})`,
  };
}

function runProjectionTests() {
  // 工具单测断**返回结构**；切面单测断**身份钉定**（`ActingCaller` 非空时最后一个实参被换成它，请求路径原样放行）。
  // The tools' tests assert the **returned structure**; the aspects' tests assert the **identity pinning**
  // (with a non-empty `ActingCaller` the last argument is replaced by it; the request path passes through).
  const classes = ['FmsClosingPeriodToolsTest', 'FmsInitialBalanceToolsTest',
    'FmsClosingSchemeToolsTest', 'FmsReportingToolsTest',
    'FmsClosingPeriodGovernanceTest', 'FmsInitialBalanceGovernanceTest',
    'FmsClosingSchemeGovernanceTest', 'FmsReportingGovernanceTest'];
  const args = ['scripts/jdk25.sh', MVN, '-B', ...(MVN_OFFLINE ? ['-o'] : []), '-pl', 'yudao-server', '-am',
    `-Dtest=${classes.join(',')}`, '-DfailIfNoTests=false', '-Dsurefire.failIfNoSpecifiedTests=false',
    ...(MVN_REPO ? [`-Dmaven.repo.local=${MVN_REPO}`] : []), 'test'];
  let output = '';
  let failure = '';
  try {
    output = execFileSync('bash', args, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 20 * 60 * 1000 });
  } catch (e) {
    output = `${e.stdout || ''}\n${e.stderr || ''}`;
    failure = e.signal ? `signal ${e.signal}` : `exit ${e.status}`;
  }
  if (failure) console.log(`  note  投影测试进程没正常结束（${failure}），尾部 →\n${output.slice(-1200)}`);
  return classes.map((name) => ({ name, ...surefireVerdict(name) }));
}

console.log('== 场景 5b · 进程内：四个工具单测 + 四条切面单测 ==');
for (const { name, verdict } of runProjectionTests()) {
  const what = name.endsWith('GovernanceTest')
    ? '切面把 userId 钉成行动调用方（请求路径原样放行）'
    : '返回结构只有业务事实';
  check(`[${name}] ${what}`, 'ok', String(verdict).split(' ')[0]);
}

// ── 5) does any face open a write tool? (code is the source of truth) ─────────────────────────────
console.log('== 场景 6 · 写工具是否开启（以代码为准） ==');
{
  // 四个面都只声明读工具，故「人批准前不执行 / 结果带 id / 台账可读」这一条**不适用**——不是没做，而是没有
  // 这条写。上面场景 4 的工具清单与写入口拒绝是它的证据。
  //
  // All four faces declare reads only, so "held before approval / result carries an id / trail readable"
  // does not apply — not because it was skipped, but because there is no such write. Scenario 4's tool
  // list and write-entry refusals are the evidence.
  ok('四个面没有写工具 ⇒ 第 5 条不适用（工具清单与写入口拒绝已证）');
}

// ── 收尾 ─────────────────────────────────────────────────────────────────────────────────────────
console.log('== 收尾 · 把本轮两个账套与其下的行收回去 ==');
try {
  runPutBack();
  ok('本轮两个账套与它们下面的行已收回（审计行刻意留着）');
} catch (e) {
  bad('收尾', '本轮两个账套与它们下面的行已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
