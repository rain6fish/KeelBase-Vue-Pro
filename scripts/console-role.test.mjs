// SPDX-License-Identifier: Apache-2.0
//
// `audit_reader` 关掉写控件，admin 与其余角色不变 —— 这是角色判据本身的可执行真值表。
//
//   node --test scripts/console-role.test.mjs
//
// 为什么不挂 SFC：本仓不带 Vue 测试运行器（见 `boundary-page.test.mjs` 的说明）。判据被拆到
// `consoleRoleCore.mjs` 正是为了能在这里**真跑**；页面模板是否都受它管，由
// `check-audit-reader-write-controls.mjs` 在源码层钉住。两者合起来覆盖「读者挂载后无写控件」。
//
// English:
//
// `audit_reader` turns write controls off; admin and every other role stay as they were — this is the
// executable truth table of the role predicate.
//
// Why not mount the SFC: this repository ships no Vue test runner (see `boundary-page.test.mjs`). The
// predicate was split into `consoleRoleCore.mjs` precisely so it can be **run** here; whether every
// template obeys it is pinned at the source level by `check-audit-reader-write-controls.mjs`. Together
// they cover "the reader mounts with no write controls".

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canWriteWithRoles,
  isHostAdministrator,
  AUDIT_READER_ROLE,
} from '../keelbase-ui/host-overlay/src/keelbase/consoleRoleCore.mjs'

test('an audit reader gets no write control', () => {
  assert.equal(canWriteWithRoles(['audit_reader']), false)
  assert.equal(canWriteWithRoles(['audit_reader', 'common']), false)
  assert.equal(AUDIT_READER_ROLE, 'audit_reader')
})

test('the administrator keeps every write control', () => {
  assert.equal(canWriteWithRoles(['super_admin']), true)
  assert.equal(canWriteWithRoles(['super_admin', 'tenant_admin']), true)
})

test('every other role is unchanged', () => {
  assert.equal(canWriteWithRoles(['common']), true)
  assert.equal(canWriteWithRoles(['auditor']), true, 'only the exact code `audit_reader` is the reader')
  assert.equal(canWriteWithRoles([]), true, 'a user with no role keeps the page as it was')
  assert.equal(canWriteWithRoles(null), true)
  assert.equal(canWriteWithRoles(undefined), true)
})

// U2：全局确认队列只有管理员读。判据是宿主自己的超管角色码，不是另造的一张名单；其余角色（含无角色）
// 一律**不是**管理员 —— 答错成「是」会朝一条只有管理员够得到的面发起请求。
//
// U2: only an administrator reads the global confirmation queue. The predicate is the host's own super-admin
// role code, not a second list; every other role (including none) is **not** an administrator — answering "yes"
// wrongly would send a request after a face only an administrator can reach.
test('only the host super administrator counts as an administrator', () => {
  assert.equal(isHostAdministrator(['super_admin']), true)
  assert.equal(isHostAdministrator(['common', 'super_admin']), true)
  assert.equal(isHostAdministrator(['tenant_admin']), false)
  assert.equal(isHostAdministrator(['audit_reader']), false)
  assert.equal(isHostAdministrator([]), false)
  assert.equal(isHostAdministrator(null), false)
  assert.equal(isHostAdministrator(undefined), false)
})
