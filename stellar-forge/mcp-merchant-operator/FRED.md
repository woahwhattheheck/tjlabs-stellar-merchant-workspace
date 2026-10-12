# Economic workspace clients and agents

Operate a retained FRED economic product from the installed command, a typed JavaScript client, or the existing authenticated merchant MCP host. All three paths attach to the original economic workspace: the same project, source captures, reviews, publication, merchant listener, configured SF88 buyer and saved customer intents.

The client covers official source intake, complete public-table imports, combined macro editions, observations and revision comparisons, projection review, publication, merchant control, customer preparation/execution/recovery, complete downloads and project receiving. The MCP family contains 56 tools and loads its runtime only when that configured family is used.

## Start or reconnect the original workspace

Use Node 24 and the existing economic application installation. The original workspace owner starts its same project with the configured buyer and facilitator:

~~~sh
starforge fred serve \
  --project /PRIVATE/ORIGINAL_FRED_PROJECT \
  --buyer-config /PRIVATE/ORIGINAL_BUYER.json \
  --facilitator https://ORIGINAL-FACILITATOR \
  --merchant-port ORIGINAL_MERCHANT_PORT \
  --connection-file /PRIVATE/fred-console.json
~~~

The capitalized paths, origin and port select the operator's existing resources. The optional connection-file flag writes the actual startup record with owner-only permissions. It includes the native project ID, complete launch binding and private session URL. On a later start of the same project, the record is replaced atomically; an existing record belonging to another project is rejected. The original managed Application may also supply its retained complete startup record directly.

The workspace binding covers its canonical project directory and creation identity, selected buyer configuration hash/path, facilitator, local-facilitator setting and merchant port. The client reads the native launch endpoint and compares the exact binding before it dispatches a workspace operation. A declared expected binding adds a fixed operator selection. A connection-record rotation reconnects the client to the same project using its current session.

Create the installed client connection using the existing original public payment file:

~~~sh
starforge fred-workspace connection-init \
  --out /PRIVATE/fred-client.json \
  --console-url-file /PRIVATE/fred-console.json \
  --workspace macro \
  --inputs-file stellar-forge/mcp-merchant-operator/examples/fred-workspace-inputs.json \
  --payment-file /PRIVATE/ORIGINAL_PUBLIC_PAYMENT.json \
  --merchant-origin https://ORIGINAL-MERCHANT-HOST \
  --profile native
starforge fred-workspace status --connection /PRIVATE/fred-client.json
~~~

The connection initializer authenticates an actual launch read before publishing its private connection file. Its returned projectId, bindingSha256 and instanceId identify that original server. Use an existing profiles JSON file with --profiles-file when there are several merchant configurations.

For a complete source checkout the supplied input-alias example resolves directly to the retained UNRATE, CPIAUCSL and GDP source files. Within an installed distribution these same files sit under its source directory. Input aliases are resolved from the input-alias file's directory. Client configuration paths are resolved from the connection file's directory.

The connection schema is stellar-forge.fred-workspace-connection.v1. Each workspace has one consoleUrlFile or consoleUrlEnv reference, optional projectId and expectedBindingSha256, request capacity/time settings, inputs, and merchantProfiles. The file or environment variable retains the original startup JSON or unchanged private URL. A bare URL requires the explicit original projectId. Credential values stay in the original private workspace and buyer configuration.

## Build and review a real macro edition

Read status and inputs first. input-inspect reads the complete selected source file, returning its file SHA256, original publisher-table URL, retrieval time, series ID and original table byte/hash metadata. The configured input digest, when present, is checked again during import.

~~~sh
starforge fred-workspace inputs --connection /PRIVATE/fred-client.json
starforge fred-workspace input-inspect --connection /PRIVATE/fred-client.json --input unrate
starforge fred-workspace import --connection /PRIVATE/fred-client.json \
  --input unrate --id ORIGINAL_IMPORT_ID --revision CURRENT_REVISION --sha256 ORIGINAL_FILE_SHA256
~~~

Continue with the revision and captureId returned by each original operation. Import the declared CPI and GDP files in the same way, then combine their retained capture IDs:

~~~sh
starforge fred-workspace combine --connection /PRIVATE/fred-client.json \
  --id ORIGINAL_COMBINE_ID --revision CURRENT_REVISION --captures UNRATE_SHA,CPI_SHA,GDP_SHA
starforge fred-workspace observations --connection /PRIVATE/fred-client.json \
  --capture COMBINED_CAPTURE_SHA --series UNRATE --offset 0
starforge fred-workspace review --connection /PRIVATE/fred-client.json \
  --id ORIGINAL_REVIEW_ID --revision CURRENT_REVISION --capture COMBINED_CAPTURE_SHA \
  --policy-file ORIGINAL_PROJECTION.json --note-file ORIGINAL_REVIEW.txt
starforge fred-workspace publish --connection /PRIVATE/fred-client.json \
  --id ORIGINAL_PUBLICATION_ID --revision CURRENT_REVISION --review SAVED_REVIEW_SHA --profile native
~~~

These uppercase IDs/hashes/revisions select values from the actual original operation. Project changes retain their stable id and expectedRevision in the native project journal. An exact repeated completed request returns its saved result. A pending source acquisition continues with its same original ID and revision.

Public-table imports carry the complete original publisher text and supplied retrieval metadata through the maintained parser. Each series retains its frequency, units, seasonal adjustment, publisher and missing values. Public-table retrieval time is represented by the original PUBLIC_TABLE_RETRIEVAL_DATE basis. The FRED API acquisition path retains its original real-time/vintage response fields. The combined product keeps these distinctions in its rows, metadata, source file and saved projection.

The supplied source files contain the actual original full UNRATE, CPIAUCSL and GDP public tables. Their original periods and publisher metadata remain available in each retained source. The macro starter guide describes these inputs in detail: [original macro starter](../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/sources/MACRO_STARTER.md).

For official API acquisition, configure saves the actual FRED selection and capture uses the environment-variable reference already recorded in the original project:

~~~sh
starforge fred-workspace configure --connection /PRIVATE/fred-client.json \
  --id ORIGINAL_CONFIGURATION_ID --revision CURRENT_REVISION --selection-file ORIGINAL_SELECTION.json
starforge fred-workspace capture --connection /PRIVATE/fred-client.json \
  --id ORIGINAL_CAPTURE_ID --revision CURRENT_REVISION
starforge fred-workspace operation --connection /PRIVATE/fred-client.json --id ORIGINAL_CAPTURE_ID
~~~

The source model and importer are documented in the [economic application guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/README.md). The native edition retains the FRED attribution and [FRED API terms link](https://fred.stlouisfed.org/docs/api/terms_of_use.html). Official observation parameter semantics are available in the [FRED observations documentation](https://fred.stlouisfed.org/docs/api/fred/series_observations.html); the client forwards the original workspace selection to that maintained source engine.

## Work with large collections and revisions

records pages captures, reviews, publications and original operations. Retain its returned revision as expectedRevision across that collection. Requests use expectedViewSha256 across their separately changing prepared-intent inventory.

observations and compare use the native 100-row response pages. Follow the returned nextOffset until it is null. A capture ID identifies immutable retained source, so both observation paging and before/after comparisons stay tied to their exact source editions.

~~~sh
starforge fred-workspace records --connection /PRIVATE/fred-client.json \
  --kind captures --offset 0 --limit 25 --revision CURRENT_REVISION
starforge fred-workspace compare --connection /PRIVATE/fred-client.json \
  --before EARLIER_CAPTURE_SHA --after LATER_CAPTURE_SHA --offset 0
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --kind comparison --before EARLIER_CAPTURE_SHA --after LATER_CAPTURE_SHA --out /PRIVATE/revisions.json
~~~

The complete comparison download includes every original change. file downloads also retain complete source, project and customer responses.

## Original merchant and customer execution

Read publication to inspect its original snapshot, schema, offers, advertised file paths and complete file hashes. merchant-start forwards that reviewed publication to the original workspace's configured native seller/facilitator.

~~~sh
starforge fred-workspace publication --connection /PRIVATE/fred-client.json --publication PUBLICATION_SHA
starforge fred-workspace merchant-start --connection /PRIVATE/fred-client.json --publication PUBLICATION_SHA
starforge fred-workspace preview --connection /PRIVATE/fred-client.json \
  --publication PUBLICATION_SHA --query 'where_series=UNRATE&limit=100'
starforge fred-workspace prepare --connection /PRIVATE/fred-client.json \
  --publication PUBLICATION_SHA --intent ORIGINAL_INTENT_ID --query 'where_series=UNRATE&limit=100'
starforge fred-workspace buy --connection /PRIVATE/fred-client.json \
  --publication PUBLICATION_SHA --intent ORIGINAL_INTENT_ID
~~~

Use the original dataset's declared query fields when choosing filters, sort and limits. preview invokes that exact dataset handler. The prepared customer request binds its offer, selected payment alternative, query, publication, snapshot and output policy before execution.

The configured SF88 buyer performs its existing approval and native execution. The agent result includes the original native metadata, delivery byte count/hash and cursor metadata. Download the complete saved response with the same intent:

~~~sh
starforge fred-workspace recover --connection /PRIVATE/fred-client.json \
  --publication PUBLICATION_SHA --intent ORIGINAL_INTENT_ID
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --kind customer --publication PUBLICATION_SHA --intent ORIGINAL_INTENT_ID --out /PRIVATE/original-page.json
~~~

For the next dataset page, retain the original preceding page metadata, snapshot and returned nextCursor. Supply that actual cursor in the query and the metadata in --previous-file when preparing the next original intent. Each paid page keeps its own original intent. For a whole source or CSV file, pass the exact path advertised by publication in --file and use the same prepare, buy, recover and complete-download flow.

Every client mutation has one native HTTP request. A lost response retains an ambiguous outcome on the thrown error together with the original ID. Inspect operation for project work and recover the same intent for customer work. A request timeout or client disconnect leaves the original server's operation with its owner. The wait command observes durable project progress through reads; it never dispatches a mutation.

## Export, receive and reconnect

~~~sh
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --kind source --capture CAPTURE_SHA --out /PRIVATE/original-capture.json
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --kind project --out /PRIVATE/fred-project.json
starforge fred-workspace receive --source /PRIVATE/fred-project.json \
  --project /PRIVATE/RECEIVED_FRED_PROJECT --sha256 COMPLETE_DOWNLOAD_SHA256
~~~

The project download checks the native bundle identity and exact project ID. Receiving invokes the maintained original receiveFredProject implementation to reconstruct the source editions, saved reviews and publications. The original customer's native account/ledger and financial operation records remain under their configured custody, while their complete delivered files are exported through the customer download operation.

Downloads preserve the full response bytes, byte count, content type and SHA256. Publication creates a new destination; an already retained identical file is reused after its complete hash and size are checked. A different destination file is preserved and the command returns the conflict.

Reopen the original project or the received directory through fred serve with its same configuration, then retain its actual connection record. A subsequent status reads that record and verifies the same project binding before operating. disconnect releases only the borrowed client and its owned download reads.

## Authenticated merchant MCP

Create the separate merchant configuration from the original connection file:

~~~sh
node stellar-forge/mcp-merchant-operator/serve.mjs init-fred-workspaces \
  --dir /PRIVATE/fred-merchant-mcp --connection /PRIVATE/fred-client.json
node stellar-forge/mcp-merchant-operator/serve.mjs serve \
  --config /PRIVATE/fred-merchant-mcp/merchant-mcp.json \
  --token-env ORIGINAL_MCP_ACCESS_TOKEN_ENV
~~~

The existing host also accepts its configured --oauth-config resource host. Keep that original host authentication choice. For a cumulative merchant configuration, add fredWorkspaceConnection pointing to the private connection file.

| Area | Tools |
| --- | --- |
| Original scope and sources | merchant_fred_workspaces, status, inputs, input_inspect |
| Retained project and revisions | records, record, operation, observations, compare, briefing_preview, briefing |
| Recurring report definitions and editions | briefing_templates, briefing_template_save, briefing_successor_preview, briefing_successor_save, briefing_successor |
| Source and edition authoring | configure, capture, import, combine, select, review, publish, abandon |
| Merchant and customer | merchant_start, merchant_stop, publication, requests, preview, prepare, buy, recover |
| Complete files and reconnect | file_read, file_release, disconnect |

Every tool in the table uses the merchant_fred_ prefix. Source imports and merchant publication select host-declared aliases. The installed client takes explicit original files and complete request objects.

MCP file_read uses the maintained retained-file reader. Preserve its readId, complete file SHA256 and returned nextOffset. It sends base64 chunks until nextOffset is null; the final chunk closes that private descriptor. After process restart or expiry, select the same original file and expectedSha256 at the required offset to continue.

The catalog contains only static metadata. The provider registry loads the FRED client when its configured family is selected, and the merchant operator owns its shutdown. Public source acquisition and paid customer execution stay on the existing authenticated FRED server.

## Typed JavaScript interface

The installed exports include buyer/fred/workspace-client, buyer/fred/workspace-client/operations, merchant/mcp/fred and merchant/mcp/fred/setup. Each has an explicit .d.mts declaration. The following source-checkout example uses the same client:

~~~js
import {
  FredWorkspaceClient, readFredWorkspaceConfiguration, saveFredFile
} from './stellar-forge/mcp-merchant-operator/fred-workspace-client.mjs';

const configured = await readFredWorkspaceConfiguration('/PRIVATE/fred-client.json');
const client = new FredWorkspaceClient(configured.workspaces.macro);
try {
  const state = await client.state();
  const captureId = state.project.selectedCapture;
  let offset = 0;
  do {
    const page = await client.observations({ captureId, series: 'UNRATE', offset });
    // Consume page.rows with their original date, value, missing flag and units.
    offset = page.nextOffset;
  } while (offset !== null);
  const retained = await saveFredFile(client, { kind: 'project' }, '/PRIVATE/project-copy.json');
  console.log({ projectId: retained.projectId, bytes: retained.bytes, sha256: retained.sha256 });
} finally {
  client.close();
}
~~~

The definitions expose the original launch binding, project/revision structures, source and publication inputs, exact file selections, raw Buffer downloads and recoverable error fields. The client accepts an AbortSignal per operation; timeoutMs controls the client observation window up to 30 minutes. Full request capacity is 128 MiB and full response capacity is 256 MiB, matching the original workspace and bundle contracts. The original source model applies its own source limits.


## Author and deliver an analyst briefing

The installed economic client now includes the complete saved-report workflow. Use `briefing-preview --capture SHA --briefing-file JSON`, then save `review --id ID --revision N --capture SHA --briefing-file JSON` with the original note/projection. Open it with `briefing --review SHA`. Full `download --kind briefing --review SHA --format html|csv|json|manifest --out FILE` verifies the original saved file descriptor and complete response bytes.

The agent tools are `merchant_fred_briefing_preview` and `merchant_fred_briefing`; `merchant_fred_review` accepts the optional normalized analyst selection, and `merchant_fred_file_read` accepts briefing/reviewId/format. The typed Node client exposes `previewBriefing`, `briefing` and the extended file/review types. Existing `publish`, `prepare`, `buy` and `recover` deliver the complete report through the original configured merchant and buyer.

[BRIEFINGS.md](../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/BRIEFINGS.md) gives the full authoring, exact period/unit/missing-value rules, native customer and project reopening flow. [The completed offline macro report](../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/examples/briefing-20261012/briefing.html) includes all actual report data and local downloads; [its complete original capture](../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/examples/briefing-20261012/macro-source.capture.json) imports directly into the existing project. The source keeps all 2,219 observations; its January 2024–September 2026 briefing selects 75 observations and produces 150 exact comparisons.

Projects with saved briefings use the explicit v2 bundle until a recurring template is retained. Recurring projects use v3: the complete templates and successor lineage remain in the original project state, and the existing briefing inventory carries every full saved report. The native receiver validates the original source, calculations, files and lineage and restores those same bytes. Source-only projects keep their original v1 bundle and edition identities.

## Continue an economic briefing with a reusable definition

A recurring template carries the original saved briefing's series, comparison methods, decimal precision, notes and source meaning. Its window determines which original observation dates enter the next report. Create each next briefing explicitly against a selected retained capture.

The complete domain and native operating guide is [TEMPLATES.md](../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/TEMPLATES.md). The maintained [window input](../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/examples/briefing-template-window.json) selects twelve calendar months with the earliest latest recorded observation date among the selected series. Dates label the source's own periods; a quarterly date and a monthly date keep their original meanings.

### Save the definition and inspect the next edition

Start from a saved analyst review returned by the existing briefing workflow. Use its complete review ID and the current project revision:

~~~sh
starforge fred-workspace briefing-template-save --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_TEMPLATE_OPERATION --revision CURRENT_REVISION \
  --review ORIGINAL_BRIEFING_REVIEW_SHA --name "Monthly economic briefing" \
  --window-file stellar/scf-starforge-20261009/sf30-seller-sdk/fred/examples/briefing-template-window.json

starforge fred-workspace briefing-templates --connection /PRIVATE/fred-client.json \
  --workspace macro --kind templates --offset 0 --limit 50
~~~

The result retains its complete template ID, original review/capture and immutable definition. The IDs have the form fred-template- followed by 64 hexadecimal characters. To edit a definition, create a new template from its reviewed source and pass the previous template ID with --previous-template. Both definitions remain in the same project.

Import or acquire the next complete source through the existing source commands. Then preview it with the selected template:

~~~sh
starforge fred-workspace briefing-successor-preview --connection /PRIVATE/fred-client.json \
  --workspace macro --template ORIGINAL_TEMPLATE_ID --capture NEXT_CAPTURE_SHA \
  --note-file /PRIVATE/NEXT_REVIEW.txt --offset 0 --limit 100 --changes-only true
~~~

Review the returned calendar dates, per-series coverage, missing values, meaningChanges and comparison. The window uses original observation dates including missing markers. latest_all selects the earliest latest date across the selected series; latest_any selects the latest. lagMonths moves the end backward by whole calendar months. An explicit --anchor-date YYYY-MM-DD pins a chosen calendar reference. The original source supplies every reported current and baseline observation.

The comparison separates new periods, earlier additions, periods leaving the window, changed comparison methods, revisions and unchanged economic values. Source time-basis and retrieval-context changes remain visible separately. Use --changes-only false to inspect unchanged values together with their original context. Numeric deltas apply only where units, frequency and seasonal adjustment agree. An absent baseline or original missing marker keeps its explicit source state.

offset and limit page the report comparison. Retain the same template, capture, anchor, preceding report, review note and previewId while reading later pages. The new briefing measures remain available in the preview's first page and, after saving, through the existing briefing command.

### Save, publish and receive the reviewed successor

The preview returns the exact previewId for this source, calculation and review note. Save with that same selection and the current project revision:

~~~sh
starforge fred-workspace briefing-successor-save --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_SUCCESSOR_OPERATION --revision CURRENT_REVISION \
  --template ORIGINAL_TEMPLATE_ID --capture NEXT_CAPTURE_SHA --preview-id REVIEWED_PREVIEW_SHA \
  --note-file /PRIVATE/NEXT_REVIEW.txt

starforge fred-workspace briefing-successor --connection /PRIVATE/fred-client.json \
  --workspace macro --successor SAVED_SUCCESSOR_ID --offset 0 --limit 100 --changes-only false

starforge fred-workspace publish --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_PUBLICATION_OPERATION --revision CURRENT_REVISION \
  --review SAVED_SUCCESSOR_REVIEW_SHA --profile native
~~~

A saved successor has a fred-successor- ID and retains its original template, preceding report, source capture, saved review and complete new report. Its original review ID uses the existing publication, merchant, advertised-file purchase and recovery flow.

The default comparison baseline is the template's originating review. For the following edition, select --previous-successor SAVED_SUCCESSOR_ID from this same template; its saved review becomes the baseline. An explicit --baseline-review must be the origin review or a saved successor review for this template and must agree with --previous-successor when both are supplied. A changed note, anchor or preceding report requires the corresponding new preview.

After an interrupted save, inspect operation with the original operation ID. An exact completed request returns its retained result. The installed client snapshots the complete new mutation input before it awaits connection reads, so later changes to the caller's window object cannot change an in-flight definition.

### Complete change reports and original project receiving

~~~sh
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --workspace macro --kind briefing-successor --successor SAVED_SUCCESSOR_ID \
  --format html --out /PRIVATE/briefing-changes.html
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --workspace macro --kind briefing-successor --successor SAVED_SUCCESSOR_ID \
  --format csv --out /PRIVATE/briefing-changes.csv
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --workspace macro --kind briefing-successor --successor SAVED_SUCCESSOR_ID \
  --format json --out /PRIVATE/briefing-changes.json
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --workspace macro --kind project --out /PRIVATE/recurring-fred-project.json
~~~

All three change downloads contain the complete comparison. The offline HTML can filter and page the retained rows locally. The JSON carries the exact template, materialization, successor lineage, full comparison and saved briefing manifest; the client verifies their original binding and complete comparison identity. Every download returns its full byte count and SHA256 and preserves an existing different destination file.

The v3 project contains all original captures, reviews, complete briefing files, templates and successor records. The existing receive command reconstructs the same project and full lineage, after which the normal workspace connection reopens it. Template and successor inventories have pinned-revision paging in the installed CLI/MCP; keep the returned revision while following nextOffset.

### Typed client and authenticated tools

The typed client methods are briefingTemplates, saveBriefingTemplate, previewBriefingSuccessor, saveBriefingSuccessor and briefingSuccessor. The published declarations carry the complete template window, materialization, source coverage, meaning changes, comparison rows, successor records and file selections. The corresponding authenticated tools use the same names under merchant_fred_ with underscores.

~~~js
const selection = {
  templateId: originalTemplate.id,
  captureId: nextRetainedCaptureId,
  note: reviewedNote
};
const preview = await client.previewBriefingSuccessor(selection);
const current = await client.state();
const saved = await client.saveBriefingSuccessor({
  ...selection,
  previewId: preview.previewId,
  id: originalSuccessorOperationId,
  expectedRevision: current.project.revision
});
const file = await saveFredFile(client, {
  kind: 'briefing-successor',
  successorId: saved.successorId,
  format: 'json'
}, '/PRIVATE/briefing-changes.json');
~~~

merchant_fred_briefing_templates pages either templates or successors. merchant_fred_briefing_template_save and merchant_fred_briefing_successor_save retain the original operation ID and expected revision. The preview and saved comparison tools expose the original source changes before publication. merchant_fred_file_read accepts kind briefing-successor with successorId and format, using the existing complete-file chunks, read IDs and SHA256 checks.


## Release calendars, watched sources and vintage catch-up

The release workflow connects complete original FRED source captures to the existing economic project. Acquire or import series metadata, each series' actual release mapping, every selected release-calendar page and every selected vintage-date page. Save a watch over an original series list or a retained recurring briefing template, inspect and save a source-based plan, then acquire its chosen observation editions through the same original FRED capture path.

Release metadata, raw calendar dates, vintage dates and observation periods keep their separate meanings. The official [per-release dates endpoint](https://fred.stlouisfed.org/docs/api/fred/release_dates.html) describes publisher release dates; those dates do not determine when the corresponding values become available in FRED. The [series vintage-date endpoint](https://fred.stlouisfed.org/docs/api/fred/series_vintagedates.html) lists dates on which values were added or revised. Original [real-time intervals](https://fred.stlouisfed.org/docs/api/fred/realtime_period.html) are closed at both ends and describe information known during that interval. The captured selection and each original request retain all three distinctions.

### Acquire and import complete release source

A release selection declares every series, its metadata as-of date, an explicit calendar interval, an explicit vintage interval, the source page size and the complete combined row capacity. The distributed [PPIACO selection](../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/examples/ppiaco-release-selection.json) requests the actual PPIACO release mapping with metadata/vintage end 2026-10-12, calendar 2026-09-01 through 2026-12-31, and vintages 2026-09-01 through 2026-10-12. Its two-row source pages exercise complete original pagination; the row capacity is 100000. This file is an acquisition selection.

~~~sh
starforge fred-workspace release-acquire --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_RELEASE_SOURCE_OPERATION --revision CURRENT_REVISION \
  --selection-file stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/examples/ppiaco-release-selection.json

starforge fred-workspace release-captures --connection /PRIVATE/fred-client.json \
  --workspace macro --offset 0 --limit 50 --revision CURRENT_REVISION

starforge fred-workspace release-capture --connection /PRIVATE/fred-client.json \
  --workspace macro --release-capture RELEASE_CAPTURE_SHA \
  --section calendar --offset 0 --limit 100
~~~

Within an installed distribution, these retained source paths are under its source directory. The workspace uses its existing private apiKeyEnv binding to acquire the selected sources. The installed client sends the declared selection and original operation; the key stays on that host. The source graph follows each returned page count and offset through completion, preserving the full original JSON response text, selected public response headers, receipt times and byte hashes. A calendar date with no data remains in the retained calendar.

For source captured on another equipped native host, declare an input alias in the existing private connection configuration:

~~~json
{
  "ppiaco-releases": {
    "kind": "release-capture",
    "label": "Original PPIACO release source",
    "path": "/PRIVATE/ORIGINAL_RELEASE_OPERATION/capture.json"
  }
}
~~~

The alias supports the same optional sha256 field as other complete inputs. It pins the whole file; captureSha256 identifies the complete normalized release source envelope. Inspect and import that same input:

~~~sh
starforge fred-workspace input-inspect --connection /PRIVATE/fred-client.json \
  --workspace macro --input ppiaco-releases
starforge fred-workspace release-import --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_RELEASE_IMPORT_OPERATION --revision CURRENT_REVISION \
  --input ppiaco-releases --sha256 ORIGINAL_COMPLETE_FILE_SHA
~~~

input-inspect returns the source selection, byte identity, original retrieval interval and counts of series, releases, calendar rows, vintage rows and raw records. The importer uses one stable complete-file read and validates the original source graph. An observation input uses the existing import command; a release-capture input uses release-import.

The source has immutable captureSha256 identity. Page its series, releases, calendar and vintages sections by following nextOffset through null. Source and plan row pages accept 1–500 rows, defaulting to 100. Inventories accept 1–100, defaulting to 50; keep their returned project revision in --revision while reading later inventory pages.

### Save a complete watch

A source watch declares the observation range to acquire, a baseline information date and a catch-up policy. all_vintages, the default, selects each eligible original missed vintage. latest_vintage selects the latest available eligible vintage while retaining the triggering dates and reasons. A watch can bind a saved recurring template; its whole original series list and template meaning remain together.

~~~sh
starforge fred-workspace release-watch-save --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_RELEASE_WATCH_OPERATION --revision CURRENT_REVISION \
  --name "PPI source editions" --watch-series PPIACO \
  --observation-start 1947-01-01 --observation-end as_of --baseline-as-of 2026-09-01 \
  --catch-up all_vintages --page-size 1000 --max-rows 1000000

starforge fred-workspace release-watches --connection /PRIVATE/fred-client.json \
  --workspace macro --kind watches --offset 0 --limit 50 --revision CURRENT_REVISION
~~~

For a retained analyst workflow, use --template ORIGINAL_TEMPLATE_ID to select every series of that saved definition. If --watch-series is also supplied, it must agree with the complete template series list. A saved watch has a fred-release-watch- ID and is immutable; a new definition receives its own ID. observationEnd as_of means each planned capture ends on its selected information date. An explicit date retains a fixed observation end.

### Review and save the exact release plan

Choose the saved watch and selected complete source capture. Supply --before-release for a preceding source snapshot when comparing two source editions; omit it for the first retained snapshot.

~~~sh
starforge fred-workspace release-plan-preview --connection /PRIVATE/fred-client.json \
  --workspace macro --watch ORIGINAL_WATCH_ID \
  --before-release PRECEDING_RELEASE_SHA --after-release SELECTED_RELEASE_SHA \
  --section acquisitions --offset 0 --limit 100

starforge fred-workspace release-plan-preview --connection /PRIVATE/fred-client.json \
  --workspace macro --watch ORIGINAL_WATCH_ID \
  --before-release PRECEDING_RELEASE_SHA --after-release SELECTED_RELEASE_SHA \
  --section vintageChanges --offset 0 --limit 100

starforge fred-workspace release-plan-save --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_RELEASE_PLAN_OPERATION --revision PREVIEW_PROJECT_REVISION \
  --watch ORIGINAL_WATCH_ID --before-release PRECEDING_RELEASE_SHA \
  --after-release SELECTED_RELEASE_SHA --preview-id REVIEWED_RELEASE_PREVIEW_SHA
~~~

The preview and saved plan expose acquisitions, calendarChanges, vintageChanges, events and schedule pages. Read coverage and summary with each page. A newly discovered date inside the overlapping captured interval is LATE_DISCOVERED_VINTAGE, even when its date is at or before the watched baseline. Dates entering or leaving a selected interval retain their coverage classification. Source updates can make an existing date eligible for rechecking, while the saved completion snapshot belongs to this watch and this exact selected source capture.

The complete plan also retains requiredSourceSelections, sourceChanges and meaningChanges. If vintage coverage does not include the full requested catch-up period, requiredSourceSelections supplies the complete next source selection to acquire. Download the full plan JSON to inspect every source field and continuation selection. The saved plan has a fred-release-plan- ID derived from its complete descriptor; its reviewed watch, source pair, coverage and completion snapshot stay intact as later captures are added.

### Acquire the planned observation editions

Select an actual acquisition asOf returned by the saved plan:

~~~sh
starforge fred-workspace release-vintage-capture --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_PLANNED_VINTAGE_OPERATION --revision CURRENT_REVISION \
  --plan ORIGINAL_SAVED_PLAN_ID --as-of ORIGINAL_PLANNED_DATE
~~~

The command sends the plan's complete original observation selection to captureFred. Every watched series is captured at the same selected information date, with its original units, frequency, seasonal adjustment and missing values. A common as-of date can be meaningful even when only one watched series changed that day; the official [observations endpoint](https://fred.stlouisfed.org/docs/api/fred/series_observations.html) supports selecting dates independently of each series' change dates.

The result returns captureId, watchId, planId, asOf, selection and the original catchUp record. Its observation capture is now available to observations, compare, review and briefing-successor-preview. For a template watch, use that same template and returned capture to create the next reviewed report, save the successor, and continue through the existing publication and customer workflow.

This typed-client loop reads every selected plan acquisition before applying them. Its operation ID is stable for each complete plan identity and date:

~~~js
const acquisitions = [];
for (let offset = 0; ; ) {
  const value = await client.releasePlan({
    planId: savedPlan.planId, section: 'acquisitions', offset, limit: 100
  });
  acquisitions.push(...value.plan.rows);
  if (value.plan.nextOffset === null) break;
  offset = value.plan.nextOffset;
}
for (const selected of acquisitions) {
  const current = await client.state();
  const result = await client.acquirePlannedVintage({
    id: 'fv-' + savedPlan.planId.slice(-64) + '-' + selected.asOf,
    expectedRevision: current.project.revision,
    planId: savedPlan.planId,
    asOf: selected.asOf
  });
  console.log({ captureId: result.captureId, asOf: result.asOf, revision: result.revision });
}
~~~

The native project reuses the saved capture for an already completed plan/date. After an interrupted mutation, inspect operation with its original ID and continue that same selection. A pending release acquisition can resume with release-acquire using the original ID and revision while omitting --selection-file; a completed operation replays with its original selection. A staged release import can continue with the same --id, --revision and --release-capture SHA. Both continue the retained original preparation.

### Complete files and version 4 receiving

~~~sh
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --workspace macro --kind release-source --release-capture RELEASE_CAPTURE_SHA \
  --out /PRIVATE/original-release-source.json

starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --workspace macro --kind release-plan --plan ORIGINAL_SAVED_PLAN_ID \
  --out /PRIVATE/saved-release-plan.json

starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --workspace macro --kind project --out /PRIVATE/fred-release-project.json

starforge fred-workspace receive --source /PRIVATE/fred-release-project.json \
  --project /PRIVATE/RECEIVED_FRED_PROJECT --sha256 ORIGINAL_BUNDLE_FILE_SHA
~~~

release-source and release-plan are complete JSON files. Their downloaded bytes are validated against the selected original capture or plan identity, and every download returns the full file length and SHA256. The existing save operation preserves a different destination and reuses an identical already-saved file. Authenticated tools expose both file kinds through merchant_fred_file_read with the same retained readId, offsets and complete-file identity; merchant_fred_file_release closes that read.

A project containing release work exports stellar-forge.fred-project-bundle.v4 with its original project state, observation captures, publication plans and analyst files, plus every complete release capture and saved plan. The release state includes watches and exact completed catch-up bindings. A series-only watch can carry an empty briefings array. The client verifies the full versioned identity, original source/plan graph and completed-operation lineage before receiving through the maintained project receiver. Projects without release state retain their original v1–v3 bundle identity. Reopen the received directory with the original fred serve command and retain its current private connection record.

### Installed methods and agent tools

| Client method | Installed command / merchant_fred_ suffix | Purpose |
|---|---|---|
| releaseCaptures | release-captures / release_captures | Page retained release source descriptors |
| releaseCapture | release-capture / release_capture | Page one complete source's series, releases, calendar or vintages |
| importReleaseCapture | release-import / release_import | Import a configured complete release input or resume its staged operation |
| acquireReleaseCapture | release-acquire / release_acquire | Acquire all original selected source pages |
| releaseWatches | release-watches / release_watches | Page watches, saved plans or catchUps at a pinned revision |
| saveReleaseWatch | release-watch-save / release_watch_save | Save the immutable source or template watch |
| previewReleasePlan | release-plan-preview / release_plan_preview | Inspect the exact source pair and planned editions |
| saveReleasePlan | release-plan-save / release_plan_save | Save the reviewed preview and its original completion snapshot |
| releasePlan | release-plan / release_plan | Open a saved plan, chosen section and completed capture bindings |
| acquirePlannedVintage | release-vintage-capture / release_vintage_capture | Acquire the saved plan's exact coherent observation edition |

The JavaScript inventory methods return their complete original envelopes; the installed CLI and authenticated tools provide revision-pinned inventory pages. The public declarations reference the maintained source, watch, planner and project model types. FredReleasePlanSummary is the domain's numeric summary; FredReleasePlanRecord is the saved project index descriptor. FredReleaseCapturePage selects typed source rows by its section, and the plan methods select the exact row type for the requested plan section. Configured source inputs declare kind release-capture; complete file selections add release-source with releaseCaptureId and release-plan with planId. The original private workspace connection and retained-file protocol serve every path.

The [native release operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/README.md) describes exact source intake and pagination, and the [project guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/PROJECT.md) describes durable capture, watch, plan and receiving operations.


## DDP package conversion and complete receiving

The migration workflow retains an original Board package and the complete official Board-to-FRED crosswalk, reviews a whole-package plan, acquires the selected FRED batches and saves a complete reconciliation. The typed client, installed command and authenticated agent tools operate the same native project journal and immutable source identities.

The Board's [transition notice](https://www.federalreserve.gov/data/data-download-fred-information.htm) says the custom Build Your Package feature is removed during the week of November 9, 2026. Its historical XML remains on individual release pages. The original [DDP help](https://www.federalreserve.gov/datadownload/help/default.htm) defines the package's currently published data, periods, frequency, units, multipliers, supporting structure files and output layouts. The receiving workflow preserves these source choices alongside the selected FRED information date.

### Declare and inspect the original source files

The source owner seals the complete original crosswalk CSV and original package CSV, SDMX XML, or SDMX archive. Supporting structure files and a declared CSV layout stay inside that original package envelope. The original source helpers and acquisition command are described in the [native DDP guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/README.md).

Add these complete source envelopes to the existing private input-alias file:

~~~json
{
  "board-crosswalk": {
    "kind": "ddp-crosswalk",
    "label": "Complete original Board-to-FRED crosswalk",
    "path": "/PRIVATE/ORIGINAL_CROSSWALK_OPERATION/capture.json"
  },
  "h15-package": {
    "kind": "ddp-package",
    "label": "Original H.15 reporting package",
    "path": "/PRIVATE/ORIGINAL_PACKAGE_OPERATION/capture.json"
  }
}
~~~

An optional sha256 pins each whole host file. Paths are resolved from the same configured input-alias or connection file as existing economic inputs. The file body is the complete native source envelope, including original bytes and provenance. A raw CSV or ZIP belongs in the original source-sealing workflow before this import.

~~~sh
starforge fred-workspace input-inspect --connection /PRIVATE/fred-client.json \
  --workspace macro --input board-crosswalk
starforge fred-workspace input-inspect --connection /PRIVATE/fred-client.json \
  --workspace macro --input h15-package

starforge fred-workspace ddp-crosswalk-import --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_CROSSWALK_IMPORT --revision CURRENT_REVISION \
  --input board-crosswalk --sha256 COMPLETE_CROSSWALK_FILE_SHA

starforge fred-workspace ddp-package-import --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_PACKAGE_IMPORT --revision CURRENT_REVISION \
  --input h15-package --sha256 COMPLETE_PACKAGE_FILE_SHA
~~~

input-inspect reads the complete file, checks its optional whole-file digest and validates the original envelope with the native crosswalk or package model. Source import returns crosswalkId or packageId, its compact source summary and the new project revision. The source identity is independent of the host filename and of the operation ID.

The workspace can acquire the complete official crosswalk directly:

~~~sh
starforge fred-workspace ddp-crosswalk-acquire --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_CROSSWALK_ACQUISITION --revision CURRENT_REVISION
~~~

The optional --url selects an original official Federal Reserve URL. The native source owner retains the final URL, original response metadata and complete bytes. The [official crosswalk](https://www.federalreserve.gov/data/documents/DDP-FRED%20Data%20Series%20Crosswalk.csv) maps the release and original Board series identifier to its FRED candidate.

### Inspect the entire original package

~~~sh
starforge fred-workspace ddp-sources --connection /PRIVATE/fred-client.json \
  --workspace macro --kind packages --offset 0 --limit 50 --revision CURRENT_REVISION

starforge fred-workspace ddp-crosswalk --connection /PRIVATE/fred-client.json \
  --workspace macro --crosswalk ORIGINAL_CROSSWALK_ID --release H15 \
  --offset 0 --limit 100

starforge fred-workspace ddp-package --connection /PRIVATE/fred-client.json \
  --workspace macro --package ORIGINAL_PACKAGE_ID --section series \
  --frequency ORIGINAL_SOURCE_FREQUENCY --query ORIGINAL_SERIES_TEXT \
  --offset 0 --limit 100

starforge fred-workspace ddp-package --connection /PRIVATE/fred-client.json \
  --workspace macro --package ORIGINAL_PACKAGE_ID --section observations \
  --package-series ORIGINAL_PACKAGE_SERIES_ID --offset 0 --limit 100
~~~

The uppercase values select actual returned source identities and fields. Inventories select crosswalks, packages, migrations or receivings. They use the returned revision for later --revision pages. Source rows default to 100 and accept 1–500; inventories default to 50 and accept 1–100. Follow every nextOffset until null.

Crosswalk filters use release and query. Package series filters use the original frequency and query; the returned frequencies list is the complete available frequency inventory. Observation selection uses the immutable fred-ddp-series- identity returned by that original package, preserving distinct datasets or package entries even when Board identifiers repeat. Package source identity uses fred-ddp-package-, and crosswalk identity uses fred-ddp-crosswalk-.

### Review a whole-package migration

A migration preserves its name, exact FRED asOf, source window, original bookmark and analyst note. The default window is { "kind": "source" }, using each package series' selected original periods. A fixed window has kind fixed with start and end dates. A last window has kind last and a positive count of original observations; it retains the package's actual frequency.

Mapping decisions select an actual crosswalk candidate or explicitly exclude an original release/Board-series pair, with a review note. A per-series binding selects the original package series ID and may specify exact period alignment, positive decimal source and target scales, expected FRED units, expected frequency and expected seasonal adjustment. The native model normalizes exact decimal strings, including supported exponent notation. Preserve a note explaining each explicit binding.

The period rules are exact, month, quarter, semiannual and year. An omitted or null rule retains the native frequency-based default. These choices align original observation periods; they do not change the recorded original source period or raw value. Missing values retain their original markers.

Create one complete migration-selection JSON file using actual returned source identities:

~~~json
{
  "packageId": "ORIGINAL_PACKAGE_ID",
  "crosswalkId": "ORIGINAL_CROSSWALK_ID",
  "name": "H.15 reporting workflow",
  "asOf": "2026-10-12",
  "window": { "kind": "source" },
  "bookmark": null,
  "note": "Original reporting definition and reviewed source meaning.",
  "decisions": [],
  "bindings": [],
  "pageSize": 1000,
  "maxRows": 1000000
}
~~~

The uppercase IDs are placeholders to replace with the complete actual IDs. Set asOf to the selected information date for the real migration. An existing package bookmark may be supplied as a complete HTTP or HTTPS URL; its opaque URL parameters remain a bookmark, while actual source records supply the Board identifiers.

~~~sh
starforge fred-workspace ddp-migration-preview --connection /PRIVATE/fred-client.json \
  --workspace macro --args-file /PRIVATE/h15-migration-selection.json \
  --section series --offset 0 --limit 100

starforge fred-workspace ddp-migration-preview --connection /PRIVATE/fred-client.json \
  --workspace macro --args-file /PRIVATE/h15-migration-selection.json \
  --section mappings --offset 0 --limit 100

starforge fred-workspace ddp-migration-preview --connection /PRIVATE/fred-client.json \
  --workspace macro --args-file /PRIVATE/h15-migration-selection.json \
  --section acquisitions --offset 0 --limit 100

starforge fred-workspace ddp-migration-save --connection /PRIVATE/fred-client.json \
  --workspace macro --args-file /PRIVATE/h15-migration-selection.json \
  --id ORIGINAL_MIGRATION_SAVE --revision PREVIEW_PROJECT_REVISION \
  --preview-id REVIEWED_MIGRATION_PREVIEW_SHA
~~~

The preview returns migrationId, previewId, the project revision and the selected migration page. Review its ready state and complete counts of mapped, ambiguous, unmapped, excluded and unresolved-period series. The acquisitions page exposes every original normalized FRED selection. Save the same complete selection and preview identity. Later changes receive a new immutable plan.

The CLI also accepts --package, --crosswalk, --name, --as-of, --window-file, --bookmark, --note-file, --decisions-file, --bindings-file, --page-size and --max-rows. Decisions and bindings files contain complete arrays. An --args-file and explicit flags must agree when they supply the same field. Large original source envelopes use configured input files instead of tool arguments.

### Acquire every selected batch and inspect the receiving

~~~sh
starforge fred-workspace ddp-migration-acquire --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_MIGRATION_ACQUISITION --revision CURRENT_REVISION \
  --migration ORIGINAL_SAVED_MIGRATION_ID

starforge fred-workspace ddp-migration --connection /PRIVATE/fred-client.json \
  --workspace macro --migration ORIGINAL_SAVED_MIGRATION_ID \
  --section acquisitions --offset 0 --limit 100

starforge fred-workspace ddp-receiving --connection /PRIVATE/fred-client.json \
  --workspace macro --receiving ORIGINAL_RECEIVING_ID --changes-only true \
  --offset 0 --limit 100

starforge fred-workspace ddp-receiving --connection /PRIVATE/fred-client.json \
  --workspace macro --receiving ORIGINAL_RECEIVING_ID --changes-only false \
  --package-series ORIGINAL_PACKAGE_SERIES_ID --offset 0 --limit 100
~~~

One original migration-acquire operation owns all of the plan's original FRED batches. It uses the existing private key binding on the source workspace. Its result includes the immutable receivingId, migrationId, every captureId, the source acquisitionId and the new project revision. A repeated completed request returns the same result; an interrupted request resumes its original pending operation and completed batches.

The receiving retains original source and target meanings, the reviewed period and scale bindings, source and target values, exact differences and the complete status counts. Statuses are EQUAL, DIFFERENT, BOTH_MISSING, MISSING_CHANGED, SOURCE_ONLY, TARGET_ONLY, MEANING_REVIEW, EXCLUDED, UNMAPPED and AMBIGUOUS. A meaning review remains visible alongside the original metadata. changesOnly false includes the complete row set; the series filter uses the original package series identity.

The saved project inventory carries a versioned JSON/CSV/HTML file manifest for each receiving. Its native renderer keeps full source context and analyst choices in the offline report and complete machine-readable files.

### Resume the same original operation

Use operation with the original ID to inspect pending or completed work. Source imports stage validated original bytes before the project mutation. Once the original operation has staged its source ID, continue that same import with the same ID and original revision:

~~~sh
starforge fred-workspace ddp-crosswalk-import --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_CROSSWALK_IMPORT --revision ORIGINAL_IMPORT_REVISION \
  --crosswalk STAGED_ORIGINAL_CROSSWALK_ID

starforge fred-workspace ddp-package-import --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_PACKAGE_IMPORT --revision ORIGINAL_IMPORT_REVISION \
  --package STAGED_ORIGINAL_PACKAGE_ID

starforge fred-workspace ddp-migration-acquire --connection /PRIVATE/fred-client.json \
  --workspace macro --id ORIGINAL_MIGRATION_ACQUISITION --revision ORIGINAL_ACQUISITION_REVISION \
  --migration ORIGINAL_SAVED_MIGRATION_ID
~~~

Source-ID continuation belongs to the same original pending or completed import. The acquisition ID belongs to the same saved migration and selected source batches. Keep those original identities when receiving an interrupted return.

### Complete files, retained chunks and versioned projects

~~~sh
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --workspace macro --kind ddp-crosswalk --crosswalk ORIGINAL_CROSSWALK_ID \
  --out /PRIVATE/original-board-crosswalk.json
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --workspace macro --kind ddp-package --package ORIGINAL_PACKAGE_ID \
  --out /PRIVATE/original-h15-package.json
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --workspace macro --kind ddp-migration --migration ORIGINAL_MIGRATION_ID \
  --out /PRIVATE/h15-migration-plan.json
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --workspace macro --kind ddp-receiving --receiving ORIGINAL_RECEIVING_ID --format html \
  --out /PRIVATE/h15-receiving.html
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --workspace macro --kind ddp-receiving --receiving ORIGINAL_RECEIVING_ID --format csv \
  --out /PRIVATE/h15-receiving.csv
starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --workspace macro --kind ddp-receiving --receiving ORIGINAL_RECEIVING_ID --format json \
  --out /PRIVATE/h15-receiving.json

starforge fred-workspace download --connection /PRIVATE/fred-client.json \
  --workspace macro --kind project --out /PRIVATE/h15-project.json
starforge fred-workspace bundle-inspect --source /PRIVATE/h15-project.json \
  --sha256 ORIGINAL_COMPLETE_PROJECT_FILE_SHA
starforge fred-workspace receive --source /PRIVATE/h15-project.json \
  --project /PRIVATE/RECEIVED_H15_PROJECT --sha256 ORIGINAL_COMPLETE_PROJECT_FILE_SHA
~~~

All file selections retain complete bytes and SHA256. Source files validate the original envelope identity; migration files validate the saved plan identity. Receiving downloads also match the native saved file manifest's format, byte count and SHA256 before saving. The maintained private save path preserves a different existing destination and reuses an identical complete file.

merchant_fred_file_read serves each selection through the same retained-file protocol. Keep the readId, full source selector, expectedSha256 and returned nextOffset for every continuation. The complete original file is obtained once, then its immutable private snapshot serves subsequent ranges. merchant_fred_file_release closes an unfinished read. After a read expires or the owner restarts, reopen the same selected file with its original expectedSha256 and offset.

A project containing DDP work without QCEW exports stellar-forge.fred-project-bundle.v5. A project containing QCEW county-report work exports stellar-forge.fred-project-bundle.v6, including a project that combines both families. Its full identity includes original state, observation captures, publication plans, analyst files and release captures/plans. The base economic/release arrays are present, including empty ones. DDP work retains all four complete ddpCrosswalks, ddpPackages, ddpMigrations and ddpReceivings arrays. QCEW work retains its original qcew extension with complete source captures and report file packages. Version 6 requires QCEW and all four DDP array slots; those slots are empty when its original state has no DDP activity. Earlier version 5 keeps its original optional-family shape: DDP arrays are present exactly when DDP work is present, and qcew is present exactly when QCEW work is present. Earlier QCEW-only and combined version 5 files still open with their exact original identity and original complete-source validation. The complete inspector calls the original QCEW source, CPI, saved profile, report-file and lineage validator when that family is present. The installed inspector and native receiver call the same pure DDP graph validator, recomputing the original sources, plans, receiving, file manifests and original operation chronology. Original economic and release validation remains part of this complete receiving.

Each raw source file is limited to 256 MiB; a complete DDP source envelope is limited to 384 MiB. Complete project v5 and v6 files are limited to 480 MiB. Workspace configuration maxDdpResponseBytes controls the DDP/project download allowance up to 480 MiB; its default is 480 MiB. Original maxResponseBytes and version 1–4 complete project limits remain 256 MiB. Source import requests have their isolated 384 MiB allowance. The authenticated MCP source import takes a configured host alias or retained source ID, keeping full original bytes outside its argument envelope.

Complete-file inspection validates the original graph in place and hashes canonical JSON in bounded chunks. The receiving command checks the selected file bytes and SHA256, then uses the original native receiver for its single complete graph validation. A received project's returned identity and inventory counts come from that successfully validated bundle. Source input inspection returns compact inventories; imports preserve the complete original input and validate it through the client without an additional parsed-model copy. The original compact identities and pretty-JSON capacity boundaries are unchanged.

Reopen the received directory through the original fred serve command and the same connection-record workflow. The imported project retains all original source identities and saved receiving files.

### Installed DDP methods and agent tools

| Typed client method | Installed command / merchant_fred_ suffix | Complete operation |
| --- | --- | --- |
| ddpSources | ddp-sources / ddp_sources | Inspect original source, migration and receiving inventories |
| ddpCrosswalk | ddp-crosswalk / ddp_crosswalk | Page original crosswalk rows and release/query filters |
| importDdpCrosswalk | ddp-crosswalk-import / ddp_crosswalk_import | Import a configured full source or continue its same staged ID |
| acquireDdpCrosswalk | ddp-crosswalk-acquire / ddp_crosswalk_acquire | Acquire the complete official original crosswalk |
| ddpPackage | ddp-package / ddp_package | Page original series or observations with retained source meaning |
| importDdpPackage | ddp-package-import / ddp_package_import | Import the complete original package envelope |
| previewDdpMigration | ddp-migration-preview / ddp_migration_preview | Review full package mapping, series and acquisition sections |
| saveDdpMigration | ddp-migration-save / ddp_migration_save | Save the same reviewed input and preview |
| ddpMigration | ddp-migration / ddp_migration | Read saved plan sections and retained receiving summaries |
| acquireDdpMigration | ddp-migration-acquire / ddp_migration_acquire | Resume all original FRED batches under one migration operation |
| ddpReceiving | ddp-receiving / ddp_receiving | Inspect original meaning, status counts and every comparison row |

The typed client returns complete inventory envelopes; the CLI and MCP provide revision-pinned inventory pages. Public declarations reference the original DDP crosswalk, package, migration, receiving and project DTOs. The [native project guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/PROJECT.md) covers the same durable source, plan, acquisition and receiving history.

## Complete current-publication customer editions

The original workspace now carries complete publication operations through six additional methods: `published_operations`, `published_operation`, `published_start`, `published_report`, `published_rows` and `published_file_read`. The same methods are declared in the typed client and installed workspace CLI.

Start with a saved migration and stable operation ID/original expectedRevision. The host retains the request before acknowledging it, collects the whole mapped publication, runs the original source-native comparison, retains public captures in the same project and packages all original sources, full report rows and the native project for independent receiving. Poll `published_operation`; continue the identical request after interruption.

Completed operations expose exact file names, complete sizes and SHA256. `published-download` streams one complete listed file directly to a create-only host destination and validates its full identity. The full `edition-package.tar.gz` carries original programme inputs, source manifest, every target transport, native project, complete comparison JSON/CSV/JSONL and HTML. `published_file_read` supplies verified chunks for hosts that require a tool-carried transfer; follow its returned byte offset to completion. Each report row retains exact numeric strings, unavailable codes and original byte locations.

Page `published_report` for source meaning and series context, then `published_rows` with the exact comparison ID and original source-series/status selection. Its `nextOffset` is an original-row cursor. The sparse native JSONL index avoids loading complete multi-hundred-megabyte observations into each operator response.

Existing completed native source programmes attach through the local `starforge fred ddp-publication attach` command using their original project and directory. The browser and remote methods use saved project IDs and allowlisted original files.
