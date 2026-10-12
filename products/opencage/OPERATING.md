# OpenCage geocoding and customer delivery

The OpenCage product connects a retained source query or CSV to reviewed candidate
choices, complete customer files, a merchant release and its original host and
Buyer interfaces. Browser, CLI and merchant MCP actions use the same saved
workspace. The named `opencage` source selection packages those original
implementations with their runtime assets and operating guides.

Use [the receiving guide](RECEIVING.md) to hand over an installed edition and
continue the original receiving records. [SOURCE_ADOPTION.json](SOURCE_ADOPTION.json)
records every released source file adopted by this integration and the unchanged
Applications and merchant-provider registrations.

## Install the selected product

Build from the full commit that contains this recipe:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout --ref ORIGINAL_FULL_COMMIT \
  --selection opencage --out /absolute/opencage-release
~~~

The original builder returns its archive and SHA-256. The manifest records the
source commit, recipe, selected contributions and complete file identities.
An interrupted build continues with the same output and `--resume`; a different
source or selection uses a new output directory. See the original
[source selection workflow](../../stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md).

Prepare and install that archive through the maintained runtime installer:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/opencage-runtime --archive /absolute/opencage-release/ORIGINAL.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 --native \
  --feature schema --feature openapi --feature mcp --operator
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/opencage-runtime
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/opencage-runtime --load --source
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/opencage-runtime -- registrations --source opencage
~~~

Use the original installer to receive an existing compatible dependency tree or
resume its saved installation. The selected native, schema, OpenAPI, MCP and
operator profile remains bound to its own archive and lock. The complete source
includes the CSV SQLite index, developer portal and client-generation assets,
merchant deployment templates, financial network metadata and original Python
modules. Choose Node 22.21+ in the 22.x series, Node 24.5+, or Node 25+ as described
in the [configured transport contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/UPSTREAM_TRANSPORT.md).
The CSV index uses the selected Node runtime's `node:sqlite`.

The examples below use the installed `starforge` entry. They can also run through
the same installer's `run --dir /absolute/opencage-runtime --` prefix, or through
the selected checkout's original OpenCage `cli.mjs`. Keep the private project
outside the source and runtime installation.

## Configure a saved workspace

Generate the original editable inputs:

~~~sh
starforge opencage-workbench examples --out /absolute/private/opencage-inputs
~~~

Review `plan.json` and `terms.json` before initialization. The plan defines
forward and reverse products, allowed query options, response bounds, request
pacing, the provider endpoint and the API-key environment reference. Terms select
the merchant's actual HTTPS origin, network, asset, recipient and integer atomic
price. Generated demonstration markers must be replaced with the intended
merchant terms before publication.

These settings describe separate connections:

| Connection | Original setting |
| --- | --- |
| Merchant to OpenCage | Plan endpoint, API-key environment reference and optional direct or named proxy transport |
| Customer to merchant | Merchant HTTPS origin, resource path and the exact offered payment terms |
| Buyer to merchant | Original Buyer request, maximum amount and its selected transport |
| Operator or customer to saved output | Retained workspace or exported delivery and its original manifest |

Supply environment values through the selected host's existing private
configuration. A plan can explicitly select `{"mode":"direct"}` or the maintained
`environment-proxy` profile; the
[deployment guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/opencage/DEPLOYMENT.md)
shows the exact fields. The saved plan retains reference names and the original
connection review.

~~~sh
starforge opencage-workbench init \
  --workspace /absolute/private/opencage-work \
  --plan /absolute/private/opencage-inputs/plan.json \
  --terms /absolute/private/opencage-inputs/terms.json
starforge opencage-workbench serve --workspace /absolute/private/opencage-work
~~~

Open the returned private browser URL. The source panel identifies the retained
plan, terms and configured connection. To manage this process through the runtime
workspace, register its READY installation and select **OpenCage geocoding** (`opencage-workspace`) in the existing
Applications catalog. Review and save its initialized workspace and host
selection, then start, open, stop and reopen that saved application. A source
upgrade uses the existing Applications review and adoption flow for this same
private workspace.

One original workspace owner manages writes and its browser. A separately
launched CLI server and an MCP-owned server should use their normal close/open
handoff before ownership changes. Managed Stop drains accepted work and the
current source operation before closing the derived index and original lease.

## Capture, review and deliver a location

A capture ID identifies one original provider attempt. Review the submitted
product and query in the browser, or use the corresponding CLI:

~~~sh
starforge opencage-workbench capture \
  --workspace /absolute/private/opencage-work --id site-001 \
  --product reverse --query '{"q":"51.952659,7.632473"}'
starforge opencage-workbench inspect \
  --workspace /absolute/private/opencage-work --id site-001
~~~

Use the returned response SHA-256 and decision revision to save the exact
candidate choice. Candidate indexes refer to the original provider order.

~~~sh
starforge opencage-workbench select \
  --workspace /absolute/private/opencage-work --id site-001 \
  --response-sha256 ORIGINAL_RESPONSE_SHA --revision CURRENT_DECISION_REVISION \
  --index REVIEWED_CANDIDATE_INDEX --note "Reviewed against the supplied site"
starforge opencage-workbench export \
  --workspace /absolute/private/opencage-work --id site-001 \
  --response-sha256 ORIGINAL_RESPONSE_SHA --revision SAVED_DECISION_REVISION
starforge opencage-workbench read --delivery /absolute/returned-delivery
starforge opencage-workbench serve --delivery /absolute/returned-delivery
~~~

The customer receives the exact response, ordered candidate projections, saved
choice, licenses and complete manifest. An HTTP 200 with zero candidates remains
a successful empty provider result. Spatial confidence and address correctness
remain separate observations. The provider's documented test keys return their
fixed sample behavior, so retain that context with examples made from those
responses. The [original workbench guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/opencage/README.md)
defines these source and decision contracts.

After a lost response, inspect the same capture ID. When the original matching
HTTP observation and response are available, use `import-response` to reconcile
that recorded attempt. A completed retained result can be opened or exported
again. Deliberately changed input receives its own reviewed request.

## Work through a CSV

Choose **CSV batches** in the same operator. Inspect the original UTF-8 CSV,
select the product and source columns, review normalized queries and invalid
rows, and prepare the returned review. The source file, mapping, product and
terms are bound into that review. Each original row keeps its ordinal and raw
values, including duplicate customer identifiers.

The supplied files under
[OpenCage examples](../../stellar/scf-starforge-20261009/sf30-seller-sdk/opencage/examples)
include a small coordinate CSV and reverse-column mapping. An address mapping
may select one query column or an ordered list of address columns. For coordinates,
select latitude and longitude separately or the original combined query column.

~~~sh
starforge opencage-workbench batch-source --source /absolute/locations.csv
starforge opencage-workbench batch-review \
  --workspace /absolute/private/opencage-work --source /absolute/locations.csv \
  --product reverse --mapping /absolute/reverse-columns.json
starforge opencage-workbench batch-prepare \
  --workspace /absolute/private/opencage-work --source /absolute/locations.csv \
  --product reverse --mapping /absolute/reverse-columns.json \
  --review-sha256 ORIGINAL_REVIEW_SHA
starforge opencage-workbench batch-run \
  --workspace /absolute/private/opencage-work --batch SAVED_BATCH_ID --run locations-pass-1
starforge opencage-workbench batch-status \
  --workspace /absolute/private/opencage-work --batch SAVED_BATCH_ID --offset 0 --limit 50
~~~

The original intake accepts at most 2 MiB, 10,000 data rows and 256 columns. The
source owner makes serial requests with the configured pacing. An explicitly
reviewed `--reuse` list and later identical queries can reuse retained successful
captures. Each receiving row records that reuse and starts with an independent
candidate decision.

Reopen an interrupted batch and its same run ID. Quota, rate, authentication,
empty-result and uncertain-attempt states have distinct continuations. An
intentional retry uses the current row request and response hash, a reason and,
when necessary, an explicit uncertainty acknowledgment. The predecessor request
and the reviewed state stay in the immutable retry chain.

Inspect the loaded row before choosing its candidate:

~~~sh
starforge opencage-workbench batch-row \
  --workspace /absolute/private/opencage-work --batch SAVED_BATCH_ID --row 1
starforge opencage-workbench batch-select \
  --workspace /absolute/private/opencage-work --batch SAVED_BATCH_ID --row 1 \
  --request ORIGINAL_ROW_REQUEST --response-sha256 ORIGINAL_RESPONSE_SHA \
  --revision CURRENT_DECISION_REVISION --index REVIEWED_CANDIDATE_INDEX
starforge opencage-workbench batch-export \
  --workspace /absolute/private/opencage-work --batch SAVED_BATCH_ID \
  --revision CURRENT_BATCH_REVISION
starforge opencage-workbench batch-read --delivery /absolute/batch-delivery --verify true
starforge opencage-workbench batch-serve --delivery /absolute/batch-delivery
~~~

The joined export retains every original row. It includes raw CSV, reviewed
mapping, per-row attempts and decisions, all-row results, exceptions, explicitly
selected GeoJSON points, licenses, and deduplicated original request/response
objects. Full verification replays the same derived projections and counts.
The customer browser reads saved rows and complete manifest-selected files
without provider credentials. The default export allowance is 64 MiB; an
explicit `--max-bytes` can select up to 512 MiB while original per-capture limits
remain in force. See [CSV operation and recovery](../../stellar/scf-starforge-20261009/sf30-seller-sdk/opencage/BATCH.md)
for the complete state, retry, paging and export contracts.

## Use the original merchant agent

The existing `opencage-workspaces` provider creates the same workspace model.
The adopted catalog includes the original fifteen operations and eight CSV
operations. The provider registration, common merchant router and Applications
observer remain their maintained source.

Create a private connection with named workspace and source aliases:

~~~json
{
  "schema": "stellar-forge.opencage-workspace-connection.v1",
  "workspaces": {
    "locations": {
      "directory": "/absolute/private/opencage-work",
      "csvSources": {
        "customer_locations": "/absolute/private/locations.csv"
      }
    }
  }
}
~~~

~~~sh
starforge merchant-mcp init-opencage-workspaces \
  --dir /absolute/private/location-mcp \
  --connection /absolute/private/opencage-connection.json
starforge merchant-mcp-client-config \
  --config /absolute/private/location-mcp/merchant-mcp.json \
  --name locations --output /absolute/private/location-mcp/client-registration.json
~~~

Open the named workspace through `merchant_opencage_open`. Agent and browser
actions observe its current requests, decisions, batches, packages and releases.
The host connection pins original input aliases; changed input bytes require a
fresh connection review. Source inspection and capture, original observation
import, Buyer adoption, customer browsers and retained file downloads retain
their existing interfaces.

Use `merchant_opencage_batch_source/review/prepare/inspect/run/select/retry/export`
for CSV work. Open a saved batch delivery with `merchant_opencage_customer`
and `kind: "batch-delivery"`. The original `merchant_opencage_file_read` transfers
its manifest-selected files in hash-bound chunks. Retain the actual transfer
descriptor and offset across a lost reply. The
[MCP guide](../../stellar-forge/mcp-merchant-operator/OPENCAGE_WORKSPACES.md) describes
the original workspace, HTTP/stdio and file contracts; its fifteen-tool section
is complemented by the eight CSV tools in the linked CSV guide.

## Publish and operate a merchant

Prepare an original merchant package from the saved configuration, inspect it,
stage a named release and compare that release before activation:

~~~sh
starforge opencage-workbench package --workspace /absolute/private/opencage-work
starforge opencage-workbench package-inspect --package /absolute/returned-package
starforge opencage-workbench stage \
  --workspace /absolute/private/opencage-work --release geocode-v1 \
  --package /absolute/returned-package
starforge opencage-workbench release-diff \
  --workspace /absolute/private/opencage-work --after geocode-v1
starforge opencage-workbench activate \
  --workspace /absolute/private/opencage-work --release geocode-v1 --generation CURRENT_GENERATION
starforge opencage-workbench start \
  --workspace /absolute/private/opencage-work --generation ACTIVE_GENERATION
~~~

Use actual generation values returned by the original release store. A revised
price creates another package/release and its retained comparison. Restart and
rollback use the same original store and generation guards. The generated
application filename binds both the package identity and complete generated
entry, so a package received at another source location keeps both original
entries rather than colliding with a previously staged handler.

To prepare a hosted service, review the exact package and original host settings
before generating the SF99 bundle:

~~~sh
starforge opencage-workbench host-review \
  --package /absolute/returned-package --host-plan /absolute/private/host-settings.json \
  --out /absolute/private/geocode-deployment
starforge opencage-workbench host-bundle \
  --deployment /absolute/private/geocode-deployment --review-sha256 ORIGINAL_HOST_REVIEW_SHA
starforge opencage-workbench host-check --deployment /absolute/private/geocode-deployment
~~~

The [host preparation contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/opencage/DEPLOYMENT.md)
defines host settings, exact terms, source/runtime binding and original
systemd/Caddy generation. Generation writes a bundle; deployment of that bundle
uses the original host procedure and intended server. Inspect the saved
generation if interrupted and use its reported continuation. This selection
includes the released SF99 generation journal and same-directory recovery.
Keep a failed or incomplete generation and its selected review as history.

A merchant package is bound to the compiler that generated its contract.
If the receiving compiler reports `GEOCODE_PACKAGE_CONTRACT_CHANGED`, preserve
the earlier package, explicitly generate a new package from its retained plan
and terms with the selected current compiler, inspect it, and review that new
package for host preparation. The
[receiving source](../../stellar/scf-starforge-20261009/sf30-seller-sdk/opencage/receiving/README.md)
retains that linked-generation contract.

## Receive a Buyer result and finish accounting

The original Node Buyer owns preparation, review, execution and recovery.
Select the actual merchant terms, spending cap, source runtime and private state
before an intended purchase. A complete paid native profile also uses the
original operator, policy, ledger and signing/accounting custody.

For an existing result, `adopt-buyer` selects its original client and intent:

~~~sh
starforge opencage-workbench adopt-buyer \
  --workspace /absolute/private/opencage-work \
  --buyer-config /absolute/private/buyer-client.json --intent ORIGINAL_INTENT \
  --id received-location --product reverse --package-id ORIGINAL_PACKAGE_ID
~~~

Recover the original Buyer outcome before independently choosing and exporting
its candidate. Provider capture, merchant release and Buyer result can have
separate native histories; retain their exact identities when joining delivery.

The released Node `Operation` now offers `finalize()`, `accounting()`,
`recoverAccounting()` and `exportAccounting()`. They act on an existing retained
attempt and accounting command. They do not prepare or execute another purchase.
For `Buyer.fromConfig`, select the explicit matching original accounting workspace;
a separately reviewed SF103 signer profile retains its original operator, ledger,
payer and terms without adopting the historical workspace's signer-cap binding.

~~~js
import {Buyer} from '@tokenjunkielabs/starforge-merchant/buyer/node';

const buyer = new Buyer({
  runtimeDirectory: '/absolute/installed/source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli',
  stateDirectory: '/absolute/private/original-buyer-state'
});
const operation = buyer.operation('ORIGINAL_INTENT');
const view = await operation.finalize({
  workspaceDirectory: '/absolute/private/original-accounting-workspace'
});
const retained = await operation.recoverAccounting({commandId: view.commandId});
await operation.exportAccounting('/absolute/private/operation-accounting.json',
  {commandId: view.commandId});
~~~

Use the actual returned command identity and inspect its result. The original
SF36 worker owns financial finalization; unpaid results retain their explicit
no-payment outcome. Recovery and export reopen the selected local command and
its complete context. See the original
[Node accounting guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/README.md)
and [executable example](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/examples/operation_accounting.mjs)
for complete options, stopped commands and export behavior.

## Upgrade and hand over

Build and install the successor in a new runtime directory. Keep the prior
archive, manifest and running release until the receiving edition has opened
the same saved workspace successfully. Review the actual managed source
selection before saving its next Application version.

Retain original CSVs, immutable reviews, request/capture bundles, retry receipts,
candidate histories, merchant packages, release store, host reviews/generation
and Buyer state with the private project. Use original product exports for
customer files and the original runtime transfer and Applications adoption
interfaces for a receiving host. Stop the owner before copying complete private
workspace state. A copy must include its SQLite database and journal together
with the original request history; the CSV index can be reconciled from those
records through `batch-reconcile`.

A complete customer handover and a writable operator handover serve different
purposes. The customer viewer opens the exported manifest without a provider
account. Continued authoring reopens the original private workspace using the
receiving host's explicitly selected credential references and complete runtime.
Follow [RECEIVING.md](RECEIVING.md) for source, archive and actual outcome checks.
