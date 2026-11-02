#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// YD-15's gate: the **third** module, and the first whose owner is not the shape the other two had.
//
//   bash scripts/run-server.sh &            # a running stack, PostgreSQL + redis
//   node scripts/run-notify-message-scenarios.mjs
//
// The module is Yudao's own system module, and the slice is its in-app messages
// (`system_notify_message`) — a row belongs to `(user_id, user_type)`, a pair rather than a column.
//
// **What this gate can and cannot show, said before it is run.** Unlike CRM's and BPM's, this module's
// own "my" queries already filter on the caller's pair, so the row-scope question is answered *by the
// module*. What that means for the assertions here:
//
//   * a **read** is asserted as "the turn ran", read from the trail — the same limit the other gates
//     record, since core 0.1.5's answer carries no `data`;
//   * a **write on the caller's own message** is asserted end to end: held, approved, the row flips;
//   * a **write on someone else's message** ends as a **no-op, not a refusal** — the module's own
//     update filters on the caller's pair, so the row simply does not match. On CRM and BPM the advice
//     raises a denial and that denial lands in the audit; here there is none to land. So what is
//     asserted is that **the other subject's row is untouched**, and the outcome is *noted* rather
//     than assumed to be a refusal;
//   * a **read by id** — the one path upstream leaves unscoped — is asserted as a **positive and a
//     negative together**: the caller's own row reads `-> ok`, another subject's reads as a failure.
//     All four advices at the seam are therefore exercised by this script, each on a path that can be
//     observed on this module.
//
// That difference is the finding, not a gap in the gate: it says the per-module work here collapses
// onto the identity bridge, because upstream's code already had the shape.
//
// YD-15 的门禁：**第三个**模块，也是第一个属主形状与另外两个不同的模块。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-notify-message-scenarios.mjs
//
// 该模块是芋道自己的 system 模块，切片是它的站内信（`system_notify_message`）——一行属于 `(user_id, user_type)`，
// 是**一对**、不是一列。
//
// **本门禁能显示什么、不能显示什么，跑之前就说。**与 CRM、BPM 不同，本模块自己的「我的」查询**已经**按调用方那一对
// 过滤，故**行范围问题是模块自己回答的**。这对这里断言的影响是：
//
//   * **读**断言的是「这一回合跑过了」（从审计轨读）——与其他门禁记的同一个限度，因为 core 0.1.5 的答案不带 `data`；
//   * **对调用方自己的消息的写**端到端断言：扣下、批准、那一行翻转；
//   * **对别人消息的写**收在**静默 no-op、不是拒绝**——模块自己的更新按调用方那一对过滤，故那一行**根本匹配不上**。
//     在 CRM 与 BPM 上切面会抛拒绝、那次拒绝会落进审计；这里**没有可落的**。故断言的是**另一个主体的那一行没动**，而
//     结局是**记下来**的、不是假定为拒绝；
//   * **按 id 读**——上游唯一留着不收束的那条路——**正反一起**断言：调用方自己那一行读作 `-> ok`，另一个主体的读作
//     失败。故本接缝上的**四条通知全部**被本脚本跑到，且各自跑在**本模块上可观测**的一条路上。
//
// 那个差别**就是发现本身**、不是门禁的缺口：它说这里的逐模块活**塌到了身份桥上**，因为上游的代码本来就有那个形状。
//
// **它造的东西，它收回去** —— 按那个**本轮唯一**的标记（`template_content` 里带着它），故收尾够不到别的轮次的行。
// **审计行不在此列**：那是一条哈希链，为了收拾门禁的凌乱去剪断它一环，是比凌乱更坏的一件事。
//
// Everything it creates, it removes again — by that run-scoped marker, which every row it seeds carries in
// `template_content`, so the cleanup cannot reach another run's rows either. It does **not** remove audit
// rows: those are a hash chain, and cutting a link to tidy up after a gate would be a worse act than the
// untidiness.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const SECOND_USER = process.env.SECOND_USER || 'gatesales';
const SECOND_PASS = process.env.SECOND_PASS || 'gate-pass-1234';
const MESSAGE = process.env.NOTIFY_TABLE || 'system_notify_message';
const ADMIN_USER_TYPE = 2; // UserTypeEnum.ADMIN

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const checkNot = (name, forbidden, got) =>
  String(got).includes(forbidden) ? bad(name, `must not contain ${forbidden}`, got) : ok(name);
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

// The helper keeps `docker exec` as its default, unchanged. On a host without Docker, set
// `PSQL_HELPER=direct` (or `local`) to run the client against a PostgreSQL you can reach; `PSQL` names
// that client and the usual PG* variables (PGHOST / PGPORT / PGUSER / PGPASSWORD) select the endpoint.
// `PSQL_HELPER=docker` is the same command this gate has always run.
//
// On a host with **no psql client at all**, set `PSQL_HELPER_SCRIPT` to a psql-shaped Node helper
// (`scripts/psql-helper.mjs` in this repo). It takes precedence over `PSQL_HELPER`: when it is set the
// gate runs `node <script> -h … -p … -U … -d … -tAc <sql>` and never calls docker or psql.
//
// psql 助手默认保持原样（`docker exec`）。没有 Docker 的机器上设 `PSQL_HELPER=direct`（或 `local`）直连
// 一个你能连到的 PostgreSQL；`PSQL` 指定客户端路径，连接信息走常见的 PG* 变量（PGHOST / PGPORT /
// PGUSER / PGPASSWORD）。`PSQL_HELPER=docker` 就是这道门禁一直跑的那条命令。
//
// **机器上根本没有 psql 客户端**时，把 `PSQL_HELPER_SCRIPT` 设成一个 psql 形状的 Node 助手（本仓
// `scripts/psql-helper.mjs`）。它的优先级高于 `PSQL_HELPER`：设了它就只跑
// `node <script> -h … -p … -U … -d … -tAc <sql>`，既不调 docker 也不调 psql。
const PSQL = process.env.PSQL || 'psql';
const PSQL_HELPER = (process.env.PSQL_HELPER || 'docker').toLowerCase();
const PSQL_HELPER_SCRIPT = process.env.PSQL_HELPER_SCRIPT ? resolve(process.env.PSQL_HELPER_SCRIPT) : '';
if (PSQL_HELPER_SCRIPT && !existsSync(PSQL_HELPER_SCRIPT)) {
  throw new Error(`PSQL_HELPER_SCRIPT points to a missing file: ${process.env.PSQL_HELPER_SCRIPT} (resolved ${PSQL_HELPER_SCRIPT})`);
}
const psql = (sql) => {
  if (PSQL_HELPER_SCRIPT) {
    return execFileSync(
      process.execPath,
      [PSQL_HELPER_SCRIPT, '-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
        '-U', process.env.PGUSER || 'root', '-d', DB, '-tAc', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'password' } },
    ).trim();
  }
  if (PSQL_HELPER === 'docker') {
    return execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-U', 'root', '-d', DB, '-tAc', sql], { encoding: 'utf8' }).trim();
  }
  if (PSQL_HELPER === 'direct' || PSQL_HELPER === 'local') {
    return execFileSync(
      PSQL,
      ['-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
        '-U', process.env.PGUSER || 'root', '-d', DB, '-tAc', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'password' } },
    ).trim();
  }
  throw new Error(`PSQL_HELPER must be "docker" or "direct" (got "${process.env.PSQL_HELPER}"); or set PSQL_HELPER_SCRIPT to a psql-shaped helper`);
};

// 崩了也收尾。收尾是**一个函数**，在本轮造出第一行的那一刻挂上（见下面的 `putBack = …`），而不是等文件末尾那段
// 才算 —— 否则「造了行、之后才崩」这条路上它是空的，而那正是实测过的那一种：本线两次门禁崩在收尾之前（一次
// 宿主停机、一次一条查不到的列的断言），后者留下 3 行。`process.on('exit')` 在**未捕获异常**把进程带走时同样
// 触发（2026-10-15 实测：`code=1`），而 `psql()` 是同步的，故退出处理器里跑得动。
//
// Clean up on the way out as well. The cleanup is held as a **function** and attached at the moment this run
// creates its first row (see `putBack = …` below), rather than only being assembled at the end of the file —
// otherwise it is empty on the "created rows, then died" path, which is the one measured twice on this line: two
// runs died before their closing section (a host outage, and an assertion against a column that did not exist),
// the second leaving three rows behind. `process.on('exit')` also fires when an uncaught exception takes the
// process down (measured 2026-10-15: `code=1`), and `psql()` is synchronous, so it runs there.
let putBack = null;
function runPutBack() {
  if (!putBack) return false;
  const putBackOnce = putBack;
  putBack = null; // 先清空：收尾自己出错时也不要让它跑第二遍
  putBackOnce();
  return true;
}
process.on('exit', () => {
  try {
    if (runPutBack()) console.log('  note  收尾走了退出路径（本进程在此之前已经出错）');
  } catch (e) {
    console.error(`  note  退出路径上的收尾没跑成：${e.message}`);
  }
});

// One request, retried **once** when the host answers its transient 500.
//
// The host can fail the first request that follows a write. Measured on 2026-10-14: a
// `permission/assign-user-role` followed immediately by a login answers `{"code":500}`, and **the same
// request sent again** answers `{"code":0}`. Underneath it is a PostgreSQL statement, already closed,
// being handed back out of the connection pool — the deployment's problem, and recorded as such — but a
// gate that is red for it is a gate nobody can read, and every gate here logs in right after assigning
// somebody a role.
//
// Only `500`, only once, and it says so: a business refusal is not retried (a wrong password answers a
// code of its own and still fails on the first try), and the note is printed rather than swallowed — so
// the day this stops happening it shows up as a line nobody sees any more, rather than as a rule nobody
// remembers writing.
//
// 一次请求；宿主答它那个瞬时 500 时**重试一次**。
//
// 这台宿主会弄砸**紧跟一次写之后的第一个**请求。2026-10-14 实测：`permission/assign-user-role` 之后立刻登录
// 答 `{"code":500}`，而**同一个请求再发一次**答 `{"code":0}`。底下是一条**已被关闭**的 PostgreSQL statement
// 从连接池里被重新借出 —— 那是**部署方**的问题、也按部署问题记了账 —— 但一道因它而红的门禁是**没人读得懂**的门禁，
// 而这里每一道门禁都在给某人授了权之后立刻登录。
//
// **只对 500、只试一次，而且说出来**：业务性拒绝不重试（密码错会答它自己的码、第一次就照样失败），而那一行是
// **打印**出来的、不是吞掉的 —— 于是等这个瞬时故障不再发生时，它表现为**一行再也看不到的提示**，而不是一条没人
// 记得写过的规则。
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
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function login(username, password) {
  const r = await api('/system/auth/login', { method: 'POST', body: { username, password } });
  if (r.code !== 0) throw new Error(`login(${username}) -> ${r.code}: ${r.msg}`);
  return r.data.accessToken;
}

async function chat(token, message, extra = {}) {
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId: `gate-${Date.now()}`, ...extra })
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

// The same two reads the other gates use, for the same reported reasons: the caller's confirmation
// centre answers 500 on this host, and the chat answer is the frozen `chat-response` with no `data`.
// 与其他门禁相同的两处读法、同样的理由：调用方的确认中心在本宿主答 500，而聊天答案是冻结的 `chat-response`、不带 `data`。
const pendingToken = (operatorId) =>
  psql(`select token from confirmation_requests where operator_id = '${operatorId}' and status = 'pending' order by id desc limit 1`) || undefined;

const pendingCount = (operatorId) =>
  Number(psql(`select count(*) from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`));

const ranAs = (tool) =>
  Number(psql(`select count(*) from ai_audit_logs where tool = '${tool}' and outcome = 'executed'`));

// ── 0) the stack answers at all ────────────────────────────────────────────────────────────────────
console.log('== 前置 ==');
psql('truncate table ai_audit_logs');
check('/app/capabilities 200', '200', (await fetch(`${HOST}/app/capabilities`)).status);

const admin = await login(ADMIN_USER, resolveAdminPassword(psql));
ok('admin 登录');

console.log('== 前置 · 第二个调用方 ==');
let secondId = psql(`select id from system_users where username = '${SECOND_USER}' and deleted = 0 limit 1`);
if (!secondId) {
  const created = await api('/system/user/create', {
    method: 'POST',
    token: admin,
    body: { username: SECOND_USER, nickname: SECOND_USER, password: SECOND_PASS, deptId: 100, postIds: [] }
  });
  if (created.code !== 0) throw new Error(`create user -> ${created.code}: ${created.msg}`);
  secondId = created.data;
  ok(`建第二个用户 id=${secondId}`);
} else {
  ok(`复用第二个用户 id=${secondId}`);
}
{
  const roles = psql(`select id from system_role where code = 'common' and deleted = 0 limit 1`);
  await api('/system/permission/assign-user-role', { method: 'POST', token: admin, body: { userId: Number(secondId), roleIds: [Number(roles)] } });
}
const second = await login(SECOND_USER, SECOND_PASS);
ok('第二个调用方登录');

// The gate clears its own stale write claims, and says why rather than hiding it. A write is **claimed**
// before it runs and **settled** after; when an approval fails between the two — which is what the
// first run of the bulk scenario did, before its result id was fixed — the claim stays `claimed` and
// the engine then refuses that same call: `409 … the same call is not run twice`. For a
// **parameterless** write the call signature never changes, so a single failed run blocks it for good.
// Clearing this gate's own residue is the same discipline as truncating the audit trail above; the
// behaviour itself is recorded as a finding rather than worked around silently.
// 本门禁先清**自己**残留的写声明，并说出理由、而不是藏着。一个写**先被 claim、跑完再 settle**；当一次批准在两者之间
// 失败——批量那一段的**第一次**运行就是这样（在它的 result id 修好之前）——那条声明就停在 `claimed`，此后引擎拒绝同一个
// 调用：`409 … the same call is not run twice`。而对一个**无参数**的写，调用签名永不变化，故**一次失败的运行就把它永久锁死**。
// 清本门禁自己的残留，与上面 truncate 审计轨是同一条纪律；那条行为本身作为**发现**记下，而不是被默默绕开。
psql(`delete from write_claims where user_id = '${secondId}'`
  + ` and tool_name in ('mark_notify_message_read', 'mark_all_notify_messages_read')`);

// ── the rows, written straight into the module's own table ─────────────────────────────────────────
console.log('== 场景 1 · 上游模块自己的表 ==');
const marker = `gate-${Date.now()}`;
const adminMarker = `${marker}-admin`;
const salesMarker = `${marker}-sales`;
// 收尾**在这里**就挂上（见文件上方 `putBack` 那段）：标记一有，把它收回去就成立；下面任何一处崩了，退出
// 处理器都会替这一轮跑它。把手是**本轮实参里那个行的编号**（`{"id":143}`）—— 那个编号是**本轮自己造的行**，
// 故同样只有本轮够得到；它在**调用时**才查（行在本行下面才插进去）。
//
// The cleanup is attached **here** (see the `putBack` note near the top): once the marker exists, putting it back
// is well-defined, and anything below dying still gets it run by the exit handler. The handle is the **row number
// in this run's arguments** (`{"id":143}`) — a row this run created, so it is just as run-scoped — and it is
// queried **when the cleanup is called**, not here (the rows are seeded below this line).
putBack = () => {
  const runIds = (psql(`select string_agg(id::text, ',') from ${MESSAGE} where template_content like '%${marker}%'`) || '').trim() || '0';
  const idAlt = runIds.split(',').join('|');
  // `side_effects.result_id` is text since runtime 0.1.16 (migration V18); the list must be quoted text.
  // `side_effects.result_id` 自运行时 0.1.16（迁移 V18）起是文本，故这串 id 要以带引号的文本出现。
  const runIdList = runIds.split(',').map((id) => `'${id}'`).join(',');
  psql(
    [
      `delete from confirmation_requests where args_json ~ '"id"[[:space:]]*:[[:space:]]*(${idAlt})([^0-9]|$)'`,
      `delete from write_claims where effect_id in (select id from side_effects where result_id in (${runIdList}))`,
      `delete from side_effects where result_id in (${runIdList})`,
      `delete from ${MESSAGE} where template_content like '%${marker}%'`,
    ].join('; '),
  );
};
// The row's identity is the pair `(user_id, user_type)`, and every NOT NULL column is named here —
// upstream declares a dozen of them on this table.
// 行的身份是 `(user_id, user_type)` **这一对**，而每个 NOT NULL 列都在这里点名——上游在这张表上声明了十来个。
const seed = (userId, text) =>
  psql(`insert into ${MESSAGE}(id, user_id, user_type, template_id, template_code, template_type,`
    + ` template_nickname, template_content, template_params, read_status, create_time, update_time, deleted, tenant_id)`
    + ` values (nextval('${MESSAGE}_seq'), ${userId}, ${ADMIN_USER_TYPE}, 0, 'gate', 1,`
    + ` 'Gate', '${text}', '{}'::jsonb, false, now(), now(), 0, ${TENANT})`);
seed(1, adminMarker);
seed(Number(secondId), salesMarker);
const adminRowId = psql(`select id from ${MESSAGE} where template_content = '${adminMarker}'`);
const salesRowId = psql(`select id from ${MESSAGE} where template_content = '${salesMarker}'`);
check('admin 那一行已种', true, adminRowId !== '');
check('第二个调用方那一行已种', true, salesRowId !== '');
// `read_status` is a **boolean** column, and `psql -tA` prints it `t` / `f` — normalised here so the
// assertion reads as the true/false it means rather than as the driver's spelling of it.
// `read_status` 是 **boolean** 列，而 `psql -tA` 打的是 `t` / `f`——在这里归一化，好让断言读起来是它表示的
// true/false，而不是驱动对它的拼法。
const readStatusOf = (id) => {
  const value = psql(`select read_status from ${MESSAGE} where id = ${id}`);
  return value === 't' || value === 'true';
};

console.log('== 场景 2 · 身份传递与读侧收窄：断页的内容，不只数调用次数 ==');
{
  // 前半断言的是这一回合**跑过了**（从审计轨读）——证明**路由**。它**不**证明收窄：这个计数与页里有什么无关。
  //
  // 后半断**页的内容**，从模块自己的「我的」分页端点读（`/system/notify-message/my-page`）：它与工具走的是
  // **同一个** `getMyMyNotifyMessagePage`，而收窄（`user_id` + `user_type` 那一对）在模块的查询里。三条都要断：
  // 只断「乙的页里没有甲那一行」，一处根本没种甲那行的夹具也会绿；只断「甲的页里有那一行」，收窄失效也绿；
  // 第三条（乙的页里有自己那一行）挡住「页整个空着」。
  //
  // **这条断言守的是什么。** 工具自己把调用方传进去（`getMyMyNotifyMessagePage(query, caller, type)`），切面的那条
  // 通知只是把任意路径带来的那一对钉回调用方。故反向实验改**工具**的身份实参：那才是「读没有按调用方收窄」在页上
  // 的样子。
  //
  // The first half asserts the turn **ran** (from the trail) — which proves **routing**. It does **not** prove
  // the narrowing: that count says nothing about what the page held.
  //
  // The second half asserts the **page's content**, read from the module's own "my" page endpoint
  // (`/system/notify-message/my-page`): it and the tool cross the **same** `getMyMyNotifyMessagePage`, and the
  // narrowing (the `user_id` + `user_type` pair) lives in the module's query. All three checks are required —
  // the first alone is green on a fixture that never seeded the row, the second alone is green with the scoping
  // gone, and the third blocks a page that is empty entirely.
  //
  // **What this assertion holds.** The tool passes the caller itself (`getMyMyNotifyMessagePage(query, caller,
  // type)`); the advice only pins whatever arbitrary path carries back to the caller. The negative experiment
  // therefore changes the **tool's** identity argument: that is what "the read is not scoped to the caller"
  // looks like from the page.
  const a = await chat(admin, '我的消息');
  check('admin 触发站内信工具', 'list_my_notify_messages', (a.toolCalls || [])[0]);
  check('admin 的执行状态（审计轨）', 1, ranAs('list_my_notify_messages'));

  const s = await chat(second, '我的消息');
  check('第二个调用方触发同一个工具', 'list_my_notify_messages', (s.toolCalls || [])[0]);
  check('它的执行状态（审计轨）', 2, ranAs('list_my_notify_messages'));

  const pageOf = (token) => api('/system/notify-message/my-page?pageSize=100', { token });
  const idsOn = (answer) => (((answer || {}).data || {}).list || []).map((row) => String(row.id));
  const adminPage = await pageOf(admin);
  const secondPage = await pageOf(second);
  check('甲的页取到了', 0, adminPage.code);
  check('乙的页取到了', 0, secondPage.code);
  check('甲的页里有甲那一行（夹具确实种了它）', true, idsOn(adminPage).includes(String(adminRowId)));
  check('乙的页里没有甲那一行（收窄真的发生了）', false, idsOn(secondPage).includes(String(adminRowId)));
  check('乙的页里有乙自己那一行（页不是空着蒙对的）', true, idsOn(secondPage).includes(String(salesRowId)));
}

console.log('== 场景 3 · 高风险写入被扣下，批准后落库 ==');
{
  const held = pendingCount(secondId);
  // The row travels as `customerId` — the runtime's one structured slot, named for CRM (see the BPM
  // face for the same recorded workaround).
  // 那一行以 `customerId` 传递——运行时唯一的结构化槽位、以 CRM 命名（同样的绕法见 BPM 那个面）。
  await chat(second, '标记已读', { customerId: Number(salesRowId) });
  check('写被扣下', held + 1, pendingCount(secondId));
  check('未改（仍是未读）', false, readStatusOf(salesRowId));
  const proposedToken = pendingToken(secondId);
  checkNot('扣下时给出 token', 'undefined', proposedToken);

  const outcome = await confirm(second, proposedToken, 'approve');
  check('批准后执行', 'executed', outcome.status);
  check('已标为已读', true, readStatusOf(salesRowId));
}

console.log('== 场景 4 · 越权写：这里没有拒绝可挣 ==');
{
  // Same call, against another subject's message. **The module's own update filters on the caller's
  // pair**, so the row does not match and nothing is refused — the call runs and changes not one row.
  // The assertion is therefore that the other row is untouched, not that something was denied.
  // 同一次调用、打向**另一个主体**的消息。**模块自己的更新按调用方那一对过滤**，故那一行匹配不上、也就没有被拒——
  // 调用跑了、一行未改。故断言的是**那一行没动**，而不是「有东西被拒了」。
  const hijackHeld = pendingCount(secondId);
  await chat(second, '标记已读', { customerId: Number(adminRowId) });
  check('别人的消息也被扣下', hijackHeld + 1, pendingCount(secondId));
  const hijackDone = await confirm(second, pendingToken(secondId), 'approve');
  note('越权写批准后的结局（本模块预期是 no-op，不是拒绝）', hijackDone.status || JSON.stringify(hijackDone).slice(0, 120));
  check('别人的消息一字未动', false, readStatusOf(adminRowId));
}

console.log('== 场景 5 · 第二种实参形状的那条通知：全部标记已读 ==');
{
  // The pair at `args[0..1]` — a *second* advice, because upstream put it in a different place than
  // the one scenario 3 exercises. It is reachable at all only because this face declares a tool for
  // it; before that it was code no test had run. The write is visible in the table, which is what
  // makes the advice observable: the caller's unread rows all flip, and the administrator's do not.
  // `args[0..1]` 上那一对——**第二条**通知，因为上游把它放在与情境 3 所跑的那条**不同的位置**。它之所以够得到，
  // 只因本面为它声明了一个工具；在那之前，它是**没有测试跑过的代码**。这个写**在表里看得见**，那正是让这条通知可观测
  // 的东西：调用方的未读行全部翻转，而管理员的不动。
  const unreadOf = (userId) => Number(psql(`select count(*) from ${MESSAGE}`
    + ` where user_id = ${userId} and user_type = ${ADMIN_USER_TYPE} and read_status = false and deleted = 0`));
  seed(Number(secondId), `${marker}-sales2`); // so "all" has a row to flip on its own
  const beforeSecond = unreadOf(secondId);
  const beforeAdmin = unreadOf(1);
  check('调用方此刻有未读可翻', true, beforeSecond >= 1);

  const held = pendingCount(secondId);
  await chat(second, '全部标记为已读');
  check('写被扣下', held + 1, pendingCount(secondId));
  const done = await confirm(second, pendingToken(secondId), 'approve');
  check('批准后执行', 'executed', done.status);
  check('调用方的未读清零', 0, unreadOf(secondId));
  check('管理员的未读未动', beforeAdmin, unreadOf(1));
}

console.log('== 场景 6 · 按 id 读：自己的读得到，别人的读不到 ==');
{
  // The pair of assertions the withhold can actually be shown by: the same tool, the same caller, one
  // row that is the caller's and one that is not. "Readable" is read from the trail as `-> ok`, and
  // "not readable" as a failure, because `get_notify_message` turns the withheld nothing into
  // `ToolResult.fail` — the only form of it the platform puts where a test can read it.
  // 收束**真正能被显示出来**的那一对断言：同一个工具、同一个调用方，一行是它的、一行不是。「读得到」从审计轨读作
  // `-> ok`，「读不到」读作失败——因为 `get_notify_message` 把被扣下的那个「什么都不」变成了 `ToolResult.fail`，
  // 那是平台**唯一**会放到测试读得到的地方的那个形式。
  const okCount = () => ranAs('get_notify_message');
  // The engine's spelling, read off the trail rather than assumed: a `ToolResult.fail` lands as
  // `<tool> -> fail: <error>`, not as `-> failed`.
  // 引擎的拼法，从审计轨上读来的、不是假定的：`ToolResult.fail` 落成 `<tool> -> fail: <error>`，不是 `-> failed`。
  const failedCount = () =>
    Number(psql("select count(*) from ai_audit_logs where tool = 'get_notify_message' and outcome = 'failed'"));

  const okBefore = okCount();
  await chat(second, '打开这条消息', { customerId: Number(salesRowId) });
  check('读自己的那一行 -> ok', okBefore + 1, okCount());

  const failedBefore = failedCount();
  await chat(second, '打开这条消息', { customerId: Number(adminRowId) });
  check('读别人的那一行读不到（记录在案）', failedBefore + 1, failedCount());
  check('读别人的那一次没有记成 ok', okBefore + 1, okCount());
}

console.log('== 场景 7 · 审计链 ==');
{
  const rows = Number(psql('select count(*) from ai_audit_logs'));
  check('审计行在（>0）', true, rows > 0);
  const verify = await (await fetch(`${HOST}/audit/verify`, { headers: { Authorization: `Bearer ${admin}` } })).json();
  check('链校验通过', true, verify.data && verify.data.valid);
  // No **refusal** is asserted, and that is the point: this module answers the row question itself, so
  // a cross-subject write is a no-op rather than a denial on the record. What the withhold on the
  // by-id read leaves behind is a *failure*, not a refusal — asserted in scenario 6, and counted here.
  // **不**断言**拒绝**，而那正是要点：本模块自己回答了行范围那一问，故跨主体的写是**静默 no-op**、不是一条拒绝记录。
  // 按 id 读的收束留下的是**失败**、不是拒绝——它在情境 6 被断言，在这里被计数。
  note('写路径上没有拒绝可记', `refusals on record = ${psql("select count(*) from ai_audit_logs where tool = 'mark_notify_message_read' and outcome = 'refused'")}`);
  note('按 id 读的收束在案', `get_notify_message -> fail = ${psql("select count(*) from ai_audit_logs where tool = 'get_notify_message' and outcome = 'failed'")}`);
}

// ── 收尾：把本轮造的东西收回去 ─────────────────────────────────────────────────────────────────────
//
// 按**本轮自己的标记**删（`template_content` 里都带着它），故够不到别的轮次的行 —— 与上面那些断言是同一条
// 纪律。**审计行刻意不动**：哈希链，为收拾凌乱去剪它一环，比凌乱更坏。
//
// Delete by this run's own marker — every row this gate seeds carries it in `template_content` — so it cannot
// reach another run's rows, the same discipline the assertions above follow. The audit rows are deliberately
// left alone: that is a hash chain, and cutting a link to tidy up after a gate is a worse act than the
// untidiness.
console.log('== 收尾 · 把本轮造的行收回去 ==');
try {
  // 把手：`mark_notify_message_read` 的实参里带的是**行的编号**（`{"id":143}`），而那个编号是本轮自己
  // 造的行，故它同样只有本轮够得到；台账按这些编号收。
  //
  // **有一笔收不到的，说出来而不是装作收干净了**：`mark_all_notify_messages_read` 的实参只有
  // `{"requestedAt": …}`（那是为了让它可以被调用**不止一次**才加的），而它那条副作用落的是
  // `notify_mailbox` + **调用方自己的编号** —— 都不是本轮造的行。⇒ 每次跑会留下一行副作用与一行已决的
  // 确认。要收它就得按「调用方 + 时间窗」删，而那会**删掉并排另一次运行的**行 —— 那正是本门禁上面那些
  // 断言刻意免疫的东西，故这里选择留一行、不换掉那条性质。
  //
  // The handle: `mark_notify_message_read`'s arguments carry the **row's number** (`{"id":143}`), and that
  // number names a row this run created, so it is just as run-scoped; the ledgers go by those numbers.
  //
  // **One write this cannot reach, said rather than papered over**: `mark_all_notify_messages_read`'s
  // arguments carry only `{"requestedAt": …}` (added so it can run more than once), and its effect lands on
  // `notify_mailbox` with the **caller's own number** — neither names a row this run made. So each run leaves
  // one effect row and one decided confirmation behind. Reaching them would mean deleting by caller and time
  // window, which would delete a **side-by-side run's** rows — exactly what the assertions above are built to
  // survive. So one row is left instead of trading that property away.
  runPutBack();
  ok('本轮那几行已收回（审计行刻意留着；`mark_all` 那一笔见注释）');
} catch (e) {
  bad('收尾', '本轮那几行已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
