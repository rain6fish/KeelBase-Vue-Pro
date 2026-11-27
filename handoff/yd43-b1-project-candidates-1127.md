# YD-43 B1 — Real Delivery Project Candidate Inventory (2026-11-27) / YD-43 B1 —— 真实交付项目候选盘点（2026-11-27）

---

# Part I · English

> **Nature.** A read-only inventory, written for the user to pick from. It is not an instance file, not a judgement on any project, and not a substitute for B1 in `yd43-instance-ready-1118.md`.
>
> **Status claim.** **No project is judged qualified.** Nothing was filled into any instance slot, no client was contacted, no message was sent. The roadmap, the decision index and every plan document are unchanged; nothing was committed or pushed.
>
> **What "candidate" means here.** The four qualifying conditions are taken verbatim from `yd43-frozen-20261117T045650Z.md` §2.1: ① a real business use (the system serves a client or a team's real work, not a demo or self-practice); ② real business data (real records, or a production copy); ③ a named real business user; ④ the user already does this batch of work day to day. A project enters the candidate table only if **none** of the four is "clearly fails". Any condition left unproven keeps it at "candidate"; it can never be written as "qualified".
>
> **Sources read (read-only):** `yd43-frozen-20261117T045650Z.md` §2.1–§2.2; `yd43-prep-1126.md` §4 (B1); `yd43-instance-ready-1118.md` §1 S1 and §3 B1; `KeelBase-Private/KeelBase-Vue-Pro/roadmap.md` (whole file); `KeelBase-Private/notes/` — the CTO weekly meetings (`CTO每周例会/2026-10-31.md`, `2026-11-07.md`, `2026-11-14.md`, `2026-11-21.md`), the project weekly meetings (`项目周例会/2026-11-14.md`, `2026-11-21.md`), the monthly strategy review (`月度战略调研会/2026-11-08.md`), the reader records (`审计读者/`), the claim ledger (`会话认领约定.md`), the external-trial verification ledger; `D:/Rain6fish/KeelBase-Vue-Pro/handoff/` (`yd43-*`, `nextstage-abc-1126.md`, `cto-1128-decisions-1126.md`, `v1230-runbook-1126.md`); `D:/Rain6fish/handoff/` (file list and targeted greps).

## 1. One-line conclusion

**No candidate.** Across the records named above, **no real client delivery project is recorded** — not one with a client, a delivery stage and real business data. Every project-shaped object that does appear is a demo deployment, a self-use/module-onboarding rehearsal, or a test session with a named reader. The candidate list is empty **because the evidence says so**, not because the search was skipped.

## 2. Candidate table

| # | Project | Client / user side | Delivery stage | ① Real business use | ② Real business data | ③ Named real business user | ④ User does this work daily | Evidence | What is missing to qualify |
|---|---|---|---|---|---|---|---|---|---|
| — | *none* | — | — | — | — | — | — | — | — |

**Why the table is empty.** A row would need at least one unproven-but-not-disproven condition on all four axes. Each of the twelve entries actually found fails at least one axis outright (see §3), so none of them is even a candidate. The nearest thing to a delivery — `YD-28`'s `fms` module — fails ① and ② outright: it was delivered into **our own demo host**, with empty/seed tables.

## 3. Exclusion table — what looks like a project but is not

### 3.1 Deployments, modules and sessions

| # | Entry | What it actually is | Stage | ① | ② | ③ | ④ | Evidence (file:line) | To qualify it would need |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `demo2.keelbase.com.cn` (and the older `demo.keelbase.com.cn`) | A public demo deployment of the host, bootstrapped from scratch. | Running demo | **Clearly fails** — its stated purpose is a demo entry point | **Clearly fails** — built from seed scripts; the 2026-11-20 migration bootstrapped 174 tables from zero, no data migrated | **Clearly fails** — no business user; the users are our own people | **Clearly fails** — nobody does business on it | `roadmap.md:80` (`YD-6` "demo2 演示入口 … 与现有 demo 共存"); `roadmap.md:81` (`YD-7`); `roadmap.md:100` (`YD-41` "部署的种子清单"); project memory `demo2-migration-2026-11-20` (bootstrapped from zero, 174 tables) | A client would have to adopt this deployment for real work, with real data and named users — i.e. a different artefact, not this one |
| 2 | **FMS 财务模块** (`YD-28`'s "one delivery") | The yudao `fms` module enabled in **our** demo host, plus two hand-written Java files and a gate script — a module-onboarding delivery rehearsal. | Internal delivery rehearsal, closed 2026-10-16 | **Clearly fails** — delivered into our own host to prove module onboarding, not to serve a client | **Clearly fails** — the gate ran on empty/seed tables ("跑完 fms 三张表残留 0") | **Not proven** — no named user anywhere | **Not proven** — no one does this work daily | `roadmap.md:132` (`YD-28`: "交付已落：模块选定 `fms` 财务（第一个非 CRM），`yudao-server/pom.xml` 启用它 + 两处手写 Java") | A client whose finance staff actually use FMS daily, on their data; and that client would have to be named |
| 3 | Other local modules — CRM / PMS / BPM / system (`YD-7`, `YD-14`, `YD-15`, `M1`) | Modules switched on and wired into governance on the local/demo host for cost measurement. | Internal module onboarding | **Clearly fails** — self-use/measurement purpose | **Clearly fails** — seed data; the CRM "customers" are seed rows | **Not proven** | **Not proven** | `roadmap.md:81` (`YD-7` "本机启用七个模块"); `roadmap.md:129`–`130` (`YD-25`/`YD-26` scope); claim ledger `会话认领约定.md:1000` (seed customer rows `9003`/`9004`/`9005`) | Same as row 2 |
| 4 | `demo01` generated module | A generated demo module used for per-module cost readings. | Demo/measurement | **Clearly fails** | **Clearly fails** | **Not proven** | **Not proven** | `CTO每周例会/2026-10-31.md:79` (module cost list: "CRM 610/363 → BPM … → FMS 458/265 → demo01 498/328") | It is a measurement fixture; it would have to become a client module |
| 5 | **N5 session** (`n5rd` isolated stack, 2026-11-25) | A single acceptance session: one named non-developer reader ran an acceptance script on an isolated stack. | Test session, run | **Clearly fails** — an acceptance rehearsal, not a business | **Clearly fails** — isolated stack, database `n5rd`, seed account `#9901 李静` as the approver | **Clearly fails** — 张杰 / Alice, an office clerk, not a business user of any delivery project | **Clearly fails** — she does not do this work daily | `审计读者/N5-场次记录-2026-11-25.md:6` (reader 张杰 = Alice, 办公室职员); `:27` (approver `#9901` 李静, seed value); `:61` (db `n5rd`); `yd43-prep-1126.md:296` (explicitly: Alice must not be entered as an YD-43 user) | It would have to move to a client's real data with that client's own staff |
| 6 | **U1/U2 acceptance** (2026-11-17 "real stack") | Acceptance readings taken by **project operators** on a pinned build; the user ruled it "passed". | Acceptance reading, done | **Not proven** — no client is recorded as the beneficiary | **Not proven** — the record does not state the data source | **Clearly fails** — done by the project's own operators | **Not proven** | `项目周例会/2026-11-21.md:20` ("U1/U2 已由用户裁「通过」… E3 读数，但**不是**独立用户验证"); `:92` ("U1/U2 的验收是项目操作者在真栈上完成、由用户裁「通过」"); `:219` | A real business user, on that project's real data, doing it unsupervised |
| 7 | `kids-todo` (`kids-todo.keelbase.com.cn`) | A small personal to-do app hosted on the same machine family; used by the household, not by a client. | Personal/self-use | **Clearly fails** — self-use, no client | **Not proven** — no record of its data | **Not proven** — no business user is recorded | **Not proven** — no one does "this batch of business" on it | Project memory `project-kids-todo-hosting.md` (hosting, containers, nginx split). **No repo, no note and no roadmap row in this workspace** — see §5 | A client team adopting it for real work; today it is a family app |
| 8 | `KeelBase-App-X` | The mobile client of the delivery line, under development. | Not delivered | **Clearly fails** — no client, no requirement named | **Not proven** | **Not proven** | **Not proven** | `CTO每周例会/2026-11-21.md:544` ("交付线 … 完成一个真实业务闭环" — a target, not a result); `nextstage-abc-1126.md:54` (compile gate still configured off) | A green compile and a real client loop; it is a product line, not a delivery project |

### 3.2 Names that are data, placeholders or people — never projects

| # | Name found | What it is | Why it is not a project | Evidence |
|---|---|---|---|---|
| 9 | 万象商业服务有限公司 / 海州物流股份有限公司 / 明远置业集团有限公司 | **Seed customer records** in the demo CRM, primary keys `9005` / `9003` / `9004`. | They are rows inside a seed database, not client organisations. | `会话认领约定.md:1000` (the three names quoted as `beforeSnapshot.name` of seed customers) |
| 10 | "某某集团供应商准入项目" / "某某供应链管理有限公司" | **Fabricated examples** in the fill-in table, marked "示例，请替换". | They exist only to show what a slot looks like. | `yd43-instance-ready-1118.md:37`–`44` (S1 examples, explicitly "我编的假值") |
| 11 | 张杰 (Alice) · Matt · the fourth/fifth reader | **Individual readers**, not projects. | A reader is not a delivery project, and both are excluded as users by §2.2 (a non-technical non-party reader, and a random third party). | `审计读者/N5-场次记录-2026-11-25.md:6`; `审计读者/第六位读者场次记录-2026-11-11.md:6`, `:121` ("Matt 是**非项目方**、非技术") |
| 12 | The five review roles in the weekly meeting (交付负责人 / 测试 / 业务可用性 / 安全 / 记录员) | **AI-simulated** review perspectives. | They are a review device, not people in a delivery project. | `项目周例会/2026-11-21.md:5` ("均为 **AI 模拟**；不冒充真实独立人员或真实用户") |

## 4. Empty-list statement

**现有记录中无候选。** The records show the gap in their own words:

- `CTO每周例会/2026-10-31.md:74` and `2026-11-07.md:87`: "未复跑 `YD-43`（**无真实业务用户**）".
- `月度战略调研会/2026-11-08.md:107`: "**无真实客户案例**、无第三方安全/合规认证（E0）"; `:199`: "无真实客户试点、无 E4"; `:257` lists "私有化部署、真实客户试点、第六位真人读者、E4" as the outstanding items.
- `项目周例会/2026-11-21.md:92`: "**真实业务用户验收：本周没有新场次。** … U1/U2 的验收是项目操作者在真栈上完成、由用户裁「通过」" — and `:219` repeats that this is **not** an independent user.
- `CTO每周例会/2026-11-21.md:550`: the week's "real business acceptance" was **N5**, i.e. the seed-stack reader session — not a delivery project. The same meeting records "完成一个真实业务闭环" as the **goal** of the delivery line (`:544`).
- `项目周例会/2026-11-21.md:166` lists "一条真实业务验收（若 CTO 批准）" as a **next-week deliverable**, confirming it had not happened.

So the empty list is the accurate finding, not a formatting problem: the B1 input does not exist in the record yet.

## 5. Boundaries and what was not verified

**Boundaries observed.** Read-only throughout. No project was judged qualified or disqualified as a business decision — the "clearly fails" marks apply only to the four frozen conditions, nothing else. No instance slot was filled, no one was contacted, no message was sent, the roadmap / decision index / plan documents were not touched, and nothing was committed or pushed.

**Not verified, and why it matters.**

1. **Records only.** This inventory covers the named files. A real delivery project could exist outside them — an offline engagement, a verbal arrangement, a client not yet written down. The user is the only source for that, and that is exactly what B1 asks for.
2. **Some sources are very large and were searched, not read end to end.** `KeelBase-execution-log.md` (≈700 KB), `会话认领约定.md` (≈2.6 MB) and `对外反馈台账.md` (≈660 KB) were queried with targeted searches (organisation-name patterns, 客户/甲方/交付/试点/真实客户/客户环境). A client named in an unusual phrasing could have been missed. The named weekly meetings, the monthly review, the roadmap and the three YD-43 documents were read in full or in the relevant sections.
3. **`kids-todo` is the weakest entry.** It appears only in this project's memory (a hosting note) and has no repo, roadmap row or meeting record in this workspace. Its "self-use" character is inferred from that note; it cannot be fully verified here. Either way it has no client and no named business user.
4. **The records are current to 2026-11-27.** Anything decided after that date is outside this inventory.
5. **One naming trap worth flagging.** "真实业务验收" in the 11-21 meetings refers to **N5**, the seed-stack reader session. It is easy to read that phrase as "a real delivery project was accepted". It was not; the meetings themselves say so (`项目周例会/2026-11-21.md:92`, `:219`).

**What this file does not do.** It does not fill B1, does not propose a project, does not rank the entries, and does not rule on anyone's eligibility as a user (that is B2, a separate intake).

---

# 第二部分 · 中文

> **性质。** 只读盘点，供用户挑选。不是实例件，不对任何项目下判定，也不替代 `yd43-instance-ready-1118.md` 里的 B1。
>
> **状态声明。** **未判定任何项目合格。** 未往实例层填任何一格，未联系任何客户，未发任何消息。roadmap、决定索引与各计划件均未改动；未提交、未推送。
>
> **这里的「候选」指什么。** 四条合格条件照抄 `yd43-frozen-20261117T045650Z.md` §2.1：① 有真实业务用途（这套系统服务于某家客户或某个团队的真实业务，不是演示、不是自用练手）；② 有真实业务数据（真实记录，或生产副本）；③ 有具名真实业务用户；④ 用户平时就在做这批业务。**四条里只要有一条「明确不符合」，就不进候选表**。任一条件未证，只能停在「候选」，永远不能写成「合格」。
>
> **读过的来源（只读）：** `yd43-frozen-20261117T045650Z.md` §2.1–§2.2；`yd43-prep-1126.md` §4（B1）；`yd43-instance-ready-1118.md` §1 S1 与 §3 B1；`KeelBase-Private/KeelBase-Vue-Pro/roadmap.md`（全文）；`KeelBase-Private/notes/` —— CTO 周会（`CTO每周例会/2026-10-31.md`、`2026-11-07.md`、`2026-11-14.md`、`2026-11-21.md`）、项目周会（`项目周例会/2026-11-14.md`、`2026-11-21.md`）、月度战略调研会（`月度战略调研会/2026-11-08.md`）、读者记录（`审计读者/`）、认领表（`会话认领约定.md`）、外部试用核验台账；`D:/Rain6fish/KeelBase-Vue-Pro/handoff/`（`yd43-*`、`nextstage-abc-1126.md`、`cto-1128-decisions-1126.md`、`v1230-runbook-1126.md`）；`D:/Rain6fish/handoff/`（文件清单与定点检索）。

## 1. 一句话结论

**现有记录中无候选。** 上述来源里**没有任何一个真实客户交付项目**——没有一个同时具备客户方、交付阶段与真实业务数据。材料里出现的每一个「像项目」的对象，要么是演示部署，要么是自用/模块接入演练，要么是一次有具名读者的测试场次。清单为空是**证据得出的结论**，不是没查。

## 2. 候选表

| # | 项目 | 客户方 / 使用方 | 交付阶段 | ① 真实业务用途 | ② 真实业务数据 | ③ 具名真实业务用户 | ④ 用户日常做这批业务 | 证据出处 | 还缺什么才能合格 |
|---|---|---|---|---|---|---|---|---|---|
| — | *无* | — | — | — | — | — | — | — | — |

**为什么是空的。** 要进这张表，四条里不能有任何一条「明确不符合」，且至少要有一条「未证」。实际找到的十二项，每一项都至少有一条明确不符合（见 §3），所以连候选都算不上。最接近「交付」的是 `YD-28` 的 `fms` 模块，而它在 ① ② 上就是硬不符合：它交付进的是**我们自己的演示宿主**，表是空的/种子的。

## 3. 排除表 —— 看起来像项目，其实不是

### 3.1 部署、模块与场次

| # | 条目 | 它实际是什么 | 阶段 | ① | ② | ③ | ④ | 证据（文件:行） | 要变成合格还缺什么 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `demo2.keelbase.com.cn`（以及更早的 `demo.keelbase.com.cn`） | 公开演示部署，从零 bootstrap。 | 演示运行中 | **明确不符合** —— 声明的用途就是演示入口 | **明确不符合** —— 由种子脚本建起；2026-11-20 迁移时从零 bootstrap 174 张表，未迁任何数据 | **明确不符合** —— 无业务用户，用的人是我方 | **明确不符合** —— 没人在上面做业务 | `roadmap.md:80`（`YD-6`「demo2 演示入口 … 与现有 demo 共存」）；`roadmap.md:81`（`YD-7`）；`roadmap.md:100`（`YD-41`「部署的种子清单」）；项目记忆 `demo2-migration-2026-11-20`（从零 bootstrap、174 表） | 要有客户把这个部署接过去做真业务，带真实数据和具名用户——那是另一个产物，不是这一个 |
| 2 | **FMS 财务模块**（`YD-28` 的「一次交付」） | 在**我方**演示宿主里启用的 yudao `fms` 模块，加两个手写 Java 与一个门禁脚本——一次模块接入的交付演练。 | 内部交付演练，2026-10-16 收口 | **明确不符合** —— 交付进的是我方宿主，为的是证明模块接入，不是服务某个客户 | **明确不符合** —— 门禁跑在空表/种子上（「跑完 fms 三张表残留 0」） | **未证** —— 没有任何具名用户 | **未证** —— 没人日常做这批业务 | `roadmap.md:132`（`YD-28`：「交付已落：模块选定 `fms` 财务（第一个非 CRM），`yudao-server/pom.xml` 启用它 + 两处手写 Java」） | 需要一个真实客户，其财务人员每天在用 FMS，用他们自己的数据；而且这个客户得被具名 |
| 3 | 其余本机模块 —— CRM / PMS / BPM / system（`YD-7`、`YD-14`、`YD-15`、`M1`） | 为量成本而在本机/演示宿主上启用并接入治理的模块。 | 内部模块接入 | **明确不符合** —— 自用/测量用途 | **明确不符合** —— 种子数据；CRM 的「客户」是种子行 | **未证** | **未证** | `roadmap.md:81`（`YD-7`「本机启用七个模块」）；`roadmap.md:129`–`130`（`YD-25`/`YD-26` 射程）；认领表 `会话认领约定.md:1000`（种子客户行 `9003`/`9004`/`9005`） | 同第 2 行 |
| 4 | `demo01` 生成模块 | 为读每模块成本而生成的演示模块。 | 演示/测量 | **明确不符合** | **明确不符合** | **未证** | **未证** | `CTO每周例会/2026-10-31.md:79`（模块成本单：「CRM 610/363 → BPM … → FMS 458/265 → demo01 498/328」） | 它是个测量夹具；要变成客户模块才算 |
| 5 | **N5 场次**（`n5rd` 隔离栈，2026-11-25） | 一场验收：一名具名非开发者读者在隔离栈上跑验收脚本。 | 测试场次，已跑 | **明确不符合** —— 验收演练，不是业务 | **明确不符合** —— 隔离栈，库 `n5rd`，批准人是种子账号 `#9901 李静` | **明确不符合** —— 张杰 / Alice，办公室职员，不是任何交付项目的业务用户 | **明确不符合** —— 她不日常做这批业务 | `审计读者/N5-场次记录-2026-11-25.md:6`（读者 张杰 = Alice，办公室职员）；`:27`（批准人 `#9901` 李静，种子值）；`:61`（库 `n5rd`）；`yd43-prep-1126.md:296`（明文：Alice 不得登记为 YD-43 的用户） | 要挪到客户真实数据上、由该客户自己的人来跑 |
| 6 | **U1/U2 验收**（2026-11-17「真栈」） | 由**项目操作者**在已 pin 的产物上取的验收读数；用户裁定「通过」。 | 验收读数，已完成 | **未证** —— 没有任何记录说受益方是客户 | **未证** —— 记录未写数据来源 | **明确不符合** —— 由项目自己人完成 | **未证** | `项目周例会/2026-11-21.md:20`（「U1/U2 已由用户裁「通过」… E3 读数，但**不是**独立用户验证」）；`:92`（「U1/U2 的验收是项目操作者在真栈上完成、由用户裁「通过」」）；`:219` | 要换成一个真实业务用户，在那家项目的真实数据上、无人指导地做 |
| 7 | `kids-todo`（`kids-todo.keelbase.com.cn`） | 一个小的个人待办应用，与主栈同机托管；给家里用，不是给客户。 | 自用 | **明确不符合** —— 自用，无客户 | **未证** —— 无数据方面的记录 | **未证** —— 无业务用户记录 | **未证** —— 没人在这上面做「这批业务」 | 项目记忆 `project-kids-todo-hosting.md`（托管、容器、nginx 拆分）。**本工作区没有它的仓库、笔记或 roadmap 行** —— 见 §5 | 要有客户团队拿它做真业务；今天它是家庭应用 |
| 8 | `KeelBase-App-X` | 交付线的手机端，开发中。 | 未交付 | **明确不符合** —— 无客户、无具名需求 | **未证** | **未证** | **未证** | `CTO每周例会/2026-11-21.md:544`（「交付线 … 完成一个真实业务闭环」—— 是目标，不是结果）；`nextstage-abc-1126.md:54`（编译门仍配置为关） | 要先有一次绿色编译和一个真实客户闭环；它是产品线，不是交付项目 |

### 3.2 只是数据、占位符或人 —— 从来不是项目

| # | 出现的名字 | 它是什么 | 为什么不是项目 | 证据 |
|---|---|---|---|---|
| 9 | 万象商业服务有限公司 / 海州物流股份有限公司 / 明远置业集团有限公司 | 演示 CRM 里的**种子客户记录**，主键 `9005` / `9003` / `9004`。 | 它们是种子库里的行，不是客户单位。 | `会话认领约定.md:1000`（三个名字作为种子客户的 `beforeSnapshot.name` 被引用） |
| 10 | 「某某集团供应商准入项目」/「某某供应链管理有限公司」 | 填写表里的**编造示例**，标着「示例，请替换」。 | 它们只示范「这一格长什么样」。 | `yd43-instance-ready-1118.md:37`–`44`（S1 示例，明写「我编的假值」） |
| 11 | 张杰（Alice）· Matt · 第四/第五位读者 | 一个个**读者**，不是项目。 | 读者不是交付项目；且按 §2.2，非项目方的非技术读者与随机第三方都不算用户。 | `审计读者/N5-场次记录-2026-11-25.md:6`；`审计读者/第六位读者场次记录-2026-11-11.md:6`、`:121`（「Matt 是**非项目方**、非技术」） |
| 12 | 周会里的五个评审角色（交付负责人 / 测试 / 业务可用性 / 安全 / 记录员） | **AI 模拟**的评审视角。 | 那是评审装置，不是交付项目里的人。 | `项目周例会/2026-11-21.md:5`（「均为 **AI 模拟**；不冒充真实独立人员或真实用户」） |

## 4. 空清单声明

**现有记录中无候选。** 记录自己就把这处缺口写出来了：

- `CTO每周例会/2026-10-31.md:74` 与 `2026-11-07.md:87`：「未复跑 `YD-43`（**无真实业务用户**）」。
- `月度战略调研会/2026-11-08.md:107`：「**无真实客户案例**、无第三方安全/合规认证（E0）」；`:199`：「无真实客户试点、无 E4」；`:257` 把「私有化部署、真实客户试点、第六位真人读者、E4」列为待补。
- `项目周例会/2026-11-21.md:92`：「**真实业务用户验收：本周没有新场次。** … U1/U2 的验收是项目操作者在真栈上完成、由用户裁「通过」」——`:219` 再强调这**不是**独立用户。
- `CTO每周例会/2026-11-21.md:550`：当周的「真实业务验收」就是 **N5**，即那场种子栈读者场次——不是交付项目。同一份纪要把「完成一个真实业务闭环」记为交付线的**目标**（`:544`）。
- `项目周例会/2026-11-21.md:166` 把「一条真实业务验收（若 CTO 批准）」列为**下周交付物**，等于确认它当时还没发生。

所以空清单是准确的发现，不是排版问题：B1 这项输入目前在记录里还不存在。

## 5. 边界与未核

**守住的边界。** 全程只读。没有把任何项目判为合格或不合格——「明确不符合」只针对冻结的四条条件，不涉及其它。未填任何实例槽位，未联系任何人，未发任何消息，未动 roadmap / 决定索引 / 计划件，未提交、未推送。

**未核，以及为什么要紧。**

1. **只核了记录。** 本盘点覆盖的是点名的那批文件。真实交付项目可能在这些记录之外——线下承接、口头约定、还没写下来的客户。这一点只有用户能提供，而 B1 问的正是它。
2. **部分来源极大，是检索而非通读。** `KeelBase-execution-log.md`（约 700 KB）、`会话认领约定.md`（约 2.6 MB）、`对外反馈台账.md`（约 660 KB）用的是定点检索（组织名模式、客户/甲方/交付/试点/真实客户/客户环境）。若客户名用了非常规写法，可能被漏掉。点名的各次周会、月度调研会、roadmap 与三份 YD-43 文件是通读或读了相关章节。
3. **`kids-todo` 是证据最弱的一条。** 它只出现在本项目的记忆里（一条托管笔记），本工作区没有仓库、roadmap 行或会议记录。「自用」是从那条笔记推的，在此无法完全核实；无论如何，它没有客户、没有具名业务用户。
4. **记录截至 2026-11-27。** 此后作出的任何决定不在本盘点之内。
5. **一处容易读错的措辞。** 11-21 那几份纪要里的「真实业务验收」指的是 **N5**，那场种子栈读者场次。很容易把它读成「已经验收了一个真实交付项目」——并不是，纪要自己也这么写（`项目周例会/2026-11-21.md:92`、`:219`）。

**本件不做什么。** 不填 B1，不推荐项目，不给这些条目排名，也不裁定任何人的用户资格（那是 B2，另有一份登记件）。
