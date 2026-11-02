#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// The gate for **KeelBase's own path with a real model on it** — the half `YD-3 ③` left open when the
// model-driven multi-step was first run, because that run went over the *host's* AI path (`ai1`) and
// KeelBase's `/ai/chat` still answered from the runtime's rule-based planner.
//
//   KEELBASE_MODEL_API_KEY=… bash scripts/run-server.sh &   # the host, with the loop switched on
//   node scripts/run-model-loop-scenarios.mjs
//
// The host carries the runtime's two seams and an adapter that plugs into them — `keelbase4j-springai`
// implements `ToolCallPlanner` (`/ai/chat`) and `TaskRunner` (`/ai/task`). Both activate off a
// `ChatClient.Builder`, and this host's own `application.yaml` switches that bean **off** on purpose,
// so `run-server.sh` turns it back on only when a key is handed to it. This gate therefore **needs a
// host started that way**: against one started the ordinary way, `/ai/chat` answers with
// `provider: deterministic` and the first assertion says so instead of pretending otherwise.
//
// What it asserts is the pair that makes the loop worth having, and neither half alone would:
//
//   * the **model** chose the tool on `/ai/chat` — `provider: spring-ai`, a real round trip, not the
//     rule that matched a keyword;
//   * a task on `/ai/task` took **more than one step**, and the step that writes came back **held for a
//     person, with its token** — a runner decides what to call and in what order, never whether it may
//     run, so `create_crm_customer` reaches the engine and is stopped there rather than decided by the
//     model. The gate declines that token and checks the row never landed.
//
// YD-3 ③ 留下的那一半：**KeelBase 自己那条路径上带真模型**。第一版的多步跑在**宿主自己的** AI 路径（`ai1`）上，
// 而 KeelBase 的 `/ai/chat` 仍由运行时的规则版 planner 作答。
//
//   KEELBASE_MODEL_API_KEY=… bash scripts/run-server.sh &   # 宿主，模型回路已打开
//   node scripts/run-model-loop-scenarios.mjs
//
// 宿主带着运行时那两条缝，以及插进它们的一个适配器——`keelbase4j-springai` 实现 `ToolCallPlanner`
// （`/ai/chat`）与 `TaskRunner`（`/ai/task`）。两者都靠 `ChatClient.Builder` 激活，而**宿主自己的
// `application.yaml` 故意关掉了那个 bean**，所以 `run-server.sh` 只在给了 key 时才把它打开。故本门禁**要求宿主
// 是按那种方式起的**：按平常方式起的宿主，`/ai/chat` 会答 `provider: deterministic`，第一条断言就**如实说出来**，
// 不假装。
//
// 断言的是让这条回路值得存在的那一对，缺哪一半都不够：
//
//   * `/ai/chat` 上是**模型**选的工具——`provider: spring-ai`、一次真的往返，不是匹配关键词的那条规则；
//   * `/ai/task` 上的一次任务走了**不止一步**，而**要写**的那一步回来时是**被扣下等人、带着它的 token**——
//     运行器决定**调什么、按什么顺序**，从不决定**能不能跑**，所以 `create_crm_customer` 到达引擎、在那里被拦住，
//     而不是由模型决定。本门禁把那枚 token 拒掉，并检查那一行**始终没落**。
//
// **它留下的那一笔待确认，它收回去** —— 实参里带着本轮的标记，故够不到别的轮次的行。业务行今天一行都不落
// （两处断言都是 `count = 0`），收尾那句仍然写上，好让「哪一轮真落了」也不至于漏收。**审计行刻意不动**。
//
// The one **pending write** it leaves behind, it removes again — its arguments carry this run's marker, so the
// delete cannot reach another run's rows. No business row lands today, but the delete is written anyway so that
// a run which somehow does land one is not silently left out. Audit rows are deliberately left alone.
import { execFileSync } from 'node:child_process';
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const API = `${HOST}/admin-api`;
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const TENANT = process.env.TENANT_ID || '1';
const CUSTOMER = process.env.CRM_TABLE || 'crm_customer';

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));

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
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return res.json();
}

// ── 0) the stack ─────────────────────────────────────────────────────────────────────────────────
console.log('== 前置 ==');
check('/app/capabilities 200', 200, (await fetch(`${HOST}/app/capabilities`)).status);
const login = await api('/system/auth/login', { method: 'POST', body: { username: ADMIN_USER, password: resolveAdminPassword(psql) } });
check('admin 登录', 0, login.code);
const admin = login.data.accessToken;

// ── 1) whose planner answered on KeelBase's own path ─────────────────────────────────────────────
console.log('== 场景 1 · /ai/chat 上是模型，不是规则 ==');
const chat = await (await fetch(`${HOST}/ai/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
  body: JSON.stringify({ message: '列出客户', conversationId: `modelgate-${Date.now()}` })
})).json();
{
  const d = chat.data || chat;
  if (d.provider === 'deterministic') {
    bad('planner 是模型版', 'spring-ai', `deterministic — 宿主是按平常方式起的；用 KEELBASE_MODEL_API_KEY=… bash scripts/run-server.sh 起它`);
  } else {
    check('planner 是模型版', 'spring-ai', d.provider);
  }
  check('模型真的选了这个工具', true, (d.toolCalls || []).includes('list_crm_customers'));
}

// ── 2) a task that takes more than one step, over this line's own path ───────────────────────────
console.log('== 场景 2 · /ai/task 走多步，写那一步被扣下 ==');
const marker = `modelgate-${Date.now()}`;
// 收尾**在这里**就挂上（见文件上方 `putBack` 那段）：标记一有，把它收回去就成立；下面任何一处崩了，退出
// 处理器都会替这一轮跑它。
//
// The cleanup is attached **here** (see the `putBack` note near the top): once the marker exists, putting it back
// is well-defined, and anything below dying still gets it run by the exit handler.
putBack = () =>
  psql(
    [
      `delete from write_claims where effect_id in (select id from side_effects where result_type = '${CUSTOMER}' and result_id in (select id::text from ${CUSTOMER} where name like '%${marker}%'))`,
      `delete from side_effects where result_type = '${CUSTOMER}' and result_id in (select id::text from ${CUSTOMER} where name like '%${marker}%')`,
      `delete from confirmation_requests where args_json like '%${marker}%'`,
      `delete from ${CUSTOMER} where name like '%${marker}%'`,
    ].join('; '),
  );
const task = await (await fetch(`${HOST}/ai/task`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
  body: JSON.stringify({ message: `做两件事：第一，列出客户；第二，新建一个客户叫 ${marker}` })
})).json();
const run = task.data || task;
let token = '';
{
  check('多步路径在位（available）', true, run.available === true);
  const steps = Array.isArray(run.steps) ? run.steps : [];
  check('走了不止一步', true, steps.length >= 2);
  check('第一步是列表', 'list_crm_customers', steps[0] && steps[0].tool);
  // The write is the half that matters: it must reach the engine and be held there, with a token —
  // a run that could decide its own writes would answer `executed` instead.
  // 要紧的是**写**那一半：它必须到达引擎、在那里被扣下，并带回 token——一次能自己决定写不写的运行会答 `executed`。
  token = run.pendingToken || '';
  check('写那一步被扣下、带回 token', true, token !== '');
  check('它没有被执行', 0, psql(`select count(*) from ${CUSTOMER} where name like '%${marker}%'`));
}

// ── 3) a person refuses it, and the row still never lands ────────────────────────────────────────
console.log('== 场景 3 · 人拒绝之后，那一行仍然不落 ==');
if (token) {
  const decided = await (await fetch(`${HOST}/ai/confirmations/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
    body: JSON.stringify({ decision: 'decline' })
  })).json();
  const outcome = decided.data || decided;
  check('拒绝被受理', true, outcome.status !== 'executed');
  check('拒绝之后那一行仍不落', 0, psql(`select count(*) from ${CUSTOMER} where name like '%${marker}%'`));
}

// ── 收尾：把本轮造的东西收回去 ─────────────────────────────────────────────────────────────────────
//
// 本门禁**刻意不让那一行落库**（两处断言都是 `count = 0`），所以它留下的是**那一笔待确认**（实参里带着本轮的
// 标记），不是业务行。业务行那一句仍然写上：它今天空着跑（本轮的标记一行都不在），但如果哪一轮真落了，
// 收尾不该跟着一起失灵。台账同理。
// **审计行刻意不动** —— 那是一条哈希链，为了收拾凌乱去剪断它一环，是比凌乱更坏的一件事。
//
// This gate **deliberately keeps the row from landing** (both assertions are `count = 0`), so what it leaves
// behind is the **pending write** — whose arguments carry this run's marker — rather than a business row. The
// business-row delete is still written: today it matches nothing for this run, but if a run ever does land a row
// the cleanup should not be the thing that silently fails to notice. Same for the ledgers. Audit rows are
// deliberately left alone: that is a hash chain, and cutting a link to tidy up is worse than the untidiness.
// been made is a record.
console.log('== 收尾 · 把本轮造的东西收回去 ==');
try {
  runPutBack();
  ok('本轮留下的那一笔待确认已收回（审计行刻意留着）');
} catch (e) {
  bad('收尾', '本轮留下的那一笔待确认已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
