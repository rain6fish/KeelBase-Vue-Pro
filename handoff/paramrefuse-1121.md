# 读面拒绝未声明的查询参数（paramrefuse-1121，交接）

分支 `claude/great-proskuriakova-6114ab`，基线 `47a541972e`；worktree 内提交，**未推送、未合 main**。

## 0. 一句话结论

宿主部署（`yudao-server`，内嵌 `keelbase4j-core` 0.1.20）在 `/audit/logs` 上新增一道参数守卫：**读面没有
声明的查询参数一律 400，并在正文里点名字段**。`?tenantId=121`、`?tenantId=`、`?page=1` 都从「静默丢弃、
答回全链」变成显式拒绝；读面声明过的 11 个参数（`userId / since / until / objectType / objectId /
isError / agentId / orgId / denied / limit / offset`）一个不改语义，其中 `agentId/orgId/denied` 仍由运行时
自己答它原来的 400。**未动 `KeelBase4J`、未加契约字段。**

## 1. 缺陷在哪一层，修在哪一层

- 审计读面 `GET /audit/logs` 的控制器在运行时仓：`KeelBase4J/keelbase4j-core/.../web/AuditController.java`
  （`logs(...)`，声明上述 11 个参数；`agentId/orgId/denied` 显式 400）。Spring 对 handler 没声明的查询参数
  不报错、直接丢弃，故 `tenantId` 落到「没传」那一支。
- 该控制器**嵌在本应用的同一个 Spring 容器里**（`yudao-server/pom.xml:37-41` 依赖 `keelbase4j-core`），
  所以宿主在参数解析前就看得到全部查询参数 —— 拦截器的 `preHandle` 比控制器参数绑定早。
- 结论：**宿主这一层能单独拒绝**，不需要改运行时，也不属于「参数在校验前被框架吞掉」那种只能改别处的情形。
  新增 `YudaoAuditReadParamsGuard`（`HandlerInterceptor`），挂在 `/audit/logs` 上。
- 生成器产出的应用（`KeelBase4J` 的 `JavaGenerator` 生成的那条 `/audit/logs`）**不在本仓、也没有宿主
  拦截器**，本仓改不到；那半边仍然静默丢弃，已在文档里写明（见 §3）。

## 2. 改动

| 文件 | 位置 | 内容 |
|---|---|---|
| `yudao-server/.../keelbase/YudaoAuditReadParamsGuard.java` | `:49-75` | 新守卫：遍历 `request.getParameterMap()`，任何不在 `DECLARED_PARAMS`（`:58-60`）里的名字 ⇒ `ResponseStatusException(400)`，正文点名该字段并列出已声明清单 |
| `yudao-server/.../keelbase/YudaoAuditReaderWebConfig.java` | `:98-105`、`:122-123` | 注入并注册守卫到 `/audit/logs`；注册排在审计读者执行守卫之后，既有静态对账脚本读到的第一份 `addPathPatterns` 不变 |
| `yudao-server/src/test/.../YudaoAuditReadParamsGuardTest.java` | 全文 | 正负双向 6 条测试 |
| `scripts/run-audit-two-cases-scenarios.mjs:366` | 一行 | `/audit/logs?page=1&limit=200` → `?limit=200`。`page` 从来不被读面施加，此前被静默忽略；现在它会 400 |
| `keelbase-docs/KEELBASE-AUDIT-SEARCH{,.zh-CN}.md` §7 | 各一段 | 写明宿主有这道参数守卫、生成物应用没有 |

400 的正文形如：

```
unknown audit read filter "tenantId": this read face does not apply it, so it would answer a list
that looks filtered and is not; declared: userId, since, until, objectType, objectId, isError,
agentId, orgId, denied, limit, offset
```

经运行时的 `WireExceptionAdvice`（最高优先级、已在宿主里）渲染为冻结的 `error-body`，带**真 HTTP 400**，
与运行时对 `agentId` 的拒绝同形。

## 3. 为什么用白名单、清单怎么跟

- 白名单而非黑名单：连还没人想到的名字也拒绝，不只是 `tenantId`。`DECLARED_PARAMS` 对齐本宿主 pin 的
  运行时（`keelbase4j-core` 0.1.20）的 `AuditController#logs`；运行时读面新增参数时，这份清单随 pin 一起更新。
- 已声明但运行时自己拒绝的 `agentId/orgId/denied` 照常放行到控制器，保留运行时自己的 400 文案。
- **生成物应用不受本改动影响**：它没有宿主拦截器，直到生成器自己声明筛选（F10 记下的那半个修复）之前，
  未声明参数仍被静默丢弃。本仓只能把宿主这一半做掉 —— 这正是任务书允许的口径。

## 4. 测试读数

命令（本机默认 `JAVA_HOME` 是 JDK 17，项目 target 25，故显式指定）：

```
JAVA_HOME=/d/Develop/jdk-25 PATH="/d/Develop/jdk-25/bin:$PATH" \
  mvn -o -pl yudao-server test -Dtest=YudaoAuditReadParamsGuardTest
```

- `YudaoAuditReadParamsGuardTest`：**6/6 通过**（`tests=6 errors=0 skipped=0 failures=0`）
  - 反例：`tenantId=121` → 400 且正文含 `"tenantId"`；`tenantId=`（空值）→ 400；`page=1` → 400 并点名
  - 正例：声明的 11 个参数逐个 `preHandle` 返回 true；无参数 → true
  - 正文还包含已声明清单（`theRefusalAlsoListsWhatIsDeclared`）
- 邻接回归：`YudaoAuditReaderExecutionGuardTest` **8/8**、`YudaoAuditReaderRulesTest` **10/10**
- `node scripts/check-audit-reader-execution-guard.mjs` → `PASS`（exit 0），新注册未破坏既有静态对账
- `node --test scripts/audit-query.test.mjs` → **30/30**
- `node scripts/check-path-refs.mjs` exit 0；`node scripts/check-console-pages.mjs` exit 0

## 5. 没做 / 未验证

- **未跑真栈**：没有起数据库与宿主做一次 `GET /audit/logs?tenantId=121` 的 HTTP 读数；「400 且正文点名」
  由单元测试 + 运行时 `WireExceptionAdvice` 的既有形状推出。若需要硬读数，起宿主后按
  `run-audit-two-cases-scenarios.mjs` 的方式取一次即可。
- 未跑整套 `yudao-server` 测试，只跑了审计读者相关三组（上表）。
- 生成器那半边（声明三参数、未声明即 400）仍需在 `KeelBase4J` 改，见 F10 与 `tenant-col-1121.md`。
- 其他运行时读面（`/ai/tool-effects`、`/ai/confirmations`）对未声明参数同样是静默丢弃，本任务未扩到那里。
