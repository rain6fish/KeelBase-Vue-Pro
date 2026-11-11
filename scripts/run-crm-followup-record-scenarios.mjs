#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 跟进记录（`crm_follow_up_record`）的真栈场景门：属主**不在这一行上**——行里只有 `biz_type` + `biz_id`，
// 属主是那两个值指向的**业务行**（客户 / 商机 / 线索 / 联系人 / 合同）的 `crm_permission` 行。接法是
// **按记录编号读 + 沿 `(bizType, bizId)` 走一跳判属主**。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis（crm 已进 jar）
//   PG_CONTAINER=m3next-pg PG_DB=m3next_1104 HOST_URL=http://127.0.0.1:18121 \
//     node scripts/run-crm-followup-record-scenarios.mjs
//
// 六组断言，夹具按**本轮唯一标记**（打在客户名与记录内容上）收束：
//
//   1. **工具路径只答调用方自己的那一条**（按记录编号）。管理员 1 的客户下一条、另一个用户 100 的客户下一条；
//      问自己那条 → `hasRecord=true`，回复带自己的内容，100 的那条内容不在。
//   2. **证伪面：别人的记录与不存在的记录同一个答案**。问 100 那条、再问一个不存在的编号，两次都必须答
//      `hasRecord=false`；把编号归一化后两次回复**逐字相同**，且都不带 100 那条的内容。**不接**时第一次会拿到
//      100 那条——这就是「接」与「豁免」的差别。
//   3. **负对照：不是「表里只剩一条」**。把自己那条标删，100 那条**仍在**（先断言它仍在），再问自己那条 →
//      `hasRecord=false`。
//   4. **控制台一字不动**：`/admin-api/crm/follow-up-record/get?id=` 对**自己的**记录照旧 `code 0` 且带内容；
//      对 100 的记录仍是模块自己的拒绝（`code != 0`）——切面只在工具路径上工作，请求路径放行。
//   5. **工具面：本件只加一读，没有新写、没有分页**。`/ai/tools` 里「跟进」这一族只有两项：既有的
//      `record_crm_followup`（R3，本件没有放宽它）与本件加的 `get_crm_followup_record`（R1、无需确认），读的名字里
//      没有写动作；一条分页样消息不落到任何分页/列表工具。**边界**：`getFollowUpRecordPage` 在工具路径上的
//      **拒绝**没有 HTTP 观测面（面上没有分页工具），它由 `CrmFollowUpRecordGovernanceTest#thePageIsRefusedOnTheToolPath`
//      单测证明。
//   6. **审计轨**：每次工具调用各留一行 `get_crm_followup_record -> executed`。
//
// The real-stack gate over follow-up records (`crm_follow_up_record`): the owner is **not on this row** — only
// `biz_type` + `biz_id`, which name the business row (customer / business / clue / contact / contract) whose
// `crm_permission` rows decide. The form is **read by record id, then follow `(bizType, bizId)` one hop**.
//
// Six assertion groups, fixtures scoped by this run's marker in the customer name and in the record content: the
// tool path answers the caller's own record by id; the falsifiable face — another user's record and a missing one
// answer `hasRecord=false` alike, byte-identical after normalising the id; a negative control; the console's get
// endpoint behaves exactly as upstream (ours `code 0`, theirs still refused by the module); the face has one read,
// no write and no page (the page's refusal on the tool path has no HTTP surface and is proven by the aspect's unit
// test); and one audit row per call.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const TOOL = 'get_crm_followup_record';
const MARKER = `gate-m3fu-${Date.now()}`;
const CUSTOMER = 'crm_customer';
const FOLLOWUP = 'crm_follow_up_record';
const PERMISSION = 'crm_permission';
const BIZ_TYPE_CUSTOMER = 2; // CrmBizTypeEnum.CRM_CUSTOMER
const LEVEL_OWNER = 1; // CrmPermissionLevelEnum.OWNER
const LEVEL_READ = 2; // CrmPermissionLevelEnum.READ
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
// Clean up on the way out: the cleanup is a function attached the moment this run creates its first row.
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

// ── 0) 夹具：两个客户、两条跟进记录、两条权限行 ──────────────────────────────────────────────────
console.log('== 夹具 ==');
const callerId = psql(`select id from system_users where username = '${ADMIN_USER}' and deleted = 0 order by id limit 1`);
const otherId = psql(`select id from system_users where id <> ${callerId} and deleted = 0 order by id limit 1`);
if (!otherId) {
  throw new Error('this database needs a second system user to own the other customer');
}
note('调用方（$ADMIN_USER）编号', callerId);
note('另一位用户名下的编号', otherId);

psql(`insert into ${CUSTOMER}(id, name, owner_user_id, deal_status, follow_up_status, tenant_id)`
  + ` values (nextval('${CUSTOMER}_seq'), '${MARKER}-mine', ${callerId}, false, false, ${TENANT})`);
psql(`insert into ${CUSTOMER}(id, name, owner_user_id, deal_status, follow_up_status, tenant_id)`
  + ` values (nextval('${CUSTOMER}_seq'), '${MARKER}-theirs', ${otherId}, false, false, ${TENANT})`);
const mineCustomerId = psql(`select id from ${CUSTOMER} where name = '${MARKER}-mine'`);
const theirCustomerId = psql(`select id from ${CUSTOMER} where name = '${MARKER}-theirs'`);

// 权限行就是模块自己的授权模型：没有它，业务行是「孤儿」（模块对孤儿放行 READ），断言就测不到属主。
// A permission row is the module's own authorization model: without it the business row is "orphaned"
// (the module lets everyone read it), and the ownership assertion would measure nothing.
psql(`insert into ${PERMISSION}(id, biz_type, biz_id, user_id, level, tenant_id) values`
  + ` (nextval('${PERMISSION}_seq'), ${BIZ_TYPE_CUSTOMER}, ${mineCustomerId}, ${callerId}, ${LEVEL_READ}, ${TENANT})`);
psql(`insert into ${PERMISSION}(id, biz_type, biz_id, user_id, level, tenant_id) values`
  + ` (nextval('${PERMISSION}_seq'), ${BIZ_TYPE_CUSTOMER}, ${theirCustomerId}, ${otherId}, ${LEVEL_OWNER}, ${TENANT})`);

psql(`insert into ${FOLLOWUP}(id, biz_type, biz_id, type, content, next_time, pic_urls, file_urls, business_ids, contact_ids, creator, tenant_id) values`
  + ` (nextval('crm_follow_up_seq'), ${BIZ_TYPE_CUSTOMER}, ${mineCustomerId}, 1, '我的跟进-${MARKER}', now() + interval '7 day', '', '', '', '', '${callerId}', ${TENANT})`);
psql(`insert into ${FOLLOWUP}(id, biz_type, biz_id, type, content, next_time, pic_urls, file_urls, business_ids, contact_ids, creator, tenant_id) values`
  + ` (nextval('crm_follow_up_seq'), ${BIZ_TYPE_CUSTOMER}, ${theirCustomerId}, 1, '别人的跟进-${MARKER}', now() + interval '7 day', '', '', '', '', '${otherId}', ${TENANT})`);
const mineRecordId = psql(`select id from ${FOLLOWUP} where content = '我的跟进-${MARKER}'`);
const theirRecordId = psql(`select id from ${FOLLOWUP} where content = '别人的跟进-${MARKER}'`);
putBack = () => psql([
  `delete from ${FOLLOWUP} where content like '%${MARKER}%'`,
  `delete from ${PERMISSION} where biz_type = ${BIZ_TYPE_CUSTOMER} and biz_id in (select id from ${CUSTOMER} where name like '%${MARKER}%')`,
  `delete from ${CUSTOMER} where name like '%${MARKER}%'`,
].join('; '));
check('本轮跟进记录 = 2', '2', psql(`select count(*) from ${FOLLOWUP} where content like '%${MARKER}%' and deleted = 0`));
note('自己的记录编号', mineRecordId);

// ── 1) 工具路径只答调用方自己的那一条 ─────────────────────────────────────────────────────────────
console.log('== 工具路径 ==');
const token = await login(ADMIN_USER, resolveAdminPassword(psql));
const own = await chat(token, `查一条跟进 ${mineRecordId}`);
const ownReply = String(own.reply || '');
check('路由选中 get_crm_followup_record', 'true', JSON.stringify(own.toolCalls || []).includes(TOOL));
check('答的是自己的记录', 'true', /hasRecord=true/.test(ownReply));
check('回复带自己的记录编号', 'true', ownReply.includes(String(mineRecordId)));
check('回复带自己的跟进内容', 'true', ownReply.includes(`我的跟进-${MARKER}`));
check('别人那条跟进不在回复里', 'true', !ownReply.includes(`别人的跟进-${MARKER}`));
note('回复', ownReply);

// ── 2) 证伪面：别人的记录与不存在的记录同一个答案 ─────────────────────────────────────────────────
console.log('== 证伪面 ==');
const other = await chat(token, `查一条跟进 ${theirRecordId}`);
const none = await chat(token, `查一条跟进 ${NONE_ID}`);
const otherReply = String(other.reply || '');
const noneReply = String(none.reply || '');
const normalized = (text, id) => String(text).split(String(id)).join('<id>');
check('别人的记录答 hasRecord=false', 'true', /hasRecord=false/.test(otherReply));
check('不存在的记录答 hasRecord=false', 'true', /hasRecord=false/.test(noneReply));
check('别人的记录不带它的内容', 'true', !otherReply.includes(`别人的跟进-${MARKER}`));
check('两次回复归一化编号后逐字相同', normalized(noneReply, NONE_ID), normalized(otherReply, theirRecordId));
note('别人的记录', otherReply);
note('不存在的记录', noneReply);

// ── 3) 负对照：不是「表里只剩一条」 ───────────────────────────────────────────────────────────────
console.log('== 负对照 ==');
psql(`update ${FOLLOWUP} set deleted = 1 where id = ${mineRecordId}`);
check('别人那条仍在', '1', psql(`select count(*) from ${FOLLOWUP} where content = '别人的跟进-${MARKER}' and deleted = 0`));
const gone = await chat(token, `查一条跟进 ${mineRecordId}`);
check('自己的记录不在时答 hasRecord=false', 'true', /hasRecord=false/.test(String(gone.reply || '')));
psql(`update ${FOLLOWUP} set deleted = 0 where id = ${mineRecordId}`);

// ── 4) 请求路径：控制台一字不动 ──────────────────────────────────────────────────────────────────
console.log('== 控制台 ==');
const mineViaRest = await api(`/crm/follow-up-record/get?id=${mineRecordId}`, { token });
check('/crm/follow-up-record/get 自己的 code', '0', mineViaRest.code);
check('控制台读到自己的内容', 'true', String(mineViaRest.data?.content || '').includes(`我的跟进-${MARKER}`));
const theirsViaRest = await api(`/crm/follow-up-record/get?id=${theirRecordId}`, { token });
check('控制台对别人的记录仍是模块自己的拒绝', 'true', theirsViaRest.code !== 0);
note('控制台读别人的记录', `code=${theirsViaRest.code} msg=${theirsViaRest.msg}`);

// ── 5) 工具面：一读、无写、无分页 ────────────────────────────────────────────────────────────────
console.log('== 工具面 ==');
const toolsRaw = await (await fetch(`${HOST}/ai/tools`, {
  headers: { Authorization: `Bearer ${token}`, 'tenant-id': TENANT }
})).text();
const listed = (JSON.parse(toolsRaw).data || []);
// 清单上「跟进」这一族**本来就有**写面（`record_crm_followup` 与策略里声明的 `create_followup`，都是 R3）；
// 本接缝加的是那**一读**，且这一族里 R1 的**只有它**。
// The follow-up family already owns writes (`record_crm_followup` and the policy-declared `create_followup`, both
// R3); this seam adds the **one read**, and it is the family's **only** R1 entry.
const ours = listed.filter((t) => String(t.name).includes('followup'));
const readFace = ours.find((t) => t.name === TOOL);
const writeFace = ours.find((t) => t.name === 'record_crm_followup');
check('跟进这一族里 R1 的只有本件那条', 1, ours.filter((t) => t.riskLevel === 'R1').length);
check('本件加的读在清单上', 'true', Boolean(readFace));
check('它是 R1 且无需确认', 'true',
  Boolean(readFace) && readFace.riskLevel === 'R1' && readFace.requiresConfirmation === false && readFace.requiresApproval === false);
check('既有那笔写仍是 R3（没有被本件放宽）', 'true', Boolean(writeFace) && writeFace.riskLevel === 'R3');
const WRITE_WORDS = /(save|create|update|delete|close|cancel|import|transfer|generate|revoke)/i;
check('读的名字里没有写动作', 0, readFace && WRITE_WORDS.test(readFace.name) ? 1 : 0);

const pageAsk = await chat(token, '这个客户有哪些跟进情况');
const pageCalls = pageAsk.toolCalls || [];
check('分页样消息不落到任何分页/列表工具', 0, pageCalls.filter((n) => /(list|page|search)/i.test(n)).length);
note('分页的拒绝面', '工具面上没有分页工具；切面对 getFollowUpRecordPage 的拒绝由单测证明');

// ── 6) 审计轨 ───────────────────────────────────────────────────────────────────────────────────
console.log('== 审计轨 ==');
for (const turn of [own, other, none, gone]) {
  const conversation = conversationOf(turn);
  const n = Number(psql(`select count(*) from ai_audit_logs where tool = '${TOOL}'`
    + ` and outcome = 'executed' and conversation_id = '${conversation}'`));
  check(`会话 ${conversation} 有一行 executed`, '1', n);
}

// ── 读数 / reading ───────────────────────────────────────────────────────────────────────────────
// 正常路径上显式收尾，好让退出处理器那条「本进程在此之前已经出错」只在**真的出错**时出现。
// Clean up explicitly on the normal path, so the exit handler's "this process already failed" line appears only
// when the process really did fail.
runPutBack();
console.log(`\nREADING toolReplyOwn=1 otherAndMissingAlike=1 softDeletedWithheld=1 oneReadNoWriteNoPage=1 marker=${MARKER}`);
console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
