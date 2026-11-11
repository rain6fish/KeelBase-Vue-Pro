#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// M3 第三批的门禁：oa 模块的**申请单据族**（14 个 service 的按 id 读）在接缝上的行为。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-oa-apply-scenarios.mjs
//
// **这道门能断言什么、不能断言什么，先说清楚。** 接缝的判据是「别人的行与不存在的行交回同一个答案」，
// 而运行时的聊天答案**不带工具结果**（冻结的 `chat-response` 没有 `data`，流式的 `tool_end` 只有成功与否）。
// 故这里断言的是**接线**：两个调用方各自触发工具、审计轨上的 `user_id` 就是那个人；而**收窄本身**由
// `OaApplyDocumentsGovernanceTest` 逐形状钉住（那是第三形态的可证伪判据）。两者合起来才是一句话：
// 「工具以正确身份跑到正确的地方」+「跑到的那个地方对别人的行交回空」。
//
// 断言用的行**直接写进模块自己的表**（`oa_leave_apply`），不借 REST：本部署没有种 `oa:*` 的菜单与权限码，
// 控制台那一面本来就用不了；工具路径不过 `@PreAuthorize`，正是本批要证的那一条。
//
// 它造的东西它收回：按本轮的标记（写在 `reason` 里）删，故够不到别的轮次。**审计行刻意不动**——哈希链，
// 为收拾凌乱去剪它一环比凌乱更坏。
//
// English: M3 batch three's gate over the OA application-document family's read-by-id seam.
//
// **What this gate can and cannot assert, said up front.** The seam's criterion is "another's row answers
// exactly as a missing one", and the runtime's chat answer **carries no tool result** (the frozen
// `chat-response` has no `data`; the streaming `tool_end` carries only success). So this gate asserts
// **wiring**: both callers reach the tool and the audit trail records each as that person. The narrowing
// itself is pinned shape by shape in `OaApplyDocumentsGovernanceTest`, which is the third form's
// falsifiable criterion. Together they say the one sentence: the tool runs as the right identity, and
// where it runs answers another's row with nothing.
//
// Its fixture rows go **straight into the module's own table** (`oa_leave_apply`), not through REST: this
// deployment seeds neither the `oa:*` menus nor their permission codes, so the console face is not usable
// anyway; the tool path does not pass `@PreAuthorize`, which is exactly what this batch proves.
//
// Everything it creates it removes, by this run's own marker in `reason`. **Audit rows are deliberately
// left alone** — a hash chain; cutting a link to tidy up is worse than the untidiness.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const SECOND_USER = process.env.SECOND_USER || 'oagate';
const SECOND_PASS = process.env.SECOND_PASS || 'gate-pass-1234';
const LEAVE = process.env.OA_LEAVE_TABLE || 'oa_leave_apply';
const RUNNING = 1; // BpmProcessInstanceStatusEnum.RUNNING / 审批中

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));

const PSQL = process.env.PSQL || 'psql';
const PSQL_HELPER = (process.env.PSQL_HELPER || 'docker').toLowerCase();
const PSQL_HELPER_SCRIPT = process.env.PSQL_HELPER_SCRIPT ? resolve(process.env.PSQL_HELPER_SCRIPT) : '';
if (PSQL_HELPER_SCRIPT && !existsSync(PSQL_HELPER_SCRIPT)) {
  throw new Error(`PSQL_HELPER_SCRIPT points to a missing file: ${process.env.PSQL_HELPER_SCRIPT}`);
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
  throw new Error(`PSQL_HELPER must be "docker" or "direct" (got "${process.env.PSQL_HELPER}")`);
};

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

async function api(path, { method = 'GET', token, body } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(`${HOST}/admin-api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const json = await res.json();
    if (json.code !== 500 || attempt > 1) return json;
    console.log(`  note  ${path} 第一次答 500 —— 宿主的瞬时故障，重试一次`);
    await new Promise((r) => setTimeout(r, 300));
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
    body: JSON.stringify({ message, conversationId: `oa-gate-${Date.now()}`, ...extra })
  });
  const json = await res.json();
  return json.data || json;
}

const auditFloor = () => Number(psql('select coalesce(max(id), 0) from ai_audit_logs'));
const ranAs = (tool, callerId, floor) =>
  Number(psql(`select count(*) from ai_audit_logs where id > ${floor} and tool = '${tool}'`
    + ` and outcome = 'executed' and user_id = '${callerId}'`));

// ── 0) 前置 ────────────────────────────────────────────────────────────────────────────────────────
console.log('== 前置 ==');
check('/app/capabilities 200', '200', (await fetch(`${HOST}/app/capabilities`)).status);
const admin = await login(ADMIN_USER, resolveAdminPassword(psql));
ok('admin 登录');

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
  // 行范围必须是 SELF（5）：新建角色默认 ALL（1），而 ALL 会让 `callerToEnforce()` 整条放过，
  // 那一道门就什么都证明不了。
  const roleId = psql(`select id from system_role where code = 'common' and deleted = 0 limit 1`);
  await api('/system/permission/assign-user-role', { method: 'POST', token: admin, body: { userId: Number(secondId), roleIds: [Number(roleId)] } });
  await api('/system/permission/assign-role-data-scope', {
    method: 'POST', token: admin, body: { roleId: Number(roleId), dataScope: 5, dataScopeDeptIds: [] }
  });
}
const second = await login(SECOND_USER, SECOND_PASS);
ok('第二个调用方登录');

// ── 夹具：直接写模块自己的表 ───────────────────────────────────────────────────────────────────────
console.log('== 场景 1 · 两行夹具写进 oa_leave_apply ==');
const marker = `oa-gate-${Date.now()}`;
const adminMarker = `${marker}-admin`;
const secondMarker = `${marker}-second`;
putBack = () => {
  psql(`delete from ${LEAVE} where reason like '%${marker}%'`);
};
psql(`insert into ${LEAVE}(id, title, type, days, reason, status, creator, deleted, tenant_id, create_time, update_time)`
  + ` values (nextval('oa_leave_apply_seq'), 'admin 的请假', 1, 1, '${adminMarker}', ${RUNNING}, '1', 0, ${TENANT}, now(), now())`);
psql(`insert into ${LEAVE}(id, title, type, days, reason, status, creator, deleted, tenant_id, create_time, update_time)`
  + ` values (nextval('oa_leave_apply_seq'), 'second 的请假', 1, 1, '${secondMarker}', ${RUNNING}, '${secondId}', 0, ${TENANT}, now(), now())`);
const adminRowId = psql(`select id from ${LEAVE} where reason = '${adminMarker}'`);
const secondRowId = psql(`select id from ${LEAVE} where reason = '${secondMarker}'`);
check('admin 那一行已种', true, adminRowId !== '');
check('第二个调用方那一行已种', true, secondRowId !== '');

// ── 场景 2 · 身份传递：列本人请假 ─────────────────────────────────────────────────────────────────
console.log('== 场景 2 · 身份传递：list_my_oa_leave_applies ==');
{
  const floor = auditFloor();
  // 触发词**刻意避开** BPM 样例那五个短语（见工具面的类注释）：撞车时先注册的赢，而它指向 `bpm_oa_leave`。
  // The phrase deliberately avoids BPM's five: on a collision the first-registered route wins, and that one
  // points at `bpm_oa_leave`.
  const a = await chat(admin, '请假申请列表');
  check('admin 触发 oa 工具', 'list_my_oa_leave_applies', (a.toolCalls || [])[0]);
  check('admin 那次以 admin 身份执行（审计轨）', 1, ranAs('list_my_oa_leave_applies', 1, floor));

  const s = await chat(second, '请假申请列表');
  check('第二个调用方触发同一个工具', 'list_my_oa_leave_applies', (s.toolCalls || [])[0]);
  check('它那次以自己身份执行（审计轨）', 1, ranAs('list_my_oa_leave_applies', secondId, floor));
}

// ── 场景 3 · 按 id 读：自己的行与别人的行都跑到同一个口 ──────────────────────────────────────────
console.log('== 场景 3 · 按 id 读：get_my_oa_leave_apply ==');
{
  // 两次调用都**执行**——接缝在工具路径上把别人的行交回空，而不是抛错，故审计轨上两次都是 executed。
  // 「交回的是空」不在这里断言（答案不带工具结果），由 `OaApplyDocumentsGovernanceTest` 钉住。
  const ownFloor = auditFloor();
  await chat(second, '查请假单', { targetId: Number(secondRowId) });
  check('读自己的行以自己身份执行（审计轨）', 1, ranAs('get_my_oa_leave_apply', secondId, ownFloor));

  const otherFloor = auditFloor();
  await chat(second, '查请假单', { targetId: Number(adminRowId) });
  check('读别人的行同样被执行（收窄在返回值，不在拒绝）', 1,
    ranAs('get_my_oa_leave_apply', secondId, otherFloor));
  console.log('  note  别人的行交回空这一条由单测断言：聊天答案不带工具结果');
}

// ── 场景 4 · 审计链 ───────────────────────────────────────────────────────────────────────────────
console.log('== 场景 4 · 审计链 ==');
{
  const rows = Number(psql('select count(*) from ai_audit_logs'));
  check('审计行在（>0）', true, rows > 0);
  const verify = await (await fetch(`${HOST}/audit/verify`, { headers: { Authorization: `Bearer ${admin}` } })).json();
  check('链校验通过', true, verify.data && verify.data.valid);
}

// ── 收尾 ──────────────────────────────────────────────────────────────────────────────────────────
console.log('== 收尾 · 把本轮造的行收回去 ==');
try {
  runPutBack();
  ok('本轮那两行已收回（审计行刻意留着）');
} catch (e) {
  bad('收尾', '本轮那两行已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
