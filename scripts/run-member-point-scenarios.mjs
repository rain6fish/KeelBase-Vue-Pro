#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 积分记录（`member_point_record`）的真栈场景门：第二个粗闸读的对象。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis（member 已进 jar）
//   PG_CONTAINER=m3member-pg PG_DB=m3member_1103 HOST_URL=http://127.0.0.1:18113 \
//     node scripts/run-member-point-scenarios.mjs
//
// **这张表没有租户列**（`MemberPointRecordDO extends BaseDO`），故本面只答「这个会员的记录」，没有会员编号就不跑。
// 门禁钉的就是这一点：两个会员各两行 / 一行，问 7 只答 7 的那两行，8 的那一行**不在回复里**。
//
// 四条断言：
//   1. **工具路径**：问「会员 7 的积分记录」→ 路由选中 `list_member_point_records`，答复 `count=2` 且带 7 的标题。
//   2. **另一个会员的行不出现**：8 的那一行（点数带本轮标记）不在回复里——这是「按会员收口」的可观测面。
//   3. **比控制台更窄**：普通角色用户问同一个会员 → 答复为空，审计留一行 `refused`、没有 `executed`。
//   4. **控制台一字不动**：`/admin-api/member/point/record/page?userId=7` 照旧 `code 0`、两行。
//
// The real-stack gate over point records: the second coarse-gate object.
//
// **This table carries no tenant column** (`MemberPointRecordDO extends BaseDO`), so the face only answers
// "this member's records" and refuses to run without a member id. That is exactly what the gate pins: two
// members with two and one rows; asking about 7 answers only those two, and 8's row is not in the reply.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const MARKER = `m3p-${Date.now()}`;

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

// ── 0) 夹具：两张表、两个会员、三行积分记录 ─────────────────────────────────────────────────────
console.log('== 夹具 ==');
const userTableExisted = psql(`select to_regclass('public.member_user') is not null`) === 't';
if (!userTableExisted) {
  psql(`CREATE TABLE member_user (id bigserial PRIMARY KEY, mobile varchar(11), email varchar(50), password varchar(100),
    status int2, register_ip varchar(50), register_terminal int4, login_ip varchar(50), login_date timestamp,
    nickname varchar(30), avatar varchar(512), name varchar(30), sex int2, birthday timestamp, area_id int8,
    mark varchar(255), point int4, tag_ids varchar(255), level_id int8, experience int4, group_id int8,
    creator varchar(64) DEFAULT '', create_time timestamp NOT NULL DEFAULT now(), updater varchar(64) DEFAULT '',
    update_time timestamp NOT NULL DEFAULT now(), deleted smallint NOT NULL DEFAULT 0, tenant_id int8 NOT NULL DEFAULT 0)`)
}
const recordTableExisted = psql(`select to_regclass('public.member_point_record') is not null`) === 't';
if (!recordTableExisted) {
  psql(`CREATE TABLE member_point_record (id bigserial PRIMARY KEY, user_id int8 NOT NULL, biz_id varchar(64),
    biz_type int4, title varchar(64), description varchar(255), point int4, total_point int4,
    creator varchar(64) DEFAULT '', create_time timestamp NOT NULL DEFAULT now(), updater varchar(64) DEFAULT '',
    update_time timestamp NOT NULL DEFAULT now(), deleted smallint NOT NULL DEFAULT 0,
    tenant_id int8 NOT NULL DEFAULT 0)`)
}

const cleanup = () => {
  psql(`delete from member_point_record where creator = '${MARKER}'`);
  psql(`delete from member_user where creator = '${MARKER}'`);
  psql(`delete from system_user_role where user_id in (select id from system_users where creator = '${MARKER}')`);
  psql(`delete from system_oauth2_access_token where user_id in (select id from system_users where creator = '${MARKER}')`);
  psql(`delete from system_users where creator = '${MARKER}'`);
  if (!recordTableExisted) psql(`drop table if exists member_point_record`);
  if (!userTableExisted) psql(`drop table if exists member_user`);
};
process.on('exit', () => {
  try { cleanup(); } catch (e) { console.log(`  note  收尾失败 ${e.message}`); }
});

psql(`INSERT INTO member_user (mobile, status, nickname, point, creator, tenant_id)
      VALUES ('13700000007', 0, '积分七-${MARKER}', 120, '${MARKER}', ${TENANT}),
             ('13700000008', 0, '积分八-${MARKER}', 40, '${MARKER}', ${TENANT})`);
const memberId = psql(`select id from member_user where creator = '${MARKER}' and mobile = '13700000007'`);
const otherId = psql(`select id from member_user where creator = '${MARKER}' and mobile = '13700000008'`);

psql(`INSERT INTO member_point_record (user_id, biz_id, biz_type, title, description, point, total_point, creator, tenant_id)
      VALUES (${memberId}, 'biz-a-${MARKER}', 1, '签到奖励-${MARKER}', '获得 10 积分', 10, 110, '${MARKER}', ${TENANT}),
             (${memberId}, 'biz-b-${MARKER}', 2, '下单奖励-${MARKER}', '获得 20 积分', 20, 120, '${MARKER}', ${TENANT}),
             (${otherId}, 'biz-c-${MARKER}', 1, '别人的奖励-${MARKER}', '获得 30 积分', 30, 40, '${MARKER}', ${TENANT})`);
check('本轮积分记录 = 3', '3', psql(`select count(*) from member_point_record where creator = '${MARKER}' and deleted = 0`));

// 一个普通角色（非超管）的控制台用户：口令哈希照抄 admin，故用同一个口令登录。
const adminHash = psql(`select password from system_users where username = '${ADMIN_USER}' and deleted = 0 order by id limit 1`);
const nonAdminId = psql(`select coalesce(max(id), 0) + 1 from system_users`);
psql(`INSERT INTO system_users (id, username, password, nickname, status, creator, tenant_id)
      VALUES (${nonAdminId}, 'm3p${MARKER.slice(4)}', '${adminHash}', '非超管-${MARKER}', 0, '${MARKER}', ${TENANT})`);
psql(`INSERT INTO system_user_role (id, user_id, role_id, creator, tenant_id)
      VALUES ((select coalesce(max(id), 0) + 1 from system_user_role), ${nonAdminId}, 2, '${MARKER}', ${TENANT})`);

// ── 1) 工具路径只答这个会员的记录 ───────────────────────────────────────────────────────────────
console.log('== 工具路径 ==');
const executed = () => Number(psql(`select count(*) from ai_audit_logs where tool = 'list_member_point_records' and outcome = 'executed'`));
const refused = () => Number(psql(`select count(*) from ai_audit_logs where tool = 'list_member_point_records' and outcome = 'refused'`));
const executedBefore = executed();
const refusedBefore = refused();

const adminToken = await login(ADMIN_USER, resolveAdminPassword(psql));
const read = await chat(adminToken, `会员 ${memberId} 的积分记录`);
const readReply = String(read.reply || '');
check('路由选中 list_member_point_records', 'true',
  JSON.stringify(read.toolCalls || []).includes('list_member_point_records'));
check('答出两行', 'true', /count=2/.test(readReply));
check('答出这一行', 'true', readReply.includes(`签到奖励-${MARKER}`));
check('答出那一行', 'true', readReply.includes(`下单奖励-${MARKER}`));
check('另一个会员那一行不在回复里', 'true', !readReply.includes(`别人的奖励-${MARKER}`));
check('这轮留了一行 executed', '1', executed() - executedBefore);
note('回复', readReply);

// ── 2) 比控制台更窄：非超管拿不到 ───────────────────────────────────────────────────────────────
console.log('== 非超管 ==');
const userToken = await login(`m3p${MARKER.slice(4)}`, resolveAdminPassword(psql));
const asUser = await chat(userToken, `会员 ${memberId} 的积分记录`);
const asUserReply = String(asUser.reply || '');
check('非超管拿不到这一行', 'true', !asUserReply.includes(`签到奖励-${MARKER}`));
check('非超管这一轮没有多出 executed 行', '1', executed() - executedBefore);
check('非超管这一轮留了一行 refused', '1', refused() - refusedBefore);
note('回复', asUserReply);

// ── 3) 控制台 REST 一字不动 ────────────────────────────────────────────────────────────────────
console.log('== 控制台 ==');
const viaRest = await api(`/member/point/record/page?userId=${memberId}&pageSize=10`, { token: adminToken });
check('/member/point/record/page code', '0', viaRest.code);
check('控制台照旧两行', '2', (viaRest.data?.list || []).length);
check('控制台看得到另一个会员那一行（按 userId 换查询）', '1',
  ((await api(`/member/point/record/page?userId=${otherId}&pageSize=10`, { token: adminToken })).data?.list || []).length);

// ── 读音 ───────────────────────────────────────────────────────────────────────────────────────
console.log(`\nREADING memberRecordsOnly=1 otherMemberHidden=1 nonAdminRefused=1 consoleUnchanged=1 marker=${MARKER}`);
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
