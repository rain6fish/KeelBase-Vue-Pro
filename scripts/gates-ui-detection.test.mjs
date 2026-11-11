// SPDX-License-Identifier: Apache-2.0
//
// `detectUi()` 要在**两种安装布局**下都判得准：CI 的平铺布局，与 `build-host-ui.sh` 的 pnpm 布局。
//
// 2026-11-11 实测：按 `build-host-ui.sh` 铺好检出后，`node scripts/gates.mjs` 仍把四道渲染门判 SKIP，
// 理由是「node_modules 里没有 @vue/compiler-sfc、@vue/compiler-dom」。原因是前置检测查**顶层**
// `node_modules/@vue/…`，而 pnpm 只把直接依赖放在顶层；`@vue/compiler-*` 是 `vue` 的传递依赖，只存在于
// `node_modules/.pnpm/<pkg>@<ver>/node_modules/@vue/…`。两道闸门本身从那处解析（`createRequire`
// 起于 `<UI>/node_modules/vue/package.json`），故它们能跑、且当时全绿 —— 错的只是这条前置判断。
//
// 这四条用例把形状钉住：pnpm 布局要判 ok（旧实现在这里判 false）；平铺布局要判 ok；真正缺一个工具包时
// 要判 false 并**点名**它；缺 `vue` 本身时也要判 false。夹具是临时目录，不碰网络、不碰真检出。
//
// ── English ─────────────────────────────────────────────────────────────────────────────────────
//
// `detectUi()` has to read two install layouts correctly: CI's flat one and `build-host-ui.sh`'s pnpm one.
//
// Measured 2026-11-11: with the checkout laid down by `build-host-ui.sh`, `node scripts/gates.mjs` still
// reported all four render gates SKIP — "no @vue/compiler-sfc, @vue/compiler-dom in node_modules" — because
// the prerequisite check looked at the **top-level** `node_modules/@vue/…`, while pnpm puts only direct
// dependencies there; `@vue/compiler-*` are transitive via `vue` and live under
// `node_modules/.pnpm/<pkg>@<ver>/node_modules/@vue/…`. The gates themselves resolve from that place
// (`createRequire` rooted at `<UI>/node_modules/vue/package.json`), so they ran, and were green — only the
// prerequisite reading was wrong.
//
// These four cases pin the shapes down: the pnpm layout must read ok (the old implementation said false),
// the flat layout must read ok, a genuinely missing toolchain package must read false **and be named**, and
// a missing `vue` itself must read false. The fixtures are temp directories; no network, no real checkout.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { detectUi } from './gates.mjs'

const writePkg = (dir, name, extra = {}) => {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '0.0.0', main: 'index.js', ...extra }))
  writeFileSync(join(dir, 'index.js'), 'module.exports = {}\n')
}

/** A checkout shaped the way pnpm lays one down: direct deps linked at the top, the rest in `.pnpm`. */
function pnpmFixture() {
  const root = mkdtempSync(join(tmpdir(), 'gates-ui-pnpm-'))
  const store = join(root, '.pnpm', 'vue@3.5.34', 'node_modules')
  writePkg(join(store, 'vue'), 'vue')
  for (const p of ['compiler-sfc', 'compiler-dom']) writePkg(join(store, '@vue', p), `@vue/${p}`)
  writePkg(join(store, '@babel', 'parser'), '@babel/parser')

  mkdirSync(join(root, 'node_modules'), { recursive: true })
  symlinkSync(join(store, 'vue'), join(root, 'node_modules', 'vue'), 'junction')
  writePkg(join(root, 'node_modules', 'vue-i18n'), 'vue-i18n')
  mkdirSync(join(root, 'node_modules', 'vue-i18n', 'dist'), { recursive: true })
  writeFileSync(join(root, 'node_modules', 'vue-i18n', 'dist', 'vue-i18n.mjs'), 'export const createI18n = () => {}\n')
  return root
}

/** A checkout shaped the way CI lays one down: everything the gates need, flat at the top. */
function flatFixture() {
  const root = mkdtempSync(join(tmpdir(), 'gates-ui-flat-'))
  for (const p of ['vue', 'vue-i18n']) writePkg(join(root, 'node_modules', p), p)
  for (const p of ['compiler-sfc', 'compiler-dom']) writePkg(join(root, 'node_modules', '@vue', p), `@vue/${p}`)
  writePkg(join(root, 'node_modules', '@babel', 'parser'), '@babel/parser')
  return root
}

test('a pnpm checkout is ready even though the toolchain sits under .pnpm', () => {
  const root = pnpmFixture()
  try {
    // 形状先行：这个夹具的顶层确实没有 `@vue/` —— 旧实现就是在这里判死的。
    // Shape first: this fixture really has no top-level `@vue/` — exactly where the old check failed.
    assert.equal(existsSync(join(root, 'node_modules', '@vue')), false)
    const result = detectUi(root)
    assert.equal(result.ok, true, result.detail)
    assert.equal(result.dir, root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a flat checkout (the CI shape) is ready', () => {
  const root = flatFixture()
  try {
    assert.equal(detectUi(root).ok, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a missing toolchain package is named, not guessed at', () => {
  const root = pnpmFixture()
  try {
    rmSync(join(root, '.pnpm', 'vue@3.5.34', 'node_modules', '@vue', 'compiler-dom'), { recursive: true, force: true })
    const result = detectUi(root)
    assert.equal(result.ok, false)
    assert.match(result.detail, /@vue\/compiler-dom/)
    assert.doesNotMatch(result.detail, /vue-i18n|compiler-sfc/, result.detail)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a checkout with no vue is not ready', () => {
  const root = mkdtempSync(join(tmpdir(), 'gates-ui-novue-'))
  try {
    writePkg(join(root, 'node_modules', 'vue-i18n'), 'vue-i18n')
    const result = detectUi(root)
    assert.equal(result.ok, false)
    assert.match(result.detail, /vue(,|$)/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
