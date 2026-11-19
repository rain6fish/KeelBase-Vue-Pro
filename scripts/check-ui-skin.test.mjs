#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Keeper for `scripts/check-ui-skin.sh`. Two facts, both of which have to be true for the gate to mean
// anything: every one of its assertions actually reddens when the thing it guards is broken (the
// script's own `--self-test`), and the repository as it stands is green (so a red is news).
//
// The interesting half is the first one. The audit that produced this gate (2026-11-19) found that no
// test went red when the default skin changed, so an assertion nobody has watched fail is worth
// nothing here: `--self-test` copies a fixture, breaks exactly one thing, and requires the *right*
// assertion id in the output. This file is what makes that run in both places — it is in the
// `scripts/*.test.mjs` glob, so `node scripts/gates.mjs` and CI's `script-tests` job both execute it.
//
// `scripts/check-ui-skin.sh` 的看门测试。两件事都成立，这道闸才有意义：它的每条断言在它守的东西坏掉时
// 真的会红（脚本自己的 `--self-test`），以及本仓现状是绿的（于是红才是新闻）。
//
// 有意思的是前一半。促成这道闸的审计（2026-11-19）发现默认皮肤一改没有任何测试变红，故一条**没人见过它
// 变红**的断言在这里一文不值：`--self-test` 复制一份夹具、只改坏一处，并要求输出里点到**该红的那条**
// 断言 id。本文件就是让它两处都跑起来的那一环 —— 它落在 `scripts/*.test.mjs` 的 glob 里，故
// `node scripts/gates.mjs` 与 CI 的 `script-tests` job 都会执行它。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const GATE = join(HERE, 'check-ui-skin.sh')

const run = (...args) =>
  spawnSync('bash', [GATE, ...args], { cwd: ROOT, encoding: 'utf8' })

test('every assertion of the skin gate reddens when the thing it guards breaks', () => {
  const result = run('--self-test')
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  // Exit 3 is the script's own "a control did not behave as expected" — distinct from the real check's
  // 0/1/2 on purpose, so this failure cannot be confused with "the tree is bad".
  // 3 是脚本自己的「有对照没按预期表现」—— 与真实检查的 0/1/2 刻意分开，故这个失败不会被误读成「树坏了」。
  assert.equal(result.status, 0, `self-test exited ${result.status}:\n${output}`)
  assert.match(output, /SELF-TEST PASS \(\d+\/\d+ controls behaved as expected\)/)
  // A self-test that ran two controls would also "pass"; a lower bound keeps a shrinking set visible.
  // 只跑两个对照的「自检」也会「通过」；设一个下界，让集合缩水看得见。
  const m = /SELF-TEST PASS \((\d+)\/\d+/.exec(output)
  assert.ok(Number(m[1]) >= 10, `only ${m[1]} controls ran:\n${output}`)
})

test('the repository as it stands passes the skin gate', () => {
  const result = run()
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  assert.equal(result.status, 0, `skin check exited ${result.status}:\n${output}`)
  assert.match(output, /SKIN CHECK PASS \(skin: harbor\)/)
})

test('an unknown skin is refused with the build script\'s own wording', () => {
  const result = spawnSync('bash', [GATE], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, KEELBASE_UI_SKIN: 'no-such-skin' },
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  assert.equal(result.status, 2, `expected exit 2, got ${result.status}:\n${output}`)
  assert.match(output, /unknown KEELBASE_UI_SKIN: no-such-skin \(expected harbor or product\)/)
  assert.match(output, /legal values \/ 合法取值: harbor, product/)
})
