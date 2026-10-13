# Merchant invoice sources and complete project delivery

The Merchant invoice agent connects to the existing live Merchant application through its maintained typed operator client. It takes original CSV or JSON bytes through source inspection, a saved import plan, review, creation of the original local invoice drafts, complete invoice/result exports, and the original project handover. The received project then opens in the existing Applications intake and review desk.

The maintained server owns the invoice database, import plan, fulfillment and project export. The agent retains complete input requests and delivery files in private host storage. The existing browser, operator CLI and agent therefore operate the same original records.

## Select the original owner

Commission the existing live application with the operator CLI described in OPERATOR_CLIENT.md. Its private connection file contains the original store and tenant UUID, application URL and an environment reference. Record that complete file's SHA-256.

Create an existing private directory for the agent's retained artifacts. Use mode 0700 for its directory and 0600 for configuration and source inputs. All selected paths are normalized absolute paths without symlink parents.

The host declaration is:

~~~json
{
  "schema": "stellar-forge.merchant-invoice-agent.v1",
  "merchants": {
    "delivery": {
      "label": "Delivery merchant",
      "connectionFile": "/private/merchant/connection.json",
      "connectionSha256": "THE_COMPLETE_CONNECTION_FILE_SHA256",
      "tokenEnvironment": "MERCHANT_OPERATOR",
      "exportsDirectory": "/private/merchant/agent-artifacts",
      "sources": {
        "october": {
          "path": "/private/merchant/October_Invoices.csv",
          "name": "October_Invoices.csv",
          "format": "csv",
          "sha256": "THE_ORIGINAL_SOURCE_FILE_SHA256"
        }
      }
    }
  }
}
~~~

Select this file through the Merchant host's merchantInvoiceConnection input. The installed provider is merchant-invoices, its configuration family is merchantInvoices, and its tools begin with merchant_invoice_. The distribution contribution registers it with the same selected x402api-merchant product. Provider discovery loads its catalogue; native source and connection handling load when used.

The sources map is optional. It lets a host select an existing original document by a short name without placing the whole document into an agent request. A caller can instead supply source: {name, format, text}. Every source is checked against the original engine's byte and row capacity. Direct text is limited to 1 MiB of UTF-8; the provider's 8 MiB request envelope allows JSON escaping of those complete bytes.

The connection is selected by its exact file SHA and original store/tenant UUID. Every online call rereads that private connection and the maintained client verifies the server's original owner headers. A newly commissioned address or revised connection is a new explicit host selection. Keep the preceding configuration and its artifacts available for their original delivery records. The same scope is derived from the pinned connection and owner IDs, so an offline artifact reopening uses its original configuration.

## Complete source-to-invoice operation

1. Call merchant_invoice_merchants and select the actual host alias.
2. Call merchant_invoice_context. Receive the full context artifact through merchant_invoice_file and review its configured resource, fulfillment binding, rails, currency precision and current configurationSha256.
3. Call merchant_invoice_source with either sourceFile or source. The original server parser returns the original columns and row count. Receive its full source artifact; preserve the returned source SHA.
4. Choose a stable operation UUID before preparation. Call merchant_invoice_prepare with that UUID, the reviewed configurationSha256 and sourceSha256, the same source selection, and the actual column mapping.
5. Call merchant_invoice_plan and receive the entire artifact. It contains the exact original source, mapping, frozen configuration, every normalized invoice and offered rail, and current status.
6. Review those complete normalized invoices. Call merchant_invoice_run with the original operation and expectedPlanSha256 from that saved plan.
7. Read merchant_invoice_status. COMPLETE means every original invoice is retained with compatible frozen terms. A PARTIAL or CONFLICT status and its complete artifact identify the affected original records.
8. Use the existing payment workflow for subsequent payment and fulfillment. Inspect each original invoice and receive its completed result when available.

The mapping retains original source column names:

~~~json
{
  "key": "Invoice group",
  "reference": "Reference",
  "title": "Description",
  "assetId": "Asset ID",
  "amount": "Amount",
  "amountMode": "decimal",
  "invoiceId": "Original invoice UUID"
}
~~~

invoiceId is optional. When supplied, it names the original invoice UUID column. Without it, the original server derives deterministic invoice IDs from the original operation and grouping key. Rows with the same key describe one invoice's distinct payment options. Amounts stay strings. The original parser enforces configured assets, exact decimal precision, positive amounts and consistent grouped invoice fields.

The complete original preparation request is saved before dispatch. It includes the selected source bytes, mapping, configuration digest, operation and owner IDs. Reusing that operation with another request is rejected by the immutable retained request as well as the original engine.

## Recover the same save

A mutation is sent once per explicit call. The provider carries the maintained client's original outcome and recovery selection.

| Returned condition | Continue the original operation |
| --- | --- |
| Success with requestArtifact and plan/status artifact | Receive all artifact bytes and retain their SHA values. |
| outcome UNKNOWN | Read the named recovery tool using the same merchant and operation. The server may already have saved the request. |
| A prepared original operation is visible | Read its complete plan, review the original planSha256, then continue run if appropriate. |
| Preparation needs explicit replay | Call merchant_invoice_resume_prepare with the same operation and requestArtifact.payload.sha256. It reads and resends the exact retained body. |
| A run was interrupted | Read status and the same plan. Resume run with that original planSha256; the original engine retains already-created compatible invoices. |
| outcome RECEIVED with a local publication error | The response reached the caller. The returned received summary and recovery selection identify it; read the same status to retain its complete current artifact. |
| Project preparation was interrupted | Read merchant_invoice_project_status for its original project UUID. Continue that exact original request according to the maintained project state. |

The request artifact ID identifies its metadata record; the payload SHA identifies its exact JSON bytes. resume_prepare takes the payload SHA. Store both in the calling agent's existing case record.

Configuration changes, source changes, incompatible existing invoices and changed review digests keep the original engine's own errors. The complete response is retained as an artifact, while tool summaries preserve the original state, counts, configurationCurrent and any per-invoice interruption.

## Receive complete invoice and project files

| Tools | Original output |
| --- | --- |
| merchant_invoice_register | Revision-pinned invoice page and original selection. Continue its cursor with that same revision. |
| merchant_invoice_invoice | Full original invoice and event history artifact. |
| merchant_invoice_envelope | Original payment request envelope artifact. |
| merchant_invoice_result | Complete verified original retained delivery bytes. |
| merchant_invoice_register_export | Complete original CSV or JSON for the reviewed selection and revision. |
| merchant_invoice_project | Complete original project capability artifact. |
| merchant_invoice_project_begin | One original complete-project request with its retained UUID. |
| merchant_invoice_project_status | Current original export state. |
| merchant_invoice_project_manifest | Complete original source, workspace and reservation inventory. |
| merchant_invoice_project_download | Complete original SHA-verified project ZIP. |

Read project status until the original operation is COMPLETE, then retain its manifest and ZIP. Select that exact archive and SHA through the existing managed x402api-merchant-project-intake application described in PROJECT_INTAKE.md. The merchant_project_* tools in PROJECT_AGENT.md receive that managed selection and review the received invoices and results. The source plan is inside the original workspace and travels in the complete project archive.

Each artifact has a stable artifactId and a payload containing name, content type, byte length and SHA-256. Its metadata also retains the original pinned connection, store and tenant, source kind and relevant operation/invoice/revision.

merchant_invoice_file accepts the artifact ID, expectedSha256, offset and a limit from 1 to 196608 bytes. It returns base64 bytes, current offset, nextOffset and readId. Continue until nextOffset is null. Verify the complete byte count and SHA after decoding. A released or expired descriptor can be reopened using the same artifact, SHA and offset without readId. merchant_invoice_file_release releases that temporary descriptor while the complete artifact remains available.

merchant_invoice_artifacts pages immutable artifacts by artifact ID. These reads work after the live application stops and after the provider reopens. Original file metadata and descriptors are revalidated when selecting retained bytes.

## Typed integration

The underlying supported client is still createMerchantOperatorClient from operator-client.mjs and operator-client.d.mts. It exposes intakeContext, inspectIntakeSource, prepareIntake, readIntake, exportIntake and runIntake alongside the complete original invoice, result and project methods.

For a configured local host, the same complete consumer can be used directly:

~~~js
import {readMerchantInvoiceConfiguration}
  from './stellar-forge/mcp-merchant-operator/merchant-invoice-connection.mjs';
import {MerchantInvoices}
  from './stellar-forge/mcp-merchant-operator/merchant-invoices.mjs';

const selected = await readMerchantInvoiceConfiguration('/private/merchant/invoice-agent.json');
const invoices = new MerchantInvoices({merchantInvoices:selected});
try {
  const context = await invoices.call('merchant_invoice_context', {merchant:'delivery'});
  console.log(context.native.configurationSha256, context.native.artifact);
} finally {
  await invoices.close();
}
~~~

close drains admitted calls and retained descriptors. The shared Merchant provider lifecycle owns the host-level shutdown. Input files, connection files and output artifacts remain private host data; tokens are read from the selected environment and are absent from returned configuration and artifacts.

## Operate the original complete customer case

The existing installed-receiving.mjs --portable course now calls invoice-agent-receiving.mjs during its original live Applications opening. It derives a receiving source from the actual five completed invoice records and their original IDs and offers, freezes that exact source, prepares and explicitly replays the original import, reviews it and runs it through the original engine. The five compatible original invoices stay the same records.

The same browser creates the original complete project export. The agent reopens that very project operation and receives its identical manifest and whole ZIP. Its complete source, plan, request, invoice, envelope, result, register and project artifacts are downloaded with original SHA checks. A deliberate descriptor release exercises the original resumed-file offset without changing the file identity.

After the actual Applications stop, the programme reopens the retained files through a new provider owner using the same configuration, without contacting the stopped server. The original installed programme then continues its native portable receiving, read-only browser, activation and cold reopening. The existing received-review-receiving.mjs course carries that exact ZIP through managed intake and the separate received-project agent.

The original receiving input remains the existing five-invoice commissioned archive. Its business-table snapshots, original payments and result bytes are preserved by that same programme. Native completion is recorded only by the original operated result and its complete delivery; source publication and a syntax parse are recorded separately.
