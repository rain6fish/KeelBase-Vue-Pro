#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 任务面（`BpmTaskGovernance` + `BpmTaskTools`）的真栈场景门。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-bpm-task-scenarios.mjs
//
// 属主 = 引擎字段 `assignee`。本面**刻意只开一条读**（`list_my_bpm_tasks`），写一条都不开：审批是人的责任，
// 转办/委派/加签是把事交给另一个人。故六条验收里有一条（R3 提案）在本面**按设计不适用**，本门禁给它**证据**
// 而不是绕过去不提：
//
//   1. **可达**：两个调用方都以自己的身份读到自己的待办，审计行记的是本人，模块自己的“待办”页各含自己的任务；
//   2. **收窄**：换个人，同一批分页/读拿不到别人的行；工具把调用方当受理人传、只投影四个字段（同一次运行里的
//      `BpmTaskToolsTest` 直读），而权限的问题由 `BpmTaskGovernance` 问模块 controller 自己那一句；
//   3. **越权拒**：缺 `bpm:task:query` 的调用方在工具路径上与 REST 上都被拒（`ROW_OUT_OF_SCOPE`），
//      且没有一条执行落在审计轨、没有一行副作用；
//   4. **R3 提案**：**本面没有写工具** —— 以此断言：工具清单里没有非 R1 的任务工具，写样消息既不选中工具也不
//      产生确认行，引擎里的任务受理人一字未改；
//   5. **台账**：R1 读没有副作用行（设计如此），审计链可校验、拒绝也在案；
//   6. **投影**：返回只有任务编号、名称、创建时间、流程实例编号，**不含**任务局部变量（审批意见、签字图片地址等）。
//
// **声明的范围**：运行时不上线工具结果，故第 2/6 条的返回结构由同一次运行里的 `BpmTaskToolsTest` /
// `BpmTaskGovernanceTest` 直读（surefire 计数）；真栈那一半证明工具确实在那批任务上执行过。页内容从模块自己的
// 分页端点读 —— 它与工具走同一个被切的方法。
//
// The real-stack gate for the task face. Owner = the engine's `assignee`. This face deliberately opens **one
// read** and no write: approving is a human's job, and transferring/delegating/signing is handing work to
// someone else. So one of the six readings — R3 holding a proposal — is **not applicable by design** here,
// and this gate gives that **evidence** instead of passing over it: reachable under each caller's identity;
// narrowed away from other people's rows with the caller travelling as the assignee and a four-field
// projection; a caller lacking `bpm:task:query` refused on both the tool path and REST; no task write tool
// and a write-shaped message producing neither a tool call nor a confirmation row while the engine row stays
// untouched; R1 leaving no effect rows with a verifiable audit chain; and a projection without the task's
// local variables. Returned structures are read by the repo's own tests in this same invocation; page
// contents come from the module's endpoint, which shares the serviced method the tool calls.
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';
import {
  api, HOST, TENANT, chat, cancelInstance, ensureDeployedModel, ensureEmptyRole, ensureUser, instanceRunning,
  login, page, pendingCount, psql, ranAs, runProjectionTests, startInstance, taskOf,
} from './bpm-scenario-support.mjs';

const SECOND_USER = process.env.BPM_SECOND_USER || 'gatebpm2';
const SECOND_PASS = process.env.BPM_SECOND_PASS || 'gate-pass-1234';
const NO_PERM_USER = process.env.BPM_NOPERM_USER || 'gatenobpm2';
const NO_PERM_PASS = process.env.BPM_NOPERM_PASS || 'gate-pass-1234';
const LIST_TOOL = 'list_my_bpm_tasks';

let pass = 0;
let fail = 0;
const ok = (name) => { console.log(`  ok    ${name}`); pass += 1; };
const bad = (name, expected, got) => { console.log(`  FAIL  ${name} — expected [${expected}], got [${got}]`); fail += 1; };
const check = (name, expected, got) => (String(expected) === String(got) ? ok(name) : bad(name, expected, got));
const note = (name, got) => console.log(`  note  ${name} → ${got}`);

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
psql('truncate table ai_audit_logs');
check('/app/capabilities 200', '200', (await fetch(`${HOST}/app/capabilities`)).status);
const admin = await login(ADMIN_USER, resolveAdminPassword(psql));
const adminId = Number(psql(`select id from system_users where username = '${ADMIN_USER}' and deleted = 0 limit 1`));
ok('admin 登录');

const second = await ensureUser(admin, SECOND_USER, SECOND_PASS, ['common']);
const secondToken = await login(SECOND_USER, SECOND_PASS);
ok(`第二个调用方就绪（id=${second.id}）`);
// 负对照：一个**空角色**的调用方 —— 有账号、没有 `bpm:task:query`，拒绝来自真实的权限表。
// The negative control: a caller with an **empty** role — an account, no `bpm:task:query`, and the refusal
// comes from the real permission table.
const emptyRole = await ensureEmptyRole(admin, 'gate_bpm_noperm', 'gate-bpm-noperm');
const noPerm = await ensureUser(admin, NO_PERM_USER, NO_PERM_PASS, []);
await api('/system/permission/assign-user-role', {
  method: 'POST', token: admin, body: { userId: noPerm.id, roleIds: [emptyRole] },
});
const noPermToken = await login(NO_PERM_USER, NO_PERM_PASS);
ok(`无权限调用方就绪（id=${noPerm.id}）`);

// ── 1) 夹具：一个真模型、两条真实例、每条一个待办 ─────────────────────────────────────────────────
console.log('== 夹具 ==');
const marker = `gate-bpm-task-${Date.now()}`;
const { definitionId } = await ensureDeployedModel(admin);
const adminInstance = await startInstance(admin, definitionId, `${marker}-admin`);
const secondInstance = await startInstance(secondToken, definitionId, `${marker}-second`);
const adminTask = taskOf(adminInstance);
const secondTask = taskOf(secondInstance);
check('admin 的待办已生成', true, adminTask !== '');
check('第二个调用方的待办已生成', true, secondTask !== '');
check('两条待办的受理人分别是本人', `1|${second.id}`, psql(
  `select string_agg(assignee_, '|' order by assignee_) from act_ru_task where id_ in ('${adminTask}', '${secondTask}')`));

putBack = () => psql(
  `delete from write_claims where user_id = '${noPerm.id}' and effect_id is null`,
);

// ── 2) 可达 ──────────────────────────────────────────────────────────────────────────────────────
console.log('== 场景 1 · 显式身份下可达 ==');
const adminPage = await page(admin, '/bpm/task/todo-page?pageSize=10');
const secondPage = await page(secondToken, '/bpm/task/todo-page?pageSize=10');
{
  const a = await chat(admin, '我的待办');
  check('admin 触发任务读工具', LIST_TOOL, (a.json.data?.toolCalls || [])[0]);
  const s = await chat(secondToken, '我的待办');
  check('第二个调用方触发同一个工具', LIST_TOOL, (s.json.data?.toolCalls || [])[0]);
  check('两次读都真跑了（审计轨）', 2, ranAs(LIST_TOOL));
  check('第二次以本人身份在案', String(second.id), psql(
    `select user_id from ai_audit_logs where tool = '${LIST_TOOL}' and outcome = 'executed' order by id desc limit 1`));
  check('admin 的待办页取到了', 0, adminPage.code);
  check('第二个调用方待办页取到了', 0, secondPage.code);
  check('admin 页含自己的任务', true, adminPage.ids.includes(adminTask));
  check('第二个调用方页含自己的任务', true, secondPage.ids.includes(secondTask));
  check('admin 页不含别人的任务', false, adminPage.ids.includes(secondTask));
  check('第二个调用方页不含 admin 的任务', false, secondPage.ids.includes(adminTask));
  check('两页都不是空着蒙对的', true, adminPage.ids.length > 0 && secondPage.ids.length > 0);
}

// ── 3) 收窄 + 投影的测试那一半 ─────────────────────────────────────────────────────────────────────
console.log('== 场景 2 · 收窄：分页与受理人 ==');
// 工具把调用方塞进上游待办分页的第 0 个实参，模块自己按 `assignee` 收束；工具路径上也没有第二个可筛的维度
// （参数表为空），故没有人能填进别人的 id。两条都由同一次运行里的测试直读。
//
// The tool passes the caller as argument 0 and the module narrows by `assignee` itself; there is no second
// dimension to filter on (the parameter list is empty), so nobody can name another id. Both are read by the
// tests in this same invocation.
const tests = runProjectionTests(['BpmTaskToolsTest', 'BpmTaskGovernanceTest']);
note('同一运行里的测试读数', tests.verdict);
if (!tests.ok) console.log(`  note  测试输出尾部 →\n${tests.tail}`);
check('工具把调用方当受理人传（工具测试钉住）', true, tests.verdict.includes('BpmTaskToolsTest'));
check('切面问的是模块 controller 那一句权限码（切面测试钉住）', true, tests.verdict.includes('BpmTaskGovernanceTest'));
check('两侧测试全绿', true, tests.ok);

// ── 4) 越权拒：缺权限的调用方 ──────────────────────────────────────────────────────────────────────
console.log('== 场景 3 · 越权拒：缺 bpm:task:query 的调用方 ==');
{
  const refused = await chat(noPermToken, '我的待办');
  note('工具路径的拒绝读数', JSON.stringify({
    http: refused.status, code: refused.json?.code, errorCode: refused.json?.errorCode, reason: refused.json?.reason,
  }).slice(0, 260));
  check('工具路径上被拒（HTTP 403）', 403, refused.status);
  check('拒绝码 = ROW_OUT_OF_SCOPE', 'ROW_OUT_OF_SCOPE', refused.json.errorCode);
  check('拒绝理由点名 bpm:task:query', true, String(refused.json.reason || '').includes('bpm:task:query'));
  const rest = await page(noPermToken, '/bpm/task/todo-page?pageSize=10');
  check('REST 上也被拒（信封 code 403）', 403, rest.code);
  check('被拒的调用方没有拿到任何任务', 0, rest.ids.length);
  check('那次拒绝在审计轨', true, Number(psql(
    `select count(*) from ai_audit_logs where tool = '${LIST_TOOL}' and outcome = 'refused'`)) > 0);
  check('被拒的调用方没有一条执行', 0, Number(psql(
    `select count(*) from ai_audit_logs where tool = '${LIST_TOOL}' and outcome = 'executed'`
    + ` and user_id = '${noPerm.id}'`)));
  check('没有副作用行落地', 0, Number(psql(
    `select count(*) from side_effects where tool_name = '${LIST_TOOL}'`)));
}

// ── 5) 高危写 / R3：本面按设计没有写工具 ───────────────────────────────────────────────────────────
console.log('== 场景 4 · 高危写与 R3：本面没有写工具（有证据） ==');
{
  const inventory = await (await fetch(`${HOST}/ai/tools`, {
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, Authorization: `Bearer ${admin}` },
  })).json();
  const taskTools = (inventory.data || []).filter((tool) => /_bpm_tasks$/.test(tool.name));
  note('工具清单里的任务面', JSON.stringify((inventory.data || [])
    .filter((tool) => /bpm/i.test(tool.name)).map((tool) => `${tool.name}:${tool.riskLevel}`)));
  check('任务面只有一条工具', 1, taskTools.length);
  check('任务面那条是 R1 读', `${LIST_TOOL}:R1`, taskTools.map((tool) => `${tool.name}:${tool.riskLevel}`).join(','));

  // 写样消息：审批通过一条真任务。任务面没有写工具，故既不选中工具、也不产生确认行，引擎里的任务一字未改。
  // A write-shaped message: approve a real task. This face has no write tool, so it selects no tool, creates
  // no confirmation row, and the engine's task is untouched.
  const held = pendingCount(adminId);
  const writeish = await chat(admin, `审批通过任务 ${secondTask}`);
  note('写样消息的读数', JSON.stringify({
    toolCalls: writeish.json?.data?.toolCalls,
    reply: String(writeish.json?.data?.reply || '').slice(0, 160),
  }).slice(0, 260));
  check('写样消息没有选中任何工具', 0, (writeish.json.data?.toolCalls || []).length);
  check('没有产生待批提案', held, pendingCount(adminId));
  check('任务仍在引擎里、受理人未变', `${second.id}`, psql(
    `select assignee_ from act_ru_task where id_ = '${secondTask}'`));
  check('本面没有任何副作用行', 0, Number(psql(
    `select count(*) from side_effects where tool_name in ('${LIST_TOOL}', 'approve_bpm_task', 'reject_bpm_task')`)));
  note('R3 提案', '本面没有写工具 ⇒ 不存在要扣下的写；本条以「无工具 / 无提案 / 引擎未变」三样证据成立');
  ok('R3 提案：按设计不适用（证据齐全）');
}

// ── 6) 台账：R1 无副作用、审计链可校验 ────────────────────────────────────────────────────────────
console.log('== 场景 5 · 台账与审计链 ==');
{
  check('R1 读没有副作用行（设计如此）', 0, Number(psql(
    `select count(*) from side_effects where tool_name = '${LIST_TOOL}'`)));
  const verify = await (await fetch(`${HOST}/audit/verify`, {
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, Authorization: `Bearer ${admin}` },
  })).json();
  check('审计链校验通过', true, verify.data && verify.data.valid);
  check('本面的审计序列包含执行与拒绝', true, Number(psql(
    `select count(distinct outcome) from ai_audit_logs where tool = '${LIST_TOOL}'`)) >= 2);
}

// ── 7) 投影 ───────────────────────────────────────────────────────────────────────────────────────
console.log('== 场景 6 · 投影：四字段，不含任务局部变量 ==');
{
  check('夹具任务确实带着受理人、名称与创建时间', 1, Number(psql(
    `select count(*) from act_ru_task where id_ = '${secondTask}' and assignee_ is not null`
    + ' and name_ is not null and create_time_ is not null')));
  check('读工具在这批任务上真执行过', true, Number(psql(
    `select count(*) from ai_audit_logs where tool = '${LIST_TOOL}' and outcome = 'executed'`)) > 0);
  check('返回结构只有四个业务字段，不含审批意见与附件', true, tests.ok);
}

// ── 8) 收尾 ───────────────────────────────────────────────────────────────────────────────────────
console.log('== 收尾 · 把本轮还在跑的实例收回去 ==');
try {
  for (const [token, instance] of [[admin, adminInstance], [secondToken, secondInstance]]) {
    if (instanceRunning(instance) === 'true') {
      const closed = await cancelInstance(token, instance, `gate cleanup ${marker}`);
      note('实例的收尾读数', JSON.stringify({ instance, code: closed.code }).slice(0, 160));
    }
  }
  runPutBack();
  check('两条实例都已收回', 'false|false', `${instanceRunning(adminInstance)}|${instanceRunning(secondInstance)}`);
} catch (e) {
  bad('收尾', '本轮实例已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
