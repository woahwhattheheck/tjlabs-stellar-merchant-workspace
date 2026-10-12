# CIIM metadata receiving

The CIIM receiving desk turns completed native metadata transformations into an editable receiving operation. A receiver imports the complete original case, identifies the institution and target environment, inspects the original XML and mapped records, records named reviews, compares source editions, and exports the complete reviewed handback. The next operator can restore that package and continue its original history.

The [operator guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/DESK_OPERATOR_GUIDE.md) covers every browser view, named decision, full-population review, CLI operation, HTTP interface, and portable receiving step. The running desk serves this same complete guide through **Download operator guide**.

## Choose the source product

The maintained source selection is **ciim-receiving**. Its committed recipe is [ciim-receiving.json](../../stellar/scf-starforge-20261009/distribution/selections/ciim-receiving.json). The existing distribution builder retains the original receiving source, CLI, Python archive member, browser assets, guide, Applications provider, installation workflow and statically imported dependencies.

Use an existing Git checkout containing the selected committed edition and an existing Node 24+ / Python 3.11+ environment. Run the original builder from that checkout:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo ABS_SOURCE_CHECKOUT \
  --ref EXACT_SOURCE_COMMIT \
  --selection ciim-receiving \
  --out ABS_NEW_SOURCE_OUTPUT \
  --offline \
  --python ABS_EXISTING_PYTHON
~~~

The result supplies the actual archive filename, source commit, byte count and SHA256. Resume an interrupted build with the same source/output and **--resume**. The original builder preserves the selected recipe and source manifest. The runtime workspace also exposes this same product through its existing source-build catalogue and review operation.

## Prepare and install

Use the exact archive and SHA returned by the original builder:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir ABS_NEW_CIIM_RUNTIME \
  --archive ABS_ORIGINAL_SOURCE_ARCHIVE \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --feature schema --feature openapi --feature mcp

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir ABS_NEW_CIIM_RUNTIME \
  --offline \
  --cache ABS_EXISTING_NPM_CACHE

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir ABS_NEW_CIIM_RUNTIME --source --load
~~~

The selected original dependency manifests determine the exact versions. The installation supports its established normal registry route when an offline cache lacks a declared member. Its **--adopt-existing** option can receive an already complete dependency tree with its matching original lock; the maintained installer validates that tree before marking the runtime READY.

The receiving desk itself opens completed native results with Node’s SQLite implementation and the included Python archive code. Its imported case retains the original Proteus runtime and outputs as source material. The generic transformation command and its native source remain documented in the [original CIIM application guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/README.md).

## Open the original workspace

Initialize a new receiving desk through the installed original command:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir ABS_READY_CIIM_RUNTIME -- \
  ciim-desk init --workspace ABS_NEW_DESK --python ABS_EXISTING_PYTHON

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir ABS_READY_CIIM_RUNTIME -- \
  ciim-desk serve --workspace ABS_NEW_DESK --python ABS_EXISTING_PYTHON --port 0
~~~

Open the private URL emitted by that original listener. **Intake** accepts the completed native case ZIP; **Receiving context** identifies the institution, processing profile, environment and named authorities. **Records**, **Profiles** and **Edition changes** keep the full original populations and source links visible. **Handbacks** produces the reviewed receiving package. **History** preserves each original request and named decision.

A complete received workspace or handback is restored into a fresh desk before selecting it in Applications. Restoration preserves its original logical workspace ID, review history, input archives and edition IDs. The first restore request remains replayable with its original UUID and revision 0 even after the destination takes the restored identity.

## Use the existing Applications workspace

Attach the actual READY installation in the [runtime workspace](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/APPLICATIONS.md). Choose **CIIM metadata receiving**, the original initialized or restored desk directory, and the absolute existing Python executable.

**Review application → Save application → Connect → Review start → Start reviewed application** uses the original installed release and managed worker. **Open application** opens the listener retained by that same run. **Stop application** closes the desk through its original close path. A later start reopens the same saved context, editions, reviews and exports.

Review binds the original desk marker, source edition, selected Python and installed release. Ordinary receiving decisions retain that marker. A portable restore is completed in a fresh desk before Applications selection so its resulting identity is the one reviewed.

Normal port 0 reopening uses the desk’s saved local listener preference. That keeps the browser origin—and an unfinished IndexedDB request—available across Stop/Start. The actual startup record supplies the private capability URL. The Applications record retains it against the original managed operation.

## Complete worked receiving

The retained worked case has three original native editions:

| Edition | Active records | Deleted records | Total observations |
|---|---:|---:|---:|
| Zenodo DataCite | 231 | 0 | 231 |
| OpenAlex withdrawal | 168 | 1 | 169 |
| OpenAlex restored | 169 | 0 | 169 |
| All retained editions | 568 | 1 | 569 |

The original native case archive is **CIIM-Proteus-native-receiving-case.zip**,15,587,672 bytes, SHA256 **26f5cc490aef1e2b292a55e04ba2372d3ca4e2703f8b32bc2d5b52a89c81a91c**. It contains all original source pages, exact native conversion/profile outputs, the original Java runtime and complete source. Receiving reuses those native outputs.

The complete source programmes are:

- [Native and HTTP receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/examples/receiving_20261012.mjs): import all 569 observations, original source/profile downloads, named reviews, explicit exclusion, both labelled comparison directions, immutable handbacks, exact exports, two portable restores and the original request replay after identity/restart.
- [Operator browser receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/examples/receiving_browser_20261012.cjs): all eight views, source/guide downloads, original request interruption/recovery, named record review, complete handback, 390 px operation, keyboard navigation and final same-workspace reopening.
- [Installed Applications receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/examples/applications_20261012.mjs): the actual READY runtime, original Review/Save/Connect and managed Start/Open/Stop/reopen, complete populations, original guide/handback/workspace downloads, and unchanged receiving state.

Keep these programmes on the same retained receiving root. The browser continuation starts after its full portable native checkpoint has been saved. Run the Applications continuation after the direct desk server has closed:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/examples/applications_20261012.mjs \
  --root ABS_ORIGINAL_RECEIVING_ROOT \
  --runtime-workspace ABS_EXISTING_RUNTIME_WORKSPACE \
  --runtime-id ACTUAL_ATTACHED_READY_RUNTIME_ID \
  --python ABS_EXISTING_PYTHON
~~~

Its **applications-receiving/result.json** retains the exact installation/release, original save/start requests, both managed run identities, complete downloads and reopened workspace identity. A failed or interrupted phase continues against those original requests.

## Receiving output and the next source edition

A reviewed handback keeps the frozen receiving context, named authority decisions, selected edition/comparison scope, readable review report, accepted mapped output, exact original input archives and their complete coverage inventory. Its original archive may contain native editions beyond the handback’s selected review scope; both scopes are explicitly retained.

Receive a correction as a new original native edition. Compare the selected earlier and later editions, inspect each changed original identifier and metadata field, and record the current named decisions before creating the following handback. Earlier handbacks remain available at their original revision. The full editable workspace and its complete source travel with the next receiver.

## Connected terminal and application operators

The running desk exposes the same original receiving operations to the browser and the connected client. Use the connected CLI when its server is open:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  connected status --connection ABS_DESK/desk-connection.json

node stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/cli.mjs \
  connected act --connection ABS_DESK/desk-connection.json \
  --request ABS_ORIGINAL_REQUEST.json
~~~

The [connected operator guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ciim-receiving/desk/CONNECTED_OPERATOR_GUIDE.md) covers original candidate imports, every typed decision, complete population reads, exact streaming exports and the retained request journal. It includes terminal and JavaScript usage for the existing private server.

Each write keeps its complete original request and operation ID before sending. The pending command reads that saved local request during a server restart; recover resends its original body and ID once the server is running. A completed restore retains the received workspace identity and original review history. Complete source ZIPs, XML/native/profile attachments and historical handbacks are streamed and checked against their original sizes and hashes.

The installed package exports the client at ./seller/ciim-desk/connected and the connected CLI at ./seller/ciim-desk/connected-cli. The existing local commands and typed action catalogue remain available. Both connected interfaces use the live server's original writer and revision checks.
