// SPDX-License-Identifier: Apache-2.0
//
// 边界页必须把「它扣不住的」作为独立区块画出来，中英都要有，且内容取自门禁记录 —— 不是模板里手打的一句话。
// 运行：
//
//     node --test scripts/boundary-page.test.mjs
//
// 这些断言刻意停在源码层：本仓不带 Vue 测试运行器，而它构建所依的 UI 检出是一次性的（`target/`），
// 故挂载 SFC 的测试只会在本机绿、下次取树就没了。这里钉的是让这个块成立的三份文件之间的契约 ——
// 组件模板、宿主补丁里的中英词条、页面所读的门禁记录。删掉块、漏掉一条词条、或改掉记录里的 id，都会红。
//
// 同一个契约也钉住 M0 的**治理覆盖账本**那一节：行只带模块/对象/姿态（散文不进产物）、四态在中英两套里都在、
// 记录读的是提交在仓里的 `conformance/governance-coverage.tsv`。
//
// The boundary page must draw the "not held by it" block as its own section, in both languages, from
// the gate's record — not from a sentence typed into the template. Run with:
//
//     node --test scripts/boundary-page.test.mjs
//
// These assertions are deliberately source-level: this repository ships no Vue test runner, and the
// UI checkout it builds from is disposable (`target/`), so a test that mounted the SFC would pass here
// and vanish on the next fetch. What is pinned instead is the contract between the three files that
// make the block real — the component template, the bilingual messages in the host patch, and the
// gate record the page reads. Removing the block, dropping a message, or changing the record's id
// turns this red.
//
// The same contract pins M0's **onboarding ledger** section too: rows stop at module/object/posture (no
// prose in the artefact), both bundles carry the four postures, and the record reads the ledger committed
// at `conformance/governance-coverage.tsv`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'keelbase-ui/host-overlay/src/views/keelbase/governance/BoundaryPage.vue';
const PATCH = 'keelbase-ui/host-patches/0002-governance-ui.patch';
const GATE = 'scripts/check-ungoverned-tool-beans.mjs';
const FACTORY = 'yudao-module-ai1-springai/src/main/java/cn/iocoder/yudao/module/ai1/harness/skill/Ai1SkillToolFactory.java';

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** 取从 `start` 起的那个对象字面量，跳过引号里的花括号。 / take the object literal at `start`, ignoring braces inside quoted strings. */
function objectAt(text, start) {
  let depth = 0;
  let quote = '';
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i += 1;
      } else if (ch === quote) {
        quote = '';
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced object literal');
}

/**
 * 补丁给每一行都加了 `+` 前缀；只剥掉这一个 diff 标记，切片就是构建真正应用的对象。词句的真源留在这里 ——
 * 测试不复述它们。
 *
 * The patch adds every line with a leading `+`; strip that one diff marker so the slice is the object
 * the build actually applies. Values stay source-of-truth here — this test does not restate them.
 */
function boundaryMessages() {
  const patch = read(PATCH);
  const marker = '+    boundary: {';
  const blocks = [];
  for (let at = patch.indexOf(marker); at !== -1; at = patch.indexOf(marker, at + marker.length)) {
    const raw = objectAt(patch, patch.indexOf('{', at));
    const js = raw
      .split('\n')
      .map((line) => line.replace(/^\+/, ''))
      .join('\n');
    blocks.push(new Function(`return (${js})`)());
  }
  assert.equal(blocks.length, 2, 'the patch carries exactly two boundary message blocks (English + Chinese)');
  const en = blocks.find((b) => b.title === 'Governance boundary');
  const zh = blocks.find((b) => b.title === '治理边界');
  assert.ok(en, 'the English boundary block exists');
  assert.ok(zh, 'the Chinese boundary block exists');
  return { en, zh };
}

function templateOf(vue) {
  const start = vue.indexOf('<template>');
  const end = vue.lastIndexOf('</template>', vue.indexOf('\n<script'));
  assert.ok(start >= 0 && end > start, 'the page has a template before its script');
  return vue.slice(start, end);
}

test('the page draws the not-held block as its own section, fed by stated.notHeld', () => {
  const tpl = templateOf(read(PAGE));

  for (const key of ['notHeldTitle', 'notHeldWhat', 'notHeldWhy', 'notHeldOneBean']) {
    assert.match(
      tpl,
      new RegExp(`t\\('keelbase\\.boundary\\.${key}'\\)`),
      `the template renders keelbase.boundary.${key}`,
    );
  }

  // 告诫由记录自己的标志位决定，路径名由它的 id 推出 —— 「是哪条路」没有一个字是页面手打的。
  // The warning is conditional on the record's own flag, and the path name is derived from its id —
  // nothing about "which path" is typed into the page.
  assert.match(tpl, /boundary\.stated\.notHeld\.oneBeanAway/, 'the warning follows stated.notHeld.oneBeanAway');
  assert.match(
    tpl,
    /t\(`keelbase\.boundary\.path\.\$\{boundary\.stated\.notHeld\.id\}`\)/,
    'the path name comes from stated.notHeld.id through the path.* message family',
  );
});

test('the block reads the same in both languages (snapshot)', () => {
  const { en, zh } = boundaryMessages();

  const rendered = (m) => ({
    title: m.notHeldTitle,
    what: m.notHeldWhat,
    upstreamPath: m.path['upstream-resolver'],
    why: m.notHeldWhy,
    oneBeanAway: m.notHeldOneBean,
  });

  assert.deepEqual(rendered(zh), {
    title: '它扣不住的',
    what: '上游自己那条路：chat 取角色的 toolIds、经 Spring AI 自己的解析器把 callback 交给模型 —— 本线治理看不见它。',
    upstreamPath: '上游模型→工具解析器',
    why: '今天无害：本构建里唯一的 ToolCallback bean 是上游自己的示例，故解析器找不到我们的东西。',
    oneBeanAway:
      '只差一个我们自己的 {\'@\'}Bean 交出 ToolCallback —— 模型就够得到它：不经引擎、不经身份、不经确认、不留审计行。',
  });

  assert.deepEqual(rendered(en), {
    title: 'Not held by it',
    what: "Upstream's own path: chat resolves a role's tool ids through Spring AI's own resolver and hands the callbacks to the model. This line's governance does not see it.",
    upstreamPath: 'Upstream model→tool resolver',
    why: 'Harmless today: the only ToolCallback bean in this build is upstream’s own sample, so the resolver has nothing of ours to find.',
    oneBeanAway:
      "One {'@'}Bean of ours handing out a ToolCallback is all it takes: the model would reach it with no engine, no identity, no confirmation and no audit row.",
  });
});

test('both languages carry the same boundary keys, so neither can render a blank block', () => {
  const { en, zh } = boundaryMessages();
  const shape = (o) =>
    Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, v && typeof v === 'object' && !Array.isArray(v) ? shape(v) : typeof v]),
    );
  assert.deepEqual(shape(zh), shape(en));
});

test('the gate record feeds the block: upstream-resolver, one bean away', () => {
  const gate = read(GATE);
  const start = gate.indexOf('notHeld: {');
  assert.ok(start >= 0, 'the gate record has a notHeld entry');
  const notHeld = gate.slice(start, gate.indexOf('}', start));
  assert.match(notHeld, /id:\s*'upstream-resolver'/, 'notHeld names the upstream resolver path');
  assert.match(notHeld, /oneBeanAway:\s*true/, 'notHeld says one bean is enough');

  // 同一条路在 `stated.paths` 里是「未纳入治理 + 只差一个 bean」—— 表与块说的是同一条事实，不是两条。
  // The same path appears in `stated.paths` as not governed with the one-bean gap — the table and the
  // block describe one fact, not two.
  assert.match(gate, /id:\s*'upstream-resolver',\s*posture:\s*'not-governed'/, 'the paths row is not-governed');
  assert.match(gate, /id:\s*'upstream-resolver',[\s\S]*?gap:\s*'one-bean-away'/, 'the paths row carries the one-bean gap');
});

test('the gate record pins the SKILL path as partially governed, and names where', () => {
  const gate = read(GATE);
  const at = gate.indexOf("id: 'ai1-skill'");
  assert.ok(at >= 0, 'stated.paths carries an ai1-skill entry');
  const row = objectAt(gate, gate.lastIndexOf('{', at));

  // 这一行是**手写数据**，不是扫描结果：删掉它、或把它改回「不受治理」，门禁本身都不会红 —— 故由这里红。
  // The row is hand-written data rather than a scan result: deleting it, or declaring the path ungoverned
  // again, would leave the gate itself green — so this is what goes red instead.
  assert.match(row, /posture:\s*'partially-governed'/, 'the SKILL path is declared partially governed');
  for (const held of ['authorization', 'identity', 'audit']) {
    assert.match(row, new RegExp(`holds:\\s*\\[[^\\]]*'${held}'`), `the SKILL path holds ${held}`);
  }
  for (const missing of ['confirmation', 'side-effect-ledger']) {
    assert.match(row, new RegExp(`doesNotHold:\\s*\\[[^\\]]*'${missing}'`), `the SKILL path does not hold ${missing}`);
  }
  assert.match(row, /gap:\s*'external-effect-no-ledger'/, 'the declared gap is an external effect with no ledger row');
  assert.match(row, /Ai1SkillToolFactory\.java:\d+/, 'the row cites the assembly point it describes');
});

/** 一行的两个工具名清单，按写出来的顺序。 / A row's two tool-name lists, in the order written. */
function toolList(row, key) {
  const match = row.match(new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`));
  assert.ok(match, `the row carries ${key}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

test('the record says which SKILL tools run and which are off in a fresh deployment', () => {
  const gate = read(GATE);
  const at = gate.indexOf("id: 'ai1-skill'");
  const row = objectAt(gate, gate.lastIndexOf('{', at));

  // 2026-11-04：默认策略把七个 SKILL 工具写成 `enabled:false`，其中 `Skill` 只加载 SKILL.md —— 新部署里
  // 模型连技能说明都读不到。这份清单是**声明**，改默认值（分类、增删工具、上游改名）就要在这里重新陈述。
  // 2026-11-04: the default policy disables seven SKILL tools, `Skill` (which only loads SKILL.md) among
  // them, so a fresh deployment cannot even read skill content. This list is the declaration; changing
  // the defaults means restating it here.
  assert.match(row, /defaults:\s*'writes-off'/, 'the SKILL path starts with its write tools off');
  assert.deepEqual(toolList(row, 'onTools'), ['Glob', 'Grep', 'ListDirectory'],
    'the read tools that run without a policy');
  assert.deepEqual(toolList(row, 'offTools'),
    ['Bash', 'BashOutput', 'Edit', 'KillShell', 'Read', 'Skill', 'Write'],
    'the tools the default policy disables, including the one that only reads SKILL.md');

  // 每一行都要说明「开箱时」—— 少一行就是一句「默认没写 = 已覆盖」。
  // Every row states its out-of-the-box behaviour; a missing one is "unwritten = covered".
  const from = gate.indexOf('paths: [');
  for (const id of ['runtime-seam', 'upstream-resolver', 'ai1-mcp', 'ai1-rag']) {
    const other = objectAt(gate, gate.lastIndexOf('{', gate.indexOf(`id: '${id}'`, from)));
    assert.match(other, /defaults:\s*'(?:on|writes-off)'/, `the ${id} row states its default`);
  }
});

test('the declared read set is the one the factory actually uses', () => {
  const factory = read(FACTORY);
  const head = factory.slice(factory.indexOf('private static boolean readOnlyTool'));
  const body = head.slice(0, head.indexOf('\n    }'));
  const readLiterals = [...body.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);

  const gate = read(GATE);
  const row = objectAt(gate, gate.lastIndexOf('{', gate.indexOf("id: 'ai1-skill'")));
  const onTools = toolList(row, 'onTools').map((name) => name.toLowerCase());
  const offTools = toolList(row, 'offTools').map((name) => name.toLowerCase());

  // 两处必须说同一件事：Java 的 `readOnlyTool` 决定谁走 R1（因此不落 `enabled:false`），记录里的
  // `onTools` 是给读者看的那一面。改了一边而没改另一边，这里就红 —— 页面上的清单不会悄悄过期。
  // Both sides must say one thing: `readOnlyTool` decides who is R1 (and so gets no `enabled:false`
  // entry), and `onTools` is the reader-facing side. Changing one without the other turns this red.
  assert.deepEqual([...readLiterals].sort(), [...onTools, 'list_directory'].sort(),
    'the record lists the tools the factory treats as reads');
  assert.deepEqual(offTools.filter((name) => readLiterals.includes(name)), [],
    'nothing declared off is a read in the factory');
});

test('the page draws the out-of-the-box state from the row, not from a sentence', () => {
  const tpl = templateOf(read(PAGE));

  assert.match(tpl, /t\('keelbase\.boundary\.colDefault'\)/, 'the table carries the column header');
  assert.match(tpl, /keelbase\.boundary\.defaults\.\$\{row\.defaults\}/, 'the tag comes from the row\'s own defaults');
  assert.match(tpl, /t\('keelbase\.boundary\.defaultsOnTools', \{ tools: row\.onTools/, 'the running tools are drawn');
  assert.match(tpl, /t\('keelbase\.boundary\.defaultsOffTools', \{ tools: row\.offTools/, 'the disabled tools are drawn');
  assert.match(tpl, /t\('keelbase\.boundary\.defaultsHow'\)/, 'how to enable one is on the page');
});

test('both languages label the default states and say how to enable a tool', () => {
  const { en, zh } = boundaryMessages();

  for (const [name, m] of [['English', en], ['Chinese', zh]]) {
    assert.ok(m.colDefault, `${name} labels the column`);
    assert.ok(m.defaults?.on && m.defaults?.['writes-off'], `${name} labels both default states`);
    for (const key of ['defaultsOnTools', 'defaultsOffTools']) {
      assert.ok(m[key]?.includes('{tools}'), `${name} ${key} takes the tool list`);
    }
    // 「怎么放开」必须点得到策略中心；只写「被禁用」而不给下一步，读者只能去翻代码。
    // "How to lift it" must name the Policy Center; saying only "disabled" leaves the reader in code.
    assert.match(m.defaultsHow, /Policy Center|策略中心/, `${name} names where to enable a tool`);
    assert.match(m.defaultsHow, /Skill\b/, `${name} says the SKILL loader itself is off`);
  }
});

test('every path declares business actions, and both languages label each action', () => {
  const gate = read(GATE);
  const { en, zh } = boundaryMessages();

  // M7：读者答不出「哪些动作被扣」，因为页面此前只给检查项。动作 id 与两种语言的词条必须同时存在；
  // 少一个词条就是页面上一条 `keelbase.boundary.actions.x` 原样漏出来。
  // The M7 reader could not name actions because the page only offered controls. Each action id needs a
  // label in both languages; a missing one leaks the raw key onto the page.
  const ids = ['write-records', 'approve-records', 'model-tool-call', 'mcp-read', 'mcp-write',
    'shell', 'file-read', 'file-write', 'knowledge-search'];
  for (const id of ids) {
    assert.match(gate, new RegExp(`'${id}'`), `the gate declares the action ${id}`);
    assert.ok(en.actions?.[id], `English labels the action ${id}`);
    assert.ok(zh.actions?.[id], `Chinese labels the action ${id}`);
  }

  const rows = gate.match(/id: '[^']+',[\s\S]*?actions: \[[^\]]*\]/g) ?? [];
  assert.equal(rows.length, 5, 'all five paths declare at least one action');
});

test('the summary and the table speak in actions, not only controls', () => {
  const vue = read(PAGE);
  const tpl = templateOf(vue);
  for (const set of ['heldActionIds', 'auditedActionIds', 'ungovernedActionIds']) {
    assert.match(tpl, new RegExp(`v-for="a in ${set}"`), `the summary lists ${set}`);
  }
  assert.match(tpl, /v-for="a in row\.actions"/, 'the table has an action column');
  assert.match(tpl, /keelbase\.boundary\.colActions/, 'the action column has its own heading');
});

test('the reading legend points at the action column by name, not by position', () => {
  const { en, zh } = boundaryMessages();

  // M7 的那一问是「哪些**动作**被扣」。图例若按**位置**指列（「第一列」），页面上真正的第一列是路径，
  // 读者会被指到错的那一列 —— 2026-10-31 复核时撞上的就是这句。图例必须按**列名**指，且那个列名就是
  // `colActions`，于是列名一改，图例跟着说，两者不会各说各的。
  // The M7 question is "which **actions** are held". A legend that points at a **position** ("the first
  // column") points at Path instead — measured 2026-10-31. It must name the column, and that name is
  // `colActions`, so a rename cannot leave the legend pointing somewhere else.
  for (const [lang, m] of [['zh', zh], ['en', en]]) {
    assert.ok(m.legend.includes(m.colActions), `${lang} legend names the action column by its label`);
    assert.doesNotMatch(m.legend, /第一列|the first column/, `${lang} legend points at a column position`);
    // 关卡的两种记号也要说明：勾 = 过这道关，破折号 = 不过。只列名字、不说记号，读者仍要自己猜。
    // The two marks the checks column uses have to be explained too: a tick means the gate applies, a
    // dash means it does not. Names alone leave the reader guessing what the marks mean.
    assert.ok(m.legend.includes('✓'), `${lang} legend explains the tick`);
    assert.ok(m.legend.includes('—'), `${lang} legend explains the dash`);
  }
});

test('the summary groups actions by what they meet, not by the path\'s posture', () => {
  const vue = read(PAGE);

  // M7 那一问是「哪些**动作**会被扣」。RAG 检索是一条 `posture='governed'` 的**读**：授权、身份、
  // 审计行都有，但从不等人确认。按 posture 归组会把它摆进「写会被扣下等确认」（2026-10-31 复核实测）
  // —— 那正是读者会照抄的一个错答案。分组必须读这一行自己的 `holds`。
  // The M7 question is which **actions** are held. The RAG read is `posture: 'governed'` and never waits
  // for confirmation; grouping by posture put it under "a write waits for confirmation" (measured
  // 2026-10-31) — an answer a reader would repeat. The grouping must read the row's own `holds`.
  assert.match(
    vue,
    /const heldActionIds = computed\(\(\) =>\s*actionsWhere\(\(p\) => p\.holds\.includes\('confirmation'\)\)\)/,
    'the held bucket is read from the row\'s own holds',
  );
  assert.doesNotMatch(vue, /actionsOf\('governed'\)/, 'the held bucket is no longer the governed posture alone');

  const gate = read(GATE);
  const at = gate.indexOf("id: 'ai1-rag'");
  assert.ok(at >= 0, 'the record carries the RAG path');
  const row = objectAt(gate, gate.lastIndexOf('{', at));
  assert.match(row, /posture:\s*'governed'/, 'the RAG path is governed');
  assert.doesNotMatch(row, /holds:\s*\[[^\]]*'confirmation'/, 'the RAG path does not hold confirmation');
});

test('the page draws the onboarding ledger from the gate record, in both languages', () => {
  const vue = read(PAGE);
  const tpl = templateOf(vue);

  // 表由记录驱动：行来自 `coverage.rows`，小计来自 `coverage.totals`，姿态词来自 `ledgerPosture.*` ——
  // 页面不另算一份，也不把哪一种姿态写死在模板里。
  // The table is record-driven: rows from `coverage.rows`, totals from `coverage.totals`, posture words
  // from `ledgerPosture.*` — the page keeps no second copy and hard-codes no posture in the template.
  assert.match(tpl, /boundary\.coverage\.rows/, 'the ledger table no longer reads boundary.coverage.rows');
  assert.match(tpl, /boundary\.coverage\.totals/, 'the totals line no longer reads boundary.coverage.totals');
  assert.match(
    tpl,
    /t\(`keelbase\.boundary\.ledgerPosture\.\$\{row\.posture\}`\)/,
    'posture labels no longer come from the ledgerPosture.* family',
  );

  // 中英两套必须同时有四态与那六个键：一边少一个，另一边的读者就会读到空白。
  // Both bundles must carry the four postures and the six keys — one side short and that reader sees a blank.
  const { en, zh } = boundaryMessages();
  const keys = ['ledgerTitle', 'ledgerWhat', 'ledgerTotals', 'ledgerColModule', 'ledgerColObject', 'ledgerColPosture'];
  for (const [lang, block] of [['en', en], ['zh', zh]]) {
    for (const key of keys) assert.ok(block[key], `${lang} carries keelbase.boundary.${key}`);
    assert.deepEqual(
      Object.keys(block.ledgerPosture).sort(),
      ['exempt', 'gap', 'seam', 'tool-only'],
      `${lang} ledger postures disagree with the record's four`,
    );
  }
});

test('the boundary record carries the ledger as identifiers only — no prose reaches the artefact', () => {
  const gate = read(GATE);

  // 记录读的是提交在仓里的那本账；schema 钉住形状，页面据此判断这一节在不在。
  // The record reads the committed ledger; the schema pins the shape the page branches on.
  assert.match(gate, /conformance\/governance-coverage\.tsv/, 'the boundary record no longer reads the ledger');
  assert.match(gate, /schema: 'keelbase-governance-coverage\/1'/, 'the record no longer pins the ledger schema');

  // 一行只带三格：模块、对象、姿态。账本的 `reason`（第 6 列）是中文散文，进产物就是双语红线被踩。
  // A row carries three cells only: module, object, posture. The ledger's `reason` (column 6) is Chinese
  // prose, and putting it in the artefact would break the bilingual rule.
  assert.match(
    gate,
    /rows\.push\(\{ module: cols\[0\], object: cols\[1\], posture: cols\[3\] \}\)/,
    'a ledger row no longer stops at module/object/posture',
  );
});

test('the checks are drawn as a path × control matrix, ticked only by each row\'s own holds', () => {
  const vue = read(PAGE);
  const tpl = templateOf(vue);
  const { en, zh } = boundaryMessages();

  // 一列一道关：列由页面里的 `CONTROLS` 迭代，勾只由 `holds.includes(control)` 推出 —— 页面不另算一份。
  // One column per control: the columns iterate `CONTROLS`, and a tick is only `holds.includes(control)`
  // — the page derives no second copy of the record.
  assert.match(tpl, /v-for="c in CONTROLS"/, 'the checks are no longer drawn as one column per control');
  assert.match(tpl, /row\.holds\.includes\(c\)/, 'a tick no longer comes from the row\'s own holds');
  assert.doesNotMatch(tpl, /v-for="h in row\.holds"/, 'the run-on tag list is back beside the matrix');

  // `CONTROLS` 的顺序就是词表的顺序，且两边同集 —— 少一道关就是少一列，多一道就是凭空多一列。
  // `CONTROLS` follows the vocabulary's order and carries the same set: one control missing would drop a
  // column, one extra would invent one.
  const list = vue.match(/const CONTROLS = \[([\s\S]*?)\] as const/);
  assert.ok(list, 'the page no longer declares its control vocabulary');
  const controls = [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const [lang, block] of [['en', en], ['zh', zh]]) {
    assert.deepEqual(controls, Object.keys(block.holds), `${lang} control headers disagree with the matrix's columns`);
  }

  // 表头缩到 12px：九列里英文关卡名比中文长，不缩会被从单词中间断开（真栈实测过）。
  // A 12px header: with nine columns the English control names are longer than the Chinese ones and
  // break mid-word without it (measured in the running stack).
  assert.match(vue, /\.boundary-matrix :deep\(th \.cell\)\s*\{[^}]*font-size:\s*12px/, 'the matrix header lost its 12px size');
});

test('the two write trails are drawn side by side, each fed by its own endpoint', () => {
  const vue = read(PAGE);
  const tpl = templateOf(vue);

  // 左边旁路行、右边治理行：两张表各自吃**自己的**数据源，页面上没有一处把它们合成一行。
  // Left is the bypass trail, right the governed rows: each table eats **its own** source, and nothing on
  // the page merges them into one row.
  assert.match(tpl, /:data="bypass\?\.items \?\? \[\]"/, 'the bypass table lost its rows');
  assert.match(tpl, /:data="governed \?\? \[\]"/, 'the governed table lost its rows');
  assert.match(vue, /url: '\/keelbase\/bypass-log'/, 'the bypass rows no longer come from the read endpoint');
  assert.match(vue, /auditApi\.logs\(/, 'the governed rows no longer come from the audit chain');
  assert.match(vue, /Promise\.allSettled\(/, 'one failing trail would now take the other down with it');

  // 读不到就**说出来**：一张空表会被读成「没有任何写」，那正是这一节最不该给出的误读。
  // A failed read says so: an empty table would be read as "nothing was written", the one misreading this
  // section must never produce.
  assert.match(tpl, /v-if="bypassError"/, 'the bypass table no longer distinguishes failure from empty');
  assert.match(tpl, /v-if="governedError"/, 'the governed table no longer distinguishes failure from empty');
  assert.match(vue, /keelbase\.boundary\.trailsUnreadable/, 'the unreadable case has no words');
});

test('the two trails speak in two postures, and both languages carry them', () => {
  const { en, zh } = boundaryMessages();
  const tpl = templateOf(read(PAGE));

  // 两个姿态词必须**不同**，且都在两种语言里：同一个词会让「并列」失去意义 —— 读者分不出哪一边没被治理。
  // The two posture words must **differ**, in both languages: one word for both would empty the juxtaposition
  // — a reader could not tell which side is not governed.
  for (const [lang, block] of [['en', en], ['zh', zh]]) {
    assert.ok(block.trailsTitle, `${lang} names the trails section`);
    assert.ok(block.bypassTitle, `${lang} names the bypass trail`);
    assert.ok(block.governedTitle, `${lang} names the governed trail`);
    assert.ok(block.postureRecorded, `${lang} labels the recorded-only posture`);
    assert.ok(block.postureGoverned, `${lang} labels the governed posture`);
    assert.notEqual(block.postureRecorded, block.postureGoverned, `${lang} uses one word for both postures`);
  }
  assert.match(tpl, /keelbase\.boundary\.postureRecorded/, 'the bypass table no longer says "recorded only"');
  assert.match(tpl, /keelbase\.boundary\.postureGoverned/, 'the governed table no longer says "governed"');
});

test('the body column speaks in shape, and says which shape it has', () => {
  const { en, zh } = boundaryMessages();

  // 正文那一列只有三种说法：没读、读了（长度 + 摘要 + 字段名）、读了但字段名不可用。值不在任何一条里。
  // The body column has three things to say: not read, read (length + digest + names), read without names.
  // No value is in any of them.
  for (const [lang, block] of [['en', en], ['zh', zh]]) {
    for (const key of ['bodyNone', 'bodyParts', 'bodyNoFields']) {
      assert.equal(typeof block[key], 'string', `${lang} lost ${key}`);
      assert.ok(block[key].length > 0, `${lang} left ${key} empty`);
    }
  }
  assert.match(en.bodyParts, /\{length\}/, 'the English body line no longer states the length');
  assert.match(en.bodyParts, /\{digest\}/, 'the English body line no longer states the digest');
  for (const key of ['bodyNone', 'bodyParts', 'bodyNoFields']) {
    assert.doesNotMatch(en[key], /\{value\}|\{body\}|\{content\}/, `${key} interpolates a body value`);
    assert.doesNotMatch(zh[key], /\{value\}|\{body\}|\{content\}/, `${key} interpolates a body value`);
  }
});
