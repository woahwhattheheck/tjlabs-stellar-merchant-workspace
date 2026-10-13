# EPA ECHO facility portfolios

Use the installed EPA ECHO application to carry a facility portfolio from its original agency reports through staff review, dated comparisons, queryable datasets, publisher releases, customer files and complete workspace receiving. The browser, terminal and merchant tools operate the same workspace and retained source editions.

The maintained named selection is `epa-echo`. It includes the original product, source example, operating programme and the existing Runtime workspace, native publisher, buyer and customer receiver. Start with this guide; [Receiving and continuation](RECEIVING.md) covers an existing installation or customer handover. The [original complete installation guide](../../stellar/scf-starforge-20261009/distribution/selections/EPA_ECHO.md) travels inside the selected package.

## Install the selected product

Choose the complete immutable source revision that contains this adoption. Use an owned checkout of this repository and the original distribution builder:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace \
  --ref COMPLETE_SOURCE_COMMIT \
  --selection epa-echo \
  --out /absolute/epa-echo-release
```

Retain the builder's returned archive name, byte count, SHA-256, selected source commit and recipe identity. The source selection is a committed input; its package version includes `.selection.epa-echo`. Use the returned archive, rather than reconstructing a smaller tree around the browser.

Prepare the original runtime with the features used by the complete programme:

```sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/epa-echo-runtime \
  --archive /absolute/epa-echo-release/ORIGINAL.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator
```

An equipped receiver can place its complete retained dependency tree and original lock into this prepared runtime, then use the existing adoption path:

```sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/epa-echo-runtime --adopt-existing

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/epa-echo-runtime --load --source
```

The original installer checks the selected profile, source, dependencies and native imports. A first installation uses the same installer's normal installation or supported cache/offline path. Preserve its complete dependency lock and READY installation identity.

Use `build.mjs --repo /absolute/merchant-workspace --out /absolute/epa-echo-release --resume` for that build's continuation, and `runtime-install-cli.mjs resume --dir /absolute/epa-echo-runtime` for that installation's continuation. Their original directories retain the selected source and operation. The [runtime installation guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) defines the complete archive, dependency and recovery contracts.

The following commands use `starforge` from that READY installation. An equivalent invocation is:

```sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/epa-echo-runtime -- COMMAND ARGUMENTS
```

## Open the operator desk

Attach the READY runtime to the original Runtime workspace:

```sh
starforge runtime-workspace init --workspace /private/epa-runtime-desk
starforge runtime-workspace attach --workspace /private/epa-runtime-desk \
  --runtime /absolute/epa-echo-runtime --label "EPA ECHO facility portfolios"
starforge runtime-workspace serve --workspace /private/epa-runtime-desk --port 8465
```

In **Applications**, select **EPA ECHO facility portfolios** and that installation. Select the original private EPA workspace, or a new workspace in an existing private parent. Optional inputs are the original SF88 buyer inbox, the private SF82 release-runtime JSON and an identifying User-Agent.

Choose **Review**, **Save**, **Connect**, **Start**, then **Open**. The original launcher retains the reviewed source and files, pins an existing workspace UUID and checks the native startup record before admitting its private loopback URL. Normal captures, notes and receipts can change without invalidating that stable workspace identity.

The direct command operates the same product:

```sh
starforge epa-echo-workspace --workspace /private/epa/portfolio \
  --inbox /private/epa/buyer-inbox \
  --release-runtime /private/epa/release-runtime.json \
  --startup-format json --port 0
```

The inbox and release-runtime arguments are optional for source review. The runtime JSON is interpreted by the original SF82 normalizer. Keep the active workspace with its original writer; use the authenticated browser, session CLI or merchant attachment to work with that running process.

### Use the matching session record

| Consumer | Original selected input |
| --- | --- |
| Browser | The private URL returned by the running EPA workspace or Applications |
| `epa-echo --session` | A private JSON file containing the original EPA startup record with schema `stellar-forge.epa-echo-workspace-startup.v1` and status `EPA_ECHO_READY` |
| Merchant `applicationUrlFile` | The current original managed Applications URL record for the selected workspace UUID |
| Merchant `consoleUrlFile` or `consoleUrlEnv` | A private URL file or named host environment variable containing the current EPA loopback session URL |

The CLI session record and managed Applications record have different schemas. Use the original record required by the selected interface. The browser moves its capability out of the address bar and authenticates subsequent requests.

## Build and inspect a facility portfolio

Create a portfolio with an ordered set of original twelve-digit FRS RegistryIDs. Save its customer, responsible owner and working note. FRS identity selects a facility; EPA programme SourceID values remain attached to their programme records.

The application can acquire a source edition through the original public EPA services or import a complete retained source package. The installed example is:

```text
source/stellar/scf-starforge-20261009/sf30-seller-sdk/epa-echo/examples/dc-wastewater-source-20261012.json
```

It contains 826,432 bytes, SHA-256 `c737c859126057359c3918e20e4553651b31ab14532060c64aa49f25a7fe24d9`. Its original ordered selection is:

1. `110072033839`
2. `110072235550`
3. `110029030144`
4. `110072237877`

This package retains two original searches, four full facility reports, source metadata and the complete linked service specification. Importing it uses those retained responses. The separate [projection example](../../stellar/scf-starforge-20261009/sf30-seller-sdk/epa-echo/examples/dc-wastewater-projection-20261012.json) records its complete source-derived counts and comparison:

| Table | Retained rows | Interpretation |
| --- | ---: | --- |
| Facilities | 4 | Selected FRS facilities |
| Programme and permit records | 25 | Original programme identifiers and permit records |
| Current programme summaries | 10 | Each programme's own compliance summary and period |
| Quarterly reporting | 4,836 | Original fields paired with their own section date headers |
| Inspections | 54 | Original compliance-history inspection records |
| Actions and notices | 8 | Original enforcement and notice records |
| Dates and source metadata | 6,624 | Original extraction dates, programme and header metadata |
| All source fields | 9,300 | Every original report leaf, including contextual sections |

Read the current schema and table columns before selecting fields. The browser and CLI table pages use an offset, limit and returned next offset. Edition archive paging also pins its retained revision. Continue until the complete selected table is covered.

Open each selected facility's full report, original response and source dates. The original provider reports, programme histories and contextual map neighbours retain their different meanings. A neighbouring map record does not become another selected portfolio facility.

The shared exact-JSON parser keeps numeric tokens as exact text. EPA's decoder records repeated identical members with their original positions and types. Other source consumers retain the parser's strict default duplicate rejection. Original null, empty, numeric and string values remain distinguishable.

Separate ISO columns normalize valid date-only values for chronological queries. Original display dates, programme reporting periods, source extraction dates and acquisition times remain alongside them.

## Compare editions and record decisions

Retain another dated source edition, select the intended earlier and later editions, then compare each relevant table. The comparison preserves repeated records and original array positions where no stable source identifier exists. Its result describes changes in those retained source reports.

Save a staff review against the selected portfolio, edition and facility. Reviews carry a subject, note, status, owner and due date. The status vocabulary is `open`, `reviewed`, `follow_up` and `resolved`; review history stays separate from the original agency values.

Every mutation has an original operation ID and the revision opened by the operator. Read the current view before a new edit. If another edit wins, inspect that current revision and retain the entered decision while reviewing the conflict. If a reply is lost, continue the same request with the same operation ID and payload; the original journal recognizes it before admitting a new revision.

Source and complete-workspace imports retain a compact file fingerprint with their pending browser request. After reload, reselect the same complete file to reconstruct the original request. The full source package remains outside browser draft storage.

## Prepare a queryable dataset

Select a retained edition and one original table, then prepare its dataset through the existing SF30 engine. The result retains the complete table, configuration, source edition, original provider bytes and provenance manifest.

Use the dataset's declared columns and query contract:

| Query | Meaning |
| --- | --- |
| `fields=column_a,column_b` | Select declared output columns |
| `where_COLUMN=value` | Exact equality on an advertised filter |
| `gt_`, `gte_`, `lt_`, `lte_` | Advertised typed range filtering |
| `sort=COLUMN` or `sort=-COLUMN` | Advertised ascending or descending order |
| `limit`, then the returned `nextCursor` | Continue the same query and snapshot |

Use the separately declared ISO columns for chronological filters and sorts. The exact source numeric strings are retained as strings. The dataset's own schema and parameter limits govern every query.

The original dataset preparation supports a complete selected table up to 250,000 rows. Raw source and portable limits are exposed by the workspace schema. A source exceeding a projected table limit keeps its original retained data and explicit capacity result.

## Publish and receive customer files

Prepare an immutable SF82 release from the selected dataset. Review its original source binding, route, payment settings and runtime, then activate and start that exact release generation. Stop drains its original publisher. Restore previous selects its retained predecessor through the existing release history.

A buyer receiving workflow selects completed original SF88 page intents from the configured inbox. Use the original intent order, response bodies and finalizations. SF100 receiving publishes these complete files:

| File | Use |
| --- | --- |
| `dataset.csv` | Complete tabular customer result |
| `dataset.jsonl` | Complete row records |
| `review.html` | Readable portable review |
| `delivery.json` | Original delivery, source and intent identities |
| `manifest.json` | Exact file lengths and SHA-256 values |

Download each selected file through the authenticated application or merchant receiver. Retain the original receipt and all five files together. The original customer operation's payments and finalizations remain with its existing buyer and signer owner.

## Operate from a terminal or agent

The installed `epa-echo` CLI exposes the original nineteen commands. An attached terminal uses the original startup descriptor:

```sh
starforge epa-echo --session /private/epa/startup.json view
starforge epa-echo --session /private/epa/startup.json editions --offset 0 --limit 100
starforge epa-echo --session /private/epa/startup.json rows \
  --edition-id ORIGINAL_EDITION_ID --table facilities --offset 0 --limit 100
starforge epa-echo --session /private/epa/startup.json action \
  --request /private/epa/review-request.json
```

The action file contains `action`, `payload`, `operationId` and `expectedRevision`. Keep that exact saved request after an uncertain reply. A terminal opening an idle workspace uses `--workspace`; lasting publisher execution uses the running session.

The source-owned merchant provider is `epa-echo-workspaces`, with configuration family `echoWorkspaces`. Its thirty-five tools cover portfolios, source searches/captures, complete tables, reviews, datasets, native release control, buyer receiving and complete file transfer.

The [merchant guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/epa-echo/MCP.md) supplies the exact private connection schema and `initializeEchoWorkspaceMerchant` API. It borrows the running EPA workspace through one selected session reference and its stable UUID. Source and workspace package aliases are pinned to their full file hashes.

The installed `epa-echo-mcp` client operates the existing authenticated merchant endpoint:

```sh
starforge epa-echo-mcp tools --url http://127.0.0.1:PORT/mcp \
  --workspace portfolio --token-env MERCHANT_TOKEN

starforge epa-echo-mcp download --url http://127.0.0.1:PORT/mcp \
  --workspace portfolio --token-env MERCHANT_TOKEN \
  --kind receipt --id ORIGINAL_RECEIPT_ID \
  --workspace-id ORIGINAL_WORKSPACE_UUID \
  --out /private/epa/customer-receiving

starforge epa-echo-mcp reopen --out /private/epa/customer-receiving \
  --manifest-sha256 REVIEWED_TRANSFER_SHA256
```

A partial transfer retains its same directory, selected files and byte/hash manifest. A changed authenticated listener can continue the same original resource. Offline reopen hashes every completed file.

## Export, receive and reopen

Create a complete workspace export after selecting its retained state. It contains portfolios, completed and incomplete source records, immutable editions, staff history, datasets, release history and customer files. Original source and working objects retain their byte lengths and SHA-256 values.

The original complete-workspace receiving action validates the package and required objects, then preserves a received workset with its source workspace UUID, revision, editions and exact relative file inventory. Browse and download those original files from the receiving record. This is the product's read-only received workset; the original live workspace remains the editing and publisher owner.

Use **Stop** in Applications, then reopen the same Runtime workspace and saved application. A later explicit **Start** opens another managed run for the same workspace UUID. The original application history retains both runs.

The selected package includes the full seven-file [original operating programme](../../operations/epa-echo-portfolio-native-20261012/README.md). Its browser, merchant, customer and managed-application phases share the original B3909 operation. Follow [Receiving and continuation](RECEIVING.md) to adopt an existing programme result or continue that same operation.
