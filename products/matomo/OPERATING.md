# Matomo reports, merchant operation and editable receiving

This selected product carries an operator's Matomo reports from an explicit native source through complete report and subtable capture, typed edition review, original SQLite publication, merchant operation and receiving. The browser, saved Applications launcher, typed MCP adapter and CLI use the same original Matomo workspace. A customer can receive a published source-file delivery; a successor operator can receive a complete editable workspace with its original source and history.

Select the existing Matomo deployment, authorized report scope, original source configuration and receiving destination before an operation. The installed source contains the product and its native dependencies. Private reports, accounts, credentials and earlier development workspaces are separate inputs.

## Install the Matomo selection

Use the maintained Linux runtime with Node.js 24, Git, util-linux `flock` and an existing Python 3 interpreter. The native Node runtime supplies SQLite and the source-aware JSON functions used for exact report values. Python receiving uses the original standard-library implementations. The workspace filesystem must support the original locks, atomic rename and fsync.

Build the selected product from the complete reviewed source commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace --ref ORIGINAL_40_CHARACTER_COMMIT \
  --selection matomo --out /absolute/releases/matomo
~~~

Use the actual archive path and SHA-256 returned by that builder. The recipe selects the complete `matomo` contribution, its full source tree and public assets, the original SQLite workbench/publisher, SF82 release tools, SF100 dataset delivery, SF88 Buyer/Python receiver and the maintained Apps/MCP/native support closure. It explicitly retains `source_file_delivery.py` and `source_bundle_archive.py`; Python modules and runtime-read files are included alongside the JavaScript imports.

Prepare and install through the existing runtime:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /srv/starforge/runtimes/matomo \
  --archive /absolute/releases/matomo/ACTUAL_ARCHIVE.tgz \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /srv/starforge/runtimes/matomo

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /srv/starforge/runtimes/matomo --load --source

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /srv/starforge/runtimes/matomo -- registrations --source matomo
~~~

Keep subsequent commands attached to that installed runtime:

~~~sh
starforge() {
  node /absolute/merchant-workspace/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs \
    run --dir /srv/starforge/runtimes/matomo -- "$@"
}
~~~

The selected registrations include `matomo-source`, `matomo-workspace`, `matomo-customer`, `matomo-remote` and `matomo-product`, plus the original runtime, seller, Buyer, release and merchant-provider commands. The contribution owns the Matomo registrations; the common dispatcher and provider registries remain the original implementations.

An interrupted build continues in its retained output:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace --out /absolute/releases/matomo --resume

node stellar/scf-starforge-20261009/distribution/build.mjs \
  --out /absolute/releases/matomo --status
~~~

Choose a separate intended output for a different source commit or source selection. Preserve the returned source manifest, archive digest and installation identity. The original [installation guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) and [source-selection contract](../../stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md) define installation recovery and existing-runtime adoption.

## Choose the native source mode

The two native Matomo interfaces have distinct source and authentication contracts.

| Deployment | Source mode and endpoint | Credential reference |
| --- | --- | --- |
| Standalone Matomo or Matomo Cloud | `reporting-api`; the selected Reporting API `index.php` | Optional `authorization.tokenEnv`, submitted in the original POST form body |
| Matomo for WordPress | `wordpress`; the existing `wp-json/matomo/v1` route | Optional `authorization.headerEnv`, containing the complete existing WordPress Authorization value |
| An intentionally anonymous native source | The appropriate mode and actual endpoint | Empty `authorization: {}` |

Matomo for WordPress uses its native WordPress report-metadata and processed-report routes. It does not use a standalone Reporting HTTP API endpoint, standalone `token_auth` or a caller-selected site ID. Its site identity follows the WordPress plugin.

For an existing standalone or Cloud deployment, retain a private source file such as:

~~~json
{
  "schema": "stellar-forge.matomo-source.v1",
  "mode": "reporting-api",
  "label": "Selected analytics deployment",
  "endpoint": "https://analytics.example/index.php",
  "siteId": "1",
  "authorization": {"tokenEnv": "MATOMO_REPORT_TOKEN"},
  "timeoutMs": 30000,
  "maxResponseBytes": 1048576,
  "minIntervalMs": 750
}
~~~

Replace the illustrative endpoint and site ID with the actual selection. Provision the existing credential in the named host environment variable; the source document retains the reference.

For an existing WordPress plugin deployment:

~~~json
{
  "schema": "stellar-forge.matomo-source.v1",
  "mode": "wordpress",
  "label": "Selected WordPress analytics",
  "endpoint": "https://www.example/wp-json/matomo/v1",
  "authorization": {"headerEnv": "MATOMO_WORDPRESS_AUTHORIZATION"},
  "timeoutMs": 30000,
  "maxResponseBytes": 1048576,
  "minIntervalMs": 750
}
~~~

A site using plain permalinks can select its actual endpoint in the native form `https://www.example/?rest_route=/matomo/v1`. When the existing host requires its environment proxy, the source can explicitly select `transport: {"mode":"environment-proxy","proxyEnv":"HTTPS_PROXY"}`. Use the maintained source transport and selected native origin.

Source configuration is part of the workspace identity. A new deployment, site or source configuration belongs to a deliberate new workspace selection. A later report edition from the same configured source has a distinct retained capture and scope.

## Create or open the original workspace

Create the original workspace once from that source file:

~~~sh
starforge matomo-source state \
  --workspace /srv/starforge/projects/matomo \
  --create --source /private/matomo/source.json \
  --python /absolute/existing-python/bin/python
~~~

Then open it:

~~~sh
starforge matomo-source serve \
  --workspace /srv/starforge/projects/matomo \
  --python /absolute/existing-python/bin/python --port 0
~~~

Open the printed local URL. The server owns the original workspace and child merchant/publisher lifetimes. Stop that owner cleanly before opening the same private workspace with another direct CLI or before exporting its editable archive. An MCP-owned workspace and its returned browser URL use that same owner.

The workspace retains its source configuration and identity, initialization marker, SQLite journal, complete source requests and responses, report captures, editions, comparisons, reviews, merchant drafts, publication records and receiving results. Inspect an existing workspace without `--create` or a replacement source file:

~~~sh
starforge matomo-product state --workspace /srv/starforge/projects/matomo
~~~

For a saved desktop operation, use the installed **Applications** entry **Matomo reports and delivery** (`matomo-authoring`). Select the existing private workspace, existing Python interpreter and any declared private environment file in the original application form. Review, save and start it through the maintained Runtime workspace.

The Applications preparer binds the actual workspace identity, source files and database identity. Startup verifies the original authenticated listener at `/api/identity`. Direct `matomo-workspace` launch flags contain those prepared identities; use the original preparer to obtain them. Stopping the saved application drains its original work and closes owned releases, publishers, provider and database before its lease is released.

## Select and acquire a complete report

The browser connects the following original work:

| Area | Operation |
| --- | --- |
| Source/catalog | Discover the selected native report definitions, parameters, segment metadata and source context |
| Capture | Select an exact report variant, literal time scope and child-table traversal |
| Edition | Preserve complete typed rows, original source bytes, hierarchy and immutable SQLite data |
| Comparison/review | Compare selected editions and retain a named decision about the actual findings |
| Merchant/release | Edit and preview native queries and terms, export a package and operate an explicitly selected release |
| Publication/receiving | Review and publish the native dataset, create its source handover and reopen a customer |
| Editable workspace | Export a closed original workspace, receive it privately and continue selected source work with retained origin history |

Choose the exact returned report identity and declared parameter values. A report name alone does not select variants such as a particular search engine's keyword subtable. Use the source's selected site timezone, language and segment. The original processed-report response, metadata, totals and child-table identifiers remain retained.

The capture scope is one fixed literal day, week, month, year anchor or explicit range. Relative scopes such as `lastN`, changing `today` and multiple-period result maps do not identify this product's immutable capture. Select the actual date after reviewing the source context.

The operator discovers the report catalog once for the intended catalog operation. Capture uses that retained catalog and its declared native subtable action. It follows the selected page and child-table chain while preserving each request, response, source identity and error. The complete saved metadata determines column meaning and parameter binding.

Review coverage before accepting an edition:

- The selected root report and declared child references must be accounted for, including a genuinely empty child table.
- A processed report is an analytics archive for that report and scope. A complete page chain does not establish a point-in-time raw-event snapshot.
- Native summary rows, archive truncation, unsupported child reports and stopped limits remain visible. A report total is a metric, not a substitute for the actual row count.
- The native scope and observed source/context are retained separately from acquisition time. Do not expand the reported period or child coverage beyond the returned source.

Current native defaults bound a capture to 250,000 rows, 5,000 requests, 128 MiB and depth 32. The existing contract permits reviewed limits up to 1,000,000 rows, 10,000 requests, 512 MiB and depth 128; each native response remains limited to 1 MiB. Page size is 1–1,000. Select these through the original source/capture contract; a limit reached is a retained coverage outcome.

The source API operations use a stable `operationId` and the workspace's observed integer `expectedRevision`. Keep the exact JSON request with that identity:

~~~sh
starforge matomo-source discover \
  --workspace /srv/starforge/projects/matomo --input /private/matomo/catalog-request.json
~~~

A catalog request's `scope` contains the chosen `period`, literal `date`, `language` and `segment`. A new source call is an explicit operator action. Existing source inspection uses `state`, `catalog --id ID` and `capture-state --id ID`.

## Review typed editions and revisions

Prepare an edition from the completed retained capture. The original edition builder binds the capture digest, full response inventory, report identity, source scope, native row hierarchy and every row's original source location. It creates an immutable native SQLite edition and retains the complete report JSON.

Missing fields, JSON null, strings, booleans and numeric values stay distinct. Original numeric spellings survive the native JSON path; identifiers and ordered key/reference values are not converted into floating-point guesses. A changed hierarchy or parameter identity remains part of comparison, alongside added, removed and changed rows.

Compare the exact two selected editions. Inspect the complete findings and coverage before recording the named edition/comparison review. A new corrected source report is a new capture/edition; it does not replace the prior source. Completed findings can be downloaded in full through the original artifact route.

CLI operation groups use the same original journal:

| Work | Native commands |
| --- | --- |
| Source | `discover`, `resume-catalog`, `capture`, `resume-capture` |
| Edition | `edition`, `resume-edition`, `review-edition` |
| Comparison | `compare`, `resume-comparison`, `review-comparison` |
| Merchant | `configure-merchant`, `resume-merchant`, `save-merchant`, `preview`, `export-package`, `recover-package` |
| Release | `stage-release`, `select-release`, `start-release`, `stop-release`, `open-release-console` |
| Dataset | `prepare-delivery`, `recover-delivery`, `review-delivery`, `publish-delivery` |
| Customer | `prepare-handover`, `resume-handover`, `receive-handover`, `resume-receiving`, `reopen-receiving` |

Invoke those through `starforge matomo-source COMMAND --workspace ABS --input EXACT_REQUEST.json`. The original source [README](../../stellar/scf-starforge-20261009/sf30-seller-sdk/matomo/README.md), CLI and typed MCP catalog define every request field.

## Configure, preview and operate the original merchant

Select a reviewed immutable edition and edit the original SQLite merchant draft. The native draft is compiled before configuration is retained. It carries the actual SQL, parameters, response columns, public example input, payment network, asset, recipient, amount, timeout and public resource metadata.

The service name is 1–32 printable ASCII characters. The original descriptor requires canonical public HTTPS. An explicit internal `.example` descriptor labels an internal evaluation; inspect the actual local runtime URL separately. It does not establish a deployed public endpoint.

The original generated queries are:

| Query | Default path | Native result |
| --- | --- | --- |
| `reportRows` | `/matomo/rows` | Stable row-ID order, source identity, hierarchy, original typed JSON and selected fields |
| `reportRow` | `/matomo/row` | The row selected by one immutable 64-hex row ID |
| `sourceFiles` | `/matomo/source-files` | Complete retained originals in the common SourceFiles chunk protocol |

Use the existing reviewed merchant/payment terms. Public examples retain explicit input values and empty example response rows; private report data stays in the original workspace and its intended delivery.

Save a correction with the same original workbench revision, then run the native query preview. Export or recover the original package using its retained action and package identity. SF82 owns release staging, comparisons, selected-generation checks, runtime start/observation, stop and rollback. Read the actual release state before changing the selected generation.

A direct `start-release` or `open-release-console` command remains in the foreground until SIGINT/SIGTERM. It must have a live owner for the runtime it reports. Actual HTTP, payment and receiving outcomes retain their native state; source hashes or a local preview do not establish a paid transaction.

## Publish and receive a complete source-file delivery

The original SQLite publisher extracts a stable ordered candidate from the selected edition. Choose either `report-rows` for an analytic row delivery or `source-files` for the complete reconstructable originals. The latter is required by the Matomo source-file customer handover.

Inspect the actual extraction, expected population and target selection. Review initialization of a new target or the existing target's exact snapshot and integer revision, then publish using that native review identity. Initial-target requests omit an existing target revision instead of inventing one.

The complete source-file projection retains:

~~~text
capture_id, edition_id, report_capture_id, path, file_sha256,
file_bytes, chunk_index, chunk_count, chunk_sha256, content_base64
~~~

Original chunks are 49,152 bytes. The receiver checks integer chunk geometry, each chunk digest, full file digest, original edition/report binding and ordered population. The source manifest enumerates the reconstructed originals and identifies its own separate manifest bytes.

The operator's local handover calls the original dataset producer and SF100 append/finalize/scan on the reviewed publication. It retains every native page plus the corresponding operator request, response and receipt. Its actual payment status remains `NOT_INFERRED_FROM_SOURCE_HTTP_OR_LOCAL_HASHES`. Existing acquired SF88 deliveries use the same original DatasetDelivery/SourceFiles receiver with their actual source status preserved.

Receive a completed handover through the installed customer command:

~~~sh
starforge matomo-customer receive \
  --archive /private/deliveries/matomo-handover.zip \
  --out /private/customers/matomo \
  --python /absolute/existing-python/bin/python

starforge matomo-customer reopen \
  --out /private/customers/matomo \
  --python /absolute/existing-python/bin/python

starforge matomo-customer rows \
  --out /private/customers/matomo \
  --python /absolute/existing-python/bin/python \
  > /private/customers/matomo-rows.jsonl
~~~

These commands provide the original installed SDK and Buyer Python imports and native Node verifier. Receiving verifies the archive, finalized SF100 page chain, operator evidence and complete original files before publishing the customer directory. Reopen verifies the same retained delivery. Row output preserves native values. A missing local page receipt can be reconciled from the exact retained response; it does not require rereading the producer.

## Use the original agent host and remote customer

Create a private host connection for a workspace the operator selects:

~~~json
{
  "schema": "stellar-forge.matomo-workspace-connection.v1",
  "workspaces": {
    "analytics": {
      "label": "Retained Matomo reports",
      "directory": "/srv/starforge/projects/matomo",
      "python": "/absolute/existing-python/bin/python",
      "environmentFile": "/private/matomo/environment.json",
      "allowLoopbackSource": false
    }
  }
}
~~~

Only `directory` is required for an existing workspace. An environment file is a private host file containing the intended environment names and values. The remote caller selects the configured `analytics` alias; it cannot supply an arbitrary host workspace path.

Inspect the installed native provider:

~~~sh
starforge merchant-providers inspect matomo-workspaces
~~~

For the original host initializer, retain the setup file:

~~~json
{
  "directory": "/private/matomo-agent",
  "connection": "/private/matomo/connection.json",
  "workspace": "analytics",
  "name": "Retained Matomo operations"
}
~~~

~~~sh
starforge merchant-providers init matomo-workspaces \
  --options /private/matomo/agent-setup.json
~~~

Use the returned original `merchant-mcp.json` with the maintained merchant host. Initialization binds the selected source workspace's original merchant/release store. A matching saved configuration reopens; a conflicting selection is not overwritten. The Matomo leaf supplies its descriptor and reader to the original provider registry.

The native adapter exposes the existing Matomo tool catalog. Inspect the installed metadata before invoking an effect:

~~~sh
starforge matomo-remote tools
starforge matomo-remote tools merchant_matomo_open
~~~

The original catalog covers source, edition, review, merchant, release, publication and receiving operations. Mutations retain the workspace alias, actual `workspaceInstanceId`, stable `operationId` and integer `expectedRevision`. The normal open response supplies the current instance; obtain it from that host.

Use a host-issued access token in the existing `MCP_ACCESS_TOKEN` environment variable, or select an already provisioned alternative with `--token-env`. The remote endpoint is the intended HTTPS MCP endpoint or an explicitly local supported loopback endpoint. The token stays out of command arguments and retained operation files.

For example, retain `{"workspace":"analytics"}` in `open.json`:

~~~sh
starforge matomo-remote call merchant_matomo_open \
  --url "$MATOMO_MCP_URL" --arguments /private/matomo/open.json

starforge matomo-remote call merchant_matomo_edition_review \
  --url "$MATOMO_MCP_URL" \
  --arguments /private/matomo/reviewed-edition.json \
  --operation-dir /private/matomo/remote-review

starforge matomo-remote reconcile \
  --url "$MATOMO_MCP_URL" --operation-dir /private/matomo/remote-review
~~~

The remote mutation records its exact request before dispatch. If no response is available, reconciliation inspects the original native operation instead of resending it. A changed request belongs to a new deliberate operation.

For a retained source-file handover, inspect the native artifact and retain the resulting client selection:

~~~sh
starforge matomo-remote inspect-artifact \
  --url "$MATOMO_MCP_URL" --workspace analytics \
  --artifact handover --id "$HANDOVER_ID" --kind archive \
  --out /private/matomo/handover-selection.json

starforge matomo-remote download \
  --url "$MATOMO_MCP_URL" \
  --selection /private/matomo/handover-selection.json \
  --out /private/matomo/handover-transfer

starforge matomo-remote reopen \
  --directory /private/matomo/handover-transfer

starforge matomo-remote receive \
  --directory /private/matomo/handover-transfer \
  --out /private/customers/matomo-remote \
  --python /absolute/existing-python/bin/python

starforge matomo-remote reopen-customer \
  --out /private/customers/matomo-remote \
  --python /absolute/existing-python/bin/python
~~~

The downloaded selection is an explicit client transfer selection, not a provider or payment receipt. It binds the exact native filename, artifact identity, size and digest. The maintained retained-download implementation resumes verified prefixes, retains native read IDs and verifies the complete file. Local customer receiving then uses the original Python implementation. It requires no remote endpoint after the full download.

See the complete [remote client guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/matomo/CLIENT.md) and [native Apps/MCP guide](../../stellar-forge/mcp-merchant-operator/MATOMO_WORKSPACES.md) for the exact tool schemas, host configuration, stream lifecycle and installed entrypoints.

## Export and receive a complete editable workspace

Choose the intended delivery according to the recipient's work:

| Recipient needs | Original command | Receiving state |
| --- | --- | --- |
| Published report/source files with native dataset and operator evidence | `matomo-customer receive`, or `matomo-remote receive` after download | The verified customer delivery and reconstructed originals |
| An editable source/report workspace with all original history | `matomo-product export` and `matomo-product receive` | A new private authoring workspace, original source records and retained origin history |

The editable archive preserves the complete original closed workspace. Stop its original application/MCP owner and all owned merchant, release and child publisher runtimes first. Export uses the original workspace and child leases to prevent a concurrent writer. An export is a local source operation; it does not acquire another report or operate a merchant.

~~~sh
starforge matomo-product export \
  --workspace /srv/starforge/projects/matomo \
  --archive /private/deliveries/matomo-workspace.zip \
  --operation-id matomo-workspace-handover \
  --python /absolute/existing-python/bin/python

starforge matomo-product inspect \
  --archive /private/deliveries/matomo-workspace.zip \
  --python /absolute/existing-python/bin/python
~~~

Retain the returned archive SHA-256, byte count, source identity, original workspace identity and complete inventory. This product uses the maintained `source_bundle_archive.py` implementation with an explicit Matomo policy: at most 8 GiB per file, 16 GiB expanded including the manifest, and 20,000 members. An archive beyond the selected complete policy is rejected with its original source left intact.

Inspect the returned `receivingBudget` before receiving. It counts the original ZIP, extracted original files and independent editable source copies as a minimum next-export footprint. Receiving rejects before creating a directory when that minimum already exceeds 16 GiB expanded or 20,000 members, or when the retained ZIP itself exceeds the 8 GiB per-file export limit. New workspace metadata and subsequent edits also consume the reported remaining budget. Final export measures the full actual workspace again.

Receive into a new private container:

~~~sh
starforge matomo-product receive \
  --archive /private/deliveries/matomo-workspace.zip \
  --directory /private/receiving/matomo-operator \
  --operation-id matomo-workspace-receive \
  --python /absolute/existing-python/bin/python
~~~

The returned `directory` is the container's `workspace` directory. Keep that exact returned path. The result includes the new `workspaceId`, `originalWorkspaceId`, `archive.sha256`, `archive.bytes`, `sourceSha256`, `sourceCounts`, retained/current revisions and `reused` status.

Receiving verifies and preserves the entire supplied archive and original workspace files under the received workspace's `received/<archiveSHA>/` custody. It copies the original source catalogs, captures, immutable edition rows, comparisons and reviews into a new native store. The original actions and commercial, merchant/package, delivery, handover and receiving history remain available as origin records. The new workspace identity distinguishes subsequent local work from the original operator's operations.

Inspect and open the returned workspace:

~~~sh
starforge matomo-product state \
  --workspace /private/receiving/matomo-operator/workspace

starforge matomo-product origin \
  --workspace /private/receiving/matomo-operator/workspace \
  --table actions --offset 0 --limit 50

starforge matomo-product serve \
  --workspace /private/receiving/matomo-operator/workspace --port 0
~~~

Origin inspection supports `history`, `actions`, `merchants`, `merchant_packages`, `deliveries`, `handovers`, `receivings`, `catalogs`, `captures`, `editions`, `comparisons`, `edition_reviews` and `comparison_reviews`. Paginate the complete original history when reviewing it.

The receiving browser can explicitly adopt a retained original merchant draft through the original native compiler into a new local merchant record. It preserves the old draft and its configured terms as origin material. Review the actual receiving-side source, descriptor and terms before creating the new record; package export, release selection and native execution follow their normal original actions. The receiver does not reactivate an old payment, running release or native action identity.

Provision the selected existing source credential references on the receiving host only when the recipient intends a new source action. Opening retained data and inspecting origin history use the existing received material. A retained loopback source configuration requires the explicit `--allow-loopback` selection on the permitted local operation.

To hand the edited workspace to a later operator, close its current owners and export it with a new intended export operation ID. Keep the received original archive and source history intact. Use the returned new archive identity for the next receiving selection.

## Interruption and completion

Keep the intended action ID, input file, returned native IDs, source hashes and actual state with each operation. The local source CLI accepts one exact JSON request from `--input FILE` or `--input -`.

~~~sh
starforge matomo-source action \
  --workspace /srv/starforge/projects/matomo --id ORIGINAL_OPERATION_ID

starforge matomo-source capture-state \
  --workspace /srv/starforge/projects/matomo --id ORIGINAL_CAPTURE_ID

starforge matomo-source receiving-state \
  --workspace /srv/starforge/projects/matomo --id ORIGINAL_RECEIVING_ID
~~~

| Observed state | Original continuation |
| --- | --- |
| Source response retained; local completion missing | Resume the same catalog/capture and reconcile accepted bytes before another source request |
| Immutable edition or comparison interrupted | Inspect and resume its original record with the same selected source |
| Native package export failed | Recover the original package action and its native workbench draft |
| Publication or handover interrupted | Reopen the original publisher/dataset/action; preserve accepted native pages and operator evidence |
| Remote mutation has no response | Reconcile the retained remote command against its original host operation |
| Customer directory already received | Reopen and verify its complete archive, source and native pages |
| Editable export/receiving interrupted | Continue the exact archive, destination and product operation ID; inspect returned reused state and original bindings |
| Close fails | Keep the same owner and lease; retry that instance's incomplete cleanup before another owner opens the workspace |

Close stops admission of new work, drains accepted work and closes the original owned resources. A failed close remains retryable on that instance. A process or tool-control disconnect alone does not establish that its native worker or lease is gone.

A complete customer result identifies the original edition, native dataset/source delivery, all retained source files and actual payment status. A complete editable handover additionally identifies both workspace identities, full archive/source counts, original history and the recipient's current revision. Keep these actual outcomes distinct from source publication, a prepared configuration or a successful syntax check.

## Existing retained source operation

The earlier private internal Matomo operation used the official public demo's 11 October 2026 Referrers search-engine report and declared keyword subtables. It retained 89 rows across 14 tables and 15 accepted responses, including an empty child; the typed edition contains 22 observed native fields. Original publication produced 57 source chunks carrying the complete selected originals, followed by eight genuine SF100 pages and Python customer receiving/reopen.

Those earlier private report and operation files are not bundled into this public source selection. They can be selected by their existing owner for receiving through the same product. This guide does not claim a new source acquisition, editable archive execution, merchant payment or customer deployment. Use the actual selected workspace's records for the current operating outcome.

## Original source and interfaces

| Interface | Maintained source |
| --- | --- |
| Selection and runtime installation | [distribution](../../stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md) |
| Native reports, model, browser and local operations | [Matomo README](../../stellar/scf-starforge-20261009/sf30-seller-sdk/matomo/README.md) |
| Remote typed customer and retained download | [CLIENT.md](../../stellar/scf-starforge-20261009/sf30-seller-sdk/matomo/CLIENT.md) |
| Saved Applications and MCP provider | [MATOMO_WORKSPACES.md](../../stellar-forge/mcp-merchant-operator/MATOMO_WORKSPACES.md) |
| Complete editable workspace commands | [product-cli.mjs](../../stellar/scf-starforge-20261009/sf30-seller-sdk/matomo/product-cli.mjs) |
| Original native report authority | [Matomo Reporting API](https://developer.matomo.org/api-reference/reporting-api) |
| WordPress source authority | [Matomo for WordPress REST API](https://developer.matomo.org/api-reference/wordpress/restapi-reference) |

The complete source selection remains tied to the original standalone repository and its selected Git commit. Source, runtime, provider context, immutable edition, receiving archive and subsequent local workspace each retain their own identity.
