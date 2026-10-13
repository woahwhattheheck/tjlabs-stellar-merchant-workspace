# SDP batch workspace

The SDP batch desk is part of the original Invoice & settlement application. It prepares exact batch instructions, retains complete provider observations, compares each expected recipient and amount with the captured provider rows, and saves receiving reports in the same invoice workspace.

The desk uses the original `createSDPWorkspace` facade, its selected native SDP implementation and the invoice workspace's existing source writer. Its browser calls remain behind the invoice host's private bearer link, origin/Host checks and original workspace identity. The invoice programme, Horizon deposits, listener delivery, reconciliation, reports and Export & receiving sections continue to use their original paths.

## Select the original programme and provider scope

Create or select the actual invoice programme version in the existing workspace. Record its complete UUID and version. An SDP desk binds one programme version, one provider origin, tenant name and ID, source wallet, Stellar network passphrase and exact asset ID/code/issuer. This binding is used for every saved batch, observation and report.

The optional private desk configuration has schema `stellar-forge.invoice-sdp-desk.v1.configuration` and a `desks` object keyed by operator-facing aliases. See `sdp-desks.example.json`. Keep this file outside the exported workspace. The loader resolves symlinks and the actual workspace parent before enforcing that boundary.

Each desk supports:

- `label`: a useful operator name.
- `programmeId`, `programmeVersion`: the existing immutable invoice programme version.
- `scope`: the original SDP origin, tenantName, tenantId, sourceWalletId, networkPassphrase and asset.
- `connectionAlias`: optional name in the original private connections file.
- `adapterModule`: optional absolute path to the original customer's transaction/address adapter.
- `allowLoopback`: true only for an explicitly selected local provider installation.

Without a connection, the complete offline preparation, native preview, snapshot receiving, original-source inspection and report functions remain available. The host does not manufacture credentials. With a connection, it verifies the exact origin, network, tenant and wallet against the desk scope before creating the original facade.

Provider writes require the existing adapter's durable `admitMutation` and `recordMutation` methods, or its original `executeMutation` callback. The latter delegates dispatch and recovery to the existing company operation writer; the desk does not start another HTTP mutation or transaction ledger. The adapter can export `transactions` or `openTransactions({workspace,scope,signal})`. If the latter returns an owner with `close()`, the desk retains and drains that exact owner. It can also export the selected Stellar SDK `validateAddress` and an original `getToken({connectionAlias})`. A private connection's existing Bearer token is used when no credential getter is supplied.

The browser shows whether provider reads, writes and direct-address validation are available. It does not offer a token, signing key, wallet provisioning or new ledger control panel.

## Open the managed application

The ordinary CLI gains one optional configuration path:

```sh
stellar-invoice-settlement serve \
  --workspace /absolute/original-invoice-workspace \
  --connections-file /private/original-connections.json \
  --sdp-config /private/sdp-desks.json \
  --startup-format json
```

Open the complete original URL printed by that host. Select **SDP batches** in the existing sidebar. No additional HTTP server is started.

The Applications registration adds **Private SDP desk scopes**. Its launcher retains the exact config and selected adapter module as private input descriptors and starts the same `serve` command. Startup verification includes the selected `sdpConfigFile` path along with the existing workspace/host/port/source identity. Existing settings that omit this field remain valid.

Source selection includes the desk, stylesheet, host facade and original contract/native/workspace modules. The public asset registry exposes only the pure browser contract and desk assets. Transaction adapters and credential configuration are not browser assets.

## Prepare complete batch inputs

Select the named programme/scope. The scope panel displays tenant, source wallet, asset, origin and network. The draft editor provides batch name, original operation ID, registration contact type, recipient registration wallet, verification field and message template.

Use one of four original contact modes:

| Contact mode | Recipient fields | Wallet handling |
| --- | --- | --- |
| EMAIL | id, email, amount, paymentID; verification when configured | Original recipient registration wallet |
| PHONE_NUMBER | id, phone, amount, paymentID; verification when configured | Original recipient registration wallet |
| EMAIL_AND_WALLET_ADDRESS | id, email, amount, paymentID, walletAddress, walletAddressMemo | Selected original Stellar SDK address validation |
| PHONE_NUMBER_AND_WALLET_ADDRESS | id, phone, amount, paymentID, walletAddress, walletAddressMemo | Selected original Stellar SDK address validation |

Amounts remain decimal strings. The native contract enforces the original seven-digit fractional precision and per-payment Stellar integer range. It validates contacts, exact required fields, duplicate recipient/payment IDs and direct-address rules. The UI does not normalize contacts, round amounts or silently discard extra CSV columns.

Import a complete batch JSON or recipient CSV, or edit the paginated recipient table. CSV import retains every row, including values the native preview may reject. The native maximum is 10,000 instructions; the browser displays 100 at a time and filters without truncating the underlying batch. Save draft JSON for an independent copy. Browser drafts are scoped to the original workspace, desk and exact provider scope; storage failures are surfaced before the UI proceeds.

**Preview exact batch** calls the pure native preparation method. The page shows exact total, recipient count, operation ID, full CSV and provider-specific instructions. **Save prepared batch** validates the complete current input again and uses the original source writer to retain both prepared JSON and exact CSV. This local save does not create a provider disbursement.

An existing saved batch is immutable. **Copy into new draft** keeps the original recipient inputs and chooses a new operation ID. Retain the original operation ID when recovering its accepted command; changing it is a new provider intent.

## Inspect and operate the provider

Open the saved prepared batch before selecting provider actions. The exact prepared source ID appears beside its native totals and original instructions.

1. **Create provider draft** sends the selected prepared batch through the original durable mutation adapter. The provider's response is retained as an observation; a returned ID populates the disbursement field.
2. **Inspect disbursement** saves the complete original provider response. Select that specific observation for instruction upload.
3. **Upload exact instructions** sends the saved CSV against the reviewed original disbursement state. SDP may replace draft payment rows and resend registration invitations; the UI asks the operator to confirm this actual effect.
4. **Capture complete receiving** retrieves the full selected disbursement, instructions, receivers and payment pages through the original native reader. Complete and incomplete captures retain their actual outcomes.
5. **Start / resume**, **Pause**, or **Cancel** uses a selected full saved snapshot. The native status intent includes that exact reviewed predecessor and the target status. An identical retry returns its durable prior result before another fresh dispatch check. A later pause/resume against a different captured predecessor is a different explicit action.

The native provider keeps its own authentication, permissions and maker/checker semantics. No browser field represents an approval that the provider has not returned.

## Recipient and amount review

The receiving view includes every expected payment reference, expected contact, expected recipient reference, provider recipient ID and external reference, provider receiver wallet, expected amount, provider amount, status, transaction reference and findings. Existing contacts can retain a previous external reference; the desk displays that mapping explicitly.

Filtering affects the table presentation only. The complete original rows remain in the saved sources and reports. **Full row** opens the exact native receiving object. Source history can open the complete captured snapshot, including provider-specific fields and status history.

Amount displays distinguish:

- **Expected obligation**: the complete prepared batch amount.
- **Observed provider totals**: exact observed payment amounts with matching asset and source wallet, valid amounts and unambiguous provider IDs.
- **Expected obligations by observed status**: expected amounts classified by the captured payment status.
- **Excluded provider amounts**: full original payment IDs/amounts plus reasons preventing inclusion.

An expected 100 with a captured successful provider amount of 95 therefore remains a discrepancy and shows the actual observed 95. Unknown status, invalid amount, ambiguous provider ID, asset mismatch or source-wallet mismatch remain visible in the complete finding list. They are not silently added to provider totals.

Provider SUCCESS remains a provider observation. The receiving report identifies the full transaction references needed by the original Horizon and payroll reconciliation. The desk does not create ledger credits from a status label.

**Project selected payment observation** uses the original invoice source projection method, complete original payment body, selected connection and source scope. It retains that projection separately. Continue original invoice reconciliation through its existing section.

## Offline snapshot receiving and reports

Select the saved prepared batch and receive either a retained snapshot or a complete original snapshot JSON file. The native module recomputes reconciliation from the complete source arrays. Supplied summary fields are not trusted as a replacement for the original rows.

The result retains:

- original prepared batch and instructions;
- complete snapshot and provider scope;
- native reconciliation with all mappings, amounts and findings;
- complete HTML receiving report;
- source IDs connecting these records.

Download the report from its original saved source. Download any source byte-for-byte through the original invoice source route. HTML is treated as a downloadable retained report; arbitrary provider content is not injected into the desk DOM.

The browser accepts snapshot JSON up to 24 MiB and draft/CSV files up to 16 MiB. Larger supported source operations remain available through the original CLI. Host desk commands are bounded at 32 MiB, independently of the original native provider-page bounds.

## Request recovery and history

The invoice browser's existing IndexedDB request journal writes the complete method, arguments, UUID and expected revision before dispatch. SDP commands use that same flow. Closing a panel or losing a response does not select a new original request.

The host facade stores request, successful result and unsuccessful/uncertain attempt records through the original invoice `sourceImport` mechanism. There is no separate monetary ledger.

For a new request, the first request-source save uses the exact supplied expected revision. A stale revision is rejected rather than silently selecting current state. Once the command has been retained, retries preserve its complete body and request ID. A conflicting body with the same ID is rejected.

The facade's `sdp.request` operation takes the complete original command, not a UUID alone. It returns one of:

| Status | Meaning |
| --- | --- |
| ABSENT | No original request source is retained for that command ID |
| RETAINED | Exact original command is retained; no completed desk result was published |
| COMPLETED | Exact original command and complete successful result are retained |

ABSENT is a source observation, not a claim about an independently dispatched provider request. RETAINED is not success. Provider writes still pass through the original customer's durable mutation admission, which determines whether the same write can dispatch, return its previous result, or require reconciliation. An uncertain upload is not blindly repeated.

After a successful provider response, observation retention or result publication can still fail. The browser keeps its same command. Retry reuses the original provider intent and complete retained response path. Source history includes the original provider observations and failed/uncertain attempt records for diagnosis.

The generic **Retained original requests** panel supports exact retry and request download. A new command after a definite revision rejection must use a freshly reviewed revision and a new UUID; do not edit a retained command in place.

## Complete export and independent receive

Use **Export & receiving** in the same application. Existing workspace export includes all SDP original sources, requests, provider bodies, snapshots, reconciliations and reports, together with the selected source/runtime inventory. Browser draft state is local; save prepared inputs or download draft JSON before handing over.

Use the original package inspection and receive commands:

```sh
stellar-invoice-settlement workspace-export \
  --workspace /absolute/original-invoice-workspace \
  --connections-file /private/original-connections.json \
  --destination /absolute/complete-delivery

stellar-invoice-settlement package-inspect \
  --source-directory /absolute/complete-delivery

stellar-invoice-settlement package-receive \
  --source-directory /absolute/complete-delivery \
  --destination /absolute/independent-workspace \
  --request-id ORIGINAL_RECEIVING_UUID
```

The receiver retains original source identities and history. Configure that continuing workspace with its actual programme IDs, exact versions and private connections, then open its SDP desk and inspect the saved batch/report/history. Credentials and private adapter configuration are supplied by the receiving operator and are not reconstructed from a public package.

## Host lifecycle

The SDP facade borrows the original invoice workspace. It tracks every accepted read and mutation, freezes new admission at close, forwards the original stop signal, waits for queued and active work, and closes only adapter objects it opened. Borrowed static adapter objects remain with their original owner.

The invoice host closes the SDP facade before its underlying invoice operator. If an adapter close rejects, that owner remains available for a retry and the original workspace is retained until the adapter drain completes. The existing server stops accepting connections and drains its original requests. The browser module detaches listeners and waits for its accepted work before revoking its owned download object URLs.

## API mapping

All entries use the original authenticated `POST /api/invoke` envelope `{method,args}`. SDP methods have the `sdp.` prefix; ordinary invoice methods keep their existing dispatcher.

Read methods are `sdp.desks`, `sdp.list`, `sdp.read`, `sdp.preview` and `sdp.request`. Mutating methods are `sdp.prepare`, `sdp.receive`, `sdp.capture`, `sdp.inspect`, `sdp.create-draft`, `sdp.upload`, `sdp.status` and `sdp.project-payments`. Capture and inspect are provider reads but retain new original observations locally, so they use the original workspace write identity and request recovery flow.

Every mutation carries `desk`, `requestId` and `expectedRevision`, followed by its full native source selection. The host advertises the complete required fields and descriptions in its original bootstrap methods list. `sdp.read` returns complete JSON by default; `json:false` returns canonical base64 for an exact instruction/report body.

## Source and validation

This product composes the complete maintained invoice application, the merged Horizon deposit work at PR1262, and the original SDP core. It adds namespaced desk modules and guarded shared host/Applications/browser joins. The source packet records each full predecessor and postimage with bytes, SHA-256 and Git blob identities.

Source syntax and guarded composition checks are reported separately from actual provider or browser runs. A native run must select the actual private configuration and runtime, preserve its original operation and retained request IDs, and record real returned outcomes through the existing application.

### Failed-start cleanup

A failed desk adapter start preserves its original adapter owners if their close fails. The host adopts that same close handle and retains the borrowed invoice workspace until those adapters drain. The original startup error remains primary. The CLI finishes the same retained owner before removing its signal handlers; a rejected cleanup retains `error.invoiceSettlementOwner.close()` for its caller to retry. Repeated browser desk disposal waits on the same drain promise, and failed URL cleanup retains only the unreleased URLs for a subsequent close.
