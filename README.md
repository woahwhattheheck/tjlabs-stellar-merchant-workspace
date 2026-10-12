# TokenJunkieLabs Stellar merchant workspace

Build and operate a data service with Stellar payment access, native customer
clients, retained source results, deployment releases, and an operator workspace.

The product brings together captured HTTP API and GraphQL service authoring,
Kafka event datasets, reviewed aid-finance portfolios, satellite imagery and
processing history, searchable
material catalogs, merchant incident work, supplier cost allocation and pricing
decisions, and QuickBooks or Xero accounting operations. Each workflow keeps its
original saved records from source selection through delivery and reopening.

The [development architecture and delivery plan](products/merchant-workspace/DEVELOPMENT.md)
connects the original code, user interfaces, prospective Stellar integration
roadmap, native acceptance and complete customer handover in one source.

## Choose a workflow

| Work to complete | Entry point | Result |
| --- | --- | --- |
| Review exact economic series and source revisions | **Applications → DBnomics economic workspace** or `starforge dbnomics` | Original provider responses, precise native periods and values, saved analyst reports, reviewed publication and complete editable/customer receiving |
| Receive an official World Bank edition through customer analysis | `starforge worldbank-product` and the original `worldbank-agent` Applications entry | Complete retained source, reviewed merchant edition, reports, typed workbook and reopened customer workspace |
| Publish retained SEC facts and filings, then reopen the entire operator workspace | [SEC EDGAR operating guide](products/sec-edgar/OPERATING.md) | Original public-source editions, every saved revision, customer delivery, and a complete portable receiving package |
| Operate a coastal source study | **Applications → Coastal source operations**, `starforge coops` and `starforge coops-mcp` | Original NOAA editions, reviewed multi-station studies, complete source/model-input delivery, returned-file receiving, analytical workbooks and native customer files |
| Receive Baserow data into a Rails application | **Applications → Baserow source authoring** and `starforge baserow-rails` | [Complete selected installation](products/baserow-rails/README.md), original source editions and attachments, typed Ruby receiving, transactional Rails preview/import and full application handover |
| Set up and operate a WooCommerce / CoCart customer | `starforge cocart-setup` and **Applications → CoCart** | Original saved-profile or whole-customer intake, native cart and Woo checkout, managed reopening and complete receiving |
| Investigate Stellar assets and receive the original merchant data | **Applications → Stellar asset investigation** or `starforge stellar-expert-product` | [Complete selected installation](products/stellar-expert/README.md), exact provider editions, native publications, 27 merchant tools and original customer files |
| Operate site weather and deliver original observations | **Applications → Site weather operations** or `starforge nws-product` | [Complete selected installation](products/nws-site-weather/README.md), retained NWS source and wire bytes, 30 merchant tools, original Applications reopen and customer receiving |
| Receive scientific data and review a provider handoff | [ERDDAP source and provider workspace](products/erddap-provider/OPERATING.md) | Original grid/station-table capture, native dataset editions, reviewed provider profile, merchant delivery and complete customer receiving |
| Operate WebDAV or Nextcloud files as a merchant | **Applications → WebDAV source and merchant workspace**, `starforge merchant-webdav` and `starforge merchant-webdav-edition` | Complete retained file versions, reviewed dataset editions, native publication and customer work, full resumable handover and original source reopening |
| Review and publish an economic data edition | **Applications → Eurostat economic editions** or `starforge eurostat` | Exact official source captures, reviewed dimensions, complete economic briefings, native merchant publication and original customer receiving |
| Turn captured HTTP API traffic into a merchant | `starforge captured-api` or **Applications → Captured API merchant** | Original source review, exact route prices and policies, persistent workflows, native merchant packages, releases and complete customer receiving |
| Operate purchased API access | `starforge api-pass-workspace` and `starforge merchant-api-pass` | One saved customer, original purchases and requests, browser/agent operation and complete response receiving |
| Operate and hand over buyer request collections | **Applications → Request collections** or `starforge buyer-collections-workspace` | Reviewed original requests, exact spending caps and outcomes, complete encrypted backup, receiving and reopening |
| Operate a saved merchant fleet | **Applications → Merchant fleet** or `starforge merchant-fleet-workspace` | Reviewed source releases, controlled activation and drain, client delivery, durable settlement delivery, and encrypted recovery with the original fleet state |
| Operate native MPP merchant and customer | **Applications → Native MPP merchant and customer** or `starforge mpp-workspace` | One retained native workspace, original 402 purchase and consent/recovery flow, browser/agent operation, twelve-file customer delivery and exact paid-response receiving |
| Turn an existing GraphQL query service into a merchant | **Applications → GraphQL merchant workspace** or `starforge graphql-product` | Reviewed source operations, buyer clients, deployment releases and complete project history that reopens for continued authoring |
| Receive a complete OData query into customer analysis | **Applications → OData source and live merchant** or `starforge dataset odata --workspace DIRECTORY serve` | Retained source/query, complete ordered live-page collection, original Analysis/report/workbook and full workspace receiving |
| Turn Kafka events into a dataset and merchant | `starforge dataset-kafka`, `starforge kafka-client` and the Kafka merchant tools | Exact retained topic history, mapped editions, native query/merchant packages and resumable complete customer receiving |
| Prepare imagery and processing data for customers | `starforge stac` | Retained scene editions and assets, Cirrus or FilmDrop history, original merchant/customer delivery and a portable GIS explorer |
| Operate material catalogs and supplier delivery | `starforge-materials` | Complete source and edition review, customer matching, supplier corrections, BMEcat, ETIM xChange, 2BA upload packages, MCP/client operations and portable receiving |
| Allocate supplier costs and operate merchant pricing | **Applications → Merchant pricing and scenario planning** or `starforge revenue-workspace` | Original bills and quotes, exact route allocations, cost-linked pricing and scenarios, reviewed seller changes and complete workspace receiving |
| Manage incidents and follow-up | `starforge support-console` and `starforge support-watch` | Saved merchant cases, actual runtime captures, operator ownership, notification history and complete support handoffs |
| Work with a selected accounting destination | `starforge merchant-accounting-platforms` | Original QuickBooks or Xero plans, reviewed requests, provider responses and accountant returns |
| Review research sources, documents and processing jobs | **Applications → Research dossiers**, `starforge research-workspace` and `starforge research-client` | Saved questions, complete Documents and managed Pipelines operations, reviewed source editions, findings and full original-file/report receiving |
| Review a retained grant purchase and hand it over | **Applications → Grant purchase reviewer** or `starforge grant-demo workbench` | Original packet/source review, complete native Buyer results, whole-Buyer closed export and independent receiving |
| Plan grant work and operate delivery | **Applications → Grant planning and delivery** or `starforge grant-workspace` | Versioned budgets, staffing and cash forecasts, customer work, original buyer and support observations, cohort review, tranche completion and complete workspace receiving |
| Operate a QuestDB time-series data product | **Applications → QuestDB source and dataset publishers** or `starforge questdb-workspace` | Native fixed-window, SAMPLE BY and keyed-ASOF reports, complete retained editions, versioned publication and full customer receiving |
| Operate a SQL Server data product | **Applications → SQL Server data products** or `starforge mssql-agent` | Native catalog and typed-query review, retained sellers, 21 merchant tools, complete customer files and resumable merchant receiving; [selected installation and operating guide](products/mssql/README.md) |
| Operate a Timescale data product | **Applications → Timescale merchant workspace** or `starforge timescale-agent` | Native editions, refresh and job review, exact publication, assigned work, complete reports and portable customer receiving |
| Operate a Huwise data product | `starforge huwise`, `starforge merchant-huwise` and `starforge merchant-huwise-receive` | Complete portal editions, analyst review, tenant ingestion and publication, native merchant operation and full customer receiving |
| Operate complete transit schedules and merchant editions | **Applications → GTFS Schedule merchant** or `starforge gtfs` | Complete original feeds, exact dated schedules, retained comparisons, native dataset publication, merchant operation and whole-workspace receiving |
| Review publisher finance and native data quality | **Applications → IATI aid finance and DQA** or `starforge dataset-iati` | Original XML and native DQA assessments, named finance/finding reviews, refreshed comparisons, browser/MCP/CLI operation and complete customer receiving |
| Operate and receive a 360Giving publisher | **Applications → 360Giving publisher workspace**, `starforge dataset-360giving-workspace` and [typed agents](products/360giving-publisher/README.md) | Original package/reviews, complete native grants and changes, SDK/MCP operation, full customer handoffs and independent receiving |
| Receive a reviewed local dataset and hand over the customer workspace | **Applications → Local dataset customer workspace** or `starforge local-dataset-agent` | [Complete selected installation](products/local-dataset/OPERATING.md), original Frictionless capture, full native pages, DuckDB editions and SQL, complete reports and portable receiving |

The [Local dataset customer guide](products/local-dataset/OPERATING.md) connects
reviewed Frictionless CSV, TSV, JSON and Parquet sources to complete native
receiving, original DuckDB customer editions, saved SQL and reports, managed
Applications and whole-workspace handover. Build its complete installed product
with `--selection local-dataset`.

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
[Request Collections guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/request-collections/OPERATING.md)
connects grouped request review, exact spending caps, original outcomes, complete
encrypted backup and independent receiving. Its installed
`buyer-collections-setup` command prepares the explicit host profiles for that
same workflow. The
[merchant economics guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/merchant-economics/OPERATING.md)
follows original seller observations, supplier-source review, route allocation,
pricing decisions and complete workspace receiving. The
[pricing and supplier-cost guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/runtime-workspace/PRICING_APPLICATIONS.md)
connects original supplier sources, allocation, saved pricing reviews, scenario
planning and complete backup receiving through that same Applications lifecycle.

The [merchant fleet guide](products/merchant-fleet/OPERATING.md) connects an existing
fleet plan and its original seller stores to Applications review, start, open,
stop and reopening. `starforge merchant-fleet-configure` prepares the native
configuration and exact request files; the same guide carries release review,
activation and rollback, customer files, accounting and fulfillment delivery,
and the original encrypted fleet recovery and receiving workflow.

The [Kafka workspace guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/kafka/README.md)
connects original broker capture, exact event history, field mapping and merchant
delivery. Its [complete client](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/kafka/CLIENT.md)
and [customer download](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/kafka/MERCHANT-DOWNLOAD.md)
guides cover the same saved workspace and receiving an original export across
an interrupted transfer.

The [Huwise operating guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/huwise/OPERATING.md)
connects complete source review, the tenant Automation API, native publication,
merchant operation and delivery of every original customer file. Build its
selected source with `--selection huwise`; its package retains the original
publisher, buyer, host and runtime installation workflow.

The [IATI aid-finance operator guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/OPERATIONS.md)
connects complete publisher XML to activity, transaction and budget editions,
named portfolio review, exact financial reports and independent customer
receiving. Build its installed product with `--selection iati-operator`.
The [complete publisher workflow](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/COMPLETE.md)
uses the same runtime and Applications to operate both included original
AidData Nigeria and Transparency International editions and deliver each
complete customer archive.

The [native DQA customer workflow](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/DQA.md)
adds original provider assessments, configuration observations, named finding
review, full refreshed comparisons and portable case receiving to this same
application. The complete installed receiving procedure includes the pinned
original DQA service and full public IATI.cloud source exchanges.

The [Eurostat operating guide](products/eurostat/OPERATING.md) connects official
source acquisition, exact economic reports, native publication and complete
customer receiving. Build the complete selected product with
`--selection eurostat` and open its original Applications entry.

The [Research Documents and Pipelines guide](products/research/OPERATING.md) and
[installation and receiving guide](products/research/RECEIVING.md) connect saved
questions, completed documents and managed processing jobs, reviewed source
editions and findings, and complete report, original-file and portable delivery
through the same browser, CLI and merchant attachment. Build its complete
selected product with `--selection research-workspace`.

The [WebDAV operating and receiving guide](products/webdav/OPERATING.md) connects
original file capture, public field review, native publication and customer
work through the browser, managed Applications and complete merchant client.
Build its complete installed workflow with `--selection webdav-operator`.
The installed `merchant-webdav-edition` command continues an original reviewed
mapping and merchant through the next edition, native publisher preparation,
and complete export/source-packet receiving.

The [Grant Operations guide](products/grant-operations/OPERATING.md) connects
budget and resource planning, cash forecasts, customer delivery, original buyer
and support observations, cohort review, and tranche completion in one retained
workspace. Build its complete installed application with
`--selection grant-operations`; its browser, CLI and agent service share the same
case versions, saved requests, review history and complete receiving workflow.

The [CoCart merchant and customer guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/cocart/OPERATING.md)
connects the local saved-file setup page, pinned native SDK, original Woo checkout,
merchant agent connection, managed Applications and complete customer receiving.
Build its complete installed product with `--selection cocart-merchant`; open
`starforge cocart-setup --port 8787` to prepare the customer's original files.

The [Baserow to Rails operating guide](products/baserow-rails/OPERATING.md) connects the
original source workspace, retained publication, complete customer rows and
attachments, exact mapping and transactional Rails editions. Its [installation
and receiving guide](products/baserow-rails/RECEIVING.md) carries the complete original
client and configured operator through independent application receiving.
Build that product with `--selection baserow-rails`.

The [QuestDB operating guide](products/questdb/OPERATING.md) connects native
time-series discovery and report authoring to complete capture receiving,
versioned publication and installed Applications. Build its committed source
selection with `--selection questdb`; the package keeps the original native
merchant, buyer, installer and release workflow.

The [World Bank product guide](products/worldbank/README.md) connects official economic
source review, managed browser/MCP operation, native dataset delivery and the
original analytical/customer workflow. Build its complete installed edition with
`--selection worldbank`; [receiving](products/worldbank/RECEIVING.md) continues the
same installed source through reports, workbook and a reopened customer application.

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

The [Coastal source operations guide](products/coops/OPERATING.md) follows the
original station and archive workflow through reviewed multi-station studies,
complete model-input and source deliveries, returned-file comparison, offline
analytical workbooks, native merchant publication and customer receiving.
Build this installed product with `--selection coastal-operations`.

The [DBnomics economic workspace guide](products/dbnomics/OPERATING.md) connects
original source review, precise economic series, saved reports, native
publication, complete editable exports and customer receiving. Build the full
installed application with `--selection dbnomics`.

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
[GraphQL product guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/graphql-workspace/OPERATING.md)
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
merchant package and pricing worksheet. GraphQL project handovers retain every
committed revision through the selected revision, completed source previews,
generated clients and original deployment files. The receiving operator reopens
the same project and prepares a deployment for the receiving installation. Pricing and supplier-cost handoffs use the
original complete workspace backup to retain supplier originals, cost editions,
pricing reviews, scenario comparisons and price decisions together. Support
handoffs carry the original captures and saved case. Accounting operations keep
their original request and response identities through reconciliation.

Use a fresh runtime directory for an upgrade, select its original source
archive, then attach the existing operating state through that workflow's
supported configuration. Retain the previous runtime and selected release until
the replacement is operating as intended.

## Product source and guides

- [DBnomics source revisions, saved economic reports and complete customer receiving](products/dbnomics/OPERATING.md)
- [SEC EDGAR merchant](products/sec-edgar/README.md) and [complete operator guide](products/sec-edgar/OPERATING.md): retained company facts and filings, selected product installation, customer delivery, and whole-workspace export, receiving, and reopen.
- [QuestDB reports, retained editions, publication and customer receiving](products/questdb/OPERATING.md)

- [Coastal studies, original source delivery, returned-file receiving and complete workbooks](products/coops/OPERATING.md)
- [WebDAV source, merchant operator and complete receiving](products/webdav/OPERATING.md)
- [ERDDAP source and provider workspace](products/erddap-provider/OPERATING.md): complete source, native editions, provider intake, merchant and customer receiving; [selected package recipe](stellar/scf-starforge-20261009/distribution/ERDDAP_PROVIDER.md).

- [GTFS Schedule merchant: selected installation, exact editions and complete receiving](products/gtfs-schedule/README.md)
- [GTFS complete operating and handover guide](products/gtfs-schedule/OPERATING.md)

- [Research Documents, managed Pipelines and full receiving](products/research/RECEIVING.md)
- [Eurostat economic editions and complete customer receiving](products/eurostat/OPERATING.md)
- [IATI publisher review, finance and operator interfaces](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/OPERATIONS.md)
- [IATI complete installed publisher workflow and customer handover](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/COMPLETE.md)
- [IATI native DQA assessment, customer review and complete receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/DQA.md)
- [Complete OData collections, Analysis and customer receiving](stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/COLLECTIONS.md)

- [Timescale native operations, assigned work and complete receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/timescale/OPERATING.md)
- [Native MPP merchant, customer and managed receiving](products/mpp-workspace/README.md)

- [Complete operator guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/merchant-workspace/OPERATING.md)
- [Grant purchase review and complete receiving](products/grant-reviewer/OPERATING.md)
- [Grant Operations: planning, customer delivery, cohort review and complete receiving](products/grant-operations/OPERATING.md)
- [Research questions, source review and complete delivery](products/research/OPERATING.md)
- [Captured API merchant, pricing and receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/captured-api/OPERATING.md)
- [Purchased API access and customer receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/api-customer/OPERATING.md)
- [Managed merchant fleet, settlement delivery and encrypted recovery](products/merchant-fleet/OPERATING.md)
- [Request Collections, encrypted backup and complete receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/request-collections/OPERATING.md)
- [GraphQL authoring and revisions](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf105-subquery-graphql-merchant/workspace/README.md)
- [GraphQL product setup and complete project handover](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/graphql-workspace/HANDOVER.md)
- [Imagery, processing, Applications and customer receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/stac-workspace/OPERATING.md)
- [Imagery operations](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/stac/README.md)
- [Cirrus and FilmDrop processing](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/stac/processing/PROCESSING.md)
- [Portable GIS receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/stac/receiving/PORTABLE_GIS.md)
- [Supplier costs, pricing and complete workspace receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/runtime-workspace/PRICING_APPLICATIONS.md)
- [Merchant incident desk](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf74-merchant-support-console/INCIDENT_SOURCES.md)
- [Supplier costs, pricing decisions and receiving](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/merchant-economics/OPERATING.md)
- [QuickBooks and Xero operations](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar-forge/mcp-merchant-operator/ACCOUNTING-PLATFORMS-CLIENT.md)

Installed archives retain these guides under `source/` with the same relative
paths. The package manifest records the selected source revision and original
file identities.

Copyright TokenJunkieLabs. The product retains its MIT license and the applicable
third-party license files.
