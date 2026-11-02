#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 公告（`system_notice`）的真栈场景门：M2 第一个**没有属主**的对象。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-system-notice-scenarios.mjs
//
// 本门禁能显示什么、不能显示什么，跑之前就说清：
//
//   * **写要问 controller 那一句权限码。** 工具路径不经过 `NoticeController`，故 `system:notice:create`
//     那一句由 `SystemNoticeGovernance` 在工具路径上问出。这里用两个调用方量它：持有该权限码的看得到「扣下 →
//     批准 → 落库」；没有该权限码的看得到「扣下 → 批准 → 拒绝 → 一行不落」。被拒也记在审计轨上。
//   * **读是广播。** 公告对所有人开放，故断言的是「另一个调用方的页里看得到这一条」；`list_notices` 自己也
//     不按调用方收窄（广播对象的「哪一部分」无从问起）。
//   * **投影只在单测里看得见。** 核心 0.1.16 的 `chat-response` 不带 `data`（javap 确认：只有
//     conversationId / reply / provider / model / toolCalls / navigateTo），故本门禁**不**断言工具返回的那六个
//     字段；它断言的是模块那一行本身，并把投影的钉法指向 `SystemNoticeToolsTest`。这一条是**声明的限度**，
//     不是遗漏。
//   * **它造的东西它收回去**（按本轮唯一的标记），审计链一个字不动 —— 那是哈希链，剪一环比凌乱更坏。
//
// The real-stack gate over notices (`system_notice`): M2's first object with **no owner**.
//
//   bash scripts/run-server.sh &            # a running stack: PostgreSQL + redis
//   node scripts/run-system-notice-scenarios.mjs
//
// What it can and cannot show, said before it runs:
//
//   * **A write asks the controller's own permission code.** The tool path does not pass through
//     `NoticeController`, so `SystemNoticeGovernance` asks `system:notice:create` there. Two callers measure
//     it: one holding the code sees "held → approved → landed", one without it sees "held → approved →
//     refused → nothing landed", and the refusal lands on the audit trail.
//   * **A read is a broadcast.** Notices are open to everyone, so what is asserted is that another caller's
//     page holds the row; `list_notices` does not narrow per caller either (a broadcast has no "which part").
//   * **The projection is visible only in the unit test.** Core 0.1.16's `chat-response` carries no `data`
//     (javap: conversationId / reply / provider / model / toolCalls / navigateTo only), so this gate does
//     **not** assert the six projected fields; it asserts the module's row and points the projection's pin at
//     `SystemNoticeToolsTest`. That is a **declared limit**, not an omission.
//   * **It puts back what it makes** (by this run's marker). The audit chain is never touched — it is a hash
//     chain, and cutting a link is worse than the untidiness.
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
const NOTICE_TABLE = process.env.NOTICE_TABLE || 'system_notice';

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

// 一次请求，宿主答它那个瞬时 500 时重试一次 —— 与本线其它门禁同一条理由：本门禁也在授了角色之后立刻登录。
//
// One request, retried once when the host answers its transient 500 — the same reason as this line's other
// gates: this one also logs in right after assigning a role.
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

// 审计轨上的收束把手是**会话号**：`detail` 对跑成了的调用只有 `create_notice -> ok`，不带实参，故标记在
// detail 里查不到。会话号取自**运行时的应答**，不是这里送进去的那个 —— 实测：运行时并不采用调用方送来的
// `conversationId`，它自己生成一个 UUID，审计行带的是它。
// The handle on the trail is the **conversation id**: for a call that ran, `detail` is only
// `create_notice -> ok` with no arguments, so the marker is not searchable there. The id is taken from the
// **runtime's own answer**, not the one sent here — measured: the runtime ignores the caller's
// `conversationId` and mints a UUID of its own, and that is the one the audit rows carry.
async function chat(token, message, extra = {}) {
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId: `gate-notice-${Date.now()}`, ...extra })
  });
  const json = await res.json();
  return json.data || json;
}

// 批准/拒绝的应答有两种形状，都按原样读：跑成了是 `{status: 'executed'}`，被切面拒了是宿主的信封
// `{code: 403, errorCode: 'ROW_OUT_OF_SCOPE'|…}`（core 的 advice 把业务拒绝包在 HTTP 200 里）。
// The decision's answer has two shapes, both read as they come: a run is `{status: 'executed'}`, a refusal
// by the seam is the host's envelope `{code: 403, …}` (core's advice wraps a business refusal in HTTP 200).
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

const pendingToken = (operatorId, marker) =>
  psql(`select token from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`
    + ` and args_json like '%${marker}%' order by id desc limit 1`) || undefined;

// 审计轨按**会话号**收束：同一张库上并排跑另一轮时，整表数没有意义，而实参不进 `detail`。
// The trail is scoped by **conversation id**: a whole-table count means nothing beside another run, and the
// arguments never reach `detail`.
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

console.log('== 前置 · 第二个调用方：只有模块读，没有写 ==');
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
const noticeQueryMenu = Number(psql("select id from system_menu where permission = 'system:notice:query' and deleted = 0 limit 1"));
const fileQueryMenu = Number(psql("select id from system_menu where permission = 'infra:file:query' and deleted = 0 limit 1"));
check('公告查询菜单在', true, noticeQueryMenu > 0);
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
// 只给**读**两个菜单；写那三个码（create/update/delete）刻意不给 —— 那正是被量的那一半。
// Only the two **read** menus; the three write codes are deliberately absent — that absence is the half
// being measured.
await api('/system/permission/assign-role-menu', {
  method: 'POST', token: admin,
  body: { roleId: Number(roleId), menuIds: [noticeQueryMenu, fileQueryMenu] }
});
// 新角色的默认数据范围是 ALL（`RoleServiceImpl.createRole`），会把调用方变成豁免者；压成 SELF，
// 文件那半才量得到「事后收窄」。
// A new role's default data scope is ALL (`RoleServiceImpl.createRole`), which would exempt the caller;
// pinning SELF is what keeps the file half on the narrowing path.
await api('/system/permission/assign-role-data-scope', {
  method: 'POST', token: admin,
  body: { roleId: Number(roleId), dataScope: 5, dataScopeDeptIds: [] }
});
// **只**授这一个角色：`common` 带着写权限，混进来就把负对照毁了。
// **Only** this role: `common` carries the write codes, and mixing it in destroys the negative control.
await api('/system/permission/assign-user-role', {
  method: 'POST', token: admin, body: { userId: Number(secondId), roleIds: [Number(roleId)] }
});
const second = await login(SECOND_USER, SECOND_PASS);
ok('第二个调用方登录（权限已按门禁角色重签）');

const marker = `gate-notice-${Date.now()}`;
const refusedTitle = `${marker}-refused`;
const createdTitle = `${marker}-created`;
const createdContent = `${marker}-content`;

// 收尾在**造出第一个标记**时就挂上：下面任何一处崩了，退出处理器都会替本轮跑它。
// The cleanup is attached as soon as the first marker exists: whatever dies below still gets it run.
let putBack = () => {
  const raw = psql(`select string_agg(id::text, ',') from ${NOTICE_TABLE} where title like '%${marker}%'`) || '';
  // `side_effects.result_id` 是**文本**（0.1.16 为 UUID 型副作用改的），故按文本比较、不按整数。
  // `side_effects.result_id` is **text** (0.1.16 changed it for UUID-shaped effects), so it is compared as
  // text, not as a number.
  const ids = raw.trim() ? raw.trim().split(',').map((id) => `'${id}'`).join(',') : "''";
  psql([
    `delete from confirmation_requests where args_json like '%${marker}%'`,
    `delete from write_claims where effect_id in (select id from side_effects where result_type = 'system_notice' and result_id in (${ids}))`,
    `delete from side_effects where result_type = 'system_notice' and result_id in (${ids})`,
    `delete from ${NOTICE_TABLE} where title like '%${marker}%'`,
  ].join('; '));
};
process.on('exit', () => {
  try {
    if (putBack) { putBack(); putBack = null; console.log('  note  收尾走了退出路径'); }
  } catch (e) {
    console.error(`  note  退出路径上的收尾没跑成：${e.message}`);
  }
});

// ── 1) 写：没有权限码的那一半 ─────────────────────────────────────────────────────────────────────
console.log('== 场景 1 · 没有 system:notice:create：扣下、批准、仍被拒、一行不落 ==');
let refusedCid = '';
{
  const held = pendingCount(secondId);
  const asked = await chat(second, `发布公告 标题=${refusedTitle} 类型=1 内容=${marker}-denied`);
  refusedCid = asked.conversationId;
  check('路由选中了建公告工具', 'create_notice', (asked.toolCalls || [])[0]);
  check('写被扣下（人批准前不执行）', held + 1, pendingCount(secondId));
  check('人批准前一行未落', 0, Number(psql(`select count(*) from ${NOTICE_TABLE} where title = '${refusedTitle}'`)));

  const token = pendingToken(secondId, refusedTitle);
  checkNot('扣下时给出 token', 'undefined', token);
  const outcome = await confirm(second, token, 'approve');
  note('批准后的应答（被切面拒绝时是宿主的信封）', JSON.stringify(outcome).slice(0, 200));
  check('批准也没跑成', false, outcome.status === 'executed');
  check('被拒也记在审计轨上', 1, auditRowsFor('create_notice', 'refused', refusedCid));
  const why = lastRefusalDetail('create_notice', refusedCid);
  check('拒绝的理由点名了那条权限码', true, why.includes('system:notice:create'));
  check('被拒的那一行一句都没落下', 0, Number(psql(`select count(*) from ${NOTICE_TABLE} where title = '${refusedTitle}'`)));
  check('那条提议已裁决（不再挂着）', held, pendingCount(secondId));
}

// ── 2) 写：持有权限码的那一半 ─────────────────────────────────────────────────────────────────────
console.log('== 场景 2 · 有 system:notice:create：扣下、批准、落库、结果带 id、台账可读 ==');
let createdId = '';
let createdCid = '';
{
  const held = pendingCount('1');
  const asked = await chat(admin, `发布公告 标题=${createdTitle} 类型=1 内容=${createdContent}`);
  createdCid = asked.conversationId;
  check('路由选中了建公告工具', 'create_notice', (asked.toolCalls || [])[0]);
  check('写被扣下（人批准前不执行）', held + 1, pendingCount('1'));
  check('人批准前一行未落', 0, Number(psql(`select count(*) from ${NOTICE_TABLE} where title = '${createdTitle}'`)));

  const token = pendingToken('1', createdTitle);
  checkNot('扣下时给出 token', 'undefined', token);
  const outcome = await confirm(admin, token, 'approve');
  check('批准后执行', 'executed', outcome.status || JSON.stringify(outcome));

  createdId = psql(`select id from ${NOTICE_TABLE} where title = '${createdTitle}' and deleted = 0 limit 1`);
  check('行已落库', true, createdId !== '');
  // 运行时把工具返回的那条结果带出来 —— 「结果带 id」在应答上就是这个。
  // The runtime carries the tool's result back out — this is what "the result carries an id" looks like on
  // the answer.
  check('结果带回了新 id', String(createdId), String((outcome.data || {}).id));
  check('落的是调用方给的那几个值', `${createdContent}|1`, psql(
    `select content || '|' || type from ${NOTICE_TABLE} where id = ${createdId}`));
  // 「结果带 id」在台账上的意思就是这一条：`side_effects.result_id` 是 NOT NULL，工具不带 id 就记不上。
  // "The result carries an id" means exactly this on the ledger: `side_effects.result_id` is NOT NULL, so a
  // tool that returns none cannot be recorded at all.
  check('台账记下了这笔写、且 result id 是那条公告', `system_notice|${createdId}`, psql(
    `select result_type || '|' || result_id from side_effects where tool_name = 'create_notice'`
    + ` and result_id = '${createdId}' order by id desc limit 1`));

  const effects = await (await fetch(`${HOST}/ai/tool-effects?page=1&limit=100`, {
    headers: { Authorization: `Bearer ${admin}`, 'tenant-id': TENANT }
  })).json();
  const items = (effects.data || {}).items || [];
  check('台账读面（/ai/tool-effects）看得见这一笔', true,
    items.some((e) => e.resultType === 'system_notice' && String(e.resultId) === String(createdId)));
}

// ── 3) 读：公告是广播 ─────────────────────────────────────────────────────────────────────────────
console.log('== 场景 3 · 读是广播：另一个调用方看得到这一条 ==');
let listCid = '';
let broadcastVisible = 0;
{
  const asked = await chat(second, '有哪些公告');
  listCid = asked.conversationId;
  check('路由选中了公告列表工具', 'list_notices', (asked.toolCalls || [])[0]);
  check('这一回合真的跑过（审计轨）', 1, auditRowsFor('list_notices', 'executed', listCid));

  const pageOf = (token) => api(`/system/notice/page?pageNo=1&pageSize=100&title=${encodeURIComponent(marker)}`, { token });
  const idsOn = (answer) => (((answer || {}).data || {}).list || []).map((row) => String(row.id));
  const adminPage = await pageOf(admin);
  const secondPage = await pageOf(second);
  check('甲的页取到了', 0, adminPage.code);
  check('乙的页取到了', 0, secondPage.code);
  check('甲看得到这一条', true, idsOn(adminPage).includes(String(createdId)));
  broadcastVisible = idsOn(secondPage).includes(String(createdId)) ? 1 : 0;
  check('乙也看得到这一条（广播，不是私信）', 1, broadcastVisible);
  check('两边看到的是同一批行（没有按人收窄）',
    idsOn(adminPage).sort().join(','), idsOn(secondPage).sort().join(','));
  const row = ((secondPage.data || {}).list || [])[0] || {};
  check('页上那一行的标题/类型对得上', `${createdTitle}|1`, `${row.title}|${row.type}`);
  note('投影的限度', '工具返回不进 chat-response（core 0.1.16 无 data 字段），六个字段由 SystemNoticeToolsTest 钉住');
}

// ── 4) 审计链 ─────────────────────────────────────────────────────────────────────────────────────
console.log('== 场景 4 · 审计链 ==');
{
  check('审计行在（>0）', true, Number(psql('select count(*) from ai_audit_logs')) > 0);
  const verify = await (await fetch(`${HOST}/audit/verify`, { headers: { Authorization: `Bearer ${admin}` } })).json();
  check('链校验通过', true, verify.data && verify.data.valid);
  note('本轮的读写了什么', `create_notice executed=${auditRowsFor('create_notice', 'executed', createdCid)}`
    + ` refused=${auditRowsFor('create_notice', 'refused', refusedCid)}`
    + ` · list_notices executed=${auditRowsFor('list_notices', 'executed', listCid)}`);
}

// 读数在**收尾之前**取：收尾会把本轮造的行删掉，之后再去数就只剩零，两轮一致也就成了空话。
// The readings are taken **before** the cleanup: the cleanup deletes this run's rows, and counting
// afterwards would leave only zeroes — "two runs agree" would then be a statement about nothing.
const reading = `READING noticeRefusedAudit=${auditRowsFor('create_notice', 'refused', refusedCid)}`
  + ` noticeExecutedAudit=${auditRowsFor('create_notice', 'executed', createdCid)}`
  + ` noticeRowsCreated=${Number(psql(`select count(*) from ${NOTICE_TABLE} where title = '${createdTitle}'`))}`
  + ` refusalLandedRows=${Number(psql(`select count(*) from ${NOTICE_TABLE} where title = '${refusedTitle}'`))}`
  + ` broadcastVisible=${broadcastVisible}`
  + ` listExecuted=${auditRowsFor('list_notices', 'executed', listCid)}`;

// ── 收尾 ─────────────────────────────────────────────────────────────────────────────────────────
console.log('== 收尾 ==');
try {
  putBack();
  putBack = null;
  ok('本轮造的行已收回（审计行刻意留着）');
} catch (e) {
  bad('收尾', '本轮造的行已收回', e.message);
}

// 读数：**本轮内**的、与历史无关的那几个数 —— 两轮跑下来必须一模一样。
// The readings: the **per-run** numbers that do not depend on history — two runs must print the same thing.
console.log(reading);

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
