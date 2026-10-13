# Bloccpay operations: installation, payroll and original-source commissioning

This application connects an explicitly selected customer payroll ledger to the existing Stellar Disbursement Platform (SDP), Horizon and Bridge services. It retains the original inputs and responses, freezes programme and report editions, records corrections, and transports the complete selected workspace and Node runtime to an independent installation.

The application does not hold a Stellar signing key. Native SDP creator, approver, distribution-wallet and payment capabilities remain in SDP. Bridge API operations use the selected existing account. Existing wallet signing, custody, AML and customer policies remain with their original services.

## What is complete in this source

The Node 24 application contains a private SQLite workspace, original-file custody, provider operation preparation and response retention, cursor-based read captures, immutable payroll programmes, exact SDP instruction files, collection runs, correction history, reconciliation and HTML/CSV/JSON reports. The operator browser uses the same command API as the CLI. It retains original request UUIDs and uploaded Files before dispatch, and reconciles interrupted host requests.

The complete delivery contains the declared application source, a consistent SQLite snapshot, every selected original source object and unfinished attempt, and the actual selected Node executable with its native shared libraries. A report delivery contains only its sealed metadata and report members.

Source preparation, successful native execution and actual provider settlement are separate states. The commissioning programme records each phase's actual result and continues independent source, report and receiving phases when a provider or browser dependency is unavailable.

## Runtime and configuration

Use Linux with Node 24. No npm package is needed by the application. The native Node runtime is retained with its original dynamic libraries; independent reconstruction verifies all original file hashes and the selected platform. Browser commissioning uses an existing Playwright installation and Chromium executable selected in private configuration.

Create a private configuration from `examples/configuration.example.json`. Replace every marked selection with the actual existing installation or account. Keep this configuration outside the declared application source. Environment values are `production` or `sandbox`.

The example selects only the public read-only Horizon connection. The entries under connectionTemplates are explicitly unconfigured templates and are not used by the service. Move only the selected existing connections into connections after replacing every placeholder in private custody.

A connection has a fixed provider, environment and source scope. Refreshing a token preserves a capture only when the public connection identity remains equal. Changing a tenant, distribution wallet, network or provider base must use a newly selected capture.

| Provider | Required selection | Private authentication |
| --- | --- | --- |
| SDP | Existing base URL, tenant name, source distribution wallet ID and network passphrase | Existing token: Bearer JWT or SDP API key |
| Horizon | Existing base URL and exact network passphrase | Usually none; selected URL must follow native adapter rules |
| Bridge | Official production or sandbox base, environment, optional customer/developer bindings | Existing API key |
| Bridge webhook | Saved endpoint subscription ID, original public key and developer ID | No caller-supplied verification key |

SDP's `sourceWalletId` selects the source distribution account through the original `X-Wallet-Id` header. It is distinct from the recipient wallet ID in a disbursement. Preserve that distinction when choosing programme and instruction evidence.

Production Bridge uses `https://api.bridge.xyz/v0`; sandbox uses `https://api.sandbox.bridge.xyz/v0`. Bridge sandbox does not submit a blockchain transaction. A generated sandbox transaction identifier is not evidence of a Stellar testnet payment. SDP testnet/Horizon and Bridge sandbox each retain their own observed lifecycle; joint settlement requires explicit original references and actual network evidence.

Start the private operator:

```sh
node cli.mjs serve --directory /private/bloccpay/workspace --configuration /private/bloccpay/configuration.json
```

The default origin is `http://127.0.0.1:8781`. Startup prints `BLOCCPAY_OPERATIONS_READY` with the workspace ID and original paths. The bearer remains in private configuration, an in-memory server result, or `operator-token.private.json`. It is not printed. The server does not configure a public reverse proxy or a provider webhook subscription automatically.

## Programme and payroll inputs

Save one immutable programme definition with `programme.save`. It includes:

- Original programme ID and name, environment and selected connection aliases.
- Source distribution wallet identity and exact asset code, issuer and optional scale.
- Explicit period start/end and a mapping from original input columns or JSON fields.
- Any original source references needed to explain the selection.

The programme template contains only marked selections; the payroll CSV example contains headers and no invented customer rows. Mapping keys are id, externalId, externalPaymentId, amount, currency, phoneNumber, email, verificationValue, memo, walletAddress, walletAddressMemo and the explicit links.sdpDisbursementId / sdpPaymentId / sdpReceiverId / bridgeTransferId / bridgeVirtualAccountId / bridgeDepositId / stellarTransactionHash fields. Each mapping value is an exact input column/property or JSON pointer. Unmapped canonical fields and nested recipient/links objects retain the domain's original mapping rules.

Every save creates a new immutable version. A payroll pins one version, so changing a mapping or period cannot reinterpret an existing payroll.

Import a real CSV or JSON payroll file:

```sh
node cli.mjs import-payroll --directory /private/bloccpay/workspace --configuration /private/bloccpay/configuration.json --source /private/bloccpay/payroll.csv --programme-version PROGRAMME_VERSION_ID --request-id ORIGINAL_UUID --format csv
```

CSV cells stay strings, including leading plus signs and zeroes. The parser accepts quoted commas, quoted newlines and doubled quotes, and rejects empty or duplicate headers, malformed quoting and inconsistent column counts. JSON selection uses an explicit JSON pointer; the lossless parser retains the exact original numeric token. A numeric amount without its original token is rejected. Neither path rounds money through floating-point arithmetic.

The original file is retained before domain validation. A rejected payroll remains inspectable as original evidence. Normalized rows preserve original external IDs, amounts, currency, recipient phone/email/external ID or wallet address/memo, verification value, memo and explicit native payment/disbursement/Bridge/Stellar references. No payment is inferred from a similar name or a nearby amount.

SDP instruction generation uses the current retained upstream instruction handler and validator. The generated file is an exact provider CSV, not the spreadsheet-safe report representation. The native contract restricts the receiver identifier, headers, row count, amount spelling and wallet/verification combinations. The saved instruction record pins the payroll, original wallet and disbursement versions, exact bytes/hash and row IDs.

## Native operations and custody

All provider actions come from the source-backed native catalogue. The generic input has `params`, `query` and `body` as declared by that operation. File uploads use a local retained `fileId`; the workspace resolves its original bytes and the native adapter freezes the actual multipart boundary/body once.

An operation is prepared before any dispatch. Its original method, path, body, scope, body hash, selected evidence and request UUID are immutable. Authentication is supplied only from the selected private connection at dispatch.

Mutations require an explicit installation-level `delivery.configure {enabled:true}` selection and all native domain prerequisites. That switch does not grant missing SDP roles, remove creator/approver separation, or alter original wallet signing. Creator and approver aliases can point to the same tenant and source wallet with their respective native credentials.

Each operation moves through PREPARED, DISPATCHING and the observed ACCEPTED, REJECTED or UNCERTAIN result. A lost response or interrupted mutation is never sent again automatically. `operation.reconcile` makes the original declared readback and retains matching resource versions without claiming that an HTTP response proves settlement. An original rejected or uncertain operation remains available with its attempts and full response.

There is one explicit native retry path: Bridge's documented HTTP 409 resource_state_conflict response can mark the same request safe to retry. operation.retry-original requires that exact response from the latest original attempt, the same prepared POST body and Idempotency-Key, the original Retry-After delay and less than 24 hours since the first dispatch. It creates a fresh retained attempt under the same operation. A newer response-less attempt cannot reuse an older busy response as retry authorization; all other uncertainty follows native readback.

SDP upload produces the native READY state from a DRAFT disbursement. The original status operation selects STARTED, PAUSED or CANCELED. Direct payment creation queues a native payment immediately; do not substitute it for a draft workflow. An external payment ID is a correlation field unless the actual provider contract establishes idempotency.

Evidence is selected from workspace record IDs. The browser cannot supply a made-up wallet, capability or payment object to the validator. Named resource versions and original exchanges, programme/payroll versions and the exact saved instruction file are resolved by the service.

## Original reads, collections and corrections

A capture freezes its connection scope and native read selection. Each original request and full response is retained before projection. All provider pagination fields and continuation inputs remain available, including rejected pages and the next read after interruption. Repeated bodies or an unchanged cursor stop the capture with an explicit partial result.

A collection saves actual read tasks and a programme version. The default interval is 900 seconds. Collections start disabled. `collection.run` produces a distinct immutable run plan and task capture IDs; a run records COMPLETE, PARTIAL, RUNNING or PAUSED and preserves every pass. `run.continue` resumes its existing captures. Collection tasks cannot mutate a provider.

Select a collection for scheduling with `collection.enable`, then run the one leased host loop:

```sh
node cli.mjs worker --directory /private/bloccpay/workspace --configuration /private/bloccpay/configuration.json
```

Alternatively set `configuration.collections.enabled=true` on the operator server. Use one of these host lifecycles. A stable workspace lease prevents two collection workers from processing the same installation. Worker request identities derive from the saved collection and scheduled interval; interrupted work keeps its original request and cursor. An incomplete provider window remains partial rather than being reported as a complete period.

Reconciliation freezes selected original versions. Default selection uses current resource-version IDs. A collection source selection folds only its own original versions through the provider's version comparison, preserving full history and explicit conflict candidates. Conflicts require review or an explicit version selection; arrival time does not invent business precedence.

Corrections are append-only scoped records with programme version, payroll, selected row/source/version, action, actor and reason. Superseding a correction does not rewrite the original provider amount or status. Reports retain correction IDs, exact selected version IDs, original source IDs, period and coverage.

Amounts and totals remain separated by their actual currency, Stellar asset, network and programme. A Bridge fiat transfer, SDP payment, Horizon transaction and individual Stellar operation are distinct evidence until original explicit IDs and native amount/asset/destination rules reconcile them.

## Webhooks

The receiver route is:

```
POST /webhooks/provider/CONNECTION_ALIAS/SUBSCRIPTION_ID
```

Bridge verification uses the selected endpoint's public key and original signature header, timestamp and raw body. The service verifies each supplied delivery before deduplicating an accepted payload. An invalid-signature delivery is retained separately and cannot occupy the accepted event identity. Original headers, raw bytes, verification result and projections remain linked.

An original workspace automatically projects accepted webhooks and reconciles retained verified receipts on startup. A received workspace leaves this automatic work off by default. Select `webhookProjection.enabled` explicitly to control both startup projection and automatic processing of new accepted deliveries; the startup and bootstrap responses report the selected mode. The event inbox can still perform an operator-selected recovery through the existing command API. An actual public endpoint and subscription remain part of the selected existing installation.

## Browser and host recovery

The browser and CLI call the same workspace command:

```json
{
  "requestId": "ORIGINAL_UUID",
  "expectedRevision": 12,
  "method": "capture.run",
  "args": {"captureId":"SAVED_CAPTURE_ID","maxPages":100}
}
```

The service checks the request identity, stores it before work and returns completed results for the same UUID. An explicit revision conflict means the request was rejected before acceptance; after observing the current revision, a caller may retain a new revision attempt for the same semantic request. Uncertain transport is handled by looking up the original request first.

The browser keeps complete File/Blob content and request bodies in its workspace-scoped journal. A received independent installation gets a fresh workspace ID, preventing an old browser's unfinished requests from replaying into the copy. Every mutation HTTP request must carry `X-Bloccpay-Workspace-ID`.

Private provider response bodies may contain credentials and remain private workspace members. Operator projections redact configured secrets. Original source downloads and reports use authenticated file routes with a sandbox policy; reports render in a sandboxed preview.

## Complete runtime, export and receiving

Retain the actual Node runtime before full workspace export:

```sh
node cli.mjs runtime-retain --destination /private/bloccpay/runtime --node /selected/node24
```

Provide that returned directory and manifest hash to the server/CLI configuration. Full export requires the complete declared application and this verified runtime.

Use `workspace.export {destination}` for the full private package and `report.export {reportId,destination}` for a scoped report. Export freezes its SQLite snapshot, source descriptors, selected application generation and native runtime before copying. A retry cannot silently pick up a later live workspace or source generation.

```sh
node cli.mjs archive --source /private/bloccpay/delivery --destination /private/bloccpay/delivery.tar.gz
node cli.mjs unpack --source /private/bloccpay/delivery.tar.gz --destination /private/bloccpay/unpacked
node cli.mjs package-receive --source /private/bloccpay/unpacked --destination /private/bloccpay/received --request-id ORIGINAL_RECEIVE_UUID
```

Archive transfer streams complete declared files and the manifest. Receiving rejects traversal, links, duplicates, undeclared files and mismatched bytes, hashes or modes. It restores the selected native runtime from regular files, copies the full source cohort, opens a consistent database, and publishes the independent destination atomically.

The result returns `application.server`, `application.cli`, `application.worker`, `workspace.directory` and `runtime.nodeExecutable`. It preserves every original payroll, provider record, report and source ID, records the original workspace in receivedFrom, and creates a new workspace identity. Provider dispatch is disabled, collections are disabled and unfinished captures/runs are paused. Starting the received server does not resume payments or a collection unless the receiving installation is explicitly selected.

## Whole native commissioning

Run the complete ordinary programme, which is part of this source:

```sh
node operate-bloccpay.mjs --configuration /private/bloccpay/commissioning.json --operation-directory /private/bloccpay/original-operation --source-directory /path/to/bloccpay-operations
```

A complete source packet can instead be supplied through `--packet` and `--packet-sha256`. The programme materializes each exact application generation independently and preserves the original operation directory across continuation.

Set commissioning.uploadInstructions and/or commissioning.startDisbursement only for the selected existing batch and native creator/approver aliases, with commissioning.dispatch=true. The programme derives the original actions from the instruction contract and refreshes the uploaded batch before start; it does not require a handwritten API plan for that payroll path. Generic commissioning.operations is an optional advanced selection for other catalogue-supported provider actions.

The programme verifies complete source, runs actual Node syntax/import and CLI checks, retains and executes the original Node runtime, starts the actual HTTP operator, derives provider reads from the selected native catalogue and original resource references, imports the original customer payroll, generates the native instruction file, performs only explicitly selected provider operations, retains actual signed webhook deliveries, runs the complete selected read-only collection and produces immutable reports.

With the selected existing browser runtime it opens the real operator, inspects the retained workspace records and downloads the selected original provider sources. The selected Bridge review and SDP event operations run in that same workspace before export. It then exports, streams, unpacks and receives the full private source/runtime/workspace, executes the received native CLI, opens the received operator and inspects the original reports, provider records and decisions.

Each phase writes its original start, result or failure. Required missing customer data, credentials, browser runtime or provider response remain explicit dependencies; no fabricated payroll, signature, settlement or account substitutes for them. Re-running uses existing requests and processes rather than creating a second financial intent.

## Original sources and rights

- Bloccpay funded scope: https://communityfund.stellar.org/submissions/recay7Oe3yuqGc0nn
- Original SDP source: https://github.com/stellar/stellar-disbursement-platform-backend at 4330f131e8a2638a10767ec8db50a98f22672a61.
- The retained SDP instruction handler and validators supply the actual CSV and creator/approver behavior; an older OpenAPI omission does not override those original handlers.
- Horizon observations remain complete original responses from the explicitly selected service and verified network.
- Bridge source URLs and original endpoint contracts remain in the provider source metadata included with this application.

The independently authored companion source is MIT. Original publisher source retains its own notices and licences. Proprietary company architecture and customer operating data remain in their authorized private source/workspace custody. A source-backed funding milestone is provenance for the commissioning scope, not a claim that the company's current product lacks an existing feature.

### Original instruction and actor observations

The commissioning programme selects the latest complete retained capabilities response for each selected SDP creator or approver alias. It pins that original source selection before dispatch, and the native validator binds it to the actual selected credential. Supplying explicit capability source IDs remains optional.

After an accepted instruction upload, and before a selected batch start, the programme calls the original `sdp.disbursement.instructions.download` operation and compares the provider-stored CSV bytes with the generated, retained instruction file. A byte difference or unavailable original readback prevents the start phase from advancing. The received CSV, request, response and comparison remain part of the source history.

## Joined provider operations

The invoice SDK can delegate its SDP batch, instruction and status operations to this workspace's existing operation writer. The integration retains the original company payroll, instruction file, provider body and response under each SDK intent. Configure the existing workspace adapter using `docs/invoice-sdp-integration.md` and `examples/invoice-sdp-adapter.configuration.json`.

Signed SDP events retain their complete identity and original body, select a readback in the same database transition, and validate the full native resource before projection. Open the SDP event inbox for original source inspection and explicit readback recovery. See `docs/sdp-events.md`.

Open `/bridge` for Bridge source intake and incident decisions. The desk and `bridge-cli.mjs` select full source pages, exact resource versions, signed attempts and capture coverage. Reviews and decisions are immutable files attached to the original workspace requests and travel through the existing export and receiving workflow. See `docs/bridge-intake.md`.

The existing `operate-bloccpay.mjs` commissioning programme consumes the selected original workspace, provider configuration and payroll sources. Its full operating report, source export and independent receiving remain the entrypoint for exercising the joined company application.
