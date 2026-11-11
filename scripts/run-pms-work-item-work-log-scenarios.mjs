#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 工作项工时（`pms_work_item_work_log`）的真栈场景门：工时行的可见性**不在这一行上**——它由 `work_item_id`
// 指向的工作项所在的**项目成员表**回答；接法是模块自己的 `getWorkItem(workItemId, userId)`，切面只把 userId
// 钉成行动调用方，工具面把「读不到的工作项」与「不存在的工作项」交回**同一个答案**。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis（pms 已进 jar）
//   PG_CONTAINER=m3next3-pg PG_DB=m3next3_1106 HOST_URL=http://127.0.0.1:18127 \
//     node scripts/run-pms-work-item-work-log-scenarios.mjs
//
// 六组断言，夹具按**本轮唯一标记**（打在项目名、工作项名与工时说明上）收束：
//
//   1. **工具路径答调用方参与项目里的那道工时汇总**：普通用户是甲项目成员，问甲的工作项 → 汇总里带已登记工时与
//      两条明细的说明。
//   2. **证伪面：另一个项目的工作项与不存在的工作项同一个答案**。问乙项目的工作项、再问一个不存在的编号，两次都
//      必须答 `hasWorkItem=false`；把编号归一化后两次回复**逐字相同**，且都不带乙的工时说明。
//   3. **负对照：不是「表里只剩一条」**。把甲的工作项标删，乙的工作项**仍在**（先断言它仍在），再问甲 → 同样是
//      `hasWorkItem=false`。
//   4. **控制台一字不动**：`/admin-api/pms/pm/work-item-work-log/summary?workItemId=` 对超管照旧 `code 0`（模块自己
//      的规则：公开项目人人可读、私有项目要成员或超管）；普通角色仍是权限码的 403。
//   5. **工具面：本件只加一读，没有写**。`/ai/tools` 里本件那条是 R1、无需确认，名字里没有写动作。
//   6. **审计轨**：每次工具调用各留一行 `get_work_item_work_log_summary -> executed`。
//
// The real-stack gate over work-item work logs (`pms_work_item_work_log`): the row does not carry its audience — the
// work item its `work_item_id` names decides through the **project membership** table. The module's own
// `getWorkItem(workItemId, userId)` is the check, the aspect pins the user-id argument to the acting caller, and the
// tool face hands "a work item you cannot read" and "a work item that does not exist" the **same answer**.
//
// Six assertion groups, fixtures scoped by this run's marker (project name, work item name, work-log description).
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const TOOL = 'get_work_item_work_log_summary';
const MARKER = `gate-m3wl-${Date.now()}`;
// 账号只认字母与数字（`账号格式为数字以及字母`），故普通角色用户的名字单独给一个纯字母数字的短名。
// The login rejects anything but letters and digits, so the ordinary user gets its own short alphanumeric name.
const USERNAME = `m3wl${Date.now()}`;
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
  const json = await res.json();
  // 审计行记的是**运行时签发**的那个会话号；本门禁把它当读数，发出去的那个只作兜底。
  // The audit row carries the conversation id the **runtime issued**; this gate reads that one, keeping
  // the sent id only as a fallback.
  return { ...(json.data || json), sentConversationId };
}
const conversationOf = (turn) => turn.conversationId || turn.sentConversationId;

await waitForHost();

// ── 0) 夹具：两个私有项目（甲=用户在、乙=用户不在）、各一个工作项、工时与成员行 ───────────────────
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

// `creator` 必须是**用户编号**：控制台会 `NumberUtils.parseLong(...)`，填标记字符串会直接 500。
// `creator` must be a **user id**: the console parses it with `NumberUtils.parseLong`, and a marker string 500s.
psql(`INSERT INTO pms_work_item (project_id, type, serial_number, name, priority, assignee_user_id, status_id,
        status, lifecycle_status, progress, creator, tenant_id)
      VALUES (${mine}, 1, 1, '甲-工作项-${MARKER}', 2, ${userId}, 1, 1, 1, 30, '${adminId}', ${TENANT}),
             (${other}, 1, 1, '乙-工作项-${MARKER}', 2, ${userId}, 1, 1, 1, 10, '${adminId}', ${TENANT})`);
const mineItem = psql(`select id from pms_work_item where name = '甲-工作项-${MARKER}'`);
const otherItem = psql(`select id from pms_work_item where name = '乙-工作项-${MARKER}'`);

const MINE_LOG_1 = `工时说明-${MARKER}-甲一`;
const MINE_LOG_2 = `工时说明-${MARKER}-甲二`;
const OTHER_LOG = `工时说明-${MARKER}-乙`;
psql(`INSERT INTO pms_work_item_work_log (project_id, work_item_id, actual_hours, remaining_hours, description, creator, tenant_id)
      VALUES (${mine}, ${mineItem}, 6, 10, '${MINE_LOG_1}', '${userId}', ${TENANT}),
             (${mine}, ${mineItem}, 2, 8, '${MINE_LOG_2}', '${userId}', ${TENANT}),
             (${other}, ${otherItem}, 5, 5, '${OTHER_LOG}', '${userId}', ${TENANT})`);
putBack = () => psql([
  `delete from pms_work_item_work_log where description like '%${MARKER}%'`,
  `delete from pms_work_item where name like '%${MARKER}%'`,
  `delete from pms_project_member where project_id in (select id from pms_project where name like '%${MARKER}%')`,
  `delete from pms_project where name like '%${MARKER}%'`,
  `delete from system_user_role where user_id = ${userId}`,
  `delete from system_oauth2_access_token where user_id = ${userId}`,
  `delete from system_users where id = ${userId}`,
].join('; '));
check('本轮工作项 = 2', '2', psql(`select count(*) from pms_work_item where name like '%${MARKER}%' and deleted = 0`));
check('本轮工时行 = 3', '3', psql(`select count(*) from pms_work_item_work_log where description like '%${MARKER}%' and deleted = 0`));
note('甲的工作项编号', mineItem);

const userToken = await login(USERNAME, resolveAdminPassword(psql));
const adminToken = await login(ADMIN_USER, resolveAdminPassword(psql));
const executed = (turn) => Number(psql(`select count(*) from ai_audit_logs where tool = '${TOOL}'`
  + ` and outcome = 'executed' and conversation_id = '${conversationOf(turn)}'`));

// ── 1) 工具路径答调用方参与项目里的那道汇总 ───────────────────────────────────────────────────────
console.log('== 工具路径 ==');
const own = await chat(userToken, `工时汇总 工作项 ${mineItem}`);
const ownReply = String(own.reply || '');
check('路由选中 get_work_item_work_log_summary', 'true', JSON.stringify(own.toolCalls || []).includes(TOOL));
check('答的是看得见的工作项', 'true', /hasWorkItem=true/.test(ownReply));
check('回复带已登记工时 8', 'true', /(^|\D)8(\D|$)/.test(ownReply));
check('回复带第一条工时说明', 'true', ownReply.includes(MINE_LOG_1));
check('回复带第二条工时说明', 'true', ownReply.includes(MINE_LOG_2));
check('乙的工时说明不在回复里', 'true', !ownReply.includes(OTHER_LOG));
note('回复', ownReply);

// ── 2) 证伪面：另一个项目的工作项与不存在的工作项同一个答案 ───────────────────────────────────────
console.log('== 证伪面 ==');
const theirs = await chat(userToken, `工时汇总 工作项 ${otherItem}`);
const none = await chat(userToken, `工时汇总 工作项 ${NONE_ID}`);
const theirsReply = String(theirs.reply || '');
const noneReply = String(none.reply || '');
const normalized = (text, id) => String(text).split(String(id)).join('<id>');
check('另一个项目的工作项答 hasWorkItem=false', 'true', /hasWorkItem=false/.test(theirsReply));
check('不存在的工作项答 hasWorkItem=false', 'true', /hasWorkItem=false/.test(noneReply));
check('另一个项目的工时说明不在回复里', 'true', !theirsReply.includes(OTHER_LOG));
check('两次回复归一化编号后逐字相同', normalized(noneReply, NONE_ID), normalized(theirsReply, otherItem));
note('另一个项目的工作项', theirsReply);
note('不存在的工作项', noneReply);

// ── 3) 负对照：不是「表里只剩一条」 ───────────────────────────────────────────────────────────────
console.log('== 负对照 ==');
psql(`update pms_work_item set deleted = 1 where id = ${mineItem}`);
check('乙的工作项仍在', '1', psql(`select count(*) from pms_work_item where name = '乙-工作项-${MARKER}' and deleted = 0`));
const gone = await chat(userToken, `工时汇总 工作项 ${mineItem}`);
check('自己的工作项不在时答 hasWorkItem=false', 'true', /hasWorkItem=false/.test(String(gone.reply || '')));
psql(`update pms_work_item set deleted = 0 where id = ${mineItem}`);

// ── 4) 请求路径：控制台一字不动 ──────────────────────────────────────────────────────────────────
console.log('== 控制台 ==');
const mineViaRest = await api(`/pms/pm/work-item-work-log/summary?workItemId=${mineItem}`, { token: adminToken });
check('/pms/pm/work-item-work-log/summary 超管 code', '0', mineViaRest.code);
check('控制台读到已登记工时 8', '8', mineViaRest.data?.actualHours);
check('控制台给两条明细', '2', (mineViaRest.data?.records || []).length);
const otherViaRest = await api(`/pms/pm/work-item-work-log/summary?workItemId=${otherItem}`, { token: adminToken });
check('超管读另一个项目的工作项仍是 code 0（模块自己的规则）', '0', otherViaRest.code);
const userViaRest = await api(`/pms/pm/work-item-work-log/summary?workItemId=${mineItem}`, { token: userToken });
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
console.log(`\nREADING ownWorkLog=1 otherProjectAndMissingAlike=1 softDeletedWithheld=1 oneReadNoWrite=1 marker=${MARKER}`);
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
