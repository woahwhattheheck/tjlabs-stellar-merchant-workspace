# Customer scenario analysis

A retained-data workbench for comparing explicit assumptions. Select original
saved SQL revisions, define named parameter cases, choose a baseline, and run
every case against one consistent analytical input. Review keyed changes and
exact numeric differences, record an operator decision, and hand over a complete
editable workspace.

The implementation extends the original Python Buyer analytical database. It
uses `AnalysisWorkspace`, `DatasetDatabase.backup` and the same
`query_stream.open_query` reader used by the existing query/export application.
It does not create a second SQL engine, acquire a new dataset, call a wallet or
change a merchant payment operation.

## Open the desk

From an installed Python Buyer package:

```sh
python -m stellar_forge_buyer.scenario_cli serve --workspace /absolute/customer-analysis --port 8765
```

The directory must already contain the original analytical SQLite database. Stop
its existing standalone Analysis server before opening this standalone desk:
the original workspace owns one analytical process. Embedding applications can
instead pass their **existing** `AnalysisWorkspace` object to `ScenarioWorkspace`.
Close the scenario owner before closing the enclosing analysis owner. A separate
private scenario lease prevents two scenario engines from recovering or writing
the same operation concurrently.

The source-owned merchant distribution contribution registers the same command:

```sh
starforge scenarios serve --workspace /absolute/customer-analysis --port 8765
```

The Node launcher forwards arguments to the original Python application with no
shell interpolation. It defaults to `python3`; set `STARFORGE_PYTHON` to an
explicit Python executable when needed. Running the module directly needs only
Python 3.11 or later on Linux, macOS or WSL. Scenario operations on already
retained data require no Node process, downloaded dependency or network service.

The server prints its **private connection-file path**, not its token. Read that
file locally and open its `url`. The URL transfers the access token in a fragment;
the desk removes the fragment after receiving it. The HTTP server binds only to
`127.0.0.1`, checks Host and Origin, and uses no ambient proxy or permissive CORS.
Prepared file downloads use an HttpOnly, SameSite download cookie. A new server
process rotates the local token. Do not publish the connection file.

For an explicitly authored, runnable example:

```sh
python -m stellar_forge_buyer.scenario_cli example /absolute/new-example --rows 80
python -m stellar_forge_buyer.scenario_cli serve --workspace /absolute/new-example --port 8765
```

The example contains merchandise lines, integer-cent contribution calculations,
five parameter cases and two saved analyses. Its unusually large decimal-text
field demonstrates preservation of an exact `0.125` change beyond JavaScript's
safe integer range. It is illustrative input, not an external customer dataset.

## Operate a comparison

**Scenarios** contains revisioned comparison definitions. A definition selects
one to 32 saved analyses and two to 128 parameter cases. Each analysis pins a
saved query's name, exact revision, original SQL, original parameter text and
content digest. Selecting a newer query revision requires saving a new scenario
definition revision; an old run never silently follows a changed query head.

Give each analysis unique result-column names. Select non-null, unique key
columns for tabular results. An analysis with no key columns may return zero or
one row. Duplicate or null keys stop that whole case rather than publishing an
ambiguous partial match. Key identity includes the original scalar type, so
integer `1`, real `1.0` and text `"1"` remain distinct keys.

Metrics are explicit. `number` accepts SQLite integer and finite real scalars;
`decimal` additionally accepts finite decimal text. In the desk's metric field,
append `:decimal` to a decimal-text column, for example:

```text
contribution_cents, requested_limit:decimal
```

Parameter input is **JSON text**, not an automatically rewritten browser number
object. The original parameter parser accepts named scalar parameters or a
positional scalar array. SQL integer parameters must fit signed 64-bit SQLite
integers. Preserve a larger exact value as a JSON string and use suitable SQL
semantics and an explicit decimal-text metric.

Parameter precedence is: this case's per-analysis override, this case's shared
parameters, this analysis's default parameters, then the pinned query's original
parameters. An empty field means inheritance; `[]` or `{}` is an explicit empty
parameter set. Overrides name the analysis, not its query. Named cases are
independent assumptions, not a stochastic forecast or an inferred recommendation.

**Review data & run** displays the current original view selection before
execution. The engine makes one original consistent SQLite backup, confirms
that selection and the pinned definition in the backup, and binds the retained
run to those exact bytes. A changed selection before freezing asks for a fresh
reviewed run; a later change cannot replace a frozen input.

The saved query's preview `max_rows` does **not** truncate the scenario operation.
The original query stream reads every result row. Per-analysis timeouts and a
complete-result storage budget protect the host; exhausting either stops the
operation and preserves earlier complete cases. It does not label a truncated
result complete. The default is 300 seconds per analysis and 1 GiB of serialized
result/comparison content. The actual SQLite files, backup and archive may occupy
more disk space than that content budget. Operators can choose up to one day per
analysis and a 1 TiB content budget when their host has capacity.

## Interruption and recovery

The run identifier is saved before execution. Repeating the same identifier and
same reviewed request returns the original operation; reusing it for a different
request is rejected. Definition and review writes use the same retained request
identity, together with compare-and-set revision checks.

A completed case and every one of its typed rows commit atomically. An unfinished
case's temporary output is discarded on resume. On process reopening, active
operations become `INTERRUPTED`; nothing is automatically replayed. Select
**Resume retained input** to finish the missing cases on the same frozen input.
Completed cases are verified and reused. A cancellation also retains the input
and complete cases for explicit resume. The original SQL authorizer and query
cancellation callback remain the execution boundary.

After all cases finish, the engine builds all baseline comparisons in one
transaction. It verifies case inventories and publishes a complete result only
when every comparison finishes. The extra input backup is then retired; the
original imported datasets, complete result rows, definition, selected view
identities, source metadata and input digest remain retained.

If an input file or retained record has actually changed, the engine reports it
rather than substituting fresh data. A storage-budget failure needs a newly
reviewed run with a larger budget; changing an existing operation's assumptions
or execution request is not a resume.

## Read results and save a decision

**Results & review** provides separately paginated complete case rows and keyed
baseline comparisons, with added, removed, changed and unchanged row filters.
Pagination positions refer to retained rows, not an in-memory preview. Every
page is retrievable through both the desk and the Python client.

A row's status reflects changes in **any** result column. Each selected metric
then reports its own baseline, candidate, delta and percentage. A zero metric
delta can therefore appear on a changed row when another column changed.
Missing rows, null/unreported values and a zero baseline are separate states.
No unit, preferred direction or desirability is guessed.

Typed JSON preserves integers and original real scalar renderings as text so a
browser cannot round them. Delta arithmetic is the exact decimal difference of
those scalar texts. SQLite REAL itself remains binary floating point; the desk
does not undo precision lost upstream in SQL. Percentage is
`100 × delta / absolute(baseline)`, rounded to 28 significant decimal digits.
A zero baseline has no percentage. Full precision is retained in reports.

An operator may choose a case or leave the decision open, add a reason and label,
and save a revisioned review against the exact completed result. The label is
operator-provided attribution, not an authenticated identity assertion. Prior
reviews stay in history. Editing a definition or saving a new review does not
rewrite an existing result or earlier exported report.

## Complete customer delivery

**Delivery** prepares three complete report forms:

* Printable HTML includes every comparison and every full case result, with the
  selected review and expandable original SQL, assumptions and source identities.
* Typed JSON streams every case/comparison row with its original scalar tags and
  the complete result provenance.
* A ZIP contains all case and comparison CSV files plus the full typed JSON.
  Potential spreadsheet formulas in text cells receive a leading apostrophe in
  CSV only; exact original text stays in the JSON.

A report export identifier permanently selects its run, result and review
revision. A complete prepared file is retained and re-served, not silently
regenerated from a newer review. The HTTP download supports byte ranges against
its exact digest; the native client streams a complete, digest-checked file into
a create-only destination.

**Prepare workspace package** includes the entire original analytical SQLite
database, all saved queries and history, all scenario definitions and operations,
all complete results and reviews, previously prepared report files, and the
Python application source. Interrupted operations carry their original frozen
input. Previous whole-workspace ZIP deliveries remain recorded in history but
are not nested recursively. Temporary case spools, server access files, external
wallet/session files and unrelated files are not copied.

The scope is **all analytical data in that database**, not merely the selected
run. Review that scope before sharing. Old source metadata may contain historical
session locations or source references. They are not reopened to execute a
scenario on the retained data. Fresh dataset acquisition remains in the original
Buyer product and its separately configured runtime.

Receive into a new directory:

```sh
python -m stellar_forge_buyer.scenario_cli receive customer-scenario-workspace.zip /absolute/new-received
python -m stellar_forge_buyer.scenario_cli receive customer-scenario-workspace.zip /absolute/new-received --resume
python /absolute/new-received/start.py --port 8765
```

The receiver validates the complete archive inventory, expanded lengths and
SHA-256 values; rejects unsafe paths, linked targets and unexpected files; and
creates private files without overwriting an existing workspace. A partial
receive keeps its checkpoint. `--resume` continues the same archive, preserves
verified complete files and restarts the currently unfinished file. The default
expanded-content budget is 8 GiB; `--max-bytes` adjusts it for a reviewed larger
package. Hashes identify content; they are not a signature of the publisher.

The received application's `start.py` uses its included source and database.
Its saved definitions and queries are independently editable. A new run in the
received copy cannot change the sender's workspace. Keep the current port open
while using the desk; stop it with Ctrl+C before opening the same database in a
different standalone analytical process.

## Command-line and embedding interfaces

```sh
python -m stellar_forge_buyer.scenario_cli definitions --workspace /absolute/analysis
python -m stellar_forge_buyer.scenario_cli save --workspace /absolute/analysis --file definition.json
python -m stellar_forge_buyer.scenario_cli plan --workspace /absolute/analysis --name merchandise_terms
python -m stellar_forge_buyer.scenario_cli run --workspace /absolute/analysis --name merchandise_terms
python -m stellar_forge_buyer.scenario_cli status --workspace /absolute/analysis --id ORIGINAL_RUN_ID
python -m stellar_forge_buyer.scenario_cli resume --workspace /absolute/analysis --id ORIGINAL_RUN_ID
python -m stellar_forge_buyer.scenario_cli export --workspace /absolute/analysis --id ORIGINAL_RUN_ID --format html --output report.html
python -m stellar_forge_buyer.scenario_cli package --workspace /absolute/analysis --output workspace.zip
```

`run` stays in the foreground until the original operation finishes. It prints
the retained run identity to stderr at the beginning. Ctrl+C cancels and preserves
complete cases. For a running desk, use `client --connection PRIVATE_FILE` rather
than attempting to open a second database owner. `query-save --file FILE` forwards
the request `{name, expected_revision, query:{sql,parameters_text,max_rows}}` to
the original saved-query writer; `review --file FILE` uses the original retained
scenario-review operation.

```python
from stellar_forge_buyer.scenario_client import ScenarioClient

client = ScenarioClient.from_file("/absolute/analysis/scenario-connection.json")
context = client.call("context")
for page in client.pages("runs"):
    for run in page["items"]:
        print(run["status"], run["id"])

# Every retained row is available; no fixed preview is mistaken for completion.
for page in client.pages("rows", id=original_run_id, task=0):
    consume(page["items"])
```

The client exposes the same local operations: `context`, `query`, `definitions`,
`definition`, `plan`, `runs`, `run`, `resume`, `cancel`, `rows`, `comparison`,
`review`, `reviews`, `export` and `package`. Supply a JSON object as the second
argument for writes. Preserve its 32-character identifier for a lost-response
retry. The HTTP server also accepts bearer authentication for native clients;
the client never follows redirects or sends credentials through an ambient proxy.

For in-process embedding:

```python
from stellar_forge_buyer.scenario_store import ScenarioWorkspace

# analysis is the host's already-open original AnalysisWorkspace.
with ScenarioWorkspace(analysis) as scenarios:
    selected = scenarios.plan("merchandise_terms")
    # start accepts id, name, revision, definition_sha256, expected_views
    # and optional query_timeout_seconds/result_limit_bytes in options.
```

## Source and operating exercise

All new Python modules are `stellar_forge_buyer/scenario_*.py`. The distribution
contribution is `distribution/contributions/customer-scenarios.json`, which
selects the original Python source directory and its native launcher. Existing
SQL, dataset, reporting and acquisition implementations remain unchanged.

The substantive native operating program is:

```sh
python -m stellar_forge_buyer.scenario_receiving /absolute/new-operating-run --rows 12000
```

It imports the authored input with the original importer, runs the real CLI,
terminates that actual process after complete cases commit, changes the current
SQL and data selection, resumes the frozen operation, reads every retained row,
saves a repeat-safe review, exports all three complete reports, delivers the
full database and source, receives into a new directory, and starts a second
Python process with site packages disabled. That process edits the delivered
definition and completes a new independent run. Its full source, workspaces,
reports, archive and `native-result.json` remain in the chosen directory.
