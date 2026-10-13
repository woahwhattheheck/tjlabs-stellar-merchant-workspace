# Complete Event mapping working copies

Continue the original customer Event programme's accepted-to-current mapping
review in a complete offline file. The working copy includes both full original
NDJSON exports and both original manifests, the accepted mapping, the exact
initial native comparison and source receiver identities, the current comparison,
every earlier comparison with its unfinished draft, and all current fields,
reviewer text, notes and decision reasons.

This is the same installed Event parser and comparison used by the private
Analysis application. Original event identities, source/page history, the
previous complete window, current cumulative window and new-event population
retain their original meaning.

## Open the actual customer source

In **Event programmes**, open the customer's original accepted programme and the
complete later received source pair. Select the intended payload fields and use
**Compare accepted and proposed mappings**. The original native comparison must
succeed against the exact accepted source and current original files.

Choose **Download editable offline mapping** to request the full independent
HTML, or **Download whole working source** for its complete JSON. Unfinished
field changes and reviewer/reason text are included even when they differ from
the last comparison. A native comparison remains selected until the operator
explicitly compares those edited fields.

The application rereads the actual accepted and received file bytes before
exporting, verifies all four sizes and hashes, and checks that the native
accepted programme revision and both installed receiver sources stayed selected.
A changed baseline or source requires another deliberate comparison. The
source package contains no private launch capability or API token.

Confirm the browser saved the requested file. Open the HTML from the saved
destination independently. The file contains the complete parser, working-copy
model and controls; it needs no network connection, server, CDN or local
installation.

## Work with complete original values and deliberate field choices

The field editor keeps ordinary name and JSON Pointer inputs, including
unfinished values. Add, remove or reorder fields deliberately. The original
mapping limits remain 100 fields, 48-character names, 2,000-character pointers,
and distinct field/state column names outside the original metadata columns.

Inspect the previous, current or new-event population. The catalogue examines
all events in that population; its pages and filters only change the displayed
selection. Open a payload path to read full values with original event identity,
sequence, type, state and digest. Missing and null remain separate. An array's
actual numeric index is a path; JavaScript properties such as array length are
not payload fields. Object/array examples are summaries, while complete selected
values and their downloads retain the original value.

**Compare** recomputes the original complete cross-edition comparison from both
retained raw source pairs. It preserves the previous complete comparison and its
unfinished draft in history when the comparison changes, then clears decision
reasons for the new comparison. Earlier reasons remain available with the actual
old mapping and source context. The current reviewer and overall note remain
editable.

The comparison shows previous/current/new-event counts and all original mapped
outputs. Changed or removed pointers, paths unobserved in the current source,
absence in newly added events, new missing values and newly observed JSON kinds
require the same explicit reasons as the original native operator. These are
observations of retained records, not a declared provider schema.

Record the reviewer and reason for the actual successor. Readiness uses the
native 240-byte reviewer, 8,000-byte overall note and 4,000-byte per-output reason
allowances in UTF-8. The reviewer is operator-entered attribution under the
original private capability, not a separately authenticated identity.

## Save, reopen and return

Keep the whole editable HTML or complete working JSON. Each contains both
original pairs, full comparison history and unfinished work. Browser storage is
a convenience: it may be unavailable or too small for a real source pair.
Restore a saved browser copy only through the explicit source-bound restoration
control; the embedded delivery is retained until the operator chooses another
complete working edition. A download request does not prove that a browser
actually saved a file, so the changed-work reminder remains active.

Open a saved working JSON into the complete offline interface only for its
original source context. Inspect a different working edition before explicitly
replacing the open edition. Each explicitly displaced complete working copy stays in the open window's
Files section with its own numbered download, including after repeated restores.
Save those separate editions before closing: they are not inserted into the
selected working copy's comparison history or its saved HTML/JSON. Source file
names are labels, never a matching algorithm.

Export the **native mapping review** JSON when returning work to the original
operator. This uses the existing
`stellar-forge.event-mapping-working-review.v1` format with its full current
comparison and current draft. It intentionally supports unfinished work.
The complete working HTML/JSON remains the companion for original raw files and
earlier offline comparison drafts.

In the original **Event programmes** screen, select the same programme and source
pair, choose that native review JSON, then **Inspect and reopen review**. The
service recomputes the selected comparison against its retained original files
and matches the accepted revision, operation and receiver identities. A
different current native baseline is not silently adopted. Keep the older
working file and compare the new native source context explicitly.

Then continue the existing **Review complete source window** and **Apply reviewed
window** controls with the actual customer decision. The offline editor never
accepts a native source, changes a report/workbook, creates a subscriber request
or pays for an event page. The complete original Analysis archive continues to
retain its own source pairs, accepted operations, reports and workbooks.

## Installed file workflow

Use the original installed Node 24 or newer and selected full source. The full distribution's `analysis-events` contribution registers
`starforge event-mapping-working`. The compact Analysis project includes the
complete files without that command registration; run its direct source entry
with `node /ABSOLUTE/INSTALL/source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/event-feed/mapping-working-cli.mjs`
and the same arguments below.

Every output is a complete create-only publication. A retry to an existing
destination reuses it only when its full bytes agree; a different output requires
a different path. Original input paths are never overwritten. Source extraction
uses fixed distinct previous/current filenames and retains the original labels
in its complete index.

Create a working copy from the complete native source package and optionally
supply a full unfinished draft:

~~~sh
starforge event-mapping-working create \
  --source /private/customer/mapping-source-pair.json \
  --draft /private/customer/unfinished-mapping-draft.json \
  --out /private/customer/mapping-working-01.json
~~~

The native browser normally gives a working copy directly. Inspect it, make a
deliberate full draft update, then compute the new comparison:

~~~sh
starforge event-mapping-working inspect \
  --in /private/customer/mapping-working-01.json

starforge event-mapping-working update \
  --in /private/customer/mapping-working-01.json \
  --draft /private/customer/unfinished-mapping-draft.json \
  --out /private/customer/mapping-working-02.json

starforge event-mapping-working compare \
  --in /private/customer/mapping-working-02.json \
  --out /private/customer/mapping-working-03.json
~~~

A full draft has `fields`, `reviewer`, `note` and `decisions`; decisions are
an object mapping the exact output name to its complete reason. Update and save
the required reasons after a changed comparison. The previous comparison and
its unfinished reasons remain in the whole working history.

Create the complete independent editor, export the existing native review, or
recover all four original source files:

~~~sh
starforge event-mapping-working html \
  --in /private/customer/mapping-working-03.json \
  --out /private/customer/mapping-working-03.html

starforge event-mapping-working native \
  --in /private/customer/mapping-working-03.json \
  --out /private/customer/native-mapping-review-03.json

starforge event-mapping-working sources \
  --in /private/customer/mapping-working-03.json \
  --out-dir /private/customer/original-mapping-windows
~~~

The original parser source must match the core SHA in the native comparison.
An older saved HTML retains that entire original parser for offline use after a
software update. The current native application deliberately requires its own
current receiver basis before review; the offline file does not weaken that
check.

## Capacity and source semantics

| Complete artifact | Allowance |
| --- | --- |
| Each original NDJSON | 32 MiB, unchanged original parser limit |
| Each original manifest | 4 MiB, unchanged original parser limit |
| Current complete comparison | 24 MiB, unchanged original comparison limit |
| Complete working JSON | 192 MiB, including all raw sources/history |
| Prior complete comparison drafts | 128, plus the current comparison |
| Native review companion | 32 MiB, unchanged original browser receiving limit |
| A CLI draft input | 4 MiB, while each field still obeys the original shape |

Complete JSON escaping can increase size beyond the raw file sizes. A capacity
error preserves the currently open work and original files; there is no partial
catalogue, truncated source or silently pruned history. Save the whole fitting
working file before continuing another native context. An empty new-event
population stays empty; it is not substituted by the cumulative population.

The parser uses the original JavaScript JSON semantics and original
`JSON.stringify(payload)` digest rule. Exact decimal strings remain strings.
This does not change the source parser into a lexical-number parser or infer
domain-specific Stellar amounts or XDR values.

## Private native interface and installed sources

POST `/api/event-programmes/named/PROGRAMME/mapping-source` is protected by the
original Analysis capability. Its complete body is:

~~~json
{
  "input_id": "ACTUAL_32_HEX_INPUT_ID",
  "mapping": {"fields": []},
  "expected": {
    "comparison_sha256": "ACTUAL_64_HEX_COMPARISON_SHA",
    "programme_revision": 3,
    "baseline_operation_id": "ACTUAL_32_HEX_ACCEPTED_OPERATION",
    "receiver": {
      "cli_sha256": "ACTUAL_64_HEX_RECEIVER_SHA",
      "core_sha256": "ACTUAL_64_HEX_PARSER_SHA"
    }
  }
}
~~~

Use actual values from the full original comparison; the example placeholders
are not executable customer IDs. The response is
`stellar-forge.event-mapping-source-pair.v1` with the full `comparison` and
`files.previous/current.ndjson/manifest` objects. Each file has
`name`, `bytes`, `sha256` and the complete UTF-8 `text`.

The route joins the existing single EventProgrammes executor and its close/drain
lifetime. It adds no database writer or private service. The compact Analysis
recipe explicitly includes the installed parser/CLI and full working-copy
sources; the full SF88 selection already includes the component.

## Continue the original actual customer receiving course

Join this complete source to the existing Mercury/22B7 Analysis receiving
operation and its real accepted/current acquired windows. Preserve the original
customer IDs, action journal, writer, browser context and completed results.
No authored source example substitutes for the actual acquired customer input.

Operate the actual native download controls. Open the resulting HTML offline,
inspect both original populations and full values, edit a useful mapping, compare,
record the reasons, save whole HTML/JSON, close and reopen them independently.
Open an earlier complete comparison draft and verify the original values are
still available. Exercise source mismatch, an unfinished mapping and unavailable
browser storage without replacing the original saved customer work. Extract and
open all four originals. Return the native review through the original service,
then continue explicit native Review/Apply and the existing complete report,
workbook, sixteen-file delivery, archive receive and fresh-delivery course.

The producing worker must OPEN, USE and LOOK at the exact outgoing application,
desktop/screenshare and 390px views, complete original/downloaded files, all
attachments and independently reopened output. View actual screenshots and fix
clipping, unreadable tables, stale controls or lost work in this source. Source
execution or peer review does not establish native or rendered acceptance.

The noon local in-app-browser reservation was explicitly released by the owner
handoff at coordination1791908979.290839, quoting Bryce's instruction that the
meeting was over. Preserve current tabs, saved work and every later owner rule.
TJLabs attribution stays with the product. Every subsequent warm-company
message or attachment requires Bryce's individual approval; this receiving work
has no external send.


## Review with a colleague

The complete editable HTML now includes an issued-review panel beside the original source, field and reason controls. Use the [complete colleague review guide](EVENT_MAPPING_COLLEAGUE.md) to issue the exact baseline, keep the original engineer's working copy, open the colleague's independent assignment, receive its full return and resolve concurrent changes explicitly.

The ordinary field editor continues to operate on the original working model. A colleague working file adds a flat graph of complete comparison/draft/history copies, immutable assignment and return envelopes, receiving decisions and unfinished forms. The original source pair is retained once. Issuer and reviewer caches are distinct even for the same assignment; restoring a checkpoint remains an explicit source-bound choice. Every displaced complete file remains separately downloadable in the open session. Save those displaced copies before closing; they are not silently inserted into the current file.

For a returned review, the complete mapping, its selected comparison and every reason move together. The UI presents baseline/current/returned values and requires explicit choices for overlaps. Newer original edits and unfinished receiving text remain retained. Carried reviewer assignments and receipts remain downloadable source history; only assignments issued and returns adopted by this working copy authorize local receiving or replay. Reopening recomputes recorded receiving outcomes against the original before/returned copies.

Download the complete working JSON or editable HTML to retain that whole source graph. Use the original native compact review control for the selected mapping; the source-bound [native receiving CLI](EVENT_MAPPING_RECEIVING.md) can instead retain the entire colleague working file alongside the exact saved native action. Both routes keep the existing native recomputation and deliberate Review/Apply sequence.

The producer must operate and inspect this exact outgoing HTML at ordinary and narrow widths, including the reviewer assignment, concurrent changes, full return, explicit conflict decisions, complete download and independent reopened result. A requested browser download keeps the changed-work reminder active until the operator has secured its complete file.
