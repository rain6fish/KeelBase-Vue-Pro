#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 触发词唯一性：**两个不同的工具面不得对同一句话都答一声「是我」**。
//
//   node scripts/check-trigger-uniqueness.mjs
//   KEELBASE_ROOT=<另一份检出> node scripts/check-trigger-uniqueness.mjs
//
// 退出码：0 = 没有撞词；1 = 有撞词（逐条点名）；2 = **这个读脚本自己读不懂**（见下）。
//
// 为什么要这道门。规划器选路用的是**裸子串**：`ModuleRoutePlanner.plan` 对每条路由的每个触发词做
// `text.contains(trigger)`，第一条命中的路由赢，路由顺序由 Spring 扫描决定、跨配置类时不是作者的本意。
// 于是「一句话两个工具都认」不会报错，只会**安静地走错一条**，而且走错哪条取决于注册顺序。两起事故都是跑起来
// 才发现的：
//
//   - `pms` 的「我的待办」撞 BPM 的 `list_my_bpm_tasks`（单测当场红，改名为「项目待办」）；
//   - `oa` 的「看我的请假」被 BPM 样例的 `list_my_oa_leaves` 抢走并拒绝 —— **至今只有真栈场景门抓得到**。
//
// 判据与 `YudaoGovernanceContextTest.noTwoToolFacesClaimTheSamePhrase` **同一条**，只是提前到不需要构建的地方：
//
//   1. **不同工具面**之间，两条触发词若相同、或一条是另一条的子串 ⇒ 红。子串是这里的真危险：消息里含得下长的，
//      就必然含得下短的。**同一个工具面之内**（同一个类里的几条路由）不算 —— 那里声明次序就是答案，BPM 的
//      撤回/列出、infra 的删除/列出都是刻意这么写的，Java 那道断言也把同一类排除在外。
//   2. **完全相同的触发词出现在两条不同声明**里 ⇒ 红，**哪怕在同一个类里**：后声明的那条永远命中不了，是一条
//      死路由；子串重叠可以由次序回答，重复不行。
//   3. **空串或空白触发词** ⇒ 红：`text.contains("")` 对任何非空消息都成立，它会把**一切**抢走。
//   4. 指向**同一个工具**的两条路由共用一个触发词不算撞（去处相同，先命中哪条都一样）。
//
// **它必须自己能被证伪。** 读不懂某种声明形状就 **exit 2**，不静默跳过 —— 一个「读成空表」的解析器会让这道门
// 永远绿，那正是它要防的那种假绿。`scripts/trigger-uniqueness.test.mjs` 用临时目录里的真源码 fixture 双向证
// 红/绿，并对真仓库跑一遍。
//
// **为什么它比 Java 那道断言更早**：`noTwoToolFacesClaimTheSamePhrase` 要 Maven 编译整个 `yudao-server`、
// 起一个 Spring 上下文才跑得到，且只看得见**被装进上下文的 bean** —— 一个没被扫描到的类、一个不在本部署里的
// 模块，在它那里是**不存在的**，在这道门里是一行源码。这道门纯 Node、读源码文本、约百毫秒，落在 CI 的
// `governance-registry` job 里；它和 Java 那道读的是**同一份事实**，守的是「这句话在最快的地方能被读到」。
//
// 射程写明：只读 `yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/` 下的 `.java`（含 `generated/`）。
// `keelbase-codegen` 里的 `ToolsGenerator` 是**模板**（其文本里有 `%s` 占位符），不是真触发词，故不在射程内；
// 它与生成物的一致性由 `boundary-keeper` 与 `--check-boundary` 各自守着。
//
// ── English ─────────────────────────────────────────────────────────────────────
//
// Trigger uniqueness: **two different tool faces must not both answer to the same phrase**.
//
//   node scripts/check-trigger-uniqueness.mjs
//   KEELBASE_ROOT=<another checkout> node scripts/check-trigger-uniqueness.mjs
//
// Exit codes: 0 = no collision; 1 = collisions (each named); 2 = **this reader cannot read something** (below).
//
// Why the gate exists. The planner routes on a **bare substring**: `ModuleRoutePlanner.plan` does
// `text.contains(trigger)` for every trigger of every route and the first route to match wins, where the order
// comes from Spring scanning and, across configuration classes, is not what the author meant. A phrase two
// tools both claim therefore raises nothing — it quietly takes the wrong road, and which road depends on
// registration order. Both incidents were found by running the stack:
//
//   - `pms`'s 「我的待办」 collided with BPM's `list_my_bpm_tasks` (a unit test went red; renamed to 「项目待办」);
//   - `oa`'s 「看我的请假」 was taken by the BPM sample's `list_my_oa_leaves` and refused — **only a real-stack
//     scenario gate catches this one today**.
//
// The criterion is **the same one** `YuanDaoGovernanceContextTest.noTwoToolFacesClaimTheSamePhrase` states; this
// just puts it where no build is needed:
//
//   1. Between **different tool faces**, two triggers that are equal or where one is a substring of the other
//      ⇒ red. Substring is the real hazard: a message that holds the long phrase necessarily holds the short
//      one. **Within one tool face** (several routes of one class) it does not count — declaration order is the
//      answer there, and BPM's cancel/list and infra's delete/list are written that way on purpose; the Java
//      assertion excludes the same case.
//   2. The **exact same trigger in two different declarations** ⇒ red, **even inside one class**: the later
//      route can never be reached, so it is a dead route. Substring overlap can be answered by order; equality
//      cannot.
//   3. An **empty or blank trigger** ⇒ red: `text.contains("")` holds for every non-empty message, so it takes
//      **everything**.
//   4. Two routes that point at the **same tool** sharing a trigger is not a collision (same destination, so
//      whichever wins is the same answer).
//
// **It has to be falsifiable itself.** A declaration shape it cannot read exits **2** rather than being skipped
// — a reader that reads an empty list would keep this gate green forever, which is the false green it exists to
// prevent. `scripts/trigger-uniqueness.test.mjs` proves red and green both ways against real-source fixtures in
// a temporary directory, and runs once against the real repository.
//
// **Why this runs earlier than the Java assertion**: `noTwoToolFacesClaimTheSamePhrase` needs Maven to compile
// all of `yudao-server` and a Spring context to boot, and it only sees the **beans that context holds** — a class
// nobody scanned, or a module this deployment does not load, simply is not there for it. Here it is a line of
// source. This gate is pure Node, reads the source text, takes about a hundred milliseconds, and runs in CI's
// `governance-registry` job; both read **the same fact**, and this one guards "that sentence is readable at the
// earliest point".
//
// Scope, stated rather than implied: the `.java` files under
// `yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/` (including `generated/`). `ToolsGenerator` in
// `keelbase-codegen` is a **template** (`%s` placeholders in its text), not real triggers, so it is out of scope;
// its consistency with the generated files is guarded by `boundary-keeper` and `--check-boundary`.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.KEELBASE_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')
const SCOPE = join('yudao-server', 'src', 'main', 'java', 'cn', 'iocoder', 'yudao', 'server', 'keelbase')

/**
 * 声明出来的例外：`[短语, 工具甲, 工具乙, 理由]`。今天一条也没有 —— 判据没放宽，真撞了就改文案。
 *
 * **空着也要查两边**：一条声明若不再撞词（改过名、删过一条），它自己就是过期的，脚本会红着要你删掉它。这样
 * 「例外表」不会悄悄长大，也不会悄悄变成一层永远不需要再看的豁免。
 *
 * Declared exceptions: `[phrase, toolA, toolB, reason]`. There are none today — the criterion was not widened;
 * a real collision was fixed by changing the wording.
 *
 * **An empty table is still checked both ways**: an entry that no longer collides (renamed, one side deleted) is
 * itself stale, and the script goes red asking for it to be dropped. An exception table can then neither grow
 * quietly nor become a blanket nobody reads again.
 */
const EXEMPT = []

/** 读不懂时抛这个，由 `main` 收成 exit 2 —— 绝不吞掉。 / Thrown when the reader cannot read a shape; `main` turns it into exit 2 — never swallowed. */
class ReaderError extends Error {
  constructor(file, line, detail) {
    super(`${file}:${line}: ${detail}`)
    this.name = 'ReaderError'
    this.file = file
    this.line = line
    this.detail = detail
  }
}

/**
 * 把注释抹成空格、**保持每个字符的位置**（换行留着），于是偏移量在原文上仍然有效，行号可以照数。
 * 字符串与字符字面量里的内容不动。
 *
 * Blank comments to spaces while **keeping every character position** (newlines included), so offsets stay valid
 * on the original text and line numbers still count. String and char literals are left alone.
 */
function blankComments(src) {
  const out = src.split('')
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '"' || c === "'") {
      i = skipQuoted(src, i)
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') {
        out[i] = ' '
        i += 1
      }
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      out[i] = ' '
      out[i + 1] = ' '
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' '
        i += 1
      }
      if (i < src.length) {
        out[i] = ' '
        out[i + 1] = ' '
        i += 2
      }
      continue
    }
    i += 1
  }
  return out.join('')
}

/** 同上，再把字符串/字符字面量**连内容一起**抹掉 —— 结构扫描（大括号、类与方法关键字）用它，字符串里的 `{` 就不算数。 */
/** As above, but the contents of string/char literals are blanked too — structure scanning uses this, so a `{` inside a string does not count. */
function blankLiterals(src) {
  const out = src.split('')
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '"' || c === "'") {
      const end = skipQuoted(src, i)
      for (let j = i; j < end; j += 1) {
        if (out[j] !== '\n') out[j] = ' '
      }
      i = end
      continue
    }
    i += 1
  }
  return out.join('')
}

/** 跳过从 `i` 开始的那个字符串或字符字面量，返回其后的下标。未闭合就返回源码长度。 / Skip the string/char literal starting at `i`; return the index after it, or the source length if unterminated. */
function skipQuoted(src, i) {
  const quote = src[i]
  let j = i + 1
  while (j < src.length) {
    if (src[j] === '\\') {
      j += 2
      continue
    }
    if (src[j] === quote) return j + 1
    j += 1
  }
  return j
}

/** 从 `openIdx` 处的 `{` 或 `(` 找到配平的那个，跳过字面量。找不到返回 -1。 / Find the bracket matching the one at `openIdx`, skipping literals; -1 if unbalanced. */
function matchBracket(src, openIdx) {
  const open = src[openIdx]
  const close = open === '{' ? '}' : open === '(' ? ')' : ']'
  let depth = 0
  for (let i = openIdx; i < src.length; i += 1) {
    const c = src[i]
    if (c === '"' || c === "'") {
      i = skipQuoted(src, i) - 1
      continue
    }
    if (c === open) depth += 1
    else if (c === close) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

const lineAt = (src, offset) => src.slice(0, offset).split('\n').length

/** 类、接口、枚举、record 的声明及其花括号跨度 —— 「工具面」就是这么算出来的（Java 那道断言取的是 `getEnclosingClass()`）。 */
/** Class/interface/enum/record declarations and their brace spans — this is how a "tool face" is computed (the Java assertion takes `getEnclosingClass()`). */
function typeDeclarations(naked) {
  const types = []
  const pattern = /\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/g
  for (const m of naked.matchAll(pattern)) {
    const brace = naked.indexOf('{', m.index + m[0].length)
    if (brace === -1) continue
    // `record Page(...)` / `class X<T> extends Y` —— 关键字与名字之后到 `{` 之间还有一个参数表或父类型，这里
    // 只需确认那段里没有 `;`（有的话它就是个前向声明而不是真的类型体）。
    // Between the keyword and `{` sit parameter lists or supertypes; only `;` there means this is not a type body.
    if (naked.slice(m.index, brace).includes(';')) continue
    const end = matchBracket(naked, brace)
    if (end === -1) continue
    types.push({ name: m[1], start: m.index, bodyStart: brace, end })
  }
  return types
}

/** 从内到外，含住 `pos` 的那些类型。 / Every type containing `pos`, innermost first. */
const typesAt = (types, pos) =>
  types.filter((t) => t.bodyStart < pos && pos < t.end).sort((a, b) => b.bodyStart - a.bodyStart)

/** 解析一个 Java 字符串字面量的内容（本仓的触发词没有转义，但解读义不花什么钱）。 / Decode one Java string literal (no escapes in these triggers, but decoding costs little). */
function decodeLiteral(text) {
  return text.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, esc) => {
    if (esc[0] === 'u') return String.fromCharCode(parseInt(esc.slice(1), 16))
    const map = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', "'": "'", '\\': '\\' }
    return map[esc] ?? esc
  })
}

/**
 * 按**顶层**逗号切开参数表，字符串里的逗号不算；每个参数带着它在 `text` 里的起点，好让重复条目各自报到自己的行。
 *
 * Split arguments on top-level commas (commas inside literals do not count); each part carries its start offset so
 * two identical entries still report their own lines.
 */
function splitArguments(text) {
  const parts = []
  let current = ''
  let start = 0
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '"' || c === "'") {
      const end = skipQuoted(text, i)
      current += text.slice(i, end)
      i = end
      continue
    }
    if (c === ',') {
      parts.push({ text: current, start })
      current = ''
      i += 1
      start = i
      continue
    }
    current += c
    i += 1
  }
  if (current.trim() !== '') parts.push({ text: current, start })
  return parts
}

/**
 * 一处**算出来的**触发词声明：`ConsolePages.NavigateRoute` 的短语是 `PAGES.stream().map(NavigateRoute::triggerOf)`，
 * 不是字面量表。它只有这一处，于是这里**点名**读它，而不是放宽「只认字面量」的判据；形状一变就 `ReaderError`。
 *
 * One **computed** trigger declaration: `ConsolePages.NavigateRoute`'s phrases come from
 * `PAGES.stream().map(NavigateRoute::triggerOf)`, not a literal list. There is exactly one, so it is read **by
 * name** here rather than by widening the "literals only" rule; a changed shape is a `ReaderError`.
 */
function readConsolePages(clean, naked, rel, typeSpan) {
  const body = naked.slice(typeSpan.bodyStart, typeSpan.end)
  if (!/PAGES\.stream\(\)\.map\(NavigateRoute::triggerOf\)\.toList\(\)/.test(body)) {
    throw new ReaderError(
      rel,
      lineAt(naked, typeSpan.bodyStart),
      'the computed trigger form changed — teach readConsolePages() the new one, or write the phrases out as literals',
    )
  }

  const pagesAnchor = /static\s+final\s+List<Page>\s+PAGES\s*=\s*List\.of\s*\(/.exec(naked)
  if (!pagesAnchor) throw new ReaderError(rel, 1, '`PAGES` is gone — the computed triggers have lost their source')
  const open = naked.indexOf('(', pagesAnchor.index + pagesAnchor[0].length - 1)
  const close = matchBracket(naked, open)
  if (close === -1) throw new ReaderError(rel, lineAt(naked, open), 'unbalanced `List.of(` for `PAGES`')

  const entries = []
  const pagePattern = /new\s+Page\s*\(/g
  const args = clean.slice(open + 1, close)
  for (const m of args.matchAll(pagePattern)) {
    const start = open + 1 + m.index
    const paren = clean.indexOf('(', start)
    const end = matchBracket(clean, paren)
    if (end === -1) throw new ReaderError(rel, lineAt(clean, paren), 'unbalanced `new Page(`')
    const literals = [...clean.slice(paren + 1, end).matchAll(/"((?:[^"\\]|\\.)*)"/g)]
    if (literals.length < 2) {
      throw new ReaderError(rel, lineAt(clean, paren), 'a `new Page(...)` entry has no name — cannot derive its trigger')
    }
    entries.push({ name: decodeLiteral(literals[1][1]), offset: start })
  }
  if (entries.length === 0) throw new ReaderError(rel, lineAt(naked, open), '`PAGES` is empty — the computed triggers have lost their source')

  const triggerOf = /String\s+triggerOf\s*\(\s*Page\s+\w+\s*\)\s*\{/.exec(naked)
  if (!triggerOf) throw new ReaderError(rel, 1, '`triggerOf` is gone — the computed triggers have lost their rule')
  const triggerBrace = naked.indexOf('{', triggerOf.index)
  const triggerEnd = matchBracket(naked, triggerBrace)
  const rule = /return\s+"((?:[^"\\]|\\.)*)"\s*\+\s*\w+\.name\(\)\s*;/.exec(
    clean.slice(triggerBrace, triggerEnd === -1 ? undefined : triggerEnd),
  )
  if (!rule) {
    throw new ReaderError(
      rel,
      lineAt(clean, triggerBrace),
      '`triggerOf` no longer reads `"<prefix>" + page.name()` — teach this reader the new rule',
    )
  }
  const prefix = decodeLiteral(rule[1])
  return entries.map((e) => ({ phrase: prefix + e.name, offset: e.offset }))
}

/** 一处声明的全部触发词，及各自的行号。读不懂就 `ReaderError`。 / All triggers of one declaration with their lines; an unreadable shape is a `ReaderError`. */
function readTriggers(clean, naked, rel, bodyStart, bodyEnd) {
  const raw = clean.slice(bodyStart, bodyEnd)
  const inner = raw.trim()

  const listOf = /^\{?\s*return\s+List\.of\s*\(/.exec(inner)
  if (!listOf) {
    if (/PAGES\.stream\(\)/.test(inner)) {
      const line = lineAt(clean, bodyStart)
      throw new ReaderError(
        rel,
        line,
        'computed trigger table detected mid-body — readConsolePages() expects it in its own route class',
      )
    }
    throw new ReaderError(
      rel,
      lineAt(clean, bodyStart),
      'this `triggers()` does not return a `List.of("…", "…")` of string literals — the reader cannot evaluate ' +
        'it, and reading it as empty would keep this gate green forever',
    )
  }

  const parenOpen = bodyStart + raw.indexOf('(', raw.indexOf('List.of') + 'List.of'.length)
  const parenClose = matchBracket(clean, parenOpen)
  if (parenClose === -1) throw new ReaderError(rel, lineAt(clean, parenOpen), 'unbalanced `List.of(` in `triggers()`')
  const tail = raw.slice(parenClose - bodyStart + 1).replace(/[\s;]/g, '')
  if (tail !== '' && !tail.startsWith('}')) {
    throw new ReaderError(rel, lineAt(clean, parenClose), `unexpected text after \`List.of(...)\`: ${JSON.stringify(tail)}`)
  }

  const args = clean.slice(parenOpen + 1, parenClose)
  const triggers = []
  for (const part of splitArguments(args)) {
    // 参数带着它前面的空白（换行与缩进），字面量自己的位置要跳过那段 —— 否则跨行写的第二条会报到上一行。
    // A part carries the whitespace before it (newline and indent); the literal's own offset skips it, so a second
    // entry written on the next line reports the next line.
    const offset = parenOpen + 1 + part.start + (part.text.length - part.text.trimStart().length)
    const literal = /^"((?:[^"\\]|\\.)*)"$/.exec(part.text.trim())
    if (!literal) {
      throw new ReaderError(
        rel,
        lineAt(clean, offset),
        `a trigger is not a plain string literal (${JSON.stringify(part.text.trim().slice(0, 40))}) — a declaration this ` +
          'reader cannot evaluate would be read as absent',
      )
    }
    triggers.push({ phrase: decodeLiteral(literal[1]), offset })
  }
  return triggers
}

/**
 * 一处路由的 `toolName()`。没有或读不出就 `ReaderError` —— 撞词报告要点名工具，缺名字的声明一样读不得。
 * 允许 `return "字面量";` 与 `return CONSTANT;`（常量须是同文件里的 `static final String CONSTANT = "…";`，
 * 且恰好一处）—— 后者是 `ConsolePages` 的写法，**点名**认得，而不是把「只认字面量」放宽成「猜」。
 *
 * A route's `toolName()`; missing or unreadable is a `ReaderError` — a collision report has to name the tools.
 * Both `return "literal";` and `return CONSTANT;` are accepted (the constant must be exactly one
 * `static final String CONSTANT = "…";` in the same file) — that is how `ConsolePages` writes it, read **by
 * name** rather than by loosening "literals only" into a guess.
 */
function readToolName(clean, naked, rel, typeSpan) {
  const region = naked.slice(typeSpan.bodyStart, typeSpan.end)
  const method = /String\s+toolName\s*\(\s*\)\s*\{/.exec(region)
  if (!method) {
    throw new ReaderError(rel, lineAt(naked, typeSpan.bodyStart), `route class ${typeSpan.name} has no \`toolName()\``)
  }
  const brace = typeSpan.bodyStart + region.indexOf('{', method.index)
  const end = matchBracket(naked, brace)
  const body = clean.slice(brace, end === -1 ? undefined : end)
  const literal = /return\s+"((?:[^"\\]|\\.)*)"\s*;/.exec(body)
  if (literal) return { name: decodeLiteral(literal[1]), offset: brace }

  const reference = /return\s+([A-Za-z_$][\w$]*)\s*;/.exec(body)
  if (!reference) {
    throw new ReaderError(rel, lineAt(clean, brace), `\`toolName()\` of ${typeSpan.name} returns neither a literal nor a constant`)
  }
  const constant = new RegExp(`static\\s+final\\s+String\\s+${reference[1]}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"\\s*;`, 'g')
  const found = [...clean.matchAll(constant)]
  if (found.length !== 1) {
    throw new ReaderError(
      rel,
      lineAt(clean, brace),
      `\`toolName()\` of ${typeSpan.name} returns \`${reference[1]}\`, and this file declares it ${found.length} time(s) ` +
        '— exactly one `static final String` is what this reader can read',
    )
  }
  return { name: decodeLiteral(found[0][1]), offset: brace }
}

/** `SCOPE` 下全部 `.java`，按路径排序。 / Every `.java` under `SCOPE`, sorted by path. */
function javaFiles(root) {
  const dir = join(root, SCOPE)
  const out = []
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.java')) out.push(full)
    }
  }
  walk(dir)
  return out
    .map((full) => relative(root, full).split('\\').join('/'))
    .sort()
}

/**
 * 读一棵树：每条声明（工具名、工具面、短语及行号），以及读不懂的地方（`ReaderError`）。
 * 调用方决定把读不懂当什么；这里只如实收集。
 *
 * Read a tree: every declaration (tool, face, phrases and their lines) and every shape the reader could not read
 * (`ReaderError`). The caller decides what that means; this only reports it.
 */
export function audit(root = ROOT) {
  const declarations = []
  const unreadable = []
  let routeImplementations = 0

  const files = (() => {
    try {
      return javaFiles(root)
    } catch {
      throw new ReaderError(SCOPE, 1, `no sources under ${join(root, SCOPE)} — point KEELBASE_ROOT at a checkout`)
    }
  })()

  for (const rel of files) {
    const source = readFileSync(join(root, rel), 'utf8')
    const clean = blankComments(source)
    const naked = blankLiterals(clean)
    routeImplementations += (naked.match(/\bimplements\s+ModuleRoute\b/g) ?? []).length
    const types = typeDeclarations(naked)

    for (const m of naked.matchAll(/List\s*<\s*String\s*>\s*triggers\s*\(\s*\)\s*\{/g)) {
      const brace = m.index + m[0].length - 1
      const end = matchBracket(naked, brace)
      if (end === -1) {
        unreadable.push(new ReaderError(rel, lineAt(naked, brace), 'unbalanced `triggers()` body'))
        continue
      }
      // 方法签名在哪个类里 —— 最内层那个类型就是路由类本身。 / Which class holds the signature — the innermost type is the route class itself.
      const chain = typesAt(types, m.index)
      if (chain.length === 0) {
        unreadable.push(new ReaderError(rel, lineAt(naked, m.index), '`triggers()` is not inside any type body'))
        continue
      }
      const routeType = chain[0]
      const face = (chain[1] ?? chain[0]).name
      try {
        const tool = readToolName(clean, naked, rel, routeType)
        const triggers = /PAGES\.stream\(\)/.test(naked.slice(brace, end))
          ? readConsolePages(clean, naked, rel, routeType)
          : readTriggers(clean, naked, rel, brace, end)
        declarations.push({
          rel,
          line: lineAt(source, brace),
          face,
          route: routeType.name,
          tool: tool.name,
          toolLine: lineAt(source, tool.offset),
          triggers: triggers.map((t) => ({ phrase: t.phrase, line: lineAt(source, t.offset) })),
        })
      } catch (error) {
        if (!(error instanceof ReaderError)) throw error
        unreadable.push(error)
      }
    }
  }

  // 一条路由都没读到，与「读成空表」是同一件事：路径指错了、目录空了、扫描写坏了，都会让上面所有判据**空着成立**。
  // 一棵真检出不会没有路由，故这里直接判读脚本出错。
  // Zero routes read is the same thing as reading an empty list: a wrong path, an empty directory or a broken walk
  // would make every criterion above hold vacuously. A real checkout has routes, so this is the reader's error.
  if (routeImplementations === 0) {
    unreadable.push(
      new ReaderError(SCOPE, 1, `no \`implements ModuleRoute\` under ${join(root, SCOPE)} — the enumeration, not the tree, is wrong`),
    )
  }

  // 全树扫描的另一半：每个 `implements ModuleRoute` 都要有一条被读到的声明。少一条就说明有一种形状本读者**没看见**，
  // 那与「读成空表」是同一类假绿。
  // The other half of a whole-tree scan: every `implements ModuleRoute` needs a declaration that was read. One short
  // means a shape this reader **never saw**, which is the same class of false green as reading an empty list.
  const parsed = declarations.length
  if (unreadable.length === 0 && parsed !== routeImplementations) {
    unreadable.push(
      new ReaderError(
        SCOPE,
        1,
        `${routeImplementations} \`implements ModuleRoute\` but ${parsed} \`triggers()\` declaration(s) read — ` +
          'one of them is in a shape this reader does not see',
      ),
    )
  }

  return { declarations, unreadable, files: files.length, routeImplementations }
}

/**
 * 撞词：签过名的例外先扣掉，剩下的按同一工具面/同一工具/子串三条规则走。返回可打印的问题清单。
 *
 * Collisions: signed exemptions come off first; the rest go through the same-face / same-tool / substring rules.
 * Returns a printable list.
 */
export function collisions({ declarations }) {
  const problems = []
  const exemptHits = new Set()

  /** 报告里的一侧：工具、文件、行、短语 —— 四处都是打印时直接要用的。 / One side of a report: tool, file, line, phrase — everything the printer needs. */
  const side = (decl, trigger) => ({ phrase: trigger.phrase, tool: decl.tool, rel: decl.rel, line: trigger.line })

  const isExempt = (a, b) =>
    EXEMPT.some(([phrase, left, right]) => {
      const pair = [a.tool, b.tool]
      if (phrase !== a.phrase || phrase !== b.phrase) return false
      if (!pair.includes(left) || !pair.includes(right)) return false
      exemptHits.add(`${phrase}|${left}|${right}`)
      return true
    })

  for (const decl of declarations) {
    const seen = new Map()
    for (const trigger of decl.triggers) {
      if (trigger.phrase.trim() === '') {
        problems.push({
          kind: 'blank',
          phrase: trigger.phrase,
          a: side(decl, trigger),
          b: null,
          detail:
            'a blank trigger matches every non-empty message (`text.contains("")` is always true) — it would take every turn',
        })
        continue
      }
      if (seen.has(trigger.phrase)) {
        problems.push({
          kind: 'repeat-in-declaration',
          phrase: trigger.phrase,
          a: side(decl, trigger),
          b: side(decl, seen.get(trigger.phrase)),
          detail: 'the same phrase is listed twice in one declaration — the second copy can never be reached',
        })
        continue
      }
      seen.set(trigger.phrase, trigger)
    }
  }

  // 同一对声明、同一个短语可能从两个方向各报一次（甲的长句含乙的短句，乙的长句也含甲的另一句），而「完全相同」
  // 又把同一对声明下的同一句再报一次。按「声明对 + 那句短话」去重，完全相同优先于互为子串 —— 报告要读得下去，
  // 一条待办就该是一条。
  //
  // One pair of declarations and one phrase can be reported from both directions (A's long phrase holds B's short
  // one, and B's long phrase holds another of A's), and an exact match reports the same phrase again. Dedupe by
  // "declaration pair + that short phrase", with an exact match outranking a substring overlap — a report has to
  // stay readable, and one thing to fix should be one line.
  const found = new Map()
  for (let i = 0; i < declarations.length; i += 1) {
    for (let j = i + 1; j < declarations.length; j += 1) {
      const left = declarations[i]
      const right = declarations[j]
      if (left.tool === right.tool) continue
      for (const a of left.triggers) {
        if (a.phrase.trim() === '') continue
        for (const b of right.triggers) {
          if (b.phrase.trim() === '') continue
          const equal = a.phrase === b.phrase
          const overlap = a.phrase.includes(b.phrase) || b.phrase.includes(a.phrase)
          if (!equal && !(overlap && left.face !== right.face)) continue
          if (isExempt(a, b)) continue
          const phrase = equal ? a.phrase : a.phrase.length <= b.phrase.length ? a.phrase : b.phrase
          const key = [left.rel, left.tool, right.rel, right.tool, phrase].join('|')
          const problem = {
            kind: equal ? 'same-phrase' : 'substring',
            phrase,
            a: side(left, a),
            b: side(right, b),
            detail: equal
              ? left.face === right.face
                ? 'two routes of one class claim the exact same phrase — the later one is unreachable'
                : 'two tool faces claim the exact same phrase — the first one registered wins, and the order is not the author\'s'
              : 'one phrase is a substring of the other, so any message holding the long one also holds the short one',
          }
          const existing = found.get(key)
          if (existing && (existing.kind === 'same-phrase' || problem.kind === 'substring')) continue
          found.set(key, problem)
        }
      }
    }
  }
  problems.push(...found.values())

  for (const entry of EXEMPT) {
    if (!exemptHits.has(`${entry[0]}|${entry[1]}|${entry[2]}`)) {
      problems.push({
        kind: 'stale-exemption',
        phrase: entry[0],
        a: { tool: entry[1], rel: '(EXEMPT)', line: 0 },
        b: { tool: entry[2], rel: '(EXEMPT)', line: 0 },
        detail: 'this exemption no longer describes a collision — drop it, so an exception cannot rot into a blanket',
      })
    }
  }

  return problems
}

/** 一条问题的两行：短语、两个工具名与各自 `file:line`，再加改法。 / The two lines for one problem: phrase, both tools with `file:line`, then the fix. */
function describe(problem) {
  const at = (side) => `${side.tool} · ${side.rel}:${side.line}`
  switch (problem.kind) {
    case 'blank':
      return [
        `  ✗ 空白触发词 · ${problem.a.tool} · ${problem.a.rel}:${problem.a.line}`,
        `    ${problem.detail}`,
        `    改法：删掉这个空条目。 / Fix: remove the blank entry.`,
      ]
    case 'repeat-in-declaration':
      return [
        `  ✗ 「${problem.phrase}」在同一处声明里写了两遍 · ${problem.a.tool} · ${problem.a.rel}:${problem.a.line}（第二遍在 :${problem.b.line}）`,
        `    ${problem.detail}`,
        `    改法：删掉第二遍（或改成别的短语）。 / Fix: drop the second copy (or make it a different phrase).`,
      ]
    case 'stale-exemption':
      return [
        `  ✗ 过期的例外 · 「${problem.phrase}」 · ${problem.a.tool} ↔ ${problem.b.tool}`,
        `    ${problem.detail}`,
        `    改法：从 EXEMPT 里删掉这一行。 / Fix: delete that entry from EXEMPT.`,
      ]
    default:
      return [
        `  ✗ 「${problem.phrase}」 · ${at(problem.a)}  ↔  ${at(problem.b)}`,
        `    ${problem.detail}`,
        '    改法：把其中一条改成**不**与另一条互为子串的短语（加限定词，如 pms 把「我的待办」改成「项目待办」），',
        '          或删掉多余的那一条。**不要**放宽判据：规划器就是按子串匹配、第一条命中就赢。',
        '    Fix: change one of them so neither is a substring of the other (a qualifier — pms turned 「我的待办」 into',
        '          「项目待办」), or delete the redundant one. Do not widen the criterion: the planner matches by',
        '          substring and first hit wins.',
      ]
  }
}

function main() {
  let result
  try {
    result = audit(ROOT)
  } catch (error) {
    if (!(error instanceof ReaderError)) throw error
    console.error(`✗ 读不了：${error.message}`)
    console.error(`  cannot read the tree — the gate, not the tree, is what needs fixing`)
    process.exit(2)
  }

  if (result.unreadable.length > 0) {
    console.error('✗ 这份读脚本读不懂下面这些声明 —— 不跳过、不当作空表：')
    console.error('  this reader cannot read the declarations below — it does not skip them or read them as empty:')
    for (const error of result.unreadable) console.error(`    ${error.message}`)
    console.error('')
    console.error(`  ${result.unreadable.length} declaration(s) unreadable under ${SCOPE} — fix the reader (or the shape), do not skip them`)
    process.exit(2)
  }

  const problems = collisions(result)
  const phrases = result.declarations.reduce((n, d) => n + d.triggers.length, 0)

  if (problems.length > 0) {
    console.error('')
    for (const problem of problems) {
      for (const line of describe(problem)) console.error(line)
      console.error('')
    }
    console.error(`${problems.length} 处撞词：两个不同的工具面对同一句话都能作答，走哪条取决于注册顺序。`)
    console.error(`${problems.length} collision(s): two different tool faces both answer to one phrase, and which one runs is registration order.`)
    console.log(`${phrases} trigger(s) / ${problems.length} problem(s)`)
    process.exit(1)
  }

  console.log(
    `\n${phrases} trigger(s) in ${result.declarations.length} declaration(s) across ${result.files} file(s) — ` +
      'no two tool faces share one, and no declaration repeats itself',
  )
  console.log(`${result.declarations.length} ok / 0 failed`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
