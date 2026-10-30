#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 渲染出来的一行字里，不得有字面的 Markdown 记号。
//
//   node scripts/check-rendered-copy.mjs [UI 检出目录]
//
// 2026-10-25/26 实测：`**没有会话**`、`**本部署**`、`**声明返回类型**`、`**一个**` 这些**成对的星号**，
// 以及若干反引号，被原样画在中文页面上。字符串级抓不住它，因为**字符串本身是对的**：词条里写
// `{'@'}Bean` 是为了让 vue-i18n 不要把它当链接、渲染成 `@Bean`；写 `**x**` 也只是数据。记号是在
// **渲染那一刻**才变成读者眼前的字面的。故本闸门走两条真实的渲染路径：
//
//   1. 把每个 `src/locales/*.ts` 的默认导出交给 vue-i18n 的 `t()`（带占位符），断言渲出的每一个
//      词条里都没有 `**`、也没有反引号；
//   2. 把**这一层发布的**每个 `.vue`（覆盖目录 + 补丁改到的）的 `<template>` 交给
//      `@vue/compiler-sfc` + `@vue/compiler-dom` 解析，断言文本节点与静态属性值里没有同样两种记号
//      （HTML 注释不算 —— 源码注释里的强调是给维护者看的）；
//   3. 同一批模板里**算出来的**那部分同样在射程内：插值 `{{ … }}` 与 `v-bind` / `v-html` / `v-text`
//      的表达式，经 `@babel/parser`（`@vue/compiler-sfc` 自己的依赖）解析后，取其中的**字符串字面量与
//      模板字面量的静态片段**判红。`{{ '**' + t('x') }}`、`:title="\`**x**\`"` 这类写法在渲染那一刻才
//      产生记号，前两条路径都看不见它们 —— 2026-10-28 实测过：种进模板后本闸仍 exit 0。
//      边界（写明，不是缩小射程）：字面量之外**不求值**，由变量或函数调用在运行期拼出来的内容看不见。
//
// 它要一个 UI 检出（`target/yudao-ui-admin-vue3`，或第一个参数 / `KEELBASE_YUDAO_UI`），因为渲染需要
// 那个检出自带的 `vue-i18n` 与 Vue 编译器。缺检出时**退出 2**：不明说「跳过」，否则这个闸门会在没跑的
// 时候显示为绿。`scripts/build-host-ui.sh` 在构建之后调用它，故正常流水线里它总会跑。
//
// 解析看不见「算出来的」那一半（`{{ '*' + '*' }}`、`:title="a + '**' + b"`）；姊妹闸
// `scripts/check-rendered-components.mjs` 把同一份范围内的模板**真挂载**一遍，补的就是那一半。
//
// ── English ─────────────────────────────────────────────────────────────────────
//
// No rendered line of copy may carry a literal Markdown marker.
//
//   node scripts/check-rendered-copy.mjs [UI checkout]
//
// Measured on 2026-10-25/26: `**没有会话**`, `**本部署**`, `**声明返回类型**`, `**一个**` — **paired
// asterisks** — and several backticks were drawn literally on Chinese pages. A string-level scan cannot
// see it, because **the string itself is right**: `{'@'}Bean` is written that way so vue-i18n does not
// take it for a link and renders it as `@Bean`; `**x**` is just data too. The markers become literal
// text only **at render time**. So this gate takes two real rendering paths:
//
//   1. every `src/locales/*.ts` default export goes through vue-i18n's `t()` (with its placeholders),
//      and every rendered message must contain neither `**` nor a backtick;
//   2. every `.vue` **this layer ships** (overlay + patched) goes through `@vue/compiler-sfc` +
//      `@vue/compiler-dom`, and no text node or static attribute value may contain either marker (HTML
//      comments do not count — emphasis in a source comment is for the maintainer);
//   3. the **computed** half of those templates is in range too: the expressions behind `{{ … }}` and
//      `v-bind` / `v-html` / `v-text` are parsed with `@babel/parser` (a dependency of
//      `@vue/compiler-sfc` itself), and the string literals and static template-literal chunks they spell
//      out must carry no marker either. `{{ '**' + t('x') }}` and ``:title="`**x**`"`` produce their
//      markers only at render time, and paths 1 and 2 cannot see them — measured 2026-10-28: seeded into
//      a template, this gate still exited 0.
//      The boundary, stated rather than quietly shortened: nothing beyond literals is **evaluated**, so
//      copy a variable or a call assembles at runtime stays out of reach.
//
// It needs a UI checkout (`target/yudao-ui-admin-vue3`, or the first argument / `KEELBASE_YUDAO_UI`),
// because rendering needs that checkout's own `vue-i18n` and Vue compilers. A missing checkout **exits
// 2** rather than saying "skipped", so this gate cannot read as green when it never ran.
// `scripts/build-host-ui.sh` calls it after the build, so the normal pipeline always runs it.
//
// A parse cannot see the computed half (`{{ '*' + '*' }}`, `:title="a + '**' + b"`); its sibling
// `scripts/check-rendered-components.mjs` **mounts** the same templates, which is that half.
import { readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MARKERS, deltaVueFiles } from './rendered-copy-scope.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const UI = process.argv[2] || process.env.KEELBASE_YUDAO_UI || join(ROOT, 'target', 'yudao-ui-admin-vue3')

const missing = (what) => {
  console.error(`not run: ${what} is missing under ${UI}`)
  console.error('this gate renders through the checkout\'s own vue-i18n and Vue compilers; run it after')
  console.error('`bash scripts/build-host-ui.sh`, or pass the checkout as the first argument.')
  process.exit(2)
}

let vuePkg
try {
  vuePkg = realpathSync(join(UI, 'node_modules', 'vue', 'package.json'))
} catch {
  missing('node_modules/vue')
}
const requireFromUi = createRequire(pathToFileURL(vuePkg))
let sfc
let parseTemplate
let babel
let i18nModuleUrl
try {
  sfc = requireFromUi('@vue/compiler-sfc')
  parseTemplate = requireFromUi('@vue/compiler-dom').parse
  // `@babel/parser` 是 `@vue/compiler-sfc` 自己的直接依赖，故它随同一个安装进来 —— 不是额外的一项依赖。
  // `@babel/parser` is a direct dependency of `@vue/compiler-sfc`, so it arrives with the same install —
  // it is not one more thing to depend on.
  babel = requireFromUi('@babel/parser')
  i18nModuleUrl = pathToFileURL(realpathSync(join(UI, 'node_modules', 'vue-i18n', 'dist', 'vue-i18n.mjs'))).href
} catch (e) {
  missing(`the Vue toolchain (${e.message})`)
}
const { createI18n } = await import(i18nModuleUrl)

const violations = []
const note = (where, text, why) => violations.push({ where, text, why })

/** Every leaf string of a message tree, with the dotted key it sits under. */
function leaves(tree, prefix = '', out = []) {
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object') leaves(value, path, out)
    else if (typeof value === 'string') out.push([path, value])
  }
  return out
}

/** The named placeholders a message declares — `{'@'}` is an escape, not a placeholder. */
function placeholders(message) {
  const params = {}
  for (const match of message.matchAll(/\{([a-zA-Z_][\w]*)\}/g)) params[match[1]] = 'X'
  return params
}

function checkRendered(where, text, why) {
  const found = MARKERS.filter(([marker]) => text.includes(marker)).map(([marker, label]) => `${marker} — ${label}`)
  if (found.length > 0) note(where, text, `${why} [${found.join('; ')}]`)
}

/** 1. Locale messages, rendered the way the page renders them. */
function checkLocales() {
  const dir = join(UI, 'src', 'locales')
  let files
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.ts'))
  } catch {
    console.error(`no src/locales under ${UI} — the reader, not the checkout, is wrong`)
    process.exit(1)
  }

  let rendered = 0
  let renderedKeelbase = 0
  for (const file of files) {
    const locale = file.replace(/\.ts$/, '')
    const source = readFileSync(join(dir, file), 'utf8')
    const body = source.replace(/^\s*export\s+default\s*/, '')
    let messages
    try {
      // The locale files are `export default { … }` and nothing else — no imports, no type
      // annotations. Evaluated as data, then handed to vue-i18n so `{'@'}` and `{n}` are resolved
      // exactly as they are on the page.
      messages = new Function(`return (${body})`)()
    } catch (e) {
      console.error(`${relative(UI, join(dir, file))}: cannot read the message tree as data (${e.message})`)
      process.exit(1)
    }
    const i18n = createI18n({ legacy: false, locale, messages: { [locale]: messages } })
    for (const [key, message] of leaves(messages)) {
      let text
      try {
        text = i18n.global.t(key, placeholders(message))
      } catch (e) {
        note(`${file}:${key}`, String(e.message), 'vue-i18n could not render it')
        continue
      }
      rendered += 1
      if (key.startsWith('keelbase.')) renderedKeelbase += 1
      checkRendered(`${file}:${key}`, text, 'rendered locale copy carries a literal marker')
    }
  }
  console.log(`  rendered ${rendered} locale message(s) from ${files.length} locale file(s)`)
  // 一个 `keelbase.*` 都没有，说的是**这一层没铺上**，不是「拷贝干净」——判红，别让它空跑变绿。
  // Zero `keelbase.*` messages means **this layer is not laid down**, not that the copy is clean — red,
  // rather than a run that passes by scanning nothing.
  if (renderedKeelbase === 0) {
    console.error(`no keelbase.* message under ${UI}/src/locales — our delta is not laid down (rebuild without --skip-build)`)
    process.exit(1)
  }
}


/**
 * 表达式里**写死**的那几段字。只读源码，不求值：读者看到的字符串可以来自变量，那部分静态看不见。
 * 模板字面量的静态片段（`\`${n}**\`` 里的 `**`）算，它的定界符不算 —— 反引号在那里是语法，不是文本。
 *
 * The strings an expression **spells out**. The source is read, never evaluated: what a variable supplies
 * to the rendered string is beyond static reach. A template literal's static chunk counts (`**` in
 * `` `${n}**` ``); its delimiters do not — a backtick there is syntax, not copy.
 */
const LITERAL = {
  StringLiteral: (node) => node.value,
  TemplateElement: (node) => node.value.cooked ?? node.value.raw,
}
const SKIP_KEYS = new Set([
  'loc',
  'start',
  'end',
  'range',
  'extra',
  'errors',
  'comments',
  'leadingComments',
  'trailingComments',
  'innerComments',
])

function literalStrings(node, out = []) {
  if (!node || typeof node !== 'object') return out
  const take = LITERAL[node.type]
  if (take) {
    out.push(take(node))
    return out
  }
  for (const [key, value] of Object.entries(node)) {
    if (SKIP_KEYS.has(key)) continue
    if (Array.isArray(value)) for (const item of value) literalStrings(item, out)
    else if (value && typeof value === 'object') literalStrings(value, out)
  }
  return out
}

/** 读者会看到其值的指令：`v-bind`（含 `:`）、`v-html`、`v-text`。 / The directives whose value readers see. */
const RENDERED_DIRECTIVES = new Set(['bind', 'html', 'text'])

/** 2. Template text and static attribute values, through Vue's own parser. */
function checkTemplates() {
  const files = deltaVueFiles(ROOT, UI)
  let expressions = 0

  for (const file of files) {
    const rel = relative(UI, file).replace(/\\/g, '/')
    const { descriptor } = sfc.parse(readFileSync(file, 'utf8'))
    if (!descriptor.template) continue
    // 节点行号相对模板内容，而内容的第一行就是 `<template>` 所在行。
    // Node lines are relative to the template content, whose first line is the `<template>` line.
    const base = descriptor.template.loc.start.line
    let ast
    try {
      ast = parseTemplate(descriptor.template.content)
    } catch (e) {
      console.error(`${rel}: template does not parse (${e.message})`)
      violations.push({ where: rel, text: e.message, why: 'template does not parse' })
      continue
    }
    const at = (node) => `${rel}:${base + (node.loc?.start.line ?? 1) - 1}`

    const checkExpression = (node, source, kind) => {
      expressions += 1
      let tree
      try {
        tree = babel.parseExpression(source, { plugins: ['typescript'] })
      } catch (e) {
        // 读不出来的表达式不算干净，算**没被清过** —— 不许它悄悄从射程里掉出去。
        // An expression this gate cannot read is not clean, it is **uncleared** — it must not slip out of
        // range quietly.
        violations.push({ where: at(node), text: source, why: `a template expression the gate cannot read (${e.message})` })
        return
      }
      for (const text of literalStrings(tree)) {
        checkRendered(at(node), text, `${kind} builds a string that carries a literal marker`)
      }
    }

    const visit = (node) => {
      if (!node) return
      if (node.type === 2 /* TEXT */) checkRendered(at(node), node.content, 'template text carries a literal marker')
      if (node.type === 5 /* INTERPOLATION */) checkExpression(node, node.content.content, 'an interpolation')
      if (node.type === 1 /* ELEMENT */) {
        for (const prop of node.props ?? []) {
          if (prop.type === 6 /* static attribute */ && prop.value?.type === 2) {
            checkRendered(at(prop.value), prop.value.content, 'a static attribute value carries a literal marker')
          }
          if (prop.type === 7 /* DIRECTIVE */ && prop.exp?.type === 4 && RENDERED_DIRECTIVES.has(prop.name)) {
            checkExpression(prop, prop.exp.content, `a v-${prop.name} value`)
          }
        }
      }
      for (const child of node.children ?? []) visit(child)
    }
    visit(ast)
  }
  console.log(`  scanned ${files.length} .vue template(s) this layer ships, ${expressions} expression(s) in them`)
}

checkLocales()
checkTemplates()

if (violations.length > 0) {
  console.error(`\n${violations.length} rendered line(s) carry a literal Markdown marker:\n`)
  for (const v of violations) {
    console.error(`  ${v.where}`)
    console.error(`    ${v.text.trim().slice(0, 200)}`)
    console.error(`    ${v.why}`)
  }
  console.error('\nWrite the emphasis in the template/component that renders it, or drop it — a reader')
  console.error('must never see the markers themselves.')
  process.exit(1)
}

console.log('\n0 rendered line(s) carry a literal `**` or backtick.')
