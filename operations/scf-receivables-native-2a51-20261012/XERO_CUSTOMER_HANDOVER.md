# Hand over an existing Xero customer account

This native handover composes the existing durable customer case with the original Accounting backup, verification and relocation engine. It preserves the original ledger, document/package IDs, returned provider files, saved cash cycles, commissioning captures and request journal. The receiving operator works on an independently restored copy under the original Accounting owner.

The installed command is `starforge customer-xero-handover`. The reusable exports are `prepareXeroCustomerHandover` and `receiveXeroCustomerHandover` from the selected package’s `/merchant/customer-case/xero-handover` export.

## Prepare the actual source account

Close the original Accounting owner and stop its original input writers before preparation. Select a private operation directory outside the original state root. Preparation opens the original merchant owner while it captures the dated customer case, closes that owner, then reviews and snapshots the now-quiesced source through the existing encrypted recovery engine.

Keep the existing `STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE` in the private environment. Preserve its value through the original secret channel separately from the handover. The command never writes the value to its input, result or logs.

Save a private selection JSON with these fields:

| Field | Exact input |
| --- | --- |
| operationId | A new UUID retained for this same handover and all retries |
| title / actor | Human customer handover title and responsible source operator |
| asOf | Original account date as YYYY-MM-DD |
| stateRoot | Original absolute private root containing the accounting directory and its operating sources |
| accountingDirectory | Original absolute Accounting directory, strictly inside stateRoot |
| expectedWorkspaceId / expectedSourcesSha256 | Both original logical identities from the existing account binding/status |
| customerId | Original customer UUID |
| packageIds | One to fifty original Xero package UUIDs |
| cashCycles | Saved original `{packageId,cycleId}` pairs selected once |
| commissioningCaptureIds | Original commissioning capture UUIDs to include; an empty array is valid |
| extraSources | Explicit original sibling file/directory roots, described below |
| externalWritersStopped | Explicit boolean true after the original writers are stopped |
| originalOperation | Original business/receiving operation label, when different from this default continuation |

The backup automatically includes the complete original Accounting directory, original outbox, proofs, terms, recovered settlement sources and any auxiliary inputs already owned by the recovery engine. Each `extraSources` row adds an existing original private source through that same engine’s host-source profile:

~~~json
{
  "name": "OriginalRequests",
  "path": "/private/customer/original-prepared-requests",
  "kind": "directory"
}
~~~

Use unique stable names beginning with a letter and containing letters, digits, underscores or hyphens. The path must be strictly inside stateRoot. The kind is `file` or `directory`. Include the existing prepared-operation folders and additional configured source files that belong in the customer handover. Preserve their exact original bytes. The native recovery engine checks source types, ownership, overlap, symlinks, complete inventory and its file/size limits. A changed original source between review and snapshot requires a current review.

~~~sh
starforge customer-xero-handover prepare \
  --out /private/handover-operation \
  --selection /private/source-selection.json \
  --release /private/installed-release.json
~~~

The optional release argument retains the complete admitted installed-release receipt and rechecks its actual manifest SHA256. It identifies the exact installed source supplied by the maintained package builder/admission. Preserve the selected package/archive alongside the complete private handover so the recipient can install the same original software.

The operation contains:

- selection.json and flow.json, with stable case, edition and native request identities.
- source-evidence.json: exact native package/cycle/capture records, complete file selectors, byte counts and SHA256 values, original request IDs and the full receivables/economic fingerprints.
- source-review.json: the original recovery engine’s selected source review.
- accounting-backup/: the complete encrypted original Accounting backup and its manifest.
- handover.json: the complete original handover identity and receiving instructions.
- installed-release.json, when selected.

The existing customer case is retained inside `accounting/customer-handover/OPERATION_UUID`. Its case.json, edition, native host-config.json and original-compatible RETENTION.json remain part of the complete encrypted backup. All current customer documents and staff case files use the existing durable case implementation.

## Receive into a separate private location

The second operator admits the same selected release and obtains the backup passphrase through its private channel. Keep the original source workspace in place. Choose a receiver state root that neither contains nor is contained by the original state root.

Save a private receiver JSON:

~~~json
{
  "actor": "Responsible receiving operator",
  "title": "Received original customer account",
  "stateRoot": "/private/received-customer",
  "accountingDirectory": "/private/received-customer/accounting",
  "continuation": {
    "packageId": "ORIGINAL_PACKAGE_UUID",
    "selection": {
      "packageIds": ["ORIGINAL_PACKAGE_UUID", "ORIGINAL_SECOND_PACKAGE_UUID"],
      "asOf": "2026-10-13",
      "label": "Receiving operator review of original cash history",
      "baselineCycleId": "ORIGINAL_SAVED_CYCLE_UUID",
      "importIds": ["ORIGINAL_RETURN_IMPORT_UUID"],
      "sourceBindings": [],
      "matches": []
    }
  }
}
~~~

Replace all example IDs and dates with the actual retained originals. Supply the complete original source bindings and exact matched portions reviewed for this customer. Empty arrays are explicit selections; the native compiler retains their resulting findings. When the continuation includes an additional original provider response, supply the native additionalSources upload and its observed timestamp exactly as required by the existing Xero cash command.

~~~sh
starforge customer-xero-handover receive \
  --handover /private/handover-operation \
  --out /private/receiver-operation \
  --receiver /private/receiver-selection.json
~~~

The existing encrypted engine verifies the selected manifest and restores into the receiver’s separate original Accounting directory. Its relocation logic preserves both original workspaceId and sourcesSha256, while recording the new physical paths. Each extra source root follows the original explicit relocation projection.

Before continued work, the receiver compares the complete original receivables data and every selected native package, returned response, cash-cycle and commissioning file. The original selectors, hashes and byte counts must match. The full original request journal remains part of the restored ledger.

The receiver retains the exact new cash preview and complete request before calling the original cash-capture writer. The native writer rechecks its revision and review SHA. The same saved request ID and intent are used after an interrupted reply. Saving this review appends an original immutable commissioning cycle; it preserves all invoice, credit, receipt, allocation, refund, disposition and bank records.

The receiving operator’s new dated customer case is retained under `accounting/received-customer-handover/OPERATION_UUID`. It has its own original case/edition IDs and native host-config.json/RETENTION.json. The source operator’s original case remains available unchanged in the restored account.

After capture, the receiver closes the owned workspace, independently reopens that same restored directory, and reads the saved continuation under its original ID and review SHA. The complete result is `receiver-operation/receiving.json`.

## Continue after an interrupted reply

Repeat the same command, paths and complete private selection. Each operation keeps its immutable selection and stable IDs. A completed source backup is inspected and verified before reuse. A restored workspace is recorded before the continuing owner opens. The complete continuation-request.json remains the authority for its original request replay; continuation-receipt.json retains the first observed native receipt.

Keep last-error.json and the original native outcomeUnknown, reopenRequired or commitUncertainty fields when present. Close/reopen and reconcile the original request using the same saved intent. A new commercial decision or changed source selection receives a new operation; the retained decision is never silently substituted.

The handover and receiver directories each use the existing original state lease to prevent concurrent owners of the same operation. Accounting itself remains under its own original owner and admission lifecycle.

## Reopen the received customer for ordinary work

Use the original server command and the receiving case’s original-compatible handover file:

~~~sh
starforge customer-case-serve \
  --handover /private/received-customer/accounting/received-customer-handover/OPERATION_UUID/RETENTION.json
~~~

Configure a current bearer secret through the RETENTION.json tokenEnv before serving. The retained loopback endpoint is `http://127.0.0.1:8453/mcp`. The original serve command checks the workspace identity and original configuration before listening.

Then use the ordinary customer case command to inspect or capture another edition of that same received case. Original invoices, returned Xero documents, customer responses, Collections and financial decisions continue through their existing writers and human decision process.

## The controlled installed receiving programme

`programs/XERO_CUSTOMER_CASE.mjs` is the named successor for the complete installed receiving operation. It runs the unchanged root XERO_CASH_CHECK once with SCF_CASH_KEEP=1, saves its complete output outside installed source and composes the actual generated customer with this handover.

It accepts `--release ORIGINAL_INSTALLED_RELEASE_JSON --out PRIVATE_OPERATION` and optional `--continuation PRIVATE_JSON`. That optional continuation must reference the programme’s own retained original package/source IDs. Receiving a separate existing customer uses the prepare/receive commands above.

The default programme explicitly retains the saved second cycle’s original source bindings, matches and import IDs, adds a responsible second-operator label and uses that saved cycle as baseline. It creates no additional invoice, payment, refund or credit in the receiving step.

XERO_CUSTOMER_CASE_RESULT.json records the complete installed source, original/receiver locations, original customer and workspace identity, backup manifest, exact source comparison and continued native review. RETENTION.json records those paths from startup. The original workspace, restored workspace, encrypted backup, complete native request files and logs remain available on success and failure. A started predecessor without a complete result is retained for original-process reconciliation; the programme does not blindly create the customer again.
