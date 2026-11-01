#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// F-2 的运行时那一半，作为一道**可复跑的门禁**：对着一个**跑着的**宿主，用 HTTP 读三件事。
//
//   · `GET  /ai/conversations`           每一项都带 `title`（string|null）与数值 `messageCount`
//   · `PUT  /ai/conversations/{id}/title` 给会话命名：200 + `{id,title}`；空白 = 清除；只有属主能改
//   · `GET  /ai/conversations/{id}/trace`  `conversation` 带同样的两个字段
//
// 这三件事随运行时 `0.1.15` 到来（`0.1.14` 没有）。页面靠它们工作：没有 `title` 就回落到「未命名」，
// 没有 `messageCount` 就回落到 `messages.length`（列表只带最新两条回合，于是「6 条」被读成「2 条」），
// 没有端点就报「Not found (HTTP 404)」。本脚本要找的正是这些**回落之前**的东西在不在。
//
// 它不是浏览器：页面那两处回落（`row.title || 未命名`、`row.messageCount ?? row.messages.length`）
// 就是这里读「缺席」的那两格。
//
// 口令**不写死**：`F2_PASS` 优先；没给就从 `admin` 那一行读（`scripts/admin-credential.mjs`）——
// 种子的两种合法状态它都点得出名，两种状态都不是时它停下并说出该改哪个旋钮。CI 也是这样跑的。
//
// 用法（Node 18+，零依赖）：
//
//   HOST_URL=http://127.0.0.1:48085 node scripts/check-conversation-titles.mjs --full
//   node scripts/check-conversation-titles.mjs --self-test   # 判定不空转：0.1.14 形状 => 红，0.1.15 形状 => 绿
//   node scripts/check-conversation-titles.mjs --json        # 机器可读
//
// 退出码：0 = 绿（该有的检查全过）、1 = 红（F-2 不成立）、2 = 阻塞（连不上 / 登录被拒 —— **不是**对
// F-2 的判定）。
//
// 环境变量：`HOST_URL`（必填）· `F2_PASS`（缺省时从库里admin行解析）· `F2_USER`（默认 admin）·
// `F2_TENANT`（默认 KeelBase）· `F2_TENANT_ID` · `F2_CONVERSATION_ID` · `F2_CREATE=0`（不许本脚本
// 经 `POST /ai/chat` 造会话 / 补回合 —— 共用栈上设它）· `F2_OUT=<文件>`（另存 JSON）。
//
// 为什么自己补两轮：`messageCount` 是**整段**条数，而列表只带最新两条回合。只有让同一个会话超过两条
// 回合，「`messageCount` 说 6、`messages.length` 只说 2」才有区别；少于三条时这一格无法判定，原脚本
// 记 SKIP，门禁里它必须真跑起来，故这里在允许造会话时把一个会话补到三条回合再读。
//
// ---
//
// The runtime half of F-2 as a **re-runnable gate**: three things, read over HTTP against a **running**
// host.
//
//   · `GET  /ai/conversations`            every item carries `title` (string|null) and a numeric `messageCount`
//   · `PUT  /ai/conversations/{id}/title` names a conversation: 200 + `{id,title}`; blank clears; owner only
//   · `GET  /ai/conversations/{id}/trace`  `conversation` carries the same two fields
//
// These arrive with runtime `0.1.15` (`0.1.14` lacks them). The page leans on them: no `title` means it
// falls back to "untitled", no `messageCount` means it falls back to `messages.length` (the list carries
// only the latest two turns, so "6 messages" reads as "2"), and no endpoint means "Not found (HTTP 404)".
// What this script looks for is those things *before* the fallback.
//
// It is not a browser: the page's two fallbacks (`row.title || 未命名`, `row.messageCount ??
// row.messages.length`) are exactly the two absences read here.
//
// The password is **never hardcoded**: `F2_PASS` wins; without it the password is read off the `admin`
// row (`scripts/admin-credential.mjs`) — both states the seed can legitimately leave are named there, and
// an unknown hash stops the gate and says which knob changes it. CI runs this way too.
//
// Usage (Node 18+, zero dependencies):
//
//   HOST_URL=http://127.0.0.1:48085 node scripts/check-conversation-titles.mjs --full
//   node scripts/check-conversation-titles.mjs --self-test   # not vacuous: 0.1.14 shape => RED, 0.1.15 shape => GREEN
//   node scripts/check-conversation-titles.mjs --json
//
// Exit codes: 0 = green (every required check passes), 1 = red (F-2 does not hold), 2 = blocked (cannot
// reach or cannot sign in — **not** a verdict about F-2).
//
// Env: `HOST_URL` (required) · `F2_PASS` (resolved from the admin row when absent) · `F2_USER` (default
// admin) · `F2_TENANT` (default KeelBase) · `F2_TENANT_ID` · `F2_CONVERSATION_ID` · `F2_CREATE=0` (do not
// create conversations or add turns through `POST /ai/chat` — set it on a shared stack) · `F2_OUT`.
//
// Why it adds two turns itself: `messageCount` is the **whole** transcript's count, while the list carries
// only the latest two turns. Only a conversation with more than two turns distinguishes "messageCount says
// 6" from "messages.length says 2"; below three turns the cell cannot be decided, so the original script
// recorded SKIP. A gate needs it to really run, so when creation is allowed this adds a conversation's
// turns up to three and reads again.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { ADMIN_USER, resolveAdminPassword } from './admin-credential.mjs'

const ARGS = new Set(process.argv.slice(2))
const SELF_TEST = ARGS.has('--self-test')
const FULL = ARGS.has('--full')
const AS_JSON = ARGS.has('--json')

const cfg = {
  base: (process.env.HOST_URL || '').replace(/\/+$/, ''),
  user: process.env.F2_USER || ADMIN_USER,
  pass: process.env.F2_PASS || '',
  tenant: process.env.F2_TENANT || 'KeelBase',
  tenantId: process.env.F2_TENANT_ID || '',
  conversationId: process.env.F2_CONVERSATION_ID || '',
  create: process.env.F2_CREATE !== '0',
  out: process.env.F2_OUT || '',
}

const TIMEOUT_MS = 20000

// 与 `scripts/run-*.mjs` 同一条取口令的路：`PSQL_HELPER_SCRIPT` > `PSQL_HELPER=docker|direct`。
// The same password path the `scripts/run-*.mjs` gates use: `PSQL_HELPER_SCRIPT` > `PSQL_HELPER=docker|direct`.
const PSQL = process.env.PSQL || 'psql'
const PSQL_HELPER = (process.env.PSQL_HELPER || 'docker').toLowerCase()
const PSQL_HELPER_SCRIPT = process.env.PSQL_HELPER_SCRIPT ? resolve(process.env.PSQL_HELPER_SCRIPT) : ''
const PG_CONTAINER = process.env.PG_CONTAINER || 'keelbase-yudao-pg'
const PG_DB = process.env.PG_DB || 'ruoyi-vue-pro'
const PG_USER = process.env.PG_USER || 'root'
const PG_PASSWORD = process.env.PG_PASSWORD || 'password'

function psql(sql) {
  if (PSQL_HELPER_SCRIPT) {
    if (!existsSync(PSQL_HELPER_SCRIPT)) {
      throw new Error(`PSQL_HELPER_SCRIPT points to a missing file: ${process.env.PSQL_HELPER_SCRIPT}`)
    }
    return execFileSync(
      process.execPath,
      [PSQL_HELPER_SCRIPT, '-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
        '-U', PG_USER, '-d', PG_DB, '-tAc', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: PG_PASSWORD } },
    ).trim()
  }
  if (PSQL_HELPER === 'docker') {
    return execFileSync(
      'docker',
      ['exec', '-i', '-e', `PGPASSWORD=${PG_PASSWORD}`, PG_CONTAINER, 'psql', '-U', PG_USER, '-d', PG_DB, '-tAc', sql],
      { encoding: 'utf8' },
    ).trim()
  }
  if (PSQL_HELPER === 'direct' || PSQL_HELPER === 'local') {
    return execFileSync(
      PSQL,
      ['-h', process.env.PGHOST || '127.0.0.1', '-p', process.env.PGPORT || '5432',
        '-U', PG_USER, '-d', PG_DB, '-tAc', sql],
      { encoding: 'utf8', env: { ...process.env, PGPASSWORD: PG_PASSWORD } },
    ).trim()
  }
  throw new Error(`PSQL_HELPER must be "docker" or "direct" (got "${process.env.PSQL_HELPER}"); or set PSQL_HELPER_SCRIPT`)
}

async function http(method, url, { token, tenantId, body } = {}) {
  // `connection: close`，别让 keep-alive 套接字活过这次运行 —— Windows 上它退出时会踩到 libuv 断言。
  // `connection: close` so no keep-alive socket outlives the run — one lingering trips a libuv assertion
  // on Windows at process exit.
  const headers = { accept: 'application/json', connection: 'close' }
  if (body !== undefined) headers['content-type'] = 'application/json'
  if (token) headers.authorization = `Bearer ${token}`
  if (tenantId !== undefined && tenantId !== '') headers['tenant-id'] = String(tenantId)
  let res
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (e) {
    return { status: 0, error: String(e && e.message ? e.message : e), text: '', json: null }
  }
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* 不是 JSON —— 留着原文 */ }
  return { status: res.status, text, json }
}

// 在用的两种信封，读法与客户端一致。
//   KeelBase 运行时成功：{code:200, message, data: <payload>, timestamp}   (ApiResponseAdvice)
//   YuDao 管理端成功：  {code:0, data: <payload>, msg}
//   KeelBase 运行时失败：error-body，data 为 null
// The two envelopes in play, read the way the clients read them.
function payload(json) {
  if (json && typeof json === 'object' && !Array.isArray(json) && 'data' in json) return json.data
  return json
}
function rowsOf(json) {
  const p = payload(json)
  if (Array.isArray(p)) return p
  if (p && typeof p === 'object') {
    for (const key of ['items', 'list', 'records']) if (Array.isArray(p[key])) return p[key]
  }
  if (json && Array.isArray(json.items)) return json.items
  return null
}
function messageOf(res) {
  const j = res.json
  return (j && (j.message || j.msg)) || (res.text || '').slice(0, 220)
}

// ---------------------------------------------------------------------------- 检查 / checks

class Report {
  constructor() { this.checks = [] }
  add(id, ok, detail, extra = {}) {
    this.checks.push({ id, ok: ok === null ? 'skip' : ok ? 'pass' : 'fail', detail, ...extra })
    if (!AS_JSON) {
      const tag = ok === null ? 'SKIP' : ok ? 'PASS' : 'FAIL'
      console.log(`${tag}  ${id.padEnd(28)}  ${detail}`)
    }
  }
  get failed() { return this.checks.filter((c) => c.ok === 'fail') }
  get failedIds() { return new Set(this.failed.map((c) => c.id)) }
}

async function login(base) {
  let tenantId = cfg.tenantId
  if (!tenantId) {
    const r = await http('GET', `${base}/admin-api/system/tenant/get-id-by-name?name=${encodeURIComponent(cfg.tenant)}`)
    if (r.status !== 200) throw new Error(`tenant lookup HTTP ${r.status}: ${messageOf(r)}`)
    tenantId = payload(r.json)
    if (tenantId === null || tenantId === undefined) throw new Error(`tenant "${cfg.tenant}" not found`)
  }
  const r = await http('POST', `${base}/admin-api/system/auth/login`, {
    tenantId,
    body: { username: cfg.user, password: cfg.pass },
  })
  const j = r.json || {}
  if (r.status !== 200 || j.code !== 0) {
    throw new Error(`login HTTP ${r.status} code=${j.code}: ${j.msg || j.message || (r.text || '').slice(0, 200)}`)
  }
  const token = payload(j) && payload(j).accessToken
  if (!token) throw new Error('login answered no accessToken')
  return { token, tenantId }
}

async function chat(base, token, tenantId, message, conversationId) {
  const body = { message }
  if (conversationId) body.conversationId = conversationId
  const r = await http('POST', `${base}/ai/chat`, { token, tenantId, body })
  const p = payload(r.json)
  return { status: r.status, id: p && p.conversationId }
}

function pickCountField(rows) {
  return rows.find((row) => row && typeof row.messageCount === 'number' && Array.isArray(row.messages) && row.messages.length < row.messageCount)
}

async function runSuite(base, out = {}) {
  const rep = new Report()

  const { token, tenantId } = await login(base)
  rep.add('login', true, `user=${cfg.user} tenant=${tenantId}`)
  const auth = { token, tenantId }

  // --- 列表 / the list -------------------------------------------------------------------------
  let list = await http('GET', `${base}/ai/conversations`, auth)
  rep.add('list.reachable', list.status === 200, `GET /ai/conversations -> HTTP ${list.status}${list.status === 200 ? '' : ` (${messageOf(list)})`}`)
  let rows = rowsOf(list.json) || []
  rep.add('list.isArray', list.status === 200 && Array.isArray(rowsOf(list.json)),
    `items=${rows.length}${Array.isArray(rowsOf(list.json)) ? '' : ' (payload is not a list — read the envelope?)'}`)

  // --- 没有会话时造一条，好让字段检查有东西可读 / make one when empty so the field checks have something to read
  if (rows.length === 0 && cfg.create && !cfg.conversationId) {
    const made = await chat(base, token, tenantId, 'F-2 gate: create a conversation')
    if (made.id) {
      rep.add('conversation.create', true, `POST /ai/chat -> conversationId=${made.id}`)
      list = await http('GET', `${base}/ai/conversations`, auth)
      rows = rowsOf(list.json) || []
    } else {
      rep.add('conversation.create', false, `POST /ai/chat -> HTTP ${made.status} with no conversationId (${messageOf({ json: made.body, text: '' })})`)
    }
  }

  // --- 补到三条回合：`messageCount` 与 `messages.length` 才分得开 / three turns, so the two counts can differ
  if (cfg.create && !cfg.conversationId && rows.length > 0 && !pickCountField(rows)) {
    const targetId = rows[0].id
    const turns = []
    for (const n of [2, 3]) turns.push(await chat(base, token, tenantId, `F-2 gate: turn ${n}`, targetId))
    const ok = turns.every((t) => t.status === 200)
    if (!AS_JSON) console.log(`note  ${'conversation.turns'.padEnd(28)}  added two turns to ${targetId} (${turns.map((t) => t.status).join(', ')})`)
    if (ok) {
      list = await http('GET', `${base}/ai/conversations`, auth)
      rows = rowsOf(list.json) || []
    }
  }

  const titleKey = rows.filter((r) => Object.prototype.hasOwnProperty.call(r, 'title'))
  const countKey = rows.filter((r) => typeof r.messageCount === 'number')
  rep.add('list.title', rows.length > 0 && titleKey.length === rows.length,
    rows.length === 0 ? 'no conversations to measure — create one (F2_CREATE) or set F2_CONVERSATION_ID'
      : `${titleKey.length}/${rows.length} items carry "title"` + (titleKey.length === rows.length ? '' : ' — the page falls back to 未命名'))
  rep.add('list.messageCount', rows.length > 0 && countKey.length === rows.length,
    rows.length === 0 ? 'no conversations to measure'
      : `${countKey.length}/${rows.length} items carry numeric "messageCount"` + (countKey.length === rows.length ? '' : ' — the page falls back to messages.length'))

  // `messageCount` 必须是整段的，不是列表带的那两条回合的。
  // `messageCount` must be the whole transcript's, not the two turns the list carries.
  const deep = pickCountField(rows)
  if (deep) {
    rep.add('list.messageCount.isTotal', true, `conversation ${deep.id}: messageCount=${deep.messageCount} > messages.length=${deep.messages.length}`)
  } else if (rows.length > 0 && countKey.length === 0) {
    rep.add('list.messageCount.isTotal', null, 'no row carries messageCount at all — already failed above')
  } else if (rows.length > 0 && cfg.create) {
    rep.add('list.messageCount.isTotal', false,
      'three turns were added to one conversation and messageCount still does not exceed messages.length — ' +
      'the count is the page-array length, not the whole transcript')
  } else if (rows.length > 0) {
    rep.add('list.messageCount.isTotal', null,
      'no row has more turns than the two the list carries, and this run may not add turns (F2_CREATE=0) — ' +
      'cannot tell the total from the fallback here')
  }

  // --- 挑一个会话命名 / pick the conversation to name ------------------------------------------
  let target = cfg.conversationId ? rows.find((r) => r.id === cfg.conversationId) || { id: cfg.conversationId } : rows[0]
  if (!target) {
    rep.add('conversation.target', false, 'no conversation to name — the rename checks below cannot run')
    return finish(rep, out)
  }
  rep.add('conversation.target', true, `id=${target.id}`)

  // --- 改名 / rename ---------------------------------------------------------------------------
  const marker = `F-2 gate ${new Date().toISOString()}`
  const put = await http('PUT', `${base}/ai/conversations/${encodeURIComponent(target.id)}/title`, { ...auth, body: { title: marker } })
  const putBody = payload(put.json)
  const put404 = put.status === 404
  rep.add('title.put', put.status === 200,
    `PUT /ai/conversations/{id}/title -> HTTP ${put.status}` +
      (put404 ? ' — the endpoint is not in the running runtime' : put.status === 200 ? '' : ` (${messageOf(put)})`))
  if (put.status === 200) {
    const echoed = putBody && putBody.id === target.id && putBody.title === marker
    rep.add('title.put.echo', echoed, `body=${JSON.stringify(putBody).slice(0, 160)}`)
  } else {
    rep.add('title.put.echo', null, 'skipped: the rename did not succeed')
  }

  const after = await http('GET', `${base}/ai/conversations`, auth)
  const afterRows = rowsOf(after.json) || []
  const readBack = afterRows.find((r) => r.id === target.id)
  rep.add('title.readBack', !!readBack && readBack.title === marker,
    readBack ? `list says title=${JSON.stringify(readBack.title)}` : 'the conversation is not in the list after the rename')

  const trace = await http('GET', `${base}/ai/conversations/${encodeURIComponent(target.id)}/trace`, auth)
  const traceConv = payload(trace.json) && payload(trace.json).conversation
  rep.add('trace.fields', trace.status === 200 && !!traceConv &&
      Object.prototype.hasOwnProperty.call(traceConv, 'title') && typeof traceConv.messageCount === 'number',
    trace.status !== 200 ? `GET /ai/conversations/{id}/trace -> HTTP ${trace.status}`
      : `conversation.title=${JSON.stringify(traceConv && traceConv.title)} messageCount=${JSON.stringify(traceConv && traceConv.messageCount)}`)

  // --- 配套检查（--full）/ supporting checks (--full) ------------------------------------------
  if (FULL) {
    const tooLong = await http('PUT', `${base}/ai/conversations/${encodeURIComponent(target.id)}/title`,
      { ...auth, body: { title: 'x'.repeat(201) } })
    rep.add('title.tooLong400', tooLong.status === 400, `201 characters -> HTTP ${tooLong.status}`)

    // 只有端点真的在时才有意义：一个根本没有这条路由的运行时对**任何** id 都答 404，那会把这一格读成通过。
    // Only meaningful once the endpoint exists: a runtime without the route answers 404 to *every* id,
    // which would read as this check passing.
    if (put.status !== 200) {
      rep.add('title.unknown404', null, 'skipped: the rename endpoint answers 404 to everything, so a 404 here proves nothing')
    } else {
      const unknown = await http('PUT', `${base}/ai/conversations/${encodeURIComponent('no-such-conversation-f2')}/title`,
        { ...auth, body: { title: 'x' } })
      rep.add('title.unknown404', unknown.status === 404, `unknown id -> HTTP ${unknown.status}` +
        (unknown.status === 200 || unknown.status === 201 ? ' — a conversation that does not exist was named' : ''))
    }

    const cleared = await http('PUT', `${base}/ai/conversations/${encodeURIComponent(target.id)}/title`, { ...auth, body: { title: '  ' } })
    const clearedBody = payload(cleared.json)
    rep.add('title.clear', cleared.status === 200 && !!clearedBody && clearedBody.title === null,
      `blank title -> HTTP ${cleared.status}, body=${JSON.stringify(clearedBody).slice(0, 120)}`)
  }

  // --- 把动过的还回去 / restore what was touched ----------------------------------------------
  if (put.status !== 200) {
    rep.add('title.restored', null, 'nothing to restore: the rename never succeeded')
  } else {
    const original = target.title ?? ''
    const restore = await http('PUT', `${base}/ai/conversations/${encodeURIComponent(target.id)}/title`, { ...auth, body: { title: original } })
    rep.add('title.restored', restore.status === 200,
      original === '' ? 'cleared the name this run set (it had none before)'
        : `restored the previous name ${JSON.stringify(original)} (HTTP ${restore.status})`)
  }

  return finish(rep, out)
}

// ---------------------------------------------------------------------------- 判词 / verdict

function verdictOf(rep) {
  const f = rep.failedIds
  const endpoint = f.has('title.put')
  const titleField = f.has('list.title')
  const countField = f.has('list.messageCount')
  if (endpoint && (titleField || countField)) {
    return {
      code: 'RUNTIME_PREDATES_F2',
      label: 'RED — the running runtime has no rename endpoint and no title/count fields: it predates F-2 (0.1.14 shape)',
      next: [
        'The host pin is still on the runtime release that predates F-2.',
        'Next: bump the host pin to the released runtime that carries F-2, rebuild the host, then re-run this gate.',
      ],
    }
  }
  if (endpoint) {
    return {
      code: 'ENDPOINT_MISSING',
      label: 'RED — the list carries title/messageCount but PUT is 404: half-wired runtime',
      next: ['A runtime that answers the fields but not the endpoint is not a released shape;',
             '      check which artifact the host resolved (mvn dependency:list) before trusting its pin.'],
    }
  }
  if (titleField || countField) {
    return {
      code: 'PROJECTION_MISSING',
      label: 'RED — rename works but the list is missing title/messageCount: the projection did not ship',
      next: ['The page will keep falling back to 未命名 / messages.length even though renaming succeeds.'],
    }
  }
  if (rep.failed.length > 0) {
    return { code: 'FAILED', label: `RED — ${rep.failed.length} check(s) failed: ${rep.failed.map((c) => c.id).join(', ')}`, next: ['Read the failing lines above.'] }
  }
  return { code: 'OK', label: 'GREEN — F-2 holds on this runtime: title, messageCount and rename are all live', next: [] }
}

function finish(rep, out) {
  const verdict = verdictOf(rep)
  out.report = rep
  out.verdict = verdict
  return { rep, verdict }
}

function emit(result) {
  const { rep, verdict } = result
  if (AS_JSON) {
    console.log(JSON.stringify({ verdict, checks: rep.checks }, null, 2))
  } else {
    console.log('')
    console.log(verdict.label)
    for (const line of verdict.next) console.log(`  ${line}`)
  }
  return verdict.code
}

// ---------------------------------------------------------------------------- 自证 / self-test

// 两个桩宿主：0.1.14 的形状（无字段、无 PUT）与 0.1.15 的形状。要点是判定**不空转**：同一套检查
// 必须在一个上红、在另一个上绿。
// Two stub hosts: the 0.1.14 shape (no fields, no PUT) and the 0.1.15 shape. The point is that the
// verdict is not vacuous: the same checks must go RED on one and GREEN on the other.
import { createServer } from 'node:http'

function stub(kind) {
  // 记住名字，改名才能在下次读里看得见 —— 忘了记的桩会让一个其实正确的运行时在读回那格判红。
  // The stored name, so a rename is observable on the next read — a stub that forgot it would make the
  // read-back check fail on a runtime that is in fact correct.
  const state = { title: null, messageCount: 2, messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }] }
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://stub')
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
    if (url.pathname === '/admin-api/system/tenant/get-id-by-name') return send(200, { code: 0, data: 1 })
    if (url.pathname === '/admin-api/system/auth/login') return send(200, { code: 0, data: { accessToken: 'stub-token' } })
    if (url.pathname === '/ai/conversations' && req.method === 'GET') {
      const row = {
        id: 'conv-1', userId: '1', provider: 'stub', model: 'stub',
        messages: state.messages.map((m) => ({ ...m })),
        lastActivityAt: '2026-10-29T00:00:00.000Z',
      }
      if (kind === 'new') { row.title = state.title; row.messageCount = state.messageCount }
      return send(200, { code: 200, message: 'ok', data: [row], timestamp: '2026-10-29T00:00:00.000Z' })
    }
    if (url.pathname === '/ai/chat' && req.method === 'POST') {
      // 只在 0.1.15 形状里实现：自证里 cfg.create=false，这里只为形状完整。
      // Implemented only on the 0.1.15 shape: the self-test runs with cfg.create=false; this keeps the shape complete.
      if (kind !== 'new') return send(404, { code: 404, message: 'Not Found', data: null })
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        state.messages.push({ role: 'user', content: JSON.parse(body || '{}').message || '' })
        state.messages.push({ role: 'assistant', content: 'stub reply' })
        state.messageCount = state.messages.length
        send(200, { code: 200, message: 'ok', data: { conversationId: 'conv-1', reply: 'stub reply' } })
      })
      return
    }
    const m = url.pathname.match(/^\/ai\/conversations\/([^/]+)\/title$/)
    if (m && req.method === 'PUT') {
      if (kind !== 'new') return send(404, { code: 404, message: 'Not Found', data: null, timestamp: '2026-10-29T00:00:00.000Z' })
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        const title = (JSON.parse(body || '{}').title || '').trim()
        state.title = title || null
        send(200, { code: 200, message: 'ok', data: { id: m[1], title: state.title }, timestamp: '2026-10-29T00:00:00.000Z' })
      })
      return
    }
    const t = url.pathname.match(/^\/ai\/conversations\/([^/]+)\/trace$/)
    if (t && req.method === 'GET') {
      const conv = { id: t[1], userId: '1', provider: 'stub', model: 'stub', messages: [], lastActivityAt: '2026-10-29T00:00:00.000Z' }
      if (kind === 'new') { conv.title = state.title; conv.messageCount = state.messageCount }
      return send(200, { code: 200, message: 'ok', data: { conversation: conv, steps: [] }, timestamp: '2026-10-29T00:00:00.000Z' })
    }
    send(404, { code: 404, message: 'Not Found', data: null })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

async function selfTest() {
  cfg.user = 'admin'
  cfg.pass = 'stub'
  cfg.tenant = 'stub'
  cfg.tenantId = '1'
  cfg.conversationId = ''
  cfg.create = false
  const results = {}
  for (const kind of ['old', 'new']) {
    const server = await stub(kind)
    const base = `http://127.0.0.1:${server.address().port}`
    console.log(`\n=== self-test: stub shaped like ${kind === 'old' ? '0.1.14 (no F-2)' : '0.1.15 (F-2 present)'} ===`)
    const r = await runSuite(base, {})
    results[kind] = r.verdict.code
    console.log(`  -> verdict ${r.verdict.code}`)
    await new Promise((done) => server.close(done))
  }
  const ok = results.old === 'RUNTIME_PREDATES_F2' && results.new === 'OK'
  console.log(`\nself-test ${ok ? 'PASS' : 'FAIL'}: 0.1.14-shaped=${results.old} (want RUNTIME_PREDATES_F2), 0.1.15-shaped=${results.new} (want OK)`)
  return ok ? 0 : 1
}

// ---------------------------------------------------------------------------- main

let result
if (SELF_TEST) {
  process.exitCode = await selfTest()
} else if (!cfg.base) {
  console.error('HOST_URL is required (e.g. HOST_URL=http://127.0.0.1:48085)')
  process.exitCode = 2
} else {
  try {
    if (!cfg.pass) cfg.pass = resolveAdminPassword(psql)
    result = await runSuite(cfg.base)
  } catch (e) {
    console.error(`BLOCKED — ${e.message}`)
    console.error('This is not a verdict about F-2: the stack was not reachable, the credentials were refused, or the password could not be resolved.')
    process.exitCode = 2
  }
}

if (result) {
  process.exitCode = emit(result) === 'OK' ? 0 : 1
  if (cfg.out) {
    const fs = await import('node:fs')
    fs.writeFileSync(cfg.out, JSON.stringify({ verdict: result.verdict, checks: result.rep.checks }, null, 2))
  }
}
