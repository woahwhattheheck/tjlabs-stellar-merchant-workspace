# Installed mobility and education receiving

This programme receives the complete workspace archives from the existing original source and browser operation. It preserves each product's workspace UUID, exact retained sources, record heads, complete histories, original application files and lifecycle requests.

## Select the original inputs

Wait for the existing complete source programme to return both actual workspace ZIPs. Use the original browser archive metadata and workspace UUID from each product's retained native result. The selected runtime is the complete original application at the same source edition.

The original receiver's final restored-browser archives include its independent editable note/action continuation. Receive those actual completed files automatically:

```sh
python3 -B products/partner-workspace/receiving/select-original.py \\
  --original-root /private/existing-partner-source-operation \\
  --out /private/installed-inputs
```

The selector takes the two original operation locks for its read, verifies the complete archive bytes and manifests, binds the original result and workspace identities, and writes both exact source manifests plus `Original_Installed_Inputs.json`. Use `--edition original` only when explicitly selecting the earlier preserved browser archive. No original source or browser stage is restarted.

A private input JSON uses this shape, with actual values for every selected path and identity:

```json
{
  "schema": "stellar-forge.partner-installed-receiving-input.v1",
  "operation_id": "PARTNER-INSTALLED-RECEIVING-64B7-20261013",
  "products": {
    "mobility": {
      "product": "mobility",
      "original_operation": "ACTUAL_EXISTING_SOURCE_OPERATION",
      "source_root": "/private/original-application",
      "source_manifest": {
        "path": "/private/Mobility_Source.json",
        "bytes": 0,
        "sha256": "ACTUAL_COMPLETE_MANIFEST_SHA256"
      },
      "original_archive": {
        "path": "/private/original-mobility-workspace.zip",
        "bytes": 0,
        "sha256": "ACTUAL_COMPLETE_ARCHIVE_SHA256",
        "workspace_id": "ACTUAL_32_HEX_WORKSPACE_ID"
      }
    },
    "education": {
      "product": "education",
      "original_operation": "ACTUAL_EXISTING_SOURCE_OPERATION",
      "source_root": "/private/original-application",
      "source_manifest": {
        "path": "/private/Education_Source.json",
        "bytes": 0,
        "sha256": "ACTUAL_COMPLETE_MANIFEST_SHA256"
      },
      "original_archive": {
        "path": "/private/original-education-workspace.zip",
        "bytes": 0,
        "sha256": "ACTUAL_COMPLETE_ARCHIVE_SHA256",
        "workspace_id": "ACTUAL_32_HEX_WORKSPACE_ID"
      }
    }
  }
}
```

Each source manifest uses `stellar-forge.partner-product-source.v1`, a title, its product, and every original runtime file's relative path, full byte count and SHA-256. Keep all original `workbench/`, `static/`, `run.py`, `README.md` and `LICENSE` files admitted by the original archive contract. Source identity checks precede installation.

## Run the complete installed continuation

Use the closed source packet containing all product files, original framework support modules, this driver and the whole Node programme. Select the existing permitted Chromium executable and installed Playwright module.

```sh
python3 -B products/partner-workspace/receiving/run-installed.py \
  --packet /private/Partner_Installed_Receiving_Source.json \
  --inputs /private/Original_Installed_Inputs.json \
  --directory /private/partner-installed-receiving \
  --browser /absolute/existing/chrome-headless-shell
```

Set `PARTNER_PLAYWRIGHT_MODULE` when Playwright is outside the existing standard Node runtime. The driver passes its actual Python interpreter to the native product and inherits the real original fd3 lease into the managed children. The selected workbench services retain their original loopback Host and Origin behavior.

The full programme:

1. Receives and validates both complete original archives and runtime selections.
2. Prepares each actual workspace through the typed installation client with retained mutation UUIDs.
3. Receives original sources, every exposed current record and complete history, and the actual mobility comparison and station-flow operations.
4. Opens each original staff application through its maintained Applications preparation, direct child and readiness observer.
5. Receives the browser overview, actual original state, screenshot and editable original report, then stops and reopens the same application.
6. Produces original report, CSV and full workspace exports; reconciles the selected source through the same lifecycle.
7. Creates the complete installation ZIP with source editions, workspace and operation lineage.
8. Independently receives that ZIP, cold-opens its configured MCP owner, and reopens the original staff application in the browser.
9. Produces and receives an onward complete installation, comparing all original state, source identities, record heads and histories and receiving the initial named preparation through its originating installation lineage.
10. Retains the complete application, input copies, actual workspaces, exports, logs, screenshots and results in one private full-delivery ZIP.

## Continue the same operation

The driver takes a real exclusive installation-receiving lock. An existing case is reported without overwriting it unless `--resume` is explicitly selected. A resumed case must match both the complete original source packet and original input JSON. It reuses the original named request files and their UUIDs. Original business-state baselines remain bound across interruption; the programme performs no substitute source intake.

Completed input copies are usable after their temporary donor files retire. When a donor still exists its bytes must still match. Each attempt retains its own prior result, process receipt, complete log and full delivery archive. A live managed service retains the original operator lock, so an unresolved earlier process cannot be silently replaced.

`attempts/<id>/FULL_DELIVERY.json` identifies the complete archive and exact result. Preserve that whole private archive before retiring a producing host. It includes original customer sources and workspace data, so deliver it through the existing private case and authorized file destination.

## Review and practical capacity

The native source uses Python 3.11 or later with standard-library SQLite, the maintained Node runtime, and an existing permitted Chromium/Playwright installation. The driver streams the final archive; select a host with room for both complete original workspaces, independent receiving copies and their handovers. No new paid service, browser download or provider data request is part of this installed continuation.
