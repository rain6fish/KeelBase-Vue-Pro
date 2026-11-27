# A-line acceptance-path fixes (2026-11-27) — one fixed, two diagnosed
# A 线验收路径修复（2026-11-27）—— 修掉一条，诊断两条

**Branch.** `claude/wizardly-kowalevski-a46073` (worktree `D:/Rain6fish/KeelBase-Vue-Pro/.claude/worktrees/wizardly-kowalevski-a46073`). Not pushed, not merged.
**Commits.** `22e9c20d88a71d3b2cde0b6b5a47bc67c8914906` (the fix); `58015a0fc7660ffda33b33316f42d26b1975fdfa` (comment order only).
**Scope.** The confirmed, small, testable defect from N5 §K.1 — the six-question change cell wrote `escalate_customer` as 「新建」. The other two N5 §K items are diagnosed here and deliberately not changed.

**分支。** `claude/wizardly-kowalevski-a46073`（工作树 `D:/Rain6fish/KeelBase-Vue-Pro/.claude/worktrees/wizardly-kowalevski-a46073`）。未推送、未合入。
**提交。** `22e9c20d88a71d3b2cde0b6b5a47bc67c8914906`（修复）；`58015a0fc7660ffda33b33316f42d26b1975fdfa`（只调注释顺序）。
**范围。** N5 §K.1 那条已确认、范围小、可测试的缺陷 —— 六问「改成什么」把 `escalate_customer` 写成「新建」。N5 §K 的另外两条在本件做诊断，刻意未改。

---

**English**

## 1. Fixed — the change cell names the action the tool declares

### 1.1 Symptom (reproduced before the fix)

N5's object B is a `escalate_customer` call. The list called it 「升级客户到会审」; the change cell said 「新建：没有改前，而这次写本身也没有记下字段值」. `changeLine` treated **no before + an id-only after** as proof of a create (`sixQuestions.mjs:125-127` before the change). That shape is shared by a create and by an action that writes a *new record of another kind* — `escalate_customer` writes a follow-up — so the ledger alone cannot tell them apart, and the reader caught the contradiction on the spot.

Direct reading before the fix (module called with the N5 object-B shape):

```
新建：没有改前，而这次写本身也没有记下字段值
```

### 1.2 Change

- `keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs`
  - `changeLine` now takes `tool` and, in the no-before branch, prefixes the sentence with the tool's own reader-facing name — the closed `keelbase.tool.*` message table the page already prints (each entry is a translation of the tool's declared purpose, not a guess from its spelling). Tool without a word ⇒ no invented action; the cell says only what it knows.
  - `composeSix` passes `row.tool || effect.toolName` into it.
  - Message key `changeCreated` replaced by `changeNoBefore`; the text no longer asserts "a new record".
- `keelbase-ui/host-patches/0002-governance-ui.patch` — `changeCreated` → `changeNoBefore` in **both** bundles, so the key sets stay equal.
- `scripts/n5-acceptance-reading.mjs` — the zh mirror updated; two `keelbase.tool.*` words added (`create_crm_customer`, `escalate_customer`) so the offline acceptance reading names the action too.
- `scripts/yd42-six-questions.test.mjs` — new regression test (`a write with no before names the action the tool declares, not "a new record"`), covering escalate / create / unknown tool.

### 1.3 Reading after the fix (same N5 object-B shape)

```
change: 升级客户到会审 · 没有改前，而这次写本身也没有记下字段值
```

A genuine create now reads `新建客户 · 没有改前…`; an unnamed tool reads only `没有改前…`. The `answered` flag is unchanged (`Boolean(hostNowName)`), and no other cell's wording, no criterion and no page rule was touched.

### 1.4 Test and gate readings (all from this worktree, 2026-11-27)

| Check | Command | Reading |
|---|---|---|
| Regression red first | `node --test scripts/yd42-six-questions.test.mjs` | 33 pass, **1 fail** (the new test) |
| Module + N5 reading | `node --test scripts/yd42-six-questions.test.mjs scripts/n5-acceptance-reading.test.mjs` | **46/46 pass** |
| Broader affected set (13 files) | six-questions, N5 reading, i18n ×2, audit chain, audit query, N6, second-entry ×2, operate-log readings, read-face probe, record names, business-log mapping | **156/156 pass** |
| i18n key coverage | included above | pass (both bundles carry the same keys) |
| Commit-message bilingual order | `node scripts/check-commit-order.mjs --range origin/main..HEAD` | 0 violations, 0 warnings, 6 commits |
| Comment bilingual order | `node scripts/check-bilingual-order.mjs --root <worktree> --since 2026-11-27` (private repo) | **0 findings** across the 4 blocks touched in this window |
| Path references | `node scripts/check-path-refs.mjs` | every cited path resolves (1035 refs / 311 files) |

The comment gate is the private repository's `scripts/check-bilingual-order.mjs`; this repository has no copy. Its whole-tree mode reports 1571 pre-existing findings, so it is used with `--since`, as its header prescribes. One draft comment was ZH-first and was reordered; that is the second commit.

## 2. Not fixed — the host operate log's detail shows no operator name

**Observed.** N5 §K.2: the machine reading said `userName=null` (2026-11-25 07:38), matching the reader; the list showed 「周敏」, the detail left the name blank.

**Root-cause clues (read from source, not from a live stack).**

1. **The detail endpoint is the one operate-log endpoint without translation.** `yudao-server/src/main/resources/application.yaml:87` sets `easy-trans.is-enable-global: false`, so `@Trans` fields are only filled on methods annotated `@TransMethodResult`. In `yudao-module-system/.../controller/admin/logger/OperateLogController.java`, `/page` (line 55) and `/export-excel` (line 64) carry it; **`/get` (lines 43-50) does not**. The VO's `userName` is produced solely by `@Trans(... ref = "userName")` (`OperateLogRespVO.java:30`), so the detail response keeps `userName = null` even when `userId` is present.
2. **The list's visible name did not come from `userName`.** Patch `0008-operate-log-readings.patch` replaced the list's operator column with `whoText`, which prefers `userName` and then falls back to the audit chain's narrow directory by `userId`. The list could therefore show 周敏 while the API field was still null.
3. **The host's detail dialog is outside that patch.** `0008` targets exactly one upstream file, `src/views/system/operatelog/index.vue`; the dialog is a separate component (`./OperateLogDetail.vue`, imported at index.vue and not patched). The reader's blank-name / zone-less observation is on that component. The component itself was not readable in this checkout (no upstream UI checkout), so its internals are inferred from the patch's target list plus the observation — marked **not verified**.

**Impact.** Human-facing only: the host native detail is one of the two entry points an acceptance reader uses, and "who" is criterion 1's column. It does **not** change any machine reading: the N5 script's R4 check compares `userId` (not `userName`), and the console's second-entry panel already falls back to the directory.

**Suggested fix scope (not done here).** Two small pieces, to be done together and verified on a built stack: (a) add `@TransMethodResult` to `getOperateLog`, mirroring `/page`; (b) extend `0008` (or add a sibling patch) to the detail component — name over account via the same directory, and `zonedTime` for the time. Either change is copy/annotation only — no host business table, no contract field. Until then, record it as a known gap and prefer the console's second-entry panel for the reader-facing comparison.

**Why not done here.** The task limits this session to the confirmed testable defect and to diagnosis for the rest. The Java half cannot be verified without a Maven build and a real stack; shipping an unverified annotation would trade one blank cell for an unproven one.

## 3. Not fixed — "related, not linked" and the one zone-less time

**3.1 The correlation is by design, not a missing key.** The runtime side effect and YuDao's `system_operate_log` row share the object id (runtime `resultId` = YuDao `bizId`) and the time, but no operation id: every `traceId` in that table is empty, and the AI-caused row carried no user before the operator seam. The page says this out loud — `effects.relatedLabel` = 「相关」 and `audit.exportNote` = 「相关、非硬链接…」 (`0002-governance-ui.patch:94` / `:924`, `:227` / `:1057`) — and the code comment at `governanceApi.ts:551-570` states why. R4's criterion (object / time / who) is a correlation test, and it passes on that basis. A hard link would require writing a shared correlation id into the host's own log (a host service / `@LogRecord` change, possibly a contract field) — explicitly outside A-2's stop condition. Treat "related" as the settled reading and keep it as a stated limit, not a defect to close in this line.

**3.2 One time still renders without a zone — in the detail, not in the list.** The list column (`0008`), the console's second-entry panel (`zonedTime(r.createTime)`) and the audit chain's cell all carry `UTC±HH:MM`. The host detail dialog is again the exception: it is not patched, and the reader's reading there (`2026-11-22 09:50:47`, no offset) matches the upstream `dateFormatter` shape. Same inference and same **not verified** boundary as §2.3. The machine comparison is unaffected — the N5 script formats both sides through `zonedTime` before comparing — so this is a manual-reading defect only.

**Suggested scope.** Fold it into the §2 detail-dialog patch: one formatter change and one who-cell change. If the detail dialog is not to remain an acceptance surface, the cheaper closure is to say so in the acceptance record and point the reader at the console panel, whose time and who cells already match the six questions.

## 4. Boundaries

- Read-only sources: N5 record §K, `handoff/n5-evidence-close-1126.md`, `D:/Rain6fish/handoff/n5-closeout-1126.md`, `handoff/nextstage-abc-1126.md` §2, and the source files cited above.
- Changed files: the four listed in §1.2 plus this hand-off. No roadmap, decision index, plan file, claim table, criterion or answer key was touched.
- No stack was started; no real-stack reading was taken; the Java diagnosis in §2 is source-read only. The `@TransMethodResult` behaviour is not verified live.
- Nothing was pushed or merged. The N5 record is not regraded; this file asserts no acceptance conclusion.
- Sibling notes in the shared folder (`abc-b-pointer.md`, `abc-c-pointer.md`) were read; neither overlaps this line.

---

**中文**

## 1. 已修 —— 「改成什么」说工具自己声明的动作

### 1.1 症状（修前已复现）

N5 的对象 B 是一次 `escalate_customer`。列表叫「升级客户到会审」，六问那一格却写「新建：没有改前，而这次写本身也没有记下字段值」。`changeLine` 把**无改前 + 改后只有 id** 当成新建的证明（修前 `sixQuestions.mjs:125-127`）。可这个形状既属于新建，也属于**写出一条另一种记录**的动作 —— `escalate_customer` 写的是跟进记录 —— 台账本身分不出两者，读者当场指出了这对矛盾。

修前直接读数（按 N5 对象 B 的形状调用该模块）：

```
新建：没有改前，而这次写本身也没有记下字段值
```

### 1.2 改了什么

- `keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs`
  - `changeLine` 新增 `tool` 入参；在无改前那一支，用工具**自己的**读者语言名字作前缀 —— 就是页面已经在印的那张封闭 `keelbase.tool.*` 消息表（每条都是该工具声明用途的译文，不是按拼写猜的）。工具没有业务词时**不编动作**，这一格只说它知道的事。
  - `composeSix` 把 `row.tool || effect.toolName` 交进去。
  - 词条 `changeCreated` 换成 `changeNoBefore`；文字不再断言「新建」。
- `keelbase-ui/host-patches/0002-governance-ui.patch` —— 中英**两套**都换成 `changeNoBefore`，键集合保持一致。
- `scripts/n5-acceptance-reading.mjs` —— 中文镜像同步；补两条 `keelbase.tool.*`（`create_crm_customer`、`escalate_customer`），离线验收读数也能说出动作。
- `scripts/yd42-six-questions.test.mjs` —— 新增回归用例（`a write with no before names the action the tool declares, not "a new record"`），覆盖升级 / 新建 / 未登记工具三种。

### 1.3 修后读数（同一 N5 对象 B 形状）

```
change: 升级客户到会审 · 没有改前，而这次写本身也没有记下字段值
```

真正的新建现在读作 `新建客户 · 没有改前…`；没有业务词的工具只读 `没有改前…`。`answered` 位不变（`Boolean(hostNowName)`），其它格的口径、判据与页面规则一概未动。

### 1.4 测试与门禁读数（均取自本工作树，2026-11-27）

| 检查 | 命令 | 读数 |
|---|---|---|
| 回归先红 | `node --test scripts/yd42-six-questions.test.mjs` | 33 过、**1 红**（新用例） |
| 模块 + N5 读数 | `node --test scripts/yd42-six-questions.test.mjs scripts/n5-acceptance-reading.test.mjs` | **46/46 通过** |
| 受影响的更大集合（13 个文件） | 六问、N5 读数、i18n ×2、审计链、审计检索、N6、第二入口 ×2、操作日志读数、读面探针、记录名、业务日志映射 | **156/156 通过** |
| i18n 键覆盖 | 含在上一条 | 通过（两套键集合一致） |
| 提交信息双语顺序 | `node scripts/check-commit-order.mjs --range origin/main..HEAD` | 0 违规、0 警告、判 6 笔 |
| 注释双语顺序 | `node scripts/check-bilingual-order.mjs --root <工作树> --since 2026-11-27`（私库） | 本窗改到的 4 个块 **0 发现** |
| 路径引用 | `node scripts/check-path-refs.mjs` | 引用的路径全部可解析（1035 条 / 311 个文件） |

注释门禁是私库的 `scripts/check-bilingual-order.mjs`，本仓没有副本。它的全树模式会报 1571 条存量问题，故按其文件头的规定用 `--since`。草稿里有一处注释块是中文在前，已重排 —— 即第二笔提交。

## 2. 未修 —— 宿主操作日志详情不显示操作人名字

**观察。** N5 §K.2：机器读数 `userName=null`（2026-11-25 07:38），与读者所见一致；列表显示「周敏」，详情缺名。

**根因线索（读源码所得，不是起栈实测）。**

1. **详情端点是操作日志里唯一没接翻译的那一个。** `yudao-server/src/main/resources/application.yaml:87` 设了 `easy-trans.is-enable-global: false`，故 `@Trans` 字段只会在带 `@TransMethodResult` 的方法里被填。`yudao-module-system/.../controller/admin/logger/OperateLogController.java` 里，`/page`（第 55 行）与 `/export-excel`（第 64 行）都有这个注解，**`/get`（第 43-50 行）没有**。VO 的 `userName` 完全由 `@Trans(... ref = "userName")` 产出（`OperateLogRespVO.java:30`），所以即使 `userId` 在，详情响应的 `userName` 仍是 null。
2. **列表上看到的那个名字不是 `userName` 来的。** 补丁 `0008-operate-log-readings.patch` 把列表的操作人列换成 `whoText`：先取 `userName`，取不到再按 `userId` 走审计链同一条窄名录。于是列表能显示周敏，而接口字段其实一直是 null。
3. **宿主的详情弹窗不在那份补丁里。** `0008` 只改一个上游文件 `src/views/system/operatelog/index.vue`；详情是另一个组件（`./OperateLogDetail.vue`，由 index.vue 引入，未打补丁）。读者看到的缺名与无时区都出在那个组件上。本检出没有上游 UI 的代码，故该组件内部只能由补丁的改动范围和观察反推 —— 标 **未核**。

**影响面。** 只影响人读：宿主原生详情是验收读者的两个入口之一，而「谁」是判据 1 的那一列。机器读数不受影响 —— N5 脚本的 R4 比的是 `userId` 而不是 `userName`，控制台第二入口面板本来也有名录回落。

**建议修复范围（本次未做）。** 两小件一起做、并在构建出的栈上验证：（a）给 `getOperateLog` 补 `@TransMethodResult`，与 `/page` 同形；（b）把 `0008`（或一份同级补丁）扩到详情组件 —— 名字在上账号在下、走同一份名录，时间走 `zonedTime`。两件都只是文案/注解，不碰宿主业务表、不碰契约字段。在那之前，按已知缺口记录，读者面对比优先用控制台第二入口面板。

**本次不做的理由。** 任务限定本会话只修已确认、可测试的那一条，其余只诊断。Java 那一半没有 Maven 构建与真栈就验不了；交一个没验证过的注解，只是把一处空白换成另一处没证过的空白。

## 3. 未修 —— 只「相关」不硬链接，以及一处不带偏移的时间

**3.1 这条相关是设计，不是缺键。** 运行时副作用与芋道 `system_operate_log` 共享对象 id（运行时 `resultId` = 芋道 `bizId`）与时间，但没有操作 id：那张表里每个 `traceId` 都是空的，AI 引起的那一行在操作者接缝之前根本不挂人。页面把这句话说出来 —— `effects.relatedLabel` =「相关」、`audit.exportNote` =「相关、非硬链接…」（`0002-governance-ui.patch:94` / `:924`、`:227` / `:1057`），`governanceApi.ts:551-570` 的注释也写明理由。R4 判据（对象 / 时间 / 谁）本就是相关检验，按此成立。要做硬链接就得往宿主自己的日志里写一个共享的关联 id（宿主 service / `@LogRecord` 改动，可能牵动契约字段）—— 正是 A-2 停止条件之外的事。把「相关」当作已定口径与明示限度，不在本线里当缺陷收口。

**3.2 还有一处时间不带偏移 —— 在详情，不在列表。** 列表列（`0008`）、控制台第二入口面板（`zonedTime(r.createTime)`）与审计链那一格都带 `UTC±HH:MM`。宿主详情弹窗仍是例外：它没打补丁，读者在那里读到的是 `2026-11-22 09:50:47`（无偏移），与上游 `dateFormatter` 的形状吻合。推断与 **未核** 边界同 §2.3。机器比对不受影响 —— N5 脚本比较前两侧都过 `zonedTime` —— 故这只是人读缺陷。

**建议范围。** 并进 §2 的详情弹窗补丁：一处格式化器、一处「谁」格。若决定详情弹窗不再作为验收面，更省的做法是在验收记录里写明，并把读者指向控制台面板 —— 那里的时间与「谁」已经与六问同形。

## 4. 边界

- 只读来源：N5 记录 §K、`handoff/n5-evidence-close-1126.md`、`D:/Rain6fish/handoff/n5-closeout-1126.md`、`handoff/nextstage-abc-1126.md` §2，以及上文点名的源码文件。
- 改动文件：§1.2 列的四件加本交接件。未改 roadmap、决定索引、计划件、认领表、判据或答案键。
- 未起栈；未取真栈读数；§2 的 Java 诊断只是读源码。`@TransMethodResult` 的实际行为未实测。
- 未推送、未合并。N5 记录未重新判分；本件不宣称任何验收结论。
- 已读共享目录里的兄弟笔记（`abc-b-pointer.md`、`abc-c-pointer.md`），与本线无重叠。
