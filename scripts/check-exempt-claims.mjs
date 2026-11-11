#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 账本里每一行 `exempt` 的理由，都必须是一句**机器能证伪的断言**；本门逐条去证伪它。
//
//   node scripts/check-exempt-claims.mjs                       # 对现行账本
//   node scripts/check-exempt-claims.mjs --ledger <path>       # 换一份账本（反向可证用）
//   node scripts/check-exempt-claims.mjs --root <path>         # 换一个源码根（单测的 fixture 用）
//
// **为什么要有这道门。** `check-governance-coverage.mjs` 对 exempt 只验「理由非空、负责人非空、日期未过期」，
// **验不了理由是否为真**。于是「明确不接」这四个字可以一直挂着，而它描述的事实早就变了——2026-11-06 的复核
// （`handoff/exempt-review-1106.md`）把 181 条理由按形状分成九类，其中 19 条与源码冲突。本门把那些理由当断言：
// 按理由**首句**分派到一条可机器判定的断言上，断言读的是**定义该事实的那个声明**（pom、部署清单、种子清单、
// 控制器、DO、Mapper、门禁注册），不是用 grep 去猜形状。红时逐行点名：服务 FQCN、理由首句、违反了哪条断言、
// 该去看哪处源码。
//
// ## 判定的类别（按理由里出现的断言短语分派；一行可以带多条，**全部**都要成立）
//
//   deferred              理由以「本批未接 / 下一批 / 待定 / 延期」开头 ⇒ **直接红**：那是 `gap` 的语义，
//                         不是「明确不接」。排期不是豁免。
//   module-off            「整模块弃用 / 应用面已关停」⇒ 该模块的根路径不在 `deploy/demo-ecs/module-scope.sql`
//                         的保留清单里、宿主注册了一个对 `/admin-api/<module>/**` 答 404 的 `*SurfaceGuard`、
//                         且 `deploy/demo-ecs/seed-manifest.txt` 跳过了 `keelbase-<module>.sql`。
//   demo                  「样例表 / demo」⇒ 该 service 的源码在 `/service/demo/` 下或路径含 `demo0`。
//   personal              「个人簿记 / 个人视图」⇒ 该服务引用的 DO 里至少一个带 `userId` 列。
//   owner-column          「user_id 列 / userId」⇒ 同上（属主在行上，而不是靠外部派生）。
//   no-owner-columns      「无属主列 / 无属主字段」⇒ 理由点名的 DO（没点名就是该服务引用的全部 DO）都没有
//                         `userId` 列。
//   no-owned-rows         「不持有业务行」⇒ 该服务的 Mapper 上没有任何 insert/update/delete 调用落在带
//                         `userId` 的 DO 上。
//   internal-face         「无 controller / 内部转调面 / 内部装配 / 无 REST 直读口」⇒ 该模块内没有任何
//                         `*Controller` 引用这个服务。
//   no-tool-face          「工具面没有一条路调用它 / 无工具路径 / 工具面无引用」⇒ `*Tools.java` 里没有任何
//                         一处引用这个服务。
//   admin-guard           「管理面」⇒ 引用该服务的 admin 控制器里至少一个带 `@PreAuthorize`，
//                         或者根本没有控制器引用它（纯内部件，「管理面」指上游的管理入口）。
//   citations（始终执行）  理由里点名的每一处 `类:行` / `文件:行` 都要解析得到（文件在、行号不越过文件末尾），
//                         每一个权限码（`a:b:c`，含 `*` 与 `|` 的写法）都要在仓内源码或 sql 里字面存在。
//
// ## 射程之外（写明，不是遗漏）
//
// * `D4 甲` / `计划 §5` 这类**决定编号**不在本仓（定义在私库的决定索引里），门无法解析 ⇒ 不判。理由里带着
//   它们不算错，但它们**本身不构成**可复核的断言，故不计入覆盖。
// * K2 的「管理面」只验到「存在一个带权限码的 admin 端点」这一半；「该 service 是否真有非管理端读/写」需要
//   逐对象的属主形状判断，留待场景门。
// * K7 的「按 id 读真判属主」同样只能验到文件与行号存在这一弱形。
// * `oa/file-node` 的「收窄口径另定」是一个**未决项**：本门不判，报告里列为待裁。
//
// Every `exempt` reason must be an assertion a machine can falsify; this gate tries to falsify each one.
//
// The coverage gate checks that a reason is non-empty, an owner is named and the date has not passed — it cannot
// check whether the reason is **still true**. This gate dispatches every `exempt` reason to the machine-decidable
// assertion its first clause names, and reads the declaration that **defines** the fact (pom, deployment manifest,
// seed manifest, controller, DO, mapper, interceptor registration) rather than guessing its shape with grep. On
// red it names the service FQCN, the reason's first clause, the assertion violated, and where to look.
//
// Claim classes are listed in the Chinese block above; they are dispatched by the phrase the reason carries and a
// row must satisfy **every** claim it makes. Out of reach, on purpose: the `D4 甲` / `计划 §5` decision ids (their
// records live outside this repository), the stronger halves of K2/K7 (owner-shaped or id-read judgements), and
// `oa/file-node`'s undecided narrowing.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const argv = process.argv.slice(2)
const argOf = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 ? argv[i + 1] : null
}
const ROOT = argOf('--root') ?? join(HERE, '..')
const LEDGER = argOf('--ledger') ?? join(ROOT, 'conformance/governance-coverage.tsv')

// ---- 源码索引 / the source index ----------------------------------------------------------------
const read = (file) => {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}
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

const moduleDirs = (() => {
  try {
    return readdirSync(ROOT).filter((d) => d.startsWith('yudao-module-') || d === 'yudao-server')
  } catch {
    return []
  }
})()
const javaFiles = moduleDirs.flatMap((d) => walk(join(ROOT, d, 'src/main/java')))
const javaText = new Map(javaFiles.map((f) => [f, read(f)]))
const relOf = (f) => relative(ROOT, f).split('\\').join('/')
const byBasename = new Map()
for (const f of javaFiles) {
  const n = basename(f, '.java')
  byBasename.set(n, [...(byBasename.get(n) ?? []), f])
}
const textOf = (f) => javaText.get(f) ?? ''

/**
 * 该模块的源码根（`server` 是宿主自己，生成出来的业务面住在那里）。
 * The source root of one ledger module (`server` is the host itself, where the generated faces live).
 */
const rootOf = (module) =>
  module === 'server' ? join(ROOT, 'yudao-server/src/main/java') : join(ROOT, `yudao-module-${module}/src/main/java`)

const mentions = (text, name) => new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`).test(text)

/**
 * 一条 `exempt` 行的源码事实。不必惰性求值——账本只有两百行。
 * The source facts behind one `exempt` row. No lazy evaluation needed: the ledger has two hundred rows.
 */
const factsOf = (row) => {
  const simple = row.service.split('.').pop()
  const pkgPath = row.service.split('.').join('/') + '.java'
  const file = javaFiles.find((f) => relOf(f).endsWith(pkgPath)) ?? null
  const implFile = file ? file.replace(/Service\.java$/, 'ServiceImpl.java') : null
  const impl = implFile && existsSync(implFile) ? textOf(implFile) : ''
  const roots = [rootOf(row.module), join(ROOT, 'yudao-server/src/main/java')]
  const controllers = javaFiles.filter(
    (f) => basename(f).endsWith('Controller.java') && roots.some((r) => f.startsWith(r)) && mentions(textOf(f), simple),
  )
  const tools = javaFiles.filter(
    (f) => basename(f).endsWith('Tools.java') && f.includes(`${'keelbase'}`) && mentions(textOf(f), simple),
  )
  const doNames = [...new Set([...impl.matchAll(/\b([A-Z]\w*DO)\b/g)].map((m) => m[1]))].filter((n) => byBasename.has(n))
  const doFiles = doNames.map((n) => byBasename.get(n).find((f) => relOf(f).includes('/dal/dataobject/'))).filter(Boolean)
  const mappers = [...new Set([...impl.matchAll(/\b(\w*[Mm]apper)\b/g)].map((m) => m[1]))].filter((n) => byBasename.has(n))
  return { simple, file, implFile, impl, controllers, tools, doFiles, mappers }
}

const OWNER_FIELD = /(?:private|protected|public)\s+[\w<>, [\]]+\s+userId\s*;/
const hasOwner = (doFile) => OWNER_FIELD.test(textOf(doFile))

/**
 * Mapper 接口声明的 DO（`BaseMapperX<XxxDO>`）；没有泛型就当它不持有行。
 * The DO a mapper declares (`BaseMapperX<XxxDO>`); without a generic it holds no rows.
 */
const mapperDo = (mapperFile) => {
  const m = textOf(mapperFile).match(/extends\s+BaseMapperX?<(\w+DO)>/)
  return m ? byBasename.get(m[1])?.[0] ?? null : null
}

// ---- 部署声明 / deployment declarations --------------------------------------------------------
const KEEP_LIST_FILE = join(ROOT, 'deploy/demo-ecs/module-scope.sql')
const SEED_FILE = join(ROOT, 'deploy/demo-ecs/seed-manifest.txt')

/**
 * `module-scope.sql` 的保留清单：`coalesce(path, '') not in ('', '/system', …)` 里那些字面量。
 * The keep list in `module-scope.sql`: the literals inside that `not in (…)` clause.
 */
const keepPaths = () => {
  const sql = read(KEEP_LIST_FILE)
  const m = sql.match(/not in\s*\(([^)]*)\)/s)
  if (!m) return null
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1])
}
const SEED_SKIPS = () =>
  read(SEED_FILE)
    .split(/\r?\n/)
    .filter((l) => /^skip\s+/.test(l.trim()))
    .map((l) => l.trim().split(/\s+/)[1])

/**
 * 注册在某个 `/admin-api/<module>/**` 上的 404 守卫（`addPathPatterns("…")` 那一行）。
 * The host class registering a 404 guard on `/admin-api/<module>/**` (the `addPathPatterns("…")` line).
 */
const surfaceGuardFor = (module) =>
  javaFiles.find((f) => f.includes(`${'keelbase'}`) && read(f).includes(`addPathPatterns("/admin-api/${module}/**")`))

// ---- 理由里的引用 / citations inside a reason --------------------------------------------------
const firstClause = (reason) => reason.split(/[，。；：]/)[0].trim()

const PERMISSION =
  /([a-z][a-z0-9-]*(?:\.[a-z0-9_]+)?:[a-z][a-z0-9-]*:[a-z0-9*\\|-]+)/g
// 前面不能是标识符字符：`getSessionMessageListBySessionId:64` 里的 `SessionMessage…` 不是类名。
// Not preceded by an identifier character: `getSessionMessageListBySessionId:64` is a method name, not a class.
const CLASS_LINE = /(?<![A-Za-z0-9_])([A-Z][A-Za-z0-9_]+):(\d+(?:-\d+)?(?:\/\d+(?:-\d+)?)*)/g
const FILE_LINE = /([\w./-]+\.(?:sql|java|md|txt|mjs|yml|yaml)):(\d+(?:-\d+)?)/g

const lineCount = (file) => read(file).split(/\r?\n/).length
const numberSpans = (s) =>
  s.split('/').flatMap((part) => {
    const [a, b] = part.split('-').map(Number)
    return b ? [a, b] : [a]
  })

const allSql = walk(join(ROOT, 'sql')).filter((f) => f.endsWith('.sql'))
const literalCorpus = () => [...javaText.values(), ...allSql.map(read)].join('\n')

// ---- 断言 / the assertions ---------------------------------------------------------------------
// 每条断言返回一串问题描述（空数组 = 成立）。`where` 指向定义该事实的那个声明。
// Each assertion returns a list of problems (empty = it holds). `where` points at the declaration that defines the fact.

/**
 * 分派前去掉「」里的转述：`**更正旧理由里「无 controller」一句**` 不是声明。
 * Drop quoted restatements before dispatching: a reason that quotes the old wording is not claiming it.
 */
const dispatchText = (reason) => reason.replace(/「[^」]*」/g, '')

/**
 * 「无属主列」类断言要看哪个 DO：先看理由点名的，再看与服务同名的（`XxxService` ⇒ `XxxDO`），最后才是全部。
 * 一条理由说「消息行无属主列」时，它说的是自己的行，不是它为了判权顺带读到的会话行。
 *
 * Which DO an "no owner column" claim is about: the one the reason names, else the one named after the
 * service, else every referenced one. "The message row has no owner column" speaks about its own row, not
 * about the session row it reads in order to decide the permission.
 */
const ownerCheckTargets = (row, f) => {
  const named = f.doFiles.filter((d) => new RegExp(`\\b${basename(d, '.java')}\\b`).test(row.reason))
  if (named.length) return named
  const base = f.simple.replace(/Service$/, '')
  const own = f.doFiles.filter((d) => basename(d, '.java').startsWith(base))
  return own.length ? own : f.doFiles
}

const CLAIMS = [
  {
    id: 'deferred',
    matches: (r) => /^\s*(本批未接|下一批|待定|延期|暂不)/.test(r),
    why: 'exempt 的理由不得是「本批未接 / 下一批 / 待定」——那是 `gap` 的语义（未接入、已排期）',
    verify: (row) => [`该行应改为 \`gap\` 并写目标日期：排期不是豁免 / scheduled work belongs in \`gap\``],
    where: () => 'conformance/governance-coverage.tsv 表头对 gap / exempt 的定义',
  },
  {
    id: 'module-off',
    matches: (r) => /^整模块/.test(r) || r.includes('应用面已关停'),
    why: '「整模块弃用 / 应用面已关停」⇒ module-scope 不保留该模块根、宿主有 404 守卫、种子跳过该模块',
    verify: (row) => {
      const problems = []
      const keeps = keepPaths()
      if (!keeps) problems.push(`${relOf(KEEP_LIST_FILE)} 里找不到保留清单（coalesce(path… not in (…)）`)
      else if (keeps.includes(`/${row.module}`))
        problems.push(`\`/${row.module}\` 仍在 ${relOf(KEEP_LIST_FILE)} 的保留清单里——菜单没有整支停用`)
      if (!surfaceGuardFor(row.module))
        problems.push(`没有任何宿主类把 \`/admin-api/${row.module}/**\` 注册给 404 守卫`)
      if (!SEED_SKIPS().includes(`keelbase-${row.module}.sql`))
        problems.push(`${relOf(SEED_FILE)} 没有 \`skip keelbase-${row.module}.sql\`——它的表仍在灌`)
      return problems
    },
    where: (row) => `deploy/demo-ecs/module-scope.sql · deploy/demo-ecs/seed-manifest.txt · 以及注册 \`/admin-api/${row.module}/**\` 的 *SurfaceGuard`,
  },
  {
    id: 'demo',
    matches: (r) => r.includes('样例') || /demo/i.test(r),
    why: '「样例表 / demo」⇒ 该 service 的源码在 /service/demo/ 下或路径含 demo0',
    verify: (row, f) =>
      f.file && /\/service\/demo(?:\d+)?\/|demo0\d/.test(relOf(f.file))
        ? []
        : [`该 service 不在 demo 包里：${f.file ? relOf(f.file) : '源码未找到'}`],
    where: (row, f) => (f.file ? relOf(f.file) : '该 service 的源码'),
  },
  {
    id: 'personal',
    matches: (r) => r.includes('个人') && !r.includes('无个人'),
    why: '「个人簿记 / 个人视图」⇒ 该服务引用的 DO 里至少一个带 userId 列',
    verify: (row, f) => {
      if (f.doFiles.some(hasOwner)) return []
      return [
        `该服务没有引用任何带 \`userId\` 列的 DO（引用：${f.doFiles.map((d) => basename(d, '.java')).join(', ') || '无'}）——「个人簿记」不成立`,
      ]
    },
    where: (row, f) => (f.implFile ? relOf(f.implFile) : '该服务的 ServiceImpl'),
  },
  {
    id: 'owner-column',
    matches: (r) => /user_id 列|user_id（属主在行上）|\.user_id\b|行自带属主/.test(r),
    why: '「user_id 列 / 行自带属主」⇒ 该服务引用的 DO 里至少一个带 userId 列',
    verify: (row, f) => {
      if (f.doFiles.some(hasOwner)) return []
      return [
        `该服务没有引用任何带 \`userId\` 列的 DO（引用：${f.doFiles.map((d) => basename(d, '.java')).join(', ') || '无'}）`,
      ]
    },
    where: (row, f) => (f.implFile ? relOf(f.implFile) : '该服务的 ServiceImpl'),
  },
  {
    id: 'no-owner-columns',
    matches: (r) => /无属主列|无属主字段|无属主人列|无单属主|无属主[；，,、]|无属主$/.test(r.trim()),
    why: '「无属主列 / 无属主字段」⇒ 该行自己的 DO（或理由点名的 DO）没有 userId 列',
    verify: (row, f) => {
      const owned = ownerCheckTargets(row, f).filter(hasOwner)
      if (owned.length === 0) return []
      return [`被检查的 DO 里有带 \`userId\` 列的：${owned.map((d) => basename(d, '.java')).join(', ')}`]
    },
    where: (row, f) => (f.doFiles.length ? f.doFiles.map((d) => relOf(d)).join(' · ') : '该服务的 ServiceImpl（未引用任何 DO）'),
  },
  {
    id: 'no-owned-rows',
    matches: (r) => r.includes('不持有业务行'),
    why: '「不持有业务行」⇒ 该服务的 Mapper 上没有落在带 userId 的 DO 上的 insert/update/delete',
    verify: (row, f) => {
      const problems = []
      for (const m of f.mappers) {
        const write = new RegExp(`\\b${m}\\s*\\.\\s*(insert|update|delete)\\w*\\s*\\(`).test(f.impl)
        if (!write) continue
        const doFile = mapperDo(byBasename.get(m)[0])
        if (doFile && hasOwner(doFile))
          problems.push(`\`${m}\` 上有写调用，且它的 DO \`${basename(doFile, '.java')}\` 带 \`userId\` 列`)
      }
      return problems
    },
    where: (row, f) => (f.implFile ? relOf(f.implFile) : '该服务的 ServiceImpl'),
  },
  {
    id: 'no-own-table',
    matches: (r) => /无自有表|无独立表|无自己的表|模块无表/.test(r),
    why: '「无自有表/DO」⇒ 该服务没有以自己命名的 DO，也没有落在这种 DO 上的 Mapper',
    verify: (row, f) => {
      const base = f.simple.replace(/Service$/, '')
      const ownDo = f.doFiles.filter((d) => basename(d, '.java').startsWith(base))
      const ownMapper = f.mappers.filter((m) => {
        const d = mapperDo(byBasename.get(m)[0])
        return d && basename(d, '.java').startsWith(base)
      })
      const problems = []
      if (ownDo.length) problems.push(`以它命名的 DO：${ownDo.map((d) => basename(d, '.java')).join(', ')}`)
      if (ownMapper.length) problems.push(`落在这种 DO 上的 Mapper：${ownMapper.join(', ')}`)
      return problems
    },
    where: (row, f) => (f.implFile ? relOf(f.implFile) : '该服务的 ServiceImpl'),
  },
  {
    id: 'internal-face',
    matches: (r) => /无 controller|没有控制器|内部转调面|内部装配|无 REST 直读口/.test(r),
    why: '「无 controller / 内部件」⇒ 该模块内没有任何 *Controller 引用这个服务',
    verify: (row, f) =>
      f.controllers.length === 0 ? [] : [`仍有控制器引用它：${f.controllers.map((c) => relOf(c)).join(' · ')}`],
    where: (row, f) =>
      f.controllers.length ? f.controllers.map((c) => relOf(c)).join(' · ') : `${relOf(rootOf(row.module))} 下的 *Controller`,
  },
  {
    id: 'no-tool-face',
    matches: (r) => /工具面没有一条路调用它|无工具路径|工具面无引用|AI 无需独立/.test(r),
    why: '「工具面无引用 / 无工具路径」⇒ *Tools.java 里没有任何一处引用这个服务',
    verify: (row, f) => (f.tools.length === 0 ? [] : [`仍有工具类引用它：${f.tools.map((t) => relOf(t)).join(' · ')}`]),
    where: (row, f) =>
      f.tools.length ? f.tools.map((t) => relOf(t)).join(' · ') : 'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/*Tools.java',
  },
  {
    id: 'admin-guard',
    matches: (r) => r.includes('管理面'),
    why: '「管理面」⇒ 引用该服务的 admin 控制器里至少一个带 @PreAuthorize，或根本没有控制器引用它',
    verify: (row, f) => {
      if (f.controllers.length === 0) return []
      const admin = f.controllers.filter((c) => relOf(c).includes('/controller/admin/'))
      const guarded = admin.filter((c) => textOf(c).includes('@PreAuthorize'))
      if (guarded.length > 0) return []
      return [
        `引用它的 admin 控制器没有一个带 @PreAuthorize：${(admin.length ? admin : f.controllers).map((c) => relOf(c)).join(' · ')}`,
      ]
    },
    where: (row, f) => (f.controllers.length ? f.controllers.map((c) => relOf(c)).join(' · ') : '该模块的 controller 目录'),
  },
]

// ---- 引用解析（始终执行）/ citation resolution (always) ----------------------------------------
const citationProblems = (row, f, corpus) => {
  const problems = []
  for (const m of row.reason.matchAll(CLASS_LINE)) {
    const [, cls, span] = m
    if (cls === 'Impl') {
      // `Impl:46` 是相对本行的实现类。
      // A bare `Impl:` points at this row's own implementation.
      if (!f.implFile) {
        problems.push(`理由里的 \`${m[0]}\` 指向本行的实现类，但找不到它`)
        continue
      }
      const lines = lineCount(f.implFile)
      const over = numberSpans(span).filter((n) => n > lines)
      if (over.length) problems.push(`\`${m[0]}\`：${relOf(f.implFile)} 只有 ${lines} 行，第 ${over.join('/')} 行不存在`)
      continue
    }
    const file = byBasename.get(cls)?.[0]
    if (!file) {
      problems.push(`理由点名的类 \`${cls}\` 在仓内找不到`)
      continue
    }
    const lines = lineCount(file)
    const over = numberSpans(span).filter((n) => n > lines)
    if (over.length) problems.push(`\`${m[0]}\`：${relOf(file)} 只有 ${lines} 行，第 ${over.join('/')} 行不存在`)
  }
  for (const m of row.reason.matchAll(FILE_LINE)) {
    const [full, path, span] = m
    if (path.includes('://')) continue
    const file = join(ROOT, path)
    if (!existsSync(file)) {
      problems.push(`理由点名的文件 \`${path}\` 不存在`)
      continue
    }
    const lines = lineCount(file)
    const over = numberSpans(span).filter((n) => n > lines)
    if (over.length) problems.push(`\`${full}\`：${path} 只有 ${lines} 行，第 ${over.join('/')} 行不存在`)
  }
  for (const m of row.reason.matchAll(PERMISSION)) {
    const code = m[1].replace(/\\/g, '')
    const [head, ...rest] = code.split(':')
    const stem = `${head}:${rest[0]}`
    const parts = rest.slice(1).join(':').split('|').filter(Boolean)
    for (const part of parts) {
      if (part === '*') {
        if (!corpus.includes(`${stem}:`)) problems.push(`理由里的权限码前缀 \`${code}\` 在仓内源码与 sql 里都找不到`)
      } else if (!corpus.includes(`${stem}:${part}`)) {
        problems.push(`理由里的权限码 \`${stem}:${part}\` 在仓内源码与 sql 里都找不到`)
      }
    }
  }
  return problems
}

// ---- 主流程 / the run ---------------------------------------------------------------------------
const COLUMNS = 8
const lines = read(LEDGER).split(/\r?\n/)
const rows = []
let lineNo = 0
for (const line of lines) {
  lineNo += 1
  if (line.trim() === '' || line.startsWith('#')) continue
  const cols = line.split('\t')
  if (cols.length !== COLUMNS) continue
  const [module, object, service, posture, evidence, reason, owner, recheck] = cols
  rows.push({ module, object, service, posture, evidence, reason, owner, recheck, lineNo })
}

const problems = []
const outOfReach = []
const claimCounts = new Map()
const corpus = literalCorpus()

for (const row of rows) {
  if (row.posture !== 'exempt') continue
  const f = factsOf(row)
  if (!f.file) {
    problems.push(
      `${row.module}/${row.object} ${row.service}（第 ${row.lineNo} 行）\n` +
        `    理由首句：「${firstClause(row.reason)}」\n` +
        `    违反 sources：账本点名的服务在源码里找不到，任何断言都无从核对\n` +
        `    看：${relOf(rootOf(row.module))}/…/${row.service.split('.').join('/')}.java`,
    )
    continue
  }
  const claims = CLAIMS.filter((c) => c.matches(dispatchText(row.reason)))
  if (claims.length === 0) outOfReach.push(row)
  for (const claim of claims) {
    claimCounts.set(claim.id, (claimCounts.get(claim.id) ?? 0) + 1)
    const why = claim.verify(row, f)
    if (why.length === 0) continue
    problems.push(
      `${row.module}/${row.object} ${row.service}（第 ${row.lineNo} 行）\n` +
        `    理由首句：「${firstClause(row.reason)}」\n` +
        `    违反 ${claim.id}：${claim.why}\n` +
        why.map((w) => `      · ${w}`).join('\n') +
        `\n    看：${claim.where(row, f)}`,
    )
  }
  const cites = citationProblems(row, f, corpus)
  if (cites.length) {
    claimCounts.set('citations', (claimCounts.get('citations') ?? 0) + 1)
    problems.push(
      `${row.module}/${row.object} ${row.service}（第 ${row.lineNo} 行）\n` +
        `    理由首句：「${firstClause(row.reason)}」\n` +
        `    违反 citations：理由点名的类/文件/行号与权限码必须解析得到\n` +
        cites.map((c) => `      · ${c}`).join('\n'),
    )
  }
}

// ---- 报告 / report ------------------------------------------------------------------------------
const exempt = rows.filter((r) => r.posture === 'exempt')
const covered = exempt.length - outOfReach.length
const counts = [...claimCounts].sort((a, b) => b[1] - a[1])
console.log(`exempt ${exempt.length} 行 · 被断言覆盖 ${covered} 行 · 射程外 ${outOfReach.length} 行 / ${exempt.length} exempt rows, ${covered} covered by an assertion, ${outOfReach.length} out of reach`)
if (counts.length) console.log('断言命中：' + counts.map(([id, n]) => `${id} ${n}`).join(' · '))
if (outOfReach.length) {
  console.log('\n射程外（理由里没有本门认识的断言短语，不计对错）：')
  for (const r of outOfReach) console.log(`  ${r.module}/${r.object} — 「${firstClause(r.reason)}」`)
}

if (problems.length > 0) {
  console.error('\nRED:')
  for (const p of problems) console.error(`  ${p}`)
  console.error(`\n${problems.length} 个问题 / ${problems.length} problem(s)`)
  process.exit(1)
}
console.log('\nexempt 的理由都被它们自己声明的断言证实 / every exempt reason survived the assertion it declares')
