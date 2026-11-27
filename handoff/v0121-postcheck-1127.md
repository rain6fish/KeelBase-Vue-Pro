# KeelBase4J v0.1.21 — post-release check, 2026-11-27

Read-only verification of the 2026-11-26 release window (4J cut, tag, Central, host pin, contract). No repository was modified, nothing was pushed, no tag, no Release page, no commit. Observation window: 2026-11-26T23:45Z–23:55Z (local 2026-11-27 07:45–07:55 +0800).

## English

### Method

- Local repositories read directly (`D:/Rain6fish/KeelBase4J`, `D:/Rain6fish/KeelBase-Vue-Pro`, `D:/Rain6fish/keelbase-contract`).
- Both remotes read live with `git ls-remote` in one snapshot at 2026-11-26T23:51:40Z (4J), 23:51:50Z (host), 23:51:54Z (contract).
- GitHub read through the REST API unauthenticated (the local `gh` token is invalid: `X Failed to log in ... The token in keyring is invalid`), plus the Actions and Releases HTML pages. `gh run view` itself could not run.
- Maven Central read directly at `repo.maven.apache.org`; the proxy TLS was intermittent, requests were retried until every one returned 200. As a cross-check the same artifacts were fetched from the Aliyun mirror and hashed.

### Verification table

| # | Item | Reading | Source | Verdict |
|---|---|---|---|---|
| 1 | `v0.1.21` tag, origin | `edb27b14875d93ab27985c62e1af44ab593b13bf` → peeled `e8e9cad1596c6319f25a4abc200253ed20d8ae7f` | `git ls-remote --tags origin v0.1.21*` @23:51:40Z | PASS |
| 1 | `v0.1.21` tag, gitee | same object `edb27b1…`, same peel `e8e9cad…` | `git ls-remote --tags gitee v0.1.21*` @23:51:40Z | PASS |
| 1 | tag type / target is main | annotated tag object, tagger Rain; origin main = gitee main = `e8e9cad…`; local tag object `type commit → e8e9cad…` | `git cat-file -p v0.1.21`; `ls-remote … refs/heads/main` | PASS |
| 2 | Release run `45822868092` | name `Release`, event `push`, status `completed`, conclusion `success`, head_sha `e8e9cad…`, head_branch `v0.1.21`, 12:46:55Z–12:50:40Z | `api.github.com/repos/rain6fish/KeelBase4J/actions/runs/45822868092` | PASS, matches step 2 |
| 2 | cut commit CI `45821202357` | CI / push / completed / success on `e8e9cad…`, started 12:36:17Z | same API, runs filtered by `head_sha=e8e9cad…` | PASS |
| 3 | Central parent pom | HTTP 200, 13762 bytes | `repo.maven.apache.org/.../keelbase4j/0.1.21/keelbase4j-0.1.21.pom` | PASS |
| 3 | Central `keelbase4j-protocol` jar | HTTP 200, 38793 bytes | same | PASS |
| 3 | Central `keelbase4j-core` jar | HTTP 200, 426416 bytes | same | PASS |
| 3 | Central `keelbase4j-springai` jar | HTTP 200, 20867 bytes | same | PASS |
| 3 | core `.sha256` | Central file `b1d4588f75b9274ea0853be1c4f553c5c9b542f8df5f2c786ebf6e722b497551` = sha256 of the downloaded jar = value recorded in step 3 | Central `.sha256` + `sha256sum` | PASS |
| 3 | protocol / springai `.sha256` | `31f281c6481fb96fc12c78506b4b20114c6ea4899fe86b396c30f416c338b471` / `c895dc389ee1769e72f47230ceb3801d8d0c8e6b9c563735dfac5cade068ff85`, each equals its own jar | same | PASS |
| 3 | metadata | `<latest>0.1.21</latest>`, `<release>0.1.21</release>`, `<lastUpdated>20261126132652</lastUpdated>` | `…/keelbase4j-core/maven-metadata.xml` | PASS |
| 3 | jar manifests | all three jars: `Implementation-Version: 0.1.21`, `KeelBase-Contract-Version: v1.23.0` | `unzip -p … META-INF/MANIFEST.MF` | PASS |
| 3 | Aliyun mirror cross-check | same four byte counts; core sha256 `b1d4588f…`; core sha1 `be54d6a8…`; protocol sha1 `c42e3ec2…`; springai sha1 `6f43fd6b…` | `maven.aliyun.com/repository/public/...` | bytes identical |
| 4 | host poms | 3 files, 6 literal `0.1.21` occurrences: `keelbase-codegen/pom.xml:31,37,41`, `yudao-module-ai1-springai/pom.xml:44`, `yudao-server/pom.xml:39,55`; zero `0.1.20` in tracked poms | `git grep -n '0\.1\.21' -- '*pom.xml'` | PASS (count note below) |
| 4 | pin commit | `5a204b23481769a7c5a0a1e4b2c1c527143a491f`, parent `bd466ea571…`, 3 files +6/−6, on main | `git log -1`, `git show --stat` | PASS |
| 4 | host main, both remotes | origin = gitee = `5a204b23…` @23:51:50Z | `git ls-remote … refs/heads/main` | PASS |
| 5 | CHANGELOG | `## [0.1.21] - 2026-11-26` at `CHANGELOG.md:13` | `git grep -n '^## \[0.1.21\]'` | PASS |
| 5 | no SNAPSHOT | `pom.xml:16` `<version>0.1.21</version>`; no tracked `0.1.21-SNAPSHOT` anywhere | `git grep … HEAD` | PASS |
| 6 | contract tag | annotated `71496bd69b086b9100e18c60d8e8bce2b58a9bc7` → `015f474ebf0cf5f45c855614b18020857665c700`, identical on origin and gitee | `git ls-remote --tags … v1.23.0*` @23:51:54Z | PASS |
| 6 | contract main | origin = gitee = `eb99d11ea95a1752ff4773bac5df9a27d3c11362` | same | PASS |
| 6 | contract CI | Tag lineage run `45380594496` (`v1.23.0`): `WORKFLOW_RUN_CONCLUSION_SUCCESS`; CI page lists 25 runs, all `SUCCESS`, `eb99d11` push run at top | GitHub Actions HTML | PASS |
| 6 | no Release page | GitHub contract releases page shows only `v1.11.0`, `v1.12.0`; Gitee API same. 4J: GitHub latest page tag `v0.1.20`, no `v0.1.21`; Gitee releases stop at `v0.1.20` | GitHub `/releases`, Gitee `/api/v5/.../releases` | PASS (as decided) |

### Differences from the step 1–3 reports

1. **Host pin literal count.** Step 3 §4 states "3 files, 5 places", and the task brief expected "5 literals". The measurement is **6 literal occurrences in 3 files**, and step 3's own table below that sentence lists **6 rows**. The bilingual comment block in `keelbase-codegen/pom.xml` (Chinese at :31, English at :37) is one comment but two literal `0.1.21` strings. Functional state is correct — every pre-pin `0.1.20` literal was replaced and none remains — but the number "5" is a bookkeeping error in the report (and in the brief that repeated it).
2. **Method, not fact.** `gh run view` could not be used: the `gh` credential in the keyring is invalid (`gh auth status`). Run facts were taken from the unauthenticated REST API and the Actions HTML, which agree with step 2 on run id, conclusion, head SHA and timestamps.
3. **Untracked build output.** Tracked poms are clean, but 66 untracked `pom.xml` files under `target/` and `.claude/worktrees/` still carry `0.1.21-SNAPSHOT` (step 1 saw 18 at the time). These are ignored build products, not repository state; the count moves with every build.
4. **Contract tag vs main tip.** `v1.23.0` points at `015f474e`; contract main is one docs-only commit ahead (`eb99d11`, "releases are tags, never pages"). The tag is an ancestor of main. Step 1 reported this correctly; noted here only so nobody reads "tag ≠ main tip" as a fault.

No other difference was found: Central byte counts, the core sha256, the release run, the host pin commit and its parents, and the tag objects all match the step 1–3 reports exactly.

### Boundary

Read-only throughout. No repo files were modified, nothing pushed, no tag created or moved, no Release page created, nothing committed (including this report). Items that could not be read at the moment of checking: none remained at the end — every item above was read live, after retrying the flaky proxy connection.

## 中文

### 方法

- 三个本地仓直接读取（`D:/Rain6fish/KeelBase4J`、`D:/Rain6fish/KeelBase-Vue-Pro`、`D:/Rain6fish/keelbase-contract`）。
- 两远端用 `git ls-remote` 在同一时点取快照：4J 2026-11-26T23:51:40Z、宿主 23:51:50Z、契约 23:51:54Z。
- GitHub 走未认证 REST API（本机 `gh` 凭据已失效：`X Failed to log in … The token in keyring is invalid`），并读 Actions 与 Releases 的 HTML 页；`gh run view` 本身跑不了。
- Maven Central 直连 `repo.maven.apache.org`；代理 TLS 时断时续，逐条重试到全部 200。另从阿里云镜像取同一批构件做哈希交叉核对。

### 核对表

| # | 项 | 读数 | 出处 | 判定 |
|---|---|---|---|---|
| 1 | `v0.1.21` tag（origin） | `edb27b14875d93ab27985c62e1af44ab593b13bf` → 解引用 `e8e9cad1596c6319f25a4abc200253ed20d8ae7f` | `git ls-remote --tags origin v0.1.21*` @23:51:40Z | 通过 |
| 1 | `v0.1.21` tag（gitee） | 同一对象 `edb27b1…`，同一解引用 `e8e9cad…` | `git ls-remote --tags gitee v0.1.21*` @23:51:40Z | 通过 |
| 1 | tag 类型 / 指向 main | annotated tag 对象，tagger Rain；origin main = gitee main = `e8e9cad…`；本地 tag 对象 `type commit → e8e9cad…` | `git cat-file -p v0.1.21`；`ls-remote … refs/heads/main` | 通过 |
| 2 | 发布 run `45822868092` | 名称 `Release`、事件 `push`、状态 `completed`、结论 `success`、head_sha `e8e9cad…`、head_branch `v0.1.21`、12:46:55Z–12:50:40Z | `api.github.com/repos/rain6fish/KeelBase4J/actions/runs/45822868092` | 通过，与第 2 步一致 |
| 2 | 收束提交 CI `45821202357` | CI / push / completed / success，`e8e9cad…`，起于 12:36:17Z | 同一 API，按 `head_sha=e8e9cad…` 过滤 | 通过 |
| 3 | Central 父 pom | HTTP 200，13762 字节 | `repo.maven.apache.org/.../keelbase4j/0.1.21/keelbase4j-0.1.21.pom` | 通过 |
| 3 | Central `keelbase4j-protocol` jar | HTTP 200，38793 字节 | 同上 | 通过 |
| 3 | Central `keelbase4j-core` jar | HTTP 200，426416 字节 | 同上 | 通过 |
| 3 | Central `keelbase4j-springai` jar | HTTP 200，20867 字节 | 同上 | 通过 |
| 3 | core `.sha256` | Central 文件 `b1d4588f75b9274ea0853be1c4f553c5c9b542f8df5f2c786ebf6e722b497551` = 下载件实测 = 第 3 步所记值 | Central `.sha256` + `sha256sum` | 通过 |
| 3 | protocol / springai `.sha256` | `31f281c6481fb96fc12c78506b4b20114c6ea4899fe86b396c30f416c338b471` / `c895dc389ee1769e72f47230ceb3801d8d0c8e6b9c563735dfac5cade068ff85`，各自与下载件一致 | 同上 | 通过 |
| 3 | 元数据 | `<latest>0.1.21</latest>`、`<release>0.1.21</release>`、`<lastUpdated>20261126132652</lastUpdated>` | `…/keelbase4j-core/maven-metadata.xml` | 通过 |
| 3 | jar 清单 | 三个 jar 均 `Implementation-Version: 0.1.21`、`KeelBase-Contract-Version: v1.23.0` | `unzip -p … META-INF/MANIFEST.MF` | 通过 |
| 3 | 阿里云镜像交叉核对 | 四个字节数相同；core sha256 `b1d4588f…`；core sha1 `be54d6a8…`；protocol sha1 `c42e3ec2…`；springai sha1 `6f43fd6b…` | `maven.aliyun.com/repository/public/...` | 字节一致 |
| 4 | 宿主 pom | 3 文件 6 处 `0.1.21` 字面：`keelbase-codegen/pom.xml:31,37,41`、`yudao-module-ai1-springai/pom.xml:44`、`yudao-server/pom.xml:39,55`；tracked pom 中无 `0.1.20` | `git grep -n '0\.1\.21' -- '*pom.xml'` | 通过（计数注见下） |
| 4 | pin 提交 | `5a204b23481769a7c5a0a1e4b2c1c527143a491f`，父提交 `bd466ea571…`，3 文件 +6/−6，在 main 上 | `git log -1`、`git show --stat` | 通过 |
| 4 | 宿主 main 两远端 | origin = gitee = `5a204b23…` @23:51:50Z | `git ls-remote … refs/heads/main` | 通过 |
| 5 | CHANGELOG | `## [0.1.21] - 2026-11-26`，位于 `CHANGELOG.md:13` | `git grep -n '^## \[0.1.21\]'` | 通过 |
| 5 | 无 SNAPSHOT | `pom.xml:16` `<version>0.1.21</version>`；tracked 范围无 `0.1.21-SNAPSHOT` | `git grep … HEAD` | 通过 |
| 6 | 契约 tag | annotated `71496bd69b086b9100e18c60d8e8bce2b58a9bc7` → `015f474ebf0cf5f45c855614b18020857665c700`，origin 与 gitee 相同 | `git ls-remote --tags … v1.23.0*` @23:51:54Z | 通过 |
| 6 | 契约 main | origin = gitee = `eb99d11ea95a1752ff4773bac5df9a27d3c11362` | 同上 | 通过 |
| 6 | 契约 CI | Tag lineage run `45380594496`（`v1.23.0`）：`WORKFLOW_RUN_CONCLUSION_SUCCESS`；CI 页列出 25 条 run 全为 `SUCCESS`，最上为 `eb99d11` 推送 | GitHub Actions HTML | 通过 |
| 6 | 无 Release 页 | GitHub 契约 releases 页只有 `v1.11.0`、`v1.12.0`；Gitee API 同。4J：GitHub 最新页 tag 为 `v0.1.20`，无 `v0.1.21`；Gitee releases 止于 `v0.1.20` | GitHub `/releases`、Gitee `/api/v5/.../releases` | 通过（合裁定） |

### 与第 1–3 步报告不一致项

1. **宿主 pin 的字面计数。** 第 3 步 §4 写「3 文件 5 处」，本核对任务书也写「预期 5 处字面」。实测是 **3 文件 6 处字面**，而第 3 步在那句话下面自己的表就列了 **6 行**。`keelbase-codegen/pom.xml` 的中英双语注释块（中文在 :31、英文在 :37）是一段注释，却含两个 `0.1.21` 字面。功能状态正确 —— 抬版本前的每个 `0.1.20` 字面都已替换、一个不剩 —— 但「5」这个数是报告（以及沿用它的任务书）的记账错误。
2. **方法差异，不是事实差异。** `gh run view` 用不了：钥匙串里的 `gh` 凭据已失效（`gh auth status` 报 invalid）。发布 run 的事实取自未认证 REST API 与 Actions HTML，二者在 run id、结论、head SHA、时间上与第 2 步一致。
3. **未跟踪构建产物。** tracked pom 干净，但 `target/` 与 `.claude/worktrees/` 下仍有 66 个未跟踪 `pom.xml` 带 `0.1.21-SNAPSHOT`（第 1 步当时看到 18 个）。这些是被忽略的构建产物，不是仓内状态；计数随每次构建变动。
4. **契约 tag 与 main 尖端。** `v1.23.0` 指向 `015f474e`，契约 main 比它多一笔纯文档提交（`eb99d11`，「发布以 tag 为准，不维护发布页」）。tag 是 main 的祖先。第 1 步对此的记述正确；此处只作说明，免得把「tag ≠ main 尖端」误读成故障。

除此之外未发现其它不一致：Central 字节数、core 的 sha256、发布 run、宿主 pin 提交及其父提交、两仓的 tag 对象，均与第 1–3 步报告逐项吻合。

### 边界

全程只读。未改任何仓内文件、未推送、未建或移动 tag、未建 Release 页、未提交（含本报告）。核对时读不到的项目：到最后一项都没有留下 —— 上面每一行都是实时读数，代理抖动时逐条重试后取到。

---

核对时间：2026-11-26T23:45Z–23:55Z（本地 2026-11-27 07:45–07:55 +0800）。
