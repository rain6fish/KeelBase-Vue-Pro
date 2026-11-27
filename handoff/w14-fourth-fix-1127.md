# W1.4 fourth-window pre-fix — why the five deliverables never landed / W1.4 第四次窗口前置修复 —— 五处交付物为何始终没有落进轮检出

- **Nature**: read-only analysis and proposal. No window re-run, no repository change beyond this note, no commit, no push, no contact with anyone.
- **Written**: 2026-11-27 12:10–13:05 (+08).
- **Inputs**: `handoff/w14-third-outcome-1127.md`; `D:/Rain6fish/handoff/w14-ready-1126.md`; `D:/Rain6fish/handoff/w14-rerun-plan-1125.md`; `D:/Rain6fish/handoff/w14-second-run-1123.sh`; `D:/Rain6fish/handoff/w14-second-run-1123.md`; `D:/Rain6fish/handoff/w14-recipe-1124.md`; `C:/Users/6fish/.claude/scheduled-tasks/w14-second-1126-2030/SKILL.md`; the evidence directory `D:/Rain6fish/handoff/w14-second-1124/round{1,2}/`; both round checkouts at `D:/Rain6fish/.w14-r2/round{1,2}`; the main checkout `D:/Rain6fish/KeelBase-Vue-Pro` (HEAD `f73ad6a5446c`, clean); the W1.4 session transcript `C:/Users/6fish/.claude/projects/D--Rain6fish/6e2ff14b-….jsonl`; every project transcript under `C:/Users/6fish/.claude/projects/`; `powercfg` readings.
- **Scope of the evidence**: a full `find` over `D:/Rain6fish` plus a depth-6 `find` over `C:/Users/6fish`; nothing was inspected outside those two roots.

---

## 0. Conclusion

**The five deliverables were never written — not into the round checkout, not anywhere else the check could reach — and no script step existed that would have noticed.**

Three sentences, each falsifiable:

1. No file named `FmsVoucher*`, `run-fms-*` or `YudaoLocalCompensators.java` under `D:/Rain6fish` has a modification time inside the window (11-26 20:00–24:00), and no Claude session active at 20:50–21:35 issued a `Write`/`Edit` for any of them. The "author wrote into the wrong tree" hypothesis is therefore **falsified for every path inside `D:/Rain6fish`**; a file written outside `D:/Rain6fish` and `C:/Users/6fish` remains **未核**.
2. The protocol named the right absolute path exactly once — in the session's own message at 20:56:57 — but the document the author was told to follow, `w14-recipe-1124.md` §0 line 32, states that every path in it is relative to `D:\Rain6fish\KeelBase-Vue-Pro`, and that checkout already contains four of the five deliverables as committed files. "The protocol did not say where" is **falsified**; "the protocol said two different things" is **confirmed**.
3. The script had no check for the deliverables at all. That gap let a zero-deliverable round run 8 m 53 s of stack/build/host after the author said 「写完了」, end in a gate red that was not a failed assertion, and still write `T1` into `times.txt`. When the round was restarted, a second `T0` was recorded on a still-empty tree with no guard whatsoever.

The proximate cause is on the author's side: nothing was written. The script is not the cause of that, and adding a check will not make the author write. What the check fixes is the **cost of finding out**: 1 second instead of 8 m 53 s, no bogus `T1`, and a message that repeats the absolute path at the moment it matters.

---

## 1. The five deliverables: expected path, base state, actual state

The five places are defined identically in `w14-recipe-1124.md` §2 (line 159: "改动集一共五处"), `w14-second-run-1123.md` §2 ② (the table at lines 63–69) and `SKILL.md` line 42.

| # | Deliverable | Expected path (relative to the round checkout) | At base `cdae38ea` | In `round1` on 2026-11-27 | In the main checkout `f73ad6a` | Written 11-26? |
|---|---|---|---|---|---|---|
| 1 | `pom.xml`: uncomment `yudao-module-fms` | `yudao-server/pom.xml` | **commented** (`round1/yudao-server/pom.xml:205-209`) | unchanged, still commented | **uncommented** (`KeelBase-Vue-Pro/yudao-server/pom.xml:228-232`) | **no** |
| 2 | `FmsVoucherGovernance.java` | `yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/` | absent | **absent** | present, 2026-11-02 08:29 | **no** |
| 3 | `FmsVoucherTools.java` | same directory | absent | **absent** | present, 2026-10-25 10:26 | **no** |
| 4 | `YudaoLocalCompensators.java`: add `@Bean` + inner class | same directory | present, **no FMS bean** (only `CrmCustomerCompensator`, `GeneratedProductsCompensator`, `CrmFollowUpRecordCompensator` — lines 70/95/127) | unchanged | present, 2026-11-06 07:36, **also without any FMS reference** | **no** |
| 5 | `run-fms-voucher-scenarios.mjs` (the gate) | `scripts/` | absent | **absent** | present, 2026-11-02 18:41 | **no** |

Where the deliverables actually are, therefore: **nowhere in this round**. The main checkout holds four of the five (1, 2, 3, 5) as pre-existing committed work from earlier dates, and it holds item 4 *in the old, FMS-less form* — so even an author who anchored to the main checkout and read the files there was looking at a tree that does not satisfy the recipe either.

Evidence for each cell is in §2.

---

## 2. Evidence

### 2.1 The round checkout is untouched

```
$ git -C D:/Rain6fish/.w14-r2/round1 rev-parse HEAD
cdae38ea3850298e9829e574fddaebf2a7d40a63
$ git -C D:/Rain6fish/.w14-r2/round1 status --porcelain        # (no output)
$ git -C D:/Rain6fish/.w14-r2/round1 status --porcelain --ignored  # (no output)
```

`round2` is identical. No `FmsVoucher*` / `run-fms-*` file exists anywhere under `.w14-r2/round1` or `round2` (the only `FmsVoucher*` hits under `.w14-r2` are module sources in `preflight/yudao-module-fms/`, unrelated).

### 2.2 Nothing was written anywhere in `D:/Rain6fish` during the window

```
$ cd /d/Rain6fish && find . -path ./.git -prune -o -path '*/node_modules' -prune -o -path '*/target' -prune \
    -o \( -name 'FmsVoucher*' -o -name 'run-fms-*' -o -name 'YudaoLocalCompensators.java' \) \
    -newermt '2026-11-26 20:00' ! -newermt '2026-11-27 00:00' -print
(no output)
```

A wider sweep (any file at depth ≤5 modified 20:50–21:40) returns only `.m2-host-pin-1126/…` (the v0.1.21 release task's Maven cache), `handoff/release-*` (same task) and `handoff/w14-second-1124/round1/{build,gate,host,sql-*}.log` (the W1.4 session's own evidence files).

The same depth-6 sweep over `C:/Users/6fish` for the three deliverable file names, restricted to 11-26, returns nothing.

### 2.3 No session wrote them

All sixteen transcripts modified between 20:50 and 21:35 (across every project), plus the W1.4 session file itself, were scanned for `tool_use` calls whose input mentions any of the five names. The only hit outside the W1.4 session is a `Bash` call from 2026-11-24, in a session that was not active in the window. The W1.4 session (`6e2ff14b`) contains **zero** `Write`/`Edit`/`NotebookEdit` calls for the whole session; its only mentions of those names are five `Bash` calls — the chain itself.

### 2.4 The author was in a different conversation at the wrong moment

The only author message in any main-checkout session between 20:50 and 21:35 is at **20:57:20** in session `db508822` — 28 seconds after `T0` was recorded — and it reads 「记录后放行」, which the other session acts on by editing `handoff/release-precheck-0.1.21-1126.md`. The W1.4 window and the v0.1.21 release task were being driven from the same pair of hands at the same minute.

### 2.5 The protocol contains two different anchors

- `SKILL.md` line 42: "作者按 recipe §2 手写五处" — it names the five items but **not** the tree.
- `w14-second-run-1123.md` §0 line 18: 检出 = `D:/Rain6fish/.w14-r2/round1`；§2 ② gives the five relative paths.
- `w14-recipe-1124.md` §0 **line 32**: "这份 recipe 说的每一条路径都相对**代码仓** `D:\Rain6fish\KeelBase-Vue-Pro`". This is the document the author was told to follow for the content of the five places.
- The session message at 20:56:57 did state it correctly: 「检出在 `D:/Rain6fish/.w14-r2/round1`」.

So the correct path *was* spoken, once, in a chat message — and contradicted by §0 of the document the same message told the author to follow. Neither of the two runbook documents that the fourth window will reuse resolves the contradiction.

### 2.6 What the script did with the zero-file state

| Time | Step | What the script knew | What it did |
|---|---|---|---|
| 20:59:10 | author says 「写完了」 | nothing — no check exists | started `stack 1 up` |
| 20:59:16–21:01:54 | stack, build, host | nothing | ran normally; build 96 s, host 200 |
| 21:08:03–05 | `gate 1` | nothing | ran `node scripts/run-fms-…mjs`; `MODULE_NOT_FOUND`; wrote `T1=…21:08:04` and `gate_exit=1 gate_ok=0 gate_failed=0` into `times.txt` |
| 21:29:59 | `t0 1` (restart) | `cmd_check` only verifies **absence** of deliverables | recorded a new `T0` on the same empty tree |

`gate.log` in full is the Node loader stack; the first line of substance is:

```
Error: Cannot find module 'D:\Rain6fish\.w14-r2\round1\scripts\run-fms-voucher-scenarios.mjs'
  code: 'MODULE_NOT_FOUND'
```

That is not a red gate — the gate never executed a single assertion. `cmd_gate` nevertheless appends a `T1` line, because it writes `T1` before it evaluates anything.

`cmd_counts` has the same shape: `cat <missing files> | wc -l` prints `0`, so a `counts.txt` would have recorded `口径A=0 仅代码=0 门禁行数=0` with no marker of failure.

### 2.7 Two further script defects observed in the same window

- `pid_on_port` / `port_listening` match `127.0.0.1:<port>` only. The host binds `0.0.0.0`, so `host down` found no pid (the session had to kill pid 451598 by hand at 21:10:23) and `build`'s "port is listening" guard cannot see a running host either. Demonstrated: for ports 135 and 445, `grep "127\.0\.0\.1:$p .*LISTENING"` matches **0** lines while `grep "[:.]$p .*LISTENING"` matches **2**.
- `okn`/`fails` are read from `grep -c` with `|| true`; when the log is missing they are empty strings and `[ "$fails" -ne 0 ]` raises `integer expression expected`. Harmless today (the `rc -ne 0` branch fires first) but it is a silent-error path in the same function.

---

## 3. The three candidate causes, tested

| Candidate | Verdict | What decides it |
|---|---|---|
| **A. The author wrote into the wrong tree** | **Falsified inside `D:/Rain6fish`; 未核 outside it** | No matching file with a window mtime anywhere under `D:/Rain6fish` (§2.2); no session write (§2.3). The *mechanism* is real, though: recipe §0 anchors paths at the main checkout, where four of five deliverables already exist and item 4 exists in an older form — a reader who followed §0 and looked would see "done" without writing a byte (§2.5). |
| **B. The protocol did not say where** | **Falsified.** What is confirmed is that it said **two** places | The session's 20:56:57 message names `D:/Rain6fish/.w14-r2/round1`; recipe §0 line 32 names `D:\Rain6fish\KeelBase-Vue-Pro`; SKILL line 42 names neither (§2.5). |
| **C. The script had no check** | **Confirmed** | There is no post-write verification anywhere in the script; `gate` writes `T1` unconditionally; `counts` writes zeros on missing files (§2.6). |

Ranking, stated so it can be argued with:

1. **Proximate**: no file was written. Every second of the window after 20:59:10 was spent on a tree that could not pass.
2. **Enabling**: C. Without C the failure would have surfaced in one second with the correct path in the message, and the 8 m 53 s of stack/build/host — plus the invalid `T1` — would not exist.
3. **Contributing**: B. The author was handed one correct statement and one contradictory one; the contradictory one is in the recipe, i.e. the document whose content they were asked to reproduce.
4. **Aggravating**: the 「写完了」 arrived 2 m 18 s after `T0`, which is not a plausible time for five files including a 35 KB scenario script. Nothing in the protocol asks the session to weigh that; a landing check makes the question objective.

The second attempt (21:29:59 → 22:30) needs no new cause: `T0` was recorded with an empty tree, the machine entered connected standby 2 m 33 s later, and no input arrived. That is the "author absent" shape from 11-24 and 11-25 — with the difference that this time a `T0` was left dangling in `times.txt`.

---

## 4. Executable check: run after 「写完了」, before the chain

### 4.1 What it checks

1. Each of the five paths **exists** under the round checkout and is **non-empty**.
2. Each of them is a **change in this checkout** — `git status --porcelain -- <path>` is non-empty. This is the part that matters: it rejects the main checkout (where the files exist but are clean) and it rejects a file that was merely present at base.
3. The `pom.xml` is **actually uncommented** — comments are stripped before matching `<artifactId>yudao-module-fms</artifactId>`, so a half-edited pom fails.
4. The gate script **parses** — `node --check`, so a half-written `.mjs` fails before the chain starts.

### 4.2 Implementation (validated; see §4.4)

```bash
# ---------------------------------------------------------------- ready
# Deliverable landing check: the five places exist, are non-empty, and are changes
# in THIS round checkout (not the main checkout, not the base tree).
# 交付物落点检查：五处都在、非空、且是本轮检出里的改动（不是主检出，也不是 base 原样）。
DELIVS=(
  "yudao-server/pom.xml"
  "$JAVA_OUT/FmsVoucherGovernance.java"
  "$JAVA_OUT/FmsVoucherTools.java"
  "$JAVA_OUT/YudaoLocalCompensators.java"
  "scripts/run-fms-voucher-scenarios.mjs"
)

cmd_ready() {
  [ -d "$D/.git" ] || die "no clone at $D"
  local bad=0 rel
  for rel in "${DELIVS[@]}"; do
    if [ ! -e "$D/$rel" ]; then log "ready: MISSING $rel"; bad=1; continue; fi
    if [ ! -s "$D/$rel" ]; then log "ready: EMPTY $rel"; bad=1; continue; fi
    if [ -z "$(git -C "$D" status --porcelain -- "$rel")" ]; then
      log "ready: NOT-IN-THIS-CHECKOUT $rel (unchanged vs base)"; bad=1; continue
    fi
    log "ready: OK $rel"
  done
  if [ -f "$D/yudao-server/pom.xml" ] && ! node -e \
      'const s=require("fs").readFileSync(process.argv[1],"utf8").replace(/<!--[\s\S]*?-->/g,"");
       process.exit(/<artifactId>yudao-module-fms<\/artifactId>/.test(s)?0:1)' \
      "$D/yudao-server/pom.xml"; then
    log "ready: POM-STILL-COMMENTED yudao-module-fms"; bad=1
  fi
  if [ -s "$D/scripts/run-fms-voucher-scenarios.mjs" ] && \
     ! node --check "$D/scripts/run-fms-voucher-scenarios.mjs" >/dev/null 2>&1; then
    log "ready: GATE-SYNTAX-ERROR scripts/run-fms-voucher-scenarios.mjs"; bad=1
  fi
  [ "$bad" -eq 0 ] || die "deliverables are not in $D — do NOT run stack/build/host/gate, and do NOT record T1"
  log "ready OK: all five deliverables present and changed in $D"
}
```

### 4.3 What happens on failure — and what must not happen

- **Do not run** `stack`, `build`, `host` or `gate`. The chain is what turned a detection into an 8 m 53 s loss.
- **Do not record `T1`.** A round that never ran the gate has no `T1`, exactly as the 11-26 void round correctly states.
- **Do not re-record `T0`.** The clock started when the author started writing; a failed check means the writing is not finished. Re-recording `T0` would erase the failed segment from the measurement. Keep the `T0`, log `ready: …` lines into `steps.log` (they are timestamped), tell the author which places are missing **with the absolute path**, and re-run `ready` when they say done again. The reading that eventually comes out then honestly includes the time spent not writing.
- **A fresh `T0` after a failed `ready` is allowed only if** the author states the discarded segment was not writing (e.g. they were in another task), and the readings note records that statement verbatim. This keeps 11-26's 21:29:59 restart possible without making it free.

### 4.4 The check was run against the real trees

```
$ bash -n ready.sh                       # syntax OK
$ D=D:/Rain6fish/.w14-r2/round1 bash ready.sh
ready: UNCHANGED yudao-server/pom.xml (identical to base — not written in this checkout)
ready: MISSING   …/keelbase/FmsVoucherGovernance.java
ready: MISSING   …/keelbase/FmsVoucherTools.java
ready: UNCHANGED …/keelbase/YudaoLocalCompensators.java (identical to base — not written in this checkout)
ready: MISSING   scripts/run-fms-voucher-scenarios.mjs
ready: POM-STILL-COMMENTED yudao-module-fms
ready: FAIL — deliverables are not in D:/Rain6fish/.w14-r2/round1; do not run stack/build/host/gate, and do not record T1
exit=1

$ D=D:/Rain6fish/KeelBase-Vue-Pro bash ready.sh
ready: UNCHANGED yudao-server/pom.xml (identical to base — not written in this checkout)
ready: UNCHANGED …/FmsVoucherGovernance.java (…)
ready: UNCHANGED …/FmsVoucherTools.java (…)
ready: UNCHANGED …/YudaoLocalCompensators.java (…)
ready: UNCHANGED scripts/run-fms-voucher-scenarios.mjs (…)
ready: FAIL — …
exit=1
```

The second run is the important one: pointed at the main checkout — the anchor named by recipe §0 — the check **fails**, because those files are not changes for this round. That is exactly the confusion that has to be caught, and existence alone would not catch it. (The wording "identical to base" should be read as "no modification recorded in this checkout" when `$D` is not at base; the script's message may be tightened to `*(no change in this checkout)*`.)

### 4.5 Optional hardening (recommended, not essential)

- **Copy detection**: `sha256sum` each deliverable in `$D` against the same path in the main checkout; an exact match on any of the four long files means it was copied, which the protocol forbids ("不许 `git show main:`、不许从上一轮或主检出拷贝"). Report as a hard fail with the offending paths.
- **Compensator content**: `grep -q fms_voucher "$D/$JAVA_OUT/YudaoLocalCompensators.java"` — the recipe requires `resultType()` to return the module's result type. Main checkout's own copy would fail this today, which also proves the item-4 gap independently of `git status`.

---

## 5. Script and runbook diffs (suggestions only — nothing applied)

### 5.1 `D:/Rain6fish/handoff/w14-second-run-1123.sh`

**Diff A — register the subcommand.** Line 287, original:

```bash
    prep|check|env|t0|stack|build|host|gate|counts|stop|status) ;;
```

Suggested:

```bash
    prep|check|ready|env|t0|stack|build|host|gate|counts|stop|status) ;;
```

**Diff B — usage header, both language blocks.** Line 15 (English) and line 36 (Chinese), original:

```bash
#   check   <N>           HEAD=base, clean tree, no FMS deliverable                (before T0)
```
```bash
#   check   <N>           HEAD=base、工作树干净、没有 FMS 交付物（T0 之前）
```

Suggested, inserted immediately after each:

```bash
#   ready   <N>           five deliverables exist, non-empty and changed in THIS checkout (after the author says done)
```
```bash
#   ready   <N>           五处交付物都在、非空、且是本轮检出里的改动（作者说写完之后）
```

**Diff C — add `cmd_ready`.** Insert after `cmd_check` (after line 107), the block in §4.2, preceded by the two-line comment shown there.

**Diff D — gate refuses to run without the gate script.** Line 231–235, original:

```bash
cmd_gate() {
  host_answers || die "host is not answering on $HPORT — start it first"
  local gate_log="$EV/gate.log"
  log "gate: node scripts/run-fms-voucher-scenarios.mjs (T1 will be recorded at exit)"
  ( cd "$D" && node scripts/run-fms-voucher-scenarios.mjs ) > "$gate_log" 2>&1
```

Suggested:

```bash
cmd_gate() {
  [ -s "$D/scripts/run-fms-voucher-scenarios.mjs" ] \
    || die "gate script missing in $D — the round wrote no deliverable; no T1 recorded (run: ready $1)"
  # 门禁脚本不在就不再往下走：这不是门禁红，是交付物没落
  host_answers || die "host is not answering on $HPORT — start it first"
  local gate_log="$EV/gate.log"
  log "gate: node scripts/run-fms-voucher-scenarios.mjs (T1 will be recorded at exit)"
  ( cd "$D" && node scripts/run-fms-voucher-scenarios.mjs ) > "$gate_log" 2>&1
```

**Diff E — counts refuses to write zeros.** Lines 254–256, original:

```bash
cmd_counts() {
  ( cd "$D" && {
```

Suggested:

```bash
cmd_counts() {
  [ -s "$D/$JAVA_OUT/FmsVoucherGovernance.java" ] && [ -s "$D/$JAVA_OUT/FmsVoucherTools.java" ] \
    && [ -s "$D/scripts/run-fms-voucher-scenarios.mjs" ] \
    || die "counts: deliverables missing in $D — refusing to write a zero-line counts.txt (run: ready $1)"
  # 交付物不在就报错，不要写出一份「全是 0」的 counts.txt
  ( cd "$D" && {
```

**Diff F — port matching sees `0.0.0.0`.** Lines 76–78, original:

```bash
port_listening() { netstat -ano 2>/dev/null | grep -q "127.0.0.1:$1 .*LISTENING"; }

pid_on_port() { netstat -ano 2>/dev/null | grep "127.0.0.1:$1 .*LISTENING" | awk '{print $NF}' | head -1; }
```

Suggested:

```bash
# Match any local bind (127.0.0.1 and 0.0.0.0), not only loopback.
# 本机任意绑定（127.0.0.1 与 0.0.0.0）都算，不只看回环。
port_listening() { netstat -ano 2>/dev/null | grep -qE "[:.]$1 +.*LISTENING"; }

pid_on_port() { netstat -ano 2>/dev/null | grep -E "[:.]$1 +.*LISTENING" | awk '{print $NF}' | head -1; }
```

**Diff G (optional, same function as D)** — lines 239–240, guard the empty-string arithmetic:

```bash
  okn="$(grep -c '^  ok' "$gate_log" 2>/dev/null || true)"
  fails="$(grep -c '  FAIL' "$gate_log" 2>/dev/null || true)"
```

Suggested: add `okn="${okn:-0}"; fails="${fails:-0}"` on the next line.

**Syntax check after editing** (must print nothing, exit 0):

```bash
bash -n D:/Rain6fish/handoff/w14-second-run-1123.sh
```

**Behavioural smoke test** (do this in the fourth-window prep, not during a window):

```bash
D=D:/Rain6fish/.w14-r2/round1 bash D:/Rain6fish/handoff/w14-second-run-1123.sh ready 1   # expect exit 2 and 5 findings
```

and, to prove the passing path once, a throwaway clone under `.w14-r2/dryrun/` with the five files put in place (copying into a dryrun is fine; it is not a measurement checkout), expect `ready OK`, then delete the dryrun directory.

### 5.2 `D:/Rain6fish/handoff/w14-second-run-1123.md` (checklist)

**Diff H — resolve the anchor.** §0 table (lines 12–22), add a row:

```markdown
| 写入锚点 | 五处一律写在轮检出 `D:/Rain6fish/.w14-r2/roundN`；`w14-recipe-1124.md` §0 的 `D:\Rain6fish\KeelBase-Vue-Pro` 锚点在本轮不适用 |
```

**Diff I — make the landing check a step.** §2 ②, after the five-row table (line 69), insert:

```markdown
**②b 落点校验（作者说「写完了」之后、起栈之前）**

```bash
bash w14-second-run-1123.sh ready N
```

- 通过（`ready OK`）才继续 ③；不通过就**停在原地**：不跑 stack/build/host/gate、不记 T1、`T0` 不变，把缺的几处**连同绝对路径**回给作者，等他补写后再跑一次 `ready`。
- 该行会写进 `steps.log`；读数文件必须能指认出这条 `ready OK`（见 §4 验收句）。
```

(Adjust the nested fence when editing the real file so the inner block closes correctly.)

### 5.3 `C:/Users/6fish/.claude/scheduled-tasks/w14-second-1126-2030/SKILL.md` (and its successor task)

**Diff J — the per-round step list.** Lines 39–48, between step 3 (the five places) and step 4 (`stack N up`), insert:

```markdown
4. `bash w14-second-run-1123.sh ready N` — **落点校验**：五处都在、非空、且是本轮检出里的改动。
   不通过 ⇒ **不跑** stack/build/host/gate、**不记** T1、`T0` 不变；把缺的路径（带 `D:/Rain6fish/.w14-r2/roundN/` 前缀）回给作者，等他补写后再跑一次 `ready`。
```

and renumber the following steps.

**Diff K — stage 0.** Lines 27–29, extend the evidence-directory item:

```markdown
- 若 `round1/times.txt` 只剩一条 **2026-11-26** 的 `T0`（无 `T1`、无 VOID），把它改名为 `times-void-20261126b.txt`；11-26 的 `build.log`/`gate.log`/`host.log`/`sql-*.log` 一并移进 `round1/void-1126/`，本轮证据用干净的文件名。
```

**Diff L — the acceptance sentence.** Line 54, add one clause:

```markdown
并附两轮 `gate.log`（`exit 0`、`0 failed`、五条腿各有可指认行）与两份 `counts.txt`，且两轮 `steps.log` 中各有一条位于 `T0` 与 `T1` 之间的 `ready OK`；缺任一项即未完成。
```

---

## 6. Fourth-window prerequisites — differences from `w14-ready-1126.md`

Everything in that checklist that was "满足" on 11-26 is still satisfied on 11-27 unless listed below (both checkouts are still `cdae38ea`, clean, no `target/`; no `w14r*` containers; port 48086 free; 4J four packages present; recipe marker unchanged).

| # | Item | `w14-ready-1126.md` said | Measured 2026-11-27 | Action before the fourth window | Who |
|---|---|---|---|---|---|
| Q1 | Author present **and writes** | P1: present and reply 「在场」 | Present three times, wrote nothing | Keep P1, and add: the author accepts the `ready` check after every 「写完了」; a failure is not a window miss, it is a rewrite | 用户 / 会话 |
| Q2 | Display timeout | P2: change to 从不 | **still `VIDEOIDLE AC = 0x000000b4` (180 s)**; `STANDBYIDLE AC = 0` | Actually set it: `powercfg -change -monitor-timeout-ac 0`, then verify `powercfg -q SCHEME_CURRENT SUB_VIDEO VIDEOIDLE` shows `0x00000000` | 用户 |
| Q3 | Never let the turn end while the author is mid-write | not an item | Turn ended 21:30:07 → standby 21:32:40 | Either keep the author inside a turn (they must reply), or set Q2 first; the session must not end its turn with the tree still empty unless it says so explicitly | 会话 |
| Q4 | `round1/times.txt` state | P14: old 11-25 T0 renamed | `T0=2026-11-26T21:29:59+0800`, **no `T1`, no VOID** | Rename to `times-void-20261126b.txt` in stage 0 (Diff K) | 会话 |
| Q5 | Evidence directory | clean | holds 11-26 `build.log` (50 KB), `gate.log`, `host.log`, `host.pid`, `sql-*.log`, the void `times-*` files | Move 11-26 artifacts into `round1/void-1126/`; keep `env.txt` regenerated | 会话 |
| Q6 | Deliverable landing check | absent | absent | Add `ready` to the script (Diff A–C) and to the runbook (Diff I, J); smoke-test it in prep | 会话 + 用户 |
| Q7 | Concurrent heavy tasks | P17: none | v0.1.21's three release windows overlapped; `5a204b2348` committed in the main checkout at 21:30:55 | Pick a window with **no release/push task at all**; if v0.1.21's follow-up lands in the same evening, move the window | 用户 |
| Q8 | Other sessions must not touch the round checkouts | not an item | `round1/.git` mtime is 11-27 12:05 (some other process ran git in it) | State it as a rule; `check N` will catch a dirty tree, but a stray commit would not be caught — `check` should also assert `HEAD == base` (it does) | 会话 |
| Q9 | Trigger | task `w14-second-1126-2030` | `enabled=false`, one-shot, spent | Create a new one-shot task for the chosen date, or drive it from a manually opened session | 用户 |
| Q10 | Author's own dry run | not an item | — | Before the window, the author writes five placeholder files into `.w14-r2/dryrun/` to prove their editor and the path are the ones they think they are; delete afterwards. This is the one action aimed directly at the root cause. | 用户 |
| Q11 | Restart rule | implied | the 21:29:59 restart had no rule behind it | Adopt §4.3: keep `T0` on a failed `ready`; a fresh `T0` only with the author's statement that the discarded segment was not writing, recorded in the readings | 用户裁定 |

---

## 7. What this note does not claim

- No time-to-green reading exists for any W1.4 attempt. Nothing here supports "faster" or "slower". W1.4 round 2 remains unproven.
- The 11 m 12 s in `times-void-1126a.txt` is not a reading; the dangling `T0=2026-11-26T21:29:59+0800` is not a duration.
- "The author wrote nothing" is claimed only for `D:/Rain6fish` (full sweep) and `C:/Users/6fish` (depth ≤6). Files outside those roots were **not** checked; unsaved editor buffers cannot be observed at all.
- The recipe-§0 mechanism in §3-A is a *plausible mechanism backed by a real contradiction*, not a proven account of what the author did. What the author did between 20:56:52 and 20:59:10 is **未核**; the only thing that is proven is that nothing was written.
- No window was re-run; no container, build or host was started; no scheduled task, power setting or repository file was changed; nothing was committed, pushed, or sent to anyone. The only write is this file.
- The proposed diffs were validated for syntax and behaviour only in a scratch copy under `C:/Users/6fish/AppData/Local/Temp/w14scan/`; the runbook and the script in `handoff/` are untouched.

---
---

# W1.4 第四次窗口前置修复 —— 五处交付物为何始终没有落进轮检出

- **性质**：只读分析与建议。未重跑窗口、除本文件外未改任何仓、未 commit、未 push、未联系任何人。
- **写作时点**：2026-11-27 12:10–13:05（+08）。
- **输入**：`handoff/w14-third-outcome-1127.md`；`D:/Rain6fish/handoff/w14-ready-1126.md`；`D:/Rain6fish/handoff/w14-rerun-plan-1125.md`；`D:/Rain6fish/handoff/w14-second-run-1123.sh`；`D:/Rain6fish/handoff/w14-second-run-1123.md`；`D:/Rain6fish/handoff/w14-recipe-1124.md`；`C:/Users/6fish/.claude/scheduled-tasks/w14-second-1126-2030/SKILL.md`；证据目录 `D:/Rain6fish/handoff/w14-second-1124/round{1,2}/`；两轮检出 `D:/Rain6fish/.w14-r2/round{1,2}`；主检出 `D:/Rain6fish/KeelBase-Vue-Pro`（HEAD `f73ad6a5446c`，干净）；W1.4 会话记录 `C:/Users/6fish/.claude/projects/D--Rain6fish/6e2ff14b-….jsonl`；`C:/Users/6fish/.claude/projects/` 下全部项目会话记录；`powercfg` 读数。
- **取证范围**：`D:/Rain6fish` 全树 `find`，加 `C:/Users/6fish` 深度 6 的 `find`；这两个根之外未查。

---

## 0. 结论

**五处交付物从未被写过——没写进轮检出，也没写到任何检查够得着的地方；而脚本里根本没有任何一步会察觉这件事。**

三句话，每句都可证伪：

1. `D:/Rain6fish` 下没有任何 `FmsVoucher*`、`run-fms-*`、`YudaoLocalCompensators.java` 的修改时间落在窗口内（11-26 20:00–24:00），20:50–21:35 活跃的任何会话也没有对这些名字发起过 `Write`/`Edit`。因此「作者写错树」这一假设**在 `D:/Rain6fish` 内的所有路径上被证伪**；写在 `D:/Rain6fish` 与 `C:/Users/6fish` 之外的可能性**未核**。
2. 协议只在一个地方说对了绝对路径——会话 20:56:57 的那句话；但作者被要求照做的 `w14-recipe-1124.md` §0 第 32 行写着「这份 recipe 说的每一条路径都相对**代码仓** `D:\Rain6fish\KeelBase-Vue-Pro`」，而那个检出里本来就有四处交付物（已提交）。「协议没说写哪」被**证伪**；「协议说了两个地方」被**证实**。
3. 脚本里没有任何交付物检查。这个缺口让一个「零交付物」的轮次在作者说「写完了」之后又跑了 8 分 53 秒的起栈/构建/起宿主，最后以一次并非断言失败的门禁红收场，并且仍然把 `T1` 写进了 `times.txt`。重启该轮时，又在一棵仍然是空的树上、毫无校验地重记了一个 `T0`。

近因在作者一侧：什么都没写。脚本不是这件事的起因，加检查也不会让作者动笔。检查修的是**发现问题的代价**：从 8 分 53 秒变成 1 秒，不再产出假 `T1`，并且在最要紧的那一刻把绝对路径再说一遍。

---

## 1. 五处交付物：应在哪、base 是什么样、实际在哪

五处的位置在 `w14-recipe-1124.md` §2（第 159 行「改动集一共五处」）、`w14-second-run-1123.md` §2 ②（第 63–69 行表格）与 `SKILL.md` 第 42 行三处说法一致。

| # | 交付物 | 应在路径（相对轮检出） | base `cdae38ea` 上 | 2026-11-27 的 `round1` | 主检出 `f73ad6a` | 11-26 写过吗 |
|---|---|---|---|---|---|---|
| 1 | `pom.xml` 解注释 `yudao-module-fms` | `yudao-server/pom.xml` | **注释态**（`round1/yudao-server/pom.xml:205-209`） | 未动，仍注释 | **已解注释**（`KeelBase-Vue-Pro/yudao-server/pom.xml:228-232`） | **没有** |
| 2 | `FmsVoucherGovernance.java` | `yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/` | 不存在 | **不存在** | 在，2026-11-02 08:29 | **没有** |
| 3 | `FmsVoucherTools.java` | 同上 | 不存在 | **不存在** | 在，2026-10-25 10:26 | **没有** |
| 4 | `YudaoLocalCompensators.java` 加 `@Bean` + 内部类 | 同上 | 在，**无 FMS 补偿器**（只有 `CrmCustomerCompensator`、`GeneratedProductsCompensator`、`CrmFollowUpRecordCompensator`，第 70/95/127 行） | 未动 | 在，2026-11-06 07:36，**同样没有任何 FMS 引用** | **没有** |
| 5 | `run-fms-voucher-scenarios.mjs`（门禁） | `scripts/` | 不存在 | **不存在** | 在，2026-11-02 18:41 | **没有** |

所以「实际落在哪里」的答案是：**本轮哪里都没有**。主检出里有五处中的四处（1、2、3、5），都是更早日期已提交的旧件；第 4 处虽有文件，却是**没有 FMS 补偿器的旧形态**——也就是说，即使作者按主检出的锚点去读，看到的树同样不满足 recipe。

每一格的证据见 §2。

---

## 2. 证据

### 2.1 轮检出是干净的

```
$ git -C D:/Rain6fish/.w14-r2/round1 rev-parse HEAD
cdae38ea3850298e9829e574fddaebf2a7d40a63
$ git -C D:/Rain6fish/.w14-r2/round1 status --porcelain          # 无输出
$ git -C D:/Rain6fish/.w14-r2/round1 status --porcelain --ignored # 无输出
```

`round2` 相同。`.w14-r2/round1`、`round2` 下不存在任何 `FmsVoucher*` / `run-fms-*` 文件（`.w14-r2` 里唯一的 `FmsVoucher*` 命中是 `preflight/yudao-module-fms/` 的模块源码，与本轮无关）。

### 2.2 窗口内 `D:/Rain6fish` 全树没有被写

```
$ cd /d/Rain6fish && find . -path ./.git -prune -o -path '*/node_modules' -prune -o -path '*/target' -prune \
    -o \( -name 'FmsVoucher*' -o -name 'run-fms-*' -o -name 'YudaoLocalCompensators.java' \) \
    -newermt '2026-11-26 20:00' ! -newermt '2026-11-27 00:00' -print
（无输出）
```

放宽到「深度 ≤5、20:50–21:40 之间被改动的任意文件」，结果只有三类：`.m2-host-pin-1126/…`（v0.1.21 发布任务的 Maven 缓存）、`handoff/release-*`（同一任务）、以及 `handoff/w14-second-1124/round1/{build,gate,host,sql-*}.log`（W1.4 会话自己的证据文件）。

同样的深度 6 扫描在 `C:/Users/6fish` 上按三个交付物文件名、限定 11-26，也没有结果。

### 2.3 没有任何会话写过它们

对 20:50–21:35 之间被修改的**全部十六份**会话记录（跨所有项目），加上 W1.4 会话文件本身，扫描「输入里提到上述五个名字的 `tool_use`」：W1.4 之外唯一的命中是 2026-11-24 的一次 `Bash`，且那个会话在窗口内没有活动。W1.4 会话（`6e2ff14b`）整场**零**次 `Write`/`Edit`/`NotebookEdit`，对这些名字的提及只有五次 `Bash`——就是那条链路本身。

### 2.4 作者在错误的那一刻待在了另一个会话里

20:50–21:35 之间主检出会话里唯一的作者消息在 **20:57:20**（会话 `db508822`）——距 `T0` 只有 28 秒——内容是「记录后放行」，对方会话据此改了 `handoff/release-precheck-0.1.21-1126.md`。W1.4 窗口和 v0.1.21 发布任务，在同一分钟里由同一双手交替驱动。

### 2.5 协议里有两个互相矛盾的锚点

- `SKILL.md` 第 42 行：「作者按 recipe §2 手写五处」——点了五处，**没说树**。
- `w14-second-run-1123.md` §0 第 18 行：检出 = `D:/Rain6fish/.w14-r2/round1`；§2 ② 给了五处的相对路径。
- `w14-recipe-1124.md` §0 **第 32 行**：「这份 recipe 说的每一条路径都相对**代码仓** `D:\Rain6fish\KeelBase-Vue-Pro`」。而这正是作者被要求照做的那份文档。
- 会话 20:56:57 的消息说对了：「检出在 `D:/Rain6fish/.w14-r2/round1`」。

也就是说：对的路径**被说过一次**，在一条聊天消息里；同时被它要求照做的那份文档的 §0 说了相反的一句。第四次窗口要复用的两份 runbook，都没有解决这个矛盾。

### 2.6 脚本如何处置「零文件」状态

| 时间 | 步骤 | 脚本知道什么 | 做了什么 |
|---|---|---|---|
| 20:59:10 | 作者说「写完了」 | 什么都不知道——没有这样的检查 | 开始 `stack 1 up` |
| 20:59:16–21:01:54 | 起栈、构建、起宿主 | 不知道 | 正常跑完；构建 96 秒，宿主 200 |
| 21:08:03–05 | `gate 1` | 不知道 | 跑 `node scripts/run-fms-…mjs`；`MODULE_NOT_FOUND`；仍把 `T1=…21:08:04` 与 `gate_exit=1 gate_ok=0 gate_failed=0` 写进 `times.txt` |
| 21:29:59 | `t0 1`（重启） | `cmd_check` 只校验交付物**不存在** | 在同一棵空树上又记了一个 `T0` |

`gate.log` 全文就是 Node 加载器的栈，实质第一行是：

```
Error: Cannot find module 'D:\Rain6fish\.w14-r2\round1\scripts\run-fms-voucher-scenarios.mjs'
  code: 'MODULE_NOT_FOUND'
```

这不是门禁红——门禁连一条断言都没执行。`cmd_gate` 还是追加了 `T1`，因为它在做任何判断之前就写。

`cmd_counts` 是同一个形状：`cat <不存在的文件> | wc -l` 输出 `0`，一份 `counts.txt` 会被记成 `口径A=0 仅代码=0 门禁行数=0`，且没有任何失败标记。

### 2.7 同一窗口里暴露的另外两处脚本缺陷

- `pid_on_port` / `port_listening` 只匹配 `127.0.0.1:<端口>`。宿主绑的是 `0.0.0.0`，于是 `host down` 找不到 pid（21:10:23 会话只能手动杀 451598），`build` 的「端口已被监听」守卫也看不见在跑的宿主。实测：端口 135、445 上，`grep "127\.0\.0\.1:$p .*LISTENING"` 命中 **0** 行，`grep "[:.]$p .*LISTENING"` 命中 **2** 行。
- `okn`/`fails` 来自带 `|| true` 的 `grep -c`；日志缺失时它们是空串，`[ "$fails" -ne 0 ]` 会报 `integer expression expected`。今天无害（`rc -ne 0` 分支先触发），但它是同一个函数里的静默错误路径。

---

## 3. 三种可能，逐条检验

| 可能 | 判定 | 依据 |
|---|---|---|
| **A. 作者写错了位置** | **在 `D:/Rain6fish` 内被证伪；之外未核** | `D:/Rain6fish` 下没有任何窗口内 mtime 的对应文件（§2.2）；没有任何会话写过（§2.3）。但这个**机制**是真实的：recipe §0 把锚点定在主检出，而那里五处里有四处已存在、第 4 处是旧形态——照 §0 去「看」的人会看到「已完成」，却一个字节都没写（§2.5）。 |
| **B. 协议没写清位置** | **证伪。**被证实的是「协议说了两个地方」 | 会话 20:56:57 的消息写了 `D:/Rain6fish/.w14-r2/round1`；recipe §0 第 32 行写了 `D:\Rain6fish\KeelBase-Vue-Pro`；SKILL 第 42 行两个都没写（§2.5）。 |
| **C. 脚本没有校验** | **证实** | 脚本里没有任何写后校验；`gate` 无条件写 `T1`；`counts` 在文件缺失时写下全 0（§2.6）。 |

排序，写明是为了可以被反驳：

1. **近因**：什么都没写。20:59:10 之后的每一秒都花在一棵不可能通过的树上。
2. **使能**：C。没有 C，失败会在一秒内以带正确路径的消息暴露，那 8 分 53 秒的起栈/构建/起宿主和那个无效 `T1` 都不会存在。
3. **促成**：B。作者拿到了一句对的和一句矛盾的；矛盾的那句在 recipe 里——而 recipe 正是他被要求复现内容的那份文档。
4. **加重**：「写完了」距 `T0` 只有 2 分 18 秒，对五处文件（含一份 35 KB 的门禁脚本）不是可信的时长。协议没有要求会话掂量这件事；落点检查让这个问题变得客观。

第二次尝试（21:29:59 → 22:30）不需要新原因：`T0` 记在一棵空树上，2 分 33 秒后机器进入 S0 连接待机，此后无输入。那是 11-24、11-25 的「作者缺席」形状——区别只是这次在 `times.txt` 里留了一个悬空 `T0`。

---

## 4. 可执行检查：在「写完了」之后、链路之前

### 4.1 检查什么

1. 五处路径在轮检出下**都存在**且**非空**。
2. 每一处都是**本检出的改动**——`git status --porcelain -- <路径>` 非空。这是关键一条：它拒掉主检出（文件在、但干净），也拒掉「本来就是 base 原样」的文件。
3. `pom.xml` **确实解注释了**——先剥掉注释再匹配 `<artifactId>yudao-module-fms</artifactId>`，改了一半的 pom 过不了。
4. 门禁脚本**能被解析**——`node --check`，半截 `.mjs` 在链路开始前就失败。

### 4.2 实现（已实测，见 §4.4）

代码与英文段 §4.2 相同（`DELIVS` + `cmd_ready`），此处不重复，避免两份实现漂移。

### 4.3 失败时怎么办——以及绝不能做什么

- **不要跑** `stack`、`build`、`host`、`gate`。正是这条链路把「一次可以立刻发现的事」变成了 8 分 53 秒的损失。
- **不要记 `T1`。** 没跑门禁的轮次没有 `T1`，与 11-26 作废轮的处理一致。
- **不要重记 `T0`。** 计时从作者开始写的那一刻起；检查失败意味着还没写完。重记 `T0` 会把失败的那一段从测量里抹掉。保留 `T0`，把 `ready: …` 的行写进 `steps.log`（带时间戳），把缺的几处**连同绝对路径**告诉作者，等他说写完再跑一次 `ready`。最终读数因此诚实地包含「没在写」的那段时间。
- **只有一种情况下允许在 `ready` 失败后重记 `T0`**：作者明确说明被丢弃的那一段不是在写（比如在处理别的事），且读数文件逐字记下这句话。这样既保留 11-26 21:29:59 那次重启的合法性，又不让它变成免费重来。

### 4.4 检查在真实树上跑过

```
$ bash -n ready.sh                       # 语法 OK
$ D=D:/Rain6fish/.w14-r2/round1 bash ready.sh
ready: UNCHANGED yudao-server/pom.xml (identical to base — not written in this checkout)
ready: MISSING   …/keelbase/FmsVoucherGovernance.java
ready: MISSING   …/keelbase/FmsVoucherTools.java
ready: UNCHANGED …/keelbase/YudaoLocalCompensators.java (identical to base — not written in this checkout)
ready: MISSING   scripts/run-fms-voucher-scenarios.mjs
ready: POM-STILL-COMMENTED yudao-module-fms
ready: FAIL — deliverables are not in D:/Rain6fish/.w14-r2/round1; do not run stack/build/host/gate, and do not record T1
exit=1

$ D=D:/Rain6fish/KeelBase-Vue-Pro bash ready.sh
（五处全部 UNCHANGED，随后 FAIL，exit=1）
```

第二次运行才是要紧的：把检查指向主检出——也就是 recipe §0 指定的锚点——它**失败**，因为那些文件不是本轮的改动。这正是必须被抓住的那种混淆，而「只看文件在不在」抓不住它。（当 `$D` 不在 base 上时，「identical to base」这句应读作「本检出里没有记录到改动」；脚本措辞可以改成 `*(no change in this checkout)*`。）

### 4.5 可选加固（建议，非必需）

- **查拷贝**：把 `$D` 里每处交付物与主检出同路径做 `sha256sum` 比对；四份长文件里任何一份完全相同，基本等同于拷贝，而协议明令禁止（「不许 `git show main:`、不许从上一轮或主检出拷贝」）。报为硬失败并列出路径。
- **查补偿器内容**：`grep -q fms_voucher "$D/$JAVA_OUT/YudaoLocalCompensators.java"`——recipe 要求 `resultType()` 回模块自己的结果类型。主检出自己那份今天就会挂在这一条上，这也就把第 4 处的缺口独立于 `git status` 又证了一次。

---

## 5. 脚本与 runbook 的修改建议（只给建议，未落地）

英文段 §5.1–§5.3 已按「文件 / 行号 / 原文 → 建议」逐条给出 Diff A–L；中文段只列要点与必须遵守的约束，内容以英文段为准，避免两份并存的代码块互相漂移。

| Diff | 文件 | 位置 | 要点 |
|---|---|---|---|
| A | `w14-second-run-1123.sh` | 第 287 行 | 子命令表加入 `ready` |
| B | 同上 | 第 15、36 行 | 用法头的中英两段各加一行 `ready` 说明 |
| C | 同上 | 第 107 行后 | 新增 `DELIVS` + `cmd_ready` |
| D | 同上 | 第 231–235 行 | `cmd_gate` 开头：门禁脚本不在就 `die`，**不写 `T1`** |
| E | 同上 | 第 254–256 行 | `cmd_counts` 开头：交付物不在就 `die`，不写全 0 的 `counts.txt` |
| F | 同上 | 第 76–78 行 | 端口匹配改为 `[:.]$1 +.*LISTENING`，兼顾 `0.0.0.0` |
| G | 同上 | 第 239–240 行后 | `okn`/`fails` 补 `:-0` |
| H | `w14-second-run-1123.md` | §0 表格 | 增加「写入锚点」一行，明确 recipe §0 的锚点本轮不适用 |
| I | 同上 | §2 ② 表格后（第 69 行） | 增加 `ready N` 步骤与失败处置 |
| J | `SKILL.md` | 第 39–48 行 | 每轮步骤插入 `ready N`，并顺延编号 |
| K | 同上 | 第 27–29 行 | 第 0 阶段：把 11-26 悬空 `T0` 改名，11-26 的日志移入 `void-1126/` |
| L | 同上 | 第 54 行 | 验收句增加「两轮 `steps.log` 各有位于 `T0` 与 `T1` 之间的 `ready OK`」 |

**改完必须跑的语法检查**（无输出、exit 0 才算过）：

```bash
bash -n D:/Rain6fish/handoff/w14-second-run-1123.sh
```

**行为冒烟测试**（放在第四次窗口前的准备阶段，不要在窗口里做）：

```bash
D=D:/Rain6fish/.w14-r2/round1 bash D:/Rain6fish/handoff/w14-second-run-1123.sh ready 1   # 预期 exit 2 且列出五处问题
```

再在 `.w14-r2/dryrun/` 下建一个一次性 clone，把五处放齐，跑一次预期 `ready OK`，然后删掉该目录。往 dryrun 里拷贝是允许的——它不是测量检出。

---

## 6. 第四次窗口前置清单——与 `w14-ready-1126.md` 的差异项

11-26 判为「满足」的项目，除下列各项外 11-27 仍然满足（两轮检出仍在 `cdae38ea`、干净、无 `target/`；无 `w14r*` 容器；48086 空闲；4J 四包在位；recipe marker 未变）。

| # | 项 | `w14-ready-1126.md` 的说法 | 2026-11-27 实测 | 第四次窗口前做什么 | 谁 |
|---|---|---|---|---|---|
| Q1 | 作者在场**并真的落笔** | P1：在场并回「在场」 | 三次回话，一字未写 | 保留 P1，并加一条：作者接受每次「写完了」之后的 `ready` 检查；检查失败不算窗口错过，算「继续写」 | 用户 / 会话 |
| Q2 | 灭屏 | P2：改为从不 | **仍是 `VIDEOIDLE AC = 0x000000b4`（180 秒）**；`STANDBYIDLE AC = 0` | 真的改：`powercfg -change -monitor-timeout-ac 0`，再用 `powercfg -q SCHEME_CURRENT SUB_VIDEO VIDEOIDLE` 复核为 `0x00000000` | 用户 |
| Q3 | 不要在作者写的中途结束回合 | 无此项 | 回合 21:30:07 结束 → 21:32:40 进待机 | 要么先把 Q2 改掉，要么作者必须持续回话；树还空着时，会话不得默默结束回合 | 会话 |
| Q4 | `round1/times.txt` 状态 | P14：11-25 的旧 T0 已改名 | `T0=2026-11-26T21:29:59+0800`，**无 `T1`、无 VOID** | 第 0 阶段改名为 `times-void-20261126b.txt`（Diff K） | 会话 |
| Q5 | 证据目录 | 干净 | 有 11-26 的 `build.log`（50 KB）、`gate.log`、`host.log`、`host.pid`、`sql-*.log`、若干 void `times-*` | 把 11-26 产物移入 `round1/void-1126/`；`env.txt` 重采 | 会话 |
| Q6 | 交付物落点检查 | 无 | 无 | 按 Diff A–C、I、J 加上 `ready`，并在准备阶段冒烟测试 | 会话 + 用户 |
| Q7 | 并发重负载 | P17：无 | v0.1.21 三个发布窗口重叠；21:30:55 主检出出过提交 `5a204b2348` | 选一个**完全没有发布/推送任务**的窗口；若 v0.1.21 的后续仍落在同一晚，改期 | 用户 |
| Q8 | 别的会话不得碰轮检出 | 无此项 | `round1/.git` 的 mtime 是 11-27 12:05（有别的进程在里面跑过 git） | 立为规矩；`check N` 能抓脏树，但抓不住「被提交」——`check` 已断言 `HEAD == base`，保留 | 会话 |
| Q9 | 触发器 | 任务 `w14-second-1126-2030` | `enabled=false`，一次性，已用掉 | 为选定日期新建一次性任务，或手开会话 | 用户 |
| Q10 | 作者自己的干跑 | 无此项 | — | 窗口前，作者往 `.w14-r2/dryrun/` 写五个占位文件，证明编辑器与路径是他以为的那个；完了删掉。这是唯一直接冲着根因去的一条动作 | 用户 |
| Q11 | 重启规则 | 隐含 | 21:29:59 那次重启背后没有规则 | 采用 §4.3：`ready` 失败时保留 `T0`；只有作者声明「丢掉那段不是在写」并记入读数，才允许新 `T0` | 用户裁定 |

---

## 7. 本文件不宣称

- 任何一次 W1.4 尝试都没有 time-to-green 读数；本文件不支持「更快」或「更慢」。W1.4 第二轮仍未证。
- `times-void-1126a.txt` 里的 11 分 12 秒不是读数；`times.txt` 里悬空的 `T0=2026-11-26T21:29:59+0800` 不得算成任何时长。
- 「作者什么都没写」只对 `D:/Rain6fish`（全树）与 `C:/Users/6fish`（深度 ≤6）成立；这两个根之外**未核**；编辑器里未保存的缓冲区根本观测不到。
- §3-A 里 recipe §0 那个机制，是**有真实矛盾支撑的合理机制**，不是对作者行为的已证叙述。20:56:52 到 20:59:10 之间作者做了什么**未核**；已证的只有「什么都没被写下来」。
- 未重跑窗口；未起停容器、未构建、未起宿主；未改任何定时任务、电源设置或仓库文件；未提交、未推送、未联系任何人。唯一的写入是本文件。
- 建议的 diff 只在 `C:/Users/6fish/AppData/Local/Temp/w14scan/` 的临时副本里验过语法与行为；`handoff/` 下的脚本与 runbook 一个字都没动。
