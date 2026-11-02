// SPDX-License-Identifier: Apache-2.0
//
// YD-10's gate: the tenant a governed write lands in is **the caller's**, not a constant.
//
//   bash scripts/run-server.sh &            # a running stack, PostgreSQL + redis
//   node scripts/run-tenant-scenarios.mjs
//
// Why it exists. Until this line's D39/D40 landed, the adapter ran every host-service call inside
// `TenantUtils.execute(SPIKE_TENANT_ID, …)` — one hard-coded tenant, declared in three places. The
// judgement it has to meet is narrow and checkable: **a caller on tenant ≠ 1 is no longer resolved as
// tenant 1.** The counter-proof the read-only inventory asked for is the one that matters here, and it
// is stated as a comparison rather than a before/after rerun: two callers on **two different tenants**
// each make the same write, and the two rows must land in **two different tenants**. If the value were
// still a constant, both rows would read the same tenant — so "the two differ" is what says the value is
// actually read, and "row B is not tenant 1" is what says it follows the caller.
//
// ⚠ The gate is written so it cannot pass by accident on a busy database: every reading is keyed off
// **this run's own marker**, never off a count of the table.
//
// YD-10 的门禁：一次受治理的写落在**哪个租户**，取决于**调用方**，不是一个常量。
//
// 为什么要有它：在 `D39`/`D40` 落地之前，适配器把每一次宿主服务调用都包在
// `TenantUtils.execute(SPIKE_TENANT_ID, …)` 里——一个写死的租户，声明在三处。它要满足的判据很窄、可核：
// **一个 tenant≠1 的调用方，不再被按 tenant 1 解析。** 只读盘点要求的那条**反证**在这里是主线，且写成
// **比较**而不是「改前改后各跑一次」：**两个不同租户**的调用方各做同一次写，两行必须落在**两个不同的租户**。
// 如果那个值还是常量，两行会读作同一个租户——所以「两者不同」说明它**真被读到**，「B 那行不是租户 1」说明它
// **跟着调用方走**。
//
// ⚠ 这道闸刻意写成**不可能在一张忙的库上侥幸通过**：每个读数都挂在**本轮自己的标记**上，绝不数整张表。
//
// **它造的东西，它收回去** —— 包括它建的**那个租户与那个用户**（`GateTenant` 自本轮起不再留在库里复用；
// 代价是下一次运行要重新建、并等过宿主那一分钟的租户缓存）。收尾只按本轮的三个标记删业务行，
// 租户名下则按 `tenant_id` 收、表名现查。**审计行刻意不动**：哈希链，剪它一环比凌乱更坏。
//
// Everything it creates, it removes again — including the **tenant and user it creates** (`GateTenant` is no
// longer left in the database for reuse, at the cost of recreating it next run and waiting out the host's
// one-minute tenant cache). The business rows go by this run's three markers; the tenant's own rows go by
// `tenant_id`, with the table list read from `information_schema`. Audit rows are deliberately left alone.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const ROOT_TENANT = 1;
const GATE_TENANT_NAME = process.env.GATE_TENANT_NAME || 'GateTenant';
const GATE_USER = process.env.GATE_USER || 'gatetenant';
const GATE_PASS = process.env.GATE_PASS || 'gate-tenant-1234';

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

const psql = (sql) =>
  execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-U', 'root', '-d', DB, '-tAc', sql], { encoding: 'utf8' }).trim();

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

// The admin API asks for a tenant; the AI and confirmation paths are the runtime's own and are called
// with the same header, because **carrying the tenant is the whole point** (D39: the request carries it).
// A call without that header is deliberately left as a reading below, not as a working path.
// 管理端 API 要租户；AI 与确认那两条路是运行时自己的，也用同一个头调，因为**「请求携带」正是要点**（`D39`）。
// 不带这个头的调用**刻意**只作下面的一条读数，不作一条可用的路。
const headers = (token, tenant) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...(tenant === null || tenant === undefined ? {} : { 'tenant-id': String(tenant) })
});

async function api(path, { method = 'GET', token, tenant = ROOT_TENANT, body } = {}) {
  const res = await fetch(`${HOST}/admin-api${path}`, { method, headers: headers(token, tenant), ...(body ? { body: JSON.stringify(body) } : {}) });
  return res.json();
}

async function login(username, password, tenant) {
  const r = await api('/system/auth/login', { method: 'POST', tenant, body: { username, password } });
  if (r.code !== 0) throw new Error(`login(${username}@${tenant}) -> ${r.code}: ${r.msg}`);
  return r.data.accessToken;
}

const userIdOf = (username, tenant) =>
  psql(`select id from system_users where username = '${username}' and tenant_id = ${tenant} and deleted = 0 limit 1`);

// One governed write, taken all the way to a real row: ask, approve, and report what the console said.
// 一次受治理的写，走到真的落库：提问、批准，并报出控制台说了什么。
async function makeCustomer({ token, tenant, label, marker, operatorId }) {
  const chatRes = await fetch(`${HOST}/ai/chat`, {
    method: 'POST', headers: headers(token, tenant),
    body: JSON.stringify({ message: `新建客户 ${marker}`, conversationId: `tenant-gate-${label}-${Date.now()}` })
  });
  const chatJson = await chatRes.json();
  const held = chatJson.data || chatJson;

  const confirmationToken =
    held.token || held.confirmationToken ||
    psql(`select token from confirmation_requests where operator_id = '${operatorId}' and status = 'pending' order by id desc limit 1`);

  const confRes = await fetch(`${HOST}/ai/confirmations/${confirmationToken}`, {
    method: 'POST', headers: headers(token, tenant), body: JSON.stringify({ decision: 'approve' })
  });
  const confJson = await confRes.json();
  return { marker, http: chatRes.status, outcome: confJson.data || confJson };
}

// ── 0) the stack answers, and the second tenant exists ───────────────────────────────────────────
console.log('== 前置 ==');
check('/app/capabilities 200', '200', (await fetch(`${HOST}/app/capabilities`)).status);
const rootToken = await login(ADMIN_USER, resolveAdminPassword(psql), ROOT_TENANT);
ok('admin@1 登录');

// 闸租户的套餐要**含 CRM 那两个写权限码**：工具路径现在与 REST 同一条判据（`CrmCustomerTools`），而
// 「普通套餐」（111）里没有 CRM 的菜单。于是本门禁在 111 的菜单表上并进 476 / 477，建一个只给闸租户用的套餐；
// 否则场景 2 的调用方会因缺 `crm:customer:create` 被拒，而本门禁要证的（租户传递）就没机会发生。
//
// The gate tenant's package must **hold the two CRM write codes**: the tool path now asks REST's own
// permission question (`CrmCustomerTools`), and the "ordinary" package (111) carries no CRM menus. So this
// gate unions 476 / 477 into 111's menu set and creates a package used only by the gate tenant; otherwise
// scenario 2's caller is refused for lacking `crm:customer:create` and what this gate proves (tenant
// propagation) never happens.
const baseMenuIds = JSON.parse(psql('select menu_ids from system_tenant_package where id = 111'));
const gateMenuIds = [...new Set([...baseMenuIds, 476, 477])];
const GATE_PACKAGE_NAME = 'GateTenantPackage';
let gatePackageId = psql(`select id from system_tenant_package where name = '${GATE_PACKAGE_NAME}' limit 1`);
if (!gatePackageId) {
  const pkg = await api('/system/tenant-package/create', {
    method: 'POST', token: rootToken,
    body: { name: GATE_PACKAGE_NAME, status: 0, remark: 'tenant gate: package 111 + the CRM write codes', menuIds: gateMenuIds }
  });
  if (pkg.code !== 0) throw new Error(`create gate package -> ${pkg.code}: ${pkg.msg}`);
  gatePackageId = pkg.data;
} else {
  await api('/system/tenant-package/update', {
    method: 'PUT', token: rootToken,
    body: { id: Number(gatePackageId), name: GATE_PACKAGE_NAME, status: 0, remark: 'tenant gate: package 111 + the CRM write codes', menuIds: gateMenuIds }
  });
}

let tenantId = psql(`select id from system_tenant where name = '${GATE_TENANT_NAME}' limit 1`);
if (!tenantId) {
  const created = await api('/system/tenant/create', {
    method: 'POST', token: rootToken,
    body: {
      name: GATE_TENANT_NAME, contactName: GATE_TENANT_NAME, status: 0, packageId: Number(gatePackageId),
      // yudao's request body takes the expiry as epoch **milliseconds**, not a formatted string: a
      // string is accepted without error and silently stored as the epoch, which then reads as
      // "expired".  yudao 的请求体把过期时间收作**纪元毫秒**，不是格式化字符串：传字符串**不报错**、
      // 静默存成纪元，于是读作「已过期」。
      expireTime: Date.UTC(2030, 11, 31, 0, 0, 0), accountCount: 10,
      username: GATE_USER, password: GATE_PASS
    }
  });
  if (created.code !== 0) throw new Error(`create tenant -> ${created.code}: ${created.msg}`);
  tenantId = created.data;
  ok(`建闸租户 id=${tenantId}`);
} else {
  ok(`复用闸租户 id=${tenantId}`);
}
check('闸租户不是 1 号', true, String(tenantId) !== String(ROOT_TENANT));

// 本轮**唯一一个**标记，三个标签都从它派生（`-root` / `-gate` / `-noheader`）—— 早先是每个调用各造一个，
// 于是「本轮造了什么」在崩溃路径上说不全。收尾也**在这里**就挂上（见文件上方 `putBack` 那段）：租户与标记
// 一有，把它收回去就成立，而下面任何一处崩了，退出处理器都会替这一轮跑它。租户名下要收哪些表是**调用时**
// 现查 `information_schema` 的。
//
// One marker for this whole run, with all three labels derived from it (`-root` / `-gate` / `-noheader`) — it used
// to mint one per call, which is why "what did this run create" could not be said in full on a crash path. The
// cleanup is attached **here** too (see the `putBack` note near the top): once the tenant and the marker exist,
// putting them back is well-defined, and anything below dying still gets it run by the exit handler. Which tables
// the tenant owns is read from `information_schema` **when the cleanup is called**.
const runMarker = `tenantgate-${Date.now()}`;
putBack = () => {
  const byName = `name like '%${runMarker}%'`;
  const byArgs = `args_json like '%${runMarker}%'`;
  const tenantTables = (psql(`select string_agg(table_name, ',') from information_schema.columns where table_schema = 'public' and column_name = 'tenant_id'`) || '')
    .split(',')
    .filter(Boolean);
  psql(
    [
      // `side_effects.result_id` 自 0.1.16 起是文本（效果 id 可能是 UUID），而客户表的 `id` 是 bigint ——
      // 不转就 `character varying = bigint`、整句失败，收尾一条也删不掉。与 `run-bypass-audit-scenarios.mjs`
      // 同一处修法。
      //
      // `side_effects.result_id` is text as of 0.1.16 (an effect id can be a UUID) while the customer table's
      // `id` is bigint; without the cast this is `character varying = bigint`, the statement fails, and the
      // cleanup removes nothing. The same fix as `run-bypass-audit-scenarios.mjs`.
      `delete from write_claims where effect_id in (select id from side_effects where result_type = 'crm_customer' and result_id in (select id::text from crm_customer where ${byName}))`,
      `delete from side_effects where result_type = 'crm_customer' and result_id in (select id::text from crm_customer where ${byName})`,
      // 一次性栈（CI）保留确认行，好让 RY-19 的确认率有分母；共用库上照旧收干净。
      // An ephemeral stack (CI) keeps the confirmation rows so RY-19's confirmation rate has a
      // denominator; a shared database still cleans them up.
      ...(process.env.KEEP_CONFIRMATIONS === '1' ? [] : [`delete from confirmation_requests where ${byArgs}`]),
      `delete from crm_customer where ${byName}`,
      ...tenantTables.map((t) => `delete from ${t} where tenant_id = ${tenantId}`),
      `delete from system_tenant where id = ${tenantId}`,
      // 闸租户的套餐只服务这一轮；租户行删掉之后再收它。
      // The gate package serves only this run; it goes after the tenant row does.
      `delete from system_tenant_package where id = ${gatePackageId}`,
    ].join('; '),
  );
};

// The host caches "is this tenant valid" for a minute, so a tenant created an instant ago still reads as
// expired for up to that long. Waiting it out is the honest fix; retrying is not the same thing.
// 宿主把「这个租户有效吗」缓存一分钟，故一个刚建的租户在那一分钟里仍读作已过期。等它过去才是诚实的修法；
// 靠重试不是同一件事。
let tenantToken = '';
for (let attempt = 1; attempt <= 10; attempt += 1) {
  try {
    tenantToken = await login(GATE_USER, GATE_PASS, tenantId);
    ok(`第二个调用方登录（@${tenantId}）`);
    break;
  } catch (err) {
    if (attempt === 10) throw err;
    await new Promise((r) => setTimeout(r, 15000));
  }
}

// ── 1) the same write, made by a caller on each tenant ───────────────────────────────────────────
console.log('== 场景 1 · 1 号租户的调用方写一笔 ==');
const rootOp = userIdOf('admin', ROOT_TENANT);
const a = await makeCustomer({ token: rootToken, tenant: ROOT_TENANT, label: 'root', marker: `${runMarker}-root`, operatorId: rootOp });
note('[root] /ai/chat', `HTTP ${a.http} · 结局 ${JSON.stringify(a.outcome).slice(0, 120)}`);
check('[root] 批准后执行', 'executed', a.outcome.status);
const rowA = psql(`select id, tenant_id, owner_user_id from crm_customer where name like '%${a.marker}%'`);
note('[root] 落库行', rowA || '(none)');
check('[root] 本轮那一行已落', true, rowA !== '');

console.log('== 场景 2 · 闸租户的调用方写同一笔 ==');
const gateOp = userIdOf(GATE_USER, tenantId);
const b = await makeCustomer({ token: tenantToken, tenant: tenantId, label: 'gate', marker: `${runMarker}-gate`, operatorId: gateOp });
note('[gate] /ai/chat', `HTTP ${b.http} · 结局 ${JSON.stringify(b.outcome).slice(0, 120)}`);
check('[gate] 批准后执行', 'executed', b.outcome.status);
const rowB = psql(`select id, tenant_id, owner_user_id from crm_customer where name like '%${b.marker}%'`);
note('[gate] 落库行', rowB || '(none)');
check('[gate] 本轮那一行已落', true, rowB !== '');

// ── 2) the counter-proof: two callers, two tenants ───────────────────────────────────────────────
console.log('== 场景 3 · 反证：同一笔写，两个调用方落在两个租户 ==');
const tenantOfA = rowA ? rowA.split('|')[1] : '';
const tenantOfB = rowB ? rowB.split('|')[1] : '';
check('[root] 那一行落在 1 号租户', String(ROOT_TENANT), tenantOfA);
check('[gate] 那一行落在闸租户（不是 1）', String(tenantId), tenantOfB);
check('两者不同 ⇒ 这个值是被读到的，不是常量', true, tenantOfA !== tenantOfB);

// ── 3) and it is not merely written, it is not visible across tenants ────────────────────────────
console.log('== 场景 4 · 跨租户不可见 ==');
check('[gate] 看不到 root 那笔', 0, Number(psql(`select count(*) from crm_customer where tenant_id = ${tenantId} and name like '%${a.marker}%'`)));
check('[root] 看不到 gate 那笔', 0, Number(psql(`select count(*) from crm_customer where tenant_id = ${ROOT_TENANT} and name like '%${b.marker}%'`)));

// ── 4) the declared fallback, read rather than asserted ──────────────────────────────────────────
console.log('== 场景 5 · 读数（非断言）：不给租户头时会怎样 ==');
let noheaderMarker = '';
{
  noheaderMarker = `${runMarker}-noheader`;
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST', headers: headers(tenantToken, null),
    body: JSON.stringify({ message: `新建客户 ${noheaderMarker}`, conversationId: `tenant-gate-noheader-${Date.now()}` })
  });
  const body = await res.json();
  note('不带租户头的 /ai/chat', `HTTP ${res.status} ${JSON.stringify(body).slice(0, 160)}`);
  note('它有没有落库', psql(`select id, tenant_id from crm_customer where name like '%${noheaderMarker}%'`) || '(no row)');
}

// ── 收尾：把本轮造的东西收回去 ─────────────────────────────────────────────────────────────────────
//
// **这一道比别的多一层**：它不只造业务行，还**建了一个租户与一个用户**。收尾因此分两半。
//
// ① 业务行：本轮的标记**不是一个、是三个**（`root` / `gate` / `noheader` 各一个 —— 它们在 `makeCustomer`
//    里每次现造）。三个都点名，按名删，故够不到别的轮次的行。
// ② 租户与它名下的一切：**平台自己的 `deleteTenant` 只删 `system_tenant` 那一行**（`TenantServiceImpl`：
//    `tenantMapper.deleteById`），名下的用户、角色、菜单授权一概留下。所以这里自己按 `tenant_id` 收 ——
//    而且**表名是现查的**（`information_schema`），不是写死一串：写死的那串会在上游加表之后安静地漏掉它。
//
// **代价，用户拍过板**：租户不再留着复用，故下一次运行要**重新建**，而宿主把「这个租户有效吗」缓存一分钟 ——
// 那一次要等它过去（本文件上面那个重试循环就是为此）。换来的是控制台的租户管理与用户管理里不留 `GateTenant`。
//
// **审计行刻意不动**：那是一条哈希链，为了收拾凌乱去剪断它一环，是比凌乱更坏的一件事。
//
// This gate builds one layer more than its siblings: besides business rows it **creates a tenant and a user**, so
// putting things back has two halves. (1) The business rows: this run has **three** markers rather than one
// (`root` / `gate` / `noheader`), each minted inside `makeCustomer`, and all three are named — so the delete
// cannot reach another run's rows. (2) The tenant and everything under it: the platform's own `deleteTenant`
// removes only the `system_tenant` row and leaves the tenant's users, roles and menu grants behind, so they are
// collected here by `tenant_id` — with the **table list read from `information_schema`** rather than written out,
// because a hard-coded list goes quiet the first time upstream adds a table. The tenant is therefore no longer
// reused, and the next run pays the host's one-minute tenant cache by recreating it — the trade the user chose,
// so that the console's tenant and user pages do not keep a `GateTenant`. Audit rows are deliberately left alone.
console.log('== 收尾 · 把本轮造的东西收回去 ==');
try {
  runPutBack();
  ok(`本轮的行已收回，闸租户 ${tenantId}（${GATE_TENANT_NAME}）及其名下各表已清（审计行刻意留着）`);
} catch (e) {
  bad('收尾', '本轮的行与闸租户都已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
