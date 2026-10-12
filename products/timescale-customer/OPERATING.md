# Timescale commissioning and customer reconciliation

This selected product carries a complete native Timescale commissioning report
into the original DuckDB customer workspace. The original source bytes,
PostgreSQL text and NULL values, declared OIDs and complete report history stay
bound to every reviewed immutable edition. Operators review field meanings and
types, select baseline and observed editions, compare the complete rows, retain
engineer decisions and receive a portable customer warehouse with the same
source and report identities.

The existing Timescale workspace owns native capture, commissioning and its
immutable report. The existing Python customer owns intake, edition import,
reconciliation, reports and export. The installed Applications and MCP clients
use these original owners. Importing a report performs no new source capture or
purchase.

The `timescale-customer` selection composes the complete Timescale contribution
with the maintained paired reconciliation, customer Python runtime, merchant and
buyer MCP, Applications and existing local dataset paths. The full source
distribution also includes this workflow.

## Build and install this product

Use Linux, Node.js 22.16 or later, Python 3.11 or later, Git, npm and util-linux
`flock`. Operating directories must support file locks, atomic publication and
fsync. Keep customer data and private configuration outside the source checkout.

From a checkout of this repository, build the committed product selection:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . --ref HEAD --selection timescale-customer \
  --out /absolute/private/packages/timescale-customer
~~~

Keep the returned original archive, SHA-256 and manifest together. The builder
records the resolved Git commit and packages the selected registrations,
complete source dependencies, browser assets, Python customer, Parquet decoder
and this guide. Its existing interrupted-build recovery uses that same source
selection and output directory.

Install the source package into a new application directory:

~~~sh
npm install --ignore-scripts --offline --omit=optional /absolute/path/to/package.tgz
npx --no-install starforge doctor
~~~

The installed command is `starforge`. Before installation, use the original
source dispatcher in its place:

~~~sh
node stellar/scf-starforge-20261009/distribution/cli.mjs
~~~

Prepare the declared merchant/MCP dependencies through the existing installer.
Replace the archive and hash with the actual builder result:

~~~sh
starforge runtime-install prepare \
  --dir /absolute/private/runtimes/timescale-customer \
  --archive /absolute/path/to/package.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature timescale --feature schema --feature openapi --feature mcp --operator

starforge runtime-install install \
  --dir /absolute/private/runtimes/timescale-customer

starforge runtime-install run \
  --dir /absolute/private/runtimes/timescale-customer -- source
~~~

The installer retains the selected archive, exact dependencies, original
operation and recovery state. Use the
[original runtime installation guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
when transferring dependencies or continuing an interrupted installation.

### Open Applications and install the Python customer

Create a new runtime workspace, or use an existing one:

~~~sh
starforge runtime-workspace init \
  --workspace /absolute/private/runtime-workspace

starforge runtime-workspace attach \
  --workspace /absolute/private/runtime-workspace \
  --runtime /absolute/private/runtimes/timescale-customer \
  --label 'Timescale commissioning and customer reconciliation'

starforge runtime-workspace serve \
  --workspace /absolute/private/runtime-workspace --port 0
~~~

Open the local URL returned by the server. Select the attached runtime and
**Python & workbooks**, review the installed Python interpreter, select the
**duckdb** extra, then resolve the exact wheels, install offline and select that
environment. This source declares `duckdb==1.5.6`.

In **Applications**, open the existing **DuckDB dataset workspace** that owns
the intended customer history. For a new project, create that application
with the selected Python environment and a private customer directory. Open
**Timescale intake** and retain the actual completed commissioning report before
reviewing its two sources and defining a pair. Start
the selected application and retain its actual customer workspace ID. The service writes its current
`duckdb-launch.json` inside the customer directory; `workspace_id` is the
saved 32-character hexadecimal identity used by the original browser and agent
connection.

A source installation can run the same original customer directly:

~~~sh
umask 077
python3 -m venv /absolute/private/duckdb-venv
/absolute/private/duckdb-venv/bin/python -m pip install \
  "/absolute/source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python[duckdb]"

/absolute/private/duckdb-venv/bin/python -m stellar_forge_buyer.duckdb_cli \
  --workspace /absolute/private/customer-warehouse serve --open
~~~

Keep the original customer service running while using the reconciliation
browser or native agent connection. It retains its own database, request history and listener. The
[DuckDB customer guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/DUCKDB.md)
and [Python runtime guide](../../stellar/scf-starforge-20261009/distribution/python-runtime/WORKSPACE.md)
cover both installation routes and original customer recovery.

For Parquet source packages, select an existing trusted interpreter containing
the original decoder's `pyarrow==26.0.0` dependency through
`SF_FRICTIONLESS_PYTHON`. Keep the included Wherobots
[source requirements](../../stellar/scf-starforge-20261009/sf30-seller-sdk/wherobots/source/requirements.txt)
with the installation. The local Parquet reader uses PyArrow; Wherobots remote
SDK, account and job operations are separate parts of that component's declared
environment. CSV, TSV and JSON source capture uses Python's standard library.


## Obtain the original commissioning input

Operate the existing project using the [Timescale operating guide](../timescale/OPERATING.md).
Retain its actual complete immutable commissioning JSON report. The BASELINE
and OBSERVED native source tables, full source bytes, revision chain and scope
must be present in that original report.

Use the report downloaded from the original commissioning UI or its retained
report-file client. Keep its actual filename and SHA-256. A preview, a manually
rewritten table or a source acquisition receipt is not this report format.
The source can declare provider completeness; the customer retains that
declaration and does not infer external historian coverage from the received
row count.

The following operator procedure is also served by the customer at
`/timescale-intake/OPERATING.md`. A frozen original copy is retained with each
report and travels inside the customer warehouse.

## Operate the original intake

This workspace takes a complete original Timescale commissioning report into the
existing DuckDB customer workspace. You can inspect its native source tables, review
the meaning and SQL representation of every field, import immutable editions, and
save a pair for the existing reconciliation workflow.

Open **Timescale intake** from Dataset workspace or Dataset reconciliation. The page
uses the same private launch link, customer workspace identity, database and request
journals. It starts no additional listener.

## Complete workflow

1. Download the complete JSON report from the original Timescale commissioning
   workspace. Keep the original file unchanged.
2. In **Commissioning reports**, select that file and choose **Retain report**.
3. Open the retained report and select one of its native source tables.
4. In **Source and field review**, inspect the original rows and review all fields,
   their SQL types, roles, meanings, units and time interpretation.
5. Choose **Review complete source**, inspect the returned review, and choose
   **Import reviewed edition**.
6. Repeat for the other original source table or report edition.
7. In **Reviewed editions**, choose which immutable edition is the baseline and
   which is the observed source.
8. In **Pair and compare**, choose matching keys and compared fields, review the
   complete definition, and save it.
9. Open the saved pair in **Dataset reconciliation**. Run the original paired
   accounting, review row and group differences, record decisions, save a report,
   and export the full portable customer handover.

A field or row filter changes the displayed preview. It does not change the
complete source, reviewed mapping or imported row set.

## Original report and source scope

The input is the original exported commissioning JSON report. It contains the
complete immutable revision chain and the native source files as exact UTF-8
content. Report SHA-256, source SHA-256, table digest, commissioning identifiers,
source identifiers, source role and contract revision travel with the imported
edition.

The intake validates and retains its own report format. It does not create a
purchase or delivery receipt for the report. Acquired SF88 and SF100 datasets keep
their existing delivery validation and import paths.

A source can have the role **BASELINE** or **OBSERVED**. That role identifies its
place in the original commissioning report. The operator still chooses the two
specific imported editions used by a saved pair.

The source panel distinguishes a provider completeness declaration from a source
that has no such declaration. Importing every row of a retained native table does
not establish coverage of an entire external historian or provider account. The
original scope note and completeness declaration remain available with the
edition and exported handover.

**Download original report** returns the retained original file. Its complete byte
count and SHA-256 are shown beside the report, so the original report can be
reopened independently.

## Native values and reviewed types

Commissioning source cells are PostgreSQL text or SQL NULL. The original column
OID is retained. The default DuckDB mapping stores every native field as
`VARCHAR`, preserving the native textual value.

The preview marks SQL NULL and an empty string separately. A blank-looking
string is not silently converted to NULL or a numeric zero. Every original field
remains in the mapping, including fields outside the current mapping page.

| Choice | Reviewed behavior |
| --- | --- |
| `VARCHAR` | Retains the original textual value and SQL NULL. |
| `BIGINT`, `HUGEINT` | Require an exact representable integer. |
| `DECIMAL(p,s)` | Requires an exact decimal that fits the declared precision and scale, with precision at most 38. |
| `BOOLEAN` | Uses the accepted native boolean literals; other source strings require correction or a textual representation. |
| `DATE` | Requires an explicitly selected and valid date representation. |
| `TIMESTAMP`, `TIMESTAMPTZ` | Require a valid native timestamp without loss below microsecond precision. Record the time interpretation and any time-zone meaning explicitly. |
| `JSON` | Parses the original field as JSON only when this type is selected. |
| `DOUBLE` | Requires the separate explicit permission for approximate conversion. |

The native source review is authoritative. If an original value does not fit its
selected representation, the review returns the concrete source problem. Adjust
the explicit mapping or preserve that field as text and review it again.

A type change creates a different reviewed interpretation. It does not replace
the retained commissioning file, source table or an existing imported edition.

## Field roles and meaning

Every original source field has a reviewed role and meaning:

- **Tag / identifier** identifies a native tag, record or source entity.
- **Time** identifies a field whose original time interpretation is relevant.
- **Measured value** identifies a value to analyze or compare.
- **Quality** identifies a native quality or status field.
- **Attribute** retains additional original source information.

A review requires at least one tag or identifier field and one measured value.
Time and quality fields are optional; the complete source scope, null note and
time note remain explicit.

The form initially describes each field as its original PostgreSQL field. Replace
or extend that description with the operational meaning needed by the customer.
Record units, time zone and precision where they are known from the source. An
empty units or time-zone entry remains undeclared.

Source imports preserve every original row, including duplicate identifiers, and
use `keys: []`. Choose matching keys in **Pair and compare** after both immutable
editions are imported. The comparison engine retains and accounts for complete
duplicate groups.

If an earlier browser draft contains an import-key selection, the source editor
shows that saved selection and provides **Clear import-key selection**. Clear it
explicitly before reviewing the source; the form preserves the old draft until
that action is taken.

The source review covers every field. Mapping pagination and the field-name
filter affect the editor view only.

## Immutable editions

A successful import records the complete reviewed conversion and attaches the
original Timescale report and source binding to the immutable DuckDB edition.
The retained receiving guide is part of the original source-file selection, so a
later installed guide update does not replace the guide belonging to an existing
review.

**Reviewed editions** pages through the saved native reviews. An imported review
opens its original edition, including the complete source meanings and conversion
details. Earlier editions can also be opened by their full edition identifier.

An interrupted import continues its original request. Reopening a review or
refreshing a catalog does not import an edition.

## Pair creation and comparison

Select two different immutable Timescale editions. Give the pair a stable name
and a useful display label. The name remains fixed when editing a saved pair;
saving an updated definition creates a new pair revision.

**Match identical names and native types** adds fields that match exactly on
both sides. It does not decide which fields are keys. Select at least one
matching key and review the meaning of every compared field.

The field rows display the retained role, units and time-zone meaning from each
source. Equal SQL types alone do not establish equal operational meaning. Use
the explicit field mapping and operator notes to document the intended
comparison.

The intake form retains original values with empty source and target value maps.
The existing full reconciliation editor provides explicit value maps when they
are required. Original fields omitted from the pair are listed by the native
review and remain in their source editions.

With no comparison windows, the pair includes all original rows. Each optional
window includes its start and excludes its end. A native comparison uses the
selected field's native type. A lexical window on `VARCHAR` compares exact
strings; it does not convert differently formatted timestamps into an elapsed
time axis.

**Review pair definition** uses the existing native paired review. **Save
reviewed pair** delegates to its original request journal. The saved-pair link
opens that exact pair in Dataset reconciliation without replacing a separate
unsaved definition already held in the reconciliation editor.

The original paired engine then provides complete row accounting, duplicate-key
groups, engineering decisions, report snapshots and portable export. Timescale
intake does not introduce a second comparison implementation.

## Recover a request

The browser retains the complete request identity and body before its first
write. For a report upload it also retains the exact file bytes, original
filename, SHA-256 and request headers in one browser-storage transaction.

Tabs in the same original workspace reuse the first retained request for the
same complete action. A lost response does not require a fresh upload identifier,
review or import.

In **Saved requests**:

1. Choose **Inspect original request** to reopen its actual native state.
2. If complete, **Continue original request** reopens the existing result.
3. If incomplete, continue that same retained operation explicitly.
4. For an incomplete upload, continuation sends the same original file and
   headers under the same request identifier.
5. If the original browser file is unavailable, select the same original report
   in that request's file control. The complete byte count and SHA-256 must match
   before it can continue.

If the original host reopens on another browser origin, find the incomplete
upload in the **Native intake journal**, choose **Reopen native request**, then
select its exact report using **Restore original report for this upload**. The
browser checks the complete report SHA and retains that original request ID,
filename and headers before offering continuation. Restoring the file does not
send the upload. Continue the original request explicitly after restoration.

The original host can also reconcile an interrupted upload without a browser
file if all original bytes are already retained. Its resume result identifies
`DUCKDB_TIMESCALE_SOURCE_REQUIRED` when those bytes are still needed.

A catalog refresh and a GET of a request never replay a write. A previously
completed local request that is absent from the currently opened native
workspace requires reopening its original workspace and result.

If browser storage is unavailable, the existing CLI and MCP routes remain
available. The browser reports the actual storage failure before sending a new
request whose complete input could not be retained.

## CLI

The existing DuckDB command owns this workflow:

```bash
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake status
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake reports
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake report REPORT_SHA
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake source REPORT_SHA SOURCE_UUID
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake reviews
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake operations
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake request REQUEST_ID
```

Inspect a complete original local report before retaining it:

```bash
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake inspect --file PRIVATE_REPORT --sha256 ORIGINAL_SHA256
```

Retain, review, import and save a pair using the complete original JSON body:

```bash
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake retain --input PRIVATE_RETAIN_JSON
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake review --input PRIVATE_REVIEW_JSON
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake import --input PRIVATE_IMPORT_JSON
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake pair-review --input PRIVATE_DEFINITION_JSON
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake pair --input PRIVATE_PAIR_JSON
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake resume REQUEST_ID --workspace-id CUSTOMER_WORKSPACE_ID
stellar-forge-duckdb --workspace ORIGINAL_DIR timescale-intake report-file REPORT_SHA --destination PRIVATE_REPORT_COPY
```

Mutation JSON uses the browser contract. A host-local retain body also contains
the original `report_path`. Preserve `request_id`, `workspace_id`, the original
report SHA and complete reviewed body on continuation.

The existing `serve` command opens the same local browser workspace. The
existing `reconcile` commands own runs, decisions, reports, full exports and
portable receiving. Use their current `--help` output for those original
operations.

## Registered agents and typed client

The existing DuckDB registration can include:

```json
{
  "timescaleReports": [
    {
      "name": "customer-commissioning",
      "reportPath": "/absolute/private/path/original-commissioning-report.json",
      "sha256": "COMPLETE_ORIGINAL_REPORT_SHA256"
    }
  ]
}
```

The registration is host-owned and bound to the existing description. An agent
selects the registered alias and exact report SHA. It does not select an
arbitrary host path or create another workspace.

The existing `action: "duckdb"` supports these operation names:

| Area | Operations |
| --- | --- |
| Sources | `timescale-intake-status`, `timescale-intake-registered-reports`, `timescale-intake-reports`, `timescale-intake-report`, `timescale-intake-source` |
| Review and import | `timescale-intake-retain`, `timescale-intake-review`, `timescale-intake-import`, `timescale-intake-reviews` |
| Original requests | `timescale-intake-request`, `timescale-intake-operations`, `timescale-intake-resume` |
| Pair and source handover | `timescale-intake-pair-review`, `timescale-intake-save-pair`, `timescale-intake-manifest`, `timescale-intake-file` |

Agent retain uses the original `request_id`, `source` alias and `sha256`.
The native registration supplies the actual customer workspace identity.

The typed client exports `openDuckDBTimescaleClient` and
`parseTimescaleIntakeManifest`. Its source declarations and receiving client
travel in the merchant distribution together with the Python package, browser
assets and this guide. Original source manifests and file chunks provide the
complete report and source files for portable receiving.

## Complete browser and customer receiving

The installed `timescale_intake/browser-receiving.mjs` exports
`runTimescaleIntakeBrowserReceiving`. Its caller supplies the original running
DuckDB launch URL, exact receiving input, a private output directory and the
installed Playwright engine. The function opens the existing operator interface
and closes its own browser context when finished.

The complete input contains:

| Input | Original value |
| --- | --- |
| `operation_id`, `source_commit`, `workspace_id` | The existing receiving operation, installed source and customer workspace |
| `report.path`, `report.sha256`, `report.filename` | The exact complete local commissioning report and its original upload filename |
| `baseline`, `observed` | The selected original source UUID, every field in native order, complete interpretation and empty import keys (`keys: []`) |
| `pair` | Name, label, all comparison fields, explicit empty value maps, windows and notes |
| `actor`, `reason` | The operator and original observation carried into the subsequent reconciliation review |

The browser receiver performs the customer workflow through visible controls:

1. Retain the complete original report file, then download it through the
   original browser action and compare all returned bytes.
2. Open both native source tables, check the displayed text, NULL and empty
   strings, and edit every field page and interpretation note.
3. Review each complete mapping and import its original immutable edition.
4. Select both exact editions, enter the comparison definition and save the
   reviewed pair through the existing reconciliation journal.
5. Open that saved pair in the original reconciliation editor with the exact
   source and target editions.

The receiver retains `intake-browser-input.json`, the persistent browser
profile and `intake-browser-receiving.json` in its original output directory.
It records the existing native request identities before continuing an operation.
Restarting with the same input reopens those requests and complete results. The
native journals allow recovery when the original server has reopened on another
port. If the former local upload path is absent, a completed original upload can
reopen its exact retained report bytes from the customer workspace. Its full
SHA-256, filename and byte count must match; this recovery does not create a
report or recapture a provider source. An incomplete upload can restore the exact report under its original
request; a saved pair continues through the original reconciliation controls.

Its completed result includes `report_id`, `baseline_edition`,
`observed_edition`, `pair_id`, the actual normalized saved `definition`, and
these original `request_ids`: `retain`, `baseline_review`,
`baseline_import`, `observed_review`, `observed_import`, and `pair`.
The first five belong to the intake journal. The pair belongs to the original
reconciliation journal.

The complete customer receiver then passes that actual saved definition into
`runReconciliationBrowserReceiving`. Its original request matching reopens the
same pair before the native run, row review, report and full handover. The
existing typed client receives every original export file and reopens the
portable warehouse. The intake source manifest carries the complete original
commissioning report and this retained guide alongside the reviewed sources.

A completed browser step alone does not mark the complete customer receiving as
finished. The surrounding receiver records completion after the original agent
requests, source files, comparison report and portable warehouse have all
returned and reopened.

## Installation and handover

The `stellar_forge_buyer.timescale_intake` package is included in the original
buyer Python distribution. Its browser assets and operating guide are package
data. The DuckDB merchant contribution includes all intake modules, original
shared hooks, agent contracts, typed client and receiving entry points.

Use the complete current merchant distribution when installing this capability.
An older browser alone does not add the native source format or agent actions.

A customer handover should include the complete original commissioning report,
reviewed native editions, saved pair definition, reconciliation report and
portable warehouse export. The original report and source identities can then
be reopened alongside the actual comparison results.
