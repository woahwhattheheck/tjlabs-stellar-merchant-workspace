# IATI results monitoring and complete receiving

This is the Results workspace in the existing IATI application. An analyst can inspect the complete publisher's results, review exact indicator and period selections, retain a named interpretation, compare later report revisions and deliver a complete editable project.

The same original IatiWorkspace owns the source files, SQLite connection, mutex and process lease. The Results module uses the original IATI reader. The financial portfolio, native dataset, data-quality and participant-publishing workflows remain available in the same application.

## Start in the installed application

Open the original IATI console through Applications, or the existing command:

~~~sh
node iati/cli.mjs --workspace /absolute/private/iati-workspace serve
~~~

Use the complete private console URL printed by that original process. The **Results** navigation item is added to that console; it uses the existing Bearer session and local-origin checks.

The operator has four connected work areas.

| Area | What the operator does | What is retained |
| --- | --- | --- |
| Source indicators | Choose an already-retained publisher, inspect its original result/indicator coverage, page indicators and read every selected baseline, period, target and actual | Complete source identity, original element positions, language, measure, direction, dimensions, locations, raw values and findings |
| Review project | Choose source editions and reporting coverage, assign explicit unit/direction meaning, select exact comparable records, preview and save a named review | Immutable complete definition and report, original projection identities, parent revision, exact request and named review |
| Compare revisions | Choose two saved revisions and, for different publisher editions, explicitly pair the original indicators | Full source-value changes separated from reporting-filter and interpretation changes; additions/removals remain visible |
| Receive / export | Download readable reports or the complete editable project, receive an original packet, inspect its source review and record a new local review | Exact archive bytes, all original source XML, full revision/request/receiving history and the existing local head |

Source intake remains the original **Publisher sources** flow. Results does not fetch a publisher or run a native financial build. Inspecting a source retains a derived projection of the original bytes in the same private workspace.

A document with no result elements is useful source coverage. Its report says that it contains no reported results. The application does not substitute activities, budgets, transactions or a fabricated target as an outcome indicator.

## Original meaning is part of the record

The implementation reads [IATI 2.03 result](https://iatistandard.org/en/iati-standard/203/activity-standard/iati-activities/iati-activity/result/), [indicator](https://iatistandard.org/en/iati-standard/203/activity-standard/iati-activities/iati-activity/result/indicator/), [baseline](https://iatistandard.org/en/iati-standard/203/activity-standard/iati-activities/iati-activity/result/indicator/baseline/) and [period](https://iatistandard.org/en/iati-standard/203/activity-standard/iati-activities/iati-activity/result/indicator/period/) records through the original iati_source.walk and xml_source.Node.

Activity and result records are retained alongside their indicators. Their multilingual titles/descriptions, reporting organisation, location definitions, result type, aggregation status, references and document links remain in the report and machine-readable export. A result without indicators remains visible when it is inside selected coverage.

An identity is the SHA256 of the complete original source ID plus the exact original element locator. The same title in a following publisher file does not silently become the same indicator. The report keeps the publisher's original identifiers and one-based element positions. It can preserve repeated target/actual records without inventing new source IDs.

The [IndicatorMeasure](https://iatistandard.org/en/iati-standard/203/codelists/IndicatorMeasure/) codes are:

| Original code | Meaning | Results behavior |
| --- | --- | --- |
| 1 | Unit | Preserve the original decimal text; require the analyst's explicit unit before selected arithmetic |
| 2 | Percentage | Preserve the original decimal text; differences are labelled percentage points |
| 3 | Nominal | Preserve original text and categories; do not coerce category codes into performance numbers |
| 4 | Ordinal | Preserve original ordering/source text; do not assume equal numeric distances |
| 5 | Qualitative | Preserve original comments and documents; absence of a numeric value is meaningful |

An absent value is distinct from the empty string, the string "0" and a reported decimal. The CSV includes raw_value_present as well as raw_value. Every original XML fragment and its hash remain available in the JSON and full project.

The original IATI day() helper retains the reported calendar day and original date text. It does not shift a publisher's period to another day through a timezone conversion. Invalid, incomplete, repeated or reversed date definitions remain findings. A reporting filter selects overlapping original periods; it does not prorate values.

## Selecting an explicit comparison

The page first shows the original indicator and its periods. Choose one target and one actual **from the same original indicator and period**. Their complete dimension and location context must agree. A reference to an absent or ambiguous original activity location prevents automatic comparability.

The application shows possible unique pairs as suggestions. A suggestion does not calculate a result. The selected binding is a separate retained operator choice.

A unit interpretation contains indicatorKey, unitLabel, direction and note. Direction can use the publisher's reported ascending attribute, or an explicitly documented higher/lower selection. "None" preserves inspection without a direction claim.

A comparison binding contains periodKey, targetKey, actualKey, an optional baselineKey, operation and note. Keys must name the exact retained source records.

| Selected operation | Calculation and conditions |
| --- | --- |
| inspect | Keep target, actual and any chosen baseline together without calculating performance |
| difference | actual minus target, with exact Decimal arithmetic; percentage measures produce percentage points |
| target-ratio | actual divided by target, multiplied by 100; requires a positive target and an explicit higher-is-better direction |
| baseline-progress | (actual minus baseline) divided by (target minus baseline), multiplied by 100; requires a nonzero target change consistent with the selected direction and a valid earlier baseline |

Numeric operations require Unit or Percentage, finite supported XML decimals, a valid original period, an interpretation note and a pair-selection note. A Unit also requires the stated unit label. Baseline comparison retains its original year/date and refuses an invalid or later baseline.

Differences use Decimal with sufficient precision for the supported source lexical values. Ratios are emitted as strings rounded to twelve decimal places. JSON and CSV do not replace them with browser floating-point values.

A selected calculation can remain "not comparable" with its precise reason. The report preserves the original observations and the operator's attempted selection. No sum is calculated across unrelated activities, indicators, periods or dimensions, even when their numeric strings look similar. No local review is represented as a publisher endorsement or impact-assurance opinion.

## Revisions, review and interrupted replies

New projects need name and one to thirty-two source IDs. Saved definitions include source selection, filter coverage, interpretations, exact comparison bindings and a review record.

An edit includes the current project id and expectedRevision. The original writer rejects a stale browser tab before a new revision can replace its current basis. Historical editions remain immutable.

Each mutation uses one original requestId. The request body and committed response are written in the same SQLite transaction as the affected edition, comparison or selected head. An exact replay returns the original committed result even if the current head has since moved. A request ID with different input is rejected.

The browser stores the complete pending input in its session storage **before** sending. Storage is bound to the original results workspace identity. After a lost reply:

1. **Read original result** resolves that retained request.
2. **Continue exact request** sends the same complete input with the same ID.
3. If the input has not committed, **Cancel uncommitted request and edit draft** records an explicit cancellation of that exact input under the same original mutex.

Cancellation cannot withdraw a committed review. A later arrival of the original cancelled input cannot commit it. The draft remains available for correction, and the cancelled request is part of the exported provenance.

A reviewed edition requires a named reviewer and note. These are local authorship records in the existing private console. They are not a new role or authentication system. A receiving operator retains the earlier review as history and writes a new revision for their own interpretation.

Selecting an older local head is an explicit, revision-checked action with an actor and note. It does not delete later editions. A complete incoming packet preserves an existing local head; the receiver can inspect and explicitly select a received edition afterward.

## Source change versus reporting change

A report stores the complete original source-value identity before filtering periods. Revision comparison therefore distinguishes:

- Changes in the publisher's complete original baseline/period/value content.
- Changes in the values visible under the chosen reporting-period filter.
- Changes in selected coverage.
- Changes in interpretation or pair selection.

Changing periodFrom or periodTo against the same original indicator does not become a "publisher changed its results" finding. Full original period counts and selected period counts are reported separately.

Identical source-bound indicator keys pair directly. Across different XML editions, the analyst must provide a one-to-one before/after correspondence and its reason. Unpaired records remain explicit additions or removals. Activity/reporting-organisation identity differences are visible even when a pair is deliberately selected.

## Complete publication files

Both packet types contain a readable report plus complete selected machine-readable tables.

| File under reports/ | Contents |
| --- | --- |
| report.html | Printable self-contained report with source coverage, activities/results, original measures, selected observations, interpretation and findings |
| report.json | Full selected report, original values and exact report identity |
| edition.json | Complete immutable source-bound review edition |
| activities.csv / results.csv | Original parent meaning, references, source positions and aggregation context |
| indicators.csv / periods.csv | Exact selected indicator and period identities |
| values.csv | Every selected original baseline/target/actual, source value presence, raw value, dimension/location and original fragment identity |
| comparisons.csv | Each explicit selected comparison and its original values, calculation or reason |
| findings.csv | Complete source-bound review findings |
| revision-comparisons.json | Retained full comparisons between report revisions |
| analysis-contract.json / README.txt | Exact interpretation rules and file semantics |

HTML text is escaped and uses no remote scripts, fonts or analytics. The CSV is a machine-readable source representation: the original cells are preserved. Treat untrusted publisher text as data when importing it into a spreadsheet; do not enable formula execution.

A **report-only** ZIP is a publication. It cannot be imported as an editable project.

A **complete project** ZIP additionally includes:

- snapshot.json with every original edition, exact projection reference, saved comparison and original request record.
- Every original publisher document referenced by the complete history.
- Each earlier received snapshot needed by the recursive receiving history.
- The selected publication files and an exact full-member manifest.

The original IATI packet writer owns staging and complete-file publication. Exports are create-only. If a process ended after completing the same output, the existing exact packet is returned. An unrelated output at that path is not overwritten.

## Receiving and limits

Receiving first checks the complete archive: paths, regular-file types, declared sizes, decompression limits, every member hash and the selected manifest. It reconstructs every source projection using the original XML reader, rebuilds each report from its frozen definition, verifies all original edition/request/comparison links and reconstructs the readable publication bytes.

Only then are original source bytes retained and immutable project histories adopted. A failed adoption can leave verified content-addressed source objects; it does not commit half a review or select a partial head. Prior receiving snapshots remain bound to the same original source graph.

Incoming requests are retained as provenance inside the original snapshot. They are not executed or inserted into the receiving operator's local request namespace. Financial datasets, provider captures, payments and external publication are not replayed.

The receiver keeps an existing local head. Repeated receiving returns the original receipt; that historical receipt's localHeadAfter describes its original event. Read the current project to see a head that was selected later.

Limits are explicit and symmetric:

- Complete original publisher XML: the original workspace's 256 MiB source limit.
- One source projection, definition, edition or snapshot JSON: 64 MiB.
- Selected sources: at most 32; indicators: at most 100,000; value records: at most 500,000.
- Complete expanded project: 3 GiB **including manifest.json**; the original compressed-file delivery bound is 4 GiB.
- Original member-count limit includes the manifest; prior receiving graph: at most 512 distinct snapshots.
- Indicator pages: 1–100 records.

These limits reject a complete oversized selection. They do not silently trim XML, source rows, period observations or revision history.

## CLI and Python

All operations are available through the original installed command, with --workspace before the subcommand:

~~~sh
node iati/cli.mjs --workspace /absolute/private/iati-workspace results-list
node iati/cli.mjs --workspace /absolute/private/iati-workspace results-source --source SOURCE_SHA256
node iati/cli.mjs --workspace /absolute/private/iati-workspace results-indicators --projection PROJECTION_SHA256
node iati/cli.mjs --workspace /absolute/private/iati-workspace results-preview --file /absolute/private/definition.json
node iati/cli.mjs --workspace /absolute/private/iati-workspace results-save --file /absolute/private/request.json
node iati/cli.mjs --workspace /absolute/private/iati-workspace results-export --id PROJECT_SHA256 --out /absolute/private/project.zip
node iati/cli.mjs --workspace /absolute/private/iati-workspace results-receive --file /absolute/private/project.zip
~~~

Other commands are results-indicator, results-project, results-report, results-history, results-comparisons, results-compare, results-adopt, results-cancel, results-operation and results-report-export. Use --help on the original subcommand for its exact path, ID, revision and input fields.

The original Python class is available as workspace.results:

~~~python
from iati_workspace import IatiWorkspace

with IatiWorkspace("/absolute/private/iati-workspace") as workspace:
    results = workspace.results
    observed = results.project_source(source_id)
    original = results.indicator(observed["projection"]["id"], indicator_key)
    preview = results.preview(definition)
    saved = results.save({**definition, "requestId": original_request_id})
    packet = results.export(saved["id"], output_path, saved["revision"])
~~~

Pass the complete existing request object again when recovering it. Do not generate a new request key because the response was interrupted.

## HTTP, JavaScript and Merchant tools

Routes live beneath /api/iati/results on the original authenticated server. Read routes are inventory, indicators, indicator, operation, project, report, history and comparisons. Mutation routes are source, preview, save, compare, adopt, cancel and receive. Exact source and complete packet downloads use source/download, export and report/export.

The unchanged console client connection exposes seventeen Results methods:

resultsInventory, resultsSource, resultsIndicators, resultsIndicator, resultsPreview, resultsSave, resultsCompare, resultsAdopt, resultsCancel, resultsRequest, resultsProject, resultsReport, resultsHistory, resultsComparisons, resultsExport, resultsOriginalSource and resultsReceive.

~~~javascript
import { connectIatiWorkspace } from './iati/client.mjs';

const client = await connectIatiWorkspace({
  consoleUrlFile: '/absolute/private/original-console-url'
});
try {
  const inventory = await client.resultsInventory();
  const edition = await client.resultsSave(originalRequest);
  const response = await client.resultsExport(edition.id, {
    revision: edition.revision
  });
  // Consume response.body into a complete file, or cancel it.
} finally {
  await client.dispose();
}
~~~

Disposing this client aborts only its own HTTP requests. The original Applications owner retains the server.

The existing Merchant source provider exposes twelve Results tools:

| Tool suffix after merchant_source_iati_results_ | Native operation |
| --- | --- |
| inventory | Snapshot-paged projects, projections or receipts |
| source | Original retained XML projection |
| indicators / indicator | Paged overview and complete original indicator |
| project / report | Selected original review and source-bound report |
| history / comparisons | Complete retained histories through original snapshot paging |
| request | Exact interrupted-request reconciliation |
| preview | Complete proposed definition and calculated report |
| action | Original save, compare, adopt or exact uncommitted cancellation |
| export | Complete project or report-only native file |

Exports use the existing retained full-file reader and chunk identities. Receive an editable Results export through merchant_source_import, using the original configured packet handle or a retained export from a declared workspace. Results adds no second source registry, console, capture system or download service.

## One complete receiving programme

results/receiving.py is an operator continuation over the same public APIs and original workspace. It takes a single explicit selection JSON. It does not download source XML or manufacture indicator observations.

The selection schema is stellar-forge.iati-results-receiving-selection.v1 and requires:

- operationId: a stable original programme ID up to 120 characters.
- root: a new private absolute directory, or that same retained receiving directory on continuation.
- sources: complete original private input files with path, sha256, bytes, label and name.
- definition: initial report name, source selection, filters, interpretations and exact bindings.
- review: the named reviewed interpretation and its note.
- coverageDefinition: the complete second reporting selection, using actual source keys.
- receivingReview: the named local receiving review.

All three definitions/reviews are explicit operator input. The programme never invents a unit, desired direction or target/actual pairing to make a source appear numeric.

~~~sh
python3 -B iati/results/receiving.py --config /absolute/private/receiving-selection.json
~~~

It retains original input/projection identities, saves the draft and named review, recovers that exact committed request, compares the next reporting selection, reconciles a delayed stale tab through the original cancellation journal, exports the full original project/report, receives it in an independent original workspace, saves the receiving review, inspects an older local head, proves repeated receiving preserves that head, explicitly selects the current review, exports the next generation, independently receives it and cold-reopens the original receiver.

Each checkpoint records the actual source execution identity. Re-running the programme with the same selection reconciles the same original request IDs and retained workspaces. It does not seed a second project after a lost reply. A completed result is reused only after its exact artifacts and original review are read back.

result.json identifies actual source counts, selected calculations, original and receiving edition/report identities, exact archive sizes/hashes and the concrete replay/receiving/reopen outcome. A zero-results source yields zero numeric comparisons. Native financial/provider/publisher counts remain zero for this programme because it does not call those workflows.

The final received-results-project.zip is the complete editable handover. Keep it with result.json, the selected source metadata and the exact application release used to receive it. Private console URLs and connection tokens are not included in the generated project or report.


### Continue that same case through the original browser and Merchant tools

After the native receiving selection completes, use its original root. This
continuation opens the existing receiver workspace. It creates no second case,
fetches no publisher data, and builds no financial dataset.

```sh
python3 -B results/receiving_console.py \
  --root /absolute/original-results-receiving \
  --node /absolute/installed/node \
  --playwright /absolute/installed/playwright \
  --chromium /absolute/installed/chromium \
  --merchant-root /absolute/stellar-forge/mcp-merchant-operator \
  --reviewer "Your named receiving reviewer" \
  --review-note "Your authored local review basis for these exact source values"

```


The programme runs the original authenticated IATI console, then co-locates its
browser, original client and Merchant consumer in that process context. Use
Node with built-in fetch and AbortSignal.any, an installed Playwright Chromium
driver, and the actual compatible Chromium executable. It installs no runtime.

The browser opens the actual saved review, inspects original source records,
previews and saves one named receiving revision, reads its existing comparison,
downloads both report and editable project, receives that same exported project
without replacing the local head, and reopens the same page at mobile and desktop
sizes. The programme then uses the original Merchant tools to read the saved
edition and request, export its full project, and stream every retained byte
through the original verified chunk reader.

A saved browser request is retained before it is forwarded to the original
endpoint. Interrupted continuation reconciles that exact request and input.
Completed review actions are not replayed as new revisions. The selected
Merchant export is also pinned before reading or publishing its handover alias.

The private console URL and runtime selection remain under \`console-private/\`;
they are excluded from exported Results projects. Outputs are under
\`console-receiving/\`: complete-results-project.zip, report and browser project
ZIPs, three page images, browser-result.json, and console-result.json. The final
console result is written only after the browser and all client/file handles close
and the same original workspace is cold-reopened. A completed rerun checks its
retained artifacts and exact saved review before returning the original result.
