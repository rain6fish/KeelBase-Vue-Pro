#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 本宿主上每一条 AI 执行路径都登记，且它报的种类就是它自己那种。
//
//   node scripts/check-governance-registry.mjs
//   KEELBASE_ROOT=<另一份检出> node scripts/check-governance-registry.mjs   # 反向可证用 / for the reverse proof
//
// 登记处（`GovernedModuleRegistry`）收的是 Spring 看得见的那些声明，故一台跑着的宿主可以被问到「这里被数到的是什么」。
// 它**做不到**的是：分出「不受治理」与「被忘了」——载体没自报的路径，**就是不在**集合里。本检查堵的就是那个洞，而它堵在
// **源码**上、不是运行时。
//
// **`YD-24`：射程从「模块一种」扩到全量 AI 执行路径。**在此之前，这里只读模块的 `service` 层切点一种形状，于是一个
// **工具面**——AI 经它到达执行的地方——从没被枚举过，丢了也没人看得见。现在四种形状都读（下面「怎么数」列全），每种
// 都要求**登记**：形状读出来的每一个载体，都得在登记处自报（或在手写目录里被列出）；缺失即红。
//
// ## 怎么数：射程与四条形状
//
// 射程是**写明的**，两半：`yudao-server` 自己的 `cn.iocoder.yudao.server.keelbase` 树（含 `generated/`），
// 加上 `yudao-module-ai1-springai` 自己的 `…/module/ai1/harness` 树。**上游的模块不扫**——我们不治理它们，
// 是它们被我们治理；`ai1` 树里也只读**我们那一层**，不读它的 controller / service / dal。
//
// **`harness` 为什么进来，又只认它的一种形状。** 那一层里有一处是**入站**的：它为一次会话**装配工具**，而装出来的
// 东西**在本机上执行**（`ShellTools` 在服务器上跑 shell、`FileSystemTools` 读写文件）——那是 AI 够到**这台机器**的
// 地方，必须数得到，故它的**装配端**是一种形状。另一半是**出站**的：按那一层自己的 `package-info.java`，它是
// 「平台**去调用**大模型、MCP 服务、知识库与 SKILL 的客户端与工厂」，原文「**不是**注册给模型调用的 function tool」
// ——出站不认形状，所以 `harness` 只多出「装配端」这一种。
//
// **为什么这些载体只能手写登记。** 治理接口（`GovernedPath`）住在 `yudao-server`，而 `ai1` **不能反向依赖它**
// ⇒ 那个模块里的类**实现不了**本接口，自报这条路对它们根本不通。故它们走那份手写目录
// （`GovernedToolFaces.java`），与生成的 `ProductsTools` 同一个办法。
//
// **一处张力，如实记、不掩。** 目录里的 `Ai1ExternalToolAdapter` 是 AI 外部工具交给引擎的外壳——MCP 与 SKILL
// 都经它登记，而 MCP 的调用最终仍是**出站**的。故这条边界判的不是「入站还是出站」，而是「**归谁声明、且 AI 够不够
// 得到本机**」：MCP 与 SKILL 登记的都是它们的**治理端**（同一个外壳），而 SKILL 还有自己的**装配端**；两者都不是
// 「一条路的全部」。读成「只装入站」或「只装出站」，都有反例。
//
// 一条**AI 执行路径** = 本宿主上一处「AI 能到达执行」的载体，按下面五条形状判定（读的是**形状**、不是名字）：
//
//   * `module`  —— 自己的 `@Around` pointcut 点了 `cn.iocoder.yudao.module.<x>.service.` 的切面。它是一处**业务模块**，
//      且拿模块自己的 service 层当接缝；它必须 `implements GovernedModule`，且它报的名字**必须**是它 pointcut 里的 `<x>`。
//   * `tool`    —— 把可调用物交给**引擎或模型**的地方，读五种子形状：① 声明 `@Bean` 且**声明返回类型**是 `AiTool` 的方法
//      （工具面）；② `implements AiTool` 的类（单工具）；③ `implements Ai1LocalToolProvider` 的类（本部署自己的引擎工具面）；
//      ④ 一处**不是模块 service** 的切面（`@Aspect` + `@Around`，但 pointcut 不走 `module.<x>.service.`）—— 那是打**工具路**
//      的治理（本宿主上就是 MCP 那条）；⑤ 声明 `public List<…> buildTools(…)` 的类——`ai1` 的 `harness` 里**把工具装配给
//      一次会话**的地方（本宿主上两条：MCP 那条的装配端，与 SKILL 那条）。它必须**登记**：或者自己 `implements GovernedPath`
//      （`kind()` 为 `TOOL`），或者在 `GovernedToolFaces.java` 这份手写目录里被按类名列出（生成面与 `ai1` 那两处走这条）。
//      **⚠ ⑤ 只读「装配端」。** 那两处装出来的工具交给模型调，而「这条路受不受治理」**不在**这个形状里 —— 它是
//      `stated.paths` 里的一条**声明**（`check-ungoverned-tool-beans.mjs`），由 `boundary-page.test.mjs` 钉住。
//      **更正（2026-10-27；原文「今天一条治理缝都没有」保留、已过期）**：SKILL 那条自 `63bbba70a1` 起经
//      `Ai1ToolGovernor` 进引擎（`Ai1SkillToolFactory.buildTools` 收治理器、缺则抛），姿态记为
//      `partially-governed`：**有**授权 / 身份 / 审计，**无**确认、**无**副作用台账。
//   * `workflow` / `scheduled-task` —— 今天本宿主上**一条都没有**；形状写在下面，空缺**明说**而不是省略。一条流程若出现，
//      它应 `implements GovernedPath` 并报 `WORKFLOW`；一个定时任务同理报 `SCHEDULED_TASK`。
//
// **为什么工具也守「反向」**：目录里列了一个**没有**对应形状的类名 ⇒ 那也是红（一条过期的登记，读起来像治理、其实是幽灵）。
// 故本检查两个方向都读：形状 ⇒ 有登记，登记 ⇒ 有形状。
//
// **空树 / 根缺失是红，不是绿。** 射程的两半（下面两个目录）哪一半读不到 `.java`，都说明**读脚本**出了错、
// 而不是「这里没有路径」——真检出两半都有文件。空读会让下面每条判据空着成立，于是一棵错的检出读成「全部
// 已登记」。读到了文件、却一条路径也没读出来同理：那也是读脚本的错。
//
// Every AI execution path on this host is declared, and the kind it declares is the one it is.
//
//   node scripts/check-governance-registry.mjs
//
// The registry (`GovernedModuleRegistry`) collects the declarations Spring can see, so a running host can
// be asked what is counted here. What it cannot do is tell "not governed" from "forgotten" — a path whose
// carrier does not declare itself is simply absent. This check closes that gap, on the **sources** rather
// than at runtime.
//
// **`YD-24`: the scope widened from one kind to every AI execution path.** Before, this read a module's
// `service.` pointcut and nothing else, so a **tool face** — a place the AI reaches execution through —
// was never enumerated and could be dropped unseen. It now reads four shapes (all listed above), and each
// requires a **declaration**: every carrier a shape picks out must declare itself in the registry (or be
// listed in the hand-written catalogue); a miss is red.
//
// Scope is stated, in two halves: `yudao-server`'s own `cn.iocoder.yudao.server.keelbase` tree
// (including `generated/`), plus `yudao-module-ai1-springai`'s own `…/module/ai1/harness` tree.
// **Upstream's modules are not scanned** — we do not govern them, they are governed by us; and inside
// the `ai1` module only **our own layer** is read, not its controller / service / dal.
//
// **Why `harness` is in, and why only one of its shapes is.** That layer holds one thing that is
// **inbound**: it **assembles tools** for a session, and what it assembles **runs on this machine**
// (`ShellTools` runs shell on the server, `FileSystemTools` reads and writes files) — a place the AI
// reaches *this host*, so it has to be countable, and its **assembling end** is therefore a shape. The
// other half is **outbound**: by that layer's own `package-info.java` it is "the client and factory side
// that calls out to models, MCP, knowledge bases and SKILL", in its words "**not** a function tool
// registered for the model to call" — outbound carries no shape, so the assembling end is all `harness`
// adds.
//
// **Why these carriers can only be listed by hand.** The governance interface (`GovernedPath`) lives in
// `yudao-server`, and `ai1` **cannot depend back on it** — so a class in that module **cannot** implement
// the interface, and declaring itself is not open to it. They go through the hand-written
// `GovernedToolFaces.java` instead, the same way the generated `ProductsTools` does.
//
// **One tension, recorded rather than hidden.** The catalogue's `Ai1ExternalToolAdapter` is the shell
// that hands an ai1 external tool to the engine — MCP and SKILL both register through it, and an MCP
// call is still **outbound** in the end. So this boundary does not split on "inbound or outbound" but on
// "**who declares it, and can the AI reach this host through it**": MCP and SKILL are here through their
// **governed end** (the same shell), and SKILL also through its **assembling end**; neither is "the
// whole of one path". Read as "inbound only" or "outbound only", it has counter-examples either way.
//
// An **AI execution path** is a carrier of one of five shapes — read as shapes, not names:
//
//   * `module`  — an aspect whose `@Around` pointcut names `cn.iocoder.yudao.module.<x>.service.`. It must
//       `implements GovernedModule`, and the name it declares has to be the `<x>` own pointcuts name.
//   * `tool`    — a place that hands callables to the engine or a model, read as five sub-shapes: a
//       `@Bean` method whose declared return type is `AiTool`; a class that `implements AiTool`; a class
//       that `implements Ai1LocalToolProvider`; an aspect that governs a **tool path** rather than a
//       module's `service.` layer; and a class declaring `public List<…> buildTools(…)` — `ai1`'s
//       `harness` shape, the place that **assembles tools for a session** (two here: the MCP path's
//       assembling end, and the SKILL path). It must declare itself (`implements GovernedPath`,
//       `kind()` = `TOOL`) or be listed by class name in the hand-written `GovernedToolFaces.java`
//       catalogue (the generated face, and those two, go this way).
//       **⚠ ⑤ reads the assembling end only.** What it assembles is handed to a model, but "is this path
//       governed?" is *not* in this shape — it is a **declaration** in `stated.paths`
//       (`check-ungoverned-tool-beans.mjs`), pinned by `boundary-page.test.mjs`.
//       **Corrected 2026-10-27 (the former "no governance seam at all today" is stale):** since
//       `63bbba70a1` the SKILL path goes through `Ai1ToolGovernor` — `Ai1SkillToolFactory.buildTools`
//       takes a governor and throws without one — and is declared `partially-governed`: authorization,
//       identity and audit held; confirmation and the side-effect ledger not.
//   * `workflow` / `scheduled-task` — there are none on this host today; the shapes are stated and the
//       emptiness is said rather than omitted.
//
// **Why tools are read both ways**: a name listed in the catalogue with no matching shape is also red — a
// stale declaration that reads like governance but is a ghost. So both directions are read.
//
// **An empty tree or a missing root is red, not green.** Whichever half of the scope (the two directories
// below) reads no `.java` means the **reader** is wrong, not that "there are no paths here" — a real
// checkout has files in both. An empty reading makes every criterion below hold vacuously, so a wrong
// checkout reads as "everything declared". Reading files but not one path is red for the same reason.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// `KEELBASE_ROOT` 让看门测试把本脚本指向一棵临时铺出来的树（与 `check-trigger-uniqueness.mjs` 同一个约定）。
// `KEELBASE_ROOT` lets the keeper test point this script at a temporary tree (the same convention as
// `check-trigger-uniqueness.mjs`).
const ROOT = process.env.KEELBASE_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')
const OWN = 'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase'
// The other half of the scope — this module's own `harness` tree. Only its **assembling** end carries a
// shape (see the scope note and sub-shape ⑤ below): that is the inbound half, the one whose tools run on
// this machine. The outbound half stays out, by that layer's own `package-info.java`.
// 射程的另一半——本模块自己的 `harness` 树。只有它的**装配端**带形状（见上面的射程说明与子形状 ⑤）：那是
// **入站**的那一半，装出来的工具跑在**本机**上。**出站**那一半留在外面，依据是那一层自己的 `package-info.java`。
const AI1_HARNESS = 'yudao-module-ai1-springai/src/main/java/cn/iocoder/yudao/module/ai1/harness'
// The one hand-written catalogue a tool face may be listed in instead of declaring itself. Read as data,
// so a face added to the sources without an entry here turns this check red.
// 工具面可以**不**自报、改为在这份手写目录里被列出（生成面走这条）。当数据读：源码里加了面而这里没加，即红。
const CATALOGUE = 'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/GovernedToolFaces.java'

/** A pointcut that goes through a module's own service layer — the shape that makes it a governed module. */
const MODULE_SERVICE = /execution\(\*\s*cn\.iocoder\.yudao\.module\.([a-z0-9]+)\.service\./g
const HAS_MODULE_SERVICE = /execution\(\*\s*cn\.iocoder\.yudao\.module\.([a-z0-9]+)\.service\./
/** The declaration a governed module requires, and the name it declares. */
// Anchored to a *class declaration* (`class X implements …`) rather than the bare phrase, so prose in a
// comment — a class comment may well write "implements GovernedModule" while explaining the pattern —
// is not read as a declaration. Shape, not text. / 锚在**类声明**上（`class X implements …`），而不是光秃秃那句话，
// 免得注释里的散文（类注释完全可能写着 `implements GovernedModule` 在解释这个形状）被读成声明。读形状、不读文字。
const DECLARES_MODULE = /\bclass\s+\w+[^{;]*\bimplements\b[^{;]*\bGovernedModule\b/
const MODULE_METHOD = /String\s+module\(\)\s*\{\s*return\s*"([a-z0-9]+)"/
/** The declaration a tool face may carry itself (a record may carry it too — the catalogue's entry does). */
const DECLARES_PATH = /\b(?:class|record)\s+\w+[^{;]*\bimplements\b[^{;]*\bGovernedPath\b/
const KIND_METHOD = /Kind\s*\.\s*(MODULE|TOOL|WORKFLOW|SCHEDULED_TASK)/
/** A class that hands tools to the engine or a model, as a shape in the source. */
const IMPLEMENTS_AI_TOOL = /\bclass\s+\w+[^{;]*\bimplements\b[^{;]*\bAiTool\b/
const IMPLEMENTS_LOCAL_PROVIDER = /\bclass\s+\w+[^{;]*\bimplements\b[^{;]*\bAi1LocalToolProvider\b/
/** The assembler that hands tools to a session — `ai1`'s `harness` shape (sub-shape ⑤). `public` is what
 *  keeps an interface's own `buildTools` declaration out of it: a contract is not a path.
 *  把工具装配给**一次会话**的装配端——`ai1` 的 `harness` 形状（子形状 ⑤）。`public` 正是把**接口自己的**
 *  `buildTools` 声明挡在外面的那一下：契约不是路径。 */
const DECLARES_BUILD_TOOLS = /\bpublic\s+List<[^>]+>\s+buildTools\s*\(/
/** Is this source line a comment? A shape lives in code, not in prose about it. / 这一行是注释吗？形状长在代码里、不长在讲它的散文里。 */
const IS_COMMENT_LINE = /^\s*(\*|\/\/|\/\*)/

const javaFiles = []
const walk = (dir, tally) => {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, tally)
    else if (e.endsWith('.java')) {
      javaFiles.push(p)
      tally.count += 1
    }
  }
}
const ownScope = { scope: OWN, root: join(ROOT, OWN), count: 0 }
const harnessScope = { scope: AI1_HARNESS, root: join(ROOT, AI1_HARNESS), count: 0 }
walk(ownScope.root, ownScope)
walk(harnessScope.root, harnessScope)

// 射程的一半读不到任何 `.java`（目录不存在、路径写错、树是空的）：这与「读成空表」是同一件事 —— 下面每条判据
// 都会**空着成立**，于是一棵错误的检出会读成「全部已登记」。这不是通过，判读脚本自己读错了。真检出两半都有
// 文件；要撤掉一份树，必须同时改上面的射程，否则这里就是红。
// Half the scope reads no `.java` at all (a missing directory, a wrong path, an empty tree): that is the same
// thing as reading an empty list — every criterion below would hold vacuously, so a wrong checkout reads as
// "everything is declared". That is not a pass; this reader is what is wrong. A real checkout has files in
// both halves; to retire a tree, the scope above has to change with it, or this goes red.
const unreadable = [ownScope, harnessScope].filter((s) => s.count === 0)
if (unreadable.length > 0) {
  console.error('✗ 读不到受治理的源码 —— 空树 / 根缺失不是通过：')
  console.error('  cannot read the governed source — an empty tree or a missing root is not a pass:')
  for (const s of unreadable) {
    console.error(`    UNREADABLE  ${s.scope} (${s.root}) — 0 .java read`)
  }
  console.error('')
  console.error(`  ${unreadable.length} root(s) read nothing; every criterion would hold vacuously`)
  console.log(`${javaFiles.length} file(s) read / ${unreadable.length} root(s) unreadable`)
  process.exit(1)
}

/** The class a file primarily declares, as the check names it: the file's base name. */
const classNameOf = (file) => file.split(/[\\/]/).pop().replace(/\.java$/, '')
const pathOf = (file) => relative(ROOT, file).split('\\').join('/')

/** Does a `@Bean` method declare `AiTool` as its return type? Read as a declaration, like the sibling check. */
const declaresAiToolBean = (text) => {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    if (IS_COMMENT_LINE.test(lines[i]) || !/@Bean\b/.test(lines[i])) continue
    let decl = ''
    for (let j = i; j < lines.length && j < i + 15; j += 1) {
      decl += `${lines[j]}\n`
      if (/[{;]\s*$/.test(lines[j])) break
    }
    if (/\bAiTool\s+\w+\s*\(/.test(decl)) return true
  }
  return false
}

// The tool faces a person has enumerated by hand, as the catalogue declares them: `new ToolFace("X")`.
// 人手枚举出来的工具面，按目录声明它们的样子读：`new ToolFace("X")`。
let catalogueIds = []
try {
  catalogueIds = [...new Set([...readFileSync(join(ROOT, CATALOGUE), 'utf8')
    .matchAll(/new\s+ToolFace\(\s*"([^"]+)"\s*\)/g)].map((m) => m[1]))]
} catch {
  // Absent catalogue: every tool face becomes undeclared rather than silently passing. / 目录缺失：每个工具面都判未登记，
  // 而不是悄悄放行。
}

const declared = { module: [], tool: [], workflow: [], scheduledTask: [] }
const offenders = []
const seenCatalogue = new Set()

for (const file of javaFiles) {
  const text = readFileSync(file, 'utf8')
  const path = pathOf(file)
  const cls = classNameOf(file)
  const moduleNames = [...new Set([...text.matchAll(MODULE_SERVICE)].map((m) => m[1]))]

  // ---- module shape -------------------------------------------------------------------------------
  if (moduleNames.length > 1) {
    offenders.push(`${path} names more than one module (${moduleNames.join(', ')}) — a declaration ` +
      'carries one name; split the aspect or say which module it governs')
    continue
  }
  if (moduleNames.length === 1) {
    const module = moduleNames[0]
    if (!DECLARES_MODULE.test(text)) {
      offenders.push(`${path} governs \`${module}\` but does not implement GovernedModule — ` +
        'the registry cannot count what was never declared')
      continue
    }
    const name = MODULE_METHOD.exec(text)
    if (name === null) {
      offenders.push(`${path} implements GovernedModule but declares no name — ` +
        '`module()` has to return the module it governs')
      continue
    }
    if (name[1] !== module) {
      offenders.push(`${path} declares \`${name[1]}\` and its pointcuts name \`${module}\` — ` +
        'the set would be countable and wrong')
      continue
    }
    declared.module.push({ id: module, file: path })
    continue
  }
  // Declares itself a module but names no module's service — a declaration with nothing under it.
  if (DECLARES_MODULE.test(text)) {
    offenders.push(`${path} declares itself a GovernedModule but names no module's \`.service.\` ` +
      'pointcut — either point it at the module it governs, or drop the declaration')
    continue
  }

  // ---- tool shape ---------------------------------------------------------------------------------
  const toolShape = declaresAiToolBean(text) || IMPLEMENTS_AI_TOOL.test(text)
    || IMPLEMENTS_LOCAL_PROVIDER.test(text)
    || DECLARES_BUILD_TOOLS.test(text)
    || (/@Aspect\b/.test(text) && /@Around\b/.test(text) && !HAS_MODULE_SERVICE.test(text))
  if (!toolShape) continue

  // A tool face declares itself, or is listed in the hand-written catalogue. / 工具面自报，或在手写目录里被列出。
  const selfDeclared = DECLARES_PATH.test(text)
  if (selfDeclared && !/Kind\s*\.\s*TOOL/.test(text) && KIND_METHOD.test(text)) {
    offenders.push(`${path} declares itself a GovernedPath of kind ${KIND_METHOD.exec(text)[1]} ` +
      'but carries a tool shape — a tool face declares `Kind.TOOL`')
    continue
  }
  if (selfDeclared || catalogueIds.includes(cls)) {
    if (catalogueIds.includes(cls)) seenCatalogue.add(cls)
    declared.tool.push({ id: cls, file: path })
    continue
  }
  offenders.push(`${path} is a tool face but is not declared — a shape the AI reaches execution ` +
    'through, with nothing on the list that says so. Declare it (`implements GovernedPath`, `kind()` ' +
    '= `TOOL`) or list it in GovernedToolFaces.java')
}

// The catalogue read backwards: a listed name with no matching shape is a stale declaration. / 目录反读：列了名却
// 没有对应形状，是一条过期登记。
for (const id of catalogueIds) {
  if (!seenCatalogue.has(id)) {
    offenders.push(`GovernedToolFaces.java lists \`${id}\` but no file in the scope carries a tool ` +
      'shape under that name — a declaration with nothing under it reads like governance and is a ghost')
  }
}

const total = declared.module.length + declared.tool.length + declared.workflow.length
  + declared.scheduledTask.length

// 读到了文件、却一条路径也没读出来：同样是空输入（形状的判据读坏了、源码被整体换成空壳），不能让
// 「0 AI execution path(s) declared」读成绿。真宿主今天有 32 条 module 与 45 条 tool，0 恒为错。
// Files were read but not one path came out: empty input again (the shape criteria broke, or the sources were
// replaced by empty shells). "0 AI execution path(s) declared" must not read as green. The real host has 32
// modules and 45 tools today; zero is always wrong.
if (total === 0 && offenders.length === 0) {
  console.error('✗ 读到了文件，却没读出任何一条 AI 执行路径 —— 空读数不是通过：')
  console.error('  read files but not one AI execution path — an empty reading is not a pass:')
  console.error(`    UNREADABLE  ${javaFiles.length} .java under ${OWN} + ${AI1_HARNESS}, 0 path(s) declared`)
  console.error('')
  console.error('  the shapes, not the tree, are what needs fixing')
  console.log(`0 path(s) declared / ${javaFiles.length} file(s) read`)
  process.exit(1)
}

// ---- report, grouped by kind ---------------------------------------------------------------------
const line = (kind, id, file) => console.log(`  ${kind.padEnd(14)} ${id.padEnd(24)} ${file}`)
for (const m of declared.module.sort((a, b) => a.id.localeCompare(b.id))) line('module', m.id, m.file)
for (const t of declared.tool.sort((a, b) => a.id.localeCompare(b.id))) line('tool', t.id, t.file)
for (const w of declared.workflow) line('workflow', w.id, w.file)
for (const s of declared.scheduledTask) line('scheduled-task', s.id, s.file)
if (declared.workflow.length === 0) line('workflow', '(none)', '— no such path on this host today')
if (declared.scheduledTask.length === 0) line('scheduled-task', '(none)', '— none on this host today')

if (offenders.length > 0) {
  console.error()
  for (const o of offenders) console.error(`  UNDECLARED  ${o}`)
  console.error()
  console.error(`${offenders.length} path(s) would make the governed set incomplete, wrong or stale.`)
  console.log(`${total} ok / ${offenders.length} failed`)
  process.exit(1)
}

console.log(`\n${total} AI execution path(s) declared — ` +
  `${declared.module.length} module, ${declared.tool.length} tool, ` +
  `${declared.workflow.length} workflow, ${declared.scheduledTask.length} scheduled-task ` +
  `(${javaFiles.length} file(s) under ${OWN} + ${AI1_HARNESS})`)
console.log(`${total} ok / 0 failed`)
