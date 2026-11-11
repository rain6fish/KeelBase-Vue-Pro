# 部署：demo2 实例

> 英文：[README.md](README.md)

本目录保存的是在 `demo2.keelbase.com.cn` 上应答的那个 KeelBase-YuDao 实例的部署。它就是 demo 机器上
**实际在跑**的那套，放在这里是为了**让机器能从仓库重建，而不是从记忆重建**。

## 先决条件

本栈**不是自足的**。它加入一个既有网络，并用那台机器的数据存储：

- 同一台机器上跑着一套 KeelBase 栈（compose 项目名 `keelbase`）⇒ 网络 `keelbase_default` 存在，且上面
  有 `keelbase-postgres-1`（`pgvector/pgvector:pg17` 容器）与 `keelbase-redis-1`。
- 外面有一个 nginx（`keelbase-web-1`）为 `demo2.keelbase.com.cn` 终止 TLS、把整个域名转给 `yudao-admin`。
  那个 server 块在**主仓**（`KeelBase/nginx.https.conf`）里、不在本目录；找 `server_name demo2.keelbase.com.cn`。

## 要产出的两份产物

两份构建产物放在本目录旁边一起部署；两者都**不受版本控制**（见 `.gitignore`）。

**服务 jar**。在有工具链的机器上从本仓构建——**宿主机器没有 JDK、也没有 Maven**。

```bash
# 在仓库根；scripts/jdk25.sh 解析 JDK 25 而不动你的默认 JDK
bash scripts/jdk25.sh mvn -q -DskipTests package -pl yudao-server -am
# ⇒ yudao-server/target/yudao-server.jar   （胖 jar，约 300 MB）
```

**那份 jar 带哪几个模块，是这个部署的决定，而且它不在仓库里。** 本宿主跑**五个**：`system`、`infra`、
`bpm`、`crm`、`ai1-springai`。仓库自己的构建开得比这多，而这个差别不是外观问题——2026-10-12 拿一份开
**十五个**模块、580MB 的 jar 在这台 **1.6 GB** 的机器上试过，**它始终没起完**；而五模块那份是 308MB、
约三分钟起来。要产出它，得在构建前把两处裁到这五个（根 `pom.xml` 的 `<modules>` 与 `yudao-server/pom.xml`
的模块依赖），**两处都算数**：只从 reactor 拿掉、不从服务端依赖里拿掉的模块**不会**被打包；而只从服务端依赖
里拿掉、reactor 里还在的会——**从本机 maven 仓里被拉进来，悄无声息**；第一次尝试之后审计那份 jar，正是这样
发现 `report`/`hrm`/`fms`/`pms`/`oa` 还在里面。

> **2026-11-04 补正**：「五个」是 **2026-10-12 那次构建**的基线。此后治理线在 `yudao-server/pom.xml`
> 里打开了 `fms`（`YD-28` 的第五个模块；本部署不灌它的表、不显示它的菜单）以及 M3 的 `member` / `pay` /
> `pms` / `oa`，`seed-manifest.txt` 据此加载 `member` / `pms` / `oa` 的表。故「这个宿主跑哪几个模块」以
> `seed-manifest.txt` 与 `yudao-server/pom.xml` 为准，`module-scope.sql` 决定哪些菜单可见；上面 1.6 GB /
> 580 MB 的裁剪理由仍然成立。

**模块集是这个部署的，所以它属于这里、不属于仓库自己的构建。** 改这个宿主跑哪几个模块，就是改这个文件。

**`bpm` 在 jar 里，但不属于控制台。** 它在 jar 里不是意外：`yudao-module-crm` 在构建期依赖它——
CRM 的合同与回款审批走 bpm 的引擎——所以从 pom 里裁掉 bpm 会把 CRM 一起裁掉。本部署**不**做的，是把它
显示出来。三条事实合起来读：

| | 本机 |
|---|---|
| jar 里有 `bpm` 的类 | 有 |
| 控制台里有 bpm 菜单 | 没有 —— `/bpm` 不在 `module-scope.sql` 的保留清单里，整支被停用 |
| 库里有 `bpm_*` 表 | 没有 —— `seed-manifest.txt` 跳过了 `sql/keelbase-bpm.sql` |

看到 jar 里有 bpm 的类，**不该**读成「这台机器上有工作流」：它的页面一条都解不出来，而那些页面要读的表**不存在**。

> ⚠ **正在跑**的实例会锁住这个 jar ⇒ `mvn package` 的 repackage 会失败，且**可能把胖 jar 覆盖成瘦 jar**。
> 重建前先停掉那个实例，或在一个独立 worktree 里构建。

**后台界面**不在本仓。`scripts/build-host-ui.sh` 会去取上游那棵树、构建它，再把 KeelBase 视觉层铺到
构建产物上。它还会把页面的接口地址钉成**同源**：上游自己的 `.env.prod` 里写着
`VITE_BASE_URL=http://localhost:48080`——那对**构建它的机器**是对的、对**任何服务它的机器**都是错的：
部署出去的页面会去问**访问者自己的机器**要接口，于是页面看着正常、每次调用却以网络错误收场。

```bash
bash scripts/build-host-ui.sh
# ⇒ target/yudao-ui-admin-vue3/dist-prod/
```

## 部署

在宿主机器上、将来存放本栈的目录里（demo 机器上是 `/opt/keelbase-yudao`）：

```bash
mkdir -p /opt/keelbase-yudao/ui
# 从本目录拷入：docker-compose.yml、admin-nginx.conf
# 拷入：yudao-server.jar  → 该目录
# 拷入：dist-prod/*       → ui/

cp .env.example .env        # 再填两个值——各自从哪来见 .env.example

bash bootstrap-db.sh        # 建库并灌 schema（幂等；RESET=1 重灌）

docker compose up -d
```

`bootstrap-db.sh` 的 `load` 清单来自同目录的 `seed-manifest.txt`。那份清单把**每一份**
`sql/keelbase-*.sql` 都归类一次 —— `load`、`separate`（由自己的步骤跑，因为它要参数）、或 `skip`
（带理由）—— 于是新增的种子文件不可能被静默忽略。`node scripts/check-seed-list.mjs` 拿它与 SQL 目录、
控制台页面和 `module-scope.sql` 对账，已进 CI。页面到底可不可达，仍以从零重建为唯一终判。

服务要一两分钟才起来，日志结尾是 `项目启动成功！`。这样检查：

```bash
docker logs -f yudao-server
curl -s -o /dev/null -w '%{http_code}\n' https://demo2.keelbase.com.cn/
curl -s https://demo2.keelbase.com.cn/ | grep -o '<title>[^<]*</title>'   # ⇒ <title>KeelBase</title>
```

## 控制台展示什么，助手提供什么

`ConsolePages`——`navigate_console_page` 工具背后那份清单——点名 **31** 条路径。本部署真正跑的控制台
打得开其中 **19** 条：`/system`（9 页）、`/infra`（5 页）、`/crm`（5 页）。另外 **12** 条落在
`module-scope.sql` 停用的支里——`/report`、`/bpm`、`/oa`、`/hrm`、`/fms`、`/ai`——于是助手可能报出一页，
而控制台答「模块已禁用」。

`node scripts/check-console-pages.mjs` 现在**两棵树都查**：一条路径既要拼得出来，又要在本部署保留的支里。
那 12 条在该脚本的 `SWITCHED_OFF` 表里**逐页声明**；以下三种情况检查都变红——往停用的支里加了页面却没声明、
声明的支后来又被启用、声明的页面已经不存在。收窄 `ConsolePages` 本身是「助手该提供什么」的**产品决定**，
不是本部署改的东西。

菜单授予补不上这个缺口，而且值得知道：种子里 `super_admin` 的 `system_role_menu` 行共 **253** 条，其中
**229** 条指向本部署停用的支、**24** 条指向种子根本没定义的菜单号，**一条都不在**本部署保留的支上
（2026-10-24 实测；每次跑检查都会打印当前计数）。它们是**死重**而不是兜底——超级管理员由**全部**菜单作答、
不读这些行（`PermissionServiceImpl.getRoleMenuListByRoleId`）。

## AI 模型回路，以及去哪儿用它

KeelBase 自己的面挂在服务**根路径**上、不在 `/admin-api` 之下——AI 回路就在那儿应答。后台 nginx 把
三个前缀转过去（`/app`、`/ai`、`/audit`）；当 `.env` 里 `AI_ENABLED=true` 且有 `MODEL_API_KEY` 时，
由**真模型**驱动它们：

```
POST https://demo2.keelbase.com.cn/ai/chat    →  { "provider": "spring-ai", "toolCalls": [...] }
POST https://demo2.keelbase.com.cn/ai/task    →  步数 ≥ 2，且**要写**的那一步回来时被扣下等人、带着 token
GET  https://demo2.keelbase.com.cn/app/capabilities
```

提供方默认是 DeepSeek——`MODEL_BASE_URL=https://api.deepseek.com`、`MODEL_NAME=deepseek-v4-flash`——
而 `MODEL_BASE_URL` 可指向任何兼容 OpenAI 协议的端点。两个 `POST` 都用宿主自己的访问令牌（运行时把它
解析成一个宿主用户），所以只有**一套身份**、不是两套。运行时还在根路径注册了 `/auth`、`/customers`、
`/follow_ups`；这三个**有意不转发**——见 `admin-nginx.conf`。

## 改这套东西之前值得知道的

- **密钥不在这里。** `docker-compose.yml` 从 `.env` 读 `PG_PASSWORD` 与 `AUDIT_KEY`，而 `.env` 已被 git
  忽略。数据库口令是宿主既有的 Postgres 角色的，从运行中的容器上读出；审计密钥必须**生成一次之后不再动**，
  因为审计链要靠它重算哈希来验证。
- **上传进数据库，不进平台厂商的服务器。** 上游种子把一份**示例**存储设成 master、里面写着厂商自己的
  域名，于是每次上传都落到一个我们并不控制的服务器上。`sql/keelbase-file-storage.sql` 改为把**数据库
  存储**设为 master——文件进库，于是**没有哪个宿主目录必须存在、也没有东西要挂载**。它把 origin 作为
  参数收下（引导脚本里是 `PUBLIC_ORIGIN`），因为存下来的文件 URL 是由它拼出来的。
- **数据存储是共用的。** 库 `ruoyi-vue-pro` 住在宿主另一套栈的 Postgres 容器里，Redis 也是那套栈的、
  用的是**第 1 号数据库**以免与其缓存相撞。这里**不为二者建任何容器**。
- **在 demo 机器上，卡住的是内存而不是磁盘。** 服务以 `-Xmx384m` 跑，常驻仍约 600 MB；机器总共 1.6 GB，
  所以它在换页。若这个实例要靠得住，应当**给机器加内存**，而不是继续把堆调小。
- **AI 模型回路**由 `.env` 里的 `AI_ENABLED` 加 `MODEL_API_KEY` 控制。两者都给上，KeelBase 的
  `/ai/chat` 与 `/ai/task` 就由**真模型**驱动；base URL 与模型名默认是 DeepSeek 的
  （`https://api.deepseek.com`、`deepseek-v4-flash`），可指向任何兼容 OpenAI 协议的提供方。
  `AI_ENABLED` 不设时它们由确定性 planner 作答，`/ai/chat` 报 `provider: deterministic`。
- `--spring.datasource.dynamic.datasource.master.type=...HikariDataSource` 那个参数不是可有可无：
  在 PostgreSQL 上，上游默认的连接池会让**约一半的登录**失败。
