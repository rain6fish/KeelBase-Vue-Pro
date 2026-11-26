# N9 · 确认 App-X 自托管 runner 是否在线 —— 收口复读（2026-11-26）

- 核对时间：`2026-11-26T04:05:12Z`（北京时间 2026-11-26 12:05）
- 范围：只读查询 GitHub API 与本地 App-X 工作树；**未**设置变量、**未**触发 workflow、**未**改代码、**未**提交、**未**推送。
- 被查仓库：`rain6fish/KeelBase-App-X`
- 结论：**与 11-23 读数一致，无变化。** runner 仍离线、闸仍配置关闭。用户在 2026-11-23 裁定的「维护档，12-05 复核」继续有效。

---

## 1. 远端地址

```
$ cd D:/Rain6fish/KeelBase-App-X && git remote -v
origin  https://github.com/rain6fish/KeelBase-App-X.git (fetch)
origin  https://github.com/rain6fish/KeelBase-App-X.git (push)
```

```
$ git rev-parse HEAD origin/main
cc8b1a3e497d68c72b5b4209569d886df1a0c331
cc8b1a3e497d68c72b5b4209569d886df1a0c331
```

仓库 `rain6fish/KeelBase-App-X`，`main` 与 `origin/main` 都停在 `cc8b1a3`（2026-11-23 08:40:52 +0800，
`ci(compile): fail closed when HBuilderX compiles nothing`）。**11-23 之后无新提交、无新推送。**

## 2. 读数

### 2.1 自托管 runner

```
$ gh api repos/rain6fish/KeelBase-App-X/actions/runners
{"total_count":1,"runners":[{"id":21,"name":"win11pro-appx","os":"Windows","status":"offline",
"busy":false,"version":"2.338.2","labels":["self-hosted","Windows","X64"]}]}
```

```
$ gh api repos/rain6fish/KeelBase-App-X/actions/runners/21 --jq '{id,name,status,busy,version,labels:[.labels[].name]}'
{"busy":false,"id":21,"labels":["self-hosted","Windows","X64"],"name":"win11pro-appx","status":"offline","version":"2.338.2"}
```

**`win11pro-appx`（id 21）已注册、`status: offline`、`busy: false`。**

### 2.2 仓库变量 `APPX_WINDOWS_RUNNER`

```
$ gh api repos/rain6fish/KeelBase-App-X/actions/variables/APPX_WINDOWS_RUNNER
{"message":"Not Found","documentation_url":"https://docs.github.com/rest/actions/variables#get-a-repository-variable","status":"404"}
gh: Not Found (HTTP 404)
```

```
$ gh api repos/rain6fish/KeelBase-App-X/actions/variables
{"variables":[],"total_count":0}
```

**该变量不存在（404）；仓库变量总数 0。**未设是「不存在」，不是设成了 `false`。

### 2.3 闸的写法（`.github/workflows/compile.yml`）

```yaml
  android-compile:
    runs-on: [self-hosted, Windows]
    if: vars.APPX_WINDOWS_RUNNER == 'true'
```

变量不存在 ⇒ 条件恒假 ⇒ `android-compile` 一律 `skipped`。这正是「闸已配置关闭」的实现方式。

### 2.4 最近的 `compile` workflow run

```
$ gh api "repos/rain6fish/KeelBase-App-X/actions/runs?per_page=20" \
    --jq '.workflow_runs[] | "\(.id)\t\(.event)\t\(.status)\t\(.conclusion)\t\(.created_at)\t\(.head_branch)"'
45164198567  push             completed  success    2026-11-23T11:19:45Z  main
44977295873  workflow_dispatch completed success    2026-11-22T02:42:05Z  main
44976889790  workflow_dispatch completed success    2026-11-22T02:36:36Z  main
44976731215  workflow_dispatch completed success    2026-11-22T02:34:31Z  main
44974452637  push             completed  success    2026-11-22T02:05:36Z  main
44974051315  push             completed  cancelled  2026-11-22T02:00:35Z  main
44079730477  push             completed  cancelled  2026-11-17T12:04:29Z  main
...
```

最新一次是 `45164198567`（2026-11-23T11:19:45Z，push，sha `cc8b1a3`）。**11-24 至 11-26 无任何 run。**

逐条作业结论：

```
$ gh api repos/rain6fish/KeelBase-App-X/actions/runs/<id>/jobs --jq '.jobs[] | "\(.name)\t\(.conclusion)"'

45164198567（2026-11-23T11:19:45Z，push，sha cc8b1a3）
  release-gate       success
  android-compile    skipped        ← 闸关闭

44976731215（2026-11-22T02:34:31Z，dispatch，sha 6fd6c4f）
  release-gate       success
  android-compile    success        ← 11-23 记的「假绿」

44976889790（2026-11-22T02:36:36Z，dispatch，sha 6fd6c4f）
  release-gate       success
  android-compile    success

44977295873（2026-11-22T02:42:05Z，dispatch，sha 6fd6c4f）
  release-gate       success
  android-compile    success

44974452637（2026-11-22T02:05:36Z，push，sha 6fd6c4f）
  release-gate       success
  android-compile    skipped
```

## 3. 与 11-23 读数逐项对照

| 项 | 11-23 读数 | 今日读数（2026-11-26T04:05Z） | 判定 |
| --- | --- | --- | --- |
| runner 身份 | `win11pro-appx`，id 21 | `win11pro-appx`，id 21 | 一致 |
| runner 状态 | 已注册、offline | 已注册、`offline`、`busy:false` | 一致 |
| runner 版本 / 标签 | — | `2.338.2`；`self-hosted, Windows, X64` | 记录补齐 |
| `APPX_WINDOWS_RUNNER` | 未设 | 不存在（404）；仓库变量总数 0 | 一致 |
| `android-compile` 闸 | 已配置关闭 | `if: vars.APPX_WINDOWS_RUNNER == 'true'` | 一致 |
| 三次编译成功 | `44976889790`、`44977295873`（`44976731215` 假绿） | 三次均 success，sha `6fd6c4f` | 一致 |
| 新增 run | 未记录 | `45164198567`（11-23T11:19:45Z）：`android-compile` **skipped**、`release-gate` success | **新证据**，支持「闸关闭」 |
| 代码 tip | — | `cc8b1a3`（11-23 08:40 +0800） | 无新提交 |

**变化项只有一条：11-23 当天晚间多出一次 push 触发的 run（`45164198567`），其 `android-compile` 为 skipped。**
这与「变量未设」互为印证，不改变任何结论。

### 附带观察（不影响结论，供 12-05 复核参考）

`44976731215` / `44976889790` / `44977295873` 三次 `workflow_dispatch` 的 `android-compile` 是 **success 而非 skipped**，
说明在那三个时刻（11-22 02:34–02:42Z）变量 `APPX_WINDOWS_RUNNER` 曾被临时设为 `'true'`、runner 也曾在线并实际领到作业；
之后变量被撤、runner 转入离线。即：该 runner 具备跑通链路的先例，只是当前不在线。

## 4. 措辞边界

当前状态是 **runner 离线 + 闸配置关闭**，因此计划里的验收「有一次 compile 未被取消」**不可观测** ——
没有作业被派发，自然无所谓取消与否。本报告与下列证据串**一律不声称「一次 compile 未被取消」**。

## 5. 可粘进计划行的证据串

英文：

> N9 · App-X self-hosted runner: win11pro-appx (id 21) is registered but still offline as of 2026-11-26T04:05Z; APPX_WINDOWS_RUNNER does not exist, so android-compile stays skipped (latest run 45164198567: android-compile skipped, release-gate success). Runner offline and the gate is configured closed — the "one compile not cancelled" acceptance is not observable in this state; maintenance status runs to the 12-05 review.

中文：

> N9 · App-X 自托管 runner：win11pro-appx（id 21）已注册但截至 2026-11-26T04:05Z 仍离线；`APPX_WINDOWS_RUNNER` 不存在，`android-compile` 保持 skipped（最新 run `45164198567`：`android-compile` skipped、`release-gate` success）。runner 离线且闸已配置关闭 —— 此状态下「有一次 compile 未被取消」这条验收不可观测；维护档延续至 12-05 复核。

---

*只读收口。未设置变量、未触发 workflow、未改代码、未提交、未推送。*
