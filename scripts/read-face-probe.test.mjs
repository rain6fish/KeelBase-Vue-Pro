// SPDX-License-Identifier: Apache-2.0
//
// N4: a read face that ignores the object filter must not pass for one that applied it.
//
// The code generator emits its own `/audit/logs` next to the runtime's, and it takes neither
// `objectType`/`objectId` nor `until`. Spring ignores parameters a handler does not declare, so a request
// carrying them comes back as a wider list with no error — exactly the silent widening the 0.1.18 review
// criticised. The console answers that behaviourally: it asks the face for an object that cannot exist
// and for a window that ended in 1970, and only rows coming back prove the parameter was ignored. This
// test pins the proof rule (rows are evidence, an empty answer is not), the page's two statements and
// both exports carrying them, and the negative control — a face that applies the filter says nothing.
//
//     node --test scripts/read-face-probe.test.mjs
//
// N4：忽略了对象过滤的读面，不能冒充施加了它的读面。
//
// 代码生成器在运行时的 `/audit/logs` 之外另发一条，只收 `userId/since/isError`，既没有
// `objectType`/`objectId` 也没有 `until`。Spring 忽略处理器没声明的参数，于是带着这些参数的请求回一份更宽的
// 列表、不报错 —— 正是 0.1.18 那次复核批评的无声放宽。控制台按**行为**作答：问读面一条不可能存在的对象、
// 一个 1970 年就结束的区间；只有回行才证明那个参数被忽略了。本测试钉住这条证法（回行是证据、空答复不是）、
// 页面上的两句说明、两份导出都带上它们，以及反向控制 —— 施加了筛选的读面什么都不说。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const READ_FACE = join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/readFace.mjs')
const QUERY = join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/auditQuery.mjs')
const PAGE = 'keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue'
const PATCH = 'keelbase-ui/host-patches/0002-governance-ui.patch'

const face = await import(pathToFileURL(READ_FACE).href)
const q = await import(pathToFileURL(QUERY).href)
const { SIX_QUESTIONS } = await import(
  pathToFileURL(join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs')).href
)

const page = readFileSync(join(ROOT, PAGE), 'utf8')
const script = page.slice(page.indexOf('<script'), page.lastIndexOf('</script>'))
const template = page.slice(page.indexOf('<template>'), page.indexOf('<script'))
const patch = readFileSync(join(ROOT, PATCH), 'utf8')

const LABELS = ['Who', 'When', 'Which object', 'What it became', 'Who confirmed', 'What came of it']
const CHECK_LABELS = ['ID', ...LABELS, 'Checks']

function answers() {
  return SIX_QUESTIONS.map((key, i) => ({ key, text: `answer ${i + 1}` }))
}

test('the probe kind cannot be a business object any deployment records', () => {
  const kind = face.readFaceProbeKind('1750000000000')
  assert.ok(kind.startsWith(face.READ_FACE_PROBE_KIND), 'the probe kind lost its marker')
  assert.match(kind, /^[a-z0-9_]+$/, 'the kind word is not made of the letters, digits and underscores a kind uses')
  assert.notEqual(face.readFaceProbeKind('1'), face.readFaceProbeKind('2'), 'two page loads share a kind')
  // The window probe is before any row can exist, so an applied filter can never answer it with a row.
  assert.equal(new Date(face.READ_FACE_PROBE_UNTIL).getUTCFullYear(), 1970)
})

test('rows are the only evidence that a parameter was ignored', () => {
  assert.deepEqual(
    face.readFaceLimitsOf({ objectRows: 1, untilRows: 1 }),
    { objectFilterIgnored: true, untilIgnored: true },
  )
  assert.deepEqual(
    face.readFaceLimitsOf({ objectRows: 0, untilRows: 1 }),
    { objectFilterIgnored: false, untilIgnored: true },
    'an empty object answer must not read as "applied" or as "ignored"',
  )
})

test('an empty answer and a failed call both prove nothing, and never read as applied', () => {
  assert.deepEqual(face.readFaceLimitsOf({ objectRows: 0, untilRows: 0 }), {
    objectFilterIgnored: false,
    untilIgnored: false,
  })
  assert.equal(face.readFaceLimitsOf({ objectRows: null, untilRows: null }), null, 'a failed probe is not a verdict')
  assert.deepEqual(face.readFaceLimitsOf({ objectRows: null, untilRows: 2 }), {
    objectFilterIgnored: false,
    untilIgnored: true,
  })
  assert.equal(face.hasReadFaceLimits(null), false)
  assert.equal(face.hasReadFaceLimits({ objectFilterIgnored: false, untilIgnored: false }), false)
  assert.equal(face.hasReadFaceLimits({ objectFilterIgnored: true, untilIgnored: false }), true)
})

test('the page asks the face itself, once, and says what the answer proved', () => {
  assert.match(script, /auditApi\.logs\(\{ objectType: readFaceProbeKind\(/, 'the object probe is not asked of the face')
  assert.match(script, /objectId: '0'/, 'the object probe no longer names a key')
  assert.match(script, /until: READ_FACE_PROBE_UNTIL/, 'the window probe is not asked of the face')
  assert.match(script, /void probeReadFace\(\)/, 'the probe is never run when the page opens')
  assert.match(template, /readFaceLimits\?\.objectFilterIgnored/, 'the page does not render the object statement')
  assert.match(template, /readFaceLimits\?\.untilIgnored/, 'the page does not render the window statement')
  assert.match(template, /keelbase\.audit\.readFaceNoObject/)
  assert.match(template, /keelbase\.audit\.readFaceNoUntil/)
})

test('both exports carry the statements, and neither changes when nothing was proven', () => {
  // 两条部署级说明并进 `readFaceNote()` —— 两份导出本就带的那一行表头前注记；说明行只出现在表头之前
  // 这一处，下游 `splitCsvNotes` 不必在数据行之后另找。
  //
  // The two deployment-level statements join `readFaceNote()` — the pre-header note both exports already
  // carry; note lines live only before the header, so `splitCsvNotes` need not look past the data.
  assert.match(script, /function readFaceNote\(\): string \{[\s\S]*?readFaceNoteLines\(\)/)
  assert.match(script, /withCsvNotes\(csvText\(answerRows, labels\), \[readFaceNote\(\), scanBoundNote\(\)\]\)/)
  assert.match(script, /withCsvNotes\(checkCsvText\(entryRows, labels, t\('keelbase\.audit\.exportNote'\)\), \[\s*readFaceNote\(\),\s*scanBoundNote\(\),\s*\]\)/)

  const six = q.csvText([{ answers: answers() }], LABELS)
  assert.equal(six.trimEnd().split('\r\n').length, 2, 'the export changed on a face that applies the filter')

  const noted = q.withCsvNotes(six, ['note one'])
  const lines = noted.trimEnd().split('\r\n')
  assert.equal(lines.length, 3, 'the note did not land before the header')
  assert.equal(lines[0], '# note one', 'the note is not a comment line')
  assert.deepEqual(lines[1].split(','), LABELS, 'the header stopped being the first data line')

  const check = q.withCsvNotes(
    q.checkCsvText([{ id: 31, answers: answers(), checks: 'passed Risk level' }], CHECK_LABELS),
    ['note one', 'note two'],
  )
  const checkLines = check.trimEnd().split('\r\n')
  assert.equal(checkLines.length, 4, 'the verification export did not carry both notes')
  assert.equal(checkLines[0], '# note one')
  assert.equal(checkLines[1], '# note two')
})

test('the statements exist in both bundles and name the runtime read face', () => {
  for (const key of ['readFaceNoObject', 'readFaceNoUntil']) {
    const defined = patch.match(new RegExp(`\\+      ${key}:`, 'g')) || []
    assert.equal(defined.length, 2, `${key} is not defined once in each bundle`)
  }
  // Each key is defined in both bundles, so four statements: two per language. All of them have to point
  // at the runtime's face, or the statement names a face the reader cannot reach.
  const statements = [...patch.matchAll(/^\+        '.*(?:applies no|不施加).*',?$/gm)].map((m) => m[0])
  assert.equal(statements.length, 4, 'the statements were not found in both bundles')
  for (const line of statements) {
    assert.match(line, /GET \/audit\/logs/, `${line.slice(0, 40)}… does not point at the read face`)
  }
})
