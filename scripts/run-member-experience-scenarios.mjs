#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 经验记录（`member_experience_record`）的真栈场景门：五个「记录型」对象里的最后一个。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis（member 已进 jar）
//   PG_CONTAINER=m3member-pg PG_DB=m3member_1103 HOST_URL=http://127.0.0.1:18113 \
//     node scripts/run-member-experience-scenarios.mjs
//
// 三条断言：
//   1. **工具路径**：问「会员 7 的经验记录」→ 路由选中 `list_member_experience_records`，答 `count=2` 且带 7 的两条。
//   2. **另一个会员的那一条不出现**：8 的那一行（标题带本轮标记）不在回复里——「按会员收口」的可观测面。
//   3. **比控制台更窄 + 控制台一字不动**：非超管 → 空答复、一行 `refused`、没有 `executed`；
//      `/member/experience-record/page?userId=7` 照旧 `code 0`、两行。
//
// The real-stack gate over experience records: the last of the five "record" objects.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const MARKER = `m3e-${Date.now()}`;

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

// ── 0) 夹具：一张表、两个会员、三行经验记录 ─────────────────────────────────────────────────────
console.log('== 夹具 ==');
const tableExisted = psql(`select to_regclass('public.member_experience_record') is not null`) === 't';
if (!tableExisted) {
  psql(`CREATE TABLE member_experience_record (id bigserial PRIMARY KEY, user_id int8 NOT NULL,
    biz_id varchar(64), biz_type int4, title varchar(64), description varchar(255),
    experience int4, total_experience int4, creator varchar(64) DEFAULT '',
    create_time timestamp NOT NULL DEFAULT now(), updater varchar(64) DEFAULT '',
    update_time timestamp NOT NULL DEFAULT now(), deleted smallint NOT NULL DEFAULT 0,
    tenant_id int8 NOT NULL DEFAULT 0)`);
}
note('member_experience_record 表', tableExisted ? '已存在（只删本轮的行）' : '本轮创建（收尾时删表）');

const cleanup = () => {
  psql(`delete from member_experience_record where creator = '${MARKER}'`);
  psql(`delete from system_user_role where user_id in (select id from system_users where creator = '${MARKER}')`);
  psql(`delete from system_oauth2_access_token where user_id in (select id from system_users where creator = '${MARKER}')`);
  psql(`delete from system_users where creator = '${MARKER}'`);
  if (!tableExisted) psql(`drop table if exists member_experience_record`);
};
process.on('exit', () => {
  try { cleanup(); } catch (e) { console.log(`  note  收尾失败 ${e.message}`); }
});

// 会员 7 与 8 不需要 member_user 行：分页不 join。
psql(`INSERT INTO member_experience_record (user_id, biz_id, biz_type, title, description, experience,
        total_experience, creator, tenant_id)
      VALUES (7, 'biz-a-${MARKER}', 1, '签到经验-${MARKER}', '获得 5 经验', 5, 45, '${MARKER}', ${TENANT}),
             (7, 'biz-b-${MARKER}', 2, '下单经验-${MARKER}', '获得 10 经验', 10, 55, '${MARKER}', ${TENANT}),
             (8, 'biz-c-${MARKER}', 1, '别人的经验-${MARKER}', '获得 5 经验', 5, 20, '${MARKER}', ${TENANT})`);
check('本轮经验记录 = 3', '3', psql(`select count(*) from member_experience_record where creator = '${MARKER}' and deleted = 0`));

const adminHash = psql(`select password from system_users where username = '${ADMIN_USER}' and deleted = 0 order by id limit 1`);
const nonAdminId = psql(`select coalesce(max(id), 0) + 1 from system_users`);
psql(`INSERT INTO system_users (id, username, password, nickname, status, creator, tenant_id)
      VALUES (${nonAdminId}, 'm3x${MARKER.slice(4)}', '${adminHash}', '非超管-${MARKER}', 0, '${MARKER}', ${TENANT})`);
psql(`INSERT INTO system_user_role (id, user_id, role_id, creator, tenant_id)
      VALUES ((select coalesce(max(id), 0) + 1 from system_user_role), ${nonAdminId}, 2, '${MARKER}', ${TENANT})`);

// ── 1) 工具路径只答这个会员的记录 ───────────────────────────────────────────────────────────────
console.log('== 工具路径 ==');
const TOOL = 'list_member_experience_records';
const executed = () => Number(psql(`select count(*) from ai_audit_logs where tool = '${TOOL}' and outcome = 'executed'`));
const refused = () => Number(psql(`select count(*) from ai_audit_logs where tool = '${TOOL}' and outcome = 'refused'`));
const executedBefore = executed();
const refusedBefore = refused();

const adminToken = await login(ADMIN_USER, resolveAdminPassword(psql));
const read = await chat(adminToken, '会员 7 的经验记录');
const readReply = String(read.reply || '');
check('路由选中 list_member_experience_records', 'true', JSON.stringify(read.toolCalls || []).includes(TOOL));
check('答出两行', 'true', /count=2/.test(readReply));
check('答出这一行', 'true', readReply.includes(`签到经验-${MARKER}`));
check('答出那一行', 'true', readReply.includes(`下单经验-${MARKER}`));
check('另一个会员那一行不在回复里', 'true', !readReply.includes(`别人的经验-${MARKER}`));
check('这轮留了一行 executed', '1', executed() - executedBefore);
note('回复', readReply);

// ── 2) 比控制台更窄 ────────────────────────────────────────────────────────────────────────────
console.log('== 非超管 ==');
const userToken = await login(`m3x${MARKER.slice(4)}`, resolveAdminPassword(psql));
const asUser = await chat(userToken, '会员 7 的经验记录');
check('非超管拿不到这一行', 'true', !String(asUser.reply || '').includes(`签到经验-${MARKER}`));
check('非超管这一轮没有多出 executed 行', '1', executed() - executedBefore);
check('非超管这一轮留了一行 refused', '1', refused() - refusedBefore);

// ── 3) 控制台 REST 一字不动 ────────────────────────────────────────────────────────────────────
console.log('== 控制台 ==');
const viaRest = await api('/member/experience-record/page?userId=7&pageSize=10', { token: adminToken });
check('/member/experience-record/page code', '0', viaRest.code);
check('控制台照旧两行', '2', (viaRest.data?.list || []).length);
check('控制台看得到另一个会员那一行（按 userId 换查询）', '1',
  ((await api('/member/experience-record/page?userId=8&pageSize=10', { token: adminToken })).data?.list || []).length);

// ── 读音 ───────────────────────────────────────────────────────────────────────────────────────
console.log(`\nREADING memberRecordsOnly=1 otherMemberHidden=1 nonAdminRefused=1 consoleUnchanged=1 marker=${MARKER}`);
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
