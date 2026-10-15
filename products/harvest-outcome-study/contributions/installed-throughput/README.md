# Complete installed-study throughput

## Measured operation

The actual full Water authored study is 705,005 UTF-8 bytes. On the unchanged installed source from PR2152 head2355e8b1d35ee3f8ed6f88fc8445906d9be19b7e, a normal notes edit through managed model.plan plus the complete model.record response took 6,414 ms. With the three maintained replacements in this package it took 4,203 ms, a 34.47% reduction in this V8 run. An injected deterministic clock and random value made the complete 1,383,247-byte managed result byte-identical, SHA-256 c59939d94fc7ee108e496f340a360637f38d59f5f283a027ad8db8b32fa40679. This includes the complete source, retained history, request identity, receipt and returned state. The benchmark is an executed authored workload, not a field operator time measurement.

## Implementation

1. sha256.cjs preserves the exact pinned upstream implementation and adds a 16 MiB/4,096-entry LRU of successful immutable text digests. The cache key is the entire exact input text. Miss and hit return independent result records; mutable binary inputs remain uncached. Invalid input still follows the original checks.
2. host/codec.mjs retains the pinned SHA source inside its import-free transport module. Byte hashing uses that maintained implementation. Indexed UTF-16 traversal produces the original exact bytes, including the existing transport behavior for lone surrogate code units. Actual canonical study hashing still rejects malformed Unicode. The existing complete-text transport cache remains bounded and unchanged.
3. src/session.mjs uses originalSessions.byteLength for the existing session byte limit instead of allocating a whole encoded byte array solely to count it. Complete source/carrier validation and all size thresholds remain intact.

Profiling put CSV parsing at approximately 114 ms of the 6.4-second operation; no CSV cache was added. Original per-record and whole-study checks still execute. No record, history edition, observation or byte range is removed.

## Exact preimage and reproduction

Fetch Git blob a7b0147fe29bda7941893c003d99e7723d12fd22 from woahwhattheheck/tjlabs-stellar-merchant-workspace. Its complete Water_Operations_Study_Desk.html contains the181-file window.WATER_SOURCE_FILES array. Decode that array as a path-to-text map. The three baseline files are included here; verify them before replacement. The full course study and installed loader remain in that pinned whole source. Apply the files from replacement/ at their original relative paths. Update the receiving build's actual source manifest and generated source bank through its normal assembly.

profile.cjs exports profile(files). Use the real wall clock through its default Date.now; the recorded equivalence course injected the same clock/random for source-generated identities in both runs while preserving an independent wall-clock measurement. The profile drives the actual maintained host-course loader, model.plan and model.record. verification/codec-and-cache.cjs accepts {before,after,loadModule}; loadModule is the provided complete CJS bank loader. The output includes exact Unicode bytes, SHA padding boundaries, caller mutation isolation, eviction, malformed text and changed mutable binary input.

For Harvest, the SHA and codec replacements are product neutral. Apply only the same byte-count expression change to its own complete src/session.mjs; keep the Harvest schema, title and recovery identities. The full current Water/Harvest receiving courses remain the domain and lifecycle acceptance workloads.
