#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 流程实例面（`BpmProcessInstanceGovernance` + `BpmProcessInstanceTools`）的真栈场景门。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-bpm-process-instance-scenarios.mjs
//
// 属主 = 引擎字段 `startUserId`，不是本宿主 schema 上的列。本门禁断言六条读数：
//
//   1. **可达**：两个调用方都能用自己的身份驱动 `list_my_bpm_instances`，审计行记的是本人，模块自己的
//      “我的流程”页各含自己的实例；
//   2. **收窄**：同一批分页/读，换个人拿不到别人的行；按 id 读别人的实例交回 `null`（与「不存在」同形）；
//   3. **越权拒**：撤回别人的实例，经聊天入口提议、经人批准，仍在执行前被拒（`ROW_OUT_OF_SCOPE`），且实例未变；
//   4. **R3 提案**：人批准之前只出现一条待批提案，实例仍在运行、没有副作用行；
//   5. **台账**：撤回自己实例成功后，`side_effects.result_id` 是那条实例的 UUID（非空）、认领 `settled`、
//      审计轨以本人身份记下 `executed`、`/ai/tool-effects` 与审计链都读得通；
//   6. **投影**：工具返回只有五个业务字段，不含流程变量与表单内容。
//
// **声明的范围**（与既有 CRM 门禁同一条）：运行时不上线工具结果，故第 2 条的「按 id 读别人回 null」与第 6 条的
// 「返回结构」由**同一次运行里**跑的同仓测试直读（`BpmProcessInstanceGovernanceTest` / 新增的
// `BpmProcessInstanceToolsTest`），读数取 surefire 计数；真栈那一半证明工具确实在**挂着流程变量**的实例上执行过。
// 第 2 条的页内容从模块自己的分页端点读 —— 它与工具走**同一个**被切的服务方法（同 CRM / OA 门禁的读法）。
//
// 本门禁造的东西：两个调用方（按名复用）、一个真 BPMN 模型（按 key 复用）、本轮的两条真实例与它们的确认单/写认领。
// 收尾把仍在运行的实例经**模块自己的撤回入口**收回去，确认单与本轮没效应的写认领按标记删掉；**审计行刻意不动**
// —— 那是一条哈希链，剪一断环比凌乱更坏。
//
// The real-stack gate for the process-instance face. Owner = the engine's `startUserId`, not a column on
// this host's schema. Six readings: reachable under each caller's own identity; a page/read narrowed away
// from other people's rows (and a by-id read of another's instance answering `null`, the same as a missing
// one); an out-of-scope withdrawal proposed through the real chat entry, approved by a person, and still
// refused before it runs; R3 holding the proposal until that approval; the effect ledger naming the real
// instance UUID with a settled claim and a valid audit chain; and a projection of five business fields with
// no process variables or form content.
//
// **Declared scope**: neither runtime puts a tool result on the wire, so the by-id `null` and the returned
// structure are read by the same repo's tests inside this invocation (`BpmProcessInstanceGovernanceTest`
// and the new `BpmProcessInstanceToolsTest`); the stack half proves the tool ran over an instance that
// really carries process variables. Page contents come from the module's own endpoint, which shares the
// serviced method the tool calls. Audit rows are deliberately left alone.
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';
import {
  HOST, TENANT, chat, cancelInstance, confirm, ensureDeployedModel, ensureUser, instanceRunning,
  login, page, pendingCount, pendingTokenFor, psql, ranAs, runProjectionTests, startInstance, taskOf,
} from './bpm-scenario-support.mjs';

const SECOND_USER = process.env.BPM_SECOND_USER || 'gatebpm2';
const SECOND_PASS = process.env.BPM_SECOND_PASS || 'gate-pass-1234';
const CANCEL_TOOL = 'cancel_my_bpm_instance';
const LIST_TOOL = 'list_my_bpm_instances';

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const checkNot = (name, forbidden, got) =>
  String(got).includes(forbidden) ? bad(name, `must not contain ${forbidden}`, got) : ok(name);
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

// 收尾在**本轮造出第一行的那一刻**挂上，而不是等到文件末尾：否则「造了行、随后崩了」那条路上它是空的。
// `process.on('exit')` 在未捕获异常把进程带走时同样触发，而 `psql()` 是同步的，故退出处理器里跑得动。运行中的实例
// 收不回来（要一次 HTTP 调用），故崩在那之前会留下两条运行实例；这是隔离库里的一笔，不影响任何共享栈。
//
// The cleanup is attached the moment this run creates its first row, not assembled at the end. It also
// fires when an uncaught exception takes the process down, and `psql()` is synchronous so it runs there.
// Running instances cannot be put back from that handler (it needs an HTTP call), so a crash before the
// closing section leaves two running instances behind — a mark in an isolated database only.
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

// ── 0) 前置 ──────────────────────────────────────────────────────────────────────────────────────
console.log('== 前置 ==');
// 审计链用 `keelbase.audit.hmac-key` 签名，换过 key 的行永远验不过；先清表并说出来。
// The audit chain is signed with `keelbase.audit.hmac-key`; rows signed under another key can never
// verify. Clear the table first and say so.
psql('truncate table ai_audit_logs');
check('/app/capabilities 200', '200', (await fetch(`${HOST}/app/capabilities`)).status);

const admin = await login(ADMIN_USER, resolveAdminPassword(psql));
const adminId = Number(psql(`select id from system_users where username = '${ADMIN_USER}' and deleted = 0 limit 1`));
ok('admin 登录');
const second = await ensureUser(admin, SECOND_USER, SECOND_PASS, ['common']);
const secondToken = await login(SECOND_USER, SECOND_PASS);
ok(`第二个调用方就绪（id=${second.id}）`);

// ── 1) 夹具：一个真模型、两条真实例（各一个发起人） ───────────────────────────────────────────────
console.log('== 夹具 ==');
const marker = `gate-bpm-inst-${Date.now()}`;
const { definitionId } = await ensureDeployedModel(admin);
const adminInstance = await startInstance(admin, definitionId, `${marker}-admin`);
const secondInstance = await startInstance(secondToken, definitionId, `${marker}-second`);
check('admin 的实例已起', 'true', instanceRunning(adminInstance));
check('第二个调用方的实例已起', 'true', instanceRunning(secondInstance));
check('两条实例各有自己的发起人', `${adminInstance}:${adminId}`, psql(
  `select proc_inst_id_ || ':' || start_user_id_ from act_hi_procinst`
  + ` where proc_inst_id_ = '${adminInstance}'`));
check('第二个调用方的发起人是本人', `${secondInstance}:${second.id}`, psql(
  `select proc_inst_id_ || ':' || start_user_id_ from act_hi_procinst`
  + ` where proc_inst_id_ = '${secondInstance}'`));
note('待办任务', `admin=${taskOf(adminInstance)} second=${taskOf(secondInstance)}`);

putBack = () => psql([
  `delete from confirmation_requests where operator_id = '${second.id}'`
    + ` and (args_json like '%${adminInstance}%' or args_json like '%${secondInstance}%')`,
  `delete from write_claims where user_id = '${second.id}' and tool_name = '${CANCEL_TOOL}' and effect_id is null`,
].join('; '));

// ── 2) 可达 ──────────────────────────────────────────────────────────────────────────────────────
console.log('== 场景 1 · 显式身份下可达 ==');
const adminPage = await page(admin, '/bpm/process-instance/my-page?pageSize=50');
const secondPage = await page(secondToken, '/bpm/process-instance/my-page?pageSize=50');
{
  const a = await chat(admin, '我发起的流程');
  check('admin 触发流程实例读工具', LIST_TOOL, (a.json.data?.toolCalls || [])[0]);
  const s = await chat(secondToken, '我发起的流程');
  check('第二个调用方触发同一个工具', LIST_TOOL, (s.json.data?.toolCalls || [])[0]);
  check('两次读都真跑了（审计轨）', 2, ranAs(LIST_TOOL));
  check('第二次以本人身份在案', String(second.id), psql(
    `select user_id from ai_audit_logs where tool = '${LIST_TOOL}' and outcome = 'executed' order by id desc limit 1`));
  check('admin 的“我的流程”页取到了', 0, adminPage.code);
  check('第二个调用方“我的流程”页取到了', 0, secondPage.code);
  check('admin 页含自己发起的实例', true, adminPage.ids.includes(adminInstance));
  check('第二个调用方页含自己的实例', true, secondPage.ids.includes(secondInstance));
  check('admin 页不含别人的实例', false, adminPage.ids.includes(secondInstance));
  check('第二个调用方页不含 admin 的实例', false, secondPage.ids.includes(adminInstance));
  check('两页都不是空着蒙对的', true, adminPage.ids.length > 0 && secondPage.ids.length > 0);
}

// ── 3) 收窄（页 + 按 id 读）+ 投影的测试那一半 ─────────────────────────────────────────────────────
console.log('== 场景 2 · 收窄：分页与按 id 读 ==');
// 工具路径的页由工具把调用方塞进上游分页的第 0 个实参（模块只在 userId 为 null 时才看 pageReqVO.startUserId），
// 故“没过滤”在工具路径上不再等于全部行；页内容与工具走同一个被切的方法，这里是它的真栈读数。
// “按 id 读别人的实例交回 null”在工具路径上没有门户（本面没有按 id 读的工具）：它由同一次运行里的
// `BpmProcessInstanceGovernanceTest` 直读切面行为，下面的读数就是它。
//
// On the tool path the page gets the caller in the module's own argument 0 (the module reads
// `pageReqVO.startUserId` only when userId is null), so "no filter" no longer means every row there; the
// page endpoint shares the serviced method, which is the stack reading here. The by-id `null` has no tool
// door on this face, so it is read by the governance test in this same invocation.
const tests = runProjectionTests(['BpmProcessInstanceToolsTest', 'BpmProcessInstanceGovernanceTest']);
note('同一运行里的测试读数', tests.verdict);
if (!tests.ok) console.log(`  note  测试输出尾部 →\n${tests.tail}`);
check('工具把调用方当发起人传（工具测试钉住）', true, tests.verdict.includes('BpmProcessInstanceToolsTest'));
check('按 id 读别人的实例交回 null（切面测试钉住）', true, tests.verdict.includes('BpmProcessInstanceGovernanceTest'));
check('两侧测试全绿', true, tests.ok);

// ── 4) R3 提案：人批准之前不执行 ────────────────────────────────────────────────────────────────────
console.log('== 场景 3 · 越权写：扣人（R3）与拒绝 ==');
const held = pendingCount(second.id);
const hijack = await chat(secondToken, '撤回流程', { targetId: adminInstance });
const hijackToken = pendingTokenFor(second.id, adminInstance);
{
  check('越权撤回提案选中了工具', CANCEL_TOOL, (hijack.json.data?.toolCalls || [])[0]);
  check('提案被扣下（pending +1）', held + 1, pendingCount(second.id));
  checkNot('扣下时给出 token', 'undefined', hijackToken);
  check('批准前 admin 实例仍在运行', 'true', instanceRunning(adminInstance));
  check('批准前没有副作用行（没写）', 0, Number(psql(
    `select count(*) from side_effects where tool_name = '${CANCEL_TOOL}' and result_id = '${adminInstance}'`)));
  note('扣下时的答复', String(hijack.json.data?.reply || '').slice(0, 200));
}

// ── 5) 越权拒：批准也买不到 ────────────────────────────────────────────────────────────────────────
{
  const decision = await confirm(secondToken, hijackToken, 'approve');
  check('越权写批准后仍被拒（HTTP 403）', 403, decision.status);
  check('拒绝码 = ROW_OUT_OF_SCOPE', 'ROW_OUT_OF_SCOPE', decision.json.errorCode);
  check('拒绝理由点了数据范围', '该行不在你的数据范围内', decision.json.reason);
  check('admin 的实例一字未改（仍运行）', 'true', instanceRunning(adminInstance));
  check('这次拒绝在审计轨', true, Number(psql(
    `select count(*) from ai_audit_logs where tool = '${CANCEL_TOOL}' and outcome = 'refused'`)) > 0);
}

// ── 6) 台账：撤回自己的实例，四样对得上 ────────────────────────────────────────────────────────────
console.log('== 场景 4 · 自己撤自己：扣人、执行、台账 ==');
{
  const ownHeld = pendingCount(second.id);
  const own = await chat(secondToken, '撤回流程', { targetId: secondInstance });
  check('撤回自己的实例选中了工具', CANCEL_TOOL, (own.json.data?.toolCalls || [])[0]);
  check('提案被扣下（pending +1）', ownHeld + 1, pendingCount(second.id));
  const ownToken = pendingTokenFor(second.id, secondInstance);
  checkNot('扣下时给出 token', 'undefined', ownToken);
  check('批准前实例仍在运行', 'true', instanceRunning(secondInstance));

  const decision = await confirm(secondToken, ownToken, 'approve');
  check('批准后执行', 'executed', (decision.json.data || {}).status);
  check('实例已撤回（不再运行）', 'false', instanceRunning(secondInstance));
  check('副作用行记下了这次写（best-effort）', `bpm_process_instance|${secondInstance}|executed`, psql(
    `select result_type || '|' || result_id || '|' || revoke_status from side_effects`
    + ` where tool_name = '${CANCEL_TOOL}' and result_id = '${secondInstance}' order by id desc limit 1`));
  check('副作用行的 result_id 非空', 'true', psql(
    `select (length(result_id) > 0)::text from side_effects where tool_name = '${CANCEL_TOOL}'`
    + ` and result_id = '${secondInstance}' order by id desc limit 1`));
  check('写认领已结算', 'settled', psql(
    `select status from write_claims where tool_name = '${CANCEL_TOOL}' and user_id = '${second.id}'`
    + ' order by id desc limit 1'));
  check('执行在审计轨且以本人身份', true, Number(psql(
    `select count(*) from ai_audit_logs where tool = '${CANCEL_TOOL}' and outcome = 'executed'`
    + ` and user_id = '${second.id}'`)) > 0);
  const effects = await (await fetch(`${HOST}/ai/tool-effects`, {
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, Authorization: `Bearer ${admin}` },
  })).json();
  check('/ai/tool-effects 读得到这次写', true, Number(effects.data?.total) > 0);
  const verify = await (await fetch(`${HOST}/audit/verify`, {
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, Authorization: `Bearer ${admin}` },
  })).json();
  check('审计链校验通过', true, verify.data && verify.data.valid);
}

// ── 7) 投影：工具返回不含流程变量与表单 ─────────────────────────────────────────────────────────────
console.log('== 场景 5 · 投影：五字段，无流程变量与表单 ==');
{
  check('夹具实例确实挂着流程变量', 1, Number(psql(
    `select count(*) from act_ru_variable where proc_inst_id_ = '${adminInstance}' and name_ = 'gateRun'`)));
  check('读工具在这批数据上真执行过', true, Number(psql(
    `select count(*) from ai_audit_logs where tool = '${LIST_TOOL}' and outcome = 'executed'`)) > 0);
  check('返回结构只有五个业务字段，不含流程变量与表单', true, tests.ok);
}

// ── 8) 收尾 ───────────────────────────────────────────────────────────────────────────────────────
console.log('== 收尾 · 把本轮还在跑的实例收回去 ==');
try {
  if (instanceRunning(adminInstance) === 'true') {
    const closed = await cancelInstance(admin, adminInstance, `gate cleanup ${marker}`);
    note('admin 实例的收尾读数', JSON.stringify({ code: closed.code, msg: closed.msg }).slice(0, 160));
  }
  runPutBack();
  check('admin 的实例已收回（历史行与审计行刻意留着）', 'false', instanceRunning(adminInstance));
} catch (e) {
  bad('收尾', '本轮实例已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
