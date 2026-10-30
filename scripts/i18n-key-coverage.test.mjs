// SPDX-License-Identifier: Apache-2.0
//
// 页面用到的每一个 `keelbase.*` 词条，中英两套里都得有。
//
// 2026-10-29 走查审计链页时读到表头原样印着 `keelbase.audit.colObject`：模板在第 180 行用了它，而整个
// 界面层没有一处定义。构建是绿的、既有门禁也是绿的 —— 缺键既不是语法错误，也不是「改了上游」，它只在
// **渲染那一刻**变成读者眼前的一串键名。`i18n-no-markdown` 读的是词条**内容**，看不见「这个键根本不在」；
// 渲染级的那两道闸要一份铺好的 UI 检出，管不到「定义」这一面。缺的这一格就在这里补上。
//
// 两边都从**本仓的源**读，不读任何检出：
//
//   · 用到的键 —— `keelbase-ui/host-overlay/` 下每个 `.vue`（这一层自己写的页面），加上
//     `keelbase-ui/host-patches/*.patch` 里**新增**的行（`+` 打头的那些；补丁往上游文件里塞的调用也算
//     这一层的用法，`0005` 就往登录表单里加了一条）。删掉的行（`-`）不算。
//
//   · 定义的键 —— `0002-governance-ui.patch` 里那两棵 `keelbase:` 消息树（构建真正应用的就是它们），
//     拆成点号键路径。
//
// 另两条同属这一格：两套词条**键集合必须一致**（只往一边加，就是这次缺陷的另一副面孔）；模板里
// `` t(`keelbase.x.${y}`) `` 这种算出来的键，至少要落在词条里**存在的一个命名空间**下。
//
// 边界写明，不是悄悄缩短射程：键名在运行期由变量拼出来（`t('keelbase.' + x)`），静态读不到 —— 这类
// 只核到静态前缀。上面那九处模板字面量全是这一种。
//
// ── English ─────────────────────────────────────────────────────────────────────────────────────
//
// Every `keelbase.*` key a page renders has to exist in both bundles.
//
// The 2026-10-29 walk of the audit chain page read `keelbase.audit.colObject` printed as itself in the
// table header: the template uses it at line 180, and nothing in this layer defines it. The build was
// green and every existing gate was green — a missing key is neither a syntax error nor "upstream
// moved"; it becomes the key name in front of the reader only **at render time**. `i18n-no-markdown`
// reads what a message **says**, so it cannot see that the key is not there at all; the two rendered
// gates need a laid-down UI checkout and are about rendering, not about definition. That cell is this.
//
// Both sides come from **this repository's own sources**, never from a checkout:
//
//   · keys used — every `.vue` under `keelbase-ui/host-overlay/` (the pages this layer writes), plus
//     every **added** line (`+`) in `keelbase-ui/host-patches/*.patch` (a call a patch inserts into an
//     upstream file is this layer's usage too — `0005` adds one to the login form). Removed lines (`-`)
//     do not count.
//
//   · keys defined — the two `keelbase:` message trees in `0002-governance-ui.patch` (what the build
//     actually applies), flattened into dotted key paths.
//
// Two neighbours belong to the same cell: the two bundles must define **the same set of keys** (adding
// to one side only is the other face of this defect), and a computed key `` t(`keelbase.x.${y}`) `` must
// at least land under a namespace the bundles actually have.
//
// The boundary is stated, not quietly shortened: a key a variable assembles at runtime
// (`t('keelbase.' + x)`) cannot be read statically — only its static prefix is checked. All nine
// template literals in the overlay are that shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OVERLAY = join(ROOT, 'keelbase-ui', 'host-overlay');
const PATCHES = join(ROOT, 'keelbase-ui', 'host-patches');
const LOCALE_PATCH = '0002-governance-ui.patch';

/** 读文本，先把行尾归一。`core.autocrlf` 的检出里补丁每行都带 `\r`，不归一它会被当成键名的一部分。 */
/** Read as text, line endings normalised first: under `core.autocrlf` every patch line carries `\r`. */
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

/** 字面写出的键：`t('keelbase.x')`、`t("keelbase.x")`、`$t(…)`。 / Keys spelled out literally. */
const LITERAL_KEY = /(?:\$|\b)t\(\s*(['"])(keelbase\.[A-Za-z0-9_.-]+)\1/g;

/** 算出来的键的**静态前缀**：`` t(`keelbase.x.${y}`) `` → `keelbase.x.`。 / The static prefix of a computed key. */
const DYNAMIC_KEY = /(?:\$|\b)t\(\s*`(keelbase\.[A-Za-z0-9_.]*)\$\{/g;

function walkVue(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walkVue(path, out);
    else if (entry.endsWith('.vue')) out.push(path);
  }
  return out;
}

/**
 * 补丁**新增**的行。`+++` 是文件头，不是内容；`-` 打头的删掉的行不算这一层的用法。
 *
 * The lines a patch **adds**. `+++` is a file header, not content; a line starting with `-` is removed
 * and is not this layer's usage.
 */
function addedLines(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('+') && !/^\+\+\+ (?:[ab]\/|\/dev\/null)/.test(line))
    .map((line) => line.slice(1))
    .join('\n');
}

/** 这一层用到的键，连同「在哪看到的」。 / The keys this layer uses, each with where it was seen. */
function usedKeys() {
  const used = new Map();
  const record = (where, key) => {
    if (!used.has(key)) used.set(key, []);
    used.get(key).push(where);
  };

  for (const file of walkVue(OVERLAY)) {
    const where = relative(ROOT, file).replace(/\\/g, '/');
    for (const match of read(file).matchAll(LITERAL_KEY)) record(where, match[2]);
  }
  for (const file of readdirSync(PATCHES).filter((name) => name.endsWith('.patch'))) {
    const where = `keelbase-ui/host-patches/${file} (added lines)`;
    for (const match of addedLines(read(join(PATCHES, file))).matchAll(LITERAL_KEY)) record(where, match[2]);
  }
  return used;
}

/** 算出来的键的静态前缀，连同「在哪看到的」。 / The static prefixes of computed keys, with where they were seen. */
function dynamicPrefixes() {
  const prefixes = new Map();
  const record = (where, prefix) => {
    if (!prefixes.has(prefix)) prefixes.set(prefix, []);
    prefixes.get(prefix).push(where);
  };
  for (const file of walkVue(OVERLAY)) {
    const where = relative(ROOT, file).replace(/\\/g, '/');
    for (const match of read(file).matchAll(DYNAMIC_KEY)) record(where, match[1]);
  }
  return prefixes;
}

/** 取从 `start` 起的那个对象字面量，跳过引号里的花括号。 / take the object literal at `start`, ignoring braces inside quotes. */
function objectAt(text, start) {
  let depth = 0;
  let quote = '';
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced object literal');
}

/** 每个叶子词条连同它的点号键路径（已带上 `keelbase.`）。 / every leaf with its dotted key path, `keelbase.` included. */
function leaves(node, prefix = '', out = []) {
  if (typeof node === 'string') out.push(`keelbase.${prefix}`);
  else for (const [key, value] of Object.entries(node)) leaves(value, prefix ? `${prefix}.${key}` : key, out);
  return out;
}

/** 补丁里那两棵 `keelbase:` 消息树，按语言分开。 / the patch's two `keelbase:` trees, one per language. */
function bundles() {
  const patch = read(join(PATCHES, LOCALE_PATCH));
  const marker = '+  keelbase: {';
  const trees = [];
  for (let at = patch.indexOf(marker); at !== -1; at = patch.indexOf(marker, at + marker.length)) {
    const raw = objectAt(patch, patch.indexOf('{', at));
    const js = raw
      .split('\n')
      .map((line) => line.replace(/^\+/, ''))
      .join('\n');
    trees.push(new Function(`return (${js})`)());
  }
  assert.equal(trees.length, 2, `${LOCALE_PATCH} 应有且只有两棵 keelbase 消息树（英、中）—— found ${trees.length}`);
  const en = trees.find((tree) => tree.common?.refresh === 'Refresh');
  const zh = trees.find((tree) => tree.common?.refresh === '刷新');
  assert.ok(en, '找不到英文消息树 / the English message tree is not there');
  assert.ok(zh, '找不到中文消息树 / the Chinese message tree is not there');
  return { en: new Set(leaves(en)), zh: new Set(leaves(zh)) };
}

test('two message trees are there, and keys were read on both sides', () => {
  const defined = bundles();
  const used = usedKeys();
  // 扫到 0 个键说的是**读错了地方**，不是「都很干净」——不让它空跑变绿。
  // Zero keys read means **the reader looked in the wrong place**, not that everything is clean — do
  // not let this pass by scanning nothing.
  assert.ok(used.size > 100, `这一层用到的 keelbase 键只读到 ${used.size} 个 —— 扫描面出错了 / read only ${used.size} used keelbase keys — the scan is not looking where it should`);
  assert.ok(defined.en.size > 100 && defined.zh.size > 100, `词条只读到 ${defined.en.size} / ${defined.zh.size} 个 —— 扫描面出错了 / read only ${defined.en.size} / ${defined.zh.size} defined keys`);
});

test('every keelbase key this layer renders is defined, in both languages', () => {
  const defined = bundles();
  const used = usedKeys();
  for (const language of ['en', 'zh']) {
    const missing = [...used.keys()].filter((key) => !defined[language].has(key)).sort();
    assert.deepEqual(
      missing,
      [],
      `${language} 这一套缺 ${missing.length} 个键（页面会原样印出键名）：\n` +
        missing.map((key) => `  ${key}  ← ${used.get(key).join(', ')}`).join('\n') +
        `\n— ${missing.length} key(s) the pages render are missing from the ${language} bundle; the page prints the key itself`,
    );
  }
});

test('the two bundles define the same keelbase keys', () => {
  const defined = bundles();
  const onlyEn = [...defined.en].filter((key) => !defined.zh.has(key)).sort();
  const onlyZh = [...defined.zh].filter((key) => !defined.en.has(key)).sort();
  // 只往一边加，另一边的读者看到的就是键名 —— 与这次缺陷同一副面孔。
  // One side only means the other side's reader sees the key name — the same face as this defect.
  assert.deepEqual(
    { onlyEn, onlyZh },
    { onlyEn: [], onlyZh: [] },
    '中英两套键集合不一致 / the two bundles do not define the same keys',
  );
});

test('a computed key lands under a namespace the bundles have', () => {
  const defined = bundles();
  const prefixes = dynamicPrefixes();
  assert.ok(prefixes.size > 0, '没读到算出来的键 —— 扫描面出错了 / read no computed key — the scan is not looking where it should');
  for (const language of ['en', 'zh']) {
    const unknown = [...prefixes.keys()]
      .filter((prefix) => ![...defined[language]].some((key) => key.startsWith(prefix)))
      .sort();
    assert.deepEqual(
      unknown,
      [],
      `${language} 这一套里没有这些命名空间：\n` +
        unknown.map((prefix) => `  ${prefix}*  ← ${prefixes.get(prefix).join(', ')}`).join('\n') +
        `\n— no key under these namespaces in the ${language} bundle`,
    );
  }
});
