# CanadaBuys: original document intake through the installed customer

The installed customer prepares an RFP, workbook and amendment set from the customer's original files, inspects that complete request through the existing Merchant connection, and saves every document together in the native CanadaBuys workspace. The saved documents remain native evidence records and enter the existing review, requirement, decision, report, export and cold-receiving workflow.

The original engine is CanadaBuysWorkspace.bidderDesk.intakeEvidence. Its SQLite transaction and command history provide the save and replay semantics. The customer and Merchant layers retain the same native request.

## Existing installation and connection

Use the installed **canadabuys-customer** command from the existing Starforge distribution. The Merchant host must already expose the CanadaBuys workspace under its configured alias. Obtain a bound connection through the existing connection-template and bind commands described in [CANADABUYS_CUSTOMER.md](CANADABUYS_CUSTOMER.md). That file retains the actual native workspace UUID, endpoint and credential environment-variable name.

An intake uses the existing host **inputs** configuration. The customer cannot pass an arbitrary host filesystem path over MCP. If customer and Merchant run on different machines, the host operator receives the complete prepared JSON through their existing authorized file-transfer route, verifies its exact bytes and SHA256, and declares that file under an input alias. This guide does not establish a new transfer destination, grant file access or modify a running Merchant's configuration automatically.

Use a private working directory and keep the connection, manifest, prepared request and operation history there. Document requests contain every original file as Base64.

## 1. Select the original notice and files

Read the existing notices:

~~~sh
canadabuys-customer read --connection bound-connection.json \
  --tool status --all --out original-notices.json
canadabuys-customer intake-template --out documents.json
~~~

Edit documents.json to identify the actual saved notice and your complete source files:

~~~json
{
  "noticeId": "REPLACE_WITH_ORIGINAL_NOTICE_ID",
  "commandId": "customer-rfp-original-001",
  "capturedAt": "REPLACE_WITH_ACTUAL_CAPTURE_TIMESTAMP",
  "sourceUrl": "REPLACE_WITH_ACTUAL_DOCUMENT_SOURCE_URL",
  "documents": [
    {
      "path": "./rfp.pdf",
      "title": "Original request for proposals",
      "kind": "OTHER",
      "language": "en",
      "pageOrSection": "",
      "notes": "Original source file."
    },
    {
      "path": "./pricing.xlsx",
      "title": "Original pricing workbook",
      "kind": "OTHER",
      "language": "en"
    },
    {
      "path": "./amendment-1.pdf",
      "title": "Original amendment 1",
      "kind": "OTHER",
      "language": "en",
      "version": "1"
    }
  ]
}
~~~

Use the actual capture time, for example an observed ISO 8601 timestamp. Each document can override capturedAt and source metadata. Paths are relative to the manifest. Optional bytes and sha256 fields must agree with the complete original file.

Use a stable command ID for this original batch. It identifies the same documents and intended save; retain it across interruption recovery. Use a new command for a genuinely different batch.

Preparation permits 1–100 regular documents, at most 64 MiB each and 128 MiB combined. Complete prepared JSON is bounded at 192 MiB to accommodate Base64 and metadata. Preparation reads each file on one open handle in bounded chunks and verifies its complete digest, byte length and unchanged inode metadata. It refuses symlink final components.

## 2. Prepare the complete native request

~~~sh
canadabuys-customer prepare-intake \
  --connection bound-connection.json \
  --manifest documents.json \
  --request-out native-intake.json \
  --out intake-preparation.json
~~~

The command reads the actual workspace revision and selected notice through the authenticated MCP connection, reads every original document, and checks that the workspace did not advance during preparation. It publishes native-intake.json through an atomic, create-only file operation. A different existing file is preserved and rejected.

The prepared file contains the native workspaceId, noticeId, expectedRevision, commandId and complete documents. It does not save evidence yet. Its result identifies the complete request file and every document hash. Capture timestamps come from the manifest.

The original local native preparation remains supported:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/evidence-intake.mjs \
  prepare /path/to/original-workspace documents.json native-intake.json
~~~

Both preparations produce the same native intake shape. A request created by the original CLI can be inspected and saved through the installed Merchant.

## 3. Bind the prepared file on the existing Merchant host

The host operator adds the prepared file to the existing workspace's inputs, preserving all other configuration:

~~~json
{
  "inputs": {
    "original-rfp-intake": {
      "file": "./private/native-intake.json",
      "label": "Original RFP, pricing workbook and amendment"
    }
  }
}
~~~

This is a fragment of the existing connection, not a replacement configuration. Use its existing relative-path rules and normal service lifecycle. Do not overwrite another input or the current service's ownership.

Create a private inspect-intake.json:

~~~json
{
  "input": "original-rfp-intake",
  "expectedSha256": "REPLACE_WITH_PREPARATION_REQUEST_FILE_SHA256"
}
~~~

~~~sh
canadabuys-customer read --connection bound-connection.json \
  --tool bidder_intake_inspect --args inspect-intake.json \
  --out original-intake-inspection.json
~~~

Inspection returns the exact file identity, native workspace, original command, notice, revisions, per-document identities and source metadata. It does not return document bodies or mutate the workspace. Native intake performs authoritative metadata and transaction validation when saving.

Inspection rejects changed files, another workspace, invalid Base64, contradictory document identities and exceeded size limits. Missing host inputs remain explicit configuration errors.

## 4. Retain and run one original intake operation

~~~sh
canadabuys-customer intake-plan \
  --connection bound-connection.json \
  --input original-rfp-intake \
  --expected-sha256 REPLACE_WITH_PREPARATION_REQUEST_FILE_SHA256 \
  --directory original-intake-operation \
  --operation-id customer-rfp-original-001 \
  --out original-intake-plan.json

canadabuys-customer show --directory original-intake-operation
canadabuys-customer run --directory original-intake-operation \
  --out original-intake-save.json
~~~

Intake-plan performs a read-only inspection, then calls the existing durable operation planner. Its immutable request retains the input alias, exact file SHA256, native UUID, notice, command and original save revisions.

Run calls merchant_canadabuys_bidder_intake. The provider rereads and verifies that exact input, then passes its complete native request to intakeEvidence. It does not loop over separate per-document create operations. Every record commits together in the original transaction or none of that batch commits.

The result retains the native intake schema, command ID, intake digest, notice ID, original evidence editions and current workspace metadata. The alreadyApplied field identifies native replay.

After a lost response, run the same saved operation again. Its replay policy binds both the original command and input SHA256. Native command history returns the original editions even if later reviews created newer editions. The customer retains the returned result before publishing completion. Reopening a completed operation uses that saved result without another call.

Do not overwrite the configured input with different bytes to force a retry. Changed input is rejected before the native mutation.

## 5. Resolve an actual revision conflict

Another valid workspace change can occur before save. Preserve the original request and failed operation, then explicitly select the current save revision:

~~~sh
canadabuys-customer refresh-intake \
  --connection bound-connection.json \
  --request native-intake.json \
  --request-out native-intake-refreshed.json \
  --out intake-save-revision.json
~~~

This retains every original field, including expectedRevision, command and document bytes, and changes only applyRevision to the observed current revision. It creates a separate file. The result binds that file to the original request's path, length and SHA256.

Declare the refreshed file under a separate host input alias, inspect it, and plan a new customer operation directory around that exact file. Keep the same native command ID. Native intake excludes applyRevision from its original intake identity, so an already committed batch returns its original records. A different document or authored metadata under the same command is rejected.

The new operation directory records an explicitly changed file selection. Retain the previous immutable request and attempt history.

## Review, export and cold receiving

Read returned evidence IDs with bidder_record and complete the existing human review workflow. Incoming documents begin unreviewed. Intake cannot assert that someone reviewed a source. Use saved evidence editions for requirement references and retain amendments as explicit source history.

The existing export tool exports a selected evidence edition's exact bytes with format evidence, or the complete native package with format package. Keep its original publication UUID, download every listed file, verify offline and receive through the installed commands in the customer guide. The native package retains evidence bytes, editions and command history, allowing cold receiving to reconcile the same intake with its original IDs.

After receiving, open the actual installed workspace:

~~~sh
canadabuys serve --workspace /path/to/received-workspace --operator customer
~~~

Open its printed loopback URL, then **Bidder desk → Decision & reports**. Receiving does not imply purchase, payment or completed source review.

## JavaScript and MCP surface

CanadaBuysMerchantClient exposes inspectEvidenceIntake(args) and intakeEvidence(args). The existing installed operations module exports:

- prepareCanadaBuysEvidenceIntake({client, manifestPath, outputPath, signal})
- refreshCanadaBuysEvidenceIntake({client, requestPath, outputPath, signal})
- prepareCanadaBuysIntakeOperation({client, connection, directory, operationId, input, expectedSha256, signal})

The catalogue adds merchant_canadabuys_bidder_intake_inspect as read-only and merchant_canadabuys_bidder_intake as native-command idempotent. Existing tool names, operations, source configuration, service lifetime and download contracts remain compatible.
