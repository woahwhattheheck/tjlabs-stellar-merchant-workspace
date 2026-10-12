# Saved source windows and client handover

A source window refreshes a saved publisher selection, acquires the linked original documents, assigns material changes to an owner, and produces a complete editable client handoff. It uses the same retained OCDS workspace as the Procurement desk, native CLI and merchant. Open **Source windows** from the desk header, or use the commands below.

## Choose the original source once

For a fixed client cohort, save one Find a Tender record-family selection per original OCID. Each fresh window asks the publisher for that family again and retains every original edition returned by the publisher.

A selection file contains the actual publisher request and client review owner:

~~~json
{
  "id": "cymrusoc-record",
  "label": "CymruSOC 2.0",
  "provider": "find-tender",
  "request": {"kind": "record", "ocid": "ocds-h6vhtk-06e0f5"},
  "ocids": ["ocds-h6vhtk-06e0f5"],
  "owner": "procurement-operator",
  "enabled": true,
  "acquireDocuments": true,
  "documentEditionScope": "current",
  "reviewPolicy": {"administrativePointers": ["/id", "/date"]},
  "attachments": []
}
~~~

~~~sh
ocds source-select --workspace /private/client-01 --file source-selection.json --expected-revision 0
ocds source-state --workspace /private/client-01 --out source-state.json
ocds source-refresh --workspace /private/client-01 --name baseline --out baseline-result.json
~~~

The selection revision is independent of the process review revision and the workspace revision. Editing a saved selection requires its current selection revision. Existing running windows keep the exact selection snapshot with which they started.

The existing release capture is also available. Save its explicit notice ID or its full UTC date bounds, stages and page limit in request. Native Find a Tender validation applies: record or releases; one OCID or notice ID; otherwise both UTC update bounds; planning, tender or award stages; a release page size from 1 to 100. A record-family request uses its exact OCID. Wider release discovery can return original packages containing other processes, so use it deliberately in the relevant client or discovery workspace.

A saved request contains publisher parameters. Its capture ID belongs to an already running observation and is retained inside that window.

## Refresh and continue

~~~sh
ocds source-refresh --workspace /private/client-01 --name followup-1 --out followup-result.json
ocds source-resume --workspace /private/client-01 --window-id SAVED_WINDOW_ID --out continued-result.json
~~~

A fresh window creates a fresh native publisher capture. A resume continues the original capture ID and next-page cursor. Completed pages retain their original body bytes, source IDs, HTTP metadata and retrieval times. Completed documents also resume independently.

The Source windows screen starts work in the background and displays its saved progress. **Pause** requests interruption after retaining the completed work. **Resume** continues a partial or interrupted original window. Closing the service interrupts its active captures, then finishes their checkpoint handling before the workspace closes.

A complete window can be reopened idempotently. A received historical window retains its original observation identity; start a fresh local window from its received selection to observe the publisher again.

Each window keeps both baseline and current exact entry IDs. A later source-refresh can read a prior source-window JSON using --baseline; it accepts the saved current array, with baseline available for an explicitly prepared baseline file. The browser can also select a previous window as its comparison basis. The agency caller uses its exact previous client window.json.

## Receive an original acquired by a connected publisher reader

A connected browser or source service can supply a complete original record-family response. Receive its exact UTF-8 file together with the provider's acquisition receipt. The source selection still identifies the original Find a Tender record endpoint and one original OCID.

~~~sh
ocds source-observe --workspace /private/client-01 --selection-id cymrusoc-record \
  --file cymrusoc-original-record-package.json --observation source-acquisition.json \
  --name baseline --out received-source.json
ocds source-resume --workspace /private/client-01 --window-id SAVED_WINDOW_ID \
  --out completed-window.json
~~~

The browser's **Windows → Receive a captured original record family** performs the same receiving and document continuation. To join an interrupted window, select it or pass its ID and current window revision with source-observe.

An acquisition receipt contains operationId, transport, requestedUrl, bytes and sha256. Record retrievedAt when the source service exposes an exact retrieval time. If it supplies an observed completion bound instead, keep retrievedAt null and record completedBy. Preserve source status, final URL and headers only when exposed; transport-specific attachment IDs and provider receipts remain part of the original observation. Source publication dates retain their separate publisher meaning.

The body is normalized by the original OCDS module, checked against the exact record-family request, and imported without reserialization. Every retained edition keeps its original identity. The same acquisition operation returns the same saved window; a later publication window uses a new actual acquisition. Native capture history and any earlier cursor remain available alongside the successful external acquisition.

For a portfolio with several selected families, SDK callers can pass selectionIds on the first adoption. That saves the complete selection set in one window; subsequent adoptions use the same windowId and its current revision. Running that window continues any remaining native source requests and linked-document observations.

## Original document observations

Document references come from the original release document blocks under planning, tender, awards, contracts and implementation, as exposed by the native OCDS index. Source edition, OCID, source pointer and original document ID remain visible. The logical document block also includes its containing original array identities, so document IDs from unrelated awards or contracts are kept separate.

A fresh window observes every selected URL again. The same URL can return new bytes even when its notice fields have not changed. Each actual observation keeps requested and final URL, retrieval time, HTTP status, actual content type, redirects, validators, original byte count and SHA-256. A 304 response records a new observation against the previously retained original body. The native store deduplicates byte bodies while retaining every association and observation.

Document references without a URL, and documents explicitly marked offline/print, remain actionable source references with their original description. Failed requests keep their actual error and Retry-After time. Successful document work remains available when a publisher request or another document fails.

The default document acquisition limit is 128 MiB per body and 2 GiB of retained document bodies in one workspace. SourceOperations constructor options set these implementation capacities. The agency meter reports distinct source/document bytes across client copies against the configured commercial scope.

A present-day request for a historical notice's document URL records its present retrieval time. Publication and modification dates stay in the original document metadata.

## Import an original acquired through another session

An official attachment reference can be retained before its family JSON has arrived:

~~~json
{
  "ocid": "ocds-h6vhtk-06e0f5",
  "referenceUrl": "https://www.sell2wales.gov.wales/Search/Show/Search_View.aspx?ID=OCT663927&version=1",
  "document": {
    "id": "381328",
    "title": "Additional permitted CymruSOC framework users",
    "url": "https://www.sell2wales.gov.wales/Assets/NoticeBuilder_FileDownload.aspx?id=381328",
    "format": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  }
}
~~~

Put the reference in the saved selection attachments array. Then import the actual downloaded file with its acquisition JSON:

~~~sh
ocds source-original --workspace /private/client-01 --selection-id cymrusoc-record \
  --ocid ocds-h6vhtk-06e0f5 --document-id 381328 \
  --file cymrusoc-document-381328.docx --observation acquisition-381328.json \
  --out original-import-result.json
~~~

The acquisition record supplies its actual operationId, requestedUrl, finalUrl, retrievedAt, status, contentType, sha256 and bytes. Headers, validators and other original acquisition metadata can accompany them. The native importer verifies the complete byte identity and associates it with the exact saved reference. Repeating the same original acquisition operation is idempotent.

A source reference can have null entryId and sourceId until its native family is imported. Its OCID, official notice URL, original file bytes and assigned review remain usable during that acquisition. A later native edition obtains a separate edition-bound association and reuses the retained byte body.

## Assigned material reviews

Original documents are compared with the existing native comparison engine. The default administrative list is only /id and /date. Every other changed path, including extension fields, stays material. The administrative paths remain visible in the retained comparison.

A review item can be an initial selected process, initial original documents, an original source acquisition, an exact edition change, or a representation change. It records owner, next action, revision, original before/after entry IDs, complete material paths, document byte changes, document reference changes and source acquisition context.

New source work fills an empty process review owner and next action and advances an unreviewed process to reviewing. Existing process decisions, notes and assigned human text remain available. An assigned change review has its own editable status and resolution.

~~~json
{
  "expectedRevision": 1,
  "status": "resolved",
  "owner": "procurement-operator",
  "nextAction": "Carry the selected changes into this client's next bid review.",
  "resolution": "Reviewed the recorded field changes and the retained original document edition."
}
~~~

~~~sh
ocds source-review --workspace /private/client-01 --review-id REVIEW_ID \
  --file review-decision.json --out saved-source-review.json
~~~

Use the actual decision from that review in the resolution field. Both the Source windows screen and native CLI save it against the current source-review revision. Existing process disposition and client next action are also available in the original Procurement desk.

## Complete editable source handoff

~~~sh
ocds source-export --workspace /private/client-01 --ocid ocds-h6vhtk-06e0f5 \
  --directory /private/handoffs/client-01-window-2

ocds source-receive --workspace /private/received-client-01 \
  --directory /private/handoffs/client-01-window-2 --expected-revision 0
~~~

A new folder contains:

- handoff.json with the exact selected OCIDs, native/source package identities and file hashes.
- workspace.json when native editions are retained, containing the complete selected original source bodies, all selected editions and editable process reviews.
- process-report.html for those retained native editions.
- source-operations/source-operations.json with saved selections, complete source/document windows, assigned work and receiving context.
- source-operations/documents/ with every retained original body version, named by its actual SHA-256.
- source-operations/assigned-review.html, with the full review context and links to the retained originals.
- RECEIVE.md with the operator receiving path.

The browser's Handover panel accepts a new folder path on the operator machine and writes this same complete folder. Its Receive action reads the complete folder into the chosen local workspace. Move the entire folder when handing it to another machine.

Receiving merges immutable originals and retains local edits alongside incoming context. It verifies each original document body before inserting it. The same source package is idempotent. Distinct incoming review/selection values remain in receiving context. Original document versions are preserved even when local review or selection metadata differs. Onward exports include the selected incoming context and original body versions.

A handoff containing official document references can be received before native family editions exist. Edition-bound documents and comparisons require their corresponding original native editions; the complete handoff receives its native workspace package first.

## Agency operation across client workspaces

The reusable caller is under agency/ and is also registered as ocds-agency. It uses the same 32-column tracker projection as the delivered standalone agency kit.

Each configured portfolio has its own directory, selected OCIDs, source selections, reviewer and editable receiving state. The saved source-selection file maps portfolioId to its native selections. Keep private client configuration outside the public product source.

~~~sh
ocds-agency init --config /private/agency/pilot.json
ocds-agency source-select --config /private/agency/pilot.json

ocds-agency refresh --config /private/agency/pilot.json --name baseline \
  --out /private/agency/runs/baseline

ocds-agency refresh --config /private/agency/pilot.json --name followup-1 \
  --baseline /private/agency/runs/baseline/window.json \
  --out /private/agency/runs/followup-1

ocds-agency refresh-resume --config /private/agency/pilot.json \
  --run /private/agency/runs/followup-1/source-window-runs.json \
  --out /private/agency/runs/followup-1-continued
~~~

The caller saves each real source-window ID to source-window-runs.json before acquisition continues. Resume retains the same agency operation and publisher windows. It refreshes each client independently, carries actual acquisitions and assigned work into the current tracker, and writes a complete editable handoff under handoffs/PORTFOLIO_ID/.

window.json retains exact prior/current editions for the next client comparison. tracker.csv is the agreed single row per portfolio_id plus OCID. tracker.rows.json preserves unescaped cell values. comparisons/ contains complete exact edition comparisons. assigned-review-index.json maps each client's retained work, and scope-meter.json deduplicates raw original source SHA-256 values, original document bodies and selected OCIDs across all client copies.

When only an original public notice reference is available, its sourced fields remain in the tracker. Native entry IDs and native process review revisions stay empty. Its assigned source work supplies owner and next action. Full-notice and summary deadline texts remain separate, including their original source URLs. An optional nativeDeadline context binds an exact native field and original value to that notice context. CymruSOC uses /tender/expressionOfInterestDeadline; its current tracker identifies an expression-of-interest deadline explicitly and retains the +01:00 offset. Tender-period and enquiry-period fields retain their distinct meanings. A changed native value updates the projected current deadline while the earlier notice text and source binding remain in source-contexts.json.


The sourceAcquisitionsFile option points to a tjlabs.ocds.agency-source-acquisitions.v1 document with acquisitions entries. Each entry contains portfolioIds, windowName, selectionId, the exact original file path and observation. The caller adopts those actual acquisitions into that named window before continuing its native capture/document work. A sourceOriginalsFile similarly retains already acquired attachment bytes and their real acquisition records. Both registers retain original operation identities across retries.

Copy the generic files in agency/templates/ to an agency-controlled private configuration folder. Set the absolute productSourceDirectory and workspaceRoot, assign the actual client portfolio identifiers and original OCIDs, then save the selected publisher requests. The empty registers are ready for actual source references and acquisition records. The application does not guess client identities or import mappings for an agency's separate tender system.

The original window command still exports retained client snapshots. The refresh command performs the actual publisher/document acquisition before producing its client output.

Use source-handoff to produce the latest selected client handoff after reviews, and source-receive for one destination portfolio:

~~~sh
ocds-agency source-handoff --config /private/agency/pilot.json --portfolio portfolio-01 \
  --baseline /private/agency/runs/followup-1/window.json \
  --out /private/agency/client-handoffs/portfolio-01-reviewed

ocds-agency source-receive --config /private/receiver/pilot.json --portfolio portfolio-01 \
  --directory /private/agency/client-handoffs/portfolio-01-reviewed --expected-revision CURRENT_REVISION
~~~

The tracker, native package, source operations and reviews are captured under one native SQLite snapshot. Immutable original body files are copied from that same prepared selection.

## Native SDK and HTTP

~~~js
import {SourceOperations} from './source-window.mjs';

const sources = new SourceOperations(workspace);
sources.saveSelection(selection, {expectedRevision: 0});
const result = await sources.run({name: 'baseline', selectionIds: [selection.id]});
const snapshot = workspace._snapshot(() => ({
  tracker: buildClientTracker(workspace.view()),
  handoff: sources.prepareHandoff({ocids: selection.ocids})
}));
await sources.exportDirectory('/private/handoffs/client-01', {prepared: snapshot.handoff});
~~~

SourceOperations accepts installed source adapters through its adapters option. An adapter validates its own saved request, uses the native workspace for original imports, and returns completed retained source IDs and actual acquisition observations. The saved window ID and selection ID are supplied as operation context. The initial maintained adapter is Find a Tender; source-specific acquisition/conversion stays with the source adapter.

| HTTP route | Operation |
|---|---|
| GET /api/source-operations | Saved selections, windows, documents, assigned work and receiving summaries |
| POST /api/source-selections | Save selection plus expected selection revision |
| POST /api/source-windows | Start a fresh window or resume a saved windowId; background work returns 202 |
| GET /api/source-windows/:id | Current complete saved window |
| POST /api/source-windows/:id/cancel | Request a saved-window pause |
| GET /api/source-reviews/:id | Full exact comparison, assigned review and original document editions |
| PATCH /api/source-reviews/:id | Save assigned review with its expected revision |
| GET /api/source-documents/:id?sha256=... | Download the exact retained original body |
| POST /api/source-observation | Adopt a complete original record family and its actual external acquisition receipt |
| POST /api/source-original | Import original base64 bytes plus the actual acquisition record |
| POST /api/source-export | Write a complete handoff to the selected new local folder |
| POST /api/source-receive | Receive the complete local handoff folder with the current workspace revision |
| GET /api/source-receiving/:id | Complete retained incoming source context |

OcdsClient exposes matching methods. sourceDocument returns Uint8Array bytes. refreshSources returns the saved background window; use sourceWindow or sourceState to read its progress. Existing client time/response capacities remain configurable.

## Original source references

The document model and release identity semantics follow the [OCP release reference](https://standard.open-contracting.org/latest/en/schema/reference/#document). Document IDs are scoped to their document block; original extension fields remain part of the retained source.

Find a Tender's [published-notice changes guidance](https://www.find-tender.service.gov.uk/Home/PublishedNotice/Changes) describes new web addresses for edited Procurement Act notices and retention of their earlier versions.

The [Sell2Wales publication policy](https://www.sell2wales.gov.wales/helpandresources/ocds/publicationpolicy) and [published API guide](https://api-sell2wales.klickstream.com/v1?lang=en) provide its own family/history and monthly release semantics. The active native selection above uses the maintained Find a Tender record request for the exact OCID. The original Sell2Wales notice and attachment URLs stay with the explicit reference.

The worked CymruSOC attachment reference above comes from [the original 2 October notice](https://www.sell2wales.gov.wales/Search/Show/Search_View.aspx?ID=OCT663927&version=1), with the [current amendment](https://www.sell2wales.gov.wales/search/show/search_view.aspx?ID=OCT664337&catID=) retained separately.
