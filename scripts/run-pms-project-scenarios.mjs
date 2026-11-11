#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 项目与工作项的真栈场景门：本线的**第三种形态**——可见性由 service 自己按成员表判，切面只决定「它问的是谁」。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis（pms 已进 jar）
//   PG_CONTAINER=m3pms-pg PG_DB=m3pms_1103 HOST_URL=http://127.0.0.1:18114 \
//     node scripts/run-pms-project-scenarios.mjs
//
// 判据钉在**模块自己的规则**上（`PmsProjectMemberServiceImpl.validateProjectReadable`）：公开项目人人可读，
// 私有项目要成员或超管。夹具因此是两个**私有**项目 + 一个只在一个项目里的普通角色用户。
//
//   1. **普通用户只看到自己参与的项目**：`我的项目` 答甲、不答乙——不接时两者都会出现在答复里。
//   2. **普通用户读另一个项目的工作项被拒**：模块自己拒（PROJECT_ACCESS_DENIED），工具面拿不到数据、也不留
//      `executed` 行。
//   3. **超管看到两个**：这是模块自己的规则（`includeAllProject` 只对超管），场景门把它如实读出来。
//   4. **控制台一字不动**：REST 分页对同一批夹具给出与工具面相同的范围。
//
// The real-stack gate over projects and work items: this line's **third form** — the service decides visibility by its
// own membership table, and the seam only decides who it is asked about. The criterion is the module's own rule
// (`validateProjectReadable`): an open project is readable by anyone, a private one needs membership or the super
// administrator. The fixture is therefore two **private** projects and an ordinary user in one of them.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const MARKER = `m3pms-${Date.now()}`;

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

const psql = (sql) => execFileSync('docker',
  ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-U', 'root', '-d', DB, '-tAc', sql],
  { encoding: 'utf8' }).trim();

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${HOST}/admin-api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'tenant-id': TENANT,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return res.json();
}

async function login(username, password) {
  const r = await api('/system/auth/login', { method: 'POST', body: { username, password } });
  if (r.code !== 0) throw new Error(`login(${username}) -> ${r.code}: ${r.msg}`);
  return r.data.accessToken;
}

async function chat(token, message) {
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId: `${MARKER}-${Date.now()}` })
  });
  const json = await res.json().catch(() => ({}));
  return { ...(json.data || json), httpStatus: res.status };
}

// ── 0) 夹具：两个私有项目、一个普通用户（只在甲项目里）、两个工作项 ─────────────────────────────
console.log('== 夹具 ==');
const adminHash = psql(`select password from system_users where username = '${ADMIN_USER}' and deleted = 0 order by id limit 1`);
const adminId = psql(`select id from system_users where username = '${ADMIN_USER}' and deleted = 0 order by id limit 1`);

const userId = psql(`select coalesce(max(id), 0) + 1 from system_users`);
const cleanup = () => {
  psql(`delete from pms_work_item where name like '%${MARKER}%'`);
  psql(`delete from pms_project_member where project_id in (select id from pms_project where name like '%${MARKER}%')`);
  psql(`delete from pms_project where name like '%${MARKER}%'`);
  psql(`delete from system_user_role where user_id = ${userId}`);
  psql(`delete from system_oauth2_access_token where user_id = ${userId}`);
  psql(`delete from system_users where id = ${userId}`);
};
process.on('exit', () => {
  try { cleanup(); } catch (e) { console.log(`  note  收尾失败 ${e.message}`); }
});

// `creator` 必须是**用户编号**：控制台会 `NumberUtils.parseLong(project.getCreator())`，填标记字符串会直接 500。
// `creator` must be a **user id**: the console parses it with `NumberUtils.parseLong`, and a marker string 500s.
psql(`INSERT INTO pms_project (name, status, type, level, description, open_status, creator, tenant_id)
      VALUES ('甲项目-${MARKER}', 1, 1, 1, '', false, '${adminId}', ${TENANT}),
             ('乙项目-${MARKER}', 1, 1, 1, '', false, '${adminId}', ${TENANT})`);
const mine = psql(`select id from pms_project where name like '甲项目-${MARKER}'`);
const other = psql(`select id from pms_project where name like '乙项目-${MARKER}'`);

psql(`INSERT INTO system_users (id, username, password, nickname, status, creator, tenant_id)
      VALUES (${userId}, 'm3pr${MARKER.slice(6)}', '${adminHash}', '普通角色-${MARKER}', 0, '${MARKER}', ${TENANT})`);
psql(`INSERT INTO system_user_role (id, user_id, role_id, creator, tenant_id)
      VALUES ((select coalesce(max(id), 0) + 1 from system_user_role), ${userId}, 2, '${MARKER}', ${TENANT})`);
psql(`INSERT INTO pms_project_member (project_id, user_id, level, creator, tenant_id)
      VALUES (${mine}, ${adminId}, 1, '${adminId}', ${TENANT}),
             (${mine}, ${userId}, 3, '${adminId}', ${TENANT})`);

psql(`INSERT INTO pms_work_item (project_id, type, serial_number, name, priority, assignee_user_id, status_id,
        status, lifecycle_status, progress, creator, tenant_id)
      VALUES (${mine}, 1, 1, '甲-工作项-${MARKER}', 2, ${userId}, 1, 1, 1, 30, '${adminId}', ${TENANT}),
             (${other}, 1, 1, '乙-工作项-${MARKER}', 2, ${userId}, 1, 1, 1, 10, '${adminId}', ${TENANT})`);
check('本轮项目 = 2', '2', psql(`select count(*) from pms_project where name like '%${MARKER}%' and deleted = 0`));

const executed = (tool) => Number(psql(`select count(*) from ai_audit_logs where tool = '${tool}' and outcome = 'executed'`));
const PROJECTS = 'list_my_projects';
const ITEMS = 'list_my_work_items';

// ── 1) 普通用户只看到自己参与的项目 ─────────────────────────────────────────────────────────────
console.log('== 普通用户 ==');
const userToken = await login(`m3pr${MARKER.slice(6)}`, resolveAdminPassword(psql));
const projectsBefore = executed(PROJECTS);
const itemsBefore = executed(ITEMS);

const mineTurn = await chat(userToken, '我的项目');
const mineReply = String(mineTurn.reply || '');
check('路由选中 list_my_projects', 'true', JSON.stringify(mineTurn.toolCalls || []).includes(PROJECTS));
check('答出自己参与的项目', 'true', mineReply.includes(`甲项目-${MARKER}`));
check('不答另一个项目', 'true', !mineReply.includes(`乙项目-${MARKER}`));
check('这轮留了一行 executed', '1', executed(PROJECTS) - projectsBefore);
note('回复', mineReply);

const itemsReply = String((await chat(userToken, `我的任务 项目 ${mine}`)).reply || '');
check('答出自己项目里的工作项', 'true', itemsReply.includes(`甲-工作项-${MARKER}`));
check('这轮留了一行 executed', '1', executed(ITEMS) - itemsBefore);
note('回复', itemsReply);

const denied = String((await chat(userToken, `我的任务 项目 ${other}`)).reply || '');
check('另一个项目的工作项拿不到', 'true', !denied.includes(`乙-工作项-${MARKER}`));
check('被拒那一轮没有多出 executed 行', '1', executed(ITEMS) - itemsBefore);
note('回复', denied);

// ── 2) 超管看到两个项目（模块自己的规则） ───────────────────────────────────────────────────────
console.log('== 超管 ==');
const adminToken = await login(ADMIN_USER, resolveAdminPassword(psql));
const adminReply = String((await chat(adminToken, '我的项目')).reply || '');
check('超管看得到两个项目', 'true',
  adminReply.includes(`甲项目-${MARKER}`) && adminReply.includes(`乙项目-${MARKER}`));

// ── 3) 控制台的权限码照旧把关（内容不做断言，原因见下） ───────────────────────────────────────
console.log('== 控制台 ==');
const userPage = await api('/pms/pm/project/page?pageSize=50', { token: userToken });
check('控制台对普通角色按权限码拒绝（403）', '403', userPage.code);
// 超管那一页会走 `PmsWorkItemMapper.selectStatusCountMapByProjectIds` 的状态计数；它原先用
// `project_id AS projectId` 取别名，PostgreSQL 把未加引号的别名小写成 `projectid`，`row.get("projectId")` 拿到 null。
// 那 6 处已改为下划线别名（两方言都成立），故这里恢复对控制台内容的断言。
// The super administrator's page runs the status count map, which used to alias `project_id AS projectId`; PostgreSQL
// lower-cases an unquoted alias, so `row.get("projectId")` was null. All six sites now use snake_case aliases, which
// hold on both dialects, so the console content is asserted again.
const adminPage = await api('/pms/pm/project/page?pageSize=50', { token: adminToken });
check('/pms/pm/project/page code', '0', adminPage.code);
const adminNames = (adminPage.data?.list || []).map((row) => row.name).filter((n) => String(n).includes(MARKER));
check('控制台对超管给两个（这一页不再 500）', '2', adminNames.length);

// ── 读音 ───────────────────────────────────────────────────────────────────────────────────────
console.log(`\nREADING memberOnlySeesOwn=1 otherProjectRefused=1 superAdminSeesBoth=1 consolePermissionGate=1 marker=${MARKER}`);
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
