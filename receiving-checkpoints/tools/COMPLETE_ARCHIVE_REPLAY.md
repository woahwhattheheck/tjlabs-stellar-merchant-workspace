# Complete retained archive replay

This command runs the checked-out product's actual installed exporter against a complete retained workload and independently reads every archive member. It opens the compact ordered-subtree checkpoint without expanding the whole historical JSON object. Each original request and edition is materialized only when the exporter or verifier needs it. Product source is loaded through its checked manifest.

Use Node 20 or later and a fresh checkout of the final merged product source. Fetch the existing receiving branch, then restore only the tools and the selected workload directory into that checkout:

```sh
git fetch origin a74f/installed-receiving-checkpoints-20261015
git restore --source=origin/a74f/installed-receiving-checkpoints-20261015 -- receiving-checkpoints/tools receiving-checkpoints/water-operations-study/full45-compact receiving-checkpoints/fleet-availability-study/complete-course
node receiving-checkpoints/tools/run-complete-archive.mjs products/water-operations-study receiving-checkpoints/water-operations-study/full45-compact/manifest.json ../Water_Complete_Retained_Export.zip
node receiving-checkpoints/tools/run-complete-archive.mjs products/fleet-availability-study receiving-checkpoints/fleet-availability-study/complete-course/manifest.json ../Fleet_Complete_Retained_Export.zip
```

Run one large archive at a time. Each output path must be new. The command checks every compact part, the whole compact identity, original expanded-workload identity fields and complete request/edition counts before executing the product's maintained archive driver. That driver verifies every ZIP member's CRC and SHA, every maintained source, the exact working state, all requests and editions, and all historical study identities. Progress is written to standard error. Successful output is a complete ZIP and a neighbouring JSON result with byte count, SHA, member counts and actual elapsed stages. Publication uses a private temporary file, file synchronization and an exclusive final link; existing output files remain intact.

For a previously generated archive whose parts are already preserved in the receiving branch, use:

```sh
node receiving-checkpoints/tools/restore-complete-archive.cjs receiving-checkpoints/PRODUCT/ARCHIVE/manifest.json ../New_Complete_Export.zip
```

The restorer verifies canonical base64, each declared part identity and the complete reconstructed ZIP identity. Its manifest explicitly selects whether part hashes bind the encoded text or decoded bytes, supporting the preserved Harvest archive and the later Water/Fleet transfer format.

The maintained source is supplied for execution in the existing equipped receiving operation. V8 source compilation and supplied-adapter course results are recorded separately from actual Node, filesystem, concurrency and browser execution results.
