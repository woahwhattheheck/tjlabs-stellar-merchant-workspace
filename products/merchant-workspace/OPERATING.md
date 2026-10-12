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
| GraphQL authoring and generated merchant | `graphql`, `schema`, `openapi`; add native Stellar packages for the merchant's configured payment runtime |
| Merchant MCP interface | Add `mcp` and the features used by the selected workspace |
| STAC catalog and local retained explorer | Original Node source and local file-lock support |
| STAC merchant/customer receiving | Native Stellar packages, `schema`, and `openapi`, as specified by the original GIS receiving guide |
| Incident watcher and case desk | Original Node source and local file-lock support; configured Slack/webhook credentials when notifications are selected |
| Accounting provider operations | The existing merchant MCP runtime and original selected QuickBooks/Xero workspace configuration |
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

## 2. Author a GraphQL data product

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

## 3. Operate that same project through MCP

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

## 4. Prepare imagery, processing history and customer receiving

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

## 5. Operate incidents and merchant follow-up

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

## 6. Complete accounting work in its original destination

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

## 7. Recover and upgrade from retained state

| Situation | Continue from |
| --- | --- |
| Browser closes during editing | The same saved project/case and latest returned revision |
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
