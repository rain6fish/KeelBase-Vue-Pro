// SPDX-License-Identifier: Apache-2.0
//
// 台账「哪个业务对象」那一格的名字走**服务端联名**：控制台问宿主的 `record-names`，审计读者不必持有
// `crm:customer:query`（`YD-42` 的 C③；2026-10-30 按提案甲-1 批准）。
//
//     node --test scripts/record-names.test.mjs
//     KEELBASE_ROOT=<另一份检出> node --test scripts/record-names.test.mjs   # 反向证明用
//
// 五条都钉在源码上：控制台调的是哪条路径、它**不再**去问模块自己、宿主把这条路径开出来了、那条端点
// **不挂在权限注解上**（它靠裁剪答案范围与掩码，而不是靠授予），以及**被拒那条**的名字确实被接进了六问。
//
// The record name behind the ledger's "which business object" cell goes through a **server-side join**: the
// console asks the host's `record-names`, so an audit reader needs no `crm:customer:query` (YD-42's C③;
// approved as 甲-1 on 2026-10-30).
//
//     node --test scripts/record-names.test.mjs
//     KEELBASE_ROOT=<another checkout> node --test scripts/record-names.test.mjs   # reverse proof
//
// All five assertions sit at the source: which path the console calls, that it no longer asks the module
// itself, whether the host serves that path, that the endpoint carries **no permission annotation** — it
// bounds its answer and masks it instead of granting — and that the **refused** call's name reaches the six
// questions.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.KEELBASE_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..')
const OVERLAY = 'keelbase-ui/host-overlay/src/keelbase/recordNames.ts'
const PAGE = 'keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue'
const QUESTIONS = 'keelbase-ui/host-overlay/src/keelbase/sixQuestions.mjs'
const CONTROLLER = 'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/YudaoRecordNamesController.java'
const DIRECTORY = 'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/YudaoRecordNames.java'
const ROUTE = '/keelbase/record-names'

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8')

/** 行尾先归一（`autocrlf` 的检出是 CRLF），再把注释去掉：注释里会提到旧路径，那不是它在调它。 */
/** Normalise line endings first (an `autocrlf` checkout is CRLF), then strip comments: a comment may name
 *  the old path to say why it moved, and that is not the file calling it. */
const codeOf = (source) =>
  source
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

test('the console asks the host for record names, not the CRM module', () => {
  const code = codeOf(read(OVERLAY))
  assert.ok(code.includes(`'${ROUTE}'`), `the console no longer calls ${ROUTE}`)
  assert.doesNotMatch(code, /\/crm\/customer\/get/,
    'the console asks the CRM module again — the reader roles cannot read it')
})

test('the console still exports the tool → record-type declaration the page imports', () => {
  // 页面用 `toolResultType` 把「工具」翻成「哪种记录」（被拒那次的提议只带工具名）。这条导出在改写这个
  // 模块时被删掉过一次，构建才报出来 —— 故这里钉住它。
  //
  // The page uses `toolResultType` to turn "the tool" into "which kind of record" (a refused call's
  // proposal carries only the tool name). This export was dropped once while this module was rewritten,
  // and only the build caught it — so it is pinned here.
  const code = codeOf(read(OVERLAY))
  assert.match(code, /export function toolResultType\(/, 'the page imports toolResultType and the module no longer exports it')
})

test('the host serves the narrow face', () => {
  const controller = read(CONTROLLER)
  assert.ok(controller.includes(`"/admin-api${ROUTE}"`), `the host no longer serves /admin-api${ROUTE}`)
  assert.match(controller, /@GetMapping/, 'the face is not a GET')
})

test('the face bounds its answer instead of holding a grant', () => {
  const controller = read(CONTROLLER)
  assert.doesNotMatch(controller, /@PreAuthorize/,
    'the face carries a permission annotation — it is meant to narrow its answer, not to grant')
})

test('the host masks the name and caps the refs before it answers', () => {
  const directory = read(DIRECTORY)
  assert.match(directory, /offsetByCodePoints/, 'the mask no longer keeps exactly one character')
  assert.match(directory, /MAX_REFS/, 'the ref cap is gone — the face could be walked like a table')
  assert.match(directory, /confirmation_requests/,
    'the refused call is answered from the ledger only — its proposal would go unnamed again')
  assert.match(directory, /side_effects/, 'the write ledger is no longer read')
})

test('the refused call’s name reaches the six questions', () => {
  const page = codeOf(read(PAGE))
  const questions = codeOf(read(QUESTIONS))
  assert.match(page, /proposalNameOf\(/, 'the page never asks the host about a proposal’s record')
  assert.match(page, /proposalName:/, 'the page does not hand the proposal’s name to the six questions')
  assert.match(questions, /proposalName/, 'the six-question module ignores the proposal’s name — C③ stays a type and a key')
})
