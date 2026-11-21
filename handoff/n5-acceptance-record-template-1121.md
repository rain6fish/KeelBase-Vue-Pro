# N5 acceptance session record — template / N5 验收场次记录——模板

<!--
How to use: copy this file into the session's evidence directory as 00-session-record.md, fill one
language block, and leave the other block untouched with the one-line note given in §4. Do not edit
this template itself.

用法：把本文件复制进该场次的证据目录，改名 00-session-record.md，只填一个语言块；另一块保持原样，
按 §4 加一行说明。不要改本模板。
-->

## English

### 1. What this record is for

One named non-developer runs one real acceptance task on a published pin. The record is the session's
primary evidence; the screenshots, the recording and the CSV are its annexes. It is filled by the host,
signed by the participant, and frozen on the day of the session. A blank cell is a failure, never a
zero.

### 2. The form

Copy everything between the two rules below into `00-session-record.md` and fill it.

---

**A. Session identity**

| # | Item | Value |
|---|---|---|
| A1 | Record id | `n5-<YYYYMMDD>-<slug>` |
| A2 | Participant — full name | |
| A2a | Participant — account / staff number | |
| A2b | Participant — team and role | |
| A2c | Attested non-developer | `yes` — attested by ________ at ________ (must be a named person, not "obviously") |
| A3 | Host — full name and account | |
| A4 | Developer in the room | `no` / `yes: <name> — reason ________` |
| A5 | Slot — start | `YYYY-MM-DD HH:mm:ss UTC+08:00` |
| A5a | Slot — end | `YYYY-MM-DD HH:mm:ss UTC+08:00` |
| A5b | Duration | ________ min |
| A5c | How the two ends were read | `date -Is` on both sides / host log by user agent / recording length — say which, and what was not recorded |
| A6 | Published pin — runtime version | e.g. `0.1.20` |
| A6a | Pin — tag object and commit | tag object `<sha>` → commit `<sha>` |
| A6b | Pin — host POM coordinates | `keelbase4j-core` / `keelbase4j-protocol` / `keelbase4j-springai`, all at `<version>` |
| A6c | Pin — bytes reading | `node scripts/check-runtime-pin-bytes.mjs` → three sha1 match the published `.sha1` (`yes`/`no`, plus the three sha1) |
| A7 | Host build under test | host commit `<sha>`; image digest if deployed from an image |

**B. The task run**

| # | Item | Value |
|---|---|---|
| B1 | Task, as asked of the participant | one sentence, in the participant's own words |
| B2 | Object — type + business key | `type:key`, e.g. `crm_customer:9005` |
| B3 | Object — name as displayed | masked name exactly as shown |
| B4 | Operation performed | e.g. change the customer name; state the before and after values |

**C. Six answers, cell by cell** (`02-six-answers.csv`, and `05-six-answers.png`)

Every cell quotes the page or CSV **verbatim**, including `—` and `未记录 —— …`. A recorded
"not recorded" is an answer and must be quoted; an empty cell is a failure.

| # | Question | Answer, verbatim | Evidence (file:row) | Complete |
|---|---|---|---|---|
| C1 | Who | | `02-six-answers.csv:<row>` | `yes` / `no` |
| C2 | When (with offset) | must carry `UTC±HH:MM` | | `yes` / `no` |
| C3 | Which business object | type + key + masked name | | `yes` / `no` |
| C4 | Changed to what (before → after) | before, and what was or was not recorded for after | | `yes` / `no` |
| C5 | Who confirmed | which gate, and the approver's name when there is one | | `yes` / `no` |
| C6 | Outcome | the outcome word and what it means | | `yes` / `no` |

**D. The second approver, named** (`02-six-answers.csv` row where C6 is `已批准`)

| # | Item | Value |
|---|---|---|
| D1 | Approver — name and account, as shown | `name（account #n）`; `未记录` is a gate failure, not an entry |
| D2 | Decision row matched to which write row | row time + `executionId` shared with the write rows (quote it) |
| D3 | Verdict | `named` / `not named — reason ________` |

**E. `/audit/verify`** (`03-audit-verify.json`)

| # | Item | Value |
|---|---|---|
| E1 | Called at | `YYYY-MM-DD HH:mm:ss UTC+08:00` |
| E2 | `valid` | `true` / `false` |
| E3 | `checked` and `brokenIndex` | `<n>` / `—` or `<index>` |
| E4 | Called again after the run | at ________, `valid` = ________ |

**F. Second entry point, lined up** (`06-second-entry-action-centre.png`, `07-second-entry-operation-log.png`)

Entry A is the audit chain page; entry B is the host's own operation log, the small table inside the
action centre. The two trails share no id and word the act differently on purpose; they must line up
on object, time and person without guessing.

| # | Item | Entry A | Entry B | Matches |
|---|---|---|---|---|
| F1 | Business object (key + masked name) | | | `yes` / `no` |
| F2 | Time, verbatim | | | `yes` / `no` — record the delta if any |
| F3 | Person (name + account) | | | `yes` / `no` |
| F4 | Act wording | tool name | operation name | difference is expected — quote both |
| F5 | Verdict | `matches` / `does not match — ________` | | |

**G. Zero help** (`01-recording.mp4`)

A help request is any question put to the host or to anyone else present, about what to do, where to
look, what a word means, or whether something is wrong. The required count is zero.

| # | Item | Value |
|---|---|---|
| G1 | Help requests — count | `0` required |
| G1a | If not zero: time, question verbatim, who answered, answer verbatim, effect on the result | one row per request |
| G2 | Participant's own statement | "I asked nobody for help and was not prompted" — signed ________ at ________ |
| G3 | Host's statement, four parts | did not point at the row: `yes`/`no`; did not expand for the participant: `yes`/`no`; did not translate a term: `yes`/`no`; did not state whether the product can do something: `yes`/`no` |
| G4 | Anything done to the page or the environment during the session (restart, refresh forced, fix, seed) | `none` / list each with its time — each is an exception in I, not a silent repair |

**H. Evidence inventory and hashes**

| # | File | What it is | Bytes | sha256 |
|---|---|---|---|---|
| H1 | `00-session-record.md` | this record | | hash after the last edit (also in J4) |
| H2 | `01-recording.mp4` | screen recording, from before the first click to after the signature | | |
| H3 | `02-six-answers.csv` | the page's export; write its original filename here if it was renamed | | |
| H4 | `03-audit-verify.json` | the `/audit/verify` response, saved as returned | | |
| H5 | `04-audit-chain.png` | the audit chain page after the run | | |
| H6 | `05-six-answers.png` | the six-answer panel for the run's row | | |
| H7 | `06-second-entry-action-centre.png` | entry B, the host operation log table | | |
| H8 | `07-second-entry-operation-log.png` | entry B opened on its own page, if it has one | | |
| H9 | `08-host.log` | host requests for the slot, filtered by the participant's user agent | | |
| H10 | `09-prep.log` | what was prepared before the participant arrived, if anything | | |
| H11 | `SHA256SUMS.txt` | `sha256sum` over every file above, produced last | | |

**I. Exceptions**

Anything that departed from the plan is written here, never repaired in place: a help request, a
network or runtime failure, a re-run, a missing tool, a participant substitution, a slot overrun.

| # | Time | What happened | Effect on the result | Who decided to continue |
|---|---|---|---|---|
| I1 | | | | |

**J. Sign-off**

| # | Item | Value |
|---|---|---|
| J1 | Participant — signature, name and time | |
| J2 | Host — signature, name and time | |
| J3 | Verdict | `PASS` / `PASS WITH NOTES — ________` / `FAIL — gates failed: ________` |
| J4 | This file's own sha256, computed after J3 | |
| J5 | Archived to | private repository path, byte-identical copy |

---

### 3. Evidence directory layout

One directory per session, flat, numbered. Recordings and CSVs stay outside the public repository.

```
handoff/n5-evidence-<YYYYMMDD>/
  00-session-record.md            the filled form from §2
  01-recording.mp4                whole session, one file
  02-six-answers-<stamp>.csv      the page's export, its own filename stamp kept
  03-audit-verify.json            the /audit/verify body, unedited
  04-audit-chain.png
  05-six-answers.png
  06-second-entry-action-centre.png
  07-second-entry-operation-log.png
  08-host.log
  09-prep.log                     only if something was prepared
  SHA256SUMS.txt                  sha256sum over every file above
```

The first four and `SHA256SUMS.txt` are required. A required file that cannot be produced fails the
session; say so in I and J3 rather than leaving its row blank.

### 4. Who fills what, when, and how

**Who.** The host fills A, B, C, D, E, F, H, I and J2. The participant fills G2 and signs J1. G1 is
recorded by the host and confirmed by the participant in G2. D1 is read off the page — never supplied
from memory, and never "corrected" because the name looks wrong.

**When.** A and the recording and `08-host.log` start are done before the participant's first click.
C to F and H are filled immediately after the run, while the page is still open. G, I and J are
filled before the participant leaves, and the record is frozen the same day. A later correction is a
dated line in I, never an edit to an earlier cell.

**One language block.** Fill the block in the language the session was run in. Leave the other block
untouched and write one line at its top:

```
This block is left unfilled by rule — the session ran in <language>.
```

**Names and files.** The directory is `n5-evidence-<YYYYMMDD>`; a re-run gets `-run2`, never an edited
first directory. Files keep their `NN-slug` names. The CSV keeps the page's own filename stamp; if it
is renamed at all, the original name is written in H3.

**Hashes.** Compute after the file is final: stop the recording, do not open the CSV in a spreadsheet
and re-save it (a re-save changes the bytes), then run

```
sha256sum <file>
```

or, in PowerShell,

```
Get-FileHash -Algorithm SHA256 <file>
```

Write the hex in lower case. `SHA256SUMS.txt` is produced last, over every file, and `00-session-record.md`
carries its own hash in J4 — computed after J3, so it cannot sit inside its own file's table.

**Zero help.** Count every question. One is enough to fail G1; the row is written verbatim, with who
answered and what they said, because the count alone proves nothing about what was given away. A
technical failure that the host repaired is an exception in I, not a help request — record both, do
not merge them.

**Exceptions.** A re-run after a failure is a new directory and a new record; the failed one stays.
A missing value the runtime did not record is quoted as `未记录` in C and still counts as an answer —
it fails only the gate that needs it (D1, or F where the value is absent on both sides). An
unrecorded help request discovered later also goes in I, and the verdict is revised with its date.

**Archive.** The evidence directory stays at `D:/Rain6fish/handoff/n5-evidence-<YYYYMMDD>/`. The
record alone is copied byte-identically into the private repository under `notes/审计读者/`, and J5
names that path; the copy's hash equals J4.

**Stop condition.** If no participant is named by the date the weekly plan gives, the session is not
run and the goal is recorded as downgraded. A record is never opened to hold that decision.

### 5. What this record does not prove

It is one session with one participant on one pin. It does not show that the product is usable by
anyone else, that the pin is reproducible, or that the six answers hold for other objects. It proves
that these five gates were checked and passed once, on this pin, by a named person who was not helped.

### 6. Where each rule comes from

- `keelbase-docs/KEELBASE-AUDIT-SEARCH.md` §5 — the six-column CSV, its RFC 4180 escaping, and the
  marks it writes when an answer is missing.
- `keelbase-docs/KEELBASE-AUDIT-SEARCH.zh-CN.md` §9 — the second read face, the one the generator
  produces.
- `keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs` — the only definition of the six questions
  and of `leaksIn`.
- `keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue` — the chain page, the
  second-entry hint, and the `/audit/verify` call.
- `scripts/check-runtime-pin-bytes.mjs` — the reading A6c asks for.
- `scripts/check-path-refs.mjs` — every repository path cited here resolves under its rule.
- `handoff/secondentry-1121.md` — the N6 work that made object, time and person line up on both
  entries; F checks exactly those three.

## 中文

### 1. 这份记录是干什么的

一位**具名非开发者**，在**已发布的 pin** 上完成一次真实验收任务。这份记录就是这一场的主证据；截图、
录屏与 CSV 是它的附件。主持人填，参与者签字，当日冻结。**空格即失败，空格不等于零。**

### 2. 表单

把下面两条分隔线之间的内容复制进 `00-session-record.md`，逐格填。

---

**A. 场次要素**

| # | 项 | 值 |
|---|---|---|
| A1 | 记录编号 | `n5-<YYYYMMDD>-<slug>` |
| A2 | 参与者——姓名 | |
| A2a | 参与者——账号 / 工号 | |
| A2b | 参与者——部门与角色 | |
| A2c | 非开发者声明 | `是` —— 由 ________ 于 ________ 声明（须是具名人，不能写「显然是」） |
| A3 | 主持人——姓名与账号 | |
| A4 | 开发者在场 | `否` / `是：<姓名> —— 原因 ________` |
| A5 | 时段——开始 | `YYYY-MM-DD HH:mm:ss UTC+08:00` |
| A5a | 时段——结束 | `YYYY-MM-DD HH:mm:ss UTC+08:00` |
| A5b | 时长 | ________ 分钟 |
| A5c | 两头是怎么读出来的 | 两边 `date -Is` / 宿主日志按 user agent / 录屏时长 —— 写明取的是哪一种，以及哪一种没留 |
| A6 | 已发布 pin——运行时版本 | 例如 `0.1.20` |
| A6a | pin——tag 对象与提交 | tag 对象 `<sha>` → 提交 `<sha>` |
| A6b | pin——宿主 POM 坐标 | `keelbase4j-core` / `keelbase4j-protocol` / `keelbase4j-springai` 三处同为 `<version>` |
| A6c | pin——字节读数 | `node scripts/check-runtime-pin-bytes.mjs` → 三个 sha1 与发布库 `.sha1` 一致（`是`/`否`，并写下三个 sha1） |
| A7 | 被测宿主构建 | 宿主提交 `<sha>`；若由镜像部署，记镜像 digest |

**B. 执行的任务**

| # | 项 | 值 |
|---|---|---|
| B1 | 交给参与者的任务 | 一句话，用参与者自己的说法 |
| B2 | 业务对象——类型 + 主键 | `类型:主键`，例如 `crm_customer:9005` |
| B3 | 业务对象——显示名 | 照屏上原样抄，含掩码 |
| B4 | 执行的操作 | 例如修改客户名称；写清改前与改后的值 |

**C. 六问逐格**（`02-six-answers.csv` 与 `05-six-answers.png`）

每一格都**逐字**抄页面或 CSV，包括 `—` 与 `未记录 —— …`。写下来的「未记录」**也是答案**，必须原样引用；
空格才是失败。

| # | 问 | 原文 | 证据（文件:行） | 是否完整 |
|---|---|---|---|---|
| C1 | 谁 | | `02-six-answers.csv:<行号>` | `是` / `否` |
| C2 | 何时（带时区） | 必须带 `UTC±HH:MM` | | `是` / `否` |
| C3 | 哪个业务对象 | 种类 + 主键 + 掩码后的名字 | | `是` / `否` |
| C4 | 改成什么（改前 → 改后） | 改前的值，以及改后记了什么、没记什么 | | `是` / `否` |
| C5 | 谁确认 | 记下的是哪道闸；有批准人时写名字 | | `是` / `否` |
| C6 | 结果 | 结局词，以及它意味着什么 | | `是` / `否` |

**D. 第二批准人具名**（C6 为 `已批准` 的那一行）

| # | 项 | 值 |
|---|---|---|
| D1 | 批准人——照屏上的姓名与账号 | `姓名（账号 #n）`；写 `未记录` 就算这一项不过，不是「填了」 |
| D2 | 这道裁决行对上是哪一条写入行 | 行时刻 + 与写入行共享的 `executionId`（照抄） |
| D3 | 结论 | `已具名` / `未具名 —— 原因 ________` |

**E. `/audit/verify`**（`03-audit-verify.json`）

| # | 项 | 值 |
|---|---|---|
| E1 | 调用时刻 | `YYYY-MM-DD HH:mm:ss UTC+08:00` |
| E2 | `valid` | `true` / `false` |
| E3 | `checked` 与 `brokenIndex` | `<n>` / `—` 或 `<下标>` |
| E4 | 跑完后再调一次 | 于 ________，`valid` = ________ |

**F. 第二入口对照**（`06-second-entry-action-centre.png`、`07-second-entry-operation-log.png`）

入口 A 是审计链页；入口 B 是宿主自己的操作日志，即行动中心里那张小表。两条轨之间没有共享编号，
对动作的叫法**故意**不同；核对的要求是对象、时间、谁三处**不用猜**就能对上。

| # | 项 | 入口 A | 入口 B | 对得上 |
|---|---|---|---|---|
| F1 | 业务对象（主键 + 掩码名） | | | `是` / `否` |
| F2 | 时刻，逐字 | | | `是` / `否` —— 有差就写下差值 |
| F3 | 谁（姓名 + 账号） | | | `是` / `否` |
| F4 | 动作的叫法 | 工具名 | 操作名 | 不同是预期之内 —— 两边都抄下来 |
| F5 | 结论 | `对得上` / `对不上 —— ________` | | |

**G. 零求助**（`01-recording.mp4`）

「求助」指参与者向主持人或在场任何人提出的任何问题：该点哪里、该看哪里、这个词什么意思、是不是出错了。
要求次数为**零**。

| # | 项 | 值 |
|---|---|---|
| G1 | 求助次数 | 要求 `0` |
| G1a | 若非零：时刻、原话、谁回答、回答原话、对结果的影响 | 每条一行 |
| G2 | 参与者本人声明 | 「我没有向任何人求助，也没有得到提示」—— 由 ________ 于 ________ 签字 |
| G3 | 主持人声明，四项 | 未指行：`是`/`否`；未替展开：`是`/`否`；未翻译术语：`是`/`否`；未说明能力有无：`是`/`否` |
| G4 | 场次中对页面或环境做过的任何事（重启、强制刷新、修复、补数据） | `无` / 逐条写时刻 —— 每一条都是 I 里的异常，不是悄悄修好 |

**H. 证据清单与哈希**

| # | 文件 | 是什么 | 字节 | sha256 |
|---|---|---|---|---|
| H1 | `00-session-record.md` | 本记录 | | 最后一次修改后算（同时写进 J4） |
| H2 | `01-recording.mp4` | 录屏，从第一次点击之前到签字之后 | | |
| H3 | `02-six-answers.csv` | 页面导出的原件；若改过名，把原文件名写在这里 | | |
| H4 | `03-audit-verify.json` | `/audit/verify` 的答复，照原样保存 | | |
| H5 | `04-audit-chain.png` | 跑完后的审计链页 | | |
| H6 | `05-six-answers.png` | 本次那一行的六问面板 | | |
| H7 | `06-second-entry-action-centre.png` | 入口 B，宿主操作日志那张表 | | |
| H8 | `07-second-entry-operation-log.png` | 入口 B 若另有独立页面，开在那里 | | |
| H9 | `08-host.log` | 时段内的宿主请求，按参与者的 user agent 筛出 | | |
| H10 | `09-prep.log` | 参与者到场前准备过的东西（若有） | | |
| H11 | `SHA256SUMS.txt` | 对以上每个文件跑 `sha256sum`，最后生成 | | |

**I. 异常**

任何偏离计划的事都写在这里，**不要就地修好**：一次求助、一次网络或运行时故障、一次重跑、缺一件工具、
临时换人、时段超时。

| # | 时刻 | 发生了什么 | 对结果的影响 | 谁决定继续 |
|---|---|---|---|---|
| I1 | | | | |

**J. 签字**

| # | 项 | 值 |
|---|---|---|
| J1 | 参与者——签字、姓名与时刻 | |
| J2 | 主持人——签字、姓名与时刻 | |
| J3 | 结论 | `通过` / `带注通过 —— ________` / `不通过 —— 未过的门：________` |
| J4 | 本文件自身的 sha256，在 J3 之后再算 | |
| J5 | 归档到 | 私库路径，字节一致的副本 |

---

### 3. 证据目录布局

一场一个目录，扁平、带序号。录屏与 CSV 留在公开仓之外。

```
handoff/n5-evidence-<YYYYMMDD>/
  00-session-record.md            由 §2 填好的表单
  01-recording.mp4                全场次，一个文件
  02-six-answers-<时间戳>.csv      页面导出的原件，保留它自己的文件名时间戳
  03-audit-verify.json            `/audit/verify` 的答复，不加工
  04-audit-chain.png
  05-six-answers.png
  06-second-entry-action-centre.png
  07-second-entry-operation-log.png
  08-host.log
  09-prep.log                     只在准备过东西时才有
  SHA256SUMS.txt                  对以上每个文件
```

前四件与 `SHA256SUMS.txt` 是**必交**的。一件必交文件产不出来，这一场就是不通过：在 I 与 J3 里写明，
不要把那行空着。

### 4. 谁填、何时填、怎么填

**谁。** 主持人填 A、B、C、D、E、F、H、I 与 J2；参与者填 G2 并签 J1；G1 由主持人记、由参与者在 G2 里确认。
D1 从页面上**读** —— 不凭记忆填，也不因为名字看着不对就去「纠正」。

**何时。** A、开始录屏、开始收 `08-host.log` 都在参与者第一次点击**之前**做完。C 到 F 与 H 在跑完之后、
页面还开着时立即填。G、I、J 在参与者离开**之前**填完，记录**当日冻结**。事后订正是 I 里一条带日期的行，
不是回头改前面某一格。

**只填一个语言块。** 用这一场实际使用的语言填那一块；另一块保持原样，并在块首写一行：

```
本块按规则留空 —— 本场次以中文进行。
```

**命名与文件。** 目录名 `n5-evidence-<YYYYMMDD>`；重跑用 `-run2`，**不覆盖**第一场的目录。文件沿用
`NN-slug` 名。CSV 保留页面自己的文件名时间戳；确实改了名，就在 H3 写下原名。

**哈希。** 文件定稿之后再算：停掉录屏、**不要**用表格软件打开 CSV 再另存（另存会改字节），然后

```
sha256sum <文件>
```

PowerShell 里则用

```
Get-FileHash -Algorithm SHA256 <文件>
```

十六进制**小写**抄写。`SHA256SUMS.txt` 最后生成、覆盖全部文件；`00-session-record.md` 自己的哈希写在 J4
—— 在 J3 之后算，所以它不可能出现在自己文件的表里。

**零求助。** 每一问都要数。一次就足以让 G1 不过；那一行要逐字写下，含谁回答、答了什么 —— 光有次数，
证明不了到底给了多少。宿主修好的一次技术故障是 I 里的**异常**、不是求助：两样都记，不要合并。

**异常。** 故障后的重跑，是**新目录、新记录**；失败那一场原样留着。运行时没记下的值，在 C 里照抄
`未记录`，它仍然算答出了这一问 —— 只让真正需要它的那道门不过（D1，或 F 里两边都没有这个值）。事后才发现的
求助同样写进 I，结论按订正当日改一次。

**归档。** 证据目录留在 `D:/Rain6fish/handoff/n5-evidence-<YYYYMMDD>/`。**只把记录**字节一致地复制进私库
`notes/审计读者/`，J5 写那个路径；副本的哈希等于 J4。

**停止条件。** 到了周计划给的那个日期仍无具名人，这一场**不跑**，目标按降级记录。**不**开一份记录去装这个决定。

### 5. 这份记录证明不了什么

它是一个人、一个 pin、一场。它不证明别人也能用，不证明这个 pin 可复现，也不证明六问在别的对象上同样成立。
它证明的是：这五道门，在**这个** pin 上，由一个**没被帮过**的具名人，被检查并通过了**一次**。

---

### 6. 各条规则的出处

- `keelbase-docs/KEELBASE-AUDIT-SEARCH.zh-CN.md` §5 —— 六列 CSV、它的 RFC 4180 转义，以及缺答案时写下的记号；
  §9 —— 生成器产出的那条读面。
- `keelbase-docs/KEELBASE-AUDIT-SEARCH.md` §5 —— 同上，英文那一份。
- `keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs` —— 六问与 `leaksIn` 的唯一定义。
- `keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue` —— 审计链页、第二入口提示、
  `/audit/verify` 的调用点。
- `scripts/check-runtime-pin-bytes.mjs` —— A6c 要的那道读数。
- `scripts/check-path-refs.mjs` —— 本仓写到自己身上的每条路径都按它的规则解析得到。
- `handoff/secondentry-1121.md` —— N6 让对象、时间、谁在两条入口上对上；F 段逐项对的就这三样。
