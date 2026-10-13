# Customer Installation desk

The Customer Installation screen prepares the original paired-service commissioning job for its existing Operations case. It uses the same authenticated operator, complete source files, saved command UUIDs and receiving history as the other eight screens.

The original Installation application performs preview and save. This desk prepares its complete document and preview input, with the selected case version, workshare, funding, assignments and source identities retained.

## Open the same working job

Start the complete installed product using its existing `facilitator-commissioning serve` command and the original job directory, release store and private setup file. Open its printed private session address. The command's current operating options remain in [OPERATING.md](OPERATING.md); installation preparation also remains available through the [original CLI](INSTALLATION.md).

Open **Handover** and retain a complete source transfer after stopping the foreground seller. Choose that original transfer in **Customer Installation**. Each transfer is an immutable source cut. An earlier transfer remains selectable while later service work remains in the job.

The desk binds the selected transfer's original manifest, every original member and the current job selection. It retains complete source bytes inside the existing operator input inventory before accepting a preparation request. The prepared source remains portable when its working job is received on another host.

## Prepare the actual Operations inputs

Use the existing Operations case to attach the complete source files and receive the current case JSON. Receive the original Workshare / Installation seed at that same case version. Keep the original planned Installation and funding checks; the source-only preparer does not change their state.

Open **Files** and upload:

- The complete current Operations case JSON, including its source catalog.
- The complete original Workshare / Installation seed JSON.

The ordinary file uploader accepts up to 64 MiB per original file and resumes an interrupted upload from its retained offset. The desk uses complete file identities from these uploads. It never selects an operating case from a filename alone.

In **Customer Installation**, choose the original complete service transfer and both uploaded inputs. Select **Review original source template**. Review the saved UUID, original service revision and full source command, then apply that exact request.

This produces a saved template and its original source-matching table. Open it under **Saved preparations**.

## Finish source matching

Inspect every page of **Original source matching**. The table retains the complete native transfer and every original member, its byte count and SHA256, and the actual source attachment from the selected Operations case. Duplicate identical case attachments retain their matching source IDs.

A missing match stays visible. Download the complete preparation TAR and attach the missing originals through the existing Operations case. Receive its new case JSON and seed at the same current version, upload them, and create a new template. The earlier template retains the case version originally selected.

The complete operating-choice editor opens when every selected original file has a case source match. No source attachment or authority is manufactured by the desk.

## Edit the complete Installation

The editor is bound to its original template UUID. Its fields cover the entire useful customer task:

| Section | Retained choices |
| --- | --- |
| Accountable deployments | Original merchant and independent buyer deployment IDs |
| Complete customer task | Complete output, reason for a repeat purchase and actual priced unit |
| Authorized original source | Source reference, mode, full population, key/unit/time meaning, authority and change policy |
| Payment | Network, asset, recipient, atomic price, useful task units, task budget, buyer authority and payment-terms source IDs |
| Receiving | Application, host, named engineer, complete acceptance, change/withdrawal, recovery and maintenance |

Both facilitator operators, their endpoints and their original authority source IDs remain fixed to the selected service. The original workshare, workorder, assignments, workflow periods and checks remain in the prepared document. Inspect their complete original values in the funded-work disclosure.

Use the original IDs and actual customer choices. Blank optional values remain available for explicit native review. Zero atomic amounts remain zero; missing amounts remain null. The original preparer applies the task-price, quantity and budget rules.

Select **Review complete Installation preparation**. The browser retains the complete edited bindings as an ordinary original file, then saves the full preparation command using the same UUID/revision protocol. Review and apply it. Open the resulting **Prepared Installation**.

## Use every output

The completed preparation supplies:

- `installation-input.json`: complete document for the original Installation application.
- `installation-preview-input.json`: native preview envelope, including the selected case version and initial Installation revision.
- `WORKORDER.md`: readable full task, source, payment, receiving and operating course.
- `bindings.json` and the full original binding input.
- Original case, seed and selected profile.
- Complete source matching, preparation result and every original native service file.
- `INSTALLATION_PREPARATION.json`: exact full inventory and receiving identities.

Download individual members from **Complete original files**, following every page. **Download complete preparation TAR** contains the complete preparation and original native transfer. Open the workorder and source mapping and use the native document in the existing Installation application.

The source preparer reports any remaining choices. Its result is prepared source. The existing native preview/save flow evaluates the actual case, current revision, accountable deployments, source/funding checks and save operation.

When the case has advanced, obtain its current original seed and case and prepare a new source-bound template. Keep the existing preparation as the original retained edition.

## Resume after interruption

The browser saves each screen's draft and its original revision and template basis before submitting. It saves the complete pending request before its first prepare call. A second tab cannot replace another claimed pending UUID.

After an uncertain response, use **Receive saved result**. If the original request is absent on the host, **Retry saving original request** sends the same complete retained command. An accepted pending request keeps its UUID and all original file identities. A completed result reopens its exact source and output.

Preparing a template caches the selected source cut, original case/seed and installed profile before publishing the accepted request. Preparing its completed document also caches the full edited bindings. A received pending request can therefore finish using those original bytes even after the installed profile changes.

An interrupted preparation continues its immutable files and native completion receipt. An interrupted TAR build retains the prepared source; reopening validates an already completed full archive before publishing its completion receipt. The complete original package remains downloadable after the working job moves to another host.

## Receive the working job on another host

Use **Handover** to retain a complete operator transfer after the desired preparation. Its existing whole-job archive includes the Installation request, source binding, complete original inputs and every prepared output.

Receive that complete operator TAR through the existing `receive-operator.mjs` command or configured Merchant customer receiver. Select the original received SF82 release store explicitly when reopening the same job. Open **Customer Installation** and select the original preparation.

The working preparation reconstructs from the exact retained input identities and native inventory. No old absolute source path is restored. A later legitimate preparation or service command may be added to the same job.

The preparation TAR is a complete source/document handoff. The whole operator TAR is the working-job handoff with its authenticated operator journals and recovery state.

## Operate through the existing Merchant customer

The configured customer retains the same local operator and job. It exposes 20 operations, including:

- `merchant_commissioning_installations`: list original source cuts and saved preparations.
- `merchant_commissioning_installation`: read one complete preparation summary or a page of its original sources/files.
- `merchant_commissioning_prepare` and `apply`: save and apply `installation-template` or `installation-prepare` through the existing full-command protocol.
- `merchant_commissioning_capture`: receive an individual `installation` member or complete `installation-archive`, pinned to its original preparation receipt.
- The existing `receive_archive`: receive the complete working operator TAR into a host-declared private destination.

Use the configured original instance alias. The full customer example is:

```js
const catalog = await customer.installations(jobId);
const template = await customer.installation({
  jobId, operationId: templateOperationId, kind: 'summary'
});
const page = await customer.installation({
  jobId, operationId: templateOperationId, kind: 'files',
  offset: 0, limit: 250
});
// Follow page.next_offset until null, checking the same preparation UUID
// and nativeReceipt identity on every page.
const captured = await customer.capture({
  jobId, captureId: originalCaptureId,
  file: {kind: 'installation-archive', id: templateOperationId}
});
// Read every captured chunk through EOF using captured.manifestFile.sha256
// and captured.manifest.file.sha256, retaining the original complete bytes.
```

The agent interface borrows the existing listener. Closing it does not stop the listener, its foreground seller or the original native Installation writer.

## Complete the receiving course

Use the same actual customer job and selected case throughout this course:

1. Open the populated original operator at desktop and narrow widths. Inspect all original screens and Customer Installation. Open its source cut, current case and seed.
2. Prepare the original template. Inspect all source pages and missing-match behavior. Complete any required original case attachments through the native case workflow.
3. Edit all actual Installation choices, preserving funded work and both original provider authorities. Navigate away and reopen the draft. Confirm the original template and revision remain visible.
4. Save and apply its original complete preparation. Receive that same UUID again and compare its retained result. Use the actual native preview on the full document.
5. Open every produced JSON/Markdown/source file. Download the full preparation, extract it and independently inspect it with `facilitator-installation inspect`. Inspect every contained deliverable and the complete native source.
6. Retain and receive the whole operator TAR into a separate private destination. Reopen the same job/preparation and a retained pending preparation. Continue the original request and compare exact original source and resulting document identities.
7. Open and VIEW the final populated application at desktop and narrow widths, including empty/loading/error states and important controls. Use all downloads and the reopened working project. Capture and view actual screenshots; repair concrete defects before presentation.

Every final attachment must actually be opened, viewed, played or used according to its format: HTML, PDF, reports, slides, spreadsheets, maps, images, video, audio, archives and projects. Extract archives and open their contained deliverables and working project. Captured screenshots alone are insufficient.

The operating receiver records the actual host, original customer/job/case IDs, selected source identities, performed actions, native preview/save results, downloaded member identities and viewed rendered outputs. Keep that result with the original customer course.

## Continue directly through native receiving

The same Customer Installation screen now provides explicit native Preview, Save, Export and Receive controls for a host-declared pair of existing Grant Operations services. Follow INSTALLATION_NATIVE_DESK.md for configuration, full native document review, original UUID recovery, complete files, independent receiving and the entire customer operating course.

The preparation and its original case/Workshare/source identities remain unchanged. Native receiving writes through the existing SF47 client and original receiving bridge. Original accepted operations remain attached to their native requests and workspaces.
