# TokenJunkieLabs Stellar merchant workspace

Build and operate a data service with Stellar payment access, native customer
clients, retained source results, deployment releases, and an operator workspace.

The product brings together captured HTTP API and GraphQL service authoring,
Kafka event datasets, satellite imagery and processing history, searchable
material catalogs, merchant incident work, supplier cost allocation and pricing
decisions, and QuickBooks or Xero accounting operations. Each workflow keeps its
original saved records from source selection through delivery and reopening.

## Choose a workflow

| Work to complete | Entry point | Result |
| --- | --- | --- |
| Turn captured HTTP API traffic into a merchant | `starforge captured-api` | Original source review, exact route prices, native merchant packages, release operations and complete receiving |
| Operate purchased API access | `starforge api-pass-workspace` and `starforge merchant-api-pass` | One saved customer, original purchases and requests, browser/agent operation and complete response receiving |
| Turn an existing GraphQL query service into a merchant | `starforge graphql-workspace` or the merchant MCP tools | Reviewed operations, actual source previews, buyer clients, versioned merchant packages and deployment releases |
| Turn Kafka events into a dataset and merchant | `starforge dataset-kafka`, `starforge kafka-client` and the Kafka merchant tools | Exact retained topic history, mapped editions, native query/merchant packages and resumable complete customer receiving |
| Operate a Timescale data product | **Applications → Timescale merchant workspace** or `starforge timescale-agent` | Native editions, refresh and job review, exact publication, assigned work, complete reports and portable customer receiving |
| Prepare imagery and processing data for customers | `starforge stac` | Retained scene editions and assets, Cirrus or FilmDrop history, original merchant/customer delivery and a portable GIS explorer |
| Operate a searchable material catalog | `starforge-materials` | The maintained catalog, source review, operator workspace, query service and customer receiving |
| Allocate supplier costs and operate merchant pricing | **Applications → Merchant pricing and scenario planning** or `starforge revenue-workspace` | Original bills and quotes, exact route allocations, cost-linked pricing and scenarios, reviewed seller changes and complete workspace receiving |
| Manage incidents and follow-up | `starforge support-console` and `starforge support-watch` | Saved merchant cases, actual runtime captures, operator ownership, notification history and complete support handoffs |
| Work with a selected accounting destination | `starforge merchant-accounting-platforms` | Original QuickBooks or Xero plans, reviewed requests, provider responses and accountant returns |

The [operator guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/merchant-workspace/OPERATING.md)
connects these entry points to installation, source configuration, saved work,
deployment, receiving, and recovery. The
[material catalog guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/material-catalog/README.md)
covers its own complete catalog workflow. The
[captured API guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/captured-api/OPERATING.md)
follows capture intake, operation decisions, the route worksheet, merchant
compilation, agent operation and receiving in one retained product. The
[purchased API customer guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/api-customer/OPERATING.md)
opens existing access or a saved purchase through the browser, generated agent
settings and exact request client. The
[pricing and supplier-cost guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/runtime-workspace/PRICING_APPLICATIONS.md)
connects original supplier sources, allocation, saved pricing reviews, scenario
planning and complete backup receiving through that same Applications lifecycle.

The [Kafka workspace guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/kafka/README.md)
connects original broker capture, exact event history, field mapping and merchant
delivery. Its [complete client](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/kafka/CLIENT.md)
and [customer download](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/kafka/MERCHANT-DOWNLOAD.md)
guides cover the same saved workspace and receiving an original export across
an interrupted transfer.

## Open the source product

Use Linux, Node.js 22.16 or later, Git, and util-linux `flock`.
Retained workspaces need a local filesystem that supports file locks, atomic
rename, and fsync.

~~~sh
git clone https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace.git
cd tjlabs-stellar-merchant-workspace

node stellar/scf-starforge-20261009/distribution/cli.mjs --help
~~~

The source paths are preserved. Before installation, replace `starforge` in
the commands below with:

~~~sh
node stellar/scf-starforge-20261009/distribution/cli.mjs
~~~

For example, start a private imagery workspace against an actual public catalog:

~~~sh
node stellar/scf-starforge-20261009/distribution/cli.mjs stac init \
  --workspace /absolute/private/imagery \
  --title 'Imagery operations' \
  --endpoint https://earth-search.aws.element84.com/v1

node stellar/scf-starforge-20261009/distribution/cli.mjs stac serve \
  --workspace /absolute/private/imagery --port 0
~~~

Open the local URL printed by the server. Discover the catalog, save an area and
time selection, review the source request, and acquire its scene pages. The
workspace retains the original provider responses, scene identities, geometry,
and selected image files. Reopening saved work uses those retained files.

## Create and install a source archive

The maintained builder packages one selected Git revision and its complete
declared source. Run it from the product checkout:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . --ref HEAD --out /absolute/private/packages/merchant
~~~

Keep the returned archive, its SHA-256, and its manifest together. The package
contains the original source, browser assets, command registrations, API exports,
selected README, and licenses.

For a source-only installation in a new application directory:

~~~sh
npm install --ignore-scripts --offline --omit=optional /absolute/path/to/package.tgz
npx --no-install starforge doctor
~~~

Source-only installation supports the features that use Node's built-in modules.
The runtime installer adds the declared dependencies for selected database,
GraphQL, MCP, payment, and other adapters. Choose the feature set for the actual
merchant; the installed package supplies the exact dependency declarations.

A GraphQL merchant operated through MCP normally selects the GraphQL, schema,
OpenAPI, and MCP features, plus the native Stellar packages:

~~~sh
starforge runtime-install prepare \
  --dir /srv/starforge/runtimes/query-merchant \
  --archive /srv/starforge/downloads/merchant.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature graphql --feature schema --feature openapi --feature mcp \
  --operator

starforge runtime-install install \
  --dir /srv/starforge/runtimes/query-merchant

starforge runtime-install run \
  --dir /srv/starforge/runtimes/query-merchant -- source
~~~

Use the actual archive path and hash returned by the builder. The original
installer retains its lock, dependency selection, installation progress and
recovery state. Its
[installation guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
covers interruption, native prerequisites, upgrades, and reopening. The
[runtime workspace](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/runtime-workspace/README.md)
provides the corresponding browser workflow.

## Operate one saved merchant

For a captured HTTP API, initialize and open its private product:

~~~sh
starforge captured-api init --dir /absolute/private/captured-api \
  --name 'Supplier API'
starforge captured-api open --dir /absolute/private/captured-api --browser-only
~~~

Upload the original HAR, review operations in the browser, and save the immutable
source decisions. Use that approved source in the native merchant form, set the
payment and upstream choices, and review exact route prices in its worksheet.
Compile and save the complete merchant, then reopen its original package for
release and customer receiving. Opening the same product with its MCP token
enables the HAR and OpenAPI agent workflows against that same browser and state.
The captured API guide gives the full runtime selection and commands.

For an existing query service:

1. Open the GraphQL workspace and capture the actual served schema.
2. Select query fields and buyer-variable bounds, then preview the approved
   operation against its configured source.
3. Save the merchant plan with the intended public routes and payment choices.
4. Review and export the saved project. The export includes the original query,
   source binding, seller files, generated buyer client, and request examples.
5. Prepare the deployment, stage its release, select it, and start the original
   merchant. Keep the release and host records with the workspace.
6. Reopen the same project when the source schema or service changes. Compare
   against its retained export before preparing a revised release.

The browser and merchant MCP tools operate the same saved project, revisions,
preview UUIDs, exports, and deployment records. A completed source preview can be
opened again without making another provider request. The
[GraphQL guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf105-subquery-graphql-merchant/workspace/README.md)
and
[MCP operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar-forge/mcp-merchant-operator/GRAPHQL_WORKSPACES.md)
give the exact configuration and action contracts.

## Keep the operating state

Keep workspace directories, configuration files, original request records, and
completed delivery files outside the source checkout. Supply credential values
through the host's environment or existing secret manager; configuration files
retain their reference names.

Use the product's original export and receiving commands for a handover. Imagery
deliveries include a local scene explorer and retained selected assets. Captured API
handoffs keep the native capture or refresh directory, immutable reviews, full
merchant package and pricing worksheet. GraphQL exports include the generated
client and exact deployment files. Pricing and supplier-cost handoffs use the
original complete workspace backup to retain supplier originals, cost editions,
pricing reviews, scenario comparisons and price decisions together. Support
handoffs carry the original captures and saved case. Accounting operations keep
their original request and response identities through reconciliation.

Use a fresh runtime directory for an upgrade, select its original source
archive, then attach the existing operating state through that workflow's
supported configuration. Retain the previous runtime and selected release until
the replacement is operating as intended.

## Product source and guides

- [Timescale native operations, assigned work and complete receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/timescale/OPERATING.md)

- [Complete operator guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/merchant-workspace/OPERATING.md)
- [Captured API merchant, pricing and receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/captured-api/OPERATING.md)
- [Purchased API access and customer receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/api-customer/OPERATING.md)
- [GraphQL authoring and revisions](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf105-subquery-graphql-merchant/workspace/README.md)
- [Imagery, processing, Applications and customer receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/stac-workspace/OPERATING.md)
- [Imagery operations](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/stac/README.md)
- [Cirrus and FilmDrop processing](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/stac/processing/PROCESSING.md)
- [Portable GIS receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/stac/receiving/PORTABLE_GIS.md)
- [Supplier costs, pricing and complete workspace receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/runtime-workspace/PRICING_APPLICATIONS.md)
- [Merchant incident desk](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf74-merchant-support-console/INCIDENT_SOURCES.md)
- [QuickBooks and Xero operations](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar-forge/mcp-merchant-operator/ACCOUNTING-PLATFORMS-CLIENT.md)

Installed archives retain these guides under `source/` with the same relative
paths. The package manifest records the selected source revision and original
file identities.

Copyright TokenJunkieLabs. The product retains its MIT license and the applicable
third-party license files.
