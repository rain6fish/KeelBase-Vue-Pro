# KeelBase 宿主 — 本线的构建与运行

> 英文：[KEELBASE-DEV.md](KEELBASE-DEV.md)

本文件是本仓的**开发说明**：需要什么工具链、怎么构建、怎么对着数据存储跑起来。本线是什么，见
[KEELBASE-HOST.zh-CN.md](KEELBASE-HOST.zh-CN.md)。

## 工具链 —— **同时**要两个 JDK，这是故意的

这里的平台编译目标是 **Java 25**。本仓嵌入的运行时 `keelbase4j-core` 目标是 **Java 17**。两者必须
同时可用，而本机默认的 JDK 是 17。

`scripts/jdk25.sh` 为**一条命令**解析出一个 JDK 25，**不动** `JAVA_HOME` 与 `PATH`。后半句不是客气：
本机有多个会话共用，挪动默认 JDK 会改变**别人**构建所用的东西。

```bash
bash scripts/jdk25.sh                     # 报告解析到的 JDK，什么都不改
bash scripts/jdk25.sh java -version       # 用 25 跑一条命令
```

解析顺序，**先成的胜出**：`$KEELBASE_JDK25` → `$JDK25_HOME` → `$KEELBASE_JDK25_DIR/jdk-25` →
`/d/Develop/jdk-25` → 下载。**下载落到哪个目录，本身就在这条顺序里**，故下载只发生**一次**；要换地方就设
`KEELBASE_JDK25_DIR`（默认 `$HOME/.keelbase/jdk25`）。**前四处只要有一处成立，就不装任何东西。**

### 在一台干净机器上

只需要 `bash`、`curl`，以及 `unzip`（或 `tar`）——它们都随 Git for Windows 一起装好，本仓 CI 用的 Ubuntu
runner 上也都有。**没有一样要手工装，也没有一样是全局改动**：

```bash
bash scripts/jdk25.sh                      # 机器上没有就下载 Temurin 25
bash scripts/jdk25.sh java -version        # 报出解析到的 home 里的 25.0.x
```

下载会按机器向 Adoptium API 要一个 **Temurin 25** 构建：

| 系统 | `uname -s` 命中 | 归档 | `uname -m` → Adoptium 架构 |
|---|---|---|---|
| Windows（Git Bash） | `MINGW*` / `MSYS*` / `CYGWIN*` | zip | `x86_64` → `x64`；`arm64` → `aarch64` |
| Linux | `Linux` | tar.gz | 同上 |
| macOS | `Darwin` | tar.gz | 同上 |

解包后还会核对它报的是不是 25，**不符就中止**，而不是把一个错的 JDK 交给构建。**CI 不走这一档**——它把
runner 自己的 JDK 25 经 `KEELBASE_JDK25` 递进去；想复用已有安装时也是这个办法。

**为什么不干脆装成系统级**：核心自己的规矩是它的产物基线 Java 17。本宿主是那个例外，所以例外被**限制在
需要它的那些命令里**。

## 构建

```bash
bash scripts/jdk25.sh mvn -pl yudao-server -am -DskipTests -Dmaven.test.skip=true package
```

`-pl yudao-server -am` 构建服务端及其依赖，跳过那十五个没接进服务端的业务模块。产物是
`yudao-server/target/` 下的 fat jar。这一步假定 `mvn` 在 `PATH` 上；下面的数据存储另需 Docker。

### 离线构建：备好一份 Maven 本地库

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

## 运行

`scripts/run-server.sh` 一条命令就是全部，上面的验证就是用它跑的：

```bash
bash scripts/run-server.sh
```

数据存储与运行时自己的设置一律走**命令行参数**，**不写进**上游的 `application-local.yaml`。两个理由：
上游那个文件保持一字未动；同一份检出可以指向另一套栈而不必改任何东西。

| 参数 | 为什么需要 |
|---|---|
| `--spring.datasource.dynamic.datasource.master.url` / `.username` / `.password` | 平台的数据存储 |
| `--spring.data.redis.host` / `.port` | 平台的缓存 |
| `--spring.flyway.baseline-on-migrate=true` `--spring.flyway.baseline-version=0` | 平台的 schema 是手工灌的，故核心的 Flyway 需要基线——而版本**必须是 `0`**，否则核心的 **V1 被跳过**、一张表**安静地**消失 |
| `--keelbase.audit.hmac-key=…` | 运行时的审计链；嵌入时它没有自己的 `application.yml`，缺这项**起不来** |
| `--keelbase.wire.exclude-packages=cn.iocoder.yudao` | 让运行时的响应信封**不套在**本宿主自己的控制器上 |
| `--yudao.access-log.enable=true` | 宿主的 profile 里这一项是**关着的**，于是接口访问日志表是空的——而面板上「接口访问」那格正是从那表读的，故它一直停在 0。命令行参数优先于 profile 的 yaml，所以这能在**不编辑上游**的前提下把它打开。代价是**每个请求都会写一行**，这也是它做成参数、而不写死的原因。置 `ACCESS_LOG=false` 可恢复 |
| `--yudao.tenant.ignore-tables=…` | 点名**由 KeelBase 治理**的表，好让宿主的租户拦截器**不再**去收束它们（一行的权威只有一个——见本线的决定索引） |
| `--spring.datasource.dynamic.druid.validation-query="SELECT 1"` | 宿主自己的值是 `SELECT 1 FROM DUAL`，那是 **MySQL**——PostgreSQL 没有 `DUAL` |
| `--spring.datasource.dynamic.datasource.master.type=com.zaxxer.hikari.HikariDataSource` | **换掉连接池**。见下——用 Druid 时约一半的登录会失败 |

## 池被换掉了，以及为什么

在 PostgreSQL + **Druid** 上，约一半的登录返回 500：

```
org.postgresql.util.PSQLException: 这个 statement 已经被关闭
  at org.postgresql.jdbc.PgStatement.checkClosed
  …  DruidPooledPreparedStatement.getMaxRows
  …  MybatisMapperMethod → AdminUserMapper.selectWithCursor
```

**换成 Hikari 就一次都不发生**——连打十二次登录、以及门禁转绿。改动就是上面那条 `…master.type` 参数，而且它是**命令行参数**：**没有一个上游文件为它而被改**。

走到那里绕了一段**值得留着**的弯路。第一轮得出的结论是「**Druid 的预备语句缓存已排除**」，并把它当成定论报了出去。**那是假绿灯**：验证过的是「**属性会绑定**」、**不是**「**池真的变了**」。去读池自己的状态（Druid 的 `/druid/datasource.json`）才看到，它一直是 `PoolPreparedStatements = true`。而随后是那条**更有用**的发现：

> **这个 Druid 池**无法从应用外面配置**。**`spring.datasource.dynamic.druid.pool-prepared-statements=false`——**命令行参数**也好、**优先级更高的外部配置文件**也好——都改不动它；姊妹前缀 `spring.datasource.druid.*` 也不行；**连改 `application-local.yaml` 再重新打包**也不行——那次之后**核对过 jar 里确实是 `false`，而池仍报 `true`**。

⇒ **「拿属性去调 Druid」这一整类修法在这里是死路**，下一件该试的**不是另一个属性**。JDBC URL 上的 `prepareThreshold=0` 也试过，同样没用。

**门禁该干的事，门禁随后就干了**：对着修好后的栈**第一次跑**，它在**生成模块**里抓到**两处方言错配**——一是 `deleted` 用 `boolean`，而宿主的逻辑删除拿 **`0`/`1`** 去比（它自己的 schema 写的是 `deleted int2 not null default 0`）；二是 `id` 后面**没有序列**（宿主的惯例是 `id int8 not null` 加一个 `<table>_seq`，而它生成的 DO 带着 `@KeySequence`）。**两处都已在 Spec 适配器里修掉**，而它们**从 Spike 起就一直躺在那份模块里**。

上面那条 `--spring.datasource.dynamic.druid.validation-query="SELECT 1"` **保留**，因为 PostgreSQL 确实没有 `DUAL`；它**不是**这次修法的一部分，也**没有**声称是。

**⚠ 两个坑，都是在本宿主上量出来的**——跑的过程见 Spike 记录：

- 中文经 `docker exec -i` 管进 `mysql` 客户端会变坏，除非加 `--default-character-set=utf8mb4`。
  它**曾经落进生成代码的注释里**。
- 中文经本 shell 作为**命令行参数**传给 `curl` 会坏；改用 `--data-binary @文件`。

## 数据存储

本线的数据存储是 **PostgreSQL + pgvector，加 Redis**，在 `scripts/docker-compose.datastore.yml`。
上游自带一份跑 MySQL 的 compose；那个文件是上游的、**一字不动**——这份是我们的，也是本线实际对着跑的。

```bash
bash scripts/bootstrap-datastore.sh          # 库不在就建，空就灌
RESET=1 bash scripts/bootstrap-datastore.sh  # 删库重灌
```

**已端到端验证（2026-10-08）。** 栈起得来、扩展报 `vector 0.8.7`、上游那份转换 schema 灌成 **49 张表**，
服务对着它起得来：Flyway 应用了运行时的四条迁移、`/auth/me` 作答、一次对话路由到工具并**从 PostgreSQL 里
读出一行真数据**、审计链对自己的行校验通过。

**第一次跑发现的一件事，已在 `yudao-server/pom.xml` 修掉：** 上游是按 MySQL 构建的、**不管理任何 PG 驱动**，
故在没有它之前平台启动即报 `ClassNotFoundException: org.postgresql.Driver`。该依赖现已声明在那里。

读失败信息之前有一件关于 schema 的事值得先知道：`sql/postgresql/ruoyi-vue-pro.sql` 是**从 MySQL 机器转换**来的
——它自己的文件头写着，还带着 `dual` 这样的残留。**它在这里是干净导入的**；若那里出错，那是**那份转换文件**的
事实、不是本线的。

那次转换的一个具体后果，是**跑出来的、不是读出来的**：`system_operate_log.user_id` 在转换后的文件里是
`NOT NULL`，而宿主在**没有登录用户**时会往里写 `NULL`。MySQL 靠把该值强制成 0 活下来；PostgreSQL 直接拒收，
于是那些请求**既丢了那一行操作日志、又报了一次错**。`sql/keelbase-operate-log-nullable.sql` 把该列放开，记录
因此留得住、并如实写着没有挂上任何用户——另一种做法是写 0，那会给这一行安上一个**没有任何用户持有**的用户编号。
它**不只是匿名请求**才会碰上：**由 AI 执行的一次写**跑在没有登录用户的线程上，这件事正是这么发现的。**新装也
要跑这个文件**，理由相同。

**⚠ 未覆盖：** pgvector 在位，是运行时知识层走**语义路径**的前提；但那条路还要一个嵌入模型，而这里没配
——故**语义路径本身没有跑过**，只验了扩展在位。

## 一次跑完全部真栈场景门

`scripts/run-all-scenarios.sh` 把每一道 `scripts/run-*-scenarios.mjs` 都对着**同一套**跑着的栈、按固定顺序跑
一遍并汇总。每道门仍是各自独立的程序、各有自己的断言；本脚本只省掉「为每一道门手动起停一次栈」。

```bash
bash scripts/run-all-scenarios.sh --list        # 只列出会跑哪些、会跳过哪些

PG_CONTAINER=sg-pg PG_DB=sg_1102 HOST_URL=http://127.0.0.1:18093 \
  bash scripts/run-all-scenarios.sh
```

它保证的几件事：

| | |
|---|---|
| **真实退出码** | 每道门的状态**直接从 `node` 取**、绝不经过管道，故红的那道报的是它真正退出的码 |
| **不提前收工** | 第一道红不会中止其余门 —— 一次跑就能看全所有读数 |
| **一份汇总** | 末尾 `N passed / M failed`，并逐条给出那道门自己的 `ok / failed` 数与耗时 |
| **一份读数文件** | 各门的 `READING …` 行收进日志目录下的 `readings.txt`（目录由 `SCENARIO_LOG_DIR` 指定，默认是新建的临时目录），故两轮之间 `diff` 即可比 |
| **一个退出状态** | 任一道门失败 ⇒ 本脚本 exit 1 |

发现规则与顺序写在脚本自己的头部。一句话：`ORDER` 表钉下一个刻意的次序（便宜的可见面在前、要真模型的在最后），
而**后加的门不必改脚本**也会被跑到 —— 接在表上那些之后、按字母序。

**它会跳过的门，以及为什么。** 前置不由本脚本安排的那道门会打印 `SKIP` 并写明理由，既不算通过、也不算失败。
今天只有一道：`run-model-loop-scenarios.mjs` 要一个带 `KEELBASE_MODEL_API_KEY` 起的宿主（见上面
`run-server.sh` 那一段的说明），故只有当你确认宿主是那样起的、并带上 `SCENARIOS_MODEL_HOST=1` 时它才跑。
另外三道真要模型的（`run-ai1-crm-scenarios` / `run-assistant-drawer-scenarios` /
`run-mcp-governance-scenarios`）**不跳过**：它们自己从 `KEY_FILE` 指的文件里读 key，文件不在或没有 key 就**大声失败**。

**一份绿的汇总不意味着什么。** 每道门都在自己的头部写明**声明的限度** —— 其中最要紧的一条是线缆上不带工具结果，
故工具投影是对着**模块那一行**断、并由单元测试钉住，而不是从应答里读出来的。汇总全绿说的是**每道门自己的断言都
成立了**，它不多主张一分。

## 同一批门在 CI 上

`.github/workflows/real-stack.yml` 在每次推 `main`、每个指向 `main` 的 PR、以及手动触发时，对着它为这一轮
现起的一套栈跑完整批门。

- **具名容器**：`gate-pg`（pgvector/pgvector:pg17）与 `gate-redis`（redis:7-alpine），端口只挂在回环上。
  不用 `services:` 而用**具名**容器，是因为每道门都经 `docker exec "$PG_CONTAINER"` 访问 PostgreSQL，
  而 service container 的名字是生成的、点不到。
- **灌库**：`deploy/demo-ecs/bootstrap-db.sh`（上游 schema、清单的 `load` 行、菜单收敛、上传存储），之后
  再灌 `sql/keelbase-bpm.sql` 与 `sql/keelbase-fms.sql`。清单里这两份都是 `skip` —— 本部署既不展示 bpm
  的菜单、也不带 fms —— 而 BPM 与 FMS 两组门要的是**真表**。
- **构建**：`mvn -B -ntp -pl yudao-server -am -DskipTests package`，随后一步断言 jar 带 `Main-Class`
  （证明 `spring-boot:repackage` 跑过），并打印 `BOOT-INF/lib` 里三个 `keelbase4j-*` 的版本 —— 于是
  「门禁跑在哪个运行时上」是一条读数，不是猜测。
- **宿主**：后台跑 `scripts/run-server.sh`；作业轮询 `/app/capabilities` 直到它答 200，300 秒仍不应答即失败；
  进程若提前退出，立刻失败并把宿主日志的尾巴打出来。
- **门**：`scripts/run-all-scenarios.sh`，`SCENARIO_LOG_DIR` 指在工作区内。控制台日志、逐门日志、
  `readings.txt`、宿主日志与灌库/构建日志一起作为 `real-stack-gates` artifact 上传，且是 `if: always()`
  —— **红的那一轮，那份读数才最该看**。

**这个作业不跑哪些。** `run-model-loop-scenarios.mjs` 由脚本自己跳过：它要一个按「模型回路已打开」起的宿主，
而作业起的是平常那一个。三道要真模型的（`run-ai1-crm-scenarios` / `run-assistant-drawer-scenarios` /
`run-mcp-governance-scenarios`）从 `KEY_FILE` 读 key、没有就 exit 1，故作业把它们移出 `scripts/` 的发现范围，
逐道在日志与 step summary 里打一行 `SKIP` —— 读得见，且**绝不计作通过**。配好仓库 secret `SPRING_AI_ENV`
（内容就是那个文件的全文：`SPRING_AI_DEEPSEEK_API_KEY=…`、`SPRING_AI_DEEPSEEK_CHAT_MODEL=…`），三道就照常跑。

## 从 Spec 生成一个受治理的模块

```bash
bash scripts/gen-from-spec.sh specs/products.json           # 写
bash scripts/gen-from-spec.sh specs/products.json --check   # 比对，有漂移即非零
```

给一份 Business Spec，它产出三个文件，**都是本项目自己的**、不是宿主生成器的：

| 产出 | 是什么 |
|---|---|
| `sql/keelbase-<module>.sql` | 建表的 DDL，带治理列与宿主的基列。**MySQL**，中文标签骑在 `COMMENT` 里——这个宿主自己的生成器在导入时读它，于是命名那一趟就并进了 DDL |
| `…/keelbase/generated/<Entity>Tools.java` | 模块的 AI 工具面：一读一写，各配路由 |
| `…/keelbase/generated/<Entity>Governance.java` | 模块的行范围，作为**切在模块自己 service 上的切点** |

**它不做**的是生成模块自己的 CRUD。那是这个宿主的代码生成器、经它的 API 驱动——**另一趟**，因为它需要一套跑着的栈；也正是因此，这一半是**确定性的、离线的**。

**`--check` 证明了什么、没证明什么。** 它证明盘上的文件**就是 spec 所说的那样**；它**不**证明它们**是对的**——它比的是**上一次运行写下的**，所以模板里的 bug 会**忠实地重新生成自己**、并且照报 `no drift`。第一版 DDL 模板漏了行尾逗号、还把 `comment` 粘到长约束上，产出了**无效 SQL** 而 `--check` 说它干净；逮住它的是**与 Spike 那份手工文件对账**。

**边界在哪，以及它是被检查的。** 适配器拥有**模块级**面——表 · 工具面 · 行范围切点——而宿主级件由宿主线**手写一次**。在上面那两个命名空间之内，这一点现在是**被强制**的、不是被描述的：

```bash
bash scripts/gen-from-spec.sh --check-boundary
```

它**两个方向都报错**：生成的缺了 ⇒ Spec 不再是源；两边都不属于 ⇒ 出现了**第二个源**。这道检查值得有，因为命名空间**并不靠名字区分两者**——`sql/keelbase-products.sql` 是生成的、`sql/keelbase-crm.sql` 是手写的，并排放在一起。因此新增一个手写文件必须**在 `SpecCodegen.HAND_WRITTEN` 里声明**；那是要点，不是麻烦。

## 另一道读散文的检查

```bash
node scripts/check-path-refs.mjs
```

`--check` 与 `--check-boundary` 读的都是生成器拥有的文件，**都不读引用**——不读注释或文档里写着的一条路径，
而它指向一个被改过名、或本仓从来没有过的文件。错路径与对路径渲染出来一模一样，故这条引用**安静地**烂掉。
这个脚本就是读它的那一个，且只读**我们自己的**文件：上游的树不扫（它们引的是它们自己的文件）、
`../` 路径不在范围内（它点的是同级检出）、`sql/keelbase-<module>.sql` 这样的**模式**是形状而不是路径。

它与 `--check-boundary` 一样**两个方向都报错**：被引用却缺席的路径，以及它 `ELSEWHERE` 清单里**再没人引用**的条目。
后者的存在，是为了让一条被声明的例外不会悄悄变成一个洞。

**它每次提交都跑**（2026-10-10 接进 `pre-commit`）。该 hook 由 `KeelBase-Private/.githooks/` 经
`KeelBase-Private/scripts/install-hooks.sh` 装出来，并在**任何持有本脚本的检出**里跑这道检查——仓群里其余检出是空操作。
它读的是**工作树**、不是索引，故在共用检出里，别人**在途**的一处编辑可能挡住你的提交；过去的方式是
`git commit --no-verify`。**它同时也在 CI 里跑**（`.github/workflows/ci.yml`，2026-10-10 加），每次推送到
`main` 与每个针对 `main` 的 PR 都跑——故那个 hook 是这道闸的快副本，而这道闸不依赖任何人记得跑它。
上游自带的那两个 workflow 照原样留着、仍是**休眠**的：它们触发于 `master`，而本仓分支是 `main`。

## 上游，以及怎么对着它比

`upstream` 指向 `https://github.com/YunaiV/ruoyi-vue-pro.git`——**规范源**；项目的 Gitee 镜像这里**没配**。
它存在，是因为**本仓的历史是全新起算**的，而这意味着通常的 fork 工作流**用不了**：

> **`git merge upstream/master-jdk25` 与 `git rebase` 会被拒绝**——两条历史**无共同祖先**
> （`refusing to merge unrelated histories`）。这个 remote 的用途是 **diff / 打补丁 / 取文件**，
> **不是合并**、也**不是推送**：它的 **push URL 已被刻意设成哨兵**（`DISABLED-READ-ONLY`），
> 好让手滑**推不到上游**去。

```bash
git fetch --depth=1 upstream master-jdk25     # 刻意保持浅；要更深用 --deepen
git diff upstream/master-jdk25 HEAD --stat
```

**读 diff 之前有两件事值得知道，都是踩出来的：**

1. **这里的 fetch 要用 HTTP/1.1。** 直接 `git fetch upstream` 会以
   `Failed to connect to github.com port 443` 失败，**而同一时刻** `git ls-remote upstream` 与
   `curl https://github.com` **都是通的**。用
   `git -c http.version=HTTP/1.1 fetch --depth=1 upstream master-jdk25` 才成。
2. **只有模式变了，`git diff` 也会报成 modified。** 约 **130 个文件**与上游只差**可执行位**——
   上游记的是 `100755`，这份拷贝在**经 Windows 过来时丢了那个位**。要看**内容**改动，比 blob：

   ```bash
   git diff --name-only upstream/master-jdk25 HEAD | while read -r p; do
     [ "$(git rev-parse "HEAD:$p")" != "$(git rev-parse "upstream/master-jdk25:$p")" ] && echo "$p"
   done
   ```

   **那条循环如今是一个脚本**：`node scripts/check-upstream-footprint.mjs`。用它，别用上面那两条命令——它对着
   **本仓自己带着的那个 pin tag**（`upstream-pin-994605b`）比、而不是对着会漂的分支，故**上游自己的进度不会
   被算进本线的数字**；而它报的读数，对着的是 `D45` 定下的那条边界（`KEELBASE-UPSTREAM.md`）。

## 本线的记录在哪

| | |
|---|---|
| 运行时的这一侧（本宿主） | 本目录（`KEELBASE-HOST.zh-CN.md`） |
| 本线的决定与待办 | 项目的**私有仓** `KeelBase-YuDao/`——**不在本仓** |
| 起始本线的那次 Spike | 同上，`KeelBase-RuoYi/Yudao真跑型Spike_2026-10-08.md` + `evidence-yudao-spike-2026-10-08/` |
