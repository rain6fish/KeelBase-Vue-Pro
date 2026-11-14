#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 上游 REST 写旁路审计（「丁」）的门禁：**一次写恰一行**、**读与登录零行**、**失败照样留行且两个码对得上**、
// **受治理的那条路不重行**、**正文只有形状没有值**、**流式写恰一行且无业务码**、**开关关闭 ⇒ 零行且行为不变**。
//
//   bash scripts/run-server.sh &
//   node scripts/run-bypass-audit-scenarios.mjs
//
// **它证的不是「有没有记」，是「记的形状对不对」。** 一行旁路痕迹最容易的两种错法是：只记线缆状态（于是本宿主
// 包在 HTTP 200 里的业务拒绝被读成成功），和给受治理的工具路径也记一行（于是同一次写留两行、读者以为是两件事）。
// 故场景 3 专挑一次**业务拒绝**（HTTP 200、信封 `code` 非 0），场景 5/6 专挑**不该有行**的那些请求。
//
// **场景 7 自己起停第二个宿主**：它从本门的环境里取 `PG_*` / `REDIS_*`（必须与第一个宿主同一套数据存储），
// 端口取 `BYPASS_AUDIT_OFF_PORT`（默认 48098），日志落在 `EVIDENCE_DIR`（默认系统临时目录）。那条宿主把
// `keelbase.bypass-audit.enabled` 关掉，故过滤器**根本不装** —— 一次写零行，而响应与业务行与开着时一样。
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
// keeps its shape and no value**; **a streaming write is one row with no business code**; **switch off ⇒ zero
// rows and unchanged behaviour**.
//
// What it proves is not "something is recorded" but "the shape of what is recorded is right". The two easy
// mistakes for a trail row are recording the wire status alone (so this host's business refusals, wrapped in
// HTTP 200, would read as success) and recording the governed tool path too (two rows for one write, read as
// two events). Scenario 3 therefore triggers a **business refusal** (HTTP 200, envelope `code` non-zero), and
// scenarios 5 and 6 trigger requests that must leave **no row at all**.
//
// **Scenario 7 starts and stops a second host itself**: it takes `PG_*` / `REDIS_*` from this gate's
// environment (they must name the same datastore as the first host), listens on `BYPASS_AUDIT_OFF_PORT`
// (default 48098), and writes its log to `EVIDENCE_DIR` (default: the system temp dir). That host has
// `keelbase.bypass-audit.enabled` off, so the filter is **not installed** — one write leaves no row, while
// the response and the business row are the same as with it on.
//
// **Scenario 8 is the streaming endpoint.** `/admin-api/ai1/session/message/send-stream` answers through an
// `SseEmitter` and produces no envelope, so its row is **exactly one** with `result_code` null — and its
// **body is not read** (that is the user's question, not the body of a console write).
//
// **This run's marker is `occurred_at`.** No column exists to write a marker into (and none should be added for
// a gate's sake), so every assertion is scoped to `occurred_at >= this run's start` — reruns and concurrent runs
// do not interfere, which is the rule every gate on this line follows (scope by a name, never count the table).
//
// **这个时间下界不够定位「这一条」行**：场景 2 与场景 3 写的是同一条路径，只按时间收窄仍会读到**上一场景**的
// 行。故每个场景在发起请求前记下 `max(id)` 水位，之后只认 `id > 水位` 的行 —— 那是本轮这一条请求留下的行，
// 不是「本运行里最后一行」。
//
// **旁路留痕是异步写出的**：请求线程只入队，单线程回收端以最多 1 s 的轮询取走再插入。于是「请求返回」与
// 「行可读」之间隔着最多一个轮询周期。若在请求返回的下一刻就地计数，读到的是**还没有这一行**；而一句
// `rows[rows.length - 1]` 更糟 —— 行缺席时它拿到的是**之前某一场景**的行（同一路径），于是「线缆 200」
// 在缺行时**假绿**。故本门每一条读数都**等留痕稳定**：每 200 ms 读一次，连续 1.6 s 不变即取，一次最多等
// 3 s。1.6 s = 1 s 轮询 + 余量；3 s 是硬上限，不是期望耗时。断言一条都没放宽：等待只决定**何时**读，
// 不改变**读什么**。
//
// **负向控制 `BYPASS_GATE_NO_WAIT=1`** 把等待整个关掉、只读一次。那条读数**应当变红** —— 它证明等待是承重的，
// 而不是为了让门变绿加上的。只在取证时用；CI 不设它。
//
// The time bound alone cannot single out "this" row: scenarios 2 and 3 write the same path, so a time-scoped
// read still sees the **previous scenario's** row. Each scenario therefore records a `max(id)` watermark before
// its request and accepts only rows with `id > watermark` — the row this request left, not "the last row of
// this run".
//
// **The trail is written asynchronously**: the request thread only enqueues, and a single drain thread takes
// rows off the queue by a poll of up to 1 s and inserts them. So "the request returned" and "the row is
// readable" are up to one poll apart. Counting the instant a request returns reads *not yet*; and
// `rows[rows.length - 1]` is worse — with the row absent it picks an **earlier scenario's** row on the same
// path, so "wire 200" is falsely green. Every reading here therefore **waits for the trail to settle**: one
// read every 200 ms, taken once the reading has not changed for 1.6 s, at most 3 s per reading. 1.6 s is the
// 1 s poll plus margin; 3 s is a ceiling, not the expected cost. No assertion is relaxed: the wait decides
// **when** to read, never **what** to read.
//
// **The negative control `BYPASS_GATE_NO_WAIT=1`** turns the waits off and reads once. That reading **must be
// red** — it proves the waits are load-bearing rather than added to turn the gate green. For evidence runs
// only; CI never sets it.
//
// Everything it creates, it removes again. **Bypass rows and audit rows stay on purpose** — they are the
// readings this gate exists to leave behind.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const OFF_PORT = process.env.BYPASS_AUDIT_OFF_PORT || '48098';
const OFF_HOST = process.env.BYPASS_AUDIT_OFF_URL || `http://127.0.0.1:${OFF_PORT}`;
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
// 证据目录默认落在系统临时目录：`D:/…` 那种默认只在 Windows 上成立，干净机器与 CI 都不该依赖它。
// CI 用 `EVIDENCE_DIR` 指到工作区内，好把第二个宿主的日志一并上传。
//
// The evidence directory defaults to the system temp dir: a `D:/…` default only exists on Windows, and
// neither a clean machine nor CI should depend on it. CI points `EVIDENCE_DIR` inside the workspace so
// the second host's log can be uploaded with the run.
const EVIDENCE = process.env.EVIDENCE_DIR || join(tmpdir(), 'keelbase-bypass-audit-evidence');

// 第二个宿主连的是**宿主侧端口**，而本门自己的断言走 `docker exec`（容器内）。默认值与
// `scripts/run-server.sh` 逐字一致：解析一次、原样交给子进程，故打印出来的地址就是它真会去连的地址。
//
// The second host dials the **host-side** ports while this gate's own assertions go through `docker exec`
// (inside the container). These defaults match `scripts/run-server.sh` word for word: resolve once, hand the
// resolved values to the child, so the address printed is the address it will really dial.
const DATASTORE = {
  PG_HOST: process.env.PG_HOST || '127.0.0.1',
  PG_PORT: process.env.PG_PORT || '54329',
  PG_DB: process.env.PG_DB || DB,
  PG_USER: process.env.PG_USER || 'root',
  PG_PASSWORD: process.env.PG_PASSWORD || 'password',
  REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
  REDIS_PORT: process.env.REDIS_PORT || '56389'
};

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => {
  console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`);
  fail += 1;
};
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// 读数的等待：见文件头「旁路留痕是异步写出的」。 / Settling a reading: see the header note on async writes.
const WAIT_MS = Number(process.env.BYPASS_GATE_WAIT_MS || 3000);
const POLL_MS = 200;
const QUIET_MS = 1600;
const NO_WAIT = process.env.BYPASS_GATE_NO_WAIT === '1';
if (NO_WAIT) {
  console.log('  note  NEGATIVE CONTROL — waits are off; this run is expected to be RED and is not a pass');
}

/**
 * 读一次、再读，直到读数连续 `QUIET_MS` 不变；最多等 `WAIT_MS`。返回**稳定后**的那次读数。
 *
 * `read` 每次都真去读库 —— 缓存的读数会把这个门变成「等自己」，而不是等留痕。
 * `BYPASS_GATE_NO_WAIT=1` 时只读一次（负向控制）。
 *
 * Read, then read again, until the reading has not changed for `QUIET_MS`; wait at most `WAIT_MS`, and
 * return the **settled** reading. `read` hits the database every time — a cached reading would have the gate
 * waiting on itself rather than on the trail. With `BYPASS_GATE_NO_WAIT=1` it reads exactly once.
 */
async function settled(read) {
  if (NO_WAIT) return read();
  const end = Date.now() + WAIT_MS;
  let last = read();
  let signature = JSON.stringify(last);
  let quietSince = Date.now();
  while (Date.now() < end) {
    await sleep(POLL_MS);
    last = read();
    const next = JSON.stringify(last);
    if (next !== signature) {
      signature = next;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= QUIET_MS) {
      return last;
    }
  }
  return last;
}

const psql = (sql) => execFileSync(
  'docker', ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-U', 'root', '-d', DB, '-tAc', sql],
  { encoding: 'utf8' }).trim();

/** 本轮开始时刻：所有断言按它收窄。 / This run's start: every assertion is scoped by it. */
const startedAt = new Date().toISOString();

const ROW_COLUMNS = `select method || '|' || path || '|' || coalesce(module, '') || '|' || coalesce(object_name, '')`
  + ` || '|' || http_status || '|' || coalesce(result_code::text, 'null') || '|' || coalesce(caller_id::text, 'null')`
  + ` || '|' || coalesce(body_length::text, 'null') || '|' || coalesce(body_sha256, 'null')`
  + ` || '|' || coalesce(body_fields, 'null')`;

const parseRows = (out) => (out === '' ? [] : out.split('\n').map((line) => {
  const [method, path, module, object, httpStatus, resultCode, callerId, bodyLength, bodySha256, bodyFields] =
    line.split('|');
  return { method, path, module, object, httpStatus, resultCode, callerId, bodyLength, bodySha256, bodyFields };
}));

const bypassRows = () => parseRows(psql(`${ROW_COLUMNS} from keelbase_bypass_log`
  + ` where occurred_at >= '${startedAt}' order by id`));

/**
 * 水位之后的行 —— 用来定位**这一条请求**留下的行。同一条路径在本次运行里会被写两次（场景 2 与 3），
 * 故只按运行开始时刻收窄不够；`id > 水位` 才是「这一次」。
 *
 * Rows above an id watermark — how a **single request's** row is singled out. The same path is written twice
 * in one run (scenarios 2 and 3), so this run's start is not enough; `id > watermark` is "this time".
 */
const bypassRowsAfter = (sinceId) => parseRows(psql(`${ROW_COLUMNS} from keelbase_bypass_log`
  + ` where id > ${sinceId} order by id`));

/** 请求前的水位。 / The watermark taken before a request. */
const maxRowId = () => Number(psql('select coalesce(max(id), 0) from keelbase_bypass_log'));
const countSince = () => Number(psql(
  `select count(*) from keelbase_bypass_log where occurred_at >= '${startedAt}'`));

/** 本轮每一行的整行文本：用来断言正文里的值**没有一个**落进库里。 / Whole rows, to prove no body value landed. */
const rowTextSince = () => psql(
  `select coalesce(string_agg(t::text, E'\\n'), '') from keelbase_bypass_log t where occurred_at >= '${startedAt}'`);

const sha256Prefix = (text) => createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').slice(0, 12);

async function api(path, { method = 'GET', token, body, base = '/admin-api', host = HOST, accept } = {}) {
  const payload = body ? JSON.stringify(body) : undefined;
  const res = await fetch(`${host}${base}${path}`, {
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

async function login(host = HOST) {
  const password = resolveAdminPassword(psql);
  const r = await api('/system/auth/login', { method: 'POST', host, body: { username: ADMIN_USER, password } });
  if (!r.json || r.json.code !== 0) {
    throw new Error(`login(${ADMIN_USER}) answered ${JSON.stringify(r.json)} (HTTP ${r.status})`);
  }
  return r.json.data.accessToken;
}

// ── 第二个宿主（开关关）的起停 / the second host and its life cycle ──────────────────────────────
let offHost = null;

/** 谁在这个端口上监听（只在 Windows 上用于收尾自查）。 / Who listens on this port (Windows cleanup check). */
function portHolders(port) {
  try {
    const netstat = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
    const pids = new Set();
    for (const line of netstat.split(/\r?\n/)) {
      if (line.includes(`:${port}`) && line.includes('LISTENING')) {
        const pid = line.trim().split(/\s+/).pop();
        if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
      }
    }
    return [...pids];
  } catch {
    return [];
  }
}

function killTree(child) {
  if (!child || child.pid == null) return;
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
  } else if (child.exitCode === null) {
    try { child.kill('SIGTERM'); } catch { /* already gone */ }
  }
}

/** 这个端口上有没有人接（只探 TCP，不发协议）。 / Is anything accepting on this port (TCP only). */
function reachable(host, port, timeoutMs = 2000) {
  return new Promise((done) => {
    const socket = connect({ host, port: Number(port) });
    const finish = (value) => { socket.destroy(); done(value); };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

/** 失败时把子进程日志的尾巴带出来：下一次红要能自己说明为什么。 / Bring the child's log tail out. */
function tailOf(path, lines = 30) {
  try {
    const text = readFileSync(path, 'utf8').replace(/\s+$/, '');
    if (text === '') return '(empty)';
    return text.split(/\r?\n/).slice(-lines).join('\n');
  } catch (error) {
    return `(could not read: ${error.message})`;
  }
}

async function startOffHost() {
  mkdirSync(EVIDENCE, { recursive: true });
  const log = join(EVIDENCE, 'off-host.log');
  console.log(`  note  starting the second host (switch off) on ${OFF_HOST}; log ${log}`);
  console.log(`  note  it shares this gate's datastore: ${DATASTORE.PG_HOST}:${DATASTORE.PG_PORT}/${DATASTORE.PG_DB},`
    + ` redis ${DATASTORE.REDIS_HOST}:${DATASTORE.REDIS_PORT}`);
  // 先探一次数据存储：缺了端口的环境变量时，子进程会回落到默认值、连一个没人听的端口并在十几秒内退出 ——
  // 把等待调长不会让它起来。故把「连错了库」变成一句前置失败，而不是一条只有退出码的红。
  //
  // Probe the datastore first: without the port variables in its environment the child falls back to the
  // defaults, dials a port nothing listens on, and exits within seconds — a longer wait cannot fix that. This
  // turns "pointed at the wrong datastore" into a pre-flight failure instead of a red with only an exit code.
  const [pgUp, redisUp] = await Promise.all([
    reachable(DATASTORE.PG_HOST, DATASTORE.PG_PORT),
    reachable(DATASTORE.REDIS_HOST, DATASTORE.REDIS_PORT)
  ]);
  if (!pgUp || !redisUp) {
    const down = [
      pgUp ? null : `PostgreSQL ${DATASTORE.PG_HOST}:${DATASTORE.PG_PORT}`,
      redisUp ? null : `Redis ${DATASTORE.REDIS_HOST}:${DATASTORE.REDIS_PORT}`
    ].filter(Boolean).join(' / ');
    console.error(`  note  the second host would dial ${down}, and nothing accepts there`);
    console.error('  note  this gate asserts through `docker exec`, but the second host needs the host-side'
      + " ports: set PG_PORT / REDIS_PORT (and PG_HOST / REDIS_HOST) to this stack's published ports");
    return null;
  }
  const out = openSync(log, 'w');
  const child = spawn('bash', ['scripts/run-server.sh'], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...DATASTORE,
      PORT: OFF_PORT,
      SERVER_ADDRESS: '127.0.0.1',
      // 开关的语义是「不装」；`bypass-audit` 与 `bypassAudit` 在 relaxed binding 下是同一个键。
      // The switch means "not installed"; `bypass-audit` and `bypassAudit` are one key under relaxed binding.
      SPRING_APPLICATION_JSON: JSON.stringify({ keelbase: { bypassAudit: { enabled: false } } })
    },
    stdio: ['ignore', out, out]
  });
  closeSync(out);
  return child;
}

async function waitForHost(host, child, timeoutMs = 300000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (child.exitCode !== null) return false; // 它已经退了，等下去没有意义。 / It already died.
    try {
      const res = await fetch(`${host}/actuator/health`);
      if (res.status === 200) return true;
    } catch { /* 还没开始监听。 / Not listening yet. */ }
    await sleep(1000);
  }
  return false;
}

function stopOffHostSync() {
  const child = offHost;
  offHost = null;
  if (!child) return;
  killTree(child);
  if (process.platform === 'win32') {
    for (const pid of portHolders(OFF_PORT)) {
      try { execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    }
  }
}

async function stopOffHost() {
  const child = offHost;
  offHost = null;
  if (!child) return;
  killTree(child);
  if (process.platform !== 'win32') {
    for (let i = 0; i < 30 && child.exitCode === null; i += 1) await sleep(500);
    if (child.exitCode === null) { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
    return;
  }
  // `run-server.sh` 会 exec 进 java（同一 PID），故树杀通常就够；再按端口自查一次，免得下一次跑绑不上端口。
  // `run-server.sh` execs into java (same PID), so the tree kill normally suffices; check the port anyway so
  // the next run cannot fail to bind it.
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const holders = portHolders(OFF_PORT);
    if (holders.length === 0) return;
    for (const pid of holders) {
      try { execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' }); } catch { /* already gone */ }
    }
    await sleep(500);
  }
  console.error(`  note  port ${OFF_PORT} is still listening after stopping the second host`);
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
  stopOffHostSync();
});
// 被 Ctrl-C 或 CI 的取消打断时也要停掉第二个宿主：默认信号处理不会走 `exit`。
// A Ctrl-C or a CI cancellation must stop the second host too: the default signal handling skips `exit`.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopOffHostSync();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

const marker = `bypass-gate-${Date.now()}`;
const offMarker = `${marker}-off`;
let createdId = null;
let createdType = null;
let offCreatedId = null;

// 字典数据必须挂在一个**已存在**的字典类型下（模块自己校验，`当前字典类型不存在` 就是它的拒绝）。库里有就借一个，
// 没有就造一个、收尾时拆掉 —— 门禁不该要求某种种子恰好存在。
//
// `deleted = 0`（不是 `= false`）：本仓的库是从 MySQL **机器转换**来的，`deleted` 是 `smallint`，
// `= false` 在这里报 `operator does not exist: smallint = boolean`（2026-10-31 在空库上实测）。
//
// Dict data must hang off an **existing** dict type (the module checks it; "当前字典类型不存在" is its own
// refusal). Borrow one when the database has one, otherwise create one and remove it on the way out — a gate
// must not require some particular seed to be present. `deleted = 0` (not `= false`): this repository's schema
// is machine-converted from MySQL and `deleted` is a `smallint`; `= false` answers `operator does not exist:
// smallint = boolean` (measured 2026-10-31 on a freshly bootstrapped database).
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
// 「没有行」也要等：留痕迟到的话，立刻读到的「没有」会把一条晚到的行读成没记。
// "No row" waits too: with an immediate read, a late row would be read as never recorded.
check('1. a GET adds no bypass row', before1, await settled(countSince));

// ── 2 · 一次写恰一行，两个码都对 ─────────────────────────────────────────────────────────────────────
// One write, exactly one row — and the envelope's code says the write was accepted.
const before2Id = maxRowId();
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
  if (offCreatedId !== null) {
    psql(`delete from system_dict_data where id = ${offCreatedId}`);
  }
  psql(`delete from system_dict_data where value = '${offMarker}'`);
  if (createdType !== null) {
    psql(`delete from system_dict_type where type = '${createdType}'`);
  }
};
// 「恰一行」仍按**整表**口径（水位之后新增了几行），与改动前 `countSince()` 的断言同义；路径只用来定位内容。
// "Exactly one" stays **table-wide** (how many rows appeared above the watermark) — the same meaning the old
// `countSince()` assertion had; the path is only used to find the row's content.
const fresh2 = await settled(() => bypassRowsAfter(before2Id));
check('2. a console write adds exactly one bypass row', 1, fresh2.length);
{
  const rows2 = fresh2.filter((r) => r.path === '/admin-api/system/dict-data/create');
  const row = rows2[rows2.length - 1];
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
const before3Id = maxRowId();
const refused = await api('/system/dict-data/create', {
  method: 'POST', token,
  body: { dictType, label: `${marker}-dup`, value: marker, sort: 0, status: 0 } // same value ⇒ the module refuses
});
check('3. the refusal still answered 200 on the wire', 200, refused.status);
check('3. the refusal carried a non-zero envelope code', true,
  refused.json !== null && refused.json.code !== 0);
// 按水位只认**这一次**的写：同一条路径上已有场景 2 的行，取「本运行最后一行」会把那一行读成这一次的。
// The watermark accepts only **this** write: scenario 2 already left a row on the same path, and "the run's
// last row" would read that one as this one's.
const fresh3 = await settled(() => bypassRowsAfter(before3Id));
check('3. a refused write still leaves its row', 1, fresh3.length);
{
  const rows = fresh3.filter((r) => r.path === '/admin-api/system/dict-data/create');
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
const before4Id = maxRowId();
const notFound = await api('/crm/contract/definitely-not-an-endpoint', { method: 'POST', token, body: {} });
check('4. the unknown endpoint answered 200 on the wire', 200, notFound.status);
check('4. with a non-zero envelope code', true, notFound.json !== null && notFound.json.code !== 0);
const fresh4 = await settled(() => bypassRowsAfter(before4Id));
check('4. an unserved write still leaves its row', 1, fresh4.length);
{
  const rows4 = fresh4.filter((r) => r.path === '/admin-api/crm/contract/definitely-not-an-endpoint');
  const row = rows4[rows4.length - 1];
  check('4. the row keeps the wire status', notFound.status, row?.httpStatus);
  check('4. the row keeps the envelope code', notFound.json?.code, row?.resultCode);
}

// ── 5 · 登录不留行 ──────────────────────────────────────────────────────────────────────────────────
// Credentials are never recorded: a copy of a password in a readable table is a leak in itself.
const before5 = countSince();
await api('/system/auth/login', { method: 'POST', body: { username: ADMIN_USER, password: 'not-the-password' } });
check('5. a login attempt leaves no bypass row', before5, await settled(countSince));

// ── 6 · 受治理的那条路不重行 ───────────────────────────────────────────────────────────────────────
// The governed tool path runs in-process; the conversation route is `/admin/`, not `/admin-api/`. Neither
// crosses the trail, so this is zero rows by shape — not by de-duplicating afterwards.
const before6 = countSince();
await api('/ai/chat/stream', { method: 'POST', token, base: '/admin', body: { message: marker } });
check('6. the conversation route leaves no bypass row', before6, await settled(countSince));

// ── 7 · 开关关闭 ⇒ 零行且行为不变 ──────────────────────────────────────────────────────────────────────
// 开关的语义是「不装」：`keelbase.bypass-audit.enabled=false` 时过滤器根本不注册，于是一次写既不留行、也与
// 开着时行为一样。只有这一条要第二个宿主，故门禁自己起、并在每条退出路径上停掉它 —— 留一个监听者会让下一次跑
// 绑不上端口。
//
// The switch means "not installed": with `keelbase.bypass-audit.enabled=false` the filter is never registered,
// so a write leaves no row and behaves exactly as it does with the switch on. This is the one scenario that
// needs a second host, so the gate starts one and stops it on every exit path — a leftover listener would
// block the next run.
offHost = await startOffHost();
const offUp = offHost !== null && await waitForHost(OFF_HOST, offHost);
check('7. the second host (switch off) came up', true, offUp);
if (!offUp) {
  if (offHost === null) {
    console.error('  note  the second host was not started; the pre-flight note above says why');
  } else {
    console.error(`  note  the second host did not come up (exit ${offHost.exitCode ?? 'still running'});`
      + ` see ${join(EVIDENCE, 'off-host.log')}`);
    for (const line of tailOf(join(EVIDENCE, 'off-host.log')).split(/\r?\n/)) {
      console.error(`        ${line}`);
    }
  }
}
try {
  if (offUp) {
    const offToken = await login(OFF_HOST);
    const before7 = countSince();
    const offWrite = await api('/system/dict-data/create', {
      method: 'POST', token: offToken, host: OFF_HOST,
      body: { dictType, label: offMarker, value: offMarker, sort: 0, status: 0 }
    });
    check('7. the write still answered 200 on the wire', 200, offWrite.status);
    check('7. the write still succeeded in the envelope', 0, offWrite.json?.code);
    if (offWrite.json?.code === 0) offCreatedId = offWrite.json.data;
    check('7. the write still landed its row', 1,
      Number(psql(`select count(*) from system_dict_data where value = '${offMarker}'`)));
    // 留痕是异步的；等它稳定，好让「也没有迟到的那一行」同样是一个读数（与其它「没有行」处同一个窗口）。
    // The trail is asynchronous; wait for it to settle so "no late row either" is a reading too — the same
    // window every other "no row" assertion uses.
    check('7. the switch-off write left no bypass row', before7, await settled(countSince));
  }
} finally {
  await stopOffHost();
}

// ── 8 · 流式端点：恰一行、无信封码、正文不读 ─────────────────────────────────────────────────────────
// `/admin-api/ai1/session/message/send-stream` answers through an SseEmitter: no envelope is ever produced, so
// `result_code` is null — and the request body is the user's question, so it is not read. A session id that
// does not exist is enough: the service answers an error event on the stream, which is exactly the shape
// this scenario is about (a streamed answer, not an envelope).
const before8Id = maxRowId();
const streamed = await api('/ai1/session/message/send-stream', {
  method: 'POST', token, accept: 'text/event-stream',
  body: { sessionId: 999999999, content: marker }
});
check('8. the streaming write answered 200 on the wire', 200, streamed.status);
check('8. the answer is an event stream, not an envelope', true,
  (streamed.text ?? '').includes('event:') || (streamed.text ?? '').includes('data:'));
const fresh8 = await settled(() => bypassRowsAfter(before8Id));
check('8. a streaming write leaves exactly one row', 1, fresh8.length);
{
  const rows8 = fresh8.filter((r) => r.path === '/admin-api/ai1/session/message/send-stream');
  const row = rows8[rows8.length - 1];
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
// Three writes were sent to the recording host (one accepted, one refused, one unserved), the streaming write
// is a fourth, and the dict type is one more when the database had none; the switch-off host's write leaves
// nothing — that many rows is the whole reading.
check('10. the run left exactly the writes it made', 4 + (createdType !== null ? 1 : 0),
  await settled(countSince));

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
