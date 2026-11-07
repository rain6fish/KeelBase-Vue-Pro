#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 迭代（`pms_iteration`）的真栈场景门：迭代行**不带可见性**——它由 `project_id` 指向的项目在**项目成员表**里回答；
// 接法是模块自己的 `getIteration(id, userId)` / `getIterationOverview(id, userId)`，切面只把 userId 钉成行动调用方，
// 工具面把「读不到的迭代」与「不存在的迭代」交回**同一个答案**。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis（pms 已进 jar）
//   PG_CONTAINER=m3next4-pg PG_DB=m3next4_1107 HOST_URL=http://127.0.0.1:18128 \
//     node scripts/run-pms-iteration-scenarios.mjs
//
// 六组断言，夹具按**本轮唯一标记**（打在项目名、迭代名、工作项名与动态内容上）收束：
//
//   1. **工具路径答调用方参与项目里的那次概览**：普通用户是甲项目成员，问甲的迭代 → 概览带工作项总数、已完成数与
//      完成百分比，以及最近动态里那条内容。
//   2. **证伪面：另一个项目的迭代与不存在的迭代同一个答案**。问乙项目的迭代、再问一个不存在的编号，两次都必须答
//      `hasIteration=false`；把编号归一化后两次回复**逐字相同**，且都不带乙的动态内容。
//   3. **负对照：不是「表里只剩一条」**。把甲的迭代标删，乙的迭代**仍在**（先断言它仍在），再问甲 → 同样是
//      `hasIteration=false`。
//   4. **控制台一字不动**：`/pms/pm/iteration/overview?id=` 对超管照旧 `code 0`（模块自己的规则：公开项目人人可读、
//      私有项目要成员或超管）；普通角色仍是权限码的 403。
//   5. **工具面：本件只加一读，没有写**。`/ai/tools` 里本件那条是 R1、无需确认，名字里没有写动作。
//   6. **审计轨**：每次工具调用各留一行 `get_iteration_overview -> executed`。
//
// The real-stack gate over iterations (`pms_iteration`): the row does not carry its audience — the project its
// `project_id` names decides through the **project membership** table. The module's own
// `getIteration(id, userId)` / `getIterationOverview(id, userId)` is the check, the aspect pins the user-id argument
// to the acting caller, and the tool face hands "an iteration you cannot read" and "an iteration that does not exist"
// the **same answer**.
//
// Six assertion groups, fixtures scoped by this run's marker (project name, iteration name, work item name and
// activity content).
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const TOOL = 'get_iteration_overview';
const MARKER = `gate-m3it-${Date.now()}`;
// 账号只认字母与数字（`账号格式为数字以及字母`），故普通角色用户的名字单独给一个纯字母数字的短名。
// The login rejects anything but letters and digits, so the ordinary user gets its own short alphanumeric name.
const USERNAME = `m3it${Date.now()}`;
const WAIT_MS = Number(process.env.WAIT_MS || 120_000);
const NONE_ID = '99999999';

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

const psql = (sql) => execFileSync('docker',
  ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-U', 'root', '-d', DB, '-tAc', sql],
  { encoding: 'utf8' }).trim();

// 崩了也收尾：收尾是一个函数，在本轮造出第一行的那一刻挂上。
// Clean up on the way out: the cleanup is attached the moment this run creates its first row.
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

// 宿主答它那个瞬时 500 时重试一次；业务性拒绝不重试。
// Retry once on the host's transient 500; a business refusal is not retried.
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

/**
 * 等宿主应答：**有上限的轮询**，任何 HTTP 应答（哪怕是 401）都算它起来了。超时就把最后一次错误当证据打出来并退出。
 * 等待不是一个断言——它只决定这门现在能不能开始读。
 *
 * Wait for the host: a **bounded poll**; any HTTP answer (even a 401) means it is up. On timeout the last error is the
 * evidence printed, and the gate exits.
 */
async function waitForHost() {
  const deadline = Date.now() + WAIT_MS;
  let last = 'no attempt was made';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${HOST}/admin-api/system/auth/login`, { method: 'POST', body: '{}', signal: AbortSignal.timeout(3000) });
      note('宿主已应答', `HTTP ${res.status}`);
      return;
    } catch (e) {
      last = e.message;
      await new Promise((done) => setTimeout(done, 1000));
    }
  }
  throw new Error(`宿主在 ${WAIT_MS}ms 内没有应答（${HOST}）：最后一次错误 = ${last}`);
}

async function login(username, password) {
  const r = await api('/system/auth/login', { method: 'POST', body: { username, password } });
  if (r.code !== 0) throw new Error(`login(${username}) -> ${r.code}: ${r.msg}`);
  return r.data.accessToken;
}

let turns = 0;
async function chat(token, message) {
  turns += 1;
  const sentConversationId = `${MARKER}-${turns}`;
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId: sentConversationId })
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (notJson) {
    // 失败时把证据尾部打进错误行：一个体外的 500 页面只有尾巴能说明问题。
    // On failure put the evidence's tail on the error line: for a 500 page outside the shape, only the tail helps.
    throw new Error(`/ai/chat 答的不是 JSON（HTTP ${res.status}）：${text.slice(-400)}`);
  }
  // 审计行记的是**运行时签发**的那个会话号；本门禁把它当读数，发出去的那个只作兜底。
  // The audit row carries the conversation id the **runtime issued**; this gate reads that one, keeping
  // the sent id only as a fallback.
  return { ...(json.data || json), sentConversationId };
}
const conversationOf = (turn) => turn.conversationId || turn.sentConversationId;

await waitForHost();

// ── 0) 夹具：两个私有项目（甲=用户在、乙=用户不在）、各一个迭代与工作项，甲另有一条动态 ────────────
console.log('== 夹具 ==');
const adminHash = psql(`select password from system_users where username = '${ADMIN_USER}' and deleted = 0 order by id limit 1`);
const adminId = psql(`select id from system_users where username = '${ADMIN_USER}' and deleted = 0 order by id limit 1`);
const userId = psql(`select coalesce(max(id), 0) + 1 from system_users`);

psql(`INSERT INTO pms_project (name, status, type, level, description, open_status, creator, tenant_id)
      VALUES ('甲项目-${MARKER}', 1, 1, 1, '', false, '${adminId}', ${TENANT}),
             ('乙项目-${MARKER}', 1, 1, 1, '', false, '${adminId}', ${TENANT})`);
const mine = psql(`select id from pms_project where name like '甲项目-${MARKER}'`);
const other = psql(`select id from pms_project where name like '乙项目-${MARKER}'`);

psql(`INSERT INTO system_users (id, username, password, nickname, status, creator, tenant_id)
      VALUES (${userId}, '${USERNAME}', '${adminHash}', '普通角色-${MARKER}', 0, '${MARKER}', ${TENANT})`);
psql(`INSERT INTO system_user_role (id, user_id, role_id, creator, tenant_id)
      VALUES ((select coalesce(max(id), 0) + 1 from system_user_role), ${userId}, 2, '${MARKER}', ${TENANT})`);
psql(`INSERT INTO pms_project_member (project_id, user_id, level, creator, tenant_id)
      VALUES (${mine}, ${adminId}, 1, '${adminId}', ${TENANT}),
             (${mine}, ${userId}, 3, '${adminId}', ${TENANT})`);

psql(`INSERT INTO pms_iteration (project_id, name, owner_user_id, status, start_time, end_time, sort, creator, tenant_id)
      VALUES (${mine}, '甲-迭代-${MARKER}', ${adminId}, 2, CURRENT_TIMESTAMP - interval '3 day',
              CURRENT_TIMESTAMP + interval '4 day', 1, '${adminId}', ${TENANT}),
             (${other}, '乙-迭代-${MARKER}', ${adminId}, 2, CURRENT_TIMESTAMP - interval '3 day',
              CURRENT_TIMESTAMP + interval '4 day', 1, '${adminId}', ${TENANT})`);
const mineIteration = psql(`select id from pms_iteration where name like '甲-迭代-${MARKER}'`);
const otherIteration = psql(`select id from pms_iteration where name like '乙-迭代-${MARKER}'`);

// `creator` 必须是**用户编号**：控制台会 `NumberUtils.parseLong(...)`，填标记字符串会直接 500。
// `creator` must be a **user id**: the console parses it with `NumberUtils.parseLong`, and a marker string 500s.
psql(`INSERT INTO pms_work_item (project_id, iteration_id, type, serial_number, name, priority, assignee_user_id,
        status_id, status, lifecycle_status, progress, creator, tenant_id)
      VALUES (${mine}, ${mineIteration}, 1, 1, '甲-一-${MARKER}', 2, ${userId}, 1, 3, 1, 100, '${adminId}', ${TENANT}),
             (${mine}, ${mineIteration}, 1, 2, '甲-二-${MARKER}', 2, ${userId}, 1, 2, 1, 40, '${adminId}', ${TENANT}),
             (${other}, ${otherIteration}, 1, 1, '乙-工作项-${MARKER}', 2, ${userId}, 1, 2, 1, 10, '${adminId}', ${TENANT})`);
const mineItem = psql(`select id from pms_work_item where name = '甲-一-${MARKER}'`);

const MINE_ACTIVITY = `动态-${MARKER}-甲`;
const OTHER_ACTIVITY = `动态-${MARKER}-乙`;
const otherItem = psql(`select id from pms_work_item where name = '乙-工作项-${MARKER}'`);
psql(`INSERT INTO pms_work_item_activity (project_id, work_item_id, operator_user_id, content, creator, tenant_id)
      VALUES (${mine}, ${mineItem}, ${userId}, '${MINE_ACTIVITY}', '${userId}', ${TENANT}),
             (${other}, ${otherItem}, ${userId}, '${OTHER_ACTIVITY}', '${userId}', ${TENANT})`);
putBack = () => psql([
  `delete from pms_work_item_activity where content like '%${MARKER}%'`,
  `delete from pms_work_item where name like '%${MARKER}%'`,
  `delete from pms_iteration where name like '%${MARKER}%'`,
  `delete from pms_project_member where project_id in (select id from pms_project where name like '%${MARKER}%')`,
  `delete from pms_project where name like '%${MARKER}%'`,
  `delete from system_user_role where user_id = ${userId}`,
  `delete from system_oauth2_access_token where user_id = ${userId}`,
  `delete from system_users where id = ${userId}`,
].join('; '));
check('本轮迭代 = 2', '2', psql(`select count(*) from pms_iteration where name like '%${MARKER}%' and deleted = 0`));
check('甲的迭代挂 2 个工作项', '2',
  psql(`select count(*) from pms_work_item where iteration_id = ${mineIteration} and deleted = 0`));
note('甲的迭代编号', mineIteration);

const userToken = await login(USERNAME, resolveAdminPassword(psql));
const adminToken = await login(ADMIN_USER, resolveAdminPassword(psql));
const executed = (turn) => Number(psql(`select count(*) from ai_audit_logs where tool = '${TOOL}'`
  + ` and outcome = 'executed' and conversation_id = '${conversationOf(turn)}'`));

// ── 1) 工具路径答调用方参与项目里的那次概览 ───────────────────────────────────────────────────────
console.log('== 工具路径 ==');
const own = await chat(userToken, `迭代概览 迭代 ${mineIteration}`);
const ownReply = String(own.reply || '');
check('路由选中 get_iteration_overview', 'true', JSON.stringify(own.toolCalls || []).includes(TOOL));
check('答的是看得见的迭代', 'true', /hasIteration=true/.test(ownReply));
check('回复带工作项总数 2', 'true', /totalCount=2/.test(ownReply));
check('回复带已完成数 1', 'true', /completedCount=1/.test(ownReply));
check('回复带完成百分比 50', 'true', /progress=50/.test(ownReply));
check('回复带甲的动态内容', 'true', ownReply.includes(MINE_ACTIVITY));
check('乙的动态不在回复里', 'true', !ownReply.includes(OTHER_ACTIVITY));
check('回复不带操作人身份字段', 'true', !ownReply.includes('operatorUserId') && !ownReply.includes('operatorUserName'));
note('回复', ownReply);

// ── 2) 证伪面：另一个项目的迭代与不存在的迭代同一个答案 ───────────────────────────────────────────
console.log('== 证伪面 ==');
const theirs = await chat(userToken, `迭代概览 迭代 ${otherIteration}`);
const none = await chat(userToken, `迭代概览 迭代 ${NONE_ID}`);
const theirsReply = String(theirs.reply || '');
const noneReply = String(none.reply || '');
const normalized = (text, id) => String(text).split(String(id)).join('<id>');
check('另一个项目的迭代答 hasIteration=false', 'true', /hasIteration=false/.test(theirsReply));
check('不存在的迭代答 hasIteration=false', 'true', /hasIteration=false/.test(noneReply));
check('乙的动态不在回复里', 'true', !theirsReply.includes(OTHER_ACTIVITY));
check('两次回复归一化编号后逐字相同', normalized(noneReply, NONE_ID), normalized(theirsReply, otherIteration));
note('另一个项目的迭代', theirsReply);
note('不存在的迭代', noneReply);

// ── 3) 负对照：不是「表里只剩一条」 ───────────────────────────────────────────────────────────────
console.log('== 负对照 ==');
psql(`update pms_iteration set deleted = 1 where id = ${mineIteration}`);
check('乙的迭代仍在', '1', psql(`select count(*) from pms_iteration where name = '乙-迭代-${MARKER}' and deleted = 0`));
const gone = await chat(userToken, `迭代概览 迭代 ${mineIteration}`);
check('自己的迭代不在时答 hasIteration=false', 'true', /hasIteration=false/.test(String(gone.reply || '')));
psql(`update pms_iteration set deleted = 0 where id = ${mineIteration}`);

// ── 4) 请求路径：控制台一字不动 ──────────────────────────────────────────────────────────────────
console.log('== 控制台 ==');
const mineViaRest = await api(`/pms/pm/iteration/overview?id=${mineIteration}`, { token: adminToken });
check('/pms/pm/iteration/overview 超管 code', '0', mineViaRest.code);
check('控制台读到工作项总数 2', '2', mineViaRest.data?.totalCount);
check('控制台读到完成百分比 50', '50', mineViaRest.data?.progress);
const mineGetViaRest = await api(`/pms/pm/iteration/get?id=${mineIteration}`, { token: adminToken });
check('/pms/pm/iteration/get 超管 code', '0', mineGetViaRest.code);
const otherViaRest = await api(`/pms/pm/iteration/overview?id=${otherIteration}`, { token: adminToken });
check('超管读另一个项目的迭代仍是 code 0（模块自己的规则）', '0', otherViaRest.code);
const userViaRest = await api(`/pms/pm/iteration/overview?id=${mineIteration}`, { token: userToken });
check('普通角色 console 仍是权限码拒绝（403）', '403', userViaRest.code);

// ── 5) 工具面：一读、无写 ────────────────────────────────────────────────────────────────────────
console.log('== 工具面 ==');
const toolsRaw = await (await fetch(`${HOST}/ai/tools`, {
  headers: { Authorization: `Bearer ${adminToken}`, 'tenant-id': TENANT }
})).text();
const listed = (JSON.parse(toolsRaw).data || []);
const readFace = listed.find((t) => t.name === TOOL);
check('本件加的读在清单上', 'true', Boolean(readFace));
check('它是 R1 且无需确认', 'true',
  Boolean(readFace) && readFace.riskLevel === 'R1' && readFace.requiresConfirmation === false && readFace.requiresApproval === false);
const WRITE_WORDS = /(save|create|update|delete|close|cancel|import|transfer|generate|revoke)/i;
check('读的名字里没有写动作', 0, readFace && WRITE_WORDS.test(readFace.name) ? 1 : 0);

// ── 6) 审计轨 ───────────────────────────────────────────────────────────────────────────────────
console.log('== 审计轨 ==');
for (const turn of [own, theirs, none, gone]) {
  check(`会话 ${conversationOf(turn)} 有一行 executed`, '1', executed(turn));
}

// ── 读数 / reading ───────────────────────────────────────────────────────────────────────────────
// 正常路径上显式收尾，好让退出处理器那条「本进程在此之前已经出错」只在**真的出错**时出现。
// Clean up explicitly on the normal path, so the exit handler's "this process already failed" line appears only
// when the process really did fail.
runPutBack();
console.log(`\nREADING ownOverview=1 otherProjectAndMissingAlike=1 softDeletedWithheld=1 oneReadNoWrite=1 marker=${MARKER}`);
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
