// SPDX-License-Identifier: Apache-2.0
//
// `U1`：按**业务对象 + 时间区间**读审计，并把六问导成 CSV。这一条钉四件事 ——
//
//   ① 对象的三条来路与审计页同一条证据链（台账 → 确认记录 → 行末记下的键）；带了 `executionId`
//      就只按它精确配，**不**退回去按时间猜。
//   ② 按对象 + 区间挑行：类型只给类型、主键只给主键、两者都给，三种都按写下的规则挑。
//   ③ CSV 恰好六列、列序固定、表头是六问的业务词；缺答案写 `—`，绝不空着。
//   ④ **反向可证**：一格带着内部名（表名、工具名、UUID）时整份导出拒绝，且错误里不回显那串名字。
//
//     node --test scripts/audit-query.test.mjs
//
// The `U1` slice: read the audit trail by **business object and time range**, and export the six
// answers as CSV. This pins four things — the object's three roads are the audit page's own evidence
// chain (ledger → confirmation record → the key recorded at the end of the row), with an
// `executionId` matched exactly and **never** guessed back from time; the object + range selection
// under all three ways to specify it; a CSV with exactly six columns in a fixed order, headers in the
// six questions' business words, and `—` instead of a blank for a missing answer; and a **reverse
// proof** — one cell carrying an internal name (a table name, a tool name, a UUID) refuses the whole
// export, and the error does not echo the name.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = process.env.KEELBASE_REPO_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')
const QUERY = join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/auditQuery.mjs')
const PAGE = 'keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue'

const q = await import(pathToFileURL(QUERY).href)
const { leaksIn, recordedTypedObject, SIX_QUESTIONS } = await import(
  pathToFileURL(join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs')).href
)

/** 六问的列头，与 `0002-governance-ui.patch` 里那六个词条逐字相同。 */
/** The six column labels, verbatim from the six question messages in `0002-governance-ui.patch`. */
const LABELS = [
  'Who',
  'When (with the zone)',
  'Which business object',
  'What it became (before → after)',
  'Who confirmed',
  'What came of it',
]

const TOOL_TYPES = {
  update_crm_customer: 'crm_customer',
  delete_project: 'pm_project',
  record_crm_followup: 'crm_follow_up_record',
}
const resultTypeOf = (tool) => TOOL_TYPES[tool] ?? ''

/** A row and the ledger row the runtime would have written for it (values from the 2026-10-28 run). */
function operation({
  id = 3454,
  tool = 'update_crm_customer',
  executionId = 'fda3e3d0-2954-4c48-be60-f1e1ece29c61',
  createdAt = '2026-10-28T05:37:06.564268Z',
  detail = 'update_crm_customer -> ok',
} = {}) {
  return { id, userId: '1', action: 'tool_call', tool, executionId, createdAt, detail, isError: false, outcome: 'executed' }
}

const effect = (over = {}) => ({
  executionId: 'fda3e3d0-2954-4c48-be60-f1e1ece29c61',
  toolName: 'update_crm_customer',
  resultType: 'crm_customer',
  resultId: 9005,
  createdAt: '2026-10-28T05:37:06.100Z',
  ...over,
})

test('an executed row takes its object from the ledger by executionId — no time guessing', () => {
  const row = operation()
  assert.deepEqual(q.objectRefOf(row, { effects: [effect()], resultTypeOf }), {
    resultType: 'crm_customer',
    resultId: 9005,
  })
})

test('an executionId with no ledger row answers null instead of falling back to tool + time', () => {
  // 第二次执行写的台账行在窗口里、时刻也近，但 `executionId` 对不上：把那一行当成本行，就是把
  // 两条不同的执行摆到一起。
  // A second execution's ledger row is in the window and close in time, but its `executionId` differs.
  // Taking it for this row puts two different executions beside each other.
  const row = operation()
  const other = effect({ executionId: 'f8f1bda5-246c-45b0-9fbe-88dc4131be92', resultId: 9006 })
  assert.equal(q.objectRefOf(row, { effects: [other], resultTypeOf }), null)
})

test('without an executionId the ledger pairs by tool and five seconds, exactly one candidate', () => {
  const row = operation({ executionId: null })
  assert.deepEqual(q.objectRefOf(row, { effects: [effect({ executionId: null })], resultTypeOf }), {
    resultType: 'crm_customer',
    resultId: 9005,
  })
  const twin = effect({ executionId: null, resultId: 9006, createdAt: '2026-10-28T05:37:08.000Z' })
  assert.equal(
    q.objectRefOf(row, { effects: [effect({ executionId: null }), twin], resultTypeOf }),
    null,
    'two candidates within five seconds must answer nothing, not one of them',
  )
})

test('a held or refused call takes its object from the confirmation record', () => {
  const row = operation({ executionId: null, detail: 'update_crm_customer -> refused' })
  const proposal = {
    toolName: 'update_crm_customer',
    arguments: { id: 9004, name: 'x' },
    createdAt: '2026-10-28T05:37:06.000Z',
    decidedAt: null,
  }
  assert.deepEqual(q.objectRefOf(row, { proposals: [proposal], resultTypeOf }), {
    resultType: 'crm_customer',
    resultId: 9004,
  })
})

test('a blocked call takes its object from the key its own row recorded', () => {
  const row = operation({
    tool: 'delete_project',
    executionId: null,
    detail: 'delete_project -> blocked (R5) · intended object #12',
  })
  assert.deepEqual(q.objectRefOf(row, { resultTypeOf }), { resultType: 'pm_project', resultId: 12 })
})

test('a row that records none of the three answers nothing', () => {
  const row = operation({ executionId: null, detail: 'something else' })
  assert.equal(q.objectRefOf(row, { resultTypeOf }), null)
})

test('a connect test takes its object from the typed key at the end of its row', () => {
  // 一次 MCP 连通测试没有工具，也不写台账：它把**带类型**的键写在句末。句子里是可读的词，检索按类型判等。
  // 动作词是过渡借用的（契约尚无这个动作）；这条键的读法不看动作词。
  // An MCP connect test has no tool and writes no ledger row: it puts a **typed** key at the end of its
  // sentence. The sentence carries a readable word; the search still compares by type. The action word
  // is a borrowed interim one (the contract has no word for the act yet); this reader does not look at it.
  const row = {
    id: 7, userId: '1', action: 'analyze', tool: null, executionId: null,
    createdAt: '2026-11-20T01:00:00.000Z', detail: 'mcp connectivity test id=12 name=x result=ok · object MCP connection #12',
  }
  assert.deepEqual(recordedTypedObject(row), { resultType: 'ai1_mcp', resultId: 12 })
  assert.deepEqual(q.objectRefOf(row, { resultTypeOf }), { resultType: 'ai1_mcp', resultId: 12 })
})

test('the console reads the typed key exactly the way the runtime endpoint does', () => {
  // 判据以运行时为准：句末必须**恰好**收尾，主键 1–18 位、前导零有意义、长主键不丢位数。
  // The runtime is authoritative: the key must end the sentence exactly, the key is 1–18 digits,
  // leading zeros are significant, and a long key keeps every digit.
  const at = (detail) => ({
    id: 7, userId: '1', action: 'analyze', tool: null, executionId: null,
    createdAt: '2026-11-20T01:00:00.000Z', detail,
  })
  assert.equal(recordedTypedObject(at('x · object MCP connection #12 ')), null,
    'a trailing space is not the end of the key')
  assert.equal(recordedTypedObject(at('x · object MCP connection #12\n')), null,
    'a trailing line break is not the end of the key')
  assert.equal(recordedTypedObject(at('x · object MCP connection #12.')), null,
    'a trailing period is not the end of the key')
  assert.deepEqual(recordedTypedObject(at('x · object MCP connection #007')),
    { resultType: 'ai1_mcp', resultId: '007' }, '#007 is not #7')
  assert.deepEqual(recordedTypedObject(at('x · object MCP connection #123456789012345678')),
    { resultType: 'ai1_mcp', resultId: '123456789012345678' }, 'an eighteen-digit key keeps every digit')
  assert.equal(recordedTypedObject(at('x · object MCP connection #1234567890123456789')), null,
    'nineteen digits are not a key')
})

test('the typed key picks the row when the ledger has nothing for that object', () => {
  const row = {
    id: 7, userId: '1', action: 'analyze', tool: null, executionId: null,
    createdAt: '2026-11-20T01:00:00.000Z', detail: 'mcp connectivity test id=12 name=x result=ok · object MCP connection #12',
  }
  const picked = q.selectRows([row], {
    object: { resultType: 'ai1_mcp', resultId: '12' },
    effects: [],
    proposals: [],
    resultTypeOf,
  })
  assert.deepEqual(picked.map((entry) => entry.row.id), [7], 'the ledger had no match, the sentence did')
})

test('the typed key does not answer a search for another kind', () => {
  const row = {
    id: 7, userId: '1', action: 'analyze', tool: null, executionId: null,
    createdAt: '2026-11-20T01:00:00.000Z', detail: 'mcp connectivity test id=12 name=x result=ok · object MCP connection #12',
  }
  assert.deepEqual(
    q.selectRows([row], {
      object: { resultType: 'crm_customer', resultId: '12' },
      effects: [],
      proposals: [],
      resultTypeOf,
    }).map((entry) => entry.row.id),
    [],
    'a key about an MCP connection must not answer a customer search',
  )
  assert.deepEqual(
    q.selectRows([row], {
      object: { resultType: '', resultId: '12' },
      effects: [],
      proposals: [],
      resultTypeOf,
    }).map((entry) => entry.row.id),
    [7],
    'a key-only search still finds the row: the kind is known, the search just did not name one',
  )
})

test('the ledger still wins over the typed key on the same row', () => {
  const row = operation({ detail: 'update_crm_customer -> ok · object MCP connection #12' })
  assert.deepEqual(q.objectRefOf(row, { effects: [effect()], resultTypeOf }), {
    resultType: 'crm_customer',
    resultId: 9005,
  })
})

test('a key that spells the table name is not an object, and would refuse the export', () => {
  // 坏键（把表名写进 detail）不该被读成一条对象：宁可「未记录」。而如果它真到了某一格，导出的防线仍在。
  // A bad key (the table name in `detail`) is not read as an object: better 「未记录」. And if it did
  // reach a cell, the export's guard still stands.
  const row = {
    id: 7, userId: '1', action: 'analyze', tool: null,
    createdAt: '2026-11-20T01:00:00.000Z', detail: 'mcp connectivity test id=12 result=ok · object ai1_mcp#12',
  }
  assert.equal(recordedTypedObject(row), null)
  assert.equal(q.objectRefOf(row, { resultTypeOf }), null)
  assert.deepEqual(leaksIn(' · object ai1_mcp#12'), ['ai1_mcp'], 'the guard no longer sees the table name')
  assert.deepEqual(leaksIn(' · object MCP connection #12'), [], 'the readable key must not trip the guard')
})

test('the range includes both ends and excludes a row it cannot place', () => {
  const at = (createdAt) => ({ createdAt })
  const since = new Date('2026-10-28T00:00:00.000Z')
  const until = new Date('2026-10-29T00:00:00.000Z')
  assert.equal(q.inWindow(at('2026-10-28T00:00:00.000Z'), { since, until }), true, 'start is inclusive')
  assert.equal(q.inWindow(at('2026-10-29T00:00:00.000Z'), { since, until }), true, 'end is inclusive')
  assert.equal(q.inWindow(at('2026-10-27T23:59:59.999Z'), { since, until }), false)
  assert.equal(q.inWindow(at('2026-10-30T00:00:00.000Z'), { since, until }), false)
  assert.equal(q.inWindow(at('not a time'), { since, until }), false, 'an unplaceable row is in no range')
})

test('selection: kind + key, kind alone, key alone', () => {
  const rows = [
    operation({ id: 1, createdAt: '2026-10-28T05:00:00.000Z' }),
    operation({ id: 2, executionId: 'x', createdAt: '2026-10-28T06:00:00.000Z' }),
  ]
  const effects = [effect(), effect({ executionId: 'x', resultId: 9006, createdAt: '2026-10-28T06:00:00.000Z' })]
  const base = { effects, resultTypeOf }
  const both = q.selectRows(rows, { ...base, object: { resultType: 'crm_customer', resultId: '9005' } })
  assert.deepEqual(both.map((e) => e.row.id), [1], 'kind + key picks exactly that record')
  const kindOnly = q.selectRows(rows, { ...base, object: { resultType: 'crm_customer', resultId: '' } })
  assert.deepEqual(kindOnly.map((e) => e.row.id), [1, 2], 'kind alone picks every row about that kind')
  const keyOnly = q.selectRows(rows, { ...base, object: { resultType: '', resultId: 9006 } })
  assert.deepEqual(keyOnly.map((e) => e.row.id), [2], 'key alone picks that record whatever its kind')
  assert.deepEqual(
    q.selectRows(rows, { ...base, object: { resultType: 'pm_project', resultId: '' } }).map((e) => e.row.id),
    [],
    'a kind nothing is about picks nothing',
  )
})

test('the same search picks the same rows whether the read face applied the filters or ignored them', () => {
  // F10：生成器产出的应用另有一条 `/audit/logs`，它只收 `userId/since/isError` —— 对象与终点被静默
  // 忽略，同一查询回一份更宽的列表。控制台不靠读面施加筛选：回来的无论是收窄过的还是更宽的，本地按同一
  // 组条件再挑一遍，命中必须相同。这条钉的就是「两条读面同一个答案」。
  //
  // F10: an application produced by the generator has its own `/audit/logs` that takes `userId/since/isError`
  // only — the object and the end are silently ignored and the same query answers a wider list. The console
  // does not lean on the face applying them: whether the answer came back narrowed or wider, it picks again
  // under the same conditions and the matched set has to be the same. That is "one answer on both faces".
  const rows = [
    operation({ id: 1, createdAt: '2026-10-28T05:37:06.000Z' }),
    operation({ id: 2, executionId: 'x', createdAt: '2026-10-28T06:00:00.000Z' }),
    operation({
      id: 3,
      tool: 'delete_project',
      executionId: null,
      createdAt: '2026-10-28T06:30:00.000Z',
      detail: 'delete_project -> blocked (R5) · intended object #12',
    }),
  ]
  const effects = [effect(), effect({ executionId: 'x', resultId: 9006, createdAt: '2026-10-28T06:00:00.000Z' })]
  const conditions = {
    object: { resultType: 'crm_customer', resultId: '9005' },
    since: '2026-10-28T05:00:00.000Z',
    until: '2026-10-28T06:05:00.000Z',
    effects,
    resultTypeOf,
  }
  // A face that applied the filters could only answer the row that matches all three.
  const applied = rows.filter((row) => row.id === 1)
  const appliedIds = q.selectRows(applied, conditions).map((entry) => entry.row.id)
  const ignoredIds = q.selectRows(rows, conditions).map((entry) => entry.row.id)
  assert.deepEqual(appliedIds, [1])
  assert.deepEqual(ignoredIds, appliedIds, 'a read face that ignored the filters changed the matched set')
  // The wider answer is also what the page must be able to *say* it received (see the page's line).
  assert.equal(q.readFaceIgnoredFilters(rows, conditions), true, 'a wider answer is not recognised as wider')
  assert.equal(q.readFaceIgnoredFilters(applied, conditions), false, 'a narrowed answer is misread as wider')
})

test('reading the wider answer: only a row the page can place proves the filters were ignored', () => {
  // 证据只来自读面**返回**的行：落在区间外、或本页解析出对象却不是所查对象的，不可能是施加过筛选的面
  // 回出来的。本页解析不出对象的行不算证据 —— 台账窗口有界，读面没有，那只会是一次误报。
  //
  // Evidence comes only from rows the face **returned**: one outside the range, or one this page places on
  // another object, could not have come from a face that applied the filters. A row this page cannot place
  // is not evidence — its ledger window is bounded and the face's is not, so that would be a false alarm.
  const withObject = { object: { resultType: 'crm_customer', resultId: '9005' }, effects: [effect()], resultTypeOf }
  assert.equal(q.readFaceIgnoredFilters([operation()], withObject), false, 'the matching row is not evidence')
  assert.equal(
    q.readFaceIgnoredFilters([operation({ executionId: 'x' })], {
      ...withObject,
      effects: [effect({ executionId: 'x', resultId: 9006 })],
    }),
    true,
    'a row the page places on another object is the face returning a non-match',
  )
  const unplaceable = operation({ executionId: null, detail: 'something else' })
  assert.equal(q.readFaceIgnoredFilters([unplaceable], withObject), false,
    'a row this page cannot place was taken as proof, and a bounded ledger makes that a false alarm')
  assert.equal(
    q.readFaceIgnoredFilters([operation({ createdAt: '2026-10-28T07:00:00.000Z' })], {
      since: '2026-10-28T05:00:00.000Z',
      until: '2026-10-28T06:00:00.000Z',
    }),
    true,
    'a row past the end the page asked for is not recognised as the face ignoring the end',
  )
  assert.equal(
    q.readFaceIgnoredFilters([{ ...operation(), createdAt: null }], {}),
    false,
    'with no range sent, a row the page cannot place is not evidence of anything',
  )
})

const answersOf = (texts) =>
  SIX_QUESTIONS.map((key, i) => ({ key, label: key, text: texts[i], answered: Boolean(texts[i]) }))

test('after a search the table shows the matched rows, and clearing brings the list back', () => {
  // 读者 #31/#30/#29 那次：「命中 3 行」而表格仍是 20 行。表格渲染的必须是**这次检索的那一份**；
  // 检索清空（`queryRan=false`）之后回到普通列表。
  //
  // The reader's #31/#30/#29 run: "3 rows matched" while the table still showed 20. The table must render
  // **the set this search picked**; once the search is cleared (`queryRan=false`) the plain list is back.
  const rows = Array.from({ length: 20 }, (_, i) => ({ id: i + 1 }))
  const queryRows = rows.slice(0, 3)
  assert.deepEqual(
    q.displayRowsOf({ queryRan: true, queryRows, rows }).map((row) => row.id),
    [1, 2, 3],
    'the matched rows are not what the table renders',
  )
  assert.equal(q.displayRowsOf({ queryRan: true, queryRows, rows }).length, 3)
  assert.equal(q.displayRowsOf({ queryRan: false, queryRows, rows }).length, 20, 'clearing did not restore the list')
  assert.equal(q.displayRowsOf({ queryRan: false, queryRows: [], rows }), rows)
})

const CHECK_LABELS = ['ID', ...LABELS, 'Checks']

test('the verification CSV carries the row id, the six answers and the checks', () => {
  // 读者第五感：导出的六列里没有 #31/#30/#29，也没有判定依据，拿回去对不回链上的行号。第二份导出
  // 把编号与检查带上；原六列 CSV 仍然**恰好六列**（U1 的验收口径）。
  //
  // The reader's fifth point: the export carried neither #31/#30/#29 nor the checks, so a line could not
  // be matched back to the chain. The second export carries them; the original six-column CSV still has
  // **exactly six columns** (U1's acceptance reading).
  const answers = answersOf([
    'KeelBase',
    '2026-11-11 12:11:46 UTC+08:00',
    'Customer · #2',
    'a new record: it has no before',
    'KeelBase approved this write',
    'Executed',
  ])
  const text = q.checkCsvText(
    [{ id: 31, answers, checks: 'passed Risk level (R5 is always blocked)' }],
    CHECK_LABELS,
  )
  const lines = text.trimEnd().split('\r\n')
  assert.equal(lines.length, 2, 'a header and one row')
  assert.deepEqual(lines[0].split(','), CHECK_LABELS)
  const cells = lines[1].split(',')
  assert.equal(cells.length, 8, `the verification row has ${cells.length} columns, not 8`)
  assert.equal(cells[0], '#31', 'the verification row does not carry the audit row id')
  assert.equal(cells[7], 'passed Risk level (R5 is always blocked)')
  assert.deepEqual(q.CHECK_COLUMN_KEYS, ['id', ...SIX_QUESTIONS, 'checks'])
  assert.equal(q.CSV_QUESTION_KEYS.length, 6, 'the six-column export stopped being six columns')
})

test('the verification CSV has one row per hit and says — when a row recorded nothing', () => {
  const answers = answersOf(['KeelBase', '2026-11-11 12:11:46 UTC+08:00', 'Customer · #2', '—', '—', 'Approved'])
  const text = q.checkCsvText(
    [
      { id: 31, answers, checks: 'passed Risk level' },
      { id: 30, answers, checks: '' },
    ],
    CHECK_LABELS,
  )
  const lines = text.trimEnd().split('\r\n')
  assert.equal(lines.length, 3, 'three hits must be three data rows plus a header')
  assert.equal(lines[1].split(',')[0], '#31')
  assert.equal(lines[2].split(',')[0], '#30')
  assert.equal(lines[2].split(',')[7], '—', 'a row with no checks must not export as a blank cell')
})

test('a verification cell carrying an internal name refuses the whole file, naming only the column', () => {
  const answers = answersOf(['KeelBase', '2026-11-11 12:11:46 UTC+08:00', 'Customer · #2', '—', '—', 'Executed'])
  assert.throws(
    () => q.checkCsvText([{ id: 31, answers, checks: 'passed role_allowed' }], CHECK_LABELS),
    (error) => {
      assert.equal(error.name, 'CsvLeak')
      assert.equal(error.column, 'checks', 'the error does not name the column that leaked')
      assert.doesNotMatch(error.message, /role_allowed/, 'the refusal echoes the internal name')
      return true
    },
  )
  // camelCase 形态的未知检查名（覆盖矩阵 4-G）在导出这一层同样整份拒绝 —— 闸门要连调用方一起测，
  // 只测 `leaksIn` 证明不了文件不会被写出。
  //
  // An unknown check name in camelCase (coverage matrix 4-G) refuses the whole file at the export layer
  // too — the gate is tested through its caller, since testing `leaksIn` alone cannot show that no file
  // is written.
  assert.throws(
    () => q.checkCsvText([{ id: 31, answers, checks: '通过 crmCustomerScope' }], CHECK_LABELS),
    (error) => {
      assert.equal(error.name, 'CsvLeak')
      assert.equal(error.column, 'checks')
      assert.doesNotMatch(error.message, /crmCustomerScope/, 'the refusal echoes the internal name')
      return true
    },
  )
  // 反向：同一份核对行，检查名换成控制台认识的词，文件照常生成、仍是 8 列。
  // The reverse: the same row with a check name this console knows is written as before, still 8 columns.
  const known = q.checkCsvText(
    [{ id: 31, answers, checks: 'passed Risk level (R5 is always blocked)' }],
    CHECK_LABELS,
  )
  assert.equal(known.trimEnd().split('\r\n').length, 2, 'a known check name must not refuse the file')
})

test('a camelCase check name in the verification CSV refuses the file, naming only the column', () => {
  // The 2026-11-17 real-stack reading: with `crmCustomerScope` in `checks`, none of the four old rules
  // matched and the file body carried the internal name out. With the camelCase form added, the cell is
  // still refused as a whole file and the error still names only the column. This exercises the CSV
  // guard directly; the page path masks an unregistered name before the guard sees it.
  //
  // 2026-11-17 真栈读数：`checks` 里换成 `crmCustomerScope` 时，旧的四条规则一条都不匹配，文件正文就
  // 把这个内部名带了出去。驼峰词形补上后，这一格仍按「整份拒绝、只说列名」处理。这条测的是 CSV 防线
  // 本身；页面路径会先把未登记的名字掩码，再交给这道防线。
  const answers = answersOf(['KeelBase', '2026-11-11 12:11:46 UTC+08:00', 'Customer · #2', '—', '—', 'Executed'])
  assert.throws(
    () => q.checkCsvText([{ id: 31, answers, checks: 'passed crmCustomerScope' }], CHECK_LABELS),
    (error) => {
      assert.equal(error.name, 'CsvLeak')
      assert.equal(error.column, 'checks', 'the error does not name the column that leaked')
      assert.doesNotMatch(error.message, /crmCustomerScope/, 'the refusal echoes the internal name')
      return true
    },
  )
})

test('a camelCase internal name in a six-question cell refuses the six-column export too', () => {
  const answers = answersOf(['张三', '2026-10-28 13:37:06 UTC+08:00', 'Customer · crmCustomerScope', '—', '—', 'Executed'])
  assert.throws(
    () => q.csvText([{ answers }], LABELS),
    (error) => {
      assert.equal(error.name, 'CsvLeak')
      assert.equal(error.column, 'object')
      assert.doesNotMatch(error.message, /crmCustomerScope/)
      return true
    },
  )
})

test('a six-question cell carrying the table name refuses the six-column export', () => {
  // 这次键的写法就是为了这一条：句末的键会进第三格，若它是表名，整份导出必须被拒、且只说哪一格。
  // This is what the key's spelling is for: the end-of-sentence key reaches the third cell, and if it
  // were the table name the whole export must be refused — naming the cell only.
  const answers = answersOf(['KeelBase', '2026-11-20 09:00:00 UTC+08:00', 'MCP connection · ai1_mcp#12', '—', '—', 'Failed'])
  assert.throws(
    () => q.csvText([{ answers }], LABELS),
    (error) => {
      assert.equal(error.name, 'CsvLeak')
      assert.equal(error.column, 'object')
      assert.doesNotMatch(error.message, /ai1_mcp/, 'the refusal echoes the internal name')
      return true
    },
  )
  const readable = answersOf(['KeelBase', '2026-11-20 09:00:00 UTC+08:00', 'MCP connection · #12', '—', '—', 'Failed'])
  assert.equal(q.csvText([{ answers: readable }], LABELS).trimEnd().split('\r\n').length, 2)
})

test('the verification file name says what it is, without an internal name', () => {
  assert.equal(q.checkCsvFilename(new Date(2026, 10, 11, 14, 31, 19)), 'audit-check-20261111-143119.csv')
})

test('the CSV has exactly the six columns, in the auditors’ order, headed by the six business words', () => {
  const answers = answersOf([
    '张三（account #1）',
    '2026-10-28 13:37:06 UTC+08:00',
    'Customer · #9005 · 万****',
    'Before: Customer name 万****; After: values the runtime did not record are not filled in here',
    'No confirmation needed — this tool is set to run on its own',
    'Executed · It really happened; the write is in the system',
  ])
  const text = q.csvText([{ answers }], LABELS)
  const lines = text.trimEnd().split('\r\n')
  assert.equal(lines.length, 2, 'a header and one row')
  assert.deepEqual(lines[0].split(','), LABELS, 'the header is not the six business words')
  const cells = lines[1].split(',')
  assert.equal(cells.length, 6, `exactly six columns, got ${cells.length}`)
  assert.deepEqual(
    SIX_QUESTIONS.map((key, i) => answers[i].key === key),
    [true, true, true, true, true, true],
  )
})

test('a missing answer is written as the honest marker, never a blank', () => {
  const answers = answersOf(['', '2026-10-28 13:37:06 UTC+08:00', 'not recorded — this call wrote no record', '—', '', 'Executed'])
  const lines = q.csvText([{ answers }], LABELS).trimEnd().split('\r\n')
  const cells = lines[1].split(',')
  assert.equal(cells[0], '—', 'a blank "who" must read as the marker')
  assert.equal(cells[4], '—', 'a blank "confirmation" must read as the marker')
  assert.notEqual(cells[2], '', 'an unanswered object must not export as an empty cell')
})

test('a comma, a quote or a newline is escaped, not split into a new column', () => {
  const tricky = 'Company, "the big" one\nsecond line'
  const answers = answersOf(['张三', '2026-10-28 13:37:06 UTC+08:00', tricky, '—', '—', 'Executed'])
  const lines = q.csvText([{ answers }], LABELS).split('\r\n')
  assert.equal(lines[0], LABELS.join(','))
  assert.ok(lines[1].startsWith('张三,'), 'the first field is untouched')
  assert.ok(lines[1].includes('"Company, ""the big"" one\nsecond line"'), 'the field is quoted and its quotes doubled')
  // 转义之后，这仍然是**一条**记录：多出来的换行在引号里。
  // After escaping this is still **one** record: the extra newline sits inside quotes.
  assert.equal(q.csvText([{ answers }], LABELS).match(/\r\n/g).length, 2, 'CRLF only ends the header and the row')
})

test('reverse proof: one leaked internal name refuses the whole export, without echoing it', () => {
  const answers = answersOf([
    '张三',
    '2026-10-28 13:37:06 UTC+08:00',
    'crm_customer · #9005 · 万****',
    '—',
    '—',
    'Executed',
  ])
  assert.throws(
    () => q.csvText([{ answers }], LABELS),
    (error) => {
      assert.equal(error.name, 'CsvLeak')
      assert.equal(error.column, 'object', 'the error names which question leaked')
      assert.doesNotMatch(error.message, /crm_customer/, 'the refusal echoes the internal name onto the screen')
      return true
    },
  )
  const uuid = answersOf(['张三', '2026-10-28 13:37:06 UTC+08:00', 'Customer · #9005', '—', '—', 'exec d69b9b7c-1f0e-4f4a-9e2a-123456789abc'])
  assert.throws(() => q.csvText([{ answers: uuid }], LABELS), /internal name/)
})

test('the file name says what it is, without an internal name', () => {
  const name = q.csvFilename(new Date(2026, 10, 8, 9, 5, 7))
  assert.equal(name, 'audit-six-20261108-090507.csv')
})

test('the page exports the same six answers it renders, through the query module', () => {
  const page = readFileSync(join(ROOT, PAGE), 'utf8')
  assert.match(
    page,
    /import \{[^}]*csvText[^}]*\} from '@\/keelbase\/auditQuery\.mjs'/,
    'the page does not import the CSV writer from the query module',
  )
  assert.match(page, /answerRows = queryRows\.value\.map\(\(row\) => \(\{ answers: sixOf\(row\) \}\)\)/,
    'the export composes its own answers instead of reusing sixOf — the file can drift from the screen')
  assert.match(page, /CSV_QUESTION_KEYS\.map\(\(key\) => t\(`keelbase\.sixQ\.\$\{key\}`\)\)/,
    'the CSV headers are not the six questions’ own business words')
  assert.match(page, /selectRows\(audit\.rows,/, 'the page does not run the object + range selection')
  assert.match(page, /objectRefOf\(row,/, 'the page does not export with the same object resolution as the query')
  assert.doesNotMatch(page, /csvText\([^)]*resultType/, 'a raw result type reached the CSV')
})

test('the verification note is metadata: one line before the header, and it never counts as a row', () => {
  // 表头之前那行 `#` 说明是**元数据、不是数据行**（RFC 4180 没有注释行，故下游按纯数据解析时看到的是一条
  // 只有一个格子的行 —— 它不会被误读成某次操作）。核对 CSV 用它承载「这一行不按租户归属」（丙）。
  //
  // The `#` line before the header is **metadata, not a data row** (RFC 4180 has no comment lines, so a
  // strict data parser sees a one-cell row — it cannot be mistaken for an operation). The verification
  // CSV uses it to carry "this row is not attributed to a tenant" (丙).
  const answers = answersOf(['KeelBase', '2026-11-11 12:11:46 UTC+08:00', 'Customer · #2', '—', '—', 'Executed'])
  const rows = [{ id: 31, answers, checks: 'passed Risk level' }]
  const note =
    'Related, not linked. Tenant is not attributed: no row in this file carries a tenant, and the six questions do not ask for one.'
  const lines = q.checkCsvText(rows, CHECK_LABELS, note).trimEnd().split('\r\n')
  assert.equal(lines.length, 3, 'one note line, one header and one data row')
  assert.ok(lines[0].startsWith('# '), 'the note is not marked as metadata')
  assert.ok(lines[0].includes('Tenant is not attributed'), 'the note lost the tenant statement')
  assert.deepEqual(lines[1].split(','), CHECK_LABELS, 'the header no longer follows the note')
  assert.equal(lines[2].split(',')[0], '#31', 'the data row no longer follows the header')
  // 不给说明时仍是「表头 + 数据行」：说明只在被给的时候出现，从不自己长出来。
  // With no note it is still header + data rows: the line appears only when one is given.
  assert.equal(q.checkCsvText(rows, CHECK_LABELS).trimEnd().split('\r\n').length, 2)
})
