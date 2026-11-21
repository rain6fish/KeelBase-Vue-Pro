// SPDX-License-Identifier: Apache-2.0

// A confirmation proposal's arguments, as lines a person can read. Pure: no Vue, no host import, so it
// runs under `node --test`.
//
// The action centre used to print the runtime's arguments as `JSON.stringify(args, null, 2)`: braces,
// quoted keys and escaped values, in the one place a person has to decide whether to approve a write.
// The arguments are still what they are — nothing is inferred and nothing is dropped — but the block
// now reads as `业务主键：9005` / `客户名称：…`, one recorded argument per line, and an empty set says
// 「未记录」 rather than a dash.
//
// 确认提议里的参数，排成一行行给人读的字。纯函数：不依赖 Vue、不依赖宿主 import，故可在 `node --test`
// 下直接跑。
//
// 行动中心原先把运行时的参数按 `JSON.stringify(args, null, 2)` 印出来：花括号、带引号的键、转义值，
// 而那一块正是人决定批不批一次写的地方。参数仍是它们本来的样子 —— 不推断、也不丢 —— 但这一块现在读作
// `业务主键：9005` / `客户名称：…`，记下几个参数就几行；一组空参数说「未记录」，不是破折号。

/**
 * Argument names a reader already has business words for. Anything outside this table is printed under
 * the name the call carried — it is what the person is approving, and inventing a label would hide it.
 *
 * 读者已经有业务词的参数名。表外的参数按调用带着的原名印出来 —— 那是这个人正在批准的东西，替它编一个
 * 标签反而把它藏了。
 */
const ARG_LABELS = {
  id: 'keelbase.audit.objectKey',
  name: 'keelbase.sixQ.fieldName',
  level: 'keelbase.sixQ.fieldLevel',
  source: 'keelbase.sixQ.fieldSource',
  dealStatus: 'keelbase.sixQ.fieldDealStatus',
  followUpStatus: 'keelbase.sixQ.fieldFollowUpStatus',
}

function word(t, te, key, fallback) {
  return te && te(key) ? t(key) : fallback
}

/** One value without JSON syntax: lists join with 、, nested objects with ，. */
/** 一个值，不带 JSON 语法：列表用「、」连起来，嵌套对象用「，」。 */
function valueText(value, t) {
  if (value === null || value === undefined) return t('keelbase.actionCenter.argsEmptyValue')
  if (typeof value === 'boolean') return value ? '✓' : '✗'
  if (Array.isArray(value)) return value.map((item) => valueText(item, t)).join('、')
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${key}=${valueText(item, t)}`)
      .join('，')
  }
  return String(value)
}

/**
 * The arguments block. An absent or empty set answers with the console's own 「未记录」 sentence: an
 * empty line would read as "this proposal carried nothing to decide on", which is not what happened.
 *
 * 参数块。没有参数或参数为空时，答本控制台自己那句「未记录」：留一行空白会被读成「这次提议没带任何要
 * 决定的东西」，而事实不是那样。
 */
export function argsText(args, { t, te }) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return t('keelbase.actionCenter.argsUnrecorded')
  }
  const entries = Object.entries(args)
  if (!entries.length) return t('keelbase.actionCenter.argsUnrecorded')
  return entries
    .map(([key, value]) => {
      const label = word(t, te, ARG_LABELS[key], key)
      return `${label}：${valueText(value, t)}`
    })
    .join('\n')
}
