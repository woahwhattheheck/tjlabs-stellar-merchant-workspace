# Query the selected result with DuckDB

This handover lets a recipient read the selected purchased result through its existing authenticated VGI listener, retain every returned row, and continue analysis from that saved result. It contains the connection selection, original publication description, full query and complete client source. The access token is supplied separately through the recipient's private environment.

The operator first selects the running publication in **Query a result**, reviews the recipient address and downloads the complete client ZIP. The recipient verifies that package, connects with the existing result-service permission, and receives Parquet, CSV, typed schema, exact SQL and a complete source receipt. Downloading or running this handover makes no purchase and does not change the original warehouse.

## 1. Receive and inspect the complete package

Extract the ZIP into its own directory. It has exactly these six files:

| File | Purpose |
| --- | --- |
| connection.json | Workspace, service, running listener, selected publication/export, table, recipient address, original listener address and schema identity |
| publication.json | Complete original publication, source export, Arrow schema, columns and retained batch descriptors |
| query.sql | Explicit original-column SELECT from the selected VGI table |
| result_sql_client.py | Complete standalone consumer and offline verifier |
| README.md | This operating guide |
| manifest.json | Exact byte lengths and SHA-256 hashes for the other five files, plus original selection identities |

Keep that directory unchanged. Save your own SQL outside it. The client rejects extra or missing members, duplicate JSON keys, changed file bytes, a substituted runner, changed original identities and a modified default query.

From the package's parent directory:

    python client-package/result_sql_client.py --package client-package --inspect

This command needs only Python's standard library. It makes no connection, installs nothing and reads no token. Success is one JSON object with status VERIFIED_OFFLINE, the configuration and the exact file descriptors. Use the package SHA or source identity supplied by the original operator to establish which delivery you received; the internal hashes detect changes within that delivery.

Read connection.json before connecting. In particular, check:

- workspace_id and service_id identify the intended existing result service.
- publication_id and export_id identify the selected retained result and its source export.
- catalog_name is the actual worker catalog name; attach_alias remains purchased for the supplied SQL.
- table_name and expected_rows describe the full original result.
- address is the recipient-reachable VGI address.
- listener_address is what the original running process reported.
- address_note explains an intentional recipient address or forwarding change.
- catalog_revision and head_revision describe the running selection.
- current_service_revision, current_head_revision and current_publication_id describe the operator's separately observed current saved state.

A loopback address works from the listener's own host. For a recipient on another host, the operator prepares the package with the actual permitted reachable address and its explanation. Receive a new handover when that selection changes; editing connection.json would invalidate this one.

## 2. Use the maintained Python environment

Use the installed environment from the original merchant application's **Python and workbooks** workflow. The current selected cohort uses Python 3.13 or newer, DuckDB 1.5.6, the retained PyArrow dependency and the Purchased-result VGI dependencies. The server's selected releases are vgi-python 0.43.1, vgi-rpc 0.51.0 and Waitress 3.0.2.

In that original workflow:

1. Select the existing retained merchant runtime and the **DuckDB** and **Purchased-result VGI** extras.
2. **Review source and interpreter**, then **Resolve and retain exact wheels**.
3. **Install offline** from the retained candidate, or receive its complete exported wheel cohort and install that retained cohort.
4. Run the package's client with the selected environment's Python executable.

The standalone SQL consumer imports DuckDB and PyArrow. It uses the original native SQL extension, INSTALL vgi FROM community followed by LOAD vgi. An existing compatible installed extension is reused by DuckDB's normal install operation. The first installation needs access to DuckDB's community extension repository. The result receipt records the actual loaded extension version and, when its file is available, the exact extension bytes and SHA-256. It also records Python, DuckDB and PyArrow versions.

If the maintained environment has an explicit extension cache, pass its existing directory:

    python client-package/result_sql_client.py \
      --package client-package \
      --output result-run-001 \
      --extension-directory /path/to/retained/duckdb/extensions

Use an actual existing cache path from your installation. The script requires DuckDB 1.5.6 so its catalog and Arrow conversion match the selected application. No server or Python VGI worker is started by this client.

## 3. Supply the existing credential privately

The only token input is the RESULT_SERVICE_TOKEN environment variable. There is no token command-line option, token field in the ZIP or token in the exported result receipt.

Use your existing private environment injection. For an interactive terminal, this small launcher prompts without echoing the value and passes it only to the child process:

    python - <<'PY'
    import getpass
    import os
    import subprocess
    import sys

    env = dict(os.environ)
    env["RESULT_SERVICE_TOKEN"] = getpass.getpass("Result-service token: ")
    completed = subprocess.run([
        sys.executable, "client-package/result_sql_client.py",
        "--package", "client-package",
        "--output", "result-run-001",
    ], env=env)
    raise SystemExit(completed.returncode)
    PY

The token must belong to a principal currently allowed by that original service. The original server rechecks permission while reading retained batches. Access changes can therefore stop a scan after attachment.

Choose a new output directory for each execution. Its parent must already exist. The client creates the output with private permissions and refuses to replace an existing run.

## 4. Understand what the client checks before reading

The client performs the following complete receiving sequence:

1. Verify every handover member and the relationships among configuration, manifest, publication, source export and serialized Arrow schema.
2. Load the original DuckDB VGI extension and record its actual identity.
3. Attach the actual configured worker catalog under the local purchased alias, with the token held only in memory.
4. Inspect DuckDB's native catalog metadata. The attached catalog must carry the original workspace ID, service ID and running catalog revision. The selected table comment must identify the exact expected export and publication.
5. Compare every attached column, in order, with the original Arrow schema converted by the same DuckDB engine into its SQL types.
6. Run the complete explicit-column source SELECT and consume every Arrow result batch into source.parquet.
7. Check the full row count and column types; inspect the same attachment identity again after the completed scan.
8. Produce complete result files and write receipt.json only after the export succeeds.

The original worker fixes its selected publication when that listener starts. A later listener restart can attach the same ordinary table name to a different publication. This handover records an observed selection; it is not SQL time travel. The client rejects an actual different publication with ATTACHED_PUBLICATION_CHANGED. The operator can select the intended retained edition and prepare the correct running handover, or deliberately provide the newer edition as a new delivery.

Catalog comments and tags are native service metadata, not a separate cryptographic claim about a remote server. Use the intended authenticated endpoint and retained original delivery. The full exported source identities let the original operator and recipient reconcile the actual selection.

The exact original Arrow schema bytes and metadata remain in publication.json. DuckDB may expose its native SQL representation or Arrow output representation differently from the source Arrow metadata. The client verifies the source schema hash and ordered SQL types, then records the actual output Arrow schema separately. It does not label a converted output schema as byte-identical to the original serialized schema.

## 5. Use the complete saved result

A successful run emits one JSON object on stdout and returns exit code 0. Its stable fields are:

| Field | Meaning |
| --- | --- |
| ok / status | true / COMPLETE |
| rows / columns | Complete output row count and ordered DuckDB column names/types |
| publication_id | Selected source publication |
| result_parquet | Absolute path to the typed output |
| result_csv | Absolute path to its human-readable CSV companion |
| result_descriptor | Absolute path to result.json |
| source_parquet | Absolute path to the complete received VGI publication |
| receipt | Absolute path to the full final receipt |
| output | Absolute path to this private run directory |

The directory contains:

- package/: all six unchanged original handover files.
- source-query.sql: the exact complete SQL sent to the VGI table.
- query.sql: the SQL producing this result.
- attachment.json: the actual validated attachment identity before the scan.
- source.parquet and source.json: every row of the selected VGI publication and its actual typed descriptor.
- result.parquet, result.csv and result.json: the selected complete result and its actual schema.
- receipt.json: original identities, before/after attachment observations, runtime and extension identities, query mode, and hashes of all durable source/result files.
- client-runtime/: this run's private temporary runtime space.

For the default query, result.parquet is the exact received source.parquet copy. A custom query can have a different row count and schema while source.parquet remains the entire selected original publication.

Parquet is the typed data authority. The CSV preserves row order and formats null as \N, binary as base64: followed by base64 text, temporal values as ISO text, decimals as exact decimal strings and nested values as JSON. A literal text value can itself equal one of those strings, so use Parquet whenever types or null distinctions matter. CSV values retain their original content; spreadsheet users should import columns with the intended types rather than execute cell-like content.

Reopen the entire saved output without a token or server:

    python client-package/result_sql_client.py --verify-output result-run-001

This verifies all retained file lengths and hashes, the full original package, the original selection and the result/query relationship. Success reports VERIFIED_OUTPUT. It does not rescan the server or replace an earlier run.

Read the typed result with the selected environment:

    python - <<'PY'
    import pyarrow.parquet as pq

    result = pq.read_table("result-run-001/result.parquet")
    print(result.schema)
    print(result.num_rows)
    print(result.slice(0, 10).to_pylist())
    PY

The last command displays a preview only; the Parquet file contains every row. The original receiving programme compares its whole 32-row result after sorting sf_row, because SQL without ORDER BY does not promise row order.

## 6. Run an analytical SELECT on the received publication

Keep custom SQL outside the unchanged package. For example, for the original capacity_result table, save analysis.sql:

    SELECT
        count(*) AS result_rows,
        min(sf_row) AS first_source_row,
        max(sf_row) AS last_source_row,
        sum(volume) AS total_volume
    FROM purchased.results.capacity_result;

Then execute with the same private token environment:

    python client-package/result_sql_client.py \
      --package client-package \
      --query analysis.sql \
      --output result-analysis-001

The client first receives and validates the complete original publication as above. It closes the authenticated VGI connection. It then loads that exact saved snapshot into a separate credential-free local DuckDB connection under the same purchased.results table name, disables external access and evaluates one parameter-free SELECT.

This supports filtering, joins within that selected table, grouping, aggregates, windows and ordering. It rejects statement sequences and mutation/administration statements. The custom analysis cannot reach other live VGI tables or remote functions through this connection. To query another selected publication, receive that publication's own handover.

The exact custom SQL and complete source are retained with the result. The query does not need to return the original number of rows. Its result.json identifies local-selected-snapshot as the query mode.

## 7. Recover a failed run

A runtime failure returns exit code 2 and a single JSON failure outcome. If the output directory was created, failure.json retains the stage, stable error code, original selection and any completed source observations. A file ending in .partial is unfinished. A directory without a COMPLETE receipt is not a completed result.

Native exception text is deliberately not stored: an engine error can include the authenticated ATTACH SQL. The client instead reports the exact failed stage and a stable credential-free code.

| Stage or error | Operator response |
| --- | --- |
| PACKAGE_MEMBER_CHANGED / DEFAULT_QUERY_CHANGED | Reopen the exact original package; keep your analytical SQL in a separate file. |
| RUN_THE_RETAINED_CLIENT_SOURCE | Invoke the script delivered in this package, or an exact byte-identical source copy. |
| USE_MAINTAINED_DUCKDB_1_5_6 | Select the retained compatible installation. |
| INSTALL_LOAD_VGI_FAILED | Check the selected environment and its original extension cache or first-install network access. |
| RESULT_SERVICE_TOKEN_REQUIRED | Supply the existing result-service credential through the private environment. |
| AUTHENTICATED_ATTACH_FAILED | Check the actual recipient address, running listener and current authorized principal. |
| ATTACHED_CATALOG_CHANGED / ATTACHED_PUBLICATION_CHANGED | Reconcile the actual running service/edition with the operator and receive its correct handover. |
| ATTACHED_COLUMNS_CHANGED / PUBLICATION_ROW_COUNT_CHANGED | Keep the failed output and reconcile the selected publication/source schema with its owner. |
| RECEIVE_COMPLETE_PUBLICATION_FAILED | Keep the partial run; inspect the original listener's status and current access, then use a new output directory for the retry. |
| ONE_PARAMETER_FREE_SELECT_REQUIRED | Supply one SELECT over the retained local table; remove statement sequences and parameters. |
| QUERY_SELECTED_LOCAL_SNAPSHOT_FAILED | Check custom SQL against the retained column names/types. The complete source remains in the failed run if receiving succeeded. |
| OUTPUT_ALREADY_EXISTS_USE_NEW_DIRECTORY | Choose a new run directory; existing results are preserved. |
| OUTPUT_MEMBER_CHANGED | Reconcile the retained original output before using the changed files. |

A retry is a new read with a new output directory. It does not repeat a purchase or alter the original result publication. Preserve failed and completed runs separately so their actual outcomes remain clear.

## Original APIs and source

This consumer follows the maintained application's original native SQL receiving path and worker metadata:

- [Original application and retained runtime](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/main/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/stellar_forge_buyer/vgi_service)
- [Query.Farm: connect to a worker](https://query.farm/vgi/connect-to-a-worker/)
- [Query.Farm Python catalog model](https://query.farm/vgi/docs/python/how-to/catalogs/)
- [Query.Farm catalog metadata surfaces](https://query.farm/vgi/docs/typescript/how-to/catalogs/)
- [DuckDB catalog metadata functions](https://duckdb.org/docs/current/sql/meta/duckdb_table_functions)
- [DuckDB Python API, statement parser and complete Arrow batch reader](https://duckdb.org/docs/current/clients/python/reference/)

The original same-case receiving course verifies the downloaded six-member package, runs this consumer against its original authenticated listener and compares every returned typed value with the original retained result. It keeps the current purchase/workspace/listener and existing browser controller as the same operation.
