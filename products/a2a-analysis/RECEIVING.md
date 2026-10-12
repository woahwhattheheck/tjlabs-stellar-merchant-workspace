# Receive and reopen analytical customer work

The complete product supports four customer delivery operations:

| Delivery | Receiver | Retained customer work |
| --- | --- | --- |
| Original analytical task | `a2a-product receive` | Agent Card, exact request/message ID, Task snapshots and every original file |
| Frozen merchant result | `a2a-product merchant inspect-result` | Complete result packet, task lineage and original output bytes |
| Editable Agent workspace | `a2a-product merchant receive` | Project revisions, reviewed source, result editions, publications and handoffs |
| Original analytical workspace | `a2a-product archive receive` | Complete private database, retained source, queries, reports and original workspace identity |

Run the commands through the selected installed runtime. The examples use the original `starforge runtime-install run` entry described in [OPERATING.md](OPERATING.md).

## Receive a task and its complete files

Supply the selected host token through `A2A_ANALYSIS_TOKEN` or the original receiver's `--token-env` option. Select one new private receiving directory for the request:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product receive catalog \
  --url https://analysis.example.com/a2a \
  --directory /private/customer-catalogue

starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product receive run \
  --url https://analysis.example.com/a2a \
  --procedure RETURNED_PROCEDURE_ID \
  --directory /private/customer-analysis-result
~~~

The receiver saves the actual card and exact native request before sending. It retains the original Task as the operation progresses and verifies every complete output file on completion. A query delivers its selected complete CSV, JSONL and SQLite exports plus the original manifest and analytical record. A report delivers its selected original JSON, HTML and CSV ZIP exports.

When the response is interrupted, reopen the same receiving directory. Read the original task ID from its saved task record:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product receive get \
  --directory /private/customer-analysis-result --task ORIGINAL_TASK_ID
~~~

If the initial send needs reconciliation, `submit --directory SAME_DIRECTORY` uses the exact retained request/message ID. The analytical service returns the same initial task for matching request bytes. For an input-required task, use the original `resume` command with that task ID; the new continuation still belongs to the existing task and context.

Save exact parameter JSON in a private file and pass `--parameters-file` when the captured query permits parameters. The original text reaches Python unchanged.

## Receive the merchant's frozen result

Export a specific frozen result edition from the original merchant workspace:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product merchant result \
  --workspace /private/agent-merchant \
  --id ORIGINAL_PROJECT_ID --edition ORIGINAL_EDITION_ID \
  --out /private/customer-result.json
~~~

The recipient opens the complete saved file:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product merchant inspect-result \
  --input /private/customer-result.json \
  --out /private/customer-result-review.json
~~~

Inspection validates the complete result population against the original source Task/Message. It checks output identities and positions, original inline content and declared filenames/media types; configured URL captures retain their corresponding complete HTTP exchange. The result keeps the reviewed edition and original files for the customer's use.

The original seller can deliver the same frozen result as its fixed paid file. Its existing purchase and delivery records continue to identify that publication.

## Receive an editable Agent workspace

Close the original browser owner before opening its workspace through a separate CLI process. Export either its current project or a selected retained revision/named handoff:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product merchant export \
  --workspace /private/agent-merchant \
  --id ORIGINAL_PROJECT_ID \
  --out /private/agent-project.json
~~~

Receive those exact bytes with one stable local request ID:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product merchant receive \
  --workspace /private/customer-agent-workspace \
  --input /private/agent-project.json \
  --request-id CUSTOMER_RECEIVING_REQUEST_ID
~~~

Receiving preserves the existing project and history. Reopening the same packet reuses the retained result. A forward revision carries its original historical handoffs and requires the recipient to select its own current host connection before further remote work. The existing receiver reports an older or divergent selection against the current project so the operator can inspect that exact history.

Open the received workspace with the recipient's private host connection:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product merchant workspace \
  --workspace /private/customer-agent-workspace \
  --connections /private/customer-connections.json --port 0
~~~

Review its History and source, Results, and Merchant and handoff panes. Historical downloads remain tied to the displayed revision. Host credential values are supplied by the recipient's environment; the portable project retains its own original source and public delivery rules.

## Receive the original analytical workspace

Use the original Analysis Workspace export when the customer needs the saved database, source editions, queries and reports for further analysis. Close the current Python browser owner, then select a stable 32-character lowercase hexadecimal export operation ID and keep it for a repeat:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product workspace --database /private/customer-analysis \
  workspace-export --id ORIGINAL_EXPORT_OPERATION_ID
~~~

The original completed job returns the actual output directory, `workspace.zip`, its SHA-256, the manifest and complete payload counts. Inspect those returned bytes through the original receiver:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product archive inspect /private/delivered/workspace.zip \
  --sha256 ORIGINAL_ARCHIVE_SHA256
~~~

Receive the same archive into an absent destination below a private parent:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product archive receive \
  /private/delivered/workspace.zip /private/restored-analysis \
  --operation ORIGINAL_RECEIVING_OPERATION_ID \
  --sha256 ORIGINAL_ARCHIVE_SHA256
~~~

The receiver checks every selected member, reconstructs the original database, resumes the same retained staging operation when needed and atomically publishes the complete workspace. Reopen it through the same original analytical application:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- \
  a2a-product workspace --database /private/restored-analysis serve --port 0
~~~

The [original archive receiving guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/WORKSPACE_ARCHIVE_RECEIVING.md) documents supported paths, complete source custody and receiving outcomes. Capturing an A2A service against this received workspace uses its actual restored path and original workspace identity.

## Whole native commissioning

The maintained programme composes the original SensorThings source intake, Python analysis application, official SDK service, merchant operator, SF30/SF82 publication and complete customer receiving.

Run the original analytical programme from the installed source root with its exact retained Hamburg source recording:

~~~sh
node /private/a2a-runtime/package/source/stellar-forge/a2a-analysis-agent/commission.mjs \
  --directory /private/a2a-commission \
  --recording /private/native-recording.json \
  --checkout /private/a2a-runtime/package/source \
  --python python3 \
  --merchant-module /private/a2a-runtime/package/source/stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/receiving/commission.mjs
~~~

The [analytical service guide](../../stellar-forge/a2a-analysis-agent/README.md#whole-native-commissioning) identifies the original recording's repository, commit, exact byte count and SHA-256. Reuse those original bytes. The programme accepts an existing original dataset package through `--dataset-package` where applicable.

Its customer operation includes the complete 660-row source edition, saved query/report revisions, exact integer parameters, concurrent native tasks, full file receiving, caller isolation, service reopen and cancellation. The merchant continuation includes original request recovery, full result review, frozen publication, two release activations and rollback, portable workspace receiving/reopen, historical downloads and desktop/mobile browser operation.

The browser continuation requires the actual Playwright module and installed Chromium executable, selected through `A2A_RECEIVING_PLAYWRIGHT` and `A2A_RECEIVING_CHROMIUM`. The original programme returns the completed stage records, full source and files, actual native identities and browser outputs under the selected private directory. Preserve the resulting complete customer work with its original operation.
