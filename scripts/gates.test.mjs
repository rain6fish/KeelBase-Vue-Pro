#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// `scripts/gates.mjs` 的看门测试：**本地跑的集合 == CI 跑的集合**。
//
// 它解析 `.github/workflows/ci.yml` 的 `run:` 行，两个方向都断言：
//
//   1. CI 点名的每一道门，`scripts/gates.mjs` 的清单里都有；
//   2. 清单里的每一道门，CI 里也在跑（只在本地跑的必须显式声明、带理由、并在文件头点名）。
//
// 再加两条同源的：盘上每个 `scripts/check-*.mjs` 要么是清单里的门禁、要么显式声明为「读数而非门禁」；
// 声明为「不是门禁」的调用必须还在 CI 里（过期的声明会让它变成藏真门禁的地方）。
//
// 为什么要有它：清单可以悄悄漂。CI 加一步、入口没跟，本地就会给你一个**假的全绿**；入口多写一道、
// CI 没跑，本地绿而 CI 红。两个方向各自都会红并点名 —— 这就是「同一份判据、两个执行处」的机器形态。
//
// 解析器有 fixture 用例：它读得懂单行 `run:`、`|` 块、`>-` 折行块；也读得懂「新加一道门」的情形
// （真文件上的反向用例就是加一条假门、删一条真门）。真文件那几条用例每次推送都会跑 —— 它们就在
// `scripts/*.test.mjs` 的 glob 里，由 CI 的 `script-tests` job 执行。
//
// ── English ─────────────────────────────────────────────────────────────────────
//
// The keeper for `scripts/gates.mjs`: **the set run locally == the set run in CI**.
//
// It parses the `run:` lines of `.github/workflows/ci.yml` and asserts both directions:
//
//   1. every gate CI names has an entry in the manifest;
//   2. every entry in the manifest is one CI runs (anything local-only must be declared, carry a reason,
//      and be named in the file header).
//
// Two more of the same kind: every `scripts/check-*.mjs` on disk is either a gate in the manifest or
// declared as "a reading, not a gate"; and a declaration of "not a gate" must still be an invocation
// CI makes (a stale declaration would let a real gate hide there).
//
// Why this exists: the list can drift quietly. A step added to CI without an entry here means a
// **false green** locally; an entry here that CI never runs means green locally and red in CI. Each
// direction turns red and names the offender — that is "the same criterion, two execution sites" in a
// form that fails.
//
// The parser has fixture cases: it reads a single-line `run:`, a `|` block and a `>-` folded block; and
// it reads "a gate was just added" (the reverse cases on the real file add a fake gate and drop a real
// one). The cases against the real file run on every push — they are in the `scripts/*.test.mjs` glob
// that CI's `script-tests` job executes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ROOT,
  GATES,
  NOT_GATES,
  NOT_GATES_ON_DISK,
  LOCAL_ONLY,
  argvFor,
  checkParity,
  parseCiGates,
  parseUiDependentTests,
} from './gates.mjs';

const CI_PATH = path.join(ROOT, '.github/workflows/ci.yml');
const ciText = fs.readFileSync(CI_PATH, 'utf8');
const uiDependentTests = parseUiDependentTests(ciText);
const testFiles = fs
  .readdirSync(path.join(ROOT, 'scripts'))
  .filter((f) => f.endsWith('.test.mjs'))
  .map((f) => `scripts/${f}`)
  .sort();
const diskCheckScripts = fs
  .readdirSync(path.join(ROOT, 'scripts'))
  .filter((f) => /^check-.*\.mjs$/.test(f) && !f.endsWith('.test.mjs'))
  .sort();
const gatesSource = fs.readFileSync(path.join(ROOT, 'scripts/gates.mjs'), 'utf8');

// `check-path-refs.mjs` reads every `scripts/…` path this repository writes about itself and requires
// it to exist — fixture strings included. The fake gate names below are therefore assembled at run
// time; spelled literally they would be citations of files that do not exist.
// `check-path-refs.mjs` 会读本仓写到自己身上的每条 `scripts/…` 路径并要求它存在，fixture 里的字符串也算。
// 下面那些假门名字因此是运行时拼出来的；写成字面量就成了「引用了不存在的文件」。
const S = 'scripts';

const parity = (overrides = {}) =>
  checkParity({
    ciText,
    uiDependentTests,
    testFiles,
    diskCheckScripts,
    header: gatesSource,
    ...overrides,
  });

// ── the parser ────────────────────────────────────────────────────────────────

const FIXTURE = `
jobs:
  a-job:
    steps:
      # a commented run: node ${S}/check-commented.mjs is not an invocation
      - name: single line
        run: node ${S}/check-single.mjs
      - name: block scalar
        run: |
          set -euo pipefail
          node ${S}/check-in-block.mjs
          echo "a shell line that names no script"
      - name: folded scalar
        run: >-
          KEELBASE_JDK25="$JAVA_HOME" bash scripts/gen-from-spec.sh specs/products.json --check
          --and-a-flag-that-belongs-to-it
      - name: the glob
        run: |
          pattern=$(echo "$UI_DEPENDENT_TESTS" | tr ' ' '|')
          node --test $(ls scripts/*.test.mjs | grep -Ev "^($pattern)$")
      - name: a guard that merely mentions a command
        run: |
          for f in $UI_DEPENDENT_TESTS; do
            if ! grep -q "node --test $f" .github/workflows/ci.yml; then
              exit 1
            fi
          done
`;

test('the parser reads every run: shape CI uses', () => {
  const keys = parseCiGates(FIXTURE).map((inv) => inv.key);
  assert.deepEqual(keys, [
    `node ${S}/check-single.mjs`,
    `node ${S}/check-in-block.mjs`,
    'bash scripts/gen-from-spec.sh specs/products.json --check --and-a-flag-that-belongs-to-it',
    'node --test scripts/*.test.mjs',
  ]);
});

test('the parser reads a gate that was just added', () => {
  const added = `${FIXTURE}\n      - name: a brand new gate\n        run: node ${S}/check-brand-new.mjs\n`;
  const keys = parseCiGates(added).map((inv) => inv.key);
  assert.ok(keys.includes(`node ${S}/check-brand-new.mjs`), 'a newly added run: must be read');
});

test('the parser normalises the UI directory placeholder both ways', () => {
  const keys = parseCiGates('        run: node scripts/check-rendered-copy.mjs "$UI_DIR"\n').map((inv) => inv.key);
  assert.deepEqual(keys, ['node scripts/check-rendered-copy.mjs <ui-dir>']);
});

test('the parser does not mistake the grep guard for an invocation', () => {
  const keys = parseCiGates(FIXTURE).map((inv) => inv.key);
  assert.ok(!keys.some((k) => k.includes('$f')), 'the quoted `node --test $f` inside grep is not a call');
});

// ── the real files, both directions ───────────────────────────────────────────

test('CI → manifest: every gate CI names has an entry', () => {
  const failures = parity().filter((f) => f.startsWith('ci.yml:'));
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('manifest → CI: every entry is one CI runs', () => {
  const failures = parity().filter((f) => f.startsWith('gate `'));
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('the two directions together are empty', () => {
  const failures = parity();
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('the UI-dependent tests CI excludes are exactly the ones the entry runs on their own', () => {
  assert.ok(Array.isArray(uiDependentTests) && uiDependentTests.length === 2, 'ci.yml must declare the exclusion');
  for (const file of uiDependentTests) {
    assert.ok(testFiles.includes(file), `${file} must exist`);
    const gate = GATES.find((g) => g.cmd.join(' ') === `node --test ${file}`);
    assert.ok(gate, `${file} is excluded from the glob, so the entry needs its own gate`);
    assert.equal(gate.prereq, 'ui', `${file} needs the UI checkout`);
  }
});

// ── reverse cases: the guard must go red, and name the offender ────────────────

test('a gate removed from the manifest turns the check red and names it', () => {
  const without = GATES.filter((g) => g.id !== 'path-refs');
  const failures = parity({ gates: without });
  assert.ok(
    failures.some((f) => f.includes('check-path-refs.mjs')),
    `dropping path-refs from the manifest must be caught, got:\n${failures.join('\n')}`,
  );
});

test('a gate added to ci.yml but not to the manifest turns the check red and names it', () => {
  const anchor = '        run: node scripts/check-family-block.mjs';
  assert.ok(ciText.includes(anchor), 'the anchor this reverse case edits must still be in ci.yml');
  const withFake = ciText.replace(
    anchor,
    `${anchor}\n      - name: a gate nobody declared\n        run: node ${S}/check-not-in-the-list.mjs`,
  );
  const failures = parity({ ciText: withFake });
  assert.ok(
    failures.some((f) => f.includes(`${S}/check-not-in-the-list.mjs`)),
    `an undeclared CI gate must be caught, got:\n${failures.join('\n')}`,
  );
});

test('a gate dropped from ci.yml turns the entry → CI direction red', () => {
  const anchor = 'run: node scripts/check-path-refs.mjs';
  assert.ok(ciText.includes(anchor), 'the anchor this reverse case edits must still be in ci.yml');
  const failures = parity({ ciText: ciText.replace(anchor, 'run: echo this step no longer runs the gate') });
  assert.ok(
    failures.some((f) => f.startsWith('gate `path-refs`')),
    `an entry CI no longer runs must be caught, got:\n${failures.join('\n')}`,
  );
});

test('a check script on disk that is neither a gate nor declared turns the check red', () => {
  const failures = parity({ diskCheckScripts: [...diskCheckScripts, 'check-forgotten.mjs'] });
  assert.ok(
    failures.some((f) => f.includes('check-forgotten.mjs')),
    `an unregistered gate-shaped script must be caught, got:\n${failures.join('\n')}`,
  );
});

test('a not-a-gate declaration that CI no longer runs turns the check red', () => {
  const failures = parity({
    notGates: [...NOT_GATES, { id: 'stale', key: `bash ${S}/not-run-any-more.sh`, reason: 'x' }],
  });
  assert.ok(
    failures.some((f) => f.includes('not-run-any-more.sh')),
    `a stale not-a-gate declaration must be caught, got:\n${failures.join('\n')}`,
  );
});

test('a local-only gate needs a reason and a header mention', () => {
  const bare = parity({ localOnly: [{ id: 'a-local-gate', reason: '' }] });
  assert.equal(bare.filter((f) => f.includes('a-local-gate')).length, 2, 'no reason and no header mention');

  const declared = parity({
    localOnly: [{ id: 'a-local-gate', reason: 'needs hardware CI does not have' }],
    header: '… a-local-gate …',
  });
  assert.deepEqual(declared, [], declared.join('\n'));
});

// ── the manifest's own hygiene ────────────────────────────────────────────────

test('no two gates share an id or a command', () => {
  const ids = GATES.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate id');
  const keys = GATES.map((g) => g.cmd.join(' '));
  assert.equal(new Set(keys).size, keys.length, 'duplicate command');
});

test('every gate names a script that exists', () => {
  for (const gate of GATES) {
    for (const token of gate.cmd) {
      if (!/^(scripts|deploy)\/[^<*]/.test(token) || token.includes('*')) continue;
      assert.ok(fs.existsSync(path.join(ROOT, token)), `${gate.id} names ${token}, which is not on disk`);
    }
  }
});

test('the script-tests gate expands to every test file except the two that need a checkout', () => {
  const gate = GATES.find((g) => g.id === 'script-tests');
  const argv = argvFor(gate, { uiDir: '/nowhere', testFiles, uiDependentTests });
  assert.deepEqual(argv.slice(0, 2), ['node', '--test']);
  assert.deepEqual(argv.slice(2), testFiles.filter((f) => !uiDependentTests.includes(f)));
});

test('every prerequisite class in the manifest is one the runner can detect', () => {
  const known = new Set(['node', 'jdk', 'ui', 'built', 'stack']);
  for (const gate of GATES) assert.ok(known.has(gate.prereq), `${gate.id} has unknown prerequisite ${gate.prereq}`);
});

test('every not-a-gate declaration carries a reason', () => {
  for (const decl of [...NOT_GATES, ...NOT_GATES_ON_DISK]) assert.ok(decl.reason.trim(), `${decl.id ?? decl.file} has no reason`);
});

test('LOCAL_ONLY is empty — every gate here also runs in CI', () => {
  assert.deepEqual(LOCAL_ONLY, []);
});
