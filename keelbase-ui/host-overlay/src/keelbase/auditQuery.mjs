// SPDX-License-Identifier: Apache-2.0

// 按**业务对象 + 时间区间**读审计，并把六问导成 CSV。纯函数：不依赖 Vue、不发请求，故可以当测试直接跑。
//
// 为什么查询在控制台这一侧。运行时那条审计读面（`GET /audit/logs`）只收 `userId` / `since` /
// `isError` 与一个窗口；它**明确拒绝**那些它不施加的筛选，而那是对的 —— 一个被接受却没被施加的筛选，
// 回出来的是一份**看着像筛过、其实没有**的列表。对象与终点恰好都不在那条面上，而给那条面加参数是
// **运行时的读面变更**（参照实现、Java 运行时与契约要一起动），不是这一片能顺手做的事。故这一片
// 用**已有的几条读面**（审计行、写入台账、确认记录、记录名）在控制台本地做联结与筛选，并把扫到哪、
// 哪一段没扫到**说出来**。真正省掉扫描的做法见 `keelbase-docs/KEELBASE-AUDIT-SEARCH.zh-CN.md`。
//
// 三条固定的写法：
//   ① 对象只按 `(resultType, resultId)` 判等，不按显示文本 —— 文本会被掩码、会被翻译。
//   ② 对象的三条来路与审计页本身**同一条证据链**：台账 → 确认记录 → 行末记下的键。
//   ③ 导出的六列就是页面渲染的那六格答案，故文件不会与屏幕漂开；任何一格带着内部名，整份导出**拒绝**。
//
// Reads the audit trail by **business object and time range** and exports the six answers as CSV. Pure
// functions: no Vue, no requests, so it can be run as a test.
//
// Why the query lives on the console side. The runtime's audit read face (`GET /audit/logs`) takes
// `userId` / `since` / `isError` and a window; it **refuses** every filter it does not apply, which is
// right — a filter that is accepted and not applied returns a list that looks filtered and is not. The
// object and the end of the range are exactly the two it does not have, and adding them is a change to
// the **runtime's read face** (reference implementation, Java runtime and contract together), not
// something this slice can fold in. So this slice joins and filters on the console side over the
// **faces that already exist** (audit rows, write ledger, confirmation records, record names) and says
// what it scanned and what it could not reach. The way to stop scanning is written up in
// `keelbase-docs/KEELBASE-AUDIT-SEARCH.md`.
//
// Three fixed rules: an object is compared by `(resultType, resultId)`, never by the text shown (that
// text is masked and translated); the object's three roads are the **same evidence chain the audit
// page already uses** (ledger → confirmation record → the key recorded at the end of the row); and the
// six exported columns are exactly the six cells the page renders, so the file cannot drift from the
// screen — a single cell carrying an internal name refuses the whole export.

import { BLANK, leaksIn, recordedObjectIn, SIX_QUESTIONS } from './sixQuestions.mjs'

/** CSV 的六列，按审计人员提问的次序。 / The CSV's columns, in the order an auditor asks the six questions. */
export const CSV_QUESTION_KEYS = SIX_QUESTIONS

/** The window the two trails are paired in — the same five seconds every other face uses. */
/** 两条轨配对所用的窗口 —— 与其余的面对称的五秒。 */
export const PAIR_WINDOW_MS = 5000

/**
 * 这一行的**业务对象**，按 `(类型, 主键)`。三条来路与审计页同一次序，取到第一条为止：
 * 台账行（一次真的写）→ 确认记录里的提议（被扣下或被拒）→ 行末自己记下的键（被闸门拦下）。
 * 三条都没有时回 `null`：那就是运行时确实没记下这次调用落在哪条记录上。
 *
 * 台账**优先按 `executionId` 精确配**（契约 v6 的关联键）。带了这个键却在窗口里找不到那一行时回
 * `null`，**不**退回去按「工具 + 五秒」猜：那一猜正是把两条不同的执行摆到一起的路。
 *
 * The **business object** of this row, as `(type, key)`. Three roads in the audit page's own order, the
 * first one that answers wins: the ledger row (a write that happened) → the proposal in a confirmation
 * record (held or refused) → the key recorded at the end of the row's own sentence (blocked by the
 * gate). None of the three means `null`: the runtime genuinely did not record where the call landed.
 *
 * The ledger is matched **by `executionId` first** (contract v6's correlation key). When the row carries
 * one and the window has no such row, this returns `null` rather than falling back to "tool + five
 * seconds": that fallback is exactly how two different executions get put beside each other.
 */
export function objectRefOf(row, { effects = [], proposals = [], resultTypeOf = () => '' } = {}) {
  if (!row) return null
  const effect = matchEffect(row, effects)
  if (effect) {
    if (effect.resultType && effect.resultId !== null && effect.resultId !== undefined) {
      return { resultType: effect.resultType, resultId: effect.resultId }
    }
    return null
  }
  const proposal = matchProposal(row, proposals)
  if (proposal) {
    const id = proposal.arguments?.id
    if (id !== null && id !== undefined && id !== '') {
      return { resultType: resultTypeOf(proposal.toolName) || '', resultId: id }
    }
  }
  const recorded = recordedObjectIn(row)
  if (recorded !== null && row.tool) {
    return { resultType: resultTypeOf(row.tool) || '', resultId: recorded }
  }
  return null
}

/**
 * 台账里属于这一行的那条副作用：带了 `executionId` 就只按它精确配（恰好一条才算），否则按
 * 「同一工具、五秒之内、恰好一个候选」—— 与审计页、确认记录、YD-45 追溯步同一条规则。
 *
 * The ledger row belonging to this one: with an `executionId`, exact and only that (exactly one counts);
 * otherwise "same tool, within five seconds, exactly one candidate" — the rule the audit page, the
 * confirmation records and YD-45's trace step already use.
 */
export function matchEffect(row, effects, windowMs = PAIR_WINDOW_MS) {
  if (!row || !Array.isArray(effects) || !row.tool) return null
  const execution = row.executionId
  if (execution) {
    const exact = effects.filter((e) => e && e.executionId === execution)
    return exact.length === 1 ? exact[0] : null
  }
  const at = Date.parse(row.createdAt)
  if (Number.isNaN(at)) return null
  const near = effects.filter(
    (e) => e && e.toolName === row.tool && Math.abs(Date.parse(e.createdAt) - at) <= windowMs,
  )
  return near.length === 1 ? near[0] : null
}

/**
 * 确认记录里属于这一行的那条提议：同一工具，且**当时**（写下）或**裁决时**落在五秒之内，恰好一个候选。
 * 扣下那一刻写的审计行离 `createdAt` 近，裁决那一刻写的离 `decidedAt` 近。
 *
 * The confirmation record belonging to this one: same tool and within five seconds of **either** the
 * proposal's creation or its decision, exactly one candidate. The audit row written when the call was
 * held is near `createdAt`; the one written when it was decided is near `decidedAt`.
 */
export function matchProposal(row, proposals, windowMs = PAIR_WINDOW_MS) {
  if (!row || !Array.isArray(proposals) || !row.tool) return null
  const at = Date.parse(row.createdAt)
  if (Number.isNaN(at)) return null
  const near = proposals.filter((c) => {
    if (!c || c.toolName !== row.tool) return false
    if (Math.abs(Date.parse(c.createdAt) - at) <= windowMs) return true
    return Boolean(c.decidedAt) && Math.abs(Date.parse(c.decidedAt) - at) <= windowMs
  })
  return near.length === 1 ? near[0] : null
}

/** A moment as epoch ms, from a Date, an ISO string or a number; null when it cannot be read. */
/** 一个时刻的毫秒数，收 Date、ISO 串或数字；读不出来时回 null。 */
export function instantOf(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime()
  const at = typeof value === 'number' ? value : Date.parse(String(value))
  return Number.isNaN(at) ? null : at
}

/** 这一行在不在区间里（两端都含）。读不出时刻的行**不在**任何区间里 —— 一条没法定位的行配不上 `since`。 */
/** Whether the row is inside the range, both ends inclusive. A row whose time cannot be read is in **no**
 *  range: a row that cannot be placed cannot be claimed to satisfy `since`. */
export function inWindow(row, { since, until } = {}) {
  const at = instantOf(row?.createdAt)
  if (at === null) return false
  const from = instantOf(since)
  const to = instantOf(until)
  if (from !== null && at < from) return false
  if (to !== null && at > to) return false
  return true
}

/**
 * 这一行的对象是不是要查的那一个。`wanted` 可以只给类型（这一类对象的全部行）、只给主键（任意类型的
 * 这一条），或两者都给。**只给主键时，类型未知的行也算**（不知道它是哪一类，不能说它不是这一条）；
 * **只给类型时，类型未知的行不算**（不知道它是哪一类，就不能说它是这一类）。
 *
 * Whether the row's object is the one asked for. `wanted` may carry the type alone (every row about
 * that kind), the key alone (that one record, any kind), or both. **Key alone** also counts rows whose
 * kind is unknown — not knowing the kind is not evidence that it is a different record; **type alone**
 * does not count them — not knowing the kind is not evidence that it is this kind.
 */
export function matchesObject(ref, wanted) {
  if (!ref || !wanted) return false
  const type = wanted.resultType || ''
  const key = wanted.resultId
  if (!type && (key === undefined || key === null || key === '')) return true // no object filter
  if (type && ref.resultType !== type) return false
  if (key !== undefined && key !== null && key !== '') return String(ref.resultId) === String(key)
  return Boolean(type)
}

/**
 * 按对象与区间挑行，保持输入次序。不给对象时只按区间挑。每一行附上它被读出来的对象（读不出来的为
 * `null`），调用方据此说出「这一行没定位到对象」，而不是把它当成「不匹配」悄悄丢掉。
 *
 * Picks the rows by object and range, keeping the input order; with no object it filters by range alone.
 * Each row carries the object it resolved to (`null` when it did not), so the caller can say "this row
 * was not placed on an object" instead of dropping it as a silent non-match.
 */
export function selectRows(rows, { object = null, since, until, effects = [], proposals = [], resultTypeOf = () => '' } = {}) {
  const picked = []
  for (const row of rows || []) {
    if (!inWindow(row, { since, until })) continue
    const ref = objectRefOf(row, { effects, proposals, resultTypeOf })
    if (object && !matchesObject(ref, object)) continue
    picked.push({ row, object: ref })
  }
  return picked
}

/**
 * 导出的**整个文件**都不许带内部名。命中时抛出的错只说**是哪一问**，不把那串内部名回显出去 ——
 * 否则拒绝导出这件事本身，就把内部名印到了屏幕上。
 *
 * No internal name may appear anywhere in the exported file. The error names **which question** leaked
 * and not the text itself — otherwise refusing the export would print the internal name on the screen.
 */
export class CsvLeak extends Error {
  constructor(column) {
    super(`a cell in "${column}" carries an internal name`)
    this.name = 'CsvLeak'
    this.column = column
  }
}

/**
 * 六问 CSV。表头是调用方给的六个**业务词**（页面用的是六问自己的标签），列序固定为
 * 谁 · 何时 · 哪个业务对象 · 改成什么 · 谁确认 · 结果；每行把答案按 key 摆回固定位置，故答案数组的
 * 次序变了也不会把列错开。答案缺失时写 `—`（与屏幕上同一个记号），**绝不**留空 —— 空单元格在导出的
 * 表里读起来像「没有这件事」。
 *
 * 转义按 RFC 4180：含逗号、双引号、回车或换行的字段加引号，内部的双引号写两遍。行尾 CRLF。
 *
 * The six-answer CSV. The headers are the caller's six **business words** (the page passes the six
 * questions' own labels); the column order is fixed — who · when · which object · what it became · who
 * confirmed · the result. Each row places its answers back by key, so reordering the answer array cannot
 * shift a column. A missing answer is written as `—` (the same marker as on screen) and **never** left
 * blank: a blank cell in an exported table reads as "nothing happened".
 *
 * Escaping follows RFC 4180: a field containing a comma, a double quote, a carriage return or a newline
 * is quoted, and inner quotes are doubled. Line endings are CRLF.
 */
export function csvText(answerRows, labels) {
  if (!Array.isArray(labels) || labels.length !== CSV_QUESTION_KEYS.length) {
    throw new Error(`the CSV has exactly ${CSV_QUESTION_KEYS.length} columns`)
  }
  labels.forEach((label, i) => {
    if (leaksIn(label).length) throw new CsvLeak(CSV_QUESTION_KEYS[i])
  })
  const lines = [labels.map(csvField).join(',')]
  for (const entry of answerRows || []) {
    const answers = entry?.answers ?? entry
    if (!Array.isArray(answers) || answers.length !== CSV_QUESTION_KEYS.length) {
      throw new Error(`a row must carry exactly ${CSV_QUESTION_KEYS.length} answers`)
    }
    const byKey = new Map(answers.map((a) => [a.key, a]))
    const cells = CSV_QUESTION_KEYS.map((key) => {
      const answer = byKey.get(key)
      if (!answer) throw new Error(`the row has no answer for "${key}"`)
      const text = answer.text === null || answer.text === undefined || answer.text === '' ? BLANK : String(answer.text)
      if (leaksIn(text).length) throw new CsvLeak(key)
      return text
    })
    lines.push(cells.map(csvField).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

/** 一个字段的 RFC 4180 形状。 / One field in its RFC 4180 shape. */
export function csvField(value) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** 导出文件名：`audit-six-YYYYMMDD-HHMMSS.csv`，按本地时间。 / The export's file name, local time. */
export function csvFilename(at = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const stamp =
    `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
    `-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  return `audit-six-${stamp}.csv`
}
