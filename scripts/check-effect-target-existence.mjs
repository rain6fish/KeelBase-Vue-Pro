#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 台账的 `targetExists` 必须按宿主真实记录回答：每个宿主补偿器认识的结果类型，都要有同名的目标探针。
//
//   node scripts/check-effect-target-existence.mjs
//
// 为什么需要这道检查：运行时的 `EffectController.view()` 只认它自己的 `follow_up`，宿主结果类型
// （`crm_customer` 等）一律得到 `targetExists=false`，页面于是把它们都画成「已不在」。宿主侧新增的
// `YudaoEffectTargetExistence` 在出口处按模块 mapper 更正这个字段；一旦补偿器加了新类型而探针没跟上，
// 那一类写就会再次误报。本检查读两份源码，确认两边的类型集合相同，并钉住「只在 `/ai/tool-effects`
// 上、在信封 advice 之前、读失败不改答案」这三条。
//
// English:
//
// The ledger's `targetExists` must answer from the host's real records: every result type a host
// compensator knows must have a probe of the same name.
//
// Why this check exists: the runtime's `EffectController.view()` only knows its own `follow_up`, so
// every host result type (`crm_customer`, ...) reached it as `targetExists=false` and the console drew
// them all as "no longer there". The host-side `YudaoEffectTargetExistence` corrects the field from
// each module's mapper; if a compensator gains a type and the probe does not, that class of write goes
// back to lying. This check reads both sources, confirms the two type sets are equal, and pins the
// three rules — only `/ai/tool-effects`, before the envelope advice, and a failed read changes nothing.

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

// 记录名那条窄读面（`YudaoRecordNames`）按同一张封闭表作答，故它的类型集合必须是补偿器类型集合的**子集**：
// 一个没有补偿器的类型意味着本宿主不产出它，那条面不该认得它。子集而不是相等 —— 说得出名字的类型可以更少
// （说不出名字的那几种不在表里，那一格回落到类型与主键）。
//
// The record-name face (`YudaoRecordNames`) answers from the same closed table, so its type set must be a
// **subset** of the compensator types: a type with no compensator is one this host never produces, and that
// face must not know it. A subset, not an equality — the named types may be fewer (a type this class cannot
// name is absent from the table, and the cell falls back to the type and the key).
const NAMES = join(PACKAGE, 'YudaoRecordNames.java')
const named = new Set([...read(NAMES).matchAll(/found\.put\("([^"]+)"/g)].map((match) => match[1]))
if (named.size === 0) fail('记录名那条面没有读到任何类型（源码形状变了？）')

const resultTypes = (source) =>
  [...source.matchAll(/resultType\s*\(\)\s*\{\s*return\s+"([^"]+)"/g)].map((match) => match[1])

const compensated = new Set(resultTypes(compensators))
const probed = new Set([...advice.matchAll(/found\.put\("([^"]+)"/g)].map((match) => match[1]))

for (const type of compensated) {
  if (!probed.has(type)) {
    fail(`补偿器认识 "${type}"，但台账探针没有它 —— 这一类写会再次显示「已不在」`)
  }
}
for (const type of probed) {
  if (!compensated.has(type)) {
    fail(`台账探针认识 "${type}"，但没有补偿器产出它 —— 探针在回答一个本宿主不写的类型`)
  }
}

for (const type of named) {
  if (!compensated.has(type)) {
    fail(`记录名那条面认识 "${type}"，但没有补偿器产出它 —— 它在给一个本宿主不写的类型配名字`)
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
