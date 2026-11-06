#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 工作项动态的真栈场景门：本线的**第二种形态**——按标识符读一条，属主事后判。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis（pms 已进 jar）
//   PG_CONTAINER=m3next2-pg PG_DB=m3next2_1105 HOST_URL=http://127.0.0.1:18124 \
//     node scripts/run-pms-work-item-activity-scenarios.mjs
//
// 判据钉在**模块自己的规则**上（`PmsProjectMemberServiceImpl.validateProjectReadable`）：公开项目人人可读，私有项目要成员
// 或超管。夹具因此是两个**私有**项目 + 一个只在甲项目里的普通角色用户，每个工作项各一条动态。
//
//   1. **普通用户读得到自己项目的工作项动态**：工具面答出甲项目那条的内容，并留一行 `executed`。
//   2. **别人的工作项与不存在的工作项同一个答案**：两次回复归一化编号后**逐字相同**，且都不含乙项目的内容 —— 切面判不过
//      时交回空表，而不是把「不是你的」与「没有」的区别漏给模型。
//   3. **超管读得到乙项目**：这是模块自己的规则（私有项目对超管可读），场景门如实读出来。
//   4. **控制台一字不动**：REST 对超管照旧给出内容，对普通角色仍按权限码拒绝（403）—— 本切面只在 `ActingCaller` 存在
//      时工作。
//   5. **工具面只有这一读**：清单上是 R1、无需确认，且名字里没有写动作；没有分页工具。
//
// The real-stack gate over the work-item activity feed: this line's **second form** — read one list by identifier and
// decide ownership afterwards. The criterion is the module's own rule (`validateProjectReadable`): an open project is
// readable by anyone, a private one needs membership or the super administrator. The fixture is two **private**
// projects, an ordinary user in one of them, and one feed row per work item.
//
//   1. The ordinary user reads the feed of their own project's work item, and the turn leaves one `executed` row.
//   2. Another project's work item and a missing one answer alike: the two replies are **byte for byte identical** after
//      the id is normalised, and neither carries the other project's content.
//   3. The super administrator reads the other project — the module's own rule.
//   4. The console is unchanged: REST still answers the administrator and still refuses the ordinary role by permission
//      code (403). The aspect works only when an acting caller exists.
//   5. The tool face is that one read: R1, no confirmation, no write verb in its name, and no page tool.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const MARKER = `m3pma-${Date.now()}`;
const TOOL = 'list_work_item_activities';

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
  const sentConversationId = `${MARKER}-${Date.now()}`;
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId: sentConversationId })
  });
  const json = await res.json().catch(() => ({}));
  // 审计行记的是**运行时签发**的那个会话号；本门禁把它当读数，发出去的那个只作兜底。
  // The audit row carries the conversation id the **runtime issued**; this gate reads that one, keeping the sent id
  // only as a fallback.
  return { ...(json.data || json), sentConversationId };
}
const conversationOf = (turn) => turn.conversationId || turn.sentConversationId;

/**
 * 有上限的宿主就绪轮询：一门在 runner 上起不来时要**说出它看到了什么**，而不是无限等或静默跳过。
 *
 * A bounded wait for the host: a gate that cannot come up on a runner must say what it saw, rather than wait forever
 * or skip quietly.
 */
async function waitForHost(attempts = 60, intervalMs = 500) {
  let last = 'no response yet';
  for (let i = 1; i <= attempts; i += 1) {
    try {
      const res = await fetch(`${HOST}/admin-api/system/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT },
        body: '{}'
      });
      if (res.status > 0) return;
      last = `HTTP ${res.status}`;
    } catch (error) {
      last = error && error.message ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`host ${HOST} did not answer after ${attempts} attempts; last evidence: ${last}`);
}

await waitForHost();

// ── 0) 夹具：两个私有项目、一个普通用户（只在甲项目里）、两个工作项、各一条动态 ───────────────
console.log('== 夹具 ==');
const adminHash = psql(`select password from system_users where username = '${ADMIN_USER}' and deleted = 0 order by id limit 1`);
const adminId = psql(`select id from system_users where username = '${ADMIN_USER}' and deleted = 0 order by id limit 1`);

const userId = psql(`select coalesce(max(id), 0) + 1 from system_users`);
const cleanup = () => {
  psql(`delete from pms_work_item_activity where content like '%${MARKER}%'`);
  psql(`delete from pms_work_item where name like '%${MARKER}%'`);
  psql(`delete from pms_project_member where project_id in (select id from pms_project where name like '%${MARKER}%')`);
  psql(`delete from pms_project where name like '%${MARKER}%'`);
  psql(`delete from system_user_role where user_id = ${userId}`);
  psql(`delete from system_oauth2_access_token where user_id = ${userId}`);
  psql(`delete from system_users where id = ${userId}`);
};
let putBack = cleanup;
const runPutBack = () => {
  const fn = putBack;
  putBack = null;
  if (fn) {
    try { fn(); } catch (error) { console.log(`  note  收尾失败 ${error.message}`); }
  }
};
process.on('exit', (code) => {
  if (putBack) console.log(`  note  本进程在此之前已经出错（exit ${code}），仍执行收尾`);
  runPutBack();
});

// `creator` 必须是**用户编号**：控制台会把它当编号解析，填标记字符串会直接 500。
// `creator` must be a **user id**: the console parses it as an id, and a marker string 500s.
psql(`INSERT INTO pms_project (name, status, type, level, description, open_status, creator, tenant_id)
      VALUES ('甲项目-${MARKER}', 1, 1, 1, '', false, '${adminId}', ${TENANT}),
             ('乙项目-${MARKER}', 1, 1, 1, '', false, '${adminId}', ${TENANT})`);
const mine = psql(`select id from pms_project where name like '甲项目-${MARKER}'`);
const other = psql(`select id from pms_project where name like '乙项目-${MARKER}'`);

psql(`INSERT INTO system_users (id, username, password, nickname, status, creator, tenant_id)
      VALUES (${userId}, 'm3pma${MARKER.slice(6)}', '${adminHash}', '普通角色-${MARKER}', 0, '${MARKER}', ${TENANT})`);
psql(`INSERT INTO system_user_role (id, user_id, role_id, creator, tenant_id)
      VALUES ((select coalesce(max(id), 0) + 1 from system_user_role), ${userId}, 2, '${MARKER}', ${TENANT})`);
psql(`INSERT INTO pms_project_member (project_id, user_id, level, creator, tenant_id)
      VALUES (${mine}, ${userId}, 3, '${adminId}', ${TENANT})`);

psql(`INSERT INTO pms_work_item (project_id, type, serial_number, name, priority, assignee_user_id, status_id,
        status, lifecycle_status, progress, creator, tenant_id)
      VALUES (${mine}, 1, 1, '甲-工作项-${MARKER}', 2, ${userId}, 1, 1, 1, 30, '${adminId}', ${TENANT}),
             (${other}, 1, 1, '乙-工作项-${MARKER}', 2, ${userId}, 1, 1, 1, 10, '${adminId}', ${TENANT})`);
const mineItem = psql(`select id from pms_work_item where name like '甲-工作项-${MARKER}'`);
const otherItem = psql(`select id from pms_work_item where name like '乙-工作项-${MARKER}'`);
const missingItem = psql(`select coalesce(max(id), 0) + 1000 from pms_work_item`);

psql(`INSERT INTO pms_work_item_activity (project_id, work_item_id, operator_user_id, content, creator, tenant_id)
      VALUES (${mine}, ${mineItem}, ${adminId}, '甲动态-${MARKER}', '${adminId}', ${TENANT}),
             (${mine}, ${mineItem}, ${adminId}, '甲动态2-${MARKER}', '${adminId}', ${TENANT}),
             (${other}, ${otherItem}, ${adminId}, '乙动态-${MARKER}', '${adminId}', ${TENANT})`);
check('本轮工作项动态 = 3', '3', psql(`select count(*) from pms_work_item_activity where content like '%${MARKER}%' and deleted = 0`));
check('本轮项目 = 2', '2', psql(`select count(*) from pms_project where name like '%${MARKER}%' and deleted = 0`));

const executed = (turn) => {
  const conversation = conversationOf(turn);
  if (conversation) {
    return Number(psql(`select count(*) from ai_audit_logs where tool = '${TOOL}'`
      + ` and outcome = 'executed' and conversation_id = '${conversation}'`));
  }
  return -1;
};
const normalized = (text, id) => String(text).split(String(id)).join('<id>');

// ── 1) 普通用户读得到自己项目的工作项动态 ─────────────────────────────────────────────────────
console.log('== 普通用户 ==');
const userToken = await login(`m3pma${MARKER.slice(6)}`, resolveAdminPassword(psql));

const own = await chat(userToken, `工作项动态 工作项编号 ${mineItem}`);
const ownReply = String(own.reply || '');
check('路由选中 list_work_item_activities', 'true', JSON.stringify(own.toolCalls || []).includes(TOOL));
check('答出甲项目的动态', 'true', ownReply.includes(`甲动态-${MARKER}`));
check('乙项目的动态不在回复里', 'true', !ownReply.includes(`乙动态-${MARKER}`));
check('这轮留了一行 executed', '1', executed(own));
note('回复', ownReply);

// ── 2) 别人的工作项与不存在的工作项同一个答案 ─────────────────────────────────────────────────
console.log('== 证伪面 ==');
const theirs = await chat(userToken, `工作项动态 工作项编号 ${otherItem}`);
const missing = await chat(userToken, `工作项动态 工作项编号 ${missingItem}`);
const theirsReply = String(theirs.reply || '');
const missingReply = String(missing.reply || '');
check('别人的工作项不带它的内容', 'true', !theirsReply.includes(`乙动态-${MARKER}`));
check('别人的工作项那轮也走了这个工具', 'true', JSON.stringify(theirs.toolCalls || []).includes(TOOL));
check('不存在的工作项那轮也走了这个工具', 'true', JSON.stringify(missing.toolCalls || []).includes(TOOL));
check('别人的工作项留了一行 executed', '1', executed(theirs));
check('不存在的工作项留了一行 executed', '1', executed(missing));
check('两次回复归一化编号后逐字相同',
  normalized(missingReply, missingItem), normalized(theirsReply, otherItem));
note('别人的工作项', theirsReply);
note('不存在的工作项', missingReply);

// ── 3) 超管读得到乙项目（模块自己的规则） ─────────────────────────────────────────────────────
console.log('== 超管 ==');
const adminToken = await login(ADMIN_USER, resolveAdminPassword(psql));
const adminReply = String((await chat(adminToken, `工作项动态 工作项编号 ${otherItem}`)).reply || '');
check('超管读得到乙项目的动态', 'true', adminReply.includes(`乙动态-${MARKER}`));
note('回复', adminReply);

// ── 4) 控制台：REST 一字不动 ──────────────────────────────────────────────────────────────────
console.log('== 控制台 ==');
const restMine = await api(`/pms/pm/work-item-activity/list?workItemId=${mineItem}`, { token: adminToken });
check('超管经 REST 读甲项目 code', '0', restMine.code);
check('超管经 REST 读到甲动态', 'true',
  String(JSON.stringify(restMine.data || [])).includes(`甲动态-${MARKER}`));
const restOther = await api(`/pms/pm/work-item-activity/list?workItemId=${otherItem}`, { token: adminToken });
check('超管经 REST 读乙项目 code（模块自己的规则）', '0', restOther.code);
check('超管经 REST 读到乙动态', 'true',
  String(JSON.stringify(restOther.data || [])).includes(`乙动态-${MARKER}`));
const restUserMine = await api(`/pms/pm/work-item-activity/list?workItemId=${mineItem}`, { token: userToken });
const restUserOther = await api(`/pms/pm/work-item-activity/list?workItemId=${otherItem}`, { token: userToken });
check('普通角色经 REST 仍被权限码拒绝（甲）', '403', restUserMine.code);
check('普通角色经 REST 仍被权限码拒绝（乙）', '403', restUserOther.code);
note('控制台的拒绝', `mine code=${restUserMine.code} msg=${restUserMine.msg}`);

// ── 5) 工具面：一读、无写、无分页 ────────────────────────────────────────────────────────────
console.log('== 工具面 ==');
const toolsRaw = await (await fetch(`${HOST}/ai/tools`, {
  headers: { Authorization: `Bearer ${adminToken}`, 'tenant-id': TENANT }
})).text();
const listed = (JSON.parse(toolsRaw).data || []);
const readFace = listed.find((t) => t.name === TOOL);
check('本件加的读在清单上', 'true', Boolean(readFace));
check('它是 R1 且无需确认', 'true',
  Boolean(readFace) && readFace.riskLevel === 'R1' && readFace.requiresConfirmation === false
    && readFace.requiresApproval === false);
const WRITE_WORDS = /(save|create|update|delete|close|cancel|import|transfer|generate|revoke)/i;
check('读的名字里没有写动作', 0, readFace && WRITE_WORDS.test(readFace.name) ? 1 : 0);
check('工作项动态这一族里没有分页/列表工具', 0,
  listed.filter((t) => /work_item_activit/i.test(String(t.name)) && /(page|search)/i.test(String(t.name))).length);

// ── 读数 / reading ─────────────────────────────────────────────────────────────────────────────
runPutBack();
console.log('\nREADING ownFeed=1 otherAndMissingAlike=1 superAdminSeesTheirs=1 consoleUntouched=1 oneReadNoWriteNoPage=1');
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
