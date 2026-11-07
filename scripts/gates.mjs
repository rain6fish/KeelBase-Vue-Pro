#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 一条命令跑完本仓的**全部门禁**，并逐条说清楚哪一道跑不了、为什么、怎么补。
//
// 为什么要有它。CI（`.github/workflows/ci.yml`）把每道门禁点在自己的 step 上——对 CI 是对的（红在哪一道
// 要一眼看得出），对**推送之前**就不对了：那时想要的是一句「这棵树还干不干净」。本仓此前没有这条命令，
// 于是 2026-11-04 两个会话各自照着记得的清单手跑，其中一个的报告直接把缺的东西写了出来：「pre-commit
// 钩子只跑 `check-path-refs`，本地没有静态门清单可登记」。本周新加的两道门（`check-sql-aliases`、
// `check-trigger-uniqueness`）也只是各自往 CI 加了一步。清单散在 CI 里，就没人能从本地问全。
//
// 这份清单是**抄** CI 的，不是又一处分家：`scripts/gates.test.mjs` 解析 `ci.yml` 的 `run:` 行，**两个
// 方向都查**——CI 点名的每一道门都在这里，这里的每一道门 CI 也在跑（只在本地跑的必须显式声明、理由写进
// 本文件头）。任一边漏一个就红并点名。所以「同一份判据、两个执行处」不是一句口号，是一条会红的断言。
//
// 前置条件一共五类，缺了**绝不静默跳过**：
//
//   node   只要 Node —— 纯静态闸，读源码，不起栈。
//   jdk    JDK 25 + Maven —— 生成器的两道离线检查（`scripts/gen-from-spec.sh`），以及 `-am` 自编的
//          治理测试包。`scripts/jdk25.sh` 自己会解析 25，本文件只在其解析顺序里探一遍。
//   built  要一份已装进 `~/.m2` 的 reactor —— 宿主与 ai1 模块的 Java 测试步都不带 `-am`，兄弟模块从
//          本地库解析。补法就是那一步 `install`。
//   ui     要一份铺好的界面检出（`target/yudao-ui-admin-vue3` 或 `KEELBASE_YUDAO_UI` 指过去），且带闸门
//          要的那四个包；两道渲染闸与两个数渲染的测试从这里解析 vue / vue-i18n / 两个编译器。
//   stack  要一个**跑着的**宿主（CI 用 service containers 起 PG/Redis 再起宿主）。本地没有栈时这些门禁
//          是 SKIP，不是 PASS —— 它们的读数只在真栈上才有意义。
//
// 用法：
//
//   node scripts/gates.mjs                 # 跑得动的都跑；跑不了的逐条 SKIP + 原因 + 补法
//   node scripts/gates.mjs --require-all   # 前置缺失由 SKIP 变红（= CI 的完整条件）
//   node scripts/gates.mjs --list          # 只打印清单，不跑
//
// 退出码：0 = 跑了的全绿（正常模式下允许显式 SKIP）；1 = 至少一道门红；2 = `--require-all` 且有门禁
// 跑不了；64 = 用法错误。
//
// `MAVEN_ARGS` 原样透传给 Maven（3.9 起支持）。多会话共用一台机器时，用它把本地库指到自己那份：
// `MAVEN_ARGS=-Dmaven.repo.local=D:/Rain6fish/.m2-gates-local node scripts/gates.mjs`。
//
// ── English ─────────────────────────────────────────────────────────────────────
//
// Run every gate this repository has, in one command, and say exactly which ones could not run, why,
// and what fixes them.
//
// Why this exists. CI (`.github/workflows/ci.yml`) names each gate in its own step — right for CI (a
// red must point at the gate), wrong for the moment before a push, when what you want is "is this tree
// clean". This repository had no such command, so on 2026-11-04 two different sessions hand-ran from
// lists they remembered, and one of their reports said it outright: "the pre-commit hook runs only
// `check-path-refs`; there is no static-gate list to register locally". The two gates added this week
// (`check-sql-aliases`, `check-trigger-uniqueness`) each got only a CI step too. A list that lives only
// in CI cannot be asked from a laptop.
//
// This list is **copied from** CI, not a second place to drift: `scripts/gates.test.mjs` parses the
// `run:` lines of `ci.yml` and checks **both directions** — every gate CI names is here, and every gate
// here is one CI runs (anything local-only must be declared, with its reason in this header). One
// missing on either side turns red and names it. "The same criterion, two execution sites" is therefore
// an assertion that fails, not a slogan.
//
// There are five prerequisite classes; a missing one is **never** a quiet skip:
//
//   node   Node only — static gates that read sources and start no stack.
//   jdk    JDK 25 + Maven — the generator's two offline checks (`scripts/gen-from-spec.sh`) and the
//          governance test package, which builds with `-am`.
//   built  A reactor already installed into `~/.m2` — the host's and the ai1 module's Java test steps
//          omit `-am`, so sibling modules resolve from the local repository. The fix is that `install`.
//   ui     A laid-down UI checkout (`target/yudao-ui-admin-vue3`, or `KEELBASE_YUDAO_UI` pointing at
//          one) carrying the four packages the gates need; the two render gates and the two
//          render-measuring tests resolve vue / vue-i18n / both compilers from it.
//   stack  A **running** host (CI brings up PostgreSQL/Redis as service containers, then the host).
//          Without a stack these gates are SKIP, never PASS — their readings only mean something on a
//          real stack.
//
//   node scripts/gates.mjs                 # run what can run; SKIP the rest with reason + fix
//   node scripts/gates.mjs --require-all   # a missing prerequisite is red (= CI's full condition)
//   node scripts/gates.mjs --list          # print the manifest only
//
// Exit codes: 0 = everything that ran is green (explicit SKIPs allowed in the normal mode); 1 = at least
// one gate red; 2 = `--require-all` and some gate could not run; 64 = bad usage.
//
// `MAVEN_ARGS` is passed through to Maven (supported since 3.9). On a machine several sessions share,
// point the local repository at your own copy with it:
// `MAVEN_ARGS=-Dmaven.repo.local=D:/Rain6fish/.m2-gates-local node scripts/gates.mjs`.
//
// ── Declaration of local-only gates ─────────────────────────────────────────────
//
// `LOCAL_ONLY` is empty, deliberately: every gate below also runs in CI. `scripts/check-upstream-footprint.mjs`
// is **not** a gate at all (its own header says so: upstream moving is normal, so a red light would be
// ignored) and is declared in `NOT_GATES_ON_DISK` instead. The mechanism still exists and is
// fixture-tested in `scripts/gates.test.mjs`: an entry here needs a non-empty `reason` **and** its id
// must appear in this header, so the next local-only gate cannot be added silently.
//
// 只在本地跑的门禁：**没有** —— 清单里每一道在 CI 里也有。`scripts/check-upstream-footprint.mjs` **不是
// 门禁**（它自己的文件头就这么说：上游在动是常态，亮红灯会被无视），故它登记在 `NOT_GATES_ON_DISK` 里，
// 而不是这里。机制仍然在、也有 fixture 用例：登记到 `LOCAL_ONLY` 的条目必须有非空 `reason`，且它的 id
// 必须出现在本文件头 —— 下一道「只跑本地」的门禁因此没法悄悄加进来。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CI_FILE = '.github/workflows/ci.yml';
export const UI_DIR_VAR = '<ui-dir>';
const MISSING_UI_VAR = '<missing-ui>';

/**
 * The gates `script-tests` leaves out, read from `ci.yml` rather than written down a second time — the
 * exclusion and the guard in that job read the same declaration, and the entry reads it too.
 *
 * `script-tests` 排除在外的两道测试，从 `ci.yml` 读而不是在这里再写一遍 —— 那个 job 的排除与守卫读的是
 * 同一份声明，本入口也读它。
 */
export function parseUiDependentTests(ciText) {
  const m = /^\s*UI_DEPENDENT_TESTS:\s*'([^']*)'/m.exec(ciText) ?? /^\s*UI_DEPENDENT_TESTS:\s*"([^"]*)"/m.exec(ciText);
  if (!m) return null;
  return m[1].trim().split(/\s+/).filter(Boolean);
}

// The manifest. One entry per gate invocation CI performs. `cmd` is the invocation as CI spells it,
// with `$UI_DIR` written as `<ui-dir>`: that is what the parity check compares.
// 清单。CI 每执行一道门禁就有这里的一条。`cmd` 是 CI 里的写法，`$UI_DIR` 写成 `<ui-dir>` —— 两个方向的
// 比对就比这个。
export const GATES = [
  // ── pure Node ────────────────────────────────────────────────────────────────
  { id: 'path-refs', job: 'path-refs', prereq: 'node', cmd: ['node', 'scripts/check-path-refs.mjs'] },
  { id: 'sql-aliases', job: 'sql-aliases', prereq: 'node', cmd: ['node', 'scripts/check-sql-aliases.mjs'] },
  {
    id: 'ungoverned-tool-beans',
    job: 'governance-boundary',
    prereq: 'node',
    cmd: ['node', 'scripts/check-ungoverned-tool-beans.mjs'],
  },
  {
    id: 'ungoverned-tool-beans-whole-build',
    job: 'governance-boundary',
    prereq: 'node',
    cmd: ['node', 'scripts/check-ungoverned-tool-beans.mjs', '--whole-build'],
  },
  {
    id: 'governance-registry',
    job: 'governance-registry',
    prereq: 'node',
    cmd: ['node', 'scripts/check-governance-registry.mjs'],
  },
  {
    id: 'governance-coverage',
    job: 'governance-registry',
    prereq: 'node',
    cmd: ['node', 'scripts/check-governance-coverage.mjs', '--require-full'],
  },
  {
    id: 'exempt-claims',
    job: 'governance-registry',
    prereq: 'node',
    cmd: ['node', 'scripts/check-exempt-claims.mjs'],
  },
  { id: 'console-pages', job: 'governance-registry', prereq: 'node', cmd: ['node', 'scripts/check-console-pages.mjs'] },
  {
    id: 'trigger-uniqueness',
    job: 'governance-registry',
    prereq: 'node',
    cmd: ['node', 'scripts/check-trigger-uniqueness.mjs'],
  },
  { id: 'seed-list', job: 'governance-registry', prereq: 'node', cmd: ['node', 'scripts/check-seed-list.mjs'] },
  {
    id: 'admin-credential',
    job: 'governance-registry',
    prereq: 'node',
    cmd: ['node', 'scripts/check-admin-credential.mjs'],
  },
  {
    id: 'identity-matrix',
    job: 'governance-registry',
    prereq: 'node',
    cmd: ['node', 'scripts/check-identity-matrix.mjs'],
  },
  {
    id: 'audit-reader-execution-guard',
    job: 'governance-registry',
    prereq: 'node',
    cmd: ['node', 'scripts/check-audit-reader-execution-guard.mjs'],
  },
  {
    id: 'audit-reader-write-controls',
    job: 'governance-registry',
    prereq: 'node',
    cmd: ['node', 'scripts/check-audit-reader-write-controls.mjs'],
  },
  {
    id: 'effect-target-existence',
    job: 'governance-registry',
    prereq: 'node',
    cmd: ['node', 'scripts/check-effect-target-existence.mjs'],
  },
  { id: 'family-block', job: 'family-block', prereq: 'node', cmd: ['node', 'scripts/check-family-block.mjs'] },
  // One glob, as CI runs it — a test file added later is covered without editing this list. The two
  // files that need a checkout are excluded here exactly as they are there, and each has its own entry
  // below; the parity check knows a named `node --test <file>` in CI is covered by this glob.
  // 与 CI 同一条 glob —— 以后新加的测试文件不改这份清单也在射程内。要检出的那两个文件照那边一样排除，
  // 各自在下面有自己的一条；比对规则知道 CI 里按名点的那条 `node --test <file>` 由这条 glob 覆盖。
  {
    id: 'script-tests',
    job: 'script-tests',
    prereq: 'node',
    cmd: ['node', '--test', 'scripts/*.test.mjs'],
    globbed: true,
  },

  // ── a laid-down UI checkout ───────────────────────────────────────────────────
  {
    id: 'rendered-copy',
    job: 'rendered-copy',
    prereq: 'ui',
    cmd: ['node', 'scripts/check-rendered-copy.mjs', UI_DIR_VAR],
  },
  {
    id: 'rendered-components',
    job: 'rendered-copy',
    prereq: 'ui',
    cmd: ['node', 'scripts/check-rendered-components.mjs', UI_DIR_VAR],
  },
  {
    id: 'rendered-copy-expressions',
    job: 'rendered-copy',
    prereq: 'ui',
    cmd: ['node', '--test', 'scripts/rendered-copy-expressions.test.mjs'],
  },
  {
    id: 'rendered-copy-components',
    job: 'rendered-copy',
    prereq: 'ui',
    cmd: ['node', '--test', 'scripts/rendered-copy-components.test.mjs'],
  },

  // ── JDK 25 + Maven ────────────────────────────────────────────────────────────
  {
    id: 'generator-check',
    job: 'generator',
    prereq: 'jdk',
    cmd: ['bash', 'scripts/gen-from-spec.sh', 'specs/products.json', '--check'],
  },
  {
    id: 'generator-boundary',
    job: 'generator',
    prereq: 'jdk',
    cmd: ['bash', 'scripts/gen-from-spec.sh', '--check-boundary'],
  },
  {
    id: 'governance-tests',
    job: 'governance-tests',
    prereq: 'jdk',
    cmd: [
      'bash',
      'scripts/jdk25.sh',
      'mvn',
      '-B',
      '-ntp',
      '-pl',
      'yudao-server',
      '-am',
      'test',
      '-Dtest=cn.iocoder.yudao.server.keelbase.*Test',
      '-Dsurefire.failIfNoSpecifiedTests=false',
    ],
  },

  // ── needs a reactor installed into the local Maven repository ─────────────────
  {
    id: 'host-java-tests',
    job: 'conformance',
    prereq: 'built',
    cmd: [
      'bash',
      'scripts/jdk25.sh',
      'mvn',
      '-B',
      '-ntp',
      '-pl',
      'yudao-server',
      'test',
      '-Dtest=cn.iocoder.yudao.server.**.*Test',
    ],
  },
  {
    id: 'ai1-tests',
    job: 'conformance',
    prereq: 'built',
    cmd: [
      'bash',
      'scripts/jdk25.sh',
      'mvn',
      '-B',
      '-ntp',
      '-pl',
      'yudao-module-ai1-springai',
      'test',
      '-Dtest=cn.iocoder.yudao.module.ai1.**.*Test',
    ],
  },

  // ── a running stack ───────────────────────────────────────────────────────────
  {
    id: 'conformance',
    job: 'conformance',
    prereq: 'stack',
    cmd: ['node', 'scripts/ci/run-governance-gate.mjs'],
    env: { CONFORMANCE_NO_MODEL_KEY: '1' },
  },
  {
    id: 'conversation-titles',
    job: 'conformance',
    prereq: 'stack',
    cmd: ['node', 'scripts/check-conversation-titles.mjs', '--full'],
  },
  {
    id: 'system-notice',
    job: 'real-stack-gates',
    prereq: 'stack',
    cmd: ['node', 'scripts/run-system-notice-scenarios.mjs'],
  },
  {
    id: 'infra-file',
    job: 'real-stack-gates',
    prereq: 'stack',
    cmd: ['node', 'scripts/run-infra-file-scenarios.mjs'],
  },
  {
    id: 'bpm-process-instance',
    job: 'real-stack-gates',
    prereq: 'stack',
    cmd: ['node', 'scripts/run-bpm-process-instance-scenarios.mjs'],
  },
  { id: 'bpm-task', job: 'real-stack-gates', prereq: 'stack', cmd: ['node', 'scripts/run-bpm-task-scenarios.mjs'] },
  {
    id: 'bpm-process-copy',
    job: 'real-stack-gates',
    prereq: 'stack',
    cmd: ['node', 'scripts/run-bpm-process-copy-scenarios.mjs'],
  },
  {
    id: 'fms-read-seams',
    job: 'real-stack-gates',
    prereq: 'stack',
    cmd: ['node', 'scripts/run-fms-read-seams-scenarios.mjs'],
  },
  {
    id: 'bypass-audit',
    job: 'real-stack-gates',
    prereq: 'stack',
    cmd: ['node', 'scripts/run-bypass-audit-scenarios.mjs'],
  },
];

/**
 * Invocations CI makes that are **not** gate readings. Each needs a reason; the parity check requires
 * the invocation to still be in `ci.yml` (a stale declaration is red), so this cannot become a place
 * where a real gate quietly hides.
 *
 * CI 里**不是**门禁读数的调用。每条都要理由；比对还会要求这条调用仍在 `ci.yml` 里（过期的声明是红的），
 * 故它不能变成藏真门禁的地方。
 */
export const NOT_GATES = [
  {
    id: 'host-build-package',
    key: 'bash scripts/jdk25.sh mvn -B -ntp -pl yudao-server -am -DskipTests package',
    reason: 'setup: builds the host jar the real-stack gates need; it runs no test (-DskipTests).',
  },
  {
    id: 'host-build-install',
    key: 'bash scripts/jdk25.sh mvn -B -ntp -pl yudao-server -am -DskipTests install',
    reason: 'setup: installs the reactor so the two no-`-am` test steps can resolve it; it runs no test.',
  },
  {
    id: 'start-host',
    key: 'bash scripts/run-server.sh',
    reason: 'setup: starts the host the stack-bound gates are driven against.',
  },
  {
    id: 'load-seed',
    key: 'bash deploy/demo-ecs/bootstrap-db.sh',
    reason: 'setup: loads the seed the stack-bound gates read.',
  },
  {
    id: 'missing-checkout-keeper-parse',
    key: `node scripts/check-rendered-copy.mjs ${MISSING_UI_VAR}`,
    reason: 'keeper: asserts the gate exits 2 on a missing checkout; it is not a reading of the tree.',
  },
  {
    id: 'missing-checkout-keeper-mount',
    key: `node scripts/check-rendered-components.mjs ${MISSING_UI_VAR}`,
    reason: 'keeper: asserts the sister gate exits 2 on a missing checkout; not a reading of the tree.',
  },
];

/**
 * `check-*.mjs` scripts on disk that are deliberately **not** gates. Every other `scripts/check-*.mjs`
 * must be in `GATES` — a gate-shaped script nobody runs is worse than no gate, which is the same rule
 * the sibling repository's `check-gates-wired.mjs` enforces from its side.
 *
 * 盘上**有意不是门禁**的 `check-*.mjs`。其余每个 `scripts/check-*.mjs` 都必须在 `GATES` 里 —— 一道没人
 * 跑的「门禁形状」脚本比没有门禁更糟；兄弟仓的 `check-gates-wired.mjs` 从另一边守着同一条规矩。
 */
export const NOT_GATES_ON_DISK = [
  {
    file: 'scripts/check-upstream-footprint.mjs',
    reason:
      'a reading, not a gate: its own header says upstream moving is normal, so a red light would be ignored within a week.',
  },
];

/** Gates that run only locally, never in CI. Empty today; an entry needs a reason and a header mention. */
export const LOCAL_ONLY = [];

// ── shell parsing of `run:` blocks ─────────────────────────────────────────────

/** Split on `;`, `&&`, `||` and a bare `|` at the top level, respecting quotes and `$( )`. */
function splitSegments(line) {
  const segments = [];
  let cur = '';
  let quote = null;
  let depth = 0;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quote) {
      cur += c;
      if (c === quote && line[i - 1] !== '\\') quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
      continue;
    }
    if (c === '$' && line[i + 1] === '(') {
      depth += 1;
      cur += '$(';
      i += 1;
      continue;
    }
    if (c === ')' && depth > 0) {
      depth -= 1;
      cur += c;
      continue;
    }
    if (depth === 0) {
      if (c === ';') {
        segments.push(cur);
        cur = '';
        continue;
      }
      if (c === '|' || c === '&') {
        const two = line.slice(i, i + 2);
        if (two === '&&' || two === '||') {
          segments.push(cur);
          cur = '';
          i += 1;
          continue;
        }
        if (c === '|') {
          segments.push(cur);
          cur = '';
          continue;
        }
      }
    }
    cur += c;
  }
  segments.push(cur);
  return segments;
}

/** Drop leading env assignments and shell keywords, so the first real command is at token 0. */
function stripPrefixes(segment) {
  let s = segment.trim();
  for (;;) {
    const env = /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+/.exec(s);
    if (env) {
      s = s.slice(env[0].length).trim();
      continue;
    }
    const keyword = /^(?:if|elif|then|else|do|while|until|for|case)\s+/.exec(s);
    if (keyword) {
      s = s.slice(keyword[0].length).trim();
      continue;
    }
    if (s.startsWith('! ')) {
      s = s.slice(2).trim();
      continue;
    }
    break;
  }
  return s;
}

/** Whitespace tokenizer that keeps quoted strings together and strips the quotes. */
function tokens(segment) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < segment.length; i += 1) {
    const c = segment[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur) out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

/** Drop redirections (`>out`, `2>&1`, `&`) and the file a `>` points at. */
function stripRedirections(segment) {
  return segment
    .replace(/\s+\d?>>?\s*\S+/g, '')
    .replace(/\s+\d?>&\d+/g, '')
    .replace(/\s+&$/, '')
    .trim();
}

const REPO_SCRIPT = /^(scripts|deploy)\/[A-Za-z0-9_./-]+$/;

/** Normalise a token so CI's `"$UI_DIR"` and the manifest's `<ui-dir>` compare equal. */
export function normaliseToken(token) {
  if (token === '$UI_DIR' || token === '${UI_DIR}') return UI_DIR_VAR;
  if (token === '$RUNNER_TEMP/no-such-ui' || token === '${RUNNER_TEMP}/no-such-ui') return MISSING_UI_VAR;
  if (/^target[/\\]yudao-ui-admin-vue3$/.test(token)) return UI_DIR_VAR;
  return token.replace(/^['"]|['"]$/g, '');
}

/** The gate key of one shell segment, or null when the segment invokes no repository script. */
function keyOfSegment(rawSegment) {
  const segment = stripRedirections(stripPrefixes(rawSegment));
  if (!segment) return null;

  // `node --test $(ls scripts/*.test.mjs | grep -Ev …)` — the one glob CI runs.
  if (/^node\s+--test\b/.test(segment) && /scripts\/\*\.test\.mjs/.test(segment)) {
    return 'node --test scripts/*.test.mjs';
  }
  const toks = tokens(segment);
  if (toks[0] === 'node' && toks[1] === '--test' && REPO_SCRIPT.test(normaliseToken(toks[2] ?? ''))) {
    return `node --test ${normaliseToken(toks[2])}`;
  }
  for (const interpreter of ['node', 'bash']) {
    if (toks[0] === interpreter && REPO_SCRIPT.test(normaliseToken(toks[1] ?? ''))) {
      return [interpreter, ...toks.slice(1).map(normaliseToken)].join(' ');
    }
  }
  return null;
}

/**
 * Every gate-shaped invocation in a workflow's `run:` blocks. Handles single-line `run:`, `|` blocks
 * and `>` / `>-` folded blocks; ignores comment lines and calls that appear only inside a quoted
 * argument (e.g. the `grep -q "node --test $f"` guard in `script-tests`).
 *
 * 一份 workflow 的 `run:` 块里每一处「门禁形状」的调用。认得单行 `run:`、`|` 块与 `>` / `>-` 折行块；
 * 跳过注释行，也跳过只出现在引号参数里的调用（例如 `script-tests` 里那条 `grep -q "node --test $f"`）。
 */
export function parseCiGates(ciText) {
  const lines = ciText.split(/\r?\n/);
  const found = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^([ \t]*)(?:- +)?run:(.*)$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    const rest = m[2].trim();
    let body;
    if (/^[|>][+-]?$/.test(rest)) {
      const folded = rest.startsWith('>');
      const collected = [];
      let j = i + 1;
      for (; j < lines.length; j += 1) {
        const line = lines[j];
        if (line.trim() === '') {
          collected.push('');
          continue;
        }
        if (/^[ \t]*/.exec(line)[0].length <= indent) break;
        collected.push(line);
      }
      i = j - 1;
      // A folded scalar joins its lines with spaces — that is how the `mvn` invocations are written
      // and how their flags (`-pl yudao-server`, `install` / `test`) stay on one command.
      // 折行块把各行用空格连起来 —— `mvn` 那几条就是这么写的，`-pl yudao-server` 与 `install` / `test`
      // 因此留在同一条命令上。
      body = folded ? [collected.map((l) => l.trim()).filter(Boolean).join(' ')] : collected;
    } else {
      body = [rest];
    }
    for (const line of body) {
      if (/^\s*#/.test(line)) continue;
      for (const segment of splitSegments(line)) {
        const key = keyOfSegment(segment);
        if (key) found.push({ key, line: i + 1 });
      }
    }
  }
  return found;
}

// ── parity ─────────────────────────────────────────────────────────────────────

/** True when `key` names a single test file that the `script-tests` glob runs. */
function globCoversTest(key, testFiles, uiDependentTests) {
  const m = /^node --test (scripts\/[^ ]+\.test\.mjs)$/.exec(key);
  if (!m) return false;
  return testFiles.includes(m[1]) && !uiDependentTests.includes(m[1]);
}

/**
 * Both directions of the set equality, as a list of failures (empty = equal). Pure: everything it reads
 * is an argument, so `scripts/gates.test.mjs` can run it against fixtures.
 *
 * - CI → entry: every invocation is either a gate's command or a declared not-a-gate; a named
 *   `node --test <file>` is covered by the `script-tests` glob.
 * - entry → CI: every gate's command appears in CI; a local-only gate is exempt and must carry a
 *   reason plus an id that `header` mentions.
 * - disk → entry ∪ CI: every `scripts/check-*.mjs` is a gate or declared as not-a-gate on disk.
 * - declarations stay honest: a not-a-gate invocation must still be in CI.
 *
 * 集合相等的两个方向，返回失败清单（空 = 相等）。纯函数：读的都是入参，故测试可拿 fixture 跑它。
 */
export function checkParity({
  ciText,
  gates = GATES,
  notGates = NOT_GATES,
  notGatesOnDisk = NOT_GATES_ON_DISK,
  localOnly = LOCAL_ONLY,
  uiDependentTests,
  testFiles,
  diskCheckScripts,
  header = '',
}) {
  const failures = [];
  const invocations = parseCiGates(ciText);
  const ciKeys = new Set(invocations.map((inv) => inv.key));
  const gateKeys = new Set(gates.map((g) => g.cmd.join(' ')));
  const exemptKeys = new Set(notGates.map((n) => n.key));
  const localOnlyIds = new Set(localOnly.map((g) => g.id));

  // CI → entry
  for (const inv of invocations) {
    if (gateKeys.has(inv.key) || exemptKeys.has(inv.key)) continue;
    if (globCoversTest(inv.key, testFiles, uiDependentTests)) continue;
    failures.push(
      `ci.yml:${inv.line} runs \`${inv.key}\`, and the gate list has no entry for it ` +
        `(add it to GATES in scripts/gates.mjs, or declare it in NOT_GATES with a reason)`,
    );
  }

  // entry → CI
  for (const gate of gates) {
    if (localOnlyIds.has(gate.id)) continue;
    const key = gate.cmd.join(' ');
    if (!ciKeys.has(key)) {
      failures.push(`gate \`${gate.id}\` runs \`${key}\`, which ci.yml never invokes`);
    }
  }

  // local-only declarations need a reason, and the header must name them
  for (const gate of localOnly) {
    if (!gate.reason || !gate.reason.trim()) failures.push(`local-only gate \`${gate.id}\` has no reason`);
    if (!header.includes(gate.id)) failures.push(`local-only gate \`${gate.id}\` is not mentioned in the file header`);
  }

  // a not-a-gate declaration that no longer appears in CI is stale
  for (const decl of notGates) {
    if (!decl.reason || !decl.reason.trim()) failures.push(`not-a-gate \`${decl.id}\` has no reason`);
    if (!ciKeys.has(decl.key)) failures.push(`not-a-gate \`${decl.id}\` declares \`${decl.key}\`, which ci.yml no longer runs`);
  }

  // every check-*.mjs on disk is a gate, or declared as a reading
  for (const file of diskCheckScripts) {
    const isGate = gates.some((g) => g.cmd.includes(`scripts/${file}`));
    const isDeclared = notGatesOnDisk.some((d) => path.basename(d.file) === file);
    if (!isGate && !isDeclared) {
      failures.push(`scripts/${file} is a check script that is neither in GATES nor declared in NOT_GATES_ON_DISK`);
    }
  }
  for (const decl of notGatesOnDisk) {
    if (!decl.reason || !decl.reason.trim()) failures.push(`not-a-gate-on-disk \`${decl.file}\` has no reason`);
    if (!diskCheckScripts.includes(path.basename(decl.file))) {
      failures.push(`not-a-gate-on-disk \`${decl.file}\` names a script that is not on disk`);
    }
  }

  return failures;
}

// ── prerequisites ──────────────────────────────────────────────────────────────

function javaBin(home) {
  return path.join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
}

function isJdk25(home) {
  if (!home) return false;
  // `java -version` writes to **stderr** — reading stdout alone answers "not a JDK 25" for a JDK 25.
  // `java -version` 写的是 **stderr** —— 只读 stdout 会把一个 JDK 25 判成「不是 25」。
  const result = spawnSync(javaBin(home), ['-version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return /version "25\./.test(`${result.stdout ?? ''}${result.stderr ?? ''}`);
}

/** The first of `names` that exists in any PATH directory, or null. */
function findOnPath(names) {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const JDK_FIX =
  'set KEELBASE_JDK25 to a JDK 25 home, or run `bash scripts/jdk25.sh` once to resolve/download one ' +
  '(it checks $KEELBASE_JDK25, $JDK25_HOME, ~/.keelbase/jdk25/jdk-25, /d/Develop/jdk-25, then downloads)';

/** Resolve JDK 25 the way `scripts/jdk25.sh` does — same order, so the answer cannot disagree with it. */
export function detectJdk() {
  const home = process.env.HOME || process.env.USERPROFILE || os.tmpdir();
  const candidates = [
    process.env.KEELBASE_JDK25,
    process.env.JDK25_HOME,
    path.join(process.env.KEELBASE_JDK25_DIR || path.join(home, '.keelbase', 'jdk25'), 'jdk-25'),
    // `jdk25.sh` runs under bash, so it spells the shared machine's JDK the MSYS way; Node does not
    // resolve `/d/...`, so the Windows spelling is what this probe needs.
    // `jdk25.sh` 跑在 bash 下，故本机共用 JDK 写的是 MSYS 形式；Node 解析不了 `/d/...`，这里探的得是
    // Windows 写法。
    '/d/Develop/jdk-25',
    'D:/Develop/jdk-25',
    process.env.JAVA_HOME,
  ];
  const jdk = candidates.find(isJdk25);
  if (!jdk) return { ok: false, detail: 'no JDK 25 found', fix: JDK_FIX };
  // Windows spells the launcher `mvn.cmd`, and `.cmd` cannot be spawned without a shell — so it is
  // found on PATH rather than run. The gates themselves call Maven through `scripts/jdk25.sh`, i.e.
  // through bash, which resolves it the same way.
  // Windows 上启动器叫 `mvn.cmd`，而 `.cmd` 不经 shell 派生不了 —— 故这里是在 PATH 上**找**它，不是跑它。
  // 各道门禁本身经由 `scripts/jdk25.sh`（也就是 bash）调 Maven，解析方式相同。
  const mvn = findOnPath(process.platform === 'win32' ? ['mvn.cmd', 'mvn.exe', 'mvn.bat'] : ['mvn']);
  if (!mvn) {
    return { ok: false, detail: `JDK 25 at ${jdk}, but mvn is not on PATH`, fix: 'put Maven on PATH (mvn -v must answer)' };
  }
  return { ok: true, detail: `JDK 25 at ${jdk}; ${mvn}` };
}

export function resolveUiDir() {
  return process.env.KEELBASE_YUDAO_UI
    ? path.resolve(process.env.KEELBASE_YUDAO_UI)
    : path.join(ROOT, 'target', 'yudao-ui-admin-vue3');
}

const UI_PACKAGES = ['vue', 'vue-i18n', '@vue/compiler-sfc', '@vue/compiler-dom'];

export function detectUi() {
  const dir = resolveUiDir();
  if (!fs.existsSync(dir)) {
    return {
      ok: false,
      detail: `no UI checkout at ${dir}`,
      fix: 'bash scripts/build-host-ui.sh  (fetches the checkout, installs its packages, lays the patches down)',
      dir,
    };
  }
  const missing = UI_PACKAGES.filter((p) => !fs.existsSync(path.join(dir, 'node_modules', p)));
  if (missing.length > 0) {
    return {
      ok: false,
      detail: `checkout at ${dir} has no ${missing.join(', ')} in node_modules`,
      fix: 'bash scripts/build-host-ui.sh  (installs the packages the render gates resolve from the checkout)',
      dir,
    };
  }
  return { ok: true, detail: `checkout at ${dir}`, dir };
}

// The jar, not `target/classes`: `install` and `package` write the jar, while the `-am test` build the
// governance gate runs stops before the package phase. Marking on `classes` would let that test build
// satisfy this prerequisite without putting anything in the local Maven repository.
// 看的是 jar，不是 `target/classes`：`install` 与 `package` 会写 jar，而治理测试那道门禁的 `-am test`
// 在打包阶段之前就停了。用 `classes` 当标记，会让那次测试构建在**没往本地 Maven 库放任何东西**的情况下
// 把这条前置判成满足。
const BUILT_JAR = { dir: 'yudao-server/target', prefix: 'yudao-server' };

export function detectBuilt() {
  const abs = path.join(ROOT, BUILT_JAR.dir);
  const jar = fs.existsSync(abs)
    ? fs.readdirSync(abs).find((f) => f.startsWith(BUILT_JAR.prefix) && f.endsWith('.jar'))
    : undefined;
  if (!jar) {
    return {
      ok: false,
      detail: `no host jar in ${BUILT_JAR.dir}`,
      fix:
        'bash scripts/jdk25.sh mvn -B -ntp -pl yudao-server -am -DskipTests install  ' +
        '(the two test steps omit -am, so they resolve the reactor from the local Maven repository)',
    };
  }
  return { ok: true, detail: `${BUILT_JAR.dir}/${jar}` };
}

function healthOnce(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve(res.statusCode === 200 && /"status"\s*:\s*"UP"/.test(body)));
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}

const STACK_FIX =
  'start the stack the hand-off recipe uses (`deploy/demo-ecs/`, then `KEELBASE_JDK25=… bash scripts/run-server.sh`) ' +
  'and set HOST_URL, PG_* and REDIS_* to it; CI gets one from its service containers';

export async function detectStack() {
  const host = process.env.HOST_URL;
  if (!host) return { ok: false, detail: 'HOST_URL is not set', fix: STACK_FIX };
  const up = await healthOnce(new URL('/actuator/health', host).href);
  if (!up) return { ok: false, detail: `${host}/actuator/health does not answer UP`, fix: STACK_FIX };
  return { ok: true, detail: `host at ${host} answers UP` };
}

export async function detectPrerequisites() {
  return {
    node: { ok: true, detail: `node ${process.version}` },
    jdk: detectJdk(),
    ui: detectUi(),
    built: detectBuilt(),
    stack: await detectStack(),
  };
}

// ── execution ──────────────────────────────────────────────────────────────────

/** The argv a gate really runs. The `script-tests` glob is expanded here, not by a shell. */
export function argvFor(gate, { uiDir, testFiles, uiDependentTests }) {
  if (gate.globbed) {
    const files = testFiles.filter((f) => !uiDependentTests.includes(f));
    return ['node', '--test', ...files];
  }
  return gate.cmd.map((token) => (token === UI_DIR_VAR ? uiDir : token));
}

function spawnGate(argv, extraEnv) {
  const [program, ...args] = argv;
  const bin = program === 'node' ? process.execPath : program;
  return spawnSync(bin, args, {
    cwd: ROOT,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
}

function tail(text, lines = 12) {
  const trimmed = (text ?? '').trimEnd().split(/\r?\n/);
  return trimmed.slice(-lines).join('\n');
}

export async function run() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('usage: node scripts/gates.mjs [--require-all] [--list]');
    return 0;
  }
  const requireAll = args.includes('--require-all');
  const listOnly = args.includes('--list');
  const unknown = args.filter((a) => !['--require-all', '--list'].includes(a));
  if (unknown.length > 0) {
    console.error(`[gates] unknown argument(s): ${unknown.join(' ')}\nusage: node scripts/gates.mjs [--require-all] [--list]`);
    return 64;
  }

  const ciText = fs.readFileSync(path.join(ROOT, CI_FILE), 'utf8');
  const uiDependentTests = parseUiDependentTests(ciText) ?? [];
  const testFiles = fs
    .readdirSync(path.join(ROOT, 'scripts'))
    .filter((f) => f.endsWith('.test.mjs'))
    .map((f) => `scripts/${f}`)
    .sort();

  if (listOnly) {
    for (const g of GATES) console.log(`${g.prereq.padEnd(6)} ${g.id.padEnd(34)} ${g.cmd.join(' ')}`);
    return 0;
  }

  const prereqs = await detectPrerequisites();
  const uiDir = prereqs.ui.dir ?? resolveUiDir();

  console.log('── prerequisites / 前置条件 ──');
  for (const [name, p] of Object.entries(prereqs)) {
    console.log(`  ${p.ok ? '✓' : '✗'} ${name.padEnd(6)} ${p.detail}`);
    if (!p.ok) console.log(`      → ${p.fix}`);
  }
  console.log('');

  const width = Math.max(...GATES.map((g) => g.id.length));
  const failures = [];
  const skipped = [];
  let passed = 0;
  const started = Date.now();

  for (const gate of GATES) {
    const prereq = prereqs[gate.prereq];
    if (!prereq.ok) {
      skipped.push({ gate, reason: prereq.detail, fix: prereq.fix });
      console.log(`SKIP  ${gate.id.padEnd(width)}  ${prereq.detail}`);
      continue;
    }
    const argv = argvFor(gate, { uiDir, testFiles, uiDependentTests });
    process.stdout.write(`RUN   ${gate.id.padEnd(width)}  `);
    const t0 = Date.now();
    const result = spawnGate(argv, { ...(gate.env ?? {}), ...(gate.prereq === 'ui' ? { KEELBASE_YUDAO_UI: uiDir } : {}) });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (result.status === 0) {
      passed += 1;
      console.log(`exit 0  ${secs}s`);
      continue;
    }
    const code = result.status ?? `signal ${result.signal}`;
    failures.push({ gate, code, output: `${result.stdout ?? ''}${result.stderr ?? ''}` });
    console.log(`exit ${code}  ${secs}s`);
  }

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const ran = GATES.length - skipped.length;

  if (failures.length > 0) {
    console.error(`\n[gates] ${failures.length} 道门禁红 / ${failures.length} gate(s) red:\n`);
    for (const f of failures) {
      console.error(`  ✗ ${f.gate.id}  (exit ${f.code})  → ${f.gate.cmd.join(' ')}`);
      const out = tail(f.output);
      if (out) console.error(out.replace(/^/gm, '      '));
      console.error('');
    }
  }

  if (skipped.length > 0) {
    console.log(`[gates] 未跑 ${skipped.length} 道（显式 SKIP，不是通过）/ ${skipped.length} gate(s) did not run (explicit SKIP, not a pass):`);
    const byPrereq = new Map();
    for (const s of skipped) {
      if (!byPrereq.has(s.gate.prereq)) byPrereq.set(s.gate.prereq, []);
      byPrereq.get(s.gate.prereq).push(s.gate.id);
    }
    for (const [name, ids] of byPrereq) {
      console.log(`  ${name.padEnd(6)} ${ids.length}  ${ids.join(', ')}`);
      console.log(`         → ${prereqs[name].fix}`);
    }
  }

  console.log(`\n[gates] ${ran} 道已跑 · ${passed} 绿 · ${failures.length} 红 · ${skipped.length} 未跑（${secs}s）`);
  if (failures.length > 0) {
    console.log('[gates] FAIL — 逐条看上面各道的输出 / read each gate\'s output above');
    return 1;
  }
  if (skipped.length > 0) {
    if (requireAll) {
      console.log('[gates] FAIL（--require-all）—— 前置缺失的门禁不许记为通过 / a missing prerequisite is red in this mode');
      return 2;
    }
    console.log('[gates] PASS — 跑得了的全绿；未跑的已逐条说明。/ everything that could run is green; the rest is named above.');
    return 0;
  }
  console.log('[gates] PASS — 全部门禁都跑了且全绿 / every gate ran and is green');
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  run().then((code) => {
    process.exitCode = code;
  });
}
