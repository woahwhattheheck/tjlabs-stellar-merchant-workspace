# MPC managed store and HTTP contract

This service hosts the delivered MPC operating model. It does not replace the original planner, domain validation, reports or command history. The complete 26-file application remains under `app/`, with the same operating model, planning data, UI and offline IndexedDB behavior. Its maintained branch receiver includes the original launch-preparation and ordered-journal corrections, and the full embedded-source HTML is regenerated from that selection. `ADOPTION.json` retains the exact original predecessor and identifies the maintained source edition; the other 24 original application bodies remain byte-identical.

## Lifetime and initialization

Import `createStore` and `openStore` from `products/mpc-recovery-operations/store.mjs`.

`createStore({directory,id,title,createdAt,initialSnapshot})` creates one private physical store and returns its immutable identity. The physical `id` is a canonical UUID. `createdAt` is canonical UTC. The complete initial snapshot must pass original `Model.receiveSnapshot`; omission creates an empty original model with the explicitly supplied title/id/time. It does not fabricate a customer inventory. A supplied original snapshot retains its own portable workspace ID.

Creation records a complete hash-bound intent beside the destination under the maintained parent creation lease before creating the directory. Repeating identical creation resumes the same destination and baseline. Different inputs or an unrelated existing directory are rejected. A complete store is selected by `creation.json`; it contains schema `stellar-forge.mpc-recovery-store.v1`, physical id/directory, title/createdAt, immutable defaultBranchId and creationInputHash.

`openStore({directory})` takes the maintained Runtime `operationLease(directory/service.lock)` for its entire lifetime. It validates private real paths and complete active snapshots through the original model history. Only this held owner writes its store. A second owner cannot open concurrently. There is no replacement lock implementation or stale PID-file override.

The owner exposes synchronous immutable `identity` and `directory`. Call `store.close()` only after its HTTP server has drained. Closing rejects new work and waits for the existing serialized queue before releasing the original OS lease.

All public calls clone caller arguments before waiting on the owner queue. An asynchronous caller changing its input after invocation cannot alter the selected operation.

## Physical branches and the original portable model

A branch record has the existing browser shape:

- `schema: "mpc-browser-branch.v1"`, `id`, `label`, `storeId`.
- `workspaceId`, `revision`, `snapshotSha256`.
- `createdAt`, `updatedAt`, `origin`, `creationSha256`.
- `snapshot`: the complete original `mpc.recovery-snapshot.v1`, including every source byte, domain collection, command and original result.

A physical branch ID is independently selected. Receiving an exported workspace creates a different branch ID even when its portable workspace ID is identical. Branch summaries omit only `snapshot`. Store identifiers accept ASCII letters/digits and the delimiters dot, underscore, colon and hyphen; first character is alphanumeric. Original portable source and command identities remain governed by the original model.

The expected review basis is exactly `{workspaceId,revision,snapshotSha256}`. Snapshot SHA hashes the canonical complete snapshot, not merely a revision number. There is no implicit currently selected branch in server state.

Methods:

| Method | Input | Returned value |
|---|---|---|
| read | physical branch ID | Complete branch record |
| list | none | All branch summaries |
| create | `{id,label,snapshot,origin,requestId?}` | Complete first branch record |
| initialize | `{initialSnapshot,legacyRaw,preferredId?,requestId?}` | Complete original selection result |
| save | `{id,expected,snapshot,requestId?}` | Complete saved branch record |
| command | `{id,expected,command,requestId?}` | `{branch,result,replayed}` |
| proposal | `{id,expected,input,requestId?}` | `{branch,result,replayed}` |
| request | original request ID | Complete input/first-result receipt, or null |
| history | `{id,expected,offset?,limit?}` | Complete bounded page |
| report | `{id,expected?,kind,options?}` | `{branch,kind,result}` |
| exportBranch | `{id,expected}` | Original full portable packet |
| source | `{id,expected,sourceId}` | Exact original bytes and descriptor |
| close | none | Drained owner closure |

`save` validates the complete new snapshot and requires every earlier operation/result and the original seed to remain an exact prefix. A merely larger revision is insufficient. An equal revision must be byte-identical. The compare-and-save occurs within the same serialized owner operation as the atomic head publication.

`command.command` is the unchanged model command:
`{id,actor,at,expectedRevision,type,payload}`.
The original model recognizes an exact earlier command after later revisions. This same-command replay remains supported in the selected physical branch and portable workspace, returning the original result. An unknown command must match the current complete review basis. Reusing an existing model command ID with different arguments is rejected.

`proposal.input` is the original:
`{id,actor,at,name,origin,content}`.
The original proposal module validates complete planner content and the retained original requirement/acceptance registers. The result retains sourceId, complete proposal and reused status.

### Retry versus a fresh reopen

A supplied requestId is bound to the complete method and normalized input. Retry returns its first result, including the original branch snapshot, even if that branch has advanced later. It never silently redoes a successful operation against a new revision.

When omitted, a deterministic request ID is derived from the complete canonical method/input. This is useful for exact transport retries. The managed UI’s normal boot is read-only: identity, list, then read the selected physical branch. It does not issue initialize on each page open. Other clients invoking explicit initialization or browser migration use a new requestId for each deliberately new selection, retain it for transport retry, then call `read(returned.id)` when they want the branch’s current saved edition. Reusing an old initialization request represents replay, not a fresh selection. The same distinction applies after recovering an uncertain save: receive its original receipt, then explicitly read the current branch if it has advanced.

Legacy browser JSON is validated before adoption and its exact original UTF-8 text is retained as an immutable object. Its original hash selects one migration branch. Repeated receipt does not overwrite or merge later branch work. Any deletion of old localStorage bytes belongs to the UI only after confirmed managed receipt; this service never deletes browser storage.

## Durable publication

Complete snapshots, request inputs and first results are immutable content-addressed JSON objects. The compact `state.json` contains hash/byte references, branch indexes, migration identities and first-result request indexes. It does not embed source-file bodies in the head.

A mutation validates first, writes/fsyncs complete referenced objects, then atomically renames and fsyncs one complete head. The branch and its original successful receipt become visible together. A returned filesystem error around head publication is uncertain: the live owner refuses further operations and requires close/reopen of this same store. It does not report an uncertain write as absent or recreate its request.

Unreferenced objects left before a failed head publication are retained; they are not evidence that a domain command committed. A read of the original request index determines a committed first result. No cleanup of unrelated or incomplete source is performed.

Bounds are explicit: original model capacity is unchanged (8 MiB per source, 32 MiB total retained source and 96 MiB complete workspace); store objects are bounded at112 MiB, compact head at24 MiB, branches at256 and successful transport requests at20,000. Reaching a bound returns an error before head publication; no rows or sources are truncated.

## Reports, full paging and exports

History requires the exact expected triple on every page:
`{id,workspaceId,revision,snapshotSha256,total,offset,nextOffset,items}`.
Every item is one complete original operation with command, request hash, first result and history chain. Offset defaults0; limit defaults100 and must be1–200. Any later branch change causes a conflict before another page is returned.

Report kinds call the original functions: overview, serviceReview, acceptance, recoveryOrder, restoreDue, hurricaneStatus, incidentStatus, proposals, proposalPlanDraft, proposalCompare. They use the supplied original options and return complete results. Proposal comparison options are `{leftSourceId,rightSourceId}`; proposal plan options are `{sourceId,id,title}`. Report output includes the exact branch summary used.

`exportBranch` returns `{format:"mpc-recovery-portable.v1",sha256,snapshot}`, with the original full snapshot and canonical SHA. It captures the selected branch and exact expected review basis before asynchronous file delivery. The receiving application calls original `Model.receiveSnapshot`; it must select a new physical branch ID. The standalone downloaded application stays complete and offline.

## Authenticated loopback HTTP

`startServer({store,sourceDirectory,token,port,sourceSha256,renderPage?})` in `server.mjs` returns `{origin,close}`. sourceDirectory is the selected real `app/` directory, containing the original26files plus its source-selection. The lifecycle verifies that complete selection before starting this server. port0 selects a loopback port. The token is private, at least32characters, and never written into source, query strings or logs.

All API requests need `Authorization: Bearer <token>`. Except identity/state discovery, they also need:

- `X-MPC-Store-Id: <physical store UUID>`.
- `X-MPC-Store-Directory: <exact real directory>`.

The selected branch is always the route or input's physical id. Both Host and any Origin must match the actual loopback origin. No cross-origin access is enabled.

| HTTP | Route | Store operation |
|---|---|---|
| GET | /api/identity or /api/state | Immutable identity + sourceSha256 |
| GET | /api/branches | list |
| GET | /api/branches/:id | read |
| POST | /api/branches/create | create |
| POST | /api/branches/initialize | initialize |
| POST | /api/branches/save | save |
| POST | /api/branches/command | command |
| POST | /api/branches/proposal | proposal |
| POST | /api/branches/export | exportBranch |
| GET | /api/requests/:requestId | request |
| POST | /api/history | history |
| POST | /api/report | report |
| GET | /api/branches/:id/sources/:sourceId | exact original source bytes |

Source download query parameters are workspaceId, revision and snapshotSha256; the response includes x-mpc-source-sha256, x-mpc-source-bytes, x-mpc-branch-id and x-mpc-snapshot-sha256. The bytes are verified against the original model descriptor before delivery. No operator-selected filesystem path is read.

JSON responses are `{ok:true,result}`. Errors are `{ok:false,error:{code,message},notCommitted,requestId?}`. A true notCommitted is returned only after the original serialized writer reported a definite precommit rejection and the same original request lookup confirms absence. An unknown/native/filesystem outcome remains false. The client keeps original request identity until its outcome is reconciled.

GET / serves the optional exact managed-page renderer; other static routes expose only the fixed selected application file names. The renderer may adapt served UI custody while preserving the shipped original source. It must not put the bearer token into durable HTML. Server close stops new requests, closes idle connections and drains existing handlers; after a bounded connection drain it destroys remaining owned sockets and still waits for dispatched store work. The lifecycle then closes the store independently, releasing its original lease.

## Delivery status

These two implementation leaves and this contract were authored from the exact published original26-file MPC source and maintained Runtime lock module. Connected V8 parsed their full JavaScript bodies with static import/import.meta adaptation. This is source syntax evidence only. Filesystem durability, HTTP behavior and full managed receiving are exercised by the single managed MPC receiving course owned by the integration author; no duplicate runtime was launched for this contribution. The earlier standalone MPC11912 six-phase result and accepted654,095-byte archive remain evidence for their original edition.
