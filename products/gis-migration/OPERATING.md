# GIS migration workspace

The GIS migration workspace takes approved vector exports through explicit mapping, native data, saved QGIS maps, publication and complete independent receiving. The browser, command line and merchant tools use the same original workspace, source captures, revisions and request history.

The product opens from the existing **Applications → GIS migration** entry. The installed commands are `migration-operator` for selecting and opening that original workspace, `migration-workspace` for the original merchant client and receiving, and `stac-qgis` for the maintained QGIS operator. Installation and movement to another host are covered in [RECEIVING.md](RECEIVING.md).

## Prepare the original workspace

Keep the working directory, native request directory, exports and private connection files outside the installed source release. Use the actual Python environments on the operating host:

| Selection | Work performed |
| --- | --- |
| Operator Python | Original workspace, source records, mapping and history |
| Vector Python | Capture, validation and native data generation through Fiona/GDAL |
| QGIS Python | Real projects, styles, publication and native receiving |
| Complete handover directory | Original exported archives outside the working workspace |

The three Python paths may identify the same environment. A selected virtual environment keeps its original executable path, including its `pyvenv.cfg` behavior. The product opens existing native environments; their actual provider information is available through the original operator.

For a new project, create its original workspace:

~~~sh
starforge migration-operator create \
  --workspace /srv/starforge/private/migration \
  --python /absolute/path/to/operator-python \
  --title "Approved source migration"

starforge migration-operator describe \
  --workspace /srv/starforge/private/migration \
  --python /absolute/path/to/operator-python
~~~

The original native engine creates its SQLite workspace and returns its real ID and revision. Repeating Create for that existing path opens the same original workspace. Save the returned ID with the project handover. An already received workspace starts with Describe.

## Open and control the application

In the existing Runtime workspace, select the READY installed runtime, then **Applications → GIS migration**. Set the existing migration directory, Operator Python, Vector Python and QGIS Python. Choose the private handover directory and optional private environment JSON. Port `0` lets the original loopback server select an available port.

Review and save this application, then start its original operation. Preparation reads the original workspace ID. Launch rechecks that ID, and the accepted address is retained only after the actual server returns that workspace through its authenticated API. The ordinary Applications history owns the command, environment selection, process and stop/reopen state.

Open the address returned for the current running operation. Its private access fragment establishes the original browser session. Reopening after a process restart uses the new address for that same workspace.

For a directly owned foreground process, the equivalent is:

~~~sh
starforge migration-operator serve \
  --workspace /srv/starforge/private/migration \
  --python /absolute/path/to/operator-python \
  --vector-python /absolute/path/to/vector-python \
  --qgis-python /absolute/path/to/qgis-python \
  --exports /srv/starforge/private/migration-exports \
  --port 0
~~~

Choose the existing Applications operation when that is the current owner. Its Stop drains the native process groups it started, closes accepted HTTP connections and waits for its request handlers to finish. An incomplete request body or interrupted download cannot keep the stopped application open. A following open uses the same workspace and retained requests.

## Receive approved sources

On Sources, select the complete original vector selection JSON and its actual local source root. The selection identifies the input files, byte counts, hashes, layer selection and row identities. The operator retains the original JSON bytes, including a UTF-8 BOM when present.

An already retained native capture can be received by its directory and complete manifest hash. Both intake paths use the original vector engine. A saved capture carries every selected feature and its geometry, fields, nested values and exact numeric representation.

Open each selected layer and page through its complete original records. Source and comparison pages expose their own continuation offsets; the visible page is part of the saved complete collection. Keep the capture and layer IDs returned by this workspace.

For a corrected source export, retain a separate capture and compare the two actual capture IDs. Inspect all affected rows and source identities before making the successor mapping.

## Review a complete mapping

Create a draft from the selected source capture. The draft contains the complete mapping even when the editor displays only one layer or page:

- Every source layer and field has an explicit destination choice.
- Native field representation, exact JSON text and retained references remain distinct choices.
- Required values, null policy and key equality follow the selected destination representation.
- Geometry null policy, observed or assigned source CRS, transformation and target CRS are explicit.
- Output formats, native tables, proposed PostGIS schema and complete QGIS project definitions remain in the same plan.
- Added or removed fields, changed keys and successor project choices retain their own review notes.

The browser retains the full editable draft across navigation and reload. An imported plan keeps its original source bytes. Save a complete successor after resolving the required decisions.

Open the saved plan's full issue index. Its count covers the whole capture. Filter and page the relevant issues, then read their complete source positions, row identities and detail. A key that collapses under the selected native representation is a real destination decision even when its original source values differ.

Record **Accepted** or **Changes requested** with the original operator note. This review selects the exact saved plan and original source document.

## Exchange the complete mapping workbook

In **Mapping → Customer mapping workbook**, choose the actual saved plan and **Export Mapping-Register.json**. Build the complete XLSX with the included original renderer and give the customer that workbook with its matching JSON register. Use [Mapping workbooks](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/migration/MAPPING_WORKBOOK.md) for the complete authoring and receiving sequence.

Return the original register and reviewed XLSX through **Review workbook changes → Load complete plan into mapping editor**. Review the complete field, layer, key, coordinate and project choices in the existing editor, make any further agreed changes, then use the normal Save plan and Review actions. The saved input retains the exact workbook and register, the complete proposed and saved plans, and every additional edit.

A complete workbook-return JSON can be prepared with **starforge migration-operator workbook-propose** and imported in this same panel. Its proposal is recomputed against the selected original workspace. The existing merchant adds **merchant_migration_mapping_register** and **merchant_migration_workbook_propose**; **merchant_migration_save_plan** accepts the complete workbookSourceJson with its original planJson and write identity.

Keep worksheet names, headers, gray source cells and exported row order intact. Filters are available. Make added/removed field, key or project structures in the native editor after loading the proposal. Use **Retained mapping workbooks** on the saved plan to reopen all five input files; the full workspace export carries them onward.

## Build native data and maps

Build the selected valid, reviewed plan. The original vector engine writes and reopens its actual output, including native layers, features, fields, geometry, CRS and complete sidecars. The resulting edition retains its native manifest and readback.

The edition's PostGIS handover describes the retained native GeoPackage, actual tables, schema, fields, row counts, geometry, CRS and key decisions. Select destination credentials in the original deployment workflow when using that handover.

Build the maps selected by the edition's project definitions. Each map binds its original source layer, actual output table, CRS, visibility, opacity, subset expression, style and local style resources. The maintained QGIS engine writes a QGZ with relative source paths, then reopens it through the actual provider.

Keep the complete project result. A project build can contain several original subrequests; its saved operation tracks which projects have already committed. Continue that same operation after an interruption.

## Publish maps

Open Map publication and choose a saved native project. Its complete plan selects the actual layers, layer order, map extent, page size and orientation, resolution, attribution, legend and scale bar.

Preview the complete specification. Save the reviewed publication plan, then publish with the original workspace revision, actor and request ID. The native result contains:

| File | Purpose |
| --- | --- |
| QGZ | Editable project and original map source bindings |
| QPT | Editable native print layout |
| PDF | Complete rendered publication |
| PNG | Original selected render |
| Publication plan | Full saved specification and predecessor, when selected |
| Native result | Complete input, output and reopen identities |

Download the original declared file, including its byte count and SHA-256. The publication panel reads its preview from that same retained file.

For a correction, select the previous publication and retain the full revised specification plus the reason. Earlier projects, plans and outputs remain in the original history. Reopen the saved publication through its actual native renderer before handing it onward.

Detailed map controls and the native layout contract are in the original [cartography guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/migration/CARTOGRAPHY.md) and [publication operator guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/migration/CARTOGRAPHY_BROWSER.md).

## Correct an edition

Draft from the corrected capture and original predecessor plan. Stable layer and field choices carry forward. Resolve the actual additions, removals, invalidated keys and changed map selections. A mapping-only correction can retain the same source capture.

Save and review the successor, build its native data and projects, then prepare any corrected publication. Each result keeps its original source, plan, edition, project and publication IDs. The earlier edition remains usable and exportable as retained history.

## Recover an interrupted request

Before dispatch, the browser retains the full command, payload, workspace ID, actor, revision and request ID. Saved requests and recovery displays those original arguments and the actual response or failure.

Open that saved request first. A committed native operation can return its original result even when the response was interrupted. Exact retry uses the same command and complete input. A different input under the same request ID is a conflict.

For a new action after another user's edit, refresh the current workspace, review the intended source and save a new operation. For the existing interrupted action, use its retained identity and original continuation. Multi-step map builds and publications preserve their completed native work.

Applications restart, browser draft recovery and native request recovery each retain their original owner. Reopening an application does not create a replacement migration workspace.

## Use the same workspace from merchant tools

Create a private connection using the observed original ID and selected native environments:

~~~sh
starforge migration-operator connect \
  --workspace /srv/starforge/private/migration \
  --python /absolute/path/to/operator-python \
  --vector-python /absolute/path/to/vector-python \
  --qgis-python /absolute/path/to/qgis-python \
  --runtime /srv/starforge/private/migration-native-tasks \
  --connection /srv/starforge/private/migration-connection.json \
  --alias delivery

starforge migration-workspace init \
  --directory /srv/starforge/private/migration-merchant \
  --connection /srv/starforge/private/migration-connection.json
~~~

Connect retains the original `starforge.migration-merchant-connection.v1` configuration with the actual workspace ID. It uses a create-only private file; the same complete content can reopen that file. Preserve this connection when reopening the same merchant.

Declare approved selection, capture and handover aliases in its original `inputs` object, with the complete observed byte counts and hashes. Independent destinations name their actual directory and selected incoming workspace ID. The original configuration validator checks these fields before the merchant opens them. Keep other existing merchant families when adding `migrationWorkspaceConnection` to a current host.

The complete attachment provides 46 `merchant_migration_*` tools. It exposes source paging, mapping and constraint review, native maps, cartography, retained request and file reads, export and independent receiving. Its SDK and CLI use the same operation and workspace identity.

~~~sh
starforge migration-workspace call \
  --merchant /srv/starforge/private/migration-merchant/merchant-mcp.json \
  --workspace delivery --workspace-id ORIGINAL_WORKSPACE_ID \
  --command state --payload /srv/starforge/private/requests/state.json
~~~

For State, the payload file contains `{}`. Substitute the observed workspace ID. Other commands take their complete native arguments from the original result and reviewed input.

Use [MERCHANT.md](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/migration/merchant/MERCHANT.md) for the typed client, merchant tools, running MCP connection, complete result downloads, chunk recovery and exact numeric JSON. A borrowed merchant retains its existing lifecycle. A private one-command CLI invocation drains its own attachment after completion.

## Deliver the whole project

Export the complete selected workspace at its observed revision into the external handover directory. The archive contains original inputs, capture rows, mapping and constraint decisions, native editions, maps, styles and resources, publications, original requests and event history, plus its selected native application source.

The export result supplies the full archive identity. Retain the complete ZIP and that result. Receive it in a separate private directory using the original expected hash and workspace ID, then reopen the actual native maps and publications.

A merchant handover additionally retains `migration-export.json`, which binds the complete `handover.zip`, selected workspace, revision, request and package manifest. The maintained file receiver resumes the original byte prefix and verifies the whole archive before publishing its final manifest.

Follow [RECEIVING.md](RECEIVING.md) through independent receive, Applications reopening and onward export. That keeps the editable original project and its complete source available to the next operator.
