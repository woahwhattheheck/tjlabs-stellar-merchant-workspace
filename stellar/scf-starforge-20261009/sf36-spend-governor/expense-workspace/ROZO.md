# ROZO reports in the original buyer expense workspace

The buyer intake retains an original saved ROZO finance source, including its report JSON, CSV and HTML, raw provider captures, original observations and report-era order editions. A named operator explicitly selects the buyer's purchases. Merchant receipts, provider fees and destination payouts keep their original financial meanings; importing a merchant report does not automatically create buyer expenses.

## Capture and review

Export an existing immutable report through the ROZO finance source command. Retain the complete file bytes and their SHA-256. The product's finance page uses the same native routes described here.

1. Inspect the original source and select its source-payment movements. For each selection retain the movement ID and reviewed basis SHA-256, purchase owner, purchase reference and a reason. Fees and destination payouts cannot be selected as extra purchases. An empty selection retains a reference-only edition.
2. Preview through `POST /api/rozo-reports/preview`. Use the original source bytes, exact source SHA-256, filename, source name, provenance, operator, data context and selection. Operational and development sources remain in separate original workspaces.
3. Save through `POST /api/rozo-reports` using that exact payload plus the returned `preview_sha256`, a stable `request_id` and the observed `expected_revision`.
4. Accept or reject the resulting pending capture with the existing source review operation. A successor capture names the same original ROZO origin/profile and the current accepted parent. Earlier source bytes and decisions remain immutable.

The native payload is:

```json
{
  "filename": "original-rozo-finance-source.json",
  "content_base64": "<complete original file bytes>",
  "source_sha256": "<SHA-256 of those file bytes>",
  "name": "Original ROZO purchases",
  "provenance": "Original saved ROZO report and explicit buyer ownership",
  "operator": "Named intake owner",
  "data_context": "development",
  "selection": {
    "schema": "stellar-forge.rozo-buyer-selection.v1",
    "sourceId": "<original sourceId>",
    "purchases": [
      {
        "movementId": "<original source-payment movement ID>",
        "basisSha256": "<reviewed financial basis>",
        "purchaseOwner": "Named buyer",
        "purchaseReference": "Original purchase reference",
        "reason": "Why this original payment belongs to this buyer"
      }
    ]
  }
}
```

A committed save returns the original source ID and capture ID in the existing native mutation result. Inspect the stable request at `GET /api/requests/<request_id>` after a lost response. Retry only the same original request body and ID; a missing result is an observation, not permission to create another request.

Download the exact retained source at `GET /api/captures/<capture_id>/rozo-original`. The full native capture and its explicit selection are also available through the existing original-capture route.

## Amounts, dates and evidence

The source payment must contain an exact measured amount, its original chain/network/token/precision and provider confirmation before it can be coded. Pending, unmeasured or undated source payments remain `ROZO_PURCHASE_UNRESOLVED` exceptions. They carry no expense or spending reservation.

Provider-confirmed purchases retain the classification `ROZO_PROVIDER_CONFIRMED_PURCHASE`. This is provider evidence. The native proof SHA is empty and `independent_chain_proof` is false. Actual original contract observations remain part of the source archive and do not become a generated SF36 finalization.

Use the existing cost-center, coding and period forms. Coding supplies its own recognition date and exact allocation lines; the original provider day remains a separate source date. Each allocation total must equal the retained source-payment units. Labels must use the exact retained ROZO asset identity and precision. No exchange rate or combined cross-asset amount is inferred.

Original ROZO reconciliation issues remain visible. A named period reviewer must accept their provider evidence, carry the item or exclude it. An unresolved original source cannot be made settled by a disposition. Changed amounts, asset contracts, status or reviewed purchase ownership invalidate earlier coding through the existing native basis comparison.

The same original source/profile is reused across report editions. Purchases omitted from a following accepted selection become absent rows with their previous bytes retained. The existing period engine checks duplicate source/payment identity and already-issued periods. Reopen the original closed period before correcting previously issued amounts.

## Close, accountant return and complete receiving

Review and close the period with the original Buyer APIs. The issued accountant source, typed allocation lines, complete original ROZO captures and operator decisions remain in that close. Pass its exact issued source to the existing AccountantWorkspace. Its CSV preview, immutable return revisions and buyer-return import remain the established workflow.

The complete project includes this adapter, its trusted original JavaScript reader, all captures, purchase selections, coding editions, source decisions, closes and successful request receipts. Receiving verifies every original ROZO file and reprojects every selected purchase before accepting the same database identity.

Use a trusted installed receiver with Node 24:

```sh
python3 receive.py \
  --archive buyer-expense-complete-project.zip \
  --directory received-buyer \
  --expected-sha256 ORIGINAL_ARCHIVE_SHA256 \
  --node /absolute/path/to/node
```

The receiver executes its own installed pure source validator. It never executes a JavaScript or Python file from the archive it is validating, contacts a ROZO endpoint, opens an original buyer ledger or initiates a payment. Opening the received buyer workspace then uses its included application and the same original database.
