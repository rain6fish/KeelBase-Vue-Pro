// SPDX-License-Identifier: Apache-2.0
//
// 上游 REST 写的旁路台账，接进审计链页之后必须仍**看得出它不是受治理路径**。运行：
//
//     node --test scripts/bypass-audit-surface.test.mjs
//
// 这些断言刻意停在源码层（与 `boundary-page.test.mjs` 同一个理由：本仓不带 Vue 测试运行器，构建所依的
// UI 检出是一次性的 `target/`）。钉住的是让这一块成立的几份文件之间的契约：
//
//   1. 区块在页面上**自成一段**，且带「不是受治理路径」的声明（警示词条 + 不并表）；
//   2. 中英两套词条齐全，且键集合一致；
//   3. 后端面只读、只 GET，闸是 `read OperationAudit`，读取**不选**请求体摘要，且按租户收窄；
//   4. 身份矩阵那一格没有被顺手放开：`20002`（审计链页）只给 `audit_reader`，不给 `common`。
//
// 第 3、4 条合起来就是这道面的权限口径：页面与接口同射程——审计读者与管理员读得到，普通角色读不到。
//
// The bypass ledger of upstream REST writes, as it meets the audit-chain page, must still **read as not
// a governed path**. Run with:
//
//     node --test scripts/bypass-audit-surface.test.mjs
//
// Source-level on purpose (the same reason as `boundary-page.test.mjs`: this repository ships no Vue
// test runner, and the UI checkout the build uses is disposable under `target/`). What is pinned is the
// contract between the files that make the block real:
//
//   1. the block is **its own section** on the page and carries the "not a governed path" declaration;
//   2. both message bundles carry the keys, with identical key sets;
//   3. the backend face is read-only, GET only, gated on `read OperationAudit`, selects **no** request
//      digest, and narrows by tenant;
//   4. the identity matrix's cell has not been quietly opened: `20002` (the audit-chain page) goes to
//      `audit_reader` and not to `common`.
//
// 3 and 4 together are this face's permission rule: page and endpoint share one scope — audit readers and
// administrators reach it, ordinary roles do not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = 'keelbase-ui/host-overlay/src/views/keelbase/governance/AuditChainPage.vue';
const API = 'keelbase-ui/host-overlay/src/keelbase/governanceApi.ts';
const PATCH = 'keelbase-ui/host-patches/0002-governance-ui.patch';
const CONTROLLER = 'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/YudaoBypassAuditController.java';
const READER = 'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/YudaoBypassAuditReader.java';
const RULES = 'yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/YudaoAuditReaderRules.java';
const MATRIX = 'scripts/check-identity-matrix.mjs';

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

/** 取从 `start` 起的对象字面量，跳过引号里的花括号。 / the object literal at `start`, ignoring quoted braces. */
function objectAt(text, start) {
  let depth = 0;
  let quote = '';
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === "'" || ch === '"') quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('unbalanced object literal');
}

/**
 * 补丁里那两棵 `bypass:` 消息树。每一行带一个 `+` 前缀；剥掉它，切片就是构建真正应用的对象。
 *
 * The two `bypass:` message trees in the patch. Every line has a leading `+`; strip that one marker and
 * the slice is the object the build actually applies.
 */
function bypassMessages() {
  const patch = read(PATCH);
  const marker = '+    bypass: {';
  const blocks = [];
  for (let at = patch.indexOf(marker); at !== -1; at = patch.indexOf(marker, at + marker.length)) {
    const raw = objectAt(patch, patch.indexOf('{', at));
    const js = raw
      .split('\n')
      .map((line) => line.replace(/^\+/, ''))
      .join('\n');
    blocks.push(new Function(`return (${js})`)());
  }
  assert.equal(blocks.length, 2, 'the patch carries exactly two bypass message blocks (English + Chinese)');
  const en = blocks.find((b) => b.title === 'Upstream REST writes — record only');
  const zh = blocks.find((b) => b.title === '上游 REST 写（只记不改）');
  assert.ok(en, 'the English bypass block exists');
  assert.ok(zh, 'the Chinese bypass block exists');
  return { en, zh };
}

function templateOf(vue) {
  const start = vue.indexOf('<template>');
  const end = vue.lastIndexOf('</template>', vue.indexOf('\n<script'));
  assert.ok(start >= 0 && end > start, 'the page has a template before its script');
  return vue.slice(start, end);
}

test('the bypass block is its own section and says it is not a governed path', () => {
  const vue = read(PAGE);
  const tpl = templateOf(vue);

  assert.match(tpl, /t\('keelbase\.bypass\.title'\)/, 'the block has its own title');
  assert.match(tpl, /t\('keelbase\.bypass\.notGoverned'\)/, 'the block shows the not-a-governed-path warning');
  assert.match(tpl, /t\('keelbase\.bypass\.noBody'\)/, 'the block says request bodies are not kept');

  // 自成一段：它有自己的表格数据源，而不是并进受治理行那张表。
  // Its own section: it has its own table source rather than sharing the governed rows' table.
  assert.match(tpl, /:data="bypass\?\.items \?\? \[\]"/, 'the bypass block draws its own rows');

  // 位置在行与链之后：两类记录不并表、也不并链。
  // Positioned after the rows and the chain: the two kinds are never merged into one table or chain.
  const bypassAt = tpl.indexOf("t('keelbase.bypass.title')");
  const chainAt = tpl.indexOf("t('keelbase.audit.chainTitle')");
  assert.ok(chainAt >= 0 && bypassAt > chainAt, 'the bypass block sits after the governed rows and their chain');

  // 请求体原文/摘要一律不画。
  // Neither the body nor its digest is drawn.
  assert.doesNotMatch(vue, /requestDigest|request_digest/, 'the page never draws the request body or its digest');
});

test('both languages carry the same bypass keys, so neither can render a blank block', () => {
  const { en, zh } = bypassMessages();
  const keys = [
    'title', 'notGoverned', 'noBody', 'total', 'pageOf',
    'colTime', 'colCaller', 'colMethod', 'colPath', 'colObject', 'colResult', 'colDuration',
    'empty', 'loadFailed',
  ];
  for (const [lang, block] of [['en', en], ['zh', zh]]) {
    for (const key of keys) {
      assert.ok(block[key], `${lang} carries keelbase.bypass.${key}`);
    }
  }
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort(), 'the two bundles carry the same keys');
});

test('the endpoint is read-only and gated on the operations-audit read grant', () => {
  const controller = read(CONTROLLER);

  assert.match(controller, /@GetMapping\("\/admin-api\/keelbase\/bypass-audit\/page"\)/, 'the page endpoint exists');
  assert.doesNotMatch(controller, /@(Post|Put|Delete|Patch)Mapping/, 'the bypass face exposes no write route');
  assert.match(controller, /GovernanceReadSubjects\.OPERATION_AUDIT/, 'it requires the operations-audit subject');
  assert.match(controller, /PermissionAuthorizer\.ACTION_READ/, 'it asks for read, not write');
  assert.match(controller, /new AccessDeniedException\(/, 'a refusal is a 403, not a narrow answer');

  // 规则源确实把这条读授予审计读者——否则接口的闸对谁都关着。
  // The rule source really grants that read to the audit reader — otherwise the gate is shut for everyone.
  assert.match(
    read(RULES),
    /new Rule\(GovernanceReadSubjects\.OPERATION_AUDIT, PermissionAuthorizer\.ACTION_READ, null\)/,
    'the audit reader holds read OperationAudit',
  );
});

test('the reader selects no request-body digest and narrows by tenant', () => {
  const reader = read(READER);

  const page = reader.match(/static final String PAGE = "([^"]*)"/);
  assert.ok(page, 'the reader declares its select list');
  assert.doesNotMatch(page[1], /request_digest/, 'the select list carries no request-body digest');
  assert.match(reader, /where tenant_id = \?/, 'the read is narrowed to the caller tenant');
  assert.doesNotMatch(reader, /\b(insert|update|delete)\b/i, 'the reader contains no write statement');
});

test('the identity matrix still gives the audit-chain page to the audit reader only', () => {
  const matrix = read(MATRIX);

  for (const [role, shouldHold] of [['audit_reader', true], ['common', false], ['m7_reader', false]]) {
    const at = matrix.indexOf(`role: '${role}'`);
    assert.ok(at >= 0, `the matrix registers ${role}`);
    const row = objectAt(matrix, matrix.lastIndexOf('{', at));
    const grants = /grants:\s*\[([^\]]*)\]/.exec(row);
    assert.ok(grants, `${role} has a grants list`);
    assert.equal(grants[1].includes('20002'), shouldHold, `${role} ${shouldHold ? 'holds' : 'does not hold'} 20002`);
  }
});
