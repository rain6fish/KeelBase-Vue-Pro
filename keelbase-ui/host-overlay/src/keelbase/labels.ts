// SPDX-License-Identifier: Apache-2.0

// Human words for the runtime's frozen vocabularies, and the colour a tag should take.
//
// The runtime speaks in codes because a code is what a frozen vocabulary is for: `tool_call`,
// `attempted`, `refused`. An auditor reads sentences. This is the one place the console turns one
// into the other — the words themselves stay in the host's i18n, so the reader gets them in their
// own language, and this file only decides *which* word (or that there is none).
//
// Each set below is closed on purpose. A code the runtime sends that is not in its set returns
// `null` rather than a guessed key, and the callers fall back to the raw code — an unknown word is
// shown as itself, never dressed into a meaning it might not have.
//
// 运行时用**码**说话，因为码正是一份**冻结词表**的用处所在：`tool_call`、`attempted`、`refused`。
// 审计人员读的是**句子**。这里是控制台唯一把前者变成后者的地方——**词本身**留在宿主的 i18n 里，好让读者
// 用**自己的语言**拿到它们；本文件只决定**用哪个词**（或**没有词**）。
//
// 下面每一组都是**封闭的**。运行时送来的码若不在这组里，返回 `null`、而不是猜一个 key——调用方回落到
// **原码**：一个不认识的词**如实显示为它自己**，绝不装扮成它可能并不具备的含义。

/** A tag's colour, as Element Plus takes it. */
/** 标签的颜色，按 Element Plus 收的样子。 */
export type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger'

// The frozen `action` enum of `audit-payload` v2 — v1's twelve plus `effect_revoke`, which v2 added
// for exactly the action of undoing a real side effect. Read off the contract, not guessed: the live
// trail is what showed `effect_revoke` was missing from the first cut of this set.
// `audit-payload` v2 冻结的 `action` 枚举 —— v1 那十二个，加上 v2 **为「撤销一个真实副作用」这一动作**
// 添的 `effect_revoke`。**读自契约、不是猜的**：正是活的审计轨让「这个集合漏了 `effect_revoke`」显形。
const ACTIONS = [
  'chat', 'tool_call', 'navigate', 'error', 'login', 'plan', 'analyze', 'knowledge',
  'delegate', 'tool_confirmation', 'flow_node', 'content_blocked', 'effect_revoke',
]

// The frozen `outcome` vocabulary of `ai-audit-log-row` v5.
// `ai-audit-log-row` v5 冻结的 `outcome` 词表。
const OUTCOMES = [
  'attempted', 'executed', 'pending', 'blocked', 'refused', 'declined', 'failed',
  'approved', 'timeout', 'revoked',
]

// The effective gate `ai-tool-inventory` reports — `auto` | `confirm` | `approval` | `blocked`.
// `ai-tool-inventory` 报的**生效的**闸——`auto` | `confirm` | `approval` | `blocked`。
const GATES = ['auto', 'confirm', 'approval', 'blocked']

// The showcase's own outcomes. Runtime-specific, so the words live here with the rest.
// 对抗展示**自己**的结局。属 runtime-specific，故这些词与其余的一起放在这里。
const SHOWCASE_OUTCOMES: Record<string, string> = {
  allowed: 'allowed',
  denied: 'denied',
  unresolved: 'unresolved',
  requiresConfirmation: 'requiresConfirmation',
  'unknown-scenario': 'unknownScenario',
}

// `trace-step` v3 冻结的 `type` 枚举 —— 六个取值全在，任何实现会发的步都有词。这个集合取自**契约**，
// 不是从本运行时眼下发的那几种推出来的：一份词表要认得出**别人**送来的步。枚举之外的类型仍原样显示。
// The frozen `type` enum of `trace-step` v3 — all six values, so every step any implementation can
// send has a word. The set comes from the **contract**, not from the handful this runtime happens to
// emit today: one vocabulary has to recognise a step sent by **another** implementation. A type
// outside the enum is still shown as itself.
const TRACE_STEPS = ['input', 'assistant', 'tool_call', 'confirmation', 'effect', 'notice']

// The operations audit's own word for the act — `operation-audit-log-row`'s `action` values, which
// its interceptor derives from the method and the path.
// 操作审计对动作自己的叫法 —— `operation-audit-log-row` 的 `action` 取值，由它的拦截器从方法与路径推出。
const OP_ACTIONS = ['LOGIN', 'LOGOUT', 'UPLOAD', 'CREATE', 'UPDATE', 'DELETE']

function inSet(set: readonly string[], code: string | null | undefined): string | null {
  return code && set.includes(code) ? code : null
}

/** The i18n key for an audit row's action, or null when the code is one this console does not know. */
/** 审计行**动作**的 i18n key；码不认识时为 null。 */
export function actionLabelKey(action: string | null | undefined): string | null {
  const code = inSet(ACTIONS, action)
  return code ? `keelbase.vocab.action.${code}` : null
}

/** The i18n key for an audit row's outcome, or null. */
/** 审计行**结局**的 i18n key；否则 null。 */
export function outcomeLabelKey(outcome: string | null | undefined): string | null {
  const code = inSet(OUTCOMES, outcome)
  return code ? `keelbase.vocab.outcome.${code}` : null
}

/** The i18n key for a tool's gate, or null. */
/** 工具**门槛**的 i18n key；否则 null。 */
export function gateLabelKey(gate: string | null | undefined): string | null {
  const code = inSet(GATES, gate)
  return code ? `keelbase.vocab.gate.${code}` : null
}

/** The i18n key for a showcase outcome, or null. */
/** 对抗展示**结局**的 i18n key；否则 null。 */
export function showcaseOutcomeLabelKey(outcome: string | null | undefined): string | null {
  const name = outcome ? SHOWCASE_OUTCOMES[outcome] : null
  return name ? `keelbase.vocab.showcaseOutcome.${name}` : null
}

/** The i18n key for a trace step's type, or null. */
/** 轨迹**步类型**的 i18n key；否则 null。 */
export function traceStepLabelKey(type: string | null | undefined): string | null {
  const code = inSet(TRACE_STEPS, type)
  return code ? `keelbase.vocab.traceStep.${code}` : null
}

// `trace-step` v3's `confirmation.outcome` enum — the decision a person took. It is its own closed
// set, and its words are the audit row's (`approve`/`decline` are the act, `approved`/`declined` the
// state; `pending_approval` is the state `pending` names). So the reader gets one vocabulary, not two.
// `trace-step` v3 的 `confirmation.outcome` 枚举 —— 有人作的裁决。它是自成一套的封闭集合，而它的词就是
// 审计行那套（`approve`/`decline` 是动作，`approved`/`declined` 是状态；`pending_approval` 即 `pending`
// 所指的状态）。于是读者拿到的是一套词，不是两套。
const TRACE_CONFIRMATION_OUTCOMES: Record<string, string> = {
  approve: 'approved',
  decline: 'declined',
  timeout: 'timeout',
  pending_approval: 'pending',
}

/** The i18n key for a trace confirmation step's outcome, or null. */
/** 轨迹**确认**步结局的 i18n key；否则 null。 */
export function traceOutcomeLabelKey(outcome: string | null | undefined): string | null {
  const word = outcome ? TRACE_CONFIRMATION_OUTCOMES[outcome] : null
  return word ? `keelbase.vocab.outcome.${word}` : null
}

// `traceEffect.status` v3's in-flight readings. `executed` and `revoked` already have words in the
// audit `outcome` set; the two the projection normalises for a revocation do not, so they get keys of
// their own. A status outside either set reads as itself.
// `traceEffect.status` v3 的两个**进行中**读数。`executed` 与 `revoked` 在审计 `outcome` 集合里已有词；
// 投影为一次撤销归一的另外两个没有，故单独给它们 key。两个集合都不认的状态如实显示为它自己。
const TRACE_EFFECT_STATUS_KEYS: Record<string, string> = {
  revoking_external: 'revokingExternal',
  revoke_failed: 'revokeFailed',
}

/** The i18n key for a trace effect step's status, or null. */
/** 轨迹**副作用**步状态的 i18n key；否则 null。 */
export function traceEffectStatusLabelKey(status: string | null | undefined): string | null {
  const outcome = outcomeLabelKey(status)
  if (outcome) return outcome
  const name = status ? TRACE_EFFECT_STATUS_KEYS[status] : null
  return name ? `keelbase.vocab.traceEffectStatus.${name}` : null
}

/** The i18n key for an operations row's action, or null. */
/** 操作审计行**动作**的 i18n key；否则 null。 */
export function opActionLabelKey(action: string | null | undefined): string | null {
  const code = inSet(OP_ACTIONS, action)
  return code ? `keelbase.vocab.opAction.${code.toLowerCase()}` : null
}

/**
 * What an operations row came to, from its status code: anything under 400 went through. A row with
 * no code is neither — it gets the neutral colour rather than a guess.
 *
 * 操作审计行**结果**如何，按状态码：低于 400 就是过了。没有码的行两者都不是 —— 给它中性的颜色，
 * 而不是猜一个。
 */
export function statusTagType(code: number | null | undefined): TagType {
  if (code === null || code === undefined) return 'info'
  return code >= 400 ? 'danger' : 'success'
}

// 本宿主在 `/ai/tools` 上供出的**每一个**工具，按它注册的名字 —— 宿主自己的工具 bean，加上运行时自带的示例
// 工具。控制台给每一个配**读者语言**的名字；下面每个名字都是**那个工具自己声明的用途**（`/ai/tools` 逐个
// 答了描述）的**译文**，不是从拼写猜的。`tool-vocabulary.test.mjs` 拿这张表与宿主源码对账：新加一个工具面
// 却没在这里配词，会红，而不是以「没有名字的调用」落到读者眼前。
//
// 不认识的工具**渲染成什么**由**调用方**决定，不由本文件决定：`toolLabelKey` 返回 null，对注册名不置一词。
// 工程师面向的页面（工具清单、策略中心）把注册名留在词旁边，好让管理员看出是哪个工具；**读者面向的审计链页
// 不印** —— 注册名是一台机器里的标识符（`create_crm_customer`），而 `YD-42` 的反向可证正是要抓这一种泄漏。
//
// Every tool this host serves on `/ai/tools`, by the names it registers them under — the host's own
// tool beans plus the runtime's sample tools. The console names each in the reader's language; each name
// below is a **translation of what that tool declares it does** (`/ai/tools` answers a description per
// tool), not a guess from its spelling. `tool-vocabulary.test.mjs` holds this list against the host's
// sources, so a tool face added without a word here turns red instead of reaching a reader as an
// unnamed call.
//
// What an unknown tool renders as is the **caller's** decision, not this file's: `toolLabelKey` returns
// null and says nothing about the registered name. The engineer-facing pages (tool inventory, policy
// centre) keep the registered name beside the word so an administrator can tell which tool it is; the
// **reader-facing audit chain page does not** print it — a registered name is an identifier inside one
// machine (`create_crm_customer`), and `YD-42`'s reverse proof exists to catch exactly that leak.
const TOOLS = [
  'list_yudao_users', 'analyze_customer_risk', 'create_followup', 'escalate_customer',
  'list_my_oa_leaves', 'approve_oa_leave', 'navigate_console_page',
  'list_crm_customers', 'create_crm_customer', 'update_crm_customer',
  'list_my_notify_messages', 'get_notify_message', 'mark_notify_message_read', 'mark_all_notify_messages_read',
  'list_generated_products', 'create_generated_products',
  'analyze_project_risk', 'create_pm_task', 'delete_project', 'escalate_project',
  'create_crm_business', 'create_crm_clue', 'create_crm_contact', 'create_crm_contract',
  'create_crm_product', 'create_crm_receivable', 'create_crm_receivable_plan', 'record_crm_followup',
  'crm_follow_up_queue', 'get_crm_followup_record',
  'list_crm_businesses', 'list_crm_clues', 'list_crm_contacts', 'list_crm_contracts',
  'list_crm_products', 'list_crm_receivables', 'list_crm_receivable_plans',
  'list_my_projects', 'list_my_work_items', 'get_work_item_work_log_summary', 'list_work_item_activities',
  'list_my_bpm_tasks', 'cancel_my_bpm_instance', 'list_my_bpm_instances', 'list_my_bpm_process_copies',
  'list_my_oa_leave_applies', 'get_my_oa_leave_apply',
  'list_my_fms_vouchers', 'review_fms_voucher', 'get_fms_closing_overview', 'get_fms_closing_schemes',
  'get_fms_trial_balance', 'get_fms_balance_sheet', 'get_fms_income_statement',
  'get_fms_cash_flow_statement', 'get_fms_subject_balances',
  'find_members', 'get_iteration_overview', 'get_member', 'list_member_point_records', 'list_member_sign_in_records',
  'list_member_level_records', 'list_member_experience_records',
  'get_my_pay_wallet', 'get_my_pay_wallet_transaction', 'get_my_pay_wallet_recharge',
  'get_my_pay_order', 'get_my_pay_refund', 'get_my_pay_transfer',
  'list_notices', 'create_notice', 'list_my_infra_files', 'delete_infra_file',
  'list_my_demo_contacts', 'create_demo01_contact', 'rename_demo01_contact',
]

/** The i18n key for a tool's name in the reader's language, or null when this console does not know it. */
/** 工具**读者语言名字**的 i18n key；控制台不认识它时为 null。 */
export function toolLabelKey(name: string | null | undefined): string | null {
  const code = inSet(TOOLS, name)
  return code ? `keelbase.tool.${code}` : null
}

/**
 * 工具**读者语言那一行用途**的 i18n key；控制台不认识它时为 null。
 *
 * 名字与用途是**两条** key，不是一个：名字是一行标题里的词，用途是政策页上让人**不用打开工具**就知道它
 * 会做什么的那一句。两者的中文都是**对工具自己声明的用途的翻译**（`/ai/tools` 逐个答了描述），不是从名字
 * 猜的。不认识的工具，策略中心回落到**它的注册名与它自己的声明**（管理面，要能认出是哪个工具），而读者
 * 面向的审计链页只说本页没有它的业务名 —— 注册名不上读者那一面，见上面工具表的注释。
 *
 * The i18n key for a tool's one-line purpose in the reader's language, or null when this console does not
 * know it. Name and purpose are **two** keys, not one: the name is a word in a heading, the purpose is the
 * line that lets a person understand a tool on the policy page **without opening it**. Both are translations
 * of **what the tool declares it does** (`/ai/tools` answers a description per tool). For a tool it does not
 * know, the policy centre falls back to the registered name and the tool's own declared words (an
 * administrator's face, where identifying the tool matters), while the reader-facing audit chain page says
 * only that this page has no business name for it — the registered name does not go on the reader's face.
 */
export function toolDescriptionKey(name: string | null | undefined): string | null {
  const code = inSet(TOOLS, name)
  return code ? `keelbase.toolDesc.${code}` : null
}

// 本宿主工具声明的结果类型，以及运行时定义的**可撤档位**。两张表封闭，理由与上面那张工具表相同：
// 控制台只给它认识的值配名字，不认识的值原样保留 —— 不从拼写去猜。
//
// The result types this host's tools declare, and the runtime's **revoke classes**. Both sets are closed
// for the same reason as the tool table above: the console names only what it knows and leaves an unknown
// value as itself — it never guesses a meaning from the spelling.
// 每个**写**工具的 `resultType()` 都在这张表里 —— 2026-11-02 按宿主源码逐个补全：此前只收了八种，
// 后来接上的面（`infra_file` / `system_notice` / `bpm_process_instance` 与 CRM 其余六个写）不在表内，
// 台账那一列于是对它们只剩裸码。`tools-page.test.mjs` 现在拿这张表与源码对账，缺一个就红。
// Every **write** tool's `resultType()` is in this set — completed 2026-11-02 against the host's own sources:
// it used to carry eight, and the faces opened since (`infra_file` / `system_notice` /
// `bpm_process_instance` and CRM's other six writes) were absent, leaving the ledger column as a bare code
// for them. `tools-page.test.mjs` now holds this set against the sources, so a missing one turns red.
const RESULT_TYPES = [
  'bpm_oa_leave',
  'bpm_process_instance',
  'crm_business',
  'crm_clue',
  'crm_contact',
  'crm_contract',
  'crm_customer',
  'crm_follow_up_record',
  'crm_product',
  'crm_receivable',
  'crm_receivable_plan',
  'fms_voucher',
  'infra_demo01_contact',
  'infra_file',
  'system_notice',
  'system_notify_message',
  'notify_mailbox',
  'products',
]

const REVOKE_CLASSES = ['none', 'local-compensate', 'governed-external', 'transactional']

/** 工具声明的结果类型对应的 i18n key；控制台不认识时为 null。 */
/** The i18n key for a declared result type, or null when this console does not know it. */
export function resultTypeLabelKey(value: string | null | undefined): string | null {
  const code = inSet(RESULT_TYPES, value)
  return code ? `keelbase.effects.resultType.${code}` : null
}

/** 可撤档位对应的 i18n key；控制台不认识时为 null。 */
/** The i18n key for a revoke class, or null when this console does not know it. */
export function revokeClassLabelKey(value: string | null | undefined): string | null {
  const code = inSet(REVOKE_CLASSES, value)
  return code ? `keelbase.effects.revokeClass.${code}` : null
}

/**
 * The i18n key for **what an outcome means**, one line — the thing a reader who is not an engineer needs
 * and a single word cannot carry. "Pending" is a state; 「还没真的写入，等有人批准」is what it means to
 * the business.
 *
 * **一个结局意味着什么**的 i18n key，一句话 —— 那不是工程师的读者需要它，而**一个词**载不动它。「待决」
 * 是一种状态；「还没真的写入，等有人批准」才是它对业务的意义。
 */
export function outcomeMeaningKey(outcome: string | null | undefined): string | null {
  const code = inSet(OUTCOMES, outcome)
  return code ? `keelbase.meaning.${code}` : null
}

export type ToolEffect = 'write' | 'read' | 'unknown'

/**
 * 一个工具的调用会不会改动系统里的东西，按运行时**已经供出来**的那份声明读 —— 风险级与「是否需要确认」，
 * 不是工具名。规则与运行时自己的 `ToolDeclaration.isGovernedWrite` 同一条：声明为 R3 及以上、或要求确认的，
 * 是写；R0/R1 是读；其余（策略档 R2、或清单还没有答复这个工具）**不下结论**，既不称它是写、也不称它是读。
 *
 * Whether a tool call can change the system, read off the declaration the runtime already serves — its
 * risk level and whether it asks for confirmation — not off its name. The rule is the runtime's own
 * (`ToolDeclaration.isGovernedWrite`): declared R3 and above, or asking for confirmation, is a write;
 * R0/R1 is a read; anything else (a policy-gated R2, or a tool the inventory has not answered for) is
 * left **undecided** — neither called a write nor called a read.
 */
export function toolEffect(
  tool: { requiresConfirmation?: boolean; riskLevel?: string | null } | null | undefined,
): ToolEffect {
  const level = tool?.riskLevel
  if (!level) return 'unknown'
  if (tool?.requiresConfirmation || level === 'R3' || level === 'R4' || level === 'R5') return 'write'
  if (level === 'R0' || level === 'R1') return 'read'
  return 'unknown'
}

/**
 * `executed` 那句话按工具的性质分三句：写的仍说「写已经在系统里」，读的说这是一次查询、数据没被改动，
 * 清单答不上来的只说「真的执行了」。一次查询被读成一次写，正是这三句要分开的原因。
 *
 * Which sentence `executed` should say, by the tool's own nature: a write still says the write is in the
 * system, a read says it was a query and nothing changed, and a tool the inventory cannot classify says
 * only that it really ran. Reading a query as a write is exactly what these three sentences separate.
 */
const EXECUTED_MEANING: Record<ToolEffect, string> = {
  write: 'executed',
  read: 'executedRead',
  unknown: 'executedUnknown',
}

export function executedMeaningKey(effect: ToolEffect): string {
  return `keelbase.meaning.${EXECUTED_MEANING[effect]}`
}

/**
 * The colour an audit row's outcome reads as. `attempted` is deliberately *not* a verdict — the
 * engine writes it before the call has a result — so it takes the neutral colour rather than a
 * success or a failure one. A call with no outcome (a non-tool row) falls back to `isError`.
 *
 * 审计行的**结局**读起来该是什么颜色。`attempted` **刻意不是**一个判定——引擎在调用**还没有**结果时
 * 就写下它——故它取中性的颜色，而不是成功或失败的颜色。没有 outcome 的行（非工具行）回落到 `isError`。
 */
export function outcomeTagType(outcome: string | null | undefined, isError: boolean): TagType {
  switch (outcome) {
    case 'executed':
    case 'approved':
      return 'success'
    case 'revoked':
    case 'attempted':
      return 'info'
    case 'pending':
    case 'timeout':
      return 'warning'
    case 'blocked':
    case 'refused':
    case 'declined':
    case 'failed':
      return 'danger'
    default:
      return isError ? 'danger' : 'success'
  }
}

/** The colour a tool's gate reads as. */
/** 工具**门槛**读起来该是什么颜色。 */
export function gateTagType(gate: string | null | undefined): TagType {
  switch (gate) {
    case 'auto':
      return 'success'
    case 'blocked':
      return 'danger'
    case 'confirm':
    case 'approval':
      return 'warning'
    default:
      return 'info'
  }
}

/** The colour a showcase outcome reads as: a finding is red, the expected result is not. */
/** 对抗展示**结局**读起来该是什么颜色：一条**发现**是红的，期望的结果不是。 */
export function showcaseOutcomeTagType(outcome: string | null | undefined): TagType {
  switch (outcome) {
    case 'allowed':
    case 'denied':
    case 'unresolved':
      return 'success'
    case 'requiresConfirmation':
      return 'warning'
    case 'unknown-scenario':
      return 'info'
    default:
      return 'danger'
  }
}
