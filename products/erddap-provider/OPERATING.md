# ERDDAP source and provider workspace

Use this complete product to receive original scientific source, inspect its metadata and values, save queryable dataset editions, review the provider's intake profile, publish a native merchant and give another operator a complete receiving handoff. The same application supports ERDDAP grids and station tables.

## Install the selected product

The maintained source selection is `erddap-provider`. Build it from the complete selected source edition:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-source --ref FULL_SELECTED_COMMIT \
  --selection erddap-provider --out /absolute/erddap-package
```

The generated archive contains this complete guide as its package README. Retain the exact archive digest, selected source commit and package manifest returned by the maintained builder.

The complete managed runtime uses Linux, Node 22.16 or later, Python 3.11 or later, npm, and util-linux `flock`. Choose existing private parent directories for the installation, workspace and connection file. Prepare and install the exact selected archive with the original installer:

```sh
starforge runtime-install prepare \
  --dir /srv/starforge/runtimes/erddap-01 \
  --archive /srv/starforge/downloads/erddap.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator
starforge runtime-install install --dir /srv/starforge/runtimes/erddap-01
starforge runtime-install inspect --dir /srv/starforge/runtimes/erddap-01 --load --source
starforge runtime-install run --dir /srv/starforge/runtimes/erddap-01 -- \
  erddap --workspace /srv/starforge/workspaces/ocean init
```

Use the actual archive pathname and SHA256 returned by your selected build. If `starforge` is not yet installed, run the same maintained installer through `node /absolute/merchant-source/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs`. The installation retains its selected package and declared native/schema/OpenAPI/MCP dependencies. Its complete operating and recovery contract is included at `source/stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md`.

Set `SF30_XML_NODE` when the receiving host needs an explicit Node executable. The reusable browser receiving driver uses an existing Playwright 1.51 or later and Chromium. Ordinary operator use opens the application's original private URL in a normal browser.

| Installed entry | Complete work |
| --- | --- |
| `starforge erddap` | Search/acquisition, source inspection, mappings, native dataset editions and query, source/customer export, merchant publication and buyer receiving |
| `starforge erddap-provider-handoff` | Source-grounded provider profile, exact saved revisions, working review or ready handoff export and independent receiving |
| Existing merchant MCP host | 36 typed ERDDAP tools, including ten provider-intake operations, through the original configured operator |
| Original SDK exports | Seller, buyer, merchant, operator client and provider-intake client |

The complete source directory is `stellar/scf-starforge-20261009/sf30-seller-sdk/erddap`. Source checkout examples below use `ERDDAP` for that absolute directory. Installed `starforge` commands invoke the same authored entrypoints.

## Included original reference source

The selected reference is `delivery/captures/ndbc-46042-june-2023.erddap.zip`: the complete 76,522-byte source capture with SHA256 `e52246a67df21d4acf58749e9b08ec76f32cc9d36f9d0595ed4f6040c4c48540`. It preserves 144 original NDBC station 46042 records on 1 June 2023, metadata, DDS, DAS, JSON, CSV and the actual acquisition receipt. The source's station, coordinates, fields, units, time strings, quality/missing values, processing history and license stay in those original responses.

The public technical contact is retained as source metadata. An appointed scientific contact remains unanswered until supplied by the provider. This reference therefore exercises the complete working-review export and receiving path with that visible question; the actual core review determines ready-export availability.

For a new provider request, use the application's live metadata/query workflow and retain its actual complete response. The 144-row June 2023 NDBC selection remains the provider-intake reference. The same selected product also contains the complete original grid and three-day station captures for explicit edition comparison and coastal work.

### Complete fixed historical source set

All five original source ZIPs are included under `delivery/captures/`. Each contains the complete retained metadata, DDS, DAS, JSON, CSV and acquisition manifest. The exact sizes and SHA256 values are recorded in `products/erddap-provider/SOURCE.json` and the full import guide at `delivery/CAPTURE_IMPORT.md`.

| Original selection | Rows | Source ZIP |
| --- | ---: | --- |
| mur-sst-june-2025 | 27 | `mur-sst-june-2025.erddap.zip` |
| ndbc-46042-june-2023 | 144 | `ndbc-46042-june-2023.erddap.zip` |
| mur-sst-june-2023 | 27 | `mur-sst-june-2023.erddap.zip` |
| mur-46042-nearby-june-2023 | 27 | `mur-46042-nearby-june-2023.erddap.zip` |
| ndbc-46042-three-days-june-2023 | 432 | `ndbc-46042-three-days-june-2023.erddap.zip` |

The total across these editions is 657 selected rows. The 144-row NDBC edition overlaps the 432-row edition, and the MUR grids use their actual returned coordinates. Keep the editions and their original time/spatial bounds explicit when comparing them.

Choose a retained `NOAA_OPERATION` directory for the complete five-source workflow. Use the following packet order so the maintained helper keeps the same comparison sequence:

~~~sh
python3 -B "$ERDDAP/delivery/native-receive.py" \
  --source-root "$ERDDAP" \
  --operation-root "$NOAA_OPERATION" \
  --source-packet "$ERDDAP/delivery/captures/mur-sst-june-2025.erddap.zip" \
  --source-packet "$ERDDAP/delivery/captures/ndbc-46042-june-2023.erddap.zip" \
  --source-packet "$ERDDAP/delivery/captures/mur-sst-june-2023.erddap.zip" \
  --source-packet "$ERDDAP/delivery/captures/mur-46042-nearby-june-2023.erddap.zip" \
  --source-packet "$ERDDAP/delivery/captures/ndbc-46042-three-days-june-2023.erddap.zip"
~~~

This completes saved source/mapping/build creation, all native cursor rows, dataset exports, three edition comparisons, five original customer packets, independent receiving and matching row reads after closing and reopening the receiver. The result is retained at `NOAA_OPERATION/native/native-result.json`. Continue the same directory and packet order after an interruption; the helper reuses its original completed outputs.

The source comparison accepts numerically equal JSON/CSV spellings such as `36` and `36.0` using exact decimal comparison. It preserves both original files and their parsed numeric tokens; it still reports a genuinely different decimal. Retain the original non-UTF8 DAS bytes when moving source files. A verified source ZIP preserves those bytes, while a text-decoding file client may transform them even when it reports the original Git blob identity.



This workbench turns an explicit ERDDAP grid or station-table selection into a saved native dataset, a versioned merchant release and a complete customer receiving packet. It keeps the provider's original responses, reviewed mapping and useful output together.

The operator searches a provider catalogue, selects fields and fixed bounds, reviews the actual values, units, quality flags and license, then saves an edition. A later source can be compared through the same mapping. The customer imports the complete original packet and rebuilds the same dataset with the existing SF30 engine.

## Open the workbench

The maintained merchant distribution supplies the command:

~~~sh
starforge erddap --workspace /private/ocean-workspace init
starforge erddap --workspace /private/ocean-workspace serve \
  --connection-file /private/ocean-connection/startup.json
~~~

The selected workspace and connection-file parent are private directories owned by the operator. The server prints its current local URL. Open that URL in the browser; its fragment is the private capability for this running workspace. The server binds loopback and checks the current origin and capability on API requests. Restarting the same workspace refreshes only a startup record already belonging to it.

For a source checkout, set ERDDAP to the absolute directory containing this README and use the original entrypoint:

~~~sh
node "$ERDDAP/cli.mjs" --workspace /private/ocean-workspace init
node "$ERDDAP/cli.mjs" --workspace /private/ocean-workspace serve \
  --connection-file /private/ocean-connection/startup.json
~~~

The installed package retains the surrounding original SF30 runtime and Python XML workspace. Python 3.10 or later, SQLite and the package's supported Node runtime are required. The Python adapter uses the standard library. The Node engine uses the installed merchant package's declared dependencies. Set SF30_ERDDAP_PYTHON or CODEX_PRIMARY_RUNTIME_PYTHON when selecting a particular Python executable; the Node entrypoint passes its actual executable to the original engine.

In Managed Applications, choose **Ocean and environmental data**, select that same initialized workspace and optionally its private connection file, then use the existing Start/Open/Stop controls. Startup is checked against the actual listener's workspace, instance and start time. The Applications host owns its normal lifecycle.

## Receive a source or choose a provider request

The workbench accepts a complete .erddap.zip source capture. It also makes actual requests to a selected ERDDAP provider:

1. Open the catalogue and enter the provider's HTTPS /erddap URL.
2. Search or enter an exact dataset route. Inspect its original info JSON, DDS and DAS before selecting data.
3. For a grid, select variables and every DDS axis in original dimension order. Choose fixed values or fixed indices and an explicit stride. Descending coordinate values are valid when that is the provider's original index order.
4. For a station table, select exact variables and explicit constraints. String and time constraints remain distinguishable. Any requested orderBy uses selected original fields.
5. Review the decoded request, save it, then acquire the selection. The browser retains the acquisition operation ID and request before sending.
6. Inspect the completed original JSON/CSV pair, row count, actual coordinates, missing values, quality attributes and source license.

A griddap value selector asks ERDDAP for its nearest available coordinate. The workbench displays the coordinates actually returned; a requested value does not replace the original coordinate. Fixed timestamps and bounds make later source comparisons intelligible. No moving last/now selector, hidden observation cap, interpolation or implicit quality filter is added.

The provider route and publisher identifier are distinct. For example, NOAA's route jplMURSST41 carries the publisher identifier MUR-JPL-L4-GLOB-v04.1. Source inspection retains both.

### Use the complete included reference or retain a live request

Open the included `delivery/captures/ndbc-46042-june-2023.erddap.zip` through **Add source**, or pass its exact path to `source-add`. The 144-row source identity is listed above. Its original metadata and data responses are preserved byte-for-byte.

The live acquisition controls use the original ERDDAP metadata to select a request the provider actually serves. Save its query and stable operation ID, retain every completed response and recover that same operation after an interruption. The source capture's receipt records its actual retrieval route and fields.

### Recover an interrupted acquisition

Use the original operation, including an overridden label:

~~~sh
starforge erddap --workspace /private/ocean-workspace operation --id ORIGINAL_OPERATION_ID
starforge erddap --workspace /private/ocean-workspace acquire \
  --query ORIGINAL_QUERY_ID --operation ORIGINAL_OPERATION_ID --label "Original saved label"
~~~

The operation read validates its retained request.json and exposes request.queryId and request.label. Use those values after a lost response or loss of browser storage. An original request can precede its SQLite index after a crash; the same read exposes that request-only checkpoint. A different request cannot reuse the operation ID. A provider error retains its actual status and Retry-After for the operator's continuation.

## Review the scientific values and save an edition

Every source keeps the complete original number tokens, strings, nulls, types, units, attributes, flag masks/values/meanings, fill/missing metadata and source history. NOAA ERDDAP already serializes destination values; this adapter does not apply a second scale/offset conversion.

The default mapping uses native strings for numeric tokens. This preserves a decimal such as 0.10000000000000001 instead of rounding it through a binary floating-point conversion. Selecting native number/integer is an explicit reviewed conversion through the original native parser. Nullable source text uses JSON-cell encoding so null and an empty string remain distinct.

The source review compares JSON and CSV according to the actual upstream writers: UTF-8 JSON, ERDDAP's original numeric/null behavior, ISO-8859-1 separated values, original names/units rows and source string escaping. The default csvPolicy requires an equivalent pair. A deliberate canonical-json mapping retains an unequal original CSV response and makes that difference visible while selecting JSON as the data basis.

A mapping binds provider, dataset route, protocol, selected columns, native aliases/types, keys, filters, ranges, sorts and limits. It is immutable once saved. Edition comparisons use explicit unique keys and exact projected cells. The grid's original coordinate tuple is the proposed key. For tables, station/time is proposed only when those original fields are present and suitable; duplicates require an operator decision.

CLI equivalents:

~~~sh
starforge erddap --workspace /private/ocean-workspace source-add \
  --file /private/noaa-capture/mur-sst-june-2025.erddap.zip --label "MUR June 2025"
starforge erddap --workspace /private/ocean-workspace mapping \
  --source SOURCE_ID --out /private/mur-mapping.json
starforge erddap --workspace /private/ocean-workspace save-mapping \
  --input /private/mur-mapping.json
starforge erddap --workspace /private/ocean-workspace build \
  --source SOURCE_ID --mapping MAPPING_ID
starforge erddap --workspace /private/ocean-workspace native-query \
  --build BUILD_ID --params '{"limit":"50"}'
~~~

The original engine supplies field selection, configured filters/ranges/sorts and cursor pages. Pass native parameters as strings. The complete build retains the actual projected data.csv, dataset.json, original rows index, source, mapping, native snapshot and review.

To compare a later complete capture, build it with the same reviewed mapping, then:

~~~sh
starforge erddap --workspace /private/ocean-workspace compare \
  --before ORIGINAL_BUILD_ID --after LATER_BUILD_ID
starforge erddap --workspace /private/ocean-workspace changes \
  --id COMPARISON_ID --offset 0 --limit 100
~~~

Follow nextOffset through the original change pages. A source refresh may change values, add/remove observations or leave them unchanged. Original response preparation times alone do not constitute a changed scientific value. Distinct providers or incompatible mappings remain separate products.

## Give a customer the complete source and edition

Export the selected full packet and import it in an independent saved workspace:

~~~sh
starforge erddap --workspace /private/ocean-workspace export \
  --build BUILD_ID --out /private/delivery/mur-edition.erddap.zip

starforge erddap --workspace /private/customer-ocean init
starforge erddap --workspace /private/customer-ocean receive \
  --file /private/delivery/mur-edition.erddap.zip
starforge erddap --workspace /private/customer-ocean native-query \
  --build BUILD_ID --params '{"limit":"50"}'
~~~

The packet contains the complete original ERDDAP capture, reviewed mapping, data.csv, dataset.json, review.json and manifest.json. Receiving validates the exact members and original source/mapping identities, then rebuilds through the same SF30 native engine. The reconstructed dataset, snapshot and output files must match the selected edition.

Repeated export from the same workspace uses its retained exact packet bytes. An interrupted original ZIP publication is adopted only after every current source/mapping/native member matches. The standalone native receiving entrypoint below checks complete cursor output and closes/reopens the receiving workspace.

## Publish and maintain a native merchant

Export the complete native dataset first:

~~~sh
starforge erddap --workspace /private/ocean-workspace export-dataset \
  --build BUILD_ID --out /private/mur-native-dataset
~~~

This directory contains data.csv, dataset.json and erddap-lineage.json. Lineage binds the provider route, publisher metadata, selected request, complete source response identities, exact mapping, original engine and snapshot.

Use the original merchant public-terms JSON for the actual selected Stellar payment asset, amount and receiver. The adapter passes it unchanged to the original seller compiler.

~~~sh
starforge erddap merchant prepare \
  --dataset /private/mur-native-dataset \
  --payment /private/original-public-terms.json \
  --origin https://data.example.org --path /ocean/mur \
  --out /private/mur-release

starforge erddap merchant inspect --release /private/mur-release
starforge erddap merchant serve --release /private/mur-release \
  --state /private/mur-seller-state --port 8423 \
  --facilitator https://your-original-facilitator.example
~~~

Use the existing TLS/reverse-proxy deployment for the declared public origin. An explicitly selected loopback facilitator uses --allow-local-facilitator. The original seller reports its actual mode and retains payment/admission/control behavior.

A later edition uses the same project mapping, public route and payment terms. Prepare its release, inspect the actual seller status, then publish with both original concurrency checks:

~~~sh
starforge erddap merchant status --state /private/mur-seller-state
starforge erddap merchant publish --release /private/mur-later-release \
  --state /private/mur-seller-state \
  --expect CURRENT_SNAPSHOT --expect-revision CURRENT_REVISION
~~~

The original version store serializes publication. Retention limits, cached versions, memory/row limits, request admission and drain grace remain original seller controls. A stale snapshot/revision returns the native conflict for review. Selecting a retained previous edition uses merchant activate with the same expected snapshot/revision. merchant collect performs the original retention collection.

## Original SF88 customer offer, acquisition and accounting

Read the actual live fixed-edition offer:

~~~sh
starforge erddap buyer offer --release /private/mur-release \
  --seller https://data.example.org --query '{"limit":"50"}'
~~~

Review the returned actual offer and accepted payment option, then save its exact native buyer configuration:

~~~sh
starforge erddap buyer prepare --release /private/mur-release \
  --seller https://data.example.org --query '{"limit":"50"}' \
  --intent ORIGINAL_INTENT_ID --accept-index ACCEPTED_OPTION_INDEX \
  --offer-sha ACTUAL_OFFER_SHA256 --out /private/mur-buyer.json
~~~

The preparation rereads the original live offer, pins the selected snapshot and verifies its exact hash. Identical configuration retries reuse the same complete file. Existing buyer setup supplies the operator account and approved reservation policy.

The buyer subcommands init/status/run/recover/export/deliver/accounting/finalize call the original SF88 dataset CLI unchanged. For example:

~~~sh
starforge erddap buyer init --session /private/mur-customer-session \
  --config /private/mur-buyer.json --max-pages 20 \
  --max-total-atomic APPROVED_TOTAL --max-rows APPROVED_ROW_COUNT
starforge erddap buyer run --session /private/mur-customer-session
starforge erddap buyer status --session /private/mur-customer-session
starforge erddap buyer deliver --session /private/mur-customer-session \
  --out /private/customer-delivery
~~~

Continue an interrupted paid page using the same original session and recover. Its original quote review, approval, reservation, signing custody, receipts, accounting and final delivery retain authority. The ERDDAP adapter does not create another financial controller.

## Connect the existing merchant MCP host

The source-owned erddap-workspaces provider adds 36 tools for existing operator aliases, complete catalogue/metadata/query/acquisition/source review, mappings, native builds/queries, edition comparisons and exact file receiving. It borrows the original running HTTP workspace.

Create a private connection JSON using the actual absolute workspace/startup paths and original source-file hashes:

~~~json
{
  "schema": "stellar-forge.erddap-workspace-connection.v1",
  "workspaces": {
    "ocean": {
      "label": "Ocean data",
      "workspace": "/private/ocean-workspace",
      "connectionFile": "/private/ocean-connection/startup.json",
      "inputs": {
        "mur-june": {
          "path": "/private/noaa-capture/mur-sst-june-2025.erddap.zip",
          "kind": "source",
          "label": "MUR June 2025",
          "sha256": "REPLACE_WITH_THE_ACTUAL_COMPLETE_FILE_SHA256"
        }
      }
    }
  }
}
~~~

The placeholder must be replaced with the real 64-character hash before initialization. A customer packet input uses kind packet; a complete provider intake bundle uses kind handoff. Input aliases are selected by the host; a tool caller cannot substitute an arbitrary filesystem path.

In the complete merchant configuration, set erddapWorkspaceConnection to this private file. The original provider registry reads the source-owned distribution contribution automatically. A programmatic original setup helper is also available:

~~~js
import { initializeErddapMerchant } from './mcp-setup.mjs';
await initializeErddapMerchant({
  directory: '/private/ocean-merchant',
  connection: '/private/ocean-connection/workspaces.json',
  name: 'Ocean observations'
});
~~~

Before each request, the client checks the actual listener's instance and workspace through /api/launch. Source pages preserve original numeric lexemes. Collection continuations bind the exact current view. Mutations retain original query/operation/source/build identities.

Large file receiving uses the existing RetainedFileReads interface, complete SHA256 and byte counts, and original offset continuation. Downloaded source, dataset and customer packets remain in the merchant's private exports directory. Closing the borrowed MCP owner drains its accepted calls and readers; the original Application remains under its own lifecycle.

The typed client export is ./client/erddap; merchant/buyer exports are ./seller/erddap and ./buyer/erddap. See [HTTP_API.md](source/stellar/scf-starforge-20261009/sf30-seller-sdk/erddap/HTTP_API.md) for the full native operator ABI.

## Complete provider intake and receiving

The same saved source now supplies an explicit provider profile, immutable reviewed revisions, readiness findings and complete review/ready bundles. Source-derived fields preserve their original descriptions, units, time representations, station identifiers, masks and license text. The operator reviews contacts, attribution, station context, time conventions and quality definitions before marking a ready bundle. Customer receiving independently verifies the complete retained source and original review; it keeps that handoff separate from the local source/build catalogue.

Use `starforge-merchant erddap provider-handoff --help` or the installed `erddap-provider-handoff` command for the original standalone CLI. The typed `./provider/erddap` client and ten provider MCP methods use the same running ERDDAP HTTP owner. [PROVIDER_CLIENT.md](source/stellar/scf-starforge-20261009/sf30-seller-sdk/erddap/PROVIDER_CLIENT.md) gives complete original CLI, SDK, MCP and file-receiving instructions. [PROVIDER_HANDOFF.md](source/stellar/scf-starforge-20261009/sf30-seller-sdk/erddap/PROVIDER_HANDOFF.md) describes the complete station, time, quality, source and readiness rules.

## Whole native and browser receiving

The complete source includes reusable native dataset, provider handoff and browser receiving entrypoints. They consume actual captured source ZIPs and keep their original workspaces and checkpoints through failure.

First, the original native source-to-customer operation:

~~~sh
python3 -B "$ERDDAP/delivery/native-receive.py" \
  --source-root "$ERDDAP" --operation-root /private/erddap-operation \
  --source-packet /private/noaa-capture/mur-sst-june-2025.erddap.zip \
  --source-packet /private/noaa-capture/ndbc-46042-june-2025.erddap.zip
~~~

It imports complete originals, proposes the explicit lexical mapping, builds through the original engine, reads every native cursor page, exports seller datasets and complete customer packets, then independently reconstructs and closes/reopens each received edition. Actual same-mapping source pairs also produce the full original comparison. native/native-result.json records the actual results and source/engine identities.

Then run the existing browser owner on that same now-closed workspace:

~~~sh
python3 -B "$ERDDAP/delivery/browser-owner.py" \
  --source-root "$ERDDAP" --operation-root /private/erddap-operation \
  --workspace /private/erddap-operation/workspace
~~~

The browser owner uses the selected Node/Playwright/Chromium environment. It owns one page/context, the original operator and one independent customer receiver. It operates real source upload, reviewed mapping, build/native cursor query, preserved drafts, edition comparison, source/native/project downloads and customer receiving, then reopens the closed receiving workspace.

Set CODEX_PRIMARY_RUNTIME_NODE and CODEX_PRIMARY_RUNTIME_NODE_MODULES to the existing installed runtime. ERDDAP_CHROMIUM_EXECUTABLE selects the existing Chromium binary. A selected --temporary-root moves only this invocation's transient native/browser scratch to that volume; all input packets, original workspaces, outputs and checkpoints remain under the retained operation root. --screenshots records optional browser views in the private operation.

Continue the same command and operation directory after a concrete failure. Original completed output identities are checked before reuse. The drivers do not repeat provider acquisition or issue a paid customer request.

### Complete retained NDBC provider receiving

For the exact retained NOAA NDBC station 46042 selection on 1 June 2023, the provider entrypoint runs the original dataset receiving operation and continues through the complete saved provider review:

~~~sh
python3 -B "$ERDDAP/delivery/provider-native-receive.py" \
  --source-root "$ERDDAP" --operation-root "$PROVIDER_OPERATION" \
  --capture "$NDBC_2023_CAPTURE" --ndbc-2023-reference
~~~

Select NDBC_2023_CAPTURE as the complete original five-response capture ZIP. The reference recipe verifies all five original response hashes, the 144 selected rows, the nine original columns and station/time selection before preparing its profile. It retains the exact public technical contact, source licensing and processing history. It leaves the separately appointed scientific contact for the provider to supply.

The same entrypoint first completes the original native dataset build, full cursor read and independent customer reconstruction. It then saves two source-bound provider review revisions, recovers the exact saved request, exercises the original stale-parent conflict, exports both complete review bundles and independently receives and reopens their original bytes. A ready export follows the actual core review. The direct profile is retained as handoff-profile.json; provider-native/provider-result.json records the returned disposition and complete original artifacts.

The browser continues that same closed workspace and profile:

~~~sh
python3 -B "$ERDDAP/delivery/browser-owner.py" \
  --source-root "$ERDDAP" --operation-root "$PROVIDER_OPERATION" \
  --workspace "$PROVIDER_OPERATION/workspace" \
  --handoff-profile "$PROVIDER_OPERATION/handoff-profile.json"
~~~

Use Playwright 1.51 or later for the original IndexedDB draft-recovery phase. For another actual source, supply its complete reviewed direct profile with --profile instead of selecting the NDBC reference recipe. Keep the original operation directory across interruption: the helper retains its source, request, native workspaces, profile and accepted export/receiving checkpoints.

## Source, rights and operating limits

[PRIMARY_SOURCES.md](source/stellar/scf-starforge-20261009/sf30-seller-sdk/erddap/PRIMARY_SOURCES.md) records the original NOAA endpoints, ERDDAP writer/version identities and scientific semantics used by this adapter. Read the actual retained source license, attribution, restrictions and history for the selected dataset. NOAA hosting does not erase third-party notices carried by the dataset.

Retained source ZIPs are limited to 256 MiB, and customer packets to the original 512 MiB cap. Mapping limits constrain projected bytes, rows and cell size. Full source parsing retains the selected table in memory; choose source bounds that fit the actual host. The UI exposes limits and all original rows rather than silently truncating the scientific dataset.

Keep private workspace/startup files, MCP connection files, source-access credentials and buyer accounting custody outside customer source exports. The portable customer packet contains the selected original scientific data and its full source/mapping/native lineage.

## Selected package contents and receiving

The `erddap` source contribution supplies both commands, all five SDK exports, the original application provider and the original merchant-provider registration. The selection carries the complete ERDDAP Python/Node/browser implementation, its original XML/dataset engine dependencies, versioned merchant and customer tools, runtime installer, configured agent host and complete receiving entrypoints.

The installed SDK entrypoints are `./seller/erddap`, `./buyer/erddap`, `./merchant/erddap`, `./client/erddap` and `./provider/erddap`. They preserve the same original workspace, private connection and source-owned request/recovery rules as the visible operator.

Use `delivery/provider-native-receive.py --ndbc-2023-reference` with the included exact source. Retain its operation directory. After that original workspace closes, the maintained browser owner continues the same `OP/workspace` and direct `OP/handoff-profile.json`; it receives complete review/customer bundles into its independent receiving workspace and reopens the original results. The exact commands appear in the complete receiving section above.

Set the actual host's `CODEX_PRIMARY_RUNTIME_NODE`, `CODEX_PRIMARY_RUNTIME_NODE_MODULES` and `ERDDAP_CHROMIUM_EXECUTABLE` for that browser owner. Keep private connection/startup state and any merchant signing files in the receiving host's private storage.

The queryable dataset packet, provider handoff and buyer offer remain distinct original artifacts. A dataset packet contains the complete source/mapping/build needed for independent native queries. A provider bundle contains the complete selected source/profile/review needed for intake. A buyer offer retains the selected merchant snapshot and explicit payment terms.

Scientific license and attribution remain with the original source responses. Authored product source follows the repository's MIT license. This selected product contains no commercial-case or recipient documents.
