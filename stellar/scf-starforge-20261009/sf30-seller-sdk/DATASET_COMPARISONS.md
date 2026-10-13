# Compare complete saved query results

This feature belongs to the original SF30 query-study workspace. It compares two
COMPLETE retained query results and saves a full, reopenable review. Every
original typed row, both original result manifests, the exact mapping and the
original request remain available with the comparison.

The comparison reads retained result files. It does not rerun either query.
The existing workbook-edition review remains the workflow for comparing original
XLSX selections and adopting a replacement publication mapping.

## Browser workflow

Open the existing dataset workspace or borrow its browser through the installed
dataset-studies agent. The **Compare saved query results** section uses that same
private source owner and study directory.

1. Complete each result through **Export all matching rows**. An earlier and a
   later result can belong to different saved studies, queries or snapshots.
2. Refresh saved results, choose the earlier and later COMPLETE results, and
   choose **Read selected results**. Open each original selection to inspect its
   query, source, snapshot, full row count, selected fields and manifest identity.
3. Name the comparison. Review every earlier-to-later field mapping. Matching
   names are suggested; choose a different later field to map a renamed column.
   Leave fields absent when they were added or removed. Each original selected
   field must appear exactly once.
4. Choose one or more paired fields as row keys. Every key pair must have the
   same original scalar type. Compound keys may contain up to sixteen fields.
   A leading-zero string identifier remains a string.
5. Choose **Save complete comparison**. The native workspace first saves the
   exact request and then processes both complete inputs. The screen shows
   RUNNING while the retained operation finishes.
6. Inspect the complete totals, each change-kind view and the original records.
   Changed and unchanged groups contain uniquely matched keys. Null or duplicate
   keys appear as unresolved groups with every original record retained.
7. Download the full report and original data files. **Saved comparisons**
   reopens the same immutable result after the browser or workspace restarts.

Changing fields or source selections creates a different request. Retrying a
retained request preserves its original UUID, name, mapping and source hashes.
The active editable draft remains separate from the displayed saved report.

### Working files and browser recovery

The browser captures the unfinished comparison name, selected results, complete
field choices, original inspected source metadata, prior draft editions and
pending requests. **Download comparison working file** saves that complete
editable state as JSON. **Open working file** previews the incoming file before
opening it, preserves the displaced draft and joins the original request history.
Restoring an earlier draft also retains the displaced draft.

Working files are bound to the original persistent study-workspace UUID.
They do not contain a browser bearer token or grant access to a different
workspace. Browser recovery reopens this same workspace's complete working
state. If local browser storage is unavailable, the visible working draft and
download control remain available. Accepted comparison requests are retained
by the native workspace and appear in **Saved comparisons**, including after
an interrupted response.

The complete working-file allowance is 8 MiB, with space reserved for unfinished
current controls. History-changing operations check capacity before replacing
current work. Keep the complete downloaded file when starting a separate draft.

## What the comparison means

| Kind | Meaning |
| --- | --- |
| Added | This complete key exists only in the later result. |
| Removed | This complete key exists only in the earlier result. |
| Changed | Exactly one row exists on each side and at least one mapped typed field differs. |
| Unchanged | Exactly one row exists on each side and all mapped typed fields are equivalent. |
| Unresolved | A key contains null, repeats on either side, or both. Every original row remains in the group; the comparison does not choose an arbitrary pair. |

The totals distinguish **key groups** from **original rows**. A group containing
two earlier rows and two later rows is one unresolved group with four retained
original rows. It is not treated as four matched changes.

A separate moved flag records a uniquely matched row at a different position
in the complete query result. It can coexist with changed values. Position
depends on the original query's sorting and selection; it is not a source-record
identity. The moved view therefore overlaps the changed and unchanged counts.

Every cell comparison retains whether the field existed, its original type and
its original value. An absent mapped field differs from a present null.
Integer and number columns remain distinct types. Strings are not trimmed or
coerced, booleans remain booleans, and numeric equality follows the original
finite JavaScript scalar values. No rounding tolerance or text normalization
is applied. Nullability and the complete selected schemas remain in the plan.

Field-difference totals include added and removed cells as well as changes in
uniquely matched rows. Unresolved groups remain separate because their members
have no unique pairing.

When queries, snapshots or source descriptions differ, the report records all
of those definitions. A changed result can reflect a different filter or sort
as well as changes in source values. The complete result comparison alone does
not attribute a cause.

### Large original groups

A key can repeat across a large part of a result. The native response keeps the
comparison metadata, totals and complete file downloads available even when
one full group exceeds the screen response allowance. The browser then offers
paged inspection of each side's original records.

If one individual original row exceeds that allowance, the page identifies the
oversized row and the complete baseline.jsonl or target.jsonl remains available.
The full group and its unshortened key are also present in rows.jsonl and the
complete review. Screen key shortening does not alter retained values.

## Complete saved files

| File | Contents |
| --- | --- |
| request.json | Exact caller request, persistent workspace, both original selections, mapping, creation time and comparison engine identities. |
| comparison.json | Full saved comparison identity, source selections, typed plan, totals, field differences and retained row index. |
| rows.jsonl | Every complete key group, original rows on both sides, changes, reasons and movement flags. |
| changes.csv | Every retained original row with side, ordinal, complete key, original values and associated group changes. |
| review.html | A standalone readable report with every key group and original value. |
| baseline-manifest.json | The exact original earlier result manifest. |
| target-manifest.json | The exact original later result manifest. |
| baseline.jsonl | The complete, byte-identical earlier typed result. |
| target.jsonl | The complete, byte-identical later typed result. |

JSONL retains exact scalar types and nulls. The CSV includes structured values as
quoted JSON text and records each original side. Open review.html independently
to read the whole report. The original result manifests retain their original
file references; the comparison package includes the two complete typed inputs,
while the original result exports remain available in the study workspace.

The existing agent download protocol adds its verified receiving manifest around
these nine files. Comparison downloads use exportId **comparison.UUID** and
the same retained-file reader, complete SHA-256 verification and durable byte
continuation as study and result downloads. Receiving a comparison does not
replace an unrelated file in the receiving directory.

## Native CLI

Use the complete installed source and the same private studies directory. These
commands inspect retained original results and do not require a new source query.

~~~sh
node dataset-study-cli.mjs comparisons --studies /private/query-studies

node dataset-study-cli.mjs comparison-inspect \
  --studies /private/query-studies \
  --baseline EARLIER_COMPLETE_RESULT_ID \
  --target LATER_COMPLETE_RESULT_ID \
  --output /private/comparison-selections.json

node dataset-study-cli.mjs comparison-create \
  --studies /private/query-studies \
  --input /private/exact-comparison-request.json

node dataset-study-cli.mjs comparison-read \
  --studies /private/query-studies \
  --id ORIGINAL_COMPARISON_UUID --kind changed --offset 0 --limit 25

node dataset-study-cli.mjs comparison-members \
  --studies /private/query-studies \
  --id ORIGINAL_COMPARISON_UUID --ordinal 0 --side baseline \
  --offset 0 --limit 25

node dataset-study-cli.mjs comparison-resume \
  --studies /private/query-studies --id ORIGINAL_COMPARISON_UUID

node dataset-study-cli.mjs comparison-download \
  --studies /private/query-studies --id ORIGINAL_COMPARISON_UUID \
  --name review.html --output /private/received-comparison.html
~~~

Run these from the native sf30-seller-sdk directory, or pass the full installed
path to dataset-study-cli.mjs. Output files are create-only. Preserve the complete
request JSON when retrying a command. The create command waits for that same
retained job; an interrupted process can reopen its original UUID.

A create request has this exact shape. Replace all uppercase placeholders with
the actual IDs and manifest digests returned by comparison-inspect. Include
every selected field and choose the actual identifying fields.

~~~json
{
  "id": "NEW_COMPARISON_UUID",
  "title": "Earlier and later sales selection",
  "baselineId": "EARLIER_COMPLETE_RESULT_ID",
  "targetId": "LATER_COMPLETE_RESULT_ID",
  "baselineSha256": "EARLIER_ORIGINAL_MANIFEST_SHA256",
  "targetSha256": "LATER_ORIGINAL_MANIFEST_SHA256",
  "fields": [
    {"baseline": "record_id", "target": "record_id", "key": true},
    {"baseline": "amount", "target": "amount", "key": false}
  ]
}
~~~

The mapping above is illustrative. The original complete field schemas determine
the real mapping; omitted selected fields are rejected.

## Original browser API and owner

The following routes use the original authenticated loopback workspace:

| Route | Operation |
| --- | --- |
| GET /api/studies/comparisons | List complete and pending comparisons with the persistent workspace UUID. |
| POST /api/studies/comparisons/inspect | Read both COMPLETE result selections and suggest a complete field mapping. |
| POST /api/studies/comparisons/create | Retain an exact new request or recover the same UUID and body. |
| POST /api/studies/comparisons/read | Read saved metadata and a page from all, added, removed, changed, unchanged, ambiguous or moved. |
| POST /api/studies/comparisons/members | Page through one original side of a large key group. |
| POST /api/studies/comparisons/resume | Resume the same retained UUID. |
| GET /api/studies/comparisons/UUID/files/NAME | Download one complete original comparison file. |

The existing native owner exposes comparisonInspect, comparisonList,
comparisonCreate, comparisonRead, comparisonMembers, comparisonResume,
openComparisonFile and waitComparison on its studies interface. The subordinate
store receives the original export-status and verified read-only-file operations.
The original owner controls shutdown and waits for active work. It does not
start a second dataset source or browser controller.

READY means the exact request exists and can resume. RUNNING means the same
owner is processing it. PAUSED retains the original request and the reported
condition; resume that UUID after resolving the condition. COMPLETE is published
only after all nine output files and final identities are retained. A pending
request records its original engine version, so resume it with that complete
installed source. Completed comparisons remain readable after later updates.

A repeated UUID with a different request body returns a conflict. Exact retry
checks the retained request before admitting another selection. Source manifests
and complete typed inputs are verified against the captured bytes and digests.

## Capacity and complete-result behavior

The two complete typed inputs may total up to 128 MiB. Each saved output may be
up to 256 MiB; the complete receiving package may total up to 1 GiB. Metadata
and the saved sparse page index may be up to 8 MiB. These are complete operation
limits: a capacity condition leaves the original results and request available,
and no partial comparison is presented as COMPLETE.

A normal page contains up to 100 groups or members and a 1 MiB data allowance.
The browser uses 25 groups or 10 original members per page. Native sparse indexes
retain logical view offsets. Full immutable row-file verification is reused
while its original file identity remains unchanged.

## Original receiving and rendered product course

Continue the existing SF30943/984 operation with its actual private study owner,
original result IDs and the complete selected source. Retain the existing
dataset source and browser lifetime.

Create two complete original query results with meaningful typed changes.
Operate the comparison at desktop width and 390 pixels: read source selections,
map renamed and added/removed fields, use a compound key, inspect changed and
unchanged records, inspect duplicate and null-key groups, and page a large
group's original rows. Review counts as groups versus original rows.

Edit a draft while an earlier request is loading, save and independently reopen
the full working JSON, restore an earlier draft, and recover the same native
request after an interrupted response and workspace reopen. Open every completed
file, every row in the report, and both original typed inputs. Inspect the
downloaded standalone HTML and the original browser in populated, empty,
loading and error states. Continue complete agent/client receiving through the
same original operation, including a retained partial-file byte prefix.

The producing operator must look at the actual rendered output, operate the
controls and patch any visible problem in this source. Return actual operated
views and reopened outputs through the original receiving thread alongside its
existing native results.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

