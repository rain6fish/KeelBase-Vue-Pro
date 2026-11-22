# Audit search by business object — design and first slice

> Chinese: [KEELBASE-AUDIT-SEARCH.zh-CN.md](KEELBASE-AUDIT-SEARCH.zh-CN.md)

This is the design behind the 2026-11-07 week plan's task **U1**: an auditor searches the AI audit
trail by **business object and time range**, and exports the six answers as a CSV that carries no
internal name. It records what the first slice does, what it deliberately does not do, and the one
change to the runtime read face that would remove its main bound.

## 1. What an auditor asks, and what the faces answer today

The question is: *"everything that happened to customer #9005, last week"*. The faces the console
already reads answer these pieces of it:

| Face | Takes | Answers |
|---|---|---|
| `GET /audit/logs` | `userId`, `since`, `until`, `objectType` + `objectId`, `isError`, `limit`, `offset` | audit rows, newest first: who, when, action, tool, outcome, authorization |
| `GET /ai/tool-effects` | `userId`, `conversationId`, `page`, `limit` | the write ledger: tool, `resultType`, `resultId`, `executionId`, snapshots |
| `GET /ai/confirmations` | `page`, `limit` | held / refused proposals: tool plus the arguments it would have run with |
| `GET /admin-api/keelbase/record-names` | `refs=type:key,…` | the record's name, **masked server-side**, for references a ledger already named |

Two of the three things the question needs were once **not** on the audit face: an object filter and
the **end** of the range. The runtime's `objectRange` change put both on that face — the object is
resolved through the ledger: the effects carrying that pair give their execution ids, and the rows of
exactly those executions are the answer. "Refused, never silently widened" still holds: half an
object filter is a 400, and a deployment with no ledger answers 503, rather than a list that looks
filtered and is not. The console's own narrowing still runs — it is the fallback on an older runtime,
and on a runtime without the sentence road it is the only place that road's key can be read.

## 2. Where the query runs, and why

The first slice runs the search **on the console side**, over the faces above:

- `/audit/logs` from `since`, paged up to its `offset` cap, gives the rows;
- `/ai/tool-effects` (newest pages, up to a bound) and `/ai/confirmations` (newest window) resolve
  each row's object;
- `record-names` supplies the business name, already masked.

No new endpoint, no new wire field, no contract change. The console joins and filters locally and
**says what it scanned**, because a bound it does not state would make "no rows" read as "nothing
happened".

## 3. The object: `(resultType, resultId)`, never the text

An object is compared by its type and its business key. The text shown (`Customer · #9005 · 万****`)
is masked and translated, so it cannot be the key. A row's object comes from the **same three-road
evidence chain the audit page already uses**, in this order:

1. the **ledger row** — a write that happened. When the audit row carries `executionId` (contract v6)
   the match is exact; when it does not, the rule is *same tool, within five seconds, exactly one
   candidate*. A row that carries an `executionId` and finds no such ledger row answers `null`
   rather than falling back to tool and time — that fallback is how two executions get put together.
2. the **confirmation record** — a held or refused call. Same tool, and within five seconds of either
   the proposal's creation or its decision, exactly one candidate.
3. the **key at the end of the row's own sentence** — a call that wrote no ledger row. Two spellings:
   the blocked-call one (`… · intended object #12`, the kind from the tool's own `resultType()`
   declaration) and the **typed** one (`… · object MCP connection #12`, the kind in the sentence),
   written by an action that has no tool at all — a connect test or a probe, which is neither a tool
   call nor a write.

The typed key spells a **readable word**, never a table name: that sentence reaches the third answer
and the export, where an internal name refuses the whole file. The console maps the word back to the
type a search compares by (`OBJECT_KEY_KINDS` in `sixQuestions.mjs`), and a word outside that table is
not read as an object at all. For a kind only the sentence can name, the page sends the **kind word**
as the object filter's type half; the read face resolves the pair through the ledger first and, when
that answers nothing, matches the pair against the sentence's key word for word. A runtime that has
no such road answers empty, and the page scans the range again and picks with the local chain above —
so the same search works on both, and only the number of rows scanned differs. A ledger hit never
reaches either fallback.

None of the three means the runtime did not record where the call landed, and the row is **not**
matched to any object.

### Specifying the object

| Input | Picks |
|---|---|
| kind + key | exactly that record |
| kind alone | every row about that kind |
| key alone | that record whatever its kind (a row whose kind is unknown still counts — not knowing its kind is not evidence it is a different record) |
| neither | every row in the range |

The kind select is built from the record types the console can resolve, filtered to those the message
tree has a **business word** for (`keelbase.record.*`). A new kind becomes searchable by adding a
word, not by editing a second list.

## 4. The range

`since` and `until` are both the audit face's own parameters (`until` since the runtime's
`objectRange`). The page sends both and also applies them **client-side**: a runtime that honours
them answers already narrowed, and an older one that ignores unknown parameters is still decided by
the local layer — the answer agrees either way. Both ends are inclusive. A row whose timestamp
cannot be read is in no range: a row that cannot be placed cannot be claimed to satisfy `since`.

## 5. The CSV

Exactly six columns, in the order an auditor asks:

| # | Column | Value |
|---|---|---|
| 1 | Who | the caller's name and account |
| 2 | When (with the zone) | the row's moment, rendered locally **with its offset** |
| 3 | Which business object | business kind + `#key` + masked name |
| 4 | What it became (before → after) | the recorded before, and what the after does and does not record |
| 5 | Who confirmed | the gate this row **recorded**: no confirmation / self / second person (named when the decision row is paired) / blocked |
| 6 | What came of it | the outcome word and what it means |

The headers are the six questions' own labels; the values are produced by the **same `sixOf` the page
renders**, so the file cannot drift from the screen. A missing answer is exported as its honest text
(`—`, `not recorded — this call wrote no record`, `a second person approved it — this row does not
record who`) and **never as a blank** — a blank cell in an exported table reads as "nothing happened".

**A moment has one shape.** On screen and in the file it is written `YYYY-MM-DD HH:mm:ss UTC+08:00`:
local time with the zone's offset spelled out (whichever zone the machine is in). The audit chain's
cell used to carry an offset while the other pages did not, so one instant could be read as two clock
faces side by side; both now render through the same formatter, and the offset-less shape is gone.

Escaping is RFC 4180: a field with a comma, a quote, CR or LF is quoted and its quotes doubled; line
endings are CRLF. The download carries a UTF-8 BOM so Excel does not turn the Chinese columns into
mojibake.

**No internal name.** Before the file is produced, every header and every cell is run through the
same `leaksIn` the six-answer score uses (snake_case identifiers, camelCase identifiers — two
lowercase→uppercase turns in one token, so single-hump words like iPhone or macOS do not count —
schema field names, UUIDs, a bare outcome code). One hit refuses the **whole** export. The error names
**which question** leaked and does not echo the text — otherwise refusing the export would print the
internal name on the screen.

## 6. The bound, stated

| Window | Cap | Why |
|---|---|---|
| audit rows | 1000 by default (`200 × 5`), configurable 200–1200 | `offset` on `/audit/logs` is capped at 1000 and `limit` at 200, so 1200 is the deepest reach without a repeated page |
| ledger rows | 300 (`100 × 3`) | it is the object index, walked back from the newest page |
| confirmation records | 100 | the newest window, for held / refused calls |

The page reports "matched N rows in what was scanned" and, when a cap was hit, says so. A range older
than the audit scan can reach answers **"not covered"**, not an empty result.

The audit row cap is a build-time setting (`KEELBASE_AUDIT_SCAN_ROWS`); a value outside 200–1200 is
clamped into the band. The cap lives in `keelbase-ui/host-overlay/src/keelbase/scanCap.mjs`, and
`scripts/scan-cap.test.mjs` proves a query cannot exceed it — including a read face that ignores
`limit`.

## 7. The change that removes the bound — landed on the read face

`GET /audit/logs` now takes `until` and an object (`objectType` + `objectId`), so the search is a
query rather than a full-window scan. That is a change to the runtime's **read face**: the
TypeScript reference implementation already had the two filters; the **Java runtime** took them in
its `objectRange` change (`AuditController` / `AuditService`, resolved through the ledger: the
effects carrying that pair give their execution ids, and the rows of exactly those executions are
the answer). A filter the runtime cannot apply is still refused — half an object filter is a 400,
and a deployment with no ledger answers 503 rather than an empty page. No contract field was added:
the endpoint's parameters are not part of the frozen row schema, and the reference's slice added
the same two without touching it.

The page sends all three alongside `since`. An older runtime ignores the unknown query parameters
and the console's own narrowing still decides, so the answer is the same under either and only the
number of rows scanned differs. The console's ledger and confirmation windows are still bounded:
they supply the object **label** and the evidence of blocked or refused rows, not the row selection.

The host deployment carries a **parameter guard** of its own: `yudao-server` refuses any query
parameter the read face does not declare on `/audit/logs` (`tenantId`, `page`, and so on) with a
**400 that names it**. That is the other half of this section's rule — a filter accepted and not
applied answers a list that looks filtered and is not. The guard exists only in the host deployment;
an application produced by the generator has no such layer and still drops such a parameter silently
until the generator declares its filters (§9).

## 8. What the slice is verified by

`scripts/audit-query.test.mjs` pins the three evidence roads (including "an `executionId` with no
match answers nothing, instead of guessing"), the three ways to specify an object, both range ends,
exactly six columns in order, RFC 4180 escaping, the missing-answer marker, and the **reverse proof**:
a cell leaking `crm_customer` or a UUID refuses the export with an error that names the question and
not the name. `scripts/audit-chain-page.test.mjs` still pins the page's rendering path, and
`scripts/i18n-key-coverage.test.mjs` pins the new labels in both language bundles.

## 9. The second read face — the generator's application

An application produced by the runtime's generator has a read face of its own: `JavaGenerator.java:4474`
generates `/audit/logs` with `userId`, `since`, `isError`, `limit` and `offset` — and it *refuses*
`agentId`, `orgId` and `denied` rather than ignoring them. It says nothing about `until`, `objectType`
and `objectId`, and Spring drops query parameters a handler does not declare without an error: the same
query answers a **wider** list on that face, silently (the review's F10).

The console is unaffected in what it shows. It sends all three parameters and then **picks the rows
itself** again (`selectRows` in `auditQuery.mjs`), so a face that applies the filters and one that
ignores them answer the same matched set — `scripts/audit-query.test.mjs` runs both and compares. What
the console cannot do is make a **direct caller** of the generated face get the narrower list. So when
an answer comes back recognisably wider — a returned row outside the range, or one the page can place on
an object other than the one asked for — the page says so, and points the reader at `/audit/logs` for
the read face's own answer. Both exports carry the same matched set; the six-column CSV stays exactly
six columns, so the statement lives on the page rather than in the file.

The parity fix itself belongs to the generator: declare the three parameters and resolve the object
through the generated application's own side-effect ledger, the way the runtime does. That adds no
contract field and changes no row schema — the endpoint's parameters are not part of the frozen row
shape (§7).

## 10. Tenant is not a dimension of this chain

An audit row records who acted, when, what it came to and where it landed. It does not record a
tenant: the frozen row shape (`ai-audit-log-row`, v7) has no such field, and the runtime that writes
the row has no tenant concept at all. The six questions do not ask for one either — they were fixed
before multi-tenancy entered the picture, and a tenant is not among them.

So on this page **no row is attributed to a tenant**, and that is a statement about a missing
dimension, not about a missing value. A connectivity test makes the gap concrete: its sentence ends
with a typed object key (` · object MCP connection #12`), which names the object and says nothing
about the tenant the object belongs to. The read face does not close the gap either — `GET
/audit/logs` takes no tenant filter, so a query that adds one is ignored by a face that does not
declare the parameter or refused by one that does; it never narrows. That is why the page says it
outright beside the rows, and why the verification export repeats it in its note line: a reader must
not take the chain for one tenant's trail. The six-column business CSV stays at six columns (U1's
acceptance reading), so the statement lives on the page and in the verification file's note, not in
a seventh column.

Tenant attribution and tenant filtering are a later change and a separate decision, because they are
not only about this page: the chain is one global chain, `/audit/verify` walks all of it, and today an
audit reader of one tenant can read every tenant's rows. What today's deployment can do without a
runtime change is bounded — attributing a row from the object it names needs a face that answers a
tenant, and no existing face is sound for a reader: the faces that reach `ai1_mcp`
(`/ai1/mcp/get`, `/ai1/mcp/simple-list`) answer "visible to me", and an object deleted since the test
reads exactly like another tenant's, while the faces that name records do not cover this kind of
object at all and answer nothing for it. Narrowing this chain by tenant therefore waits for the
runtime-side decision; `handoff/tenantvis-1121.md` records the two roads and the readings that ruled
the shortcut out.
