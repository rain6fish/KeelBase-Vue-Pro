// SPDX-License-Identifier: Apache-2.0
//
// 治理登记门的**看门测试**：`scripts/check-governance-registry.mjs` 在真源码上必须真的会绿，而在
// **空树 / 根缺失 / 读不到任何一条路径**时必须真的会红。
//
//     node --test scripts/governance-registry.test.mjs
//
// 每一组用例都在临时目录里铺一份树，再用 `KEELBASE_ROOT` 指向它跑**那个脚本本身**（不是另写一份判据的副本）
// —— 于是红的那个东西就是 CI 里跑的那个东西。
//
// 为什么这道门自己也要被证伪：它的失效方式不是「读错一条」而是**读成空表** —— 枚举落空时，两个方向的判据
// （形状⇒登记、登记⇒形状）都会**空着成立**，于是一棵错的检出读成「全部已登记」。2026-11-07 之前它正是
// 这样：目录不存在、树是空的、路径被改名，都打印 `0 AI execution path(s) declared` 然后 exit 0。
//
// 必须红的四组：两个射程根都缺失；两个根都在但都是空的；一半有文件、另一半缺失（只点名缺的那一半）；
// 两半都有文件却没有一条路径（空壳类）。
//
// 必须绿的两组：真检出（77 条路径）与一棵最小的合法树（一条 module + 一条 tool）—— 后者证明这次加严
// 只拦空输入，没有把「树小」也判成红。
//
// ── English ─────────────────────────────────────────────────────────────────────
//
// The keeper test for the governance-registry gate: `scripts/check-governance-registry.mjs` must really go
// green on the real source and really go red on an **empty tree / a missing root / a reading with no path**.
//
//     node --test scripts/governance-registry.test.mjs
//
// Every case lays out a tree in a temporary directory and runs **that script itself** against it through
// `KEELBASE_ROOT` (not a copy of its criterion) — so the thing going red is the thing CI runs.
//
// Why the gate has to be falsifiable itself: its failure mode is not "one wrong reading" but **reading an
// empty list** — when the enumeration comes up empty, both directions of the criterion (shape ⇒ declared,
// declared ⇒ shape) hold vacuously, so a wrong checkout reads as "everything declared". Before 2026-11-07
// that is exactly what it did: a missing directory, an empty tree or a renamed path all printed
// `0 AI execution path(s) declared` and exited 0.
//
// Four groups **must be red**: both scope roots missing; both present but empty; one half with files and the
// other missing (only the missing half is named); both halves with files but not one path (empty shells).
//
// Two groups **must be green**: the real checkout (77 paths) and a minimal legal tree (one module + one tool)
// — the latter shows this tightening caught empty input only and did not turn "a small tree" into red.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'check-governance-registry.mjs')
const ROOT = join(HERE, '..')
// 与脚本里的射程常量同一种写法（正斜杠）：消息里打印的就是它们，断言按字符串对得上。 / The same form as the
// script's scope constants (forward slashes): these are what the message prints, so the assertions match.
const OWN = 'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase'
const HARNESS = 'yudao-module-ai1-springai/src/main/java/cn/iocoder/yudao/module/ai1/harness'
const under = (root, scope) => join(root, ...scope.split('/'))

/** 跑那个脚本本身，返回真实退出码与两个流。 / Run the script itself; return its real exit code and both streams. */
function run(root) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, KEELBASE_ROOT: root },
  })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/**
 * 铺一棵假树：`own` / `harness` 是各自根下的整份 `.java`（键 = 文件名）；`null` 表示**这个根不存在**。
 * 返回临时根，用例结束即删。
 *
 * Lay out a fake tree: `own` / `harness` are whole `.java` files under each root (keys = file names); `null`
 * means **that root is absent**. Returns the temporary root, removed after the case.
 */
function fixture(t, { own = null, harness = null }) {
  const root = mkdtempSync(join(tmpdir(), 'governance-registry-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [scope, files] of [[OWN, own], [HARNESS, harness]]) {
    if (files === null) continue
    const dir = under(root, scope)
    mkdirSync(dir, { recursive: true })
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
  }
  return root
}

/** 一个受治理模块的形状：`@Around` 点模块 service 层 + `implements GovernedModule` 报自己的名字。 / A governed module: a module-service pointcut plus a self-declared name. */
const moduleFixture = (impl, name) => `// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;

@Aspect
public class ${impl} implements GovernedModule {

    @Around("execution(* cn.iocoder.yudao.module.${name}.service.*.*(..))")
    public Object around(ProceedingJoinPoint pjp) throws Throwable {
        return pjp.proceed();
    }

    @Override
    public String module() {
        return "${name}";
    }
}
`

/** 一个自报的工具面形状。 / A self-declared tool face. */
const toolFixture = (impl) => `// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

public class ${impl} implements GovernedPath {

    @Bean
    public AiTool listCustomersTool() {
        return null;
    }

    @Override
    public Kind kind() {
        return Kind.TOOL;
    }
}
`

/** 一个不携带任何形状的类 —— 它让「根下有文件」与「读得到路径」分开。 / A class carrying no shape, so "files under the root" and "a path was read" come apart. */
const plainFixture = (cls) => `// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

public class ${cls} {
}
`

test('the real repository: every governed path is declared and counted', () => {
  const { status, stdout, stderr } = run(ROOT)
  // 空的枚举会让下面那句永远成立 —— 先证明读到了东西。 / An empty enumeration would make the next line vacuous — prove something was read first.
  const paths = Number(/(\d+) AI execution path\(s\) declared/.exec(stdout)?.[1])
  const modules = Number(/(\d+) module/.exec(stdout)?.[1])
  const tools = Number(/(\d+) tool/.exec(stdout)?.[1])
  assert.ok(paths > 0, `the reading must be a number, not a shrug: ${stdout}${stderr}`)
  assert.ok(modules > 0, `${modules} module(s) read — a real checkout holds dozens; the reader, not the tree, is suspect`)
  assert.ok(tools > 0, `${tools} tool(s) read — a real checkout holds dozens; the reader, not the tree, is suspect`)
  assert.equal(status, 0, `the real tree must be green:\n${stderr}`)
  assert.match(stdout, /0 failed/)
})

test('both scope roots missing is red and names both paths', (t) => {
  const { status, stdout, stderr } = run(fixture(t, {}))
  assert.equal(status, 1, `a missing tree is not a pass:\n${stdout}${stderr}`)
  assert.match(stderr, /不是通过|not a pass/, 'the message must say this is not a pass')
  assert.ok(stderr.includes(OWN), 'the message must name the missing keelbase root')
  assert.ok(stderr.includes(HARNESS), 'the message must name the missing harness root')
})

test('both roots present but empty is red — an empty reading is not a pass', (t) => {
  const { status, stdout, stderr } = run(fixture(t, { own: {}, harness: {} }))
  assert.equal(status, 1, `an empty tree is not a pass:\n${stdout}${stderr}`)
  assert.match(stderr, /不是通过|not a pass/, 'the message must say this is not a pass')
  assert.ok(stderr.includes(OWN), 'the message must name the keelbase root')
  assert.ok(stderr.includes(HARNESS), 'the message must name the harness root')
})

test('one half present and the other missing is red, naming only the missing half', (t) => {
  const { status, stdout, stderr } = run(fixture(t, {
    own: { 'CrmCustomerGovernance.java': moduleFixture('CrmCustomerGovernance', 'crm') },
    harness: null,
  }))
  assert.equal(status, 1, `half a scope is not a pass:\n${stdout}${stderr}`)
  assert.ok(stderr.includes(HARNESS), 'the message must name the missing harness root')
  assert.ok(!stderr.includes(OWN), 'the half that was read must not be named as unreadable')
})

test('files but not one path is red — the shapes, not the tree, are wrong', (t) => {
  const { status, stdout, stderr } = run(fixture(t, {
    own: { 'NothingHere.java': plainFixture('NothingHere') },
    harness: { 'HarnessMarker.java': plainFixture('HarnessMarker') },
  }))
  assert.equal(status, 1, `0 paths read is not a pass:\n${stdout}${stderr}`)
  assert.match(stderr, /不是通过|not a pass/, 'the message must say this is not a pass')
  assert.match(stderr, /0 path\(s\) declared|0 AI execution path/, 'the message must state the empty reading')
})

test('a minimal legal tree stays green — the tightening only catches empty input', (t) => {
  const { status, stdout, stderr } = run(fixture(t, {
    own: {
      'CrmCustomerGovernance.java': moduleFixture('CrmCustomerGovernance', 'crm'),
      'CrmCustomerTools.java': toolFixture('CrmCustomerTools'),
    },
    harness: { 'HarnessMarker.java': plainFixture('HarnessMarker') },
  }))
  assert.equal(status, 0, `one module and one declared tool are a legal tree:\n${stderr}`)
  assert.match(stdout, /2 AI execution path\(s\) declared — 1 module, 1 tool/, 'both paths must be counted')
  assert.match(stdout, /2 ok \/ 0 failed/)
})
