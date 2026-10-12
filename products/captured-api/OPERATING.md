# Operate a captured API merchant

The captured API product connects the original HAR source workbench, SF61
merchant browser, HAR/OpenAPI merchant agent, route pricing and policy editors,
persistent operator workflows and SF82 release lifecycle. One retained product
connects source decisions, merchant plans, complete customer packages and receiving.

## 1. Install the selected product source

Use Linux, Node.js 22.16 or later, npm and util-linux flock. Keep product state on
a filesystem supporting atomic rename, hard links, file locks and fsync.

The standalone product uses the maintained source builder:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . --ref HEAD --selection openapi-merchant --out /private/packages/merchant
~~~

The `openapi-merchant` recipe includes this product's original Applications entry,
source workbench, operation policy editor, merchant Console, reusable workflow
client, complete receiving and seller release commands. Its installed product
metadata retains this standalone repository. Keep the returned archive and its
actual SHA-256 together. The source-only
installation path is:

~~~sh
npm install --ignore-scripts --offline --omit=optional /absolute/path/to/package.tgz
npx --no-install starforge registrations --command captured-api
~~~

For a captured API merchant with OpenAPI source, schema patterns, agent and
native Stellar payment runtime, select the original runtime features:

~~~sh
starforge runtime-install prepare \
  --dir /private/runtimes/captured-api \
  --archive /private/downloads/merchant.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

starforge runtime-install install --dir /private/runtimes/captured-api
~~~

Use the actual archive path/hash and the selected runtime's original dependency
declarations. The installer retains progress and an exact lock. Its
[guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
covers native prerequisites, interruption and recovery.

Run the product through that prepared runtime:

~~~sh
starforge runtime-install run --dir /private/runtimes/captured-api -- \
  captured-api init --dir /private/state/captured-api --name 'Supplier API'

starforge runtime-install run --dir /private/runtimes/captured-api -- \
  captured-api open --dir /private/state/captured-api --browser-only
~~~

For the commands below, use the same runtime prefix when that runtime provides
the selected dependencies. From a complete source checkout, the entrypoint is
`node products/captured-api/cli.mjs`. Installed archives retain these original
relative source paths.

## 2. Initialize and open one private product

Create the private parent directory first, then initialize the product:

~~~sh
mkdir -m 700 /private/state

starforge captured-api init --dir /private/state/captured-api \
  --name 'Supplier API'

starforge captured-api open --dir /private/state/captured-api --browser-only
~~~

The product writes its retained setup and creates this private state:

| Path inside the product directory | Purpose |
| --- | --- |
| `projects/` | Native merchant packages and retained `.har-captures` source library |
| `inputs/` | Host-selected capture, decision, source, plan and worksheet files |
| `receiving/` | Complete source and merchant receiving destinations |
| `har-connections.json` | Original source aliases and project binding |
| `openapi-connections.json` | Original merchant, worksheet and package receiving handles |
| `operator/` | Original merchant MCP configuration, release store and customer exports |
| `operator-console/` | Persistent operator profiles, requests, workflow recipes/runs and complete customer downloads; created when the agent opens |
| `product.setup.json` / `product.json` | Retained setup and completed source connections |
| `session.json` | Latest product session, browser/MCP addresses, operator URL and retained operator workspace path |

The native operator is prepared in a separate initialization directory before it
is published as `operator/`. Repeating initialization with the same setup reopens
the completed product or finishes its retained setup. Earlier incomplete staging
directories remain available for inspection. A completed product preserves later
operator-added connection handles.
If an earlier initialization retained the original uppercase worksheet handle,
the same initialization preserves that exact connection file as
`openapi-connections.initialization-v0.json`, applies its lowercase alias and
finishes the original product. Other authored connection definitions retain
their existing identity.

Open the full local browser URL from stdout. It contains the original console's
temporary access token. The private URL file also supplies that same console
to both native agent connections.

The product holds an OS file lease while open. A second owner receives
`CAPTURED_API_ALREADY_OPEN`. Use the existing session or close it through Ctrl-C
before opening another. Closing or exiting releases the OS lease.

### Reuse an existing project library

~~~sh
starforge captured-api init \
  --dir /private/state/supplier-operator \
  --projects /private/existing-merchant-projects \
  --name 'Supplier API'
~~~

The selected projects directory must already be canonical and private. The
product opens the original console against it and keeps its existing merchant
packages and captured-source library.

### Run the retained product from Applications

Applications can own this product's browser and merchant agent as one original
managed process. Start with the complete installed runtime selected in section 1
and initialize the private product once:

~~~sh
starforge runtime-install run --dir /private/runtimes/captured-api -- \
  captured-api init --dir /private/state/captured-api --name 'Supplier API'
~~~

An existing project library can be selected with the same original `--projects`
option. Finish initialization before selecting the application. Review reads the
retained product; setup and source intake remain the original product operations.

In the runtime workspace, select the actual READY installation and choose
**Applications → New application → Captured API merchant**.

| Application setting | Select |
| --- | --- |
| Product directory | The existing private directory containing `product.json`, such as `/private/state/captured-api` |
| Browser only | Enable for the original source/merchant browser alone; disable to add its original merchant agent |
| Browser port | `0` for an available loopback port, or the actual fixed callback port required by the selected browser OAuth configuration |
| MCP port | `0` for an available port, or the intended original agent port; it must differ from a fixed owned browser port |
| Token environment name | The host's original incoming MCP token reference, normally `MCP_ACCESS_TOKEN` |
| Environment file | The existing private environment selected for the original process, where required by the merchant and its providers |

For the full agent, supply its existing fixed bearer token or the original
`MCP_OAUTH_CONFIG` configuration according to the native merchant MCP
authorization contract. Applications retains environment reference names and
the selected file path; token values belong to the original private host
environment.

Use the original application lifecycle:

1. **Review application** to inspect the retained product name, exact project and
   configuration paths, browser ownership, both source providers, listener choices
   and selected runtime/source.
2. **Save application** to retain that selection through the existing managed
   release. Keep its saved application and operation identity if the reply is lost.
3. **Review start** to bind the current product profile, original operator and
   connection files, optional OAuth configuration and directory identities.
4. **Start reviewed application** to open the original product through its existing
   lease. Applications receives one source-bound startup record after the original
   listeners are open and the selected files have been checked again.
5. **Open application** to enter the original captured-source library and merchant
   form. With the agent enabled, **Operator workspace** opens its persistent
   Requests, Workflows and Customers interface. **Merchant agent endpoint** gives
   the same host's MCP address and native workspace alias `merchant`. The HAR
   and OpenAPI providers share the same product.
6. Complete capture, operation review, merchant terms, route pricing, package save,
   release and receiving using sections 3–8.
7. **Stop application** to drain the original agent, then the owned browser and its
   merchant. Review the same saved application again and start it to reopen its
   retained sources, review revisions, plans, packages and releases.

Close an existing manually started product before starting its managed application.
Both use the same original product lease. Closing the Applications browser window
leaves its managed process available through the existing runtime operation;
use **Stop application** when that process should close.

The launch binding changes when a retained product/configuration file, selected
directory identity, listener choice or authorization configuration changes.
Review the actual current selection again after such an edit. Normal capture,
review, pricing, package and release work leaves that launch configuration intact.
Session records and changing private listener tokens are deliberately outside it.

For a product-owned browser with registered OAuth providers, the original
OpenAPI launch inspector supplies the **Registered provider connections** review:
selected private connection directories, immutable profiles, registered callbacks
and source identities. The original managed OpenAPI launcher verifies those
same opened profiles before the outer product announces its listeners. Changing
a directory environment reference, public profile or callback requires a fresh
launch review; normal grant renewal remains within the retained connection.

An externally attached original console retains its own lifetime. For such a
product, choose browser port `0`: its existing console already owns the browser
port and provider registry. Stopping this managed product drains its owned agent;
the selected external console remains under its original owner.

The [Applications guide](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/APPLICATIONS.md)
covers the existing READY runtime, save/start review, original process recovery
and reopening controls.

### Embed the same managed launcher

The product also exports its inspected launch for an existing host integration:

~~~js
import {
  inspectCapturedApiLaunch,
  openCapturedApiManaged,
} from './products/captured-api/managed.mjs';

const options = {
  directory: '/private/state/captured-api',
  port: 0,
  mcpPort: 0,
  browserOnly: true,
  tokenEnv: 'MCP_ACCESS_TOKEN',
};
const reviewed = await inspectCapturedApiLaunch(options, { environment: process.env });
const session = await openCapturedApiManaged({
  ...options,
  expectedBindingSha256: reviewed.bindingSha256,
}, { environment: process.env });

// The existing host owns session.close() and calls it when its operation stops.
// session.startup contains the original listeners and the reviewed binding.
~~~

Inspection returns the complete source binding, nonsecret review fields, stable
product resource identity, static file paths/byte counts/SHA-256 values and
directory identities. It opens no listener. Managed open rechecks that binding
under the original product lease before starting and before announcing success.

The command-line inspection returns that same binding without starting a process:

~~~sh
starforge captured-api inspect-launch --dir /private/state/captured-api --browser-only

starforge captured-api open --dir /private/state/captured-api --browser-only \
  --managed-binding-sha256 ACTUAL_INSPECTED_BINDING_SHA256
~~~

Copy the actual `bindingSha256` from inspection and retain the same selected
options and original environment for opening.

The corresponding original CLI accepts `--managed-binding-sha256` on `open`.
That mode prints exactly one JSON startup line with schema
`stellar-forge.captured-api-managed-session.v1`; it includes the inspected
binding, product identity and actual original browser/MCP URLs. These capability
URLs belong to the host's private operation record. Ordinary `open` retains its
readable JSON output and the same signal handling.

### Attach an Applications-managed console

~~~sh
starforge captured-api init \
  --dir /private/state/managed-supplier-operator \
  --projects /private/existing-merchant-projects \
  --console-url-file /private/applications/original-application-url.json \
  --name 'Supplier API'

starforge captured-api open \
  --dir /private/state/managed-supplier-operator \
  --token-env MCP_ACCESS_TOKEN --mcp-port 3211
~~~

Select the actual private URL record produced by Applications for
`openapi-workspace`, or a private file containing the full original printed
console URL. Both native providers reread that record for later operations.
Each operation pins one selected console and checks its authenticated source
library against the exact project directory.

The managed console owns its port, OAuth profiles, browser, seller and shutdown.
Closing this attached product drains its agent and preserves that external
console's lifetime.

### Configure authorization-code providers

A product-owned browser can select the original OAuth host configuration:

~~~sh
starforge captured-api init --dir /private/state/provider-merchant \
  --oauth-connections /private/provider/host-connections.json

starforge captured-api open --dir /private/state/provider-merchant \
  --port 3188 --browser-only
~~~

Use the registered callback port required by that host configuration. Credential
values stay in the host environment or native private provider registry. The
[authorization guide](../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/AUTHORIZATION_CONNECTIONS.md)
covers registration, returned-grant review, renewal and receiving.

## 3. Intake and review the actual source

Export HAR 1.2 from an API you are authorized to inspect and integrate. HAR files
can contain credentials, cookies, customer information and complete payloads.
Keep the original and operating directories private.

In **Captured API sources**, upload the original HAR and give it a useful label.
The native decoder retains the exact bytes, inventory and source identity.
Intake reads the capture without replaying its network requests.

Inspect accepted and rejected entries, source origins, methods and paths,
query/header names, body shapes, response status/media observations and source
groups. Choose **Review operations here** and complete the operating decisions:

1. Select the source origin and intended operations.
2. Author path templates and safe examples. Combine captured groups only when
   one template matches every selected original path.
3. Resolve query, credential and custom-header decisions. Backend credentials
   use environment reference names.
4. Author the supported JSON request-body schema and safe example.
5. Review the observed responses and intended response contract.
6. Acknowledge each selected operation, validate the complete source and save
   its immutable review revision.
7. Choose **Use approved source** to continue into the original merchant form.

The integrated and offline reviewers use the same model. Captured payload values
do not become public examples automatically. The
[native source guide](../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/har/README.md)
explains observations, decisions, unsupported entries, environment references
and the original 128 MiB/100,000-entry intake limits.

### Upload an exact local file

With the same product browser open:

~~~sh
starforge captured-api capture \
  --dir /private/state/captured-api \
  --file /private/inputs/current.har \
  --label 'Supplier API current capture' \
  --sha256 ORIGINAL_CAPTURE_SHA256
~~~

The optional hash pins the input. The command sends its complete private bytes
through the original authenticated upload and checks the returned source
identity. The result includes the native selection, source hash, entry/group
counts and review list. Repeating that capture reopens its native identity.

### Complete an offline review

~~~sh
starforge captured-api har prepare \
  --har /private/inputs/current.har --out /private/offline-source

starforge captured-api har review \
  --workspace /private/offline-source --out /private/offline-review.html

starforge captured-api har save \
  --workspace /private/offline-source --decisions /private/decisions.json
~~~

Open the original HTML locally, author the review, and save its downloaded
decisions. The native writer returns the immutable revision SHA-256.

Adopt that complete native workspace into the running product:

~~~sh
starforge captured-api adopt \
  --dir /private/state/captured-api \
  --kind capture --from /private/offline-source \
  --label 'Reviewed supplier source'
~~~

The original capture and saved reviews enter the same browser library.
Re-adoption merges newly saved valid reviews and preserves reviews already
created in the receiving library.

## 4. Author the merchant and price its routes

Use the approved source in the original merchant form. Set the separate public
HTTPS seller address, service name, payment network, asset, recipient, flow and
timeout. Author each route's exact atomic amount.

Keep the full native route records: operation IDs, upstream choices, credential
references, safe examples, request/response policy, transports, streams,
concurrency, availability and cache controls where configured.

A HAR merchant selects the same route set as its approved source review.
Changing that set starts another immutable review. The native compiler accepts
1–64 selected routes in one merchant.

Use the route worksheet to inspect the complete source inventory, supporting up
to 2,000 operations. Search and filter by source text, method, inclusion, pricing
or changed rows. Bulk actions set exact prices, apply percentages with an
explicit atomic rounding choice, or select supported authored operations.
Only inclusion and atomic price change; other route settings remain attached.

Export the complete source-bound worksheet to retain work. Import requires the
same source, network and asset. The original three-way reconciliation keeps
changes made only in the current plan or only in the worksheet. When both changed
one field differently, select the current or worksheet value explicitly.

Review the complete candidate through the native compiler and save under a new
merchant package name. Reopen it to inspect the complete plan, original source
and compiled merchant. The
[native worksheet guide](../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/ROUTE_WORKSHEET.md)
defines exact arithmetic, original field preservation and reconciliation.
Atomic prices remain strings throughout the browser, agent and package.

## 5. Operate the same merchant through its agent

Set the actual incoming MCP bearer token in the host environment. Close an
existing product process, then open the same retained directory with its agent:

~~~sh
starforge captured-api open --dir /private/state/captured-api \
  --token-env MCP_ACCESS_TOKEN --mcp-port 3211
~~~

Use the returned authenticated MCP URL and workspace alias `merchant`. The same
startup also returns `operatorUrl`, ending in `/operator/`, and
`operatorConsoleDirectory`. Open that URL and use the host's original bearer or
OAuth authorization. The access token remains in its private host environment;
the URL contains no token.

The operator workspace belongs to the merchant MCP session. Closing the product
drains accepted requests, workflows and customer downloads before releasing the
original agent and browser. Reopening the same product directory restores its
profiles, recipes, runs and complete customer files.

| Agent sequence | Retained result |
| --- | --- |
| HAR status → library | Selected console and original source pages |
| Files → ingest/adopt → groups/review | Exact capture or complete native packet and observations |
| Decisions save → source | Immutable decisions and approved OpenAPI binding |
| Plan/preview → save → load | Complete merchant plan, compiler preview and saved package |
| Later ingest → changes/review → source | Native source editions, carried decisions and reviewed new source |
| OpenAPI routes → worksheet review/save | Source-bound inventory and complete priced merchant |
| Policy edition → review → package | Reusable operating terms, exact native compiled review and immutable package |
| Workflow recipe → installation → paused review → continuation | Reusable source maintenance with the same saved requests and native tool definitions |
| Completed export → Customers | Complete original package files and a downloadable package archive |
| Export/download → receiving adoption | Original source, review, merchant and portable worksheet files |
| Package stage → release operations | Native release IDs, source digests, generations and runtime |

### Standard host files

The setup declares the following handles. Place the selected private originals
in these paths; the native reader loads each file when it is selected.

| Alias | File inside `inputs/` | Use |
| --- | --- | --- |
| HAR `current` / `later` | `current.har` / `later.har` | First and later capture bytes |
| HAR `decisions` | `decisions.json` | Complete reviewed decision document |
| HAR/OpenAPI `terms` | `merchant-plan.json` | Full native merchant plan |
| OpenAPI `source` | `openapi.json` | Complete source document |
| OpenAPI `worksheet` | `worksheet.json` | Proposed source-bound worksheet |
| OpenAPI `base-worksheet` | `base-worksheet.json` | Retained base for reconciliation |
| OpenAPI `operations` | `operation-plans.json` | Authored records for new route selection |

Add other aliases or immutable expected hashes through the original connection
documents. On reopening, the native configuration readers validate those
definitions. The [HAR guide](../../stellar-forge/mcp-merchant-operator/HAR_WORKSPACE.md)
and [OpenAPI guide](../../stellar-forge/mcp-merchant-operator/OPENAPI_WORKSPACES.md)
provide exact tool names, source contracts, pagination and complete downloads.

### Save a complete priced edition

For an existing merchant, select its package name as `baseName`.
Read `merchant_openapi_routes`, retain the returned source/plan hashes, and stage
the intended actions. Use `merchant_openapi_route_sheet_review` to compile the
whole change. Save through `merchant_openapi_route_sheet_save` with that review's
`expectedReviewSha256` and a new package name.

The original command-line client is also available:

~~~sh
starforge captured-api worksheet inventory \
  --url "$MERCHANT_MCP_URL" --request-file /private/worksheet-inventory.json

starforge captured-api worksheet review \
  --url "$MERCHANT_MCP_URL" --request-file /private/worksheet-review.json

starforge captured-api worksheet save \
  --url "$MERCHANT_MCP_URL" --request-file /private/worksheet-save.json
~~~

Each request selects `workspace: "merchant"` and the actual original source or
saved package. The [worksheet client guide](../../stellar-forge/mcp-merchant-operator/OPENAPI_ROUTE_WORKSHEETS.md)
provides complete filters/actions, exact prices, request examples, review
identities and resumable file export.

The original HAR binding travels with the complete plan into native save.
A new price edition becomes another immutable package.

### Reuse operating policies

Open a merchant in the source browser and use **Reusable operation policies** to author
an immutable named edition. A policy can supply the shared route settings for
request/response handling, credential references, cache, concurrency,
availability, transport and stream behavior. Method, path, operation ID and
atomic price remain attached to the selected native route.

Choose the saved edition, select the source or base package and review the
complete application. Explicit route overrides remain part of that review.
Save the resulting merchant under a new package name. The package retains the
selected policy record and its identity alongside the complete native source,
plan and compiler output, so ordinary package export and handover carry it.

The same maintained agent and terminal operations are available from this entry:

~~~sh
starforge captured-api policies list \
  --url "$MERCHANT_MCP_URL" --request-file /private/policy-list.json

starforge captured-api policies review \
  --url "$MERCHANT_MCP_URL" --request-file /private/policy-review.json

starforge captured-api policies package \
  --url "$MERCHANT_MCP_URL" --request-file /private/policy-package.json
~~~

Use the original `workspace: "merchant"` and full request contracts in the
[operation policy guide](../../stellar-forge/mcp-merchant-operator/OPENAPI_OPERATION_POLICIES.md).
The package request retains the reviewed inputs and exact returned
`expectedReviewSha256`. Named policy editions can also be exported and received
as their complete original files.

### Maintain and receive through the operator workspace

Select **Workflows** in the returned operator workspace. A saved profile keeps
its original host binding, tool definitions, complete draft requests, immutable
workflow editions, recipe installations and run history. The OpenAPI maintenance
recipe carries the authored policy-review request through native review, a pause
for the operator, immutable package publication, package inspection and complete
export.

Create or select the intended profile, prepare the complete recipe for the
current host, and save its installation. Start a run from that installation and
inspect its paused native policy review. Continue using the exact run revision
and review SHA-256. After export finishes, choose **Prepare customer** on the
export step. **Customers** receives each declared package member and supplies the
complete package archive. The export manifest file's SHA-256 identifies this
transfer; the internal package manifest retains its own separate identity.

The same saved objects are available through the original terminal client:

~~~sh
starforge captured-api workflows host --url "$OPERATOR_URL"

starforge captured-api workflows prepare --url "$OPERATOR_URL" \
  --input /private/maintenance.json --output /private/maintenance-prepared.json

starforge captured-api workflows install --url "$OPERATOR_URL" \
  --input /private/maintenance-prepared.json

starforge captured-api workflows run-prepare --url "$OPERATOR_URL" \
  --input /private/maintenance-run-selection.json --output /private/maintenance-run.json

starforge captured-api workflows run --url "$OPERATOR_URL" \
  --input /private/maintenance-run.json --wait
~~~

`OPERATOR_URL` is the actual returned `operatorUrl`. The
[complete workflow guide](../../stellar-forge/mcp-merchant-operator/console/OPENAPI_WORKFLOWS.md)
provides the full preparation/run inputs, review continuation, complete customer
download, profile export/import and receiving recipe. A later maintenance edition
can reuse the original procedure with a new explicit package name and authored
inputs. A receiving recipe selects the destination's original declared delivery
handle and complete export manifest; it reopens the package and can stage an
explicit native release.

## 6. Run, release and deliver the merchant

Reopen the saved package. Its compiler output includes the merchant service,
selected backend bindings and native run instructions. Use the browser's
start/check/operations controls with the intended challenge-preview or
configured paid runtime mode. Supply the actual backend and payment credentials
through the host's original environment.

The maintained release command is forwarded unchanged:

~~~sh
starforge captured-api releases --help
~~~

Use the native package/release workflow to stage the selected package, inspect
its source digest and generation, review it, activate it and start its owned
runtime. Stop that runtime before selecting another release. Reopen the same
release store to recover an interrupted operation or use a previous release.

The original workspace supplies request examples, generated clients, customer
payment review and retained-result handoffs for the declared transport. Choose
the actual saved route and its native customer flow. Source observations,
configured offers, unpaid challenges, customer execution and settlement retain
their own actual native states.

The [merchant workspace guide](../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/README.md)
covers compilation, runtime, durable operations and customer flows.
The [package transfer guide](../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/workspace/PACKAGE_TRANSFER.md)
connects complete packages to receiving and release staging.

## 7. Continue after the source API changes

Retain the previous source selection and immutable review revision. In the
browser, select the later HAR and compare with that saved review. The native
refresh packet keeps the earlier capture/review, new capture, comparison,
migrated draft and subsequent reviews.

Unchanged decisions carry forward. Changed observations and ambiguous groups
remain reviewable. Temporarily absent authored operations retain their identity
through later editions. A returning dormant operation stays unselected until
the operator reviews and acknowledges it.

For the local command, save the exact native selection in a private file:

~~~json
{
  "kind": "capture",
  "id": "ACTUAL_RETAINED_CAPTURE_SHA256",
  "revision": "ACTUAL_SAVED_REVIEW_SHA256"
}
~~~

Use actual returned values. A previous refresh uses `kind: "refresh"` and that
original packet ID.

~~~sh
starforge captured-api capture \
  --dir /private/state/captured-api \
  --file /private/inputs/later.har \
  --previous /private/previous-selection.json \
  --label 'Supplier API next edition'
~~~

Repeating the same bytes and prior saved review continues the original source
edition. Review changed decisions, retain the intended complete merchant
settings, then compile and save a revised package. Use the native revision and
release workflows to compare, stage and switch the merchant.

The [capture refresh guide](../../stellar/scf-starforge-20261009/sf61-openapi-seller-import/har/REFRESH.md)
defines comparison, dormant-route carry, offline refresh and package operations.

## 8. Hand over the complete source and merchants

In the product-owned browser, choose **Merchant handover** from the original
workspace header. Create an outgoing collection from the complete saved
merchant/source inventory, save its draft edition, prepare and inspect its
native review, then publish and download the full `.sfhandover` file.

Open **Merchant handover** in the receiving product. Upload the complete file,
inspect its source and merchant histories, choose receiving names, save and
review that exact mapping, then receive and reopen the native merchants.
**Drafts**, **Operations**, **Files** and **Received** retain the original server
work across browser and product restarts. The browser keeps working forms by
draft and saved base, preserving them when navigating to another draft or viewing
history. The edition selector identifies retained working edits; reopen the
working form to continue it. Every accepted original request keeps its own
selected edition.

The complete [browser walkthrough](HANDOVER.md#complete-the-handover-in-the-browser)
covers source selection, package/environment review, resumable chunk upload,
original name conflicts, saved request continuation and native merchant reopen.
Normal Stop keeps the original native listener open until accepted handover
operations finish their source/package calls.


The product's complete handover joins original captured histories with their
saved merchant packages. Select actual members, copy and review the full native
collection, publish it, then review and receive it into another initialized
product.

~~~sh
starforge captured-api handover inventory --dir /private/state/captured-api

starforge captured-api handover prepare \
  --dir /private/state/captured-api \
  --selection /private/inputs/merchant-handover.json \
  --out /private/handovers/merchant-edition-1

starforge captured-api handover publish \
  --out /private/handovers/merchant-edition-1 \
  --review-sha256 ACTUAL_PREPARED_REVIEW_SHA256
~~~

The selection contains original package names/manifest hashes and optional
capture or refresh selections. A captured merchant automatically includes its
original source and saved review. A refresh retains both complete source
editions, their histories, comparison, draft and native reviewer. Every selected
package includes the original OpenAPI, complete plan and atomic prices,
source revision, generated files, compiled merchant and native export manifest.

Move the complete published directory to the receiving host and use its actual
manifest hash:

~~~sh
starforge captured-api handover receive-review \
  --dir /private/state/receiving-merchant \
  --bundle /private/delivery/merchant-edition-1 \
  --manifest-sha256 ACTUAL_PUBLISHED_MANIFEST_SHA256

starforge captured-api handover receive \
  --dir /private/state/receiving-merchant \
  --bundle /private/delivery/merchant-edition-1 \
  --manifest-sha256 ACTUAL_PUBLISHED_MANIFEST_SHA256 \
  --review-sha256 ACTUAL_RECEIVING_REVIEW_SHA256
~~~

Initialize and open the receiving product before its native adoption/package
writes. The receiving review lists existing source matches and package names;
an optional private name map lets the operator choose another receiving name.
The same native source adoption merges missing immutable reviews and retains
receiving-only decisions. Native package receiving preserves original UUIDs,
source, complete plans, prices and compiled bytes.

Repeat the same preparation or receiving command after an interruption. Use
`handover status --dir PRODUCT --operation ORIGINAL_OPERATION_ID` to reopen the
retained receiving result after restart or after the delivered bundle moves.
Open the received source and saved package in the original browser, then use its
native worksheet, merchant and release controls to continue operation.

[HANDOVER.md](HANDOVER.md) supplies the complete selection schemas, target-name
review, file collection, publication/receiving commands, restart and release
walkthrough. It also exposes the same complete workflow as a source module.

For an individual existing source directory, the original command remains
available:

~~~sh
starforge captured-api adopt \
  --dir /private/state/receiving-merchant \
  --kind refresh --from /private/delivery/complete-refresh \
  --label 'Received supplier source'
~~~

Keep the complete base and proposed worksheet JSON when moving unfinished
pricing work. Native file hashes and source/asset binding govern its import and
reconciliation.

## 9. Recover and upgrade

~~~sh
starforge captured-api inspect --dir /private/state/captured-api
~~~

Inspection reads the retained configuration and last session, then checks the
selected native console. Its current reachable state/source count appears
alongside the saved process session.

| Interruption or change | Continue from |
| --- | --- |
| Setup stops | Repeat `init --dir` for the retained original setup |
| Browser or agent closes | Reopen the same product and original source/package/release state |
| Stop reports a close failure | Keep the same original process and retry Stop; its native owners and product lease remain retained until the drain finishes |
| Capture reply is lost | Exact original bytes and prior saved selection |
| Decision save reply is lost | The original source's immutable review list |
| Merchant save reply is lost | Intended package name, original source and complete plan |
| Managed browser restarts | Its original private URL record on the next operation |
| Applications launch configuration changes | Fresh review of the same saved product before its next start |
| Applications start reply is lost | The saved original application and managed operation, including its retained private startup record |
| Worksheet transfer stops | Same source/plan, worksheet identity and native downloader |
| Policy save or package reply is lost | Same immutable policy or package name and complete reviewed original request |
| Recipe installation or workflow run reply is lost | Same saved preparation/run request and original installation or run ID |
| Workflow stops at native review | Same paused run revision and the displayed original policy review SHA-256 |
| Customer transfer stops | Same profile, export ID and export manifest SHA-256; reopen the original download |
| Operator host restarts | Returned operator URL and the retained profile/run/customer state under `operator-console/` |
| Complete handover is interrupted | Same selection/output or receiving review/operation ID; completed native members reopen |
| Browser handover draft or reply is interrupted | Original saved draft edition and retained request under Merchant handover |
| Whole handover file transfer stops | Same original download or saved file upload; resume the retained byte range/chunk |
| Handover browser uses a new port after restart | Open the original server-side Drafts, Operations, Files or Received entry |
| Receiving adoption repeats | Same source manifest and immutable reviews |
| Runtime installation stops | Original installer directory, archive and lock |
| Source contract changes | Previous review, new capture edition and native revision/release flow |

The product records `DRAINING` while stopping. A failed native close records
`CLOSE_FAILED`, retains the original owner instances and keeps the product lease.
Repeat Stop or call that same returned `close()` handle to continue. Repeated
signals join the current attempt. `CLOSED` is recorded after both owned native
sessions finish; a rejected opening records `FAILED` after its cleanup finishes.
An embedded opening failure that still needs cleanup exposes that same
`error.close()` handle together with the original startup and cleanup errors.

Keep state and connection files outside the checkout. Close through the normal
drain before moving the full operating directories.

For an upgrade, choose a new source archive in a fresh runtime directory,
complete installation, and run that product entry against the same retained
product directory. Connections remain at their original absolute paths.

For another host or path, initialize a new private product and use the complete
native source and merchant receiving workflows. Declare that host's own paths
and credential references. Keep the prior runtime, source history and original
delivery until the received merchant is operating.

## 10. Operate complete handovers through the agent or terminal

The existing merchant HAR workspace aliases also expose the captured handover
companion. Select the original product ID, page its complete inventory, save
an outgoing draft and native review, then publish the exact reviewed collection.
Transfer the entire file directly into a declared receiving product, import it,
review its saved package names and receive through the original native writers.

`starforge captured-api handover remote` offers the same typed calls, original
job wait, whole-file transfer and local download/upload from an ordinary terminal.
Original request IDs, byte hashes, source revisions and receiving records carry
through restart. The [agent and terminal guide](AGENT.md) includes the full
selection/review/transfer/receive/reopen sequence and typed client API.
