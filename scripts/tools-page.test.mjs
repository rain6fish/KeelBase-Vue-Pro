// SPDX-License-Identifier: Apache-2.0
//
// 写入台账的「结果类型 / 可撤档位」两列：给读者语言的词、把原值留在下面一行，并在表上给一句取值说明。
// 2026-10-25 的 M7 读者读到这里只说得出「结果类型和可撤档位不知道什么意思」—— 两列是裸枚举
// （`crm_customer`、`local-compensate`），没有说明。运行：
//
//     node --test scripts/tools-page.test.mjs
//
// 与 `boundary-page.test.mjs` 同一条理由停在源码层：本仓不带 Vue 测试运行器，而构建所依的 UI 检出是
// 一次性的。这里钉三件事 —— 页面走两个按词表取 key 的 helper、词表是封闭的且两边都有词、说明词条两种
// 语言都在。
//
// The write ledger's "result type" and "revoke class" columns: a word in the reader's language with the
// raw value kept on a second line, plus one line explaining both. The 2026-10-25 M7 reader could only say
// "result type and revoke class — I don't know what those mean": both columns were raw codes
// (`crm_customer`, `local-compensate`) with nothing explaining them. Run with:
//
//     node --test scripts/tools-page.test.mjs
//
// Source-level for the same reason as `boundary-page.test.mjs`: this repository ships no Vue test runner
// and the UI checkout it builds from is disposable. Three things are pinned — the page goes through the
// two vocabulary helpers, both vocabularies are closed and carry a word in each language, and the note
// exists in both languages.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = 'keelbase-ui/host-overlay/src/views/keelbase/governance/ToolsPage.vue'
const LABELS = 'keelbase-ui/host-overlay/src/keelbase/labels.ts'
const PATCH = 'keelbase-ui/host-patches/0002-governance-ui.patch'

const page = readFileSync(join(ROOT, PAGE), 'utf8')
const labels = readFileSync(join(ROOT, LABELS), 'utf8')
const template = page.slice(page.indexOf('<template>'), page.indexOf('<script'))

/** 结果类型：本宿主工具声明的那几个（`resultType()` 的返回值）。 */
const RESULT_TYPES = [
  'bpm_oa_leave', 'bpm_process_instance', 'crm_business', 'crm_clue', 'crm_contact',
  'crm_contract', 'crm_customer', 'crm_follow_up_record', 'crm_product', 'crm_receivable',
  'crm_receivable_plan', 'fms_voucher', 'infra_demo01_contact', 'infra_file', 'system_notice',
  'system_notify_message', 'notify_mailbox', 'products',
]

/** 可撤档位：运行时 `AiTool.revokeClass()` 的四个取值。 */
const REVOKE_CLASSES = ['none', 'local-compensate', 'governed-external', 'transactional']

/** 取从 `start` 起的对象字面量，跳过引号里的花括号（与 `boundary-page.test.mjs` 同一手法）。 */
function objectAt(text, start) {
  let depth = 0
  let quote = ''
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === "'" || ch === '"') quote = ch
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  throw new Error('unbalanced object literal')
}

function effectsMessages() {
  const patch = readFileSync(join(ROOT, PATCH), 'utf8')
  const marker = '+    effects: {'
  const blocks = []
  for (let at = patch.indexOf(marker); at !== -1; at = patch.indexOf(marker, at + marker.length)) {
    const raw = objectAt(patch, patch.indexOf('{', at))
    const js = raw
      .split('\n')
      .map((line) => line.replace(/^\+/, ''))
      .join('\n')
    blocks.push(new Function(`return (${js})`)())
  }
  assert.equal(blocks.length, 2, 'the patch carries exactly two effects message blocks (English + Chinese)')
  const en = blocks.find((b) => b.colResultType === 'Result type')
  const zh = blocks.find((b) => b.colResultType === '结果类型')
  assert.ok(en && zh, 'the English and Chinese effects blocks exist')
  return { en, zh }
}

test('F-4: both code-like columns go through a vocabulary helper and keep the raw value', () => {
  assert.match(template, /t\('keelbase\.effects\.columnsHint'\)/, 'the note explaining the two columns is not rendered')
  assert.match(template, /resultTypeText\(row\.resultType\)/, 'the result type no longer goes through resultTypeText')
  assert.match(template, /revokeClassText\(row\.revokeClass\)/, 'the revoke class no longer goes through revokeClassText')
  assert.match(page, /\{\{ row\.resultType \}\}/, 'the raw result type is no longer shown beside its word')
  assert.match(page, /\{\{ row\.revokeClass \}\}/, 'the raw revoke class is no longer shown beside its word')
  assert.match(page, /resultTypeLabelKey\(value\)/, 'resultTypeText does not consult the closed vocabulary')
  assert.match(page, /revokeClassLabelKey\(value\)/, 'revokeClassText does not consult the closed vocabulary')
})

test('F-4: the vocabularies live in labels.ts and are closed', () => {
  assert.match(labels, /export function resultTypeLabelKey\(/, 'labels.ts no longer exports resultTypeLabelKey')
  assert.match(labels, /export function revokeClassLabelKey\(/, 'labels.ts no longer exports revokeClassLabelKey')
  for (const value of RESULT_TYPES) {
    assert.match(labels, new RegExp(`'${value}'`), `the result-type vocabulary lost ${value}`)
  }
  for (const value of REVOKE_CLASSES) {
    assert.match(labels, new RegExp(`'${value}'`), `the revoke-class vocabulary lost ${value}`)
  }
})

test('F-4: both languages name every known value and carry the note', () => {
  const { en, zh } = effectsMessages()
  for (const [lang, block] of [['en', en], ['zh', zh]]) {
    assert.ok(block.columnsHint && block.columnsHint.length > 40, `${lang} has no usable note for the two columns`)
    assert.deepEqual(Object.keys(block.resultType).sort(), [...RESULT_TYPES].sort(), `${lang} result-type names disagree with the vocabulary`)
    assert.deepEqual(Object.keys(block.revokeClass).sort(), [...REVOKE_CLASSES].sort(), `${lang} revoke-class names disagree with the vocabulary`)
  }
  // 中文给词、英文也给词 —— 两列在两种语言下都不该退回裸码。
  // Both languages name the values; neither column falls back to the raw code in either language.
  assert.equal(zh.resultType.crm_customer, '客户')
  assert.equal(en.resultType.crm_customer, 'customer')
})

/** 宿主源码里声明的结果类型（`resultType()` 返回的非空值）。 / The result types the host's sources declare. */
function declaredResultTypes() {
  // 每个 `yudao-*` 模块的 `src/main/java` 都在射程内：工具面眼下只在 `yudao-server` 里，但把搜索面写成
  // 「一处」意味着将来搬到别处时这份对账会**静默少收**一个值，而静默正是它要防的那种错。
  // Every `yudao-*` module's `src/main/java` is in scope: the tool faces live in `yudao-server` today, but
  // naming one place means a future move makes this reconciliation **silently miss** a value — and silent is
  // exactly the failure it exists to catch.
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
        for (const hit of source.matchAll(/public\s+String\s+resultType\(\)\s*\{\s*return\s+"([a-z0-9_]+)"\s*;/g)) {
          found.add(hit[1])
        }
      }
    }
  }
  for (const root of roots) walk(root)
  return [...found].sort()
}

test('结果类型词表与宿主源码一一对应（两边都不许漏）', () => {
  // 词表是**封闭**的，而它的取值来自工具自己的声明 —— 故这里拿源码对账，而不是信任上面那张手写清单。
  // 少一个：控制台对已记进台账的类型只剩裸码；多一个：词表里躺着没人会发出来的键。
  // The vocabulary is **closed** and its values come from the tools' own declarations — so this holds it
  // against the sources instead of trusting the hand-written list above. One missing: the console shows a
  // bare code for a type the ledger already records. One extra: a key nobody emits.
  const declared = declaredResultTypes()
  assert.ok(declared.length > 0, 'no resultType() declarations were found — the walk is looking in the wrong place')
  assert.deepEqual([...RESULT_TYPES].sort(), declared,
    'the console vocabulary and the host\'s declared result types disagree')
})
