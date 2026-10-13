# Original operation history

The **Operations** desk searches and pages the original Runtime operation records.
It retains the actual request IDs and links to their existing Runtime, managed
home, Application, source build, Python operation, transfer and image controls.

## Find, inspect and continue existing work

Use **Find an operation** for an operation name, UUID, runtime, Application,
managed home, image or source-build identifier. Every word must match the
retained descriptor. Select **Active or queued**, **Needs attention** or
**Completed**, and optionally the actual runtime. The counts describe the whole
workspace; the matching count describes the current filters.

A page contains at most 20 rows. **Older operations** advances from the last
original creation-time/UUID pair. **Previous page** restores the previous boundary;
**Latest results** restarts the live selection. New work and status changes remain
visible in the current workspace. A filter change starts a new page selection.

**Open complete operation** reads that original operation through the existing
status reader and exposes its complete result, errors and original record fields.
**Download complete operation JSON** saves the complete opened API record.
**Open original worker output** uses the existing complete output reader. The
original row actions continue the same retained request or open its owning
workflow. Starting another command remains an explicit action in those controls.

Filters, page boundaries and the selected operation are saved per workspace in
this browser. Reopening reads the current original operation again. A late
response from a different workspace or selection cannot replace the visible
record. A failed refresh preserves the previously opened complete record and
shows the read failure; **Refresh selected operation** retries that same read.

## Native and authenticated API use

```sh
starforge runtime-workspace operations --workspace /private/runtime --filter attention --limit 20
starforge runtime-workspace operations --workspace /private/runtime --query managed-run --runtime-id RUNTIME_ID
starforge runtime-workspace operations --workspace /private/runtime --filter attention --cursor ORIGINAL_NEXT_CURSOR
starforge runtime-workspace operation-status --workspace /private/runtime --operation-id ORIGINAL_UUID
starforge runtime-workspace output-sources --workspace /private/runtime --operation-id ORIGINAL_UUID
```

The existing workspace model adds `operationHistory({query, filter, runtimeId,
limit, cursor})`; HTTP callers use authenticated `GET /api/operations` with
those query fields. Limits are whole numbers from 1 to 100. A cursor binds the
workspace, normalized search, status filter and runtime. Continue with the same
selection and its returned `nextCursor`; changing a selection starts without a
cursor. Returned fields include `items`, `total`, `matched`, whole-workspace
`counts`, `hasMore` and `nextCursor`. Items are compact original descriptors;
`resultAvailable` and `commandResultAvailable` identify retained full results.

The existing `state()` and `GET /api/state` remain full by default.
`state({operationDetail:'summary'})` or the matching HTTP query requests compact
operation descriptors. The browser uses compact activity outside the Managed,
Images, Transfers and Source Builds panes; those consumers continue requesting
their existing complete results. The selected operation always uses the
original full `operationStatus`/`GET /api/operation-status` endpoint.

## Source reuse and current observations

Only unchanged original JSON bytes are reused. Each read opens the original
path with the existing no-symlink admission, validates a regular file within
4 MiB, and checks the opened file's device, inode, size and nanosecond change
times before returning a cached value. A changed file is read and decoded in
full, with a second opened-file identity check. Missing optional records remain
missing. Invalid JSON, file replacement or a native read error follows the
existing observation-error path.

The cache retains at most 128 original records and 8 MiB of source bytes per
open workspace, with least-recently-used eviction. Closing that workspace
clears it. Full legacy callers receive detached values. Compact reads copy
descriptor fields and never return cached result bodies.

The original four-slot operation reader continues sharing in-flight reads and
running current process/lease probes. It still rereads a RUNNING state after its
probe and observes a newly completed state. Cache reuse cannot establish worker
liveness, grant a mutation, bypass a lease or change a recovery request.

## Continue the existing native receiving operation

The existing `receiving/APPLICATION_INPUT_SETS_RECEIVE.mjs` programme now
includes `receive_original_operation_history` after reopening its complete
original workspace and Application. Invoke the same original command, case
directory, companion folder, runtime and browser paths. Existing completed
phases remain retained, and the new phase uses that restored native history.

Other current Runtime receivers can import
`receiving/OPERATION_HISTORY_RECEIVE.mjs` and call
`receiveOperationHistory({page, model, outputDirectory})` on their already
opened actual workspace. The helper does not create jobs or history fixtures.
It traverses actual history, reads the authenticated API, operates search and
paging when present, downloads a complete selected original record, reopens the
selection and records desktop/390px screens. Its temporary failed-read route
only exercises the browser's existing retained-value behavior; native records
and commands remain untouched.

All returned source hashes, complete JSON, download bytes and screenshots stay
under the caller's original private output directory. Zero-operation workspaces
are recorded as such. A returned `AWAITING_OPERATOR_VIEW` means the saved
screens still need to be opened and inspected. Keep the same receiver and join
its actual viewed result into the original Runtime thread.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Before calling any customer/prospect-facing application, website, dashboard, demo, report, presentation or export ready, open/run/render the exact outgoing version, look at the rendered screen or its actual screenshots, and operate the important user controls. Inspect the actual screenshare width and narrow/mobile width where relevant, populated/empty/loading/error states, downloads/exports and reopening. Capturing screenshots without viewing them is insufficient. Code review, DOM counts, HTTP 200, unit checks and another worker's approval do not replace seeing the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk; do not run broad suites or build a verification product.

Include this complete instruction in delegated assignments and the active owner-controlled policy, boot, build and receiving guidance those workers actually read. Preserve all other owner controls and original operation identities. Leave historical records and third-party/vendor policies intact. Do not force restarts, create watchers or revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999

