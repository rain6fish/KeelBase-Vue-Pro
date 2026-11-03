#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 签到记录与等级记录的真栈场景门：两个同形的粗闸读对象，一套夹具、一份门禁。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis（member 已进 jar）
//   PG_CONTAINER=m3member-pg PG_DB=m3member_1103 HOST_URL=http://127.0.0.1:18113 \
//     node scripts/run-member-signin-level-scenarios.mjs
//
// 两个面都只答「这个会员的记录」，没有会员编号就不跑。门禁对每个面钉同样三件事：
//
//   1. **工具路径**：问会员 7 → 路由选中那个工具、`count=2`、答出 7 的那两行。
//   2. **另一个会员的行不出现**：8 的那一行不在这两个面的回复里——这是「按会员收口」的可观测面。
//   3. **比控制台更窄 + 控制台一字不动**：非超管 → 空答复、一行 `refused`、没有 `executed`；
//      REST `/member/sign-in/record/page` 与 `/member/level-record/page` 照旧 `code 0`、两行。
//
// The real-stack gate over sign-in and level records: two coarse-gate objects of the same shape, one
// fixture and one gate.
//
// Both faces answer only "this member's records" and refuse to run without a member id. For each face the
// gate pins three things: the tool path routes, returns the member's two rows and not the other member's;
// an ordinary console user gets an empty answer, one `refused` audit row and no `executed`; and the
// console's own pages still answer their two rows.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const MARKER = `m3sl-${Date.now()}`;

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

// ── 0) 夹具：三张表、两个会员、各两条 / 一条记录 ─────────────────────────────────────────────────
console.log('== 夹具 ==');
const tables = [
  ['member_user', `CREATE TABLE member_user (id bigserial PRIMARY KEY, mobile varchar(11), email varchar(50),
    password varchar(100), status int2, register_ip varchar(50), register_terminal int4, login_ip varchar(50),
    login_date timestamp, nickname varchar(30), avatar varchar(512), name varchar(30), sex int2, birthday timestamp,
    area_id int8, mark varchar(255), point int4, tag_ids varchar(255), level_id int8, experience int4, group_id int8,
    creator varchar(64) DEFAULT '', create_time timestamp NOT NULL DEFAULT now(), updater varchar(64) DEFAULT '',
    update_time timestamp NOT NULL DEFAULT now(), deleted smallint NOT NULL DEFAULT 0, tenant_id int8 NOT NULL DEFAULT 0)`],
  ['member_sign_in_record', `CREATE TABLE member_sign_in_record (id bigserial PRIMARY KEY, user_id int8 NOT NULL,
    day int4, point int4, experience int4, creator varchar(64) DEFAULT '', create_time timestamp NOT NULL DEFAULT now(),
    updater varchar(64) DEFAULT '', update_time timestamp NOT NULL DEFAULT now(), deleted smallint NOT NULL DEFAULT 0,
    tenant_id int8 NOT NULL DEFAULT 0)`],
  ['member_level_record', `CREATE TABLE member_level_record (id bigserial PRIMARY KEY, user_id int8 NOT NULL,
    level_id int8, level int4, discount_percent int4, experience int4, user_experience int4, remark varchar(255),
    description varchar(255), creator varchar(64) DEFAULT '', create_time timestamp NOT NULL DEFAULT now(),
    updater varchar(64) DEFAULT '', update_time timestamp NOT NULL DEFAULT now(), deleted smallint NOT NULL DEFAULT 0,
    tenant_id int8 NOT NULL DEFAULT 0)`]
];
const created = [];
for (const [name, ddl] of tables) {
  const existed = psql(`select to_regclass('public.${name}') is not null`) === 't';
  if (!existed) {
    psql(ddl);
    created.push(name);
  }
  note(`${name} 表`, existed ? '已存在（只删本轮的行）' : '本轮创建（收尾时删表）');
}

const cleanup = () => {
  psql(`delete from member_sign_in_record where creator = '${MARKER}'`);
  psql(`delete from member_level_record where creator = '${MARKER}'`);
  psql(`delete from member_user where creator = '${MARKER}'`);
  psql(`delete from system_user_role where user_id in (select id from system_users where creator = '${MARKER}')`);
  psql(`delete from system_oauth2_access_token where user_id in (select id from system_users where creator = '${MARKER}')`);
  psql(`delete from system_users where creator = '${MARKER}'`);
  for (const name of created) psql(`drop table if exists ${name}`);
};
process.on('exit', () => {
  try { cleanup(); } catch (e) { console.log(`  note  收尾失败 ${e.message}`); }
});

psql(`INSERT INTO member_user (mobile, status, nickname, point, creator, tenant_id)
      VALUES ('13600000007', 0, '签到七-${MARKER}', 120, '${MARKER}', ${TENANT}),
             ('13600000008', 0, '签到八-${MARKER}', 40, '${MARKER}', ${TENANT})`);
const memberId = psql(`select id from member_user where creator = '${MARKER}' and mobile = '13600000007'`);
const otherId = psql(`select id from member_user where creator = '${MARKER}' and mobile = '13600000008'`);

psql(`INSERT INTO member_sign_in_record (user_id, day, point, experience, creator, tenant_id)
      VALUES (${memberId}, 1, 10, 5, '${MARKER}', ${TENANT}),
             (${memberId}, 2, 10, 5, '${MARKER}', ${TENANT}),
             (${otherId}, 9, 10, 5, '${MARKER}', ${TENANT})`);
psql(`INSERT INTO member_level_record (user_id, level_id, level, discount_percent, experience, user_experience,
        remark, description, creator, tenant_id)
      VALUES (${memberId}, 3, 3, 95, 20, 20, '升级', '银卡-${MARKER}', '${MARKER}', ${TENANT}),
             (${memberId}, 5, 5, 100, 60, 80, '升级', '金卡-${MARKER}', '${MARKER}', ${TENANT}),
             (${otherId}, 4, 4, 97, 30, 30, '升级', '别人的卡-${MARKER}', '${MARKER}', ${TENANT})`);

const adminHash = psql(`select password from system_users where username = '${ADMIN_USER}' and deleted = 0 order by id limit 1`);
const nonAdminId = psql(`select coalesce(max(id), 0) + 1 from system_users`);
psql(`INSERT INTO system_users (id, username, password, nickname, status, creator, tenant_id)
      VALUES (${nonAdminId}, 'm3s${MARKER.slice(5)}', '${adminHash}', '非超管-${MARKER}', 0, '${MARKER}', ${TENANT})`);
psql(`INSERT INTO system_user_role (id, user_id, role_id, creator, tenant_id)
      VALUES ((select coalesce(max(id), 0) + 1 from system_user_role), ${nonAdminId}, 2, '${MARKER}', ${TENANT})`);

const executed = (tool) => Number(psql(`select count(*) from ai_audit_logs where tool = '${tool}' and outcome = 'executed'`));
const refused = (tool) => Number(psql(`select count(*) from ai_audit_logs where tool = '${tool}' and outcome = 'refused'`));

const adminToken = await login(ADMIN_USER, resolveAdminPassword(psql));
const userToken = await login(`m3s${MARKER.slice(5)}`, resolveAdminPassword(psql));

// ── 1) 签到记录 ────────────────────────────────────────────────────────────────────────────────
console.log('== 签到记录 ==');
const SIGN_IN = 'list_member_sign_in_records';
const signInExecutedBefore = executed(SIGN_IN);
const signInRefusedBefore = refused(SIGN_IN);

const signIn = await chat(adminToken, `会员 ${memberId} 的签到记录`);
const signInReply = String(signIn.reply || '');
check('路由选中 list_member_sign_in_records', 'true', JSON.stringify(signIn.toolCalls || []).includes(SIGN_IN));
check('答出两行', 'true', /count=2/.test(signInReply));
check('答出第 2 天', 'true', /day=2/.test(signInReply));
check('另一个会员那一行（第 9 天）不在回复里', 'true', !/day=9/.test(signInReply));
check('这一轮留了一行 executed', '1', executed(SIGN_IN) - signInExecutedBefore);
note('回复', signInReply);

const signInAsUser = await chat(userToken, `会员 ${memberId} 的签到记录`);
check('非超管拿不到签到行', 'true', !/day=2/.test(String(signInAsUser.reply || '')));
check('非超管这一轮没有多出 executed 行', '1', executed(SIGN_IN) - signInExecutedBefore);
check('非超管这一轮留了一行 refused', '1', refused(SIGN_IN) - signInRefusedBefore);

const signInRest = await api(`/member/sign-in/record/page?userId=${memberId}&pageSize=10`, { token: adminToken });
check('/member/sign-in/record/page code', '0', signInRest.code);
check('控制台照旧两行', '2', (signInRest.data?.list || []).length);

// ── 2) 等级记录 ────────────────────────────────────────────────────────────────────────────────
console.log('== 等级记录 ==');
const LEVEL = 'list_member_level_records';
const levelExecutedBefore = executed(LEVEL);
const levelRefusedBefore = refused(LEVEL);

const level = await chat(adminToken, `会员 ${memberId} 的等级记录`);
const levelReply = String(level.reply || '');
check('路由选中 list_member_level_records', 'true', JSON.stringify(level.toolCalls || []).includes(LEVEL));
check('答出两行', 'true', /count=2/.test(levelReply));
check('答出金卡那一条', 'true', levelReply.includes(`金卡-${MARKER}`));
check('答出银卡那一条', 'true', levelReply.includes(`银卡-${MARKER}`));
check('另一个会员那一条不在回复里', 'true', !levelReply.includes(`别人的卡-${MARKER}`));
check('这一轮留了一行 executed', '1', executed(LEVEL) - levelExecutedBefore);
note('回复', levelReply);

const levelAsUser = await chat(userToken, `会员 ${memberId} 的等级记录`);
check('非超管拿不到等级行', 'true', !String(levelAsUser.reply || '').includes(`金卡-${MARKER}`));
check('非超管这一轮没有多出 executed 行', '1', executed(LEVEL) - levelExecutedBefore);
check('非超管这一轮留了一行 refused', '1', refused(LEVEL) - levelRefusedBefore);

const levelRest = await api(`/member/level-record/page?userId=${memberId}&pageSize=10`, { token: adminToken });
check('/member/level-record/page code', '0', levelRest.code);
check('控制台照旧两行', '2', (levelRest.data?.list || []).length);
check('控制台看得到另一个会员那一条（按 userId 换查询）', '1',
  ((await api(`/member/level-record/page?userId=${otherId}&pageSize=10`, { token: adminToken })).data?.list || []).length);

// ── 读音 ───────────────────────────────────────────────────────────────────────────────────────
console.log(`\nREADING signInScoped=1 levelScoped=1 otherMemberHidden=2 nonAdminRefused=2 consoleUnchanged=2 marker=${MARKER}`);
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
