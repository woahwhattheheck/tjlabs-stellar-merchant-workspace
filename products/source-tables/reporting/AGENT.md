# Reporting Programmes: agent and recipient operations

The installed Reporting Programmes provider lets an agent continue one complete Source Tables project through its existing reporting engine. It retains full SQL and definition history, actual provider observations, original CSV files, route receipts, browser review returns and complete native handovers. The same project remains usable through the browser workbench, installed CLI, Applications entry and JavaScript module.

The client in this directory gives each write an immutable local request and keeps its full source inputs before dispatch. It downloads exact retained outputs through the existing merchant file reader and resumable native writer. The host journals the original request and inputs before changing the selected project. These are two related custody records: the client's original selection and arguments, and the host's full request envelope.

## Open the original installation

Select the existing merchant MCP endpoint and configured Reporting Programmes workspace alias. The provider accepts explicit host input aliases; an agent cannot supply an arbitrary filesystem path or URL.

Select the existing merchant-provider-tools distribution contribution. Its installed initializer is:

~~~sh
starforge merchant-providers init reporting-programmes --options HOST_SETUP_JSON
~~~

The setup file contains the existing provider initializer fields:

~~~json
{
  "directory": "/absolute/private/merchant-reporting",
  "name": "Original reporting installation",
  "connection": {
    "schema": "stellar-forge.reporting-programmes-connection.v1",
    "workspaces": {
      "original": {
        "label": "Original reporting project",
        "directory": "/absolute/private/reporting-agent",
        "project": "/absolute/private/complete-existing-project.json",
        "inputs": {
          "request": { "path": "/absolute/private/exact-request.json" },
          "desk": { "path": "/absolute/private/complete-desk-handover.json" },
          "context": { "path": "/absolute/private/desk-context.json" },
          "returned": { "path": "/absolute/private/full-returned-project.json" }
        }
      }
    }
  }
}
~~~

Keep the store and source paths private and owned by the native operator. Store directories must exist with mode 0700. Omit project only when the workspace is intentionally awaiting a first create request or complete project receive. A previously opened store retains its selected project; changing the seed filename does not replace it. The initializer writes the standard merchant-mcp.json, release and customer-export configuration, including reportingProgrammesConnection. Continue through the original merchant-mcp lifecycle or stdio transport.

Use that installation's credential configuration. The original HTTP transport accepts HTTPS or its observed loopback endpoint. Supply the token through the existing environment variable; the client never puts it in a request journal, receiving manifest or guide.

~~~js
import { openReportingProgrammeClient } from './agent-client.mjs';

const client = await openReportingProgrammeClient({
  url: process.env.MERCHANT_MCP_URL,
  tokenEnv: 'MCP_ACCESS_TOKEN',
  workspace: 'original'
});
const selected = client.selection();
const current = await client.status();
const inputs = await client.readAll('inputs');
~~~

Retain selected.nativeId in the operator's private configuration for later sessions. expectedNativeId refuses a different store behind the same alias. The client also pins the exact endpoint string. A restarted provider gets a new open lifetime; call reopen() explicitly on the same native store before continuing a retained client object. Saved requests bind the stable store, so they remain recoverable after that restart.

An already authenticated caller may supply a client object with endpoint and call methods instead of a URL. That must be the original merchant transport returning structured tool results. The portable agent-client-core.mjs uses the same catalogue and identity checks; the installed agent-client.mjs adds actual native filesystem custody.

## Choose a complete original request

Use the original programme.mjs and desk-receive.mjs formats described in [REPORTING_PROGRAMMES.md](REPORTING_PROGRAMMES.md). The host does not infer missing SQL, source data, provider receipts or effective parameters.

| Input operation | Complete original source | Native result |
| --- | --- | --- |
| apply | Full create, define, run, source or delivery request | Existing engine applies that exact request |
| receive_desk | Full current desk handover plus recording context | Existing desk adapter receives definitions and full run snapshots |
| receive_project | Full returned Source Tables project | Original project identity and previous reporting observations stay preserved |
| export | Exact selected project SHA and chosen format | Complete project JSON or native ZIP retained once |

readAll('inputs') returns current complete file size, SHA256 and availability for each configured alias. The alias is a host selection, and its digest is a byte identity. A native projectSha256 is the engine's semantic project identity; it differs from the SHA256 of pretty-printed JSON.

Prepare one write against the actual selected predecessor:

~~~js
const current = await client.status();
const request = inputs.items.find(item => item.alias === 'request');
if (!request?.available) throw new Error('The original configured request is unavailable.');

const prepared = await client.prepare('apply', {
  input: 'request',
  expectedSha256: request.file.sha256,
  operationId: 'the-id-inside-the-original-request',
  expectedProjectSha256: current.project.projectSha256
});
const received = await client.execute(prepared, {
  directory: '/absolute/private/agent-operations/original-operation'
});
if (received.result.operation.state !== 'complete') {
  throw new Error(JSON.stringify(received.result.operation.error));
}
~~~

The operation ID must equal the ID inside the full native request. For receive_desk, it must equal the original context's ID. If the native request itself contains expectedProjectSha256, preserve it; the outer host guard does not rewrite the embedded native guard.

The client saves request.json, complete inspected input publications under inputs/, and inputs.json before invoking the mutation. It uses a private Linux lease for the operation directory. Every dispatch has a separate full entered record and result or error record. An error after the host may have committed is retained as an uncertain outcome with the original directory. A local write failure cannot become a success receipt.

The host may return a retained operation with state "failed" as a successful protocol response. Inspect the operation state, not just whether the transport call resolved. The original failed observation and full error stay in history. A changed intended request needs a distinct native operation ID; it must not overwrite the failed request.

## Record useful provider output

For a complete run, retain the actual provider run ID, query version, report and definition SHA, effective period and parameters, source snapshot description and entire original CSV. The original engine compares the reported count with the parsed table. Identifiers and exact decimal or integer text remain source values.

For a failed or truncated run, retain the original partial/error files and use reportedRows: null when the total was unknown. A partial file is useful source. It does not become a complete table because a transport call succeeded.

A route observation selects an existing actual run. Successful delivery needs its complete original receipt. A distinct destination attempt gets a distinct observation ID and links to the preceding attempt. Empty suppression uses the engine's suppressed-empty status and requires a complete zero-row result. Retain the original destination, route identifier and policy notes.

The reporting provider records these observations. Query execution, source credentials, calendar activation and recipient sending remain with the original commissioned provider and authorized sender. Follow the actual relationship and sender instructions when moving a prepared handover outside the internal case.

## Recover an interrupted original operation

Keep the original operation directory. Do not edit its arguments to the latest project hash.

~~~js
const original = await client.operation('the-original-operation-id');
const recovered = await client.recover({
  directory: '/absolute/private/agent-operations/original-operation',
  expectedRequestSha256: original.operation.requestSha256
});
~~~

expectedRequestSha256 is optional if the caller has not received it. Recovery still downloads the full retained host request publication, verifies its file bytes and canonical envelope SHA, and compares the entire original tool arguments, operation kind, predecessor, input roles, aliases and input file hashes with the saved client request. An unrelated operation with the same ID cannot be selected merely because its ID matches.

The local clientRequestSha256, host requestSha256 and request publication's file SHA256 have different purposes. The first binds local endpoint/store/tool/arguments; the second binds the canonical complete host envelope; the third checks the actual complete retained JSON bytes.

Exact recovery happens before the old current-project guard. If the original operation already completed and later work exists, it returns that original outcome while preserving the current project and all later history. The original output publication remains available. Recovery does not substitute a newer output or repeat an external provider run.

If the host returns REPORTING_OPERATION_NOT_FOUND, it has no retained operation under that ID. client.replay({directory}) is the explicit continuation for dispatching the exact saved tool arguments. It reuses the retained local input publication selection. The engine may reject the original predecessor if another operation advanced the project; retain that outcome and prepare a distinct deliberate operation against the current source. Never silently rebase the saved request.

If a configured input path changed after the host retained a request, use recovery. The retained original source bodies remain selected. If dispatch never happened and the host alias changed, the original hash guard refuses a new file under the old request.

## Download the complete selected handover

Prepare an export at the actual current project identity:

~~~js
const current = await client.status();
const prepared = await client.prepare('export', {
  operationId: 'handover-original-1',
  format: 'native',
  expectedProjectSha256: current.project.projectSha256
});
const outcome = await client.execute(prepared, {
  directory: '/absolute/private/agent-operations/handover-original-1'
});
if (outcome.result.operation.state !== 'complete') throw new Error('Inspect the retained export outcome.');
const publication = outcome.result.operation.publications.find(item => item.format === 'native');
const downloaded = await client.download(publication.publicationId, {
  directory: '/absolute/private/recipient-handover'
});
~~~

The project format returns complete project JSON; native returns the full native ZIP. Each publication has an immutable ID and exact original filename, byte count, SHA256 and media type.

The client adapts that publication into a **local receiving manifest**, marked stellar-forge.reporting-agent-file-receiving.v1. It records the actual endpoint, native store and publication. It is not a server-issued receipt. The existing merchant downloader performs the transfer with bounded chunks, exact offsets and read identities, private partial files, durable checkpoints, prefix revalidation and final full-file SHA verification.

Repeat download() with the same publication ID and directory after interruption. Completed files are verified; changed existing files are refused. An expired read resumes the same original publication and SHA at the saved offset. It does not rerun an exporter or regenerate the ZIP. The reader allows at most 196,608 bytes per chunk. The underlying retained publication ceiling is 8 GiB; original programme/source-file limits still apply during authoring.

The output directory contains the exact original file and local receiving manifest. Preserve both. Use a different directory for a different publication even if its original filename is the same.

## Return the project through the browser

Export and download the full project. Save the browser's current complete workbench file before opening it, because that file also owns unfinished forms, pending operations, original file choices and local edits outside the domain project.

Open the downloaded project in the installed Reporting Programmes workbench. For table-level review, follow the existing Source Tables route: export the full project, open it at the same installation's /source-tables.html, finish the actual table/review work, and export the complete returned project.

Declare that return as the host's original returned input. Inspect its full byte SHA, prepare receive_project against the host's actual current project, then execute through its own private journal. The operation checks original project and programme identity and preserves earlier definitions, runs, deliveries, reporting files and operations. It also retains original source-table editions/reviews and the complete predecessor. Conflicting reporting history needs explicit source reconciliation by its original owner.

Keep the preceding complete workbench file beside the returned project. Reopening a domain project cannot recreate unfinished browser forms that were never in it. Use the [workbench operating guide](WORKBENCH.md) for pending-request restoration, local save conflicts and full working-file custody.

## Run the complete installed local course

The course writes seven complete local request originals: create, complete run, unknown-count failure, failed route, linked successful route, complete empty run and empty suppression. It retains the original SQL, full CSVs and explicit local receipts. These are named local fixtures with no external service or recipient action.

~~~sh
node products/source-tables/reporting/examples/agent-course.mjs \
  prepare-local /absolute/private/reporting-course http://127.0.0.1:8788/mcp
~~~

The generated connection.json is the connection object for HOST_SETUP_JSON above. Load it through the existing initializer/provider configuration. Set MCP_ACCESS_TOKEN in the original operator environment. Run:

~~~sh
node products/source-tables/reporting/examples/agent-course.mjs \
  run /absolute/private/reporting-course/course-plan.json \
  /absolute/private/reporting-course-receiving
~~~

The course uses exact generated alias/hash pairs, selects each actual host predecessor, retains every request and full outcome, downloads the original project and native ZIP, reopens JSON through openProgramme, and saves complete history and publication pages. reference-project.json is a local engine reference; native table identities are created by the actual host, so the runner records its actual project identities.

Continue an interrupted course with the same plan and directory:

~~~sh
node products/source-tables/reporting/examples/agent-course.mjs \
  resume /absolute/private/reporting-course/course-plan.json \
  /absolute/private/reporting-course-receiving
~~~

Resume reads each saved original request first. A retained host operation is recovered after complete envelope comparison. An operation absent from the host is explicitly replayed with its saved original arguments. New steps are prepared only when their original journal has not been created. Original outcomes and later history remain intact.

The same runner accepts a private plan selecting real complete request, desk/context and returned-project aliases. Use actual source fingerprints and original observation IDs. Keep customer files in their original private project location. The public course and distribution contain generic source and explicitly named local fixtures.

## Finish the receiving session

Read complete history and publications pages at the normal source boundary. A changing collection is reported; reselect its current edition rather than accepting an incomplete first page. Give the recipient the full intended project/archive and actual original source/definition context, then record the real review return or route outcome in the same project.

close() refuses new client work and waits for all admitted complete request, recovery and download promises before closing its original remote instance. If closing fails, retry that same close; its closing state remains selected and new work stays refused. Reopen only after closing succeeds. An idle open client may also explicitly reopen after an external provider restart, selecting the same stable native UUID. A reopen cannot interrupt an admitted request or file transfer. Await the complete operation before calling close from your own progress or result handling.

Closing remains explicit because the provider may serve another part of the same current operation. Preserve the active owner's receiving/browser work before closing its lifetime. Every original journal and publication remains available after reopening.
