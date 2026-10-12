# Selected merchant-delivery installation receiving

This phase supplies the actual installed product needed by the existing seller and customer Applications continuation. It belongs to the original operation `SCF-MANAGED-SF98-DELIVERY-E49D-20261012`. It neither restarts the managed/direct business journeys nor creates another seller or customer store.

The selected product is the merged standalone commit `8b08a9333af070df0e96b6f09f6612eb07eab1ad` in `woahwhattheheck/tjlabs-stellar-merchant-workspace`. The original `merchant-delivery` recipe carries seller `merchant-delivery`, customer `delivery-receiving`, and `merchant-console` Applications providers. It resolves 23 commands and 38 exports. The existing Applications phase remains the owner of Review → Save → Start → Open, customer editing, exact receive replay and reopen.

## Place it in the existing operation

Run this phase after the managed and direct receipts actually say PASS and all their completion/closed fields are true. The module checks the original receipt schema, operation, managed receipt hash, managed directory, seller store and transfer fingerprint. Expected completion fields from source are not accepted as execution evidence.

1. Preserve the original managed output and direct output.
2. Supply an existing matching READY installation if its owner returned one.
3. Otherwise supply the exact original distribution bootstrap and its original private Git repository. The receiving controller owns that source placement.
4. Run this phase inside the same admitted native operation.
5. Pass its saved `binding.installedRoot` to the unchanged Applications continuation only after `state === "PASS"` and `ownedProcessesClosed === true`.

The module is also directly importable:

```js
const result = await runDeliveryInstallationPhase({
  sourceRoot: "/absolute/receiving/applications-source/bootstrap",
  repository: "/absolute/receiving/applications-source/source-git",
  managedOutput: "/absolute/receiving/run-native",
  directOutput: "/absolute/receiving/run-native/single-release-receiving",
  output: "/absolute/receiving/installation-receiving",
  operation: "SCF-MANAGED-SF98-DELIVERY-E49D-20261012",
  sourcePin: "8b08a9333af070df0e96b6f09f6612eb07eab1ad",
  installedRoot: null,
  node: process.execPath,
  python: "/absolute/selected/python3",
  npmCache: "/absolute/existing/npm-cache",
  nodeHeaders: null,
  offlineSource: false,
  signal
});
```

Write the same arguments, without `signal`, into a private JSON context file for the command:

```sh
node experiments/merchant-delivery-installation-receiving/phase.mjs --context /absolute/receiving/installation-context.json
```

Use the selected actual Node executable for that command. Put the same Node and Python on the child environment's PATH: the original runtime workspace uses `python3` and `npm`. The phase verifies those Node/Python identities before starting a new installation. It does not alter PATH or copy a dependency tree.

The returned object is `{installedRoot, sourceRoot, receiptFile, receipt, binding}`. CLI progress is JSON lines; the last successful line includes the actual binding and receipt path. Read `output/receipt.json` after the Node child has closed. Keep stdout/stderr through close so no final result bytes are lost.

## Required source and dependency inputs

The bootstrap source and Git repository have distinct roles.

- `sourceRoot` contains the selected original distribution/runtime-workspace modules and their real import/resource closure. The phase checks the seven original builder/installer/profile/model/storage entry bodies before importing them. Existing bootstrap dependencies may be referenced by the original source receiver; this phase does not install them.
- `repository` is a real absolute Git repository containing the exact selected commit and tree. Its original Git alternates/remote configuration must remain usable by the detached worker. A directory of copied source files alone cannot satisfy `openGitSource`.
- `offlineSource:true` asks the original Git reader to use only existing objects. If required selected blobs are missing, acquire them in that same repository and reopen the original source-build request.
- `offlineSource:false` permits the original Git reader's configured missing-object acquisition. This uses its existing private source repository and original promisor remote. The phase does not select another remote, copy credentials, rewrite a donor checkout, or change its refs.
- npm is always `offline:true` with the explicitly supplied, already populated cache. The cache must contain `_cacache` and the complete transitive graph for the resolved profile. A directory's existence is only a precondition; the original npm operation decides whether the graph is available.

The selected full profile is:

```json
{"native":true,"features":["mcp","openapi","schema"],"operator":true,"pins":{}}
```

The exact source manifests resolve these dependencies:

| Dependency | Selected version |
| --- | --- |
| @stellar/stellar-sdk | 16.3.0, the declared compatible baseline |
| @x402/core | 2.28.0 |
| @x402/extensions | 2.28.0 |
| @x402/mcp | 2.28.0 |
| @x402/stellar | 2.28.0 |
| @modelcontextprotocol/sdk | 1.32.1 |
| jose | 6.2.12 |
| re2js | 2.8.6 |
| yaml | 2.9.1 |

The native profile label selects the original native payment libraries. None of these selected declarations carries the runtime installer's compiled-native marker. Local C headers are therefore not a prerequisite of this exact profile. Leave `nodeHeaders:null`. The original installer still owns import, dependency version, host and native readiness checks.

The host requires Linux, Node 22.16 or later, Python 3.11 or later, `flock`, npm, and a Git version supporting `--no-lazy-fetch`. The original resolver can impose a higher minimum from its selected package manifests and remains authoritative. No hosted Actions execution is involved.

## Original source → package → installation

The phase uses the original `runtime-workspace/model.mjs` without a replacement installer or reporting ledger:

1. `sourceBuildsReview({repository, ref, selection:"merchant-delivery", offline, python})` retains the exact recipe, distribution inputs, application providers and review UUID.
2. `begin({operation:"source-build", requestId:review.requestId, reviewId, selectionSha256})` invokes the existing Git reader, distribution builder, archive verifier and source catalog.
3. `sourceBuildsDownload(reviewId)` rechecks the actual completed archive; the read handle closes immediately.
4. `review({archiveId, selection})` derives the exact full runtime profile from that captured archive.
5. Original `prepare` and offline `install` requests create and finish a private runtime. Each complete request is saved in the phase receipt before `begin`.
6. `inspectRuntimeInstall({load:true, source:true})` and original `handoff(runtimeId)` verify the actual READY runtime.
7. The phase checks the selected source recipe and 19 concrete seller/customer/Applications files, then saves the complete installation binding.

A supplied READY installation takes the existing-installation branch. It still receives the full original source/import/profile checks. A supplied installation that fails verification is retained for its owner to resolve; the phase does not silently substitute a new one.

The private runtime-workspace here retains installation commands only. The later Applications workspace can attach this same runtime through its original model. The original SF82 seller store and SF98 received customer workspace remain those referenced by the completed business receipts.

## Interruption and same-operation recovery

The receipt schema is `scratch.merchant-delivery-installation-receiving.v1`. Its binding includes:

- installedRoot and original sourceRoot;
- exact source commit, selected recipe and package version;
- original installationId and profileId;
- dependency lock SHA256;
- runtime-install/profile/manifest file hashes;
- original source archive path, size and SHA256;
- full source-derived dependencies and verified product file identities.

The phase retains `requests`, ordered `preparations` and `installs`, native progress, original results and recovery decisions. A missing response is reconciled from the same saved native request before dispatching anything else. The same complete phase inputs and original output directory remain selected on restart.

The original source-build operation supports completion of interrupted request publication and recovery of queued, interrupted or failed build/catalog stages. It retains the same source review, native UUID, archive/output and Git identity.

The original generic preparation supports fresh-directory recovery. After the original worker releases its kernel lease, the phase inspects its retained preparation, entry, profile and archive. It calls original `recover` into a new directory when that intent is usable, or prepares the same reviewed archive/profile into a new directory when failure preceded a usable preparation. Previous source and state remain intact.

An interrupted or failed installation resumes on the same runtime directory through a subsequent retained original installer request, only after the prior worker releases. The original installer's own inherited kernel lease remains authoritative if npm survived its parent. It can adopt completed retained work or continue its recorded dependency/native stage. The phase does not rewrite installation state, unlock a live owner, delete node_modules, or manufacture success.

A generic native request whose publication is incomplete and has no valid state is preserved with `ORIGINAL_REQUEST_PUBLICATION_INCOMPLETE`. The selected model does not expose the source-build initialization recovery for arbitrary requests; the phase does not fabricate those records. Keep that exact record for its original source-owned repair. Do not start a competing install against its runtime.

If a full initial RuntimeWorkspace creation was interrupted before `workspace.json`, the phase may retain only its own inspected empty initialization: original private empty child directories and bounded original pending UUID files, with no application/runtime IDs or issued requests. It saves the exact inventory before moving the whole partial directory, fsyncs the parent, and continues original `createRuntimeWorkspace`. Completed or unexpected state always reopens or stops for inspection.

The original workers are detached by design. Closing the model is not proof of child closure. The phase observes the exact worker process identity plus worker, build and installation kernel leases for its retained requests. It drains every actual live owner before ending its receiving lifetime, including after an abort or operation wait timeout. Periodic progress keeps the observed original owner visible; a receipt-write failure does not escape this drain. An unavailable owner observation is retried, since it cannot establish closure. No timeout cancels a native worker.

The default per-operation wait is 30 minutes. Cleanup has no deadline while an actual original owner is alive. `drainTimeoutMs` defaults to two minutes and applies only to a retained QUEUED publication with no live owner observed. That unresolved publication returns INCOMPLETE, `ownedProcessesClosed:false` and its exact `pendingOwners`; it does not establish cancellation or rule out a delayed start. The enclosing controller must reconcile its original process/start custody. The controller may set `operationTimeoutMs` and `drainTimeoutMs` in the retained context before first execution.

## Allocation and evidence

The phase starts no browser or merchant. It follows the two original receiving stages and precedes the one Applications browser, so those peaks are sequential. It reuses the populated cache and source donor instead of copying them.

The current whole receiving declaration is an **estimate**, not measured installation use: 1024 MiB memory plus 256 MiB reserve, 1024 MiB cumulative work space, 30 MiB record/output space, and the owner's existing 64 MiB disk reserve. This includes the preceding original receiving scope and room for build materialization, captured archive/catalog, prepared source, private dependencies and retained recovery history. Original admission must verify actual writable allocation; a counter alone does not establish it. Tmpfs allocations also consume the host memory limit.

This code is a source-owned continuation. Its publication, parse and API review are not a native installation claim. The first real execution must retain the original source-build result, archive SHA, resolved profile, installer output, final READY inspection, kernel-owner closure and the separate Applications result. The source receiver/controller owns those physical results and the one admitted operation.
