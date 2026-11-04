// SPDX-License-Identifier: Apache-2.0
//
// `check-sql-aliases.mjs` 的判定**不空转**：同一套检查必须在种下 camelCase 别名时红、在改成下划线时绿。
//
// 这里不碰产品码，也不连库：每个用例在临时目录里搭一棵最小的仓（`yudao-server/pom.xml` + 一个部署模块），
// 种一条 SQL，跑脚本，读退出码与诊断。它守的是判词本身 —— 谁把规则放宽到永远绿、或把 Bean 结果也一并判红，
// 这里先红。真栈上的红/绿读数另由交接件记（把两处历史写法放回产品码、跑红、复原），CI 上的绿由
// `.github/workflows/ci.yml` 的 `sql-aliases` 作业取。
//
// English
//
// The verdict of `check-sql-aliases.mjs` is **not vacuous**: the same check must go red when a camelCase
// alias is seeded and green once it becomes snake_case.
//
// Nothing here touches product code or a database: each case builds a minimal repository in a temp
// directory (`yudao-server/pom.xml` + one deployed module), seeds one SQL fragment, runs the script, and
// reads the exit code and the diagnostics. What it guards is the verdict itself — loosen the rule until it
// can never fail, or redden Bean results too, and this goes red first. The red/green reading on the real
// tree is recorded in the hand-over (put the two historical spellings back, run, restore); the green on CI
// comes from the `sql-aliases` job in `.github/workflows/ci.yml`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-sql-aliases.mjs')

const SERVER_POM = '<project><dependencies><dependency>' +
  '<artifactId>yudao-module-demo</artifactId></dependency></dependencies></project>'
const MODULE_POM = (id) => `<project><artifactId>${id}</artifactId></project>`

function write(root, rel, text) {
  const file = join(root, rel)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

// 一棵最小仓：一个部署模块 `demo`，外加一个只用来验 `--all` 的 `other`。
// A minimal repository: one deployed module `demo`, plus an `other` used only to exercise `--all`.
function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'sql-aliases-'))
  write(root, 'yudao-server/pom.xml', SERVER_POM)
  write(root, 'yudao-module-demo/pom.xml', MODULE_POM('yudao-module-demo'))
  write(root, 'yudao-module-other/pom.xml', MODULE_POM('yudao-module-other'))
  for (const [rel, text] of Object.entries(files)) write(root, rel, text)
  return root
}

function run(root, ...args) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' })
}

const JAVA = 'yudao-module-demo/src/main/java/demo/DemoMapper.java'
const XML = 'yudao-module-demo/src/main/resources/mapper/DemoMapper.xml'

const javaMapper = (sql) => `package demo;

import java.util.List;
import java.util.Map;

public interface DemoMapper {

    default Map<Long, Integer> selectPriceSum() {
        List<Map<String, Object>> rows = selectMaps(new QueryWrapperX<DemoDO>()
                .select("${sql}")
                .groupBy("wallet_id"));
        return null;
    }
}
`

const xmlMapper = (select) => `<mapper namespace="demo.DemoMapper">
  ${select}
</mapper>
`

const mapSelect = (sql) => `<select id="selectCount" resultType="java.util.Map">${sql}</select>`

test('a camelCase alias on a Java Map query is red and names the file, line and snake_case spelling', () => {
  const root = repo({ [JAVA]: javaMapper('SUM(price) AS priceSum') })
  try {
    const r = run(root)
    assert.equal(r.status, 1)
    assert.match(r.stderr, /DemoMapper\.java:10:/)
    assert.match(r.stderr, /`priceSum`/)
    assert.match(r.stderr, /AS price_sum/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a camelCase alias on an XML Map query is red', () => {
  const root = repo({ [XML]: xmlMapper(mapSelect('SELECT COUNT(*) AS fooBar FROM demo')) })
  try {
    const r = run(root)
    assert.equal(r.status, 1)
    assert.match(r.stderr, /DemoMapper\.xml:2:/)
    assert.match(r.stderr, /AS foo_bar/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the same shape under snake_case is green', () => {
  const root = repo({
    [JAVA]: javaMapper('SUM(price) AS price_sum'),
    [XML]: xmlMapper(mapSelect('SELECT COUNT(*) AS foo_bar FROM demo')),
  })
  try {
    const r = run(root)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /check-sql-aliases: OK/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a Bean result keeps its camelCase alias: MyBatis matches properties case-insensitively', () => {
  const root = repo({
    [XML]: xmlMapper('<select id="s" resultType="demo.DemoVO">SELECT COUNT(*) AS fooBar FROM demo</select>'),
  })
  try {
    const r = run(root)
    assert.equal(r.status, 0, r.stderr)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a double-quoted alias is allowed, and CAST AS DATE is not an alias', () => {
  const root = repo({
    [XML]: xmlMapper(mapSelect('SELECT COUNT(*) AS "fooBar" FROM demo')),
    [JAVA]: javaMapper('CAST(create_time AS DATE) AS day, COUNT(*) AS count'),
  })
  try {
    const r = run(root)
    assert.equal(r.status, 0, r.stderr)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a module outside the deployed scope is not judged by default, and --all judges it', () => {
  const rel = 'yudao-module-other/src/main/java/demo/OtherMapper.java'
  const root = repo({ [rel]: javaMapper('SUM(price) AS priceSum') })
  try {
    const green = run(root)
    assert.equal(green.status, 0, green.stderr)
    assert.match(green.stdout, /outside the deployed scope/)

    const all = run(root, '--all')
    assert.equal(all.status, 1)
    assert.match(all.stderr, /OtherMapper\.java/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an upper-case-only alias warns but does not fail: same failure, outside this round’s rule', () => {
  const root = repo({ [JAVA]: javaMapper('folder_id AS FOLDER_ID, COUNT(*) AS UNREAD_COUNT') })
  try {
    const r = run(root)
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stderr, /warn: .*`FOLDER_ID`/)
    assert.match(r.stdout, /2 warning\(s\)/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a backtick-quoted alias is red: PostgreSQL has no backticks', () => {
  const root = repo({ [JAVA]: javaMapper('SUM(price) AS `priceSum`') })
  try {
    const r = run(root)
    assert.equal(r.status, 1)
    assert.match(r.stderr, /backtick-quoted alias/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an unknown argument is a usage error (exit 2), never a quiet pass', () => {
  const root = repo({})
  try {
    const r = run(root, '--nonsense')
    assert.equal(r.status, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
