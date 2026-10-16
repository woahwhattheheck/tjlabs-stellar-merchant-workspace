# Native continuation of a retained Distribution export

The original source bank and native installed files contain exactly the same 975 files, but their map insertion order differs. The export identity and ordered source groups include that order. `continue-retained-distribution.mjs` reads the native files through the original verified source manifest, then reconstructs their original checkpoint order only after checking every member's exact byte count and SHA-256. It imports and runs the frozen product's own runtime and exporter. The helper lives outside the product source bank.

## Exact retained operation

- Prepared commit: `a7bc7e947b1ef7314ca7864854c25d2cc1503b8b`.
- Branch: `a74f/distribution-complete-prepared-20261016`.
- Prepared directory: `receiving-checkpoints/distribution-lot-order-study/full-complete-archive-prepared/`.
- Exact original checkpoint text: 938,089 bytes; SHA-256 `677591f9d85f809c4931533bf5c8256c7c2dce5d2fbdc34994ba2710b3d3cb1d`.
- Retained progress: 1,206 of 1,248 groups. Identity `202f25e907c6c85c8f63803b5a08dada032a21e52904083b351dd01465259b56`.
- Complete input commit: `4e4ccd3865ca3cb8a66d3c6abf10ac76068853fd`; directory `receiving-checkpoints/distribution-lot-order-study/throughput-complete/complete-course/`.
- Input manifest plus 20 parts: 12,705,810 bytes; SHA-256 `721d2942f5162aad05b1543d73a02c1aac2b8799a3ca5472109f26ad9319394c`.
- Complete input contains all 48 checks, 45 requests and 46 editions.

Use a separate worktree based on the prepared commit and materialize the exact complete input directory from its own commit. Fetch this maintained helper directory separately. Keep the original product files intact.

```sh
node /helpers/prepared-export-streaming/continue-retained-distribution.mjs \
  --product-root /worktree/products/distribution-lot-order-study \
  --input-manifest /worktree/receiving-checkpoints/distribution-lot-order-study/throughput-complete/complete-course/manifest.json \
  --input-root /worktree \
  --output /worktree/receiving-checkpoints/distribution-lot-order-study/full-complete-archive-prepared \
  --checkpoint-sha256 677591f9d85f809c4931533bf5c8256c7c2dce5d2fbdc34994ba2710b3d3cb1d \
  --max-archive-bytes 1073741824 \
  --max-uncompressed-bytes 2147483647 \
  --max-entries 65535
```

The runner takes a nonblocking Linux `flock`, restores and validates the full prepared checkpoint, skips the completed groups and computes the remaining groups. It writes new immutable content objects with file fsync and directory fsync before atomically replacing the checkpoint. Shared immutable base64 payloads are indexed once; every original ordered member still points to the same compressed bytes.

Every progress line includes the exact newly acknowledged checkpoint SHA-256. After interruption, use that latest checkpoint SHA with the same arguments. If interruption occurred after the atomic checkpoint rename but before the progress line appeared, compute the SHA-256 of the complete local `checkpoint.json` and select it explicitly. Restoration checks every referenced object and the original source/input identity before any continuation. A checkpoint already marked complete produces the final receipt without enumerating or recomputing groups.

Publish the completed checkpoint and only newly created objects on the same isolated continuation branch. Return its immutable head in the existing Distribution receiving operation. The native `native-continuation.json` receipt records the selected original checkpoint digest, final checkpoint digest, original input/export identity, full source count and complete group count.

## Ordinary ZIP and delivery

Run the maintained finisher from this helper directory, selecting the final checkpoint SHA printed above:

```sh
node /helpers/prepared-export-streaming/finish-prepared.mjs \
  --checkpoint /worktree/receiving-checkpoints/distribution-lot-order-study/full-complete-archive-prepared/checkpoint.json \
  --manifest-sha256 FINAL_CHECKPOINT_SHA256 \
  --output /output/Distribution_Complete.zip \
  --verification ordinary \
  --max-metadata-bytes 67108864 \
  --max-manifest-bytes 33554432
```

The actual retained metadata is already 21,500,531 bytes, so the explicit 64MiB allowance is required. The full source/input comparison completed separately and establishes 43,456 ordered members, 1,843,465,892 expanded bytes and 607,493,921 ZIP bytes. The final ordinary pass verifies actual local ZIP headers, decompression, CRC32, every member SHA, the export manifest and whole ordered ZIP SHA before final receipt publication.

The Git publisher can preserve the final ZIP with `verification:'ordinary'`, `partBytes:1950000`, `commitParts:8` and matching `streamOptions:{maxMetadataBytes:67108864,maxManifestBytes:33554432}`. That produces 312 part blobs, with a two-part decoded reader cache of 3,900,000 bytes. Its acknowledged `progress.json` supports fresh-host recovery through `stateFromProgress`.

Continue the existing equipped receiver's actual file opening, desktop/narrow views and reopened export inspection with the completed ordinary ZIP and working HTML.
