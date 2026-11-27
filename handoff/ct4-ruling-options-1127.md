# CT-4 push-order basis: ruling options for the 2026-11-28 CTO meeting — CT-4 推送顺序基准：2026-11-28 CTO 周会裁定选项

> Scope: only the basis question behind the two CT-4 readings (11-23 development-time pin move; 11-24 eighty-six-second tag inversion). This sheet does not rule; it lists what each basis makes true, what it would change, and what would falsify it.
> Boundary: read-only. No plan, roadmap, decision sheet, decision index or claim table was edited; the checker was not modified; nothing was committed or pushed.
> Sources are listed in §9. Where this sheet and an earlier note disagree, the disagreement is stated rather than smoothed over.

## English

### 1. What is actually in dispute

CT-4 has three separate requirements: the trigger (a pin moves only at one of three moments — after a contract release tag, before a consumer release, or to clear a red cross-repo gate), the order (contract push → consumer bump → consumer push), and the window (the same +0800 calendar day). Source: the rule text quoted verbatim in `handoff/4j-ct4-crossday-1126.md` §1.6, and the working definition in `KeelBase4J/conformance/vectors/README.md:83-84` (English) and `:106-107` (Chinese).

The two findings are:

| Finding | Bump | Contract event | Consumer push | Shape |
|---|---|---|---|---|
| 11-23 development-time pin move | pin moved 13:23:04 (`c060ecf5` → `1222354`) and 13:33:06 (`2ea7f597` → `fe08a20`) | contract's first push that day 19:15:37 (run `45163554143`, head `83468a4`) | 19:18:43 / 19:19:12 | bump **5 h 42 min before** the contract push; same day held; outside the three allowed moments |
| 11-24 v1.23.0 tag bump | `8f9baa75` at 19:01:58 | main push of `015f474e` 19:01:24 (run `45380276968`); tag `v1.23.0` pushed 19:03:24 (run `45380594496`) | 19:04:33 | bump **34 s after** the commit reached main, **86 s before** the tag push; same day held |

The dispute is not whether the reader works. It is **which contract event counts as "the contract push" for a tag bump**. The 11-23 finding is red under every basis; only the 11-24 finding changes with the basis.

### 2. The three readings and where each one lives

#### 2.1 Literal tag push — implemented

`KeelBase4J/scripts/check-push-order.mjs` takes the contract moment only from the tag-push GitHub run (`main()`, lines 844-860: it finds a `push` run whose `headBranch` equals the tag and stamps `pushedBasis = 'exact'`). The order leg is `judge()` lines 415-423: `upper <= bump` is OK, otherwise VIOLATION. The same-day leg is lines 447-476: the bump day must equal the tag-push day and the consumer-push day. `--strict` exits 1 only when `verdict.status === 'VIOLATION'` (`main()`, line 887). The vocabulary is `OK / VIOLATION / UNDECIDED`; there is no deviation tier (header, lines 26-31 and 63-65).

#### 2.2 Commit reaching contract main — not implemented

`parseArgs()` (lines 731-768) accepts `--tag` and nothing else for the contract anchor. No code path reads a contract `main` push run or a contract branch tip. `--branch` (line 737, used at line 819) is the **consumer** branch (`origin/main`), not the contract. To judge "the commit reached main", the script would need a new input and a new order test; neither exists today.

#### 2.3 The three allowed moments — not implemented

The checker judges only order and same day. It has no input for the trigger clause, so it cannot return red or green on "was this one of the three allowed moments". Beware a naming collision: the header's "three moments" (lines 4-6, 91-92) are the three timeline points (contract push, bump, consumer push), not the three allowed pin-move occasions.

### 3. Why both findings read red

Both are red on the **order** leg, because `bump.time` is earlier than `contract.pushed` when the latter is the tag push:

- `8f9baa75`: bump 19:01:58, tag pushed 19:03:24 → order VIOLATION by 86 s; same day OK (both 11-24). Status VIOLATION on the order leg alone.
- `2ea7f597`: bump 13:33:06 (true time, reflog pre-image `b6c9941`), tag pushed 2026-11-24 19:03:24 → order VIOLATION and same-day VIOLATION (11-23 vs 11-24).

One caveat on the second reading: that specific command pairs a pin move to `fe08a20` (which carries no tag) with the later `v1.23.0` tag, so the two are not a real pin/tag pair. The substantive 11-23 finding does **not** depend on that pairing — it rests on the push-side record: the bump at 13:23/13:33 precedes the contract's first push at 19:15:37 by 5 h 42 min (`handoff/w3-advance-1124.md` §3.2). The tag-only anchor is nevertheless the single line that makes the 11-24 eighty-six seconds red.

### 4. The 11-24 eighty-six seconds: the two bases

#### 4.1 Basis 1 — the release tag push

Original text: the rule says "契约推 → 消费方抬 pin → 消费方推" (Chinese) / "contract push → consumer bump → consumer push" (English). The reader's own sentence in `conformance/vectors/README.md:92` / `:113` names "the contract tag push" / "契约 tag 推送". The rule text itself does not say "tag"; the README does.

Support: a tag is the unit of release; a consumer pin normally names a tag; the checker's vocabulary, thresholds and the 2026-11-26 ruling are all built on this basis; adopting it needs no rule change; it is the only basis that can test "the pin names a version the consumer could already fetch" without knowing how the consumer resolves the pin.

Oppose: in the 86-second case the same commit was on `main` 34 s before the bump, and the consumer pushed only at 19:04:33 — after the tag at 19:03:24. The failure mode CT-4 guards against (a consumer reading a contract that is not yet on the remote) could not occur. The rule's own words are "contract push", not "tag push"; "tag" is the README's gloss.

#### 4.2 Basis 2 — the commit reaching contract main

Original text: the rule's "契约推 / contract push". Push-side record: `015f474e` was pushed to contract `main` at 19:01:24 (run `45380276968`), and `v1.23.0^{commit}` is the same `015f474e` (verified locally in the contract clone).

Support: literal rule text; the commit was fetchable from `main` before the bump; it avoids recording a violation where nothing was exposed; the tag-only anchor is an implementation choice, not rule text.

Oppose: "on main" is not "released"; a consumer that resolves its pin by tag cannot fetch a tag that does not exist yet; the README explicitly says "contract tag push"; the 2026-11-26 ruling already recorded this very instance as a violation; changing the basis now is a rule change that reopens a closed record; and it does not unify the two findings — 11-23 stays red because no contract push of any kind preceded its bump.

#### 4.3 What the 2026-11-26 ruling already fixed

`3b08706b` (2026-11-26 23:38:34) recorded the v1.23.0 deviation **once as a violation**, left the ordering constraint unchanged, and named only the 11-24 host-line instance — not the 11-25 4J cross-day bump. Source: `handoff/4j-ct4-crossday-1126.md` §1.5, quoting `KeelBase-Private/handoff/v1230-push-runbook-1124.md:173-175` (quoted, not opened by this session).

Consequence: the **tag basis is already the basis of record for 11-24**. Any option that would make the 86 seconds compliant (B or C) must either supersede `3b08706b` or apply only prospectively. That is the central constraint on the choice, and it is the reason "re-read the 86 seconds as compliant" is not a free reinterpretation.

### 5. Options

The letters A/B/C below are **this sheet's basis options**. They are not D5's A/B/C, which are "deviation / violation / no separate record" for the 4J cross-day bump; do not conflate them when pasting into the decision sheet.

| Option | What it does | Sentence to change | 11-24 under it | Falsifiable consequence |
|---|---|---|---|---|
| **A. Keep the tag-push basis (status quo)** | Record 11-24 as a violation, consistent with `3b08706b`; record 11-23 as a violation and outside the three allowed moments. | None in the runbook or the checker; only the minutes entry. | VIOLATION (order leg, 86 s; same day OK) | The entry must name a concrete failure mode for the 86 s. If it cannot — nothing could have been consumed from an unavailable tag before the consumer push at 19:04:33 — A is over-strict. Observable: the entry exists and names that failure mode; falsified if it cannot. |
| **B. Re-anchor to the commit on main** | For a tag bump, "the contract push" means the commit reaching contract `main`. | `conformance/vectors/README.md:83-84` (EN) and `:106-107` (ZH): "contract push" → "contract main push"; plus a new contract-main-push input and order test in `check-push-order.mjs` (`main()`, `judge()`). The CT-4 rule text itself is a rule change. | Would read OK/compliant (bump 34 s after main push). `3b08706b` remains a recorded violation unless superseded, so record and rule diverge. | If a tag is cut from a commit not on `main`, or the tag never lands, B passes a bump against a version no consumer can fetch by tag. Observable: construct a case where `main` has the commit and the tag is absent or delayed past the consumer push; B passes it — that is the falsifier. Also falsified if `3b08706b` is meant to stand: then B cannot be applied to 11-24 without contradiction. |
| **C. Dual anchor plus "tag before consumer push"** | The order leg is satisfied if **either** the contract `main` push or the tag push precedes the bump; add the condition that the tag push precedes the consumer push. | Same README sentence; `check-push-order.mjs` `judge()` takes the earlier of the two contract events for the order leg and adds the tag ≤ consumer-push condition; needs a main-push input. | Would read OK/compliant (main 19:01:24 ≤ bump 19:01:58; tag 19:03:24 ≤ consumer push 19:04:33). `3b08706b` remains a recorded violation unless superseded or applied only prospectively. | C must fail every case where the consumer pushed before the tag landed. Observable: a bump after a main push, with the tag pushed after the consumer push → C must return VIOLATION; if C passes it, C is falsified. Likewise, if a consumer resolves by tag before the tag exists and C passes, C is falsified. |

What each option does to 11-23: nothing. The 11-23 bump precedes every contract event (first push 19:15:37), so it is a violation under A, B and C, and it is outside the three allowed moments independently.

### 6. Recommendation (suggestion, not a ruling)

**Suggest A as the basis of record.** It is the only option consistent with `3b08706b`, it needs no rule change, and its cost is one recorded violation — which the 2026-11-26 ruling already accepted. The rule as written and as implemented says the tag push, and the failure mode it guards (a consumer reading a contract that is not yet available) is tested most directly by the tag.

If the CTO wants replay-then-tag releases to stop producing violations, **C is the better change than B**: B drops the tag-before-consumer-push guard, so it would pass a bump even if the tag never landed before the consumer pushed, which is the exact exposure the window exists to prevent. C keeps that guard. Either change should apply **prospectively** and leave `3b08706b` intact — no retroactive rewrite.

Do not use B as a way to "unify" the two findings: it does not. 11-23 remains a violation under B.

### 7. If not ruled

The tag basis remains in force by default, because `3b08706b` used it, but without an explicit statement that it is the intended basis. The 11-23 finding stays unrecorded (the 11-26 ruling named only 11-24). The checker stays tag-only, so every audit re-reports both findings. The next replay-then-tag release will again return VIOLATION and the same argument will return with it.

### 8. Paste-ready lines for the decision sheet

**Option A**
`CT-4 basis: the contract push is the release tag push. Record 11-24 as VIOLATION (order leg, 86 s), consistent with 3b08706b; record 11-23 as VIOLATION and outside the three allowed moments. No rule or code change.`

**Option B**
`CT-4 basis: the contract push is the commit reaching contract main. Record 11-24 as compliant; 11-23 remains VIOLATION. This is a rule change and must address 3b08706b explicitly.`
`选 B 需同步改的那一句：conformance/vectors/README.md:83-84（英文）与 :106-107（中文）的「contract push / 契约推送」改为「contract main push / 契约 main 推送」，并给 check-push-order.mjs 增加 main 推送锚点。`

**Option C**
`CT-4 basis: order is satisfied by the earlier of the contract main push and the tag push, and the tag push must precede the consumer push. Record 11-24 as compliant; 11-23 remains VIOLATION. Apply prospectively; leave 3b08706b intact.`
`选 C 需同步改的那一句：同一句 README 改为双锚表述，并在 check-push-order.mjs 的 judge() 里取两者较早者、增加「tag 推送 ≤ 消费方推送」条件。`

### 9. Sources and status corrections

- `handoff/cto-1128-decisions-1126.md` D5 (EN lines 155-185; ZH lines 430-460) — options A/B/C and the note that B is what the existing wording implies.
- `handoff/4j-ct4-crossday-1126.md` §1.5-1.6 — the verbatim rule text and the verbatim 2026-11-26 ruling.
- `handoff/nextstage-abc-1126.md` §3 and B-1 — the two findings as stated for 11-29.
- `D:/Rain6fish/handoff/w3-advance-1124.md` §3.1-3.2 and §7.1 — push-side timeline and the amend defect.
- `D:/Rain6fish/KeelBase4J/handoff/push-order-amend-1126.md` — the amend fix and the corrected reading.
- `D:/Rain6fish/KeelBase4J/scripts/check-push-order.mjs` — lines cited above. Note: this script is **not** in `D:/Rain6fish/KeelBase/scripts/`; the host repository has no copy.
- `D:/Rain6fish/KeelBase4J/conformance/vectors/README.md` — lines 83-84, 91-98, 106-107, 113-118.
- CI runs: `45163554143` (contract first push 11-23), `45380276968` (contract main 11-24), `45380594496` (tag v1.23.0), `45607981020` (4J push).

**Two status corrections against the task background.**

1. The amend fix is **no longer unpushed**. As checked on 2026-11-27, `KeelBase4J` local `main` and `origin/main` are both `e8e9cad`, and both `90e670e` and `458447c` are ancestors of `origin/main`. The fix went out with the v0.1.21 release push. Nothing needs to be pushed, and nothing was pushed by this session.
2. `handoff/push-order-amend-1126.md` and `handoff/w3-advance-1124.md` are not in this repository. They are at `D:/Rain6fish/KeelBase4J/handoff/` and `D:/Rain6fish/handoff/` respectively, as cited above.

## 中文

### 1. 争的究竟是什么

CT-4 是三条独立要求：触发（pin 只在三个时点动 —— 契约发版打 tag 后、消费方发版前、跨仓闸变红需追平）、顺序（契约推 → 消费方 bump → 消费方推）、窗口（同一个 +0800 日历日）。出处：规则原文逐字引在 `handoff/4j-ct4-crossday-1126.md` §1.6；工作口径见 `KeelBase4J/conformance/vectors/README.md:83-84`（英文）与 `:106-107`（中文）。

两条发现是：

| 发现 | bump | 契约事件 | 消费方推送 | 形态 |
|---|---|---|---|---|
| 11-23 开发期挪 pin | 13:23:04（`c060ecf5` → `1222354`）与 13:33:06（`2ea7f597` → `fe08a20`） | 契约当天首次推送 19:15:37（run `45163554143`，head `83468a4`） | 19:18:43 / 19:19:12 | bump **早于契约推送 5 小时 42 分**；同日成立；不在三个允许时刻内 |
| 11-24 v1.23.0 tag bump | `8f9baa75` 于 19:01:58 | 同一提交推 main 19:01:24（run `45380276968`）；tag `v1.23.0` 推送 19:03:24（run `45380594496`） | 19:04:33 | bump **晚于提交到达 main 34 秒**，**早于 tag 推送 86 秒**；同日成立 |

争的不是读数器对不对，而是**对一次 tag bump 而言，哪个契约事件才算「契约推送」**。11-23 那条在任何基准下都红；只有 11-24 那条随基准改变。

### 2. 三种读法各自的落点

#### 2.1 字面 tag 推送 —— 已实现

`KeelBase4J/scripts/check-push-order.mjs` 的契约时刻只取自 tag 推送的 GitHub run（`main()` 844-860 行：找 `headBranch` 等于该 tag 的 `push` run，并标 `pushedBasis = 'exact'`）。顺序腿在 `judge()` 415-423 行：`upper <= bump` 为 OK，否则 VIOLATION。同日腿在 447-476 行：bump 日须等于 tag 推送日、也须等于消费方推送日。`--strict` 只在 `verdict.status === 'VIOLATION'` 时退出 1（`main()` 887 行）。判决词表是 `OK / VIOLATION / UNDECIDED`，**没有偏差档**（文件头 26-31 行、63-65 行）。

#### 2.2 提交到达契约 main —— 未实现

`parseArgs()`（731-768 行）对契约锚点只接受 `--tag`，没有任何代码路径去读契约 `main` 的推送 run 或分支头。`--branch`（737 行，819 行使用）是**消费方**分支（`origin/main`），不是契约侧。要判「提交到达 main」，脚本需要新的输入和新的顺序判断，目前都不存在。

#### 2.3 三个允许时刻 —— 未实现

读数器只判顺序与同日，对触发条款没有任何输入，因此它对「这次是否属于三个允许时刻」既判不了红，也判不了绿。注意术语撞车：文件头说的「three moments」（4-6 行、91-92 行）是时间轴上的三个点（契约推送、bump、消费方推送），不是三个允许挪 pin 的时点。

### 3. 为什么两条发现都判红

两条都红在**顺序腿**：当契约推送取 tag 推送时，`bump.time` 早于 `contract.pushed`。

- `8f9baa75`：bump 19:01:58，tag 推送 19:03:24 → 顺序 VIOLATION，早 86 秒；同日 OK（同为 11-24）。仅凭顺序腿即判 VIOLATION。
- `2ea7f597`：bump 13:33:06（真实时刻，reflog 前像 `b6c9941`），tag 推送 2026-11-24 19:03:24 → 顺序 VIOLATION，同日也 VIOLATION（11-23 对 11-24）。

第二条读数有一个要说明的地方：该命令把一次挪到 `fe08a20`（该提交没有 tag）的 pin 与后来的 `v1.23.0` tag 配在一起，两者并不是真实的 pin/tag 对。11-23 那条实质发现**不依赖**这个配对 —— 它依据的是推送侧记录：bump 13:23/13:33 早于契约首次推送 19:15:37 共 5 小时 42 分（`handoff/w3-advance-1124.md` §3.2）。但「契约锚点只取 tag」这一行，确实是让 11-24 那 86 秒变红的唯一原因。

### 4. 11-24 那 86 秒：两个基准

#### 4.1 基准一 —— 发布 tag 推送

原文：规则说「契约推 → 消费方抬 pin → 消费方推」（中文）/「contract push → consumer bump → consumer push」（英文）。读数器自己那句在 `conformance/vectors/README.md:92` / `:113`，写的是「the contract tag push」/「契约 tag 推送」。规则原文本身没说「tag」，说 tag 的是 README。

支持理由：tag 是发布单位；消费方的 pin 通常指一个 tag；读数器的词表、阈值与 2026-11-26 的裁定都建立在这个基准上；采用它不需要改规则；在不知道消费方如何解析 pin 的前提下，它是检验「pin 所指的版本消费方当时就能取到」最直接的办法。

反对理由：86 秒这一案里，同一提交在 bump 前 34 秒已在 `main`，而消费方直到 19:04:33 才推送 —— 晚于 19:03:24 的 tag。CT-4 要防的失败模式（消费方读到还没上远端的契约）不可能发生。规则原话是「契约推」，不是「tag 推送」；「tag」是 README 的转述。

#### 4.2 基准二 —— 提交到达契约 main

原文：规则里的「契约推 / contract push」。推送侧记录：`015f474e` 于 19:01:24 推到契约 `main`（run `45380276968`），且 `v1.23.0^{commit}` 就是同一个 `015f474e`（在本机契约克隆中已核）。

支持理由：照规则字面；提交在 bump 前已可从 `main` 取到；避免把一次没有造成暴露的动作记成违规；只取 tag 是实现的取舍，不是规则文字。

反对理由：「在 main 上」不等于「已发布」；按 tag 解析 pin 的消费方取不到尚不存在的 tag；README 明写「contract tag push」；2026-11-26 的裁定已经把这个实例记为违规；现在换基准是一次规则变更，会重开一条已结的记录；而且它并不能统一两条发现 —— 11-23 仍然红，因为它的 bump 之前没有任何契约推送。

#### 4.3 2026-11-26 的裁定已经定了什么

`3b08706b`（2026-11-26 23:38:34）把 v1.23.0 的偏离**记一次违规**，顺序约束按原文不动，且只点名 11-24 宿主线那一案 —— 没有点名 11-25 的 4J 跨日 bump。出处：`handoff/4j-ct4-crossday-1126.md` §1.5，逐字引自 `KeelBase-Private/handoff/v1230-push-runbook-1124.md:173-175`（引文，本会话未打开私库）。

后果：**tag 基准已经是 11-24 的记录基准**。任何让那 86 秒变合规的选项（B 或 C），要么取代 `3b08706b`，要么只在今后生效。这是本次选择的核心约束，也是「把那 86 秒重新读成合规」不是一次免费重释的原因。

### 5. 选项

下面的 A/B/C 是**本件的基准选项**，不是 D5 的 A/B/C（那三个是 4J 跨日 bump 的「偏差 / 违规 / 不单独登记」）；粘进决策单时勿混。

| 选项 | 做什么 | 要改哪一句 | 11-24 在此选项下 | 可证伪后果 |
|---|---|---|---|---|
| **A. 维持 tag 推送基准（现状）** | 11-24 记违规，与 `3b08706b` 一致；11-23 记违规，并写明不在三个允许时刻内。 | runbook 与读数器都不改；只落纪要条目。 | VIOLATION（顺序腿，86 秒；同日 OK） | 条目必须为这 86 秒指出一个具体失败模式。若指不出 —— 在消费方 19:04:33 推送之前，不可能有人从未上远端的 tag 取到东西 —— 即说明 A 过严。可观察：条目存在且写明该失败模式；写不出即证伪。 |
| **B. 改锚到提交到达 main** | 对一次 tag bump，「契约推送」指提交到达契约 `main`。 | `conformance/vectors/README.md:83-84`（英）与 `:106-107`（中）的「contract push」改「contract main push」；`check-push-order.mjs` 的 `main()`、`judge()` 增加 main 推送输入与顺序判断。CT-4 规则原文属规则变更。 | 会读作 OK/合规（bump 晚于 main 推送 34 秒）。`3b08706b` 仍是一条已记违规，除非被取代，于是记录与规则分叉。 | 若 tag 取自不在 `main` 的提交，或 tag 从未落地，B 会让一次针对「消费方按 tag 取不到的版本」的 bump 通过。可观察：构造「main 有该提交、tag 缺失或晚于消费方推送」的案例，B 若判过即被证伪。若本意是让 `3b08706b` 继续成立，则 B 不能用于 11-24，否则自相矛盾。 |
| **C. 双锚 + tag 须先于消费方推送** | 顺序腿只要契约 `main` 推送或 tag 推送任一在先即满足；另加条件：tag 推送须早于消费方推送。 | 同一句 README 改为双锚表述；`check-push-order.mjs` 的 `judge()` 取两个契约事件中较早者，并增加「tag 推送 ≤ 消费方推送」条件；需要 main 推送输入。 | 会读作 OK/合规（main 19:01:24 ≤ bump 19:01:58；tag 19:03:24 ≤ 消费方推送 19:04:33）。`3b08706b` 仍是一条已记违规，除非被取代或只在今后适用。 | C 必须让「消费方推送早于 tag 落地」的每一案都判红。可观察：bump 在 main 推送之后、tag 却在消费方推送之后 → C 必须返回 VIOLATION；若判过，C 即被证伪。同理，消费方在 tag 存在前按 tag 取到东西而 C 判过，也被证伪。 |

三个选项对 11-23 都一样：什么也改不了。11-23 的 bump 早于任何契约事件（首次推送 19:15:37），所以在 A、B、C 下都是违规，且独立于基准地不属于三个允许时刻。

### 6. 建议（建议，非裁定）

**建议以 A 作为记录基准。** 它是唯一与 `3b08706b` 一致的选项，不需要改规则，代价是一条已记违规 —— 而 2026-11-26 的裁定已经接受了这个代价。规则原文与当前实现都指向 tag 推送，而它要防的失败模式（消费方读到尚不可取的契约）由 tag 检验最直接。

若 CTO 希望 replay-then-tag 式发布不再产出违规，**C 比 B 更合适**：B 丢掉了「tag 须先于消费方推送」这道守卫，会在 tag 从未先于消费方推送落地时也判过，而那正是窗口要防的暴露。C 保留这道守卫。无论选哪一种改法，都应**只在今后生效**，保留 `3b08706b` 不动 —— 不做追溯改写。

不要把 B 当作「统一两条发现」的办法：它统一不了。11-23 在 B 下仍是违规。

### 7. 若不裁

tag 基准因 `3b08706b` 而已在事实上生效，但没有一句明说是预期的基准。11-23 那条仍无记录（11-26 的裁定只点名 11-24）。读数器仍是只取 tag，所以每次审计都会把两条重新报出来。下一次 replay-then-tag 发布仍会返回 VIOLATION，同一场争论还会再来。

### 8. 可粘进决策单的选项行

**选项 A**
`CT-4 基准：契约推送指发布 tag 推送。11-24 记 VIOLATION（顺序腿，86 秒），与 3b08706b 一致；11-23 记 VIOLATION，并写明不在三个允许时刻内。不改规则、不改代码。`

**选项 B**
`CT-4 基准：契约推送指提交到达契约 main。11-24 记合规；11-23 仍为 VIOLATION。这是规则变更，必须明确处理 3b08706b。`
`选 B 需同步改的那一句：conformance/vectors/README.md:83-84（英文）与 :106-107（中文）的「contract push / 契约推送」改为「contract main push / 契约 main 推送」，并给 check-push-order.mjs 增加 main 推送锚点。`

**选项 C**
`CT-4 基准：契约 main 推送与 tag 推送两者较早者满足顺序，且 tag 推送须早于消费方推送。11-24 记合规；11-23 仍为 VIOLATION。只在今后生效，保留 3b08706b。`
`选 C 需同步改的那一句：同一句 README 改为双锚表述，并在 check-push-order.mjs 的 judge() 里取两者较早者、增加「tag 推送 ≤ 消费方推送」条件。`

### 9. 出处与状态更正

- `handoff/cto-1128-decisions-1126.md` D5（英文 155-185 行；中文 430-460 行）—— A/B/C 三案，以及「按现有措辞，B 是本案推出的读法」。
- `handoff/4j-ct4-crossday-1126.md` §1.5-1.6 —— 规则原文与 2026-11-26 裁定的逐字引文。
- `handoff/nextstage-abc-1126.md` §3 与 B-1 —— 给 11-29 的两条发现表述。
- `D:/Rain6fish/handoff/w3-advance-1124.md` §3.1-3.2、§7.1 —— 推送侧时间线与 amend 缺陷。
- `D:/Rain6fish/KeelBase4J/handoff/push-order-amend-1126.md` —— amend 修复与更正读数。
- `D:/Rain6fish/KeelBase4J/scripts/check-push-order.mjs` —— 上文所引行号。注意：此脚本**不在** `D:/Rain6fish/KeelBase/scripts/`，宿主仓没有副本。
- `D:/Rain6fish/KeelBase4J/conformance/vectors/README.md` —— 83-84、91-98、106-107、113-118 行。
- CI run：`45163554143`（11-23 契约首次推送）、`45380276968`（11-24 契约 main）、`45380594496`（tag v1.23.0）、`45607981020`（4J 推送）。

**对任务背景的两处状态更正。**

1. amend 修复**已不再处于「未推 origin」状态**。2026-11-27 核对：`KeelBase4J` 本地 `main` 与 `origin/main` 同为 `e8e9cad`，`90e670e` 与 `458447c` 都是 `origin/main` 的祖先 —— 修复随 v0.1.21 的发布推送出去了。无需再推，本会话也没有推任何东西。
2. `handoff/push-order-amend-1126.md` 与 `handoff/w3-advance-1124.md` 不在本仓。它们分别位于 `D:/Rain6fish/KeelBase4J/handoff/` 与 `D:/Rain6fish/handoff/`，即上文所引位置。

---

## English — ruling record

### 10. Ruling received (2026-11-27)

The CTO ruled: **option A — the contract push is the release tag push; the rule is unchanged.** What is now fixed:

- **11-24 (`8f9baa75`)**: recorded as a VIOLATION on the order leg — the bump at 19:01:58 precedes the `v1.23.0` tag push at 19:03:24 by 86 s. Same day held. This is consistent with `3b08706b`.
- **11-23 (development-time pin move)**: recorded as a VIOLATION — the bump at 13:23/13:33 precedes the contract's first push at 19:15:37 by 5 h 42 min — and as outside CT-4's three allowed moments.
- **No rule change and no code change.** `conformance/vectors/README.md` stays as written; `check-push-order.mjs` stays tag-only; the CT-4 rule text is untouched.
- Options B and C are not adopted. There is no retroactive rewrite and no prospective amendment.
- The checker will keep returning VIOLATION for both findings on re-run. That is the intended reading under this ruling, not a defect to be fixed.

Paste-ready line:

`CT-4 basis ruled (2026-11-27): the contract push is the release tag push; the rule is unchanged. 11-24 recorded as VIOLATION (order leg, 86 s, consistent with 3b08706b); 11-23 recorded as VIOLATION and outside the three allowed moments. No rule or code change.`

## 中文 —— 裁定记录

### 10. 已收裁定（2026-11-27）

CTO 裁定：**选 A —— 契约推送指发布 tag 推送；规则不动。** 现在固定下来的是：

- **11-24（`8f9baa75`）**：按顺序腿记 VIOLATION —— bump 19:01:58 早于 `v1.23.0` tag 推送 19:03:24 共 86 秒；同日成立。与 `3b08706b` 一致。
- **11-23（开发期挪 pin）**：记 VIOLATION —— bump 13:23/13:33 早于契约首次推送 19:15:37 共 5 小时 42 分 —— 并记明不在 CT-4 三个允许时刻内。
- **不改规则、不改代码。** `conformance/vectors/README.md` 维持原文；`check-push-order.mjs` 维持只取 tag；CT-4 规则原文不动。
- 不采纳 B、C。不做追溯改写，也不做前瞻修订。
- 复跑读数器时两条仍会判 VIOLATION。在本裁定下这是预期读数，不是待修的缺陷。

可粘进决策单的一行：

`CT-4 基准裁定（2026-11-27）：契约推送指发布 tag 推送；规则不动。11-24 记 VIOLATION（顺序腿，86 秒，与 3b08706b 一致）；11-23 记 VIOLATION，并写明不在三个允许时刻内。不改规则、不改代码。`

---

*本件原为只读决策材料；§10 记录的是 2026-11-27 收到的裁定，不代替 CTO 的会议签字。*
