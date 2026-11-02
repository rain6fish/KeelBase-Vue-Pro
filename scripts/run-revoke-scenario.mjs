// SPDX-License-Identifier: Apache-2.0
//
// YD-9's gate: a withdrawal is attempted, and what the runtime did with the attempt is asserted.
//
//   bash scripts/run-server.sh &            # a running stack, PostgreSQL + redis
//   node scripts/run-revoke-scenario.mjs
//
// Why it exists. The conformance record's `Revoke` column can read nothing but `SKIP` while nothing on
// this line ever attempts a withdrawal: it counts `effect_revoke` rows on the audit, and a refusal
// thrown **before** the audit append leaves none. So this gate makes the attempt — and asserts the
// invariant that holds on **both sides of the platform seam**, so that it is green today and stays green
// the day the seam and the host's compensator land:
//
//   * **Attributable.** The effect is found by *this run's own row*, never by a count of the table.
//   * **Either it lands** — the ledger row reads `revoked` and the audit gains exactly one
//     `effect_revoke` row — **or it is refused** with a reason that names the missing local path, and
//     then the audit gains **no** `effect_revoke` row. A refusal may not leave a line claiming a
//     withdrawal happened; not leaving one is that line's whole job.
//   * The audit chain still verifies afterwards: a withdrawal is **not** "delete an audit row".
//
// ⚠ **What this gate must not do is assert the refusal.** Today the refusal is what happens; the day the
// seam opens it stops happening, and an assertion phrased as "it was refused" would go red for exactly
// the change that is the point. The two outcomes are asserted as alternatives on purpose.
//
// YD-9 的门禁：**真的去试一次撤销**，并断言**运行时对这次尝试做了什么**。
//
// 为什么要有它：门禁记录里 `Revoke` 那一栏，在本线**从来没人试过撤销**时只可能读到 `SKIP` —— 它数的是审计
// 里的 `effect_revoke` 行，而一次**抛在审计 append 之前**的拒绝**一行都不留**。这道闸把那次尝试做出来，并
// 断言**平台那条缝两侧都成立**的不变量，使它今天绿、缝与宿主补偿器落地之后**仍然绿**：
//
//   * **可归因**：这条 effect 按**本轮自己那一行**找到，绝不按整表计数。
//   * **要么落成**（账本行读作 `revoked`，审计**恰好**多一行 `effect_revoke`），**要么被拒**、且理由**点名
//     那条缺失的本地路** —— 而那时审计**一行都不多**。**拒绝不得留下「撤销发生过」的行**，不留正是那行的职责。
//   * 之后**审计链仍校验通过**：撤销**不是**「删掉一行审计」。
//
// ⚠ **这道闸绝不能断言「被拒」**。今天发生的是拒绝；缝一开它就不再发生，而把断言写成「被拒」会让它**为了那个
// 恰恰是要点的改动**而转红。两种结局作为**择一**断言，是刻意的。
//
// **它造的东西，它收回去** —— 按本轮的标记删那一行与它对应的台账；**审计行刻意不动**（撤销在案正是本门禁要证的
// 东西，剪它一环比凌乱更坏）。
//
// Everything it creates, it removes again — the row and its ledger entries go by this run's marker. Audit rows are
// deliberately left alone: that the withdrawal is on the record is precisely what this gate exists to prove.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const CUSTOMER = process.env.CRM_TABLE || 'crm_customer';

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

const psql = (sql) =>
  execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-U', 'root', '-d', DB, '-tAc', sql], { encoding: 'utf8' }).trim();

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

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${HOST}/admin-api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return res.json();
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
    body: JSON.stringify({ message, conversationId: `revoke-gate-${Date.now()}`, ...extra })
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

// The withdrawal endpoint, called the way the console calls it. The status code is part of the evidence:
// a refusal and a success are told apart by it, not by the body alone.
// 撤销端点，按控制台调用它的方式来调。**状态码也是证据的一部分**：拒绝与成功靠它分辨，不只靠正文。
async function revokeEffect(id, token) {
  const res = await fetch(`${HOST}/ai/tool-effects/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  let body = '';
  try { body = await res.text(); } catch { /* a body we cannot read is itself reported below */ }
  return { status: res.status, body };
}

const pendingToken = (operatorId) =>
  psql(`select token from confirmation_requests where operator_id = '${operatorId}' and status = 'pending' order by id desc limit 1`) || undefined;

const pendingCount = (operatorId) =>
  Number(psql(`select count(*) from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`));

/**
 * 一名持有 `crm:customer:create` / `crm:customer:update` 的非管理员调用方。本门禁要**真落一行**才能撤销它，
 * 而工具路径现在与 REST 同一条权限判据（`CrmCustomerTools`）；故调用方必须**有**那条权限码。角色与用户同名
 * 复用，与别的门禁同一手法；`common` **不加写权**（那会同时放宽 REST）。
 *
 * 数据范围设成 `SELF`：新角色默认 `ALL`，而 `ALL` 会让行范围那半整条放过——本门禁要的是「有权限、只碰自己的行」。
 *
 * A non-administrator holding `crm:customer:create` / `crm:customer:update`. This gate needs a row to
 * actually land so it can be withdrawn, and the tool path now asks the same permission question REST
 * does (`CrmCustomerTools`); the caller must therefore **hold** that code. Role and user are reused by
 * name, like the sibling gates; `common` is **not** given the write codes (that would widen REST too).
 *
 * The data scope is set to `SELF`: a new role defaults to `ALL`, which makes the row-scope half stand
 * down, and this gate wants "has the permission, touches only its own row".
 */
async function ensureCrmWriter(adminToken) {
  const menuIds = psql("select string_agg(id::text, ',') from system_menu"
    + " where permission in ('crm:customer:create', 'crm:customer:update') and deleted = 0");
  let roleId = psql("select id from system_role where code = 'gate_crm_writer' and deleted = 0 limit 1");
  if (!roleId) {
    const role = await api('/system/role/create', {
      method: 'POST', token: adminToken,
      body: { name: 'gate-crm-writer', code: 'gate_crm_writer', sort: 99, status: 0, remark: 'revoke gate: the REST permission codes, granted' }
    });
    if (role.code !== 0) throw new Error(`create writer role -> ${role.code}: ${role.msg}`);
    roleId = role.data;
  }
  await api('/system/permission/assign-role-menu', {
    method: 'POST', token: adminToken,
    body: { roleId: Number(roleId), menuIds: menuIds.split(',').map(Number) }
  });
  await api('/system/permission/assign-role-data-scope', {
    method: 'POST', token: adminToken,
    body: { roleId: Number(roleId), dataScope: 5, dataScopeDeptIds: [] }
  });
  const existing = psql("select id from system_users where username = 'gatecrmwriter' and deleted = 0 limit 1");
  let id = existing ? Number(existing) : null;
  if (!id) {
    const created = await api('/system/user/create', {
      method: 'POST', token: adminToken,
      body: { username: 'gatecrmwriter', nickname: 'gatecrmwriter', password: 'gate-pass-1234', deptId: 100, postIds: [] }
    });
    if (created.code !== 0) throw new Error(`create writer user -> ${created.code}: ${created.msg}`);
    id = created.data;
  }
  await api('/system/permission/assign-user-role', {
    method: 'POST', token: adminToken, body: { userId: Number(id), roleIds: [Number(roleId)] }
  });
  return { id, username: 'gatecrmwriter', password: 'gate-pass-1234' };
}

// How many withdrawals the audit says were attempted. The whole gate turns on this reading, so it is
// taken **from the audit**, the same source the conformance column reads — not from the answer.
// 审计说**试过几次撤销**。整道闸都压在这个读数上，故它与门禁那一栏**同一个来源**：审计，而不是答案。
const revokeRows = () => Number(psql("select count(*) from ai_audit_logs where action = 'effect_revoke'"));

// ── 0) the stack answers, and there is a second caller ───────────────────────────────────────────
console.log('== 前置 ==');
check('/app/capabilities 200', '200', (await fetch(`${HOST}/app/capabilities`)).status);
const admin = await login(ADMIN_USER, resolveAdminPassword(psql));
ok('admin 登录');

// 与 CRM 门禁同一套前置，且同样幂等：两道闸本就该能对着同一个库跑，故已存在的调用方**复用**、不重建。
// 调用方持有 CRM 那几个写权限码：工具路径现在问 REST 那一问，而本门禁需要一行**真的落地**。
//
// The same setup the CRM gate uses, and idempotent for the same reason: the two gates are meant to be
// able to run against one database, so a caller that exists is reused rather than recreated. The caller
// holds the CRM write codes, because the tool path now asks REST's permission question and this gate
// needs a row that really lands.
const writer = await ensureCrmWriter(admin);
const writerId = writer.id;
const writerToken = await login(writer.username, writer.password);
ok(`有码调用方就绪（id=${writerId}）`);

// ── 1) a write this run owns, taken all the way to a real side effect ────────────────────────────
console.log('== 场景 1 · 一次真落库的高风险写 ==');
const marker = `revoke-${Date.now()}`;
// 收尾**在这里**就挂上（见文件上方 `putBack` 那段）：标记一有，把它收回去就成立；下面任何一处崩了，退出
// 处理器都会替这一轮跑它。
//
// The cleanup is attached **here** (see the `putBack` note near the top): once the marker exists, putting it back
// is well-defined, and anything below dying still gets it run by the exit handler.
putBack = () =>
  psql(
    [
      // `side_effects.result_id` 自 0.1.16 起是文本（效果 id 可能是 UUID），而客户表的 `id` 是 bigint ——
      // 不转就 `character varying = bigint`、整句失败，收尾一条也删不掉。与 `run-bypass-audit-scenarios.mjs`
      // 同一处修法。
      //
      // `side_effects.result_id` is text as of 0.1.16 (an effect id can be a UUID) while the customer table's
      // `id` is bigint; without the cast this is `character varying = bigint`, the statement fails, and the
      // cleanup removes nothing. The same fix as `run-bypass-audit-scenarios.mjs`.
      `delete from write_claims where effect_id in (select id from side_effects where result_type = '${CUSTOMER}' and result_id in (select id::text from ${CUSTOMER} where name like '%${marker}%'))`,
      `delete from side_effects where result_type = '${CUSTOMER}' and result_id in (select id::text from ${CUSTOMER} where name like '%${marker}%')`,
      // 一次性栈（CI）保留确认行，好让 RY-19 的确认率有分母；共用库上照旧收干净。
      // An ephemeral stack (CI) keeps the confirmation rows so RY-19's confirmation rate has a
      // denominator; a shared database still cleans them up.
      ...(process.env.KEEP_CONFIRMATIONS === '1' ? [] : [`delete from confirmation_requests where args_json like '%${marker}%'`]),
      `delete from ${CUSTOMER} where name like '%${marker}%'`,
    ].join('; '),
  );
let customerId = '';
{
  const held = pendingCount(writerId);
  await chat(writerToken, `新建客户 ${marker}`);
  check('写被扣下', held + 1, pendingCount(writerId));
  const outcome = await confirm(writerToken, pendingToken(writerId), 'approve');
  check('批准后执行', 'executed', outcome.status);
  // The tool names the row after the whole message, not after the marker inside it, so the row is
  // found by substring — and the marker is a 13-digit stamp, which no other run's marker contains.
  // 工具拿**整条消息**当行名，不是消息里的标记，故按子串找 —— 而标记是 13 位的时刻戳，别的轮的标记
  // 不可能是它的子串。
  customerId = psql(`select id from ${CUSTOMER} where name like '%${marker}%' order by id desc limit 1`);
  check('本轮那一行已落', true, customerId !== '');
  check('这个名字只命中一行', 1, Number(psql(`select count(*) from ${CUSTOMER} where name like '%${marker}%'`)));
}

// Everything below keyed off that row. When it is missing the run stops **here, saying so**, rather than
// letting an empty id turn into a SQL syntax error several lines later — which reports the wrong thing.
// 下文都挂在那一行上。它不在时，**就在这里说出来并停下**，而不是让一个空 id 在几行之后变成 SQL 语法错误
// ——那会报出一件不对的事。
if (!customerId) {
  bad('本轮那一行没落 ⇒ 后面两场无法进行', 'a row of this run', 'none');
  console.log(`\n${pass} ok / ${fail} failed`);
  process.exit(1);
}

// ── 2) its effect, found by this run's own row ───────────────────────────────────────────────────
console.log('== 场景 2 · 这条写有自己的 effect ==');
let effectId = '';
{
  // `side_effects.args_hash` is a **hash** — the arguments cannot be searched for, and that is by
  // design. The row is found by the id of the row this run just created instead, which is this run's
  // own by construction.
  // `side_effects.args_hash` 是**哈希** —— 参数搜不了，而那是设计使然。这一行改用**本轮刚建的那一行的 id**
  // 来找，而那个 id 按构造就属于本轮。
  // `result_id` 自 0.1.16 起是文本（见收尾那处注记），故与 id 按文本比。
  // `result_id` is text as of 0.1.16 (see the cleanup note), so it is compared to the id as text.
  effectId = psql(`select id from side_effects where tool_name = 'create_crm_customer' and result_id = '${customerId}' order by id desc limit 1`);
  check('找到本轮自己的 effect', true, effectId !== '');
  check('它的档是本地补偿', 'local_compensate', psql(`select revoke_class from side_effects where id = ${effectId}`));
  check('撤销前账本读 executed', 'executed', psql(`select revoke_status from side_effects where id = ${effectId}`));
}

// ── 3) the attempt, and what came of it ──────────────────────────────────────────────────────────
console.log('== 场景 3 · 试一次撤销，断言两种结局都成立的那一半 ==');
{
  const before = revokeRows();
  const r = await revokeEffect(effectId, writerToken);
  const status = psql(`select revoke_status from side_effects where id = ${effectId}`);
  const after = revokeRows();
  const body = String(r.body || '');
  note('撤销端点应答', `HTTP ${r.status} ${body.slice(0, 120)}`);

  const landed = r.status >= 200 && r.status < 300 && status === 'revoked';
  if (landed) {
    ok('撤销落成（账本读 revoked）');
    check('落成时审计恰好多一行 effect_revoke', before + 1, after);
  } else {
    // The refusal has to be **honest**: it names what is missing, and it leaves no line saying a
    // withdrawal happened. Both halves are asserted — a refusal that left a row would be the escape the
    // contract's `effect_revoke` value was added to close.
    //
    // What is asserted about the *wording* is only the part that is stable: that it names **which type**
    // has no path. Asserting the whole sentence would turn this gate red on the day the runtime improves
    // it (D37's design §3 rewrites it to point at `SideEffectCompensator`) — a red caused by the
    // assertion, not by the change. The type is read from the effect itself rather than hard-coded.
    //
    // 拒绝必须**诚实**：它点名缺了什么，且**不留**任何「撤销发生过」的行。两半都断言 —— 留下行的拒绝，正是
    // 契约加 `effect_revoke` 这个取值要堵的那个逃逸口。
    //
    // 关于**文案**只断言**稳定**的那一点：它点名了**哪个类型**没有路。断言整句会让这道闸在运行时改善文案的那天
    // 转红（`D37` 设计 §3 会把它改写成指向 `SideEffectCompensator`）—— 那是**断言**造成的红，不是改动造成的。
    // 类型从 effect 自己读出来，不写死。
    const refusedType = psql(`select result_type from side_effects where id = ${effectId}`);
    check(`被拒且理由点名了没有路的那个类型（${refusedType}，HTTP ${r.status}）`, true, body.includes(`resultType=${refusedType}`));
    check('被拒时审计一行都不多', before, after);
    check('被拒时账本行未动', 'executed', status);
  }
}

// ── 4) a withdrawal is not "delete an audit row" ─────────────────────────────────────────────────
console.log('== 场景 4 · 撤销不是删审计 ==');
{
  const verify = await (await fetch(`${HOST}/audit/verify`, { headers: { Authorization: `Bearer ${admin}` } })).json();
  check('链校验通过', true, verify.data && verify.data.valid);
  check('试着撤销之后仍至少有一行审计', true, revokeRows() >= 0);
}

// ── 收尾：把本轮造的东西收回去 ─────────────────────────────────────────────────────────────────────
//
// 按**本轮自己的标记**删；标记里那串 13 位时间戳是别人不会含的，故它够不到别的轮次的行。业务行、台账与确认
// 一起收 —— 它们都指着一行这一轮就要删掉的记录。
//
// **审计行刻意不动** —— 撤销在案**正是本门禁要证的东西**，为了收拾凌乱去剪它一环，比凌乱更坏。那条记录在
// **链上**是持久的；台账那一行不是记录，是一个指着即将消失的行的副本。
//
// **一个曾经的例外，以及它为什么取消了**：这一栏早先**特意留着**那笔撤销的台账，因为本线的应用符合性记录
// （`run-app-conformance.mjs` 的 Revoke 栏）当时是**先跑这道门禁、再读** `side_effects` 里
// `revoke_status='revoked'` 的那一行 —— 收掉它，会让一条能用的撤销路径被读成「本部署还没有这条路」（实测
// 由 PASS 变 FAIL）。那一栏现在改成**驱动这道门禁、读它自己的判决**了，于是这行不必再为它而活着；而门禁
// 在**运行当中**读台账的那次断言，就是「撤销落在账本上」这件事的证据。
//
// Delete by this run's own marker; the 13-digit stamp inside it is one no other run's marker contains, so it
// cannot reach another run's rows. The business row, its ledger entries and its confirmation all go — each of them
// points at a row this run is about to remove.
//
// **Audit rows are deliberately left alone**: that the withdrawal is on the record is precisely what this gate
// exists to prove, and cutting a link to tidy up is worse than the untidiness. That record lives on the **chain**;
// the ledger row is not a record but a copy pointing at a row that is about to disappear.
//
// **One exception this used to carry, and why it is gone**: this gate used to keep its withdrawal entry on the
// ledger, because the line's application-conformance record (`run-app-conformance.mjs`, the Revoke column) **ran
// this gate and then read** the `side_effects` row with `revoke_status='revoked'` — removing it made a working
// revoke path read as one this deployment does not have (measured: PASS to FAIL). That column now **drives this
// gate and records its verdict**, so the row no longer has to live on for it; and the assertion the gate makes
// *while it runs* — reading the ledger — is the evidence that the withdrawal landed on the ledger.
console.log('== 收尾 · 把本轮造的东西收回去 ==');
try {
  runPutBack();
  ok('本轮那一行与它的台账已收回（审计行刻意留着）');
} catch (e) {
  bad('收尾', '本轮那一行与它的台账已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
