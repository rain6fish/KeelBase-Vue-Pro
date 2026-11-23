#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// The ledger's `targetExists` must answer from the host's real records: every result type the host
// **writes and can read back** must have a target probe and a record-name probe. Compensator types are
// part of that set; the seven CRM write kinds added on 2026-11-22 have no compensator (not revocable) but
// do write into the host's operate log with a real record id, so they need probes too — otherwise the
// ledger and the six questions draw existing records as "gone".
//
// Why this check exists: the runtime's `EffectController.view()` only knows its own `follow_up`, so
// every host result type (`crm_customer`, ...) reached it as `targetExists=false` and the console drew
// them all as "no longer there". The host-side `YudaoEffectTargetExistence` corrects the field from
// each module's mapper; if a type gains a write and the probe does not, that class of write goes back to
// lying. This check reads the sources, confirms that every **compensator or proven host-written type**
// has a probe, that names and probes come from the same table, and pins the three rules — only
// `/ai/tool-effects`, before the envelope advice, and a failed read changes nothing.
//
//   node scripts/check-effect-target-existence.mjs
//
// 台账的 `targetExists` 必须按宿主真实记录回答：每个**本宿主写得出、且读得回来**的结果类型，都要有同名
// 的目标探针与记录名探针。补偿器类型是其中一部分；2026-11-22 扩进来的七类 CRM 写没有补偿器（不可撤销），
// 但它们写进了操作日志、有真实记录 id，故同样必须有探针 —— 否则台账与六问会把存在的记录画成「已不在」。
//
// 为什么需要这道检查：运行时的 `EffectController.view()` 只认它自己的 `follow_up`，宿主结果类型
// （`crm_customer` 等）一律得到 `targetExists=false`，页面于是把它们都画成「已不在」。宿主侧新增的
// `YudaoEffectTargetExistence` 在出口处按模块 mapper 更正这个字段；一旦加了新类型而探针没跟上，
// 那一类写就会再次误报。本检查读源码，确认**补偿器 ∪ 已证宿主写类型**都有探针、名字与探针出自同一张表，
// 并钉住「只在 `/ai/tool-effects` 上、在信封 advice 之前、读失败不改答案」这三条。

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const PACKAGE = join(ROOT, 'yudao-server', 'src', 'main', 'java', 'cn', 'iocoder', 'yudao', 'server', 'keelbase')
const COMPENSATORS = join(PACKAGE, 'YudaoLocalCompensators.java')
const ADVICE = join(
  ROOT, 'yudao-server', 'src', 'main', 'java', 'cn', 'iocoder', 'yudao', 'server', 'keelbase',
  'YudaoEffectTargetExistence.java',
)

const failures = []
const fail = (message) => failures.push(message)
const read = (file) => {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    fail(`missing ${file}`)
    return ''
  }
}

// 补偿器**随模块走**（YD-44）：除 `YudaoLocalCompensators` 外，一个模块还可以在自己的
// `*Governance.java` 里声明补偿器。故按**声明**找 —— 凡实现了 `SideEffectCompensator` 的文件都读，
// 而不是只读那一个文件；工具类也声明 `resultType()`，**不**能按方法名收进来。
//
// A compensator **travels with its module** (YD-44): besides `YudaoLocalCompensators`, a module may
// declare one in its own `*Governance.java`. So the files are found by **declaration** — every file
// implementing `SideEffectCompensator` is read, not just that one — while the tool classes, which also
// declare `resultType()`, must not be collected by method name.
const compensatorFiles = readdirSync(PACKAGE)
  .filter((name) => name.endsWith('.java'))
  .map((name) => join(PACKAGE, name))
  .filter((file) => {
    try {
      return readFileSync(file, 'utf8').includes('implements SideEffectCompensator')
    } catch {
      return false
    }
  })
if (compensatorFiles.length === 0) fail(`没有找到任何 SideEffectCompensator 声明（${PACKAGE}）`)

const compensators = compensatorFiles.map(read).join('\n')
const advice = read(ADVICE)

// The probes and the name face cover every result type the host **writes and can read back**, not only the
// compensable ones. Since 2026-11-22 the two questions are separate: seven CRM write kinds reach the host's
// operate log and have a real record id, yet have **no** compensator (they are not revocable); they still
// need a probe and a name, or the ledger and the six questions draw existing records as "gone" / "name not
// registered". The list of proven host-written types is the interface-side `businessLogTypes.mjs`, itself
// held to the host sources by the three-step evidence chain (`@LogRecord`'s bizNo, the tool's resultType,
// and the same id coming back from the tool).
//
// 探针与记录名覆盖的是「本宿主写得出来、且读得回来」的结果类型，不只是「可撤销」的那些。
// 两件事自 2026-11-22 起分开：CRM 的七类写进了操作日志、有真实记录 id，却**没有**补偿器（不可撤销）；
// 它们仍然必须有探针与名字，否则台账与六问会把存在的记录画成「已不在 / 未登记名称」。
// 这张「已证宿主写类型」的清单取自界面侧 `businessLogTypes.mjs` —— 它本身就是按宿主源码三步证据链
// （`@LogRecord` 的 bizNo、工具 resultType、工具回传同一 id）核对出来的。
const NAMES = join(PACKAGE, 'YudaoRecordNames.java')
const named = new Set([...read(NAMES).matchAll(/found\.put\("([^"]+)"/g)].map((match) => match[1]))
if (named.size === 0) fail('记录名那条面没有读到任何类型（源码形状变了？）')

const MAPPED = join(ROOT, 'keelbase-ui', 'host-overlay', 'src', 'keelbase', 'businessLogTypes.mjs')
const mapped = new Set([...read(MAPPED).matchAll(/^\s+(crm_[a-z_]+):\s*'/gm)].map((match) => match[1]))
if (mapped.size === 0) fail('没有读到任何已证宿主写类型（businessLogTypes.mjs 形状变了？）')

const resultTypes = (source) =>
  [...source.matchAll(/resultType\s*\(\)\s*\{\s*return\s+"([^"]+)"/g)].map((match) => match[1])

const compensated = new Set(resultTypes(compensators))
const probed = new Set([...advice.matchAll(/found\.put\("([^"]+)"/g)].map((match) => match[1]))

for (const type of compensated) {
  if (!probed.has(type)) {
    fail(`补偿器认识 "${type}"，但台账探针没有它 —— 这一类写会再次显示「已不在」`)
  }
}
for (const type of mapped) {
  if (!probed.has(type)) {
    fail(`已证宿主写类型 "${type}" 没有台账探针 —— 存在的记录会被画成「已不在」`)
  }
  if (!named.has(type)) {
    fail(`已证宿主写类型 "${type}" 没有记录名探针 —— 有名字的记录会写成「未登记名称」`)
  }
}
for (const type of probed) {
  if (!compensated.has(type) && !mapped.has(type)) {
    fail(`台账探针认识 "${type}"，但既没有补偿器也不是已证宿主写类型 —— 它在回答一个本宿主不写的类型`)
  }
}
for (const type of named) {
  if (!probed.has(type)) {
    fail(`记录名那条面认识 "${type}"，但台账探针不认识它 —— 名字与存在性必须出自同一张表`)
  }
}

if (compensated.size === 0 || probed.size === 0) {
  fail('没有读到任何结果类型（源码形状变了？）')
}

if (!/EFFECTS_PATH\s*=\s*"\/ai\/tool-effects"/.test(advice)) {
  fail('探针没有钉在 `/ai/tool-effects` 上')
}
if (!/@Order\s*\(\s*Ordered\.HIGHEST_PRECEDENCE\s*\)/.test(advice)) {
  fail('探针必须排在运行时信封 advice 之前，否则正文已是信封')
}
if (!/row\.put\("targetExists",\s*exists\)/.test(advice)) {
  fail('探针没有把真实存在性写回 targetExists')
}
if (!/probe\s*==\s*null[\s\S]*?return;/.test(advice)) {
  fail('未知结果类型必须原样保留运行时的答案')
}
if (!/catch\s*\(RuntimeException[\s\S]*?return;/.test(advice)) {
  fail('读失败必须保留运行时的答案，不能把一次故障写成「已不在」')
}

if (failures.length > 0) {
  console.error(`check-effect-target-existence: ${failures.length} failed`)
  for (const message of failures) console.error(`  FAIL ${message}`)
  process.exit(1)
}

console.log(`check-effect-target-existence: ${probed.size} probed types, 0 failed`)
