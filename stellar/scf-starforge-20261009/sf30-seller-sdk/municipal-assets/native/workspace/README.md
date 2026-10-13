# Municipal asset and work-order workspace

A working local operator application for the McPherson G2 migration and GIS/work-order workshare. It imports original asset and operational exports, retains explicit identifier mappings, shows asset relationships and geometry, prepares repair files, reconciles returned work-order changes, and preserves the complete vendor handoff.

The application calls the existing [`acceptance/verify.py`](../acceptance/verify.py) without modifying its source. The original checker remains the asset comparison and recorded round-trip engine. This workspace adds the operator, persistence, reconciliation, and delivery workflow around it.

## Run

Use Python 3.10 or later with its standard `sqlite3` module. The application has no downloaded runtime dependencies, JavaScript build, external fonts, map service, or hosted job.

From the extracted `mcpherson_ks_modular_software_2026` directory, or `opportunities/mcpherson_ks_modular_software_2026` in the repository:

```bash
python -m workspace init "$HOME/mcpherson-workspace-data"
python -m workspace serve "$HOME/mcpherson-workspace-data" --port 8766
```

Open `http://127.0.0.1:8766`. Read the generated `operator-password.txt` in the private data directory and enter that password and your operator name. The command prints the file location, not the password. The service binds to loopback; passwords, source data, and exports stay on that machine. A shared vendor deployment needs the vendor's existing authenticated/TLS application boundary.

To load the included development operation:

```bash
python -m workspace demo "$HOME/mcpherson-workspace-data"
```

The development project is labeled throughout the UI and its exports. It contains three development assets, two locations, two separate service requests, two work orders, and a labeled local round-trip record. Its initial target export deliberately retains one label difference so an operator can use the real review and repair flow. These are development records, not City inventory or a vendor integration.

## Complete operator sequence

1. **Create a project and import original files.** Source assets and target assets are separate inputs. Add locations, service requests, work orders, returned results, and the recorded original round-trip JSONL as applicable. Each distinct original is retained with its byte digest and record count. Reimporting identical original bytes reuses that retained input.
2. **Save each field mapping.** Required fields are marked. Map the actual identifier column, parent/container and location relationships, status, and geometry. Status aliases and trimming identifier whitespace are explicit choices. Switching to a different column set requires another mapping review.
3. **Inspect assets and relationships.** Search and paginate records, open exact linked identifiers, inspect the source geometry, and follow an asset to its requests or work orders. The page shows a local WGS84 geometry view without fetching a basemap. Duplicate keys, absent assets/locations/requests, inconsistent request-to-asset links, invalid work-order revisions, hierarchy cycles, and source/target differences appear in Review & repair.
4. **Prepare and resolve repairs.** Retain a review decision and proposed replacement. The handoff includes the resulting proposed CSV separately. The original target stays unchanged until the corrected export is imported. A review note never suppresses a data error. An intentional source omission has its own named-operator decision and reason, and must describe a record actually absent from the selected target.
5. **Prepare a work-order status change.** Select an exact work-order ID and an allowed transition. The request retains the selected work-order input, original asset/request IDs, expected revision, previous status, requested status, operator, and note. Only one pending local request exists for a work order.
6. **Reconcile actual returned records.** Import and map the vendor adapter's returned file. The application checks the exact request and current selected work-order version. An `ok` result advances the locally reconciled status and revision once. A `rejected` result is retained without changing the work-order state. Repeated identical results reuse the original outcome; a conflicting result is a conflict. Each batch is atomic.
7. **Run the original checker and retain a release.** Record the declared full export counts, comparison fields, existing engagement references, and exact recorded round-trip correlations. The original checker reads the generated mapped source/target CSV and unchanged supplied event JSONL. A release requires the current comparison to be consistent and the current relationship errors resolved. Each release stores its ZIP bytes, original input selections, and operator note. Subsequent downloads and backup recovery return those retained bytes.
8. **Recover or change the selected version.** Use a retained input version or restore an earlier project revision. Every selection change adds history. An applied returned event remains an operational fact; restoring a version from before that event does not undo the vendor event. Use the fresh vendor export to reconcile such a change.

## Data contract

| Input | Required mapped fields | Other mapped fields |
| --- | --- | --- |
| Source or target assets | `id` | `label`, `status`, `parent_id`, `location_id`, `geometry`, `updated_at`, `attributes` |
| Locations | `id` | `label`, `geometry` |
| Service requests | `id`, `asset_id`, `status` | `location_id`, `summary`, `created_at` |
| Work orders | `id`, `asset_id`, `status`, `revision` | `request_id`, `summary`, `updated_at` |
| Returned updates | `change_id`, `work_order_id`, `asset_id`, `status`, `expected_revision`, `result`, `provider_reference` | `request_id`, which must match when the original work order has one |

Work-order revisions are positive whole numbers. A missing source revision is not silently initialized. The default transition contract is editable under Contract & handoff:

```json
{
  "open": ["in_progress", "cancelled"],
  "in_progress": ["completed", "open", "cancelled"],
  "completed": ["closed", "in_progress"],
  "closed": ["open"],
  "cancelled": ["open"]
}
```

The local exchange format is `municipal-workspace.exchange.v1`. `requested-updates.json` contains pending local requests only. Its `changes[].id` is the exact `change_id` the adapter returns. `change-history.json` retains requested, withdrawn, applied, and rejected history. Withdrawing a local request does not cancel a remote vendor operation; an eventual original return still needs reconciliation.

Example **development** return, with the change ID replaced by the one generated in your development workspace:

```csv
change_id,work_order_id,asset_id,request_id,status,expected_revision,result,provider_reference
<original-generated-change-id>,DEV-WO001,DEV-A101,DEV-RQ001,in_progress,1,ok,DEVELOPMENT-ADAPTER-RETURN-001
```

`provider_reference` is the adapter's actual job/event/response reference. No PSD endpoint, authentication scheme, external write, or successful PSD API response is invented by this file boundary. The vendor-specific adapter consumes the pending request and supplies the original result under its actual API and access arrangement.

### Formats and geometry

Inputs may be UTF-8 CSV with unique headers, JSON object arrays, JSONL, RFC 7946 GeoJSON FeatureCollections, or Esri feature sets. Each input is limited to 32 MiB, 100,000 object records, and 300 columns. The original CSV reader's per-field size limit also applies during native comparison; oversized fields return an input/repair error.

GeoJSON accepts Point, MultiPoint, LineString, MultiLineString, Polygon, and MultiPolygon, including polygon holes. Coordinates must be finite WGS84 longitude/latitude; rings are closed. The geometry view fits only the current record page and is for inspection rather than measurement.

Esri point, multipoint, and polyline feature sets support WKID 4326 and explicit Web Mercator conversion from 3857/102100/102113. Metadata records that conversion. `exceededTransferLimit` is retained and reported as an incomplete source export. Esri polygon rings must be exported as RFC 7946 GeoJSON so the source provider resolves shell/hole topology. Unsupported projections are reported directly.

## Vendor handoff contents

| Path | Purpose |
| --- | --- |
| `originals/<dataset>/...` | Exact selected source bytes |
| `source-manifest.json` | Original input IDs, hashes, counts, and format metadata |
| `mapped/*.csv` | Explicit saved field/status/geometry transformations |
| `reconciled/work_orders.csv` | Original work orders plus the actually reconciled returned status, revision, and provider reference |
| `proposed-repairs/*.csv` | Proposed corrections, kept separate from actual original exports |
| `requested-updates.json` | Pending local update requests for the vendor adapter |
| `change-history.json` | Complete retained request and returned-result state |
| `findings.json`, `history.json` | Current issues, operator dispositions, and project changes |
| `workspace.json` | Selected project revision and mappings |
| `original-acceptance-packet.zip` | Native manifest, mapped comparison inputs, original JSONL, transformations, and the unchanged checker result |

The original native receipt continues to distinguish technical consistency from vendor or City acceptance. A release is an internal handoff action; the product does not submit a municipal response or make a commercial commitment.

## Recovery and concurrency

SQLite transactions make imports, mappings, review decisions, requests, and returned batches atomic. Every write supplies the current project revision and a stable operation ID. A stale revision receives HTTP 409 with the unsent form retained. A response lost after commit can be retried with the same operation ID to recover the original result.

The browser's Workspace backup link and the CLI use SQLite's consistent backup API, including immutable originals, mappings, history, returned changes, and release ZIPs:

```bash
python -m workspace backup "$HOME/mcpherson-workspace-data" ./municipal-workspace-backup.zip
python -m workspace restore ./municipal-workspace-backup.zip "$HOME/mcpherson-workspace-recovered"
python -m workspace serve "$HOME/mcpherson-workspace-recovered" --port 8766
```

Restore verifies the manifest digest and SQLite integrity, writes into a new directory, and generates a new private operator password. It preserves the existing workspace. Backup ZIPs contain original project data and are **not encrypted**; keep them in the vendor's approved private backup destination.

## Implemented operation

The shipped application was run through native browser import/mapping, original comparison, review and repair, corrected export, lost-response request recovery, returned-result replay, stale-edit preservation, version restoration, release download, and original backup recovery. The development work order advanced from revision 1 to 2 once, and the retained release was byte-identical after recovery. Desktop and mobile screens were inspected. No hosted workflow or third-party runtime installation was used.

The vendor-specific live adapter, City source extraction, vendor product licensing, procurement response, municipal references, and production deployment remain part of the commercial implementation workshare described in [`WORKSPACE_VENDOR_HANDOFF.md`](../WORKSPACE_VENDOR_HANDOFF.md).

## Complete public GIS capture

[Belleville source intake](BELLEVILLE.md) adds a complete original-capture importer and public-reference project context to this same workspace. Every provider response and typed attribute survives original input retention, mapped inspection, complete report, export and editable backup. The capture command saves the explicit source-qualified OBJECTID mapping and can reopen its saved receiving copy. The existing target reconciliation, work-order exchange and original checker continue on their actual supplied records.
