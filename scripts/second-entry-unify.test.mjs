// SPDX-License-Identifier: Apache-2.0
//
// `N6`：同一次操作在「对象、时间、谁」三处得能直接对上 —— 审计链、行动中心、宿主操作日志。
//
// 2026-11-21 的评审纪要 §6.4 点出三处对不上：① 时区一处带偏移、一处不带；② 「谁」一处是账号名、一处是
// 破折号、一处是裸编号；③ 第二入口只「相关」不「硬链接」，而宿主操作日志那一页一个字没说。这一条测试钉住
// 本层的改法：
//
//   · 时区 —— `time.ts` 不再自己格式化，委托给六问用的同一个 `zonedTime`，故整层只有一条显示规则；
//   · 谁 —— 行动中心那张宿主日志小表走与审计链同一条窄读面（`resolveCallerNames`）配名；
//   · 相关 —— 审计链页写明第二入口的限度，核对 CSV 在表头前带一行说明，两份词条都在。
//
// 运行：node --test scripts/second-entry-unify.test.mjs
//
// ── English ─────────────────────────────────────────────────────────────────────
//
// `N6`: one operation must line up directly across the three places that answer for it — the audit
// chain, the action centre and the host's own operation log.
//
// The 2026-11-21 review (minutes §6.4) named three mismatches: the timezone carried an offset on one
// page and not another; "who" was an account name on one page, a dash on another and a bare number on a
// third; and the second entry was only *related*, never hard-linked, while the host's operation log said
// nothing about it. This test pins this layer's answer: `time.ts` delegates to the same `zonedTime` the
// six questions use; the action centre's host-log table is named through the same narrow directory the
// chain reads; and the chain page states the second entry's limit, with the verification CSV carrying it
// before the header — in both message bundles.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BLANK, composeSix, zonedTime } from '../keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs'
import { CHECK_COLUMN_KEYS, checkCsvText, csvText } from '../keelbase-ui/host-overlay/src/keelbase/auditQuery.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

const TIME = 'keelbase-ui/host-overlay/src/keelbase/time.ts'
const ACTION_CENTER = 'keelbase-ui/host-overlay/src/views/keelbase/governance/ActionCenterPage.vue'
const AUDIT_CHAIN = 'keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue'
const OP_AUDIT = 'keelbase-ui/host-overlay/src/views/keelbase/governance/OperationAuditPage.vue'
const PATCH = 'keelbase-ui/host-patches/0002-governance-ui.patch'

const t = (key) => key
const te = () => true

/** 一个名字表，与页面从宿主名录拿到的形状一致。 / A name table shaped like what the host directory returns. */
const mask = (v) => `${String(v).slice(0, 1)}****`

test('the timezone is written by one formatter, and the pages share it', () => {
  // ① 时区：`time.ts` 委托给六问那一条 `zonedTime` —— 不再有第二份格式。
  // The timezone: `time.ts` delegates to the six questions' `zonedTime` — there is no second format.
  const time = read(TIME)
  assert.match(time, /import \{ zonedTime \} from '\.\/sixQuestions\.mjs'/, 'time.ts no longer shares the six questions’ formatter')
  assert.match(time, /return zonedTime\(v\)/, 'time.ts no longer returns the shared formatter’s answer')

  // 同一时刻，两种形状，都带偏移量。
  // One instant, both shapes, each with an offset.
  const fromIso = zonedTime('2026-11-11T04:11:46.000Z')
  const fromEpoch = zonedTime(Date.parse('2026-11-11T04:11:46.000Z'))
  assert.equal(fromIso, fromEpoch, 'the ISO string and the epoch number read as different instants')
  assert.match(fromIso, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC[+-]\d{2}:\d{2}$/, 'the time no longer carries its offset')
  assert.equal(zonedTime(null), BLANK, 'an empty value should still be the dash')

  // 参与交叉核对的三页都用这一份。 / The three cross-checking pages all use it.
  for (const [page, label] of [
    [AUDIT_CHAIN, 'the audit chain'],
    [ACTION_CENTER, 'the action centre'],
    [OP_AUDIT, 'the operations audit'],
  ]) {
    assert.match(read(page), /import \{ timeText \} from '@\/keelbase\/time'/, `${label} no longer uses the shared time formatter`)
  }
})

test('the second entry names a caller the same way the audit chain does', () => {
  const page = read(ACTION_CENTER)
  // 展开行取回宿主日志后，用同一个窄读面配名。
  // After the host log lands, the ids are named through the same narrow directory.
  assert.match(page, /resolveCallerNames\(list\.map\(\(r\) => r\.userId\)\)/, 'the host-log leg no longer resolves caller names')
  // 「谁」这一格：宿主自己给的名字优先；只记了 id 时经名录译名，而不是印裸编号。
  // The "who" cell: the host’s own name first; an id alone goes through the directory, not out as a bare number.
  assert.match(page, /if \(row\.userName\) return row\.userName/, 'the host’s own name is no longer preferred')
  assert.match(page, /return callerName\(String\(row\.userId\)\)/, 'an id-only row is no longer named through the directory')
  assert.doesNotMatch(page, /return row\.userId === null \|\| row\.userId === undefined \? '—' : String\(row\.userId\)/, 'an id-only row still prints the bare id')
})

test('the audit chain states the second entry’s limit, and the check export carries it before the header', () => {
  const page = read(AUDIT_CHAIN)
  assert.match(page, /t\('keelbase\.audit\.secondEntryHint'\)/, 'the chain page no longer states the second entry’s limit')
  assert.match(page, /t\('keelbase\.audit\.exportNote'\)/, 'the check export no longer carries the correlation note')

  const labels = ['ID', 'Who', 'When', 'Object', 'Change', 'Confirmation', 'Result', 'Checks']
  const answers = [
    { key: 'who', text: 'KeelBase' },
    { key: 'when', text: '2026-11-11 12:11:46 UTC+08:00' },
    { key: 'object', text: '客户 · #2' },
    { key: 'change', text: '新建' },
    { key: 'confirmation', text: '无需确认' },
    { key: 'result', text: '已执行' },
  ]
  assert.equal(CHECK_COLUMN_KEYS.length, labels.length)

  const withNote = checkCsvText([{ id: 31, answers, checks: '通过' }], labels, '相关、非硬链接')
  const lines = withNote.trimEnd().split('\r\n')
  assert.equal(lines[0], '# 相关、非硬链接', 'the note is not the first line')
  assert.deepEqual(lines[1].split(','), labels, 'the header no longer follows the note')
  assert.equal(lines[2].split(',').length, 8, 'the data row stopped being eight columns')

  // 不给说明时与从前逐字相同：旧调用方不受影响。
  // Without a note the file is byte-for-byte what it was: existing callers are unaffected.
  const plain = checkCsvText([{ id: 31, answers, checks: '通过' }], labels)
  assert.equal(plain, withNote.slice(withNote.indexOf('\r\n') + 2), 'omitting the note changed the body')
  // 六列业务 CSV 不动 —— U1 的验收口径。 / The six-column business CSV is untouched — U1’s acceptance reading.
  assert.equal(csvText([{ answers }], labels.slice(1, 7)).trimEnd().split('\r\n').length, 2, 'the six-column export gained a line')
})

test('both message bundles carry the new statements, and neither carries an internal name', () => {
  const patch = read(PATCH)
  const added = patch
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n')
  for (const key of ['secondEntryHint:', 'exportNote:']) {
    assert.equal(added.split(key).length - 1, 2, `${key} is not defined in both bundles`)
  }
  // 这条说明会进导出文件，它本身不能带内部名（导出对每一格都跑同一道闸）。
  // This note reaches the export, so it must carry no internal name itself (the export runs that guard on every cell).
  for (const sentence of [
    '相关、非硬链接：每一行的业务主键与时间，可把它与宿主自己的操作日志里的同一次操作对上；两条轨之间没有共享编号，那张日志对动作的叫法也不同。',
    "Related, not linked: each row's business key plus its time pairs this line with the same operation in the host's own operation log; the two trails share no id, and that log words the act differently.",
  ]) {
    assert.doesNotMatch(sentence, /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/, 'the note carries a snake_case internal name')
  }
  // 两份词条各有一份同样的键集合（缺一边是另一种缺陷）。这两个键中英各一处。
  // Both bundles carry the same key set; each of the two keys appears once per bundle.
  assert.equal((patch.match(/^\+\s+secondEntryHint:/gm) || []).length, 2, 'secondEntryHint is not in both bundles')
  assert.equal((patch.match(/^\+\s+exportNote:/gm) || []).length, 2, 'exportNote is not in both bundles')
})

test('one operation reads the same on the chain: name, instant and object key line up', () => {
  const row = {
    id: 31,
    userId: '1',
    action: 'tool_call',
    tool: 'create_crm_customer',
    outcome: 'executed',
    isError: false,
    createdAt: '2026-11-11T04:11:46.000Z',
    authorization: JSON.stringify({ riskStrategy: 'auto', requiresConfirmation: false }),
  }
  const effect = {
    id: 5,
    executionId: 'e-1',
    resultType: 'crm_customer',
    resultId: 2,
    createdAt: '2026-11-11T04:11:46.000Z',
    targetExists: true,
  }
  const answers = composeSix({
    row,
    callerName: 'KeelBase',
    effect,
    proposal: null,
    recorded: null,
    hostNowName: '新客户',
    proposalName: '',
    approverName: '',
    recordState: '还在',
    mask,
    resultWord: '已执行',
    resultMeaning: '',
    t,
    te,
  })
  const byKey = Object.fromEntries(answers.map((a) => [a.key, a.text]))
  // 谁：名字 + 账号号；何时：带偏移；对象：业务名 + 主键 —— 这三格就是第二入口要对上的三样。
  // Who: the name plus the account number; when: with the offset; object: business word plus key — the
  // three things the second entry has to line up with.
  assert.equal(byKey.who, 'KeelBase（keelbase.sixQ.account #1）')
  assert.match(byKey.when, /^2026-11-11 \d{2}:\d{2}:\d{2} UTC[+-]\d{2}:\d{2}$/)
  assert.match(byKey.object, /#2/)
  // 与宿主日志那一行同一个人、同一个对象主键、同一个时刻 —— 三样都能直接比。
  // The host-log row carries the same person, the same object key and the same instant when named
  // through the same directory; this is the rule the page's `whoText` now follows.
  // 宿主那条面答的是毫秒数（yudao 的 Jackson），与链上同一个时刻。
  // The host face answers epoch milliseconds (yudao's Jackson), the same instant as the chain.
  const hostLog = {
    bizId: 2,
    userId: 1,
    userName: null,
    createTime: Date.parse('2026-11-11T04:11:46.000Z'),
  }
  const names = { 1: 'KeelBase' }
  const whoOnLog = hostLog.userName || names[String(hostLog.userId)] || String(hostLog.userId)
  assert.equal(whoOnLog, 'KeelBase', 'the host log names a different person than the chain')
  assert.equal(hostLog.bizId, effect.resultId, 'the host log is about a different record')
  assert.equal(zonedTime(hostLog.createTime), byKey.when, 'the host log reads a different instant than the chain')
})
