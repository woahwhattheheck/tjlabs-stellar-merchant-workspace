# Transport Planning Workbench

Transport Planning Workbench installs one complete operating-source, service, performance, scenario, action and reporting workflow. The privately supplied original application owns its SQLite workspace, command journal, intake, evaluator, publications and archive readers. The generic Merchant integration supplies reviewed Applications lifetime, declared customer-agent inputs, full response retention, portable preparation and independent receiving.

Use this guide with PREPARING.md and RECEIVING.md from the same selected product. Public adapter source is distinct from the customer's full original application, operational data, case authority and commercial terms. Keep the latter in existing authorized private custody. This guide makes no claim that a customer's original native programme has run or that a planning report has been accepted.

## 1. Responsibilities and a complete edition

Before operating, identify the source owner, responsible transportation planner, named staff profiles, reporting periods, services, units, reviewer and intended recipients. Specify what constitutes a complete baseline or recurring edition, who can approve it, and the actual source and recipient custody. Preserve the original equipped native operation and its source selections.

The complete workflow is:

1. Retain original service and source documentation, full operating CSVs, provenance, field mappings, units and coverage.
2. Preview and import the whole source; preserve original and corrected source-family editions.
3. Review selected service-rule revisions and their effective dates.
4. Publish performance from the intended validated source editions and period.
5. Author explicit scenario assumptions, exact cost lines and accountable actions.
6. Review/publish scenarios, dependency-complete plans and source-linked report editions.
7. Download full recipient outputs and full editable workspace/application archives.
8. Receive independently through the original readers, operate the received application and cold reopen.
9. Record actual acceptance through the existing Workshare and Installation.

An original delivery_record is an authored record. It does not send a report or establish that a recipient opened or accepted it. Source publication, a passing schema, a rendered report and business acceptance are separate observations.

The original named profiles are staff attribution, not new authorization roles. The installed agent uses its launch-selected actor. The original browser retains its own named-profile selector and native command semantics. A legitimate configure command may change the workspace label or profile list; fixed workspace/source identity still controls the installed attachment.

## 2. Install the generic product and select private source

Select the maintained distribution selection:

~~~text
stellar/scf-starforge-20261009/distribution/selections/transport-planning-workbench.json
~~~

Its contribution includes the whole generic adapter, preparation, Applications provider, customer-agent tools, operating/receiving guides, Installation profile and grant chapter. It also composes the existing grant-workspace, merchant-provider-tools and Merchant console assets. Use the existing Installation build/receive route to materialize that selected product. Its four registered commands are:

| Command | Purpose |
|---|---|
| transport-planning-workbench | Invoke the unchanged original command line with reviewed source/workspace/runtime selection |
| transport-planning-workbench-prepare | Prepare, inspect, export and independently receive full private source with actual Python/Node observations |
| transport-planning-workbench-managed | Run the original application under managed Applications |
| transport-planning-workbench-receive | Run/adopt the complete same-owner installed receiving course |

The adapter runs under the selected Merchant Node runtime (Node 24 or newer). The original application separately requires Python 3.12 or newer and Node 18 or newer. Preparation observes the actual selected executables and imports the actual source. A similarly named executable or an old host receipt is not its identity.

Supply the entire authorized original application as a private directory and a literal authority file:

~~~json
{
  "schema": "stellar-forge.transport-planning-workbench-source.v1",
  "files": [
    {"path": "relative-original-source-path", "bytes": 1234, "sha256": "<full-lowercase-SHA256>"}
  ]
}
~~~

This is an abbreviated shape illustration, not an installable manifest. The actual manifest must enumerate the complete original source, match every byte and match the original delivery.py SOURCE_FILES declaration. Preserve all modules, evaluator, catalogues, web assets, documentation, license and internal original source manifest. Compute the SHA of the literal external authority, including its actual final newline. The public source-manifest.schema.json describes this external shape; it does not confer permission to redistribute source or case data.

No private source body, client name, case pin, operational row, private correspondence, credential or commercial term belongs in the generic public package. The private source transfer and native operating archives remain complete and usable through authorized private custody.

## 3. Prepare and independently receive the runtime

Create a private preparation parent outside the installed Merchant source, original source and customer workspace. Select explicit absolute Python and Node executables. Retain the actual invocation path where it matters; do not replace a prepared interpreter with a guessed relocated path.

For installed command dispatch, the following equivalent module calls show the exact preparation arguments:

~~~sh
node products/transport-planning-workbench/prepare.mjs prepare \
  --directory /srv/private/transport-preparation \
  --python /usr/bin/python3.12 \
  --node /usr/bin/node \
  --source /srv/private/transport-source \
  --source-manifest /srv/private/transport-authority.json \
  --source-manifest-sha256 FULL_AUTHORITY_SHA256

node products/transport-planning-workbench/prepare.mjs inspect \
  --directory /srv/private/transport-preparation \
  --python /usr/bin/python3.12 \
  --node /usr/bin/node

node products/transport-planning-workbench/prepare.mjs export \
  --directory /srv/private/transport-preparation \
  --python /usr/bin/python3.12 \
  --node /usr/bin/node \
  --output /srv/private/transport-source-transfer.zip

node products/transport-planning-workbench/prepare.mjs receive \
  --directory /srv/private/transport-independent-runtime \
  --python /usr/bin/python3.12 \
  --node /usr/bin/node \
  --archive /srv/private/transport-source-transfer.zip \
  --archive-sha256 FULL_TRANSFER_SHA256
~~~

Use actual paths from the selected host; these illustrative executable paths are not claims that those binaries are installed. Python and Node are required on all four preparation actions. Use PREPARING.md for exact recovery and archive selection. Preparation verifies all original source and retains full actual command observations for both runtimes. It does not construct a workspace, start an application or fabricate evaluator results.

The returned PREPARED record is stored at the preparation directory's .preparation/PREPARED.json and has schema stellar-forge.transport-planning-preparation.v1. Use its exact primary or receiving descriptor:

~~~text
applicationDirectory
sourceManifestFile
sourceManifestSha256
python
node
~~~

The runtime field retains the full Python and Node observations. Use these returned fields when creating launch configurations; never synthesize a second host's source directory or copy the first host's runtime observation and label it independently received. The private source-transfer archive carries full original source and literal authority plus actual command observations. It is distinct from native recovery and application ZIPs exported from an operating workspace.

## 4. Review, save and start Applications

Place launch and connection files in a private control directory beside the original workspace and source. The selected workspace may already contain the original saved operating history. Preserve that directory and its original ID. A new workspace is deliberate and may receive an initial workspaceName; later original configure commands remain authoritative.

Construct launch JSON from the returned preparation fields:

~~~json
{
  "schema": "stellar-forge.transport-planning-workbench-launch.v1",
  "directory": "/srv/private/transport-workspace",
  "applicationDirectory": "<PREPARED.primary.applicationDirectory>",
  "sourceManifestFile": "<PREPARED.primary.sourceManifestFile>",
  "sourceManifestSha256": "<PREPARED.primary.sourceManifestSha256>",
  "connectionFile": "/srv/private/transport-control/connection.json",
  "python": "<PREPARED.primary.python>",
  "node": "<PREPARED.primary.node>",
  "actor": "Transportation planner",
  "workspaceName": "Transport planning",
  "port": 0
}
~~~

Use real returned values instead of angle-bracket placeholders. actor is the exact selected original staff profile, not a new role system. directory, source and control paths must be canonical owned paths with the original private controls. Keep the whole launch file private.

In maintained Applications, choose kind transport-planning-workbench, select this private configuration, Review, Save and Start. Preserve the reviewed configuration SHA and saved application ID. Review observes actual source/executable selections; Start owns the original listener, workspace and connection until actual closure. An accepted queued operation remains owned while it is queued.

The equivalent managed command uses:

~~~sh
node products/transport-planning-workbench/managed.mjs \
  --configuration /srv/private/transport-control/launch.json \
  --configuration-sha256 FULL_LAUNCH_SHA256
~~~

The managed entry also accepts a selected port override. Its startup uses schema stellar-forge.transport-planning-workbench-startup.v1 and status TRANSPORT_PLANNING_WORKBENCH_READY. Keep the returned launchId and actual private opening route. The managed process record uses schema stellar-forge.transport-planning-managed-process.v1 and states prepared, starting, ready and closed. Final successful managed closure returns status CLOSED with that launchId.

Open the original browser through Applications or the browser tool. The private bootstrap consumes its bearer fragment and establishes a private HttpOnly SameSite session before serving the unchanged original application. Do not publish, copy into ordinary input or retain the capability as a customer artifact. Native controls and downloads continue to use the original application. Reopening a connection after another launch requires explicit attachment to that new launch; never silently repeat a mutation.

Applications Stop closes the managed owner. Await the actual terminal controller and positive original command closure, or a bound cancellation that never launched. Queued, interrupted, unavailable and unknown states do not prove closure. Follow the actual receiving course's retained closure records; do not launch a competing writer because the browser closed or a request timed out.

## 5. Source intake and corrections

Retain full original documents and CSVs with original filenames, MIME, URLs, retrieval dates and locators. Preserve the raw UTF-8 CSV bytes, including a BOM when supplied. Original parsing can account for that BOM, while source identity still binds the full original bytes.

CSV intake supports trip, coupon, cost and observation. The original limits are 32 MiB,100 columns and 100000 rows. A preview intentionally returns at most 40 rows and 100 errors/duplicate/conflict items; it is not a full source substitute. Inspect the complete retained file and imported record pages when assessing the whole population.

Choose original mappings and defaults explicitly. Keep service/unit definitions, reporting periods, record and rider namespaces, and missing coverage. A corrected source edition selects the existing family and its current predecessor. Do not delete the old source or silently reuse its identity for changed bytes. Original validation and revision conflicts remain visible.

Record reads expose full original record/history metadata and a page of saved dataset rows. Follow the returned count/offset through all pages, with at most 1000 rows per call. The workspace overview is deliberately compact; full native source/history/events/commands belong in the recovery/application archive.

Original documents may contain up to 64 MiB of source bytes; the original text alternative has its own 8 MiB bound. The agent add_document route carries full declared file bytes and preserves the declared original filename and MIME. JSON transport supports 96 MiB; encoded documents and complete command bodies must still fit this actual original HTTP boundary.

## 6. Rules, performance, scenarios and reports

A service-rule review binds the selected governing service revision and date. Inspect actual eligibility, geography, booking, availability, unit and fare definitions before interpreting data. The installation does not infer transport policy from a label.

Keep trip legs distinct from round trips and coupon books distinct from vouchers. Use explicit rider namespaces to prevent unrelated provider identifiers from being combined. Published aggregate observations are not evidence of current operating cost or current ridership. Unknown timing, coverage or rider fields remain unknown.

Select one validated source edition per source family and the intended complete period before publishing metrics. Inspect denominators, units, included rows and exclusions. Do not add incompatible units or treat missing operating rows as zero activity. Cost per unit requires compatible period, cost coverage and delivered-unit definition.

The original scenario engine handles integer-cent costs and explicit numeric assumptions. Keep native precision and bounds; do not replace money arithmetic with browser floating-point approximations. Label every proposed assumption, selected service/rule/source edition and reviewer. Scenario publication is a native edition with its own selected inputs.

Actions retain owner, due date, dependencies, effort/cost, source references, status and completion evidence. Publish a plan only with its required dependencies. Report editions bind selected source, performance, scenario and action references. Preserve limitations and source links in the outgoing full JSON, CSV, HTML and ZIP editions.

Do not translate a scenario into a claim that a service has changed. Do not translate a delivery record into proof of external transmission. Planner and recipient judgments remain authored and attributable.

## 7. Attach the customer agent

Create a private host-alias JSON. The same original listener may be stopped while this configuration is created. Complete ordinary inputs are declared by full SHA, bytes, original filename and MIME. Receiving destinations select fresh independent paths outside source and workspace.

~~~json
{
  "schema": "stellar-forge.transport-planning-host.v1",
  "workspaces": {
    "planning": {
      "label": "Transport planning",
      "directory": "/srv/private/transport-workspace",
      "connectionFile": "/srv/private/transport-control/connection.json",
      "inputs": {
        "operating_csv": {
          "label": "Complete selected operating export",
          "file": "/srv/private/transport-inputs/operating.csv",
          "sha256": "<full source SHA256>",
          "bytes": 1234,
          "filename": "operating.csv",
          "mediaType": "text/csv"
        }
      },
      "destinations": {
        "independent": {
          "label": "Independent recipient",
          "directory": "/srv/private/transport-received"
        }
      }
    }
  }
}
~~~

The sample input must be replaced with the actual whole file identity; it is not a supplied fixture. To receive an operating archive, declare that full archive as another input with its actual ZIP MIME/filename/SHA/bytes. Launch, connection, authority and capability files are private control material and cannot be ordinary agent inputs.

Initialize the existing Merchant host from the selected product module:

~~~js
import { initializeTransportPlanningMerchant } from './products/transport-planning-workbench/setup.mjs';

const result = await initializeTransportPlanningMerchant({
  directory: '/srv/private/transport-merchant',
  connection: '/srv/private/transport-host.json',
  name: 'Transport planning operator'
});
console.log(result.configuration);
~~~

This prepares the private Merchant configuration and release store. It does not start another application. The returned Merchant configuration selects transportPlanningConnection; the provider normalizes it into config.transportPlanning. Run the original merchant-mcp or merchant-mcp-stdio command against this configuration using the maintained host's documented transport.

All tool names start merchant_transport_planning_. The catalog contains 21 tools:

| Suffix | Contract |
|---|---|
| connections | List declared installations, complete input identities and destination aliases |
| connect | Attach selected workspace, optionally binding expectedLaunchId |
| disconnect | Close this client's attachment and readers for its exact launchId |
| info | Retain complete original installation/runtime/workspace identity |
| browser | Return private opening route; never retain its capability as an artifact |
| state | Retain compact original workspace overview/configuration/record selections |
| catalogue | Retain five original service/source/metric/site/observation catalogues |
| record | Full record/history metadata plus dataset page, offset and limit<=1000 |
| preview | Original inline CSV preview with kind, mapping and defaults |
| preview_input | Same preview from complete declared sourceInput and expectedSourceSha256 |
| command | One original command with stable requestId and full payload |
| command_input | Full declared JSON {id?,command,args?}; optional id must match requestId |
| import_csv | Native dataset_import with complete declared CSV and original payload |
| add_document | Native document_add with complete declared file, original name and MIME |
| receive | Exact application/recovery archive and declared independent destination |
| artifact | Whole source/document/edition/guide/recovery/application artifact |
| files | Page retained file descriptors belonging to current original authority |
| file | Full byte ranges using fileId, expectedSha256, readId, offset and limit |
| file_release | Close one actual retained reader |
| file_inspect | JSON pointer/page navigation within 32 MiB, at most 50 items |
| requests | Retained exact host requests and all observed full native HTTP responses |

The original 12 commands are configure, document_add, dataset_import, service_save, service_review, metric_publish, scenario_save, scenario_publish, action_save, plan_publish, report_publish and delivery_record. Payloads are the unchanged original args; use the selected source's guide and saved original records for their full fields. The adapter does not invent a parallel plan, metric or report engine.

Each mutation preserves exact request.id, command, args and host actor before dispatch. The original SQLite transaction validates the full request, commits the effect and stores its result. Identical replay returns that original result, including after later edits or a legitimate configuration/profile change. A changed body under the same ID conflicts. Keep the same ID and literal original args when resolving a missing acknowledgement.

requests exposes all retained observations. HTTP_OBSERVED means a full HTTP response was retained, not a replacement business judgment. An observed exact-request success takes precedence over failed observations; an explicit same-command retry can recover after a failed response through the original atomic journal. Hash-sorted observation filenames do not establish chronological order. A network failure may leave dispatch uncertain; preserve the original request.

## 8. Complete artifacts and receiving

Artifact kinds are source, document, edition, guide, recovery and application. Source/document/edition select their original recordId. Edition formats are zip, html, json or csv. Bind expected SHA/bytes and original filename when known. Follow file ranges to EOF and verify the complete digest. The maximum inline range is 196608 bytes. JSON inspection is navigation, not a truncation of stored original bytes.

The original application and recovery downloads create a consistent native snapshot at actual dispatch. There is no invented caller revision CAS. Archive transport streams complete bytes with safe integer accounting and disk-space constraints; do not impose an invented smaller original total-size ceiling. Separate exports may differ in packaging metadata, so compare the full decoded inventory and selected workspace revision when byte equality is not an original contract.

Application ZIPs retain the original complete source and, when present, full operating recovery. Recovery ZIPs retain the complete native workspace, source blobs, publications, history, events and saved commands. Use the corresponding original reader. Do not feed an arbitrary outer customer handover ZIP to a native reader without selecting its exact native inner archive.

Receiving creates an independent target. The receive tool preserves its exact selected archive and destination before dispatch. If acknowledgement is uncertain, preserve the same target and inspect its actual native output. The tool does not blindly re-run fresh-directory receiving, overwrite an existing workspace or silently select a replacement destination. Original command replay and fresh-directory archive receiving are different contracts.

The installed receiving course reuses the original equipped programme and its complete source/results. It opens the actual original application, performs real controls and explicit technical local edits, exercises exact command replay and full customer-agent file transport, exports a complete onward application/recovery and independently receives/cold reopens. It never relabels a source-only installation as a completed native planning programme. RECEIVING.md supplies the exact selected request/result and operator opening steps.

## 9. Original CLI and closure

The wrapper selects reviewed launch configuration and the unchanged original manage.py. It binds original source/workspace, actual Python and Node, and waits for actual process closure. Keep full native arguments and request files. Use the selected original CLI's help for subcommands; managed Applications remains the long-running server owner.

For example, these original subcommands read status, run a saved command, and export full working:

~~~sh
node products/transport-planning-workbench/cli.mjs \
  --configuration /srv/private/transport-control/launch.json -- status

node products/transport-planning-workbench/cli.mjs \
  --configuration /srv/private/transport-control/launch.json -- command \
  /srv/private/transport-inputs/selected-command.json

node products/transport-planning-workbench/cli.mjs \
  --configuration /srv/private/transport-control/launch.json -- backup \
  --output /srv/private/Transport-Workspace-Recovery.zip
~~~

The saved command file is the exact original {id,command,args} object; the wrapper supplies the reviewed actor. Original restore uses the configuration's directory as its fresh recovery destination. Original receive-application takes its own explicit --directory and returns source_directory and workspace; retain those paths exactly.

Use the launch-selected actor in agent work. The browser's original staff selector remains independent native attribution. Do not close and reopen a workspace merely to change a label, and do not replace the original actor on an uncertain request.

Keep errors and complete original responses. Retained file reads bind directory, original workspaceId, source authority and selected actor before exposing bytes. Aliases reused for a different workspace do not expose the earlier workspace's files or request lists. A complete arrived HTTP body remains retained even if the server stops immediately afterward; later reads still reauthorize the original live authority.

## 10. Installation, grant and customer handover

Select installation-workorders/transport-planning-workbench.json through the existing Installation registry. Preserve original task/source/receiving assignments, integer atomic price/count/budget, payment/asset/network/recipient, spending and acceptance selections. The profile introduces a complete transportation planning deliverable without changing the existing grant programme or funding totals.

A new approved operating period, material service-rule change or commissioned scenario/report edition may be a linked work item. Retrying a command, reading ranges, copying, reopening or receiving the same result remains the same work item.

The useful handover includes exact generic adapter edition, full private original authority/source, actual Python/Node observations, complete original and corrected operational sources, selected rules/periods/metrics, reviewed scenarios/actions/report editions, all request/history and complete independently editable native archives. Include opening steps and actual rendered inspection. Do not substitute a summary, sample row set or receipt-only packet for the usable product.

Keep company-private terms and source pins in authorized private custody. Preserve the original company sender, native operation, source and receiving owners. Every positive/warm human contact and each subsequent outgoing message or attachment requires Bryce approval of that exact content. Internal engineering and authorized cold work continue under their existing instructions.

## 11. Actual outgoing product inspection

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949
