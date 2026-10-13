# ROZO payments operations

The ROZO workspace manages merchant requests, callback and polling intake, settlement reconciliation, period reports and complete editable handover. Its original command and browser run through Starforge's existing Applications lifecycle.

## Install the selected release

Use Linux, Node 24 or later, Python 3.11 or later, npm and flock. The ROZO application uses Node's built-in SQLite support and Python's standard library. The complete finance selection also includes the original MCP and schema runtime dependencies for the configured Accounting and Buyer owners. Provider SDK connections retain their separately selected original runtimes.

From the source repository, build one committed ROZO selection:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/source-repository --ref COMMIT \
  --selection rozo-payments --out /absolute/new-source-package
```

The build result identifies the original archive and its SHA-256. Keep both together. In the following commands, replace ORIGINAL_ARCHIVE and ARCHIVE_SHA256 with those returned values:

```sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/rozo-runtime --archive ORIGINAL_ARCHIVE --sha256 ARCHIVE_SHA256 \
  --feature rozo-payments --feature schema --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/rozo-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/rozo-runtime --load --source
```

Preparation selects the ROZO manifest's Node requirement and the original schema/MCP dependency closure. Installation creates the original private runtime and dependency lock; an interrupted install continues in that same runtime directory. Use `--offline` only when the existing npm cache contains every dependency required by that reviewed lock. The complete finance selection is not an empty dependency graph.

Run the installed original command through the runtime:

```sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/rozo-runtime -- rozo-payments init --workspace /absolute/rozo-workspace
```

Initialize once for a new workspace. A receiving archive carries the existing workspace and its original identity.

## Open the staff workspace

Create or reuse the shared runtime workspace:

```sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/rozo-runtime -- runtime-workspace init \
  --workspace /absolute/staff-workspace

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/rozo-runtime -- runtime-workspace attach \
  --workspace /absolute/staff-workspace --runtime /absolute/rozo-runtime --label ROZO

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/rozo-runtime -- runtime-workspace serve \
  --workspace /absolute/staff-workspace --port 0
```

Open the private address printed by that server. In Applications, choose **ROZO payments**, select the initialized ROZO workspace and private connection configuration, and complete Review, Save, Start and Open. For finance operations, also select the original merchant configuration file and its configured Accounting and/or Buyer aliases. The Accounting alias uses an original merchant accounting workspace; the Buyer alias uses the original Buyer expense workspace and purchase selections. Applications pins the merchant configuration and any separate Buyer connection file alongside the ROZO source and workspace. API keys and callback secrets use the original host-local environment references.

The shared runtime retains the reviewed source, workspace and connection bindings. The ROZO launch checks the selected source manifest, the executed copy, the existing workspace and origin IDs, and its authenticated startup state. Its browser consumes the private session fragment and removes it from the displayed URL.

## Run payments operations

The application retains the original merchant and Checkout connection profiles. Operators can review saved requests, recover an uncertain request through its existing provider identity, receive authenticated callbacks, poll missing observations, reconcile settlements and publish immutable reporting editions. Staff corrections retain the earlier provider observations and report history.

Use the original [ROZO operating guide](../../sf30-seller-sdk/rozo-payments/README.md) for connection configuration and the payment, reconciliation and reporting workflows. [Applications](../../sf30-seller-sdk/rozo-payments/APPLICATIONS.md) describes the private managed launch.

## Run finance operations

The **Finance** workspace uses the same configured owners as the original merchant MCP and command-line tools. It retains the selected ROZO report, exact source bytes and native amounts, then supports merchant coding and explicit Buyer purchase intake. Staff can review the original movements, save coding or dispositions, define and review periods, close periods, prepare accountant handoffs, and receive the accountant's original return. Saved requests retain their exact payload and request identity for recovery after an interrupted response.

From the installed original command, add the same configuration and aliases when serving ROZO:

```sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/rozo-runtime -- rozo-payments serve \
  --workspace /absolute/rozo-workspace --config /absolute/rozo-connections.json \
  --merchant-config /absolute/merchant.json --accounting books --buyer purchases
```

Use the names declared in that merchant configuration. Either alias can be omitted when only the other owner is needed. The existing configuration selects the actual workspace and host-source files; the ROZO application does not create a second finance store.

The [configured Accounting guide](../../../../stellar-forge/mcp-merchant-operator/ACCOUNTING_ROZO.md) describes source capture, coding, closes, accountant returns and original files. The [configured Buyer guide](../../../../stellar-forge/mcp-merchant-operator/BUYER_ROZO.md) describes explicit purchase selection, capture, original source export, coding and complete project receiving.

For a complete operating and receiving programme, follow [Finance operations](../../sf30-seller-sdk/rozo-payments/FINANCE.md). Its `finance-plan`, `native-finance` and `receive-finance` commands retain the selected saved report and explicit coding plan through staff edits, accountant returns, original encrypted Accounting backup, full Buyer project delivery and independent receiving. The same guide describes continuation of an interrupted original request or maintenance job.

## Deliver the editable workspace

Use the ROZO application's original handover workflow to stop recurring intake, drain active requests and state writes, seal the selected workspace, and receive its complete archive. The original saved handover operation supports recovery after an interrupted response. A working snapshot remains available for ordinary exports.

Deliver the application source, installed-source manifest, connection configuration with environment references, saved workspace and the original provider observations, requests, callback bytes and report files. Finance delivery also carries the original configured Accounting backup and complete Buyer project, including the selected source bytes, coding, period history, accountant handoffs and returns. Use the original owners' maintenance and receiving workflows for those stores; the ROZO payment archive alone does not carry them. The receiver opens the delivered workspace through the original native command. Its identity and source selection remain part of the received application.

The source selection includes the original shared installer, Applications server and browser files, managed workers, transfer and Python runtime support, SF46 release controls, configured Accounting and Buyer owners, their maintenance and recovery commands, and the native resources those modules read. The original distribution collector follows actual static modules and the servers' maintained browser route manifests.
