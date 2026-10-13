# OAuth Support customer Operating Plans

Turn a saved OAuth Support case into an editable customer procedure. The procedure uses the existing OperatingPlan model, Command Finder catalog and full revision history. Its source is a selected original SF74 case revision, the original OAuth observation/source files, and the original report and handoff.

The customer receives two things together:

- The complete OperatingPlan JSON, which they can edit in the existing Operating Plans browser or through the installed command.
- The complete native Support source directory, including SOURCE.json, the selected case history, workspace, runtime, OAuth source pairs, report and handoff. SOURCE.json is the compact descriptor that the browser opens.

The plan refers to the companion files by relative path, exact byte length and SHA-256. Large runtime data stays in the complete native source directory. The plan remains practical to edit and export.

## 1. Capture the selected original case

Install the maintained merchant-support selection with its declared dependencies. Use the existing case ID and exact selected revision from the Support console. The source capture reads that existing CaseStore and retains the selected revision and its full chain of earlier revisions.

Prepare a capture request with actual local paths and case identities:

~~~json
{
  "casesDirectory": "/absolute/private/support-cases",
  "caseId": "ORIGINAL_CASE_UUID",
  "revision": "ORIGINAL_64_HEX_CASE_REVISION",
  "outputDirectory": "/absolute/private/customer-delivery/support-source",
  "sourceId": "customer-oauth-support-20261013",
  "capturedAt": "2026-10-13T04:00:00.000Z"
}
~~~

Replace the example identities, time and paths with the selected case and receiving directory. Keep the same sourceId and capturedAt when resuming that same capture.

~~~sh
starforge support-operating-plan capture --request capture-request.json --out capture-receipt.json
~~~

The returned receipt identifies the saved source descriptor and manifest. The exporter uses the original CaseStore, runtime codec and handoff/report functions. It retains the full selected case chain in its original layout and keeps the original workspace and runtime bytes.

If you have an original native programme delivery or returned result file, the capture request can also include its absolute input filename and expected byte identity:

~~~json
{
  "nativeDelivery": {
    "file": "/absolute/private/run/delivery.zip",
    "bytes": 123456,
    "sha256": "ACTUAL_64_HEX_FILE_HASH"
  },
  "evidence": [
    {
      "role": "original-recovery-result",
      "file": "/absolute/private/run/result.json",
      "bytes": 1234,
      "sha256": "ACTUAL_64_HEX_FILE_HASH"
    }
  ]
}
~~~

These are optional fields in the same request. Use actual file measurements. The exporter copies and checks those complete files; it does not accept the expected hash as a substitute for reading the file.

The optional incidentSource field is the original registered source ID and its actual configuration revision:

~~~json
{
  "incidentSource": {
    "id": "ORIGINAL_REGISTERED_SOURCE_ID",
    "configurationRevision": "ACTUAL_64_HEX_CONFIGURATION_REVISION"
  }
}
~~~

Case captures do not contain that separate manager configuration revision. Leave this field null when it was not read from the original configured source.

## 2. Review the descriptor in Operating Plans

Open the original Operating Plans browser and its OAuth Support procedure section. Choose the captured SOURCE.json. Review the selected case revision, source identity, collection time, retained files and returned result references.

An OAuth capture has two kinds of time. Collection timestamps describe when the collector ran. Observation timestamps describe the source data it actually returned. A SOURCE_UNAVAILABLE result retains null observation values, together with the actual collection times and original error. The planner preserves these distinctions.

The descriptor keeps the original coverage states COMPLETE, SOURCE_UNAVAILABLE, IDENTITY_CHANGED and OBSERVER_INCOMPLETE. The operating owner reads the current configuration and provider state when carrying out the procedure. An old capture remains a retained source for the case.

Choose the customer, operating owner, title and period. For any step that uses an installed command, choose its actual Command Finder registration and enter arguments as an array. The plan saves that registration together with every declared source and runtime group. A manual task can remain a manual step.

Review the seven prepared steps, then create the plan through the existing editor.

| Step | Work and expected continuation |
| --- | --- |
| Receive the selected Support case | Reopen the complete native source and selected case revision; retain any later local case head. |
| Review the source and current authority | Check configuration, protected resource, session, coverage and source age against current conditions. |
| Inspect the original OAuth observation | Inspect authentication, authorization, host authority and provider stages through the existing command or console. |
| Work the original repair queue | Assign an owner, review the actual queue and retain the response returned by the existing Support controls. |
| Review the returned recovery | Inspect the subsequent original capture and comparison, then record the observed outcome. |
| Save the customer case continuation | Use the original case store and current revision guard; reopen the saved edition. |
| Deliver the editable operating plan and case | Export the entire plan history with the complete native companion, then receive and reopen both. |

Every new step begins as planned. Use the existing editor to change the order, owners, dates, instructions, inputs and expected results. The source binding remains in the first saved revision, so subsequent edited notes do not detach the procedure from its original case.

## 3. Create or render a plan from the installed command

The installed command accepts a complete JSON request:

~~~sh
starforge support-operating-plan create --request plan-request.json --out operating-plan.json
starforge support-operating-plan show --plan operating-plan.json --format markdown --out operating-plan.md
starforge support-operating-plan show --plan operating-plan.json --format html --out operating-plan.html
~~~

The create request has this shape. Retain an explicit savedAt for the original operation so replay produces the same output bytes:

~~~json
{
  "source": "INSERT_THE_COMPLETE_PARSED_SOURCE_OBJECT",
  "catalog": "INSERT_THE_COMPLETE_PARSED_CURRENT_COMMAND_CATALOG",
  "id": "customer-oauth-support-plan",
  "title": "Customer OAuth Support operating plan",
  "customer": "Customer name",
  "owner": "Operating owner",
  "savedAt": "2026-10-13T04:00:00.000Z",
  "period": "During commissioning and each incident",
  "registrations": {},
  "argvByPhase": {}
}
~~~

The source and catalog values are JSON objects, not filename strings. The placeholders above show their positions. The browser prepares these objects directly; API callers can read the complete files and pass the parsed objects.

Use the browser's **Toolkit catalog JSON** export to retain the complete current catalog. The registrations and argvByPhase maps use the phase names sources, authority, observation, response, recovery, case and handover:

~~~json
{
  "registrations": {
    "observation": "EXACT_CURRENT_COMMAND_CATALOG_ID"
  },
  "argvByPhase": {
    "observation": ["starforge", "ACTUAL_COMMAND_NAME", "ACTUAL_ARGUMENT"]
  }
}
~~~

Keep arguments separate. A command-bearing step must include its actual original catalog registration. The adapter does not derive an executable command from free text or substitute a similarly named registration.

The exported typed API is available at ./merchant/support-operating-plans:

~~~js
import {readFile} from 'node:fs/promises';
import {createSupportOperatingPlan} from '@tokenjunkielabs/starforge-merchant/merchant/support-operating-plans';

const source = JSON.parse(await readFile('support-source/SOURCE.json', 'utf8'));
const catalog = JSON.parse(await readFile('command-catalog.json', 'utf8'));
const plan = createSupportOperatingPlan({
  source, catalog,
  id: 'customer-oauth-support-plan',
  title: 'Customer OAuth Support operating plan',
  customer: 'Customer name',
  owner: 'Operating owner',
  registrations: {},
  argvByPhase: {}
});
~~~

Use the installed package name shown by your distribution when importing its declared export. The native source export is available at ./merchant/support-operating-source.

## 4. Record an actual returned result

After carrying out a step through the existing Support tools, capture the original returned case edition and result files. Select that returned source in the Operating Plans section, choose the step, review the result and choose the retained evidence IDs.

For the installed command:

~~~sh
starforge support-operating-plan record --plan operating-plan.json --request reviewed-result.json --out operating-plan-with-result.json
~~~

The reviewed-result request contains the full returned source object, its original explicit savedAt and an explicit review:

~~~json
{
  "source": "INSERT_THE_COMPLETE_PARSED_RETURNED_SOURCE_OBJECT",
  "stepId": "support-recovery",
  "status": "completed",
  "owner": "Recovery owner",
  "savedAt": "2026-10-13T04:30:00.000Z",
  "result": {
    "summary": "Describe the actual returned recovery and its scope.",
    "evidenceIds": ["EXACT_ID_FROM_SOURCE_EVIDENCE"]
  }
}
~~~

The evidence IDs must exist in the selected returned source. Recording a completed step requires at least one returned artifact reference. The source must be the original case revision or a continuation whose retained ancestors include it.

The method appends a new ordinary plan revision. It preserves the other steps, customer edits, instructions, notes, selected registrations and previous results in their original history. Its recorded result retains the reviewed summary, owner, exact source case revision and selected artifact references.

Capture and record the same unavailable, incomplete or changed-identity results when those are what the original source returned. The owner can record in-progress or skipped with the reason and retained result, then continue the case using the original Support controls.

## 5. Receive both histories

The native source directory and the complete plan JSON travel together. Check and receive the native source using its original descriptor byte identity:

~~~json
{
  "sourceDirectory": "/absolute/private/transferred/support-source",
  "destination": "/absolute/private/received/customer-support-selection",
  "expectedSource": {
    "path": "SOURCE.json",
    "bytes": 12345,
    "sha256": "ACTUAL_SOURCE_FILE_SHA256"
  }
}
~~~

~~~sh
starforge support-operating-plan receive-source --request receiving-request.json --out receiving-receipt.json
starforge support-operating-plan receive --plan transferred-plan.json --existing current-plan.json --out received-plan.json
~~~

Use a fresh private destination for the selected native case companion. Its receiver verifies the complete artifact inventory, original case history and original handoff/report. An identical receiving replay is reused. A different selection at that destination requires a separate destination.

For a live customer's existing case store, continue through the original SF74 handoff/import and current-revision controls. The companion receiver retains a complete selected case snapshot; it does not overwrite a later live case head.

Plan receiving calls the existing receiveOperatingPlan function. Every shared revision must match. A longer compatible history extends the plan; an older incoming copy preserves the newer local history. Divergent edits remain explicit so the customer can keep each version or create a deliberate copy.

## 6. Compare the current installed command catalog

~~~sh
starforge support-operating-plan compare --plan operating-plan.json --catalog command-catalog.json --out registration-comparison.json
~~~

This calls the original plan comparison. It reports missing or changed commands, registration sources and runtime groups against the current supplied catalog. The complete original selections remain in the saved plan for review.

## Source and implementation

- distribution/discovery/support-operating-plan.mjs contains the browser-safe adapter.
- distribution/discovery/support-operating-plan.d.mts defines the complete source and procedure API.
- sf74-merchant-support-console/oauth-operating-source.mjs retains and receives the original native case companion.
- distribution/discovery/support-operating-cli.mjs connects the installed command to those same functions.
- The original OperatingPlan model, CaseStore, runtime codec, case handoff and OAuth producer retain their existing roles.

The browser serves the adapter and its original model/catalog through one coherent module directory so their relative imports resolve to the original source modules. Its create, result and receiving actions use the existing editor transactions and full revision histories.
