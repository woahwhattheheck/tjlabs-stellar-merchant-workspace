# Python coastal model-input receiving

Use the selected original Coastal Source Operations console to bring a reviewed study into an analyst's Python workflow. This client uses Python 3.10 or later and its standard library. It receives the complete immutable CSV, JSONL, source TAR, review HTML and manifest, verifies every archived original member, queries the existing native dataset and sends a selected returned file through the same comparison and staff decision workflow.

The authoritative source, study, review, mapping, dataset and receiving records remain in the original workspace. The local receiver keeps ordinary files and a recovery journal. It does not perform datum/time conversion, interpolation, financial calculation or another NOAA acquisition.

## 1. Select the original console and private receiver

Start or reopen the normal console through the existing application or maintained receiving host. Its original JSON startup record has schema `stellar-forge.coops-workspace-startup.v1`, status `COOPS_READY`, the workspace ID and its private URL. Keep that file private. The receiving host writes it under its selected output directory at `private/coops-session.json`.

Choose a separate owned directory with mode 0700 for the Python receiver. Keep the complete directory when moving or backing up this receiving work. The client keeps each original returned input at mode 0600 and uses a persistent operating-system file lock; closing or interrupting the client releases that lock.

Run the script directly from the installed source:

```sh
python3 -B source/stellar/scf-starforge-20261009/sf30-seller-sdk/coops/python/coops_model.py \
  --directory /selected/private/coastal-receiver \
  --startup /selected/private/coops-session.json connect
```

The installed command is equivalent:

```sh
starforge coops-model --python /selected/python3 \
  --directory /selected/private/coastal-receiver \
  --startup /selected/private/coops-session.json connect
```

The interpreter is an explicit operator choice. The package does not install a Python runtime or depend on a development scratch directory. Use `--python /selected/python3 --help` for the full command reference.

The HTTP client calls only the original `127.0.0.1` console, checks the running workspace ID and sends its existing bearer credential. It follows no redirects and does not use HTTP proxies. The token remains in memory and is absent from receiver receipts and output.

A normal console restart issues a fresh private URL. Point `--startup` at the current original startup file; the same workspace and origin reopen without another registration. An explicitly moved console with the same workspace ID requires `--adopt-origin --origin-note 'Actual relocation reason'`. A different workspace requires a distinct receiver.

## 2. Receive the complete reviewed release

Select the release ID from the original Studies page. This is the immutable delivery created from the recorded review, including its exact historical study revision. Later study edits or reviews do not rewrite it.

```sh
python3 -B /installed/coops/python/coops_model.py \
  --directory /selected/private/coastal-receiver \
  --startup /selected/private/coops-session.json \
  --output /selected/private/coastal-receiver/study-receiving.json \
  receive-study --release ORIGINAL_STUDY_RELEASE_ID
```

All five native export files are retained under `releases/<release-id>/files/`. The receipt carries each original filename, export ID, byte count, SHA-256, study/review pins and a portable relative path. The manifest's source register and every TAR member are verified by streaming. The archive is inspected without extracting or executing members.

The client reports the actual recorded row/value counts and review. Verified file identity does not replace the study's source/basis decision. Station-specific datum, time basis, units, numerical text, quality flags, zero, blank, null and missing distinctions stay in the original mapped values and `valueType`.

Interrupted downloads preserve their prefix. On the next identical receive command the original export is streamed again; every retained prefix byte is compared before additional bytes are appended. The native console has no HTTP Range interface, so this is prefix recovery over the unchanged full stream. A changed completed file or prefix produces a specific conflict instead of replacing that retained evidence.

## 3. Use the original native dataset and query

Receive the existing dataset shown for the reviewed study:

```sh
python3 -B /installed/coops/python/coops_model.py \
  --directory /selected/private/coastal-receiver \
  --startup /selected/private/coops-session.json \
  receive-dataset --dataset ORIGINAL_DATASET_ID
```

If a native dataset has not yet been prepared, explicitly select the release, dataset name and one stable intent:

```sh
python3 -B /installed/coops/python/coops_model.py \
  --directory /selected/private/coastal-receiver \
  --startup /selected/private/coops-session.json \
  prepare-dataset --release ORIGINAL_STUDY_RELEASE_ID \
  --name coastal_model_inputs --intent study-query-preparation-20261012
```

Preparation invokes the original `study.dataset.prepare` action. The existing native parser retains the released CSV, exact mapped headings and original provenance package, with its 250,000-row / 256 MiB bounds. An oversized study keeps its complete release; the native preparation reports its limit so the operator can select another explicit study window.

For an individual native page:

```sh
python3 -B /installed/coops/python/coops_model.py \
  --directory /selected/private/coastal-receiver \
  --startup /selected/private/coops-session.json \
  query --dataset ORIGINAL_DATASET_ID --query 'limit=20' \
  --intent coastal-first-native-page-20261012
```

Use the dataset's actual mapped field names and native filter, field-selection, sort and cursor syntax. The client preserves the query string in the issued request. It does not implement another query engine.

For every row of a selected query, start before the first cursor and add `--all`:

```sh
python3 -B /installed/coops/python/coops_model.py \
  --directory /selected/private/coastal-receiver \
  --startup /selected/private/coops-session.json \
  query --dataset ORIGINAL_DATASET_ID --query 'limit=200' \
  --intent coastal-complete-native-selection-20261012 --all
```

This retains every original native page and streams `selected.csv` plus `selected.jsonl` under `queries/<intent-digest>/`. The final receipt requires the exact reported total and records each native operation, original cursor query, fields, rows and final file hashes. Source strings and explicit native order are preserved. These are complete selected query outputs, distinct from the original byte-identical release files. If the original native page is too large, choose a smaller page limit under a new explicitly reviewed query intent.

## 4. Retain an actual returned file and inspect every difference

Keep the original receiving provenance columns in the analyst's selected CSV or JSONL. The native comparison keys rows by exact edition ID, record ID, original response SHA and source record. It retains all differences and ambiguous identities, including reordered, added, missing and changed rows.

```sh
python3 -B /installed/coops/python/coops_model.py \
  --directory /selected/private/coastal-receiver \
  --startup /selected/private/coops-session.json \
  --output /selected/private/coastal-receiver/returned-review.json \
  return-file --release ORIGINAL_STUDY_RELEASE_ID \
  --file /selected/model-input/returned-input.csv \
  --intent coastal-actual-return-20261012 \
  --note 'Actual source of the returned file and the analyst changes being submitted'
```

The complete original returned file is retained and hash-checked locally before the first native upload action. Native intake uses its original one-MiB boundaries, selected filename/format, expected total bytes and one finishing operation. The full original input, comparison JSONL and comparison summary are then downloaded from native retained exports. The original comparison's bounded parsing/indexing rules remain authoritative; an unresolved or ambiguous comparison cannot be accepted.

To continue after interruption, repeat the same intent, release and original file/note, or omit `--file` to use the already retained input:

```sh
python3 -B /installed/coops/python/coops_model.py \
  --directory /selected/private/coastal-receiver \
  --startup /selected/private/coops-session.json \
  return-file --release ORIGINAL_STUDY_RELEASE_ID \
  --intent coastal-actual-return-20261012
```

The original start, chunk, finish and later decision actions each keep their own exact key. A completed finish is reconciled before any new finish request; accepted chunks replay their existing receipts. Completed chunk journals replace copied base64 with exact chunk size/hash metadata, while the one original local input remains available.

An already completed native return can be received directly with `inspect-return --return-id ORIGINAL_RETURN_ID`. This also records the current native decision ID for an explicit later review.

## 5. Record the actual receiving decision

Read `returns/<return-id>/review-packet.json`, the complete comparison JSONL, original returned file and summary. Supply an actual decision JSON with exactly these fields:

```json
{
  "schema": "stellar-forge.coops-python-receiving-decision.v1",
  "workspaceId": "ORIGINAL_WORKSPACE_ID",
  "returnId": "ORIGINAL_RETURN_ID",
  "comparisonSha256": "EXACT_COMPARISON_SHA256",
  "expectedDecisionId": "CURRENT_NATIVE_DECISION_ID_OR_EMPTY_STRING",
  "status": "ACTUAL_ACCEPTED_OR_FOLLOW_UP_CHOICE",
  "actor": "Actual receiving operator",
  "note": "Actual reviewed changes accepted or requiring follow-up"
}
```

Replace the status placeholder with the operator's actual `accepted` or `follow_up` choice. There is no default approval. An empty expected decision ID is valid only when the original packet has no preceding decision.

```sh
python3 -B /installed/coops/python/coops_model.py \
  --directory /selected/private/coastal-receiver \
  --startup /selected/private/coops-session.json \
  decide --intent coastal-return-decision-20261012 \
  --decision /selected/actual-receiving-decision.json
```

The exact decision file is retained with its byte/hash receipt. The native transaction checks the selected comparison and expected prior decision again, preserving any intervening staff work. It records the receiving decision without replacing original NOAA responses, source review or immutable release.

## 6. Recover the same request and reopen offline

Every first action writes its complete original envelope before dispatch. An uncertain response, authentication expiry or server failure retains that request. Subsequent use of the same intent reads the original operation first, then replays that same body only when needed. Completed native operations return their original result. Current workspace revisions never silently replace an issued request's revision.

`status` lists the exact local action keys and operation IDs. Use `resume --key 'the retained action key'` for one original action, or repeat the higher-level command with its unchanged intent. Exit code 3 means a connection or running operation remains recoverable; a native conflict retains the original request and requires an explicit current-state comparison/new intent. A different file, query or decision cannot take over an existing intent.

Run offline verification without a startup argument:

```sh
python3 -B /installed/coops/python/coops_model.py \
  --directory /selected/private/coastal-receiver \
  --output /selected/private/coastal-receiver/offline-verification.json verify
```

It streams every completed release/source member and checks dataset/return/query files and retained decision inputs. It lists incomplete selections and original action states separately. Keep the entire receiving directory; relative file paths allow its offline reopening after relocation. Keep the original application's native backup separately to restore server records and credentials through that application's normal mechanism.

## Python API

```python
from stellar_coops import CoastalReceiver

with CoastalReceiver(receiver_directory, original_startup_file) as coastal:
    delivered = coastal.receive_release(release_id)
    native = coastal.receive_dataset(dataset_id)
    page = coastal.query(dataset_id, "limit=20", intent + "/first-page")
    full_query = coastal.export_query(dataset_id, "limit=200", intent + "/complete-query")
    packet = coastal.return_file(
        release_id, intent + "/actual-return", selected_returned_file,
        note=actual_analyst_note,
    )

# After an actual independent receiving decision:
with CoastalReceiver(receiver_directory, current_original_startup_file) as coastal:
    decision = coastal.record_decision(intent + "/receiving", actual_decision_file)

with CoastalReceiver(receiver_directory) as coastal:
    verified = coastal.verify()
```

Put the installed `coops/python` directory on the chosen interpreter's import path, or invoke the complete script/installed command. The Python package requires no third-party modules.

## Existing-host continuation

`python/receiving.mjs` exports `continueCoastalPythonReceiving(options)`. It accepts the already-owned console's current startup path, selected Python executable, output directory, original operation ID, immutable release ID and existing native dataset ID. The caller supplies its same-origin restart callback:

```js
await continueCoastalPythonReceiving({
  startupFile, outputDirectory, pythonExecutable,
  operationId, releaseId, datasetId,
  existingReturnId, // receive an actual comparison/decision already saved in the same flow
  restart: async ({ phaseKey, workspaceId, baseURL }) => {
    await originalRestart({ phaseKey, workspaceId, baseURL, page });
    return { startupFile: currentOriginalStartupPath };
  }
});
```

For a new actual analyst return, replace `existingReturnId` with `returnedFile`, `returnNote` and `reviewReturn`. That callback receives `{requestPath, requestSha256, packet, files}`. Return an actual response object or its absolute original file path:

```js
{
  schema: "stellar-forge.coops-python-review-response.v1",
  requestSha256,
  decision: actualCompleteDecision
}
```

The completed reviewer response is retained and reused after interruption. Every later phase keeps its original intent and artifact hash. The continuation receives all files, runs the complete native query, retains the actual comparison/decision, asks the existing owner to restart its original console, checks the same dataset/return after reopening and verifies the complete local handoff offline. It starts only the explicitly selected Python client; it creates no console, browser, provider or source-capture runtime. Include its actual selected output footprint in the original receiving admission before invoking it.

The result is `python-receiving-result.json`, with `python-receiving-checkpoint.json`, source identities, native IDs and complete artifacts. The original La Jolla source/study operation remains the receiving path for the product; actual source and study approvals are issued only on that operation's retained packets.
