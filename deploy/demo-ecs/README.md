# Deploy: the demo2 instance

> 中文：[README.zh-CN.md](README.zh-CN.md)

This directory holds the deployment of the KeelBase-Vue-Pro instance that answers on
`demo2.keelbase.com.cn`. It is what actually runs on the demo host, kept here so the host can be
rebuilt from the repository rather than from memory.

## What has to exist first

This stack is **not standalone**. It joins an existing network and uses that host's datastore:

- A running KeelBase stack on the same machine, whose compose project is `keelbase`, so the network
  `keelbase_default` exists and carries `keelbase-postgres-1` (a `pgvector/pgvector:pg17` container)
  and `keelbase-redis-1`.
- An outer nginx in front (`keelbase-web-1`) that terminates TLS for `demo2.keelbase.com.cn` and
  proxies the whole host to `yudao-admin`. That server block lives in the **main repository**
  (`KeelBase/nginx.https.conf`), not here; look for `server_name demo2.keelbase.com.cn`.

## Artifacts to produce

Two build outputs are copied next to these files; neither is tracked (see `.gitignore`).

**The server jar.** Built from this repository on a machine that has the toolchain — the host has no
JDK and no Maven.

```bash
# from the repository root; scripts/jdk25.sh resolves JDK 25 without touching your default
bash scripts/jdk25.sh mvn -q -DskipTests package -pl yudao-server -am
# ⇒ yudao-server/target/yudao-server.jar   (a fat jar, ~300 MB)
```

**Which modules that jar carries is a deployment decision, and it is not in the repository.** This
host runs **five**: `system`, `infra`, `bpm`, `crm`, `ai1-springai`. The repository's own build turns
on more than that, and the difference is not cosmetic — a 580 MB jar built with fifteen of them was
tried here on 2026-10-12 and **never finished starting** on a 1.6 GB host, while the five-module one is
308 MB and starts in about three minutes. Producing it means trimming two files (the root `pom.xml`'s
`<modules>` and `yudao-server/pom.xml`'s module dependencies) to those five before building, and
**both files also matter**: a module left in the reactor but not in the server's dependencies is not
packaged, and one left in the server's dependencies but not in the reactor is — pulled from the local
Maven repository, silently, which is how an audit of the first attempt found `report`/`hrm`/`fms`/
`pms`/`oa` still inside a jar that had "excluded" them.

> **2026-11-04 correction**: "five" is the baseline of the **2026-10-12 build**. Since then the
> governance line has switched on `fms` (`YD-28`'s fifth module; this deployment seeds none of its tables
> and shows none of its menus) and M3's `member` / `pay` / `pms` / `oa` in `yudao-server/pom.xml`, and
> `seed-manifest.txt` loads the `member` / `pms` / `oa` tables accordingly. Which modules this host runs is
> therefore read from `seed-manifest.txt` and `yudao-server/pom.xml`, with `module-scope.sql` deciding
> which menus are visible; the 1.6 GB / 580 MB reasoning above still stands for why the set was trimmed.

**The module set is the deployment's, so it belongs here rather than in the repository's own build.**
A change to which modules this host runs is a change to this file.

**`bpm` is inside that jar but is not part of the console.** Its presence is not an accident:
`yudao-module-crm` depends on it at build time — CRM's contract and receivable approvals run through
bpm's engine — so cutting bpm from the pom would take CRM with it. What this deployment does *not* do
is show it. Three facts that read as one:

| | this host |
|---|---|
| `bpm` classes in the jar | yes |
| bpm menu in the console | no — `/bpm` is not on `module-scope.sql`'s keep list, so the branch is switched off |
| `bpm_*` tables in the database | no — `seed-manifest.txt` skips `sql/keelbase-bpm.sql` |

A deployer who finds bpm classes in the jar should not read that as "workflow is available on this
host": none of its pages resolves, and the tables those pages read do not exist.

> ⚠ A **running** instance holds a lock on this jar, so `mvn package`'s repackage step fails and can
> leave the fat jar replaced by a thin one. Stop the instance first, or build in a separate worktree.

**The admin UI** is not in this repository. `scripts/build-host-ui.sh` fetches the upstream tree,
builds it, and lays the KeelBase visual layer over the built page. It also pins the page's API base
to **the same origin**: upstream's own `.env.prod` sets `VITE_BASE_URL=http://localhost:48080`, which
is right for the machine that builds the page and wrong for every machine that serves it — a
deployed page would ask its *visitor's* machine for the API, and every call would fail as a network
error while the page itself looked fine.

```bash
bash scripts/build-host-ui.sh
# ⇒ target/yudao-ui-admin-vue3/dist-prod/
```

## Deploy

On the host, in the directory that will hold the stack (on the demo host: `/opt/keelbase-yudao`):

```bash
mkdir -p /opt/keelbase-yudao/ui
# copy in: docker-compose.yml, admin-nginx.conf from here
# copy in: yudao-server.jar  → the directory
# copy in: dist-prod/*       → ui/

cp .env.example .env        # then fill both values — see .env.example for where each comes from

bash bootstrap-db.sh        # create the database and load the schema (idempotent; RESET=1 to reload)

docker compose up -d
```

`bootstrap-db.sh` takes its `load` list from `seed-manifest.txt` beside it. That manifest classifies
**every** `sql/keelbase-*.sql` once — `load`, `separate` (run by its own step because it takes a
parameter), or `skip` (with a reason) — so a new seed file cannot be ignored silently.
`node scripts/check-seed-list.mjs` holds it against the SQL directory, the console pages and
`module-scope.sql`, and is part of CI. A from-scratch rebuild is still the only final word on whether
the pages are reachable.

The server takes a minute or two to come up, and its log ends with `项目启动成功！`. Check it with:

```bash
docker logs -f yudao-server
curl -s -o /dev/null -w '%{http_code}\n' https://demo2.keelbase.com.cn/
curl -s https://demo2.keelbase.com.cn/ | grep -o '<title>[^<]*</title>'   # ⇒ <title>KeelBase</title>
```

## What the console shows, and what the assistant offers

`ConsolePages` — the list behind the `navigate_console_page` tool — names **31** routes. The console
this deployment runs can open **19** of them: `/system` (9 pages), `/infra` (5) and `/crm` (5). The
other **12** sit in branches `module-scope.sql` switches off — `/report`, `/bpm`, `/oa`, `/hrm`,
`/fms`, `/ai` — so the assistant can name a page the console answers with 「模块已禁用」.

`node scripts/check-console-pages.mjs` checks both trees now: a route has to compose **and** sit in a
branch this deployment keeps. The 12 are declared page by page in that script's `SWITCHED_OFF` table,
and the check goes red if a page is added to a switched-off branch without a declaration, if a
declaration's branch is switched back on, or if a declaration outlives its page. Narrowing
`ConsolePages` itself is a product decision about what the assistant should offer, so it is not
something this deployment changes.

The menu grants do not close that gap, and are worth knowing about. The seed's `system_role_menu` rows
for `super_admin` number **253**: **229** point into branches this deployment switches off, **24** at
menu ids no seed defines, and none at a branch it keeps (measured 2026-10-24; the check prints the
current counts on every run). They are dead weight rather than a fallback, because a super admin is
answered from **every** menu and not from those rows
(`PermissionServiceImpl.getRoleMenuListByRoleId`).

## The AI model loop, and where to reach it

KeelBase's own surface sits at the server **root**, not under `/admin-api` — that is where the AI
loop answers. The admin nginx forwards three prefixes there (`/app`, `/ai`, `/audit`); with
`AI_ENABLED=true` and a `MODEL_API_KEY` in `.env`, a real model drives them:

```
POST https://demo2.keelbase.com.cn/ai/chat    →  { "provider": "spring-ai", "toolCalls": [...] }
POST https://demo2.keelbase.com.cn/ai/task    →  steps ≥ 2, and the step that writes comes back held
                                                 for confirmation, with its token
GET  https://demo2.keelbase.com.cn/app/capabilities
```

The provider defaults to DeepSeek — `MODEL_BASE_URL=https://api.deepseek.com`,
`MODEL_NAME=deepseek-v4-flash` — and `MODEL_BASE_URL` can point at any OpenAI-compatible endpoint.
The two `POST`s take the host's own access token (the runtime resolves it to a host user), so there
is one identity rather than two. The runtime also registers `/auth`, `/customers` and `/follow_ups`
at the root; those are deliberately **not** forwarded — see `admin-nginx.conf`.

## Things worth knowing before changing this

- **Secrets are not here.** `docker-compose.yml` reads `PG_PASSWORD` and `AUDIT_KEY` from `.env`,
  which is git-ignored. The database password is the host's existing Postgres role's, read off the
  running container; the audit key must be generated once and then left alone, because the audit
  chain is verified by recomputing hashes from it.
- **Uploads go into the database, not onto the platform vendor's server.** Upstream's seed makes an
  *example* store master with the vendor's own domain in it, so every upload landed on a server we do
  not control. `sql/keelbase-file-storage.sql` makes the **database-backed** store master instead —
  files go into the database, so there is no host directory that has to exist and nothing to mount.
  It takes the origin as a parameter (`PUBLIC_ORIGIN` in the bootstrap), because a stored file's URL
  is built from it.
  Postgres container, and Redis is that stack's, on **database index 1** so it does not collide with
  the other stack's cache. Nothing here creates a container for either.
- **Memory is the binding constraint on the demo host**, not disk. The server runs with
  `-Xmx384m` and still takes ~600 MB resident; the host has 1.6 GB in total, so it swaps. If this
  instance is to be relied on, raise the host's memory rather than tuning the heap down further.
- **The AI model loop** is switched by `AI_ENABLED` plus `MODEL_API_KEY` in `.env`. With both set,
  KeelBase's `/ai/chat` and `/ai/task` are driven by a real model; the base URL and model name default
  to DeepSeek's (`https://api.deepseek.com`, `deepseek-v4-flash`) and can be pointed at any
  OpenAI-compatible provider. With `AI_ENABLED` unset they answer from the deterministic planner and
  `/ai/chat` reports `provider: deterministic`.
- The `--spring.datasource.dynamic.datasource.master.type=...HikariDataSource` argument is not
  cosmetic: on PostgreSQL, upstream's default pool fails roughly half of all logins.
