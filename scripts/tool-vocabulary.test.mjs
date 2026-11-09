// SPDX-License-Identifier: Apache-2.0
//
// 审计链页「做了什么」那一列：本宿主供出的**每一个**工具都得有业务词，而词表漏掉一个工具时，那一格只会说
// 「一个还没有登记业务名的工具」。2026-11-09 的 U-4 走查在真栈上读到 `delete_project`（R5，`/ai/tools`
// 报 blocked）的「做了什么」答不出来 —— 词表当时只收了十六个工具，而宿主实际供出七十五个。运行：
//
//     node --test scripts/tool-vocabulary.test.mjs
//
// 与 `tools-page.test.mjs` 同一手法、同一条理由停在源码层：词表是**封闭**的、取值来自工具自己的声明，故拿
// 宿主源码对账，而不是信任那张手写清单。三条：
//
//   1. 工具名：宿主 `yudao-*/src/main/java` 里每个 `public String name()`（`ConsolePages` 的键走
//      `TOOL_NAME` 常量，单独读），加上运行时 jar 自带的七个示例工具（本仓没有它们的源码，故写成一张明示的
//      小表，并在真栈 `/ai/tools` 上核过），与 `labels.ts` 的 `TOOLS` **一一对应**；
//   2. 两种语言：`TOOLS` 里每个名字在宿主补丁的两套词条里都有一条 `keelbase.tool.<name>` 与一条
//      `keelbase.toolDesc.<name>`（词条由 `i18n-key-coverage` 钉住两套键集合一致；这一条钉住「每个名字都
//      有词」，那一道只证明「两边一样齐全」）；
//   3. 读者面：不认识的工具**不印注册名**（`YD-42` 的反向可证），回落的那个句子说得出「本页说不出它的
//      业务动作」—— 而不是一句读者据此判断不了的「没有名字」。
//
// The audit chain page's 「做了什么」 column: **every** tool this host serves has to have a business word,
// and when the vocabulary misses one that cell can only say 「a tool with no business name yet」. The U-4
// walkthrough of 2026-11-09 read, on a real stack, that `delete_project` (R5; `/ai/tools` reports blocked)
// had no answer for "did what" — the vocabulary held sixteen tools while the host serves seventy-five. Run:
//
//     node --test scripts/tool-vocabulary.test.mjs
//
// Same technique and the same reason as `tools-page.test.mjs` — source level, because the vocabulary is
// **closed** and its values come from the tools' own declarations, so it is held against the host's sources
// instead of trusted as a hand-written list. Three things:
//
//   1. Tool names: every `public String name()` in the host's `yudao-*/src/main/java` (`ConsolePages` reads
//      its key from `TOOL_NAME`, read separately), plus the seven sample tools the runtime jar ships (this
//      repository has no sources for those, so they are an explicit small table, checked against `/ai/tools`
//      on a real stack), correspond **one to one** with `TOOLS` in `labels.ts`;
//   2. Both languages: every name in `TOOLS` carries a `keelbase.tool.<name>` and a `keelbase.toolDesc.<name>`
//      in both bundles of the host patch (`i18n-key-coverage` pins that the two bundles define the same key
//      set; this pins that every name has a word — that gate only proves "both sides are equally complete");
//   3. The reader's face: an unknown tool's **registered name is not printed** (`YD-42`'s reverse proof), and
//      the sentence it falls back to can say that this page cannot name its business action — not a "no name"
//      a reader cannot act on.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LABELS = 'keelbase-ui/host-overlay/src/keelbase/labels.ts'
const PAGE = 'keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue'
const PATCH = 'keelbase-ui/host-patches/0002-governance-ui.patch'

const labels = readFileSync(join(ROOT, LABELS), 'utf8')
const page = readFileSync(join(ROOT, PAGE), 'utf8')

// 运行时 jar 自带的示例工具（`cn.com.keelbase.runtime.tool` 里那七个 `@Component`），按 `/ai/tools`
// 在真栈上逐个核过。本仓没有它们的源码，故这里必须明示；它们的业务词随其余工具一起落在宿主补丁里。
//
// The runtime jar's own sample tools (the seven `@Component`s in `cn.com.keelbase.runtime.tool`), each read
// off `/ai/tools` on a real stack. This repository has no sources for them, so they are stated here; their
// business words live in the host patch with every other tool.
const RUNTIME_SAMPLE_TOOLS = [
  'analyze_customer_risk', 'analyze_project_risk', 'create_followup', 'create_pm_task',
  'delete_project', 'escalate_customer', 'escalate_project',
]

/** `labels.ts` 的封闭工具表。 / The closed tool table in `labels.ts`. */
function declaredTools() {
  const at = labels.indexOf('const TOOLS = [')
  assert.notEqual(at, -1, 'labels.ts no longer declares the TOOLS table')
  const end = labels.indexOf(']', at)
  const body = labels.slice(at, end)
  return [...body.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])
}

/** 宿主源码里声明的工具名（`name()` 的字面量返回值，加上 `TOOL_NAME` 常量）。 */
function declaredHostTools() {
  const roots = readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('yudao-'))
    .map((entry) => join(ROOT, entry.name, 'src/main/java'))
    .filter((dir) => existsSync(dir))
  const found = new Set()
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.name.endsWith('.java')) {
        const source = readFileSync(path, 'utf8')
        for (const hit of source.matchAll(/public\s+String\s+name\(\)\s*\{\s*return\s+"([a-z0-9_]+)"\s*;/g)) {
          found.add(hit[1])
        }
        for (const hit of source.matchAll(/static\s+final\s+String\s+TOOL_NAME\s*=\s*"([a-z0-9_]+)"/g)) {
          found.add(hit[1])
        }
      }
    }
  }
  for (const root of roots) walk(root)
  return [...found].sort()
}

/**
 * 把补丁里某个标记下的每一块**当作字面量求值**再取键。块按**整行等于收尾行**切 —— 只在行首认 `}` 会把
 * 粘在后面的第二个收尾（`},+    },`）漏在切片外，那样坏行照样过得了这一关。语法坏掉时当场抛出。
 *
 * Evaluate each block under `marker` as a literal and read its keys. A block ends at a line **equal to** the
 * closing line — stopping at the first `}` would leave a glued second close (`},+    },`) outside the slice,
 * and that broken line would pass. Broken syntax throws.
 */
function blocksOf(patch, marker) {
  const lines = patch.split('\n').map((line) => line.replace(/\r$/, ''))
  const blocks = []
  const starts = lines.map((line, i) => (line === marker ? i : -1)).filter((i) => i >= 0)
  for (const start of starts) {
    const close = lines.indexOf('+    },', start)
    assert.notEqual(close, -1, `no closing line after ${marker}`)
    const raw = lines.slice(start, close + 1).join('\n')
    const js = raw
      .split('\n')
      .map((line) => line.replace(/^\+/, ''))
      .join('\n')
      .replace(/^\s*[A-Za-z0-9_]+:\s*/, '')
      .replace(/,\s*$/, '')
    const keys = Object.keys(new Function(`return (${js})`)())
    const written = (raw.match(/^\+\s{6}[A-Za-z0-9_]+:/gm) || []).length
    assert.equal(keys.length, written, `${marker.replace(/^\+\s+/, '')} repeats a key (it would collapse silently)`)
    blocks.push(keys)
  }
  return blocks
}

/**
 * 宿主补丁里两套词条的 `tool` / `toolDesc` 两块。只数 `name:` 行会漏掉被粘在一起的收尾（`},+    },`），
 * 而那种行照样过得了正则、过不了构建 —— 故 `blocksOf` 求值而不数行。
 *
 * The two bundles' `tool` / `toolDesc` blocks in the host patch. Counting `name:` lines alone misses a glued
 * closing brace (`},+    },`), and that shape passes a regex while failing the build — so `blocksOf` evaluates
 * the literal instead of counting lines.
 */
function messageBlocks() {
  const patch = readFileSync(join(ROOT, PATCH), 'utf8')
  const grab = (marker) => blocksOf(patch, marker)
  const tool = grab('+    tool: {')
  const toolDesc = grab('+    toolDesc: {')
  assert.equal(tool.length, 2, 'expected one tool block per language in the host patch')
  assert.equal(toolDesc.length, 2, 'expected one toolDesc block per language in the host patch')
  return { tool, toolDesc }
}

test('the vocabulary covers every tool the host serves, and nothing it does not', () => {
  const vocabulary = declaredTools()
  assert.ok(vocabulary.length > 0, 'the TOOLS table is empty or unreadable')
  assert.equal(new Set(vocabulary).size, vocabulary.length, 'the TOOLS table repeats a name')

  const host = declaredHostTools()
  assert.ok(host.length > 50, `the source walk found only ${host.length} tools — it is looking in the wrong place`)

  const deployed = [...new Set([...host, ...RUNTIME_SAMPLE_TOOLS])].sort()
  assert.deepEqual([...vocabulary].sort(), deployed,
    'the console vocabulary and the tools this host serves disagree — a new tool face, or a stale word')
})

test('every name has a word in both languages — tool and toolDesc alike', () => {
  const vocabulary = declaredTools()
  const { tool, toolDesc } = messageBlocks()
  for (const [lang, names] of [['en', tool[0]], ['zh', tool[1]]]) {
    assert.deepEqual([...names].sort(), [...vocabulary].sort(), `${lang} tool block disagrees with the vocabulary`)
  }
  for (const [lang, names] of [['en', toolDesc[0]], ['zh', toolDesc[1]]]) {
    assert.deepEqual([...names].sort(), [...vocabulary].sort(), `${lang} toolDesc block disagrees with the vocabulary`)
  }
  assert.ok(tool[0].includes('delete_project'), 'the blocked write U-4 read has no business word again')
})

test('an unknown tool is never printed by its registered name on the reader\'s face', () => {
  // `toolText` 只在词表里有词时返回词；其余情况一律是那一句「没有业务名」，**不**返回传入的 name。
  // `toolText` returns a word only when the vocabulary has one; every other case is the "no business
  // name" sentence, and it **never** returns the name it was given.
  const toolText = page.slice(page.indexOf('function toolText('), page.indexOf('function whatText('))
  assert.ok(toolText, 'toolText is gone')
  assert.match(toolText, /keelbase\.audit\.toolUnnamed/, 'the fallback no longer names the unnamed case')
  assert.doesNotMatch(toolText, /return name\b/, 'toolText returns the registered name again — YD-42 comes back')
  assert.doesNotMatch(toolText, /\$\{name\}/, 'toolText interpolates the registered name into the sentence')
})

test('the fallback sentence says the page cannot name the action, in both languages', () => {
  const patch = readFileSync(join(ROOT, PATCH), 'utf8')
  const messages = [...patch.matchAll(/^\+\s*toolUnnamed:\s*'((?:[^'\\]|\\.)*)'/gm)].map((m) => m[1])
  assert.equal(messages.length, 2, 'expected one toolUnnamed per language in the host patch')
  const named = messages.filter((m) => /cannot say what it did|说不出它的业务动作/.test(m))
  assert.equal(named.length, 2, 'the fallback no longer says the page cannot name the action')
  for (const message of messages) {
    assert.doesNotMatch(message, /create_[a-z_]+|delete_[a-z_]+|list_[a-z_]+/,
      `the fallback carries a machine-shaped tool name: ${message}`)
  }
})

test('the block reader is not vacuous — a glued closing brace is reported', () => {
  const healthy = [
    'diff --git a/x b/x',
    '+    tool: {',
    "+      delete_project: 'Delete a project',",
    '+    },',
    '',
  ].join('\n')
  assert.deepEqual(blocksOf(healthy, '+    tool: {'), [['delete_project']])

  const glued = healthy.replace('+    },', '+    },+    },')
  assert.throws(() => blocksOf(glued, '+    tool: {'), 'a glued closing brace got through the block reader')
})
