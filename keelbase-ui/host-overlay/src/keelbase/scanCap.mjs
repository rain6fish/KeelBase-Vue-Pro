// SPDX-License-Identifier: Apache-2.0

// The **row cap** of an object query: its default, its configurable band, and a page plan that respects
// the runtime's page face. Pure functions — no Vue, no requests — so "what is the most rows one query
// can return" can be asked as a test instead of believed by reading an SFC constant.
//
// Why the cap has to be assertable. The 2026-11-21 real-stack reading (`handoff/rescan-cap-1121.md`):
// in a 3000-row range the console's by-range rescan was a hard-coded 5 pages × 200, read only the newest
// 1000 rows, and a target past row 1000 answered "0 rows matched" — a sentence that reads like "nothing
// happened". The bound was two constants in a page, and no test could prove a query stayed under it.
// With the default and the band extracted here, a negative test can feed a read face that **ignores
// `limit`** and still assert the running total never crosses the cap.
//
// Where the bounds come from. The runtime's `/audit/logs` clamps `limit` to 200 and `offset` to 1000
// (`AuditController.MAX_LIMIT` / `MAX_OFFSET`). `offset=1000` itself is allowed, so 1000 + 200 = 1200 is
// the deepest this face reaches **without repeating a page**; past it `offset=1200` is clamped to 1000
// and page 6 comes back twice. The band is therefore 200–1200, with the default 1000 (row for row the
// previous behaviour).
//
// 对象查询的**行数上限**：默认值、可配置区间，以及一份守运行时边界的取页计划。纯函数，不碰 Vue、不发请求，
// 故「一次查询最多返回多少行」可以当测试直接问，而不是只靠读一个 SFC 常量去相信它。
//
// 为什么上限必须可断言。2026-11-21 的真栈读数（`handoff/rescan-cap-1121.md`）：3000 行的区间里，控制台同区间
// 重扫写死 5 页 × 200，只读最新 1000 行；落在第 1000 行以外的目标答「命中 0 行」，而那句话读起来像「没有这件
// 事」。这个上界此前只是页面里的两个常量，没有任何测试能证明查询不会超过它。把默认值与区间抽到这里之后，
// 负向测试可以喂一个**无视 `limit`** 的读面，仍断言累计不越界。
//
// 边界从哪来。运行时 `/audit/logs` 把 `limit` 夹到 200、把 `offset` 夹到 1000（`AuditController.MAX_LIMIT` /
// `MAX_OFFSET`）。`offset=1000` 本身可用，故 1000 + 200 = 1200 是这条面**不重页**能走到的最深处；再往上
// `offset=1200` 会被夹回 1000、重复第 6 页。故可配置区间定为 200–1200，默认 1000（与原行为逐行一致）。

/** 一页最多取多少行 —— 运行时的 `MAX_LIMIT`。 / The most rows one page may ask for — the runtime's `MAX_LIMIT`. */
export const SCAN_PAGE_LIMIT = 200

/** 不配置时的行数上限，与原页面的 `SCAN_PAGES × SCAN_LIMIT` 相同。 / The default cap, the old page's `SCAN_PAGES × SCAN_LIMIT`. */
export const DEFAULT_SCAN_ROWS = 1000

/** 可配置区间的下界：至少一页，否则「查询」这个词就不成立。 / The band's floor: at least one page, or it is not a query. */
export const MIN_SCAN_ROWS = SCAN_PAGE_LIMIT

/** 可配置区间的上界：运行时的 `MAX_OFFSET`(1000) + `MAX_LIMIT`(200)，再深就会重复同一页。 */
/** The band's ceiling: the runtime's `MAX_OFFSET` (1000) + `MAX_LIMIT` (200); deeper repeats a page. */
export const MAX_SCAN_ROWS = 1200

/**
 * Folds any input into `[MIN_SCAN_ROWS, MAX_SCAN_ROWS]`. A non-number falls back to the default and a
 * fraction is truncated (no half rows). `requested` keeps the value as read and `clamped` says whether
 * it was changed — a silently accepted setting lets its author believe it took effect.
 *
 * Three fields: `rows` is the cap the module and the page actually use; `requested` is the value as
 * read (`null` when unset); `clamped` is true when the input was out of band or not a number at all.
 *
 * 把任意输入收进 `[MIN_SCAN_ROWS, MAX_SCAN_ROWS]`。非数字回默认值；小数取整（不产生半行）。
 * `requested` 保留**读到的那个值**，`clamped` 说明它有没有被改过 —— 静默接受的配置会让人以为生效了。
 *
 * 三个字段：`rows` 是本模块与页面实际使用的上限；`requested` 是读到的值（没配置时为 `null`）；
 * `clamped` 为真表示输入落在区间外、或根本不是数字。
 */
export function resolveScanCap(raw) {
  const blank = raw === undefined || raw === null || String(raw).trim() === ''
  if (blank) return { rows: DEFAULT_SCAN_ROWS, clamped: false, requested: null }
  const asNumber = Number(raw)
  const readable = !Number.isNaN(asNumber)
  const rows = normalizeRows(asNumber)
  return {
    rows,
    clamped: !readable || rows !== Math.trunc(asNumber),
    requested: readable ? asNumber : raw,
  }
}

/**
 * The page requests this scan will send: one per page, with the `limit`s adding up to **exactly** the
 * cap. The last page asks only for what is left, so 1001 rows is "5 pages × 200 + 1 row", not a sixth
 * page of 200.
 *
 * The invariants the negative tests guard: every `limit ≤ SCAN_PAGE_LIMIT`; every
 * `offset ≤ MAX_SCAN_ROWS - SCAN_PAGE_LIMIT` (= 1000, the runtime's `MAX_OFFSET`); and
 * `offset + limit ≤ MAX_SCAN_ROWS`.
 *
 * 这次扫描要发的取页请求：一页一排，`limit` 之和**恰好等于**上限。最后一页只取剩下的那几行，
 * 故 1001 行是「5 页 × 200 + 1 行」，而不是第 6 页一次拿走 200 行。
 *
 * 不变量（负向测试守的就是这几条）：每页 `limit ≤ SCAN_PAGE_LIMIT`；`offset ≤ MAX_SCAN_ROWS - SCAN_PAGE_LIMIT`
 * （=1000，运行时 `MAX_OFFSET`）；`offset + limit ≤ MAX_SCAN_ROWS`。
 */
export function scanPageRequests(rows) {
  const cap = normalizeRows(rows)
  const plan = []
  for (let offset = 0; offset < cap; offset += SCAN_PAGE_LIMIT) {
    plan.push({ limit: Math.min(SCAN_PAGE_LIMIT, cap - offset), offset })
  }
  return plan
}

/**
 * Merges one page's answer into the running total and **never cross `rows`**. When the read face ignores
 * `limit` and answers 500 rows, only what fits is kept — "a query cannot exceed its cap" does not rely on
 * the read face behaving. A full `scanned` comes back unchanged; an empty `chunk` adds nothing.
 *
 * 把读面这一页的答复并进累计，**永不越过 `rows`**。读面无视 `limit`、一页回 500 行时，这里只留装得下的
 * 那几行 —— 「查询不可能超过上限」不依赖读面守规矩。
 *
 * `scanned` 已满时原样返回；`chunk` 为空时累计不变。
 */
export function absorbChunk(scanned, chunk, rows) {
  const cap = normalizeRows(rows)
  const kept = Array.isArray(scanned) ? scanned : []
  const room = cap - kept.length
  if (room <= 0) return kept
  const incoming = Array.isArray(chunk) ? chunk : []
  return [...kept, ...incoming.slice(0, room)]
}

/** 一处夹取：非数字回默认值，其余夹进区间并取整。 / One clamp: non-numbers default, the rest fold into the band. */
function normalizeRows(rows) {
  const asNumber = typeof rows === 'number' ? rows : Number(rows)
  if (Number.isNaN(asNumber)) return DEFAULT_SCAN_ROWS
  return Math.min(MAX_SCAN_ROWS, Math.max(MIN_SCAN_ROWS, Math.trunc(asNumber)))
}
