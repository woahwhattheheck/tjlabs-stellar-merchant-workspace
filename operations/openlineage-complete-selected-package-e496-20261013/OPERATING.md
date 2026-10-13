# Complete OpenLineage selected package

This delivery supplies the finished installable source archive for `openlineage-operations` at commit `09a13eab2f6cd302ca4d6b1ad2222dc09154aa8d`. It carries the existing OpenLineage application, Service Levels and Quality source, merchant host and console, Runtime Applications, complete selected workers and their declared runtime dependencies. The archive can be received without a Git clone or another source-package build.

## Receive the complete archive

Download this directory's archive, `receive.py` and unchanged `runtime-unpack.py` together. Python 3.11 or later is required for the maintained verifier. Select a new absolute package directory:

```sh
python3 receive.py --out /absolute/openlineage-package
```

The original verifier reads the compressed archive, validates its complete manifest, checks every original Git object and SHA-256, and extracts only its declared regular files with their original permissions. The returned JSON identifies the archive, original commit, package directory and source root. Reopen the same received package with:

```sh
python3 receive.py --out /absolute/openlineage-package --resume
```

This verifies every existing source byte and permission and rejects missing or additional files. The original package remains editable; use a separate working copy for edits when you need to retain an unchanged verified installation.

## Prepare and install the original runtime

The product's declared minimum is Node 22.16.0. The portable OpenLineage workspace uses Node builtins; the complete merchant installation also has original pinned dependencies for native, schema, OpenAPI, MCP and the operator UI. Preparation uses the maintained original installer:

```sh
python3 receive.py --out /absolute/openlineage-package --resume \
  --node /absolute/existing/node \
  --prepare-runtime /absolute/openlineage-runtime

node /absolute/openlineage-package/source/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/openlineage-runtime

node /absolute/openlineage-package/source/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/openlineage-runtime --load --source

node /absolute/openlineage-package/source/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/openlineage-runtime -- openlineage --help
```

Use the original installer's dependency adoption/offline transfer where the equipped receiver already has those exact dependencies. The archive carries the complete source and dependency declarations; installed third-party dependency binaries are acquired or adopted by that same maintained runtime.

The full operational guide travels inside the package at `source/products/openlineage/OPERATING.md`. `source/products/openlineage/INSTALLED_RECEIVING.md` covers the original installed Quality course. The original Service Levels installed programme is independently published at commit `e4aec5552d6421c55c49a7ef751211ed2b6fe7f6` under `operations/openlineage-service-levels-installed-e496-20261013/`.

## Continue the existing Service Levels customer case

Use this archive as the complete selected source input to the existing original installed programme. Preserve operation `SCF-OPENLINEAGE-SERVICE-LEVELS-BBBD-20261012`, workspace `74c371a0-9689-41d4-bcf2-3f0f57f5bebe`, revision 13 and all 13 original operation IDs. The original retained checkpoint and source remain in the private original case. Run its original preparation once, carry its exported state through the selected installation, then complete the desktop and 390px Service Levels desk, all twelve assessment reports, merchant tools, explicit reconnect, exact policy replay and independent receiving.

The package operation remains `OPENLINEAGE-PACKAGE-EFFICIENCY-E496-20261012`. Prepared-package receipt and native customer result are distinct records. Bind the original caller to this archive's exact digest and complete receiving result before continuing its existing save/installed phases.

## Exact completed package

| Item | Value |
| --- | --- |
| Source commit | `09a13eab2f6cd302ca4d6b1ad2222dc09154aa8d` |
| Selected source files | 889 |
| Package regular files | 893 |
| Source bytes | 12266084 |
| Complete unpacked package bytes | 12659769 |
| Gzip archive bytes | 3234205 |
| Archive SHA-256 | `a739bbcb03447cdd8eade1d97d033944313c4f09a1266938cfdf40c624df947b` |
| Manifest SHA-256 | `7cda4b8e47a5f850e2ef923186a89b4ccd4fc0a29cfb52f318f93b3da00e723f` |
| Original builder Git blob | `9a695e159fc7dbdba724040536eaf572f10b4ce1` |
| Complete selection closure SHA-256 | `3d8e1f941dfd16692fecc4bc4fdf666c54f96725c2adebbf730c767b8cf5aa52` |

The complete archive has been composed in orchestration and independently read back there: gzip, all USTAR headers and checksums, every member, all source Git blobs, original file modes and every manifest SHA-256 binding matched. Its source and metadata are the maintained composer's output. USTAR uses the original SF82 header with the standard prefix field for long paths, original regular-file modes and a fixed 2000-01-01 timestamp. The archive's digest is this edition's actual digest.

The included `compose-package.cjs` executes the original source-owned composer and the exact original manifest-generation body. It requires the complete saved source packet, `selected-closure.json` and byte/hash/parser codecs, and verifies every input Git blob before composition. `package-tar.cjs` supplies its archive codec. The full source remains in the archive, including the standard native Git/npm builder, so a receiver can also produce a conventional native build from the same immutable commit.

## Current receiving stage

The package is complete and its bytes are published here. The pending installed customer case continues through the existing equipped receiver and retains its actual rendered screenshots, downloads and reopened state. The receiver should save its complete original result and editable workspace within the same native invocation.

## Required rendered product inspection

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Before calling any customer/prospect-facing application, website, dashboard, demo, report, presentation or export ready, open/run/render the exact outgoing version, look at the rendered screen or its actual screenshots, and operate the important user controls. Inspect the actual screenshare width and narrow/mobile width where relevant, populated/empty/loading/error states, downloads/exports and reopening. Capturing screenshots without viewing them is insufficient. Code review, DOM counts, HTTP 200, unit checks and another worker's approval do not replace seeing the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk; do not run broad suites or build a verification product.

Include this complete instruction in delegated assignments and the active owner-controlled policy, boot, build and receiving guidance those workers actually read. Preserve all other owner controls and original operation identities. Leave historical records and third-party/vendor policies intact. Do not force restarts, create watchers or revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999

