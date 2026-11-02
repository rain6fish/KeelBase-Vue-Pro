#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 文件（`infra_file`）的真栈场景门：行上没有属主列，属主是审计串 `creator`；模块**没有可对齐的权限表**，
// 故写侧只认创建者 —— 这是本宿主的**口径**，而本门禁量的正是它。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-infra-file-scenarios.mjs
//
// 四条断言，每条都用**本轮唯一**的标记收束（打在 `infra_file.type` 上，分页也用它筛）：
//
//   1. **分页 total 描述的是这一页。** 切面在模块答完之后才收窄，故豁免的调用方看模块总量，被收窄的调用方
//      看「本页留下的行数」—— 与 `run-demo01-contact-scenarios.mjs` 场景 3.5 同一口径、成对断言。
//   2. **按 id 读，范围外的行交回空。** 同一个调用方、两条 id：自己的读得到，别人的读作 `data: null`
//      （切面扣下）。不存在的 id 答的是**业务错误**，故两者在信封上**不同形** —— 这一条如实记下来。
//   3. **删除只认创建者。** 别人的文件批准了也被拒、且一行不动；自己的文件删得掉，台账带 id。
//   4. **投影不含存储细节。** 工具返回不进 `chat-response`（core 0.1.16 的应答只有
//      conversationId / reply / provider / model / toolCalls / navigateTo），故线缆上看不见投影；
//      本门禁因此断言模块那一行，并把这个字段集的钉法指向 `InfraFileToolsTest`（源码级契约）。
//
// The real-stack gate over files (`infra_file`): rows carry no owner column — the owner is the audit string
// `creator` — and the module has **no permission table to align with**, so the write side accepts only the
// creator. That rule is **this host's**, and it is what this gate measures.
//
//   bash scripts/run-server.sh &            # a running stack: PostgreSQL + redis
//   node scripts/run-infra-file-scenarios.mjs
//
// Four assertions, each scoped by a marker unique to this run (stamped into `infra_file.type`, which the page
// also filters on): the page total describes this page (exempt caller sees the module total, narrowed caller
// sees the rows this page kept — paired, the same reading as `run-demo01-contact-scenarios.mjs` 3.5); a read
// by id hands another's row back as `data: null` (a missing id answers a business error, so the two differ at
// the envelope — recorded as it is); a delete accepts only the creator (another's file is refused even after
// approval and the row does not move; the caller's own is deleted and the ledger names its id); and the
// projection carries no storage details — the wire cannot show it, so the field set is pinned by
// `InfraFileToolsTest` and this gate asserts the module's row.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const SECOND_USER = process.env.SECOND_USER || 'gatesurf';
const SECOND_PASS = process.env.SECOND_PASS || 'gate-pass-1234';
const ROLE_CODE = 'gate_surface';
const ROLE_NAME = 'gate surface';
const FILE_TABLE = process.env.FILE_TABLE || 'infra_file';

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const checkNot = (name, forbidden, got) =>
  String(got).includes(forbidden) ? bad(name, `must not contain ${forbidden}`, got) : ok(name);
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

// psql 助手：默认 `docker exec`（与本线其它门禁相同）；`PSQL_HELPER=direct` 直连；没有 psql 客户端时用
// `PSQL_HELPER_SCRIPT` 指向 `scripts/psql-helper.mjs`。
//
// The psql helper: `docker exec` by default (as this line's other gates); `PSQL_HELPER=direct` for a
// reachable client; `PSQL_HELPER_SCRIPT` for a psql-shaped Node helper when the host has no psql.
const PSQL = process.env.PSQL || 'psql';
const PSQL_HELPER = (process.env.PSQL_HELPER || 'docker').toLowerCase();
const PSQL_HELPER_SCRIPT = process.env.PSQL_HELPER_SCRIPT ? resolve(process.env.PSQL_HELPER_SCRIPT) : '';
if (PSQL_HELPER_SCRIPT && !existsSync(PSQL_HELPER_SCRIPT)) {
  throw new Error(`PSQL_HELPER_SCRIPT points to a missing file: ${process.env.PSQL_HELPER_SCRIPT}`);
}
const psql = (sql) => {
  if (PSQL_HELPER_SCRIPT) {
    return execFileSync(process.execPath,
      [PSQL_HELPER_SCRIPT, '-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
        '-U', process.env.PGUSER || 'root', '-d', DB, '-tAc', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'password' } }).trim();
  }
  if (PSQL_HELPER === 'docker') {
    return execFileSync('docker',
      ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-U', 'root', '-d', DB, '-tAc', sql],
      { encoding: 'utf8' }).trim();
  }
  if (PSQL_HELPER === 'direct' || PSQL_HELPER === 'local') {
    return execFileSync(PSQL,
      ['-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
        '-U', process.env.PGUSER || 'root', '-d', DB, '-tAc', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'password' } }).trim();
  }
  throw new Error(`PSQL_HELPER must be "docker" or "direct" (got "${process.env.PSQL_HELPER}")`);
};

// 宿主答它那个瞬时 500 时重试一次 —— 与本线其它门禁同一条理由：本门禁也在授了角色之后立刻登录。
// One request, retried once on the host's transient 500 — the same reason as this line's other gates: this
// one also logs in right after assigning a role.
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
    await new Promise((done) => setTimeout(done, 300));
  }
}

async function login(username, password) {
  const r = await api('/system/auth/login', { method: 'POST', body: { username, password } });
  if (r.code !== 0) throw new Error(`login(${username}) -> ${r.code}: ${r.msg}`);
  return r.data.accessToken;
}

// 审计轨上的收束把手是**会话号**，取自运行时的应答 —— 实测：运行时不用调用方送来的 `conversationId`，
// 自己生成一个 UUID，审计行带的是它。
// The handle on the trail is the **conversation id**, taken from the runtime's answer — measured: the runtime
// ignores the caller's `conversationId`, mints a UUID of its own, and the audit rows carry that one.
async function chat(token, message, extra = {}) {
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId: `gate-file-${Date.now()}`, ...extra })
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

const pendingCount = (operatorId) =>
  Number(psql(`select count(*) from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`));

const pendingToken = (operatorId, id) =>
  psql(`select token from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`
    + ` and args_json::text like '%"id":${id}%' order by id desc limit 1`) || undefined;

const auditRowsFor = (tool, outcome, conversationId) =>
  Number(psql(`select count(*) from ai_audit_logs where tool = '${tool}' and outcome = '${outcome}'`
    + ` and conversation_id = '${conversationId}'`));

const lastRefusalDetail = (tool, conversationId) =>
  psql(`select left(coalesce(detail, ''), 300) from ai_audit_logs`
    + ` where tool = '${tool}' and outcome = 'refused' and conversation_id = '${conversationId}'`
    + ' order by id desc limit 1') || '';

// ── 0) 前置 ───────────────────────────────────────────────────────────────────────────────────────
console.log('== 前置 ==');
check('/app/capabilities 200', '200', (await fetch(`${HOST}/app/capabilities`)).status);
const admin = await login(ADMIN_USER, resolveAdminPassword(psql));
ok('admin 登录');

console.log('== 前置 · 第二个调用方：只有模块读，数据范围压到本人 ==');
let secondId = psql(`select id from system_users where username = '${SECOND_USER}' and deleted = 0 limit 1`);
if (!secondId) {
  const created = await api('/system/user/create', {
    method: 'POST',
    token: admin,
    body: { username: SECOND_USER, nickname: SECOND_USER, password: SECOND_PASS, deptId: 100, postIds: [] }
  });
  if (created.code !== 0) throw new Error(`create user -> ${created.code}: ${created.msg}`);
  secondId = String(created.data);
  ok(`建第二个用户 id=${secondId}`);
} else {
  ok(`复用第二个用户 id=${secondId}`);
}
const fileQueryMenu = Number(psql("select id from system_menu where permission = 'infra:file:query' and deleted = 0 limit 1"));
check('文件查询菜单在', true, fileQueryMenu > 0);
let roleId = psql(`select id from system_role where code = '${ROLE_CODE}' and deleted = 0 limit 1`);
if (!roleId) {
  const made = await api('/system/role/create', {
    method: 'POST', token: admin,
    body: { name: ROLE_NAME, code: ROLE_CODE, sort: 99, status: 0, remark: 'surface gates — read-only role' }
  });
  if (made.code !== 0) throw new Error(`create role -> ${made.code}: ${made.msg}`);
  roleId = String(made.data);
  ok(`建门禁角色 id=${roleId}`);
} else {
  ok(`复用门禁角色 id=${roleId}`);
}
await api('/system/permission/assign-role-menu', {
  method: 'POST', token: admin, body: { roleId: Number(roleId), menuIds: [fileQueryMenu] }
});
// 新角色的默认数据范围是 ALL（`RoleServiceImpl.createRole`），会把调用方变成豁免者；压成 SELF，
// 「事后收窄」那条路才量得到。
// A new role's default data scope is ALL (`RoleServiceImpl.createRole`), which would exempt the caller;
// pinning SELF is what keeps the post-hoc narrowing on the path.
await api('/system/permission/assign-role-data-scope', {
  method: 'POST', token: admin, body: { roleId: Number(roleId), dataScope: 5, dataScopeDeptIds: [] }
});
// **只**授这一个角色：`common` 带着 `infra:file:delete`，混进来就把负对照毁了。
// **Only** this role: `common` carries `infra:file:delete`, and mixing it in destroys the negative control.
await api('/system/permission/assign-user-role', {
  method: 'POST', token: admin, body: { userId: Number(secondId), roleIds: [Number(roleId)] }
});
const second = await login(SECOND_USER, SECOND_PASS);
ok('第二个调用方登录（权限已按门禁角色重签）');

// 行直接种进模块自己的表：本面**没有**建文件的工具（上传收二进制、另一条建记录要 path/url/configId），
// 故门禁自己造行，行的 `creator` 就是那两个身份 —— 与别的门禁种夹具是同一条路。
// The rows are written straight into the module's own table: this face has **no** create tool (upload takes
// bytes, the other create path takes path/url/configId), so the gate seeds them and `creator` is one of the
// two identities — the same route the other gates' fixtures take.
const marker = `gate-file-${Date.now()}`;
const adminRows = [`${marker}-admin-1`, `${marker}-admin-2`];
const secondRow = `${marker}-second-1`;
let secondFileId = '';
let adminFileId = '';

let putBack = () => {
  const raw = psql(`select string_agg(id::text, ',') from ${FILE_TABLE} where type like '%${marker}%'`) || '';
  // `side_effects.result_id` 是**文本**（0.1.16 为 UUID 型副作用改的），故按文本比较、不按整数。
  // `side_effects.result_id` is **text** (0.1.16 changed it for UUID-shaped effects), so it is compared as
  // text, not as a number.
  const ids = raw.trim() ? raw.trim().split(',').map((id) => `'${id}'`).join(',') : "''";
  psql([
    `delete from confirmation_requests where args_json::text like '%${marker}%'`,
    `delete from write_claims where effect_id in (select id from side_effects where result_type = 'infra_file' and result_id in (${ids}))`,
    `delete from side_effects where result_type = 'infra_file' and result_id in (${ids})`,
    `delete from ${FILE_TABLE} where type like '%${marker}%'`,
  ].join('; '));
};
process.on('exit', () => {
  try {
    if (putBack) { putBack(); putBack = null; console.log('  note  收尾走了退出路径'); }
  } catch (e) {
    console.error(`  note  退出路径上的收尾没跑成：${e.message}`);
  }
});

console.log('== 场景 0 · 夹具：两行属甲、一行属乙 ==');
{
  const configId = psql('select id from infra_file_config where master = true order by id limit 1');
  check('主存储器配置在', true, configId !== '');
  const seed = (name, creator) =>
    psql(`insert into ${FILE_TABLE}(id, config_id, name, path, url, type, size, creator, create_time, update_time, deleted)`
      + ` values (nextval('${FILE_TABLE}_seq'), ${configId}, '${name}', '${marker}/${name}.txt',`
      + ` 'http://gate.invalid/${marker}/${name}.txt', '${marker}', 5, '${creator}', now(), now(), 0)`);
  seed(adminRows[0], '1');
  seed(adminRows[1], '1');
  seed(secondRow, String(secondId));
  check('甲那两行已种', 2, Number(psql(`select count(*) from ${FILE_TABLE} where type = '${marker}' and creator = '1'`)));
  check('乙那一行已种', 1, Number(psql(`select count(*) from ${FILE_TABLE} where type = '${marker}' and creator = '${secondId}'`)));
  secondFileId = psql(`select id from ${FILE_TABLE} where name = '${secondRow}'`);
  adminFileId = psql(`select id from ${FILE_TABLE} where name = '${adminRows[0]}'`);
}

// ── 1) 分页：total 描述的是这一页 ─────────────────────────────────────────────────────────────────
console.log('== 场景 1 · 无属主筛选列的分页：total 是页内的，不是整张表 ==');
let pageTotalExempt = 0;
let pageTotalNarrowed = 0;
{
  const pageOf = (token) => api(`/infra/file/page?pageNo=1&pageSize=10&type=${encodeURIComponent(marker)}`, { token });
  const idsOn = (answer) => (((answer || {}).data || {}).list || []).map((row) => String(row.id));
  const adminPage = await pageOf(admin);
  const secondPage = await pageOf(second);
  pageTotalExempt = Number((adminPage.data || {}).total);
  pageTotalNarrowed = Number((secondPage.data || {}).total);
  check('豁免调用方：total 是模块总量', 3, pageTotalExempt);
  check('豁免调用方：本页行数', 3, idsOn(adminPage).length);
  check('收窄调用方：total 是本页收窄后的行数', 1, pageTotalNarrowed);
  check('收窄调用方：本页只剩自己的行', 1, idsOn(secondPage).length);
  check('收窄调用方：那一行是自己的', true, idsOn(secondPage).includes(String(secondFileId)));
  check('收窄调用方：看不到别人的行', false, idsOn(secondPage).includes(String(adminFileId)));
}

// ── 2) 按 id 读：范围外的交回空 ───────────────────────────────────────────────────────────────────
console.log('== 场景 2 · 按 id 读：自己的读得到，别人的交回空 ==');
let readOwnPresent = 0;
let readOtherNull = 0;
{
  const own = await api(`/infra/file/get?id=${secondFileId}`, { token: second });
  check('读自己的：取到了', 0, own.code);
  readOwnPresent = String((own.data || {}).id) === String(secondFileId) ? 1 : 0;
  check('读自己的：就是那一行', 1, readOwnPresent);

  const other = await api(`/infra/file/get?id=${adminFileId}`, { token: second });
  check('读别人的：信封是成功的', 0, other.code);
  readOtherNull = other.data === null ? 1 : 0;
  check('读别人的：切面交回空（与「没有这一行」在业务层同形）', 1, readOtherNull);

  const missing = await api('/infra/file/get?id=999999999', { token: second });
  note('不存在的 id 在**信封**上是另一种形状（模块抛业务错误）', `code=${missing.code}`);
  check('不存在的 id 答的是业务错误（不是静默的空）', true, missing.code !== 0);
}

// ── 3) 删除只认创建者 ─────────────────────────────────────────────────────────────────────────────
console.log('== 场景 3 · 删除只认创建者：别人的拒、自己的成 ==');
let hijackCid = '';
{
  const held = pendingCount(secondId);
  const asked = await chat(second, '删除文件', { targetId: Number(adminFileId) });
  hijackCid = asked.conversationId;
  check('路由选中了删除工具', 'delete_infra_file', (asked.toolCalls || [])[0]);
  check('写被扣下（人批准前不执行）', held + 1, pendingCount(secondId));
  check('别人的文件批准前还在', 1, Number(psql(`select count(*) from ${FILE_TABLE} where id = ${adminFileId}`)));

  const outcome = await confirm(second, pendingToken(secondId, adminFileId), 'approve');
  note('批准后的应答（被切面拒绝时是宿主的信封）', JSON.stringify(outcome).slice(0, 200));
  check('批准也没跑成', false, outcome.status === 'executed');
  check('被拒也记在审计轨上', 1, auditRowsFor('delete_infra_file', 'refused', hijackCid));
  const why = lastRefusalDetail('delete_infra_file', hijackCid);
  check('拒绝的理由点名了行范围', true, why.includes('该行不在你的数据范围内'));
  check('别人的文件一行未动', 1, Number(psql(`select count(*) from ${FILE_TABLE} where id = ${adminFileId} and deleted = 0`)));
}

let ownCid = '';
{
  const held = pendingCount(secondId);
  const asked = await chat(second, '删除文件', { targetId: Number(secondFileId) });
  ownCid = asked.conversationId;
  check('路由选中了删除工具', 'delete_infra_file', (asked.toolCalls || [])[0]);
  check('写被扣下（人批准前不执行）', held + 1, pendingCount(secondId));
  check('自己的文件批准前还在', 1, Number(psql(`select count(*) from ${FILE_TABLE} where id = ${secondFileId}`)));

  const outcome = await confirm(second, pendingToken(secondId, secondFileId), 'approve');
  check('批准后执行', 'executed', outcome.status || JSON.stringify(outcome));
  check('删掉的就是那一行', String(secondFileId), String((outcome.data || {}).id));
  // `FileDO` 带逻辑删除列，故「删掉」在表里是 `deleted = 1`、不是这一行消失 —— 断言按模块的语义写。
  // `FileDO` carries a logical-delete column, so "deleted" is `deleted = 1` in the table rather than the row
  // vanishing — the assertion says what the module means.
  check('那一行对模块而言已不在（逻辑删）', 0,
    Number(psql(`select count(*) from ${FILE_TABLE} where id = ${secondFileId} and deleted = 0`)));
  // 「结果带 id」在台账上的意思就是这一条：`side_effects.result_id` 是 NOT NULL，工具不带 id 就记不上。
  // "The result carries an id" means exactly this on the ledger: `side_effects.result_id` is NOT NULL, so a
  // tool that returns none cannot be recorded at all.
  check('台账记下了这笔写、且 result id 是那个文件', `infra_file|${secondFileId}`, psql(
    `select result_type || '|' || result_id from side_effects where tool_name = 'delete_infra_file'`
    + ` and result_id = '${secondFileId}' order by id desc limit 1`));

  const effects = await (await fetch(`${HOST}/ai/tool-effects?page=1&limit=100`, {
    headers: { Authorization: `Bearer ${admin}`, 'tenant-id': TENANT }
  })).json();
  const items = (effects.data || {}).items || [];
  check('台账读面（/ai/tool-effects）看得见这一笔', true,
    items.some((e) => e.resultType === 'infra_file' && String(e.resultId) === String(secondFileId)));
}

// ── 4) 投影与审计链 ───────────────────────────────────────────────────────────────────────────────
console.log('== 场景 4 · 投影的限度与审计链 ==');
{
  const page = await api(`/infra/file/page?pageNo=1&pageSize=10&type=${encodeURIComponent(marker)}`, { token: admin });
  const row = (((page || {}).data || {}).list || [])[0] || {};
  check('模块那一行本身带着存储细节（这不是投影，是模块的答复）', true,
    Boolean(row.path) || Boolean(row.url));
  note('投影的限度', '工具返回不进 chat-response（core 0.1.16 无 data 字段）；五个字段、且不含 path/url/configId 由 InfraFileToolsTest 钉住');
  check('审计行在（>0）', true, Number(psql('select count(*) from ai_audit_logs')) > 0);
  const verify = await (await fetch(`${HOST}/audit/verify`, { headers: { Authorization: `Bearer ${admin}` } })).json();
  check('链校验通过', true, verify.data && verify.data.valid);
}

// 读数在**收尾之前**取：收尾会把本轮的行删掉，之后再去数就只剩零，两轮一致也就成了空话。
// The readings are taken **before** the cleanup: the cleanup deletes this run's rows, and counting afterwards
// would leave only zeroes — "two runs agree" would then be a statement about nothing.
const reading = `READING pageTotalExempt=${pageTotalExempt} pageTotalNarrowed=${pageTotalNarrowed}`
  + ` readOwnPresent=${readOwnPresent} readOtherNull=${readOtherNull}`
  + ` hijackRefusedAudit=${auditRowsFor('delete_infra_file', 'refused', hijackCid)}`
  + ` ownDeleteExecutedAudit=${auditRowsFor('delete_infra_file', 'executed', ownCid)}`
  + ` blockedRowStillThere=${Number(psql(`select count(*) from ${FILE_TABLE} where id = ${adminFileId} and deleted = 0`))}`
  + ` ownRowGone=${Number(psql(`select count(*) from ${FILE_TABLE} where id = ${secondFileId} and deleted = 0`))}`;

// ── 收尾 ─────────────────────────────────────────────────────────────────────────────────────────
console.log('== 收尾 ==');
try {
  putBack();
  putBack = null;
  ok('本轮造的行已收回（审计行刻意留着）');
} catch (e) {
  bad('收尾', '本轮造的行已收回', e.message);
}

console.log(reading);

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
