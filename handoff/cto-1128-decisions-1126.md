# CTO Weekly 2026-11-28 · Decision Sheet — D1–D5 and N5 Criterion 5 Scoring Table / 2026-11-28 CTO 周会 · 决策单 —— D1–D5 与 N5 判据 5 判分表

## English

> **Purpose.** Turn the five open decisions in `handoff/cto-1128-packet.md` into one signable page per decision, and lay out the 12-cell scoring table for N5 criterion 5. This sheet formats the decisions; it does not make them.
>
> **Prepared.** 2026-11-26 (UTC+08), for the 2026-11-28 04:03 CTO weekly.
>
> **Boundary.** Read-only. This sheet does not change the packet, the weekly plan, the roadmap, the decision index or the claim table; does not contact anyone; does not commit or push; does not rule for any person. Every "suggested default" is a suggestion, not a ruling. A ruling exists only where a person signs the page.
>
> **Quotations.** Chinese source text is translated in this block; the verbatim Chinese wording appears in the Chinese block below. Locations are given for every quotation.
>
> **Numbering.** This sheet uses the packet's D1–D5. A separate material for the 2026-11-29 close-out uses a D1–D8 list from a different source; the two lists are not interchangeable. Cite the source whenever a D-number is quoted.
>
> **Sources.** `handoff/cto-1128-packet.md` (11-26 12:52); `handoff/n5-verdict-1126.md` (11-26 12:49); `handoff/n5-closeout-1126.md` (11-26); `handoff/v1230-release-plan-1126.md` (11-26, unexecuted); `handoff/w14-ready-1126.md` (11-26 12:33–12:45).

### How to use this sheet

- Each decision page has: the packet question, the evidence level, 2–3 options including the status quo, a falsifiable consequence per option, a suggested default marked "suggestion, not a ruling", a blank ruling line, and a final "if not ruled" line matched to the packet question.
- Do not read a suggested default as a ruling. The blank ruling line is the only place a decision becomes binding.
- Part 2 lists both possible rulings for criterion 5 and their consequences. The scorer marks one; this sheet does not mark it.

### Index

| ID | Decision | Evidence level | Suggested default (not a ruling) |
|---|---|---|---|
| D1 | N5 criterion 5: written ruling on the two "what changed to" cells | E3 ceiling; criterion 4 unproven | Keep the status quo until the scorer signs |
| D2 | App-X: open a VM window for one real compile before 12-05? | E2 mock; E0 real compile | Keep the documentation-only file to 12-05 |
| D3 | N9: 12-05 criterion — one `compile` success or one real compile? | E1 | Take the minutes' wording (`compile` success) |
| D4 | W1.4: if tonight fails, open a "third failure" decision? | No time-to-green reading yet | Keep the status quo; decide on the result at 11-28 |
| D5 | 4J cross-day bump: deviation record or violation? | E3 | Record as a deviation, with the distinction written |

---

## Part 1 — Decision pages

### D1 · N5 criterion 5: the written ruling

**Packet question (translated).** Whether the scorer will rule in writing that the two "what changed to" cells count as business answers — if not ruled, "recorded as passed" and "criterion 5 undetermined" coexist long-term.

**Evidence level.** E3 ceiling; no E4. Criteria 1/2/3 have checkable readings, each with a qualification (1: person level not established; 2: file specification established, attribution unproven; 3: readings outside the session window); criterion 4 is not established (no evidence); criterion 5 is pending. The five criteria are not all met.

**Already settled (not reopened).** Path A was selected on 11-26: accept the 11-25 ruling and write the evidence boundary; no re-run (B), no downgrade (C). The §11.3 internal-record wording is for the weekly-plan owner to merge; this sheet does not write it. The nine missing items in closeout §5 are marked "already ruled, not to be filled" and kept on file.

**Options.**

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Keep the status quo** | No written ruling. The record layer keeps "passed"; the evidence layer keeps "criterion 5 pending" beside it. | Falsified if any citation of "N5 passed" appears without the four boundary sentences in verdict §11.2. Observable in the plan and the archive. |
| **B. Rule the two cells as business answers** | The scorer signs that the verbatim copy satisfies the cell-specific rule (answer key §2/§3); criterion 5 is established. | Falsified if the product's fixed sentence for "new" changes, or if the ruling is treated as established without the scorer's signature. If ruled: criterion 5 passes; criterion 4 remains unproven; the five are still incomplete; ceiling stays E3; no acceptance claim. |
| **C. Rule the two cells as unrecorded** | The scorer signs that the reader's self-marked "empty" triggers the general rule (answer key §7); criterion 5 is not established. | Falsified if the scorer finds §2 is the exclusive rule for that cell and the verbatim copy satisfies it. If ruled: criterion 5 is undetermined; the five are still incomplete; "recorded as passed" coexists with "criterion 5 not established"; the top line is unchanged because criterion 4 is already unproven. |

**Suggested default (suggestion, not a ruling).** A — keep the status quo until the scorer signs. Only the scorer can make this ruling; the meeting should not substitute for the scorer.

**Ruling line (signed by the scorer, not the chair).** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** The packet's question stands: "recorded as passed" and "criterion 5 undetermined" coexist long-term; "N5 passed" remains at the ruling layer and cannot support any external or delivery claim.

---

### D2 · App-X maintenance file to 12-05

**Packet question (translated).** Before the 12-05 review, should one real compile get its own VM window, or should the documentation-only file stand and not be chased?

**Evidence level.** E2 — mock three cases on two PowerShell versions. Real compile: E0 (not run).

**Unverified.** Real HBuilderX compile not run; guard branch not pushed or merged (main still `cc8b1a3`); VM hung and not power-cycled; runner offline; repository variable 0.

**Options.**

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Keep the documentation-only file to 12-05** | No VM window. | At 12-05 there is no real-compile reading; renewal rests on E2 mock only; the item "real compile not run" persists. Observable: no compile log or artifact dated before 12-05. |
| **B. Open one VM window before 12-05 and run one real compile** | One dated compile attempt, result recorded. | Observable: a compile log or artifact from the VM. If it fails, the premise "mock green implies real green" is falsified and the file must record a red; if it passes, the item "real compile not run" can be closed for that commit (not a general proof). |
| **C. Defer the choice to the 12-05 review** | No decision now; decide on VM and runner state at the review. | Falsified if the 12-05 review passes without deciding the item. No new reading in the meantime. |

**Suggested default (suggestion, not a ruling).** A — keep the documentation-only file to 12-05. The VM is hung and power-cycling is a separate risk; the mock covers the guard logic; a real compile is a chain check. B is the only way to close the E0 item before 12-05.

**Ruling line.** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** The 12-05 review faces the same question with no fresh compile reading; the file's basis stays E2; the VM's hung state remains unaddressed.

---

### D3 · N9 review criterion on 12-05

**Packet question (translated).** Should the 12-05 review criterion take the minutes §12 P0-E wording — one `compile` success — or one real compile?

**Evidence level.** E1 — the 11-23 reading plus the 11-26 recheck (still offline).

**Unverified.** The runner recovery path has not been drilled (open the VM, then `gh variable set … --body true`).

**Options.**

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Criterion = one `compile` success (as written)** | Keep the minutes' wording. | Observable only when the `android-compile` job is actually dispatched and succeeds. With the runner offline and the repository variable at 0, no compile job can be dispatched, so the criterion is unobservable until the runner is online. If 12-05 arrives with no job dispatched, the criterion is not met and not observable. |
| **B. Criterion = one real compile** | Raise the bar to a real compile. | Observable as a real compile log or artifact, not just a CI job success; requires a working Windows runner and more setup. If the runner is offline, not met. |
| **C. Keep the status quo: no criterion change now** | Decide at 12-05 on the runner state. | Falsified if 12-05 passes without a criterion. Risk: the review re-litigates the question. |

**Suggested default (suggestion, not a ruling).** A — keep the minutes' wording. Changing a review criterion is a scope change and should be explicit. Note that the wording is unobservable until the runner is online.

**Ruling line.** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** The 12-05 review has no agreed criterion; renewal or exit of the maintenance file cannot be judged; N9 stays "runner offline, gate configured closed".

---

### D4 · W1.4 third window

**Packet question (translated).** If tonight's window still does not run, should W1.4 get a separate decision as a "third failure"?

**Evidence level.** None for time-to-green — the window has no result yet. The readiness readings are point-in-time checks, not measurements.

**Unverified.** Whether both rounds complete; whether time-to-green has a reading; whether T0 is valid; whether "turn off display = never" is set by 20:10.

**Options.**

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Keep the status quo** | No pre-set rule; wait for tonight's result and decide on the facts at 11-28. | Expectation: the result is known by 11-28 and can be judged then. Falsified if the result is not known by 11-28 (the session does not run or does not report), leaving no basis for an ad hoc decision. |
| **B. Pre-set: a missed or failed window is a "third failure"** | If the author does not answer "present" by 22:30 or the window is missed, open a decision (reschedule / change owner / pause). | Falsified if the trigger occurs and no decision item is created. Also falsified as a fair rule if it labels author absence as a measurement failure — the first two failures were author absence, not technical. |
| **C. Pre-set, with classification** | Distinguish "window missed" (author absence, non-technical) from "measurement failed" (technical or gate red); only the latter counts as a "third failure". | Observable: the record labels the outcome as "window missed" or "measurement failed" at 22:30. Falsified if the record carries no label, or if the evidence cannot distinguish the two causes. |

**Suggested default (suggestion, not a ruling).** A — keep the status quo. By 11-28 the result is known; a pre-set rule may conflate the two failure types. If the meeting wants a standing rule, C is the more precise form.

**Ruling line.** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** If tonight is missed again, 11-28 has no disposal rule; whether to schedule a fourth window has no basis; W1.4 remains unproven and "third attempt" is undefined.

---

### D5 · 4J cross-day bump: deviation record or violation

**Packet question (translated).** Should the 4J cross-day bump be handled as a "deviation record" or as a "violation"?

**Evidence level.** E3 — CI readings plus a local build. The local full `release-gate.sh` was not run (it writes `src/migrations/`; the same SHA ran in CI).

**Unverified.** Whether the CT-4 cross-day deviation is separately recorded in the minutes (the 11-24 host CT-4 is already recorded as a VIOLATION; the 11-25 4J case is the cross-day type); the main repo `KeelBase` README matrix's 4J row still shows the old version (outside the 4J task scope; a separate item).

**Options.**

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Record as a deviation** | A dated deviation line in the minutes, naming the cross-day shape and the correct direction. | Observable: the line exists and future cross-day cases cite it. Falsified if the minutes cannot state the distinction from the 11-24 VIOLATION, or if a later audit treats the same shape as a violation without explanation. |
| **B. Record as a violation** | A VIOLATION entry, the same treatment as the 11-24 host CT-4. | Observable: the entry exists. Falsified if the entry cannot specify which rule was violated, given that the direction was correct, CI was green and the snapshot had zero changes. |
| **C. Keep the status quo: no separate record** | Leave the item to the next CT-4 audit. | Observable: the 4J item is absent from the minutes. Falsified if a later audit reconstructs the record and finds no basis; risk of "selective recording". |

**Suggested default (suggestion, not a ruling).** A — record as a deviation, with the distinction from the 11-24 host VIOLATION written in the same line. The direction was correct, CI was green and the snapshot had zero changes. If the minutes cannot state that distinction, B is the fallback.

**Related, not on this sheet.** `v1230-release-plan-1126.md` §6 lists three pending decisions (window time; Release page scope; host pin in the same window). They are not part of D1–D5; this page does not rule on them.

**Ruling line.** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** The 4J cross-day bump stays unrecorded; the next CT-4 audit finds it neither deviation nor violation; the v1.23.0 / 4J 0.1.21 release chain proceeds with a blank in the historical account.

---

## Part 2 — N5 criterion 5: 12-cell scoring table

### Scope

Criterion 5 asks whether all six questions have business answers for both objects A and B, with no "not recorded" or "needs explanation" cell. The 12 cells are two objects × six questions. Ten cells are answered; the two contested cells are "what changed to" for A and B, where the reader copied the product's fixed sentence and also self-marked the cell "empty (the specific change was not recorded)".

### The rule conflict, with locations

| Rule | What it says | Location | What it does here |
|---|---|---|---|
| Cell-specific rule | "New: there was no before, and this write itself did not record field values" is the cell's established shape; a verbatim copy counts as established; the cell's unrecorded condition is "space / —". | `handoff/n5-pack-1121/answer-key.md` §2 (A), §3 (B) | **Allows** the two cells: the reader copied the sentence, so the cell is established. |
| General rule | "Not recorded" / "did not record" / "—" implies not met; a blank cell is treated as empty, not passed. | `handoff/n5-pack-1121/answer-key.md` §7 | **Triggers** on the same sentence ("did not record") and on the reader's self-mark "empty". |

The two rules conflict on this cell. The verdict's own inclination is "not established" (`handoff/n5-verdict-1126.md` §7.3); it is recorded here as context, not as this sheet's ruling. Both readings have textual support; the scorer decides.

### Table 1 — the 12 cells

| # | Object · question | Reader's answer (translated) | Answer key (location) | Reading | Ruling (established / not established) |
|---|---|---|---|---|---|
| A1 | A · Who | Zhou Min (account #1) | `<host directory name> (account #1)` — §2 | Answered | |
| A2 | A · When | 2026-11-22 09:50:47 UTC+08:00 | Complete to the second, with time zone — §2 | Answered | |
| A3 | A · Which business object | Customer · #1 · N**** · still there | Business name + primary key; the name may be masked — §2 | Answered | |
| A4 | A · What changed to | "New: there was no before, and this write itself did not record field values" / self-marked "empty (the specific change was not recorded)" | Verbatim copy = established; unrecorded condition = "space / —" — §2 | **Reader self-marked "empty" — contested** | |
| A5 | A · Who confirmed | Zhou Min confirmed this write (self-confirmed; the client did not record it) | `… confirmed this write (self-confirmed; the client did not record it)`, naming the person — §2 | Answered | |
| A6 | A · Result | Executed · really executed, the write is already in the system | Verbatim copy — §2 | Answered | |
| B1 | B · Who | Zhou Min (account #1) | `<initiator> (account #1)` — §3 | Answered | |
| B2 | B · When | 2026-11-22 09:51:41 UTC+08:00 | Execution time, with time zone — §3 | Answered | |
| B3 | B · Which business object | Example follow-up record · #1 · E**** · still there | `Example follow-up record · #F` — §3 | Answered | |
| B4 | B · What changed to | "New: there was no before, and this write itself did not record field values" / self-marked "empty (the specific change was not recorded)" | Same sentence; the executed row follows the runtime record — §3 | **Reader self-marked "empty" — contested** | |
| B5 | B · Who confirmed | Li Jing approved this write (second person, not the operator) | Same as left — §3 | Answered | |
| B6 | B · Result | Executed · really executed, the write is already in the system | Same as left — §3 | Answered | |

### Table 2 — the two rulings and their consequences

| Ruling on criterion 5 | Basis | Consequence |
|---|---|---|
| **Established (pass)** | Answer key §2/§3 cell-specific rule: the verbatim sentence is the established shape; the cell's unrecorded condition is "space / —", not this sentence. | Criterion 5 passes. Criteria 1/2/3 remain qualified, criterion 4 remains unproven; the five are still incomplete; ceiling stays E3; no acceptance claim. |
| **Not established (criterion 5 undetermined)** | Answer key §7 general rule: "not recorded" / "did not record" / "—" implies not met; a blank cell is treated as empty, not passed. Plus the reader's self-mark "empty" and the reader's §5 statement. | Criterion 5 is undetermined. The five are still incomplete; "recorded as passed" coexists with "criterion 5 not established"; the top line is unchanged because criterion 4 is already unproven. |

### Edge item and product observation (separate, not merged)

- **Edge item.** B's list action word "upgrade customer to joint review" differs from the six-question and CSV "new". The verdict records it as a product wording inconsistency; §7 does not contain "needs explanation", so it does not automatically trigger. The scorer may list it separately.
- **Product observation (not a criterion).** The six questions and the CSV header say "what changed to (before → after)", but for a new object the product answer is "there was no before, and this write itself did not record field values" — both sides are absent. This is a readability gap in the audit page for the "new" case. If fixed later, it is a separate item and must not retroactively pass this session.

---

## Part 3 — Cross-check and sign-off register

### Packet question → page → if not ruled

| ID | Packet question (short) | Page | If not ruled |
|---|---|---|---|
| D1 | Two criterion-5 cells as business answers? | D1 | "Passed" and "criterion 5 undetermined" coexist long-term; no external claim. |
| D2 | Real-compile VM window before 12-05? | D2 | 12-05 review has no fresh compile reading; basis stays E2. |
| D3 | 12-05 criterion: `compile` success or real compile? | D3 | No agreed criterion; renewal or exit cannot be judged. |
| D4 | If tonight fails, a "third failure" decision? | D4 | If missed again, no disposal rule; "third attempt" undefined. |
| D5 | 4J cross-day bump: deviation or violation? | D5 | Stays unrecorded; next audit finds neither; historical account blank. |

### Sign-off register

| ID | Ruling (A / B / C) | Signed by | Date |
|---|---|---|---|
| D1 | | | |
| D2 | | | |
| D3 | | | |
| D4 | | | |
| D5 | | | |

### What this sheet does not do

- It does not change the packet, the weekly plan, the roadmap, the decision index or the claim table.
- It does not contact anyone, commit, push, start a stack or trigger CI.
- It does not rule for the scorer or for the CTO; the ruling lines stay blank until a person signs.
- It does not assert an acceptance conclusion. The forbidden phrases remain forbidden: E4, acceptance passed without qualification, evidence complete, independent reproduction, independent human approval.

### Sources

- `handoff/cto-1128-packet.md` — D1–D5, evidence levels, unverified items, the five questions.
- `handoff/n5-verdict-1126.md` — criteria 1–5, §7 cell table, §11 path A, the four boundary sentences.
- `handoff/n5-closeout-1126.md` — evidence inventory, hashes, missing-item list.
- `handoff/v1230-release-plan-1126.md` — D5-related release chain, §6 pending decisions.
- `handoff/w14-ready-1126.md` — D4 readiness readings, blockers, runbook.

---

## 中文

> **用途。** 把 `handoff/cto-1128-packet.md` 中仍开着的五个决定，收敛为「一页一决定」的可签字页；并附 N5 判据 5 的 12 格判分表。本件只做格式与并列，不做裁定。
>
> **成稿。** 2026-11-26（+08），供 2026-11-28 04:03 CTO 周会。
>
> **边界。** 只读。不改 packet、周计划、roadmap、决定索引、认领表；不 contact 任何人；不 commit、不 push；不替任何人下裁定。所有「建议默认值」都标「建议，非裁定」；只有人签在「裁定」行上，才算裁定。
>
> **引文。** 中文原文在本块；英文块为译文，逐条给位置。
>
> **编号。** 本件沿用 packet 的 D1–D5。另有一份面向 2026-11-29 收口的 D1–D8 清单，来源不同，两套编号不可互换；会上引用 D 编号时须带来源。
>
> **单源。** `handoff/cto-1128-packet.md`（11-26 12:52）；`handoff/n5-verdict-1126.md`（11-26 12:49）；`handoff/n5-closeout-1126.md`（11-26）；`handoff/v1230-release-plan-1126.md`（11-26，未执行）；`handoff/w14-ready-1126.md`（11-26 12:33–12:45）。

### 怎么用

- 每个决定页含：packet 问题原文、证据等级、2–3 个方案（含「维持现状」）、每个方案的可证伪后果、建议默认值（标「建议，非裁定」）、一行空白裁定、末尾一句「若不裁的后果」，与 packet 的问题一一对应。
- 「建议默认值」不是裁定。只有「裁定」行上有人签字，才生效。
- 第二部分的判分表并列两种裁定及各自后果；由判分人勾选，本件不勾。

### 索引

| 编号 | 决定 | 证据等级 | 建议默认值（建议，非裁定） |
|---|---|---|---|
| D1 | N5 判据 5：「改成什么」两格的书面裁定 | 上限 E3；判据 4 无证 | 维持现状，直到判分人签字 |
| D2 | App-X：12-05 前是否为真实编译单开 VM 窗口 | E2 mock；真实编译 E0 | 维持文档档至 12-05 |
| D3 | N9：12-05 判据取一次 `compile` success 还是真实编译 | E1 | 照纪要原文（`compile` success） |
| D4 | W1.4：今晚再失败是否另立「第三次失败」决定 | 尚无 time-to-green 读数 | 维持现状；11-28 看结果再议 |
| D5 | 4J 跨日 bump：偏差登记还是违规 | E3 | 按偏差登记，并写明区别 |

---

## 第一部分 —— 决定页

### D1 · N5 判据 5：书面裁定

**问题原文（packet §二 D1）。** 「判据 5 的两格是否由判分人书面裁定为「业务答案」——不裁则「记录为通过」与「判据 5 未定」长期并存？」

**证据等级。** 上限 E3，无 E4。判据 1/2/3 有可核读数，但各带限定（1 人级不成立；2 文件规格成立、归属无证；3 读数不在场次窗口内）；判据 4 不成立（无证）；判据 5 待裁。五条不全。

**已定，不重开。** 11-26 已选路径 A：接受 11-25 裁定并写明证据边界；不补跑（B）、不降级（C）。§11.3 的对内记录文字由周计划属主决定是否并入 N5 行，本件不代写。closeout §5 的 9 项缺件标「已裁不补」，只留档。

**方案与可证伪后果。**

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 维持现状** | 不作书面裁定；记录层继续「记为通过」，证据层并列「判据 5 未定」。 | 若任何「N5 通过」的引用未同时带判定包 §11.2 的四句边界，即证伪。可在周计划与归档中观察。 |
| **B. 裁定两格为「业务答案」** | 判分人签字：原句照录满足该格专属规则（答案键 §2/§3）；判据 5 成立。 | 若产品对「新建」的固定句改变，或未经判分人签字就被当作成立，即证伪。裁定后的后果：判据 5 通过；判据 4 仍无证；五条仍不全；上限仍 E3；不得称验收通过。 |
| **C. 裁定两格为「未记录」** | 判分人签字：读者自标「空」触发通则（答案键 §7）；判据 5 不成立。 | 若判分人认定 §2 是该格专属规则、且原句照录已满足，即证伪。裁定后的后果：判据 5 未定；五条仍不全；「记为通过」与「判据 5 未定」并存；顶线不变，因判据 4 已无证。 |

**建议默认值（建议，非裁定）。** A —— 维持现状，直到判分人签字。这一裁定只能由判分人做，会上不应代判。

**裁定行（由判分人签，不由主持人代签）。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** packet 的问题原样留着：「记录为通过」与「判据 5 未定」长期并存；「N5 通过」停在裁定层，不能支撑任何对外或交付声明。

---

### D2 · App-X 维护档到 12-05

**问题原文（packet §二 D2）。** 「12-05 复核前，是否为「真实编译跑一次」单独开一次 VM 窗口，还是维持文档档不追？」

**证据等级。** E2 —— mock 三例，两个 PowerShell 版本；真实编译 E0（未跑）。

**未核项。** 真实 HBuilderX 编译未跑；守卫分支未推未合（main 仍 `cc8b1a3`）；VM 卡死未断电源；runner offline；仓库变量 0。

**方案与可证伪后果。**

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 维持文档档至 12-05** | 不开 VM 窗口。 | 12-05 时无真实编译读数；续期依据只剩 E2 mock；「真实编译未跑」一项仍在。可观察：12-05 前没有编译日志或产物。 |
| **B. 12-05 前开一次 VM 窗口，跑一次真实编译** | 一次带日期的编译尝试，结果入档。 | 可观察：VM 上的编译日志或产物。若失败，则「mock 绿 ⇒ 真实绿」的前提被证伪，维护档须记红；若通过，「真实编译未跑」可在该提交上关闭（不是普遍证明）。 |
| **C. 把选择推到 12-05 复核** | 现在不裁，复核时按 VM / runner 状态定。 | 若 12-05 复核未就该事项作出决定，即证伪。期间没有新读数。 |

**建议默认值（建议，非裁定）。** A —— 维持文档档至 12-05。VM 当前卡死，强断是另一项风险；mock 已覆盖守卫逻辑；真实编译属链路验证。B 是 12-05 前关掉 E0 一项的唯一办法。

**裁定行。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** 12-05 复核将再次面对同一问题，且没有新的编译读数；维护档依据仍停在 E2；VM 卡死状态仍未处理。

---

### D3 · N9 的 12-05 复核判据

**问题原文（packet §二 D3）。** 「12-05 复核的判据取纪要 §十二 P0-E 的「一次 `compile` success」，还是一次真实编译？」

**证据等级。** E1 —— 11-23 读数 + 11-26 复核（仍 offline）。

**未核项。** runner 恢复路径未演练（需先开 VM，再 `gh variable set … --body true`）。

**方案与可证伪后果。**

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 判据 = 一次 `compile` success（照纪要原文）** | 不改判据。 | 只有 `android-compile` 作业真正派发并 success 时才可观察。当前 runner 离线、仓库变量为 0，编译作业无法派发，故 runner 上线前该判据不可观察；若 12-05 时仍无作业派发，判据未达成且不可观察。 |
| **B. 判据 = 一次真实编译** | 把门槛抬到真实编译。 | 可观察为真实编译日志或产物，而不只是 CI 作业 success；需要可用的 Windows runner 与更多准备。runner 离线则未达成。 |
| **C. 维持现状：现在不改判据** | 12-05 按 runner 状态再定。 | 若 12-05 过去仍未定判据，即证伪。风险：复核时重新争一遍。 |

**建议默认值（建议，非裁定）。** A —— 照纪要原文。改复核判据属范围变更，应当明说。但须注意：runner 上线前，该判据不可观察。

**裁定行。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** 12-05 复核没有商定的判据；维护档续期或退出无法判定；N9 仍停在「runner 离线、闸已配置关闭」。

---

### D4 · W1.4 第三次窗口

**问题原文（packet §二 D4）。** 「若今晚仍未跑成，W1.4 是否按「第三次仍失败」另立决定？」

**证据等级。** 无 time-to-green 读数 —— 窗口尚无结果。就绪读数是一次性检查，不是测量。

**未核项。** 两轮是否跑完；time-to-green 是否有读数；T0 是否有效；「关闭显示器=从不」是否已在 20:10 设好。

**方案与可证伪后果。**

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 维持现状** | 不预设规则；等今晚结果，11-28 按事实再议。 | 预期：11-28 时结果已知，可当场判。若 11-28 时结果仍未知（会话未跑或未汇报），即证伪，且没有临时裁定的依据。 |
| **B. 预设：窗口错过或测量失败都算「第三次失败」** | 若 22:30 前作者未回「在场」或窗口错过，即立决定（改排期 / 换责任人 / 暂停）。 | 若触发条件成立而未生成决定项，即证伪。若把「作者缺席」与「测量失败」混为一谈，作为规则也不成立 —— 前两次失败都是作者缺席，不是技术原因。 |
| **C. 预设，但分类** | 区分「窗口错过」（作者缺席、非技术）与「测量失败」（技术或门红）；只有后者算「第三次失败」。 | 可观察：22:30 的记录把结果标为「窗口错过」或「测量失败」。若记录没有标签，或证据分不清两种原因，即证伪。 |

**建议默认值（建议，非裁定）。** A —— 维持现状。到 11-28 时结果已知；预设规则可能把两种失败混为一谈。若会上要一条常设规则，C 是更精确的形态。

**裁定行。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** 若今晚再次错过，11-28 仍无处置口径；是否排第四次窗口没有依据；W1.4 仍未证，「第三次尝试」也没有定义。

---

### D5 · 4J 跨日 bump：偏差登记还是违规

**问题原文（packet §二 D5）。** 「4J 跨日 bump 按「偏差登记」还是按「违规」处理？」

**证据等级。** E3 —— CI 读数 + 本地构建；本机全量 `release-gate.sh` 未跑（会写 `src/migrations/`；同一 SHA 的 CI 已跑）。

**未核项。** 4J 抬 pin 的 CT-4 跨日偏差是否在纪要里单独登记（11-24 的宿主 CT-4 已记为 VIOLATION；11-25 的 4J 是跨日型）；主仓 `KeelBase` README 矩阵的 4J 行仍写旧版本（不在 4J 任务范围，属单独事项）。

**方案与可证伪后果。**

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 按「偏差登记」** | 在纪要里落一行带日期的偏差记录，写明「跨日型」与「方向对」。 | 可观察：该行存在，日后同类跨日案例引用它。若纪要写不清与 11-24 VIOLATION 的区别，或日后审计把同一形态按违规处理而不解释，即证伪。 |
| **B. 按「违规」** | 记一条 VIOLATION，与 11-24 宿主 CT-4 同处理。 | 可观察：该条存在。若该条指不出被违反的是哪条规则（方向对、CI 绿、快照 0 变化），即证伪。 |
| **C. 维持现状：不单独登记** | 留给下一次 CT-4 审计。 | 可观察：纪要中没有 4J 这一条。若日后审计重建记录时找不到依据，即证伪；风险是「选择性记录」。 |

**建议默认值（建议，非裁定）。** A —— 按偏差登记，并在同一行写明与 11-24 宿主 VIOLATION 的区别。方向对、CI 绿、快照 0 变化。若纪要写不清这一区别，退回 B。

**关联但不属于本页。** `v1230-release-plan-1126.md` §6 另有三项待决（窗口时间；Release 页范围；宿主 pin 是否同窗），不在 D1–D5 之内，本页不代裁。

**裁定行。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** 4J 跨日 bump 在纪要中没有记录；下一次 CT-4 审计时，这一条既不是偏差也不是违规；v1.23.0 / 4J 0.1.21 发布链继续推进，历史账目留空。

---

## 第二部分 —— N5 判据 5 判分表

### 范围

判据 5 要求：对象 A、B 的六问逐格都有业务答案，不得出现「未记录 / 需解释」。共 12 格 = 两对象 × 六问。10 格有答；争点是 A、B 的「改成什么」两格 —— 读者抄了产品固定句，又在词性列自标「空（具体改动没记）」。

### 两条规则的原文与位置

| 规则 | 原文 | 位置 | 在本格的作用 |
|---|---|---|---|
| 专属规则 | 「新建：没有改前，而这次写本身也没有记下字段值」被明文列为本格的「成立」形状；判「成立」= 原句照录；该格的未记录条件写的是「空格 / —」。 | `handoff/n5-pack-1121/answer-key.md` §2（A）、§3（B） | **允许**两格：读者照录该句 ⇒ 该格成立。 |
| 通则 | 「出现 `未记录` / `没有记下` / `—` ⇒ 未达成」「空白格按『空』处理，不是通过」。 | `handoff/n5-pack-1121/answer-key.md` §7 | **触发**同一句（含「没有记下」），也触发读者自标的「空」。 |

两条规则在本格字面冲突。判定包自身的倾向是「不成立」（`handoff/n5-verdict-1126.md` §7.3）；此处只作为背景列出，不是本件的裁定。两种读法都有文本依据，由判分人裁。

### 表一 —— 12 格逐格

| # | 对象·格 | 读者原文 | 答案键原文（位置） | 读数 | 判分（成立 / 不成立） |
|---|---|---|---|---|---|
| A1 | A · 谁 | 周敏（账号 #1） | `<宿主名录名字>（账号 #1）` —— §2 | 有答 | |
| A2 | A · 何时 | 2026-11-22 09:50:47 UTC+08:00 | 完整到秒、带时区 —— §2 | 有答 | |
| A3 | A · 哪个业务对象 | 客户 · #1 · 新**** · 还在 | 业务名 + 主键，名字可掩码 —— §2 | 有答 | |
| A4 | A · 改成什么 | 新建：没有改前，而这次写本身也没有记下字段值 ／ 词性自标「空（具体改动没记）」 | 原句照录 = 成立；该格未记录条件 = 「空格 / —」 —— §2 | **读者自标「空」——待裁** | |
| A5 | A · 谁确认 | 周敏 确认了这次写（本人确认；客户端未记） | `… 确认了这次写（本人确认；客户端未记）`，点名本人 —— §2 | 有答 | |
| A6 | A · 结果 | 已执行 · 真的执行了，写已经在系统里 | 原句照录 —— §2 | 有答 | |
| B1 | B · 谁 | 周敏（账号 #1） | `<发起人>（账号 #1）` —— §3 | 有答 | |
| B2 | B · 何时 | 2026-11-22 09:51:41 UTC+08:00 | 执行时刻，带时区 —— §3 | 有答 | |
| B3 | B · 哪个业务对象 | 示例跟进记录 · #1 · E**** · 还在 | `示例跟进记录 · #F` —— §3 | 有答 | |
| B4 | B · 改成什么 | 新建：没有改前，而这次写本身也没有记下字段值 ／ 词性自标「空（具体改动没记）」 | 同句；执行行按运行时记录 —— §3 | **读者自标「空」——待裁** | |
| B5 | B · 谁确认 | 李静 批准了这次写（第二人，不是操作者本人） | 同左 —— §3 | 有答 | |
| B6 | B · 结果 | 已执行 · 真的执行了，写已经在系统里 | 同左 —— §3 | 有答 | |

### 表二 —— 两种裁定及各自后果

| 判据 5 的裁定 | 依据 | 后果 |
|---|---|---|
| **判成立（通过）** | 答案键 §2/§3 专属规则：原句照录即该格的「成立」形状；该格的未记录条件是「空格 / —」，不是这句话。 | 判据 5 通过。判据 1/2/3 仍各带限定，判据 4 仍无证；五条仍不全；上限仍 E3；不得称验收通过。 |
| **判不成立（判据 5 未定）** | 答案键 §7 通则：「未记录」/「没有记下」/「—」⇒ 未达成；空白格按「空」处理，不是通过。另加读者自标「空」与读者报告 §五 的自述。 | 判据 5 未定。五条仍不全；「记为通过」与「判据 5 未定」并存；顶线不变，因判据 4 已无证。 |

### 边缘项与产品观察（单列，不并入两格）

- **边缘项。** B 的列表动作词「升级客户到会审」与六问/CSV 的「新建」不一致。判定包把它记为产品文案不一致；§7 没有「需要解释」字样，故不自动触发。判分人可单列。
- **产品观察（不是判据）。** 六问与 CSV 列头都写「改成什么（改前 → 改后）」，而新建对象的产品答案是「没有改前，而这次写本身也没有记下字段值」—— 两侧都不给。这是审计页在「新建」场景的可读性缺口；日后修复应另立条目，不能倒推本场通过。

---

## 第三部分 —— 与 packet 五问对照、签字登记

### packet 问题 → 页 → 若不裁

| 编号 | packet 问题（简） | 页 | 若不裁的后果 |
|---|---|---|---|
| D1 | 判据 5 两格是否算业务答案 | D1 | 「通过」与「判据 5 未定」长期并存；不能对外声明。 |
| D2 | 12-05 前是否开 VM 跑真实编译 | D2 | 12-05 无新编译读数；依据停在 E2。 |
| D3 | 12-05 判据取 `compile` success 还是真实编译 | D3 | 无商定判据；续期或退出无法判定。 |
| D4 | 今晚再失败是否另立「第三次失败」 | D4 | 若再错过，无处置口径；「第三次尝试」无定义。 |
| D5 | 4J 跨日 bump 记偏差还是违规 | D5 | 不登记；下次审计两头不靠；历史账目留空。 |

### 签字登记

| 编号 | 裁定（A / B / C） | 签字人 | 日期 |
|---|---|---|---|
| D1 | | | |
| D2 | | | |
| D3 | | | |
| D4 | | | |
| D5 | | | |

### 本件不做什么

- 不改 packet、周计划、roadmap、决定索引、认领表。
- 不 contact 任何人，不 commit、不 push，不起栈、不触发 CI。
- 不替判分人或 CTO 裁定；裁定行在有人签字前保持空白。
- 不宣称任何验收结论。禁用措辞仍然禁用：E4、验收通过（无条件）、证据齐全、独立复现、独立真人批准。

### 单源与位置

- `handoff/cto-1128-packet.md` —— D1–D5、证据等级、未核项、五个问题。
- `handoff/n5-verdict-1126.md` —— 判据 1–5、§7 逐格表、§11 路径 A、四句边界。
- `handoff/n5-closeout-1126.md` —— 证据盘点、哈希、缺件清单。
- `handoff/v1230-release-plan-1126.md` —— D5 相关发布链、§6 待决三项。
- `handoff/w14-ready-1126.md` —— D4 就绪读数、阻塞项、runbook。
