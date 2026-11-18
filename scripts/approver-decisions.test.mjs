// SPDX-License-Identifier: Apache-2.0
//
// The "recent decisions" card must not answer only the caller's own confirmations. An R4 row decided
// by the second approver lives on the global queue plus an audit decision row, and the confirmation
// projection carries no approver id — so the only honest match is "same tool, within five seconds,
// exactly one candidate", and no match lists nothing. This pins the rule, and pins that the page uses
// it and merges both halves into the one card.
//
// 「最近裁决」不能只答调用方自己发起的确认。第二批准人裁决的 R4 行落在全局队列 + 审计裁决行上，
// 而确认记录的投影不带裁决人 id —— 故只能按「同一工具、五秒之内、恰好一个候选」配对，配不上就不列。
// 这里钉住那条规则本身，以及页面真的用了它、真的把两半合到同一张卡里。
//
// Run: node --test scripts/approver-decisions.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  APPROVER_DECISION_WINDOW_MS,
  pairDecidedByApprover,
} from '../keelbase-ui/host-overlay/src/keelbase/approverDecisions.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const PAGE = 'keelbase-ui/host-overlay/src/views/keelbase/governance/ActionCenterPage.vue'
const PATCH = 'keelbase-ui/host-patches/0002-governance-ui.patch'

const at = (ms) => new Date(Date.UTC(2026, 10, 17, 4, 0, 0) + ms).toISOString()

const conf = (over) => ({
  token: 'tok-1',
  toolName: 'escalate_customer',
  mode: 'approval',
  status: 'approved',
  createdAt: at(-60000),
  decidedAt: at(0),
  ...over,
})

const decisionRow = (over) => ({
  action: 'tool_confirmation',
  outcome: 'approved',
  tool: 'escalate_customer',
  userId: '9913',
  createdAt: at(200),
  ...over,
})

test('one decided approval row and my own decision row pair up', () => {
  const picked = pairDecidedByApprover([conf()], [decisionRow()])
  assert.deepEqual(picked.map((c) => c.token), ['tok-1'])
})

test('a decline is a decision too', () => {
  const picked = pairDecidedByApprover(
    [conf({ token: 'tok-d', status: 'declined' })],
    [decisionRow({ outcome: 'declined' })],
  )
  assert.deepEqual(picked.map((c) => c.token), ['tok-d'])
})

test('pending, immediate and batch rows are not candidates — even at the same tool and instant', () => {
  const queue = [
    conf({ token: 'pending', status: 'pending', decidedAt: null }),
    conf({ token: 'immediate', mode: 'immediate' }),
    conf({ token: 'run', mode: 'run' }),
  ]
  assert.deepEqual(pairDecidedByApprover(queue, [decisionRow()]), [])
})

test('two candidates inside the window mean no row is claimed', () => {
  const queue = [conf({ token: 'a', decidedAt: at(0) }), conf({ token: 'b', decidedAt: at(1800) })]
  assert.deepEqual(pairDecidedByApprover(queue, [decisionRow()]), [])
})

test('a different tool is not a candidate', () => {
  assert.deepEqual(pairDecidedByApprover([conf({ toolName: 'delete_project' })], [decisionRow()]), [])
})

test('the five-second window is the boundary; one millisecond past it does not pair', () => {
  assert.equal(APPROVER_DECISION_WINDOW_MS, 5000)
  assert.equal(pairDecidedByApprover([conf({ decidedAt: at(0) })], [decisionRow({ createdAt: at(5000) })]).length, 1)
  assert.equal(pairDecidedByApprover([conf({ decidedAt: at(0) })], [decisionRow({ createdAt: at(5001) })]).length, 0)
})

test('an audit row that is not a person\'s decision is ignored', () => {
  const rows = [
    decisionRow({ outcome: 'attempted' }),
    decisionRow({ outcome: 'blocked' }),
    decisionRow({ action: 'tool_call' }),
  ]
  assert.deepEqual(pairDecidedByApprover([conf()], rows), [])
})

test('two audit rows that resolve to the same confirmation row list it once', () => {
  const picked = pairDecidedByApprover([conf()], [decisionRow(), decisionRow({ createdAt: at(300) })])
  assert.deepEqual(picked.map((c) => c.token), ['tok-1'])
})

test('a malformed input answers nothing rather than throwing', () => {
  assert.deepEqual(pairDecidedByApprover(null, [decisionRow()]), [])
  assert.deepEqual(pairDecidedByApprover([conf()], null), [])
  assert.deepEqual(pairDecidedByApprover([conf({ decidedAt: 'not-a-date' })], [decisionRow()]), [])
})

test('the action centre merges the approver half into the one recent-decisions card', () => {
  const page = read(PAGE)
  assert.match(page, /import \{ pairDecidedByApprover \} from '@\/keelbase\/approverDecisions\.mjs'/, 'the page no longer uses the pairing rule')
  assert.match(page, /auditApi\.logs\(\{[\s\S]{0,200}?userId: me/, 'the caller\'s own decision audit rows are no longer read')
  assert.match(page, /loadApproverDecisions\(items\)/, 'the queue that was already read is no longer reused for the approver half')
  assert.match(page, /const historyRows = computed/, 'the two halves are no longer merged')
  assert.match(page, /v-for="h in historyRows"/, 'the card no longer draws the merged list')
  assert.match(page, /approverDecidedTokens\.has\(h\.token\)/, 'a row decided as the second approver is no longer marked as such')
  assert.match(page, /historyApproverUnread/, 'a failed approver-half read is silently drawn as "nothing decided"')
  assert.match(
    page,
    /v-if="!historyRows\.length && !approverHistoryError"/,
    'a failed read is also drawn as "nothing has been decided", contradicting the error above it',
  )
})

test('both locale dictionaries carry the approver-half keys', () => {
  const patch = read(PATCH)
  const [en, zh] = patch.split('diff --git a/src/locales/zh-CN.ts')
  assert.ok(zh, 'the Chinese locale hunk is gone')
  const keys = (segment) => new Set([...segment.matchAll(/^\+\s+([A-Za-z_$][\w$]*):/gm)].map((m) => m[1]))
  const enKeys = keys(en)
  const zhKeys = keys(zh)
  for (const key of ['historyApproverNote', 'historyApproverUnread']) {
    assert.ok(enKeys.has(key), `en.ts is missing ${key}`)
    assert.ok(zhKeys.has(key), `zh-CN.ts is missing ${key}`)
  }
})
