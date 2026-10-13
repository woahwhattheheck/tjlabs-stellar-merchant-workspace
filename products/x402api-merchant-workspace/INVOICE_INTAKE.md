# Import a complete invoice register

The merchant operator can retain an original CSV or JSON accounting export, map its columns, review every invoice and create the selected drafts in the existing merchant workspace. It uses the same original store and invoice creation path as the single-invoice screen. Each source row supplies one payment option; several rows with the same grouping key become one invoice with several separate options.

The input, mapping, selected resource and rails, original invoice IDs, and review digest are retained before any invoice is created. A connection interruption can leave some invoices created; reopening the same intake reads those original IDs and continues only its missing invoices.

## Browser operation

1. Connect to the existing merchant server and choose **Import invoices**. Previously retained intakes remain available in the same screen, including received project review.
2. Choose the complete original source and its explicit CSV or JSON format. **Inspect source** reads its headers or record properties and shows its row count, byte count and SHA256.
3. Map grouping key, reference, description, configured asset ID and amount. Select optional original invoice UUID only when the accounting source already owns that identity. Choose integer atomic strings or exact decimal strings in the configured asset units.
4. **Retain and review plan** saves the exact input and mapping. Review the complete paged invoice table, its IDs and each offered asset/network/amount. The table shows 50 invoices at a time and retains all rows.
5. **Create remaining invoices** creates the draft invoices. An original invoice that already has the exact frozen terms is reused. A different existing invoice using the selected UUID is displayed as a conflict and preserved.
6. If preparation loses its response, reopen **Import invoices** in the same browser session. The full pending source, mapping, configuration and operation were saved before dispatch. A retained server plan opens directly; otherwise **Retry original preparation** resends that exact request. Correctable validation errors reopen the mapping after confirming the original plan is absent. Browser storage failure stops before dispatch. Earlier editions that retained only the operation ID ask for the same original source and mapping and preserve that ID.
7. **Refresh original results** reads the saved plan against the current store. **Download source and results** includes the entire original text, mapping, frozen configuration, all original IDs and current per-invoice outcomes.

Payment requests, buyer authorization, settlement and delivery continue through the existing invoice workflow. The intake operation itself performs local draft creation. It never aggregates offered asset options into an amount paid.

## Input contract

CSV must have unique nonempty headers, complete equal-width records and correctly quoted fields. A closing quote must be followed by a delimiter, record boundary or end of file. UTF-8 is decoded strictly; a UTF-8 BOM is retained in the source and handled when parsing. JSON is an array of flat records. The maintained strict parser rejects duplicate object keys, unsafe numeric tokens and trailing data before mapping. Mapped JSON values, including amounts and IDs, must be strings.

The limits are 1 MiB of original UTF-8 source, 4,000 source rows, 500 distinct invoices, and the configured maximum of 16 distinct asset options per invoice. The full serialized retained plan must fit the maintained 4 MiB record reader. Validation completes before plan publication; invoice creation happens only after the separate review action.

Use an asset ID from the current configured rails. The review shows that asset's label, network, recipient, precision and atomic amount. Exact decimal input accepts plain nonnegative digits and an optional fractional part; precision beyond the configured decimals is rejected. Atomic input accepts a canonical positive integer string of at most 78 digits. Floating JSON numbers, scientific notation, thousands separators, negative or zero prices are rejected.

Rows sharing a grouping key must have identical reference, description and optional UUID, and cannot repeat an asset ID. Different keys cannot select the same explicit invoice UUID. References are descriptive; the grouping key and UUID establish identity.

For example, with configured asset IDs usd_stellar and usd_base:

~~~csv
key,reference,title,assetId,amount
report-001,INV-1042,Monthly reporting package,usd_stellar,125000000
report-001,INV-1042,Monthly reporting package,usd_base,12500000
report-002,INV-1043,Quarterly reconciliation,usd_stellar,340000000
~~~

The amounts above are independent authored atomic prices for the named configured rails. Their monetary display follows the actual configured precision.

A matching mapping document is:

~~~json
{
  "key": "key",
  "reference": "reference",
  "title": "title",
  "assetId": "assetId",
  "amount": "amount",
  "amountMode": "atomic"
}
~~~

When an original invoice ID is supplied, add an invoiceId property naming that source column. Without that mapping, IDs are deterministic UUIDs derived from the retained intake operation and grouping key. Reusing an operation with changed input or mapping is rejected.

## Existing operator CLI

Use the current connection file produced by the maintained operator client. Credentials stay in its named environment variable. Inputs and output directories use the existing private-file contract. These commands operate through the already running merchant owner; they do not open another database writer.

~~~sh
starforge x402api-merchant-operator intake-context \
  --connection /private/connection.json \
  --out /private/current-intake-context.json

starforge x402api-merchant-operator intake-prepare \
  --connection /private/connection.json \
  --source /private/invoices.csv \
  --mapping /private/invoice-mapping.json \
  --format csv \
  --operation 49fb8f38-3fd7-4d31-9548-f259dc092fa0 \
  --out /private/invoice-intake-review.json

starforge x402api-merchant-operator intake-run \
  --connection /private/connection.json \
  --request /private/invoice-intake-review.json \
  --out /private/invoice-intake-result.json

starforge x402api-merchant-operator intake-status \
  --connection /private/connection.json \
  --operation 49fb8f38-3fd7-4d31-9548-f259dc092fa0

starforge x402api-merchant-operator intake-export \
  --connection /private/connection.json \
  --operation 49fb8f38-3fd7-4d31-9548-f259dc092fa0 \
  --out /private/invoice-intake-complete.json
~~~

Choose one new operation UUID for a new intake and retain it before the first request. The intakes command lists all retained operations. Preparation pins the currently returned merchant configuration and retains the whole source. Run consumes the saved reviewed plan digest, owner and operation. After reading a partial result, the same review file can resume the original operation; choose a new result output path because the CLI preserves existing files.

Mutations are sent once. On UNKNOWN, inspect the intake status under the same original operation UUID. If preparation was retained, recover its review with intake-status; if it was never retained, repeat preparation with the original operation and identical source/mapping. If creation was partly retained, review those exact results and resume that plan. Never generate a replacement operation merely because a response was lost.

The existing RECEIVED response-save recovery also applies. A successful server response followed by a local output failure is emitted with its full result and original intake recovery action. A server-reported partial result is successful transport with an explicit interruption and current original-invoice counts.

## Typed Node integration

The existing operator client exports IntakeContext, IntakeInput, IntakeStatus, IntakeDelivery and the corresponding methods.

~~~js
const context = await client.intakeContext();
const review = await client.prepareIntake({
  operation: retainedOperation,
  storeId: client.connection.storeId,
  tenantId: client.connection.tenantId,
  configurationSha256: context.configurationSha256,
  source: {name: "invoices.csv", format: "csv", text: originalUtf8Text},
  mapping
});
// Display and retain the full review before this operator decision:
const result = await client.runIntake(review.operation, review.planSha256);
const completeDelivery = await client.exportIntake(review.operation);
~~~

The client validates the original store and tenant before requests and checks owner response headers. The readIntake, listIntakes and inspectIntakeSource methods support intake recovery and UI construction.

Authenticated HTTP endpoints use /api/invoice-intake: GET lists, POST prepares; /context returns the current pin; /inspect parses a source; /{operation} reads original outcomes; /{operation}/run accepts {planSha256}; /{operation}/export returns the complete retained plan and current status.

## Durable identity and continuation

Each immutable plan is stored under workspace/invoice-intake/{operation}.json. It binds the original store and tenant, entire source text and SHA256, normalized mapping, configured public origin, resource template, fulfillment binding, every configured rail and every original invoice selection. Its digest is checked on each read by reconstructing the plan from the retained original input.

Status comes from the actual merchant orders. A retained invoice must match its original reference, title, full template, fulfillment binding, selected rails, exact atomic amounts and payment request identity. Existing paid or delivered invoices remain in their actual state. No separate mutable progress counter can claim an invoice was created when its durable order is absent.

Before creating missing invoices, the current complete configuration must match the reviewed configuration. This prevents a restarted server with changed terms from creating the rest of an old plan under a new resource, recipient or fulfillment binding. A complete plan remains readable after configuration changes. A conflict is reported before starting new invoices; a later storage or snapshot interruption preserves the successful prefix and exposes the original row at which work stopped.

Preparation and execution are tracked by the existing workspace operation map. Project capture drains admitted work; if a snapshot begins while the batch is between invoice creations, the intake returns its retained prefix and can resume after capture. The maintained store lease, per-invoice owner and shared record writer remain authoritative.

## Whole-project handover

Both portable export implementations capture the complete workspace tree, including retained intake plans. Source selections include this module, browser controller and full guide together with the existing operator client/CLI. A received project keeps the same store, plan digest and invoice IDs; the review mode allows reading and exporting intakes. Live continuation uses the received original owner and reviewed configuration.

Older complete project editions remain readable with their original source. The additive intake source cohort is required together when present in a new portable manifest. The existing project-file intake application and its separate web/intake.mjs are preserved; this feature's browser module is web/invoice-intake.mjs.
