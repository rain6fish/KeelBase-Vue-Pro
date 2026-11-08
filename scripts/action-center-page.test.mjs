// SPDX-License-Identifier: Apache-2.0
//
// F-18：被扣时读者要看得到「原因」与「卡在哪一步」。这四块都由**运行时已经返回、页面此前没画**的字段
// 支撑，所以门禁钉的是「这些字段真的被读、被画」而不是新契约：
//
//   ① 最近裁决：`mine()` 不带 status 取回已裁决的行（页面过去只取 pending，判决一落就消失）；
//   ② 待决行：一句「为什么需要你确认」+「停在第几步」+只读角色为何没有按钮；
//   ③ 裁决响应：`ok/success/message` 决定提示语（失败不再显示「已批准」）；
//   ④ 审计页 `authorization.checks`、轨迹页 `detail`。
//
// 运行：node --test scripts/action-center-page.test.mjs
//
// F-18: when an action is held, the reader must see why and which step it stopped at. All four pieces
// rest on fields the runtime already returns and the pages never drew, so this gate pins that those
// fields are read and rendered — not a new contract: the decided rows are fetched (the page used to
// ask for pending only), the pending row explains itself, the decision response decides what is
// reported, and the audit/trace pages draw the basis and the record line. Run with:
//
//     node --test scripts/action-center-page.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')

const actionCenter = read('keelbase-ui/host-overlay/src/views/keelbase/governance/ActionCenterPage.vue')
const assistantPanel = read('keelbase-ui/host-overlay/src/views/keelbase/assistant/AssistantPanel.vue')
const auditChain = read('keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue')
const trace = read('keelbase-ui/host-overlay/src/views/keelbase/governance/ConversationTracePage.vue')
const api = read('keelbase-ui/host-overlay/src/keelbase/governanceApi.ts')
const runtime = read('keelbase-ui/host-overlay/src/keelbase/runtime.ts')
const patch = read('keelbase-ui/host-patches/0002-governance-ui.patch')

test('the recent-decisions list asks for decided rows and drops the pending ones', () => {
  assert.match(
    actionCenter,
    /Promise\.allSettled\(\[confirmationApi\.mine\('pending'\),\s*confirmationApi\.mine\(\)\]\)/,
    'the two reads no longer settle independently — a history failure would empty the pending card',
  )
  assert.match(
    actionCenter,
    /if \(waiting\.status === 'fulfilled'\)/,
    'the pending half is no longer filled only from its own result',
  )
  assert.match(
    actionCenter,
    /\.filter\(\(r\) => r\.status !== 'pending'\)/,
    'the decided list no longer excludes rows the pending card already shows',
  )
})

test('a pending row says why it needs a person, which step it stopped at, and why a read-only role has no buttons', () => {
  assert.match(actionCenter, /reasonText\(c\)/, 'the pending row no longer explains why it is held')
  assert.match(actionCenter, /stepLine\(c\)/, 'the pending row no longer says which step it stopped at')
  assert.match(actionCenter, /keelbase\.actionCenter\.readOnlyNote/, 'a read-only role gets no explanation')
})

test('the decision response decides what is reported — a failed write is not reported as approved', () => {
  assert.match(actionCenter, /res\?\.ok === false/, 'a decision the server did not take is no longer distinguished')
  assert.match(actionCenter, /res\?\.success === false/, 'a failed execution is no longer distinguished')
  assert.match(actionCenter, /approvedNotRun/, 'the failed-execution message is gone')
})

// U2：R4 的第二次批准。`/ai/my/confirmations` 只答 `mode=immediate`，故待批的 R4 行过去在任何人的
// 行动中心里都看不到；这张卡读全局队列，且**只在管理员登录时**读 —— 普通用户/审计读者吃 403 的那次请求
// 根本不该发出去，也不该把人家的刷新变成一条报错。
//
// U2: the second approval of an R4 write. `/ai/my/confirmations` answers `mode=immediate` only, which is why
// a pending R4 row was invisible in everyone's action centre. This card reads the global queue, and reads it
// **only when an administrator is signed in** — the request an ordinary user or audit reader would get a 403
// for is never made, and their refresh is never turned into an error toast.
test('the second-approver card reads the global queue behind the administrator predicate and filters to pending approvals', () => {
  assert.match(actionCenter, /confirmationApi\.listAll\(/, 'the card no longer reads the global confirmation queue')
  assert.match(actionCenter, /if \(!isAdmin\.value \|\| approvalLoading\.value\) return/, 'the queue read is no longer behind the administrator predicate')
  assert.match(
    actionCenter,
    /c\.mode === 'approval' && c\.status === 'pending'/,
    'the queue is no longer filtered to pending approval rows',
  )
  assert.match(actionCenter, /status === 403/, 'a refused queue read is no longer put away without a toast')
})

test('the second-approver card pairs the initiator or says it cannot, and masks the name', () => {
  assert.match(actionCenter, /initiatorOf\(c, rows\)/, 'the queue row is no longer paired with its pending audit row')
  assert.match(actionCenter, /resolveCallerNames\(Object\.values\(joined\)/, 'the initiator name is never resolved through the host directory')
  assert.match(actionCenter, /maskTitle\(name\)/, 'the initiator name is no longer masked')
  assert.match(actionCenter, /initiatorUnknown/, 'the honest fallback is gone — a guess may be drawn instead')
})

test('the second-approver decision goes to approveBy and branches on the execution outcome', () => {
  assert.match(actionCenter, /confirmationApi\.approveBy\(/, 'the second approval no longer calls approve-by')
  assert.match(actionCenter, /status === 'executed'/, 'an executed approval is no longer recognised')
  assert.match(actionCenter, /status === 'declined'/, 'a decline is no longer recognised')
  assert.match(actionCenter, /status === 'error' \|\| status === 'blocked'/, 'a refusal is no longer distinguished from success')
  assert.match(actionCenter, /approvalUnknown/, 'an unknown outcome is no longer reported as itself')
  assert.match(api, /approveBy: \(token: string, decision: 'approve' \| 'decline'\)/, 'the API no longer offers approve-by')
  assert.match(api, /\/ai\/confirmations\/\$\{encodeURIComponent\(token\)\}\/approve-by/, 'the approve-by path is gone')
  assert.ok(api.includes('export interface ExecutionOutcome'), 'the runtime record is no longer declared as ExecutionOutcome')
})

test('both locale dictionaries carry every U2 key', () => {
  const [en, zh] = patch.split('diff --git a/src/locales/zh-CN.ts')
  assert.ok(zh, 'the Chinese locale hunk is gone')
  const keys = (segment) =>
    new Set([...segment.matchAll(/^\+\s+([A-Za-z_$][\w$]*):/gm)].map((m) => m[1]))
  const enKeys = keys(en)
  const zhKeys = keys(zh)
  const required = [
    'approvalTitle', 'approvalCount', 'approvalHint',
    'initiatorLabel', 'initiatorNamed', 'initiatorIdOnly', 'initiatorUnknown',
    'approvalOwnRow', 'approvalExecuted', 'approvalDeclined', 'approvalRefused',
    'approvalUnknown', 'approvalFailed', 'approvalScanBound',
  ]
  for (const key of required) {
    assert.ok(enKeys.has(key), `en.ts is missing ${key}`)
    assert.ok(zhKeys.has(key), `zh-CN.ts is missing ${key}`)
  }
})

test('the audit page draws the checks the runtime already records on the row', () => {
  assert.match(auditChain, /checksOf\(row\)/, 'the expansion no longer reads authorization.checks')
  assert.match(auditChain, /checkText\(c\.name\)/, 'check names are no longer rendered from their own key')
  assert.match(
    auditChain,
    /typeof raw !== 'string'/,
    'the basis stored as a JSON string is no longer parsed — this host sends exactly that shape',
  )
  assert.ok(
    api.includes('authorization?: AuthorizationBasis | string | null'),
    'the audit row type no longer declares the authorization basis',
  )
})

test('the trace page draws the runtime record line for a failed step', () => {
  assert.match(trace, /s\.detail && s\.success === false/, 'the trace step no longer draws its record line')
  assert.match(trace, /keelbase\.trace\.detailLine/, 'the record line is no longer labelled')
  assert.ok(api.includes('detail?: string | null'), 'the trace step type no longer declares detail')
})

test('both locale dictionaries carry every F-18 key', () => {
  const [en, zh] = patch.split('diff --git a/src/locales/zh-CN.ts')
  assert.ok(zh, 'the Chinese locale hunk is gone')
  const keys = (segment) =>
    new Set([...segment.matchAll(/^\+\s+([A-Za-z_$][\w$]*):/gm)].map((m) => m[1]))
  const enKeys = keys(en)
  const zhKeys = keys(zh)
  const required = [
    'reasonImmediate', 'reasonApproval', 'reasonRun',
    'stepConfirm', 'stepExecute', 'stepLedger', 'stepHere', 'stepWaitingYou', 'stepWaitingOther',
    'stepRunning', 'stepFailed',
    'historyTitle', 'historyCount', 'historyEmpty', 'historyHint',
    'stepReached', 'reasonLabel', 'decidedLabel',
    'outcomeApproved', 'outcomeDeclined', 'outcomeTimeout', 'outcomeExecuted', 'outcomeFailed',
    'approvedNotRun', 'approvedNotRunUnknown', 'unknownReason', 'executedOk', 'approvedNoResult',
    'readOnlyNote', 'notHereNote',
    'colChecks', 'checkPassed', 'checkFailed', 'checksNote',
    'risk_policy', 'tool_enabled', 'role_allowed', 'feature_flag', 'admin_only', 'agent_read_only',
    'detailLine',
  ]
  for (const key of required) {
    assert.ok(enKeys.has(key), `en.ts is missing ${key}`)
    assert.ok(zhKeys.has(key), `zh-CN.ts is missing ${key}`)
  }
})

test('a failed runtime envelope is an error, not data', () => {
  // Measured on the real stack: the host answers a failed decision as HTTP 200 with
  // `{code:500,data:null,msg:'系统异常'}`. Unwrapping that without checking the code handed the page
  // `null`, and it announced "approved" for a write the server had refused.
  //
  // 真栈实测：宿主把一次失败的裁决答成 HTTP 200 + `{code:500,data:null,msg:'系统异常'}`。不看码就拆信封
  // 会把 `null` 交给页面，于是它对一次服务端已拒绝的写宣布了「已批准」。
  assert.match(runtime, /ENVELOPE_OK_CODES/, 'the accepted success codes are no longer declared')
  assert.match(
    runtime,
    /if \(!ENVELOPE_OK_CODES\.has\(p\.code\)\)/,
    'a non-success envelope code is no longer rejected',
  )
  assert.match(actionCenter, /keelbase\.actionCenter\.approvedNoResult/, 'an empty answer is no longer reported honestly')
  assert.match(
    assistantPanel,
    /ElMessage\.warning\('已批准，但没有拿到执行结果。'\)/,
    'the assistant panel no longer stops short of claiming success',
  )
})

test('the page no longer reports "approved" before the server answered', () => {
  // The old code awaited the decision and then unconditionally announced success; a failure left the
  // reader with "approved" and no row. Pin the absence of that shape.
  //
  // 旧写法是：等裁决返回，然后无条件宣布成功 —— 失败时读者只看到「已批准」，而台账里什么都没有。
  assert.doesNotMatch(
    actionCenter,
    /await confirmationApi\.decide\([^)]*\)\s*\n\s*ElMessage\.success\(t\(decision === 'approve'/,
    'the unconditional "approved" announcement is back',
  )
})

test('目标那一格问宿主要名字，答不上时说「未登记名称」', () => {
  // 运行时的 `targetTitle` 只认它自己样例域的跟进记录（`EffectController.target()` 只匹配
  // `result_type='follow_up'`），故客户、合同这些行的「目标」格过去只剩「— #1」。这一格现在按行问宿主那条
  // 窄读面（`record-names`）；宿主答不上时**明说**「未登记名称」，而不是把「没问」画成一个破折号。
  //
  // The runtime's `targetTitle` recognises only its own sample domain's follow-ups
  // (`EffectController.target()` matches `result_type='follow_up'` and nothing else), so a customer or
  // contract row's target cell used to carry `— #1`. The cell now asks the host's narrow read face
  // (`record-names`) per row, and when the host cannot answer it **says** "name not registered" instead of
  // drawing a dash over "never asked".
  assert.match(actionCenter, /import \{ resolveRecordNames \}/, 'the page no longer asks the host for record names')
  assert.match(actionCenter, /resolveRecordNames\(res\.items\.map/, 'the ledger is drawn without asking the host')
  assert.match(actionCenter, /\{\{ targetText\(row\) \}\}/, 'the target cell no longer goes through targetText')
  assert.doesNotMatch(actionCenter, /\{\{ maskTitle\(row\.targetTitle\) \}\}/, 'the dash-only target cell is back')
  assert.match(patch, /targetUnnamed: '未登记名称'/, 'the Chinese fallback word is gone')
  assert.match(patch, /targetUnnamed: 'name not registered'/, 'the English fallback word is gone')
})
