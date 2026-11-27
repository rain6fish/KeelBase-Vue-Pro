# CTO Weekly 2026-11-28 · Pre-meeting Update (the 11-26 evening results folded in)

> **What this is.** An addendum, not a replacement. `handoff/cto-1128-packet.md` and `handoff/cto-1128-decisions-1126.md` were written before the release window opened. This page records only what changed after their cut-off (11-26 12:52), restates D1–D5 as of 2026-11-27, and lists the questions that are still open. Neither original file is edited.
>
> **Cut-off.** 2026-11-27. Read-only throughout: no packet / decision sheet / weekly plan / roadmap / decision index / claim table was modified; nobody was contacted; nothing was committed or pushed; no ruling is made here.

---

## 1. New facts since the packet

**1.1 v0.1.21 is published, and the host is pinned to it.**

- Tag: annotated `v0.1.21`, tag object `edb27b1` (`edb27b14875d93ab27985c62e1af44ab593b13bf`), peeling to `e8e9cad` — the same commit as `origin/main` and `gitee/main`.
- Release run `45822868092`: `completed / success`, 2026-11-26T12:46:55Z–12:50:40Z (3m42s).
- Central deployment `800c7c3e-a349-4332-9e2c-cf5c3adee21e`, `autoPublish=true`. The four coordinates read **200** at 2026-11-26T13:30Z: parent pom 13,762 B, `keelbase4j-protocol` 38,793 B, `keelbase4j-core` 426,416 B, `keelbase4j-springai` 20,867 B. `core` sha256 matches the published `.sha256` byte for byte (`b1d4588f…7551`); the manifest reads `Implementation-Version: 0.1.21`, `KeelBase-Contract-Version: v1.23.0`.
- Publish lag, recorded because it misled the first check: everything was 404 from 13:21Z to 13:26Z; the first poll at 13:29:45Z found all four at 200 — roughly 39 minutes after upload. This is Sonatype-side async publication, not a build problem.
- Host pin raised 0.1.20 → 0.1.21 in 3 files / 5 places (`keelbase-codegen/pom.xml:31/37/41`, `yudao-module-ai1-springai/pom.xml:44`, `yudao-server/pom.xml:39/55`), commit `5a204b2348`, pushed to `origin` and `gitee`; CI `45830575625` and Real-stack `45830575605` both success. `release-plan.json` is `done=true`.
- **No Release page** — neither in the contract repository nor in 4J — per the 2026-11-26 ruling and contract commit `eb99d11` ("releases are tags, never pages"). Evidence: `handoff/release-v0.1.21-published.md`, `release-v0121-step1-1126.md`, `step2`, `step3`, `release-plan.json`.

**1.2 The four-layer review is complete and its blockers are fixed.**

`handoff/release-precheck-0.1.21-1126.md` concludes **WITH FIXES**: 5 blocking findings, all fixed in 4 commits (`eac046b`, `370f2b2`, `4b5d12e`, `4a0ae35`); 7 suggestions landed; 11 commits in all (`90e670e..cab30f9`). Post-fix readings: 52 targeted tests green; `release-gate.sh` **16 pass / 0 fail** at `cab30f9`; commit-order 0 violation / 0 warning. Layer-by-layer: OCR 22 comments / 2 blocking (8 pom `-SNAPSHOT` highs are false positives); Claude five-dimension 15 findings / 2 blocking; code-review Standards 5 + Spec 3 with 1 blocking; AI Code Economy 4 findings, verdict WARN, Critical 0. The gate was re-run on the final HEAD before tagging, as the report's precondition required.

**1.3 The W1.4 third window did run — and still produced no valid reading.**

This is the biggest change against the packet, which said "no result yet".

| Item | Reading |
|---|---|
| Stage 0 (read-only checks) | 20:31–20:33, all pass; both checkouts `cdae38ea`, six ports free, no `w14r*` containers |
| Author present | reply "在场，开始" at 20:56:34 |
| T0 (round 1, first attempt) | `2026-11-26T20:56:52+0800` |
| Stack up | 20:59:26, `w14r1-pg` on 55401, `w14r1-redis` on 56401, `fms_account_set rows=0` |
| Build | 21:01:06, `jar=500173081 bytes, entries=923` |
| Host up | 21:01:54, `/app/capabilities` 200 |
| Gate | 21:08:04, **RED**, `MODULE_NOT_FOUND: …/scripts/run-fms-voucher-scenarios.mjs` |
| Diagnosis | round 1 checkout: `git status` empty, HEAD still `cdae38ea`, **zero deliverables written** — not a failed gate but a round never written |
| Disposition | round 1 voided (`times-void-1126a.txt`: `gate_exit=1 gate_ok=0 gate_failed=0`) |
| Retry T0 | `2026-11-26T21:29:59+0800`; session's last event 21:30:07; no further evidence |

So: **no time-to-green, no valid T1, no completed round.** What changed is the failure mode — from "the author was not present" (11-24, 11-25) to "the author was present, said the work was done, but nothing landed in `D:/Rain6fish/.w14-r2/round1`". The build and host did come up on the unmodified base, which means those two legs do not depend on the deliverables and cannot stand in for them. Evidence: `handoff/w14-second-1124/round1/{steps.log,times.txt,times-void-1126a.txt,gate.log}`; the session timeline export `w14-session-timeline.txt` in the group's shared notes folder.

**Two facts from the outcome sheet** (`handoff/w14-third-outcome-1127.md`, a separate session's read-only verification, landed 11-27 07:35):

- The machine went into S0 connected standby at **21:32:40**, 2m33s after the session ended its turn waiting for the author, and again at 22:20:59 — the "turn off display = never" setting from the readiness runbook was never in effect. That is why the restarted round never advanced.
- P17 of the readiness list also failed: the three v0.1.21 release windows (20:10 / 20:45 / 21:20) ran concurrently inside this window, and one of them committed three poms in the **main** checkout at 21:30:55–21:31:02 (`5a204b2348`). It never touched the round checkouts.

**Same verdict, independently reached.** The outcome sheet's conclusion matches mine: no reading, round 1 void, the restarted round has no T1. It adds a classification that D4 does not have — see D4 below.

**1.4 The App-X false-green guard is merged and pushed.**

`KeelBase-App-X` `main` is now `d939527` (2026-11-26 13:21:22): `5983f3b` (the guard), merge `bda11b1`, then `d939527` (`ci(compile): run the guard's self-test on every push`). `origin/main` equals `d939527`, 0 ahead. The packet's "guard branch unpushed and unmerged, main still `cc8b1a3`" is **no longer true**.

Still true: **no real HBuilderX compile has ever been run** on this guard — the three passing cases are mocks. And because `d939527` runs the self-test on every push, CI now exercises the mock path each time, which is not evidence of a real compile.

**1.5 CT-4: the wording is ruled, the reader is fixed, and the anchor question resolves — with one leftover inconsistency.**

- **Ruling (2026-11-26, user), commit `3b08706b`:** record the v1.23.0 deviation **once as a violation**; nothing rewritten, nothing replayed; the ordering constraint (contract push → consumer bump → consumer push, same day) is unchanged and still governs future releases. A violation is not a precedent.
- **Reader fix:** `check-push-order.mjs` no longer reads a hook-amended commit's rewritten time. Fix `458447c`, merge `90e670e`; re-read on the bump that actually shipped gives all three times `exact` — tag pushed 19:03:24, pin bump 19:01:58, consumer push 19:04:33 — verdict stays VIOLATION for the true direction.
- **Anchor (the "B-1" question in the CT-4 note):** the two SHAs are different commits. `8f9baa75` is the replay-rebuilt **pin commit** (real time 2026-11-24 19:01:58, gitlink `015f474`) — the bump that shipped. `2ea7f597` is "follow the release-evidence vector" (2026-11-23 23:53:06 as amended; true time 13:33:06) and is the **test subject** used to demonstrate the amend fix, not the shipped bump. So the cross-day note's alternative ("if the latter were the published one, 11-24 would violate both order and day") does not hold.
- **Leftover:** private commits `3abf0d45` (roadmap, 23:35) and `1834446a` (bookkeeping, 23:37) state the v1.23.0 bump time differently — `13:33:06` versus `19:01:58`. The roadmap line conflates the demo commit with the shipped bump. One sentence of correction is needed so the meeting does not quote the wrong time. **Not verified as already corrected — flagged.**

**1.6 N5: path A is recorded in the plan and the claim table; criterion 5 still has no signature.**

`677acec5` (11-26 23:37:49) wrote path A and the evidence boundary into the N5 row; `30c1af96` did the same for the claim table. The row still reads "判据 5 两格需裁定（倾向不成立）" — **no grader has signed**. The 11-27 nightly (`91252123`, 02:18) re-verified N5 read-only on 4J `main` `62939b9`: three suites 7/7, 3/3, 1/1 and the bilingual gate exit 0. That re-verifies the N5 code and evidence, **not** criterion 5.

**1.7 README 4J rows: fixed and pushed, but now one release behind.**

`b385fa07` (2026-11-27 00:00:17, in `KeelBase`) rewrote both 4J rows — released `v0.1.20`, `main`/unreleased `v1.23.0`. `KeelBase` is 0 commits ahead of `origin/main`, so it is pushed (the cross-day note's "unpushed" is stale). But `v0.1.21` was published hours later, so the released row now lags by one version. The README itself states the `contract-matrix` gate reads only the TypeScript `main` row, so no gate is red.

---

## 2. D1–D5 status

| # | Status | Latest reading | Evidence |
|---|---|---|---|
| **D1** N5 criterion 5 | **Still open, narrowed** | Path A is now written into the plan and the claim table; the only remaining item is the grader's written ruling on the two "改成什么" cells. Path A's boundary text is in place: E3 ceiling, criterion 4 unsupported, no E4, no external claim of "acceptance passed". | `677acec5`, `30c1af96`, `handoff/n5-verdict-1126.md` |
| **D2** App-X maintenance file to 12-05 | **Partly resolved** | Resolved: the guard is merged and pushed (`d939527`), and the self-test runs on every push. Still open: no real compile has ever run; the runner/VM state could not be read — GitHub's API is unreachable from this host (TLS/EOF), so **runner status is 未核**. Last known: runner offline, 0 repo variables, VM stuck on the welcome screen and never force-powered-off. | `KeelBase-App-X` log; `handoff/appx-compile-guard-1126.md`; `git ls-remote`/`gh` failure |
| **D3** N9 review on 12-05 | **Still open** | No ruling on the criterion. The guard merge makes the question sharper: `d939527` requires exit 0 **and** a real success marker, so "one `compile` success" now means a genuine HBuilderX compile, which the runner cannot currently produce. Runner recovery path still not rehearsed. | Weekly plan N9 row; `d939527`; packet D3 |
| **D4** W1.4 third window | **Still open — the fact changed, the question got harder** | The window ran and still produced 0 valid readings. Two attempts inside the window: 20:56:52 (voided, gate RED on a missing module; machine awake throughout) and 21:29:59 (no further evidence; standby from 21:32:40). Neither D4 shape fits: not "window missed" (author replied three times), not "measurement failed" (stack/build/host green, the gate never got to run an assertion). The outcome sheet names a third shape: the window was used, the chain ran, the deliverables never landed. | §1.3 above; `w14-second-1124/round1/*`; `handoff/w14-third-outcome-1127.md` §3 |
| **D5** 4J cross-day bump | **Wording ruled; the 4J instance itself not ruled** | The user ruled "record once as a violation" for the v1.23.0 deviation, and the ordering constraint is unchanged — which by its literal same-day clause covers the 4J cross-day bump too (tag 11-24 19:03:24, bump 11-25 19:42:53, 24h39m29s later, order right, day wrong). But no per-instance ruling exists for the 4J bump. README rows fixed and pushed; now one version behind 0.1.21. | `3b08706b`; `handoff/4j-ct4-crossday-1126.md`; `b385fa07` |

---

## 3. Questions the meeting still has to answer

1. **D1** — Will the grader sign the two "改成什么" cells (A: maintain the status quo / B: they are business answers / C: not recorded)? Nothing else in D1 is open.
2. **D2** — Before the 12-05 review, do we open one VM window to run a real compile, or keep the documentation-only track and not chase it? (The guard half of D2 is closed; only the real compile and the VM state remain.)
3. **D3** — Is the 12-05 N9 criterion "one `compile` success" as the minutes read, or one real compile? With `d939527` merged, "success" now demands a real success marker, and the runner is offline.
4. **D4** — The third window is neither "window missed" nor "measurement failed": present, three replies, stack/build/host all green, and the gate could not execute because the deliverables never landed in `D:\Rain6fish\.w14-r2\round1`. Does D4 gain this third class, and in the same ruling: the fourth window's date, owner, and a start-of-window check that the deliverables have landed?
5. **D5** — Is the 4J 11-25 cross-day bump also "record once as a violation" under the same unchanged constraint? The wording ruling covers the v1.23.0 host-line instance; the 4J instance has no ruling of its own.

Dropped from the packet's question list because they are now answered: "did v0.1.21 ship?" and "is the CT-4 wording ruled?".

---

## 4. Evidence index and what is not verified

- **Read and cited:** `handoff/release-v0.1.21-published.md`; `release-v0121-step1/2/3-1126.md`; `release-precheck-0.1.21-1126.md`; `release-plan.json`; `cto-1128-packet.md`; `cto-1128-decisions-1126.md`; `w14-ready-1126.md`; `w14-second-1124/round1/*`; `w14-third-outcome-1127.md`; private-repo commits `3b08706b`, `1834446a`, `3abf0d45`, `677acec5`, `30c1af96`, `91252123`, `320630cf`; `KeelBase` commits `b385fa07`, `8f9baa75`, `2ea7f597`; `KeelBase-App-X` log.
- **Not verified:** App-X runner / VM state and the CI runs on `d939527` (GitHub API unreachable from this host — TLS handshake / EOF); whether the private roadmap line `3abf0d45` has since been corrected; the CT-4 re-read was not re-run here, it is quoted from the private bookkeeping commit; whether the author typed the five W1.4 deliverables anywhere outside `D:\Rain6fish` (the outcome sheet scanned `D:\Rain6fish` and the main checkout and found nothing on 11-26).
- **Not touched:** packet, decision sheet, weekly plan, roadmaps, decision index, claim table, any code repository.

---

# 2026-11-28 CTO 周会 · 会前增补（并入 11-26 晚间结果）

> **本件是什么。** 增补，不替代。`handoff/cto-1128-packet.md` 与 `handoff/cto-1128-decisions-1126.md` 写于发布窗口之前。本页只记它们截止（11-26 12:52）之后发生的变化，按 2026-11-27 的读数重述 D1–D5，并列出仍然开着的问题。两个原文件均未改动。
>
> **截止时点。** 2026-11-27。全程只读：未改 packet / 决策单 / 周计划 / roadmap / 决定索引 / 认领表；未 contact 任何人；未 commit、未 push；本件不下任何裁定。

## 一、packet 之后的新事实

**1.1 v0.1.21 已发布，宿主已抬 pin。**

- tag：annotated `v0.1.21`，tag 对象 `edb27b1`（`edb27b14875d93ab27985c62e1af44ab593b13bf`），指向 `e8e9cad` —— 与 `origin/main`、`gitee/main` 同一提交。
- 发布 run `45822868092`：`completed / success`，2026-11-26T12:46:55Z–12:50:40Z（3m42s）。
- Central 部署 `800c7c3e-a349-4332-9e2c-cf5c3adee21e`，`autoPublish=true`。四坐标在 2026-11-26T13:30Z 均为 **200**：父 pom 13,762 B、`keelbase4j-protocol` 38,793 B、`keelbase4j-core` 426,416 B、`keelbase4j-springai` 20,867 B。`core` 的 sha256 与公布的 `.sha256` 逐字节一致（`b1d4588f…7551`）；清单读 `Implementation-Version: 0.1.21`、`KeelBase-Contract-Version: v1.23.0`。
- 落库延迟一并留档，因为它误导过第一次核对：13:21Z–13:26Z 全部 404；13:29:45Z 第一次轮询即四坐标 200 —— 距上传约 39 分钟。属 Sonatype 侧异步发布，不是构建问题。
- 宿主 pin 由 0.1.20 抬到 0.1.21，3 文件 5 处（`keelbase-codegen/pom.xml:31/37/41`、`yudao-module-ai1-springai/pom.xml:44`、`yudao-server/pom.xml:39/55`），提交 `5a204b2348`，已推 `origin` 与 `gitee`；CI `45830575625` 与真栈 `45830575605` 均 success。`release-plan.json` 为 `done=true`。
- **未建 Release 页**（契约仓与 4J 均未建），依据 2026-11-26 用户裁定与契约仓 `eb99d11`「发布以 tag 为准，不维护发布页」。出处：`handoff/release-v0.1.21-published.md`、`release-v0121-step1-1126.md`、`step2`、`step3`、`release-plan.json`。

**1.2 四层评审已完成，阻塞项已修。**

`handoff/release-precheck-0.1.21-1126.md` 结论 **WITH FIXES**：5 条阻塞，全部修完，落在 4 笔提交（`eac046b`、`370f2b2`、`4b5d12e`、`4a0ae35`）；7 条建议落地；共 11 笔（`90e670e..cab30f9`）。修复后读数：定向测试 52 项全过；`release-gate.sh` 在 `cab30f9` 上 **16 pass / 0 fail**；提交信息闸 0 violation / 0 warning。逐层：OCR 22 条评论 / 2 条阻塞（8 条 pom `-SNAPSHOT` 的 high 为误报）；Claude 五维 15 条 / 2 条阻塞；code-review Standards 5 条 + Spec 3 条含 1 条阻塞；AI Code Economy 4 条，判 WARN，Critical 0。打 tag 前已在最终 HEAD 上按报告前置条件重跑门禁。

**1.3 W1.4 第三次窗口确实跑了 —— 但仍无有效读数。**

这是相对 packet 最大的变化，packet 当时写的是「尚无结果」。

| 项 | 读数 |
|---|---|
| 第 0 阶段（只读核验） | 20:31–20:33，全过；两轮检出 `cdae38ea`，六端口空闲，无 `w14r*` 容器 |
| 作者在场 | 20:56:34 回「在场，开始」 |
| T0（第 1 轮首次） | `2026-11-26T20:56:52+0800` |
| 起栈 | 20:59:26，`w14r1-pg` 在 55401、`w14r1-redis` 在 56401，`fms_account_set rows=0` |
| 构建 | 21:01:06，`jar=500173081 bytes, entries=923` |
| 起宿主 | 21:01:54，`/app/capabilities` 200 |
| 门禁 | 21:08:04，**红**，`MODULE_NOT_FOUND: …/scripts/run-fms-voucher-scenarios.mjs` |
| 诊断 | 第 1 轮检出 `git status` 为空、HEAD 仍是 `cdae38ea`、**零交付物** —— 不是门禁跑失败，是本轮根本没写 |
| 处置 | 第 1 轮作废（`times-void-1126a.txt`：`gate_exit=1 gate_ok=0 gate_failed=0`） |
| 重记 T0 | `2026-11-26T21:29:59+0800`；会话时间线导出止于 21:30:06；此后无证据 |

即：**无 time-to-green、无有效 T1、无跑完的一轮。** 变的是失败模式 —— 从「作者不在场」（11-24、11-25）变成「作者在场、说写完了，但 `D:/Rain6fish/.w14-r2/round1` 里什么都没落」。构建与宿主在未改动的基础上确实起来了，说明这两条腿不依赖交付物，也就不能替代交付物。出处：`handoff/w14-second-1124/round1/{steps.log,times.txt,times-void-1126a.txt,gate.log}`；会话时间线导出 `w14-session-timeline.txt`（本组共享笔记目录）。

**结论件的两条补充**（`handoff/w14-third-outcome-1127.md`，另一会话的只读核验，11-27 07:35 落盘）：

- 机器在 **21:32:40** 进入 S0 连接待机 —— 会话刚结束回合等作者之后 2 分 33 秒 —— 22:20:59 再次进入。就绪 runbook 里写的「关闭显示器=从不」并未生效。这是重启那一轮没能推进的原因。
- 就绪清单 P17 也不成立：v0.1.21 的三个发布窗口（20:10 / 20:45 / 21:20）在本窗口内同时在跑，其中一个在 21:30:55–21:31:02 改了**主检出**的三份 pom 并提交（`5a204b2348`）。它从未碰轮检出。

**同一结论，独立得出。** 结论件的判断与本件一致：无读数、第 1 轮作废、重启那轮没有 T1。它还给出一个 D4 里没有的分类 —— 见下文 D4。

**1.4 App-X 假绿守卫已并入 main 并推送。**

`KeelBase-App-X` 的 `main` 现为 `d939527`（2026-11-26 13:21:22）：`5983f3b`（守卫）、合并 `bda11b1`、再到 `d939527`（`ci(compile): run the guard's self-test on every push`）。`origin/main` 同为 `d939527`，领先 0。packet 记的「守卫分支未推未合、main 仍 `cc8b1a3`」**已不成立**。

仍成立：这套守卫上**真实 HBuilderX 编译从未跑过** —— 通过的三个用例都是 mock。而且 `d939527` 让每次推送都跑自测，于是 CI 每次都只走 mock 路径，这不是真实编译的证据。

**1.5 CT-4：口径已裁、读数器已修、锚点问题已解 —— 但留一处表述不一致。**

- **裁定（2026-11-26，用户），提交 `3b08706b`：** v1.23.0 的偏离**记一次违规**；不改写、不重放；顺序约束（契约推 → 消费方 bump → 消费方推，同日）不变，后续发布仍按原顺序执行。一次违规不构成先例。
- **读数器修复：** `check-push-order.mjs` 不再把钩子 amend 改写后的时间当真实时间。修复 `458447c`，合并 `90e670e`；在实际发布的那笔 bump 上复读，三段时间均为 `exact` —— tag 推送 19:03:24、pin bump 19:01:58、消费方推送 19:04:33 —— 判决仍为 VIOLATION，方向是真实的那条。
- **锚点（即 CT-4 件里的「B-1」问题）：** 两个 SHA 是不同提交。`8f9baa75` 是重放重建出来的 **pin 提交**（真实时刻 2026-11-24 19:01:58，gitlink `015f474`），也就是实际发布用的那笔 bump。`2ea7f597` 是「跟随释放证据向量」（amend 后 2026-11-23 23:53:06；真实 13:33:06），它是演示 amend 修复用的**对照对象**，不是发布用的 bump。所以跨日件里那个替代前提（「若后者才是发布用的那笔，11-24 就同时违反顺序与同日」）不成立。
- **遗留：** 私库 `3abf0d45`（roadmap，23:35）与 `1834446a`（bookkeeping，23:37）对 v1.23.0 的 bump 时刻写法不同 —— `13:33:06` 与 `19:01:58`。roadmap 那句把对照对象与发布用的 bump 混了。需要订正一句，免得会上引用错时刻。**是否已订正：未核，标出。**

**1.6 N5：路径 A 已写进周计划与认领表；判据 5 仍无人签字。**

`677acec5`（11-26 23:37:49）把路径 A 与证据边界写进 N5 行；`30c1af96` 同步进认领表。该行仍写「判据 5 两格需裁定（倾向不成立）」—— **判分人尚未签字**。11-27 夜跑（`91252123`，02:18）在 4J `main` `62939b9` 上只读复核了 N5：三套件 7/7、3/3、1/1，双语门禁 exit 0。那是复核 N5 的代码与证据，**不是**判据 5 的裁定。

**1.7 README 的 4J 行：已修、已推，但相对 0.1.21 又滞后一格。**

`b385fa07`（2026-11-27 00:00:17，在 `KeelBase`）重写了 4J 两行 —— 已发布 `v0.1.20`、`main`/未发布 `v1.23.0`。`KeelBase` 领先 `origin/main` 0 笔，即已推送（跨日件里的「未推」已过期）。但 `v0.1.21` 是数小时后发布的，所以「已发布」那一行现在落后一个版本。README 自身写明 `contract-matrix` 门只读 TypeScript 的 `main` 行，因此没有门变红。

## 二、D1–D5 状态

| # | 状态 | 最新读数 | 证据 |
|---|---|---|---|
| **D1** N5 判据 5 | **仍开，范围收窄** | 路径 A 已写入周计划与认领表；余项只剩判分人对「改成什么」两格的书面裁定。路径 A 的边界文字已就位：上限 E3、判据 4 无证、无 E4、不得对外称验收通过。 | `677acec5`、`30c1af96`、`handoff/n5-verdict-1126.md` |
| **D2** App-X 维护档到 12-05 | **部分已解** | 已解：守卫已并入 main 并推送（`d939527`），自测随每次推送运行。仍开：真实编译从未跑；runner/VM 现状读不到 —— 本机连不上 GitHub API（TLS/EOF），**runner 状态未核**。最后已知：runner offline、仓库变量 0、VM 卡在「欢迎」且始终未强断。 | `KeelBase-App-X` 日志；`handoff/appx-compile-guard-1126.md`；`gh` 失败读数 |
| **D3** N9 12-05 复核 | **仍开** | 判据未裁。守卫合并让问题更尖锐：`d939527` 要求退出码 0 **且**出现真实成功标记，因此「一次 `compile` success」现在指真实 HBuilderX 编译，而 runner 目前给不出。runner 恢复路径仍未演练。 | 周计划 N9 行；`d939527`；packet D3 |
| **D4** W1.4 第三次窗口 | **仍开 —— 事实变了，问题更难** | 窗口跑过了、仍是 0 有效读数。窗口内两次尝试：20:56:52（作废，缺模块致门禁红；机器全程醒着）与 21:29:59（此后无证据；21:32:40 起待机）。D4 的两种形态都不贴合：不是「窗口错过」（作者回了三次话），也不是「测量失败」（起栈/构建/宿主全绿，门禁连一条断言都没机会跑）。结论件点出第三种形态：窗口被用掉、链路跑通、交付物没落地。 | 见 §1.3；`w14-second-1124/round1/*`；`handoff/w14-third-outcome-1127.md` §3 |
| **D5** 4J 跨日 bump | **口径已裁；4J 这一案本身未裁** | 用户裁「记一次违规」，且顺序约束不变 —— 按字面的同日条款，也覆盖 4J 的跨日 bump（tag 11-24 19:03:24、bump 11-25 19:42:53，落后 24h39m29s，方向对、日期跨天）。但 4J 这一案没有单独裁定。README 已修并推；现落后 0.1.21 一格。 | `3b08706b`；`handoff/4j-ct4-crossday-1126.md`；`b385fa07` |

## 三、会上仍需回答的问题

1. **D1** —— 判分人是否签「改成什么」两格（A 维持现状 / B 业务答案 / C 未记录）？D1 其余项都已不开放。
2. **D2** —— 12-05 复核前，是开一次 VM 窗口跑真实编译，还是维持文档档不追？（D2 的守卫那一半已关，只剩真实编译与 VM 现状。）
3. **D3** —— N9 的 12-05 判据取纪要原文「一次 `compile` success」，还是取一次真实编译？`d939527` 合并后，「success」已要求真实成功标记，而 runner 是 offline。
4. **D4** —— 第三次窗口既不是「窗口错过」也不是「测量失败」：人在、回了三次话、起栈/构建/宿主全绿，门禁因交付物未落进 `D:\Rain6fish\.w14-r2\round1` 而无法执行。D4 是否据此新增第三类，并在同一次裁定里定出第四次窗口的时点、责任人与「交付物是否落地」的开跑前置校验？
5. **D5** —— 4J 11-25 的跨日 bump 是否同样「记一次违规」？口径裁定覆盖的是 v1.23.0 宿主线那一案，4J 这一案没有自己的裁定。

packet 问题清单里已解、从本件删去的两条：「v0.1.21 发没发」「CT-4 口径裁没裁」。

## 四、证据索引与未核项

- **已读并引用：** `handoff/release-v0.1.21-published.md`；`release-v0121-step1/2/3-1126.md`；`release-precheck-0.1.21-1126.md`；`release-plan.json`；`cto-1128-packet.md`；`cto-1128-decisions-1126.md`；`w14-ready-1126.md`；`w14-second-1124/round1/*`；`w14-third-outcome-1127.md`；私库提交 `3b08706b`、`1834446a`、`3abf0d45`、`677acec5`、`30c1af96`、`91252123`、`320630cf`；`KeelBase` 提交 `b385fa07`、`8f9baa75`、`2ea7f597`；`KeelBase-App-X` 日志。
- **未核：** App-X 的 runner / VM 现状与 `d939527` 上的 CI 运行（本机连不上 GitHub API，TLS 握手 / EOF）；私库 roadmap 那句 `3abf0d45` 是否已订正；CT-4 的复读本件未重跑，引自私库记账提交；作者是否在 `D:\Rain6fish` 之外写过 W1.4 那五处（结论件扫过 `D:\Rain6fish` 与主检出，11-26 无改动）。
- **未动：** packet、决策单、周计划、roadmap、决定索引、认领表、任何代码仓。
