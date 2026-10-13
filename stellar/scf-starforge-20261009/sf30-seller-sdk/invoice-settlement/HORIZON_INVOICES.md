# Review Horizon deposits against original invoices

Open **Horizon deposits** in the existing Invoice & Settlement Workspace. This completes the review between a retained Stellar payment observation and a saved invoice. It uses the original programme, native source capture, immutable request journal, decision writer, reconciliation, report and complete-workspace receiver.

The register is an explicit operator mapping of original invoice terms. It does not describe Bloccpay's unpublished database schema, ingest an invented application ledger or mark an external invoice as paid. The separate SDP and Bridge integrations retain their own source identities and provider semantics.

## Operating course

1. Save the actual invoice programme through **Invoice programme**. Preserve its invoice IDs, exact decimal amount strings, network, asset code and issuer. For a settlement amount, declare its asset and amount separately.
2. Use **Original sources** to select the actual private Horizon connection and the original payment or operation route. Keep the existing default transaction join, ascending cursor and included failed transactions. Select the actual account and ledger interval. Run the original capture to completion. Its first root read binds the configured network passphrase and available ledger boundaries; the capture retains every original response and continuation.
3. Open **Horizon deposits** and download the register to complete. Enter the destination and memo from the original invoice's payment instructions. A blank account and unresolved memo type in the template are intentional. Do not substitute the invoice ID for a memo unless that is what the original terms say. A sender is optional, but when entered it is an exact additional condition.
4. Retain the entire register JSON. Its programme ID, version and digest must match the selected original version. Select the register and all original Horizon responses in the observation, including the root response. **Select all original Horizon responses** selects the visible programme's retained responses; review the selection before submitting.
5. Press **Review complete deposit selection**. Each movement retains the original transaction hash, operation ID, source records, destination, amount, memo and ledger. Exact matches become candidates. Repeated observations of the same operation are one movement with all original record identities retained.
6. Inspect every proposed attribution. Choose an invoice mapping for each movement to accept and write its individual reason. Enter the actual reviewer. A choice can resolve an ambiguous mapping or accept a partial/overpayment, but cannot bypass a failed transaction, missing network root, invalid projection, unfinished capture or prior decision.
7. **Save selected original decisions** writes the complete review and all selected links in one existing workspace transaction. The saved reviewed source contains the register, source identities, capture coverage, candidate reasoning, individual choices and actor. The original decisions carry their original invoice version and source-record identity.
8. Open **Reconciliation**, select the same original sources and create a new edition. Existing invoice reconciliation computes the exact balances, roles, amounts, outstanding issues and reports. Review those results before any separate accounting action.
9. Use **Export & receiving** to export the complete original workspace and application. The register, original payment bytes, review, individual decisions, reports and original request history travel with the existing package. Receive it into the declared independent directory and reopen its printed operator entry.

No external payment, signature, refund, account mutation or company-ledger update is performed by the deposit review.

## Register contract

The complete source document uses this schema:

~~~json
{
  "schema": "stellar-forge.horizon-invoice-register.v1",
  "programmeId": "ORIGINAL_PROGRAMME_UUID",
  "programmeVersion": 1,
  "programmeSha256": "ORIGINAL_PROGRAMME_SHA256",
  "entries": [
    {
      "id": "original-invoice-payment-instructions",
      "invoiceId": "ORIGINAL_INVOICE_ID",
      "role": "collection",
      "account": "ORIGINAL_STELLAR_DESTINATION",
      "memo": {"type": "id", "value": "ORIGINAL_UINT64_MEMO"},
      "note": "Original invoice payment instructions and their source location"
    }
  ]
}
~~~

Replace every illustrative value using actual saved records. This is a schema example, not a native transaction or a company invoice. Register entries may select collection (the invoice asset and amount) or settlement (its separately declared settlement asset and amount). The programme supplies those exact values; the mapping cannot substitute another asset or amount. A target must be a Stellar asset with seven decimal places and must be included in the programme's selected networks, when that list is nonempty.

The account accepts a checksummed original G or M StrKey. G and M identities remain exact; the review never treats a multiplexed account as an unrestricted match to its base account. Optional fromAccount applies the same exact rule to the sender.

The memo is required. Select none explicitly for a transaction whose original memo type is none. A missing transaction join is not a none memo. Text memos compare their complete UTF-8 bytes (or supplied canonical bytesBase64), including whitespace, with the original native 28-byte limit. ID memos retain uint64 values as decimal strings. Hash and return memos retain the original 32 bytes, accepting explicit hex or base64 input through the maintained native memo normalizer.

Duplicate mapping IDs are rejected. Separate invoices may have the same account/memo combination; that produces explicit ambiguous candidates. The review does not assume unique ownership from an address, amount, contact or invoice label.

## Matching and discrepancies

Only original Horizon payment, path_payment_strict_send and path_payment_strict_receive operations enter guided deposit attribution. For a path payment the credited destination asset and amount are the deposit. Account creation, clawbacks and other operations remain retained but are listed as ignored for this particular guided workflow.

A candidate requires the same network, exact destination, exact optional sender, complete memo and asset code/issuer. The observed and invoice amounts use the maintained exact decimal codec. The review displays both amounts and the signed difference in seven-decimal native units. It labels each candidate EXACT, LESS_THAN_INVOICE or GREATER_THAN_INVOICE; it never rounds a near match or silently converts currencies.

A movement becomes blocked when native observations conflict, its transaction success is false or unknown, the source root is missing, the joined memo is missing, original projection validation found issues, a selected capture is incomplete, a response is missing or a source has a native error. Failed observations remain visible in the full original source. Repeated identical payment observations retain every source reference and do not produce repeated choices.

An earlier link, unlink, exclusion or inclusion on the same original operation also blocks this shortcut, even when that earlier decision references a different capture and is not selected in the current observation. Use the existing **Reconciliation** corrective-decision form and its supersedes field to review that history. The guided workflow preserves all original decisions.

Unmatched movements retain the actual original values. The review reports counts of account mappings that differ in memo, sender or asset; the complete register remains in the downloadable review. It does not guess an invoice from the amount alone. The full review JSON includes every movement, ignored original record and source/capture binding, while the browser pages the rendered movement table.

## CLI and native API

The installed command is unchanged:

~~~sh
stellar-invoice-settlement serve \
  --workspace /absolute/original-workspace \
  --connections-file /absolute/private/connections.json

stellar-invoice-settlement horizon-review \
  --workspace /absolute/original-workspace \
  --input /absolute/horizon-selection.json

stellar-invoice-settlement horizon-apply \
  --workspace /absolute/original-workspace \
  --input /absolute/reviewed-horizon-choices.json
~~~

Selection JSON contains programmeId, programmeVersion, registerSourceId and the complete sourceIds array. Retain the register first through the ordinary source import with provider document, kind horizon-invoice-register and that exact programme version.

The read-only horizon.review result includes reviewSha256, the full reviewed programme/register/source/capture context and movement rows. The apply request contains the same selection, reviewSha256, actual actor, original requestId, current expectedRevision and individually selected choices:

~~~json
{
  "programmeId": "ORIGINAL_PROGRAMME_UUID",
  "programmeVersion": 1,
  "registerSourceId": "ORIGINAL_REGISTER_SOURCE_UUID",
  "sourceIds": ["ORIGINAL_ROOT_SOURCE_UUID", "ORIGINAL_PAYMENT_SOURCE_UUID"],
  "reviewSha256": "ORIGINAL_REVIEW_SHA256",
  "actor": "Actual reviewer",
  "requestId": "ORIGINAL_APPLY_REQUEST_UUID",
  "expectedRevision": 12,
  "choices": [
    {
      "movementId": "ORIGINAL_MOVEMENT_SHA256",
      "mappingId": "original-invoice-payment-instructions",
      "reason": "The reviewer's actual explanation of this attribution and amount"
    }
  ]
}
~~~

The version/revision examples illustrate the shape. Supply the actual returned values. Native callers use openInvoiceWorkspace().horizonReview(args) and .horizonApply(args). The operator exposes horizon.review and horizon.apply through the existing authenticated /api/invoke, original generic operation panel and installed CLI. The pure matcher is also exported at ./seller/invoice-settlement/horizon-invoices.

A changed register, source, capture or relevant original decision changes the review digest. Apply recomputes the complete review inside the same writer transaction before creating any decisions. A mixed valid/invalid choice set commits no subset. The ordinary expected revision still protects concurrent workspace writes.

After a lost apply response, inspect request-status for the original UUID or repeat the identical original request. The original journal returns its committed result without appending more decisions. Do not choose a fresh request ID just because the response was interrupted. The browser persists the complete original apply arguments before dispatch through its existing IndexedDB request journal.

## Source and boundaries

The implementation extends the original SF30 invoice settlement and settlement-audit components. It reuses their complete native StrKey/memo validation, exact decimal arithmetic, network normalization, source projection, private file store, transaction journal, existing decisions and full package receiver. The source manifest and maintained distribution contribution include this module and guide.

Native source contracts are retained in settlement-audit/source/horizon-api-source.json, with upstream Stellar SDK and documentation identities exposed by the existing Horizon adapter. Public reference: [Horizon payments](https://developers.stellar.org/docs/data/apis/horizon/api-reference/resources/payments). The actual source ledger and invoice-system import schema remain explicit owner inputs. The Bloccpay/SDP/Bridge coordination does not grant account access or authorize a live payment.
