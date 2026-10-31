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
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'keelbase-ui/host-overlay/src/views/keelbase/governance/BoundaryPage.vue';
const PATCH = 'keelbase-ui/host-patches/0002-governance-ui.patch';
const GATE = 'scripts/check-ungoverned-tool-beans.mjs';

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
