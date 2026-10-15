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
