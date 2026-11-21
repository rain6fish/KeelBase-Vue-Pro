# 租户可见性 · 冻结期落地（丙）+ 乙b 为什么落不了（2026-11-21）

对象：worktree `angry-cohen-762e99`，分支 `claude/angry-cohen-762e99`，基线 `47a541972e`（runtime pin 0.1.20）。
任务书：落 `D:/Rain6fish/handoff/tenant-col-1121.md` 推荐的「丙 + 乙b」。边界：不加列、不改冻结行形状、不升 wire、不碰
`KeelBase4J`、不 push、不合 main。

---

## 0. 一句话结论

**丙落了；乙b 落不了 —— 现有接口拿不到 `ai1_mcp` 的租户，且「不可见」不能读成「别的租户」。**按任务书的
兜底条款停在「明写不按租户归属」，并在此给出乙b 落地所需的那个变更（一条同型于 `caller-names` 的宿主端点，
或 0.1.21 的列）。冻结期内运行时、契约、迁移、wire 一个都没动。

---

## 1. 丙：页面与导出明写「不按租户归属」

| 位置 | 改了什么 |
|---|---|
| `keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue:242-255` | 行该画的地方（`rowsHint` 之后、表格之前）加一行 `keelbase.audit.tenantHint`；有行才画（`v-if="displayRows.length"`），普通列表与检索结果都覆盖 |
| `AuditChainPage.vue:1436-1442` | 核对 CSV 的说明行改为 `exportNote` + `exportTenantNote` 两句拼接，经 `checkCsvText` 的 `note` 参数写在表头**之前**（元数据行，不是数据行） |
| `keelbase-ui/host-patches/0002-governance-ui.patch:94-97`（en）/ `:915-918`（zh） | 两套词条：`tenantHint`、`exportTenantNote`；补丁 hunk 头 `+1,816` / `+1,808` 已按新增行数同步 |
| `keelbase-docs/KEELBASE-AUDIT-SEARCH.md:188` / `.zh-CN.md:151` | 各加一节 §10：租户不是这条链的维度 |

口径与现有 coverage / 六问一致，逐条对上报告 §1.4、§2 丙：

- 六问里没有租户这一问（`sixQuestions.mjs:27`），行上没有租户字段（`governanceApi.ts` 的 `AuditRow`、
  冻结 schema v7 都没有）；
- 一次连通测试在句末点名 ` · object MCP connection #N`，点名了对象、不点名它属于哪个租户；
- 读面不收租户筛选：**带上它，要么被忽略（未声明该参数的面）、要么被拒绝（声明了的面），不会收窄**——
  这正是报告 §0 点名的「看着像筛过、其实没有」那个坑，现在写在读者眼前。

**为什么六列业务 CSV 一个字没动**：U1 的验收口径是「六列就是页面那六格」，`f10-readface-1121` 同样把
「导出明写」交给页面那一行。核对 CSV 的说明行是 `checkCsvText` 已有的元数据机制（`auditQuery.mjs:365`），
故「导出里明写」落在它上面，六列那份不动。测试钉住说明行不冒充数据行（见 §4）。

---

## 2. 乙b：现有接口拿不到租户 —— 逐条读数

乙b 要的是「按 `ai1_mcp.tenant_id` 收窄」。控制台能拿到的面，逐条看：

| 面 | 读数 | 为什么不够 |
|---|---|---|
| `GET /ai1/mcp/get`（`Ai1McpController.java:69-76`） | 要 `ai1:mcp:query`（`:72`），回 `Ai1McpRespVO` | `Ai1McpRespVO` **没有 `tenantId` 字段** —— 租户不在 wire 上。且 `audit_reader` 没有这个权限 |
| `GET /ai1/mcp/page`（`:78-84`） | 同一个权限、同一个 VO | 同上 |
| `GET /ai1/mcp/simple-list`（`:86-92`） | **不要权限**，任何已登录调用方都能问 | 只列**启用**对象（`getMcpListByStatus(ENABLE)`）；「不在列表里」有四种解释（别的租户 / 已停用 / 已删除 / 不在这一页），读不出租户 |
| `GET /admin-api/keelbase/record-names`（`YudaoRecordNames.java:129-148`） | 不要权限，服务端联结 | 闭表白名单只有 `crm_customer` / `crm_follow_up_record` / `infra_demo01_contact` / `products`：**不认 `ai1_mcp`**；且只答台账与确认记录里出现过的引用 —— 连通测试行两处都不在，恒答空。空答案分不出「别的租户」与「本来就不在账本里」 |

再补两条使乙b **在语义上**也不成立的事实：

1. **租户过滤本身**：`Ai1McpDO extends TenantBaseDO`（`Ai1McpDO.java:28`），`yudao.tenant.ignore-tables`
   为空（`application.yaml:323`），故 `selectById` 一定带 `tenant_id = <上下文>`。于是 `get` 答的是
   「**对我**是否可见」，不是「这条对象的租户是几」。
2. **「不可见」≠「别的租户」**：对象在测试之后被删掉（`BaseDO` 软删，`selectById` 同样读不到）、被停用、
   或调用方没有权限，三种情况与「别的租户」在答复上**一模一样**。拿它做负面证据去丢行，会把本租户的行
   当别人的行藏起来 —— 对审计面来说，这是「用错的理由藏掉一条真行」，比不筛更糟。

第三条是权限面：`audit_reader` 持有的只是治理菜单（`scripts/check-identity-matrix.mjs:358-365`），
`sql/keelbase-ai1-permissions.sql:18-21` 明写 `ai1:*` 按钮权限只发给超管 —— 审计页的主读者在 `get`/`page`
上会拿到 403。一条只对管理员成立、对读者恒 403 的「租户筛选」，不是这一页要的东西。

**结论**：乙b 不是「难」，是现有面**答不出租户**。按任务书「若现有接口拿不到租户……就停在明写 + 写提案，
不要自造接口」，没有加 `/admin-api/keelbase/...` 新端点，也没有给 `Ai1McpRespVO` 塞 `tenantId`。

---

## 3. 乙b 落地需要什么（提案，未做）

两条路，都留给 0.1.21 的那次决定：

1. **同型于 `caller-names` 的宿主端点**（推荐，零迁移）：`YudaoMcpTenants` + 控制器，`GET
   /admin-api/keelbase/mcp-tenants?refs=ai1_mcp:12,...`，**不要额外权限**（读者一条授予不动，这是 F-14 /
   YD-42 C③ 定下的口径），服务端用 `TenantUtils.executeIgnore` 直读
   `select id, tenant_id from ai1_mcp where id in (…)`（**不过滤 deleted**：审计问的是「当时那条对象属于
   谁」，不是「它现在还在不在」）。控制台按返回的租户与自己的 `getTenantId()` 比对，只丢**正面证明**是
   别的租户的行；答不出（被删、无此行）的行保留并标「无法反查」。
2. **甲（0.1.21）**：可空 `tenant_id` 列 + 读面 `tenantId` 参数 + 未施加即 400 + wire v8。这是终局，报告
   §3 已给出字段与迁移草案。

两者共用同一个前置决定（报告「未决 2」）：**审计读者今天读得到每个租户的行**，按租户收窄是一次可见性变更，
要先裁定它是「可选筛选」还是「默认收窄」。这条不裁定，端点写出来也只能做成开关。

落地后要补的测试（本次没有对象可测，故没写）—— 任务书要求的那半条：

| 读数 | 期望 |
|---|---|
| 行末 `MCP connection #12`，反查答「本租户」 | 保留 |
| 行末 `MCP connection #13`，反查答「租户 121」 | 丢掉，且页面说「已按租户收窄」 |
| 行末 `MCP connection #14`，反查答不出（对象已删 / 端点 403） | **保留**，标「无法反查」；不许当成别的租户 |
| 没有对象键的行 | 不受影响（这一筛选对它们没有话说） |
| 反查端点整条失败 | 不做任何丢弃，页面明说这次没有收窄 |

---

## 4. 测试读数

```
node --test scripts/*.test.mjs
ℹ tests 327   pass 327   fail 0
```

本次新增 4 条（其余 323 条为既有）：

- `scripts/audit-chain-page.test.mjs:622` — 页面在行旁画出 `tenantHint`，且有行才画；那句话**不进** `sixOf`、
  不进展开块（六问仍是六格）。
- `scripts/audit-chain-page.test.mjs:636` — 两套词条都在，英文说 `attributed to a tenant` / `MCP connection` /
  `never narrowed`，中文说 `不按租户归属` / `MCP 连接` / `不会收窄`；两套都不含表名、不含 Markdown 记号。
- `scripts/audit-chain-page.test.mjs:653` — 核对 CSV 的说明行由两句拼接并经 `checkCsvText` 写出。
- `scripts/audit-query.test.mjs:583` — 说明行是元数据：在表头之前、以 `# ` 起头、不增加数据行数；不给说明时
  仍是「表头 + 数据行」。

静态门禁：

```
node scripts/check-path-refs.mjs    → exit 0（974 条引用，298 个文件）
node scripts/check-console-pages.mjs → exit 0（22 ok / 9 switched off / 0 failed）
```

`i18n-key-coverage`（4/4）与 `i18n-no-markdown`（2/2）随全量跑过。

**未跑**：`check-rendered-copy` / `check-rendered-components`（要一份铺好的 UI 检出）、浏览器点击、UI 构建、
真栈读数。补丁的 `git apply --check` 也要检出，本次只做了 hunk 行数算术校验（`+1,816` / `+1,808`，两侧各
新增 4 行，均与正文一致）。

---

## 5. 未做 / 未验证

- **乙b 未实现**（理由见 §2）；§3 的端点与甲都未做。
- **甲**（`tenant_id` 列、`tenantId` 参数、wire v8）不在本任务内。
- 读面把 `tenantId` 声明出来并**显式拒绝**（同 `agentId` 的 400）是运行时改动，属 0.1.21；在那之前，页面
  那句话承担「传了也不会被施加」。
- 六列业务 CSV 仍不加说明行（U1 口径），这句话由页面与核对 CSV 承担 —— 这是一处有意的取舍，不是遗漏。

---

## 6. 边界

只改本 worktree 内的 6 个文件（页面、补丁、两份设计文档、两份测试），加本报告；未 push、未合 main、未碰
`KeelBase4J`、未改迁移与契约、未动 `notes/会话认领约定.md`。
