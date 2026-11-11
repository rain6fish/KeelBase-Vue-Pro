// SPDX-License-Identifier: Apache-2.0
//
// 生成器边界的**看门测试**：`sql/keelbase-*.sql` 里每一份，要么是某个 `specs/*.json` 的产出，要么在
// `SpecCodegen.HAND_WRITTEN` 里声明过。两者都不是 ⇒ 这一份就是「第二个源」，测试当场红，并在消息里
// 直接给出补法。
//
//     node --test scripts/boundary-keeper.test.mjs
//     KEELBASE_ROOT=<另一份检出> node --test scripts/boundary-keeper.test.mjs   # 反向证明用
//
// **为什么还要这一道（与 `--check-boundary` 的分工）**：`Boundary.check` 的判据一字不差，但它是 Maven 命令
// （`bash scripts/gen-from-spec.sh --check-boundary`），只在 CI 的 `generator` job 里跑 —— 写代码的人本地
// 通常不跑它，于是「新增了文件、忘了改一个 Java 文件」要等推送后约九小时才在 CI 上被看见（2026-11-03
// `sql/keelbase-member.sql`）。这一道读的是**源码文本**，不要 JDK、不要 Maven、不要网，`node --test` 一条
// 就到；它守的是「同一句话在最快的地方能被读到」，`--check-boundary` 守的是「构建时的那句判断本身」。
// 判据只有一处（`SpecCodegen.HAND_WRITTEN` 与 `specs/` 的产物名），两处读的是同一份事实。
//
// **它自己也得能被证伪**：除了对真仓库跑一遍，下面还有四组临时目录里的用例 —— 未声明 ⇒ 红并点名、
// 已声明 ⇒ 绿、Spec 产出 ⇒ 绿、只在注释里出现过 ⇒ 仍然红（注释不是声明）。另加一组：解析器读到它
// 不认识的声明形状时**报错**而不是悄悄读成空表 —— 空表会让这道测试变成永远绿的摆设。
//
// ── English ─────────────────────────────────────────────────────────────────────
//
// The generator boundary's **keeper test**: every `sql/keelbase-*.sql` is either a `specs/*.json` output or
// declared in `SpecCodegen.HAND_WRITTEN`. Neither ⇒ that file is a second source, and this test goes red at
// once, naming it and handing over the fix.
//
//     node --test scripts/boundary-keeper.test.mjs
//     KEELBASE_ROOT=<another checkout> node --test scripts/boundary-keeper.test.mjs   # reverse proof
//
// **Why this exists on top of `--check-boundary`** — the judgement in `Boundary.check` is unchanged, but it
// is a Maven command (`bash scripts/gen-from-spec.sh --check-boundary`) that runs in CI's `generator` job
// only; people do not run it locally, so "added a file, forgot to edit one Java file" took about nine hours
// to be seen on CI (2026-11-03, `sql/keelbase-member.sql`). This one reads the **source text** — no JDK, no
// Maven, no network, one `node --test` — so the same sentence is readable at the earliest point; the Maven
// check still guards the build-time judgement itself. There is one statement of the rule (the
// `HAND_WRITTEN` list and the `specs/` output names) and both read that same fact.
//
// **It has to be falsifiable itself**: besides the real repository, four fixture cases — undeclared ⇒ red
// and named, declared ⇒ green, a Spec's output ⇒ green, a name that appears only in a comment ⇒ still red
// (a comment is not a declaration). Plus one more: a declaration shape the parser does not understand
// **throws** instead of quietly reading an empty list, which would turn this test into decoration.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const ROOT = process.env.KEELBASE_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')

/** 声明所在的 Java 文件 —— 仓内文档说「新增手写文件必须声明」时指的就是它。 / The Java file the declaration lives in. */
const DECLARATION = 'keelbase-codegen/src/main/java/cn/iocoder/yudao/codegen/SpecCodegen.java'

const read = (root, rel) => readFileSync(join(root, rel), 'utf8')

/**
 * 去掉 Java 的行注释与块注释，**字符串里的不算**。`HAND_WRITTEN` 的注释里点着带反引号的文件名
 * （`sql/keelbase-assistant-menus.sql` 之类），不去掉就会被当成声明。
 *
 * Strip Java's line and block comments, **except inside string literals**. The `HAND_WRITTEN` comments name
 * files in backticks; reading those as declarations would turn a red into a green.
 */
function stripComments(src) {
  let out = ''
  let i = 0
  let inString = false
  while (i < src.length) {
    const c = src[i]
    if (inString) {
      out += c
      if (c === '\\') {
        out += src[i + 1] ?? ''
        i += 2
        continue
      }
      if (c === '"') inString = false
      i += 1
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      i += 1
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    out += c
    i += 1
  }
  return out
}

/**
 * 从 `SpecCodegen.java` 的源码里读出 `HAND_WRITTEN` 那一列。形状是 `= List.of(` … `)`，里面每条都是一个
 * 字符串字面量；**读不懂就抛错** —— 若哪天有人把它改成变量拼接，这条测试要当场红，而不是读成空表后放行。
 *
 * Read the `HAND_WRITTEN` list out of `SpecCodegen.java`. The shape is `= List.of(` … `)` with one string
 * literal per entry; anything else **throws**, so turning the list into a concatenation of variables reddens
 * this test instead of silently reading as empty.
 */
function handWritten(src) {
  const clean = stripComments(src)
  const anchor = /HAND_WRITTEN\s*=\s*List\.of\s*\(/.exec(clean)
  assert.ok(anchor, `${DECLARATION} no longer has \`HAND_WRITTEN = List.of(...)\` — this reader has to learn the new shape`)

  const open = clean.indexOf('(', anchor.index)
  let depth = 0
  let close = -1
  for (let i = open; i < clean.length; i += 1) {
    if (clean[i] === '(') depth += 1
    else if (clean[i] === ')') {
      depth -= 1
      if (depth === 0) {
        close = i
        break
      }
    }
  }
  assert.notEqual(close, -1, `unterminated List.of( in ${DECLARATION}`)

  const body = clean.slice(open + 1, close)
  const entries = []
  let residue = ''
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] !== '"') {
      residue += body[i]
      continue
    }
    let value = ''
    let j = i + 1
    while (j < body.length && body[j] !== '"') {
      if (body[j] === '\\') {
        value += body[j + 1] ?? ''
        j += 2
        continue
      }
      value += body[j]
      j += 1
    }
    entries.push(value)
    i = j
  }
  const unexpected = residue.replace(/[\s,]/g, '')
  assert.equal(
    unexpected,
    '',
    `HAND_WRITTEN holds something that is not a string literal (${JSON.stringify(unexpected)}) — a declaration ` +
      'this reader cannot evaluate would be read as absent; keep the list to plain string literals',
  )
  return entries
}

/**
 * 每个 Spec 产出哪一份 SQL —— 与 `Boundary` 同一个算法：取 `objects` 的第一个，`module` 缺省时用 `feature`，
 * 文件名是 `sql/keelbase-<module>.sql`。
 *
 * Which SQL each Spec produces, by `Boundary`'s own rule: the first object, `module` defaulting to `feature`,
 * the file named `sql/keelbase-<module>.sql`.
 */
function specOutputs(root) {
  const dir = join(root, 'specs')
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      const spec = JSON.parse(readFileSync(join(dir, file), 'utf8'))
      const first = Array.isArray(spec.objects) && spec.objects.length > 0 ? spec.objects[0] : null
      const module = first && typeof first.module === 'string' ? first.module : spec.feature
      assert.equal(typeof module, 'string', `specs/${file} names neither an object module nor a feature`)
      return `sql/keelbase-${module}.sql`
    })
}

/**
 * 边界管着的那些 SQL：`sql/` 下以 `keelbase-` 开头、`.sql` 结尾的每一份 —— 与 `Boundary.check` 枚举的是
 * **同一批**（它列 `sql/` 目录，不查 git）。判据只有一份，故这里不另取一套。
 *
 * The SQL the boundary owns: every `sql/keelbase-*.sql` under `sql/` — **the same set** `Boundary.check`
 * enumerates (it lists the directory, not git). One judgement, so this does not invent a second set.
 */
function boundaryFiles(root) {
  return readdirSync(join(root, 'sql'))
    .filter((f) => f.startsWith('keelbase-') && f.endsWith('.sql'))
    .sort()
    .map((f) => `sql/${f}`)
}

function audit(root) {
  const declared = handWritten(read(root, DECLARATION))
  const generated = specOutputs(root)
  const actual = boundaryFiles(root)
  const undeclared = actual.filter((rel) => !generated.includes(rel) && !declared.includes(rel))
  return { declared, generated, actual, undeclared }
}

/** 红的时候要说的那几句话：改哪个文件、加哪一行、跑哪条命令复核。 / What a red says: which file, which line, which command re-checks it. */
function recipe(entries) {
  const lines = entries.map((rel) => `      "${rel}",`)
  return [
    `${entries.length} file(s) under sql/ are neither a Spec's output nor declared hand-written:`,
    ...entries.map((rel) => `  UNDECLARED  ${rel}`),
    '',
    'Either one of these is true — pick the one that is:',
    '  1. It is hand-written (no Spec produces it): open',
    `       ${DECLARATION}`,
    '     and add each line to the HAND_WRITTEN list, as its own entry:',
    ...lines,
    '  2. It should come from a Spec: add/point specs/*.json at this module and regenerate —',
    '       bash scripts/gen-from-spec.sh specs/<name>.json',
    '',
    'Then re-read the boundary both ways:',
    '  node --test scripts/boundary-keeper.test.mjs            # this test, no JDK needed',
    '  bash scripts/gen-from-spec.sh --check-boundary          # the build-time check, the same judgement',
  ].join('\n')
}

/** 一份只够这道测试跑的假仓库：`specs/` 一份、`sql/` 若干份、`SpecCodegen.java` 一段声明。 / Just enough of a repo for this test: one Spec, some SQL, a declaration block. */
function fixture({ specs, sql, declaration }) {
  const root = mkdtempSync(join(tmpdir(), 'boundary-keeper-'))
  mkdirSync(join(root, 'specs'), { recursive: true })
  mkdirSync(join(root, 'sql'), { recursive: true })
  mkdirSync(dirname(join(root, DECLARATION)), { recursive: true })
  for (const [name, body] of Object.entries(specs ?? {})) {
    writeFileSync(join(root, 'specs', name), typeof body === 'string' ? body : JSON.stringify(body, null, 2))
  }
  for (const name of sql ?? []) writeFileSync(join(root, 'sql', name), '-- fixture\n')
  writeFileSync(join(root, DECLARATION), declaration)
  return root
}

/** 伪 `SpecCodegen.java`：形状与真的同（`HAND_WRITTEN = List.of(...)`），`extras` 原样进类体。 / A fake `SpecCodegen.java` in the real shape; `extras` go into the class body as-is. */
const fakeDeclaration = (entries, extras = '') => `// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.codegen;

public final class SpecCodegen {
    static final List<String> HAND_WRITTEN = List.of(
${entries.map((e) => `            "${e}",`).join('\n')}
    );
${extras}
}
`

const PRODUCTS_SPEC = {
  feature: 'products',
  objects: [{ name: 'product', module: 'products', fields: [{ name: 'name', type: 'string' }] }],
}

const withFixture = (t, options) => {
  const root = fixture(options)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

test('the real repository: every sql/keelbase-*.sql is a Spec output or declared hand-written', () => {
  const { declared, generated, actual, undeclared } = audit(ROOT)

  // 空集不算数：枚举读坏了（路径挪了、过滤写错）会让下面那条断言永远成立。
  // Empty sets prove nothing: a broken enumeration would make the assertion below vacuously true.
  assert.ok(actual.length > 0, `no sql/keelbase-*.sql found under ${ROOT} — the enumeration, not the boundary, is wrong`)
  assert.ok(generated.length > 0, `no Specs read from ${join(ROOT, 'specs')} — the enumeration, not the boundary, is wrong`)
  assert.ok(declared.length > 0, `HAND_WRITTEN read as empty — the declaration reader, not the boundary, is wrong`)

  assert.deepEqual(undeclared, [], recipe(undeclared))
})

test('a new hand-written file that is not declared goes red, is named, and is given the fix', (t) => {
  const root = withFixture(t, {
    specs: { 'products.json': PRODUCTS_SPEC },
    sql: ['keelbase-member.sql'],
    declaration: fakeDeclaration([]),
  })
  const { undeclared } = audit(root)
  assert.deepEqual(undeclared, ['sql/keelbase-member.sql'], 'an undeclared SQL file must be reported')
  const message = recipe(undeclared)
  assert.match(message, /UNDECLARED  sql\/keelbase-member\.sql/, 'the message must name the file')
  assert.match(message, /keelbase-codegen\/src\/main\/java\/cn\/iocoder\/yudao\/codegen\/SpecCodegen\.java/, 'the message must name the file to edit')
  assert.match(message, /"sql\/keelbase-member\.sql",/, 'the message must give the line to add')
  assert.match(message, /--check-boundary/, 'the message must name the command that re-checks it')
})

test('declaring the same file turns it green', (t) => {
  const root = withFixture(t, {
    specs: { 'products.json': PRODUCTS_SPEC },
    sql: ['keelbase-member.sql'],
    declaration: fakeDeclaration(['sql/keelbase-member.sql']),
  })
  assert.deepEqual(audit(root).undeclared, [], 'a declared file is inside the boundary')
})

test("a file a Spec produces needs no declaration", (t) => {
  const root = withFixture(t, {
    specs: { 'products.json': PRODUCTS_SPEC },
    sql: ['keelbase-products.sql'],
    declaration: fakeDeclaration([]),
  })
  assert.deepEqual(audit(root).undeclared, [], "a Spec's output is inside the boundary")
})

test('a name that only appears in a comment is not a declaration', (t) => {
  const root = withFixture(t, {
    specs: { 'products.json': PRODUCTS_SPEC },
    sql: ['keelbase-member.sql'],
    // 真文件里这种注释遍地都是（点着某份文件的来历，用的是反引号）。读进声明就会把红读成绿。
    // The real file is full of these: comments naming a file's provenance, in backticks. Reading them as
    // declarations would turn a red into a green.
    declaration: fakeDeclaration(
      [],
      '    // 会员建表脚本（`sql/keelbase-member.sql`，`ec4be4ac0b` 引入）是手写 DDL。\n' +
        '    // The member DDL (sql/keelbase-member.sql, landed in ec4be4ac0b) is hand-written.\n',
    ),
  })
  assert.deepEqual(audit(root).undeclared, ['sql/keelbase-member.sql'], 'a comment is not a declaration')
})

test('a declaration this reader cannot evaluate fails loudly instead of reading as empty', (t) => {
  const root = withFixture(t, {
    specs: { 'products.json': PRODUCTS_SPEC },
    sql: ['keelbase-member.sql'],
    declaration: `package cn.iocoder.yudao.codegen;

public final class SpecCodegen {
    static final String MEMBER = "sql/keelbase-member.sql";
    static final List<String> HAND_WRITTEN = List.of(MEMBER);
}
`,
  })
  assert.throws(() => audit(root), /not a string literal/, 'an unreadable declaration must throw, not pass')
})
