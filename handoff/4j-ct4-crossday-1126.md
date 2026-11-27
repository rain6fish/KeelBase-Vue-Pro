# 4J 跨日抬 pin 的 CT-4 账目 —— 登记稿与主仓 README 更正建议

> **用途**：给 2026-11-28 周会 D5 那一个问题（「4J 跨日 bump 按偏差登记还是按违规处理」）备两条可直接粘贴的登记文本，外加一处主仓 README 的事实更正建议。
> **边界**：2026-11-26 13:24 前全程只读核对。此后按用户指示应用并提交了 §3 的两处 README 更正（只动 `KeelBase/README.md` 两行，提交 `b385fa07`，**未 push**）；未改其他任何仓、未改决定索引 / 周计划 / 认领表。①/② 两条仍都没选。
> **成稿**：2026-11-26 13:24（+08）；**13:40 补记 §3 已应用**，**当日提交 `b385fa07`**。事实以仓库读数为准，拿不到的写「未核」。
> **单源**：`handoff/cto-1128-packet.md` D5；`handoff/v1230-postcheck-1126.md`；`KeelBase-Private/notes/CTO每周例会/2026-10-21-五项裁定.md` §CT-4。

---

## 0. 摘要

1. **跨日是事实，且不因锚点选择而改变。** 契约 v1.23.0 的 tag 于 `2026-11-24T19:03:24+08:00` 推上远端；4J 的 pin bump 提交 `e870a49` 记于 `2026-11-25T19:42:53+08:00`、推送于 `19:49:26`，落在下一个自然日，落后 tag 推送 **24 小时 39 分 29 秒**。
2. **出问题的是「同日」条，不是「顺序」条。** 11-24 宿主那一轮是**同日 ✓、顺序 ✗**（bump 19:01:58 早于 tag 推送 19:03:24）；4J 这一轮恰好相反，是**顺序 ✓、同日 ✗**。两轮互补，不重复。
3. **仓内读数器判 VIOLATION。** `scripts/check-push-order.mjs --online` 对这一 pair 返回 `status: VIOLATION`、`order: ok`、`sameDay: violation`。它的判决词表只有 `OK / VIOLATION / UNDECIDED`，**没有「偏差」这一档** —— 选 ① 意味着在工具口径之外另行命名，这是两条文本最主要的可辨差别。
4. **主仓 README 有**两**处 4J 行过期，D5 只点了其中一处。** `README.md:312`（`main, unreleased`）写 `v1.22.0`，应为 `v1.23.0`；`README.md:311`（已发布行）写 `v0.1.19`，而 4J 最新已发布版本是 `v0.1.20`（2026-11-21），应为 `v0.1.20`。两处都是纯事实更正，与 ①/② 的选择无关。**已于 2026-11-26 13:40 应用并提交 `b385fa07`**（未 push）。

---

## 1. 事实核对

### 1.1 时间线

| 时刻（+08:00） | 事件 | 证据 |
|---|---|---|
| 2026-11-24 19:01:24 | 契约 `main` 推送（`015f474e`） | CI run `45380276968`，`headBranch=main`，`createdAt=2026-11-24T11:01:24Z` |
| 2026-11-24 19:03:24 | 契约 tag `v1.23.0` 推送 | `Tag lineage` run `45380594496`，`headBranch=v1.23.0`，`createdAt=2026-11-24T11:03:24Z` |
| 2026-11-24 07:35:21 | 契约 tag **对象**创建时间 | `git for-each-ref refs/tags/v1.23.0`（见 §4 异常 1） |
| 2026-11-24 20:28:55 | 契约提交 `015f474e` 的 committer 时间 | `git log -1 015f474e`（见 §4 异常 1） |
| 2026-11-25 19:42:53 | 4J bump 提交 `e870a49`（author = committer） | `git log -1 e870a49` |
| 2026-11-25 19:49:26 | 4J bump 推送 | 读数器 `consumerPush.basis = exact`；CI run `45607981020` `createdAt=2026-11-25T11:49:27Z` |

**间隔**：tag 推送 → bump 提交 = **24h39m29s**；tag 推送 → bump 推送 = **24h46m02s**。两者都跨到 11-25。

### 1.2 换锚点不改变结论

CT-4 说「契约推 → 消费方抬 pin → 消费方推，同一天内完成」。「契约推」有三种可取的读法，三种都落在 11-24：

| 锚点 | 时刻 | 与 bump（11-25 19:42:53）是否同日 |
|---|---|---|
| 契约 tag 推送（读数器采用） | 2026-11-24 19:03:24 | 否 |
| 契约 `main` 推送 | 2026-11-24 19:01:24 | 否 |
| 契约提交记录时间 | 2026-11-24 20:28:55 | 否 |

即：**跨日不是锚点挑出来的**。唯一能把它算进「24 小时内」的锚点是「契约提交的记录时间」（20:28:55 → 11-25 19:42:53 = 23h13m58s），但该时间戳本身不可靠 —— 它在被推送（19:01:24）之后 87 分钟，见 §4 异常 1。

### 1.3 仓内读数器原样读数

```
$ cd D:/Rain6fish/KeelBase4J
$ node scripts/check-push-order.mjs --online \
    --consumer "D:/Rain6fish/KeelBase4J" \
    --contract "D:/Rain6fish/keelbase-contract" \
    --tag v1.23.0 --bump-commit e870a49 --json
```

```json
{
  "meta": {
    "tag": "v1.23.0",
    "consumer": "D:\\Rain6fish\\KeelBase4J",
    "contract": "D:\\Rain6fish\\keelbase-contract"
  },
  "timeline": {
    "contract": {
      "tag": "v1.23.0",
      "objecttype": "tag",
      "created": "2026-11-24T07:35:21+08:00",
      "pushed": "2026-11-24T19:03:24+08:00",
      "pushedBasis": "exact",
      "source": "GitHub Actions run for the tag push (Tag lineage, success)"
    },
    "bump": {
      "sha": "e870a49818be88546fcc1ea6eb11eeca54d8405f",
      "subject": "chore(contract): move the pin to v1.23.0 and re-vendor the snapshot — 契约 pin 抬到 v1.23.0 并重铺 vendored 快照",
      "time": "2026-11-25T19:42:53+08:00",
      "basis": "exact",
      "commitDate": "2026-11-25T19:42:53+08:00"
    },
    "consumerPush": {
      "time": "2026-11-25T19:49:26+08:00",
      "basis": "exact",
      "tip": "e870a49818be88546fcc1ea6eb11eeca54d8405f",
      "runAt": "2026-11-25T19:49:27+08:00"
    }
  },
  "verdict": {
    "status": "VIOLATION",
    "order": "ok",
    "sameDay": "violation",
    "findings": [
      "the contract tag push (2026-11-24T19:03:24+08:00) and the pin bump (2026-11-25T19:42:53+08:00) are not on the same day"
    ]
  }
}
```

`bump.commitDate` 与 `bump.time` 相同，说明这笔提交**未被 post-commit 钩子改写**（`19:42:53` 落在钩子的映射窗口 `05:00–19:00` 之外），两个值都是真实时刻。

脚本自述「changes no file, starts nothing」；本次运行未写任何文件。（首次运行因网络抖动取不到线上 run，判 `UNDECIDED`；重跑取到。两次都留档在 §4 异常 2。）

### 1.4 4J 侧 pin 的现值

| 位置 | 行 | 内容 |
|---|---|---|
| `.github/workflows/ci.yml` | 204 | `ref: v1.23.0`（`path: contract-repo`） |
| `.github/workflows/release.yml` | 160 | `ref: v1.23.0`（`path: contract-repo`） |

同文件另有 `ref: v1.2.0`（`ci.yml:221`、`release.yml:175`），那是**主仓场景包**的 pin，不是契约 pin，勿混。

`e870a49` 已在 `origin/main`（`git merge-base --is-ancestor e870a49 origin/main` 成立）。根 `pom.xml` 仍是 `0.1.21-SNAPSHOT` —— v1.23.0 的 pin 只在未发布的开发线上。

### 1.5 11-24 宿主一轮的既有记法原文

**出处更正**：任务书说记在 `KeelBase-Private/notes/CTO每周例会/`。核对后，CT-4 的违规记法**不在该目录** —— 该目录里 CT-4 只有 2026-10-21 的规则原文（无 11-24 记录）。实际记法在 `KeelBase-Private/handoff/`：

`KeelBase-Private/handoff/v1230-push-runbook-1124.md:173`（表格行，逐字）：

> | CT-4 结论 | **VIOLATION**：契约 tag 推送 **19:03:24** 晚于消费方 pin bump **19:01:58**（消费方推送 19:04:33）。按任务硬约束**未改历史、未补造提交、未改 checker**，如实记录并升级用户；判 OK 的唯一干净顺序是把重放挪到 tag 推送之后，需用户明确指示 |

同文件 `:174-175`（11-26 用户裁定，两行引用块，逐字）：

> **2026-11-26 user ruling (CT-4)**: **record it once as a violation** — this release's VIOLATION stays a fact, not rewritten and not replayed; the ordering constraint (contract push → consumer bump → consumer push, same day) is unchanged and still governs future releases.
> **2026-11-26 用户裁定（CT-4 口径）**：**记一次违规** —— 本版 VIOLATION 作为事实保留，不改写、不重放；顺序约束（契约推 → 消费方 bump → 消费方推，同日）**不变**，后续发布仍按该顺序执行，不因本次记录而放宽。

`KeelBase-Private/handoff/v1230-bookkeeping-1125.md:54` 记该条为「✅ 已裁（2026-11-26，用户『记一次违规』）」，并写明「§6 的复读三段时间均为 `exact`，结论不变」。

提交：`3b08706b docs(release): record the CT-4 ruling — record it once as a violation — 记录 CT-4 裁定：记一次违规`（2026-11-26 23:38:34 +0800）。

**该轮实际发布的 bump** 是 `8f9baa75`（2026-11-24 19:01:58），依 `bookkeeping-1125.md` §6 的复读口径（「the bump that actually shipped」）。同仓另有 `2ea7f597`（11-23）也动过子模块指针，见 §4 异常 3。

### 1.6 CT-4 规则原文

`KeelBase-Private/notes/CTO每周例会/2026-10-21-五项裁定.md:71`：

> 1. **pin 只在三个时点动**：①契约发版打 tag 后；②消费方发版前；③跨仓闸变红需追平。且必须按固定顺序 **契约推 → 消费方抬 pin → 消费方推**，**同一天内**完成。

同文件 `:130`（英文段）：

> Pins move only after a contract release, before a consumer release, or to clear a red cross-repo gate — always in the order contract-push → consumer-bump → consumer-push, within one day.

要点：CT-4 §1 是**三条独立要求** —— 触发条件、顺序、窗口。4J 这一轮触发条件成立（契约已发版；且 4J 的 vendored-snapshot 闸在 bump 前是红的，抬 pin 同时把它修绿），顺序成立，**只有窗口不成立**。

---

## 2. 两条可选登记文本

两条都写全了，**未择一**。粘贴前只需替换「登记位置」与日期。

### 2.1 方案 ① —— 按「偏差」登记（方向对、跨日）

**判定依据**

1. CT-4 §1 的三条要求里，成立两条：触发（契约已发版，且 4J 的 vendored-snapshot 闸在 bump 前为红，抬 pin 同时修绿）、顺序（契约先、消费方后）。
2. 不成立的只有「同日」。而「同日」要防的失败模式是**消费方在契约还没上远端时就去取**（周会读数 #12 的同 SHA 假红）。本条方向正确、只是偏晚，该失败模式在本轮**不可能发生**：bump 前没有任何消费，期间也没有 4J 发版。
3. 11-24 那一轮失败的是「顺序」，本条失败的是「同日」，两类不同；把两类记成同一种会抹掉这个差别。

**后果**

- 不回滚、不重放；pin 保持 `v1.23.0`（仅在未发布的 `0.1.21-SNAPSHOT` 上）。
- 顺序与同日两条约束**都不变**，后续发布照旧。
- 仓内读数器的 `VIOLATION` 读数**原样留档**，不改工具、不改阈值。偏差是记账层面的命名，不是把读数改绿。
- 需要承担的风险：一旦「同日」也可以事后命名为偏差，CT-4 §1 就只剩「顺序」一条有牙；11-24 的「记一次违规」与本条并列时，读者会看到两套口径。

**可直接粘贴的条目**

```markdown
**CT-4 · v1.23.0 → KeelBase4J pin bump · DEVIATION (same-day clause).**
The direction held — the contract was pushed first (tag push 2026-11-24T19:03:24+08:00) and the
consumer bump followed (`e870a49`, 2026-11-25T19:42:53+08:00, pushed 19:49:26) — so the failure mode
CT-4 §1 guards against, a consumer reading a contract that is not yet on the remote, could not occur:
nothing was consumed before the contract was available, and no 4J release happened in between. The
defect is timing only: the bump landed 24 h 39 min after the tag push, on the next calendar day,
against CT-4 §1's "同一天内 / within one day". Recorded as a deviation, not a violation, because the
clause that failed on 2026-11-24 was the ordering one, and the ordering one is satisfied here.
Consequence: no rollback and no replay; the pin stays at v1.23.0 on the unreleased 0.1.21-SNAPSHOT
line; the ordering constraint and the same-day window are both unchanged. The in-repo reader
(`scripts/check-push-order.mjs --online`) still prints VIOLATION for this pair — that reading stays on
record unchanged; this entry names it a deviation at the bookkeeping level and alters neither the
tool's verdict nor its thresholds.

**CT-4 · v1.23.0 → KeelBase4J 抬 pin · 偏差（「同日」条）。**
方向成立 —— 契约先推（tag 推送 2026-11-24T19:03:24+08:00），消费方 bump 在后（`e870a49`，
2026-11-25T19:42:53+08:00，推送 19:49:26）—— 故 CT-4 §1 要防的那种失败模式（消费方读到还没上
远端的契约）不可能发生：契约可取之前没有任何消费，期间也没有 4J 发版。缺陷只在时间：bump 落在
tag 推送后 24 小时 39 分、跨到下一个自然日，与 CT-4 §1 的「同一天内」不符。记为偏差而非违规，
理由是 2026-11-24 出问题的那条是「顺序」，而本条顺序成立。后果：不回滚、不重放；pin 保持
v1.23.0，只在未发布的 0.1.21-SNAPSHOT 线上；顺序约束与同日窗口两条均不变。仓内读数器
（`scripts/check-push-order.mjs --online`）对该 pair 仍打印 VIOLATION —— 该读数原样留档；本条
只在记账层面把它命名为偏差，不改工具判决，也不改其阈值。
```

### 2.2 方案 ② —— 按「违规」登记（与 11-24 同口径）

**判定依据**

1. CT-4 §1 的三条要求里，**窗口**是独立的一条，不是「顺序」的附注；它不成立，§1 就不成立。
2. 仓内读数器对这一 pair 返回 `status: VIOLATION` —— 与 11-24 那一轮返回的判决词**完全相同**。工具的判决词表没有「偏差」档；要判偏差，只能覆盖工具的判决。11-24 的裁定恰恰是「不改 checker、如实记录」，本条若改口径，等于换了一套机器。
3. 一致性：11-24 的违规被记为用户裁定的「记一次违规」，且裁定写明「一次违规不构成先例、规则不变」。同一部规则的另一条被同样违反时若记为偏差，读者会把 11-24 的裁定读成「只在顺序上认真」。

**后果**

- 同样不回滚、不重放；pin 保持 `v1.23.0`，发布线不受影响。
- 顺序与同日约束原样有效，本条记录不放宽它们。
- 代价：同为「违规」，11-24 那轮（顺序错、可能造成假红）与本轮（顺序对、只是跨日）在读者眼里会被拉平；需要在条目里写清「错的是哪一条」，否则会掩盖差别。
- 需要注意：这是 11-24 之后**第二次**同规则违规。裁定说「一次违规不构成先例」，但没有说第二次怎么算 —— 这一条留给会上。

**可直接粘贴的条目**

```markdown
**CT-4 · v1.23.0 → KeelBase4J pin bump · VIOLATION (same-day clause).**
CT-4 §1 fixes three things: the trigger, the order (contract push → consumer bump → consumer push),
and the window (same day). Two of the three held here — the trigger (a contract release, which also
cleared 4J's red vendored-snapshot gate) and the order — but the window did not: the tag was pushed
2026-11-24T19:03:24+08:00 and the bump committed 2026-11-25T19:42:53+08:00, 24 h 39 min later, on
the next calendar day. The window is not decoration: it is what keeps "the pin names a version the
consumer could already fetch" true without anyone re-checking, and a rule enforced only when
convenient stops being a rule. Recorded as a violation, on the same footing the 2026-11-24 round was
recorded under: the in-repo reader (`scripts/check-push-order.mjs --online`) returns VIOLATION for
this pair (order ok, sameDay violation), and its verdict vocabulary has no deviation tier.
Consequence: no rollback and no replay — the pin stays at v1.23.0 and the release line is unaffected;
the ordering constraint and the same-day window remain in force unchanged, and this record does not
soften them. Recorded once; a violation is not a precedent.

**CT-4 · v1.23.0 → KeelBase4J 抬 pin · 违规（「同日」条）。**
CT-4 §1 钉了三件事：触发条件、顺序（契约推 → 消费方 bump → 消费方推）、窗口（同一天）。本条
三条里成立两条 —— 触发（契约已发版，并顺带把 4J 那道红的 vendored-snapshot 闸修绿）与顺序 ——
窗口不成立：tag 推送 2026-11-24T19:03:24+08:00，bump 提交 2026-11-25T19:42:53+08:00，相隔
24 小时 39 分，跨到下一个自然日。窗口不是装饰：它正是让「pin 所指的版本，消费方当时就能取到」
在无人复查的情况下也成立的那一条；只在方便时才执行的规则，不再是规则。按违规登记，与
2026-11-24 那一轮同口径：仓内读数器（`scripts/check-push-order.mjs --online`）对该 pair 返回
VIOLATION（order ok、sameDay violation），而它的判决词表里没有「偏差」这一档。后果：不回滚、
不重放 —— pin 保持 v1.23.0，发布线不受影响；但顺序约束与同日窗口原样有效，本条记录不放宽它们。
记一次；一次违规不构成先例。
```

### 2.3 两条的差别只在三处

| | ① 偏差 | ② 违规 |
|---|---|---|
| 对 CT-4 §1 的读法 | 三条要求分轻重；未造成失败模式即算轻 | 三条平权；任一条不成立即 §1 不成立 |
| 与仓内读数器的关系 | 覆盖工具判决（工具无「偏差」档） | 采用工具判决 |
| 与 11-24 裁定的关系 | 两类分开，本轮是另一类 | 同一部规则，同一种记法 |

**两条在后果上完全一致**：都不回滚、不重放，pin 都不动，约束都不变。差别只在**标签**与**对工具读数的处置**。

---

## 3. 主仓 README 版本矩阵更正（已应用并提交 `b385fa07`）

**状态：2026-11-26 13:40 应用、当日提交 `b385fa07`（`docs(readme): the 4J rows name what 4J actually pins — 4J 行写明 4J 实际钉的版本`）。** 只含下面两行变化，工作树干净；**未 push**（该仓 post-commit 钩子提示「工作时间只提交不推送」，当前时段 push 会被拦截）。

文件：`D:/Rain6fish/KeelBase/README.md`。行号对应应用前的主仓 `main` HEAD `4fc09ad1`（2026-11-26 23:47:15 +0800；此前本稿引用的是 `18a81546`，该会话期间 HEAD 被另一会话推进，两行内容未变），领先 `github/main` 27 笔 —— 推送后行号可能平移，按内容定位。

**应用后的实际 diff**（`git diff -- README.md`，`@@ -308,8 +308,8 @@`，只有这两行）：

```diff
-| [`KeelBase4J`](https://github.com/rain6fish/KeelBase4J) (Java) | `v0.1.19` | **v1.22.0** — vendored snapshot, taken from the contract repository |
-| [`KeelBase4J`](https://github.com/rain6fish/KeelBase4J) (Java) | `main`, **unreleased** | **v1.22.0** — vendored snapshot, taken from the contract repository |
+| [`KeelBase4J`](https://github.com/rain6fish/KeelBase4J) (Java) | `v0.1.20` | **v1.22.0** — vendored snapshot, taken from the contract repository |
+| [`KeelBase4J`](https://github.com/rain6fish/KeelBase4J) (Java) | `main`, **unreleased** | **v1.23.0** — vendored snapshot, taken from the contract repository |
```

### 3.1 `:312` —— D5 点的那处（`main, unreleased` 行）

原文：

```markdown
| [`KeelBase4J`](https://github.com/rain6fish/KeelBase4J) (Java) | `main`, **unreleased** | **v1.22.0** — vendored snapshot, taken from the contract repository |
```

更正为：

```markdown
| [`KeelBase4J`](https://github.com/rain6fish/KeelBase4J) (Java) | `main`, **unreleased** | **v1.23.0** — vendored snapshot, taken from the contract repository |
```

唯一改动：`**v1.22.0**` → `**v1.23.0**`。依据：4J `main`（`e870a49`，已在 `origin/main`）的 `ci.yml:204` 与 `release.yml:160` 均为 `ref: v1.23.0`。

### 3.2 `:311` —— D5 未列、本次另核出的一处（已发布行）

原文：

```markdown
| [`KeelBase4J`](https://github.com/rain6fish/KeelBase4J) (Java) | `v0.1.19` | **v1.22.0** — vendored snapshot, taken from the contract repository |
```

更正为：

```markdown
| [`KeelBase4J`](https://github.com/rain6fish/KeelBase4J) (Java) | `v0.1.20` | **v1.22.0** — vendored snapshot, taken from the contract repository |
```

唯一改动：`` `v0.1.19` `` → `` `v0.1.20` ``；契约版本 `**v1.22.0**` **不变**。依据：

- 4J `v0.1.20` 是 GitHub Releases 的 `Latest`（`2026-11-21T02:28:34Z`），Central 上 0.1.20 四坐标 200 且 sha256 全 MATCH（引自 `handoff/v1230-postcheck-1126.md` §3，本稿未重跑）；
- `git show v0.1.20:.github/workflows/ci.yml` 的契约 pin 是 `ref: v1.22.0`，所以契约列不必动；
- 该行最近一次改动是 `a549fa9a7`（2026-11-20，4J 发 v0.1.19 时），v0.1.20 于 11-21 发布后 README 未跟。

### 3.3 可选：补一行 `v0.1.19` superseded

若要与 `:313`/`:314`（v0.1.17 / v0.1.16 superseded）的写法一致，可在 `:313` 之前插一行：

```markdown
| [`KeelBase4J`](https://github.com/rain6fish/KeelBase4J) (Java) | `v0.1.19`, superseded | **v1.22.0** — vendored snapshot, taken from the contract repository |
```

**但不必做**：该表并非逐版全列（`v0.1.18` 就从未列过），补 `v0.1.19` 只是选择之一。3.1 与 3.2 是必改项，本条是可选。

### 3.4 与 ①/② 的关系

**无关。** README 记录的是「4J `main` 现在 pin 的是哪个契约版本」这一事实，无论会上判偏差还是违规，事实都一样。两处更正已独立于 D5 的裁定先行应用。

### 3.5 提醒

`README.md:316-317` 自述 `contract-matrix` 闸**只校 TypeScript `main` 那一行**，4J 各行均为手工维护、不被闸读取 —— 所以这两处过期不会让任何门变红，只能靠人工发现。

---

## 4. 未核 / 异常

| # | 事项 | 状态 | 说明 |
|---|---|---|---|
| 1 | 契约侧三个时间戳互不自洽 | **异常，未深究** | tag 对象创建 `11-24 07:35:21` 早于所指提交 `015f474e` 的 committer 时间 `11-24 20:28:55`，而该提交在 `11-24 19:01:24` 已被推送（CI run 为证）—— 三者无法同时成立。疑为时钟偏差或提交日期被手工设定。**不影响跨日结论**：三个锚点全在 11-24。 |
| 2 | 读数器首次 `--online` 失败 | **已重跑** | 首次运行 `[online] could not read runs for rain6fish/keelbase-contract`，判 `UNDECIDED`、`pushed: null`；同期 `gh api` 报 `TLS handshake timeout`。重跑取到 tag 推送时刻，判 `VIOLATION`。§1.3 用的是重跑读数。 |
| 3 | 主仓有两笔 pin 提交，两处文件对「该轮的 bump」表述不一致 | **未核，留会** | `2ea7f597`（提交日期 `11-23 23:53:06`，被 post-commit 钩子映射；真实时刻 `13:33:06`，`chore(contract): follow the release-evidence vector`）与 `8f9baa75`（`11-24 19:01:58`，`chore(contract): pin the main line to v1.23.0`）都动过子模块指针、都在 `github/main` 上。`v1230-bookkeeping-1125.md` §6 以 `8f9baa75` 为「the bump that actually shipped」；而 `KeelBase4J/handoff/push-order-amend-1126.md` 以 `2ea7f597` 为被测对象，写「the contract tag was pushed after the pin bump, **and not on the same day**」。**若后者才是发布用的那笔，11-24 那一轮就同时违反了顺序与同日两条**，会改变 §2 里「两轮互补」的论证。本稿按 `bookkeeping` §6 的口径取 `8f9baa75`；两种读法需会上确认其一。 |
| 4 | 4J 本地 `main` 领先 `origin/main` 两笔 | **已核，不影响** | `458447c`（读数器 amend 修复）+ 合并 `90e670e`，均未推。不触碰 pin，`origin/main` 仍是 `e870a49`。 |
| 5 | Central 0.1.20 四坐标 | **引自报告，未重跑** | 引自 `handoff/v1230-postcheck-1126.md` §3（2026-11-26 实测 200 + sha256 MATCH）。 |
| 6 | 真栈门、`release-gate.sh` | **未跑** | 属「运行」，超出本稿只读边界。 |

---

## 5. 复跑命令

```bash
# 契约 tag 与两远端
cd D:/Rain6fish/keelbase-contract
git for-each-ref refs/tags/v1.23.0 --format='%(objecttype) %(objectname) %(*objectname) %(taggerdate:iso)'
git log -1 --format='%ai %ci %s' 015f474e
gh run list -R rain6fish/keelbase-contract --limit 5 --json headBranch,createdAt,workflowName,conclusion

# 4J bump
cd D:/Rain6fish/KeelBase4J
git log -1 --format='%ai %ci %s' e870a49
git merge-base --is-ancestor e870a49 origin/main && echo "on origin/main"
grep -n 'ref: v1\.23' .github/workflows/ci.yml .github/workflows/release.yml

# CT-4 读数（只读，不写文件）
node scripts/check-push-order.mjs --online \
  --consumer "D:/Rain6fish/KeelBase4J" \
  --contract "D:/Rain6fish/keelbase-contract" \
  --tag v1.23.0 --bump-commit e870a49 --json

# 主仓 README 4J 行
cd D:/Rain6fish/KeelBase
grep -n 'KeelBase4J.*Java' README.md
```

---

## 6. 本件边界

- **改了哪些**：本文件；以及 `KeelBase/README.md` 的两行（§3，按用户指示应用并提交 `b385fa07`）。未改其他代码仓、未改决定索引 / 周计划 / 认领表；未 push。
- **未裁决**：① 与 ② 都写全了，未选。§2.3 的对照只列差别，不给推荐。
- **未核项**写在 §4，未用推断填补：契约侧时间戳异常、两笔 bump 的口径分歧、Central 读数引自报告。
