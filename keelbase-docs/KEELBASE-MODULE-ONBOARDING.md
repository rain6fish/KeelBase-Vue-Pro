# KeelBase-YuDao — onboarding a business module

> Chinese: [KEELBASE-MODULE-ONBOARDING.zh-CN.md](KEELBASE-MODULE-ONBOARDING.zh-CN.md)

Bringing a business module under KeelBase splits into two halves. One half is written **once per
host**, and every later module gets it for free: identity, the planner, the audit chain, the
confirmation engine. The other half is written **per module**. This file is the second half, as a
checklist.

It **decides nothing**. Where a decision is missing it names which one, rather than picking.

**Written 2026-10-10**, from the two modules that exist: `crm` (upstream's own code — 283 Java files
we did not write, regenerate, or edit) and `products` (generated from `specs/products.json`). Two
samples is the same limit the cross-host evidence note states: enough to see a shape repeat, not
enough to freeze a contract.

**Revised 2026-10-11**: `YudaoRowScope` replaced the scope machine's declared narrowing with a read of
this host's own roles (§4.1 and §5, which is where the two sentences it changed are).

**Revised 2026-10-12**: a **third** module was onboarded — `yudao-module-bpm`'s leave request
(`bpm_oa_leave`), the second module upstream wrote, with its gate at
`scripts/run-bpm-oa-leave-scenarios.mjs`. It is what §4.1's owner-machine sentence could then be
corrected against (the owner here is `user_id`, not `owner_user_id`) and what turned up this line's
first **runtime-side** cost: the chat request declares one structured slot, and it is named `customerId`
(§4.5).

**Revised 2026-10-12 (b)**: the same day the host gained **the place to count them** — `GovernedModule`
+ `GovernedModuleRegistry`, and `scripts/check-governance-registry.mjs` to keep the count honest — so
§4.2's "nothing enumerates the governed modules" is answered and §2.4 has a third check.

**Revised 2026-10-12 (c)**: a **fourth** module followed — `yudao-module-system`'s in-app messages
(`system_notify_message`), the third module upstream wrote. It cost the same as the second (647 lines
against 642) and needed **no framework change at all**, which is the answer this file was written to
get: the per-module work is a **constant**, and it stays a constant, because the reading is of
upstream's code and upstream does not converge. It also produced the first **pair** owner
(`user_id + user_type`, §4.1) and the first module that already narrows itself (§4.3).

**Revised 2026-10-21**: a **fifth** module followed — the infra module's demo contact
(`yudao_demo01_contact`), the first whose rows carry **no owner column** and whose module has **no
permission table of its own**. It turned two costs this file had only implied into rules: the page
total when there is no caller filter to pass down (§2.1), and the owner stamp a tool-path create
needs after the insert (§2.2). Its gate is `scripts/run-demo01-contact-scenarios.mjs`.

## 1. Which half is which

| Half | Where it lives | A new module touches it? |
|---|---|---|
| Identity bridge | `YudaoCallerAuthenticator` · `YudaoIdentityResolver` · `YudaoCallerId` · `ActingCaller` | no |
| Planner | `YudaoToolPlanner` · `YudaoToolFaceConfiguration` | **no** |
| Row-range machine | `YudaoModuleScope` | no — with the caveat in §4 |
| Audit · confirmation · revoke · conformance | the platform, `keelbase4j-core` | no |
| **Governance aspect** | the module's own package | **yes** |
| **Tool face** | the module's own package | **yes** |
| **Routes** | the module's own package | **yes** |

The planner is written once because it never names a tool. `YudaoToolFaceConfiguration` takes a
`List<ModuleRoute>` from the context, so declaring a route bean is the whole of a module's
contribution to routing — nothing in `YudaoToolPlanner` changes when a module is added.

## 2. What a new module costs

Three things, and they usually land in **two files**: a `*Governance` aspect and a `*Tools`
configuration (the routes are `@Bean`s in the latter). `ListYudaoUsersTool` with `YudaoUsersRoute`
shows the same three things split across two files instead — that split is a style choice, not a rule.

A fourth thing appears only if the module's writes can be withdrawn: its `SideEffectCompensator` is a
`@Bean` **in the module's own `*Governance`**, never appended to the host's `YudaoLocalCompensators`
(`YD-44`). That is what keeps a new module's host-level artefacts at zero lines.

### 2.1 The governance aspect — the pointcut *is* the list

`@Aspect @Component`, with its pointcut naming the module's **own service**:

```java
@Around("execution(* cn.iocoder.yudao.module.crm.service.customer.CrmCustomerService.getCustomerPage(..))")
```

**Why at the service, and not inside the tool.** A narrowing written into the AI tool governs the
tool's own call and nothing else; the module's REST path stays open. Pointing the advice at the
module's service puts both the REST path and the tool under the same advices. The generated module's
first cut made exactly that mistake, and its file records it.

**What to narrow — read, don't template.** The four advices CRM needed are not a template; they are
four things **found by reading CRM's own code**. What generalises is the question set to ask of any
module:

| Ask | CRM's answer, found in their code |
|---|---|
| What does the page return when no filter is given? | `CrmSceneTypeEnum` adds **no condition at all** when `sceneType` is null, and the request VO documents null as "全部" |
| Is a read by id scoped? | no — `getCustomer(Long)` is a bare `customerMapper.selectById(id)` |
| Does the save VO let a client name someone else as owner? | yes — the owner column is in the VO |
| Does an update / delete by id check ownership? | no |

Each module answers these differently, and some will answer "nothing to close here". That reading is
the work, and it does not compress.

**When the page has no owner filter to pass down, the total must say which total it is.** Some
modules have no caller or owner column in the page VO — the owner is only the audit string `creator`,
filled by the persistence layer. The advice cannot narrow the query; it lets the module answer and
then filters the page it got back. That is narrower than a count-preserving filter, and it changes
what `total` means: the module's own total counts the table, while the narrowed total can only count
**this page's** rows. The honest form is to recompute `total = rows kept` and to **declare** the
choice where a reader can see it — the module's comments and this file — so nobody reads the number
as a table count. A module that needs a true per-caller total needs a caller filter (or a count query
with the same filter) in **its own** query; the advice cannot invent one. The gate must fix the
semantics with a pair: an exempt caller sees the module total, a narrowed caller sees the page-local
total (`run-demo01-contact-scenarios.mjs`, scenario 3.5).

**Declare a narrowing *as* a narrowing.** CRM's advice asks only the owner question, while upstream's
`crm_permission` grants READ and WRITE to participants as well as the owner. The advice is therefore
**stricter than the module, not equal to it** — its file says so, and widening it is a decision about
this host's vocabulary that has been left unmade rather than guessed. Every module owes the same
sentence.

### 2.2 The tool face — the `AiTool` beans

A `@Configuration` with `@Bean AiTool` methods: one read (R1) and one write (R3). Declare
`parameters()` on a write — a proposal that names an argument the tool does not read is refused at
the gate with `invalid_arguments`, before it reaches a human.

**A write's result must carry an `id`.** The engine records one side effect per result, and
`side_effects.result_id` is `NOT NULL` — so a write that returns no id does not merely report badly,
it **fails after the write has already landed** (`Updates: 1`, then the ledger insert throws and the
caller gets an error). Found the hard way on the system module's bulk write, whose result row is
`{"id": …, "changed": …}`. **A bulk write has no per-row result**, so the shape to copy there is the
one that module uses: name the result type after what actually changed (a mailbox, not a message) and
let its id be the thing that owns it. A parameterless write then has a second consequence worth
knowing: its call signature never varies, so a **failed approval leaves its claim `claimed` in
`write_claims`** and the engine refuses that same call from then on (`409 … the same call is not run
twice`). Both are runtime behaviour, not module bugs; both are recorded on the project's list.

**Carry the caller.** Upstream's own page query takes the user id **as an argument**, so identity has
to travel rather than merely be available: `ActingCaller.as(principal.userId(), …)`, plus the host's
tenant (`TenantUtils.execute(...)`) — a host-service call is refused without one.

**Stamp the owner after a tool-path create.** The framework's audit-field handler fills `creator`
from the security context; the AI tool path publishes its caller through `ActingCaller` instead, so a
row created through a tool lands with an empty `creator` and is invisible to its own owner. The
module's service must write the acting caller back **after** the insert — by id, inside the same
governed call (hence the same tenant context). Precedent: `Demo01ContactGovernance.stampCreator`
(read `scope.creatingCaller()`, call the service, then update only `{id, creator}`); the gate asserts
the stamped value, not merely that the row exists. This is per-module code rather than a host helper:
the save VO and mapper belong to the module, and a shared helper would have to guess both.

**Project.** Drop the identity and contact fields on the way out; the admin console's red line is
that identity fields are masked at the edge.

### 2.3 The routes

One `ModuleRoute` per tool, with `toolName()`, `triggers()` and `args(context)`. The planner matches
triggers and then falls back to the runtime's `RuleBasedPlanner` for everything the host says nothing
about — and the fallback is load-bearing, because supplying any `ToolCallPlanner` makes the runtime's
own auto-configuration back off.

### 2.4 The three places the build checks you

**Hand-written SQL is declared.** An upstream module whose schema upstream does not publish gets a
`sql/keelbase-<module>.sql` we derive. Add it to `HAND_WRITTEN` in
`keelbase-codegen/src/main/java/cn/iocoder/yudao/codegen/SpecCodegen.java`, or
`bash scripts/gen-from-spec.sh --check-boundary` reports it `UNDECLARED` and exits 1.

**Hand-written Java stays out of `generated/`.** The boundary check owns exactly two namespaces:
`sql/keelbase-*.sql` and `keelbase/generated/*.java`. A module we hand-write (CRM) keeps its
`*Governance` and `*Tools` in the **parent** package `cn.iocoder.yudao.server.keelbase`, not in
`…server.keelbase.generated`. Putting them under `generated/` turns the check red — it is enforced,
not a naming preference.

**You declare yourself governed.** A module's `*Governance` aspect has to `implements GovernedModule`
and return, from `module()`, the very segment its own pointcuts point at — `CrmCustomerGovernance` says
`crm`, `BpmOALeaveGovernance` says `bpm`, and the generated one says whatever its Spec's module is.
Miss it, or name a module you do not point at, and `node scripts/check-governance-registry.mjs` prints
`UNDECLARED` and exits 1. The Spec's template carries it, so a generated module is born declared.

### 2.5 The gate

A new module gets its own scenario script, and `scripts/run-crm-customer-scenarios.mjs` is the shape
to copy. It asserts the four things `D28 ④` calls the first acceptance gate — reachable under an
explicit identity, out-of-scope access refused, a high-risk write held for a human, the side effect
auditable. **The last of the four is best-effort, not a guarantee**: the host writes to its own
database and the audit row to another, so a write that lands and an audit append that fails leave the
write unrecorded (`D36` ①, 2026-10-11). Claim it as "in principle recorded", never as "every write is
on the chain". **Scope every assertion by a name unique to this run, never by a count of the whole
table**, so the gate holds on a database it has already been run against and alongside another run of
itself.

A module whose owner is an audit string also owes two assertions beyond the four: the page total's
declared semantics (§2.1) and the owner stamp on a tool-created row (§2.2). Both are checked in
`run-demo01-contact-scenarios.mjs` (scenarios 3 and 3.5).

Cleanup must take back **every confirmation row this run marked**, not only `pending` ones. An
approved row is this run's leftover too; deleting by `status = 'pending'` leaves it for the next run
to trip over. Match the run's unique marker and its fixture row ids, and include `approved` and
`rejected` in the delete.

## 3. The generated path is the same three things, by machine

`specs/products.json` → `bash scripts/gen-from-spec.sh specs/products.json` emits the module's DDL,
its `*Tools`, and its `*Governance`. The same three shapes, produced rather than typed.

One thing is easier on this path, and the direction is worth noting because it is the reverse of the
usual one: the page request VO is ours, so it already carries the owner column and the generated
mapper already turns it into an `eqIfPresent`. Narrowing a page is one `setOwnerUserId` before the
call — with the total narrowed too, so no page's total disagrees with its rows.

This is the half that does not repeat by hand **only for modules we generate**. For a module upstream
wrote, there is no Spec to write — see §2.

## 4. Five things that decide whether the per-module work is cheap

1. **The scope machine is an owner-machine, and the owner is whatever field the module names.**
   `YudaoModuleScope.belongsToCaller` takes the owner as a string — `owner_user_id` for CRM, `user_id`
   for BPM's leave request — so nothing in the machine changes with the column's name; what changes is
   **which field an advice reads**, and that reading does not compress. A module whose row range is a
   department, a permission table, the tenant, or **the engine's own tables** (BPM's task and
   process-instance surfaces take their ownership from `assignee` / `startUserId`, not from a column)
   will not fit it and will need a second machine. This is the line between "the same every time" and
   "different every time". A second machine now **partly** exists — `YudaoRowScope` reads *this host's
   own* role table — but it answers a different question: whether the caller ranges over every row and
   is therefore exempt from narrowing at all, and not "which rows does this caller see". The narrowing
   itself is still the ownership field.
   **⚠ Extended 2026-10-12 (`YD-15`)**: the owner is not always **one** field. The system module's
   messages belong to `(user_id, user_type)` — pinning the id alone leaves the other half forgeable,
   because an administrator and a member share the numeric id space. `ownerField()` assumes a single
   field and is the first thing a fourth module has shown to be an assumption rather than a fact; it
   is answered here by returning the pair as one string, and generalising it is a decision for when
   the sample says so, not before.
2. **Nothing enumerates the governed modules.** RuoYi has a `GovernedModule` interface and a registry;
   YuDao's `CrmCustomerGovernance`, `BpmOALeaveGovernance` and `ProductsGovernance` are bare
   `@Component`s. There is no single place that lists what is governed — so there is nowhere to read
   that a module was forgotten.
   **⚠ Corrected 2026-10-12 (`YD-13`)**: this host now carries the same pair — `GovernedModule` +
   `GovernedModuleRegistry`, host-local exactly as RuoYi's is, which was checked rather than assumed —
   and the three aspects declare themselves. A running host says the set in its own log, and
   `scripts/check-governance-registry.mjs` refuses a `*Governance` that names a module's own service
   without declaring itself. The paragraph above was true when it was written. What is still open is
   what this bullet was really about: the registry **counts**, and the check keeps the count honest,
   but neither can tell you that a module *should* have been governed and was not — that remains a
   person's reading.
3. **Each module owes a narrowing decision** (§2.1): owner-only, or aligned with the module's own
   permission table — **or, a third answer the system module gave, the module already narrows and the
   advice owes it only identity**. That last one is cheaper and it is worth reading *which* answer a
   module gives before writing an advice: on `system_notify_message` the module's own "my" queries
   filter on the caller's pair, so the cross-subject write is a **no-op** rather than a denial, and the
   gate asserts the row is untouched instead of asserting a refusal.
4. **The abstraction boundary is not settled.** `YD-T7` is open, and the cross-host evidence note
   nominates `ActingCaller`, `ModuleRoute` and the fallback planner as promotion candidates. Seams
   written now may later move package, because the sample is still two hosts.
5. **The runtime's request shape names one module's field — and no longer does.** The chat request
   (`cn.com.keelbase.runtime.web.ChatRequest`) declares `message`, `conversationId` and **`customerId`**
   — one structured slot, and it is named for CRM. A second module's rows have no slot of their own, so
   BPM's route puts the leave id into `customerId`. It works, it is recorded in the tool face's class
   comment rather than dressed up, and it is the first cost this line has found that lives **outside**
   the module. Generalising the slot is a runtime change and lands on the platform line, not here.

   **⚠ Corrected 2026-10-15 (`YD-35`): the slot is generic now, and the paragraph above no longer
   describes the runtime.** The component is `targetId`; a route states its own row id there, and both
   the BPM and the system-message routes read that key. The old name still binds, as a JSON alias,
   because the callers are not all in this repository — a route written against `customerId` keeps
   working; it is simply not the name to write new code against.

## 5. What this file does not claim

- Five modules is five samples — four upstream (`crm`, BPM's leave request, the system module's
  messages, and infra's demo contact) and one generated (`products`). Everything above describes the
  shape they repeated, not a contract. What the first four together say is a **number**: a second
  module cost 642 lines and a third cost 647, so the per-module work is flat rather than falling. The
  fifth is the one they did not cover: no owner column, no permission table, and therefore the two
  rules added on 2026-10-21.
- **CRM, the BPM leave slice, the system message slice and the infra demo contact have been run end
  to end** (`YD-2`'s gate, `YD-14`'s gate, `YD-15`'s gate, and `run-demo01-contact-scenarios.mjs`).
  `products` has been generated and built, not put through the same gate.
- The scope machine's administrator test is still a **placeholder**: "administrator" means user 1
  until a role mapping is decided. That half is unchanged. What changed on **2026-10-11** is the other
  half — the host's role table *is* read now (`YudaoRowScope`), for the every-row exemption only.
  Until then this file said there was no such read, and that sentence was true when it was written.

## 6. Where the source of truth is

| Question | Read |
|---|---|
| What this repository is, and what it does not do | `KEELBASE-HOST.md` |
| How to get a running checkout, and the traps on the way | `KEELBASE-DEV.md` |
| The same problem on the frozen RuoYi host, in more detail | `../../KeelBase-RuoYi/keelbase-docs/KEELBASE-AI-GUIDE.md` |
| What a module's gate asserts | `scripts/run-crm-customer-scenarios.mjs` |
| What a whole business loop looks like, and the gate that holds it | `scripts/run-flagship-crm-scenarios.mjs` (below) |
| Which files a Spec owns, and which are hand-written | `bash scripts/gen-from-spec.sh --check-boundary` |

## 7. The flagship loop, as a worked example

Everything above says how to bring **a module** under governance. This section points at what the
pieces look like when they are assembled into **one business loop a person can actually run**, which is
the thing a new developer should copy from rather than the pieces separately.

The loop is `CrmFollowUpTools` plus the gate that holds it:

- **A read that supplies a judgement rather than making one.** `crm_follow_up_queue` (R1) returns at
  most ten of the caller's own customers, each with a reason computed from the module's own fields —
  when it was last contacted, when it is next due, whether it is marked for follow-up, whether it
  closed. Contact details and contact **content** are not projected. That is what "limited and
  explainable" means here: a cap, and a `why` per row.
- **A write that goes through the module's own object.** `record_crm_followup` (R3) calls
  `CrmFollowUpRecordService`, is held for a human, and settles ownership by reading the customer first
  — a read the module's own advice already scopes, so "not found" and "not yours" get the same answer.
- **A withdrawal that reaches the module.** The result type is registered with a compensator in
  `YudaoLocalCompensators`; without one the runtime refuses the revocation and says which piece is
  missing.
- **A gate that says what it does not assert.** `scripts/run-flagship-crm-scenarios.mjs` walks the eight
  steps and is explicit that the queue's *contents* are not on the wire — so its green line means "the
  loop ran under this caller", never "the ranking was right".

Two fixture lessons are written into that gate and worth reading before writing another: a customer
seeded by raw SQL needs its `crm_permission` owner row, or the module's own delete refuses a
withdrawal it should have allowed; and an audit row carries the conversation id the **runtime issued**,
not the one the caller sent.
