# Receive a following catalogue edition in the saved customer project

Operation: **DCAT-RECURRING-CATALOG-20261013-390E**

This programme uses the installed application's original workspace, HTTP source
acquisition, GSA migration review, release history and complete archive receiver.
Run it after the preceding customer programme has closed its workspace owner.
Use the actual saved project and the same selected Python runtime.

The companion application guide is
[Recurring catalogues](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/RECURRING_CATALOGS.md).
It covers browser operation, the current-owner due command and agent interfaces.

## Select the complete source and project

Keep the current Git commit/tree and installed runtime manifest with this
operation. `sourceRoot` must be the complete selected source tree, including the
unchanged GSA vendor and Python dependency files. The programme imports the
original `ckan/model.mjs` and `ckan/archive.mjs` from that tree.

Supply an absolute prepared Python executable. The default explicitly selected
profile is `portable-python312`; use `original` for the prepared Python 3.13
runtime. Both use the existing setup guides and locked dependencies.

Use a new private output directory on an actual writable filesystem. The
programme writes complete catalogue/report downloads, saved operation results
and a full working-project archive there. Keep temporary storage and the
surrounding upload/preservation step inside the same foreground lifetime when
the host volume is ephemeral.

A complete example configuration is:

~~~json
{
  "projectDirectory": "/absolute/private/completed-catalogue-project",
  "outputDirectory": "/absolute/private/recurring-receiving-output",
  "python": "/absolute/private/dcat-python/bin/python",
  "runtimeProfile": "portable-python312",
  "publicSourceUrl": "https://gsa.gov/data.json",
  "label": "GSA published catalogue",
  "reuseMappingIndexes": [],
  "normalizeV3": false,
  "rehearseRelease": true
}
~~~

The default baseline is the saved project's currently active accepted release.
Set `baselineReleaseId` to an exact retained release UUID to choose another,
or explicitly to null for an initial review. Populate `reuseMappingIndexes`
only from that accepted report's actual zero-based identity-mapping inventory.
An empty array carries no prior decisions.

Set `sourceId` to reuse an existing retained source whose exact URL matches the
selected publication URL. Omit it to create a new retained source configuration.
The programme records that allocated source ID for subsequent continuation.

The public GSA URL is an original publisher source, documented in
[the data.gov GSA JSON record](https://catalog.data.gov/dataset/gsa-json).
The acquired bytes, timestamps, HTTP result and record counts come from the
actual invocation.

## Invoke the original operation

Save the configuration in a private JSON file. From any working directory:

~~~sh
node --input-type=module - /absolute/complete/source /absolute/private/recurring-config.json <<'JS'
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const sourceRoot = resolve(process.argv[2]);
const config = JSON.parse(await readFile(resolve(process.argv[3]), 'utf8'));
const modulePath = join(sourceRoot,
  'operations/dcat-recurring-catalog-390e-20261013/run-recurring-catalog.mjs');
const { runDcatRecurringCatalog } = await import(pathToFileURL(modulePath).href);
const result = await runDcatRecurringCatalog({ ...config, sourceRoot });
console.log(JSON.stringify(result, null, 2));
if (!result.complete) process.exitCode = 1;
JS
~~~

The original owner lease prevents overlapping project writers. A browser or
managed application using this project must complete its current operation and
close before this standalone programme opens that lease. For recurring checks
while the application remains running, use the existing authenticated
`dcat acquire-due --startup-file` command described in the application guide.

## What the programme completes

1. Read the selected accepted release and verify its full candidate and review
   bindings.
2. Save or reopen the chosen source, then perform a real publisher acquisition.
   The first check must be ACQUIRED, UNCHANGED or NOT_MODIFIED before reviewing
   the source as a newly checked edition.
3. Perform a following conditional check when the publisher's retained
   Retry-After permits it. A deferred deadline and every returned outcome remain
   in the result.
4. Download the original HTTP receipt and actually retained response from each
   attempt, along with the acquired catalogue.
5. Prepare the following-edition review against the exact accepted baseline,
   carrying only selected identity decisions. Download the complete review and
   candidate when the engine produces one.
6. If the review is READY and the project had an active release, rehearse
   cutover and restore that original accepted candidate through the existing
   immutable release operations. Both release IDs and downloads remain saved.
7. Export the complete original workspace, inspect its archive and receive it
   into the output directory's `received-workspace`. Reopen that project,
   compare the entire saved DCAT state and check its original HTTP files again.

A corrections-needed review is an inspectable customer result. It keeps the
source, validation findings, comparisons and candidate for the operator's next
correction. Each actual acquisition status remains separate from the overall
programme's completed handover.

## Consume the actual result

The returned value and `result.json` have schema
`commons.dcat-recurring-catalog-receiving.v1`.

| Field | Retained identity |
| --- | --- |
| sourceId / source | Actual source UUID, current configuration and source-version history |
| catalog | Acquired catalogue ID, byte count, profile and SHA-256 |
| baseline | Chosen release/review IDs, candidate/review hashes and selected mapping indexes |
| review | New review ID/state, full report hash, intrinsic review hash, candidate hash and counts |
| conditionalRefresh | Actual following check or retained retry deadline |
| releaseRehearsal | Selected/restored release IDs and restored original candidate hash |
| phases | Complete original workspace operation results |
| downloads | Actual file path, byte count, SHA-256 and original item identity |
| archive | Complete archive identity/hash, received directory and whole-history comparison |
| complete | All required current-edition and complete handover phases finished |

The report's `reviewSha256` binds its intrinsic reviewed result;
`reportSha256` binds the full saved report file. Keep both meanings unchanged.

When a publisher request or a review operation fails, the programme still
attempts to archive and receive the complete retained history. The result
includes the original error and any receiving error. Use those actual attempt
and operation IDs for continuation. Preserve the complete output directory
before its working volume ends.

## Continue in the browser and through agents

Open either the original saved project or the received project using the same
installed application revision. In **Catalogue migration**, select the returned
source ID, inspect its complete acquisition history and open the returned
`review.id`. Review the accepted-baseline mappings and complete original files
before selecting any following release.

The existing browser, CLI, MCP and Applications interfaces share the same saved
source, acquisition, review and release identities. The complete archive
retains those histories for the next operator.
