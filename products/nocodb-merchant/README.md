# NocoDB merchant project

This product puts the original NocoDB source workspace, its browser, authenticated merchant MCP, dataset publisher and SF82 release workflow behind one installed project entry. It also retains a complete private source-packet download and a receiving continuation for an already completed NocoDB operation.

Run `starforge nocodb-project open` to open the original browser and MCP together. They share the same authoring model, publisher, scheduler and workspace lease. Closing the project drains that owner; opening it again reads the same saved drafts, source versions, publisher plans and release state.

The product uses the original NocoDB v3 reader and typed extractor. The source-owned NocoDB Applications contribution and the original merchant provider remain the installed registration mechanisms. This addition does not introduce a second record store, extraction engine, payment engine or release format.

## What is included

| Entry | Purpose |
| --- | --- |
| `nocodb-project` | Prepare, inspect, open and close one installed merchant project; import a declared private source; call the original MCP tools; recover the original request. |
| `nocodb-receive` | Continue the original completed operation through browser/MCP receiving, exact retained source packets, existing published editions and optional existing merchant packages, then reopen the same workspace. |
| `nocodb-workspace` | The complete original source authoring CLI and browser. |
| `nocodb-source` | Original v3 discovery, complete capture, source import and freezing. |
| `nocodb-publisher` | Original saved query/plan, extraction, review, publication and scheduling. |
| `nocodb-deployment` | Original published-run review, five-file merchant staging, SF82 release staging and console. |
| `runtime-workspace` | Original installed Applications review, Start, Open, Stop and reopen. |
| `merchant-mcp` | Original merchant tool server and source-owned providers. |
| `client` and `releases` | Original customer client export and merchant release operations. |

Implementation entry points are `project.mjs`, `mcp-client.mjs`, `cli.mjs` and `receive.mjs` in this directory. `SOURCE_LINEAGE.json` identifies the original source cut and the one coordinated original-model correction: reopening an existing SF82 store validates its saved state instead of calling the create-only initializer again.

The current source delivery is complete. A source review or a 402 response does not establish that a payment settled. The existing provider, paid-buyer and Applications operation keeps its own actual result and source cut. This project's receiving result is a following same-operation result, and explicitly records zero additional provider reads, publisher extractions, seller starts and payments.

## Install the selected original distribution

Use Linux or macOS with Node 24, ordinary POSIX file locking, Python 3 for the original native buyer/governor tools, and the original runtime dependencies. The browser receiving leg also needs an existing Playwright module and Chromium executable. No browser is downloaded by the product.

Set absolute paths and the exact selected source commit before running the original builder:

```bash
NOCODB_REPO=/absolute/checkout/tjlabs-stellar-merchant-workspace
NOCODB_COMMIT=EXACT_REVIEWED_40_CHARACTER_COMMIT
NOCODB_RELEASE=/absolute/private/nocodb-release
NOCODB_RUNTIME=/absolute/private/nocodb-runtime
NOCODB_DIST="$NOCODB_REPO/stellar/scf-starforge-20261009/distribution"

node "$NOCODB_DIST/build.mjs" \
  --repo "$NOCODB_REPO" --ref "$NOCODB_COMMIT" \
  --selection nocodb-merchant --out "$NOCODB_RELEASE"
```

The selected recipe is `stellar/scf-starforge-20261009/distribution/selections/nocodb-merchant.json`. It retains the whole original source components needed by authoring, MCP, publication, SF82, buyer/governor and customer export. The original builder resolves static imports and browser assets, and produces `package/source`, `package/manifest.json` and its normal packaged archive. Reopen an interrupted build with the same arguments and `--resume`; keep the selected commit and output directory.

Read the real `distribution.json` receipt. Require its original `PACKAGED` status and selected source commit. Use its exact archive path and SHA256. Save the following private pins JSON once:

```json
{
  "@x402/core": "2.28.0",
  "@x402/stellar": "2.28.0",
  "@x402/extensions": "2.28.0",
  "@stellar/stellar-sdk": "16.3.0"
}
```

Then use the maintained installer:

```bash
node "$NOCODB_DIST/runtime-install-cli.mjs" prepare \
  --dir "$NOCODB_RUNTIME" \
  --archive "$NOCODB_ARCHIVE" --sha256 "$NOCODB_ARCHIVE_SHA256" \
  --native --feature mcp --operator --pins "$NOCODB_PINS_FILE"

node "$NOCODB_DIST/runtime-install-cli.mjs" install --dir "$NOCODB_RUNTIME"
node "$NOCODB_DIST/runtime-install-cli.mjs" inspect --dir "$NOCODB_RUNTIME" --load --source

NOCODB_FORGE="$NOCODB_RUNTIME/package/source/stellar/scf-starforge-20261009/distribution/cli.mjs"
node "$NOCODB_FORGE" nocodb-project --help
```

The MCP feature is required. The four explicit native pins supplement the original selected MCP dependencies; they do not replace them. Dependencies resolve from the common installed runtime ancestry, `RUNTIME/node_modules`. An installation confined to a sibling buyer directory does not satisfy Node ESM imports in the facilitator or seller.

For an existing prepared runtime, use the original `runtime-install-cli.mjs resume --dir SAME_RUNTIME`. Do not prepare another directory to hide an interrupted installation. A source-only archive is not an installed native runtime.

The project entry checks the original runtime receipt, lock/profile and source manifest, requires the declared NocoDB/provider files, and verifies that its executing project module is the one selected by that manifest.

## Prepare a private project

The setup file uses schema `stellar-forge.nocodb-merchant-project-request.v1`. The minimum input is:

```json
{
  "schema": "stellar-forge.nocodb-merchant-project-request.v1",
  "runtimeDirectory": "/absolute/private/nocodb-runtime",
  "directory": "/absolute/private/customer-nocodb-project",
  "title": "Customer NocoDB merchant"
}
```

Save it with mode 0600 in a private directory, then run:

```bash
node "$NOCODB_FORGE" nocodb-project prepare --settings /absolute/private/setup.json
node "$NOCODB_FORGE" nocodb-project status --directory /absolute/private/customer-nocodb-project
node "$NOCODB_FORGE" nocodb-project open --directory /absolute/private/customer-nocodb-project --port 0
```

`prepare` creates the original private authoring workspace, a host-declared MCP configuration, private local bearer and original merchant/release configuration. It does not import a source, query NocoDB, publish data, start a seller or sign a payment.

`open` prints a compact JSON listener result with the original browser URL, MCP endpoint, workspace alias and token-file locator. The token value is not printed. Open that browser URL locally; its original one-time token fragment establishes the browser session. The MCP endpoint binds loopback and requires the retained private bearer.

Ctrl-C or SIGTERM closes HTTP admission and drains the original browser/provider, packet reads, publisher/scheduler and managed deployment service. The next identical `open` reuses the same state. If original drain is unresolved, the foreground command retains its owner and reports the issue; another signal retries that same close. It does not kill a guessed process or remove the native lock file.

### Adopt an existing completed workspace

Add `workspaceDirectory` to the setup to adopt the original closed authoring directory:

```json
{
  "schema": "stellar-forge.nocodb-merchant-project-request.v1",
  "runtimeDirectory": "/absolute/private/nocodb-runtime",
  "directory": "/absolute/private/customer-project",
  "workspaceDirectory": "/absolute/original/nocodb-authoring",
  "title": "Existing NocoDB merchant"
}
```

The new project, runtime and adopted workspace must be separate directories. Preparation inspects the existing original settings/database identity; it does not copy, rename or reset the workspace. Absolute native dataset and release bindings remain intact. For relocation to another host, use the original portable source packet or supported workspace/runtime transfer, rather than editing retained absolute paths inside hash-bound files.

The project setup is immutable. Repeating preparation with exactly the same saved settings recovers its own interrupted initialization or reopens its completed result. A different title, workspace, connection file, declared input or runtime is a different setup. For a deliberate host-configuration change, close the old owner and prepare a separate project wrapper around the same original workspace, preserving both configuration histories.

## Choose a source

The browser supports both a retained complete source and an explicit live NocoDB observation.

### Existing complete source or private packet

Add named inputs to the private setup before preparation:

```json
{
  "inputs": {
    "captured": {
      "kind": "source",
      "file": "/absolute/private/frozen-source.json",
      "sha256": "EXACT_WHOLE_SOURCE_SHA256",
      "label": "Completed source observation"
    },
    "portable": {
      "kind": "packet",
      "file": "/absolute/private/nocodb-source-packet.json",
      "sha256": "EXACT_WHOLE_PACKET_SHA256",
      "label": "Private source handoff"
    }
  }
}
```

These fields extend the complete setup object; the example is not a separate setup schema. A source input must be an original frozen capture-backed declaration with its complete referenced capture. A packet contains the original declaration, schema/count observations and complete pages. Preparation pins the declared files; import invokes the original packet validator and reader.

With the project closed, first read its current native draft revision. Generate and retain one request UUID before dispatch:

```bash
node "$NOCODB_FORGE" nocodb-project native-status --directory "$NOCODB_PROJECT"
node "$NOCODB_FORGE" nocodb-project uuid
node "$NOCODB_FORGE" nocodb-project import \
  --directory "$NOCODB_PROJECT" --input captured \
  --title "Completed captured source" --expected-revision "$NOCODB_DRAFT_REVISION" \
  --request-id "$NOCODB_IMPORT_REQUEST"
```

The returned `draftSaved` is significant. If another window advanced the draft, the original model can retain the valid capture while leaving the current draft unchanged. Inspect that result and deliberately load the desired capture; do not treat retention as permission to overwrite the newer draft.

While the project is open, the original MCP `merchant_nocodb_import` or `merchant_nocodb_import_packet` performs the same import using the declared input alias, exact file SHA256, title, current draft revision and request UUID. No arbitrary remote file path can be supplied by the tool caller.

### Host-declared live NocoDB connection

Create a private JSON map with actual host connection references:

```json
{
  "customer": {
    "label": "Customer NocoDB read connection",
    "server": "https://nocodb.example.org",
    "tokenEnv": "CUSTOMER_NOCODB_READ_TOKEN",
    "pageSize": 25
  }
}
```

Set `connectionsFile` in the setup to that absolute private path. The project validates it through the original connection reader and retains those exact configuration bytes. The token stays in the host's environment or secret manager; the configuration contains only its variable name. Rotating the value behind the same declared variable does not put the token into project exports.

The original reader also supports its explicit request limits and an explicit `allowHttp` option for an authorized development service. Use the original source guide for those settings. Avoid copying a provider secret into a URL, setup JSON, request file or public source.

In the browser, choose the declared connection and actual base/table/view/filter. Discovery reads original v3 metadata without extracting records. Select the actual native field IDs/types and a stable source order before a full capture. Discovery alone may have no order; a source capture requires the original complete identity order. Missing selected view fields fail rather than being replaced with fabricated nulls.

The original complete reader retains opening/closing table metadata and row counts, every received page and terminal pagination. This is a paged observation. Concurrent upstream writes can still matter; the product does not label it a transactional database snapshot. If an observation is interrupted, read the original attempt and receipt. Do not splice unrelated page histories or automatically repeat an uncertain provider read.

Nested linked, attachment or aggregate values are not assumed complete scalar source records. Use only the original supported complete scalar/identity encodings. Numeric tokens can be retained as explicit number text instead of losing precision through an implicit JavaScript conversion.

## Review the public projection and save source versions

The original Review view shows retained field IDs/types, source identity, capture counts and the query projection. Edit public aliases, scalar type, native/number-text/identity encoding, nullable handling and empty-string handling against those original source fields.

The captured field/type union, server, table, view/filter and native source order remain bound to the original observation. The original publisher plan can then expose a selected subset of those reviewed public columns and an explicit extraction order. This authoring layer does not invent a new row filter. Unless the original captured view/filter or selected source query says otherwise, all retained rows for that query are considered by the original extractor.

Save the draft with its current revision. Preview validates every retained row through the original typed extractor and shows the original per-query report and sample. The ordinary save-version action then binds:

- The exact draft revision and original preview UUID.
- Reviewer and change note.
- Current expected source selection.
- An immutable numeric source version, source SHA256 and capture observation SHA256.

A saved version is not the mutable current-source pointer. Versions retain their own source file and public projection. Compare versions to see original source-selection, observation and projection differences. Reusing an old version is a deliberate current-selection change with the original compare-and-swap guard.

The browser protects drafts from late source/version responses and retains a request through a lost response and failed refresh. The CLI and MCP consume the same model and revision guards. An old successful receipt can identify what happened; it does not prove a past browser or deployment URL is still open.

## Publish through the original publisher

Select a reviewed saved source version, then use **Open publisher** in the original browser, or `merchant_nocodb_publisher_open` with the current expected selected version and a retained request UUID.

This opens the same authoring-owned publisher directory and original scheduler. Browser actions and `merchant_nocodb_publisher_*` tools borrow that one publisher. They do not open a competing independent publisher map. Existing enabled policies may resume when the original publisher opens, so check their retained state as part of ordinary operation.

Use the original flow:

1. Save a publisher plan against the selected source version and query.
2. Choose the public columns, exact types/null handling and extraction order.
3. Extract the retained source through the original typed encoder.
4. Review the exact candidate, counts, dataset/config bytes and source binding.
5. Publish that reviewed candidate into the original version store.
6. Open the original buyer/client handoff for the actual published snapshot.

Original plan IDs are integers. UUID-named plan folders and extraction run UUIDs are different identities. Preserve all of them from native receipts; do not substitute a folder UUID where an API requires the plan integer.

A new selected authoring version does not silently rewrite old publisher plans. Create or select the intended original plan explicitly. Completed publication and recovery use the existing publisher request IDs and immutable candidate identity.

Full original instructions: `../../stellar/scf-starforge-20261009/sf30-seller-sdk/nocodb/WORKSPACE.md` and `../../stellar/scf-starforge-20261009/sf30-seller-sdk/nocodb/README.md`.

## Stage, run, restart and roll back the original merchant

The original deployment review binds one published run and one source version to explicit merchant terms. Payment amounts are integer atomic-unit strings. Review the actual network, asset, recipient, amount, URL and route before preparing the package.

The original deployment sequence is available through the browser and the source-owned MCP tools:

| Original action | Binding to retain |
| --- | --- |
| `merchant_nocodb_deployment_status` | Existing runs, exact published snapshots, numeric plans, release generation and live console ownership. |
| `merchant_nocodb_deployment_review` | Source version, published run UUID, merchant terms and review request UUID. |
| `merchant_nocodb_deployment_prepare` | Review request and returned review SHA256; its own package request UUID. |
| `merchant_nocodb_deployment_package` | Exact completed five-file package and source SHA256. |
| `merchant_nocodb_deployment_stage` | Package request, source SHA256, stable release ID and normalized runtime. |
| `merchant_nocodb_deployment_compare` | Current selection generation and original release difference. |
| `merchant_nocodb_deployment_console_open` | Current original console instance and current URL. |
| `merchant_nocodb_deployment_command` | Current console ID, selection generation, expected release digest and, for stop/restart, exact owned seller instance ID. |

The coordinated model correction validates and reopens an existing original release store. It initializes only a positively absent store. An existing partial or invalid store is retained for explicit original recovery, rather than reset.

Stage does not activate or run a seller. The subsequent original activate, run, stop, restart and rollback actions keep their own native compare-and-swap and ownership checks. A new console cannot stop a seller just because a port matches. After an uncertain command, inspect its original request and current deployment; do not automatically repeat a potentially completed activation or stop.

The five staging members are `dataset.csv`, `dataset.json`, `seller.json`, `source.json` and `binding.json`. They retain the reviewed public dataset projection. The staging binding also retains the real absolute local dataset directory needed by SF82.

**This is a private merchant staging package.** Preserve that native binding; do not relabel it as a portable public customer package or remove its path without using the original migration/export mechanism. Use the existing client/release exporter for customer delivery. Its selected SDK/config/manifest and public data are distinct from a merchant operator's full source capture.

The original TESTNET buyer, SF88/SF43 transfer, SF36 Governor and finality reconciliation remain the payment authorities. The receiving continuation below performs no payment. Attach the original actual paid result if payment proof belongs in a customer handoff.

## Authenticated MCP from the same open project

The built-in client uses the original merchant transport and validates the remote original workspace identity. It reads the private local bearer file without printing its value.

Save a private request JSON, for example:

```json
{
  "tool": "merchant_nocodb_status",
  "args": { "workspace": "merchant" }
}
```

```bash
node "$NOCODB_FORGE" nocodb-project call \
  --directory "$NOCODB_PROJECT" --request /absolute/private/status-request.json
```

The client permits the original `merchant_nocodb_*` tools and `merchant_status`; the source-owned catalog validates each original argument. The workspace alias is fixed to `merchant`. This command dispatches one call. It does not turn a timeout into an automatic mutation replay.

For a preview, first save a request with the actual current draft revision and a UUID generated by `nocodb-project uuid`:

```json
{
  "tool": "merchant_nocodb_preview",
  "args": {
    "workspace": "merchant",
    "draftRevision": 1,
    "requestId": "RETAIN_ONE_ACTUAL_UUID_HERE"
  }
}
```

Replace the illustrative revision and UUID with the original current values. The source-owned catalog defines the exact version-save, draft-save, source capture and deployment schemas.

After a lost reply, call `merchant_nocodb_operation` for that same UUID. If the native operation is complete, consume its original result. If it is interrupted and the original model supports continuation, call `merchant_nocodb_resume` with that same UUID. A failed native observation remains failed; a current original read/selection is required before a deliberate new observation.

With the project closed, the equivalent local commands are:

```bash
node "$NOCODB_FORGE" nocodb-project operation --directory "$NOCODB_PROJECT" --request-id "$NOCODB_REQUEST"
node "$NOCODB_FORGE" nocodb-project resume --directory "$NOCODB_PROJECT" --request-id "$NOCODB_REQUEST"
```

Do not use those closed-model commands while this project's browser/MCP owner is open. The original lease rejects a competing opener.

## Complete private packet download and portable reopen

A source packet contains all captured metadata/count/page bytes, the selected query projection and original server/table/view/filter/order provenance. Credential values and connection-token references are excluded by the original packet builder, but the records and source identity remain private operator data.

For one immutable source version:

```bash
node "$NOCODB_FORGE" nocodb-project download-private \
  --directory "$NOCODB_PROJECT" \
  --version "$NOCODB_VERSION" --source-sha256 "$NOCODB_SOURCE_SHA256" \
  --out /absolute/private/download-source-v1
```

The original MCP reader sends 128 KiB chunks pinned to version, whole-file SHA256 and offset. The client retains a named partial file, native descriptor, prefix SHA256 and exact download input. Each data write is synchronized before its progress is committed.

Rerun the same command after an interrupted transfer. It verifies the durable prefix, removes only its own uncommitted tail, and resumes the same original version/file/hash/offset. A positively expired native read can be reopened at that offset. A changed version/hash or ambiguous I/O result is not a reason to accept other bytes.

When complete, the original packet validator checks every original capture member and the whole packet before publishing `packet.json`. A complete retained packet can be inspected after the server closes:

```bash
node "$NOCODB_FORGE" nocodb-project inspect-download \
  --directory "$NOCODB_PROJECT" --out /absolute/private/download-source-v1
```

A closed original project can also use `export-private` to write the original complete packet directly. It checks the supplied version/source SHA256 and uses an exclusive exact-byte destination.

To reopen on another host, install the selected original runtime, prepare a new private project with that packet as a declared input, and import it through the original model. This creates new local capture/version identities when the operator explicitly reviews and saves them. It does not pretend that a new workspace is the original publisher database or silently recreate old publication/payment receipts.

Keep the original completed merchant workspace and its published-run receipts when operational history must remain identical. The packet is source portability, not a fabricated transplant of the old publisher/release ledger.

## Original installed Applications

The selected recipe includes the original `nocodb` Applications contribution and launcher. The project writes `application-settings.json` containing the same existing authoring workspace and optional copied connection-file reference.

After closing the project foreground owner, review those settings in the original installed Applications UI and use its normal Save/Start/Open/Stop/reopen path. It launches the original `nocodb-workspace` source with its source-directory/hash, native immutable workspace identity and connection-file hash. The original startup observer checks the actual selected and executed source before showing a live URL.

The Applications launcher and project foreground entry are alternative owners of the same workspace. Stop and drain one before starting the other. Their original lease prevents simultaneous editing by separate models. The product does not add a competing launcher, copied process controller or synthetic READY state.

The existing full paid/Applications receiving program remains under `sf30-seller-sdk/nocodb/` with its own guide and original operation ID. Do not start another provider/native run merely to exercise this selected package.

## Same-operation receiving of completed editions

`nocodb-receive` consumes the actual completed original result and a closed original authoring/publisher workspace. It prepares the installed project wrapper, checks original immutable source versions and published runs, opens the actual browser/MCP, retains complete private packets, reads any supplied original merchant staging packages, drains, and reopens the same model.

Run it sequentially after the existing original provider, publisher, managed merchant and any paid/Applications stages have closed their services. The caller provides its actual existing Playwright module and executable. For an admitted cloud operation, keep the original command/record authority and declare the complete receiving footprint; the program creates no scheduler job.

The private input schema is `stellar-forge.nocodb-project-receiving.v1`:

| Field | Required value |
| --- | --- |
| `operationId` | The existing business operation identifier. |
| `outputDirectory` | One new private directory, separate from project, runtime and original workspace. |
| `project` | The full project setup object above, with `workspaceDirectory` set to the original closed workspace. |
| `originalResult.file / sha256` | Actual original complete result bytes and whole SHA256. Its reported state is retained verbatim, not promoted to new payment proof. |
| `expected.selectedVersion / draftRevision` | Exact current original selected source version and saved draft revision. |
| `expected.versions[]` | Each original numeric `id`, `sourceSha256`, `observationSha256` and `rowCount`. Include the selected version. |
| `expected.publications[]` | Existing run UUID `id`, integer `planId`, `sourceSha256`, published `snapshot`, and optional original `revision`. At least one completed publication is required. |
| `expected.packages[]` | Optional existing package `requestId`, `sourceSha256` and all five `files[{name,bytes,sha256}]` from the actual original package. |
| `browser.module / executable` | Absolute existing Playwright module entry and Chromium executable. |
| `maximumFileBytes` | Optional explicit bound for one staging file, default 32 MiB, at most the original 256,000,000-byte retained-file limit. Account for this in the existing operation's memory declaration. |

Read these identities from the actual original version/publisher/package results. Do not substitute provider-summary row counts for received full capture hashes or synthesize missing run/package IDs.

```bash
node "$NOCODB_FORGE" nocodb-receive --input /absolute/private/receiving.json
```

The program retains its exact input before opening the project. It verifies original source versions and numeric plan/run identities, checks both desktop and mobile original browser views, and downloads source packets through the actual authenticated MCP reader. Its second host lifetime verifies that the same saved versions, publications and selection reopen.

`result.json` retains stage results, input/source manifest hashes, original result hash, complete packet identities, optional five-file merchant packages and two screenshots. Successful receiving explicitly records zero new provider reads, publisher extractions, seller starts and payments. Those prior actions remain supported only by their original result.

Rerun the same input after interruption. Completed immutable files and stages are reopened; the program never selects an old source over a newer draft. An incomplete run with changed draft/selection stops for reconciliation. A fully completed result reopens its retained packet/file evidence without reopening the merchant or overwriting a later legitimate selection. The original receiving lease remains held until its own browser and native host have drained.

## Recovery and private state

| Observed state | Supported next action |
| --- | --- |
| Preparation interrupted before `project.json` | Repeat the exact saved setup. The project preserves its intent and original initializer state. |
| Original merchant initialization positively incomplete | The same preparation retains its unpublished partial directory and starts a documented next initializer attempt. Invalid/corrupt/uncertain state is left for inspection. |
| A model is already open | Use that original owner, or stop/drain it; keep the permanent native lock inode. |
| Mutation response lost | Inspect the original UUID and current state before using native resume. |
| Capture/discovery outcome uncertain | Read the original attempt/receipt; do not automatically observe the provider again. |
| Packet transfer interrupted | Repeat the exact version/source/hash/output request; preserve its progress and partial bytes. |
| Original SF82 store exists | Validate/read that store and open the original console. Do not initialize it again. |
| Seller action response lost | Inspect original command receipt, console ownership, release generation and current seller instance. |
| Closed session file still shows an old URL | Run the same project `open`; the file is a locator, and authenticated current native identity is authoritative. |
| A dependency install is incomplete | Resume the original runtime installer in that same runtime directory. |
| Native drain failed | Keep that owner alive and retry its close. Do not start a second project or remove a lock to bypass it. |

Project state contains private connection references, opaque local bearer, original workspace identity, host input paths, MCP/release configuration and request receipts. Source packet outputs contain complete private captured data. Preserve these through the existing private artifact/backup path; keep them outside the public source repository.

Customer-facing delivery uses the original reviewed public projection and client/release exports. Review the exact output scope at that point, including filenames, public schema, price/network/recipient terms, delivered snapshot and original payment/result identity where applicable.

## Source interfaces

```js
import {
  prepareProject, readProject, inspectProject, nativeStatus, openProject,
  importDeclaredInput, inspectOperation, resumeOperation, exportPrivateVersion,
} from './project.mjs';
import {
  connectProject, callProject, downloadPrivateVersion, inspectPrivateDownload,
} from './mcp-client.mjs';
import { receiveProject } from './receive.mjs';
```

`openProject` returns the original operator, live session, guarded in-process `call` and draining `close`. For a separate CLI/process, `callProject` uses the original authenticated transport. The closed-model helpers take the original project and model leases; they are not alternate writers beside the open service.

Public source and licenses remain those of the selected original components. This product's additive code is MIT. The original full distribution manifest remains the complete source and dependency identity; `SOURCE_LINEAGE.json` explains the source relationship and does not replace that manifest.
