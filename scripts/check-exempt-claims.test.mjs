// SPDX-License-Identifier: Apache-2.0
// 门自己的证伪：同样的断言，合规 ⇒ 绿、违反 ⇒ 红且点名。
//
// 一半用**构造的 fixture 根**（只放断言要读的那几个声明），一半用**真仓 + 换一份账本**：
// 前者证明断言读的是声明而不是账本文本，后者证明它在真实源码上真的会红。
//
// The gate's own falsification: same assertion, compliant ⇒ green, violated ⇒ red and named.
// Half the cases build a fixture root holding nothing but the declarations the assertion reads; the other half
// run against the real tree with a swapped ledger, proving the gate really goes red on real sources.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const GATE = join(HERE, 'check-exempt-claims.mjs')
const LEDGER = join(ROOT, 'conformance/governance-coverage.tsv')

const HEADER = 'module\tobject\tservice\tposture\tevidence\treason\towner\trecheck'
const run = (args) => spawnSync(process.execPath, [GATE, ...args], { encoding: 'utf8' })
const exemptCount = () =>
  readFileSync(LEDGER, 'utf8').split(/\r?\n/).filter((l) => l.split('\t')[3] === 'exempt').length

const write = (file, text) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

/**
 * 一个最小源码根：只放断言要读的那些声明。
 * A minimal root holding only the declarations the assertions read.
 */
const fixture = ({ ledger, files }) => {
  const root = mkdtempSync(join(tmpdir(), 'exempt-claims-'))
  write(join(root, 'conformance/governance-coverage.tsv'), [HEADER, ...ledger].join('\n'))
  for (const [path, text] of Object.entries(files)) write(join(root, path), text)
  return root
}

const row = (module, object, service, reason) => [module, object, service, 'exempt', '', reason, '@rain', '2099-01-01'].join('\t')

const javaOf = (fqcn) => fqcn.split('.').join('/') + '.java'

const personalFixture = ({ ownerField = 'private Long userId;' } = {}) =>
  fixture({
    ledger: [row('demo', 'foo', 'demo.service.FooService', '个人簿记，无跨人问题')],
    files: {
      [join('yudao-module-demo/src/main/java', javaOf('demo.service.FooService'))]: 'public interface FooService {}\n',
      [join('yudao-module-demo/src/main/java', javaOf('demo.service.FooServiceImpl'))]:
        'public class FooServiceImpl implements FooService {\n    private FooDO foo;\n}\n',
      [join('yudao-module-demo/src/main/java', javaOf('demo.dal.dataobject.FooDO'))]:
        `public class FooDO {\n    private Long id;\n    ${ownerField}\n}\n`,
    },
  })

test('真仓现行账本：全部断言成立 ⇒ 绿', () => {
  const r = run([])
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.match(r.stdout, new RegExp(`exempt ${exemptCount()} 行`))
})

test('fixture：合规的「个人簿记」⇒ 绿', (t) => {
  const root = personalFixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const r = run(['--root', root])
  assert.equal(r.status, 0, r.stderr + r.stdout)
})

test('fixture：DO 去掉 userId 后「个人簿记」⇒ 红，并点名服务与理由首句', (t) => {
  const root = personalFixture({ ownerField: '' })
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const r = run(['--root', root])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /demo\/foo demo\.service\.FooService/)
  assert.match(r.stderr, /违反 personal/)
  assert.match(r.stderr, /个人簿记/)
})

test('fixture：理由以「本批未接」开头 ⇒ 红（那是 gap 的语义）', (t) => {
  const root = personalFixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  write(join(root, 'conformance/governance-coverage.tsv'), [HEADER, row('demo', 'foo', 'demo.service.FooService', '本批未接；同族，下一批')].join('\n'))
  const r = run(['--root', root])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /违反 deferred/)
})

test('fixture：「整模块弃用」三处声明齐 ⇒ 绿；保留清单里放回该模块 ⇒ 红', (t) => {
  const module = 'ai2'
  const files = {
    'deploy/demo-ecs/module-scope.sql': "coalesce(path, '') not in ('', '/system')\n",
    'deploy/demo-ecs/seed-manifest.txt': `skip keelbase-${module}.sql # 应用面已关停\n`,
    [join('yudao-server/src/main/java', javaOf('cn.iocoder.yudao.server.keelbase.GuardWebConfig'))]:
      `class GuardWebConfig { void add() { registry.addInterceptor(g).addPathPatterns("/admin-api/${module}/**"); } }\n`,
    [join(`yudao-module-${module}/src/main/java`, javaOf(`${module}.service.AnyService`))]: 'public interface AnyService {}\n',
  }
  const root = fixture({ ledger: [row(module, 'any', `${module}.service.AnyService`, '整模块弃用（D52 应用面已关停）')], files })
  t.after(() => rmSync(root, { recursive: true, force: true }))
  assert.equal(run(['--root', root]).status, 0)

  write(join(root, 'deploy/demo-ecs/module-scope.sql'), `coalesce(path, '') not in ('', '/system', '/${module}')\n`)
  const r = run(['--root', root])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /违反 module-off/)
  assert.match(r.stderr, /仍在 .*module-scope\.sql 的保留清单里/)
})

test('真仓：把一条 CRM 行改成「整模块弃用」⇒ 红（crm 的菜单没关停）', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'exempt-ledger-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const ledger = join(dir, 'ledger.tsv')
  const service = 'cn.iocoder.yudao.module.crm.service.product.CrmProductCategoryService'
  writeFileSync(ledger, readFileSync(LEDGER, 'utf8').replace(/^crm\tproduct-category\t.*$/m, row('crm', 'product-category', service, '整模块弃用（D52 应用面已关停）')))
  const r = run(['--ledger', ledger])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /CrmProductCategoryService/)
  assert.match(r.stderr, /违反 module-off/)
})

test('真仓：对一条被工具引用的服务声明「工具面无引用」⇒ 红', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'exempt-ledger-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const ledger = join(dir, 'ledger.tsv')
  const service = 'cn.iocoder.yudao.module.fms.service.config.FmsAccountUserService'
  const reason = '账套成员校验面；工具面无引用（本服务未被任何 *Tools 调用）'
  writeFileSync(ledger, readFileSync(LEDGER, 'utf8').replace(/^fms\taccount-user\t.*$/m, row('fms', 'account-user', service, reason)))
  const r = run(['--ledger', ledger])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /FmsAccountUserService/)
  assert.match(r.stderr, /违反 no-tool-face/)
})

test('真仓：理由里的权限码不存在 ⇒ 红', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'exempt-ledger-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const ledger = join(dir, 'ledger.tsv')
  const service = 'cn.iocoder.yudao.module.oa.service.seal.OaSealService'
  writeFileSync(ledger, readFileSync(LEDGER, 'utf8').replace(/^oa\tseal\t.*$/m, row('oa', 'seal', service, '印章台账（keeper_user_id），管理面 oa:seal:nonexistent')))
  const r = run(['--ledger', ledger])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /违反 citations/)
  assert.match(r.stderr, /oa:seal:nonexistent/)
})

test('真仓：理由里的类与行号解析不到 ⇒ 红', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'exempt-ledger-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const ledger = join(dir, 'ledger.tsv')
  const service = 'cn.iocoder.yudao.module.oa.service.seal.OaSealService'
  writeFileSync(ledger, readFileSync(LEDGER, 'utf8').replace(/^oa\tseal\t.*$/m, row('oa', 'seal', service, '印章台账（keeper_user_id），管理面 oa:seal:*；判定见 NoSuchClass:12')))
  const r = run(['--ledger', ledger])
  assert.equal(r.status, 1)
  assert.match(r.stderr, /NoSuchClass/)
})
