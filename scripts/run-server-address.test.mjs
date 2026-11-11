// SPDX-License-Identifier: Apache-2.0
//
// 断言 `scripts/run-server.sh` 的绑定地址只由 `SERVER_ADDRESS` 决定：设了就作为 `--server.address=`
// 传给宿主，没设就一个参数都不多。启动命令由一枚假的 `java` 捕获 —— 它先满足 `jdk25.sh` 的版本检查，
// 再把收到的参数逐行打印出来，于是断言看的是真实 argv，而不是脚本里的字面文本。
//
// 运行：node --test scripts/run-server-address.test.mjs
//
// Asserts that `scripts/run-server.sh` takes its bind address from `SERVER_ADDRESS` and nothing else:
// set, it becomes `--server.address=` on the host's command line; unset, no such argument appears.
// The command line is captured through a fake `java` — one that passes `jdk25.sh`'s version check and
// then prints the argv it was given — so the assertion reads the real argv, not a literal in the script.
//
// Run with: node --test scripts/run-server-address.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, 'run-server.sh');

function fakeJdkHome() {
  const home = mkdtempSync(join(tmpdir(), 'keelbase-fake-jdk-'));
  mkdirSync(join(home, 'bin'), { recursive: true });
  const java = join(home, 'bin', 'java');
  writeFileSync(
    java,
    [
      '#!/usr/bin/env bash',
      'if [ "${1:-}" = "-version" ]; then',
      '  echo \'openjdk version "25.0.1" 2025-10-21\' >&2',
      '  exit 0',
      'fi',
      'for a in "$@"; do printf \'%s\\n\' "$a"; done',
      '',
    ].join('\n'),
  );
  chmodSync(java, 0o755);
  return home;
}

// `unset` names env vars this machine may already carry, so each case starts from the script's default.
function startArgs(env) {
  const childEnv = { ...process.env, ...env };
  for (const name of env.UNSET ?? []) delete childEnv[name];
  delete childEnv.UNSET;
  const home = fakeJdkHome();
  try {
    const run = spawnSync('bash', [script], { encoding: 'utf8', env: { ...childEnv, KEELBASE_JDK25: home }, timeout: 60_000 });
    assert.equal(run.status, 0, `run-server.sh exited ${run.status}: ${run.stderr}`);
    return run.stdout.split(/\r?\n/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test('SERVER_ADDRESS=127.0.0.1 puts --server.address on the host command line', () => {
  const args = startArgs({ PORT: '48123', SERVER_ADDRESS: '127.0.0.1' });
  assert.ok(args.includes('-jar'), `expected a java -jar invocation, got: ${args.join(' ')}`);
  assert.ok(args.includes('--server.port=48123'), `expected the isolated port, got: ${args.join(' ')}`);
  assert.ok(
    args.includes('--server.address=127.0.0.1'),
    `expected --server.address=127.0.0.1, got: ${args.join(' ')}`,
  );
});

test('without SERVER_ADDRESS the command line carries no --server.address', () => {
  const args = startArgs({ UNSET: ['SERVER_ADDRESS'] });
  assert.ok(args.includes('-jar'), `expected a java -jar invocation, got: ${args.join(' ')}`);
  assert.deepEqual(
    args.filter((a) => a.startsWith('--server.address')),
    [],
    `unset SERVER_ADDRESS must leave the bind address alone, got: ${args.join(' ')}`,
  );
});
