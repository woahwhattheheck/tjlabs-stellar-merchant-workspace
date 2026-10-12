# Native analytical A2A agent

This service exposes selected existing Stellar Forge saved queries and reports through A2A 1.0. A customer agent receives the complete original output files and can reopen the same retained task after a service restart.

The original Analysis Workspace owns SQL, source editions, query results, report publication and exported files. The official A2A JavaScript SDK owns protocol serialization, task persistence, caller isolation and event processing. This package connects those two existing systems.

## Runtime and source

Use Node 24 on Linux and the matching original Stellar Forge source checkout.

| Component | Selected implementation |
| --- | --- |
| Protocol | A2A 1.0 |
| SDK | `@a2a-js/sdk` 1.3.0 |
| SDK source | [a2aproject/a2a-js at 29417a5](https://github.com/a2aproject/a2a-js/tree/29417a5bb4038f804f310ce4fffd267a9375aa90) |
| Task store | SDK `DatabaseTaskStore`, Kysely 0.29.5, better-sqlite3 13.0.3 |
| HTTP | Express 5.1.0 |
| Analysis | Original [AnalysisWorkspace](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/stellar_forge_buyer/analysis_workspace.py) |
| Native adapter | Original [native-analysis.mjs](../mcp-paid-agent/native-analysis.mjs) |
| Single writer | Original [Dataset writer lease](../../stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-refresh/writer-lease.mjs) |

The original Python application and this process run as the same operating-system user. The adapter reads that application's existing private `analysis-launch.json` on every call, so it follows an original service restart and its new private capability URL.

## Install and expose a selected analysis

Install this package's declared runtime dependencies in the maintained source checkout:

```bash
cd /opt/stellar-forge/stellar-forge/a2a-analysis-agent
npm install --omit=dev --no-audit --no-fund
```

Start the original customer Analysis Workspace with its existing private database. In that application, import and select the intended source edition, save the query recipes, and save any report definition. Keep the original service running.

Capture selected original revisions:

```bash
node cli.mjs capture \
  --directory /var/lib/stellar-forge/a2a-analysis \
  --database /var/lib/stellar-forge/customer-analysis \
  --query monthly_observations@2 \
  --report operations@1 \
  --public-url https://analysis.example.com/a2a \
  --name 'Operations analysis' \
  --out /var/lib/stellar-forge/a2a-analysis/config.json
```

Capture records the original workspace ID, complete selected view records, saved query SQL and unchanged parameter text, and the exact report definition. The resulting procedure IDs are printed. Capture uses a new configuration filename so an existing deployment's selection is reviewed explicitly.

Initialize the official SDK's task schema and check the selected native procedures:

```bash
node cli.mjs init --config /var/lib/stellar-forge/a2a-analysis/config.json
node cli.mjs check --config /var/lib/stellar-forge/a2a-analysis/config.json
```

Set the token through a private environment file or service manager and start:

```bash
node cli.mjs serve --config /var/lib/stellar-forge/a2a-analysis/config.json
```

The default token variable is `A2A_ANALYSIS_TOKEN`. Tokens must contain 32–1,024 characters without whitespace. The server validates all configured token variables at startup. Stable principal names own their original SDK tasks; a token can change while its principal name stays the same.

## Connect from the merchant workspace

In the original merchant Agent workspace, create a connection to the agent origin and configure its environment-supplied bearer credential. Capture the Agent Card, select its JSONRPC A2A 1.0 interface, prepare a message, and send it. Review the complete returned artifacts before freezing the result and preparing its original SF30/SF82 publication.

An initial catalogue request uses the following native ProtoJSON shape:

```json
{
  "message": {
    "messageId": "a-stable-client-generated-message-id",
    "role": "ROLE_USER",
    "parts": [
      {
        "data": {"action": "catalog"},
        "mediaType": "application/json"
      }
    ]
  },
  "configuration": {"returnImmediately": true}
}
```

The catalogue artifact contains only the procedures available to that caller. To run one, replace the part's data with:

```json
{"action": "run", "procedureId": "query_monthly_observations"}
```

When the operator captured the query with `--allow-parameters`, a caller may send unchanged JSON parameter **text**:

```json
{
  "action": "run",
  "procedureId": "query_monthly_observations",
  "parametersText": "{\"minimum_id\":9223372036854775806}"
}
```

The text is validated as a JSON array or object and forwarded unchanged to the original Python engine. This preserves exact signed 64-bit integers. Native SQLite parameter validation still applies.

Use standard GetTask, ListTasks, SubscribeToTask and CancelTask for the original task ID. Streaming uses the original SDK's task subscription while a separate original ResultManager continues saving events; disconnecting a receiving stream does not interrupt the analytical task.

## Complete customer files

Query tasks return the selected complete native CSV, JSONL and SQLite files, the original `manifest.json`, and `analysis-record.json`. The native preview row limit does not limit the full export. The exporter must report `queryComplete: true`; an output limit causes an explicit failed task.

Report tasks run the selected original report definition in its original database snapshot, publish the retained report through the native publication revision check, and return the requested complete JSON, HTML and CSV ZIP files. The final record identifies the original report, publication, jobs and file hashes.

Every file is one complete native A2A raw part. The metadata carries its original SHA-256 and byte count. The service checks each native file range and the complete file before publishing the artifact. A configured `maxOutputBytes` applies to the native output set; the analytical record is additional metadata. Capture defaults to 16 MiB, which fits the merchant result publication's current complete-asset limit when its packet overhead also fits. Select a smaller output set when the complete merchant packet would exceed that limit.

The standalone receiving CLI writes private original task snapshots, verifies the complete file set, and saves the actual filenames:

```bash
node receive.mjs catalog \
  --url https://analysis.example.com/a2a \
  --directory /private/analysis-catalogue

node receive.mjs run \
  --url https://analysis.example.com/a2a \
  --procedure query_monthly_observations \
  --directory /private/monthly-analysis

node receive.mjs get \
  --directory /private/monthly-analysis \
  --task ORIGINAL_TASK_ID
```

Before sending, the receiver saves the selected Agent Card and exact request in `request.json`. `submit --directory ...` uses that same message ID and request. The server finds an initial message in the official SDK's original task history; matching retries return the same task, including after a restart. A changed body or context under that message ID is rejected.

The receiver sends its token only to the exact selected A2A endpoint. It reads the public Agent Card without the token, rejects redirects and does not fetch artifact URLs.

## Resume and cancellation

A stopped service leaves the saved original task, source selection and native operation IDs in the SDK task database. Start the same configuration and send:

```json
{
  "message": {
    "messageId": "a-new-continuation-message-id",
    "taskId": "ORIGINAL_TASK_ID",
    "contextId": "ORIGINAL_CONTEXT_ID",
    "role": "ROLE_USER",
    "parts": [{"data": {"action": "resume"}, "mediaType": "application/json"}]
  },
  "configuration": {"returnImmediately": true}
}
```

Or use `node receive.mjs resume --directory ... --task ...`.

The service saves each exact native call into the original task before dispatch. Resume reads the same original job IDs and compares their complete selected requests. Already received artifacts are checked and reused. When the original workspace is processing another task, the pending task waits and repeats its original request ID after that workspace becomes available.

CancelTask retains the cancellation intent. An active original full-query export receives its native cancel request; other original read-only query and report jobs remain owned by their engine while A2A delivery stops. A cancellation saved immediately before a server interruption is reconciled before a resumed task can issue another original call. Repeated cancellation on the same canceled A2A task also rechecks an original export whose last reply was unresolved.

The original engine determines whether an interrupted native job can continue. The service reports its actual native status and preserves its ID. A completed original export stays complete even when the receiving A2A task is canceled afterward.

## Configuration and operations

Configuration can include multiple original workspaces and multiple principals. Each principal has `name`, `tokenEnv` and a list of allowed procedure IDs; `["*"]` selects all configured procedures. Each procedure retains its own workspace ID and source view selection.

| Route | Purpose |
| --- | --- |
| `/.well-known/agent-card.json` | Public generic Agent Card |
| `/a2a` | Authenticated A2A JSONRPC endpoint |
| `/healthz` | Process liveness |
| `/readyz` | Authenticated connection and original workspace identity check |

The server starts only after explicit SDK initialization. A kernel-backed original Dataset lease prevents two service writers from opening the same task database. Task persistence uses WAL and full synchronization. The small derived message-ID index refers to the SDK's original history column.

Use `check` after deliberately selecting a new original edition. Existing task plans retain their original source choices; new configuration does not rewrite historical tasks. Add a new captured configuration or reviewed procedure revision for new work.

The [systemd service](deploy/a2a-analysis.service) and [Nginx example](deploy/nginx.conf) provide a Linux deployment. Adapt the executable and source paths, original data directory, hostname and existing TLS certificate. Keep the original Python service under its existing process owner. The A2A service stops accepting requests on SIGTERM, retains active tasks, closes its native adapter, and releases its writer lease.

## Whole native commissioning

The commissioning programme uses the original retained 28-response Hamburg recording:

- Git repository: `woahwhattheheck/public-commons-sprint-2026`.
- Source commit: `b602d5b5e220f8c9d06b82bcd55decbc9d013e1c`.
- Source path: `stellar/scf-starforge-20261009/operations/sensorthings-hamburg-native-20261012/native-recording.json`.
- Complete bytes: 2,965,230.
- SHA-256: `34fb0322092a51525e94beda0d6c3b21548b7261d65d80909b27eb6fa6a2d466`.

```bash
node commission.mjs \
  --directory /private/a2a-commission \
  --recording /private/native-recording.json \
  --checkout /opt/stellar-forge \
  --python python3 \
  --merchant-module /opt/stellar-forge/stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/receiving/commission.mjs
```

An existing accepted package can be selected with `--dataset-package`. The programme receives both original editions through the original SensorThings workspace, reviews their actual IDs, produces the complete 660-row native dataset package, and imports it through the original source-document, response-projection and DatasetDatabase operations. Full source bodies, edition review, licence and semantics stay with that source.

The same original Analysis Workspace then serves the official SDK catalogue, concurrent query tasks, exact integer parameters, complete report publication and exports, customer receipt, caller isolation, the merchant result workflow, and same-task service reopen/cancellation. The programme keeps the first selected agent origin across each restart and returns its complete actual result under the selected private directory.

Run this programme with an isolated commissioning directory. Its output records actual task IDs, original job IDs, source identities, complete artifacts and receiving destinations. Repeating an initial A2A send uses the saved original message ID. The executable result, rather than this source description, records which native stages completed.
