// SPDX-License-Identifier: Apache-2.0
//
// U2 的读侧判据：一条待批的 R4 确认，能不能说出**是谁发起**的。说得出时给发起人 id；说不出时
// —— 没有候选、候选不止一个、或者那一行根本不是待决的工具调用 —— **说出说不出**，不补一个人上去。
//
//     node --test scripts/pending-initiator-join.test.mjs
//
// 配对规则与 `approverOf`（审计行 → 批准人）和 `matchApprover`（轨迹步 → 批准人）同一条：同工具、
// 五秒之内、恰好一个候选。下面那对行是运行时写待批确认时同时留下的两行，形状取自 `run-audit-two-cases-
// scenarios.mjs` 里对真栈的断言（`action=tool_call, outcome=pending`），`tool` 与 `user_id` 按那一对填。
//
// English:
//
// The read-side criterion for U2: given one pending R4 confirmation, can the page say **who raised** it?
// When it can, it names the initiator id; when it cannot — no candidate, more than one, or a row that is not
// a held tool call at all — it **says it cannot** rather than filling a person in.
//
//     node --test scripts/pending-initiator-join.test.mjs
//
// The pairing rule is the one `approverOf` (audit row → approver) and `matchApprover` (trace step →
// approver) already use: same tool, within five seconds, exactly one candidate. The pair below is the two
// rows the runtime leaves when it holds a confirmation; the shape comes from the real-stack assertion in
// `run-audit-two-cases-scenarios.mjs` (`action=tool_call, outcome=pending`), with `tool` and `user_id` filled
// as that pair carries them.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODULE = join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/pendingJoin.mjs')
const PAGE = join(ROOT, 'keelbase-ui/host-overlay/src/views/keelbase/governance/ActionCenterPage.vue')

const join2 = await import(pathToFileURL(MODULE).href)

const CONFIRMATION = {
  token: 'tok-1',
  toolName: 'update_crm_customer',
  mode: 'approval',
  status: 'pending',
  createdAt: '2026-11-08T05:49:42.913463Z',
}

const PENDING_ROW = {
  id: 11,
  action: 'tool_call',
  outcome: 'pending',
  tool: 'update_crm_customer',
  userId: '9004',
  detail: 'update_crm_customer awaiting a second person',
  createdAt: '2026-11-08T05:49:42.913463Z',
}

test('U2: the one pending audit row of the same tool names the initiator', () => {
  assert.equal(join2.initiatorOf(CONFIRMATION, [PENDING_ROW]), '9004')
})

test('U2: no candidate is not a person', () => {
  assert.equal(join2.initiatorOf(CONFIRMATION, []), null)
})

test('U2: two candidates are not resolved — no guessing', () => {
  const twin = { ...PENDING_ROW, id: 12, userId: '9005' }
  assert.equal(join2.initiatorOf(CONFIRMATION, [PENDING_ROW, twin]), null)
})

test('U2: a row that is not a held tool call is not the initiator row', () => {
  // 被拒、被批准的重试都不是「待决」；拿它们顶替，会把别人的裁决当成发起。
  // A refused or approved retry is not "held"; taking one would read somebody's decision as the proposal.
  assert.equal(join2.initiatorOf(CONFIRMATION, [{ ...PENDING_ROW, outcome: 'refused' }]), null)
  assert.equal(join2.initiatorOf(CONFIRMATION, [{ ...PENDING_ROW, outcome: 'approved' }]), null)
  assert.equal(join2.initiatorOf(CONFIRMATION, [{ ...PENDING_ROW, action: 'tool_confirmation' }]), null)
})

test('U2: a row outside the five-second window is not the same proposal', () => {
  const late = { ...PENDING_ROW, createdAt: '2026-11-08T05:49:49.913463Z' }
  assert.equal(join2.initiatorOf(CONFIRMATION, [late]), null)
})

test('U2: a different tool or a blank caller does not answer', () => {
  assert.equal(join2.initiatorOf(CONFIRMATION, [{ ...PENDING_ROW, tool: 'create_crm_customer' }]), null)
  assert.equal(join2.initiatorOf(CONFIRMATION, [{ ...PENDING_ROW, userId: '' }]), null)
  assert.equal(join2.initiatorOf(CONFIRMATION, [{ ...PENDING_ROW, userId: null }]), null)
})

test('U2: an unreadable confirmation time answers null rather than matching anything close', () => {
  assert.equal(join2.initiatorOf({ ...CONFIRMATION, createdAt: 'not-a-time' }, [PENDING_ROW]), null)
})

test('U2: the page wires the join, masks the name, and reads the queue only as an administrator', () => {
  const page = readFileSync(PAGE, 'utf8')
  const script = page.slice(page.indexOf('<script'), page.lastIndexOf('</script>'))
  assert.match(script, /confirmationApi\.listAll\(/, 'the card no longer reads the global confirmation queue')
  assert.match(script, /if \(!isAdmin\.value \|\| approvalLoading\.value\) return/, 'the queue read is not behind the administrator predicate')
  assert.match(script, /initiatorOf\(c, rows\)/, 'the queue row is no longer paired with its pending audit row')
  assert.match(script, /resolveCallerNames\(Object\.values\(joined\)/, 'the initiator name is never resolved through the host directory')
  assert.match(script, /maskTitle\(name\)/, 'the initiator name is no longer masked')
  assert.match(page, /approvalOwnRow/, 'a row the caller raised no longer explains why it offers no approve')
  assert.match(script, /status === 403/, 'a refused queue read is no longer put away quietly')
})
