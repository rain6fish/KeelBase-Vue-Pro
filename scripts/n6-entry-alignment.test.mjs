// SPDX-License-Identifier: Apache-2.0
//
// N6：同一操作在对象、时间、谁三处，六问与第二入口（行动中心里那条宿主操作日志）不靠猜就能对上。
//
// 三处的判据：
//
//   ① 时间 —— 六问的答案与它的 CSV 用 `zonedTime`（本机时区 + 显式偏移）；第二入口的两处时间
//      （台账行与宿主日志行）也走同一个函数，于是「何时」两处逐字可比。宿主日志的 `createTime`
//      是毫秒数，六问拿到的是 UTC ISO 串 —— 两种形状必须给出同一个字符串。
//   ② 对象 —— 第二入口用第三问那一组词（`keelbase.record.*`）加同一个主键，不印运行时的类型名。
//   ③ 谁 —— 第二入口按第一问的形状「名字（账号 #n）」写，名字取不到时用 id 顶替（与第一问的回落
//      一致）；宿主那一行本来就没记人的，说「未记操作人」，而不是一个会被读成「没取到」的破折号。
//
// 关联仍写「相关」而不是硬链接：宿主日志里没有共享 id 可指，硬链要往宿主日志写一个 id —— 那是宿主
// 业务侧的事，本任务只到展示与文案。这条测试钉的是「相关」这个说法确实出现在页面上，以及上面三处。
//
// 运行：node --test scripts/n6-entry-alignment.test.mjs
//
// ── English ─────────────────────────────────────────────────────────────────────────────────────
//
// N6: one operation must line up between the six answers and the second entry (the host operate log
// shown in the action centre) on object, time and person, without guessing.
//
// The criterion for each: ① time — the six answers and their CSV use `zonedTime` (local clock with its
// offset), and the second entry's two time cells (the ledger row and the host log row) use the same
// function, so "when" reads identically in both. The host log answers `createTime` as epoch millis while
// the six answers get a UTC ISO string — both shapes must produce the same string. ② object — the second
// entry uses the third answer's words (`keelbase.record.*`) and the same key, never the runtime's type
// name. ③ who — the second entry takes the first answer's shape, name (account #n), with the id standing
// in when no name is available (the first answer's fallback), and a row the host recorded with nobody
// says 「no operator recorded」 rather than a dash that reads as "not fetched".
//
// The relation stays labelled **related**, not a hard link: the host log carries no shared id to point
// at, and a hard link would mean writing one into it — the host's own business side; this task stops at
// display and copy. This test pins that "related" appears in the page and that the three alignments do.
//
// Run: node --test scripts/n6-entry-alignment.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zonedTime } from '../keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

const actionCenter = read('keelbase-ui/host-overlay/src/views/keelbase/governance/ActionCenterPage.vue')
const auditChain = read('keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue')
const sixQuestions = read('keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs')
const auditQuery = read('keelbase-ui/host-overlay/src/keelbase/auditQuery.mjs')
const patch = read('keelbase-ui/host-patches/0002-governance-ui.patch')

test('the six answers and the second entry read one clock: two shapes, one string with its offset', () => {
  // 宿主日志给的是毫秒数，六问给的是 UTC ISO 串 —— 同一个时刻必须读成同一句话。
  //
  // The host log gives epoch millis and the six answers get a UTC ISO string — one instant has to read
  // as one sentence either way.
  const iso = '2026-11-11T04:11:46.000Z'
  const millis = Date.parse(iso)
  assert.match(zonedTime(iso), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC[+-]\d{2}:\d{2}$/, 'the answer lost its offset')
  assert.equal(zonedTime(millis), zonedTime(iso), 'the two shapes disagree about the same instant')
  assert.equal(zonedTime(null), '—')
  assert.equal(zonedTime('not a time'), 'not a time', 'an unreadable value is no longer shown as itself')

  // 六问的「何时」与导出用的是这一个函数；第二入口的两处时间也必须走它。
  //
  // The sixth answer's "when" and the export both take this function; the second entry's two time cells
  // have to go through it too.
  assert.match(sixQuestions, /\{ key: 'when', label: 'when', text: zonedTime\(row\?\.createdAt\)/, 'the sixth answer stopped using zonedTime')
  assert.match(auditQuery, /export function csvText\(/, 'the six-answer CSV is gone')
  assert.match(
    actionCenter,
    /t\('keelbase\.effects\.businessLogColWhen'\)[^]*?\n[^\n]*zonedTime\(r\.createTime\)/,
    'the host log row is back to a clock without its offset',
  )
  assert.match(
    actionCenter,
    /t\('keelbase\.effects\.colTime'\)[^]*?\n[^\n]*zonedTime\(row\.createdAt\)/,
    'the ledger row is back to a clock without its offset',
  )
})

test('the second entry names the object the way the third answer does', () => {
  // 第三问的写法：业务词（`keelbase.record.*`）+ 主键。第二入口的对象行必须从同一组词来。
  //
  // The third answer's notation: business word (`keelbase.record.*`) plus key. The second entry's object
  // line has to come from the same words.
  assert.match(sixQuestions, /word\(te, t, `keelbase\.record\.\$\{effect\.resultType\}`/, 'the third answer stopped spelling objects with the record words')
  assert.match(actionCenter, /`keelbase\.record\.\$\{row\.resultType \?\? ''\}`/, 'the second entry no longer uses the record words')
  assert.match(actionCenter, /t\('keelbase\.effects\.businessLogObject', \{ object: objectHead\(row\) \}\)/, 'the second entry draws no object line')
  assert.match(actionCenter, /function objectHead\(row: EffectRow\): string/, 'objectHead is gone')
})

test('the second entry names people the way the first answer does, and says when nobody was recorded', () => {
  // 六问把第一问抽成了 `whoLine`：「名字（账号 #n）」。第二入口必须写同一个形状。
  //
  // The six answers moved the first answer into `whoLine`: name (account #n). The second entry must
  // write the same shape.
  assert.match(sixQuestions, /const account = callerId \? `\$\{t\('keelbase\.sixQ\.account'\)\} #\$\{callerId\}` : ''/, 'the first answer changed shape')
  assert.match(sixQuestions, /text: account \? `\$\{callerName\}（\$\{account\}）`/, 'the first answer no longer brackets the account the same way')
  assert.match(actionCenter, /t\('keelbase\.sixQ\.account'\)/, 'the second entry no longer prints the account number')
  assert.match(actionCenter, /t\('keelbase\.audit\.userUnrecorded'\)/, 'a row with nobody recorded no longer says so')
  assert.doesNotMatch(
    actionCenter,
    /function whoText\(row: BusinessLogRow\): string \{\n\s+if \(row\.userName\) return row\.userName/,
    'the old bare-name/blank cell is back',
  )
  // 名字与六问同源：宿主自己的名字优先，其次审计链同一条窄读面（`callerName`）；名录认不出时它说
  // 「姓名未记录」，与第一问的回落一致。
  assert.match(actionCenter, /row\.userName \|\| callerName\(String\(id\)\)/, 'the name no longer falls back the way the first answer does')
  assert.match(actionCenter, /resolveCallerNames\(list\.map\(\(r\) => r\.userId\)\)/, 'the host-log rows no longer ask the same directory')
})

test('the relation stays labelled 「相关」 on the page, not implied', () => {
  assert.match(actionCenter, /t\('keelbase\.effects\.relatedLabel'\)/, 'the related tag is gone')
  assert.match(patch, /relatedLabel: 'related'/, 'the English word is missing')
  assert.match(patch, /relatedLabel: '相关'/, 'the Chinese word is missing')
})

test('both locale bundles carry the three aligned words', () => {
  const [en, zh] = patch.split('diff --git a/src/locales/zh-CN.ts')
  assert.ok(zh, 'the Chinese locale hunk is gone')
  const keys = (segment) => new Set([...segment.matchAll(/^\+\s+([A-Za-z_$][\w$]*):/gm)].map((m) => m[1]))
  for (const key of ['businessLogObject', 'relatedLabel', 'whoUnrecorded']) {
    assert.ok(keys(en).has(key), `en.ts is missing ${key}`)
    assert.ok(keys(zh).has(key), `zh-CN.ts is missing ${key}`)
  }
})

test('the six-answer screen and its export are still the same six cells', () => {
  // 导出不能借这次改动漂开：CSV 的六列就是屏幕上那六格。
  //
  // The export must not drift in this change: the CSV's six columns are the cells on screen.
  assert.match(auditChain, /csvText\(/, 'the six-column export is gone')
  assert.match(auditChain, /sixOf\(row\)/, 'the screen stopped rendering the six answers')
})
