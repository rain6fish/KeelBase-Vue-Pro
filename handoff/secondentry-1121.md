# N6 · 第二入口与六问的口径统一（2026-11-21）

分支：`claude/beautiful-newton-ff1023`（worktree；已并入本地 main，未推送）
提交：本分支 `794c9ad02f`；并入 main 的合并提交见 `main` 的 HEAD。

共享笔记目录 `C:\Users\6fish\AppData\Local\Claude-3p\side-session-notes\local_4ee68104-...` 为空，
没有可读的同组笔记。

## 做了什么

验收判据是「同一操作在对象、时间、谁三处无需猜测即可对上」。这一轮只动口径与文案，没有改宿主业务表。

### 1. 时间：只剩一种形状，一律带偏移

决定：**都带偏移**，格式固定为 `YYYY-MM-DD HH:mm:ss UTC±HH:MM`（本机时区；本机在 +08:00 时即
`... UTC+08:00`）。不再出现「审计链一格带、其余页面不带」。

- `keelbase-ui/host-overlay/src/keelbase/time.ts:37` —— `timeText` 改为把可解析的值交给
  `zonedTime`（`sixQuestions.mjs`）渲染，与审计链「何时」那一格同一个格式化器；`dayjs` 的
  无时区格式已删除。
- `keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs:46`（既有 `zonedTime`，未改形状）。
- 覆盖页面：操作审计、行动中心、工具页、边界页、会话追溯，以及审计链的内层时间。
- 文档写明：`keelbase-docs/KEELBASE-AUDIT-SEARCH.zh-CN.md` §5、`KEELBASE-AUDIT-SEARCH.md` §5。

### 2. 谁：名字 + 账号；没有名字就明写，不拿裸 id 顶名

- `keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs:452` —— 新增 `whoLine`：
  - 有名字：`张三（账号 #1）`；
  - 只有账号：`姓名未记录（账号 #1）`，仍算答出「谁」；
  - 都没有：`未记录 —— 这一行没有记下调用方`，`answered=false`。
  - `composeSix` 新增 `callerId` 入参（`:475`、`:478`）。
- `keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue:672` —— 新增
  `resolvedName`；`callerName`（`:684`）不再回落成 id 或 `—`。
- 同上 `:985` —— 六问只收**名字**（`resolvedName`），账号单独作为 `callerId`；`:990` 批准人配不到
  名字时交空串，第五问答「这一行没有记下批准人是谁」，不再印裸 id。
- `OperationAuditPage.vue:164`、`BoundaryPage.vue:542` —— 同一条读法（操作审计、旁路留痕）。
- 词条：`0002-governance-ui.patch` 的 `audit.userUnrecorded` / `audit.userUnnamed`（`:35` / `:847` 起）
  与 `sixQ.whoUnrecorded` / `sixQ.whoUnnamed`（`:763` / `:1567` 起），中英两套键集合一致。

### 3. R5：换成语义一致的词

- `0002-governance-ui.patch:55` / `:867` —— `R5 is always blocked` → **`R5 is the block tier`**；
  `风险级（R5 恒阻断）` → **`风险级（R5 拦截档）`**。
  理由：本部署没有声明任何 R5 工具（`SecurityShowcase` 与 SHOWCASE 文档都写明），「恒阻断」在说假话；
  「拦截档」与第五问既有的「停在拦截档」同一套词。

### 4. 改了什么 / 参数：不再输出裸 JSON

- 新模块 `keelbase-ui/host-overlay/src/keelbase/argsText.mjs:60` —— `argsText`：
  每个参数一行「业务词：值」，`id/name/level/source/dealStatus/followUpStatus` 用既有业务词；
  布尔 ✓/✗、数组用「、」、嵌套对象用「，」，不带花括号/引号；空参数 → 「未记录」而不是破折号。
- `ActionCenterPage.vue:563` —— `formatArgs` 改调 `argsText`；模板两处 `<pre>` 无需改动。
  行动中心是审批人做决定的地方，原来整块是 `JSON.stringify(args, null, 2)`。

## 测试

- 新增 `scripts/second-entry-consistency.test.mjs`（9 条）：时刻带偏移且两种入参同形、
  `time.ts` 只走一个格式化器、参数按行读且无 JSON 语法、三条留痕的「谁」不回落裸 id/破折号、
  R5 词已换。
- `scripts/yd42-six-questions.test.mjs`：补 `who` 的三种读数（有名 / 只有账号 / 都没有），
  并把新词条加进逐字词表。
- `scripts/audit-chain-page.test.mjs`：批准人配不到名字时交空串的新断言。
- 全量：`node --test scripts/*.test.mjs` → **303 tests / 303 pass / 0 fail**（约 190s）。

## 读数与仍需裁定的点

1. **`KeelBase（账号 #n）` 的昵称来源是数据，不是这一层的代码。** 服务端联名
   （`YudaoCallerDirectory.namesOf`）优先取 `system_users.nickname`，演示库的默认昵称就是
   `KeelBase`。改它属于改宿主业务表/种子数据，按停止条件未动。可选：改演示数据；或在名录侧对
   默认昵称特判 —— 后者会引入「猜谁是默认账号」的新口径，不建议顺手做。
2. **无法解析的时刻仍原样显示**（保留 `timeText` 原行为）：此时输出的是值本身，可能不带偏移。
   这是「认不出就如实显示」的既有取舍，不是第二种常规形状。
3. **未知参数键按原名印出**（`argsText` 只映射六个已知业务键）。工具参数里若出现内部名，会显示在
   行动中心屏幕上；该块不参与 CSV 的 `leaksIn` 拒绝规则。是否要把未知键也隐藏/改写，需要口径裁定。
4. **边界页「谁」列宽 100px**，现在会显示「姓名未记录」；是否加宽由版面决定。
5. **补丁未在真实上游检出上跑 `git apply --check`**（本机无 `target/` 检出）。已做：
   逐个 hunk 的增删计数校验（合并后英文 +810、中文 +802，与 hunk 头一致）、词条树解析与键集合
   一致性测试全绿。真正构建时仍应跑一次 `bash scripts/build-host-ui.sh`。

## 合并

main 上已先有一份同类改动 `bc92619f64`（另一会话的 N6：时间委托、第二入口提示与核对 CSV 说明、
行动中心宿主日志配名）。本次合并按「两边都保留、口径取并集」处理：

- `time.ts` 取 main 的版本（`timeText` 直接 `return zonedTime(v)`，不再经过 dayjs）；
- 本分支的「谁」口径（名字 + 账号 / 姓名未记录 / 未记录）、`argsText`、R5 换词与 main 的
  第二入口提示、`exportNote`、列宽调整全部保留；
- 合并时把行动中心的 `callerName` / `whoText` 也对齐到同一条口径，避免同一页同时存在裸 id 与破折号；
- `0002-governance-ui.patch` 两个 hunk 头重算为 `+1,810`（英文）与 `+1,802`（中文），并逐行核对通过。

## 未触碰

- 宿主业务表、种子数据、`YudaoCallerDirectory` 的取名规则。
- 未推送、未创建 PR。
