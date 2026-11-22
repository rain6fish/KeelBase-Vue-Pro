// SPDX-License-Identifier: Apache-2.0
//
// N6（2026-11-21）：同一操作在**对象、时间、谁**三处无需猜测即可对上。这一文件钉住三处口径，外加参数的读法：
//
//   · 时间 —— 每一页、每一格都写偏移量，且与审计链自己那一格走**同一个**格式化器；
//   · 谁 —— 配不出名字时明写「姓名未记录」并保留账号，两样都没有时明写「未记录」，不拿裸 id 顶名字、
//     不画破折号；
//   · 风险级 —— `R5` 是「拦截档」，不是「恒阻断」（本部署没有声明任何 R5 工具，那个「恒」字在说假话）；
//   · 参数 —— 确认提议的参数按「记下一个、一行」摊开，不再是裸 JSON。
//
//     node --test scripts/second-entry-consistency.test.mjs
//
// 页面那几条停在源码层：本仓不带 Vue 测试运行器，而 UI 检出是一次性的（`target/`）。纯函数（时间、参数）
// 直接跑，页面只钉接线 —— 与 `audit-chain-page.test.mjs` 同一条理由。
//
// N6 (2026-11-21): one operation has to line up at the **object, the time and the person** with no
// guessing. This file pins those three readings, plus how a proposal's arguments are read: the time
// always carries its offset and goes through the audit chain's own formatter; a person the host cannot
// name is never replaced by a bare id or a dash; `R5` is the block tier, not "always blocked" (this
// deployment declares no R5 tool, so "always" would be false); and a proposal's arguments read one
// recorded line at a time instead of a JSON block.
//
//     node --test scripts/second-entry-consistency.test.mjs
//
// The page assertions stop at the source: this repository ships no Vue test runner, and the UI checkout
// it builds from is disposable (`target/`). The pure functions (time, arguments) run directly; the
// pages only pin their wiring — the same reason `audit-chain-page.test.mjs` states.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = process.env.KEELBASE_REPO_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const six = await import(pathToFileURL(join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs')).href)
const args = await import(pathToFileURL(join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/argsText.mjs')).href)
const labels = await import(pathToFileURL(join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/labels.ts')).href)

/** The English words the patch defines, verbatim; the test keeps its own copy so drift shows up. */
/** 补丁里那份英文词条，逐字；测试各留一份，改了另一处会在这里显示为读数变化。 */
const MESSAGES = {
  'keelbase.audit.objectKey': 'Business key',
  'keelbase.sixQ.fieldName': 'Customer name',
  'keelbase.sixQ.fieldLevel': 'Level',
  'keelbase.sixQ.fieldSource': 'Source',
  'keelbase.sixQ.fieldDealStatus': 'Deal closed',
  'keelbase.sixQ.fieldFollowUpStatus': 'Followed up',
  'keelbase.actionCenter.argsUnrecorded': 'not recorded — this proposal carries no arguments',
  'keelbase.actionCenter.argsEmptyValue': 'empty',
}

const t = (key) => MESSAGES[key] ?? key
const te = (key) => Object.hasOwn(MESSAGES, key)

test('every moment carries its offset, and the same instant reads the same in both arrival shapes', () => {
  // 运行时答 UTC ISO 串，宿主自己那条面答毫秒数；两者是同一个时刻，就必须读出同一个钟面，且都带偏移量。
  // The runtime answers a UTC ISO string and the host's own face answers epoch milliseconds; the same
  // instant has to read as one clock face, offset included.
  const iso = '2026-11-21T01:02:03Z'
  const fromIso = six.zonedTime(iso)
  const fromMillis = six.zonedTime(new Date(iso).getTime())
  assert.equal(fromIso, fromMillis, 'the two wire shapes render to different clock faces')
  assert.match(fromIso, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC[+-]\d{2}:\d{2}$/, `got "${fromIso}"`)
  assert.equal(six.zonedTime('not a moment'), 'not a moment', 'an unreadable value must be shown as itself')
})

test('the shared time helper delegates to the audit chain formatter instead of keeping a second shape', () => {
  // 两处各自格式化，就是同一个时刻并排读出两个钟面的来源。`time.ts` 只留一条路：交给 `zonedTime`。
  // Two formatters are exactly how one instant reads as two clocks side by side. `time.ts` keeps one
  // road only: hand the value to `zonedTime`.
  const source = read('keelbase-ui/host-overlay/src/keelbase/time.ts')
  assert.match(source, /import \{ zonedTime \} from '\.\/sixQuestions\.mjs'/)
  assert.match(source, /return zonedTime\(/, 'timeText no longer renders through zonedTime')
  assert.doesNotMatch(source, /format\('YYYY-MM-DD HH:mm:ss'\)/, 'a zone-less format is back alongside the zoned one')
})

test('a proposal’s arguments read as recorded lines, never as a JSON block', () => {
  const text = args.argsText({ id: 9005, name: '万象商业服务有限公司', level: 3 }, { t, te })
  assert.equal(
    text,
    'Business key：9005\nCustomer name：万象商业服务有限公司\nLevel：3',
    `got "${text}"`,
  )
  assert.doesNotMatch(text, /[{}[\]"]/, 'JSON syntax is still being printed')
})

test('nested argument values stay readable and an empty set says it recorded none', () => {
  const text = args.argsText({ tags: ['a', 'b'], owner: { id: 1 } }, { t, te })
  assert.equal(text, 'tags：a、b\nowner：id=1', `got "${text}"`)
  assert.doesNotMatch(text, /[{}[\]"]/)

  for (const empty of [null, undefined, {}, []]) {
    assert.equal(args.argsText(empty, { t, te }), MESSAGES['keelbase.actionCenter.argsUnrecorded'])
  }
  assert.equal(args.argsText({ note: null }, { t, te }), 'note：empty')
})

test('a demo-only kind is named by its record word, not by its internal name', () => {
  // `follow_up` / `pm_project` live only in the six questions' record vocabulary; a ledger that consulted
  // the effects vocabulary alone printed the internal name, so the same object read two ways.
  // `follow_up` / `pm_project` 只在六问的 record 词表里；台账若只查 effects 词表，会把内部名印出来，
  // 同一操作的对象在台账与审计链上就对不上。
  const bundle = {
    'keelbase.effects.resultType.crm_customer': 'customer',
    'keelbase.record.follow_up': 'Sample follow-up',
    'keelbase.record.pm_project': 'Project',
  }
  const te = (key) => Object.hasOwn(bundle, key)
  assert.equal(labels.resultTypeWordKey('crm_customer', te), 'keelbase.effects.resultType.crm_customer')
  assert.equal(labels.resultTypeWordKey('follow_up', te), 'keelbase.record.follow_up')
  assert.equal(labels.resultTypeWordKey('pm_project', te), 'keelbase.record.pm_project')
  assert.equal(labels.resultTypeWordKey('not_a_kind', te), null, 'an unknown kind must stay as itself')
  assert.equal(labels.resultTypeWordKey(null, te), null)

  const page = read('keelbase-ui/host-overlay/src/views/keelbase/governance/ActionCenterPage.vue')
  assert.match(page, /resultTypeWordKey\(value, te\)/, 'the ledger no longer takes the record-word fallback')
})

test('the action centre renders the arguments through that reader', () => {
  const page = read('keelbase-ui/host-overlay/src/views/keelbase/governance/ActionCenterPage.vue')
  assert.match(page, /from '@\/keelbase\/argsText\.mjs'/, 'the page no longer uses the readable arguments module')
  const script = page.slice(page.indexOf('<script'), page.lastIndexOf('</script>'))
  assert.doesNotMatch(script, /JSON\.stringify\(args/, 'the raw JSON dump is back')
  assert.match(page, /\{\{ formatArgs\(c\.arguments\) \}\}/, 'the arguments block is no longer drawn')
})

test('the “who” columns never fall back to a dash or a bare id', () => {
  // 三条留痕（审计链、操作审计、旁路留痕）的「谁」列：配不出名字时由词条说明，页面本身不再回落成 id
  // 或破折号。
  // The "who" column on all three trails (the audit chain, the operation audit, the bypass trail): when
  // the host cannot name the id, a message says so; the page itself no longer falls back to the id or a
  // dash.
  const pages = {
    chain: 'keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue',
    operation: 'keelbase-ui/host-overlay/src/views/keelbase/governance/OperationAuditPage.vue',
    boundary: 'keelbase-ui/host-overlay/src/views/keelbase/governance/BoundaryPage.vue',
    actionCentre: 'keelbase-ui/host-overlay/src/views/keelbase/governance/ActionCenterPage.vue',
  }
  for (const [where, path] of Object.entries(pages)) {
    const source = read(path)
    assert.match(source, /t\('keelbase\.audit\.userUnrecorded'\)/, `${where}: a bare value is drawn where no caller is recorded`)
    assert.match(source, /t\('keelbase\.audit\.userUnnamed'\)/, `${where}: an unnamed id is printed as the name`)
  }
  const chain = read(pages.chain)
  assert.match(chain, /callerName: resolvedName\(row\.userId\)/, 'the six-question cell takes the display fallback, not the name')
})

test('R5 is called the block tier, not a level that always blocks', () => {
  const patch = read('keelbase-ui/host-patches/0002-governance-ui.patch')
  assert.doesNotMatch(patch, /R5 恒阻断/, 'the word that claims a permanent block is back')
  assert.doesNotMatch(patch, /R5 is always blocked/, 'the word that claims a permanent block is back')
  assert.match(patch, /R5 拦截档/, 'the block-tier word is gone')
  assert.match(patch, /R5 is the block tier/, 'the block-tier word is gone')
})
