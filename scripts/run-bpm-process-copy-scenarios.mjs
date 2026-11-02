#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 流程抄送面（`BpmProcessInstanceCopyGovernance` + `BpmProcessInstanceCopyTools`）的真栈场景门。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-bpm-process-copy-scenarios.mjs
//
// 属主 = 行上的 `user_id`（被抄送的人）。这是 BPM 四个流程面里**唯一属主是普通业务列**的那个，也是**只开一读**
// 的那两个之一。本门禁断言六条读数：
//
//   1. **可达**：两个调用方都以自己的身份驱动 `list_my_bpm_process_copies`，审计行记的是本人，模块自己的抄送页
//      各含自己收到的那一行；
//   2. **收窄**：换个人，同一批分页拿不到别人的行；分页参数里**没有** `userId` 这一格可以填别人，服务里也**没有**
//      按 id 读的门（故「按 id 读别人交回 null」在本对象上不适用，如实记）；
//   3. **越权拒**：本面没有写工具 —— 以工具清单、写样消息不选工具/不产生提案、抄送行数未变三样证据成立；
//   4. **R3 提案**：同上，**按设计不适用**（没有写工具就没有要扣下的写）；本门禁给证据而不是绕过去不提；
//   5. **台账**：R1 读没有副作用行（设计如此），审计链可校验；
//   6. **投影**：返回只有五个业务字段，**不含**被抄送人 / 发起人的身份字段与抄送意见原文。
//
// **夹具说明**：抄送行**直接种进模块自己的表**（与 CRM / FMS 门禁种模块表同一条做法），流程实例编号指向**本轮
// 真起的两条实例**，故行与引擎里的对象对得上。工具面只按登录/调用方身份读这张表，故这是一条诚实的夹具。
//
// **声明的范围**：运行时不上线工具结果，故第 2/6 条的返回结构由同一次运行里的
// `BpmProcessInstanceCopyToolsTest` / `BpmProcessInstanceCopyGovernanceTest` 直读（surefire 计数）；真栈那一半
// 证明种下的行**确实带着**身份与意见原文，且工具在那批数据上执行过。
//
// The real-stack gate for the copy face. Owner = the row's `user_id` — the only one of BPM's four process
// faces whose owner is an ordinary business column, and one of the two that open **a read only**. Six
// readings: reachable under each caller's own identity; a page narrowed away from others (there is no
// `userId` slot to fill in and no by-id read on this service, so "by-id answers null" does not apply here —
// recorded, not passed over); no write tool, evidenced by the inventory, a write-shaped message selecting
// nothing and creating no proposal, and an unchanged row count; R3 not applicable by design for the same
// reason, again with evidence; R1 leaving no effect rows with a valid audit chain; and a five-field
// projection without the recipient/starter identities or the copy opinion.
//
// Fixture: copy rows are **seeded straight into the module's own table** (the CRM/FMS gates seed module
// tables the same way), with process-instance ids pointing at the two real instances this run starts. The
// tool reads that table by the caller's identity, so this is an honest fixture. Returned structures are
// read by the repo's tests in this same invocation; the stack half proves the seeded rows really carry the
// identities and opinion text and that the tool ran over them.
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs';
import {
  HOST, TENANT, chat, cancelInstance, ensureDeployedModel, ensureUser, instanceRunning, login, page,
  pendingCount, psql, ranAs, runProjectionTests, startInstance, taskOf,
} from './bpm-scenario-support.mjs';

const SECOND_USER = process.env.BPM_SECOND_USER || 'gatebpm2';
const SECOND_PASS = process.env.BPM_SECOND_PASS || 'gate-pass-1234';
const LIST_TOOL = 'list_my_bpm_process_copies';

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

// ── 1) 夹具：两条真实例 + 两条抄送行（各指向其中一条） ──────────────────────────────────────────────
console.log('== 夹具 ==');
const marker = `gate-bpm-copy-${Date.now()}`;
const adminCopyName = `${marker}-admin`;
const secondCopyName = `${marker}-second`;
const { definitionId } = await ensureDeployedModel(admin);
const adminInstance = await startInstance(admin, definitionId, `${marker}-admin`);
const secondInstance = await startInstance(secondToken, definitionId, `${marker}-second`);
check('两条真流程实例已起', 'true|true',
  `${instanceRunning(adminInstance)}|${instanceRunning(secondInstance)}`);

// `tenant_id` 不是可选的：租户拦截器给这张表加 `tenant_id = ?`。
// `tenant_id` is not optional: the tenant interceptor appends `tenant_id = ?` to this table.
const insertCopy = (name, instance, userId) => psql(
  `insert into bpm_process_instance_copy(id, start_user_id, process_instance_name, process_instance_id,`
  + ' process_definition_id, category, activity_id, activity_name, task_id, user_id, reason, creator,'
  + ' create_time, updater, update_time, deleted, tenant_id)'
  + ` values (nextval('bpm_process_instance_copy_seq'), 1, '${name}', '${instance}', '${definitionId}',`
  + ` '', 'review', 'Review', '${taskOf(instance)}', ${userId}, '${name}-opinion', '1', now(), '1', now(), 0, ${TENANT})`);
insertCopy(adminCopyName, adminInstance, adminId);
insertCopy(secondCopyName, secondInstance, second.id);
const adminCopyId = psql(`select id from bpm_process_instance_copy where process_instance_name = '${adminCopyName}'`);
const secondCopyId = psql(`select id from bpm_process_instance_copy where process_instance_name = '${secondCopyName}'`);
check('admin 的抄送行已种', true, adminCopyId !== '');
check('第二个调用方的抄送行已种', true, secondCopyId !== '');

putBack = () => psql(
  `delete from bpm_process_instance_copy where process_instance_name like '%${marker}%'`);

// ── 2) 可达 ──────────────────────────────────────────────────────────────────────────────────────
console.log('== 场景 1 · 显式身份下可达 ==');
const adminPage = await page(admin, '/bpm/process-instance/copy/page?pageSize=100');
const secondPage = await page(secondToken, '/bpm/process-instance/copy/page?pageSize=100');
{
  const a = await chat(admin, '我的抄送');
  check('admin 触发抄送读工具', LIST_TOOL, (a.json.data?.toolCalls || [])[0]);
  const s = await chat(secondToken, '我的抄送');
  check('第二个调用方触发同一个工具', LIST_TOOL, (s.json.data?.toolCalls || [])[0]);
  check('两次读都真跑了（审计轨）', 2, ranAs(LIST_TOOL));
  check('第二次以本人身份在案', String(second.id), psql(
    `select user_id from ai_audit_logs where tool = '${LIST_TOOL}' and outcome = 'executed' order by id desc limit 1`));
  check('admin 的抄送页取到了', 0, adminPage.code);
  check('第二个调用方抄送页取到了', 0, secondPage.code);
  check('admin 页含自己收到的抄送', true, adminPage.ids.includes(adminCopyId));
  check('第二个调用方页含自己的抄送', true, secondPage.ids.includes(secondCopyId));
}

// ── 3) 收窄 ──────────────────────────────────────────────────────────────────────────────────────
console.log('== 场景 2 · 收窄：分页拿不到别人的行 ==');
let tests = { ok: false, verdict: 'not run yet' };
{
  check('admin 页不含别人的抄送', false, adminPage.ids.includes(secondCopyId));
  check('第二个调用方页不含 admin 的抄送', false, secondPage.ids.includes(adminCopyId));
  check('两页都不是空着蒙对的', true, adminPage.ids.length > 0 && secondPage.ids.length > 0);
  // 分页参数里没有 `userId` 这一格：把别人的 id 拼进去也**不会**把页面放宽 —— 控制器传的是登录人。
  // There is no `userId` slot on this page: putting another id in the query does not widen it — the
  // controller hands in the signed-in person.
  const crafted = await page(admin, `/bpm/process-instance/copy/page?pageSize=100&userId=${second.id}`);
  check('把别人的 id 拼进分页参数也不放宽', false, crafted.ids.includes(secondCopyId));
  note('本对象的按 id 读', '该 service 没有 getCopy(Long) 这类门 ⇒「按 id 读别人的交回 null」在本对象上不适用');

  tests = runProjectionTests(['BpmProcessInstanceCopyToolsTest', 'BpmProcessInstanceCopyGovernanceTest']);
  note('同一运行里的测试读数', tests.verdict);
  if (!tests.ok) console.log(`  note  测试输出尾部 →\n${tests.tail}`);
  check('工具把调用方当收件人传、参数表为空（工具测试钉住）', true, tests.verdict.includes('BpmProcessInstanceCopyToolsTest'));
  check('切面在工具路径上补调用方身份（切面测试钉住）', true, tests.verdict.includes('BpmProcessInstanceCopyGovernanceTest'));
  check('两侧测试全绿', true, tests.ok);
}

// ── 4) 越权拒 / R3：本面按设计没有写工具 ───────────────────────────────────────────────────────────
console.log('== 场景 3 · 越权拒与 R3：本面没有写工具（有证据） ==');
{
  const inventory = await (await fetch(`${HOST}/ai/tools`, {
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, Authorization: `Bearer ${admin}` },
  })).json();
  const copyTools = (inventory.data || []).filter((tool) => /copies/i.test(tool.name));
  note('工具清单里的抄送面', JSON.stringify(copyTools.map((tool) => `${tool.name}:${tool.riskLevel}`)));
  check('抄送面只有一条工具', 1, copyTools.length);
  check('抄送面那条是 R1 读', `${LIST_TOOL}:R1`, copyTools.map((tool) => `${tool.name}:${tool.riskLevel}`).join(','));

  const before = Number(psql(
    `select count(*) from bpm_process_instance_copy where process_instance_name like '%${marker}%'`));
  const held = pendingCount(adminId);
  const writeish = await chat(admin, `把流程抄送给用户 ${second.id}`);
  note('写样消息的读数', JSON.stringify({
    toolCalls: writeish.json?.data?.toolCalls,
    reply: String(writeish.json?.data?.reply || '').slice(0, 160),
  }).slice(0, 260));
  check('写样消息没有选中任何工具', 0, (writeish.json.data?.toolCalls || []).length);
  check('没有产生待批提案', held, pendingCount(adminId));
  check('抄送行数未变（没有写落地）', before, Number(psql(
    `select count(*) from bpm_process_instance_copy where process_instance_name like '%${marker}%'`)));
  check('本面没有任何副作用行', 0, Number(psql(
    `select count(*) from side_effects where tool_name = '${LIST_TOOL}'`)));
  note('R3 提案', '本面没有写工具（人给抄送的 copyTask 也不在工具面上）⇒ 没有要扣下的写');
  ok('R3 提案：按设计不适用（证据齐全）');
}

// ── 5) 台账 ──────────────────────────────────────────────────────────────────────────────────────
console.log('== 场景 4 · 台账与审计链 ==');
{
  check('R1 读没有副作用行（设计如此）', 0, Number(psql(
    `select count(*) from side_effects where tool_name = '${LIST_TOOL}'`)));
  const verify = await (await fetch(`${HOST}/audit/verify`, {
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, Authorization: `Bearer ${admin}` },
  })).json();
  check('审计链校验通过', true, verify.data && verify.data.valid);
  check('本面的执行都在案', true, Number(psql(
    `select count(*) from ai_audit_logs where tool = '${LIST_TOOL}' and outcome = 'executed'`)) >= 2);
}

// ── 6) 投影 ───────────────────────────────────────────────────────────────────────────────────────
console.log('== 场景 5 · 投影：五字段，不含身份与意见原文 ==');
{
  check('夹具的两行确实带着收件人、发起人与意见原文', 2, Number(psql(
    `select count(*) from bpm_process_instance_copy where process_instance_name like '%${marker}%'`
    + ' and user_id is not null and start_user_id is not null and reason is not null')));
  check('读工具在这批数据上真执行过', true, Number(psql(
    `select count(*) from ai_audit_logs where tool = '${LIST_TOOL}' and outcome = 'executed'`)) > 0);
  check('返回结构只有五个业务字段，不含收件人/发起人与意见原文', true, tests.ok);
}

// ── 7) 收尾 ───────────────────────────────────────────────────────────────────────────────────────
console.log('== 收尾 · 收回本轮的行与实例 ==');
try {
  runPutBack();
  check('本轮种下的抄送行已收回', 0, Number(psql(
    `select count(*) from bpm_process_instance_copy where process_instance_name like '%${marker}%'`)));
  for (const [token, instance] of [[admin, adminInstance], [secondToken, secondInstance]]) {
    if (instanceRunning(instance) === 'true') {
      const closed = await cancelInstance(token, instance, `gate cleanup ${marker}`);
      note('实例的收尾读数', JSON.stringify({ instance, code: closed.code }).slice(0, 160));
    }
  }
  check('两条实例都已收回', 'false|false', `${instanceRunning(adminInstance)}|${instanceRunning(secondInstance)}`);
} catch (e) {
  bad('收尾', '本轮行与实例已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
