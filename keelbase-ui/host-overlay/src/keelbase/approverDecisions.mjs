// SPDX-License-Identifier: Apache-2.0

// 把「我裁决过的确认行」从两条轨上配出来：全局确认队列里**已裁决**的 approval 行，与我自己的
// `tool_confirmation/approved|declined` 审计行。
//
// 为什么要配：确认记录的投影不带裁决人 id（冻结对象的字段里没有它），而 `/ai/my/confirmations` 只答
// **调用方自己发起**的 `mode=immediate` 行 —— 故第二批准人裁决的 R4 行在那一面上根本不出现。裁决人在
// 审计链上另有一行，`user_id` 就是裁决人；调用方按 `userId` 读回**自己**的裁决行，再配到队列行上。
//
// 两条记录之间没有共同的键，故唯一诚实的配法是 **同一工具、五秒之内、恰好一个候选** —— 与
// `pendingJoin.mjs` 配发起人、`approverJoin.mjs` 配轨迹上的裁决人用的同一条规则。配不上（没有、或不止
// 一个）就**不列**：把别人的裁决说成自己的，比少一行更糟。
//
// English:
//
// Pair "the confirmation rows I decided" across two trails: **decided** approval rows in the global
// confirmation queue, and my own `tool_confirmation/approved|declined` audit rows.
//
// Why a pairing: the confirmation projection carries no approver id (the frozen object has no such field),
// and `/ai/my/confirmations` answers only the **caller's own** `mode=immediate` rows — so an R4 row decided
// by a second approver never appears on that face. The decision has its own audit row whose `user_id` is
// the decider; the caller reads back **their own** decision rows by `userId` and pairs them with the queue.
//
// The two records share no key, so the only honest match is **same tool, within five seconds, exactly one
// candidate** — the rule `pendingJoin.mjs` uses for the initiator and `approverJoin.mjs` for the trace's
// approver. No match (none, or more than one) lists nothing: reporting someone else's decision as mine is
// worse than one row short.

/** 裁决与它那条确认记录写在同一刻，故两者必须这么近。 / The decision and its confirmation share a write, so they must be this close. */
export const APPROVER_DECISION_WINDOW_MS = 5000

/**
 * 由**当前调用方**裁决过的确认行，按审计行的顺序；配不上的行不列。`queue` 是全局确认队列的行（调用方
 * 已按管理员权限读过），`auditRows` 是 `/audit/logs?userId=<自己>` 的答复 —— 调用方只把**自己的**裁决
 * 行交进来，这个函数不替它判身份。
 *
 * The confirmation rows **this caller** decided, in audit-row order; rows that cannot be paired are not
 * listed. `queue` is the global confirmation queue the caller has already read as an administrator, and
 * `auditRows` is the answer of `/audit/logs?userId=<self>` — the caller hands in only **their own** decision
 * rows, and this function does not re-judge identity.
 */
export function pairDecidedByApprover(queue, auditRows, windowMs = APPROVER_DECISION_WINDOW_MS) {
  if (!Array.isArray(queue) || !Array.isArray(auditRows)) return []
  const candidates = queue.filter((c) => c && c.mode === 'approval' && c.status !== 'pending' && c.decidedAt)
  if (!candidates.length) return []
  const picked = []
  const seen = new Set()
  for (const row of auditRows) {
    if (!row || row.action !== 'tool_confirmation') continue
    if (row.outcome !== 'approved' && row.outcome !== 'declined') continue
    const at = Date.parse(row.createdAt)
    if (Number.isNaN(at)) continue
    const near = candidates.filter((c) => {
      if ((c.toolName ?? null) !== (row.tool ?? null)) return false
      const decidedAt = Date.parse(c.decidedAt ?? '')
      return !Number.isNaN(decidedAt) && Math.abs(decidedAt - at) <= windowMs
    })
    if (near.length === 1 && !seen.has(near[0].token)) {
      seen.add(near[0].token)
      picked.push(near[0])
    }
  }
  return picked
}
