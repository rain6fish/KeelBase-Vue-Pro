// SPDX-License-Identifier: Apache-2.0

// One moment, in the two shapes it actually arrives in — both rendered in **local time, with the offset
// written out**.
//
// The runtime answers ISO strings in UTC; the host's own API answers epoch milliseconds (yudao's Jackson).
// Printing the strings verbatim made one panel show two clock faces for the same instant — the outer time
// 06:01:43, the inner one 14:01:43. A reader of an audit console has to be able to compare two rows.
//
// 2026-11-21 (`N6`) added the second half: the offset itself is written too. Until then this display
// converted to local time but printed no `UTC±HH:MM`, while the six questions (`zonedTime` in
// `sixQuestions.mjs`) always printed it — so one operation carried a zone on the audit chain and none on
// the pages beside it, and an independent reader could not line the two up across zones. Both entries now
// share **one** display rule: this module delegates to `zonedTime` instead of keeping a second copy.
//
// A value the formatter cannot parse is shown as itself rather than replaced by a dash; only an empty one
// is a dash.
//
// 一个时刻，按它会来的**两种**形状显示 —— 而两种**都按本地时区、都带偏移量**。
//
// 控制台读两条链，各用一种形状：运行时答 ISO 串（`2026-10-15T06:01:43.693967Z`，**UTC**），宿主自己那条面答
// **毫秒数**（yudao 的 Jackson 把日期写成时间戳）。同名的那一列因此可能拿到两种东西，而控制台原先那份只处理了
// 串、还把它**原样**印出来：于是同一个面板里**同一个时刻会读出两个钟面** —— 外层「时间」是 `06:01:43`、内层
// 「何时」是 `14:01:43`。一个审计控制台不该这样：读者要能把两行并排比。
//
// 2026-11-21（`N6`）又补了一步：**偏移量本身也写出来**。此前这套显示只按本地时区换算、不印 `UTC±HH:MM`，
// 而六问那一块（`sixQuestions.mjs` 的 `zonedTime`）一直是印的 —— 于是同一次操作在审计链的行里带时区、在
// 旁边几页不带，独立读者跨时区核对时对不上。现在这两个入口共用**同一条**显示规则：这里直接委托
// `zonedTime`，不再各写一份。改一处，两边一起变。
//
// 认不出形状的**原样显示**：不认识的值如实显示为它自己，而不是被换成破折号 —— 只有真为空时才给破折号。
import { zonedTime } from './sixQuestions.mjs'

export function timeText(v: string | number | null | undefined): string {
  return zonedTime(v)
}
