# Research customer handover desk

The desk operates one selected customer handover through complete collaborator-return reviews and a final editable delivery. It uses the original customer-updates handover, native dossier-return comparison and review, and the maintained handover-return programme.

## Start the selected operation

Use the complete current Research installation and its existing running workspace. The exact selection file and SHA-256 are the same as the installed `research-customer-handover-returns` course. Prepare that file using [HANDOVER_RETURNS.md](HANDOVER_RETURNS.md): it selects the actual customer handover, workspace, dossier, starting revision, full engine source manifest, ordered return rounds and agreed complete-file limits.

```sh
research-customer-handover-desk \
  --connection-file /private/research.connection.json \
  --run-directory /private/customer-handover \
  --selection /private/handover-selection.json \
  --selection-sha256 ACTUAL_COMPLETE_SELECTION_SHA256
```

The equivalent original-source entry is:

```sh
node customer-updates/handover-desk-cli.mjs \
  --connection-file /private/research.connection.json \
  --run-directory /private/customer-handover \
  --selection /private/handover-selection.json \
  --selection-sha256 ACTUAL_COMPLETE_SELECTION_SHA256
```

The `research-client customer-handover-desk` command accepts the same options. An optional `--workspace /absolute/original/workspace` selects the local directory through the original Research client; its actual connected workspace ID must match the selection. It is a directory option, distinct from the workspace ID in the selection. Optional `--port` defaults to a free loopback port; `--python` and `--node` select the installed executables used by the original complete-package receiver.

Open the private URL printed in this terminal. The desk listens on 127.0.0.1 and uses a per-host bearer token in the URL fragment. The browser keeps that token in origin-scoped session storage and removes the fragment from the visible address. Keep the original terminal and private URL available. After a host restart, open its newly printed private URL.

The existing Research host keeps its current lifecycle. Closing this desk detaches its client after active work finishes.

## Operate the whole delivery

1. **Read the selected delivery.** Check the customer, operation, dossier, starting revision, item budget and return-round budget. Choose **Initialize this delivery**. The original programme verifies the complete baseline and engine selection and preserves any inherited native returns.
2. **Retain a complete return.** Choose the next ordered round. Select its original JSON or gzip portable file and click **Retain original file**. The upload is streamed to a private candidate; the selected source becomes available after the complete bytes have been retained and measured.
3. **Prepare the comparison.** Click **Prepare complete comparison**. The original programme receives the source, freezes its native comparison and retains every comparison item and complete base/current/returned value. Its original reports and returned file become available for download.
4. **Review every item.** The desk displays twenty changes per page, with a filter for items awaiting a choice. Every choice uses the original native label and effect. **Read complete value** opens the whole original JSON value, including its source identity. Missing values are shown as absent.
5. **Save the named review.** Enter the reviewer, optional note and each explicit decision. An EDIT requires the complete reviewed JSON value. **Save review draft** retains the full draft on the host; partial decisions can be saved while review continues.
6. **Apply the saved decisions.** This action is enabled for a complete, named, saved draft. The host first asks the original native model to validate the proposed choices and their dependencies. A rejected candidate remains editable. After that preview succeeds, the host freezes one exact native request and invokes the original review. It retains the accepted receipt and complete report/source exports. The displayed fields switch to that exact submitted request.
7. **Continue all selected rounds.** Each subsequent round uses the original programme's accepted prefix and cumulative limits. A later authored revision is handled by the original native comparison; it does not silently change an earlier saved request.
8. **Build and receive the final handover.** After all rounds are accepted, choose **Build and receive handover**. The original programme exports the accepted historical dossier, full baseline, source, licence, comparisons, values, decisions and reports. It builds the complete archive and independently reopens its accepted native history.
9. **Download the complete editable handover.** Each download carries its selected size and SHA-256. The browser receives the full body, verifies both and then saves the file. The package's opening instructions and original editable Research application travel with it.

The desk uses the original model's distinction between authored changes and typed history. The effect displayed beside each item explains whether the action changes an active value or retains a reviewed proposal. It never preselects a suggested decision.

## Drafts, separate tabs and interrupted responses

A draft is saved against the SHA-256 of its preceding saved version. Each version remains complete in the private operation directory. Another tab cannot silently overwrite a newer saved draft. If a different saved version appears, the desk keeps the current local edits and presents **Use the saved draft** as an explicit choice.

Typing during a save remains possible. The returned save acknowledges the submitted snapshot; later keystrokes stay marked as unsaved. Switching rounds preserves the local editor for each round. The browser warns before closing with unsaved edits.

**Export current edits** saves an editable review file that includes its exact operation, workspace, dossier, round and comparison identities. It also preserves unfinished EDIT text. **Import saved review file** accepts that desk export for the same comparison and makes it a new local edit. Read and save it before applying. This file is an editor draft; the original native request is retained separately by the host.

After an interrupted apply response, use **Refresh saved state**. If the native request is already retained, **Recover original request** uses those exact bytes and the original native request lookup. If the host stopped after freezing the draft binding but before retaining the complete request file, the same recovery action completes that saved binding first. A new request is never inferred from a later editable draft.

If another tab has already submitted a request while this page has unsaved changes, the desk displays the submitted decisions. The separate local edits remain available through **Export current edits**. The submitted request stays fixed.

An interrupted comparison, export, archive build or independent receive is continued through the same original operation directory. The status and job display distinguish running, succeeded, failed, interrupted and unconfirmed outcomes. Refresh reads saved state; it does not automatically repeat a native mutation.

## Complete values and downloads

The comparison contains every item; pagination changes only the visible page. The value viewer verifies the selected review, item, side and value hash before displaying the complete JSON. Source text is inserted as text, never interpreted as HTML.

Native HTML reports are delivered as attachments, with a content security policy that isolates them from the authenticated desk. The download route resolves only descriptors enumerated from this selected operation. Browser requests cannot supply an arbitrary host path.

The programme's selected maximum source and archive sizes remain authoritative. A changed or oversized original file must be handled through an explicit revised selection; this desk does not rewrite it to fit.

## Close, reopen and receive independently

Stop the installed command with Ctrl-C. The host rejects new mutation work, waits for its active original job and closes the client. A disconnected browser does not cancel a native job.

Restart with the same run directory and exact selection to read the saved source, draft history, original request and completion. The new private URL has a new token. The same lifetime lock prevents simultaneous desk owners of that directory.

The original CLI remains available for the same course:

```sh
research-customer-handover-returns status --run-directory /private/customer-handover
research-customer-handover-returns apply \
  --connection-file /private/research.connection.json \
  --run-directory /private/customer-handover --round ORIGINAL_ROUND
```

Omitting review-file flags in the second command recovers the already retained request. Read the complete original guide before operating a course from another interface.

The final package's `OPEN.mjs` opens the complete editable dossier through its original private Research host. Follow [HANDOVER_RETURNS.md](HANDOVER_RETURNS.md) for full independent receiving, source selection and package-opening commands.

## Source and receiving entry

The desk consists of `handover-desk.mjs`, `handover-desk-cli.mjs` and the three files in `handover-desk-public/`. The installed contribution includes these original bodies and this guide. Its core is the maintained `handover-returns.mjs` programme and original Research client; all complete source dependencies and runtime requirements in the selected engine still apply.

The separate original-input receiving course consumes the selected real handover, complete return files and reviewed decisions. It drives this same API and explicitly selected installed browser through the full operation. It preserves the original directory across interruptions and emits a review-required result when a genuine comparison still needs its explicit decisions. Its complete operation record accompanies the selected source.

### Run the original-input receiving course

Use the installed `research-customer-handover-desk-receiving --input /absolute/private/receiving.json --sha256 ACTUAL_INPUT_SHA256` command, or `node customer-updates/handover-desk-receiving.mjs` with the same flags. Its input schema is `sf88.research-customer-handover-desk-receiving.v1`. Supply the actual connection, complete selection, original operation directory, ordered source and reviewed-decision descriptors, plus the already installed runtime/browser locations selected by the course. The entry retains those exact inputs and original operation; a missing source or review returns `SOURCE_REQUIRED` or `REVIEW_REQUIRED` for continuation in the same directory.

## Exact receiving-course input

The ordinary course uses the installed browser and the same private desk/core. It requires an existing Playwright module and Chromium executable; it does not download a browser, fabricate a dossier or author review decisions. The native Research connection must already select the actual workspace. Use a persistent directory on a volume with room for the original sources, full exports and complete editable archive.

Its input is one complete JSON object with schema `sf88.research-customer-handover-desk-receiving.v1`. Hash that exact JSON file and pass the hash with `--sha256`. An input may later add an actual source or review that was not available on the first invocation. Keep its original selection hash, receiving directory, runtime paths and native workspace.

| Field | Actual input |
| --- | --- |
| `schema` | `sf88.research-customer-handover-desk-receiving.v1` |
| `connectionFile` | Absolute original Research connection file; the token remains private. |
| `workspaceDirectory` | Optional absolute original local workspace override, using the normal client directory option. |
| `selectionFile` | Absolute complete `sf88.research-customer-handover-returns.v1` selection from the original course. |
| `selectionSha256` | SHA-256 of that exact full selection file. |
| `directory` | One absolute persistent receiving root. The selected desk lives under `desk/`; public observations/downloads under `public/`; runtime state and input copies under `private/`. |
| `rounds` | Actual selected round keys with available source/review descriptors, as described below. The original selection determines execution order. |
| `playwrightModule` | Absolute installed Playwright module filename that exports `chromium`. |
| `chromiumExecutable` | Absolute existing Chromium executable. |
| `python`, `node` | Optional actual existing executable selections for the original package receiver; defaults are `python3` and the running Node executable. |
| `jobTimeoutMs` | Optional per-job observation limit, default 1,800,000 ms. A timeout does not cancel a native job; closure still waits for the desk's active work. |

Each available round is `{key, source?, review?, rejectedReview?}`. The `key` must be one of the original selected rounds. Source descriptors contain the full original file:

```text
source = {
  file: absolute original file,
  bytes: actual complete integer byte count,
  sha256: actual full-file SHA-256,
  filename: original selected filename,
  contentType: application/json | application/gzip | application/x-gzip | application/octet-stream
}
```

The course verifies and retains those exact bytes before streaming them to the desk. A later invocation may omit a source that is already retained; supplying it again must match. It does not replace a round's source with a newer edition.

A review descriptor is `{file, sha256}` for one complete JSON file. Its content contains the native `reviewId`, `comparisonSha256`, `expectedRevision`, named `reviewedBy`, optional `reviewNote`, and the complete ordered `decisions` array. Each decision is `{itemId, choice}` or `{itemId, choice:"EDIT", value:...}` according to the actual comparison. Read all full side values before preparing that input. An authorized operator or agent can author it.

The desk assigns one stable request ID for a new draft. A review file may omit `requestId` until this original identity is available; if it supplies one, it must equal the desk-assigned ID. The course never silently changes a supplied request ID. An already-retained native request keeps its own exact identity and decision order. The browser's standalone **Export current edits** format is a different editor format: use its normal UI import, or provide the explicit native review fields required here.

Missing inputs are successful, resumable pauses:

- `SOURCE_REQUIRED` means the next original selected round has no retained source.
- `REVIEW_REQUIRED` means its actual comparison and complete values have been retained, but no explicit reviewed request was supplied.

Both results close the browser and desk cleanly. They preserve the original operation directory. Read `public/rounds/<key>/COMPARISON.json`, full value files and source/report downloads, supply the actual reviewed file in a successor receiving input, and invoke the same command against the same root.

### What the course operates and verifies

The course opens the real browser. It initializes the original native course, streams the original returned source, prepares the real comparison, and retains every complete present side value. It saves the supplied whole review through the same draft CAS API, preserving supplied decision order and the distinction between an omitted note and an empty note. After reloading the browser it inspects the displayed reviewer, note and every paginated decision/EDIT value.

For a new apply, it clicks the actual browser action. After the real server accepts the request with HTTP 202, it withholds that one response from the page. It then reads the original job and retained request, reloads the page, validates the whole submitted request and recovers that same native request. It verifies the accepted receipt and unchanged replay before retaining the full report/source downloads. No fake receipt or replacement request is supplied.

After all original rounds are accepted, it invokes the core's complete package and independent cold receiving. It checks that the original receiver reports completion, downloads every selected final descriptor, and downloads the entire final ZIP through the actual browser control. It compares that browser download with the original exact byte count and SHA-256. Only after browser and desk closure does it publish the receiving-course result. Original native/package logs and the editable cold workspace remain under `desk/`.

### Optional actual invalid-edit and separate-tab recovery

Where the real comparison permits an EDIT, a caller may additionally provide `rejectedReview:{file,sha256,expectedCode}`. This must be an actual explicitly authored alternative candidate for the same comparison; the course does not invent an invalid edit. `expectedCode` is the original native `RETURN_DECISION_INVALID` or `RETURN_DECISION_REQUIRED`.

The course saves that candidate, invokes the original validator, and requires the specified rejection with no retained request or locked draft. It then saves the separately supplied corrected `review`. A stale attempt to save the earlier supplied candidate must receive `DESK_DRAFT_CONFLICT` without changing the corrected draft. Finally it applies the corrected saved review through the same real browser/response-recovery path.

An unexpected accepted alternative is not called a successful rejection check: the course stops, retains the actual original outcome, and does not undo or replace it. Inspect the original course and continue its exact request. This option should therefore be used only with a deliberately reviewed real alternative whose invalidity is understood.

### Retained outputs and reentry

`public/` contains the exact native selection, immutable comparisons, complete value envelopes, original reviewed input files, actual accepted receipts, full downloads and receiving results. Download filenames are opaque stable IDs accompanied by the original human filename, bytes and SHA-256 in their descriptors. The complete editable customer ZIP is the core's original archive.

`private/` holds exact source input copies, runtime binding, browser download verification, screenshot and attempt failure/closure records. Do not include private browser or connection state in a customer handover. The receiver does not write the desk's bearer token or connection body into its public results.

If a draft response is lost, the course reads the current saved version and accepts it only when its complete values equal the submitted original. If an apply response is lost, it looks for the exact retained request and receipt before continuing. It never retries a new request against a later comparison. Reentry after COMPLETE verifies the same accepted history and complete archive; it does not create another native return.

The operation's actual `COMPLETE` result and original native receiving records establish completion of the selected customer run.
