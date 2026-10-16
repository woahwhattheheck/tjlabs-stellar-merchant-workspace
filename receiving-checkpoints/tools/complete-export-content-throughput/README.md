# Complete export content throughput

The complete Fleet, Water, Distribution and Procurement exporters now retain exact immutable serialized text in a 64 MiB charged-content LRU cache with at most 4,096 entries. The charge includes two bytes per UTF-16 code unit, the corresponding packed payload size and 256 bytes of bookkeeping. Packed bytes already belong to the archive, so this charge is conservative; it is not a total JavaScript heap measurement.

Every mutable value is freshly serialized before lookup. A cache hit copies the actual original immutable archive member. The ordinary ZIP layout, compression level, source bytes, per-member hashes and checkpoint identity remain unchanged. Oversized entries continue through the ordinary exporter, and restoration starts with a cold content cache. Cache statistics expose admission, hits, misses, eviction and reused uncompressed bytes.

## Whole retained workload comparison

`measure.cjs` executes the actual maintained production exporter and ZIP builder for all source files, working files, current data, archived studies, retained requests and editions. It observes the actual packed bytes from every compression, plus every original member reused by the production builder. The ordered result binds member path, mode, size, packed size, compression method, CRC and packed SHA256. With the same fixed ZIP timestamp and manifest this identifies the complete ordinary archive bytes without retaining a second assembled archive allocation.

Both executions receive the same immutable source bank and compact input graph. Only the executed export module differs. This isolates the cache change from the deliberately changed source files embedded in a newly delivered application. Baseline and successor module identities are recorded separately. Complete input references are in `inputs.json`.

The measurement subtracts only the independently measured packed-byte observation hash time from wall time. It retains compression work, serialization, original hashing, all complete group generation and wrapper overhead. These are observations from the receiving runtime; compare avoided compression and reuse counts alongside elapsed time.

`mutation-course.cjs` additionally assembles and reopens ordinary ZIPs containing each complete retained state twice, then an edit to that same object twice. This covers immutable-content reuse, mutation invalidation, original member CRC/inflation and whole ZIP equality. Distribution's actual state crosses the two-key cache capacity and exercises eviction.

## Run with the exact ordinary source application

Use the pinned baseline HTML and candidate export source identified in `inputs.json`, plus the complete original compact checkpoint and all of its parts. A maintained checkout only needs the runner and its existing complete-state runtime helpers:

```sh
node receiving-checkpoints/tools/complete-export-content-throughput/run.mjs \
  --source-html /absolute/original/Distribution_Lot_Order_Study_Desk.html \
  --candidate-export /absolute/successor/host/export-core.mjs \
  --checkpoint /absolute/retained/complete-course/manifest.json \
  --checkpoint-root /absolute/retained \
  --product distribution \
  --out /absolute/results/distribution-export-comparison.json
```

The `--source-html` mode extracts and verifies the complete original bank, its exact byte order and every native source inventory member. It accepts both direct and gzip/base64 embedded banks. Alternatively use `--source /absolute/product-directory` to read its complete lower inventory. Use exactly one source mode. Directory mode follows inventory order; use HTML mode when reproducing the exact embedded bank order used by the cloud comparison.

The native runner preserves a completed baseline beside the requested output as `<out>.baseline.json`. On restart it verifies product, complete source, complete input, executed baseline, completed status and the actual full ordered member-list digest before reusing that result. Existing result files are preserved. Compact direct graphs, gzip/base64 packets and verified ordered fragments are supported. The actual source-opening body was executed on all eight baseline/successor applications; `native-html-results.json` records their full identities.

Completed cloud measurement phases are preserved immediately as lossless gzip/base64 result packets on `a74f/complete-export-comparison-<product>-20261016`, under this directory's `results/` path. Each packet carries both complete uncompressed and compressed SHA256/byte counts. Final complete comparisons are joined into this maintained delivery when finished.

GitHub Actions remains disabled. The original equipped receiving operation handles native opening and the exact generated application's rendered controls.

## Completed comparisons

| Complete retained product | Members | Expanded bytes | ZIP bytes | Baseline ms | Candidate ms | Avoided compression bytes |
|---|---:|---:|---:|---:|---:|---:|
| fleet | 10835 | 312821215 | 106979782 | 582260 | 575713 | 1190889 |
| water | 21636 | 507737934 | 167485621 | 1062301 | 1045065 | 3883334 |
| procurement | 25391 | 898158673 | 306563493 | 1593306 | 1557292 | 32472127 |

All three completed comparisons have identical complete ordered member identities, including each actual packed payload SHA256. The measured elapsed improvements are 1.1% for Fleet and 1.6% for Water and 2.3% for Procurement in this runtime. Most historical payloads are distinct, so the full archive improvement is modest even though exact repeated content is reused more often. Distribution remains running; its completed phases are independently durable on its result branch. All four full-state ordinary ZIP mutation/reopen courses passed (`mutation-results.json`).
