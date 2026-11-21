# f10-readface-1121 —— 生成物读面与对象检索同语义（宿主侧那一半）

**分支**：`claude/sad-elbakyan-358778`（worktree `sad-elbakyan-358778`，基于 `main` `57091b39da`）
**任务**：2026-11-21 CTO 周会下周计划 **N4**（F10）
**提交**：见本分支 `git log`（未推送、未合 main）

## 1. F10 的缺陷在哪

复核报告（`handoff/objectsearch-review-1120.md` §F10）与例会纪要（§5.1、§十二）指向的是**运行时仓**
`KeelBase4J` 的生成器：

- `keelbase4j-generator/.../JavaGenerator.java:4474` 生成的 `GovernanceController.logs(...)` 只声明
  `userId`、`since`、`isError`、`limit`、`offset`；`agentId/orgId/denied` 是**显式 400**，
  而 `until/objectType/objectId` **一个都不声明**。
- Spring 对 handler 没声明的查询参数静默丢弃，不报错 ⇒ 直接调用生成物读面时，同一个查询回一份**更宽**
  的列表（「旧运行时」行为）。

本 worktree 在 `KeelBase-Vue-Pro`，**生成器源码不在本仓**（`grep JavaGenerator` 零命中），也从本仓
commit 不进去。故本会话走任务书指定的第二条：页面（及其覆盖的两份导出）**明写读面没有施加筛选**，并指向
运行时读面自己的答复。

## 2. 改了什么（本仓）

| 文件 | 行 | 内容 |
|---|---|---|
| `keelbase-ui/host-overlay/src/keelbase/auditQuery.mjs` | 200–238 | 新增纯函数 `readFaceIgnoredFilters(rows, conditions)`：答复**比发出去的筛选更宽**的正面证据 —— 返回行落在区间外，或本页能解析出对象却不是所查对象。解析不出对象的行**不算证据**（台账窗口有界、读面没有），恰好都匹配也**不算**（两种读面命中一样，不需要告诫）。 |
| `keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue` | 151–163 | 结果区新增一行：`v-if="queryRan && !queryFailed && readFaceIgnored"` ⇒ `keelbase.audit.readFaceUnfiltered`（「读面没有施加对象/终点；上面是本页自己挑的，两份导出同一份命中；以读面答复为准请直接查 `/audit/logs`」）。 |
| 同上 | 599–609, 1159, 1213, 1260–1268, 1272 | `readFaceIgnored` 状态；取证只用**第一次**答复（页面自己按区间重扫的那次不算）；只有**对象真的发出去过**（类型+主键两半都在）才拿对象取证，且按**控制台自己的类型**判等（不按发给读面的种类词 `MCP connection`）。 |
| 同上 | 68–83, 576–585, 1081–1096 | 删除三处**已经过时**的说法（「运行时那条审计读面没有对象与终点这两个筛选」「终点只在本地施加」），改为现状：两样都发，施加与不施加的运行时应答同一份命中。 |
| `keelbase-ui/host-patches/0002-governance-ui.patch` | 87–88, 895–896 | 中英两套词条新增 `audit.readFaceUnfiltered`；两个 hunk 的新文件行数 801→803、793→795 同步修正。 |
| `keelbase-docs/KEELBASE-AUDIT-SEARCH.md` | 161 起 | 新增 §9：第二条读面（生成器产出）的事实、控制台为何不受影响、同语义修复属于生成器且**不改 schema**。 |
| `keelbase-docs/KEELBASE-AUDIT-SEARCH.zh-CN.md` | 131 起 | 同上（中文）。 |
| `scripts/audit-query.test.mjs` | 265–345 | ①「读面施加筛选」与「读面忽略筛选」两种答复，经 `selectRows` 得到**同一命中集**；②`readFaceIgnoredFilters` 的正反例（区间外 / 另一对象 / 解析不出不算 / 没发区间不算）。 |
| `scripts/audit-chain-page.test.mjs` | 442–490 | 页面 import、`firstAnswer` 取证、渲染键、对象只在真发出去时取证、中英词条在位。 |

**CSV 的边界**：六列 CSV 仍是恰好六列（U1 验收口径），文件里不能写散文；「导出明写」由页面上那一行承担，
它同时说明两份导出沿用同一份命中。核对 CSV 的列同样未动。

## 3. 读数

- `node --test scripts/*.test.mjs` ⇒ **298 tests / 298 pass / 0 fail**，exit 0（125.9 s）。
- `node --test scripts/audit-query.test.mjs scripts/audit-chain-page.test.mjs` ⇒ **51/51**。
- `node --test scripts/i18n-key-coverage.test.mjs` ⇒ **4/4**（两套词条键集一致，新键在两套里都在）。
- `node --test scripts/i18n-no-markdown.test.mjs` ⇒ 2/2。
- `node scripts/check-path-refs.mjs` ⇒ exit 0（941 引用 / 293 文件）。
- `node scripts/check-console-pages.mjs` ⇒ exit 0（22 ok / 9 switched off / 0 failed）。
- 补丁可应用性：按 hunk 上下文重建原文后 `git apply --check` ⇒ **PATCH_OK**（临时目录已删除）。

未做：UI 构建 / 浏览器点击（本机无上游 UI 检出）；真栈读数（本机无可用栈，Docker 不可用——与 11-20 复核同条件）。
故以上是源码级与纯函数级读数，**页面未在浏览器里点过**。

## 4. 仍需用户裁定 / 未完成的那一半

1. **同语义修复本身在 `KeelBase4J`**：给生成的 `/audit/logs` 声明 `until/objectType/objectId`，
   对象经生成应用自己的 `SideEffectStore` 解析（与运行时同一条路）。**不新增契约字段、不改行 schema**
   —— 端点参数不属于冻结的行形状（设计 §7），故不触发「需改生成物 schema ⇒ 停并提案」。
   本会话未动 4J 仓（不在本 worktree 的仓内，且有其它会话在用）。建议另开 4J worktree 做，并由例会决定是否
   与宿主这一半同批发布。
2. 生成物读面**直接调用方**今天仍会拿到更宽的列表；本仓的页面只能把这件事说出来，改不了那条面的行为。
3. 若例会要求「导出文件本身也写这句」，需要动 U1 钉死的六列口径 —— 本会话按「六列不动」处理。
