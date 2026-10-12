# Blockscout token merchant — installed product

The `blockscout-token-merchant` product includes the complete provider connection workspace, the original token merchant, private provider accounting and the Node/Python customer interfaces. An operator can receive a reviewed merchant package, deploy its initial challenge-only service, and activate paid operation on the same saved application and provider account.

## Entry points

| Work | Entry |
| --- | --- |
| Build the complete selected installation | **Build a product → Blockscout token merchant**, or `--selection blockscout-token-merchant` |
| Review connections and receive merchant packages | **Applications → Blockscout connection setup**, or `starforge blockscout-connections` |
| Operate a verified merchant package | **Applications → Blockscout token merchant**, or `starforge blockscout` |
| Change a saved merchant's deployment mode | The connection workspace's **Review deployment**, followed by the original Applications save and launch review |
| Inspect provider traffic and saved token responses | The merchant's authenticated **providerDesk** URL |
| Inspect original merchant traffic, availability and delivery | The startup record's **operations**, **availability** and **fulfillment** URLs |
| Prepare and receive a customer purchase | The original Blockscout Node/Python customer interfaces and selected SF88 buyer |
| Integrate into an existing application | Ten `./partners/blockscout` SDK exports, including connection setup, workspace, deployment, accounting and customer receiving |

The [original product guide](../../stellar/scf-starforge-20261009/partners/blockscout-stellar-pro-api/README.md), [connection guide](../../stellar/scf-starforge-20261009/partners/blockscout-stellar-pro-api/CONNECTIONS.md), [deployment guide](../../stellar/scf-starforge-20261009/partners/blockscout-stellar-pro-api/DEPLOYMENT.md) and [connection workspace guide](../../stellar/scf-starforge-20261009/partners/blockscout-stellar-pro-api/connection-workspace/README.md) provide the detailed contracts behind this operating path.

## Build and install

Use the existing Linux host with Node 24+, Python 3.11+, npm and `flock`. The provider ledger uses Node's built-in SQLite module. The original runtime installer retains the source archive, dependency profile and lock.

In the Runtime workspace, select **Build a product → Blockscout token merchant**, review the full source commit and a new owned output directory, then build and open the returned archive in **Source & profile**. The source checkout exposes the same operation:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace-checkout \
  --ref FULL_REVIEWED_COMMIT \
  --selection blockscout-token-merchant \
  --out /absolute/blockscout-release
~~~

Retain the returned archive filename and SHA-256. The selected archive carries both managed application adapters, all original Blockscout source and browser files, the customer SDKs, source receiving and the runtime installer. Its manifest binds the source commit, recipe and contribution.

Continue an interrupted build in its existing output:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace-checkout \
  --out /absolute/blockscout-release --resume

node stellar/scf-starforge-20261009/distribution/build.mjs \
  --out /absolute/blockscout-release --status
~~~

Prepare the complete runtime with the original native, schema, OpenAPI and operator dependencies:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/blockscout-runtime \
  --archive /absolute/blockscout-release/ORIGINAL_PACKAGE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/blockscout-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/blockscout-runtime --load --source

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/blockscout-runtime -- registrations --source blockscout
~~~

The contribution exposes `blockscout`, `blockscout-connections`, ten SDK exports and Applications provider `blockscout`. That provider supplies both catalog entries listed above. See [Runtime installation](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) for original dependency adoption, resume and offline transfer.

Inspection returns the READY installation's actual sourceRoot. Bind every following command to that private runtime:

~~~sh
BLOCKSCOUT_RUNTIME=/absolute/blockscout-runtime
BLOCKSCOUT_SOURCE_ROOT=/ACTUAL_SOURCE_ROOT_RETURNED_BY_INSPECT
starforge() {
  node "$BLOCKSCOUT_SOURCE_ROOT/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" \
    run --dir "$BLOCKSCOUT_RUNTIME" -- "$@"
}
~~~

The local function selects the same READY installation from any working directory.

## Attach the runtime and open the connection workspace

Attach the READY runtime to the existing Runtime workspace:

~~~sh
starforge runtime-workspace attach \
  --workspace /private/stellar/runtime-workspace \
  --runtime /absolute/blockscout-runtime \
  --label "Blockscout merchant runtime"

starforge runtime-workspace applications \
  --workspace /private/stellar/runtime-workspace
~~~

In **Applications**, select **Blockscout connection setup**. Set **Private connection workspace** to its original saved directory or a new empty directory within a private parent. Set **Existing Applications workspace** to the runtime workspace above. Select port `0` for an available local listener. Complete **Review → Save → Connect → Review Start → Start → Open**.

An explicit direct listener uses the same source:

~~~sh
starforge blockscout-connections serve \
  --workspace /private/blockscout/connections \
  --applications /private/stellar/runtime-workspace \
  --port 0
~~~

Open the private URL returned by that original listener. Reopening the same workspace retains its source inputs, connection reviews, packages, runtime bindings, application IDs and operation history. The setup workspace and separately running merchant retain their own application records.

### Receive the actual plan or complete connection bundle

Start with an existing valid Blockscout plan or an original exported connection bundle. To prepare a new plan template:

~~~sh
starforge blockscout template > /private/blockscout/plan.json
starforge blockscout inspect --plan /private/blockscout/plan.json
~~~

Complete the template before intake. Set the actual public HTTPS merchant origin, provider account alias, provider connection and credential environment name, Stellar payment network and asset contract, recipient and explicit atomic price for each selected chain. The EVM chain ID selects the indexed data; the Stellar network selects payment terms. The [source contract](../../stellar/scf-starforge-20261009/partners/blockscout-stellar-pro-api/CONTRACT.md) defines the token route and response.

In **Input**, select that complete plan or bundle. In **Connection review**, choose the actual Blockscout PRO service or the reviewed operator-controlled instance. Review the target origin, authentication mechanism, account alias and local provider limits. Credential values come from the selected host environment. Save the reviewed connection and **Prepare package**.

A complete connection bundle retains the plan, review, manifest and eight generated package files. Receiving verifies the original files and compiles the trusted local handler against the installed source. The prepared package has its own retained ID and absolute directory.

The equivalent CLI preserves the returned IDs at each step:

~~~sh
starforge blockscout-connections intake \
  --workspace /private/blockscout/connections \
  --file /private/blockscout/plan.json --request-id INTAKE_UUID

starforge blockscout-connections review \
  --workspace /private/blockscout/connections \
  --source RETURNED_SOURCE_ID \
  --changes /private/blockscout/connection-changes.json \
  --request-id CONNECTION_REVIEW_UUID

starforge blockscout-connections prepare \
  --workspace /private/blockscout/connections \
  --review RETURNED_CONNECTION_REVIEW_ID \
  --request-id PACKAGE_UUID

starforge blockscout-connections export \
  --workspace /private/blockscout/connections \
  --package RETURNED_PACKAGE_ID \
  --out /private/blockscout/connection-package.json
~~~

Omit `--changes` to review the retained connection unchanged. Use the original connection template and review commands from [CONNECTIONS.md](../../stellar/scf-starforge-20261009/partners/blockscout-stellar-pro-api/CONNECTIONS.md) when preparing a changes file. Every `*_UUID` above is one valid, stable operation UUID; reuse it when reopening that operation.

## Deploy the initial challenge-only merchant

In the connection workspace's **Applications** section, select the existing runtime binding, the READY runtime and the prepared package. Choose a merchant label and one private merchant-state directory. Set **Deployment mode** to `challenge-only`.

| Setting | Purpose |
| --- | --- |
| Verified merchant package | The directory of the received package and its original manifest |
| Private merchant state | The persistent provider account, attempt history, response files and accounting |
| Deployment mode | `challenge-only` for initial offer and service deployment; `paid` for reviewed activation |
| Original facilitator URL | The actual supported facilitator for paid mode |
| Seller, operations and provider-desk ports | `0` for available local listeners, or the original configured ports |
| Private environment JSON | The actual existing host file with the provider credential under the plan's environment name |
| Drain grace | The original supported value from 1000 to 300000 milliseconds; default 60000 |

The connection workspace supplies the verified package path. The merchant-state directory must be separate from both the package and the connection workspace. Review and save the application, complete its original connection, then **Review launch → Launch → Open**.

For the same CLI flow, bind the existing Runtime workspace and inspect its runtime IDs:

~~~sh
starforge blockscout-connections connect \
  --workspace /private/blockscout/connections \
  --applications /private/stellar/runtime-workspace \
  --request-id BINDING_UUID

starforge blockscout-connections applications \
  --workspace /private/blockscout/connections \
  --binding RETURNED_BINDING_ID
~~~

Save the initial settings in a private JSON file:

~~~json
{
  "stateDirectory": "/private/blockscout/merchant",
  "deploymentMode": "challenge-only",
  "port": 0,
  "operationsPort": 0,
  "deskPort": 0
}
~~~

Then review, save and launch:

~~~sh
starforge blockscout-connections application-review \
  --workspace /private/blockscout/connections \
  --package RETURNED_PACKAGE_ID --binding RETURNED_BINDING_ID \
  --runtime ORIGINAL_RUNTIME_ID --label "Blockscout token merchant" \
  --settings /private/blockscout/initial-deployment.json \
  --request-id APPLICATION_REVIEW_UUID

starforge blockscout-connections application-save \
  --workspace /private/blockscout/connections \
  --review RETURNED_APPLICATION_REVIEW_ID --request-id APPLICATION_SAVE_UUID

starforge blockscout-connections launch-review \
  --workspace /private/blockscout/connections \
  --application RETURNED_APPLICATION_ID --request-id LAUNCH_REVIEW_UUID

starforge blockscout-connections launch \
  --workspace /private/blockscout/connections \
  --review RETURNED_LAUNCH_REVIEW_ID --request-id ORIGINAL_RUN_UUID
~~~

The original startup record binds the verified package, source hashes, provider-state directory and listener URLs. Challenge-only mode serves the original health, offers, developer portal and unpaid HTTP 402 challenge. Provider dispatch and payment processing belong to the reviewed paid deployment.

Expose the seller listener through the existing HTTPS reverse proxy for the plan's public origin. The provider desk and original operations listeners remain local. Open the current `providerDesk` capability URL from the startup record after each launch.

## Activate paid mode on the same saved application

Open the original merchant, request its normal stop, and observe the existing run's terminal state. An interrupted run continues through **Recover run** before revising its deployment.

In **Review deployment**, retain the current application ID and revision. Choose `paid`, the actual facilitator and the existing private environment file. Review the displayed before/after settings, save that review, then complete a new launch review and launch for the same application.

The deployment review changes the mode, facilitator reference, private environment-file reference and optional local-facilitator setting. It preserves the verified package, selected runtime, merchant-state directory and label. Credential rotation also uses this reviewed restart path. The original provider account and saved token history continue in that state directory.

A private paid deployment settings file has this shape:

~~~json
{
  "deploymentMode": "paid",
  "facilitator": "https://YOUR_EXISTING_STELLAR_FACILITATOR",
  "environmentFile": "/private/blockscout/provider-environment.json"
}
~~~

The facilitator must support the selected original payment terms. Replace the example URL with the real existing service before review. Supply credential values only through the selected host environment file. An explicit `null` can clear an optional facilitator or environment-file reference during a supported review.

The original CLI transition is:

~~~sh
starforge blockscout-connections stop \
  --workspace /private/blockscout/connections \
  --application ORIGINAL_APPLICATION_ID --operation ORIGINAL_RUN_UUID \
  --request-id STOP_UUID

starforge blockscout-connections deployment-review \
  --workspace /private/blockscout/connections \
  --application ORIGINAL_APPLICATION_ID --revision CURRENT_APPLICATION_REVISION \
  --settings /private/blockscout/paid-deployment.json \
  --request-id DEPLOYMENT_REVIEW_UUID

starforge blockscout-connections application-save \
  --workspace /private/blockscout/connections \
  --review RETURNED_DEPLOYMENT_REVIEW_ID --request-id DEPLOYMENT_SAVE_UUID

starforge blockscout-connections launch-review \
  --workspace /private/blockscout/connections \
  --application ORIGINAL_APPLICATION_ID --request-id PAID_LAUNCH_REVIEW_UUID

starforge blockscout-connections launch \
  --workspace /private/blockscout/connections \
  --review RETURNED_PAID_LAUNCH_REVIEW_ID --request-id PAID_RUN_UUID
~~~

Read the original stop/run result before executing the deployment review. The original Applications layer checks the current revision and active-run state. A lost save resumes its retained review and deterministic original save request. Both previous and new application revisions remain available in the setup workspace.

## Operate the provider account and receive customer data

The provider desk combines account limits, provider usage observations, token-read attempts, complete response downloads, saved decisions and database backup. Its links reopen the original merchant's traffic, availability and settlement/delivery controls. Use the original account alias and merchant-state directory when restarting, rotating credentials or changing reviewed prices.

To prepare a customer purchase, select the actual chain and token in the provider desk, or use the original `starforge blockscout buyer` command. Save one stable buyer intent, the original review and a new response destination. The configured payment network, asset, recipient, exact atomic ceiling and signer stay in the original buyer workspace.

The selected package includes the complete original SF88 buyer and both Blockscout customer entrypoints:

| Interface | Source inside the installed package | Result |
| --- | --- | --- |
| Node application | `source/stellar/scf-starforge-20261009/partners/blockscout-stellar-pro-api/customer.mjs` | Original durable buyer result with verified JSON, bytes, chunks and create-only file saving |
| Python application | `source/stellar/scf-starforge-20261009/partners/blockscout-stellar-pro-api/customer.py` | Original Node-backed payment operation and Python result receiving |
| SDK import | `./partners/blockscout/customer` | `prepareCustomer`, `reviewCustomer`, `executeCustomer`, `recoverCustomer` and original preapproval operations |
| Original buyer CLI | `starforge buyer` | Workspace initialization, review, diagnostics and original payment execution |

Follow **Select and prepare an original buyer**, **Node application** or **Python application** in the [product guide](../../stellar/scf-starforge-20261009/partners/blockscout-stellar-pro-api/README.md). Select one interface for an existing purchase intent. Reopen that intent to receive an interrupted result. The retained provider JSON preserves numeric text and token identity; the original payment result keeps the attempt, receipt, status and response digest.

For a connection handoff, export the complete `connection-package.json` from the setup workspace and receive it with the original connection receiver on the target installed source. For account continuity, use the original provider backup and restore workflow from the product guide, including its displayed restore confirmation and account binding.

## Reopen existing operations

History and output use the original connection workspace and saved application/run IDs:

~~~sh
starforge blockscout-connections history \
  --workspace /private/blockscout/connections --limit 30

starforge blockscout-connections resume \
  --workspace /private/blockscout/connections --operation ORIGINAL_REQUEST_UUID

starforge blockscout-connections output \
  --workspace /private/blockscout/connections \
  --application ORIGINAL_APPLICATION_ID --operation ORIGINAL_RUN_UUID

starforge blockscout-connections recover-run \
  --workspace /private/blockscout/connections \
  --application ORIGINAL_APPLICATION_ID --operation ORIGINAL_RUN_UUID \
  --request-id RECOVERY_REQUEST_UUID
~~~

Use the same request UUID and unchanged input after a lost response. Pagination follows the returned cursor from the original history. Review a current application revision before changing its deployment. Reopening the setup browser retains its bindings and prior revisions; reopening an existing managed run follows the original Applications recovery.

## Maintained source

This product adopts the complete Blockscout partner subtree and Applications registration from [original PR 2217](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2217), source commit `d9c9c778ebbdd547e83895867edead61d27984ad`. It includes the preceding connection workspace and package receiving implementation in that source.

The selected recipe is [blockscout-token-merchant.json](../../stellar/scf-starforge-20261009/distribution/selections/blockscout-token-merchant.json). Runtime preparation, source pinning, saved Applications and customer operations use the maintained standalone implementation.
