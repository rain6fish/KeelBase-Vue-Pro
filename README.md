# KeelBase-YuDao

> Chinese: [README.zh-CN.md](README.zh-CN.md)

<p align="center">
  <a href="https://github.com/rain6fish/KeelBase-YuDao/actions/workflows/ci.yml"><img src="https://github.com/rain6fish/KeelBase-YuDao/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="NOTICE"><img src="https://img.shields.io/badge/License-MIT_%2B_Apache--2.0-blue.svg" alt="License: MIT (upstream host) + Apache-2.0 (KeelBase additions)"></a>
  <img src="https://img.shields.io/badge/Java-25-informational" alt="Java 25">
  <img src="https://img.shields.io/badge/Spring_Boot-4.1.0-informational" alt="Spring Boot 4.1.0">
</p>

**An enterprise application development platform built for AI** — hosted on
[yudao / `ruoyi-vue-pro`](https://github.com/YunaiV/ruoyi-vue-pro), adding the KeelBase runtime:
identity bridge, tool governance, confirmation, decision trace, audit and revoke.

> **Not an upstream release.** This is a downstream derivative whose history was deliberately started
> fresh: upstream's commits are **not** carried, so the derivation is stated here and in `NOTICE`
> rather than in a log. Upstream's tree is used as a working host, not repackaged as a product. Not
> affiliated with, sponsored by or endorsed by the upstream project or its authors.

> **In a hurry?** [KEELBASE-HOST.md](keelbase-docs/KEELBASE-HOST.md) — why this repository exists, what
> it does and does not claim, and where its line stands.

**Articles** — the long-form essays behind these decisions, on AI execution governance and AI audit evidence: [keelbase.hashnode.dev](https://keelbase.hashnode.dev/).

<!-- BEGIN keelbase-family:en sha256:92e82fd34f0a15d22b119841121b79f97caa1bfb8f5d77dcdcf73002c9257be0 -->
## 🧬 The KeelBase family

<p align="center">
  <img src="https://raw.githubusercontent.com/rain6fish/KeelBase/main/docs/branding/keelbase-family-en.svg" alt="The KeelBase family — a host adapter, two runtimes that are peers, the bridge, and the contract all of them consume" width="880">
</p>

> KeelBase is **one protocol with several implementations and hosts** — not a set of competing
> products. The contract is the source of truth; runtimes and hosts consume it, and none of them
> owns it. Every repository here is **Apache-2.0**.

```text
  host adapters   KeelBase-YuDao
                  └ governance added to a mature enterprise platform (yudao)

  runtimes        KeelBase (TypeScript)   ·   KeelBase4J (Java / Spring)
                  └ two carriers of the same protocol — peers, not translations

  bridge          KeelBase-java-starter
                  └ wire an existing Java/Spring system in as governed AI tools

  contract        keelbase-contract
                  └ wire schemas + conformance vectors + the version line they share
```

| Repository | Role | Stack | Status |
|---|---|---|---|
| [`KeelBase`](https://github.com/rain6fish/KeelBase) | Reference implementation · product documentation · demo | TypeScript · NestJS · Vue · Flutter · Taro | active |
| [`KeelBase4J`](https://github.com/rain6fish/KeelBase4J) | The Java carrier of the same protocol | Java 17 · Spring Boot | active |
| [`KeelBase-java-starter`](https://github.com/rain6fish/KeelBase-java-starter) | Wire an existing Java/Spring system in as governed AI tools | Maven · Gradle | 0.1.x |
| [`KeelBase-YuDao`](https://github.com/rain6fish/KeelBase-YuDao) | Host adapter — the governance layer on a yudao platform | Java · Vue 3 | active |
| [`keelbase-contract`](https://github.com/rain6fish/keelbase-contract) | The protocol itself — schemas, vectors, the version line | JSON Schema | v1.x |

**Where to start** — see it run: [`KeelBase`](https://github.com/rain6fish/KeelBase) (60-second
Docker) · make an existing Java system AI-capable:
[`KeelBase-java-starter`](https://github.com/rain6fish/KeelBase-java-starter) · you already run yudao:
[`KeelBase-YuDao`](https://github.com/rain6fish/KeelBase-YuDao) · implement the protocol:
[`keelbase-contract`](https://github.com/rain6fish/keelbase-contract).

**Read the series** — the long-form essays behind these decisions, on AI execution governance and
AI audit evidence: [keelbase.hashnode.dev](https://keelbase.hashnode.dev/).

Which contract version each runtime answers for is maintained **once**, in the main repository — see
[Compatibility](https://github.com/rain6fish/KeelBase#-compatibility). It is not duplicated here.
<!-- END keelbase-family:en -->

## What this is

KeelBase-YuDao takes a mature enterprise application platform as its host and gives it the thing such
platforms generally do not have: a boundary an AI can be held to. The host keeps doing what it already
does well — users, tenants, permissions, data scope, workflow, CRUD, code generation. This repository
adds the constraint that decides **what an AI is allowed to do on top of it**, and records what it did.

Governance here is **not a layer beside those**: it is a constraint that runs **across** all of them.
The host's own screens keep guarding themselves; what this repository adds is the constraint that holds
for **the actions an AI takes** — and it has to hold on **every path that executes one**, not on a
separate console.

## What KeelBase adds

| Layer | What it is |
|---|---|
| **Identity bridge** | `YudaoCallerAuthenticator` / `YudaoIdentityResolver` — the host's token and user table become the runtime's subject and role |
| **Tool governance** | Business actions are declared as tools with a risk level and a confirmation requirement; the platform decides, not the agent |
| **Confirmation** | Writes are held for a human before they run, and the decision is recorded |
| **Decision trace and audit** | A hash-chained audit of who caused what, plus an explicit decision trace |
| **Row governance** | A generated module's rows are scoped by a pointcut over the module's own service, so the tool face and the module's REST face are held by the **same** advices |

## Verified

The behaviour above was **observed on a development host** (2026-10-08), end to end:

- a yudao access token reaches the runtime's own endpoints, and the caller resolves to a yudao user;
- the tool face executes a real tool against this host's own user table, and a chat routes to a tool
  over a module **this host's own code generator** produced — reading a real row;
- a write is held at R3 for confirmation, and executes once approved;
- the audit chain verifies over its own rows, in this host.

The datastore is **PostgreSQL with pgvector**, and the server was verified running against it.

**What that record is, and is not.** It is a spike that was run to its first evidence — the write-up
and the raw logs live in the project's private repository. It is **not a re-runnable gate**: the
behaviour above is not yet held by a script the way the sibling host's is. Turning it into one is the
adapter work, and until then read every claim here as **observed once**, not **asserted continuously**.

## Not done yet — read this before relying on anything

- **It is not a finished adapter.** What is in here began as a spike; copying it into a repository did
  not make it one.
- **The model-driven path has not been run with a real model** — only the deterministic planner was
  exercised.
- **The conformance suite and the four rates have not been run here.** Whole-host checks, concurrency
  and long-run behaviour, and the licence surface of upstream's module dependency tree are all
  unmeasured.
- **The knowledge layer's semantic path is unexercised.** pgvector is present, which is its
  precondition, but that path also needs an embedding model and none is configured.
- **It does not claim verification.** No user, customer or trial has been through it.

> **⚠ Rechecked 2026-10-11** — two items above have since landed on this host: the **model-driven path** now runs with a real model (`scripts/run-model-loop-scenarios.mjs`), and the **conformance suite and the four rates** now have scripts here (`scripts/run-app-conformance.mjs`, `scripts/measure-governance-rates.mjs`). The list is kept as written (a 2026-10-09 snapshot); the rest still stands.

## Where this sits

KeelBase carries one runtime as a **platform with adapters**: the runtime is `keelbase4j-core`, and
each host is a repository. This is the second host, after `KeelBase-RuoYi`, which is kept as a frozen
adapter rather than developed further.

## Running it

```bash
bash scripts/bootstrap-datastore.sh   # PostgreSQL with pgvector, plus redis
bash scripts/run-server.sh            # JDK 25, resolved per command
```

`scripts/jdk25.sh` resolves a JDK 25 for one command and leaves the machine's default JDK alone — the
platform here compiles to 25, while the core it embeds builds on 17. Details, including why each run
parameter is needed, are in [KEELBASE-DEV.md](keelbase-docs/KEELBASE-DEV.md).

## Provenance

Upstream: [`YunaiV/ruoyi-vue-pro`](https://github.com/YunaiV/ruoyi-vue-pro) ("yudao") — branch
`master-jdk25` at `994605b` (2026-10-07) · Spring Boot 4.1.1 · Java 25 · MIT, kept verbatim in
`LICENSE`.

The upstream README body is not reproduced here, and upstream's commit history is not carried: this
repository was initialised fresh, so it shares no merge base and no commit with upstream.

Upstream's name is used **descriptively** — it says what this repository is built on. It is not this
project's name and not a claim of association.

## Licence

Upstream is MIT and is kept verbatim (`LICENSE`). Everything this project adds is Apache-2.0. Which
licence covers which part is set out in [NOTICE](NOTICE).
