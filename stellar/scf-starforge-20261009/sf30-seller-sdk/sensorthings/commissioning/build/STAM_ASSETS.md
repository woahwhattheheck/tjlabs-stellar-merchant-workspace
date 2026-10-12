# Build the selected STAM and Leaflet browser assets

This is the source build for the existing DataCove commissioning interface. The selected original STAM commit is `0e414f3441a8773619f242c797fe75e9af3fc04d` in [DataCoveEU/STAM](https://github.com/DataCoveEU/STAM/tree/0e414f3441a8773619f242c797fe75e9af3fc04d). It is distinct from the older npm 1.14.0 publication. The programme uses the author's exact package, lockfile, tsdown configuration and source, then runs the author's `pnpm run build` command.

## Inputs and execution

Keep `stam-input.json` and `build_stam_assets.py` together. The input includes the complete observed Git tree, exact original file sizes and blob IDs, the pnpm 12.0.0 tarball URL and SHA512 integrity, Leaflet 1.9.4 selection, and the original commissioning static manifest shape.

Run on the already selected Node 24 runtime through the existing native capacity runner. This stage installs only into its own chosen build directory. It does not modify the shared Node runtime, another project's node_modules, or the original FROST/provider operation. The current 1,536 MiB memory declaration and 1,024 MiB temporary storage declaration are conservative build planning bounds; the actual result records child peak RSS and exact emitted bytes. The maintained runner owns admission and its ordinary operation record.

```sh
python3 -B build_stam_assets.py \
  --root /absolute/owned/stam-build \
  --input /absolute/source/stam-input.json \
  --node /absolute/existing/node24 \
  --operation-id DATACOVE-STAM-ASSETS-5403-20261012
```

For an invocation-local filesystem, the executing owner additionally supplies the existing `--retention-module` and `--helper-directory`. That calls the original hosted artifact retention implementation before the native process exits. It does not create a new upload or runtime controller. The sealed output is kept until that original upload returns.

The original frozen install uses `--ignore-scripts`, followed by an explicit invocation of the author's build. Installation notices and compiler errors remain in the full logs. An actual missing native dependency or build failure is retained for a source-bound continuation; the programme does not replace the compiler or silently move to a different STAM release.

## Exact source and output custody

Every regular source leaf in the codeload archive is checked against the selected Git blob and byte count before use. Every selected leaf is checked again after compilation, including package.json, pnpm-lock.yaml and tsdown.config.ts. The pnpm tarball must match both its exact SHA512 integrity and SHA1 registry shasum.

The complete original generated dist directory is retained under `output/ui/vendor/stam/`. Leaflet's complete original dist, CSS-relative images and source maps are retained under `output/ui/vendor/leaflet/`. Native V8 module parsing checks the selected Leaflet ESM import closure without executing map/provider requests. The original full operator browser journey remains responsible for actual UI and map receiving.

`output/browser-assets.json` preserves the original `stellar-forge.browser-assets.v1` shape with `root: "./ui/"` and the existing `routes` entries. It adds selected asset routes, `stamAssets`, and `cspStyleHashes`. Its URLs stay on the current origin, below `/commissioning/vendor/`, with no query, fragment, /api alias or CDN.

The `stamAssets` object names the ordinary Leaflet UMD script, Leaflet stylesheet, original generated STAM ESM entry, exact source commit, Leaflet version, SHA256 integrity and the retained licence notice. The original interface loads Leaflet first and then imports the named STAM export.

The two original addCss constants are retained as exact UTF-8 text in `STAM_BUILD_RESULT.json`, each with its original source blob, bytes, SHA256 and quoted CSP source expression. The HTTP owner adds only those exact hashes to its current style-src rule. No source rewrite or unsafe-inline exception is needed for those constants.

## Licence records

The exact original STAM LICENSE.md and README.md are retained. The selected package metadata declares MIT while the selected LICENSE.md contains two-clause BSD terms; both author-provided declarations remain available without replacing either. The package also retains actual licence/notice files and package metadata for every installed lockfile package. This is an intentionally over-inclusive build/source notice set, not a claim that all those packages are part of the selected Leaflet runtime.

Each available notice is copied byte-for-byte. If an installed package has no separate root notice, the index records that fact; its package metadata is not fabricated into a licence text. Root static routing includes all selected notice files.

## Complete result and continuation

The sealed `STAM_0e414_Leaflet_1_9_4_Complete_Browser_Assets.zip` contains output assets, manifest, the complete original source leaves, build input, programme, command logs and the actual build result. A failed build seals its actual error and available original evidence under the same operation. It is not labelled as a completed asset delivery.

After an actual complete build, join the exact output files and browser-assets.json into the original commissioning product. Preserve any newer non-asset route additions by composing them from the original current manifest. Publish the measured asset identities and build result with the same original case. Provider/native commissioning, commercial outreach and the original operator journey keep their existing owners.
