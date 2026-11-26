# n4-close-1126 —— N4（F10）· 生成物读面与对象检索同语义（宿主侧那一半）收口

**复核对象**：2026-11-21 周计划 **N4（F10）** 宿主侧那一半
**复核基线**：`D:\Rain6fish\KeelBase-Vue-Pro` main `e508decd5d`，工作树干净（仅兄弟会话未跟踪件 `handoff/n3-close-1126.md`）
**方式**：只读复核；未改源码、未碰计划件、未 commit、未 push、未进入 `D:/Rain6fish/KeelBase-Private/**`

## 1. 三处落点在当前 main 仍在

### 1.1 纯函数与页面引用

| 落点 | 位置 | 现状 |
|---|---|---|
| `readFaceIgnoredFilters` 定义 | `keelbase-ui/host-overlay/src/keelbase/auditQuery.mjs:224` | 在位；区间外返回行、或本页能解析成另一对象的行 ⇒ `true`；解析不出对象的行不算证据；没发区间/对象时不取证 |
| 页面渲染行 | `keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue:190-191` | `v-if="queryRan && !queryFailed && readFaceIgnored"` ⇒ `t('keelbase.audit.readFaceUnfiltered')` |
| 页面取证调用 | 同上 `:1399-1406` | 只用第一次答复 `firstAnswer`，传入对象/区间与证据窗；失败、空链、未检索时保持 `false`（`:1412`） |
| 导出注记 | 同上 `:1450-1453`、`:1500`、`:1577` | `readFaceNote()` 只在有证据时取同一词条，两份导出（六问 CSV 与核对 CSV）都写在表头前的那行注记里 |

### 1.2 补丁里的中英两套词条

| 语言 | 位置 | 现状 |
|---|---|---|
| `en.ts` | `keelbase-ui/host-patches/0002-governance-ui.patch:95-96`（hunk 新文件第 **91–92** 行） | `readFaceUnfiltered` 在位 |
| `zh-CN.ts` | 同上 `:925-926`（hunk 新文件第 **91–92** 行） | `readFaceUnfiltered` 在位 |

附注：原报告 `handoff/f10-readface-1121.md:30` 记的 hunk 行数「801→803、793→795」是当时的读数；此后 `0002-governance-ui.patch` 又并入了租户词条等改动，当前两个 hunk 头是 `@@ -1,4 +1,825 @@`（en.ts）与 `@@ -1,4 +1,817 @@`（zh-CN.ts）。词条本身仍在，行数变化不影响本项。

### 1.3 两份设计文档 §9

| 文档 | 位置 | 现状 |
|---|---|---|
| `keelbase-docs/KEELBASE-AUDIT-SEARCH.md` | `:178-198` | §9「The second read face — the generator's application」在位 |
| `keelbase-docs/KEELBASE-AUDIT-SEARCH.zh-CN.md` | `:144-158` | §9「第二条读面 —— 生成器产出的应用」在位 |

两份 §9 都明写：生成物 `/audit/logs` 不声明 `until/objectType/objectId`（Spring 静默丢弃），控制台显示不受影响（自己再挑一遍），而**同语义修复属于生成器**、在另一仓、不改行 schema —— 即本仓这一半的限制已入文档。

## 2. 测试读数

命令（在 `D:\Rain6fish\KeelBase-Vue-Pro` 下执行）：

```
node --test scripts/audit-query.test.mjs scripts/audit-chain-page.test.mjs
```

读数：**tests 62 / pass 62 / fail 0 / skipped 0 / todo 0**，exit 0，`duration_ms 347.5156`。

分项：

| 文件 | tests | pass | fail |
|---|---|---|---|
| `scripts/audit-query.test.mjs` | 35 | 35 | 0 |
| `scripts/audit-chain-page.test.mjs` | 27 | 27 | 0 |

其中与本项直接相关的用例：

- `scripts/audit-query.test.mjs:299-300` —— 更宽的答复判 `true`、收窄的答复判 `false`；
- `:311-332` —— 匹配行不算证据、另一对象算证据、解析不出的行不算证据、没有发区间时 `createdAt: null` 不算证据；
- `scripts/audit-chain-page.test.mjs:600`、`:610` —— 页面确实 import 了 `readFaceIgnoredFilters`，且用 `firstAnswer` 调用；
- `:626` —— 渲染行 `v-if` 与词条键在位；
- `:630-631` —— 补丁里英文与中文 `readFaceUnfiltered` 词条都在位；
- `:467` —— 导出注记只在有证据时取该词条。

全绿，无红项。

## 3. 明写「读面没有施加筛选」的中英原文与出处

### 英文（`en.ts` 词条值）

> The runtime’s audit read face did not apply this search’s object or end — an application produced by the generator ignores parameters it does not know. The rows above are this page’s own narrowing, and both exports carry the same set; query /audit/logs directly for the read face’s own answer.

出处：`keelbase-ui/host-patches/0002-governance-ui.patch:96`（`en.ts` hunk 新文件第 92 行）。

### 中文（`zh-CN.ts` 词条值）

> 运行时的审计读面没有施加这次检索的对象或终点筛选（生成器产出的应用会忽略它不认识的参数）。上面的行由本页自己挑出，两份导出沿用同一份命中；要以读面自己的答复为准，请直接查询 /audit/logs。

出处：`keelbase-ui/host-patches/0002-governance-ui.patch:926`（`zh-CN.ts` hunk 新文件第 92 行）。

### 渲染与导出的两个落点

- 页面：`AuditChainPage.vue:190-191`，条件 `queryRan && !queryFailed && readFaceIgnored`，词条 `keelbase.audit.readFaceUnfiltered`。
- 导出：`AuditChainPage.vue:1450-1453` 的 `readFaceNote()` 取同一词条，由 `:1500`（六问 CSV）与 `:1577`（核对 CSV）分别写入表头前注记。

两句都同时满足验收判据的另一支：明写「读面没有施加对象/终点筛选」，并指向运行时读面自己的答复（`/audit/logs`）。

## 4. 可粘进计划行的证据串

英文一句在前、中文一句在后：

> Host half verified at `main` `e508decd5d`: `readFaceIgnoredFilters` (`auditQuery.mjs:224`) feeds the page line (`AuditChainPage.vue:190-191`) and both exports' note, the en/zh `audit.readFaceUnfiltered` entries are present in `0002-governance-ui.patch:95-96,925-926`, both design docs carry §9 (`KEELBASE-AUDIT-SEARCH.md:178-198`, `.zh-CN.md:144-158`), and `node --test scripts/audit-query.test.mjs scripts/audit-chain-page.test.mjs` is 62/62 green; the generator-side parity fix is documented as out of this repo, and the direct-caller widening remains until that lands.
>
> 宿主侧这一半在 `main` `e508decd5d` 复核通过：`readFaceIgnoredFilters`（`auditQuery.mjs:224`）驱动页面那一行（`AuditChainPage.vue:190-191`）与两份导出的注记，中英 `audit.readFaceUnfiltered` 词条在 `0002-governance-ui.patch:95-96,925-926`，两份设计文档均有 §9（`KEELBASE-AUDIT-SEARCH.md:178-198`、`.zh-CN.md:144-158`），`node --test scripts/audit-query.test.mjs scripts/audit-chain-page.test.mjs` 为 62/62 全绿；生成器侧的同语义修复已在文档中写明不属于本仓，在它落地前，直接调用生成物读面的调用方仍会拿到更宽的列表。

## 5. 边界与未做

- 未跑 UI 构建、未在浏览器里点过页面（本机无上游 UI 检出，与原报告同条件）；本节结论是源码级 + 纯函数测试级读数。
- 未验证 `KeelBase4J` 仓的生成器现状；本项只覆盖宿主侧那一半，生成器侧仍记为限制。
- 未改动计划件与任何源码；本文件是本次唯一新增件。
