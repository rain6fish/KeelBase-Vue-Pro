#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 审计读者必须被挡在运行时的 AI 执行入口与写入口之外——守卫、它读的清单、以及它的注册，三处必须对得上。
//
//   node scripts/check-audit-reader-execution-guard.mjs
//
// 为什么需要这道检查：运行时的 `/ai/chat`、`/ai/chat/stream`、`/admin/ai/chat/stream`、`/ai/task` **没有** `@PreAuthorize`，
// 引擎的闸门只按风险级与治理策略裁决、**不查权限规则源**。一个只有六个治理读面 `read` 的账户因此能让
// R1 工具真实执行，并让 R3 写生成一条**自己就能裁**的 `immediate` 确认。宿主侧的守卫
// （`YudaoAuditReaderExecutionGuard`）就是那道补墙；本检查读源码，确认：
//
//   ① 规则源暴露了 `isAuditReader`（守卫靠它认人）；
//   ② 守卫拿它裁决、并在命中清单时抛 `AccessDeniedException`；
//   ③ 注册把守卫挂上了清单里的每一条执行入口，以及**写侧**前缀（GET 仍放行）——确认的裁决，以及
//      副作用台账的撤销（`DELETE /ai/tool-effects/{id}`，运行时 `EffectController#revoke`：那里只判归属、
//      不查规则源；2026-10-25 实测读者能撤销自己名下的台账行）。
//
// 任何一处漂走 ⇒ 红。它不跑宿主（那要数据库），但它读的正是三份**必须一致**的源码。
//
// English:
//
// The audit reader must be outside the runtime's AI execution entries and write entries — the guard,
// the list it reads, and its registration have to agree.
//
// Why this check exists: the runtime's `/ai/chat`, `/ai/chat/stream`, `/admin/ai/chat/stream` and
// `/ai/task` carry **no** `@PreAuthorize`, and the engine's gate decides on risk level and governance
// policy only — it never
// consults the permission rule source. An account with `read` on six governance faces could therefore
// make an R1 tool run and raise an R3 write as an `immediate` confirmation it can decide itself. The
// host-side guard is the patch; this check reads the sources and confirms that (1) the rule source
// exposes `isAuditReader`, (2) the guard asks it and throws `AccessDeniedException` on a hit, and
// (3) the registration hangs the guard on every execution entry in the list plus the **write**
// prefixes (GET stays open) — deciding a confirmation, and revoking a side effect
// (`DELETE /ai/tool-effects/{id}`, the runtime's `EffectController#revoke`, which judges ownership
// only and never asks the rule source; measured 2026-10-25: the reader revoked its own ledger row).
// A drift in any of the three ⇒ red.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const BASE = join(ROOT, 'yudao-server', 'src', 'main', 'java', 'cn', 'iocoder', 'yudao', 'server', 'keelbase')
const RULES = join(BASE, 'YudaoAuditReaderRules.java')
const GUARD = join(BASE, 'YudaoAuditReaderExecutionGuard.java')
const CONFIG = join(BASE, 'YudaoAuditReaderWebConfig.java')

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

const rules = read(RULES)
const guard = read(GUARD)
const config = read(CONFIG)

if (rules && !/public\s+boolean\s+isAuditReader\s*\(/.test(rules)) {
  fail('YudaoAuditReaderRules 没有公开 isAuditReader —— 守卫认不到审计读者')
}
if (guard) {
  if (!/rules\.isAuditReader\s*\(/.test(guard)) fail('守卫没有问 isAuditReader')
  if (!/EXECUTION_PATHS/.test(guard)) fail('守卫没有读 EXECUTION_PATHS')
  if (!/WRITE_PREFIXES/.test(guard)) fail('守卫没有读 WRITE_PREFIXES')
  if (!/new\s+AccessDeniedException\s*\(/.test(guard)) fail('守卫没有抛出 AccessDeniedException')
  if (!/callerAuthenticator\.authenticate\s*\(/.test(guard)) fail('守卫没有经宿主自己的认证接缝取调用方')
  if (!/administrator\.isAdmin\s*\(/.test(guard)) fail('守卫没有沿用「管理员不看 audit_reader」的口径')
  // 写侧前缀只挡非 GET：读面（确认队列、台账列表）仍属该角色的正当射程。
  // Write prefixes refuse non-GET only: the read faces stay inside the role.
  if (!/!\s*"GET"\.equalsIgnoreCase\s*\(/.test(guard)) {
    fail('守卫的写侧判据没有排除 GET —— 读面会被一起关掉')
  }
}

const list = (source, name) => {
  const match = source.match(new RegExp(`${name}\\s*=\\s*List\\.of\\(([\\s\\S]*?)\\);`))
  return match ? [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : []
}
const executionPaths = list(config, 'EXECUTION_PATHS')
const writePrefixes = list(config, 'WRITE_PREFIXES')
for (const path of [
  '/ai/chat',
  '/ai/chat/stream',
  '/admin/ai/chat/stream',
  '/ai/task',
  // 对抗展示的运行入口会执行引擎动作；控制器有管理员闸，账本仍按同一清单登记。
  // The showcase's run entry executes engine actions; the controller carries an administrator gate,
  // and the ledger still records it from the same list.
  '/ai/security-showcase/run/*',
  // 宿主自己的 AI 执行形状（2026-10-19 全扫）：AI 模块的发送口径没有 @PreAuthorize，
  // AI1 的会话流会装配工具。 / The host's own AI execution shapes (2026-10-19 sweep): the AI
  // module's send has no @PreAuthorize, and AI1's session stream assembles tools.
  '/admin-api/ai/chat/message/send',
  '/admin-api/ai/chat/message/send-stream',
  '/admin-api/ai1/session/message/send-stream'
]) {
  if (!executionPaths.includes(path)) fail(`EXECUTION_PATHS 少了 ${path}`)
}
for (const prefix of [
  '/ai/confirmations',
  '/ai/my/confirmations',
  // 副作用台账的撤销：运行时 `EffectController#revoke` 只判归属、不查规则源。
  // The ledger's revoke: the runtime's `EffectController#revoke` judges ownership only.
  '/ai/tool-effects'
]) {
  if (!writePrefixes.includes(prefix)) fail(`WRITE_PREFIXES 少了 ${prefix}`)
}

const registered = (() => {
  const match = config.match(/addPathPatterns\s*\(([\s\S]*?)\)\s*;/)
  return match ? [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : []
})()
if (!/implements\s+WebMvcConfigurer/.test(config)) fail('注册类没有实现 WebMvcConfigurer')
for (const path of executionPaths) {
  if (!registered.includes(path)) fail(`拦截器没有注册执行入口 ${path}`)
}
for (const prefix of writePrefixes) {
  if (!registered.includes(`${prefix}/**`)) fail(`拦截器没有注册写侧 ${prefix}/**`)
}

if (failures.length) {
  console.error('FAIL: audit-reader execution guard')
  for (const message of failures) console.error(`  - ${message}`)
  process.exit(1)
}
console.log(`PASS: audit-reader execution guard · ${executionPaths.length} execution entries · ${writePrefixes.length} write prefixes`)
