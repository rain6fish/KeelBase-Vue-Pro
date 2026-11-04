#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Map 结果上的 camelCase 列别名，在 PostgreSQL 上必然读不到。这道门禁把它钉死。
//
//   node scripts/check-sql-aliases.mjs          # 部署范围（默认）
//   node scripts/check-sql-aliases.mjs --all    # 全仓所有模块（审计用）
//   node scripts/check-sql-aliases.mjs --root <dir>   # 换一个根（自证测试用）
//
// **缺陷机制（已实测）**：PostgreSQL 把**未加引号**的列别名折叠成小写。`SELECT 1 AS priceSum` 回来的列名是
// `pricesum`。MyBatis 把 `selectMaps` / `resultType="java.util.Map"` 的结果装进 Map 时，**键就是 JDBC 给的列名**，
// 而代码按键**大小写敏感**地取（`MapUtil.getInt(first, "priceSum")`）⇒ 取到默认值（0）或 null，**不报错**。
// 已经造成过两次真缺陷：`PayWalletTransactionMapper.selectPriceSum`（钱包收支恒为 0）与
// `AiChatMessageMapper`（会话消息数恒为 0），另有 pms 六处让控制台项目页在 PG 上直接 500。
//
// **这道门禁只管真正会坏的那一类**：结果被当作 **Map** 消费的查询。理由是实测的边界，不是宽窄的偏好：
//
//   · **Map 结果** —— 键是列名，大小写敏感 ⇒ camelCase 别名在 PG 上必坏。**红**。
//   · **Bean 结果**（`resultType` 是一个 VO/DO）—— MyBatis 的自动映射按**忽略大小写**匹配属性
//     （`Reflector` 的 `caseInsensitivePropertyMap`），`pricesum` 照样映射到 `priceSum`。**不红**，因为没坏。
//   · 表别名（`FROM x AS y`）与 `CAST(x AS DATE)` 的类型名不是结果列别名 ⇒ **不红**。
//
// **允许的例外（判据写在这里，脚本按此执行）**：
//
//   1. **双引号包住的别名** —— `AS "priceSum"`。PG 保留引号内的大小写，故 Map 键仍是 `priceSum`。允许。
//      注意它是 **PG 专有**写法：MySQL 默认把双引号当字符串字面量，同一个别名在 MySQL 上不成立。本仓的部署
//      方言是 PostgreSQL，故这条成立；换方言要重新裁决。
//   2. **`CAST` / `CONVERT` / `TRY_CAST` 里的类型名** —— `AS DATE`、`AS DECIMAL(10,2)` 是类型转换，不是别名。
//   3. **反引号包住的别名**（`` AS `priceSum` ``）**不是**例外：反引号在 PG 上是语法错误。出现即红。
//   4. **部署范围之外的模块**默认不判（`--all` 才判）。判据是 `yudao-server/pom.xml` 里**未被注释**的
//      `yudao-module-*` 依赖 —— 只有这些模块随本部署跑在 PostgreSQL 上；其余是上游模块，本仓按「不碰上游
//      文件」的规矩不改，但 `--all` 会把它们如实数出来。
//
// **警告而非失败**：全大写别名（`AS FOLDER_ID`）是**同一种失效**的另一种写法 —— PG 同样折叠成小写，
// 读 `FOLDER_ID` 同样拿不到。它不在本轮「camelCase」规则内，故只打 `warn:`、不改退出码。建闸时它在
// `OaMailMessageMapper.selectCountMapByAccountIdAndReadStatus` 上有一处现存实例，已改掉（2026-11-04，
// `AS folder_id` / `AS unread_count`，读取端同步）。这条警告保留，用来把后来的同形写法报出来；要把它
// 升成失败，那是一次有意的规则扩大，不是默认。
//
// **边界（写清楚，不假装更大）**：本脚本只认**带 `AS`** 的别名，外加一种可静态判定的隐式形状
// （`<表达式> <camelCase>` 紧跟 `,` / `FROM` / SQL 结尾）。它**不是** SQL 解析器：跨语句拼接、动态
// `${}` 拼进列名的写法，静态看不出结果列。
//
// English
//
// A camelCase column alias on a **Map** result cannot be read back on PostgreSQL. This gate pins that down.
//
//   node scripts/check-sql-aliases.mjs          # the deployed scope (default)
//   node scripts/check-sql-aliases.mjs --all    # every module (for an audit)
//   node scripts/check-sql-aliases.mjs --root <dir>   # a different root (for the self-test)
//
// **The mechanism (measured)**: PostgreSQL folds an **unquoted** column alias to lower case. `SELECT 1 AS
// priceSum` comes back with the column named `pricesum`. When MyBatis fills a Map for `selectMaps` /
// `resultType="java.util.Map"`, **the key is the JDBC column name**, and the code reads it
// **case-sensitively** (`MapUtil.getInt(first, "priceSum")`) ⇒ it gets the default (0) or null, with **no
// error**. This has produced two real defects: `PayWalletTransactionMapper.selectPriceSum` (wallet income
// and expense were always 0) and `AiChatMessageMapper` (message counts always 0), plus six pms sites that
// made the console's project page 500 on PostgreSQL.
//
// **This gate covers only the queries that actually break**: those whose result is consumed as a **Map**.
// That boundary is measured, not a matter of taste:
//
//   · **Map results** — the key is the column name, case-sensitive ⇒ a camelCase alias always breaks on
//     PostgreSQL. **Red**.
//   · **Bean results** (`resultType` is a VO/DO) — MyBatis auto-mapping matches properties
//     **case-insensitively** (`Reflector`'s `caseInsensitivePropertyMap`), so `pricesum` still maps to
//     `priceSum`. **Not red**, because nothing breaks.
//   · Table aliases (`FROM x AS y`) and the type names in `CAST(x AS DATE)` are not result-column aliases
//     ⇒ **not red**.
//
// **Allowed exceptions (the criteria live here, and the script follows them)**:
//
//   1. **A double-quoted alias** — `AS "priceSum"`. PostgreSQL keeps the case inside the quotes, so the Map
//      key is still `priceSum`. Allowed. Note it is **PostgreSQL-only**: MySQL treats double quotes as a
//      string literal by default, so the same alias does not hold there. This repository deploys on
//      PostgreSQL, which is why the exception stands; changing the dialect means re-deciding it.
//   2. **The type name of `CAST` / `CONVERT` / `TRY_CAST`** — `AS DATE`, `AS DECIMAL(10,2)` convert, they do
//      not alias.
//   3. **A backtick-quoted alias** (`` AS `priceSum` ``) is **not** an exception: backticks are a syntax
//      error on PostgreSQL. One turns the gate red.
//   4. **Modules outside the deployed scope** are not judged by default (`--all` judges them). The criterion
//      is the **uncommented** `yudao-module-*` dependency in `yudao-server/pom.xml` — only those ship with
//      this deployment onto PostgreSQL; the rest are upstream modules this repository leaves untouched by
//      its own rule, though `--all` counts them honestly.
//
// **A warning, not a failure**: an upper-case-only alias (`AS FOLDER_ID`) is **the same failure** in another
// spelling — PostgreSQL folds it too, and reading `FOLDER_ID` misses just as well. It is outside this round's
// "camelCase" rule, so it prints `warn:` and does not change the exit code. When the gate was built it had
// one live instance, `OaMailMessageMapper.selectCountMapByAccountIdAndReadStatus`; that is fixed as of
// 2026-11-04 (`AS folder_id` / `AS unread_count`, and the reads follow). The warning stays, to report the
// next spelling of the same shape; raising it to a failure is a deliberate widening of the rule, not a
// default.
//
// **The boundary, stated rather than implied**: this script recognises aliases written with `AS`, plus one
// statically decidable implicit shape (`<expression> <camelCase>` followed by `,` / `FROM` / the end of the
// SQL). It is **not** a SQL parser: a column name assembled across statements or through a dynamic `${}`
// fragment cannot be read statically.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEF_ROOT = resolve(HERE, '..')

const SKIP_DIRS = new Set(['.git', '.claude', '.mvn', '.idea', 'target', 'dist', 'build', 'node_modules'])

// `CAST(x AS <type>)` 的类型名，不是别名。`AS DATE` 这类若被当成别名会把每一处 cast 都点亮。
// Type names inside `CAST(x AS <type>)`; these are not aliases.
const TYPE_WORDS = new Set([
  'array', 'bigint', 'binary', 'blob', 'bool', 'boolean', 'char', 'character', 'clob', 'date', 'datetime',
  'dec', 'decimal', 'double', 'float', 'int', 'int2', 'int4', 'int8', 'integer', 'interval', 'json', 'jsonb',
  'nchar', 'number', 'numeric', 'nvarchar', 'real', 'signed', 'smallint', 'text', 'time', 'timestamp',
  'timestamptz', 'tinyint', 'unsigned', 'uuid', 'varbinary', 'varchar', 'year',
])

// 隐式形状里 `,` / `FROM` / 结尾前的词也可能是关键字（`ORDER BY x DESC` 的 `DESC`），不是别名。
// A word before `,` / `FROM` / the end in the implicit shape can also be a keyword (`DESC` in
// `ORDER BY x DESC`); it is not an alias.
const KEYWORDS = new Set([
  'all', 'and', 'as', 'asc', 'between', 'by', 'case', 'cross', 'desc', 'distinct', 'else', 'end', 'false',
  'first', 'from', 'group', 'having', 'in', 'inner', 'interval', 'into', 'is', 'join', 'last', 'left',
  'like', 'limit', 'not', 'null', 'nulls', 'offset', 'on', 'or', 'order', 'outer', 'right', 'select',
  'set', 'then', 'true', 'union', 'using', 'values', 'when', 'where',
])

const MAP_RESULT_TYPES = new Set([
  'map', 'java.util.map', 'hashmap', 'java.util.hashmap', 'linkedhashmap', 'java.util.linkedhashmap',
  'treemap', 'java.util.treemap',
])

// 方法名后面跟 `(` 但不是方法声明的关键字。
// Keywords that take `(` but do not declare a method.
const NOT_METHODS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'synchronized', 'return', 'new', 'super', 'this', 'throw',
  'assert', 'do', 'try', 'else', 'case', 'instanceof', 'yield', 'record',
])

function usage(code) {
  console.error('usage: node scripts/check-sql-aliases.mjs [--all] [--root <dir>]')
  process.exit(code)
}

function parseArgs(argv) {
  const opts = { root: DEF_ROOT, all: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--all') opts.all = true
    else if (a === '--root') {
      const v = argv[++i]
      if (!v) usage(2)
      opts.root = resolve(v)
    } else if (a === '--help' || a === '-h') usage(0)
    else {
      console.error(`check-sql-aliases: unknown argument: ${a}`)
      usage(2)
    }
  }
  if (!existsSync(opts.root)) {
    console.error(`check-sql-aliases: no such root: ${opts.root}`)
    process.exit(2)
  }
  return opts
}

// 确定性遍历：排序后返回；跳过工作树 / 构建产物目录。
// Deterministic walk: sorted, skipping worktrees and build-output directories.
function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), out)
    } else {
      out.push(join(dir, e.name))
    }
  }
  return out
}

const posix = (p) => p.split(sep).join('/')

// 部署范围：`yudao-server/pom.xml` 里**未被注释**的 `yudao-module-*`，按目录名对上（各模块的目录名就是
// 自己的 artifactId）。对不上就红 —— 新开的部署模块不该被这道门禁静默漏掉。
// The deployed scope: the **uncommented** `yudao-module-*` dependency in `yudao-server/pom.xml`, matched by
// directory name (each module's directory is named after its artifactId). A mismatch is an error — a newly
// deployed module must not slip past this gate silently.
function deployedDirs(root) {
  const pom = join(root, 'yudao-server', 'pom.xml')
  if (!existsSync(pom)) return null
  const text = readFileSync(pom, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  const ids = new Set(
    [...text.matchAll(/<artifactId>\s*(yudao-module-[A-Za-z0-9-]+)\s*<\/artifactId>/g)].map((m) => m[1]),
  )
  const byDir = new Map()
  for (const f of walk(root)) {
    if (basename(f) !== 'pom.xml') continue
    const dir = dirname(f)
    const name = basename(dir)
    if (ids.has(name)) byDir.set(name, posix(relative(root, dir)))
  }
  const missing = [...ids].filter((id) => !byDir.has(id)).sort()
  if (missing.length) {
    console.error(
      `check-sql-aliases: deployed module(s) with no directory named after the artifactId: ${missing.join(', ')}\n` +
        'check-sql-aliases: a deployed module must be visible to this gate — fix the module layout or this lookup',
    )
    process.exit(2)
  }
  return byDir
}

// Java：把注释与字符串字面量抹成等长空格，得到「只有结构」的文本；同时记下字符串字面量的区间，
// 因为 SQL 只在字符串里。
// Java: blank comments and string literals to equal-length spaces, giving a structure-only text; also record
// the string-literal ranges, because the SQL lives only in them.
function blankJava(src) {
  const out = src.split('')
  const strings = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') out[i++] = ' '
      continue
    }
    if (c === '/' && n === '*') {
      out[i++] = ' '
      out[i++] = ' '
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' '
        i++
      }
      if (i < src.length) {
        out[i++] = ' '
        out[i++] = ' '
      }
      continue
    }
    if (c === '"') {
      const start = i
      if (src.startsWith('"""', i)) {
        i += 3
        while (i < src.length && !src.startsWith('"""', i)) {
          if (src[i] !== '\n') out[i] = ' '
          i++
        }
        i = Math.min(src.length, i + 3)
      } else {
        i++
        while (i < src.length) {
          if (src[i] === '\\') {
            out[i++] = ' '
            if (i < src.length) out[i++] = ' '
            continue
          }
          if (src[i] === '"') {
            i++
            break
          }
          if (src[i] !== '\n') out[i] = ' '
          i++
        }
      }
      for (let k = start; k < i; k++) if (src[k] !== '\n') out[k] = ' '
      strings.push({ start, end: i })
      continue
    }
    if (c === "'") {
      i++
      while (i < src.length) {
        if (src[i] === '\\') {
          i += 2
          continue
        }
        if (src[i] === "'") {
          i++
          break
        }
        i++
      }
      continue
    }
    i++
  }
  return { code: out.join(''), strings }
}

function matchForward(code, from, open, close) {
  let depth = 0
  for (let i = from; i < code.length; i++) {
    if (code[i] === open) depth++
    else if (code[i] === close) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

const scanBackToStatement = (code, i) => {
  let j = i - 1
  while (j >= 0 && !';{}'.includes(code[j])) j--
  return j + 1
}

// 从声明片段里取返回类型：去掉注解与修饰符后剩下的就是它。
// The return type out of a declaration fragment: everything left after removing annotations and modifiers.
function returnTypeOf(chunk) {
  const t = chunk
    .replace(/@[\w$.]+(?:\s*\([^)]*\))?/g, ' ')
    .replace(/\b(public|private|protected|static|final|default|abstract|synchronized|native|strictfp)\b/g, ' ')
    .trim()
  if (!t || t.includes('=') || t.includes('(') || t.includes(')')) return null
  return t
}

// 方法声明：名字后面是 `(`，`throws` 之后是 `{`（有体）或 `;`（接口方法）。名字前面必须是返回类型，
// 故调用 `foo()` 语句（前面没有类型）不会被当成声明。
// Method declarations: a name followed by `(`, then after an optional `throws` either `{` (a body) or `;`
// (an interface method). A return type must precede the name, so a call statement `foo();` (no type before
// it) is not mistaken for a declaration.
function findMethods(code) {
  const methods = []
  const re = /([A-Za-z_$][\w$]*)\s*\(/g
  let m
  while ((m = re.exec(code))) {
    const name = m[1]
    if (NOT_METHODS.has(name)) continue
    // `.foo(` 是调用；`new Foo(` 是构造。两者都不是声明。
    // `.foo(` is a call; `new Foo(` is a construction. Neither declares anything.
    const beforeName = code.slice(Math.max(0, m.index - 16), m.index)
    if (/[.\w$]\s*$/.test(beforeName) && /\.\s*$/.test(beforeName)) continue
    if (/\bnew\s*$/.test(beforeName)) continue
    const openParen = m.index + m[0].length - 1
    const closeParen = matchForward(code, openParen, '(', ')')
    if (closeParen < 0) continue
    let j = closeParen + 1
    while (j < code.length && /\s/.test(code[j])) j++
    if (code.startsWith('throws', j)) {
      while (j < code.length && code[j] !== '{' && code[j] !== ';') j++
    }
    let bodyStart = -1
    let end = -1
    if (code[j] === '{') {
      bodyStart = j
      end = matchForward(code, j, '{', '}')
    } else if (code[j] === ';') {
      end = j
    } else {
      continue
    }
    if (end < 0) continue
    const start = scanBackToStatement(code, m.index)
    const returnType = returnTypeOf(code.slice(start, m.index))
    if (!returnType) continue
    methods.push({ name, start, sigStart: m.index, bodyStart, end, returnType })
  }
  return methods
}

function methodAt(methods, offset) {
  const hits = methods.filter((m) => offset >= m.start && offset <= m.end)
  if (!hits.length) return null
  hits.sort((a, b) => a.end - a.start - (b.end - b.start))
  return hits[0]
}

const isMapType = (text) => /\bMap\b/.test(text)

// `CAST(x AS DATE)` 里的 `AS` 后面是类型名，不是别名。
// The `AS` in `CAST(x AS DATE)` is followed by a type name, not an alias.
function insideCast(text, asIndex) {
  let depth = 0
  for (let i = asIndex - 1; i >= 0; i--) {
    if (text[i] === ')') depth++
    else if (text[i] === '(') {
      if (depth > 0) {
        depth--
        continue
      }
      return /\b(CAST|CONVERT|TRY_CAST)\s*$/i.test(text.slice(Math.max(0, i - 24), i))
    }
  }
  return false
}

// 规则内的别名：同时有小写与大写（`priceSum`、`price_Sum`）。只有大写（`FOLDER_ID`）是**同一失效机制**
// 的另一种写法，但不在本轮规则内 —— 它只报警告，见文件头。
// The alias this rule covers: both lower and upper case (`priceSum`, `price_Sum`). Upper-case only
// (`FOLDER_ID`) is the **same failure mode** in another spelling but outside this round's rule — it warns,
// see the header.
const camelCase = (token) => /[a-z]/.test(token) && /[A-Z]/.test(token)
const upperOnly = (token) => /[A-Z]/.test(token) && !/[a-z]/.test(token)

function toSnake(token) {
  return token
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
}

// SQL 里显式 `AS <alias>`。双引号包住的是允许的例外（见文件头判据 1）。
// An explicit `AS <alias>` in SQL. A double-quoted one is the allowed exception (criterion 1 in the header).
const AS_RE = /\bAS\s+(?:"([^"]*)"|`([^`]*)`|([A-Za-z_][A-Za-z0-9_]*))/gi

function explicitAliases(text, base) {
  const found = []
  for (const m of text.matchAll(AS_RE)) {
    const [, dq, bq, bare] = m
    if (dq !== undefined) continue
    if (bq !== undefined) {
      if (camelCase(bq)) found.push({ alias: bq, offset: base + m.index, kind: 'backtick', severity: 'error' })
      else if (upperOnly(bq)) found.push({ alias: bq, offset: base + m.index, kind: 'backtick', severity: 'warn' })
      continue
    }
    if (TYPE_WORDS.has(bare.toLowerCase())) continue
    if (insideCast(text, m.index)) continue
    if (camelCase(bare)) found.push({ alias: bare, offset: base + m.index, kind: 'explicit', severity: 'error' })
    else if (upperOnly(bare)) found.push({ alias: bare, offset: base + m.index, kind: 'explicit', severity: 'warn' })
  }
  return found
}

// 隐式别名：`<表达式> <camelCase>` 紧跟 `,` / `FROM` / SQL 结尾。先抹掉字符串字面量与 `AS` 片段，
// 免得把字面量里的词或 `AS x` 里的 x 再数一次。
// Implicit aliases: `<expression> <camelCase>` immediately before `,` / `FROM` / the end of the SQL. String
// literals and `AS` fragments are masked first, so a word inside a literal or the x in `AS x` is not counted
// twice.
function implicitAliases(text, base) {
  const masked = text
    .replace(/'(?:[^']|'')*'/g, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/\bAS\s+(?:"[^"]*"|`[^`]*`|[A-Za-z_][A-Za-z0-9_]*)/gi, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/--[^\n]*/g, (s) => s.replace(/[^\n]/g, ' '))
  const found = []
  const re = /(\S)\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?=,|FROM\b|$)/g
  let m
  while ((m = re.exec(masked))) {
    const alias = m[2]
    if (TYPE_WORDS.has(alias.toLowerCase()) || KEYWORDS.has(alias.toLowerCase())) continue
    if (camelCase(alias)) found.push({ alias, offset: base + m.index + m[0].indexOf(alias), kind: 'implicit', severity: 'error' })
    else if (upperOnly(alias)) found.push({ alias, offset: base + m.index + m[0].indexOf(alias), kind: 'implicit', severity: 'warn' })
  }
  return found
}

function lineIndexer(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return (offset) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}

function scanJava(root, file, rel, inScope) {
  const raw = readFileSync(file, 'utf8')
  const { code, strings } = blankJava(raw)
  const methods = findMethods(code)
  const lineOf = lineIndexer(raw)
  const findings = []

  for (const s of strings) {
    const sql = raw.slice(s.start + 1, s.end - 1)
    if (!/\bAS\b/i.test(sql) && !/,|from/i.test(sql)) continue
    const method = methodAt(methods, s.start)
    if (!method) continue
    const body = method.bodyStart >= 0 ? code.slice(method.bodyStart, method.end) : ''
    const mapResult = isMapType(method.returnType) || body.includes('selectMaps(') || /@MapKey\b/.test(raw.slice(method.start, method.sigStart))
    if (!mapResult) continue
    const aliases = [...explicitAliases(sql, s.start + 1), ...implicitAliases(sql, s.start + 1)]
    for (const a of aliases) {
      findings.push({ file: rel, line: lineOf(a.offset), ...a, returnType: method.returnType, scope: inScope })
    }
  }
  return findings
}

function scanXml(root, file, rel, inScope) {
  const raw = readFileSync(file, 'utf8')
  const lineOf = lineIndexer(raw)
  const masked = raw.replace(/<!--[\s\S]*?-->/g, (s) => s.replace(/[^\n]/g, ' '))
  const findings = []
  const re = /<select\b([^>]*)>/gi
  let m
  while ((m = re.exec(masked))) {
    const attrs = m[1]
    const typeMatch = attrs.match(/resultType\s*=\s*"([^"]*)"/i)
    const resultType = (typeMatch ? typeMatch[1] : '').trim().toLowerCase()
    if (!MAP_RESULT_TYPES.has(resultType)) continue
    const close = masked.indexOf('</select>', m.index)
    if (close < 0) continue
    const bodyStart = m.index + m[0].length
    const sql = raw.slice(bodyStart, close)
    const aliases = [...explicitAliases(sql, bodyStart), ...implicitAliases(sql, bodyStart)]
    for (const a of aliases) findings.push({ file: rel, line: lineOf(a.offset), ...a, scope: inScope })
  }
  return findings
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const byDir = deployedDirs(opts.root)
  const deployed = byDir ? [...byDir.keys()].sort() : []
  const inScope = (rel) => {
    if (!byDir) return true
    for (const dir of byDir.values()) if (rel === dir || rel.startsWith(`${dir}/`)) return true
    return false
  }

  const files = walk(opts.root)
    .map((f) => ({ abs: f, rel: posix(relative(opts.root, f)) }))
    .filter(({ rel }) => {
      if (rel.split('/').includes('test') || rel.split('/').includes('tests')) return false
      if (!rel.includes('/src/main/')) return false
      return rel.endsWith('Mapper.java') || rel.endsWith('Mapper.xml')
    })

  // 范围外的文件也扫、只不判 —— 这样摘要能如实报出「有多少条没查」，而不是让范围静默地变小。
  // Out-of-scope files are scanned but not judged, so the summary can report how many were left out rather
  // than letting the scope shrink silently.
  const findings = []
  for (const { abs, rel } of files) {
    const scope = inScope(rel)
    if (rel.endsWith('.java')) findings.push(...scanJava(opts.root, abs, rel, scope))
    else findings.push(...scanXml(opts.root, abs, rel, scope))
  }

  const reported = opts.all ? findings : findings.filter((f) => f.scope)
  const outside = opts.all ? [] : findings.filter((f) => !f.scope)
  reported.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1))
  const errors = reported.filter((f) => f.severity === 'error')
  const warnings = reported.filter((f) => f.severity === 'warn')

  for (const f of reported) {
    const snake = toSnake(f.alias)
    const how = f.kind === 'backtick'
      ? 'a backtick-quoted alias — PostgreSQL has no backticks'
      : f.kind === 'implicit'
        ? 'an implicit column alias'
        : 'a column alias'
    const prefix = f.severity === 'warn' ? 'warn: ' : ''
    console.error(
      `${f.file}:${f.line}: ${prefix}${how} \`${f.alias}\` on a Map-returning query — ` +
        `PostgreSQL folds it to \`${f.alias.toLowerCase()}\`, so the map key \`${f.alias}\` is missing; ` +
        `write \`AS ${snake}\` and read the key as \`${snake}\``,
    )
  }

  const scopeText = opts.all
    ? 'every module (--all)'
    : byDir
      ? `deployed scope (${deployed.join(', ')})`
      : 'every module (no yudao-server/pom.xml)'
  if (errors.length) {
    console.error(
      `check-sql-aliases: ${errors.length} camelCase alias(es) in ${new Set(errors.map((f) => f.file)).size} file(s) — ${scopeText}`,
    )
    return 1
  }
  const notes = []
  if (warnings.length) {
    notes.push(
      `${warnings.length} warning(s): upper-case-only alias(es) — the same PostgreSQL failure, outside this round's camelCase rule`,
    )
  }
  if (outside.length && !opts.all) {
    notes.push(`${outside.length} alias(es) outside the deployed scope not checked (use --all to audit them)`)
  }
  const note = notes.length ? `; ${notes.join('; ')}` : ''
  console.log(
    `check-sql-aliases: OK — no camelCase column alias on a Map-returning query in the ${scopeText}${note}`,
  )
  return 0
}

process.exitCode = main()
