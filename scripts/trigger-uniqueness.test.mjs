// SPDX-License-Identifier: Apache-2.0
//
// 触发词唯一性门禁的**看门测试**：`scripts/check-trigger-uniqueness.mjs` 在真源码上必须真的会红、也会绿。
//
//     node --test scripts/trigger-uniqueness.test.mjs
//
// 每一组用例都在临时目录里铺一份**形状与真源码相同**的 Java 树，再用 `KEELBASE_ROOT` 指向它跑**那个脚本本身**
// （不是另写一份判据的副本）—— 于是红的那个东西就是 CI 里跑的那个东西。
//
// 为什么这道门自己也要被证伪：一个解析器读错形状时最自然的失效方式是**读成空表**，而空表让门禁永远绿；那正是
// 这道门要防的假绿，只不过发生在它自己身上。所以下面这六组是**必须红**的：
//
//   - 两个工具面认同一个短语 / 一方是另一方的子串（两起真事故的形状）；
//   - 同一个类里两条路由写**完全相同**的短语（后一条是死路由）；
//   - 一处声明里同一个短语写两遍；空白触发词（它会抢走一切）；
//   - 读不懂的声明形状、以及「有 `implements ModuleRoute` 却没有可读声明」。
//
// 而这四组是**必须绿**的，因为它们证明判据没有被收紧成「什么都红」：不相交的两条短语；同一个类里的子串重叠
// （那里声明次序就是答案，Java 那道断言同样排除它）；只出现在**注释**里的短语；指向**同一个工具**的两条路由
// 共用一个短语（去处相同）。
//
// 另有反向证明的入口：整棵真源码复制一份、把 `oa` 的五句改回撞词版本，跑脚本必须红并点名两处。这条不进自动
// 测试（它要复制 115 个文件），命令写在下面，读数记在 `handoff/trigger-gate-20261104.md`：
//
//     cp -r yudao-server /tmp/rt/yudao-server && <把 OaApplyDocumentsTools 的短语改回旧五句>
//     KEELBASE_ROOT=/tmp/rt node scripts/check-trigger-uniqueness.mjs      # 必须 exit 1
//
// ── English ─────────────────────────────────────────────────────────────────────
//
// The keeper test for the trigger-uniqueness gate: `scripts/check-trigger-uniqueness.mjs` must really go red and
// really go green on real source.
//
//     node --test scripts/trigger-uniqueness.test.mjs
//
// Every case lays out a Java tree in a temporary directory **in the same shape as the real source**, then runs
// **that script itself** against it through `KEELBASE_ROOT` (not a copy of its criterion) — so the thing going
// red is the thing CI runs.
//
// Why the gate has to be falsifiable itself: the natural failure of a parser that misreads a shape is to read an
// **empty list**, and an empty list keeps the gate green forever; that is the false green this gate exists to
// prevent, only happening inside it. So these six **must be red**:
//
//   - two tool faces claiming one phrase / one a substring of the other (the shape of both real incidents);
//   - **exactly** the same phrase in two routes of one class (the later one is a dead route);
//   - one phrase listed twice in a declaration; a blank trigger (it would take everything);
//   - a declaration shape the reader cannot read, and "an `implements ModuleRoute` with no readable declaration".
//
// And these four **must be green**, because they show the criterion was not tightened into "everything is red":
// two disjoint phrases; a substring overlap within one class (declaration order is the answer there, and the Java
// assertion excludes it too); a phrase that appears only in a **comment**; two routes to the **same tool** sharing
// a phrase (same destination).
//
// There is also a door for the real-tree reverse proof: copy the whole source tree, put `oa`'s five phrases back to
// the colliding version, and the script must go red naming both places. It is not in the automated list (it copies
// 115 files); the command is above and the reading is recorded in `handoff/trigger-gate-20261104.md`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(HERE, 'check-trigger-uniqueness.mjs')
const ROOT = join(HERE, '..')
const SCOPE = join('yudao-server', 'src', 'main', 'java', 'cn', 'iocoder', 'yudao', 'server', 'keelbase')

/** 跑那个脚本本身，返回真实退出码与两个流。 / Run the script itself; return its real exit code and both streams. */
function run(root) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, KEELBASE_ROOT: root },
  })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

const literal = (phrase) => JSON.stringify(phrase)

/**
 * 一条路由，形状与真源码相同（`static final class X implements ModuleRoute` + `toolName()` + `triggers()`）。
 * `triggers` 传字符串数组时写成 `List.of("…")`；传已经写好的表达式时原样放进 `return`。
 *
 * One route in the real shape; a string array becomes `List.of("…")`, an already-written expression is placed in
 * the `return` verbatim.
 */
function route({ name, tool, triggers, extra = '' }) {
  const body = Array.isArray(triggers) ? `List.of(${triggers.map(literal).join(', ')})` : triggers
  return `    static final class ${name} implements ModuleRoute {
        @Override
        public String toolName() {
            return ${JSON.stringify(tool)};
        }
${extra}        @Override
        public List<String> triggers() {
            return ${body};
        }
    }
`
}

const host = (className, body) => `// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import java.util.List;

public class ${className} {
${body}}
`

/** 铺一棵假源码树：`files` 的键是文件名（在 `SCOPE` 下），值是整份 `.java`。 / Lay out a fake source tree: keys are file names under `SCOPE`, values are whole `.java` files. */
function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'trigger-uniqueness-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = join(root, SCOPE)
  mkdirSync(dir, { recursive: true })
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body)
  return root
}

test('the real repository: two tool faces never claim one phrase', () => {
  const { status, stdout, stderr } = run(ROOT)
  // 空的枚举会让下面那句永远成立 —— 先证明读到了东西。 / An empty enumeration would make the next line vacuous — prove something was read first.
  assert.match(stdout, /(\d+) trigger\(s\) in (\d+) declaration\(s\)/, `the reading must be a number, not a shrug: ${stdout}${stderr}`)
  const triggers = Number(/(\d+) trigger\(s\)/.exec(stdout)[1])
  const declarations = Number(/(\d+) declaration\(s\)/.exec(stdout)[1])
  assert.ok(triggers > 200, `${triggers} trigger(s) read — a real checkout holds hundreds; the reader, not the tree, is suspect`)
  assert.ok(declarations >= 60, `${declarations} declaration(s) read — a real checkout holds dozens; the reader, not the tree, is suspect`)
  assert.equal(status, 0, `the real tree must be green:\n${stderr}`)
  assert.match(stdout, /0 failed/)
})

test('two tool faces claiming the same phrase go red, name both places, and hand over the fix', (t) => {
  const root = fixture(t, {
    'PmsProjectTools.java': host('PmsProjectTools', route({ name: 'ListRoute', tool: 'list_pms_tasks', triggers: ['我的任务', '我的待办'] })),
    'BpmTaskTools.java': host('BpmTaskTools', route({ name: 'ListRoute', tool: 'list_my_bpm_tasks', triggers: ['我的待办', '待我审批'] })),
  })
  const { status, stderr } = run(root)
  assert.equal(status, 1, `a shared phrase is a collision:\n${stderr}`)
  assert.match(stderr, /「我的待办」/, 'the message must print the phrase')
  assert.match(stderr, /list_pms_tasks .*PmsProjectTools\.java:\d+/, 'the message must name the first tool and its file:line')
  assert.match(stderr, /list_my_bpm_tasks .*BpmTaskTools\.java:\d+/, 'the message must name the second tool and its file:line')
  assert.match(stderr, /改法/, 'the message must hand over the fix')
})

test('one phrase being a substring of another goes red — the oa/BPM shape', (t) => {
  const root = fixture(t, {
    'BpmOALeaveTools.java': host('BpmOALeaveTools', route({ name: 'ListRoute', tool: 'list_my_oa_leaves', triggers: ['看我的请假', '我的请假'] })),
    // oa 那条读面的短语含得下 BPM 样例的短句 —— 用户在句子里写下「我的请假」时两条都「命中」。
    // oa's read phrases hold the BPM sample's short ones — a message carrying 「我的请假」 matches both.
    'OaApplyDocumentsTools.java': host('OaApplyDocumentsTools', route({ name: 'ListRoute', tool: 'list_my_oa_leave_applies', triggers: ['我的请假记录'] })),
  })
  const { status, stderr } = run(root)
  assert.equal(status, 1, `a substring overlap is a collision:\n${stderr}`)
  assert.match(stderr, /list_my_oa_leave_applies/, "the message must name oa's tool")
  assert.match(stderr, /list_my_oa_leaves/, "the message must name BPM's tool")
  assert.match(stderr, /互为子串|substring/, 'the message must say why the overlap matters')
})

test('disjoint phrases are green', (t) => {
  const root = fixture(t, {
    'CrmTools.java': host('CrmTools', route({ name: 'ListRoute', tool: 'list_crm', triggers: ['列出商机', '商机列表'] })),
    'OaTools.java': host('OaTools', route({ name: 'ListRoute', tool: 'list_oa', triggers: ['列出请假', '请假列表'] })),
  })
  const { status, stdout, stderr } = run(root)
  assert.equal(status, 0, `disjoint phrases must stay green:\n${stderr}`)
  assert.match(stdout, /4 trigger\(s\) in 2 declaration\(s\)/)
})

test('a substring overlap inside one class stays green — declaration order is the answer there', (t) => {
  const root = fixture(t, {
    'BpmProcessInstanceTools.java': host(
      'BpmProcessInstanceTools',
      route({ name: 'ListRoute', tool: 'list_my_processes', triggers: ['我的流程', '看我的流程'] }) +
        route({ name: 'CancelRoute', tool: 'cancel_my_process', triggers: ['撤回流程', '撤回我的流程'] }),
    ),
  })
  const { status, stderr } = run(root)
  // 「撤回我的流程」含「我的流程」—— 真源码里 BPM 就是这么写的，且这是刻意的。 / 「撤回我的流程」 contains 「我的流程」; the real tree writes it this way on purpose.
  assert.equal(status, 0, `an overlap within one face must not be flagged:\n${stderr}`)
})

test('exactly the same phrase in two routes of one class goes red — the later route is dead', (t) => {
  const root = fixture(t, {
    'CrmBusinessTools.java': host(
      'CrmBusinessTools',
      route({ name: 'ListRoute', tool: 'list_crm_businesses', triggers: ['列出商机'] }) +
        route({ name: 'CreateRoute', tool: 'create_crm_business', triggers: ['列出商机', '新建商机'] }),
    ),
  })
  const { status, stderr } = run(root)
  assert.equal(status, 1, `an exact repeat across routes is a dead route:\n${stderr}`)
  assert.match(stderr, /死路由|unreachable/, 'the message must say the later route is unreachable')
})

test('the same phrase twice inside one declaration goes red', (t) => {
  const root = fixture(t, {
    'CrmTools.java': host('CrmTools', route({ name: 'ListRoute', tool: 'list_crm', triggers: ['列出商机', '列出商机'] })),
  })
  const { status, stderr } = run(root)
  assert.equal(status, 1, `a duplicated entry is meaningless:\n${stderr}`)
  assert.match(stderr, /写了两遍|twice/, 'the message must say the phrase is listed twice')
})

test('a blank trigger goes red — it would take every message', (t) => {
  const root = fixture(t, {
    'CrmTools.java': host('CrmTools', route({ name: 'ListRoute', tool: 'list_crm', triggers: ['列出商机', ' '] })),
  })
  const { status, stderr } = run(root)
  assert.equal(status, 1, `a blank trigger claims everything:\n${stderr}`)
  assert.match(stderr, /空白触发词|blank/, 'the message must name the blank trigger')
})

test('a phrase that appears only in a comment is not a declaration', (t) => {
  const root = fixture(t, {
    'CrmTools.java': host(
      'CrmTools',
      '    // 早先这里是 triggers() { return List.of("看商机", "商机列表"); } —— 注释掉的代码不是声明。\n' +
        '    // This used to be triggers() { return List.of("看商机", "商机列表"); } — commented-out code is not a declaration.\n' +
        route({ name: 'ListRoute', tool: 'list_crm', triggers: ['列出商机'] }),
    ),
    'OaTools.java': host(
      'OaTools',
      '    /* 有人在这里补过一句「看商机」的备忘，它不是触发词。 / A memo mentioning 「看商机」, not a trigger. */\n' +
        route({ name: 'ListRoute', tool: 'list_oa', triggers: ['看商机'] }),
    ),
  })
  const { status, stdout, stderr } = run(root)
  assert.equal(status, 0, `a comment is not a declaration:\n${stderr}`)
  assert.match(stdout, /2 trigger\(s\) in 2 declaration\(s\)/, 'only the two real triggers may be counted')
})

test('a declaration this reader cannot evaluate exits 2 instead of reading as empty', (t) => {
  const root = fixture(t, {
    'CrmTools.java': host(
      'CrmTools',
      '    static final String PHRASE = "列出商机";\n' + route({ name: 'ListRoute', tool: 'list_crm', triggers: 'List.of(PHRASE)' }),
    ),
  })
  const { status, stderr } = run(root)
  assert.equal(status, 2, `an unreadable declaration must not be green:\n${stderr}`)
  assert.match(stderr, /not a plain string literal/, 'the message must say which shape it could not read')
  assert.match(stderr, /CrmTools\.java:\d+/, 'the message must point at the file and line')
})

test('an implements ModuleRoute with no readable triggers is red on the count, not silent', (t) => {
  const root = fixture(t, {
    'CrmTools.java': host(
      'CrmTools',
      route({ name: 'ListRoute', tool: 'list_crm', triggers: ['列出商机'] }) +
        `    static final class SilentRoute implements ModuleRoute {
        @Override
        public String toolName() {
            return "silent_tool";
        }
    }
`,
    ),
  })
  const { status, stderr } = run(root)
  assert.equal(status, 2, `a route with no triggers must not pass:\n${stderr}`)
  assert.match(stderr, /implements ModuleRoute/, 'the message must name the mismatch')
})

const consolePages = ({ triggerExpression, triggerOfBody }) => `// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import java.util.List;

public class ConsolePages {

    static final String TOOL_NAME = "navigate_console_page";

    record Page(String key, String name, String route, String description) {
    }

    static final List<Page> PAGES = List.of(
            new Page("system", "系统管理", "/system", "用户与角色"),
            new Page("users", "用户管理", "/system/user", "账号"));

    static final class NavigateRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return TOOL_NAME;
        }

        @Override
        public List<String> triggers() {
            return ${triggerExpression};
        }

        private static String triggerOf(Page page) {
            return ${triggerOfBody};
        }
    }
}
`

test('the computed table in ConsolePages is read, so its pages can collide like any other phrase', (t) => {
  const root = fixture(t, {
    'ConsolePages.java': consolePages({
      triggerExpression: 'PAGES.stream().map(NavigateRoute::triggerOf).toList()',
      triggerOfBody: '"打开" + page.name()',
    }),
    'SystemRoute.java': host('SystemRoute', route({ name: 'ListRoute', tool: 'list_system_pages', triggers: ['打开用户管理'] })),
  })
  const { status, stderr } = run(root)
  assert.equal(status, 1, `the computed phrases must take part in the comparison:\n${stderr}`)
  assert.match(stderr, /navigate_console_page/, 'the computed declaration must be named by its tool')
  assert.match(stderr, /list_system_pages/, 'the other face must be named too')
})

test('a changed computed form exits 2 — the reader says so instead of skipping it', (t) => {
  const root = fixture(t, {
    'ConsolePages.java': consolePages({
      triggerExpression: 'PAGES.stream().map(NavigateRoute::triggerOf).toList()',
      triggerOfBody: 'page.name()',
    }),
  })
  const { status, stderr } = run(root)
  assert.equal(status, 2, `a changed rule must not be guessed:\n${stderr}`)
  assert.match(stderr, /triggerOf/, 'the message must say which rule it could not read')
})

test('a tree with no route at all exits 2 — an empty reading is not a pass', (t) => {
  const root = fixture(t, {
    'NothingHere.java': `// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

public class NothingHere {
}
`,
  })
  const { status, stderr } = run(root)
  assert.equal(status, 2, `zero routes must not read as green:\n${stderr}`)
  assert.match(stderr, /implements ModuleRoute/, 'the message must say what it looked for')
})

test('two routes to the same tool may share a phrase — the destination is the same', (t) => {
  const root = fixture(t, {
    'CrmTools.java': host(
      'CrmTools',
      route({ name: 'ListRoute', tool: 'list_crm', triggers: ['列出商机'] }) +
        route({ name: 'ListRouteAgain', tool: 'list_crm', triggers: ['列出商机', '商机列表'] }),
    ),
  })
  const { status, stderr } = run(root)
  assert.equal(status, 0, `two routes to one tool are one destination:\n${stderr}`)
})
