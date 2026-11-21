// SPDX-License-Identifier: Apache-2.0
//
// N5's real-stack rehearsal (2026-11-21) §4 blocker 3: on the write ledger the "who" column read
// "not recorded" for every row an audit reader was looking at, while the business leg in the same
// drawer named the person. The cause is that `/ai/tool-effects` **omits `userId`** on a read-only
// reader's rows (JV-63 B5 ②'s decision) — yet the same row carries `executionId`, and the audit face
// records that execution's `tool_call` row with its initiator.
//
// This file pins two things: the pairing rule in `effectCallers.mjs` (only `tool_call` rows count — the
// decision row under the same execution is the **approver**; an unreachable `executionId` answers "not
// recorded" rather than falling back to "tool + five seconds"; exactly one person pairs), and the page
// wiring (the ledger reads the audit over the same window, names the paired ids through the directory,
// and the cell goes through `callerOf`; a failed audit read degrades that cell only, never the ledger).
//
// Run: node --test scripts/effect-callers.test.mjs
//
// N5 真栈预演（2026-11-21）§4 阻塞 3：「AI 写入台账」列表的「谁」列对只读读者恒为「未记录」，而同一页展开
// 后的业务腿却写着正确的人。成因是 `/ai/tool-effects` **只读读者**的行不带 `userId`（JV-63 B5 ② 的裁定）
// —— 同一行却带着 `executionId`，而审计面按它记着这次执行的 `tool_call` 行与发起人。
//
// 这一文件钉两件事：
//
//   · `effectCallers.mjs` 的配方 —— 只认 `tool_call` 行（同一执行下的裁决行是**批准人**，不是发起人）；
//     `executionId` 配不上时回「未记录」而不是退回「工具 + 五秒」；恰好一个人才算配上；
//   · 页面接线 —— 台账拿到行之后读同一窗口的审计、把配出的 id 交给名录，格子走 `callerOf`；审计读失败
//     只让「谁」回落成「未记录」，不把台账本身清空。
//
// 运行：node --test scripts/effect-callers.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

const callers = await import(
  pathToFileURL(join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/effectCallers.mjs')).href
)

const EXECUTION_B = '2943363f-506e-4251-960d-2b9cbc4b3a14'
const EXECUTION_A = 'b445b12f-84e1-4cf7-9a8a-2be73c9bd9fb'

// The three audit rows N5's rehearsal captured for execution B (`audit-followup.json`), trimmed to what
// this join reads. The decision row names the approver (9901); the two tool_call rows name the initiator.
// N5 预演为执行 B 拍到的那三行审计（`audit-followup.json`），收窄到这次配方读的几项。裁决行是**批准人**
// （9901），两行 `tool_call` 才是发起人。
const AUDIT_B = [
  { id: 15, userId: '1', action: 'tool_call', tool: 'escalate_customer', executionId: EXECUTION_B, createdAt: '2026-11-21T04:47:07.252760Z' },
  { id: 14, userId: '1', action: 'tool_call', tool: 'escalate_customer', executionId: EXECUTION_B, createdAt: '2026-11-21T04:47:07.214006Z' },
  { id: 13, userId: '9901', action: 'tool_confirmation', tool: 'escalate_customer', executionId: EXECUTION_B, createdAt: '2026-11-21T04:47:07.179192Z' },
]

/** A ledger row of the shape a read-only reader receives: no `userId`, executionId present. */
/** 只读读者收到的台账行形状：没有 `userId`，`executionId` 在。 */
const READER_EFFECT_B = {
  id: 2,
  toolName: 'escalate_customer',
  userId: null,
  resultType: 'follow_up',
  resultId: 1,
  createdAt: '2026-11-21T12:47:07.252760',
  executionId: EXECUTION_B,
  status: 'executed',
}

test('a read-only reader’s row takes the initiator from its execution’s tool_call row, never the approver', () => {
  assert.equal(callers.initiatorOfEffect(READER_EFFECT_B, AUDIT_B), '1')
})

test('a row that carries its own userId needs no audit read and keeps that answer', () => {
  const own = { ...READER_EFFECT_B, userId: '7' }
  assert.equal(callers.needsCallerJoin(own), false)
  assert.equal(callers.initiatorOfEffect(own, AUDIT_B), '7')
  assert.equal(callers.needsCallerJoin(READER_EFFECT_B), true)
})

test('one execution naming two different initiators is not paired — a guess is worse than "not recorded"', () => {
  const rows = [
    { ...AUDIT_B[0], userId: '1' },
    { ...AUDIT_B[1], userId: '2' },
  ]
  assert.equal(callers.initiatorOfEffect(READER_EFFECT_B, rows), null)
})

test('an executionId the scanned window does not hold answers null — no fallback to tool + five seconds', () => {
  // 同一工具、五秒之内的**另一次**执行就摆在旁边：退回「工具 + 五秒」正好会把这一次说成那一次。
  // A different execution of the same tool sits five seconds away; the time fallback would pair it.
  const other = { ...AUDIT_B[0], executionId: 'a-different-execution' }
  assert.equal(callers.initiatorOfEffect(READER_EFFECT_B, [other]), null)
})

test('without an executionId the pairing is the shared rule: same tool, within five seconds, exactly one', () => {
  const row = { ...AUDIT_B[0], executionId: null }
  const noExecution = { ...READER_EFFECT_B, executionId: null }
  assert.equal(callers.initiatorOfEffect(noExecution, [row]), '1')
  const twin = { ...row, id: 99, userId: '2' }
  assert.equal(callers.initiatorOfEffect(noExecution, [row, twin]), null, 'two candidates must not be paired')
})

test('the ledger window covers every row with a minute of padding on both ends', () => {
  const rows = [
    { id: 1, createdAt: '2026-11-21T12:42:08.000Z' },
    { id: 2, createdAt: '2026-11-21T12:47:07.000Z' },
  ]
  const window = callers.auditWindowForEffects(rows)
  assert.equal(window.since, '2026-11-21T12:41:08.000Z')
  assert.equal(window.until, '2026-11-21T12:48:07.000Z')
  assert.equal(callers.auditWindowForEffects([]), null)
  assert.equal(callers.auditWindowForEffects([{ createdAt: 'not a moment' }]), null)
})

test('the join maps only the rows it could pair, keyed by ledger row id', () => {
  const effectA = { ...READER_EFFECT_B, id: 1, executionId: EXECUTION_A, createdAt: '2026-11-21T12:42:08.000Z' }
  const paired = callers.joinEffectCallers([effectA, READER_EFFECT_B], AUDIT_B)
  assert.deepEqual(paired, { 2: '1' }, 'the unpaired row must stay absent so the cell can say "not recorded"')
})

// ── the page wiring ──────────────────────────────────────────────────────────────────────────────

const PAGE = 'keelbase-ui/host-overlay/src/views/keelbase/governance/ActionCenterPage.vue'
const API = 'keelbase-ui/host-overlay/src/keelbase/governanceApi.ts'
const PATCH = 'keelbase-ui/host-patches/0002-governance-ui.patch'

test('the ledger reads the audit of its own window and hands the paired ids to the directory', () => {
  const page = read(PAGE)
  assert.match(page, /import \{[\s\S]*?joinEffectCallers,[\s\S]*?\} from '@\/keelbase\/effectCallers\.mjs'/, 'the page no longer imports the pairing rule')
  assert.match(page, /async function loadEffectCallers\(rows: EffectRow\[\]\)/, 'the audit join is gone')
  assert.match(page, /rows\.some\(needsCallerJoin\)/, 'the audit read is no longer skipped when every row carries its own caller')
  assert.match(page, /auditApi\.logs\(\{[\s\S]*?\.\.\.window,[\s\S]*?limit: EFFECT_AUDIT_LIMIT,[\s\S]*?offset: page \* EFFECT_AUDIT_LIMIT,/, 'the audit read no longer scans the ledger window page by page')
  assert.match(page, /effectCallers\.value = await loadEffectCallers\(res\.items\)/, 'the ledger no longer fills the paired callers')
  assert.match(page, /\.\.\.Object\.values\(effectCallers\.value\)/, 'the paired ids are no longer named through the directory')
  assert.match(page, /return joinEffectCallers\(rows, auditRows\)/, 'the paired map is no longer built from the audit rows')
})

test('a failed audit read leaves the ledger drawn and only the "who" cell says "not recorded"', () => {
  const page = read(PAGE)
  const fn = page.slice(page.indexOf('async function loadEffectCallers'), page.indexOf('async function loadEffects'))
  assert.match(fn, /catch \{[\s\S]*?return \{\}/, 'a failed audit read must return an empty map, not throw the ledger away')
  assert.match(page, /function callerOf\(row: EffectRow\): string \| null/, 'the cell no longer resolves its caller through callerOf')
  assert.match(page, /<div>\{\{ callerName\(callerOf\(row\)\) \}\}<\/div>/, 'the "who" cell no longer goes through callerOf')
  assert.match(page, /<div v-if="callerOf\(row\)" class="muted">#\{\{ callerOf\(row\) \}\}<\/div>/, 'the account line no longer follows the paired caller')
})

test('the row type says which reader is left without userId, and that executionId is the join key', () => {
  const api = read(API)
  assert.match(api, /\*\*read-only reader's rows omit it\*\*/)
  assert.match(api, /the audit rows by `executionId`/)
  assert.doesNotMatch(api, /Empty on this deployment's ledger rows today/, 'the stale "always empty" comment is back')
})

test('the on-page reading explains both roads to "who", in both bundles', () => {
  const patch = read(PATCH)
  assert.match(patch, /the caller is read from the audit row of the same execution \(the two share its id\)/, 'the English hint no longer says where a withheld caller id comes from')
  assert.match(patch, /只读视图的行不带调用方编号时，取同一次执行（两处共有的执行编号）的审计行/, 'the Chinese hint no longer says where a withheld caller id comes from')
  assert.equal((patch.match(/writesHint:/g) || []).length >= 2, true, 'writesHint is not present in both bundles')
})
