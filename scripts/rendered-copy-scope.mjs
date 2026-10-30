// SPDX-License-Identifier: Apache-2.0
//
// 两道渲染级文案闸共用的一处范围：哪些 `.vue` 算「这一层发布的」，以及要抓哪两种记号。
//
// 范围**写明**，不是为了让它悄悄变绿：覆盖目录里我们自己写的那些，加上补丁改到的那些。上游自己的
// 模板不在射程内——它带着自己的书写习惯（实测有三处代码生成页的 placeholder 用反引号包字段名），
// 而那不是这一层要改的事。两道闸读同一个函数，故它们不可能对「本层发布了什么」给出两种答案。
//
// ── English ─────────────────────────────────────────────────────────────────────────────────────
//
// The one scope the two rendered-copy gates share: which `.vue` files count as "this layer ships",
// and which two markers are looked for.
//
// The scope is **stated**, not quietly shortened: the files we write in the overlay, plus the ones a
// patch edits. Upstream's own templates are out of scope — they carry their own writing habits (three
// code-generator pages put a backtick around a field name in a placeholder, measured), and changing
// those is not this layer's job. Both gates read the same function, so they cannot disagree about what
// this layer ships.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

export const MARKERS = [
  ['**', 'paired asterisks (Markdown bold)'],
  ['`', 'a backtick (Markdown code span)'],
]

/** Every `.vue` this layer ships, as a path inside the checkout. */
export function deltaVueFiles (root, ui) {
  const files = new Set()
  const overlay = join(root, 'keelbase-ui', 'host-overlay')
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      const stat = statSync(path)
      if (stat.isDirectory()) walk(path)
      else if (entry.endsWith('.vue')) files.add(join(ui, relative(overlay, path)))
    }
  }
  walk(overlay)

  const patches = join(root, 'keelbase-ui', 'host-patches')
  for (const patch of readdirSync(patches).filter((f) => f.endsWith('.patch'))) {
    for (const line of readFileSync(join(patches, patch), 'utf8').split('\n')) {
      const match = /^\+\+\+ b\/(.+\.vue)\r?$/.exec(line)
      if (match) files.add(join(ui, match[1]))
    }
  }
  return [...files]
}
