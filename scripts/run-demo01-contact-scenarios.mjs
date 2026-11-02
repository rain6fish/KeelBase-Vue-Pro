// SPDX-License-Identifier: Apache-2.0
//
// The gate for the third module delivery: the infra module's demo contact, the first module governed
// that is neither CRM nor FMS. It walks the same four things every module's gate walks — reached under
// an explicit identity, out-of-scope access refused, a high-risk write held for a human, the side
// effect auditable — plus the withdrawal leg.
//
//   PORT=48105 bash scripts/run-server.sh &
//   node scripts/run-demo01-contact-scenarios.mjs
//
// **What this gate is here to measure.** The recipe's per-module half was written against FMS, whose
// page already accepted a caller filter and whose module had its own account-set permission table.
// This module has neither: its rows carry only the audit string `creator`, and it has no permission
// table of its own. So the fixture is plain rows, the narrowing happens after the module answers, and
// the refusal has to be the aspect's, not the module's.
//
// **This run's unique marker goes into the row name.** Every row this gate creates carries it, and
// cleanup deletes by the marker, so it cannot reach another run's rows. Audit rows are deliberately
// left alone: they are a hash chain, and cutting a link to tidy up is worse than the untidiness.
//
// 第三个模块交付的门禁：infra 模块的示例联系人，也是第一个既非 CRM、也非 FMS 的受治理模块。它走每个模块门禁
// 都走的四件事——明确身份可达、越权被拒、高风险写扣下等人、副作用可审计——外加撤销那条腿。
//
// **本门禁要量的是什么。** recipe 的逐模块那一半是对着 FMS 写的，而 FMS 的分页本来就收调用方筛选位、模块自己也
// 有账套权限表。本模块两样都没有：行上只有审计串 `creator`，也没有自己的权限表。故夹具就是两行普通行，收窄发生在
// 模块答完之后，而拒绝必须是切面的、不是模块的。
//
// **本轮的唯一标记写在行名里。** 本门禁造的每一行都带它，收尾按标记删，故够不到别的轮次。审计行刻意留着：
// 那是一条哈希链，为收拾凌乱去剪它一环，比凌乱更坏。
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48105';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro-thirdmod';
const TENANT = process.env.TENANT_ID || '1';
const SECOND_USER = process.env.SECOND_USER || 'gatesales';
const SECOND_PASS = process.env.SECOND_PASS || 'gate-pass-1234';
const TABLE = process.env.DEMO_CONTACT_TABLE || 'yudao_demo01_contact';

// 本轮的临时角色：只为分页口径那一条造一个「有查询权限、但没有全量范围」的调用方，收尾时收回。
// 不存在的键是 0 / null，故收尾能看出「什么都没造」。
// The run's temporary role: it exists only so the pagination check has a caller that may query the
// module without holding the every-row scope; cleanup takes it back. 0 / null means "not made yet".
let commonRoleId = null;
let pageRoleId = null;

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const checkNot = (name, forbidden, got) =>
  String(got).includes(forbidden) ? bad(name, `must not contain ${forbidden}`, got) : ok(name);
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

// The helper keeps `docker exec` as its default. Two fallbacks exist for a machine without Docker or
// without a psql client: `PSQL_HELPER=direct` (a real client) and `PSQL_HELPER_SCRIPT` (a Node helper
// that accepts the same arguments). The script path is the one this run uses.
//
// psql 助手默认仍是 `docker exec`。没有 Docker 或没有 psql 客户端时有两种回退：`PSQL_HELPER=direct`
// （真客户端）与 `PSQL_HELPER_SCRIPT`（接受同一组实参的 Node 助手）。本轮走脚本那条。
const PSQL = process.env.PSQL || 'psql';
const PSQL_HELPER = (process.env.PSQL_HELPER || 'docker').toLowerCase();
const PSQL_HELPER_SCRIPT = process.env.PSQL_HELPER_SCRIPT;
const psql = (sql) => {
  if (PSQL_HELPER_SCRIPT) {
    return execFileSync(
      process.execPath,
      [PSQL_HELPER_SCRIPT, '-h', process.env.PGHOST || '127.0.0.1',
        '-p', process.env.PGPORT || '55455', '-U', process.env.PGUSER || 'root',
        '-d', DB, '-tAc', sql],
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
  throw new Error(`PSQL_HELPER must be "docker" or "direct" (got "${process.env.PSQL_HELPER}")`);
};

// Cleanup is a function attached the moment this run creates its first row, so a crash after that
// point still takes the rows back on the exit path. / 收尾是一个函数，在本轮造出第一行时挂上；之后的崩溃也会走它。
let putBack = null;
function runPutBack() {
  if (!putBack) return false;
  const putBackOnce = putBack;
  putBack = null;
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
    body: JSON.stringify({ message, conversationId: `thirdgate-${Date.now()}`, ...extra })
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

async function revokeEffect(id, token) {
  const res = await fetch(`${HOST}/ai/tool-effects/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  let body = '';
  try { body = await res.text(); } catch { /* a body we cannot read is reported below */ }
  return { status: res.status, body };
}

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
  commonRoleId = Number(psql(`select id from system_role where code = 'common' and deleted = 0 limit 1`));
  await api('/system/permission/assign-user-role', { method: 'POST', token: admin, body: { userId: Number(secondId), roleIds: [commonRoleId] } });
}
const second = await login(SECOND_USER, SECOND_PASS);
ok('第二个调用方登录');

// ── the rows: two plain contacts, one per caller ───────────────────────────────────────────────────
console.log('== 场景 1 · 本模块自己的表：两行普通行，属主是审计串 ==');
const marker = `thirdgate-${Date.now()}`;
putBack = () => {
  // 创建出来的名字前面带着触发短语，故标记按**包含**匹配，不只按开头。
  // 确认行按**本轮标记命中的全部状态**删，不只 pending：场景 3 的批准行与场景 4 的「批准了仍被拒」行
  // 同样是本轮的痕迹，旧写法把它们留给下一轮。匹配走两路——创建参数里的名字带 marker，改名参数里的
  // 行 id 来自本轮的夹具 id——两路都只会命中本轮。
  // The create's name is prefixed by the trigger phrase, so the marker is matched anywhere in the name
  // rather than only at the start. Confirmation rows are taken back in **every state this run marked**,
  // not only `pending`: scenario 3's approved row and scenario 4's approved-but-refused row are this
  // run's leftovers too, and the old form left them for the next run. The match has two routes — the
  // create's name carries the marker, the rename's arguments carry a fixture row id — and neither can
  // reach another run's rows.
  const ids = (psql(`select string_agg(id::text, ',') from ${TABLE} where name like '%${marker}%'`) || '').trim() || '0';
  const idAlt = ids.split(',').join('|');
  // `side_effects.result_id` is text since runtime 0.1.16 (migration V18); the list must be quoted text.
  // `side_effects.result_id` 自运行时 0.1.16（迁移 V18）起是文本，故这串 id 要以带引号的文本出现。
  const idList = ids.split(',').map((id) => `'${id}'`).join(',');
  psql(
    [
      `delete from confirmation_requests where status in ('pending', 'approved', 'rejected') and (args_json ~ '${marker}' or args_json ~ '"id"[[:space:]]*:[[:space:]]*(${idAlt})([^0-9]|$)')`,
      `delete from write_claims where user_id = '${secondId}' and tool_name in ('create_demo01_contact', 'rename_demo01_contact') and effect_id is null`,
      `delete from write_claims where effect_id in (select id from side_effects where result_id in (${idList}))`,
      `delete from side_effects where result_id in (${idList})`,
      `delete from ${TABLE} where id in (${ids})`,
      // 兜底：正常收尾走 API 释放临时角色；退出路径上若还没释放，这里按行删掉（缓存要等宿主重启才清）。
      // Fallback: the normal exit releases the temporary role through the API; if the process dies first,
      // these delete its rows (the permission cache clears only when the host restarts).
      ...(pageRoleId ? [
        `delete from system_user_role where user_id = '${secondId}' and role_id = ${pageRoleId}`,
        `delete from system_role_menu where role_id = ${pageRoleId}`,
        `delete from system_role where id = ${pageRoleId}`,
      ] : []),
    ].join('; '),
  );
};
// tenant_id and creator are both required for the host's own paths to see these rows: the tenant
// interceptor appends `tenant_id = ?`, and the advice narrows on `creator`.
// tenant_id 与 creator 都是宿主自己的路径能看见这些行的必要条件：租户拦截器会补 `tenant_id = ?`，
// 而通知按 `creator` 收窄。
psql(`insert into ${TABLE}(id, name, sex, birthday, description, creator, create_time, updater, update_time, deleted, tenant_id)`
  + ` values (nextval('${TABLE}_seq'), '${marker}-admin', 1, now(), 'fixture admin', '1', now(), '1', now(), 0, ${TENANT})`);
psql(`insert into ${TABLE}(id, name, sex, birthday, description, creator, create_time, updater, update_time, deleted, tenant_id)`
  + ` values (nextval('${TABLE}_seq'), '${marker}-second', 1, now(), 'fixture second', '${secondId}', now(), '${secondId}', now(), 0, ${TENANT})`);
const adminId = psql(`select id from ${TABLE} where name = '${marker}-admin'`);
const secondRowId = psql(`select id from ${TABLE} where name = '${marker}-second'`);
check('甲那一行已种', true, adminId !== '');
check('乙那一行已种', true, secondRowId !== '');

console.log('== 场景 2 · 身份传递：读被路由到本模块的工具 ==');
{
  const a = await chat(admin, '看我的联系人');
  check('甲触发本模块读工具', 'list_my_demo_contacts', (a.toolCalls || [])[0]);
  check('甲的执行状态（审计轨）', 1, ranAs('list_my_demo_contacts'));

  const s = await chat(second, '看我的联系人');
  check('乙触发同一个工具', 'list_my_demo_contacts', (s.toolCalls || [])[0]);
  check('它的执行状态（审计轨）', 2, ranAs('list_my_demo_contacts'));
}

console.log('== 场景 3 · 高风险写入被扣下，批准后落库 ==');
let createdId = null;
{
  const held = pendingCount(secondId);
  // The name travels in the message: the chat request declares no free-form argument map, and the
  // route's placeholder uses what the caller typed. / 名字走消息：聊天请求没有自由参数 map，路由的占位用调用方所写。
  await chat(second, `新建示例联系人 ${marker}-created`);
  check('写被扣下', held + 1, pendingCount(secondId));
  const proposedToken = pendingToken(secondId);
  checkNot('扣下时给出 token', 'undefined', proposedToken);

  const outcome = await confirm(second, proposedToken, 'approve');
  check('批准后执行', 'executed', outcome.status);
  createdId = psql(`select id from ${TABLE} where name = '新建示例联系人 ${marker}-created' and deleted = 0`);
  check('行已落库', true, createdId !== '');
  // 工具路径的 create 不走安全上下文，框架的审计字段处理器盖不上 `creator`；模块 service 必须在 insert
  // 之后按 `ActingCaller` 补盖。这里断言的是**补盖的结果**，不是「行存在」。
  // A tool-path create does not go through the security context, so the framework's audit-field handler
  // cannot fill `creator`; the module's service must stamp the acting caller after the insert. This
  // asserts **the stamp**, not merely that the row exists.
  const stampedCreator = psql(`select creator from ${TABLE} where id = ${createdId}`);
  check('属主盖的是调用方（审计串）', String(secondId), stampedCreator);
  check('属主不是空串（工具路径已补盖）', true, stampedCreator.trim() !== '');
}

console.log('== 场景 3.5 · 无属主筛选列的分页：total 描述的是这一页，不是整张表 ==');
{
  // 造一个「能查模块、但数据范围只到本人」的角色，让第二个调用方走 REST 分页。
  // A query-only role for the second caller, so it can walk the module's own page route; its data
  // scope is pinned to SELF below, which is what keeps the caller on the narrowing path.
  const queryMenuId = Number(psql("select id from system_menu where permission = 'infra:demo01-contact:query' and deleted = 0 limit 1"));
  check('模块查询菜单在', true, queryMenuId > 0);
  if (queryMenuId > 0) {
    // 角色名有 30 字符上限，故只取 marker 的数字段；编码可以更长，一并取同一段便于对照。
    // The role name is capped at 30 characters, so it keeps only the marker's numeric part; the code
    // may be longer and uses the same part.
    const stamp = marker.replace(/^thirdgate-/, '');
    const roleName = `gatepage-${stamp}`;
    const roleCode = `gatepage_${stamp}`;
    const made = await api('/system/role/create', {
      method: 'POST', token: admin,
      body: { name: roleName, code: roleCode, sort: 99, status: 0, remark: 'demo01 pagination gate' }
    });
    check('临时角色已建', 0, made.code);
    if (made.code !== 0) note('临时角色建失败的原因', made.msg);
    pageRoleId = Number(made.data);
    // 新建角色的默认数据范围是 ALL（`RoleServiceImpl.createRole`），会把调用方变成豁免者；
    // 这里显式压成 SELF，才量得到「事后收窄」那条路。
    // A new role defaults to the ALL data scope (`RoleServiceImpl.createRole`), which would exempt the
    // caller; this pins it to SELF so the post-hoc narrowing is the path being measured.
    await api('/system/permission/assign-role-data-scope', {
      method: 'POST', token: admin, body: { roleId: pageRoleId, dataScope: 5, dataScopeDeptIds: [] }
    });
    await api('/system/permission/assign-role-menu', {
      method: 'POST', token: admin, body: { roleId: pageRoleId, menuIds: [queryMenuId] }
    });
    await api('/system/permission/assign-user-role', {
      method: 'POST', token: admin, body: { userId: Number(secondId), roleIds: [commonRoleId, pageRoleId] }
    });
    const pageAs = async (token) => (await api(
      `/infra/demo01-contact/page?pageNo=1&pageSize=10&name=${encodeURIComponent(marker)}`, { token })).data || {};
    const adminPage = await pageAs(admin);
    check('豁免调用方：total 是模块总量', 3, adminPage.total);
    check('豁免调用方：本页行数', 3, (adminPage.list || []).length);
    const secondPage = await pageAs(second);
    check('收窄调用方：total 是本页收窄后的行数', 2, secondPage.total);
    check('收窄调用方：本页只剩自己的行', 2, (secondPage.list || []).length);
    check('补盖 creator 的行对属主可见', true,
      (secondPage.list || []).some((row) => Number(row.id) === Number(createdId)));
  }
}

console.log('== 场景 4 · 越权写：批准也买不到 ==');
{
  const hijackHeld = pendingCount(secondId);
  await chat(second, '重命名联系人', { targetId: Number(adminId) });
  check('改别人的行也被扣下', hijackHeld + 1, pendingCount(secondId));
  const hijackDone = await confirm(second, pendingToken(secondId), 'approve');
  note('越权写批准后的结局', hijackDone.status || JSON.stringify(hijackDone).slice(0, 120));
  check('批准了也没执行', true, hijackDone.status !== 'executed');
  check('别人的行一字未改', `${marker}-admin`, psql(`select name from ${TABLE} where id = ${adminId}`));
  // Assert the refusal's reason, not merely that nothing ran: any failure would make "nothing ran" green.
  // 断言拒绝的理由，而不只是「没执行」：任何失败都会让「没执行」变绿。
  const why = psql(`select left(detail, 400) from ai_audit_logs where tool = 'rename_demo01_contact' and outcome = 'refused' order by id desc limit 1`) || '';
  note('被拒的理由', why.replace(/\s+/g, ' ').slice(0, 120));
  check('不是别的故障（不是租户/数据库错误）', false, why.includes('TenantContextHolder'));
  check('拒绝的理由点名了行范围', true, why.includes('该行不在你的数据范围内'));
}

console.log('== 场景 5 · 审计链与被记下的拒绝 ==');
{
  const rows = Number(psql('select count(*) from ai_audit_logs'));
  check('审计行在（>0）', true, rows > 0);
  const verify = await (await fetch(`${HOST}/audit/verify`, { headers: { Authorization: `Bearer ${admin}` } })).json();
  check('链校验通过', true, verify.data && verify.data.valid);
  const refusals = Number(psql(`select count(*) from ai_audit_logs where tool = 'rename_demo01_contact' and outcome = 'refused'`));
  check('被拒的那次写在案', true, refusals > 0);
}

console.log('== 场景 6 · 撤销那条腿：创建能被收回去 ==');
{
  const effectId = psql(`select id from side_effects where tool_name = 'create_demo01_contact' and result_id = '${createdId}' order by id desc limit 1`);
  check('那一笔写在副作用台账上', true, effectId !== '');
  const r = await revokeEffect(Number(effectId), second);
  note('撤销端点应答', `HTTP ${r.status} ${String(r.body).replace(/\s+/g, ' ').slice(0, 140)}`);
  check('撤销落成（2xx）', true, r.status >= 200 && r.status < 300);
  check('行已不在（逻辑删）', 0, Number(psql(`select count(*) from ${TABLE} where id = ${createdId} and deleted = 0`)));
  check('账本读作已撤销', 'revoked', psql(`select revoke_status from side_effects where id = ${effectId}`));
  const revokedOnAudit = Number(psql("select count(*) from ai_audit_logs where action = 'effect_revoke'"));
  check('那次撤销也在审计轨上', true, revokedOnAudit > 0);
}

// ── 收尾 ─────────────────────────────────────────────────────────────────────────────────────────
console.log('== 收尾 · 把本轮造的行收回去 ==');
try {
  // 临时角色先走 API 收回：这条路会刷新宿主的权限缓存；SQL 兜底只在退出路径上用。
  // The temporary role is released through the API first — that is the path that refreshes the host's
  // permission cache; the SQL fallback is for the exit path only.
  if (pageRoleId) {
    await api('/system/permission/assign-user-role', {
      method: 'POST', token: admin, body: { userId: Number(secondId), roleIds: [commonRoleId] }
    });
    const dropped = await api(`/system/role/delete?id=${pageRoleId}`, { method: 'DELETE', token: admin });
    if (dropped.code === 0) {
      pageRoleId = null;
    } else {
      note('临时角色没删掉，收尾走 SQL 兜底', dropped.msg);
    }
  }
  runPutBack();
  ok('本轮的行已收回（审计行刻意留着）');
} catch (e) {
  bad('收尾', '本轮的行已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
