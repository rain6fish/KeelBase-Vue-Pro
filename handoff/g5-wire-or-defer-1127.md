# G5 — wire the artifact-contract check now, or record the deferral formally / G5 —— 现在接线产物契约核对，还是正式记录后置

**Prepared.** 2026-11-27 (UTC+08), for the 2026-11-28 CTO weekly (B-2 in `handoff/nextstage-abc-1126.md` §3).

**Boundary.** Read-only. This document changes no repository, workflow, `package.json`, decision index or plan; it commits nothing, pushes nothing, triggers no CI and contacts nobody. Every recommendation is marked "建议，非裁定"; only a person's signature rules. G5 is **not wired** and this document does not claim otherwise.

**What this document adds.** It answers one question the packet left open — can `KeelBase/scripts/check-artifact-contract.mjs` actually run a real comparison against the v0.1.21 artifacts today? — and it replaces the "Central read path not verified" caveat in the packet with an executed reading.

---

## 1. The question as put, and where it is recorded / 问题原文与记述位置

**English**

B-2 (`nextstage-abc-1126.md` §3, English lines 154 / 168–176): the script exists (20,132 bytes) and is referenced by no `package.json`, workflow or runbook; under D67/U6 it is deferred. B-2 is a choice between wiring it (one CI job that downloads the Central bytes and compares them with the contract version the artifact declares) and recording the deferral formally. Under either choice G5 is not counted complete on 11-29.

One recording detail matters for option B: the two CTO materials number their decisions differently, and the packet's own sheet has **no G5 row**. `handoff/cto-1128-decisions-1126.md` is the packet's D1–D5 (D1 N5 criterion 5, D2 App-X VM window, D3 N9 criterion, D4 W1.4 third window, D5 4J cross-day bump); its own line 15 warns that the two D-lists "are not interchangeable". G5 appears only in `nextstage-abc-1126.md` — §1 table (line 73), §3 gate table (line 166), §6 D4 (line 303). A formal deferral recorded as "D4" would therefore collide with W1.4 in the sheet the meeting signs. Option B must name the item ("G5 / artifact-contract verification of published bytes") rather than a D-number.

**中文**

B-2（`nextstage-abc-1126.md` §3，英文 154 行 / 168–176 行）：脚本在（20,132 字节），但 `package.json`、workflow、runbook 均零引用；按 D67/U6 后置。B-2 是在「接线」（一条 CI 作业下载 Central 字节、与产物自述的契约版本比对）与「把后置正式记录」之间二选一。无论选哪条，11-29 都不把 G5 计入完成项。

选项 B 有一个记述细节必须先说清：两份 CTO 材料的编号体系不同，而**决策单里没有 G5 这一行**。`handoff/cto-1128-decisions-1126.md` 用的是 packet 的 D1–D5（D1 N5 判据 5、D2 App-X 虚拟机窗口、D3 N9 判据、D4 W1.4 第三次窗口、D5 4J 跨日 bump）；该件第 15 行自己就警告两套 D 编号「不可互换」。G5 只出现在 `nextstage-abc-1126.md` —— §1 表（73 行）、§3 闸表（166 行）、§6 D4（303 行）。因此把后置记成「D4」会和会上要签的那张单里的 W1.4 撞号。选项 B 必须按名字记（「G5 / 已发布字节的产物契约核对」），不能只写一个 D 编号。

---

## 2. Executed readings — can it run against v0.1.21? / 实跑读数 —— 能否对 v0.1.21 真实比对

**English**

Yes. On 2026-11-27 it ran, read-only, against the live Central bytes and returned the three distinct outcomes. Baseline: `KeelBase` at `main` / `17b23296`, worktree clean; script sha256 `1354d15b…a9d252`; test file sha256 `7931d263…405017`; node v24.22.2; run from `D:/Rain6fish/KeelBase`.

| # | Command (abridged) | Outcome (observed) |
|---|---|---|
| 1 | `node scripts/check-artifact-contract.mjs --version 0.1.21 --expect v1.23.0` | **exit 0**; 280 jar entries; sha256 `b1d4588f75b9274ea0853be1c4f553c5c9b542f8df5f2c786ebf6e722b497551` matches Central's published `.sha256`; declared at `META-INF/MANIFEST.MF (keelbase-contract-version)`; observed `v1.23.0` |
| 2 | `… --version 0.1.21 --expect v1.23.0 --artifact keelbase4j-protocol` | **exit 0**; observed `v1.23.0` |
| 3 | `… --version 0.1.21 --expect v1.23.0 --artifact keelbase4j-springai` | **exit 0**; observed `v1.23.0` |
| 4 | `… --version 0.1.21 --expect v1.22.0` (negative control) | **exit 1**; `MISMATCH —— 构件带的是 v1.23.0，期望 v1.22.0` |
| 5 | `… --version 0.1.20 --expect v1.22.0` | **exit 0**; observed `v1.22.0` |
| 6 | `… --version 0.1.19 --expect v1.22.0` | **exit 2**; `UNDECLARED`; embedded pom examined, no declaration |
| 7 | `node --test scripts/check-artifact-contract.test.mjs` | 10 tests, 10 pass, 0 fail |
| 8 | `git status --porcelain` after 1–7 | empty |

What a real comparison needs: node ≥18 (uses `fetch`, `AbortSignal.timeout`), outbound read access to `https://repo1.maven.org/maven2`, an explicit `--version` and `--expect` (never "latest"), and optionally `--jar <local.jar>` instead of the network, `--artifact` / `--group` / `--repo`, `--json`. No credentials: Central reads are public; none of the release job's GPG/Central secrets is involved.

Two facts this changes. (a) The script's own header (lines 67–72) still says it "answers 'undeclared' for every published artifact" — that is **stale**: the manifest profile in `KeelBase4J/pom.xml` (lines 200–237) took effect with **0.1.20**, so wiring today would be **green**, not red by construction. (b) The fourth publish coordinate is the parent `pom`, which has no jar; the script checks jars, so a job covers three of four coordinates and the existing `200` check (runbook step 7) still covers the pom.

**中文**

能。2026-11-27 以只读方式对 Central 上的真实字节跑过，三种结论都出现了。基线：`KeelBase` 在 `main` / `17b23296`，工作树干净；脚本 sha256 `1354d15b…a9d252`；测试文件 sha256 `7931d263…405017`；node v24.22.2；在 `D:/Rain6fish/KeelBase` 下执行。

| # | 命令（节选） | 结果（实测） |
|---|---|---|
| 1 | `node scripts/check-artifact-contract.mjs --version 0.1.21 --expect v1.23.0` | **exit 0**；jar 条目 280；sha256 `b1d4588f75b9274ea0853be1c4f553c5c9b542f8df5f2c786ebf6e722b497551` 与 Central 公布的 `.sha256` 一致；声明于 `META-INF/MANIFEST.MF (keelbase-contract-version)`；观测 `v1.23.0` |
| 2 | `… --version 0.1.21 --expect v1.23.0 --artifact keelbase4j-protocol` | **exit 0**；观测 `v1.23.0` |
| 3 | `… --version 0.1.21 --expect v1.23.0 --artifact keelbase4j-springai` | **exit 0**；观测 `v1.23.0` |
| 4 | `… --version 0.1.21 --expect v1.22.0`（负向对照） | **exit 1**；`MISMATCH —— 构件带的是 v1.23.0，期望 v1.22.0` |
| 5 | `… --version 0.1.20 --expect v1.22.0` | **exit 0**；观测 `v1.22.0` |
| 6 | `… --version 0.1.19 --expect v1.22.0` | **exit 2**；`UNDECLARED`；内嵌 pom 查过、无声明 |
| 7 | `node --test scripts/check-artifact-contract.test.mjs` | 10 个用例，10 过，0 失败 |
| 8 | 1–7 之后 `git status --porcelain` | 空 |

一次真实比对需要：node ≥18（用到 `fetch`、`AbortSignal.timeout`）、对 `https://repo1.maven.org/maven2` 的出站读取、显式的 `--version` 与 `--expect`（绝不取「最新」），可选 `--jar <本地 jar>` 免网、`--artifact` / `--group` / `--repo`、`--json`。不需要凭据：Central 公开可读，与发布作业的 GPG / Central 密钥无关。

这改变了两件事实。（一）脚本头部（67–72 行）仍写着「今天对每个已发布构件都答未声明」—— **已过时**：`KeelBase4J/pom.xml`（200–237 行）的清单 profile 随 **0.1.20** 生效，所以今天接线会是**绿**，不是天生就红。（二）四个发布坐标里有一个是父 `pom`，没有 jar；脚本只查 jar，所以一条作业覆盖四个坐标中的三个，父 pom 仍由现有 `200` 核对（runbook 第 7 步）覆盖。

---

## 3. Does it write repository files? / 它会不会写仓库文件

**English**

No — by source and by observation. The script contains no `writeFile` / `createWriteStream` / `appendFile` / `mkdir` / `rm` / `unlink` call; the only file access is `fs.readFileSync` for `--jar`, everything else is `fetch` into memory. There is no `--dry-run` flag because none is needed: every invocation is a read. Empirically, `git status --porcelain` in `KeelBase` was empty before and after the six network runs and the test run (§2 row 8). The test file writes only to `os.tmpdir()` under a `mkdtempSync` directory it removes.

A CI job built on it is therefore read-only toward every repository; its only outbound effect is HTTP GET to Central.

**中文**

不会 —— 源码与实测一致。脚本里没有 `writeFile` / `createWriteStream` / `appendFile` / `mkdir` / `rm` / `unlink` 调用；唯一的文件读取是 `--jar` 时的 `fs.readFileSync`，其余全部是 `fetch` 进内存。没有 `--dry-run` 参数，因为不需要：每次调用都是读。实测：六次联网运行与一次测试运行前后，`KeelBase` 的 `git status --porcelain` 均为空（§2 第 8 行）。测试文件只写 `os.tmpdir()` 下 `mkdtempSync` 建的临时目录，并在结束时删掉。

因此基于它的 CI 作业对任何仓库都是只读的；对外唯一动作是对 Central 的 HTTP GET。

---

## 4. The five recorded defects — status re-verified against this code / 五条已知缺陷 —— 按现码复核

**English**

Source: `KeelBase/handoff/r1-v150-prep-1124.md` line 55 (OCR medium/low, tooling). Re-verified against the file's current content; line numbers are this file's.

| Claim | Still true? | Evidence and current shape | Bearing on gating |
|---|---|---|---|
| Manifest parsing does not stop at the main section's blank line | **True** | `parseManifest` (105–120) skips `''` lines and keeps reading, so a per-entry section's attributes would be treated as artifact-level. A JAR manifest's main section ends at the first blank line. | Low likelihood (few jars put a contract key in a named section), cheap fix: stop at the first blank line. |
| Zip inflation is unbounded | **True in substance** | `MAX_ENTRY_BYTES` (4 MiB) caps the **compressed** entry; `zlib.inflateRawSync` output has no cap (deflate can expand ~1000×). `--jar` reads a local file with no total-size check; network downloads are capped at 64 MiB. | A hostile or corrupt artifact could exhaust memory. Central artifacts are our own; risk low but real. |
| A thrown error is indistinguishable from a real mismatch | **Partly — the accurate split** | Exit codes do separate mismatch (**1**) from error/undeclared (**2**). But a read error inside the decode loop (400–412) is swallowed to `''`, so the site is reported **absent** and the run says `UNDECLARED`; `openZip`/fetch failures also exit 2. So: **error ↔ undeclared are conflated**, not error ↔ mismatch. | In CI both are red, so the gate semantics are unaffected; **triage** is: "artifact says nothing" and "the tool broke" look the same unless `--json` is used. |
| `pom.xml.sha1` guard is dead code | **True** | Line 403: `/^META-INF\/maven\/.+\/pom\.xml$/` can never match `pom.xml.sha1`; the `!name.includes('pom.xml.sha1')` clause is unreachable. | Cosmetic; delete. |
| `readError` only surfaces in `--json` | **True** | Set at 409, printed only in the JSON branch (418–421); the human-readable path never shows it. | Compounds the previous row. |

Also observed in this session, not in the earlier list: the header text (67–72) is stale as to the artifacts (§2); there is no retry or wait for Central's indexing lag (a job fired at publish completion can get a 404 and exit 2 — the runbook already retries 3×60 s in step 7); and the comparison is exact after stripping a leading `v`, so `v1.23.0` matches `1.23.0` but a suffixed value would not.

None of these was fixed here: fixing would have changed `KeelBase`, which is outside this task's boundary.

**中文**

出处：`KeelBase/handoff/r1-v150-prep-1124.md` 第 55 行（OCR 中/低，工具类）。按文件现内容逐条复核；行号为本件行号。

| 说法 | 是否仍成立 | 证据与现状 | 对接线的影响 |
|---|---|---|---|
| 清单解析不在主段空行处停止 | **成立** | `parseManifest`（105–120）跳过 `''` 行继续读，于是逐个条目段落里的属性会被当成构件级属性。JAR 清单的主段在第一个空行处结束。 | 可能性低（很少有 jar 在命名段里放契约键），修起来便宜：遇第一个空行即停。 |
| zip 解压无上限 | **实质成立** | `MAX_ENTRY_BYTES`（4 MiB）限的是**压缩后**条目；`zlib.inflateRawSync` 的输出没有任何上限（deflate 可膨胀约 1000 倍）。`--jar` 读本地文件不做总大小检查；联网下载限 64 MiB。 | 恶意或损坏的构件可耗尽内存。Central 上是自家产物，风险低但非零。 |
| 抛错与真实不匹配不可区分 | **部分成立 —— 准确的切分是** | 退出码确实把不一致（**1**）与错误/未声明（**2**）分开了。但解码循环（400–412）里的读错被吞成 `''`，该位置被报成**不存在**，整次运行说 `UNDECLARED`；`openZip` / 下载失败同样退出 2。即：**错误 ↔ 未声明被混为一谈**，不是错误 ↔ 不一致。 | CI 里两者都是红，闸的语义不受影响；受影响的是**分诊**：不用 `--json` 时，「构件什么都没说」与「工具坏了」长得一样。 |
| `pom.xml.sha1` 守卫是死代码 | **成立** | 403 行：`/^META-INF\/maven\/.+\/pom\.xml$/` 永远匹配不到 `pom.xml.sha1`；`!name.includes('pom.xml.sha1')` 不可达。 | 纯清理项；删掉即可。 |
| `readError` 只在 `--json` 时暴露 | **成立** | 409 行赋值，只在 JSON 分支（418–421）打印；人读路径从不显示。 | 与上一条叠加。 |
| （本会话新见）头部文字过时 | 成立 | 67–72 行仍称「每个已发布构件都答未声明」，与 §2 的 0.1.20 / 0.1.21 读数矛盾。 | 会误导实施者。 |
| （本会话新见）无入索引等待 | 成立 | 没有重试；发布刚完成就触发的作业可能拿到 404 而退出 2。runbook 第 7 步已有 3×60 秒重试。 | 接线时必须补轮询。 |

以上缺陷本件一律未修：修它们要改 `KeelBase`，越出本任务边界。

---

## 5. Cost of wiring / 接线成本

**English**

**Where it could hang.** Three hosts, in decreasing intrusiveness:

1. A second job in `KeelBase4J/.github/workflows/release.yml`, `needs: publish`. Note GitHub reads the workflow file **from the tagged commit**, so landing it after 0.1.21 does not check 0.1.21; and `release.yml` currently has only `push: tags v*` (no `workflow_dispatch`), so checking an already-published version needs a new trigger.
2. A new small workflow in `KeelBase4J` or in `KeelBase` — `workflow_dispatch` plus (optionally) a schedule. `KeelBase/.github/workflows/p019-readings-nightly.yml` is the in-repo precedent for exactly this shape and states the rationale: alert-only, out of the merge path, "whether it becomes blocking is a separate decision".
3. No CI: one command added to runbook step 7 ("Central, four coordinates", `handoff/v1230-runbook-1126.md` line 383), whose success reading today is four `200`s plus a sha match — it does not read the manifest at all. This is the cheapest invocation point and it is what makes the "unreachable tool" finding go away without a CI decision; it is not a gate, because a person has to run it.

**Prerequisites.** Public read to `repo1.maven.org` (verified: the four runs above needed no credential). Node ≥18 on the runner (ubuntu-latest ships it; the 4J workflow already uses setup-node). The expected value must not be retyped: `bash scripts/check-pin-lag.sh --print-pin` in `KeelBase4J` is the existing single reader of the `ref:` pin, and the release workflow already uses it. The script must be made available to the job: either a checkout of `KeelBase` at a ref that contains it (`v1.5.0` does; the 4J workflow's existing `main-repo` checkout is pinned at `v1.2.0`, which does **not**), or a vendored copy — `KeelBase4J` already vendors `check-commit-order.mjs` with a pinned digest, so the pattern exists. Central indexing lag must be handled by polling (3×60 s as in the runbook), or the job will flake on fresh releases.

**Failure semantics.** A post-publish check **cannot prevent** a bad release: Central rejects re-deploying the same coordinates and a bundle cannot be un-sent; the pre-publish guard that does prevent is already there (`KeelBase4J/scripts/check-jar-contract-version.sh`, run on the publish set right before the key import). So a red G5 job means "a live release's published bytes do not declare or do not match the contract version the release claims" — a signal for follow-up (new version), never a block. As a `needs:` job it would mark the release run red after the artifacts are already live; nothing downstream depends on it today. As a dispatch/scheduled job it blocks nothing at all.

**Approval.** Any of hosts 1–2 is a CI change and needs the machine-side approval the packet names; the runbook line (host 3) needs only the release runbook's owner. Cost stays within the packet's estimate: ≈0.5 AI-day for a job and its polling, ≈0.25 day for the vendoring or the cross-repo pin, plus review; the packet's 1–1.5 AI-day figure holds.

**Falsifiable check that wiring works.** A dispatch run with a wrong `--expect` is red (the local negative control already returns exit 1, §2 row 4); restoring the value turns it green. On a real tag, the job's log shows three coordinates and their observed values.

**中文**

**挂在哪里。** 三个宿主，侵入性由高到低：

1. `KeelBase4J/.github/workflows/release.yml` 里加第二个作业，`needs: publish`。注意 GitHub 从**被打 tag 的那个提交**读工作流文件，所以 0.1.21 之后才落地的工作流查不到 0.1.21；且 `release.yml` 现在只有 `push: tags v*`（没有 `workflow_dispatch`），要复查已发布版本得新增触发。
2. 在 `KeelBase4J` 或 `KeelBase` 里新建一个小工作流 —— `workflow_dispatch`，可选再加 `schedule`。`KeelBase/.github/workflows/p019-readings-nightly.yml` 就是同形的仓内先例，并把理由写清了：只告警、不待在合并路径上、「是否改成阻塞是之后另行决定的事」。
3. 不进 CI：在 runbook 第 7 步（「Central，四个坐标」，`handoff/v1230-runbook-1126.md` 383 行）加一条命令。该步今天的成功读数是四个 `200` 加 sha 一致 —— 完全不读清单。这是最便宜的调用点，也让「不可达工具」这条评审发现消失；但它不是闸，因为要人去跑。

**前置。** 对 `repo1.maven.org` 的公开读（已证：上面四次运行无需任何凭据）。runner 上 node ≥18（ubuntu-latest 自带；4J 工作流本来就用了 setup-node）。期望值不能手抄：`KeelBase4J` 的 `bash scripts/check-pin-lag.sh --print-pin` 是现有 `ref:` pin 的唯一读法，发布工作流已在用。脚本要让作业拿得到：或按含它的 ref 检出 `KeelBase`（`v1.5.0` 含；4J 工作流现有的 `main-repo` 检出钉在 `v1.2.0`，**不含**），或做 vendored 副本 —— `KeelBase4J` 已有 `check-commit-order.mjs` 带 pin 摘要的 vendored 先例。Central 入索引延迟必须用轮询处理（照 runbook 的 3×60 秒），否则新发布一跑就抖。

**失败语义。** 发布后的检查**阻止不了**坏发布：Central 拒绝重发同一坐标、包发出去收不回；真正起阻止作用的是发布前那道守卫（`KeelBase4J/scripts/check-jar-contract-version.sh`，在导入签名钥匙之前对发布集合跑）。所以 G5 变红的意思是「一次已上线的发布，其已发布字节没有自述、或与所声称的契约版本不符」—— 这是跟进信号（发新版本），永远不是拦截。作为 `needs:` 作业，它会在产物已上线之后把发布 run 标红；今天没有任何下游依赖它。作为 dispatch / 定时作业，它什么都不阻塞。

**批准。** 宿主 1–2 都属于 CI 改动，需要 packet 点名的机器侧批准；runbook 那条（宿主 3）只需要 runbook 维护人。成本仍在 packet 估计之内：作业加轮询约 0.5 个 AI 日，vendoring 或跨仓 pin 约 0.25 日，外加评审；packet 的 1–1.5 AI 日成立。

**接线是否有效的可证伪检验。** 用错误的 `--expect` 做一次 dispatch 运行 ⇒ 红（本地负向对照已返回 exit 1，§2 第 4 行）；把值复原 ⇒ 绿。真实 tag 上，作业日志会列出三个坐标及各自观测值。

---

## 6. Cost of deferring / 后置代价

**English**

What remains unchecked under a formal deferral: the bytes a consumer actually downloads declare the contract version the release claims. The pre-publish guard reads **workspace** jars; the deploy step rebuilds the lifecycle with the same property. Those are two builds of the same source; the guard does not prove the deployed bytes are the ones it read, and nothing else asks Central. A divergence would be found only by a person choosing to run the script.

Who re-reads, and when. There is no named owner today. The 12-05 review already exists (App-X); it is the natural checkpoint to re-open G5, and the deferral should name that date. Until then, the weakest acceptable form is the runbook step 7 line (§5, host 3): it costs one line, gives the tool a documented invocation point, and keeps the check one copy-paste away during every release.

Whether it becomes undiscoverable. Not fully: the script remains runnable manually and its tests pass (10/10). The real cost is that no red appears anywhere — the claim in the release note ("this artifact carries contract vX") stays unverified unless someone thinks to check. A secondary cost: an unreferenced tool plus a stale header is exactly the "unreachable tool" finding already recorded as MEDIUM in the 11-24 four-layer review; leaving it unrecorded reproduces the gap the 11-23 document warned about.

**中文**

正式后置之下仍然没人查的东西：消费者真正下载到的那串字节，是否自述了发布所声称的契约版本。发布前守卫读的是**工作区**里的 jar；deploy 那一步用同一属性重跑生命周期。这是同一份源码的两次构建；守卫并未证明被部署的字节就是它读过的那批，而除此之外没有任何东西去问 Central。真有分歧，只能靠某个人想到去跑这个脚本才会发现。

谁来复核、何时复核。今天没有具名责任人。12-05 复核已经存在（App-X）；它是重开 G5 的自然检查点，后置记录应当写上这个日期。在那之前，可接受的最弱形态是 runbook 第 7 步那一条（§5 宿主 3）：成本一行，给工具一个有据可查的调用点，并在每次发布时让这项检查只差一次复制粘贴。

会不会变成不可发现的问题。不会完全不可发现：脚本仍可手工跑，测试通过（10/10）。真正的代价是**任何地方都不会变红** —— 发布说明里「本产物带契约 vX」那句声明，除非有人想到去查，否则一直无人校验。第二项代价：一个零引用工具加一段过时的头部说明，正是 11-24 四层评审已记为 MEDIUM 的「不可达工具」；不记录的后置，恰恰是 11-23 文档警告过的那个缺口。

---

## 7. Three options with falsifiable consequences / 三个选项与可证伪后果

**English**

> All three assume the same floor: G5 is **not** counted complete on 11-29, and a dated entry says so.

**A — wire it now.**
Falsifiable consequences: (1) on the next tag, a workflow job reads three published jars from Central and its log shows observed values; (2) a dispatch run with a wrong `--expect` is red and the restore is green; (3) if wired as blocking, a failing run shows the release run red **after** the artifacts are live — the observable is "red release run, published artifacts already immutable". Cost ≈1–1.5 AI-day plus CI approval. With the five defects unfixed, a blocking red can also be a tool fault that reads as "undeclared" (§4, row 3).

**B — record the deferral formally.**
Falsifiable consequences: (1) the decision index carries a dated entry naming G5 / published-byte verification, the deferral date (12-05) and the fact that 11-29 does not count it complete; (2) the runbook step 7 either carries the one command or explicitly says it does not; (3) observably, no workflow or `package.json` mentions the script. The failure mode this option accepts: for any release between now and the re-open, a divergence between build-checked and published bytes produces no red anywhere.

**C — two steps: advisory first, decide blocking later.**
Falsifiable consequences: (1) an advisory job exists (dispatch and/or post-publish, `continue-on-error` or outside the merge path) and runs on the next tag; (2) a wrong-`--expect` dispatch is red while the release/merge path stays green — i.e. the advisory job's red is visible but gates nothing; (3) at 12-05 a written ruling says "promote to blocking" or "keep advisory", with the readings from at least two releases attached. The precedent is in-repo: `p019-readings-nightly.yml` was adopted in exactly this shape ("run nightly and observe for two weeks; whether it becomes a blocking job is a separate decision"). C also subsumes B's floor: the deferral of the blocking decision is recorded now.

What each option does **not** do: none of them prevents a bad publish; only the existing pre-publish guard does. None of them retroactively checks 0.1.21 in CI; today's readings are from this manual run.

**中文**

> 三条都接受同一个底线：11-29 **不**把 G5 计入完成，并且要有落款日期的记录写明这一点。

**A —— 现在接线。**
可证伪后果：（1）下一个 tag 上，有一条工作流作业从 Central 读三个已发布 jar，日志列出观测值；（2）用错误 `--expect` 的 dispatch 为红，复原为绿；（3）若按阻塞档接，失败会让发布 run 在产物**已上线之后**变红 —— 可观测的就是「发布 run 红、产物已不可撤回」。成本约 1–1.5 个 AI 日加 CI 批准。在五条缺陷未修的情况下，阻塞档的红也可能其实是工具故障，却被读成「未声明」（§4 第 3 行）。

**B —— 正式记录后置。**
可证伪后果：（1）决定索引里有一条带日期的条目，写明 G5 / 已发布字节核对、后置期限（12-05）以及 11-29 不计完成；（2）runbook 第 7 步或带上那一条命令，或明写不带；（3）可观测地，没有任何 workflow 或 `package.json` 提到该脚本。这条选项接受的失效模式：从现在到重开之间，凡发布出现「被构建检查的字节」与「被发布的字节」分歧，任何地方都不会红。

**C —— 拆两步：先只读告警档，再决定是否阻塞档。**
可证伪后果：（1）存在一条告警档作业（dispatch 和/或发布后触发，`continue-on-error` 或位于合并路径之外），并在下一个 tag 上跑了；（2）错误 `--expect` 的 dispatch 为红，而发布 / 合并路径保持绿 —— 即告警作业的红看得见、但什么都不拦；（3）12-05 有一条书面裁定写明「升为阻塞」或「保持告警」，并附至少两次发布的读数。先例就在仓内：`p019-readings-nightly.yml` 正是这个形态被采纳的（「每夜跑、观察两周；是否改成阻塞作业是之后另行决定的事」）。C 同时含住 B 的底线：阻塞档的后置现在就记录。

三条都**不**做的事：都不阻止坏发布（只有现有的发布前守卫能）；都不会让 CI 回溯检查 0.1.21（今天的读数是本件的手工运行）。

---

## 8. Recommendation (建议，非裁定) / 建议（非裁定）

**English**

**Recommendation: C**, and if the CI-change approval is not granted at the meeting, fall back to **B** with the runbook line. Specifically:

1. **Now:** record the item by name in the decision index (G5 / published-byte contract verification), with "not counted complete on 11-29" and a re-open at the 12-05 review (where App-X is already being reviewed).
2. **Now, if approved:** land an advisory job — `workflow_dispatch` plus a post-publish run with `continue-on-error`, or a separate scheduled workflow following the `p019` pattern — invoking the script for `keelbase4j-protocol`, `keelbase4j-core`, `keelbase4j-springai`, with `--expect` from `check-pin-lag.sh --print-pin` and the runbook's 3×60 s polling.
3. **Before promoting it to blocking** (at 12-05 at the earliest): fix the three cheap defects — stop manifest parsing at the main section's blank line; make a read error print distinctly in text mode (not as "absent"); cap inflated bytes. ≈0.25 day. Until then, an advisory red needs a person to read it, which is exactly what the advisory tier is for.
4. **Separately:** correct the script's header paragraph, which no longer describes the artifacts (0.1.20 onward declare).

Why not A: a blocking post-publish check cannot prevent anything (Central is immutable), and with the error/undeclared conflation a required red would occasionally be a tool fault; wiring blocking before that fix buys visibility that an advisory job already gives. Why not plain B: today's readings show the gate is green on real bytes, the tool is proven, and the pre-publish guard does not cover the deployed bytes — a zero-cost advisory job closes the "unreachable tool" finding and starts accumulating readings, which is precisely what the blocking decision will need. The packet's own B-2 stop condition ("if a CI contract or exit-code change is not approved, keep a local read-only script and record it") is the fallback, not a reason to skip the record.

**If the meeting does not rule:** nothing changes; G5 stays unwired and now also unrecorded in the signed sheet; the 11-24 MEDIUM "unreachable tool" finding stays open; the claim that published artifacts carry a stated contract version remains checked only by whoever chooses to run the script. No red gate anywhere will detect that the ruling never happened — the next time it surfaces will be the 12-05 review, if someone carries it there.

**中文**

**建议：C**；若会上拿不到 CI 改动批准，退回 **B** 并加上 runbook 那一行。具体是：

1. **现在：** 按名字把这一项记进决定索引（G5 / 已发布字节的契约核对），写明「11-29 不计完成」、12-05 复核时重开（App-X 本来就在那天复核）。
2. **现在、若获批准：** 落一条告警档作业 —— `workflow_dispatch` 加发布后运行、`continue-on-error`，或照 `p019` 形态单独一个定时工作流 —— 对 `keelbase4j-protocol`、`keelbase4j-core`、`keelbase4j-springai` 调用该脚本，`--expect` 取 `check-pin-lag.sh --print-pin`，并照 runbook 做 3×60 秒轮询。
3. **升为阻塞档之前**（最早 12-05）：修三条便宜缺陷 —— 清单解析遇主段空行即停；读错在文本模式下单独报出（不要报成「不存在」）；给解压输出设上限。约 0.25 日。在那之前，告警档的红需要人看一眼，这正是告警档存在的意义。
4. **另外：** 更正脚本头部那段已经不再描述产物的文字（0.1.20 起会自述）。

为什么不选 A：发布后的阻塞检查阻止不了任何事（Central 不可撤回），而错误/未声明混在一起时，一道必需的红偶尔会是工具故障；在修掉它之前接阻塞档，买到的可见性告警档已经能给。为什么不是纯 B：今天的读数证明闸在真实字节上是绿的、工具可用，而发布前守卫并不覆盖被部署的字节 —— 一条零成本（CI 侧近似零）的告警作业既关掉「不可达工具」那条发现，又开始积累读数，而这正是阻塞档裁定将来需要的东西。packet 给 B-2 的停止条件（「CI 契约或退出码改动未获批准 ⇒ 保留本地只读脚本并记录」）是退路，不是跳过记录的理由。

**会上不裁的后果：** 一切照旧；G5 仍未接线，而且在要签的单子里也仍未记录；11-24 的 MEDIUM「不可达工具」保持开着；「已发布产物带有所声称的契约版本」这句话仍只靠有人想起去跑脚本来检查。没有任何闸会因「这条裁定从未发生」而变红 —— 下次浮现要等到 12-05 复核，而那也得有人把它带到那里。

---

## 9. Paste-ready line for the decision sheet / 可直接粘进决策单的选项行

**English**

> **G5 — published-artifact contract verification.** The tool works against real bytes: on 2026-11-27 it returned match (exit 0) for `keelbase4j-protocol`, `keelbase4j-core` and `keelbase4j-springai` at 0.1.21 against `v1.23.0`, mismatch (exit 1) with a wrong expected value, and undeclared (exit 2) for 0.1.19. It is still referenced by no workflow, runbook or `package.json`. Options: **(A)** wire it now — a CI job after publish, ≈1–1.5 AI-days plus the CI change approval; a post-publish red cannot prevent a release, only make it visible. **(B)** record the deferral formally — a dated decision-index entry naming G5, "not complete on 11-29", re-open at 12-05, plus one command in runbook step 7. **(C)** two steps — an advisory (non-blocking) job now, no CI contract change beyond adding a job, and the blocking decision at 12-05 with at least two releases of readings. **Suggested (not a ruling): C**, falling back to B with the runbook line if the CI approval is refused; before any promotion to blocking, fix the manifest-section, error-reporting and inflate-bound defects (≈0.25 day). Under every option G5 is not counted complete on 11-29.

**中文**

> **G5 —— 已发布产物的契约核对。** 工具在真实字节上可用：2026-11-27 对 0.1.21 的 `keelbase4j-protocol`、`keelbase4j-core`、`keelbase4j-springai` 与 `v1.23.0` 比对返回一致（exit 0），用错误的期望值返回不一致（exit 1），对 0.1.19 返回未声明（exit 2）。它仍无任何 workflow、runbook 或 `package.json` 引用。选项：**（A）现在接线** —— 发布后一条 CI 作业，约 1–1.5 个 AI 日加 CI 改动批准；发布后的红阻止不了发布，只能让它可见。**（B）正式记录后置** —— 决定索引里一条带日期的条目，写明 G5、「11-29 不计完成」、12-05 重开，并在 runbook 第 7 步加一条命令。**（C）拆两步** —— 先落告警（非阻塞）作业，除新增作业外不改 CI 契约；阻塞与否到 12-05 凭至少两次发布的读数决定。**建议（非裁定）：C**；若 CI 批准被拒，退回 B 并加 runbook 那一条；在升为阻塞档之前，先修清单段落、错误报告与解压上限三条缺陷（约 0.25 日）。无论哪条，11-29 都不把 G5 计入完成。

---

## 10. Sources and what was not verified / 出处与未核项

**English**

**Primary sources read.** `handoff/cto-1128-decisions-1126.md` (index, D1–D5, line 15 on the two D-lists); `handoff/nextstage-abc-1126.md` §1, §3 (B-2), §6 (D4 = G5); `handoff/v1230-runbook-1126.md` step 7 (lines 383–399); `KeelBase/scripts/check-artifact-contract.mjs` (full read) and `check-artifact-contract.test.mjs`; `KeelBase/handoff/r1-v150-prep-1124.md` lines 55, 96, 169; `KeelBase4J/pom.xml` lines 167–237 (manifest profile); `KeelBase4J/.github/workflows/release.yml` lines 1–40, 140–249, 295–305; `KeelBase4J/scripts/check-jar-contract-version.sh` (header); `KeelBase/.github/workflows/p019-readings-nightly.yml` (header); `KeelBase/.github/workflows/tag-lineage.yml` (triggers).

**Executed.** The eight readings in §2, against live Central; the script was not modified, and `git status` in `KeelBase` was clean before and after.

**Not verified here.** The GitHub Actions detail of run `45822868092` (the success and 3m42s come from the decision sheet, not re-read here); whether the CI change approval would be granted, or by whom; whether `.sha256` sidecars exist for the protocol and springai jars as well (the sha check matched for core only; the other two runs still verified the manifest and version); the parent pom's `200` (no jar to read; covered by runbook step 7); how many minutes Central's indexing actually lags on this account (the runbook's 3×60 s is the standing assumption).

**中文**

**读过的主要出处。** `handoff/cto-1128-decisions-1126.md`（索引、D1–D5、第 15 行关于两套 D 编号的说明）；`handoff/nextstage-abc-1126.md` §1、§3（B-2）、§6（D4 = G5）；`handoff/v1230-runbook-1126.md` 第 7 步（383–399 行）；`KeelBase/scripts/check-artifact-contract.mjs`（全文）与 `check-artifact-contract.test.mjs`；`KeelBase/handoff/r1-v150-prep-1124.md` 55、96、169 行；`KeelBase4J/pom.xml` 167–237 行（清单 profile）；`KeelBase4J/.github/workflows/release.yml` 1–40、140–249、295–305 行；`KeelBase4J/scripts/check-jar-contract-version.sh`（头部）；`KeelBase/.github/workflows/p019-readings-nightly.yml`（头部）；`KeelBase/.github/workflows/tag-lineage.yml`（触发）。

**已执行。** §2 的八项读数，对 Central 实时运行；脚本未做任何修改，`KeelBase` 的 `git status` 在运行前后均为空。

**本件未核。** GitHub Actions run `45822868092` 的细节（成功与 3m42s 来自决策单，本件未重读该 run）；CI 改动批准是否会给出、由谁给；`protocol` 与 `springai` 的 jar 是否也有 `.sha256` 旁文件（sha 校验只在 core 上验到；另两次仍验了清单与版本）；父 pom 的 `200`（无 jar 可读，由 runbook 第 7 步覆盖）；该账号下 Central 入索引的实际延迟分钟数（3×60 秒是 runbook 的既定假设）。

---

*Read-only material for the 2026-11-28 CTO weekly. No repository, workflow, `package.json`, decision index or plan was changed; nothing was committed, pushed or triggered; G5 is not wired and is not counted complete on 11-29 under any option. — 供 2026-11-28 CTO 周会使用的只读材料；未改任何仓、工作流、`package.json`、决定索引或计划，未提交、未推送、未触发 CI；G5 未接线，任何选项下 11-29 都不计入完成。*
