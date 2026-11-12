# KEELBASE-UPSTREAM —— 本线相对「它派生自的那棵树」站在哪

> `D45`（2026-10-11）。**决定本身在私库**（`KeelBase-Vue-Pro/决定索引.md`）；本页是**一个正要改上游文件的人**
> 真正会读到的地方。

本仓的历史是从**一个上游提交**全新起算的。它不是合并意义上的 fork——但它**确实是**一棵装着上游文件的树，
而本线已经改掉了其中几个。这里写的是：**允许改什么、改在哪登记。**

## 边界

RuoYi 线那条 `D15`——*绝不碰上游的生成物与 `vm/`*——**不平移到本线**（`D45`）。它也没法平移：本线的生成器
**就在仓里**，而本线**已经改了上游的 9 个文件**（活读数由下面的巡检给出）。取代它的是：

| | |
|---|---|
| **无需仪式即可** | 接线（一条依赖、一个显式 bean 名）· 构建形状（reactor 里有哪几个模块） |
| **作为自己的增量即可** | 控制台的视觉层 `keelbase-ui/host-patches/`——那是**另一个上游**（`yudao-ui-admin-vue3`） |
| **可以，但须登记在下面** | **改上游「做什么」**——要么因为治理的那条缝需要，要么因为**这棵树否则跑不起来**（它底下上游的依赖动了，之类） |

第三行里的改动要带**三件东西**，而三件都是要点：**注释里留标记**（说明这处是我们的）、**登记在下面的表里**、
**有测试**。没有标记，上游下次重写那个文件时，后来者读到的是**整片 diff**；没有登记，就没有东西说得出这类地方
共有几处；没有测试，就没有东西说得出那处改动是否仍然成立。

## 登记表

| 文件 | 改的是什么 | 为什么 |
|---|---|---|
| `yudao-module-ai1-springai/.../harness/session/Ai1SessionStreamTool.java` | 上游在自己线程上设置的安全上下文；**它在跑一轮会话之前现在会问的两条缝**（哪个模型、以及部署方自己的工具）；**现在每一次工具调用都会经过的治理缝**；以及它报给可选转录监听器的助手回合 | `D32`——调用方必须到达工具那条线程；两条缝是**部署方**对一个上游本来自己回答的问题的回答；治理缝让 MCP、SKILL 与 RAG 调用都落进引擎；转录监听器让部署方的轨迹页**看得见**这一轮 |
| `yudao-module-ai1-springai/.../harness/mcp/Ai1McpToolFactory.java` | 工具被**装配**时捕获调用方与会话号；**以及受治理的回调：调用经 `Ai1ToolGovernor`，不再直连 MCP 客户端** | `D32`——同一条缝，在装配那一侧；没有会话号，受治理的 MCP 调用那一行只能被读成「这个调用方最近的调用」；治理器让这次调用落进引擎的闸与审计 |
| `yudao-module-ai1-springai/.../harness/skill/Ai1SkillToolFactory.java` + `.../harness/skill/Ai1SkillExecutionContext.java`（**加在模块里的文件**） | SKILL 工具装配成受治理的回调；每个 agent 的 delegate 走线程上下文——工具名稳定，而沙箱是每个 agent 自己的 | 一次 SKILL 调用现在到达引擎（授权、审计）；上下文让同一个稳定的工具名在每个 agent 自己的沙箱里各跑各的 |
| `yudao-module-ai1-springai/.../harness/rag/Ai1RagTool.java` | advisor 的检索经治理缝执行（受治理的 R1 读） | 每次检索现在写一行审计，带着调用方与会话号 |
| `yudao-module-ai1-springai/.../harness/llm/Ai1LlmChatTool.java` | 它收到的是一个 `ChatClient`、不再是模型快照，也不再自己建 client | 一次会话跑在哪个模型上由**部署方**回答——见 `Ai1ChatModelResolver` |
| `yudao-module-ai1-springai/.../service/agent/Ai1AgentServiceImpl.java` | 建 agent 时校验模型，问的是**会话所问的同一个**解析器 | 一个本部署够不到的模型在**写 agent 时**被拒，而不是后来表现为一次会话失败 |
| `yudao-module-ai1-springai/.../harness/llm/Ai1ChatModelResolver.java` + `.../harness/local/Ai1LocalToolProvider.java`（**加在模块里的文件**） | 上面两条所问的那两条缝——工具那一条**除 agent 之外还收会话号** | 模型来自部署方自己的目录，而 agent 够得到运行时那些受治理的工具**且可归属**：没有会话号，受治理调用写下的任何一行都**逐轮读不出来** |
| `yudao-module-report/.../goview/GoViewProjectMapper.java` | `creator` 按字符串绑 | MySQL 隐式转换、PostgreSQL 直接拒绝 |
| `yudao-framework/.../swagger/config/YudaoSwaggerWebConfiguration.java` + 它在那个 starter 的 `AutoConfiguration.imports` 里的那一行注册 | 一个**加进上游自己包里**的自动配置，以及打开它的那一行 | springdoc 3.0.3 与 Boot 4.x 对 `api-docs` 端点**声明的返回类型**谈不拢，没有这一处它就抛（`dcd9c6b548`） |

改动面的其余部分是接线、文档与上表中一条的测试：`README.md` · 两个 `pom.xml` · `AuthController.java` ·
`Ai1McpToolFactoryTest.java` · `Ai1SkillToolFactoryTest.java` · 以及新增的树（本线的接缝、生成器、控制台层、部署、脚本、SQL、文档）。

⚠ 第三行已于 **2026-10-12 放宽**，这正是上表里 Swagger 那一条**属于它**的原因：它不是治理的缝，而是
**这棵树否则跑不起来**才需要的一处改动。在那之前，那一行写的是「当治理的那条缝需要时」，比这张登记表**窄**
——这个缺口是照巡检自己的话**去看了**才发现的，不是读了登记表就信它。

## 量它，而不是拿它当门禁

```bash
node scripts/check-upstream-footprint.mjs
```

它对着**本仓自己带着的那个 tag**（`upstream-pin-994605b`）比，**不是对着会漂的远端**——对着远端比会把**上游
自己的进度**算进本线的数字。它报**删 / 新增 / 改**，点名被改的文件并列出行数；列出**落进上游已拥有目录**的
新增文件；并把控制台那份补丁**另行**报成一个「够到多少个文件」的数。

它**刻意不亮红灯**。上游在动、本线跟着动，都是常态；一道会失败的红灯就是一道没人看的灯。改动面**超过上次读数**
时它会打印一行——那是提醒去看看，看完就把脚本里的读数更新掉。

## 可执行位

约 130 个文件与上游只差**可执行位**，那是这棵树经 Windows 搬运时丢的。**本线不维护 mode**（`D45`），巡检也
**排除**只差 mode 的那些，故不会把它们报成改动。要恢复它们，那该是**它自己的一笔改动**、有它自己的理由——
而这里没有任何东西需要它才能跑起来。
