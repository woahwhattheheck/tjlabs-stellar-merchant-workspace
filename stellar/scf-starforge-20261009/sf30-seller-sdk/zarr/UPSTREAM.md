# Original Zarr engine and interoperability inputs

This component retains complete original inputs and uses the upstream Zarr Python implementation to interpret their metadata and decode their chunks. The workspace, review, projection and receiving code is this repository's MIT-licensed application. Upstream software and example files retain their own original notices.

## Native engine

| Item | Exact selection |
| --- | --- |
| Repository | https://github.com/zarr-developers/zarr-python |
| Release | 3.4.1 |
| Source commit | `246fa20c397af5e8bfaa2958100a09fea329193e` |
| Original license | `LICENSE.txt`, Git blob `1e8da4d2424241744037944bdf0a54ff458b3524` |
| Declared interpreter | Python 3.12 or later |
| Application decoder | Original `zarr.storage.LocalStore(read_only=True)`, `zarr.open(mode="r", use_consolidated=False)`, and `Array.get_basic_selection` |

The complete original license is included as [upstream/zarr-python-LICENSE.txt](upstream/zarr-python-LICENSE.txt). Original source is available at [the pinned engine commit](https://github.com/zarr-developers/zarr-python/tree/246fa20c397af5e8bfaa2958100a09fea329193e). The installation locks in [requirements.txt](requirements.txt) record the actual complete dependency selection used for this product's original receiving. Each saved inspection and result records its actual Python and package versions.

The application never implements a replacement chunk codec, rechunks an imported store, rewrites its metadata, trusts stale consolidated metadata instead of per-node metadata, or substitutes generated arrays for retained provider bytes. This does not imply that every codec or extension in every possible Zarr store is installed: unsupported original native types and codecs produce a retained native error.

## Full original examples

The original input repository is [zarr-developers/pizzarr](https://github.com/zarr-developers/pizzarr/tree/d94b221b707dd78cd89105567a99bd9d883d6b5c), commit `d94b221b707dd78cd89105567a99bd9d883d6b5c`. The example ZIPs are original repository files. They were not regenerated for this receiving. Original generators are retained to establish expected complete values and coordinate order.

| Original relative path | Bytes | SHA-256 | Git blob |
| --- | ---: | --- | --- |
| `inst/extdata/fixtures/v3/zarr_python_v3.zarr.zip` | 8275 | `43ac1cf05e4e22e5ff4afe2e4178471828afb9a6b9d4762188bbef2e5b030470` | `f976ac01b34e279a105261673476384a9761b8e7` |
| `inst/extdata/fixtures/v2/data.zarr.zip` | 27209 | `9c23c0fc04cd80b1cea2a8e69837d788e51d4e62717a8564825eab7e65a99f43` | `b649d8f105f2511af20225e54617317a2843a079` |
| `inst/extdata/fixtures/v3/generate-v3-zarr-python.py` | 3591 | `73b3ff873e54be40f95a57d8190a008e4d1aa0ed38c69e8eb9e414a9e4e972c6` | `758e024f48c6ac8af191b8572a6dfdd0381f0d7b` |
| `inst/extdata/fixtures/v2/generate-v2.py` | 4457 | `24ee2053530d50dfc341e4786afc83e44143d30ecc286b7daddb779cac427a99` | `31d3fd0142420902190758496a436c5326f5de06` |
| `LICENSE.md` | 1111 | `3d1d7ec489e072f227d87a2f01d0c9c14c168dcfdf743541fb64b2064d3bcdaa` | `26f1a9e48bd0f501dafe34fdf045d8ba7ad021f1` |

The complete original example bytes and their license are kept together under `examples/pizzarr/`. The original `inst/extdata/fixtures/v2/` and `v3/` directories are mapped to the included `v2/` and `v3/` directories; `SOURCE.json` binds each included path to its full original repository path, source URL, Git blob, byte count and SHA-256. Do not remove the original license when copying that example envelope.

The v3 generator documents its original generating engine separately from the currently selected 3.4.1 reader. The reader's version is not attributed to the older generating run.

## What the actual source-native receiving establishes

The original v3 ZIP contains 11 arrays and the original v2 ZIP contains 29. This product's original complete source run read all 40 arrays, compared all 338 cells and source coordinates with the original generators, saved explicit accepted reviews and scalar projections, and retained a further four-cell strided selection from the v3 temperature array.

The full native result includes every original import, selection, run, review and freeze identity, source hashes and actual runtime. Its private source packet retains all original metadata and chunk bytes, both raw ZIPs, the complete saved history and included source-workspace application. The independent source receiver reopened the original workspace ID and revision without decoding the arrays again.

These are interoperability example observations. They are not environmental measurements, a customer production dataset, an acquisition of a newer observation, or evidence of a completed paid transaction. In particular:

- The temperature metadata uses kelvin. The selected float32 values preserve their native binary precision; there is no temperature conversion.
- Pressure values retain the original pascal metadata.
- The `-9999` fill values are retained data, not automatically changed into nulls.
- C-order and F-order storage preserve the original source coordinates; public row traversal is explicitly recorded.
- The source stage and the later publisher/browser/Applications receiving have separate recorded completion states. The final complete receiving receipt is the authority for those later stages.

## Customer inputs

An operator may use a complete authorized Zarr directory or a complete authorized ZIP. A directory import retains every regular file and checks the entire inventory before and after copying. A ZIP import retains the exact original archive first, binds an optional declared SHA-256 to those retained bytes, and validates all expanded members before native inspection.

The source declaration records where the original file came from. It does not create a remote provider account or acquire a paid store. Store credentials remain in the operator's existing acquisition process and are not placed in a scalar dataset, public merchant projection or client package.
