# Saved IATI geography: browser and JavaScript client

This interface uses the original IATI workspace, source editions and native locations
collection. It provides an analyst review of publisher-reported geography. Financial
amounts stay in their source activities and, when selected, the exact linked financial
portfolio revision. The interface does not multiply or allocate those amounts across
locations.

## Open the original application

Start or reopen the existing IATI application with its normal CLI or managed
Applications command. Open the complete private loopback console URL supplied by that
operation. The Geography navigation item uses the same application and authenticated
workspace. It starts no second server.

The added browser assets are `public/geography.js` and
`public/geography.css`. The complete `public/index.html` and
`public/app.js` retain the original source, portfolio, DQA, participant publishing,
refresh and organisation flows. The managed application must serve both added assets
from the selected complete source edition.

## Prepare the geographic selection

1. Retain the complete IATI 2.03 activity XML in the existing Sources view. The original
   XML remains the authoritative source, including narratives, gazetteer references,
   administrative associations and extension content.
2. Use **Geography**, then create a named review. Select one to thirty-two complete
   source editions. A reporting activity must not occur in more than one selected
   publisher file; the native core rejects overlapping editions.
3. Leave the activity list empty for all source activities, or supply exact IATI
   activity identifiers, one per line. A preferred narrative language selects a label
   while the complete multilingual source association remains retained.
4. Optionally link an existing financial portfolio by its exact ID and revision. Use
   that portfolio's exact source editions and activity selection. Before saving, the
   interface reads that original portfolio revision. An empty activity field adopts
   its explicitly saved activity scope; a contradictory supplied scope is rejected.
5. Record available publisher, original URL, acquisition timestamp, licence and
   citation for each selected source. An acquisition timestamp includes its timezone.
   These are supplied provenance fields, not inferred publisher claims.
6. Choose draft, reviewed or needs-correction, with the named reviewer and note.
   Save the complete geographic review. The returned ID and revision identify the
   original source selection and native editions.

Source IDs, activity scope, findings and provenance use the native core's canonical
order before the original browser request is retained. Notes and source field values
remain their complete supplied strings. Editing another field preserves imported
provenance whitespace and explicitly retained empty acquisition rows. Refreshing
the saved catalogue also preserves a new review's prepared provenance fields.

## Read map coverage and original location records

The Locations view opens the explicit saved revision. Its coverage includes all
location rows and the explicit absence row for every activity without a location.

The map is a coordinate graticule. It displays only valid reported points from the
selected native edition. IATI position text is latitude followed by longitude;
the browser converts to its map axes only for drawing. A missing, invalid or
unreported position stays in the register. No country centroid, address lookup or
other invented point fills a gap.

The first map page contains at most one thousand points. **Load more points** reads
the next exact native offset and shows loaded versus total coverage. Zoom, pan, fit
and reset act on the loaded points. A fit of a partial page remains a fit of the
loaded points, not a claim that all matching geography is visible.

Filter the register and point query by source, activity, text, coordinate status,
analyst decision, exactness, location class or reach. Non-valid coordinate filters
show their full register coverage and an empty point view. Register pages are fifty
rows; the server may return fewer when a complete page reaches its byte bound.
The actual returned next offset governs continuation. Previous page uses the
retained original page start, including when a byte-bounded page contains fewer
than fifty records.

Click a point, press Enter or Space on its keyboard focus, or open a register row.
The full native record is read using the exact source ID and row ID at the selected
revision. Original position text, CRS, administrative/gazetteer associations,
narratives, full source record JSON and issues remain available as source fields.

## Record analyst findings

Open a source record in the latest saved review. Choose accepted, needs-correction
or note, name the reviewer and explain the finding. **Prepare finding** updates only
the local prepared revision. **Save review** retains the entire definition and all
findings with the original expected revision.

A finding identifies one exact source SHA and native row ID. It never edits the
publisher XML. Removing a prepared finding is an explicit action. Changing source
selection does not silently move a finding to another source. If a finding refers
to an unselected source, the interface asks the analyst to retain that source or
explicitly remove the finding before saving.

The History view opens complete chronological revisions. A historical revision
keeps its own record register, point queries, source summary and exports. Open the
latest saved review to prepare a new revision; an earlier view is read only.

## Compare whole editions

Choose an earlier and later revision of the same review. Unchanged source IDs are
paired by the native engine. For replacement publisher files, supply explicit pairs:

```json
[
  {"before":"FULL_OLD_SOURCE_SHA256","after":"FULL_NEW_SOURCE_SHA256"}
]
```

Each removed or added unpaired source remains a whole removal or addition. The
native comparison also retains definition changes and source-bound analyst finding
changes. Compatible location columns and keys allow different activity selections
or narrative languages to be compared without changing the default strict native
comparison contract used by other products.

The browser displays the native counts and each original source pair. **Read
changes** pages through its complete native changes, including full before and after
cells. The saved comparison ID can be read again through the client. The whole
geography packet retains those comparisons with the review history.

## Export and independent receiving

Export the selected revision as a complete packet, GeoJSON, CSV, JSON or HTML.
The native exporter returns an artifact identity, filename, byte length, content
SHA-256, selected review and revision. The artifact ID is distinct from the content
SHA; use its returned download route.

The browser reads the complete native file, verifies its byte length and SHA-256,
then offers it for download. It neither rebuilds a file from the current page nor
treats a page as a complete export. GeoJSON uses longitude/latitude coordinates
and null geometry for unlocated records. The original associated source values
and attribution remain in the complete native handover.

To receive a packet in an independent original workspace, open Geography there and
select the full packet ZIP. The browser stores the unchanged File/Blob, length and
SHA before the POST. The native receiver validates the complete source, history,
requests, editions and comparisons. The browser verifies the returned input packet
identity and opens the exact imported review revision.

## Interrupted saves and receiving

The browser uses one IndexedDB store, `sf30-iati-geography-requests`, keyed by the
native persistent `workspaceSha256`. Before any save or receive, it retains the
entire request object and request ID, or the complete original packet File/Blob
and SHA. It reads the current workspace identity before continuation.

A lost response or revision conflict keeps the same original input. **Continue
original request** first reads the original request ID from the saved workspace.
The complete lookup response is retained before validation. A `RECORDED` result
must name the same persistent workspace and contain the exact complete original
request; the browser then receives its original historical review without another
save. Only `NOT_RECORDED` permits the same unchanged save request to be submitted.
A different request body or workspace leaves both original input and response
retained for inspection.

Continuation does not generate another request ID or change an expected revision.
A complete returned result is saved before response validation and is reused on
retry. Completed request history is retained locally before its pending entry is
cleared.

A definitive validation rejection can be retained and then revised explicitly.
Uncertain requests and successfully returned results cannot be discarded through
that control. If browser storage is unavailable or cannot save the full input,
the operation stops before dispatch. Reopen the original browser profile and
workspace to use its retained request.

## JavaScript client

Use the existing `IatiWorkspaceClient` or `connectIatiWorkspace`; the client borrows
the original server. It makes no automatic mutation retries and does not stop the
application. `dispose()` aborts and drains only that client's pending HTTP requests.

```js
import { connectIatiWorkspace } from './client.mjs';
import { createHash } from 'node:crypto';
import { open, link, unlink } from 'node:fs/promises';

const client = await connectIatiWorkspace({
  consoleUrlFile: '/ABS/private/application/console-url.txt'
});
try {
  const state = await client.geographyState();
  const latest = state.reviews[0];
  const review = await client.geographyReview(latest.id, {
    revision: latest.revision
  });
  const rows = await client.geographyRows({
    id: review.id, revision: review.revision, offset: 0, limit: 50
  });
  const points = await client.geographyPoints({
    id: review.id, revision: review.revision, offset: 0, limit: 1000
  });
  const descriptor = await client.geographyExport({
    id: review.id, revision: review.revision, format: 'packet'
  });
  const response = await client.geographyDownload(descriptor.id);
  const destination = '/ABS/private/customer/geography-review.zip';
  const temporary = destination + '.partial';
  const file = await open(temporary, 'wx', 0o600);
  const digest = createHash('sha256');
  let bytes = 0;
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > descriptor.bytes) throw new Error('Native file grew beyond its descriptor');
      digest.update(chunk);
      await file.writeFile(chunk);
    }
    if (bytes !== descriptor.bytes || digest.digest('hex') !== descriptor.sha256)
      throw new Error('The complete native file does not match its descriptor');
    await file.sync();
  } finally {
    await file.close(); // An incomplete original is retained at the .partial path.
  }
  await link(temporary, destination); // Does not overwrite an existing customer file.
  await unlink(temporary);
  // Retain descriptor with this exact complete file. Use the native packet receiver
  // in the independent customer's original workspace for full import/reopen.
} finally {
  await client.dispose();
}
```

The declaration file `client.d.mts` contains complete types for geography definitions,
reviews, native row/point pages, provenance, findings, reports, comparisons,
artifact descriptors and receiving. Location decimal/identifier fields remain
strings.

| Operation | Method |
|---|---|
| Persistent workspace identity and saved review catalogue | `geographyState()` |
| Exact review, complete history and source-derived report | `geographyReview(id, options)`, `geographyHistory(id)`, `geographyReport(id, options)` |
| Original request lookup and complete idempotent save | `geographyRequest(requestId)`, `geographySave(input)` |
| Exact revision pages and full source/row lookup | `geographyRows(input)`, `geographyPoints(input)` |
| Whole revision comparison | `geographyCompare(input)` |
| Saved comparison and native change pages | `geographyComparison(id)`, `geographyComparisonChanges(id, {native, offset, limit})` |
| Complete native artifact and file stream | `geographyExport(input)`, `geographyDownload(artifactId)` |
| Original local packet path | `geographyReceive({path})` |
| Complete streamed or in-memory ZIP bytes | `geographyReceivePacket({body, bytes})` |

Read the selected actual source edition's native operating guide for installation,
CLI, Applications and MCP receiving. This interface guide documents source behavior;
it does not claim that a native customer run has already completed.
