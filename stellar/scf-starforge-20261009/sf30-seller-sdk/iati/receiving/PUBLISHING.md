# Complete participant publishing receiving through the installed IATI application

This procedure opens the same publisher work, historical source editions and independently received release in the real installed IATI application. It joins the original Python participant workflow to Applications, the browser, the typed client, the source MCP tools and the native CLI. It returns one complete customer ZIP after both saved Applications have stopped.

The ordinary customer workflow is described in [Participant publishing](../PUBLISHING.md). The source and methodology notices are in [Publishing sources](../PUBLISHING_SOURCES.md). This receiving procedure uses those original operations and retains their full results. It does not publish XML to an external publisher account or submit an Aid Transparency Index response.

## What the complete run demonstrates

The caller supplies one complete public publisher file, one explicit cohort and the reviewed feedback/correction inputs. The unchanged original Python receiver:

1. Retains and hashes the whole publisher XML, or reconstructs that same complete XML from its selected gzip and acquisition receipt.
2. Creates the original participant work with the supplied publisher reference, cutoff and activity IDs.
3. Imports every selected feedback row and supporting evidence file.
4. Applies explicit corrections to selected original XML fields. The native correction engine preserves the original baseline and untouched source bytes.
5. Saves a resolved or deferred decision, named owner, rationale and evidence selection for every original finding.
6. Builds the paired baseline/candidate finance through the original IATI portfolio and dataset engines.
7. Uses a separately named reviewer, then creates the immutable release.
8. Exports the full release ZIP, receives it into one separate native workspace, repeats the same import and reopens it after closing the original database.

The installed JavaScript receiver verifies that complete result through the real product:

- The selected runtime is an actual READY installation, with the original zero-dependency operator profile, lock, installation receipt and complete source manifest.
- The full native CLI reads the baseline, corrected and released revisions, every selected activity's complete original XML fields, the paired finance and the full release archive.
- The original Applications controller saves two named IATI entries for the existing source and received workspaces. The original provider starts them, verifies their authenticated listener and offers Open through the application library.
- The typed client and MCP read every historical revision and selected activity/field page. Original create, correction and release requests are replayed with their existing request IDs and complete bodies. The native engine returns those same historical results while retaining the latest work.
- The original MCP retained reader downloads the full release ZIP. It commits and fsyncs a prefix, releases the read, closes and reconnects the adapter, then resumes and checks the complete original size and SHA256.
- Authenticated HTTP, the browser and native CLI each return the same complete release. Whole baseline and candidate XML downloads retain activities outside the selected cohort.
- The browser opens release, feedback, review and handover at desktop and mobile widths. It opens the baseline and corrected revisions and reads their exact original fields after the later release already exists.
- The received workspace replays the full packet through typed HTTP, generic MCP import, the browser file input and the native CLI. Its complete history and paired finance remain unchanged.
- Both Applications stop. The received one starts under the same saved Application identity, and the browser/client reopen the original release/history before final Stop.

An unchanged finance result is valid when explicit corrections affect narrative or evidence fields. The receiver compares complete native outputs and does not manufacture a financial change or a better assessment score.

## One caller, original installation and complete resource scope

The caller owns one admitted native operation, full source acquisition and installation, existing browser/Python dependencies, resource budget and durable output saving. This module starts no scheduler, acquires no worker or SDK, obtains no credentials and sends no commercial messages.

Use the maintained source and runtime producer. The existing prepareIatiOperatorRuntime implementation is at:

stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/runtime.mjs

Its [runtime guide](RUNTIME.md) describes the complete selected Git source, original buildDistribution, preparation/install recovery and final READY inspection. Select a current edition containing the whole participant publishing directory, all validation schema/license files, shared typed/MCP/browser joins and both receiving files. A fabricated READY manifest is rejected.

The supported installation profile is native:false, features:[], operator:true with zero package dependencies. The actual original Python/XML validation engine, existing Chromium and Playwright remain real execution dependencies. The caller declares the complete source/install, workspaces, publisher files, ZIPs, Python validation/finance, two original IATI servers, Applications server, MCP/CLI and Chromium in one native resource envelope. The browser starts only after the core and initial CLI checks complete.

## Complete callable interface

~~~js
import { runIatiPublishingReceiving } from
  '/absolute/installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/publishing.mjs';

const result = await runIatiPublishingReceiving({
  coreInputFile: '/absolute/operation/input/participant-core.json',
  outputDirectory: '/absolute/operation/installed-receiving',
  sourceRoot: '/absolute/selected/source',
  runtimeDirectory: '/absolute/operation/runtime',
  operationId: 'pwyf-installed-participant-receiving',
  actor: {
    id: 'named-receiving-operator',
    label: 'Named participant receiving operator'
  },
  pythonExecutable: '/absolute/existing/python3',
  chromiumExecutable: '/absolute/existing/chrome-headless-shell',
  playwrightModule: '/absolute/existing/playwright/index.js'
});
~~~

All paths are canonical and absolute. The actual installed source is compared with the complete selected product, adapter, native operator and schema files before any workspace opens. Execute this callback and its original browser helper from that same selected installation.

The coreInputFile is the complete, already-authored input for the original Python receiver. The wrapper derives no replacement cohort, correction set, feedback table, reviewer or request identity. It invokes the original core as:

~~~bash
python3 -B /absolute/installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/publishing.py \
  --input /absolute/operation/input/participant-core.json
~~~

The core input's sourceRoot selects the actual installed source. Its workspaceDirectory, receivedDirectory and outputDirectory are separate private directories. The JavaScript outputDirectory is separate from all three, with none nested under another.

The outer operation ID is stable and distinct from the core operation ID. The core limits its ID to 90 characters for original request naming. Its actor and reviewer are distinct named strings; the outer actor is the receiving identity object shown above.

## CLI entry point

The CLI consumes the original runtime preparer's full READY result and one outer input:

~~~bash
node /absolute/installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/publishing.mjs \
  --input /absolute/operation/input/installed-receiving.json \
  --runtime-ready /absolute/operation/runtime-ready.json
~~~

The outer JSON contains only:

~~~json
{
  "coreInputFile": "/absolute/operation/input/participant-core.json",
  "outputDirectory": "/absolute/operation/installed-receiving",
  "operationId": "pwyf-installed-participant-receiving",
  "actor": {
    "id": "named-receiving-operator",
    "label": "Named participant receiving operator"
  },
  "pythonExecutable": "/absolute/existing/python3",
  "chromiumExecutable": "/absolute/existing/chrome-headless-shell",
  "playwrightModule": "/absolute/existing/playwright/index.js"
}
~~~

The runtime file is the real prepareIatiOperatorRuntime output: state READY, sourceRoot, runtimeDirectory and exact 40-character Git sourceCommit. The CLI verifies that the original installed profile/source still matches before receiving. It creates no installation.

Success emits one complete JSON result on stdout. Failure emits a bounded error on stderr and exits nonzero; the complete original logs, selections and attempted outputs remain under the selected private directories.

## Original core input and explicit decisions

| Field | Complete original selection |
| --- | --- |
| operationId | Stable domain receiving operation. |
| sourceRoot | Actual installed repository source root. |
| workspaceDirectory | Original participant source workspace. |
| receivedDirectory | One separate workspace receiving the complete original release. |
| outputDirectory | Private original core output directory. |
| publisherFile | Complete original XML or exact retained gzip. |
| publisherReceipt | Absolute path to the full acquisition receipt with original XML bytes and SHA256. |
| publisherRef | Exact reporting organisation reference. |
| activityIds | Explicit cohort of 1–100 original identifiers. |
| cutoff | Explicit original reporting cutoff. |
| actor, reviewer | Distinct named operator and independent reviewer. |
| feedbackFile, feedbackSha256 | Whole original feedback CSV and exact hash. |
| corrections | Complete explicit original XML field selections and intended changes. |
| findingDecisions | Exactly one resolved/deferred decision per original finding. |
| scopeNote, correctionNote, reviewNote, releaseNote | Complete scope and review rationales. |

Optional name identifies the work to the customer. Optional evidenceFiles contains path, sha256, label, media and sourceUrl for each complete original evidence file.

Each finding decision contains findingId, status, owner, note and evidenceIndices. Status is resolved or deferred. Evidence indices select the exact supplied evidence list. The core rejects omitted or extra findings, unknown evidence, missing rationale and a same-person review. Deferred findings remain visible.

The source owner supplies the actual complete FCDO publisher and notice. If the input selects the WADI parent and three original children, those four exact IDs remain the cohort throughout correction, finance, receiving and historical reads. The full publisher XML is retained separately from the cohort. All counts, native finance and validation results come from actual execution.

## Retained completion and service cleanup

The complete customer bundle intent retains the original stopped-Applications summary and every selected member hash before the summary file is published. A retry with that intent, or an earlier retained complete summary, verifies the original observations before any browser leg can run again. It completes the same archive and cleanup using those saved observations. Private screenshots remain in the operator directory and never enter the customer ZIP.

MCP startup owns its adapter and listener until initialization, tool discovery and authorization checks finish. A startup failure closes those same resources. Close always destroys the original sockets and finishes listener shutdown even if adapter cleanup fails; a later close can retry the remaining adapter cleanup.

Historical fields retain their full activity and XML values. Baseline, corrected and released reads bind the envelope to the selected project, revision and candidate source before comparing the unchanged original field body.

## Durable selection, replay and interruption

The wrapper leases its output through the original kernel state lease. Its selection.json retains the complete core input identity, supplied source/evidence files, selected product/schema bodies, callback/browser source, actual READY profile/lock and execution paths. A different source, input, file or operation cannot silently reuse it.

The Python core has its own output lock and immutable selection.json. Each complete action request is selected before execution. The same request ID and body returns the original revision. Its durable COMPLETE result is reused only after the complete selection and all returned original file identities match.

The core's gzip continuation preserves an interrupted original file. A complete temporary matching the whole XML receipt can be promoted; a partial or changed temporary is retained with its original hash and custody record before reconstructing the same gzip. Those source attempts remain in the returned core file list.

Once the original core result is durably COMPLETE, wrapper retries do not rerun it. Saved Applications review/save/start identities and original operation IDs remain in progress.json. Recovery and Stop use only the original selected Applications.

CLI and packet processes retain exact argv, stdout, stderr and terminal observations. Downloads retain their committed offset and original native export hash. The actual deliberate interruption reconnects the same adapter and completes that original file.

Browser receiving imports the same full release into the existing detached receiver. Create/correct/release replay uses already-recorded complete requests and checks their original historical results. The current release and every previous revision must remain identical.

The complete product result is saved in completed-workflow.json before cleanup. If shutdown fails afterward, the same operation verifies that completed result and all files, finishes the original owned cleanup and publishes result.json. It does not rerun the core or make another customer report to recover a shutdown error.

Retain the private outputs and workspaces until the caller has durably saved and independently verified them. The module implements no cloud upload retry protocol. Any uncertain external saving outcome stays with the original supported save operation.

## Full result and customer ZIP

The final result.json schema is stellar-forge.iati-participant-operator-receiving.v1. State COMPLETE means the whole workflow, complete archive and original service cleanup succeeded.

The result retains:

- Original outer/core operations, named actor, source/profile/lock identities and selectionSha256.
- Whole publisher identity, publisher reference, cohort, participant/release IDs, baseline/candidate hashes and full history length.
- Exact paired native finance and the detached receiver's original import result.
- Complete MCP, HTTP, browser and both CLI release identities; committed-prefix interruption; full baseline/candidate XML.
- Actual browser errors and private desktop/mobile screenshot identities.
- Both saved Applications in STOPPED state.
- customerHandover with absolute path, bytes, sha256 and member count.
- files with absolute path, bytes and sha256 for complete original files.
- completedAt and the completed stage names.

The caller verifies every complete selected file before recording completion or saving the delivery. Additional Git blob metadata in descriptors is diagnostic; original byte count and SHA256 remain the complete-file binding.

IATI_Participant_Complete_Customer_Receiving.zip contains:

| Folder | Complete contents |
| --- | --- |
| customer | Original release ZIP, native manifest and every verified expanded native member. |
| publisher | Whole original XML, selected XML/gzip and original acquisition receipt. |
| inputs | Full core configuration, feedback CSV and each evidence file. |
| receiving/core | Original selection/result, every action request/result, finance, validation/history/receiving/reopen records and source attempts. |
| receiving/reads | Complete typed/MCP historical pages and original request/result observations. |
| receiving/cli | Complete original CLI requests and JSON outputs. |
| receiving/downloads | Full verified publisher and release downloads through the exercised interfaces. |
| guides | Product, source and full installed receiving guides. |
| operator | Whole original Python core, this JavaScript receiver and original browser helper. |
| manifest.json | Every path, byte count and SHA256, full project/source and operation identity. |

The native packet is streamed, checked and extracted with its full manifest. The final customer ZIP is staged, fsynced and verified before publication. The same completed selection is checked and reused; partial attempts remain retained.

Screenshots, private console URLs, authentication material and connection files remain private QA/receiving artifacts. The customer ZIP retains the full original source data, evidence, review rationale, finance and exported work.

## Continue with the delivered work

Open customer/expanded/release.html, the complete feedback CSV, correction records, validation report and native finance archive. Compare the full original/candidate XML with their hashes and retained methodology notice. Every finding includes its decision, owner, rationale and evidence, including deferred findings.

In the installed application, open participant publishing and select the received work. Use its history to inspect an earlier revision's complete original fields; return to current work before editing. A new customer change uses a new explicit native action with the current expected revision. Original completed receiving requests remain immutable history.

The same application can receive the original release ZIP again. Receiving verifies whole source, original transitions, independent review, schema validation and paired native finance before publishing the domain work. Matching only the visible latest summary is insufficient.
