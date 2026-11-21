// SPDX-License-Identifier: Apache-2.0
// CLI contract tests for the commit-message order checker: exit codes, the range, the warning/strict
// split on a single-language body, and the bare merge that must stay quiet. The fixed samples
// themselves live in `--self-test`, so they are not copied here — these tests drive the built command
// against throwaway repositories.
//
// 提交信息判据的 CLI 契约测试：退出码、区间、单语正文的「默认警告 / `--strict` 违规」两档，以及必须
// 保持安静的裸合并。固定样例本身住在 `--self-test` 里，这里不再抄一遍 —— 这些用例拿临时仓去驱动**真正
// 会跑的那个命令**。
//
// usage: node --test scripts/check-commit-order.test.mjs

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('./check-commit-order.mjs', import.meta.url))

const MIXED_SUBJECT = 'fix(audit): read the typed object key — 按运行时的判据读带类型对象键'
const EN_FIRST = `${MIXED_SUBJECT}\n\nEnglish prose, one paragraph.\n\n中文段落，独立成块。`
const ZH_FIRST = `${MIXED_SUBJECT}\n\n中文段落，独立成块。\n\nEnglish prose, one paragraph.`
const EN_ONLY = `${MIXED_SUBJECT}\n\nEnglish prose, one paragraph.`
const CO_AUTHORED = `${EN_FIRST}\n\nCo-Authored-By: Someone <someone@example.com>`

function git(cwd, args, env = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  return r.stdout
}

let counter = 0

// Every commit carries exactly the message we hand it, with `--allow-empty` so the shape of the test
// does not depend on writing a file.
function commitMessage(dir, message) {
  const msgFile = path.join(dir, `.msg-${++counter}`)
  fs.writeFileSync(msgFile, message.endsWith('\n') ? message : `${message}\n`, 'utf8')
  git(dir, ['commit', '-q', '--allow-empty', '-F', msgFile])
  fs.rmSync(msgFile, { force: true })
  return git(dir, ['rev-parse', 'HEAD']).trim()
}

function makeRepo(messages) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-order-'))
  git(dir, ['-c', 'init.defaultBranch=main', 'init', '-q', '.'])
  git(dir, ['config', 'user.name', 't'])
  git(dir, ['config', 'user.email', 't@t'])
  // A clean root commit, so `HEAD~1` is always a valid base and a range can be just the messages.
  commitMessage(dir, 'chore: initial commit\n\nEnglish prose, one paragraph.\n\n初始提交的中文段落。')
  for (const message of messages) commitMessage(dir, message)
  return dir
}

function run(args, cwd) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function withRepo(messages, body) {
  const dir = makeRepo(messages)
  try {
    return body(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

test('--self-test passes, and it is not vacuously green', () => {
  const r = run(['--self-test'])
  assert.equal(r.status, 0, r.stdout)
  // The suite must contain cases that *do* report, or "all green" would only prove it reports nothing.
  assert.match(r.stdout, /ok\s+Chinese-first body is reported as order/)
  assert.match(r.stdout, /ok\s+a Co-Authored-By trailer is reported/)
})

test('an English-first body passes and exits 0', () =>
  withRepo([EN_FIRST], (dir) => {
    const r = run(['--base', 'HEAD~1'], dir)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.doesNotMatch(r.stdout, /\[order\]|\[interleaved\]|\[co-authored-by\]/)
  }))

test('a Chinese-first body fails by default, and --report-only still exits 0', () =>
  withRepo([ZH_FIRST], (dir) => {
    const soft = run(['--base', 'HEAD~1', '--report-only'], dir)
    assert.equal(soft.status, 0, soft.stderr)
    assert.match(soft.stdout, /\[order\]/)

    const strict = run(['--base', 'HEAD~1'], dir)
    assert.equal(strict.status, 1, strict.stdout)
    assert.match(strict.stdout, /\[order\] FAIL/)
  }))

test('a single-language body warns by default and fails under --strict', () =>
  withRepo([EN_ONLY], (dir) => {
    const soft = run(['--base', 'HEAD~1'], dir)
    assert.equal(soft.status, 0, soft.stdout + soft.stderr)
    assert.match(soft.stdout, /\[single-language\] warn/)
    assert.match(soft.stdout, /1 warning\(s\)/)

    const strict = run(['--base', 'HEAD~1', '--strict'], dir)
    assert.equal(strict.status, 1, strict.stdout)
    assert.match(strict.stdout, /\[single-language\] FAIL/)
  }))

test('a Co-Authored-By trailer fails', () =>
  withRepo([CO_AUTHORED], (dir) => {
    const r = run(['--base', 'HEAD~1'], dir)
    assert.equal(r.status, 1, r.stdout)
    assert.match(r.stdout, /\[co-authored-by\] FAIL/)
  }))

// A bare merge has no body: it must not be reported, not even under --strict. This is the shape the
// 2026-11-20 pre-push review had to read by hand, and a checker that flags it would be noise.
test('a bare merge is not reported and does not fail', () =>
  withRepo([EN_FIRST], (dir) => {
    git(dir, ['checkout', '-q', '-b', 'feature'])
    commitMessage(dir, `${MIXED_SUBJECT}\n\nEnglish on the feature branch.\n\n特性分支上的中文。`)
    git(dir, ['checkout', '-q', 'main'])
    git(dir, ['merge', '-q', '--no-ff', 'feature', '-m', "Merge branch 'feature' into main"])
    const r = run(['--base', 'HEAD~1', '--strict'], dir)
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.doesNotMatch(r.stdout, /Merge branch/)
    assert.match(r.stdout, /skipped \(no body prose\)/)
  }))

test('only commits inside the range are judged', () =>
  withRepo([ZH_FIRST], (dir) => {
    const old = commitMessage(dir, EN_FIRST)
    // The Chinese-first commit is the base itself, so it is outside `base..HEAD`.
    const r = run(['--base', old], dir)
    assert.equal(r.status, 0, r.stdout)
    assert.doesNotMatch(r.stdout, /\[order\]/)
  }))

test('--range and --base agree, and the = spelling works', () =>
  withRepo([ZH_FIRST], (dir) => {
    const spaced = run(['--base', 'HEAD~1', '--json'], dir)
    const joined = run(['--range=HEAD~1..HEAD', '--report-only', '--json'], dir)
    assert.equal(spaced.status, 1, spaced.stdout)
    assert.deepEqual(JSON.parse(joined.stdout), JSON.parse(spaced.stdout))
  }))

test('--json prints JSON and nothing else', () =>
  withRepo([ZH_FIRST], (dir) => {
    const r = run(['--base', 'HEAD~1', '--json'], dir)
    const report = JSON.parse(r.stdout)
    assert.equal(report.violations, 1)
    assert.equal(report.findings[0].rule, 'order')
    assert.equal(report.findings[0].severity, 'violation')
  }))

test('an empty range is a clean run, not an error', () =>
  withRepo([EN_FIRST], (dir) => {
    const r = run(['--base', 'HEAD'], dir)
    assert.equal(r.status, 0, r.stdout)
    assert.match(r.stdout, /0 commit\(s\) judged/)
  }))

test('a base ref that does not resolve is a usage error, never a clean pass', () => {
  const dir = makeRepo([EN_FIRST])
  try {
    // No origin in this repository: the default base cannot resolve.
    const byDefault = run([], dir)
    assert.equal(byDefault.status, 2, byDefault.stdout)
    assert.match(byDefault.stderr, /does not resolve/)

    const explicit = run(['--base', 'origin/main'], dir)
    assert.equal(explicit.status, 2)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('an unknown argument, a missing value and a triple-dot range are usage errors', () => {
  assert.equal(run(['--nope']).status, 2)
  assert.equal(run(['--base']).status, 2)
  assert.equal(run(['--range', 'HEAD~1...HEAD']).status, 2)
})
