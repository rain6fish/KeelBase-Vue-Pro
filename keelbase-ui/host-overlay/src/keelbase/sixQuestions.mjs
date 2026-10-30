// SPDX-License-Identifier: Apache-2.0

// 「一次操作答得出六问吗」的**展示组合**，不依赖 Vue、也不依赖宿主 import，故可以被当成测试直接跑。
//
// 六问是判据，不是文案：谁 · 何时（带时区）· 哪个业务对象 · 改成什么（改前 → 改后）· 谁确认 · 结果。
// 这个模块只做一件事 —— 把运行时**已经记下来的**字段翻成业务词，拼成这六行。它不读代码、不读表结构，
// 也不替运行时补它没记的东西：没有的就说没有，那是**答案**的一部分。
//
// 两条固定的写法：
//   ① 业务对象用**业务名 + 业务主键**（「客户 · #9005」），不印运行时的类型名（`crm_customer` 这类表名不算）。
//   ② 自动放行时**显式写「无需确认」** —— 留空、写 null、或干脆不画这一行，都不算答出第五问。
//
// The **display composition** behind "does one operation answer the six questions", with no Vue and no
// host import, so it can be run as a test.
//
// The six questions are a criterion, not copy: who · when (with a timezone) · which business object ·
// what it became (before → after) · who confirmed · the result. This module does one thing — it turns
// fields the runtime **already recorded** into business words and composes those six lines. It reads no
// code and no table structure, and it never fills in what the runtime did not record: an absence is
// part of the answer.
//
// Two fixed rules: the business object is named by its **business name and key** ("客户 · #9005"), never
// by the runtime's own type name; and an auto-allowed write **says 「无需确认」 out loud** — a blank, a
// null, or a missing line is not an answer to the fifth question.

/** The six questions, in the order an auditor asks them. */
export const SIX_QUESTIONS = ['who', 'when', 'object', 'change', 'confirmation', 'result']

/** Anything that is not one of these six is not an answer. */
const BLANK = '—'

/**
 * 一个时刻，**带时区**。接受运行时那种 UTC ISO 串，按本地时区渲染，并把偏移量直接写出来 ——
 * 不带时区的时间戳回答不了「几点」，因为读者不知道那是谁的几点。
 *
 * One moment, **with its timezone**. Takes the runtime's UTC ISO string, renders it in local time and
 * writes the offset out — a timestamp without a zone cannot answer "when", because the reader does not
 * know whose clock it is.
 */
export function zonedTime(value) {
  if (value === null || value === undefined || value === '') return BLANK
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return String(value)
  const pad = (n) => String(n).padStart(2, '0')
  const offset = -at.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const zone = `UTC${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  const local = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
  return `${local} ${zone}`
}

/** Parse a snapshot string into a plain object; anything unreadable is "no snapshot", not an empty one. */
export function parseSnapshot(text) {
  if (!text) return null
  if (typeof text === 'object') return text
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

/**
 * 快照里**值得给读者看**的字段，以及它们的业务名。归属人那一类内部引用不在此列 —— 它引用的是一个人，
 * 而「谁」这一问要的是人名或账号，不是一个数字 id。
 *
 * The fields in a snapshot worth showing a reader, with their business names. Internal references such
 * as the owner are left out: they point at a person, and "who" wants a name or an account, not a number.
 */
const SNAPSHOT_FIELDS = [
  { key: 'name', label: 'fieldName', mask: true },
  { key: 'level', label: 'fieldLevel', mask: false },
  { key: 'source', label: 'fieldSource', mask: false },
  { key: 'dealStatus', label: 'fieldDealStatus', mask: false },
  { key: 'followUpStatus', label: 'fieldFollowUpStatus', mask: false },
]

/** A value as the reader may see it: record text is masked, everything else is shown as recorded. */
function shown(value, maskIt, mask) {
  if (value === null || value === undefined) return BLANK
  if (typeof value === 'boolean') return value ? '✓' : '✗'
  return maskIt ? mask(String(value)) : String(value)
}

/**
 * 一个词条；**没有这一条时**回落到调用方给的那句话，而不是回落成 key 本身。vue-i18n 找不到词条时会把 key
 * 原样还回来，而 key 里带着 `record.crm_customer` 这样的内部名 —— 那正是这一页不许出现的东西。
 *
 * A word from the message table; when the table has no such entry it falls back to the caller's
 * sentence, **not** to the key. vue-i18n returns the key itself when it has no entry, and the key
 * carries names like `record.crm_customer` — exactly what this page must not print.
 */
function word(te, t, key, fallback) {
  return te && te(key) ? t(key) : fallback
}

/**
 * ④ 改成什么 —— 改前来自运行时记的 `beforeSnapshot`，改后的**记录**在 `afterSnapshot` 里。
 *
 * 本运行时给一次改行写的 `afterSnapshot` 只有一个 `id`（工具交回的就是这个），所以这里如实分成两段：
 * 运行时的改后**记录**，以及**宿主现在**这一行的样子。后者不是写入那一刻的快照，故它单独标注 ——
 * 把「现在」说成「改后」，正是这一问最不该给读者的读法。
 *
 * ④ what it became — the "before" comes from the runtime's `beforeSnapshot`, and the "after" as
 * **recorded** is in `afterSnapshot`.
 *
 * This runtime writes only an `id` into `afterSnapshot` for an update (that is what the tool returns),
 * so the line is split honestly in two: what the runtime **recorded** as the after, and what the host's
 * record looks like **now**. The latter is not the snapshot taken at the write, so it says so; calling
 * "now" the "after" is the one reading this question must not give.
 */
export function changeLine({ effect, hostNowName, mask, t, te }) {
  if (!effect) return { text: t('keelbase.sixQ.changeNone'), answered: true }
  const before = parseSnapshot(effect.beforeSnapshot)
  const after = parseSnapshot(effect.afterSnapshot)
  const afterHasFields = after ? SNAPSHOT_FIELDS.some((f) => after[f.key] !== undefined) : false

  if (!before && !afterHasFields) {
    // A create has no "before" — that is a fact, not an omission — and its after carries only an id.
    return { text: t('keelbase.sixQ.changeCreated'), answered: Boolean(hostNowName) }
  }

  const pairs = (snapshot) =>
    SNAPSHOT_FIELDS.filter((f) => snapshot[f.key] !== undefined)
      .map((f) => `${word(te, t, `keelbase.sixQ.${f.label}`, f.key)} ${shown(snapshot[f.key], f.mask, mask)}`)
      .join(' · ')

  const parts = []
  if (before) parts.push(`${t('keelbase.sixQ.changeBefore')}: ${pairs(before)}`)
  if (afterHasFields) parts.push(`${t('keelbase.sixQ.changeAfter')}: ${pairs(after)}`)

  if (!afterHasFields) {
    const changed = []
    if (before && hostNowName) {
      const was = before.name === undefined ? BLANK : mask(before.name)
      const now = mask(hostNowName)
      if (was !== now) {
        changed.push(`${t('keelbase.sixQ.fieldName')} ${was} → ${now} — ${t('keelbase.sixQ.hostNow')}`)
      }
    }
    parts.push(
      changed.length
        ? `${t('keelbase.sixQ.changeAfter')}: ${changed.join(' · ')}; ${t('keelbase.sixQ.changeAfterUnrecorded')}`
        : t('keelbase.sixQ.changeAfterUnrecorded'),
    )
  }
  return { text: parts.join('; '), answered: Boolean(before || afterHasFields) }
}

/**
 * 这一行**当时**过的是哪道闸，只从这一行自己记下来的 `authorization` 读。
 *
 * **不能问工具清单。** 清单答的是**此刻**的闸（`GET /ai/tools` 的 `gateMode` 由当下的策略算出来），
 * 而这一行是一次**过去**的调用：同一条审计行，在策略改过之后会被答成另一个样子 —— 一次自动放行的写
 * 说成「本人确认了」、一次本人确认过的写说成「无需确认」。判据要的是「这次操作怎么了」，所以依据取这一行
 * 记下的那一次裁决。
 *
 * 词汇来自协议自己的 `RiskLevel`：`riskStrategy` 是风险级对应的策略（`auto` / `policy` /
 * `confirmation` / `human_approval` / `block`），`requiresConfirmation` 是这一次**实际**的裁决位。
 * 两个合起来才分得出「无需确认」「本人确认」「第二人批准」「被扣住」。这一行没记 `authorization` 时
 * （比如待决行、被拒行，或者更早的运行时），回空串 —— 那一格就说这一行没写，**不**拿今天的清单去补。
 *
 * Which gate this row actually passed, read only from the `authorization` the row itself recorded.
 *
 * **The inventory must not be asked.** It answers the gate **now** (`gateMode` in `GET /ai/tools` is
 * derived from the policy as it stands), while the row is a **past** call: the same audit row reads
 * differently after a policy change — an auto-allowed write becomes "confirmed it themselves", and a
 * write a person confirmed becomes "no confirmation needed". The criterion asks what *this operation*
 * came to, so the basis is the decision recorded on the row.
 *
 * The vocabulary is the protocol's own `RiskLevel`: `riskStrategy` is the risk level's strategy
 * (`auto` / `policy` / `confirmation` / `human_approval` / `block`), and `requiresConfirmation` is the
 * decision that was actually taken. Together they separate "no confirmation needed", "confirmed it
 * themselves", "a second person approved" and "held". A row that recorded no `authorization` (pending,
 * declined, or an older runtime) answers with an empty gate — the cell then says the row does not say,
 * rather than filling it in from today's inventory.
 */
export function gateFromRow(row) {
  const auth = parseSnapshot(row?.authorization)
  if (!auth) return ''
  if (auth.riskStrategy === 'block') return 'blocked'
  if (auth.requiresConfirmation === false) return 'auto'
  if (auth.requiresConfirmation === true) {
    return auth.riskStrategy === 'human_approval' ? 'approval' : 'confirm'
  }
  return ''
}

/**
 * ⑤ 谁确认 —— 按**这一行记下的那道闸**（见 `gateFromRow`）回答，不按工具当下的设定猜。
 *
 * 自动放行写「无需确认」；要求本人确认的写「本人确认（对话内）」—— 因为那道闸的定义就是「等操作者
 * 本人」；要求第二人批准的工具，本运行时的审计行上**没有**批准人是谁，故这一格如实说没有，而不是拿隔壁那一行
 * 的时间去凑一个人。
 *
 * ⑤ who confirmed — answered from **the gate this row recorded** (see `gateFromRow`), not guessed from
 * the tool's setting today.
 *
 * An auto-allowed call says 「无需确认」. A tool that asks the operator says 「本人确认（对话内）」, because
 * that is what the gate means. A tool that needs a second person carries no approver on this runtime's
 * audit row, so this cell says so rather than pairing the neighbour row by its timestamp.
 */
export function confirmationLine({ gate, outcome, callerName, t }) {
  if (outcome === 'pending') {
    return { text: `${callerName || t('keelbase.sixQ.someone')} ${t('keelbase.sixQ.confirmWaiting')}`, answered: true }
  }
  if (outcome === 'declined') {
    return { text: `${callerName || t('keelbase.sixQ.someone')} ${t('keelbase.sixQ.confirmDeclined')}`, answered: true }
  }
  if (gate === 'auto') {
    return { text: t('keelbase.sixQ.confirmNotNeeded'), answered: true }
  }
  if (gate === 'confirm') {
    return { text: `${callerName || t('keelbase.sixQ.someone')} ${t('keelbase.sixQ.confirmSelf')}`, answered: true }
  }
  if (gate === 'approval') {
    return { text: t('keelbase.sixQ.confirmApprovalUnrecorded'), answered: false }
  }
  if (gate === 'blocked') {
    return { text: t('keelbase.sixQ.confirmBlocked'), answered: true }
  }
  return { text: BLANK, answered: false }
}

/**
 * ③ 哪个业务对象 —— 业务名 + 业务主键，外加宿主自己的那条记录名（**掩码之后**）。
 *
 * 台账里没有这一行，**不等于**运行时没记。被扣下或被拒的调用不写台账（什么都没进系统），但运行时把这次
 * 提议原样记在确认记录里 —— 工具名，以及它当时要用的参数。`proposal` 就是那条记录；有它时这一格答「这次
 * 调用本来落在哪条记录上」，而不是说没有那条记录。
 *
 * 两者都没有时才说「未记录」：既没有台账行、也没有提议，那才是运行时确实没记下它落在哪条记录上。
 *
 * `proposalName` 与 `hostNowName` 是同一件东西的两种来源（提议那条路没有台账行，故名字要单独给）：宿主
 * 窄读面答回来的记录名，**已经掩码**；这里再掩一次是幂等的，且保证没有名字时什么都不补。
 *
 * ③ which business object — its business name and key, plus the host's own record name (masked).
 *
 * No ledger row does **not** mean the runtime recorded nothing. A call that was held or refused writes
 * no ledger row (nothing entered the system), but the runtime records the proposal itself — the tool and
 * the arguments it would have run with — in the confirmation row. When `proposal` is that row, this cell
 * answers which record the call **was about** instead of saying there is none.
 *
 * Only with neither does it say 「未记录」: no ledger row and no proposal is the runtime genuinely not
 * having recorded where the call landed.
 */
export function objectLine({ effect, proposal, hostNowName, proposalName, state, mask, t, te }) {
  if (!effect) {
    if (!proposal || proposal.resultId === null || proposal.resultId === undefined) {
      return { text: t('keelbase.sixQ.objectUnrecorded'), answered: false }
    }
    const heldTypeWord = proposal.resultType
      ? word(te, t, `keelbase.record.${proposal.resultType}`, t('keelbase.sixQ.objectUnnamed'))
      : ''
    const heldName = proposalName ? mask(proposalName) : ''
    return {
      text: [heldTypeWord, `#${proposal.resultId}`, heldName].filter(Boolean).join(' · '),
      answered: true,
    }
  }
  const typeWord = effect.resultType
    ? word(te, t, `keelbase.record.${effect.resultType}`, t('keelbase.sixQ.objectUnnamed'))
    : ''
  const key = effect.resultId === null || effect.resultId === undefined ? '' : `#${effect.resultId}`
  const name = hostNowName ? mask(hostNowName) : effect.targetTitle ? mask(effect.targetTitle) : ''
  const head = [typeWord, key].filter(Boolean).join(' · ')
  const text = [head || t('keelbase.sixQ.objectUnrecorded'), name, state].filter(Boolean).join(' · ')
  return { text, answered: Boolean(key || (effect.resultType && typeWord)) }
}

/**
 * 六行，一次答全。`answered` 只标「这一格有答案」，不标「答案是好消息」—— 第六问「结果」永远有答案，
 * 哪怕那个答案是「被拒了」。
 *
 * ⑤ 的依据**只有**这一行（`gateFromRow`），调用方**不能**从别处塞一个闸进来：那正是「同一条审计行
 * 会随策略改口」的来源。
 *
 * Six lines, all at once. `answered` marks whether the cell **has** an answer, not whether the answer is
 * good news — the sixth question always has one, even when the answer is "it was refused".
 *
 * The fifth question's basis is **the row alone** (`gateFromRow`); a caller cannot hand a gate in from
 * elsewhere — that is exactly what used to make one audit row answer differently after a policy change.
 */
export function composeSix({ row, callerName, effect, proposal, hostNowName, proposalName, recordState, mask, resultWord, resultMeaning, t, te }) {
  const object = objectLine({ effect, proposal, hostNowName, proposalName, state: recordState, mask, t, te })
  const change = changeLine({ effect, hostNowName, mask, t, te })
  const confirmation = confirmationLine({ gate: gateFromRow(row), outcome: row?.outcome, callerName, t })
  return [
    { key: 'who', label: 'who', text: callerName ? `${callerName}${row?.userId ? `（${t('keelbase.sixQ.account')} #${row.userId}）` : ''}` : t('keelbase.sixQ.someone'), answered: Boolean(callerName) },
    { key: 'when', label: 'when', text: zonedTime(row?.createdAt), answered: Boolean(row?.createdAt) },
    { key: 'object', label: 'object', text: object.text, answered: object.answered },
    { key: 'change', label: 'change', text: change.text, answered: change.answered },
    { key: 'confirmation', label: 'confirmation', text: confirmation.text, answered: confirmation.answered },
    { key: 'result', label: 'result', text: [resultWord, resultMeaning].filter(Boolean).join(' · '), answered: Boolean(resultWord) },
  ]
}

/**
 * 一条答案里有没有**内部名**。反向可证就用它：把内部工具名、表名、执行线程 id 透出来的那份交回来时，
 * 这里必须判出来，于是那次记 0 格。
 *
 * Whether an answer carries an **internal name**. This is what the reverse proof runs: hand back a
 * version that leaks an internal tool name, a table name or an execution id, and this has to catch it —
 * which is what makes that operation score zero.
 */
const INTERNAL_PATTERNS = [
  // snake_case identifiers: tool names (`update_crm_customer`) and result types (`crm_customer`).
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/,
  // snapshot field names that belong to the schema rather than to the business.
  /\b(ownerUserId|dealStatus|followUpStatus|beforeSnapshot|afterSnapshot|executionId|conversationId)\b/,
  // an execution id / thread id.
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
]

/**
 * 一个结局码**独自**站在一格答案里，也算是透出内部名 —— 判据要的是业务含义，不是枚举名。它只在整格
 * 就是那个码时命中：英文句子里出现 declined 这样的词是正常行文，不该被当成泄漏。
 *
 * An outcome code standing **alone** in a cell also counts as leaking: the criterion asks for the
 * business meaning, not the enum's name. It fires only when the whole cell is that code — "declined"
 * inside an English sentence is ordinary prose, not a leak.
 */
const BARE_CODE = /^\s*(executed|attempted|refused|declined|blocked|failed|revoked|pending|approved|timeout)\s*$/

/** The internal names an answer leaks, most of them first. */
export function leaksIn(text) {
  const bare = String(text ?? '').match(BARE_CODE)
  if (bare) return [bare[1]]
  const found = []
  for (const pattern of INTERNAL_PATTERNS) {
    const hit = String(text ?? '').match(pattern)
    if (hit) found.push(hit[0])
  }
  return found
}

/**
 * 一份六问答案的格数：每格有答案、且**不含**内部名，才计 1 格。一格透出内部名即整份记 0 ——
 * 那正是判据里「交回内部名 ⇒ 该次记 0 格」那一条，不是「扣一分」。
 *
 * How many cells one answer set scores: a cell counts only when it has an answer **and** carries no
 * internal name. One leaking cell zeroes the whole set — the criterion says a version that hands back an
 * internal name scores zero for that operation, not that it loses a point.
 */
export function scoreSix(answers) {
  let cells = 0
  for (const answer of answers) {
    if (leaksIn(answer.text).length) return { cells: 0, leaked: leaksIn(answer.text), answer: answer.key }
    if (answer.answered && answer.text && answer.text !== BLANK) cells += 1
  }
  return { cells, leaked: [] }
}
