# KeelBase host — why this repository exists

> Chinese: [KEELBASE-HOST.zh-CN.md](KEELBASE-HOST.zh-CN.md)

This repository is **not** an upstream release. It is the **host side** of the KeelBase host
integration: the yudao platform, used as an enterprise application foundation that the KeelBase Java
runtime is embedded into. It is the second host this runtime has been embedded in, beside
`KeelBase-RuoYi`.

It exists because the project decided, on **2026-10-08**, to carry the runtime as a **platform with
adapters**: new work goes into this host, and the earlier host is kept as a frozen adapter rather than
developed further. The internal record of that decision lives in the project's private repository;
this file is the part of it that belongs with the code.

## Where it came from

| | |
|---|---|
| Upstream | `YunaiV/ruoyi-vue-pro` ("yudao") |
| Branch | `master-jdk25` |
| Commit | `994605b51080fbc1f4c7838f80ac0468f1d0e67c` (2026-10-07) |
| Revision | `0.1.1` (this derivative's own line) · Java 25 · Spring Boot 4.1.1 |
| Licence | MIT — retained unmodified in `LICENSE`; see `NOTICE` |

**The history is not upstream's.** This repository was initialised fresh: it carries no upstream
commit history and shares no merge base with upstream. The derivation is stated in `README.md` and
`NOTICE`, so it can be read without reading a log.

## What is in here

| Part | What it is | Licence |
|---|---|---|
| `yudao-*` | the upstream platform, unedited except where noted below | MIT |
| `yudao-server/src/main/java/cn/iocoder/yudao/server/keelbase/` | the KeelBase host glue — identity bridge, tool face, planner wiring | Apache-2.0 |
| `yudao-server/pom.xml` | adds the `cn.com.keelbase:keelbase4j-core` dependency | — |
| `yudao-module-system/.../admin/auth/AuthController.java` | one seam change: an explicit bean name, because both sides define a class called `AuthController` | the change is Apache-2.0 |

## Where this line stands

This repository began as a **spike that was run to its first evidence**, not as a finished adapter.
Copying it here does not make it one, and nothing below is claimed beyond what was executed.

**Executed on a live host** (2026-10-08):

- a yudao access token reaches the runtime's own endpoints, and the caller resolves to a yudao user;
- the tool face executes a real tool against this host's own user table;
- the audit chain verifies over its own rows, in this host.

**Not done**: the model-driven path has not been run with a real model (only the deterministic planner
was exercised); the generator face has not been adapted to this host's code generator; the
conformance suite and the four rates have not been run here; concurrency, long-run behaviour, and the
licence surface of upstream's module dependency tree are all unmeasured.

> **⚠ Rechecked 2026-10-11** — three items above have since landed: the **model-driven path** runs with a real model (`scripts/run-model-loop-scenarios.mjs`), the **generator face** is adapted (`keelbase-codegen`, `scripts/run-host-generator.mjs`), and the **conformance suite and the four rates** have scripts here (`scripts/run-app-conformance.mjs`, `scripts/measure-governance-rates.mjs`). Kept as written (a 2026-10-08 snapshot).

> **Runtime pin, 2026-10-24** — this line pins the runtime at **0.1.11**, which ships the core-side execution↔trace link. **The host does not consume that link**: nothing in this repository references `ExecutionTrace*`, and it stays unconsumed until `plan/yd-trace-link` (`441e1be4`) merges into `main`. This is the CTO's ruling of **2026-10-24**; the pin move itself landed in `16e5f4b9fb`. Kept as written (a pre-merge snapshot).

> **⚠ Updated 2026-10-24** — that ruling is **superseded**: `plan/yd-trace-link` (`441e1be4`) merged into `main` as **`0e76496651`**, and the host now **consumes** the link. `YudaoExecutionTraceFilter` starts or reuses a span on every request and puts its trace id on the runtime's `ExecutionTraceHolder`; ai1's submit carries that id into the Redis stream, so the tool loop on the worker thread runs under the same trace and the audit rows it writes are paired with the host's own operation log. What stands behind that today: the filter's unit test — `Ai1SessionStreamToolTest` exercises the stream task but asserts nothing about the trace id (corrected 2026-10-27; the 2026-10-25 entry below carries the evidence that does). An isolated-stack E2E had shown `execution_trace_links` rows carrying a non-null `trace_id`, but that reading ran **before** this merge and **was not re-run on it at the time**; **2026-10-25 closed that gap** — on one isolated stack the same call was read three times: with the fix (`66536a1eee`) the link row's `trace_id` was non-null, with that fix reverted the same call wrote **NULL**, and with the fix restored it was non-null again — with the tool on `boundedElastic-2` in all three runs, so the cross-thread hop is present every time and only whether the trace follows changes. This rests on the 2026-10-25 three-reading A/B on one stack (recorded in the project's execution log, entry `2026-10-25 trace 异步传播修复`).

> **⚠ Updated 2026-10-25** — what stood behind the line then was true only for the **synchronous** path. On the **async** path — ai1's streamed task — the tool loop runs on Reactor's `boundedElastic`, and the runtime's `ExecutionTraceHolder` ThreadLocal did not follow the hop: the tool ran and its audit rows were written, but `execution_trace_links.trace_id` came out **NULL**. That was a real defect, not a wording gap. `TraceScopedToolCallback` (commit **`66536a1eee`**) fixes it: when tools are assembled it captures `ExecutionTraceHolder.current()`, sets it around each `call` — local and MCP `ToolCallback`s alike — and clears it afterwards, so the tool and its audit write see this turn's trace and the pool thread keeps nothing. What stands behind the line now: the synchronous path was read on a real stack (non-null link row, host log matching); `TraceScopedToolCallbackTest` reads **3/3**; and on the same isolated stack the async call `POST /admin-api/ai1/session/message/send-stream` was read in three places at once — the response header `trace-id=e05ff0c6…`, the Redis task field, and `execution_trace_links.trace_id` — all `e05ff0c6…`, with the tool still running on `boundedElastic-2`.

## What this line does not do

- **It does not claim verification.** No user, customer or trial has been through it. What is written
  here is what ran on a development host — and nothing beyond it.
- **It is not upstream's release**, and it is not affiliated with, sponsored by or endorsed by the
  upstream project or its authors. "Yudao" and `ruoyi-vue-pro` are used descriptively, to say what
  this repository is built on; they are not this project's name and not a claim of association.
- **It does not settle who owns what.** In a host that brings its own tenancy, its own data-range
  engine and its own AI module, three questions have to be answered before anything moves here:
  organisation / tenant, data range, and AI. They **were answered on 2026-10-08**, in the project's
  internal record rather than in this file: the tenant becomes a first-class contract dimension,
  landing on the contract line and not on this one; row visibility for governed tables belongs to
  KeelBase's pointcuts alone, so this host's data-permission engine is not registered for them; and
  the AI layer reuses this host as its carrier, with KeelBase governing on top. **What this repository
  does not do is implement those answers** — it is still the spike that was run to its first evidence,
  and its code predates them.

## The runtime's guarantee is unchanged

Embedding it here changes none of it: **the model only proposes**. On the path KeelBase puts the model
on, identity, permission, confirmation, audit and revoke are applied downstream, unconditionally — not
on a separate console.

**Two model paths, two depths.** That sentence is about **that** path, and this host has more than one.
The module this host ships with for AI, and `yudao-module-ai`, both let a model call tools directly —
**KeelBase does not stand in between**; they are upstream's own console features. Nothing here governs
them; the governed path is the one the runtime drives. So the guarantee is a statement about **the
governed path**, not about every AI action this host can perform.
