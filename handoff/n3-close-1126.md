# N3（F4）· 对象查询的可断言行数上限 —— 收口复核

- 日期：2026-11-26
- 范围：本地 `main`（HEAD `e508decd5d`），只读复核，不改源码 / 计划件，不提交、不推送。
- 被核提交：`0303e10dc4`（由分支 `claude/funny-pare-40c2a1` 合入）
- 结论：**四项全部通过（绿）**，N3 可以标完成。

---

## 1. 提交已在 main 祖先链上

```
$ git merge-base --is-ancestor 0303e10dc4 main; echo $?
0
```

```
$ git log -1 --format=%H%n%s 0303e10dc4
0303e10dc40331b7b0bb5d8a833c4c9f9611fc98
feat(audit): make the object query's row cap assertable — 对象查询的行数上限可断言
```

工作树状态：`git status --porcelain` 为空（复核开始时干净）。

## 2. 测试读数

```
$ node --test scripts/scan-cap.test.mjs
✔ the default cap is 1000 rows — five 200-row pages, the face’s stated depth
✔ the cap is configurable only inside a fixed band — both ends are clamped, not trusted
✔ negative: a read face that ignores `limit` still cannot push the scan past the cap
✔ negative: no request reaches the offset the runtime clamps — the duplicate-page hazard
✔ the page takes the cap from the module — no hard-coded five-page loop
ℹ tests 5
ℹ suites 0
ℹ pass 5
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 122.8726
```

读数：tests 5 / pass 5 / fail 0 / cancelled 0 / skipped 0 / todo 0。

## 3. 文档 §6 内容核对

两份文档都位于 `keelbase-docs/`，§6 标题分别为 `## 6. The bound, stated`（第 129 行）与 `## 6. 上界，说出来`（第 104 行）。

英文原文（`KEELBASE-AUDIT-SEARCH.md:140-143`）：

> The audit row cap is a build-time setting (`KEELBASE_AUDIT_SCAN_ROWS`); a value outside 200–1200 is
> clamped into the band. The cap lives in `keelbase-ui/host-overlay/src/keelbase/scanCap.mjs`, and
> `scripts/scan-cap.test.mjs` proves a query cannot exceed it — including a read face that ignores
> `limit`.

中文原文（`KEELBASE-AUDIT-SEARCH.zh-CN.md:115-117`）：

> 审计行的上限是构建期设置（`KEELBASE_AUDIT_SCAN_ROWS`）；200–1200 之外的值会被夹进区间。上限实现在
> `keelbase-ui/host-overlay/src/keelbase/scanCap.mjs`，`scripts/scan-cap.test.mjs` 证明查询不可能超过它
> —— 包括一个无视 `limit` 的读面。

另，§6 表格中英文均写明「默认 1000（`200 × 5`），可配 200–1200」：

- 英文（`:133`）：`| audit rows | 1000 by default (`200 × 5`), configurable 200–1200 | …`
- 中文（`:108`）：`| 审计行 | 默认 1000（`200 × 5`），可配 200–1200 | …`

三项要点（默认 1000 / 可配 200–1200 / 上限模块位置）中英两处**均齐**。

代码侧对照（`scanCap.mjs`）：`DEFAULT_SCAN_ROWS = 1000`、`MIN_SCAN_ROWS = 200`、`MAX_SCAN_ROWS = 1200`，与文档一致。

## 4. 未新增契约字段

```
$ git show --stat 0303e10dc4
 keelbase-docs/KEELBASE-AUDIT-SEARCH.md             |   7 +-
 keelbase-docs/KEELBASE-AUDIT-SEARCH.zh-CN.md       |   6 +-
 keelbase-ui/host-overlay/src/keelbase/scanCap.mjs  | 120 +++++++++++++++++
 .../views/keelbase/governance/AuditChainPage.vue   |  54 +++++---
 scripts/build-host-ui.sh                           |   9 ++
 scripts/scan-cap.test.mjs                          | 147 +++++++++++++++++++++
 6 files changed, 319 insertions(+), 24 deletions(-)
```

判定：

- 改动只涉及两份文档、新模块 `scanCap.mjs`、页面 `AuditChainPage.vue`、构建脚本 `build-host-ui.sh`、测试 `scan-cap.test.mjs`；**没有任何契约文件**（schema / OpenAPI / 冻结行 schema）被改动。
- 页面调用 `auditApi.logs({ since, until, objectType, objectId, limit, offset })` 的**参数集合未变** —— 本提交只改了 `limit` / `offset` 的取值方式（由 `scanPageRequests` 计划给出）与用 `absorbChunk` 裁剪答复，未新增查询参数。
- 提交正文亦声明 "no contract field was added" / 「未新增契约字段」。

## 5. 附注（非红项，供父会话知悉）

- 任务背景提到的原报告 `handoff/n3-cap-1122.md` 在本地**不存在**（`handoff/` 下只有 e1、f10、n5 两份、paramrefuse、secondentry、tenantvis）。不影响本次结论；若计划行需要原报告链接，请另核。
- `scanCap.mjs` 头注释引用的 `handoff/rescan-cap-1121.md` 同样不在 `handoff/` 中（注释里的历史读数来源）。属既有引用，本次不修。

---

## 可直接粘进计划行的证据串

> N3 done: `0303e10dc4` is an ancestor of `main`; `node --test scripts/scan-cap.test.mjs` → tests 5 / pass 5 / fail 0; §6 of `KEELBASE-AUDIT-SEARCH.md` states the default 1000 and band 200–1200 and names `keelbase-ui/host-overlay/src/keelbase/scanCap.mjs`; `git show --stat 0303e10dc4` touches no contract file and adds no query parameter.
>
> N3 完成：`0303e10dc4` 已在 `main` 祖先链上；`node --test scripts/scan-cap.test.mjs` 读数 tests 5 / pass 5 / fail 0；`KEELBASE-AUDIT-SEARCH.md` 的 §6 写明默认 1000、区间 200–1200 并点出 `keelbase-ui/host-overlay/src/keelbase/scanCap.mjs`；`git show --stat 0303e10dc4` 未动契约文件、未新增查询参数。
