# Product source selections

The original distribution builder can package a complete product from the same
Git commit as the full toolkit. A committed recipe chooses base registrations,
whole source-owned contributions, component directories and explicit support
files. The existing Git reader, source manifest, runtime profile, installer,
Applications launcher and recovery commands remain the distribution workflow.

## Build through the runtime workspace

The private runtime workspace's **Build a product** view discovers the recipes
at the chosen commit, reviews the complete selected product, builds its original
package, and opens the resulting archive in **Source & profile**. It retains the
same request and output through interruption and provides the original package
download. Follow [the complete browser and CLI workflow](runtime-workspace/SOURCE_BUILDS.md)
for source selection, adapter installation and recovery.

## Build a product

Run the maintained builder from a repository that contains the selected commit:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref ORIGINAL_COMMIT \
  --selection water-operations --out /absolute/water-release

node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref ORIGINAL_COMMIT \
  --selection woo-merchant --out /absolute/woo-release

node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref ORIGINAL_COMMIT \
  --selection grant-reviewer --out /absolute/grant-reviewer-release
```

Use any selection ID from the table below in the same build command and give
that product its own output directory.

Replace `ORIGINAL_COMMIT` with the full original commit SHA. Each output directory
belongs to one source commit and selection. The packaged receipt names the
archive, SHA-256, installed/source bytes, source acquisition and materialization.
The manifest adds `sourceSelection`: original recipe ID, title, path, Git blob,
SHA-256 and byte length. Its recipe also appears in the normal file inventory
and `distributionInputs`.

The package version includes both the commit and selection, for example
`0.1.0-source.g0123456789ab.selection.water-operations`. The full package retains
the original `0.1.0-source.g0123456789ab` version form.

| Selection | Product | Original Applications | Complete installed workflow |
| --- | --- | --- | --- |
| `study-research` | Study source editions, Property field surveys and comparables, Census ACS, BLS labor and HUD releases with original publishing and complete customer receiving | Study Source Refresh; Buyer runbook; Merchant console; PostgreSQL publisher; PostgreSQL workspace | [Complete study operator and receiving guide](selections/STUDY_RESEARCH.md) |
| `merchant-support` | Merchant cases and incidents, implementation and source editions, service commitments, quotations and complete customer packages | Merchant support; Runtime management; original merchant agent | [Complete installation, receiving and handover](../../../products/merchant-support/RECEIVING.md) |
| `healthcare-interoperability` | Original FHIR exports and eLTSS CarePlans, full source/field review, native merchant/customer editions and complete editable receiving | FHIR Bulk Data; eLTSS Care Plans; Runtime management | [Complete installed operation and receiving](../../../products/healthcare-interoperability/OPERATING.md) |
| `matomo` | Complete Matomo report/subtable source, typed editions, original merchant/customer operation and independent editable workspace receiving | Matomo reports and delivery; Runtime management | [Complete operating guide](../../../products/matomo/OPERATING.md) |
| `buyer-expenses` | Original governed purchase, shared-ledger source review, exact allocations, issued periods and accountant return | Buyer expenses; Accounting; Runtime management | [Complete installed operation and receiving](../../../products/buyer-expenses/OPERATING.md) |
| `dbnomics` | Exact economic series and source revisions, saved analyst reports, native publication, complete editable workspace and customer receiving | DBnomics economic workspace; Runtime management | [Operating guide](../../../products/dbnomics/OPERATING.md) |
| `worldbank` | Official World Bank source editions, reviewed dataset service, reports, workbooks and complete customer receiving | World Bank agent; Runtime management | [Product and receiving guide](../../../products/worldbank/RECEIVING.md) |
| `coingecko` | Original CoinGecko source editions, reviewed queries and reports, native merchant operation, complete customer files and independent receiving | CoinGecko workspace; Runtime management | [Operating and receiving guide](../../../products/coingecko/OPERATING.md) |
| `coastal-operations` | Original NOAA editions, reviewed multi-station studies, complete model-input/source delivery, returned-file comparison, coastal workbooks and native customer files | Coastal source operations; Runtime management | [Operating guide](../../../products/coops/OPERATING.md) |
| `baserow-rails` | Original Baserow source editions, complete customer rows and attachments, Ruby receiving and transactional Rails applications | Baserow source authoring; Runtime management | [Complete installation and receiving](../../../products/baserow-rails/RECEIVING.md) |
| `research-workspace` | Research questions, original Documents and managed Pipelines, source review, merchant operation and complete customer files | Research dossiers; Runtime management | [Operating and receiving guide](../../../products/research/RECEIVING.md) |
| `webdav-operator` | WebDAV or Nextcloud file editions, native merchant and customer, complete remote operator and source receiving | WebDAV source and merchant workspace; Runtime management | [Operating guide](../../../products/webdav/OPERATING.md) |
| `eurostat` | Eurostat official source editions, exact economic reports, native publication and complete customer receiving | Eurostat economic editions; Runtime management | [Operating guide](../../../products/eurostat/OPERATING.md) |
| `openapi-merchant` | Captured API, OpenAPI/Postman authoring, reusable policies, persistent workflows, native releases and complete customer receiving | Captured API, OpenAPI, merchant console | [Operating guide](../../../products/captured-api/OPERATING.md) |
| `huwise` | Huwise source review, tenant ingestion and native publication, merchant and complete customer receiving | Runtime management; original Huwise browser and merchant agent | [Operating guide](../../../products/huwise/OPERATING.md) |
| `water-operations` | USGS observations, editions, Water workspace, merchant and complete customer files | Water, Buyer, merchant console | [Operating guide](selections/WATER_OPERATIONS.md) |
| `woo-merchant` | Existing WooCommerce orders, native checkout, Operations, purchased files and refunds | WooCommerce, Buyer, merchant console | [Operating guide](selections/WOO_MERCHANT.md) |
| `grant-reviewer` | Retained purchase/source review, complete native Buyer results and closed receiving handover | Grant purchase reviewer | [Operating guide](selections/GRANT_REVIEWER.md) |
| `redis-applications` | Redis/Valkey commissioning, native products, customer clients, complete exports and cutover comparison | Redis, Buyer, merchant console | [Operating guide](selections/REDIS_APPLICATIONS.md) |
| `grpc-merchant` | Native gRPC contracts, reflection, message streams, merchant releases, contract upgrades and retained service health | gRPC merchant product; original gRPC authoring | [Operating and receiving guide](selections/GRPC_MERCHANT.md) |
| `publisher-360giving` | Complete 360Giving publisher source/reviews, native grant datasets, typed SDK/merchant operation and complete customer receiving | 360Giving publisher workspace; Runtime management | [Operating guide](../../../products/360giving-publisher/OPERATING.md) |
| `grant-portfolio` | Original IATI and 360Giving editions, portfolio reconciliation, source-linked decisions, native customer files and workspace recovery | Grant portfolio reconciliation; Runtime management | [Operating and receiving guide](../../../products/grant-portfolio/OPERATING.md) |
| `laboratory-edd` | Complete EQuIS/DTS8D source review, native reissue and cross-profile correspondence | Laboratory EDD; paid-job merchant; Job checkout; Job result receiver | [Operating guide](selections/LABORATORY_EDD.md) |
| `mssql` | SQL Server catalog and typed queries, retained sellers, merchant tools and complete customer/merchant receiving | SQL Server data products; merchant console | [Installed product and operating guide](../../../products/mssql/README.md) |
| `accountant-portfolio` | Client procedures, exact close files, preparation/review, named backup handovers, staff capacity, native accounting and complete portfolio receiving | Client runbooks; Client portfolio; Merchant accounting; Cryptoworth accounting | [Complete installation and receiving](../../../products/accountant-portfolio/README.md) |
| `merchant-economics` | Supplier sources, exact graduated and volume tariffs, original scenarios and pricing, complete workspace receiving and seller releases | Merchant pricing and scenario planning; API merchant; Runtime management | [Complete installed workflow](../../../products/merchant-economics/OPERATING.md) |
| `all` or no flag on a new build | Complete maintained toolkit | All registered applications | [Runtime installation](RUNTIME_INSTALL.md) |

Use the product's installed `starforge --help` and `starforge registrations`
for its included commands. Selected packages expose their explicit named package
exports; the full toolkit's broad root `index.mjs` is excluded. This prevents
its unrelated re-exports from forcing every product into a selected package.
The original modules, their exports and implementations are unchanged.

For Huwise, use `--selection huwise` and the [complete operating guide](../../../products/huwise/OPERATING.md). Its selected source retains the full tenant Automation API, all Huwise merchant actions, native publisher and buyer, browser assets, and upstream license.

For Eurostat, use `--selection eurostat` and the [complete operating guide](../../../products/eurostat/OPERATING.md). Its selected source includes the original economic workspace, retained official responses and reviewed queries, full reports, browser and typed client, all 26 Eurostat MCP tools, native publication, merchant releases and complete customer receiving.

For Research, use `--selection research-workspace` and the [complete receiving guide](../../../products/research/RECEIVING.md). The selected source keeps the original Documents and managed Pipelines operations, source-linked dossier review, complete file exports, authenticated client and merchant tools, and the existing Research Applications entry.

For WebDAV, use `--selection webdav-operator` and the [complete operating guide](../../../products/webdav/OPERATING.md). The selected source includes the original source browser and managed Applications, full typed client and reviewed operations, complete export/source-packet transfers, native publisher, release and buyer, and the installed `merchant-webdav-edition` workflow.

For Baserow and Rails, use `--selection baserow-rails` and the [complete operating guide](../../../products/baserow-rails/OPERATING.md). The selected source retains the original Baserow source/browser/publisher, native SF100 and Python receiving, complete Ruby client, all Rails importer/operator files and templates, and exact customer/application receiving. The installed `baserow-rails` command opens these original entrypoints with the selected host interpreter and private workspace.

For Coastal source operations, use `--selection coastal-operations` and the [complete operating guide](../../../products/coops/OPERATING.md). The selected source includes original station and archive operations, saved receiving mappings, reviewed multi-station studies, complete model-input/source deliveries and returned-file comparisons, full offline analytical workbooks, exact reviewed study CSVs in native query and releases, all 49 coastal merchant tools and complete customer receiving.

For World Bank, use `--selection worldbank` and the [complete product guide](../../../products/worldbank/README.md). Its source and managed merchant workflow continue into exact typed Analysis, published reports, Excel and a reopened customer workspace. The receiving command binds the installed manifest and reuses the original economic edition. Its complete native profile is `--native --feature schema --feature openapi --feature mcp --operator`, plus the original Python workbook extra.

For DBnomics economic work, use `--selection dbnomics` and the [complete operating guide](../../../products/dbnomics/OPERATING.md). The original application retains official provider responses, native periods and values, saved analyst reports, reviewed publication, complete editable exports and customer files.

For CoinGecko, use `--selection coingecko` and the [complete operating guide](../../../products/coingecko/OPERATING.md). The selected source retains the original provider and request contracts, complete source and operator workspace, browser assets, native merchant and governed buyer, all CoinGecko MCP tools, Applications provider, and the original installed and managed receiving programs. The `coingecko-product` command delegates to those original operations and receives complete customer deliveries through the product's [receiving guide](../../../products/coingecko/RECEIVING.md). Its full source includes the selected recipe, contribution, CLI, delivery module and all product guides from the same commit. The complete product profile is `--native --feature schema --feature openapi --feature mcp --operator`; an earlier runtime or source archive retains its own original profile and source identity. Receive the newly selected package through the maintained installer or its supported existing-dependency adoption, then inspect that exact runtime before opening its original application.

## Continue the same build

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --out /absolute/water-release --resume
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --out /absolute/water-release --status
```

An omitted selection on resume inherits the saved selection. An explicit
different selection, including `--selection all` for a selected output, returns
`DISTRIBUTION_SOURCE_SELECTION_CONFLICT`. Use a new output for a different
product. A completed build returns its original verified archive without another
pack. The retained source commit, original output lock and partial-file recovery
retain their existing behavior.

For offline builds add `--offline` after the original source objects have been
acquired in that repository. Recipes and selected contributions are read in
small batches before product sources; unselected contribution JSON does not
travel in the selected archive.

## Install and operate the original product

Use the returned archive path and SHA-256 with the original installer. Select
its dependency profile from the complete installed workflow linked above:

| Selected product | Profile flags for the complete installed edition |
| --- | --- |
| `study-research` | `--native --feature schema --feature openapi --feature mcp --feature postgres --operator` |
| `webdav-operator` | `--native --feature schema --feature openapi --feature mcp --operator` |
| `openapi-merchant`, `huwise`, `water-operations`, `woo-merchant`, `eurostat`, `research-workspace`, `baserow-rails`, `coastal-operations`, `dbnomics`, `coingecko` | `--native --feature schema --feature openapi --feature mcp --operator` |
| `redis-applications` | `--native --feature redis --feature schema --feature openapi --feature mcp --operator` |
| `grpc-merchant` | `--native --feature grpc --feature schema --feature openapi --feature mcp --operator` |
| `mssql` | `--native --feature mssql --feature mcp --operator` |
| `grant-reviewer` | `--native --feature mcp --operator` |
| `publisher-360giving` | `--feature mcp --operator` |
| `grant-portfolio` | `--feature mcp --operator` |

The following example uses the common merchant profile. Substitute the flags
from the product's row and keep that product's original runtime directory.
The selected recipe and its contribution declarations determine the available
dependency groups; the installer resolves the actual profile and lock.

```sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/customer-runtime --archive /absolute/product-release/ORIGINAL.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 --native \
  --feature schema --feature openapi --feature mcp --operator
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/customer-runtime
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/customer-runtime --load --source
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/customer-runtime -- source
```

The selected archive supplies its own contribution and recipe inputs to the
runtime profile. Exact dependency selection, npm cache use, native probes, READY
state, retained lock, offline transfer and installation recovery remain the
existing installer operations. An existing complete dependency tree can be
received through the maintained `--adopt-existing` option; it must satisfy the
selected original profile and retained lock.

Register that READY runtime in the original Runtime workspace, then use its
Applications tab to review, save, start, open, stop and reopen the product's
existing application. Installed source is separate from the existing customer
project, WordPress site, merchant state, outbox, buyer operation and downloaded
files. Use those original paths and operation identities through upgrades.

## Maintain a recipe

Recipes live in `distribution/selections/ID.json` and use schema
`stellar-forge.distribution-source-selection.v1`. The filename must match the ID.
`base.commands` and `base.exports` explicitly name existing base declarations;
`base.features` names the original feature or package-manifest groups.
`base.applicationProviders` and `base.merchantProviders` name base providers
when the base declares any. `base.browserAssets` selects an existing base browser
server and its original mapping manifest.

`contributions` selects complete existing contribution IDs. The builder composes
them after base selection; a conflict between included owners remains an error.
Unselected contributions do not participate. Their source ownership, command
descriptions, providers, dependencies, browser assets and support files remain
the original contribution's declarations.

`components` selects complete original directory roots; `supportFiles` selects
explicit original files. Optional `excludeFiles` adds exact file exclusions to
the original base exclusions. A required command, export, provider, runtime
manifest or static import cannot be excluded successfully. The optional
`product` object selects existing source README/bin and product metadata through
the maintained product-package contract. When that object omits `repository`,
the selected product inherits only `base.product.repository` when present.
An explicit recipe repository remains authoritative. README and executable
selection continue to use the recipe and the original product-package defaults;
unrelated base executables are not inherited. If the base has no repository
override, the maintained package default remains in effect. This keeps a
standalone product's source identity without bringing other products' bins
into its selected archive.

Required command and export targets, selected provider modules, runtime package
manifests, and browser server/manifests are retained as explicit runtime seeds.
The original static ESM and browser-map closure then includes their dependencies.
Complete component directories retain Python modules, template files, generated
plugin inputs, browser resources and other paths loaded dynamically. A new
product recipe therefore needs its original operational receiving journey,
including restart and downloaded files, as well as a successful build. Static
module closure cannot prove that a dynamically constructed pathname is present.

Installed declaration reading checks the original recipe and every contribution
against the retained file inventory. A runtime cannot switch recipes or add an
unselected registration file inside an existing selected package.

## Receiving and measurements

Build the selected products from the same original commit as a full release.
Compare the receipt's `sourceFiles`, `sourceBytes`, `archiveBytes`,
`installedBytes` and acquisition metrics. Report actual measured results with
that commit; the command/provider counts alone are not a size or memory measure.

Receive each archive through the original unpacker and runtime profile. Confirm
that Applications and merchant provider catalogs contain its selected entries,
that installed command help matches its registrations, and that the original
product can complete its saved native journey. Reopen the same output with
`--resume`, and confirm an explicit different selection cannot reuse it.
