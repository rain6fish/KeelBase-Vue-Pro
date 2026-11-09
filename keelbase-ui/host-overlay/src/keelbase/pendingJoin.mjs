// SPDX-License-Identifier: Apache-2.0

// 把一条**待批**的确认记录配到它那条 `tool_call/pending` 审计行，并从那一行读出**发起人**。
//
// 全局确认队列的投影不带发起人 id（冻结对象的字段里没有它），而运行时在写下待决确认的同一刻，也写了
// 一行审计：`action=tool_call`、`outcome=pending`、`tool` 是同一个工具，`user_id` 就是发起人。两条记录
// 之间没有共同的键，故唯一诚实的配法是 **同一工具、五秒之内、恰好一个候选** —— 与 `approverOf` 和
// `matchApprover` 用的同一条规则。配不上（没有、或不止一个）就回 `null`，由页面**明说**定不出来，
// 而不是猜一个名字。
//
// `detail` 也是判据。同一个端点也会为「本人确认」那一档写一行 `tool_call/pending`，句末是
// `pending confirmation` 而不是 `awaiting a second person`（两串都在 0.1.17 的引擎里）。只有后者才是
// 第二人批准；把前者配进来，就是把一次「等你本人」说成「某人请你批」。
//
// 它只读调用方已经交给它的那些行：`rows` 里没有那一行时同样回 `null` —— 收窄，不是错答。
//
// English:
//
// Pair a **pending** confirmation record with its `tool_call/pending` audit row and read the
// **initiator** off that row. The global confirmation queue's projection carries no initiator id (the
// frozen object has no such field), while the runtime writes an audit row at the same moment it holds the
// confirmation: `action=tool_call`, `outcome=pending`, the same tool, and `user_id` is the initiator. The
// two records share no key, so the only honest match is **same tool, within five seconds, exactly one
// candidate** — the rule `approverOf` and `matchApprover` already use. No match (none, or more than one)
// returns `null`, and the page says it cannot tell rather than guessing a name.
//
// `detail` is part of the criterion. The same endpoint also writes a `tool_call/pending` row for the
// "immediate" tier, whose sentence ends in `pending confirmation` rather than `awaiting a second person`
// (both strings live in 0.1.17's engine). Only the latter is the second-person tier; pairing the former in
// would report a "waiting for you" row as "someone asks you to approve this".
//
// It reads only the rows it is handed: a `rows` array that does not carry the pending row answers `null`
// too — narrowing, not a wrong answer.

/** 审计行与确认记录写在同一刻，故两者必须这么近。 / The audit row and the confirmation share an instant, so they must be this close. */
export const PENDING_INITIATOR_WINDOW_MS = 5000

/** 运行时对「等第二个人」的扣下自己写的那句话（0.1.17，`GovernedExecutionEngine`）。 */
/** The runtime's own sentence for a hold that waits for a second person (0.1.17, `GovernedExecutionEngine`). */
export const AWAITING_SECOND_PERSON = 'awaiting a second person'

/**
 * 这条待批确认的发起人 id，或者 `null`。`null` 有三种来源，页面都必须说得出来：没有候选、候选不止
 * 一个（不猜）、以及那一行根本不是一次待决的工具调用（`refused` 的重试行也一样被这条规则挡在外面）。
 *
 * The initiator id for this pending confirmation, or `null`. `null` has three sources, and the page must
 * say which rather than fill a person in: no candidate, more than one candidate (no guessing), and a row
 * that is not a held tool call at all (a `refused` retry row is kept out by this same rule).
 */
export function initiatorOf(confirmation, rows, windowMs = PENDING_INITIATOR_WINDOW_MS) {
  if (!confirmation || !Array.isArray(rows)) return null
  const at = Date.parse(confirmation.createdAt)
  if (Number.isNaN(at)) return null
  const near = rows.filter((row) => {
    if (!row || row.action !== 'tool_call' || row.outcome !== 'pending') return false
    if ((row.tool ?? null) !== (confirmation.toolName ?? null)) return false
    if (!String(row.detail ?? '').includes(AWAITING_SECOND_PERSON)) return false
    if (row.userId === null || row.userId === undefined || row.userId === '') return false
    const when = Date.parse(row.createdAt)
    return !Number.isNaN(when) && Math.abs(when - at) <= windowMs
  })
  return near.length === 1 ? String(near[0].userId) : null
}
