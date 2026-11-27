# N5 second acceptance session — options for the 2026-11-28 CTO weekly
# N5 是否办第二场验收 —— 2026-11-28 CTO 周会决策材料

**English**

> **Nature.** Decision material, read-only. This is not a ruling and does not reopen the 2026-11-26 path-A decision. It states what a second session can and cannot change, and lays out three options with one falsifiable consequence each, for the CTO to rule on.
>
> **Prepared.** 2026-11-27 (UTC+08), for the 2026-11-28 04:03 CTO weekly.
>
> **Numbering.** The packet's D1–D5, and the decision sheet `handoff/cto-1128-decisions-1126.md` that follows them, have no page for this item. The second-session question sits inside packet D1 / N5; it appears as **D2 only in the D1–D8 list of `handoff/nextstage-abc-1126.md` §6**. Quote the source with any D-number.
>
> **Phrasing.** "E4" appears in this file only inside the regulation's definition and inside quotations of prior rulings; no sentence here claims it for the 2026-11-25 session or for any future session. The forbidden phrases stay forbidden: an unqualified acceptance claim, complete evidence, independent human approval, independent human reproduction of this session.
>
> **Boundary.** Read-only. No plan file, roadmap, decision sheet, decision index or claim table was changed; nothing was committed or pushed; no stack was started; N5 was not re-run; nobody was contacted. This file is the only output.

**中文**

> **性质。** 决策材料，只读。不是裁定，也不重开 2026-11-26 选定的路径 A；只写清第二场能改变什么、不能改变什么，并给三个选项、每个一条可证伪后果，供 CTO 裁定。
>
> **成稿。** 2026-11-27（+08），供 2026-11-28 04:03 CTO 周会。
>
> **编号。** packet 的 D1–D5，以及沿用它的决策单 `handoff/cto-1128-decisions-1126.md`，都没有这一项的单页。第二场的问题嵌在 packet 的 D1 / N5 里；它只作为 **D2 出现在 `handoff/nextstage-abc-1126.md` §6 的 D1–D8 清单**中。引用任何 D 编号都须带来源。
>
> **措辞。** 本件里的「E4」只出现在规程定义与既往裁定的引文里；没有任何一句把 E4 归于 2026-11-25 场次或任何未来的场次。禁用措辞仍然禁用：不带限定的验收声明、完整无缺的证据包、独立真人批准、本场次的独立复现。
>
> **边界。** 只读。未改计划件、roadmap、决策单、决定索引、认领表；未提交、未推送；未起栈；未重跑 N5；未联系任何人。本文件是唯一产出。

---

## 0. One-screen answer / 一屏回答

**English**

1. **A second session is worth holding only for criterion 4** — and, as a by-product, for the attribution of criteria 2 and 3. It cannot change criterion 5 or criterion 1's person level, so it cannot produce a record on which all five criteria are established.
2. **It does not raise the evidence ceiling on this deployment.** The ceiling is E3 because the second approver is a seed account; lifting that needs a traceable non-seed approver, which is a product/data change, not a session.
3. **"E4 needs a second person and a second machine" describes the E4 reproduction run, not the N5 reader session.** They are two axes (`handoff/e4-repro-pack-1123.md` §1); neither substitutes for the other. Under the 2026-11-23 letter ruling, E4 is already not a missing item: the 2026-10-24 run17 was judged achieved under the letter, with three qualifiers.
4. **A second session does not repair the 2026-11-25 record.** It creates a parallel record. Items 1–5 in `handoff/n5-closeout-1126.md` §5 stay "ruled not to be filled".
5. **Suggestion (not a ruling): B — do not hold a second session now.** Switch to A only if a delivery, public or contract use needs a zero-help or an in-window reading.

**中文**

1. **第二场只值得为判据 4 而办** —— 附带可补判据 2、3 的归属。它改不了判据 5，也改不了判据 1 的人级，因此不可能产出一份「五条全成立」的记录。
2. **它抬不高本部署的证据上限。** 上限是 E3，因为第二批准人是种子账号；要松动，需要一位可追溯的非种子批准人 —— 那是产品/数据变更，不是场次。
3. **「E4 要第二人 + 第二机」说的是 E4 复现跑，不是 N5 读者场次。** 两者是两条轴（`handoff/e4-repro-pack-1123.md` §1），互不替代。按 2026-11-23 的规程字面裁定，E4 已不是缺失项：2026-10-24 的 run17 已按字面判达成，并带三条限定。
4. **第二场修不好 2026-11-25 那份记录。** 它只是另起一份记录。`handoff/n5-closeout-1126.md` §5 的 1–5 项仍是「已裁不补」。
5. **建议（非裁定）：B —— 现在不办第二场。** 只有当交付、公开或合同用途需要「零求助」或「窗口内读数」时，才转为 A。

---

## 1. What a second session can change / 第二场能改变什么

**English**

Scope: an N5 acceptance session whose record carries the in-session item set. "Established" below means the criterion's status changes from what `handoff/n5-verdict-1126.md` §2 records today.

| Criterion | Today (2026-11-25 record) | After a second session that produces the item set | What must be inside the new record |
|---|---|---|---|
| **4** — zero help = 0; recording, screenshots, file hashes | **Unsupported.** No help log, no signed declaration, no session screenshots, no `date -Is` start/end, recording 5:49 video-only; the developer was the host and the per-question log is missing, so the compensating control is absent (§6.1) | **Can become established** | Per-question help log (transactional ones too, with nature and wording); reader + host zero-help/independent-completion declarations, signed; six-question screenshots for A and B; export and `/audit/verify` screenshots; a full recording of 30–50 minutes covering export and verify; `date -Is` start and end; how and when the reader consented to recording |
| **2** — file format and provenance | **File format established; attribution unsupported.** The four CSVs are byte-identical to the 12:33 pre-flight exports, and their mtimes (13:42–13:45) precede the planned 14:00 start | **Attribution can become provable** | The export action visible in the recording, export screenshots, in-window file times, and the hash manifest taken at the session |
| **3** — `/audit/verify` and the second entry point | **Established with a limit:** the verify readings are from the 12:33 pre-flight gate and 07:38, both outside the session window; the second entry has no reader screenshot | **In-window reading can become available** | `/audit/verify` read during the session on the same account, plus the reader's second-entry screenshot |
| **Session head fields** (start/end, interval, consent) | Empty in the 2026-11-25 record | **Recorded from the start in the new record** | `date -Is` start/end; the interval actually printed on that session's paper and the one typed on screen, both written down; recording consent |

**中文**

范围：一场把下表「须在记录内」那一列全部产出的 N5 验收场次。下表的「成立」指该判据的状态相对 `handoff/n5-verdict-1126.md` §2 今天所记发生变化。

| 判据 | 今天（2026-11-25 记录） | 第二场产出全套件后 | 新记录里必须有什么 |
|---|---|---|---|
| **4** —— 零求助 = 0；留录屏、截图、文件哈希 | **无证。** 无提问日志、无签名声明、无场次截图、无 `date -Is` 起止；录屏 5:49、仅视频；主持人是开发者且逐次记录缺失，补偿控制不成立（§6.1） | **可转为成立** | 逐次提问日志（事务性也记，含性质与原话）；读者 + 主持人签名的零求助/独立完成声明；A、B 各一张六问截图；导出与 `/audit/verify` 截图；30–50 分钟、覆盖导出与 verify 的完整录屏；`date -Is` 起止；读者同意录屏的方式与时刻 |
| **2** —— 文件规格与归属 | **文件规格成立；归属无证。** 四份 CSV 与 12:33 场前导出逐字节相同，mtime（13:42–13:45）早于计划的 14:00 开场 | **归属可转为可证** | 录屏里能看到导出动作、导出截图、窗口内文件时刻、当场取的文件哈希清单 |
| **3** —— `/audit/verify` 与第二入口 | **带限定成立：** verify 读数取自 12:33 场前门与 07:38，均在场次窗口外；第二入口无读者截图 | **可取得窗口内读数** | 场次中同一账号现场读 `/audit/verify`，加读者第二入口截图 |
| **场次头字段**（起止、区间、同意录屏） | 2026-11-25 记录里为空 | **新记录从一开始就记全** | `date -Is` 起止；当场纸上印的区间与屏上填的区间，两边都写；同意录屏记录 |

---

## 2. What a second session cannot change / 第二场不能改变什么

**English**

| Item | Why it cannot change | What would change it instead |
|---|---|---|
| **Criterion 5** (six questions, 12 cells) | The two contested cells are the product's fixed sentence for a new object ("New: there was no before, and this write itself did not record field values"). A second reader gets the same sentence and will mark it "empty" again; the answer-key conflict between §2 and §7 recurs (decisions sheet Part 2). | A **grader's written ruling** on the two cells, or a **product change** that records field values for the "new" case — a separate item that must not retroactively pass 2026-11-25. |
| **Criterion 1, person level** | The approver is seed account #9901 (display name 李静), not a traceable person. A session cannot create one. | A traceable non-seed approver account and a real approval — a **product/data change**, outside any session. |
| **Evidence ceiling (E3)** | The ceiling is set by criterion 1's person level and by the absence of client-side independent attestation, not by the missing criterion-4 items. | A non-seed approver (above), or client-side independent attestation plus a user ruling as `handoff/yd43-prep-1126.md` requires; a session alone does neither. |
| **The 2026-11-25 record itself** | The record is a historical artifact; items 1–5 were ruled not to be filled on 2026-11-25. A new session produces a **parallel** record, not a repair. | Only a different ruling by the user could reopen the 2026-11-25 record, and this material does not propose one. |
| **The interval discrepancy** | Whether the paper said `09:50:47 → 2026-11-25 14:00:00` or `00:00:00 → 23:59:59` is a paper fact the machine cannot read (`handoff/n5-evidence-close-1126.md` §2.2). | One sentence from the user or reader who holds the paper; a new session only fixes its own paper. |
| **"All five established"** | The rule is conjunctive: all five must hold, no averaging, no substitution (`n5-acceptance-pack-1121.md` §1). A session that establishes 4 still leaves 1 (person level) and 5 open. | Criterion 1's approver change **and** criterion 5's ruling or product change, in addition to a clean session. |
| **Any external acceptance claim** | With 1 and 5 open, and the ceiling at E3, the record cannot support one — whatever the new session shows. | The three changes above, plus a user ruling on the wording. |

**中文**

| 项 | 为什么改不了 | 改它需要什么 |
|---|---|---|
| **判据 5**（六问、12 格） | 争的两格是产品对「新建」的固定句（「新建：没有改前，而这次写本身也没有记下字段值」）。换一位读者仍是同一句、仍会自标「空」；答案键 §2 与 §7 的冲突照旧（决策单第二部分）。 | **判分人的书面裁定**，或**产品改为记录字段值** —— 后者是另立条目，不得倒推 2026-11-25 通过。 |
| **判据 1 人级** | 批准人是种子账号 #9901（显示名李静），不是可追溯的真人。场次造不出真人。 | 可追溯的非种子批准账号与一次真实批准 —— **产品/数据变更**，在任何场次之外。 |
| **证据上限（E3）** | 上限由判据 1 的人级与「缺客户方独立出具的证据」决定，不由缺的判据 4 各项决定。 | 上述非种子批准人，或客户方独立出具证据并经用户裁定（`handoff/yd43-prep-1126.md`）；单靠一场做不到。 |
| **2026-11-25 那份记录本身** | 记录是历史件；1–5 项已于 2026-11-25 裁定不补。新场次产生的是**并列**记录，不是修补。 | 只有用户另作裁定才可能重开 2026-11-25 记录；本材料不提这一项。 |
| **区间不一致** | 纸上写的是 `09:50:47 → 2026-11-25 14:00:00` 还是 `00:00:00 → 23:59:59`，是机器读不到的纸面事实（`handoff/n5-evidence-close-1126.md` §2.2）。 | 持纸的用户或读者给一句确认；新场次只能管它自己那张纸。 |
| **「五条全成立」** | 规则是合取：五条全满足才算，不平均、不互相顶替（`n5-acceptance-pack-1121.md` §1）。第二场把 4 立起来，1（人级）与 5 仍开着。 | 判据 1 的批准人变更**加**判据 5 的裁定或产品变更，再加一场干净的场次。 |
| **任何对外验收声明** | 1 与 5 未立、上限 E3，无论新场次读数多好，记录都撑不起。 | 上述三项，加用户对措辞的裁定。 |

---

## 3. Which "second session" is meant / 说的是哪一场「第二场」

**English**

There are two different artifacts, and the difference decides who has to show up and what the run proves.

**3.1 The N5 acceptance session** (`handoff/n5-acceptance-pack-1121.md` §1; verdict §9.B). A named non-developer performs the business task on the published pin and answers the six questions from the audit page alone; the record is the session record. Inputs: one reader, one host, one slot of 60–90 minutes plus 2–3 hours of preparation and grading (verdict §9.B). A second machine is **not** a requirement of any of the five criteria; the 2026-11-25 session ran on the same host.

**3.2 The E4 reproduction run** (`handoff/e4-repro-pack-1123.md`). The regulation's letter, `KeelBase-Private/notes/CTO每周例会/例会规程.md:151`:

> **E4: independent reproduction.** A non-author, in an independent or clean environment, completes the reproduction following the recorded steps, and keeps verifiable evidence.

The 2026-11-23 user ruling: judge by the letter — non-author + independent or clean environment + recorded steps + verifiable evidence; "has not participated before" is **not** a threshold, only recorded. Only two judgement wordings are allowed: `E4 achieved (<date>, per the regulation's letter)` or `not E4: missing <item>`; there is no partial grade. The pack re-checked the consequence: the 2026-10-24 run17 was judged achieved under the letter (named non-author, independent Linux machine, independent checkout, clean clone, zero author involvement, 35/0, negative control 33/2, evidence retained), with three qualifiers — environment independent but not clean (warm Maven cache), deliverables reused (a reproduction of the verification, not from-zero delivery), record version not refreshed (N1). **So under the letter, E4 is not a missing item**; what remains open is W1.2's "never-participated person + from-zero delivery" and the "second time faster" reading.

The pack says explicitly what it is not: the N5 non-developer reader session is **another axis**, still No-Go, and the pack's readings cannot be counted as N5 (§1, the "is / is not" table). The converse holds too: the N5 session cannot be counted as the pack's E4.

**3.3 The word "E4" on the acceptance axis.** `handoff/yd43-prep-1126.md` says a real business user does not by itself raise the ceiling; E4 there requires client-side independent attestation and a user ruling. A second N5 session with a second machine does not produce that.

**Consequence for the question as posed.** "A second session to add criterion 4 and the evidence ceiling" bundles three different goals. Criterion 4 is reachable by 3.1. The ceiling is not reachable by either 3.1 or 3.2; it needs a non-seed approver or client-side attestation. E4-under-the-letter is not missing at all.

**中文**

有两件不同的东西；它们的区别决定谁必须到场、这一跑证明什么。

**3.1 N5 验收场次**（`handoff/n5-acceptance-pack-1121.md` §1；判定包 §9.B）。一名具名非开发者在已发布 pin 上完成业务任务，并仅凭审计页答六问；记录就是场次记录。输入：一名读者、一名主持人、一个 60–90 分钟的时段，加 2–3 小时准备与判分（判定包 §9.B）。**第二台机器不是五条判据中任何一条的要求**；2026-11-25 那场用的就是同一台宿主。

**3.2 E4 复现跑**（`handoff/e4-repro-pack-1123.md`）。规程字面（`KeelBase-Private/notes/CTO每周例会/例会规程.md:151`）：

> **E4：独立复现。** 非作者在独立或干净环境中，按照记录的步骤完成复现，并保留可核验证据。

2026-11-23 用户裁定：按字面判 —— 非作者 + 独立或干净环境 + 按记录步骤 + 可核验证据；「未参与过」**不是**门槛，只记进场次记录备查。判定只许两种写法：`E4 达成（<日期>，规程字面）` 或 `未达 E4：缺 <条目>`；没有部分达成。该包已复评后果：2026-10-24 的 run17 按字面判达成（具名非作者、独立 Linux 机、独立检出、干净克隆、零作者介入、35/0、负对照 33/2、证据留存），带三条限定 —— 环境独立但不干净（热 Maven 缓存）、交付物沿用（复现的是验证，不是从零交付）、记录版本未刷新（N1）。**所以在字面读法下，E4 不是缺失项**；仍缺的是 W1.2 的「未参与过的人 + 从零交付」与「第二次更快」的读数。

该包也明说它不是什么：N5 的「非开发者读者验收场次」是**另一条轴**，仍 No-Go，本包读数不能算作 N5（§1 的「是 / 不是」表）。反过来同样成立：N5 场次不能算作本包的 E4。

**3.3 验收轴上的「E4」二字。** `handoff/yd43-prep-1126.md` 写明：一名真实业务用户本身不会抬高上限；那里的 E4 要客户方独立出具证据，并由用户裁定。第二场 N5 场次加一台机器，做不到这件事。

**对问题原话的后果。** 「办第二场补判据 4 与证据天花板」把三件事捆在了一起：判据 4 可由 3.1 达到；天花板靠 3.1 或 3.2 都达不到，要靠非种子批准人或客户方独立证据；规程字面意义上的 E4 本来就不缺。

---

## 4. External conditions / 外部条件

**English**

For the N5 acceptance session (3.1) to establish criterion 4, all of the following must hold. Each is observable before the session starts.

| # | Condition | Detail |
|---|---|---|
| 1 | **Reader** | A named non-developer. Decide and record whether it is the 2026-11-25 reader (张杰 / Alice) or a new one. The same reader is no longer a first-time read; a new reader re-establishes "a non-developer can do it unaided". |
| 2 | **Host** | Someone other than the developer, or the developer with the compensating control written and signed before the session: zero content help, per-question log, transactional questions included (verdict §6.1). |
| 3 | **Second approver** | Only if criterion 1's person level is in scope: a traceable non-seed account with a real approval. Product/data change; not a session task. |
| 4 | **Pin** | `v0.1.20` for comparability with 2026-11-25, or `v0.1.21` (published 2026-11-26, run `45822868092`) for currency. Record the choice; do not let it be implicit. |
| 5 | **Slot** | 60–90 minutes for the session, plus 2–3 hours for preparation and grading. |
| 6 | **Stack** | Up on the chosen pin, pre-flight green, two objects A and B prepared, the second approval in place. |
| 7 | **Grader** | Available to rule on the two "what changed" cells; otherwise criterion 5 stays open after the session and the session buys only criterion 4. |
| 8 | **Recording consent** | How and when the reader consented, written into the session head. |

**Not required:** a second machine, on this axis. A second machine belongs to the E4 reproduction run (3.2), whose readings are recorded under its executor and cannot be counted as this session.

**中文**

要让 N5 验收场次（3.1）把判据 4 立起来，以下各项须全部成立；每项都能在开场前观察到。

| # | 条件 | 细节 |
|---|---|---|
| 1 | **读者** | 一名具名非开发者。明确并记录：用 2026-11-25 的读者（张杰 / Alice）还是新读者。同一读者不再是首次阅读；新读者才重新建立「非开发者可独立完成」的读数。 |
| 2 | **主持人** | 不是开发者的人；或仍由开发者主持，但补偿控制在开场前写好并签好：零内容性帮助、逐次提问日志、事务性问题也记（判定包 §6.1）。 |
| 3 | **第二批准人** | 只在判据 1 人级纳入范围时才需要：可追溯的非种子账号与一次真实批准。属产品/数据变更，不是场次任务。 |
| 4 | **pin** | 用 `v0.1.20` 与 2026-11-25 可比，或用 `v0.1.21`（2026-11-26 发布，run `45822868092`）取当前值。写明选择，不许隐含。 |
| 5 | **时段** | 场次 60–90 分钟，加准备与判分 2–3 小时。 |
| 6 | **栈** | 在选定 pin 上起好，场前门全绿，A/B 两个对象备好，第二批准就位。 |
| 7 | **判分人** | 能对「改成什么」两格作书面裁定；否则场次之后判据 5 仍开着，这场只换来判据 4。 |
| 8 | **同意录屏** | 读者同意的方式与时刻，写进场次头。 |

**不需要：** 这条轴上的第二台机器。第二台机器属于 E4 复现跑（3.2）；它的读数记在执行者名下，不能算作本场次。

---

## 5. Three options and their falsifiable consequences / 三个选项与可证伪后果

**English**

**Option A — hold a second acceptance session.**

- **What it does.** Produces a new dated record with the criterion-4 item set and in-window readings for criteria 2 and 3. Criteria 1 (person level), 5 and the ceiling are unchanged.
- **Falsifiable consequence.** Falsified if, when the new record is graded, **any one** of criterion 4's sub-items is still absent (help log, signed declarations, six-question screenshots, export/verify screenshots, 30–50-minute recording covering export and verify, `date -Is` start/end), or if the session is again hosted by the developer without a per-question log. Observable in the new evidence directory and the grading sheet.
- **If it succeeds.** Criterion 4 is established; attribution for 2 and 3 is established; the five criteria are still incomplete (1 person level, 5 open); the ceiling stays E3; no external acceptance claim becomes available.

**Option B — do not hold a second session; keep the E3 record and the boundary.**

- **What it does.** No new evidence. The record layer stays "recorded as passed by the user's 2026-11-25 ruling"; the evidence layer stays E3 with the four boundary sentences; no cost.
- **Falsifiable consequence.** Falsified if an internal, external, delivery or contract use needs a zero-help, in-window-verify or provenance reading that this record cannot carry — observable as a statement that cites criterion 4 or claims independent completion. Also falsified if the product later records field values for the "new" case, which would make the criterion-5 blocker moot and re-open the value of a session.
- **Status.** This is the status quo already written down: `677acec5` (weekly plan, 2026-11-26 23:37:49) and `30c1af96` (claim table) carry path A and the evidence boundary.

**Option C — defer the choice to after the 2026-12-05 review.**

- **What it does.** No decision on 2026-11-28. The question is decided together with the 12-05 review of the App-X/N9 maintenance track, when the delivery need may be defined.
- **Falsifiable consequence.** Falsified if the 12-05 review passes without deciding it, or if a delivery/public-claim need arises before 12-05 that the E3 record cannot support, or if the named reader becomes unavailable in the meantime and the session becomes costlier than it is on 11-28. Observable in the 12-05 minutes and in reader availability.
- **Note.** C is not a "no": it keeps the item open and re-litigates it. It is the better choice only if the 12-05 review is expected to decide whether a delivery claim is needed at all.

**Comparison**

| | Cost | Criterion 4 | Criteria 2/3 | Criterion 5 | Criterion 1 person level | Ceiling | External claim |
|---|---|---|---|---|---|---|---|
| **A** | 1 reader, 1 host, 1 slot + 2–3 h | Can be established | Can be established | Unchanged | Unchanged | E3 | Not available |
| **B** | 0 | Unsupported | Unsupported / limited | Needs a grader | Unmet | E3 | Not available |
| **C** | 0 now; same as A later, plus delay risk | Same as B | Same as B | Same as B | Same as B | E3 | Not available |

**中文**

**选项 A —— 办第二场验收。**

- **做什么。** 产生一份新的带日期记录，含判据 4 的全套件，以及判据 2、3 的窗口内读数。判据 1（人级）、5 与上限不变。
- **可证伪后果。** 新记录判分时，判据 4 的子项**任缺一项**（提问日志、签名声明、六问截图、导出与 verify 截图、覆盖导出与 verify 的 30–50 分钟录屏、`date -Is` 起止），或场次仍由开发者主持而无逐次日志 ⇒ 本选项被证伪。可在新证据目录与判分表上观察到。
- **若成立。** 判据 4 成立；判据 2、3 的归属成立；五条仍不全（1 人级、5 未裁）；上限仍 E3；不能对外作验收声明。

**选项 B —— 不办，维持 E3 记录与边界。**

- **做什么。** 不产生新证据。记录层维持「按用户 2026-11-25 裁定记为通过」；证据层维持 E3 与四句边界；零成本。
- **可证伪后果。** 任何内部、对外、交付或合同用途需要「零求助」「窗口内 verify」或「归属」读数，而本记录撑不起 —— 表现为引用判据 4 或声称独立完成的表述 ⇒ 本选项被证伪。另：若产品日后改为记录「新建」的字段值，判据 5 的阻塞消失、第二场的价值重新打开 ⇒ 同样证伪本选项。
- **状态。** 这就是已经落纸的现状：`677acec5`（周计划，2026-11-26 23:37:49）与 `30c1af96`（认领表）已写入路径 A 与证据边界。

**选项 C —— 推迟到 2026-12-05 复核之后再定。**

- **做什么。** 2026-11-28 不作决定；与 12-05 的 App-X/N9 维护档复核一并决定，届时交付需要可能已经明确。
- **可证伪后果。** 12-05 复核过完仍没决定；或 12-05 之前出现 E3 记录撑不起的交付/公开声明需求；或其间具名读者不可用、成本高于 11-28 ⇒ 本选项被证伪。可在 12-05 纪要与读者可用性上观察到。
- **注意。** C 不是「不办」：它把问题留在桌上、会再议。只有当 12-05 复核本就要决定「是否需要交付声明」时，它才优于 B。

**对比**

| | 成本 | 判据 4 | 判据 2/3 | 判据 5 | 判据 1 人级 | 上限 | 对外声明 |
|---|---|---|---|---|---|---|---|
| **A** | 1 读者、1 主持、1 时段 + 2–3 小时 | 可成立 | 可成立 | 不变 | 不变 | E3 | 不可用 |
| **B** | 0 | 无证 | 无证 / 限定 | 需判分人 | 不成立 | E3 | 不可用 |
| **C** | 现在 0；届时同 A，另加延误风险 | 同 B | 同 B | 同 B | 同 B | E3 | 不可用 |

---

## 6. Suggestion (not a ruling) and the if-not-ruled consequence / 建议（非裁定）与「若不裁」的后果

**English**

**Suggestion: B — do not hold a second session at the 2026-11-28 meeting.**

Reasons, in order:

1. **It cannot reach the goal it is usually asked for.** Criterion 5 and criterion 1's person level are outside a session's reach, so even a clean session leaves the record short of all five.
2. **It cannot lift the ceiling.** The ceiling is E3 for this deployment until a non-seed approver exists or client-side independent attestation is ruled on.
3. **Its real gain is one criterion.** Criterion 4 (plus attribution for 2 and 3) is worth a named person and a 60–90-minute slot only when a zero-help or in-window reading is actually needed for a delivery, public or contract purpose.
4. **The boundary already carries the internal use.** Path A is written into the plan and the claim table; the record layer and the evidence layer coexist explicitly.

**Switch to A if:** a delivery, public or contract use needs a zero-help or in-window reading. **Prefer C over B if:** the 12-05 review is expected to decide whether such a claim is needed.

**If not ruled.** The item stays open on the plan; the 12-05 review meets the same question with a reader and a stack whose state has had one more month to decay; the cost of A rises; and the record layer keeps "recorded as passed" beside the E3 boundary — not wrong, but unusable for any external claim, and open to being re-litigated at the next weekly.

**中文**

**建议：B —— 2026-11-28 会上不办第二场。**

理由按顺序：

1. **它到不了通常被要求的目标。** 判据 5 与判据 1 的人级都在场次之外，再干净的一场也凑不齐五条。
2. **它抬不动上限。** 在出现非种子批准人、或客户方独立证据获裁定之前，本部署上限就是 E3。
3. **它的真实收益只有一条判据。** 判据 4（附带判据 2、3 的归属）只有在交付、公开或合同用途确实需要「零求助」或「窗口内读数」时，才值一名具名人加一个 60–90 分钟时段。
4. **内部用途已经由边界承担。** 路径 A 已写入周计划与认领表；记录层与证据层已并列写明。

**转为 A 的条件：** 交付、公开或合同用途需要「零求助」或「窗口内读数」。**C 优于 B 的条件：** 12-05 复核本就要决定是否需要这类声明。

**若不裁。** 该项留在计划上；12-05 复核面对同一问题，而读者与栈的状态又多一个月衰减，A 的成本上升；记录层继续是「记为通过」加 E3 边界 —— 不算错，但撑不起任何对外声明，并在下一次周会上再次被提起。

---

## 7. Paste-ready ruling line and preconditions / 可直接粘进决策单的选项行与前置条件

**English**

For the decision sheet, after the D1 page if the chair wants it adjacent to the N5 item:

```
Ruling (N5 second session): ☐ A hold a second session ☐ B keep the E3 record, no second session ☐ C defer to after the 12-05 review | Signed / date: ______
```

Short form, matching the sheet's existing style:

```
Ruling: ☐ A ☐ B ☐ C | Signed / date: ______
```

**Preconditions checklist, if A is chosen.** Each line is observable before the session starts.

1. State the axis: N5 acceptance session (criterion 4) or E4 reproduction run (regulation letter). They are different sessions; one does not produce the other. If E4, use `handoff/e4-repro-pack-1123.md`; if criterion 4, use the N5 pack.
2. Name the reader, and record whether it is the 2026-11-25 reader or a new one, with the reason.
3. Name a host who is not the developer; otherwise write and sign the zero-content-help + per-question-log protocol before the session.
4. If criterion 1's person level is in scope, arrange a traceable non-seed approver — a product/data change, with its own approval path.
5. Choose the pin: `v0.1.20` for comparability or `v0.1.21` for currency; write it into the session head.
6. Book one slot of 60–90 minutes plus 2–3 hours; confirm the stack is up and the pre-flight is green.
7. Put the grader's written ruling on the two "what changed" cells in place before the session, or state in advance that criterion 5 will remain open afterwards.
8. Prepare the in-session capture: full recording 30–50 minutes covering export and verify; consent record; six-question screenshots; export and `/audit/verify` screenshots; in-window verify on the same account; `date -Is` start/end; per-question log.
9. If criterion 5 is to be established by evidence rather than by a ruling, open a separate product item to record field values for the "new" case — do not fold it into the session.

**中文**

给决策单用；若主持人希望它紧挨 N5 项，放在 D1 页之后：

```
Ruling (N5 second session): ☐ A hold a second session ☐ B keep the E3 record, no second session ☐ C defer to after the 12-05 review | Signed / date: ______
```

与决策单现有样式一致的精简写法：

```
Ruling: ☐ A ☐ B ☐ C | Signed / date: ______
```

**若选 A，前置条件清单。** 每行都能在开场前观察到。

1. 先定轴：N5 验收场次（判据 4）还是 E4 复现跑（规程字面）。两者是不同场次，一场不产出另一场。若走 E4，用 `handoff/e4-repro-pack-1123.md`；若补判据 4，用 N5 包。
2. 定读者并记明：用 2026-11-25 的读者还是新读者，附理由。
3. 定一名不是开发者的主持人；否则在开场前把「零内容性帮助 + 逐次日志」协议写好并签好。
4. 若判据 1 人级纳入范围，安排可追溯的非种子批准人 —— 属产品/数据变更，另走批准路径。
5. 定 pin：`v0.1.20` 求可比，或 `v0.1.21` 取当前；写进场次头。
6. 订一个 60–90 分钟时段，加 2–3 小时；确认栈已起、场前门全绿。
7. 开场前落实判分人对「改成什么」两格的书面裁定；否则事先写明：场次之后判据 5 仍开着。
8. 备好场次内的采集：覆盖导出与 verify 的 30–50 分钟完整录屏；同意录屏记录；六问截图；导出与 `/audit/verify` 截图；同一账号的窗口内 verify；`date -Is` 起止；逐次提问日志。
9. 若判据 5 要靠证据而不是裁定成立，另开一条产品事项记录「新建」场景的字段值 —— 不要夹带进场次。

---

## 8. Boundaries and sources / 边界与出处

**English**

**What this file does not do.** It does not change any plan file, roadmap, decision sheet, decision index or claim table; it does not commit, push, start a stack, re-run N5 or contact anyone; it does not assert any acceptance conclusion; it does not rule for the CTO, the scorer or the user. Every "suggestion" is marked as a suggestion.

**Sources.**

- `handoff/cto-1128-decisions-1126.md` — the D1 page (path A already written; criterion 5 signature only), Part 2's 12-cell table, and the rule conflict between answer-key §2/§3 and §7.
- `handoff/n5-evidence-close-1126.md` — §1 status table, §2.1 machine-inferred window, §2.2 interval discrepancy, §3 the remaining human-attested items.
- `handoff/nextstage-abc-1126.md` — §0 one-screen update, §2 A-1/A-2/A-3, §5 the "second session only if an external claim is needed" line, §6 D2.
- `D:/Rain6fish/handoff/n5-verdict-1126.md` — §2 the five-criterion table, §6 criterion 4, §9 the three paths and their costs, §11 path A and the four boundary sentences.
- `D:/Rain6fish/handoff/n5-closeout-1126.md` — §2 criterion mapping, §3.1 byte-identical CSVs, §3.2 the interval discrepancy, §5 the missing-item list.
- `D:/Rain6fish/handoff/n5-acceptance-pack-1121.md` — §1 the five criteria as written and the conjunctive rule.
- `D:/Rain6fish/handoff/e4-repro-pack-1123.md` — §0, §1 the regulation's letter, the 2026-11-23 ruling, the run17 consequence and the three qualifiers, and the "is / is not" table.
- `D:/Rain6fish/handoff/yd43-prep-1126.md` — the ceiling rule: a real business user alone does not raise it; E4 requires client-side independent attestation and a user ruling.
- Weekly plan `677acec5` and claim table `30c1af96` — path A and the evidence boundary, as the decisions sheet records them.

**Not verified in this session.** The stack's current state; whether the 2026-11-25 reader is available; whether a non-seed approver account could be created without a data-model change; the 12-05 review's agenda. All three are inputs the session-holder must check on the day.

**中文**

**本件不做什么。** 未改任何计划件、roadmap、决策单、决定索引、认领表；未提交、未推送、未起栈、未重跑 N5、未联系任何人；不宣称任何验收结论；不替 CTO、判分人或用户裁定。所有「建议」都已标明是建议。

**出处。**

- `handoff/cto-1128-decisions-1126.md` —— D1 页（路径 A 已落纸，只剩判据 5 签字）、第二部分的 12 格表、答案键 §2/§3 与 §7 的规则冲突。
- `handoff/n5-evidence-close-1126.md` —— §1 状态表、§2.1 机器可推窗口、§2.2 区间不一致、§3 仍需人证的条目。
- `handoff/nextstage-abc-1126.md` —— §0 一屏更新、§2 的 A-1/A-2/A-3、§5「只有需要外部声明时才开第二场」、§6 的 D2。
- `D:/Rain6fish/handoff/n5-verdict-1126.md` —— §2 五条判据表、§6 判据 4、§9 三条路与代价、§11 路径 A 与四句边界。
- `D:/Rain6fish/handoff/n5-closeout-1126.md` —— §2 判据映射、§3.1 逐字节相同的 CSV、§3.2 区间不一致、§5 缺件清单。
- `D:/Rain6fish/handoff/n5-acceptance-pack-1121.md` —— §1 五条判据原文与合取规则。
- `D:/Rain6fish/handoff/e4-repro-pack-1123.md` —— §0、§1 规程字面、2026-11-23 裁定、run17 的复评与三条限定、「是 / 不是」表。
- `D:/Rain6fish/handoff/yd43-prep-1126.md` —— 上限规则：真实业务用户本身不抬高上限；E4 要客户方独立证据并由用户裁定。
- 周计划 `677acec5` 与认领表 `30c1af96` —— 路径 A 与证据边界，按决策单所记。

**本会话未核。** 栈的当前状态；2026-11-25 的读者是否可用；能否在不改数据模型的前提下建一个非种子批准账号；12-05 复核的议程。这三项都要由持会人当天核。

---

---

## Ruling received (2026-11-27) / 已收裁定（2026-11-27）

**English**

The user ruled **B**: no second N5 acceptance session now. The E3 boundary written on 11-27 stands and is used for internal purposes only; the session is reopened only when a delivery, public or contract use actually needs a zero-help or in-window reading. Criterion 4 stays unsupported, criteria 2 and 3 stay unattributable, and the ceiling stays E3 — criterion 5 and criterion 1's person level were never in a session's reach. Recorded in `handoff/cto-1128-decisions-1126.md` D6; that sheet's ruling line stays blank because it is not signed.

**中文**

用户裁定**选 B**：现在不办第二场 N5 验收。11-27 写明的 E3 边界保留、只用于对内；只有当交付、公开或合同用途确实需要「零求助」或「窗口内读数」时才重开。判据 4 仍无证，判据 2、3 仍不可归属，上限仍 E3 —— 判据 5 与判据 1 的人级本来就不在场次射程内。记录见 `handoff/cto-1128-decisions-1126.md` D6；该单的裁定行仍空，因为尚未签字。

---

*Originally read-only decision material for the 2026-11-28 CTO weekly; the section above records the 2026-11-27 ruling received after it was written. — 本件原为只读决策材料；上节记录的是写成之后于 2026-11-27 收到的裁定。*
