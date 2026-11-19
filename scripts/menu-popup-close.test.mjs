// SPDX-License-Identifier: Apache-2.0
//
// 折叠侧栏里的治理子菜单是一个 teleport 到 `body` 的 popper。2026-11-11 第六位读者复验（D-5）在
// Qoder 内嵌浏览器里遇到它弹出后不收、压住筛选区；标准 Chrome（Playwright）复核当时没有复现，是因为
// 那次复核用的是展开的侧栏。本仓的标准 Chrome 复现读数（2026-11-11，1440/900 折叠侧栏、700 窄屏）：
//
//   hover 后浮层可见 → Esc 后仍可见 → 不移动指针的点击外部后仍可见 → （<768 时）重载后仍可见
//
// 成因在 Element Plus：折叠的垂直子菜单只在 `mouseleave` 时收起（`sub-menu.mjs` 的
// `handleMouseleave`），`closeOnClickOutside` 默认关闭，Esc 没有处理；`defaultOpeneds` 还会在载入时
// 自动展开当前路由的父级。于是不派发 `mouseleave` 的环境里，浮层没有第二条关闭路径。
//
// 这条测试钉住补丁里的三条关闭路径（Esc、外部 pointerdown、路由切换）与「折叠时不自动展开」。
// 运行：node --test scripts/menu-popup-close.test.mjs
//
// A collapsed sidebar's submenu is a popper teleported to `body`. The sixth reader's recheck
// (D-5, 2026-11-11) saw it stay open over the filter area in Qoder's embedded browser; the standard
// Chrome review then did not reproduce it because that review used an expanded sidebar. Our standard
// Chrome readings (2026-11-11, collapsed sidebar at 1440/900, narrow at 700): visible after hover →
// still visible after Escape → still visible after a click elsewhere that does not move the pointer →
// (<768) still visible after a reload.
//
// The cause is in Element Plus: a collapsed vertical submenu closes only on `mouseleave` (see
// `handleMouseleave` in `sub-menu.mjs`), `closeOnClickOutside` is off by default, Escape is unhandled,
// and `defaultOpeneds` auto-opens the active route's parent on load. An environment that does not
// deliver `mouseleave` therefore has no second way out. This test pins the patch's three close paths
// (Escape, outside pointerdown, route change) and "do not auto-open while collapsed".
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PATCH = 'keelbase-ui/host-patches/0007-menu-popup-close.patch'
const patch = readFileSync(join(ROOT, PATCH), 'utf8')
const added = patch
  .split('\n')
  .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
  .map((line) => line.slice(1))
  .join('\n')

test('the patch edits the menu component and only the menu component', () => {
  assert.match(patch, /^diff --git a\/src\/layout\/components\/Menu\/src\/Menu\.vue b\/src\/layout\/components\/Menu\/src\/Menu\.vue$/m)
  const files = [...patch.matchAll(/^diff --git a\/(.+?) b\//gm)].map((m) => m[1])
  assert.deepEqual(files, ['src/layout/components/Menu/src/Menu.vue'])
})

test('a collapsed menu does not auto-open the active route parent on load', () => {
  // `defaultOpeneds` 在折叠时必须返回空：折叠的父级会渲染成 popper，载入即展开就是把面板盖在页面上。
  // `defaultOpeneds` must be empty while collapsed: a collapsed parent renders as a popper, so opening
  // it on load is exactly the panel laid over the page before the reader touches anything.
  assert.match(added, /const menuCollapsed = computed\(/, 'the patch no longer names the collapsed state')
  assert.match(added, /unref\(menuMode\) !== 'horizontal'/, 'horizontal menus are no longer excluded')
  assert.match(added, /!isTwoColumnLayout\(unref\(layout\)\)/, 'the two-column layout is no longer excluded')
  // `defaultOpeneds` is unchanged context, and the hunk starts after it — the guard is tied to that
  // function by the `findOpenMenuPaths` line it now precedes.
  assert.match(
    patch,
    /\+      if \(unref\(menuCollapsed\)\) \{\n\+        return \[\]\n\+      \}\n       return findOpenMenuPaths/,
    'a collapsed menu still auto-opens its active parent',
  )
})

test('Escape closes a collapsed popup without relying on mouseleave', () => {
  assert.match(added, /const onDocumentKeydown = \(event: KeyboardEvent\) => \{/, 'no keydown handler')
  assert.match(added, /event\.key === 'Escape'/, 'Escape is not handled')
  assert.match(added, /document\.addEventListener\('keydown', onDocumentKeydown, true\)/, 'the keydown listener is not registered')
  assert.match(added, /document\.removeEventListener\('keydown', onDocumentKeydown, true\)/, 'the keydown listener is not removed')
})

test('a pointerdown outside the menu and its popper closes it', () => {
  assert.match(added, /const onDocumentPointerDown = \(event: PointerEvent\) => \{/, 'no outside-pointer handler')
  assert.match(added, /menuWrapRef\.value\?\.contains\(target\)/, 'a click inside the menu is no longer excluded')
  assert.match(added, /target\.closest\?\.\('\.el-menu--popup-container'\)/, 'a click inside the popup is no longer excluded')
  assert.match(added, /document\.addEventListener\('pointerdown', onDocumentPointerDown, true\)/, 'the pointerdown listener is not registered')
  assert.match(added, /document\.removeEventListener\('pointerdown', onDocumentPointerDown, true\)/, 'the pointerdown listener is not removed')
})

test('closing dispatches the mouseleave path Element Plus already understands', () => {
  // 不复制一份 `openedMenus` 状态：派发 `mouseleave` 走的是组件自己那条收起路径，Element Plus 升级时
  // 不会留下我们一份过时的内部状态。
  // No second copy of `openedMenus`: dispatching `mouseleave` runs the component's own close path, so an
  // Element Plus upgrade cannot leave a stale internal state of ours behind.
  assert.match(added, /const closeCollapsedPopups = \(\) => \{/, 'no close helper')
  assert.match(added, /querySelectorAll\('\.el-menu--collapse > \.el-sub-menu'\)/, 'the submenu titles are no longer told to close')
  assert.match(added, /\.el-menu--popup-container/, 'the teleported popup is no longer told to close')
  assert.match(added, /new MouseEvent\('mouseleave'\)/, 'the close path is no longer the one Element Plus handles')
})

test('a route change closes a popup the reader may have opened', () => {
  assert.match(added, /\(\) => unref\(currentRoute\)\.path/, 'no route watcher')
  assert.match(added, /nextTick\(closeCollapsedPopups\)/, 'the route watcher does not close the popup')
})
