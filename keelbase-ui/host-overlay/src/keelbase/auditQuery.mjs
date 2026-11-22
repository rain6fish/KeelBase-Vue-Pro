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

import { BLANK, leaksIn, recordedObjectIn, recordedTypedObject, SIX_QUESTIONS } from './sixQuestions.mjs'

/** CSV 的六列，按审计人员提问的次序。 / The CSV's columns, in the order an auditor asks the six questions. */
export const CSV_QUESTION_KEYS = SIX_QUESTIONS

/** The window the two trails are paired in — the same five seconds every other face uses. */
/** 两条轨配对所用的窗口 —— 与其余的面对称的五秒。 */
export const PAIR_WINDOW_MS = 5000

/**
 * 这一行的**业务对象**，按 `(类型, 主键)`。三条来路与审计页同一次序，取到第一条为止：
 * 台账行（一次真的写）→ 确认记录里的提议（被扣下或被拒）→ 行末自己记下的键。
 * 三条都没有时回 `null`：那就是运行时确实没记下这次调用落在哪条记录上。
 *
 * 行末的键有两种拼写，先认**带类型**的那一种（` · object MCP connection #12`，写在没有工具的动作上，
 * 种类就在句子里），再认被拦下那种（` · intended object #12`，种类来自工具声明）。台账与提议仍然优先：
 * 有它们时，行末的键一个字都不读。
 *
 * 台账**优先按 `executionId` 精确配**（契约 v6 的关联键）。带了这个键却在窗口里找不到那一行时回
 * `null`，**不**退回去按「工具 + 五秒」猜：那一猜正是把两条不同的执行摆到一起的路。
 *
 * The **business object** of this row, as `(type, key)`. Three roads in the audit page's own order, the
 * first one that answers wins: the ledger row (a write that happened) → the proposal in a confirmation
 * record (held or refused) → the key recorded at the end of the row's own sentence. None of the three
 * means `null`: the runtime genuinely did not record where the call landed.
 *
 * The end-of-sentence key has two spellings. The **typed** one is read first (` · object MCP connection
 * #12`, written by an action with no tool, its kind in the sentence), then the blocked-call one (` ·
 * intended object #12`, its kind from the tool's declaration). The ledger and the proposal still win:
 * when either answers, not a character of the sentence is read.
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
  const typed = recordedTypedObject(row)
  if (typed) return typed
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
 * 这份答复是不是**比发出去的筛选更宽** —— 读面没有施加它们的**正面证据**。
 *
 * 只有它**返回**的那些行能证明：一条落在区间外、或本页能解析出对象却不是所查对象的行，不可能出自一个
 * 施加过筛选的面。本页解析不出对象的行**不算证据**（台账窗口有界，读面没有），恰好都匹配的答复也什么都
 * 证明不了 —— 那两种情形下命中集一样，不需要告诫。
 *
 * 由此可证的只有「读面忽略了筛选」，不能反推「读面施加了筛选」：生成器产出的应用会静默忽略它不认识的
 * 查询参数（运行时仓 `JavaGenerator` 生成的 `/audit/logs` 只收 `userId/since/isError`），故没有证据时
 * 页面不多说一个字。
 *
 * Whether this answer is **wider than the filters that were sent** — positive evidence that the read
 * face did not apply them.
 *
 * Only rows it **returned** can prove it: a row outside the range, or one this page can place on an
 * object other than the one asked for, could not have come back from a face that applied the filters.
 * A row this page cannot place is **not** evidence (its ledger window is bounded, the face's is not),
 * and an answer whose rows all happen to match proves nothing — the matched set is the same either way,
 * so neither earns a warning.
 *
 * What this can prove is "the face ignored the filters", never the converse: an application produced by
 * the generator silently ignores query parameters it does not know (the generated `/audit/logs` in the
 * runtime repository takes `userId/since/isError` only), so with no evidence the page says nothing.
 */
export function readFaceIgnoredFilters(
  rows,
  { object = null, since, until, effects = [], proposals = [], resultTypeOf = () => '' } = {},
) {
  const ranged = Boolean(since) || Boolean(until)
  for (const row of rows || []) {
    if (ranged && !inWindow(row, { since, until })) return true
    if (object && (object.resultType || object.resultId)) {
      const ref = objectRefOf(row, { effects, proposals, resultTypeOf })
      if (ref && !matchesObject(ref, object)) return true
    }
  }
  return false
}

/**
 * 表格该渲染哪一份行：检索跑过之后是那份命中，检索清空（`queryRan=false`）之后回到普通列表。
 *
 * 单独成一个纯函数，是为了让「命中 3 行时表格就是 3 行、清空后回到 20 行」可以当测试直接跑，
 * 而不是只靠读一遍模板去相信它。
 *
 * Which rows the table renders: the matched set once a search has run, the plain list again after
 * the search is cleared (`queryRan=false`).
 *
 * It is a pure function so that "three hits means three rows, and clearing brings back twenty" can be
 * run as a test instead of believed by reading the template.
 */
export function displayRowsOf({ queryRan, queryRows, rows }) {
  return queryRan ? (queryRows || []) : (rows || [])
}

/**
 * 表格空态该说哪一句话，按这次检索的**三种结局**分开：没跑过（无空态）· 请求失败（没有完成）· 跑完了。
 * 跑完的那一档再分两层 —— 触到扫描上限时说「上限内没有命中，命中可能在上限之外」，只有真的在上限内扫完
 * 且一行没有时才说「没有命中任何行」。一句「没有命中」会把「没读到」读成「没有这件事」，而这正是本页在
 * 别处反复要防的读法。
 *
 * 返回的是词条**键**，由页面交给 `t()`：这一层不碰 i18n，故三种结局可以当测试直接跑。
 *
 * Which sentence the table's empty state says, by this search's **three endings**: it never ran (no empty
 * text), the request failed (it did not finish), and it finished. The finished one splits again — with the
 * scan bound hit it says "nothing matched within the bound, a match may sit outside it", and only a scan
 * that really finished inside the bound with no row says "no row matched". A bare "nothing matched" turns
 * "not read" into "nothing happened", exactly the reading this page guards against elsewhere.
 *
 * It returns the message **key**, which the page hands to `t()`: this layer touches no i18n, so the three
 * endings can be run as a test.
 */
export function emptyTextKey({ queryFailed, queryRan, queryScanBound }) {
  if (!queryRan) return undefined
  if (queryFailed) return 'keelbase.audit.queryFailed'
  return queryScanBound ? 'keelbase.audit.queryEmptyAtBound' : 'keelbase.audit.queryEmpty'
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

/**
 * 核对 CSV 的列：**编号 + 六问 + 判定依据**。它是**另一份**导出，原六列业务 CSV 一个字符都不动 ——
 * 那份是 U1 的验收口径，加一列就会让「六列就是页面那六格」这句话不再成立。
 *
 * 编号取审计行的 `id`（写成 `#31`，与页面上指着它的方式一致），判定依据取这一行自己记下的那几道检查；
 * 行上没有依据时写「未记录」，**不**留空。读者拿这份文件回去，行号对得上链上的行，检查也看得见。
 *
 * The verification CSV's columns: **id + the six answers + the checks**. It is a **second** export; the
 * original six-column business CSV is untouched, cell for cell — that one is U1's acceptance reading, and
 * adding a column to it would make "the six columns are the six cells on screen" stop being true.
 *
 * The id is the audit row's `id` (written `#31`, how the page itself points at the row), and the checks
 * are the ones that row recorded; a row that recorded none says 「not recorded」 rather than going blank.
 * Taking this file away, a reader can match a line back to the chain and see the checks that ran.
 */
export const CHECK_COLUMN_KEYS = ['id', ...SIX_QUESTIONS, 'checks']

/**
 * 核对 CSV 的正文。与 `csvText` 同一条转义与泄漏规则：缺答案写 `—`，任何一格带内部名就整份拒绝，
 * 且错误只说**是哪一列**。`entryRows` 的每一项是 `{ id, answers, checks }`。
 *
 * `note` 可选：给了就在表头**之前**写一行以 `#` 开头的说明。它是这份文件与第二入口（宿主自己的操作日志）
 * 之间关系的限度声明 —— 两份轨之间没有共享编号，只能按业务主键与时间相关。这一行是**元数据、不是数据行**：
 * 六列/八列的判据只数数据行，故它不改变「一行就是一次操作」这件事。`#` 是这里自己定的记号：RFC 4180 没有
 * 注释行，故下游若按纯数据解析，看到的会是一条只有一个格子的行 —— 它不会被误读成某个操作。
 *
 * The verification CSV's body. The same escaping and leak rules as `csvText`: a missing answer is `—`, any
 * cell carrying an internal name refuses the whole file, and the error names **which column** only. Each
 * entry of `entryRows` is `{ id, answers, checks }`.
 *
 * `note` is optional: when given, one line beginning with `#` is written **before** the header. It states the
 * limit of this file's relation to the second entry (the host's own operation log) — the two trails share
 * no id and can only be related by business key and time. That line is **metadata, not a data row**: the
 * six/eight-column criterion counts data rows only, so it does not change "one line is one operation". The
 * `#` marker is this file's own: RFC 4180 has no comment lines, so a strict data parser sees a one-cell row
 * — which cannot be mistaken for an operation.
 */
export function checkCsvText(entryRows, labels, note = '') {
  if (!Array.isArray(labels) || labels.length !== CHECK_COLUMN_KEYS.length) {
    throw new Error(`the verification CSV has exactly ${CHECK_COLUMN_KEYS.length} columns`)
  }
  labels.forEach((label, i) => {
    if (leaksIn(label).length) throw new CsvLeak(CHECK_COLUMN_KEYS[i])
  })
  const lines = []
  if (note) lines.push(`# ${note}`)
  lines.push(labels.map(csvField).join(','))
  for (const entry of entryRows || []) {
    const answers = entry?.answers
    if (!Array.isArray(answers) || answers.length !== SIX_QUESTIONS.length) {
      throw new Error(`a row must carry exactly ${SIX_QUESTIONS.length} answers`)
    }
    const byKey = new Map(answers.map((a) => [a.key, a]))
    const answerCells = SIX_QUESTIONS.map((key) => {
      const answer = byKey.get(key)
      if (!answer) throw new Error(`the row has no answer for "${key}"`)
      const text = answer.text === null || answer.text === undefined || answer.text === '' ? BLANK : String(answer.text)
      if (leaksIn(text).length) throw new CsvLeak(key)
      return text
    })
    const id = entry?.id
    const idCell = id === null || id === undefined || id === '' ? BLANK : `#${id}`
    if (leaksIn(idCell).length) throw new CsvLeak('id')
    const checks =
      entry?.checks === null || entry?.checks === undefined || entry?.checks === '' ? BLANK : String(entry.checks)
    if (leaksIn(checks).length) throw new CsvLeak('checks')
    lines.push([idCell, ...answerCells, checks].map(csvField).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

/** 核对 CSV 的文件名：`audit-check-YYYYMMDD-HHMMSS.csv`，按本地时间。 */
/** The verification CSV's file name: `audit-check-YYYYMMDD-HHMMSS.csv`, local time. */
export function checkCsvFilename(at = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  const stamp =
    `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
    `-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  return `audit-check-${stamp}.csv`
}

/**
 * The marker every note line the product writes begins with: `#` and one space. A note is **one cell**,
 * so a data row can never be mistaken for one — the verification CSV's id cell is `#31`, with no space,
 * and always sits in a row of six or eight cells.
 *
 * CSV itself (RFC 4180) has no comment lines. The dialect is deliberate and narrow: notes are allowed
 * **only before the header**, never between or after data rows. A consumer skips leading note rows and
 * reads the header from the first row that is not one; the header is still matched cell for cell, so a
 * note can never excuse a genuinely wrong header.
 *
 * 产品写出的说明行一律以 `#` 加一个空格开头，且**只有一个格子**；数据行不可能被误认成说明行 ——
 * 核对 CSV 的编号格是 `#31`（`#` 后没有空格），而且总在一行六格或八格里。
 *
 * CSV（RFC 4180）没有注释行。这里的方言是有意收窄的：说明行**只允许在表头之前**，不允许夹在数据行
 * 之间或结尾。消费者跳过前导说明行，把头一行非说明行当表头；表头仍要逐格对得上，所以说明行永远不能
 * 为一份坏表头开脱。
 */
export const CSV_NOTE_MARKER = '# '

/** Is this row a note line? One cell, starting with `# `. / 这一行是不是说明行？单格，以 `# ` 开头。 */
export function isCsvNoteRow(row) {
  return Array.isArray(row) && row.length === 1 && typeof row[0] === 'string' && row[0].startsWith(CSV_NOTE_MARKER)
}

/**
 * Split the leading note rows from the body: `{ notes, rows }`. Only the preamble is taken; a note-shaped
 * row among the data stays there and breaks the row comparison, which is what corruption should do.
 *
 * 把表头之前的前导说明行与正文分开，返回 `{ notes, rows }`。只取开头那一段；夹在数据中间的说明形状
 * 行仍留在正文里，让逐行比对失败 —— 数据被改坏时就该这样。
 */
export function splitCsvNotes(rows) {
  const list = Array.isArray(rows) ? rows : []
  let i = 0
  while (i < list.length && isCsvNoteRow(list[i])) i += 1
  return { notes: list.slice(0, i), rows: list.slice(i) }
}

/**
 * Adds an export's note lines: each non-blank note is written as one `# …` line **before the header**, in
 * the order given, and with no notes the body is returned **unchanged**. Every note explains a limit of the
 * file — the scan bound, or a read face that did not apply the filters — and a file without it is read as
 * "everything that matched". The statement has to travel with the file, not stay on the page that wrote it.
 *
 * The caller fixes the order because the two notes read as one paragraph: the read face's note says why the
 * rows are the console's own narrowing, and the scan bound says how far that narrowing could read. So the
 * read-face note comes first; a test pins that order. Notes go where the verification CSV's own note already
 * goes — before the header, so a reader sees them first. Each line is **metadata, not a data row**: the
 * six/eight-column criterion counts data rows only, and the `#` marker lets a strict data parser see a
 * one-cell row that cannot be mistaken for an operation.
 *
 * 给一份导出的正文加上说明行：每条非空的说明写成一行 `# …`，按给定次序放在**表头之前**，没有说明时正文
 * **一个字都不动**。每条说明都陈述这份文件的一处限度 —— 扫描上限，或读面没有施加筛选；没有声明的文件会
 * 被读成「全部命中」。声明必须跟着文件走，不能只留在发出它的那个页面上。
 *
 * 次序由调用方给定，因为两条说明读起来是一段话：读面那条说这些行为什么是控制台自己挑的，扫描上限那条说
 * 这份挑拣只读到多远 —— 故读面那条在前，测试钉住这个次序。说明行放在核对 CSV 那条说明同一处（表头之前），
 * 读者一打开文件就先看到。每行是**元数据、不是数据行**：六列 / 八列的判据只数数据行，`#` 记号让严格的
 * 数据解析器看见一条单格行，不会被误读成某一次操作。
 */
export function withCsvNotes(text, notes) {
  const body = text === null || text === undefined ? '' : String(text)
  const lines = (Array.isArray(notes) ? notes : [notes])
    .filter((note) => note !== null && note !== undefined && String(note).trim() !== '')
    .map((note) => `${CSV_NOTE_MARKER}${String(note).trim()}`)
  return lines.length ? `${lines.join('\r\n')}\r\n${body}` : body
}
