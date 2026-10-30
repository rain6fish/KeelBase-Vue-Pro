# KeelBase-YuDao —— 接入一个业务模块

> English: [KEELBASE-MODULE-ONBOARDING.md](KEELBASE-MODULE-ONBOARDING.md)

把一个业务模块纳入 KeelBase，分两半。一半**每个宿主只写一次**，之后的模块白得：身份、规划器、审计链、确认引擎。
另一半**每个模块都要写**。本文件就是后一半，写成一份清单。

它**不裁任何东西**。哪儿缺决定，它就点出是哪一条，而不是替你选。

**写于 2026-10-10**，材料是现有的两个模块：`crm`（上游自己的代码——283 个 Java 文件，我们没写、没重新生成、没改）
与 `products`（由 `specs/products.json` 生成）。两个样本是**跨 Host 共性证据**里那条同一个上限：够看见一个形状重复，
不够冻结一份契约。

**2026-10-11 修订**：`YudaoRowScope` 把范围机器那条「声明的收窄」换成了读本宿主自己的角色（§4.1 与 §5——
它改动的正是那两句所在处）。

**2026-10-21 修订**：接入**第五个**模块——infra 的示例联系人（`yudao_demo01_contact`），也是第一个**行上
没有属主列、模块自己没有权限表**的模块。它把本文件只暗示过的两处代价写成了规则：没有调用方筛选位可传时的
分页 total（§2.1），以及工具路径创建之后必须补盖属主（§2.2）。它的门禁是
`scripts/run-demo01-contact-scenarios.mjs`。

## 1. 哪一半是哪一半

| 那一半 | 住在哪 | 新模块要动它吗 |
|---|---|---|
| 身份桥 | `YudaoCallerAuthenticator` · `YudaoIdentityResolver` · `YudaoCallerId` · `ActingCaller` | 不用 |
| 规划器 | `YudaoToolPlanner` · `YudaoToolFaceConfiguration` | **不用** |
| 行范围机器 | `YudaoModuleScope` | 不用——但有 §4 那条前提 |
| 审计 · 确认 · 撤销 · 符合性 | 平台 `keelbase4j-core` | 不用 |
| **治理切面** | 模块自己的包 | **要** |
| **工具面** | 模块自己的包 | **要** |
| **路由** | 模块自己的包 | **要** |

规划器之所以只写一次，是因为它**从不点名任何工具**。`YudaoToolFaceConfiguration` 从上下文里取
`List<ModuleRoute>`，于是**声明一个路由 bean 就是一个模块对路由的全部贡献**——加模块时 `YudaoToolPlanner` 一个字不改。

## 2. 一个新模块的成本

三件东西，落点通常是**两个文件**：一个 `*Governance` 切面、一个 `*Tools` 配置（路由是后者里的 `@Bean`）。
`ListYudaoUsersTool` 配 `YudaoUsersRoute` 则是同样三件东西摊在两个文件里——那个拆法是风格选择，不是规矩。

第四件只在**这个模块的写可以被撤销**时出现：它的 `SideEffectCompensator` 以 `@Bean` 落在**模块自己的
`*Governance`** 里，**不再**往宿主的 `YudaoLocalCompensators` 追加（`YD-44`）。这正是新模块的「宿主级件」保持
**0 行**的原因。

### 2.1 治理切面 —— 切点**就是**清单

`@Aspect @Component`，切点点名模块**自己的 service**：

```java
@Around("execution(* cn.iocoder.yudao.module.crm.service.customer.CrmCustomerService.getCustomerPage(..))")
```

**为什么在 service 上、不在工具里。** 收束写进 AI 工具，就只治理了工具自己那一次调用，模块自己的 REST 路径照旧敞开。
把通知点在模块的 service 上，REST 路径与工具才被**同一批通知**管住。生成模块的第一版犯的正是这个错，它的文件里记着。

**收窄什么——读，别套模板。** CRM 需要的那四条通知不是模板，是**读 CRM 自己的代码**找出来的四件事。能推广的是**要问任何模块的
那组问题**：

| 问 | CRM 的答案（在他们的代码里读到的） |
|---|---|
| 不给筛选时，分页返回什么？ | `sceneType` 为空时 `CrmSceneTypeEnum` **一个条件都不加**，而请求 VO 把 null 记作「全部」 |
| 按 id 读受范围约束吗？ | 不受——`getCustomer(Long)` 就是一句裸的 `customerMapper.selectById(id)` |
| 保存 VO 允许客户端指认别人为属主吗？ | 允许——属主列就在 VO 里 |
| 按 id 的更新 / 删除校验归属吗？ | 不校验 |

每个模块对这四问的答案都不同，有的会答「这里没有要堵的」。**那次阅读就是这份活本身，压缩不了。**

**分页没有属主筛选位可传时，total 必须说清它是哪一种 total。** 有的模块分页 VO 里没有调用方 / 属主列——
属主只是持久层填的审计串 `creator`。通知没法把查询收窄，只能让模块先答、再过滤它交回的**这一页**。这比
「保住总量的筛选」更窄，也改变了 `total` 的含义：模块自己的 total 数的是整张表，收窄后的 total 只能数
**这一页**留下的行。诚实的写法是把 `total` 重算成「留下的行数」，并在读得到的地方**声明**这个选择——模块
注释与本文件——免得有人把它当成整表计数。需要每个调用方真实总量的模块，得在**它自己的**查询里加调用方筛选
（或带同一筛选的 count 查询）；通知造不出这个筛选。门禁要用一对断言把口径钉住：豁免调用方看到模块总量，
收窄调用方看到本页总量（`run-demo01-contact-scenarios.mjs` 场景 3.5）。

**把收窄声明成收窄。** CRM 那条通知只问属主这一问，而上游的 `crm_permission` 除负责人外**还给参与方** READ 与 WRITE。
所以那条通知**比模块更严、不等于模块**——它的文件这么写着；要放宽到权限表，是对**这个宿主词表**的决定，
**留而未决、不猜**。每个模块都欠同一句话。

### 2.2 工具面 —— `AiTool` bean

一个 `@Configuration` + `@Bean AiTool`：一读（R1）一写（R3）。**写**要声明 `parameters()`——一份写了工具不读的参数的提议，
会在闸口以 `invalid_arguments` 被拒，**到不了人**。

**把调用方带着。** 上游自己的分页查询把用户 id 作为**入参**，故身份必须**传递**、不只是「能拿到」：
`ActingCaller.as(principal.userId(), …)`，外加宿主的租户（`TenantUtils.execute(...)`）——宿主 service 调用没有租户会被拒。

**工具路径创建之后补盖属主。** 框架的审计字段处理器从安全上下文取 `creator`；AI 工具那条路把调用方发布在
`ActingCaller` 里，不在安全上下文里。故经工具创建的行会带着空 `creator` 落库、对它自己的属主不可见。模块的
service 必须在 insert **之后**把正在行动的调用方写回——按 id、在同一次受治理调用里（也就是同一个租户上下文）。
先例：`Demo01ContactGovernance.stampCreator`（读 `scope.creatingCaller()`、调 service、再只更新
`{id, creator}`）；门禁断言的是**补盖后的值**，不只是「行存在」。这是逐模块的代码，不做宿主 helper：保存 VO
与 mapper 都属于模块，共享 helper 得同时猜这两样。

**投影。** 输出时把身份字段与联系字段去掉；管理端那条红线是**身份字段在边缘掩码**。

### 2.3 路由

每个工具一条 `ModuleRoute`：`toolName()` · `triggers()` · `args(context)`。规划器先匹配触发词，
宿主没说的**一律回落到**运行时的 `RuleBasedPlanner`——**这条回落是承重的**：提供任何一个 `ToolCallPlanner`
都会让运行时自己的自动配置**让位**。

### 2.4 构建会来查你的两处

**手写的 SQL 要声明。** 上游不发布其 schema 的上游模块，会有一份我们推导的 `sql/keelbase-<module>.sql`。
把它加进 `keelbase-codegen/src/main/java/cn/iocoder/yudao/codegen/SpecCodegen.java` 的 `HAND_WRITTEN`，
否则 `bash scripts/gen-from-spec.sh --check-boundary` 会把它报成 `UNDECLARED` 并以 1 退出。

**手写的 Java 别放进 `generated/`。** 边界检查只管两个命名空间：`sql/keelbase-*.sql` 与 `keelbase/generated/*.java`。
我们手写的模块（CRM）把 `*Governance` 与 `*Tools` 留在**上一级**包 `cn.iocoder.yudao.server.keelbase`，
**不是** `…server.keelbase.generated`。放进 `generated/` 会把检查搞红——这是**被强制**的，不是命名偏好。

### 2.5 门禁

新模块配一个自己的场景脚本，抄 `scripts/run-crm-customer-scenarios.mjs` 的形状。它断言的是 `D28 ④` 所称的**第一道验收门**
四件事：能以**明确身份**访问 · 越权被拒 · 高风险写入被扣下等人 · 副作用可审计。
**第四条是 best-effort、不是保证**：宿主写的是**它自己的库**、审计行走的是**另一个库**，故**写入成功而审计那次追加失败**时，
这次写就**没有记录**（`D36 ①`，2026-10-11）。对外只能说「**原则上会被记录**」，**不能**说「每一笔写都在链上」。
**每条断言都用本次唯一的名字收束，绝不按整张表计数**——这样门禁在**一个已经跑过的库上**、
**以及跟它自己的另一次运行并排**时都成立。

属主是审计串的模块，除那四件事外还欠两条断言：分页 total 的声明口径（§2.1）与工具创建行的属主补盖
（§2.2）。两条都在 `run-demo01-contact-scenarios.mjs` 里（场景 3 与 3.5）。

收尾必须收回**本轮标记命中的全部确认行**，不只 `pending`。批准过的行同样属于本轮的痕迹；按
`status = 'pending'` 删会把它留给下一轮。要按本轮唯一 marker 与夹具行 id 匹配，并把 `approved` 与
`rejected` 一并纳入删除。

## 3. 生成那条路是同样三件东西，由机器产出

`specs/products.json` → `bash scripts/gen-from-spec.sh specs/products.json`，产出该模块的 DDL、它的 `*Tools`、它的 `*Governance`。
同样三个形状，是**产出**的、不是手打的。

这条路有一处更容易，方向值得写下来，因为它与通常方向相反：分页请求 VO 是**我们自己的**，故它本身就带属主列、
生成的 mapper 也已经把它变成 `eqIfPresent`。收束一次分页 = 调用前一句 `setOwnerUserId`——而且**总数一起收窄**，
没有哪一页的 total 与它的行不一致。

**这条路「不用手工重复」只对由我们生成的模块成立。** 对上游写的模块，没有 Spec 可写——见 §2。

## 4. 四件事决定「每模块一次」是贵还是便宜

1. **那台范围机器是「属主列」机器。** `YudaoModuleScope.belongsToCaller` 比的是 `ownerUserId`。行范围按**部门**、
   **权限表**或**租户**的模块，套不上它，要长出**第二台**机器。这就是「每次一个样」与「每次都一样」的分界线。
   第二台现在**部分到位**——`YudaoRowScope` 读的是**本宿主自己的**角色表——但它答的是另一问：调用方是否覆盖
   全部行、从而整条豁免，**不是**「这个人看得见哪些行」。收窄本身仍是属主列。
2. **没有任何东西能枚举「哪些模块被治理了」。** RuoYi 有 `GovernedModule` 接口与注册表；YuDao 的 `CrmCustomerGovernance`
   与 `ProductsGovernance` 只是裸 `@Component`。**没有一个地方列出被治理的模块**——于是也没地方能读出「有个模块被漏了」。
3. **每个模块欠一次收窄决定**（§2.1）：只认属主，还是对齐模块自己的权限表。
4. **抽象边界尚未定。** `YD-T7` 开着，而跨 Host 共性证据把 `ActingCaller` · `ModuleRoute` · 「路由+回落」式规划器列为
   **上提候选**。现在写的接缝，将来包位置可能挪——因为样本仍然只有两个宿主。

## 5. 本文件不主张什么

- **五个模块就是五个样本**——四个上游（`crm`、BPM 请假单、系统站内消息、infra 示例联系人）与一个生成
  （`products`）。上面写的是它们重复过的形状，不是一份契约。前四个给出的是一条**数字**：第二个模块 642 行、
  第三个 647 行，故每模块的工作量是平的。第五个补上了它们没覆盖的一面：没有属主列、没有自己的权限表，故有
  2026-10-21 加的两条规则。
- **CRM、BPM 请假切片、系统消息切片与 infra 示例联系人都被端到端跑过**（各自门禁）；`products` 只被生成和
  构建过，**没有**过同一道门。
- 范围机器的管理员判定**仍是占位**：「管理员」指用户 1，直到角色映射定下。这半条**未变**。变的是另一半
  （**2026-10-11**）——宿主角色表现在**真去读**了（`YudaoRowScope`），但只为「全部行」那条豁免服务。
  在那之前本文件写的是「还没有这一步」，而那句话在写下时是真的。

## 6. 真源在哪

| 问题 | 读 |
|---|---|
| 这个仓是什么、不做什么 | `KEELBASE-HOST.md` |
| 怎么弄出一个能跑的检出，以及路上的坑 | `KEELBASE-DEV.md` |
| 同一个问题在已冻结的 RuoYi 宿主上（写得更细） | `../../KeelBase-RuoYi/keelbase-docs/KEELBASE-AI-GUIDE.md` |
| 一个模块的门禁断言了什么 | `scripts/run-crm-customer-scenarios.mjs` |
| 哪些文件归 Spec、哪些是手写 | `bash scripts/gen-from-spec.sh --check-boundary` |
