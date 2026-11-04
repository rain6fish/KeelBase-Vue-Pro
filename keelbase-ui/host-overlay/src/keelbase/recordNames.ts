// SPDX-License-Identifier: Apache-2.0

// Asks this host what a record is called — **the host does the joining**, the console only asks.
//
// The runtime's ledger says which record a write landed on — a type and an id — but it names the record
// only for its own sample module and answers nothing for the rest. The console used to ask the module
// itself (`GET /crm/customer/get`), which needs `crm:customer:query`; the reader roles do not hold it, so
// the third question fell back to a type and a key (YD-42's C③). This is the same move the console already
// makes for a caller's name: ask a narrow read face, `GET /admin-api/keelbase/record-names`, which answers
// only references that appear in a ledger and returns names **already masked** (see `YudaoRecordNames`).
// Nothing here is ever shown as it arrived, and nothing here can look up a record no ledger named.
//
// 问宿主「这条记录叫什么」——**联结由宿主做**，控制台只是问一句。
//
// 运行时的台账说得出一次写落在**哪条**记录上 —— 一个类型加一个 id —— 但它只给**自己样例模块**的记录配
// 名字、对其余的一律不答。控制台原先直接问模块（`GET /crm/customer/get`），那条要 `crm:customer:query`；
// 读者角色没有它，第三问于是只剩类型与主键（`YD-42` 的 C③）。这与控制台为**调用方姓名**做的同一手：问一条
// 窄读面 `GET /admin-api/keelbase/record-names` —— 它只答**账本里出现过**的引用，且回的是**已经掩码**的名字
// （见 `YudaoRecordNames`）。这里没有任何一处按原样显示，也没有一处能查一个没被账本点过名的记录。

import request from '@/config/axios'

/** 宿主答复的一行：一个引用与它的名字（已掩码）。 / One row of the host's answer: a reference and its masked name. */
interface NamedRecord {
  type: string
  id: string | number
  name: string
}

/**
 * 本宿主每个**写**工具落在哪种记录上 —— 抄自工具自己在 Host Java 侧的 `resultType()` 声明，与
 * `labels.ts` 抄工具名是同一条口径（译它的声明，不从拼写猜）。
 *
 * **为什么需要它。** 一次**被扣下或被拒**的调用不写台账（什么都没进系统），运行时只留一条确认记录：
 * 工具名加它当时要用的参数。确认记录答得出「落在哪条记录」，却不说那是**哪种**记录，而线缆上的
 * `/ai/tools` 不发 `resultType`。没有这张表，那一格就只能说「未记录」，尽管运行时其实记着。
 *
 * 表里没有的工具回空串：那一格只画主键、不编一个类型词 —— 编一个比缺一个更糟。
 *
 * Which record type each **write** tool of this host lands on — copied from the tool's own
 * `resultType()` declaration on the host's Java side, the same rule `labels.ts` follows for tool names
 * (translate the declaration, never guess from the spelling). A tool not in the table gets an empty
 * string: the cell draws the key alone rather than inventing a type word.
 */
const TOOL_RESULT_TYPES: Record<string, string> = {
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
}

/** 一个工具写的是哪种记录；本控制台认不出这个工具时回空串。 */
/** The record type a tool writes, or an empty string for a tool this console cannot place. */
export function toolResultType(toolName: string | null | undefined): string {
  return (toolName ? TOOL_RESULT_TYPES[toolName] : '') ?? ''
}

const ROUTE = '/keelbase/record-names'

const cache = new Map<string, string>()

function keyOf(resultType: string | null | undefined, resultId: string | number | null | undefined): string {
  return `${resultType ?? ''}#${resultId ?? ''}`
}

/**
 * The record's own name, masked, or an empty string when this host cannot answer — a type it does not
 * name, a reference no ledger named, a caller it does not answer. Never throws: an empty answer means the
 * page draws the type and the id and no name, which is what it would have drawn anyway.
 *
 * 记录自己的名字（已掩码）；宿主答不上来时回空串 —— 它不给名字的类型、没被账本点过名的引用、它不答复的调用方。
 * 从不抛错：空答案意味着页面画类型与 id、不画名字，而那本来就是它会画的东西。
 */
export async function resolveRecordName(
  resultType: string | null | undefined,
  resultId: string | number | null | undefined,
): Promise<string> {
  if (!resultType || resultId === null || resultId === undefined || resultId === '') return ''
  const key = keyOf(resultType, resultId)
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  let name = ''
  try {
    const rows = (await request.get({
      url: ROUTE,
      params: { refs: `${resultType}:${resultId}` },
    })) as NamedRecord[] | null
    const row = (rows || []).find((r) => r.type === resultType && String(r.id) === String(resultId))
    name = row?.name ?? ''
  } catch {
    name = ''
  }
  cache.set(key, name)
  return name
}

/**
 * 一次问一批引用：回一张 `类型#主键` → 名字（已掩码）的表，宿主答不上的**不在表里** —— 由调用方决定那一格
 * 怎么措辞，本模块不替它编一个词。已经问过的引用不再发请求（与单条那条同一个缓存，否定答案也缓存）。
 *
 * 批量是给**表格列**用的：写入台账与行动中心的「目标」列每一行都要一个名字，一行一条请求就成了整页一屏
 * 二十条。这条端点本来就收逗号分隔的一串引用，故一次问完。
 *
 * Asks about a batch of references at once: a `type#key` → name (masked) table. A reference the host
 * cannot answer is **not in the table** — the caller decides how that cell reads, and this module does
 * not invent a word for it. References already asked about cost no request (same cache as the single
 * call, negative answers included). The batch exists for a **table column**: the write ledger and the
 * action centre name every row, so one request per row would be a screenful of requests; the face takes
 * a comma-separated list, so one call covers them.
 */
export async function resolveRecordNames(
  refs: Array<{ type?: string | null; id?: string | number | null }>,
): Promise<Map<string, string>> {
  const wanted = new Map<string, { type: string; id: string | number }>()
  for (const ref of refs) {
    if (!ref || !ref.type || ref.id === null || ref.id === undefined || ref.id === '') continue
    wanted.set(keyOf(ref.type, ref.id), { type: ref.type, id: ref.id })
  }
  const ask: Array<{ type: string; id: string | number }> = []
  for (const [key, ref] of wanted) {
    if (cache.get(key) === undefined) ask.push(ref)
  }
  if (ask.length) {
    try {
      const rows = (await request.get({
        url: ROUTE,
        params: { refs: ask.map((r) => `${r.type}:${r.id}`).join(',') },
      })) as NamedRecord[] | null
      for (const ref of ask) cache.set(keyOf(ref.type, ref.id), '')
      for (const row of rows || []) {
        if (row?.type) cache.set(keyOf(row.type, row.id), row.name ?? '')
      }
    } catch {
      // 一次没问成，这一批就当没名字；引用仍留空表，下一次再问。
      // One failed call leaves this batch unnamed; the page asks again next time.
    }
  }
  const named = new Map<string, string>()
  for (const key of wanted.keys()) {
    const name = cache.get(key)
    if (name) named.set(key, name)
  }
  return named
}
