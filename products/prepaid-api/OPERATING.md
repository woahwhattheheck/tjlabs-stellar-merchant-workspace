# Prepaid API: merchant setup, original purchase and customer workspace

This selected product turns a reviewed application and its payment terms into an API allowance that a customer can purchase and use from the original browser or agent client. It includes a complete numeric-series application, a retained merchant setup, offer publication, original customer handoffs, complete file receiving and a customer launcher that opens the existing purchase or access workspace.

The selected installation carries the original merchant console, checkout and delivery engines, API gateway and application worker, customer workspace, Buyer/Inbox, original approval bridge, both source-owned MCP providers and the native backup receiver. Its source selection is `prepaid-api`. The normal cumulative toolkit also includes the `prepaid-api` command through this product's own distribution contribution.

The installed package includes this complete guide at `source/products/prepaid-api/OPERATING.md` as well as its root `README.md`. Open the source copy to follow the relative links to the other included guides offline.

## What the product keeps together

| Retained record | Purpose |
| --- | --- |
| Starter request | Actual merchant origin, API origin, original payment option, allowance, route units, private paths and selected executables |
| Setup plan | Exact application, Jobs merchant, checkout, backup selection, merchant configuration, offer draft and example bytes |
| Original offer operations | Original workspace revision, operation ID, full HTTP request, native operation state and the published plan |
| Original customer order | Merchant order reference, plan, payment and recipient binding, private claim and complete checkout handoff |
| Customer receiving directory | Every original exported file, its manifest, original receiving identity and a complete local hash check |
| Customer setup | Original customer configuration, purchase or existing-access mode, one original bootstrap operation and source bindings |
| Original customer workspace | Purchase review, approval, allowance, exact application request, retained result, history and the selected agent connection |

The price in `payment.amount` buys the complete API pass. The published allowance and each route's unit cost govern subsequent API calls through the original pass store. Payment, entitlement and call accounting keep their original owners.

## 1. Build or receive the selected installation

Use Linux with Node 22.16 or newer, Python 3.11 or newer, npm and the original Linux `flock` support. The application itself uses the original Node worker and standard-library Python bridge. Native Stellar checkout and the original Buyer use the dependencies selected by the maintained runtime installer.

A maintainer with the actual source checkout can build one immutable source commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /srv/source/tjlabs-stellar-merchant-workspace \
  --ref REVIEWED_COMMIT_CONTAINING_THIS_PRODUCT \
  --selection prepaid-api \
  --out /srv/releases/prepaid-api
~~~

Keep the returned archive path, SHA-256, original source commit and source-selection record together. The original builder selects the registered commands, both Applications providers, both API MCP providers, their complete relative imports, explicit native workers and browser asset manifests. It uses the maintained build journal and can reopen that same output with `--resume`. A different selection cannot replace a retained partial build.

Use the maintained runtime installer from the delivered toolkit or its original source checkout:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /srv/starforge/prepaid-runtime \
  --archive /srv/releases/prepaid-api/ORIGINAL_ARCHIVE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --operator \
  --feature schema --feature openapi --feature mcp

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /srv/starforge/prepaid-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /srv/starforge/prepaid-runtime --source
~~~

Use the actual archive and hash returned by the builder. The installer records the exact native dependency profile, source and lock. Once `runtime-install.json` exists, `resume --dir ...` continues that same installation. If preparation stopped before that plan was committed, preserve its directory and use the original recovery command with a new empty destination:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs recover \
  --from /srv/starforge/prepaid-runtime \
  --dir /srv/starforge/prepaid-runtime-recovered
~~~

That command reads the original `preparation.json` and retained archive/selection. Use the recovered runtime path for subsequent commands; do not run `prepare` again in the interrupted nonempty directory. A complete compatible dependency installation can be adopted through the original `--adopt-existing` option, keeping its entire `node_modules` layout and original `package-lock.json` together. Existing offline caches and native Node headers use the original installer options.

Commands in this guide use `starforge` from that selected installation. The maintained launcher can invoke them directly:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /srv/starforge/prepaid-runtime -- prepaid-api help
~~~

The package also exposes a direct `prepaid-api` executable. It calls the same product CLI. Its typed programmatic export is `@tokenjunkielabs/starforge-merchant/prepaid-api`.

## 2. Select the real merchant terms

Create a private configuration directory, then write the complete starter template:

~~~sh
umask 077
mkdir -p /srv/merchant/prepaid-config

starforge prepaid-api template \
  --out /srv/merchant/prepaid-config/request.json
~~~

Edit that file before preparing the product. It deliberately leaves the actual public origin, gateway origin, asset, recipient and atomic price to the operator.

| Field | Meaning |
| --- | --- |
| `publicOrigin` | Original public HTTPS origin serving checkout and entitled plan delivery |
| `gatewayBaseUrl` | API origin customers will use; HTTPS for a public service or the actual loopback origin for local operation |
| `payment.network` | Original `stellar:testnet` or `stellar:pubnet` payment option |
| `payment.asset` / `payTo` | Actual accepted asset and merchant recipient from the existing native payment setup |
| `payment.amount` | Positive atomic integer string for one complete pass |
| `checkoutPath` / `checkoutRouteId` | Original fixed-price purchase route; the order reference is bound into its URL and order header |
| `functionPath` | Original application route; the starter uses POST `/analyze` |
| `allowanceUnits` | Total units in one published pass |
| `requestUnits` | Units consumed by one completed analysis request |
| `workerPort` / `apiPort` | Selected original local application and API gateway ports |
| `timeoutSeconds` | Original gateway/application deadline selection |
| `backupPassEnv` | Name of the private environment value supplied to the original encrypted backup engine |
| `python` | Actual Python executable used by the native bridge |

The template starts with an allowance of 100 units and a one-unit analysis route. Change these to the reviewed commercial offer. The original Jobs and checkout compilers validate the actual payment and route contract. The setup also checks the advertised loopback API port and prevents the worker and API listeners from selecting the same port.

Use a dedicated private directory outside the source checkout and original Buyer authority directories:

~~~sh
starforge prepaid-api prepare \
  --directory /srv/merchant/prepaid-analysis \
  --request /srv/merchant/prepaid-config/request.json

starforge prepaid-api inspect \
  --directory /srv/merchant/prepaid-analysis
~~~

Preparation writes one immutable `setup.json` before materializing any generated file. The original lease protects that setup. A repeated command with the same input reopens the same source plan and complete result. A different request requires its own selected setup directory.

The generated files are:

~~~text
application/numeric-series.mjs
application/jobs.json
checkout.json
backup-selection.json
merchant-workspace.json
offer-draft.json
examples/analyze.json
~~~

`setup-complete.json` identifies those exact bytes and the actual compiled source. The application source and Jobs configuration remain in the original selected application root so the native encrypted recovery engine can carry their full closure.

### The included application

The starter's `analyze` function accepts:

~~~json
{"values":[2,4,6,8],"window":2}
~~~

It returns count, sum, mean, median, minimum, maximum, population standard deviation and the rolling mean for each input row. The selected schema accepts 1–10,000 finite values in the range ±10¹² and an integer window of 1–10,000. The original worker enforces the selected input/output and execution limits. The example has mean 5, sum 20 and rolling means 2, 3, 5 and 7.

The complete generated source is reviewable before publication. To operate an already-maintained application with a different contract, use the included original API merchant console's configuration and adoption flow; its application source, manifest and original payment identities remain authoritative. This starter's retained setup always continues the exact source it prepared.

## 3. Open the merchant console and publish the original offer

Supply the existing backup passphrase in the private environment named by the setup if encrypted capture is needed. Start the original merchant console:

~~~sh
starforge prepaid-api serve \
  --directory /srv/merchant/prepaid-analysis \
  --port 8430
~~~

Keep that foreground process or its original managed Applications owner running. Open its private startup URL. The original launch file is:

~~~text
/srv/merchant/prepaid-analysis/merchant-workspace/api-merchant-launch.json
~~~

In another terminal, publish the prepared offer:

~~~sh
starforge prepaid-api publish \
  --directory /srv/merchant/prepaid-analysis \
  --launch /srv/merchant/prepaid-analysis/merchant-workspace/api-merchant-launch.json
~~~

The command saves one `offer_prepare` request and then its original `offer_publish` request. Each request has its full body, original operation ID, selected source SHA and native workspace revision. The returned `READY` result identifies the actual offer and its retained files.

The original merchant browser now shows that offer, its plan and original application route. Use **Start** on the selected offer to open its original application worker and API gateway. The console's service view reports the actual listeners and drain state.

The same console is available in maintained **Applications → API merchant console**. Select the generated `merchant-workspace.json` and its existing private directory. The original Applications review pins the selected installation, configuration, source and saved workspace before starting its maintained process.

### Continue publication after interruption

~~~sh
starforge prepaid-api publish \
  --directory /srv/merchant/prepaid-analysis \
  --launch /srv/merchant/prepaid-analysis/merchant-workspace/api-merchant-launch.json \
  --resume
~~~

The command first reads the existing original operation. A transport interruption keeps its original body and ID. Original `ATTENTION` work is explicitly resumed through the original operation endpoint.

A definite pre-admission stale-revision rejection is different: the native model has created no operation. The workflow preserves the rejected body, hash and confirmed absence. Only an explicit `--resume` creates the next admission attempt at the then-current original workspace revision. All prior rejected attempts remain retained and are reconciled before dispatch. No uncertain original request is silently replaced.

`--wait-ms` controls how long this command waits for its original operation; the default is 120,000 ms. An incomplete workflow returns its actual retained status and exits with code 3. The original console remains the operation owner.

## 4. Run checkout and original entitlement delivery

The generated `checkout.json` uses the same original merchant state and SF98 outbox as the offer. Original checkout serves the paid plan; the API gateway serves requests under the purchased allowance.

Run the original checkout with the actual selected facilitator:

~~~sh
starforge checkout serve \
  --config /srv/merchant/prepaid-analysis/checkout.json \
  --port 8423 --operations-port 8424 \
  --facilitator https://YOUR_ORIGINAL_FACILITATOR
~~~

The existing original receiver also needs its private HMAC environment and selected state. With `prepaid_source` set to the selected installation's actual source root:

~~~sh
python3 "$prepaid_source/stellar/scf-starforge-20261009/sf101-merchant-receiver/receiver.py" serve \
  --state /srv/merchant/prepaid-analysis/merchant-state \
  --port 8472
~~~

Use the existing `SF98_WEBHOOK_SECRET` for both the original receiver and original delivery worker. Keep the same secret across restarts. The included original checkout guide describes initialization, the original HMAC environment and durable outbox delivery in full.

The actual HTTPS proxy must preserve the original route and order binding:

| Public route | Original local service |
| --- | --- |
| Selected `checkoutPath` | Checkout port 8423, preserving the complete query and `X-SF98-Order-ID` |
| `/deliver/<order>` | Original receiver port 8472 |
| `/internal/x402-events` | Original receiver's `/sf98/events` route |
| Customer API origin | Selected API gateway port from the offer |

Keep the merchant, checkout-operations and receiver-control listeners private. The public API origin and checkout origin can use the existing host's intended HTTPS routing.

After the original settlement event is retained, use the original maintained delivery worker or its explicit drain command:

~~~sh
node "$prepaid_source/stellar/scf-starforge-20261009/sf98-merchant-delivery/deliver.mjs" drain \
  --state /srv/merchant/prepaid-analysis/outbox \
  --url https://YOUR_MERCHANT_ORIGIN/internal/x402-events \
  --allow-host YOUR_MERCHANT_HOST \
  --secret-env SF98_WEBHOOK_SECRET
~~~

The original signed event makes the same enrolled order entitled. The checkout operations **Fulfillment** view exposes the real outbox and its original delivery recovery. Its event and order references remain unchanged when delivery is retried.

The full maintained procedure is [Approved order to paid file](../../stellar/scf-starforge-20261009/sf101-merchant-receiver/CHECKOUT.md). The current merchant console's [operating guide](../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/README.md) covers application service, access lifecycle and complete backup receiving.

## 5. Prepare one customer's original order and receive all handoff files

Choose the actual customer order reference and label:

~~~sh
starforge prepaid-api customer \
  --directory /srv/merchant/prepaid-analysis \
  --launch /srv/merchant/prepaid-analysis/merchant-workspace/api-merchant-launch.json \
  --order analysis-customer-001 \
  --label "Analysis customer"
~~~

The command uses the published offer and saves one original `order_prepare` request. Its completed order retains the original plan, checkout payment and recipient binding. The native merchant engine generates and retains the private claim before enrollment.

Receive the complete original export:

~~~sh
starforge prepaid-api receive \
  --directory /srv/merchant/prepaid-analysis \
  --launch /srv/merchant/prepaid-analysis/merchant-workspace/api-merchant-launch.json \
  --order analysis-customer-001 \
  --out /srv/merchant/customer-handoffs/analysis-customer-001
~~~

The output directory includes all native files plus `receiving.json` and `complete.json`. Its required native files are:

| File | Purpose |
| --- | --- |
| `handoff.json` | Original order, purchase/delivery URLs, accepted payment and promised plan bytes |
| `api-pass.json` | Exact published API plan |
| `credentials.json` | Private original claim, its environment name and API origin |
| `RECEIVING.md` | Original merchant receiving instructions |

Each member is received through the original authenticated streaming downloader, matched to the native export's length and SHA-256, and published only after completion. A complete matching local member reopens without redownloading it. Recovery also handles the original downloader's complete temporary-file hardlink after a process interruption.

Deliver the **entire directory** through the existing private customer handoff channel. Keep its file contents unchanged. On the receiving host, use an owner-private canonical directory and regular files with private permissions. The retained source directory in `complete.json` is historical provenance; the customer launcher validates every member in its actual new physical directory.

`customer --resume` continues the saved order operation using the same rules as publication. Reuse the original order reference for that continuation.

## 6. Open the original customer purchase browser

On the customer's host, receive or install this same selected product, then inspect the complete handoff:

~~~sh
starforge prepaid-api customer-files \
  --handoff-directory /srv/customer/incoming/analysis-customer-001
~~~

The output shows the original order, export, merchant workspace, promised plan and file identities. It omits the private claim.

For a new purchase, use the customer's existing configured original Buyer workspace and a stable intent:

~~~sh
starforge prepaid-api customer-configure \
  --handoff-directory /srv/customer/incoming/analysis-customer-001 \
  --directory /srv/customer/prepaid-analysis \
  --mode purchase \
  --buyer-workspace /srv/customer/original-buyer-workspace \
  --intent analysis-customer-001-purchase \
  --title "Analysis access"

starforge prepaid-api customer-serve \
  --config /srv/customer/prepaid-analysis/customer-config.json \
  --port 8440 \
  --approval-mode auto
~~~

Optional `--runtime`, `--buyer-state`, `--inbox` and `--python` on `customer-configure` select the actual original runtime and authority directories. Keep those paths distinct from the new customer workspace. The original Buyer operator, policy, spending ledger, signer and approval settings remain the customer's existing selections.

The launcher reads the actual private claim from the verified received files and supplies it only to the original selected process environment. It saves or reopens one profile through the original workspace's `preparePurchase` mutation. The original customer browser opens with that handoff, intent, gateway and claim environment already selected.

In the original browser:

1. Open the prepared purchase and choose **Prepare original purchase**.
2. Choose **Review original purchase** and inspect the actual payment, merchant, promised plan and original approval.
3. Use **Run reviewed purchase** for that retained review.
4. Complete the original browser or controlling-terminal approval.
5. Reopen or reconcile that same purchase as needed.
6. Refresh the original allowance after the merchant's authenticated entitlement delivery.

Preparation and browser startup do not execute the purchase. The original review and explicit execution remain the native purchase sequence.

`auto` selects the supported original browser broker or retains the original terminal channel. Explicit `browser` and `terminal` modes remain available. Source-pinned approval modules and generated agent setup use the same original CLI options shown by `prepaid-api help`.

### Connect an already purchased pass

When this same original order is already paid, prepare an access workspace instead:

~~~sh
starforge prepaid-api customer-configure \
  --handoff-directory /srv/customer/incoming/analysis-customer-001 \
  --directory /srv/customer/prepaid-analysis-access \
  --mode access \
  --title "Analysis access"

starforge prepaid-api customer-serve \
  --config /srv/customer/prepaid-analysis-access/customer-config.json
~~~

This saves or reopens the original `connectPass` mutation for the same order, gateway and promised plan. It creates no replacement payment intent.

## 7. Use the allowance and retain the original result

Refresh the pass in the customer browser. Select its actual POST analysis route and use this body with `application/json`:

~~~json
{"values":[2,4,6,8],"window":2}
~~~

Choose a stable request ID for that logical request, prepare it, review its exact saved inputs, and send the saved request. The merchant binds the request to its original order, purchased plan, route, method, path and input. A completed result consumes the route's selected units once.

The original customer browser provides exact result preview/download, same-request replay, original result recovery, paged remote calls, saved browser actions, purchase recovery and complete customer history. Use the same request ID and saved input when recovering an interrupted call. A new logical calculation receives its own new request ID.

The merchant console shows the corresponding original allowance reservation, native execution attempt and immutable response. Suspension, expiry and claim rotation remain the original access policy. Transport uncertainty retains a reservation until the original completed result or a selected operator recovery resolves it.

### Connect an agent to the same customer

Add the original agent setup directory when opening the same customer workspace:

~~~sh
starforge prepaid-api customer-serve \
  --config /srv/customer/prepaid-analysis/customer-config.json \
  --agent-directory /srv/customer/prepaid-analysis-agent
~~~

The original launcher produces the actual customer connection, merchant MCP configuration, client settings and private operation/export/receiving directories. Import its generated `client-settings.json` into the intended local agent host. The selected customer alias is `customer`.

The original `merchant_api_pass_` tools and typed API client use the same running customer workspace. They retain original request/operation IDs, complete result/review/proof/history exports and resumable downloads. Saved exports remain available through their original reader after the customer console closes.

The merchant's `merchant_api_console_` family operates its same running merchant console through the source-owned provider. The selected recipe includes its complete setup, typed client, original operations and encrypted receiving. Its [agent guide](../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/AGENT_OPERATING.md) gives all 33 tools and complete original file receiving.

## 8. Backup, restore and reopen

Use the original merchant console to capture the selected offer. The generated backup selection includes the exact application root; the original capture also carries its merchant database, entitlement and API usage records, immutable execution results and original SF98 outbox. The selected private passphrase environment must be present in that original process.

Receive both `application-backup.zip` and its companion `backup.json` from the same native export. The original merchant download command streams large files with manifest, length and SHA checks.

Restore on the intended host through the installed original complete receiver:

~~~sh
starforge api-merchant-workspace restore-bundle \
  --bundle /srv/merchant/received/application-backup.zip \
  --metadata /srv/merchant/received/backup.json \
  --out /srv/merchant/restored-analysis \
  --pass-env SF101_BACKUP_PASSPHRASE
~~~

Use the actual selected passphrase environment name if it differs. The command validates the downloaded metadata and complete native source identities, restores the original application and merchant snapshot, and rebinds only physical paths, including the original outbox. A complete matching destination reopens. An unrelated or incomplete independently selected destination is preserved.

The merchant console's original in-workspace restore additionally retains the mapping between captured and current orders. An order created or advanced after capture stays on its original current offer; the restore does not silently reassign it to an older snapshot.

Customer operational reopening needs its original customer directory, complete received handoff and selected Buyer/Inbox authority directories. Reopen the same `customer-config.json` and bootstrap operation. Exact downloaded results, original histories and proof files are portable outputs; the private authority directories keep their original roles.

## Durable continuation and shutdown

| Observed state | Continuation |
| --- | --- |
| Setup stopped before its first named record | Reopen the same setup. A complete original `.write-UUID` record is adopted; incomplete owned bytes remain preserved. |
| Generated setup file already exists | Match its exact original bytes and continue the same plan. |
| Native action accepted but its response was lost | Read/reopen the original operation ID and retained full request. |
| Native revision rejected before creating an operation | Retain the definite rejection and confirmed absence; explicit `--resume` admits a new recorded attempt at the current revision. |
| Native action is `ATTENTION` | Explicitly resume that same original operation and request SHA. |
| Waiting command reaches its wait limit | Keep the returned original operation; the console continues owning it. |
| Member receiving was interrupted | Continue the same native export/member identity; complete matching bytes are reused. |
| Customer browser reloads | Original saved drafts, actions, requests and reviews remain in the same workspace. |
| Customer Stop encounters a cleanup failure | The same foreground owner and close continuation remain present for the next explicit Stop. |

The original customer CLI installs its signal handlers before startup, adopts any retained cleanup owner when startup fails, and drains the original server/model on startup-output failure. The original model/server own the accepted requests, active tasks, approvals and lease. Their stable under-lease callback publishes the final stopped launch before lease retirement; no later launch write can replace a successor process.

The prepaid CLI reuses that original foreground lifetime. It introduces no additional service supervisor, queue writer or approval channel.

CLI result codes are 0 for complete preparation/receiving and a normally closed foreground app, 3 for an incomplete original workflow, and 2 for a prepaid command error. The original foreground owner's native error status may remain set after a recovered close failure. Error output carries only the code and retained operation identifiers needed to reopen the same work.

## Programmatic use

The complete typed export uses the same functions as the installed command:

~~~js
import {
  preparePrepaidApi,
  readPrepaidApiRequest,
  publishPrepaidApi,
  preparePrepaidCustomer,
  downloadPrepaidCustomer,
  preparePrepaidCustomerWorkspace,
  servePrepaidCustomer,
} from '@tokenjunkielabs/starforge-merchant/prepaid-api';

const setup = await preparePrepaidApi({
  directory: '/srv/merchant/prepaid-analysis',
  request: await readPrepaidApiRequest('/srv/merchant/prepaid-config/request.json'),
});

const published = await publishPrepaidApi({
  directory: setup.directory,
  launchFile: setup.launchFile,
  resume: true,
});

const order = await preparePrepaidCustomer({
  directory: setup.directory,
  launchFile: setup.launchFile,
  orderReference: 'analysis-customer-001',
  label: 'Analysis customer',
});

const received = await downloadPrepaidCustomer({
  directory: setup.directory,
  launchFile: setup.launchFile,
  orderReference: order.orderReference,
  out: '/srv/merchant/customer-handoffs/analysis-customer-001',
});
~~~

Inspect each returned status before proceeding to the dependent step. `READY` publication and customer-order results, followed by `COMPLETE` receiving, carry their original native identity. Incomplete results retain the original operation or confirmed admission rejection.

On the receiving customer's host:

~~~js
const customer = await preparePrepaidCustomerWorkspace({
  handoffDirectory: '/srv/customer/incoming/analysis-customer-001',
  directory: '/srv/customer/prepaid-analysis',
  mode: 'purchase',
  buyerWorkspace: '/srv/customer/original-buyer-workspace',
  intentId: 'analysis-customer-001-purchase',
});

const app = await servePrepaidCustomer({
  configurationFile: customer.configurationFile,
  approvalMode: 'auto',
  port: 0,
});

try {
  // app.url opens the original browser; app.prepaid selects its saved profile.
  // The original customer model exposes that same profile and task lifecycle.
} finally {
  await app.close();
}
~~~

Embedding applications retain a rejected close's original recovery handle and continue that same owner. For an ordinary foreground process, the installed CLI and its original `runCustomerWorkspaceLifetime` handle startup, output, signals and recovery together.

## Source and maintained interfaces

- [Product source](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/main/products/prepaid-api)
- [Original merchant console](../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/workspace/README.md)
- [Original customer workspace](../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-access/workspace/README.md)
- [Original checkout and signed delivery](../../stellar/scf-starforge-20261009/sf101-merchant-receiver/CHECKOUT.md)
- [Original purchased application and recovery](../../stellar/scf-starforge-20261009/sf101-merchant-receiver/api-application/README.md)
- [Original runtime installation](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
- [Original source selections](../../stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md)

The contribution registers the product command and typed export. The maintained source selector and builder own the complete package; the Applications and MCP registries load the original selected providers.
