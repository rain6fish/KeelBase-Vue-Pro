# YD-43 B2 — Named Real Business User Intake and Eligibility Package (2026-11-27) / YD-43 B2 —— 具名真实业务用户登记与资格核对包（2026-11-27）

---

# Part I · English

> **Nature.** A blank intake form and eligibility check sheet, meant to be handed to the project side and filled in on site. It is not a session record, not an instance file, not a frozen artefact, and it replaces none of them.
>
> **Status claim.** This package registers nobody. It contains **no real name, no account, no organisation, no count**. Every example row is a fabricated placeholder marked "示例，请替换" (example, replace it). Nothing here may be copied into an instance file as a value.
>
> **Sources (read, not modified):** `yd43-frozen-20261117T045650Z.md` §2.2 (who counts / who does not / honest count), §2.3 (entry conditions), §3.1 (card hand-out rule), §6 (record-sheet header and attribute fields); `yd43-instance-template.md` A2, A13, A15; `yd43-instance-ready-1118.md` S2 and B2; the session-header and deviation-column layout of `KeelBase-Private/notes/审计读者/N5-场次记录-2026-11-25.md` (layout only — its reader, data and conclusions are not reused).
>
> **Boundary.** Read-only output. No name was filled, no list was invented, no one was contacted. The roadmap, the decision index and the plan documents were not changed. Nothing was committed or pushed.
>
> **How to use.** Hand §1 and §2 to whoever on the project side can name the people; keep §3–§6 with the person doing the eligibility check. The filled sheet becomes the input to slot A2; it does not become A2 by itself.

## 1. User registration form (blank)

### 1.1 Who fills it, when

- **Filled by:** the project side — the client contact or the delivery lead who actually knows who works in this system. **Not** by the person who will host the session, and not by us on their behalf. A guessed name is worse than a blank (B2 in `yd43-instance-ready-1118.md` §3).
- **When:** **before the instance layer is frozen.** The list goes into A2 and is frozen together with the instance file; after that it cannot be extended. The plan's gate G2 puts this at **2026-12-10**.
- **How many rows:** as many as the project actually has. Range 1–5; do not pad to reach a number.

### 1.2 The form

| # | Field | Value |
|---|---|---|
| 1 | Code | `U1` / `U2` / `U3` … (one code per person, never reused) |
| 2 | Post / role | `________________` |
| 3 | What this person does in this project (one sentence) | `________________` |
| 4 | Does this person do this batch of business day to day? | ☐ Yes ☐ No |
| 5 | Identity attributes (tick every one that applies) | ☐ None of these ☐ Developer / implementer of this feature ☐ Test / implementation / our delivery staff ☐ Trained re-tester ☐ Random third party |
| 6 | Is the account a real business role of this project (not `admin`, not a superuser)? | ☐ Yes, role `______` ☐ No ☐ Account not yet created |
| 7 | Pre-registration: does this person agree to take part, be recorded, and have the real business data used? | ☐ Yes ☐ No ☐ Not asked yet |
| 8 | Eligibility result (after the §2 check) | ☐ Counts ☐ Does not count → exclusion code `X_` |
| 9 | Reason (one sentence, in the project's own words) | `________________` |
| 10 | Checked by / checked at | `______` / `2026-__-__ __:__` |

**N (this form, before freeze):** `__` persons — the number of rows judged "Counts" in field 8, not the number of rows written.

### 1.3 Field notes

- Field 5 is the one that decides. Ticking any box other than "None of these" sends the person to §2; the exclusion is written with the exact wording given there.
- Field 6 is not a formality: the frozen pack §2.3 requires a **real business role account**. A project manager logging in with a superuser account is not admissible for that person, even if the person is a genuine business user.
- Field 7 at registration is **only a pre-registration**. The binding consent is read aloud on site before recording starts (§4). A "yes" here does not replace it, and a "not asked yet" here does not block registration.
- Field 9 is where honesty lives. "He is the only one who uses it" is a reason; "he is probably fine" is not.

### 1.4 Example rows (示例，请替换 — example, replace it)

> Fabricated. Not a real person, post, account or project.

| # | Field | Value |
|---|---|---|
| 1 | Code | U1（示例，请替换） |
| 2 | Post / role | 采购专员（示例，请替换） |
| 3 | What this person does in this project | 甲方采购经办，每天录入门店拜访（示例，请替换） |
| 4 | Does this person do this batch of business day to day? | ☑ Yes（示例，请替换） |
| 5 | Identity attributes | ☑ None of these（示例，请替换） |
| 6 | Real business role account | ☑ Yes, role `purchaser`（示例，请替换） |
| 7 | Pre-registration | ☑ Yes（示例，请替换） |
| 8 | Eligibility result | ☑ Counts（示例，请替换） |
| 9 | Reason | 本项目的采购经办，这批活就是他的日常（示例，请替换） |
| 10 | Checked by / at | 某某 / 2026-__-__ __:__（示例，请替换） |

## 2. Exclusion list, and the wording that goes into the record sheet

### 2.1 The five exclusions (verbatim against frozen §2.2)

| Code | Excluded subject (frozen §2.2) | Why it is excluded | Wording to write into the record sheet's attribute field |
|---|---|---|---|
| X1 | Developer / implementer of this feature | Knows where the pages and internal names are; cannot test "independence" | `属性：本项目功能开发者 —— 不合格（§2.2 排除「开发者 / 本功能实现者」），不计入 N` |
| X2 | Test, implementation, or our own delivery staff | Same reason | `属性：测试/实施/我方交付人员 —— 不合格（§2.2 排除「测试 / 实施 / 我方交付人员」），不计入 N` |
| X3 | AI agent (browser automation, WorkBuddy and the like) | Not a human; a session already had to be re-judged on this ground on 2026-11-14 | `属性：AI 代理/自动化 —— 非真人（§2.2 排除「AI 代理」），不计入 N`; no record sheet is created for it |
| X4 | A re-tester who has been trained on this flow | Training is a hint | `属性：受训过的复测者 —— 不合格（§2.2 排除「受训过的复测者」），不计入 N` |
| X5 | A random third party with no business relation to this project | Excluded by the roadmap in so many words | `属性：随机第三方 —— 不合格（§2.2 排除「随机第三方」），不计入 N` |

The codes X1–X5 are this package's shorthand; the frozen §2.2 table carries no numbering. The bracket in each wording quotes the frozen row, so the record sheet can be checked against the frozen file word for word.

**Where it goes.** The record sheet (§6.1) has one checkbox for this: `是否开发者/测试/我方人员 ☐否（合格） ☐是（不合格，本场作废）`. That box covers X1 and X2 only. For X4 and X5, tick nothing there and write the full sentence in the note position of the `用户代号 / 岗位` row, for example:

`U2 / 财务（属性：受训过的复测者 —— 不合格，§2.2 排除「受训过的复测者」）`

The session is then void, and the re-judging is done by the reviewer, not by the host.

### 2.2 Project-level disqualifiers that void the whole list

These are §2.1 disqualifiers, not §2.2 ones, but a list built on such a project cannot count regardless of who is on it. Write them in the instance file's A1/A15 remarks, not in a person's row:

| Code | Condition (frozen §2.1) | Consequence |
|---|---|---|
| P1 | Only demo data, or only our own staff use the system | The project fails; nobody on the list counts |
| P2 | Users are developers, testers, or engineers reproducing a recipe | This is the `YD-28` caliber, not this one |
| P3 | Users are random third parties, or an AI agent simulates the operation | The project fails |
| P4 | Only trained re-testers | The project fails |

### 2.3 A person who is two things at once

A developer who also does the business day to day, a delivery engineer who also holds the operator post — **the exclusion wins.** The purpose is to test whether an independent user can finish the work; a person who knows the pages from the inside cannot supply that answer. Record the fact, do not average it away.

## 3. Counting N

### 3.1 Definition

**N = the number of rows judged "Counts" in §1 field 8, on the list frozen with the instance file.** It is a count of people, not of sessions, not of rows filled in, not of invitees.

### 3.2 Fewer than three

Take the number the project actually has and write it as it is. Fewer than three is recorded as N = 1 or N = 2, with the sentence required by §4.5: **"small sample; the conclusion holds only for these N people"**. Do not pad, do not recruit a stand-in, do not borrow a person from another project.

### 3.3 N = 0

N = 0 means the item is judged **not achieved (no named real business user)**. It is not written as achieved, not written as "no user yet", not written as "delayed". This is the roadmap's own wording and the plan's G1 stop condition.

### 3.4 Freeze, then no additions

- The list goes into A2 **before** the instance file is frozen.
- **After the freeze, no one may be added.** Not a late volunteer, not a person who happened to be on site.
- The only allowed change is **swapping one person for another already on the list** — i.e. two codes on the frozen list exchange, or a listed person is replaced by another listed person. Even then it is written into `yd43-corrections-<YYYYMMDD>.md`: who was swapped out, who in, why, and whether either had already entered a session.
- If the person swapped out had already run, **their session record stays as it is.** It is not overwritten and not deleted; the correction explains the change.

### 3.5 One person, two groups

The AI group and the manual group are ideally different people. If the same person runs both (§5.5): at least **24 hours apart**, only one group per day, different object instances, and the order is recorded. **N counts people once**, not twice — running two groups does not raise N.

### 3.6 Listed versus attended (registration rule, does not change the criteria)

If a listed person does not turn up, do not substitute from outside the list. Record both numbers:

- **N** = the frozen list (what A2 says);
- **M** = how many actually ran a session.

Judgment uses M; the report writes both, e.g. "list N = 3, attended M = 2". A listed person who never ran is recorded as "no session", never as a pass or a fail.

### 3.7 Never counted

The named reader from the N5 session, any acceptance reader, any colleague pulled in to make up the number, and anyone who has been walked through the flow. The plan §8 forbids reusing the N5 reader outright.

## 4. On-site consent line and how it is recorded

### 4.1 The sentence (read aloud, verbatim, nothing added)

```text
这场会全程录屏，可能还会截图，也会用到你正在处理的真实业务数据；这些只留在我们内部核对，不对外发送——你现在同意开始吗？
```

Read it **before recording starts**. It is the §2.3 first entry condition and the §8.5 requirement in one line.

### 4.2 How it is recorded

- The answer goes into the record sheet with a **time to the second**: `同意录屏：是 / __:__:__`.
- The sentence must be **audible on the recording** — the host is not on camera (§7.5), but the voice is. A consent that exists only in memory does not count.
- **Settled 2026-11-27: the row is appended, on every printed sheet, always.** The template has no row for this while §8.5 requires the content, so the row below goes at the end of §6.1 on every print run:

```text
| 同意录屏 | ☐ 是 / `__:__:__`　☐ 撤回 / `__:__:__`（§8.5） |
```

Appending it adds no field, changes no criterion, and supplies the landing place for a requirement that already exists (§8.2). A sheet printed without it is reprinted — not annotated by hand, not left short.

### 4.3 What is not consent

- Silence, a nod, "he did not object", "we already told him last week".
- A pre-registration tick in §1 field 7.
- Consent given by a manager on the person's behalf.
- Consent given after recording has started.

Any of these means §2.3 is not met and **the session does not start** — record "untested (environment)" per §2.5, not a user failure.

### 4.4 Withdrawal

The user may withdraw at any time. Withdrawal stops the session on the spot (§2.5), the recording is sealed and not sent out, and the record sheet gets `同意录屏：撤回 / __:__:__`. Do not argue, do not offer to continue without recording unless the user asks first.

## 5. Code-to-name roster: handling rules

### 5.1 The rule

The record sheet carries **only the code and the post**. The name lives on a separate roster (§2.2: "the name may be a code; the archive carries a separate cross-reference table, which does not go into the record sheet"). One roster covers one frozen instance version.

### 5.2 What the roster holds

| Code | Name | Post | Unit | Account (optional) | Entered by | Entered at |
|---|---|---|---|---|---|---|
| `U1` | | | | | | |
| `U2` | | | | | | |
| `U3` | | | | | | |

### 5.3 Where it is kept (settled 2026-11-27)

**Decision: one electronic roster, at `D:/Rain6fish/handoff/yd43-roster-<YYYYMMDD>.md`.**

Why this, and not a paper sheet:

- §2.2, in the same frozen document, says the archive carries a separate cross-reference table. That is an authorisation, not an oversight.
- §0.4 does not enumerate this file and says everything else is forbidden. The gap is closed by disclosure: one entry in `yd43-corrections-*.md` names the file and its basis, and the text is prepared in §8.3.
- §8.5 already keeps originals with real client names and phone numbers in the internal archive. The roster adds no class of exposure the archive does not already hold.
- A paper-only roster risks losing the only link between codes and people. There is no reconstruction path; the record sheets would stay anonymous for good.

Rules that come with the decision:

- outside `yd43-run-*/`, never inside the evidence directory, never in `SHA256SUMS.txt`, never uploaded, never in any `-redacted` copy or external deliverable;
- one roster per frozen instance version; **append-only** — a swap adds a row and never rewrites one;
- its SHA-256 is logged in the corrections entry, next to the disclosure. A hash names nobody, and it proves later that the mapping file was not swapped;
- **one fallback only:** if the client's compliance rules forbid keeping staff names on disk at all, the paper roster replaces it. The same corrections entry then reads "paper", and A13's remarks say where the sheet is held. That call belongs to the client, not to convenience.

The roster is **not** part of the three-way reconciliation, **not** an evidence file, and **not** sent to anyone outside.

### 5.4 Swaps keep history

On a swap, the old row stays (it is not overwritten and not deleted); the new person gets a **new code** — codes are never reused within one instance version. The correction document names both codes and the reason.

### 5.5 What must never appear where

| Never here | Always here |
|---|---|
| Record sheet §6.1 (any field) | Roster |
| Record sheet §6.3 hint ledger (users are quoted verbatim there — quote the words, not the name; if a name is spoken, replace it with the code and note "user's own name spoken") | — |
| Session header, report, roadmap row, commit message | Roster |
| Any `-redacted` external copy | — |
| Screen recording filenames | — |

A code does not make a file safe to send out by itself. The redaction rules of §8.5 apply to the original regardless of whether names appear.

## 6. Self-check before the list goes into A2

Tick all before copying into `yd43-instance-<YYYYMMDD>.md`:

- [ ] §1 rows are filled by the project side, not by us; the filler's name is in field 10.
- [ ] Every row has a code, a post, field 4 answered, and field 5 with exactly one state.
- [ ] No row has a name written in it; the names are on the roster only (§5).
- [ ] Every "Does not count" row carries the exact §2.1 wording with its X code.
- [ ] No row was padded to reach three; N equals the number of "Counts" rows.
- [ ] N = 0 has been written as "not achieved (no named real business user)", and no session is planned.
- [ ] Field 6 is "Yes" with a named role for every counted person — no `admin`, no superuser.
- [ ] No counted person is the N5 reader, an acceptance reader, or anyone walked through the flow.
- [ ] The list was completed before the instance file was frozen; the freeze time is noted.
- [ ] The roster is the separate file of §5.3 (or the client's paper fallback is recorded); its path is in A13's remarks, its SHA-256 goes into the corrections entry, and no password or full account list is in this package.
- [ ] Pre-registration consent (field 7) is marked as pre-registration, not as the on-site consent.
- [ ] The record sheet print run includes the appended `同意录屏` row (§4.2).

## 7. Where each value lands

| This package | Instance slot | Record sheet | Notes |
|---|---|---|---|
| §1 fields 1–5 | A2 | §6.1 code / post | Names never leave §5 |
| §1 field 6 | A2 remark, A5 | §6.1 account | Real business role required (§2.3) |
| §1 field 7 | A15 (compliance) | §6.1 appended consent row on site | Pre-registration ≠ consent |
| §1 field 8–9 | A2 total N | — | Exclusion wording per §2.1 |
| §3 | A2 total N | — | N = 0 ⇒ not achieved |
| §4 | A15 | §6.1 | Read before recording |
| §5 | A13 remark (location only, never the roster itself) | — | The separate file of §5.3 |

## 8. The two settled points

Both were open in the first draft. Settled **2026-11-27**, before any list exists and before the instance layer is frozen — the only window in which they can be settled at all.

| Point | Decision | Basis |
|---|---|---|
| Code-to-name roster | One electronic file, `D:/Rain6fish/handoff/yd43-roster-<YYYYMMDD>.md`, outside `yd43-run-*/` | §2.2 authorises a separate roster; §0.4 does not enumerate it, so it is disclosed in corrections (§8.3) |
| Consent row | One row appended to the end of §6.1 on every printed record sheet | §8.5 requires the consent inside the record sheet; the template prints no row for it |

Neither changes a criterion, a task, a standard or a comparison. The first adds a file and says so; the second supplies the landing place for a requirement that already exists. If either is later judged to be a change to the frozen layer, the remedy is not a silent edit: void, re-freeze, keep the old copy.

**When it binds.** The roster rule binds from instance freeze. The record-sheet row binds from the first printed sheet. Until then this section can still be revised; after then, only a corrections entry or a new instance version can touch it.

### 8.1 Point 1 — the roster is a separate electronic file

One copy, in the internal archive, under the rules of §5.3. **Append-only**, so a swap never erases the previous mapping. Its SHA-256 goes into the corrections entry; a hash names nobody and proves the file was not swapped later.

### 8.2 Point 2 — the consent row is appended to §6.1

Every print run carries the row of §4.2. A sheet without it is reprinted. The row is the §8.5 landing place, not a new field.

### 8.3 Text to paste into `yd43-corrections-<YYYYMMDD>.md` at instance freeze

**The Chinese block in Part II §8.3 is the one that gets pasted** — corrections live with the Chinese-primary frozen pack. The English below is its rendering, provided so both halves of this document can be read on their own. Fill in `<YYYYMMDD>`, the entry number and the two hash blanks; if the client's paper fallback is used, replace item 1's first sentence as bracketed.

```markdown
## C<n>. Two landing points (settled 2026-11-27; no criterion changed)

1. **Code-to-name roster.** Per §2.2 — a separate cross-reference table kept in the archive,
   not in the record sheet — a file `yd43-roster-<YYYYMMDD>.md` is kept in the internal archive
   `D:/Rain6fish/handoff/`. It is not in `yd43-run-*/`, not in `SHA256SUMS.txt`, and is never
   sent out. §0.4 does not enumerate this file; this entry is its honest registration.
   SHA-256: `____` (recomputed and logged on every append).
   [Paper fallback, if used: the roster is a paper sheet held by ______; no electronic copy exists.]
2. **One row appended to record sheet §6.1.** The exact row added is the one printed in §4.2.
   The template prints no such row, while §8.5 requires the consent inside the record sheet.
   The appended row changes no existing field and no criterion.
```

---

# 第二部分 · 中文

> **性质。** 空白登记表与资格核对表，用于交给项目方在现场填写。它不是场次记录、不是实例件、不是冻结件，也不替代其中任何一件。
>
> **状态声明。** 本包不登记任何人，**不含任何真实姓名、账号、单位、人数**。所有示例行都是编造的占位，均标「示例，请替换」；不得把示例抄进实例件当作值。
>
> **依据（只读，未改）：** `yd43-frozen-20261117T045650Z.md` §2.2（谁算 / 谁不算 / 人数如实）、§2.3（进入条件）、§3.1（用户卡发放规则）、§6（记录纸场次头与属性栏）；`yd43-instance-template.md` A2、A13、A15；`yd43-instance-ready-1118.md` 的 S2 与 B2；`KeelBase-Private/notes/审计读者/N5-场次记录-2026-11-25.md` 的场次头与偏差栏版式（**只借版式**——其读者、数据与结论一律不复用）。
>
> **边界。** 只读产出。未代填任何姓名，未编造任何名单，未联系任何人。未改 roadmap、决定索引与计划件；未提交、未推送。
>
> **怎么用。** §1、§2 交给项目方里能点出人名的人填；§3–§6 留给做资格核对的人。填好的表是 A2 的输入，它自己不是 A2。

## 1. 用户登记表（空白）

### 1.1 谁填、什么时候填

- **填表人：** 项目方——真正知道这个系统里谁在干活的那位客户对接人或交付负责人。**不是**将来主持场次的人，也不是我方代填。猜一个名字比留空更糟（`yd43-instance-ready-1118.md` §3 的 B2）。
- **时间点：** **实例层冻结之前**。名单随实例件一起进 A2 并冻结，冻结之后不得增补。启动方案把这道闸（G2）定在 **2026-12-10 前**。
- **填几行：** 项目实际有几个人就填几行。1–5 行；**不为了凑数往里加人**。

### 1.2 表格

| # | 字段 | 值 |
|---|---|---|
| 1 | 代号 | `U1` / `U2` / `U3` ……（一人一个，永不复用） |
| 2 | 岗位 | `________________` |
| 3 | 在本项目里做什么（一句话） | `________________` |
| 4 | 是否日常做这批业务 | ☐ 是 ☐ 否 |
| 5 | 身份属性（逐项勾，凡命中即勾） | ☐ 都不是 ☐ 本功能开发者 / 实现者 ☐ 测试 / 实施 / 我方交付人员 ☐ 受训过的复测者 ☐ 随机第三方 |
| 6 | 账号是否为本项目的真实业务角色（不是 `admin`、不是超管） | ☐ 是，角色 `______` ☐ 否 ☐ 账号尚未开通 |
| 7 | 预登记：本人是否同意参加、被录屏、并让真实业务数据被使用 | ☐ 是 ☐ 否 ☐ 尚未询问 |
| 8 | 资格核对结论（做完 §2 之后填） | ☐ 算 ☐ 不算 → 排除代号 `X_` |
| 9 | 理由（一句话，用项目方自己的话） | `________________` |
| 10 | 核对人 / 核对时间 | `______` / `2026-__-__ __:__` |

**本表 N（冻结前）：** `__` 人 —— 取第 8 栏判「算」的行数，不是写了多少行。

### 1.3 字段说明

- 第 5 栏是决定性的。除了「都不是」，勾了任何一项都要走 §2，并按那里的**逐字措辞**写排除理由。
- 第 6 栏不是走过场：冻结包 §2.3 要求用**真实业务角色账号**登录。业务上确实是本人，但拿超管账号来跑，这个人照样不合规。
- 第 7 栏在登记阶段**只是预登记**。真正生效的同意是现场开场前照读的那一句（§4）。这里勾「是」代替不了它；这里写「尚未询问」也不妨碍先把人登记上来。
- 第 9 栏是如实与否的落点。「只有他一个人在用」是理由；「应该没问题」不是理由。

### 1.4 示例行（示例，请替换）

> 以下为编造，不对应任何真人、岗位、账号或项目。

| # | 字段 | 值 |
|---|---|---|
| 1 | 代号 | U1（示例，请替换） |
| 2 | 岗位 | 采购专员（示例，请替换） |
| 3 | 在本项目里做什么 | 甲方采购经办，每天录入门店拜访（示例，请替换） |
| 4 | 是否日常做这批业务 | ☑ 是（示例，请替换） |
| 5 | 身份属性 | ☑ 都不是（示例，请替换） |
| 6 | 真实业务角色账号 | ☑ 是，角色 `purchaser`（示例，请替换） |
| 7 | 预登记 | ☑ 是（示例，请替换） |
| 8 | 资格核对结论 | ☑ 算（示例，请替换） |
| 9 | 理由 | 本项目的采购经办，这批活就是他的日常（示例，请替换） |
| 10 | 核对人 / 时间 | 某某 / 2026-__-__ __:__（示例，请替换） |

## 2. 排除清单，以及写进记录纸的那句话

### 2.1 五条排除（逐条对照冻结件 §2.2）

| 代号 | 排除对象（§2.2 原文） | 原因 | 写进记录纸属性栏的措辞 |
|---|---|---|---|
| X1 | 开发者 / 本功能实现者 | 知道页面位置与内部名，测不出「独立」 | `属性：本项目功能开发者 —— 不合格（§2.2 排除「开发者 / 本功能实现者」），不计入 N` |
| X2 | 测试 / 实施 / 我方交付人员 | 同上 | `属性：测试/实施/我方交付人员 —— 不合格（§2.2 排除「测试 / 实施 / 我方交付人员」），不计入 N` |
| X3 | AI 代理（含浏览器自动化、WorkBuddy 之类） | 不是真人；2026-11-14 例会已按此改判过一场 | `属性：AI 代理/自动化 —— 非真人（§2.2 排除「AI 代理」），不计入 N`；**不生成记录纸** |
| X4 | 受训过的复测者 | 培训即提示 | `属性：受训过的复测者 —— 不合格（§2.2 排除「受训过的复测者」），不计入 N` |
| X5 | 随机第三方（非本项目业务人员） | roadmap 明文排除 | `属性：随机第三方 —— 不合格（§2.2 排除「随机第三方」），不计入 N` |

X1–X5 是本包的简写代号；冻结件 §2.2 那张表本身没有编号。每句括号里引的是冻结件那一行的原文，记录纸可以逐字对回冻结件。

**写在哪里。** 记录纸 §6.1 只有一处对应的勾选框：`是否开发者/测试/我方人员 ☐否（合格） ☐是（不合格，本场作废）`。它只覆盖 X1 与 X2。X4、X5 在该格不勾，改为在「用户代号 / 岗位」那一行的括注位置写整句，例如：

`U2 / 财务（属性：受训过的复测者 —— 不合格，§2.2 排除「受训过的复测者」）`

该场作废，改判由复核人做，不由主持人当场做。

### 2.2 项目级不合格：整张名单一起作废

这几条是 §2.1 的不合格项，不是 §2.2 的个人排除项；但项目若命中，名单上写谁都一样不成立。写进实例件 A1 / A15 的备注，**不要写进某个人的行里**：

| 代号 | 情形（§2.1 原文） | 后果 |
|---|---|---|
| P1 | 只有 demo 数据，或只有我方人员在用 | 项目不成立；名单上无人计入 |
| P2 | 用户是开发者、测试人员，或按 recipe 复现的工程师 | 那是 `YD-28` 的口径，不是本条 |
| P3 | 用户是随机第三方，或由 AI 代理模拟操作 | 项目不成立 |
| P4 | 只有受训过的复测者 | 项目不成立 |

### 2.3 一个人同时是两样

开发者本人也兼做业务、我方交付工程师也占着经办岗位 —— **排除项优先。** 这条测的是「独立的人能不能把活干完」；一个从里面就知道页面在哪的人给不出这个答案。照实记下来，不要取平均把它抹掉。

## 3. N 的计数口径

### 3.1 定义

**N = 随实例件一起冻结的那份名单里，§1 第 8 栏判「算」的行数。** 它数的是人，不是场次、不是填了几行、不是请了几个人。

### 3.2 不足三人

项目实际有几个人就写几个人。不足三人如实记 N = 1 或 N = 2，并照 §4.5 写一句：**「样本小，结论只对这 N 人成立」**。不凑人、不拉人替补、不从别的项目借人。

### 3.3 N = 0

N = 0 即判 **「未达成（无具名真实业务用户）」**。不得写成达标，不得写成「暂无用户」，不得写成「延期」。这是 roadmap 原话，也是启动方案 G1 的停止条件。

### 3.4 冻结之后不得增补

- 名单在实例件冻结**之前**进 A2。
- **冻结之后一个人都不能加**：不是后来的自愿者，不是当天恰好在场的人。
- 唯一允许的变动是**名单内换人**——两个已冻结的代号互换，或名单上的人顶替名单上的人。即便如此也要写进 `yd43-corrections-<YYYYMMDD>.md`：换下谁、换上谁、为什么、以及两人是否已经进过场次。
- 被换下的人如果已经跑过，**他的场次记录原样保留**：不覆盖、不删除，由更正件说明变动。

### 3.5 一人跑两组

AI 组和人工组优先用不同的人。同一人跑两组（§5.5）须：间隔 **≥ 24 小时**、当天只跑一组、用不同的对象实例，并记下先后顺序。**N 按人只算一次**，跑两组不会把 N 抬高。

### 3.6 名单数 N 与到场数 M（登记口径，不改判据）

名单上的人没来，不得从名单外补人。两个数都记：

- **N** = 冻结名单（A2 上写的那个数）；
- **M** = 实际进场跑了场次的人数。

判定按 M 算；报告里两个数都写，例如「名单 N = 3，到场 M = 2」。名单上没跑的人记「无场次」，既不记通过也不记失败。

### 3.7 一律不计入的人

N5 场次里的具名读者、任何验收读者、被拉来凑数的同事、被带着走过一遍流程的人。启动方案 §8 明文禁止把 N5 的读者当 YD-43 用户复用。

## 4. 现场知情同意话术与记录方式

### 4.1 那一句（照读，逐字，不加话）

```text
这场会全程录屏，可能还会截图，也会用到你正在处理的真实业务数据；这些只留在我们内部核对，不对外发送——你现在同意开始吗？
```

**在录屏开始之前**读。它同时是 §2.3 的第一项进入条件和 §8.5 的同意要求。

### 4.2 怎么记

- 回答记进记录纸，**记到秒**：`同意录屏：是 / __:__:__`。
- 这句话必须**在录屏里听得见**——主持人不入镜（§7.5），但声音要入。只存在于记忆里的同意不算。
- **2026-11-27 定案：这一行固定追加，每次打印都加。** 模板里没有这一行而 §8.5 要求把内容记进去，所以每次打印都在 §6.1 表尾加下面一行：

```text
| 同意录屏 | ☐ 是 / `__:__:__`　☐ 撤回 / `__:__:__`（§8.5） |
```

追加它不加字段、不改判据，只是给一条已经存在的要求补上落点（见 §8.2）。漏印这一行的那张纸**重打**，不手写补、不将就着用。

### 4.3 什么不算同意

- 沉默、点头、「他没反对」、「上周跟他说过了」。
- §1 第 7 栏的预登记勾选。
- 由上级替他答的同意。
- 录屏已经开始之后才给的同意。

命中任何一条，§2.3 未满足，**本场不开跑**——按 §2.5 记「未测（环境）」，不记到用户头上。

### 4.4 撤回

用户随时可以撤回。撤回即按 §2.5 中止本场，录屏封存不外发，记录纸写 `同意录屏：撤回 / __:__:__`。不劝、不追问理由；除非用户自己先提，否则不要提议「不录屏继续」。

## 5. 代号与真名的对照表处理规则

### 5.1 规则

记录纸上**只有代号和岗位**。真名另册（§2.2：「姓名可用代号；存档另附对照表，不放进记录纸」）。一份对照表对应一个已冻结的实例件版本。

### 5.2 对照表装什么

| 代号 | 姓名 | 岗位 | 所属单位 | 账号（可选） | 登记人 | 登记时间 |
|---|---|---|---|---|---|---|
| `U1` | | | | | | |
| `U2` | | | | | | |
| `U3` | | | | | | |

### 5.3 放在哪（2026-11-27 定案）

**定：一份电子对照表，放 `D:/Rain6fish/handoff/yd43-roster-<YYYYMMDD>.md`。**

为什么不是纸册：

- 同一个冻结件里的 §2.2 明文写着「存档另附对照表」——这是授权，不是疏漏。
- §0.4 没有列举这个文件，且写着「其余一律不许」。缺口用**如实登记**补上：`yd43-corrections-*.md` 里记一条，写明文件与依据，现成文本在 §8.3。
- §8.5 本来就允许内部归档保存含真实客户名、手机号的原件。对照表没有引入归档里还没有的那类暴露。
- 只靠纸册，一旦丢失，代号与人的唯一对应就没有了重建路径；记录纸会永久变成匿名的。

跟着这条定案走的规矩：

- 在 `yd43-run-*/` 之外，永不进证据目录，永不进 `SHA256SUMS.txt`，永不上传，永不进任何 `-redacted` 副本或对外交件；
- 一个已冻结的实例版本对应一份；**只追加**——换人加一行，绝不改写原有行；
- 它的 SHA-256 记在更正件那一条里，与登记并列。哈希不含任何姓名，却能事后证明这份对照表没被调包；
- **唯一的例外：** 客户合规要求磁盘上不得留员工姓名时，改用纸册。同一条更正记录改写「纸册」，A13 备注写明纸册放在谁手里。这一条由客户定，不图省事。

对照表**不参加**三者对账，**不是**证据文件，**不发给任何人**。

### 5.4 换人也留痕

换人时旧行保留（不覆盖、不删除）；新来的人拿**新代号**——同一实例版本内代号永不复用。更正件里两个代号都写，并写理由。

### 5.5 什么绝对不能出现在哪

| 绝不能出现在 | 只能出现在 |
|---|---|
| 记录纸 §6.1 的任何字段 | 对照表 |
| 记录纸 §6.3 提示台账（那里逐字引用户原话——引话不引名；若用户自己报了名字，换成代号并注「用户自述姓名」） | —— |
| 场次头、报告、roadmap 该行、commit message | 对照表 |
| 任何 `-redacted` 对外副本 | —— |
| 录屏文件名 | —— |

**代号本身不等于可外发。** 原件照样受 §8.5 脱敏规则约束，与有没有出现姓名无关。

## 6. 填完自检清单（名单进 A2 之前逐条打勾）

- [ ] §1 各行由项目方填写，不是我方代填；第 10 栏有填表人。
- [ ] 每一行都有代号、岗位，第 4 栏已答，第 5 栏只呈现一种状态。
- [ ] 没有任何一行写了真名；真名只在对照表里（§5）。
- [ ] 每个「不算」的行都带了 §2.1 的逐字措辞和对应 X 代号。
- [ ] 没有为凑够三人往里加人；N 等于判「算」的行数。
- [ ] 若 N = 0，已写成「未达成（无具名真实业务用户）」，且不排任何场次。
- [ ] 每个计入的人第 6 栏都是「是」并写了角色名——没有 `admin`、没有超管。
- [ ] 计入的人里没有 N5 的读者、没有验收读者、没有被带着走过一遍流程的人。
- [ ] 名单在实例件冻结之前完成；冻结时间有记录。
- [ ] 对照表是 §5.3 定下的那份另册（或客户的纸册例外已记录）；路径进了 A13 备注，SHA-256 进更正件，本包内没有口令、没有完整账号清单。
- [ ] 第 7 栏的预登记被标成预登记，没有被当成现场同意。
- [ ] 记录纸本次打印含 §4.2 追加的「同意录屏」行。

## 7. 每一项落在哪

| 本包 | 实例槽位 | 记录纸 | 说明 |
|---|---|---|---|
| §1 第 1–5 栏 | A2 | §6.1 代号 / 岗位 | 真名不出 §5 |
| §1 第 6 栏 | A2 备注、A5 | §6.1 账号 | 须真实业务角色（§2.3） |
| §1 第 7 栏 | A15（合规） | 现场填追加的同意行 | 预登记 ≠ 同意 |
| §1 第 8–9 栏 | A2 合计 N | —— | 排除措辞按 §2.1 |
| §3 | A2 合计 N | —— | N = 0 ⇒ 未达成 |
| §4 | A15 | §6.1 | 录屏前照读 |
| §5 | A13 备注（只写位置，不写对照表本身） | —— | §5.3 定下的那份另册 |

## 8. 两处定案

这两处初稿里都是悬着的。**2026-11-27 定案**——名单还不存在、实例层还没冻结的时候，也是唯一还来得及定的时候。

| 事项 | 定案 | 依据 |
|---|---|---|
| 代号与真名对照表 | 一份电子件，`D:/Rain6fish/handoff/yd43-roster-<YYYYMMDD>.md`，在 `yd43-run-*/` 之外 | §2.2 授权另附对照表；§0.4 未列举该件，故在更正件里如实登记（§8.3） |
| 同意录屏那一行 | 每次打印的记录纸，都在 §6.1 表尾追加一行 | §8.5 要求同意记进记录纸；模板没印这一行 |

两处都不改判据、不改任务、不改标准、不改对照。第一处多一个文件，并把它写明白；第二处只是给一条已经存在的要求补上落点。日后若判定其中一条动了冻结层，补救办法不是悄悄改：作废、重冻、旧件保留。

**何时生效。** 对照表规矩从实例冻结起生效；记录纸那一行从第一张打印起生效。在此之前本节还能改；在此之后，只能靠更正件或新实例件动它。

### 8.1 第一处——对照表是单独一份电子件

一份，放内部归档，按 §5.3 的规矩。**只追加**，换人不会把原来的对应抹掉。SHA-256 写进更正件那一条；哈希不含姓名，却能事后证明这份表没被调包。

### 8.2 第二处——同意行固定追加进 §6.1

每次打印都带 §4.2 的那一行；漏印的纸重打。这一行是 §8.5 的落点，不是新字段。

### 8.3 实例冻结时粘进 `yd43-corrections-<YYYYMMDD>.md` 的现成文本

照抄；只填 `<YYYYMMDD>`、条目序号与两处哈希空位。若走客户的纸册例外，把第 1 条第一句换成方括号那句。

```markdown
## C<n>. 两处落点（2026-11-27 定；不改判据）

1. **代号与真名对照表。** 依 §2.2「存档另附对照表，不放进记录纸」，另立
   `yd43-roster-<YYYYMMDD>.md`，存于内部归档 `D:/Rain6fish/handoff/`。
   不在 `yd43-run-*/` 内，不进 `SHA256SUMS.txt`，不外发。
   §0.4 的允许文件清单未列举该件；本条即该项的如实登记。
   SHA-256：`____`（每次追加后重算并登记）。
   〔若走纸册：对照表为纸质册，由 ______ 保管，无电子副本。〕
2. **记录纸 §6.1 追加一行。** `| 同意录屏 | ☐ 是 / __:__:__　☐ 撤回 / __:__:__（§8.5） |`
   模板未印该行，而 §8.5 要求把同意记进记录纸；追加一行不改任何已有字段、不改判据。
```

> 更正件与冻结件同以中文为主，故实际粘进去的是上面这段中文；英文对照在 Part I §8.3。

---

*本件为开测前材料件：只提供空白表与核对口径，不含任何真实值、不含读数、不改判据、不替代实例件。名单经项目方填写、核对后进 A2，随实例件冻结。两处落点已于 2026-11-27 定案（§8）。*
