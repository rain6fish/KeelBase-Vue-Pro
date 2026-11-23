// SPDX-License-Identifier: Apache-2.0
//
// ── English ─────────────────────────────────────────────────────────────────────
// The `N5` reading script's own criterion: **cannot read is not a pass**, and the mirrors inside the
// script must not drift from the console. This test pins the zh-CN message mirror cell for cell against
// `0002-governance-ui.patch`; the two small mapping tables against their console sources; a fixture
// shaped like the real-stack run of 2026-11-21 driving all 32 built-in self-checks; and the rule that
// no source, a missing verify, a missing ledger or an unknown execution all answer `无法取数` (exit 2)
// rather than a pass.
//
// `N5` 取数脚本的判据：**取不到 ≠ 通过**，以及脚本里的镜像表不许与控制台漂开。
//
// 这一条钉四件事 ——
//
//   ① 脚本内部的 zh-CN 词表逐字等于 `0002-governance-ui.patch` 的中文词条（六问、记录名、结局、含义、
//      六道检查、状态词、导出说明）。补丁改了词，这里先红，而不是等到验收场上屏幕与文件读起来不一样。
//   ② 两张镜像小表（工具 → 结果类型、结果类型 → 宿主模块）与控制台源码同值。
//   ③ 一份与 2026-11-21 真栈同形的夹具，在脚本里跑出 32 条自检全绿：三行、六问、哈希链、第二入口、
//      CSV 往返、内部名拒绝、自批判红、第二人判绿、缺一段即 exit 2。
//   ④ 没有来源、缺 verify、缺台账、未知 execution —— 一律 `无法取数`（exit 2），绝不写成 PASS。
//
//     node --test scripts/n5-acceptance-reading.test.mjs
//
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = process.env.KEELBASE_REPO_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')
const PATCH = join(ROOT, 'keelbase-ui/host-patches/0002-governance-ui.patch')
const SCRIPT = pathToFileURL(join(ROOT, 'scripts/n5-acceptance-reading.mjs')).href

const mod = await import(SCRIPT)
const { run, MESSAGES, TOOL_RESULT_TYPES, BUSINESS_LOG_TYPE, csvRows, fixture } = mod

const patchLines = readFileSync(PATCH, 'utf8').replace(/\r\n/g, '\n').split('\n')

/** `+      key: 'value',` 的值（去掉行尾的 `',` 或 `'`）。 / The value of one added `key: 'value'` line. */
function flatValue(key) {
  const pref = `+      ${key}: '`
  let found
  for (const line of patchLines) {
    if (!line.startsWith(pref)) continue
    const rest = line.slice(pref.length)
    const end = rest.lastIndexOf("'")
    found = rest.slice(0, end)
  }
  return found
}

/** 一个缩进层的块（props 是 `key: 'value'`），取第一个 probe 命中的。 / One indented block, first probe match. */
function block(head, childIndent, closeIndent, probe) {
  for (let i = 0; i < patchLines.length; i += 1) {
    if (patchLines[i] !== head) continue
    const kv = {}
    for (let j = i + 1; j < patchLines.length; j += 1) {
      if (patchLines[j].startsWith(closeIndent)) break
      const line = patchLines[j]
      if (!line.startsWith(childIndent)) continue
      const rest = line.slice(childIndent.length)
      const colon = rest.indexOf(':')
      if (colon < 0) continue
      const value = rest.slice(rest.indexOf(": '") + 3)
      kv[rest.slice(0, colon)] = value.slice(0, value.lastIndexOf("'"))
    }
    if (probe(kv)) return kv
  }
  return {}
}

const ZH = {
  sixQ: block('+    sixQ: {', '+      ', '+    }', (v) => v.who === '谁'),
  record: block('+    record: {', '+      ', '+    }', (v) => v.crm_customer === '客户'),
  meaning: block('+    meaning: {', '+      ', '+    }', (v) => v.executed?.startsWith('真的')),
  check: block('+      check: {', '+        ', '+      }', (v) => v.risk_policy?.includes('风险级')),
  outcome: block('+      outcome: {', '+        ', '+      }', (v) => v.executed === '已执行'),
}

test('the zh-CN message mirror matches the patch cell for cell', () => {
  const groups = [
    ['keelbase.sixQ.', ZH.sixQ],
    ['keelbase.record.', ZH.record],
    ['keelbase.meaning.', ZH.meaning],
    ['keelbase.audit.check.', ZH.check],
    ['keelbase.vocab.outcome.', ZH.outcome],
  ]
  for (const [prefix, source] of groups) {
    // Both directions: every message the script uses must exist in that block, and match verbatim.
    // 两个方向都查：脚本用到的每个词条都必须在补丁那个块里，且逐字相同。
    for (const messageKey of Object.keys(MESSAGES).filter((key) => key.startsWith(prefix))) {
      const short = messageKey.slice(prefix.length)
      assert.ok(short in source, `${messageKey} 不在补丁的对应块里`)
      assert.equal(MESSAGES[messageKey], source[short], `${messageKey} 与补丁里的中文词条不一致`)
    }
  }
  for (const [key, messageKey] of [
    ['statusOk', 'keelbase.audit.statusOk'],
    ['statusError', 'keelbase.audit.statusError'],
    ['checkPassed', 'keelbase.audit.checkPassed'],
    ['checkFailed', 'keelbase.audit.checkFailed'],
    ['checkUnregistered', 'keelbase.audit.checkUnregistered'],
    ['checksNotRecorded', 'keelbase.audit.checksNotRecorded'],
    ['exportNote', 'keelbase.audit.exportNote'],
    ['statePresent', 'keelbase.effects.statePresent'],
    ['stateDeleted', 'keelbase.effects.stateDeleted'],
    ['stateGone', 'keelbase.effects.stateGone'],
  ]) {
    assert.equal(MESSAGES[messageKey], flatValue(key), `${messageKey} 与补丁里的中文词条不一致`)
  }
})

test('the two mirror tables match their console sources', () => {
  const recordNames = readFileSync(join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/recordNames.ts'), 'utf8')
  for (const [tool, type] of Object.entries(TOOL_RESULT_TYPES)) {
    assert.match(
      recordNames,
      new RegExp(`\\b${tool}: '${type}'`),
      `recordNames.ts 里没有 ${tool}: '${type}' —— 脚本的表与它漂开了`,
    )
  }
  const table = readFileSync(join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/businessLogTypes.mjs'), 'utf8')
  for (const [type, hostName] of Object.entries(BUSINESS_LOG_TYPE)) {
    assert.match(table, new RegExp(`\\b${type}: '${hostName}'`), `businessLogTypes.mjs 里没有 ${type}: '${hostName}'`)
  }
})

test('the built-in self-test runs all its checks and is green', async () => {
  const lines = []
  const result = await run(['--self-test'], { out: (line) => lines.push(line) })
  assert.equal(result.exitCode, 0, `自检没有全绿：\n${lines.join('\n')}`)
  const tail = lines.join('\n')
  assert.match(tail, /自检：38\/38 通过/)
  // 反向可证：自批那一条必须真的判红过，否则“全绿”只是没测到。
  assert.match(tail, /PASS\s+自批：R1b FAIL 且点名同一人/)
  assert.match(tail, /PASS\s+断链：R3 FAIL/)
})

test('no source is a cannot-read, never a pass', async () => {
  const lines = []
  const result = await run(['--execution', 'e-n5'], { out: (line) => lines.push(line) })
  assert.equal(result.exitCode, 2)
  assert.match(lines.join('\n'), /无法取数/)
})

test('a snapshot missing verify, ledger, or business log reports cannot-read', async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'n5-test-'))
  try {
    for (const [name, mutate, criterion] of [
      ['noverify', (p) => { delete p.verify }, /^R3\s.*无法取数/m],
      ['noeffects', (p) => { delete p.effects }, /^R2\s.*无法取数/m],
      ['nobiz', (p) => { delete p.businessLog }, /^R4\s.*无法取数/m],
      ['nochain', (p) => { p.verify = { valid: true, checked: 4, brokenIndex: null } }, /^R3\s.*无法取数/m],
    ]) {
      const payload = fixture({ approverId: '2', creds: { 1: 'KeelBase', 2: '张三' } })
      mutate(payload)
      const file = join(dir, `${name}.json`)
      writeFileSync(file, JSON.stringify(payload))
      const lines = []
      const result = await run(['--execution', 'e-n5', '--snapshot', file], { out: (line) => lines.push(line) })
      const text = lines.join('\n')
      assert.equal(result.exitCode, 2, `${name}: exit=${result.exitCode}`)
      assert.match(text, criterion, `${name}: 那一条没有说无法取数\n${text}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an unknown execution says so instead of passing', async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'n5-test-'))
  try {
    const file = join(dir, 'f.json')
    writeFileSync(file, JSON.stringify(fixture()))
    const lines = []
    const result = await run(['--execution', 'nope', '--snapshot', file], { out: (line) => lines.push(line) })
    assert.equal(result.exitCode, 2)
    assert.match(lines.join('\n'), /无法取数/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the report composes the six cells in the console’s words', async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'n5-test-'))
  try {
    const file = join(dir, 'f.json')
    writeFileSync(file, JSON.stringify(fixture({ approverId: '2', creds: { 1: 'KeelBase', 2: '张三' } })))
    const lines = []
    const result = await run(['--execution', 'e-n5', '--snapshot', file], { out: (line) => lines.push(line) })
    assert.equal(result.exitCode, 0)
    const text = lines.join('\n')
    assert.match(text, /谁\s+KeelBase（账号 #1）/)
    assert.match(text, /哪个业务对象\s+客户 · #1 · 修\*\*\*\* · 还在/)
    assert.match(text, /改成什么（改前 → 改后）\s+改前: 客户名称 n\*\*\*\* · 客户等级 — · 客户来源 — · 已成交 ✗ · 已跟进 ✗; 改后: 客户名称 n\*\*\*\* → 修\*\*\*\* — 宿主现在的记录，不是写入那一刻的快照; 运行时没有记下的值，这里不替它补/)
    assert.match(text, /谁确认\s+张三 批准了这次写（第二人，不是操作者本人）/)
    assert.match(text, /结果\s+已执行 · 真的执行了，写已经在系统里/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('path B reports the known wording instead of failing the row', async () => {
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'n5-test-'))
  try {
    const payload = fixture({ approverId: '2', creds: { 1: 'KeelBase', 2: '张三' } })
    for (const row of payload.rows) {
      if (row.authorization) {
        row.authorization = row.authorization.replaceAll('"riskStrategy":"human_approval"', '"riskStrategy":"confirmation"')
      }
    }
    const file = join(dir, 'pathb.json')
    writeFileSync(file, JSON.stringify(payload))
    const lines = []
    const result = await run(['--execution', 'e-n5', '--snapshot', file], { out: (line) => lines.push(line) })
    const text = lines.join('\n')
    assert.equal(result.exitCode, 0, text)
    assert.match(text, /方案 B 的已知口径/)
    assert.match(text, /KeelBase 确认了这次写（本人确认；客户端未记）/)
    assert.match(text, /张三 批准了这次写（这一行本身就是这次裁决/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('csvRows keeps quoted commas and newlines inside one cell', () => {
  const parsed = csvRows('a,"b,c",d\r\n"x\r\ny",z\r\n')
  assert.deepEqual(parsed, [['a', 'b,c', 'd'], ['x\r\ny', 'z']])
})

/** Put one note line in front of a file's body, keeping its BOM. */
async function prependNote(path, note) {
  const { readFileSync: read, writeFileSync: write } = await import('node:fs')
  const bom = Buffer.from([0xef, 0xbb, 0xbf])
  const buf = read(path)
  const body = buf[0] === 0xef ? buf.subarray(3) : buf
  write(path, Buffer.concat([bom, Buffer.from(`${note}\r\n`, 'utf8'), body]))
}

async function exportAndMutate(mutate) {
  const { mkdtempSync, writeFileSync: write } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'n5-note-'))
  const file = join(dir, 'f.json')
  write(file, JSON.stringify(fixture({ approverId: '2', creds: { 1: 'KeelBase', 2: '张三' } })))
  const outDir = join(dir, 'out')
  const first = await run(['--execution', 'e-n5', '--snapshot', file, '--out', outDir], { out: () => {} })
  assert.equal(first.exitCode, 0, 'the export itself must be green')
  const [six, check] = first.csvPaths
  await mutate(six, check)
  const lines = []
  const second = await run(
    ['--execution', 'e-n5', '--snapshot', file, '--csv', six, '--check-csv', check],
    { out: (line) => lines.push(line) },
  )
  return { dir, result: second, text: lines.join('\n') }
}

test('both CSVs may open with a leading note line, and the data still reads green', async () => {
  // The 2026-11-21 dry run: the verification CSV opens with the product's `#` note and the checker took
  // it as the header. The same shape is put on **both** files here (the six-column one can also carry a
  // note when the scan hits its bound); R5 / R6 must still read the data, not the note.
  //
  // 2026-11-21 预演：核对 CSV 首行是产品写的一句 `#` 说明，机检把它当表头。这里把同一形状补到**两份**
  // 文件上（六列那份在生产也可能因扫到上限带说明），R5 / R6 都必须照常读数据行，而不是把说明当表头。
  const { rmSync } = await import('node:fs')
  const { dir, result, text } = await exportAndMutate(async (six, check) => {
    await prependNote(six, '# 已扫到上限：本文件只含扫描覆盖的那一段')
    await prependNote(check, '# 相关、非硬链接：两条轨之间没有共享编号')
  })
  try {
    assert.equal(result.exitCode, 0, `说明行打断了解析：\n${text}`)
    assert.match(text, /^R5\b.*\bPASS\b/m, `六列那份没有照常读：\n${text}`)
    assert.match(text, /^R6\b.*\bPASS\b/m, `八列那份没有照常读：\n${text}`)
    assert.match(text, /带相关说明行/, 'R6 没有记下说明行')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an object search that picks up the held row still answers its third question', async () => {
  // The 2026-11-22 N5 rehearsal: an object search also matches the same operation's held row (about 14 s
  // before the approval, no executionId). That row records no object itself, but the proposal in the
  // confirmation record (`arguments.id`) is the object it was about, and the page answers its third
  // question from it. The script used to hand the **raw confirmation record** to `composeSix`, whose
  // object cell wants the proposal's `(type, key)`; it then read 「未记录」 and R2 went red where the
  // page was right. This pins the two answers together.
  //
  // 2026-11-22 N5 真栈彩排：按对象检索会把同一次操作的「待决」行一并命中（它比批准行早约 14 秒、没有
  // executionId）。这一行自己没记对象，但确认记录里的提议（`arguments.id`）就是它当时的对象 —— 页面据此
  // 答得出第三格。脚本曾把**原始确认记录**交给 `composeSix`，而那一格要的是提议指向的 `(类型, 主键)`，
  // 于是脚本读成「未记录」、R2 判红，而页面并无此问题。这里钉住两者同答。
  const { mkdtempSync, rmSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'n5-object-'))
  try {
    const payload = fixture({ approverId: '2', creds: { 1: '陈晓', 2: '李静' } })
    payload.confirmations = [{
      id: 5, toolName: 'update_crm_customer', userId: '1', status: 'approved',
      arguments: { id: 1 }, createdAt: '2026-11-21T02:24:33.000Z', decidedAt: '2026-11-21T02:24:49.000Z',
    }]
    const file = join(dir, 'object.json')
    writeFileSync(file, JSON.stringify(payload))
    const lines = []
    const result = await run(
      ['--object', 'crm_customer:1', '--since', '2026-11-21T02:24:00.000Z', '--snapshot', file],
      { out: (line) => lines.push(line) },
    )
    const text = lines.join('\n')
    assert.equal(result.exitCode, 0, `待决行让对象检索判红了：\n${text}`)
    assert.match(text, /^R2\b.*\bPASS\b.*4 行 × 6 格/m, `R2 没有按四行全答：\n${text}`)
    assert.match(text, /#28\s+待决/, '选区里没有待决行，夹具没有复现彩排的形状')
    const sixBlock = text.slice(text.indexOf('-- 六问逐格'))
    const pending = sixBlock.slice(sixBlock.indexOf('  #28'), sixBlock.indexOf('  #28') + 400)
    assert.match(
      pending,
      /哪个业务对象\s+客户 · #1 · 修\*\*\*\*/,
      `待决行的第三格没有从提议读出对象：\n${pending}`,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a note line does not excuse a genuinely wrong header', async () => {
  // Negative: the note may be skipped, but the header after it must still match cell for cell. The
  // header's first cell is changed; both files must go red rather than pass on the skipped note.
  //
  // 反例：说明行可以跳过，但跳过之后表头仍要逐字对得上。把表头第一格改错，两份都必须判红。
  const { rmSync } = await import('node:fs')
  const { dir, result, text } = await exportAndMutate(async (six, check) => {
    const { readFileSync: read, writeFileSync: write } = await import('node:fs')
    for (const path of [six, check]) {
      await prependNote(path, '# 说明')
      const buf = read(path)
      const lines = buf.subarray(3).toString('utf8').split('\r\n') // BOM removed
      const headerLine = lines.find((line) => line.startsWith('谁,') || line.startsWith('编号,'))
      assert.ok(headerLine, 'the fixture has no header line to break')
      lines[lines.indexOf(headerLine)] = headerLine.replace(/^[^,]+,/, '错误表头,')
      write(path, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(lines.join('\r\n'), 'utf8')]))
    }
  })
  try {
    assert.equal(result.exitCode, 1, `坏表头被说明行掩盖了：\n${text}`)
    assert.match(text, /^R5\b.*\bFAIL\b/m, `六列坏表头没有判红：\n${text}`)
    assert.match(text, /^R6\b.*\bFAIL\b/m, `八列坏表头没有判红：\n${text}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
