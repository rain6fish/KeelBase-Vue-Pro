#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 上游 REST 写旁路审计（「丁」）的门禁：**一次写恰一行**、**读与登录零行**、**失败照样留行且两个码对得上**、
// **受治理的那条路不重行**、**正文只有形状没有值**、**流式写恰一行且无业务码**。
//
//   bash scripts/run-server.sh &
//   node scripts/run-bypass-audit-scenarios.mjs
//
// **它证的不是「有没有记」，是「记的形状对不对」。** 一行旁路痕迹最容易的两种错法是：只记线缆状态（于是本宿主
// 包在 HTTP 200 里的业务拒绝被读成成功），和给受治理的工具路径也记一行（于是同一次写留两行、读者以为是两件事）。
// 故场景 3 专挑一次**业务拒绝**（HTTP 200、信封 `code` 非 0），场景 5/6 专挑**不该有行**的那些请求。
//
// **场景 8 是流式端点。** `/admin-api/ai1/session/message/send-stream` 的答复由 `SseEmitter` 写、不产出信封，
// 故它的行**恰一行**且 `result_code` 为 null —— 而它的**正文不读**（那是用户的提问，不是一次控制台写的正文）。
//
// **本轮的唯一标记是 `occurred_at`。** 表里没有一列可以写标记（也不该为门禁加一列），故每条断言都按
// `occurred_at >= 本轮开始` 收窄 —— 重跑、并跑都不会互相干扰，而这是本线每道门禁写法的那一条（按名字收窄，
// 不按整表计数）。
//
// 它造的每一样都拆掉；**旁路行与审计行刻意留着** —— 它们就是这道门禁要留下的读数。
//
// The gate for the upstream-REST bypass trail ("丁"): **one write, one row**; **reads and logins leave none**;
// **a failure keeps its row with both codes agreeing**; **the governed path leaves no second row**; **the body
// keeps its shape and no value**; **a streaming write is one row with no business code**.
//
// What it proves is not "something is recorded" but "the shape of what is recorded is right". The two easy
// mistakes for a trail row are recording the wire status alone (so this host's business refusals, wrapped in
// HTTP 200, would read as success) and recording the governed tool path too (two rows for one write, read as
// two events). Scenario 3 therefore triggers a **business refusal** (HTTP 200, envelope `code` non-zero), and
// scenarios 5 and 6 trigger requests that must leave **no row at all**.
//
// **Scenario 8 is the streaming endpoint.** `/admin-api/ai1/session/message/send-stream` answers through an
// `SseEmitter` and produces no envelope, so its row is **exactly one** with `result_code` null — and its
// **body is not read** (that is the user's question, not the body of a console write).
//
// **This run's marker is `occurred_at`.** No column exists to write a marker into (and none should be added for
// a gate's sake), so every assertion is scoped to `occurred_at >= this run's start` — reruns and concurrent runs
// do not interfere, which is the rule every gate on this line follows (scope by a name, never count the table).
//
// Everything it creates, it removes again. **Bypass rows and audit rows stay on purpose** — they are the
// readings this gate exists to leave behind.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => {
  console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`);
  fail += 1;
};
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));

const psql = (sql) => execFileSync(
  'docker', ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-U', 'root', '-d', DB, '-tAc', sql],
  { encoding: 'utf8' }).trim();

/** 本轮开始时刻：所有断言按它收窄。 / This run's start: every assertion is scoped by it. */
const startedAt = new Date().toISOString();

const bypassRows = () => {
  const out = psql(`select method || '|' || path || '|' || coalesce(module, '') || '|' || coalesce(object_name, '')`
    + ` || '|' || http_status || '|' || coalesce(result_code::text, 'null') || '|' || coalesce(caller_id::text, 'null')`
    + ` || '|' || coalesce(body_length::text, 'null') || '|' || coalesce(body_sha256, 'null')`
    + ` || '|' || coalesce(body_fields, 'null')`
    + ` from keelbase_bypass_log where occurred_at >= '${startedAt}' order by id`);
  return out === '' ? [] : out.split('\n').map((line) => {
    const [method, path, module, object, httpStatus, resultCode, callerId, bodyLength, bodySha256, bodyFields] =
      line.split('|');
    return { method, path, module, object, httpStatus, resultCode, callerId, bodyLength, bodySha256, bodyFields };
  });
};
const countSince = () => Number(psql(
  `select count(*) from keelbase_bypass_log where occurred_at >= '${startedAt}'`));

/** 本轮每一行的整行文本：用来断言正文里的值**没有一个**落进库里。 / Whole rows, to prove no body value landed. */
const rowTextSince = () => psql(
  `select coalesce(string_agg(t::text, E'\\n'), '') from keelbase_bypass_log t where occurred_at >= '${startedAt}'`);

const sha256Prefix = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').slice(0, 12);

async function api(path, { method = 'GET', token, body, base = '/admin-api', accept } = {}) {
  const payload = body ? JSON.stringify(body) : undefined;
  const res = await fetch(`${HOST}${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'tenant-id': TENANT,
      ...(accept ? { Accept: accept } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(payload ? { body: payload } : {})
  });
  let json = null;
  let text = null;
  // 按 content-type 选**一种**读法：`json()` 解析失败时正文已经被吃掉，再去 `text()` 只会抛，把一次真正的读
  // 变成一句误导的异常。
  // Pick **one** way to read by content-type: a failed `json()` has already consumed the body, so a later
  // `text()` only throws and turns a real reading into a misleading exception.
  const contentType = String(res.headers.get('content-type') ?? '');
  if (contentType.includes('json')) {
    try { json = await res.json(); } catch { /* a non-JSON body behind a JSON header is itself a reading */ }
  } else {
    try { text = await res.text(); } catch { /* nothing to read */ }
  }
  // 原样交回送出去的正文：摘要那一条断言必须对**线上那些字节**成立，而不是对一份重新序列化的副本。
  // Hand back the exact payload sent: the digest assertion has to hold for the bytes on the wire, not for a
  // re-serialised copy.
  return { status: res.status, json, text, sent: payload };
}

async function login() {
  const password = resolveAdminPassword(psql);
  const r = await api('/system/auth/login', { method: 'POST', body: { username: ADMIN_USER, password } });
  if (!r.json || r.json.code !== 0) {
    throw new Error(`login(${ADMIN_USER}) answered ${JSON.stringify(r.json)} (HTTP ${r.status})`);
  }
  return r.json.data.accessToken;
}

// 造出来的字典数据，收尾时按 id 删；收尾函数在造出第一行的那一刻挂上。
// The dict row this run creates, removed by id on the way out; the function is attached the moment the row exists.
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

const marker = `bypass-gate-${Date.now()}`;
let createdId = null;
let createdType = null;

// 字典数据必须挂在一个**已存在**的字典类型下（模块自己校验，`当前字典类型不存在` 就是它的拒绝）。库里有就借一个，
// 没有就造一个、收尾时拆掉 —— 门禁不该要求某种种子恰好存在。
//
// `deleted = 0`（不是 `= false`）：本仓的库是从 MySQL **机器转换**来的，`deleted` 是 `smallint`，
// `= false` 在这里报 `operator does not exist: smallint = boolean`（2026-10-31 在空库上实测）。
// `deleted = 0` (not `= false`): this repository's schema is machine-converted from MySQL and `deleted` is a
// `smallint`; `= false` answers `operator does not exist: smallint = boolean` (measured 2026-10-31 on a
// freshly bootstrapped database).
let dictType = psql('select type from system_dict_type where deleted = 0 limit 1');

const token = await login();
console.log(`  note  signed in as ${ADMIN_USER}; this run's marker ${marker}; since ${startedAt}`);
if (dictType === '') {
  createdType = `${marker}-type`;
  const type = await api('/system/dict-type/create', {
    method: 'POST', token,
    body: { name: createdType, type: createdType, status: 0 }
  });
  if (!type.json || type.json.code !== 0) {
    throw new Error(`could not create a dict type for this run: ${JSON.stringify(type.json)}`);
  }
  dictType = createdType;
}
console.log(`  note  dict type used: ${dictType}`);

// ── 1 · 读不留行 ────────────────────────────────────────────────────────────────────────────────────
// A read is not a write: the trail covers writes only, and reads already have their own access log.
const before1 = countSince();
await api('/system/dict-data/page?pageNo=1&pageSize=1', { token });
check('1. a GET adds no bypass row', before1, countSince());

// ── 2 · 一次写恰一行，两个码都对 ─────────────────────────────────────────────────────────────────────
// One write, exactly one row — and the envelope's code says the write was accepted.
const created = await api('/system/dict-data/create', {
  method: 'POST', token,
  body: { dictType, label: marker, value: marker, sort: 0, status: 0 }
});
if (!created.json || created.json.code !== 0) {
  throw new Error(`scenario 2 could not create the fixture: ${JSON.stringify(created.json)} (HTTP ${created.status})`);
}
createdId = created.json.data;
putBack = () => {
  if (createdId !== null) {
    psql(`delete from system_dict_data where id = ${createdId}`);
  }
  psql(`delete from system_dict_data where value = '${marker}'`);
  if (createdType !== null) {
    psql(`delete from system_dict_type where type = '${createdType}'`);
  }
};
check('2. a console write adds exactly one bypass row', before1 + 1, countSince());
{
  const row = bypassRows().find((r) => r.path === '/admin-api/system/dict-data/create');
  check('2. the row names the method', 'POST', row?.method);
  check('2. the row names the module', 'system', row?.module);
  check('2. the row names the business object', 'dict-data', row?.object);
  check('2. the row carries the wire status', 200, row?.httpStatus);
  check('2. the row carries the envelope code', 0, row?.resultCode);
  check('2. the row names the caller', true, row !== undefined && row.callerId !== 'null');
  // 正文只有形状：长度按**送出去的字节**、摘要同样，字段名按顶层、按文序。值一个都不该出现在任何一列（场景 9）。
  // The body is shape only: length and digest over the **bytes sent**, names top-level and in document order.
  // Not one value should appear in any column (scenario 9).
  check('2. the row records the body length', Buffer.byteLength(created.sent, 'utf8'), row?.bodyLength);
  check('2. the row records the digest of the bytes sent', sha256Prefix(created.sent), row?.bodySha256);
  check('2. the row records the top-level field names', 'dictType,label,value,sort,status', row?.bodyFields);
}

// ── 3 · 业务拒绝藏在 HTTP 200 里 ────────────────────────────────────────────────────────────────────
// The mistake this scenario exists to catch: a refusal that the wire calls 200. Both codes are recorded,
// so a reader can tell "answered" from "succeeded".
const before3 = countSince();
const refused = await api('/system/dict-data/create', {
  method: 'POST', token,
  body: { dictType, label: `${marker}-dup`, value: marker, sort: 0, status: 0 } // same value ⇒ the module refuses
});
check('3. the refusal still answered 200 on the wire', 200, refused.status);
check('3. the refusal carried a non-zero envelope code', true,
  refused.json !== null && refused.json.code !== 0);
check('3. a refused write still leaves its row', before3 + 1, countSince());
{
  const rows = bypassRows().filter((r) => r.path === '/admin-api/system/dict-data/create');
  const latest = rows[rows.length - 1];
  check('3. the row keeps the wire status', 200, latest?.httpStatus);
  check('3. the row keeps the envelope code, not the wire status', refused.json?.code, latest?.resultCode);
}

// ── 4 · 没有端点的写也留一行 ───────────────────────────────────────────────────────────────────────
// A write to a path nothing serves still leaves a row. **The host answers that in an envelope too** —
// measured: HTTP 200 carrying `code 501`, not a bare 404 — which is the second reason the trail keeps both
// codes: a reader who saw only "200" would call an unserved write a success.
//
// 没有端点的写也留一行。**宿主连这个也用信封答** —— 实测是 HTTP 200 带 `code 501`，不是裸 404 —— 这正是旁路行
// 要存两个码的第二个理由：只看到「200」的人会把一次没有落点的写当成成功。
const before4 = countSince();
const notFound = await api('/crm/contract/definitely-not-an-endpoint', { method: 'POST', token, body: {} });
check('4. the unknown endpoint answered 200 on the wire', 200, notFound.status);
check('4. with a non-zero envelope code', true, notFound.json !== null && notFound.json.code !== 0);
check('4. an unserved write still leaves its row', before4 + 1, countSince());
{
  const row = bypassRows().find((r) => r.path === '/admin-api/crm/contract/definitely-not-an-endpoint');
  check('4. the row keeps the wire status', notFound.status, row?.httpStatus);
  check('4. the row keeps the envelope code', notFound.json?.code, row?.resultCode);
}

// ── 5 · 登录不留行 ──────────────────────────────────────────────────────────────────────────────────
// Credentials are never recorded: a copy of a password in a readable table is a leak in itself.
const before5 = countSince();
await api('/system/auth/login', { method: 'POST', body: { username: ADMIN_USER, password: 'not-the-password' } });
check('5. a login attempt leaves no bypass row', before5, countSince());

// ── 6 · 受治理的那条路不重行 ───────────────────────────────────────────────────────────────────────
// The governed tool path runs in-process; the conversation route is `/admin/`, not `/admin-api/`. Neither
// crosses the trail, so this is zero rows by shape — not by de-duplicating afterwards.
const before6 = countSince();
await api('/ai/chat/stream', { method: 'POST', token, base: '/admin', body: { message: marker } });
check('6. the conversation route leaves no bypass row', before6, countSince());

// ── 8 · 流式端点：恰一行、无信封码、正文不读 ─────────────────────────────────────────────────────────
// `/admin-api/ai1/session/message/send-stream` answers through an SseEmitter: no envelope is ever produced, so
// `result_code` is null — and the request body is the user's question, so it is not read. A session id that
// does not exist is enough: the service answers an error event on the stream, which is exactly the shape
// this scenario is about (a streamed answer, not an envelope).
const before8 = countSince();
const streamed = await api('/ai1/session/message/send-stream', {
  method: 'POST', token, accept: 'text/event-stream',
  body: { sessionId: 999999999, content: marker }
});
check('8. the streaming write answered 200 on the wire', 200, streamed.status);
check('8. the answer is an event stream, not an envelope', true,
  (streamed.text ?? '').includes('event:') || (streamed.text ?? '').includes('data:'));
check('8. a streaming write leaves exactly one row', before8 + 1, countSince());
{
  const row = bypassRows().find((r) => r.path === '/admin-api/ai1/session/message/send-stream');
  check('8. the row is a POST', 'POST', row?.method);
  check('8. the row has no business code: no envelope was produced', 'null', row?.resultCode);
  check('8. the streaming request body was not read', 'null', row?.bodyLength);
  check('8. so it has no digest either', 'null', row?.bodySha256);
  check('8. and no field names', 'null', row?.bodyFields);
}

// ── 9 · 值不进库 ────────────────────────────────────────────────────────────────────────────────────
// The marker is a field value in the write of scenario 2. If it appears anywhere in this run's rows, a value
// reached a table that is meant to hold shape only.
check('9. no body value reached any column', false, rowTextSince().includes(marker));

// ── 汇总 ───────────────────────────────────────────────────────────────────────────────────────────
// Four writes were sent (one accepted, one refused, one unserved, one streaming) plus the dict type when the
// database had none; that many rows is the whole reading.
check('7. the run left exactly the writes it made', 4 + (createdType !== null ? 1 : 0), countSince());

runPutBack();
psql('select 1'); // 收尾之后再碰一次库：删不掉时这里会抛，而不是悄悄留一行。
console.log(`\n${pass} ok / ${fail} failed`);
if (bypassRows().length > 0) {
  console.log('  note  this run\'s bypass rows (kept as the reading):');
  for (const r of bypassRows()) {
    console.log(`        ${r.method} ${r.path}  ${r.module}/${r.object}  http=${r.httpStatus} code=${r.resultCode} caller=${r.callerId}`);
  }
}
process.exit(fail === 0 ? 0 : 1);
