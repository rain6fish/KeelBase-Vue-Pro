#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Regenerates one host patch from an editable working copy, so its hunk headers and line counts are
// never written by hand.
//
// A host patch is a diff against the upstream admin UI at the pinned commit. Editing it by hand means
// recomputing hunk counts by eye, and a wrong count only shows up as "patch does not apply" at build
// time. This script keeps the patch a diff: it starts a throwaway git repository holding the upstream
// files the patch touches, commits them, applies the current patch, and leaves that tree for editing.
// A second run diffs the tree against the commit and writes the patch back.
//
//   node scripts/regen-host-patch.mjs keelbase-ui/host-patches/0002-governance-ui.patch --dir /tmp/regen-0002
//   # edit the files under /tmp/regen-0002, then run the same line again
//
// 从可编辑的工作副本重新生成一份宿主补丁，hunk 头与行数不再手写。
//
// 宿主补丁是对钉住的上游后台界面提交的 diff。手改意味着用眼睛重算 hunk 计数，而算错只会在构建时报
// 「补丁贴不上」。本脚本让补丁始终是 diff：先建一个临时 git 仓，放入补丁涉及的**上游**文件并提交，
// 再应用当前补丁，把树留给编辑；第二次运行把树与提交做 diff，写回补丁。

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(message) {
  console.error(message)
  process.exit(1)
}

function git(cwd, args, options = {}) {
  return execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', ...options })
}

function parseArgs(argv) {
  const out = { patch: null, dir: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--dir') out.dir = argv[++i]
    else if (arg === '--ui') out.ui = argv[++i]
    else if (!out.patch) out.patch = arg
    else fail(`unexpected argument: ${arg}`)
  }
  if (!out.patch || !out.dir) {
    fail('usage: node scripts/regen-host-patch.mjs <patch> --dir <workdir> [--ui <checkout>]')
  }
  return out
}

/** The paths a patch writes, in both halves of every `diff --git` line. */
function touchedPaths(patchText) {
  const paths = []
  for (const m of patchText.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)) {
    if (m[1] !== m[2]) fail(`rename in patch is not supported: ${m[1]} -> ${m[2]}`)
    paths.push(m[1])
  }
  if (!paths.length) fail('the patch touches no file')
  return [...new Set(paths)]
}

/** The upstream commit the build pins, read from the one place it is declared. */
function pinnedUpstream() {
  const build = readFileSync(join(ROOT, 'scripts/build-host-ui.sh'), 'utf8')
  const m = build.match(/KEELBASE_YUDAO_UI_REF:-([0-9a-f]{40})/)
  if (!m) fail('could not read the pinned upstream commit from scripts/build-host-ui.sh')
  return m[1]
}

const args = parseArgs(process.argv.slice(2))
args.dir = resolve(args.dir)
const patchAbs = resolve(ROOT, args.patch)
const metaPath = join(args.dir, '.regen.json')

const patchText = readFileSync(patchAbs, 'utf8')
const paths = touchedPaths(patchText)

if (!existsSync(metaPath)) {
  const ui = resolve(args.ui || process.env.KEELBASE_YUDAO_UI || join(ROOT, 'target/yudao-ui-admin-vue3'))
  if (!existsSync(ui)) fail(`no upstream checkout at ${ui} — pass --ui or run scripts/build-host-ui.sh once`)
  const head = git(ui, ['rev-parse', 'HEAD']).trim()
  const pin = pinnedUpstream()
  if (head !== pin) {
    fail(`the checkout is at ${head.slice(0, 12)}, but the patches target ${pin.slice(0, 12)}`)
  }
  mkdirSync(args.dir, { recursive: true })
  git(args.dir, ['init', '-q'])
  for (const path of paths) {
    const blob = execFileSync('git', ['-C', ui, 'show', `HEAD:${path}`])
    mkdirSync(dirname(join(args.dir, path)), { recursive: true })
    writeFileSync(join(args.dir, path), blob)
  }
  git(args.dir, ['add', '-A'])
  git(args.dir, ['-c', 'user.name=keelbase-regen', '-c', 'user.email=regen@keelbase.invalid', 'commit', '-q', '-m', `upstream ${pin}`])
  // 补丁在检出树里可能带 CRLF（取决于 core.autocrlf），而上游 blob 是 LF。git apply 能读 LF 补丁去贴
  // CRLF 文件，反过来不行，故一律按 LF 喂给它。
  //
  // The patch in the checkout may carry CRLF (core.autocrlf), while the upstream blobs are LF. git apply
  // accepts an LF patch onto CRLF files but not the reverse, so it is always handed the LF form.
  const patchLf = `${args.dir}.regen.in.patch`
  writeFileSync(patchLf, patchText.replace(/\r\n/g, '\n'))
  git(args.dir, ['apply', patchLf])
  writeFileSync(join(args.dir, '.git/info/exclude'), '.regen.json\n')
  writeFileSync(metaPath, JSON.stringify({ patch: args.patch, ui, upstream: pin, paths }, null, 2))
  console.log(`prepared ${args.dir} — edit ${paths.join(', ')} there, then run the same line again`)
  process.exit(0)
}

const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
if (meta.patch !== args.patch) fail(`${args.dir} was prepared for ${meta.patch}, not ${args.patch}`)
if (meta.paths.join('\n') !== paths.join('\n')) fail('the patch now touches a different set of files')

const status = git(args.dir, ['status', '--porcelain'])
const untracked = status.split('\n').filter((line) => line.startsWith('??'))
if (untracked.length) fail(`untracked file(s) in ${args.dir} — a patch can only carry the files it names:\n${untracked.join('\n')}`)

const diff = git(args.dir, ['diff', '--no-color', '--no-ext-diff']).replace(/\r\n/g, '\n')
if (!diff.trim()) fail('nothing changed in the working copy — edit the files first')

const temp = `${args.dir}.regen.out.patch`
writeFileSync(temp, diff)
try {
  git(args.dir, ['apply', '--check', '-R', temp])
} catch {
  fail('the regenerated diff does not reverse-apply to the working copy — refusing to write it')
}
writeFileSync(patchAbs, diff)

const headers = [...diff.matchAll(/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/gm)]
console.log(`wrote ${args.patch} (${diff.split('\n').length - 1} lines, ${headers.length} hunk(s))`)
console.log(git(args.dir, ['diff', '--stat']).trimEnd())
