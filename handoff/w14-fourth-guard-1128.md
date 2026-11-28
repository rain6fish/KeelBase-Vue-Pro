# W1.4 fourth-window pre-fix — landing guard and one write anchor / W1.4 第四次窗口前置修复 —— 落地校验与唯一写入锚点

- **Nature**: implementation of the two fixes proposed in `w14-fourth-fix-1127.md`. No window was run, no stack was started, no scheduled task was created or triggered, no repository source was modified, nothing was committed or pushed.
- **Written**: 2026-11-28 08:00–08:20 (+08).
- **Inputs**: `w14-fourth-fix-1127.md` (§0 conclusion, §4 check, §5 diffs, §6 prerequisites); `D:/Rain6fish/handoff/w14-recipe-1124.md` §0; `D:/Rain6fish/handoff/w14-second-run-1123.sh` (unchanged name, 294 lines before this edit); `D:/Rain6fish/handoff/w14-second-run-1123.md`; `C:/Users/6fish/.claude/scheduled-tasks/w14-second-1126-2030/SKILL.md`; both round checkouts at `D:/Rain6fish/.w14-r2/round{1,2}` (HEAD `cdae38ea`, clean, no FMS deliverable); `powercfg` readings; the scheduled-task list.
- **Files touched**: four, all outside any git source tree — the run script, the recipe, the runbook, the scheduled-task note.

---

## 0. What changed

| File | Change |
|---|---|
| `D:/Rain6fish/handoff/w14-second-run-1123.sh` | new `ready <N>` subcommand (the landing check); `gate` and `counts` now refuse to run or write when the deliverables are absent; usage header in both languages; dispatch table and usage-print range updated |
| `D:/Rain6fish/handoff/w14-recipe-1124.md` | §0: a dated exception clause — for a measured round the write anchor is the round checkout, not the main checkout |
| `D:/Rain6fish/handoff/w14-second-run-1123.md` | §0 table: a `写入锚点` row; §2: a new step ②b `ready N` between writing and the stack |
| `C:/Users/6fish/.claude/scheduled-tasks/w14-second-1126-2030/SKILL.md` | per-round step list: the tree is named in step 3, `ready N` is the new step 4, later steps renumbered; the acceptance sentence now requires one `ready OK` per round |

The script grew from 294 to 367 lines; nothing existing was restructured. Left alone on purpose (all documented in `w14-fourth-fix-1127.md` §2.7 as separate defects): the `127.0.0.1`-only port matching, the empty-string arithmetic in `okn`/`fails`, and the copy-detection / compensator-content hardening (§4.5 of that note).

---

## 1. The guard

### 1.1 What `ready <N>` checks, per deliverable

1. **Exists** under the round checkout.
2. **Non-empty**.
3. **Is a change in this checkout** — `git status --porcelain -uall -- <paths>` mentions it. This is the clause that matters: existence alone also passes the main checkout, where four of the five files already sit as committed work.
4. **Content spot checks**: `yudao-server/pom.xml` really has `yudao-module-fms` outside comments (comments are stripped before matching), and `scripts/run-fms-voucher-scenarios.mjs` parses under `node --check`.

### 1.2 On failure

- One timestamped block in `steps.log` and on the console listing every finding with its **absolute** path (`MISSING`, `EMPTY`, `NO-CHANGE-VS-BASE`, `POM-STILL-COMMENTED`, `GATE-SYNTAX-ERROR`).
- One line appended to `times.txt`: `VOID=<ts> reason=ready-failed (no T1 recorded; T0 unchanged)`.
- Exit code 2. The script does not run stack / build / host / gate, does **not** write `T1`, and does **not** touch `T0` — the clock runs from "the author started writing", so a failed check means the writing is not finished (the rule in `w14-fourth-fix-1127.md` §4.3).

### 1.3 On success

- `READY_OK=<ts> root=<round checkout>` in `times.txt`, `ready OK` in `steps.log`, exit 0.

### 1.4 Secondary guards (same failure class)

- `gate` refuses when `scripts/run-fms-voucher-scenarios.mjs` is absent — that is where the 11-26 round wrote a `T1` for a gate that never executed one assertion.
- `counts` refuses when the Java files or the gate script are absent — that is where an all-zero `counts.txt` would have been written.

### 1.5 Cost

Measured on this machine, where **one external process costs ~4–5 s** (`date` 4.7 s, `git status` on the real `round1` 5.0 s): a `ready` run takes **19–24 s** end to end. The check sits inside the timed window, so it was written to spawn as little as possible: one `git status` for all five paths (not five), builtin `case` matching instead of `grep`, and a single `log` call per run. A first draft that logged per item and grepped per file took ~40–50 s and was replaced.

### 1.6 What it does not do

- It does not make the author write; it only makes the cost of finding out 20 seconds instead of 8 m 53 s, and repeats the absolute path at the moment it matters.
- It does not hash-compare against the main checkout (the anti-copy hardening of §4.5 was not implemented).
- It is not enforced inside `stack`/`build`/`host`; the runbook and the task note both put `ready` between writing and the chain, and `gate`/`counts` carry their own guards.

---

## 2. The two anchors — how the conflict was resolved

The protocol named two write anchors: the session message at 20:56:57 said `D:/Rain6fish/.w14-r2/round1`, while `w14-recipe-1124.md` §0 line 32 said every path in it is relative to `D:\Rain6fish\KeelBase-Vue-Pro` — a tree that already contains four of the five deliverables.

**Resolution: keep the recipe's general anchor and name the exception explicitly.** A dated clause in §0 now states that for a measured round (the W1.4 line) the five places are written in the round checkout `D:/Rain6fish/.w14-r2/roundN`, that the main-checkout anchor does not apply there, and that on conflict the round checkout wins. The runbook gains a `写入锚点` row saying the same, and the task note names the tree at step 3.

Reason for keeping rather than deleting the general sentence: the recipe is a single-source document handed to cold readers on other machines and checkouts, where the main checkout (or a copy of it) really is the working tree; deleting the sentence would leave that case with no anchor at all. The concrete round is fixed by the runbook, so it is the runbook's job to say so — the recipe only has to stop contradicting it.

---

## 3. Dry run (no window, no stack)

The real script was not executed against the real round checkouts — a failed `ready` there would append a `VOID` line to `round1/times.txt`, which is evidence. Instead a byte-identical copy was made and its `WORK` / `EVID` lines redirected:

```
$ sed -e 's#^WORK="\$ROOT/.w14-r2"#WORK=".../w14guard-1128/work"#' \
      -e 's#^EVID="\$ROOT/handoff/w14-second-1124"#EVID=".../w14guard-1128/evidence"#' \
      /d/Rain6fish/handoff/w14-second-run-1123.sh > $S/guard.sh
```

`$S` = `C:/Users/6fish/AppData/Local/Temp/w14guard-1128`. The fixture is a small git repo whose base commit has the pristine `pom.xml` (dependency commented) and a compensator file without any FMS bean, and no `FmsVoucher*` / `run-fms-*.mjs`. Two clones of it stand in for the round checkouts; the five deliverables were then written into clone 2 only. Syntax of the real script: `bash -n` prints nothing, exit 0.

**Test 1 — empty tree must stop and leave `T0` alone** (round 1, `times.txt` pre-seeded with a `T0`):

```
[2026-11-28T08:11:17+0800] ready: FAIL — 6 finding(s) in .../work/round1. Do NOT run stack/build/host/gate, no T1. Fix them, then run: ready 1
  NO-CHANGE-VS-BASE .../round1/yudao-server/pom.xml (this checkout records no change to it)
  MISSING           .../round1/yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/FmsVoucherGovernance.java
  MISSING           .../round1/yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/FmsVoucherTools.java
  NO-CHANGE-VS-BASE .../round1/yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/YudaoLocalCompensators.java (this checkout records no change to it)
  MISSING           .../round1/scripts/run-fms-voucher-scenarios.mjs
  POM-STILL-COMMENTED .../round1/yudao-server/pom.xml (yudao-module-fms is still inside a comment)
ERROR: deliverables are not in .../work/round1
exit=2  elapsed=20s
--- times.txt ---
T0=2026-11-28T20:00:00+0800
VOID=2026-11-28T08:11:10+0800 reason=ready-failed (no T1 recorded; T0 unchanged)
```

**Test 2 — complete tree must pass** (round 2, five deliverables written):

```
[2026-11-28T08:11:45+0800] ready OK: all five deliverables present, non-empty and changed in .../work/round2
exit=0  elapsed=24s
--- times.txt ---
READY_OK=2026-11-28T08:11:39+0800 root=.../work/round2
```

**Test 3 — edited but still commented pom must fail on content, not on absence** (round 1): the pom is modified (so `NO-CHANGE-VS-BASE` no longer fires for it) but `yudao-module-fms` stays inside a comment:

```
[2026-11-28T08:12:09+0800] ready: FAIL — 5 finding(s) ...
  MISSING .../FmsVoucherGovernance.java
  MISSING .../FmsVoucherTools.java
  NO-CHANGE-VS-BASE .../YudaoLocalCompensators.java (this checkout records no change to it)
  MISSING .../run-fms-voucher-scenarios.mjs
  POM-STILL-COMMENTED .../yudao-server/pom.xml (yudao-module-fms is still inside a comment)
exit=2  elapsed=19s
```

**Test 4 — the two secondary guards, on the empty tree:**

```
ERROR: gate script missing in .../work/round1 — no deliverable landed; no T1 recorded (run: ready 1)
gate exit=2
ERROR: counts: deliverables missing in .../work/round1 — refusing to write an all-zero counts.txt (run: ready 1)
counts exit=2
--- times.txt (contains no T1) ---
T0=2026-11-28T20:00:00+0800
VOID=... (two lines)
--- round1 counts.txt: absent ---
```

Both checkouts' `git status` was empty before each run except for the deliverables under test, and `round1/times.txt` still begins with the seeded `T0` after all four tests — no `T0` and no `T1` was written by the guard.

---

## 4. What the fourth window still lacks

| # | Item | State on 2026-11-28 08:20 | Who |
|---|---|---|---|
| W1 | Date and owner of the fourth window | **undecided** — the D4 ruling of 11-27 was "keep as is, no third-failure rule", not "schedule it" | 用户 |
| W2 | Trigger | task `w14-second-1126-2030` is `enabled=false`, one-shot, spent; no successor task exists | 用户 |
| W3 | Monitor timeout | **still `0x000000b4` (180 s)** and DC also `0x000000b4`; standby AC is `0` | 用户 |
| W4 | Evidence directory | **done 2026-11-28 11:36 / 11:38** — the 11-26 `build.log`, `gate.log`, `host.log`, `host.pid`, `sql-*.log`, `env.txt` sit in `round1/void-1126/`; `round2/env.txt` (11-26 20:32) sits in `round2/void-1126/`. `steps.log` and the three `times-void-*` files stay at the top (reports cite them) | — |
| W5 | `times.txt` state | **done** — `times-void-1126a.txt` / `times-void-1126b.txt` exist, and `round1/steps.log` already carries a 11-27 19:31 entry recording the second attempt as VOID | — |
| W6 | Author accepts the landing gate | not yet stated; a failed `ready` is a rewrite, not a window miss | 用户 |
| W7 | Author's own dry run (5 placeholder files into a scratch tree) | not done; this is the one action aimed at the root cause | 用户 |
| W8 | No concurrent release/push task | must be true in the chosen evening; on 11-26 three v0.1.21 windows overlapped the round | 用户 |
| W9 | Other sessions must not touch the round checkouts | rule stated nowhere yet | 会话 |
| W10 | Restart rule | adopt `w14-fourth-fix-1127.md` §4.3 as written: `T0` stays on a failed `ready`; a fresh `T0` only on the author's recorded statement that the discarded segment was not writing | 用户裁定 |

Both round checkouts were re-verified while writing this note: `HEAD=cdae38ea3850298e9829e574fddaebf2a7d40a63`, `git status --porcelain` empty, no `FmsVoucher*` / `run-fms-*.mjs`, `yudao-server/pom.xml:207` still commented.

---

## 5. What this note does not claim

- No window was run; no container, build or host was started; no `w14r*` resource was touched. The two round checkouts were read only.
- The guard was exercised against a scratch fixture, not against the real round checkouts; running it there would have written a `VOID` line into `round1/times.txt`.
- The scratch directory `C:/Users/6fish/AppData/Local/Temp/w14guard-1128` is a throwaway and is not evidence.
- The 19–24 s cost is this machine's, under today's load; it is identical for both rounds, so it does not break comparability between them.
- Nothing was committed or pushed; no scheduled task, power setting or repository source was changed. The four files above are the only writes, plus this note. Afterwards, at the user's instruction, the 11-26 artifacts were moved into `round1/void-1126/` and `round2/void-1126/`, with one housekeeping line appended to each `steps.log` (see W4); those are moves inside the evidence directory, nothing else was touched.

---
---

# W1.4 第四次窗口前置修复 —— 落地校验与唯一写入锚点

- **性质**：把 `w14-fourth-fix-1127.md` 提的两件事落地。未跑窗口、未起栈、未创建或触发定时任务、未改任何仓的源码、未提交、未推送。
- **写作时点**：2026-11-28 08:00–08:20（+08）。
- **输入**：`w14-fourth-fix-1127.md`（§0 结论、§4 检查、§5 diff、§6 前置项）；`D:/Rain6fish/handoff/w14-recipe-1124.md` §0；`D:/Rain6fish/handoff/w14-second-run-1123.sh`（文件名未变，改前 294 行）；`D:/Rain6fish/handoff/w14-second-run-1123.md`；`C:/Users/6fish/.claude/scheduled-tasks/w14-second-1126-2030/SKILL.md`；两轮检出 `D:/Rain6fish/.w14-r2/round{1,2}`（HEAD `cdae38ea`、干净、无 FMS 交付物）；`powercfg` 读数；定时任务列表。
- **改动的文件**：四个，全在任何 git 源码树之外 —— 开跑脚本、recipe、runbook、定时任务说明。

---

## 0. 改了什么

| 文件 | 改动 |
|---|---|
| `D:/Rain6fish/handoff/w14-second-run-1123.sh` | 新增 `ready <N>` 子命令（落点校验）；`gate` 与 `counts` 在交付物缺失时拒绝执行/写数；用法头中英两段同步；子命令分发表与用法打印范围随之调整 |
| `D:/Rain6fish/handoff/w14-recipe-1124.md` | §0 增加一条带日期的例外：计量轮次的写入锚点是轮检出，不是主检出 |
| `D:/Rain6fish/handoff/w14-second-run-1123.md` | §0 表格加「写入锚点」一行；§2 在写交付物与起栈之间新增 ②b 步 `ready N` |
| `C:/Users/6fish/.claude/scheduled-tasks/w14-second-1126-2030/SKILL.md` | 每轮步骤：第 3 步点名树，新增第 4 步 `ready N`，后续顺延；验收句要求每轮各有一条 `ready OK` |

脚本由 294 行增至 367 行；原有函数一处未重构。刻意未动的（`w14-fourth-fix-1127.md` §2.7 记为独立缺陷）：只匹配 `127.0.0.1` 的端口判断、`okn`/`fails` 的空串算术、以及 §4.5 的查拷贝 / 查补偿器内容两项加固。

---

## 1. 校验逻辑

### 1.1 `ready <N>` 逐处检查四项

1. 在轮检出下**存在**；
2. **非空**；
3. **是本检出里的改动** —— `git status --porcelain -uall -- <五处路径>` 里有它。这一条是关键：只看存在，主检出也会过，而主检出里本来就有其中四处；
4. **内容抽查**：`yudao-server/pom.xml` 的 `yudao-module-fms` 确实在注释之外（先剥注释再匹配）；`scripts/run-fms-voucher-scenarios.mjs` 能过 `node --check`。

### 1.2 不通过时

- 向 `steps.log` 与控制台输出**一条**带时间戳的块，逐条列出问题，路径一律**绝对**（`MISSING` / `EMPTY` / `NO-CHANGE-VS-BASE` / `POM-STILL-COMMENTED` / `GATE-SYNTAX-ERROR`）。
- 往 `times.txt` 追加一行 `VOID=<ts> reason=ready-failed (no T1 recorded; T0 unchanged)`。
- 退出码 2；不跑 stack/build/host/gate，**不写 `T1`**，**不碰 `T0`** —— 计时从作者开始写起，检查不过就是还没写完（`w14-fourth-fix-1127.md` §4.3 的规则）。

### 1.3 通过时

- `times.txt` 写 `READY_OK=<ts> root=<轮检出>`，`steps.log` 写 `ready OK`，退出码 0。

### 1.4 同类失败的另两道守卫

- `gate`：门禁脚本不在就拒绝 —— 11-26 那轮正是在这里给一个一条断言都没跑的门禁写下了 `T1`。
- `counts`：Java 或门禁脚本不在就拒绝 —— 那里本会写出一份全 0 的 `counts.txt`。

### 1.5 耗时

本机**每个外部进程约 4–5 秒**（实测 `date` 4.7 秒，在真实 `round1` 上跑一次带路径的 `git status` 5.0 秒），因此一次 `ready` 端到端 **19–24 秒**。这条检查落在计时窗口内，所以写法上尽量少起进程：五处路径共用一次 `git status`、用内建 `case` 匹配而不用 `grep`、每次运行只写一条 `log`。第一版逐条打日志、逐文件 `grep` 要 40–50 秒，已替换。

### 1.6 它不做什么

- 不会让作者动笔，只把「发现问题」的代价从 8 分 53 秒压到 20 秒，并在最要紧的时刻把绝对路径再念一遍；
- 不做与主检出的哈希比对（§4.5 的反拷贝加固未落地）；
- 不把守卫塞进 `stack`/`build`/`host`；runbook 与任务说明把 `ready` 放在写与链路之间，`gate` 与 `counts` 另带自己的守卫。

---

## 2. 两个锚点怎么解

协议里有两处写入锚点：会话 20:56:57 的消息写 `D:/Rain6fish/.w14-r2/round1`，而 `w14-recipe-1124.md` §0 第 32 行写「本文件每条路径都相对 `D:\Rain6fish\KeelBase-Vue-Pro`」—— 而那个检出里本来就有五处中的四处。

**解法：保留 recipe 的通用锚点，把例外写明。** §0 新增一条带日期的说明：计量轮次（W1.4 这一线）的五处一律写在轮检出 `D:/Rain6fish/.w14-r2/roundN`，主检出锚点在那里不适用，两者冲突时以轮检出为准。runbook 的 §0 表格加同一行「写入锚点」，任务说明第 3 步点名树。

保留而不删除那句的理由：recipe 是交给别的机器、别的检出上的冷读者用的单源文档，在那里主检出（或它的副本）确实就是工作树；删掉这句会让那种情形失去锚点。而具体是哪一轮，是 runbook 定的，就该由 runbook 说出来 —— recipe 只需要不再和它矛盾。

---

## 3. 干跑（不跑窗口、不起栈）

没有拿真实的轮检出跑真脚本 —— 在那里失败会往 `round1/times.txt` 追加一行 `VOID`，而那是证据。做法是复制一份脚本、只把 `WORK` / `EVID` 两行重定向：

```
$ sed -e 's#^WORK="\$ROOT/.w14-r2"#WORK=".../w14guard-1128/work"#' \
      -e 's#^EVID="\$ROOT/handoff/w14-second-1124"#EVID=".../w14guard-1128/evidence"#' \
      /d/Rain6fish/handoff/w14-second-run-1123.sh > $S/guard.sh
```

`$S` = `C:/Users/6fish/AppData/Local/Temp/w14guard-1128`。夹具是一个小 git 仓：base 提交里 `pom.xml` 是注释态、补偿器文件没有 FMS bean、没有 `FmsVoucher*` 与 `run-fms-*.mjs`；它的两个克隆分别充当两轮检出，五处只写进克隆 2。真脚本 `bash -n` 无输出、退出 0。

**测 1 —— 空树必须停、且不碰 `T0`**（轮 1，`times.txt` 预置了一条 `T0`）：退出码 2，一条块列出 6 项（4 处缺、2 处相对 base 无改动、pom 仍注释），`times.txt` 保持原 `T0` 并追加一行 `VOID`，耗时 20 秒。输出逐字见英文段 §3。

**测 2 —— 齐备必须放行**（轮 2）：`ready OK`，`times.txt` 写 `READY_OK=`，退出码 0，耗时 24 秒。

**测 3 —— pom 改过但依赖仍注释**（轮 1）：pom 的 `NO-CHANGE-VS-BASE` 不再出现（它确实被改过），但 `POM-STILL-COMMENTED` 照常触发，整体仍失败，退出码 2，耗时 19 秒。

**测 4 —— 另两道守卫**（空树）：`gate` 以「gate script missing」拒绝、退出码 2；`counts` 以「refusing to write an all-zero counts.txt」拒绝、退出码 2；`times.txt` 里没有任何 `T1`，`counts.txt` 未被创建。

四次运行前后，除被测交付物外两棵树的 `git status` 均为空；跑完四项后 `round1/times.txt` 仍以预置的 `T0` 开头 —— 守卫一次都没有写 `T0` 或 `T1`。

---

## 4. 第四次窗口还差什么

| # | 项 | 2026-11-28 08:20 的状态 | 谁 |
|---|---|---|---|
| W1 | 第四次窗口的时点与责任人 | **未定** —— 11-27 的 D4 裁定是「维持现状、不立第三次失败规则」，不是「排期」 | 用户 |
| W2 | 触发器 | 任务 `w14-second-1126-2030` 为 `enabled=false`、一次性、已用掉；后继任务尚未创建 | 用户 |
| W3 | 灭屏 | **仍是 `0x000000b4`（180 秒）**，DC 同为 `0x000000b4`；待机 AC 为 `0` | 用户 |
| W4 | 证据目录 | **已完成（11-28 11:36 / 11:38）** —— 11-26 的 `build.log` / `gate.log` / `host.log` / `host.pid` / `sql-*.log` / `env.txt` 已移入 `round1/void-1126/`；`round2/env.txt`（11-26 20:32）已移入 `round2/void-1126/`。`steps.log` 与三份 `times-void-*` 留在顶层（报告要引用它们） | — |
| W5 | `times.txt` 状态 | **已完成** —— `times-void-1126a.txt` / `times-void-1126b.txt` 已在，`round1/steps.log` 里也有一条 11-27 19:31 的 VOID 记录 | — |
| W6 | 作者接受落点校验 | 尚未表态；校验失败算「继续写」，不算窗口错过 | 用户 |
| W7 | 作者自己的干跑（往临时树写五个占位文件） | 未做；这是唯一直接冲着根因的一条动作 | 用户 |
| W8 | 当晚无发布/推送任务 | 选定的那个晚上必须成立；11-26 就有三个 v0.1.21 窗口与本轮重叠 | 用户 |
| W9 | 别的会话不得碰轮检出 | 这条规矩尚未落到任何文件 | 会话 |
| W10 | 重启规则 | 采纳 `w14-fourth-fix-1127.md` §4.3：`ready` 失败时保留 `T0`；只有作者声明「丢掉那段不是在写」并记入读数，才允许新 `T0` | 用户裁定 |

写本文件时复核过两轮检出：`HEAD=cdae38ea3850298e9829e574fddaebf2a7d40a63`、`git status --porcelain` 为空、无 `FmsVoucher*` / `run-fms-*.mjs`，`yudao-server/pom.xml:207` 仍是注释态。

---

## 5. 本文件不宣称

- 未跑窗口；未起停容器、构建或宿主；未碰任何 `w14r*` 资源。两轮检出只读。
- 守卫只在临时夹具上验过，没有对真实轮检出执行 —— 在那里跑会把一行 `VOID` 写进 `round1/times.txt`。
- `C:/Users/6fish/AppData/Local/Temp/w14guard-1128` 是一次性目录，不是证据。
- 19–24 秒是本机当前负载下的读数；两轮相同，不影响两轮之间的可比性。
- 未提交、未推送；未改任何定时任务、电源设置或仓内源码。除上述四个文件之外，唯一的写入是本文件。此后经用户指示，把 11-26 的产物移入 `round1/void-1126/` 与 `round2/void-1126/`，并在两轮各自的 `steps.log` 追加一条整理记录（见 W4）；这只是证据目录内的移动，其余未动。
