// SPDX-License-Identifier: Apache-2.0
//
// `N3`: the object query's **row cap** has to be assertable. In the 2026-11-21 real-stack reading
// (`handoff/rescan-cap-1121.md`) the console's by-range rescan was a hard-coded 5 pages × 200 — 1000
// rows was everything, the rest was neither paged nor merged, and only the status line said "the scan
// hit its bound". That bound lived in one SFC constant, and no test could ask "what is the most rows a
// query can return".
//
// This pins four things on the extracted pure module (`scanCap.mjs`): a **stated default** of 1000
// rows (5 × 200); a **configurable band** with both ends, where below 200, above 1200 and non-numbers
// are bounded (clamped) and marked `clamped`; a **negative** proof that a read face ignoring `limit`
// still cannot push the scan past its cap; and that the plan itself respects the runtime's page face —
// `limit ≤ 200`, `offset ≤ 1000` — because `offset=1200` is clamped back to 1000 and repeats a page.
//
// `N3`：对象查询的**行数上限**要可断言。2026-11-21 的真栈读数（`handoff/rescan-cap-1121.md`）里，
// 控制台同区间重扫是写死的 5 页 × 200 —— 1000 行就是全部，超过的部分不分页、不合并，只在状态行说一句
// 「已扫到上限」。这个上界此前只存在于一个 SFC 常量里，没有任何测试能问「一次查询最多能返回多少行」。
//
// 这一条把上限抽成一个纯模块（`scanCap.mjs`）并钉四件事：
//
//   ① **默认上限明确**：不给配置就是 1000 行，5 页 × 200 行；
//   ② **可配置区间有上下界**：低于 200、高于 1200、非数字，都落到区间内（有界夹取），且标记 `clamped`；
//   ③ **查询不可能超过它**（负向）：即使读面无视 `limit`、每页回 500 行，扫描累计也不会越过上限；
//   ④ **计划本身就守运行时边界**（负向）：每页 `limit ≤ 200`、`offset ≤ 1000` —— 越过 `offset=1200`
//      会被运行时夹回 1000 并重复同一页，故 1200 是这条面能走到的最深处。
//
//     node --test scripts/scan-cap.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = process.env.KEELBASE_REPO_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')
const CAP = join(ROOT, 'keelbase-ui/host-overlay/src/keelbase/scanCap.mjs')
const PAGE = 'keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue'

const c = await import(pathToFileURL(CAP).href)

test('the default cap is 1000 rows — five 200-row pages, the face’s stated depth', () => {
  const resolved = c.resolveScanCap(undefined)
  assert.equal(resolved.rows, 1000)
  assert.equal(resolved.clamped, false)
  assert.equal(resolved.requested, null)

  const plan = c.scanPageRequests(resolved.rows)
  assert.deepEqual(
    plan.map((p) => p.offset),
    [0, 200, 400, 600, 800],
  )
  assert.ok(plan.every((p) => p.limit === 200), 'a default scan asks for full pages')
  assert.equal(
    plan.reduce((sum, p) => sum + p.limit, 0),
    1000,
    'the plan itself is the cap: the limits add up to exactly 1000 rows',
  )
})

test('the cap is configurable only inside a fixed band — both ends are clamped, not trusted', () => {
  assert.deepEqual(c.resolveScanCap(1000), { rows: 1000, clamped: false, requested: 1000 })
  assert.deepEqual(c.resolveScanCap('400'), { rows: 400, clamped: false, requested: 400 })
  // Below the floor and above the ceiling are both clamped, and `clamped` records it — a silently
  // accepted setting would let its author believe it took effect.
  // 低于下界、高于上界都要夹住，并留下 `clamped` 这个读数 —— 一份静默接受的配置会让人以为生效了。
  assert.deepEqual(c.resolveScanCap(1), { rows: 200, clamped: true, requested: 1 })
  assert.deepEqual(c.resolveScanCap(-500), { rows: 200, clamped: true, requested: -500 })
  assert.deepEqual(c.resolveScanCap(99999), { rows: 1200, clamped: true, requested: 99999 })
  assert.deepEqual(c.resolveScanCap(Infinity), { rows: 1200, clamped: true, requested: Infinity })
  // A non-number falls back to the default and is marked clamped; a blank string means "not set".
  // 非数字落回默认值，同样标记被夹取；空串按「没配置」处理。
  assert.deepEqual(c.resolveScanCap('not-a-number'), { rows: 1000, clamped: true, requested: 'not-a-number' })
  assert.deepEqual(c.resolveScanCap(''), { rows: 1000, clamped: false, requested: null })
  assert.deepEqual(c.resolveScanCap(null), { rows: 1000, clamped: false, requested: null })
  // A fractional setting is truncated to whole rows.
  // 小数按行取整，不产生半行。
  assert.deepEqual(c.resolveScanCap(333.9), { rows: 333, clamped: false, requested: 333.9 })
})

test('negative: a read face that ignores `limit` still cannot push the scan past the cap', () => {
  // If the read face misbehaves (ignores `limit`, answers 500 rows a page), the running total still
  // cannot cross the cap — the negative proof of "a query cannot exceed its bound".
  // 读面坏了（无视 limit、每页回 500 行）时，累计也不能越界 —— 这是「查询不可能超过上限」的负向证明。
  const cap = c.resolveScanCap(1000).rows
  // One answer is already over the cap: 5000 rows into an empty total keeps exactly the cap.
  // 一次答复就超限：空累计里塞 5000 行，留下的只能是上限那么多。
  assert.equal(
    c.absorbChunk([], Array.from({ length: 5000 }, (_, i) => ({ id: i })), cap).length,
    cap,
    'one oversized answer was kept whole',
  )
  const plan = c.scanPageRequests(cap)
  let scanned = []
  for (const page of plan) {
    const oversized = Array.from({ length: 500 }, (_, i) => ({ id: page.offset + i }))
    scanned = c.absorbChunk(scanned, oversized, cap)
  }
  assert.equal(scanned.length, cap, 'an oversized answer filled the cap and stopped there')
  assert.ok(scanned.length <= c.MAX_SCAN_ROWS)
  // Once full, more rows add nothing.
  // 已经满了以后再喂，什么都不加。
  assert.equal(c.absorbChunk(scanned, [{ id: 'extra' }], cap).length, cap)
  // An empty answer leaves the total alone.
  // 空答复不改变累计。
  assert.deepEqual(c.absorbChunk([{ id: 1 }], [], cap), [{ id: 1 }])
})

test('negative: no request reaches the offset the runtime clamps — the duplicate-page hazard', () => {
  // The runtime clamps `offset > 1000` back to 1000, so `offset=1200` repeats page 6. No plan may cross
  // it; the 1200 ceiling is exactly `MAX_OFFSET 1000 + MAX_LIMIT 200`, and anything more would only
  // come from duplicated pages.
  // 运行时把 `offset > 1000` 夹回 1000，于是 `offset=1200` 会重复第 6 页。计划里任何一页都不得越过它；
  // 上限 1200 正是 `MAX_OFFSET 1000 + MAX_LIMIT 200`，再多就只能靠重复页凑数了。
  for (const raw of [undefined, 200, 401, 1000, 1001, 1199, 1200, 5000, '99999']) {
    const cap = c.resolveScanCap(raw).rows
    const plan = c.scanPageRequests(cap)
    assert.ok(plan.length > 0)
    for (const page of plan) {
      assert.ok(page.limit > 0 && page.limit <= 200, `limit ${page.limit} leaves the runtime’s page face`)
      assert.ok(page.offset >= 0 && page.offset <= 1000, `offset ${page.offset} would be clamped and repeat a page`)
      assert.ok(page.offset + page.limit <= 1200, 'a page overshoots the deepest reachable row')
    }
    assert.equal(
      plan.reduce((sum, p) => sum + p.limit, 0),
      cap,
      `the plan for ${String(raw)} does not add up to its own cap`,
    )
  }
})

test('the page takes the cap from the module — no hard-coded five-page loop', () => {
  // The wiring is pinned too: a cap living only in the module while the page keeps its hard-coded five
  // pages would leave every test green and the bound unapplied.
  // 接线也要钉住：上限若只活在模块里而页面照旧写死 5 页，测试全绿而上界并未生效。
  const page = readFileSync(join(ROOT, PAGE), 'utf8')
  const script = page.slice(page.indexOf('<script'), page.lastIndexOf('</script>'))
  const capImport = /import \{([^}]*)\} from '@\/keelbase\/scanCap\.mjs'/.exec(script)
  assert.ok(capImport, 'the page does not take its scan cap from the module')
  for (const name of ['resolveScanCap', 'scanPageRequests', 'absorbChunk']) {
    assert.ok(capImport[1].includes(name), `the page does not import \`${name}\` from the cap module`)
  }
  assert.doesNotMatch(script, /SCAN_PAGES/, 'the page still carries its own hard-coded page count')
  const scan = script.slice(script.indexOf('async function scanAudit'), script.indexOf('async function scanLedger'))
  assert.match(scan, /scanPageRequests\(/, 'scanAudit does not walk the module’s plan')
  assert.match(scan, /absorbChunk\(/, 'scanAudit does not trim every answer to the cap')
  assert.match(scan, /limit:\s*page\.limit/, 'scanAudit does not send the plan’s own limit')
  assert.match(scan, /offset:\s*page\.offset/, 'scanAudit does not send the plan’s own offset')
})
