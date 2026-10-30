// SPDX-License-Identifier: Apache-2.0
//
// FMS 的门禁：`YD-28` 那个「第五个模块」——**第一个非 CRM** 的——走一遍与 CRM、BPM、系统站内信**同形**的四件事：
// 以明确身份访问 · 越权被拒 · 高风险写被扣下等人 · 副作用可审计。
//
//   bash scripts/run-server.sh &            # 一套跑着的栈：PostgreSQL + redis
//   node scripts/run-fms-voucher-scenarios.mjs
//
// **它要回答的不是「能不能接」，而是「第四次接线长什么样」。** 该模块与前三个都不同的一点已经落在治理切面上、
// 也在这里显形：FMS 的门槛是**账套**（`fms_account_user` 的 level），而**行范围**这一问模块自己**没有问过** ——
// 它的分页只校验账套权限，同一账套里别人录的凭证照样看得见。故本门禁的夹具必须**自己造一个账套**（连两张成员行），
// 而收窄那一句由切面把调用方的 id 放进模块**本来就认**的 `creatorUserId` 筛选位来完成。
//
// **「本轮唯一」这次落在账套名上。** 前三个模块的标记都写在一列自由文本里（CRM 的 `name`、BPM 的 `reason`、
// 系统站内信的 `template_content`）。`fms_voucher` **没有**这样的列 —— 故本轮的标记写进
// `fms_account_set.company_name`，而**账套 id 就是本轮的把手**：每一行都挂在它下面，删它一棵树就收干净了。
//
// 它建的每一样，跑完都拆掉；**审计行刻意留着**（那是一条哈希链，剪它一环比凌乱更坏）。
//
// The gate for FMS: `YD-28`'s fifth module, the **first that is not CRM**, walked through the same four things CRM,
// BPM and the system in-app messages are held by: reached under an explicit identity, out-of-scope access refused, a
// high-risk write held for a human, the side effect auditable.
//
// What it answers is not "can it be wired" but "what does a fourth wiring look like". One way this module differs
// from the other three is already on the advice and shows up here: FMS's gateway is the **account set** (the level in
// `fms_account_user`) and the module never asked the row-scope question — its page checks the account-set permission
// and shows other people's vouchers in the same set. So the fixture has to **build an account set of its own** (with
// two membership rows), and the narrowing is the advice putting the caller's id into the `creatorUserId` filter the
// module already honours.
//
// **This run's unique marker goes on the account set's name.** The other three modules wrote theirs into a text
// column (CRM's `name`, BPM's `reason`, the notify module's `template_content`); `fms_voucher` has no such column —
// so the marker goes into `fms_account_set.company_name`, and **the account-set id is this run's handle**: every row
// hangs off it, and removing it takes the tree down.
//
// Everything it creates, it removes again. It does **not** remove audit rows: those are a hash chain, and cutting a
// link to tidy up after a gate would be a worse act than the untidiness.
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
const VOUCHER = process.env.FMS_VOUCHER_TABLE || 'fms_voucher';
const ACCOUNT_SET = process.env.FMS_ACCOUNT_SET_TABLE || 'fms_account_set';
const ACCOUNT_USER = process.env.FMS_ACCOUNT_USER_TABLE || 'fms_account_user';
const PENDING_REVIEW = 0; // FmsVoucherStatusEnum.PENDING_REVIEW / 待审核
const APPROVED = 1; // FmsVoucherStatusEnum.APPROVED / 已审核
// 账套成员档位：`FmsAccountUserLevelEnum` = 1 主管 / **2 查看者（只读）** / 3 会计（可写）。乙必须拿 **3** —— 给 2 的
// 话，模块自己的 `validateAccountSetWritePermission` 就会先把那笔写拒掉，而那道拒绝**不是**本门禁要证的那一道：
// 场景 4 要证的是**行范围**被切面收束，故账套这一层必须先放行，否则两条拒绝分不开。**第一次跑就是这么红的**。
//
// The account-set level: 1 owner / **2 viewer (read-only)** / 3 accountant (can write). The second caller must hold
// **3** — at 2 the module's own `validateAccountSetWritePermission` refuses the write first, and that refusal is
// **not** the one this gate is about: scenario 4 is about the **row scope** being narrowed by the advice, so the
// account-set layer has to let it through or the two refusals cannot be told apart. That is how the first run failed.
const WRITE_LEVEL = 3; // FmsAccountUserLevelEnum.WRITE / 会计

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
// Clean up on the way out as well. The cleanup is held as a **function** and attached the moment this run creates its
// first row (see `putBack = …` below) rather than only at the end of the file — otherwise it is empty on the "created
// rows, then died" path, which is the one measured twice on this line. `process.on('exit')` also fires when an
// uncaught exception takes the process down (measured 2026-10-15: `code=1`), and `psql()` is synchronous, so it runs
// there.
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

// One request, retried **once** when the host answers its transient 500 — same note, same reason as the sibling gates.
// 一次请求，宿主答那个瞬时 500 时**重试一次** —— 注解与理由同兄弟门禁。
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
    body: JSON.stringify({ message, conversationId: `fmsgate-${Date.now()}`, ...extra })
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

// 撤销端点，按控制台调用它的方式来调（与 `run-revoke-scenario.mjs` 同一处）。**状态码也是证据的一部分**：
// 拒绝与成功靠它分辨，不只靠正文。
//
// The withdrawal endpoint, called the way the console calls it (the same call `run-revoke-scenario.mjs` makes). The
// status code is part of the evidence: a refusal and a success are told apart by it, not by the body alone.
async function revokeEffect(id, token) {
  const res = await fetch(`${HOST}/ai/tool-effects/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  let body = '';
  try { body = await res.text(); } catch { /* a body we cannot read is itself reported below */ }
  return { status: res.status, body };
}

// 与兄弟门禁相同的两处读法，理由也一样：调用方的确认中心在本宿主答 500（它查一个本 schema 没有的 `mode` 列），
// 而聊天答案是冻结的 `chat-response`、不带 `status`/`data`/`token`。故「等待中的那一行」读运行时自己的表、
// 「跑没跑」读审计轨。
//
// The same two reads the sibling gates use, for the same recorded reason: the caller's confirmation centre answers
// 500 on this host, and the chat answer is the frozen `chat-response` with no `status`, `data` or `token`.
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

// 场景 2 要断**页的内容**，而运行时不上线工具的结果：冻结的 `chat-response` 没有 `data`，流式的 `tool_end`
// 也只有成功与否。故「页里有没有那一行」只能从**模块自己的分页端点**读 —— 它与工具走的是**同一个**服务方法
// `FmsVoucherService.getVoucherPage`，而收窄那条通知正切在它上面。第二个调用方因此要持有 `fms:voucher:query`：
// `common` 没有这个码（也不该为一道门禁去放宽它），故本轮给它一条**只带这一个码**的角色。数据范围必须是
// `SELF`(5) —— 新角色默认 `ALL`(1)，而 `callerToEnforce()` 对「范围 = 全部行」的调用方返回 null，收窄就整条
// 不发；这一场要证的恰恰是它发。
//
// Scenario 2 asserts the **page's content**, and the runtime puts no tool result on the wire: the frozen
// `chat-response` has no `data`, and the streaming `tool_end` carries only success. So "is that row on the page"
// can only be read from the **module's own page endpoint** — it and the tool cross the **same** service method
// `FmsVoucherService.getVoucherPage`, which is where the narrowing advice sits. The second caller therefore needs
// `fms:voucher:query`: `common` does not hold it (and should not be widened for a gate), so this run gives it a
// role carrying **that one code**. The data scope must be `SELF` (5) — a new role defaults to `ALL` (1), and
// `callerToEnforce()` answers null for a caller whose scope is every row, which stands the narrowing down; what
// this scene needs is exactly that it stands up.
async function ensureFmsReader(adminToken) {
  const menuIds = psql("select string_agg(id::text, ',') from system_menu"
    + " where permission = 'fms:voucher:query' and deleted = 0");
  if (!menuIds) {
    throw new Error('fms:voucher:query 不在 system_menu 里 —— 这套库的菜单种子缺这一条，场景 2 的页就读不到');
  }
  let roleId = psql("select id from system_role where code = 'gate_fms_reader' and deleted = 0 limit 1");
  if (!roleId) {
    const role = await api('/system/role/create', {
      method: 'POST', token: adminToken,
      body: { name: 'gate-fms-reader', code: 'gate_fms_reader', sort: 99, status: 0,
        remark: 'FMS gate: the page permission only, so the read narrowing is asserted by content' }
    });
    if (role.code !== 0) throw new Error(`create reader role -> ${role.code}: ${role.msg}`);
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
  // 与 `gatesales` 一样**按名复用、不收尾**：这条角色是夹具的一部分，不是本轮的业务行。
  // Reused by name and **not** removed on the way out, like `gatesales`: the role is part of the fixture, not
  // this run's business rows.
  return Number(roleId);
}

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
  const readerRoleId = await ensureFmsReader(admin);
  await api('/system/permission/assign-user-role', {
    method: 'POST', token: admin,
    body: { userId: Number(secondId), roleIds: [Number(roles), readerRoleId] }
  });
}
const second = await login(SECOND_USER, SECOND_PASS);
ok('第二个调用方登录');

// ── the rows: one account set of this run's own, two members, two vouchers ──────────────────────────
console.log('== 场景 1 · 本模块自己的表（含它自己的门槛：账套） ==');
const marker = `fmsgate-${Date.now()}`;
// 收尾**在这里**就挂上：账套一建，把它一棵树收回去就成立，下面任何一处崩了退出处理器都会跑它。把手是**账套 id**
// —— 本轮每一行都挂在它下面，故删它一棵树就收干净了；它在**调用时**才查。
//
// The cleanup is attached **here**: once the account set exists, taking its tree back is well-defined, and anything
// below dying still gets it run by the exit handler. The handle is the **account-set id** — every row this run makes
// hangs off it, so removing it takes the tree down — and it is queried **when the cleanup is called**.
putBack = () => {
  const setId = psql(`select id from ${ACCOUNT_SET} where company_name = '${marker}'`);
  if (!setId) return;
  const vouchers = (psql(`select string_agg(id::text, ',') from ${VOUCHER} where account_set_id = ${setId}`) || '').trim() || '0';
  const idAlt = vouchers.split(',').join('|');
  psql(
    [
      `delete from confirmation_requests where args_json ~ '"id"[[:space:]]*:[[:space:]]*(${idAlt})([^0-9]|$)' and status = 'pending'`,
      // 被**拒绝**的那一笔会留下一个没有效应的认领，而「按效应收」够不到它 —— 宿主把切面抛的 `AccessDeniedException`
      // 包成了 `RuntimeException`，运行时的「没落库就释放认领」认不出来（冷读者实测）。故另收一次，范围取**本门禁
      // 自己的工具** + 调用方 + **没有效应**：那一笔既然被拒了，就不存在可被重复执行的写，删它不可能造成重复。
      //
      // A **refused** call leaves a claim with no effect behind, and "delete by effect" cannot reach it — the host
      // wraps the aspect's `AccessDeniedException` in a `RuntimeException`, so the runtime's "nothing landed, release
      // the claim" does not recognise it (measured by the cold reader). Collected separately, scoped to **this gate's
      // own tool** plus the caller plus **no effect**: the call was refused, so there is no write to duplicate.
      `delete from write_claims where user_id = '${secondId}' and tool_name = 'review_fms_voucher' and effect_id is null`,
      `delete from write_claims where effect_id in (select id from side_effects where result_id in (${vouchers}))`,
      `delete from side_effects where result_id in (${vouchers})`,
      `delete from fms_voucher_entry where voucher_id in (${vouchers})`,
      `delete from ${VOUCHER} where account_set_id = ${setId}`,
      `delete from ${ACCOUNT_USER} where account_set_id = ${setId}`,
      `delete from ${ACCOUNT_SET} where id = ${setId}`,
    ].join('; '),
  );
};
// `tenant_id` is not optional on any of these: the DOs extend `BaseDO` and carry no `@TenantIgnore`, so the host's
// tenant interceptor appends `tenant_id = ?` to every path through them.
// 这几张表上 `tenant_id` 都不是可选的：它们的数据对象继承 `BaseDO` 且没带 `@TenantIgnore`，故宿主的租户拦截器给每条路
// 都加 `tenant_id = ?`。
psql(`insert into ${ACCOUNT_SET}(id, company_name, initialized, deleted, tenant_id, creator, create_time, update_time)`
  + ` values (nextval('${ACCOUNT_SET}_seq'), '${marker}', true, 0, ${TENANT}, '1', now(), now())`);
const accountSetId = psql(`select id from ${ACCOUNT_SET} where company_name = '${marker}'`);
check('本轮的账套已种', true, accountSetId !== '');
psql(`insert into ${ACCOUNT_USER}(id, account_set_id, user_id, default_status, founder, level, deleted, tenant_id, creator, create_time, update_time)`
  + ` values (nextval('${ACCOUNT_USER}_seq'), ${accountSetId}, 1, true, true, 1, 0, ${TENANT}, '1', now(), now())`);
psql(`insert into ${ACCOUNT_USER}(id, account_set_id, user_id, default_status, founder, level, deleted, tenant_id, creator, create_time, update_time)`
  + ` values (nextval('${ACCOUNT_USER}_seq'), ${accountSetId}, ${secondId}, true, false, ${WRITE_LEVEL}, 0, ${TENANT}, '1', now(), now())`);
check('两个成员行已种（它是本模块的门槛）', 2, psql(`select count(*) from ${ACCOUNT_USER} where account_set_id = ${accountSetId}`));
// 两张凭证：一张甲录的、一张乙录的 —— 行的归属这次不是专列，而是自动填的审计串 `creator`。
// Two vouchers: one entered by admin, one by the second caller — row ownership here is not a dedicated column but the
// audit string `creator` that MyBatis-Plus fills.
psql(`insert into ${VOUCHER}(id, voucher_number, voucher_time, debit_amount, credit_amount, total, status, account_set_id, attachment_count, deleted, tenant_id, creator, create_time, update_time)`
  + ` values (nextval('${VOUCHER}_seq'), 1, now(), 100.00, 100.00, 100.00, ${PENDING_REVIEW}, ${accountSetId}, 0, 0, ${TENANT}, '1', now(), now())`);
psql(`insert into ${VOUCHER}(id, voucher_number, voucher_time, debit_amount, credit_amount, total, status, account_set_id, attachment_count, deleted, tenant_id, creator, create_time, update_time)`
  + ` values (nextval('${VOUCHER}_seq'), 2, now(), 200.00, 200.00, 200.00, ${PENDING_REVIEW}, ${accountSetId}, 0, 0, ${TENANT}, '${secondId}', now(), now())`);
const adminVoucherId = psql(`select id from ${VOUCHER} where account_set_id = ${accountSetId} and creator = '1'`);
const salesVoucherId = psql(`select id from ${VOUCHER} where account_set_id = ${accountSetId} and creator = '${secondId}'`);
check('甲录的那一张已种', true, adminVoucherId !== '');
check('乙录的那一张已种', true, salesVoucherId !== '');
const statusOf = (id) => psql(`select status from ${VOUCHER} where id = ${id}`);
// 「一字未改」比「状态没变」宽一点：越权那次若落成了，改的不止 `status` —— 审核人也会被记上。
// "Unchanged" is wider than "the status did not move": a landed review would have written the reviewer too.
const reviewerOf = (id) => psql(`select coalesce(reviewer_user_id::text, '') from ${VOUCHER} where id = ${id}`);

console.log('== 场景 2 · 身份传递与读侧收窄：断页的内容，不只数调用次数 ==');
{
  // 前半：两个调用方各触发一次读工具。它断言的是这一回合**跑过了**（从审计轨读），证明的是**路由** —— 身份被
  // 传到了本模块的工具上。它**不**证明收窄：把收窄删掉，这个计数照样是 2（2026-10-23 复核，本门禁的反向实验
  // 复现了这一点）。收窄也不在**写**那条路上显形 —— 场景 4 的拒绝来自 `requireOwned`（读行看 `creator`），而
  // 收窄落在**读**的另一个筛选位上，两条是不同的机制。
  //
  // 后半：**页的内容**，这才是收窄的效果。两条都要断 —— 只断「乙的页里没有甲那一行」，一处根本没种甲那行的
  // 夹具也会绿；只断「甲的页里有那一行」，收窄被删掉也绿。第三条（乙的页里有自己那一行）挡住第三种假绿：页
  // 整个空着。页从**模块自己的分页端点**读、不走工具，因为运行时不上线工具的结果（见 `ensureFmsReader` 上方
  // 的注解）；而该端点与工具调用的是**同一个**被切的服务方法，故它读到的就是这条通知作用之后的那一页。
  //
  // The first half: each caller drives the tool once. It asserts the turn **ran** (read from the trail), which proves
  // **routing** — the identity reached this module's tool. It does **not** prove the narrowing: delete it and the
  // count is still 2 (2026-10-23 review; this gate's negative experiment reproduces it). The narrowing does not show
  // on the **write** path either — scenario 4's refusal comes from `requireOwned` (which reads the row's `creator`),
  // while the narrowing lands in a different, **read**-side filter: two mechanisms.
  //
  // The second half: the **page's content**, which is what the narrowing does. Both halves are required — "the
  // second caller's page lacks the admin's row" alone is green on a fixture that never seeded it, and "the admin's
  // page has it" alone is green with the narrowing deleted. A third check (the second caller's page has its own row)
  // blocks a third false green: a page that is empty entirely. The page is read from the **module's own page
  // endpoint** rather than the tool because the runtime puts no tool result on the wire (see the note above
  // `ensureFmsReader`); that endpoint and the tool cross the **same** advised service method, so what it reads is
  // the page this advice produced.
  const a = await chat(admin, '看我的凭证');
  check('甲触发 FMS 读工具', 'list_my_fms_vouchers', (a.toolCalls || [])[0]);
  check('甲的执行状态（审计轨）', 1, ranAs('list_my_fms_vouchers'));

  const s = await chat(second, '看我的凭证');
  check('乙触发同一个工具', 'list_my_fms_vouchers', (s.toolCalls || [])[0]);
  check('它的执行状态（审计轨）', 2, ranAs('list_my_fms_vouchers'));

  const pageOf = (token) => api(`/fms/voucher/page?accountSetId=${accountSetId}&pageSize=100`, { token });
  const idsOn = (answer) => (((answer || {}).data || {}).list || []).map((row) => String(row.id));
  const adminPage = await pageOf(admin);
  const secondPage = await pageOf(second);
  check('甲的页取到了', 0, adminPage.code);
  check('乙的页取到了', 0, secondPage.code);
  check('甲的页里有甲那一行（夹具确实种了它）', true, idsOn(adminPage).includes(String(adminVoucherId)));
  check('乙的页里没有甲那一行（收窄真的发生了）', false, idsOn(secondPage).includes(String(adminVoucherId)));
  check('乙的页里有乙自己那一行（页不是空着蒙对的）', true, idsOn(secondPage).includes(String(salesVoucherId)));
}

console.log('== 场景 3 · 高风险写入被扣下，批准后落库 ==');
{
  const held = pendingCount(secondId);
  // 那一行以 `targetId` 传递：运行时的聊天请求唯一的结构化槽位，而它是**通用**的。
  // The row travels as `targetId`: the one structured slot the runtime's chat request declares, generic now.
  await chat(second, '审核凭证', { targetId: Number(salesVoucherId) });
  check('写被扣下', held + 1, pendingCount(secondId));
  check('未改（仍是待审核）', PENDING_REVIEW, statusOf(salesVoucherId));
  const proposedToken = pendingToken(secondId);
  checkNot('扣下时给出 token', 'undefined', proposedToken);

  const outcome = await confirm(second, proposedToken, 'approve');
  check('批准后执行', 'executed', outcome.status);
  check('状态已改（已审核）', APPROVED, statusOf(salesVoucherId));
}

console.log('== 场景 4 · 越权写：批准也买不到 ==');
{
  // 同一次调用，打向**别人**录的那一张。批准了结的是**风险**问题、仅此而已：行范围的问题在更下面、在模块自己的接缝上
  // 回答 —— 本通知只问「这一行是不是调用方录的」。
  // Same call, against a voucher someone else entered. The approval settles the risk question and nothing else: the
  // row-scope question is answered lower down, at the module's own seam.
  const hijackHeld = pendingCount(secondId);
  await chat(second, '审核凭证', { targetId: Number(adminVoucherId) });
  check('改别人的行也被扣下', hijackHeld + 1, pendingCount(secondId));
  const hijackDone = await confirm(second, pendingToken(secondId), 'approve');
  note('越权写批准后的结局', hijackDone.status || JSON.stringify(hijackDone).slice(0, 120));
  check('批准了也没执行', true, hijackDone.status !== 'executed');
  check('别人的行一字未改（仍是待审核）', PENDING_REVIEW, statusOf(adminVoucherId));
  check('别人的行一字未改（没记上审核人）', '', reviewerOf(adminVoucherId));
  // **只断言「没执行」是不够的** —— 任何一次失败都会让它绿，包括与本条无关的那种。实测过一次：这条工具在租户
  // 上下文之外读那一行，于是它每次都以「`TenantContextHolder` 不存在租户编号」失败，而「批准了也没执行」照样绿。
  // 故这里断言**拒绝的理由**：它必须点名行范围，且必须不是别的故障。
  //
  // **Asserting only "it did not run" is not enough** — any failure makes that green, including one with nothing to
  // do with this. Measured once: the tool read the row outside the tenant context and so failed every time with "no
  // tenant id in TenantContextHolder", while "it did not run" stayed green. So the refusal's **reason** is asserted
  // here: it has to name the row scope, and it must not be some other fault.
  const why = psql(`select left(detail, 400) from ai_audit_logs where tool = 'review_fms_voucher' and outcome = 'refused' order by id desc limit 1`) || '';
  note('被拒的理由', why.replace(/\s+/g, ' ').slice(0, 120));
  check('不是别的故障（不是租户/数据库错误）', false, why.includes('TenantContextHolder'));
  check('拒绝的理由点名了行范围', true, why.includes('该行不在你的数据范围内'));
}

console.log('== 场景 5 · 审计链与被记下的拒绝 ==');
{
  const rows = Number(psql('select count(*) from ai_audit_logs'));
  check('审计行在（>0）', true, rows > 0);
  const verify = await (await fetch(`${HOST}/audit/verify`, { headers: { Authorization: `Bearer ${admin}` } })).json();
  check('链校验通过', true, verify.data && verify.data.valid);
  const refusals = Number(psql(`select count(*) from ai_audit_logs where tool = 'review_fms_voucher' and outcome = 'refused'`));
  check('被拒的那次写在案', true, refusals > 0);
}

console.log('== 场景 6 · 撤销那条腿：审核能被收回去 ==');
{
  // 判据的五条腿里最后一条。它证的是一条**已经落成的**审核可以被撤回，而且撤回到**模块自己的状态**上 ——
  // 补偿器（模块自己的 `FmsVoucherGovernance` 里的 `FmsVoucherCompensator`，`YD-44` 起随模块走）把状态退回「待审核」，而不是绕过模块
  // 去改那一行。**这一条要能在同一轮里证到**，故它排在场景 3 之后：那一轮刚把这张凭证审过。
  //
  // The last of the criterion's five legs. It proves a **landed** review can be taken back, and taken back to a state
  // of the module's own — the compensator (host-level, in `YudaoLocalCompensators`) puts the voucher back to pending
  // review rather than editing the row behind the module. It has to be provable **within one run**, so it follows
  // scenario 3, which is the turn that reviewed this voucher.
  const effectId = psql(`select id from side_effects where tool_name = 'review_fms_voucher' and result_id = ${salesVoucherId} order by id desc limit 1`);
  check('那一笔写在副作用台账上', true, effectId !== '');
  const r = await revokeEffect(Number(effectId), second);
  note('撤销端点应答', `HTTP ${r.status} ${String(r.body).replace(/\s+/g, ' ').slice(0, 140)}`);
  check('撤销落成（2xx）', true, r.status >= 200 && r.status < 300);
  check('状态退回待审核', PENDING_REVIEW, statusOf(salesVoucherId));
  check('账本读作已撤销', 'revoked', psql(`select revoke_status from side_effects where id = ${effectId}`));
  const revokedOnAudit = Number(psql("select count(*) from ai_audit_logs where action = 'effect_revoke'"));
  check('那次撤销也在审计轨上', true, revokedOnAudit > 0);
}

// ── 收尾：把本轮造的东西收回去 ─────────────────────────────────────────────────────────────────────
//
// 按**本轮那个账套**删：它下面挂着这一轮造的每一行（两张凭证、两条成员），故收尾够不到别的轮次的行 —— 与上面那些
// 断言是同一条纪律。**审计行刻意不动**：哈希链，为收拾凌乱去剪它一环，比凌乱更坏。台账跟着业务行一起撤。
//
// Delete by **this run's account set**: every row it made hangs off it (two vouchers, two memberships), so the
// cleanup cannot reach another run's rows — the same discipline the assertions above follow. The audit rows are
// deliberately left alone (a hash chain; cutting a link to tidy up is worse than the untidiness), and the ledgers go
// with the business rows.
console.log('== 收尾 · 把本轮造的行收回去 ==');
try {
  runPutBack();
  ok('本轮那个账套与其下的行已收回（审计行刻意留着）');
} catch (e) {
  bad('收尾', '本轮那个账套与其下的行已收回', e.message);
}

console.log(`\n${pass} ok / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
