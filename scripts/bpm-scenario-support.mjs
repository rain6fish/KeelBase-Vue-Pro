#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 三条 BPM 真栈场景门共用的机器：隔离栈的 psql / REST / 聊天 / 固定夹具（两个调用方、一个真 BPMN 模型、真实例）
// 与「工具返回结构」那一半的读数。三条门各自只写自己的断言，不各抄一份连接与夹具。
//
// **为什么不重复抄**：夹具（用户、模型、实例）在三条门上形状相同，抄三份只会让三份漂开；而断言与读数必须各自
// 独立，故这里只放机器、不放判断。
//
// **声明的范围（与既有 CRM 门禁同一条）**：运行时**不把工具结果放上线**（`chat-response` 只有 `reply` /
// `toolCalls`，流式的 `tool_end` 只有成败），故「工具返回什么」只能直读 `ToolResult.data()`。真栈那一半证明工具
// 确实在那批数据上执行过；返回结构那一半由**同一次运行里**跑的同仓测试读 surefire 计数给出。不从答复、页面或库反推。
//
// The machine the three BPM real-stack gates share: psql / REST / chat against the isolated stack, the
// fixed fixture (two callers, one real BPMN model, real instances), and the reading of the "what did the
// tool return" half. Each gate writes its own assertions; the rig is not copied three times.
//
// **Declared scope**, the same one the CRM gates carry: neither runtime puts a tool result on the wire
// (`chat-response` carries only `reply` / `toolCalls`), so "what the tool returned" is read straight from
// `ToolResult.data()`. The stack half proves the tool ran over this data; the returned-structure half is
// the surefire count of the same repo's test, run inside the same invocation — never inferred from a
// reply, a page or the database.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const HOST = process.env.HOST_URL || 'http://127.0.0.1:48141';
export const TENANT = process.env.TENANT_ID || '1';
export const PG = process.env.PG_CONTAINER || 'bpmgates-1102-pg';
export const DB = process.env.PG_DB || 'bpm_gates_1102';
export const MODEL_KEY = process.env.BPM_MODEL_KEY || 'gateM2BpmGates1102';

// 默认取 PATH 上的 `mvn`，仓库目录也交给 Maven 自己的默认值 —— 本文件因此可以在任何一台干净机器上跑，
// 不再默认指向本机那两条 `D:/…`。给了 `MVN_REPO` 就等于点名了一个隔离缓存：那种跑法默认离线（与本地各次
// 读数同形），`MVN_OFFLINE=0/1` 可覆盖任一方向。
//
// Default to `mvn` on `PATH` and let Maven use its own default repository, so this file runs on any clean
// machine instead of pointing at this one's two `D:/…` paths. Naming `MVN_REPO` means an isolated cache,
// and that mode is offline by default (the way the local readings were taken); `MVN_OFFLINE=0/1`
// overrides either way.
const MVN = process.env.MVN || 'mvn';
const MVN_REPO = process.env.MVN_REPO || '';
const MVN_OFFLINE = process.env.MVN_OFFLINE === undefined
  ? Boolean(MVN_REPO) : process.env.MVN_OFFLINE !== '0';
const PSQL = process.env.PSQL || 'psql';
const PSQL_HELPER = (process.env.PSQL_HELPER || 'docker').toLowerCase();
const PSQL_HELPER_SCRIPT = process.env.PSQL_HELPER_SCRIPT
  ? resolve(process.env.PSQL_HELPER_SCRIPT) : '';
if (PSQL_HELPER_SCRIPT && !existsSync(PSQL_HELPER_SCRIPT)) {
  throw new Error(`PSQL_HELPER_SCRIPT points to a missing file: ${process.env.PSQL_HELPER_SCRIPT}`);
}

// psql 助手：默认 `docker exec`（与本线其它门禁相同）；`PSQL_HELPER=direct` 直连；没有 psql 客户端时用
// `PSQL_HELPER_SCRIPT` 指向 `scripts/psql-helper.mjs`。
//
// The psql helper: `docker exec` by default (the same as this line's other gates); `PSQL_HELPER=direct`
// for a reachable client; `PSQL_HELPER_SCRIPT` for a psql-shaped Node helper on a host with no psql.
export const psql = (sql) => {
  if (PSQL_HELPER_SCRIPT) {
    return execFileSync(
      process.execPath,
      [PSQL_HELPER_SCRIPT, '-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
        '-U', process.env.PGUSER || 'root', '-d', DB, '-tAc', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'password' } },
    ).trim();
  }
  if (PSQL_HELPER === 'docker') {
    return execFileSync('docker', ['exec', '-i', '-e', 'PGPASSWORD=password', PG, 'psql', '-U', 'root',
      '-d', DB, '-tAc', sql], { encoding: 'utf8' }).trim();
  }
  if (PSQL_HELPER === 'direct' || PSQL_HELPER === 'local') {
    return execFileSync(
      PSQL,
      ['-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
        '-U', process.env.PGUSER || 'root', '-d', DB, '-tAc', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'password' } },
    ).trim();
  }
  throw new Error(`PSQL_HELPER must be "docker" or "direct" (got "${process.env.PSQL_HELPER}")`);
};

// 宿主答它那个瞬时 500 时**重试一次**、且说出来；业务性拒绝不重试。
// Retry **once** on the host's transient 500 and say so; a business refusal is not retried.
export async function api(path, { method = 'GET', token, body } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const res = await fetch(`${HOST}/admin-api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'tenant-id': TENANT,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json();
    if (json.code !== 500 || attempt > 1) {
      return json;
    }
    console.log(`  note  ${path} 第一次答 500 —— 宿主的瞬时故障，重试一次`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

export async function login(username, password) {
  const r = await api('/system/auth/login', { method: 'POST', body: { username, password } });
  if (r.code !== 0) throw new Error(`login(${username}) -> ${r.code}: ${r.msg}`);
  return r.data.accessToken;
}

// 聊天的原始信封（含 HTTP 状态、`code`、`errorCode`）：拒绝要看信封而不是 `data`。
// The raw chat envelope (HTTP status, `code`, `errorCode`): a refusal lives on the envelope, not in `data`.
export async function chat(token, message, extra = {}) {
  const res = await fetch(`${HOST}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message, conversationId: `gate-bpm-${Date.now()}`, ...extra }),
  });
  return { status: res.status, json: await res.json() };
}

export async function confirm(token, confirmationToken, decision = 'approve') {
  const res = await fetch(`${HOST}/ai/confirmations/${confirmationToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision }),
  });
  return { status: res.status, json: await res.json() };
}

// 一个调用方：按名复用；每次都重授角色（幂等），夹具不依赖上一次运行留下的关系。
// A caller: reuse by name and re-assign roles every time (idempotent), so the fixture does not depend on
// relationships left behind by an earlier run.
export async function ensureUser(adminToken, username, password, roleCodes) {
  let id = Number(psql(`select id from system_users where username = '${username}' and deleted = 0 limit 1`)) || null;
  if (!id) {
    const created = await api('/system/user/create', {
      method: 'POST', token: adminToken,
      body: { username, nickname: username, password, deptId: 100, postIds: [] },
    });
    if (created.code !== 0) throw new Error(`create user ${username} -> ${created.code}: ${created.msg}`);
    id = Number(created.data);
  }
  const roleIds = roleCodes.map((code) => {
    const roleId = Number(psql(`select id from system_role where code = '${code}' and deleted = 0 limit 1`));
    if (!roleId) throw new Error(`角色 ${code} 不在库里 —— 这套种子缺了它`);
    return roleId;
  });
  if (roleIds.length) {
    await api('/system/permission/assign-user-role', {
      method: 'POST', token: adminToken, body: { userId: id, roleIds },
    });
  }
  return { id, username, password };
}

// 一个**空**角色：没有任何菜单，故任何权限码都问不出「有」——负对照要的正是这一种真实拒绝。
// An **empty** role: no menus at all, so every permission question answers no — the negative control is a
// real refusal, not a mock.
export async function ensureEmptyRole(adminToken, code, name) {
  let id = psql(`select id from system_role where code = '${code}' and deleted = 0 limit 1`);
  if (!id) {
    const created = await api('/system/role/create', {
      method: 'POST', token: adminToken,
      body: { name, code, sort: 99, status: 0, remark: 'BPM gate: a caller with no permission at all' },
    });
    if (created.code !== 0) throw new Error(`create role ${code} -> ${created.code}: ${created.msg}`);
    id = created.data;
  }
  return Number(id);
}

// 一个真流程模型：一个 userTask，候选人策略 `START_USER`（36）—— 任务受理人就是发起人，故两个调用方各起一条就
// 各有自己的待办。复用同一个 key，第二次跑不再建模型。
//
// A real process model: one userTask whose candidate strategy is `START_USER` (36) — the task's assignee is
// the starter, so one instance per caller gives each their own todo. The same key is reused; a second run
// creates no model.
export async function ensureDeployedModel(adminToken) {
  const bpmn = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"'
    + ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
    + ' xmlns:flowable="http://flowable.org/bpmn" targetNamespace="http://keelbase.local/gate">'
    + `<process id="${MODEL_KEY}" name="BPM Gate ${MODEL_KEY}" isExecutable="true">`
    + '<startEvent id="start" name="Start"/>'
    + '<sequenceFlow id="f1" sourceRef="start" targetRef="review"/>'
    + `<userTask id="review" name="Review" flowable:assignee="${'${assignee}'}">`
    + '<extensionElements><flowable:candidateStrategy>36</flowable:candidateStrategy></extensionElements>'
    + '</userTask>'
    + '<sequenceFlow id="f2" sourceRef="review" targetRef="end"/>'
    + '<endEvent id="end" name="End"/>'
    + '</process></definitions>';

  let modelId = psql(`select id_ from act_re_model where key_ = '${MODEL_KEY}' order by version_ desc limit 1`);
  if (!modelId) {
    const created = await api('/bpm/model/create', {
      method: 'POST', token: adminToken,
      body: {
        key: MODEL_KEY, name: `BPM Gate ${MODEL_KEY}`, category: '', type: 10, formType: 20,
        formCustomCreatePath: '/gate/create', formCustomViewPath: '/gate/view', visible: true,
        managerUserIds: [1], startUserIds: [], startDeptIds: [], bpmnXml: bpmn,
      },
    });
    if (created.code !== 0) throw new Error(`create model -> ${created.code}: ${created.msg}`);
    modelId = created.data;
  }
  let deployment = psql(`select deployment_id_ from act_re_model where id_ = '${modelId}'`);
  if (!deployment) {
    const deployed = await api(`/bpm/model/deploy?id=${encodeURIComponent(modelId)}`, { method: 'POST', token: adminToken });
    if (deployed.code !== 0) throw new Error(`deploy model -> ${deployed.code}: ${deployed.msg}`);
    deployment = psql(`select deployment_id_ from act_re_model where id_ = '${modelId}'`);
  }
  const definitionId = psql(`select id_ from act_re_procdef where key_ = '${MODEL_KEY}' and deployment_id_ = '${deployment}' limit 1`);
  if (!definitionId) throw new Error(`流程定义没建成：${MODEL_KEY} / ${deployment}`);
  return { modelId, deployment, definitionId };
}

// 用模块自己的 REST 起一条**真**流程实例；两个变量让「实例上确实挂着流程变量」成为可断言的事实。
// Start a **real** instance through the module's own REST; two variables make "the instance really carries
// process variables" an assertion of fact.
export async function startInstance(token, definitionId, marker) {
  const r = await api('/bpm/process-instance/create', {
    method: 'POST', token,
    body: {
      processDefinitionId: definitionId,
      variables: { gateRun: marker, gateNote: 'gate-secret-form-value' },
    },
  });
  if (r.code !== 0) throw new Error(`start instance(${marker}) -> ${r.code}: ${r.msg}`);
  return String(r.data);
}

export const instanceRunning = (id) =>
  psql(`select (end_time_ is null)::text from act_hi_procinst where proc_inst_id_ = '${id}'`);

export const taskOf = (instanceId) =>
  psql(`select id_ from act_ru_task where proc_inst_id_ = '${instanceId}'`);

// 收尾用：模块自己的撤回入口（不是直接删引擎表）。它把仍在运行的本轮实例收回去，历史行由引擎按规则保留。
// 上游这一版的路由是 `DELETE /cancel-by-start-user`（`cancelProcessInstanceByStartUser`），不是 `/cancel`。
// For cleanup: the module's own withdrawal entry (never a direct delete from the engine's tables). It puts
// this run's still-running instances back; the engine keeps the historic rows by its own rules. Upstream's
// route is `DELETE /cancel-by-start-user` (`cancelProcessInstanceByStartUser`), not `/cancel`.
export async function cancelInstance(token, id, reason) {
  return api('/bpm/process-instance/cancel-by-start-user', { method: 'DELETE', token, body: { id, reason } });
}

export const pendingCount = (operatorId) =>
  Number(psql(`select count(*) from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`));

export const pendingTokenFor = (operatorId, argsLike) =>
  psql(`select token from confirmation_requests where operator_id = '${operatorId}' and status = 'pending'`
    + ` and args_json like '%${argsLike}%' order by id desc limit 1`) || undefined;

export const ranAs = (tool) =>
  Number(psql(`select count(*) from ai_audit_logs where tool = '${tool}' and outcome = 'executed'`));

// 一个分页端点：HTTP 状态、信封 `code`、页内 id。`query` 原样拼在 `?pageSize=` 之后。
// A page endpoint: HTTP status, envelope `code`, and the ids on the page.
export async function page(token, path) {
  const res = await fetch(`${HOST}/admin-api${path}`, {
    headers: { 'Content-Type': 'application/json', 'tenant-id': TENANT, Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  const list = (json.data || {}).list || [];
  return { http: res.status, code: json.code, ids: list.map((row) => String(row.id)) };
}

// 同一次运行里跑同仓的测试，读 surefire 计数 —— 那是「工具返回结构」唯一可信的读数（见文件头）。
// Run the repo's own tests inside this invocation and read the surefire counts — the only trustworthy
// reading of "what the tool returned" (see the header).
export function runProjectionTests(classes) {
  const reports = classes.map((name) =>
    resolve(ROOT, `yudao-server/target/surefire-reports/TEST-cn.iocoder.yudao.server.keelbase.${name}.xml`));
  let output = '';
  let failure = '';
  try {
    output = execFileSync('bash', [
      'scripts/jdk25.sh', MVN, '-B', ...(MVN_OFFLINE ? ['-o'] : []), '-pl', 'yudao-server', '-am',
      `-Dtest=${classes.join(',')}`, '-DfailIfNoTests=false', '-Dsurefire.failIfNoSpecifiedTests=false',
      '-DargLine=-Djdk.attach.allowAttachSelf=true -XX:+EnableDynamicAgentLoading',
      ...(MVN_REPO ? [`-Dmaven.repo.local=${MVN_REPO}`] : []), 'test',
    ], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe', timeout: 30 * 60 * 1000 });
  } catch (e) {
    output = `${e.stdout || ''}\n${e.stderr || ''}`;
    failure = e.signal ? `signal ${e.signal}` : `exit ${e.status}`;
  }
  const verdicts = classes.map((name, index) => {
    if (!existsSync(reports[index])) return `${name}: no surefire report (${failure || 'missing'})`;
    const xml = readFileSync(reports[index], 'utf8');
    const attr = (key) => {
      const found = xml.match(new RegExp(`\\b${key}="(\\d+)"`));
      return found ? Number(found[1]) : -1;
    };
    const tests = attr('tests');
    const failures = attr('failures');
    const errors = attr('errors');
    return `${name}: ${tests} tests, ${failures} failures, ${errors} errors`;
  });
  const ok = verdicts.every((line) => {
    const found = line.match(/: (\d+) tests, (\d+) failures, (\d+) errors/);
    return found && Number(found[1]) > 0 && Number(found[2]) === 0 && Number(found[3]) === 0;
  });
  return { ok, verdict: verdicts.join('; '), tail: output.slice(-1500) };
}
