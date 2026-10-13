# Zotero library and Research operator

Capture or import an original Zotero metadata library, review a collection project, and deliver the selected evidence into an existing Research dossier. The complete handover retains the Zotero source files and revision history together with every linked original Research dossier. A receiving operator can edit that original Research record and pass the complete progressed workspace to the next operator.

This product uses the existing Research source-bundle receiver, dossier history and portable format. Zotero acquisition and local source intake have explicit coverage records.

## Install the selected product

Use Linux and Node.js 22.16 or later. Workspace storage must support SQLite locks, exclusive file creation, atomic rename and fsync. Keep private operating data outside the source checkout.

From this repository, build the committed selection with the maintained builder:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . --ref HEAD --selection zotero-research \
  --out /absolute/private/packages/zotero-research
~~~

Keep the archive, manifest, selected commit, original selection ID and returned SHA-256 together. Install that exact archive:

~~~sh
npm install --ignore-scripts --offline --omit=optional /absolute/path/to/package.tgz
npx --no-install starforge zotero --help
~~~

The Zotero operator itself uses Node's built-in modules and the original Research engine. It adds no npm runtime dependency. The broader Research selection retains the existing Documents, Pipelines, merchant, buyer and runtime tools; those capabilities keep their own declared runtime requirements.

Before package installation, replace `starforge zotero` in the commands below with:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/zotero/cli.mjs
~~~

The product CLI uses `--name value` arguments. The separate receiving programme uses `--name=value` arguments.

## Open saved work and the original Research store

~~~sh
starforge zotero serve \
  --state /absolute/private/zotero-workspace \
  --research-dir /absolute/private/original-research \
  --connection-file /absolute/private/zotero-connection.json \
  --port 0
~~~

The server prints its nonsecret origin and private connection-file path. Open the browser URL from that private file. Its capability fragment is removed from the address bar and kept in the browser document's memory. API clients load the same current private connection and verify the workspace and instance identities.

The supplied Research directory is the original dossier store. Create the target dossier and question through the maintained Research application before selecting them in **Research delivery**. The optional current shared Research host navigation is being composed by its original host owner; the standalone command already opens this complete product against the selected store.

Closing and reopening the same workspace creates a new current connection. Existing source, project, handoff and request identities remain. Use the current connection file when attaching another client.

## Select an original library or receive saved documents

In **Libraries**, save the numeric user or group library ID, its title, source and reuse terms, selected collection keys, descendant policy and explicit trash choice. The source profile retains only an optional environment-variable name for the API key. Supply its value through the selected host environment.

**Capture and intake** starts a capture tied to that exact profile revision. It reads original collection and item pages in order, retaining each complete response before advancing. Page headers, total counts, original keys, library versions and the final versions probe must agree before a complete edition is published.

Backoff and Retry-After are retained in the capture record. Resume a waiting capture when its displayed time is eligible. **Restart source attempt** preserves the prior pages and starts another attempt on the same capture record after the library changes. Cancellation retains the existing cursor and source objects. Replaying a prior control UUID cannot cancel a successor attempt.

The official API can omit the default `format=json` and `include=data` values
from its next-page link. The capture reifies those two documented defaults and
continues the same original JSON/data request. Explicitly different values,
unknown parameters, duplicate query keys, changed library/path, noncontiguous
cursors and changed source versions remain errors. The original response's
`Link` header stays with its complete retained page.

A complete consumed HTTP 200 response that fails header, page or pagination
validation is retained under that capture's `rejectedDocuments`, with its
original body hash, request URL, response headers and reason. Its cursor and
accepted-page counts stay at the previous committed page. Source-attempt restart
retains that rejected custody with the earlier attempt. After adopting corrected
source, use the existing capture's **Resume** action and original workspace;
a new reviewed resume action gets its own UUID. Receiving and subsequent export
carry the full saved capture revisions and original response objects.

To import files that have already been acquired, use the browser or wrap the exact originals:

~~~sh
starforge zotero documents \
  --library-type groups --library-id 123456 \
  --items /absolute/original-items.json \
  --collections /absolute/original-collections.json \
  --source-reference "Original library, retrieval and reuse context" \
  --out /absolute/private/document-set.json

starforge zotero import \
  --connection /absolute/private/zotero-connection.json \
  --profile profile:ORIGINAL_PROFILE_UUID --profile-revision 1 \
  --file /absolute/private/document-set.json \
  --request-id ORIGINAL_IMPORT_UUID
~~~

Choose the actual saved profile and an original UUID before dispatch. Retain the request and exact file identity for continuation.

| Recorded coverage | Meaning |
| --- | --- |
| CAPTURED_LIBRARY | All selected live Web API v3 metadata pages and the final probe agree on the original library version and counts. |
| RETAINED_DOCUMENT_SELECTION | The exact imported source documents are retained. Absence in these files does not establish remote deletion. |
| CAPTURED_PROTOCOL_EXERCISE | A declared local HTTP protocol exercise supplied the source pages. It is not a live Zotero library. |

Native item types, creators, tags, relations, parent keys, collections and unknown metadata fields remain in the original documents and full edition. Attachment metadata identifies the original attachment record; it does not establish that the file contents were acquired.

## Review collection projects and changes

In **Editions**, inspect the original coverage, page inventory and complete metadata. **New project** selects that edition and loads its exact collection scope before Save becomes available.

In **Projects**, review the selected collection tree, revise the saved scope, choose original item keys, record evidence classifications and notes, and add findings linked to those keys. Saves carry the original expected revision. A revised source profile with the same document bytes retains its own selected title and scope.

Use **Changes** to compare two saved editions. The full downloadable comparison includes original added and removed items and collections and complete before/after values at changed JSON paths. Arrays, native relations, tags, memberships and unknown fields are retained. The display preview is bounded; the original files and full reports are complete.

## Deliver to the existing Research dossier

In **Research delivery**, select the original dossier and question, then the reviewed project revision. Preparation pins the exact target, project revision, complete bundle and digest. Review the original Research preview before receiving.

The source bundle carries the full original page custody and project lineage, a complete original JSON file for each item in the selected view, and the reviewed evidence and findings. The maintained Research receiver owns normalization, revisions and saved source-bundle history.

Large collection views keep the original Research limits. If embedding every
item again makes the manifest exceed 1 MiB, the bridge uses a compact manifest.
Each citation's `originalFile` names its complete item JSON in the same source
bundle. `metadata.originKey` resolves that item's exact source-page entries in
`zotero-project-lineage.json`. Bibliographic titles, authors, URLs, DOI values,
item keys/versions/types, selections, full decision notes and findings remain
in the manifest. Its abstract preview uses 128, 64 or zero characters to fit;
the full abstract and every unknown field remain in the original item file.
The custody source identifies this projection and its complete lineage file.

Small handoffs retain their existing manifest representation. Blank native item
titles get a readable display name from their original type/key; original item
JSON stays unchanged. Views still need the receiver's source-count, full-file
byte and complete-bundle bounds. An oversized view reports the precise
`ZOTERO_RESEARCH_MANIFEST_LIMIT` instead of discarding source records.

Download the complete prepared handoff through the existing **Research delivery**
view or `zotero download --kind handoff`. Its `files` entries provide each
original filename, byte count, SHA-256 and complete base64 body. Those exact
files resolve the compact citations independently of a running operator.

After receiving, retain the handoff ID, source digest, original Research edition and resulting dossier revision. A lost reply continues with the same handoff and request UUID. Changed input under that UUID is rejected.

Original Research reports and portable exports remain available through its existing browser, CLI and client. The [Research operating guide](../research/OPERATING.md) and [complete receiving guide](../research/RECEIVING.md) cover those downstream workflows.

## Export the complete operator

**Receiving** creates a complete workspace packet. It includes all native records, original request receipts, source objects and every linked completed Research dossier through the original dossier export.

~~~sh
starforge zotero export \
  --connection /absolute/private/zotero-connection.json \
  --request-id ORIGINAL_EXPORT_UUID \
  --out /absolute/private/complete-zotero-research.json
~~~

Keep the complete byte count and SHA-256 returned by the command. An accepted export UUID returns its original exact file even after later edits. Use a new UUID to publish a later edition. The export reports an unavailable linked original Research store rather than omitting its history.

Before creating a new portable file, export validates every immutable record
hash, contiguous revision chain, original head and saved request. A damaged
native index/history therefore fails before an invalid export UUID/file is
published. Preserve the original workspace and its source objects for repair;
the normal receiver applies the same strict history and object checks.

Environment reference names are retained. API-key values, current browser capabilities, live locks and process handles are not exported.

## Receive, edit and pass the work onward

Select a new private receiving directory:

~~~sh
starforge zotero receive \
  --state /absolute/private/second-operator \
  --file /absolute/private/complete-zotero-research.json \
  --request-id ORIGINAL_RECEIVE_UUID

starforge zotero serve --state /absolute/private/second-operator --port 0
~~~

The directory must be empty or owned by this exact packet and receiving request. A durable receiving marker precedes writes. Complete object hashes, contiguous revisions, original heads, source-bundle links and Research histories are checked. Continue an interrupted receive with the same original directory, packet and UUID.

Normal cold reopen finds the original received Research store. The local receiving binding connects inherited original workspace/dossier identities to that store without rewriting the immutable handoff receipts.

Edit that dossier through its original Research operator, reopen the same Zotero workspace, and export with a new UUID. The export checks the original inherited history prefix and includes the receiving operator's subsequent revisions. A third operator uses the same receiving command with a separate destination and request. The original dossier ID, source files, review history and later edits travel together.

The browser also supports named second-operator receiving. Its active child belongs to that exact packet and local parent. Repeating the same accepted receiving request reopens that child instead of creating another store.

## Use the typed client and complete files

~~~js
import {
  createZoteroClient,
  loadZoteroConnection
} from '@tokenjunkielabs/starforge-merchant/zotero/client';

const client = createZoteroClient(
  await loadZoteroConnection('/absolute/private/zotero-connection.json')
);
try {
  await client.verify();
  const view = await client.invoke('project.page', {
    id: 'project:ORIGINAL_UUID', revision: 3, offset: 0, limit: 50
  });
  const exported = await client.exportWorkspace('ORIGINAL_EXPORT_UUID');
  // exported.bytes contains the complete body after SHA-256 verification.
} finally {
  client.close();
}
~~~

The conditional ESM export retains the original `client.d.mts` declarations. The [native API contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/zotero/NATIVE_CONTRACT.json) gives exact profile, capture, project, comparison and handoff arguments. File downloads verify the entire returned body.

## Continue the original operation after interruption

| Interrupted work | Continue the saved operation |
| --- | --- |
| Page acquisition | Resume the same capture and retained profile revision after the native backoff time. |
| Library version change | Restart the source attempt on that capture, retaining its earlier complete pages. |
| Project save reply | Reuse the original request UUID and expected revision; inspect its retained result. |
| Research receiving reply | Reopen the same handoff, original bundle digest and request. |
| Export reply | Recover the exact accepted export UUID and file; do not rebuild it from later history. |
| Local file publication | Reuse an identical existing file; preserve a different destination file. |
| Independent receiving | Use the same original packet, destination and receiving UUID. |
| Workstation restart | Open the saved directory and its new current private connection. |
| Later customer delivery | Export a new request from the progressed workspace, including original received Research edits. |

Every public workspace operation participates in the admitted/drained lifecycle. Shutdown rejects later starts, cancels active captures, drains admitted work and owned receiving children, and releases the writer. The original external Research store remains with its owner.

## Source, licenses and receiving status

This standalone source adoption retains the complete 25-file product from [Commons PR2190](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2190), merged at `927fa76d698d480ae70b65c35d8e14222bb743b6`, authored `e367973d205a0f6ffa035a011c35c95f15b5837f`. Existing Research engine and shared-host sources in this repository remain their original maintained implementations.

The source-owned distribution contribution declares both CLI commands, six module exports, exact browser assets and the unchanged upstream fixture's COPYING file. The complete selected recipe derives from the current original Research workspace selection, adding this product and guide.

[Native receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/zotero/NATIVE_RECEIVING.md) is one restartable complete HTTP/SQLite/CLI/browser programme. It uses the unchanged upstream software fixture, explicitly authored local protocol responses, sixteen views and three generations of original Research receiving. Its native outcome remains pending at this source publication. No installed or live-account success is asserted by the source merge.

[Zotero v3 basics](https://www.zotero.org/support/dev/web_api/v3/basics), [syncing](https://www.zotero.org/support/dev/web_api/v3/syncing) and [types and fields](https://www.zotero.org/support/dev/web_api/v3/types_and_fields) are the primary protocol references. Full original source identities and notices are retained under the product's reference directory.


## Customer-agent operation of the same saved library

The installed selection now discovers the source-owned `zotero-workspaces`
Merchant provider. [Customer setup](../../stellar/scf-starforge-20261009/sf30-seller-sdk/zotero/MERCHANT_SETUP.md)
connects managed or owned aliases to the existing `workspace.sqlite`, original
private listener and Research binding. The browser, CLI and customer agent use
the same saved library and original operations.

The fifteen tools cover current library/project views, exact saved mutation
requests and replay, capture cancellation, configured original-file import,
complete immutable exports, chunked file reading and original named receiving.
Source imports retain all original bytes in the project. A lost response is
resolved by the same native UUID and retained request, including its full source
digest. Capture admission and actual source completion have separate states.

A named receive returns an admitted `childWorkspace` alias. Read and edit that
actual child with the same tools, continue its original Research handoff, export
the complete progressed project and reopen it independently. The original
parent owns its child listener; the agent keeps only the matching attachment.
Failed startup, receiving or close keeps the same native database/lease owner
available to retry, preventing replacement listeners while cleanup is pending.

The typed `./zotero/operator-client` export offers the same saved operations
and full-file receiving for customer code. Controls stay within 1 MiB, source
imports within 64 MiB and the unchanged complete transfer within 256 MiB.
Retained file reads stream the actual owned file descriptor in chunks up to
196,608 bytes and check its original length and SHA256.

Continue the existing SDK12 / Root2D58 OSF group479248 case, library
version11212: 5,503 items, 18 collections and 58 original API responses. Its
completed original library/browser receiving remains the base; the new
customer-agent course is specified in the same native guide and follows that
saved project. Original source terms, attachment access and Research history
remain attached to the actual source.

## Bring customer edits back into the author’s project

[Returned projects](../../stellar/scf-starforge-20261009/sf30-seller-sdk/zotero/RETURNED_PROJECTS.md) completes the same library workflow after independent receiving. Freeze an exact project revision as an editable project-delivery, let the customer continue its own source-linked decisions and findings, and import its returned file into the original project. The browser, CLI and customer agent share the same saved return records.

Comparison uses the exact common project-history hash and original source edition, including a previously applied incoming branch. Independent changes are combined; divergent title, description, collection scope, item decisions, notes, finding content/deletions and finding order have explicit local, returned or base choices. Save the review before applying. The exact current project and reviewed preview are checked again in the original transaction, which preserves the whole incoming source and appends both the authored project revision and accepted return result. A later author edit requires fresh review; repeating an accepted UUID returns its original immutable result.

The dedicated project-delivery contains the selected project’s history, referenced source editions, profile history and complete original source objects. Use the full workspace export when linked Research dossiers must travel too. After reconciliation, continue the existing Research handoff from the explicitly selected new project revision and deliver/reopen the complete progressed workspace. The full practical customer course is [Commissioning](./COMMISSIONING.md); it uses the existing SDK12 / Root2D58 OSF programme and the original source and commercial ownership.
