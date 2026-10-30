// SPDX-License-Identifier: Apache-2.0
//
// 审计链页展开一行时必须真的画出来。2026-10-25 的缺陷是：展开块调用了 `toolRisk(row)`，而它既没有
// 定义也没有导入 —— 编译成渲染上下文上一个不存在的成员，展开任意一行时抛 TypeError，Element Plus 的
// 表体整块不渲染（数据仍在、摘要与分页仍说 4 行），而构建与既有门禁全绿。运行：
//
//     node --test scripts/audit-chain-page.test.mjs
//
// 与 `boundary-page.test.mjs` 同一条理由停在源码层：本仓不带 Vue 测试运行器，而它构建所依的 UI 检出
// 是一次性的（`target/`），故挂载 SFC 的测试只会在本机绿、下次取树就没了。这里钉两件事：展开块里每个
// 被调用的 helper 都能在同一文件里找到定义或导入；以及 Q3 依赖的那几条规则（恰好一个候选、读
// `targetExists`、风险级取自清单）。
//
// The audit chain page's expanded row has to actually draw. The defect of 2026-10-25: the expand block
// called `toolRisk(row)`, which was neither defined nor imported — compiled into a render-context member
// that did not exist, so expanding any row threw a TypeError and Element Plus rendered no table body
// (the data was still there; the summary and pager still read 4 rows), while the build and every
// existing gate stayed green. Run with:
//
//     node --test scripts/audit-chain-page.test.mjs
//
// Source-level for the same reason as `boundary-page.test.mjs`: this repository ships no Vue test
// runner, and the UI checkout it builds from is disposable (`target/`), so a test that mounted the SFC
// would pass here and vanish on the next fetch. It pins two things: every helper the expand block calls
// resolves in the same file, and the rules Q3 leans on (exactly one candidate, read `targetExists`, the
// risk level comes from the inventory).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = 'keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue'

const page = readFileSync(join(ROOT, PAGE), 'utf8')
const script = page.slice(page.indexOf('<script'), page.lastIndexOf('</script>'))

/** Template-language constructs and globals a template may call without importing them. */
const BUILTINS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new', 'await', 'in', 'of', 'function',
  'String', 'Number', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date',
  'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent',
])

/** The expand column's block, from its opening tag to its closing one. */
function expandBlock(source) {
  const template = source.slice(source.indexOf('<template>'), source.indexOf('<script'))
  const start = template.indexOf('<el-table-column type="expand">')
  if (start < 0) return ''
  const end = template.indexOf('</el-table-column>', start)
  return end < 0 ? '' : template.slice(start, end)
}

/** Names the block calls, excluding member calls (`row.foo()`) and property access. */
function calledNames(block) {
  const names = new Set()
  for (const m of block.matchAll(/(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1])
  return names
}

/** Names the file's script defines: imports, declarations, and destructured bindings (e.g. `t`). */
function definedNames(source) {
  const body = source.slice(source.indexOf('<script'), source.lastIndexOf('</script>'))
  const names = new Set()
  for (const m of body.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()
      if (name) names.add(name)
    }
  }
  for (const m of body.matchAll(/\b(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1])
  for (const m of body.matchAll(/\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(':').pop().trim()
      if (name) names.add(name)
    }
  }
  return names
}

/** Slot props destructured in the block (`#default="{ row }"`), which the template may call. */
function slotAliases(block) {
  const names = new Set()
  for (const m of block.matchAll(/#default="\{([^}]*)\}"/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(':').pop().trim()
      if (name) names.add(name)
    }
  }
  return names
}

/** Calls in the expand block that neither the script defines nor the template supplies. */
function undefinedCalls(source) {
  const block = expandBlock(source)
  const allowed = new Set([...definedNames(source), ...slotAliases(block), ...BUILTINS])
  return [...calledNames(block)].filter((name) => !allowed.has(name)).sort()
}

test('the expand column exists and draws the six answers from a helper', () => {
  const block = expandBlock(page)
  assert.ok(block, 'no `type="expand"` column in the template')
  assert.match(block, /keelbase\.sixQ\.title/, 'the expansion no longer labels the six questions')
  assert.match(block, /sixOf\(row\)/, 'the expansion no longer draws the six answers')
})

test('every helper the expansion calls resolves in the same file', () => {
  assert.deepEqual(undefinedCalls(page), [])
})

test('the detector is not vacuous — an undefined helper is reported', () => {
  const broken = `<template>
  <el-table-column type="expand"><template #default="{ row }">{{ toolRisk(row) }}</template></el-table-column>
</template>
<script setup lang="ts">
const { t } = useI18n()
</script>`
  assert.deepEqual(undefinedCalls(broken), ['toolRisk'])

  const fixed = broken.replace('const { t } = useI18n()', 'const { t } = useI18n()\nfunction toolRisk(row) { return "" }')
  assert.deepEqual(undefinedCalls(fixed), [])
})

test('the write record is shown only when exactly one candidate matches', () => {
  assert.match(script, /near\.length === 1/, 'the "exactly one candidate" rule is gone')
  assert.match(
    script,
    /function recordState\(e: EffectRow\): string \{\s*if \(!e\.targetExists\)/,
    'the record state no longer reads targetExists',
  )
})

test('the gate is read from the row, never from the tool inventory', () => {
  // 第五问读的是**这一行记下的**那道闸（`authorization` 里的 `requiresConfirmation` 与
  // `riskStrategy`），不是工具清单**此刻**的 `gateMode`：清单答的是今天，而审计行说的是当时那一次。
  // 这一点曾经相反 —— 页面按清单回答，于是同一条审计行在策略改过之后改口（一次自动放行的写被说成
  // 「本人确认了」）。这条用例钉住那个方向，不让它回来。
  //
  // The fifth question is read from **the gate this row recorded** (`requiresConfirmation` and
  // `riskStrategy` inside `authorization`), never from the inventory's `gateMode` — the inventory answers
  // today, while an audit row is about that one time. It used to be the opposite: the page answered from
  // the inventory, so one audit row changed its answer after a policy change (an auto-allowed write was
  // reported as "confirmed it themselves"). This case pins the direction so it cannot come back.
  assert.doesNotMatch(script, /gateMode/, 'the page reads the inventory\'s gate again')
  assert.doesNotMatch(script, /function toolGate\(/, 'toolGate is back — the gate is being taken from the inventory')
  assert.match(script, /function sixOf\(row: AuditRow\)/, 'sixOf is gone')
  assert.doesNotMatch(
    script,
    /composeSix\(\{[^}]*\bgate:/,
    'sixOf hands a gate in from outside; the fifth answer must come from the row alone',
  )
})

test('a held or refused call takes its object from the confirmation record', () => {
  // 被扣下或被拒的调用不写台账，第三问此前只能答「未记录」—— 而运行时其实把这次提议记在确认记录里。
  // 这一条钉住接线：页面真的去读那条队列，按与台账**同一条**规则（恰好一个候选）配对，再把结果交给六问。
  //
  // A held or refused call writes no ledger row, so the third question could only say 「未记录」 — while
  // the runtime did record the proposal in a confirmation record. This pins the wiring: the page really
  // reads that queue, pairs it under the **same** rule as the ledger (exactly one candidate), and hands
  // the result to the six answers.
  assert.match(script, /confirmationApi\.listAll\(1, PROPOSAL_WINDOW\)/, 'the page never reads the confirmation queue')
  assert.match(
    script,
    /function proposalOf\(row: AuditRow\): ConfirmationItem \| null \{[\s\S]*?near\.length === 1 \? near\[0\] : null/,
    'no proposal matcher, or it pairs without the "exactly one candidate" rule',
  )
  assert.match(
    script,
    /confirmationApi\.listAll\(1, PROPOSAL_WINDOW\)[\s\S]*?catch/,
    'a refused queue read would break the page instead of leaving the cell as it was',
  )
  assert.match(
    script,
    /const proposal = e \? null : proposalArgumentOf\(row\)/,
    'the page no longer derives the proposal for a row with no ledger row',
  )
  assert.match(
    script,
    /composeSix\(\{[\s\S]*?\bproposal,/,
    'the six answers no longer receive the proposal',
  )
  assert.match(script, /toolResultType\(proposal\.toolName\)/, 'the object type is not taken from the tool declaration')
  assert.match(script, /objectLine\(\{[\s\S]*?\bproposal,/, 'the object column no longer receives the proposal')
})
