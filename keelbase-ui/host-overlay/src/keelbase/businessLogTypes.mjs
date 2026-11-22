// SPDX-License-Identifier: Apache-2.0
//
// Which runtime result type names which of the host's own operate-log modules.
//
// The runtime names a module its own way (`crm_contact`) and the host names it in Chinese
// (`CRM 联系人`); one side has to translate, and the host is where its own modules are known. An
// entry is only added when all three of these hold in the host's own sources:
//
//   1. a service method the tool calls carries `@LogRecord(type = <word>, ..., bizNo = "{{#<new
//      record>.id}}")` — so the host logs one row per write, keyed by the new record's id;
//   2. the tool's `resultType()` returns the runtime's word for that kind;
//   3. the tool answers `ToolResult.ok` with that same id as `id`, which the runtime stores as the
//      side effect's `resultId` (`businessLogApi.byObject` sends it as `bizId`).
//
// So `(resultId, mapped word)` names the host row for the same object — a correlation by object id,
// not a shared operation id. A kind that fails any of the three stays out: the page then says the
// kind has no second entry here rather than querying a type whose `bizNo` is some other record.
//
// 运行时的结果类型和宿主自己的操作日志模块名，哪一张对哪一张。
//
// 运行时按自己的方式给模块起名（`crm_contact`），宿主用中文起名（`CRM 联系人`）；总得有一侧翻译，
// 而模块是在**宿主**那儿认识的。只有当宿主自己的源码里三件事都成立时才登记一条：
//
//   1. 工具调用的那个 service 方法带 `@LogRecord(type = <词>, ..., bizNo = "{{#<新记录>.id}}")`
//      —— 宿主每次写落一行，键就是新记录的 id；
//   2. 工具的 `resultType()` 返回运行时的那个词；
//   3. 工具 `ToolResult.ok` 回传的 `id` 正是同一个 id，运行时把它存成副作用的 `resultId`
//      （`businessLogApi.byObject` 原样当 `bizId` 发出）。
//
// 于是 `(resultId, 映射词)` 指向同一个对象在宿主上的那一行 —— 这是按对象 id 的相关，不是共享的操作 id。
// 三条有一条不成立的类别**不登记**：页面宁可说「本部署没有第二入口」，也不去查一个 `bizNo` 其实是别的
// 记录的类型。

export const BUSINESS_LOG_TYPE = {
  crm_customer: 'CRM 客户',
  crm_clue: 'CRM 线索',
  crm_contact: 'CRM 联系人',
  crm_business: 'CRM 商机',
  crm_contract: 'CRM 合同',
  crm_product: 'CRM 产品',
  crm_receivable: 'CRM 回款',
  crm_receivable_plan: 'CRM 回款计划',
}

/**
 * The host-side module a result type maps to, or null when the two vocabularies do not meet.
 * 一个结果类型对应的宿主侧模块；两套词表碰不上时给 null。
 */
export function mappedBusinessLogType(resultType) {
  return resultType ? (BUSINESS_LOG_TYPE[resultType] ?? null) : null
}
