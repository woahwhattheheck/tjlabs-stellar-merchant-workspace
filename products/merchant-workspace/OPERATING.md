# Operate and hand over a Stellar merchant

This guide follows the same installed `starforge` commands and native
workspaces used by the product's browser and MCP interfaces. Use actual source
endpoints, workspace aliases, returned IDs and archive hashes in place of the
example selections.

## 1. Select a runtime and keep its state

Choose one private runtime directory for the installed source and dependencies,
and separate directories for the merchant's operating state. The maintained
`runtime-install` commands prepare and install the selected source archive.
They retain its original dependency manifests and lock.

| Workflow | Dependency selection |
| --- | --- |
| Captured API authoring and native merchant compiler | `schema`, `openapi`; add `mcp` for the agent and native Stellar packages for the selected payment runtime |
| GraphQL authoring and generated merchant | `graphql`, `schema`, `openapi`; add native Stellar packages for the merchant's configured payment runtime |
| Purchased API customer and original payment lifecycle | Native Stellar packages, `mcp`, Python 3.11 or later, and the original selected Buyer/Inbox directories |
| Merchant MCP interface | Add `mcp` and the features used by the selected workspace |
| STAC catalog and local retained explorer | Original Node source and local file-lock support |
| STAC merchant/customer receiving | Native Stellar packages, `schema`, and `openapi`, as specified by the original GIS receiving guide |
| Incident watcher and case desk | Original Node source and local file-lock support; configured Slack/webhook credentials when notifications are selected |
| Accounting provider operations | The existing merchant MCP runtime and original selected QuickBooks/Xero workspace configuration |
| Merchant pricing, supplier costs and scenario planning | The same installed merchant runtime, original seller configuration and selected operations source or retained exports |
| Material catalog | The catalog guide's original runtime feature and provider configuration |

Use `starforge registrations` to inspect the selected package's actual command
registrations. `starforge source` opens its source identity. Runtime upgrades
select a new source archive in a fresh runtime directory and preserve the
existing private workspaces.

For commands launched from a prepared runtime, the original dispatcher is:

~~~sh
starforge runtime-install run --dir /srv/starforge/runtimes/merchant -- COMMAND ARGUMENTS
~~~

The runtime installer must have completed for that directory. Use its original
inspect/recovery actions after an interrupted installation.

## 2. Turn a captured API into a merchant

Initialize one private product and open its original browser:

~~~sh
starforge captured-api init --dir /srv/starforge/state/captured-api \
  --name 'Supplier API'

starforge captured-api open --dir /srv/starforge/state/captured-api --browser-only
~~~

Use the full private URL returned by the command. An existing source and merchant
library can be selected with `--projects` during initialization. An
Applications-managed browser can be selected with its original private
`--console-url-file`; both agent providers then attach to that same console.

In **Captured API sources**, upload the original HAR. Review its source origins,
methods, paths, request and response observations. Choose **Review operations
here** and author path templates, safe examples, request and response contracts,
credential environment references, and query/header decisions. Acknowledge the
selected operations and save the immutable review. **Use approved source** then
opens that source in the original merchant form.

Set the seller address, service name, network, asset, recipient and payment
flow. Keep complete upstream, authorization, transport, cache and concurrency
settings with their original routes. Use the source-bound route worksheet to
review the inventory, search selected operations and edit exact atomic prices.
Bulk adjustments require an explicit rounding choice. Importing a retained
worksheet reconciles the original base, current plan and incoming edits; choose
conflicting values explicitly.

Preview through the original compiler, save a new merchant package and reopen it.
The package preserves its approved source, complete plan, compiled merchant and
native receiving files. Continue through the original release workflow to
prepare, stage, select and run the merchant, using the intended backend and
payment configuration.

To open the same product with its agent, close the browser-only product process,
supply the incoming bearer token in the named environment variable and reopen:

~~~sh
starforge captured-api open --dir /srv/starforge/state/captured-api \
  --token-env MCP_ACCESS_TOKEN --mcp-port 3211
~~~

The HAR and OpenAPI providers share workspace alias `merchant`. They operate the
same original source library, review revisions, complete merchant plans, route
worksheets and saved packages. Use the original returned source/plan/review
identities when saving or continuing a downloaded file.

For a later capture, select the prior immutable review as the baseline. The
native refresh retains both captures and the original decisions; changed and
returning routes remain explicit review work. Save the revised source, carry
the intended complete merchant settings, and compile another package. A source
handover includes the complete native capture or refresh directory and saved
reviews. The merchant handover includes the full native package and any retained
worksheet. Receiving merges valid missing reviews while preserving reviews
already authored in that destination.

The [captured API operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/captured-api/OPERATING.md)
contains the exact runtime installer, file intake, offline review, agent,
release, transfer and recovery commands. Keep its private product and project
directories outside the source checkout and reuse them after an upgrade.

## 3. Open purchased API access for its customer

The API-pass customer keeps purchased access, request history, original payment
records and responses in one retained workspace. Open **Applications → API-pass
customer**, or configure and launch the same native customer directly:

~~~sh
starforge api-pass-workspace configure \
  --directory /srv/starforge/state/api-customer \
  --out /srv/starforge/config/api-customer.json \
  --claim-env SF101_CLAIM_TOKEN

starforge api-pass-workspace serve \
  --config /srv/starforge/config/api-customer.json \
  --agent-directory /srv/starforge/state/api-customer-agent --port 0
~~~

Create the private customer and configuration parent directories first. Supply
the selected claim credential through its declared environment name. For
purchase execution, select the original Buyer workspace, Buyer state, Inbox,
Python executable and installed source runtime in that same customer
configuration. The product guide supplies their complete setup command.

Connect existing access using its actual order, purchased-plan hash and selected
merchant origin, or open the full original saved purchase. Read the merchant's
current routes, unit costs and allowance. Prepare a request with its stable
request ID, exact body and ordered query before execution. A repeated request
continues that same intended call; retain its original ID after a lost response.

The optional agent directory contains the original `client-settings.json` for
the local MCP host. Browser and agent share customer alias `customer`, workspace
UUID, profiles, saved calls, purchase reviews and native tasks. Managed
Applications keeps this customer under its original process owner and drains
its queue through **Stop**.

The installed `merchant-api-pass` client prepares exact commands into retained
operation directories, then dispatches or reconciles those saved operations.
Read the returned task until its original work completes. Keep the original
purchase review and approval channel when executing or recovering payment.

Capture the selected complete response, purchase review, payment record, Buyer
report or customer history. Inspect its original export manifest, download the
same immutable files, and reopen the received bytes. Interrupted transfers
continue from their retained verified prefix. A later history capture uses
another export ID.

The [purchased API customer guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/api-customer/OPERATING.md)
contains the full source installation, native purchase configuration, generated
agent settings, command preparation/replay and download commands. Preserve the
customer, configuration, agent directory and original Buyer/Inbox state when
upgrading the installed runtime.

## 4. Author a GraphQL data product

Start the original saved browser workspace:

~~~sh
starforge graphql-workspace \
  --workspace /srv/starforge/state/graphql --port 0
~~~

Provide any backend credential environment values to this process before
launch. The browser accepts the configured environment-reference name.

### Capture and author

Capture the actual served GraphQL schema from the selected source. Inspect its
query root, field types, descriptions, argument defaults, enums and input
objects. The workspace also accepts an existing served SDL, introspection JSON,
or retained source envelope.

Create an approved operation from that schema. Select object-valued roots and
nested fields, assign result aliases, and bind supported buyer variables with
explicit bounds and examples. Fixed enum, list and input-object arguments remain
GraphQL literals. Applying a field selection updates the original query file and
its existing route references, including an operation rename.

Save the draft and run its explicit source preview. Read the returned HTTP
status, rows, and exact JSON. Numeric decimal strings stay strings. Download or
reopen that original response from the retained previews list.

### Configure the service and export it

Save the intended merchant plan: public POST route, service description, example
variables, and ordered payment choices with actual network, asset, public
recipient, amount and timeout. Existing per-route overrides stay attached to
their routes.

Review the saved project, then export it. The result contains the original
schema/source envelope, approved query definitions, merchant plan, native seller
configuration and handlers, generated buyer JavaScript/TypeScript client, and
request examples.

Starting a merchant selects an export that matches the current saved draft.
The original runtime accepts the deployment's configured facilitator; its
challenge-only mode remains available for opening the declared offers. Source
preview, HTTP challenge, customer execution, and settlement each retain their
own actual records.

### Revise and deploy

Select a prior saved export as the baseline. Capture or load the updated served
schema and edit the proposed query or terms in the same project. Compare the
current draft with that baseline. The report keeps operation validity, selected
schema contracts, argument/default changes, routes, variable schemas, payment
choices and source bindings together.

Save the reviewed candidate and prepare its revision package. Then use the
existing deployment workspace to:

1. Prepare the selected merchant export.
2. Stage it as an original release.
3. Inspect the staged release and its current generation.
4. Activate and start the selected release.
5. Stop its owned process before switching or rolling back.
6. Prepare the configured host handover from that exact deployment.

The returned deployment and release IDs belong to this same saved project.
Reopening the browser uses its retained records. The full
[deployment guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf105-subquery-graphql-merchant/deployment/README.md)
defines the host plan, native runtime files, credentials, process lifecycle and
receiving commands.

## 5. Operate that same project through MCP

Declare the existing GraphQL workspace and fixed source aliases in a private
connection file. The
[MCP GraphQL guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar-forge/mcp-merchant-operator/GRAPHQL_WORKSPACES.md)
contains its complete schema and original host configuration.

Initialize the merchant provider against that file:

~~~sh
starforge merchant-mcp init-graphql-workspaces \
  --dir /srv/starforge/operator \
  --connection /srv/starforge/config/graphql-connections.json

starforge merchant-mcp serve \
  --config /srv/starforge/operator/merchant-mcp.json --port 3211
~~~

Supply the incoming MCP access token through its configured environment name.
Source credential values remain in that server's environment.

`merchant_graphql_open` opens the original GraphQL writer and returns its
instance ID and private browser URL. The agent and browser then operate the same
project and revisions. Use the latest returned revision for the next edit;
reopen and reconcile a concurrent edit when the native store reports a conflict.

| Action sequence | Retained result |
| --- | --- |
| Status → open → projects → selected project | Original workspace instance and project revision |
| Schema capture → field selection → save → review | Canonical saved query and merchant plan |
| Preview start → status → result | Original preview UUID, request binding and returned response |
| Preview recovery | The completed original result attached to the current project |
| Prepare → evolution review → revised preparation | Original export, baseline and schema-change package |
| Deployment prepare → stage → host; release activate/start/stop | Native deployment, release generation and configured host packet |
| Export prepare → selected file read/download | Original immutable files and resumable transfer state |

Keep a preview's original UUID after a lost reply. Inspect its saved status and
completed response before starting another provider request. A completed
response can be attached to the current project without querying its source.

Retained file manifests expose the original filenames, lengths and hashes.
Use the same download selection to continue an interrupted file. Completed
exports remain readable after the workspace process closes. Reopening the
workspace preserves its original project, previews, exports and deployments.

Close the GraphQL instance through its returned instance ID. This drains its
owned mutation and native processes. Another operator can then open that same
directory normally.

## 6. Prepare imagery, processing history and customer receiving

Create and open the original imagery workspace:

~~~sh
starforge stac init \
  --workspace /srv/starforge/state/imagery \
  --title 'Imagery operations' \
  --endpoint https://earth-search.aws.element84.com/v1

starforge stac serve \
  --workspace /srv/starforge/state/imagery --port 0
~~~

Discover the selected catalog. Save the actual collections, area, time interval
and supported cloud predicate. Review the source selection before acquisition.
The original provider follows the catalog's native page links and retains each
request, response, completion condition and scene identity.

Use the browser to inspect footprints, metadata, assets and acquisition
progress. Explicitly select the imagery files to retain. Scene/asset views use
those retained bytes. Record selection decisions, compare saved editions, and
keep their source times and collection/item identities.

### Attach existing processing operations

The same STAC browser can open a configured FilmDrop or Cirrus history workspace:

~~~sh
starforge stac serve \
  --workspace /srv/starforge/state/imagery \
  --processing-workspace /srv/starforge/state/processing \
  --processing-config /srv/starforge/config/processing.json
~~~

Use the deployment/source format in the
[processing guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/stac/processing/PROCESSING.md).
It supports the original selected API contract, exact source bytes and configured
credential references.

Read the native workflow inventory, review selected workflows, and capture their
run-page chains. Inspect original workflow, payload, execution and source IDs.
Counts, capped counts, transition counts and unique counts retain their native
meaning. Resume the remaining pages in the same saved edition when a capture is
interrupted.

Review associations with the selected scene edition. Exact collection/item
identity or asset href can establish a native match. An operator association
records its own explanation. Keep unmatched and ambiguous items visible in the
operating history.

### Hand over the complete selected result

Use the original workspace's merchant/customer and export actions. Retain the
selected scene edition, permitted asset bytes, processing inventory/history,
source captures and operator decisions as required by that delivery.

The maintained customer receiving commands are:

~~~sh
starforge stac customer-open --directory RECEIVED_DIRECTORY

starforge stac portable-export \
  --directory RECEIVED_DIRECTORY --out NEW_PORTABLE_DIRECTORY

starforge stac portable-open \
  --directory NEW_PORTABLE_DIRECTORY \
  --expected-manifest-sha256 ORIGINAL_MANIFEST_SHA256
~~~

Keep the complete portable directory with its local `scene-explorer.html`,
catalog metadata and selected files. The explorer can reopen those files offline.
The original
[GIS receiving guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/stac/receiving/PORTABLE_GIS.md)
specifies the exact receive/export APIs, runtime dependencies and reopening
behavior.

## 7. Operate incidents and merchant follow-up

Initialize the original incident store from the selected private watcher
configuration. It binds the actual seller/operations listeners, merchant
identities, thresholds, retention and optional Slack or webhook destination.

~~~sh
starforge support-watch init \
  --state /srv/starforge/state/incidents \
  --config /srv/starforge/config/watch.json

starforge support-watch status \
  --state /srv/starforge/state/incidents
~~~

The original
[incident guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf93-seller-support-bundle/INCIDENT_OPERATIONS.md)
includes the complete watcher configuration and startup sequence.

Register this existing store in a private incident-sources file, then open the
case desk:

~~~sh
starforge support-console \
  --incident-sources /srv/starforge/config/incident-sources.json \
  --cases-dir /srv/starforge/state/merchant-cases \
  --port 0
~~~

Select the configured source. Start its watcher through the console, or keep its
existing external watcher. The console can stop only a watcher it owns. Review
actual incident captures, acknowledge the current incident revision, and
continue its follow-up in the saved merchant case.

Notification operations retain their original event, destination and attempt
count. Read the queue before retrying a lost or paused delivery. The Slack
transport keeps the original incident thread and returned message timestamps.
Changing a destination does not rewrite an earlier queued event's recipient.

Attach the selected captured route to the current case, keeping its actual
method and original before/follow-up files. Save the case and export its complete
support handoff. The receiving operator opens the original handoff in the same
case desk and retains its route, source observations, notes and follow-up.

## 8. Complete accounting work in its original destination

The installed accounting customer uses the existing merchant MCP connection and
the selected QuickBooks or Xero workspace alias:

~~~sh
starforge merchant-accounting-platforms sources \
  --url "$ACCOUNTING_MCP_URL" --workspace "$ACCOUNTING_WORKSPACE" --platform qbo

starforge merchant-accounting-platforms open \
  --url "$ACCOUNTING_MCP_URL" --workspace "$ACCOUNTING_WORKSPACE" --platform qbo
~~~

Use the returned source aliases and actual company/tenant identifiers. Preview
the selected native operation, save its exact result, and prepare an operation
directory. Execute that retained request and reconcile its original result after
a reply or an interruption.

The
[accounting customer guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar-forge/mcp-merchant-operator/ACCOUNTING-PLATFORMS-CLIENT.md)
covers company/tenant binding, original request files, provider responses,
QuickBooks journal work, Xero lifecycle, accountant returns, exact downloads and
reopening. Keep the full prepared operation directory with the accounting
workspace. A new process can reconcile that same request without recreating the
financial operation.

## 8A. Operate supplier costs, pricing and full workspace receiving

Open **Applications → New application → Merchant pricing and scenario
planning** in the same installed product. Select the merchant's original seller
configuration, one private pricing directory and its operations listener or
retained session/history exports. Optional supplier usage and accounting files
provide the original context for explicit capture in Supplier costs.

The direct command opens that same original workspace:

~~~sh
starforge revenue-workspace \
  --config /srv/starforge/state/merchant/seller-service.json \
  --history /srv/starforge/state/merchant/merchant-usage.json \
  --state /srv/starforge/state/merchant/pricing --port 0
~~~

Use the merchant's actual paths. An operations URL can replace the retained
traffic file. Keep the current original seller configuration with its complete
ordered payment choices; saved reviews also retain the exact seller and
observations that supplied their routes.

### Retain sources and make a pricing decision

Save a pricing review for the intended routes and observation period, then open
**Supplier costs** from Applications or the pricing page. Retain the supplier's
original bill, credit note or quotation before entering monetary lines.

For a delimited original, select its delimiter and explicitly map the columns
for the native reference, supplier, kind, currency, amount, quantity, unit and
description. Keep original text references and a reason for an excluded row.
A PDF or other source can support manually entered reviewed lines while its
complete original remains attached.

Allocate signed amounts to their actual merchant route IDs. The page retains
unassigned money, original units, separate currencies and billed or quoted
basis. Review the supplier period beside the saved merchant observation period,
the available fulfilled-response counts and each route's coverage. Save the
complete cost edition, then compare corrections against the earlier edition.

Prepare a quoted or billed cost proposal for explicitly selected routes. Review
its original conditions and exact values before applying it to a new pricing
review. That saved review carries the cost input, source references and original
proposal. Open **Scenario planning** to compare alternative demand, price and
cost assumptions against the same saved source and retain the selected plan.

To change a merchant's atomic payment amount, continue through the pricing
page's existing **Prepare price change** review. Its original package, release
store and runtime selection carry that explicit change through staging,
activation and normal runtime operation.

### Receive a complete workspace through Applications

Use **WORKSPACE_BACKUP** in Supplier costs to export the complete retained
pricing and cost workspace. The original TAR carries supplier sources, saved
cost editions, cost-linked pricing reviews, price decisions and scenario plans.
Keep that complete file and its manifest with the receiving work.

On the destination product:

1. Choose **Merchant pricing and scenario planning** and enter a new private
   pricing directory beneath an existing private parent.
2. Select the full TAR in **Complete pricing and supplier-cost backup**. Select
   the merchant's original seller configuration and the source files or
   operations listener to use for subsequent reviews.
3. Choose **Review application**. Inspect the archive path, complete hash,
   bytes, retained file count, included source/review/plan counts and receiving
   destination. The review identifies a new target, an interrupted restoration
   or this same completed restoration.
4. Save the application and use **Review start → Start reviewed application**.
   The original restore verifies the reviewed archive before receiving files.
   An interrupted import continues from the same archive and destination.
5. Open **Supplier costs**, **Scenario planning** and the pricing history.
   Reopen the original supplier files and saved editions, then continue the
   same retained work.
6. Stop and reopen normally. After successful receiving, clear the optional
   backup field while retaining that pricing directory if the TAR is moved
   away from its original handover path.

The same existing native receiving implementation serves the CLI:

~~~sh
starforge revenue-workspace \
  --inspect-cost-workspace /srv/starforge/received/pricing-cost-backup.tar \
  --state /srv/starforge/state/received-pricing

starforge revenue-workspace \
  --config /srv/starforge/config/received-merchant.json \
  --history /srv/starforge/received/merchant-usage.json \
  --restore-cost-workspace /srv/starforge/received/pricing-cost-backup.tar \
  --expected-cost-backup-sha256 REVIEWED_FULL_BACKUP_SHA256 \
  --state /srv/starforge/state/received-pricing --port 0
~~~

Replace the digest placeholder with the inspection's actual
`sourceArchiveSha256`. Inspection reads the full archive and target without
opening a listener or creating a workspace. The original 512 MiB complete
archive limit and per-file limits apply to receiving.

### Operate and receive through the merchant agent

The existing merchant pricing connection can declare supplier-source and
complete cost-book file aliases. Browser and agent use the same native cost
sources, cost editions, original pricing revisions and exported files.
The merchant MCP's `pricing cost-*` actions cover exact input selection, source
capture, mapping, allocation review, save, correction, pricing apply, request
recovery and complete resumable downloads.

Use the current economics revision for a cost save and the current pricing
revision for a pricing apply. Retain the complete original request and its ID
when recovering an interrupted response. Receive the original workspace backup
through `cost-download`, then use the same Applications receiving path.

The [pricing Applications guide](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/PRICING_APPLICATIONS.md)
covers the installed receiving controls and normal process lifecycle.
The [source-cost guide](../../stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/economics/README.md)
defines original fields, exact allocation and coverage. The
[merchant MCP cost guide](../../stellar-forge/mcp-merchant-operator/COSTS.md)
provides the complete host declaration, saved request and file-transfer commands.

## 9. Recover and upgrade from retained state

| Situation | Continue from |
| --- | --- |
| Browser closes during editing | The same saved project/case and latest returned revision |
| Purchased API or agent response is interrupted | Original customer, profile/call/task IDs and retained client operation directory |
| Captured API setup or session stops | The original private product setup, source library, reviews and merchant packages |
| Captured source changes | Prior immutable review, exact later HAR and retained native refresh |
| Pricing work moves between operators | Complete base/proposed worksheet and current original source/plan; a full pricing-and-cost backup carries retained supplier originals, editions and saved scenarios |
| Pricing/cost import stops | The same complete backup, inspected digest and original receiving directory |
| Source preview reply is lost | Original preview UUID, retained status and completed response |
| Schema or merchant terms change | The existing export baseline and new saved candidate revision |
| Deployment action reply is lost | Original deployment ID, release generation and saved action recovery |
| Source or processing capture stops | The same edition and its retained next request/remaining-page chain |
| Customer file transfer stops | Original manifest and saved transfer offset |
| Watcher stops | The original incident directory and current process ownership |
| Notification reply is uncertain | The original event, destination, attempts and provider receipt |
| Accounting response is uncertain | Original prepared operation directory and native reconciliation |
| Runtime installation stops | The same install directory, source archive and original installer state |

Before moving or upgrading a complete operating workspace, stop its owned
process through its normal close/drain action. Preserve configuration, the
whole retained state directory, source files and completed exports together.
Use the workflow's original export/receiving mechanism when it provides one.

Open the received result, inspect its original identity and selected files, then
continue work in that received workspace. Keep the previous runtime and
completed handoff while selecting a new runtime or release. The original
controllers retain concurrency checks, history and ownership across reopening.
