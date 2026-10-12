# EPA ECHO installation, customer receiving and continuation

This guide joins the complete maintained EPA ECHO product to an existing installation, original portfolio operation or customer handover. Use [Operating the product](OPERATING.md) for the working interface. The unchanged source programme is [operations/epa-echo-portfolio-native-20261012](../../operations/epa-echo-portfolio-native-20261012/README.md).

## Select the original receiving surface

| Input being received | Original receiver | Retained result |
| --- | --- | --- |
| A selected distribution archive | Runtime install prepare/install/inspect | READY installation with original source selection, profile and dependency lock |
| A complete EPA source package | Portfolio capture import | Immutable source edition and original capture journal |
| Completed original buyer page intents | SF88 inspection and SF100 receiving | Customer receipt and all five original files |
| A complete EPA workspace package | Workspace receive | Read-only original state, editions and exact retained file inventory |
| A merchant file transfer | EPA retained download and offline reopen | Manifest-bound complete original files plus resumable transfer journal |

These surfaces preserve different identities. Keep the actual installed source revision, portfolio workspace UUID, source edition ID, buyer intent/receipt IDs and received-workspace ID with the corresponding result.

## Commission an existing READY installation

Receive the complete builder archive and its actual SHA-256. Use the original named selection `epa-echo` and the original runtime profile. The recipe is:

```text
stellar/scf-starforge-20261009/distribution/selections/epa-echo.json
```

The selected product includes the complete original EPA component and seven-file operating programme, source-owned application and merchant registrations, the merchant host/browser, the original dataset/publisher/buyer/customer engines and their selected dependencies.

The [complete installed guide](../../stellar/scf-starforge-20261009/distribution/selections/EPA_ECHO.md) supplies prepare, adopt-existing, inspect, resume and Runtime workspace commands. An existing prepared directory continues through its original install journal. Retain the actual package source and adjacent dependency tree together.

Use the original source-registration view:

```sh
starforge registrations --source epa-echo
```

It identifies three EPA commands, fourteen exported EPA modules, the browser asset declaration, application provider `epa-echo-portfolios` and merchant provider `epa-echo-workspaces`. The named recipe also selects the original Buyer workbench and generic merchant capabilities through their existing contributions.

The installation handover records:

- Full source commit, selected recipe Git blob, SHA-256 and byte count.
- Complete built archive identity and selected package version.
- Actual runtime directory, READY installation ID, profile and dependency lock.
- Original Applications manager and saved application ID.
- Selected EPA workspace UUID and optional original inbox/runtime-file identities.
- Current private session reference held by the operating host.

## Receive a complete source edition

Use the original portfolio's ordered FRS selection. The supplied example contains four facilities and eight original responses; its full file is 826,432 bytes with SHA-256 `c737c859126057359c3918e20e4553651b31ab14532060c64aa49f25a7fe24d9`.

The source package has schema `stellar-forge.epa-echo-source-package.v1`. Each response retains its original URL, kind, full body, byte/hash identity and recorded source observations. Differing original wire bytes and later materialization observations remain separate fields.

Open the original workspace, select its portfolio and import that complete file. The saved capture covers the intended source selection. Inspect the capture status, original provider messages, each facility report and all eight projected tables before choosing its dataset.

For a session CLI:

```sh
starforge epa-echo --session /private/epa/startup.json import-source \
  --portfolio-id ORIGINAL_PORTFOLIO_ID \
  --operation-id ORIGINAL_CAPTURE_OPERATION_ID \
  --file /private/epa/original-source-package.json

starforge epa-echo --session /private/epa/startup.json editions \
  --portfolio-id ORIGINAL_PORTFOLIO_ID --offset 0 --limit 100

starforge epa-echo --session /private/epa/startup.json rows \
  --edition-id ORIGINAL_EDITION_ID --table source-fields --offset 0 --limit 100
```

Continue the returned table paging to the full selected count. A source package import uses retained source bodies; an explicit source capture uses the original EPA service requests and their current retry behavior.

Keep the same operation ID and exact package after an uncertain import response. The original journal compares action and payload identity before current-revision admission. The browser can reconstruct its pending request when the same original file is selected after reload.

The original decoder preserves exact numeric tokens and repeated identical source members with their positions. Staff annotations remain separate records. Source extraction dates, programme periods, quarter headers and acquisition timestamps keep their original meanings.

## Receive the original customer result

The configured SF88 inbox holds the original planned intents, offers, attempts, response pages and finalizations. Read those original outcomes and select the intended order for SF100 receiving.

The resulting receipt binds all five complete files:

```text
dataset.csv
dataset.jsonl
review.html
delivery.json
manifest.json
```

The authenticated browser and CLI can download each original file:

```sh
starforge epa-echo --session /private/epa/startup.json receive-file \
  --receipt-id ORIGINAL_CUSTOMER_RECEIPT_ID \
  --name dataset.csv --output /private/epa/received-dataset.csv
```

Each terminal output is created exclusively. Preserve an existing selected output and inspect its original byte/hash identity before choosing another destination.

For a complete merchant transfer, select the same receipt and workspace UUID:

```sh
starforge epa-echo-mcp download \
  --url http://127.0.0.1:PORT/mcp --workspace portfolio \
  --token-env MERCHANT_TOKEN \
  --kind receipt --id ORIGINAL_CUSTOMER_RECEIPT_ID \
  --workspace-id ORIGINAL_WORKSPACE_UUID \
  --out /private/epa/customer-files
```

Retain `echo-transfer.json`, the original file manifest and complete customer bytes. The receiving directory keeps partial file prefixes and its original resource selection. A new port for the same authenticated workspace continues that transfer through the original locked journal.

Verify the complete selected transfer offline:

```sh
starforge epa-echo-mcp reopen --out /private/epa/customer-files \
  --manifest-sha256 REVIEWED_TRANSFER_SHA256
```

The original client checks every completed file's full byte count and SHA-256. Manifest identity binds the original workspace and file selection.

## Receive a complete workspace

Export the original retained EPA workspace through its existing action. A session CLI writes the same complete package:

```sh
starforge epa-echo --session /private/epa/startup.json export-workspace \
  --operation-id ORIGINAL_EXPORT_OPERATION_ID \
  --output /private/epa/original-workspace-package.json
```

The package includes portfolios, captures and incomplete source records, editions, reviews/history, dataset configuration and provenance, original release history, customer receipts/files and retained source objects. The source manifest binds every included object's original length and digest.

Receive the complete package through the selected receiving workspace:

```sh
starforge epa-echo --session /private/epa/receiving-startup.json import-workspace \
  --operation-id ORIGINAL_RECEIVING_OPERATION_ID \
  --file /private/epa/original-workspace-package.json

starforge epa-echo --session /private/epa/receiving-startup.json received-workspace \
  --receipt-id ORIGINAL_RECEIVED_WORKSPACE_ID
```

The receiver checks required source, dataset and customer object closure. Its result records the original source workspace UUID, source revision, package identity and exact retained file list. It is a read-only preserved workset within the receiving workspace.

Select an actual relative path from that received file inventory:

```sh
starforge epa-echo --session /private/epa/receiving-startup.json received-workspace-file \
  --receipt-id ORIGINAL_RECEIVED_WORKSPACE_ID \
  --path ORIGINAL_RELATIVE_PACKAGE_PATH \
  --output /private/epa/received-original-file
```

The merchant `workspace` file kind supplies the same retained paths. Large collections can be received as the single complete `workspace.export` file when an individual-file index would exceed its receiving-index capacity.

A lost receiving reply continues with the original receiving operation ID and complete package. Source bytes and original received identities remain selected through browser reload, listener restart and file continuation.

## Continue the original B3909 operating programme

The included programme's business operation is:

```text
epa-echo-portfolio-complete-b3909-20261012
```

Its original completed or pending journal is the authority for which stages have run. Source adoption preserves the seven original programme files and their existing continuation behavior. The current operation owner selects any actual execution.

For an existing journal, retain its selected source commit, source root, original workspace and buyer/signer configuration. A new maintained source release is received through the current source/installation owner and reconciled with that original selection before continuing an already started programme.

Read [INPUTS.json](../../operations/epa-echo-portfolio-native-20261012/INPUTS.json) and the [original programme guide](../../operations/epa-echo-portfolio-native-20261012/README.md). Supply the actual selected paths through its existing environment contract:

| Environment field | Original selection |
| --- | --- |
| `EPA_ECHO_SOURCE_COMMIT` | Full immutable source commit selected by the operation and READY installation |
| `EPA_ECHO_PRODUCT_ROOT` | Complete selected repository source root in its retained relative layout |
| `EPA_ECHO_RUNTIME_DIRECTORY` | The original READY runtime for that source |
| `EPA_ECHO_JOURNEY_DIRECTORY` | The same private operating directory used by its journals |
| `EPA_ECHO_ORIGINAL_SCF_RUNTIME` | Original source containing the native facilitator |
| `EPA_ECHO_ORIGINAL_OPERATOR_ROOT` | Original retained signer, policy and transport custody directory |
| `EPA_ECHO_OPERATOR_WORKSPACE` | Original payer workspace and reviewed policy |
| `EPA_ECHO_NODE_EXECUTABLE` | Existing compatible Node executable, when explicit |
| `EPA_ECHO_PLAYWRIGHT_MODULE` | Existing installed Playwright module |
| `EPA_ECHO_CHROMIUM_EXECUTABLE` | Existing selected Chromium executable |
| `EPA_ECHO_CA_FILE`, `HTTPS_PROXY` | Original selected CA and network transport when required |

The programme imports the selected original modules dynamically from that complete source root. It uses the existing installed Applications model and actual READY installation.

The original launcher is:

```sh
python3 /absolute/epa-echo-runtime/package/source/operations/epa-echo-portfolio-native-20261012/native-run.py
```

It uses the original util-linux controlling terminal and private `operator-input.fifo`. The operating owner attends the buyer's existing review prompt. A retained FIFO is reconciled with its original terminal before another launcher is admitted.

The original customer intent IDs are `epa-echo-portfolio-b3909-20261012-p1` and `epa-echo-portfolio-b3909-20261012-p2`. Each selects two rows from the four-facility dataset at `/epa-facilities`. The original programme retains its offers, attempts, exact native payment terms, complete response files and finalizations under those IDs.

### Existing phase and file locations

| Retained path under the operating directory | Purpose |
| --- | --- |
| `private/native-journey.json` | Whole-operation source/identity/phase journal |
| `private/pages/` | Original page requests, offers, responses and finalizations |
| `browser/journal.json` | Source review, staff edits, dataset, customer and portable browser phases |
| `merchant-receiving/` | Original merchant operations and complete/resumable file transfers |
| `applications-receiving/` | Original managed application, current view and both explicit Start/Stop histories |

A whole journal with phase `COMPLETE` returns its saved result before another facilitator or buyer opens. The programme can recognize a completed browser and matching saved merchant result and continue directly into its existing Applications phase. It retains earlier interruption details.

An attempted customer page with an unresolved original response retains that same attempt for its supported continuation. The native result distinguishes actual completed operations, continuation requirements and cleanup outcomes.

## Complete the handover

Return the complete original result with the source archive and installation identities. Keep the source package, exact selected FRS order, workspace/edition identities, staff history, queryable dataset snapshot, original customer receipt and all five file hashes together.

The full operating result includes the retained browser phases, original merchant tool operations and file checkpoints, complete workspace export/receiving, reopened workspace identity and both original managed runs. Native process and transport outcomes come from that same executing owner.

The maintained adoption's [source map](SOURCE_ADOPTION.json) identifies the original component, seven programme files, named recipe and shared parser postimage. Its linked original guides remain the full API and operating contract for subsequent operators.
