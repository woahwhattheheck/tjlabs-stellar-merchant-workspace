# SQL Server merchant workspace

Operate a SQL Server data product from one retained private workspace. Read the real catalog, select schema-qualified tables and typed columns, review filters and public payment terms, preview the approved query, and prepare an immutable seller package. The same workspace serves its browser and 21 merchant tools. Its complete merchant and customer exports can be resumed and received on another authorized host.

This is the SQL Server product in the maintained TokenJunkieLabs Merchant Workspace. Its Applications entry, source-owned merchant provider, release manager, generated customer client and installation commands use the original components in this repository.

## Select a starting point

| Operator task | Entry |
| --- | --- |
| Install the SQL Server product | Build or receive the selected archive below, then use the original runtime installer. |
| Author and operate a data product | Open the original SQL Server Application. The complete guide is products/mssql/OPERATING.md in the checkout, or source/products/mssql/OPERATING.md in an archive. |
| Attach an agent or merchant console | Configure its existing workspace UUID and private connection file; use mssql-agent and the original merchant MCP host. |
| Receive a complete merchant or customer client | Use the retained export ID and manifest digest with mssql-download. Receive the merchant through the host's declared delivery alias. |
| Develop the component or prepare an equipped receiving run | Follow products/mssql/DEVELOPMENT.md and the component's original mssql/README.md. |

## Host and source requirements

Use a Linux operator host with Node.js 22.16 or newer, Python 3.11 or newer, npm, Git, tar, and util-linux flock. The selected runtime profile records the effective Node requirement from its original dependency declarations. The managed SQL workspace uses this Linux ownership contract; the database can be on an existing Windows or Linux SQL Server host.

The native driver is the original pinned mssql@12.7.4. Connect to an existing SQL Server 2016 or newer using its approved server, database, SQL login and named password environment variable. The original profile defaults to certificate-verified TLS and can retain a source-relative CA file. Select a principal with the database permissions needed for the approved read. The source has its own query, row, encoded-byte, pool and time limits.

Retain the host's original source JSON, approved query definitions, CA when configured, and environment separately from the installed source. Use actual merchant network, asset and recipient terms when reviewing a product. Existing deployment and facilitator configuration owns native payment operation.

## Build one selected source archive

From this repository's complete checkout, use its original builder and an explicit commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace-checkout \
  --ref ACTUAL_COMMIT \
  --selection mssql \
  --out /private/mssql-build
~~~

The recipe is stellar/scf-starforge-20261009/distribution/selections/mssql.json. It retains the whole SQL Server component, Applications and merchant-console operating paths, the original seller release lifecycle, generated-client helpers, selected merchant providers and their static module closure. The builder also retains the original runtime and browser declarations. Its package metadata names this canonical repository and this product's README.

The returned archive filename, SHA-256, source commit and source-selection identity identify the receiving input. Keep the complete result beside the archive. For an interrupted original build:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace-checkout \
  --out /private/mssql-build --status

node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace-checkout \
  --out /private/mssql-build --resume
~~~

Resume retains its original commit and selection. Original source acquisition and offline Git receiving are documented in distribution/BUILDING.md and distribution/GIT_OBJECT_RECEIVING.md.

## Install the original package and dependencies

Use the maintained installer from a current complete checkout or installed toolkit. The parent of the new private runtime directory must already exist.

~~~sh
starforge runtime-install prepare \
  --dir /private/mssql-runtime-01 \
  --archive /private/downloads/ACTUAL_ARCHIVE.tgz \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --feature mssql --feature mcp --native --operator

starforge runtime-install install --dir /private/mssql-runtime-01

starforge runtime-install inspect \
  --dir /private/mssql-runtime-01 --load --source

starforge runtime-install run \
  --dir /private/mssql-runtime-01 -- registrations --source mssql

starforge runtime-install run \
  --dir /private/mssql-runtime-01 -- merchant-providers inspect mssql-workspaces
~~~

The mssql feature selects the original database driver. The mcp feature selects the original MCP package. The native selection retains the original Stellar payment dependencies for a configured paid seller. Preparation records those exact selections and their originating source files before npm runs.

An equipped host can use its existing npm cache with the installer's --offline and --cache options. Resume an incomplete installation in the same directory; the original installer reconciles its lock, dependency tree and native preparation.

~~~sh
starforge runtime-install resume --dir /private/mssql-runtime-01
~~~

Use runtime-install run for each installed command, or the returned original sourceRoot and dependencyRoot with the existing host deployment. The selected package also supports the original SF46 prepare, install, adopt-runtime, activation and rollback commands.

## Installed product entries

| Entry | Work performed by the original owner |
| --- | --- |
| mssql | Validate and inspect the source; read catalog and typed queries; compile, prepare, verify, run and receive a seller. |
| mssql-workspace | Initialize, inspect or start the private browser and its persistent operating history. |
| mssql-agent | Initialize the source-owned merchant connection, serve the existing merchant MCP host, or call the attached workspace directly. |
| mssql-download | Inspect and resume every original manifest-bound merchant or customer file. |
| mssql-managed-receive | Execute one retained author-to-receiver operation through the two already selected workspaces and their original merchant host. |
| releases | Stage, inspect, compare, activate, run, stop and roll back through the original SF82 owner. |
| runtime-workspace | Review and manage the installed runtime and original SQL Server and merchant-console Applications. |
| merchant-providers | Inspect or initialize the source-owned mssql-workspaces provider. |

The selected archive exports the original SQL Server source, catalog, declaration, prepare, merchant, workspace model/plan/operator/managed/transfer/receiving and agent interfaces, together with the original installation, seller, client and merchant host APIs.

## Start the first retained workspace

First make a private copy of the original example source and edit it for the approved database. The example lives at stellar/scf-starforge-20261009/sf30-seller-sdk/mssql/examples/source.json in a checkout, or beneath source/ in the selected archive. Keep its selected password environment variable on the operator host.

~~~sh
starforge runtime-install run --dir /private/mssql-runtime-01 -- \
  mssql-workspace init \
  --source /private/sqlserver/source.json \
  --state /private/sqlserver/author

starforge runtime-install run --dir /private/mssql-runtime-01 -- \
  mssql-workspace inspect \
  --source /private/sqlserver/source.json \
  --state /private/sqlserver/author
~~~

Retain the returned workspaceId. In the original runtime workspace, attach this READY runtime and choose SQL Server data products in Applications. Select the source file, initialized state directory and private environment file. Select the merchant's existing release store when staging will be used. Review and save the application, review its start, then start and open the returned private URL.

The runtime workspace can itself be opened with:

~~~sh
starforge runtime-workspace init --workspace /private/sqlserver/runtime-workspace
starforge runtime-workspace attach \
  --workspace /private/sqlserver/runtime-workspace \
  --runtime /private/mssql-runtime-01 --label "SQL Server operator"
starforge runtime-workspace serve --workspace /private/sqlserver/runtime-workspace
~~~

Complete browser authoring, host connection JSON, merchant setup, original tool calls, customer file receiving and upgrade operation are in the operating guide shipped with this product.

## Upgrade and recover

Prepare the next original source archive into a new runtime directory. The existing runtime installer carries forward unspecified selections, validates the new declarations and retains both editions:

~~~sh
starforge runtime-install upgrade \
  --from /private/mssql-runtime-01 \
  --dir /private/mssql-runtime-02 \
  --archive /private/downloads/ACTUAL_NEW_ARCHIVE.tgz \
  --sha256 ACTUAL_NEW_ARCHIVE_SHA256

starforge runtime-install compare \
  --before /private/mssql-runtime-01 \
  --after /private/mssql-runtime-02
~~~

Review the new runtime in the existing Applications or managed installation workflow. Keep the same initialized SQL workspace, release store, environment and host connection aliases. The original request UUIDs, prepared releases, transfers and source identities remain in that workspace. Stop and restart through its current application owner; an active owner is visible to competing launches.

For a damaged runtime, use the original runtime-install recover command into a new directory. For merchant-data transfer, use the complete retained merchant export and original receiver. The immutable runtime archive, merchant package, customer files and operating workspace each retain their own identity and recovery path.

## Source lineage

The native SQL Server source and release lifecycle originate in public-commons-sprint-2026 PR1455 and PR1548. The complete managed workspace, merchant provider and customer receiving originate in PR1895, merged at c5949a3a6be3217e5d5da8bda75e4d244b6192d7. This product composes that completed source into the canonical repository and adds the selected installation and its complete operating/development guide. The leased saved-operation writer also recovers an original committed publication after its staging-link cleanup was interrupted.

The original managed package receiving already completed the native 107-source operation on Node 24.19.0: nine prepared files, eleven merchant files, six customer files, a resumed 391-byte interrupted download, the generated customer client and receiver reopen after the original sender and incoming directories were removed. Its retained result is attached to public PR1895, comment 6120571007. Canonical installed-source receiving completed on Node 24.19.0 at maintained source daee88e58491a3f123af80175a9b26f1b1da3b41. The original selected builder packaged 792 source files, and the same operation passed SF46 installation, offline controller-runtime preparation, Applications start/restart with the original workspace identity, the 21-tool HTTP MCP provider, committed-publication recovery, and complete merchant/customer receiving. The original catalog example supplied the package-transfer input; the complete mssql/native/MCP dependency profile was resolved from its source declarations. [Run the complete installed receiving operation](../../operations/mssql-canonical-selected-receiving-8e0c-20261012/README.md) or inspect its [original native result](../../operations/mssql-canonical-selected-receiving-8e0c-20261012/NATIVE_RESULT.json).
