#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
//
// A psql-shaped helper for machines that have no psql client. The gates call it through
// `PSQL_HELPER_SCRIPT` with the same arguments they would pass to psql:
//
//   node scripts/psql-helper.mjs -h 127.0.0.1 -p 55449 -U root -d ruoyi-vue-pro -tAc 'select 1'
//
// Beyond the gate shape (`-h -p -U -d -tAc <sql>`) it also accepts `-f <file>`, so the same helper can
// create a database and load a schema dump in recipe §3.1 when neither createdb nor psql exists:
//
//   node scripts/psql-helper.mjs -h 127.0.0.1 -p 55449 -U root -d postgres -tAc 'create database "x"'
//   node scripts/psql-helper.mjs -h 127.0.0.1 -p 55449 -U root -d x -f sql/postgresql/ruoyi-vue-pro.sql
//
// It needs the `pg` package, which this repository does not depend on. Resolution order:
//   1. PSQL_HELPER_PG_MODULE        — path to the `pg` package directory itself;
//   2. PSQL_HELPER_PG_NODE_MODULES  — path to a `node_modules` directory that contains `pg`;
//   3. require('pg')                — normal resolution, honouring NODE_PATH;
//   4. <repo>/../.yd39-infra/node_modules/pg and <repo>/.yd39-infra/node_modules/pg — the layout the
//      recipe documents for the embedded stack;
//   5. D:/Rain6fish/.yd39-infra/node_modules/pg — the same embedded stack at its absolute host path, so
//      a clone anywhere on that host (not only beside .yd39-infra) still finds it with no configuration.
// Nothing is installed; if none of these finds `pg` the helper fails loudly and names the variables.
//
// Output follows `-tA` (tuples only, unaligned): one row per line, columns joined by `|`, NULL as an
// empty field — the same shape the gates' `psql()` consumes. Values are read by column **ordinal**
// (node-postgres `rowMode: 'array'`), so two selected columns with the same name stay two fields:
// `select 21, 79` prints `21|79`, not `79|79`. Without `-t` a header line is printed first; this is
// deliberately minimal and not a byte-for-byte psql emulation.
//
// 给没有 psql 客户端的机器用的 psql 形状助手。门禁经 `PSQL_HELPER_SCRIPT` 调用它，实参与 psql 相同：
//
//   node scripts/psql-helper.mjs -h 127.0.0.1 -p 55449 -U root -d ruoyi-vue-pro -tAc 'select 1'
//
// 除门禁形状（`-h -p -U -d -tAc <sql>`）外，它也认 `-f <file>`，故 recipe §3.1 在没有 createdb / psql
// 时可以用同一个助手建库并灌 schema：
//
//   node scripts/psql-helper.mjs -h 127.0.0.1 -p 55449 -U root -d postgres -tAc 'create database "x"'
//   node scripts/psql-helper.mjs -h 127.0.0.1 -p 55449 -U root -d x -f sql/postgresql/ruoyi-vue-pro.sql
//
// 它需要 `pg` 包，而本仓并不依赖它。解析顺序：
//   1. PSQL_HELPER_PG_MODULE        —— `pg` 包目录本身的路径；
//   2. PSQL_HELPER_PG_NODE_MODULES  —— 含 `pg` 的 `node_modules` 目录路径；
//   3. require('pg')                —— 常规解析，认 NODE_PATH；
//   4. <repo>/../.yd39-infra/node_modules/pg 与 <repo>/.yd39-infra/node_modules/pg —— recipe 写明的
//      embedded 栈布局；
//   5. D:/Rain6fish/.yd39-infra/node_modules/pg —— 同一个 embedded 栈的绝对路径；克隆在该机的任何位置
//      （不必与 .yd39-infra 相邻）都零配置找得到。
// 不安装任何东西；五处都找不到 `pg` 时助手大声失败，并点名该设哪个变量。
//
// 输出照 `-tA`（只出元组、不对齐）：一行一记录，列以 `|` 连接，NULL 为空字段 —— 正是门禁 `psql()` 消费的
// 形状。取值按列的**序号**（node-postgres `rowMode: 'array'`），故两个同名列仍是两个字段：
// `select 21, 79` 打印 `21|79`，不再是 `79|79`。不带 `-t` 时先打一行表头；这是刻意的最小实现，不是逐字节复刻 psql。
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

function loadPg() {
  const tried = [];
  const attempt = (label, fn) => {
    tried.push(label);
    try {
      return fn();
    } catch {
      return null;
    }
  };

  const explicit = process.env.PSQL_HELPER_PG_MODULE;
  if (explicit) {
    const mod = attempt(`PSQL_HELPER_PG_MODULE=${explicit}`, () => require(resolve(explicit)));
    if (mod) return mod;
    throw new Error(
      `PSQL_HELPER_PG_MODULE points at "${explicit}" but it could not be loaded as a module.\n` +
        `Set it to the "pg" package directory (the one containing package.json), e.g. ` +
        `D:/Rain6fish/.yd39-infra/node_modules/pg`,
    );
  }

  const nodeModules = process.env.PSQL_HELPER_PG_NODE_MODULES;
  if (nodeModules) {
    const mod = attempt(
      `PSQL_HELPER_PG_NODE_MODULES=${nodeModules}`,
      () => require(resolve(nodeModules, 'pg')),
    );
    if (mod) return mod;
    throw new Error(
      `PSQL_HELPER_PG_NODE_MODULES points at "${nodeModules}" but "${resolve(nodeModules, 'pg')}" ` +
        `could not be loaded.\nSet it to a node_modules directory that contains pg, e.g. ` +
        `D:/Rain6fish/.yd39-infra/node_modules`,
    );
  }

  const fromPath = attempt("require('pg')", () => require('pg'));
  if (fromPath) return fromPath;

  for (const candidate of [
    resolve(repoRoot, '..', '.yd39-infra', 'node_modules', 'pg'),
    resolve(repoRoot, '.yd39-infra', 'node_modules', 'pg'),
    // Absolute host path of the embedded stack the recipe documents: a clone can live anywhere (for
    // example D:/Rain6fish/.recipe-final-cold/KeelBase-Vue-Pro) and still find pg without configuration.
    // 绝对路径的 embedded 栈：克隆可以在任意位置（如 D:/Rain6fish/.recipe-final-cold/...），仍零配置。
    'D:/Rain6fish/.yd39-infra/node_modules/pg',
  ]) {
    const mod = attempt(candidate, () => require(candidate));
    if (mod) return mod;
  }

  throw new Error(
    'Cannot find the "pg" package. Nothing was installed.\n' +
      `Tried: ${tried.join(' · ')}\n` +
      'Set PSQL_HELPER_PG_NODE_MODULES to a node_modules directory containing pg ' +
      '(the recipe uses D:/Rain6fish/.yd39-infra/node_modules), or NODE_PATH to the same place.',
  );
}

function usage(message) {
  const text = [
    message,
    'Usage: psql-helper.mjs [-h host] [-p port] [-U user] [-d db] [-t] [-A] [-v name=value] [-c sql | -f file]',
    'Only the psql options listed above are supported; -w is accepted and ignored.',
  ].join('\n');
  throw new Error(text);
}

// psql 变量名：与 SQL 标识符同形，够覆盖 -v origin=... 与 -v ON_ERROR_STOP=1。
// psql variable names: identifier-shaped, which covers -v origin=... and -v ON_ERROR_STOP=1.
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function defineVariable(variables, assignment) {
  const eq = assignment.indexOf('=');
  if (eq === -1) {
    // `psql -v name`（不带 `=`）把变量设成空串；仍是「已定义」，故 \if :{?name} 为真。
    // `psql -v name` (no `=`) sets an empty value; it is still "defined", so \if :{?name} is true.
    if (!VARIABLE_NAME.test(assignment)) {
      throw new Error(`Invalid psql variable assignment "${assignment}" (expected name=value)`);
    }
    variables[assignment] = '';
    return;
  }
  const name = assignment.slice(0, eq);
  if (!VARIABLE_NAME.test(name)) {
    throw new Error(`Invalid psql variable assignment "${assignment}" (expected name=value)`);
  }
  variables[name] = assignment.slice(eq + 1);
}

export function parseArgs(argv) {
  const options = {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || process.env.USER || 'postgres',
    database: process.env.PGDATABASE || process.env.PG_DB || 'postgres',
    tuplesOnly: false,
    sql: '',
    file: '',
    variables: {},
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('-') || arg === '-') {
      positional.push(arg);
      continue;
    }
    if (arg === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');
      const name = eq === -1 ? body : body.slice(0, eq);
      const value = eq === -1 ? undefined : body.slice(eq + 1);
      if (name === 'host') options.host = value ?? argv[++i];
      else if (name === 'port') options.port = Number(value ?? argv[++i]);
      else if (name === 'username') options.user = value ?? argv[++i];
      else if (name === 'dbname') options.database = value ?? argv[++i];
      else if (name === 'file') options.file = value ?? argv[++i];
      else if (name === 'command') options.sql = value ?? argv[++i];
      else if (name === 'tuples-only') options.tuplesOnly = true;
      else if (name === 'no-align') options.noAlign = true;
      else if (name === 'set') {
        const assignment = value ?? argv[++i];
        if (assignment === undefined) usage('--set requires name=value');
        defineVariable(options.variables, assignment);
      }
      else if (name === 'no-password') { /* prompting is out of scope */ }
      else usage(`Unsupported option: ${arg}`);
      continue;
    }

    // Short options can be bundled the way psql accepts them (`-tAc`, `-Atc`, ...). Options that take
    // a value consume the rest of the bundle or the next argument.
    for (let j = 1; j < arg.length; j += 1) {
      const flag = arg[j];
      if (flag === 'h') { options.host = arg.slice(j + 1) || argv[++i]; break; }
      if (flag === 'p') { options.port = Number(arg.slice(j + 1) || argv[++i]); break; }
      if (flag === 'U') { options.user = arg.slice(j + 1) || argv[++i]; break; }
      if (flag === 'd') { options.database = arg.slice(j + 1) || argv[++i]; break; }
      if (flag === 'f') { options.file = arg.slice(j + 1) || argv[++i]; break; }
      if (flag === 'c') { options.sql = arg.slice(j + 1) || argv[++i]; break; }
      if (flag === 'v') {
        const assignment = arg.slice(j + 1) || argv[++i];
        if (assignment === undefined) usage('-v requires name=value');
        defineVariable(options.variables, assignment);
        break;
      }
      if (flag === 'w' || flag === 'W') continue; // password prompting is out of scope
      if (flag === 't') { options.tuplesOnly = true; continue; }
      if (flag === 'A') { options.noAlign = true; continue; }
      usage(`Unsupported option: -${flag}`);
    }
  }

  if (positional.length) options.sql = positional.join(' ');
  if (!options.sql && !options.file) usage('No command given: pass -c <sql>, -f <file>, or an SQL argument.');
  if (options.sql && options.file) usage('Pass either -c <sql> or -f <file>, not both.');
  return options;
}

export function render(result, tuplesOnly) {
  const lines = [];
  const results = Array.isArray(result) ? result : [result];
  const last = results[results.length - 1];
  if (!last || !last.rows) return '';
  if (!tuplesOnly && last.fields && last.fields.length) {
    lines.push(last.fields.map((field) => field.name).join('|'));
  }
  for (const row of last.rows) {
    // Rows arrive as arrays (rowMode: 'array') so duplicate column names keep their own position.
    // 行以数组返回（rowMode: 'array'），同名列各占各位，不会互相覆盖。
    const values = Array.isArray(row) ? row : last.fields.map((field) => row[field.name]);
    lines.push(values.map((value) => (value === null || value === undefined ? '' : String(value))).join('|'));
  }
  return lines.join('\n');
}

// 把 psql 字面量安全地写成 SQL 字符串：单引号成对、其余原样（standard_conforming_strings 默认开）。
// Render a psql value as a SQL string literal: double the single quotes; leave everything else alone
// (standard_conforming_strings is on by default, so backslashes are already literal).
export function quoteSqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

// 两份 `separate` 种子文件（`keelbase-local-images.sql`、`keelbase-file-storage.sql`）是写给 psql 的：
// 它们收 `-v origin=...`，用 `:'origin'` 当 SQL 字面量，并用 `\if :{?origin}` / `\else` / `\echo` /
// `\quit 1` / `\endif` 守住它。没有 psql 客户端的机器上，这些构造会原样送进 node-postgres，报语法错误。
// 本预处理器正好覆盖这一组：
//
//   - `-v name=value`（可重复）定义 psql 变量；
//   - SQL 字符串与注释之外的 `:'name'` 变成安全转义的 SQL 字面量（单引号成对）；
//   - `\if :{?name}` 在变量**已定义**时为真；`\else` / `\endif` 可嵌套；
//   - `\echo text` 写到 stderr（不污染 `-tA` 的标准输出）；
//   - `\quit [code]` 在连库之前停止执行。
//
// 明确不支持、且**大声报错**而不是静默吞掉的：其它元命令（`\set`、`\connect`…）、其它 `\if` 表达式、
// SQL 正文里的 `:name` / `:"name"` / `:{?name}`，以及含 `:'...'` 的美元引用字符串。变量未定义时的
// `:'name'` 也报错（psql 会原样留下，送到服务器同样只是语法错误）。非活动 `\if` 分支不评估其条件、
// 直接跳过，与 psql 一致。元命令的识别：一行首个非空白字符是 `\`、且不在活动的 `/* ... */` 块注释里；
// 非活动分支里的反斜杠行仍按元命令处理。这两份种子文件里没有落在块注释内的反斜杠行。
//
// The two `separate` seed files (`keelbase-local-images.sql`, `keelbase-file-storage.sql`) are written
// for psql itself: they take `-v origin=...`, use `:'origin'` as a SQL literal, and guard it with
// `\if :{?origin}` / `\else` / `\echo` / `\quit 1` / `\endif`. On a host with no psql client those
// constructs reached node-postgres verbatim and failed with a syntax error. This preprocessor covers
// exactly that set:
//
//   - `-v name=value` (repeatable) defines a psql variable;
//   - `:'name'` outside SQL strings and comments becomes a safely quoted SQL literal (`'` doubled);
//   - `\if :{?name}` is true when the variable is **defined**; `\else` / `\endif` nest;
//   - `\echo text` goes to stderr (keeping `-tA` stdout clean);
//   - `\quit [code]` stops before anything is sent to the database.
//
// Deliberately NOT supported, and loud rather than silent: any other meta-command (`\set`, `\connect`,
// ...), any other `\if` expression, `:name` / `:"name"` / `:{?name}` in SQL text, and dollar-quoted
// strings containing `:'...'`. An undefined `:'name'` is an error too (psql leaves it unexpanded, which
// reaches the server as nothing but a syntax error). Inactive `\if` branches are skipped without
// evaluating their condition, as psql does. Meta-commands are recognised when a line's first non-space
// character is `\` and it is not inside an active `/* ... */` block comment; a backslash line inside an
// inactive branch is still treated as a meta-command. Neither seed file has a backslash line inside a
// block comment.
export function preprocess(sql, variables = {}) {
  const vars = new Map(Object.entries(variables));
  const output = [];
  const echoes = [];
  const frames = [];
  const state = { inBlockComment: false };
  let quit = null;

  const active = () => frames.length === 0 || frames[frames.length - 1].active;

  const evaluateIf = (arg) => {
    const expr = arg.trim();
    const defined = expr.match(/^:\{\?([A-Za-z_][A-Za-z0-9_]*)\}$/);
    if (defined) return vars.has(defined[1]);
    if (/^true$/i.test(expr)) return true;
    if (/^false$/i.test(expr)) return false;
    throw new Error(
      `Unsupported \\if condition "${expr}". Supported: :{?name}, true, false.`,
    );
  };

  for (const line of String(sql).split(/\r?\n/)) {
    if (!state.inBlockComment && /^\s*\\/.test(line)) {
      const meta = line.match(/^\s*\\([A-Za-z]+)(?:\s+(.*?))?\s*$/);
      if (!meta) throw new Error(`Unsupported psql meta-command: ${line.trim()}`);
      const [, name, rawArg = ''] = meta;
      const arg = rawArg.trim();

      if (name === 'if') {
        const parentActive = active();
        // 非活动分支不评估条件：与 psql 一样跳过，别让无关分支里的表达式把整份文件打断。
        // An inactive branch does not evaluate its condition: skipped like psql, so an unrelated
        // expression cannot abort the whole file.
        const condition = parentActive ? evaluateIf(arg) : false;
        frames.push({ parentActive, active: parentActive && condition, seenElse: false });
        output.push('');
        continue;
      }
      if (name === 'else') {
        const frame = frames[frames.length - 1];
        if (!frame) throw new Error('\\else without matching \\if');
        if (frame.seenElse) throw new Error('\\else after \\else without \\endif');
        frame.seenElse = true;
        frame.active = frame.parentActive && !frame.active;
        output.push('');
        continue;
      }
      if (name === 'endif') {
        if (!frames.length) throw new Error('\\endif without matching \\if');
        frames.pop();
        output.push('');
        continue;
      }
      if (name === 'echo') {
        if (active()) {
          let message = arg;
          if (message.length >= 2 && message.startsWith("'") && message.endsWith("'")) {
            message = message.slice(1, -1).replace(/''/g, "'");
          }
          echoes.push(message);
        }
        output.push('');
        continue;
      }
      if (name === 'quit') {
        if (active()) {
          const code = arg === '' ? 0 : Number(arg);
          if (!Number.isInteger(code)) throw new Error(`Unsupported \\quit argument "${arg}" (expected an integer)`);
          quit = { code };
          break;
        }
        output.push('');
        continue;
      }
      throw new Error(`Unsupported psql meta-command: \\${name}`);
    }

    output.push(active() ? substituteVariables(line, vars, state) : '');
  }

  if (!quit && frames.length) throw new Error('\\if without matching \\endif');
  return { sql: output.join('\n'), echoes, quit };
}

// 只替换 SQL 字符串、标识符与注释**之外**的 `:'name'`；`::` 类型转换原样保留。
// Substitute only `:'name'` outside SQL strings, identifiers and comments; keep `::` casts untouched.
function substituteVariables(line, vars, state) {
  let out = '';
  let i = 0;
  while (i < line.length) {
    if (state.inBlockComment) {
      const end = line.indexOf('*/', i);
      if (end === -1) return out + line.slice(i);
      out += line.slice(i, end + 2);
      i = end + 2;
      state.inBlockComment = false;
      continue;
    }
    const ch = line[i];
    if (ch === '-' && line[i + 1] === '-') {
      out += line.slice(i);
      break;
    }
    if (ch === '/' && line[i + 1] === '*') {
      out += '/*';
      i += 2;
      state.inBlockComment = true;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === quote) {
          if (line[j + 1] === quote) {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      out += line.slice(i, j);
      i = j;
      continue;
    }
    if (ch === ':') {
      if (line[i + 1] === ':') {
        out += '::';
        i += 2;
        continue;
      }
      if (line[i + 1] === "'") {
        const close = line.indexOf("'", i + 2);
        if (close === -1) throw new Error(`Unterminated psql variable reference in: ${line}`);
        const name = line.slice(i + 2, close);
        if (!VARIABLE_NAME.test(name)) throw new Error(`Invalid psql variable reference :'${name}'`);
        if (!vars.has(name)) {
          throw new Error(`Undefined psql variable "${name}" in :'${name}' (pass -v ${name}=value)`);
        }
        out += quoteSqlLiteral(vars.get(name));
        i = close + 1;
        continue;
      }
      if (line[i + 1] === '{' || line[i + 1] === '"' || /^[A-Za-z_]$/.test(line[i + 1] || '')) {
        throw new Error(
          `Unsupported psql variable form in SQL text: ${line.slice(i)}. Only :'name' is supported.`,
        );
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let sql = options.sql;
  if (options.file) {
    const file = resolve(options.file);
    if (!existsSync(file)) throw new Error(`File not found: ${options.file} (resolved ${file})`);
    sql = readFileSync(file, 'utf8');
  }

  // 预处理器在连库之前跑：缺 `-v origin=...` 时 `\quit 1` 必须立刻失败，而不是先连上再报语法错。
  // The preprocessor runs before connecting: a missing `-v origin=...` must fail via `\quit 1` at once,
  // not after connecting and hitting a syntax error.
  const processed = preprocess(sql, options.variables);
  for (const message of processed.echoes) process.stderr.write(`${message}\n`);
  if (processed.quit) {
    process.exitCode = processed.quit.code;
    return;
  }
  sql = processed.sql;

  const { Client } = loadPg();
  const client = new Client({
    host: options.host,
    port: options.port,
    user: options.user,
    database: options.database,
    password: process.env.PGPASSWORD,
  });
  await client.connect();
  try {
    // rowMode: 'array' makes each row positional, which is what fixes `select 21, 79` (same column
    // name) and matches psql's unaligned output. / rowMode: 'array' 让行按位置返回，修同名列，贴合 psql。
    const result = await client.query({ text: sql, rowMode: 'array' });
    const output = render(result, options.tuplesOnly);
    if (output) process.stdout.write(`${output}\n`);
  } finally {
    await client.end();
  }
}

// Run only when invoked as a script; the test imports `render` from here. 仅直接执行时跑 main；测试会 import render。
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((error) => {
    process.stderr.write(`${error && error.message ? error.message : error}\n`);
    process.exitCode = 1;
  });
}
