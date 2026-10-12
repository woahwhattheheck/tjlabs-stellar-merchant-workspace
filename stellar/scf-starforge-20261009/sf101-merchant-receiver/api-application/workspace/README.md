# API merchant console

The API merchant console brings the original paid application into one browser and command interface. It publishes offers from a Jobs application, adopts existing funded applications, prepares customer checkout handoffs, runs the original API gateway and worker, manages purchased access, reopens execution results, exports complete usage and receives encrypted application backups.

Start it through the installed `starforge api-merchant-workspace` command or choose **API merchant console** in **Applications**. The browser uses the same durable operation queue as the command interface. Offers, orders, request IDs and results remain owned by the original checkout, API access and application engines.


The [complete agent operating guide](AGENT_OPERATING.md) connects this same console to the source-owned merchant MCP provider. It includes all 33 tools, the typed client, original durable operation continuation, complete native file receiving after console shutdown and host-declared encrypted backup restore.

## Prepare the original application

Select these existing inputs:

| Input | Purpose |
| --- | --- |
| Jobs merchant JSON | Selects the application source, callable functions, examples, input/output limits and original execution configuration. |
| Checkout JSON | Retains the original payment terms, public checkout route, merchant state and delivery outbox. |
| Customer API origin | The API origin advertised to customers, such as `http://127.0.0.1:43112` or the merchant's HTTPS origin. |
| Private console directory | Holds this console's saved offers, selected orders, durable operations, exports, restore destinations and current private launch. |
| Optional complete backup selection | Selects the actual application root, additional data roots, environment path bindings and the original recovery passphrase environment name. |

Use a directory separate from the original checkout state and outbox. The configuration and console directory are private to the operating system user. Keep the original application and checkout services' required environment available to the selected process.

The original configuration guides are [Jobs](../../../sf30-seller-sdk/jobs/README.md), [checkout](../../README.md) and [application execution and receiving](../README.md). Use their existing configured application; the console reads its original functions and payment terms.

For a new console:

```sh
umask 077
mkdir -p /srv/merchant/console-config

starforge api-merchant-workspace configure \
  --merchant /srv/merchant/jobs.json \
  --checkout /srv/merchant/checkout.json \
  --gateway-base-url http://127.0.0.1:43112 \
  --directory /srv/merchant/api-console \
  --out /srv/merchant/console-config/merchant.json \
  --actor merchant-operator
```

Add `--backup /srv/merchant/console-config/backup-selection.json` when complete encrypted receiving is needed. Add `--links /srv/merchant/console-config/links.json` for the existing checkout, delivery, accounting and Jobs consoles. Both options read private JSON files; they are included in the saved configuration.

An example backup selection is:

```json
{
  "applicationRoot": "/srv/merchant/application-source",
  "dataRoots": [
    {"name": "documents", "path": "/srv/merchant/documents"}
  ],
  "environmentBindings": [
    {"environment": "DOCUMENTS_ROOT", "dataRoot": "documents", "path": ""}
  ],
  "passEnv": "MERCHANT_RECOVERY_PASSPHRASE"
}
```

`passEnv` names the environment variable containing the passphrase. Supply its value in the operating environment or Applications' private environment file. The configuration stores the name. Select the original recovery root and any data directories actually used by the application. Existing snapshot configurations retain their native recovery bindings.

Optional links use the keys `checkout`, `delivery`, `accounting` and `jobs`:

```json
{
  "checkout": "http://127.0.0.1:43010/",
  "delivery": "http://127.0.0.1:43011/",
  "accounting": "http://127.0.0.1:43012/",
  "jobs": "http://127.0.0.1:43013/"
}
```

The configuration is bound to its console journal. Complete these selections before first launch. To operate different source/configuration selections, use another private console configuration and directory, then adopt the original application and orders into it.

## Open the console

```sh
starforge api-merchant-workspace inspect-launch \
  --config /srv/merchant/console-config/merchant.json

starforge api-merchant-workspace serve \
  --config /srv/merchant/console-config/merchant.json \
  --port 0
```

The startup line contains the private browser URL, original workspace ID and `launchFile`. The capability stays in the URL fragment. The private launch file is:

```text
/srv/merchant/api-console/api-merchant-launch.json
```

Keep the serving process running while using the browser or command interface.

In **Applications**, select the same private configuration. Review the selected merchant, actual callable functions, payment terms, original state directories, customer origin and backup selection. The source-owned provider inspects the selected installed edition and carries that exact configuration and saved workspace into the original Applications lifecycle. The common environment field supplies the process environment. Start opens the console's private link; Stop drains its HTTP requests, current operation and original gateway/worker before releasing the workspace.

A failed close retains the same process and original owner handles. Retry Stop on that process. The launch record moves through `LISTENING`, `STOPPING`, `CLOSE_FAILED` when a drain needs attention, and `STOPPED` after successful drain. The terminal state is written while the original workspace lease remains held.

The customer API and private gateway console stop accepting connections before their accepted requests drain. Application workers then finish their original cancellation/result updates, and the job store finishes every accepted read and write before releasing its lease. A failed startup retains any acquired service for the same Stop or workspace-close operation.

The direct `api-application serve`, `api-application worker` and `api-pass serve` commands keep their signal handlers through shutdown, including a retry after a close error. They also drain the acquired service if the startup announcement cannot be written. Reopen the original order, request and saved operation after the process finishes.

The browser port is separate from the application worker and customer API ports. For a direct local customer origin, API port `0` means the port already advertised by that origin; an explicit different API port is rejected. An HTTPS/proxy origin can use a separately selected local API listener.

## Complete the merchant workflow

### 1. Adopt an existing application or publish an offer

For an already funded application, use **Adopt existing application**. Select its original `application.json`, exact purchased `api-pass.json` and a useful label. The console checks the original source, routes, checkout state and plan identity. Adopt the existing order in the Orders view using its original order reference.

To make a new offer, select the actual application functions shown by the original Jobs compiler. Set the offer title, allowance, route units, worker port and API port. Preview compiles the original plan and displays the exact payment terms and route limits. Prepare retains the selected source and plan. Publish materializes the original application configuration from that saved preparation.

A function with original file intake remains available through the original paid Jobs workflow. The API offer selector identifies those functions so their original file handling stays intact.

A prepared offer and its published edition remain the same offer. Each published package has its original plan, checkout terms, application profile and receiving guide available under Exports.

### 2. Start the service and prepare a customer handoff

Start the selected ready offer. The console owns the original worker and API gateway as one service. Its status displays their actual local addresses and current state.

Prepare a customer order with a stable order reference and label. The original checkout engine enrolls the selected plan and creates the handoff. The export contains:

- `handoff.json` with the original checkout route, payment terms and enrolled plan.
- `api-pass.json` with the exact allowance and route prices.
- `credentials.json` for a newly prepared customer claim.
- `RECEIVING.md` with the customer receiving instructions.

Transfer the customer package privately to the intended customer. Open it in the installed [API customer workspace](../../api-access/workspace/README.md), or use the original API purchase command. The existing checkout service performs the payment flow and grants entitlement through its original engine.

For an existing enrolled or paid order, use **Adopt order**. This reopens the original order and purchased plan. Its original customer claim remains with that customer.

### 3. Operate purchased access and exact executions

The Orders view reopens the original order, pass, allowance and paginated calls. Attach an entitled order to the API access engine when needed. Suspend, resume, expire or clear expiry using the displayed access revision and a reason.

The Executions view lists the original application executions. Open a retained execution to inspect its original request and result metadata. Export result saves the exact original response bytes and execution metadata. The console verifies byte count and SHA-256 when it reads the original result.

Recover or release a call using its original order reference, request ID, current call revision and a reason. These actions go through the existing application recovery commands. A retry uses the saved merchant operation and the same native request identity.

Export usage produces the original complete usage snapshot for the selected order. It keeps the original access accounting, route prices and consumed/reserved/remaining units.

### 4. Continue an interrupted operation

Every mutation is retained before native dispatch. The operation has one UUID, canonical request SHA-256, expected workspace revision, attempt history and original result.

| State | Meaning and action |
| --- | --- |
| `QUEUED` | Saved and waiting for dispatch. It can be cancelled before native work starts. |
| `RUNNING` | The original native operation is active. Reopen this same operation to follow it. |
| `COMPLETED` | Its retained result is ready. Open the original export or native result. |
| `ATTENTION` | Inspect the error code and saved request, resolve the named input/service condition, then resume this same operation. |
| `CANCELLED` | The queued operation was cancelled before dispatch. Its original history remains visible. |

A lost response does not require another operation. Reopen the same ID first. Resume checks the retained request SHA. Reusing an ID with a different request is rejected. A workspace revision change calls for refreshing and reviewing the changed state before making a new operation.

The browser retains drafts, displays the queued/saved request and exposes retry/recovery controls. Closing a browser tab leaves the original serving process and durable operations available.

### 5. Back up, download and receive the application

Choose a ready offer and a descriptive backup label. Decide whether the previously running service should resume after capture. The original service drains before snapshot. The original application snapshot captures its selected source, data, execution history and merchant state. The original checkout delivery outbox travels through the snapshot’s existing data-root mechanism. Its pending events, delivery attempts and accounting journal are captured with the application. The original recovery engine encrypts the complete snapshot and merchant sidecar.

The resulting export includes `application-backup.zip` and `backup.json`. The ZIP contains the original encrypted bundle and a complete receiving guide. The original plan, checkout terms and source identities travel with that receiving bundle.

Use the browser's streamed Save action when the browser supports File System Access. For large files or another shell session, use the streamed installed command shown below. The command reads its authentication from the private launch file; the capability is absent from its arguments.

The console's Restore action receives a selected backup into a new owned runtime. It authenticates the encrypted bundle, invokes the original application restore, retains the original execution/payment identities and compares each selected order with the actual captured native state. Only an order whose captured payment terms and stable access state still match is mapped to the restored offer. Orders created after capture, changed orders and orders whose current state cannot be read stay with their original offer. The restore result and downloadable `order-mapping.json` explain each selection. Start that restored offer when ready. The restored checkout configuration points to the captured outbox at its restored location, so pending delivery work and prior attempts reopen in the original delivery engine. Point the existing checkout service at that restored checkout configuration and state.

For receiving on another host, download both `application-backup.zip` and its companion `backup.json` from the same export. Extract the ZIP into a private directory; its encrypted image is under `bundle/`. Keep the recovery passphrase in the selected environment variable on that receiving host. Then run:

```sh
starforge api-merchant-workspace restore-bundle \
  --bundle /srv/received/bundle \
  --metadata /srv/received/backup.json \
  --out /srv/received/runtime \
  --pass-env MERCHANT_RECOVERY_PASSPHRASE
```

The command authenticates the bundle against the three exact identities in the downloaded metadata, invokes the original application and merchant recovery engines, restores the captured checkout outbox, and writes the matching merchant sidecar. The JSON result returns `profile`, `state`, `store`, `sidecar.planFile` and `sidecar.checkoutFile`. Use those actual receiving paths when adopting the restored application in a receiving console. The restored checkout file contains the captured terms with its state and original outbox mapped into this receiving runtime.

`restore-bundle` runs directly on the receiving host and requires no serving console or launch capability. Its destination parent must already be a private owned directory. Select a new runtime path. Repeating the command against a completed restoration of the same snapshot reopens its original source and execution history and returns `replayed: true`. An incomplete destination stays in place and reports `API_MERCHANT_RESTORE_DESTINATION_INCOMPLETE`; select a new runtime path for a new attempt while retaining that directory for recovery. This prevents an independent receiving invocation from moving another operation's active files.

Use `--python /absolute/path/to/python3` when the receiving host's original Python engine needs an explicit executable. `--expected-metadata-sha256 SHA` optionally pins the exact downloaded `backup.json` member. The recovery engines read the passphrase from the named environment variable.

The underlying `merchant-recovery restore` and `api-application restore` commands remain available for the native encrypted image and application restore. The merchant receiving command composes them with the saved plan, checkout configuration and outbox mapping in one operation.

## Command interface

All operation commands connect to the same running console through `--launch`. They do not start a second gateway or open another state writer.

```sh
merchant_launch=/srv/merchant/api-console/api-merchant-launch.json

starforge api-merchant-workspace view --launch "$merchant_launch"
starforge api-merchant-workspace new-id
```

Mutation input is a private JSON file. It includes the UUID returned by `new-id`, the current `workspace.revision` from View, and the action's exact fields. Retain that input until the operation completes so an interrupted invocation can reopen the same request.

For example, adopt an already configured application:

```json
{
  "operationId": "REPLACE_WITH_NEW_ID_OUTPUT",
  "expectedRevision": 1,
  "label": "Existing analysis API",
  "profilePath": "/srv/merchant/application/application.json",
  "planFile": "/srv/merchant/api-pass.json"
}
```

Replace the shown operation ID and revision with the actual values from the commands above. Then run:

```sh
starforge api-merchant-workspace act offer_adopt \
  --launch "$merchant_launch" \
  --input /srv/merchant/console-config/adopt-application.json
```

`act` and `resume` wait for their selected operation by default. `--wait false` returns its saved acceptance immediately. An operation ending in `ATTENTION` or `CANCELLED` prints the retained operation and exits with code `2`; a command/transport error exits with code `1`. A lost mutation response includes the original operation ID in its error output.

### Native action fields

Every row also requires `operationId` and `expectedRevision`. Labels are at most 240 characters; reasons are at most 500 characters.

| Action | Additional fields | Result |
| --- | --- | --- |
| `source_refresh` | None | Refresh the displayed actual Jobs/checkout source for future offers. |
| `offer_prepare` | `expectedSourceSha256`, `title`, `allowanceUnits`, `routes`, `workerPort`, `apiPort` | Retained original plan and application preparation. |
| `offer_publish` | `offerId` | Ready original application and offer export. |
| `offer_adopt` | `label`, `profilePath`, `planFile` | Adopt an existing ready application and exact plan. |
| `order_prepare` | `offerId`, `orderReference`, `label` | Original enrolled order and complete private customer handoff. |
| `order_adopt` | `offerId`, `orderReference`, `label` | Select the original enrolled/purchased order. |
| `start` | `offerId` | Start that offer's original worker and API gateway. |
| `stop` | None | Drain the original application service. |
| `attach_pass` | `orderReference` | Attach original entitlement to its selected pass. |
| `access` | `orderReference`, `accessRevision`, `action`, `reason`, optional `expiresAt` | Original suspend/resume/expire/clear-expiry operation. |
| `recover_call` | `offerId`, `orderReference`, `requestId`, `callRevision`, `reason` | Original same-call recovery. |
| `release_call` | Same fields as `recover_call` | Original same-call release. |
| `export_usage` | `orderReference` | Complete original usage snapshot. |
| `export_result` | `offerId`, `executionId` | Exact original response and metadata. |
| `backup` | `offerId`, `label`, `resumeService` (boolean) | Complete encrypted application receiving bundle. |
| `restore` | `backupId`, `label` | New restored runtime and selected original orders. |

Each offer route has `id`, `functionId`, `units` and `timeoutSeconds`. The original function supplies its route path and input/output limits. The offer preview request uses the same offer fields without `operationId`, `expectedRevision` or `expectedSourceSha256`:

```sh
starforge api-merchant-workspace preview \
  --launch "$merchant_launch" \
  --input /srv/merchant/console-config/offer-draft.json
```

Use the returned `sourceSha256` as `expectedSourceSha256` when preparing that reviewed offer.

### Reopen, resume and page original state

```sh
starforge api-merchant-workspace operation \
  --launch "$merchant_launch" --id ORIGINAL_OPERATION_UUID

starforge api-merchant-workspace resume \
  --launch "$merchant_launch" \
  --id ORIGINAL_OPERATION_UUID --request-sha256 ORIGINAL_REQUEST_SHA256

starforge api-merchant-workspace offer \
  --launch "$merchant_launch" --id ORIGINAL_OFFER_UUID

starforge api-merchant-workspace order \
  --launch "$merchant_launch" --reference ORIGINAL_ORDER_REFERENCE --limit 50

starforge api-merchant-workspace executions \
  --launch "$merchant_launch" --offer-id ORIGINAL_OFFER_UUID --limit 50

starforge api-merchant-workspace execution \
  --launch "$merchant_launch" \
  --offer-id ORIGINAL_OFFER_UUID --id ORIGINAL_EXECUTION_ID
```

Use the returned original cursor with `--after` on Orders and Executions. Supported page size is 1–100. Open `operation` after a transport interruption before resuming; preserve its ID and request hash. `cancel --id ... --request-sha256 ...` applies only to a queued operation.

### Receive exact exported files

```sh
starforge api-merchant-workspace export \
  --launch "$merchant_launch" --id ORIGINAL_EXPORT_UUID

starforge api-merchant-workspace download \
  --launch "$merchant_launch" \
  --export ORIGINAL_EXPORT_UUID \
  --file application-backup.zip \
  --out /srv/merchant/received/application-backup.zip \
  --expected-sha256 ORIGINAL_MEMBER_SHA256

starforge api-merchant-workspace download \
  --launch "$merchant_launch" \
  --export ORIGINAL_EXPORT_UUID \
  --file backup.json \
  --out /srv/merchant/received/backup.json \
  --expected-sha256 ORIGINAL_BACKUP_JSON_SHA256
```

Create the destination directory privately before receiving. The optional expected hash selects the exact member shown by Export. The command authenticates the original workspace, reads that member's retained manifest, sends `If-Match`, streams the response to a private temporary file, checks length and SHA-256, fsyncs, and exclusively publishes the complete file. An existing destination is preserved.

Files up to the original 4 GiB limit are received without loading the whole file into memory. An interrupted incomplete receive can be retried with the same export/member identity. The server also supports authenticated `HEAD`, `If-Match` and a single byte range for existing receiving clients.

## Installed source integration

The distribution contribution adds the `api-merchant-workspace` command, this operator guide and its source-owned Applications provider. It exports the configuration, model, server and CLI entrypoints through the installed package. The common Applications dispatcher and review renderer load that declaration through the original provider registry.

The product adds no package dependency. It uses the installed Node and original Python engines. The durable queue records native requests and results under the original workspace lease; native checkout, payment, access, execution, snapshot and recovery engines retain their existing implementations and identities.
