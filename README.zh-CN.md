# KeelBase-YuDao

> 英文：[README.md](README.md)

<p align="center">
  <a href="https://github.com/rain6fish/KeelBase-YuDao/actions/workflows/ci.yml"><img src="https://github.com/rain6fish/KeelBase-YuDao/actions/workflows/ci.yml/badge.svg" alt="CI 状态"></a>
  <a href="NOTICE"><img src="https://img.shields.io/badge/License-MIT_%2B_Apache--2.0-blue.svg" alt="许可：MIT（上游宿主）+ Apache-2.0（KeelBase 新增部分）"></a>
  <img src="https://img.shields.io/badge/Java-25-informational" alt="Java 25">
  <img src="https://img.shields.io/badge/Spring_Boot-4.1.0-informational" alt="Spring Boot 4.1.0">
</p>

**一个为 AI 而建的企业应用开发平台**——地基是 [芋道 / `ruoyi-vue-pro`](https://github.com/YunaiV/ruoyi-vue-pro)，
在其上补 KeelBase 运行时：身份桥、工具治理、确认、决策轨迹、审计与撤销。

> **不是上游的发行版。** 这是一个下游衍生仓，而它的历史是**刻意全新起算**的：**不携带**上游的提交，
> 故继承关系写在**本文件**与 `NOTICE` 里、而不是写在日志里。上游的树是**当宿主用**的，不是被重新打包成产品。
> 与上游项目及其作者**无隶属、无赞助、无背书**。

> **赶时间？** [KEELBASE-HOST.md](keelbase-docs/KEELBASE-HOST.zh-CN.md) —— 本仓为什么存在、它主张什么与
> 不主张什么、以及这条线现在站在哪。

**系列长文** —— 这些决定背后的长文，分「AI 执行治理」「AI 审计证据」两条线：[OSChina 文集](https://my.oschina.net/u/4166179/blog)。

<!-- BEGIN keelbase-family:zh sha256:7870abdc3207482b1d3d1a8f7018f0479182ac0d42b052cd6496d3be34f4eba1 -->
## 🧬 KeelBase 家族

<p align="center">
  <img src="https://raw.githubusercontent.com/rain6fish/KeelBase/main/docs/branding/keelbase-family-zh.svg" alt="KeelBase 家族架构图——宿主适配、两个互为平行的 runtime、桥接，以及它们共同消费的契约" width="880">
</p>

> KeelBase 是**一套协议、多个实现与多种宿主**——不是几个互相竞争的产品。契约是唯一真源，
> 各 runtime 与各宿主消费它，**谁也不拥有它**。这里每个仓都是 **Apache-2.0**。

```text
  宿主适配   KeelBase-YuDao
             └ 在成熟企业平台上补治理层（芋道）

  runtime    KeelBase（TypeScript）  ·  KeelBase4J（Java / Spring）
             └ 同一协议的两个载体——互为平行，不是翻译关系

  桥接       KeelBase-java-starter
             └ 把存量 Java/Spring 系统接成受治理的 AI 工具

  契约       keelbase-contract
             └ 线缆 schema + 一致性向量 + 两者共用的版本线
```

| 仓 | 角色 | 技术栈 | 状态 |
|---|---|---|---|
| [`KeelBase`](https://github.com/rain6fish/KeelBase) | 参考实现 · 产品文档 · 演示 | TypeScript · NestJS · Vue · Flutter · Taro | 活跃 |
| [`KeelBase4J`](https://github.com/rain6fish/KeelBase4J) | 同一协议的 Java 载体 | Java 17 · Spring Boot | 活跃 |
| [`KeelBase-java-starter`](https://github.com/rain6fish/KeelBase-java-starter) | 把存量 Java/Spring 系统接成受治理的 AI 工具 | Maven · Gradle | 0.1.x |
| [`KeelBase-YuDao`](https://github.com/rain6fish/KeelBase-YuDao) | 宿主适配——芋道平台上的治理层 | Java · Vue 3 | 活跃 |
| [`keelbase-contract`](https://github.com/rain6fish/keelbase-contract) | 协议本体——schema、向量、版本线 | JSON Schema | v1.x |

**从哪里开始** —— 想看它跑起来：[`KeelBase`](https://github.com/rain6fish/KeelBase)（60 秒
Docker）· 想让存量 Java 系统具备 AI 能力：
[`KeelBase-java-starter`](https://github.com/rain6fish/KeelBase-java-starter) · 你已经在用芋道：
[`KeelBase-YuDao`](https://github.com/rain6fish/KeelBase-YuDao) · 想实现这个协议：
[`keelbase-contract`](https://github.com/rain6fish/keelbase-contract)。

**系列长文** —— 这些决定背后的长文，分「AI 执行治理」「AI 审计证据」两条线：
[OSChina 文集](https://my.oschina.net/u/4166179/blog)。

每个 runtime 对着哪一版契约应答，**只在主仓维护一处**——见
[兼容矩阵](https://github.com/rain6fish/KeelBase/blob/main/README.zh-CN.md#-兼容矩阵)。此处不重复。
<!-- END keelbase-family:zh -->

## 这是什么

KeelBase-YuDao 拿一个成熟的企业应用平台当地基，给它补上这类平台普遍没有的那样东西：**一条能约束住 AI 的边界**。
宿主继续做它本来做得好的事——用户、租户、权限、数据范围、工作流、CRUD、代码生成。本仓补的是那条**决定「AI 在它之上
被允许做什么」**的约束，并把做过的事记下来。

这里的治理**不是**并列在那些之上的另一层：它是一条**横穿**它们的约束。宿主自己的界面继续自己守自己；本仓补的是
**AI 所执行的那些动作**要受的那条约束——而它必须在**每一条执行动作的路径上**都受得住，不是在某个独立的控制台上。

## KeelBase 补了什么

| 层 | 是什么 |
|---|---|
| **身份桥** | `YudaoCallerAuthenticator` / `YudaoIdentityResolver`——宿主的令牌与用户表成为运行时的主体与角色 |
| **工具治理** | 业务动作声明成带风险级与确认要求的工具；**决定权在平台、不在智能体** |
| **确认** | 写在他们执行之前**被人扣下**，且那次决定被记录 |
| **决策轨迹与审计** | 哈希链审计「谁导致了什么」，外加显式的决策轨迹 |
| **行范围治理** | 生成模块的行由**切在模块自己 service 上的切点**收束 ⇒ 工具面与模块 REST 面被**同一条条通知**管住 |

## 已验证

上面这些行为是**在一台开发宿主上实际观测到的**（2026-10-08），端到端：

- 芋道的访问令牌打到运行时自己的端点，调用方解析成一个芋道用户；
- 工具面在本宿主自己的用户表上**真的执行了一个工具**；一次对话路由到一个**由本宿主自己的代码生成器**
  产出的模块上的工具，并**读出一行真数据**；
- 一次写被 **R3 扣下等确认**，批准后才执行；
- 审计链**在本宿主上**对自己的行校验通过。

数据存储是 **PostgreSQL + pgvector**，且服务**被验证过对着它运行**。

**这份记录是什么、不是什么。** 它是一次**跑到第一份证据的 spike**——写稿与原始日志都在项目的**私有仓**里。
它**不是可重跑的门禁**：上面那些行为**还没有**像兄弟宿主那样被一支脚本持有。把它变成门禁正是**适配器那一半的活**；
在那之前，请把这里每一条都读成「**观测过一次**」，而不是「**持续被断言**」。

## 还没做——依赖它之前请先读这一节

- **它不是一个成品适配器。** 这里的东西起初是一次 spike；把它复制进一个仓并不会让它变成适配器。
- **模型驱动的路径没有接过真模型**——只跑过确定性规划器。
- **符合性套件与四率没在这儿跑过。** 整机检查、并发与长稳、以及上游模块依赖树的**许可面**，**全部未测**。
- **知识层的语义路径未跑过。** pgvector 在位（那是它的前提），但那条路还要一个嵌入模型，而这里没配。
- **它不主张验证。** 没有用户、客户或试点走过它。

> **⚠ 2026-10-11 复核** —— 上面两条**已在本宿主落地**：**模型驱动那条路**现已接真模型（`scripts/run-model-loop-scenarios.mjs`）；**符合性套件与四率**现已在此有脚本（`scripts/run-app-conformance.mjs`、`scripts/measure-governance-rates.mjs`）。清单按原样保留（2026-10-09 快照），其余仍成立。

## 它站在哪

KeelBase 把**一个**运行时作为**平台 + 适配器**来承载：运行时是 `keelbase4j-core`，而**每条宿主线一个仓**。
这是**第二条宿主线**，第一条是 `KeelBase-RuoYi`——那条线**冻结留存**，不再继续开发。

## 跑起来

```bash
bash scripts/bootstrap-datastore.sh   # PostgreSQL + pgvector，另加 redis
bash scripts/run-server.sh            # JDK 25，按命令解析
```

`scripts/jdk25.sh` 为**一条命令**解析出一个 JDK 25，且**不动**机器默认的 JDK——这里的平台编译目标是 25，
而它嵌入的核心基线是 17。细节（含每个运行参数为什么需要）见 [KEELBASE-DEV.zh-CN.md](keelbase-docs/KEELBASE-DEV.zh-CN.md)。

## 来源

上游：[`YunaiV/ruoyi-vue-pro`](https://github.com/YunaiV/ruoyi-vue-pro)（「芋道」）——分支 `master-jdk25` @
`994605b`（2026-10-07）· Spring Boot 4.1.1 · Java 25 · MIT，`LICENSE` 原样保留。

**上游的 README 正文不在此复现**；上游的提交历史**也不携带**：本仓是全新初始化的，故与上游**没有共同的
merge base、也没有共同的提交**。

上游的名字是**描述性**用法——用来说明本仓建在什么之上。它**不是本项目的名字**，也不构成任何关联主张。

## 许可

上游是 MIT、原样保留（`LICENSE`）。本项目新增的一切是 **Apache-2.0**。哪部分适用哪个许可，见 [NOTICE](NOTICE)。
