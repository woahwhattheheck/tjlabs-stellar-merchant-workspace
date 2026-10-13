# Retained author return worklists

The installed Material catalogue interface now retains complete recipient returns in one worklist for the original workspace. Open **Material catalogs → Returned customer reviews**. The worklist sits above the existing comparison and receiving controls.

## Complete working path

1. Select the original catalogue. Open each complete named recipient return and use **Compare with current catalogue**. Exact return bytes identify the item; comparing that file again reopens one retained item.
2. Choose Keep current or Adopt for each context, and record the receiving operator and reason. The browser retains unfinished choices alongside the full return and complete comparison. Search finds reviewer, catalogue, original return identity, customer description and receiving reason. The list displays twenty complete items per page.
3. Select **Open retained draft** to return to earlier work. This displays the saved comparison and choices without modifying the catalogue. Use the existing comparison button before preparing another request. When the actual comparison hash is unchanged, the existing choices remain. When it changes, every new row needs an explicit choice and the complete earlier draft stays in history.
4. **Complete retained draft history and original requests** exposes earlier drafts and exact saved request downloads. Opening an earlier draft preserves the current one in history. The saved request ID and bytes remain those of the original operation.
5. **Download complete author worklist** exports every return, current draft, earlier comparison and choice, exact request, and retained matching Journal outcome. **Merge a complete saved author worklist** validates the whole file before replacing in-memory state. Existing working choices remain current; differing imported drafts remain selectable in history. Different workspace identities and conflicting bytes for one request ID are rejected.
6. Finish adoption through the original **Download reviewed receiving request → Apply saved reviewed request** controls. A worklist is an authoring aid; it does not apply decisions. Complete all-keep outcomes remain in the original Journal; adopted receipt/history remains in the normal portable catalogue export.

A complete worklist is bounded at 128 MiB and 1,000 complete returns. Return/request limits remain the original 4 MiB and 8 MiB. No truncation, automatic retirement, catalogue replacement or history pruning is performed when a limit is reached. If a new draft cannot fit, Download complete author worklist preserves the last complete worklist and reports that boundary; Save author review choices still downloads the complete current draft separately. Download the complete worklist and use a separate author workspace where appropriate.

## Browser persistence and recovery

IndexedDB stores the complete validated worklist under the original workspace ID. Each write checks the previous storage revision in the same transaction. A stale tab cannot silently overwrite another tab. It retains its complete in-memory work, displays the conflict, and offers **Merge browser work**. That explicit action retains differing current/received drafts in history before saving a new revision.

Browser storage is specific to its origin and profile; a different loopback port, profile, storage clearing or private session can have different storage. Download the complete portable worklist for independent custody. A storage error leaves the complete current work available for download and keeps the unsaved-close warning. Unfinished saves are never described as durable. No catalogue/source bytes are sent to another service.

The original metadata-only pending request banner is unchanged. When the native result is uncertain, read its saved outcome first; otherwise select the exact original request downloaded from the worklist and retry its same ID. A fresh comparison is for new receiving only. Do not create another operation to recover an existing request.

## Existing operated course

Continue the original EE290/ISO receiving directory, original server and caller-owned browser Page. The maintained `receiveInstalledRecipientReturn` function in `receive-installed.mjs` now adds full worklist download, exact-file deduplication, browser cold reopen, portable merge, and rejection of unrefreshed adoption. It preserves the old complete author-review download/reopen, replays only the original completed request, and freshly exports the original author catalogue before/after.

The same course source manifest now includes `author-worklist.mjs` and `public/catalog-author-worklist.mjs`. Use a fresh caller-owned Page within the same original browser course; keep the original receiving operation and do not relaunch another case. A changed immutable installed-course source intent must be adopted explicitly by its current owner before continuing.

The server exposes both exact source modules, and the maintained Material selection includes the complete recipient directory plus the new installed browser asset. No new database schema, CLI transaction, MCP writer or hosted workflow is required.

## Actual rendered inspection

The producing peer must open/run the exact outgoing installed version and look at the actual desktop and narrow screenshots. Use the populated worklist, empty search, retained draft, stale comparison, local save, portable import, concurrent-tab conflict and original request recovery controls. Open the full downloaded worklist and reopened contents. Repair unreadable tables, clipped controls or overflow. Source review and DOM counts are not substitutes for viewing the actual product. This is the original equipped receiving course, not an additional browser job.


## Installed agents and complete worklists

An installed agent can now use the same complete author worklist downloaded from
**Material catalogs → Returned customer reviews**. The host declares that original
file once in the existing OpenSearch workspace connection's `materialInputs`.
Use its exact `path`, flat `name`, UTF-8 `bytes` and whole-file `sha256`; the
tool caller receives only an alias. The file can be up to128MiB and1,000 complete
returns. The small tool/CLI input contains only this alias and exact identities;
the existing2MiB control-request limit is unchanged.

The worklist's `workspaceId` must equal the actual original workspace's ID.
Do not substitute the configurable alias for that ID, or edit a worklist to
make it belong to another workspace. Cross-workspace catalogue receiving still
uses the original complete catalogue bundle workflow. The full original
worklist validator checks every return, comparison, historical draft, approved
request and retained outcome before reading or first applying its contents.

The installed commands are available through the existing
`opensearch-materials-client` entrypoint (or this repository's
`stellar-forge/mcp-merchant-operator/opensearch-material-cli.mjs`):

| Command | Complete behavior |
| --- | --- |
| `material-worklist-list --all-pages` | Page named returns, source hashes, current draft counts and every history/request/outcome count; optional original catalogue/search filter. |
| `material-worklist-record --all-pages` | Return exact Base64 byte pages for a selected complete original return, current draft, historical draft, approved request or outcome. Every page carries the full record identity. |
| `read-worklist-record` | Reassemble a selected record, verify its complete byte count/SHA-256 and UTF-8, then emit its exact original text on stdout. No partial record is presented as complete. |
| `material-worklist-preview --all-pages` | Compare a selected original return with the actual current catalogue using its unchanged read snapshot; pin the full comparison hash across pages. |
| `material-worklist-receive` | Apply or recover only an exact request already reviewed and retained in that worklist, through the original catalogue transaction and Journal. |

For each command use `--url MCP_URL --workspace ALIAS --input selection.json`.
Start with this small selection, using actual host-declared values:

```json
{"inputId":"author-worklist","expectedInputSha256":"<whole original worklist SHA-256>"}
```

List results supply `returnId` (SHA-256 of the exact original return text).
For a complete request record add `returnId`, `section:"request"`, `index:0`.
Historical drafts, requests and outcomes use zero-based indexes from their
retained order; current `draft` and `return` sections omit `index`.
For example:

```sh
opensearch-materials-client material-worklist-list --url "$MCP_URL" --workspace materials --input worklist-selection.json --all-pages
opensearch-materials-client read-worklist-record --url "$MCP_URL" --workspace materials --input selected-request.json > original-reviewed-request.json
opensearch-materials-client material-worklist-preview --url "$MCP_URL" --workspace materials --input selected-return.json --all-pages
```

The typed client exposes `materialWorklistList`, `materialWorklistRecord`,
`materialWorklistPreview`, `materialWorklistReceive`, and
`readWorklistRecord`. The last returns the complete verified text plus its
record/input/workspace identity. Byte pages are at most262,144 bytes; ordinary
summary and comparison pages retain the existing reply budget. Each read
rechecks the complete host-selected file identity, closes its owned descriptor,
and validates its full worklist. It does not keep an unbounded process cache.

To receive a request, preserve the same `inputId`, `expectedInputSha256`,
`returnId`, original `requestId`, and `expectedRequestSha256` (the exact
pretty-JSON request file hash returned by the record reader). The tool does not
turn a draft into approval, silently choose conflicts, or refresh a saved
request. A first application still checks the original complete comparison and
current catalogue inside the unchanged transaction. If the catalogue has
changed, explicitly refresh and review the return in the original author UI,
save its new request and complete worklist, then select that new original file.

After admission, the original Journal owns request recovery. An exact matching
request ID, request-file hash and return hash recovers its original native
outcome before opening the input alias. Thus an already-admitted request remains
recoverable if its worklist file or alias has been retired. A mismatched request
or return hash is rejected. This does not claim that the worklist is still
present; use the read commands separately to inspect its present file custody.
The worklist itself remains immutable during every tool call.

### Same completed receiving case

The maintained `receive-installed.mjs` adds a preparation helper and optional
MCP suffix to the same original directory/operation. Run only at the existing
owner's source-selection boundary, after the original offline/browser/native
return is complete; retain an already-running source generation and its intent.

```js
import {prepareInstalledAuthorWorklist, receiveInstalledRecipientMcp}
  from './products/material-catalog/recipient/receive-installed.mjs';

const prepared = await prepareInstalledAuthorWorklist({
  directory: originalDirectory, operationId: originalOperationId,
  workspaceId: actualOriginalWorkspaceId
});
// Add prepared.file to that SAME host's materialInputs as "author-worklist".
// Keep existing return/request aliases and the original caller-owned client.
await receiveInstalledRecipientMcp({
  client, directory: originalDirectory, operationId: originalOperationId,
  returnInputId: originalReturnAlias, requestInputId: originalRequestAlias,
  worklistInputId: 'author-worklist'
});
```

Preparation consumes the retained complete author working copy, original
comparison, request and completed native outcome from `RECEIVING.json`.
It saves one full `installed-author-worklist.json` and its immutable
`INSTALLED_AUTHOR_WORKLIST_INPUT.json` identity. It neither creates another
customer adoption nor invents a new review. Reentry requires those exact
original bytes, workspace and selected source.

The suffix reads all worklist summaries, reconstructs the full original request
through small byte pages, compares the full current return rows with the
existing direct-return path, and replays only that already-completed request.
It also recovers that request with an undeclared retired-input alias, then reads
the unchanged original Journal result. All earlier installed browser
desktop/narrow/download/worklist/cold-open steps remain present.
Caller-owned model/client/server and Page lifetimes remain explicit. Actual
native/rendered completion must be reported by that equipped original course;
source review alone does not claim it.
