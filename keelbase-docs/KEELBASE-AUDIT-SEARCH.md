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
| `GET /audit/logs` | `userId`, `since`, `isError`, `limit`, `offset` | audit rows, newest first: who, when, action, tool, outcome, authorization |
| `GET /ai/tool-effects` | `userId`, `conversationId`, `page`, `limit` | the write ledger: tool, `resultType`, `resultId`, `executionId`, snapshots |
| `GET /ai/confirmations` | `page`, `limit` | held / refused proposals: tool plus the arguments it would have run with |
| `GET /admin-api/keelbase/record-names` | `refs=type:key,…` | the record's name, **masked server-side**, for references a ledger already named |

Two of the three things the question needs are **not** on the audit face: an object filter and the
**end** of the range. The runtime refuses filters it does not apply — a filter that is accepted and
not applied returns a list that looks filtered and is not — and that refusal is right.

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
3. the **key at the end of the row's own sentence** (`… · intended object #12`) — a gate-blocked call.
   The kind comes from the tool's own `resultType()` declaration, never from the sentence.

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

`since` is the audit face's own parameter. `until` is applied **client-side**, because the face has
no end; the page says so. Both ends are inclusive. A row whose timestamp cannot be read is in no
range: a row that cannot be placed cannot be claimed to satisfy `since`.

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

Escaping is RFC 4180: a field with a comma, a quote, CR or LF is quoted and its quotes doubled; line
endings are CRLF. The download carries a UTF-8 BOM so Excel does not turn the Chinese columns into
mojibake.

**No internal name.** Before the file is produced, every header and every cell is run through the
same `leaksIn` the six-answer score uses (snake_case identifiers, schema field names, UUIDs, a bare
outcome code). One hit refuses the **whole** export. The error names **which question** leaked and
does not echo the text — otherwise refusing the export would print the internal name on the screen.

## 6. The bound, stated

| Window | Cap | Why |
|---|---|---|
| audit rows | 1000 (`200 × 5`) | `offset` on `/audit/logs` is capped at 1000; that is as deep as the face goes |
| ledger rows | 300 (`100 × 3`) | it is the object index, walked back from the newest page |
| confirmation records | 100 | the newest window, for held / refused calls |

The page reports "matched N rows in what was scanned" and, when a cap was hit, says so. A range older
than the audit scan can reach answers **"not covered"**, not an empty result.

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

## 8. What the slice is verified by

`scripts/audit-query.test.mjs` pins the three evidence roads (including "an `executionId` with no
match answers nothing, instead of guessing"), the three ways to specify an object, both range ends,
exactly six columns in order, RFC 4180 escaping, the missing-answer marker, and the **reverse proof**:
a cell leaking `crm_customer` or a UUID refuses the export with an error that names the question and
not the name. `scripts/audit-chain-page.test.mjs` still pins the page's rendering path, and
`scripts/i18n-key-coverage.test.mjs` pins the new labels in both language bundles.
