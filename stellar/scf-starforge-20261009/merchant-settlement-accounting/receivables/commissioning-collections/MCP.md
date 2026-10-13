# Commissioning collections through the merchant agent

The existing accounting MCP session now exposes the complete commissioning source, customer selection, review, capture and original-file workflow. The agent adapter borrows its active ReceivablesWorkspace and original AccountingWorkspace lease. The browser, native CLI and agent interface use the same retained sources, immutable captures and request journal.

Install the `merchant-commissioning-collections` selected product to include the operator, native CLI, merchant MCP host and typed agent SDK. The default package name is `@tokenjunkielabs/starforge-merchant`; check the installed `package.json` when an installation uses a different name. The installed executable is `starforge`.

The main [commissioning guide](README.md) explains source editions, milestone controls, invoice-line and settlement capacities, physical receipts/refunds, Xero cycles and the private capture archive. This guide covers the connected agent interface and prepared remote operations.

## Existing host and source selection

Use the existing merchant MCP listener and a configured accounting workspace alias. Its original account directory, outbox, proof directory and terms remain authoritative. Optional `receivablesInputs` entries map source aliases to original host files. Inspect an alias through `source_inspect` to obtain the actual resolved bytes; the reply includes `sourceInput`, the exact native input needed for import.

An alias is resolved once during inspection. A later prepared import uses those saved bytes, the inspected filename and SHA-256, and the original accounting revision. Changing the host file afterward cannot change the retained request.

The original source limit is **8 MiB**. The existing merchant HTTP transport admits **32 MiB** requests for this workflow. The connected SDK explicitly uses the original **128 MiB** response ceiling so an inspection can preserve both normalized project records and the complete original source bytes. The native parser, account validation and transport remain authoritative.

## Operations

All names use the prefix `merchant_accounting_commissioning_`. Every request includes its configured `workspace`; the typed client supplies that field.

| Suffix | Typed client method | Result and purpose |
| --- | --- | --- |
| `source_inspect` | `inspectSource` | Original source inspection plus exact resolved `sourceInput` |
| `source_import` | `importSource` | Retained source edition and original mutation operation |
| `source_list` | `sources` | Paged original source editions |
| `source_detail` | `source` | Source summary or paged projects/history and original file selectors |
| `candidates` | `candidates` | Original customers, invoice lines, allocations, credits, receipts, refunds or Xero cycles |
| `preview` | `preview` | Complete normalized selection, native review, revision and preview SHA |
| `capture` | `capture` | Immutable saved review and original request operation |
| `capture_list` | `captures` | Paged saved captures |
| `capture_detail` | `detail` | Complete saved capture with exact file identities and selectors |
| `capture_export` | `export` | Private export metadata, original file selectors and archive selection |
| `request_lookup` | `request` | Original operation journal entry and current saved result |

Native source/list/candidate/capture pages accept `offset` and `limit` from 1 to 200. Source detail uses `view: 'summary' | 'projects' | 'history'`. The SDK's `listAll` retains one workspace revision and accounting date while paging. A changed revision makes the reader report the changed observation, allowing the caller to start a fresh read.

All mutation requests retain the original `actor`, stable `requestId` and `revision`. Import uses native action `commissioning_source_imported`. Capture uses `commissioning_collections_captured` and the original source ID. The adapter preserves native value insertion order when reconstructing the original intent.

## Typed SDK: inspect and retain one source edition

```js
import {
  connectAccountingCommissioningClient,
  accountingCommissioningImportArguments,
  accountingCommissioningCaptureArguments,
} from '@tokenjunkielabs/starforge-merchant/merchant/accounting-commissioning';

const client = await connectAccountingCommissioningClient({
  url: process.env.MERCHANT_MCP_URL,
  workspace: 'merchant',
  tokenEnv: 'MCP_ACCESS_TOKEN',
});

try {
  await client.open();

  const inspection = await client.inspectSource({
    sourceAlias: 'current-workshares',
    file: {name: 'workshares.json'},
    currencyScales: {GBP: 2, EUR: 2, USD: 2},
    label: 'Current original workshare edition',
  });

  // Retain the complete inspection before importing.
  const input = accountingCommissioningImportArguments(inspection, {
    actor: 'Operations',
    requestId: 'commissioning-source-2026-10-13-01',
  });
  const imported = await client.importSource(input);
  const sourceId = imported.source.id;

  const invoiceCandidates = await client.listAll('candidates', {
    view: 'invoices',
    sourceId,
    projectId: inspection.projects[0].id,
    asOf: '2026-10-13',
  });
  // Save the actual returned invoice identities and line SHA values
  // before building the explicit project selection.
} finally {
  await client.disconnect();
}
```

Inline inspection uses the same native `file: {name, dataBase64}` instead of `sourceAlias`. The import helper verifies canonical base64, exact original byte length and SHA. Optional `label`, `receivedAt` and `replacesSourceId` describe the retained edition. No original source amount or project ID is inferred from a prospect's contact stage.

The connection can also accept a connection-local `bearerToken` when embedding in an existing authenticated process. It is copied into a private connection-local environment object and never written to `process.env` or saved operation files. Borrowed integrations can use `createAccountingCommissioningClient({workspace, call})` with an existing structured MCP call.

## Review and capture

Use native candidate results to select customer bindings, original invoice line portions, allocation and credit portions, physical receipts/refunds and saved Xero cycles. The exact selection is documented in the main guide. The SDK uses flat MCP arguments:

```js
const preview = await client.preview({
  sourceId,
  asOf: '2026-10-13',
  projectIds: selectedProjectIds,
  projects: originalProjectBindings,
  label: 'Customer collections review',
  baselineCaptureId: previousCaptureId,
});

// Preserve the complete preview; the helper verifies the original review seal.
const request = accountingCommissioningCaptureArguments(preview, {
  actor: 'Operations',
  requestId: 'commissioning-capture-2026-10-13-01',
});
const saved = await client.capture(request);
const detail = await client.detail({captureId: saved.capture.id});
```

The preview includes the full normalized selection, source identity, original account revision and native review SHA. The helper verifies the complete review using the original pretty-JSON-plus-newline representation. Capture recompiles the original native review at the original revision.

Both `READY` and `REVIEW` captures can be retained. Findings remain part of the immutable handover. A capture records the reviewed original financial state; it does not issue invoices, collect cash, move funds or change the original customer balances.

## Durable CLI preparation and recovery

Connection options are `--url`, `--workspace` and `--token-env`. Tokens stay in the named environment variable. Source inputs, saved reviews and operation files are private regular files; create the parent operation directory with mode 0700 and input files with mode 0600.

```sh
starforge merchant-accounting-commissioning source-inspect \
  --url "$MERCHANT_MCP_URL" --workspace merchant \
  --request /private/inspect.json --out /private/inspected-source.json

starforge merchant-accounting-commissioning prepare \
  --dir /private/import-operation --url "$MERCHANT_MCP_URL" --workspace merchant \
  --action source-import --preview /private/inspected-source.json \
  --actor Operations --request-id commissioning-source-2026-10-13-01

starforge merchant-accounting-commissioning execute --dir /private/import-operation
starforge merchant-accounting-commissioning reconcile --dir /private/import-operation
```

Capture uses the same sequence:

```sh
starforge merchant-accounting-commissioning preview \
  --url "$MERCHANT_MCP_URL" --workspace merchant \
  --request /private/capture-selection.json --out /private/capture-preview.json

starforge merchant-accounting-commissioning prepare \
  --dir /private/capture-operation --url "$MERCHANT_MCP_URL" --workspace merchant \
  --action capture --preview /private/capture-preview.json \
  --actor Operations --request-id commissioning-capture-2026-10-13-01

starforge merchant-accounting-commissioning execute --dir /private/capture-operation
```

The prepared directory binds the endpoint, workspace alias, token variable name, exact original arguments and complete inspection/preview. `execute` reads the original request journal first. If the request is absent, it submits at most one mutation. After a lost response it makes one journal lookup using the same request. `reconcile` validates the original action and complete intent SHA before reporting a matching operation.

The original error flags `outcomeUnknown`, `reopenRequired` and `commitUncertainty` are preserved in the CLI's saved operation state and structured error. When the original workspace requires reopening, close that original owner and reopen it, then reconcile the same prepared operation. A reused request ID with different source bytes, selection or action is rejected. The connection never automatically changes an accounting revision or generates a replacement mutation after an uncertain reply.

A caller that already has exact native arguments can prepare them with `--request` instead of `--preview`. This is useful when adding original source edition metadata. The prepared CLI is also available as typed functions from `/merchant/accounting-commissioning/operations`.

## Complete original downloads

The original `merchant_accounting_file` reader has two additional kinds:

| Kind | Required selector | Files |
| --- | --- | --- |
| `commissioning-source` | `sourceId` | Exact original workshares, normalized source and source receipt |
| `commissioning-capture` | `captureId` | Review, selected reports, baseline, original-file index, complete private snapshot, original advice and `handover.tar` |

```js
const packet = await client.export({captureId});
const {bytes, file} = await client.fileBytes(packet.archive);

const detail = await client.detail({captureId});
const report = detail.capture.files.find(
  item => item.name === 'commissioning-handover.html'
);
const original = await client.fileBytes(report.selection, {
  expectedSha256: report.sha256,
});
```

The retained reader pins the original file identity on the first chunk, verifies the complete SHA and releases unfinished reads. `fileChunks` supports streaming; `fileBytes` assembles a file within the native export limit. The CLI streams to a new private output and creates the final destination once:

```sh
starforge merchant-accounting-commissioning capture-export \
  --url "$MERCHANT_MCP_URL" --workspace merchant \
  --request /private/capture-id.json --out /private/commissioning-handover.tar
```

**The full handover archive includes the complete original receivables data and customer identities.** Selected project HTML/CSV reports are separate deliverables. The export response identifies this as `PRIVATE_COMPLETE_ACCOUNT`. Repeated identical attachments are physically stored once; their original origins, names, byte hashes and roles remain in the immutable index.

`disconnect()` releases this caller's reads and leaves the existing accounting owner open. `closeWorkspace()` explicitly drains the caller and closes that owner. A failed read drain remains retryable with its original retained handles.

## Original receiving programs

The maintained whole customer journey is `XERO_CASH_CHECK.mjs`. Its optional `--commissioning-mcp` continuation runs after the original native/HTTP sequence and reopens the same account through the actual merchant host and authenticated loopback MCP listener. It exercises configured-source inspection with a subsequent host-file change, exact retained import, prepared CLI capture/recovery, original file chunks, private archive, native uncertainty and owner reopen.

The existing `SELECTED_RECEIVABLES_CHECK.mjs --commissioning` builds the actual recipe, installs its archive and checks the installed commands, typed/runtime exports and original browser/module resources. Use the final full Git source ref and existing dependency caches for the original receiving operation; preserve resulting files and process output.
