# YD-43 · B3 Manual-Flow Comparison Intake & Timing Kit / 人工流程对照采集与计时材料包

> **Status (2026-11-27, read-only output; no values filled; not committed).**
> Basis: `yd43-frozen-20261117T045650Z.md` (SHA-256 `377f52ea…aa26d9`, byte-identical to `yd43-pack-1117.md`). Where this kit and the frozen copy differ, the frozen copy wins.
> Instance-layer landing slots: A9 (manual flow), A10 (`T_max`), A11 (count unit), A12 (time zone).
> This is not the print source for the task cards (print those from the frozen copy §3.1), and it is not a revision of the criteria.
>
> **状态（2026-11-27，只读产出；未填任何值；未提交）。**
> 依据：`yd43-frozen-20261117T045650Z.md`（SHA-256 `377f52ea…aa26d9`，与 `yd43-pack-1117.md` 逐字节相同）。本件与该冻结件冲突时，以冻结件为准。
> 实例层落点：A9（人工流程）、A10（`T_max`）、A11（计数口径）、A12（时区）。
> 本件不是题卡的打印源（题卡只用冻结副本 §3.1 打印），也不是判据的修订件。

---

# Part I — English

## 0. How this kit is used

This kit is the instrument for collecting the B3 input (the customer's current manual flow) and for running the manual comparison session under frozen §5. It is filled in two stages:

1. **Intake (remote or on site, with the user only).** Fill §1 from what the user says. Every unknown stays `未定` (undecided). Do not write a value that merely looks plausible.
2. **Session (on site).** §2 tells you how the chosen case is labelled on the record sheet; §3 fixes the clock; §4 fixes the error tally; §5 fixes the arithmetic; §6 fixes who sits in which group; §7 records the reverse proof.

Hard rules for whoever fills this kit:

- **Do not fill in the flow for the user.** Whether a manual flow exists, what it is called, who runs it, and where the data lives are facts only the user and the customer can supply. A filled-in guess turns the criterion into a fabricated fact.
- **Do not assume either way.** Do not assume the customer has a manual flow; do not assume it has none. Ask, record, and mark the case per task.
- **Leaving A9 empty has a fixed consequence**: the three formulas in §5.6 cannot be computed, and the project-level result is `对照口径未达成` (comparison criterion not met). That is a correct outcome, not a failure to hide.
- **Do not touch the frozen layer.** This kit adds no task, no threshold, no pass line. The few writing conventions it adds are listed in §9 and each is traceable to the frozen text.

### 0.1 Language of the two parts

Part I and Part II are mirrors. Use one language for a whole session; never mix. Print from Part II for Chinese-speaking operators. `EXAMPLE — replace` (Part I) and `示例，请替换` (Part II) mark every illustrative value; no illustrative value is a reading.

---

## 1. Manual-flow registration (A9)

### 1.1 Header

| Item | Value |
|---|---|
| Project code / customer | `__________` / `__________` |
| Filled by / date | `__________` / `2026-__-__` |
| Frozen criteria SHA-256 | `377f52ea…aa26d9` (verify against the freeze record) |
| Landing | Instance file, slot A9 (+ record-sheet session header) |

### 1.2 Registration fields

| # | Field | What to write | Value |
|---|---|---|---|
| 1 | Name of the manual flow | One sentence a stranger could use to find it | `__________` |
| 2 | Systems / carriers used | Name every carrier: paper form, spreadsheet, legacy system, IM group, phone. Write an oral approval in WeChat as it is | `__________` |
| 3 | Operator(s) | Role / code. State whether this is the same person as an AI-group user (drives §6) | `__________` |
| 4 | Is this the customer's current flow? | Per task, tick one: current flow / back-office manual path / does not exist. See §2 for what each means | T1 ☐current ☐back-office ☐none · T2 ☐ ☐ ☐ · T3 ☐ ☐ ☐ · T4 ☐ ☐ ☐ · T5 ☐ ☐ ☐ |
| 5 | Where the data lives | Physical archive, shared drive, legacy DB, one person's mailbox. Needed to re-enact the flow and to read errors afterwards | `__________` |
| 6 | How each of the five things is done today | One sentence per task: who → with what → what comes out. Align with the capability faces below; do not rewrite the task | T1 `__________`<br>T2 `__________`<br>T3 `__________`<br>T4 `__________`<br>T5 `__________` |
| 7 | Rough time per item | A priori estimate in minutes, not a reading. If one item takes hours, the manual session may be infeasible — know this now | T1 `__` · T2 `__` · T3 `__` · T4 `__` · T5 `__` min |
| 8 | Can the manual group's errors be read afterwards? | If the flow leaves no trace, the six error types cannot be verified; say so and treat it as a limitation in the report | ☐ yes, trace carrier: `______`　☐ no, reason: `______` |
| 9 | Notes on re-enactment | Approvals by phone, a step that needs a colleague present, a seasonal batch, anything that changes how the session must be staged | `__________` |

### 1.3 Capability faces of the five tasks (alignment only; the operative cards are the Chinese text in frozen §3.1 — this kit does not translate them for use)

| Task | Capability face |
|---|---|
| T1 | Start a write and state the resulting status |
| T2 | Adjudicate someone else's write (second-person approve / decline) |
| T3 | Assemble an outward-ready file for one object over one interval |
| T4 | Locate one audit fact (who / when / object / changed from → to) |
| T5 | Classify an operation that did not take effect and attribute the cause |

### 1.4 Worked example (EXAMPLE — replace every value)

| Field | Example value |
|---|---|
| Name | Store-visit paper form plus a month-end spreadsheet roll-up |
| Systems | Printed visit form + shared Excel; approvals by WeChat |
| Operator | Purchasing specialist (same person as U1, ≥24 h apart) |
| Current flow? | T1 current · T2 current · T3 current · T4 none (nobody keeps history) · T5 current |
| Data | Paper forms in a cabinet; Excel on the shared drive |
| Five things | T1 fill the form, key it into Excel back at the office; T2 ask the supervisor on WeChat; T3 month-end: paste sheets, mail the file; T4 ask a colleague, no version history; T5 phone IT |
| Rough time | T1 8 · T2 5 · T3 40 · T4 – · T5 10 min |
| Errors readable? | Excel keeps versions for T1–T3; T4 none |

---

## 2. Three cases, their verdicts and their labels

Frozen §5.1 sets a priority order. The case may differ **per task**; register it per task and label the record sheet accordingly.

| Case | Test question (ask the user; do not infer) | What goes on the record sheet (verbatim string) | A9 entry | How it enters §5.6 |
|---|---|---|---|---|
| **A. The customer's current flow** (true control) | Does the customer do this today, by this route, with a named person? | Session header `组别 = 人工`; notes column: `客户现行流程` | Fill the flow name, systems, operator, data location | Manual group, as the real comparison |
| **B. Back-office manual path** (approximate control) | No current flow, but the product's back-office pages can do the same five things by hand, without the assistant? | Session header `组别 = 人工` **plus, verbatim, in the notes**: 「这不是客户现行流程，是后台手工路径」 | Record it as `否，是后台手工路径` | Manual group, but the report must call it an approximate control; never conclude “better than the customer's current flow” |
| **C. The capability does not exist** (no page, no paper) | Neither a current flow nor a back-office path exists for this task? | Result column: `未完成`; note: `做不到（能力不存在）`; time: `900`; errors: `+1` | Record `没有（该题记"做不到"）` | Manual group with the capped time and one error, per frozen §5.1 item 3 |

Case C's exact handling is frozen: the manual group records “cannot be done”, is timed at the cap, and is charged one error. Do not record it as `未测` — under frozen §4.1, `未测（环境）` exists only for §2.5 environment stops.

A session may mix cases across tasks (for example A for T1–T3, C for T4). The report must state the case per task; do not average the cases into one label.

---

## 3. Timing protocol

### 3.1 Definitions and instrument

| Item | Rule (frozen §5.2) | This session's value |
|---|---|---|
| Start | The instant the host says 「第 N 件，开始」. Reading time is not counted; the card is placed in front of the user before that utterance | `__________` |
| End | The instant the user says 「做完了」 / 「卡住了」 / hands the result back, or the cap is reached | `__________` |
| Instrument | Phone stopwatch **or** screen-recording timeline. Choose one; keep it for the whole session; record to the second | ☐ stopwatch　☐ recording timeline |
| `T_max` | 900 s (15 min) per task. Changeable **only before the instance layer is frozen**, written into A10. After the freeze it may not be changed | `900` s (A10) |
| On timeout | Stop; result `未完成（超时）`; time recorded as `900` | — |
| Pause | User takes a call or leaves the room: stop the clock, write the pause start and end on the record sheet | — |
| Whole-session time | Sum of the five per-task times, excluding pauses | — |

### 3.2 What is not paused

Reading the card, the §7.4 waiting period (the host waits at least 2 minutes before speaking), and waiting for the page to recover all count toward the time. The dividing line is whether the **user leaves the seat**, not whether the system hiccups: a user who stays seated while the browser is reopened keeps the clock running; a user who walks off to fetch a colleague or a device is on a pause.

### 3.3 Consistency rules

- One instrument for the whole session. Switching halfway voids the comparability of the times in that session.
- Times are written to the second. Do not round to minutes, do not estimate after the fact.
- The host never announces “done” on the user's behalf; the end is the user's utterance or the cap.
- Recommendation (not a criterion): run both groups with the same instrument so the two medians rest on the same clock.

---

## 4. Error tally: E1–E6, with help counted separately

### 4.1 The six types (frozen §5.3)

| # | Error type | Recorded as | Screen fact to attach (required) |
|---|---|---|---|
| E1 | Wrong object (done on another customer / record) | 1 | `__________` |
| E2 | Wrong value (name, amount, date differs from what was said) | 1 | `__________` |
| E3 | Omission (half of one task done) | 1 | `__________` |
| E4 | Wrong range (export interval / type wrong) | 1 | `__________` |
| E5 | Wrong evidence (pointed at a row that does not match the reading) | 1 | `__________` |
| E6 | Rework (the host or the reading forced a redo) | 1 | `__________` |

An error that cannot be traced to a concrete screen fact (record sheet §6.2) does not count. One occurrence of an error is charged once; the same type appearing twice is charged twice, because each occurrence is a separate screen fact.

### 4.2 Tally block (per user)

| E1 | E2 | E3 | E4 | E5 | E6 | **Total errors** | **Help count (not an error)** |
|---|---|---|---|---|---|---|---|
| `_` | `_` | `_` | `_` | `_` | `_` | `_` | `_` |

### 4.3 Help

- Asking for help is **not** an error. Count it and present it separately; never fold it into the error total.
- The count is over the whole session (A11), the same unit as the errors.
- The host answers only with the §7.3 script. If the answer amounts to P1–P4, it is also entered in the prompt ledger; for the manual group the ledger is kept as a process fact and does **not** enter the three formulas in §5.

---

## 5. Median and the three formulas

### 5.1 Unit

One number per user, taken over the whole session: total seconds (sum of five, pauses excluded) and total errors (E1–E6). Do not average across the five tasks inside a user.

### 5.2 Median

Sort the values; odd count → the middle value; even count → the mean of the two middle values. Seconds to 1 decimal; errors to 1 decimal.

### 5.3 The three formulas (frozen §5.4 / §5.6)

| Clause | Test | Result |
|---|---|---|
| Not worse · time | `median(AI whole-session seconds) ≤ median(manual whole-session seconds)` | ☐ holds ☐ fails, Δ = `____` s |
| Not worse · errors | `median(AI errors) ≤ median(manual errors)` | ☐ holds ☐ fails, Δ = `____` |
| Better · declared item | `median(AI errors) < median(manual errors)` | ☐ holds ☐ fails, Δ = `____` |

All three must hold for the comparison criterion to be met. If any fails, write which one and by how much, as it stands.

### 5.4 Worked example (EXAMPLE — replace every value)

| Group | Users' whole-session seconds | Median (s) | Users' errors | Median |
|---|---|---|---|---|
| AI | 640, 900 | 770.0 | 1, 2 | 1.5 |
| Manual | 1200, 700 | 950.0 | 2, 3 | 2.5 |

Time: 770.0 ≤ 950.0 holds. Errors not worse: 1.5 ≤ 2.5 holds. Errors better: 1.5 < 2.5 holds. All three hold **for these two users only**.

### 5.5 Red lines when N is small

- With one user per group, the median is that person's number. Say so.
- With N < 3, write the actual N and add: `样本小，结论只对这 N 人成立`.
- Never write any of: 「优于人工流程」, 「效率提升 X%」, 「普遍适用」, 「证明产品更好」, 「整体通过」. The comparison answers one question — whether the declared clause held for these named people — and nothing beyond it.
- The conclusion is the user's to draw. This kit computes; it does not conclude.

---

## 6. Between-group design

### 6.1 Rules (frozen §5.5)

- Prefer **different people** for the two groups.
- If the same person does both: the two sessions are **≥ 24 hours apart**, **only one group per day**, the order is recorded (order bias goes into the report), and the two groups use **different object instances** (a different customer / a different record) — never the same object twice.
- Both groups use the **same frozen task list** (§3.1), swapping only object nouns under the A16 substitution record.
- Recommendation (not a criterion): the manual-group operator should be the person who really does this work; if only our own staff can demonstrate it, write that in the report as a limitation.

### 6.2 Session schedule (blank)

| Date | Time | Group | User / operator | Task-list copy | Object instance | Order (1st / 2nd for the same person) | Instrument |
|---|---|---|---|---|---|---|---|
| `2026-__-__` | `__:__` | ☐ AI ☐ manual | `______` | frozen §3.1, sha `______` | `______` | `____` | ☐ stopwatch ☐ timeline |
| | | | | | | | |

---

## 7. Reverse proof (AI path switched off)

Two methods; choose one at freeze and record which (report + corrections file if it is decided later).

| # | Method | Steps | What proves it worked |
|---|---|---|---|
| 1 | Disable the tools | `GET /ai/governance/policy` for the current shape, then `PUT /ai/governance/policy` setting each tool used in the session to `enabled=false`, body copied from the GET shape, no invented fields. Then try a write with the same account | The gate refuses it; the audit row shows `outcome=refused`, reason `tool_enabled` |
| 2 | Withdraw the entry point | Remove the assistant entry from the user's role, if the deployment supports it | The user sees no entry |

- After the shutdown, the **same task list** runs as the manual group.
- If neither is possible (no policy write permission, no role to withdraw), write verbatim: 「本部署无 AI 路径开关，反向可证未做」. Never write “done” for something not done.
- Sequencing note (recommendation): the shutdown disables the AI path, so run it after the AI sessions; if it is done first and the tools are re-enabled later, repeat the §2.4 pre-check.

Chosen method: ☐ 1 ☐ 2　·　Date / by: `__________`　·　Evidence (audit row id / screenshot): `__________`

---

## 8. Blank header and pre-session checklist

### 8.1 Header

| Item | Value |
|---|---|
| Project code / customer | `__________` |
| Intake date / by | `2026-__-__` / `__________` |
| Instance file (A9 row) | `yd43-instance-__________.md` |
| Frozen criteria SHA-256 | `377f52ea…aa26d9` |
| Timing instrument (whole session) | ☐ stopwatch ☐ recording timeline |
| `T_max` (A10) | `900` s — changed before freeze? ☐ no ☐ yes, to `____`, reason `__________` |
| Count unit (A11) | whole-session total |
| Time zone (A12) | `UTC+08:00` (or actual: `__________`) |

### 8.2 Checklist

- [ ] A9 fields 1–8 all written; no blank carried over without `未定` and a reason
- [ ] The case is ticked **per task** (T1–T5)
- [ ] Any case-B task carries the verbatim label 「这不是客户现行流程，是后台手工路径」 in the record sheet
- [ ] Any case-C task is pre-filled on the record sheet as: result `未完成`, note `做不到（能力不存在）`, time `900`, errors `+1`
- [ ] Instrument chosen once and recorded
- [ ] `T_max` is still 900, or the change was made before the instance freeze and written into A10
- [ ] Error tally block and help count are blank on the printed sheet
- [ ] Group schedule filled, order bias noted for any repeated person
- [ ] Reverse-proof method chosen, evidence location named
- [ ] Every `未定` is listed in 8.3 with who can decide it

### 8.3 Undecided list

| Field | Why still undecided | Who can decide |
|---|---|---|
| `__________` | `__________` | `__________` |

---

## 9. Writing conventions added by this kit (no criterion changed)

| # | Convention | Traceable to |
|---|---|---|
| 1 | Case C is recorded as result `未完成` plus note `做不到（能力不存在）`, not as `未测` | Frozen §4.1 reserves `未测（环境）` for §2.5 environment stops |
| 2 | Pausing is bounded by the user leaving the seat; a system hiccup with the user seated keeps the clock running | Frozen §5.2 lists only calls and leaving; §7.2 recovers the screen without letting the user restart |
| 3 | The manual group's prompt ledger is kept but does not enter the §5.6 formulas | Frozen §5.6 uses time and error counts only |
| 4 | The same error type occurring twice is charged twice | Frozen §5.3 charges per enumerated occurrence and requires each to trace to its own screen fact |
| 5 | Both groups use the same timing instrument (recommendation) | Frozen §5.2 requires consistency; §5.6 compares the two medians |

Everything else is quoted from the frozen copy. If a situation arises that neither the frozen copy nor this section covers, do not invent a rule: record it in `yd43-corrections-*.md` and ask the user to decide.

---

# Part II — 中文

## 0. 这份材料怎么用

本件是 B3 的采集与执行工具：先把「客户现行人工流程」问清楚并登记，再按冻结的 §5 跑人工对照组场次。分两段用：

1. **采集（可远程，也可现场；只与用户谈）。** 按用户口述填 §1。任何不知道的格子写 `未定`，不要写一个「看起来像答案」的值。
2. **场次（现场）。** §2 决定选中的情形在记录纸上怎么标注；§3 定计时；§4 定错误记法；§5 定算法；§6 定谁进哪一组；§7 登记反向可证。

填表人的硬规矩：

- **不替用户填流程。** 有没有人工流程、叫什么、谁在跑、数据在哪，只有用户和客户能定；代填等于把判据改成编出来的事实。
- **不假设有，也不假设没有。** 问出来、记下来，再按题目标情形。
- **A9 空着的后果是固定的**：§5.6 三条判定式算不出，项目级结论写 `对照口径未达成`。这是一个正确的结果，不是要遮掩的失败。
- **不动冻结层。** 本件不加题、不改阈值、不改通过线；本件自己补的几条落笔约定都在 §9 逐条列明，且都能追到冻结原文。

### 0.1 两个部分的关系

Part I 与 Part II 互为镜像。**一场只用一个语言**，不要混用；中文操作者从 Part II 打印。`EXAMPLE — replace`（Part I）与 `示例，请替换`（Part II）标出的每个值都是示例，不是读数。

---

## 1. 人工流程登记表（A9）

### 1.1 表头

| 项 | 值 |
|---|---|
| 项目代号 / 客户 | `__________` / `__________` |
| 填表人 / 日期 | `__________` / `2026-__-__` |
| 判据层 SHA-256 | `377f52ea…aa26d9`（与冻结记录核对） |
| 落点 | 实例件 A9 行（+ 记录纸场次头） |

### 1.2 登记字段

| # | 字段 | 怎么写 | 值 |
|---|---|---|---|
| 1 | 人工流程名称 | 一句话，陌生人凭这句话能找到它 | `__________` |
| 2 | 所用系统 / 载体 | 逐个点名：纸质单、Excel、老系统、微信群、电话。微信里一句口头批准也照实写 | `__________` |
| 3 | 操作人 | 岗位 / 代号；写明是否与 AI 组某位用户是同一人（决定 §6 怎么排） | `__________` |
| 4 | 是否客户现行流程 | **逐题**三选一：现行流程 / 后台手工路径 / 不存在。三种含义见 §2 | T1 ☐现行 ☐后台 ☐不存在 · T2 ☐ ☐ ☐ · T3 ☐ ☐ ☐ · T4 ☐ ☐ ☐ · T5 ☐ ☐ ☐ |
| 5 | 数据在哪 | 纸质归档、共享盘、老系统库、某个人的邮箱。对照要能重演、错误要能事后核对，都靠这一格 | `__________` |
| 6 | 五件事各自的现行做法 | 一题一句：谁 → 用什么 → 产出什么。对齐下面五个能力面；**不要改写题目** | T1 `__________`<br>T2 `__________`<br>T3 `__________`<br>T4 `__________`<br>T5 `__________` |
| 7 | 每件事粗估耗时 | 分钟数，**先验估计，不是读数**。若某件事要数小时，人工场次可能不可行，现在就要知道 | T1 `__` · T2 `__` · T3 `__` · T4 `__` · T5 `__` 分钟 |
| 8 | 人工组能否事后读出错误条数 | 流程若不留痕，六类错误就核不住；不能就写明，报告里作局限 | ☐ 能，留痕载体：`______`　☐ 不能，原因：`______` |
| 9 | 重演备注 | 电话批准、需要同事在场的步骤、季节性批次等，任何影响场次编排的事 | `__________` |

### 1.3 五件事的能力面（仅供对齐；可执行题卡以冻结 §3.1 的中文原文为准，本件不作翻译版）

| 题 | 能力面 |
|---|---|
| T1 | 发起一次写 + 说清结果状态 |
| T2 | 对别人的一次写做裁决（第二人批准 / 拒绝） |
| T3 | 按对象 + 区间整理出一份对外可用文件 |
| T4 | 定位一条审计证据（谁 / 何时 / 对象 / 改成了什么） |
| T5 | 分辨一笔没成操作的结局并归因 |

### 1.4 填写示例（示例，请替换每一个值）

| 字段 | 示例值 |
|---|---|
| 名称 | 门店拜访纸单 + 月底 Excel 汇总 |
| 系统 | 纸质拜访单 + 共享 Excel；审批走微信 |
| 操作人 | 采购专员（与 U1 同一人，间隔 ≥24 小时） |
| 是否现行 | T1 现行 · T2 现行 · T3 现行 · T4 不存在（没人留历史） · T5 现行 |
| 数据 | 纸单在文件柜；Excel 在共享盘 |
| 五件事 | T1 填纸单、回办公室录 Excel；T2 微信问主管；T3 月底拼 Sheet 发邮件；T4 问同事，无版本历史；T5 打电话问 IT |
| 粗估耗时 | T1 8 · T2 5 · T3 40 · T4 – · T5 10 分钟 |
| 能否读出错误 | T1–T3 Excel 有版本；T4 不能 |

---

## 2. 三种情形的判定与标注

冻结 §5.1 给了优先级；**情形可以逐题不同**，按题登记、按题标注记录纸。

| 情形 | 判定问句（问用户，不推断） | 记录纸上写什么（照抄原句） | A9 怎么填 | 怎么进 §5.6 |
|---|---|---|---|---|
| **A. 客户现行流程**（真对照） | 客户今天是不是就按这条路、由某个具名的人在办？ | 场次头 `组别 = 人工`；备注栏：`客户现行流程` | 填流程名、系统、操作人、数据位置 | 人工组，作真对照 |
| **B. 后台手工路径**（近似对照） | 没有现行流程，但产品后台的原生页面能不经助手手工做完这五件事？ | 场次头 `组别 = 人工`，**并在备注栏逐字写**：`这不是客户现行流程，是后台手工路径` | 记 `否，是后台手工路径` | 人工组，但报告里必须称它为近似对照；**不得**据此写「优于客户现行流程」 |
| **C. 能力本就不存在**（没有页面，也没有纸质做法） | 这一题既无现行流程，也无后台手工路径？ | 结果栏 `未完成`；备注 `做不到（能力不存在）`；用时 `900`；错误 `+1` | 记 `没有（该题记"做不到"）` | 人工组按上限计时并计 1 条错误，依冻结 §5.1 第 3 条 |

情形 C 的处置是冻结原文：人工组记「做不到」，按上限计时，计 1 条错误。**不要记成 `未测`** —— 冻结 §4.1 的 `未测（环境）` 只给 §2.5 的环境中止。

一场里可以逐题混用（例如 T1–T3 是 A、T4 是 C）。报告必须逐题写情形，不许把不同情形平均成一个标签。

---

## 3. 计时协议

### 3.1 定义与工具

| 项 | 规则（冻结 §5.2） | 本场取值 |
|---|---|---|
| 起点 | 主持人说「第 N 件，开始」的那**一刻**。读题时间不计；题卡在这句话**之前**放到用户面前 | `__________` |
| 终点 | 用户说「做完了」/「卡住了」/ 交回结果的那一刻；或到达上限 | `__________` |
| 工具 | 手机秒表**或**录屏时间轴。二选一，**整场不换**，记到秒 | ☐ 秒表　☐ 录屏时间轴 |
| `T_max` | 900 秒 / 题。**只能在实例层冻结前改**，写进 A10；冻结后不得改 | `900` 秒（A10） |
| 超时 | 即停；结果 `未完成（超时）`；用时记 `900` | — |
| 暂停 | 用户接电话、离场：停表，并在记录纸写明暂停起止 | — |
| 整场用时 | 五题用时之和，不含暂停 | — |

### 3.2 什么不算暂停

读题、§7.4 的等待（主持人至少等 2 分钟再开口）、等待页面恢复，都计入用时。分界线是**用户有没有离开座位**，不是系统有没有打嗝：人还坐着、只是重开浏览器，表继续走；人起身去找同事或去拿设备，按离场处理、记暂停。

### 3.3 一致性规矩

- 一场只用一种计时工具。中途换法，这一场的用时就不再可比。
- 用时记到秒；不许按分钟凑整，不许事后回忆估填。
- 主持人不得替用户宣布「做完了」；终点只认用户那句话或上限。
- 建议（不是判据）：两组用同一种计时工具，让两个中位数建立在同一只钟上。

---

## 4. 错误六类的记法 + 求助单列

### 4.1 六类（冻结 §5.3）

| # | 错误类型 | 记法 | 必须附的屏幕事实 |
|---|---|---|---|
| E1 | 对象选错（做在别的客户 / 记录上） | 1 条 | `__________` |
| E2 | 值写错（名称、金额、日期与口述不符） | 1 条 | `__________` |
| E3 | 漏做（一件事只做了一半） | 1 条 | `__________` |
| E4 | 范围错（导出区间 / 类型不对） | 1 条 | `__________` |
| E5 | 证据指错（指到的行与读数不符） | 1 条 | `__________` |
| E6 | 返工（主持人或读数要求重做） | 1 条 | `__________` |

追不到具体屏幕事实（记录纸 §6.2）的错误不算。同一次出现记一次；同一类型出现两次记两次，因为每次出现都是各自独立的屏幕事实。

### 4.2 计数块（每人一块）

| E1 | E2 | E3 | E4 | E5 | E6 | **错误合计** | **求助次数（不计错）** |
|---|---|---|---|---|---|---|---|
| `_` | `_` | `_` | `_` | `_` | `_` | `_` | `_` |

### 4.3 求助

- 求助**不是错误**，单独计数、单独呈现；绝不混进错误条数。
- 计的是整场（A11），与错误同一口径。
- 主持人只按 §7.3 的话术回答。若回答构成 P1–P4，同时记进提示台账；**人工组的提示台账只作过程事实，不进入 §5 的三条判定式**。

---

## 5. 中位数计算与三条判定式

### 5.1 单位

每位用户一个数，按整场合计取：总秒数（五题之和，不含暂停）与总错误条数（E1–E6）。不要先把一个人的五题平均。

### 5.2 中位数

排序；奇数取正中，偶数取两中位平均。秒保留 1 位小数，错误条数保留 1 位小数。

### 5.3 三条判定式（冻结 §5.4 / §5.6）

| 条款 | 判法 | 结论 |
|---|---|---|
| 不劣 · 耗时 | `median(AI 组整场秒数) ≤ median(人工组整场秒数)` | ☐ 成立 ☐ 不成立，Δ = `____` 秒 |
| 不劣 · 错误 | `median(AI 组错误条数) ≤ median(人工组错误条数)` | ☐ 成立 ☐ 不成立，Δ = `____` 条 |
| 更好 · 声明项 | `median(AI 组错误条数) < median(人工组错误条数)` | ☐ 成立 ☐ 不成立，Δ = `____` 条 |

三条**全成立**，对照口径才算达成；任一条不成立，原样写哪条不成立、差多少。

### 5.4 算例（示例，请替换每个值）

| 组 | 各用户整场秒数 | 中位数（秒） | 各用户错误条数 | 中位数 |
|---|---|---|---|---|
| AI | 640、900 | 770.0 | 1、2 | 1.5 |
| 人工 | 1200、700 | 950.0 | 2、3 | 2.5 |

耗时 770.0 ≤ 950.0 成立；错误不劣 1.5 ≤ 2.5 成立；错误更好 1.5 < 2.5 成立。三条**只对这两位用户**成立。

### 5.5 N 很小时的措辞红线

- 每组 1 人时，中位数就是那个人的数，照实说。
- N < 3 时，写出真实的 N，并加一句：`样本小，结论只对这 N 人成立`。
- 禁写：「优于人工流程」「效率提升 X%」「普遍适用」「证明产品更好」「整体通过」。对照只回答一个问题——事先声明的那一条对这几位具名的人成不成立——之外的一律不写。
- 结论由用户下；本件只算数，不下结论。

---

## 6. 组间设计

### 6.1 规则（冻结 §5.5）

- **优先用不同的人**做两组。
- 同一人做两组时：两组**间隔 ≥24 小时**、**当天只跑一组**、记录先做哪一组（顺序偏差写进报告），且两组用**不同对象实例**（不同客户 / 不同记录），不得复用同一对象。
- 两组使用**同一份冻结的 §3.1 任务清单**，只按 A16 换对象名词。
- 建议（不是判据）：人工组的操作人应当是真正做这件事的人；若只能由我方人员演示，报告里写明，作为局限。

### 6.2 场次排期（空表）

| 日期 | 时间 | 组别 | 用户 / 操作人 | 任务清单副本 | 对象实例 | 先后（同一人时） | 计时工具 |
|---|---|---|---|---|---|---|---|
| `2026-__-__` | `__:__` | ☐ AI ☐ 人工 | `______` | 冻结 §3.1，sha `______` | `______` | `____` | ☐ 秒表 ☐ 时间轴 |
| | | | | | | | |

---

## 7. 反向可证（关掉 AI 路径）

两法择一，按冻结时登记的为准（报告 + 需要时 corrections 文件）。

| # | 做法 | 步骤 | 什么能证明它生效 |
|---|---|---|---|
| 1 | 停用工具 | 先 `GET /ai/governance/policy` 取当前形状，再 `PUT /ai/governance/policy` 把本场用到的工具逐个 `enabled=false`（请求体照 GET 回来的形状写，不另造字段）。再以同一账号试一次写 | 被闸拒绝：审计行 `outcome=refused`，原因 `tool_enabled` |
| 2 | 撤入口 | 把用户角色上的助手入口撤掉（若部署支持） | 用户看不到入口 |

- 关断之后，**同一份任务清单**只走人工流程，记作对照组。
- 两者都做不到（无策略写权限 / 无角色可撤）时，逐字写：`本部署无 AI 路径开关，反向可证未做`。**不得**把「没做」写成「做了」。
- 排期注意（建议）：关断会停掉 AI 路径，所以放在 AI 组场次之后做；若先关后开，须重新做一次 §2.4 预检。

选定法：☐ 1 ☐ 2　·　日期 / 执行人：`__________`　·　证据（审计行 id / 截图）：`__________`

---

## 8. 空白表头与开跑前核对

### 8.1 表头

| 项 | 值 |
|---|---|
| 项目代号 / 客户 | `__________` |
| 采集日期 / 填表人 | `2026-__-__` / `__________` |
| 实例件（A9 行） | `yd43-instance-__________.md` |
| 判据层 SHA-256 | `377f52ea…aa26d9` |
| 计时工具（整场） | ☐ 秒表 ☐ 录屏时间轴 |
| `T_max`（A10） | `900` 秒 —— 冻结前改过？☐ 否 ☐ 是，改为 `____`，理由 `__________` |
| 计数口径（A11） | 整场合计 |
| 时区（A12） | `UTC+08:00`（或实际：`__________`） |

### 8.2 核对清单

- [ ] A9 第 1–8 项全部写出；没有「留空混过去」的格子，未定的写 `未定` 并给理由
- [ ] 情形**逐题**勾选（T1–T5）
- [ ] 情形 B 的题，记录纸上已逐字标注 `这不是客户现行流程，是后台手工路径`
- [ ] 情形 C 的题，记录纸已预填：结果 `未完成`、备注 `做不到（能力不存在）`、用时 `900`、错误 `+1`
- [ ] 计时工具只选一种并已登记
- [ ] `T_max` 仍是 900，或改动发生在实例层冻结前并已写进 A10
- [ ] 打印出来的记录纸上，错误计数块与求助次数是空的
- [ ] 组间排期已填；同一人做两组时，先后顺序已记
- [ ] 反向可证选法已定，证据位置已写
- [ ] 所有 `未定` 都已列进 8.3，并写明谁能定

### 8.3 未定清单

| 字段 | 为什么还未定 | 谁能定 |
|---|---|---|
| `__________` | `__________` | `__________` |

---

## 9. 本件补的落笔约定（不改判据）

| # | 约定 | 追到哪 |
|---|---|---|
| 1 | 情形 C 记 `未完成` + 备注 `做不到（能力不存在）`，不记 `未测` | 冻结 §4.1 把 `未测（环境）` 只留给 §2.5 的环境中止 |
| 2 | 暂停以「用户离开座位」为界；人坐着等页面恢复，计时继续 | 冻结 §5.2 只列接电话与离场；§7.2 的重开浏览器不让用户从头再找，属恢复环境 |
| 3 | 人工组的提示台账照记，但不进 §5.6 的三条判定式 | 冻结 §5.6 只用耗时与错误条数 |
| 4 | 同一类型错误出现两次记两次 | 冻结 §5.3 按每次枚举记 1 条，且要求每条追到各自的屏幕事实 |
| 5 | 两组用同一种计时工具（建议） | 冻结 §5.2 要求全场一致；§5.6 比较两个中位数 |

其余一律照冻结原文。遇到冻结件与本节都没覆盖的情形，**不要自行发明规则**：写进 `yd43-corrections-*.md`，请用户裁。
