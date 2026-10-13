# Receive a paired-service Installation through the original operating case

This workflow takes a complete, source-bound facilitator commissioning preparation into the existing Grant Operations Installation writer. It retains the reviewed native preview, saves that exact document under one original request, exports the whole operating case, and imports that complete export through an independently selected receiving workspace.

The existing commissioning job still owns the service, two provider selections, source edition, complete requests, returned bodies and their history. Grant Operations still owns the case, plan, Installation revisions, source attachments and request journal. This bridge supplies the connected receiving workflow around those existing implementations.

## The result you receive

A completed receiving operation carries all of the following together:

- The complete original commissioning preparation and its unchanged transfer, source files, job and selection.
- The original case and plan selection, full reviewed native Installation preview, operator and save reason.
- The retained original save request and exact native response, including the selected Installation identity and revision.
- The complete native Installation export, including the operating case, selected readable handover and original source.
- The recipient's actual import response, receiving case and reopened selected Installation.
- The complete retained inputs and returned files needed to resume the same operation after an interruption.

Preparation, saving, export and independent receiving are separate explicit actions. Saving an Installation records the supplied planned work. A planned Installation does not establish a purchase, source permission, funded work completed, customer acceptance or received revenue; those observations continue through their existing native records.

## 1. Finish the original source-bound preparation

Use [INSTALLATION.md](INSTALLATION.md) to receive the selected complete commissioning transfer, attach its actual files to the original Operations case, obtain its current native seed and complete case, select the actual customer bindings, and run the maintained facilitator-installation prepare command.

The completed preparation must pass facilitator-installation inspect. Record the SHA-256 of the complete INSTALLATION_PREPARATION.json file. The host configuration below pins this original receipt before its contents can select a case or document.

Keep the original work together:

| Selection | Where it comes from |
| --- | --- |
| Operations case and plan | The customer's existing native case and retained seed |
| Original source records | Complete files already attached to that same case |
| Funded assignments and acceptance checks | The current native seed and original plan |
| Workshare, when present | The original commercial packet and selected Workshare case |
| Two facilitator identities and endpoints | The original selected commissioning job |
| Payment network, asset, recipient and task budget | The actual original customer/provider choices |
| Receiving host and operator | The intended recipient's existing authorized environment |

A native seed can exist without a Workshare. Preserve the seed you actually selected; do not invent commercial acceptance or a Workshare ID to fill an optional field. Missing choices remain visible through the maintained preparation and native preview.

The preparation directory contains exactly its completed declared source files. Keep native preview responses, notes and later observations in the separate receiving operation directory. If an earlier manual course saved additional output beside the preparation, retain that full original course and produce a separately named clean preparation through the maintained preparer; do not discard the earlier output.

The preparation directory is an immutable exported source cut for this operation. Changed case inputs, source, bindings or selected providers produce a new named preparation with its own complete receipt. Keep earlier preparations for their original pending or completed operations.

## 2. Select the two existing Grant applications

Both the source and receiving Grant applications must already be running through their maintained managed application workflow. The bridge borrows their original authenticated connections. It does not start another service, choose another database or take ownership of an existing application process.

The source binding selects the application that owns the original case. The receiving binding selects the independent application that will import the complete exported case. Use different original workspace directories for these roles.

Create a private host configuration using the actual selected paths:

~~~json
{
  "schema": "stellar-forge.facilitator-installation-receiving-host.v1",
  "directory": "/absolute/private/paired-installation-receiving",
  "source": {
    "directory": "/absolute/original-grant-workspace",
    "scenarioFile": "/absolute/original-scenario.json",
    "pythonExecutable": "/absolute/original-python",
    "allowStart": false,
    "label": "Original customer Operations"
  },
  "receiving": {
    "directory": "/absolute/independent-grant-workspace",
    "scenarioFile": "/absolute/receiving-scenario.json",
    "pythonExecutable": "/absolute/receiving-python",
    "allowStart": false,
    "label": "Independent customer receiving"
  },
  "preparations": {
    "selected-customer": {
      "directory": "/absolute/private/completed-paired-preparation",
      "sha256": "THE_ACTUAL_64_HEX_SHA256_OF_INSTALLATION_PREPARATION_JSON"
    }
  }
}
~~~

Replace every illustrative path and the receipt placeholder with the actual existing selection. The host's preparations map supplies named aliases; an application operator selects an alias instead of submitting an arbitrary filesystem path. Use existing operator-owned private parent directories. Keep the host file private (0600 on Linux) and receiving directories private (0700); the maintained readers enforce that custody. Original access tokens remain in the existing managed launch files and are not copied into this configuration.

The original Grant binding inspector verifies the selected source and workspace. Both bindings use allowStart:false. If an existing service is unavailable, reopen it through its original owner and resume this operation with the same retained inputs.

## 3. Prepare and inspect the exact native preview

Choose one new UUID for this receiving operation and retain it. Use that same value for every later action in this operation. Enter the actual recording operator, a useful save reason and the intended name for the receiving case.

~~~sh
facilitator-installation-receive --connection /absolute/private/HOST.json preview \
  --preparation selected-customer \
  --operation ORIGINAL_OPERATION_UUID \
  --actor "ACTUAL_RECORDING_OPERATOR" \
  --note "Prepare this customer's original paired service in its selected operating case" \
  --receiving-name "Customer paired-service installation"
~~~

The preparation is received completely into the operation's private output. The bridge pins the full preparation receipt, original transfer and document, retains its complete intent, and requests the preview from the original Grant service.

Inspect the returned native preview before saving. Confirm:

- The case, current case version, plan, plan revision and plan source belong to the original customer.
- The complete task, source authority, payment selections, two providers and receiving operator match the chosen job.
- The original funded assignments, checks, Workshare and any other native programme fields remain present.
- The preview's pending selections and source changes accurately describe the actual case.
- The native normalized document is the exact document you intend to save.

The native writer checks the whole document against the current case and its selected source records. Its returned preview digest binds the normalized document and that native source snapshot. Preserve the whole preview, not only its digest.

If an original input needs correction before saving, make that correction through its existing source or preparation workflow and prepare a new operation. Keep a pending original save available for recovery; a changed preview is a different decision.

## 4. Save the reviewed original request

After inspecting the native preview, explicitly save this same operation:

~~~sh
facilitator-installation-receive --connection /absolute/private/HOST.json save \
  --operation ORIGINAL_OPERATION_UUID
~~~

The bridge retains the complete original save command before dispatch. That command includes its original request identity, case version, Installation identity/revision selection, complete normalized document, actor, note and preview digest.

The response comes from the unchanged Installation writer. Read the returned Installation ID, revision, case version and retained source. Open that saved edition in the existing Grant application.

### If the reply is interrupted

Reopen the retained operation:

~~~sh
facilitator-installation-receive --connection /absolute/private/HOST.json show \
  --operation ORIGINAL_OPERATION_UUID
~~~

Continue save with the same operation value. The bridge keeps the original full request and recovers its original native result. Do not replace its request ID, update its expected version, edit its payload or prepare a fresh preview merely because the first response was lost.

The native request journal checks the original request before considering a later current case version. Consequently, later legitimate case work does not authorize a second save of the same receiving operation.

If the native writer returns a definite current-source or version conflict before accepting this request, inspect the actual changed case and correct the original preparation through its existing workflow. Keep the exact returned error and original request together. The bridge preserves the error fields exposed by its original Grant client; that client does not expose raw non-success HTTP response bytes. A new selected preparation and decision can then use a new operation. Transport failure and a definite native comparison refusal have different outcomes. Inspect the original code, status and definite/uncertain classification alongside the retained command. An uncertain response continues the same original request.

## 5. Export the selected Installation and complete case

Export the saved selection:

~~~sh
facilitator-installation-receive --connection /absolute/private/HOST.json export \
  --operation ORIGINAL_OPERATION_UUID
~~~

The bridge requests the actual saved Installation ID and explicit revision from the original native exporter. It retains the complete returned ZIP and its native response before receiving.

Open the archive and its usable contents. The selected Installation handover travels with the original complete operating case and its source, rather than becoming a detached report. Read the included selected edition and readable handover against the saved native result.

The original Grant client imports complete bundles up to 32 MiB. Source attachments retain their existing 8 MiB per-file bound; an operating case also retains its original total source limit of 24 MiB and 200 files. These are existing native transport limits; keep the complete package intact. If the actual full customer package exceeds a supported route, continue through a maintained complete-package route with its existing owner rather than silently dropping source or splitting one archive into independent case imports.

## 6. Independently receive and reopen

Receive the exact retained export into the selected independent application:

~~~sh
facilitator-installation-receive --connection /absolute/private/HOST.json receive \
  --operation ORIGINAL_OPERATION_UUID
~~~

The bridge retains the full import request and sends the complete ZIP through the existing Grant case importer. It records the actual receiving case identity and reopens the selected Installation in that case.

Inspect the returned whole case and selected edition. Confirm that the original Installation ID, revision, saved digest and full document remain the selected originals. Preserve the original transfer, source files, plan, assignments, checks and case history through the native import.

Open the receiving case in its existing application. Operate the saved Installation and inspect the original source and readable handover. A receiving case's actual ID comes from the importer; a customer UUID, acquisition name or commissioning job ID is not a substitute for it.

If the import response is interrupted, continue receive on the same operation. Its original full bytes, import request identity, name and actor remain the request. Read back the original native result before claiming that the independent case has been received.

## 7. Close and resume without losing the work

Use list to find retained operations and show to inspect one complete retained operation:

~~~sh
facilitator-installation-receive --connection /absolute/private/HOST.json list

facilitator-installation-receive --connection /absolute/private/HOST.json show \
  --operation ORIGINAL_OPERATION_UUID
~~~

Completed phase responses are reopened from their retained originals. Closing the bridge drains its admitted work and releases its own private-directory lock. The CLI also closes only the borrowed client objects that it constructed. Neither action stops the source or receiving managed Grant applications.

Keep the entire private receiving directory with its complete input preparation, intent, native responses and exported archive. Keep the original host configuration in its authorized custody. Reopening uses the same operation and the original application selections; it does not manufacture another customer case or replay a purchase.

An application embedding the bridge can pass already borrowed source and receiving clients. Those clients remain owned by their existing caller.

## Save complete files for the recipient

The export action retains the native ZIP inside the operation. Use file to publish that complete original archive or another declared member to a new private output location:

~~~sh
facilitator-installation-receive --connection /absolute/private/HOST.json file \
  --operation ORIGINAL_OPERATION_UUID \
  --file complete-case.zip \
  --output /absolute/private/customer-delivery/complete-case.zip
~~~

The parent output directory must already exist and be private to the operator. Choose a path outside either original workspace, the preparation and the receiving journal. Publication preserves an existing identical file and rejects a different file at that name.

| Declared file | Complete content |
| --- | --- |
| complete-case.zip | Native Installation export with the whole original case |
| native-preview.json | Full original reviewed preview |
| native-save.json | Original accepted save result |
| native-receive.json | Original accepted import result |
| original-saved-edition.json | Full saved Installation observation |
| independently-received-edition.json | Full independently reopened Installation observation |
| operation.json | Complete current bridge operation view |
| intent.json | Immutable original preparation and operator choices |
| save-request.json | Exact reviewed native save request |
| receive-request.json | Original complete archive selection and import request |
| RECEIVED.json | Completed original-to-receiving selection |
| Phase error filename returned by show | Original request and available native error fields |
| preparation/DECLARED_ORIGINAL_PATH | One complete member from the retained preparation inventory |

A file becomes available when its phase has returned and retained it. List and show inspect local retained work without opening a Grant service. The JSON command views also accept --output NEW_FILE.json.

## Embedded application interface

The additive module is installation-receiving.mjs.

~~~javascript
const receiver = await openInstallationReceiving({
  directory: originalPrivateReceivingDirectory,
  sourceClient: existingSourceGrantClient,
  receivingClient: existingReceivingGrantClient,
  sourceBinding: inspectedOriginalSourceBinding,
  receivingBinding: inspectedOriginalReceivingBinding
});

try {
  const preview = await receiver.prepare({
    operationId: originalOperationUUID,
    preparationDirectory: completedOriginalPreparation,
    expectedPreparationSha256: selectedPreparationReceiptSha256,
    actor: actualOperator,
    note: actualSaveReason,
    receivingName: selectedReceivingCaseName
  });

  // Display and inspect the complete original native preview.
  // Invoke the remaining actions at their explicit operator controls.
  const saved = await receiver.save(originalOperationUUID);
  const exported = await receiver.export(originalOperationUUID);
  const received = await receiver.receive(originalOperationUUID);
} finally {
  await receiver.close();
}
~~~

The example shows the whole sequence; a UI preserves separate preview, save, export and receive controls. It must retain the selected operation and reopen it after navigation or reload. It must not turn viewing a preview into an implicit save.

The module requires both sourceBinding and receivingBinding from the original inspectGrantAgentBinding inspector. Each binds the selected absolute workspace directory and selectionSha256; the caller must open its supplied original clients with those exact inspected selections and allowStart:false. The bridge borrows those clients without closing them. Its read(operationId), list() and file(operationId,name) methods expose the retained operation and complete declared files. File names come from the original operation's inventory; a browser does not supply arbitrary host paths.

Display the actual source and receiving case, native revision and unresolved phase to the operator. Keep errors and interrupted actions attached to their original operation. Avoid hiding them by opening a new blank operation.

## Complete receiving course

Carry out this course on the exact delivered source and the actual retained customer preparation:

1. Open the original source case and the intended independent receiving application. Confirm their actual selected source and workspace identities.
2. Select the whole completed commissioning preparation and its exact receipt. Open its job, original transfer, source inputs, bindings and workorder.
3. Prepare one receiving operation. Inspect the native complete preview and every pending selection.
4. Save its reviewed document. Reopen the actual selected Installation and retain the original request and response.
5. Reopen the bridge after a normal close. Confirm that the same operation still selects the original saved Installation.
6. Export the selected Installation with its complete original case. Open the ZIP and all applicable deliverables.
7. Receive that exact archive independently. Open the actual resulting case, original source and selected Installation.
8. Close and reopen the receiving application through its original owner. Reopen the same imported case and retained edition.
9. Review the customer's actual original service outputs and source alongside the Installation handover. Preserve all existing purchase and accounting records; receiving an Installation does not perform another acquisition.
10. Deliver the complete editable job, source, operating-case export, usable handover, original operation outputs and support ownership together.

An already retained interrupted operation continues from its original phase and request. Do not restart completed service, provider or customer execution to manufacture a fresh receiving course.

## Inspect the exact outgoing product and attachments

Before presenting the resulting application or handover as customer-ready, the producing operator must open, run or render the exact outgoing version, look at the actual rendered screen or its screenshots, and operate the controls as the recipient would. Inspect the normal presentation width and relevant narrow/mobile width, populated and empty states, useful errors, downloads and reopened work.

Open every applicable attachment in its actual format. Extract archives and open their usable reports, source, editable work and project. Inspect each applicable PDF/report page. Source review, schema checks, response codes, captured-but-unviewed screenshots and another peer's review do not replace actual use and visual inspection.

Repair clipped, unreadable, overflowing or broken output in the same source and continue delivery. Use plain industrial presentation: clear labels, readable tables, restrained controls, consistent typography and spacing. Keep the complete operating behavior and source.

If a video or audio demonstration is included, use an available high-quality natural voice/TTS and useful generative media, preserving existing spending and voice permissions. Watch and listen to the actual final export, including pronunciation, timing and alignment. Show real operated application output in demonstrations of execution.

These steps belong to the existing customer receiving operation. They do not create another controller, review queue, watcher, service owner or permission process.

## Related operating contracts

- [Complete original commissioning and customer operation](OPERATING.md)
- [Customer agent interface](CUSTOMER_AGENT.md)
- [Source-bound paired Installation preparation](INSTALLATION.md)
- [Original Installation Workshare preparation and receiving](../../stellar/scf_2026/sf49_data_commissioning/installation-workorders/README.md)
- [Original native Grant client](../../stellar/scf_2026/sf47_budget_model/workspace/agent-client.mjs)
