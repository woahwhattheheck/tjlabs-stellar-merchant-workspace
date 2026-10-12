# Data preparation

Turn a collection of CSV and JSON Lines files into a repeatable, reviewable dataset. The workspace retains original files, saves exact input selections with each SQL recipe edition, runs joins and aggregations, and preserves complete result editions. A recipient can reopen the full project independently and keep editing it.

The product uses Python's SQLite engine and standard library. The optional Node client talks to the same local operator server. Merchant delivery feeds the existing SF30 CSV dataset handler; this workspace does not introduce a second payment server.

## Start

Use Python 3.11 or later on a POSIX host. Python 3.13.5 and Node 22.16.0 were used for the native customer journey. No Python packages or network service are required.

From this source directory:

```sh
python3 cli.py --workspace ./project init --label "Customer data preparation"
python3 cli.py --workspace ./project serve --port 8769
```

Open the loopback URL printed by the server. It listens on `127.0.0.1`, checks its Host and same-origin write requests, and does not expose the workspace to the network. The browser supplies four sections: **Inputs**, **Recipes**, **Results**, and **Handover**.

In a distribution containing this contribution, use the original command:

```sh
starforge data-preparation --workspace ./project serve --port 8769
```

`STARFORGE_PYTHON` can select the Python executable used by the Node launcher. Command arguments are passed directly, without a shell.

## Import original editions

```sh
python3 cli.py --workspace ./project import ./orders.csv --alias orders --label "October orders"
python3 cli.py --workspace ./project import ./customers.jsonl --alias customers --format jsonl
```

Each command returns the saved source ID. The original input is copied before parsing. Re-importing identical bytes with the same alias and interpretation reuses that edition. Importing different bytes under the same alias creates another edition; it does not change earlier recipes.

CSV requires a header and a consistent number of cells per record. Quoted commas, embedded newlines, escaped quotes, UTF-8 and a leading BOM are supported. Empty CSV cells remain empty strings unless an explicit `--null-token` is selected. For example, `--null-token '\N'` treats exactly that cell text as SQL NULL.

JSON Lines requires flat objects with the same property names on each line. Object key order can vary. Blank lines are skipped. Duplicate property names and nested values are rejected with source-line errors. JSON null remains SQL NULL. Original integer and decimal numeric lexemes are projected as text, including identifiers above JavaScript's safe integer range. The original bytes remain available in the project archive.

Input column labels may contain spaces or punctuation; quote them in SQL. Labels must be unique ignoring case. Query aliases start with a letter and contain up to 48 letters, digits or underscores. A source supports up to 256 columns and one million characters per cell.

## Save and run recipes

Create a SQL file such as:

```sql
WITH totals AS (
  SELECT customer_id, decimal_sum(amount) AS gross
  FROM orders
  WHERE status = :status
  GROUP BY customer_id
)
SELECT customers.name, totals.gross
FROM totals JOIN customers ON customers.id = totals.customer_id
ORDER BY customers.name
```

Then save it with the exact source IDs returned by import:

```sh
python3 cli.py --workspace ./project recipe \
  --label "Closed orders by customer" \
  --sql-file ./revenue.sql \
  --bindings '{"orders":"SOURCE_ID_FROM_IMPORT","customers":"SOURCE_ID_FROM_IMPORT"}' \
  --parameters '{"status":"closed"}'

python3 cli.py --workspace ./project run RECIPE_ID_FROM_SAVE
```

The browser performs the same operations without copying IDs. Select each alias's retained edition and enter one read-only query. SQL can read only the selected source views, not workspace metadata or arbitrary files. Writes, attachment, pragma statements and extension loading are denied by SQLite's authorizer. A run freezes the entire saved recipe: SQL, parameters, selected source IDs and revision.

Saving another edition requires its last observed revision. Conflicting edits return a reload message rather than replacing another operator's changes. Older editions remain available for execution. Use `run RECIPE_ID --revision NUMBER` to run a selected earlier edition.

### Numeric semantics

Source values are text or null. SQLite's ordinary casts, arithmetic and aggregates retain SQLite's normal numeric behavior, including binary floating-point for REAL values. Exact amounts use these explicit functions:

| Function | Operation |
| --- | --- |
| `decimal_sum(value)` | Exact sum of non-null decimal values; null for no values. |
| `decimal_add(a,b)` | Exact addition. |
| `decimal_sub(a,b)` | Exact subtraction. |
| `decimal_mul(a,b)` | Exact multiplication. |
| `decimal_cmp(a,b)` | Numeric comparison returning -1, 0 or 1; null if either input is null. |
| `decimal_quantize(value,places)` | Explicit decimal-place rounding, ties to even. |

Arithmetic returns decimal text. Operations that exceed the supported exact context fail rather than silently round; quantize is the explicit rounding operation. Null propagates through scalar decimal functions. Use `COALESCE` only when zero or another replacement matches the intended interpretation. SQL text sorting is lexicographic; choose an appropriate numeric expression or explicit domain sort when needed.

## Complete results and recovery

The **Results** section displays saved editions, row totals, paged rows, reviews and full downloads. A preview page is never substituted for a complete export. Results include:

- `result.jsonl`: complete rows preserving exact output text and SQL null separately.
- `result.csv`: complete rows, with null and empty text both rendered as empty cells.
- `schema.json`: column order, total rows, null/empty counts and numeric semantics.

These CSV files are data interchange files, not formula-sanitized spreadsheets. Use the JSON Lines representation for an unambiguous text/null interchange.

Queries and joins are disk-backed. Only a batch of result rows is held during writing. Result files become visible only after a successful full query; failed or cancelled partial files are discarded. Row previews accept offsets and page sizes up to 200, and expose the next offset when more data exists.

One mutation runs at a time. Other clients can read status and cancel the active query. Cancellation cooperatively interrupts the native SQLite virtual machine. A queued request remains saved if another operation acquired the writer before it started; **Start queued run** resumes that request.

After an unexpected process exit:

```sh
python3 cli.py --workspace ./project recover
python3 cli.py --workspace ./project rerun INTERRUPTED_RUN_ID
```

Recovery marks abandoned running operations interrupted. Rerun creates a new attempt using their exact frozen recipe and sources. It restarts the computation rather than claiming to resume an unfinished SQL aggregate halfway through. Original successful editions remain unchanged. The browser has the same recovery and rerun controls.

## Review and handover

A review is attached to a particular completed result, with an append-only revision history. The choices are accept, revise or withdraw. Reviewer names are operator-entered labels. Review does not alter the output or prevent an authorized operator from exporting it.

```sh
python3 cli.py --workspace ./project review RESULT_ID \
  --decision accept --reviewer "Project reviewer" --note "Reviewed customer grouping."
python3 cli.py --workspace ./project report RESULT_ID ./preparation-report.html
python3 cli.py --workspace ./project export ./project.zip
```

The report shows input labels and row counts, the selected transformation and parameters, and review history. Complete data files remain separate from this readable report.

The project archive contains every retained original input, saved recipe edition, result and review. It contains private project data; distribute it only to intended recipients. Receiving requires a new directory:

```sh
python3 cli.py --workspace ./received receive ./project.zip
python3 cli.py --workspace ./received serve
```

Receiving checks complete declared member sizes and hashes, rejects duplicate/extra paths, reconstructs source tables from original inputs, cross-checks result CSV against exact JSON Lines, and reconstructs result indexes. It never executes a supplied SQLite database or supplied SQL during import. The default expanded archive allowance is 20 GiB, configurable with `--max-bytes`. A received project supports further recipe editions, new result runs and reviews.

## Original merchant handover

```sh
python3 cli.py --workspace ./project merchant RESULT_ID ./dataset-delivery
node ../dataset-cli.mjs --dataset ./dataset-delivery/dataset.json
```

The same package is downloadable from **Handover**. It contains `dataset.csv`, `dataset.json`, `mapping.json` and a short recipient guide. The configuration resolves its CSV relative to itself, so the directory is portable.

SQL column labels are mapped to valid merchant field names. Values remain strings. Each null-bearing column receives a boolean companion field: true means SQL NULL; false preserves the exact value, including empty text. This avoids silently collapsing empty text into null in the original handler. `mapping.json` describes every field and binds the package to the exact result JSON Lines digest.

The original merchant's limits remain in force: 64 exposed fields including null indicators, one million rows, 256 MiB CSV and one million UTF-16 units per cell. A result outside these limits remains fully downloadable; choose partitioned or narrower delivery recipes for that merchant interface. Use the existing seller configuration workflow to select actual payment terms and start the original service.

## Programmatic operation

The Python CLI provides `state`, `source-page`, `result-page`, `recipe`, `run`, `rerun`, `cancel`, `recover`, `review`, `export`, `receive`, `merchant` and `report`. `rpc` accepts one JSON request per line in a retained native process:

```json
{"id":1,"operation":"state","arguments":{}}
```

Responses carry the matching ID and either `{ "ok": true, "result": ... }` or `{ "ok": false, "error": ... }`. RPC runs sequentially; use the operator HTTP service for asynchronous run/cancellation control.

The typed Node client uses that original HTTP service:

```js
import { PreparationClient } from './client.mjs';
const client = new PreparationClient('http://127.0.0.1:8769');
const state = await client.state();
const completed = state.runs.find(run => run.status === 'COMPLETE');
for await (const row of client.resultRows(completed.id)) {
  // Every row, across complete pagination. Amount fields remain strings.
  process.stdout.write(JSON.stringify(row) + '\n');
}
```

The client supports streaming file import, saved recipes, asynchronous execution, cancellation, recovery, reviews, full project/merchant exports and complete result-row iteration. Download methods return the original server's full file URLs; they do not transform the result data.

## Native exercise

From a repository checkout, run the single internal customer journey:

```sh
python3 EXERCISE.py --directory /absolute/new-example --rows 120000
```

It authors documented demonstration inputs, runs a three-source exact-decimal join, creates recipe editions and a review, exports/receives the editable project, and loads the resulting package through the original SF30 dataset handler. Cancellation, actual child-process interruption, conflicting edits and read-only SQL checks use a separate operations workspace. The production distribution omits this exercise.
