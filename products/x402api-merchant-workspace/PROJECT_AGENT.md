# Merchant project agents

The project agent uses the original managed **Receive Merchant project** application. An operator selects the complete archive and destination in Applications; the application owns extraction, the retained receiving request, the accepted receipt and the readonly invoice desk. The typed client and Merchant MCP expose that same operation and its complete retained files.

## Open the original project

Start the saved intake application through its existing Applications workspace. Keep its returned URL and original selection SHA-256 together. The selected archive, archive SHA, destination, store, native receive operation and complete source manifest are fixed by that selection.

Use the original operator credential supplied through the application's private environment file. The agent host receives that credential through an environment variable. It is never a tool argument or included in connection metadata, source packages or generated documents.

The current listener uses an explicit loopback port: http://127.0.0.1:PORT/. When Applications restarts that same selection, update the private connection record with the new actual address. Keep the original selection SHA. Both the client request and the server response carry that SHA; a different project at a reused address cannot accept the original receive request.

An older source edition without this header contract must be upgraded through the normal complete-source Applications workflow. Preserve the original project and receiving operation during that upgrade.

## Configure the existing Merchant MCP host

Keep the existing Merchant host configuration, release store, source selection and other providers. Add its declared input:

~~~json
{
  "merchantProjectConnection": "/srv/private/merchant-projects/projects.json"
}
~~~

The value points to a private JSON file. It augments the existing host configuration; the fragment above is not a replacement for that full file.

Use this project connection file:

~~~json
{
  "schema": "stellar-forge.merchant-project-agent.v1",
  "projects": {
    "original": {
      "label": "Original customer merchant project",
      "connectionFile": "/srv/private/merchant-projects/current-intake.json",
      "selectionSha256": "EXACT_64_CHARACTER_SELECTION_SHA256",
      "tokenEnvironment": "MERCHANT_REVIEW_OPERATOR_TOKEN",
      "exportsDirectory": "/srv/private/merchant-projects/exports"
    }
  }
}
~~~

Create the existing exports directory with owner-only permissions, and keep both JSON files owner-only. Absolute paths are recommended; relative paths resolve against the configuration file. The configuration accepts 1–32 named original projects with distinct selection identities. The process account must own the exports directory, and its path must be canonical without symbolic links.

The current connection record contains the running application's address:

~~~json
{
  "schema": "stellar-forge.merchant-intake-connection.v1",
  "url": "http://127.0.0.1:ACTUAL_PORT/",
  "selectionSha256": "EXACT_64_CHARACTER_SELECTION_SHA256"
}
~~~

The original standalone intake announcement, with schema stellar-forge.merchant-project-intake.v1 and mode intake, is accepted directly as well. For a managed Applications announcement, copy its actual URL and original selection SHA into the small connection record above. The file reader checks the pinned identity on each live operation.

The selected complete x402api-merchant contribution declares the merchant-projects provider and its source. Discovery loads its tool metadata; the original host loads the runtime and connection reader through the existing provider lifecycle. Close that host through its normal shutdown so outstanding requests and native file descriptors finish.

## Complete agent workflow

1. Call merchant_project_projects and choose the existing alias.
2. Read merchant_project_status. Preserve the full selected archive identity and the existing native operation.
3. Read merchant_project_inventory from offset zero. Follow nextOffset until it is null, retaining the original manifest SHA. An optional filter searches original member paths.
4. When the operator intends to receive that selection, call merchant_project_receive with the same alias and exact expectedSelectionSha256. It sends the application's existing receive request once.
5. Read status until the original native operation reaches COMPLETE. Then retain the complete manifest and receipt through merchant_project_manifest and merchant_project_receipt.
6. Page the original invoice register. Retain its source.revision, and pass that revision and the returned cursor for subsequent pages.
7. Read full invoice records, original payment envelopes and paid result files. Export the reviewed register selection as complete JSON or CSV at its exact revision.
8. Receive every returned artifact through the file reader until nextOffset is null. Verify the combined bytes and SHA-256.
9. Stop the application through its existing Applications owner. The complete downloaded artifacts remain readable from the agent host, including after that host reopens.

A receive response may be lost after the native operation begins or completes. Such transport or response-validation failures carry outcomeUnknown and a recovery action pointing to the same selected status. Inspect that original status. If further receiving is needed, explicitly repeat the same selected receive operation. The client creates no replacement request identity and never automatically retries the POST.

The native engine's readiness and actual error remain available in status. A returned HTTP validation error is distinct from an uncertain post-dispatch response.

## Tools

Every tool except projects selects a configured project alias.

| Tool | Original operation or complete result |
| --- | --- |
| merchant_project_projects | Configured aliases, labels, selected identities and provider lifecycle state |
| merchant_project_status | Current original intake state and selected archive/case |
| merchant_project_inventory | Complete original member inventory, paged with offset/limit/filter |
| merchant_project_receive | One original receiving request, requiring expectedSelectionSha256 |
| merchant_project_manifest | Complete native source manifest artifact |
| merchant_project_receipt | Complete accepted native receiving receipt artifact |
| merchant_project_register | Original readonly invoice register with selection, revision and cursor |
| merchant_project_invoice | Original invoice state summary and full invoice/history artifact |
| merchant_project_envelope | Complete original payment-request envelope artifact |
| merchant_project_result | Verified complete original paid result artifact |
| merchant_project_register_export | Full JSON or CSV register artifact at the selected revision |
| merchant_project_artifacts | Retained artifacts, paged by stable artifact ID |
| merchant_project_file | Exact retained bytes through the original immutable file reader |
| merchant_project_file_release | Release this process's temporary read descriptor |

Invoice tools reuse the maintained operator client. Monetary values keep their original decimal-string representation. Envelope reads return the original request and challenge; payment authorization and submission remain part of the original live Merchant workflow.

## Receive complete files and continue an interrupted read

A document or result returns an artifact containing its stable artifactId, selection, original operation/store/manifest, kind and payload metadata. The payload gives its complete byte count, SHA-256, filename and content type.

Start with:

~~~json
{
  "project": "original",
  "artifactId": "EXACT_ARTIFACT_ID",
  "expectedSha256": "EXACT_PAYLOAD_SHA256",
  "offset": 0,
  "limit": 196608
}
~~~

Each response contains readId, file, offset, bytesRead, nextOffset, encoding:"base64" and data. Decode the complete base64 chunk. For the next chunk retain the same artifact ID, read ID and expected SHA, and use nextOffset. A null next offset completes the read and closes its descriptor.

After expiry, release or process restart, omit the old read ID and resume with the same artifact ID, expected SHA and byte offset. The reader opens and hashes the exact retained original file before returning more bytes. It checks native file identity around every chunk.

Use merchant_project_file_release when abandoning an active read. This releases the descriptor and preserves the full artifact. The artifacts, file and file_release tools need only the retained host files; they do not contact the stopped application or read an operator credential.

Whole artifacts are stored privately under the configured exports directory and selection SHA. JSON documents are limited to 64 MiB; original streamed result files use the maintained client limit of 8 GiB. The metadata and content are published atomically and an existing identity can be reused only when its complete bytes match.

## Typed Node client

The complete distribution exposes the package subpath merchant/x402api/intake-client; source checkouts can import project-intake-client.mjs directly. The adjoining .d.mts provides the full interface.

~~~js
import {createMerchantIntakeClient} from './project-intake-client.mjs';

const client = await createMerchantIntakeClient({
  url: currentIntakeUrl,
  selectionSha256: originalSelectionSha256,
  operatorToken: process.env.MERCHANT_REVIEW_OPERATOR_TOKEN,
});

const current = await client.status();
const members = [];
for await (const page of client.inventoryPages({limit: 50})) {
  members.push(...page.rows);
}

// Preserve current.selection before explicitly receiving this same project.
await client.receive();
const after = await client.status();
// Continue the same status read while the original native operation is running.
if (after.state === 'COMPLETE') {
  const manifest = await client.manifest();
  const receipt = await client.receipt();
  const review = await client.review();
  for await (const page of review.registerPages({limit: 100})) {
    for (const invoice of page.orders) {
      const complete = await review.inspectInvoice(invoice.id);
      // Select and save complete results through the maintained operator client.
    }
  }
}
~~~

The readonly review returned here is the existing operator client restricted to its read and export methods. It validates the actual received store, tenant and review mode. Its result downloader verifies the original response length and SHA and publishes a private destination atomically.

## Original Applications receiving course

The complete received-review-receiving.mjs programme retains its original archive, saved intake application, five complete invoices and desktop/phone reviews. It additionally opens that same saved application for archive-agent and archive-agent-cold.

In each agent opening the new project-agent-receiving.mjs consumer operates the typed client and all fourteen declared MCP tools: whole inventory, same original receive replay, full manifest/receipt, all five invoice histories/envelopes/results and both register export formats. It receives all nineteen artifacts, deliberately releases and reopens an original chunk read at its retained byte offset, and compares a direct typed result download with the original retained result.

The Applications owner stops the actual managed process before verifying the saved artifacts through a new provider instance. It then closes and reopens the same Applications workspace for the second opening. Every original business table is compared before and after, and cached completion revalidates the stopped native result and all retained files before reuse.

Use the existing complete receiving command documented in PROJECT_INTAKE.md, with the same original archive, project, runtime, Applications workspace, private environment and output directory. The complete selected runtime must include this guide, consumer, provider, typed client and the original invoice client. Both portable source selectors retain that complete closure together with the current complete invoice-intake workflow.

The additive outputs are archive-agent.json, each original opening record, and agent/archive-agent plus agent/archive-agent-cold. Each directory contains the exact intent, private connection configuration, full artifacts and complete received files. Keep these with the original native/browser course and receiving receipt.
