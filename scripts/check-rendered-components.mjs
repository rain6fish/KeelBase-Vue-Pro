#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 把这一层发布的每个模板**真挂载**一遍，断言渲染出来的文本与属性值里没有字面的 Markdown 记号。
//
//   node scripts/check-rendered-components.mjs [UI 检出目录]
//
// 姊妹闸 `check-rendered-copy.mjs` 走的是**解析**：文本节点与静态属性值。解析看不见「算出来的」那一半
// ——`{{ '*' + '*' }}`、`:title="a + '**' + b"`、把两条词条拼起来再加一个记号。这里把每个 `<template>`
// 用 Vue 自己的编译器编成 render 函数，再用 Vue 自己的运行时**挂载**一次：表达式被真求值，渲染出的每段
// 文本与每个字符串属性值都过一遍同样的记号断言。作用域与姊妹闸同一份（`rendered-copy-scope.mjs`）。
//
// 挂载需要一个上下文。`t` / `$t` 来自检出自己的 vue-i18n（与页面同一套词条）；模板里的其余标识符是
// **桩**——它们只决定模板的结构，值不是这次断言的主语。未解析的组件（Element Plus、应用自己的组件）用
// 一个渲染插槽的桩顶上，故 `v-slot="{ row }"` 里的文案也会被渲染出来；`<transition>` / `<teleport>`
// 之类由 runtime-dom 驱动、需要真 DOM 的内建组件改成直通。DOM 不需要：节点收进内存树。
//
// 边界**写明**：`<script setup>` / `<script>` 不执行，故由脚本常量或函数算出来的记号看不见；接口返回的
// 数据里的记号也看不见。这两半要真数据，属于端到端走查，不在这里。缺检出或工具链时**退出 2**，与姊妹闸
// 同一个口径。模板编不出来或挂载抛错，是**这道闸自己**要扩，不是文案要改——所以它红，并明说这一点。
//
// ── English ─────────────────────────────────────────────────────────────────────────────────────
//
// Mount every template this layer ships, for real, and assert the rendered text and attribute values
// carry no literal Markdown marker.
//
//   node scripts/check-rendered-components.mjs [UI checkout]
//
// The sibling gate `check-rendered-copy.mjs` works on the **parse**: text nodes and static attribute
// values. A parse cannot see the computed half — `{{ '*' + '*' }}`, `:title="a + '**' + b"`, two
// messages joined with a marker. This gate compiles each `<template>` with Vue's own compiler and
// **mounts** it once with Vue's own runtime: expressions are really evaluated, and every rendered text
// and string attribute value goes through the same marker assertion. The scope is the same one
// (`rendered-copy-scope.mjs`).
//
// Mounting needs a context. `t` / `$t` come from the checkout's own vue-i18n (the same messages the
// page uses); every other identifier in the template is a **stub** — it decides the template's
// structure, and its value is not what this assertion is about. Unresolved components (Element Plus,
// the app's own) are replaced by a stub that renders their slots, so copy inside `v-slot="{ row }"` is
// rendered too; runtime-dom-driven built-ins (`<transition>`, `<teleport>`) are rendered through
// instead. No DOM is needed: nodes are collected into an in-memory tree.
//
// The boundary is **stated**: `<script setup>` / `<script>` is not executed, so a marker produced by a
// script constant or function is invisible, as is one coming from API data. Both need real data and
// belong to a walk-through, not to this gate. A missing checkout or toolchain **exits 2**, the same
// contract as its sibling. A template that cannot be compiled or mounted is **this gate** needing an
// extension, not the copy needing a fix — so it is red, and says exactly that.
import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire, stripTypeScriptTypes } from 'node:module'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MARKERS, deltaVueFiles } from './rendered-copy-scope.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const UI = process.argv[2] || process.env.KEELBASE_YUDAO_UI || join(ROOT, 'target', 'yudao-ui-admin-vue3')

const missing = (what) => {
  console.error(`not run: ${what} is missing under ${UI}`)
  console.error('mounting renders through the checkout\'s own Vue and vue-i18n; run it after')
  console.error('`bash scripts/build-host-ui.sh`, or pass the checkout as the first argument.')
  process.exit(2)
}

if (typeof stripTypeScriptTypes !== 'function') {
  console.error('not run: node:module.stripTypeScriptTypes is unavailable — this gate needs Node 22.13 or newer')
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
let compileTemplate
let vue
let i18nUrl
try {
  sfc = requireFromUi('@vue/compiler-sfc')
  compileTemplate = requireFromUi('@vue/compiler-dom').compile
  // The dev build's warning formatter trips over synthetic trees (it calls `.toString()` on a null
  // component trace); warnings say nothing this gate needs, so load the production build.
  process.env.NODE_ENV = 'production'
  vue = requireFromUi('vue')
  i18nUrl = pathToFileURL(realpathSync(join(UI, 'node_modules', 'vue-i18n', 'dist', 'vue-i18n.mjs'))).href
} catch (e) {
  missing(`the Vue toolchain (${e.message})`)
}
// Compile-time flags the bundler normally substitutes. With NODE_ENV=production the ESM builds read
// them outright, so Node needs them defined (the documented shape for running those builds outside a
// bundler). They only select warning/devtools branches this gate does not use.
globalThis.__VUE_OPTIONS_API__ = true
globalThis.__VUE_PROD_DEVTOOLS__ = false
globalThis.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = false
const { createI18n } = await import(i18nUrl)
const { createRenderer, h, Fragment } = vue

// Node prints a one-line ExperimentalWarning the first time the type stripper runs; this gate's output
// is its readings, so that one notice is filtered out rather than left among them.
function stripTypes (code) {
  const original = process.emitWarning
  process.emitWarning = (warning, ...rest) => {
    const text = typeof warning === 'string' ? warning : warning?.message ?? ''
    if (text.includes('stripTypeScriptTypes')) return
    return original.call(process, warning, ...rest)
  }
  try {
    return stripTypeScriptTypes(code)
  } finally {
    process.emitWarning = original
  }
}

/**
 * 模块模式的产物（无 `with`）改成可直接 `new Function` 的函数体。两个必要的改写：那一行 `import { … }
 * from "vue"` 变成从传进来的 `Vue` 解构（于是未解析组件、直通内建都能被换掉），`export function render`
 * 去掉 `export`。三个模板在表达式里写了 TypeScript（`(p: X) =>`），编译器把它原样留在产物里，故再过
 * 一道 `stripTypeScriptTypes`——这正是用模块模式的原因：`with` 那一档停在「符号全变 any」，直接拒绝。
 *
 * The module-mode output (no `with`) becomes a function body `new Function` can take. Two rewrites are
 * needed: the `import { … } from "vue"` line becomes a destructuring from the `Vue` passed in (which is
 * how unresolved components and pass-through built-ins get swapped), and `export function render`
 * loses its `export`. Three templates carry TypeScript in expressions (`(p: X) =>`), which the compiler
 * leaves in the output verbatim, so it goes through `stripTypeScriptTypes` — that is why module mode:
 * the `with` variant stops with "all symbols in a 'with' block will have type 'any'".
 */
function toRenderFunction (code) {
  const body = code
    .replace(/^import\s*\{([\s\S]*?)\}\s*from\s*["']vue["'];?\s*$/m, (_, names) => `const { ${names.replace(/\bas\b/g, ':')} } = Vue;`)
    .replace(/^export\s+function\s+render/m, 'function render')
  return new Function('Vue', `${stripTypes(body)}\nreturn render;\n`)
}

/** A value that satisfies whatever the template does with it and renders as nothing. */
function makeStub () {
  const handler = {
    get: (target, key) => {
      if (typeof key === 'symbol') {
        if (key === Symbol.iterator) return function * () { yield stub }
        if (key === Symbol.toPrimitive) return () => ''
        if (key === Symbol.toStringTag) return 'Stub'
        return undefined
      }
      if (key.startsWith('__v_')) return undefined
      if (key === 'toString' || key === 'valueOf') return () => ''
      if (key === 'length') return 1
      if (key === 'then' || key === 'catch' || key === 'finally') return undefined
      return stub
    },
    apply: () => stub,
    construct: () => stub,
    set: () => true,
  }
  const stub = new Proxy(function () {}, handler)
  return stub
}

// Identifiers the mount context must not fake: Vue reads them to decide what kind of value setup()
// returned; `_`-prefixed names are the compiler's own locals and must resolve outside the context.
const RESERVED = new Set([
  'then', 'catch', 'finally', '__isScriptSetup', '__v_isRef', '__v_isReactive', '__v_isReadonly',
  '__v_raw', '__v_skip', Symbol.unscopables,
])
const claimed = (key) => typeof key === 'string' && !key.startsWith('_') && !RESERVED.has(key)

/** The template's context: real translations, stubs for everything else. */
function contextFor (i18n) {
  const stubs = new Map()
  const stubFor = (key) => {
    if (!stubs.has(key)) stubs.set(key, makeStub())
    return stubs.get(key)
  }
  const base = {
    t: i18n.global.t,
    te: i18n.global.te,
    tm: i18n.global.tm,
    rt: (message) => message,
    $t: i18n.global.t,
    $te: i18n.global.te,
    $tm: i18n.global.tm,
    $rt: (message) => message,
    $d: i18n.global.d,
    $n: i18n.global.n,
  }
  return new Proxy(base, {
    get: (target, key) => (claimed(key) ? (key in target ? target[key] : stubFor(String(key))) : undefined),
    has: (target, key) => claimed(key),
    getOwnPropertyDescriptor: (target, key) => {
      if (key in target) return Object.getOwnPropertyDescriptor(target, key)
      return claimed(key) ? { configurable: true, enumerable: true, writable: true, value: stubFor(String(key)) } : undefined
    },
  })
}

// Unresolved components would render nothing, taking their slots — where most page copy lives — with
// them. This renders every slot against a stub object so `v-slot="{ row }"` destructures.
const SlotStub = {
  name: 'Stub',
  inheritAttrs: false,
  render () {
    const props = makeStub()
    const children = Object.values(this.$slots)
      .filter((slot) => typeof slot === 'function')
      .map((slot) => slot(props))
    return h(Fragment, null, children)
  },
}
const PassThrough = {
  name: 'PassThrough',
  inheritAttrs: false,
  render () { return this.$slots.default ? this.$slots.default() : null },
}
const vueForCompiled = new Proxy(vue, {
  get: (target, key) => {
    if (key === 'resolveComponent' || key === 'resolveDynamicComponent') return () => SlotStub
    if (key === 'Transition' || key === 'TransitionGroup' || key === 'KeepAlive' || key === 'Teleport' || key === 'Suspense') return PassThrough
    return target[key]
  },
})

/** An in-memory renderer: every string that reaches a text node or a property value is collected. */
function makeNodeOps (collected) {
  return {
    createElement: (tag) => ({
      tag,
      children: [],
      props: {},
      style: {},
      classList: { add () {}, remove () {}, contains () { return false } },
      addEventListener () {},
      removeEventListener () {},
      setAttribute () {},
      removeAttribute () {},
    }),
    createText: (text) => { collected.push(text); return { text } },
    createComment: () => ({}),
    setText: (node, text) => { node.text = text; collected.push(text) },
    setElementText: (element, text) => { element.children = [{ text }]; collected.push(text) },
    insert: (child, parent, anchor) => {
      child.parent = parent
      if (!parent.children) parent.children = []
      const index = anchor ? parent.children.indexOf(anchor) : -1
      if (index < 0) parent.children.push(child)
      else parent.children.splice(index, 0, child)
    },
    remove: () => {},
    parentNode: (node) => node.parent ?? null,
    nextSibling: (node) => {
      const parent = node.parent
      if (!parent?.children) return null
      return parent.children[parent.children.indexOf(node) + 1] ?? null
    },
    patchProp: (element, key, previous, next) => {
      element.props[key] = next
      if (typeof next === 'string') collected.push(next)
    },
    setScopeId: () => {},
    cloneNode: (node) => ({ ...node }),
    insertStaticContent: () => [{ children: [] }, { children: [] }],
  }
}

function mountOnce (render, locale, messages) {
  const collected = []
  const i18n = createI18n({ legacy: false, locale, messages: { [locale]: messages } })
  const renderer = createRenderer(makeNodeOps(collected))
  const app = renderer.createApp({ render, setup () { return contextFor(i18n) } })
  app.config.warnHandler = () => {}
  app.use(i18n)
  app.mount({ tag: 'root', children: [], props: {} })
  return collected
}

const localeDir = join(UI, 'src', 'locales')
let localeFiles
try {
  localeFiles = readdirSync(localeDir).filter((file) => file.endsWith('.ts'))
} catch {
  console.error(`no src/locales under ${UI} — the reader, not the checkout, is wrong`)
  process.exit(1)
}
const locales = {}
for (const file of localeFiles) {
  const locale = file.replace(/\.ts$/, '')
  const body = readFileSync(join(localeDir, file), 'utf8').replace(/^\s*export\s+default\s*/, '')
  try {
    locales[locale] = new Function(`return (${body})`)()
  } catch (e) {
    console.error(`${relative(UI, join(localeDir, file))}: cannot read the message tree as data (${e.message})`)
    process.exit(1)
  }
}

const violations = []
const files = deltaVueFiles(ROOT, UI)
let mounted = 0
let silent = 0

for (const file of files) {
  const where = relative(UI, file)
  if (!existsSync(file)) {
    console.error(`${where}: not in the checkout — our delta is not laid down (rebuild without --skip-build)`)
    process.exit(1)
  }
  const { descriptor } = sfc.parse(readFileSync(file, 'utf8'))
  if (!descriptor.template) continue

  let render
  try {
    const { code } = compileTemplate(descriptor.template.content, {
      mode: 'module',
      prefixIdentifiers: true,
      expressionPlugins: ['typescript'],
    })
    render = toRenderFunction(code)(vueForCompiled)
  } catch (e) {
    violations.push({
      where,
      text: String(e.message).slice(0, 200),
      why: 'this template could not be compiled for a mount — this gate needs extending, not the copy',
    })
    continue
  }

  for (const [locale, messages] of Object.entries(locales)) {
    let rendered
    try {
      rendered = mountOnce(render, locale, messages)
    } catch (e) {
      violations.push({
        where: `${where}@${locale}`,
        text: String(e.message).slice(0, 200),
        why: 'the mount threw under stubs — this gate needs extending, not the copy',
      })
      continue
    }
    mounted += 1
    if (rendered.join('').trim() === '') silent += 1
    for (const text of new Set(rendered)) {
      const found = MARKERS.filter(([marker]) => text.includes(marker)).map(([marker, label]) => `${marker} — ${label}`)
      if (found.length > 0) {
        violations.push({
          where: `${where}@${locale}`,
          text,
          why: `a mounted template rendered a literal marker [${found.join('; ')}]`,
        })
      }
    }
  }
}

if (mounted === 0) {
  console.error(`mounted no template under ${UI} — this gate did not run`)
  process.exit(1)
}
console.log(`  mounted ${mounted} template rendering(s) from ${files.length} file(s) × ${Object.keys(locales).length} locale(s)`)
if (silent > 0) {
  console.log(`  ${silent} of them rendered no text under stubs (icon/image-only, or data-empty by construction)`)
}

if (violations.length > 0) {
  console.error(`\n${violations.length} mounted template(s) carry a literal Markdown marker or could not be mounted:\n`)
  for (const violation of violations) {
    console.error(`  ${violation.where}`)
    console.error(`    ${violation.text.trim().slice(0, 200)}`)
    console.error(`    ${violation.why}`)
  }
  console.error('\nWrite the emphasis in the template/component that renders it, or drop it — a reader')
  console.error('must never see the markers themselves.')
  process.exit(1)
}

console.log('\n0 mounted template renders a literal `**` or backtick.')
