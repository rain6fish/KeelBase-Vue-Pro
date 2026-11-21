// SPDX-License-Identifier: Apache-2.0

// 一个时刻，按它会来的**两种**形状显示 —— 而两种**都按本地时区**。
//
// 控制台读两条链，各用一种形状：运行时答 ISO 串（`2026-10-15T06:01:43.693967Z`，**UTC**），宿主自己那条面答
// **毫秒数**（yudao 的 Jackson 把日期写成时间戳）。同名的那一列因此可能拿到两种东西，而控制台原先那份只处理了
// 串、还把它**原样**印出来：于是同一个面板里**同一个时刻会读出两个钟面** —— 外层「时间」是 `06:01:43`、内层
// 「何时」是 `14:01:43`。一个审计控制台不该这样：读者要能把两行并排比。
//
// 所以两种形状都过 dayjs、都按**本地时区**渲染，于是它们说得出同一个时刻。（数字那一半还捎带修掉一个崩溃：
// 原先的 `v.replace('T',' ')` 对**数字**没有这个方法，那一格**在渲染时抛错、空着**，读表的人看到的是「这一行
// 的值整体左移了一格」。）
//
// 认不出形状的**原样显示**：不认识的值如实显示为它自己，而不是被换成破折号 —— 只有真为空时才给破折号。
//
// One moment, in the two shapes it actually arrives in — both rendered in **local time**. The runtime answers
// ISO strings in UTC; the host's own API answers epoch milliseconds (yudao's Jackson, whose own UI formats
// them as numbers too). Printing the strings verbatim made one panel show two clock faces for the same
// instant — the outer time 06:01:43, the inner one 14:01:43 — and a reader of an audit console has to be
// able to compare two rows. Both shapes now go through dayjs and render locally, so they agree.
//
// The number half also fixes a crash: the old `v.replace('T', ' ')` has no such method on a number, so that
// cell threw while rendering and stayed blank, which reads as a row whose values have shifted one column to
// the left. A value dayjs cannot parse is shown as itself rather than replaced by a dash; only an empty one
// is a dash.
import dayjs from 'dayjs'
import { zonedTime } from './sixQuestions.mjs'

/**
 * One shape for every moment on every page: the audit chain's own cell (`zonedTime`) and this helper
 * used to differ — one wrote the offset, the other did not, so the same instant read as two clocks
 * side by side. They now render through the same formatter, and the offset is always written out.
 *
 * 每一页、每一个时刻只剩一种形状：审计链自己那一格（`zonedTime`）与这个助手原先一处带偏移、一处不带，
 * 同一个时刻并排读出两个钟面。现在两者走同一个格式化器，偏移量一律写出来。
 */
export function timeText(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  const at = dayjs(v)
  if (at.isValid()) return zonedTime(at.toDate())
  return String(v).replace('T', ' ').slice(0, 19)
}
