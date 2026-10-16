# Complete installed state read throughput

Distribution's retained operating state contains 14,708,154 serialized characters. Its exact state and workspace keys each require roughly 28 MiB under conservative UTF-16 accounting. The former 16 MiB caches never admitted either key. Repeated reads therefore recomputed the complete SHA even when every retained byte was unchanged.

The maintained Fleet, Water, Distribution and Procurement products now use a 64 MiB charge budget for each complete-text digest cache and validated-original interning cache. Digest caches retain at most 128 entries; validated originals retain at most 4,096. LRU eviction applies both limits. Oversized values are computed through the original implementation and remain unretained. The original study analysis cache remains at 16 MiB because the measured Distribution study plus analysis already fits.

Mutable callers serialize on each lookup. The complete serialized string is the identity. Original objects enter the interning cache only after the existing complete validation succeeds and freezes the original values. All history validation and hash algorithms remain authoritative. The diagnostic retainedBytes field reports the cache's accounting charge, not total JavaScript heap consumption. Each digest entry is charged two bytes per serialized UTF-16 code unit plus 128; interned keys and values are charged four bytes per code unit plus 256. The independent pre-existing carrier-validation and analysis caches retain their own limits.

## Actual complete-state comparison

| Product | Warm read before | Warm read after | Cold read before | Cold read after |
| --- | ---: | ---: | ---: | ---: |
| Distribution | 23,776 ms | 879 ms | 57,112 ms | 41,102 ms |
| Fleet | 285 ms | 278 ms | 12,149 ms | 12,132 ms |
| Water | 383 ms | 379 ms | 22,869 ms | 19,140 ms |
| Procurement | 553 ms | 524 ms | 28,136 ms | 22,102 ms |

Distribution's measured warm read improves 27.0 times. Its repeated complete state hash changes from 11,324 ms to 26 ms. Smaller retained states already fit the former hash budget, and their warm results are comparable. Every measured response and state hash matches the unmodified implementation. These are observations from the same V8 receiving runtime, not a universal latency guarantee.

The complete Distribution continuation starts with the original 14,046-node compact checkpoint, covering 464,583,012 logical retained bytes. It completes 244 actual Merchant calls in 359,034 ms, reaches all 48 accumulated checks and retains 45 requests and 46 editions. It exercises every page, all 39 raw and operating families, exact source bytes, decision/order/lot readers, a real row edit and its post-cutoff preview. Full original timings and source/input identities are in measurement.json.

## Maintained product integration

Both source inventories and the ordinary generated HTML are refreshed for all four complete products: Fleet 194 files, Water 236, Distribution 975 and Procurement 664. Each generated source bank contains the complete original application, including native source opening. Historical delivered archive editions retain their original source identities.

## Reproduce on an existing native runtime

Check out the recorded baseline and this successor in separate directories. Fetch the existing exact compact checkpoint and its parts. Then run:

```sh
node receiving-checkpoints/tools/complete-state-read-throughput/run.mjs \
  --before /absolute/baseline/products/distribution-lot-order-study \
  --after /absolute/successor/products/distribution-lot-order-study \
  --checkpoint /absolute/checkpoints/receiving-checkpoints/distribution-lot-order-study/before-pinned-reads/manifest.json \
  --checkpoint-root /absolute/checkpoints \
  --product distribution \
  --out /absolute/results/distribution-performance.json
```

The baseline is 0d8220ba9d894d253917e65d57c35d4e8d80655a. Distribution's complete checkpoint is pinned at d12d388c53e71a345796eeb6a440c4fcbb5b62ff, with manifest path receiving-checkpoints/distribution-lot-order-study/before-pinned-reads/manifest.json. Its compact SHA256 is 3328bcc851776c14f862fe1e1a6197a5a1596527403d28c677e6d3a084a3982e. The runner verifies complete source inventories and checkpoint fragments before using them. It also accepts the existing gzip-wrapped Procurement checkpoint and direct complete compact graphs. Results include real same-object mutation, stale carrier and retained-original rejection comparisons. Existing result files are preserved.

GitHub Actions remains disabled. Use the existing native receiving operation for ordinary application opening and rendered interaction.
