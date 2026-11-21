// SPDX-License-Identifier: Apache-2.0

// Names the caller of one ledger row: the row's own `userId` when it carries one; a read-only reader's rows
// **omit** `userId` (JV-63 B5 ②), so the join reads the `tool_call` audit row of the **same execution** by
// `executionId`. That key is not caller linkage and the read-only reader receives it too (a UUID names an
// execution, not a person) — so this road works for the reader and asks nothing of the runtime.
//
// Only `action=tool_call` rows count. The same `executionId` also carries the decision row
// (`tool_confirmation`), whose `userId` is the **approver**: in the 2026-11-21 real-stack rehearsal the
// executed row said `userId=1` and the approved row `userId=9901`; taking the wrong row attributes one
// write to another person.
//
// One rule, one answer: the join succeeds only with **exactly one initiator**. Two `tool_call` rows naming
// different people, or an `executionId` whose row is not in the scanned window, answer `null` (the cell
// says "not recorded") rather than falling back to "tool + five seconds" — that fallback is how two
// different executions get put together, the same rule `auditQuery.matchEffect` states.
//
// Pure functions: no requests, no Vue, so they run directly as tests.
//
// 给台账的一行配上「谁」：行上带着 `userId` 时用它自己记的；只读读者的行**不带** `userId`（JV-63 B5 ②），
// 于是按这一行的 `executionId` 去审计行里取**同一个执行**的 `tool_call` 行的 `userId`。`executionId` 不属于
// 调用方关联，只读读者也收（一个 UUID 命名一次执行，不是一个人），故这条路对读者成立、且不必改运行时。
//
// 只认 `action=tool_call` 的行。同一个 `executionId` 下还有裁决行（`tool_confirmation`），那一行的 `userId`
// 是**批准人**不是发起人 —— 2026-11-21 真栈预演里，执行行 `userId=1`、批准行 `userId=9901`，拿错一行就把
// 一次写说成另一个人写的。
//
// 一条配方就一条规则：**恰好一个发起人**才算配上。两行 `tool_call` 报出不同的人、或带了 `executionId` 却在
// 读面窗口里找不到那一行，都回 `null`（格子写「未记录」），不退回去按「工具 + 五秒」猜 —— 那一猜正是把两次
// 不同的执行摆到一起的路，与 `auditQuery.matchEffect` 同一条口径。
//
// 纯函数：不发请求、不依赖 Vue，可直接当测试跑。

/** The same five-second window every other pairing face uses. / 与其余配对面同一条窗口：五秒。 */
export const PAIR_WINDOW_MS = 5000

/** Padding for the audit read: an effect row and its audit row share an instant; a minute covers both ends. */
/** 审计读的余量：台账行与它的审计行写在同一刻，一分钟足够覆盖两端。 */
export const EFFECT_AUDIT_PAD_MS = 60_000

/** One audit page and the most pages read — the trace page's own bound (200 × 5 = 1000 rows). */
/** 审计读的一页与最多读几页 —— 与追溯页同一条上界（200 × 5 = 1000 行）。 */
export const EFFECT_AUDIT_LIMIT = 200
export const EFFECT_AUDIT_MAX_PAGES = 5

/**
 * The audit-read window covering one page of ledger rows, both ends inclusive; `null` when no row yields
 * an instant.
 *
 * 这一页台账行对应的审计读窗口（两端都含）；没有一行读得出时刻时回 `null`。
 */
export function auditWindowForEffects(effects, padMs = EFFECT_AUDIT_PAD_MS) {
  const times = (Array.isArray(effects) ? effects : [])
    .map((e) => (e && e.createdAt ? Date.parse(String(e.createdAt)) : Number.NaN))
    .filter((n) => !Number.isNaN(n))
  if (!times.length) return null
  return {
    since: new Date(Math.min(...times) - padMs).toISOString(),
    until: new Date(Math.max(...times) + padMs).toISOString(),
  }
}

/** Whether this row needs the audit join: it carries no `userId` of its own but does carry an `executionId`. */
/** 这一行是不是需要去审计里配人：行上没带 `userId`，且带着 `executionId`。 */
export function needsCallerJoin(effect) {
  return Boolean(effect && !effect.userId && effect.executionId)
}

/**
 * The initiator id of one ledger row, or `null` when it cannot be paired. The rule is the file header's:
 * `tool_call` rows only, exactly one person.
 *
 * 这一行的发起人 id，配不出时回 `null`。规则见文件头：只认 `tool_call` 行、只认恰好一个人。
 */
export function initiatorOfEffect(effect, auditRows, windowMs = PAIR_WINDOW_MS) {
  if (!effect) return null
  if (effect.userId) return String(effect.userId)
  const rows = Array.isArray(auditRows) ? auditRows : []

  let candidates
  if (effect.executionId) {
    candidates = rows.filter(
      (r) => r && r.executionId === effect.executionId && r.action === 'tool_call',
    )
  } else {
    const at = effect.createdAt ? Date.parse(String(effect.createdAt)) : Number.NaN
    if (Number.isNaN(at)) return null
    candidates = rows.filter(
      (r) =>
        r &&
        r.action === 'tool_call' &&
        r.tool &&
        r.tool === effect.toolName &&
        Math.abs(Date.parse(String(r.createdAt)) - at) <= windowMs,
    )
  }

  const ids = [
    ...new Set(
      candidates
        .map((r) => r.userId)
        .filter((id) => id !== null && id !== undefined && id !== '')
        .map((id) => String(id)),
    ),
  ]
  return ids.length === 1 ? ids[0] : null
}

/**
 * One page of ledger rows → `{ [row id]: initiator id }`. Only paired rows are written; an unpaired row is
 * absent and the page falls back to "not recorded".
 *
 * 一页台账行 → `{ [行 id]: 发起人 id }`。只收配得上的行；配不上的不写进映射（页面回落成「未记录」）。
 */
export function joinEffectCallers(effects, auditRows, windowMs = PAIR_WINDOW_MS) {
  const out = {}
  for (const effect of Array.isArray(effects) ? effects : []) {
    if (!effect) continue
    const id = initiatorOfEffect(effect, auditRows, windowMs)
    if (id !== null) out[String(effect.id)] = id
  }
  return out
}
