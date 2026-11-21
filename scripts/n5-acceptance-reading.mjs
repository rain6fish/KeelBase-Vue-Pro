#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// N5 验收取数：给定**一次执行**或**一个业务对象**，把验收判据要的读数一次取全 ——
//
//   六问逐格（谁 / 何时 / 哪个业务对象 / 改成什么 / 谁确认 / 结果）
//   六列业务 CSV 与八列核对 CSV 的对应行
//   审计链的行哈希、prev 链接与 `/audit/verify` 的 valid
//   第二入口（宿主自己的操作日志）的对象 / 时间 / 谁
//
// 这个脚本**不重写**控制台的判据。六问的组合、对象的证据链、CSV 的列序与泄漏拒绝，全部 import 自控制台
// 自己的纯模块（`sixQuestions.mjs` / `auditQuery.mjs`）—— 文件与屏幕同一份逻辑，不是第二套。本脚本只做
// 控制台不做的两件事：**离线**（对一份抓取快照跑）与**说清哪一段取不到**（`无法取数`，exit 2）。
//
// 三条固定的写法：
//
//   ① **取不到 ≠ 不合格。** 宿主不可达、端点 404、快照缺一段，都是 `无法取数`（exit 2），不写成 FAIL，
//      更不写成 PASS。只有「取到了、判据不满足」才是 FAIL（exit 1）。
//   ② **批准行按 executionId 选，选不到时才按工具 + 五秒配。** 0.1.20 的批准行带同一 executionId
//      （`GovernedExecutionEngine#performApproval`）；更早的运行时不带，此时沿用控制台同一条证据链，
//      并把「按工具 + 五秒配的」写出来。
//   ③ **页面规则与对象读面规则不一致时说出来。** 六问按页面规则（同工具、五秒内、恰好一条台账）配对；
//      对象检索按 `objectRefOf`（带 executionId 时精确配）。两者若指向不同的台账行，报告里点名 —— 那是
//      「同一操作两个答案」的苗头，不能吞掉。
//
// 用法：
//
//   node scripts/n5-acceptance-reading.mjs --execution <id> --snapshot <dump.json>
//   node scripts/n5-acceptance-reading.mjs --object crm_customer:1 --snapshot <dump.json>
//   node scripts/n5-acceptance-reading.mjs --execution <id> --host http://127.0.0.1:48080 --token <bearer>
//   node scripts/n5-acceptance-reading.mjs --execution <id> --snapshot <dump.json> --csv <导出.csv> --check-csv <核对.csv>
//   node scripts/n5-acceptance-reading.mjs --sha256 <录屏或截图目录>
//
// 退出码：0 = 取到数且全部判据通过；1 = 取到数但至少一条判据不通过；2 = 有一段取不到（不得当通过）；
//         64 = 用法错误。
//
// ── English ─────────────────────────────────────────────────────────────────────
//
// N5 acceptance readings: given **one execution** or **one business object**, collect every reading the
// criteria ask for — the six answers cell by cell, the rows of both CSVs, the audit chain's hashes and
// `/audit/verify`, and the second entry (the host's own operation log).
//
// This script does **not** re-implement the console's criterion. The six-cell composition, the object's
// evidence chain, the CSV column order and the internal-name refusal are all imported from the
// console's own pure modules (`sixQuestions.mjs` / `auditQuery.mjs`) — one body of logic for the file
// and the screen, not a second one. What this script adds is only what the console cannot do: run
// **offline** against a captured snapshot, and say exactly which reading could not be taken
// (`无法取数`, exit 2).
//
// Three fixed rules: **cannot-read is not a failure** (unreachable host, 404, a missing snapshot
// section → exit 2, never FAIL and never PASS); the **approval row is selected by executionId**, falling
// back to tool + five seconds only when the runtime does not carry it, and the report says which was
// used; and when the page's pairing rule and the object read face's rule point at different ledger rows,
// the report names it instead of swallowing it.
//
// Exit codes: 0 = readings taken and every criterion passes; 1 = readings taken and at least one
// criterion fails; 2 = a reading could not be taken (never read as a pass); 64 = usage error.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  BLANK,
  approverOf,
  composeSix,
  leaksIn,
  recordedObjectIn,
  recordedTypedObject,
  scoreSix,
  zonedTime,
} from '../keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs'
import {
  CHECK_COLUMN_KEYS,
  CSV_QUESTION_KEYS,
  CsvLeak,
  checkCsvFilename,
  checkCsvText,
  csvFilename,
  csvText,
  matchEffect,
  matchProposal,
  objectRefOf,
  selectRows,
} from '../keelbase-ui/host-overlay/src/keelbase/auditQuery.mjs'

// ── 词表 ──────────────────────────────────────────────────────────────────────
//
// 这一张是**镜像**，不是定义：每个值都抄自 `keelbase-ui/host-patches/0002-governance-ui.patch` 的
// zh-CN 词条，`scripts/n5-acceptance-reading.test.mjs` 逐字对账。镜像的原因是本脚本不能 import 那份
// 补丁、也不能 import `.ts`（CI 跑 Node 22）；一旦补丁改了词，那条测试先红。
//
// This table is a **mirror**, not a definition: every value is copied from the zh-CN messages in
// `0002-governance-ui.patch`, and the test holds the two against each other verbatim. A mirror is
// needed because this script cannot import a patch file or a `.ts` module on CI's Node 22; when a
// message changes, that test goes red first.
const MESSAGES = {
  'keelbase.sixQ.who': '谁',
  'keelbase.sixQ.when': '何时（带时区）',
  'keelbase.sixQ.object': '哪个业务对象',
  'keelbase.sixQ.change': '改成什么（改前 → 改后）',
  'keelbase.sixQ.confirmation': '谁确认',
  'keelbase.sixQ.result': '结果',
  'keelbase.sixQ.account': '账号',
  'keelbase.sixQ.someone': '某人',
  'keelbase.sixQ.whoUnrecorded': '未记录 —— 这一行没有记下调用方',
  'keelbase.sixQ.whoUnnamed': '姓名未记录',
  'keelbase.sixQ.confirmNotNeeded': '无需确认 —— 这个工具被设为自动放行',
  'keelbase.sixQ.confirmSelf': '确认了这次写（本人确认；客户端未记）',
  'keelbase.sixQ.confirmWaiting': '还没有确认 —— 这次写仍在等',
  'keelbase.sixQ.confirmDeclined': '拒绝了这次写（本人拒绝；客户端未记）',
  'keelbase.sixQ.confirmApprovalUnrecorded': '由第二人批准 —— 这一行没有记下批准人是谁',
  'keelbase.sixQ.confirmSecondPerson': '批准了这次写（第二人，不是操作者本人）',
  'keelbase.sixQ.confirmDecisionApproved': '批准了这次写（这一行本身就是这次裁决；批准人见「谁」）',
  'keelbase.sixQ.confirmBlocked': '不会有人确认 —— 这个工具停在拦截档',
  'keelbase.sixQ.objectUnrecorded': '未记录 —— 这次调用没有写下任何记录',
  'keelbase.sixQ.objectUnnamed': '本控制台没有给它名字的业务对象',
  'keelbase.sixQ.changeNone': '没有改动 —— 这次写入没有发生',
  'keelbase.sixQ.changeCreated': '新建：没有改前，而这次写本身也没有记下字段值',
  'keelbase.sixQ.changeBefore': '改前',
  'keelbase.sixQ.changeAfter': '改后',
  'keelbase.sixQ.changeAfterUnrecorded': '运行时没有记下的值，这里不替它补',
  'keelbase.sixQ.hostNow': '宿主现在的记录，不是写入那一刻的快照',
  'keelbase.sixQ.fieldName': '客户名称',
  'keelbase.sixQ.fieldLevel': '客户等级',
  'keelbase.sixQ.fieldSource': '客户来源',
  'keelbase.sixQ.fieldDealStatus': '已成交',
  'keelbase.sixQ.fieldFollowUpStatus': '已跟进',
  'keelbase.record.crm_customer': '客户',
  'keelbase.record.follow_up': '示例跟进记录',
  'keelbase.record.pm_project': '项目',
  'keelbase.record.crm_follow_up_record': 'CRM 跟进记录',
  'keelbase.record.crm_business': '商机',
  'keelbase.record.crm_clue': '线索',
  'keelbase.record.crm_contact': '联系人',
  'keelbase.record.crm_contract': '合同',
  'keelbase.record.crm_product': '产品',
  'keelbase.record.crm_receivable': '回款',
  'keelbase.record.crm_receivable_plan': '回款计划',
  'keelbase.record.bpm_oa_leave': '请假申请',
  'keelbase.record.bpm_process_instance': '流程实例',
  'keelbase.record.infra_demo01_contact': '示例联系人',
  'keelbase.record.infra_file': '文件',
  'keelbase.record.fms_voucher': '凭证',
  'keelbase.record.system_notice': '通知公告',
  'keelbase.record.system_notify_message': '站内消息',
  'keelbase.record.products': '商品',
  'keelbase.record.ai1_mcp': 'MCP 连接',
  'keelbase.vocab.outcome.attempted': '试过',
  'keelbase.vocab.outcome.executed': '已执行',
  'keelbase.vocab.outcome.pending': '待决',
  'keelbase.vocab.outcome.blocked': '阻断',
  'keelbase.vocab.outcome.refused': '拒绝',
  'keelbase.vocab.outcome.declined': '否决',
  'keelbase.vocab.outcome.failed': '失败',
  'keelbase.vocab.outcome.approved': '已批准',
  'keelbase.vocab.outcome.timeout': '超时',
  'keelbase.vocab.outcome.revoked': '已撤销',
  'keelbase.meaning.attempted': '只记「试过」—— 同一对象的「已执行」行通常是它的结局',
  'keelbase.meaning.executed': '真的执行了，写已经在系统里',
  'keelbase.meaning.executedRead': '真的执行了，但这是一次查询 —— 系统里的数据没有被改动',
  'keelbase.meaning.executedUnknown': '真的执行了',
  'keelbase.meaning.pending': '还没真的写入 —— 在等人批准',
  'keelbase.meaning.blocked': '被风险策略挡下，根本没到裁决',
  'keelbase.meaning.refused': '被治理或授权拒绝',
  'keelbase.meaning.declined': '有人否决了它，所以不会发生',
  'keelbase.meaning.failed': '尝试过了，执行本身失败',
  'keelbase.meaning.approved': '有人批准了，接下来会执行',
  'keelbase.meaning.timeout': '等待窗口走完、没人裁',
  'keelbase.meaning.revoked': '那次写入已被撤销',
  'keelbase.audit.statusOk': '正常',
  'keelbase.audit.statusError': '错误',
  'keelbase.audit.checkPassed': '通过',
  'keelbase.audit.checkFailed': '未通过',
  'keelbase.audit.checkUnregistered': '未登记的检查',
  'keelbase.audit.checksNotRecorded': '未记录 —— 这一行没有记下判定依据',
  'keelbase.audit.check.risk_policy': '风险级（R5 拦截档）—— 每个工具声明一个 R0 到 R5 的风险级，R5 的调用只按风险级就被拒，策略还没被查看',
  'keelbase.audit.check.tool_enabled': '治理策略是否启用',
  'keelbase.audit.check.role_allowed': '角色白名单',
  'keelbase.audit.check.feature_flag': '特性开关',
  'keelbase.audit.check.admin_only': '仅限管理员',
  'keelbase.audit.check.agent_read_only': 'agent 是否只读',
  'keelbase.audit.colId': '编号',
  'keelbase.audit.colChecks': '判定依据',
  'keelbase.audit.exportNote': '相关、非硬链接：每一行的业务主键与时间，可把它与宿主自己的操作日志里的同一次操作对上；两条轨之间没有共享编号，那张日志对动作的叫法也不同。',
  'keelbase.effects.statePresent': '还在',
  'keelbase.effects.stateDeleted': '已删除（回收站可恢复）',
  'keelbase.effects.stateGone': '已不在',
}

const has = (key) => Object.prototype.hasOwnProperty.call(MESSAGES, key)
const t = (key) => (has(key) ? MESSAGES[key] : key)
const te = (key) => has(key)

// ── 镜像自控制台的两张小表 ────────────────────────────────────────────────────
//
// 与 `recordNames.ts` 的 `TOOL_RESULT_TYPES`、`governanceApi.ts` 的 `BUSINESS_LOG_TYPE` 同值；
// 测试对读两份源码。表外一律回落到空串 / null —— 不猜一个类型，也不猜一个宿主模块。
const TOOL_RESULT_TYPES = {
  create_crm_customer: 'crm_customer',
  update_crm_customer: 'crm_customer',
  record_crm_followup: 'crm_follow_up_record',
  create_crm_business: 'crm_business',
  create_crm_clue: 'crm_clue',
  create_crm_contact: 'crm_contact',
  create_crm_contract: 'crm_contract',
  create_crm_product: 'crm_product',
  create_crm_receivable: 'crm_receivable',
  create_crm_receivable_plan: 'crm_receivable_plan',
  approve_oa_leave: 'bpm_oa_leave',
  cancel_my_bpm_instance: 'bpm_process_instance',
  create_demo01_contact: 'infra_demo01_contact',
  rename_demo01_contact: 'infra_demo01_contact',
  delete_infra_file: 'infra_file',
  review_fms_voucher: 'fms_voucher',
  create_notice: 'system_notice',
  mark_notify_message_read: 'system_notify_message',
  mark_all_notify_messages_read: 'system_notify_message',
  create_generated_products: 'products',
  escalate_customer: 'follow_up',
  delete_project: 'pm_project',
}

/** The host-side module name for a result type, or null when the two vocabularies do not meet. */
const BUSINESS_LOG_TYPE = { crm_customer: 'CRM 客户' }

const OUTCOMES = [
  'attempted', 'executed', 'pending', 'blocked', 'refused', 'declined', 'failed',
  'approved', 'timeout', 'revoked',
]

const toolResultType = (tool) => (tool ? TOOL_RESULT_TYPES[tool] ?? '' : '')

/** `mask.ts` 的 `maskTitle`：留首字符，其余换成星号；空值是一个破折号，不是一个孤零零的星号。 */
function mask(value) {
  if (!value) return '—'
  const head = [...String(value)].slice(0, 1).join('')
  return `${head}****`
}

// ── 与审计链页同一条六问组合 ──────────────────────────────────────────────────

/** 页面规则：同一工具、五秒之内、恰好一条台账行。 / The page's rule. */
function effectForRow(row, effects, windowMs = 5000) {
  if (!row || !row.tool || !Array.isArray(effects)) return null
  const at = Date.parse(row.createdAt)
  if (Number.isNaN(at)) return null
  const near = effects.filter(
    (e) => e && e.toolName === row.tool && Math.abs(Date.parse(e.createdAt) - at) <= windowMs,
  )
  return near.length === 1 ? near[0] : null
}

function recordState(effect) {
  if (!effect.targetExists) return t('keelbase.effects.stateGone')
  if (effect.targetSoftDeleted) return t('keelbase.effects.stateDeleted')
  return t('keelbase.effects.statePresent')
}

function hostNowNameOf(effect, recordNames) {
  if (!effect) return ''
  return recordNames[`${effect.resultType ?? ''}#${effect.resultId}`] || effect.targetTitle || ''
}

function proposalNameOf(proposal, recordNames) {
  if (!proposal) return ''
  return recordNames[`${proposal.resultType ?? ''}#${proposal.resultId}`] || ''
}

/** 与审计链页的 `recordedObjectOf` 同一份：行末带类型的键先读，再读被拦下那种。 */
function recordedObjectOf(row, effect, proposal) {
  if (!effect && !proposal) {
    const typed = recordedTypedObject(row)
    if (typed) return typed
  }
  const recordedId = effect || proposal ? null : recordedObjectIn(row)
  return recordedId === null || !row.tool
    ? null
    : { resultType: toolResultType(row.tool), resultId: recordedId }
}

function proposalArgumentOf(row, proposals) {
  const proposal = matchProposal(row, proposals)
  const id = proposal?.arguments?.id
  if (!proposal || id === null || id === undefined) return null
  return { resultType: toolResultType(proposal.toolName), resultId: id }
}

function resultText(row) {
  const key = OUTCOMES.includes(row.outcome) ? `keelbase.vocab.outcome.${row.outcome}` : null
  if (key && te(key)) return t(key)
  return row.isError ? t('keelbase.audit.statusError') : t('keelbase.audit.statusOk')
}

function effectiveOutcome(row) {
  if (OUTCOMES.includes(row.outcome)) return row.outcome
  return row.isError ? 'failed' : 'executed'
}

/** `labels.ts` 的 `toolEffect`：R3+ 或要求确认是写，R0/R1 是读，其余不下结论。 */
function toolEffectOf(tool) {
  const level = tool?.riskLevel
  if (!level) return 'unknown'
  if (tool?.requiresConfirmation || level === 'R3' || level === 'R4' || level === 'R5') return 'write'
  if (level === 'R0' || level === 'R1') return 'read'
  return 'unknown'
}

const EXECUTED_MEANING = { write: 'executed', read: 'executedRead', unknown: 'executedUnknown' }

function meaningText(row, inventory) {
  const outcome = effectiveOutcome(row)
  if (outcome === 'executed') {
    return t(`keelbase.meaning.${EXECUTED_MEANING[toolEffectOf(inventory.get(row.tool))]}`)
  }
  const key = `keelbase.meaning.${outcome}`
  return te(key) ? t(key) : ''
}

function basisOf(row) {
  const raw = row?.authorization
  if (!raw) return null
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function checkText(name) {
  const key = `keelbase.audit.check.${name}`
  return te(key) ? t(key) : t('keelbase.audit.checkUnregistered')
}

function checksTextOf(row) {
  const checks = basisOf(row)?.checks ?? []
  if (!checks.length) return t('keelbase.audit.checksNotRecorded')
  return checks
    .map((c) => {
      const mark = c.ok ? t('keelbase.audit.checkPassed') : t('keelbase.audit.checkFailed')
      return `${mark} ${checkText(c.name)}${c.note ? ` (${c.note})` : ''}`
    })
    .join(' · ')
}

/**
 * 六问的全部答案，一行操作一份。与审计链页的 `sixOf` 同一条算式 —— 同一份 `composeSix`、同一份证据链、
 * 同一个掩码。差别只有一处，且写在明处：这里的台账配对**同时**调用页面规则（工具 + 五秒）与
 * `objectRefOf` 的严格规则；两者指向不同行时，报告里点名（`pairingWarnings`）。
 */
function sixOf(row, ctx) {
  const effect = effectForRow(row, ctx.effects)
  const proposal = effect ? null : matchProposal(row, ctx.proposals)
  const recorded = recordedObjectOf(row, effect, proposal)
  const approver = approverOf(row, ctx.rows)
  const answers = composeSix({
    row,
    callerName: ctx.callerNames[String(row.userId ?? '')] ?? '',
    callerId: row.userId ? String(row.userId) : '',
    effect,
    proposal,
    recorded,
    approverName: approver ? ctx.callerNames[String(approver.userId)] ?? '' : '',
    hostNowName: hostNowNameOf(effect, ctx.recordNames),
    proposalName: proposalNameOf(proposal, ctx.recordNames),
    recordState: effect ? recordState(effect) : '',
    mask,
    resultWord: resultText(row),
    resultMeaning: meaningText(row, ctx.inventory),
    t,
    te,
  })
  return { answers, effect, proposal, recorded, approver }
}

// ── 参数 ──────────────────────────────────────────────────────────────────────

class UsageError extends Error {}

const HELP = `N5 验收取数 · scripts/n5-acceptance-reading.mjs

  --execution <id>        按一次受治理执行取数（推荐；三行共用同一 executionId）
  --object <type>:<id>    按业务对象取数（如 crm_customer:1）
  --snapshot <file>       离线：从一份抓取快照读（与 --host 二选一）
  --host <url>            在线：运行时与宿主共用的源（如 http://127.0.0.1:48080）
  --token <bearer>        --host 模式的访问令牌；也可用 KEELBASE_TOKEN
  --tenant <id>           租户 id，默认 1
  --since <iso>           只看这个时刻之后的行（扫描窗口起点）
  --until <iso>           只看这个时刻之前的行
  --csv <file>            控制台导出的六列 CSV，逐格对账
  --check-csv <file>      控制台导出的八列核对 CSV，逐格对账
  --operate-log-type <w>  覆盖第二入口的宿主模块名（默认取 crm_customer → CRM 客户）
  --out <dir>             把六列 CSV、八列 CSV 与 JSON 读数写进这个目录
  --json <file>           把 JSON 读数写到这个文件（不写 CSV 时也可单用）
  --sha256 <path>...      打印文件或目录的 SHA-256（可重复；目录递归）
  --self-test             跑内置夹具，不连接任何宿主
  --help                  这张说明

退出码：0 全部通过；1 取到数但有判据不通过；2 有一段取不到（不得当通过）；64 用法错误。`

function parseArgs(argv) {
  const opts = { sha256: [] }
  const takes = new Set([
    'execution', 'object', 'snapshot', 'host', 'token', 'tenant', 'since', 'until',
    'csv', 'check-csv', 'operate-log-type', 'out', 'json',
  ])
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') { opts.help = true; continue }
    if (arg === '--self-test') { opts.selfTest = true; continue }
    if (!arg.startsWith('--')) throw new UsageError(`不认识的参数：${arg}`)
    const eq = arg.indexOf('=')
    const name = (eq >= 0 ? arg.slice(2, eq) : arg.slice(2))
    if (name === 'sha256') {
      const value = eq >= 0 ? arg.slice(eq + 1) : argv[++i]
      if (!value) throw new UsageError('--sha256 需要一个路径')
      opts.sha256.push(value)
      continue
    }
    if (!takes.has(name)) throw new UsageError(`不认识的选项：--${name}`)
    const value = eq >= 0 ? arg.slice(eq + 1) : argv[++i]
    if (value === undefined) throw new UsageError(`--${name} 需要一个值`)
    opts[name] = value
  }
  return opts
}

// ── 取数 ──────────────────────────────────────────────────────────────────────

const section = (status, value, reason = '') => ({ status, value, reason })

async function fetchJson(base, path, token, tenant) {
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (tenant) headers['tenant-id'] = String(tenant)
  let res
  try {
    res = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(15000) })
  } catch (e) {
    const why = e?.cause?.code || e?.cause?.errors?.[0]?.code || e?.message || e
    throw new Error(`连不上 ${base}${path}：${why}`)
  }
  if (!res.ok) throw new Error(`${path} 答 HTTP ${res.status}`)
  const type = String(res.headers.get('content-type') ?? '')
  if (!type.includes('json')) {
    throw new Error(`${path} 不是 JSON（content-type: ${type || '无'}）—— 多半是代理兜底把网页答了回来`)
  }
  const body = await res.json()
  if (body && typeof body === 'object' && typeof body.code === 'number') {
    if (body.code !== 0 && body.code !== 200) {
      throw new Error(`${path} 答 code=${body.code}：${body.message ?? body.msg ?? '没有说明'}`)
    }
    return 'data' in body ? body.data : body
  }
  return body
}

async function collectLive(opts) {
  const base = String(opts.host).replace(/\/+$/, '')
  const token = opts.token || process.env.KEELBASE_TOKEN || ''
  const tenant = opts.tenant ?? '1'
  const out = {
    source: `host ${base}`,
    verify: section('unavailable', null, '尚未取'),
    rows: section('unavailable', [], '尚未取'),
    effects: section('unavailable', [], '尚未取'),
    confirmations: section('unavailable', [], '尚未取'),
    inventory: section('unavailable', new Map(), '尚未取'),
    callerNames: section('unavailable', {}, '尚未取'),
    recordNames: section('unavailable', {}, '尚未取'),
    businessLog: new Map(),
  }

  try {
    out.verify = section('ok', await fetchJson(base, '/audit/verify', token, tenant))
  } catch (e) {
    out.verify = section('unavailable', null, e.message)
  }

  try {
    const rows = []
    for (let page = 0; page < 5; page += 1) {
      const chunk = await fetchJson(base, `/audit/logs?limit=200&offset=${page * 200}`, token, tenant)
      if (!Array.isArray(chunk)) throw new Error('/audit/logs 没有回数组')
      rows.push(...chunk)
      if (chunk.length < 200) break
    }
    out.rows = section('ok', rows)
  } catch (e) {
    out.rows = section('unavailable', [], e.message)
  }

  try {
    const head = await fetchJson(base, '/ai/tool-effects?page=1&limit=1', token, tenant)
    const total = Number(head?.total ?? 0)
    const last = Math.max(1, Math.ceil(total / 100))
    const effects = []
    for (let page = Math.max(1, last - 2); page <= last; page += 1) {
      const chunk = await fetchJson(base, `/ai/tool-effects?page=${page}&limit=100`, token, tenant)
      effects.push(...(chunk?.items ?? []))
    }
    out.effects = section('ok', effects)
  } catch (e) {
    out.effects = section('unavailable', [], e.message)
  }

  try {
    const page = await fetchJson(base, '/ai/confirmations?page=1&limit=100', token, tenant)
    out.confirmations = section('ok', page?.items ?? [])
  } catch (e) {
    out.confirmations = section('unavailable', [], e.message)
  }

  try {
    const tools = await fetchJson(base, '/ai/tools', token, tenant)
    out.inventory = section('ok', new Map((tools ?? []).map((item) => [item.name, item])))
  } catch (e) {
    out.inventory = section('unavailable', new Map(), e.message)
  }

  return out
}

/** 一份快照：接受 `{verify, rows, effects, ...}`，也接受套在 `audit:` 下的同名字段。 */
function collectSnapshot(file) {
  let raw
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    return { source: `snapshot ${file}`, error: `读不了快照：${e.message}` }
  }
  const audit = raw.audit ?? {}
  const pick = (name, fallback) => {
    const value = raw[name] ?? audit[name]
    return value === undefined ? fallback : value
  }
  const missing = (name) => section('unavailable', name === 'inventory' ? new Map() : [], `快照里没有 ${name}`)
  const okArray = (name, transform = (v) => v) => {
    const value = pick(name, undefined)
    return Array.isArray(value) ? section('ok', transform(value)) : missing(name)
  }
  const okMap = (name) => {
    const value = pick(name, undefined)
    return value && typeof value === 'object' ? section('ok', value) : missing(name)
  }
  const verify = pick('verify', undefined)
  return {
    source: `snapshot ${file}`,
    capturedAt: raw.capturedAt ?? '',
    verify: verify && typeof verify === 'object' ? section('ok', verify) : missing('verify'),
    rows: okArray('rows'),
    effects: okArray('effects'),
    confirmations: okArray('confirmations'),
    inventory: okArray('inventory', (items) => new Map(items.map((item) => [item.name, item]))),
    callerNames: okMap('callerNames'),
    recordNames: okMap('recordNames'),
    businessLog: new Map(
      Object.entries(pick('businessLog', {}) ?? {}).map(([key, list]) => [
        key,
        Array.isArray(list) ? section('ok', list) : section('unavailable', [], `快照里 ${key} 不是数组`),
      ]),
    ),
  }
}

/** 补齐与选区相关的名字表：调用方、记录名、第二入口。缺一段就记 `unavailable`，不编。 */
async function enrichLive(opts, state, refs, ids, logTypeOf) {
  const base = String(opts.host).replace(/\/+$/, '')
  const token = opts.token || process.env.KEELBASE_TOKEN || ''
  const tenant = opts.tenant ?? '1'

  if (ids.size) {
    try {
      const rows = await fetchJson(
        base,
        `/admin-api/keelbase/caller-names?ids=${encodeURIComponent([...ids].join(','))}`,
        token,
        tenant,
      )
      state.callerNames = section('ok', Object.fromEntries((rows ?? []).map((r) => [String(r.id), r.name])))
    } catch (e) {
      state.callerNames = section('unavailable', {}, e.message)
    }
  } else {
    state.callerNames = section('ok', {})
  }

  if (refs.size) {
    try {
      const value = [...refs].map((ref) => `${ref.type}:${ref.id}`).join(',')
      const rows = await fetchJson(
        base,
        `/admin-api/keelbase/record-names?refs=${encodeURIComponent(value)}`,
        token,
        tenant,
      )
      state.recordNames = section(
        'ok',
        Object.fromEntries((rows ?? []).map((r) => [`${r.type}#${r.id}`, r.name])),
      )
    } catch (e) {
      state.recordNames = section('unavailable', {}, e.message)
    }
  } else {
    state.recordNames = section('ok', {})
  }

  for (const [key, ref] of refs) {
    if (state.businessLog.has(key)) continue
    const type = logTypeOf(ref.type)
    if (!type) {
      state.businessLog.set(key, section('unavailable', [], `结果类型 ${ref.type || '(空)'} 在本仓没有宿主操作日志映射；可用 --operate-log-type 覆盖`))
      continue
    }
    try {
      const page = await fetchJson(
        base,
        `/admin-api/system/operate-log/page?type=${encodeURIComponent(type)}&bizId=${encodeURIComponent(ref.id)}&pageNo=1&pageSize=5`,
        token,
        tenant,
      )
      state.businessLog.set(key, section('ok', page?.list ?? []))
    } catch (e) {
      state.businessLog.set(key, section('unavailable', [], e.message))
    }
  }
}

// ── 判据 ──────────────────────────────────────────────────────────────────────

const PASS = 'PASS'
const FAIL = 'FAIL'
const UNREADABLE = '无法取数'
const SKIP = 'SKIP'

const criterion = (id, label, verdict, detail) => ({ id, label, verdict, detail })

function rowRef(row, ctx) {
  const effect = effectForRow(row, ctx.effects)
  const proposal = effect ? null : matchProposal(row, ctx.proposals)
  const recorded = recordedObjectOf(row, effect, proposal)
  return objectRefOf(row, {
    effects: ctx.effects,
    proposals: ctx.proposals,
    resultTypeOf: toolResultType,
  }) ?? (recorded ? { resultType: recorded.resultType, resultId: recorded.resultId } : null)
}

function hashNodeOf(state, id) {
  if (state.verify.status !== 'ok') return null
  return (state.verify.value?.chain ?? []).find((node) => String(node.id) === String(id)) ?? null
}

function chainLinkage(state) {
  if (state.verify.status !== 'ok') return { ok: false, reason: '没有 /audit/verify 的答复' }
  const chain = state.verify.value?.chain ?? []
  if (!chain.length) return { ok: false, reason: '/audit/verify 的链是空的' }
  for (let i = 1; i < chain.length; i += 1) {
    const prev = chain[i - 1]
    const node = chain[i]
    if ((node.prevHash ?? null) !== (prev.hash ?? null)) {
      return { ok: false, reason: `#${node.id} 的 prevHash 对不上前一行 #${prev.id} 的 hash` }
    }
  }
  const head = chain[0]
  if ((head.prevHash ?? null) !== null) {
    return { ok: false, reason: `链首 #${head.id} 的 prevHash 不是空` }
  }
  return { ok: true, reason: `${chain.length} 个节点首尾相接` }
}

function readCsvFile(file) {
  const buf = readFileSync(file)
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf
  const text = buf.toString('utf8')
  const body = bom ? text.slice(1) : text
  const crlf = body.includes('\r\n')
  const loneLf = /(^|[^\r])\n/.test(body)
  return { bom, crlf, loneLf, text, body }
}

/** RFC 4180 的一行拆分够用：引号里的逗号与换行不切。 */
function csvRows(body) {
  const rows = []
  let cell = ''
  let row = []
  let quoted = false
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') { cell += '"'; i += 1 }
      else if (ch === '"') quoted = false
      else cell += ch
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === ',') { row.push(cell); cell = ''; continue }
    if (ch === '\r' && body[i + 1] === '\n') {
      row.push(cell); rows.push(row); row = []; cell = ''; i += 1; continue
    }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue }
    cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.length > 1 || r[0] !== '')
}

function multiSet(list) {
  const map = new Map()
  for (const item of list) map.set(item, (map.get(item) ?? 0) + 1)
  return map
}

function compareMultisets(want, got) {
  const a = multiSet(want)
  const b = multiSet(got)
  const missing = []
  const extra = []
  for (const [key, n] of a) {
    const m = b.get(key) ?? 0
    for (let i = 0; i < n - m; i += 1) missing.push(key)
  }
  for (const [key, n] of b) {
    const m = a.get(key) ?? 0
    for (let i = 0; i < n - m; i += 1) extra.push(key)
  }
  return { missing, extra }
}

// ── 评价与报告 ────────────────────────────────────────────────────────────────

function evaluate(state, ctx, opts) {
  const criteria = []
  const warnings = []
  const rows = ctx.operationRows

  // R1 · three rows
  if (state.rows.status !== 'ok') {
    criteria.push(criterion('R1', '三行齐全（executed / attempted / approved）', UNREADABLE, state.rows.reason))
  } else {
    const executed = rows.find((r) => r.action === 'tool_call' && r.outcome === 'executed')
    const attempted = rows.find((r) => r.outcome === 'attempted')
    const approved = rows.find((r) => r.action === 'tool_confirmation' && r.outcome === 'approved')
    const missing = [
      executed ? '' : '已执行行',
      attempted ? '' : '试过行',
      approved ? '' : '已批准行',
    ].filter(Boolean)
    criteria.push(
      missing.length
        ? criterion('R1', '三行齐全（executed / attempted / approved）', FAIL, `缺：${missing.join('、')}`)
        : criterion(
            'R1',
            '三行齐全（executed / attempted / approved）',
            PASS,
            `执行 #${executed.id} · 试过 #${attempted.id} · 批准 #${approved.id}`,
          ),
    )
  }

  // R1b · approver named and a second person
  const executedRow = rows.find((r) => r.action === 'tool_call' && r.outcome === 'executed')
  const approvedRow = rows.find((r) => r.action === 'tool_confirmation' && r.outcome === 'approved')
  if (!approvedRow) {
    criteria.push(criterion('R1b', '批准人具名且为第二人', UNREADABLE, '没有已批准行，无从判断批准人'))
  } else if (!executedRow) {
    criteria.push(criterion('R1b', '批准人具名且为第二人', FAIL, '没有执行行，无从判断批准人是否为第二人'))
  } else if (state.callerNames.status !== 'ok') {
    criteria.push(criterion('R1b', '批准人具名且为第二人', UNREADABLE, `调用方名录取不到：${state.callerNames.reason}`))
  } else {
    const approverId = String(approvedRow.userId ?? '')
    const name = approverId ? state.callerNames.value[approverId] ?? '' : ''
    const initiatorId = String(executedRow?.userId ?? '')
    const named = Boolean(name) && name !== approverId
    const second = Boolean(approverId) && Boolean(initiatorId) && approverId !== initiatorId
    if (!named) {
      criteria.push(criterion('R1b', '批准人具名且为第二人', FAIL, `批准人只有账号 #${approverId || '(空)'}，名录答不出名字`))
    } else if (!second) {
      criteria.push(criterion('R1b', '批准人具名且为第二人', FAIL, `批准人与发起人是同一人：${name}（账号 #${approverId}）`))
    } else {
      criteria.push(
        criterion(
          'R1b',
          '批准人具名且为第二人',
          PASS,
          `${name}（账号 #${approverId}）≠ ${state.callerNames.value[initiatorId] || '发起人'}（账号 #${initiatorId}）`,
        ),
      )
    }
  }

  // R2 · six cells, per row
  const cellsByRow = new Map()
  if (state.rows.status !== 'ok' || state.effects.status !== 'ok') {
    criteria.push(
      criterion('R2', '六问逐格有答且无内部名', UNREADABLE, `行或台账取不到：${state.rows.reason || state.effects.reason}`),
    )
  } else if (state.confirmations.status !== 'ok' && rows.some((r) => !effectForRow(r, state.effects.value))) {
    criteria.push(criterion('R2', '六问逐格有答且无内部名', UNREADABLE, `确认记录取不到，且有行没有台账：${state.confirmations.reason}`))
  } else {
    const bad = []
    for (const row of rows) {
      const { answers } = sixOf(row, ctx)
      const scored = scoreSix(answers)
      if (scored.leaked.length) bad.push(`#${row.id} 透出内部名「${scored.leaked.join('、')}」`)
      else if (scored.cells < 6) {
        const open = answers.filter((a) => !a.answered || !a.text || a.text === BLANK).map((a) => t(`keelbase.sixQ.${a.key}`))
        bad.push(`#${row.id} 未答：${open.join('、')}`)
      }
      cellsByRow.set(String(row.id), answers)
    }
    criteria.push(
      bad.length
        ? criterion('R2', '六问逐格有答且无内部名', FAIL, bad.join('；'))
        : criterion('R2', '六问逐格有答且无内部名', PASS, `${rows.length} 行 × 6 格`),
    )
  }

  // R3 · /audit/verify
  if (state.verify.status !== 'ok') {
    criteria.push(criterion('R3', '/audit/verify valid=true', UNREADABLE, state.verify.reason))
  } else {
    const verify = state.verify.value ?? {}
    const linkage = chainLinkage(state)
    const missingHash = rows.filter((row) => !hashNodeOf(state, row.id))
    if (!Array.isArray(verify.chain) || !verify.chain.length) {
      // 一条 `valid=true` 而**没有链节点**的答复，给不出行哈希 —— 那是取不到，不是断链。
      // A `valid=true` answer with **no chain nodes** cannot give a row hash: cannot read, not broken.
      criteria.push(criterion('R3', '/audit/verify valid=true', UNREADABLE, '/audit/verify 没有返回链节点，行哈希取不到'))
    } else if (verify.valid !== true) {
      criteria.push(criterion('R3', '/audit/verify valid=true', FAIL, `valid=${String(verify.valid)} brokenIndex=${String(verify.brokenIndex)}`))
    } else if (!linkage.ok) {
      criteria.push(criterion('R3', '/audit/verify valid=true', FAIL, linkage.reason))
    } else if (missingHash.length) {
      criteria.push(
        criterion('R3', '/audit/verify valid=true', FAIL, `这些行不在 verify 走到的链上：${missingHash.map((r) => `#${r.id}`).join('、')}`),
      )
    } else {
      criteria.push(
        criterion('R3', '/audit/verify valid=true', PASS, `valid=true checked=${verify.checked} · ${rows.length} 行有哈希 · ${linkage.reason}`),
      )
    }
  }

  // R4 · second entry
  const executedRef = executedRow ? rowRef(executedRow, ctx) : null
  if (!executedRow || !executedRef) {
    criteria.push(criterion('R4', '第二入口对得上（对象 / 时间 / 谁）', UNREADABLE, '没有执行行或它定位不到业务对象'))
  } else {
    const key = `${executedRef.resultType}#${executedRef.resultId}`
    const log = state.businessLog.get(key)
    const mapped = opts['operate-log-type'] || BUSINESS_LOG_TYPE[executedRef.resultType]
    if (!mapped) {
      criteria.push(
        criterion(
          'R4',
          '第二入口对得上（对象 / 时间 / 谁）',
          UNREADABLE,
          `结果类型 ${executedRef.resultType || '(空)'} 没有宿主操作日志映射；本仓今天只有 ${Object.keys(BUSINESS_LOG_TYPE).join('、')}`,
        ),
      )
    } else if (!log) {
      criteria.push(criterion('R4', '第二入口对得上（对象 / 时间 / 谁）', UNREADABLE, '快照里没有这个对象的宿主操作日志'))
    } else if (log.status !== 'ok') {
      criteria.push(criterion('R4', '第二入口对得上（对象 / 时间 / 谁）', UNREADABLE, log.reason))
    } else if (!log.value.length) {
      criteria.push(criterion('R4', '第二入口对得上（对象 / 时间 / 谁）', FAIL, '宿主操作日志没有这一条（该模块可能没挂 @LogRecord）'))
    } else {
      const wrongObject = log.value.find((r) => String(r.bizId) !== String(executedRef.resultId))
      const timeMatch = log.value.find((r) => zonedTime(r.createTime) === zonedTime(executedRow.createdAt))
      const whoOk =
        timeMatch &&
        timeMatch.userId !== null &&
        timeMatch.userId !== undefined &&
        String(timeMatch.userId) === String(executedRow.userId)
      if (wrongObject) {
        criteria.push(
          criterion('R4', '第二入口对得上（对象 / 时间 / 谁）', FAIL, `读面回了别的对象：#${wrongObject.bizId}（要的是 #${executedRef.resultId}）`),
        )
      } else if (!timeMatch) {
        criteria.push(
          criterion('R4', '第二入口对得上（对象 / 时间 / 谁）', FAIL, `时间对不上：宿主 ${log.value.map((r) => zonedTime(r.createTime)).join(' / ')}，审计 ${zonedTime(executedRow.createdAt)}`),
        )
      } else if (!whoOk) {
        criteria.push(
          criterion(
            'R4',
            '第二入口对得上（对象 / 时间 / 谁）',
            FAIL,
            timeMatch.userId === null || timeMatch.userId === undefined
              ? '宿主那一行没有记操作人'
              : `谁对不上：宿主 #${timeMatch.userId}，审计 #${executedRow.userId}`,
          ),
        )
      } else {
        criteria.push(
          criterion(
            'R4',
            '第二入口对得上（对象 / 时间 / 谁）',
            PASS,
            `对象 ${executedRef.resultType}#${executedRef.resultId} · 时间 ${zonedTime(timeMatch.createTime)} · 谁 #${timeMatch.userId}`,
          ),
        )
      }
    }
  }

  // R5 · six-column CSV
  if (!opts.csv) {
    criteria.push(criterion('R5', '六列 CSV 与屏幕同源', SKIP, '未给 --csv'))
  } else if (!cellsByRow.size) {
    criteria.push(criterion('R5', '六列 CSV 与屏幕同源', UNREADABLE, '六问没有组合出来'))
  } else {
    try {
      const file = readCsvFile(opts.csv)
      const labels = CSV_QUESTION_KEYS.map((key) => t(`keelbase.sixQ.${key}`))
      const parsed = csvRows(file.body)
      const header = parsed[0] ?? []
      const data = parsed.slice(1)
      const composed = rows.map((row) => cellsByRow.get(String(row.id)).map((a) => a.text).join('\u0001'))
      const exported = data.map((cells) => cells.join('\u0001'))
      const diff = compareMultisets(composed, exported)
      const problems = []
      if (!file.bom) problems.push('缺 BOM')
      if (!file.crlf || file.loneLf) problems.push('行尾不是纯 CRLF')
      if (header.join(',') !== labels.join(',')) problems.push(`表头是 [${header.join(', ')}]，要的是 [${labels.join(', ')}]`)
      if (data.length !== rows.length) problems.push(`行数 ${data.length}，选区 ${rows.length}`)
      if (diff.missing.length) problems.push(`文件里少 ${diff.missing.length} 行`)
      if (diff.extra.length) problems.push(`文件里多 ${diff.extra.length} 行`)
      for (const cells of data) {
        for (const cell of cells) {
          const leaked = leaksIn(cell)
          if (leaked.length) problems.push(`有一格带着内部名「${leaked.join('、')}」`)
        }
      }
      criteria.push(
        problems.length
          ? criterion('R5', '六列 CSV 与屏幕同源', FAIL, problems.join('；'))
          : criterion('R5', '六列 CSV 与屏幕同源', PASS, `BOM · CRLF · 6 列 · ${data.length} 行与选区逐格相同`),
      )
    } catch (e) {
      criteria.push(criterion('R5', '六列 CSV 与屏幕同源', UNREADABLE, `读不了 ${opts.csv}：${e.message}`))
    }
  }

  // R6 · check CSV
  if (!opts['check-csv']) {
    criteria.push(criterion('R6', '八列核对 CSV', SKIP, '未给 --check-csv'))
  } else if (!cellsByRow.size) {
    criteria.push(criterion('R6', '八列核对 CSV', UNREADABLE, '六问没有组合出来'))
  } else {
    try {
      const file = readCsvFile(opts['check-csv'])
      const labels = CHECK_COLUMN_KEYS.map((key) =>
        key === 'id' ? t('keelbase.audit.colId') : key === 'checks' ? t('keelbase.audit.colChecks') : t(`keelbase.sixQ.${key}`),
      )
      const parsed = csvRows(file.body)
      const note = parsed[0]?.[0]?.startsWith('# ') ? parsed[0][0] : ''
      const body = note ? parsed.slice(1) : parsed
      const header = body[0] ?? []
      const data = body.slice(1)
      const problems = []
      if (!file.bom) problems.push('缺 BOM')
      if (!file.crlf || file.loneLf) problems.push('行尾不是纯 CRLF')
      if (header.join(',') !== labels.join(',')) problems.push(`表头是 [${header.join(', ')}]，要的是 [${labels.join(', ')}]`)
      if (data.length !== rows.length) problems.push(`行数 ${data.length}，选区 ${rows.length}`)
      const composed = rows.map((row) =>
        [`#${row.id}`, ...cellsByRow.get(String(row.id)).map((a) => a.text), checksTextOf(row)].join('\u0001'),
      )
      const exported = data.map((cells) => cells.join('\u0001'))
      const diff = compareMultisets(composed, exported)
      if (diff.missing.length) problems.push(`文件里少 ${diff.missing.length} 行`)
      if (diff.extra.length) problems.push(`文件里多 ${diff.extra.length} 行`)
      for (const cells of data) {
        for (const cell of cells) {
          const leaked = leaksIn(cell)
          if (leaked.length) problems.push(`有一格带着内部名「${leaked.join('、')}」`)
        }
      }
      criteria.push(
        problems.length
          ? criterion('R6', '八列核对 CSV', FAIL, problems.join('；'))
          : criterion('R6', '八列核对 CSV', PASS, `BOM · CRLF · 8 列 · ${data.length} 行与选区逐格相同${note ? ' · 带相关说明行' : ''}`),
      )
    } catch (e) {
      criteria.push(criterion('R6', '八列核对 CSV', UNREADABLE, `读不了 ${opts['check-csv']}：${e.message}`))
    }
  }

  // R7 · internal-name refusal, run against a poisoned copy of the composed row
  {
    const sample = rows.length ? cellsByRow.get(String(rows[0].id)) : null
    if (!sample) {
      criteria.push(criterion('R7', '内部名拒绝（负向）', UNREADABLE, '六问没有组合出来，无从注入'))
    } else {
      const poisoned = sample.map((a) => ({ ...a, text: a.key === 'object' ? 'crm_customer#1' : a.text }))
      const labels = CSV_QUESTION_KEYS.map((key) => t(`keelbase.sixQ.${key}`))
      let sixRefused = false
      let checkRefused = false
      let echo = false
      try {
        csvText([{ answers: poisoned }], labels)
      } catch (e) {
        sixRefused = e instanceof CsvLeak
        echo = String(e.message).includes('crm_customer')
      }
      try {
        checkCsvText([{ id: rows[0].id, answers: poisoned, checks: '通过' }], CHECK_COLUMN_KEYS.map((key) => (key === 'id' ? '编号' : key === 'checks' ? '判定依据' : t(`keelbase.sixQ.${key}`))))
      } catch (e) {
        checkRefused = e instanceof CsvLeak
      }
      criteria.push(
        sixRefused && checkRefused && !echo
          ? criterion('R7', '内部名拒绝（负向）', PASS, '两份 CSV 都抛 CsvLeak，错误里不回显那串名字')
          : criterion('R7', '内部名拒绝（负向）', FAIL, `六列拒绝=${sixRefused} 八列拒绝=${checkRefused} 回显名字=${echo}`),
      )
    }
  }

  // R8 · hashes of evidence files
  if (!opts.sha256.length) {
    criteria.push(criterion('R8', '证据文件哈希', SKIP, '未给 --sha256'))
  } else {
    const hashes = hashPaths(opts.sha256)
    criteria.push(
      hashes.items.length
        ? criterion('R8', '证据文件哈希', PASS, `${hashes.items.length} 个文件`)
        : criterion('R8', '证据文件哈希', UNREADABLE, hashes.problems.join('；') || '没有可读的文件'),
    )
  }

  // Pairing warnings: the page rule and the strict rule disagreeing is the "two answers" smell.
  for (const row of rows) {
    const pagePair = effectForRow(row, state.effects.value)
    const strictPair = matchEffect(row, state.effects.value)
    if (state.effects.status === 'ok' && pagePair && strictPair && pagePair.id !== strictPair.id) {
      warnings.push(`#${row.id}：页面按工具 + 五秒配对 #${pagePair.id}，严格按 executionId 配对 #${strictPair.id}`)
    }
    if (state.effects.status === 'ok' && pagePair && !strictPair && row.executionId) {
      warnings.push(`#${row.id}：台账行 #${pagePair.id} 不带同一 executionId，六问按页面规则（工具 + 五秒）配对`)
    }
  }

  const unreadable = criteria.filter((c) => c.verdict === UNREADABLE)
  const failed = criteria.filter((c) => c.verdict === FAIL)
  const exitCode = unreadable.length ? 2 : failed.length ? 1 : 0
  return { criteria, warnings, exitCode, cellsByRow }
}

// ── 哈希 ──────────────────────────────────────────────────────────────────────

function walkFiles(path, base = path) {
  const out = []
  const stat = statSync(path)
  if (stat.isDirectory()) {
    for (const name of readdirSync(path).sort()) out.push(...walkFiles(join(path, name), base))
  } else if (stat.isFile()) {
    out.push({ path, rel: relative(base, path) || basename(path) })
  }
  return out
}

function hashPaths(paths) {
  const items = []
  const problems = []
  for (const given of paths) {
    const path = resolve(given)
    if (!existsSync(path)) { problems.push(`不存在：${given}`); continue }
    for (const file of walkFiles(path, path)) {
      const buf = readFileSync(file.path)
      items.push({
        path: file.path,
        rel: resolve(given) === file.path ? basename(file.path) : file.rel.replaceAll(sep, '/'),
        sha256: createHash('sha256').update(buf).digest('hex'),
        bytes: buf.length,
      })
    }
  }
  return { items, problems }
}

function writeCsv(path, text) {
  const body = Buffer.from(text, 'utf8')
  writeFileSync(path, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body]))
}

// ── 选区 ──────────────────────────────────────────────────────────────────────

function selectionOf(opts, rows) {
  if (opts.execution) {
    const wanted = String(opts.execution)
    const direct = rows.filter((row) => String(row.executionId ?? '') === wanted)
    const operation = [...direct]
    const paired = []
    if (!direct.some((row) => row.action === 'tool_confirmation' && row.outcome === 'approved')) {
      for (const row of direct) {
        const approver = approverOf(row, rows)
        if (approver && !operation.includes(approver)) {
          operation.push(approver)
          paired.push(approver.id)
        }
      }
    }
    return {
      kind: 'execution',
      value: wanted,
      rows: operation,
      direct,
      paired,
      note: paired.length
        ? `批准行不带同一 executionId 或未在直选中：按工具 + 五秒配上 #${paired.join('、#')}`
        : '',
    }
  }
  const [type, ...rest] = String(opts.object).split(':')
  const id = rest.join(':')
  if (!type || !id) throw new UsageError('--object 要写成 type:id，例如 crm_customer:1')
  // 对象的三条来路里，台账优先；此刻台账还没读到，故先给一个空选区，读完台账后再 `reselectByObject`。
  // The ledger is the object's first road and is not loaded yet, so start empty and reselect once it is.
  return { kind: 'object', value: `${type}:${id}`, rows: [], direct: [], paired: [], note: '' }
}

function reselectByObject(opts, state) {
  const [type, ...rest] = String(opts.object).split(':')
  const id = rest.join(':')
  const picked = selectRows(state.rows.value, {
    object: { resultType: type, resultId: id },
    effects: state.effects.value,
    proposals: state.confirmations.value,
    resultTypeOf: toolResultType,
  })
  return picked.map((entry) => entry.row)
}

// ── 报告 ──────────────────────────────────────────────────────────────────────

function stampLocal(at = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
}

function formatReport({ source, selection, state, criteria, warnings, exitCode, cellsByRow, csvPaths, hashReport }) {
  const lines = []
  lines.push(`== N5 验收取数 · ${source} · ${new Date().toISOString()} ==`)
  lines.push(`选区：${selection.kind === 'execution' ? `execution=${selection.value}` : `object=${selection.value}`}`)
  if (selection.note) lines.push(`      ${selection.note}`)
  const counts = [
    `审计行 ${state.rows.status === 'ok' ? state.rows.value.length : '取不到'}`,
    `台账 ${state.effects.status === 'ok' ? state.effects.value.length : '取不到'}`,
    `确认记录 ${state.confirmations.status === 'ok' ? state.confirmations.value.length : '取不到'}`,
    `工具清单 ${state.inventory.status === 'ok' ? state.inventory.value.size : '取不到'}`,
  ]
  lines.push(`扫描：${counts.join(' · ')}`)
  const unavailable = Object.entries(state)
    .filter(([, v]) => v && v.status === 'unavailable')
    .map(([k, v]) => `${k}（${v.reason}）`)
  if (unavailable.length) lines.push(`取不到：${unavailable.join('；')}`)
  lines.push('')

  lines.push('-- 一次操作 ---------------------------------------------------------------')
  for (const row of selection.rows) {
    const hash = hashNodeOf(state, row.id)
    lines.push(
      `  #${row.id}  ${resultText(row)}  ${row.tool ?? row.action ?? '—'}  ${zonedTime(row.createdAt)}`
        + `${row.executionId ? `  executionId=${row.executionId}` : '  （无 executionId）'}`
        + `${hash ? `  hash=${String(hash.hash ?? '').slice(0, 16)}…` : '  （无哈希）'}`,
    )
  }
  lines.push('')

  for (const c of criteria) {
    lines.push(`${c.id.padEnd(4)} ${c.label.padEnd(34)} ${c.verdict.padEnd(6)} ${c.detail}`)
  }

  if (cellsByRow && cellsByRow.size) {
    lines.push('')
    lines.push('-- 六问逐格 ---------------------------------------------------------------')
    for (const row of selection.rows) {
      const cells = cellsByRow.get(String(row.id))
      if (!cells) continue
      lines.push(`  #${row.id}`)
      for (const cell of cells) {
        lines.push(`    ${t(`keelbase.sixQ.${cell.key}`).padEnd(14)} ${cell.answered ? '' : '[未答] '}${cell.text}`)
      }
    }
  }

  if (warnings.length) {
    lines.push('')
    lines.push('-- 告诫 -------------------------------------------------------------------')
    for (const warning of warnings) lines.push(`  · ${warning}`)
  }

  if (hashReport?.items.length) {
    lines.push('')
    lines.push('-- 证据文件哈希 -----------------------------------------------------------')
    for (const item of hashReport.items) lines.push(`  ${item.sha256}  ${String(item.bytes).padStart(9)}  ${item.rel}`)
  }
  if (csvPaths?.length) {
    lines.push('')
    lines.push('-- 写出的文件 -------------------------------------------------------------')
    for (const item of csvPaths) lines.push(`  ${item}`)
  }

  lines.push('')
  const verdict = exitCode === 0 ? '全部通过' : exitCode === 1 ? '取到数，但有判据不通过' : '有一段取不到 —— 这不是通过'
  lines.push(`EXIT ${exitCode}  — ${verdict}`)
  return lines.join('\n')
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function run(argv, io = {}) {
  const out = io.out ?? ((line) => process.stdout.write(`${line}\n`))
  let opts
  try {
    opts = parseArgs(argv)
  } catch (e) {
    out(`用法错误：${e.message}\n\n${HELP}`)
    return { exitCode: 64 }
  }
  if (opts.help) { out(HELP); return { exitCode: 0 } }
  if (opts.selfTest) return selfTest(out)

  if (!opts.execution && !opts.object) {
    if (opts.sha256.length) {
      const hashes = hashPaths(opts.sha256)
      for (const item of hashes.items) out(`${item.sha256}  ${String(item.bytes).padStart(9)}  ${item.rel}`)
      for (const problem of hashes.problems) out(`无法取数：${problem}`)
      return { exitCode: hashes.problems.length ? 2 : hashes.items.length ? 0 : 2 }
    }
    out(`用法错误：要给 --execution <id> 或 --object <type>:<id>\n\n${HELP}`)
    return { exitCode: 64 }
  }
  if (!opts.snapshot && !opts.host) {
    out('无法取数：既没有 --snapshot，也没有 --host —— 没有可读的来源，不判通过')
    return { exitCode: 2 }
  }
  if (opts.snapshot && opts.host) {
    out('用法错误：--snapshot 与 --host 只能给一个')
    return { exitCode: 64 }
  }

  let state
  if (opts.snapshot) {
    state = collectSnapshot(opts.snapshot)
    if (state.error) {
      out(`无法取数：${state.error}`)
      return { exitCode: 2 }
    }
  } else {
    state = await collectLive(opts)
  }

  // Selection. Object selection needs the ledger, so it is redone once the sections are in.
  let selection
  if (opts.execution) {
    if (state.rows.status !== 'ok') {
      const report = formatReport({
        source: state.source,
        selection: { kind: 'execution', value: opts.execution, rows: [], note: '' },
        state,
        criteria: [criterion('R1', '三行齐全（executed / attempted / approved）', UNREADABLE, `审计行取不到：${state.rows.reason}`)],
        warnings: [],
        exitCode: 2,
      })
      out(report)
      return { exitCode: 2 }
    }
    selection = selectionOf(opts, state.rows.value)
    if (!selection.rows.length) {
      const why = state.rows.status === 'ok'
        ? `扫描到的 ${state.rows.value.length} 行里没有 executionId=${opts.execution} 的行（该面最多往回 1000 行，请在操作后尽快取数）`
        : `审计行取不到：${state.rows.reason}`
      out(`无法取数：${why}`)
      return { exitCode: 2 }
    }
  } else {
    selection = selectionOf(opts, state.rows.status === 'ok' ? state.rows.value : [])
    if (state.rows.status !== 'ok') {
      out(`无法取数：审计行取不到：${state.rows.reason}`)
      return { exitCode: 2 }
    }
    selection.rows = reselectByObject(opts, state)
    if (!selection.rows.length) {
      out(`无法取数：扫描到的 ${state.rows.value.length} 行里没有定位到 ${opts.object} 的行`)
      return { exitCode: 2 }
    }
  }

  // Dependent reads: names for every caller and record this selection touches.
  const ids = new Set()
  const refs = new Map()
  for (const row of selection.rows) {
    if (row.userId !== null && row.userId !== undefined) ids.add(String(row.userId))
    const ref = rowRef(row, {
      effects: state.effects.value,
      proposals: state.confirmations.value,
    })
    if (ref) refs.set(`${ref.resultType}#${ref.resultId}`, { type: ref.resultType, id: ref.resultId })
  }
  for (const row of selection.rows) {
    if (row.action === 'tool_confirmation' && row.userId) ids.add(String(row.userId))
  }
  if (opts.host) {
    await enrichLive(
      opts,
      state,
      refs,
      ids,
      (type) => opts['operate-log-type'] || BUSINESS_LOG_TYPE[type] || null,
    )
  } else {
    // Snapshot mode: whatever the snapshot carries; absent sections stay unavailable.
    if (state.callerNames.status !== 'ok' && state.rows.status === 'ok') {
      state.callerNames = section('unavailable', {}, '快照里没有 callerNames')
    }
    if (state.recordNames.status !== 'ok') state.recordNames = section('unavailable', {}, '快照里没有 recordNames')
    for (const [key, ref] of refs) {
      if (!state.businessLog.has(key)) {
        const mapped = opts['operate-log-type'] || BUSINESS_LOG_TYPE[ref.type]
        state.businessLog.set(key, section('unavailable', [], mapped ? '快照里没有这个对象的宿主操作日志' : `结果类型 ${ref.type || '(空)'} 没有宿主操作日志映射`))
      }
    }
  }

  const ctx = {
    operationRows: selection.rows,
    rows: state.rows.value,
    effects: state.effects.value,
    proposals: state.confirmations.value,
    inventory: state.inventory.value,
    callerNames: state.callerNames.value,
    recordNames: state.recordNames.value,
  }

  const { criteria, warnings, exitCode, cellsByRow } = evaluate(state, ctx, opts)

  // Write the two CSVs and the JSON reading when asked.
  const csvPaths = []
  const stamp = stampLocal()
  let writeNote = ''
  if (opts.out && !cellsByRow.size) {
    // 六问没组合出来（通常是有行没有台账、判据已经是「无法取数」）。不写一份注定错的文件。
    // The six answers were not composed (usually a row with no ledger; the criterion is already
    // cannot-read). Do not write a file that is bound to be wrong.
    writeNote = '无法取数：六问没有组合出来，未写 CSV —— 看上面的判据行'
  } else if (opts.out) {
    mkdirSync(opts.out, { recursive: true })
    const six = join(opts.out, csvFilename())
    const check = join(opts.out, checkCsvFilename())
    writeCsv(
      six,
      csvText(selection.rows.map((row) => ({ answers: cellsByRow.get(String(row.id)) })), CSV_QUESTION_KEYS.map((key) => t(`keelbase.sixQ.${key}`))),
    )
    writeCsv(
      check,
      checkCsvText(
        selection.rows.map((row) => ({ id: row.id, answers: cellsByRow.get(String(row.id)), checks: checksTextOf(row) })),
        CHECK_COLUMN_KEYS.map((key) =>
          key === 'id' ? t('keelbase.audit.colId') : key === 'checks' ? t('keelbase.audit.colChecks') : t(`keelbase.sixQ.${key}`),
        ),
        t('keelbase.audit.exportNote'),
      ),
    )
    csvPaths.push(six, check)
  }

  const hashReport = opts.sha256.length ? hashPaths(opts.sha256) : null
  const json = {
    tool: 'n5-acceptance-reading',
    at: new Date().toISOString(),
    source: state.source,
    capturedAt: state.capturedAt ?? '',
    selection: {
      kind: selection.kind,
      value: selection.value,
      note: selection.note,
      rowIds: selection.rows.map((row) => row.id),
    },
    sections: Object.fromEntries(
      Object.entries(state)
        .filter(([, value]) => value && typeof value === 'object' && 'status' in value)
        .map(([key, value]) => [key, { status: value.status, reason: value.reason ?? '', count: Array.isArray(value.value) ? value.value.length : undefined }]),
    ),
    criteria,
    warnings,
    rows: selection.rows.map((row) => ({
      id: row.id,
      action: row.action,
      outcome: row.outcome,
      tool: row.tool,
      userId: row.userId,
      executionId: row.executionId ?? null,
      createdAt: row.createdAt,
      hash: hashNodeOf(state, row.id)?.hash ?? null,
      prevHash: hashNodeOf(state, row.id)?.prevHash ?? null,
      six: (cellsByRow.get(String(row.id)) ?? []).map((a) => ({ key: a.key, answered: a.answered, text: a.text })),
      checks: checksTextOf(row),
    })),
    exitCode,
  }
  if (opts.json) {
    mkdirSync(dirname(resolve(opts.json)), { recursive: true })
    writeFileSync(opts.json, `${JSON.stringify(json, null, 2)}\n`)
    csvPaths.push(opts.json)
  }

  const report = formatReport({ source: state.source, selection, state, criteria, warnings, exitCode, cellsByRow, csvPaths, hashReport })
  out(report)
  if (writeNote) out(writeNote)
  if (opts.out) {
    mkdirSync(opts.out, { recursive: true })
    writeFileSync(join(opts.out, `n5-reading-${stamp}.json`), `${JSON.stringify(json, null, 2)}\n`)
  }
  return { exitCode, json, csvPaths }
}

// ── 自检 ──────────────────────────────────────────────────────────────────────
//
// 内置一份与 2026-11-21 真栈那一场同形的夹具（对象 `客户 · #1`，三行一笔写），把脚本能判的判据全部
// 驱动一遍：三行、六问、哈希链、第二入口、CSV 往返、内部名拒绝、以及「取不到 ≠ 通过」。其中
// `approver` 的两个变体专门证明自批会被判红、第二人会被判绿。
//
// A fixture shaped like the real-stack run of 2026-11-21, driving every criterion the script judges:
// three rows, six answers, the hash chain, the second entry, the CSV round-trip, the internal-name
// refusal, and "cannot read is not a pass". Two approver variants prove self-approval turns red and a
// second person turns green.

function fixture({ approverId = '1', creds = { 1: 'KeelBase' }, approvalExecutionId = 'e-n5' } = {}) {
  // 宿主那一侧的 `createTime` 是本机钟面、不带偏移；夹具按**本机时区**把它写成与审计时刻同一秒，
  // 于是这个自检在 UTC 的 CI 与 +08:00 的开发机上读起来一样。屏幕与文件也正是这么对上的。
  //
  // The host's `createTime` is a local wall clock with no offset; the fixture writes the same local
  // second as the audit row, so this self-test reads the same on a UTC CI box and a +08:00 laptop.
  const wall = (iso) => {
    const d = new Date(iso)
    const pad = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  const rows = [
    {
      id: 31, userId: '1', action: 'tool_call', detail: 'update_crm_customer -> ok', isError: false,
      createdAt: '2026-11-21T02:24:50.123Z', outcome: 'executed', tool: 'update_crm_customer', executionId: 'e-n5',
      authorization: '{"tool":"update_crm_customer","riskLevel":"R3","riskStrategy":"human_approval","requiresConfirmation":true,"checks":[{"name":"risk_policy","ok":true},{"name":"tool_enabled","ok":true},{"name":"role_allowed","ok":true},{"name":"admin_only","ok":true}]}',
    },
    {
      id: 30, userId: '1', action: 'tool_call', detail: 'update_crm_customer -> ok', isError: false,
      createdAt: '2026-11-21T02:24:50.100Z', outcome: 'attempted', tool: 'update_crm_customer', executionId: 'e-n5',
      authorization: '{"tool":"update_crm_customer","riskLevel":"R3","riskStrategy":"human_approval","requiresConfirmation":true,"checks":[]}',
    },
    {
      id: 29, userId: approverId, action: 'tool_confirmation', detail: 'update_crm_customer approved (out_of_band)',
      isError: false, createdAt: '2026-11-21T02:24:49.000Z', outcome: 'approved', tool: 'update_crm_customer',
      executionId: approvalExecutionId, authorization: null,
    },
    {
      id: 28, userId: '1', action: 'tool_call', detail: 'update_crm_customer pending', isError: false,
      createdAt: '2026-11-21T02:24:33.000Z', outcome: 'pending', tool: 'update_crm_customer', executionId: null,
      authorization: null,
    },
  ]
  return {
    capturedAt: '2026-11-21T02:25:00Z',
    verify: {
      valid: true, checked: 4, brokenIndex: null,
      chain: [
        { id: 28, createdAt: '2026-11-21T02:24:33.000Z', action: 'tool_call', hash: 'h28', prevHash: null, broken: false },
        { id: 29, createdAt: '2026-11-21T02:24:49.000Z', action: 'tool_confirmation', hash: 'h29', prevHash: 'h28', broken: false },
        { id: 30, createdAt: '2026-11-21T02:24:50.100Z', action: 'tool_call', hash: 'h30', prevHash: 'h29', broken: false },
        { id: 31, createdAt: '2026-11-21T02:24:50.123Z', action: 'tool_call', hash: 'h31', prevHash: 'h30', broken: false },
      ],
    },
    rows,
    effects: [
      {
        id: 4, toolName: 'update_crm_customer', userId: '1', resultType: 'crm_customer', resultId: 1,
        createdAt: '2026-11-21T02:24:50.120Z', targetExists: true, targetSoftDeleted: false,
        targetTitle: 'n6check-1', status: 'executed', revocable: true, executionId: 'e-n5',
        beforeSnapshot: '{"id":1,"name":"n6check-1","level":null,"source":null,"dealStatus":false,"followUpStatus":false}',
        afterSnapshot: '{"id":1}',
      },
    ],
    confirmations: [],
    inventory: [{ name: 'update_crm_customer', riskLevel: 'R3', requiresConfirmation: true }],
    callerNames: creds,
    recordNames: { 'crm_customer#1': '修****' },
    businessLog: {
      'crm_customer#1': [
        { id: 9, type: 'CRM 客户', subType: '更新客户', bizId: 1, action: '更新了客户', userId: 1, userName: 'KeelBase', createTime: wall('2026-11-21T02:24:50.123Z') },
      ],
    },
  }
}

async function selfTest(out) {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const dir = mkdtempSync(join(tmpdir(), 'n5-reading-'))
  const results = []
  const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail })
    out(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  }
  try {
    const runFixture = async (name, payload, argv) => {
      const file = join(dir, `${name}.json`)
      writeFileSync(file, JSON.stringify(payload))
      const lines = []
      const result = await run([...argv, '--snapshot', file], { out: (line) => lines.push(line) })
      return { result, text: lines.join('\n'), file }
    }

    // 1 · a second person: everything green
    {
      const { result, text } = await runFixture('second', fixture({ approverId: '2', creds: { 1: 'KeelBase', 2: '张三' } }), ['--execution', 'e-n5'])
      check('第二人批准：exit 0', result.exitCode === 0, `exit=${result.exitCode}`)
      for (const id of ['R1', 'R1b', 'R2', 'R3', 'R4', 'R7']) {
        const line = text.split('\n').find((l) => l.startsWith(id.padEnd(4)))
        check(`第二人批准：${id} PASS`, Boolean(line && line.includes('PASS')), line ?? '没有这一行')
      }
      check('第二人批准：六问里出现「张三（账号 #2）」', text.includes('张三（账号 #2）'))
      check('第二人批准：对象是「客户 · #1 · 修**** · 还在」', text.includes('客户 · #1 · 修**** · 还在'))
      check('第二人批准：第五格是第二人批准', text.includes('张三 批准了这次写（第二人，不是操作者本人）'))
      check('第二人批准：哈希来自 verify 链', text.includes('hash=h31'))
    }

    // 1b · an older runtime: the approval row carries no executionId, so it is paired by tool + five
    // seconds — and the report says so, rather than pretending the selection was exact.
    {
      const { result, text } = await runFixture(
        'older',
        fixture({ approverId: '2', creds: { 1: 'KeelBase', 2: '张三' }, approvalExecutionId: null }),
        ['--execution', 'e-n5'],
      )
      check('批准行无 executionId：仍 exit 0', result.exitCode === 0, `exit=${result.exitCode}`)
      check('批准行无 executionId：报告写明按工具 + 五秒配', text.includes('按工具 + 五秒配上 #29'))
    }

    // 2 · the same person approving: R1b red, exit 1
    {
      const { result, text } = await runFixture('self', fixture({ approverId: '1', creds: { 1: 'KeelBase' } }), ['--execution', 'e-n5'])
      check('自批：exit 1', result.exitCode === 1, `exit=${result.exitCode}`)
      const line = text.split('\n').find((l) => l.startsWith('R1b'))
      check('自批：R1b FAIL 且点名同一人', Boolean(line && line.includes('FAIL') && line.includes('同一人')), line ?? '没有这一行')
    }

    // 3 · a broken chain: R3 red
    {
      const payload = fixture({ approverId: '2', creds: { 1: 'KeelBase', 2: '张三' } })
      payload.verify.chain[2].prevHash = 'h-wrong'
      const { result, text } = await runFixture('broken', payload, ['--execution', 'e-n5'])
      check('断链：exit 1', result.exitCode === 1, `exit=${result.exitCode}`)
      const line = text.split('\n').find((l) => l.startsWith('R3'))
      check('断链：R3 FAIL', Boolean(line && line.includes('FAIL')), line ?? '没有这一行')
    }

    // 3b · a `valid=true` answer that carries no chain nodes: the row hash cannot be taken, so it is
    // cannot-read (exit 2), not a pass and not a broken chain.
    {
      const payload = fixture({ approverId: '2', creds: { 1: 'KeelBase', 2: '张三' } })
      payload.verify = { valid: true, checked: 4, brokenIndex: null }
      const { result, text } = await runFixture('nochain', payload, ['--execution', 'e-n5'])
      check('valid 但无链节点：exit 2', result.exitCode === 2, `exit=${result.exitCode}`)
      check('valid 但无链节点：R3 说无法取数', /^R3\s.*无法取数/m.test(text))
    }

    // 4 · missing verify: cannot read, exit 2
    {
      const payload = fixture({ approverId: '2', creds: { 1: 'KeelBase', 2: '张三' } })
      delete payload.verify
      const { result, text } = await runFixture('noverify', payload, ['--execution', 'e-n5'])
      check('缺 verify：exit 2', result.exitCode === 2, `exit=${result.exitCode}`)
      check('缺 verify：R3 说无法取数', /^R3\s.*无法取数/m.test(text))
    }

    // 5 · missing ledger: cannot read, exit 2
    {
      const payload = fixture({ approverId: '2', creds: { 1: 'KeelBase', 2: '张三' } })
      delete payload.effects
      const { result } = await runFixture('noeffects', payload, ['--execution', 'e-n5'])
      check('缺台账：exit 2', result.exitCode === 2, `exit=${result.exitCode}`)
    }

    // 6 · no source at all: cannot read, exit 2
    {
      const lines = []
      const result = await run(['--execution', 'e-n5'], { out: (line) => lines.push(line) })
      check('无来源：exit 2 且说无法取数', result.exitCode === 2 && lines.join('\n').includes('无法取数'))
    }

    // 7 · object selection: the three rows of the operation
    {
      const { result, text } = await runFixture('object', fixture({ approverId: '2', creds: { 1: 'KeelBase', 2: '张三' } }), ['--object', 'crm_customer:1'])
      check('按对象选：exit 0', result.exitCode === 0, `exit=${result.exitCode}`)
      check('按对象选：三行都在', ['#31', '#30', '#29'].every((id) => text.includes(id)))
    }

    // 8 · an unknown execution: cannot read, exit 2
    {
      const { result, text } = await runFixture('unknown', fixture(), ['--execution', 'nope'])
      check('未知 execution：exit 2', result.exitCode === 2, `exit=${result.exitCode}`)
      check('未知 execution：说无法取数', text.includes('无法取数'))
    }

    // 9 · CSV round-trip: write the two files, then feed them back
    {
      const payload = fixture({ approverId: '2', creds: { 1: 'KeelBase', 2: '张三' } })
      const file = join(dir, 'roundtrip.json')
      writeFileSync(file, JSON.stringify(payload))
      const outDir = join(dir, 'out')
      const first = await run(['--execution', 'e-n5', '--snapshot', file, '--out', outDir], { out: () => {} })
      check('导出：exit 0', first.exitCode === 0, `exit=${first.exitCode}`)
      const sixPath = first.csvPaths?.[0]
      const checkPath = first.csvPaths?.[1]
      const sixBytes = readFileSync(sixPath)
      check('导出：六列文件带 BOM', sixBytes[0] === 0xef && sixBytes[1] === 0xbb && sixBytes[2] === 0xbf)
      const checkBytes = readFileSync(checkPath)
      check('导出：核对文件带 BOM', checkBytes[0] === 0xef && checkBytes[1] === 0xbb && checkBytes[2] === 0xbf)
      const second = await run(
        ['--execution', 'e-n5', '--snapshot', file, '--csv', sixPath, '--check-csv', checkPath],
        { out: () => {} },
      )
      check('回灌：exit 0', second.exitCode === 0, `exit=${second.exitCode}`)
    }

    // 10 · the internal-name negative, proved independently of the run above
    {
      const labels = CSV_QUESTION_KEYS.map((key) => t(`keelbase.sixQ.${key}`))
      const answers = CSV_QUESTION_KEYS.map((key) => ({ key, text: key === 'object' ? 'update_crm_customer' : 'ok' }))
      let refused = false
      let echoed = false
      try {
        csvText([{ answers }], labels)
      } catch (e) {
        refused = e instanceof CsvLeak
        echoed = String(e.message).includes('update_crm_customer')
      }
      check('内部名：整份拒绝且不回显名字', refused && !echoed, `refused=${refused} echoed=${echoed}`)
    }

    // 11 · sha256 of a file
    {
      const lines = []
      const sample = join(dir, 'sample.txt')
      writeFileSync(sample, 'n5')
      const result = await run(['--sha256', sample], { out: (line) => lines.push(line) })
      check('sha256：64 位十六进制', result.exitCode === 0 && /\b[0-9a-f]{64}\b/.test(lines.join('\n')))
    }

    // 12 · usage errors
    {
      const lines = []
      const result = await run(['--execution'], { out: (line) => lines.push(line) })
      check('用法：缺值 exit 64', result.exitCode === 64, `exit=${result.exitCode}`)
    }

    const failed = results.filter((r) => !r.ok)
    out('')
    out(`自检：${results.length - failed.length}/${results.length} 通过`)
    return { exitCode: failed.length ? 1 : 0 }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ── 入口 ──────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isMain) {
  run(process.argv.slice(2)).then(({ exitCode }) => {
    process.exitCode = exitCode
  }).catch((e) => {
    process.stderr.write(`取数失败：${e?.stack || e}\n`)
    process.exitCode = 2
  })
}

export { run, parseArgs, MESSAGES, TOOL_RESULT_TYPES, BUSINESS_LOG_TYPE, fixture, csvRows }
