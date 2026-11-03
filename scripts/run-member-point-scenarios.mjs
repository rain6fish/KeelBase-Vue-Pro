#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 积分记录（`member_point_record`）的真栈场景门：第二个粗闸读的对象。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis（member 已进 jar）
//   PG_CONTAINER=m3member-pg PG_DB=m3member_1103 HOST_URL=http://127.0.0.1:18113 \
//     node scripts/run-member-point-scenarios.mjs
//
// **本面只答「这个会员的记录」，没有会员编号就不跑**——理由是不筛的分页是一次导出、不是一次查询。真栈实测：
// 表上**有** `tenant_id`（`MemberPointRecordDO` 虽继承普通审计基类，租户拦截器照样加 `tenant_id`），故跨租户的
// 会员编号也必须答没有。
//
// 六组断言：
//   1. **工具路径**：问「会员 7 的积分记录」→ 路由选中 `list_member_point_records`，答复 `count=2` 且带 7 的标题。
//   2. **另一个会员的行不出现**：8 的那一行（点数带本轮标记）不在回复里——这是「按会员收口」的可观测面。
//   3. **必须给会员编号**：只说「看一下积分记录」→ 不交出任何一行、不多出 `executed`。
//   4. **跨租户**：另一个租户的会员编号 → `count=0`，它的行不出现。
//   5. **比控制台更窄**：普通角色用户问同一个会员 → 答复为空，审计留一行 `refused`、没有 `executed`。
//   6. **控制台一字不动**：`/admin-api/member/point/record/page?userId=7` 照旧 `code 0`、两行。
//
// The real-stack gate over point records: the second coarse-gate object.
//
// **The face only answers "this member's records" and refuses to run without a member id** — an unfiltered page is an
// export, not a lookup. Measured on the real stack: the table **does** carry `tenant_id` (the tenant interceptor adds
// it even though `MemberPointRecordDO` extends the plain audit base), so a member id from another tenant must answer
// empty as well.
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

// Identity and internal columns that must not leave the projection. `bizId` / `title` are the record's
// own facts; `userId` (the member) and the audit/tenancy columns are not answers to "what did member N earn".
const HIDDEN = ['userId', 'user_id', 'tenantId', 'tenant_id', 'creator', 'updater', 'deleted'];
const leaks = (reply, hidden) => hidden.filter((key) => String(reply).includes(key));

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

let turns = 0;
async function chat(token, message) {
  turns += 1;
  const conversationId = `${MARKER}-${turns}`;
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId })
  });
  const json = await res.json().catch(() => ({}));
  return { ...(json.data || json), httpStatus: res.status, conversationId };
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

// 另一个租户的会员与记录：调用方的租户是 1，问这一个编号必须答「没有」，而不是把别人的行交出来。
psql(`INSERT INTO member_user (mobile, status, nickname, point, creator, tenant_id)
      VALUES ('13700000009', 0, '积分九-${MARKER}', 50, '${MARKER}', 2)`);
const otherTenantMemberId = psql(`select id from member_user where creator = '${MARKER}' and mobile = '13700000009'`);
psql(`INSERT INTO member_point_record (user_id, biz_id, biz_type, title, description, point, total_point, creator, tenant_id)
      VALUES (${otherTenantMemberId}, 'biz-d-${MARKER}', 1, '别租户的奖励-${MARKER}', '获得 50 积分', 50, 50, '${MARKER}', 2)`);

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
check('投影带业务标识（不是空回复）', 'true', /bizId=/.test(readReply));
check('投影不含身份/内部字段', '[]', JSON.stringify(leaks(readReply, HIDDEN)));
check('这轮留了一行 executed', '1', executed() - executedBefore);
note('回复', readReply);

// ── 1b) 必须给会员编号：没有编号就不跑 ───────────────────────────────────────────────────────────
console.log('== 没有会员编号 ==');
const noId = await chat(adminToken, '看一下积分记录');
const noIdReply = String(noId.reply || '');
check('没有会员编号时不交出本轮任何一行', 'true',
  !noIdReply.includes(`签到奖励-${MARKER}`) && !noIdReply.includes(`下单奖励-${MARKER}`)
  && !noIdReply.includes(`别人的奖励-${MARKER}`));
check('没有会员编号时没有新的 executed 行', '1', executed() - executedBefore);
note('回复', noIdReply);

// ── 1c) 别的租户的会员：同一个编号必须答没有 ─────────────────────────────────────────────────────
console.log('== 跨租户 ==');
const crossTenant = await chat(adminToken, `会员 ${otherTenantMemberId} 的积分记录`);
const crossTenantReply = String(crossTenant.reply || '');
check('别租户那一行不在回复里', 'true', !crossTenantReply.includes(`别租户的奖励-${MARKER}`));
check('别租户的编号答 count=0', 'true', /count=0/.test(crossTenantReply));
note('回复', crossTenantReply);

// ── 2) 比控制台更窄：非超管拿不到 ───────────────────────────────────────────────────────────────
console.log('== 非超管 ==');
const executedBeforeUser = executed();
const refusedBeforeUser = refused();
const userToken = await login(`m3p${MARKER.slice(4)}`, resolveAdminPassword(psql));
const asUser = await chat(userToken, `会员 ${memberId} 的积分记录`);
const asUserReply = String(asUser.reply || '');
check('非超管拿不到这一行', 'true', !asUserReply.includes(`签到奖励-${MARKER}`));
check('非超管这一轮没有多出 executed 行', '0', executed() - executedBeforeUser);
check('非超管这一轮留了一行 refused', '1', refused() - refusedBeforeUser);
note('回复', asUserReply);

// ── 3) 控制台 REST 一字不动 ────────────────────────────────────────────────────────────────────
console.log('== 控制台 ==');
const viaRest = await api(`/member/point/record/page?userId=${memberId}&pageSize=10`, { token: adminToken });
check('/member/point/record/page code', '0', viaRest.code);
check('控制台照旧两行', '2', (viaRest.data?.list || []).length);
const otherRest = await api(`/member/point/record/page?userId=${otherId}&pageSize=10`, { token: adminToken });
check('控制台看得到另一个会员那一行（按 userId 换查询）', '1', (otherRest.data?.list || []).length);

// ── 读音 ───────────────────────────────────────────────────────────────────────────────────────
// 读数由断言算出，不写死：红灯时汇总行也必须跟着变红。
const reading = {
  memberRecordsOnly: /count=2/.test(readReply) && readReply.includes(`签到奖励-${MARKER}`)
    && readReply.includes(`下单奖励-${MARKER}`),
  otherMemberHidden: !readReply.includes(`别人的奖励-${MARKER}`),
  projectionClean: /bizId=/.test(readReply) && leaks(readReply, HIDDEN).length === 0,
  memberIdRequired: !noIdReply.includes(`签到奖励-${MARKER}`) && !noIdReply.includes(`下单奖励-${MARKER}`)
    && !noIdReply.includes(`别人的奖励-${MARKER}`),
  crossTenantHidden: !crossTenantReply.includes(`别租户的奖励-${MARKER}`) && /count=0/.test(crossTenantReply),
  nonAdminRefused: !asUserReply.includes(`签到奖励-${MARKER}`)
    && executed() - executedBeforeUser === 0 && refused() - refusedBeforeUser === 1,
  consoleUnchanged: viaRest.code === 0 && (viaRest.data?.list || []).length === 2
    && (otherRest.data?.list || []).length === 1
};
console.log(`\nREADING memberRecordsOnly=${+reading.memberRecordsOnly} otherMemberHidden=${+reading.otherMemberHidden}`
  + ` projectionClean=${+reading.projectionClean} memberIdRequired=${+reading.memberIdRequired}`
  + ` crossTenantHidden=${+reading.crossTenantHidden} nonAdminRefused=${+reading.nonAdminRefused}`
  + ` consoleUnchanged=${+reading.consoleUnchanged} marker=${MARKER}`);
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
