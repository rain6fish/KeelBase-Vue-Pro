#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// Every path this repository writes about itself has to exist.
//
//   node scripts/check-path-refs.mjs
//
// Nothing else reads the prose. `--check-boundary` proves the generated files are a Spec's output;
// `--check` proves they are what the Spec says; neither reads a citation inside a comment or a doc.
// A reference to a file this repository does not hold — or to one renamed since it was written — is
// stale the moment it is written, and stays that way silently, because a wrong path in a comment
// renders exactly like a right one. This is the check that reads it.
//
// The scope is a stated boundary, not an implied one:
//
//   - only paths under **this repository's own** top-level directories;
//   - only in **our own** files — upstream's modules are not scanned, because they cite their own
//     files and those are not ours to fix;
//   - a `../` path is out of scope: it names a sibling checkout that may not be present here;
//   - a **pattern** is not a path: `sql/keelbase-<module>.sql` and `sql/keelbase-*.sql` name a shape
//     the generator fills in, so there is nothing on disk for them to resolve to.
//
// It fails in **both** directions, like `--check-boundary`: a path that is cited but absent is an
// error, and an entry in `ELSEWHERE` that nothing cites any more is an error too — otherwise the
// allow-list would quietly grow holes instead of staying a list of what is actually true.
//
// 本仓写到自己身上的每一条路径都必须存在。
//
//   node scripts/check-path-refs.mjs
//
// 没有别的东西读这些散文：`--check-boundary` 证明生成物是某个 Spec 的产出、`--check` 证明它与 Spec 一致，
// 两者都不读注释或文档里的一条引用。一条指向**本仓并不持有**的文件（或写下之后被改名的文件）的引用，
// 写下的那一刻就已过期，而且**安静地**一直是错的——因为注释里一个错路径与一个对路径渲染出来一模一样。
// 这个脚本就是读它的那一个。
//
// 范围是**说出来的**边界，不是暗示的：
//
//   - 只管**本仓自己的**顶层目录之下的路径；
//   - 只扫**我们自己的**文件——上游的模块不扫，因为它们引的是它们自己的文件，不归我们修；
//   - `../` 路径不在范围内：它点的是一个未必在场的同级检出；
//   - **模式**不是路径：`sql/keelbase-<module>.sql` 与 `sql/keelbase-*.sql` 说的是生成器去填的一个形状，
//     盘上没有东西供它们解析。
//
// 它与 `--check-boundary` 一样**两个方向都失败**：被引用却缺席的路径是错误，而 `ELSEWHERE` 里
// 再没有任何东西引用的条目**同样**是错误——否则那份白名单会悄悄长出洞，而不是一直是一份「确实如此」的清单。
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// This file is not scanned. Its own `ELSEWHERE` list writes every declared path down, so scanning it
// would make each entry cite itself and the "an exception nothing cites" half could never fire.
// 本文件不扫自己。它自己的 `ELSEWHERE` 把每一条被声明的路径都写了下来，故扫它会让每个条目自己引用自己，
// 「一条没人再引用的例外」那一半就永远触发不了。
const SELF = fileURLToPath(import.meta.url);

/** The top-level directories this repository owns — the only ones a path is checked against. */
const OWNED = ['keelbase-codegen', 'keelbase-docs', 'keelbase-ui', 'scripts', 'specs', 'sql'];

/** Where our own files are. Upstream's trees are deliberately absent. */
const SCANNED_ROOTS = [
  ...OWNED,
  'deploy',
  'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase',
];

/** Files we do not walk into, and suffixes we do not read. */
const SKIP_DIR = /(^|[/\\])(target|node_modules|\.git)([/\\]|$)/;
const READ = /\.(java|md|mjs|sh|json|ya?ml)$/;

/** Root-level files that are ours. */
const ROOT_FILES = ['README.md', 'README.zh-CN.md', 'NOTICE'];

/**
 * Cited paths that are deliberately **not** in this repository — a reference *about* a file rather
 * than *to* one. Declared here so the exception is legible, and each entry is checked to still be
 * cited: an exception nobody needs any more is a hole, not a kindness.
 *
 * 被引用、却**刻意不在**本仓里的路径——它们是**关于**某个文件的记述，不是**指向**它。声明在此，
 * 好让这条例外可读；而每条都反过来核一次它**仍被引用**：一条不再有人需要的例外是个洞，不是好意。
 */
const ELSEWHERE = [
  {
    path: 'scripts/keelbase-gen-from-spec.mjs',
    why: "the RuoYi line's Node generator that this Java one replaced; the port names it as what it"
      + ' used to be, and the file is in the other repository',
    zh: 'RuoYi 线那个被本 Java 生成器取代的 Node 生成器；此处是移植时「它原本是什么」的记述，'
      + '文件在那个仓里',
  },
  {
    path: 'scripts/check-object-key-contract.mjs',
    why: "the runtime's own gate: CI runs it from the pinned runtime checkout (working-directory:"
      + ' .runtime), so the manifest key cites a path that lives in that released tree, not here',
    zh: '运行时自己的门禁：CI 从被 pin 的运行时检出（working-directory: .runtime）里跑它，'
      + '故清单那条调用引用的是那个发布树里的路径，不在本仓',
  },
  {
    path: 'scripts/check-host-object-key.mjs',
    why: "the runtime's sister gate in the same job, also run from the pinned runtime checkout;"
      + ' the manifest key cites its path there, not here',
    zh: '同一 job 里运行时的那道姊妹门禁，同样从被 pin 的运行时检出里跑；'
      + '清单那条调用引用的是那边的路径，不在本仓',
  },
];

function collect(dir, into) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (SKIP_DIR.test(full)) continue;
    if (entry.isDirectory()) collect(full, into);
    else if (READ.test(entry.name)) into.push(full);
  }
}

// A path is only a reference if a character that cannot be part of one sits before it — otherwise
// `https://host/scripts/x` and `foo/sql/x` would both be read as ours.
const REF = new RegExp(`(?<![A-Za-z0-9._/-])(${OWNED.join('|')})/[A-Za-z0-9._/-]*`, 'g');

// A matcher stops at these, so a character that continues into one means the author meant a shape.
const INTRODUCES_A_PATTERN = /[<*?{[$%]/;

function refsIn(text) {
  const found = [];
  for (const match of text.matchAll(REF)) {
    let path = match[0].replace(/[.,;:)\]}'"]+$/, '');
    if (path.endsWith('/') || path.endsWith('-') || path.endsWith('_')) continue; // no file named
    if (INTRODUCES_A_PATTERN.test(text[match.index + match[0].length] || '')) continue;
    found.push({ path, index: match.index });
  }
  return found;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

const files = [];
for (const root of SCANNED_ROOTS) {
  const full = join(ROOT, root);
  const stat = statSync(full, { throwIfNoEntry: false });
  if (!stat) continue;
  if (stat.isDirectory()) collect(full, files);
  else files.push(full);
}
for (const name of ROOT_FILES) {
  const full = join(ROOT, name);
  if (existsSync(full)) files.push(full);
}

const declared = new Map(ELSEWHERE.map((entry) => [entry.path, 0]));
const missing = [];
let checked = 0;
for (const file of files) {
  if (resolve(file) === SELF) continue;
  const text = readFileSync(file, 'utf8');
  const rel = file.slice(ROOT.length + 1).replace(/\\/g, '/');
  for (const { path, index } of refsIn(text)) {
    checked += 1;
    // Every citation here is written from the repository root; that is the only form in use.
    if (existsSync(join(ROOT, path))) continue;
    if (declared.has(path)) {
      declared.set(path, declared.get(path) + 1);
      console.log(`  elsewhere ${path}  <- ${rel}:${lineOf(text, index)}`);
      continue;
    }
    missing.push({ path, file: rel, line: lineOf(text, index) });
  }
}

const unused = [...declared].filter(([, count]) => count === 0).map(([path]) => path);
for (const { path, file, line } of missing) {
  console.error(`  MISSING   ${path}  <- ${file}:${line}`);
}
for (const path of unused) {
  console.error(`  UNCITED   ${path}  <- declared in ELSEWHERE, but nothing cites it any more`);
}
console.log();
if (missing.length > 0 || unused.length > 0) {
  console.error(`${missing.length} path(s) cited but not in this repository,`
    + ` ${unused.length} declared exception(s) gone stale.`);
  process.exit(1);
}
console.log(`every cited path resolves: ${checked} reference(s) over ${files.length} file(s),`
  + ` ${declared.size} declared elsewhere.`);
