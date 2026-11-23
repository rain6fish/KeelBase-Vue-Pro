// SPDX-License-Identifier: Apache-2.0
//
// ── English ─────────────────────────────────────────────────────────────────────
// N6 gap #2 (2026-11-22): widening the second entry's business-log mapping.
//
// Expanding a ledger row in the action centre queries the host's own `system_operate_log` by
// `(host module word, business id)`. `businessLogTypes.mjs` says which runtime result type names
// which host module.
//
// This file pins two things. First, every mapping walks three steps in the host's own sources: the
// service's `@LogRecord` carries that module word and a `bizNo` that is the new record's id; the
// tool's `resultType()` returns the runtime word; and the tool answers that same id as the side
// effect's key. The seven kinds widened beyond `crm_customer` were checked this way, not guessed
// from their names. Second, a kind that fails any step stays out — a different business table
// (`fms_voucher`'s review logs the account-set id), a parent object's id (`crm_follow_up_record`
// logs against the customer/business it belongs to), or a module with no `@LogRecord` at all (BPM,
// OA, the demo objects) — and the page then says this deployment has no second entry rather than
// querying a wrong key and laying someone else's rows beside the action.
//
// N6 缺口 #2（2026-11-22）：第二入口的业务日志映射扩面。
//
// 行动中心展开一行台账时，那一腿查的是宿主自己的 `system_operate_log`，查询键是
// `(宿主模块词, 业务 id)`。映射表 `businessLogTypes.mjs` 说哪个运行时结果类型对应哪个宿主模块词。
//
// 这一文件钉住两件事：
//   1. 每一条映射都能在**宿主自己的源码**里走通三步 —— 服务上的 `@LogRecord` 用这个模块词、`bizNo`
//      就是新记录的 id；工具的 `resultType()` 是运行时那个词；工具回传同一个 id 作为副作用主键。
//      `crm_customer` 之外新扩的七类逐条这样核过，不是照名字猜的。
//   2. 过不了这三步的类别**不登记**：另一张业务表（`fms_voucher` 审核记的是账套 id）、父对象 id
//      （`crm_follow_up_record` 记在客户/商机等父记录上）、或宿主压根没有 `@LogRecord`（BPM、OA、
//      演示对象）—— 页面此时说「本部署没有第二入口」，而不是按一个错的键去查、把别人的行摆过来。
//
//     node --test scripts/business-log-mapping.test.mjs
//
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BUSINESS_LOG_TYPE, mappedBusinessLogType } from '../keelbase-ui/host-overlay/src/keelbase/businessLogTypes.mjs'

const ROOT = process.env.KEELBASE_REPO_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const CRM = 'yudao-module-crm/src/main/java/cn/iocoder/yudao/module/crm'
const TOOLS = 'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase'
const LOCALES = 'keelbase-ui/host-patches/0002-governance-ui.patch'

/** One kind, with the four places in the host's own sources that have to agree. */
/** 一类记录，以及宿主自己的源码里必须相互证明的四处。 */
const EVIDENCE = [
  {
    type: 'crm_customer',
    word: 'CRM 客户',
    typeConst: 'CRM_CUSTOMER_TYPE',
    createSubTypeConst: 'CRM_CUSTOMER_CREATE_SUB_TYPE',
    service: `${CRM}/service/customer/CrmCustomerServiceImpl.java`,
    bizNo: 'customer.id',
    tool: `${TOOLS}/CrmCustomerTools.java`,
  },
  {
    type: 'crm_clue',
    word: 'CRM 线索',
    typeConst: 'CRM_CLUE_TYPE',
    createSubTypeConst: 'CRM_CLUE_CREATE_SUB_TYPE',
    service: `${CRM}/service/clue/CrmClueServiceImpl.java`,
    bizNo: 'clue.id',
    tool: `${TOOLS}/CrmClueTools.java`,
  },
  {
    type: 'crm_contact',
    word: 'CRM 联系人',
    typeConst: 'CRM_CONTACT_TYPE',
    createSubTypeConst: 'CRM_CONTACT_CREATE_SUB_TYPE',
    service: `${CRM}/service/contact/CrmContactServiceImpl.java`,
    bizNo: 'contact.id',
    tool: `${TOOLS}/CrmContactTools.java`,
  },
  {
    type: 'crm_business',
    word: 'CRM 商机',
    typeConst: 'CRM_BUSINESS_TYPE',
    createSubTypeConst: 'CRM_BUSINESS_CREATE_SUB_TYPE',
    service: `${CRM}/service/business/CrmBusinessServiceImpl.java`,
    bizNo: 'business.id',
    tool: `${TOOLS}/CrmBusinessTools.java`,
  },
  {
    type: 'crm_contract',
    word: 'CRM 合同',
    typeConst: 'CRM_CONTRACT_TYPE',
    createSubTypeConst: 'CRM_CONTRACT_CREATE_SUB_TYPE',
    service: `${CRM}/service/contract/CrmContractServiceImpl.java`,
    bizNo: 'contract.id',
    tool: `${TOOLS}/CrmContractTools.java`,
  },
  {
    type: 'crm_product',
    word: 'CRM 产品',
    typeConst: 'CRM_PRODUCT_TYPE',
    createSubTypeConst: 'CRM_PRODUCT_CREATE_SUB_TYPE',
    service: `${CRM}/service/product/CrmProductServiceImpl.java`,
    bizNo: 'productId',
    tool: `${TOOLS}/CrmProductTools.java`,
    // The product service hands its new id to the annotation through a variable rather than a
    // parameter object; the two lines below are that hand-off.
    // 产品服务把新 id 经变量交给注解，而不是走入参对象；下面两行就是那次交接。
    extra: [/LogRecordContext\.putVariable\("productId", product\.getId\(\)\)/, /return product\.getId\(\);/],
  },
  {
    type: 'crm_receivable',
    word: 'CRM 回款',
    typeConst: 'CRM_RECEIVABLE_TYPE',
    createSubTypeConst: 'CRM_RECEIVABLE_CREATE_SUB_TYPE',
    service: `${CRM}/service/receivable/CrmReceivableServiceImpl.java`,
    bizNo: 'receivable.id',
    tool: `${TOOLS}/CrmReceivableTools.java`,
  },
  {
    type: 'crm_receivable_plan',
    word: 'CRM 回款计划',
    typeConst: 'CRM_RECEIVABLE_PLAN_TYPE',
    createSubTypeConst: 'CRM_RECEIVABLE_PLAN_CREATE_SUB_TYPE',
    service: `${CRM}/service/receivable/CrmReceivablePlanServiceImpl.java`,
    bizNo: 'receivablePlan.id',
    tool: `${TOOLS}/CrmReceivablePlanTools.java`,
  },
]

/** Every .java file under a repo-relative directory. / 一个仓内目录下所有 .java 文件。 */
function javaFiles(rel) {
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      if (statSync(abs).isDirectory()) walk(abs)
      else if (name.endsWith('.java')) out.push(abs)
    }
  }
  walk(join(ROOT, rel))
  return out
}

const logRecordCount = (rel) =>
  javaFiles(rel).reduce((n, file) => n + (readFileSync(file, 'utf8').match(/@LogRecord\b/g) || []).length, 0)

test('the map covers crm_customer plus seven more kinds, and nothing it cannot prove', () => {
  assert.deepEqual(
    Object.keys(BUSINESS_LOG_TYPE).sort(),
    EVIDENCE.map((e) => e.type).sort(),
    'the table and the evidence list name different kinds',
  )
})

test('every mapped kind walks the three host-side steps', () => {
  const constants = read(`${CRM}/enums/LogRecordConstants.java`)
  for (const e of EVIDENCE) {
    // The host module word: the constant is exactly the table's value.
    // ① 宿主模块词：常量就是这张表的值。
    assert.match(
      constants,
      new RegExp(`String ${e.typeConst} = "${e.word}";`),
      `${e.type}: ${e.typeConst} no longer reads "${e.word}"`,
    )
    assert.equal(BUSINESS_LOG_TYPE[e.type], e.word, `${e.type}: the table drifted from ${e.typeConst}`)

    // The service logs under that word and keys the row by the **new record's** id.
    // ② 服务上的日志用这个模块词，bizNo 是**新记录**的 id。
    const service = read(e.service)
    assert.match(
      service,
      new RegExp(`@LogRecord\\(type = ${e.typeConst}, subType = ${e.createSubTypeConst},\\s*bizNo = "\\{\\{#${e.bizNo.replace('.', '\\.')}\\}\\}"`),
      `${e.type}: ${e.service} no longer logs a create against ${e.bizNo}`,
    )
    for (const extra of e.extra || []) {
      assert.match(service, extra, `${e.type}: ${e.service} lost the id hand-off the annotation reads`)
    }

    // The tool names the runtime kind and answers that same id as the side effect's key.
    // ③ 工具的 resultType() 是运行时那个词，且把同一个 id 回给运行时作副作用主键。
    const tool = read(e.tool)
    assert.match(tool, new RegExp(`return "${e.type}";`), `${e.type}: ${e.tool} no longer declares that result type`)
    assert.match(tool, /service\.create/, `${e.type}: ${e.tool} does not call the service the annotation sits on`)
    assert.match(tool, /out\.put\("id", id\)/, `${e.type}: ${e.tool} no longer answers the record id`)
  }
})

test('a kind the host keys by another record stays out of the map', () => {
  // A voucher review logs against the **account set's** id while the tool answers the voucher id;
  // the two ids name different objects, so laying the row beside the action would show someone
  // else's write as this one's evidence.
  // 凭证审核记在**账套** id 上（`bizNo = "{{#accountSetId}}"`），而工具回给运行时的是凭证 id。
  // 两个 id 不是同一个对象，摆在一起就是把别人的行当成这次写的证据。
  const fmsService = read('yudao-module-fms/src/main/java/cn/iocoder/yudao/module/fms/service/voucher/FmsVoucherServiceImpl.java')
  assert.match(
    fmsService,
    /@LogRecord\(type = FMS_VOUCHER_TYPE, subType = FMS_VOUCHER_REVIEW_SUB_TYPE,\s*bizNo = "\{\{#accountSetId\}\}"/,
    'the voucher review no longer keys its log by the account set',
  )
  assert.match(read(`${TOOLS}/FmsVoucherTools.java`), /out\.put\("id", id\)/)
  assert.equal(mappedBusinessLogType('fms_voucher'), null, 'fms_voucher now maps to a row keyed by another id')

  // A follow-up record logs against its **parent** (the customer): the bizNo is the customer id
  // under the "CRM 客户" word, while the tool answers the follow-up record's id.
  // 跟进记录记在**父对象**（客户）上：`bizNo` 是客户 id，模块词是「CRM 客户」，而工具回的是跟进记录 id。
  const customer = read(`${CRM}/service/customer/CrmCustomerServiceImpl.java`)
  assert.match(customer, /@LogRecord\(type = CRM_CUSTOMER_TYPE, subType = CRM_CUSTOMER_FOLLOW_UP_SUB_TYPE,\s*bizNo = "\{\{#id\}\}"/)
  assert.match(read(`${TOOLS}/CrmFollowUpTools.java`), /out\.put\("id", recordId\)/)
  assert.equal(mappedBusinessLogType('crm_follow_up_record'), null)

  // BPM, OA and the demo objects (infra, pms) carry **no** `@LogRecord` in this host at all — there
  // is no second entry to map to, not a mapping left unconfigured.
  // BPM / OA / 演示对象（infra、pms）在本宿主里**没有**任何 `@LogRecord` —— 没有第二入口，不是没配映射。
  for (const module of ['yudao-module-bpm', 'yudao-module-oa', 'yudao-module-infra', 'yudao-module-pms']) {
    assert.equal(logRecordCount(`${module}/src/main/java`), 0, `${module} grew a @LogRecord; revisit the map`)
  }
  for (const type of ['bpm_oa_leave', 'bpm_process_instance', 'infra_demo01_contact', 'infra_file', 'follow_up', 'pm_project']) {
    assert.equal(mappedBusinessLogType(type), null, `${type} has no host log to point at`)
  }

  // The system module logs roles and admin users only; notices have none.
  // 系统模块只给角色与管理员记日志，通知公告没有。
  const systemConstants = read('yudao-module-system/src/main/java/cn/iocoder/yudao/module/system/enums/LogRecordConstants.java')
  assert.doesNotMatch(systemConstants, /SYSTEM_NOTICE_TYPE|SYSTEM_NOTIFY_MESSAGE_TYPE/)
  assert.equal(mappedBusinessLogType('system_notice'), null)
  assert.equal(mappedBusinessLogType('system_notify_message'), null)

  // The scalar negatives: empty and unknown kinds are never guessed at.
  // 标量负向：空值 / 不认识的类型都不猜。
  assert.equal(mappedBusinessLogType(''), null)
  assert.equal(mappedBusinessLogType(null), null)
  assert.equal(mappedBusinessLogType(undefined), null)
  assert.equal(mappedBusinessLogType('not_a_kind'), null)
})

test('the action centre fetches the leg with that mapped word and the row’s own object id', () => {
  // A hit: the query key is "host module word + resultId" — the six questions' third answer's own
  // object key.
  // 命中：查询键就是「宿主模块词 + resultId」。这就是六问第三问的同一个对象键。
  const row = { resultType: 'crm_contract', resultId: 7 }
  const request = { type: mappedBusinessLogType(row.resultType), bizId: row.resultId }
  assert.deepEqual(request, { type: 'CRM 合同', bizId: 7 })

  const api = read('keelbase-ui/host-overlay/src/keelbase/governanceApi.ts')
  assert.match(api, /import \{ mappedBusinessLogType \} from '\.\/businessLogTypes\.mjs'/)
  assert.match(api, /mappedType: \(resultType: string \| null \| undefined\): string \| null =>\s*mappedBusinessLogType\(resultType\)/)
  assert.match(api, /byObject: \(businessType: string, bizId: number \| string\)/)
  assert.match(api, /params: \{ type: businessType, bizId, pageNo: 1, pageSize: 5 \}/)

  const page = read('keelbase-ui/host-overlay/src/views/keelbase/governance/ActionCenterPage.vue')
  // Unmapped: the page says so itself, and onExpand returns **before** the request, so no empty
  // module word is ever sent.
  // 未映射：页面自己说「没有第二入口」，且 onExpand 在取数**之前**返回，不拿空模块词去查。
  assert.match(page, /v-if="!businessLogApi\.mappedType\(row\.resultType\)"/)
  assert.match(page, /t\('keelbase\.effects\.businessLogUnmapped'\)/)
  assert.match(page, /const businessType = businessLogApi\.mappedType\(row\.resultType\)/)
  assert.match(page, /if \(!businessType \|\| row\.resultId === null \|\| row\.resultId === undefined\) return/)
  assert.match(page, /await businessLogApi\.byObject\(businessType, row\.resultId\)/)
})

test('the three axes read the same on the leg as on the six questions', () => {
  const page = read('keelbase-ui/host-overlay/src/views/keelbase/governance/ActionCenterPage.vue')
  // Time: the leg's cell uses the six questions' own `zonedTime` (offset included), so one instant
  // reads identically in both entries.
  // 时间：业务腿那一格直接用六问那一条 `zonedTime`（带偏移）—— 同一时刻在两处逐字可比。
  assert.match(page, /\{\{ zonedTime\(r\.createTime\) \}\}/)
  assert.match(read('keelbase-ui/host-overlay/src/keelbase/time.ts'), /return zonedTime\(/)

  // Who: the first answer's shape, name (account #n), in one cell; the id rides with the name.
  // 谁：按第一问的形状「名字（账号 #n）」一格写完；编号与名字同格，不再另起一行。
  assert.match(page, /\{\{ whoText\(r\) \}\}/)
  assert.match(page, /t\('keelbase\.sixQ\.account'\)\} #\$\{id\}）`/)

  // Object: the leg itself names none (it sits inside the same panel); the panel's object row uses
  // the same record vocabulary the six questions do.
  // 对象：业务腿本身不印对象（它属于同一个展开面板）；面板的对象行与六问用同一套 record 词。
  assert.match(page, /\{\{ targetText\(row\) \}\}/)
  assert.match(page, /\{\{ idText\(row\.resultId\) \}\}/)
  assert.match(page, /const key = resultTypeWordKey\(value, te\)/)

  // For the eight mapped kinds the Chinese object word is identical in both bundles (English
  // wording/case differences are out of this task's scope).
  // 新扩的八类，中文对象词在台账与六问两边逐字相同（英文措辞/大小写差异不属本次范围）。
  const zh = read(LOCALES).slice(read(LOCALES).indexOf('diff --git a/src/locales/zh-CN.ts'))
  const words = (marker) => {
    const start = zh.indexOf(marker)
    assert.ok(start >= 0, `missing ${marker}`)
    const end = zh.indexOf('\n+    },', start)
    return Object.fromEntries([...zh.slice(start, end).matchAll(/^\+\s+([a-z0-9_]+): '([^']*)',$/gm)].map((m) => [m[1], m[2]]))
  }
  const record = words('+    record: {')
  const effects = words('+      resultType: {')
  for (const { type } of EVIDENCE) {
    assert.ok(record[type], `record.${type} is missing`)
    assert.equal(effects[type], record[type], `${type}: the ledger and the six questions name the object differently`)
  }
})
