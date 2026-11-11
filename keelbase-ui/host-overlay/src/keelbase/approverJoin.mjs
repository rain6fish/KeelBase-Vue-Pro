// SPDX-License-Identifier: Apache-2.0

// 把一次裁决的轨迹步配上审计链上那一行 `tool_confirmation`，并从三种如实的结果里选一句话。
//
// 运行时的轨迹步不带人（`ConversationController.auditStep` 只放 id / 类型 / 时间 / 工具 / detail / 结局），
// 而**同一次裁决**在审计链上有一行，它的 `user_id` 就是裁决者。两条轨之间没有共同的键，故唯一诚实的对法
// 是**同一工具、同一 detail、五秒之内、恰好一个候选** —— 与台账和确认记录用的同一条规则。配不上就不画人，
// 也不退而求其次点会话属主的名：把操作者当成批准人，比什么都不说更糟。
//
// English:
//
// Pair a decision's trace step with its `tool_confirmation` row on the audit chain, and pick one line from
// three honest outcomes. The runtime's trace step carries no person, while the **same decision** has an
// audit row whose `user_id` is the decider. The two trails share no key, so the only honest match is
// **same tool, same detail, within five seconds, exactly one candidate** — the rule the ledger and the
// confirmation records already use. No single candidate means no person is drawn, and the conversation's
// owner is never offered as a substitute: naming the operator as the approver is worse than saying nothing.

/** 审计行与轨迹步是同一次写，故两者必须这么近。 / The audit row and the trace step share a write, so they must be this close. */
export const APPROVER_WINDOW_MS = 5000

const DECISION_OUTCOMES = ['approve', 'decline']

/** 只有**人作出的裁决**才有批准人可点；到期或待决的那一步没有。 / Only a person's decision has a person to name. */
export function isDecisionStep(step) {
  return Boolean(step) && step.type === 'confirmation' && DECISION_OUTCOMES.includes(step.outcome)
}

/**
 * 这一次裁决的裁决者 id，或者 null。null 有三种来源，页面都必须说得出来而不是补一个人：没有候选、
 * 候选不止一个（不猜）、以及该行根本不是一个决定（`attempted` 的重试行也一样被这条规则挡在外面）。
 *
 * The decider's id for this decision, or null. Null has three sources, and the page must say which rather
 * than fill a person in: no candidate, more than one candidate (no guessing), and a row that is not a
 * decision at all (an `attempted` retry row is kept out by this same rule).
 */
export function matchApprover(step, rows, windowMs = APPROVER_WINDOW_MS) {
  if (!isDecisionStep(step) || !Array.isArray(rows)) return null
  const at = Date.parse(step.time)
  if (Number.isNaN(at)) return null
  const near = rows.filter(
    (row) =>
      row &&
      row.action === 'tool_confirmation' &&
      (row.tool ?? null) === (step.toolName ?? null) &&
      (row.detail ?? null) === (step.detail ?? null) &&
      row.userId !== null &&
      row.userId !== undefined &&
      row.userId !== '' &&
      Math.abs(Date.parse(row.createdAt) - at) <= windowMs,
  )
  return near.length === 1 ? String(near[0].userId) : null
}

/**
 * 那一行字，按三种结果分岔。名字取到了就**按掩码规则**只留首字，并保留 `#id`（审计人员仍要指着这个人
 * 说话）；名录答不出名字时回落 `用户 #id`，**不把 id 也掩掉** —— 那会把「谁」掩成谁也认不出的一个数字。
 *
 * The line itself, branching on the three outcomes. A resolved name is **masked** the way record text is
 * masked, and `#id` stays (an auditor still points at the person by id); when the directory has no name
 * the line falls back to `User #id` rather than masking the id too, which would hide the very person it
 * names.
 */
export function approverText(step, read, { mask, t }) {
  if (!read) return ''
  const label = step.outcome === 'decline'
    ? t('keelbase.trace.declinerLabel')
    : t('keelbase.trace.approverLabel')
  if (read.kind === 'refused') return t('keelbase.trace.approverUnreadable', { label })
  if (read.kind === 'none') return t('keelbase.trace.approverUnrecorded', { label })
  const who = read.name && read.name !== read.id
    ? t('keelbase.trace.approverNamed', { name: mask(read.name), id: read.id })
    : t('keelbase.trace.approverIdOnly', { id: read.id })
  return t('keelbase.trace.approverLine', { label, who })
}
