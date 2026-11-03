#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Every page the assistant offers is a page the console this deployment runs can open.
//
//   node scripts/check-console-pages.mjs
//
// `ConsolePages` is a curated list, and a curated list is a second place to forget. Two things keep it
// honest, and both are checked here.
//
// The first is the menu tree: each route it names is looked up in the tree the SQL we ship defines,
// composed the way the console's router composes it — a parent's path joined to a child's. A page that
// moves or is renamed upstream turns this red rather than leaving a route in the tool that goes
// nowhere, which is the failure mode a list like this has and a runtime lookup would not.
//
// The second is this deployment's scope, which the first check cannot see: `ConsolePages` names console
// pages in general, while `deploy/demo-ecs/module-scope.sql` decides which branches this host shows by
// switching off every top-level path outside its keep list. A route can compose perfectly and still be
// unreachable here — the console answers 「模块已禁用」. Measured on 2026-10-24: 12 of the 31 routes are
// exactly that. Turning those red would be true and useless (what to do about them is a product
// decision, not something this gate can change), so they are **declared** in `SWITCHED_OFF`, one page at
// a time and with why. The criterion is then falsifiable in three directions, and all three are red: a
// new page in a switched-off branch that is not declared; a declaration whose branch has since been
// switched back on; a declaration naming a page that is gone. The gap stays countable, and it can
// neither grow nor quietly heal without this file saying so.
//
// Scope is stated rather than implied: it reads our own `ConsolePages.java` for the routes, the
// PostgreSQL seed plus our own `sql/*.sql` for the trees, and `deploy/demo-ecs/module-scope.sql` for
// the keep list. The other dialects carry the same menus in other spellings; reading them would add
// nothing but time. What it does **not** check is whether a caller may open the page — that is the
// console's own menu permission and is deliberately not second-guessed here (see `ConsolePages`'s class
// comment).
//
// 助手提供的每一页，都是**本部署真正跑的那套控制台**打得开的一页。
//
//   node scripts/check-console-pages.mjs
//
// `ConsolePages` 是一份策展清单，而策展清单就是**第二个可以忘的地方**。让它不虚的有两件事，这里都查。
//
// 第一件是菜单树：它点名的每条路径，都在**我们发布的 SQL** 所定义的树里查一遍，并且按**控制台路由的拼法**拼——
// 父路径接子路径。上游把某个页面挪走或改名，这道检查就**变红**，而不是在工具里留下一条哪儿也去不了的路径——那正是
// 这类清单会有的失效方式，而运行时查表不会有。
//
// 第二件是**本部署的射程**，第一件看不见它：`ConsolePages` 点的是控制台**通用**的页面，而
// `deploy/demo-ecs/module-scope.sql` 决定这台机器显示哪几支——它把保留清单之外的顶级路径整支停掉。于是一条路径
// 可以拼得完全正确、在这台机器上却**到不了**：控制台会答「模块已禁用」。2026-10-24 实测：31 条里有 12 条正是如此。
// 把它们直接判红对错都对、却没有用（拿它们怎么办是**产品决定**，不是这道闸能改的事），所以改成在 `SWITCHED_OFF` 里
// **逐页声明**并写明缘由。判据于是在三个方向上可证伪，且**三个方向都红**：落停用支的新页面没声明；声明的那支后来又被
// 启用；声明点了一个已经不存在的页面。缺口于是**可数**，既不会悄悄变大，也不会悄悄愈合——除非这个文件自己说明。
//
// 射程是**写明**的：路径读我们自己那份 `ConsolePages.java`，菜单树读 PostgreSQL 种子加上我们自己的 `sql/*.sql`，
// 保留清单读 `deploy/demo-ecs/module-scope.sql`。别的方言用别的拼法带着同一批菜单，读它们只会多花时间。它**不**
// 查的一件事是：某个调用方能不能打开那一页——那是控制台自己的菜单权限，且**刻意**不在这里替它猜（见 `ConsolePages`
// 的类注释）。
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = 'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/ConsolePages.java'
const SCOPE = join('deploy', 'demo-ecs', 'module-scope.sql')
const PG_SEED = join('sql', 'postgresql', 'ruoyi-vue-pro.sql')

/** `new Page("key", "name", "route", "description")` — one line each, so a line-wise read is enough. */
const PAGE = /new Page\("([^"]+)",\s*"[^"]*",\s*"([^"]+)",/g

/** One `system_menu` row: id, name, permission, type, sort, parent, path. */
const MENU_ROW = /\((\d+),\s*'[^']*',\s*'[^']*',\s*(\d+),\s*(\d+),\s*(\d+),\s*'([^']*)'/g

/**
 * Pages this deployment switches off, and why — one entry per page, keyed by the key `ConsolePages`
 * uses. Two classes:
 *
 * - `not-in-jar`: the module is not among the five this host's jar carries (`system` · `infra` · `bpm` ·
 *   `crm` · `ai1-springai`), so the branch could not run here even if the menus were shown.
 * - `in-jar-menus-off`: the module **is** in the jar but is deliberately not shown. `bpm` is the one
 *   case: `yudao-module-crm` depends on it at build time — CRM's contract and receivable approvals run
 *   through its engine — so it cannot be dropped from the jar even though none of its pages is offered
 *   here. Its menus are switched off and its tables are skipped (`seed-manifest.txt`); see
 *   `deploy/demo-ecs/README.md`.
 *
 * 本部署停掉的页面及缘由——逐页一条，键就是 `ConsolePages` 用的那个键。两类：
 *
 * - `not-in-jar`：该模块不在本机 jar 的五个里（`system` · `infra` · `bpm` · `crm` · `ai1-springai`），
 *   所以即便把菜单显出来，这一支在这里也跑不起来。
 * - `in-jar-menus-off`：模块**在** jar 里，但**刻意**不展示。只有 `bpm` 这一例：`yudao-module-crm` 在构建期
 *   依赖它——CRM 的合同与回款审批走它的引擎——所以它不能从 jar 里裁掉，尽管它的页面在这里一个都不提供。它的菜单
 *   被停用、表被跳过（`seed-manifest.txt`）；见 `deploy/demo-ecs/README.md`。
 */
const SWITCHED_OFF = [
  ['report', '/report', 'not-in-jar'],
  ['report', '/report', 'not-in-jar'],
  ['bpm', '/bpm', 'in-jar-menus-off'],
  ['approval-tasks', '/bpm/task', 'in-jar-menus-off'],
  ['hrm', '/hrm', 'not-in-jar'],
  ['hrm-dept', '/hrm/dept', 'not-in-jar'],
  ['fms', '/fms', 'not-in-jar'],
  ['ai', '/ai', 'not-in-jar'],
  ['ai-chat', '/ai/chat', 'not-in-jar'],
  ['ai-knowledge', '/ai/knowledge', 'not-in-jar'],
]

/** How each class reads in the report. */
const OFF_LABEL = {
  'not-in-jar': 'not in the five-module jar',
  'in-jar-menus-off': 'in the jar, menus switched off',
}

const sqlFiles = () => {
  const files = []
  for (const dir of ['sql', join('sql', 'postgresql')]) {
    let entries
    try {
      entries = readdirSync(join(ROOT, dir))
    } catch {
      continue
    }
    for (const e of entries) {
      if (e.endsWith('.sql')) files.push(join(dir, e))
    }
  }
  return files
}

/**
 * The menu rows our SQL defines, and two readings of them: the route a row composes to
 * (parent-then-child), and the top-level path that route sits under — the branch `module-scope.sql`
 * switches on or off.
 *
 * A row whose parent is not in the same set (another dialect's fragment, a row we filtered out) is
 * composed as far as it goes rather than dropped: the check is about whether a route exists, and
 * composing half a path would report a miss that is really a parser's limit.
 *
 * 我们的 SQL 定义的菜单行，以及对它们的两读：一行拼出来的**路径**（父接子），与那条路径所在的**顶级路径**——
 * 也就是 `module-scope.sql` 整支开关的那一支。
 *
 * 父项不在同一集合里的行（别的方言的片段、被我们滤掉的行）**能拼多远拼多远**、不整条丢掉：这道检查问的是
 * 路径存不存在，只拼一半会把解析器的极限报成一次缺席。
 */
const menuTree = () => {
  const rows = new Map()
  for (const file of sqlFiles()) {
    const sql = readFileSync(join(ROOT, file), 'utf8')
    for (const statement of sql.matchAll(/INSERT INTO system_menu[^;]*;/gs)) {
      for (const row of statement[0].matchAll(MENU_ROW)) {
        rows.set(row[1], { parent: row[4], path: row[5] })
      }
    }
  }

  const routeOf = (id, seen = new Set()) => {
    const row = rows.get(id)
    if (!row || !row.path || seen.has(id)) return null
    seen.add(id)
    if (row.parent === '0') return '/' + row.path.replace(/^\/+/, '')
    const parent = routeOf(row.parent, seen)
    return parent === null ? null : parent.replace(/\/+$/, '') + '/' + row.path
  }

  const branchOf = (id, seen = new Set()) => {
    const row = rows.get(id)
    if (!row || seen.has(id)) return null
    if (row.parent === '0') return row.path.startsWith('/') ? row.path : '/' + row.path
    seen.add(id)
    return branchOf(row.parent, seen)
  }

  const routes = new Map()
  for (const id of rows.keys()) {
    const route = routeOf(id)
    if (route !== null && !routes.has(route)) routes.set(route, branchOf(id))
  }
  return { rows, routes, branchOf }
}

/** The keep list in `module-scope.sql`: `coalesce(path, '') not in ('', '/system', …)`. */
const keepList = () => {
  const sql = readFileSync(join(ROOT, SCOPE), 'utf8')
  const list = sql.match(/not in\s*\(([\s\S]*?)\)/)
  if (!list) {
    console.error(`${SCOPE}: could not find the keep list — the reader, not the deployment, is wrong`)
    process.exit(1)
  }
  return new Set([...list[1].matchAll(/'([^']*)'/g)].map((m) => m[1]))
}

/**
 * `super_admin`'s menu grants, and how many of them reach anything this deployment shows. They are not
 * read for a super admin at all — `PermissionServiceImpl.getRoleMenuListByRoleId` answers from every
 * menu when the role is a super admin — so the count is a property of the seed worth reporting, not a
 * criterion: whether any grant is load-bearing is not something this script can prove or disprove.
 *
 * `super_admin` 的菜单授予，以及其中有多少够得着本部署展示的东西。超级管理员根本不读这些行——
 * `PermissionServiceImpl.getRoleMenuListByRoleId` 对超级管理员直接答**全部**菜单——所以这个计数是种子的一条
 * **值得报告的性质**、不是判据：某一行授予是否承重，不是这个脚本证得了的。
 */
const superAdminGrants = ({ rows, branchOf }, keep) => {
  const sql = readFileSync(join(ROOT, PG_SEED), 'utf8')
  const grants = []
  for (const statement of sql.matchAll(/INSERT INTO system_role_menu\s*\([^)]*\)\s*VALUES\s*\(([^)]*)\);/gs)) {
    const values = statement[1].split(',').map((v) => v.trim().replace(/^'|'$/g, ''))
    // id, role_id, menu_id, creator, create_time, updater, update_time, deleted, tenant_id
    if (values[1] !== '1' || values[7] !== '0') continue
    grants.push(values[2])
  }
  const kept = grants.filter((id) => keep.has(branchOf(id))).length
  const dangling = grants.filter((id) => !rows.has(id) || branchOf(id) === null).length
  return { total: grants.length, kept, dangling, off: grants.length - kept - dangling }
}

const source = readFileSync(join(ROOT, SOURCE), 'utf8')
const pages = [...source.matchAll(PAGE)].map((m) => ({ key: m[1], route: m[2] }))
if (pages.length === 0) {
  console.error(`no \`new Page(...)\` entries found in ${SOURCE} — the reader, not the list, is wrong`)
  process.exit(1)
}

const tree = menuTree()
const keep = keepList()
const declared = new Map(SWITCHED_OFF.map(([key, branch, kind]) => [key, { branch, kind }]))
const failures = []

const stateOf = (page) => {
  if (!tree.routes.has(page.route)) return 'missing'
  const branch = tree.routes.get(page.route)
  if (branch === null) return 'branchless'
  return keep.has(branch) ? 'ok' : 'off'
}

for (const page of pages) {
  const state = stateOf(page)
  const mark = { ok: 'ok      ', off: 'off     ', missing: 'MISSING ', branchless: 'BRANCH? ' }[state]
  console.log(`  ${mark} ${page.key.padEnd(16)} ${page.route}`)
  if (state === 'missing') {
    failures.push(`${page.route}  (${page.key}) is not a route this deployment's menus compose`)
  } else if (state === 'branchless') {
    failures.push(`${page.route}  (${page.key}) composes, but its top-level branch does not — the reader, not the list, is wrong`)
  } else if (state === 'off' && !declared.has(page.key)) {
    const branch = tree.routes.get(page.route)
    failures.push(
      `${page.route}  (${page.key}) resolves, but sits in ${branch}, which ${SCOPE} switches off — ` +
        'declare it in SWITCHED_OFF with why, or drop it from ConsolePages',
    )
  }
}

const offByBranch = new Map()
for (const page of pages) {
  if (stateOf(page) !== 'off') continue
  const branch = tree.routes.get(page.route)
  const kind = declared.get(page.key)?.kind ?? 'not-in-jar'
  if (!offByBranch.has(branch)) offByBranch.set(branch, { kind, pages: [] })
  offByBranch.get(branch).pages.push(page)
}

const offPages = [...offByBranch.values()].reduce((n, group) => n + group.pages.length, 0)
if (offPages > 0) {
  console.log(`\n${offPages} page(s) fall in branches this deployment switches off (declared in SWITCHED_OFF):\n`)
  for (const [branch, group] of [...offByBranch.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`  ${branch.padEnd(18)} ${group.pages.length} page(s)   ${OFF_LABEL[group.kind]}`)
    for (const page of group.pages) console.log(`    ${page.key.padEnd(16)} ${page.route}`)
  }
}

for (const [key, { branch, kind }] of declared) {
  const page = pages.find((p) => p.key === key)
  if (!page) {
    failures.push(`SWITCHED_OFF declares '${key}', which ConsolePages no longer offers — drop the declaration`)
    continue
  }
  const state = stateOf(page)
  if (state === 'ok') {
    failures.push(
      `SWITCHED_OFF declares '${key}' (${page.route}) as off, but ${branch} is on this deployment's keep list — ` +
        'the declaration is stale, drop it',
    )
  } else if (state === 'off' && OFF_LABEL[kind] === undefined) {
    failures.push(`SWITCHED_OFF: '${key}' declares an unknown class '${kind}'`)
  }
}

const grants = superAdminGrants(tree, keep)
console.log(
  `\nsuper_admin: ${grants.total} menu grant(s) in ${PG_SEED} — ${grants.off} into branches this deployment ` +
    `switches off, ${grants.dangling} at menu ids no seed defines, ${grants.kept} into a kept branch. ` +
    'None of them is read for a super admin (PermissionServiceImpl answers from every menu).',
)

if (failures.length > 0) {
  console.error()
  for (const failure of failures) console.error(`  ${failure}`)
  console.error()
  console.error(`${failures.length} page(s) the assistant would offer and the console cannot open.`)
  console.log(`${pages.length - failures.length} ok / ${failures.length} failed`)
  process.exit(1)
}

console.log(
  `\n${pages.length} page(s): ${pages.length - offPages} the console this deployment runs can open, ` +
    `${offPages} in branches it switches off (declared above) — ${tree.routes.size} routes across ` +
    `${sqlFiles().length} SQL file(s) and the keep list in ${SCOPE}`,
)
console.log(`${pages.length - offPages} ok / ${offPages} switched off / 0 failed`)
