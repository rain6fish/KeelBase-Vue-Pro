#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// No tool of ours may be handed to Spring AI as a bean.
//
//   node scripts/check-ungoverned-tool-beans.mjs
//   node scripts/check-ungoverned-tool-beans.mjs --json          # the boundary as data, on stdout
//   node scripts/check-ungoverned-tool-beans.mjs --emit <path>   # …and written where the UI build reads it
//   node scripts/check-ungoverned-tool-beans.mjs --whole-build   # re-check the stated fact across every module
//
// `--json` / `--emit` exist for `YD-27`: the governance console is supposed to *present* this boundary —
// which AI paths are held back and which are not — and to do that from **the same computation the gate
// runs**, not from a description written by hand next to it. The deployment carries a jar and no sources,
// so the boundary has to be settled when the artefact is built; this is where it settles.
// They do not change the exit code: a violation still fails, and it still fails loudly.
//
// `YD-T14` (D42) ruled that this host keeps a boundary rather than a guard: `yudao-module-ai` carries a
// model-to-tool path of its own — its chat takes a role's `toolIds`, resolves the registered names
// through Spring AI's own `ToolCallbackResolver` and hands the callbacks to the model — and KeelBase's
// governance does not see any of it. The aspect points at
// `cn.iocoder.yudao.module.ai1.harness.mcp.Ai1McpClientTool.callTool`, and nothing in that module
// references KeelBase at all.
//
// What keeps that path harmless today is not a check but a fact: the only `ToolCallback` bean in this
// build is upstream's own sample, so the resolver has nothing of ours to find. That fact is the whole
// boundary, and it is one `@Bean` away from no longer being true — a governed tool registered that way
// would become reachable by a model, with no engine, no identity check, no confirmation and no audit.
// This is the check that reads it.
//
// The scope is a stated boundary, not an implied one:
//
//   - only **our own** sources: `yudao-server` and the `ai1` variant this line carries and patches;
//   - **not** upstream's `yudao-module-ai`, which declares the sample bean on purpose and is not ours
//     to change — its presence is the fact the boundary rests on, not a violation of it;
//   - the shape is what is read, not a name: an `@Bean` method whose **declared return type** hands out
//     a `ToolCallback` (or `FunctionCallback` / `ToolCallbacks`). A method that merely *returns* one —
//     `Ai1McpToolFactory.buildTools` does — is not a bean, is never resolved by name, and must not be
//     reported: the seam this line relies on goes through exactly that method.
//
// 我们自己写的工具，一个都不许以 bean 的形式交给 Spring AI。
//
//   node scripts/check-ungoverned-tool-beans.mjs
//   node scripts/check-ungoverned-tool-beans.mjs --json          # 边界的数据形态，打到标准输出
//   node scripts/check-ungoverned-tool-beans.mjs --emit <路径>    # ……并写到 UI 构建要去读的地方
//   node scripts/check-ungoverned-tool-beans.mjs --whole-build   # 跨全部模块复核那条写明的事实
//
// `--json` / `--emit` 是为 `YD-27` 加的：治理控制台要**呈现**这条边界（哪些 AI 路径会被扣下、哪些不会），
// 且必须由**门禁跑的那同一次计算**给出，而不是旁边手写一段描述。部署物是 jar、没有源码，故边界只能在**构建
// 产物时**定型；这里就是它定型的地方。两者**都不改退出码**：有违反仍然失败，且仍然响亮地失败。
//
// `YD-T14`（`D42`）裁的是**记边界**而不是加守卫：`yudao-module-ai` 自带一条模型→工具的路——它的 chat 取角色的
// `toolIds`、经 Spring AI 自己的 `ToolCallbackResolver` 把注册名解析成 callback 交给模型——而 KeelBase 的治理
// 一点都看不见。切面的切点是 `cn.iocoder.yudao.module.ai1.harness.mcp.Ai1McpClientTool.callTool`，而那个模块
// 里**没有任何东西引用 KeelBase**。
//
// 让那条路今天无害的**不是检查、是一个事实**：本构建里唯一的 `ToolCallback` bean 是**上游自己的示例**，故解析器
// 找不到我们的东西。**那个事实就是整条边界**，而它离「不再成立」只差一个 `@Bean` —— 以那种方式注册的受治理工具
// 会变得**模型够得到，且不经引擎、不经身份、不经确认、不留审计**。这个脚本就是读它的那道检查。
//
// 射程是**写明的边界**，不是暗示的：
//
//   - 只扫**我们自己的**源码：`yudao-server` 与本线携带并打过补丁的 `ai1` 变体；
//   - **不扫**上游的 `yudao-module-ai` —— 它**刻意**声明那个示例 bean，且不是我们该改的；它的存在正是边界所倚的
//     那个事实，**不是**对边界的违反；
//   - 读的是**形状**不是名字：`@Bean` 方法的**声明返回类型**交出 `ToolCallback`（或 `FunctionCallback` /
//     `ToolCallbacks`）。仅仅**返回**一个的方法——`Ai1McpToolFactory.buildTools` 就是——**不是 bean**、永不被按名
//     解析，**不得**被报出来：本线所倚的那条缝正是走那个方法的。
//
// **上面那半条事实现在由 `--whole-build` 复核**（2026-10-20 加）。默认运行只能确认「我们的源码里没有」，推不出
// 「全构建里唯一的那个是上游示例」—— 因为默认射程**刻意**不含 `yudao-module-ai`。`--whole-build` 扫**全部模块的
// 生产源码**（`src/main/java`）并对那条事实负责：恰好一个工具 `@Bean`、且它就是白名单里的**上游示例**
// `AiAutoConfiguration.toolCallbacks`（`ToolCallbacks.from(personService)`，照 MCP client boot-starter 文档写的示例；
// 不是我们的、不该改，它的存在正是边界所倚的事实）。多出任何一处 ⇒ 非零退出并点名 `文件:行`；连那一处也不见了
// ⇒ 同样非零（事实变了，要人来重新陈述，而不是让 `stated.notHeld` 悄悄过期）。`--whole-build` 不改变默认运行、
// `--json` / `--emit` 的任何输出与退出码。
//
// **That half of the fact is now re-checked by `--whole-build`** (added 2026-10-20). The default run can only
// confirm "nothing in our sources"; it cannot derive "the only one in the whole build is upstream's sample",
// because the default scope deliberately omits `yudao-module-ai`. `--whole-build` scans **every module's
// production sources** (`src/main/java`) and answers for that fact: exactly one tool `@Bean`, and it is the
// allow-listed **upstream sample** `AiAutoConfiguration.toolCallbacks` (`ToolCallbacks.from(personService)`,
// straight from the MCP client boot-starter docs; not ours to change, and its presence is the fact the boundary
// rests on). Any extra one ⇒ non-zero exit naming `file:line`; the sample disappearing ⇒ also non-zero (the fact
// changed and a person must restate it, rather than letting `stated.notHeld` go quietly stale). `--whole-build`
// changes nothing about the default run, `--json` or `--emit`.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Our own sources. Upstream's modules are deliberately absent — see the header. */
const ROOTS = ['yudao-server/src', 'yudao-module-ai1-springai/src']

/** What a bean handing tools to Spring AI looks like in a signature. */
const TOOL_TYPES = /\b(ToolCallback|FunctionCallback|ToolCallbacks)\b/

const javaFiles = []
const walk = (dir) => {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (e.endsWith('.java')) javaFiles.push(p)
  }
}
for (const r of ROOTS) walk(join(ROOT, r))

// ── `--whole-build`: re-check the stated fact ────────────────────────────────────────────────────────
//
// `stated.notHeld` below claims "the only `ToolCallback` bean in this build is upstream's own sample".
// The default scan cannot check that (it deliberately omits `yudao-module-ai`), so this mode does: it
// reads **every** module's production sources and allows exactly one bean — the one named here.
//
// 下面 `stated.notHeld` 声称「本构建里唯一的 `ToolCallback` bean 是上游自己的示例」。默认扫描**刻意**不含
// `yudao-module-ai`，推不出这条；本模式负责复核：读**全部**模块的生产源码，只放行这里点名的唯一一个。
const WHOLE_BUILD_ALLOWED = {
  // 上游的 MCP 示例：`ToolCallbacks.from(personService)`，照 Spring AI MCP client boot-starter 文档写的。
  // 它属于上游、不归我们改；它的存在正是边界所倚的那条事实。按文件与**方法**放行（行号会漂，故不按行号）。
  //
  // Upstream's MCP sample: `ToolCallbacks.from(personService)`, straight from the Spring AI MCP client
  // boot-starter docs. It is upstream's, not ours to change, and its presence is the fact the boundary
  // rests on. Allowed by file and **method** — a line number would drift; a method name is the identity.
  file: 'yudao-module-ai/src/main/java/cn/iocoder/yudao/module/ai/framework/ai/config/AiAutoConfiguration.java',
  method: 'toolCallbacks'
}

/** The declaration that starts on `lines[i]`: annotation, modifiers, return type, name, parameters. */
const declarationAt = (lines, i) => {
  let decl = ''
  for (let j = i; j < lines.length && j < i + 15; j += 1) {
    decl += `${lines[j]}\n`
    if (/[{;]\s*$/.test(lines[j])) break
  }
  return decl
}

/** The method name in a declaration — annotations (and their arguments) removed first. */
const methodNameOf = (decl) => {
  const m = decl.replace(/@[\w.]+(?:\s*\([^)]*\))?/g, ' ').match(/([A-Za-z_$][\w$]*)\s*\(/)
  return m ? m[1] : null
}

const runWholeBuild = () => {
  // Production sources only: a jar carries `src/main/java`, not tests, and the stated fact is about the
  // build. Directories that are not the build itself are skipped so a stray checkout or copy cannot vote.
  // 只看生产源码：jar 带的是 `src/main/java` 而不是测试，而那条事实讲的是构建。非构建目录一并跳过，
  // 免得一份另起的检出或拷贝来投票。
  const SKIP_DIRS = new Set(['.git', '.claude', 'target', 'node_modules', 'dist', 'build'])
  const wholeBuildFiles = []
  const walkWhole = (dir) => {
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(dir, e)
      let st
      try {
        st = statSync(p)
      } catch {
        continue
      }
      if (st.isDirectory()) {
        if (!SKIP_DIRS.has(e)) walkWhole(p)
      } else if (e.endsWith('.java')) {
        const rel = relative(ROOT, p).split('\\').join('/')
        if (rel.includes('/src/main/java/')) wholeBuildFiles.push({ file: p, rel })
      }
    }
  }
  walkWhole(ROOT)

  const beans = []
  for (const { file, rel } of wholeBuildFiles) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    lines.forEach((line, i) => {
      // An annotation starts the line; `{@code @Bean}` in a javadoc does not. / 注解在行首；javadoc 里的
      // `{@code @Bean}` 不算。
      if (!/^\s*@Bean\b/.test(line)) return
      const decl = declarationAt(lines, i)
      if (!TOOL_TYPES.test(decl)) return
      beans.push({ file: rel, line: i + 1, method: methodNameOf(decl) })
    })
  }

  const allowed = beans.filter((b) => b.file === WHOLE_BUILD_ALLOWED.file && b.method === WHOLE_BUILD_ALLOWED.method)
  const extras = beans.filter((b) => !allowed.includes(b))

  console.log(`whole build: ${beans.length} tool @Bean(s) over ${wholeBuildFiles.length} main-source file(s)`)
  for (const b of allowed) {
    console.log(`  ALLOWED  ${b.file}:${b.line}  ${b.method}()  — upstream's sample (see the header)`)
  }
  for (const b of extras) {
    console.error(`  UNGOVERNED  ${b.file}:${b.line}  ${b.method}()  <- a @Bean hands tools to Spring AI by name`)
  }

  if (extras.length > 0) {
    console.error()
    console.error(`${extras.length} bean(s) beyond upstream's sample would make tools reachable by a model`
      + ' without KeelBase seeing the call. Route them through the runtime instead (see YD-T14 / D42).')
    console.error(`0 ok / ${extras.length} failed`)
    return 1
  }
  if (allowed.length !== 1) {
    console.error()
    console.error('the stated fact no longer holds: the allow-listed upstream sample'
      + ` (${WHOLE_BUILD_ALLOWED.file} ${WHOLE_BUILD_ALLOWED.method}()) is gone or ambiguous;`
      + ' re-review `stated.notHeld` in this script and the header above.')
    console.error('0 ok / 1 failed')
    return 1
  }
  console.log('1 ok / 0 failed')
  return 0
}

if (process.argv.includes('--whole-build')) {
  process.exit(runWholeBuild())
}

const offenders = []
for (const file of javaFiles) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  lines.forEach((line, i) => {
    if (!/@Bean\b/.test(line)) return
    // The declaration runs from the annotation to the method's body or its `;`. Everything between is
    // its signature — annotations, modifiers, return type, name, parameters.
    let decl = ''
    for (let j = i; j < lines.length && j < i + 15; j += 1) {
      decl += `${lines[j]}\n`
      if (/[{;]\s*$/.test(lines[j])) break
    }
    if (TOOL_TYPES.test(decl)) {
      offenders.push({ file: relative(ROOT, file).split('\\').join('/'), line: i + 1, decl })
    }
  })
}

// 边界的**数据形态** —— `YD-27` 的页面原样渲染这个对象，而它上面那两半正是门禁自己查到的东西。`computed`
// 由本次运行推出（射程、发现、结论）；`stated` 是这次运行只能**确认**、推不出来的**设计事实**：运行时的缝扣住
// 哪些路径、以及上游自己那条路为什么无害。两样都留在这里就是要点 —— CI 与控制台于是读的是**同一个对象**。
//
// The boundary as data — `YD-27`'s page renders this object as it stands, and the two halves above are
// what the gate itself found. `computed` comes out of this run (scope, findings, verdict); `stated` is the
// design fact a run can only *confirm*, never derive: which paths the runtime's seam holds, and why
// upstream's own path stays harmless. Keeping both here is the point — CI and the console then read one
// object rather than two descriptions of it.
// 边界的**数据形态** —— `YD-27` 的页面读它。**这里不放散文**：管理台双语是红线，词必须由控制台按读者语言
// 给，故产物只带**标识与枚举**（`verdict` / 路径 id / `holds` 的每一格 / `offenders` 的坐标），散文的落点
// 是控制台的 i18n。`computed` 由本次运行推出；`stated` 是运行只能**确认**、推不出来的**设计事实**。
//
// The boundary as data, for `YD-27`'s page. **No prose lives here**: the console is bilingual by a standing
// rule, so its words have to come from its own i18n and this object carries identifiers and enums only —
// `verdict`, the path ids, each entry in `holds`, and the coordinates of any offender. `computed` comes out
// of this run; `stated` is the design fact a run can only *confirm*, never derive.
// 治理覆盖账本（`conformance/governance-coverage.tsv`）—— M0 的那本账：部署范围里每个业务 service 一个姿态。
// **只带标识与枚举**：账本里的 `reason` 是中文散文，不进产物；词由控制台按读者语言给。`null` 表示这一构建没带
// 账本，页面据此不画那一节 —— 判「账本缺了」的是它自己的门 `check-governance-coverage.mjs`，不是这里。
//
// The onboarding-coverage ledger (`conformance/governance-coverage.tsv`) — M0's book: one posture per business
// service in the deployed scope. **Identifiers and enums only**: the ledger's `reason` column is Chinese prose
// and does not go into the artefact; the console supplies the words. `null` means this build carries no ledger
// and the page draws no such section — the ledger's own gate is what judges it missing, not this one.
const coverage = (() => {
  let text
  try {
    text = readFileSync(join(ROOT, 'conformance/governance-coverage.tsv'), 'utf8')
  } catch {
    return null
  }
  const rows = []
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === '' || line.startsWith('#')) continue
    const cols = line.split('\t')
    if (cols.length < 4) continue
    rows.push({ module: cols[0], object: cols[1], posture: cols[3] })
  }
  const tally = (subset) => ({
    services: subset.length,
    seam: subset.filter((r) => r.posture === 'seam').length,
    'tool-only': subset.filter((r) => r.posture === 'tool-only').length,
    gap: subset.filter((r) => r.posture === 'gap').length,
    exempt: subset.filter((r) => r.posture === 'exempt').length,
  })
  return {
    schema: 'keelbase-governance-coverage/1',
    totals: tally(rows),
    modules: [...new Set(rows.map((r) => r.module))].sort().map((module) => ({
      module,
      ...tally(rows.filter((r) => r.module === module)),
    })),
    rows,
  }
})()

const boundary = {
  schema: 'keelbase-governance-boundary/1',
  // 治理覆盖账本：与 `stated.paths` 同性质 —— 设计事实，页面只画、不重算。
  // The onboarding ledger: a design fact like `stated.paths`; the page draws it and recomputes nothing.
  coverage,
  computed: {
    scope: {
      // The roots are read from the same constant the walk uses, so the page cannot report a scope the
      // check did not actually visit. / 射程取自上面那次遍历用的同一个常量，故页面报不出门禁没真扫过的范围。
      roots: ROOTS,
      filesScanned: javaFiles.length,
      excludedPaths: ['yudao-module-ai'],
    },
    // What the check reads, as an enum rather than a sentence. / 门禁读的是什么，用枚举而不是一句话。
    reads: 'declared-return-type',
    readsTypes: ['ToolCallback', 'FunctionCallback', 'ToolCallbacks'],
    offenders: offenders.map((o) => ({ file: o.file, line: o.line })),
    verdict: offenders.length === 0 ? 'ok' : 'violated',
  },
  stated: {
    held: {
      id: 'runtime-seam',
      holds: ['authorization', 'identity', 'confirmation', 'audit', 'side-effect-ledger'],
    },
    notHeld: {
      id: 'upstream-resolver',
      whyHarmlessNow: 'no-tool-callback-bean-of-ours',
      oneBeanAway: true,
    },
    // 每一条 AI 路径的治理姿态 —— 运行**推不出来**、只能**确认**的**设计事实**。四路由 `D57` 点名：
    // `D42` 上游解析器路、`D44`-B（ai1 MCP）、SKILL、ai1 RAG（另加本部署受治理的运行时那条缝作基线）。
    // 每个条目只带**标识与枚举**：`posture`、`holds` / `doesNotHold`（与 `held.holds` 同一套词）、一个
    // `gap` 枚举，以及**代码出处** `sources`（`文件:行`）。散文由控制台 i18n 按读者语言给。
    // 这些姿态的出处（逐条核于 2026-10-26）：
    //   · runtime-seam —— `YudaoGovernedAgentTools.java` 实现 `Ai1LocalToolProvider`，调用经
    //     `GovernedExecutionEngine`；`GovernedToolFaces.java` 写明它受确认与审计管住。
    //   · upstream-resolver —— `GovernedToolFaces.java` 写明治理看不见它；本文件头与那条边界的门禁。
    //   · ai1-mcp —— `YudaoAi1ToolGovernor.java:69` 把工具注册成宿主装配、并把写默认禁用；
    //     `Ai1McpToolFactory.java:99` 按 `readOnlyHint` 定读/写；`Ai1ExternalToolAdapter.java:76` 交给引擎执行。
    //     审计与授权由引擎给；外部工具没有结果 id，故**无确认、无副作用台账**。
    //   · SKILL —— `Ai1SkillToolFactory.java:122` 装配；工具经同一个外壳进引擎。shell 仍在**本机**跑，
    //     但每次调用先被引擎判过、并留下审计行；同样无确认、无台账。
    //   · ai1 RAG —— `Ai1RagTool.java:227` 的 `buildAdvisor` 把检索交给引擎（R1 读），每次检索两行审计。
    //
    // `defaults` 也是**设计事实**，不是扫描结果：它回答「这个部署刚起来、还没人写过策略时，这条路能做什么」。
    // 外部工具在注册时由 `YudaoAi1ToolGovernor.registerAll` 把**非只读**的那些写成 `enabled:false`
    // （`GovernancePolicyStore.ensureDisabled`），故 ai1 MCP 与 SKILL 的写类是 `writes-off`；MCP 的工具名
    // 由对端给、静态列不出来，只有 SKILL 的七个名字是固定的（`onTools` / `offTools`）。三条读工具
    // （Glob / Grep / ListDirectory）是 R1、不落默认条目，故照常可用。`Skill` —— 只加载 `SKILL.md` 的那个
    // 工具 —— 也在被禁的七个里：新部署里模型连技能说明都拿不到。这是**已声明**的现状（是否把 `Skill`
    // 放进 R1 是一条待裁的产品决定），不是这一行的判断。
    //
    // `defaults` is also a **design fact** rather than a scan result: it answers "what can this path do in
    // a deployment nobody has written a policy for yet". At registration `YudaoAi1ToolGovernor.registerAll`
    // writes `enabled:false` for every non-read external tool (`GovernancePolicyStore.ensureDisabled`), so
    // ai1 MCP and SKILL are `writes-off`; MCP tool names come from the far side and cannot be listed
    // statically, while SKILL's seven names are fixed (`onTools` / `offTools`). The three read tools
    // (Glob / Grep / ListDirectory) are R1 and get no default entry, so they run. `Skill` — the tool that
    // only loads `SKILL.md` — is among the seven disabled, so a new deployment cannot read skill content
    // at all. That is the **declared** state (whether `Skill` belongs in R1 is an open product decision),
    // not a judgement made by this row.
    //
    // Every AI path's governance posture — a **design fact** a run can only *confirm*, never derive. The
    // four paths are named by `D57`: `D42`'s upstream resolver, `D44`-B (ai1 MCP), SKILL and ai1 RAG
    // (plus this deployment's governed runtime seam as the baseline). Each entry carries identifiers and
    // enums only: `posture`, `holds` / `doesNotHold` (the same vocabulary as `held.holds`), one `gap`
    // enum, `actions` (ids of the business actions callable on that path), and `sources` — the code
    // coordinates (`file:line`). The console supplies the prose through
    // its i18n, in the reader's language. Coordinates were checked on 2026-10-26.
    //   · ai1-mcp / ai1-skill now go through the engine (`YudaoAi1ToolGovernor` → `Ai1ExternalToolAdapter`);
    //     they hold authorization, identity and audit. An external tool has no result id, so there is no
    //     confirmation and no side-effect ledger row — the declared `external-effect-no-ledger` gap.
    //     `actions` names business actions, not controls: the M7 reader answered with controls because the
    //     page only offered control names.
    //   · ai1 RAG's retrieval is a governed R1 read: every search writes an audit row.
    paths: [
      {
        id: 'runtime-seam',
        posture: 'governed',
        holds: ['authorization', 'identity', 'confirmation', 'audit', 'side-effect-ledger'],
        doesNotHold: [],
        gap: 'none',
        actions: ['write-records', 'approve-records'],
        defaults: 'on',
        sources: [
          'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/YudaoGovernedAgentTools.java:81',
          'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/GovernedToolFaces.java:30',
        ],
      },
      {
        id: 'upstream-resolver',
        posture: 'not-governed',
        holds: [],
        doesNotHold: ['authorization', 'identity', 'confirmation', 'audit', 'refusal', 'side-effect-ledger'],
        gap: 'one-bean-away',
        actions: ['model-tool-call'],
        defaults: 'on',
        sources: [
          'scripts/check-ungoverned-tool-beans.mjs:16',
          'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/GovernedToolFaces.java:30',
        ],
      },
      {
        id: 'ai1-mcp',
        posture: 'partially-governed',
        holds: ['authorization', 'identity', 'audit'],
        doesNotHold: ['confirmation', 'side-effect-ledger'],
        gap: 'external-effect-no-ledger',
        actions: ['mcp-read', 'mcp-write'],
        defaults: 'writes-off',
        sources: [
          'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/YudaoAi1ToolGovernor.java:69',
          'yudao-module-ai1-springai/src/main/java/cn/iocoder/yudao/module/ai1/harness/mcp/Ai1McpToolFactory.java:99',
          'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/Ai1ExternalToolAdapter.java:76',
        ],
      },
      {
        id: 'ai1-skill',
        posture: 'partially-governed',
        holds: ['authorization', 'identity', 'audit'],
        doesNotHold: ['confirmation', 'side-effect-ledger'],
        gap: 'external-effect-no-ledger',
        actions: ['shell', 'file-read', 'file-write'],
        defaults: 'writes-off',
        onTools: ['Glob', 'Grep', 'ListDirectory'],
        offTools: ['Bash', 'BashOutput', 'Edit', 'KillShell', 'Read', 'Skill', 'Write'],
        sources: [
          'yudao-module-ai1-springai/src/main/java/cn/iocoder/yudao/module/ai1/harness/skill/Ai1SkillToolFactory.java:122',
          'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/YudaoAi1ToolGovernor.java:69',
          'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/Ai1ExternalToolAdapter.java:76',
        ],
      },
      {
        id: 'ai1-rag',
        posture: 'governed',
        holds: ['authorization', 'identity', 'audit'],
        doesNotHold: [],
        gap: 'none',
        actions: ['knowledge-search'],
        defaults: 'on',
        sources: [
          'yudao-module-ai1-springai/src/main/java/cn/iocoder/yudao/module/ai1/harness/rag/Ai1RagTool.java:227',
          'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/YudaoAi1ToolGovernor.java:93',
        ],
      },
    ],
  },
}

const args = process.argv.slice(2)
const emitArg = args.indexOf('--emit') >= 0 ? args[args.indexOf('--emit') + 1] : null
// With `--json` stdout carries the object **and nothing else**: a reader that parses it must not have to
// skip a line of prose, and the prose is worth keeping — so it moves to stderr rather than being dropped.
// `--json` 时 stdout 只承载那个对象、**别无他物**：解析它的人不该先跳掉一行散文；而散文本身值得留着，故它
// 挪到 stderr，而不是被丢掉。
const jsonOnly = args.includes('--json')
const say = (...line) => (jsonOnly ? console.error(...line) : console.log(...line))
if (args.includes('--json') || emitArg) {
  const text = `${JSON.stringify(boundary, null, 2)}\n`
  // A path that is already absolute is taken as given; anything else is relative to the repository root.
  // 已经是绝对路径的按原样用；其余一律按仓库根相对。
  if (emitArg) writeFileSync(/^([A-Za-z]:[\\/]|[\\/])/.test(emitArg) ? emitArg : join(ROOT, emitArg), text)
  if (args.includes('--json')) process.stdout.write(text)
}

if (offenders.length > 0) {
  for (const o of offenders) {
    console.error(`  UNGOVERNED  ${o.file}:${o.line}  <- a @Bean hands tools to Spring AI by name`)
  }
  console.error()
  console.error(`${offenders.length} bean(s) would make our tools reachable by a model without KeelBase`
    + ' seeing the call. Route them through the runtime instead (see YD-T14 / D42).')
  say(`0 ok / ${offenders.length} failed`)
  process.exit(1)
}

say(`no bean in our own sources hands tools to Spring AI`
  + ` (${javaFiles.length} file(s) over ${ROOTS.length} root(s))`);
say(`1 ok / 0 failed`);
