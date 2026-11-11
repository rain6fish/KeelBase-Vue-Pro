// SPDX-License-Identifier: Apache-2.0
//
// 台账「谁」那一列的名字走**服务端联名**：控制台问宿主的 `caller-names`，读者不必持有用户查询权限
// （M7 第三位读者场 F-14；用户 2026-10-27 裁定）。
//
//     node --test scripts/caller-names.test.mjs
//     KEELBASE_ROOT=<另一份检出> node --test scripts/caller-names.test.mjs   # 反向证明用
//
// 三条都钉在源码上：控制台调的是哪条路径、宿主有没有把这条路径开出来、以及那条端点**不挂在权限注解上**
// （它靠裁剪答案范围，而不是靠授予）。
//
// The ledger's "who" column goes through a **server-side join**: the console asks the host's
// `caller-names`, and a reader needs no user-query permission (finding F-14, M7's third reader session;
// ruled by the user on 2026-10-27).
//
//     node --test scripts/caller-names.test.mjs
//     KEELBASE_ROOT=<another checkout> node --test scripts/caller-names.test.mjs   # reverse proof
//
// All three assertions sit at the source: which path the console calls, whether the host serves that path,
// and that the endpoint carries **no permission annotation** — it bounds its answer instead of granting.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.KEELBASE_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')
const OVERLAY = 'keelbase-ui/host-overlay/src/keelbase/callerNames.ts'
const CONTROLLER = 'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/YudaoCallerNamesController.java'
const DIRECTORY = 'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/YudaoCallerDirectory.java'
const ROUTE = '/keelbase/caller-names'

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

test('the console asks the host for caller names, not the user directory', () => {
  const overlay = read(OVERLAY)
  assert.ok(overlay.includes(`'${ROUTE}'`), `the console no longer calls ${ROUTE}`)
  assert.doesNotMatch(overlay, /from '@\/api\/system\/user'/,
    'the console still imports the user directory — the reader roles cannot read it')
})

test('the host serves the route the console calls', () => {
  const controller = read(CONTROLLER)
  assert.ok(controller.includes(`"/admin-api${ROUTE}"`), `the host does not map /admin-api${ROUTE}`)
})

test('the endpoint is bounded by its answer, not gated by a permission', () => {
  const controller = read(CONTROLLER)
  assert.doesNotMatch(controller, /@PreAuthorize|@SaCheckPermission/,
    'a permission annotation would hand the reader roles a new grant, which is what this route exists to avoid')
  const directory = read(DIRECTORY)
  assert.ok(directory.includes('ai_audit_logs'), 'the answer is no longer bounded by the audit chain')
  assert.ok(directory.includes('system_operate_log'), 'the answer is no longer bounded by the operation audit')
  assert.ok(directory.includes('isAuditReader'), 'the ledger-wide answer is no longer limited to an audit reader')
  // G-3（2026-11-08 走查）：管理员与审计读者同一范围 —— 最常打开审计页的是管理员，他过去只看到裸 id。
  // G-3 (measured 2026-11-08): an administrator gets the audit reader's range — the administrator is the
  // one who opens the audit page most, and used to see bare ids there.
  assert.ok(directory.includes('administrators.isAdmin'), 'the administrator no longer reads the ledger-wide names (G-3)')
})
