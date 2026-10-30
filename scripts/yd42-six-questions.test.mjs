// SPDX-License-Identifier: Apache-2.0
//
// `YD-42` 的判据，钉在**真实操作**上：一次自动放行的写 · 一次需确认的写 · 一次被拒的写，各按六问答一遍，
// 共 18 格；通过 = ≥15 格，且每一次至少 5 格。另有一条**反向可证**：一份会把内部工具名 / 表名 / 执行线程 id
// 透给读者的答案，那一次记 **0 格** —— 这一条不是补充说明，它是「不是有个页面就算」那颗钉子。
//
//     node --test scripts/yd42-six-questions.test.mjs
//     KEELBASE_REPO_ROOT=D:/Rain6fish/KeelBase-YuDao node --test scripts/yd42-six-questions.test.mjs   # 改前的树：红
//
// 三条操作是 2026-10-28 在真栈上跑出来的（宿主 48086，`admin` 一次改客户走自动放行、一次走本人确认、
// 一次由本人拒绝），下面**行与台账的取值都是那次运行的原样**（`ai_audit_logs` 3454 / 3459 / 3464，
// `side_effects` 438 / 439）。**没有从代码里读过任何东西**：这正是判据要的「不得查代码或表结构」。
//
// The `YD-42` criterion, pinned to **real operations**: one auto-allowed write, one that needs
// confirmation, one that was refused — each answered along the six questions, 18 cells in all; a pass is
// ≥15 cells with at least 5 in every operation. Plus one **reverse proof**: an answer set that hands an
// internal tool name, a table name or an execution id to the reader scores **zero** for that operation —
// that is the nail in "having the page is not the point".
//
//     node --test scripts/yd42-six-questions.test.mjs
//     KEELBASE_REPO_ROOT=D:/Rain6fish/KeelBase-YuDao node --test scripts/yd42-six-questions.test.mjs   # the tree before the change: red
//
// The three operations were run against a real stack on 2026-10-28 (host 48086: one customer update
// auto-allowed, one confirmed by the caller, one the caller declined). The rows and ledger values below
// are **exactly what that run wrote** (`ai_audit_logs` 3454 / 3459 / 3464, `side_effects` 438 / 439).
// **Nothing here was read out of the code**: that is precisely the criterion's "no peeking at code or at
// the table structure".
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = process.env.KEELBASE_REPO_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')
const MODULE = join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs')
const PAGE = 'keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue'

const six = await import(pathToFileURL(MODULE).href)

/**
 * 英文词条，与 `0002-governance-ui.patch` 里那一份逐字相同。测试**不**去解析那份 patch：两处各写一遍，
 * 谁改了另一处，这里的读数就会变，而不会悄悄跟着走。
 *
 * The English messages, verbatim from `0002-governance-ui.patch`. The test does not parse that patch: both
 * sides carry their own copy, so editing one shows up as a changed reading instead of following silently.
 */
const MESSAGES = {
  'keelbase.sixQ.title': 'The six questions',
  'keelbase.sixQ.who': 'Who',
  'keelbase.sixQ.when': 'When (with the zone)',
  'keelbase.sixQ.object': 'Which business object',
  'keelbase.sixQ.change': 'What it became (before → after)',
  'keelbase.sixQ.confirmation': 'Who confirmed',
  'keelbase.sixQ.result': 'What came of it',
  'keelbase.sixQ.account': 'account',
  'keelbase.sixQ.someone': 'Someone',
  'keelbase.sixQ.confirmNotNeeded': 'No confirmation needed — this tool is set to run on its own',
  'keelbase.sixQ.confirmSelf': 'confirmed it themselves, inside the conversation',
  'keelbase.sixQ.confirmWaiting': 'has not answered yet — the write is still waiting',
  'keelbase.sixQ.confirmDeclined': 'refused it, inside the conversation',
  'keelbase.sixQ.confirmApprovalUnrecorded': 'a second person approved it — this row does not record who',
  'keelbase.sixQ.confirmBlocked': 'no one can — this tool is held at a blocking risk level',
  'keelbase.sixQ.objectUnrecorded': 'not recorded — this call wrote no record',
  'keelbase.sixQ.objectUnnamed': 'a business object this console has no name for',
  'keelbase.sixQ.changeNone': 'nothing was changed — no write happened',
  'keelbase.sixQ.changeCreated': 'a new record: it has no before, and the write itself recorded no field values',
  'keelbase.sixQ.changeBefore': 'Before',
  'keelbase.sixQ.changeAfter': 'After',
  'keelbase.sixQ.changeAfterUnrecorded': 'values the runtime did not record are not filled in here',
  'keelbase.sixQ.hostNow': "the host's record as it stands now, not the snapshot taken at the write",
  'keelbase.sixQ.fieldName': 'Customer name',
  'keelbase.sixQ.fieldLevel': 'Level',
  'keelbase.sixQ.fieldSource': 'Source',
  'keelbase.sixQ.fieldDealStatus': 'Deal closed',
  'keelbase.sixQ.fieldFollowUpStatus': 'Followed up',
  'keelbase.record.crm_customer': 'Customer',
}

const t = (key) => MESSAGES[key] ?? key
const te = (key) => Object.hasOwn(MESSAGES, key)
const mask = (text) => `${[...String(text)].slice(0, 1).join('')}****`

/**
 * 三条操作，按它们**实际写下的样子**。第四条 `for` 指的是这一行在台账里配到的那条副作用（运行时的配对
 * 规则：同一工具、五秒之内、且恰好一个候选）。
 *
 * The three operations, exactly as they were written. `effect` is the ledger row each one matches (the
 * runtime's own rule: same tool, within five seconds, and exactly one candidate).
 */
const OPERATIONS = [
  {
    name: 'A · auto-allowed write',
    row: {
      id: 3454,
      userId: '1',
      action: 'tool_call',
      detail: 'update_crm_customer -> ok',
      isError: false,
      createdAt: '2026-10-28T05:37:06.564268Z',
      outcome: 'executed',
      tool: 'update_crm_customer',
      executionId: 'fda3e3d0-2954-4c48-be60-f1e1ece29c61',
      authorization:
        '{"tool":"update_crm_customer","riskLevel":"R3","riskStrategy":"confirmation","requiresConfirmation":false,"checks":[{"name":"risk_policy","ok":true},{"name":"tool_enabled","ok":true},{"name":"role_allowed","ok":true},{"name":"admin_only","ok":true}],"policy":{"revision":"c1afaee3fde0"}}',
    },
    effect: {
      resultType: 'crm_customer',
      resultId: 9005,
      targetTitle: null,
      beforeSnapshot:
        '{"id":9005,"name":"万象商业服务有限公司","ownerUserId":1,"dealStatus":false,"followUpStatus":false,"level":3,"source":8}',
      afterSnapshot: '{"id":9005}',
    },
    hostNowName: '修改客户',
    recordState: 'still there',
    resultWord: 'Executed',
    resultMeaning: 'It really happened; the write is in the system',
  },
  {
    name: 'B · write that needed confirmation',
    row: {
      id: 3459,
      userId: '1',
      action: 'tool_call',
      detail: 'update_crm_customer -> ok',
      isError: false,
      createdAt: '2026-10-28T05:37:14.633602Z',
      outcome: 'executed',
      tool: 'update_crm_customer',
      executionId: 'f8f1bda5-246c-45b0-9fbe-88dc4131be92',
      authorization:
        '{"tool":"update_crm_customer","riskLevel":"R3","riskStrategy":"confirmation","requiresConfirmation":true,"checks":[{"name":"risk_policy","ok":true},{"name":"tool_enabled","ok":true},{"name":"role_allowed","ok":true},{"name":"admin_only","ok":true}],"policy":{"revision":"8499adb0271c"}}',
    },
    effect: {
      resultType: 'crm_customer',
      resultId: 9006,
      targetTitle: null,
      beforeSnapshot:
        '{"id":9006,"name":"江城市政信息服务有限公司","ownerUserId":1,"dealStatus":false,"followUpStatus":false,"level":2,"source":4}',
      afterSnapshot: '{"id":9006}',
    },
    hostNowName: '修改客户',
    recordState: 'still there',
    resultWord: 'Executed',
    resultMeaning: 'It really happened; the write is in the system',
  },
  {
    name: 'C · write that was refused',
    row: {
      id: 3464,
      userId: '1',
      action: 'tool_confirmation',
      detail: 'update_crm_customer declined (in_band)',
      isError: true,
      createdAt: '2026-10-28T05:37:56.165526Z',
      outcome: 'declined',
      tool: 'update_crm_customer',
      executionId: null,
      authorization: null,
    },
    effect: null,
    hostNowName: '',
    recordState: '',
    resultWord: 'Declined',
    resultMeaning: 'A person declined it, so it will not happen',
  },
]

const answersFor = (op) =>
  six.composeSix({
    row: op.row,
    callerName: 'KeelBase',
    effect: op.effect,
    proposal: op.proposal,
    hostNowName: op.hostNowName,
    recordState: op.recordState,
    mask,
    resultWord: op.resultWord,
    resultMeaning: op.resultMeaning,
    t,
    te,
  })

test('every operation answers at least five of the six questions', () => {
  for (const op of OPERATIONS) {
    const scored = six.scoreSix(answersFor(op))
    assert.equal(scored.leaked.length, 0, `${op.name}: leaked ${scored.leaked.join(', ')}`)
    assert.ok(scored.cells >= 5, `${op.name}: only ${scored.cells} of 6 answered`)
  }
})

test('the eighteen cells come to at least fifteen', () => {
  const cells = OPERATIONS.map((op) => six.scoreSix(answersFor(op)).cells)
  const total = cells.reduce((a, b) => a + b, 0)
  assert.ok(total >= 15, `total ${total} of 18 (${cells.join(' + ')})`)
})

test('the auto-allowed write says 「无需确认」 out loud', () => {
  const answers = answersFor(OPERATIONS[0])
  const confirmation = answers.find((a) => a.key === 'confirmation')
  assert.equal(confirmation.answered, true, 'the auto-allowed row leaves the fifth question blank')
  assert.match(confirmation.text, /No confirmation needed/, 'the auto-allowed row does not say so')
})

test('the gate is read off the authorization the row recorded', () => {
  // 词汇来自协议自己的 `RiskLevel`：`riskStrategy` 是风险级的策略，`requiresConfirmation` 是这一次的裁决位。
  // 没有 `authorization` 的行回空串 —— 那一格说「这一行没写」，而不是拿今天去补。
  //
  // The vocabulary is the protocol's own `RiskLevel`: `riskStrategy` is the level's strategy and
  // `requiresConfirmation` is the decision taken. A row with no `authorization` answers empty — the cell
  // says the row does not say, rather than filling it in from today.
  const g = (auth) => six.gateFromRow({ authorization: auth })
  assert.equal(g('{"riskStrategy":"confirmation","requiresConfirmation":false}'), 'auto')
  assert.equal(g('{"riskStrategy":"confirmation","requiresConfirmation":true}'), 'confirm')
  assert.equal(g('{"riskStrategy":"human_approval","requiresConfirmation":true}'), 'approval')
  assert.equal(g('{"riskStrategy":"block","requiresConfirmation":false}'), 'blocked')
  assert.equal(g(null), '', 'a row that recorded no authorization must not answer a gate')
  assert.equal(six.gateFromRow({}), '')
})

test('a gate handed in from outside cannot answer the fifth question', () => {
  // 工具清单今天说 `confirm`（策略已还原），而这一行记下的裁决是**自动放行**。把「今天的闸」当作参数塞进来，
  // 第五问仍须答「无需确认」—— 否则同一条审计行会随策略改口，而那正是这条修复要断掉的。
  //
  // The inventory says `confirm` today (the policy was restored), while this row recorded an **auto**
  // decision. Hand "today's gate" in as a parameter and the fifth question must still answer "no
  // confirmation needed" — otherwise one audit row answers differently after a policy change, which is
  // exactly what this fix cuts.
  const answers = six.composeSix({
    row: OPERATIONS[0].row,
    callerName: 'KeelBase',
    gate: 'confirm',
    effect: OPERATIONS[0].effect,
    hostNowName: OPERATIONS[0].hostNowName,
    recordState: OPERATIONS[0].recordState,
    mask,
    resultWord: 'Executed',
    resultMeaning: 'It really happened; the write is in the system',
    t,
    te,
  })
  const confirmation = answers.find((a) => a.key === 'confirmation')
  assert.match(confirmation.text, /No confirmation needed/, `got "${confirmation.text}"`)
})

test('the confirmed write names who confirmed, and the refused one says a person said no', () => {
  const confirmed = answersFor(OPERATIONS[1]).find((a) => a.key === 'confirmation')
  assert.match(confirmed.text, /KeelBase confirmed it themselves/)
  const refused = answersFor(OPERATIONS[2]).find((a) => a.key === 'confirmation')
  assert.match(refused.text, /KeelBase refused it/)
})

test('the time carries a zone', () => {
  const when = answersFor(OPERATIONS[0]).find((a) => a.key === 'when')
  assert.match(when.text, /^2026-10-28 \d{2}:\d{2}:\d{2} UTC[+-]\d{2}:\d{2}$/, `got "${when.text}"`)
})

test('the business object is a business name and a key, never the type name', () => {
  const object = answersFor(OPERATIONS[0]).find((a) => a.key === 'object')
  assert.match(object.text, /^Customer · #9005/, `got "${object.text}"`)
  assert.doesNotMatch(object.text, /crm_customer/)
})

test('the change shows the before it recorded and says what the after lacks', () => {
  const change = answersFor(OPERATIONS[0]).find((a) => a.key === 'change')
  assert.match(change.text, /Before: Customer name 万\*\*\*\* · Level 3 · Source 8/)
  assert.match(change.text, /Customer name 万\*\*\*\* → 修\*\*\*\*/, 'the changed field is not named')
  assert.match(change.text, /not filled in here/, 'the runtime-missing after is not disclosed')
})

test('a refused write says nothing in the system changed', () => {
  const change = answersFor(OPERATIONS[2]).find((a) => a.key === 'change')
  assert.match(change.text, /nothing was changed/)
})

// ---------------------------------------------------------------------------------------------------
// C 的第三问：被拒的那次调用**记了**，只是没人读 —— 确认记录里带着这次提议的参数。
// C's third question: the refused call **was** recorded, just never read — its confirmation record
// carries the arguments of the proposal.
// ---------------------------------------------------------------------------------------------------

/**
 * 同一次拒绝，按 2026-10-29 那次重测在库里**实际**写下的两行：审计行 #8（`declined`、无台账行、无名录依据）
 * 与它配上的确认记录 #2（`args_json` = `{"id":9004,"name":"改客户 明远置业集团有限公司"}`、`decided_at` 与那
 * 一行同一秒）。第三问要的两样都在：记录类型来自工具自己的声明（`update_crm_customer` → `crm_customer`），
 * 主键来自提议参数里的 `id`。
 *
 * The same refusal, exactly as that retest of 2026-10-29 wrote the two rows: audit row #8 (`declined`, no
 * ledger row, no authorization basis) and the confirmation record #2 it pairs with (`args_json` =
 * `{"id":9004,"name":"改客户 明远置业集团有限公司"}`, its `decided_at` in the same second). Both parts the
 * third question wants are there: the record type from the tool's own declaration
 * (`update_crm_customer` → `crm_customer`), the key from the `id` among the proposed arguments.
 */
const REFUSED_WITH_PROPOSAL = {
  row: {
    id: 8,
    userId: '1',
    action: 'tool_confirmation',
    detail: 'update_crm_customer declined (in_band)',
    isError: true,
    createdAt: '2026-10-29T00:56:19Z',
    outcome: 'declined',
    tool: 'update_crm_customer',
    executionId: null,
  },
  proposal: { resultType: 'crm_customer', resultId: 9004 },
}

const refusedAnswers = (proposal, proposalName = '') =>
  six.composeSix({
    row: REFUSED_WITH_PROPOSAL.row,
    callerName: 'KeelBase',
    gate: 'confirm',
    effect: null,
    proposal,
    hostNowName: '',
    proposalName,
    recordState: '',
    mask,
    resultWord: 'Declined',
    resultMeaning: 'A person declined it, so it will not happen',
    t,
    te,
  })

test('the refused call names the record its proposal was about', () => {
  const object = refusedAnswers(REFUSED_WITH_PROPOSAL.proposal).find((a) => a.key === 'object')
  assert.equal(object.text, 'Customer · #9004', `got "${object.text}"`)
  assert.equal(object.answered, true, 'the refused call still answers the third question with 「未记录」')
  assert.doesNotMatch(object.text, /crm_customer/)
})

test('the refused call carries the record name the host answered, masked', () => {
  // 被拒那次没有台账行，记录名只能来自确认记录那条提议；宿主回的是**已掩码**的名字（`YudaoRecordNames`），
  // 这里再掩一次是幂等的。名字是补充，不是答案的前提——没有它时上一块用例的 `Customer · #9004` 仍成立。
  //
  // The refused call has no ledger row, so the name can only come from its proposal; the host answers it
  // **already masked**, and masking again is idempotent. The name is an addition, not a precondition — the
  // case above still holds `Customer · #9004` without it.
  const object = refusedAnswers(REFUSED_WITH_PROPOSAL.proposal, '改****').find((a) => a.key === 'object')
  assert.equal(object.text, 'Customer · #9004 · 改****', `got "${object.text}"`)
  assert.deepEqual(six.leaksIn(object.text), [], 'a masked record name must not read as a leak')
})

test('with the proposal the refused operation answers all six questions', () => {
  const scored = six.scoreSix(refusedAnswers(REFUSED_WITH_PROPOSAL.proposal))
  assert.deepEqual(scored.leaked, [])
  assert.equal(scored.cells, 6, `only ${scored.cells} of 6 answered`)
})

test('without a paired proposal the same row still says it was not recorded', () => {
  const object = refusedAnswers(null).find((a) => a.key === 'object')
  assert.equal(object.text, MESSAGES['keelbase.sixQ.objectUnrecorded'])
  assert.equal(object.answered, false)
})

// ---------------------------------------------------------------------------------------------------
// 反向可证：把改前那一面的答案交回来，必须记 0 格。
// The reverse proof: hand back the answers the face gave before the change, and it has to score zero.
// ---------------------------------------------------------------------------------------------------

/**
 * 改前那一面答出来的东西 —— 逐项照着它当时**画**的东西写：`recordText` 第一条就是运行时的类型名
 * （`crm_customer`，一张表），时间是本地时间但**不带时区**，第四问与第五问根本不画。
 *
 * What the face answered before the change, item by item as it **drew** them: `recordText`'s first part
 * is the runtime's type name (`crm_customer`, a table), the time is local but carries **no zone**, and
 * the fourth and fifth questions were not drawn at all.
 */
function preChangeAnswers(op) {
  const e = op.effect
  return [
    { key: 'who', text: 'KeelBase（account #1）', answered: true },
    { key: 'when', text: '2026-10-28 13:37:06', answered: true },
    {
      key: 'object',
      text: e ? `${e.resultType} · #${e.resultId} · 万**** · still there` : '—',
      answered: Boolean(e),
    },
    { key: 'change', text: '', answered: false },
    { key: 'confirmation', text: '', answered: false },
    { key: 'result', text: op.resultWord, answered: true },
  ]
}

test('the pre-change face scores zero for the operation it leaks on', () => {
  const scored = six.scoreSix(preChangeAnswers(OPERATIONS[0]))
  assert.equal(scored.cells, 0, 'a version that prints the table name still scored cells')
  assert.deepEqual(scored.leaked, ['crm_customer'], `leak reported as ${JSON.stringify(scored.leaked)}`)
  assert.equal(scored.answer, 'object')
})

test('the leak detector is not vacuous, and prose is not a leak', () => {
  assert.deepEqual(six.leaksIn('crm_customer · #9005'), ['crm_customer'])
  assert.deepEqual(six.leaksIn('update_crm_customer'), ['update_crm_customer'])
  assert.deepEqual(six.leaksIn('fda3e3d0-2954-4c48-be60-f1e1ece29c61'), ['fda3e3d0-2954-4c48-be60-f1e1ece29c61'])
  assert.deepEqual(six.leaksIn('{"ownerUserId":1}'), ['ownerUserId'])
  assert.deepEqual(six.leaksIn('declined'), ['declined'])
  // ordinary sentences are not leaks
  assert.deepEqual(six.leaksIn('A person declined it, so it will not happen'), [])
  assert.deepEqual(six.leaksIn('Customer · #9005 · 万**** · still there'), [])
})

// ---------------------------------------------------------------------------------------------------
// 读者那一面：页面上不再画工具注册名，也不再画运行时原文的 `detail`。
// The reader's face: the page no longer draws the registered tool name, nor the runtime's raw `detail`.
// ---------------------------------------------------------------------------------------------------

const page = readFileSync(join(ROOT, PAGE), 'utf8')
const template = page.slice(0, page.indexOf('<script'))

test('the expanded row is the six questions', () => {
  const start = template.indexOf('<el-table-column type="expand">')
  const block = start < 0 ? '' : template.slice(start, template.indexOf('</el-table-column>', start))
  assert.ok(block, 'no expand column')
  assert.match(block, /sixOf\(row\)/, 'the expansion does not draw the six answers')
  assert.match(block, /keelbase\.sixQ\.title/)
})

test('the reader-facing template draws no internal tool name and no raw detail', () => {
  assert.doesNotMatch(template, /row\.tool\b/, 'the template still prints the registered tool name')
  assert.doesNotMatch(template, /row\.detail\b/, "the template still prints the runtime's raw detail")
})

test('the caller name comes from the audit read face, not from the user administration', () => {
  // 「谁」这一问要能答出人名或账号。名录走宿主的窄读面 `/keelbase/caller-names`（已登录即可问、由
  // `YudaoCallerDirectory` 裁到「这个调用方本来就能在台账里遇到的人」）；**不**走 `/system/user/list` ——
  // 那条要 `system:user:query`，且 `system_users` 受芋道按表名的部门数据权限收窄，一个只挂 `audit_reader`
  // 的账号在那里只拿得到它自己。
  //
  // The "who" question has to name a person or an account. The directory is read through the host's narrow
  // face `/keelbase/caller-names` (any signed-in caller may ask; `YudaoCallerDirectory` bounds the answer to
  // people this caller could already meet in a ledger); it is **not** read through `/system/user/list`,
  // which needs `system:user:query` and is narrowed by Yudao's table-keyed department data permission, so an
  // account holding only `audit_reader` gets itself.
  // 行尾先归一：`autocrlf` 的检出是 CRLF，而下面的 `//.*$` 遇 `\r` 不匹配，注释会留下 —— 断言本身不变。
  // Normalise line endings first: an `autocrlf` checkout is CRLF, and `//.*$` below does not match before a
  // `\r`, which would leave the comments in — the assertion itself is unchanged.
  const source = readFileSync(join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/callerNames.ts'), 'utf8')
    .replace(/\r\n/g, '\n')
  // 断言只看**代码**：这个文件的注释里会提到旧路径（讲清为什么换掉），那不是它在调它。
  // Assertions read the **code** only: the file's comments mention the old path (to say why it moved),
  // and that is not the file calling it.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
  assert.match(code, /'\/keelbase\/caller-names'/, 'the caller name no longer comes from the caller-name read face')
  assert.doesNotMatch(code, /getUserList/, 'the caller name is read from the user administration again')
  assert.doesNotMatch(code, /\/system\/user\//, 'the caller name is read from a /system/user endpoint again')
})
