#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Read two hosts' application records against one shared list of assertions.
//
//   node scripts/compare-app-records.mjs
//   node scripts/compare-app-records.mjs --ruoyi <record.json> --vue-pro <record.json>
//
// This is the cheap half of `D43` ("do 丙 first"): it compares **records**, not live runs, so the two
// hosts never have to be alive at the same time, and the frozen RuoYi line is read and not touched.
// Each host still writes its own record with its own columns; what this adds is that both are read
// against `conformance/shared-assertions.json` instead of being two documents nobody compares.
//
// What it proves, and what it does not: it proves that for each shared assertion both records give
// **the same verdict**. It does **not** prove that the same scenario produced the same result on both
// hosts — the records were written by different gates at different times. That stronger claim is the
// other half of `D43` and has its own trigger.
//
// Defaults: this repository's newest record under `conformance/reports/`, and the other host's newest
// — its live reports directory if it has one, else the baseline it archived. A path that does not
// exist is reported as such rather than skipped.
//
// ── 中文 ────────────────────────────────────────────────────────────────────────
//
// 两份宿主应用记录，对着**同一张断言清单**读。
//
//   node scripts/compare-app-records.mjs
//   node scripts/compare-app-records.mjs --ruoyi <记录.json> --vue-pro <记录.json>
//
// 这是 `D43` 的**便宜那一半**（「先做丙」）：它比的是**记录**、不是实时对跑，故两个宿主**从不需要同时活着**，
// 而已冻结的 RuoYi 线**只读不动**。两边仍各自写自己的记录、用自己的栏位；这里加的是：两份都对着
// `conformance/shared-assertions.json` 读，而不是两份没人比对的文档。
//
// **它证明什么、不证明什么**：它证明**每一条共享断言上，两份记录给出同一个判定**。它**不**证明「同一场景
// 在两个宿主上产生了同一结果」——两份记录由不同的门禁、在不同的时间写下。那条更强的主张是 `D43` 的另一半，
// 有它自己的触发条件。
//
// 默认路径：本仓 `conformance/reports/` 下最新的那份，以及另一个宿主最新的一份——它有活报告目录就取那里，
// 否则取它归档的基线。路径不存在就**如实报出**，不当它不存在。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIBLING = resolve(ROOT, '..');

const HOSTS = {
  'KeelBase-Vue-Pro': [join(ROOT, 'conformance/reports')],
  'KeelBase-RuoYi': [
    join(SIBLING, 'KeelBase-RuoYi/conformance/reports'),
    join(SIBLING, 'KeelBase-RuoYi/baseline-2026-10-09/app-conformance'),
  ],
};

/**
 * The newest record that actually parses, plus the ones skipped for being unreadable. Newest-first
 * because a record that cannot be parsed is not evidence, and a tool that stops on one reports the
 * wrong thing: the corpus is not empty, one file in it is broken.
 *
 * 真正**解析得开**的最新一份，外加因不可读而跳过的那些。从新往旧找：解析不开的记录不是证据，而一个卡在它上面的
 * 工具会报出错误的东西——语料不是空的，是里面有一份坏的。
 */
function newestRecord(dirs) {
  const corrupt = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => /^app-conformance-.*\.json$/.test(f)).sort();
    for (let i = files.length - 1; i >= 0; i -= 1) {
      const path = join(dir, files[i]);
      try {
        return { path, data: JSON.parse(readFileSync(path, 'utf8')), corrupt };
      } catch (e) {
        corrupt.push({ path, why: String(e.message).split('\n')[0] });
      }
    }
  }
  return { error: `no readable app-conformance-*.json under ${dirs.join(' or ')}`, corrupt };
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const skeleton = JSON.parse(readFileSync(join(ROOT, 'conformance/shared-assertions.json'), 'utf8'));
const records = {};
for (const host of Object.keys(HOSTS)) {
  const explicit = arg(host === 'KeelBase-Vue-Pro' ? 'vue-pro' : 'ruoyi');
  if (explicit) {
    const path = resolve(explicit);
    try {
      records[host] = { path, data: JSON.parse(readFileSync(path, 'utf8')), corrupt: [] };
    } catch (e) {
      records[host] = { error: `${path} does not parse — ${String(e.message).split('\n')[0]}`, corrupt: [] };
    }
    continue;
  }
  const found = newestRecord(HOSTS[host]);
  records[host] = found.error
    ? { error: found.error, corrupt: found.corrupt || [] }
    : { path: found.path, data: found.data, corrupt: found.corrupt || [] };
}

/**
 * An assertion's verdict in one record, or `missing` when no case in the named column carries it.
 * Strict on purpose: several matching cases means all of them, so a red one cannot hide behind a
 * green one.
 *
 * 一条断言在一份记录里的判定；点名的那一栏里没有任何 case 承载它时记 `missing`。**刻意从严**：匹配到
 * 多条就是**全部**，一个红的不许躲在绿的后面。
 */
function verdictOf(record, column) {
  const cases = (record.data.cases || []).filter((c) => c.column === column);
  if (cases.length === 0) return { verdict: 'missing', cases: [] };
  const verdict = cases.every((c) => c.result === 'PASS') ? 'PASS' : 'FAIL';
  return { verdict, cases };
}

let problems = 0;
console.log('shared assertions, read against both hosts\' records');
console.log('');
for (const host of Object.keys(HOSTS)) {
  const r = records[host];
  console.log(`  ${host.padEnd(15)} ${r.error ? `UNAVAILABLE — ${r.error}` : r.path}`);
  // A record that does not parse is named rather than passed over in silence: it is evidence someone
  // believes exists, and the corpus is quietly smaller than it looks.
  // 解析不开的记录**点名**，不静默略过：它是有人以为存在的证据，而那份语料比看上去要小。
  for (const c of r.corrupt || []) console.log(`  ${''.padEnd(15)} skipped, does not parse: ${c.path} — ${c.why}`);
}
console.log('');

for (const assertion of skeleton.assertions) {
  const cells = [];
  for (const host of Object.keys(HOSTS)) {
    const r = records[host];
    if (r.error) { cells.push({ host, verdict: 'unavailable' }); continue; }
    const column = (assertion.carriedBy[host] || {}).column;
    const { verdict, cases } = verdictOf(r, column);
    cells.push({ host, column, verdict, n: cases.length });
  }
  const verdicts = cells.map((c) => c.verdict);
  const same = new Set(verdicts).size === 1;
  const allPass = verdicts.every((v) => v === 'PASS');
  const ok = same && allPass;
  if (!ok) problems += 1;
  console.log(`  ${ok ? 'OK  ' : 'BAD '} ${assertion.id}`);
  console.log(`        ${assertion.name}`);
  console.log(`        ${cells.map((c) => `${c.host}=${c.verdict}${c.column ? ` (${c.column}, ${c.n} case)` : ''}`).join('   ')}`);
  if (!same) console.log('        the two hosts do not agree on this assertion');
}

console.log('');
if (problems > 0) {
  console.error(`${problems} of ${skeleton.assertions.length} shared assertion(s) do not hold on both sides.`);
  process.exit(1);
}
console.log(`all ${skeleton.assertions.length} shared assertion(s) hold on both sides, with the same verdict.`);
