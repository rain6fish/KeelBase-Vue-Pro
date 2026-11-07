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

test('YD-45: a decision row says its person is the approver or the decliner', () => {
  // 裁决行上的「谁」是**作裁决的那位**，不是调用方。行为列只说「确认」时说不出这一层，故这一格点名；
  // 而 `attempted` 的重试行不是裁决，不贴标签。两套词条由 `i18n-key-coverage` 另钉。
  //
  // On a decision row the "who" cell is **the decider**, not the caller. The action column only says
  // "confirmation", so this cell names the distinction; an `attempted` retry is not a decision and gets
  // no tag. Both language bundles are pinned separately by `i18n-key-coverage`.
  const template = page.slice(page.indexOf('<template>'), page.indexOf('<script'))
  assert.match(template, /<el-tag v-if="deciderText\(row\)"/, 'the who cell no longer labels a decision')
  assert.match(script, /function deciderText\(row: AuditRow\): string/)
  assert.match(script, /row\.action !== 'tool_confirmation'/, 'the label is no longer limited to confirmation rows')
  assert.match(script, /row\.outcome === 'approved'/, 'an approval row is no longer labelled')
  assert.match(script, /row\.outcome === 'declined'/, 'a declined row is no longer labelled')
  assert.match(script, /keelbase\.audit\.approverTag/)
  assert.match(script, /keelbase\.audit\.declinerTag/)
  assert.doesNotMatch(script, /outcome === 'attempted'[\s\S]{0,80}(?:approverTag|declinerTag)/)
})

test('chainWhat names the coverage statement instead of pointing at where it sits', () => {
  // 页面上这句排在覆盖声明**上面**（`AuditChainPage.vue:41` vs `:69`），2026-11-02 之前它写的是
  // 「上面覆盖声明里的第一条缺口」—— 读者按「上面」往上看，看到的是链结论标签，找不到那句话（M7
  // 第八问的真实障碍）。方位词与模板顺序是两张纸，没有东西守着它们：顺序一改，句子悄悄变错，而所有
  // 门禁照绿。故这里要求它只**点名字**（覆盖声明），不指方位；中英两侧一起钉住。
  //
  // On the page this sentence sits **above** the coverage statement (`AuditChainPage.vue:41` vs `:69`),
  // and before 2026-11-02 it said "the first gap in the coverage statement above" — a reader following
  // "above" lands on the chain verdict tag and never finds it (the real obstacle to M7's eighth question).
  // A direction word and the template order are two separate sheets, and nothing holds them together: move
  // the block and the sentence goes quietly wrong while every gate stays green. So it must **name** the
  // coverage statement, not point at where it sits — pinned on both language sides.
  const patch = readFileSync(join(ROOT, 'keelbase-ui/host-patches/0002-governance-ui.patch'), 'utf8')
  const messages = [...patch.matchAll(/^\+\s*chainWhat:\s*\n\+\s*('[^']*'|"[^"]*")/gm)].map((m) => m[1])
  assert.equal(messages.length, 2, 'expected one chainWhat per language in the host patch')

  assert.match(page, /t\('keelbase\.audit\.chainWhat'\)/, 'the page no longer renders chainWhat')

  const named = messages.filter((m) => /coverage statement|覆盖声明/.test(m))
  assert.equal(named.length, 2, 'chainWhat no longer names the coverage statement')

  for (const message of messages) {
    assert.doesNotMatch(message, /(?:上面|下面|上方|下方)/, `chainWhat points by position: ${message}`)
    assert.doesNotMatch(message, /\b(?:above|below)\b/i, `chainWhat points by position: ${message}`)
  }
})

test('a blocked call takes its object from the key its own row recorded', () => {
  // 被**闸门拦下**的调用既没有台账行、也没有确认记录：运行时把键写在那条审计行自己的句末。这一条钉住接线 ——
  // 页面真的去读那一段、种类真的取自工具声明，而且读不出来时**不**从别处补一个 id。
  //
  // A **gate-blocked** call has neither a ledger row nor a confirmation record: the runtime writes the key at
  // the end of the audit row's own sentence. This pins the wiring — the page really reads that back, the kind
  // really comes from the tool declaration, and a missing key is **not** filled in from somewhere else.
  assert.match(script, /import \{[^}]*\brecordedObjectIn\b[^}]*\} from '@\/keelbase\/sixQuestions\.mjs'/,
    'the page does not import the reader for the row-recorded key')
  assert.match(script, /const recordedId = e \|\| proposal \? null : recordedObjectIn\(row\)/,
    'the page does not take the recorded key on the road that has neither a ledger row nor a proposal')
  assert.match(script, /resultType: toolResultType\(row\.tool\)/,
    'the kind of the blocked object is not taken from the tool declaration')
  assert.match(script, /composeSix\(\{[\s\S]*?\brecorded,/, 'the six answers no longer receive the recorded key')
})

test('an approval row takes its approver from the decision row, never from the inventory', () => {
  // 第二人批准那一行的批准人只在**同一次操作的另一行**上。这一条钉住两件事：页面按「同一工具、五秒内、
  // 恰好一个候选」把那一行配上（与台账、确认记录、YD-45 追溯步同一条规则），且它**不问工具清单** ——
  // 清单答的是此刻的闸，而这一行是过去的一次调用。
  //
  // The approver of an approval row exists only on **another row of the same operation**. This pins two
  // things: the page pairs that row by "same tool, within five seconds, exactly one candidate" (the rule the
  // ledger, the confirmation records and YD-45's trace step already use), and it **does not ask the
  // inventory** — the inventory answers today's gate, while the row is a past call.
  assert.match(script, /import \{[^}]*\bapproverOf\b[^}]*\} from '@\/keelbase\/sixQuestions\.mjs'/,
    'the page does not import the approver matcher')
  assert.match(script, /const approver = approverOf\(row, rows\.value\)/,
    'the page does not pair the decision row from the audit rows it holds')
  assert.match(script, /approverName: approver \? names\.value\[String\(approver\.userId\)\] \?\? String\(approver\.userId\) : ''/,
    'the paired approver is not resolved to a name (or the empty answer is not explicit)')
  assert.match(script, /composeSix\(\{[\s\S]*?\bapproverName:/, 'the six answers no longer receive the approver')
  assert.doesNotMatch(script, /approverOf\(row, inventory/, 'the approver is being answered from the inventory')
})
