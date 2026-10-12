# OData subscriptions and customer receiving

Use this product to deliver a complete OData source to a customer's application,
retain later editions, and reopen the same publisher and customer state after a
service restart or a receiving-host transfer. It includes the original source
workbench, live collection and comparison engines, subscription publisher/customer
interface, merchant MCP tools, Python Analysis workspace and managed Applications
receiving programme.

The committed **odata-subscriptions** source selection runs through the existing
distribution builder. Its archive retains the selected original files, source
commit, recipe, contribution registrations and complete file manifest. Runtime
preparation resolves the dependencies from that archive's own declarations.

The archive's source directory is `package/source/`; an installed runtime names
its source directory as `sourceRoot`. Every source-file reference below is
relative to that directory. The builder retains this guide unchanged as the
archive's root README, so those references also identify the original files when
reading that copy.

## Choose the customer's workflow

| Work | Existing command or interface | Retained result |
| --- | --- | --- |
| Capture and review an OData source | `starforge odata` | Original metadata and responses, typed source selection and source editions |
| Deliver a complete live collection | `starforge odata-live` | Original query and full cursor chain, exact keys and fields, complete rows and analytical source |
| Review changes between collections | `starforge odata-live comparison-*` | Original keyed comparison, source/type/selection distinctions, review history and frozen editions |
| Deliver recurring editions | `starforge odata-subscriptions` | Publisher editions, baseline and incremental transfers, accepted customer state and complete backups |
| Operate the merchant from an MCP client | `starforge merchant-mcp` or `merchant-mcp-stdio` | Configured original OData workspace and subscription operations |
| Receive a remote collection or comparison | `starforge odata-collection-customer` or `odata-comparison-customer` | Complete file inventory, resumed original downloads, native restored source and Analysis mapping |
| Continue analysis and workbook delivery | Original Python `AnalysisWorkspace`; `starforge workbook-customer` | Saved mappings, full query results, editable workspace archive and customer workbook |
| Operate the installed application | Runtime Workspace Applications; `odata-subscriptions managed-review` and `managed-receive` | Exact READY and connection selection, two closed managed launches, complete backup downloads and independent native receiving |

The subscription guide (`stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/SUBSCRIPTIONS.md`)
contains the full native request, connection, edition, backup, source-proof and
Analysis contracts. The managed receiving guide (`stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/MANAGED_RECEIVING.md`)
defines the complete Start/Stop/reopen programme and its continuation journal.
The original OData Applications guide (`stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/APPLICATIONS.md`)
describes the saved application's fields and startup identity.

## Build one original source edition

Use a complete checkout or the existing Git object receiver with a reviewed full
commit available to the maintained builder. On Linux, use Node24, Python3.11 or
later, npm, Git and util-linux `flock`. Both managed receiving preparation and
execution require Node24 or later. The original installer's base profile accepts
Node22.16 and later; selecting that lower minimum does not satisfy the complete
managed programme. Python Analysis has no extra Python dependencies; its original
Node bridge and source tree are included.

Choose real absolute paths. The build output is a new owned directory. Set
`SOURCE_COMMIT` to the reviewed commit containing this recipe and the intended
original product source, then run:

~~~sh
node "$CHECKOUT/stellar/scf-starforge-20261009/distribution/build.mjs" \
  --repo "$CHECKOUT" \
  --ref "$SOURCE_COMMIT" \
  --selection odata-subscriptions \
  --out "$RELEASE"
~~~

Keep the returned `distribution.json`, archive and inspected `package/` directory.
The receipt supplies the actual `archive` path and `sha256`. Its `sourceCommit`
and source-selection record identify the selected original recipe. The builder
also retains every original Git blob, file hash and length in
`package/manifest.json`.

An available source cache can be used with `--offline`. If a build is interrupted,
keep the same release directory and run the original `--resume` command with the
same selection. A completed build reopens its retained archive; a partial build
uses its saved Git pin and verifies every existing prefix before continuing.
BUILDING.md (`stellar/scf-starforge-20261009/distribution/BUILDING.md`) defines the original acquisition, packaging and
recovery behavior.

This recipe keeps OData, collection/comparison receiving, subscriptions, dataset
and workbook operations and their original merchant providers registered
together. The reusable runtime, buyer and merchant components remain the
maintained source components. Runtime feature selection below determines which
dependency groups are installed.

## Prepare and inspect the selected runtime

Use the original archive and complete digest returned by that build. The parent
of `RUNTIME` must already exist as a real absolute directory; preparation creates
the final private child.

~~~sh
node "$CHECKOUT/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" \
  prepare --dir "$RUNTIME" \
  --archive "$ARCHIVE" --sha256 "$ARCHIVE_SHA256" \
  --native --feature schema --feature openapi --feature mcp --operator

node "$CHECKOUT/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" \
  install --dir "$RUNTIME" --offline --cache "$NPM_CACHE"

node "$CHECKOUT/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" \
  inspect --dir "$RUNTIME" --load --source
~~~

The selected native payment peers, schema, OpenAPI and MCP declarations provide
the complete merchant/operator dependency profile. The profile records exact
resolved versions and all original source declarations. An explicit compatible
version selection can be supplied through the original `--pins` file at prepare.
An online installation uses the same command without `--offline`; choose that
mode when selecting the installation and retain its actual npm outcome.

Only the original installer returns **READY**. It retains the original archive,
profile, dependency lock and source root and checks selected package versions,
imports and any declared native binding. Keep its returned `directory`,
`sourceRoot`, `dependencyRoot`, source commit and manifest identity.

If an existing owner supplies a complete retained dependency graph and its
original `package-lock.json`, receive the complete graph at
`$RUNTIME/node_modules` and that exact lock at `$RUNTIME/package-lock.json` through
that owner's established transfer. Keep both original byte identities with this
newly prepared runtime. Then the original installer can check and adopt those
exact inputs:

~~~sh
node "$CHECKOUT/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" \
  install --dir "$RUNTIME" --adopt-existing
~~~

This path invokes the same profile, import, native-operation and kernel-lease
checks without running npm. An incompatible graph remains incomplete with its
actual findings. The graph's sending installation stays separate from the
receiving runtime. The public-package alternative is the original
runtime transfer (`stellar/scf-starforge-20261009/distribution/RUNTIME_TRANSFER.md`), which preserves a ready sender's
archive, profile, exact lock and public npm tarballs and installs offline on the
receiving host. For a following source edition, prepare its own archive and
selection before adopting a compatible retained graph or using its chosen cache.

The runtime installation guide (`stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md`) covers interrupted
preparation, same-directory install recovery, source/import inspection and
fresh-directory upgrades. Keep the source archive and original dependency lock
with the installation.

## Open the completed customer state

Use the customer's actual completed source workspace and publisher/customer
backups. The product's native restore commands reconstruct each backup in its
own private receiving directory and verify its complete source, edition,
request and history closure. The original OData workspace has a separate native
workspace backup.

A subscription connection refers to the receiving host's real private
directories. Construct it from the actual returned restore paths using the
original connection format (`stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/connection.example.json`).
Keep the prior connection and operation with the original delivery. The
configured export directory must remain separate from each publisher and
customer directory.

Inspect the actual configured stores through the installed original command:

~~~sh
node "$CHECKOUT/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" \
  run --dir "$RUNTIME" -- odata-subscriptions --connection "$CONNECTION" status
~~~

Use the exact `serve` and native request commands from the subscription guide
for ordinary publisher/customer work. Publisher append and customer receiving
retain their original request and accepted previous edition. Retrying a
completed old transfer does not displace a newer selected customer operation.
A later edition made from the same original values has zero changes; an
unselected field or changed source declaration remains distinct from a changed
supplier value.

## Complete managed receiving

Create a private selection file using the returned READY directory and completed
native stores. Use the original OData workspace and the actual connection on
this receiving host:

~~~json
{
  "operationId": "customer-subscription-applications",
  "runtimeDirectory": "/srv/starforge/runtimes/odata-subscriptions-01",
  "workspaceDirectory": "/srv/starforge/customer/odata",
  "subscriptionConnection": "/srv/starforge/customer/Subscription_Connection.json",
  "outputDirectory": "/srv/starforge/receiving/odata-subscriptions-01"
}
~~~

Optional `liveServiceId` selects that workspace's already prepared original live
merchant. Optional `environmentFile` follows the existing Applications
environment reader. Keep the receiving output outside every input, runtime,
publisher, customer and export directory.

Run both stages through the selected runtime's original CLI:

~~~sh
node "$CHECKOUT/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" \
  run --dir "$RUNTIME" -- odata-subscriptions managed-review \
  --request "$SELECTION" --out "$REVIEWED_INPUT"

node "$CHECKOUT/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" \
  run --dir "$RUNTIME" -- odata-subscriptions managed-receive \
  --request "$REVIEWED_INPUT"
~~~

Preparation reads the current native stores and retains every publisher and
customer alias, definition, edition, head/revision and row count. It also binds
the exact connection bytes and original runtime source manifest. Review that
selected input before the receiving operation.

The receiving programme saves one original OData Applications entry, starts it,
checks its actual private launch/probe and subscription page, and reads all
selected rows, publisher changes and edition history. It exports and downloads
the complete native backups, verifies every original file, and restores them in
independent private receiving workspaces. It then stops the original application,
checks that its listeners have closed, reopens the same saved entry and repeats
the full inspection and retained artifact receiving. Completion requires both
managed phases to close.

Repeat the same managed-receive command with the original reviewed input and
output directory after interruption. The native controller retains the saved
application and original Start request; download continuation verifies the
retained prefix of the same selected file. A completed receiving result reopens
its own original outputs without launching the application again.

## Continue Analysis and customer handover

The selected source includes the original Python buyer/Analysis package and
dataset/workbook receiving. From the delivered source, use the
Python application guide (`stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/README.md`) and the
subscription guide's **Analysis** section.

A published subscription Analysis proof contains the original definition,
selected source editions, complete retained transfers and their native rows.
Register that actual source document in the original Analysis workspace, obtain
the mapping bound to its assigned source ID/revision through
`odata-subscriptions analysis-mapping`, and import the complete selected table.
Retain missing, null and unselected states and original exact numeric spellings.
Saved SQL, report/workbook output and full Analysis archive receiving continue
through the original engines.

The complete customer handover keeps the following original inputs and results
together:

- The selected source archive, original file manifest, recipe and runtime
  profile/lock, plus the existing offline dependency transfer when used.
- The original source workspace backup, publisher/customer native backups and
  the receiving host's actual connection.
- The complete managed receiving directory, including its original controller,
  Start requests, both closed phases, HTTP responses, downloads, independent
  restores and final result.
- The selected Analysis document/mapping, full query and workbook outputs, and
  the complete editable Analysis workspace archive.

Build completion, READY installation, native subscription delivery, managed
receiving and customer handover each retain their own actual result. The next
stage selects those returned identities. Source publication by itself does not
supply the later operating results.
