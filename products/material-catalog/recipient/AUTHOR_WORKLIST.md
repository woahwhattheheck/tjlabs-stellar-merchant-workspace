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
