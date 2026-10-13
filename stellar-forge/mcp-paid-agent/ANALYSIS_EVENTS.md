# Event programmes through the original Analysis agent

An agent can receive the buyer's complete original event window, review its meaning,
continue the customer's report and workbook, and deliver the entire working result
through the same private Analysis application. The browser, native CLI and registered
agent use the original programme, input files, action requests and SQLite database.

The provider uses the existing `analysis` action on
`sf43_discover_review_and_pay`. The host registers an existing live Analysis
workspace through its original native configuration. Select that registered alias;
capabilities, receiver executables and local database paths are host settings.

## Start with the installed customer application

Use the existing [Event programmes browser guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/EVENT_PROGRAMMES.md)
to start the private Analysis service with the matching installed Node source
receiver. The sibling `analysis-source.mjs` and `analysis-source-cli.mjs`
must be the original pair. Register the live service with the native MCP host's
existing Analysis registration. The [Analysis agent guide](ANALYSIS.md) describes
that original configuration and its registered workspace aliases.

Use `workspaces` to select the original alias and its 32-character workspace ID.
Open `event-overview` to see source receiver availability, existing programmes,
the active action, original file inputs and previous actions. Source acquisition,
Stellar authorization and payment remain in the original subscriber/buyer.

The public entrypoint is the same for every operation:

~~~js
await nativeClient.call('sf43_discover_review_and_pay', {
  action: 'analysis',
  analysisWorkspace: selectedAlias,
  analysisOperation: 'event-overview',
  analysisRequest: {limit: 25, programme_limit: 25}
});
~~~

The typed helper opens this same authenticated client and unwraps the original
Analysis response:

~~~js
import {openNativeAnalysisEventsClient, readNativeAnalysisEventRecord}
  from './native-analysis-events-client.mjs';

const client = await openNativeAnalysisEventsClient({
  url: originalMcpUrl,
  analysisWorkspace: selectedAlias,
  tokenEnv: 'MCP_ACCESS_TOKEN'
});
const overview = await client.call('event-overview', {limit: 25});
~~~

This example runs beside the installed source modules under
`stellar-forge/mcp-paid-agent/`. The distribution also exports the typed
`./buyer/mcp/analysis-events-client` entrypoint.

## Receive the whole original source pair

Select the subscriber's complete NDJSON file and its original manifest. The
allowances match the underlying product: 32 MiB NDJSON, 4 MiB manifest, and the
original source projector's event/document limits. The manifest and each event's
identity, payload and page history are validated by the original receiver.

The installed command saves both full files and the exact request in a private
receiving directory before its first dispatch:

~~~sh
starforge mcp-analysis-events input \
  --url "$MCP_URL" --workspace "$ANALYSIS_ALIAS" \
  --workspace-id "$ORIGINAL_WORKSPACE_ID" --input "$RETAINED_INPUT_ID" \
  --dir "$PRIVATE_INPUT_DIRECTORY" \
  --ndjson "$ORIGINAL_EVENT_FILE" --manifest "$ORIGINAL_MANIFEST"
~~~

The input ID is one retained 32-character lowercase hexadecimal value, chosen
once for this original pair. The selected alias and actual workspace ID belong
to the existing host registration. Keep the same private directory on restart.
After the full source is saved there, an identical continuation may omit the two
original path arguments. The helper reopens those complete saved bytes, checks
their identities and the selected workspace, and continues from the original
server's accepted offsets.

The underlying operations are `event-input-create`, `event-input` and
`event-input-chunk`. Chunk calls carry the same input ID, selected file kind,
offset, exact base64 and SHA-256, with at most 64 KiB decoded per call. Native
SQLite owns contiguous receiving and exact replay. A lost acknowledgment can be
reconciled by reading the same input. Changing either file requires another
input selection. Empty but complete original files retain their actual zero
length and digest.

The helper's `input-request.json`, complete original files and
`input-received.json` travel together. The original native workspace archive
separately retains accepted input chunks and saved actions.

## Review the complete customer window

Choose the actual programme name and payload fields with the receiving customer.
Programme names begin with a letter and contain at most 24 letters, digits or
underscores. Original metadata columns and the full payload remain; selected
payload columns preserve exact text and adjacent missing/null/type state.

Retain each complete request and its action ID before dispatch. Each native
review also has its own stable operation ID. These values identify original
work; a retry keeps them.

~~~js
const reviewedRequest = {
  programme: programmeName,
  id: retainedActionIds.review,
  operation_id: retainedWindowOperationId,
  input_id: retainedInputId,
  mapping: {fields: reviewedPayloadFields}
};
await client.call('event-review', reviewedRequest);
const action = await client.call('event-action', {id: reviewedRequest.id});
~~~

`event-action` returns the original status and a compact result selection.
Read its `complete_record` to obtain the **entire** saved native action:
original request, mapping, progress, complete review and customer definitions.
The helper returns exact bytes and text without parsing numeric tokens:

~~~js
const whole = await readNativeAnalysisEventRecord({
  client, analysisWorkspace: selectedAlias, record: action.complete_record
});
// Persist whole.bytes with the original request and use the application's
// lossless JSON reader to inspect the complete native action result.
~~~

The complete record has its own workspace, kind, record ID, byte length and
SHA-256. Every range stays bound to that same response snapshot, even if the
live action or programme advances. Files reside in the existing private native
host's `analysis/event-records` area. Native customer records may retain their
original producer-path provenance; subsequent file selection always resolves
against the current host registration.

Review the actual source/store/feed, individual event IDs, accepted page history,
field meanings, prior window and proposed table/report/workbook result. Once
the native review is COMPLETE, select its actual `review_sha256`:

~~~js
await client.call('event-apply', {
  programme: programmeName,
  id: retainedActionIds.apply,
  operation_id: retainedWindowOperationId,
  review_sha256: selectedCompleteReviewSha256,
  note: customerDecision,
  columns: completeReviewedWorksheetColumnChoices
});
~~~

`columns` is optional. When needed, it contains the **complete** replacement
column arrays keyed by the original worksheet index; the native WorkbookRefresh
validates them. Current report definitions, worksheet names, notes and unrelated
source sheets keep their original revision controls.

The original `event-programme` operation lists selected programme state and
paged operation summaries. Its complete record includes every retained review,
applied result, delivery and preceding customer attempt. Use the normal
Analysis report, workbook and full-query operations to inspect and edit the
result in that same customer workspace.

## Continue original actions and useful later windows

An accepted request remains in the original SQLite action table before native
execution begins. An uncertain tool reply therefore has a concrete recovery
unit: read `event-action` with that same ID. RUNNING or COMPLETE retains the
original work. ERROR or INTERRUPTED is continued by sending every unchanged
original field with `resume: true`; the native service decides whether the
retained stage is complete or needs continuation.

If current report or worksheet choices changed after source activation during
an unfinished apply, `event-refresh-review` records why those current customer
choices are selected:

~~~js
await client.call('event-refresh-review', {
  programme: programmeName,
  id: retainedActionIds.refresh,
  operation_id: retainedWindowOperationId,
  review_sha256: precedingCompleteReviewSha256,
  note: reasonForSelectingCurrentCustomerWork
});
~~~

Read its entire completed record. The next apply uses that new actual review
digest and a newly retained apply action ID. The original source operation,
preceding attempt and note remain in the programme history.

For a later useful window, receive the actual next cumulative subscriber pair
under its own input ID and select a new window operation. The existing receiver
checks that earlier accepted events and pages remain an immutable prefix. A
complete later window with zero new events remains that actual source outcome.
The customer's work continues through the same programme and ordinary revision
checks.

Event counts, requested pages and qualifying paid purchases keep their distinct
meanings. Source receiving, report edits, replay and another delivery remain
associated with the already acquired original purchase.

## Deliver and receive the entire working result

After an accepted apply, `event-deliver` retains that selected result and takes
a fresh complete workspace snapshot:

~~~js
await client.call('event-deliver', {
  programme: programmeName,
  id: retainedActionIds.delivery,
  operation_id: retainedWindowOperationId
});
~~~

The delivery action ID must differ from the selected source operation ID. Read
that same action until its actual COMPLETE state. Repeating this original
delivery request keeps its original snapshot; a deliberately new delivery ID
selects a fresh snapshot, including after independent restoration.

Inspect the full original delivery before selecting its immutable index:

~~~sh
starforge mcp-analysis-events inspect \
  --url "$MCP_URL" --workspace "$ANALYSIS_ALIAS" \
  --programme "$PROGRAMME" --delivery "$RETAINED_DELIVERY_ID"
~~~

The index identifies the selected result edition, accepted operation, reviewed
digest, actual workspace-programme edition/revision and all sixteen full files:

| Complete files | Customer use |
| --- | --- |
| Event_Analysis.xlsx; Event_Workbook_Handover.zip | Editable selected workbook and its original handover |
| Event_Report.html; Event_Report.json; Event_Report_Tables.zip | Complete selected report and original tables |
| Complete_Event_Table.jsonl; Complete_Event_Table.csv; Complete_Event_Table_Manifest.json | Every acquired event with native typed-export metadata |
| Original_events.ndjson; Original_events.ndjson.manifest.json | Exact original subscriber input and page/source history |
| Reviewed_customer_window.json; Customer_programme.json | Accepted complete review and programme extracted from the actual archived database |
| Event_Analysis_Workspace.zip; Event_Analysis_Workspace_Manifest.json | Original complete native application archive and member identities |
| Open_and_use.md; Event_Analysis_Delivery.json | Receiving instructions and original full delivery identity |

Download the whole selected package using its actual `indexSha256`:

~~~sh
starforge mcp-analysis-events download \
  --url "$MCP_URL" --workspace "$ANALYSIS_ALIAS" \
  --programme "$PROGRAMME" --delivery "$RETAINED_DELIVERY_ID" \
  --dir "$PRIVATE_RECEIVING_DIRECTORY" --index-sha256 "$REVIEWED_INDEX_SHA256"
~~~

The helper adapts the existing `createRetainedDownload` writer. That original
writer owns its private files, lease, partial checkpoint, exact prefix recovery,
whole-file hashes and atomic publication. A port change keeps the original
workspace/programme/delivery/index identity; each new chunk still uses the
selected authenticated client. An interrupted download repeats the same
command and directory.

The original `SavedFileReader` hashes the native retained file and checks its
descriptor while reading at most 64 KiB per tool call. It resolves files from
the current registered customer's database, preserving original sender paths
as provenance. File sizes retain the native per-file 1 GiB allowance. Complete
API records have a separate 64 MiB allowance.

After every file has arrived, independently verify the whole package offline:

~~~sh
starforge mcp-analysis-events reopen \
  --workspace "$ANALYSIS_ALIAS" --programme "$PROGRAMME" \
  --delivery "$RETAINED_DELIVERY_ID" --dir "$PRIVATE_RECEIVING_DIRECTORY" \
  --index-sha256 "$REVIEWED_INDEX_SHA256"
~~~

This reads the saved exact index and every original file without contacting the
MCP or source host. Open the report and workbook, then restore
`Event_Analysis_Workspace.zip` through the original
`stellar_forge_buyer.workspace_archive_receive` receiver using the actual
workspace archive digest. Launch the restored Analysis service, register its
receiving directory through the original host configuration, and reopen the
same programme and customer work.

The workspace snapshot precedes its sender's final delivery journal. Continue
from the accepted programme with a fresh delivery ID or later actual source
window. The restored workspace, original report/workbook and prior source
history remain the same customer application.

## Operator and implementation ownership

The private Analysis host owns its process, capability, trusted source receiver,
SQLite lease and native jobs. Closing the agent adapter cancels and drains its
own calls; the host continues its original work. Browser actions and agent
actions use the same durable action table and single coordinator.

The existing source/buyer owners supply the complete acquired file pair. The
receiving customer chooses field meanings and explicitly accepts the complete
review. The maintainer restores the original archive and continues that
customer's operating case. The complete native exercise joins the original
Mercury/paid-subscriber receiving course and the existing general webhook
commissioning source; customer files and actual returned execution stay with
those original operations.
