#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// `audit_reader` 的治理页不出现写控件：没有撤销、没有保存、没有可编辑的闸门/启用/角色。
//
//   node scripts/check-audit-reader-write-controls.mjs
//
// 为什么需要这道检查：服务端已经对这些写答 403，但 Proxy-2 实测里按钮仍然画在页面上 —— 一个点了
// 才被拒的控件，本来就不该递给只读者。角色判断放在 `consoleRole.ts`，四个页面共用；本检查钉住
// 「哪些控件受它管」，防止新加一个按钮时漏掉。
//
// English:
//
// The audit reader's governance pages show no write controls: no revoke, no save, no editable gate,
// enabled flag or roles.
//
// Why this check exists: the server already answers 403 for those writes, but Proxy-2 saw the buttons
// drawn anyway — a control that only refuses when pressed should not have been offered to a read-only
// reader. The role rule lives in `consoleRole.ts` and the four pages share it; this check pins which
// controls obey it, so a newly added button cannot quietly miss it.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const VIEWS = join(ROOT, 'keelbase-ui', 'host-overlay', 'src', 'views', 'keelbase', 'governance')
const ROLE = join(ROOT, 'keelbase-ui', 'host-overlay', 'src', 'keelbase', 'consoleRole.ts')
const ROLE_CORE = join(ROOT, 'keelbase-ui', 'host-overlay', 'src', 'keelbase', 'consoleRoleCore.mjs')

const failures = []
const fail = (message) => failures.push(message)
const read = (file) => {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    fail(`missing ${file}`)
    return ''
  }
}
const require = (source, pattern, message) => {
  if (!pattern.test(source)) fail(message)
}

const role = read(ROLE)
const roleCore = read(ROLE_CORE)
require(roleCore, /AUDIT_READER_ROLE\s*=\s*'audit_reader'/, 'consoleRoleCore.mjs 没有认 `audit_reader`')
require(roleCore, /\(roles \?\? \[\]\)\.includes\(AUDIT_READER_ROLE\)/, 'consoleRoleCore.mjs 的判据不是「角色里有没有 audit_reader」')
require(role, /canWriteWithRoles\(userStore\.getRoles\)/, 'consoleRole.ts 没有把宿主角色清单交给判据')
require(role, /canWrite:\s*computed\(\(\)\s*=>\s*!readOnly\.value\)/, '`canWrite` 必须正好是只读的反面')

const actionCenter = read(join(VIEWS, 'ActionCenterPage.vue'))
require(actionCenter, /useConsoleWriteAllowed/, 'ActionCenterPage 没有用共享角色判断')
require(actionCenter, /c\.mode === 'immediate' && canWrite/, '行动中心的批准/拒绝没有受角色判断管')
require(actionCenter, /row\.revocable && canWrite/, '行动中心的撤销没有受角色判断管')
// U2：全局确认队列只有管理员够得到，故那张卡只在管理员登录时取数；它的批准/拒绝按钮同样受 `canWrite`。
// U2: the global confirmation queue is administrator-only, so that card is fetched only for an administrator,
// and its approve/decline buttons obey `canWrite` like every other write control.
require(actionCenter, /isAdmin && approvalVisible/, '行动中心的「等待第二人批准」卡没有管理员判据')
require(actionCenter, /v-else-if="canWrite"[\s\S]{0,500}decideApproval\(/, '行动中心的第二人批准按钮没有受角色判断管')

const tools = read(join(VIEWS, 'ToolsPage.vue'))
require(tools, /useConsoleWriteAllowed/, 'ToolsPage 没有用共享角色判断')
require(tools, /row\.revocable && canWrite/, '写入台账的撤销没有受角色判断管')

const policy = read(join(VIEWS, 'PolicyCenterPage.vue'))
require(policy, /useConsoleWriteAllowed/, 'PolicyCenterPage 没有用共享角色判断')
require(policy, /v-if="canWrite"[^>]*@click="save"/, '策略中心的保存按钮没有受角色判断管')
require(policy, /row\.override && canWrite/, '策略中心的「恢复默认」没有受角色判断管')
require(policy, /v-model="granularity"[^>]*:disabled="!canWrite"/, '审计粒度没有对只读读者禁用')
require(policy, /row\.mode \|\| USE_DEFAULT[^>]*:disabled="!canWrite"/, '闸门选择没有对只读读者禁用')
require(policy, /:model-value="row\.enabled"[^>]*:disabled="!canWrite"/, '启用开关没有对只读读者禁用')
require(policy, /:model-value="row\.allowedRoles"[\s\S]{0,200}:disabled="!canWrite"/, '角色选择没有对只读读者禁用')

// 审计链页本来就没有写控件；钉住这一点，免得以后「顺手」加一个撤销。
// The audit chain page has no write control; pin that so a later "helpful" revoke cannot slip in.
const auditChain = read(join(VIEWS, 'AuditChainPage.vue'))
if (/effectApi\.revoke\s*\(/.test(auditChain)) {
  fail('审计链页出现撤销调用 —— 它应是只读的')
}
if (/@click="[^"]*\b(save|resetRow|revoke)\b/.test(auditChain)) {
  fail('审计链页出现写控件 —— 它应是只读的')
}

if (failures.length > 0) {
  console.error(`check-audit-reader-write-controls: ${failures.length} failed`)
  for (const message of failures) console.error(`  FAIL ${message}`)
  process.exit(1)
}

console.log('check-audit-reader-write-controls: 4 pages, 0 failed')
