# Grafana delivery in the original Merchant Support case

This workflow brings a complete operated Grafana handover into the existing implementation case. It preserves the project, original sources, provider checkpoint and native operation results; lets an operator review which implementation tasks and operations belong together; and carries the complete case into an independent receiving store.

Use the maintained Observability application and this Merchant Support release together. The Grafana source directory must contain the matching integrations/grafana_handover_inspect.py and its original service/integration dependencies. The inspector reads the selected archive. It does not deploy Grafana, resume a target job or run a measurement.

## The original files and operator context

Start with the complete ZIP exported by the existing Grafana workbench, its recorded byte count and SHA-256, and a saved Support case with its original runtime and terms. Keep the original source directory and case stores private. The complete provider checkpoint can contain other integration jobs; inspect that scope before delivery and acknowledge it in the review.

Create a context JSON file using actual absolute paths:

~~~json
{
  "casesDirectory": "/private/support/cases",
  "sourceDirectory": "/private/support/source-bundles",
  "grafanaSource": "/private/observability/opportunities/ma_eotss_observability_2026",
  "python": "/private/observability-runtime/bin/python"
}
~~~

Run from the original SF74 directory, stellar/scf-starforge-20261009/sf74-merchant-support-console. Every command below accepts --context and --input. Commands that retain or apply work require --out. Result files use the original immutable artifact writer: keep each returned file intact and choose a new output filename when a later observation has a different time or content.

## 1. Retain the complete original handover

Prepare intake.json with the actual saved case revision and original archive identity:

~~~json
{
  "id": "grafana-delivery-source-01",
  "caseId": "ACTUAL_SAVED_CASE_UUID",
  "caseRevision": "ACTUAL_CASE_REVISION_SHA256",
  "actor": "ACTUAL_OPERATOR",
  "label": "Grafana project delivery",
  "archive": {
    "path": "/private/original/Grafana_Handover.zip",
    "bytes": 123456,
    "sha256": "ACTUAL_ARCHIVE_SHA256"
  }
}
~~~

The values in capitals and the example byte count must be replaced with the actual original selection.

~~~sh
node case-grafana-delivery-cli.mjs intake --context /private/context.json --input /private/intake.json --out /private/results/intake-01.json
~~~

The command checks the complete archive, begins the existing SF49 source transfer, streams its one declared grafana-target-handover attachment, and prepares the native source edition. The original case handoff and terms are retained by that service. Its returned inspectionInput contains the real transferId and memberPath; use those values directly. Repeating the unchanged intake input reconciles the same source transfer.

## 2. Inspect original source and native outcomes

Save the returned inspectionInput as inspect.json and run:

~~~sh
node case-grafana-delivery-cli.mjs inspect --context /private/context.json --input /private/inspect.json --out /private/results/inspection-01.json
~~~

Read the complete inspection. It reports the selected integration/project revision, original source editions, operation IDs, native statuses, resource actions and receiving state. A job marked complete can still contain failed measurements. An applied target action, a rolled-back action, a packaged checkpoint and a customer acceptance are separate records.

## 3. Review the task mapping before applying it

Use current case/task IDs and the operations selected by the original handover owner:

~~~json
{
  "transferId": "grafana-delivery-source-01",
  "memberPath": "ACTUAL_MEMBER_PATH_FROM_INTAKE",
  "caseId": "ACTUAL_SAVED_CASE_UUID",
  "expectedRevision": "ACTUAL_CASE_REVISION_SHA256",
  "requestId": "grafana-delivery-01",
  "actor": "ACTUAL_OPERATOR",
  "recordedAt": "ACTUAL_REVIEW_TIME_IN_UTC",
  "taskIds": ["ACTUAL_IMPLEMENTATION_TASK_ID"],
  "operationIds": ["ACTUAL_INCLUDED_NATIVE_OPERATION_ID"],
  "notes": "Describe the selected original work and any remaining native errors.",
  "privateScopeAcknowledged": true
}
~~~

~~~sh
node case-grafana-delivery-cli.mjs review --context /private/context.json --input /private/review-input.json --out /private/results/review-01.json
~~~

Review is read-only. The result preserves the complete native inspection, original and proposed task definitions, implementation plans and original workorder changes, together with reviewSha256. Examine the proposed changes before the next command. Keep the returned review file complete; editing it changes its identity. If the saved case changed during inspection, open the current case and make a new deliberate review.

## 4. Apply and continue the same reviewed request

~~~sh
node case-grafana-delivery-cli.mjs apply --context /private/context.json --input /private/results/review-01.json --out /private/results/applied-01.json
~~~

The adapter retains the reviewed intent as an original case material, attaches the original SF49 workorder, adds the complete archive as a source-backed deliverable, and adds the readable operation review. The existing case command model owns the four stable request IDs. A retry uses the same original review and reconciles accepted legs before continuing.

Create original-request.json containing the original caseId and requestId:

~~~json
{"caseId":"ACTUAL_SAVED_CASE_UUID","requestId":"grafana-delivery-01"}
~~~

~~~sh
node case-grafana-delivery-cli.mjs status --context /private/context.json --input /private/original-request.json --out /private/results/status-01.json
node case-grafana-delivery-cli.mjs reopen --context /private/context.json --input /private/original-request.json --out /private/results/reopened-01.json
~~~

Reopen resolves the retained original archive and runs its native read-only inspection again. A different original source or native inspection result stays visible as a conflict. Later local task edits and receiving history remain preserved; the immutable delivery selection retains its reviewed task definitions. The existing Support receiving controls compare actual current acceptance subjects. Preserve the original reviewed intent while resolving a source difference.

If a command is interrupted, keep its original input and operation IDs. Inspect the retained native result and repeat the same command with a new result filename. The CLI closes its owned inspector and transfer service on SIGINT or SIGTERM. It does not terminate another operator's provider job.

## 5. Export the complete selected case

Use the caseId and actual caseRevision returned after reopen. Supply an unused package directory separate from the original case and source stores:

~~~json
{
  "id": "ACTUAL_SAVED_CASE_UUID",
  "revision": "ACTUAL_REOPENED_CASE_REVISION",
  "directory": "/private/exports/grafana-case-01",
  "exportId": "grafana-case-01",
  "generatedAt": "ACTUAL_EXPORT_TIME_IN_UTC"
}
~~~

~~~sh
node case-grafana-delivery-cli.mjs export --context /private/context.json --input /private/export-input.json --out /private/results/export-01.json
~~~

The native case package includes the selected workspace, original case history, Support files, complete source bundles and their unassigned original members. Transfer the entire resulting package directory. The manifest and a report alone are insufficient to reopen the full case.

The result gives the completed manifestSha256. To inspect that same complete package:

~~~json
{
  "directory": "/private/exports/grafana-case-01",
  "expectedManifestSha256": "ACTUAL_EXPORTED_MANIFEST_SHA256"
}
~~~

~~~sh
node case-grafana-delivery-cli.mjs inspect-package --context /private/context.json --input /private/package-input.json --out /private/results/package-inspection-01.json
~~~

## 6. Independently receive and reopen the whole delivery

Use a separate receiver context with its own private casesDirectory and sourceDirectory. Its grafanaSource must point to the matching original inspector/application source. Preserve the copied package bytes.

~~~json
{
  "directory": "/private/received-input/grafana-case-01",
  "receivingDirectory": "/private/receiving/grafana-case-01",
  "requestId": "receive-grafana-case-01",
  "actor": "ACTUAL_RECEIVING_OPERATOR",
  "expectedManifestSha256": "ACTUAL_EXPORTED_MANIFEST_SHA256",
  "grafanaRequestId": "grafana-delivery-01"
}
~~~

~~~sh
node case-grafana-delivery-cli.mjs receive --context /private/receiver-context.json --input /private/receive-input.json --out /private/results/received-01.json
~~~

The existing case receiver verifies and retains every original package member, restores the complete Support case, receives all original source bundles and returns its imported case revision. A fresh receiver has its own local case UUID. The Grafana adapter uses that verified native receiving receipt and initial imported revision to resolve the original delivery identity; the original selection and history keep their source UUID.

The same command then reopens the Grafana delivery inside that received case and reruns the original native inspector. Its result contains both receiving and Grafana outcomes. Preserve that complete result alongside the receiver's original receiving-result.json and retained package.

For a subsequent receiving check or interruption recovery, repeat the same receive input against the same receiver context. The native receiver reconciles its retained original request and preserves later legitimate local edits. It returns the actual local case binding used by the Grafana inspection. Do not substitute the sender UUID into the receiving store or edit the original saved selection.

## Operating decisions

Choose real existing implementation tasks and actual operation IDs from the full original handover. Use the saved case revision the source transfer was prepared from. If another operator edits the plan or tasks before application, make an explicit new review; the CLI does not overwrite that work.

The private-scope acknowledgment covers the complete provider checkpoint's contents. Select and grant customer access through the existing handover workflow after reviewing that scope. No deployment, payment, provider request, email or acceptance is an implied side effect of these commands.

## Source and implementation

The CLI calls createCaseSourceDelivery, openGrafanaCaseDelivery, exportCaseSourcePackage, inspectCaseSourcePackage and receiveCaseSourcePackage directly. Those maintained engines own archive validation, original case commands, source retention, resume behavior and complete receiving. The operator result is an ordinary complete JSON artifact; it is not a replacement case database.
