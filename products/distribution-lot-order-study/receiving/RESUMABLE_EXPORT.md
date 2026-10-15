# Complete Distribution source export

The ordinary buildDistributionLotOrderStudyExport stays synchronous and complete. createDistributionLotOrderStudyExportJob exposes whole-group progress and verified checkpoints for the same exact output. The source bank, complete managed input digest, installation, carrier, records and edition order bind the job identity. Retained inventory prevents reconstructed history/branch replay on resume. Exceptions poison the live job until restored from its last successful whole-group checkpoint.

Run `node receiving/run-resumable-export.mjs --input-manifest /absolute/manifest.json --input-root /absolute/repository --output /absolute/export-directory`. The native receiver verifies all complete source/input fragments, persists immutable compressed objects, acknowledges durable writes before checkpoint.json, and resumes from verified fragments. It retains one createPreparer cache per job. Metadata fragments preserve complete Unicode scalars. Missing fragments reject recovery.

The full prepared checkpoint also supports streaming finalization through receiving-checkpoints/tools/prepared-export-streaming on main. streamPreparedExport verifies each original member while delivering fixed-size output parts to an awaited provisional sink; the final receipt permits publication. This avoids a second complete ZIP allocation during large retained-workload delivery.

Upstream resumable source: F0C95V7RMAB edition complete-export-resumable-inventory-interruption-20261015,16files/91247bytes/SHA03c0a7022e486d10521c56f29e8894719428d9a99c7888238511ab5aaff76294. Immutable payload/checkpoint cache: commit6d1e099a618d37641f12ff943a061f3fe23723bc. Original Distribution emergency schema and every prior export path remain unchanged. Complete ZIP populations retain their original configured capacity limits.

## Whole-workload capacities

The resumable API accepts optional archiveLimits with maxBytes, maxUncompressedBytes and maxEntries. The default capacities are512MiB ZIP,1GiB original bytes and60000members. Explicit capacities are validated against classic ZIP limits and included in the exact resume identity; changing them requires a new complete job. Select them from the full retained workload. Native flags are --max-archive-bytes, --max-uncompressed-bytes and --max-entries. Final member readback uses the same selected checkpoint capacities. Prepared streaming retains one input fragment/output part while processing archives larger than a second complete in-memory ZIP should be allocated.

## Complete native source and streaming finish

The native source reader opens source-manifest.json, verifies each original file, and adds that manifest itself. The inventory excludes the generated outer HTML and itself; SOURCE_MANIFEST.json is included. This avoids a self-reference while retaining every native source file inside the handover.

run-resumable-export.mjs now uses that same moduleSources reader and, after all groups are durably prepared, invokes native/finish-prepared.mjs with the exact checkpoint-file hash. The final ZIP streams through the validated original members into an exclusive temporary file and publishes only after independent file hashing. No complete ZIP byte array is allocated. Existing different output is preserved. To prepare without the final stream in one process, pass --finish false; finish later with the exact returned checkpoint hash.

The source-successor helper supports explicit absent source members with expectedSha256:null, while existing replacements need the exact prior hash. The final working HTML must be rebuilt from the complete new bank and the original selected carrier. Original execution sources and prior saved work remain in the retained history.

The complete retained-history job defaults to 1 GiB of uncompressed member bytes and 512 MiB of archive bytes. These capacities include every retained source, request, edition and branch; flags can explicitly choose different classic-ZIP capacities. Capacity values form part of the exact job identity and must remain the same when resuming an existing checkpoint.
