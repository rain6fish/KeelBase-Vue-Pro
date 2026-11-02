#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 上游 REST 写旁路审计（「丁」）的门禁：**一次写恰一行**、**读与登录零行**、**失败照样留行且两个码对得上**、
// **受治理的那条路不重行**。
//
//   bash scripts/run-server.sh &
//   node scripts/run-bypass-audit-scenarios.mjs
//
// **它证的不是「有没有记」，是「记的形状对不对」。** 一行旁路痕迹最容易的两种错法是：只记线缆状态（于是本宿主
// 包在 HTTP 200 里的业务拒绝被读成成功），和给受治理的工具路径也记一行（于是同一次写留两行、读者以为是两件事）。
// 故场景 3 专挑一次**业务拒绝**（HTTP 200、信封 `code` 非 0），场景 5/6 专挑**不该有行**的那些请求。
//
// **本轮的唯一标记是 `occurred_at`。** 表里没有一列可以写标记（也不该为门禁加一列），故每条断言都按
// `occurred_at >= 本轮开始` 收窄 —— 重跑、并跑都不会互相干扰，而这是本线每道门禁写法的那一条（按名字收窄，
// 不按整表计数）。
//
// 它造的每一样都拆掉；**旁路行与审计行刻意留着** —— 它们就是这道门禁要留下的读数。
//
// The gate for the upstream-REST bypass trail ("丁"): **one write, one row**; **reads and logins leave none**;
// **a failure keeps its row with both codes agreeing**; **the governed path leaves no second row**.
//
// What it proves is not "something is recorded" but "the shape of what is recorded is right". The two easy
// mistakes for a trail row are recording the wire status alone (so this host's business refusals, wrapped in
// HTTP 200, would read as success) and recording the governed tool path too (two rows for one write, read as
// two events). Scenario 3 therefore triggers a **business refusal** (HTTP 200, envelope `code` non-zero), and
// scenarios 5 and 6 trigger requests that must leave **no row at all**.
//
// **This run's marker is `occurred_at`.** No column exists to write a marker into (and none should be added for
// a gate's sake), so every assertion is scoped to `occurred_at >= this run's start` — reruns and concurrent runs
// do not interfere, which is the rule every gate on this line follows (scope by a name, never count the table).
//
// Everything it creates, it removes again. **Bypass rows and audit rows stay on purpose** — they are the
// readings this gate exists to leave behind.
import { execFileSync } from 'node:child_process';
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
    + ` from keelbase_bypass_log where occurred_at >= '${startedAt}' order by id`);
  return out === '' ? [] : out.split('\n').map((line) => {
    const [method, path, module, object, httpStatus, resultCode, callerId] = line.split('|');
    return { method, path, module, object, httpStatus, resultCode, callerId };
  });
};
const countSince = () => Number(psql(
  `select count(*) from keelbase_bypass_log where occurred_at >= '${startedAt}'`));

async function api(path, { method = 'GET', token, body, base = '/admin-api' } = {}) {
  const res = await fetch(`${HOST}${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'tenant-id': TENANT,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  let json = null;
  try { json = await res.json(); } catch { /* a non-JSON answer is itself a reading */ }
  return { status: res.status, json };
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
// Dict data must hang off an **existing** dict type (the module checks it; "当前字典类型不存在" is its own
// refusal). Borrow one when the database has one, otherwise create one and remove it on the way out — a gate
// must not require some particular seed to be present.
let dictType = psql('select type from system_dict_type where deleted = false limit 1');

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

// ── 汇总 ───────────────────────────────────────────────────────────────────────────────────────────
// Three writes were sent (one accepted, one refused, one unserved); three rows is the whole reading.
check('7. the run left exactly the three writes it made', 3, countSince());

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
