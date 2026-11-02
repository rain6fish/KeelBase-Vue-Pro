#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 部署范围里每个业务 service 都在账本里有一个姿态，且账本说的就是源码里的样子。
//
//   node scripts/check-governance-coverage.mjs                  # 放行 gap（账本本就是拿来暴露缺口的）
//   node scripts/check-governance-coverage.mjs --require-full   # 零 gap 才算「完全接入」
//   node scripts/check-governance-coverage.mjs --module crm     # 只看一个模块（其余的仍然校验）
//   node scripts/check-governance-coverage.mjs --ledger <path>  # 换一份账本（反向可证用）
//
// **为什么要有这道门。** `check-governance-registry.mjs` 回答的是「已声明的路径合法吗」，它**回答不了**
// 「某个模块本该被治理、却没有」——登记处只会数自报的那些，载体没自报的路径**就是不在**。于是「CRM 有没有
// 完全接入」这个问题，此前只能靠人读源码回答。本门把它变成一次对账：源码枚举出的 service 集合 与 账本的
// 行集合 必须相等，且每一行的姿态要能被源码证伪。
//
// ## 射程
//
// **部署范围** = `yudao-server/pom.xml` 里未注释的 `yudao-module-*` 依赖，加上它们自己 pom 里的同类依赖
// （传递闭包）。不按目录猜：仓里有 20 个模块目录，jar 里只有 7 个，而「哪个进 jar」由 pom 说了算。
// 外加 `yudao-server` 自己的 `src/main/java`（生成的 `products` 业务面住在这里）。
//
// 射程里每个 `*/service/**/*Service.java`（**不含** `*ServiceImpl.java`）都是账本必须覆盖的一行。
//
// ## 四态与各自的判据
//
//   seam       切面点切**点名**它：某个 `*Governance.java` 里出现 `execution(* <FQCN>.`。缺 ⇒ 红。
//   tool-only  只有工具面经引擎；理由、负责人、复核日期必填。本门核不了「真经过引擎」，那由场景门证。
//   gap        未接入、已排期；理由、负责人、目标日期必填，**过期即红**（排期不是免死金牌）。
//   exempt     明确不接；理由、负责人、复核日期必填，**过期即红**。
//
// 另外三类红：源码里有 service 而账本没有（**未分类**）、账本点名了部署范围外的 service 或模块、
// 同一 service 出现两行、某一行的列数不对。
//
// ## 反向可证（本门的自检）
//
//   * 删掉一行 ⇒ 未分类；* 把某个非受治理的 service 改成 `seam` ⇒ 「没有切面点名它」；
//   * 把某行复核日期改成过去 ⇒ 过期；* `--require-full` 在仍有 gap 时 ⇒ 红。
//
// The gate that makes "fully onboarded" a countable state, not an opinion.
//
// `check-governance-registry.mjs` answers "is every *declared* path legal?"; it cannot answer "was a module
// that should have been governed left out?" — the registry counts what declares itself, and a path whose
// carrier never declares is simply absent. This gate closes that hole by reconciling two sets: the services
// enumerated from the sources of the **deployed** scope, and the rows of `conformance/governance-coverage.tsv`.
//
// Deployed scope = the uncommented `yudao-module-*` dependencies of `yudao-server/pom.xml`, plus the transitive
// closure through each module's own pom. Not guessed from directories: the checkout has 20 module folders and
// the jar carries 7, and the pom is what decides. `yudao-server`'s own sources are in scope too (the generated
// `products` face lives there).
//
// Four postures, each with its own rule: `seam` (an aspect pointcut names the service), `tool-only` (engine-
// governed through the tool face only; reason, owner, recheck required), `gap` (scheduled; reason, owner, target
// date required, **overdue is red**), `exempt` (deliberately out; reason, owner, recheck required, **overdue is
// red**). Also red: an unclassified service, a row naming a service outside the deployed scope, a duplicate row,
// or a row that does not have eight columns.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_LEDGER = join(ROOT, 'conformance/governance-coverage.tsv')
const SERVER_POM = join(ROOT, 'yudao-server/pom.xml')
const KEELBASE = join(ROOT, 'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase')
const POSTURES = new Set(['seam', 'tool-only', 'gap', 'exempt'])
const COLUMNS = ['module', 'object', 'service', 'posture', 'evidence', 'reason', 'owner', 'recheck']

const argv = process.argv.slice(2)
const argOf = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : null
}
const LEDGER = argOf('--ledger') ?? DEFAULT_LEDGER
const ONLY_MODULE = argOf('--module')
const REQUIRE_FULL = argv.includes('--require-full')
// Local calendar date: a recheck date is a human's promise, and "today" should be the human's day.
const TODAY = new Date().toLocaleDateString('sv-SE')

// ---- deployed scope ------------------------------------------------------------------------------
/** A pom with its comments removed — a commented-out dependency is not a dependency. */
const uncommented = (xml) => xml.replace(/<!--[\s\S]*?-->/g, '')
const moduleArtifacts = (xml) =>
  [...uncommented(xml).matchAll(/<artifactId>(yudao-module-[a-z0-9-]+)<\/artifactId>/g)].map((m) => m[1])
const moduleDir = (name) => join(ROOT, `yudao-module-${name}`)

const deployed = new Set()
const queue = moduleArtifacts(readFileSync(SERVER_POM, 'utf8')).map((a) => a.replace(/^yudao-module-/, ''))
while (queue.length > 0) {
  const name = queue.pop()
  if (deployed.has(name) || !existsSync(moduleDir(name))) continue
  deployed.add(name)
  const pom = join(moduleDir(name), 'pom.xml')
  if (existsSync(pom)) queue.push(...moduleArtifacts(readFileSync(pom, 'utf8')).map((a) => a.replace(/^yudao-module-/, '')))
}

// ---- what the sources say should be covered -------------------------------------------------------
const walk = (dir, out = []) => {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

/** module segment -> absolute source root. `server` holds the generated faces; the rest are modules. */
const roots = [...deployed].sort().map((m) => [m, join(moduleDir(m), 'src/main/java')])
roots.push(['server', join(ROOT, 'yudao-server/src/main/java')])

const inScope = [] // { module, fqcn, file }
for (const [module, root] of roots) {
  for (const file of walk(root)) {
    if (!file.endsWith('Service.java') || file.endsWith('ServiceImpl.java')) continue
    const rel = relative(root, file).split('\\').join('/')
    if (!rel.includes('/service/')) continue
    inScope.push({ module, fqcn: rel.replace(/\.java$/, '').replace(/\//g, '.'), file })
  }
}

/** Every `@Around` pointcut text in this host's own governance tree, as one string per file. */
const adviceTexts = walk(KEELBASE)
  .filter((f) => f.endsWith('.java'))
  .map((f) => readFileSync(f, 'utf8'))
const namesService = (fqcn) => adviceTexts.some((t) => t.includes(`execution(* ${fqcn}.`))

// ---- the ledger -----------------------------------------------------------------------------------
const problems = []
const red = (message) => problems.push(message)

const ledgerLines = readFileSync(LEDGER, 'utf8').split(/\r?\n/)
const rows = []
let lineNo = 0
for (const line of ledgerLines) {
  lineNo += 1
  if (line.trim() === '' || line.startsWith('#')) continue
  const cols = line.split('\t')
  if (cols.length !== COLUMNS.length) {
    red(`第 ${lineNo} 行有 ${cols.length} 列，应为 ${COLUMNS.length} 列 / line ${lineNo} has ${cols.length} columns, expected ${COLUMNS.length}`)
    continue
  }
  const [module, object, service, posture, evidence, reason, owner, recheck] = cols
  rows.push({ module, object, service, posture, evidence, reason, owner, recheck, lineNo })
}

const byService = new Map()
for (const row of rows) {
  if (byService.has(row.service)) red(`${row.service} 出现两行（第 ${byService.get(row.service).lineNo} 与 ${row.lineNo} 行） / listed twice`)
  byService.set(row.service, row)
  if (!POSTURES.has(row.posture)) {
    red(`${row.service}: 未知姿态 \`${row.posture}\` / unknown posture`)
    continue
  }
  const needs = (field, value, why) => {
    if (!value.trim()) red(`${row.service}（${row.posture}）缺 ${field} / missing ${field}: ${why}`)
  }
  const needsDate = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.recheck)) {
      red(`${row.service}（${row.posture}）的 ${row.recheck || 'recheck'} 不是 YYYY-MM-DD / not a date`)
    } else if (row.recheck < TODAY) {
      red(`${row.service}（${row.posture}）的日期 ${row.recheck} 已过（今天 ${TODAY}） / overdue`)
    }
  }
  if (row.posture === 'seam') {
    needs('evidence', row.evidence, '切面类名')
    if (row.evidence.trim() && !namesService(row.service)) {
      red(`${row.service} 标着 seam，但没有任何 *Governance 的点切点名它 / no advice names this service`)
    }
  }
  if (row.posture === 'tool-only') {
    needs('evidence', row.evidence, '工具名')
    needs('reason', row.reason, '为什么只有工具面')
    needs('owner', row.owner, '负责人')
    needsDate()
  }
  if (row.posture === 'gap' || row.posture === 'exempt') {
    needs('reason', row.reason, '理由')
    needs('owner', row.owner, '负责人')
    needsDate()
  }
}

// Every service in scope has a row; every row names a service in scope.
const scopeByFqcn = new Map(inScope.map((s) => [s.fqcn, s]))
for (const s of inScope) {
  if (!byService.has(s.fqcn)) red(`${s.module}: ${s.fqcn} 未分类 / unclassified service in the deployed scope`)
}
for (const row of rows) {
  if (!scopeByFqcn.has(row.service)) {
    red(`${row.module}: 账本点名了 ${row.service}，它不在部署范围的 service 里 / names a service outside the deployed scope`)
  }
}
const modulesInScope = new Set(inScope.map((s) => s.module))
for (const m of modulesInScope) {
  if (!rows.some((r) => r.module === m)) red(`${m}: 部署模块在账本里没有任何一行 / deployed module has no ledger section`)
}
const modulesInLedger = new Set(rows.map((r) => r.module))
for (const m of modulesInLedger) {
  if (!modulesInScope.has(m)) red(`${m}: 账本里有这一模块，但部署范围里没有 / ledger names a module outside the deployed scope`)
}

// ---- report ---------------------------------------------------------------------------------------
const counts = (module) => {
  const r = rows.filter((x) => x.module === module && (!ONLY_MODULE || module === ONLY_MODULE))
  return { total: r.length, seam: r.filter((x) => x.posture === 'seam').length, 'tool-only': r.filter((x) => x.posture === 'tool-only').length, gap: r.filter((x) => x.posture === 'gap').length, exempt: r.filter((x) => x.posture === 'exempt').length }
}

const shown = [...modulesInScope].filter((m) => !ONLY_MODULE || m === ONLY_MODULE).sort()
console.log('module'.padEnd(14) + ['services', 'seam', 'tool-only', 'gap', 'exempt'].map((h) => h.padStart(11)).join(''))
for (const m of shown) {
  const c = counts(m)
  console.log(m.padEnd(14) + [c.total, c.seam, c['tool-only'], c.gap, c.exempt].map((n) => String(n).padStart(11)).join(''))
}
const picked = rows.filter((r) => !ONLY_MODULE || r.module === ONLY_MODULE)
const totals = ['seam', 'tool-only', 'gap', 'exempt'].map((p) => picked.filter((r) => r.posture === p).length)
console.log(`\n合计 ${picked.length} 个 service · seam ${totals[0]} · tool-only ${totals[1]} · gap ${totals[2]} · exempt ${totals[3]} / total ${picked.length} services`)
if (totals[2] > 0) {
  const gaps = picked.filter((r) => r.posture === 'gap')
  const byModule = new Map()
  for (const g of gaps) byModule.set(g.module, [...(byModule.get(g.module) || []), g.object])
  console.log('\n未接入（gap）：')
  for (const [m, objs] of [...byModule].sort()) console.log(`  ${m}: ${objs.join(', ')}`)
}

if (REQUIRE_FULL && totals[2] > 0) red(`${totals[2]} 个 service 仍为 gap —— --require-full 要求零 gap / ${totals[2]} gap(s) remain under --require-full`)

if (problems.length > 0) {
  console.error('\nRED:')
  for (const p of problems) console.error(`  ${p}`)
  console.error(`\n${problems.length} 个问题 / ${problems.length} problem(s)`)
  process.exit(1)
}
console.log('\n账本与源码一致（gap 放行）/ the ledger matches the sources (gaps allowed)')
