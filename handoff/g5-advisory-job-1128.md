# G5 ① — the advisory job: built, merged, run in CI / G5 ① —— 告警作业：已建、已合入、已在 CI 跑通

**Date.** 2026-11-28. **Where it landed.** Built on `ci/g5-advisory-1128` (`96e95f44`, then `679f7222`); merged to `main` as `5c38b1f1` on the user's explicit instruction and pushed; the first CI run is green (`46106908925`).

**English**

## 1. What this is, and what it is not

The 2026-11-27 ruling on D8 (option C) was two steps: an advisory, non-blocking job now; the blocking decision at the 12-05 review on at least two releases of readings. This turn builds the first step. It is one new workflow file. **G5 is not counted complete** — the ruling, the decision sheet and this report all say so; what exists now is a running reading, not a gate.

The job answers one question: do the bytes Maven Central actually serves for the newest KeelBase4J release declare the contract version that release was built against? It runs `scripts/check-artifact-contract.mjs` for `keelbase4j-protocol`, `keelbase4j-core` and `keelbase4j-springai`, with `--expect` read from the release tag's own pin.

## 2. Files changed

One file, added:

- `KeelBase/.github/workflows/g5-artifact-contract.yml` (231 lines).

Nothing else changed. The script `scripts/check-artifact-contract.mjs` and its test are untouched — see §5 for why.

## 3. How the job is triggered, and why

`workflow_dispatch` plus a daily schedule (`43 21 * * *` UTC = 05:43 Asia/Shanghai, off the hour on purpose). Dispatch inputs `version` and `expect` exist only to pin a specific release and to drive the negative control.

Why not the release:

- A `needs: publish` job would have to live in `KeelBase4J/.github/workflows/release.yml`. GitHub reads a workflow file from the tagged commit, so it would check only releases tagged after it lands; it would also put the check back inside the publish run, which is exactly what the advisory tier is meant to stay out of.
- `KeelBase4J`'s working tree currently holds another session's in-progress edits; adding a job there was out of this task's scope anyway.
- A daily run needs no coupling: it resolves the newest `v*` tag by itself (`git ls-remote`, anonymous) and accumulates one reading per day for the 12-05 decision.

Per run: resolve the version → shallow-clone `KeelBase4J` at that tag → `bash scripts/check-pin-lag.sh --print-pin` for the expected value (the single reader of the pin the release workflow already uses; **the value is never retyped**) → poll the three jar URLs on Central (3 attempts, 60 s apart — the runbook's standing assumption for indexing lag) → run the check per artifact → a summary table on the run page, then one annotation if anything is not a match.

No secrets. Central is public read, and `KeelBase4J` is read anonymously with `git ls-remote` / `git clone`. No token, no service, no cache beyond `setup-node`.

## 4. What a person sees when it goes red

Two places, both readable without opening a log:

- **The run-page summary** carries a table — one row per artifact, the exit code and its meaning (`match / 一致`, `MISMATCH / 不一致`, `UNDECLARED or unreadable / 未声明或读不到`).
- **An annotation** names the release, the pin it was compared against, and what exit 1 and exit 2 mean. It also states that the job gates nothing and is not evidence that G5 is done.

The step log carries the script's own output: the coordinate, the source URL, whether the published `.sha256` matched, every declaration site it examined, and — on mismatch — the observed value beside the expected one. Example of the failing text, from the local negative control:

```
  观测到的契约版本 / observed contract version: v1.23.0
  声明于 / declared at: META-INF/MANIFEST.MF (keelbase-contract-version)
  期望 / expected: v9.9.9

✗ 不一致 / MISMATCH —— 构件带的是 v1.23.0，期望 v9.9.9
```

A jar Central does not serve prints `✗ cannot download … HTTP 404 …` and `构件取不到 = 未核验，不是通过`; a jar that declares nothing prints `✗ UNDECLARED` with the sites it tried. Both exit 2. The job reports an unindexed jar after its polling as `not indexed on Central` in the table and reddens the run — a check that could not read an artifact does not pass it.

## 5. Why it is non-blocking, and why the script was left alone

It is a separate workflow, not a job in `ci.yml`, and it is not triggered by push, pull request or tag. Nothing in the merge or publish path depends on it, so no red it produces can stop anything. A post-publish check also *cannot* prevent a bad release — Central rejects redeploying the same coordinates — so "red means follow up with a new version" is the only honest semantics. The in-repo precedent is `p019-readings-nightly.yml`, adopted in the same shape.

The script was not modified. The three defects the ruling says must be fixed before promotion (manifest parsing past the main section's blank line; an error reported the same way as "undeclared"; unbounded zip inflation) do not make this tier's readings unreadable — the three failure modes were each run and their text is quoted above. What they do is blur triage at exit 2, which is tolerable while a person reads every red; the annotation says so, and the fix stays on the before-blocking list (≈0.25 day). The dead `pom.xml.sha1` guard and the `readError`-only-under-`--json` defects are likewise untouched, as is the stale header paragraph; all three are recorded for the promotion work.

## 6. Verification actually run (2026-11-28)

All local at the time; the CI run that followed is recorded in §9.

**Script tests.** `node --test scripts/check-artifact-contract.test.mjs` → 10 tests, 10 pass, 0 fail.

**Real reading against v0.1.21.** The job's own steps were extracted from the workflow and executed in order:

```
$ git ls-remote --tags --refs https://github.com/rain6fish/KeelBase4J.git 'v*' | ... | sort -V | tail -1
0.1.21
$ git clone --depth 1 --branch v0.1.21 … && bash scripts/check-pin-lag.sh --print-pin
v1.23.0
$ node scripts/check-artifact-contract.mjs --version 0.1.21 --expect v1.23.0 --artifact keelbase4j-protocol
✓ 一致 / match            (exit 0; observed v1.23.0 at META-INF/MANIFEST.MF; sha256 matches the published .sha256)
$ … --artifact keelbase4j-core
✓ 一致 / match            (exit 0; observed v1.23.0; sha256 matches)
$ … --artifact keelbase4j-springai
✓ 一致 / match            (exit 0; observed v1.23.0; sha256 matches)
```

Run-page table produced by the same steps:

```
| artifact | exit | reading |
| `keelbase4j-protocol` | 0 | match / 一致 |
| `keelbase4j-core` | 0 | match / 一致 |
| `keelbase4j-springai` | 0 | match / 一致 |
```

**Negative control — a wrong expected value.** `--expect v9.9.9` against 0.1.21: all three exit 1, the step exits non-zero, and the table reads `MISMATCH / 不一致` for each — the ruling's falsifiable consequence (2): the advisory job goes red while the release and merge paths stay green.

**Guard for a mistyped version.** `version=9.9.9`: the resolve step prints `::error title=G5 no such release::KeelBase4J has no tag v9.9.9` and exits 2, instead of failing later inside a clone.

**Duration.** The local run — tag lookup, shallow clone, pin read, three downloads and checks — took well under a minute. In CI the whole run took 13 seconds (§9). The worst case is the indexing poll, 3 artifacts × 2 × 60 s ≈ 6 minutes; the job's timeout is 20 minutes.

## 7. Going live, and the one GitHub detail that mattered

A new workflow file does nothing until it is on the default branch: GitHub only offers `workflow_dispatch` and only fires `schedule` for a workflow present there. Pushing the branch alone therefore produced no run at all — `ci.yml` listens on `main` and pull requests only, and `gh workflow run … --ref ci/g5-advisory-1128` answered `HTTP 404: workflow g5-artifact-contract.yml not found on the default branch`. That is why the branch could not be exercised in CI as a branch.

What was done, on the user's explicit go-ahead: merged the branch into `main` (`5c38b1f1`, merge commit), pushed `main`, then dispatched the workflow once by hand. The schedule now runs daily from `main`; `ci.yml` and CodeQL on the same push were green. actionlint 1.7.12 reports no findings on the file.

## 8. The floor, restated

G5 is not complete on 11-29, and this job does not change that. It verifies published bytes one reading at a time; it prevents nothing, gates nothing, and replaces neither the pre-publish guard nor the blocking decision that is still due at 12-05.

## 9. The first CI run (2026-11-28)

Run [`46106908925`](https://github.com/rain6fish/KeelBase/actions/runs/46106908925), `workflow_dispatch` on `main`, conclusion **success**, 13 seconds wall clock (job 9 s). Every step green; the failure-annotation step was skipped because nothing failed. From its log:

```
Release under test / 被测发布: 0.1.21 — pin / 期望契约版本: v1.23.0
· keelbase4j-protocol: 200
· keelbase4j-core: 200
· keelbase4j-springai: 200
cn.com.keelbase:keelbase4j-protocol:0.1.21  → observed v1.23.0, ✓ match, sha256 matches
cn.com.keelbase:keelbase4j-core:0.1.21      → observed v1.23.0, ✓ match, sha256 matches
cn.com.keelbase:keelbase4j-springai:0.1.21  → observed v1.23.0, ✓ match, sha256 matches
```

This is the first of the readings the 12-05 decision needs; at least one more release's reading is still owed.

**Negative control, also in CI.** Run [`46107933541`](https://github.com/rain6fish/KeelBase/actions/runs/46107933541), a dispatch with `version=0.1.21` and a deliberately wrong `expect=v9.9.9`: conclusion **failure**, 13 seconds. The check step exited 1 with `✗ 不一致 / MISMATCH —— 构件带的是 v1.23.0，期望 v9.9.9` for each of the three jars, and the annotation step ran, attaching two `failure` annotations (`G5 advisory red — published contract reading` / `G5 告警红 —— 已发布的契约读数`). No push and no pull request happened, so no other workflow was triggered: the red is confined to this one advisory run, which is the ruling's falsifiable consequence (2).

**A 429 episode, and the fix.** A dispatch at 04:38 UTC ([`46108457725`](https://github.com/rain6fish/KeelBase/actions/runs/46108457725)) was answered HTTP 429 by Central for all three jars — GitHub-hosted runners share egress addresses and Central limits by address — and the pre-flight step reported that as "not indexed"; the run went red six minutes later having checked nothing. `9d135100` (fast-forwarded to `main`) bounds every curl with `--connect-timeout 10 --max-time 30`, waits 120 s on a 429 and names it a rate limit, and always runs the check so the reading is the script's own exit code and Central's own text rather than a pre-flight guess. The next dispatch, [`46109231688`](https://github.com/rain6fish/KeelBase/actions/runs/46109231688), was green in 42 seconds: three 200s, three matches, all three sha256 checks matched.

**中文**

## 1. 这是什么、不是什么

2026-11-27 对 D8 的裁定（选 C）是两步：先落一条告警（非阻塞）作业；阻塞与否在 12-05 复核时凭至少两次发布的读数决定。本轮只做第一步，产出是一个新的工作流文件。**G5 不计完成** —— 裁定、决策单与本报告都这么写；现在有的是一条跑得起来的读数，不是一道闸。

作业只回答一个问题：Maven Central 实际提供的最新 KeelBase4J 发布字节，是否自述了那次发布构建时所用的契约版本。它对 `keelbase4j-protocol`、`keelbase4j-core`、`keelbase4j-springai` 跑 `scripts/check-artifact-contract.mjs`，`--expect` 取自该发布 tag 自己的 pin。

## 2. 改了哪些文件

只新增一个文件：

- `KeelBase/.github/workflows/g5-artifact-contract.yml`（231 行）。

其余未动。脚本 `scripts/check-artifact-contract.mjs` 及其测试一个字没改 —— 理由见 §5。

## 3. 怎么触发，为什么这么选

`workflow_dispatch` 加每日定时（`43 21 * * *` UTC，即北京时间 05:43，有意避开整点）。dispatch 的 `version` 与 `expect` 两个入参，只用于锁定某个发布和做负向对照。

为什么不挂发布：

- 若做成 `needs: publish`，就得改 `KeelBase4J/.github/workflows/release.yml`。GitHub 从被打 tag 的提交读工作流文件，所以它只会对之后才打的 tag 生效；而且等于把这项检查塞回发布 run 里，而告警档的意义恰恰是不待在发布路径上。
- `KeelBase4J` 的工作树眼下有别的会话未完成的改动；本任务的边界也不包括改那个仓。
- 每日跑不需要任何耦合：它自己用 `git ls-remote`（匿名）取最新 `v*` tag，每天积累一条读数，供 12-05 裁定。

每次运行的顺序：确定版本 → 在该 tag 上浅克隆 `KeelBase4J` → 用 `bash scripts/check-pin-lag.sh --print-pin` 读出期望值（发布工作流已经在用的、唯一读 pin 的脚本；**值从不手抄**）→ 轮询 Central 上三个 jar 地址（3 次、间隔 60 秒 —— runbook 的既定假设）→ 逐构件跑核对 → 在 run 页打一张汇总表，有任何不一致再打一条 annotation。

不需要 secret。Central 公开只读，`KeelBase4J` 用 `git ls-remote` / `git clone` 匿名读取。没有 token、没有服务，除 `setup-node` 外没有缓存。

## 4. 红的时候人看到什么

两处，都不用翻日志：

- **run 页的汇总表**：每个构件一行，退出码及其含义（`match / 一致`、`MISMATCH / 不一致`、`UNDECLARED or unreadable / 未声明或读不到`）。
- **一条 annotation**：点名发布、比对所用的 pin，并说明 exit 1 与 exit 2 各是什么意思；同时写明本作业不拦任何东西、也不是 G5 已完成的证据。

步骤日志里有脚本自己的输出：坐标、来源 URL、Central 公布的 `.sha256` 是否一致、查过的每一个声明位置，以及不一致时与期望值并排的观测值。本地负向对照的红字实例：

```
  观测到的契约版本 / observed contract version: v1.23.0
  声明于 / declared at: META-INF/MANIFEST.MF (keelbase-contract-version)
  期望 / expected: v9.9.9

✗ 不一致 / MISMATCH —— 构件带的是 v1.23.0，期望 v9.9.9
```

Central 上没有的 jar 打印 `✗ cannot download … HTTP 404 …` 与 `构件取不到 = 未核验，不是通过`；什么都没声明的 jar 打印 `✗ UNDECLARED` 并列出查过的位置。两者都退出 2。轮询后仍取不到的 jar 在表里记 `not indexed on Central` 并把 run 打红 —— 读不到的构件，检查不替它放行。

## 5. 为什么是非阻塞，为什么没动脚本

它是独立工作流，不是 `ci.yml` 里的 job，也不由 push、pull request 或 tag 触发。合并与发布路径上没有任何东西依赖它，所以它的红拦不住任何事。发布后的检查本来也**阻止不了**坏发布 —— Central 拒绝重发同一坐标 —— 所以「红 = 发新版本跟进」是唯一诚实的语义。仓内先例是 `p019-readings-nightly.yml`，同一形态。

脚本未改。裁定要求升阻塞前必须修的三条缺陷（清单解析越过主段空行；错误与「未声明」报成同一结果；zip 解压无上限）不会让这一档的读数读不出来 —— 三种失败情形都实跑过，文字就引在上面。它们真正影响的是 exit 2 之下的分诊，而在人工读每一条红的告警档里这是可接受的；annotation 已经把这一点写明，修复仍留在「升阻塞前必修」清单上（约 0.25 日）。`pom.xml.sha1` 死守卫、`readError` 只在 `--json` 暴露、以及过时的头部段落同样未动，都记在升格时一并处理。

## 6. 实际做过的验证（2026-11-28）

全部本地完成，未触发任何 CI 运行。

**脚本自带测试。** `node --test scripts/check-artifact-contract.test.mjs` → 10 个用例，10 通过，0 失败。

**对 v0.1.21 的真实读数。** 从工作流里抽出作业自己的各步、按序执行：

```
$ git ls-remote --tags --refs https://github.com/rain6fish/KeelBase4J.git 'v*' | ... | sort -V | tail -1
0.1.21
$ git clone --depth 1 --branch v0.1.21 … && bash scripts/check-pin-lag.sh --print-pin
v1.23.0
$ node scripts/check-artifact-contract.mjs --version 0.1.21 --expect v1.23.0 --artifact keelbase4j-protocol
✓ 一致 / match            （exit 0；观测 v1.23.0，声明于 META-INF/MANIFEST.MF；sha256 与 Central 公布的一致）
$ … --artifact keelbase4j-core
✓ 一致 / match            （exit 0；观测 v1.23.0；sha256 一致）
$ … --artifact keelbase4j-springai
✓ 一致 / match            （exit 0；观测 v1.23.0；sha256 一致）
```

同一次执行在 run 页会得到的表：

```
| artifact | exit | reading |
| `keelbase4j-protocol` | 0 | match / 一致 |
| `keelbase4j-core` | 0 | match / 一致 |
| `keelbase4j-springai` | 0 | match / 一致 |
```

**负向对照 —— 错误期望值。** 对 0.1.21 用 `--expect v9.9.9`：三个构件全部 exit 1，该步非零退出，表里三行都是 `MISMATCH / 不一致` —— 正是裁定的可证伪后果（2）：告警作业变红，发布与合并路径保持绿。

**版本打错的守卫。** `version=9.9.9`：解析步打印 `::error title=G5 no such release::KeelBase4J has no tag v9.9.9` 并 exit 2，而不是等到 clone 里才失败。

**耗时。** 本地整条链 —— 查 tag、浅克隆、读 pin、三次下载与核对 —— 不到一分钟。runner 上估计 1–2 分钟加上检出与 `setup-node`；最坏情况是入索引轮询，3 个构件 × 2 × 60 秒 ≈ 6 分钟。作业超时设为 20 分钟。

## 7. 上线，以及一个真正挡路的 GitHub 细节

新工作流在进入默认分支之前什么都不会做：GitHub 只对默认分支上的工作流提供 `workflow_dispatch`，也只对默认分支上的 `schedule` 触发。所以只推分支时一条 run 都没有 —— `ci.yml` 只听 `main` 与 PR，而 `gh workflow run … --ref ci/g5-advisory-1128` 返回 `HTTP 404: workflow g5-artifact-contract.yml not found on the default branch`。这就是分支形态没法在 CI 里试跑的原因。

经用户明确同意后的动作：把分支并入 `main`（`5c38b1f1`，合并提交）、推送 `main`、手动触发一次。定时跑从此每天从 `main` 出发；同一次推送带起的 `ci.yml` 与 CodeQL 均绿。actionlint 1.7.12 对该文件无任何发现。

## 8. 底线，再说一遍

11-29 不把 G5 计入完成，本作业改变不了这一点。它一条一条地核对已发布字节；它不阻止任何事、不拦任何东西，也替代不了发布前守卫，更替代不了 12-05 仍到期的阻塞决定。

## 9. 第一次 CI 运行（2026-11-28）

run [`46106908925`](https://github.com/rain6fish/KeelBase/actions/runs/46106908925)，`main` 上的 `workflow_dispatch`，结论 **success**，墙钟 13 秒（作业本体 9 秒）。每一步都绿；失败点名的步骤因无失败而跳过。日志摘录：

```
Release under test / 被测发布: 0.1.21 — pin / 期望契约版本: v1.23.0
· keelbase4j-protocol: 200
· keelbase4j-core: 200
· keelbase4j-springai: 200
cn.com.keelbase:keelbase4j-protocol:0.1.21  → 观测 v1.23.0，✓ 一致，sha256 一致
cn.com.keelbase:keelbase4j-core:0.1.21      → 观测 v1.23.0，✓ 一致，sha256 一致
cn.com.keelbase:keelbase4j-springai:0.1.21  → 观测 v1.23.0，✓ 一致，sha256 一致
```

这是 12-05 裁定所需读数中的第一条；还欠至少一次发布的读数。

**负向对照，同样在 CI 里跑过。** run [`46107933541`](https://github.com/rain6fish/KeelBase/actions/runs/46107933541)：dispatch 时给 `version=0.1.21` 与故意错误的 `expect=v9.9.9`，结论 **failure**，13 秒。核对步以 exit 1 结束，三个 jar 各打印 `✗ 不一致 / MISMATCH —— 构件带的是 v1.23.0，期望 v9.9.9`；点名步执行成功，挂上两条 `failure` 级 annotation（`G5 advisory red — published contract reading` / `G5 告警红 —— 已发布的契约读数`）。这次没有 push、没有 PR，所以没有触发任何别的工作流：红被关在这一条告警 run 里，正是裁定的可证伪后果（2）。

**一次 429 插曲与修正。** 04:38 UTC 的一次 dispatch（[`46108457725`](https://github.com/rain6fish/KeelBase/actions/runs/46108457725)）上，Central 对三个 jar 全回 HTTP 429 —— GitHub 托管的 runner 共用出口地址，Central 按地址限流 —— 预检步把它报成「未入索引」，六分钟后 run 判红、什么都没核到。`9d135100`（已快进到 `main`）给每个 curl 加了 `--connect-timeout 10 --max-time 30`，429 等 120 秒并如实点名为限流，核对步照跑，读数以脚本自己的退出码和 Central 的原文为准，不再依赖预检的猜测。下一次 dispatch（[`46109231688`](https://github.com/rain6fish/KeelBase/actions/runs/46109231688)）42 秒变绿：三个 200、三个一致、三次 sha256 全部对上。

---

## Paste-ready PR description / 可直接贴进 PR 描述的说明

**English**

Add the G5 advisory job: a new workflow that reads the newest KeelBase4J release's `keelbase4j-protocol`, `keelbase4j-core` and `keelbase4j-springai` jars from Maven Central and compares each jar's self-declared contract version with the pin in that release tag, read by `check-pin-lag.sh --print-pin` — never retyped.

- **Trigger:** daily schedule + `workflow_dispatch`; not the release, and not `ci.yml`. A red gates nothing; a wrong-`expect` dispatch goes red while everything else stays green.
- **Reading on failure:** a per-artifact table on the run page, one annotation naming the release, the pin and what exit 1 / exit 2 mean, and the script's own output in the step log.
- **No secrets:** Central and the peer repository are read anonymously. Central indexing lag is polled 3×60 s.
- **Script unchanged.** The three defects that must be fixed before any promotion to blocking stay on the before-blocking list.
- **Verified locally (2026-11-28):** 10/10 script tests; v0.1.21 green on all three coordinates (self-declared `v1.23.0`, pin `v1.23.0`); wrong-`expect` red on all three; mistyped version guarded.
- **G5 is not counted complete.** This is the advisory first step of the two-step ruling (D8, option C); the blocking decision is due at the 12-05 review on at least two releases of readings.

**中文**

新增 G5 告警作业：一条新工作流，从 Maven Central 读最新 KeelBase4J 发布的 `keelbase4j-protocol`、`keelbase4j-core`、`keelbase4j-springai` 三个 jar，把各自自述的契约版本与该发布 tag 的 pin 相比对；pin 由 `check-pin-lag.sh --print-pin` 读出，从不手抄。

- **触发：** 每日定时加 `workflow_dispatch`；不挂发布，也不进 `ci.yml`。红不拦任何东西；错误 `expect` 的 dispatch 变红，其余保持绿。
- **失败时看到什么：** run 页上一张逐构件的表、一条点名发布与 pin 并说明 exit 1 / exit 2 含义的 annotation，以及步骤日志里脚本自己的输出。
- **不需要 secret：** Central 与兄弟仓均匿名读取。Central 入索引延迟按 3×60 秒轮询。
- **脚本未改。** 升阻塞前必修的三条缺陷仍在清单上。
- **本地已验证（2026-11-28）：** 脚本测试 10/10；v0.1.21 三个坐标全绿（自述 `v1.23.0`，pin `v1.23.0`）；错误 `expect` 三个全红；打错的版本有守卫。
- **G5 不计完成。** 这是两步裁定（D8，选 C）的第一步 —— 告警档；阻塞决定在 12-05 复核时凭至少两次发布的读数作出。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
