# Bloccpay operations

Install and operate the complete payroll, invoice and treasury application through the existing Starforge tools. The original company application is retained unchanged in `source/`; the managed application and customer-agent modules use that same host and durable transaction writer.

## Complete source and runtime

`source-origin.json` identifies the full original source edition and every file. `source/source-files.json` remains the original application manifest. Source capture and private receiving use this exact declared application; the installed integration lives beside it.

The original runtime is Node.js **24**. It uses built-in SQLite and has no required npm dependencies. The maintained runtime profile records the minimum supported engine; select a Node 24 executable when retaining or restoring the original company runtime. The complete browser commissioning programme separately uses the existing selected Playwright and Chromium installation.

The source-owned distribution selection is `bloccpay`. It includes the original company application, installed application/customer-agent interface, full installation profile and the existing invoice-settlement contribution for invoice SDP delegation. The full distribution also discovers the Bloccpay contribution.

From a selected checkout, the maintained package builder accepts:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --ref ORIGINAL_COMMIT --selection bloccpay --out /private/new-package
~~~

Use the builder's existing help for its current installation and archive options. Select the exact committed source and a new output directory; resume an interrupted build using its original selection and output.

## Open the original application

Read [APPLICATIONS.md](APPLICATIONS.md) for the complete managed application, readiness, private configuration and customer-agent workflow. Applications selects the installed `bloccpay` provider and command. The original standalone CLI remains available:

~~~sh
node source/cli.mjs serve \
  --directory /private/existing-workspace \
  --configuration /private/connections.json
~~~

Keep the configuration, credentials, operator token and original customer records in private locations. Bind the actual existing workspace ID when reopening received or existing work. Select the original account, tenant, network, asset, wallet, programme and reporting period in that same configuration.

The original [operating guide](source/OPERATIONS.md) covers runtime retention, configuration, all command arguments, the complete browser and original commissioning programme. The [company README](source/README.md) gives the daily sequence. Template files under `source/examples/` supply field structure; use the actual customer selections.

## Payroll, invoices and native observations

Save the programme's exact original mapping and source scope. Retain the complete CSV/JSON, then capture or import complete SDP, Horizon and Bridge observations. Review cursor coverage and actual source versions before selecting instructions, settlement or incident decisions.

The operator includes the original programme/payroll/reconciliation workspace, `/sdp-events` event inbox and `/bridge` intake desk. The standalone companions remain `source/horizon-payroll.mjs` and `source/bridge-cli.mjs`; each exposes its full help and works through the original retained workspace.

The [invoice SDP guide](source/docs/invoice-sdp-integration.md) describes delegation from the installed invoice-settlement SDK to this application. Set its adapter module to the absolute installed `source/examples/invoice-sdp-adapter.mjs`, and keep its complete owner-only configuration outside the source tree. It selects the same existing workspace and original company programme while preserving the invoice programme and SDK intent. The existing company operation writer retains the native provider request.

## Prepare the customer Installation

The installed profile `bloccpay` is discovered by the original SF49 workorder preparer. It retains the complete implementation from customer scope and private account binding through original-source intake, provider operation, reconciliation, reporting and independent receiving.

1. Open the existing commercial Workshare and original operating case. Obtain its fresh native Workshare/Installation seed.
2. Select `bloccpay` through the original workorder profile catalogue and prepare the bindings template.
3. Enter the actual source references, source-use authority, merchant/buyer deployment IDs, payment terms, receiving host and operator.
4. Prepare the complete document and inspect the returned selections. The original seed supplies funded assignments, commercial phases, acceptance criteria and prior source bindings.
5. Preview and save through the current Customer installations interface or its native commands, retaining the original request ID and resulting Installation revision.

The installed command completes the same source-owned preparation:

~~~sh
starforge grant-installation-workorder profiles

starforge grant-installation-workorder template \
  --profile bloccpay --seed /private/original-seed.json \
  --out /private/bloccpay-bindings

starforge grant-installation-workorder prepare \
  --profile bloccpay --seed /private/original-seed.json \
  --bindings /private/bloccpay-bindings/bindings.json \
  --out /private/bloccpay-workorder
~~~

Edit the bindings with the actual original customer selections before preparation. The original preparer writes the complete installation input, preview envelope, workorder and preparation result. Its output directory is private and its retained files recover the same input.

The preparer validates the original seed and keeps all native commercial and funding fields. Workorder preparation does not operate a provider or mark a phase complete. Record each actual receiving outcome against the original saved criterion.

## Whole export and independent receiving

Use the existing company workspace export, archive, inspect and receive operations. They retain the original source, compatible runtime, complete private database/files and all request/history records. The receiving process selects a fresh private destination and retains its own original request identity.

[RECEIVED_WORKSPACE.md](RECEIVED_WORKSPACE.md) gives the complete inspect, prepare and open commands, retained private settings and receiving behavior. The received-workspace integration opens the existing returned workspace and runtime through the same Applications provider. It uses the source manifest and returned identities to reconstruct local paths. Review the receiving application's private account configuration and automatic collection/projection choices before enabling later provider activity. Older received source can be retained with the original package while the operator explicitly selects a compatible complete application edition for managed operation. The private preparation records both editions and the same returned workspace identity; use the exact source-selection arguments in the receiving guide.

A subsequent useful payroll period or reconciliation refresh retains its own original inputs. Original-response recovery continues the same request. Earlier source versions, reports and corrections remain in the complete workspace and handover.

## Source updates

The source edition is the complete original company application at commit `54a3898a24be659879e6eafe5f0f0773a4ef7dd0`. Select a later complete original edition when updating. Replace all declared source members and `source-files.json` together, update `source-origin.json`, and carry the same installed integration forward against those exact interfaces. Managed launch uses an explicit registry of reviewed complete source manifests. Review and register the selected edition's startup, automatic-work controls and close ownership together; a manifest with the right field names alone does not establish compatibility.

Original source: [complete application](https://github.com/woahwhattheheck/commons/blob/54a3898a24be659879e6eafe5f0f0773a4ef7dd0/opportunities/bloccpay_payroll_reconciliation_commissioning_20261013/engineering/bloccpay-payroll/README.md), [operating guide](https://github.com/woahwhattheheck/commons/blob/54a3898a24be659879e6eafe5f0f0773a4ef7dd0/opportunities/bloccpay_payroll_reconciliation_commissioning_20261013/engineering/bloccpay-payroll/OPERATIONS.md), [invoice delegation](https://github.com/woahwhattheheck/commons/blob/54a3898a24be659879e6eafe5f0f0773a4ef7dd0/opportunities/bloccpay_payroll_reconciliation_commissioning_20261013/engineering/bloccpay-payroll/docs/invoice-sdp-integration.md), [SDP inbox](https://github.com/woahwhattheheck/commons/blob/54a3898a24be659879e6eafe5f0f0773a4ef7dd0/opportunities/bloccpay_payroll_reconciliation_commissioning_20261013/engineering/bloccpay-payroll/docs/sdp-events-inbox.md), [Bridge intake](https://github.com/woahwhattheheck/commons/blob/54a3898a24be659879e6eafe5f0f0773a4ef7dd0/opportunities/bloccpay_payroll_reconciliation_commissioning_20261013/engineering/bloccpay-payroll/docs/bridge-intake.md).
