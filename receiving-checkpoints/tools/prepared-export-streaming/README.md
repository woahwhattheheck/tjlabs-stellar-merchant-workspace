# Complete prepared export streaming

This reusable receiver finishes `commons.complete-export-checkpoint-storage.v1` jobs whose `done` value is true. It validates the pinned metadata, all fragment SHA-256 values, all original member SHA-256 values and CRCs, the full export manifest and classic ZIP limits. Output ordering, UTF-8 flags, timestamps, file modes and compressed payloads match the maintained ordinary ZIP writer exactly. Source, current sessions, every historical edition and managed requests remain complete.

`streamPreparedExport(index, readTextObject, awaitedByteSink)` returns the final archive digest only after every sink write succeeds. Keep the sink provisional until that return. Each input object is limited to 4 MiB by default; metadata and the export manifest each to 16 MiB. One raw inflate output chunk is 64 KiB. Metadata remains proportional to member count. The function never assembles the complete ZIP, a complete base64 payload or the complete inflated member. A consumer that retains all sink bytes defeats that property.

`createChunkSink(writePart)` accumulates 487,500 archive bytes per independently encoded base64 part. The callback must finish actual durable publication before resolving. Call `finish(receipt)` only with the successful stream receipt; it publishes the final partial part and returns the complete output index. Failed writes poison this sink. Content-addressed objects from interrupted runs can be reused by a fresh run; they are never treated as a complete archive without its final index.

`deriveSourceSuccessor(index,read,changes,{sourceVersion})` replaces explicitly named existing `source/*` members and a `working/*_Editable.html`, with expected original hashes. It can also add an absent `source/*` member when the change explicitly sets `expectedSha256: null`; existing members require their actual original hash. Additions receive ordinary 0644 file mode and their own retained export group. Path collisions and protected current/history/managed paths are rejected. It reuses unchanged compressed object references, updates the export manifest, retains every original member, updates group/member counts, removes unreferenced payloads, creates a new identity and retains the actual original receiving provenance plus an explicit derivation. Publish returned new objects before publishing the new index, in the same object directory as the parent. For these maintained complete exports the codec is pinned Pako raw DEFLATE level 1. The final working HTML must be built from the new full source bank and the same original carrier. This operation does not rerun or relabel prior receiving execution.

Native Node 18+:

```
node finish-prepared.mjs --checkpoint /absolute/checkpoint.json --manifest-sha256 EXACT_SHA256 --output /absolute/Complete_Export.zip
```

The CLI pins exact index-file bytes, streams into an exclusive temporary file, hashes the written ZIP independently, then hard-links it atomically to the final name without overwriting different bytes. An existing exact output is reusable. A receipt accompanies the ZIP. No network or shell commands run.

`verify-prepared-stream.cjs` accepts a complete maintained text source bank and its real generated HTML. It compares the full ordinary/streamed ZIP, reopens every member, verifies fixed-size durable publication, arbitrary 4,099-character input fragmentation, precise source-successor output against a freshly built ordinary ZIP, and failure propagation. The receiver itself uses only maintained connected ZIP, UTF-8, incremental SHA-256 and pinned Pako. Their existing license notices remain in source.

`verify-source-addition.cjs` exercises an actual full native source manifest, mixed additions/replacements, unchanged retained request bytes, complete group coverage and fresh ordinary ZIP equivalence. It also checks explicit absent preimages and path collisions. Its focused result accompanies the maintained source; the earlier complete-source streaming course remains retained.

## Complete default ZIP codec

connected_gzip.cjs is the exact maintained, dependency-free raw DEFLATE/GZIP implementation required by connected_zip.cjs when callers use its ordinary default codec. The prepared streaming path retains its explicit Pako hooks. The included default-codec-result.json records actual default pack/read execution across the complete codec source, Unicode text, original binary bytes and an empty member.

## Durable Git archive parts

`publish-prepared-git.cjs` exports `publishPreparedToGit(index, readObject, api, options)`. It uses the same complete member stream and creates independently encoded base64 parts with the existing streamed archive schema. The injected Git adapter supplies `getHead`, `treeOf`, `createBlob`, `createTree`, `createCommit`, and `updateRef`. Every method returns its normalized SHA or acknowledged boolean. No credential is embedded.

Choose the exact branch head, archive directory, complete source index path and source index commit in options. The default decoded part size is 487500 bytes; sixteen acknowledged parts form each durable progress commit. Pass `extraFiles` for a plain README and reassembly command. The completed manifest and receipt are published only after the whole stream and output digest finish successfully.

On interruption, retain `error.publicationState` and pass it as `resumeState` with the recorded head. Its part references distinguish provider-acknowledged immutable blobs from the subset already attached to a branch commit. Replay verifies the exact prefix and reuses those blobs. Failed reads during prefix replay retain the unvisited acknowledged references. A lost update-ref response is reconciled against the actual branch head; another writer is never force-overwritten. `onProgress` receives each durable state; `onInterrupted` can preserve the latest small state independently.

The publisher does not replace the streaming core's complete original-member verification. Fresh final readback can reopen the resulting ordinary ZIP from its independently hashed parts using a range reader, or reassemble with the included native command.

A pending publication records its parent and exact next commit before updating the ref. If both the write response and reconciliation read are lost, a resumed run first compares the actual branch with those two known commits and adopts or completes the same update. Successful updates are freshly read before progress is acknowledged. A recovered completed publication retains its complete flag across further read failures and returns the same final head after exact source replay, creating no duplicate output commit.

After a whole runtime loss, read the latest committed progress.json at its exact commit. Construct resumeState with schema `commons.git-archive-publisher-state.v1`, the chosen branch/directory, that commit as head, and copy sourceIndex, sourceIndexHead, identity, extraFilesSha256, partBytes, parts and complete from progress. Set committedParts to parts.length, verifiedMembers to0 and pendingPublication to null. The complete replay verifies that exact committed prefix before adding any later output; uncommitted blobs can safely be recomputed. The final streamed manifest keeps the same independent part schema used by the ordinary ZIP range reader.

Final companion files are copied and bound by a sorted-path UTF-8 SHA-256 before streaming. That identity is retained in publication state, durable progress and the final manifest. A changed companion cannot be silently accepted when reusing a completed commit. Older incomplete states without the identity may adopt the chosen companions because no final companion publication exists yet; completed states and pending final commits require their original companion identity. If recovering an older completed publication, read its actual companions from the exact committed tree before deriving that identity.

## Emit prepared payloads, then reopen the ordinary archive

For complete retained histories, `streamPreparedPayloads(index, readObject, sink, options)` avoids a second inflation of every prepared member during ZIP emission. It checks every original encoded fragment and complete payload reference, canonical base64, exact packed lengths, archive layout and complete export manifest. It emits the same ordinary ZIP bytes. Its receipt explicitly records `memberVerification: "prepared-payload-identities"` and `requiresOrdinaryReadback: true`.

Use the existing `readCompleteExportRanges` on the resulting exact archive before delivering it. That independent pass checks actual local/directory layout, whole ZIP SHA, every original size/CRC/SHA and one-to-one manifest membership. The original `streamPreparedExport` API retains its full original-member validation and unchanged default behavior.

The native command composes the two operations:

```sh
node finish-prepared.mjs --checkpoint /absolute/checkpoint.json --manifest-sha256 EXACT_SHA256 --output /absolute/Complete_Source_Handover.zip --verification ordinary
```

This mode writes and syncs a provisional ZIP, reopens that actual file through exact ranges, and publishes it only after the ordinary read succeeds. Its final receipt includes the observed ordinary readback and marks that member verification complete. It keeps one encoded input fragment, bounded inflated chunks and directory metadata instead of allocating a complete ZIP. Existing calls without the optional flag keep the original behavior. Existing Git archive publication and active receiving runs are unchanged.

`verify-packed-readback.cjs` compares a complete maintained source bank and actual generated desk against the ordinary ZIP builder, independently reopens all members, and checks altered input, output failure and a deliberately false raw identity. The false raw identity demonstrates that the paired ordinary pass observes actual content rather than accepting prepared declarations.

## Git publication with ordinary ZIP verification

`publishPreparedToGit(index, readObject, api, options)` accepts `verification: 'ordinary'` in addition to the unchanged default `'full'`. Ordinary mode emits the verified prepared payloads into acknowledged immutable Git blobs, then reopens those exact blobs through the bounded range reader. It checks every original member's CRC32 and SHA-256, the complete export manifest and the ordered whole ZIP hash before publishing the complete manifest, receipt and companion files. Intermediate commits remain incomplete progress checkpoints until this readback succeeds.

For this mode, supply `api.readBlob(gitBlob)` returning the exact original UTF-8 base64 text stored by `createBlob`. The reader keeps at most two decoded parts; it never allocates the whole ZIP. The resulting receipt includes the ordinary readback summary and the returned `ordinaryReadback` contains every member identity. Member callbacks run on actual ordinary reopening, while `emittedMembers` records prepared emission separately.

The selected mode is pinned in publication state, progress and final manifest. Replay rejects a mode change before provider operations. Legacy states without a mode remain full-verification states. Recovery retains the existing pending commit, actual ref acknowledgment and exact companion-file binding; a complete replay rechecks the archive without issuing new writes.


## Durable Git metadata and restart recovery

The Git publisher writes `progress.json`, final manifest, receipt and named companions as separately acknowledged blobs. Tree requests contain only paths and immutable blob IDs. This keeps large structured metadata out of the tree request and the connector's returned representation. ZIP parts keep their original bytes, order and identities.

An interrupted operation retains metadata blob identities alongside part identities in `error.publicationState`. On retry the publisher reads each reused metadata blob and compares its actual text to the exact regenerated body before referencing it. An adapter without `readBlob` recreates that content-addressed blob. The existing pending commit, expected parent, actual ref acknowledgement, companion hash and verification-mode bindings remain active.

If the in-memory operation has disappeared, fetch `progress.json` at one immutable acknowledged commit, then recover:

```js
const {publishPreparedToGit,stateFromProgress} = require('./publish-prepared-git.cjs');
const state = stateFromProgress(JSON.parse(progressText), {
  head: pinnedProgressCommit,
  branch: originalPublicationBranch,
  directory: originalArchiveDirectory // ends in "/"
});
const result = await publishPreparedToGit(exactPreparedIndex, readPreparedObject, api, {
  ...originalOptions,
  head: state.head,
  resumeState: state
});
```

Use the original source index, pinned source-index commit, part size, final companions and verification mode. The publisher compares the actual branch ref and complete replayed part prefix before adding new output. The helper restores only the parts actually present in that committed progress file. Unpublished parts and member-verification counters are not inferred.

For the current connector, `partBytes: 1950000, commitParts: 8` uses 2,600,000-character base64 part blobs and keeps the ordinary reader's two-part cache at 3,900,000 decoded bytes. A 607,493,921-byte Distribution ZIP uses 312 such parts. Part sizing is an explicit operation choice and must remain unchanged on replay.

### Large retained metadata in the native finisher

The original Distribution checkpoint at `a7bc7e947b1ef7314ca7864854c25d2cc1503b8b` already has 21,500,531 bytes of metadata after 1,206 groups. The default 16 MiB metadata ceiling therefore cannot open that workload. `finish-prepared.mjs` now accepts positive bounded integer `--max-metadata-bytes`, `--max-manifest-bytes` and `--max-part-bytes` options. Defaults remain 16 MiB, 16 MiB and 4 MiB. Archive/raw/member ceilings remain bound by the original prepared checkpoint itself.

After the complete prepared index is produced, use the pinned input digest and the explicit required metadata allowance:

```sh
node finish-prepared.mjs \
  --checkpoint /absolute/prepared/checkpoint.json \
  --manifest-sha256 EXACT_COMPLETED_CHECKPOINT_SHA256 \
  --output /absolute/output/Distribution_Complete.zip \
  --verification ordinary \
  --max-metadata-bytes 67108864 \
  --max-manifest-bytes 33554432
```

The exact selected limits are recorded in the final native receipt. For Git publication use the matching `streamOptions: {maxMetadataBytes:67108864,maxManifestBytes:33554432}`. Both routes retain complete ordinary CRC/SHA/export-manifest validation before the final complete result. The native receiver continues the existing exact opening and actual desktop/narrow inspection operation described in repository `AGENTS.md`.
