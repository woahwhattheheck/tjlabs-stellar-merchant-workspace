# Support operating procedures: installed CLI and typed API

The command prepares and reviews a complete customer procedure from retained Support evidence. The original OAuth host, SF93 incidents, SF74 cases and source exporter remain the source of actual operation results. An Operating Plan stores the procedure and its reviewed progress.

## Install the selected product

Use the maintained Merchant Support selection containing the original Support application, source exporter, Command Finder and Support Operating Plans contribution. Preserve the existing customer workspace and configuration. The installed command is `starforge support-operating-plan`; the maintained Command Finder is `starforge discover`.

Use the same Command Finder browser origin when returning to its saved local plans. Complete JSON is the transferable record: it retains the plan identity and every saved revision. The readable HTML and Markdown show the selected saved revision.

## Retain and receive the original native source

A capture request contains the exact native fields:

~~~json
{
  "casesDirectory": "/absolute/original/support/cases",
  "caseId": "the-original-UUID-v4",
  "revision": "the-original-64-hex-revision",
  "outputDirectory": "/absolute/customer/original-support-source",
  "sourceId": "customer-support-source",
  "capturedAt": "2026-10-13T00:00:00.000Z",
  "incidentSource": null,
  "nativeDelivery": null,
  "evidence": []
}
~~~

Replace every example value with the selected original. Optional nativeDelivery is {file,bytes,sha256}; optional evidence contains {role,file,bytes,sha256} entries naming complete retained files. The native API requires absolute private paths and checks selected byte identities. Keep capturedAt and the full selection unchanged for replay.

~~~sh
starforge support-operating-plan capture --request /absolute/customer/capture.json --out /absolute/customer/capture-receipt.json
starforge support-operating-plan receive-source --request /absolute/customer/receive-source.json --out /absolute/customer/source-receiving-receipt.json
~~~

The receive-source request contains {sourceDirectory,destination,expectedSource:{path:"SOURCE.json",bytes,sha256}} using the original returned SOURCE.json identity. It verifies and receives the complete selected source package and case snapshot into its own receiving destination. It does not overwrite an active case or reinterpret a later case head. The existing SF74 case receiver remains the live-case writer.

These two commands invoke the original native exporter/receiver. They do not contact an OAuth resource or create a replacement case store. After interruption, retain the same input, source ID, capturedAt, directory and expected source identity so the original native API can reconcile its own files.

## Prepare the inputs

Retain the native Support source export and the complete installed toolkit catalog. Record their exact source identity, case identity/revision and original operation receipts. The source exporter validates its selected native inputs. The Support model validates the resulting compact descriptor before preparing a plan.

Create a JSON request with these fields:

~~~json
{
  "source": {},
  "catalog": {},
  "id": "customer-support-operating-plan",
  "title": "Customer OAuth and Support procedure",
  "customer": "The selected customer",
  "owner": "The named operating owner",
  "period": "The agreed operating period",
  "savedAt": "2026-10-13T00:00:00.000Z",
  "registrations": {},
  "argvByPhase": {}
}
~~~

The empty source/catalog values above indicate where the complete returned descriptor and actual catalog must be placed; this example is not an executable customer input. Select a stable plan ID and its actual creation time once and retain the entire request unchanged for acknowledgement recovery.

The phases are `sources`, `authority`, `observation`, `response`, `recovery`, `case` and `handover`. Optional `registrations` maps each phase to an exact ID in the supplied catalog. Each selected step retains that original package, registration, source records and declared runtime groups. Optional `argvByPhase` contains the separately reviewed argument array for each phase. A manual step stays manual; no registration is inferred from a similar command name.

~~~sh
starforge support-operating-plan inspect \
  --source /absolute/customer/support-source.json \
  --out /absolute/customer/support-source-inspected.json

starforge support-operating-plan create \
  --request /absolute/customer/create-request.json \
  --out /absolute/customer/support-plan-r1.json
~~~

The command creates ordinary `stellar-forge.operating-plan.v1` JSON. It does not add unsupported fields to the original plan schema.

## Record an actual returned outcome

Keep the actual native operation and its complete evidence in their original source. Make a record request using a valid step ID, current source descriptor and its selected evidence IDs:

~~~json
{
  "source": {},
  "stepId": "the-actual-saved-step-id",
  "status": "completed",
  "result": {
    "summary": "The reviewed useful result and remaining continuation.",
    "evidenceIds": ["the-actual-retained-evidence-id"]
  },
  "owner": "The reviewing operator",
  "savedAt": "2026-10-13T00:00:00.000Z"
}
~~~

Substitute actual returned values. The maintained validator checks evidence membership, original case binding and eligible result state. A completed status requires returned evidence; a plan or observation count by itself does not prove a customer operation completed.

~~~sh
starforge support-operating-plan record \
  --plan /absolute/customer/support-plan-r1.json \
  --request /absolute/customer/record-result.json \
  --out /absolute/customer/support-plan-r2.json
~~~

This appends through the original model. Previous revisions and their source choices remain intact. An invalid source, changed original case, missing evidence or conflicting revision produces an error without rewriting the original file.

## Compare, export and receive

~~~sh
starforge support-operating-plan compare \
  --plan /absolute/customer/support-plan-r2.json \
  --catalog /absolute/customer/current-toolkit-catalog.json \
  --out /absolute/customer/source-comparison.json

starforge support-operating-plan show \
  --plan /absolute/customer/support-plan-r2.json \
  --format html \
  --out /absolute/customer/support-handover.html

starforge support-operating-plan receive \
  --plan /absolute/incoming/support-plan.json \
  --existing /absolute/customer/support-plan-r2.json \
  --out /absolute/customer/support-plan-received.json
~~~

Comparison includes every step and its current or missing registration. It does not silently replace the original catalog snapshots. Receiving uses the original full-history prefix rule: identical input reuses the retained history; an older prefix keeps a later current history; a longer matching history extends it; divergent shared revisions are rejected. Use the original Operating Plans copy workflow when two separate histories must be retained.

`show --format json` emits the complete original plan history. `--revision` validates the selected historical revision and controls Markdown/HTML rendering; it never truncates the complete JSON history.

## Acknowledgement and failure handling

Creation and result recording require the original explicit savedAt; it is never regenerated during CLI recovery. Native capture/receiving receipts omit the transient reused flag from the saved output bytes and expose it separately as sourceReused in the terminal receipt, so an unchanged completed source can be acknowledged at the same output path.

Output paths are create-only. A temporary file is flushed and linked through the maintained export writer. Repeating an unchanged request with the same output path acknowledges it only if the complete existing bytes match. Different bytes are preserved and reported as a conflict; select a new output path after review.

Successful file output returns a receipt containing action, absolute path, byte length, SHA256 and whether the identical file was already present. Retain that receipt beside the unchanged input request. A missing terminal response does not authorize another native OAuth, case or recovery operation.

Inputs and outputs are limited to 32 MiB of UTF-8 JSON or generated text. Use complete retained evidence files and compact source descriptors rather than placing entire captures inside plan text. The underlying plan's text fields and history constraints remain authoritative.

The CLI accepts an optional AbortSignal through its library entry point for read and boundary cancellation. Atomic file publication follows the existing original writer; inspect the selected output after interruption before repeating it.

## Typed application entry points

The product exposes the maintained pure Support builder and the native source exporter through its installed declaration. The typed builder export is `@tokenjunkielabs/starforge-merchant/merchant/support-operating-plans`; the native source export is `@tokenjunkielabs/starforge-merchant/merchant/support-operating-source`. The pure API is:

~~~js
createSupportOperatingPlan({
  source, catalog, id, title, customer, owner, period, savedAt,
  registrations, argvByPhase
});
inspectSupportOperatingSource(source);
recordSupportOperatingResult(plan, {
  source, stepId, status, result: {summary, evidenceIds}, owner, savedAt
});
~~~

The complete original Operating Plan remains available through the original `operator/operating-plans` export. Persisting callers must save against their actual current record/revision and use the existing full-history receiver. The SDK does not create a second plan store, case store, identity verifier or native controller.
