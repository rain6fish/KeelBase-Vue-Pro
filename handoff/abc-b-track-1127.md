# B-track decision pages — CT-4, G5, recipe re-run / B 线决策材料 —— CT-4、G5、recipe 复跑

> **Nature.** Decision material for the 2026-11-28 CTO weekly and the 2026-11-29 close-out. It is **not a ruling**: every page ends with a blank ruling line, and every "suggested default" is marked *suggestion, not a ruling*. Nothing here reopens `D67`.
>
> **Prepared.** 2026-11-27 (UTC+08). Every SHA, time, run id, line count and hash is a reading of that moment; re-check on the day.
>
> **Boundary.** Read-only. No plan file, roadmap, decision index or claim table was changed; the recipe was not re-run; no stack was started; no CI was triggered or edited; nobody was contacted; nothing was committed or pushed. The only outputs are this file and a one-paragraph pointer in the group's shared notes.
>
> **Reading discipline.** Facts are (a) read from a repository in this session, with the command named; (b) taken from a hand-off file whose own time point is stated; or (c) marked **not verified**. A hand-off reading is not promoted to a fresh reading.
>
> **Numbering.** B1 / B2 / B3 follow `handoff/nextstage-abc-1126.md` §3. They are not the packet's D1–D5 (`handoff/cto-1128-decisions-1126.md`) and not the 11-29 D1–D8 (`handoff/nextstage-abc-1126.md` §6). Quote the source with any D-number.
>
> **Fresh readings this session (2026-11-27).** KeelBase HEAD reflog still holds the pre-amend `commit:` lines of 2026-11-23 13:23:04 and 13:33:06 (`1392a671`, `b6c99418`); the contract tag object `71496bd` peels to `015f474`; `KeelBase4J` `main` = `origin/main` = `e8e9cad` and contains both reader fixes (`458447c`, `16e3721`); the recipe single source is 792 lines / `c1d4d114…` and the render is 793 lines / `35f076b7…`; the G5 script is 20,132 B with a 9,014 B test file.
>
> **Sources.** `handoff/nextstage-abc-1126.md` §0/§3; `handoff/cto-1128-decisions-1126.md` (D5, D4); `handoff/cto-1128-update-1127.md` §1.5–1.7/§2; `handoff/4j-ct4-crossday-1126.md`; `D:/Rain6fish/handoff/w3-advance-1124.md` §2–§7; `KeelBase4J/handoff/push-order-amend-1126.md`; `handoff/recipe-delivery-1123.md`; `D:/Rain6fish/handoff/w1-retro-recipe-v2-1123.md` §2; `D:/Rain6fish/handoff/w13-recipe-1122.md` §2/§4; `D:/Rain6fish/handoff/w1-recipe-backfill-1122.md`; `handoff/release-v0.1.21-published.md`; `handoff/g5-decision-1127.md`; `handoff/g5-wire-or-defer-1127.md`; `handoff/ct4-ruling-options-1127.md`; `handoff/v0121-postcheck-1127.md`; `KeelBase-Private/KeelBase-Vue-Pro/YD-28-FMS-复现recipe_2026-10-16.md`; `KeelBase/scripts/check-artifact-contract.mjs`; `handoff/v1230-runbook-1126.md`.

---

## One-screen summary — suggested defaults / 一屏摘要 —— 建议默认值

**English**

> Suggestion, not a ruling. A ruling exists only on a signed page.

| Item | Suggested default | One-line why | Who signs | If not ruled |
|---|---|---|---|---|
| **B1 CT-4** | **B** — record 11-23 as a violation under the current wording; keep 11-24 as ruled on 11-26; leave the anchor alone | 11-23 is a violation under both calibers; changing the anchor only affects 11-24 and is a rule change, to be signed separately | The user (rule owner) | The unambiguous finding stays off the books; audits read the two cases inconsistently |
| **B2 G5** | **B** — one release-runbook invocation point, with a wrong-expect → 1 / right → 0 / old-version → 2 drill; promote to a CI job after one clean cycle | Needs no CI approval and can start today; a sibling session has already produced the three exit codes; the header's "red by construction" premise stopped holding at 0.1.20 | CTO (a CI job additionally needs machine-side approval) | Another cycle of "recorded but not wired" |
| **B3 recipe** | **B** — name a deliverer and run the already-delivered copy once; if that fails, publish the "not re-run" record and keep `v2-rc` | The copy is already there and all three copies agree; the only missing input is a person and a slot; no reading means no `v2-final` | The dispatcher/user names the deliverer and slot | Four empty cells, no date; the next cycle inherits the same state |

The three Bs mean different things: for CT-4 "record it, change no rule"; for G5 "wire one invocation point outside CI"; for recipe "schedule one human session". None needs new code to start; the hard dependencies are one sentence, one runbook line, and one person's time.

**Letter caution.** B1's B equals `handoff/ct4-ruling-options-1127.md`'s A; quote the letter with its source when pasting into the minutes.

**中文**

> 建议，非裁定。只有签在裁定行上才算裁定。

| 事项 | 建议默认值 | 一句话理由 | 谁签 | 不裁的后果 |
|---|---|---|---|---|
| **B1 CT-4** | **B** —— 按现行措辞把 11-23 记为违规；11-24 维持 11-26 已裁的「记一次违规」；锚点不动 | 11-23 在两种口径下都违规；改锚点只影响 11-24，且属规则变更，应另案签 | 用户（规则所有者） | 无争议的那条留在账外，日后审计口径不一 |
| **B2 G5** | **B** —— 发布 runbook 加一个调用点，做一次「错期望 → 1 / 正确 → 0 / 旧版 → 2」演练；一个干净周期后升 CI 作业 | 零 CI 批准、今天可做；兄弟会话已实跑出三个退出码；脚本头「注定常红」的前提从 0.1.20 起已失效 | CTO（上 CI 另需机器侧批准） | 再来一轮「登记了但没接线」 |
| **B3 recipe** | **B** —— 指定交付者在已下发的副本上跑一次；跑不了就发「未复跑」记录，保持 `v2-rc` | 副本已在、三处一致，唯一缺的是人和时段；没有读数就不能标 `v2-final` | 派活方/用户定人定时段 | 四格继续空着、无日期，下个周期原样继承 |

三个 B 含义不同：CT-4 的 B 是「记下来、不改规则」；G5 的 B 是「先接一个不依赖 CI 的调用点」；recipe 的 B 是「排一次人的场次」。三者共同点：都不需要新写代码就能启动，硬依赖分别是一句话、一行 runbook、一个人的时段。

**字母提醒。** B1 的 B 等于 `handoff/ct4-ruling-options-1127.md` 的 A；粘进纪要时字母要带出处。

---

## Page B1 — CT-4: two findings of different kinds

**The question.** The 2026-11-23 development-time pin move and the 2026-11-24 `v1.23.0` tag bump are both push-order findings. The first is a violation under every reading of the rule. The second is a violation under the runbook's literal wording and compliant under a "the commit reached contract main" reading — and the literal wording is the one the 2026-11-26 ruling recorded. What still needs a decision is: (1) how the 11-23 finding is recorded, and (2) whether the anchor for future tag bumps stays "the tag is pushed" or is changed to "the commit reaches main".

### Facts

| Time (+08) | Event | Evidence |
|---|---|---|
| 2026-11-23 13:23:04 | `KeelBase` submodule pin → contract commit `1222354` (`c060ecf5`) | `HEAD` reflog `1392a671 … commit:` (read 11-27; the `commit (amend)` line at 23:47:04 is the hook's rewrite) |
| 2026-11-23 13:33:06 | Pin → `fe08a20` (`2ea7f597`) | `HEAD` reflog `b6c99418 … commit:` (read 11-27; amend line 23:53:06 is the rewrite) |
| 2026-11-23 19:15:37 | **Contract's first push that day** (`83468a4`) | GitHub run `45163554143`; local `origin/main` reflog `fetch … 19:15:40` |
| 2026-11-23 19:18:43 | `KeelBase` pushes `2ea7f597` | `origin/main` reflog; run `45163986412` |
| 2026-11-24 19:01:24 | Contract `main` push (`015f474`) | run `45380276968` |
| 2026-11-24 19:01:58 | Pin bump `8f9baa75` (the bump that shipped) | commit date and reflog (read 11-27) |
| 2026-11-24 19:03:24 | Contract tag `v1.23.0` pushed | run `45380594496` |
| 2026-11-24 19:04:33 | Consumer push | `KeelBase` reflog |

Intervals: `13:33:06 → 19:15:37` = **5 h 42 min 31 s**; `19:01:58 → 19:03:24` = **86 s**; `19:01:24 → 19:01:58` = **34 s**.

What the rule says (`KeelBase-Private/notes/CTO每周例会/2026-10-21-五项裁定.md:71`): pins move only at three moments — after a contract release, before a consumer release, or to clear a red cross-repo gate — always in the order **contract push → consumer bump → consumer push, within one day**.

**What is already ruled.** On 2026-11-26 the user ruled (`3b08706b`): record the `v1.23.0` deviation **once as a violation**; nothing rewritten, nothing replayed; the ordering constraint and the same-day clause are **unchanged** and still govern future releases; a violation is not a precedent. That ruling names the 11-24 host-line instance. It does not name the 11-23 development-time move.

**What the reader said, and what it did not.** The push-order reader (`KeelBase4J/scripts/check-push-order.mjs`) anchors on the **tag push** (`const upper = … timeline.contract.pushed`). Re-run with `--tag v1.23.0 --bump-commit 2ea7f597` it returns `VIOLATION`: the tag was pushed on 11-24, after the pin bump, and not on the same day. That is true, but it is **not** the 11-23 finding: the v8 line had no tag, so the reader cannot express "the bump preceded the contract's first push". The 5 h 42 min finding comes from the `HEAD` reflog and the GitHub run, not from a reader verdict (`w3-advance-1124.md` §3.2, §7.2). The reader fix (`458447c`, plus `16e3721`) is on `KeelBase4J` `main` = `origin/main` = `e8e9cad` as read on 11-27; the nextstage line "merged but not pushed" is stale as of that read.

### The two readings

| Reading | "The contract push" means | 2026-11-23 finding | 2026-11-24 finding |
|---|---|---|---|
| **Literal runbook / reader** | The contract **tag** is pushed | **Violation.** The tag came on 11-24; even ignoring the tag, the commit was on no remote ref until 19:15:37 on 11-23, so the order and the trigger-moment clause both fail. | **Violation** by 86 s — the reading the 11-26 ruling used. |
| **"The commit reached main"** | The commit is pushed to contract `main` | **Still a violation.** `main` push 19:15:37 is **5 h 42 min after** the bump. This reading rescues nothing on 11-23. | **Compliant** — the commit was on `main` 34 s before the bump. |

The asymmetry is the whole point: **the caliber question only decides 11-24**. On 11-23 both readings agree; the only question there is the label.

**Two textual nuances.** (1) The rule text itself says "contract push / 契约推"; the gloss "the contract **tag** push" lives in `KeelBase4J/conformance/vectors/README.md:83-84` (EN) / `:106-107` (ZH) and in the reader. So a `main`-push anchor is arguably closer to the rule's letter than "literal" suggests — but it would overturn the basis the 11-26 ruling actually used, which is why it is a rule change, not a re-reading. (2) In the 11-24 case the tag landed **before** the consumer push (19:03:24 < 19:04:33), so the exposure the window guards against (a consumer reading a contract that is not yet on the remote) did not occur; the violation is of the ordering clause itself. That is a fair argument for leniency, not for calling the leg compliant — and the 11-26 ruling already chose violation.

**Letters do not carry across sheets.** `handoff/ct4-ruling-options-1127.md` (a sibling session, 2026-11-27) writes the **basis** options A (keep the tag push), B (re-anchor to the commit on `main`), C (dual anchor plus "tag before consumer push"). This page's **B** (record both under the current wording) equals that sheet's **A**; this page's **C** (prospective anchor change) corresponds to that sheet's **B**, or better its **C** if the guard must be kept. That sheet recommends its A and warns that its B would drop the tag-before-consumer-push guard. When pasting a line into the minutes, quote the letter with its source.

### Options

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Status quo** | No new ruling. 11-23 stays an open finding in hand-off files; 11-24 stands as the recorded violation. | Falsified if any document asserts the core line is CT-4-clean, or if the next audit cannot find the 11-23 finding at all. |
| **B. Record both under the current wording** | A dated entry records 11-23 as a **violation** (order + trigger-moment), names the 5 h 42 min interval and the red C1 it produced; the 11-24 entry stands as ruled. No rule change. One line goes into the release checklist: "no pin move to a commit that no remote ref exposes, outside the three moments." | Falsified if either entry cannot name the clause it violated, or if a future identical shape is treated as compliant without a written rule change. |
| **C. Change the anchor prospectively** | Rewrite the rule so "the contract push" means the commit reaching contract `main`, **effective from a named date**; keep both historical entries as violations; in the same ruling, write the 11-23 shape in as an explicit prohibition. If the guard is to be kept, prefer the dual-anchor form from `ct4-ruling-options-1127.md` §5-C: order is satisfied by either contract event, **and** the tag push must precede the consumer push. | Falsified if a bump before the `main` push is judged compliant, or if the new wording is applied backwards to `v1.23.0`. The 11-26 ruling explicitly kept the constraint unchanged, so this is a rule change and must be signed as one. |

**Why "deviation" is not offered for 11-23.** A deviation entry has to name a clause that still held. On 11-23 only "same day" held; order failed and the pin named a commit that no remote ref exposed for 5 h 42 min — exactly the failure the order clause exists to prevent, and it materialised as a red C1 (`pin fe08a20 不在任何 ref 上`). The 4J cross-day case is the one where deviation has a real argument (direction right, no consumption in between); that is the packet's D5, not this page. Using "deviation" here would flatten the only finding that is unambiguous.

### Suggested wording (paste-ready)

```markdown
**CT-4 · 2026-11-23 · development-time pin move · VIOLATION (order and trigger moment).**
The consumer moved its pin to contract commits `1222354` (13:23:04) and `fe08a20` (13:33:06)
before either commit was on any remote ref; the contract's first push that day was 19:15:37
(GitHub run 45163554143, head 83468a4), 5 h 42 min later. The move was also outside CT-4's three
allowed moments. The pin resolved to nothing for that interval — `release-gate` C1 read
"pin fe08a20 不在任何 ref 上" — which is the failure the order clause guards against. Recorded once;
nothing rewritten or replayed; the ordering constraint and the same-day clause are unchanged.
```

```markdown
**CT-4 · 2026-11-24 · v1.23.0 tag bump · VIOLATION under the tag anchor (already ruled 2026-11-26).**
Pin bump 19:01:58, tag push 19:03:24, consumer push 19:04:33. The bump preceded the tag by 86 s.
The same commit had reached contract `main` 34 s before the bump (19:01:24); under a "the commit
reached main" anchor this leg would be compliant, but the ruling kept the constraint as written and
recorded this instance once as a violation. This entry does not change that record. If the anchor is
ever changed, the change is dated prospectively and does not touch this entry.
```

**Suggested default (suggestion, not a ruling).** **B** — record 11-23 as one violation under the current wording and leave the anchor alone. It needs no rule change, it is consistent with the 11-26 ruling, and it keeps the one case where both readings agree from being softened. **C** is the right shape if the meeting wants the `main`-push reading for future releases, but it should be signed as a rule change with an effective date, not folded into the recording of a past event.

**Ruling line.** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** The 11-23 finding stays in hand-off files only; the core line cannot claim CT-4 compliance in any direction; a future audit may treat the same shape inconsistently (11-24 recorded, 11-23 not); and the release checklist carries no line that would stop a repeat. This is the one B-track item where "no decision" already has a cost: an unambiguous violation remains unrecorded while a more arguable one is on the books.

---

## Page B2 — G5: wire it, or record the deferral

**The question.** `KeelBase/scripts/check-artifact-contract.mjs` exists, is tested, and has no invocation point. G5 is the only one of the five gates with zero wiring. Should it be wired now, wired minimally (one invocation point), or formally deferred?

### What G5 is meant to block

Every other gate reads a **statement about the build**: G1 reads the consumer's pin against contract tags; G3 checks commit-message order; G4 checks the host's typed object key against the runtime version the host pins; the release gate's C1–C5 check contract membership and refs. None of them reads the **bytes a consumer downloads**.

G5 asks the artifact itself — the jar on Maven Central — which contract version it was built against. It closes the gap the 2026-11-14 weekly opened: CHANGELOG entries claimed `0.1.18` / `0.1.19` carried contract `v1.22.0`, and nothing checked the claim. Failure modes it catches that no other gate does: a build that resolved a stale vendored snapshot or the wrong ref despite the workflow `ref:`, and an artifact that declares nothing at all (exit 2 — "undeclared" is not a pass).

### Facts

- Script 20,132 B / 463 lines; test 9,014 B / 222 lines, 10 cases (read 11-27; line counts from `g5-decision-1127.md`). It downloads one artifact at an **explicit** version (never "latest"), verifies Central's `.sha256` when offered, and searches four declaration sites: `META-INF/MANIFEST.MF` (`KeelBase-Contract-Version` and three aliases), `META-INF/keelbase-contract.properties`, `keelbase-provenance.json`, and the embedded POM.
- Exit codes are three: `0` match, `1` mismatch (observed value printed), `2` undeclared or download/read failure — **not a pass**.
- **No invocation point for the check itself**: no workflow step, no `package.json` `check:*`, no `check:all` entry, no runbook line. Its **unit test does run** — the generic `cli:test` executes `scripts/*.test.mjs` in CI (`KeelBase/package.json`; `ci.yml:813`). So the script is tested but never applied; the two facts must not be conflated.
- Its header explains the omission: it reads the network, and "today" every published artifact answers "undeclared", so a hermetic pre-push gate would be red by construction. **That premise stopped being true with `0.1.20`.** That release (2026-11-21) added `KeelBase-Contract-Version` to every jar through a Maven profile (`KeelBase4J/pom.xml:200–217`), and the `0.1.21` download read back all three jars with `KeelBase-Contract-Version: v1.23.0` (`handoff/v0121-postcheck-1127.md` row 3). Those are hand-off readings of 11-26 downloads; not re-downloaded in this session.
- **G5's incremental value is narrower than the five-gate list suggests**: 4J already reads its own built `target/` jars back before the signing key is imported, with the same 0/1/2 exit codes (`release.yml:234–238`; `scripts/check-jar-contract-version.sh`). What only G5 reads is the bytes **Central actually serves** — upload-side transformation, a wrong artifact, a deploy that never completed.
- **The check has been run — by a sibling session.** `handoff/g5-wire-or-defer-1127.md` §2 records a read-only run on 2026-11-27 against live Central: exit 0 for all three artifacts at `0.1.21` vs `v1.23.0` (with `core` sha256 matching Central's `.sha256`), exit 1 with `--expect v1.22.0`, exit 2 for `0.1.19` (undeclared), and 10/10 tests. That is an executed reading in a hand-off file, not a reading of this session; it settles the "can it run" question and supplies the red/green/undeclared triple that option B's drill asks for.
- Central propagation is asynchronous: on the one measured release, run `45822868092` ended 12:50:40Z and `maven-metadata.xml` `lastUpdated` read 13:26:52Z — **≤ 36 min**, one observation, not a bound. A check that runs immediately after deploy will see 404/exit 2.
- The runbook records that a pushed tag publishes within the same run and cannot be retracted (`v1230-runbook-1126.md:369`); recovery is a new version. A post-publish check must therefore **not** be able to block or fail the publish step.

### Cost and risk

| Shape | Cost | Risk |
|---|---|---|
| Runbook step (manual) | ~0.25 day | A human step is not a gate; it can be skipped silently. |
| One scheduled CI job | 1–1.5 days + CI change approval | Third-party network; propagation lag; "latest version" must be resolved explicitly; job placement must not gate publishing. |
| Release-stage job (post-publish, non-blocking) | 1–1.5 days + CI approval | Runs inside `release.yml` after publishing; a red must notify, never fail the release; up to ~36 min of waiting per release. |

**Landing points are analysed separately.** `handoff/g5-decision-1127.md` (a sibling session, 2026-11-27) writes out the four possible homes — A1 4J `release.yml` after deploy, A2 a separate 4J workflow, A3 `KeelBase` CI, A4 host CI (named, not evaluated) — the fact that the script lives in `KeelBase` while the natural homes are in 4J (move it and delete the old copy, check the sibling repository out, or run it from `KeelBase`; copying 463 lines would put two copies of one rule in play), the `gate-coverage.mjs` bookkeeping, and six risks (R1–R6). That sheet is the fuller record on those points and does not choose either. What this page adds is the middle shape below: an invocation point that needs no CI approval.

### Options

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Formal deferral** | Record the deferral in the decision index at the next free number (**D70**, per `g5-decision-1127.md` §3.1; not only in a hand-off), optionally add the `gate-coverage.mjs` `NOT_COVERED` entry so `check:all` prints the gap, keep the script and its test, and do not count G5 as complete on 11-29. | Falsified if the deferral is later cited as "G5 closed", or if it exists only in hand-off files and not in the source of truth. |
| **B. Minimum wiring (one invocation point)** | Add one release-runbook step: after the propagation window, run the script with the explicit published version and the expected contract version, paste the reading into the release record. Drill it once: wrong `--expect` → exit 1, right `--expect` → exit 0, an older undeclared version → exit 2. Promote to a CI job after one clean cycle. | Falsified if a release record carries no artifact-contract reading, or if the drill does not produce the three distinct exit codes. |
| **C. Full CI job now** | Route A of `g5-decision-1127.md`: pick a landing (A1/A2/A3), resolve the released version explicitly (today `package.json` has no version field — it must come from the tree, not be typed), bound the wait for Central, and run the check; red means a notification, not a release block. | Falsified if the job is red for a reason other than the observed value (propagation, network) and no retry/grader exists, or if it can fail the publish step. |

### Conditions under which continuing to defer is defensible

1. The meeting writes the deferral in the **decision index**, not only in a hand-off, and states that G5 is not counted complete.
2. `0.1.22` (or the next release) again ships a manifest with `KeelBase-Contract-Version`; if it does not, the problem is a product defect and wiring would only make it visible — fix the manifest first.
3. No release is planned before the next review where an artifact-contract claim would be made externally.
4. The meeting accepts that G4 + C1–C5 do **not** cover this gap: they read pins and refs, not the published bytes.

**Suggested default (suggestion, not a ruling).** **B** — minimum wiring first. It costs a quarter-day, needs no CI change approval, and produces the red/green/undeclared triple that a CI job would also have to demonstrate. `g5-wire-or-defer-1127.md` recommends a two-step route — an advisory (non-blocking) job now, the blocking decision at 12-05 — and names, as the fallback when CI approval is refused, a formal deferral plus one runbook command. **B here is that fallback with teeth**: the same outside-CI invocation point, plus a dated reading in the release record and a drill that proves the three exit codes. It can be taken today without waiting for approval. Promote to **C** after one clean cycle, and place the job so it cannot fail a publish.

**Ruling line.** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** G5 stays at zero wiring; 11-29 cannot count it complete; the artifact-contract claim remains unchecked exactly as it was on 2026-11-14, now with a published artifact that does carry the field. The likely outcome is another cycle of "recorded but not wired", which is the gap the 11-23 document warned about.

---

## Page B3 — recipe: re-run on the refreshed copy

**The question.** The refreshed recipe was delivered to the delivery machine on 2026-11-23 (793 lines, marker `1f409a26…`, sha256 `35f076b7…`). It has not been re-run. When does it get re-run, by whom, and — if it cannot be — how is "not re-run" recorded without letting `v2-final` be claimed?

### Facts

| Item | Reading | Source |
|---|---|---|
| Single source | 792 lines, sha256 `c1d4d114…`, content commit `1f409a26`; no `v2-final` marker (the text at `:702` says "recipe v2") | read 11-27 |
| Render | 793 lines, sha256 `35f076b7c50a…`, first line `<!-- recipe-commit: 1f409a26… -->`; local copy 93,276 B, dated 11-23 13:33 | read 11-27 |
| Delivery machine copy | `~/keelbase-delivery/recipe.md`, 793 lines, same sha256, same marker, mtime 2026-11-23 13:33:23; old 710-line copy kept as `recipe.md.bak-20261123` (`b997a8cd…`) | hand-off `recipe-delivery-1123.md`; **not re-verified** (no SSH this session) |
| N1–N4 re-run cells | all four "not run"; the content supplements are all present | `w1-recipe-backfill-1122.md` §1; `w1-retro-recipe-v2-1123.md` §2.2 |
| DR-3 / DR-9 readings | never measured in any run | `w1-retro-recipe-v2-1123.md` §2.2 |

**The re-run is a cold-reader reproduction, not a current-main test.** The recipe anchors on `cdae38ea`; that tree's host pom pins `keelbase4j-core` / `keelbase4j-springai:0.1.8-SNAPSHOT`, which are not on public Maven, so the deliverer must install them from 4J source at `v0.1.8` (`-DskipTests`, not `-Dmaven.test.skip=true`). Re-pinning to a published version is allowed only as a reported deviation. This means a successful re-run proves the recipe reproduces the delivery baseline; it does not prove the current line.

### Environment and credentials

| Item | Needed | Status |
|---|---|---|
| Delivery machine | `kb` (user `aemg`), key-based SSH | proven by the 11-23 delivery; not exercised this session |
| Code checkout | `KeelBase-Vue-Pro` at `cdae38ea`, clean | deliverer creates it; `main` must not be used |
| 4J source | `v0.1.8` clone, built and installed to the local Maven repo | public clone; two-step install (`protocol` first) |
| Build toolchain | `bash`, the repo's `scripts/jdk25.sh`, Maven, Node | present on prior runs |
| Data stack | PG + Redis, isolated names/ports (Docker or the embedded stack at `D:/Rain6fish/.yd39-infra`) | embedded stack is on the author machine; the deliverer machine's stack is **not verified** |
| psql | real client, or `PSQL_HELPER_SCRIPT=scripts/psql-helper.mjs` | helper is in the repo |
| AI model key | **not required** (route-driven gate) | — |
| Maven Central / Gitee | dependency and 4J source reads | reachable, slow from some hosts |
| Central publishing credentials | **not required** | — |
| GitHub API | not required for the run; useful for evidence | often unreachable from this host (TLS/EOF) |

### Reproducible steps

1. **R0 — prepare (owner: dispatcher).** Confirm the single source is committed; render with `render-recipe-copy.sh`; `--check` against `1f409a26…`; `diff <(tail -n +2 render) source` must be empty; record lines/sha256.
2. **R1 — deliver.** `scp` the render to `~/keelbase-delivery/recipe.md`; on the machine read back `wc -l`, `sha256sum`, and line 1. They must equal 793 / `35f076b7…` / the marker. (Already true since 11-23; re-checking is the evidence.)
3. **R2–R5 — deliverer run.** Clone at `cdae38ea`; install 4J `v0.1.8`; enable the module dependency and the compensator; build; start with `PORT=48085`; run the gate; then walk §4.2 (coverage declaration, DR-3's three readings, DR-9's wording). N1 (marker), N2 (index), N3 (restart order), N4 (`runNN` directory) must each be exercised, not merely present.
4. **R6 — optional closing run.** The same run performed by a non-participant on an independent machine; this is also the only remaining path to W1.2's "from zero" half.

### Success and failure — how to read the result

| Observation | Verdict |
|---|---|
| Gate `exit 0`, `0 failed`, ok count matches the exercise's declared expectation (the last integrated run, Run 20, read 93 ok / 0 failed); negative control turns red exactly as declared | **Re-run passed** — N1–N4 may be marked "re-run (date, reading)" |
| `MODULE_NOT_FOUND` or an empty round checkout (zero deliverables) | **Round never written** — not a gate failure and not a reading (the 11-26 W1.4 failure mode) |
| ok count below the declared count, or a red assertion | **Failed re-run** — record the failing assertion; do not mark any cell "re-run" |
| Exit 2 / connection or download failure | **Environment failure** — fix the stack; still no reading |
| Report carries no `recipe-commit` marker or a different sha256 | **Version not proven** — the reading does not count for this copy |

### Time

Historical readings: run16-2 cold **56 m 41 s**; run17 hot **2 m 52 s** (reused deliverables, so not an independent measurement). The 11-26 window reached stack-up 20:59:26, build 21:01:06, host 21:01:54, gate 21:08:04 — but with zero deliverables, so it produced no time-to-green. Estimate for a prepared deliverer on a prepared machine: **2–3 hours**, plus the deliverable-writing time the runbook does not count. If the 4J `v0.1.8` install and the PG/Redis stack must be built from zero, allow **half a day**. AI-side preparation is done (render and delivery).

### Options

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Status quo** | Keep the `v2-rc` label and set no date. | Falsified if any cell is later marked "re-run" without a reading, or if `v2-final` appears without one. |
| **B. Schedule one deliverer session now** | Name a deliverer and a slot; run R1–R5 on the copy already delivered; mark `v2-final` only if every cell carries a fresh reading. If no deliverer is named, publish the "not re-run" record (below) at the close-out. | Falsified if the session runs on an old copy, or if the report cannot quote the marker and sha256. |
| **C. Upgrade to R6 in the same session** | A non-participant on an independent machine; also serves W1.2's "from zero" follow-up. | Falsified if the participant has prior context on this recipe, or if the machine shares the author's Maven cache and this is not stated. |

**Suggested default (suggestion, not a ruling).** **B** — one deliverer session on the copy that is already there. It is the smallest step that can turn `v2-rc` into `v2-final`, and it needs one input: the deliverer's time. If that input is not available before 11-29, fall back to A **plus** the written record below; do not leave the item silently open.

### "Not re-run" — paste-ready wording

```markdown
**Recipe v2: NOT RE-RUN as of <date>.**
Single source 792 lines, commit `1f409a26`; rendered copy 793 lines, sha256
`35f076b7c50a60c38fc8700d95b2d6b9dd0e074417d4d7fd6a8c359368031ab5`, marker `1f409a26…`,
delivered 2026-11-23 13:33:23. No N1–N4 cell carries a re-run reading; DR-3/DR-9 have never been
measured. The document stays at `v2-rc`; no cell may be marked "re-run" and no earlier reading may
be copied forward. Next attempt: <window / owner>, or "unscheduled — no deliverer named".
```

**Ruling line.** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** The recipe stays at `v2-rc` with four empty cells and no date; the close-out cannot say whether v2 reproduces the delivery; and the next release cycle inherits the same "materials ready, nobody ran it" state that has held since 2026-10-24.

---

## 4. Boundaries and sources

**What this document does not do.** It does not rule on CT-4, G5 or the recipe; it does not change the packet, the decision sheet, the weekly plan, the roadmap, the decision index or the claim table; it does not re-run the recipe, start a stack, edit or trigger CI; it does not contact anyone; it does not commit or push. Where a fact comes from a hand-off file, that file's time point governs; where it was read here, the source is named; where it could not be read, it is marked **not verified**.

**Not verified this session.** The delivery machine's current recipe hash (no SSH); Central's live bytes — not re-read here, the 2026-11-27 readings in `g5-wire-or-defer-1127.md` are cited, not reproduced; whether `0.1.22` will carry the manifest field; the App-X runner/VM state (GitHub API unreachable from this host); whether the private roadmap line `3abf0d45` has been corrected.

**Who signs what.** B1 is the rule owner's ruling (the user made the 11-26 ruling); the release-checklist line is executed by engineering. B2 needs a CTO decision; a CI job additionally needs the machine-side CI-change approval. B3 needs the dispatcher to name a deliverer and a slot; the deliverer signs the run report, not the ruling.

---

# B 线决策材料 —— CT-4、G5、recipe 复跑

> **性质。** 供 2026-11-28 CTO 周会与 2026-11-29 收口使用的决策材料。**不是裁定**：每页末尾是一行空白裁定，「建议默认值」一律标「建议，非裁定」。本件不重开 `D67`。
>
> **成稿。** 2026-11-27（+08）。文中每个 SHA、时刻、run id、行数与哈希都是该时刻的读数；执行时须现场复核。
>
> **边界。** 只读。未改任何计划件、roadmap、决定索引或认领表；未复跑 recipe；未起栈；未触发或修改 CI；未 contact 任何人；未提交、未 push。唯一产出是本文件与本组共享笔记里的一段指针。
>
> **读数纪律。** 事实只有三种来源：（a）本会话从仓库读到、并写明命令的；（b）来自一份交接件、且该件自己的时点已写明的；（c）标为**未核**。交接件的读数不升级为本会话的新读数。
>
> **编号。** B1 / B2 / B3 沿用 `handoff/nextstage-abc-1126.md` §3。它们不是 packet 的 D1–D5（`handoff/cto-1128-decisions-1126.md`），也不是 11-29 的 D1–D8（`handoff/nextstage-abc-1126.md` §6）。引用任何 D 编号时须带来源。
>
> **本会话新读数（2026-11-27）。** `KeelBase` 的 HEAD reflog 仍保有 2026-11-23 13:23:04 与 13:33:06 两条 amend 前的 `commit:` 行（`1392a671`、`b6c99418`）；契约 tag 对象 `71496bd` 指向 `015f474`；`KeelBase4J` 的 `main` = `origin/main` = `e8e9cad`，两笔读数器修复（`458447c`、`16e3721`）都已在其中；recipe 单源 792 行 / `c1d4d114…`、渲染件 793 行 / `35f076b7…`；G5 脚本 20,132 B，测试件 9,014 B。
>
> **单源。** `handoff/nextstage-abc-1126.md` §0/§3；`handoff/cto-1128-decisions-1126.md`（D5、D4）；`handoff/cto-1128-update-1127.md` §1.5–1.7/§2；`handoff/4j-ct4-crossday-1126.md`；`D:/Rain6fish/handoff/w3-advance-1124.md` §2–§7；`KeelBase4J/handoff/push-order-amend-1126.md`；`handoff/recipe-delivery-1123.md`；`D:/Rain6fish/handoff/w1-retro-recipe-v2-1123.md` §2；`D:/Rain6fish/handoff/w13-recipe-1122.md` §2/§4；`D:/Rain6fish/handoff/w1-recipe-backfill-1122.md`；`handoff/release-v0.1.21-published.md`；`handoff/g5-decision-1127.md`；`handoff/g5-wire-or-defer-1127.md`；`handoff/ct4-ruling-options-1127.md`；`handoff/v0121-postcheck-1127.md`；`KeelBase-Private/KeelBase-Vue-Pro/YD-28-FMS-复现recipe_2026-10-16.md`；`KeelBase/scripts/check-artifact-contract.mjs`；`handoff/v1230-runbook-1126.md`。

---

## 页 B1 —— CT-4：两条性质不同的发现

**问题。** 2026-11-23 的开发期挪 pin 与 2026-11-24 的 `v1.23.0` tag bump 都是推送顺序发现。前者按任何读法都违规；后者按 runbook 字面违规、按「提交到达契约 main」的读法合规 —— 而 2026-11-26 的裁定采用的字面读法。仍需决定的是两件：（1）11-23 那条怎么记；（2）未来 tag bump 的锚点维持「tag 已推」，还是改成「提交到达 main」。

### 事实

| 时刻（+08） | 事件 | 证据 |
|---|---|---|
| 2026-11-23 13:23:04 | `KeelBase` 子模块 pin → 契约提交 `1222354`（`c060ecf5`） | `HEAD` reflog `1392a671 … commit:`（11-27 读；23:47:04 的 `commit (amend)` 是钩子改写值） |
| 2026-11-23 13:33:06 | pin → `fe08a20`（`2ea7f597`） | `HEAD` reflog `b6c99418 … commit:`（11-27 读；23:53:06 的 amend 行是改写值） |
| 2026-11-23 19:15:37 | **契约当天首次推送**（`83468a4`） | GitHub run `45163554143`；本机 `origin/main` reflog `fetch … 19:15:40` |
| 2026-11-23 19:18:43 | `KeelBase` 推送 `2ea7f597` | `origin/main` reflog；run `45163986412` |
| 2026-11-24 19:01:24 | 契约 `main` 推送（`015f474`） | run `45380276968` |
| 2026-11-24 19:01:58 | pin bump `8f9baa75`（实际发布用的那笔） | 提交日期与 reflog（11-27 读） |
| 2026-11-24 19:03:24 | 契约 tag `v1.23.0` 推送 | run `45380594496` |
| 2026-11-24 19:04:33 | 消费方推送 | `KeelBase` reflog |

间隔：`13:33:06 → 19:15:37` = **5 小时 42 分 31 秒**；`19:01:58 → 19:03:24` = **86 秒**；`19:01:24 → 19:01:58` = **34 秒**。

规则原文（`KeelBase-Private/notes/CTO每周例会/2026-10-21-五项裁定.md:71`）：pin 只在三个时点动 —— 契约发版打 tag 后、消费方发版前、跨仓闸变红需追平；且必须按固定顺序 **契约推 → 消费方抬 pin → 消费方推，同一天内**完成。

**已经裁了什么。** 2026-11-26 用户裁定（`3b08706b`）：`v1.23.0` 的偏离**记一次违规**；不改写、不重放；顺序约束与同日条款**不变**，后续发布仍按原顺序执行；一次违规不构成先例。该裁定点名的是 11-24 宿主线那一案，**没有点名 11-23 的开发期挪 pin**。

**读数器说了什么、没说什么。** 推送顺序读数器（`KeelBase4J/scripts/check-push-order.mjs`）以 **tag 推送**为锚（`const upper = … timeline.contract.pushed`）。用 `--tag v1.23.0 --bump-commit 2ea7f597` 复跑，它返回 `VIOLATION`：tag 于 11-24 推送，晚于 pin bump，且不同日。该读数属实，但**不是 11-23 那条发现** —— v8 这条线没有 tag，读数器表达不了「bump 早于契约首次推送」。5 小时 42 分那条来自 `HEAD` reflog 与 GitHub run，不是读数器判决（`w3-advance-1124.md` §3.2、§7.2）。读数器修复（`458447c`，另有 `16e3721`）已在 `KeelBase4J` 的 `main` = `origin/main` = `e8e9cad` 中（11-27 读）；nextstage 里「已合并未推送」那句在该读数下已过期。

### 两种口径

| 口径 | 「契约推送」指 | 2026-11-23 那条 | 2026-11-24 那条 |
|---|---|---|---|
| **runbook 字面 / 读数器** | 契约 **tag** 已推 | **违规。** tag 要到 11-24；即便不看 tag，提交在 11-23 19:15:37 之前不在任何远端 ref 上，顺序与「三时点」两条都不成立。 | **违规**，早 86 秒 —— 11-26 裁定采用的就是这一读法。 |
| **「提交到达 main」** | 提交已推到契约 `main` | **仍是违规。** `main` 推送 19:15:37 比 bump 晚 **5 小时 42 分**，这一读法在 11-23 上救不了任何东西。 | **合规** —— 提交在 bump 前 34 秒已到 `main`。 |

不对称正是重点：**口径只决定 11-24**。11-23 上两种读法结论一致，唯一要选的是标签。

**两处文字细节。** （1）规则原文说的是「契约推 / contract push」；「契约 **tag** 推送」这一转述在 `KeelBase4J/conformance/vectors/README.md:83-84`（英文）/ `:106-107`（中文）与读数器里。所以「main 推送」的锚点比「字面」二字所暗示的更贴近规则原文 —— 但它会推翻 11-26 裁定实际采用的基准，所以那是规则变更，不是重新读一遍。（2）11-24 那一案里，tag 推送（19:03:24）**早于**消费方推送（19:04:33），CT-4 窗口要防的暴露（消费方读到还没上远端的契约）并没有发生；违规的是顺序条本身。这可以是要求从宽的论据，但不是把这一腿判成合规的论据 —— 而 11-26 裁定已经选了违规。

**字母不跨件通用。** `handoff/ct4-ruling-options-1127.md`（兄弟会话，2026-11-27）写的是**基准**选项 A（保留 tag 推送）、B（改锚到 main 上的提交）、C（双锚 + 「tag 早于消费方推送」）。本页的 **B**（按现行措辞把两条都记下）等于该件的 **A**；本页的 **C**（前瞻改锚）对应该件的 **B**，若要保住那道守卫则更好取该件的 **C**。该件建议 A，并指出它的 B 会丢掉「tag 早于消费方推送」这道守卫。往纪要里粘时，字母要带出处。

### 方案

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 维持现状** | 不作新裁定。11-23 只留在交接件里；11-24 维持已记录的违规。 | 若任何文件声称核心线 CT-4 干净，或下一次审计根本找不到 11-23 这条，即证伪。 |
| **B. 按现行措辞把两条都记下** | 落一条带日期的记录：11-23 记**违规**（顺序 + 触发时点），写明 5 小时 42 分与它造成的 C1 红；11-24 维持已裁记录。不改规则。发布清单加一行：「不得在提交未被任何远端 ref 暴露时挪 pin，三时点之外不得挪」。 | 若任一条目说不出被违反的是哪条，或日后同一形态未经书面规则变更就被判合规，即证伪。 |
| **C. 前瞻性改锚点** | 把规则改写为「提交到达契约 `main`」即算契约推送，**自某日起生效**；历史两条仍记违规；同一次裁定把 11-23 的形态写成明文禁止。若要保住那道守卫，取 `ct4-ruling-options-1127.md` §5-C 的双锚形态：两个契约事件任一满足顺序，**且** tag 推送必须早于消费方推送。 | 若早于 `main` 推送的 bump 被判合规，或新措辞被倒推适用到 `v1.23.0`，即证伪。11-26 裁定明写约束不变，所以这是规则变更，必须按规则变更签字。 |

**为什么 11-23 不提供「偏差」这一档。** 偏差登记必须说出哪一条仍然成立。11-23 上只有「同日」成立；顺序不成立，而且 pin 所指的提交在 5 小时 42 分里不被任何远端 ref 暴露 —— 这正是顺序条要防的失败模式，并且它以 C1 红的形式真的发生了（`pin fe08a20 不在任何 ref 上`）。4J 跨日那一案才是「偏差」有真实论据的场合（方向对、期间无消费）；那是 packet 的 D5，不是本页。在这里用「偏差」，会把唯一无争议的发现抹平。

### 建议措辞（可直接粘贴）

```markdown
**CT-4 · 2026-11-23 · 开发期挪 pin · 违规（顺序与触发时点）。**
消费方把 pin 挪到契约提交 `1222354`（13:23:04）与 `fe08a20`（13:33:06），而这两个提交当时
不在任何远端 ref 上；契约当天首次推送是 19:15:37（GitHub run 45163554143，head 83468a4），
晚 5 小时 42 分。该次挪动也不在 CT-4 允许的三个时刻之内。那段时间里 pin 指向空 ——
`release-gate` C1 读作「pin fe08a20 不在任何 ref 上」—— 这正是顺序条要防的失败模式。
记一次；不改写、不重放；顺序约束与同日条款原样不变。
```

```markdown
**CT-4 · 2026-11-24 · v1.23.0 tag bump · 按 tag 锚点记违规（已于 2026-11-26 裁定）。**
pin bump 19:01:58、tag 推送 19:03:24、消费方推送 19:04:33；bump 早于 tag 86 秒。同一提交在
bump 前 34 秒（19:01:24）已到契约 `main`；若按「提交到达 main」的锚点，这一腿本可合规，但
裁定维持了原文措辞，并把本案记一次违规。本条不改变该记录。若日后改锚点，变更自某日起前瞻
生效，不回溯本条。
```

**建议默认值（建议，非裁定）。** **B** —— 按现行措辞把 11-23 记一条违规，锚点不动。它不需要改规则，与 11-26 裁定一致，而且不让唯一「两种读法都成立」的那条被软化。若会上要为未来发布采用「main 推送」读法，正确形态是 **C**：按规则变更签，并写明生效日期，而不是塞进对一件过去事情的记录里。

**裁定行。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** 11-23 这条只留在交接件里；核心线在任何方向上都不能声称 CT-4 合规；日后审计可能对同一形态给出不一致的处理（11-24 记了、11-23 没记）；发布清单里没有一行能阻止重演。这是 B 线里唯一「不决定已有代价」的一项：一条无争议的违规留在账外，而一条更有争议的却已在账上。

---

## 页 B2 —— G5：接线，还是正式后置

**问题。** `KeelBase/scripts/check-artifact-contract.mjs` 在、有测试、**没有任何调用点**。G5 是五道闸里唯一零接线的一道。现在接线、最小接线（一个调用点），还是正式后置？

### G5 本该拦什么

其余各闸读的都是**关于构建的陈述**：G1 读消费方 pin 与契约 tag 的关系；G3 查提交信息顺序；G4 查宿主对象键与宿主所钉运行时版本；发布门 C1–C5 查契约成员性与 ref。没有一道读**消费者下载到的那串字节**。

G5 问构件本身 —— Central 上的 jar —— 它自述用的是哪一版契约。它补的是 2026-11-14 周会打开的口子：CHANGELOG 声称 `0.1.18` / `0.1.19` 带契约 `v1.22.0`，而这句话无人校验。它能拦住、别的闸拦不住的失败：构建实际取到了过期的 vendored 快照或错误的 ref（尽管 workflow 写了 `ref:`）；以及构件什么都不声明（退出码 2 —— 「未声明」不是通过）。

### 事实

- 脚本 20,132 B / 463 行；测试件 9,014 B / 222 行、10 例（11-27 读；行数引自 `g5-decision-1127.md`）。它按**显式**版本下载一个构件（绝不取「最新」），在 Central 提供 `.sha256` 时先校验，然后按顺序找四个声明位置：`META-INF/MANIFEST.MF`（`KeelBase-Contract-Version` 及三个别名）、`META-INF/keelbase-contract.properties`、`keelbase-provenance.json`、内嵌 POM。
- 退出码三个：`0` 一致、`1` 不一致（打印观测值）、`2` 未声明或下载/读取失败 —— **不是通过**。
- **这个检查本身没有任何调用点**：workflow 无一步、`package.json` 无 `check:*`、`check:all` 无条目、runbook 无一行。但它的**单元测试确实在跑** —— 通用 `cli:test` 会在 CI 里执行 `scripts/*.test.mjs`（`KeelBase/package.json`；`ci.yml:813`）。「有测试」与「从没被应用」是两件事，不能混说。
- 脚本头部解释了为何不进 `check:all`：它要读网络，而且「今天」每个已发布构件都答「未声明」，接进封闭的推送前门禁等于注定常红。**该前提从 `0.1.20` 起就不成立了。** 该版（2026-11-21）已用 Maven profile 把 `KeelBase-Contract-Version` 写进每个 jar（`KeelBase4J/pom.xml:200–217`）；`0.1.21` 的下载件三个 jar 也都读作 `KeelBase-Contract-Version: v1.23.0`（`handoff/v0121-postcheck-1127.md` 第 3 行）。这些都是 11-26 下载的交接件读数，本会话未重新下载。
- **G5 的增量价值比「五闸」这个说法窄。** 4J 在导入签名钥匙之前，已经用同一套 0/1/2 退出码读回自己构建出的 `target/` jar（`release.yml:234–238`；`scripts/check-jar-contract-version.sh`）。只有 G5 读的是 **Central 实际发出的字节** —— 上传侧改造、发错件、deploy 没走完。
- **这个检查已经跑过 —— 由兄弟会话跑过。** `handoff/g5-wire-or-defer-1127.md` §2 记录 2026-11-27 对 Central 真实字节的只读运行：`0.1.21` 三个构件对 `v1.23.0` 均退出 0（`core` 的 sha256 与 Central `.sha256` 一致）、用 `--expect v1.22.0` 退出 1、对 `0.1.19` 退出 2（未声明）、测试 10/10。这是交接件里的实跑读数，不是本会话的读数；它回答了「能不能跑」，并直接提供方案 B 演练所需的「红 / 绿 / 未声明」三读数。
- Central 落库是异步的：唯一一次实测，run `45822868092` 结束于 12:50:40Z，`maven-metadata.xml` 的 `lastUpdated` 为 13:26:52Z —— **≤ 36 分钟**，只对一次发布成立，不是上界。发布后立刻跑的检查会看到 404 / 退出 2。
- runbook 明写：tag 一旦推送，`release.yml` 在同一次运行内发布，事后删 tag 无法撤回（`v1230-runbook-1126.md:369`），救法只能是新版本。因此发布后的检查**不得**让发布步骤失败或被阻断。

### 代价与风险

| 形态 | 代价 | 风险 |
|---|---|---|
| runbook 步骤（人工） | 约 0.25 日 | 人工步骤不是闸，可能被静默跳过。 |
| 一条定时 CI 作业 | 1–1.5 日 + CI 改动批准 | 依赖第三方网络；落库延迟；「最新版本」须显式解析；作业位置不能卡发布。 |
| 发布阶段作业（发布后、非阻断） | 1–1.5 日 + CI 批准 | 跑在 `release.yml` 发布之后；红只能通知，不能判发布失败；每版最多多等约 36 分钟。 |

**落点分析另有专页。** `handoff/g5-decision-1127.md`（兄弟会话，2026-11-27）已写全四个落点 —— A1 4J `release.yml` deploy 之后、A2 4J 独立工作流、A3 `KeelBase` CI、A4 宿主 CI（只点名、未评估）—— 以及「脚本在 `KeelBase`、天然落点在 4J」的归仓问题（移过去并删旧处、检出兄弟仓、或从 `KeelBase` 跑；复制 463 行等于同一规则两份）、`gate-coverage.mjs` 的记账、与六条风险（R1–R6）。那几点的完整记录以该件为准，且该件同样不选。本页补的是中间形态：一个不需要 CI 改动批准的 runbook 调用点。

### 方案

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 正式后置** | 把后置写进决定索引的下一个空号（**D70**，按 `g5-decision-1127.md` §3.1；不只在交接件里），可选补上 `gate-coverage.mjs` 的 `NOT_COVERED` 条目让 `check:all` 每次打印这个空档；保留脚本与测试；11-29 不计 G5 完成。 | 若日后把后置引用成「G5 已闭合」，或后置只存在于交接件而不在单源里，即证伪。 |
| **B. 最小接线（一个调用点）** | 发布 runbook 加一步：落库窗口过后，用显式已发布版本与期望契约版本跑一次脚本，把读数抄进发布记录。做一次红绿演练：错的 `--expect` → 退出 1，对的 → 退出 0，一个更早的未声明版本 → 退出 2。跑完一个干净周期后再升级为 CI 作业。 | 若某次发布记录里没有构件—契约读数，或演练拿不出三个不同退出码，即证伪。 |
| **C. 现在就上完整 CI 作业** | `g5-decision-1127.md` 的路 A：先定落点（A1/A2/A3），显式解析已发布版本（今天 `package.json` 没有版本字段，版本必须取自树、不能手写），给 Central 一个等待上界，再跑检查；红是通知，不是发布阻断。 | 若作业因传播、网络而非观测值变红且没有重试/判读，或它能判发布失败，即证伪。 |

### 继续后置可以成立的条件

1. 会上把后置写进**决定索引**的 D70（不只在交接件里），并写明 G5 不计完成。
2. `0.1.22`（或下一个版本）的清单仍带 `KeelBase-Contract-Version`；若不带，那是产品缺陷，接线只会让它可见 —— 先修清单。
3. 下一次复核前没有需要对外作构件—契约声明的发布。
4. 会上接受 G4 + C1–C5 **不覆盖**这个缺口：它们读 pin 与 ref，不读已发布字节。

**建议默认值（建议，非裁定）。** **B** —— 先做最小接线。四分之一日、不需 CI 改动批准，而且能产出 CI 作业同样必须拿出的「红 / 绿 / 未声明」三读数。`g5-wire-or-defer-1127.md` 建议两步走 —— 先落告警（非阻塞）作业、阻塞与否到 12-05 再定 —— 并写明「CI 批准被拒时的退路」是正式后置加一条 runbook 命令。**本页的 B 是那条退路的加强版**：同样把调用点放在 CI 之外，另加发布记录里的带日期读数与一次能证明三个退出码的演练；今天就能做，不必等批准。跑完一个干净周期再升 **C**，并把作业放在不可能判发布失败的位置。

**裁定行。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** G5 停在零接线；11-29 不能把它计入完成；构件—契约声明仍与 2026-11-14 那天一样无人校验，只不过现在有一个确实带了该字段的已发布构件。最可能的结局是再来一轮「登记了但没接线」—— 正是 11-23 文档警告过的缺口。

---

## 页 B3 —— recipe：在刷新副本上复跑

**问题。** 刷新版 recipe 已于 2026-11-23 下发到交付机（793 行、marker `1f409a26…`、sha256 `35f076b7…`），但没有复跑。什么时候跑、谁来跑；跑不了时，怎样如实记「未复跑」，同时不让 `v2-final` 被顺手宣称？

### 事实

| 项 | 读数 | 出处 |
|---|---|---|
| 单源 | 792 行、sha256 `c1d4d114…`、内容提交 `1f409a26`；无 `v2-final` 标记（`:702` 原文写「recipe v2」） | 11-27 读 |
| 渲染件 | 793 行、sha256 `35f076b7c50a…`、首行 `<!-- recipe-commit: 1f409a26… -->`；本机副本 93,276 B、11-23 13:33 | 11-27 读 |
| 交付机副本 | `~/keelbase-delivery/recipe.md`，793 行、同 sha256、同 marker、mtime 2026-11-23 13:33:23；旧 710 行件备份为 `recipe.md.bak-20261123`（`b997a8cd…`） | `recipe-delivery-1123.md` 交接件；本会话**未核**（未 SSH） |
| N1–N4 复跑格 | 四格全部「未跑」；内容补充均已就位 | `w1-recipe-backfill-1122.md` §1；`w1-retro-recipe-v2-1123.md` §2.2 |
| DR-3 / DR-9 读数 | 从未在任何一次运行中量过 | `w1-retro-recipe-v2-1123.md` §2.2 |

**这次复跑是冷读者复现，不是当前 main 的测试。** recipe 锚定 `cdae38ea`；该树的宿主 pom 钉 `keelbase4j-core` / `keelbase4j-springai:0.1.8-SNAPSHOT`，这两个坐标不在公开 Maven 上，交付者必须从 4J 源码 `v0.1.8` 装出来（用 `-DskipTests`，不要用 `-Dmaven.test.skip=true`）。改钉到某个已发布版本只允许作为**写进报告的偏离**。也就是说：复跑成功证明 recipe 能复现交付基线，不证明当前版本线可用。

### 环境与凭据

| 项 | 需要什么 | 现状 |
|---|---|---|
| 交付机 | `kb`（用户 `aemg`），密钥 SSH | 11-23 下发已证明；本会话未再触碰 |
| 代码检出 | `KeelBase-Vue-Pro` 于 `cdae38ea`，干净树 | 由交付者自建；**不得**用 `main` |
| 4J 源码 | `v0.1.8` 克隆，装进本机 Maven 仓 | 公开克隆；两步安装（先 `protocol`） |
| 构建工具 | `bash`、仓内 `scripts/jdk25.sh`、Maven、Node | 既往运行已具备 |
| 数据栈 | PG + Redis，隔离库名/端口（Docker 或 `D:/Rain6fish/.yd39-infra` 的 embedded 栈） | embedded 栈在作者机器上；**交付者机器上的栈未核** |
| psql | 真客户端，或 `PSQL_HELPER_SCRIPT=scripts/psql-helper.mjs` | 助手在仓内 |
| 模型 key | **不需要**（路由驱动的门禁） | — |
| Maven Central / Gitee | 依赖与 4J 源码读取 | 可达，部分主机较慢 |
| Central 发布凭据 | **不需要** | — |
| GitHub API | 复跑不需要；取证时需要 | 本机常连不上（TLS/EOF） |

### 可复现的步骤

1. **R0 —— 准备（派活方）。** 确认单源已提交；用 `render-recipe-copy.sh` 渲染；`--check` 对 `1f409a26…`；`diff <(tail -n +2 渲染件) 单源` 为空；记录行数与 sha256。
2. **R1 —— 下发。** `scp` 到 `~/keelbase-delivery/recipe.md`；在机器上回读 `wc -l`、`sha256sum`、首行，三值须等于 793 / `35f076b7…` / marker。（11-23 起已成立；回读本身就是证据。）
3. **R2–R5 —— 交付者跑。** 在 `cdae38ea` 克隆；装 4J `v0.1.8`；启用模块依赖与补偿器；构建；`PORT=48085` 起宿主；跑门禁；然后走 §4.2（覆盖声明、DR-3 三条读数、DR-9 措辞）。N1（marker）、N2（下标）、N3（重启顺序）、N4（`runNN` 目录）要各自**被实际经过**，不只是「文里有了」。
4. **R6 —— 可选收官。** 同一次由**未参与过的人 + 独立机器**完成；这也是 W1.2「从零」那一半唯一的剩余路径。

### 成功与失败怎么判

| 观察 | 判读 |
|---|---|
| 门禁 `exit 0`、`0 failed`；ok 数与本次声明的预期一致（最近一次整合 Run 20 读作 93 ok / 0 failed）；负对照按声明变红 | **复跑通过** —— N1–N4 可标「复跑（日期、读数）」 |
| `MODULE_NOT_FOUND` 或轮检出零交付物 | **本轮根本没写** —— 不是门禁失败，也不是读数（11-26 W1.4 的失败形态） |
| ok 数低于声明，或出现红的断言 | **复跑失败** —— 记下失败断言；任何格都不标「已复跑」 |
| 退出 2 / 连接或下载失败 | **环境失败** —— 修栈；仍无读数 |
| 报告没有 `recipe-commit` marker，或 sha256 不同 | **版本未证** —— 该读数不适用于本副本 |

### 耗时

历史读数：run16-2 冷跑 **56 分 41 秒**；run17 热跑 **2 分 52 秒**（复用交付物，不是独立量测）。11-26 那次窗口：20:59:26 起栈、21:01:06 构建完、21:01:54 宿主起、21:08:04 门禁 —— 但零交付物，所以没有 time-to-green。估算：**准备就绪的交付者、就绪的机器，2–3 小时**，另加交付物编写时间（不计入 time-to-green）。若 4J `v0.1.8` 安装与 PG/Redis 栈要从零搭，按**半日**算。AI 侧准备已完成（渲染与下发）。

### 方案

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 维持现状** | 保持 `v2-rc`，不排日期。 | 若日后任何格在没有读数的情况下被标「已复跑」，或 `v2-final` 在没有读数时出现，即证伪。 |
| **B. 现在就排一次交付者场次** | 具名交付者与时段；在已下发的副本上跑 R1–R5；只有每格都有新读数才标 `v2-final`。若排不出人，在收口时发布下面的「未复跑」记录。 | 若该场次跑在旧副本上，或报告抄不回 marker 与 sha256，即证伪。 |
| **C. 同场升级到 R6** | 未参与过的人 + 独立机器；同时服务 W1.2「从零」后续。 | 若参与者此前对该 recipe 有上下文，或机器共用作者的 Maven 缓存而报告未说明，即证伪。 |

**建议默认值（建议，非裁定）。** **B** —— 在已经在那里的副本上排一次交付者场次。这是能把 `v2-rc` 变成 `v2-final` 的最小一步，只需要一项输入：交付者的时间。若 11-29 前拿不到这项输入，退到 A **加上**下面的书面记录；不要让这一项悄悄开着。

### 「未复跑」——可直接粘贴的措辞

```markdown
**recipe v2：截至 <日期> 未复跑。**
单源 792 行、提交 `1f409a26`；渲染件 793 行、sha256
`35f076b7c50a60c38fc8700d95b2d6b9dd0e074417d4d7fd6a8c359368031ab5`、marker `1f409a26…`、
2026-11-23 13:33:23 下发。N1–N4 四格均无复跑读数；DR-3/DR-9 从未量过。文档保持 `v2-rc`；
任何格不得标「已复跑」，任何旧读数不得抄入。下一次尝试：<窗口 / 责任人>，或「未排期 —— 无具名交付者」。
```

**裁定行。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** recipe 停在 `v2-rc`、四格空着、没有日期；收口无法说明 v2 是否可复现交付；下一个发布周期继承自 2026-10-24 以来一直存在的「材料齐、没人跑」状态。

---

## 4. 边界与出处

**本件不做什么。** 不对 CT-4、G5、recipe 作任何裁定；不改 packet、决策单、周计划、roadmap、决定索引、认领表；不复跑 recipe、不起栈、不改不触发 CI；不 contact 任何人；不 commit、不 push。事实来自交接件的，以该件自己的时点为准；本会话读到的，写明出处；读不到的，标**未核**。

**本会话未核。** 交付机当前的 recipe 哈希（未 SSH）；Central 的实时字节 —— 本会话未重读，`g5-wire-or-defer-1127.md` 里 2026-11-27 的读数是引用，不是本会话复现；`0.1.22` 是否会带清单字段；App-X 的 runner/VM 现状（本机连不上 GitHub API）；私库 roadmap 那句 `3abf0d45` 是否已订正。

**谁签什么。** B1 由规则所有者裁定（11-26 的裁定即出自用户）；发布清单那一行由工程执行。B2 需要 CTO 决定；上 CI 作业另需机器侧的 CI 改动批准。B3 需要派活方指明交付者与时段；交付者签的是运行报告，不是裁定。

---

*Read-only decision material for 2026-11-28 / 2026-11-29. Not a ruling; every ruling line is blank. — 供 2026-11-28 / 2026-11-29 使用的只读决策材料，非裁定；所有裁定行均空白。*
