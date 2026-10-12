# dbt run optimization

Inspect complete retained dbt runs, select useful improvement work, and carry a saved plan through a later observation and customer handover. The timing desk, typed client, CLI and Merchant tools operate one original dbt project. Existing artifact import, edition review, request recovery and portable project receiving remain the underlying implementation.

## Start a working project

The standalone source package requires Node 22.16 or newer and Python 3.10 or newer. Reading existing artifacts requires no dbt installation, database connection, warehouse credentials or external package downloads. In a new installation directory:

```sh
npm install --ignore-scripts --offline /absolute/tokenjunkielabs-dbt-run-optimization-0.1.0.tgz
./node_modules/.bin/dbt-project create --project /absolute/private/project --title "Warehouse improvement work"
./node_modules/.bin/dbt-project import --project /absolute/private/project /absolute/manifest.json /absolute/run_results.json
```

The import returns original content identities. Use those values to create an explicit edition with the original project command. Save the following input to `edition.json`, replacing the two placeholders with the returned identities:

```json
{"title":"Nightly close before change","manifest":"MANIFEST_SHA256","runs":["RUN_RESULTS_SHA256"],"request_id":"nightly-before"}
```

```sh
./node_modules/.bin/dbt-project invoke edition.create --project /absolute/private/project --input edition.json
./node_modules/.bin/dbt-optimize serve --project /absolute/private/project
```

Open the printed loopback URL followed by `optimization/`. The private browser key is generated in the original project's `http/token` file unless an existing private key file is selected. Enter it in the sign-in form; it is not part of the URL. The original artifact desk remains at `/` and provides the same import, edition, review and source operations. Stop the command normally to close its original owner and child receiving applications.

For an already-delivered project, receive its complete archive first:

```sh
./node_modules/.bin/dbt-project receive /absolute/editable-project.zip --destination /absolute/private/received --expected-sha ARCHIVE_SHA256
./node_modules/.bin/dbt-optimize serve --project /absolute/private/received
```

The native receiver creates the selected destination and retains every original artifact, edition, result binding and review revision. Repeating the same archive and destination recovers that original receiving operation. It never replaces a different project silently.

## Timing and workload

Select a baseline edition and one of its retained run-results files, then choose **Load selected runs**. An edition can contain several invocations: this desk always selects one explicitly instead of merging their timings.

**Timing** provides complete resource search and pagination, exact original SQL/context, declared materialization, status, thread and compile/execute stages. The overview separates invocation elapsed time, summed node execution time, execute interval coverage and concurrency. The dependency panel reports the longest path weighted by the selected nodes' execution times. It identifies unobserved dependencies and cycles rather than assigning them zero-cost successful execution.

The measures have different meanings:

| Measure | Meaning |
| --- | --- |
| Invocation elapsed time | The original top-level `elapsed_time` for the selected invocation |
| Summed node time | The sum of valid original `execution_time` values; overlapping work remains summed work |
| Execute active/span time | Union/span of complete, ordered, timezone-aware execute intervals |
| Execute concurrency | Sweep over those intervals; active observation count, not configured warehouse capacity |
| Weighted dependency path | Longest path over uniquely observed, timed manifest nodes; not a measured wall-clock critical path |

Raw source numbers and adapter values remain exact source text. Calculated finite timings are decimal strings; admitted decimal arithmetic uses a 4,096-digit working precision, and displayed ratios use 38 significant digits. Values outside the admitted numerical range remain unreported. UI display rounding does not change source or report data. Timestamps use Python's microsecond datetime resolution; source timestamp strings remain available in every row. Incomplete or reversed intervals do not receive calculated durations.

## Before and after

Select and load a follow-up run. **Comparison** retains the complete union of observed resource identities, including resources seen only before or after and repeated identities. A missing follow-up row is not a recovered failure or a measured improvement. Failed/skipped transitions remain visible. Repeated IDs are excluded from one-to-one timing calculations.

Paired totals use uniquely observed, source-matched resources with the same `success`, `pass` or `warn` status and a reported duration on both sides. Invocation elapsed-time change remains separate. Changed arguments, source definitions, versions and observed populations are visible. These comparisons report an observed difference; they do not establish that a proposed change caused it. A zero baseline has no calculated percentage change.

## Improvement plans

Add concrete resources from Timing or Comparison. Each action has an owner, target date, work state, intended change, optional proposed reduction and follow-up notes. The plan binds its full baseline and optional follow-up selection; switching the timing view does not silently rebind an existing draft.

Save with a name, reviewer and objective. The original project review writer creates an immutable revision. A repeated original request returns its existing revision. A conflicting expected revision preserves the browser draft and asks the operator to reopen the current saved revision before reconciling. Native saved history, not browser storage, is the transferable plan.

Work states are planned, in progress, implemented, measured and deferred. A proposed reduction is an operator hypothesis, not a forecast. Selecting a following observation adds its full source comparison; it does not automatically mark all actions successful.

The browser retains a workspace-scoped working draft and the original pending save request. Reopen the same project to recover an interrupted save. Once it has a definite failure, correct the input and save again; uncertain completion keeps the original request identity. The saved-history selector can reopen an earlier revision for inspection and deliberate reconciliation.

## Reports and complete handover

**Handover** creates JSON, CSV or HTML for the complete selected timing profile, comparison or saved plan. Reports include all rows, regardless of the current search or visible page. CSV protects display fields from spreadsheet formula interpretation. JSON carries full source metadata, adapter values, comparisons and saved action records; HTML supplies a readable complete customer report.

Export the whole native project to hand over editable work. The receiving page uploads the complete ZIP with a full digest, preserves its original chunked receiving identity, creates a named destination under the configured receiving root, and opens that same received project. Both the artifact desk and optimization desk use the received native owner. A received operator can save another revision independently while the sender's earlier history remains intact.

Use a complete project ZIP, not just a report, when the recipient needs to edit plans or inspect original artifacts. Use a complete report when a recipient only needs the issued analysis. Private HTTP keys, browser drafts and local pending-operation state are not a substitute for saved project revisions.

## CLI and typed Node client

`dbt-optimize call ACTION --project DIRECTORY --input FILE` uses the same native engine. Available actions are `inventory`, `profile`, `compare`, `plans`, `plan`, `node`, `save`, `report`, `object.describe`, `object.read`, `export`, `receive` and `binding`. Input can be `-` for stdin. `--output FILE` creates a complete response file without replacing an existing file.

```js
import {DbtOptimizationClient} from '@tokenjunkielabs/dbt-run-optimization';
const client = new DbtOptimizationClient({directory: '/absolute/private/project'});
try {
  const inventory = await client.inventory();
  const edition = inventory.editions.find(item => item.runs.length);
  const selected = {edition: edition.id, run: edition.runs[0].id};
  const profile = await client.profile(selected);
  const file = await client.report({selection: selected, format: 'json'});
  await client.copyObject(file.sha256, '/absolute/new/complete-run.json');
  console.log(profile.summary);
} finally {
  await client.close();
}
```

A client retains one Python process and its immutable profile cache across calls. Complete responses are framed by request identity; a configured response ceiling fails explicitly instead of truncating. Large populations can use a full report plus verified chunk receiving. `close()` drains submitted native requests and releases the child process. No shell is used for execution.

For `save`, supply `{name, reviewer, objective, before, after?, actions, expected_revision, request_id}`. Reuse that exact input and request ID when the outcome is unknown. Read `client.d.mts` for complete typed selections, resource rows, comparisons, plans and files.

## Merchant and Applications integration

The additive `dbt-optimization` contribution registers installed `starforge dbt-optimize`, Applications **dbt run optimization**, typed exports and seven source-owned Merchant tools. Select it together with `dbt-projects`, or use the complete `dbt-optimization` source selection. Existing seller, buyer, publisher and project source remains selected; the standalone npm package is the local artifact/optimization application, not a replacement payment host.

The Applications adapter delegates preparation, input binding, startup identity checks and managed ownership to the original dbt provider, then opens `/optimization/`. It pins the complete additional application source. Start either project desk for a given native project owner; use its original artifact link to work in the same process rather than opening a second owner for the same directory.

Merchant configuration uses the original private `stellar-forge.dbt-project-connections.v1` file with workspace aliases, initialized directories, configured input aliases, export directories and receiving parents. Pass that file through the host's `dbtOptimizationConnection` field. The provider preserves the existing host configuration reader; tools cannot supply an arbitrary output directory or bearer key.

The tools are `merchant_dbt_opt_projects`, `merchant_dbt_opt_query`, `merchant_dbt_opt_save`, `merchant_dbt_opt_report`, `merchant_dbt_opt_export`, `merchant_dbt_opt_receive` and `merchant_dbt_opt_file_read`. Query pages carry `offset`, `limit`, `total` and `next_offset`. Profile sections include resource rows, threads, concurrency buckets, dependency-path resources, unobserved dependencies and cycle/downstream resources. The complete profile remains available as a retained JSON report. Read files until their original `next_offset` is null and verify the full digest.

## Build and source

```sh
python optimization/package.py --destination /absolute/new/package-output
```

Run from an intact original dbt source directory, or use the absolute script path. The builder invokes only local `npm pack --ignore-scripts`, carries the original source directory with its license, records every packaged source identity and produces an npm-compatible archive. No registry publication or install lifecycle script is required. The source selection for the full Merchant installation is separate and continues to use the original distribution builder.

The included reference customer, when supplied with a delivery, is an authored operating example. Its timings demonstrate interpretation and workflow; they are not measurements from a customer warehouse.

Artifact contracts: [dbt run results](https://docs.getdbt.com/reference/artifacts/run-results-json), [run-results schema v6](https://schemas.getdbt.com/dbt/run-results/v6/index.html), and [dbt manifests](https://docs.getdbt.com/reference/artifacts/manifest-json). Original artifacts remain the authority for version, invocation identity, execution outcomes and source definitions.
