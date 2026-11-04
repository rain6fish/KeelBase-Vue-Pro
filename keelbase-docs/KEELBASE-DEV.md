# KeelBase host — building and running this line

> Chinese: [KEELBASE-DEV.zh-CN.md](KEELBASE-DEV.zh-CN.md)

This is the **development note** for this repository: what toolchain it needs, how to build it, and how
to run it against a datastore. The line's identity is in [KEELBASE-HOST.md](KEELBASE-HOST.md).

## Toolchain — two JDKs at once, on purpose

The platform here compiles to **Java 25**. `keelbase4j-core` — the runtime this repository embeds —
targets **Java 17**. Both have to be usable at once, and this machine's default JDK is 17.

`scripts/jdk25.sh` resolves a JDK 25 **for one command** and leaves `JAVA_HOME` and `PATH` alone. That
last part is not politeness: several sessions share this machine, and moving the default JDK would
change what everyone else builds with.

```bash
bash scripts/jdk25.sh                     # report the resolved JDK, change nothing
bash scripts/jdk25.sh java -version       # run one command on 25
```

Resolution order, first hit wins: `$KEELBASE_JDK25` → `$JDK25_HOME` →
`$KEELBASE_JDK25_DIR/jdk-25` → `/d/Develop/jdk-25` → download. The directory a download lands in is
itself part of that order, so the download happens **once**; set `KEELBASE_JDK25_DIR` to choose it
(the default is `$HOME/.keelbase/jdk25`). Nothing is installed unless the first four all fail.

### On a clean machine

A stranger needs `bash`, `curl`, and `unzip` (or `tar`) — all of them ship with Git for Windows, and
all are on the Ubuntu runners this repository's CI uses. Nothing is installed by hand, and nothing
global is changed:

```bash
bash scripts/jdk25.sh                      # downloads Temurin 25 if the machine has none
bash scripts/jdk25.sh java -version        # prints 25.0.x from the resolved home
```

The download asks the Adoptium API for a **Temurin 25** build matching the machine:

| OS | `uname -s` matches | archive | `uname -m` → Adoptium arch |
|---|---|---|---|
| Windows (Git Bash) | `MINGW*` / `MSYS*` / `CYGWIN*` | zip | `x86_64` → `x64`; `arm64` → `aarch64` |
| Linux | `Linux` | tar.gz | same |
| macOS | `Darwin` | tar.gz | same |

It then checks that the unpacked JDK reports version 25 before returning it, so a wrong artifact
aborts instead of being handed to the build. **CI does not exercise this branch** — it passes the
runner's own JDK 25 through `KEELBASE_JDK25`, which is also how to reuse an existing installation.

**Why not just install it system-wide:** the core's own rule is that its products build on Java 17.
This host is the exception, so the exception is scoped to the commands that need it.

## Build

```bash
bash scripts/jdk25.sh mvn -pl yudao-server -am -DskipTests -Dmaven.test.skip=true package
```

`-pl yudao-server -am` builds the server and what it depends on, and skips the fifteen business modules
that are not wired into the server. The artifact is a fat jar under `yudao-server/target/`. This
assumes `mvn` is on `PATH`; the datastore below additionally needs Docker.

### A prepared Maven repository, for building with no network — 离线构建：备好一份 Maven 本地库

**中文块在前、英文块在后 —— 本仓的块顺序与其它仓相反。**

钉在 pom 里的 `keelbase4j` 版本可能比任何一份现成基线库都新（2026-11-02 的基线库只有 0.1.14，而 pom 钉
0.1.16）。联网机器上这不是问题：根 `pom.xml` 自己声明了 huaweicloud / aliyun 两个仓库，Maven 会去下载。
**完全离线**的机器上，同一个构建会以「找不到 0.1.16」失败。先把这一层补进本地库：

```bash
# 1) 复制基线库（源库只读），缺的版本按根 pom 的镜像解析进目标库
bash scripts/prepare-m2-repo.sh <source-m2> <target-m2> --fetch

# 2) 断网等价地验证：-o 下不允许任何远程解析
bash scripts/jdk25.sh mvn -o -Dmaven.repo.local=<target-m2> -pl yudao-server -am test-compile
```

脚本只做三件事：整份复制源库（**不写源库**）、从仓内所有 `pom.xml` 读出钉住的 `cn.com.keelbase`
坐标（**版本不写死**，抬 pin 后重跑即可）、核对目标库里有没有对应的 `pom` 与 `jar`。缺的坐标在给
`--fetch` 时用 `maven-dependency-plugin:get` 解析（仓库取根 `pom.xml` 声明的那两个，不是
`settings.xml`）；不给则退出码 **2**，并打印下一条该跑的命令。其它退出码：0 齐全 · 1 失败或解析后仍缺 ·
64 用法错误。目标库已存在时要加 `--force`（往里覆盖，**不删**已有内容）。

**这个脚本只解决 Maven 这一层。** `-o` 证明的是「Maven 不做远程解析」，不是「整台机器没有网络」：
后台 UI 构建（`scripts/build-host-ui.sh`）仍要从 Gitee 克隆前端仓、由 pnpm 取包。要一台机器**完全**离线
跑完整条验证，那两层也得预先备好——本脚本没有覆盖它们。

The pinned `keelbase4j` version can be newer than any prepared baseline (the 2026-11-02 baseline had only
0.1.14 while the poms pin 0.1.16). Online that is fine — the root `pom.xml` declares the huaweicloud and
aliyun repositories itself, so Maven downloads it. **Fully offline**, the same build fails on "0.1.16 not
found". Put that layer into a local repository first:

```bash
# 1) copy the baseline (the source is read-only), resolve what is missing through the root pom's mirrors
bash scripts/prepare-m2-repo.sh <source-m2> <target-m2> --fetch

# 2) check offline-equivalently: -o forbids every remote resolution
bash scripts/jdk25.sh mvn -o -Dmaven.repo.local=<target-m2> -pl yudao-server -am test-compile
```

The script does three things: copies the source repository whole (**the source is never written**), reads
the pinned `cn.com.keelbase` coordinates out of every `pom.xml` (**no version is hard-coded**; re-run it
after a pin bump), and checks that the target holds the matching `pom` and `jar`. With `--fetch` the
missing coordinates are resolved through the repositories the root `pom.xml` declares (not `settings.xml`);
without it the script exits **2** and prints the command to run next. Other exit codes: 0 complete · 1
failure, or still missing after resolution · 64 bad usage. Pass `--force` when the target already exists
(it copies over; it deletes nothing).

**This covers the Maven layer only.** `-o` proves Maven makes no remote resolution; it is not "the machine
has no network": the admin UI build (`scripts/build-host-ui.sh`) still clones the front end from Gitee and
fetches packages through pnpm. A machine that is offline end to end needs those two layers prepared as
well — this script does not cover them.

## Run

`scripts/run-server.sh` is the whole thing in one command, and it is what the verification above was run
with:

```bash
bash scripts/run-server.sh
```

The datastore and the runtime's own settings are passed as **command-line parameters**, not written into
upstream's `application-local.yaml`. Two reasons: upstream's file stays untouched, and the same checkout
can be pointed at a different stack without editing anything.

| Parameter | Why it is needed |
|---|---|
| `--spring.datasource.dynamic.datasource.master.url` / `.username` / `.password` | the platform's datastore |
| `--spring.data.redis.host` / `.port` | the platform's cache |
| `--spring.flyway.baseline-on-migrate=true` `--spring.flyway.baseline-version=0` | the platform's schema was loaded by hand, so the core's Flyway needs a baseline — and the version must be `0`, or the core's **V1 is skipped** and a table goes missing silently |
| `--keelbase.audit.hmac-key=…` | the runtime's audit chain; with no `application.yml` of its own when embedded, this fails startup without it |
| `--keelbase.wire.exclude-packages=cn.iocoder.yudao` | keeps the runtime's response envelope off this host's own controllers |
| `--yudao.tenant.ignore-tables=…` | names the tables **KeelBase governs**, so the host's tenant interceptor does not narrow them too (one authority per row — see the line's decision index) |
| `--yudao.access-log.enable=true` | the host's profile ships this **off**, which leaves the API access-log table empty — and the dashboard's "interface calls" figure is read from that table, so it sat at zero. A command-line argument outranks the profile yaml, so this turns it on without editing upstream. Each request now writes a row: that is the cost, and it is why the value is a parameter rather than a constant. Set `ACCESS_LOG=false` to put it back |
| `--spring.datasource.dynamic.druid.validation-query="SELECT 1"` | the host's own value is `SELECT 1 FROM DUAL`, which is MySQL — PostgreSQL has no `DUAL` |
| `--spring.datasource.dynamic.datasource.master.type=com.zaxxer.hikari.HikariDataSource` | **the pool.** See below — with Druid, about half of all logins fail |

### SKILL tools: off in a fresh deployment, until an administrator enables them

A deployment that has never had a policy written for it can use **no skill at all**. When an agent's
SKILL tools are assembled, `YudaoAi1ToolGovernor` registers every non-read tool and writes
`enabled:false` for it (`GovernancePolicyStore.ensureDisabled`). Seven SKILL tools land behind that
gate — `Bash`, `BashOutput`, `Edit`, `KillShell`, `Read`, `Write` and `Skill`. `Skill` is the tool that
only loads `SKILL.md`; disabling it means the model cannot even read a skill's instructions. Only
`Glob`, `Grep` and `ListDirectory` are R1 reads and run straight away.

This is the policy's default, not a defect in the seam: every call still reaches the
`GovernedExecutionEngine`, a blocked call leaves one `blocked` audit row (with `tool_enabled` marked as
the failed check), and the model is told the call did not run. The boundary page states it in its
"Out of the box" column for the ai1 SKILL row.

To enable a tool: open **Policy Center** in the governance menu, tick **Enabled** on
that tool and save. Enabling `Skill` alone makes skill descriptions readable; enabling the shell and
file tools is what lets a skill *do* anything, and those are the ones with real effects on this host —
they run here, and an external write has no confirmation and no side-effect ledger row (the declared
`external-effect-no-ledger` gap).

Whether `Skill` should ship enabled is a product decision under review: moving it into the read set
would make new deployments able to read skill content while leaving existing ones untouched, since
their policy rows were already written.

## The pool had to be swapped, and why

On PostgreSQL and **Druid**, about half of all logins answered 500:

```
org.postgresql.util.PSQLException: 这个 statement 已经被关闭   (this statement has already been closed)
  at org.postgresql.jdbc.PgStatement.checkClosed
  …  DruidPooledPreparedStatement.getMaxRows
  …  MybatisMapperMethod → AdminUserMapper.selectWithCursor
```

**On Hikari it does not happen at all** — twelve logins in a row, and the gate goes green. The one-line change is the `…master.type` parameter above, and it is a **command-line parameter**: no upstream file is edited for it.

Getting there took a wrong turn worth keeping. The first attempt concluded "Druid's prepared-statement cache is ruled out" — and reported that as settled. **It was a false green**: what had been verified is that the *property binds*, not that the *pool changed*. Reading the pool's own state (Druid's stat servlet at `/druid/datasource.json`) showed `PoolPreparedStatements = true` the whole time. And then the more useful finding:

> **The Druid pool cannot be configured from outside this application.** `spring.datasource.dynamic.druid.pool-prepared-statements=false` — as a command-line argument, as an external config file at higher precedence — does not change it; neither does the sibling prefix `spring.datasource.druid.*`; **nor does editing `application-local.yaml` and rebuilding**, after which the jar was verified to contain `false` while the pool still reported `true`.

So the whole class of "tune Druid with a property" fixes is a dead end here, and the next thing to try was not another property. `prepareThreshold=0` on the JDBC URL was tried too and did not help.

What the gate is for, the gate then did: on its first run against the fixed stack it found **two real dialect mismatches in the generated module** — a `boolean deleted` column that the host's logic-delete compares against `0` and `1` (its own schema writes `deleted int2 not null default 0`), and an `id` with no sequence behind it (the host's convention is `id int8 not null` plus a `<table>_seq`, and its generated DO carries `@KeySequence`). Both are fixed in the spec adapter, and both had been sitting in the module since the spike.

`--spring.datasource.dynamic.druid.validation-query="SELECT 1"` above is kept because PostgreSQL genuinely has no `DUAL`; it is **not** part of this fix, and does not claim to be.

**⚠ Two traps, both measured on this host** — see the spike record for the runs:

- Chinese piped into the `mysql` client through `docker exec -i` comes out mangled unless
  `--default-character-set=utf8mb4` is passed. It landed in **generated code comments** once.
- Chinese passed to `curl` as a command-line argument through this shell is corrupted; use
  `--data-binary @file`.

## Datastore

This line's datastore is **PostgreSQL with pgvector, plus Redis**, in `scripts/docker-compose.datastore.yml`.
Upstream ships a compose of its own that runs MySQL; that file is upstream's and is left alone — this is
ours, and it is what this line runs against.

```bash
bash scripts/bootstrap-datastore.sh          # create if absent, load if empty
RESET=1 bash scripts/bootstrap-datastore.sh  # drop and reload
```

**Verified end to end (2026-10-08).** The stack comes up, the extension reports `vector 0.8.7`, upstream's
converted schema loads to 49 tables, and the server starts against it: Flyway applies the runtime's four
migrations, `/auth/me` answers, a chat routes to a tool and reads a real row out of PostgreSQL, and the
audit chain verifies over its own rows.

**One thing the first run found, fixed in `yudao-server/pom.xml`:** upstream builds for MySQL and manages
no PostgreSQL driver, so the platform fails at startup with `ClassNotFoundException:
org.postgresql.Driver` until one is added. That dependency is now declared there.

One fact about the schema worth having before reading any failure: `sql/postgresql/ruoyi-vue-pro.sql` is
**machine-converted** from MySQL — its own header says so, and it carries leftovers such as a `dual`
table. It loaded cleanly here; a failure in it would be a fact about that converted file, not about this
line.

A concrete consequence of that conversion, found by running rather than by reading: `system_operate_log.user_id`
is `NOT NULL` in the converted file, and the host writes `NULL` into it whenever there is no login user.
MySQL survives that by coercing the value to zero; PostgreSQL refuses outright, so those requests lost
their operation-log row **and** logged an error. `sql/keelbase-operate-log-nullable.sql` relaxes the
column, which keeps the row and says truthfully that no user was attached — the alternative, writing a
zero, would put a user number on the row that no user holds. It is not only an anonymous-request case:
a write executed by the AI runs on a thread with no login user, which is how this was found. A fresh
install needs the file too, for the same reason.

**⚠ Not covered:** pgvector being present is what lets the runtime's knowledge layer take its semantic
path, but that path also needs an embedding model, and none is configured here — so the **semantic path
itself has not been exercised**, only the extension's presence.

## A datastore for every real-stack gate

The gates need more than the line's own datastore: they read CRM, assistant, governance, BPM and FMS
tables, and they all share one running stack. `scripts/bootstrap-gates-datastore.sh` prepares that stack —
a dedicated PostgreSQL (pgvector) and Redis, with the schema loaded — and prints the three environment
variables the run needs.

```bash
# 1. Prepare the datastore (dedicated containers; --reset reloads, --force recreates)
bash scripts/bootstrap-gates-datastore.sh

# 2. Start the host against it, on a port of your own
PG_PORT=39871 PG_DB=gates REDIS_PORT=39872 PORT=48171 bash scripts/run-server.sh &

# 3. Run every gate
HOST_URL=http://127.0.0.1:48171 PG_CONTAINER=gates-pg PG_DB=gates \
  bash scripts/run-all-scenarios.sh
```

The script loads, in this order: `sql/postgresql/ruoyi-vue-pro.sql`; every `load` line of
`deploy/demo-ecs/seed-manifest.txt`, in the manifest's order; `sql/keelbase-bpm.sql`; and
`sql/keelbase-fms.sql`. The last two are **extra on purpose**: the manifest describes what the **demo
deployment** seeds, and it classifies both bpm and fms as `skip` (bpm's menus are hidden and its tables
are not seeded; fms is not in the deployment jar). The gates cover both modules, so they need real
tables — four BPM gates and two FMS gates read them. The manifest remains the single source for the
deployment; this script adds only what the gates need and leaves the manifest and `bootstrap-db.sh`
alone.

Defaults: containers `gates-pg` / `gates-redis`, ports `39871` / `39872`, database `gates`, user `root`.
Everything is overridable through the same-named environment variables. The containers carry a
`keelbase.gates-datastore=1` label; a container of the same name that this script did not create is
refused rather than reused or overwritten — `--force` is the explicit exception that removes it.
Loading runs with `ON_ERROR_STOP=1`: the first failing file stops the run, its name is printed, and the
exit is non-zero. At the end the script checks that the database has more than 100 tables and prints
`PG_PORT=…`, `PG_CONTAINER=…`, `PG_DB=…` ready to copy.

Cleanup is explicit; the script does not remove what it started:

```bash
docker rm -f gates-pg gates-redis
```

## Running every real-stack scenario gate at once

`scripts/run-all-scenarios.sh` runs every `scripts/run-*-scenarios.mjs` gate against **one** running
stack, in a fixed order, and prints a summary. Each gate stays a separate program with its own
assertions; this only stops you from starting and stopping the stack by hand for each one.

```bash
bash scripts/run-all-scenarios.sh --list        # what it would run, and what it would skip

PG_CONTAINER=sg-pg PG_DB=sg_1102 HOST_URL=http://127.0.0.1:18093 \
  bash scripts/run-all-scenarios.sh
```

What it guarantees:

| | |
|---|---|
| **Real exit codes** | Each gate's status is taken straight from `node`, never from a pipe, so a red gate is reported with the code it really exited with |
| **No early stop** | The first red gate does not abort the rest — one run shows every reading |
| **One summary** | `N passed / M failed` at the end, plus each gate's own `ok / failed` count and duration |
| **A readings file** | Every gate's `READING …` lines are collected into `readings.txt` under the log directory (`SCENARIO_LOG_DIR`, default a fresh temp dir), so two runs compare with `diff` |
| **An exit status** | Any gate failing ⇒ the script exits 1 |

Discovery and order are documented in the script's own header. In short: the `ORDER` list fixes a
deliberate sequence (cheap faces first, anything needing a real model last), and a gate added later is
picked up automatically and run after the listed ones, alphabetically.

**Two rounds, compared.** A gate passing once says only that it passed once; the rule for these gates is
that two consecutive runs produce the **same readings**. `--repeat 2` turns that into one command:

```bash
PG_CONTAINER=sg-pg PG_DB=sg_1102 HOST_URL=http://127.0.0.1:18093 \
  bash scripts/run-all-scenarios.sh --repeat 2
```

Each round runs every gate and keeps its own `round-<n>/` directory — logs, per-gate exit codes and
`READING` lines. When every round has finished, the script compares (a) each gate's pass / fail / skip
status and (b) the `READING` lines concatenated in gate order, **byte for byte** with `cmp` — never the
timestamped full logs, which differ every run by design. A gate failing in any round, or any readings
mismatch, exits 1 and names the gate and the first line that differs. `--repeat 1` (the default) is
exactly the single-pass behaviour described above.

**It does not reset the stack between rounds.** The stack is shared, so a gate that leaves rows behind
makes round 2 differ — and that difference is a real finding, not noise to be papered over. Reset and
re-bootstrap the database yourself between rounds when you want a clean-slate comparison.

**Gates it skips, and why.** A gate whose prerequisite this script cannot arrange is printed as `SKIP`
with its reason and is counted as neither a pass nor a failure. There is one today:
`run-model-loop-scenarios.mjs` needs a host started with `KEELBASE_MODEL_API_KEY` (see the note on that
in the `run-server.sh` section above), so it runs only when you say the host is that way —
`SCENARIOS_MODEL_HOST=1`. The three gates that call a real model (`run-ai1-crm-scenarios`,
`run-assistant-drawer-scenarios`, `run-mcp-governance-scenarios`) are **not** skipped: they read the key
from the file named by `KEY_FILE` themselves and fail loudly when it is missing or holds no key.

**What a green summary does not mean.** Each gate states its own declared limits in its header — the
one that matters most is that the wire carries no tool result, so a tool's projection is asserted
against the module's row and pinned by a unit test rather than read off the response. A green summary
says every gate's own assertions held; it claims nothing beyond them.

## The same gates on CI

`.github/workflows/real-stack.yml` runs the whole set on every push to `main`, every pull request
targeting `main`, and on demand, against a stack it builds for the occasion.

- **Named containers**, `gate-pg` (pgvector/pgvector:pg17) and `gate-redis` (redis:7-alpine), ports on
  loopback. They are named rather than `services:` because every gate reaches PostgreSQL through
  `docker exec "$PG_CONTAINER"`, and a service container's name is generated.
- **Seed**: `deploy/demo-ecs/bootstrap-db.sh` (upstream schema, the manifest's `load` lines, the menu
  scope, the upload store), then `sql/keelbase-bpm.sql` and `sql/keelbase-fms.sql`. The manifest marks
  both of those `skip` — this deployment neither shows bpm's menus nor ships fms — while the BPM and
  FMS gate groups need the real tables.
- **Build**: `mvn -B -ntp -pl yudao-server -am -DskipTests package`, then a step asserts the jar carries
  a `Main-Class` (proof that `spring-boot:repackage` ran) and prints the `keelbase4j-*` versions found
  in `BOOT-INF/lib`, so the runtime the gates ran against is a reading.
- **Host**: `scripts/run-server.sh` in the background; the job polls `/app/capabilities` until it
  answers 200, gives up after 300 s, and fails at once with the host's tail if the process exits early.
- **Gates**: `scripts/run-all-scenarios.sh` with `SCENARIO_LOG_DIR` inside the workspace. The console
  log, every per-gate log, `readings.txt`, the host log and the seed/build logs are uploaded as the
  `real-stack-gates` artifact, `if: always()` — a red run's readings are the ones worth reading.

**What the job does not run.** `run-model-loop-scenarios.mjs` is skipped by the script itself: it wants
a host started with the model loop on, and the job starts the ordinary one. The three gates that call a
real model (`run-ai1-crm-scenarios`, `run-assistant-drawer-scenarios`, `run-mcp-governance-scenarios`)
read their key from `KEY_FILE` and exit 1 without one, so the job takes them out of `scripts/`
discovery and prints one `SKIP` line each into the log and the step summary — visible, never counted as
a pass. Add the repository secret `SPRING_AI_ENV` holding that file's contents
(`SPRING_AI_DEEPSEEK_API_KEY=…`, `SPRING_AI_DEEPSEEK_CHAT_MODEL=…`) and all three run.

## Generating a governed module from a spec

```bash
bash scripts/gen-from-spec.sh specs/products.json           # write
bash scripts/gen-from-spec.sh specs/products.json --check   # compare, non-zero on drift
```

From a Business Spec it produces three files, all of them this project's rather than the host
generator's:

| Output | What it is |
|---|---|
| `sql/keelbase-<module>.sql` | the DDL that creates the table, with the governance columns and the host's base columns. **MySQL**, and the Chinese labels ride in `COMMENT` — this host's own generator reads them at import, so the naming pass disappears into the DDL |
| `…/keelbase/generated/<Entity>Tools.java` | the module's AI tool face: a read and a write, with their routes |
| `…/keelbase/generated/<Entity>Governance.java` | the module's row scope, as pointcuts over the module's own service |

**What it does not do** is generate the module's own CRUD. That is this host's code generator, driven
over its API — a separate step, because it needs a running stack, and it is why this half is
deterministic and offline.

**What `--check` proves, and what it does not.** It proves the files on disk are what the spec says.
It does **not** prove they are right — it compares against what the last run wrote, so a template bug
regenerates itself faithfully and still reports `no drift`. The first version of the DDL template
dropped the trailing commas and glued `comment` onto long constraints, producing invalid SQL that
`--check` called clean; what caught it was comparing against the spike's hand-made file.

**Where the boundary is, and that it is checked.** The adapter owns the *module-level* surface — the
table, the tool face, the row-scope pointcut — and a host line writes its *host-level* pieces by hand
exactly once. Within the two namespaces above that is **enforced** rather than described:

```bash
bash scripts/gen-from-spec.sh --check-boundary
```

It fails in **both** directions: a generated file that is gone means the spec stopped being the source,
and a file belonging to neither list means a second one appeared. The check earns its place because the
namespaces do not tell the two apart by name — `sql/keelbase-products.sql` is generated and
`sql/keelbase-crm.sql` is hand-written, sitting side by side. A new hand-written file therefore has to
be **declared** in `SpecCodegen.HAND_WRITTEN`; that is the point, not a nuisance.

## The other check that reads the prose

```bash
node scripts/check-path-refs.mjs
```

`--check` and `--check-boundary` both read files the generator owns. Neither reads a **citation** — a
path written in a comment or a doc, pointing at a file that was renamed or never existed here. A
wrong path and a right one render identically, so the reference rots silently. This is the check that
reads it, over our own files only: upstream's trees are not scanned (they cite their own files), a
`../` path is out of scope (it names a sibling checkout), and a pattern such as
`sql/keelbase-<module>.sql` is a shape rather than a path.

Like `--check-boundary` it fails in **both** directions: a cited path that is absent, and an entry in
its `ELSEWHERE` list that nothing cites any more. The second one exists so that a declared exception
cannot quietly become a hole.

**It runs on every commit** (wired into `pre-commit` on 2026-10-10). The hook is installed from
`KeelBase-Private/.githooks/` by `KeelBase-Private/scripts/install-hooks.sh`, and it runs the check
in any checkout that holds this script — a no-op everywhere else in the group. It reads the **working
tree**, not the index, so in a shared checkout an edit someone else has in flight can block your
commit; `git commit --no-verify` is the way past it. **It also runs in CI**
(`.github/workflows/ci.yml`, added 2026-10-10) on every push and pull request to `main`, so the hook
is the fast local copy of a gate that does not depend on anyone running it. Upstream's own two
workflows are left as they were found and stay dormant — they trigger on `master`, while this
repository's branch is `main`.

## Upstream, and how to compare against it

`upstream` points at `https://github.com/YunaiV/ruoyi-vue-pro.git` — the canonical source; the
project's Gitee mirror is not configured here. It exists because **this repository's history was
started fresh**, which means the usual fork workflow is not available:

> **`git merge upstream/master-jdk25` and `git rebase` are refused** — the two histories share no
> ancestor (`refusing to merge unrelated histories`). This remote is for **diffing, patching and
> taking files**, not for merging — and not for pushing either: its **push URL is deliberately set to
> a sentinel** (`DISABLED-READ-ONLY`) so that a slip cannot publish to upstream.

```bash
git fetch --depth=1 upstream master-jdk25     # kept shallow on purpose; deepen with --deepen
git diff upstream/master-jdk25 HEAD --stat
```

**Two things worth knowing before reading a diff, both learned the hard way:**

1. **Fetching needs HTTP/1.1 here.** A plain `git fetch upstream` fails with `Failed to connect to
   github.com port 443` even while `git ls-remote upstream` and `curl https://github.com` succeed.
   `git -c http.version=HTTP/1.1 fetch --depth=1 upstream master-jdk25` works.
2. **`git diff` reports a file as modified when only its mode changed.** Roughly 130 files differ
   from upstream by the executable bit alone — upstream tracks them `100755`, this copy lost that
   when the tree came across Windows. To see **content** changes only, compare the blobs:

   ```bash
   git diff --name-only upstream/master-jdk25 HEAD | while read -r p; do
     [ "$(git rev-parse "HEAD:$p")" != "$(git rev-parse "upstream/master-jdk25:$p")" ] && echo "$p"
   done
   ```

   **That loop is now a script**: `node scripts/check-upstream-footprint.mjs`. Use it rather than the
   two commands above — it diffs against **the pin tag this repository carries** (`upstream-pin-994605b`)
   rather than the moving branch, so upstream's own progress is not added to this line's number, and it
   reports against the boundary `D45` settled (`KEELBASE-UPSTREAM.md`).

## Where the line's records are

| | |
|---|---|
| The runtime's side of this host | this directory (`KEELBASE-HOST.md`) |
| The line's decisions and backlog | the project's private repository, `KeelBase-YuDao/` — not in this repository |
| The spike that started this line | same, `KeelBase-RuoYi/Yudao真跑型Spike_2026-10-08.md` + `evidence-yudao-spike-2026-10-08/` |
