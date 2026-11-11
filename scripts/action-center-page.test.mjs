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
    'maskedNote', 'maskedNoteHostLog',
    'risk_policy', 'tool_enabled', 'role_allowed', 'feature_flag', 'admin_only', 'agent_read_only',
    'detailLine',
  ]
  for (const key of required) {
    assert.ok(enKeys.has(key), `en.ts is missing ${key}`)
    assert.ok(zhKeys.has(key), `zh-CN.ts is missing ${key}`)
  }
})

test('the masking note does not contradict the host leg beside it', () => {
  // 2026-11-11 第六位读者复验（D-10）：目标格写「本控制台不打印记录的内容」，同一个抽屉下方的业务腿
  // 却把全名 `SixthReaderFormal 20261111` 印了出来。业务腿是**宿主自己的日志**（`YD-T18` / `D50`），
  // 谁能读由宿主说；故目标格那句话只能说自己：记录名已掩码，下方宿主日志按宿主的读权限显示。
  //
  // The sixth reader's recheck (D-10, 2026-11-11): the target cell said "this console does not print what
  // a record is about" while the business leg in the same drawer printed the full name. That leg is the
  // host's own log (`YD-T18` / `D50`) and its scope is the host's, so the note may only speak for itself:
  // the record name is masked, and the host log below is shown under the host's read permission.
  assert.doesNotMatch(actionCenter, /keelbase\.effects\.maskedNote'/, 'the action center still uses the leg-blind note')
  assert.match(actionCenter, /keelbase\.effects\.maskedNoteHostLog/, 'the action center no longer names the host leg')
  assert.match(actionCenter, /maskTitle\(row\.targetTitle\)/, 'the record name is no longer masked')
  assert.match(actionCenter, /prop="action"/, 'the business leg no longer draws the host row it is describing')

  assert.doesNotMatch(patch, /does not print what a record is about/, 'the English note still promises the console prints nothing')
  assert.doesNotMatch(patch, /本控制台不打印记录的内容/, 'the Chinese note still promises the console prints nothing')
  assert.match(
    patch,
    /maskedNoteHostLog: '\(record name masked; the host log below is shown under the host\\'s read permission\)'/,
    'the English host-leg note is gone',
  )
  assert.match(
    patch,
    /maskedNoteHostLog: '（记录名已掩码；下方宿主业务日志按宿主的读权限显示）'/,
    'the Chinese host-leg note is gone',
  )
  assert.match(patch, /maskedNote: '\(record name masked\)'/, 'the ledger page lost its neutral note')
  assert.match(patch, /maskedNote: '（记录名已掩码）'/, 'the ledger page lost its neutral Chinese note')
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
