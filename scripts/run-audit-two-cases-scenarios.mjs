#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// YD-42 的十八格是在「放行 / 本人确认 / 本人拒绝」上取到的。本门禁补的是那两份**没跑到**的档，并把它们的
// **当前读数**钉住：
//
//   ① **系统拒绝的写** —— 闸门按风险级 BLOCK 的调用（`delete_project`，R5 → block）。它没有台账行、没有
//      确认行，只有一条 `outcome=blocked` 的审计行。
//   ② **第二人批准的写** —— R4 的调用（`escalate_customer`）等的是**另一个管理员**，批准人在
//      `confirmation_requests.approver_id` 与那条 `tool_confirmation/approved` 审计行上。
//
//   HOST_URL=http://127.0.0.1:48230 PG_CONTAINER=yd42b-1105-pg PG_DB=yd42two1105 \
//     node scripts/run-audit-two-cases-scenarios.mjs
//
// **它回答的不是「能打几分」，是「这两类操作，审计读面能不能照样按名答出六问；答不出的是哪一问」。**
// 故两条读数如实写成 `5/6`，并把空格子点名：
//
//   * ① 的 **③ 哪个业务对象** 答不出：被 BLOCK 的调用**什么都没记进系统**，而它的实参也**从未落盘**
//     （没有台账、没有确认记录，审计行的 `authorization` 只有闸门的裁决、没有 `projectId`）。这是**数据面的缺口** ——
//     换一个更会读的页面也补不出来。
//   * ② 的 **⑤ 谁确认** 答不出：写自己那一行只记「要第二个人」，**不记是谁**（读面按设计只读这一行的
//     `authorization`）。批准人**确实记下来了** —— 在确认行的 `approver_id` 与那条 `tool_confirmation/approved`
//     审计行的 `user_id` 上，页面以那一行的 **①** 显示，YD-45 在追溯页另配一次。这是**读面组合的缺口**：
//     数据在，六问的第五格没取到它。
//
// 这两条缺口**被当成断言写死**（`③`、`⑤` 现读为 `answered=false`）。将来谁补上了，这道门会红、点名哪一格，
// 而不是悄悄跟着改口。
//
// 门禁造的东西：一条临时 `customers` 行（每轮新插，免得写管道把上一轮的 effect 复用掉）；一个第二管理员账号
// `auditapprover`（幂等创建、**留着不删** —— 审计行按它配名，删了 ① 就只剩一个数字）。收尾删掉 `follow_ups` /
// `customers` / 本条 effect；**审计行与确认行刻意留着** —— 它们就是读数。
//
// ---
//
// YD-42's eighteen cells were taken on "allowed / the operator confirmed / the operator declined". This gate covers
// the two cases that run did **not** reach, and pins their **current readings**:
//
//   ① **a write the system refuses** — a call the gate blocks on risk level (`delete_project`, R5 → block). It has no
//      ledger row and no confirmation row, only an audit row with `outcome=blocked`.
//   ② **a write a second person approves** — an R4 call (`escalate_customer`) waits for **another administrator**;
//      the approver is on `confirmation_requests.approver_id` and on the `tool_confirmation/approved` audit row.
//
// **What it answers is not "what score" but "for these two kinds of operation, can the audit read face still answer
// the six questions by name, and which one does it miss".** Both readings are honestly `5/6`, with the empty cell
// named:
//
//   * ①'s **③ which business object** cannot be answered: a BLOCKED call **wrote nothing into the system**, and its
//     arguments were **never persisted** (no ledger, no confirmation record; the audit row's `authorization` carries
//     the gate's verdict and no `projectId`). That is a **data-side gap** — a cleverer page cannot recover it.
//   * ②'s **⑤ who confirmed** cannot be answered: the write's own row records only "a second person is needed",
//     **not who** (the read face reads that row's `authorization` by design). The approver **is** recorded — on the
//     confirmation row's `approver_id` and on the `tool_confirmation/approved` audit row's `user_id`; the page shows
//     it as that row's **①**, and YD-45 shows it again on the trace page. This is a **read-face composition gap**:
//     the data exists, the fifth cell does not reach it.
//
// Both gaps are **asserted** (`③` / `⑤` currently read `answered=false`). Whoever closes one turns this gate red and
// gets the cell named, rather than having the gate quietly change its story.
//
// What it creates: one temporary `customers` row (fresh every run, so the write pipeline cannot reuse the previous
// run's effect); a second administrator `auditapprover` (created idempotently and **left in place** — audit rows are
// named by it and deleting it would leave ① as a bare number). On the way out it deletes `follow_ups` / `customers` /
// this run's effect; **audit rows and confirmation rows are deliberately left alone** — they are the reading.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const PG_USER = process.env.PG_USER || 'root';
const PG_PASS = process.env.PG_PASSWORD || 'password';
const TENANT = process.env.TENANT_ID || '1';
// 芋道的账号格式只收数字与字母，故这里不带连字符。
// Yudao's account format accepts digits and letters only, hence no hyphen here.
const APPROVER_USER = process.env.AUDIT_APPROVER_USER || 'auditapprover';
const READER_USER = process.env.AUDIT_READER_USER || 'm7audit';
const READER_PASS = process.env.AUDIT_READER_PASS || 'admin123';

const SIX = await import(pathToFileURL(join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs')).href);
const { matchApprover } = await import(pathToFileURL(join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/approverJoin.mjs')).href);

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));

// `-q` 对 `insert … returning id` 是必要的：不给它，psql 即使在 `-tA` 下也会补上 `INSERT 0 1` 的命令标签，
// id 会被读成 `3\nINSERT 0 1`。
// `-q` matters for `insert … returning id`: without it psql appends the `INSERT 0 1` command tag even under
// `-tA`, and the id is read as `3\nINSERT 0 1`.
const psql = (sql) => execFileSync(
  'docker',
  ['exec', '-i', '-e', `PGPASSWORD=${PG_PASS}`, PG, 'psql', '-U', PG_USER, '-d', DB, '-q', '-tAc', sql],
  { encoding: 'utf8' }).trim();

async function api(path, { method = 'GET', token, body, base = '/admin-api' } = {}) {
  const res = await fetch(`${HOST}${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* a non-JSON answer is itself a reading */ }
  return { status: res.status, json };
}

async function login(username, password) {
  const r = await api('/system/auth/login', { method: 'POST', body: { username, password } });
  if (!r.json || r.json.code !== 0) {
    throw new Error(`login(${username}) answered ${JSON.stringify(r.json)} (HTTP ${r.status})`);
  }
  return r.json.data.accessToken;
}

// ── 文案表：从补丁里读，不抄一份。抄一份会漂；读补丁则「页面上写的那句话」与「这里断言的那句话」是同一个来源。
// 词表扩展：sixQ / record / meaning / vocab.outcome 四块，取 en-US（第一处出现的那一块）。
// ── The message table is read from the patch, never copied. A copy drifts; reading the patch makes "the sentence
// the page draws" and "the sentence this gate asserts" one source. Four blocks — sixQ / record / meaning /
// vocab.outcome — taken from en-US (the first occurrence of each).
function blockAfter(src, marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`the patch no longer carries \`${marker.trim()}\``);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced object after \`${marker.trim()}\``);
}
function pairs(body) {
  const out = {};
  const re = /(\w+):\s*(?:'([^']*)'|"([^"]*)")/g;
  let m;
  while ((m = re.exec(body))) out[m[1]] = m[2] !== undefined ? m[2] : m[3];
  return out;
}
const patch = readFileSync(join(ROOT, 'keelbase-ui/host-patches/0002-governance-ui.patch'), 'utf8');
const sixQ = pairs(blockAfter(patch, '    sixQ: {'));
const record = pairs(blockAfter(patch, '    record: {'));
const meaning = pairs(blockAfter(patch, '    meaning: {'));
const effectWords = pairs(blockAfter(patch, '    effects: {'));
const outcomeWords = pairs(blockAfter(blockAfter(patch, '    vocab: {'), 'outcome: {'));
const MESSAGES = {};
for (const [k, v] of Object.entries(sixQ)) MESSAGES[`keelbase.sixQ.${k}`] = v;
for (const [k, v] of Object.entries(record)) MESSAGES[`keelbase.record.${k}`] = v;
for (const [k, v] of Object.entries(meaning)) MESSAGES[`keelbase.meaning.${k}`] = v;
for (const [k, v] of Object.entries(effectWords)) MESSAGES[`keelbase.effects.${k}`] = v;
for (const [k, v] of Object.entries(outcomeWords)) MESSAGES[`keelbase.vocab.outcome.${k}`] = v;
const t = (k) => MESSAGES[k] ?? k;
const te = (k) => Object.hasOwn(MESSAGES, k);
const mask = (s) => (s ? String(s).slice(0, 1) + '****' : s);

const TOOL_RESULT_TYPES = {
  create_crm_customer: 'crm_customer', update_crm_customer: 'crm_customer',
  record_crm_followup: 'crm_follow_up_record', approve_oa_leave: 'bpm_oa_leave',
  create_demo01_contact: 'infra_demo01_contact', rename_demo01_contact: 'infra_demo01_contact',
  review_fms_voucher: 'fms_voucher', mark_notify_message_read: 'system_notify_message',
  mark_all_notify_messages_read: 'system_notify_message', create_generated_products: 'products',
};
const toolResultType = (n) => (n ? TOOL_RESULT_TYPES[n] ?? '' : '');
const toolEffect = (tool) => {
  const level = tool?.riskLevel;
  if (!level) return 'unknown';
  if (tool?.requiresConfirmation || ['R3', 'R4', 'R5'].includes(level)) return 'write';
  if (['R0', 'R1'].includes(level)) return 'read';
  return 'unknown';
};
const EXECUTED_MEANING = { write: 'executed', read: 'executedRead', unknown: 'executedUnknown' };

// 收尾在造出第一行的那一刻挂上：之后任何一处崩了，退出处理器都会替这一轮跑它。
// The cleanup is attached the moment the first row exists: anything below dying still gets it run on exit.
let putBack = null;
function runPutBack() {
  if (!putBack) return false;
  const once = putBack;
  putBack = null;
  once();
  return true;
}
process.on('exit', () => {
  try { runPutBack(); } catch (e) { console.error(`  note  exit-path cleanup failed: ${e.message}`); }
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    try { runPutBack(); } catch { /* best effort */ }
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

// ── 前置 / preconditions ─────────────────────────────────────────────────────────────────────────
console.log('== 前置 ==');
{
  const health = await fetch(`${HOST}/actuator/health`).catch(() => null);
  check('host /actuator/health 200', 200, health && health.status);
  if (!health || health.status !== 200) {
    console.log(`\n${pass} ok / ${fail} failed (no host at ${HOST})`);
    process.exit(1);
  }
}
const adminUser = await login(ADMIN_USER, resolveAdminPassword(psql));
check(`${ADMIN_USER} signs in`, true, Boolean(adminUser));
const adminId = psql(`select id from system_users where username = '${ADMIN_USER}' and deleted = 0 order by id limit 1`);
check('the administrator id is known', true, adminId !== '');

const inventory = {};
{
  const tools = await api('/ai/tools', { token: adminUser, base: '' });
  check('/ai/tools answers', 200, tools.json?.code);
  for (const tool of tools.json?.data || []) inventory[tool.name] = tool;
  check('delete_project is declared R5 / blocked', 'R5|blocked',
    `${inventory.delete_project?.riskLevel}|${inventory.delete_project?.gateMode}`);
  check('escalate_customer is declared R4 / approval', 'R4|approval',
    `${inventory.escalate_customer?.riskLevel}|${inventory.escalate_customer?.gateMode}`);
}

{
  const tables = psql("select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('customers', 'follow_ups', 'confirmation_requests')");
  check('the runtime sample tables exist (customers / follow_ups / confirmation_requests)', 3, tables);
}

// 第二管理员：幂等创建；口令哈希跟着 admin 那一行走，故 `resolveAdminPassword` 对两个账号同时成立。
// The second administrator: created idempotently; its hash follows admin's row, so one resolved password opens both.
const approverId = (() => {
  let id = psql(`select id from system_users where username = '${APPROVER_USER}' and deleted = 0 order by id limit 1`);
  if (id === '') {
    const superAdminRole = psql("select id from system_role where code = 'super_admin' and deleted = 0 order by id limit 1");
    if (superAdminRole === '') throw new Error('no super_admin role in this database — the seed did not load');
    psql(`insert into system_users (id, username, password, nickname, remark, dept_id, post_ids, email,
            mobile, sex, avatar, status, login_ip, login_date, creator, create_time, updater,
            update_time, deleted, tenant_id)
          select 9901, '${APPROVER_USER}', password, 'Audit Approver', 'run-audit-two-cases fixture',
                 dept_id, post_ids, email, mobile, sex, avatar, status, login_ip, login_date,
                 creator, create_time, updater, update_time, 0, tenant_id
          from system_users where id = ${adminId}`);
    psql(`insert into system_user_role (id, user_id, role_id, creator, create_time, updater,
            update_time, deleted, tenant_id)
          select 99901, 9901, ${superAdminRole}, '1', now(), '1', now(), 0, 1`);
    id = psql(`select id from system_users where username = '${APPROVER_USER}' and deleted = 0 order by id limit 1`);
  }
  // 口令始终跟着 admin 的当前哈希 —— 换过口令的宿主上，第二个人也进得去。
  // The password always follows admin's current hash, so the second person can sign in on a host whose password changed.
  psql(`update system_users set password = (select password from system_users where id = ${adminId})
        where id = ${id}`);
  return id;
})();
check('the second administrator exists', true, approverId !== '');
const approverToken = await login(APPROVER_USER, resolveAdminPassword(psql));
check(`${APPROVER_USER} signs in (a second administrator)`, true, Boolean(approverToken));

const readerToken = await login(READER_USER, READER_PASS);
check(`${READER_USER} signs in (audit_reader only)`, true, Boolean(readerToken));

// 本轮的一条临时客户行：每轮新插，写管道才不会把上一轮的 effect 复用掉（复用会让 ③ 读成「没有台账行」）。
// One temporary customer per run, so the write pipeline cannot reuse the previous run's effect — a reuse would make
// ③ read as "no ledger row".
const customerId = psql(`insert into customers (name, level, owner_user_id)
  values ('YD-42 two-cases ${Date.now()}', 'A', '${adminId}') returning id`);
check('a fresh customer row exists for this run', true, /^\d+$/.test(customerId));

// ── ① 系统拒绝的写 / a write the system refuses ─────────────────────────────────────────────────
console.log('\n== ① 系统拒绝（闸门 BLOCK） ==');
const blockConv = (await (await fetch(`${HOST}/ai/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminUser}` },
  body: JSON.stringify({ message: '删除项目', targetId: Number(customerId) }),
})).json()).data?.conversationId;
check('the router proposed delete_project', true,
  psql(`select count(*) from ai_audit_logs where conversation_id = '${blockConv}' and tool = 'delete_project'`) !== '0');

const blockRowsSql = psql(`select coalesce(json_agg(json_build_object(
    'id', id, 'action', action, 'userId', user_id, 'outcome', outcome, 'tool', tool,
    'isError', is_error, 'detail', detail, 'authorization', authorization_basis,
    'createdAt', created_at) order by id), '[]')
  from ai_audit_logs where conversation_id = '${blockConv}'`);
const blockRows = JSON.parse(blockRowsSql || '[]');
check('① · exactly one audit row for the blocked call', 1, blockRows.length);
const blockRow = blockRows[0] || {};
if (!blockRow.id) {
  bad('① · the blocked row exists', 'a row id', 'none');
  console.log(`\n${pass} ok / ${fail} failed`);
  process.exit(1);
}
check('① · its outcome is blocked', 'blocked', blockRow.outcome);
check('① · its tool is delete_project', 'delete_project', blockRow.tool);
check('① · its subject is the initiator', String(adminId), String(blockRow.userId));
check('① · it is recorded as an error', true, Boolean(blockRow.isError));
const blockAuth = (() => { try { return JSON.parse(blockRow.authorization); } catch { return null; } })();
check('① · the row records riskStrategy=block', 'block', blockAuth?.riskStrategy);
check('① · the row records riskLevel=R5', 'R5', blockAuth?.riskLevel);
check('① · no confirmation row was raised', 0,
  psql(`select count(*) from confirmation_requests where conversation_id = '${blockConv}'`));
check('① · no ledger row was written', 0,
  psql(`select count(*) from side_effects where conversation_id = '${blockConv}'`));

// ── ② 第二人批准的写 / a write a second person approves ─────────────────────────────────────────
console.log('\n== ② 第二人批准（R4） ==');
const approveConv = (await (await fetch(`${HOST}/ai/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminUser}` },
  body: JSON.stringify({ message: '升级客户', targetId: Number(customerId) }),
})).json()).data?.conversationId;
const pending = psql(`select token || '|' || mode || '|' || status || '|' || operator_id || '|' || coalesce(approver_id::text, 'null')
  from confirmation_requests where conversation_id = '${approveConv}' order by id desc limit 1`);
const [token, mode, status, operator, approverBefore] = pending.split('|');
check('② · the router raised an approval row', 'approval', mode);
check('② · it is pending', 'pending', status);
check('② · its operator is the initiator', String(adminId), operator);
check('② · it has no approver yet', 'null', approverBefore);

{
  // 两道守卫各自的读数：发起人不能在对话内自批；审计读者没有写权。
  // The two guards, each read: the initiator cannot approve in-band; the audit reader may not write.
  const self = await api(`/ai/confirmations/${token}`, { method: 'POST', token: adminUser, base: '', body: { decision: 'approve' } });
  check('② · the initiator cannot approve in-band (409)', 409, self.json?.code);
  const readerWrite = await api(`/ai/confirmations/${token}/approve-by`, { method: 'POST', token: readerToken, base: '', body: { decision: 'approve' } });
  check('② · the audit reader cannot approve (403)', 403, readerWrite.json?.code);
}
const decided = await api(`/ai/confirmations/${token}/approve-by`, { method: 'POST', token: approverToken, base: '', body: { decision: 'approve' } });
check('② · the second administrator\'s approval executes the write', 'executed', decided.json?.data?.status);
const approvedRow = psql(`select status || '|' || approver_id || '|' || coalesce(result_id::text, 'null')
  from confirmation_requests where token = '${token}'`);
const [approvedStatus, recordedApprover, resultId] = approvedRow.split('|');
check('② · the confirmation row is approved', 'approved', approvedStatus);
check('② · it records the approver', String(approverId), recordedApprover);
check('② · it records the written record', true, resultId !== 'null');

const approveRows = JSON.parse(psql(`select coalesce(json_agg(json_build_object(
    'id', id, 'action', action, 'userId', user_id, 'outcome', outcome, 'tool', tool,
    'isError', is_error, 'detail', detail, 'authorization', authorization_basis,
    'createdAt', created_at) order by id), '[]')
  from ai_audit_logs where conversation_id = '${approveConv}'`) || '[]');
const byOutcome = (action, outcome) => approveRows.filter((r) => r.action === action && r.outcome === outcome);
check('② · a pending row is recorded for the initiator', 1, byOutcome('tool_call', 'pending').length);
const decisionRow = byOutcome('tool_confirmation', 'approved')[0] || {};
check('② · an approved decision row is recorded', 1, byOutcome('tool_confirmation', 'approved').length);
check('② · the decision row\'s subject is the approver', String(approverId), String(decisionRow.userId));
check('② · an attempted row is recorded', 1, byOutcome('tool_call', 'attempted').length);
const executedRow = byOutcome('tool_call', 'executed')[0] || {};
check('② · an executed row is recorded', 1, byOutcome('tool_call', 'executed').length);
check('② · the executed row\'s subject is the initiator', String(adminId), String(executedRow.userId));
const execAuth = (() => { try { return JSON.parse(executedRow.authorization); } catch { return null; } })();
check('② · the executed row records riskStrategy=human_approval', 'human_approval', execAuth?.riskStrategy);
check('② · the executed row records riskLevel=R4', 'R4', execAuth?.riskLevel);
check('② · exactly one ledger row is written', 1,
  psql(`select count(*) from side_effects where conversation_id = '${approveConv}'`));
if (!executedRow.id || !decisionRow.id) {
  bad('② · the approval rows exist', 'executed row id + decision row id', 'one is missing');
  console.log(`\n${pass} ok / ${fail} failed`);
  process.exit(1);
}

// ── 六问：以审计读者的身份拼 / the six questions, composed as the audit reader ───────────────────
console.log('\n== 六问（读者） ==');
const auditRead = await api('/audit/logs?page=1&limit=200', { token: readerToken, base: '' });
const effectsRead = await api('/ai/tool-effects?page=1&limit=200', { token: readerToken, base: '' });
const confirmationsRead = await api('/ai/confirmations?page=1&limit=200', { token: readerToken, base: '' });
check('/audit/logs answers the reader', 200, auditRead.json?.code);
check('/ai/tool-effects answers the reader', 200, effectsRead.json?.code);
check('/ai/confirmations answers the reader', 200, confirmationsRead.json?.code);

const rows = Array.isArray(auditRead.json?.data) ? auditRead.json.data : auditRead.json?.data?.list ?? [];
const effects = effectsRead.json?.data?.items || (Array.isArray(effectsRead.json?.data) ? effectsRead.json.data : []);
const proposals = confirmationsRead.json?.data?.items || (Array.isArray(confirmationsRead.json?.data) ? confirmationsRead.json.data : []);
const rowById = (id) => rows.find((r) => String(r.id) === String(id));
check('① · the reader sees the blocked row', true, Boolean(rowById(blockRow.id)));
check('② · the reader sees the executed row', true, Boolean(rowById(executedRow.id)));

const ids = [...new Set(rows.map((r) => r.userId).filter(Boolean))];
const callerNames = await api(`/keelbase/caller-names?ids=${ids.join(',')}`, { token: readerToken });
const names = {};
for (const u of callerNames.json?.data || []) names[String(u.id)] = u.name;
check('the reader may resolve caller names', 200, callerNames.status);
check('both the initiator and the approver have names', true,
  Boolean(names[String(adminId)]) && Boolean(names[String(approverId)]));

const nameCache = {};
async function askRecordName(type, id) {
  if (id === null || id === undefined) return '';
  const key = `${type ?? ''}#${id}`;
  if (nameCache[key] !== undefined) return nameCache[key];
  const r = await api(`/keelbase/record-names?refs=${type}:${id}`, { token: readerToken });
  const row = (r.json?.data || []).find((x) => x.type === type && String(x.id) === String(id));
  nameCache[key] = row?.name ?? '';
  return nameCache[key];
}
const recordOf = (row) => {
  if (!row?.tool) return null;
  const at = Date.parse(row.createdAt);
  const near = effects.filter((e) => e.toolName === row.tool && Math.abs(Date.parse(e.createdAt) - at) <= 5000);
  return near.length === 1 ? near[0] : null;
};
const proposalOf = (row) => {
  if (!row?.tool) return null;
  const at = Date.parse(row.createdAt);
  const near = proposals.filter((c) => {
    if (c.toolName !== row.tool) return false;
    if (Math.abs(Date.parse(c.createdAt) - at) <= 5000) return true;
    return Boolean(c.decidedAt) && Math.abs(Date.parse(c.decidedAt) - at) <= 5000;
  });
  return near.length === 1 ? near[0] : null;
};
const proposalArgumentOf = (row) => {
  const p = proposalOf(row);
  const id = p?.arguments?.id;
  if (!p || id === null || id === undefined) return null;
  return { resultType: toolResultType(p.toolName), resultId: id };
};
const recordState = (e) => (!e.targetExists ? t('keelbase.effects.stateGone') : e.targetSoftDeleted ? t('keelbase.effects.stateDeleted') : t('keelbase.effects.statePresent'));
const recordName = (ref) => (ref ? nameCache[`${ref.resultType ?? ''}#${ref.resultId}`] || '' : '');

async function sixOf(row) {
  const e = recordOf(row);
  if (e) await askRecordName(e.resultType, e.resultId);
  else {
    const p = proposalArgumentOf(row);
    if (p) await askRecordName(p.resultType, p.resultId);
  }
  const proposal = e ? null : proposalArgumentOf(row);
  const answers = SIX.composeSix({
    row,
    callerName: row.userId ? names[String(row.userId)] ?? String(row.userId) : '',
    effect: e,
    proposal,
    hostNowName: e ? recordName(e) || e.targetTitle || '' : '',
    proposalName: recordName(proposal),
    recordState: e ? recordState(e) : '',
    mask,
    resultWord: (() => { const k = `keelbase.vocab.outcome.${row.outcome}`; return te(k) ? t(k) : ''; })(),
    resultMeaning: (() => {
      if (row.outcome === 'executed') return t(`keelbase.meaning.${EXECUTED_MEANING[toolEffect(row.tool ? inventory[row.tool] : null)]}`);
      const k = `keelbase.meaning.${row.outcome}`;
      return te(k) ? t(k) : '';
    })(),
    t,
    te,
  });
  const byKey = {};
  for (const a of answers) byKey[a.key] = a;
  return { answers, byKey, score: SIX.scoreSix(answers), effect: e };
}

const blockSix = await sixOf(rowById(blockRow.id));
const approveSix = await sixOf(rowById(executedRow.id));
const decisionSix = await sixOf(rowById(decisionRow.id));

for (const [label, six] of [['① block', blockSix], ['② approve', approveSix], ['② decision row', decisionSix]]) {
  console.log(`  -- ${label}: ${six.score.cells}/6`);
  for (const a of six.answers) console.log(`     ${a.answered ? '✔' : '✘'} ${a.key.padEnd(13)} ${a.text}`);
}

// ① 的五格有答案，③ 没有 —— 被 BLOCK 的调用连它想动哪条记录都没记下来。
// Five cells of ① have answers; ③ does not — a blocked call never even recorded which record it meant to touch.
check('① · the reader answers who', true, blockSix.byKey.who.answered);
check('① · the reader answers when, with a zone', true, blockSix.byKey.when.answered && /UTC[+-]\d{2}:\d{2}/.test(blockSix.byKey.when.text));
check('① · ③ is unanswered (current reading: the blocked call persisted no arguments)', false, blockSix.byKey.object.answered);
check('① · the object cell says so explicitly', t('keelbase.sixQ.objectUnrecorded'), blockSix.byKey.object.text);
check('① · the reader answers what changed', true, blockSix.byKey.change.answered);
check('① · the reader answers who confirmed', true, blockSix.byKey.confirmation.answered);
check('① · the fifth cell names the blocking gate', t('keelbase.sixQ.confirmBlocked'), blockSix.byKey.confirmation.text);
check('① · the reader answers the result', true, blockSix.byKey.result.answered);
check('① · the result reads Blocked, with its meaning',
  `${t('keelbase.vocab.outcome.blocked')} · ${t('keelbase.meaning.blocked')}`, blockSix.byKey.result.text);
check('① · five of six cells', 5, blockSix.score.cells);
check('① · no cell leaks an internal name', '[]', JSON.stringify(blockSix.score.leaked));

// ② 的五格有答案，⑤ 没有 —— 写自己那一行只记「要第二个人」，不记是谁。
// Five cells of ② have answers; ⑤ does not — the write's own row says "a second person" and not who.
check('② · the reader answers who (the initiator, who ran it)', true, approveSix.byKey.who.answered);
check('② · the reader answers when, with a zone', true, approveSix.byKey.when.answered && /UTC[+-]\d{2}:\d{2}/.test(approveSix.byKey.when.text));
check('② · the reader answers which object', true, approveSix.byKey.object.answered);
check('② · the reader answers what changed', true, approveSix.byKey.change.answered);
check('② · ⑤ is unanswered on the write row (current reading: the row does not name the approver)', false, approveSix.byKey.confirmation.answered);
check('② · the fifth cell says the row does not record who', t('keelbase.sixQ.confirmApprovalUnrecorded'), approveSix.byKey.confirmation.text);
check('② · the reader answers the result', true, approveSix.byKey.result.answered);
check('② · the result reads Executed, with its meaning',
  `${t('keelbase.vocab.outcome.executed')} · ${t('keelbase.meaning.executed')}`, approveSix.byKey.result.text);
check('② · five of six cells', 5, approveSix.score.cells);
check('② · no cell leaks an internal name', '[]', JSON.stringify(approveSix.score.leaked));

// 批准人确实被记下来了，只是在**另一行**上：裁决行的 ① 就是那个人。
// The approver is recorded — on a **different row**: the decision row's ① is that person.
check('② · the decision row names the approver in ①', true,
  decisionSix.byKey.who.answered && decisionSix.byKey.who.text.includes(names[String(approverId)]));
check('② · the decision row says what came of it', t('keelbase.vocab.outcome.approved'), decisionSix.byKey.result.text.split(' · ')[0]);

// YD-45 的追溯页读面：把轨迹里的裁决步配上审计行，答出批准人。
// YD-45's trace read face: pair the trace's decision step with its audit row and answer who approved.
{
  const trace = await api(`/ai/conversations/${approveConv}/trace`, { token: adminUser, base: '' });
  const step = (trace.json?.data?.steps || []).find((s) => s.type === 'confirmation');
  check('YD-45 · the trace carries a decision step', true, Boolean(step));
  const joined = matchApprover(step, rows);
  check('YD-45 · the trace join names the approver', String(approverId), joined);
}

// ── 读数：两轮逐字比对的就是这些行 / the reading — these are the lines two rounds are compared on ─────────
console.log('\n== 读数 ==');
const norm = (s) => String(s).replace(/#\d+/g, '#N');
const reading = (label, six) => {
  const unanswered = six.answers.filter((a) => !a.answered).map((a) => a.key);
  console.log(`READING ${label}.cells ${six.score.cells}/6`);
  console.log(`READING ${label}.unanswered ${unanswered.length ? unanswered.join(',') : '(none)'}`);
  for (const key of SIX.SIX_QUESTIONS) {
    // 时钟会走，故 `when` 只比**时区**：两次运行之间它是一个常量，而整个时间戳每次都不一样。
    // The clock moves, so `when` is compared on its **zone** only: the timestamp differs every run, the zone does not.
    const text = key === 'when'
      ? (six.byKey.when.text.match(/UTC[+-]\d{2}:\d{2}/) || [norm(six.byKey.when.text)])[0]
      : norm(six.byKey[key].text);
    console.log(`READING ${label}.${key} ${text}`);
  }
};
reading('block', blockSix);
reading('approve', approveSix);
reading('decision', decisionSix);

// ── 收尾：删掉本轮的业务行与 effect；审计行与确认行刻意留着 ─────────────────────────────────────
// ── Cleanup: drop this run's business rows and effect; audit and confirmation rows stay on purpose ──────────
console.log('\n== 收尾 ==');
putBack = () => {
  psql(`delete from side_effects where conversation_id = '${approveConv}'`);
  psql(`delete from follow_ups where customer_id = ${customerId}`);
  psql(`delete from customers where id = ${customerId}`);
};
runPutBack();
check('this run\'s customer row is gone', 0, psql(`select count(*) from customers where id = ${customerId}`));
check('this run\'s follow-up rows are gone', 0, psql(`select count(*) from follow_ups where customer_id = ${customerId}`));
check('the audit rows are left alone', 2, psql(`select count(*) from ai_audit_logs where id in (${blockRow.id}, ${executedRow.id})`));

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
