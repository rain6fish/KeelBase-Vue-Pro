# G5 — Central bytes vs the declared contract / G5 —— 已发布字节与契约声明

# English

Technical preparation for **B-2 (how to dispose of G5)** at the 2026-11-28 CTO weekly. It lays both routes out in full and **does not choose**. Read-only: no repository was modified, no gate was wired, nothing was committed or pushed. Written 2026-11-27 (+08). Numbering note: `nextstage-abc-1126.md` §6 calls the G5 decision **D4**, while the packet's **D4** is W1.4 — this sheet says **B-2 / G5** throughout.

## 0. Readings taken for this sheet

| # | Fact | Reading | Source |
|---|---|---|---|
| 1 | The script exists, and is small | 463 lines + a 10-case, 222-line `node:test` file | `KeelBase/scripts/check-artifact-contract.mjs`, `.test.mjs` |
| 2 | Added, last touched | `6694ea06` 2026-11-19; `ef61a882` 2026-11-21 | `git log` in `KeelBase` |
| 3 | **Zero wiring, re-confirmed** | No `package.json` script, no workflow reference, no runbook line. Only `CHANGELOG.md`, `docs/releases/v1.5.0.md` and the R1 review mention it | repo-wide grep; `handoff/r1-v150-prep-1124.md:96` (rated MEDIUM, "ADD an invocation point … or DELETE") |
| 4 | Its unit test **does** run | `cli:test` = `node --test "scripts/*.test.mjs"`, run in CI | `package.json`; `.github/workflows/ci.yml:813` |
| 5 | **The header's own claim is stale** | The header says it "today answers 'undeclared' for every published artifact". `0.1.20` (2026-11-21) added `KeelBase-Contract-Version` to every jar through a Maven profile, so this stopped being true two releases ago | script lines 67–72; `KeelBase4J/pom.xml:200–217`; `KeelBase4J/CHANGELOG.md:131–138` |
| 6 | **The published bytes really do declare** | `0.1.21`: all three jars carry `KeelBase-Contract-Version: v1.23.0`; core `.sha256` `b1d4588f…` equals the downloaded jar | `handoff/v0121-postcheck-1127.md` row 3 (read 2026-11-26T23:51Z) |
| 7 | The **local** build is already checked | Before the signing key is imported, 4J reads its own `target/` jars back, same 0/1/2 exit codes | `KeelBase4J/.github/workflows/release.yml:234–238`; `scripts/check-jar-contract-version.sh:6–27` |
| 8 | Nothing checks the bytes **after** Central | `release.yml` ends at the deploy step; there is no post-deploy step | `KeelBase4J/.github/workflows/release.yml` (last step ~304) |
| 9 | Central propagation, observed once | Run `45822868092` ended 12:50:40Z; `maven-metadata.xml` `lastUpdated` 20261126132652Z ⇒ **≤ 36 min** on that release | `v0121-postcheck-1127.md` rows 2–3 |
| 10 | The host pins the artifact version | Host poms pin `0.1.21` (3 files, 6 literals) | `v0121-postcheck-1127.md` row 4 |
| 11 | KeelBase's own 4J row is **stale** | `KeelBase/README.md:311` still says `v0.1.20` | `README.md:311`; `cto-1128-update-1127.md` |
| 12 | The contract version's single source | Tag `v1.23.0` → `015f474e`; the submodule gitlink is `015f474e`; `check-contract-matrix` compares the README `main` row with the pin tag | `git submodule status`; `scripts/check-contract-matrix.mjs` |
| 13 | **No outbound network from this host** | `HTTPS_PROXY=127.0.0.1:7890` does not answer and direct TLS fails, so Central was **not** re-read here | `curl` and `fetch` both failed; row 6 is quoted |
| 14 | Four gates closed, G5 the last | G1 strict switch landed (CI still warns only), G2 is a read-only surface, G3/G4 green in CI, G5 zero wiring | `nextstage-abc-1126.md` §1, §3 |

## 1. What this gate must prove

**In one sentence.** For each Maven coordinate the host actually consumes (`cn.com.keelbase:<artifact>:<version>`), fetch the jar **and** Central's published `.sha256`, confirm the bytes are the ones Central records, read the **first** declaration site inside the jar that answers, and require that value to equal the contract tag the build was given — with a leading `v` and surrounding whitespace normalized away.

### 1.1 Inputs

| Input | Where it comes from | Fails how |
|---|---|---|
| Coordinate | group `cn.com.keelbase`; artifact ∈ {`keelbase4j-protocol`, `keelbase4j-core`, `keelbase4j-springai`}; version **explicit** (the script refuses "latest") | exit 2 |
| Jar bytes | `repo1.maven.org/maven2/...`, or `--repo` (e.g. an Aliyun mirror) | exit 2, printed as "UNVERIFIED, not a pass" |
| Published digest | Central's `<jar>.sha256` | absent ⇒ **reported, not fatal** |
| Self-declared version | in order: `META-INF/MANIFEST.MF` → `META-INF/keelbase-contract.properties` → `keelbase-provenance.json` → embedded `pom.xml` `<properties>` | none ⇒ exit 2 "UNDECLARED" |
| Expected value | the contract tag: the submodule gitlink's tag (`v1.23.0` = `015f474e`), or `--expect` | a wrong source ⇒ green on the wrong pair |

### 1.2 What it does **not** prove

- Not that the artifact is the one the host pinned — unless the version is derived from the host, it only proves "this published artifact names this contract".
- Not that the build is reproducible, and not that the contract's schemas have an implementer (that is `check-contract-release-gate.mjs` C1–C5).
- Not a substitute for 4J's pre-deploy check: that one reads the **built** jar, this one reads what **Central serves**.

## 2. Route A — wire it

### 2.1 Where the job would live

| Home | What it would see | Facts that bear on it |
|---|---|---|
| **A1 · 4J `release.yml`, after the deploy step** | The version just published, and `$KEELBASE_CONTRACT_VERSION` already in env | `release.yml:190` sets the pin; deploy is the last step |
| **A2 · 4J, a separate workflow** (`workflow_dispatch`, optional `schedule`) | A named released version, passed in | Nothing in 4J is scheduled today; `contract-pin` records why a `schedule:` on `ci.yml` was refused |
| **A3 · `KeelBase` (main repo) CI** | The consumer's view; precedent exists for checking out the sibling | `release-gate` checks out `rain6fish/KeelBase4J` at `main` (`ci.yml:974–982`); the script already lives in this repo |
| **A4 · host (`KeelBase-Vue-Pro`) CI** | The host's own pin | **Not evaluated**: the host carries the runtime pin (`0.1.21`) but no contract pin of its own; where `--expect` would come from was not verified |

### 2.2 For A1/A2 the script is in the wrong repository

`check-artifact-contract.mjs` (463 lines) and its test live in `KeelBase/scripts/`; 4J has its own bash twin with the same exit codes but reading local files. Wiring in 4J therefore needs one of: move the script (and delete it from `KeelBase` — the R1 review already offered deletion as an option), check `KeelBase` out beside 4J, or run it from `KeelBase` (that is A3). Copying 463 lines into a second repository would put two copies of one rule in play — the failure the R1 review and the gate-coverage guard exist to catch.

### 2.3 Requirements

- **Network**: `repo1.maven.org` (public read, no credentials) or a mirror via `--repo`. From mainland China a mirror is faster, but Central is the authority.
- **Node only**: zero dependencies, `fetch` plus a hand-rolled ZIP reader.
- **Expected value**: the contract tag in the checkout (`submodules: true`, then `git -C Server-NestJS/specs/protocol describe --tags --exact-match`), or the README `main` row through the comparison `check-contract-matrix` already does.
- **CI change approval**: a new job, or a step in the release workflow.
- **Gate bookkeeping**: a `check:artifact-contract` script added to the root `package.json` must also be declared in `gate-coverage.mjs` (`NOT_COVERED`, or run by `check:all`), or `check:coverage-gaps` turns red — see the guard's message at `gate-coverage.mjs:302`.
- **Runbook line**: `docs/manual/release-precheck.md` §④ (版本 bump 与版本对账) is the human-facing place.

### 2.4 Minimum viable job (sketch only — not applied)

```yaml
# Sketch. Not applied anywhere.
  artifact-contract:                       # proposed job
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with: { submodules: true }
      - uses: actions/setup-node@v5
        with: { node-version: '22' }
      - name: Values come from the tree, never typed
        run: |
          set -eu
          echo "EXPECT=$(git -C Server-NestJS/specs/protocol describe --tags --exact-match)" >> "$GITHUB_ENV"
          echo "VER=$(node -p "require('./package.json').keelbaseRuntimeVersion || ''")" >> "$GITHUB_ENV"   # A3: host pin; A1/A2: project.version
      - name: Wait for Central to serve the bytes (bounded)
        run: |
          for i in $(seq 1 20); do
            curl -fsS "https://repo1.maven.org/maven2/cn/com/keelbase/keelbase4j-core/$VER/keelbase4j-core-$VER.jar.sha256" >/dev/null && exit 0
            sleep 60
          done
          echo "::warning::Central still does not serve $VER after 20 min"
      - name: Published bytes declare the contract
        run: |
          for a in keelbase4j-protocol keelbase4j-core keelbase4j-springai; do
            node scripts/check-artifact-contract.mjs --artifact "$a" --version "$VER" --expect "$EXPECT"
          done
```

Three artifacts, three invocations; the parent pom is not a jar and is out of scope. Exit code 2 must fail the step — a `|| true` here turns the gate into decoration.

### 2.5 Failure surface

Exit 0 = declared and equal; exit 1 = declared but different (the observed value is printed); exit 2 = undeclared, undownloadable, unreadable, or a digest mismatch — and **2 is not a pass**. A missing `.sha256` is printed and the run continues (`survivedSha256Check = null`); that is evidence semantics, not a pass either.

## 3. Route B — record the deferral formally

### 3.1 Where the record goes

| Layer | File | What it must say |
|---|---|---|
| Decision single source | `KeelBase-Private/KeelBase-Vue-Pro/决定索引.md` §3, as the next free number **D70** | G5 is deferred under D67/U6; what exists (script + 10 tests, zero wiring); what is **not** claimed; the unfreeze conditions; the reviewer |
| Residual track | `handoff/nextstage-abc-1126.md`, B-2 row | The same wording, so the meeting copy and the decision index agree |
| Machine-readable (optional) | `scripts/gate-coverage.mjs` `NOT_COVERED` | "Not run by `check:all`: it reads Maven Central; the deferral is D70" — then every `check:all` run prints the gap instead of hiding it |
| Human runbook | `docs/manual/release-precheck.md` §④ | One line: this check is not part of the release precheck, and why |

D67's standing constraint still applies: **11-29 does not count G5 as complete under either route**. A deferral is not a completion.

### 3.2 Who reviews it, and when

- **Reviewer**: the user (CTO). D67's last column names the user, and the index's convention is that this column owns the entry.
- **Review points**: the 2026-11-29 close-out, and every release precheck §④ while the deferral stands.

### 3.3 Unfreeze conditions (candidates — the choice is the CTO's)

1. A publish path that bypasses the `contract-version` profile — 4J's own pom comment records that `maven-jar-plugin` 3.x leaves an up-to-date jar alone, which already produced silent jars once (`pom.xml:218–224`).
2. The host moves its runtime pin to a version whose declaration nobody has read.
3. Any release built outside `release.yml` (the pom comment says such an artifact "keeps saying nothing").
4. Before any external statement that what Central serves matches the contract.
5. The 4J workflow changes how `-Dkeelbase.contract.version` is injected.

## 4. Both routes side by side

| | **A — wire** | **B — record the deferral** |
|---|---|---|
| AI effort | 1–1.5 AI-days: job, bounded wait, three invocations, gate-coverage declaration, runbook line, **and fixing the stale header** | ~0.25 day: one index entry, one B-2 row, one runbook line; about 0.1 day more if the `NOT_COVERED` entry is added |
| CI minutes | ~1 min per run (three jars: 39 KB, 426 KB, 21 KB; caps 64 MB per file, 4 MB per entry) | 0 |
| Third-party dependency | Every run depends on Central (or a mirror) and DNS | none |
| Red for the wrong reason | Real: network, proxy, propagation delay, mirror inconsistency | none |
| Release pace | A1 adds up to ~36 min of waiting per release (observed once, row 9) and can red **after** an irreversible publish; A2/A3 do not | unaffected |
| What only it catches | The bytes Central **serves**: upload-side transformation, a wrong artifact, a deploy that never completed | nothing (no coverage gained) |
| Residual risk if chosen | Gate hygiene: an ignored red, or a `|| true` that voids it | The gap stays invisible to anyone who does not read the index, unless the `NOT_COVERED` entry is added |
| Falsifiable acceptance | `0.1.21` + `--expect v1.23.0` ⇒ 0; + `--expect v1.22.0` ⇒ 1; a nonexistent version ⇒ 2; a jar built without the property (`--jar`, plain `mvn package`) ⇒ 2 | the D number is greppable in the index; `check:all` (or the runbook) names the gap; no line anywhere says G5 is complete |

### 4.1 Risks specific to route A

- **R1 — a red that is not about the thing it judges.** 4J's `contract-pin` job already argues this in writing: a gate that needs a remote "can go red because a remote had a bad minute, and a gate that can go red for something other than the thing it judges is a gate that gets switched off" (`ci.yml:239–242`). G5 needs a third party by construction.
- **R2 — propagation.** The one measurement is ≤36 min (row 9) on one release, not a bound. A release-time gate must either wait (A1) or can red after the bytes are published and cannot be recalled.
- **R3 — undeclared by build, not by defect.** If the profile is not active the jar says nothing and the script returns 2 — correct, but it reads as "the release is broken" when the truth is "this build was not given the property".
- **R4 — stale expected or actual value.** KeelBase's README 4J row still says `v0.1.20` (row 11); a job deriving either value from README would judge a stale pair green.
- **R5 — the header would mislead the next reader.** Lines 67–72 still say every artifact answers "undeclared"; wiring without correcting that plants a false premise in the repository.
- **R6 — the three exit codes must survive.** Collapsing 2 into 0, or wrapping with `|| true`, makes the gate permanently green. The test file pins the 0/1/2 branches; nothing pins the workflow's use of them.

## 5. This sheet does not choose

Both routes are written in full above. Nothing here recommends one, and no gate was wired. B-2 asks the CTO to decide: wire it (and which home, A1/A2/A3), or record the deferral (and whether to add the machine-readable `NOT_COVERED` entry) — and in both cases confirm that 11-29 does not count G5 as complete.

## 6. Not verified here

1. **Central was not re-read**: no outbound network from this host (proxy `127.0.0.1:7890` down, direct TLS fails). Rows 6, 9 and 10 are quoted from the post-release check.
2. **No job was executed**: the sketch in §2.4 has not been run, and its `$VER` line is a placeholder — `package.json` has no version field today.
3. **Whether `.sha256` is served for every artifact**: three were seen for `0.1.21`; older versions were not checked.
4. **A4 (host-side wiring)** was named and not evaluated.
5. **The 36-minute figure** is one release's metadata timestamp difference, not a measured guarantee.

*Read-only throughout; this file is the only thing written.*

---

# 中文

2026-11-28 CTO 周会 **B-2（G5 处置）** 的技术备料：把两条路写全，**不选**。只读：未改任何仓、未接线、未提交、未推送。成稿 2026-11-27（+08）。编号注：`nextstage-abc-1126.md` §6 把 G5 决定编作 **D4**，而 packet 的 **D4** 是 W1.4 —— 本件一律称 **B-2 / G5**，避开撞号。

## 0. 本件所用读数

| # | 事实 | 读数 | 出处 |
|---|---|---|---|
| 1 | 脚本在，体量不大 | 463 行 + 10 例 222 行的 `node:test` | `KeelBase/scripts/check-artifact-contract.mjs`、`.test.mjs` |
| 2 | 新增与最后修改 | `6694ea06` 2026-11-19；`ef61a882` 2026-11-21 | `KeelBase` 的 `git log` |
| 3 | **零接线，复核成立** | `package.json` 无脚本、workflow 无引用、runbook 无一行；只有 `CHANGELOG.md`、`docs/releases/v1.5.0.md` 与 R1 评审提到它 | 全仓 grep；`handoff/r1-v150-prep-1124.md:96`（评 MEDIUM，「加调用点或删掉」） |
| 4 | 它的单元测试**确实**在跑 | `cli:test` = `node --test "scripts/*.test.mjs"`，在 CI 里跑 | `package.json`；`.github/workflows/ci.yml:813` |
| 5 | **脚本头部的自述已过期** | 头部写「今天对每个已发布构件都答未声明」。`0.1.20`（2026-11-21）已用 Maven profile 把 `KeelBase-Contract-Version` 写进每个 jar，这句话两版前就不成立 | 脚本 67–72 行；`KeelBase4J/pom.xml:200–217`；`KeelBase4J/CHANGELOG.md:131–138` |
| 6 | **已发布字节确实自述** | `0.1.21`：三个 jar 均带 `KeelBase-Contract-Version: v1.23.0`；core 的 `.sha256` `b1d4588f…` 与下载件一致 | `handoff/v0121-postcheck-1127.md` 第 3 行（2026-11-26T23:51Z 读） |
| 7 | **本地**构建已有检查 | 导入签名钥匙前，4J 用同一套 0/1/2 退出码读回自己的 `target/` jar | `KeelBase4J/.github/workflows/release.yml:234–238`；`scripts/check-jar-contract-version.sh:6–27` |
| 8 | Central **之后**无人核对 | `release.yml` 在 deploy 一步结束，没有部署后步骤 | `KeelBase4J/.github/workflows/release.yml`（末步约 304 行） |
| 9 | Central 归仓延迟，实测一次 | run `45822868092` 结束于 12:50:40Z；`maven-metadata.xml` 的 `lastUpdated` = 20261126132652Z ⇒ 该次发布 **≤ 36 分钟** | `v0121-postcheck-1127.md` 第 2–3 行 |
| 10 | 宿主钉了构件版本 | 宿主 pom 钉 `0.1.21`（3 文件 6 处） | `v0121-postcheck-1127.md` 第 4 行 |
| 11 | KeelBase 自己的 4J 行**滞后** | `KeelBase/README.md:311` 仍写 `v0.1.20` | `README.md:311`；`cto-1128-update-1127.md` |
| 12 | 契约版本的单源 | tag `v1.23.0` → `015f474e`；submodule gitlink 同为 `015f474e`；`check-contract-matrix` 比对 README 的 `main` 行与 pin tag | `git submodule status`；`scripts/check-contract-matrix.mjs` |
| 13 | **本机无外网** | `HTTPS_PROXY=127.0.0.1:7890` 不响应、直连 TLS 亦失败，故本会话**未**重读 Central | `curl` 与 `fetch` 均失败；第 6 行系引用 |
| 14 | 四闸已收，只剩 G5 | G1 strict 开关在（CI 仍跑告警档）、G2 是只读证据面、G3/G4 CI 绿、G5 零接线 | `nextstage-abc-1126.md` §1、§3 |

## 1. 这条闸要证明什么

**一句话。** 对宿主实际消费的每个 Maven 坐标（`cn.com.keelbase:<artifact>:<version>`），取回 jar **与** Central 公布的 `.sha256`，确认字节就是 Central 登记的那份，再读 jar 内**第一处**能回答的声明位置，要求该值等于构建被授予的契约 tag —— `v` 前缀与空白归一后逐字相等。

### 1.1 输入

| 输入 | 从哪来 | 取不到时 |
|---|---|---|
| 坐标 | group `cn.com.keelbase`；artifact ∈ {`keelbase4j-protocol`、`keelbase4j-core`、`keelbase4j-springai`}；版本**必须显式**（脚本拒绝「最新」） | 退出 2 |
| jar 字节 | `repo1.maven.org/maven2/...`，或 `--repo` 指镜像（如阿里云） | 退 2，打印「未核验，不是通过」 |
| 公布摘要 | Central 的 `<jar>.sha256` | 缺席时**如实报告、不中断** |
| 自述版本 | 依次：`META-INF/MANIFEST.MF` → `META-INF/keelbase-contract.properties` → `keelbase-provenance.json` → 内嵌 `pom.xml` 的 `<properties>` | 全无 ⇒ 退 2「未声明」 |
| 期望值 | 契约 tag：submodule gitlink 对应的 tag（`v1.23.0` = `015f474e`），或 `--expect` | 源取错 ⇒ 对错配对判绿 |

### 1.2 它**不**证明什么

- 不证明构件就是宿主钉的那份 —— 除非版本取自宿主，它只证明「这个已发布构件自述了这版契约」。
- 不证明构建可重复，也不证明契约 schema 有实现方（那是 `check-contract-release-gate.mjs` 的 C1–C5）。
- 不替代 4J 的部署前检查：那个读**构建出的** jar，这个读 **Central 发出的**字节。

## 2. 路 A —— 接线

### 2.1 job 放在哪

| 落点 | 能看到什么 | 相关事实 |
|---|---|---|
| **A1 · 4J `release.yml`，deploy 之后** | 刚发布的版本；`$KEELBASE_CONTRACT_VERSION` 已在环境里 | `release.yml:190` 设定 pin；deploy 是最后一步 |
| **A2 · 4J 独立工作流**（`workflow_dispatch`，可选 `schedule`） | 显式传入的某个已发布版本 | 4J 今天没有定时；`contract-pin` 已记下为何不在 `ci.yml` 加 `schedule:` |
| **A3 · `KeelBase`（主仓）CI** | 消费方视角；已有检出兄弟仓的先例 | `release-gate` 检出 `rain6fish/KeelBase4J` 的 `main`（`ci.yml:974–982`）；脚本本来就在这个仓 |
| **A4 · 宿主（`KeelBase-Vue-Pro`）CI** | 宿主自己的 pin | **未评估**：宿主只有运行时 pin（`0.1.21`），没有自己的契约 pin；`--expect` 从何而来未核 |

### 2.2 对 A1/A2 而言，脚本在错的仓

`check-artifact-contract.mjs`（463 行）与测试在 `KeelBase/scripts/`；4J 有一套同退出码、但读本地文件的 bash 版。要在 4J 接线，必须三选一：把脚本移过去（并从 `KeelBase` 删除 —— R1 评审本就把「删掉」列为选项）、在 4J 旁边检出 `KeelBase`、或从 `KeelBase` 跑（即 A3）。把 463 行复制进第二个仓，等于同一规则留两份 —— 正是 R1 评审与 gate-coverage 守卫要防的事。

### 2.3 前提

- **网络**：`repo1.maven.org`（公开读、无凭据），或 `--repo` 指镜像。中国大陆用镜像更快，但 Central 才是权威。
- **只要 Node**：零依赖，`fetch` 加一个手写的 ZIP 读取器。
- **期望值**：检出里的契约 tag（`submodules: true`，再 `git -C Server-NestJS/specs/protocol describe --tags --exact-match`），或复用 `check-contract-matrix` 已有的 README `main` 行比对。
- **CI 改动批准**：新增 job，或在发布工作流里加一步。
- **门禁记账**：在根 `package.json` 加 `check:artifact-contract`，就必须同时在 `gate-coverage.mjs` 声明（`NOT_COVERED`，或由 `check:all` 跑），否则 `check:coverage-gaps` 判红 —— 守卫的报错在 `gate-coverage.mjs:302`。
- **runbook 一行**：落在 `docs/manual/release-precheck.md` §④（版本 bump 与版本对账）。

### 2.4 最小可行 job（仅稿，不落地）

```yaml
# 稿。未落地。
  artifact-contract:                       # 拟增 job
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with: { submodules: true }
      - uses: actions/setup-node@v5
        with: { node-version: '22' }
      - name: 值取自树，不手写
        run: |
          set -eu
          echo "EXPECT=$(git -C Server-NestJS/specs/protocol describe --tags --exact-match)" >> "$GITHUB_ENV"
          echo "VER=$(node -p "require('./package.json').keelbaseRuntimeVersion || ''")" >> "$GITHUB_ENV"   # A3 取宿主 pin；A1/A2 取 project.version
      - name: 等 Central 出货（有界）
        run: |
          for i in $(seq 1 20); do
            curl -fsS "https://repo1.maven.org/maven2/cn/com/keelbase/keelbase4j-core/$VER/keelbase4j-core-$VER.jar.sha256" >/dev/null && exit 0
            sleep 60
          done
          echo "::warning::20 分钟后 Central 仍取不到 $VER"
      - name: 已发布字节自述契约
        run: |
          for a in keelbase4j-protocol keelbase4j-core keelbase4j-springai; do
            node scripts/check-artifact-contract.mjs --artifact "$a" --version "$VER" --expect "$EXPECT"
          done
```

三个构件、三次调用；父 pom 不是 jar，不在范围。退出码 2 必须让该步失败 —— 这里写 `|| true` 就把闸变成了摆设。

### 2.5 失败面

退出 0 = 有声明且相等；退出 1 = 有声明但不同（打印观测值）；退出 2 = 未声明、取不到、读不了或摘要不符 —— **2 不是通过**。缺 `.sha256` 只打印、继续（`survivedSha256Check = null`），同样是证据语义，也不等于通过。

## 3. 路 B —— 正式记录后置

### 3.1 记录写进哪份文件

| 层 | 文件 | 必须写什么 |
|---|---|---|
| 决定单源 | `KeelBase-Private/KeelBase-Vue-Pro/决定索引.md` §3，取下一个空号 **D70** | G5 按 D67/U6 后置；现存什么（脚本 + 10 例测试、零接线）；**不**宣称什么；解冻条件；复核人 |
| 残留线 | `handoff/nextstage-abc-1126.md` 的 B-2 行 | 同口径，免得会议件与决定单各说一套 |
| 机器可读（可选） | `scripts/gate-coverage.mjs` 的 `NOT_COVERED` | 「不进 `check:all`：它读 Maven Central；后置记为 D70」 —— 于是每次 `check:all` 都把空档打印出来，而不是藏起来 |
| 人工 runbook | `docs/manual/release-precheck.md` §④ | 一行：本检查不在发布前程序内，及原因 |

D67 的既有约束仍然适用：**无论选哪条，11-29 都不把 G5 计入完成项**。后置不等于完成。

### 3.2 由谁复核、何时

- **复核人**：用户（CTO）。D67 的末列署名是用户，索引的惯例是末列署名者对该条负责。
- **复核时点**：2026-11-29 收口，以及后置期间的每次发布前程序 §④。

### 3.3 解冻条件（候选，由 CTO 定）

1. 出现绕过 `contract-version` profile 的发布路径 —— 4J 自己的 pom 注释记下 `maven-jar-plugin` 3.x 会放过「已是最新」的 jar，已经造成过一次静默 jar（`pom.xml:218–224`）。
2. 宿主把运行时 pin 抬到没人读过其声明的版本。
3. 任何在 `release.yml` 之外构建的发布（pom 注释说这样的产物「依旧什么都不说」）。
4. 在对外声称「Central 发的东西与契约一致」之前。
5. 4J 工作流改变 `-Dkeelbase.contract.version` 的注入方式。

## 4. 两路并列

| | **A —— 接线** | **B —— 正式后置** |
|---|---|---|
| AI 工作量 | 1–1.5 AI 日：job、有界等待、三次调用、gate-coverage 声明、runbook 一行、**并修正过期的脚本头** | 约 0.25 日：一条索引条目、一条 B-2 行、一行 runbook；补 `NOT_COVERED` 再加约 0.1 日 |
| CI 分钟 | 每轮约 1 分钟（三个 jar：39 KB、426 KB、21 KB；上限单文件 64 MB、单条目 4 MB） | 0 |
| 第三方依赖 | 每轮依赖 Central（或镜像）与 DNS | 无 |
| 因别的事判红 | 真实存在：网络、代理、归仓延迟、镜像不一致 | 无 |
| 发布节奏 | A1 每版最多多等约 36 分钟（仅一次读数，第 9 行），且可能在**不可撤回的发布之后**判红；A2/A3 不会 | 不受影响 |
| 只有它能抓到 | Central **发出**的字节：上传侧改造、发错件、deploy 没走完 | 无（不增加覆盖） |
| 选了之后的残余风险 | 闸的卫生：被无视的红，或一句 `|| true` 把它作废 | 不读决定单就看不见这个空档 —— 除非补 `NOT_COVERED` |
| 可证伪验收 | `0.1.21` + `--expect v1.23.0` ⇒ 0；+ `--expect v1.22.0` ⇒ 1；不存在的版本 ⇒ 2；没传属性构建出的 jar（`--jar`，普通 `mvn package`）⇒ 2 | 决定单可 grep 到该号；`check:all`（或 runbook）点名该空档；任何地方都不写 G5 已完成 |

### 4.1 路 A 特有的风险

- **R1 —— 红的原因不是它要判的东西。** 4J 的 `contract-pin` 已把这条写成文：需要远端的闸「会因为远端抖了一下而红，而会为不是它要判的东西变红的闸，最后都会被人关掉」（`ci.yml:239–242`）。G5 按构造就要第三方网络。
- **R2 —— 归仓。** 唯一一次读数是 ≤36 分钟（第 9 行）、只对一次发布有效，不是上界。发布期闸要么等（A1），要么在字节已发出、收不回来之后判红。
- **R3 —— 未声明来自构建，不来自缺陷。** profile 未激活时 jar 什么都不说、脚本退 2 —— 判断正确，但读起来像「发布坏了」，实情是「构建没拿到属性」。
- **R4 —— 期望值或实际值过期。** KeelBase README 的 4J 行仍写 `v0.1.20`（第 11 行）；从 README 取任一值，会把过期的配对判绿。
- **R5 —— 脚本头会误导下一个读者。** 67–72 行仍写「每个构件都答未声明」；不改就把假前提种进仓里。
- **R6 —— 三个退出码必须保住。** 把 2 压成 0、或加 `|| true`，闸就永久绿。测试文件钉住了 0/1/2 三支，但没有任何东西钉住工作流怎么用它。

## 5. 本报告不选

上面把两条路写全了。本件不推荐任何一条，也未接任何闸。B-2 要 CTO 定的是：接线（以及接在 A1/A2/A3 哪一处），或正式记录后置（以及是否补机器可读的 `NOT_COVERED` 条目）—— 两种情形下都确认 11-29 不把 G5 计入完成。

## 6. 本会话未核

1. **未重读 Central**：本机无外网（代理 `127.0.0.1:7890` 不通、直连 TLS 失败）。第 6、9、10 行引自发布后核对件。
2. **未执行任何 job**：§2.4 的稿未跑，`$VER` 那行是占位 —— `package.json` 今天没有版本字段。
3. **是否每个构件都有 `.sha256`**：只见 `0.1.21` 的三个；旧版本未查。
4. **A4（宿主侧接线）**只点名、未评估。
5. **36 分钟**是一次发布的元数据时间差，不是实测保证。

*全程只读；本文件是唯一写入物。*
