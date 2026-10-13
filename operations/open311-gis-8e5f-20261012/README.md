# Boston geographic customer commissioning

This programme takes the original Boston collection and service report through the installed geographic browser, an editable GeoPackage, reviewed dispatch, a receiving desk, the installed CLI and the configured merchant client. It retains the complete operating workspaces and usable destination files.

The same output directory is an operation that can be continued. Before a browser mutation reaches the native server, the programme saves the actual browser-generated request ID and complete input. After an interruption it reads that ID through the original workspace operation API. A committed action returns its original result; an uncommitted captured request is replayed with its exact body and original revision. The original workspace’s transaction and revision checks remain authoritative.

The inputs remain the completed original Boston collection/reporting operation in `operations/open311-boston-8e5f-20261012/`: the original 84 created cases, 21 updated cases, empty updated window, and combined 104-case report. Every original input byte and case coordinate is retained. The three analyst assignments are explicitly labelled internal commissioning work.

## Complete operating sequence

1. Import all four original files through the geographic browser. Retain their complete source history and create a 104-case collection handoff plus a separate 104-case handoff from the selected service report.
2. Read the map and case pages, search by an original municipal identifier, and open that case’s retained source status note.
3. Download the complete GeoPackage. Use native SQLite to assign three original source rows in the editable analyst fields. The selected rows, source hash and authored assignments are saved before the native edit.
4. Receive the edited package through the browser. Accept one proposal and reject one. Reload the desk, save and reload the remaining reviewer choice through the original browser store, and finish the second decision. The original decisions remain in the same native history.
5. Select the two accepted dispatch cases across the 100-row page boundary. Save the destination mapping and download complete GeoPackage, GeoJSON, CSV, JSON and HTML files.
6. Download the editable sender workspace. Receive it into a second initialized browser desk. On the first actual receiving action, abort its HTTP response after the native commit, reload and recover the original saved operation. Continue the received handoff with a real new recipient operation.
7. Close the browser and both native desks. Reopen the recipient SQLite database independently and receive the complete file again through the installed CLI using one retained CLI request ID.
8. Open the original configured merchant integration. Page all 104 cases in groups of 17, download the complete recipient workspace and mapped dispatch file, and recover the original CLI receiving operation.
9. Close the native consumers, verify the selected source and complete retained files, and publish the complete `journey.json`, readable `index.html`, and `PORTABLE.md`.

Each browser mutation has its own saved request and result. Each completed observation, export and operating phase has its own immutable result. Resuming after a later interruption does not require replaying earlier customer actions.

## Run the original programme

Use the existing Node 24 or later runtime, installed Playwright/Chromium, and Linux util-linux `flock`. Supply a private JSON configuration:

~~~json
{
  "gisProduct": "/absolute/selected-source/stellar/scf-starforge-20261009/sf30-seller-sdk/open311/gis",
  "sourceRoot": "/absolute/selected-source",
  "collectionOutput": "/absolute/boston/delivery",
  "reportingOutput": "/absolute/boston/delivery/reporting",
  "output": "/absolute/private-geographic-delivery",
  "playwrightModule": "/absolute/node_modules/playwright/index.js",
  "chromiumExecutablePath": "/absolute/chromium",
  "edition": "the-actual-selected-source-edition",
  "mode": "run"
}
~~~

~~~sh
node operations/open311-gis-8e5f-20261012/commission-gis.mjs /absolute/private-gis-job.json
~~~

`sourceRoot` defaults to the repository or selected-source root five directories above the GIS product. The source directory must contain the whole GIS distribution selection and the original host-file, retained-file, configuration and quota dependencies. The programme hashes its complete selected source inventory, including internal symbolic-link targets, and its own driver. Git metadata, `node_modules`, Python bytecode and Python bytecode-cache directories are runtime or checkout material rather than selected source.

Keep the mutable output outside the selected source tree. The initial output must be empty. The four expected files are:

| Input | Relative location beneath the collection/reporting outputs | Original rows |
| --- | --- | ---: |
| Created collection | `created-collection.json` | 84 |
| Updated collection | `updated-collection.json` | 21 |
| Empty updated window | `empty-updated-collection.json` | 0 |
| Combined source report | `reporting/combined-observed-report-package.json` | 104 |

If the reporting package contains multiple 104-row reports, set `reportId` to the actual original combined report ID. `reportingOutput` can select its separate existing directory.

Optional execution settings are `timeoutMs` and `flockExecutable`. The browser uses the environment of the original native invocation; retain the selected host’s actual font, dynamic-library and Chromium settings. `sourceFiles` preserves supplied original source declarations alongside the actual source-byte inventory.

## Continue an interrupted operation

Rerun the same private configuration and physical output directory. Keep the original selected source, edition and input bytes. The programme can read already-frozen inputs if their original collection directory is no longer mounted; when an external input is still present it must match the frozen file exactly.

| Retained boundary | Continuation behavior |
| --- | --- |
| `INPUT.json` | Complete source inventory, programme source, four input files and selected report |
| `RUN.json` | Original operation UUID, start time and physical output identity |
| `workspaces/` | Original SQLite inode, bound before the first action and checked before every incomplete continuation can reuse a saved step |
| `actions/` | Actual HTTP input saved before submission, followed by its original native result; request kind, canonical input hash and result are verified |
| `steps/` and `phases/` | Completed work received from its original result after a lost parent acknowledgement |
| `cli/` | One CLI request, complete file identity, returned command output when observed, and original native result |
| `attempts/` | Actual process entries, failures, browser errors and available failure screenshots |
| `journey.json` | Immutable completed result, published only after all operating phases and file/native-workspace verification |

A permanent private kernel lock serializes the programme. The original CLI command resolves the physical `cli.mjs` leaf before launching Node. This includes a composed product whose CLI is still a symbolic link after its parent directory has been resolved; the command receipt records that actual physical entry path. The native CLI child inherits a copy of that same held open-file description. If the parent ends while the CLI is still writing, another invocation cannot enter until the actual child releases its copy. Closing one copy never explicitly unlocks another owner’s descriptor.

The browser capture keeps its generated request ID. The programme does not substitute an ID that the browser’s saved outbox has never seen. An interrupted exact request is read from the native workspace before any replay. A native revision or handoff-head conflict remains a concrete original selection conflict; the programme does not silently change a saved request, replace a current handoff or discard later operator work.

The response-loss exercise is recorded only when the response was actually aborted after its native commit. If the process ends before that observation is retained, continuation records recovery through the saved native operation. A fresh browser after parent loss has fresh browser storage; it is not described as reopening an unobserved old IndexedDB outbox. The complete original receiving result remains recoverable in both cases.

An earlier nonempty output from the old non-resumable driver lacks this pre-submission custody. It is preserved rather than silently interpreted as a new operation. Coordinate its actual existing native IDs and source with the original customer operator before choosing its next source edition. Existing completed operations are not restarted.

## Completed receiving and later recipient work

Running the same completed programme returns the original `journey.json`, including its original completion time. It verifies frozen artifacts and independently opens each actual workspace. Every original record and saved operation must remain byte-for-byte in the native package representation, with the same workspace identity and a revision at least as recent as the retained baseline.

Later valid recipient additions are allowed. Current SQLite bytes, current revision and the last displayed title are not required to equal their original completion values. The programme never replaces a later recipient workspace with a frozen export to make a comparison pass.

If an earlier merchant export was published before a parent interruption and the recipient subsequently advanced, the later actual complete merchant export is retained under its content hash. The prior edition remains alongside it. The final phase and handover index identify the actual selected recipient file.

To inspect a copied completed handover, select the same source and new output location with `"mode": "inspect"`. Retained files use portable relative paths. Physical inode checks apply to incomplete continuation; a completed copy is checked through native package identities and complete original record/operation inclusion. A copied incomplete output is not an independent second writer.

## Usable delivered files

| Delivered material | Purpose |
| --- | --- |
| `index.html` and `PORTABLE.md` | Readable file index and native receiving instructions |
| `inputs/` | Four original municipal/report files and edited analyst GeoPackage |
| `analyst-selection.json` | Original source hash and three authored internal assignments |
| `downloads/boston-analyst-original.gpkg` | Complete original 104-case geographic handoff |
| `downloads/boston-dispatch.{gpkg,geojson,csv,json,html}` | Two reviewed cases and saved destination mapping |
| `downloads/boston-complete-gis-workspace.json` | Complete sender source, review, dispatch and history |
| `downloads/boston-received-editable-workspace.json` | Actual continued first recipient edition |
| `downloads/boston-reopened-workspace.json` | Independently reopened native recipient |
| `downloads/boston-cli-received-workspace.json` | Actual original CLI receiving hop |
| `downloads/boston-merchant-workspace*.json` | Complete configured merchant observations |
| `sender-workspace/`, `receiver-workspace/`, `cli-received-workspace/` | Editable original SQLite workspaces |
| `merchant-gis-host.json` | Historical producing-host configuration and selected input |
| `screenshots/` | Six original browser receiving views |
| `actions/`, `cli/`, `steps/`, `phases/`, `attempts/` | Complete request, result and continuation history |
| `journey.json` | Completed result and immutable artifact hashes |

On another machine, receive the selected complete workspace JSON through the existing GIS CLI into a new native directory. Use a new request ID for that new receiving operation and reuse the same ID if its response is lost. The delivered `PORTABLE.md` gives the exact CLI argument shape.

The historical host configuration contains producing-machine paths. Use the original GIS configuration API to select the new machine’s actual workspace/input paths and preserve the historical file.

## Compose with the existing whole-command receiver

The existing `open311-boston-8e5f-20261012/run_native.py` supports the geographic phase through its `reporting` command. `continue-boston.mjs` remains compatible: it reads the original Boston outputs, resolves the GIS source from the selected phase and calls `runGISCommissioning`.

Keep business request `boston-geographic-8e5f-20261012-01`, existing source acquisition/installation ownership and the one customer receiving operation. Select the complete reviewed source before its next native phase; do not replace a file inside an already-dispatched immutable input.

A reporting packet keeps this existing shape:

~~~json
{
  "op": "reporting",
  "requestId": "boston-geographic-8e5f-20261012-01",
  "files": [
    {
      "path": "operations/open311-gis-8e5f-20261012/commission-gis.mjs",
      "content": "...the complete selected programme body...",
      "bytes": 0,
      "sha256": "...the actual complete file SHA-256...",
      "gitBlob": "...the actual selected Git blob..."
    }
  ],
  "runner": "...the complete original continue-boston.mjs body...",
  "options": {
    "gisEdition": "the-actual-selected-source-edition"
  }
}
~~~

The example explains the shape; fill it with actual complete bytes, sizes and hashes. Preserve every original GIS product leaf and host dependency. Update the selected driver and guide in the existing complete packet. The maintained receiver’s `--reporting-packet` and `--reporting-git-blob` select that exact packet and preserve its complete archive return.

The programme does not create a second customer ZIP or native controller. The existing whole-command receiver includes this output, editable workspaces and complete history in its single archive.

`OPEN311_GIS_PHASE` reports a retained completed operating phase. `OPEN311_GIS_COMPLETE` reports either the completed result or current failed attempt. Failures exit nonzero and retain the actual error. Completed replay reports `reused: true` without running the browser or customer mutations again.

The source remains paired with the original GIS product merged in public PR2453 and standalone PR404. Native results belong to their actual host and selected edition; source publication and syntax alone are not a customer-run result.


## Complete 104-case analyst and independent supervisor operation

The optional full-plan mode carries the complete original Boston analyst programme through the existing browser, native request journal, five dispatch exports and independent receiving. Select this complete source before the first GIS action. Continue an already-started older operation with its original selected source.

Add the original analyst-plan path and a private supervisor-selection path to the same configuration:

~~~json
{
  "analystPlan": "/absolute/original/Boston_104_Case_Analyst_Plan_32C2.json",
  "supervisorSelection": "/absolute/private/boston-supervisor-selection.json"
}
~~~

All existing GIS product, original four collection/report files, Node 24, Chrome, Playwright, sourceRoot and output settings remain in that configuration. The original plan is the 167,883-byte attachment on the original Boston source page, FileUpload ID 3f7dd772-3100-81bb-a3f9-00b2ba08da15, SHA256 e3d1736810049ecb6d21e7fa07e2be935dc6d1d5c946b14588b5b5605cfaaea8. Its full 104 recommendations retain 48 dispatch, 16 review and 40 retained closures. Use the original complete plan and preserve its source records. The four spacing corrections posted in the original thread may be applied to an explicitly selected successor plan before the first run; INPUT.json binds the actual selected bytes.

The driver retains the complete plan in inputs/analyst-plan.json and matches every recommendation to its original source record. It edits only assigned_team, priority, action and analyst_note in a new copy of the original GeoPackage. Existing asset, work-order and due-date references remain unchanged. The original city status and source content remain attached throughout.

After the actual 104-row return is received, the programme closes its browsers/desks, releases its operation lease and returns state awaiting-supervisor. This is a completed analyst handoff. It retains:

- inputs/supervisor-input.json: all 104 actual proposal IDs, original case records, authored recommendations, native proposals and exact return/workspace selection.
- downloads/boston-analyst-supervisor-workspace.json: the complete editable native workspace at that review point.
- The original analyst GeoPackage, returned GeoPackage, source files, saved browser requests and native return result.

OPEN311_GIS_SUPERVISOR_READY prints the actual paths, return/handoff IDs, workspace ID/revision, complete input SHA256 and 48/16/40 totals. The independent supervisor reads the full handoff and writes the selected private supervisor file. Copy the binding fields from that actual handoff and use its exact file SHA256:

~~~json
{
  "schema": "commons.open311.full-analyst-supervisor-selection.v1",
  "operationId": "boston-geographic-8e5f-20261012-01",
  "runId": "<actual runId>",
  "handoffId": "<actual handoffId>",
  "returnId": "<actual returnId>",
  "returnSha256": "<actual returnSha256>",
  "handoffSha256": "<SHA256 of complete supervisor-input.json>",
  "workspaceId": "<actual workspace.workspaceId>",
  "expectedRevision": 0,
  "reviewer": "<actual independent supervisor>",
  "note": "<the supervisor's complete decision note>",
  "decisions": [
    {"proposalId": "<actual proposal ID>", "choice": "accept"}
  ]
}
~~~

Replace expectedRevision with the actual workspace.revision. Supply exactly one accept or reject choice for every actual proposal. This programme selects the full 48 individually approved dispatch cases. Accepting a review or dismiss recommendation retains that internal analyst state; it does not change the city source status.

Resume the same configuration and physical output directory. The original request ledger first reconciles any retained native operations. The complete supervisor choices are received into the actual browser and retained in its original IndexedDB; the browser reloads and reopens those same choices before saving the native decision. The reviewed 48-case selection then continues across the original case pages through GeoPackage, GeoJSON, CSV, JSON and HTML dispatch exports, complete workspace receiving, CLI receiving, Merchant receiving and cold reopen. Every frozen source and original request result remains in the same customer handover.

Without analystPlan, the existing three-case commissioning programme remains available. A completed copied handover still uses the original inspect mode. Neither mode changes the original municipal data.
