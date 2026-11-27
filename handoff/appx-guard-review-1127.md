# App-X compile guard — independent review (2026-11-27)

Read-only review of the App-X false-green guard, prepared for the 12-05 check.
Target as briefed: branch `claude/appx-compile-guard-1126-4e8f94`, commit `5983f3b` on top of `cc8b1a3`.
Reviewer did not merge, push, edit the App-X repo, start the VM, or commit anything.

---

## 0. The brief's premise is stale — read this first

The branch is **no longer pending**. In `D:/Rain6fish/KeelBase-App-X` right now:

```
d939527 (HEAD -> main, origin/main)  ci(compile): run the guard's self-test on every push
bda11b1                              Merge the App-X compile-guard: a silent HBuilderX fails
5983f3b (claude/appx-compile-guard-1126-4e8f94)  ci(compile): fail closed on a silent HBuilderX
cc8b1a3                              ci(compile): fail closed when HBuilderX compiles nothing
```

`5983f3b` is an ancestor of `main`; the merge commit `bda11b1` has parents `cc8b1a3` and `5983f3b`; `main` was then pushed and now carries one further commit, `d939527`, which adds a `windows-latest` self-test job to `.github/workflows/compile.yml`. The branch itself was never pushed to a remote (no `origin/claude/...` ref exists).

So the question "may this be merged safely?" has already been answered by events. The useful question for 12-05 is: **is the code that is now on `main` actually fail-closed?** This review answers that, and the verdict below is about the content, not about a merge decision.

---

## 1. What the commit changes

`5983f3b` touches exactly two files, both under `scripts/`, and no workflow:

| file | change |
|---|---|
| `scripts/ci-compile.ps1` | +37 / −7 — guard logic |
| `scripts/ci-compile.test.ps1` | new, 60 lines — self-test with fake CLIs |

Current guard logic on `main` (`scripts/ci-compile.ps1`):

| line | behaviour |
|---|---|
| 6–8 | no `HBUILDERX_HOME` / `-HBuilderX` → `throw` (non-zero) |
| 11–16 | resolve `cli.exe`; if absent fall back to `cli.cmd` (test seam) |
| 17–20 | neither exists → stderr message, `exit 1` |
| 31–35 | relax `$ErrorActionPreference` to `Continue`, run the CLI with `2>&1`, capture `$LASTEXITCODE` |
| 40–43 | exit code ≠ 0 → `exit $code` (passed through verbatim) |
| 45–48 | output contains `未检测到已打开` → `exit 1` |
| 53–57 | none of `编译成功` / `UTS编译完毕` / `ready in \d+\s*ms` → `exit 1` |
| end of file | falls through → success |

Both scripts start with a UTF-8 BOM (`ef bb bf` verified on disk), which is what keeps Windows PowerShell 5.1 from mis-parsing the bilingual comments.

The original failure (run `44976731215`: CLI prints "未检测到已打开的HBuilderX", compiles nothing, exits 0, job green) is covered on three independent levels: the explicit phrase check (45–48), the marker requirement (53–57), and — belatedly — a red result from any non-zero exit.

---

## 2. Can it still be bypassed? Case by case

Measured on Windows PowerShell 5.1, with the CI-shaped preamble (`$ErrorActionPreference = 'Stop'` then `& script; exit $LASTEXITCODE`). Repros live in `D:/Rain6fish/tmp/appx-guard-review-1127/` (host temp, not in either repo).

| case | expected | measured | path in code | verdict |
|---|---|---|---|---|
| `HBUILDERX_HOME` unset or empty | non-zero | 1 | 6–8 | fail closed |
| HBuilderX dir empty / no `cli.*` | non-zero | 1 | 17–20 | fail closed |
| CLI exits 0, no marker (silent no-op) | non-zero | 1 | 53–57 | fail closed |
| CLI exits 0 with empty output | non-zero | 1 | 53–57 | fail closed |
| CLI exits 0, prints `未检测到已打开…` | non-zero | 1 | 45–48 | fail closed (message reached only under UTF-8 decoding; otherwise 53–57 catches it) |
| CLI exits 2 | 2 | 2 | 40–43 | passed through |
| CLI prints a success marker **and** exits 1 | non-zero | 1 | 40–43 | exit code wins — fail closed |
| CLI exits 0, prints only `ready in 5ms`, produces **no artifacts** | *should be red* | **0 (green)** | 53–57 accepts the marker; nothing inspects the tree | **blind spot — known, documented in the 11-26 report §5.3** |
| **`cli.exe` exists but cannot execute** (e.g. truncated / quarantined / wrong architecture) | non-zero | **0 (green)** | 33 fails as a *non-terminating* error (EAP was relaxed to `Continue` at 32); `$LASTEXITCODE` stays `$null`; `$null -ne 0` is true at 40; `exit $null` at 42 exits **0** | **real false-green hole** |
| CLI hangs | never green | job hangs until the Actions default (360 min), then fails | no timeout in the script; no `timeout-minutes` on the job | never green, but it blocks a self-hosted runner for 6 h |

The "cannot execute" case is the important one. It is not hypothetical: any way of ending up with a stale, zero-byte, AV-quarantined or wrong-arch `cli.exe` makes the guard green **without compiling** — the exact failure class this whole change exists to stop. It is not a regression: the baseline `cc8b1a3` had the same `if ($code -ne 0) { exit $code }` shape, so the hole was inherited. It does mean the guard is not yet fail-closed in the full sense.

The artifact blind spot is different in kind: the guard judges the CLI's words, not its works. A CLI that claims success is believed. That was declared out of scope in the 11-26 report; it stays out of scope here, but it should be an explicit accepted risk rather than an implicit one.

---

## 3. Relationship to `main` and to other workflows

- `5983f3b` is a single commit on top of `cc8b1a3`; it touches only `scripts/ci-compile.ps1` and adds `scripts/ci-compile.test.ps1`.
- No workflow file is in the commit. `.github/workflows/compile.yml` is untouched by the branch — `git diff claude/appx-compile-guard-1126-4e8f94 main` shows the only difference is the 13 lines that `d939527` added after the merge.
- The merge `bda11b1` was clean (two parents, both files taken as-is, no conflict resolution content).
- `d939527` adds `compile-guard-self-test` on `windows-latest` (`.github/workflows/compile.yml:50-61`). It does not alter the existing jobs, but it does mean every push now runs the test on a hosted Windows machine.
- State of the gate itself: `android-compile` is still guarded by `if: vars.APPX_WINDOWS_RUNNER == 'true'` (`.github/workflows/compile.yml:27`). Per the 11-26 report that variable was unset and the runner `offline`, so **the guard script is not currently executing in CI at all** — only its self-test is. Nothing has been gated by it since it landed.

---

## 4. The three mock cases: where the evidence is, and whether it can be re-run

- The tests are in the repo: `scripts/ci-compile.test.ps1` (cases `ide-not-running`, `compile-succeeds`, `cli-exit-1`).
- The recorded readings are in `D:/Rain6fish/handoff/appx-compile-guard-1126.md` §3.1 (PS 5.1), §3.2 (pwsh 7.7.0), §3.3 (explicit branch under UTF-8), §3.4 (CI shape).
- **Re-run this review, read-only:** both pass unchanged.

```
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/ci-compile.test.ps1   → 3/3 PASS, exit 0
D:/Rain6fish/tmp/guard-probe-1126/pwsh7/pwsh.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/ci-compile.test.ps1 → 3/3 PASS, exit 0
```

The repo stayed clean afterwards (`git status --porcelain` empty); only `%TEMP%` was written.

**Coverage gap found while re-running:** on both PS 5.1 and pwsh 7, case `ide-not-running` does *not* reach the explicit branch at lines 45–48 — it falls through to the "no compile success marker" branch at 53–57. The printed error confirms it (`HBuilderX reported no compile success…` rather than `HBuilderX IDE is not running…`). The explicit branch works when decoding is UTF-8 (verified separately), but the committed test never exercises it in either default environment — so a green self-test in CI does not prove the 45–48 branch is intact. The 11-26 report notes this in §3.3, but the test itself was not adjusted.

There is also no case for: missing `cli`, empty output, a non-zero exit other than 1, a success marker combined with a non-zero exit, or the "cannot execute" case above.

---

## 5. The real-compile gap

Unchanged from 11-26, and still the load-bearing gap:

- HBuilderX is not installed on the host (`C:/Develop/HBuilderX` does not exist here); it lives only in the VM.
- The self-hosted runner job is switched off by the repository variable, and the runner was reported `offline`.
- The VM was frozen on the welcome screen and never reached the desktop.
- Therefore **no real `cli.exe` has ever run through this guard**. Everything above is logic-level evidence plus fake CLIs; nothing proves App-X compiles today, and nothing proves the marker strings survive real HBuilderX output on the runner.
- GitHub API was unreachable from this host (`TLS handshake timeout` / `EOF` on runs, variables and runners), so whether `compile-guard-self-test` has ever run green on `d939527` is **unverified**.

---

## 6. Verdict: 需修（附必改项）— "needs fixes", not "mergeable as is"

The change is a large improvement and the direction is right: the original false green is closed on three paths, the exit code is now passed through faithfully, no workflow was disturbed, and the content is already on `main` via a clean merge. It cannot yet be called fail-closed.

Must fix before 12-05 can record "the guard fails closed":

- **M1 — `$null` exit code turns green.** `scripts/ci-compile.ps1:40-42`. When `& $cli` fails to start, `$LASTEXITCODE` is `$null`, `$null -ne 0` is true, and `exit $null` exits 0. Add, immediately after line 34: if `$LASTEXITCODE` is null (or not an integer), print and `exit 1`. Reproduce with `D:/Rain6fish/tmp/appx-guard-review-1127/badpe` (a text file named `cli.exe`).
- **M2 — no timeout.** Neither the script nor `android-compile` has one; a hung CLI ties up the self-hosted runner for 6 hours before failing. Add `timeout-minutes` to the job (and consider wrapping the CLI call).
- **M3 — decide the artifact question explicitly.** Either add a cheap post-condition (e.g. `unpackage/dist/build/app-android` exists and is non-empty) or record in the report/README that "CLI says success" is the accepted standard. Right now it is only in a handoff note.

Recommended (not blocking):

- **S1 — make the self-test hit the explicit branch.** Force UTF-8 decoding for the `ide-not-running` case, or add a fourth case, so CI proves lines 45–48 work.
- **S2 — the `cli.cmd` fallback is production code that exists only for tests** (`:12-16`). A stale `cli.cmd` next to a broken `cli.exe` would be executed. Gate it behind a test-only switch, or check for it only when an explicit flag is passed.
- **S3 — add cases for** missing CLI, empty output, exit 2 passthrough, and marker-plus-nonzero-exit.

No statement is made here about whether to merge, revert, or ship; that is the user's call. Note only that the merge already happened, so M1–M3 would land as a follow-up commit on `main`, not as changes to the branch.

---

## 7. Boundaries of this review

Read-only throughout. No merge, no push, no tag, no edit inside `D:/Rain6fish/KeelBase-App-X` (verified clean before and after), no VM start, no commit. Probes wrote only under `%TEMP%` and `D:/Rain6fish/tmp/appx-guard-review-1127/`. GitHub API was unreachable, so CI-side facts (run status, variable value, runner state) are quoted from the 11-26 report and the local workflow file, not re-verified.

---

# App-X 假绿守卫 — 独立复核（2026-11-27）

面向 12-05 复核对 App-X 假绿守卫做只读复核。
复核对象按任务简报为：分支 `claude/appx-compile-guard-1126-4e8f94`、提交 `5983f3b`（父 `cc8b1a3`）。
本次未合并、未推送、未改 App-X 仓、未启动 VM、未提交。

---

## 0. 任务简报的前提已过时——先看这段

该分支**已不再处于待合状态**。`D:/Rain6fish/KeelBase-App-X` 当前是：

```
d939527 (HEAD -> main, origin/main)  ci(compile): run the guard's self-test on every push
bda11b1                              Merge the App-X compile-guard: a silent HBuilderX fails
5983f3b (claude/appx-compile-guard-1126-4e8f94)  ci(compile): fail closed on a silent HBuilderX
cc8b1a3                              ci(compile): fail closed when HBuilderX compiles nothing
```

`5983f3b` 已是 `main` 的祖先；合并提交 `bda11b1` 的两个父提交正是 `cc8b1a3` 与 `5983f3b`；`main` 其后又推送了一笔 `d939527`，给 `.github/workflows/compile.yml` 加了一个 `windows-latest` 自测 job。分支本身从未推到远端（没有 `origin/claude/...` 引用）。

所以「能不能安全合并」这个问法，事实已经替我们回答了。对 12-05 有用的问法是：**现在落在 `main` 上的这份代码，到底是不是失败关闭？** 本复核回答的是这个，下面结论针对内容，不替用户做合并决定。

---

## 1. 这一笔改了什么

`5983f3b` 只动两个文件，都在 `scripts/` 下，不碰任何 workflow：

| 文件 | 改动 |
|---|---|
| `scripts/ci-compile.ps1` | +37 / −7 —— 守卫判据 |
| `scripts/ci-compile.test.ps1` | 新增，60 行 —— 假 CLI 自测 |

`main` 上现行的守卫逻辑（`scripts/ci-compile.ps1`）：

| 行 | 行为 |
|---|---|
| 6–8 | 没有 `HBUILDERX_HOME` / `-HBuilderX` → `throw`（非零） |
| 11–16 | 解析 `cli.exe`；不存在则回退 `cli.cmd`（测试注入点） |
| 17–20 | 两者都没有 → 写 stderr，`exit 1` |
| 31–35 | 把 `$ErrorActionPreference` 放宽为 `Continue`，带 `2>&1` 调用 CLI，取 `$LASTEXITCODE` |
| 40–43 | 退出码非 0 → `exit $code`（原样透传） |
| 45–48 | 输出含 `未检测到已打开` → `exit 1` |
| 53–57 | `编译成功` / `UTS编译完毕` / `ready in \d+\s*ms` 一个都没有 → `exit 1` |
| 文件末尾 | 顺序执行到结尾 → 通过 |

两个脚本都以 UTF-8 BOM 开头（已按字节核对 `ef bb bf`），这是 Windows PowerShell 5.1 不把中英注释错按 GBK 解析的关键。

原始失败（run `44976731215`：CLI 打印「未检测到已打开的HBuilderX」、什么都没编译、退出 0、job 判绿）现在被三层独立挡住：显式短语检测（45–48）、成功标记要求（53–57），以及任何非零退出都会红。

---

## 2. 还绕得过去吗？逐情形

在 Windows PowerShell 5.1 上实测，用 CI 同形调用（先 `$ErrorActionPreference = 'Stop'`，再 `& script; exit $LASTEXITCODE`）。复现件在 `D:/Rain6fish/tmp/appx-guard-review-1127/`（宿主机临时目录，不在任何仓内）。

| 情形 | 预期 | 实测 | 代码路径 | 判定 |
|---|---|---|---|---|
| `HBUILDERX_HOME` 未设或为空 | 非零 | 1 | 6–8 | 失败关闭 |
| HBuilderX 目录为空 / 没有 `cli.*` | 非零 | 1 | 17–20 | 失败关闭 |
| CLI 退出 0、无任何标记（静默空转） | 非零 | 1 | 53–57 | 失败关闭 |
| CLI 退出 0、输出为空 | 非零 | 1 | 53–57 | 失败关闭 |
| CLI 退出 0、打印 `未检测到已打开…` | 非零 | 1 | 45–48 | 失败关闭（消息只在 UTF-8 解码下命中；否则由 53–57 兜住） |
| CLI 退出 2 | 2 | 2 | 40–43 | 原样透传 |
| 输出带成功标记**但**退出 1 | 非零 | 1 | 40–43 | 退出码优先 —— 失败关闭 |
| 退出 0、只打印 `ready in 5ms`、**没有任何产物** | *应为红* | **0（绿）** | 53–57 只认标记；全文件不看产物 | **盲区——已知，11-26 报告 §5.3 已记** |
| **`cli.exe` 存在但无法执行**（截断 / 被杀软隔离 / 架构不符） | 非零 | **0（绿）** | 33 行是*非终止*错误（32 行已把 EAP 放宽为 `Continue`）；`$LASTEXITCODE` 保持 `$null`；40 行 `$null -ne 0` 为真；42 行 `exit $null` **退出 0** | **真实假绿通道** |
| CLI 挂起 | 永不判绿 | job 挂到 Actions 默认 360 分钟后判红 | 脚本无超时；job 无 `timeout-minutes` | 不会绿，但会占住自托管 runner 六小时 |

「无法执行」这一例最要紧。它不是假设：任何导致 `cli.exe` 变成陈旧文件、零字节、被杀软隔离或架构不符的路径，都会让守卫在**没有编译**的情况下判绿——正是这次改动要挡的那一类失败。它不是本次引入的：基线 `cc8b1a3` 同样是 `if ($code -ne 0) { exit $code }` 的形状，这个洞是继承来的。但它意味着守卫现在还不能叫「完整意义上的失败关闭」。

产物盲区性质不同：守卫信的是 CLI 的话，不是它的活。CLI 声称成功就被采信。11-26 报告已把它划到范围外，本次维持这一划法；但它应当被写成**明确接受的风险**，而不是隐含的。

---

## 3. 与 `main` 的关系、与其它 workflow 的关系

- `5983f3b` 是 `cc8b1a3` 之上的单独一笔；只改 `scripts/ci-compile.ps1`、新增 `scripts/ci-compile.test.ps1`。
- 提交里没有任何 workflow 文件。`.github/workflows/compile.yml` 不经该分支改动——`git diff claude/appx-compile-guard-1126-4e8f94 main` 的唯一差异，是合并后 `d939527` 加的那 13 行。
- 合并 `bda11b1` 干净（两个父提交，两文件原样取得，无冲突解决内容）。
- `d939527` 新增 `compile-guard-self-test`，跑在 `windows-latest`（`.github/workflows/compile.yml:50-61`）。既有 job 未改，但这意味着此后每次推送都会在托管的 Windows 机上跑一遍自测。
- 门本身的现状：`android-compile` 仍由 `if: vars.APPX_WINDOWS_RUNNER == 'true'` 把着（`.github/workflows/compile.yml:27`）。按 11-26 报告，该变量当时未设、runner `offline`，也就是说**守卫脚本目前在 CI 里根本没有执行过**——跑的只有它的自测。落地至今，没有任何一次 CI 被它挡过。

---

## 4. mock 三例：证据在哪、能否重跑

- 测试在仓内：`scripts/ci-compile.test.ps1`（`ide-not-running`、`compile-succeeds`、`cli-exit-1` 三例）。
- 读数记录在 `D:/Rain6fish/handoff/appx-compile-guard-1126.md` §3.1（PS 5.1）、§3.2（pwsh 7.7.0）、§3.3（UTF-8 下的显式分支）、§3.4（CI 形态）。
- **本次只读重跑，结论不变**：

```
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/ci-compile.test.ps1   → 3/3 PASS，退出 0
D:/Rain6fish/tmp/guard-probe-1126/pwsh7/pwsh.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/ci-compile.test.ps1 → 3/3 PASS，退出 0
```

跑完仓仍干净（`git status --porcelain` 为空），只写了 `%TEMP%`。

**重跑时发现的覆盖缺口**：PS 5.1 与 pwsh 7 下，`ide-not-running` 这一例都**没有**走到 45–48 的显式分支，而是落到 53–57 的「无成功标记」分支——打印的报错可以证明（是 `HBuilderX reported no compile success…`，不是 `HBuilderX IDE is not running…`）。显式分支在 UTF-8 解码下是通的（已单独验证），但仓内的测试在两种默认环境下都碰不到它。所以 CI 里自测变绿，**不能**证明 45–48 那条分支还完好。11-26 报告 §3.3 记了这个现象，但没有据此调整测试。

另外以下情形没有用例：缺 `cli`、输出为空、非 1 的非零退出、成功标记加非零退出、以及上面的「无法执行」。

---

## 5. 真实编译的缺口

与 11-26 一致，且仍是承重的那块：

- 宿主机没装 HBuilderX（本机 `C:/Develop/HBuilderX` 不存在），它只在 VM 里。
- 自托管 runner 的 job 被仓库变量关着，runner 报告为 `offline`。
- VM 卡在欢迎屏，始终没进桌面。
- 因此**没有任何一次真实的 `cli.exe` 跑过这道守卫**。上面全部是逻辑层证据加假 CLI；既没有证据说明 App-X 今天能编译，也没有证据说明标记字符串在 runner 的真实输出里还在。
- 本机访问 GitHub API 不通（查 runs、variables、runners 全部 `TLS handshake timeout` / `EOF`），所以 `compile-guard-self-test` 在 `d939527` 上究竟跑没跑、跑没跑绿，**未核**。

---

## 6. 结论：需修（附必改项）

这次改动方向对、改善大：原始假绿被三条路径封住，退出码现在忠实透传，没扰动任何 workflow，内容也已通过一次干净的合并进了 `main`。但还不能称它为失败关闭。

12-05 要能写下「守卫失败关闭」，以下必改：

- **M1 —— `$null` 退出码会变绿。** `scripts/ci-compile.ps1:40-42`。`& $cli` 启动失败时 `$LASTEXITCODE` 为 `$null`，`$null -ne 0` 为真，`exit $null` 退出 0。应在 34 行之后立刻补：`$LASTEXITCODE` 为 null（或非整数）时打印并 `exit 1`。用 `D:/Rain6fish/tmp/appx-guard-review-1127/badpe`（一个名叫 `cli.exe` 的文本文件）可复现。
- **M2 —— 没有超时。** 脚本和 `android-compile` 都没有；CLI 挂起会占住自托管 runner 六小时才判红。给 job 加 `timeout-minutes`（并考虑给 CLI 调用包一层超时）。
- **M3 —— 产物这一问要明确表态。** 要么加一条便宜的后置检查（例如 `unpackage/dist/build/app-android` 存在且非空），要么在报告/README 里写明「以 CLI 自称成功为准」是被接受的口径。现在它只存在于一份交接稿里。

建议（不阻塞）：

- **S1 —— 让自测真正命中显式分支。** 给 `ide-not-running` 强制 UTF-8 解码，或加第四例，使 CI 能证明 45–48 可用。
- **S2 —— `cli.cmd` 回退是为测试存在的生产代码路径**（`:12-16`）。`cli.exe` 坏了而旁边有陈旧 `cli.cmd` 时，会被执行。应改为由测试专用开关控制。
- **S3 —— 补用例**：缺 CLI、空输出、退出 2 透传、标记加非零退出。

本复核不对「是否合并 / 是否回滚 / 是否发布」表态，那是用户的决定。只提一句事实：合并已经发生，所以 M1–M3 只能以 `main` 上的后续提交落地，而不是改这个分支。

---

## 7. 本次边界

全程只读。未合并、未推送、未打 tag、未改 `D:/Rain6fish/KeelBase-App-X`（前后 `git status` 均为空）、未启动 VM、未提交。探针只写 `%TEMP%` 与 `D:/Rain6fish/tmp/appx-guard-review-1127/`。GitHub API 不通，因此 CI 侧事实（run 状态、变量值、runner 状态）引自 11-26 报告与本地 workflow 文件，本次未复验。
