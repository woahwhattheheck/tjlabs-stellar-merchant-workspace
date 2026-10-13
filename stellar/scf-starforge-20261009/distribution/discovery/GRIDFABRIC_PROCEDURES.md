# GridFabric customer Operating Plans

Use one saved procedure to carry a customer's Plaid configuration, measurement sources, report mapping, callback and event history, dispatch outcomes and complete delivery through the installed GridFabric product.

The procedure uses the existing Operating Plans model and browser. Its native capture reads the original authenticated GridFabric SDK and retains the complete selected responses, dependent pages and file bytes. The original GridFabric application continues to own SQLite, callbacks, dispatch, export and restoration.

## Install and open

Build the maintained merchant workspace with the `gridfabric-plaid` source selection, following [Energy operations](../../../../products/energy-operations/OPERATING.md). This selection includes the original GridFabric product, Command finder, Operating Plans and the procedure command.

Open the existing customer workspace in **Applications → GridFabric Plaid**. Use the original private connection file belonging to that running application. Read the instance ID from its original configuration. The command opens an authenticated SDK connection to that owner and releases only its own connection when finished.

Generate a complete editable procedure input:

```sh
starforge gridfabric-procedure input \
  --connection-file /private/customer/gridfabric-console.url \
  --id customer-grid-operations \
  --title 'Customer Plaid operating procedure' \
  --instance CUSTOMER_INSTANCE_ID \
  --customer 'Customer name' \
  --owner 'Operating owner' \
  --period 'Agreed operating period' \
  --out /private/customer/procedure-input.json
```

The command reads the actual workspace identity, source SHA-256 and revision, then reads the selected instance. It requires that revision to remain stable across those reads. The resulting JSON includes the selected instance as the configuration record.

All output paths are new. Keep the input alongside the saved plan so its complete original selections remain available.

## Select the work and original results

Edit `procedure-input.json` using the actual record and file identities returned by GridFabric. Keep its workspace and source binding.

| Input | Meaning |
| --- | --- |
| `workspace` | Original workspace ID, absolute directory and native source SHA-256 |
| `expectedRevision` | The reviewed native revision to capture |
| `instanceId` | Original Plaid instance |
| `records` | Original collection/ID selections, each assigned to a procedure step |
| `files` | Original SDK `file_SHA256` or `export_UUID` selections, each assigned to a step |
| `stepResults` | Explicit operator assessments: step ID, planned/in-progress/completed/skipped, and a complete explanatory note |

There are nine stable procedure steps:

| Step ID | Customer work | Useful original records |
| --- | --- | --- |
| `workspace` | Reopen the bound native workspace | Original launch, source and state are captured automatically |
| `configuration` | Check deployed contract and configuration | instances, instance_editions |
| `sources` | Review measurements and corrections | sources, source_rows, source_issues |
| `mappings` | Review and activate report definitions | mappings |
| `callbacks` | Inspect native callback/response history | callbacks, callback_deliveries |
| `events` | Review intervals, targets and opt decisions | events, event_revisions, distributions, opt_decisions |
| `dispatch` | Reconcile original provider/device work | management_operations, management_receipts, device_actions, operations |
| `reports` | Inspect original report calculations | reports, report_rows |
| `delivery` | Transfer the complete customer workspace | Select the actual retained export file returned by GridFabric |

A record selection has `stepId`, `collection` and `id`. A file selection has `stepId` and `fileId`. Reuse the same identity across different steps when that original record is relevant to both. The input accepts up to 500 explicit references. Related source/report/callback/history pages and native file dependencies are received completely.

The capture reads records from the bound workspace. Select records belonging to the intended instance and retain the complete sources that explain them. The original GridFabric domain guide defines source, mapping, event and dispatch relationships.

A successful read leaves the saved step status unchanged. The operator's `stepResults` supplies any new assessment. Each note remains in the recorded plan result; the complete native status and response stay in the capture. For example, an adapter's ACKNOWLEDGED status retains its original HTTP meaning, and a management PROCESSED result retains its distinction from later VTN outcomes.

The native revision can advance as callbacks arrive. Review the new state and update the input's revision when appropriate. An inconsistent capture exits with the original error; it does not silently select a different revision.

## Prepare and edit the customer procedure

```sh
starforge gridfabric-procedure prepare \
  --input /private/customer/procedure-input.json \
  --out /private/customer/gridfabric-plan.json

starforge discover serve --port 4311
```

Open the returned Command finder address, choose **Operating Plans**, and import the complete `gridfabric-plan.json`. The saved plan contains the original installed `gridfabric-plaid` command registration, its source declarations and declared runtime groups.

Edit the customer instructions, owners, expected outcomes and period in that workspace. Keep the nine stable step IDs and each step's structured workspace binding. Save a revision, export the complete JSON, and use that export as `--plan` for the next capture. The preparation keeps all steps planned until an explicit operator assessment is captured or the operator edits their statuses in Operating Plans.

The installed browser provides the original complete revision history, comparison, fork and return workflow. Retain the same browser origin/port when reopening its local saved plans.

To use a separately retained installed catalog, pass `--catalog /absolute/complete-catalog.json` to prepare or capture. Produce that complete catalog with `starforge gridfabric-procedure catalog --out /absolute/complete-catalog.json`. It reads the same installed Command finder catalog and retains its source and runtime declarations. Command finder search exports use their original search-results schema.

## Capture the native work

```sh
starforge gridfabric-procedure capture \
  --connection-file /private/customer/gridfabric-console.url \
  --input /private/customer/procedure-input.json \
  --plan /private/customer/gridfabric-plan.json \
  --out /private/customer/capture-2026-10-13
```

Omit `--plan` to prepare the original plan and then append the captured result. Supplying a plan preserves every earlier revision and appends the new recorded result through the same Operating Plans model.

Capture checks the original workspace/source binding and reviewed revision, reads complete raw responses, follows dependent collection pages, receives selected and referenced native files, and checks the source and state again. Every saved original body and file has its complete byte count and SHA-256. The command also receives the installed native source members declared by the original server, verifies their complete bytes against that declaration, and includes them in the customer capture. Run it from the matching installed GridFabric toolkit on that operating host. A native result is never replaced by an inferred dispatch or report outcome.

The output includes the complete normalized procedure input, catalog, all plan revisions, readable HTML and Markdown, original native response/source material, selected record history and files, and `capture.json`. The capture manifest names the complete saved members. Plan results point to this manifest instead of squeezing full source rows into the original 32,000-character step field.

The new capture uses an exclusively created private directory. Its completion manifest is committed last after all declared members are durable. An interrupted directory remains available for inspection; the reader requires the complete committed capture. A pre-existing destination is retained; choose a new path for another capture. Credentials from the connection file remain with the original connection and are excluded from the delivered input.

## Receive and continue

```sh
starforge gridfabric-procedure show \
  --directory /private/customer/capture-2026-10-13
```

`show` reopens and checks every declared member of the frozen capture. The receiving host can inspect it without running the customer GridFabric workspace.

Open its readable plan, then import its complete plan JSON into Operating Plans. The full history extends an identical earlier history. Divergent edits remain available through the original Operating Plan returns workflow:

```sh
starforge discover plan-return --help
```

For live continuation, receive the selected complete native export through GridFabric's original restore/receiving commands. Keep the full installed product archive and customer files with the procedure. The native product's restored identity, source and complete records remain the authority for the next capture.

Readable editions can also be created from any retained plan JSON:

```sh
starforge gridfabric-procedure render \
  --plan /private/customer/gridfabric-plan.json \
  --format html \
  --out /private/customer/gridfabric-plan.html

starforge gridfabric-procedure render \
  --plan /private/customer/gridfabric-plan.json \
  --format markdown \
  --out /private/customer/gridfabric-plan.md
```

## Application API

Import the pure procedure model from `@tokenjunkielabs/starforge-merchant/operator/gridfabric-procedure` and native capture from `@tokenjunkielabs/starforge-merchant/operator/gridfabric-procedure/native`.

- `inspectGridFabricProcedureInput(input)` validates the complete selection.
- `prepareGridFabricProcedure({catalog,input,savedAt})` returns the original complete Operating Plan.
- `recordGridFabricProcedure(plan,capture,{input,savedAt})` returns that plan with a new saved revision.
- `captureGridFabricProcedure({client,catalog,input,outputDirectory,savedAt,plan})` reads an already connected original SDK client and returns the complete capture and plan.
- `readGridFabricProcedureCapture(directory)` receives a frozen capture.

The application embedding capture owns its client lifecycle. The capture function borrows that client and leaves its original owner running. The CLI creates and closes only its own SDK connection.

## Original source references

- [Operating Plans](OPERATING_PLANS.md)
- [Operating Plan returns](OPERATING_PLAN_RETURNS.md)
- [GridFabric operator](../../sf30-seller-sdk/gridfabric-plaid/README.md)
- [GridFabric domain engine](../../sf30-seller-sdk/gridfabric-plaid/DOMAIN_OPERATIONS.md)
- [Original typed SDK and MCP](../../sf30-seller-sdk/gridfabric-plaid/SDK_MCP.md)
- [Energy product operating guide](../../../../products/energy-operations/OPERATING.md)
