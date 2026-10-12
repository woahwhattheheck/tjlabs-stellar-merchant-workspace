# Develop and receive the SQL Server product

The maintained product composes the original native SQL Server component and shared seller/installation engines. Its selected archive is declared in stellar/scf-starforge-20261009/distribution/selections/mssql.json. Its native registration remains distribution/contributions/mssql.json.

## Source and ownership map

| Source | Responsibility |
| --- | --- |
| sf30-seller-sdk/mssql/source.mjs | Native typed SQL queries, exact scalar projection, limits, cancellation and pool ownership. |
| config.mjs and catalog.mjs | Original profile and native schema metadata. |
| declaration.mjs and prepare.mjs | Reviewed public contract, complete immutable source/client preparation and verification. |
| merchant.mjs | Original SF30 seller and native payment lifecycle. |
| workspace/model.mjs and plan.mjs | Catalog-based authoring, native review/preview and per-release publication/adoption. |
| workspace/operator-store.mjs and operator.mjs | Workspace UUID, private lease, retained request/result/review history and operating methods. |
| workspace/transfer.mjs | Complete original merchant/customer manifests and receiving. |
| workspace/server.mjs and public/ | Authenticated loopback browser and same-owner API. |
| workspace/managed.mjs and application-provider.mjs | Original Applications prepare, source/input binding and live startup observation. |
| agent/catalog.mjs, client.mjs and provider.mjs | The 21 original merchant tools and source-owned attachment. |
| agent/setup.mjs, cli.mjs and download.mjs | Recoverable host setup, original merchant serving/direct calls and full resumable downloads. |
| workspace/receiving.mjs | One full managed author/merchant/customer/receiver operation. |
| mssql/receive.mjs | The original source-native SQL Server and SF82 receiving operation. |
| sf82-seller-pilot/release-mssql.mjs | Retained release staging, execution and original child lifecycle. |
| distribution and sf46-release | Exact source selection, archive, runtime dependency profile, installation, activation and rollback. |

Paths in the table begin beneath stellar/scf-starforge-20261009 unless they name the local MSSQL component. The merchant host's shared interfaces remain under stellar-forge/mcp-merchant-operator.

The canonical component retains the published public PR1895 source. Its operator-store continuation additionally reconciles an original two-link final/staging inode under the original private owner lease, including initial identity and retained nested requests/results/exports. It performs no replacement source or request generation during recovery.

## Extend the original declaration

The mssql contribution declares five commands, fourteen module exports, the original mssql/package.json runtime manifest, the original browser asset manifest, applicationProviders.mssql and merchantProviders.mssql-workspaces. Keep each implementation with this source-owned declaration.

The selected recipe retains the whole component and original consuming paths. Static relative modules are discovered by the original builder's ESM parser. Dynamic module launches, generated-client assets, process workers and native command files must remain in their original components or explicit supportFiles. Keep the exact original filename and source identity.

Use the existing provider contracts for new attached behavior. The SQL workspace owns database reads and seller processes. An MCP attachment verifies its live UUID and profile and forwards the original operation. The shared release manager owns release activation and managed seller children; the shared installation workflow owns runtime upgrade and rollback.

## Build and inspect the selected package

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/current-checkout --ref ACTUAL_COMMIT \
  --selection mssql --out /private/mssql-selected-build
~~~

The original build result names the archive, digest and exact commit. Its manifest retains the source-selection recipe and selected contribution bytes along with all original module and browser file identities. Source input changes require a new selected package; a retained build resumes only its original inputs.

Inspect the generated package through the original SF46 entry:

~~~sh
starforge installation inspect /private/mssql-selected-build/package
starforge installation prepare /private/mssql-selected-build/package \
  --out /private/mssql-sf46-release
~~~

Use the actual package directory returned by the build when its configured output layout differs. The maintained runtime installer is the path for installing optional database/MCP/native payment dependencies. Its profile must retain the mssql feature's exact mssql@12.7.4 version and declaration origin.

## Original receiving inputs

The existing source examples provide a source JSON, merchant plan, typed input and an optional disposable-database seed. The seed is an explicit operator action for a selected development database; ordinary source preparation, catalog reads, browser launch and installation never execute it.

An actual source-native operation uses the equipped owner's approved source, plan and input:

~~~sh
starforge mssql receive \
  --source /private/sqlserver/source.json \
  --plan /private/sqlserver/merchant-plan.json \
  --query catalog --input /private/sqlserver/input.json \
  --table '[dbo].[catalog]' \
  --directory /private/sqlserver/native-receiving
~~~

This original command prepares and verifies one immutable package, reads the actual native catalog and typed query, enters the original SF82 store, moves its authoring package and reopens the retained release, starts the original merchant child and checks the generated client's unpaid payment contract. It retains native version, input/output, exact package and process identities in receiving.json.

The complete managed operation is mssql-managed-receive. It attaches to the equipped owner's existing author/receiver listeners and merchant host using the private options described in OPERATING.md. Preserve the current SQL Server request, source/profile, authentication reference and native job identity when joining a project receiver.

## Meaningful receiving for a changed source selection

Use the actual original builder, archive reader and SF46/runtime installation against the selected commit. Verify that the installed distribution discovers the SQL Server Application and mssql-workspaces provider, their original fields and tool schemas, exact driver profile and real browser assets. Launch the original private owner with its approved source; verify the same workspace UUID through the attached merchant client.

Carry the existing prepared merchant, generated client and transfer receiving operation through the installed paths. A source-neutral packaging check can inspect or initialize original source metadata without opening a database query. Actual SQL execution uses the original equipped SQL Server operation and its retained native outputs.

For a change to saved-operation recovery, exercise the real private filesystem publication boundary once: interrupt the original final-link publication, then reacquire the same original lease and reopen the same request/result or initial identity. Check committed bytes and UUID continuity. Retain that actual output with the source publication.

The already accepted original package receiving is public PR1895 comment 6120571007. Reuse it for unchanged package/transfer behavior; run the materially changed installed selection or receiving path.
