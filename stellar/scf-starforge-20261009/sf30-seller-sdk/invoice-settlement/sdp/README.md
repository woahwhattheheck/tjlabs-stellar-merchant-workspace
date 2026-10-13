# SDP batch preparation, operations and receiving

This component adds a complete payroll batch workflow to the existing invoice and settlement workspace. It uses the maintained SDP reader and HTTP transport under settlement-audit, the original invoice source journal, and the original application/workspace export and receiving commands.

## What the operator does

Prepare contractor instructions with original external recipient and payment references, an explicit tenant and source wallet, the full asset identity and Stellar network passphrase. Amounts are decimal strings; accounting uses seven-place integer arithmetic. CSV preparation supports EMAIL, PHONE_NUMBER, EMAIL_AND_WALLET_ADDRESS and PHONE_NUMBER_AND_WALLET_ADDRESS, with the provider's 10,000-instruction maximum.

Capture the disbursement, raw uploaded instructions, every disbursement recipient page and every matching wallet-scoped disbursement payment page. The original SDP reader owns endpoint filters and provider continuation validation. The component compares disbursement observations before and after the collection and exposes pagination drift, duplicate IDs and incomplete captures.

Receiving compares the instructions and each payment against the actual recipient contact, receiver ID, receiver wallet, amount, asset and source wallet. The report shows both the expected external recipient reference and the provider's current external reference. Existing SDP recipients are matched by contact; an uploaded CSV id does not replace the external_id of an existing recipient. Each successful provider payment supplies its transaction and operation reference for the original Horizon/invoice reconciliation.

The workspace retains prepared input, CSV, exact response bodies, complete provider observations, snapshots, receiving results, authenticated events and an HTML report as original document sources. Payment observations can also be projected through the existing SDP normalizer with the exact named invoice connection. Existing invoice decisions retain the final financial attribution.

## Installation and original source

The maintained installation is the complete invoice application, using Node 22.16 or later. The sibling files native-http.mjs and sdp-native.mjs are reused directly from settlement-audit. The source-files.json inventory includes this complete directory, so the existing workspace export carries its code and guide with the original application.

Entry point:

    node stellar/scf-starforge-20261009/sf30-seller-sdk/invoice-settlement/sdp/sdp-cli.mjs help

Select an existing private workspace and existing programme version. A private operator configuration contains:

    {
      "programmeId": "<existing programme UUID>",
      "programmeVersion": 1,
      "connectionAlias": "<existing SDP connection alias>",
      "connectionsFile": "/private/original-connections.json",
      "scope": {
        "origin": "https://<original SDP installation>",
        "tenantName": "<original tenant name>",
        "tenantId": "<original tenant UUID>",
        "sourceWalletId": "<original distribution wallet UUID>",
        "networkPassphrase": "Test SDF Network ; September 2015",
        "asset": {
          "id": "<original SDP asset UUID>",
          "code": "USDC",
          "issuer": "<original network-specific issuer>"
        }
      },
      "adapterModule": "/private/original-payroll-adapter.mjs"
    }

The named connection must select the same base URL, tenant, source wallet and network. Its private token/apiKey or Bearer header supplies the credential. Keep the private configuration outside the exported workspace. HTTP is available only for an explicitly selected local installation with allowLoopback enabled.

The optional original adapter module supplies validateAddress(address) for wallet-address registration and the application's existing transaction implementation. Use the original Stellar SDK StrKey validator; accept account or contract addresses according to the selected provider version. An adapter may export getToken({connectionAlias}) for the existing credential store.

## Prepare and receive a batch

The input file contains operationId, scope, disbursement and items. Use a stable business operation reference for one original intent. The disbursement object accepts name, registration_contact_type, wallet_id, verification_field and receiver_registration_message_template. Each item contains id, paymentID, amount, the selected email or phone contact, and the provider's applicable verification or walletAddress/walletAddressMemo fields.

For wallet-address registration, omit wallet_id and verification_field. Contract recipients cannot use memos. For ordinary registration, select the existing provider wallet and verification field; omission of verification is supported by SDP only for its embedded wallet.

    node sdp-cli.mjs prepare --workspace /private/invoices --config /private/sdp.json --input /private/payroll.json
    node sdp-cli.mjs capture --workspace /private/invoices --config /private/sdp.json --prepared-source PREPARED_UUID --disbursement-id SDP_BATCH_ID
    node sdp-cli.mjs report --workspace /private/invoices --config /private/sdp.json --source-id REPORT_UUID --output /private/payroll-receiving.html

Preparation returns the saved preparedSourceId and instructionsSourceId. Capture returns snapshotSourceId, reconciliationSourceId, reportSourceId and the complete receiving result. The HTML report is neutral industrial styling and includes payment mappings, amounts, discrepancies and chain references. Provider status totals sum exact observed amounts only for unambiguous payments in the selected asset and source wallet. The report lists excluded rows and reasons, and separately shows the expected obligations grouped by the observed status; an underpayment never appears as fully paid.

A retained original snapshot can be received after transfer:

    node sdp-cli.mjs receive --workspace /private/invoices --config /private/sdp.json --prepared-source PREPARED_UUID --input /private/original-snapshot.json

A captured snapshot is a sequence of original API observations. Receiving recomputes its result from the full retained rows. A provider SUCCESS observation remains linked to its original transaction; use the existing Horizon source and invoice decisions to establish network, actual movement and payroll attribution.

## Provider writes and recovery

create-draft, upload and status issue real requests. They require the original application's durable transaction adapter. The component does not supply a substitute accounting database.

The adapter exports transactions, or openTransactions({workspace,scope,signal}) returning:

- admitMutation({descriptor,requestSHA256}) atomically binds the original operation to its exact request before dispatch. It returns {dispatch:true,requestSHA256} once. A repeated operation returns {dispatch:false,requestSHA256,result} when the saved result is known, or {dispatch:false,requestSHA256} when reconciliation is necessary.
- recordMutation({descriptor,requestSHA256,result}) retains the exact complete or partial outcome under that same original operation.
- acceptEvent(verifiedEvent) records event identity, payload digest and any application effect atomically. It returns status accepted, duplicate or conflict.
- close(), when an opened adapter owns a connection requiring closure.

A request descriptor includes method, original URL, exact scope, request body, content type and operation ID. Retain it through the application's existing transaction store. A timeout after dispatch is an uncertain write outcome; reconcile the selected batch before deciding whether another request is appropriate. The client does not automatically resend a create or upload.

    node sdp-cli.mjs create-draft --workspace /private/invoices --config /private/sdp.json --prepared-source PREPARED_UUID
    node sdp-cli.mjs inspect --workspace /private/invoices --config /private/sdp.json --disbursement-id SDP_BATCH_ID
    node sdp-cli.mjs upload --workspace /private/invoices --config /private/sdp.json --prepared-source PREPARED_UUID --disbursement-id SDP_BATCH_ID --observation-source OBSERVATION_UUID
    node sdp-cli.mjs capture --workspace /private/invoices --config /private/sdp.json --prepared-source PREPARED_UUID --disbursement-id SDP_BATCH_ID
    node sdp-cli.mjs status --workspace /private/invoices --config /private/sdp.json --prepared-source PREPARED_UUID --snapshot-source SNAPSHOT_UUID --status STARTED

The inspect result includes retainedSources.observationSourceId. Upload binds the current provider draft to the exact prepared name, asset, registration type, wallet and verification field, then compares a fresh read with the selected original observation. SDP instruction upload replaces draft payments and can resend registration invitations. Treat it as a meaningful provider mutation.

STARTED requires the complete recipient/instruction receiving to match. PAUSED and CANCELED remain available for the original selected batch when discrepancies are discovered. All status requests re-read the current provider batch and preserve SDP's own roles, approval policy and state transitions. Each status intent binds the original operation, selected scope, batch, target status and complete reviewed predecessor. An identical retry returns its retained outcome. A later pause/resume cycle uses its newly captured predecessor and receives a distinct action identity. A changed provider state before dispatch is retained as a not-started result; capture and review that changed state before another intent.

## Authenticated events

SDP signs timestamp + "." + exact raw request bytes with HMAC-SHA256. Preserve the bytes before any JSON parsing. verifyWebhook checks the single timestamp/signature headers, delivery age, signature, strict JSON, schema version, event type, tenant and source wallet. A single-tenant installation that omits tenant_id must be explicitly bound with singleTenantInstallation: true.

receiveSignedEvent stores authenticated deliveries in the existing source journal. applySignedEvent additionally calls the original atomic application transaction. Stable event identity combines selected installation, tenant, source wallet and provider event_id. A repeated event ID with changed bytes is a conflict for the transaction adapter.

    node sdp-cli.mjs webhook-import --workspace /private/invoices --config /private/sdp.json --body /private/request.body --headers /private/request-headers.json --secret-env SDP_WEBHOOK_SECRET

This command is authenticated evidence intake. Integrate applySignedEvent in the existing customer endpoint for monetary effects. Reconciliation polling belongs in the application's existing scheduler; call capture on the selected batch and preserve the returned source IDs. Use the customer's configured interval, including a 15-minute schedule where selected.

## Original financial projection and complete delivery

For a complete retained payment page:

    node sdp-cli.mjs project-payments --workspace /private/invoices --config /private/sdp.json --observation-source OBSERVATION_UUID

The named invoice connection must match the original native transport identity. sourceProject uses the existing SDP normalizer and keeps the same original body. The maintained Horizon/invoice arm can then apply original record decisions and produce the existing financial reports.

Use the original invoice CLI for the whole workspace and application:

    node ../cli.mjs workspace-export --workspace /private/invoices --connections-file /private/original-connections.json --destination /private/sdp-delivery --include-application
    node ../cli.mjs package-inspect --source-directory /private/sdp-delivery
    node ../cli.mjs package-receive --source-directory /private/sdp-delivery --destination /private/received-sdp --request-id RECEIVING_UUID

Continue the returned existing workspace identity and original journal on receipt. Private credentials are supplied separately through the existing named connection configuration. The application export includes this directory through the maintained source inventory.

## Provider contract and verification

PROVIDER_CONTRACT.md records the exact upstream source selection and endpoint semantics. source-contract.json lists the original maintained dependencies. Financial contract exercises cover exact one-stroop amounts, preservation of an existing recipient's external ID, contact mismatch detection and missing amounts. Actual provider commissioning uses the original authorized installation, customer batch and account configuration.

## Existing company transaction service

The transaction interface also accepts `executeMutation({descriptor,requestSHA256,signal,beforeDispatch})`. This delegates admission, native request encoding, authorization, dispatch and recovery to the selected company application. The SDK retains the returned exact response as its provider observation. A delegated action never enters the SDK HTTP mutation writer. Existing `admitMutation`/`recordMutation` integrations retain their original behavior.

The complete Bloccpay adapter lives with its original company application: `lib/sdp-sdk-adapter.mjs`, `examples/invoice-sdp-adapter.mjs` and `docs/invoice-sdp-integration.md` under [Bloccpay payroll commissioning](https://github.com/woahwhattheheck/Commons/tree/main/opportunities/bloccpay_payroll_reconciliation_commissioning_20261013/engineering/bloccpay-payroll). It uses the existing SQLite operations and selected programme, authenticated capability observations, original instructions and native exchange recovery. The private example module selects an existing workspace identity and closes its owned connection after accepted calls drain.

Delegated observations distinguish the complete SDK intent from the company's actual native request. `requestSHA256` binds the SDK intent; `companyOperation` identifies the original operation, attempt, response source and private exchange. Original provider JSON is parsed from its retained bytes before the SDK interprets it. An interrupted invoice source save can therefore retry the same company result without another payment action.

For the full browser and managed-application workflow, use the [SDP desk guide](DESK.md). For Bridge intake and incident review in this same workspace, use the [Bridge workspace guide](../bridge/BRIDGE_WORKSPACE.md).
