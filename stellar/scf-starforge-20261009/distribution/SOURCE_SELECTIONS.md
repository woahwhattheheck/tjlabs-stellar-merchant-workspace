# Product source selections

The original distribution builder can package a complete product from the same
Git commit as the full toolkit. A committed recipe chooses base registrations,
whole source-owned contributions, component directories and explicit support
files. The existing Git reader, source manifest, runtime profile, installer,
Applications launcher and recovery commands remain the distribution workflow.

## Complete runtime and browser source

Selecting the original merchant HTTP host also selects its complete operator
console. This applies when the host's original `serve.mjs` is named by a base
command, package export, support file or component, or by a selected source
contribution. Conditional package exports use the same rule. The host's
`--operator-console-dir` option dynamically loads this console; static Node
import discovery alone cannot find it.

The shared selector retains the original console and developer SDK components,
requires the console's original `service.mjs`, and carries its maintained browser
route manifest.
The builder then follows those original static imports and mapped browser
assets to complete the source closure. The host's imported developer client
generator also reads three maintained source bodies at module load, rather
than importing them: `developer/client-runtime.mjs`, `developer/request.mjs`
and `query-parameters.mjs` in the original SF30 SDK. The shared selector carries
these exact runtime inputs as explicit support files, together with the original
seller developer portal's `developer/index.html`, `developer/browser.mjs` and
`developer/style.css` bodies. This keeps the configured source/release path
available when it loads the seller portal. Each resulting source file keeps its
original Git blob, SHA-256 and byte count in the package manifest. Recipes
without that original HTTP host receive no extra console capability from this
rule. The recipe's selected commands, exports, providers, dependency groups
and runtime profile remain its original choices.

The current Research HTTP host's accounting and commerce source graph imports
SF86's `terms.mjs`, which reads its unchanged public `networks.json` at module
load. The same common declared host closure carries that catalog as an explicit
runtime support file. It stays at its original repository path and retains its
exact Git blob, SHA-256 and byte count. This completes the original installed
Research constructor before it opens a dossier, Zotero bridge or listener;
ordinary static ESM discovery alone cannot find this filesystem read.

A source selection that explicitly excludes a required console/runtime input or
mapped source still fails the existing packaged-entry/import checks. Use a
separate product selection when omitting the HTTP host; an incomplete declared
host cannot be repaired by removing its runtime checks. Existing archived
packages retain their original selected source. To receive this correction,
build a new output from the correction's complete source commit, install or
receive that package through the maintained runtime workflow, and inspect its
own manifest before opening the merchant host.

A selected component carries the maintained browser route maps for its included
HTTP servers. The builder uses the same JSON manifests as those servers, so a
browser import such as `./operations.mjs` resolves through its served URL to
the original shared module. Console, job intake and job resolution maps are
included when their original server components are selected. Every map and
mapped file appears in the package's ordinary source manifest.

Whole SF88 components also carry the original Research customer quotations
server and its source-owned route map. That map serves the shared Commercial
desk's receiving, tariff and performance modules at their original browser
import URLs. A selected product therefore receives the full shared desk source
even when it does not register the separate Research commands. Its command and
runtime choices remain the recipe's own declarations.

Static Node imports continue to use normalized repository paths. If an
imported production helper has an acceptance-like filename, its explicit
declaration in the original base support inventory permits that exact file.
The builder adds it only when a selected module imports it. Original file and
directory exclusions still apply to imported modules and browser assets.

These source dependencies leave the recipe's command, package-export, provider
and runtime-feature choices intact. Explicitly selecting an excluded browser
server remains an invalid package and reports the missing packaged entry.

## Explicit original support files

An explicit `supportFiles` entry selects that exact original file, including its
original format. The terminal extension heuristic applies to automatic component
expansion; it cannot silently remove a validated explicit declaration. Publisher
TeX, R/Rd, lock files, original notices and other declared formats therefore
remain in the selected package without making those formats automatic matches.

The existing path checks, hidden and excluded directory rules, limited fixture
data exception, exact `excludeFiles`, regular Git blob requirements, hashes and
byte limits still apply. Required selected files continue to be checked against
the resulting package manifest. An excluded or unavailable required file remains
an error.

The complete [Groundwater installation and independent receiving workflow](receiving/GROUNDWATER.md)
uses the existing `groundwater-reports` recipe and Runtime Workspace. It builds
the reviewed source, installs the original dependency profile, transfers the
complete lock-bound package and dependency parts, and reopens the independently
received runtime. Its source contract checks all 64 scientific files in both
installations; the original scientific operation retains its own model inputs,
runs, reports and portal receiving.

## Original JSON source format

An upstream serialized JSON reference can retain its original `.js` name.
Declare its exact original path as `"json"` in the optional `sourceFormats` map
on its contribution, the base specification or the recipe. The Zotero
contribution owns the original `zotero/reference/zotero/itemJSON.js` declaration;
Research and Zotero recipes inherit it by selecting that contribution. Base
format declarations are retained only for source selected by the recipe, while
each selected contribution and recipe carries its own complete format map.

The declaration explicitly selects that original file. The builder parses
strict UTF-8 JSON, keeps the exact bytes and records the format in the ordinary
source manifest and registration provenance. Explicit exclusions and original
file, directory, Git and byte checks remain in force. It rejects a missing
source, invalid JSON, executable registration or static executable import to
declared JSON. A JSON source cannot be a `moduleTemplates` entry; JavaScript
template syntax remains independently validated. See [the complete format and
installed receiving contract](BUILDING.md#original-json-source-data).

Installed packages recompose their retained declarations, compare the declared
formats with `manifest.sourceFormats`, verify each complete data file against
its manifest hash and parse it again. The CLI's `source` view includes that same
manifest, and `registrations --source zotero` shows the original format owner.
No new command, runtime feature, dependency version or product entry is implied
by a source format declaration.

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
| `buyer-task-desk` | Original Inbox tasks, saved RPC read selections, complete responses and reviewed customer/source delivery | Inbox tasks; Runtime management; Merchant tools | [Complete installation, original-root launch and customer receiving](../sf88-operator-buyer-cli/node/agents/task-desk/INSTALLATION.md) |
| `tind-migration` | Original OAI editions, native TIND MARCXML and file receiving, staff metadata reconciliation, complete editable migration handover | TIND scholarly migration; OAI repository workspace; Runtime management | [Complete installation and operation](../../../products/tind/OPERATING.md) |
| `haystack-turnover` | Native building grids, source-local equipment and points, typed tag review, saved editions and complete editable turnover receiving | Haystack building turnover; Runtime management | [Complete installed operator guide](../../../products/haystack/OPERATING.md) |
| `groundwater-reports` | Original groundwater sources, scenarios and native results, frozen report publication, buyer receiving, Operations association and complete scientific/desk handover | Groundwater scientific and Report Desk browsers; Buyer runbook; Merchant console | [Complete installation and operation](../../../products/groundwater/OPERATING.md) |
| `source-tables` | Complete CSV and TSV source authoring, typed field meaning, retained editions and comparisons, native merchant resources and editable customer handover | Source Tables; Runtime management | [Complete installation and operation](../../../products/source-tables/OPERATING.md) |
| `openlineage-operations` | Native Python and Java producer intake, original compressed/source bytes, job/run/dataset lineage, saved reviews and complete editable customer receiving | OpenLineage operations; Runtime management | [Complete installed operation and producer guide](../../../products/openlineage/OPERATING.md) |
| `study-research` | Study source editions, Property field surveys and comparables, Census ACS, BLS labor and HUD releases with original publishing and complete customer receiving | Study Source Refresh; Buyer runbook; Merchant console; PostgreSQL publisher; PostgreSQL workspace | [Complete study operator and receiving guide](selections/STUDY_RESEARCH.md) |
| `merchant-support` | Merchant cases, tariff and usage-informed quotations, accepted work, invoicing, recurring service calendars, payments, Service adjustments and complete customer receiving | Merchant support; Merchant pricing and scenario planning; Merchant receivables; Service agreements and billing; Customer payment plans; customer statement closing | [Complete installation, receiving and handover](../../../products/merchant-support/RECEIVING.md) |
| `healthcare-interoperability` | Original FHIR exports and eLTSS CarePlans, full source/field review, native merchant/customer editions and complete editable receiving | FHIR Bulk Data; eLTSS Care Plans; Runtime management | [Complete installed operation and receiving](../../../products/healthcare-interoperability/OPERATING.md) |
| `gravity-referrals` | Original Gravity source, topology, complete requirement/field review, Task editions, conditional exchange, native merchant/customer delivery and editable receiving | Gravity Referrals; FHIR Bulk Data; eLTSS Care Plans; Runtime management | [Complete programme and receiving](../../../products/gravity-referrals/OPERATING.md) |
| `human-services-directory` | Original HSDS and FHIR directory sources, complete editions and comparisons, reviewed mapping and service selection, Gravity clinical joins and editable customer handoffs | Human Services Directory; Gravity Referrals; FHIR Bulk Data; eLTSS Care Plans; Runtime management | [Complete directory programme and receiving](../../../products/human-services-directory/OPERATING.md) |
| `matomo` | Complete Matomo report/subtable source, typed editions, original merchant/customer operation and independent editable workspace receiving | Matomo reports and delivery; Runtime management | [Complete operating guide](../../../products/matomo/OPERATING.md) |
| `buyer-expenses` | Original governed purchase, shared-ledger source review, exact allocations, issued periods and accountant return | Buyer expenses; Accounting; Runtime management | [Complete installed operation and receiving](../../../products/buyer-expenses/OPERATING.md) |
| `fiscaldata-analyst` | Treasury source capture and review, exact native editions/comparison, saved refresh plans, named MCP/browser and complete customer receiving | Fiscal Data operations; Runtime management | [Complete analyst installation](selections/FISCALDATA_ANALYST.md) |
| `dbnomics` | Exact economic series and source revisions, saved analyst reports, native publication, complete editable workspace and customer receiving | DBnomics economic workspace; Runtime management | [Operating guide](../../../products/dbnomics/OPERATING.md) |
| `worldbank` | Official World Bank source editions, reviewed dataset service, reports, workbooks and complete customer receiving | World Bank agent; Runtime management | [Product and receiving guide](../../../products/worldbank/RECEIVING.md) |
| `coingecko` | Original CoinGecko source editions, reviewed queries and reports, native merchant operation, complete customer files and independent receiving | CoinGecko workspace; Runtime management | [Operating and receiving guide](../../../products/coingecko/OPERATING.md) |
| `coastal-operations` | Original NOAA editions, reviewed multi-station studies, complete model-input/source delivery, returned-file comparison, coastal workbooks and native customer files | Coastal source operations; Runtime management | [Operating guide](../../../products/coops/OPERATING.md) |
| `baserow-rails` | Original Baserow source editions, complete customer rows and attachments, Ruby receiving and transactional Rails applications | Baserow source authoring; Runtime management | [Complete installation and receiving](../../../products/baserow-rails/RECEIVING.md) |
| `research-workspace` | Research questions, original Documents and managed Pipelines, source review, merchant operation and complete customer files | Research dossiers; Runtime management | [Operating and receiving guide](../../../products/research/RECEIVING.md) |
| `webdav-operator` | WebDAV or Nextcloud file editions, native merchant and customer, complete remote operator and source receiving | WebDAV source and merchant workspace; Runtime management | [Operating guide](../../../products/webdav/OPERATING.md) |
| `eurostat` | Eurostat official source editions, exact economic reports, native publication and complete customer receiving | Eurostat economic editions; Runtime management | [Operating guide](../../../products/eurostat/OPERATING.md) |
| `openapi-merchant` | Captured API, OpenAPI/Postman authoring, reusable policies, persistent workflows, native releases and complete customer receiving | Captured API, OpenAPI, merchant console | [Operating guide](../../../products/captured-api/OPERATING.md) |
| `opencage` | Original geocoding and CSV review, merchant releases, host preparation and complete customer/accounting receiving | OpenCage geocoding; Runtime management | [Operating guide](../../../products/opencage/OPERATING.md) and [receiving guide](../../../products/opencage/RECEIVING.md) |
| `huwise` | Huwise source review, tenant ingestion and native publication, merchant and complete customer receiving | Runtime management; original Huwise browser and merchant agent | [Operating guide](../../../products/huwise/OPERATING.md) |
| `water-operations` | USGS observations, editions, Water workspace, merchant and complete customer files | Water, Buyer, merchant console | [Operating guide](selections/WATER_OPERATIONS.md) |
| `woo-merchant` | Existing WooCommerce orders, native checkout, Operations, purchased files and refunds | WooCommerce, Buyer, merchant console | [Operating guide](selections/WOO_MERCHANT.md) |
| `grant-reviewer` | Retained purchase/source review, complete native Buyer results and closed receiving handover | Grant purchase reviewer | [Operating guide](selections/GRANT_REVIEWER.md) |
| `redis-applications` | Redis/Valkey commissioning, native products, customer clients, complete exports and cutover comparison | Redis, Buyer, merchant console | [Operating guide](selections/REDIS_APPLICATIONS.md) |
| `grpc-merchant` | Native gRPC contracts, reflection, message streams, merchant releases, contract upgrades and retained service health | gRPC merchant product; original gRPC authoring | [Operating and receiving guide](selections/GRPC_MERCHANT.md) |
| `publisher-360giving` | Complete 360Giving publisher source/reviews, native grant datasets, typed SDK/merchant operation and complete customer receiving | 360Giving publisher workspace; Runtime management | [Operating guide](../../../products/360giving-publisher/OPERATING.md) |
| `grant-portfolio` | Original IATI and 360Giving editions, portfolio reconciliation, source-linked decisions, native customer files and workspace recovery | Grant portfolio reconciliation; Runtime management | [Operating and receiving guide](../../../products/grant-portfolio/OPERATING.md) |
| `laboratory-edd` | Complete EQuIS/DTS8D source review, native reissue and cross-profile correspondence | Laboratory EDD; paid-job merchant; Job checkout; Job result receiver | [Operating guide](selections/LABORATORY_EDD.md) |
| `ckan-merchant` | Complete CKAN capture and source meanings, reviewed successor publication, browser/MCP and whole customer workspace receiving | CKAN data merchant; Dataset publisher; Dataset buyer; Python; Runtime management | [Complete operating and receiving guide](../../../products/ckan/OPERATING.md) |
| `mssql` | SQL Server catalog and typed queries, retained sellers, merchant tools and complete customer/merchant receiving | SQL Server data products; merchant console | [Installed product and operating guide](../../../products/mssql/README.md) |
| `accountant-portfolio` | Client procedures, exact close files, preparation/review, named backup handovers, staff capacity, native accounting and complete portfolio receiving | Client runbooks; Client portfolio; Merchant accounting; Cryptoworth accounting | [Complete installation and receiving](../../../products/accountant-portfolio/README.md) |
| `merchant-economics` | Supplier sources, tariffs and recorded usage through accepted quotations, invoices, recurring service billing, customer payments, full receiving and seller releases | Merchant pricing and scenario planning; Merchant support; Merchant receivables; Service agreements and billing; Customer payment plans; customer statement closing | [Complete installed workflow](../../../products/merchant-economics/OPERATING.md) |
| `merchant-receivables` | Original service quotations, issued invoices, payments, credits, retained installment schedules, dated collections and complete customer accounts | Merchant receivables; Customer payment plans; Merchant accounting; Merchant support | [Complete installed operation](../../../products/merchant-receivables/README.md) |
| `merchant-payment-plans` | Reviewed customer installments, dated collection desk, retained schedule editions and original invoice, payment and credit operation | Customer payment plans; Merchant receivables; Merchant accounting; Merchant support | [Complete installation and collection workflow](../../../products/merchant-payment-plans/README.md) |
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

For OpenLineage, use `--selection openlineage-operations` and the [complete operating guide](../../../products/openlineage/OPERATING.md). The selected source includes the original lineage workspace, Python and Java producer configuration, gzip intake with original source identities, browser and typed client, direct MCP and managed merchant tools, complete reports, and independent receiving of the editable application and workspace. The maintained merchant profile is `--native --feature schema --feature openapi --feature mcp --operator`.

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
| `haystack-turnover` | `--operator`; install the selected product with `--offline` |
| `merchant-receivables`, `merchant-payment-plans` | `--native --feature schema --feature openapi --operator` |
| `study-research` | `--native --feature schema --feature openapi --feature mcp --feature postgres --operator` |
| `webdav-operator` | `--native --feature schema --feature openapi --feature mcp --operator` |
| `opencage`, `openapi-merchant`, `huwise`, `water-operations`, `woo-merchant`, `eurostat`, `research-workspace`, `baserow-rails`, `coastal-operations`, `dbnomics`, `coingecko` | `--native --feature schema --feature openapi --feature mcp --operator` |
| `redis-applications` | `--native --feature redis --feature schema --feature openapi --feature mcp --operator` |
| `grpc-merchant` | `--native --feature grpc --feature schema --feature openapi --feature mcp --operator` |
| `mssql` | `--native --feature mssql --feature mcp --operator` |
| `grant-reviewer` | `--native --feature mcp --operator` |
| `fiscaldata-analyst` | `--operator` (original named HTTP transport; analyst operation needs no payer or MCP SDK) |
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

## Recorded usage and customer pricing revisions

The `merchant-performance` contribution selects the original SF97 recorded-usage workspace, complete portable source, native proposal workflow, browser, typed HTTP client and direct operator. Both `merchant-economics` and `merchant-support` retain this contribution alongside `merchant-tariffs`, the original Pricing provider, and the complete Commercial contribution.

The installed command is `merchant-performance`. Its original source is `stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/performance/cli.mjs`. It opens the original Pricing and Tariff owners with the same private state directory and saved source settings. The existing `revenue-workspace` launcher and managed Pricing Application retain their original owner and expose the same Performance page.

| Source-owned export | Original member |
| --- | --- |
| `./merchant/performance` | `performance/model.mjs` |
| `./merchant/performance-source` | `performance/source.mjs` |
| `./merchant/performance-workspace` | `performance/workspace.mjs` |
| `./merchant/performance-client` | Conditional `client.d.mts` and `client.mjs` |
| `./merchant/performance-server` | `performance/server.mjs` |
| `./merchant/performance-cli` | `performance/cli.mjs` |

The maintained `merchant-commercial` contribution also includes the original customer performance source, typed Commercial client and quote desk exports. `merchant-commercial performance` receives a complete recorded comparison into the existing case and prepares an ordinary quote revision with an explicit monthly request volume. The original quotation, customer-response, accepted-implementation and complete receiving owners continue that draft.

The original Pricing MCP provider exposes the sixteen Performance methods through its existing `pricing` registration. The original Support provider exposes the Commercial source review, receiving, revision and full-file operations. These selections preserve both providers and the original retained file downloader.

The selected source includes the complete `sf97-merchant-revenue-ops`, `sf74-merchant-support-console` and `merchant-settlement-accounting` components. The service-period path imports the original `customer-statements/core.mjs`, `period-usage.mjs` and `native-usage.mjs`, with their original accounting dependencies. The original builder closes the source graph and includes the Performance browser assets, declaration files and complete operating guides.

A saved Performance source retains its original Pricing version files, selected tariff portfolio, scenario plans, optional complete cost edition and paired service source. Its 48 MiB portable envelope can be inspected, retained and carried through Commercial material. Complete native receiving uses a new original Pricing `WORKSPACE_BACKUP` captured after the review and proposal operations, plus the full tariff portfolio. The backup retains the performance records, service sources and original proposal/selection journals. Restore it through the existing receiver, receive the portfolio through the original Tariff owner, then reopen Performance and continue its exact saved request UUIDs.

Detailed operator contracts:

- [Performance review, service capture, source transfer and native proposals](../sf97-merchant-revenue-ops/performance/README.md)
- [Commercial performance material and customer quote revisions](../sf74-merchant-support-console/commercial/PERFORMANCE.md)
- [Complete merchant economics operation](../../../products/merchant-economics/OPERATING.md)
- [Complete Merchant support product](../../../products/merchant-support/README.md)

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

## Flowable process operations and customer receiving

Use [flowable-merchant.json](selections/flowable-merchant.json) to compose the
complete installed Flowable workspace, native process source, typed client,
Applications integration and merchant MCP provider. The original process
engine handles deployment, human tasks, native migration validation and
execution; the saved workspace retains complete request and source/history
receiving.

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --ref FULL_ORIGINAL_COMMIT --selection flowable-merchant \
  --out /absolute/flowable-release --offline
~~~

Follow [FLOWABLE_MERCHANT.md](selections/FLOWABLE_MERCHANT.md) for the complete
build/install/Open workflow, actual engine receiving and customer handover.
The recipe includes the source-owned `flowable-workspaces`,
`merchant-provider-flowable-workspaces` and `flowable-product`
contributions, the original browser assets and complete installed guides.

## Accepted quotations, invoices and recurring service billing

The `merchant-economics` and `merchant-support` recipes include the original `merchant-receivables`, `merchant-service-agreements`, `merchant-payment-plans`, `receivables-agent` and `customer-closing` contributions. Their existing commands, typed exports, managed Applications and browser manifests travel with the selected Pricing/Performance/Commercial source.

Both recipes retain the original `accounting` merchant provider. The accounting and receivables-agent declarations select the same maintained provider path, so the original composer keeps one provider and records both source owners. The existing service-agreement provider continues to operate its original accounting workspace.

The quote importer preserves the selected tariff and complete recorded-usage binding against the accepted revised quote. Invoice and service-calendar views show the historical measurement, proposed monthly quantity and accepted billable amount separately. All original payment, refund, paid-credit, installment and statement-closing source remains selected.

The original builder includes each financial server's declared browser manifest, all mapped source files, their static imports, declaration files and full operator guides. The same source selection retains the financial initialization/recovery commands and existing accounting source dependencies.

- [Merchant economics through accepted customer billing](../../../products/merchant-economics/OPERATING.md)
- [Invoices, payments and refunds](../../../products/merchant-receivables/README.md)
- [Service agreements and recurring billing](../../../products/merchant-service-agreements/README.md)

## Haystack building turnover

Build `--selection haystack-turnover` to retain the native grid codec, source-local
equipment and point index, reviewed tag proposals, saved source editions, full
reports and complete editable receiving application. The selected
`haystack-workspace` contribution supplies the `haystack` and `haystack-mcp`
commands, typed native exports, original browser route map, managed Applications
entry and `haystack-workspaces` Merchant provider.

The complete source component includes the original Charlie grid, its source
metadata, the upstream license, operator guides and `RECEIVING.mjs`. The
application, managed Applications lifecycle and registered Haystack Merchant
provider use Node builtins and the maintained local helpers. Select `--operator`
through the original runtime installer for this dependency-free product. The
complete operator guide describes separately selected wider host integrations.

Continue the [complete native operator and receiving workflow](../../../products/haystack/OPERATING.md)
against the same saved building project. A customer package retains every
source byte, proposal and review, saved edition, original request outcome and
portable application file; the received application reopens that original
workspace for continued work.
