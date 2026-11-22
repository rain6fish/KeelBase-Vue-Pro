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

test('a tool the console has no word for still answers the 做了什么 column, without its registered name', () => {
  // 「做了什么」这一列在有工具时走 `toolText`：认得的工具给业务词，不认识的给一句读者能据以判断的话，
  // **不印注册名**（YD-42 的反向可证）。词表是否收全了宿主供出的工具，由 `tool-vocabulary.test.mjs`
  // 拿源码对账；这一条钉的是接线 —— 列真的从 `toolText` 取，而不是绕过去拿 `row.tool`。
  //
  // The 做了什么 column goes through `toolText` whenever a row names a tool: a known tool gets its business
  // word, an unknown one gets a sentence a reader can act on, and the **registered name is not printed**
  // (YD-42's reverse proof). Whether the vocabulary covers every tool the host serves is held against the
  // sources by `tool-vocabulary.test.mjs`; this pins the wiring — the column really takes its text from
  // `toolText` instead of going around it to `row.tool`.
  const template = page.slice(page.indexOf('<template>'), page.indexOf('<script'))
  assert.match(script, /function whatText\(row: AuditRow\): string \{\s*return row\.tool \? toolText\(row\.tool\)/)
  assert.match(template, /\{\{ whatText\(row\) \}\}/, 'the 做了什么 cell no longer goes through whatText')
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
  assert.match(
    script,
    /function recordedObjectOf\([\s\S]*?const recordedId = effect \|\| proposal \? null : recordedObjectIn\(row\)/,
    'there is no single reader for the row-recorded key on the road that has neither a ledger row nor a proposal',
  )
  assert.match(script, /resultType: toolResultType\(row\.tool\)/,
    'the kind of the blocked object is not taken from the tool declaration')
  assert.match(
    script,
    /function objectOf\(row: AuditRow\): string \{[\s\S]*?recorded: recordedObjectOf\(row, e, proposal\)/,
    'the object column does not take the row-recorded key — it and the expansion would answer ③ differently',
  )
  assert.match(
    script,
    /function sixOf\(row: AuditRow\)[\s\S]*?const recorded = recordedObjectOf\(row, e, proposal\)/,
    'the six answers no longer take the recorded key from the same place as the object column',
  )
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
  assert.match(script, /const approver = approverOf\(row, viewRows\.value\)/,
    'the page does not pair the decision row from the audit rows it holds')
  // N6（2026-11-21）：配到的裁决人若宿主给不出名字，交进去的是**空**，第六问于是说「没有记下批准人」，
  // 而不是把一串数字当成名字。裸 id 冒充人名，正是「谁」这一处对不上账的来源之一。
  //
  // N6 (2026-11-21): when the host cannot name the paired decider, an **empty** answer is handed in, so
  // the fifth question says it did not record the approver instead of passing an id off as a name. A bare
  // id standing in for a person is one of the ways the "who" cell failed to line up.
  assert.match(script, /approverName: approver \? names\.value\[String\(approver\.userId\)\] \?\? '' : ''/,
    'the paired approver is not resolved to a name (or the empty answer is not explicit)')
  assert.match(script, /composeSix\(\{[\s\S]*?\bapproverName:/, 'the six answers no longer receive the approver')
  assert.doesNotMatch(script, /approverOf\(row, inventory/, 'the approver is being answered from the inventory')
})

// ── 第六位读者复验剩下的三项（2026-11-11）──────────────────────────────────────────────────────────
// ── The three findings left by the sixth reader recheck (2026-11-11) ───────────────────────────────

test('D-1: a search narrows the table to its matches, and clearing restores the list', () => {
  // 读者按「客户 · 主键 2 · 一整天」检索，页面答「命中 3 行」，表格仍是 20 行 —— 检索只肯报数、不肯挑行。
  // 表格必须渲染**这次检索的那一份**；条件一改、按清空/筛选/刷新就回到普通列表，翻页也不再压在检索结果上。
  //
  // The reader searched customer #2 over one day, the page answered "3 rows matched", and the table still
  // showed 20 — the search would count but not pick. The table must render **this search's set**; changing
  // a condition or pressing clear/filter/refresh returns to the plain list, and the pager is not drawn
  // over a search result.
  const template = page.slice(page.indexOf('<template>'), page.indexOf('<script'))
  assert.match(template, /:data="displayRows"/, 'the table does not render the displayed rows')
  assert.match(
    script,
    /const displayRows = computed\(\(\) =>\s*displayRowsOf\(\{ queryRan: queryRan\.value, queryRows: queryRows\.value, rows: rows\.value \}\)/,
    'displayRows is not derived from displayRowsOf',
  )
  assert.match(script, /function clearQueryResults\(\)/, 'there is no way back to the plain list')
  assert.match(template, /@click="clearQueryResults\(\)"/, 'the clear-search control is not wired')
  assert.match(template, /v-if="!queryRan" class="pager"/, 'the pager is still drawn over a search result')
  assert.match(script, /for \(const row of displayRows\.value\)/, 'the summary still counts the list window')
  assert.match(template, /:empty-text="emptyText"/, 'the table does not take its empty text from the page')
  assert.match(
    script,
    /const key = emptyTextKey\(\{\s*queryFailed: queryFailed\.value,\s*queryRan: queryRan\.value,\s*queryScanBound: queryScanBound\.value,?\s*\}\)/,
    'an empty search result no longer takes its sentence from the search endings',
  )
})

test('an unfinished search does not read as one that matched nothing', () => {
  // Measured in the browser on 2026-11-20: when the read face answered 500, the page said "0 row(s) matched"
  // and "No row matched this search" — both assert a search that finished, while the request had failed.
  // A failure has to be said apart from "finished, matched nothing".
  //
  // 2026-11-20 浏览器复核实测：读面回 500 时，页面同时说「命中 0 行」「这次检索没有命中任何行」——前两句
  // 断言了一次跑完的检索，而实际是请求失败。失败必须与「跑完了、没命中」分开说。
  const template = page.slice(page.indexOf('<template>'), page.indexOf('<script'))
  assert.match(
    template,
    /v-if="queryRan && !queryFailed" class="query-status"/,
    'the hit count is still drawn over a search that did not finish',
  )
  assert.match(
    script,
    /const emptyText = computed\(\(\) => \{\s*const key = emptyTextKey\(\{\s*queryFailed: queryFailed\.value,\s*queryRan: queryRan\.value,\s*queryScanBound: queryScanBound\.value,?\s*\}\)\s*return key \? t\(key\) : undefined\s*\}\)/,
    'the empty text does not tell "did not finish" apart from "matched nothing"',
  )
  assert.match(
    script,
    /catch \(e\) \{[\s\S]{0,400}?queryFailed\.value = true/,
    'a failed search is not marked as unfinished',
  )
  assert.match(
    script,
    /function clearQueryResults\(\) \{[\s\S]{0,400}?queryFailed\.value = false/,
    'clearing the search does not clear the failure',
  )
  assert.match(
    script,
    /queryRunning\.value = true\s*\n\s*exportError\.value = ''\s*\n\s*queryFailed\.value = false/,
    'a new search starts without clearing the previous failure',
  )
  assert.match(
    script,
    /const keyOnlySearch = computed\(\s*\(\) =>\s*queryRan\.value &&\s*!queryFailed\.value/,
    'the key-only hint is drawn over a search that did not finish',
  )
})

test('R-2: a scan that hit its bound says so in both exports, and an unfinished one gains nothing', () => {
  // 2026-11-21 的真栈读数：3000 行的区间里，同区间重扫只读到最新 1000 行（5 页 × 200）。页面说出了上限，
  // 两份 CSV 却把这 1000 行以「全部命中」的样子带走 —— 文件一旦离开页面，声明就不在读者眼前了。这一条
  // 钉住接线：两份导出都经 `withCsvNotes`，声明只从 `scanBoundNote()` 来，而它的真假来自审计扫描自己
  // 的 `complete`（不是把台账与确认记录的窗口也算进去的 `queryTruncated`）。
  //
  // The 2026-11-21 real-stack reading: in a 3000-row range the by-range rescan read only the newest 1000
  // rows (5 pages × 200). The page said so; the two CSVs carried those 1000 rows away as "everything that
  // matched". Once the file leaves the page the statement is no longer in front of the reader. This pins
  // the wiring: both exports go through `withCsvNotes`, the statement comes only from `scanBoundNote()`,
  // and its truth is the audit scan's own `complete` — not `queryTruncated`, which also counts the ledger's
  // and the confirmation queue's windows.
  const exportSix = script.slice(script.indexOf('async function exportSix'), script.indexOf('async function exportCheck'))
  const exportCheck = script.slice(script.indexOf('async function exportCheck'), script.indexOf('function downloadCsv'))
  assert.match(
    exportSix,
    /downloadCsv\(csvFilename\(\), withCsvNotes\(csvText\(answerRows, labels\), \[readFaceNote\(\), scanBoundNote\(\)\]\)\)/,
    'the six-column export does not carry the bound statement (read-face note first, then the bound)',
  )
  assert.match(
    exportCheck,
    /withCsvNotes\(checkCsvText\(entryRows, labels, t\('keelbase\.audit\.exportNote'\)\), \[\s*readFaceNote\(\),\s*scanBoundNote\(\),\s*\]\)/,
    'the verification export does not carry the bound statement beside its correlation note',
  )
  assert.match(
    script,
    /function scanBoundNote\(\): string \{\s*return queryScanBound\.value \? t\('keelbase\.audit\.exportScanBound', \{ n: auditScanCap\.rows \}\) : ''\s*\}/,
    'the bound statement is not gated on the audit scan hitting its bound, or does not name the configured cap',
  )
  assert.match(script, /queryScanBound\.value = !audit\.complete/, 'the audit bound is not read from the scan')
  assert.match(
    script,
    /function clearQueryResults\(\) \{[\s\S]{0,400}?queryScanBound\.value = false/,
    'clearing the search leaves the bound statement behind',
  )
  // 空态由三种结局挑一句话，其中「跑完且触到上限」与「跑完、上限内真的没有」必须分开说。
  // The empty text picks one sentence by three endings; "finished and hit the bound" must read apart from
  // "finished and there really was nothing inside the bound".
  assert.match(script, /import \{[^}]*\bemptyTextKey\b[^}]*\} from '@\/keelbase\/auditQuery\.mjs'/,
    'the page does not take the empty-text key from the query module')
  assert.match(script, /queryScanBound: queryScanBound\.value/, 'the empty text is not told whether the bound was hit')
  const patch = readFileSync(join(ROOT, 'keelbase-ui/host-patches/0002-governance-ui.patch'), 'utf8').replace(/\r\n/g, '\n')
  for (const key of ['queryEmptyAtBound:', 'exportScanBound:']) {
    const hits = patch.split(`+      ${key}`).length - 1
    assert.equal(hits, 2, `${key} is not in both language bundles`)
  }
  // 上限可配之后，注记正文必须跟着上限走：两份语言包都带 {n}，且都不再写死 1000。
  // With a configurable cap the note has to carry it: both bundles use {n} and neither keeps the literal 1000.
  const boundEntries = [...patch.matchAll(/exportScanBound:\n\+\s*'([^']+)'/g)].map((match) => match[1])
  assert.equal(boundEntries.length, 2, 'exportScanBound is not in both language bundles')
  for (const text of boundEntries) {
    assert.match(text, /\{n\}/, `the bound statement does not name the configured cap: ${text}`)
    assert.doesNotMatch(text, /1000/, `the bound statement still writes a fixed 1000: ${text}`)
  }
})

test('both exports name the read face only when the answer proved it ignored the filters', () => {
  // N4 的第二支：读面忽略对象/终点这件事，页面说了，文件却不说 —— 导出件一离开页面就只剩一份看着像
  // 「就是这些」的列表。现在两份导出各带一行 `#` 注记，**与页面警告同一句话、同一个词条**（不新造第二种
  // 说法）；它的真假只来自 `readFaceIgnored`，而那个值只由第一次答复的行决定（`readFaceIgnoredFilters`）：
  // 空链、探针式空答复、请求失败、没跑过检索都是 false，文件不多一个字。
  //
  // 次序固定：读面注记在**前**，扫描上限注记在**后** —— 先说这些行为什么是控制台自己挑的，再说这次挑拣
  // 只读到多远。`withCsvNotes` 按给定次序写行（纯函数侧逐字钉在 `audit-query.test.mjs`）。
  //
  // N4's second branch: the page said the read face ignored the object/end, the file did not — once the
  // export left the page it was a list that looked like "this is all there is". Both exports now carry a
  // `#` note with **the page warning's own sentence and key** (no second wording); its truth comes only
  // from `readFaceIgnored`, which `readFaceIgnoredFilters` sets from the first answer's rows: an empty
  // chain, an empty probe-style answer, a failed request or a search that never ran all leave it false, so
  // the file gains nothing.
  //
  // The order is fixed: the read-face note **first**, the bound note **after** — why these rows are the
  // console's own narrowing, then how far that narrowing could read. `withCsvNotes` writes the lines in
  // the order given (pinned verbatim in `audit-query.test.mjs`).
  assert.match(
    script,
    /import \{[^}]*\bwithCsvNotes\b[^}]*\} from '@\/keelbase\/auditQuery\.mjs'/s,
    'the page does not take the note writer from the query module',
  )
  assert.match(
    script,
    /function readFaceNote\(\): string \{\s*return readFaceIgnored\.value \? t\('keelbase\.audit\.readFaceUnfiltered'\) : ''\s*\}/,
    'the export note is not the page warning’s own sentence, gated on the evidence',
  )
  const exportSix = script.slice(script.indexOf('async function exportSix'), script.indexOf('async function exportCheck'))
  const exportCheck = script.slice(script.indexOf('async function exportCheck'), script.indexOf('function downloadCsv'))
  for (const [name, body] of [['six-column', exportSix], ['verification', exportCheck]]) {
    assert.ok(
      body.indexOf('readFaceNote()') !== -1 && body.indexOf('readFaceNote()') < body.indexOf('scanBoundNote()'),
      `the ${name} export does not put the read-face note before the bound note`,
    )
  }
  // 无证据的三种路：初始 false、清空检索时复位、请求失败时复位。
  // The three no-evidence roads: false by default, reset when the search is cleared, reset when it fails.
  assert.match(script, /const readFaceIgnored = ref\(false\)/, 'the read-face evidence does not start false')
  assert.match(
    script,
    /function clearQueryResults\(\) \{[\s\S]{0,400}?readFaceIgnored\.value = false/,
    'clearing the search leaves the read-face note behind',
  )
  assert.match(
    script,
    /catch \(e\) \{[\s\S]{0,400}?readFaceIgnored\.value = false/,
    'a failed search still leaves the read-face note behind',
  )
})

test('D-6: a decision row answers ⑤ as the decision itself', () => {
  // `#29` 已批准：列表「谁」是「批准人」，而展开的五问是 `—`。裁决行本身就是那次裁决，第五问要点名同一行
  // 的裁决人并说明这一点；执行行上「第二人批准」那一句不动。
  //
  // `#29` approved: the list's "who" says Approver while the expansion's fifth question says `—`. A
  // decision row **is** that decision, so the fifth question names its own decider and says so; the
  // execution row's "a second person approved it" sentence is untouched.
  const six = readFileSync(join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs'), 'utf8')
  assert.match(six, /outcome === 'approved' && action === 'tool_confirmation'/,
    'a decision row still falls through to the bare marker')
  assert.match(six, /keelbase\.sixQ\.confirmDecisionApproved/, 'the decision row has no sentence of its own')
  assert.match(six, /action: row\?\.action/, 'composeSix is not told which action the row is')
  // 第二人批准那一档仍走 `approverName`
  assert.match(six, /if \(approverName\) \{\s*return \{ text: `\$\{approverName\} \$\{t\('keelbase\.sixQ\.confirmSecondPerson'\)\}`/)
})

test('D-8: a second export carries the id and the checks, and the six-column one is untouched', () => {
  // 核对 CSV：编号 + 六问 + 判定依据。原六列业务 CSV 一个字符都不动（U1 的验收口径）。
  // The verification CSV: id + the six answers + the checks. The original six-column business CSV is
  // untouched, cell for cell (U1's acceptance reading).
  const template = page.slice(page.indexOf('<template>'), page.indexOf('<script'))
  const query = readFileSync(join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/auditQuery.mjs'), 'utf8')
  assert.match(template, /void exportCheck\(\)/, 'there is no second export control')
  assert.match(script, /async function exportCheck\(\)/)
  // 表头前那一行说明就是第二入口的限度（`N6`），故它跟着这次调用一起走。
  // The line before the header is the second entry's limit (`N6`), so it rides along with this call.
  assert.match(script, /checkCsvText\(entryRows, labels, t\('keelbase\.audit\.exportNote'\)\)/, 'the second export does not go through checkCsvText with its correlation note')
  assert.match(script, /checksTextOf\(row\)/, 'the second export does not carry the checks')
  assert.match(script, /CHECK_COLUMN_KEYS\.map\(/, 'the second export hardcodes its columns')
  assert.match(script, /checkCsvFilename\(\)/)
  assert.match(query, /export const CHECK_COLUMN_KEYS = \['id', \.\.\.SIX_QUESTIONS, 'checks'\]/)
  assert.match(query, /export function checkCsvText\(/)
  assert.match(script, /csvText\(answerRows, labels\)/, 'the six-column export no longer uses csvText')
  assert.match(script, /answerRows = queryRows\.value\.map\(\(row\) => \(\{ answers: sixOf\(row\) \}\)\)/,
    'the six-column export no longer composes exactly six answers')
})

test('an unregistered check is named as unregistered, never by the runtime’s own word', () => {
  // The 2026-11-17 real-stack reading: with `checks[].name` replaced by `crmCustomerScope`, the page drew
  // it verbatim. The vocabulary is a closed set (`keelbase.audit.check.*`); a name outside it prints
  // 「未登记的检查 / an unregistered check」 — the screen and the verification CSV read the same
  // `checkText`, so both are closed at once.
  //
  // 2026-11-17 真栈读数：把 `checks[].name` 换成 `crmCustomerScope` 后，页面把它原样画了出来。名表是闭集
  // （`keelbase.audit.check.*`），闭集之外的名字一律印「未登记的检查 / an unregistered check」—— 屏幕与
  // 核对 CSV 读的是同一个 `checkText`，故这两处同时收口。
  assert.match(
    script,
    /te\(key\) \? t\(key\) : t\('keelbase\.audit\.checkUnregistered'\)/,
    'checkText does not close the vocabulary',
  )
  assert.doesNotMatch(script, /te\(key\) \? t\(key\) : name/, 'checkText still falls back to the runtime name')
  const patch = readFileSync(join(ROOT, 'keelbase-ui/host-patches/0002-governance-ui.patch'), 'utf8').replace(/\r\n/g, '\n')
  assert.ok(patch.includes("checkUnregistered: 'an unregistered check'"), 'en.ts lacks checkUnregistered')
  assert.ok(patch.includes("checkUnregistered: '未登记的检查'"), 'zh-CN.ts lacks checkUnregistered')
})

test('the search hands the range end and the object to the read face', () => {
  // U1 的宿主侧收口：对象 + 区间以前只在控制台本地收窄（读面只收起点）。现在两样都发给读面，
  // 会施加它们的运行时回一份已经收窄的列表；旧运行时忽略未知参数，本地收窄仍决定结果。
  // The host side of U1: object + range used to be narrowed only on the console (the read face took a
  // start but no end). Both now go to the read face; a runtime that applies them answers an already
  // narrowed list, and an older one ignores the unknown parameters while the local narrowing decides.
  const scan = script.slice(
    script.indexOf('async function scanAudit'),
    script.indexOf('async function scanLedger'),
  )
  for (const param of ['until: untilIso', 'objectType: object?.type', 'objectId: object?.id']) {
    assert.ok(scan.includes(param), `scanAudit does not pass \`${param}\` to the read face`)
  }
  const runStart = script.indexOf('async function runQuery')
  const runRest = script.slice(runStart)
  const runNext = runRest.indexOf('async function ', 10)
  const run = runNext === -1 ? runRest : runRest.slice(0, runNext)
  assert.match(run, /wantedType && wantedKey/, 'half an object filter is the only thing sent')
  assert.match(run, /until\.value \? until\.value\.toISOString\(\)/, 'the range end is not passed to scanAudit')
})

test('a read face that ignored the filters is named as such, from the answer that carried them', () => {
  // F10 的宿主侧：生成器产出的应用会静默忽略 `until/objectType/objectId`，同一查询回一份更宽的列表。
  // 命中仍由本页自己挑（上一组测试钉住两种读面同一个答案），但当答复**明显更宽**时页面要说出这件事，
  // 并把读者指向读面自己的答复。取证只用**第一次**扫回来的那份 —— 页面有意按区间重扫的那次不算。
  //
  // The host side of F10: an application produced by the generator silently ignores `until/objectType/objectId`
  // and answers a wider list. The page still picks the rows itself (the tests above pin one answer on both
  // faces), but when the answer is **recognisably wider** it says so and points the reader at the read
  // face's own answer. Evidence comes from the **first** answer only — the page's own by-range rescan is
  // not the face ignoring anything.
  assert.match(
    script,
    /import \{[^}]*readFaceIgnoredFilters[^}]*\} from '@\/keelbase\/auditQuery\.mjs'/s,
    'the page does not import the wider-answer reader from the query module',
  )
  const runStart = script.indexOf('async function runQuery')
  const runRest = script.slice(runStart)
  const runNext = runRest.indexOf('async function ', 10)
  const run = runNext === -1 ? runRest : runRest.slice(0, runNext)
  assert.match(run, /const firstAnswer = audit\.rows/, 'the first answer is not kept for evidence')
  assert.match(
    run,
    /readFaceIgnoredFilters\(firstAnswer, \{/,
    'the wider-answer check is not made against the answer that carried the filters',
  )
  // 只给种类或只给主键时页面根本不发对象筛选，故不能拿对象取证 —— 否则每一次这样的检索都会被读成
  // 「读面忽略了对象」。对象那一半只认**真的发出去过**的那一组条件。
  //
  // A kind-only or key-only search sends no object filter at all, so it cannot be evidence about the
  // object — otherwise every such search would read as "the read face ignored the object". The object
  // half is taken only from the conditions that were actually sent.
  assert.match(
    run,
    /object: objectForServer \? wanted : null/,
    'the object is used as evidence even when the page never sent it',
  )
  assert.match(
    page,
    /v-if="queryRan && !queryFailed && readFaceIgnored"[\s\S]{0,120}keelbase\.audit\.readFaceUnfiltered/,
    'the page does not render the line that names the read face ignoring the filters',
  )
  const patch = readFileSync(join(ROOT, 'keelbase-ui/host-patches/0002-governance-ui.patch'), 'utf8').replace(/\r\n/g, '\n')
  assert.ok(patch.includes("readFaceUnfiltered:\n+        'The runtime’s audit read face did not apply"), 'en.ts lacks readFaceUnfiltered')
  assert.ok(patch.includes('readFaceUnfiltered:\n+        \'运行时的审计读面没有施加'), 'zh-CN.ts lacks readFaceUnfiltered')
})

test('an empty object answer is scanned again, because the row may name its object in the sentence', () => {
  // 读面的对象筛选只走台账。一次 MCP 连通测试不写台账，它把带类型的键写在句末；读面按对象答空时，
  // 页面必须按区间重扫一次，再由本地证据链挑行 —— 否则这一行永远检索不到。台账命中时这一步不发生。
  //
  // The read face's object filter goes through the ledger alone. An MCP connect test writes no ledger row
  // and names its object in the typed key at the end of the sentence; an empty object answer must be
  // scanned again by range, with the local evidence chain picking, or the row is never found. A ledger
  // hit never gets here.
  const runStart = script.indexOf('async function runQuery')
  const runRest = script.slice(runStart)
  const runNext = runRest.indexOf('async function ', 10)
  const run = runNext === -1 ? runRest : runRest.slice(0, runNext)
  assert.match(
    run,
    /if \(objectForServer && audit\.rows\.length === 0\) \{\s*audit = await scanAudit\(sinceIso, untilIso, undefined\)/,
    'the narrowed answer is never re-scanned, so a row that only names its object in `detail` stays unfindable',
  )
  assert.match(script, /recordedTypedObject/, 'the page does not read the typed key at the end of a row')
  assert.match(
    script,
    /const typed = recordedTypedObject\(row\)\s*\n\s*if \(typed\) return typed/,
    'the typed key is not the road the object column takes',
  )
  assert.match(
    script,
    /\[\.\.\.RECORD_TYPES, \.\.\.OBJECT_KEY_TYPES\]/,
    'the object filter offers only the ledger kinds, so an MCP connection cannot be chosen at all',
  )
  // 只由句末句子点名的种类，读面收到的是它的**种类词**：运行时在台账答空后按这个词逐字对键。
  // A kind only the sentence names goes to the read face as its **kind word**: the runtime compares
  // that word, character for character, when the ledger answers nothing.
  assert.match(
    script,
    /const serverType = OBJECT_KEY_KINDS\[wantedType\] \|\| wantedType/,
    'the page sends the internal type for a sentence-only kind, so the runtime cannot match its key',
  )
})

test('the MCP connection kind has one word in each bundle, and it is not the table name', () => {
  const patch = readFileSync(join(ROOT, 'keelbase-ui/host-patches/0002-governance-ui.patch'), 'utf8').replace(/\r\n/g, '\n')
  const words = {}
  for (const lang of ['en', 'zh-CN']) {
    const start = patch.indexOf(`diff --git a/src/locales/${lang}.ts`)
    const next = patch.indexOf('diff --git', start + 10)
    const body = patch.slice(start, next < 0 ? undefined : next)
    const hit = body.match(/^\+\s+ai1_mcp: '([^']*)',$/m)
    assert.ok(hit, `${lang}: the MCP connection kind has no word, so the option would print a key name`)
    words[lang] = hit[1]
  }
  assert.notEqual(words.en, words.zh)
  for (const word of Object.values(words)) {
    assert.doesNotMatch(word, /ai1_mcp/, 'a bundle word leaks the table name into the page and the export')
  }
})

test('the two follow-up kinds read differently, and a key-only search says why it can match more', () => {
  // The 2026-11-17 real-stack reading: the kind select carried `crm_follow_up_record` and `follow_up` both
  // reading 「跟进记录」, picking the wrong one first matched nothing; the key alone matched four rows (a
  // pending one among them) and kind + key three, with nothing on the page saying why. Two things are pinned
  // here: the two business words differ in both languages, and the count rule (`keyOnlyHint`) is drawn beside
  // the hits only after a key-only search ran — otherwise a copy edit, a moved block, or a hint that appears
  // for searches it does not describe slips back unnoticed.
  //
  // 2026-11-17 的真栈读数：种类下拉里 `crm_follow_up_record` 与 `follow_up` 两项**都**叫「跟进记录」，第一次
  // 选错命中 0；只填主键命中 4 行（含待决），类型 + 主键 3 行，页面上没有一句说明。这里钉住两件事：两条业务
  // 词在两种语言里都不再相同；行数口径那句（`keyOnlyHint`）只在只给主键的检索跑过时、画在命中旁边 —— 否则
  // 改词条、挪模板、或者让说明在非只给主键时也出现，都能悄悄退回去。
  const patch = readFileSync(join(ROOT, 'keelbase-ui/host-patches/0002-governance-ui.patch'), 'utf8').replace(/\r\n/g, '\n')
  for (const lang of ['en', 'zh-CN']) {
    const start = patch.indexOf(`diff --git a/src/locales/${lang}.ts`)
    const next = patch.indexOf('diff --git', start + 10)
    const body = patch.slice(start, next < 0 ? undefined : next)
    const at = body.indexOf('    record: {')
    const end = body.indexOf('\n+    },', at)
    const tree = {}
    for (const m of body.slice(at, end).matchAll(/^\+\s+(\w+):\s*'([^']*)',/gm)) tree[m[1]] = m[2]
    assert.ok(tree.crm_follow_up_record && tree.follow_up, `${lang}: a follow-up kind lost its business word`)
    assert.notEqual(tree.crm_follow_up_record, tree.follow_up, `${lang}: the two follow-up kinds still read the same`)
  }
  for (const line of [
    "crm_follow_up_record: 'CRM follow-up record'",
    "follow_up: 'Sample follow-up'",
    "crm_follow_up_record: 'CRM 跟进记录'",
    "follow_up: '示例跟进记录'",
  ]) {
    assert.ok(patch.includes(line), `the host patch lacks \`${line}\``)
  }

  const hints = [...patch.matchAll(/^\+\s*keyOnlyHint:\s*\n\+\s*('[^']*'|"[^"]*")/gm)].map((m) => m[1])
  assert.equal(hints.length, 2, 'expected one keyOnlyHint per language in the host patch')
  assert.ok(hints.some((h) => /pending row/.test(h)), 'the English keyOnlyHint no longer names the pending row')
  assert.ok(hints.some((h) => /待决行/.test(h)), 'the Chinese keyOnlyHint no longer names the pending row')

  assert.match(
    script,
    /const keyOnlySearch = computed\(\s*\(\) =>\s*queryRan\.value &&\s*!queryFailed\.value &&\s*!objectQuery\.resultType/,
    'the hint is not gated on a search that gave the key and no kind',
  )
  const template = page.slice(page.indexOf('<template>'), page.indexOf('<script'))
  const statusAt = template.indexOf('class="query-status"')
  const hintAt = template.indexOf("t('keelbase.audit.keyOnlyHint')")
  assert.ok(statusAt >= 0, 'the result status block is gone')
  assert.ok(hintAt > statusAt, 'the key-only rule is not drawn beside the hits')
  assert.ok(template.lastIndexOf('v-if="keyOnlySearch"', hintAt) > 0, 'the key-only rule is drawn for every search')
})
