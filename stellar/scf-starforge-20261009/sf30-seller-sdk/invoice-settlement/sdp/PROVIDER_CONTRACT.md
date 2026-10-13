# SDP provider contract

## Pinned upstream

The implementation follows stellar/stellar-disbursement-platform-backend at commit 4330f131e8a2638a10767ec8db50a98f22672a61. The existing settlement-audit/sdp-native.mjs pins this same backend and the original OpenAPI source capsule.

Primary references:

- https://github.com/stellar/stellar-disbursement-platform-backend/blob/4330f131e8a2638a10767ec8db50a98f22672a61/internal/serve/httphandler/disbursement_handler.go
- https://github.com/stellar/stellar-disbursement-platform-backend/blob/4330f131e8a2638a10767ec8db50a98f22672a61/internal/data/disbursement_instructions.go
- https://github.com/stellar/stellar-disbursement-platform-backend/blob/4330f131e8a2638a10767ec8db50a98f22672a61/internal/data/disbursement_receivers.go
- https://github.com/stellar/stellar-disbursement-platform-backend/blob/4330f131e8a2638a10767ec8db50a98f22672a61/internal/data/receivers.go
- https://github.com/stellar/stellar-disbursement-platform-backend/blob/4330f131e8a2638a10767ec8db50a98f22672a61/internal/data/receivers_wallet.go
- https://github.com/stellar/stellar-disbursement-platform-backend/blob/4330f131e8a2638a10767ec8db50a98f22672a61/internal/data/payments.go
- https://github.com/stellar/stellar-disbursement-platform-backend/blob/4330f131e8a2638a10767ec8db50a98f22672a61/internal/scheduler/jobs/event_delivery_job.go
- https://github.com/stellar/stellar-disbursement-platform-backend/blob/4330f131e8a2638a10767ec8db50a98f22672a61/internal/events/events.go
- https://github.com/stellar/stellar-disbursement-platform-backend/blob/4330f131e8a2638a10767ec8db50a98f22672a61/internal/serve/middleware/api_keys_middleware.go
- https://developers.stellar.org/docs/platforms/stellar-disbursement-platform/api-reference

## Native boundaries

POST /disbursements with JSON creates a draft. Its name is unique in the selected provider scope. The component retains the full original request before dispatch and preserves the provider result. A failed response can follow a partially completed provider action; creation is reconciled by original operation and selected provider batch rather than automatically repeated.

POST /disbursements/{id}/instructions uploads multipart CSV. Processing matches existing recipients by selected contact, creates missing recipients with CSV id as external_id, associates receiver wallets, replaces draft payment rows, creates external_payment_id from paymentID, and may retry registration invitations. The upload is therefore recorded as a state-changing operation even when submitted bytes repeat.

PATCH /disbursements/{id}/status handles STARTED, PAUSED and CANCELED. Starting can trigger payment processing and remains subject to provider approval/role rules. The local adapter preserves the current selected batch and original provider transitions.

GET /disbursements/{id}/receivers returns original recipient id, email/phone_number, external_id, receiver_wallet and payment. Receiving joins this payment ID to the independently captured payment collection, then verifies contact, receiver/wallet IDs, wallet address/memo, amount and status. ReceiverContactTypeSMS is the Go symbol; the actual wire value is PHONE_NUMBER.

The complete payment collection is selected by existing native SDK filters and source-wallet header. The provider does not expose a disbursement_id filter on GET /payments. Receiving keeps every selected page and filters the original disbursement locally. Pagination contains data and pagination.next/prev/pages/total. The maintained reader validates the original route, frozen filters and consecutive next page. The aggregate driver detects changed counts and duplicate IDs. A capture is sequential provider observations; changed rows can require another capture.

Payment statuses are DRAFT, READY, PENDING, PAUSED, SUCCESS, FAILED and CANCELED. SUCCESS carries original Stellar transaction and operation references; the original Horizon reader and invoice reconciliation establish the selected network and actual chain movement before accounting attribution.

Tenant selection uses SDP-Tenant-Name; source-wallet selection uses X-Wallet-Id. Credentials remain the selected installation's existing Bearer credential. Provider authentication, scope and rate-limit errors retain their complete responses and stop that operation's automatic progression.

## Event contract

SDP signs its raw JSON envelope with X-SDP-Timestamp in Unix seconds and X-SDP-Signature as sha256= followed by lowercase hexadecimal HMAC-SHA256. The signed input is the timestamp string, one period, then exact raw body bytes. Retries can carry a new delivery timestamp. The event identity remains event_id.

The envelope uses schema_version 1, event_type, occurred_at, optional tenant_id, source_wallet_id and data. Supported disbursement and wallet event names are enumerated in the source contract. Multi-tenant delivery must match the original tenant UUID. An explicitly selected single-tenant endpoint may omit tenant_id while remaining bound to its configured organization secret and source wallet.

Event delivery is at least once. The receiving endpoint must atomically retain the stable event identity, payload digest and its application effect in the original transaction store. The component's source journal keeps authenticated observations; the customer's acceptEvent callback supplies atomic financial behavior.

## Original maintained integration

The component imports the existing native-http transport and openSDPSource reader. It uses the original invoice workspace's sourceImport, sourceRead, sourceFile and sourceProject operations. Existing request IDs and optimistic workspace revisions handle document replay and concurrent writes. It adds no accounting store, database migration, service account or scheduler.

The original invoice application inventory includes all component files. Workspace export and package receiving preserve the original programme, source bodies, requests, journal and report. Configuration and financial transaction callbacks attach through the customer's existing runtime.

## Commissioning course

Use the original authorized SDP test installation and retained customer payroll programme. Prepare at least ten real authorized test recipients for the customer acceptance case, create a draft, inspect it, upload once, capture complete provider pages and review recipient mappings. Start through the existing provider approval workflow. Receive authenticated events, repeat the actual delivery to exercise the original event transaction's duplicate handling, and reconcile final provider payments through original Horizon transactions and invoice decisions.

Use the customer's own scheduler and load target when measuring throughput. Retain measured concurrency, request timestamps and latency from the actual configured application; keep load results associated with the selected deployment. Existing successful production payments and registrations are preserved while commissioning this additive adapter.

## Distribution-wallet events and company delegation

The pinned [distribution wallet service](https://github.com/stellar/stellar-disbursement-platform-backend/blob/4330f131e8a2638a10767ec8db50a98f22672a61/internal/services/distribution_wallet_management_service.go) emits all five wallet event types with the same distribution-wallet ID in `source_wallet_id` and `data.wallet_id`. Membership payloads also carry their original membership and actor references. The receiver verifies that wallet identity and selects the native distribution-wallet GET for readback; the event body supplies notification metadata.

The verified SDK event retains its exact original signature headers for the existing company endpoint to verify again. The optional `executeMutation` interface delegates writes to that company's existing operation writer and returns its exact native response and original operation/source identifiers. The SDK validates the returned intent and body, saves its observation and interprets the provider result. It performs no HTTP mutation in that delegated branch.
