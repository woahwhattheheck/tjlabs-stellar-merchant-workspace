# Run the original property continuity commissioning course

This receiving programme uses the consolidated Bluewave application and its own source-bound domain. It consumes actual original files and a complete, pre-authored sequence of business commands. It does not supply sample customer records, fabricate a successful migration, start a platform writer or issue a new load.

The source contribution consists of:

- `bluewave/receiving_program.py`: complete native command, report, export, cold receiving and packaging owner.
- `tools/receiving_browser.cjs`: read-only review of the actual independently received workspace.
- This input and operating guide.

## Select the source and existing runtime

The application owner includes these leaves in the existing full source selection and computes the new `source-selection.json` through the maintained source inventory. Use that final selection SHA-256 in the input; do not use a pre-integration hash.

Use the already installed Python, Node, Playwright and dedicated headless Chromium. The programme installs nothing. `playwrightModule` is the absolute entry file or package directory accepted by Node's `require`; the native preflight requires an existing file, so choose the actual entry file. `executablePath` is the verified existing Chromium executable, not a browser download request.

The application owner remains the sole executor. Coordinate the one browser interval with other native work. Native source authoring and V8 parsing do not establish that this commissioning course has run.

## Prepare one complete original input

Write a JSON object with exactly these top-level keys:

| Key | Required value |
| --- | --- |
| schema | `bluewave.commissioning-programme.v1` |
| operationId | The original canonical UUID for this whole receiving course |
| sourceSha256 | SHA-256 of the selected complete application source inventory |
| filesRoot | Absolute canonical directory containing the actual original input files |
| files | Complete array of relative file path, byte length and SHA-256 descriptors |
| workspace | Explicit original create or existing workspace basis |
| commands | Complete ordered, pre-authored original business command envelopes |
| receiving | Independent receiving directory and supplied later edit commands |
| browser | Existing runtime paths, actual reviewing operator and bounded timeout |

Each file descriptor has exactly `{path,bytes,sha256}`. Paths are portable relative paths beneath filesRoot, without dot segments or escapes. The programme reads and verifies every byte before application effects; it verifies again when retaining the file in the original workspace. The original limits remain 64 MiB per source blob and 256 MiB aggregate. Include the actual population, independent target return, load evidence and any other evidence referenced by supplied commands. Source descriptors inside business commands retain the domain's complete `{sha256,bytes,mediaType,name}` shape.

Workspace has exactly `{directory,mode,id,title,createdAt,revision,sha256}`. All paths must be absolute and original and received paths must be separate. For an explicitly authorized new workspace, mode is create, revision is zero and sha256 is null. For an existing workspace, mode is existing and revision/sha256 identify the actual saved starting edition. Both modes require the original UUID, title and creation timestamp. A retry retains the complete original basis; it does not substitute the later current revision.

Each item of commands is exactly:

```json
{"label":"<original operator description>","expectedRevision":"<integer from original plan>","command":{"requestId":"<original UUID>","kind":"<actual maintained command>","actor":{"id":"<actual operator reference>","name":"<actual operator name>"},"at":"<original ISO timestamp with offset>","body":"<complete original command object>"}}
```

This is a shape illustration, not executable customer input: expectedRevision is an integer and body is an object in the actual plan. Use the exact original domain command bodies from the maintained guide and interface. Do not replace real rows with this placeholder text. Every expected revision must be consecutive from the selected starting revision, and each original business command UUID must be distinct across original and receiving branches.

The source course includes actual source.import, mapping.save, mapping.review, reconciliation.create, rehearsal.record, cutover.plan, cutover.decide, cutover.close and handover.record commands. Include all actual intervening finding decisions, source editions, reviewed mappings, both rehearsals, returns or rejection paths required by the real case. The programme does not force ACCEPTED or synthesize evidence to satisfy these steps. A completed execution means the supplied course ran; its retained business decisions continue to describe whether the real migration is accepted, rejected or awaiting follow-through.

Receiving is exactly `{directory,commands}`. It must contain at least one actual pre-authored later edit at the revision immediately after the original command course. Use new original business request IDs for those edits. A following receiving directory is derived beside this directory as `following-<operationId>`; it must remain dedicated to this operation.

Browser has exactly `{node,playwrightModule,executablePath,actor,timeoutSeconds}`. Runtime paths are absolute existing files, actor is the actual `{id,name}`, and timeoutSeconds is an integer from 60 through 3600. The local operator selection is the only browser-side change; no application mutation is allowed during this review.

## Invoke and continue the same operation

From the final selected source root:

```sh
python3 -B -m bluewave.receiving_program \
  --input /absolute/original-programme-input.json \
  --operation-directory /absolute/original-operation \
  --source-root /absolute/selected-source
```

Keep the same input bytes, operation directory and selected source on every continuation. The programme permanently retains input.json and uses an inherited operating-system flock across its Node browser child. Each phase publishes its full original input before effects and its first result before advancing. Original Workspace request memoization remains authoritative when a process dies between the native effect and its phase receipt.

An unresolved live browser must be reconciled through its exact recorded process, profile, boot and PID namespace. The browser records STARTING before launch, actual RUNNING process identity, then CLOSED after Playwright closes and the exact profile process scan is empty. A retry may establish absence only in the same boot and PID namespace. It never kills an unrelated process or declares an unknown launch absent.

## What the complete course preserves

1. Actual original files become hash-verified workspace blobs.
2. The exact command list runs through the original Workspace API and original domain validation. Replaying the first request must return its original first result.
3. Every reconciliation row and finding is paged to complete coverage, compared with the original full report, and saved as JSON/HTML. Every source population and full command history is read completely.
4. The first export freezes the original revision before invoking the maintained full workspace publisher. All source, blobs, commands, first results and original publication history travel together.
5. An independent cold receive opens that complete archive. The supplied later edit is applied through the same original command API.
6. Repeating the original receive must retain the later revision and state hash exactly.
7. A following full export freezes the edited revision and is independently received again.
8. The browser opens this actual second receiving branch. It verifies both logical workspace UUID and exact canonical workspace directory, plus source selection and revision/hash.
9. Desktop and 390px phone inspection includes all ten staff sections, actual source-row and report detail views where present, and the staff guide. It records actual screenshots, geometry, console/API errors and the full report downloaded through its directory-bound link.
10. All owned HTTP handlers, native workspace connections and the one browser context close before the complete native result is published.

The browser blocks POST/PUT/other mutating API calls. It uses the supplied operator through the visible Source editions controls. Its exact-origin capability is not retained in the package; the transient launch file is removed after the host closes.

## Outputs and interruption recovery

The operation directory contains original input, journal, per-phase inputs and first results, native reports, original/following complete workspace archives, browser custody and actual screenshots. The final outer file is `Bluewave_Complete_Commissioning.zip` with an exact Delivery_Manifest.json. It includes both independently usable complete workspace ZIPs and the full commissioning record.

Native reports are also retained as exact workspace blobs. Missing report files can be reconstructed from those same original bytes. Missing workspace export files are regenerated only through the original frozen publication and revision, then matched against their retained hash/size/manifest. A completed native course resumes packaging without rerunning business commands or the browser. The package uses a separate frozen completed journal so a later packaging interruption cannot change its recipe.

The usual complete source/archive capacity bounds remain explicit. An allowance failure stops the operation with retained original state; it does not trim customer rows, evidence, report pages or source files.

The final result contains state COMPLETE, original operation/input/native-result hashes, exact outer archive path/bytes/SHA-256 and allOwnedResourcesClosed. Inspect the actual result, not only process exit status. If the programme stops, retain its original journal and error and continue the same operation only after resolving that actual condition. No new operation or replacement business data is generated automatically.

The source owner publishes the complete contribution into the existing consolidated application. External customer delivery, acceptance or proposal sending remains with the original commercial owner.

## Review the actual rendered result

Open the retained desktop and phone screenshots and inspect the rendered product before describing the edition as ready for customer use. The programme records actual browser activity and geometry; COMPLETE does not itself mean a person reviewed every pixel. Retain any real issue and correct the same maintained product. This source contribution has not been executed in this source-authoring lane.
