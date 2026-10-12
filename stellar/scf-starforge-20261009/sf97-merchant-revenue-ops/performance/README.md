# Merchant performance: recorded usage to a revised tariff proposal

Use Performance to compare a completed tariff selection with an original saved usage source, retain the complete comparison, and prepare a new monthly-volume proposal through the existing Tariff and Pricing owners. The same saved performance source can travel with a Commercial case and its customer receiving package.

The installed command is `merchant-performance`. Its browser, HTTP client and native CLI share `openPerformanceWorkspace({ model, tariffs, directory })` over the original Pricing state directory. Both the merchant economics and merchant support products include the command and typed client.

## What the comparison means

A completed tariff selection retains two related prices. The original tariff curve calculates an exact total at a specified quantity. The original Pricing selection uses a uniform per-request quote derived from that curve. A graduated curve charges successive quantity bands at their respective rates; a volume curve applies the selected tier's rate to every request. Performance retains those original distinctions when it evaluates the observed quantity.

The saved uniform quote and the tariff total can therefore differ at the observed quantity. The review records the saved-quote value, the tariff value and their signed difference. These amounts describe the selected route and explicit count basis. The original usage source, payment-option selection, cost edition and service-period source remain part of the saved review.

Quantities and USD amounts use canonical decimal strings. The comparison does not require conversion through floating-point numbers. A pricing proposal uses the operator's explicit `proposedMonthlyRequests` string and retains the observed period separately.

## Open the original workspace

Use the seller configuration and state directory that hold the completed tariff selection and original saved Pricing versions. Supply the same source settings used by `revenue-workspace` and `merchant-tariffs`.

~~~bash
merchant-performance serve \
  --config /absolute/path/seller.json \
  --state /absolute/path/pricing \
  --history /absolute/path/observation-history.json
~~~

The command defaults to `serve` and chooses an available loopback port. `--port 4319` selects a port explicitly. The private standalone launch URL appears in the operator's console and contains its workspace token.

Original source options are:

| Option | Source |
| --- | --- |
| `--snapshot FILE` | Original seller snapshot |
| `--history FILE` | Original captured observation history |
| `--ops-url URL` | Existing loopback operations service |
| `--native-outbox PATH` | Original native outbox |
| `--source-package PATH` | Original seller source package |
| `--release-store PATH` | Original release store |
| `--release-runtime FILE` | Complete original release-runtime JSON object |

Supply snapshot and/or history files, or an operations URL. The CLI passes these original settings to `openWorkspace`, opens the original Tariff owner over that model, and then opens Performance in the same directory.

For repeated native commands, a shell function keeps the settings explicit:

~~~bash
perf() {
  merchant-performance "$@" \
    --config /absolute/path/seller.json \
    --state /absolute/path/pricing \
    --history /absolute/path/observation-history.json
}

perf state
perf sources --limit 20
perf list --limit 20
~~~

Each paginated result has `items`, `total` and `nextAfter`. Continue a listing with the returned cursor:

~~~bash
perf sources --after EXACT_NEXT_AFTER --limit 20
~~~

Use the original Pricing application in the managed merchant workspace to move between Pricing, Tariffs and Performance. The installed `revenue-workspace` command remains the owner of the original Pricing console.

## Choose the original selection and usage source

A review binds two different identities:

- `selectionRequestId` is the completed tariff selection's original `pricingRequestId`.
- `usageVersion` is the saved original Pricing observation version used to count actual activity.

Keep both exact values. A later usage version can measure activity against an earlier saved tariff selection.

~~~bash
perf source --version EXACT_USAGE_VERSION --output usage-source.json
~~~

The source response includes the saved version and revision, report hash, observation kind and period, complete observation, route rows, native payment totals when present, and available cost editions. Each route retains its exact route ID, method, path, original quote, HTTP counts and payment-option identities.

### Choose the count basis

| Basis | Quantity source | Additional selection |
| --- | --- | --- |
| `HTTP_2XX` | Original successful HTTP request count | `optionId` and `servicePeriodSourceId` remain null |
| `NATIVE_SUCCESS` | Original native successful-payment activity | Optional exact payment-option SHA-256 ID |
| `INBOX_ACCEPTED` | Original accepted inbox activity | Optional exact payment-option SHA-256 ID |
| `SERVICE_CONSUMED_REQUESTS` | Original service-period consumed requests | Complete retained paired service source |
| `SERVICE_2XX` | Original service-period successful requests | Complete retained paired service source |

Choose `costEdition` as an original cost-edition UUID when applying a saved supplier-cost edition. Its default is null. `costBasis` accepts `BILLED` or `QUOTED` and defaults to `BILLED`. Optional payment-option IDs are valid for `NATIVE_SUCCESS` and `INBOX_ACCEPTED`; the other bases retain null.

Service allowance units and observed requests are separate native measures. A service count basis requires the retained service source and the exact inner-route quote used by the original service compiler.

A complete ordinary usage input looks like this:

~~~json
{
  "selectionRequestId": "EXACT_COMPLETED_PRICING_REQUEST_UUID",
  "usageVersion": "EXACT_SAVED_USAGE_VERSION_UUID",
  "basis": "HTTP_2XX",
  "optionId": null,
  "costEdition": null,
  "costBasis": "BILLED",
  "servicePeriodSourceId": null
}
~~~

Replace the labelled IDs with the retained original values before invoking the command.

## Capture an original service period

For a service count basis, retain both complete original snapshot texts. The native owner normalizes the snapshots and compiles their service period using the existing customer-statement modules.

~~~bash
perf service-period-capture \
  --opening /absolute/path/service-opening.json \
  --closing /absolute/path/service-closing.json \
  --request-id EXACT_NEW_CAPTURE_UUID \
  --label "October service period" \
  --output captured-service-period.json

perf service-periods --limit 20
~~~

The capture result includes `sourceId`, the original request ID, period boundaries, order reference, plan and route IDs, native totals, route rows and the original time basis. Use the returned `sourceId` in the review input's `servicePeriodSourceId`.

A caller may instead provide one complete JSON object through `--input FILE` or `--input -`:

~~~json
{
  "requestId": "EXACT_NEW_CAPTURE_UUID",
  "label": "October service period",
  "opening": {
    "name": "service-opening.json",
    "text": "COMPLETE_ORIGINAL_OPENING_SNAPSHOT_TEXT"
  },
  "closing": {
    "name": "service-closing.json",
    "text": "COMPLETE_ORIGINAL_CLOSING_SNAPSHOT_TEXT"
  }
}
~~~

The `text` members hold the full original UTF-8 document texts. Use the paired-file CLI form when those documents already exist on disk; it reads and retains both complete texts directly.

## Preview and save a performance review

Preview returns the exact wrapper `{ inputs, review }`. The native normalizer supplies the complete `inputs`; the review hash is `review.performanceSha256`.

~~~bash
perf preview --input performance-input.json --output performance-preview.json
~~~

Create a saved request from that preview. Use a nonempty label and a newly generated UUID for this save, then retain the complete request file for the same operation:

~~~javascript
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const { inputs, review } = JSON.parse(
  await readFile('performance-preview.json', 'utf8')
);
const request = {
  requestId: randomUUID(),
  label: 'October usage against the selected tariff',
  performanceSha256: review.performanceSha256,
  inputs
};
await writeFile('performance-save-request.json', JSON.stringify(request, null, 2) + '\n', {
  flag: 'wx',
  mode: 0o600
});
~~~

~~~bash
perf save --input performance-save-request.json --output performance-saved.json
~~~

The saved result has `status: "PERFORMANCE_SAVED"`, `recovered`, the full summary and immutable record. Its `performanceId` is the original save request UUID. The summary includes the source ID, review hash, original selection and usage identities, route and count basis, period and quantity, saved value, tariff value and signed delta.

The saved record retains:

- The original `performanceId`, `requestId` and request-body hash.
- Its label and save timestamp.
- The complete normalized inputs.
- The original performance review and its hash.

Use the saved performance ID to reopen the record and its proposal and selection operations:

~~~bash
perf load --performance EXACT_PERFORMANCE_UUID --output performance-record.json
~~~

`load` returns `{ sourceId, record, operations }`. The operation lists retain their original request bodies, creation times, saved or resumable status, and results. This is the continuation surface for the same saved review.

## Inspect, transfer and receive the complete source

Capture retains the full portable envelope:

~~~bash
perf capture --performance EXACT_PERFORMANCE_UUID --output performance-source.json
perf inspect --input performance-source.json --output performance-inspection.json
~~~

The envelope is `{ schema, id, record, originals }`. Its source ID binds the record and complete original sources. The `originals` object retains:

| Member | Complete retained source |
| --- | --- |
| `pricing` | Original Pricing versions with their original files |
| `tariffPortfolio` | Original selected tariff portfolio |
| `scenarioPlans` | Original scenario plan records |
| `costEdition` | Selected cost edition, files and original source files, or null |
| `servicePeriod` | Full paired service envelope, or null |

Original files retain their name, byte count and SHA-256, with exactly one body encoding: UTF-8 `text` or `base64`. The complete portable source ceiling is 48 MiB, or 50,331,648 bytes.

Inspection performs the native source preflight and returns `{ id, record, review, files }`. Its flattened `files` contain the original names, byte counts and hashes. Use `capture` or the `source.json` download when the receiving operation needs the complete bodies.

Receive that full source in the destination's original Pricing workspace:

~~~bash
merchant-performance receive \
  --config /absolute/path/recipient-seller.json \
  --state /absolute/path/recipient-pricing \
  --history /absolute/path/recipient-history.json \
  --input performance-source.json \
  --output received-performance.json
~~~

The same native receiving owner inspects the complete source and retains its original source members inside the immutable performance envelope. The result is `PERFORMANCE_RECEIVED` with the full summary and record. A retained service-period pair also becomes available in the destination's service picker.

A native proposal uses the original Pricing store's saved tariff source version. For complete native continuation, retain the original full tariff portfolio and create a new original Pricing `WORKSPACE_BACKUP` after the performance review and its proposal requests have been saved. That backup now includes complete performance reviews, paired service sources, their indexes and capture-request records, and the original proposal/selection intents and results. It also retains the original Pricing, scenario, repricing and cost sources. The measured `source.json` remains immutable when later proposals are added.

Restore this backup into a new private directory with the existing `restoreCostWorkspace` receiver and the reviewed archive SHA-256. Reopen the original Pricing model using the host-selected seller and observation paths, then receive the complete companion tariff portfolio through `openTariffWorkspace`. Open Performance over that same restored model and tariff owner. `load(performanceId)` now returns the original proposal and selection history, and the stored exact requests can be replayed with their original UUIDs.

The backup descriptor exposes `snapshot.performance`: review/service/proposal/selection counts and the required tariff plan and selection-request IDs. The original restore preview reports the four performance counts. Unpublished pending files and generated transport exports are rebuilt by their original owners. A fresh capture uses a new backup request UUID; replaying a previous backup UUID returns its original archive.

A received performance envelope alone remains complete for review, export and Commercial material. The original full workspace backup and tariff portfolio provide its later native proposal continuation.

The customer-facing route uses the original Commercial performance material and case package. Its receiving path consumes the same complete source; use the installed Commercial guide for the quote, case and recipient continuation.

### Download retained artifacts

The four filenames are fixed:

| Filename | Content |
| --- | --- |
| `source.json` | Complete portable performance source |
| `review.json` | Saved performance review |
| `review.html` | Readable performance report |
| `usage.csv` | Recorded usage comparison |

~~~bash
perf download --performance EXACT_PERFORMANCE_UUID --name review.html --output review.html
perf download --performance EXACT_PERFORMANCE_UUID --name usage.csv --output usage.csv
~~~

Native downloads return the original bytes. The CLI requires an explicit output path and creates the complete file atomically. Existing output paths are preserved.

## Prepare an explicit monthly-volume proposal

A proposal reuses the original selected tariff source and evaluates an explicit proposed monthly request quantity. Its `sourceVersion` identifies that tariff source; `usageVersion` remains the separate observed usage source in the saved performance review.

Provide a positive canonical integer string at or below 9,007,199,254,740,991:

~~~json
{
  "performanceId": "EXACT_PERFORMANCE_UUID",
  "proposedMonthlyRequests": "1500"
}
~~~

~~~bash
perf proposal --input proposal-input.json --output proposal-preview.json
~~~

The reply retains the performance source and review hashes, proposed monthly requests, observed quantity, basis and period, the original source version and tariff ID, complete tariff inputs, exact comparison, tariff-review hash, comparison ID and `proposalSha256`. Its `preview` is the original Tariff preview wrapper.

The native tariff engine determines the graduated or volume total and the derived uniform quote. A zero observed count remains a valid performance fact; a proposed monthly quantity must be positive so the original selection workflow can create a usable scenario.

### Save the reviewed proposal

Create and retain one complete request:

~~~javascript
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const proposal = JSON.parse(await readFile('proposal-preview.json', 'utf8'));
const request = {
  performanceId: proposal.performanceId,
  proposedMonthlyRequests: proposal.proposedMonthlyRequests,
  proposalSha256: proposal.proposalSha256,
  requestId: randomUUID(),
  label: 'Revised monthly request volume'
};
await writeFile('proposal-save-request.json', JSON.stringify(request, null, 2) + '\n', {
  flag: 'wx',
  mode: 0o600
});
~~~

~~~bash
perf proposal-save --input proposal-save-request.json --output proposal-saved.json
~~~

The result includes the saved proposal, original Tariff plan, `proposalRequestId`, original full `selection` when available, and `selectionError` when the current Pricing capture requires another review. The plan remains retained. Replaying the exact saved proposal request can resume selection preparation from that original saved plan.

### Commit the original selection

Use the complete returned `selection`, the saved `proposalRequestId`, and distinct new original plan and Pricing request UUIDs:

~~~javascript
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const saved = JSON.parse(await readFile('proposal-saved.json', 'utf8'));
if (!saved.selection) {
  throw new Error(saved.selectionError?.message || 'Reopen the saved proposal selection');
}
const request = {
  performanceId: saved.performanceId,
  proposalRequestId: saved.proposalRequestId,
  selection: saved.selection,
  planRequestId: randomUUID(),
  pricingRequestId: randomUUID()
};
await writeFile('proposal-commit-request.json', JSON.stringify(request, null, 2) + '\n', {
  flag: 'wx',
  mode: 0o600
});
~~~

~~~bash
perf proposal-commit --input proposal-commit-request.json --output proposal-committed.json
~~~

The native owner binds the original reviewed selection and its expected Pricing revision, snapshot and request bodies. The result is `PERFORMANCE_PRICING_SAVED`, with the same performance and proposal IDs, original Pricing request ID, complete original tariff-commit result and recovery state.

Retain the save and commit request files. After an interrupted response, reopen the performance record and its original operations, then continue the same request identities and payloads.

## Typed HTTP client

The installed export is:

~~~javascript
import {
  createPerformanceClient,
  PerformanceHttpError,
  PerformanceTransportError
} from '@tokenjunkielabs/starforge-merchant/merchant/performance-client';
~~~

### Standalone launch

Pass the private launch URL returned by `merchant-performance serve` or `startPerformanceServer`:

~~~javascript
const client = createPerformanceClient({ url: process.argv[2] });
const state = await client.state();
const firstPage = await client.sources({ limit: 20 });
~~~

The standalone connection captures `/api` and sends its token as `Authorization: Bearer …`.

### Original managed Pricing host

The original `startWorkspace(...)` result supplies `launch.performanceUrl` ending in `/performance/`. Obtain the original host token from its state endpoint and pass it explicitly:

~~~javascript
// launch is the result of the existing startWorkspace(...) call.
const bootstrap = await fetch(new URL('/api/state', launch.performanceUrl), {
  cache: 'no-store',
  credentials: 'omit',
  redirect: 'error'
});
if (!bootstrap.ok) throw new Error('Pricing workspace bootstrap failed: ' + bootstrap.status);
const originalState = await bootstrap.json();
const client = createPerformanceClient({
  url: launch.performanceUrl,
  token: originalState.token
});
const state = await client.state();
~~~

The client captures `/api/performance` and sends the original `x-sf97-workspace` header. The read-only `origin` and `apiPrefix` properties expose the captured connection. Later changes to a caller-owned URL object leave it unchanged.

Each method accepts an optional final `{ signal }`; the constructor also accepts a default signal and an injected `fetch`. Requests retain the complete original JSON bodies and operation UUIDs, omit unrelated cookies, reject redirects and request fresh responses.

### Complete method and command map

Routes below are relative to the captured API prefix, either `/api` or `/api/performance`. JSON routes return the original native result directly.

| Client method | Route | Native CLI |
| --- | --- | --- |
| `state()` | `GET /state` | `state` |
| `sources(page?)` | `GET /sources` | `sources` |
| `source(version)` | `GET /source?version=…` | `source --version ID` |
| `servicePeriods(page?)` | `GET /service-periods` | `service-periods` |
| `captureServicePeriod(input)` | `POST /service-periods` | `service-period-capture` |
| `preview(inputs)` | `POST /preview` | `preview --input FILE` |
| `save(input)` | `POST /save` | `save --input FILE` |
| `list(page?)` | `GET /reviews` | `list` |
| `load(performanceId)` | `GET /review?performanceId=…` | `load --performance ID` |
| `capture(performanceId)` | `GET /capture?performanceId=…` | `capture --performance ID` |
| `download(performanceId, name)` | `GET /files/:performanceId/:name` | `download --performance ID --name FILE --output PATH` |
| `inspect(source)` | `POST /inspect` | `inspect --input FILE` |
| `receive(source)` | `POST /receive` | `receive --input FILE` |
| `proposal(input)` | `POST /proposal` | `proposal --input FILE` |
| `saveProposal(input)` | `POST /proposal/save` | `proposal-save --input FILE` |
| `commitProposal(input)` | `POST /proposal/commit` | `proposal-commit --input FILE` |

Pagination accepts `{ after?, limit? }` and returns original cursors. Every typed response retains the native wrapper: preview includes `inputs` and `review`; load includes `sourceId`, `record` and `operations`; inspection returns descriptors; capture returns the complete portable envelope.

An HTTP download returns `{ filename, contentType, bytes, headers }`. Save its `Uint8Array` bytes to an explicit destination:

~~~javascript
import { writeFile } from 'node:fs/promises';

const file = await client.download(performanceId, 'usage.csv');
await writeFile('/absolute/path/performance-usage.csv', file.bytes, {
  flag: 'wx',
  mode: 0o600
});
~~~

### Complete errors and continuation

`PerformanceHttpError` retains status, method, token-free URL, native error code, parsed body, full raw response text and all response headers. It preserves both the standalone nested `error.code` and the original managed host's top-level `code`.

`PerformanceTransportError` retains its underlying cause and identifies an incomplete response. `PerformanceProtocolError` retains the complete successful response text when it cannot be decoded as the expected JSON. An interrupted write reports `outcome: "UNKNOWN"`; read and read-only preview/inspection requests report `READ_FAILED`.

The client makes one request per method call. Continue a write from the original saved request body and UUIDs after reopening the corresponding source or operation. The CLI also retains the full native operation result in its error output when an operation completed but its chosen output file could not be published.

## Original source and installed ownership

| Source | Responsibility |
| --- | --- |
| `model.mjs` | Exact recorded-usage comparison and proposal calculations |
| `source.mjs` | Complete original source inspection and identity |
| `workspace.mjs` | Saved performance records, service captures, receiving and proposals |
| `server.mjs` and browser assets | Standalone and original managed Pricing console |
| `client.mjs` / `client.d.mts` | Complete typed HTTP transport |
| `cli.mjs` | Direct local operator and complete artifact output |
| `../tariffs/workspace.mjs` | Original tariff plans, selections and native Pricing continuation |
| `../workspace/model.mjs` | Original saved observations, Pricing, costs and release bindings |
| `../../merchant-settlement-accounting/customer-statements/` | Original paired service usage compilation |

The installed `merchant-performance` contribution includes the native modules, typed client and guide. The original Pricing MCP provider exposes the performance operations through its existing registration and command. Commercial performance uses the original case material, quote and receiving owners, so the recorded usage comparison can continue into the same complete customer workflow.
