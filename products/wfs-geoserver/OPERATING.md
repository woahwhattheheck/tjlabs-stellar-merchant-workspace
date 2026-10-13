# WFS and GeoServer feature projects

Use the WFS feature desk to turn an advertised WFS 2.0 service into a complete, reviewed feature edition; compare later editions; deliver native GIS files; and reopen the original project with its sources and history. The browser, installed command, Applications and merchant tools operate the same project.

The maintained selection is `wfs-geoserver`. It packages the original WFS application, Python source receiver, native vector engine, original buyer and merchant interfaces, and the complete GeoSolutions customer programme. [Receiving and continuation](RECEIVING.md) covers existing projects and original customer operations. [The source map](SOURCE_ADOPTION.json) identifies the exact adopted files and the shared source-capture change.

## Install the selected product

Use Node 22.16 or later and an owned checkout containing this adoption. Select one immutable complete source commit with the original distribution builder:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace \
  --ref COMPLETE_SOURCE_COMMIT \
  --selection wfs-geoserver \
  --out /absolute/wfs-release
~~~

Keep its returned archive, source commit, byte count, SHA-256 and recipe identity. The package version contains `.selection.wfs-geoserver`. This recipe retains the complete original components and the served browser mappings, including the native vector JSON module.

Prepare and install through the maintained runtime:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/wfs-runtime \
  --archive /absolute/wfs-release/ORIGINAL.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/wfs-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/wfs-runtime --load --source
~~~

An equipped receiver can use the installer's `--adopt-existing` path for the complete existing dependency tree and original lock. The [runtime installation guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) defines that contract and the supported cache/offline options. Preserve the resulting READY runtime and its source profile.

A paused build continues with `build.mjs --repo /absolute/merchant-workspace --out /absolute/wfs-release --resume`. A paused runtime installation continues with `runtime-install-cli.mjs resume --dir /absolute/wfs-runtime`. Use their original output directories, which retain the selected source and operation.

Commands below use `starforge` from that READY installation. The equivalent installed execution is:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/wfs-runtime -- wfs --help
~~~

### Select the actual Python runtime

The desk uses Python 3.11 or later for XML and complete source-file receiving. The selected package includes the original WFS receiver, shared `source_file_delivery.py` and original SF88 Python buyer package.

Native vector export and receiving also require Fiona/GDAL in that same selected Python, with working GeoPackage and ESRI Shapefile drivers. Select the executable with `--python /absolute/gis-venv/bin/python` or the Applications source-Python field. Runtime installation preserves the original Node dependency contract; the chosen Python and its GIS drivers remain explicit host inputs.

The original native engine exposes a capability read against the chosen interpreter:

~~~sh
/absolute/gis-venv/bin/python \
  /absolute/wfs-runtime/source/stellar/scf-starforge-20261009/sf30-seller-sdk/stac/vector/engine.py \
  --request /private/wfs/operator/native-capabilities.json \
  --result /private/wfs/exports/native-capabilities.json
~~~

The request file is `{"command":"capabilities"}`. Resolve the actual installed `source/` root from the READY runtime's inspection before using that path. Keep the returned executable, driver and native library details with the operator's selected runtime.

## Open the original feature desk

Initialize a new private project, or select an existing received project. Keep exports in a separate private directory:

~~~sh
starforge wfs init --project /private/wfs/parcels --name "Regional parcels"
starforge wfs show --project /private/wfs/parcels

starforge wfs serve --project /private/wfs/parcels \
  --python /absolute/gis-venv/bin/python \
  --connection-file /private/wfs/operator/parcels-connection.json
~~~

The foreground command returns the actual loopback startup URL, original project ID, complete launch binding and instance ID. It retains its source and native operations while running. Closing it drains its owned work and listeners.

To use Applications, attach the READY runtime to the existing Runtime workspace:

~~~sh
starforge runtime-workspace init --workspace /private/wfs/runtime-desk
starforge runtime-workspace attach --workspace /private/wfs/runtime-desk \
  --runtime /absolute/wfs-runtime --label "WFS feature projects"
starforge runtime-workspace serve --workspace /private/wfs/runtime-desk --port 8465
~~~

Select **Applications → WFS feature workspaces**, the READY installation, and the existing project directory. Choose the actual source Python. Optional selections are source authorization, the original Buyer configuration, facilitator and merchant port. Use **Review**, **Save**, **Connect**, **Start**, then **Open**. Applications verifies the original startup against the selected project and live `/api/launch` response.

`starforge wfs binding --project /private/wfs/parcels` accepts the same operator configuration as `serve` and reports its complete launch binding. Use `--expected-binding-sha256` when an existing workflow already pins that selection. The project UUID, launch binding and current server instance are separate identities.

## Discover the service and save a feature selection

Start with the customer's actual published endpoint. The example names below show the command shape; select the returned source, schema, type and field identifiers for the real service.

~~~sh
starforge wfs discover --project /private/wfs/parcels \
  --id discover-service-1 --revision CURRENT_REVISION \
  --endpoint https://geo.example.org/geoserver/wfs \
  --name "Customer feature service" \
  --python /absolute/gis-venv/bin/python

starforge wfs catalog --project /private/wfs/parcels \
  --source SOURCE_SHA --offset 0 --limit 100

starforge wfs describe --project /private/wfs/parcels \
  --id describe-parcels-1 --revision CURRENT_REVISION \
  --source SOURCE_SHA --type-name customer:parcels \
  --python /absolute/gis-venv/bin/python

starforge wfs schema --project /private/wfs/parcels --schema SCHEMA_SHA
~~~

Read `show` for the current revision before a new source mutation. Each mutation has a stable ID and expected revision. Repeating the exact original ID and inputs reconciles the same operation; different inputs require a deliberate new operation.

Review the complete GetCapabilities and DescribeFeatureType documents, the qualified feature namespace, supported JSON representation, coordinate system and applicable source terms. `capabilities-file` and `schema-file` write their complete original bytes through `--out`. Use `--terms-file` to retain source terms with discovery.

A saved query includes the explicit WFS version, qualified type, coordinate representation, page size and stable sort. For example:

~~~json
{
  "version": "2.0.0",
  "typeName": "customer:parcels",
  "srsName": "urn:ogc:def:crs:EPSG::4326",
  "pageSize": 1000,
  "sortBy": [
    {"property": "parcel_id", "direction": "A"}
  ]
}
~~~

Select the actual advertised type, CRS and sort property. Include its unique key where available. Optional bounding-box coordinates remain exact numeric strings and require an explicit `bboxCrs`. An optional `cqlFilter` retains the chosen source filter text.

~~~sh
starforge wfs query --project /private/wfs/parcels \
  --id select-parcels-1 --revision CURRENT_REVISION \
  --source SOURCE_SHA --schema SCHEMA_SHA --name "Parcels edition" \
  --selection /private/wfs/operator/parcels-selection.json

starforge wfs order --project /private/wfs/parcels \
  --id acquire-parcels-1 --revision CURRENT_REVISION \
  --query QUERY_SHA --name "First acquisition" \
  --python /absolute/gis-venv/bin/python
~~~

The original source engine retains each actual request, accepted response page and its coverage. Known totals must remain consistent across explicit WFS start indexes. Unknown totals continue to the real terminal response under the original coverage rules. A rejected page is retained alongside the accepted prefix.

Inspect `order-show`, `features` and `inspect` for coverage, rows, pages, byte counts, retrieval times and the literal coordinate description. Read every selected page by following the returned offset. Exact source JSON number tokens remain in raw files and `featureJson`; display fields can use their text representation.

~~~sh
starforge wfs raw-page --project /private/wfs/parcels \
  --order ORDER_SHA --index 0 --out /private/wfs/exports/page-000.json

starforge wfs features-file --project /private/wfs/parcels \
  --order ORDER_SHA --out /private/wfs/exports/features-complete.geojson
~~~

Source authorization uses the original private `stellar-forge.wfs-source-auth.v1` file selected with `--source-auth`. Its origin bindings name environment variables for Bearer, API-key or Basic authorization. The [full source guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/wfs/README.md#source-access) gives the exact fields. Select the same configuration for discovery, schema capture, orders, resume and the browser.

## Produce native GIS files from the reviewed order

Open **Native vectors** in the same project. Capture one completed order with its actual source CRS and explicit x/y coordinate interpretation:

~~~sh
starforge wfs vector-capture --project /private/wfs/parcels \
  --id native-source-1 --order ORDER_SHA \
  --source-crs REVIEWED_SOURCE_CRS --coordinate-order x,y \
  --python /absolute/gis-venv/bin/python

starforge wfs vector-show --project /private/wfs/parcels \
  --id native-source-1 --python /absolute/gis-venv/bin/python

starforge wfs vector-document --project /private/wfs/parcels \
  --id native-source-1 --document profile \
  --out /private/wfs/operator/native-profile.json
~~~

The capture binds the complete original GeoJSON, order, service, type, requested and returned CRS information, feature identity and native source receipt. Its logical source ID remains stable across later orders of the same source. A deliberate source-coordinate reinterpretation uses a new capture.

Review the original profile's layers, native format, field order, aliases, physical types, exact-number representation and target CRS. The browser edits that complete profile through the original exact-JSON module. `targetCrs` selects a native transform; the captured source-coordinate binding remains attached. The [native vector mapping guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/stac/vector/README.md#review-native-representation) defines the complete representation contract.

~~~sh
starforge wfs vector-export --project /private/wfs/parcels \
  --id native-delivery-1 --capture native-source-1 \
  --profile /private/wfs/operator/native-profile.json \
  --python /absolute/gis-venv/bin/python

starforge wfs vector-file --project /private/wfs/parcels \
  --id native-delivery-1 --out /private/wfs/exports/parcels-native.zip \
  --python /absolute/gis-venv/bin/python
~~~

The original engine creates the selected GeoPackage and Shapefile members and companions, source copies, mappings and feature-to-native-row bindings. It reopens the actual native files before completing the operation. Its manifest identifies each exact file and source.

Capture a later complete order with the same logical identity and compare both native captures. `vector-compare` retains both complete sources, and `vector-changes` pages the original changes. `vector-file` also exports a complete comparison ZIP. The receiving guide covers both package forms and whole-project handover.

## Compare editions and publish the complete dataset

For source-level comparison, retain a second complete order and select a stable original feature key:

~~~sh
starforge wfs compare --project /private/wfs/parcels \
  --id compare-parcels-1 --revision CURRENT_REVISION \
  --before FIRST_ORDER_SHA --after SECOND_ORDER_SHA --key-pointer /id

starforge wfs comparison --project /private/wfs/parcels \
  --comparison COMPARISON_SHA --group changed --offset 0 --limit 100

starforge wfs plan --project /private/wfs/parcels \
  --order SECOND_ORDER_SHA --out /private/wfs/operator/dataset-plan.json

starforge wfs publish --project /private/wfs/parcels \
  --id publish-parcels-1 --revision CURRENT_REVISION \
  --order SECOND_ORDER_SHA --plan /private/wfs/operator/dataset-plan.json
~~~

The comparison preserves added, removed and changed features as well as duplicate and missing-key groups. Both original selections, literal coordinate representations and retrieval windows remain available for interpretation.

Review the generated dataset plan. The default retains feature ID, complete properties and geometry JSON, plus eligible scalar columns. The maintained dataset publisher validates the selected columns, filters and sort, and exports the complete data with original source copies. `publication` inspects the retained edition; `publication-open` opens its dataset browser.

For an actual merchant publication, supply the original customer's payment configuration and public origin through `--payment` and `--origin`. The original merchant serves the selected feature dataset and a full-project source product. The source product freezes the complete selected project when staged.

## Acquire and receive through the original Buyer

Inspect `preview` and the original merchant offer before preparing a paid request. `prepare` pins one intent, resource, snapshot and payment alternative. `buy` executes that original intent; `recover` reconciles its returned state. The original private Buyer configuration is selected through `--buyer-config`.

For a complete source-file dataset, prepare explicit maximum pages, rows and atomic-cost budget:

~~~sh
starforge wfs dataset-prepare --project /private/wfs/parcels \
  --publication PUBLICATION_SHA --id customer-sources-1 --kind sources \
  --max-pages 100 --max-total-atomic REVIEWED_ATOMIC_BUDGET --max-rows 1000000

starforge wfs dataset-create --project /private/wfs/parcels \
  --publication PUBLICATION_SHA --id customer-sources-1 \
  --buyer-config /private/wfs/operator/buyer.json

starforge wfs dataset-run --project /private/wfs/parcels \
  --publication PUBLICATION_SHA --id customer-sources-1 \
  --buyer-config /private/wfs/operator/buyer.json
~~~

Use the same dataset ID for inspect, recovery, accounting, finalization and delivery. After complete delivery, `dataset-receive` reconstructs the original source files through SF100. `customer-reopen` verifies and reopens the original project; `customer-open` displays that receiving workspace.

The source-file dataset retains all nine original columns and every member. The source product's complete compact-bundle allowance is 128 MiB. A larger whole-project handover uses the separate portable interface in [Receiving](RECEIVING.md).

## Attach merchant tools to the existing running project

The original `wfs-workspaces` provider borrows the already running WFS application. Select its private connection file, original project UUID and complete launch binding in a separate private host configuration:

~~~json
{
  "schema": "stellar-forge.wfs-workspace-host.v1",
  "workspaces": {
    "parcels": {
      "label": "Regional parcels",
      "connectionFile": "./parcels-connection.json",
      "projectId": "ORIGINAL_PROJECT_UUID",
      "expectedBindingSha256": "ORIGINAL_LAUNCH_BINDING_SHA256",
      "inputs": {},
      "merchantProfiles": {}
    }
  }
}
~~~

Replace both identity values from the actual retained startup. `connectionFile` refers to the original `stellar-forge.wfs-workspace-connection.v1` record written by `serve --connection-file`. A managed Applications URL record has a different contract. The client rereads the selected WFS record and checks the live original instance before each request.

~~~sh
starforge wfs mcp-init --directory /private/wfs/native-host \
  --connection /private/wfs/operator/wfs-workspaces.json
~~~

Use the returned `merchant-mcp.json` in the original merchant host. Repeating this initialization keeps the same selected connection, release store and customer-export directory. An existing release store can be selected explicitly with `--release-store`.

The family supplies 26 original tools covering project records, source review, complete orders, comparison, publication, paid requests, full Dataset receiving, native vector work and verified file reads. Start with `merchant_wfs_workspaces` and `merchant_wfs_status`. Project record pages pin the current revision; mutations retain stable operation IDs.

Host `inputs` can select complete project JSON, native vector ZIP or vector profile by path and SHA-256. A vector input can also pin its original manifest. For a large reviewed profile, select its original `vector-profile` alias and call `merchant_wfs_vector_export` with `profileInput` and `expectedSha256`. The existing file reader supports offset, digest and retained read identity for complete downloads.

The installed API entry `@tokenjunkielabs/starforge-merchant/seller/wfs` exports the same source, project, native vector, merchant, customer and portable functions. `openWfsApplication` exposes `query`, `action`, `download`, `cancel` and `close`; close the borrowed interface after its operation. Applications and merchant clients keep the original project's owner and lifetime.

## Current source and complete customer programme

The adoption includes all 34 original WFS files, the eight previously missing native-vector modules and browser files, the existing WFS contribution, and the original WFS additions to the maintained OGC capture engine. Existing native Python modules and current shared merchant/buyer/runtime implementations remain the selected dependencies. The additive native-runtime contribution supplies the browser route needed by the complete source builder.

The complete `SCF-WFS-GEOSOLUTIONS-CUSTOMER-7DE2-20261012` programme, retained source-capture selection and its original launcher are included under `wfs/examples/native-runtime/`. Continue that operation through its [original customer guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/wfs/examples/native-runtime/RUN_CUSTOMER.md), using the original source descriptor and existing owner. [Receiving](RECEIVING.md) describes the exact source packet, original native outputs and same-operation return.
