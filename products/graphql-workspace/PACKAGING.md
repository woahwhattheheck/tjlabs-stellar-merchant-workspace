# Install and receive the GraphQL merchant workspace

This edition contains the complete original GraphQL customer workflow: source
schema capture, saved operation authoring and connected previews, merchant and
buyer packages, schema evolution, native release and host preparation, resumable
file delivery, and complete selected-project handover. The browser and agent
share the original SF105 writer. The installed source, runtime dependencies and
private project remain separate so a runtime upgrade preserves the working
project and its history.

The maintained source selection is **graphql-workspace**. Its installed commands
are **starforge graphql-product** and the direct **starforge-graphql** entrypoint.
Applications contains **GraphQL merchant workspace**, the original Buyer
receiving workspace, and the merchant console.

## What the receiving operator keeps

| Item | Original location or result | Purpose |
| --- | --- | --- |
| Selected source archive | Original builder's returned archive and SHA-256 | Complete selected code, browser resources, source manifest and installer |
| Ready installation | Its private runtime directory | Original source/profile/lock and installed dependencies |
| Customer setup | The initialized private product directory | Source aliases, named environment references, original GraphQL directory and stable connection file |
| Selected customer files | Native merchant, buyer, preview, evolution, deployment or host export | The exact output selected by the operator |
| Complete project handover | Native handover directory and its index hash | Every committed revision through the selection and all referenced original artifacts |
| Runtime transfer | Original transfer manifest and declared part files | Source/profile/lock plus public dependency tarballs for a receiving machine |

Keep the actual source archive, build receipt, runtime profile and lock beside
the completed customer handover. The native handover retains source records and
prepared artifacts; each receiving host supplies its own source credentials,
private listener token and explicit source/host settings.

The retained detailed guides live at these paths inside the source archive:

- source/products/graphql-workspace/README.md — source setup and the installed commands.
- source/products/graphql-workspace/OPERATING.md — source authoring, release operation and request recovery.
- source/products/graphql-workspace/HANDOVER.md — complete history receiving and continued editing.
- source/stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md — installation, recovery and upgrade.
- source/stellar/scf-starforge-20261009/distribution/RUNTIME_TRANSFER.md — complete runtime transfer.
- source/stellar/scf-starforge-20261009/sf105-subquery-graphql-merchant/deployment/README.md — native deployment compiler and generated host packets.

## 1. Build the selected original source

Use the existing checkout or Git source cache containing the intended full
commit. Give this source selection its own output directory. The original
builder owns source acquisition, static module closure, browser resources,
manifest creation, archive publication and continuation.

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout \
  --ref ORIGINAL_FULL_COMMIT_SHA \
  --selection graphql-workspace \
  --out /absolute/graphql-release
~~~

Use the returned archive path and SHA-256 in the installation below. The package
version names the original source commit and selection, and manifest.json
retains the original recipe identity and every selected source file.

The recipe includes the complete SF105 product, authoring, merchant, evolution
and deployment source; original SF82 release and SF99 host source; merchant and
buyer operating resources; the original Applications browser; and the selected
source-owned MCP providers. Explicit support files retain the original dynamic
GraphQL/configuration/client-export/discovery loaders and the runtime worker.
They also include SF82's original OpenAPI compilation and upstream launch
entrypoints, plus SF99's generated delivery worker and OAuth host preflight.
The builder follows the selected modules' static imports. Generated GraphQL
handlers bind the installed original adapter path and hash; receiving a complete
project prepares its local deployment through that same native compiler.
The other product registrations remain in their own source selections.

Continue a partial or completed build in its same output:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout \
  --out /absolute/graphql-release --resume

node stellar/scf-starforge-20261009/distribution/build.mjs \
  --out /absolute/graphql-release --status
~~~

An omitted selection on resume uses the retained selection. A different commit
or explicit selection belongs to a new output. A completed build returns its
original verified archive. Add --offline when the original Git objects are
already available in that checkout.

## 2. Install the complete operating profile

Use Linux, Node 22.16 or later, Python 3.11 or later, npm and util-linux flock,
as required by the original installer. The actual installed Node/native module
compatibility is checked by that installer.

Select all four original feature groups for this product:

| Feature | Original source manifest | Used by |
| --- | --- | --- |
| schema | stellar-forge/payment-auto-catalog/package.json | Original schema pattern validation |
| openapi | sf61-openapi-seller-import/package.json | Native merchant/host configuration and generated contracts |
| graphql | sf105-subquery-graphql-merchant/package.json | Original GraphQL parser, schema and operation compiler |
| mcp | stellar-forge/mcp-paid-agent/package.json | Original MCP transport, authentication and x402 interfaces |
| --native and --operator | Retained distribution and runtime profile | Native Stellar payment support and original operator lifecycle |

Those source manifests select the dependency versions. The original runtime
profile and package-lock.json retain the actual resolved installation.

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/graphql-runtime \
  --archive /absolute/graphql-release/RETURNED_ARCHIVE.tgz \
  --sha256 RETURNED_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature graphql --feature mcp \
  --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/graphql-runtime --cache /absolute/retained-npm-cache

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/graphql-runtime --load --source
~~~

Retain the actual READY result, including sourceCommit, sourceRoot and
dependencyRoot. Installation and its lease retain the current phase after an
interruption; use the original install or resume command on that same directory.
An existing complete dependency tree and its unchanged lock can use the
installer's --adopt-existing route. That route checks the selected profile and
native imports before declaring readiness.

Use the original dispatcher from this point so every command uses this
installation:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/graphql-runtime -- source

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/graphql-runtime -- graphql-product --help

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/graphql-runtime -- registrations --command graphql-product
~~~

The direct starforge-graphql bin selects the same retained product CLI. The
original dispatcher also exposes graphql-onboarding, graphql-workspace,
graphql-merchant, graphql-deployment, releases, merchant-host, buyer-runbook
and buyer-agent for their respective native workflows.

## 3. Initialize and open the actual customer

Retain the customer's actual source definition in a private file. Its format
is the original stellar-forge.graphql-product-sources.v1 contract shown in the
retained product README. Select the real endpoint's origin/path and the name
of its authorization environment variable. Optional runtime and host plans
use the original GraphQL connection contract.

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/graphql-runtime -- graphql-product init \
  --dir /srv/private/graphql-product \
  --sources /srv/private/graphql-sources.json \
  --workspace indexer --name "GraphQL data operations"

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/graphql-runtime -- graphql-product review \
  --dir /srv/private/graphql-product --port 0

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/graphql-runtime -- graphql-product open \
  --dir /srv/private/graphql-product --port 0
~~~

The parent of the new private product directory must already exist. An existing
GraphQL connection can use --connection instead of --sources; an existing
merchant setup can use --configuration. Retain the selected workspace alias
and its original project directory.

Supply the named source credentials and MCP_ACCESS_TOKEN through the process
environment or the original private environment configuration. Open returns
the actual browser URL, authenticated agent endpoint and stable connection
file. Keep this owner running while using the browser or product client.

For managed operation, register the READY runtime in the original Runtime
workspace and choose Applications → GraphQL merchant workspace. Review the
product directory and settings, then Save → Start → Open. Stop drains that
same owner. Starting again preserves its private workspace and updates the
live URLs in connection.json.

## 4. Complete the source-to-customer workflow

Use the actual source and retained project in the original browser:

1. Create or reopen the project and capture its selected schema. Author the
   approved operation and variables. Apply them to the existing route without
   losing its price, payment or admission settings.
2. Run the connected preview through that source. Keep the returned operation
   UUID and exact request/response. Save the project revision.
3. Prepare the original merchant package and buyer files from that saved
   revision. Use the native review and generated README to commission the
   merchant against the selected endpoint and payment terms.
4. Compare a subsequent real schema against the retained merchant baseline.
   Review affected operations, retain the comparison with the saved revision,
   and prepare the original evolution package.
5. Prepare the native deployment from the selected merchant export. Stage and
   operate it through the original SF82 release console. Its release ID,
   selection generation and activation/rollback state remain authoritative.
6. Prepare the chosen original SF99 host packet when a target host is selected.
   Its generated instructions retain the actual source/dependency roots and
   target plan.
7. Deliver the completed merchant, buyer, deployment or host files through the
   product's original receive command. Inspect the received files and use the
   packet's native customer instructions. The separate Buyer application and
   buyer-agent preserve the customer's original purchase and receiving IDs.

The original operating and deployment guides describe each native action.
A prepared packet, a running merchant and a customer's completed transaction
have their own returned states. Preserve those states in the customer handoff.

## 5. Hand over the complete project and continue editing

Save the selected project revision. In the browser, use Project handover to
prepare the complete saved project. For the resumable agent transport, retain a
private selection file with the actual project ID and revision and kind handover:

~~~json
{
  "project": "ACTUAL_PROJECT_ID",
  "revision": 12,
  "kind": "handover"
}
~~~

Replace 12 with the actual saved revision. Select a stable transfer alias for
that exact file set:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/graphql-runtime -- graphql-product receive \
  --dir /srv/private/graphql-product \
  --export-id ACTUAL_HISTORY_TRANSFER_ALIAS \
  --selection /srv/private/handover-selection.json \
  --out /srv/private/received-project

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/graphql-runtime -- graphql-product inspect-received \
  --dir /srv/private/received-project
~~~

Repeat the same alias, selection and output to continue an interrupted file
transfer. The original downloader verifies its retained manifest and completed
byte prefixes. Complete local prepared handover folders can also use the
operator's existing private file-transfer route.

On the receiving host, install this selected product, initialize its private
product with that host's actual source aliases, and open it. Inspect the
received handover through that same product:

~~~sh
starforge graphql-product inspect-handover \
  --dir /srv/private/receiving-product \
  --from /srv/private/received-project

starforge graphql-product reopen-handover \
  --dir /srv/private/receiving-product \
  --id ACTUAL_RECEIVING_UUID \
  --handover-sha256 ACTUAL_INSPECTED_HANDOVER_SHA256 \
  --expected-revision ACTUAL_INSPECTED_TARGET_REVISION \
  --from /srv/private/received-project
~~~

Use these commands through the installed runtime dispatcher as above, or its
installed starforge bin. Retain that receiving UUID, index hash and expected
revision before dispatch. A lost response continues with the same request.
Once its original input is retained, the same reopen-handover command can omit
--from to finish without the former download directory.

The original project ID, revision bytes and artifact identities remain intact.
The receiver resolves retained paths locally, preserves later matching edits
and publishes the project head only after the selected files are complete.
Reopen the project in its original editor, save the next revision, compare
against its received merchant baseline and prepare the target's next native
deployment through the same workflow.

## 6. Transfer or upgrade the runtime separately

The original runtime transfer carries the selected source/profile/lock and
dependency tarballs. Review and export the READY installation using its populated
npm cache:

~~~sh
starforge runtime-transfer review --runtime /absolute/graphql-runtime
starforge runtime-transfer export --runtime /absolute/graphql-runtime \
  --directory /absolute/graphql-runtime-transfer \
  --cache /absolute/retained-npm-cache
starforge runtime-transfer inspect \
  --directory /absolute/graphql-runtime-transfer --verify
~~~

Retain manifest.json, its reported SHA-256 and every declared part file. On the
receiving host use the same original transfer implementation:

~~~sh
starforge runtime-transfer receive \
  --directory /absolute/graphql-runtime-receiver \
  --manifest /absolute/transferred-runtime/manifest.json \
  --sha256 ACTUAL_RUNTIME_TRANSFER_MANIFEST_SHA256 \
  --parts /absolute/transferred-runtime

starforge runtime-transfer install \
  --directory /absolute/graphql-runtime-receiver \
  --runtime /absolute/received-graphql-runtime
~~~

Use the original native build inputs required by that receiving host. The
runtime installer owns dependency/native readiness. Its transfer manifest and
the project's handover index describe separate delivered items.

For an upgrade, prepare a new runtime from the chosen source-selected archive,
compare it with the previous runtime, then stop the existing application and
start that same private product from the newly selected READY runtime. The
previous runtime remains available. Project edits, previews, merchant exports
and receiving operations continue in their original private store.

## Complete delivery

Give the receiving maintainer the selected archive and source revision, actual
READY installation/profile/lock, complete private project handover, required
host/source configuration names, native customer outputs and their operating
guides. Include the actual saved project and release selections and the owner's
current live/closed state. Those original artifacts let the next operator open,
edit, deploy and deliver the same customer workflow.
