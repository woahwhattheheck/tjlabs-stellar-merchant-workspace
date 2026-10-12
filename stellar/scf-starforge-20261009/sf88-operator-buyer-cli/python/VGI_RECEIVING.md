# VGI purchased-result receiving

This programme installs the complete original buyer package with its maintained Python cohort engine, then operates the retained C271 warehouse through the VGI service, original buyer HTTP interface, browser, vendor SDK and DuckDB SQL client. It uses the same 32 original result rows throughout. The stable operation is `QUERY-FARM-VGI-RECEIVING-20261012-F3BE`.

The service and its original Applications, Python installation, CLI and operator joins are merged in [merchant-workspace PR94](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/94), merge `a15ac527e07c0c997090fb32c5d1d2fa49a1a024`. This receiving selects the byte-identical reviewed component `0a2d7ab216e20600bcb26105f662c2a3ce4fdbaf`. The two receiving programmes live beside this guide in `receiving/vgi_service.py` and `receiving/vgi_service_browser.mjs`.

## Original case and result identity

| Selection | Original identity |
| --- | --- |
| Complete input | C271 `receiving.zip`, 227,992 bytes |
| SHA-256 | `2da55e7d4399ab96a530451c99b75b64472f0041b690e862650bc60a1f4a42ac` |
| Original source carrier | Slack file `F0C8C1S6PMH` |
| Warehouse | `adfe47684e06bbd2c4bd70ecfd2d2d24` |
| Source edition | `df8d93a749f46f5a5509eb1deee58b2271c354fff436b912ccf38f2ac06d3760` |
| Native export | `3257b0e83294b7e142186f14d6b5d9d04b3d44fb2fb46643678bb6b68bb2f4dd` |
| Original query | `f1fe27a9f0b29b1322c3cd93fbcae7760ec1a185c9cff884de038963602dd90c`, revision 1 |
| Reviewed alias and batch size | `capacity_result`, 16 rows per native Arrow batch |

The 28 original members contain the 12,070,912-byte warehouse, seven Svenska kraftnät response pages, source meaning and dictionaries, native CSV and Parquet exports, and the original handoff and receiving records. The exact local original carrier is `/workspace/scratch/c271b14dff0a/duckdb-source-meaning/receiving.zip`. It may be copied unchanged to the selected receiving host.

The programme preserves the original HUGEINT-to-DECIMAL encodings, JSON price values, units, source editions, query revisions and export member hashes. It registers the received export directory through the service's explicit export-locations input; it preserves the original `sf_exports` row. Publishing and scanning these results uses the existing completed purchase.

## Complete source selection

Retain a source root with the original repository-relative paths. The component selection includes every original regular file under `stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/`, the original `stellar/scf-starforge-20261009/distribution/python-runtime/engine.py`, and the repository `LICENSE`.

Create `SOURCE_SELECTION.json` next to the source archive with this shape:

```json
{
  "repository": "woahwhattheheck/tjlabs-stellar-merchant-workspace",
  "source_ref": "0a2d7ab216e20600bcb26105f662c2a3ce4fdbaf",
  "files": [
    {
      "path": "LICENSE",
      "git_blob": "2d2a35a69e3896b7c6b885c1faebae2f2f8bc9c1",
      "bytes": 1091,
      "mode": "100644"
    }
  ]
}
```

The shown row is a format example: the actual manifest must enumerate the complete selected source, including every Python package, interface, static asset, README, build declaration and original engine. Obtain each entry from the exact selected Git tree and retain the complete original blob bytes. Git's object identity is SHA-1 over `blob <UTF-8-byte-length>\0<bytes>`. The receiving programme verifies each selected path's object hash and length before installation.

Archive those exact members, preserve their repository paths, and retain the resulting ZIP's actual SHA-256. Supply that digest as `--source-sha256`. It is also the original Python cohort's release digest. Keep the source archive, manifest and receiving programmes immutable for this operation. The driver separately pins its own and the browser programme's SHA-256 in the retained receiving selection.

## Installed runtime

Select a real Python 3.13 or later interpreter with its standard `venv` and `pip`, an existing Node executable, Playwright module and Chromium executable. The original cohort resolver and installer remain the package owner. The selected package set is:

- `duckdb==1.5.6` from the original buyer.
- `vgi-python[http,oauth]==0.43.1` and `vgi-rpc[http,oauth]==0.51.0`.
- `waitress==3.0.2`.

The VGI SDK's optional DuckDB integration pins a different DuckDB version, so this service uses its own retained Arrow scanners and the original buyer's DuckDB pin. Projection, filter and sampling pushdown remain disabled in the service catalog.

The receiving bootstrap invokes the existing engine's `resolve --extras duckdb,vgi` and `install` actions, retains their candidate and installation identities, and re-executes through the returned installed interpreter. The engine's wheel lock, original source snapshot, packages, licenses and entrypoint verification remain in the same cohort directory. Use the existing compute admission and runtime-selection workflow for this complete operation, including interpreter/runtime acquisition and its installation storage.

The inspected vendor source is the released [vgi-python 0.43.1](https://github.com/Query-farm/vgi-python/tree/bf8b0b3902e1ff165ac413e4a216801f03ed8693) and [vgi-rpc 0.51.0](https://github.com/Query-farm/vgi-rpc/tree/ca89b6d9c0d793cf8d708103d9cd1abf5f808271). Retain the complete licenses from the actual installed wheels. This receiving is a development and evaluation operation.

## Run the complete programme

Choose one private persistent output directory outside the immutable source root. All warehouse copies, the original Python cohort, wheels, browser profile, private authentication and continuation state, exported source handoff and final receiving results stay under that directory. The example below uses explicit placeholders for actual selected host paths.

```bash
python3 -B /ABS/receiving/vgi_service.py \
  --directory /ABS/private-vgi-receiving \
  --source-root /ABS/complete-source \
  --source /ABS/complete-source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python \
  --engine /ABS/complete-source/stellar/scf-starforge-20261009/distribution/python-runtime/engine.py \
  --source-archive /ABS/VGI_Source.zip \
  --source-manifest /ABS/SOURCE_SELECTION.json \
  --input /ABS/receiving.zip \
  --python313 /ABS/python3.13 \
  --node /ABS/node \
  --playwright /ABS/playwright/index.mjs \
  --chromium /ABS/chrome-headless-shell \
  --browser-driver /ABS/receiving/vgi_service_browser.mjs \
  --source-ref 0a2d7ab216e20600bcb26105f662c2a3ce4fdbaf \
  --source-sha256 ACTUAL_COMPLETE_SOURCE_ARCHIVE_SHA256
```

During this implementation the existing Node was `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`, Playwright was `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs`, and Chrome was `/workspace/scratch/705ebf077387/browser-runtime/chrome-headless-shell-linux64/chrome-headless-shell`. Check the actual selected host before binding these paths. The original buyer's native Node profile uses `SWARM_NODE24_BIN` set to its observed Node bin directory.

## What the original operation completes

1. Verify the full source and original input, resolve and install the retained Python cohort, and reopen the original warehouse with its original identity.
2. In the real private operator UI, save the exact receiving principal, review the original completed export with 16-row batches, publish `capacity_result`, and start the original VGI listener.
3. Read the first 16 rows using the released SDK's `table_scan_resumable`, retaining its original signed continuation token.
4. Save revision 2 of the original query with descending order through the original native query API, create its completed export through the original buyer HTTP interface, review that exact export, and publish the following catalog head.
5. Restart the listener and continue the original token to its remaining 16 original rows. The catalog points at the following head while the retained original function and publication remain available to the original token.
6. Revoke and restore the current principal, then retire and restore the alias through the original service transactions. Both current native authorization and real SDK reads exercise those changes. The operation retains each committed access transition for recovery.
7. Refresh the restored listener and retain a first-batch token for the following publication. Run the real DuckDB VGI extension in a separate SQL consumer using the same listener. Compare the returned rows, encodings and aggregate values with the original retained result.
8. Use the real operator UI to create the original source handoff, download the actual warehouse file through its original endpoint, and verify it against the original handoff descriptor.
9. Reopen the received warehouse, retain the same service and signing identities, continue the following token to its remaining batch, and reopen the actual catalog and history in the browser.

The SQL consumer uses the vendor's documented [DuckDB VGI attach path](https://query.farm/vgi/data-as-a-service/): `INSTALL vgi FROM community`, `LOAD vgi`, and an authenticated `ATTACH` followed by the selected `results.capacity_result` scan. Its actual extension version, location and result comparisons are retained by the programme. This separate SQL consumer preserves the warehouse connection's disabled external-access setting.

## Continuation and receiving output

Reinvoke the identical command with the same source, input, selected executables and output directory after reconciling the existing native owner. `receiving.lock` retains the sole process lifetime across the installed-interpreter exec. Original source selection and action bodies are immutable, while original native request IDs and response receipts are reused. The phase journal resumes the first unfinished transition.

If the process ends after alias retirement but before restoration, the same retained `current_access` transitions restore it before the following batch or SQL scan. The new-head assertion belongs to its completed cursor phase, and the restored listener is refreshed after access restoration. An already completed operation returns its original final result.

Useful output paths under the selected directory are:

| Path | Purpose |
| --- | --- |
| `selection.json` | Exact operation, source, input, driver and executable binding |
| `installation.json` | Original installed interpreter, source and wheel-lock identity |
| `python-runtime/candidates/` | Original candidate metadata, requirements lock and retained wheels |
| `receiving/phases.json` | Accepted steps in the same original receiving |
| `receiving/requests/` | Original native action request/result receipts |
| `receiving/batches/` | Exact received Arrow batch streams |
| `receiving/service-history.json` | Original retained service mutations and source joins |
| `receiving/restored-state.json` | Reopened service/catalog state |
| `browser/` | Original UI action receipts and completed screenshots |
| `handoffs/` | Original complete warehouse/source handoff |
| `receiving/result.json` | Complete native outcome and retained identities |

Private bearer configuration, signed continuation tokens, operator capabilities and browser profiles remain under `private/`. Share the final receiving result, source and installed-runtime identities, reviewed screenshots, and original source/handoff members appropriate to the receiving audience.

`receiving/result.json` is written with `passed: true` only after the complete installed SDK, catalog replacement, access restoration, SQL, browser and backup/reopen flow has completed. A prepared source package or an interpreter-installation receipt is an earlier stage of this same operation.
