# Operate a captured API merchant

The captured API product connects the original HAR source workbench, SF61
merchant browser, HAR/OpenAPI merchant agent, route pricing worksheet and SF82
release lifecycle. Source decisions, merchant plans and saved packages use
those native implementations.

## 1. Install the selected product source

Use Linux, Node.js 22.16 or later, npm and util-linux flock. Keep product state on
a filesystem supporting atomic rename, hard links, file locks and fsync.

The standalone product uses the maintained source builder:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . --ref HEAD --out /private/packages/merchant
~~~

Keep the returned archive and its actual SHA-256 together. The source-only
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
| `product.setup.json` / `product.json` | Retained setup and completed source connections |
| `session.json` | Latest product session and original browser/MCP addresses |

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

Use the returned authenticated MCP URL and workspace alias `merchant`.

| Agent sequence | Retained result |
| --- | --- |
| HAR status → library | Selected console and original source pages |
| Files → ingest/adopt → groups/review | Exact capture or complete native packet and observations |
| Decisions save → source | Immutable decisions and approved OpenAPI binding |
| Plan/preview → save → load | Complete merchant plan, compiler preview and saved package |
| Later ingest → changes/review → source | Native source editions, carried decisions and reviewed new source |
| OpenAPI routes → worksheet review/save | Source-bound inventory and complete priced merchant |
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

## 8. Receive the complete source and merchant

A source handover is the complete native capture or refresh directory: original
bytes, inventory, manifest and immutable reviews. The original source copy
verifies these files.

The standard HAR destination `handover` selects `receiving/source-handover`.
Import aliases `capture` and `refresh` select `receiving/capture` and
`receiving/refresh`. Use the complete native source intended for that operation.

Initialize and open the receiving product, then adopt the original directory:

~~~sh
starforge captured-api adopt \
  --dir /private/state/receiving-merchant \
  --kind refresh --from /private/delivery/complete-refresh \
  --label 'Received supplier source'
~~~

Native adoption validates the original manifests and merges missing immutable
reviews for an equal source. Existing receiving-only reviews remain available.

The complete merchant transfer also includes original OpenAPI, full plan,
generated merchant, compiled files and manifest. The OpenAPI `handover` alias
selects `receiving/merchant-package`. Receive that full directory through the
original package workflow, inspect its manifest and reopen the saved package.

Keep the complete base and proposed worksheet JSON when moving unfinished
pricing work. The native file hashes and source/asset binding continue to govern
import and reconciliation.

The exported OpenAPI document is useful for authoring. The complete native
capture or refresh directory preserves captured-source history and decision
continuation for the receiving operator.

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
| Capture reply is lost | Exact original bytes and prior saved selection |
| Decision save reply is lost | The original source's immutable review list |
| Merchant save reply is lost | Intended package name, original source and complete plan |
| Managed browser restarts | Its original private URL record on the next operation |
| Worksheet transfer stops | Same source/plan, worksheet identity and native downloader |
| Receiving adoption repeats | Same source manifest and immutable reviews |
| Runtime installation stops | Original installer directory, archive and lock |
| Source contract changes | Previous review, new capture edition and native revision/release flow |

Keep state and connection files outside the checkout. Close through the normal
drain before moving the full operating directories.

For an upgrade, choose a new source archive in a fresh runtime directory,
complete installation, and run that product entry against the same retained
product directory. Connections remain at their original absolute paths.

For another host or path, initialize a new private product and use the complete
native source and merchant receiving workflows. Declare that host's own paths
and credential references. Keep the prior runtime, source history and original
delivery until the received merchant is operating.
