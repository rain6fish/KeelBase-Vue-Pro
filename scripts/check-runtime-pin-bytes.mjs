#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// 宿主钉住的运行时，必须是**发布的那一份字节**，而不只是同一个版本号。
//
//   node scripts/check-runtime-pin-bytes.mjs                     # 查本机仓库里解析到的那三件
//   node scripts/check-runtime-pin-bytes.mjs --jar <fat.jar>     # 查产物 BOOT-INF/lib 里带着的那三件
//   node scripts/check-runtime-pin-bytes.mjs --resolve           # 先让 Maven 解析一遍再查
//   node scripts/check-runtime-pin-bytes.mjs --repo <base-url>   # 换发布库（默认 Maven Central）
//
// 2026-10-26 实测出来的那个坑：`0.1.11` 发在 Central 上，tag 与源码对得上，宿主 POM 也钉着 `0.1.11`
// —— 而宿主产物里嵌的**不是** Central 那份。本机 `~/.m2` 里有一份**本地 `mvn install` 装进去**的同版本 jar
// （`_remote.repositories` 写 `artifact>=`、无 `.md5`/`.sha1` sidecar），Maven 对**已发布的版本坐标**不会再去取，
// 于是本地那份**静默遮蔽**了发布那份：core `4b203bb3…` 对 Central `8a2c34dc…`，protocol 与 springai 同形。
// 两份内容等价（同 POM 字节、同源码、172 个类的 `javap -p` 声明相同，差别是 JDK 25 重编对 JDK 17），
// 所以**没有任何别的读数会报出来** —— 这正是它需要一道专门的检查的原因。
//
// 本检查做的唯一一件事：把**钉住的版本**在三个地方对起来 ——
//
//   ① POM 里的 pin：`cn.com.keelbase` 的 core / protocol / springai 三处版本必须**同一个**；
//   ② 解析到的字节：本机仓库里（或产物 `BOOT-INF/lib/` 里）那份 jar 的 sha1；
//   ③ 发布的那份：同一个坐标在发布库上的 `.sha1`。
//
// ② ≠ ③ 即红。取不到 ③ 也红 —— 那是「判不了」，不是「没事」，本脚本不把它读成绿。
//
// **它证明什么、不证明什么。** 它证明宿主用的这份 jar 与发布库声称的字节一致；它**不**证明发布库那份
// 能由 tag 复现（那是发布侧的事），也**不**替代真栈读数。三道面各管一段：本机仓库面查「构建解析到了什么」，
// 产物面查「真正跑起来的是什么」，`--resolve` 面查「在干净仓库里解析会取到什么」（CI 用）。
//
// `unzip` 是产物面的唯一外部依赖：Node 没有内置 zip 读法，而把 500MB 的 fat jar 整个读进内存不可取。
// 取不到 `unzip` ⇒ 红并说明原因，不静默跳过。
//
// The runtime this host pins must be **the published bytes**, not merely the same version number.
//
//   node scripts/check-runtime-pin-bytes.mjs                     # the three jars resolved in the local repository
//   node scripts/check-runtime-pin-bytes.mjs --jar <fat.jar>     # the three carried in the artefact's BOOT-INF/lib
//   node scripts/check-runtime-pin-bytes.mjs --resolve           # let Maven resolve first, then check
//   node scripts/check-runtime-pin-bytes.mjs --repo <base-url>   # another publishing repository (default: Maven Central)
//
// Measured on 2026-10-26: `0.1.11` was published on Central, the tag matched the source and the host's POM pinned
// `0.1.11` — and the bytes embedded in the host artefact were **not** Central's. The local `~/.m2` held an
// identical-version jar put there by a local `mvn install` (`_remote.repositories` reads `artifact>=`, with no
// `.md5`/`.sha1` sidecars), and Maven does not re-fetch an **already-published release coordinate**, so the local
// copy **silently shadowed** the published one: core `4b203bb3…` against Central's `8a2c34dc…`, with protocol and
// springai in the same shape. The two are content-equivalent (identical POM bytes, identical sources, identical
// `javap -p` declarations over 172 classes; the difference is JDK 25 against JDK 17), so **no other reading in this
// repository would report it** — which is exactly why it needs a check of its own.
//
// This check does one thing: it holds **the pinned version** against three places —
//
//   ① the POM pins: the `cn.com.keelbase` versions for core / protocol / springai must be **one** version;
//   ② the resolved bytes: the sha1 of that jar in the local repository (or inside the artefact's `BOOT-INF/lib`);
//   ③ the published copy: the `.sha1` served for the same coordinate.
//
// ② ≠ ③ is red. Being unable to read ③ is red too — that is "cannot decide", not "fine", and this script never
// reads it as green.
//
// **What it proves and does not.** It proves the jar this host uses matches the bytes the publishing repository
// claims; it does **not** prove those bytes are reproducible from the tag (that is the publishing side's claim),
// and it does not replace a real-stack reading. The three surfaces cover different moments: the repository surface
// is "what the build resolved", the artefact surface is "what actually runs", and `--resolve` is "what a clean
// repository would fetch" (the CI surface).
//
// `unzip` is the artefact surface's only external dependency: Node has no built-in zip reader, and reading a 500MB
// fat jar into memory is not worth it. No `unzip` ⇒ red with the reason, never a silent skip.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'))
const GROUP = 'cn.com.keelbase'
const ARTIFACTS = ['keelbase4j-core', 'keelbase4j-protocol', 'keelbase4j-springai']
const DEFAULT_PUBLISHED = 'https://repo1.maven.org/maven2'

const ok = (s) => process.stdout.write(s + '\n')
const fail = (s) => process.stderr.write(s + '\n')

const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const has = (name) => args.includes(name)

if (has('-h') || has('--help')) {
  ok(`usage: node scripts/check-runtime-pin-bytes.mjs [--jar <fat.jar>] [--resolve] [--repo <base-url>]`)
  process.exit(0)
}

const published = (flag('--repo') ?? DEFAULT_PUBLISHED).replace(/\/+$/, '')
const fatJars = []
for (let i = 0; i < args.length; i += 1) if (args[i] === '--jar') fatJars.push(args[i + 1])

// ① The pins. Every `cn.com.keelbase` dependency on one of the three artefacts, across the repository's POMs.
// ① pin。全仓 POM 里对这三件的每一条 `cn.com.keelbase` 依赖。
function readPins() {
  const pins = new Map() // artifact -> [{ version, file, line }]
  const poms = ['pom.xml', ...readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .map((d) => join(d.name, 'pom.xml'))]
  for (const rel of poms) {
    const path = join(ROOT, rel)
    if (!existsSync(path)) continue
    const text = readFileSync(path, 'utf8')
    for (const m of text.matchAll(/<dependency>[\s\S]*?<\/dependency>/g)) {
      const block = m[0]
      const group = block.match(/<groupId>\s*([^<\s]+)\s*<\/groupId>/)?.[1]
      const artifact = block.match(/<artifactId>\s*([^<\s]+)\s*<\/artifactId>/)?.[1]
      const versionTag = block.match(/<version>\s*([^<\s]+)\s*<\/version>/)
      const version = versionTag?.[1]
      if (group !== GROUP || !ARTIFACTS.includes(artifact) || !version) continue
      // The report names a file **and a line**: a pin that disagrees has to be found, not searched for.
      // 报告点名**文件与行**：不一致的 pin 要能被找到，而不是让人再去搜一遍。
      const line = text.slice(0, m.index + block.indexOf(versionTag[0])).split('\n').length
      if (!pins.has(artifact)) pins.set(artifact, [])
      pins.get(artifact).push({ version, file: rel, line })
    }
  }
  return pins
}

const sha1Of = (buffer) => createHash('sha1').update(buffer).digest('hex')

async function publishedSha1(artifact, version) {
  const path = `${GROUP.replace(/\./g, '/')}/${artifact}/${version}/${artifact}-${version}.jar`
  const url = `${published}/${path}.sha1`
  let response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  } catch (error) {
    return { undecided: `取不到 ${url}（${error.cause?.code ?? error.message}）\n  could not read ${url}` }
  }
  if (response.status === 404) {
    return { undecided: `发布库上没有这个坐标：${url}\n  the pinned coordinate is not published: ${url}` }
  }
  if (!response.ok) return { undecided: `${url} ⇒ HTTP ${response.status}` }
  const body = (await response.text()).trim()
  const sha1 = body.match(/^([0-9a-f]{40})/i)?.[1]?.toLowerCase()
  if (!sha1) return { undecided: `${url} 的内容不是一个 sha1：${body.slice(0, 60)}` }
  return { sha1, url }
}

function localJarPath(artifact, version) {
  const repository = process.env.MAVEN_REPO_LOCAL ?? join(homedir(), '.m2', 'repository')
  return join(repository, ...GROUP.split('.'), artifact, version, `${artifact}-${version}.jar`)
}

// ②a The repository surface: the file Maven actually handed the build, plus whether it arrived by download
// or by a local install — the latter is the shadowing marker, so it is printed even when the bytes match.
// ②a 仓库面：Maven 真正交给构建的那个文件，以及它是下载来的还是本地装的 —— 后者正是遮蔽的标记，
//    所以即便字节相同也打出来。
function repositorySurface(artifact, version) {
  const path = localJarPath(artifact, version)
  if (!existsSync(path)) return { undecided: `本机仓库里没有 ${path}\n  not in the local repository: ${path}` }
  const markerFile = join(dirname(path), '_remote.repositories')
  const marker = existsSync(markerFile)
    ? readFileSync(markerFile, 'utf8').split('\n').find((line) => line.startsWith(`${artifact}-${version}.jar>`)) ?? ''
    : ''
  const origin = marker ? (marker.split('>')[1] || '<installed locally>') : '<no marker>'
  return { sha1: sha1Of(readFileSync(path)), at: path, origin }
}

// ②b The artefact surface: what the fat jar actually carries.
// ②b 产物面：fat jar 里真正带着的那一份。
function artefactSurface(fatJar, artifact, version) {
  const entry = `BOOT-INF/lib/${artifact}-${version}.jar`
  let listing
  try {
    listing = execFileSync('unzip', ['-Z1', fatJar], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8')
  } catch (error) {
    return { undecided: `读不了 ${fatJar}（${error.code === 'ENOENT' ? '找不到 unzip' : error.message}）\n  cannot read ${fatJar}` }
  }
  const matches = listing.split('\n').map((l) => l.trim()).filter((l) => l === entry)
  if (matches.length === 0) return { undecided: `${fatJar} 里没有 ${entry}\n  the artefact carries no ${entry}` }
  if (matches.length > 1) return { undecided: `${fatJar} 里有 ${matches.length} 个 ${entry}\n  duplicate entry` }
  const bytes = execFileSync('unzip', ['-p', fatJar, entry], { maxBuffer: 256 * 1024 * 1024 })
  return { sha1: sha1Of(bytes), at: `${fatJar}!${entry}` }
}

async function resolveCoordinates(version) {
  for (const artifact of ARTIFACTS) {
    try {
      execFileSync('mvn', [
        '-q', '-B', '-ntp',
        'org.apache.maven.plugins:maven-dependency-plugin:3.8.1:get',
        `-Dartifact=${GROUP}:${artifact}:${version}`,
      ], { stdio: 'pipe', cwd: ROOT })
    } catch (error) {
      fail(`解析失败：${GROUP}:${artifact}:${version}\n  resolution failed for ${GROUP}:${artifact}:${version}`)
      fail(String(error.stderr ?? error.message).trim().split('\n').slice(-6).join('\n'))
      return false
    }
  }
  return true
}

const pins = readPins()
const problems = []
const undecided = []

for (const artifact of ARTIFACTS) {
  if (!pins.has(artifact)) problems.push(`${artifact}：仓里没有任何 POM 钉它\n  no POM in this repository pins ${artifact}`)
}
const versions = new Set([...pins.values()].flat().map((p) => p.version))
if (versions.size > 1) {
  problems.push(`三个 pin 不是同一个版本：${[...versions].join(' / ')}\n  the pins disagree: ${[...versions].join(' / ')}`)
}
const version = [...versions][0]
if (!version) {
  fail('✗ ' + problems.join('\n✗ '))
  process.exit(1)
}

ok(`钉住的版本 / pinned: ${version}`)
for (const [artifact, list] of pins) for (const p of list) ok(`  ${p.file}:${p.line}: ${artifact} ${p.version}`)
if (problems.length) {
  fail('\n✗ ' + problems.join('\n✗ '))
  process.exit(1)
}

if (has('--resolve')) {
  ok(`\n解析中 / resolving ${GROUP}:*:${version} …`)
  if (!(await resolveCoordinates(version))) process.exit(2)
}

const rows = []
for (const artifact of ARTIFACTS) {
  const expected = await publishedSha1(artifact, version)
  if (expected.undecided) {
    undecided.push(`${artifact}：${expected.undecided}`)
    continue
  }
  const surfaces = fatJars.length
    ? fatJars.map((jar) => [jar, artefactSurface(jar, artifact, version)])
    : [['local repository', repositorySurface(artifact, version)]]
  if (fatJars.length === 0) {
    // 仓库面还有一个不体现在字节里的读数：这份是下载来的，还是本地装的。
    // The repository surface carries one reading the bytes do not show: downloaded, or installed locally.
    const local = surfaces[0][1]
    if (local.sha1) rows.push({ artifact, kind: 'origin', value: local.origin })
  }
  for (const [where, actual] of surfaces) {
    if (actual.undecided) {
      undecided.push(`${artifact} @ ${where}：${actual.undecided}`)
      continue
    }
    rows.push({
      artifact,
      kind: 'sha1',
      where: actual.at ?? where,
      actual: actual.sha1,
      expected: expected.sha1,
      match: actual.sha1 === expected.sha1,
    })
  }
}

ok('')
for (const row of rows) {
  if (row.kind === 'origin') {
    ok(`  ${row.artifact.padEnd(22)} 来源 / arrived by: ${row.value}`)
    continue
  }
  ok(`  ${row.artifact.padEnd(22)} ${row.match ? '=' : '≠'} 解析 / resolved ${row.actual}`)
  ok(`  ${''.padEnd(22)}   ${' '.repeat(row.match ? 1 : 0)}发布 / published ${row.expected}`)
  ok(`  ${''.padEnd(22)}   位置 / at ${row.where}`)
}

const mismatched = rows.filter((r) => r.kind === 'sha1' && !r.match)
if (mismatched.length) {
  fail(`\n✗ ${mismatched.length} 件的解析结果与发布字节不同 —— 宿主跑的不是发布的那一份。`)
  fail(`✗ ${mismatched.length} resolved artefact(s) differ from the published bytes — the host is not running the published copy.`)
  fail(`  本机能修的办法：把本机装的那几份移开，再重新解析（见 KEELBASE-DEV.md 的 Build 一节）。`)
  fail(`  Local fix: move the locally installed copies aside and resolve again (see the Build section of KEELBASE-DEV.md).`)
}
if (undecided.length) {
  fail(`\n✗ 判不了 / cannot decide：`)
  for (const line of undecided) fail(`  ${line}`)
}
if (!mismatched.length && !undecided.length && rows.some((r) => r.kind === 'sha1')) {
  ok(`\n✓ 钉住的 ${version} 与实际解析到的字节一致（${rows.filter((r) => r.kind === 'sha1').length} 处比对）。`)
  ok(`✓ ${version} as pinned matches the bytes actually resolved (${rows.filter((r) => r.kind === 'sha1').length} comparison(s)).`)
}
process.exit(mismatched.length ? 1 : undecided.length ? 2 : 0)
