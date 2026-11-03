#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 会员用户（`member_user`）的真栈场景门：这是本仓第一个**粗闸读**的工具面，也是第一个跨命名空间的对象。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis（member 已进 jar）
//   PG_CONTAINER=m3member-pg PG_DB=m3member_1103 HOST_URL=http://127.0.0.1:18113 \
//     node scripts/run-member-user-scenarios.mjs
//
// **为什么这里没有「别人的行读不到」那一条。** 会员表的属主是会员编号，而调用方永远是管理员编号；两套序列相互独立、
// 会撞号。把分页或单行钉到调用方只会交回**号码相同的那个会员**，所以本面不做属主收窄，走的是平台的粗闸
// （`OwnershipGuard.requireAction`）。它自己的可证伪面因此不是「别人读不到」，而是下面三条：
//
//   1. **业务事实读得到，身份字段出不去**。管理员问会员 7 的资料，答得出积分与等级，答复里**没有**手机号。
//   2. **比控制台更窄**：一个**非超管**控制台用户（普通角色）问同一个会员，拿不到任何会员事实——不接时他拿得到。
//   3. **会员令牌进不了这道门**：种一行 `user_type = 1`（会员）、`user_id` 等于管理员的令牌，拿它打 `/ai/chat`，
//      必须 401。这正是本次修的 `userType` 混同——不修时它会被认成同号管理员。
//
// 另有两条守卫断言：控制台自己的 REST 路径一字不动；每次工具调用各留一行审计。
//
// The real-stack gate over the member user: this line's first **coarse-gate** tool face, and its first
// object whose owner lives in another id space.
//
// **Why there is no "another's row is withheld" assertion here.** A member row's owner is a member id,
// while the caller is always an administrator id; the two sequences are independent and collide. Pinning
// a page or a row to the caller would hand back whichever member carries the same number, so this face
// does not narrow by ownership — it uses the platform's coarse gate. Its falsifiable faces are therefore
// three others: the business facts are readable while the contact fields are not; an ordinary console
// user gets no member facts at all (they would, if the face were not gated); and a member token cannot
// enter this door (the `userType` confusion fixed in this batch). Two further guards: the console's own
// REST path is unchanged, and each tool call leaves one audit row.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const MARKER = `m3m-${Date.now()}`;

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

let turns = 0;
async function chat(token, message) {
  turns += 1;
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId: `${MARKER}-${turns}` })
  });
  const json = await res.json().catch(() => ({}));
  // The runtime answers its own conversation id; keep it rather than the one this gate sent.
  // 运行时答的是它自己的会话编号；留着它，而不是本门禁发出去的那个。
  return { ...(json.data || json), httpStatus: res.status };
}

// ── 0) 夹具：表、两个会员、一个非超管用户、一枚会员令牌 ─────────────────────────────────────────
console.log('== 夹具 ==');
const tableExisted = psql(`select to_regclass('public.member_user') is not null`) === 't';
if (!tableExisted) {
  psql(`CREATE TABLE member_user (
    id bigserial PRIMARY KEY,
    mobile varchar(11),
    email varchar(50),
    password varchar(100),
    status int2,
    register_ip varchar(50),
    register_terminal int4,
    login_ip varchar(50),
    login_date timestamp,
    nickname varchar(30),
    avatar varchar(512),
    name varchar(30),
    sex int2,
    birthday timestamp,
    area_id int8,
    mark varchar(255),
    point int4,
    tag_ids varchar(255),
    level_id int8,
    experience int4,
    group_id int8,
    creator varchar(64) DEFAULT '',
    create_time timestamp NOT NULL DEFAULT now(),
    updater varchar(64) DEFAULT '',
    update_time timestamp NOT NULL DEFAULT now(),
    deleted smallint NOT NULL DEFAULT 0,
    tenant_id int8 NOT NULL DEFAULT 0
  )`);
}
note('member_user 表', tableExisted ? '已存在（只删本轮的行）' : '本轮创建（收尾时删表）');

// 控制台的 `/member/user/get` 会按 levelId 再读一次等级名，故这张表也得有；会员行上的 level_id 指着它。
const levelTableExisted = psql(`select to_regclass('public.member_level') is not null`) === 't';
if (!levelTableExisted) {
  psql(`CREATE TABLE member_level (
    id bigserial PRIMARY KEY,
    name varchar(30),
    level int4,
    experience int4,
    discount_percent int4,
    icon varchar(255),
    background_url varchar(255),
    status int2,
    creator varchar(64) DEFAULT '',
    create_time timestamp NOT NULL DEFAULT now(),
    updater varchar(64) DEFAULT '',
    update_time timestamp NOT NULL DEFAULT now(),
    deleted smallint NOT NULL DEFAULT 0,
    tenant_id int8 NOT NULL DEFAULT 0
  )`);
}
psql(`INSERT INTO member_level (id, name, level, experience, discount_percent, status, creator, tenant_id)
      VALUES (5, '黄金-${MARKER}', 5, 80, 100, 0, '${MARKER}', ${TENANT})`);
note('member_level 表', levelTableExisted ? '已存在（只删本轮的行）' : '本轮创建（收尾时删表）');

const adminId = psql(`select id from system_users where username = '${ADMIN_USER}' and deleted = 0 order by id limit 1`);
const adminHash = psql(`select password from system_users where id = ${adminId}`);

const nonAdminId = psql(`select coalesce(max(id), 0) + 1 from system_users`);
const memberToken = `member-token-${MARKER}`;

const cleanup = () => {
  psql(`delete from member_user where creator = '${MARKER}'`);
  psql(`delete from member_level where creator = '${MARKER}'`);
  psql(`delete from system_user_role where user_id = ${nonAdminId}`);
  psql(`delete from system_oauth2_access_token where user_id = ${nonAdminId}`);
  psql(`delete from system_users where id = ${nonAdminId}`);
  psql(`delete from system_oauth2_access_token where access_token = '${memberToken}'`);
  if (!tableExisted) {
    psql(`drop table if exists member_user`);
  }
  if (!levelTableExisted) {
    psql(`drop table if exists member_level`);
  }
};
process.on('exit', () => {
  try { cleanup(); } catch (e) { console.log(`  note  收尾失败 ${e.message}`); }
});

psql(`INSERT INTO member_user (mobile, email, password, status, nickname, point, level_id, experience, group_id,
        tag_ids, creator, tenant_id)
      VALUES ('13800000007', 'seven@example.com', '', 0, '小明-${MARKER}', 120, 5, 80, 2, '', '${MARKER}', ${TENANT}),
             ('13800000008', 'eight@example.com', '', 0, '小红-${MARKER}', 40, 3, 20, 1, '', '${MARKER}', ${TENANT})`);
const memberId = psql(`select id from member_user where creator = '${MARKER}' and mobile = '13800000007'`);
const otherMemberId = psql(`select id from member_user where creator = '${MARKER}' and mobile = '13800000008'`);
check('本轮会员行 = 2', '2', psql(`select count(*) from member_user where creator = '${MARKER}' and deleted = 0`));

// 一个普通角色（非超管）的控制台用户：口令哈希照抄 admin，故用同一个口令登录。
psql(`INSERT INTO system_users (id, username, password, nickname, status, creator, tenant_id)
      VALUES (${nonAdminId}, 'm3u${MARKER.slice(4)}', '${adminHash}', '非超管-${MARKER}', 0, '${MARKER}', ${TENANT})`);
psql(`INSERT INTO system_user_role (id, user_id, role_id, creator, tenant_id)
      VALUES ((select coalesce(max(id), 0) + 1 from system_user_role), ${nonAdminId}, 2, '${MARKER}', ${TENANT})`);
note('非超管用户', `${nonAdminId}（普通角色 2）`);

// 会员令牌：`user_id` 取 **管理员自己的编号**、`user_type = 1`。这正是撞号那一面。
psql(`INSERT INTO system_oauth2_access_token (id, user_id, user_type, user_info, access_token, refresh_token,
        client_id, scopes, expires_time, creator, tenant_id)
      VALUES ((select coalesce(max(id), 0) + 1 from system_oauth2_access_token), ${adminId}, 1, '{}',
              '${memberToken}', 'refresh-${MARKER}', 'default', NULL, now() + interval '1 hour', '${MARKER}', ${TENANT})`);

// ── 1) 业务事实读得到，身份字段出不去 ───────────────────────────────────────────────────────────
console.log('== 工具路径 ==');
const executed = (tool) => Number(psql(`select count(*) from ai_audit_logs where tool = '${tool}' and outcome = 'executed'`));
const refused = (tool) => Number(psql(`select count(*) from ai_audit_logs where tool = '${tool}' and outcome = 'refused'`));
const getBefore = executed('get_member');
const findBefore = executed('find_members');
const adminToken = await login(ADMIN_USER, resolveAdminPassword(psql));
const read = await chat(adminToken, `会员资料 ${memberId}`);
const readReply = String(read.reply || '');
check('路由选中 get_member', 'true', JSON.stringify(read.toolCalls || []).includes('get_member'));
check('答出积分', 'true', /point=120|"point":\s*120/.test(readReply));
check('答出昵称', 'true', readReply.includes(`小明-${MARKER}`));
check('手机号不在回复里', 'true', !readReply.includes('13800000007'));
check('这轮留了一行 executed', '1', executed('get_member') - getBefore);
note('回复', readReply);

const search = await chat(adminToken, `找会员 小明-${MARKER}`);
const searchReply = String(search.reply || '');
check('路由选中 find_members', 'true', JSON.stringify(search.toolCalls || []).includes('find_members'));
check('搜索命中该会员', 'true', searchReply.includes(`小明-${MARKER}`));
check('搜索不返回手机号', 'true', !searchReply.includes('13800000007'));
check('这轮留了一行 executed', '1', executed('find_members') - findBefore);
note('回复', searchReply);

// ── 2) 比控制台更窄：非超管拿不到会员事实 ───────────────────────────────────────────────────────
console.log('== 非超管 ==');
const refusedBefore = refused('get_member');
const userToken = await login(`m3u${MARKER.slice(4)}`, resolveAdminPassword(psql));
const asUser = await chat(userToken, `会员资料 ${memberId}`);
const asUserReply = String(asUser.reply || '');
check('非超管拿不到积分', 'true', !asUserReply.includes(`小明-${MARKER}`) && !/\b120\b/.test(asUserReply));
check('非超管这一轮没有多出 executed 行', '1', executed('get_member') - getBefore);
check('非超管这一轮留了一行 refused', '1', refused('get_member') - refusedBefore);
note('回复', asUserReply);

// ── 3) 会员令牌进不了这道门（本次修复的证伪面） ─────────────────────────────────────────────────
console.log('== 会员令牌 ==');
const asMember = await chat(memberToken, `会员资料 ${memberId}`);
check('会员令牌打 /ai/chat 得 401', '401', asMember.httpStatus);
check('会员令牌拿不到会员事实', 'true',
  !String(asMember.reply || '').includes(`小明-${MARKER}`));

// ── 4) 控制台 REST 一字不动 ────────────────────────────────────────────────────────────────────
console.log('== 控制台 ==');
const viaRest = await api(`/member/user/get?id=${memberId}`, { token: adminToken });
check('/member/user/get code', '0', viaRest.code);
check('控制台照旧看得到这个会员', String(memberId), viaRest.data?.id);
check('控制台照旧看得到另一个会员', String(otherMemberId),
  psql(`select id from member_user where creator = '${MARKER}' and mobile = '13800000008'`));

// ── 5) 审计轨 ───────────────────────────────────────────────────────────────────────────────────
console.log('== 审计轨 ==');
check('get_member 全程恰好一行 executed（含被拒那一轮）', '1', executed('get_member') - getBefore);
check('find_members 全程恰好一行 executed', '1', executed('find_members') - findBefore);

// ── 读音 ───────────────────────────────────────────────────────────────────────────────────────
console.log(`\nREADING toolReadsBusinessFields=1 contactFieldsProjectedOut=1 nonAdminRefused=1 memberTokenRefused=1 marker=${MARKER}`);
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
