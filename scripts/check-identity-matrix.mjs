#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 九页身份矩阵：三个角色各自能看见治理目录下的哪几页，逐格钉在种子 SQL 上。
//
//   node scripts/check-identity-matrix.mjs
//   node scripts/check-identity-matrix.mjs --sql-dir <目录>   # 只用于反向证明：读一份临时拷贝
//
// 由来：公开 issue `rain6fish/KeelBase-Vue-Pro#2` 记录了一张**逐格核过**的表 —— 审计读者能开审计链、
// AI 行动中心、AI 写入台账、工具清单、操作审计、策略中心与治理边界；普通用户 `common` 能开行动中心、
// 写入台账、决策轨迹与治理边界；决策轨迹按设计**不给**审计读者；对抗证明（`security-showcase`）**谁也不给**。
// 用户 2026-10-25 已裁定这张表现状是对的，只剩一件事：让将来的授予变更**不能悄悄反转它**。
//
// 它为什么能悄悄反转：授予散在几份种子文件里，用三种不同的写法落库 ——
//   · `SELECT <id>, r.id, <menu>, … FROM system_role r WHERE r.code = 'audit_reader'`（角色按 code 匹配）
//   · `SELECT <id>, 2, <menu>, …`（`common` 按 role id 2 匹配）
//   · `SELECT <id>, 2, m.id, … FROM system_menu m WHERE m.path = '/ai-assistant'`（菜单按路径匹配）
// 每一种都能单独改一行，而部署、页面与接口都不会出声。本检查把这三种写法都读出来，推出「角色 → 菜单」
// 集合，再与下面写死的矩阵**逐格**比对；任何一格多了或少了，红，并点名是哪一个角色、哪一页、哪个方向。
//
// 读法是**静态**的：只读 `sql/keelbase-*.sql` 的文本，不起栈、不连库、不读构建产物。它判定的是
// 「种子说要授予什么」，不是「库里现在有什么」；后者要一套跑着的数据库，不适合当常规门禁（见
// `check-seed-list.mjs` 里同样的取舍）。它也不替代 `check-audit-reader-write-controls.mjs`：那道钉
// 「读者看到的页上没有写控件」，这道钉「读者到底拿不拿得到这一页」。
//
// Origin: the public issue `rain6fish/KeelBase-Vue-Pro#2` records a table checked cell by cell — the
// audit reader may open the audit chain, the action centre, the write ledger, the tool inventory, the
// operations audit, the policy centre and the governance boundary; the ordinary `common` role may open
// the action centre, the write ledger, the conversation trace and the boundary; the conversation trace
// is **not** granted to the audit reader by design; the security showcase is granted to **nobody**. The
// user ruled on 2026-10-25 that this table is right as it stands, leaving exactly one thing: a future
// grant change must **not be able to reverse it silently**.
//
// Why it can reverse silently: the grants are spread over several seed files, written three different
// ways —
//   · `SELECT <id>, r.id, <menu>, … FROM system_role r WHERE r.code = 'audit_reader'` (role by code)
//   · `SELECT <id>, 2, <menu>, …` (`common` by role id 2)
//   · `SELECT <id>, 2, m.id, … FROM system_menu m WHERE m.path = '/ai-assistant'` (menu by path)
// Any one of them can change by a line, and neither the deployment, the pages nor the API will say a
// word. This check reads all three shapes, derives the role-to-menu sets and compares them **cell by
// cell** with the matrix below; a cell that gains or loses a grant is red, naming the role, the page
// and the direction.
//
// It reads **statically**: only the text of `sql/keelbase-*.sql`, no stack, no database, no build
// artefact. It decides "what the seed says is granted", not "what the database holds now" — the latter
// needs a running database and is unfit as a routine gate (the same trade-off as `check-seed-list.mjs`).
// It does not replace `check-audit-reader-write-controls.mjs`: that one pins "the page a reader sees has
// no write control", this one pins "whether the reader gets that page at all".

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let sqlDir = join(ROOT, 'sql')
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--sql-dir') {
    if (!argv[i + 1]) {
      console.error('--sql-dir 需要目录参数 / --sql-dir needs a directory argument')
      process.exit(2)
    }
    sqlDir = resolve(argv[++i])
  } else {
    console.error(`未知参数 / unknown argument: ${argv[i]}`)
    process.exit(2)
  }
}

// ── 文本切分 ────────────────────────────────────────────────────────────────────────────────

// 去掉注释，保留换行，行号仍可对上原文。
// Strip comments while keeping newlines, so line numbers still match the file.
function stripComments(text) {
  let out = ''
  let quote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      out += c
      if (c === "'") {
        if (text[i + 1] === "'") out += text[++i]
        else quote = false
      }
      continue
    }
    if (c === "'") {
      quote = true
      out += c
      continue
    }
    if (c === '-' && text[i + 1] === '-') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') out += '\n'
        i++
      }
      i++
      out += ' '
      continue
    }
    out += c
  }
  return out
}

// 按引号外的 `;` 切语句，并记下每条语句的起始偏移（用于报行号）。
// Split on `;` outside quotes, recording each statement's start offset (for line numbers).
function splitStatements(text) {
  const out = []
  let start = 0
  let quote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      if (c === "'") {
        if (text[i + 1] === "'") i++
        else quote = false
      }
      continue
    }
    if (c === "'") {
      quote = true
      continue
    }
    if (c === ';') {
      out.push({ text: text.slice(start, i), offset: start })
      start = i + 1
    }
  }
  if (text.slice(start).trim()) out.push({ text: text.slice(start), offset: start })
  return out
}

// 按括号与引号外的逗号切一层列表。
// Split one list on commas outside parentheses and quotes.
function splitTopLevel(text) {
  const parts = []
  let cur = ''
  let depth = 0
  let quote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      cur += c
      if (c === "'") {
        if (text[i + 1] === "'") cur += text[++i]
        else quote = false
      }
      continue
    }
    if (c === "'") {
      quote = true
      cur += c
      continue
    }
    if (c === '(') depth++
    else if (c === ')') depth--
    if (c === ',' && depth === 0) {
      parts.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  if (cur.trim()) parts.push(cur.trim())
  return parts
}

// `INSERT … SELECT` 的 SELECT 列表：从第一条 SELECT 到同层的 FROM。
// The SELECT list of an `INSERT … SELECT`: from the first SELECT to the FROM at the same depth.
function selectList(statement) {
  const m = /\bSELECT\b/i.exec(statement)
  if (!m) return null
  let i = m.index + m[0].length
  let depth = 0
  let quote = false
  const start = i
  for (; i < statement.length; i++) {
    const c = statement[i]
    if (quote) {
      if (c === "'") {
        if (statement[i + 1] === "'") i++
        else quote = false
      }
      continue
    }
    if (c === "'") {
      quote = true
      continue
    }
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (depth === 0 && /^FROM\b/i.test(statement.slice(i, i + 4)) && /\s/.test(statement[i - 1] ?? ' ')) break
  }
  return splitTopLevel(statement.slice(start, i))
}

const literal = (expr) => {
  if (expr == null) return null
  const m = /^\s*'((?:[^']|'')*)'\s*$/.exec(expr)
  return m ? m[1].replace(/''/g, "'") : null
}
const integer = (expr) => {
  if (expr == null) return null
  const m = /^\s*(\d+)\s*$/.exec(expr)
  return m ? Number(m[1]) : null
}
const lineOf = (text, offset) => text.slice(0, offset).split('\n').length

// ── 读种子 ──────────────────────────────────────────────────────────────────────────────────

const files = readdirSync(sqlDir)
  .filter((f) => f.startsWith('keelbase-') && f.endsWith('.sql'))
  .sort()

if (files.length === 0) {
  console.error(`sql 目录里没有 keelbase-*.sql / no keelbase-*.sql under: ${sqlDir}`)
  process.exit(2)
}

const menus = new Map()
const roleByNumericId = new Map([[2, 'common']])
const failures = []
const grants = []

const describe = (id) => LABELS.get(id) ?? `菜单 / menu ${id}`

for (const file of files) {
  const text = stripComments(readFileSync(join(sqlDir, file), 'utf8'))
  for (const { text: statement, offset } of splitStatements(text)) {
    const line = lineOf(text, offset + (statement.search(/\S/) >= 0 ? statement.search(/\S/) : 0))
    const at = `${file}:${line}`

    // 菜单行：对齐列名取值，别假设列顺序。
    // Menu rows: align by column name rather than assuming an order.
    const menuHead = /^\s*INSERT\s+INTO\s+system_menu\s*\(([^)]*)\)/i.exec(statement)
    if (menuHead) {
      const columns = menuHead[1].split(',').map((c) => c.trim().toLowerCase())
      const fields = selectList(statement)
      if (!fields) continue
      const field = (name) => {
        const i = columns.indexOf(name)
        return i >= 0 ? fields[i] : null
      }
      const id = integer(field('id'))
      if (id == null) continue
      menus.set(id, {
        id,
        name: literal(field('name')) ?? '',
        path: literal(field('path')) ?? '',
        permission: literal(field('permission')) ?? '',
        component: literal(field('component')) ?? '',
      })
      continue
    }

    // 授予行：只看 system_role_menu。
    // Grants: system_role_menu only.
    if (!/^\s*INSERT\s+INTO\s+system_role_menu\b/i.test(statement)) continue
    const fields = selectList(statement)
    if (!fields || fields.length < 3) {
      failures.push(`${at}: 读不出这条授予的角色与菜单 —— 新写法要教会本检查 / cannot read this grant`)
      continue
    }
    const [, roleExpr, menuExpr] = fields

    let role = roleByNumericId.get(integer(roleExpr) ?? -1) ?? null
    if (role == null) {
      const numeric = integer(roleExpr)
      if (numeric != null) {
        role = `role#${numeric}`
      } else if (/\.\s*id\s*$/i.test(roleExpr)) {
        const code = /\.\s*code\s*=\s*'([^']+)'/.exec(statement)?.[1]
        if (code) role = code
      }
    }

    let menuId = integer(menuExpr)
    if (menuId == null) {
      const alias = /FROM\s+system_menu\s+([A-Za-z_]\w*)/i.exec(statement)?.[1]
      if (alias && new RegExp(`^\\s*${alias}\\.id\\s*$`, 'i').test(menuExpr)) {
        const path = new RegExp(`\\b${alias}\\.path\\s*=\\s*'((?:[^']|'')*)'`, 'i').exec(statement)?.[1]
        const permission = new RegExp(`\\b${alias}\\.permission\\s*=\\s*'((?:[^']|'')*)'`, 'i').exec(statement)?.[1]
        const component = new RegExp(`\\b${alias}\\.component\\s*=\\s*'((?:[^']|'')*)'`, 'i').exec(statement)?.[1]
        const matches = [...menus.values()].filter(
          (m) =>
            (path != null && m.path === path) ||
            (permission != null && m.permission === permission) ||
            (component != null && m.component === component),
        )
        if (matches.length === 1) menuId = matches[0].id
        else if (matches.length > 1) {
          failures.push(`${at}: 按菜单条件匹配到 ${matches.length} 行，无法确定授予的是哪一个 / ambiguous menu match`)
        }
      }
    }

    if (role == null || menuId == null) {
      failures.push(`${at}: 读不出这条授予的角色或菜单 —— 新写法要教会本检查 / cannot read this grant`)
      continue
    }
    grants.push({ role, menuId, at })
  }
}

// ── 矩阵 ────────────────────────────────────────────────────────────────────────────────────

const MENU_NAMES = new Map([
  [20001, '治理'],
  [20002, '审计链'],
  [20003, 'AI 行动中心'],
  [20004, 'AI 写入台账'],
  [20005, '对抗证明'],
  [20006, '工具清单'],
  [20007, '决策轨迹'],
  [20008, '操作审计'],
  [20009, '策略中心'],
  [20029, '治理边界'],
])

const PAGES = new Map([
  [20001, '治理（目录）'],
  [20002, '审计链'],
  [20003, 'AI 行动中心'],
  [20004, 'AI 写入台账'],
  [20005, '对抗证明'],
  [20006, '工具清单'],
  [20007, '决策轨迹'],
  [20008, '操作审计'],
  [20009, '策略中心'],
  [20029, '治理边界'],
])
const GOVERNANCE = new Set(PAGES.keys())

const M7_AUX = new Map([
  [20010, 'AI 助手'],
  [20019, '助手会话'],
  [480, 'CRM（系统目录）'],
  [474, '客户管理'],
  [475, '客户查询'],
  [476, '客户创建'],
  [477, '客户更新'],
])

const LABELS = new Map([...PAGES, ...M7_AUX])

// 矩阵本身：用户 2026-10-25 裁定，现状即正确。
// The matrix itself: ruled right as it stands by the user on 2026-10-25.
const MATRIX = [
  {
    role: 'audit_reader',
    label: 'audit_reader（审计读者）',
    universe: GOVERNANCE,
    grants: [20001, 20002, 20003, 20004, 20006, 20008, 20009, 20029],
  },
  {
    role: 'common',
    label: 'common（普通用户 · role 2）',
    universe: GOVERNANCE,
    grants: [20001, 20003, 20004, 20007, 20029],
  },
  {
    role: 'm7_reader',
    label: 'm7_reader（走查读者）',
    universe: new Set([...GOVERNANCE, ...M7_AUX.keys()]),
    grants: [20001, 20003, 20004, 20007, 20029, ...M7_AUX.keys()],
  },
]

const actual = new Map()
const source = new Map()
for (const g of grants) {
  if (!actual.has(g.role)) actual.set(g.role, new Set())
  actual.get(g.role).add(g.menuId)
  const key = `${g.role}|${g.menuId}`
  if (!source.has(key)) source.set(key, g.at)
}

// ① 每一页的菜单行要在，且 id 没被挪作他用。
// ① every page's menu row must exist, and its id must still mean that page.
for (const [id, name] of MENU_NAMES) {
  const menu = menus.get(id)
  if (!menu) {
    failures.push(`system_menu 缺 ${id} ${name} 的行 —— 授予指向一个不存在的页面 / no such menu row`)
  } else if (menu.name !== name) {
    failures.push(`system_menu ${id} 现在的名字是「${menu.name}」，矩阵记的是「${name}」—— id 被挪作他用 / id reused`)
  }
}

// ② 每一格：该有的要有，该没有的不能有。
// ② every cell: the ones that must be there are, the ones that must not are not.
for (const row of MATRIX) {
  const got = actual.get(row.role) ?? new Set()
  const want = new Set(row.grants)
  for (const id of row.universe) {
    const should = want.has(id)
    const does = got.has(id)
    if (should === does) continue
    if (should) {
      failures.push(`${row.label} × ${id} ${describe(id)}：少了这一格授予 / a grant is missing from the seed`)
    } else {
      failures.push(`${row.label} × ${id} ${describe(id)}：多了这一格授予（在 ${source.get(`${row.role}|${id}`)}）/ an unexpected grant`)
    }
  }
}

// ③ 治理页不许发给矩阵之外的角色 —— 新角色要一并登记。
// ③ no role outside the matrix may hold a governance page; a new one must be registered here.
const known = new Set(MATRIX.map((r) => r.role))
for (const [role, ids] of actual) {
  if (known.has(role)) continue
  for (const id of ids) {
    if (GOVERNANCE.has(id)) {
      failures.push(`未登记的角色 ${role} 持有治理页 ${id} ${describe(id)}（在 ${source.get(`${role}|${id}`)}）—— 矩阵只登记了 ${[...known].join(' / ')} / unregistered role`)
    }
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} 处身份矩阵与种子 SQL 不一致（读的是 ${sqlDir}）：\n`)
  for (const f of failures) console.error(`  ✗ ${f}`)
  console.error(
    `\n矩阵写在本脚本的 MATRIX 里，来源是 issue rain6fish/KeelBase-Vue-Pro#2 与用户 2026-10-25 的裁定。\n` +
      `The matrix lives in MATRIX in this script; it comes from issue rain6fish/KeelBase-Vue-Pro#2 and the user's 2026-10-25 ruling.\n`,
  )
  process.exit(1)
}

const counts = MATRIX.map((r) => `${r.role} ${r.grants.length}`).join(' · ')
console.log(
  `✓ 九页身份矩阵一致（${files.length} 份种子）：${counts}；对抗证明 20005 无人持有\n` +
    `  The nine-page identity matrix holds (${files.length} seed files): ${counts}; the showcase 20005 is held by nobody`,
)
