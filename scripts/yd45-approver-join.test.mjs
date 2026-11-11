// SPDX-License-Identifier: Apache-2.0
//
// `YD-45` 的读侧判据：一次裁决的轨迹步，能不能说清**是谁**作的；说得出时，名字与 id 一起给；说不出
// 时，**说出说不出**，而不是补一个人上去。
//
//     node --test scripts/yd45-approver-join.test.mjs
//
// 下面那条轨迹步与那条审计行，是 2026-11-03 真栈取证里原样的一对（`approval-two-person-20261103.md`
// §5.2 第 3 行：`action=tool_confirmation, user_id=9004`；轨迹步来自同一份取证 §5.3 的 JSON）。测试
// **不读**代码里的词条表：词条在这里另抄一份，两边谁改了另一处，读数就会变，而不会悄悄跟着走。
//
// English:
//
// The read-side criterion for `YD-45`: can a decision's trace step say **who** took it? When it can, the
// name and the id are both given; when it cannot, it **says so** rather than filling a person in.
//
//     node --test scripts/yd45-approver-join.test.mjs
//
// The trace step and audit row below are the pair measured on the real stack on 2026-11-03
// (`approval-two-person-20261103.md` §5.2 row 3: `action=tool_confirmation, user_id=9004`; the step is
// the JSON in §5.3 of the same evidence). The test does **not** read the message table out of the code:
// the messages are copied here separately, so editing one side changes a reading instead of following
// silently.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODULE = join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/approverJoin.mjs')
const PAGE = join(ROOT, 'keelbase-ui/host-overlay/src/views/keelbase/governance/ConversationTracePage.vue')
const PATCH = join(ROOT, 'keelbase-ui/host-patches/0002-governance-ui.patch')

const join2 = await import(pathToFileURL(MODULE).href)

/** 英文词条，与 `0002-governance-ui.patch` 里那一份逐字相同。 / English messages, verbatim from the patch. */
const MESSAGES = {
  'keelbase.trace.approverLabel': 'Approved by',
  'keelbase.trace.declinerLabel': 'Declined by',
  'keelbase.trace.approverLine': '{label}: {who}',
  'keelbase.trace.approverNamed': '{name} · #{id}',
  'keelbase.trace.approverIdOnly': 'User #{id}',
  'keelbase.trace.approverUnrecorded': '{label}: no single matching row in the audit rows read',
  'keelbase.trace.approverUnreadable': '{label}: could not be read (this page needs audit-read access)',
}

const t = (key, params = {}) =>
  (MESSAGES[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))

const mask = (text) => `${[...text][0]}****`

const STEP = {
  id: 'audit-3',
  type: 'confirmation',
  time: '2026-11-03T05:49:42.913463Z',
  toolName: 'record_crm_followup',
  detail: 'record_crm_followup approved (out_of_band)',
  outcome: 'approve',
}

const ROW = {
  id: 3,
  action: 'tool_confirmation',
  userId: '9004',
  tool: 'record_crm_followup',
  detail: 'record_crm_followup approved (out_of_band)',
  outcome: 'approved',
  createdAt: '2026-11-03T05:49:42.913463Z',
  isError: false,
}

test('YD-45: the decision row carrying the approver is paired with the step', () => {
  assert.equal(join2.matchApprover(STEP, [ROW]), '9004')
})

test('YD-45: two candidates are not resolved — no guessing', () => {
  const twin = { ...ROW, id: 4, userId: '9005' }
  assert.equal(join2.matchApprover(STEP, [ROW, twin]), null)
})

test('YD-45: a row outside the five-second window is not the same write', () => {
  const late = { ...ROW, createdAt: '2026-11-03T05:49:48.913464Z' }
  assert.equal(join2.matchApprover(STEP, [late]), null)
})

test('YD-45: a retry row of the same tool is not a decision', () => {
  const retry = {
    ...ROW,
    userId: '9004',
    detail: 'record_crm_followup execution retried',
    outcome: 'attempted',
  }
  assert.equal(join2.matchApprover(STEP, [retry]), null)
})

test('YD-45: a timeout or a pending step has no approver to name', () => {
  assert.equal(join2.matchApprover({ ...STEP, outcome: 'timeout' }, [ROW]), null)
  assert.equal(join2.matchApprover({ ...STEP, outcome: 'pending_approval' }, [ROW]), null)
})

test('YD-45: the operator\'s own tool_call row is never taken for the approver', () => {
  const operatorsRow = {
    ...ROW,
    action: 'tool_call',
    userId: '1',
    detail: 'record_crm_followup attempted',
  }
  assert.equal(join2.matchApprover(STEP, [operatorsRow]), null)
})

test('YD-45: a named approver is shown masked, with the id kept', () => {
  const line = join2.approverText(STEP, { kind: 'read', id: '9004', name: 'Boss' }, { mask, t })
  assert.equal(line, 'Approved by: B**** · #9004')
})

test('YD-45: a directory that cannot name the id falls back to the stable user id', () => {
  const line = join2.approverText(STEP, { kind: 'read', id: '9004', name: '9004' }, { mask, t })
  assert.equal(line, 'Approved by: User #9004')
})

test('YD-45: "not recorded" and "cannot be read" are different sentences', () => {
  assert.equal(
    join2.approverText(STEP, { kind: 'none' }, { mask, t }),
    'Approved by: no single matching row in the audit rows read',
  )
  assert.equal(
    join2.approverText(STEP, { kind: 'refused' }, { mask, t }),
    'Approved by: could not be read (this page needs audit-read access)',
  )
})

test('YD-45: a decline names the decliner, not an approver', () => {
  const declined = { ...STEP, outcome: 'decline' }
  const line = join2.approverText(declined, { kind: 'read', id: '9007', name: 'Carol' }, { mask, t })
  assert.equal(line, 'Declined by: C**** · #9007')
})

test('YD-45: the page wires the join and reads the chain within its bound', () => {
  const page = readFileSync(PAGE, 'utf8')
  const script = page.slice(page.indexOf('<script'), page.lastIndexOf('</script>'))
  assert.match(script, /matchApprover\(step, rows, APPROVER_WINDOW_MS\)/, 'the page no longer pairs a decision with its audit row')
  assert.match(script, /resolveApprovers\(loaded\.steps, loaded\.conversation\.id\)/, 'the join is never called after the trace lands')
  assert.match(script, /auditApi\.logs\(\{\s*since:[\s\S]*?limit: APPROVER_LIMIT/, 'the page no longer reads the audit chain, or left it unbounded')
  assert.match(script, /approverText\(step, approvers\.value\[step\.id\]/, 'the page no longer renders the three outcomes')
  assert.match(script, /approverUnreadable|kind: 'refused'/, 'a refused chain read is no longer distinguished')
  // 会话属主**不是**批准人：这一页从不拿它顶替。 / The conversation's owner is not the approver, and is never used as one.
  assert.doesNotMatch(script, /conversation\.userId/, 'the page uses the conversation owner as a person')
})

/** 取从 `start` 起的那个对象字面量。 / take the object literal at `start`. */
function objectAt(text, start) {
  let depth = 0
  let quote = ''
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === "'" || ch === '"') quote = ch
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  throw new Error('unbalanced object literal')
}

function traceMessages() {
  const patch = readFileSync(PATCH, 'utf8').replace(/\r\n/g, '\n')
  const marker = '+    trace: {'
  const blocks = []
  for (let at = patch.indexOf(marker); at !== -1; at = patch.indexOf(marker, at + marker.length)) {
    const raw = objectAt(patch, patch.indexOf('{', at))
    const js = raw
      .split('\n')
      .map((line) => line.replace(/^\+/, ''))
      .join('\n')
    blocks.push(new Function(`return (${js})`)())
  }
  assert.equal(blocks.length, 2, 'the patch carries exactly two trace message blocks (English + Chinese)')
  return blocks
}

test('YD-45: both languages carry the approver copy', () => {
  const blocks = traceMessages()
  const keys = [
    'approverLabel', 'declinerLabel', 'approverLine', 'approverNamed',
    'approverIdOnly', 'approverUnrecorded', 'approverUnreadable',
  ]
  for (const block of blocks) {
    for (const key of keys) {
      assert.equal(typeof block[key], 'string', `${block.title} is missing \`${key}\``)
    }
  }
  const zh = blocks.find((block) => block.title === '决策轨迹')
  assert.equal(zh.approverLabel, '批准人')
  assert.equal(zh.approverIdOnly, '用户 #{id}')
})
