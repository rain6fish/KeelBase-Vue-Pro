// SPDX-License-Identifier: Apache-2.0

// The governance surfaces this console reads, in the shapes the runtime actually returns them.
//
// Every type below is the runtime's own answer, not the reference console's wider model. Where the
// reference has a field this runtime has no concept of — a username joined onto an audit row, a
// token count, an authorisation verdict — the field is simply absent, and the pages do not render
// it. The alternative would be to draw a column that can only ever be empty, or to invent a value,
// and both are worse than a narrower table.
//
// 这个控制台读的那些治理面，按运行时**实际**返回的形状。
//
// 下面每个类型都是运行时自己的答复，不是参照实现那个更大的模型。参照实现有、而本运行时根本没有
// 概念的字段——审计行上联出来的用户名、token 计数、授权结论——在这里就是**缺席**，页面也就不渲染
// 它们。另一条路是画一个永远只能空着的列、或者编一个值，两者都比一张更窄的表更糟。
import { runtime } from './runtime'

/** One check the gate evaluated, in the frozen authorization shape. */
/** 闸门评估过的一道检查，按冻结的授权形状。 */
export interface AuthorizationCheck {
  name: string
  ok: boolean
  note?: string
}

/**
 * Why a call was allowed or refused — the runtime's frozen authorization snapshot, carried on the
 * audit row. The console used to drop it; F-18 renders the checks it already receives.
 *
 * 一次调用**凭什么**被允许或被拒 —— 运行时那份冻结的授权快照，随审计行一起到。控制台过去把它丢掉；
 * F-18 把已经收到的这几道检查画出来。
 */
export interface AuthorizationBasis {
  tool?: string
  riskLevel?: string
  riskStrategy?: string
  requiresConfirmation?: boolean
  checks?: AuthorizationCheck[]
  policy?: { revision?: string } | null
}

/** One audit row, in the frozen `ai-audit-log-row` shape the runtime fills. */
/** 一行审计行，按运行时填的冻结对象 `ai-audit-log-row` 的形状。 */
export interface AuditRow {
  id: number
  userId: string | null
  action: string | null
  detail: string | null
  isError: boolean
  createdAt: string
  /** C-3: the vocabulary's word for what this call came to; null on rows that are not one tool call. */
  /** C-3：词表里说这次调用**怎么了**的那个词；不是某一次工具调用的行上为 null。 */
  outcome: string | null
  /** C-3: the tool this row is about; null when the row is not about one. */
  /** C-3：这一行讲的那个工具；这一行不是在讲某个工具时为 null。 */
  tool: string | null
  /**
   * v6: the governed execution this row belongs to. It is what pairs an intent row with its result
   * row; a block, a pending decision, an approval or a decline is not part of an execution and carries
   * null. Declared here because the runtime already sends it (`AuditService#row`) — nothing is asked of
   * the wire that it does not answer today.
   *
   * v6：这一行所属的那一次受治理执行。它把一次尝试的 intent 行与结果行配到一起；拦截、待决、批准与否决
   * 不属于任何一次执行、带 null。这里声明它，是因为运行时**已经在发**它（`AuditService#row`）——
   * 没有向线缆要任何它今天不答的东西。
   */
  executionId?: string | null
  /**
   * 凭什么允许或拒绝这一行 —— 那道让写跑起来的闸的结构化裁决；运行时没有为这一行记下依据时为 null。
   * 它**不**在页面上印出来，而是第五问（谁确认）**唯一**的依据：这一行**当时**的裁决，不是工具清单
   * **此刻**的设定。读者这一面放弃的是把那串 JSON 原样印出来，留下的是用它答一句业务话。
   *
   * 本宿主把它存成规范 JSON 串并原样发出；读侧解析这个串，也接受已解析的对象，使类型不依赖某个部署
   * 恰好发的是哪一种形状。
   *
   * What allowed or refused this row — the structured verdict of the gate that let the write run; null
   * when the runtime recorded no basis for this row. It is **not printed** on this page, and it is the
   * only basis of the fifth question (who confirmed): this row's own decision, not the tool inventory's
   * setting today. Printing the raw JSON is what the reader's face gave up; using it to answer in
   * business words is what it kept.
   *
   * This host stores the basis as a canonical JSON string and sends it verbatim; the reader parses that
   * string, and also accepts an already-parsed object so the type does not depend on which shape a
   * deployment happens to send.
   */
  authorization?: AuthorizationBasis | string | null
}

/** One node of the walk `/audit/verify` performs — the chain itself, not a summary of it. */
/** `/audit/verify` 那次走链的一个节点——是链本身，不是它的摘要。 */
export interface ChainNode {
  id: number
  /** When the row was written. The runtime fills it; the node used to be drawn without it. */
  /** 这一行写下的时刻。运行时填它；此前画节点时没有用它。 */
  createdAt?: string | null
  action?: string | null
  hash?: string | null
  prevHash?: string | null
  broken?: boolean
}

export interface ChainVerification {
  valid: boolean
  checked: number
  brokenIndex: number | null
  chain: ChainNode[]
}

/** One row of `/ai/tool-effects` — the ledger of what AI wrote, as this runtime records it. */
/** `/ai/tool-effects` 的一行——AI 写了什么的台账，按本运行时记录的样子。 */
export interface EffectRow {
  id: number
  toolName: string | null
  /** 谁发起的这次写（JV-65）—— 运行时一直存着这个值，此前缺的只是 wire 上的一处声明。 */
  /** Who caused the write (JV-65) — the runtime always held the value; the wire declaration was missing. */
  userId: string | null
  resultType: string | null
  resultId: number | string | null
  createdAt: string
  targetExists: boolean
  targetSoftDeleted: boolean
  targetTitle: string | null
  revokeClass: string | null
  status: 'executed' | 'revoked' | string
  revokeStatus: string | null
  revocable: boolean
  /**
   * The row as it was before this write, and what the tool returned as having written. Both are on the
   * wire already (`EffectController`); the audit detail draws them as the "before → after" of the
   * changed fields. For an update the runtime records only an `id` in the after — that is what the tool
   * hands back — so the page says which half it has rather than dressing one up as the other.
   *
   * 这一行在这次写**之前**的样子，以及工具交回来的、它写了什么。两者都已经在线缆上（`EffectController`）；
   * 审计详情把它们画成被改字段的「改前 → 改后」。一次改行的改后，运行时**只**记下了一个 `id`——那正是工具
   * 交回来的东西——故页面说清楚它拿到的是哪一半，而不是把一半装成另一半。
   */
  beforeSnapshot?: string | null
  afterSnapshot?: string | null
  /** The conversation this effect belongs to; null for a write made outside one. */
  /** 这条副作用所属的会话；不在会话里发生的写为 null。 */
  conversationId?: string | null
  /** The governed execution that wrote this row. Empty on this deployment's ledger rows today. */
  /** 写下这一行的那次受治理执行。本部署的台账行今天这一列是空的。 */
  executionId?: string | null
}

export interface EffectPage {
  total: number
  page: number
  limit: number
  items: EffectRow[]
}

/** One pending write of the caller's own, awaiting an out-of-conversation decision. */
/** 调用方**本人**的一笔待决写入，等一个对话之外的裁决。 */
export interface ConfirmationItem {
  token: string
  toolName: string | null
  /** Null in this runtime: a human-readable summary needs a presentation layer it does not have. */
  /** 本运行时为 null：给人读的摘要需要它没有的展示层。 */
  summary: string | null
  arguments: Record<string, unknown> | null
  mode: string
  riskLevel: string | null
  status: string
  impact: { actions: number } | null
  revokeClass: string | null
  createdAt: string
  decidedAt: string | null
  expiresAt?: string
  executionState: string | null
  executedAt: string | null
  executionError: string | null
}

export interface AuditLogQuery {
  userId?: string
  since?: string
  isError?: string
  limit?: number
  offset?: number
}

export const auditApi = {
  /**
   * The walk over the chain, with the nodes it walked.
   *
   * Only the filters this runtime honours are offered by the callers: it *refuses* `agentId` and
   * `orgId` rather than ignoring them, because a filter that is accepted and not applied returns a
   * list that looks filtered and is not. So the page must not offer them either.
   *
   * 走一遍链，连同它走过的节点。
   *
   * 调用方只提供本运行时**认**的那些筛选：`agentId` 与 `orgId` 是被**拒绝**的，不是被忽略的——
   * 一个被接受却没被施加的筛选回出来的是一份看着像筛过、其实没有的列表。故页面也不该提供它们。
   */
  verify: () => runtime.get<ChainVerification>('/audit/verify').then((r) => r.data),
  logs: (query: AuditLogQuery) => runtime.get<AuditRow[]>('/audit/logs', { params: query }).then((r) => r.data),
}

/**
 * 一份覆盖声明（`AW-3`），按运行时 `CoverageStatement` 的 wire 形状：判断所依据的登记表版本、读过的口径、
 * **真的问过**的源、算出的结论、以及适用的缺口。`origin` 与 `verdictImpact` 留在登记表里、不上 wire，
 * 故这里也没有它们。
 *
 * A coverage statement (`AW-3`), in the runtime's `CoverageStatement` wire shape: the registry revision it
 * was judged against, the scope it was read over, the sources **actually consulted**, the derived
 * verdict, and the gaps that apply. `origin` and `verdictImpact` stay in the registry and never reach
 * the wire, so they are absent here too.
 */
export interface CoverageScope {
  kind: string
  since: string
  to: string
  subjectRef: string | null
}

export interface CoverageSource {
  id: string
  state: string
  rows: number | null
}

export interface CoverageGap {
  id: string
  severity: string
  affects: string
  /** 登记表给读者的话，原样转述 —— 前端没有一张会漂开的缺口清单。 */
  /** The registry's own words for the reader, repeated verbatim — no frontend list to drift. */
  statement: string
}

export interface CoverageStatement {
  registryRevision: string
  scope: CoverageScope
  sources: CoverageSource[]
  verdict: string
  gaps: CoverageGap[]
}

export interface CoverageQuery {
  since?: string
  until?: string
  userId?: string
}

export const coverageApi = {
  /**
   * 读覆盖声明。闸与其余审计读面相同（`read AuditLog`）：审计读者够得到、普通调用方够不到 —— 这不是
   * 本页要遮的事，是运行时自己会答 403 的事。不给时间窗时默认最近 30 天。
   *
   * Read the coverage statement. It is gated like the rest of the audit reads (`read AuditLog`): an
   * audit reader reaches it and an ordinary caller does not — nothing for this page to hide, the
   * runtime answers 403 by itself. With no window it defaults to the last 30 days.
   */
  read: (query: CoverageQuery = {}) =>
    runtime.get<CoverageStatement>('/audit/coverage', { params: query }).then((r) => r.data),
}

/**
 * What an out-of-band decision did, in the shape both runtimes answer (`OutOfBandDecision`).
 * `ok=false` means the row changed nothing (already decided, past its window, not yours);
 * `success` says whether the approved write actually ran, and `message` why it did not.
 *
 * 一次离线裁决做了什么，按两个运行时都这么答的形状。`ok=false` 指这一行什么都没改（已被裁决、
 * 过了窗口、不是你的）；`success` 说批准的那次写到底跑没跑成，`message` 说为什么没成。
 */
export interface OutOfBandDecision {
  ok: boolean
  success?: boolean | null
  resultId?: number | string | null
  message?: string | null
}

/**
 * 一页确认记录，按 `/ai/confirmations` 答的形状：与 `/ai/my/confirmations` **同一份**行投影，只是覆盖
 * 所有调用方、且不按调用方自己的窗口收窄。
 *
 * One page of confirmation records, as `/ai/confirmations` answers it: the **same** row projection as
 * `/ai/my/confirmations`, over every caller and without the caller's own window narrowing it.
 */
export interface ConfirmationPage {
  total: number
  page: number
  limit: number
  items: ConfirmationItem[]
}

export const confirmationApi = {
  mine: (status?: string) =>
    runtime
      .get<ConfirmationItem[]>('/ai/my/confirmations', { params: status ? { status } : {} })
      .then((r) => r.data),
  /**
   * 全量确认队列，只读。审计页用它回答「被扣下或被拒的那次调用落在哪条记录上」：台账里没有那一行，而
   * 确认记录带着这次提议的参数（`arguments`）。闸是 `read Confirmation` —— 审计读者也持有。
   *
   * The whole confirmation queue, read-only. The audit page uses it to answer "which record was the held
   * or refused call about": the ledger has no such row, and the confirmation record carries the
   * arguments of that proposal. The guard is `read Confirmation` — an audit reader holds it too.
   */
  listAll: (page = 1, limit = 50) =>
    runtime.get<ConfirmationPage>('/ai/confirmations', { params: { page, limit } }).then((r) => r.data),
  decide: (token: string, decision: 'approve' | 'decline') =>
    runtime
      .post<OutOfBandDecision>(`/ai/my/confirmations/${encodeURIComponent(token)}/decide`, { decision })
      .then((r) => r.data),
}

/**
 * The adversarial demonstration. It is a runtime-specific exhibit — no wire object, not in replay
 * scope — so nothing about it is promised by the contract, and it is read here the same way any
 * other route of this deployment's is.
 *
 * 对抗性演示。它是 runtime-specific 的展示物——无 wire 对象、不在 replay 范围——故契约对它不作任何
 * 承诺，这里读它的方式与读本部署别的路由一样。
 */
export interface ShowcaseScenario {
  id: string
  category: string
  /** What the scenario actually exercises, so a reader can tell what a result did and did not prove. */
  /** 这条场景**实际**驱动什么——好让读者分得清一个结果证明了什么、没证明什么。 */
  drives: string
  expect: string
}

export interface ShowcaseResult {
  id: string
  /** What the console shows. */
  /** 控制台显示的那个。 */
  outcome: string
  /** The runtime's own word for the same event; null when the call never reached the engine. */
  /** 运行时对同一件事自己的叫法；这次调用根本没到引擎时为 null。 */
  engine: string | null
  detail: string
}

export const showcaseApi = {
  scenarios: () => runtime.get<ShowcaseScenario[]>('/ai/security-showcase/scenarios').then((r) => r.data),
  run: (id: string) =>
    runtime.post<ShowcaseResult>(`/ai/security-showcase/run/${encodeURIComponent(id)}`).then((r) => r.data),
}

/**
 * The tool inventory, in the frozen `ai-tool-inventory` shape. Two of its fields are empty here and
 * the page says so rather than dressing them up: this runtime has no role allowlist and no
 * permission list to report — {@code allowedRoles} comes back empty and {@code permissions} null —
 * because its gate decides on risk level alone. A console that filled those in would be describing a
 * surface this deployment does not have.
 *
 * 工具清单，按冻结对象 `ai-tool-inventory` 的形状。其中两个字段在这里是**空的**，而页面**如实说**、
 * 不替它们装点：本运行时没有角色白名单、也没有权限清单可报——`allowedRoles` 回来是空的、`permissions`
 * 是 null——因为它的门**只看风险级**。一个把它们填上的控制台，就是在描述一个**本部署并不具备**的面。
 */
export interface ToolParameterRow {
  name: string
  type: string
  required: boolean
}

export interface ToolInventoryItem {
  name: string
  description: string | null
  parameters: ToolParameterRow[]
  enabled: boolean
  requiresConfirmation: boolean
  requiresApproval: boolean
  /** `auto` | `confirm` | `approval` | `blocked` — the effective gate, not the declaration. */
  /** `auto` | `confirm` | `approval` | `blocked` —— **生效的**闸，不是声明。 */
  gateMode: string
  allowedRoles: string[]
  permissions: string[] | null
  riskLevel: string
  riskStrategy: string
  revokeClass: string | null
}

export const toolApi = {
  inventory: () => runtime.get<ToolInventoryItem[]>('/ai/tools').then((r) => r.data),
}

/**
 * One conversation, in the frozen `conversation-data` shape. The runtime derives conversations from
 * their messages, so there is no separate conversation row behind these.
 *
 * 一个会话，按冻结对象 `conversation-data` 的形状。本运行时的会话是**由消息推出来的**，故这些字段背后
 * 没有单独的一行会话记录。
 */
export interface ConversationMessageRow {
  role: string
  content: string
  timestamp: string
}

export interface ConversationData {
  id: string
  userId: string
  provider: string
  model: string
  summary: string | null
  /**
   * 用户给这条会话起的名字（`conversation-data` v2 的可选字段）。没有名字时缺席或为 null —— 页面**不**
   * 从消息正文派生一个：那是内容摘要，属于 `conversation-meta` 刻意不带的（AU-4）。
   *
   * The name the user gave this conversation (v2's optional field); absent or null when unnamed. The page
   * does **not** derive one from message text — that is a content digest, which `conversation-meta`
   * deliberately does not carry (AU-4).
   */
  title?: string | null
  /** The whole transcript's size — the list itself carries only the newest turns. */
  /** **整段**对话记录的条数 —— 列表本身只带最新的几条回合。 */
  messageCount?: number
  createdAt: string
  lastActivityAt: string
  messages: ConversationMessageRow[]
}

/**
 * The side effect a trace step produced, narrowed to what this page reads. The frozen shape carries
 * more (`effectId`, `targetTitle`, `revocable`, before/after snapshots); none of it is drawn here.
 *
 * 轨迹一步产出的那条副作用，收窄到本页读的那几项。冻结形状里还有更多（`effectId`、
 * `targetTitle`、`revocable`、前后快照）；这里一项都不画。
 */
export interface TraceEffect {
  resultType?: string | null
  resultId?: number | string | null
  status?: string | null
}

/**
 * One step of a trace, in the frozen `trace-step` shape. The runtime writes no prose into `content`
 * for tool calls, decisions or effects, so the page composes a line from the fields below. `args` is
 * deliberately absent: the coverage statement promises the call's argument string is never shown.
 *
 * 轨迹的一步，按冻结对象 `trace-step` 的形状。运行时不给工具调用、裁决与副作用写 `content` 的文字，
 * 故页面用下面这些字段拼出一行。**`args` 刻意不在此**：覆盖声明承诺调用的参数串从不显示。
 */
export interface TraceStep {
  id: string
  type: string
  time: string
  content: string | null
  toolName?: string | null
  success?: boolean | null
  errorMessage?: string | null
  /** The runtime's own record line for the step — where a blocked call names its cause. */
  /** 运行时给这一步自己的记录行 —— 被拦下的调用在这里点名成因。 */
  detail?: string | null
  outcome?: string | null
  effect?: TraceEffect | null
}

export interface ConversationTrace {
  conversation: ConversationData
  steps: TraceStep[]
}

export const conversationApi = {
  list: () => runtime.get<ConversationData[]>('/ai/conversations').then((r) => r.data),
  trace: (id: string) =>
    runtime.get<ConversationTrace>(`/ai/conversations/${encodeURIComponent(id)}/trace`).then((r) => r.data),
  /**
   * 给一条会话起名；空白等于清除。属主才能改 —— 服务端按 id 判，页面不复查。
   *
   * Name a conversation; blank clears it. The server decides ownership by the id, and the page does not
   * re-check what the server already enforces.
   */
  rename: (id: string, title: string) =>
    runtime
      .put<{ id: string; title: string | null }>(`/ai/conversations/${encodeURIComponent(id)}/title`, { title })
      .then((r) => r.data),
}

export const effectApi = {
  /**
   * The ledger. Its scope is the caller's, decided by the server: a non-manager sees their own rows
   * whatever they ask for, so the page does not pre-filter by user for them.
   *
   * 台账。范围由**服务端**按调用方定：非管理员无论请求什么看到的都是自己那些行，故页面不替他们
   * 预筛用户。
   */
  list: (page: number, limit: number, userId?: string) =>
    runtime
      .get<EffectPage>('/ai/tool-effects', { params: { page, limit, ...(userId ? { userId } : {}) } })
      .then((r) => r.data),
  revoke: (id: number) => runtime.delete(`/ai/tool-effects/${id}`).then((r) => r.data),
}

/**
 * The host's own operate log, read for one business object (YD-T18 / `D50`).
 *
 * Two records exist for a write the AI caused: the runtime's side effect here, and YuDao's
 * `system_operate_log` row, because `@LogRecord` sits on the CRM *service* and the tool calls that
 * service as written. They already share a key — the runtime's `resultId` is the id YuDao logs as
 * `bizId` — so they can be put side by side.
 *
 * What they are not is a link. Nothing writes a shared id, every `traceId` in that table is empty,
 * and the AI-caused row carries no user at all — so this is a correlation by object id and time, and
 * the page says that out loud rather than presenting it as an identifier.
 *
 * This reaches the host's admin API — `/admin-api/system/operate-log/page` — through the runtime
 * client, which already carries the host's token and tenant and unwraps the host's envelope. Who may
 * read it is the host's decision, not this console's: the endpoint is guarded by YuDao's own
 * `system:operate-log:query`, and that permission is not admin-only here — this deployment grants it
 * to the `common` role — so the leg's scope is the host's own. A refusal is shown as it comes rather
 * than being decided here.
 *
 * 宿主自己的操作日志，按一个业务对象取（`YD-T18` / `D50`）。
 *
 * AI 引起的一次写，有**两条**记录：这边运行时那条副作用，以及芋道 `system_operate_log` 那一行 —— 因为
 * `@LogRecord` 挂在 CRM 的 **service** 上，而工具照它的写法调那个 service。两者**已共有一个键** —— 运行时的
 * `resultId` 就是芋道记成 `bizId` 的那个 id —— 故可以并排摆。
 *
 * 但它们**不是**一条链接：没有任何东西写下一个共享的 id，那张表里每个 `traceId` 都是空的，而 AI 引起的那行
 * 根本**不带用户** —— 所以这是「对象 id + 时间」的**相关**，页面把这句话说出来，而不是把它摆成一个标识符。
 *
 * 它经**运行时客户端**够到宿主的 admin API（`/admin-api/system/operate-log/page`）—— 那个客户端本已带着宿主的
 * token 与租户、并拆宿主的信封。**谁能读是宿主的决定、不是这个控制台的**：那个端点由芋道自己的
 * `system:operate-log:query` 守着，而该权限在本部署**不是管理员专属** —— 它授给了 `common` 角色 —— 故这一腿的
 * 范围就是**宿主自己的**。被拒就照原样显示，而不是在这里判。
 */
const BUSINESS_LOG_TYPE: Record<string, string> = {
  // The runtime names a module its own way; the host names it in Chinese. One side has to translate,
  // and the host is where its own modules are known.
  // 运行时按自己的方式给模块起名，宿主用中文起名。总得有一侧翻译，而模块是在**宿主**那儿认识的。
  crm_customer: 'CRM 客户',
}

export interface BusinessLogRow {
  id: number
  type: string | null
  subType: string | null
  bizId: number | null
  action: string | null
  userId: number | null
  /**
   * 宿主自己给 `userId` 配的名字 —— 它的操作日志页拿管理端用户表把 id 译出来，故这个名字随行一起到，
   * 不必再发一次查询就说得出一行的调用方。
   */
  userName: string | null
  createTime: string
}

export const businessLogApi = {
  /** The host-side type this result type maps to, or null when the two vocabularies do not meet. */
  /** 这个结果类型对应的宿主侧类型；两套词表碰不上时给 null。 */
  mappedType: (resultType: string | null | undefined): string | null =>
    resultType ? (BUSINESS_LOG_TYPE[resultType] ?? null) : null,

  /**
   * The rows YuDao logged for this object. No time window is passed: the server returns newest-first
   * and the page shows the few it can put beside the action, naming the correlation's limits instead
   * of pretending a time bound would make it exact.
   *
   * 芋道为这个对象记下的行。**不传时间窗**：服务端按最新在前返回，页面只展示能摆到动作旁边的那几行，
   * 并**写出这条相关的限度**，而不是假装加个时间界就精确了。
   */
  byObject: (businessType: string, bizId: number | string) =>
    runtime
      .get<{ list: BusinessLogRow[]; total: number }>('/admin-api/system/operate-log/page', {
        params: { type: businessType, bizId, pageNo: 1, pageSize: 5 },
      })
      .then((r) => r.data),
}

/**
 * One row of `/audit/operations/logs` — a write to the business, including the ones no AI took part
 * in. That is a different chain from the AI audit beside it, and nothing joins the two.
 *
 * The frozen object declares more than this runtime fills; what is absent — the request body, the
 * field-level diff, the feature names, the two hash columns — is absent because nothing here
 * produces it. The page draws the eleven the runtime answers and says nothing about the rest.
 *
 * `/audit/operations/logs` 的一行 —— 对**业务**的一次写，含没有 AI 参与的那些。它读的是与旁边那条 AI
 * 审计**不同**的链，且没有任何东西把两者连起来。
 *
 * 冻结对象声明的比本运行时填的多；缺的那些 —— 请求正文、字段级差异、功能名、两个哈希列 —— 之所以缺，
 * 是因为这里没有东西产出它们。页面只画运行时答得出的那十一个，其余一个字不说。
 */
export interface OperationAuditRow {
  id: number
  /** Numeric identity, exactly as the frozen object types it (`number | null`); null when this identity is not numeric. */
  /** 数字形式的身份，与冻结对象的定型一致（`number | null`）；这个身份不是数字时为 null。 */
  userId: number | null
  /** The identity string the runtime preserved when `userId` is null — not a name joined onto the row. */
  /** `userId` 为 null 时运行时**保留下来**的身份字符串——不是联到这一行上的名字。 */
  username: string | null
  /** `LOGIN` | `LOGOUT` | `UPLOAD` | `CREATE` | `UPDATE` | `DELETE` — the row's own word for the act. */
  /** `LOGIN` | `LOGOUT` | `UPLOAD` | `CREATE` | `UPDATE` | `DELETE` —— 这一行对这次动作自己的叫法。 */
  action: string | null
  method: string | null
  path: string | null
  targetId: string | null
  ip: string | null
  userAgent: string | null
  statusCode: number | null
  createdAt: string
}

export interface OperationAuditPage {
  total: number
  page: number
  limit: number
  items: OperationAuditRow[]
}

export const operationAuditApi = {
  /**
   * The operations trail, newest first. This face takes a window and nothing else — no caller, no
   * period, no outcome — so the page offers none: a filter that is accepted and not applied returns
   * a list that looks filtered and is not, which is worse than a filter that is refused.
   *
   * 操作轨，最新的在前。这条面只收一个窗口、别的都不收 —— 没有调用方、没有时间段、没有结局 —— 故页面
   * 一个都不提供：一个**被接受却没被施加**的筛选回出来的是一份**看着像筛过、其实没有**的列表，比一个
   * **把话说出来**的拒绝更糟。
   */
  list: (page: number, limit: number) =>
    runtime.get<OperationAuditPage>('/audit/operations/logs', { params: { page, limit } }).then((r) => r.data),
}

/**
 * The governance policy, in the shape the runtime stores it: what a tool's gate is overridden to, and
 * how much of the audit is kept. An override is a **narrow** document — a tool's mode, whether it is
 * enabled, who may call it — because that is all this runtime validates; anything else it *refuses*
 * rather than stores, on the ground that a console would render it as a restriction while nothing
 * would ever enforce it.
 *
 * 治理策略，按运行时**存它**的形状：某个工具的闸被覆盖成什么，以及审计留到什么粒度。一条覆盖是一份
 * **很窄**的文档 —— 某个工具的 mode、它是否启用、谁可以调它 —— 因为本运行时**只校验**这些；其余的它
 * **拒绝**、而不是存下来，理由是：控制台会把它渲染成一条限制，而**没有任何东西会去施加它**。
 */
export interface ToolPolicyOverride {
  /** `auto` | `confirm` | `approval` — a policy may tighten or relax a gate, not invent one. */
  /** `auto` | `confirm` | `approval` —— 策略可以收紧或放松一道闸，不能发明一道。 */
  mode?: string
  enabled?: boolean
  requiresConfirmation?: boolean
  /** Only this deployment's two roles; the runtime refuses anything else. */
  /** 只认本部署的那两个角色；其余运行时一律拒绝。 */
  allowedRoles?: string[]
}

export interface GovernancePolicy {
  tools: Record<string, ToolPolicyOverride>
  audit: { granularity: string }
  revision?: string | number
  updatedAt?: string
}

export const policyApi = {
  read: () => runtime.get<GovernancePolicy>('/ai/governance/policy').then((r) => r.data),
  /**
   * Replace the policy. The body is the whole document — `tools` and `audit` — because that is what the
   * face takes; the runtime offers no partial write, so the page must not invent one.
   *
   * 替换整份策略。正文是**整份文档** —— `tools` 与 `audit` —— 因为那条面收的就是它；运行时**不提供**
   * 局部写，故页面也不该在这里发明一个。
   */
  write: (body: { tools: Record<string, ToolPolicyOverride>; audit: { granularity: string } }) =>
    runtime.put<GovernancePolicy>('/ai/governance/policy', body).then((r) => r.data),
}
