// SPDX-License-Identifier: Apache-2.0
//
// N5's real-stack rehearsal (2026-11-21) §3.6 / §4 blocker 4: the host's native operation-log page
// (`/system/log/operate-log`) does not read like the six questions — the time carries no zone, and the
// operator cell is **blank** on the AI-caused row (the host's `@Trans` joined no nickname), while the
// `1` under 业务编号 is easy to misread as the operator. A reader taking this page as the second entry
// would record readings that do not line up with the audit chain.
//
// The patch changes **one upstream file** only: the time goes through the six questions' own `zonedTime`,
// the operator through the audit chain's narrow directory (`resolveCallerNames`), name over account. It
// changes no upstream structure and no host business table.
//
// Run: node --test scripts/operate-log-readings.test.mjs
//
// N5 真栈预演（2026-11-21）§3.6 / §4 阻塞 4：宿主的原生操作日志页（`/system/log/operate-log`）与六问不同形 ——
// 时间不带时区，操作人一列在 AI 引起的那一行上是**空白**（宿主 `@Trans` 没联出昵称），而下方「业务编号」
// 的 `1` 很容易被读成操作人。读者若把这一页当第二入口，就会记下与审计链对不上的读数。
//
// 这一份补丁只改**一个上游文件**：时间走六问同一个 `zonedTime`，操作人走审计链同一条窄名录
// （`resolveCallerNames`），名字在上、账号在下。不改上游结构、不动宿主业务表。
//
// 运行：node --test scripts/operate-log-readings.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

const PATCH_FILE = '0008-operate-log-readings.patch'
const PATCH = `keelbase-ui/host-patches/${PATCH_FILE}`
const UPSTREAM = 'src/views/system/operatelog/index.vue'

/** 补丁新增的行，去掉 `+++` 文件头。 / The lines a patch adds, minus the `+++` file header. */
const added = (text) =>
  text
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n')

test('the patch touches exactly one upstream file, and it is the native operation-log page', () => {
  const patch = read(PATCH)
  const targets = [...patch.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map((m) => m[2])
  assert.deepEqual(targets, [UPSTREAM], 'the patch must edit the operation-log page and nothing else')
})

test('time goes through the six questions’ formatter, and the zone-less formatter is gone', () => {
  const lines = added(read(PATCH))
  assert.match(lines, /import \{ zonedTime \} from '@\/keelbase\/sixQuestions\.mjs'/, 'the page does not import the shared formatter')
  assert.match(lines, /:formatter="timeFormatter"/, 'the time column no longer goes through the shared formatter')
  assert.match(lines, /const timeFormatter = \(_row: any, _column: any, value: any\) => zonedTime\(value\)/, 'timeFormatter does not call zonedTime')
  assert.doesNotMatch(lines, /import \{ dateFormatter \} from '@\/utils\/formatTime'/, 'the zone-less formatter is still imported')
  assert.doesNotMatch(lines, /dateFormatter/, 'a column still renders the zone-less formatter')
})

test('the operator cell prefers the host’s own name, then the directory, and never prints the id as a name', () => {
  const lines = added(read(PATCH))
  assert.match(lines, /<el-table-column label="操作人" align="center" prop="userName" width="150">/, 'the operator column no longer renders through a slot')
  assert.match(lines, /\{\{ whoText\(row\) \}\}/, 'the operator cell no longer goes through whoText')
  assert.match(lines, /if \(row\.userName\) return row\.userName/, 'the host’s own name is no longer preferred')
  assert.match(lines, /if \(!row\.userId\) return '未记录'/, 'a row with no caller no longer says so')
  assert.match(lines, /name && name !== String\(row\.userId\) \? name : '姓名未记录'/, 'an unnamed id may still be printed as the name')
  assert.match(lines, /<div v-if="row\.userId" class="text-12px text-\[var\(--el-text-color-secondary\)\]">/, 'the account no longer sits on its own line')
})

test('the names come from the audit chain’s own narrow directory, after the rows land', () => {
  const lines = added(read(PATCH))
  assert.match(lines, /import \{ resolveCallerNames \} from '@\/keelbase\/callerNames'/, 'the page does not use the shared directory')
  assert.match(lines, /await resolveCallerNames\(data\.list\.map\(\(row\) => row\.userId\)\)/, 'the page never asks the directory for the rows it drew')
  assert.match(lines, /const callerNames = ref<Record<string, string>>\(\{\}\)/, 'the resolved names have nowhere to live')
})

test('one patch, no structural change: the file is edited in place and no other page is patched', () => {
  const patches = readdirSync(join(ROOT, 'keelbase-ui/host-patches')).filter((name) => name.endsWith('.patch'))
  assert.ok(patches.includes(PATCH_FILE), 'the new patch is not in host-patches/')
  const own = read(PATCH)
  assert.doesNotMatch(own, /^rename (from|to) /m, 'a rename is more than a reading fix')
  assert.doesNotMatch(own, /^new file mode/m, 'the patch adds a file where a reading fix should not')
})
