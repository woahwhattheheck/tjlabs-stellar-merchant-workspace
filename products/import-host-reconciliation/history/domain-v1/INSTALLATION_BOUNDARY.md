# Source and installation boundary

This independent workspace retains complete original UTF-8 files, explicit source keys and mapping choices, prepared host actions, actual retained receipts/readbacks, corrected editions and named reviews. It does not send imports or make host writes.

The current executable reference contains authored data only: five source rows, one partial host observation, one corrected edition, a five-pair comparison and two review revisions. The native Filio package was not available to this runtime. The actual production core factories were executed in V8; no native Node, browser or real SDK result is claimed.

## Published contract checked on 2026-10-14

- https://www.usefilio.com/ describes a React CSV/Excel importer and invites early design partners. Its example uses publishableKey.
- https://www.usefilio.com/docs names @usefilio/react, uses apiKey, and documents an onComplete array plus a successful-import webhook with import_id, template_id, row_count, imported_at and rows. The selected released package must resolve the credential-prop discrepancy.
- The docs mention webhook signature verification but do not specify the header, signing algorithm, raw-body rules, retries, ordering or idempotency guarantees. Installation must confirm those details before accepting untrusted webhooks.
- https://www.usefilio.com/privacy describes transient row processing with account/template/import metadata retained. This workbench retains selected originals locally at the host operator's explicit choice.

## Practical receiving workflow

1. Retain the exact original CSV/TSV, callback serialization or webhook JSON. CSV inspection uses logical records, not physical line claims. Text-only intake requires valid UTF-8; binary Excel is outside this workspace's current parser.
2. Declare the host application, tenant, environment, template and import identity. A callback's correlation ID is host-owned and explicit. Matching row bytes alone do not prove two deliveries share an identity.
3. Select source business keys and each source/target JSON pointer. Typed comparison preserves JSON type and number tokens; decimal comparison is an explicit mathematical comparison, and text comparison requires text. Precision already lost inside an SDK JavaScript Number cannot be recovered.
4. Give each original row an explicit create, update or skip action. Updates require the original chosen host ID. Resolve duplicate/missing keys and mapping gaps before preparing the batch. The prepared plan is neither a network request nor authorization.
5. Receive the actual host's per-row outcome and selected-record readback. Bind them to the exact batch and scope. Acceptance alone does not establish stored values; rejection, uncertainty, absent readback, stale readback and duplicate target IDs remain visible.
6. Preserve corrected source and host observations as new records. Pair editions explicitly, retaining unmatched rows and changed source expectations.
7. Append named review decisions; do not rewrite observations. Export the complete workspace, all originals, full report and CSV, then independently reopen the workspace.

A host integration must preserve its own durable idempotency and authorization. This authored receipt schema is not a claimed Filio webhook or host database API. The offline workbench validates source bindings; it cannot authenticate a provider merely from an uploaded JSON assertion.
