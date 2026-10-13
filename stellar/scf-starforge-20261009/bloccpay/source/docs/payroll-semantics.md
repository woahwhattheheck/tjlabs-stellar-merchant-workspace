# Payroll, provider resources and accounting

## Original payroll

The importer accepts exact CSV columns, literal JSON properties or JSON pointers. Canonical mapping targets include id, externalId, externalPaymentId, amount, currency, phoneNumber, email, verificationValue, memo, walletAddress, walletAddressMemo and explicit provider links.

A generated local row ID derives from the original import identity and ordinal. The default external payment ID derives from this stable row ID. The receiver's external ID must come from the original payroll before SDP instruction generation. Monetary JSON numbers retain their original numeric lexemes; all arithmetic uses decimal strings and BigInt coefficients.

A programme has an actual asset code and issuer, source wallet, environment and connection aliases. Role-to-alias mappings and alias arrays are accepted. The original programme definition remains retained beside its normalized version.

## SDP instruction and payment lifecycle

SDP's source distribution wallet and a receiver wallet are different resources. Original source_wallet_id controls funding and permissions. The selected receiver wallet determines receiver registration behavior. Asset code and issuer must match the batch and programme.

The current native CSV fields are phone, email, id, amount, verification, paymentID, walletAddress and walletAddressMemo. The exact subset depends on registration_contact_type and the selected receiver wallet. Embedded receiver wallets with no verification field omit verification. Wallet-address registration modes include walletAddress and optional walletAddressMemo. The provider's own validation remains authoritative for its complete address checks and configured verification values.

The current backend limits instruction uploads to 10,000 rows and 5,000,000 bytes. The application freezes the multipart boundary and exact file bytes when preparing an operation. Uploading to DRAFT or READY replaces that batch's draft instructions. Starting the same actual batch is a separate status mutation. The original backend enforces source-wallet role, balance, batch state and creator/approver separation when required.

Native capabilities observations are bound to the authenticated credential that produced them. Third-party user_id or hypothetical role queries cannot stand in for the caller's authority. Credential bindings are one-way hashes used for matching; actual tokens appear only in private transport configuration. Resource identity excludes actor credentials so original observations from creator and approver can refer to the same native resource.

Payment SUCCESS is an SDP provider outcome. A successful payment and a confirmed matching Horizon transaction remain separately visible. A payment linked to multiple eligible payroll rows is ambiguous for every affected row and contributes no payroll success. Conflicting selected versions, unresolved coverage conflicts and incompatible active link corrections cannot choose an arbitrary winning amount. Excluding a payroll row also removes its sole funding references. Provider-observed outcomes and exact amount/asset payroll matches have separate totals. Ambiguous external identifiers, asset/amount mismatches and absent original links produce exceptions. Failed, canceled, pending and successful totals remain separated.

## Bridge lifecycle and units

Bridge transfers preserve the entire original object, including source, destination, receipt, client_reference_id, customer and native state. The amount and developer_fee are denominated in the source fiat or pegged fiat currency. Each receipt amount has its own original companion *_currency field. The report uses that explicit unit, including final_amount_currency; older final-amount responses may use the documented destination currency fallback. Configured developer fees and actual receipt components remain distinct. Fees and amounts are not silently converted between units.

payment_submitted can carry a preliminary transaction hash. A final transfer transaction reference is exposed for payment_processed. Returned, refund-in-flight, refunded, failed and error observations remain in history.

A virtual-account deposit_id links stages of one deposit. funds_received.amount is a received source amount; payment_processed.amount is a payout amount after the applicable processing/fees. The report does not add the two stages into a single receipt total. Conflicting observed amounts produce exceptions and are excluded from the affected total. Microdeposits are identified separately.

A Bridge customer retains its current endorsements and requirements alongside all original legacy fields. Customer eligibility and route validation remain provider decisions. Unsupported country or fiat corridors are not inferred from a roadmap.

The sandbox simulate_deposit route is the provider's actual endpoint and requires a retained matching virtual account and currency. Bridge sandbox hashes are never automatically mapped to Horizon testnet. A Bridge sandbox provider result does not demonstrate an actual external bank or blockchain movement.

## Exact pages and mutable resources

SDP follows its original pagination.next with the same origin, path and filters, requiring the next page number. Horizon follows the original next link and final paging_token, preserving failed transactions and original transaction joins. Bridge follows documented ID cursors until its original data array is empty. Customer-specific and global virtual-account history retain different parameter sets.

Resource versions include the original value, numeric lexemes, provider scope, network binding, original update time, source pointer and observation. Later native update timestamps or event sequences can advance a resource. Equal timestamps with different content produce a conflict. Immutable Horizon and native deposit-event conflicts are kept for review. All original versions remain available regardless of current selection.

## Webhooks

Bridge signatures cover the exact raw request body. The verifier parses the original millisecond timestamp and strict Base64 signature, hashes timestamp + "." + rawBody once, then passes that digest to RSA/SHA256 verification, which supplies the second hash required by Bridge. Each configured endpoint supplies its original RSA public key and developer ID. Timestamp window and future skew are configurable. Event ID, sequence, developer, complete resource and transition fields remain in the verified source.

SDP and Horizon are captured through their original read APIs in this implementation. No invented webhook signature scheme is applied to those providers.

## Reports and receiving

Reports contain original payroll rows, selected native versions, source links, corrections, exceptions, period and coverage, with unit-separated decimal totals. JSON, CSV and a clean monochrome HTML report are generated from the same reconciliation. CSV export protects spreadsheet formulas while provider instruction CSV preserves literal phone numbers and original IDs.

Independent receiving verifies exact source/runtime/archive identities, starts from the transferred original workspace, generates a new workspace ID, and keeps scheduled collections paused until selected. Native programmes retain their actual start, process, HTTP, browser and receiving results.
