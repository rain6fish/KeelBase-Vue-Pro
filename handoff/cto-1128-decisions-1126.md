# CTO Weekly 2026-11-28 · Decision Sheet — D1–D8 and N5 Criterion 5 Scoring Table / 2026-11-28 CTO 周会 · 决策单 —— D1–D8 与 N5 判据 5 判分表

## English

> **Purpose.** Turn the five open decisions in `handoff/cto-1128-packet.md` into one signable page per decision, and lay out the 12-cell scoring table for N5 criterion 5. **Added 11-27:** three more pages, D6–D8, carried over from the 2026-11-29 close-out material — the N5 second session, the CT-4 basis, and G5 — so that one sheet covers everything this weekly can sign. This sheet formats the decisions; it does not make them.
>
> **Prepared.** 2026-11-26 (UTC+08), for the 2026-11-28 04:03 CTO weekly.
>
> **Updated 2026-11-27** with the 11-26 evening results: the v0.1.21 release, the four-layer review, the W1.4 third window, the App-X guard merge and the CT-4 ruling. Blocks added or corrected on 11-27 are marked "Update (11-27)", "Verified 11-27", "Corrected 11-27", or an italic *(11-27: …)* note. The 11-26 text is kept where it is still the record of what was known then; only lines that are now factually wrong are corrected in place and marked. Full source: `handoff/cto-1128-update-1127.md`.
>
> **Boundary.** Read-only. This sheet does not change the packet, the weekly plan, the roadmap, the decision index or the claim table; does not contact anyone; does not commit or push; does not rule for any person. Every "suggested default" is a suggestion, not a ruling. A ruling exists only where a person signs the page.
>
> **Quotations.** Chinese source text is translated in this block; the verbatim Chinese wording appears in the Chinese block below. Locations are given for every quotation.
>
> **Numbering.** D1–D5 are the 2026-11-28 packet's. **D6–D8 were added on 11-27** from the 2026-11-29 close-out material, where the same three decisions carry different numbers: D6 = that list's D2 (N5 second session), D7 = its D3 (CT-4 basis), D8 = its D4 (G5). The two lists are not interchangeable; cite the source whenever a D-number is quoted.
>
> **Sources.** `handoff/cto-1128-packet.md` (11-26 12:52); `handoff/n5-verdict-1126.md` (11-26 12:49); `handoff/n5-closeout-1126.md` (11-26); `handoff/v1230-release-plan-1126.md` (11-26, unexecuted); `handoff/w14-ready-1126.md` (11-26 12:33–12:45). Added 11-27: `handoff/cto-1128-update-1127.md`; `handoff/release-v0.1.21-published.md`; `handoff/release-precheck-0.1.21-1126.md`; `handoff/w14-third-outcome-1127.md`.

### How to use this sheet

- Each decision page has: the packet question, the evidence level, 2–3 options including the status quo, a falsifiable consequence per option, a suggested default marked "suggestion, not a ruling", a blank ruling line, and a final "if not ruled" line matched to the packet question.
- Do not read a suggested default as a ruling. The blank ruling line is the only place a decision becomes binding.
- Part 2 lists both possible rulings for criterion 5 and their consequences. The scorer marks one; this sheet does not mark it.

### Index

| ID | Decision | Evidence level | Suggested default (not a ruling) | Status at 11-27 |
|---|---|---|---|---|
| D1 | N5 criterion 5: written ruling on the two "what changed to" cells | E3 ceiling; criterion 4 unproven | Keep the status quo until the scorer signs | **Ruled A (11-27) — status quo kept; the scorer's signature is still outstanding** |
| D2 | App-X: open a VM window for one real compile before 12-05? | E2 mock; E0 real compile | Keep the documentation-only file to 12-05 | **Ruled A (11-27)** — documentation-only file to 12-05; real compile never run; runner state unverified |
| D3 | N9: 12-05 criterion — one `compile` success or one real compile? | E1 | Take the minutes' wording (`compile` success) | **Ruled A (11-27)** — minutes' wording kept; unobservable while the runner is offline |
| D4 | W1.4: if tonight fails, open a "third failure" decision? | No time-to-green reading yet | Keep the status quo; decide on the result at 11-28 | **Ruled A (11-27)** — status quo; the third shape stays unclassified; the fourth window is unscheduled |
| D5 | 4J cross-day bump: deviation record or violation? | E3 | Record as a deviation, with the distinction written | **Ruled A (11-27)** — deviation, with the carve-out wording drafted; signature pending |
| D6 | N5: hold a second acceptance session? | E3 ceiling; second approver is a seed account | Do not hold one now (B) | **Ruled B (11-27); signature pending** — added 11-27 from the 11-29 close-out list |
| D7 | CT-4: which "contract push" is the order measured against? | E3 — reader verdicts plus the push record | Keep the literal tag push (A) | **Ruled A (11-27); signature pending** — added 11-27; the ruling is recorded in `handoff/ct4-ruling-options-1127.md` §10, the sheet is not signed |
| D8 | G5: wire the artifact-contract check now or record the deferral? | Executed readings against live Central (11-27) | Two steps: advisory job now, blocking decision at 12-05 (C) | **Ruled C (11-27); signature pending** — added 11-27; nothing is wired by the sheet, and G5 is not complete on 11-29 |

**Status at 2026-11-27, in one line each.** D1 narrowed (path A written; signature only). D2 half closed (guard merged and pushed `d939527`; real compile never run; runner unverified). D3 open and stricter (the guard now demands a real success marker). D4 open with a new shape (present, chain green, deliverables never landed). D5: the wording is ruled for the v1.23.0 host-line instance, the 4J cross-day instance is not. **All eight are now ruled (11-27): D1–D5 A, D6 B, D7 A, D8 C** — recorded on each page, with D7's ruling also in `handoff/ct4-ruling-options-1127.md` §10. The ruling lines and the sign-off register stay blank: these notes record that the decisions were made, not that the sheet is signed. Substance: criterion 5 stays the scorer's to sign and is unsigned; the App-X file stays documentation-only to 12-05; the N9 criterion keeps the minutes' wording; W1.4 keeps the status quo; the 4J cross-day bump is logged as a deviation behind an explicit carve-out; no second N5 session; the CT-4 basis is the tag push, unchanged; G5 goes advisory-first with nothing wired.

**What changed since this sheet was written (11-27).**

- **v0.1.21 published.** Annotated tag `edb27b1` → `e8e9cad` (= `origin/main` = `gitee/main`); release run `45822868092` success (3m42s); four Maven Central coordinates 200 at 13:30Z, `core` sha256 matching; host pin raised to 0.1.21 in 3 files / 5 places (`5a204b2348`, pushed to both remotes); `release-plan.json` `done=true`. **No Release page**, per the 11-26 ruling and contract commit `eb99d11`.
- **Four-layer review: WITH FIXES.** 5 blocking findings fixed in 4 commits (`eac046b`, `370f2b2`, `4b5d12e`, `4a0ae35`), 7 suggestions landed, 11 commits in all; `release-gate.sh` 16 pass / 0 fail at `cab30f9`; 52 targeted tests green.
- **W1.4 third window ran and produced no reading** — see the D4 update.
- **App-X guard merged and pushed** (`d939527`); the real compile still has never run — see the D2 update.
- **CT-4 wording ruled "record once as a violation"**; the 4J cross-day instance itself is still open — see the D5 update.
- **Rulings received 11-27.** Every page now carries a "Ruling received (11-27)" note: D1–D5 A, D6 B, D7 A, D8 C. No ruling line and no sign-off row has been signed — the notes record decisions, not signatures.

---

## Part 1 — Decision pages

### D1 · N5 criterion 5: the written ruling

**Packet question (translated).** Whether the scorer will rule in writing that the two "what changed to" cells count as business answers — if not ruled, "recorded as passed" and "criterion 5 undetermined" coexist long-term.

**Evidence level.** E3 ceiling; no E4. Criteria 1/2/3 have checkable readings, each with a qualification (1: person level not established; 2: file specification established, attribution unproven; 3: readings outside the session window); criterion 4 is not established (no evidence); criterion 5 is pending. The five criteria are not all met.

**Already settled (not reopened).** Path A was selected on 11-26: accept the 11-25 ruling and write the evidence boundary; no re-run (B), no downgrade (C). The §11.3 internal-record wording is for the weekly-plan owner to merge; this sheet does not write it. The nine missing items in closeout §5 are marked "already ruled, not to be filled" and kept on file.

**Update (11-27).** Path A has since been written down: `677acec5` (11-26 23:37:49) put it and the evidence boundary in the N5 row of the weekly plan; `30c1af96` did the same for the claim table. The row now reads, in its own words, tier E3, criterion 4 unsupported, criterion 5's two cells needing a ruling (leaning unmet), and "no external claim of acceptance passed or E4". **Criterion 5 has still not been signed by a scorer.** Separately, the 11-27 nightly (`91252123`, 02:18) re-verified N5 read-only on 4J `main` `62939b9` — three suites 7/7, 3/3, 1/1 and the bilingual gate exit 0 — which re-verifies the code and evidence, not this criterion. **So D1 is now a one-line decision: sign A, B or C.**

**Options.**

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Keep the status quo** | No written ruling. The record layer keeps "passed"; the evidence layer keeps "criterion 5 pending" beside it. | Falsified if any citation of "N5 passed" appears without the four boundary sentences in verdict §11.2. Observable in the plan and the archive. |
| **B. Rule the two cells as business answers** | The scorer signs that the verbatim copy satisfies the cell-specific rule (answer key §2/§3); criterion 5 is established. | Falsified if the product's fixed sentence for "new" changes, or if the ruling is treated as established without the scorer's signature. If ruled: criterion 5 passes; criterion 4 remains unproven; the five are still incomplete; ceiling stays E3; no acceptance claim. |
| **C. Rule the two cells as unrecorded** | The scorer signs that the reader's self-marked "empty" triggers the general rule (answer key §7); criterion 5 is not established. | Falsified if the scorer finds §2 is the exclusive rule for that cell and the verbatim copy satisfies it. If ruled: criterion 5 is undetermined; the five are still incomplete; "recorded as passed" coexists with "criterion 5 not established"; the top line is unchanged because criterion 4 is already unproven. |

**Suggested default (suggestion, not a ruling).** A — keep the status quo until the scorer signs. Only the scorer can make this ruling; the meeting should not substitute for the scorer.

**Ruling received (11-27).** The chair kept the **status quo (A)** and did not substitute for the scorer: there is no written ruling on the two cells, and criterion 5 stays unsigned. The record layer keeps "passed" beside the evidence layer's "criterion 5 undetermined". **A is not a scorer ruling** — the ruling line below is still the scorer's to sign, and this note does not sign it.

**Ruling line (signed by the scorer, not the chair).** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** The packet's question stands: "recorded as passed" and "criterion 5 undetermined" coexist long-term; "N5 passed" remains at the ruling layer and cannot support any external or delivery claim.

---

### D2 · App-X maintenance file to 12-05

**Packet question (translated).** Before the 12-05 review, should one real compile get its own VM window, or should the documentation-only file stand and not be chased?

**Evidence level.** E2 — mock three cases on two PowerShell versions. Real compile: E0 (not run).

**Unverified.** Real HBuilderX compile never run. **Corrected 11-27:** the guard branch is no longer unmerged, so the 11-26 line "guard branch not pushed or merged (main still `cc8b1a3`)" is withdrawn. What remains open: the real compile (E0); the VM (last known stuck on the welcome screen, never power-cycled); and the runner / VM state now — **unverified**, because GitHub's API is unreachable from this host (TLS handshake / EOF).

**Update (11-27).** The guard is in: `5983f3b` (07:55), merge `bda11b1` (13:16), then `d939527` (13:21, `ci(compile): run the guard's self-test on every push`). `main` and `origin/main` both read `d939527`, 0 ahead. The script now requires exit 0 **and** a success marker, and the self-test runs on every push — which means CI exercises the mock path each time and still produces no evidence of a real compile. **So D2's remaining question is only the VM window, not the guard.**

**Options.**

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Keep the documentation-only file to 12-05** | No VM window. | At 12-05 there is no real-compile reading; renewal rests on E2 mock only; the item "real compile not run" persists. Observable: no compile log or artifact dated before 12-05. |
| **B. Open one VM window before 12-05 and run one real compile** | One dated compile attempt, result recorded. | Observable: a compile log or artifact from the VM. If it fails, the premise "mock green implies real green" is falsified and the file must record a red; if it passes, the item "real compile not run" can be closed for that commit (not a general proof). |
| **C. Defer the choice to the 12-05 review** | No decision now; decide on VM and runner state at the review. | Falsified if the 12-05 review passes without deciding the item. No new reading in the meantime. |

**Suggested default (suggestion, not a ruling).** A — keep the documentation-only file to 12-05. The VM is hung and power-cycling is a separate risk; the mock covers the guard logic; a real compile is a chain check. B is the only way to close the E0 item before 12-05. *(11-27: the VM's hung state is unverified now; if the VM is healthy, B's cost is lower than this line assumed.)*

**Ruling received (11-27).** The user ruled **A**: the documentation-only file stands to 12-05 and no VM window is opened. The real compile stays at E0, the file's basis stays E2 mock, and "real compile not run" persists. If the VM turns out healthy before 12-05, opening a window is a new decision, not this one.

**Ruling line.** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** The 12-05 review faces the same question with no fresh compile reading; the file's basis stays E2; the VM's hung state remains unaddressed.

---

### D3 · N9 review criterion on 12-05

**Packet question (translated).** Should the 12-05 review criterion take the minutes §12 P0-E wording — one `compile` success — or one real compile?

**Evidence level.** E1 — the 11-23 reading plus the 11-26 recheck (still offline).

**Unverified.** The runner recovery path has not been drilled (open the VM, then `gh variable set … --body true`). *(11-27: the runner's current state is also unverified — GitHub's API is unreachable from this host.)*

**Update (11-27).** No ruling has been made. But the guard merge changed what the options mean: since `d939527`, a dispatched `android-compile` job can only succeed if the CLI printed a real success marker, so **option A ("one `compile` success") and option B ("one real compile") now describe almost the same observation** — the difference is only where the evidence lives (a CI job vs a VM log), not what it proves. The 11-26 warning still holds and is now the whole question: with the runner offline the job cannot be dispatched, so neither A nor B is observable until the VM and runner are back.

**Options.**

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Criterion = one `compile` success (as written)** | Keep the minutes' wording. | Observable only when the `android-compile` job is actually dispatched and succeeds. With the runner offline and the repository variable at 0, no compile job can be dispatched, so the criterion is unobservable until the runner is online. If 12-05 arrives with no job dispatched, the criterion is not met and not observable. |
| **B. Criterion = one real compile** | Raise the bar to a real compile. | Observable as a real compile log or artifact, not just a CI job success; requires a working Windows runner and more setup. If the runner is offline, not met. |
| **C. Keep the status quo: no criterion change now** | Decide at 12-05 on the runner state. | Falsified if 12-05 passes without a criterion. Risk: the review re-litigates the question. |

**Suggested default (suggestion, not a ruling).** A — keep the minutes' wording. Changing a review criterion is a scope change and should be explicit. Note that the wording is unobservable until the runner is online.

**Ruling received (11-27).** The user ruled **A**: the 12-05 review criterion stays as the minutes wrote it — one `compile` success. The standing consequence is unchanged and must travel with the ruling: with the runner offline and `APPX_WINDOWS_RUNNER` unset, no `android-compile` job can be dispatched, so the criterion is unobservable and 12-05 would find it not met. Changing it later is a scope change and must be explicit.

**Ruling line.** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** The 12-05 review has no agreed criterion; renewal or exit of the maintenance file cannot be judged; N9 stays "runner offline, gate configured closed".

---

### D4 · W1.4 third window

**Packet question (translated).** If tonight's window still does not run, should W1.4 get a separate decision as a "third failure"?

**Evidence level.** None for time-to-green — and still none after the window. **Corrected 11-27:** the window did run; the reading is negative, not absent.

**Verified 11-27 (the four items left open on 11-26).** Both rounds did not complete — only round 1, tried twice. There is no time-to-green and no T1. The 20:56:52 T0 was voided; a second T0 at 21:29:59 has no T1. "Turn off display = never" was not in effect: the machine entered S0 connected standby at 20:42:01 and again at 21:32:40, the second one 2m33s after the session ended its turn waiting for the author.

**Update (11-27).** Author present, three replies inside the window (20:56:34 "在场，开始", 20:59:10 "写完了", 21:29:31 "重来，我写"). Round 1 ran the whole chain — stack up 20:59:26, build OK 21:01:06 (jar 500,173,081 B / 923 entries), host up 21:01:54 — and the gate went RED at 21:08:04 on `MODULE_NOT_FOUND: …/scripts/run-fms-voucher-scenarios.mjs`. The round checkout had **zero changes**: the five deliverables were never written, so the gate never executed an assertion. Round 1 was voided and restarted at 21:29:59; the session ended its turn at 21:30:07 and nothing more happened before 22:30. P17 also failed: the three v0.1.21 release windows ran concurrently in this window, and one committed three poms in the **main** checkout at 21:30:55–21:31:02 (`5a204b2348`) — it never touched the round checkouts. The formal outcome sheet (`handoff/w14-third-outcome-1127.md`) reaches the same verdict independently: **no reading**. It also names what D4's own options do not have — see the note under the table.

**Options.**

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Keep the status quo** | No pre-set rule; wait for tonight's result and decide on the facts at 11-28. | Expectation: the result is known by 11-28 and can be judged then. Falsified if the result is not known by 11-28 (the session does not run or does not report), leaving no basis for an ad hoc decision. |
| **B. Pre-set: a missed or failed window is a "third failure"** | If the author does not answer "present" by 22:30 or the window is missed, open a decision (reschedule / change owner / pause). | Falsified if the trigger occurs and no decision item is created. Also falsified as a fair rule if it labels author absence as a measurement failure — the first two failures were author absence, not technical. |
| **C. Pre-set, with classification** | Distinguish "window missed" (author absence, non-technical) from "measurement failed" (technical or gate red); only the latter counts as a "third failure". | Observable: the record labels the outcome as "window missed" or "measurement failed" at 22:30. Falsified if the record carries no label, or if the evidence cannot distinguish the two causes. |

**The 11-26 outcome fits neither B nor C.** It is not "window missed" — the author replied three times inside the window. It is not "measurement failed" in D4's sense — stack, build and host all met their acceptance points, and the gate could not execute. It is a third shape: the window was used, the chain ran, the deliverables never landed. If the meeting adopts a standing rule, it has to add this shape, not only split absence from failure. The outcome sheet's one-sentence decision item is: whether to add the third class and, in the same ruling, fix the fourth window's date, owner, and a start-of-window check that the deliverables have landed.

**Suggested default (suggestion, not a ruling).** A — keep the status quo. By 11-28 the result is known; a pre-set rule may conflate the two failure types. If the meeting wants a standing rule, C is the more precise form. *(11-27: the status quo now means "the third attempt happened and is undefined". A leaves the fourth window's date, owner and landing check undefined with it.)*

**Ruling received (11-27).** The user ruled **A**: the status quo stands and no pre-set "third failure" rule is adopted. The 11-26 outcome stays recorded as a third shape — present, chain green, deliverables never landed — not as B or as C. The fourth window's date, owner and start-of-window landing check are **not** fixed by this ruling; they remain open items for whoever schedules it.

**Ruling line.** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** *(11-27: the third attempt has now happened and produced no reading.)* Not ruling leaves "third attempt" undefined, the fourth window unscheduled, and W1.4 unproven — and the new failure shape unrecorded as a category, so the next window repeats the same exposure.

---

### D5 · 4J cross-day bump: deviation record or violation

**Packet question (translated).** Should the 4J cross-day bump be handled as a "deviation record" or as a "violation"?

**Evidence level.** E3 — CI readings plus a local build. The local full `release-gate.sh` was not run (it writes `src/migrations/`; the same SHA ran in CI).

**Verified 11-27 (both items left open on 11-26).** The CT-4 wording is now ruled: `3b08706b` (11-26 23:38:34) records the **v1.23.0 deviation once as a violation** — nothing rewritten, nothing replayed, the ordering constraint (contract push → consumer bump → consumer push, same day) unchanged. **The ruling names the 11-24 host-line instance; it does not name the 11-25 4J cross-day bump.** The README 4J rows were fixed in `b385fa07` (11-27 00:00:17) and pushed (`KeelBase` is 0 ahead of `origin/main`); they now read released `v0.1.20` / `main` `v1.23.0` — one version behind the newly published `v0.1.21`.

**Update (11-27).** Three facts change the shape of this page.

- **The anchor question is resolved.** The two SHAs in the cross-day note are different commits: `8f9baa75` is the replay-rebuilt pin commit (real time 2026-11-24 19:01:58, gitlink `015f474`) and is the bump that shipped; `2ea7f597` is "follow the release-evidence vector" (11-23 23:53:06 as amended; true 13:33:06) and is the test subject used to demonstrate the reader fix. The note's alternative — "if the latter were the published one, 11-24 would violate both order and day" — does not hold. The reader was fixed (`458447c`, merge `90e670e`) and the v1.23.0 re-read is `exact` on all three times: VIOLATION, tag pushed 19:03:24 after the pin bump 19:01:58.
- **One wording inconsistency remains in the private repository.** `3abf0d45` (roadmap, 23:35) and `1834446a` (bookkeeping, 23:37) state the v1.23.0 bump time differently — `13:33:06` vs `19:01:58`; the roadmap line conflates the demo commit with the shipped bump. It needs a one-line correction so the meeting quotes the right time.
- **v0.1.21 shipped** (tag `edb27b1` → `e8e9cad`; run `45822868092` success; four Central coordinates 200; host pin `5a204b2348`), so the 4J line now has a second release after the cross-day bump, and the README row lag is visible.

**Options.**

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Record as a deviation** | A dated deviation line in the minutes, naming the cross-day shape and the correct direction. | Observable: the line exists and future cross-day cases cite it. Falsified if the minutes cannot state the distinction from the 11-24 VIOLATION, or if a later audit treats the same shape as a violation without explanation. |
| **B. Record as a violation** | A VIOLATION entry, the same treatment as the 11-24 host CT-4. | Observable: the entry exists. Falsified if the entry cannot specify which rule was violated, given that the direction was correct, CI was green and the snapshot had zero changes. |
| **C. Keep the status quo: no separate record** | Leave the item to the next CT-4 audit. | Observable: the 4J item is absent from the minutes. Falsified if a later audit reconstructs the record and finds no basis; risk of "selective recording". |

**What the 11-26 ruling did and did not settle.** The ruling kept the ordering constraint's same-day clause unchanged and named only the 11-24 host-line instance. Read literally, the same-day clause covers a cross-day bump, so **B is what the existing wording implies for this case**; **A now requires an explicit carve-out** for the cross-day shape, written on the ruling line. The ruling decided neither reading for the 4J instance.

**Suggested default (suggestion, not a ruling).** A — record as a deviation, with the distinction from the 11-24 host VIOLATION written in the same line. The direction was correct, CI was green and the snapshot had zero changes. If the minutes cannot state that distinction, B is the fallback. *(11-27: choosing A now means writing the carve-out sentence; choosing B needs no new wording, only the entry.)*

**Ruling received (11-27).** The user ruled **A**: the 4J cross-day bump is recorded as a **deviation**, with the distinction from the 11-24 VIOLATION in the same line. Because the 2026-11-26 ruling's same-day clause read literally covers a cross-day bump, A needs an explicit carve-out. Proposed wording for the ruling line — replaceable, and not a signature: *"The same-day clause binds the consumer bump that follows a contract push. Where the bump crosses the day boundary and the direction is correct (contract push → bump → consumer push), the day and the order are recorded as separate facts, and the case is logged as a deviation, not a violation."* **This note records the decision; the ruling line stays blank until a person signs it.**

**Related, not on this sheet.** `v1230-release-plan-1126.md` §6 lists three pending decisions (window time; Release page scope; host pin in the same window). They are not part of D1–D5; this page does not rule on them.

**Ruling line.** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** The 4J cross-day bump stays unrecorded; the next CT-4 audit finds it neither deviation nor violation; the v1.23.0 / 4J 0.1.21 release chain proceeds with a blank in the historical account. *(11-27: v0.1.21 has now shipped on top of that blank, and the v1.23.0 wording ruling stands beside it — so the gap is now visible under a released version, not only in a plan.)*

---

### D6 · N5 second acceptance session

**Packet question (translated).** Should a second N5 reader session be held to establish criterion 4 and make criteria 2 and 3 attributable — or should the single 2026-11-25 record stand as it is?

**Evidence level.** E3 ceiling. The second approver is a seed account; a session cannot change that.

**Update (11-27).** The 11-29 close-out analysis separates what a second session reaches from what it cannot. It reaches criterion 4 and the attribution of criteria 2 and 3. It does not reach criterion 5 (the product's fixed sentence for "new" is the same whoever reads it), criterion 1's person level (the seed account stays a seed account), or the ceiling — lifting E3 needs a traceable non-seed approver, which is a product/data change. A second session creates a parallel record; it does not repair the 2026-11-25 one, and the closeout items marked "ruled, not to be filled" stay unfilled.

**Options.**

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Hold a second session** | One named reader, a 60–90-minute slot, the criterion-4 fixtures. Criterion 4 established; criteria 2 and 3 become attributable. | Falsified if the session runs and criterion 4 still has no reading (reader absent, or the reading again falls outside the window). Consequence: the ceiling stays E3; the record is parallel, not a repair. |
| **B. Do not hold one now** | Keep the E3 boundary as written on 11-27 and use it for internal purposes only. | Falsified if a delivery, public or contract use later needs a zero-help or in-window reading and none exists. |
| **C. Decide at the 12-05 review** | Leave the question open until the review, when the need for such a claim is known. | Falsified if the 12-05 review passes without deciding. The cost of A rises meanwhile — one more month of stack and reader decay. |

**Suggested default (suggestion, not a ruling).** B — do not hold one now. Switch to A only when a delivery, public or contract use actually needs a zero-help or in-window reading. Prefer C over B only if the 12-05 review is already expected to decide whether such a claim is needed.

**Ruling received (11-27).** The user ruled **B**: no second N5 session now. The E3 boundary written on 11-27 stands and is used for internal purposes only; the session is reopened only when a delivery, public or contract use actually needs a zero-help or in-window reading. Criterion 4 stays unsupported, criteria 2 and 3 stay unattributed, and the ceiling stays E3. **This note records that the decision was made; it does not sign this sheet** — the ruling line and the sign-off register stay blank until a person signs them here.

**Ruling line.** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** The item stays open; the record layer keeps "recorded as passed" beside the E3 boundary, which supports no external claim; a second session is neither held nor excluded, and the question returns at the next weekly.

---

### D7 · CT-4 push-order basis

**Packet question (translated).** What counts as the "contract push" that must precede a consumer pin bump: the release tag push — the literal reading, which is what the reader implements today — or the commit reaching contract main?

**Evidence level.** E3 — the reader's own verdicts plus the push-side record.

**Update (11-27).** The reader (`KeelBase4J/scripts/check-push-order.mjs`) implements only the literal tag push; the other two readings are not implemented, which is why both findings read red. **11-23:** a pin bump 5 h 42 min before the contract's first push — a violation on any reading, and outside the three allowed moments. **11-24:** a tag bump 86 s before the `v1.23.0` tag push, with the same commit having reached contract main 34 s before that bump. The reader fix (`90e670e`, `458447c`) is on `origin/main` and `gitee/main` — the earlier "not pushed" note is withdrawn.

**Options.** These are basis options; they are not the same as D5's A/B/C (deviation / violation / no record).

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Literal tag push (status quo)** | No rule change, no code change. 11-24 recorded as a violation (86 s), consistent with `3b08706b`; 11-23 recorded as a violation, outside the three allowed moments. | Falsified if a later replay-then-tag release is expected to pass under this rule, or if an audit cannot state why 11-24 is a violation when the commit reached main first. |
| **B. The commit reaching contract main** | 11-24 compliant; 11-23 still a violation. A rule change that must explicitly dispose of `3b08706b`, which ruled the opposite for v1.23.0. | Falsified if a release reaches main but its tag is pushed after the consumer push — this reading cannot see it. Requires `conformance/vectors/README.md:83-84` and `:106-107` reworded and a main-push anchor added to the reader. |
| **C. Both anchors: the earlier of the two satisfies the order, and the tag push must still precede the consumer push** | 11-24 compliant; 11-23 still a violation; applies prospectively only, `3b08706b` kept. | Falsified if a release satisfies the order on main but its tag lands after the consumer push and nobody notices — the "tag push ≤ consumer push" condition is what catches it. Requires the same README rewording plus a `judge()` change. |

**Suggested default (suggestion, not a ruling).** A — the literal reading is what the code implements and what `3b08706b` applied to 11-24 in substance; B and C are rule changes that need their own explicit wording and an explicit disposition of that ruling. If the meeting wants replay-then-tag releases to pass, C is the narrower change.

**Ruling received (11-27).** The user ruled **A**: the contract push is the release tag push, the rule is unchanged. 11-24 recorded as a violation on the order leg (86 s, consistent with `3b08706b`); 11-23 recorded as a violation, outside the three allowed moments; no rule change, no code change; B and C not adopted. Recorded in `handoff/ct4-ruling-options-1127.md` §10. **This note records that the decision was made; it does not sign this sheet** — the ruling line and the sign-off register stay blank until a person signs them here.

**Ruling line.** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** Every audit re-reports both findings; the 11-23 case stays unrecorded; the next replay-then-tag release returns VIOLATION and the same argument comes back.

---

### D8 · G5 artifact-contract gate

**Packet question (translated).** Should the published-artifact contract check be wired into CI now, or should the deferral be recorded formally?

**Evidence level.** Executed readings against live Maven Central on 2026-11-27; no CI job exists to reproduce them.

**Update (11-27).** The tool works on real bytes. Against 0.1.21 it returned match (exit 0, self-declared `v1.23.0`) for `keelbase4j-protocol`, `keelbase4j-core` and `keelbase4j-springai`; a wrong expected value returned mismatch (exit 1); 0.1.19 returned undeclared (exit 2). It is still referenced by no workflow, runbook or `package.json`. Five defects recorded in the last review remain in the script: the manifest section does not stop at its blank line, zip inflation is unbounded, a thrown error is indistinguishable from a real mismatch, the `pom.xml.sha1` guard is dead, and `readError` surfaces only under `--json`.

**Options.**

| Option | What it does | Falsifiable consequence |
|---|---|---|
| **A. Wire it now (blocking)** | A CI job after publish that downloads the Central bytes and compares the self-declared contract version; ≈1–1.5 AI-days plus the CI change approval. | Falsified if a release ships bytes whose declared contract version is wrong and this job is the only thing that would have caught it — a post-publish red cannot prevent a release, only make it visible. |
| **B. Record the deferral formally** | A dated decision-index entry naming G5, "not complete on 11-29", re-open at 12-05, plus one command in runbook step 7. | Falsified if "the published bytes carry the version they claim" is later asserted without anyone having run the tool and without the deferral record naming who re-opens it. |
| **C. Two steps: advisory now, blocking later** | A non-blocking job now — no CI contract change beyond adding a job; the blocking decision at 12-05 with at least two releases of readings. | Falsified if the advisory job produces readings that nobody reads at 12-05, or if it is promoted to blocking before the manifest-section, error-reporting and inflate-bound defects are fixed. |

**Suggested default (suggestion, not a ruling).** C, falling back to B with the runbook line if the CI change approval is refused. Fix the manifest-section, error-reporting and inflate-bound defects before any promotion to blocking. Under every option G5 is not counted complete on 11-29.

**Ruling received (11-27).** The user ruled **C**: two steps — an advisory, non-blocking job first; the blocking decision at 12-05 on at least two releases of readings; the manifest-section, error-reporting and inflate-bound defects fixed before any promotion to blocking. The ruling fixes the direction only: **this sheet wires nothing**, the job is separate work, and G5 is not counted complete on 11-29. If the CI change approval is refused, B with the runbook line is the fallback. **This note records that the decision was made; it does not sign this sheet.**

**Ruling line.** Ruling: ☐ A ☐ B ☐ C | Signed / date: ____________________

**If not ruled.** G5 stays unwired and unrecorded on the sheet that is being signed; the "unreachable tool" finding stays open; and "the published artifact carries the contract version it claims" still depends on someone remembering to run the script.

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
| D1 | Two criterion-5 cells as business answers? | D1 | *(11-27 ruling: A — status quo kept, the scorer has not signed.)* "Passed" and "criterion 5 undetermined" coexist; no external claim. |
| D2 | Real-compile VM window before 12-05? | D2 | *(11-27 ruling: A — documentation-only file to 12-05.)* The 12-05 review has no fresh compile reading; the basis stays E2. |
| D3 | 12-05 criterion: `compile` success or real compile? | D3 | *(11-27 ruling: A — the minutes' wording is kept.)* If the runner stays offline, 12-05 finds the criterion unobservable and not met. |
| D4 | If tonight fails, a "third failure" decision? | D4 | *(11-27 ruling: A — status quo; the third attempt happened, produced no reading, and stays uncategorised.)* No disposal rule; the fourth window is unscheduled. |
| D5 | 4J cross-day bump: deviation or violation? | D5 | *(11-27 ruling: A — deviation, with the carve-out wording drafted.)* The 4J case is recorded as a deviation, distinct from the 11-24 VIOLATION. |
| D6 | Hold a second N5 acceptance session? | D6 | *(11-27, from the 11-29 close-out list; the user ruled B on 11-27.)* No second session; "recorded as passed" keeps standing beside the E3 boundary and supports no external claim. |
| D7 | CT-4: tag push or commit reaching main? | D7 | *(11-27, from the 11-29 close-out list; the user ruled A on 11-27 — see `ct4-ruling-options-1127.md` §10.)* Every audit still reports VIOLATION — under this ruling that is the intended reading, not a defect to fix. |
| D8 | G5: wire the check or record the deferral? | D8 | *(11-27, from the 11-29 close-out list; the user ruled C on 11-27.)* G5 stays unwired until the advisory job is built; the blocking decision falls due at 12-05. |

### Sign-off register

| ID | Ruling (A / B / C) | Signed by | Date |
|---|---|---|---|
| D1 | | | |
| D2 | | | |
| D3 | | | |
| D4 | | | |
| D5 | | | |
| D6 | | | |
| D7 | | | |
| D8 | | | |

### What this sheet does not do

- It does not change the packet, the weekly plan, the roadmap, the decision index or the claim table.
- It does not contact anyone, commit, push, start a stack or trigger CI.
- It does not rule for the scorer or for the CTO; the ruling lines stay blank until a person signs.
- The 11-27 update blocks record readings and their sources only; they change no ruling and leave every ruling line blank.
- It does not rule on D6–D8 either; they were added on 11-27 from the 11-29 close-out material so that one sheet carries them, and their ruling lines are blank like the rest.
- It does not assert an acceptance conclusion. The forbidden phrases remain forbidden: E4, acceptance passed without qualification, evidence complete, independent reproduction, independent human approval.

### Sources

- `handoff/cto-1128-packet.md` — D1–D5, evidence levels, unverified items, the five questions.
- `handoff/n5-verdict-1126.md` — criteria 1–5, §7 cell table, §11 path A, the four boundary sentences.
- `handoff/n5-closeout-1126.md` — evidence inventory, hashes, missing-item list.
- `handoff/v1230-release-plan-1126.md` — D5-related release chain, §6 pending decisions.
- `handoff/w14-ready-1126.md` — D4 readiness readings, blockers, runbook.
- `handoff/cto-1128-update-1127.md` — the 11-27 addendum these update blocks summarise.
- `handoff/release-v0.1.21-published.md`, `handoff/release-precheck-0.1.21-1126.md` — v0.1.21 release and four-layer review readings.
- `handoff/w14-third-outcome-1127.md` — W1.4 outcome, the third-shape classification, the one-sentence decision item.
- Added 11-27 for D6–D8: `handoff/n5-second-session-options-1127.md`; `handoff/ct4-ruling-options-1127.md`; `handoff/g5-wire-or-defer-1127.md`. These are the analyses the three pages summarise; D7's readings come from `KeelBase4J/scripts/check-push-order.mjs` and D8's from live Maven Central on 2026-11-27.

---

## 中文

> **用途。** 把 `handoff/cto-1128-packet.md` 中仍开着的五个决定，收敛为「一页一决定」的可签字页；并附 N5 判据 5 的 12 格判分表。**11-27 增补：**另并入 2026-11-29 收口材料的三页（D6–D8）—— N5 第二场、CT-4 基准、G5 —— 让一次周会能签的东西都在这一件里。本件只做格式与并列，不做裁定。
>
> **成稿。** 2026-11-26（+08），供 2026-11-28 04:03 CTO 周会。
>
> **2026-11-27 更新。** 并入 11-26 晚间结果：v0.1.21 发布、四层评审、W1.4 第三次窗口、App-X 守卫合并、CT-4 裁定。11-27 新增或更正的块标「更新（11-27）」「11-27 已核」「11-27 更正」，或用斜体 *（11-27：…）* 注记。11-26 的文字在仍是「当时所知」的记录处保留；只有已与事实不符的句子就地更正并标注。完整出处：`handoff/cto-1128-update-1127.md`。
>
> **边界。** 只读。不改 packet、周计划、roadmap、决定索引、认领表；不 contact 任何人；不 commit、不 push；不替任何人下裁定。所有「建议默认值」都标「建议，非裁定」；只有人签在「裁定」行上，才算裁定。
>
> **引文。** 中文原文在本块；英文块为译文，逐条给位置。
>
> **编号。** D1–D5 是 2026-11-28 packet 的。**D6–D8 于 11-27 从 2026-11-29 收口材料并入**，在那份清单里这三个决定用的是另外的编号：D6 = 那份的 D2（N5 第二场）、D7 = 它的 D3（CT-4 基准）、D8 = 它的 D4（G5）。两套编号不可互换；引用 D 编号时须带来源。
>
> **单源。** `handoff/cto-1128-packet.md`（11-26 12:52）；`handoff/n5-verdict-1126.md`（11-26 12:49）；`handoff/n5-closeout-1126.md`（11-26）；`handoff/v1230-release-plan-1126.md`（11-26，未执行）；`handoff/w14-ready-1126.md`（11-26 12:33–12:45）。11-27 新增：`handoff/cto-1128-update-1127.md`；`handoff/release-v0.1.21-published.md`；`handoff/release-precheck-0.1.21-1126.md`；`handoff/w14-third-outcome-1127.md`。

### 怎么用

- 每个决定页含：packet 问题原文、证据等级、2–3 个方案（含「维持现状」）、每个方案的可证伪后果、建议默认值（标「建议，非裁定」）、一行空白裁定、末尾一句「若不裁的后果」，与 packet 的问题一一对应。
- 「建议默认值」不是裁定。只有「裁定」行上有人签字，才生效。
- 第二部分的判分表并列两种裁定及各自后果；由判分人勾选，本件不勾。

### 索引

| 编号 | 决定 | 证据等级 | 建议默认值（建议，非裁定） | 11-27 状态 |
|---|---|---|---|---|
| D1 | N5 判据 5：「改成什么」两格的书面裁定 | 上限 E3；判据 4 无证 | 维持现状，直到判分人签字 | **11-27 已裁 A —— 维持现状，判分人签字仍待办** |
| D2 | App-X：12-05 前是否为真实编译单开 VM 窗口 | E2 mock；真实编译 E0 | 维持文档档至 12-05 | **11-27 已裁 A** —— 文档档至 12-05；真实编译未跑；runner 现状未核 |
| D3 | N9：12-05 判据取一次 `compile` success 还是真实编译 | E1 | 照纪要原文（`compile` success） | **11-27 已裁 A** —— 照纪要原文；runner 离线期间不可观察 |
| D4 | W1.4：今晚再失败是否另立「第三次失败」决定 | 尚无 time-to-green 读数 | 维持现状；11-28 看结果再议 | **11-27 已裁 A** —— 维持现状；第三种形态未归类；第四次窗口未排 |
| D5 | 4J 跨日 bump：偏差登记还是违规 | E3 | 按偏差登记，并写明区别 | **11-27 已裁 A** —— 按偏差登记，豁免措辞已拟；签字待办 |
| D6 | N5：是否另办第二场验收 | 上限 E3；第二批准人是种子账号 | 现在不办（B） | **11-27 已裁 B，签字待办** —— 11-27 从 11-29 收口清单并入 |
| D7 | CT-4：顺序对着哪一次「契约推送」量 | E3 —— 读数器判定加推送侧记录 | 维持字面 tag 推送（A） | **11-27 已裁 A，签字待办** —— 11-27 并入；裁定记在 `handoff/ct4-ruling-options-1127.md` §10，本单未签 |
| D8 | G5：现在接线还是正式记录后置 | 对 Central 的实跑读数（11-27） | 拆两步：先告警作业，阻塞档 12-05 再定（C） | **11-27 已裁 C，签字待办** —— 11-27 并入；本单不接任何线，11-29 不计完成 |

**11-27 状态，一句一条。** D1 收窄（路径 A 已写，只差签字）。D2 关一半（守卫已并入并推送 `d939527`；真实编译未跑；runner 未核）。D3 仍开且更严（守卫现在要求真实成功标记）。D4 仍开且多出一种形态（人在、链路绿、交付物没落地）。D5 口径已裁、4J 本案未裁。**八项现已全部裁定（11-27）：D1–D5 选 A、D6 选 B、D7 选 A、D8 选 C** —— 分别记在各页，D7 另记于 `handoff/ct4-ruling-options-1127.md` §10。裁定行与签字登记仍留空：这些段落只记决定已作出，不等于本单已签。实质：判据 5 仍归判分人签、尚未签；App-X 维持文档档至 12-05；N9 判据照纪要原文；W1.4 维持现状；4J 跨日 bump 在明写的豁免之下按偏差登记；不办第二场 N5；CT-4 基准为 tag 推送、规则不动；G5 先走告警档，本单不接任何线。

**自本件写成后发生了什么（11-27）。**

- **v0.1.21 已发布。** annotated tag `edb27b1` → `e8e9cad`（= `origin/main` = `gitee/main`）；发布 run `45822868092` success（3m42s）；13:30Z 四个 Maven Central 坐标 200，`core` 的 sha256 一致；宿主 pin 抬到 0.1.21，3 文件 5 处（`5a204b2348`，两远端已推）；`release-plan.json` `done=true`。**未建 Release 页**，依据 11-26 裁定与契约仓 `eb99d11`。
- **四层评审 WITH FIXES。** 5 条阻塞在 4 笔提交内修完（`eac046b`、`370f2b2`、`4b5d12e`、`4a0ae35`），7 条建议落地，共 11 笔；`release-gate.sh` 在 `cab30f9` 上 16 pass / 0 fail；定向测试 52 项全过。
- **W1.4 第三次窗口跑了、无读数** —— 见 D4 更新。
- **App-X 守卫已并入并推送**（`d939527`）；真实编译仍未跑 —— 见 D2 更新。
- **CT-4 口径已裁「记一次违规」**；4J 跨日这一案本身仍开 —— 见 D5 更新。
- **11-27 已收裁定。** 每页都有一段「已收裁定（11-27）」：D1–D5 选 A、D6 选 B、D7 选 A、D8 选 C。没有任何裁定行或签字行被签 —— 这些段落记的是决定，不是签字。

---

## 第一部分 —— 决定页

### D1 · N5 判据 5：书面裁定

**问题原文（packet §二 D1）。** 「判据 5 的两格是否由判分人书面裁定为「业务答案」——不裁则「记录为通过」与「判据 5 未定」长期并存？」

**证据等级。** 上限 E3，无 E4。判据 1/2/3 有可核读数，但各带限定（1 人级不成立；2 文件规格成立、归属无证；3 读数不在场次窗口内）；判据 4 不成立（无证）；判据 5 待裁。五条不全。

**已定，不重开。** 11-26 已选路径 A：接受 11-25 裁定并写明证据边界；不补跑（B）、不降级（C）。§11.3 的对内记录文字由周计划属主决定是否并入 N5 行，本件不代写。closeout §5 的 9 项缺件标「已裁不补」，只留档。

**更新（11-27）。** 路径 A 已经落纸：`677acec5`（11-26 23:37:49）把它与证据边界写进周计划的 N5 行；`30c1af96` 同步进认领表。该行现在自己写明：档位 E3、判据 4 无证、判据 5 两格需裁定（倾向不成立）、不得对外称验收通过或 E4。**判据 5 仍无人签字。** 另外，11-27 夜跑（`91252123`，02:18）在 4J `main` `62939b9` 上只读复核了 N5 —— 三套件 7/7、3/3、1/1、双语门禁 exit 0 —— 那是复核代码与证据，不是本判据。**所以 D1 现在只剩一行决定：签 A、B 或 C。**

**方案与可证伪后果。**

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 维持现状** | 不作书面裁定；记录层继续「记为通过」，证据层并列「判据 5 未定」。 | 若任何「N5 通过」的引用未同时带判定包 §11.2 的四句边界，即证伪。可在周计划与归档中观察。 |
| **B. 裁定两格为「业务答案」** | 判分人签字：原句照录满足该格专属规则（答案键 §2/§3）；判据 5 成立。 | 若产品对「新建」的固定句改变，或未经判分人签字就被当作成立，即证伪。裁定后的后果：判据 5 通过；判据 4 仍无证；五条仍不全；上限仍 E3；不得称验收通过。 |
| **C. 裁定两格为「未记录」** | 判分人签字：读者自标「空」触发通则（答案键 §7）；判据 5 不成立。 | 若判分人认定 §2 是该格专属规则、且原句照录已满足，即证伪。裁定后的后果：判据 5 未定；五条仍不全；「记为通过」与「判据 5 未定」并存；顶线不变，因判据 4 已无证。 |

**建议默认值（建议，非裁定）。** A —— 维持现状，直到判分人签字。这一裁定只能由判分人做，会上不应代判。

**已收裁定（11-27）。** 主持人维持**现状（A）**，不代判分人裁：两格没有书面裁定，判据 5 仍未签。记录层继续「记为通过」，与证据层的「判据 5 未定」并列。**A 不是判分人的裁定** —— 下面的裁定行仍归判分人签，本段不代签。

**裁定行（由判分人签，不由主持人代签）。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** packet 的问题原样留着：「记录为通过」与「判据 5 未定」长期并存；「N5 通过」停在裁定层，不能支撑任何对外或交付声明。

---

### D2 · App-X 维护档到 12-05

**问题原文（packet §二 D2）。** 「12-05 复核前，是否为「真实编译跑一次」单独开一次 VM 窗口，还是维持文档档不追？」

**证据等级。** E2 —— mock 三例，两个 PowerShell 版本；真实编译 E0（未跑）。

**未核项。** 真实 HBuilderX 编译未跑。**11-27 更正：**守卫分支已不再「未推未合」，故 11-26 那句「守卫分支未推未合（main 仍 `cc8b1a3`）」撤回。仍开：真实编译（E0）；VM（最后已知卡在「欢迎」、始终未强断）；以及 runner / VM 现状 —— **未核**，本机连不上 GitHub API（TLS 握手 / EOF）。

**更新（11-27）。** 守卫已进主线：`5983f3b`（07:55）、合并 `bda11b1`（13:16）、再到 `d939527`（13:21，`ci(compile): run the guard's self-test on every push`）。`main` 与 `origin/main` 均为 `d939527`，领先 0。脚本现在要求退出码 0 **且** 出现成功标记，自测随每次推送运行 —— 也就意味着 CI 每次只走 mock 路径，仍不产生真实编译的证据。**所以 D2 剩下的问题只有 VM 窗口，不再是守卫。**

**方案与可证伪后果。**

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 维持文档档至 12-05** | 不开 VM 窗口。 | 12-05 时无真实编译读数；续期依据只剩 E2 mock；「真实编译未跑」一项仍在。可观察：12-05 前没有编译日志或产物。 |
| **B. 12-05 前开一次 VM 窗口，跑一次真实编译** | 一次带日期的编译尝试，结果入档。 | 可观察：VM 上的编译日志或产物。若失败，则「mock 绿 ⇒ 真实绿」的前提被证伪，维护档须记红；若通过，「真实编译未跑」可在该提交上关闭（不是普遍证明）。 |
| **C. 把选择推到 12-05 复核** | 现在不裁，复核时按 VM / runner 状态定。 | 若 12-05 复核未就该事项作出决定，即证伪。期间没有新读数。 |

**建议默认值（建议，非裁定）。** A —— 维持文档档至 12-05。VM 当前卡死，强断是另一项风险；mock 已覆盖守卫逻辑；真实编译属链路验证。B 是 12-05 前关掉 E0 一项的唯一办法。*（11-27：VM 的卡死状态现在未核；若 VM 是健康的，B 的代价低于这一行当初的估计。）*

**已收裁定（11-27）。** 用户裁定**选 A**：文档档维持到 12-05，不开 VM 窗口。真实编译仍停在 E0，维护档依据仍是 E2 mock，「真实编译未跑」一项照旧存在。若 12-05 前发现 VM 其实是健康的，开窗口是另一次决定，不是这一次。

**裁定行。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** 12-05 复核将再次面对同一问题，且没有新的编译读数；维护档依据仍停在 E2；VM 卡死状态仍未处理。

---

### D3 · N9 的 12-05 复核判据

**问题原文（packet §二 D3）。** 「12-05 复核的判据取纪要 §十二 P0-E 的「一次 `compile` success」，还是一次真实编译？」

**证据等级。** E1 —— 11-23 读数 + 11-26 复核（仍 offline）。

**未核项。** runner 恢复路径未演练（需先开 VM，再 `gh variable set … --body true`）。*（11-27：runner 当前状态也未核 —— 本机连不上 GitHub API。）*

**更新（11-27）。** 判据仍无人裁。但守卫合并改变了选项的含义：自 `d939527` 起，`android-compile` 作业只有 CLI 打出真实成功标记才可能 success，因此**选项 A（「一次 `compile` success」）与选项 B（「一次真实编译」）现在描述几乎同一件事** —— 差别只在证据放在哪（CI 作业 vs VM 日志），不在它证明什么。11-26 的提醒仍然成立，而且现在就是全部问题：runner 离线时作业无法派发，故在 VM 与 runner 恢复之前，A 与 B 都不可观察。

**方案与可证伪后果。**

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 判据 = 一次 `compile` success（照纪要原文）** | 不改判据。 | 只有 `android-compile` 作业真正派发并 success 时才可观察。当前 runner 离线、仓库变量为 0，编译作业无法派发，故 runner 上线前该判据不可观察；若 12-05 时仍无作业派发，判据未达成且不可观察。 |
| **B. 判据 = 一次真实编译** | 把门槛抬到真实编译。 | 可观察为真实编译日志或产物，而不只是 CI 作业 success；需要可用的 Windows runner 与更多准备。runner 离线则未达成。 |
| **C. 维持现状：现在不改判据** | 12-05 按 runner 状态再定。 | 若 12-05 过去仍未定判据，即证伪。风险：复核时重新争一遍。 |

**建议默认值（建议，非裁定）。** A —— 照纪要原文。改复核判据属范围变更，应当明说。但须注意：runner 上线前，该判据不可观察。

**已收裁定（11-27）。** 用户裁定**选 A**：12-05 复核判据照纪要原文 —— 一次 `compile` success。随之而来的后果须与裁定一起带走：runner 离线、`APPX_WINDOWS_RUNNER` 未设，`android-compile` 作业无法派发，该判据不可观察，12-05 会判为未达成。日后要改属范围变更，须明说。

**裁定行。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** 12-05 复核没有商定的判据；维护档续期或退出无法判定；N9 仍停在「runner 离线、闸已配置关闭」。

---

### D4 · W1.4 第三次窗口

**问题原文（packet §二 D4）。** 「若今晚仍未跑成，W1.4 是否按「第三次仍失败」另立决定？」

**证据等级。** 无 time-to-green 读数 —— 窗口之后仍然没有。**11-27 更正：** 窗口确实跑过了；读数是负面的，不是「尚无」。

**11-27 已核（11-26 列的四个未核项）。** 两轮没有跑完 —— 只有第 1 轮，试了两次。没有 time-to-green、没有 T1。20:56:52 的 T0 已作废；21:29:59 的第二个 T0 没有 T1。「关闭显示器=从不」并未生效：机器在 20:42:01 与 21:32:40 两次进入 S0 连接待机，后者距会话结束回合等作者仅 2 分 33 秒。

**更新（11-27）。** 作者在场，窗口内回了三次话（20:56:34「在场，开始」、20:59:10「写完了」、21:29:31「重来，我写」）。第 1 轮跑完了整条链 —— 20:59:26 起栈、21:01:06 构建通过（jar 500,173,081 字节 / 923 条目）、21:01:54 宿主起来 —— 门禁在 21:08:04 因 `MODULE_NOT_FOUND: …/scripts/run-fms-voucher-scenarios.mjs` 报红。轮检出**零改动**：五处交付物从未写入，门禁连一条断言都没执行。第 1 轮作废，21:29:59 重记 T0；会话 21:30:07 结束回合，到 22:30 再无任何事发生。P17 也不成立：v0.1.21 的三个发布窗口在本窗口内同时在跑，其中一个在 21:30:55–21:31:02 改了**主检出**的三份 pom 并提交（`5a204b2348`）—— 它从未碰轮检出。正式结论件（`handoff/w14-third-outcome-1127.md`）独立得出同一判断：**无读数**。它还点出 D4 自己的选项里没有的东西 —— 见下表之后的说明。

**方案与可证伪后果。**

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 维持现状** | 不预设规则；等今晚结果，11-28 按事实再议。 | 预期：11-28 时结果已知，可当场判。若 11-28 时结果仍未知（会话未跑或未汇报），即证伪，且没有临时裁定的依据。 |
| **B. 预设：窗口错过或测量失败都算「第三次失败」** | 若 22:30 前作者未回「在场」或窗口错过，即立决定（改排期 / 换责任人 / 暂停）。 | 若触发条件成立而未生成决定项，即证伪。若把「作者缺席」与「测量失败」混为一谈，作为规则也不成立 —— 前两次失败都是作者缺席，不是技术原因。 |
| **C. 预设，但分类** | 区分「窗口错过」（作者缺席、非技术）与「测量失败」（技术或门红）；只有后者算「第三次失败」。 | 可观察：22:30 的记录把结果标为「窗口错过」或「测量失败」。若记录没有标签，或证据分不清两种原因，即证伪。 |

**11-26 的结果 B、C 都不贴合。** 不是「窗口错过」—— 作者在窗口内回了三次话。也不是 D4 意义上的「测量失败」—— 起栈、构建、宿主都达到了验收点，门禁根本没机会执行。是第三种形态：窗口被用掉、链路跑通、交付物没落地。若会上要立常设规则，必须补上这一形态，不能只把「缺席」与「失败」分开。结论件给出的一句话决定项是：是否新增第三类，并在同一次裁定里定出第四次窗口的时点、责任人与「交付物是否落地」的开跑前置校验。

**建议默认值（建议，非裁定）。** A —— 维持现状。到 11-28 时结果已知；预设规则可能把两种失败混为一谈。若会上要一条常设规则，C 是更精确的形态。*（11-27：现状现在是「第三次尝试发生了，且没有定义」。选 A 就是把第四次窗口的时点、责任人与落点校验一并留空。）*

**已收裁定（11-27）。** 用户裁定**选 A**：维持现状，不立预设的「第三次失败」规则。11-26 的结果仍按第三种形态记录 —— 人在、链路绿、交付物没落地 —— 既不记为 B 也不记为 C。第四次窗口的时点、责任人与开跑前的交付物落地校验**不由本裁定确定**，仍留给排期的人。

**裁定行。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** *（11-27：第三次尝试已经发生，且没有读数。）* 不裁则「第三次尝试」仍无定义、第四次窗口排不出、W1.4 仍未证 —— 而且新的失败形态不会被记成一个类别，下一窗口会原样重演同一暴露。

---

### D5 · 4J 跨日 bump：偏差登记还是违规

**问题原文（packet §二 D5）。** 「4J 跨日 bump 按「偏差登记」还是按「违规」处理？」

**证据等级。** E3 —— CI 读数 + 本地构建；本机全量 `release-gate.sh` 未跑（会写 `src/migrations/`；同一 SHA 的 CI 已跑）。

**11-27 已核（11-26 列的两个未核项）。** CT-4 的口径已裁：`3b08706b`（11-26 23:38:34）把 **v1.23.0 的偏离记一次违规** —— 不改写、不重放，顺序约束（契约推 → 消费方 bump → 消费方推，同日）不变。**该裁定点名的是 11-24 宿主线那一案，没有点名 11-25 的 4J 跨日 bump。** README 的 4J 行已在 `b385fa07`（11-27 00:00:17）修好并推送（`KeelBase` 领先 `origin/main` 0 笔）；现在写的是已发布 `v0.1.20` / `main` `v1.23.0` —— 比刚发布的 `v0.1.21` 落后一个版本。

**更新（11-27）。** 三件事改变了本页的形态。

- **锚点问题已解。** 跨日件里的两个 SHA 是不同提交：`8f9baa75` 是重放重建出来的 pin 提交（真实时刻 2026-11-24 19:01:58，gitlink `015f474`），也是实际发布用的 bump；`2ea7f597` 是「跟随释放证据向量」（amend 后 11-23 23:53:06；真实 13:33:06），是演示读数器修复的对照对象。该件的替代前提 ——「若后者才是发布用的那笔，11-24 就同时违反顺序与同日」—— 不成立。读数器已修（`458447c`，合并 `90e670e`），v1.23.0 复读三段均为 `exact`：VIOLATION，tag 推送 19:03:24 晚于 pin bump 19:01:58。
- **私库留一处表述不一致。** `3abf0d45`（roadmap，23:35）与 `1834446a`（bookkeeping，23:37）对 v1.23.0 的 bump 时刻写法不同 —— `13:33:06` 与 `19:01:58`；roadmap 那句把对照对象与发布用的 bump 混了。需要一句订正，免得会上引用错时刻。
- **v0.1.21 已发布**（tag `edb27b1` → `e8e9cad`；run `45822868092` success；Central 四坐标 200；宿主 pin `5a204b2348`），所以 4J 这条线在跨日 bump 之后又多了一个版本，README 的滞后也看得见了。

**方案与可证伪后果。**

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 按「偏差登记」** | 在纪要里落一行带日期的偏差记录，写明「跨日型」与「方向对」。 | 可观察：该行存在，日后同类跨日案例引用它。若纪要写不清与 11-24 VIOLATION 的区别，或日后审计把同一形态按违规处理而不解释，即证伪。 |
| **B. 按「违规」** | 记一条 VIOLATION，与 11-24 宿主 CT-4 同处理。 | 可观察：该条存在。若该条指不出被违反的是哪条规则（方向对、CI 绿、快照 0 变化），即证伪。 |
| **C. 维持现状：不单独登记** | 留给下一次 CT-4 审计。 | 可观察：纪要中没有 4J 这一条。若日后审计重建记录时找不到依据，即证伪；风险是「选择性记录」。 |

**11-26 的裁定裁了什么、没裁什么。** 裁定保留了顺序约束的同日条款、只点名 11-24 宿主线那一案。按字面，同日条款覆盖跨日 bump，所以**对本案而言，B 是现有措辞推出的读法**；**选 A 现在需要一条明写的豁免**，写在裁定行上。裁定对 4J 这一案两种读法都没有定。

**建议默认值（建议，非裁定）。** A —— 按偏差登记，并在同一行写明与 11-24 宿主 VIOLATION 的区别。方向对、CI 绿、快照 0 变化。若纪要写不清这一区别，退回 B。*（11-27：选 A 现在意味着要写出那句豁免；选 B 不需要新措辞，只记一条。）*

**已收裁定（11-27）。** 用户裁定**选 A**：4J 跨日 bump 按**偏差**登记，并在同一行写明与 11-24 VIOLATION 的区别。由于 11-26 裁定的同日条款按字面覆盖跨日 bump，选 A 需要一条明写的豁免。裁定行上拟用的措辞如下（可替换，不是签字）：*「同日条款约束的是契约推送之后的那次消费方 bump。当 bump 跨过日界而方向正确（契约推 → bump → 消费方推）时，日期与顺序分别如实记录，该案按偏差登记，不按违规。」* **本段只记决定已作出；裁定行在有人签字之前保持空白。**

**关联但不属于本页。** `v1230-release-plan-1126.md` §6 另有三项待决（窗口时间；Release 页范围；宿主 pin 是否同窗），不在 D1–D5 之内，本页不代裁。

**裁定行。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** 4J 跨日 bump 在纪要中没有记录；下一次 CT-4 审计时，这一条既不是偏差也不是违规；v1.23.0 / 4J 0.1.21 发布链继续推进，历史账目留空。*（11-27：v0.1.21 已经在这个空白之上发布，v1.23.0 的措辞裁定就立在旁边 —— 缺口现在落在一个已发布版本之下，不再只是在计划里。）*

---

### D6 · N5 第二场验收

**问题原文（11-29 收口清单 D2）。** 「是否另办一场 N5 读者验收，以立判据 4、并使判据 2、3 可归属 —— 还是让 2026-11-25 那一份记录原样立着？」

**证据等级。** 上限 E3。第二批准人是种子账号；场次改不了这一点。

**更新（11-27）。** 11-29 收口分析把「第二场够得着」与「够不着」分开了。够得着：判据 4，以及判据 2、3 的归属。够不着：判据 5（产品对「新建」的固定句，谁读都是同一句）、判据 1 的人级（种子账号仍是种子账号）、以及证据上限 —— 松动 E3 需要一位可追溯的非种子批准人，那是产品/数据变更。第二场只是另起一份记录，修不好 2026-11-25 那一份；closeout §5 那批标「已裁不补」的条目仍然不补。

**方案与可证伪后果。**

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 办第二场** | 一名具名读者、一个 60–90 分钟时段、判据 4 的全套件。判据 4 成立；判据 2、3 转为可归属。 | 若场次跑了而判据 4 仍无读数（读者缺席，或读数又落在窗口外），即证伪。后果：上限仍 E3；记录是并列的另一份，不是修复。 |
| **B. 现在不办** | 保留 11-27 写明的 E3 边界，只用于对内。 | 若日后交付、公开或合同用途需要「零求助」或「窗口内读数」而不存在，即证伪。 |
| **C. 推到 12-05 复核再定** | 留到复核时，那时才知是否需要这类声明。 | 若 12-05 复核过去仍未作决定，即证伪。期间 A 的代价上升 —— 栈与读者又多一个月衰减。 |

**建议默认值（建议，非裁定）。** B —— 现在不办。只有当交付、公开或合同用途确实需要「零求助」或「窗口内读数」时才转 A。只有当 12-05 复核本就要决定是否需要这类声明时，C 才优于 B。

**已收裁定（11-27）。** 用户裁定**选 B**：现在不办第二场。11-27 写明的 E3 边界保留、只用于对内；只有当交付、公开或合同用途确实需要「零求助」或「窗口内读数」时才重开。判据 4 仍无证，判据 2、3 仍不可归属，上限仍 E3。**本段只记「决定已作出」，不等于在本单上签字** —— 裁定行与签字登记在有人于本单签字之前保持空白。

**裁定行。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** 该项继续挂着；记录层仍是「记为通过」，旁边立着 E3 边界，撑不起任何对外声明；第二场既不办也不排除，下一次周会再问一遍。

---

### D7 · CT-4 推送顺序基准

**问题原文（11-29 收口清单 D3）。** 「顺序要对着哪一次『契约推送』量：发布 tag 推送 —— 字面读法，也是读数器今天唯一的实现 —— 还是提交到达契约 main？」

**证据等级。** E3 —— 读数器自己的判定加推送侧记录。

**更新（11-27）。** 读数器（`KeelBase4J/scripts/check-push-order.mjs`）只实现了字面 tag 推送；另两种读法都没实现，这就是两条发现都判红的原因。**11-23：** pin bump 早于契约首次推送 5 小时 42 分 —— 任何读法下都违规，且不在三个允许时刻内。**11-24：** tag bump 早于 `v1.23.0` tag 推送 86 秒，而同一提交在那次 bump 之前 34 秒已到达契约 main。读数器修复（`90e670e`、`458447c`）已在 `origin/main` 与 `gitee/main` 上 —— 此前「未推 origin」那句撤回。

**方案与可证伪后果。** 本组是**基准**选项，与 D5 的 A/B/C（偏差 / 违规 / 不登记）不是同一组。

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 字面 tag 推送（现状）** | 不改规则、不改代码。11-24 记违规（86 秒），与 `3b08706b` 一致；11-23 记违规，并写明不在三个允许时刻内。 | 若日后又出现 replay-then-tag 发布、并期望在现规则下通过，或审计说不出「提交已先到 main」为何仍算违规，即证伪。 |
| **B. 提交到达契约 main** | 11-24 合规；11-23 仍违规。这是规则变更，必须明确处置 `3b08706b` —— 它对 v1.23.0 判的是相反结论。 | 若某次发布已到 main、但 tag 晚于消费方推送，这种读法看不见，即证伪。需改 `conformance/vectors/README.md:83-84` 与 `:106-107` 的措辞，并给读数器加 main 推送锚点。 |
| **C. 双锚：两者较早者满足顺序，且 tag 推送仍须早于消费方推送** | 11-24 合规；11-23 仍违规；只对今后生效，保留 `3b08706b`。 | 若某次发布在 main 上满足了顺序、tag 却晚于消费方推送而无人发现，即证伪 —— 「tag 推送 ≤ 消费方推送」这一条件正是用来抓这个的。需同样改 README，并改 `judge()`。 |

**建议默认值（建议，非裁定）。** A —— 字面读法既是代码的实现，也是 `3b08706b` 实质适用于 11-24 的那条；B 与 C 都是规则变更，需要各自明写措辞，并明确处置那条裁定。若会上希望 replay-then-tag 发布能通过，C 是更窄的一改。

**已收裁定（11-27）。** 用户裁定**选 A**：契约推送指发布 tag 推送，规则不动。11-24 按顺序腿记违规（86 秒，与 `3b08706b` 一致）；11-23 记违规，并写明不在三个允许时刻内；不改规则、不改代码；不采纳 B、C。记录见 `handoff/ct4-ruling-options-1127.md` §10。**本段只记「决定已作出」，不等于在本单上签字** —— 裁定行与签字登记在有人于本单签字之前保持空白。

**裁定行。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** 每次审计都会把两条发现重新报出来；11-23 这一条仍无记录；下一次 replay-then-tag 发布仍返回 VIOLATION，同一场争论还会再来。

---

### D8 · G5 产物契约闸

**问题原文（11-29 收口清单 D4）。** 「已发布产物的契约核对，现在接进 CI，还是把后置正式记录下来？」

**证据等级。** 2026-11-27 对 Maven Central 的实跑读数；没有可复现这些读数的 CI 作业。

**更新（11-27）。** 工具在真实字节上可用。对 0.1.21：`keelbase4j-protocol`、`keelbase4j-core`、`keelbase4j-springai` 三个都返回一致（exit 0，自述 `v1.23.0`）；用错误的期望值返回不一致（exit 1）；对 0.1.19 返回未声明（exit 2）。它仍无任何 workflow、runbook 或 `package.json` 引用。上轮评审记下的五条缺陷仍在脚本里：清单段不在空行处停止、zip 解压无上限、抛错与真实不匹配不可区分、`pom.xml.sha1` 守卫是死代码、`readError` 只在 `--json` 下暴露。

**方案与可证伪后果。**

| 方案 | 做什么 | 可证伪后果 |
|---|---|---|
| **A. 现在接线（阻塞档）** | 发布后一条 CI 作业：下载 Central 字节，比对产物自述的契约版本；约 1–1.5 个 AI 日，加 CI 改动批准。 | 若某次发布带出的字节声明的契约版本是错的，而这条作业是唯一能抓到它的东西，即证伪 —— 发布后的红阻止不了发布，只能让它可见。 |
| **B. 正式记录后置** | 决定索引一条带日期的条目，点名 G5、「11-29 不计完成」、12-05 重开，并在 runbook 第 7 步加一条命令。 | 若日后有人断言「已发布字节带着它声称的版本」，却没人跑过工具、后置记录也没写明谁重开，即证伪。 |
| **C. 拆两步：先告警，后阻塞** | 现在落一条非阻塞作业 —— 除新增作业外不改 CI 契约；阻塞与否到 12-05 凭至少两次发布的读数决定。 | 若告警作业产出了读数而 12-05 没人看，或在清单段落、错误报告、解压上限三条缺陷修好前就升为阻塞档，即证伪。 |

**建议默认值（建议，非裁定）。** C；若 CI 改动批准被拒，退回 B 并加上 runbook 那一条。在升为阻塞档之前，先修清单段落、错误报告与解压上限三条缺陷。无论哪条，11-29 都不把 G5 计入完成。

**已收裁定（11-27）。** 用户裁定**选 C**：拆两步 —— 先落告警（非阻塞）作业；阻塞与否 12-05 凭至少两次发布的读数决定；升为阻塞档之前先修清单段落、错误报告与解压上限三条缺陷。裁定只定方向：**本单不接任何线**，作业是另一件活，11-29 不计 G5 完成。若 CI 改动批准被拒，退回 B 并加上 runbook 那一条。**本段只记「决定已作出」，不等于在本单上签字。**

**裁定行。** 裁定：☐A ☐B ☐C ｜ 签字/日期：____________________

**若不裁的后果。** G5 在正被签的这张单子上仍未接线、也未登记；「不可达工具」那条发现保持开着；「已发布产物带着它声称的契约版本」这句话仍靠有人想起去跑脚本。

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
| D1 | 判据 5 两格是否算业务答案 | D1 | *（11-27 裁定：选 A —— 维持现状，判分人尚未签。）*「通过」与「判据 5 未定」并存；不能对外声明。 |
| D2 | 12-05 前是否开 VM 跑真实编译 | D2 | *（11-27 裁定：选 A —— 文档档至 12-05。）* 12-05 无新编译读数；依据停在 E2。 |
| D3 | 12-05 判据取 `compile` success 还是真实编译 | D3 | *（11-27 裁定：选 A —— 照纪要原文。）* 若 runner 仍离线，12-05 会判该判据不可观察且未达成。 |
| D4 | 今晚再失败是否另立「第三次失败」 | D4 | *（11-27 裁定：选 A —— 维持现状；第三次尝试已发生、无读数、未归类。）* 无处置口径；第四次窗口未排。 |
| D5 | 4J 跨日 bump 记偏差还是违规 | D5 | *（11-27 裁定：选 A —— 按偏差登记，豁免措辞已拟。）* 4J 这一条按偏差登记，与 11-24 的 VIOLATION 区别开来。 |
| D6 | 是否另办第二场 N5 验收 | D6 | *（11-27，来自 11-29 收口清单；用户已于 11-27 裁定选 B。）* 不办第二场；「记为通过」仍与 E3 边界并列，撑不起对外声明。 |
| D7 | CT-4：对 tag 推送还是对提交到达 main 量 | D7 | *（11-27，来自 11-29 收口清单；用户已于 11-27 裁定选 A，见 `ct4-ruling-options-1127.md` §10。）* 每条审计仍会报 VIOLATION —— 在本裁定下这是预期读数，不是待修缺陷。 |
| D8 | G5：接线还是正式记录后置 | D8 | *（11-27，来自 11-29 收口清单；用户已于 11-27 裁定选 C。）* 告警作业建好之前 G5 仍未接线；阻塞与否 12-05 到期决定。 |

### 签字登记

| 编号 | 裁定（A / B / C） | 签字人 | 日期 |
|---|---|---|---|
| D1 | | | |
| D2 | | | |
| D3 | | | |
| D4 | | | |
| D5 | | | |
| D6 | | | |
| D7 | | | |
| D8 | | | |

### 本件不做什么

- 不改 packet、周计划、roadmap、决定索引、认领表。
- 不 contact 任何人，不 commit、不 push，不起栈、不触发 CI。
- 不替判分人或 CTO 裁定；裁定行在有人签字前保持空白。
- 11-27 的更新块只记读数与出处，不改任何裁定，所有裁定行保持空白。
- D6–D8 同样不裁；它们是 11-27 从 11-29 收口材料并入、好让一张单子都带着，裁定行与其余各页一样留空。
- 不宣称任何验收结论。禁用措辞仍然禁用：E4、验收通过（无条件）、证据齐全、独立复现、独立真人批准。

### 单源与位置

- `handoff/cto-1128-packet.md` —— D1–D5、证据等级、未核项、五个问题。
- `handoff/n5-verdict-1126.md` —— 判据 1–5、§7 逐格表、§11 路径 A、四句边界。
- `handoff/n5-closeout-1126.md` —— 证据盘点、哈希、缺件清单。
- `handoff/v1230-release-plan-1126.md` —— D5 相关发布链、§6 待决三项。
- `handoff/w14-ready-1126.md` —— D4 就绪读数、阻塞项、runbook。
- `handoff/cto-1128-update-1127.md` —— 这些更新块所概括的 11-27 增补页。
- `handoff/release-v0.1.21-published.md`、`handoff/release-precheck-0.1.21-1126.md` —— v0.1.21 发布与四层评审读数。
- `handoff/w14-third-outcome-1127.md` —— W1.4 结论、第三种形态分类、一句话决定项。
- D6–D8 于 11-27 增补：`handoff/n5-second-session-options-1127.md`；`handoff/ct4-ruling-options-1127.md`；`handoff/g5-wire-or-defer-1127.md` —— 三页所概括的分析。D7 的读数出自 `KeelBase4J/scripts/check-push-order.mjs`；D8 的读数出自 2026-11-27 对 Maven Central 的实跑。
