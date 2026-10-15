# Complete Distribution source export

The ordinary buildDistributionLotOrderStudyExport stays synchronous and complete. createDistributionLotOrderStudyExportJob exposes whole-group progress and verified checkpoints for the same exact output. The source bank, complete managed input digest, installation, carrier, records and edition order bind the job identity. Retained inventory prevents reconstructed history/branch replay on resume. Exceptions poison the live job until restored from its last successful whole-group checkpoint.

Run `node receiving/run-resumable-export.mjs --input-manifest /absolute/manifest.json --input-root /absolute/repository --output /absolute/export-directory`. The native receiver verifies all complete source/input fragments, persists immutable compressed objects, acknowledges durable writes before checkpoint.json, and resumes from verified fragments. It retains one createPreparer cache per job. Metadata fragments preserve complete Unicode scalars. Missing fragments reject recovery.

The full prepared checkpoint also supports streaming finalization through receiving-checkpoints/tools/prepared-export-streaming on main. streamPreparedExport verifies each original member while delivering fixed-size output parts to an awaited provisional sink; the final receipt permits publication. This avoids a second complete ZIP allocation during large retained-workload delivery.

Upstream resumable source: F0C95V7RMAB edition complete-export-resumable-inventory-interruption-20261015,16files/91247bytes/SHA03c0a7022e486d10521c56f29e8894719428d9a99c7888238511ab5aaff76294. Immutable payload/checkpoint cache: commit6d1e099a618d37641f12ff943a061f3fe23723bc. Original Distribution emergency schema and every prior export path remain unchanged. Complete ZIP populations retain their original configured capacity limits.

## Whole-workload capacities

The resumable API accepts optional archiveLimits with maxBytes, maxUncompressedBytes and maxEntries. The default capacities remain 256MiB ZIP,512MiB original bytes and60000members. Explicit capacities are validated against classic ZIP limits and included in the exact resume identity; changing them requires a new complete job. Select them from the full retained workload. Native flags are --max-archive-bytes, --max-uncompressed-bytes and --max-entries. Final member readback uses the same selected checkpoint capacities. Prepared streaming retains one input fragment/output part while processing archives larger than a second complete in-memory ZIP should be allocated.
