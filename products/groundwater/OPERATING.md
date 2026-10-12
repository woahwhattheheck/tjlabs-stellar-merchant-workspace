# Groundwater modeling and report delivery

Install the original Groundwater scientific workspace and Report Desk together as the `groundwater-reports` product. The scientific workspace retains model sources, reviewed scenarios, original native results and editable project history. The Report Desk turns a selected frozen report into a native merchant file product, receives the buyer's actual report package, links the selected existing Operations case and exports the complete desk for another operator.

The maintained source includes both complete original applications, their browser assets, Python readers, publisher references, Tethys adapter, typed Node entrypoints and source-owned merchant provider. The two applications use their original workspaces and journals. The installed command forwards to the original implementation.

## Start with the intended work

| Work | Installed entry | Complete original guide |
| --- | --- | --- |
| Model source, scenario, native result, review and report | `starforge groundwater` | [Scientific operator guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/groundwater/OPERATOR.md) |
| Frozen report publication, buyer receiving and Operations association | `starforge groundwater-report` | [Report Desk guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/groundwater-report/OPERATOR.md) |
| Scientific publisher operation in its existing runtime | `starforge groundwater-native` | [Complete native workflow](../../stellar/scf-starforge-20261009/sf30-seller-sdk/groundwater/examples/NATIVE_WORKFLOW.md) |
| Same-report publication and receiving continuation | `starforge groundwater-report-native` | [Report Desk API and original caller](../../stellar/scf-starforge-20261009/sf30-seller-sdk/groundwater-report/API.md) |
| Managed Report Desk launch, stop, reopen and received-desk operation | Applications → **Groundwater Report Desk** | [Managed installation and receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/groundwater-report/INSTALLATION.md) |
| Existing Tethys portal deployment | Original `groundwater/tethys_app/` source | [Tethys deployment and receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/groundwater/TETHYS.md) |
| Installed source, selected dependencies and upgrades | `starforge runtime-install` | [Runtime installation and recovery](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) |

## Install the complete selected product

Use Linux, Node.js 22.16 or newer, Python 3.11 or newer, npm and util-linux `flock`. Keep source, installed runtime, scientific workspace, report desk, exports and customer receiving directories distinct. Existing native scientific environments and original workspaces can be reused.

The Runtime workspace discovers this recipe as **Groundwater modeling and report delivery** under **Build a product**. Select the full intended source commit and a new output directory. Its original receipt supplies the resulting archive path and SHA-256. The equivalent maintained build command is:

```sh
node /absolute/checkout/stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout \
  --ref ORIGINAL_FULL_COMMIT \
  --selection groundwater-reports \
  --out /private/releases/groundwater
```

Use the actual archive and hash from that result. Install through the maintained runtime installer; its `--native` choice selects the original payment SDKs, while `schema`, `openapi` and `mcp` select the declared supporting features:

```sh
node /absolute/checkout/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /private/runtimes/groundwater-01 \
  --archive /private/releases/groundwater/ACTUAL_ARCHIVE.tgz \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node /absolute/checkout/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /private/runtimes/groundwater-01

node /absolute/checkout/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /private/runtimes/groundwater-01 --load --source

node /absolute/checkout/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /private/runtimes/groundwater-01 -- source
```

The installation returns the complete original `sourceRoot` and `dependencyRoot`. It retains the chosen archive and its source selection in the package manifest. Once using the installed `starforge` command, `starforge runtime-install run --dir /private/runtimes/groundwater-01 -- COMMAND ...` is the equivalent forwarding form. The source command lists the actual installed identities.

For a stopped dependency installation, use the same `runtime-install resume --dir` operation. An upgrade prepares another runtime directory and preserves the previous one for the maintained activation or rollback workflow. The [runtime guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) covers offline cache use, import readiness and exact original profile recovery.

### Receive and reopen the complete installation

The [complete retained installation caller](../../stellar/scf-starforge-20261009/distribution/receiving/GROUNDWATER.md)
uses this existing `groundwater-reports` recipe through **Build a product**. Supply
one full reviewed commit and a private receiving directory in the original
[input file](../../stellar/scf-starforge-20261009/distribution/receiving/groundwater-receiving.example.json),
then run:

```sh
node /absolute/checkout/stellar/scf-starforge-20261009/distribution/receiving/groundwater-reports.mjs \
  /private/requests/groundwater-receiving.json
```

It retains the original source review and request, builds and installs the
selected profile, reads back all 64 scientific source files, creates the
maintained runtime transfer, and installs that exact source/profile/lock from
the received parts into a second runtime. The second installation uses the
received cache offline. The original Runtime Workspace then reopens the same
source review and verifies the complete archive download; an explicitly
selected browser also reopens that saved review.

Keep its original input and directory when continuing an interrupted call.
A completed result names both actual runtimes, their deployment handoffs, the
source archive and every transfer part. This installation workflow inspects
source and commands; scientific model execution and existing report/desk
receiving use their own original records and explicit selections.

## Open the scientific workspace

For a new project store, explicitly initialize its private directory. For an existing store, open its original directory directly:

```sh
starforge groundwater init --workspace /private/groundwater-study
starforge groundwater serve --workspace /private/groundwater-study --port 8892
```

The CLI also accepts `--python /absolute/python`, or the `STARFORGE_GROUNDWATER_PYTHON` environment variable, to select the existing Python executable. Reading sources, authoring scenarios, reviewing results and receiving a package use the shipped original Python core. A model execution uses the separately configured native runtime described below.

In the scientific browser:

1. Enter the actual operator and select or create the study project. Record its purpose and site description.
2. Retain the bundled publisher baseline or import the complete original model ZIP. Inspect the source inventory, native references, declared units, selected namefiles and aquifer mapping.
3. Review the original source findings. An attributed scenario records its parent, changed values and reason while retaining the parent edition.
4. Select the configured native runtime, queue the intended reviewed edition and execute its original run. Use the run's saved state and operation ID for continuation.
5. Review the actual native outputs and scientific comparison. Freeze the intended report with its source, edition, run, result and review identities.
6. Export a complete scientific workspace backup for editable model history, and retain the report's complete ZIP for downstream report delivery.

The included USGS TWRI source carries the executable/prose recharge discrepancy, the differing legacy/MF6 unit declarations and the original steady-state time semantics. Those findings remain visible in the installed workspace and frozen report. The [source and scientific interpretation](../../stellar/scf-starforge-20261009/sf30-seller-sdk/groundwater/OPERATOR.md#3-understand-the-publisher-findings) describe the exact publisher example and how an attributed derived scenario records a change.

### Reuse the original native runtime

The original scientific caller requires an explicitly selected Python environment, MODFLOW 6, double-precision MODFLOW-2005 and the publisher-compatible Python dependencies. Its maintained preparation helper records the selected binaries and source identities. The complete [native workflow guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/groundwater/examples/NATIVE_WORKFLOW.md) provides the original `native` extra, runtime preparation, browser selection and single-operation continuation commands.

A current producing operation keeps its original input file, workspace, native run IDs, configured runtime and output directories. Consume its retained report and full result when preparing the Report Desk. A reviewed source correction uses that caller's original source-revision mechanism and the same operation. Native execution records remain attached to the source and runtime that actually produced them.

## Open the Report Desk

The installed report command finds the scientific application in its sibling original source directory. Supply `--application` only when intentionally selecting another complete reviewed installation. Supply `--python` for the original scientific environment.

```sh
starforge groundwater-report init --desk /private/groundwater-report-desk

starforge groundwater-report serve \
  --desk /private/groundwater-report-desk \
  --source /private/groundwater-study \
  --python /private/original-python/bin/python \
  --launch-file /private/groundwater-report-launch-01.json
```

Open the actual URL from the launch result. The browser has **Frozen reports**, **Publication**, **Buyer preparation**, **Report receiving**, **Operations & recovery**, and complete handover controls. A buyer receiving an existing public report catalog can use a desk without a scientific source connection.

Keep the launch file private: it contains the local access link. The server binds the original desk UUID, verifies its loopback Host and Origin, and owns graceful shutdown of its services. Each new launch selects a new explicit launch-file name. The source workspace option opens the already selected scientific database.

### Manage the existing desk through Applications

The full product includes the source-owned `groundwater-reports` Applications
provider and its managed commands. In the original Runtime Workspace, choose
**Applications → New application → Groundwater Report Desk**, then select the
existing desk directory and actual Python interpreter. An existing scientific
workspace and private Operations access file are optional explicit selections.

Review and save that application, review its start, then open the actual private
URL returned by the original worker. Startup verifies the selected and executed
source, original desk identity and optional scientific database before exposing
the authenticated listener. **Stop** drains the original process; a later
reviewed start reopens the same desk. It does not initialize a scientific
workspace or dispatch a model, report publication or buyer operation.

The [complete managed guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/groundwater-report/INSTALLATION.md)
covers the original CLI, stable browser origin, lost-response recovery and the
`groundwater-report-managed-native` continuation. That continuation requires the
actual existing desk and original receiving inputs. It launches, stops and
reopens the desk, exports its complete archive, receives the same archive, and
opens the received copy through Applications.

### Publish one frozen report

Select the report and inspect its complete source and reviewed findings. Publication records the exact report, manifest and ZIP hashes, actual operator, title, scope, usage/attribution, reason, owned HTTPS origin, versioned route and original payment terms.

The complete ZIP is required. JSON, HTML and CSV companions may also be offered. The HTML refers to scientific members and figures in the complete report, so the ZIP is the full report delivery. Every selected file remains byte-identical to the frozen scientific export.

The original response-asset publisher accepts files up to 16 MiB each and total selected route bytes up to 64 MiB. Its service title allows 1–32 printable ASCII characters; description plus usage/attribution fits its 2,048-character bound. The native compiler validates the actual atomic payment amount, recipient, asset, network and offer.

The publication retains frozen source exports, the original SF30 asset bundle, public catalog, exact offer join and its saved request/result. **Start local service** serves the same bundle through the original merchant. Its default is `CHALLENGE_ONLY`. A native facilitator is selected explicitly when launching the original service:

```sh
starforge groundwater-report serve-publication \
  --desk /private/groundwater-report-desk \
  --operation ORIGINAL_PUBLICATION_ID \
  --facilitator https://actual-original-facilitator.example
```

Configure the actual public HTTPS forwarding to match the frozen offer's origin and versioned route. The native merchant handles its established verification, settlement and exact protected response workflow.

### Prepare the buyer and receive its report

The publisher can prepare from its original publication, or an independent buyer can select the complete public catalog, exact resource row and accepted-payment option. Both paths produce the original SF88 buyer configuration with the pinned file expectation and explicit buyer intent. Run that configuration through the existing authorized buyer and its retained execution/recovery controls.

After the buyer returns, select its saved Inbox job and actual response ZIP. The desk can capture the exact selected original Inbox jobs into the maintained operations handoff. Retain that original capture and request through interruption.

In **Report receiving**, supply the complete public catalog, original private SF88 handoff and actual report ZIP. Select the exact catalog row, accepted option and buyer job. The original readers join the URL, asset, accepted terms, response length/hash, source, edition, native run and result identities. They retain the buyer's separate payment and output observations.

Record the actual receiving purpose and attributed decision, `received` or `changes_requested`, with its reason. The scientific package reader supplies the original artifact receipt and report inventory; the desk retains the separate receiving review with its source records. The [original API](../../stellar/scf-starforge-20261009/sf30-seller-sdk/groundwater-report/API.md) contains complete publication, buyer preparation, preview, receiving and export request shapes for CLI or SDK use.

### Link the existing Operations case

To work with an existing SF47 Operations server, provide its private access link at report server launch:

```sh
starforge groundwater-report serve \
  --desk /private/groundwater-report-desk \
  --source /private/groundwater-study \
  --operations-url-file /private/original-operations-launch.json \
  --launch-file /private/groundwater-report-launch-02.json
```

Choose the exact existing case, buyer deployment and purchase association from the current preview. The original sequence receives the selected buyer job, adds the receiving review as a source, and appends that source to the purchase while retaining its current payment, output, order and timestamp fields. Each original request and returned receipt stays in the desk. The complete existing case export includes the receiving source and purchase association; the complete desk export includes the actual report bytes.

## Merchant agent configuration

The selected source registers the original `groundwater-reports` merchant provider. Its host input is `groundwaterReportConnection`; the provider stores parsed settings under `groundwaterReports`. The maintained registry supplies the configuration reader and lazy runtime loading.

Copy the [complete original connection example](../../stellar/scf-starforge-20261009/sf30-seller-sdk/groundwater-report/connection.example.json) into a private configuration file. Set the existing desk directory and actual desk UUID from its initialization/state response. Set the installed scientific application, Python executable, original Inbox and explicit export/receiving directories for the intended operation. Use mode `0600` for the private file.

Add this field to the existing merchant MCP configuration:

```json
{
  "groundwaterReportConnection": "/private/config/groundwater-report-connections.json"
}
```

This is one field in the existing complete merchant configuration. Preserve its schema, merchant name, release store, exports directory, sources and other selected provider inputs. The [merchant operator guide](../../stellar-forge/mcp-merchant-operator/README.md) covers the original MCP launchers and host configuration.

| Tool | Operation |
| --- | --- |
| `merchant_groundwater_report_desks` | List configured desk aliases, exact identities and source/Operations connections. |
| `merchant_groundwater_report_read` | Read source reports, publications, receivings, original operations and selected cases. |
| `merchant_groundwater_report_action` | Publish, prepare/capture the original buyer, preview/commit receiving, continue the same operation, or export/restore the complete desk. |
| `merchant_groundwater_report_file` | Read the selected immutable original file using its exact SHA-256 and retained range-read ID. |
| `merchant_groundwater_report_file_release` | Release that retained file read after receiving the complete file. |

Provider aliases pin the actual desk UUID and configured host paths. File readers return the complete file identity, original read ID and byte ranges. Collect the complete returned file under its original identity and release the read when finished. The provider's configured roots govern response, export and restore destinations.

## Complete handover and recovery

Keep the scientific workspace backup and Report Desk archive together when another operator needs the full study and its delivery history. They serve two complete, distinct records:

| Deliverable | Retained contents |
| --- | --- |
| Scientific workspace backup | Original model sources, project and edition history, runtime/run records, reviews, reports and editable study state. |
| Report ZIP | Frozen report with its native inputs, outputs, source, scientific figures, manifest and original identities. |
| Complete Report Desk ZIP | Publications, native bundles/catalogs, prepared buyer configurations, actual buyer handoffs/responses, receiving reviews, saved Operations requests/receipts and original desk state. |

Use **Export complete desk** with a new destination outside the active desk. The CLI equivalent reads the complete original export request:

```sh
starforge groundwater-report export \
  --desk /private/groundwater-report-desk \
  --input /private/requests/complete-desk-export.json

starforge groundwater-report restore \
  --desk /private/groundwater-report-desk \
  --input /private/requests/complete-desk-restore.json
```

Restore supplies the original archive path, exact byte length and SHA-256 plus a new destination. A stopped restore retains its original destination intent and continues the same archive. The result returns the restored desk directory and original identity. Open that directory through the installed command, read its original publication/receiving records and reconnect the intended source and Operations servers when continuing their work.

For an uncertain write, use **Operations & recovery**, or `starforge groundwater-report operation --desk DIRECTORY --operation ORIGINAL_ID`, to read the saved request/result. Continue that same operation with `groundwater-report continue`. Pending browser uploads retain their original filename and hash; reselect the identical complete file when the server has not yet saved it. A definite version conflict presents the current case and retained request for review before a new selection.

## Original source and continued maintenance

This installed adoption keeps all 64 scientific source files from reviewed source `96a1d66ad032cbbb2640252fedd3f4048a6c8dd6`, carried by complete capsule `ec6a1d1faa4d641835d2853715887ad5481be800`. It includes the attributed reference-inspection correction from [public PR 2460](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2460) and the publisher JSON descriptor correction from [public PR 2498](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2498). The original 23-file Report Desk from [public PR 2441](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2441) is retained with its six additional managed source files and exact shared-file joins from [public PR 2471](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2471). Their source-owned contributions register the original commands, typed exports, merchant tools and Applications provider.

The scientific source includes the complete publisher inventory and licenses; the Report Desk preserves the original SF30 publisher, SF88 buyer handoff, scientific receiving and SF47 Operations interfaces. Existing scientific and report-producing operations retain their saved inputs and native results. Use the selected source manifest and the full original guides when continuing those operations or preparing a later reviewed product release.
