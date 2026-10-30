// SPDX-License-Identifier: Apache-2.0
//
// 决策轨迹页要给出**可辨认**的一列。2026-10-25 的 M7 读者在这一页只能说「会话只有编号，不方便辨认」——
// 每一行是 id、模型、条数、时间，读者无法指出「哪一条是我刚批的那次」。名字由用户起（`title`），
// **不**从消息正文派生（那是内容摘要，AU-4 刻意不带）；没有名字就如实写「未命名」。运行：
//
//     node --test scripts/conversation-trace-page.test.mjs
//
// 与 `boundary-page.test.mjs` 同一条理由停在源码层。
//
// The decision-trace page needs an identifying column. The 2026-10-25 M7 reader could only say "the
// conversations are just numbers". Each row was an id, a model, a count and a time, so the reader could
// not point at "the one I just approved". The name is the user's (`title`) and is **not** derived from
// message text (that is the content digest AU-4 withholds); with no name the row says so. Run:
//
//     node --test scripts/conversation-trace-page.test.mjs
//
// Source-level for the same reason as `boundary-page.test.mjs`.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = 'keelbase-ui/host-overlay/src/views/keelbase/governance/ConversationTracePage.vue'
const API = 'keelbase-ui/host-overlay/src/keelbase/governanceApi.ts'
const PATCH = 'keelbase-ui/host-patches/0002-governance-ui.patch'

const page = readFileSync(join(ROOT, PAGE), 'utf8')
const api = readFileSync(join(ROOT, API), 'utf8')
const template = page.slice(page.indexOf('<template>'), page.indexOf('<script'))
const script = page.slice(page.indexOf('<script'), page.lastIndexOf('</script>'))

function objectAt(text, start) {
  let depth = 0
  let quote = ''
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === "'" || ch === '"') quote = ch
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  throw new Error('unbalanced object literal')
}

function traceMessages() {
  const patch = readFileSync(join(ROOT, PATCH), 'utf8')
  const marker = '+    trace: {'
  const blocks = []
  for (let at = patch.indexOf(marker); at !== -1; at = patch.indexOf(marker, at + marker.length)) {
    const raw = objectAt(patch, patch.indexOf('{', at))
    const js = raw
      .split('\n')
      .map((line) => line.replace(/^\+/, ''))
      .join('\n')
    blocks.push(new Function(`return (${js})`)())
  }
  assert.equal(blocks.length, 2, 'the patch carries exactly two trace message blocks (English + Chinese)')
  const en = blocks.find((b) => b.title === 'Conversation trace')
  const zh = blocks.find((b) => b.title === '决策轨迹')
  assert.ok(en && zh, 'the English and Chinese trace blocks exist')
  return { en, zh }
}

function renameBody() {
  const at = script.indexOf('async function rename')
  assert.notEqual(at, -1, 'the rename handler is gone')
  return script.slice(at, script.indexOf('onMounted', at))
}

test('F-2: the page names a conversation and lets its owner name it', () => {
  assert.match(template, /t\('keelbase\.trace\.colTitle'\)/, 'the name column is gone')
  assert.match(template, /row\.title \|\| t\('keelbase\.trace\.untitled'\)/, 'an unnamed row no longer says so')
  assert.match(template, /rename\(row\)/, 'the rename control is gone')
})

// 名字是服务端的状态：改完要**重拉**，不能就地把那一行改掉 —— 就地改只同步了本页，另一个标签页里改的名字
// 这里看不到，这一行的条数/最近活动也停在旧值上（2026-10-29 的 F-2 验收把这条列为缺口）。
//
// The name is server state: after a rename the list is **refetched** rather than patched in place.
// Patching only syncs this page — a name changed in another tab never shows up here, and the row's
// count and last activity stay at their old values (the 2026-10-29 F-2 acceptance listed this as a gap).
test('F-2: a rename is taken from the server again, not patched into the row', () => {
  const body = renameBody()
  assert.match(body, /await conversationApi\.rename\(row\.id, title\)/, 'the page no longer calls the rename entry')
  assert.match(body, /await load\(\)/, 'the list is not refetched after a rename')
  assert.ok(
    !/row\.title\s*=/.test(body),
    'the row is patched in place again — a name changed in another tab would be missed',
  )
  assert.match(body, /trace\.value\?\.conversation\.id === row\.id/, 'the open trace is not refreshed when its own conversation is renamed')
  assert.match(body, /await open\(row\)/, 'the open trace is not refetched after a rename')
})

// 面板标题给同一个名字：列表里那一列说「哪条会话」，面板说「你打开的就是这条」——两处同一来源、同一回落。
// The panel's heading carries the same name: the list column says which conversation, the heading says
// "this is the one you opened" — same source, same fallback.
test('F-2: the trace panel names the conversation it is showing', () => {
  assert.match(
    template,
    /trace\.conversation\.title \|\| t\('keelbase\.trace\.untitled'\)/,
    'the panel heading carries no name',
  )
})

test('F-2: the count column reads the whole transcript, not the two turns the list carries', () => {
  assert.match(template, /row\.messageCount \?\? row\.messages\.length/, 'the count falls back to the list array again')
  assert.match(api, /messageCount\?: number/, 'the wire type lost `messageCount`')
  assert.match(api, /title\?: string \| null/, 'the wire type lost `title`')
})

test('F-2: both languages carry the column and the rename copy', () => {
  const { en, zh } = traceMessages()
  for (const [lang, block] of [['en', en], ['zh', zh]]) {
    for (const key of ['colTitle', 'untitled', 'rename', 'renamePrompt', 'renameTooLong', 'renamed', 'renameFailed']) {
      assert.ok(block[key], `${lang} is missing \`${key}\``)
    }
  }
})
