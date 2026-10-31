#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 「丁」的场景门：上游自己的 REST 写留一条只记不改的旁路记录，而受治理的工具写不留。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈（或按下文的环境变量指向它）
//   node scripts/run-bypass-audit-scenarios.mjs
//
// 四条断言，每条都用**本次唯一**的标记收束，不按整表计数：
//
//   1. 一次上游 REST 写 ⇒ **恰一行**旁路记录，字段含方法 / 路径 / 业务对象 / 结果码 / 调用方；
//   2. 一次受治理的工具写 ⇒ **零**旁路行（工具路径不经过 `/admin-api`，它直接调服务 bean）；
//   3. 写失败（4xx/5xx）⇒ 仍留一行并带结果码。这里打 `/admin-api/ai/**`：本部署把那个应用面关停，
//      `YudaoAiModuleSurfaceGuard` 对它的写答**真的 HTTP 404**（不是包在 200 里的信封 401 —— 未登录的写
//      在本框架里正是后者，故不用它来量「4xx」）；
//   4. 开关关闭 ⇒ **零行**且请求行为不变 —— 门禁自己拉起第二个宿主（`BYPASS_AUDIT_OFF_PORT`，
//      默认 48098），以 `SPRING_APPLICATION_JSON` 把 `keelbase.bypass-audit.enabled` 关掉。
//
// 旁路行**刻意不回收**：这张表只追加，剪掉自己刚写的行就失去了「可查」的意义。它造的业务行（客户、
// 权限行、副作用、确认单）按标记收回。审计链 `ai_audit_logs` 一个字都不动。
//
// The gate for "丁": upstream's own REST writes leave one record-only bypass row, while governed tool
// writes leave none. Four assertions, each scoped by a **marker unique to this run**:
// one REST write ⇒ exactly one row with method/path/object/result/caller; one governed tool write ⇒ zero
// rows; a failed write still leaves one row with its status; and with the switch off, zero rows and
// unchanged behaviour (the gate starts a second host on `BYPASS_AUDIT_OFF_PORT` with the property off).
//
// Bypass rows are deliberately **not** cleaned up — the table only appends, and cutting a row this run
// just wrote defeats "queryable". The business rows it creates (customers, permissions, effects,
// confirmations) are removed by marker. The `ai_audit_logs` hash chain is never touched.
import { execFileSync, spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
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
const EVIDENCE = process.env.EVIDENCE_DIR
  || join('D:', 'Rain6fish', 'handoff', 'evidence', 'bypass-audit-20261031');

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const checkNot = (name, forbidden, got) =>
  String(got).includes(forbidden) ? bad(name, `must not contain ${forbidden}`, got) : ok(name);
const note = (name, got) => console.log(`  note  ${name} → ${got}`);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

// psql 助手：默认 `docker exec`（与本线其它门禁相同）；`PSQL_HELPER=direct` 直连；没有 psql 客户端时
// 用 `PSQL_HELPER_SCRIPT` 指向 `scripts/psql-helper.mjs`。
//
// The psql helper: `docker exec` by default (the same as this line's other gates); `PSQL_HELPER=direct`
// for a reachable client; `PSQL_HELPER_SCRIPT` for a psql-shaped Node helper on a host with no psql.
const PSQL = process.env.PSQL || 'psql';
const PSQL_HELPER = (process.env.PSQL_HELPER || 'docker').toLowerCase();
const PSQL_HELPER_SCRIPT = process.env.PSQL_HELPER_SCRIPT ? resolve(process.env.PSQL_HELPER_SCRIPT) : '';
const psql = (sql) => {
  if (PSQL_HELPER_SCRIPT) {
    return execFileSync(process.execPath,
      [PSQL_HELPER_SCRIPT, '-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
        '-U', process.env.PGUSER || 'root', '-d', DB, '-tAc', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'password' } }).trim();
  }
  if (PSQL_HELPER === 'docker') {
    return execFileSync('docker',
      ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-U', 'root', '-d', DB, '-tAc', sql],
      { encoding: 'utf8' }).trim();
  }
  if (PSQL_HELPER === 'direct' || PSQL_HELPER === 'local') {
    return execFileSync(PSQL,
      ['-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
        '-U', process.env.PGUSER || 'root', '-d', DB, '-tAc', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'password' } }).trim();
  }
  throw new Error(`PSQL_HELPER must be "docker" or "direct" (got "${PSQL_HELPER}")`);
};

async function apiAt(host, path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${host}/admin-api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'tenant-id': TENANT,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

async function loginAt(host, username, password) {
  const { json } = await apiAt(host, '/system/auth/login', { method: 'POST', body: { username, password } });
  if (json.code !== 0) throw new Error(`login(${username}) -> ${json.code}: ${json.msg}`);
  return json.data.accessToken;
}

async function chat(token, message, extra = {}) {
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId: `gate-bypass-${Date.now()}`, ...extra })
  });
  const json = await res.json();
  return json.data || json;
}

async function confirm(token, confirmationToken, decision) {
  const res = await fetch(`${HOST}/ai/confirmations/${confirmationToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision })
  });
  const json = await res.json();
  return json.data || json;
}

const pendingTokenFor = (operatorId, marker) =>
  psql(`select token from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`
    + ` and args_json like '%${marker}%' order by id desc limit 1`) || undefined;

// 按标记数的旁路行。异步写入，故调用方要轮询；查询只看本次标记，不按整表计数。
// Bypass rows by marker. The write is asynchronous, so callers poll; the query is marker-scoped, never
// a whole-table count.
const bypassRowsFor = (marker) =>
  Number(psql(`select count(*) from keelbase_bypass_audit where coalesce(request_digest, '') like '%${marker}%'`
    + ` or request_url like '%${marker}%'`));

async function eventually(fn, expected, timeoutMs = 10000, stepMs = 250) {
  const end = Date.now() + timeoutMs;
  let last;
  while (Date.now() < end) {
    last = fn();
    if (String(last) === String(expected)) return last;
    await sleep(stepMs);
  }
  return last;
}

function writeOnOffHost(host, marker, token) {
  // 对开关关闭的宿主做一次写：回答必须是同样的成功，客户也必须落库 —— 行为不变。
  // One write against a host whose bypass switch is off: the response must be the same success, and the
  // customer must land — behaviour unchanged.
  return apiAt(host, '/crm/customer/create', {
    method: 'POST', token,
    body: { name: marker, ownerUserId: 1, mobile: '13900000000' }
  });
}

// 夹具的回收语句在**造出行的那一刻**就登记，而不是等到全部断言都过了：中间任何一条断言抛错都不该留下
// 业务行。旁路行不在其中：那张表只追加。
// Cleanup statements are registered **the moment a row is created**, not after every assertion has passed:
// an assertion that throws midway must not leave a business row behind. Bypass rows are not among them —
// that table only appends.
function rememberCustomer(marker) {
  cleanup.push(`delete from crm_permission where biz_type = 2 and biz_id in (select id from crm_customer where name like '%${marker}%')`);
  cleanup.push(`delete from side_effects where result_type = 'crm_customer' and result_id in (select id from crm_customer where name like '%${marker}%')`);
  cleanup.push(`delete from crm_customer where name like '%${marker}%'`);
}

let offServer = null;

function startOffServer() {
  mkdirSync(EVIDENCE, { recursive: true });
  const log = join(EVIDENCE, 'off-server.log');
  const out = openSync(log, 'w');
  console.log(`  note  起第二个宿主（开关关）→ ${OFF_HOST}，日志 ${log}`);
  const child = spawn('bash', ['scripts/run-server.sh'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: OFF_PORT,
      SERVER_ADDRESS: '127.0.0.1',
      PG_HOST: process.env.PG_HOST || '127.0.0.1',
      PG_PORT: process.env.PG_PORT || '54329',
      PG_DB: DB,
      PG_USER: process.env.PG_USER || 'root',
      PG_PASSWORD: process.env.PG_PASSWORD || 'password',
      REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
      REDIS_PORT: process.env.REDIS_PORT || '56389',
      SPRING_APPLICATION_JSON: JSON.stringify({ keelbase: { bypassAudit: { enabled: false } } })
    },
    stdio: ['ignore', out, out]
  });
  closeSync(out);
  return child;
}

function stopOffServer(child) {
  if (process.platform === 'win32') {
    // `run-server.sh` 经过两层才到 Java，故被 spawn 的进程可能已经退了、它起的 JVM 还在听。按进程树杀，
    // **并且**按端口自查一次；否则一次跑完会留下第二个宿主，下一次绑不上端口。
    // `run-server.sh` reaches Java through two extra layers, so the spawned process can be gone while the
    // JVM it started is still listening. Kill by the tree **and** by whoever holds the port; otherwise a
    // finished run leaves a second host behind and the next run cannot bind.
    try {
      if (child && child.pid && child.exitCode === null) {
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      }
    } catch (ignored) {
      // 已经退掉了。 / Already gone.
    }
    try {
      const netstat = execFileSync('netstat', ['-ano'], { encoding: 'utf8' });
      const pids = new Set();
      for (const line of netstat.split(/\r?\n/)) {
        if (line.includes(`:${OFF_PORT}`) && line.includes('LISTENING')) {
          const pid = line.trim().split(/\s+/).pop();
          if (pid && /^\d+$/.test(pid)) pids.add(pid);
        }
      }
      for (const pid of pids) {
        execFileSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
      }
    } catch (ignored) {
      // 没有 netstat，或已经没有可杀的了。 / No netstat, or nothing left to kill.
    }
    return;
  }
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
  }
}

async function waitForHost(host, timeoutMs = 300000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const res = await fetch(`${host}/actuator/health`);
      if (res.status === 200) return true;
    } catch (ignored) {
      // 还没开始监听。 / Not listening yet.
    }
    await sleep(1000);
  }
  return false;
}

// ── 0) 前置 / preflight ──────────────────────────────────────────────────────────────────────
console.log('== 前置 ==');
check('旁路表在（部署种子已灌）', 1, Number(psql(
  "select count(*) from information_schema.tables where table_schema='public' and table_name='keelbase_bypass_audit'")));
const admin = await loginAt(HOST, ADMIN_USER, resolveAdminPassword(psql));
ok(`${ADMIN_USER} 登录`);
const marker = `gate-bypass-${Date.now()}`;
const restMarker = `${marker}-rest`;
const toolMarker = `${marker}-tool`;
const failMarker = `${marker}-fail`;
const offMarker = `${marker}-off`;

const cleanup = [];
process.on('exit', () => {
  try {
    if (cleanup.length) psql(cleanup.join('; '));
    stopOffServer(offServer);
  } catch (e) {
    console.error(`  note  退出路径上的收尾没跑成：${e.message}`);
  }
});

// ── 1) 一次上游 REST 写 ⇒ 恰一行 / one REST write, exactly one row ─────────────────────────────
console.log('== 断言 1 · 一次上游 REST 写恰一行 ==');
{
  const before = bypassRowsFor(restMarker);
  const { status, json } = await apiAt(HOST, '/crm/customer/create', {
    method: 'POST', token: admin,
    body: { name: restMarker, ownerUserId: 1, mobile: '13800000000', email: 'gate@example.com' }
  });
  rememberCustomer(restMarker);
  check('REST 写成功', 0, json.code);
  check('REST 写 HTTP 200', 200, status);

  const rows = await eventually(() => bypassRowsFor(restMarker), 1);
  check('恰一行旁路记录', 1, Number(rows));
  check('此前没有同一标记的行', 0, Number(before));

  const one = (column) => psql(`select coalesce(${column}::text, '<null>') from keelbase_bypass_audit`
    + ` where coalesce(request_digest, '') like '%${restMarker}%' order by id desc limit 1`);
  check('方法 = POST', 'POST', one('request_method'));
  check('路径 = /admin-api/crm/customer/create', '/admin-api/crm/customer/create', one('request_url'));
  check('业务对象 = crm.customer', 'crm.customer', one('business_object'));
  check('动作 = create', 'create', one('action'));
  check('HTTP 结果 = 200', '200', one('result_status'));
  check('信封结果码 = 0', '0', one('result_code'));
  check('调用方 = 管理员', '1', one('user_id'));
  const digest = psql(`select coalesce(request_digest, '') from keelbase_bypass_audit`
    + ` where coalesce(request_digest, '') like '%${restMarker}%' order by id desc limit 1`);
  check('摘要留住业务标记', true, digest.includes(restMarker));
  check('手机号已脱敏', true, digest.includes('***') && !digest.includes('13800000000'));
  check('邮箱已脱敏', true, !digest.includes('gate@example.com'));
  check('夹具已登记回收', true, cleanup.length >= 3);
}

// ── 2) 一次受治理的工具写 ⇒ 零旁路行 / one governed tool write, zero rows ───────────────────────
console.log('== 断言 2 · 一次受治理的工具写零旁路行 ==');
{
  await chat(admin, `新建客户 ${toolMarker}`);
  rememberCustomer(toolMarker);
  cleanup.push(`delete from confirmation_requests where args_json like '%${toolMarker}%'`);
  const token = pendingTokenFor(1, toolMarker);
  checkNot('引擎扣下了这次工具写', 'undefined', token);
  const outcome = await confirm(admin, token, 'approve');
  check('批准后执行', 'executed', outcome.status || JSON.stringify(outcome));
  const landed = await eventually(
    () => Number(psql(`select count(*) from crm_customer where name like '%${toolMarker}%'`)), 1);
  check('工具写真的落库', 1, Number(landed));
  // 写是同步的，旁路写是异步的；给它一个窗口，确认它**没有**迟到。
  // The tool write is synchronous and a bypass write is asynchronous; give it a window to make sure it
  // does **not** arrive late.
  await sleep(1500);
  check('工具写零旁路行', 0, bypassRowsFor(toolMarker));
}

// ── 3) 写失败（4xx）⇒ 仍留一行并带结果码 / a failed write still leaves one row ─────────────────
console.log('== 断言 3 · 写失败仍留一行 ==');
{
  // `/admin-api/ai/**` 在本部署被关停（D52），答的是**真的 HTTP 404** —— 一个在容器层面以 4xx 失败的写，
  // 不是包在 200 里的信封。
  // `/admin-api/ai/**` is switched off at this deployment (D52) and answers a real HTTP 404 — a write
  // that failed with a 4xx at the container's level, not an envelope inside a 200.
  const { status } = await apiAt(HOST, '/ai/chat/message/send', {
    method: 'POST', token: admin, body: { probe: failMarker }
  });
  check('禁用应用面的写答 404', 404, status);
  const rows = await eventually(() => bypassRowsFor(failMarker), 1);
  check('失败也恰一行', 1, Number(rows));
  const one = (column) => psql(`select coalesce(${column}::text, '<null>') from keelbase_bypass_audit`
    + ` where coalesce(request_digest, '') like '%${failMarker}%' order by id desc limit 1`);
  check('结果码 = 404', '404', one('result_status'));
  check('调用方 = 管理员', '1', one('user_id'));
  check('路径仍被记下', '/admin-api/ai/chat/message/send', one('request_url'));
  // 一个附带的读数：未登录的写在本框架里答的是 HTTP 200 + 信封 401，故它不能用来量「4xx/5xx」。
  // An extra reading: an unauthenticated write answers HTTP 200 with an envelope 401 in this framework,
  // so it cannot be used to measure "4xx/5xx".
  const unauth = await apiAt(HOST, '/crm/customer/create', {
    method: 'POST', body: { name: `${marker}-unauth`, ownerUserId: 1 }
  });
  note('未登录写的 HTTP 读数（框架的信封形状）', `${unauth.status} / code ${unauth.json.code}`);
}

// ── 4) 开关关闭 ⇒ 零行且行为不变 / switch off: zero rows, behaviour unchanged ──────────────────
console.log('== 断言 4 · 开关关闭 ⇒ 零行且行为不变 ==');
{
  offServer = startOffServer();
  const up = await waitForHost(OFF_HOST);
  check('第二个宿主起来了（开关关）', true, up);
  if (up) {
    const offToken = await loginAt(OFF_HOST, ADMIN_USER, resolveAdminPassword(psql));
    const { status, json } = await writeOnOffHost(OFF_HOST, offMarker, offToken);
    rememberCustomer(offMarker);
    check('开关关：写仍成功', 0, json.code);
    check('开关关：HTTP 仍 200', 200, status);
    const landed = await eventually(
      () => Number(psql(`select count(*) from crm_customer where name like '%${offMarker}%'`)), 1);
    check('开关关：行为不变（行仍落库）', 1, Number(landed));
    await sleep(1500);
    check('开关关：零旁路行', 0, bypassRowsFor(offMarker));
  }
  stopOffServer(offServer);
}

// ── 收尾 / teardown ───────────────────────────────────────────────────────────────────────────
console.log('== 收尾 ==');
psql(cleanup.join('; '));
cleanup.length = 0;
check('业务夹具已按标记收回', 0, Number(psql(
  `select count(*) from crm_customer where name like '%${marker}%'`)));
note('旁路行保留（只追加台账，不按测试回收）',
  psql(`select count(*) from keelbase_bypass_audit where coalesce(request_digest, '') like '%${marker}%'`));

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
