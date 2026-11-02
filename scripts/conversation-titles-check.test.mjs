// SPDX-License-Identifier: Apache-2.0
//
// `check-conversation-titles.mjs` 的判定**不空转**：同一套检查必须在 0.1.14 形状上红、在 0.1.15 形状上绿。
//
// 这条测试不连任何栈，只跑脚本自己的 `--self-test`（两个本地桩，`node:http`）。它守的是那两条判词本身：
// 谁把「缺端点 + 缺字段」的判读改坏了、或把 0.1.15 形状的检查放宽到永远绿，这里先红。真正的红绿读数由
// `conformance` 作业对着跑着的宿主取（见 `.github/workflows/ci.yml` 的 F-2 那一步）。
//
// ---
//
// The verdict of `check-conversation-titles.mjs` is **not vacuous**: the same checks must go red on the
// 0.1.14 shape and green on the 0.1.15 shape.
//
// This test touches no stack; it runs the script's own `--self-test` (two local `node:http` stubs). What it
// guards is the two verdicts themselves: loosen "missing endpoint + missing fields" or widen the 0.1.15
// shape's checks until they can never fail, and this goes red first. The real red/green reading is taken by
// the `conformance` job against a running host (see the F-2 step in `.github/workflows/ci.yml`).
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-conversation-titles.mjs')

test('the verdict separates the 0.1.14 shape from the 0.1.15 shape', () => {
  // 非零退出会让 execFileSync 抛错 —— 那正是「自证失败」应当的样子。
  // A non-zero exit makes execFileSync throw — which is exactly what a failed self-test should look like.
  const out = execFileSync(process.execPath, [SCRIPT, '--self-test'], { encoding: 'utf8' })
  assert.match(out, /self-test PASS/)
  assert.match(out, /0\.1\.14-shaped=RUNTIME_PREDATES_F2/)
  assert.match(out, /0\.1\.15-shaped=OK/)
})
