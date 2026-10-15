# Complete prepared export streaming

This reusable receiver finishes `commons.complete-export-checkpoint-storage.v1` jobs whose `done` value is true. It validates the pinned metadata, all fragment SHA-256 values, all original member SHA-256 values and CRCs, the full export manifest and classic ZIP limits. Output ordering, UTF-8 flags, timestamps, file modes and compressed payloads match the maintained ordinary ZIP writer exactly. Source, current sessions, every historical edition and managed requests remain complete.

`streamPreparedExport(index, readTextObject, awaitedByteSink)` returns the final archive digest only after every sink write succeeds. Keep the sink provisional until that return. Each input object is limited to 4 MiB by default; metadata and the export manifest each to 16 MiB. One raw inflate output chunk is 64 KiB. Metadata remains proportional to member count. The function never assembles the complete ZIP, a complete base64 payload or the complete inflated member. A consumer that retains all sink bytes defeats that property.

`createChunkSink(writePart)` accumulates 487,500 archive bytes per independently encoded base64 part. The callback must finish actual durable publication before resolving. Call `finish(receipt)` only with the successful stream receipt; it publishes the final partial part and returns the complete output index. Failed writes poison this sink. Content-addressed objects from interrupted runs can be reused by a fresh run; they are never treated as a complete archive without its final index.

`deriveSourceSuccessor(index,read,changes,{sourceVersion})` replaces explicitly named existing `source/*` members and a `working/*_Editable.html`, with expected original hashes. It reuses unchanged compressed object references, updates the export manifest, removes unreferenced payloads, creates a new identity and retains the actual original receiving provenance plus an explicit derivation. Publish returned new objects before publishing the new index, in the same object directory as the parent. For these maintained complete exports the codec is pinned Pako raw DEFLATE level 1. The final working HTML must be built from the new full source bank and the same original carrier. This operation does not rerun or relabel prior receiving execution.

Native Node 18+:

```
node finish-prepared.mjs --checkpoint /absolute/checkpoint.json --manifest-sha256 EXACT_SHA256 --output /absolute/Complete_Export.zip
```

The CLI pins exact index-file bytes, streams into an exclusive temporary file, hashes the written ZIP independently, then hard-links it atomically to the final name without overwriting different bytes. An existing exact output is reusable. A receipt accompanies the ZIP. No network or shell commands run.

`verify-prepared-stream.cjs` accepts a complete maintained text source bank and its real generated HTML. It compares the full ordinary/streamed ZIP, reopens every member, verifies fixed-size durable publication, arbitrary 4,099-character input fragmentation, precise source-successor output against a freshly built ordinary ZIP, and failure propagation. The receiver itself uses only maintained connected ZIP, UTF-8, incremental SHA-256 and pinned Pako. Their existing license notices remain in source.
