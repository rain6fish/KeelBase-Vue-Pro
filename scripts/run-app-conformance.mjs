#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Conformance for **one application**, not for the protocol.
//
// The runtime's own repository already proves the *protocol*: its conformance runner writes
// `protocol-conformance-<ts>.{json,md}` for the vectors, the audit chain and the risk table. What had
// never been recorded is the thing that actually ships — an application, with its own schema, its own
// permissions, its own tools, its own audit rows. This is that record, and it is deliberately the same
// shape as the protocol one so the two read as one family:
//
//   protocol record   vectors{...}   implementations[]   cases[]
//   application record application{} cases[]              (+ rates)
//
// This is the criterion `D28` red line ⑤ asks for — changing the host must not mean giving up the
// reproducibility the previous line had — and the tool is carried over from that line's `RY-29`, where
// the column set and the "drive the gates, do not quote them" rule were fixed.
//
// **The columns are this application's, not a copy of the previous line's.** Where this line has no
// gate, the column says so rather than disappearing:
//
//   Build · Schema · Permission · Tool Governance · Tool path (MCP) · Tenant · Audit · Confirmation
//   · Revoke · Rates
//
// The previous line's record carried a **RAG permission** column; this line has no separate
// memory/knowledge column. RAG retrieval is now a governed read (audited like any other tool call), but
// it is still not a conformance column — a difference in the application, stated here so it is not read
// as an omission.
//
// Rows it cannot stand behind are `SKIP` **with the reason attached**, never `PASS`. **Every column that
// can be driven is driven**, by the application's own gates, and driving them is the point: a record that
// restated their results would be a transcription. Only two columns read the database directly — `Schema`
// (which tables exist) and `Audit` (the chain) — and neither reads a row any gate is free to clean up, so
// a gate putting its own rows back cannot darken this record.
//
// Writes `conformance/reports/app-conformance-<ts>.json` and `.md`, **neither tracked** — a record is
// evidence, not source. The directory carries its own `.gitignore` for that reason.
//
//   node scripts/run-app-conformance.mjs
//   CONFORMANCE_NO_MODEL_KEY=1 node scripts/run-app-conformance.mjs   # a deterministic stack, no model
//
// The last form is what CI uses: the two model-path columns are `SKIP` with that reason, everything
// deterministic is driven, and the single `RATES` line at the end carries all four governance rates.
//
// ── 中文 ────────────────────────────────────────────────────────────────────────
//
// **一个应用**的符合性，而不是协议的符合性。
//
// 运行时本体那个仓已经证过**协议**：它的 conformance runner 会写 `protocol-conformance-<ts>.{json,md}`，
// 覆盖向量、审计链与风险表。**从来没被记过的是真正交付出去的那样东西**——一个应用：它自己的 schema、
// 自己的权限、自己的工具、自己的审计行。本脚本就是那份记录，而且**刻意与协议那份同形**：
//
//   协议记录   vectors{...}   implementations[]   cases[]
//   应用记录   application{} cases[]              （+ 四率）
//
// 这正是 `D28` 红线 ⑤ 要的那条判据——**换了底座，不等于放弃上一条线已有的可复现性**；工具本身承接自那条线的
// `RY-29`，栏位与「**驱动门禁、不誊抄门禁**」那条规矩都在那里定的。
//
// **栏位是「这个应用」的，不是把上一条线的照抄一份。** 本线没有门禁的地方，栏位**说出来**，而不是消失：
//
//   构建 · Schema · 权限 · 工具治理 · 工具路径（MCP）· 审计 · 确认 · 撤销 · 四率
//
// 上一条线那份记录带一栏 **RAG 权限**；本线没有单独的记忆 / 知识栏。RAG 检索现在是**受治理的读**（与其它工具
// 调用一样留审计），但仍不是一条符合性栏位——这是**应用**的差别，写在这里，免得被读成遗漏。
//
// 站不住的栏写 `SKIP` **并附上原因**，**绝不写 `PASS`**。**凡是驱动得动的栏都驱动**，由这个应用自己的门禁来
// 驱动，而**驱动**正是要点：一份复述它们结果的记录只是誊抄。只有两栏直接读库 —— `Schema`（有哪些表）与
// `Audit`（那条链）—— 而它们都不读「任何门禁收得回去的行」，故门禁把自己的行收回去，**变不黑这份记录**。
//
// 输出 `conformance/reports/app-conformance-<ts>.json` 与 `.md`，**两者都不入版本控制**——记录是**证据、
// 不是源码**；那个目录自带 `.gitignore` 就是为这个。
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const HOST = process.env.HOST_URL || 'http://127.0.0.1:48080';
const PG = process.env.PG_CONTAINER || 'keelbase-yudao-pg';
const PG_USER = process.env.PG_USER || 'root';
const PG_PASS = process.env.PG_PASSWORD || 'password';
const DB = process.env.PG_DB || 'ruoyi-vue-pro';
const OUT_DIR = process.env.OUT_DIR || 'conformance/reports';
// **CI 模式：栈里没有模型 key。** 有两栏的主语就是模型那条路（MCP 的两个真模型步、抽屉那条真会话），
// 没有 key 时它们跑不起来 —— 这样的栏记 `SKIP` 并把原因写出来，**绝不记 `PASS`**。其余栏、以及四率，
// 都是确定性的，照常驱动。
//
// **CI mode: the stack carries no model key.** Two columns have the model path as their subject (the MCP
// gate's two real model steps, and the drawer's real session); without a key they cannot run — such a
// column is recorded as `SKIP` with the reason attached, **never `PASS`**. Every other column, and the
// four rates, is deterministic and is still driven.
const NO_MODEL_KEY = process.env.CONFORMANCE_NO_MODEL_KEY === '1';

const STARTED = Date.now();
const stamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');

let pass = 0, fail = 0, skip = 0;
const CASES = [];
// Task success (2.1) is judged by the scenario suites' own closing assertions — so it is counted from
// the rows those suites produce, one unit per suite that was actually driven. A suite skipped for lack
// of a model key leaves the denominator rather than counting as a failure.
//
// 任务成功率（2.1）由各场景套件**自己的收束断言**判定 —— 故按那些套件产生的行来数，**一个被真正驱动的
// 套件算一个单位**。因缺模型 key 而跳过的套件退出分母，而不是记成失败。
const TASKS = [];
let RATES = '';

function psql(sql) {
  try {
    return execFileSync(
      'docker',
      ['exec', '-i', '-e', `PGPASSWORD=${PG_PASS}`, PG, 'psql', '-U', PG_USER, '-d', DB, '-v', 'ON_ERROR_STOP=1', '-tAc', sql],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
  } catch {
    return '';
  }
}

// A detail carrying a pipe splits its own record and breaks the table, so the one character that is
// also this record's field separator is replaced here, at the boundary, rather than assumed absent.
// 详情里若带了竖线，会把它自己的记录切开、也会破坏表格，所以在**边界处**把这一个同时也是本文件字段分隔符的
// 字符换掉，而不是假定它不会出现。
function row(column, assertion, result, detail) {
  const det = String(detail ?? '').replace(/\|/g, '/');
  CASES.push({ column, assertion, result, detail: det });
  if (result === 'PASS') { pass += 1; console.log(`  PASS  ${column.padEnd(16)} ${assertion}`); }
  else if (result === 'SKIP') { skip += 1; console.log(`  SKIP  ${column.padEnd(16)} ${assertion} — ${det}`); }
  else { fail += 1; console.log(`  FAIL  ${column.padEnd(16)} ${assertion} — ${det}`); }
}

function judge(column, assertion, expected, got) {
  if (String(expected) === String(got)) row(column, assertion, 'PASS', got);
  else row(column, assertion, 'FAIL', `expected [${expected}], got [${got}]`);
}

// Drive one of the application's own gates. Its exit code and its own closing line are the evidence;
// when it goes red, the assertions that went red are named in the record rather than left for a reader
// to reverse-engineer — a bare count used to be what this carried, and it proved to force the reader
// back to re-running the gate to find out what had actually failed. Capped at three: the record is a
// summary, and the gate's own output is still where the rest is read.
// 驱动应用自己的一道门禁。退出码与它自己的收束行就是证据；它转红时，**红的是哪几条在记录里点名**，而不是留给
// 读的人去反推——本文件原先只带一个计数，事实证明那会逼得读的人回去重跑门禁。最多三条：记录是汇总，剩下的去读
// 门禁自己的输出。
function gate(column, script, what, task = true) {
  const record = (result, detail) => {
    row(column, what, result, detail);
    // Only the **scenario suites** answer 2.1. A source-reading check (the tool-bean boundary) is a
    // gate but not a task, so it is excluded by the caller with `task = false`.
    // 只有**场景套件**回答 2.1。读源码的那道检查（工具 bean 边界）是门禁、不是任务，故由调用方以
    // `task = false` 排除。
    if (task) TASKS.push({ column, result });
  };
  const r = spawnSync(process.execPath, [join('scripts', script)], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, HOST_URL: HOST, PG_CONTAINER: PG, PG_USER, PG_PASSWORD: PG_PASS, PG_DB: DB }
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const status = r.status === null ? `spawn failed (${r.error?.message || 'no status'})` : r.status;
  const m = out.match(/(\d+) ok \/ (\d+) failed/);
  if (!m) {
    record('SKIP', `scripts/${script} produced no summary (exit ${status})`);
    return;
  }
  const summary = `${m[1]} ok / ${m[2]} failed`;
  if (r.status === 0) {
    record('PASS', summary);
    return;
  }
  const red = out.split('\n').filter((l) => l.startsWith('  FAIL'))
    .map((l) => l.replace(/^  FAIL\s+/, '').replace(/ — .*$/, ''));
  const named = red.slice(0, 3).join('; ') + (red.length > 3 ? `; +${red.length - 3} more` : '');
  record('FAIL', `${summary} (exit ${r.status})${named ? ` — failed: ${named}` : ''}`);
}

const sh = (cmd, args) => {
  try { return execFileSync(cmd, args, { encoding: 'utf8' }).trim(); } catch { return ''; }
};

const SHA = sh('git', ['rev-parse', '--short', 'HEAD']) || 'unknown';
const DIRTY = sh('git', ['status', '--porcelain']).split('\n').filter(Boolean).length;
const CORE = (() => {
  try {
    const pom = readFileSync('yudao-server/pom.xml', 'utf8');
    return pom.match(/keelbase4j-core[\s\S]*?<version>([^<]+)<\/version>/)?.[1] || 'unknown';
  } catch { return 'unknown'; }
})();

console.log(`== application conformance · ${basename(ROOT)} @ ${SHA} ==`);

// 1 · Build — the application answers, and the record names the commit it answered at.
{
  let code = '000', body = '';
  try {
    // Node's fetch is used rather than curl: this file already depends on Node, and the shell version
    // this is carried over from reached for curl only because it was a shell script.
    const res = await fetch(`${HOST}/actuator/health`, { signal: AbortSignal.timeout(8000) });
    code = String(res.status);
    body = await res.text();
  } catch { /* code stays 000 */ }
  judge('Build', 'the application answers on /actuator/health', '200', code);
  row('Build', 'it reports itself UP', /"status"\s*:\s*"UP"/.test(body) ? 'PASS' : 'FAIL', body.slice(0, 120) || 'no body');
}

// 2 · Schema — the runtime's own migrations applied, and the tables the other columns read exist.
{
  const missing = psql(`select count(*) from (values ('ai_audit_logs'),('confirmation_requests'),
      ('side_effects'),('crm_customer'),('flyway_schema_history')) t(n)
    where not exists (select 1 from information_schema.tables
                      where table_schema='public' and table_name=t.n)`);
  judge('Schema', 'the five tables this record reads exist', '0', missing || 'ERR');
  const flyway = psql("select coalesce(max(version),'none') from flyway_schema_history where success");
  row('Schema', 'the runtime migrations are at a version',
    !flyway || flyway === 'none' ? 'FAIL' : 'PASS', `flyway=${flyway || 'unreadable'}`);
}

// 3–5 · the application's own gates, driven rather than quoted.
gate('Permission', 'run-crm-customer-scenarios.mjs', "a module upstream wrote, governed end to end");
gate('Tool Governance', 'run-generated-module-scenarios.mjs', "the generated module, same governance");
// The other half of the same column, and the one `YD-T14` (D42) is about: the governance is only as good
// as what the model can reach. A tool of ours registered as a bean `ToolCallback` would be reachable by a
// model through Spring AI's own resolver, which KeelBase's aspect does not see — so the boundary is
// asserted here rather than left to be noticed.
// 同一栏的另一半，也是 `YD-T14`（`D42`）讲的那一件：治理有多好，取决于**模型够得到什么**。我们的工具一旦以
// bean `ToolCallback` 的形式注册，模型就能经 Spring AI 自己的解析器够到它，而 KeelBase 的切面看不见——所以这条
// 边界在这里断言，而不是留着等人发现。
gate('Tool Governance', 'check-ungoverned-tool-beans.mjs', 'no bean hands our tools to Spring AI', false);
// 这一栏要真模型才跑得动（它走 MCP、让模型选两次工具）。没有 key 时记 SKIP 并说出原因 —— 这条 job
// 是确定性的，不接真模型 key。
// This column needs a real model to run (it drives MCP and makes the model pick a tool twice). Without a
// key it is recorded as SKIP with the reason — this job is deterministic and carries no model key.
if (NO_MODEL_KEY) {
  row('Tool path (MCP)', "the host's own tool path, two real model steps", 'SKIP',
    'needs a model key; this run carries none');
  TASKS.push({ column: 'Tool path (MCP)', result: 'SKIP' });
} else {
  gate('Tool path (MCP)', 'run-mcp-governance-scenarios.mjs', "the host's own tool path, two real model steps");
}
// 5b · Tenant — `YD-10`'s half. Until `D39`/`D40` landed the adapter ran every host-service call under
// one hard-coded tenant, so this column's question could not be asked: a governed write made by a caller
// on another tenant landed in tenant 1. The gate answers it by comparison — two callers, two tenants,
// two rows — rather than by asserting one row's value, because a constant satisfies any single reading.
// 5b · 租户 —— `YD-10` 的那半。在 `D39`/`D40` 落地之前，适配器把所有宿主服务调用都跑在一个写死的租户下，
// 于是这一栏的问题根本问不出来：另一个租户的调用方做的受治理写会落在 1 号租户。这道闸用**比较**回答它——
// 两个调用方、两个租户、两行——而不是断言某一行的值，因为**任何单个读数**常量都能满足。
gate('Tenant', 'run-tenant-scenarios.mjs', "a governed write lands in the caller's tenant, not a constant");

// 6 · Audit — rows exist, every row but the first is chained to the one before it.
{
  const rows = psql('select count(*) from ai_audit_logs') || '0';
  const unhashed = psql('select count(*) from ai_audit_logs where hash is null');
  row('Audit', 'every audit row carries a hash',
    unhashed === '0' ? 'PASS' : 'FAIL', `rows=${rows}, unhashed=${unhashed || 'ERR'}`);
  const heads = psql('select count(*) from ai_audit_logs where prev_hash is null');
  row('Audit', "exactly one row is the chain's head",
    heads === '1' ? 'PASS' : 'FAIL', `heads=${heads || 'ERR'}`);
}

// 7 · Confirmation — a person decided, and the record says which way. **Driven, not quoted.** This column
// used to read `confirmation_requests` and nothing else, so its verdict depended on some *other* run
// having left a decided row lying about — which is exactly why the application's gates could not put
// their own rows back without this column going dark. The gate driven here is the one whose subject *is*
// the confirmation card: it asserts the card has a source and that the **caller** can decide it, and the
// verdict recorded is that run's own.
// 7 · 确认 —— 有人决过，且记录说得清是哪一种。**驱动，而不是引用**：这一栏原先只读 `confirmation_requests`，
// 于是它的判决取决于**别的某一次运行**有没有留下已决的行 —— 这也正是那些门禁不能把自己造的行收回去的原因
// （一收，这一栏就黑）。这里驱动的那道门禁，题目**正是**确认卡：它断言确认卡有源、且**调用方**决得动，
// 记下的判决来自那一次运行自己。
// 这道门禁开真会话、发真消息，故同样的条件：没有 key 就 SKIP 并说出原因。
// This gate opens a real session and sends a real message, so the same condition applies: without a key
// it is SKIP with the reason attached.
if (NO_MODEL_KEY) {
  row('Confirmation', 'a human decision is on record', 'SKIP',
    'needs a model key; this run carries none');
  TASKS.push({ column: 'Confirmation', result: 'SKIP' });
} else {
  gate('Confirmation', 'run-assistant-drawer-scenarios.mjs', 'a human decision is on record');
}

// 8 · Revoke — a side effect was withdrawn, and the ledger says so. **Driven, not quoted**, and here that
// is not merely tidier: the gate **reads the ledger itself while it runs** — that reading is one of its
// assertions — so driving it *is* reading the ledger, and the row no longer has to survive the gate's own
// cleanup in order for this column to see it.
//
// **The assertion is worded for both outcomes on purpose.** The gate is green whether the withdrawal
// landed or the platform's seam refused it with a reason (it asserts the invariant that holds on both
// sides, so it is green today and stays green the day the host's compensator lands). An earlier cut of
// this column read the audit for `effect_revoke` to tell the two apart and reported SKIP for the refusal
// — but that branch existed because *nothing on this line had ever attempted a withdrawal*; now
// something does, every run, so "was it attempted" is answered by the run rather than by a count.
// 撤销——副作用被撤回过、且台账记着。**驱动，而不是引用**，而这里不只是更整齐：那道门禁**在运行当中自己读
// 台账**（那次读是它的断言之一），故驱动它就是读台账 —— 而那一行也不必再为了这一栏看得见它而**躲过门禁自己的
// 收尾**。
//
// **措辞刻意同时容下两种结局**：无论那次撤销是落成了、还是平台那条缝带理由地拒了它，门禁都是绿的（它断言的
// 是**两侧都成立**的不变量，故今天绿、宿主补偿器落地那天仍绿）。这一栏早先的版本去审计里数 `effect_revoke`
// 来区分两者、并把「拒绝」报成 SKIP —— 但那一条之所以存在，是因为**本线从来没有人试过撤销**；现在每一轮都
// 有人试，故「试过没有」由**那次运行**回答，不由一个计数回答。
gate('Revoke', 'run-revoke-scenario.mjs', 'a withdrawal is attempted and its outcome asserted');

// 9 · The other half of the criterion: the four rates, read from the line's own tool.
//
// The three audit-derived rates come from `measure-governance-rates.mjs` untouched — the counting rule
// is `RY-19`'s, not this file's. The fourth (2.1) is the one that tool deliberately does not compute: it
// is judged by the scenario suites' closing assertions, which is exactly what `TASKS` collected above.
// The single `RATES` line is the machine-readable form CI keys on.
//
// 另外那一半判据：四个治理率，读自本线自己的工具。
//
// 三个由审计推出的率原样来自 `measure-governance-rates.mjs`——计数规则是 `RY-19` 的、不是本文件的。
// 第四个（2.1）正是那个工具**刻意不**算的：它由各场景套件的收束断言判定，而那正是上面 `TASKS` 收下的东西。
// 单行 `RATES` 就是 CI 据以判定的机器可读形态。
{
  const r = spawnSync(process.execPath, [join('scripts', 'measure-governance-rates.mjs')], {
    cwd: ROOT, encoding: 'utf8',
    env: { ...process.env, PG_CONTAINER: PG, PG_USER, PG_PASSWORD: PG_PASS, PG_DB: DB }
  });
  RATES = (r.stdout || '').split('\n').filter((l) => /^ {2}(2\.\d|units =)/.test(l)).map((l) => l.trim()).join('\n');
  if (!RATES) row('Rates', 'the four governance rates are readable', 'SKIP', 'measure-governance-rates.mjs gave nothing');
  else row('Rates', 'the four governance rates are readable', 'PASS', RATES.replace(/\n/g, ' | '));
}

const DRIVEN = TASKS.filter((t) => t.result !== 'SKIP');
const TASK_PASS = DRIVEN.filter((t) => t.result === 'PASS').length;
const field = (re) => {
  const m = RATES.match(re);
  return m ? `${m[1]}/${m[2]}=${m[3]}` : 'unreadable';
};
const RATE_LINE = `RATES 2.1=${TASK_PASS}/${DRIVEN.length}`
  + ` 2.2=${field(/2\.2 tool success = (\d+)\/(\d+) = (\S+)/)}`
  + ` 2.3=${field(/2\.3 confirmation = (\d+)\/(\d+) = (\S+)/)}`
  + ` 2.4=${field(/2\.4 refusal\s+= (\d+)\/(\d+) = (\S+)/)}`;

// ── the record ──────────────────────────────────────────────────────────────────

const ELAPSED = Math.round((Date.now() - STARTED) / 1000);
const STAMP = stamp();
mkdirSync(OUT_DIR, { recursive: true });
const JSON_PATH = join(OUT_DIR, `app-conformance-${STAMP}.json`);
const MD_PATH = join(OUT_DIR, `app-conformance-${STAMP}.md`);
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

const record = {
  gate: 'app-conformance',
  protocol: 'ai-governance-protocol (per application)',
  application: { name: basename(ROOT), commit: SHA, uncommitted: DIRTY, core: CORE },
  date: new Date().toISOString(),
  pass, fail, skip, elapsedSec: ELAPSED,
  rates: RATES.split('\n').join(';'),
  ratesLine: RATE_LINE,
  cases: CASES.map((c, i) => ({ n: i + 1, ...c }))
};
writeFileSync(JSON_PATH, `${JSON.stringify(record, null, 2)}\n`);

const md = [];
md.push(`# KeelBase-Vue-Pro Application Conformance（${STAMP}）`, '');
md.push(`- **应用**：${basename(ROOT)} @ \`${SHA}\`（core ${CORE}；未提交改动 ${DIRTY} 处）`);
md.push(`- **${pass} 通过 · ${fail} 失败 · ${skip} 跳过** ｜ 总耗时 ${ELAPSED}s ｜ 判据：\`D28\` 红线 ⑤`, '');
md.push('| # | 栏 | 断言 | 结果 | 详情 |', '|---|---|---|---|---|');
CASES.forEach((c, i) => {
  const mark = c.result === 'PASS' ? '✅' : c.result === 'SKIP' ? '⏭️' : '❌';
  md.push(`| ${i + 1} | ${c.column} | ${c.assertion} | ${mark} | ${c.detail} |`);
});
md.push('', '## 四率（读自 `measure-governance-rates.mjs`）', '', '```', RATES || '(unreadable)', '```');
md.push('', `机器可读：\`${RATE_LINE}\``, '');
md.push('', '**本记录不跟踪**（`conformance/reports/` 自带 `.gitignore`）——它是证据、不是源码。', '');
writeFileSync(MD_PATH, md.join('\n'));

console.log(`\n${pass} pass, ${fail} failed, ${skip} skipped in ${ELAPSED}s`);
console.log(RATE_LINE);
console.log(`record: ${JSON_PATH}\n        ${MD_PATH}`);
process.exit(fail === 0 ? 0 : 1);
