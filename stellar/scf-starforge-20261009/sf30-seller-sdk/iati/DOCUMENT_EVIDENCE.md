# Document evidence for IATI organisation publications

Use **Document evidence** in the existing IATI console to turn a publisher's document register into a complete, reviewed handover. The workspace retains the original organisation selection, the literal published links, dated HTTP observations, the selected response bytes, named document decisions and any resulting URL corrections.

The same saved work is available through the browser, native command, connected command, typed JavaScript client and Merchant Source Workspaces. A complete portable ZIP carries the original organisation source and evidence history to the receiving operator.

This guide follows the customer workflow. [The native reference](document_evidence/GUIDE.md) describes the model, acquisition and portable format. [The complete receiving programme](document_evidence/RECEIVING.md) operates the source, console, commands and independent recipient together.

## Start with the customer's actual publishing work

Open a saved organisation plan in the same IATI workspace. Its complete source XML, selected organisations, assessment and any candidate edits provide the document register. [Organisation planning](organisation/GUIDE.md) covers that preceding work.

Name the evidence plan for the publishing task and edition being reviewed. Useful purposes include checking that an annual budget links to the intended document, reviewing the current organisational strategy, preparing a corrected publication, and transferring the reviewed register to the publisher's receiving engineer.

The work retains three distinct selections:

| Selection | What it fixes |
| --- | --- |
| Organisation plan, revision and source/candidate view | The exact document register and XML URL targets being assessed. |
| Evidence plan and revision | The selected document rows, acquisition settings, observations and named review available at that point. |
| Comparison's before and after revisions | The two complete saved evidence editions that the operator intends to compare. |

Use returned full identifiers and revision numbers when moving between interfaces. The browser exposes the saved source and revision details; the command and client return the complete records.

## Complete browser workflow

Open **Document evidence** from the console's workspace navigation. The six tabs form the complete working sequence.

| Tab | Operator work | Retained result |
| --- | --- | --- |
| **1. Selection** | Choose the organisation plan, saved revision and original source or candidate. Read the document register, select the required rows and name the work. | An evidence plan with the exact source snapshot, selected rows, literal URLs and acquisition settings. |
| **2. Acquisition** | Select unobserved or explicitly selected rows, name the capture operator and capture the selected unique URLs. | A dated observation for each selected URL group, with the original request, response details and available body bytes. |
| **3. Review** | Inspect the documents and record one decision for every selected row. Save the complete named review. | A new reviewed revision bound to the selected evidence and decisions. |
| **4. Comparison** | Read the two saved editions, choose automatic same-source matching or explicit unique pairs, and save the full comparison. | Original row pairs, complete changes, added/removed documents and content-comparison results. |
| **5. Publisher handoff** | Read the guarded URL-correction draft and download the report, complete CSV register and plan. Continue any correction through Organisation planning. | A complete customer report and the exact cumulative organisation correction request when applicable. |
| **6. Receive** | Export the selected evidence ZIP or receive an existing one. Add the receiving engineer's local note. | A fully editable receiving case, with the imported revision and any later receiving revision retained. |

### Select the full working register

In **Selection**, choose **Read original documents**. The register preserves titles, language/category context, the published format, each literal URL and the organisation association. Open a document's detail to inspect its original XML and supported URL target.

**Select this page** selects only the displayed page. **Read and select all documents** reads the remaining pages under one snapshot and selects the complete register, within the plan's 500-document capacity. Pagination changes the display; report and package exports contain the entire saved selection.

Choose **Original source** to review the published XML. Choose **Current candidate of the selected revision** to review the URLs after that saved organisation revision's cumulative edits. This choice is fixed when the evidence plan is saved. A following source edition or different source/candidate choice belongs in an explicitly selected evidence plan.

Set a named operator, purpose and acquisition settings, then choose **Save document selection**. Saving prepares the work. Acquisition starts from the second tab.

### Capture the selected URLs

The acquisition queue groups selected rows by their exact literal URL. One fetch supplies an observation to all selected rows in that group; each row keeps its own publishing context and review decision.

Select **Select unobserved rows** for the first pass, or explicitly choose the rows you need. Choose **Capture selected unique URLs**. The queue waits for the original result before advancing. **Stop after current URL** preserves the remaining groups, and **Continue retained queue** resumes that same selection.

A later visit to an already observed row creates another dated observation. Select the displayed acknowledgement and retain the earlier observations alongside it. A comparison uses saved observations from the selected revisions.

The fetcher records the requested URL, response and redirect history, observed network information, status, timing, errors and body descriptor. Literal whitespace or an unsuitable URL remains visible in the dated observation. Review the published value and prepare its correction through the organisation workflow.

## Read responses and make complete decisions

Open a row in the evidence register to inspect all its observations and the original XML. The response's HTTP status, media description, content encoding, retained byte count and body hash help explain what was acquired.

| Evidence field | Operator meaning |
| --- | --- |
| `body.complete` | The HTTP message body finished. A complete error response still has its error status. |
| `documentComplete` | The native observation is a complete successful document response eligible for a usable decision. |
| `body.bytes` and `body.sha256` | The exact retained message-body bytes, after transfer framing and before Content-Encoding decompression. |
| `state` and `outcome` | The actual result of this dated acquisition, including failures, refusals, truncation or interruption. |
| Selected review observation | The particular retained observation used for this row's named decision. |

HTTP ranges, responses such as 204/205/206, failed transfers and retained prefixes require their own interpretation. Downloading a body preserves the recorded representation, including an explicitly retained prefix. Read the descriptor together with the bytes.

Record exactly one decision for every selected row:

| Decision | Required selection and useful note |
| --- | --- |
| `usable` | Select a retained observation with `documentComplete: true`, then judge its relevance to the published document entry. A specific review note can explain the edition, period or purpose checked. |
| `needs_correction` | Select the actual observation and explain the problem. Include a reviewed replacement URL when a URL correction is appropriate. |
| `not_applicable` | Explain why this document does not apply to the selected publishing purpose. An observation may be selected or left null. |
| `deferred` | Explain the unresolved work or missing context. An observation may be selected or left null. |

The review records the named reviewer, overall note and complete row decisions. Non-usable decisions require a row note. A new observation creates a following evidence revision and requires a review of that changed evidence. Open the earlier reviewed revision to inspect its original decisions.

## Recover an interrupted action and continue the case

Every save, note, observation, review and comparison has an original `requestId` and complete input. Keep that input while recovering a lost reply. The browser's **Original retained action** panel provides **Read original result**, **Continue same action** and a complete action download.

| Returned state | Continue the existing work |
| --- | --- |
| `ACQUIRING` | Retain the full original input and request ID. Read that original request again to obtain its result. The browser keeps the pending action and queue position while acquisition is active. |
| `RECORDED` | Adopt the complete returned original result and reopen its saved revision. |
| `NOT_RECORDED` | Preserve the original definition. Continue that same action when the result is conclusively absent; a rejected definition can be restored for explicit correction. |
| Terminal `INTERRUPTED` observation | Inspect the retained original request and any recovered body prefix. Prepare a new dated observation explicitly if another acquisition is needed. |
| Incomplete or mismatched response | The browser retains the full response with the pending action. Reconcile the original request before continuing the queue. |

The browser writes a complete validated outcome before retiring the pending action. If browser storage is unavailable, the retained-action panel offers the full action/result download. Keep the original request and use the existing workspace to recover it.

A repeated import follows the complete packet's identity instead of an action request ID. Retain the selected ZIP and its hash. The native receiver can receive those same bytes again while preserving later recipient work.

## Compare evidence editions

Choose explicit before and after evidence revisions. Read both editions and their rows before choosing the matching mode.

Automatic pairing uses stable identities from the same original source. When comparing different source editions, select explicit one-to-one document pairs. The result records the selected mode and its reason.

For client and command inputs, omission of `rowPairs` requests automatic pairing. An explicit `rowPairs: []` preserves every row as added or removed. This lets the operator represent an intentional absence of matched rows.

For each paired row, the comparison records the complete before/after values and a `changes` array of `{field, before, after}` records. Content comparisons use the latest observations within each selected evidence revision:

- **same**: both observations provide complete documents with compatible content encoding and the same retained body hash.
- **changed**: both provide comparable complete documents with different body hashes.
- **indeterminate**: the available evidence does not support that complete-body comparison.
- **added / removed**: a row is present on only one side of the chosen pairing.

The summary preserves the pair, addition, removal, same-body, changed-body and indeterminate counts. Download the complete comparison JSON to carry the full changes with the handover.

## Prepare and apply a publisher correction

A `needs_correction` decision may name an explicit replacement URL. **Read complete correction draft** returns the full evidence/review selection, the original organisation revision, current organisation revision, guarded URL targets and the complete cumulative organisation request when one can be prepared.

The request carries the selected organisation plan's existing edits together with the reviewed URL edits. Open **Organisation review** and use that original workflow to save the candidate, inspect its full analysis, review it and release the publishing edition.

There are two distinct reasons to review a rebase:

| Displayed situation | Appropriate continuation |
| --- | --- |
| The organisation plan has advanced beyond the evidence selection. | Reopen the current organisation revision and reconcile the intended correction with its current edits. |
| The evidence selected original source URLs while that same organisation revision already contains candidate edits. | Select and review the candidate view before preparing the correction, so the existing edits and URL target agree. |

The full correction response includes the native explanation in `semantics`. The downloadable **correction JSON** is the original organisation action request itself. It keeps the selected revision guard. The current correction response remains the place to inspect rebase status before applying it.

The HTML report, complete document register CSV and evidence plan JSON remain useful handover outputs even when the review contains no URL correction.

## Operate a running console from the command line

The connected command uses the existing console's private connection file. Use the actual installed IATI source directory and the connection file created by that console. The original [operator guide](OPERATIONS.md) covers opening the console and its private connection directory.

These examples use descriptive placeholders. Replace the connection path, full returned IDs, explicit revision and output paths with the selected case values.

~~~bash
node /installed/iati/document_evidence_client_cli.mjs \
  --connection-file /private/iati-console/connection.txt status

node /installed/iati/document_evidence_client_cli.mjs \
  --connection-file /private/iati-console/connection.txt \
  plan --id EVIDENCE_SHA256 --revision 4

node /installed/iati/document_evidence_client_cli.mjs \
  --connection-file /private/iati-console/connection.txt \
  rows --id EVIDENCE_SHA256 --revision 4 --limit 500 --all

node /installed/iati/document_evidence_client_cli.mjs \
  --connection-file /private/iati-console/connection.txt \
  request --request-id ORIGINAL_REQUEST_ID
~~~

`rows --all` writes one complete JSON page per line, preserves one snapshot and verifies every continuation. A page includes `rows`, `offset`, `limit`, `total` and `snapshotSha256`. For an explicit following page, pass the returned snapshot as `--expected-snapshot`.

The complete command surface is:

| Work | Connected command |
| --- | --- |
| Catalogue and saved work | `status`, `plan --id SHA [--revision N]`, `history --id SHA` |
| Original action recovery | `request --request-id ORIGINAL_ID` |
| Document register | `rows --id SHA --revision N [--offset N --limit N --expected-snapshot SHA] [--all]` |
| Full document detail | `detail --id SHA --revision N --row-id SHA [--expected-snapshot SHA]` |
| Saved observations and comparisons | `observation --id SHA`, `comparison --id SHA` |
| Current correction draft | `correction --id SHA --revision N` |
| Complete native actions | `save`, `note`, `observe`, `review`, `compare`, each with `--file ACTION.json` |
| Selected report/register/plan/correction | `file --id SHA --revision N --kind report\|register\|plan\|correction --out FILE` |
| Observed response bytes | `body --observation-id SHA --out FILE` |
| Complete handover | `export --id SHA [--revision N] --out FILE` |
| Independent receiving | `receive --file FILE [--expected-sha256 SHA]` |

An action file contains the complete original native definition, including its request ID. Preserve every row decision and selected pair. The command sends the saved definition as supplied.

~~~bash
node /installed/iati/document_evidence_client_cli.mjs \
  --connection-file /private/iati-console/connection.txt \
  review --file /private/actions/document-review.json

node /installed/iati/document_evidence_client_cli.mjs \
  --connection-file /private/iati-console/connection.txt \
  file --id EVIDENCE_SHA256 --revision 4 --kind report \
  --out /private/delivery/document-evidence-report.html

node /installed/iati/document_evidence_client_cli.mjs \
  --connection-file /private/iati-console/connection.txt \
  export --id EVIDENCE_SHA256 --revision 4 \
  --out /private/delivery/document-evidence.zip

node /installed/iati/document_evidence_client_cli.mjs \
  --connection-file /private/recipient-console/connection.txt \
  receive --file /private/delivery/document-evidence.zip \
  --expected-sha256 PACKET_SHA256
~~~

The transfer commands verify the complete native byte count and SHA-256. Downloads publish a new output file after the full transfer succeeds. Choose a new destination when preserving another edition. ZIP export and receiving stream up to 4 GiB.

The optional `--timeout-ms` is the connected request timeout, from 1 to 900000 milliseconds, with a default of 240000. The saved evidence plan separately defines the public acquisition's byte, connection, total-time and redirect settings.

## Use the native workspace command

For a workspace opened directly by the original native command, use the same `document-evidence-` operations under `dataset-iati`:

~~~bash
starforge dataset-iati --python /usr/bin/python3 \
  --workspace /srv/starforge/iati document-evidence-status

starforge dataset-iati --python /usr/bin/python3 \
  --workspace /srv/starforge/iati document-evidence-review \
  --file /private/actions/document-review.json

starforge dataset-iati --python /usr/bin/python3 \
  --workspace /srv/starforge/iati document-evidence-export \
  --id EVIDENCE_SHA256 --revision 4 \
  --out /private/delivery/document-evidence.zip

starforge dataset-iati --python /usr/bin/python3 \
  --workspace /srv/starforge/iati-recipient document-evidence-receive \
  --file /private/delivery/document-evidence.zip
~~~

The same operations are available through `python3 /installed/iati/cli.py --workspace PATH`. Use the connected command while the console owns the workspace lease. The native command owns and closes its own workspace operation.

Native `document-evidence-rows` returns one requested page; continue using its exact offset and snapshot. The connected command supplies the convenient complete `--all` traversal. Native receiving accepts the complete file through `--file`; the connected receiver additionally offers `--expected-sha256`.

## Typed JavaScript integration

Connect through the existing `connectIatiWorkspace` function from [client.mjs](client.mjs). Its `documentEvidence` property exposes all eighteen operations plus `rowPages`. The complete [public declarations](document_evidence_client.d.mts) describe selections, observations, review decisions, comparison field changes, correction drafts and receiving results.

This example reads every page from one selected saved revision:

~~~javascript
import { connectIatiWorkspace } from './client.mjs';

const client = await connectIatiWorkspace({
  consoleUrlFile: process.argv[2],
  timeoutMs: 240000
});
try {
  const selected = await client.documentEvidence.plan(process.argv[3]);
  for await (const page of client.documentEvidence.rowPages(selected.id, {
    revision: selected.revision,
    limit: 500
  })) {
    process.stdout.write(JSON.stringify(page) + '\n');
  }
} finally {
  await client.dispose();
}
~~~

For an action, read the complete retained JSON definition and pass it to the matching method, such as `client.documentEvidence.review(definition)`. An observation returns either `{plan, observation}` or the original `ACQUIRING` receipt. Retain that result and recover with `client.documentEvidence.request(definition.requestId)`.

The input definitions preserve these fields:

| Action | Complete definition |
| --- | --- |
| `save` | `requestId`, `name`, `selection: {id, revision, view, expectedSnapshot}`, `documentRowIds`, `actor`; optional acquisition `limits` and `notes`. |
| `note` | `requestId`, `id`, `expectedRevision`, `name`, `notes`, `actor`. |
| `observe` | `requestId`, `id`, `expectedRevision`, `rowIds` sharing the literal URL, `actor`; explicit `acknowledgeNewObservation` when selected rows already have observations. |
| `review` | `requestId`, `id`, `expectedRevision`, `actor`, `note`, and the complete `decisions` array. Each decision contains `rowId`, `observationId`, `decision`, `note`, and an applicable optional `correctedUrl`. |
| `compare` | `requestId`, `before: {id, revision}`, `after: {id, revision}`, `actor`; optional `notes` and `rowPairs`. |

`file`, `body` and `export` return the original streamed `Response`. Consume or cancel the response, and verify the returned descriptor when retaining a file. The connected command implements that complete transfer and verification for file-oriented integrations.

`receive({body, bytes})` accepts the original complete ZIP stream and byte count. Its result contains both `plan`, the selected imported revision, and `currentPlan`, the latest receiving revision.

## Merchant Source Workspaces

The existing configured IATI workspace exposes the prefix `merchant_source_iati_document_evidence_` with these suffixes:

| Purpose | Tool suffixes |
| --- | --- |
| Read saved work and recover requests | `status`, `plan`, `history`, `request` |
| Inspect complete evidence | `rows`, `detail`, `observation`, `comparison`, `correction` |
| Save complete definitions | `save`, `note`, `observe`, `review`, `compare` |
| Transfer retained files | `export`, `file`, `body`, `receive` |

Read and action results retain the native value under `native` together with the configured workspace identifier. Supply the full native action under `definition`. Preserve the original request ID through an uncertain or active result.

Rows return a `nextOffset`; carry `snapshotSha256` as `expectedSnapshot` until that offset is null. History uses the existing inventory pagination and snapshot. Exported reports, bodies and ZIPs are retained through the original file store and read with `merchant_source_file_read`.

Receiving selects either a configured packet file or a prior evidence `exportId`, with `fromWorkspace` when transferring from another configured workspace. The same complete native receiving result preserves the later local revision.

The Merchant request envelope remains 128 KiB. Use the connected command for a larger complete action file. The shared retained-file operations keep complete reports and packets available independently of that request-envelope size.

## Deliver the complete customer case

Use an explicit evidence revision for the handover. A useful delivery includes the complete HTML report, full CSV register, evidence plan JSON, any saved comparison, the applicable guarded organisation correction request and the portable evidence ZIP.

The portable archive preserves the original organisation source and selected planning work, evidence revisions and request history, observations, available complete bodies or prefixes, comparisons and generated reports. The recipient receives that same case and can inspect its original sources and decisions.

After import, read both the imported `plan` and latest `currentPlan`. Add the receiving engineer's note as the next evidence revision. Receiving the older packet again preserves that later current revision.

For continued publishing work, use the original source and current saved organisation plan, select the intended next edition, acquire the requested new observations and save the next named review. The retained earlier editions provide the before side of the following customer comparison.

## Operating capacities

| Item | Capacity or default |
| --- | --- |
| Selected document rows per evidence plan | 1–500 |
| Acquisition body setting | Default 16 MiB; selectable from 1 byte to 64 MiB |
| Total acquisition timeout | Default 60 seconds; selectable 1–120 |
| Connection timeout | Default 10 seconds; selectable 1–30 |
| Redirect allowance | Default 5; selectable 0–10 |
| Retained observation-body capacity per plan | 1 GiB, with space reserved against the plan's selected acquisition maximum |
| Complete metadata/action and individual body/file | 64 MiB |
| Browser ZIP upload/download | 64 MiB |
| Connected/native complete ZIP transfer | 4 GiB, subject to the original portable-format limits |
| Merchant request envelope | 128 KiB |
| Native row page | 1–500 rows; default 100 |
| SDK/connected row page | 1–500 rows; default 50 |

The status response returns each plan's retained and remaining body bytes. Choose the intended document selection and acquisition settings before capture. For larger complete handovers, use the streaming connected or native transfer and preserve the selected output's byte count and hash.

## Continue a received case with a complete public document

The [following-observation programme](document_evidence/FOLLOWING.md) extends the existing recipient's saved edition through one explicitly acknowledged capture, a complete named deferred review, historical comparison, full native/SDK/Merchant body delivery, packet export and independent receiving. It retains the original recipient's local note, all earlier observations and the other document decisions. The complete programme and installed FCDO input are included with the original source; use the matching full installed edition for its new packet and receiving workspaces.

The [following guide](document_evidence/FOLLOWING.md) covers the exact original case identities, native and connected commands, complete output, historical comparison and continuation across authorized workers. The previous packet and result retain their original source edition and remain separate from the following phase's complete deliverable.
