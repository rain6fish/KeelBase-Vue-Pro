// SPDX-License-Identifier: Apache-2.0

// Whether the audit read face applies the filters this console sends it — asked of the face itself.
//
// Every object search sends `objectType` + `objectId` and `until` with the request. A face that applies
// them answers an already narrowed list; a face that does not — the code generator's own `/audit/logs`
// is one — ignores parameters it does not declare, and Spring raises nothing, so a wider list arrives
// looking filtered. That silent widening is what this module exists to catch, and the only evidence
// that settles it is the face's own answer: ask for a business object that cannot exist, and for a
// window that ended in 1970. Rows coming back prove the parameter was not applied. An empty answer
// proves nothing either way — the chain may simply be empty — so it is reported as "no evidence",
// never as "applied".
//
// The verdict is about behaviour, not identity: the console does not need to know which implementation
// answered, and a generated face that later grows the filter stops showing the warning by itself.
//
// 审计读面到底施不施加这个控制台发过去的筛选 —— 问读面自己。
//
// 每次对象检索都随请求发 `objectType` + `objectId` 与 `until`。施加它们的读面直接回一份已经收窄的
// 列表；不施加的 —— 代码生成器自带的那条 `/audit/logs` 就是 —— 忽略自己没声明的参数，Spring 也不报错，
// 于是一份更宽的列表以「已筛过」的样子到达。这个模块就是为抓这次无声的放宽而存在，而唯一能定论的证据
// 是读面自己的答复：问一条不可能存在的业务对象，再问一个 1970 年就结束的区间。回行即证明那个参数没有
// 被施加。空答复两头都不能证明 —— 链可能本来就是空的 —— 故报「没有证据」，绝不报「已施加」。
//
// 结论说的是**行为**、不是**身份**：控制台不需要知道是哪一份实现答的，而将来生成物自己长出这个筛选时，
// 警告会自己消失。

/** The kind word every probe carries. No deployment records a business object of this kind. */
/** 每个探针带的种类词。没有哪个部署会把这种对象记进链里。 */
export const READ_FACE_PROBE_KIND = '__keelbase_read_face_probe__'

/**
 * One probe kind per page load: the nonce makes a collision with a row already on the chain impossible,
 * so "rows came back" can only mean the kind was ignored.
 *
 * 每次页面加载一个探针种类词：nonce 让「链上恰好有一行是这个键」不可能发生，故「回了行」只可能是
 * 种类被忽略了。
 */
export function readFaceProbeKind(nonce) {
  return `${READ_FACE_PROBE_KIND}_${nonce}`
}

/**
 * The end of the window the second probe asks for — 1970, which no audit row can be older than.
 *
 * 第二个探针问的区间终点 —— 1970，不可能有审计行比它更早。
 */
export const READ_FACE_PROBE_UNTIL = '1970-01-01T00:00:00.000Z'

/**
 * What the two answers prove. `objectRows` / `untilRows` are the row counts the face returned, or
 * `null` when the call itself failed — a failed call proves nothing and is never read as "applied".
 *
 * 两次答复各证明了什么。`objectRows` / `untilRows` 是读面回的行数；调用本身失败时为 `null` —— 失败的
 * 调用不证明任何事，绝不读成「已施加」。
 */
export function readFaceLimitsOf({ objectRows, untilRows }) {
  if (objectRows === null && untilRows === null) return null
  return {
    objectFilterIgnored: objectRows !== null && objectRows > 0,
    untilIgnored: untilRows !== null && untilRows > 0,
  }
}

/** Whether either limit was proven — the one question the page and the exports ask. */
/** 是否有任何一条被证明了 —— 页面与导出要问的就是这一个。 */
export function hasReadFaceLimits(limits) {
  return Boolean(limits && (limits.objectFilterIgnored || limits.untilIgnored))
}
