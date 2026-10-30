// SPDX-License-Identifier: Apache-2.0
//
// 挂载级闸门要看得见**在渲染那一刻拼出来**的记号，而解析级的那道看不见：`{{ '*' + '*' }}` 的两个字面量
// 各自都不带 `**`，逐字面量判红的表达式层因此放过它，挂载求值之后才成为 `**`。2026-10-29 实测：同一处种子，
// `check-rendered-copy.mjs` exit 0，`check-rendered-components.mjs` exit 1 并点名文件。
//
// 这条测试驱动的是**挂载闸门本身**（不是它里面的某个函数）：临时目录里搭一份只够它跑的 UI 样子 —— 符号链接
// 过去的 `node_modules`、铺好的两份词条、这一层发布的那些 `.vue` —— 然后种一个只有挂载才看得见的记号，看
// 两道闸各自怎么答。它同时守住「桩层坏掉时不许假绿」：若桩把模板渲染空了，那条种子就红不起来，这条测试随之红。
//
// 它要一个**铺好增量**的 UI 检出（`target/yudao-ui-admin-vue3`，或 `KEELBASE_YUDAO_UI`）：闸门要用那里的
// Vue 运行时与工具链。没有检出时这条测试**红**并直说要跑哪条命令 —— 不悄悄跳过。
//
//    node --test scripts/rendered-copy-components.test.mjs
//
// ── English ─────────────────────────────────────────────────────────────────────
//
// The mount-level gate has to see a marker **composed at render time**, which the parse-level one cannot:
// the two literals in `{{ '*' + '*' }}` each carry no `**`, so the expression layer — which judges each
// literal on its own — lets it through, and only a mount evaluates it into `**`. Measured 2026-10-29: on the
// same seed, `check-rendered-copy.mjs` exits 0 and `check-rendered-components.mjs` exits 1, naming the file.
//
// This test drives **the mount gate itself** (not a function inside it): in a temp directory it builds just
// enough of a UI for the gate — `node_modules` linked in, the two laid-down bundles, the `.vue` files this
// layer ships — then seeds a marker only a mount can see and reads how each gate answers. It also keeps
// "a broken stub layer must not read green": if the stubs render every template empty, the seed can no
// longer go red, and this test goes red with it.
//
// It needs a UI checkout **with the delta laid down** (`target/yudao-ui-admin-vue3`, or
// `KEELBASE_YUDAO_UI`): the gate needs that checkout's Vue runtime and toolchain. With no checkout this test
// goes **red** and names the command to run — never a quiet skip.
import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MOUNT_GATE = join(ROOT, 'scripts', 'check-rendered-components.mjs')
const PARSE_GATE = join(ROOT, 'scripts', 'check-rendered-copy.mjs')

/**
 * 检出位置与闸门同一顺序（`KEELBASE_YUDAO_UI` → `<repo>/target/…`），多一步：在**工作树**里 `target/` 通常
 * 空着 —— 真正铺过增量的是主检出，`git worktree list` 的第一行就是它。这一步只挪默认值，测试的判据不变。
 */
function defaultUi() {
  const local = join(ROOT, 'target', 'yudao-ui-admin-vue3')
  if (existsSync(join(local, 'node_modules'))) return local
  const listed = spawnSync('git', ['-C', ROOT, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' })
  const primary = listed.status === 0 ? /^worktree (.+)$/m.exec(listed.stdout)?.[1] : null
  return primary ? join(primary, 'target', 'yudao-ui-admin-vue3') : local
}

// 必须是绝对路径：临时目录里的 `node_modules` 是符号链接，相对目标会相对**链接所在目录**去解析。 / It
// has to be absolute: the fixture's `node_modules` is a symlink, and a relative target resolves against the
// **link's own** directory.
const UI = resolve(process.env.KEELBASE_YUDAO_UI || defaultUi())

/** 这一层发布的每个 `.vue`，相对检出根 —— 与闸门自己的枚举同形。 / Every `.vue` this layer ships. */
function deltaVueFiles() {
  const files = new Set()
  const overlay = join(ROOT, 'keelbase-ui', 'host-overlay')
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else if (entry.endsWith('.vue')) files.add(relative(overlay, path))
    }
  }
  walk(overlay)
  const patches = join(ROOT, 'keelbase-ui', 'host-patches')
  for (const patch of readdirSync(patches).filter((f) => f.endsWith('.patch'))) {
    for (const line of readFileSync(join(patches, patch), 'utf8').split('\n')) {
      const match = /^\+\+\+ b\/(.+\.vue)\r?$/.exec(line)
      if (match) files.add(match[1])
    }
  }
  return [...files]
}

/** 搭一份两道闸都跑得动的 UI 样子。 / Build enough of a UI for both gates to run. */
function buildFixture() {
  const fixture = mkdtempSync(join(tmpdir(), 'rendered-copy-mount-'))
  symlinkSync(join(UI, 'node_modules'), join(fixture, 'node_modules'), 'junction')

  const locales = join(UI, 'src', 'locales')
  cpSync(locales, join(fixture, 'src', 'locales'), { recursive: true, filter: (p) => p === locales || p.endsWith('.ts') })

  const files = deltaVueFiles()
  for (const rel of files) {
    mkdirSync(dirname(join(fixture, rel)), { recursive: true })
    cpSync(join(UI, rel), join(fixture, rel))
  }
  return { fixture, files }
}

function run(gate, fixture) {
  const result = spawnSync(process.execPath, [gate, fixture], { encoding: 'utf8' })
  return { code: result.status, output: `${result.stdout}${result.stderr}` }
}

let fixture = null

test('the checked-out tree is arranged the way this test needs it', () => {
  try {
    // 与闸门同一处解析：从 `<UI>/node_modules/vue/package.json` 起（pnpm 与扁平两种布局都能过）。
    // Resolve the way the gate does: from `<UI>/node_modules/vue/package.json` (both pnpm and flat layouts).
    const requireFromUi = createRequire(pathToFileURL(realpathSync(join(UI, 'node_modules', 'vue', 'package.json'))))
    for (const name of ['vue', 'vue-i18n', '@vue/compiler-sfc', '@vue/compiler-dom']) requireFromUi.resolve(name)
  } catch {
    assert.fail(
      `no Vue runtime/toolchain under ${UI} — the mount gate resolves vue, vue-i18n and the Vue compilers ` +
        'from there. Run `bash scripts/build-host-ui.sh` (or pass KEELBASE_YUDAO_UI=<checkout>) and re-run.',
    )
  }
  const missing = deltaVueFiles().filter((rel) => {
    try {
      statSync(join(UI, rel))
      return false
    } catch {
      return true
    }
  })
  assert.deepEqual(missing, [], 'the delta is not laid down in the checkout — run `bash scripts/build-host-ui.sh`')
})

test('a marker only a mount can see: parse green, mount red and naming the file', (t) => {
  const built = buildFixture()
  fixture = built.fixture
  t.after(() => {
    if (fixture) rmSync(fixture, { recursive: true, force: true })
  })

  const clean = run(MOUNT_GATE, fixture)
  assert.equal(clean.code, 0, `the unmodified fixture must be green under a mount:\n${clean.output}`)
  // 桩层若把每个模板都渲染空，下面那条种子就红不起来 —— 用「至少真的挂载过」把这条退路堵掉。
  // If the stub layer rendered every template empty, the seed below could not go red — close that escape by
  // requiring that something was really mounted.
  assert.match(clean.output, /mounted [1-9]\d* template rendering/, `the gate must mount something:\n${clean.output}`)

  const seeded = [...built.files].sort().find((rel) => readFileSync(join(fixture, rel), 'utf8').includes('<template'))
  assert.ok(seeded, 'some .vue this layer ships has a <template>')
  const original = readFileSync(join(fixture, seeded), 'utf8')
  const open = original.indexOf('<template')
  const end = original.slice(open).indexOf('>')
  const at = open + end + 1
  writeFileSync(join(fixture, seeded), `${original.slice(0, at)}\n  <div>{{ '*' + '*' }}</div>${original.slice(at)}`)

  try {
    const parse = run(PARSE_GATE, fixture)
    assert.equal(parse.code, 0, `the parse gate has no literal \`**\` to see here and must stay green:\n${parse.output}`)

    const mount = run(MOUNT_GATE, fixture)
    assert.equal(mount.code, 1, `the mount gate must go red on a composed marker:\n${mount.output}`)
    assert.ok(
      mount.output.replace(/\\/g, '/').includes(seeded.replace(/\\/g, '/')),
      `the mount gate must name ${seeded}:\n${mount.output}`,
    )
  } finally {
    writeFileSync(join(fixture, seeded), original)
  }

  const restored = run(MOUNT_GATE, fixture)
  assert.equal(restored.code, 0, `restoring the template must return the gate to green:\n${restored.output}`)
})
