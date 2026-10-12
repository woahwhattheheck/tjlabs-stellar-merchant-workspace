# AgentLedger caller and result workbench

AgentLedger records an agent's decisions and settlements. The Starforge buyer retains the original request, native execution, and complete response file. This adapter joins those two operating histories into a useful task and a portable workbench.

The workbench opens as a local HTML file. It includes the complete captured ledger, filters for agent/network/verdict, original decision details, explicit links to the selected buyer requests, original native outcomes, and downloads for every received file. A later useful request gets its own task revision and can be compared with its predecessor.

## Installation and entry points

The full distribution installs the command:

~~~sh
starforge buyer-agentledger --help
~~~

The standalone Node package exports:

~~~js
import {
  importAgentLedgerSnapshot, captureAgentLedgerSnapshot,
  openAgentLedgerSnapshot, previewAgentLedgerTask,
  createAgentLedgerTask, openAgentLedgerTask,
  openAgentLedgerDelivery, compareAgentLedgerSnapshots,
  compareAgentLedgerTasks,
} from '@stellar-forge/native-buyer/agents/agentledger';
~~~

The standalone executable is **starforge-agentledger**. Its original buying runtime is the same selected SF88 installation used by Buyer; use the existing complete installation and workspace recovery procedure from INBOX.md, INBOX_TASKS.md, and WORKSPACE.md.

## Bring in a real ledger window

Capture the deployed ledger with one GET:

~~~sh
starforge buyer-agentledger capture \
  --directory /private/agentledger/captures/2026-10-12-first
~~~

The default public route is https://useagentledger.xyz/api/x402/ledger?limit=50. A private deployment may pass its HTTPS ledger route through **--source**. The SDK also accepts request headers in memory:

~~~js
const snapshot = await captureAgentLedgerSnapshot({
  directory: '/private/agentledger/captures/current',
  source: deployment.ledgerUrl,
  headers: deployment.ledgerHeaders,
  signal,
});
~~~

The adapter persists the full response bytes, source URL, timestamps, status and selected response metadata. Request headers remain in the caller. Ledger source query strings accept only the documented limit parameter; use headers for a deployment's private authentication.

If the exact response was already downloaded by the existing operator, import those bytes:

~~~sh
starforge buyer-agentledger import \
  --file /private/intake/original-ledger.json \
  --source https://useagentledger.xyz/api/x402/ledger?limit=50 \
  --directory /private/agentledger/captures/imported
~~~

**--observed-at** can retain an available original observation timestamp. Without it, the import records the time the local bytes were inspected. The source method distinguishes an import from an HTTPS GET.

Each capture contains:

| File | Purpose |
|---|---|
| ledger.json | Entire original response byte stream |
| snapshot.json | Source, byte identity, and checked ledger window |
| capture-intent.json | The same retained capture identity for interrupted publication |
| index.html | Searchable offline workbench |

Opening an existing capture verifies the full original JSON and chain again. Capture at a completed path resumes that exact retained capture. Select a new directory to obtain a later window. If a process ended after it retained an intent but before it retained the original body, continue from that original response through import; the existing directory will not silently turn into a different observation.

All application directories use the original SDK's private state and atomic create-only file publication. Existing files must match their retained bytes to be reused.

## What the chain check covers

AgentLedger's official documentation defines this field order:

~~~text
seq, ts, agentId, resource, method, amount,
asset, network, payTo, verdict, rule, txHash
~~~

For each entry sorted by seq, the adapter checks the previous hash, joins those field values as key=value with |, prefixes the previous hash and another |, then computes SHA-256. It preserves the original first previous hash, last hash, sequence range and any sequence gaps.

The scope is the captured window. For example, the original public response acquired on October 12, 2026 contained 50 entries, sequences 576–625. Its exact 29,200-byte identity was:

~~~text
2e177f9994eb53e12d20d7e9c0140d81da04659bf8c1bd59f60085c605432321
~~~

All 50 entries matched the documented algorithm. Its preceding hash remains part of the capture; earlier history is obtained through an earlier original capture.

Fields such as reason, tenantId, kind, quoted, httpStatus and settles are retained in the complete original JSON. They are outside the documented twelve-field chain. Whole-capture identity and each task's full selected record preserve those fields. The snapshot comparison separately reports changes to a chain-covered entry and changes to another field on an entry whose chain hash stayed the same.

The documented ledger route is read-only. The deployment's current governor and signer continue to own its quote evaluation, reservation and payment operation. An old recorded ALLOW is historical context for a task. Use the original current buyer review and the deployment's existing reservation flow when starting a new request.

Primary contract: [AgentLedger documentation](https://useagentledger.xyz/docs/).
Original public response route: [AgentLedger ledger](https://useagentledger.xyz/api/x402/ledger?limit=50).

## Attach the actual original request

A task selects one or more existing Inbox intents and explicit AgentLedger decision entries. Its preview checks the following before creating a durable task:

| Binding | Source |
|---|---|
| Agent and tenant | Exact selected ledger entry |
| Decision identity | Sequence and full recorded chain hash |
| Caller task ID and revision | Application's requested task |
| Resource and HTTP method | Ledger resource joined to the explicit original service origin |
| Stellar network, asset and recipient | Recorded decision and original native expectation |
| Recorded quote | Exact decimal-to-atomic conversion using explicit asset decimals |
| Original spending ceiling | Existing request's expect.maxAtomic |
| Original request identity | Existing Inbox config, operation, body and ticket bindings |
| Settlement history | Full entries whose explicit settles field names the decision, with the same agent and tenant |
| Source/provider selection | Existing task's role, source edition and selected facilitator |

The native expectation's maxAtomic is a ceiling. It remains displayed beside the recorded quote. A quote above that ceiling fails the join. The converter uses integer arithmetic and rejects amounts that require rounding at the supplied asset precision.

The ledger often records only a path such as /api/v1/premium/signals. Supply the service origin from the actual original Inbox request. The adapter does not infer a seller from the AgentLedger dashboard hostname.

A decision must have kind decision. A control event that grants an override is retained in the ledger history and does not take the place of the actual request decision. HOLD and BLOCK entries can be joined for review; those historical states retain their original labels.

The current original buyer path binds exact Stellar testnet or public-network terms. The offline ledger workbench reads all recorded networks, including Base and Solana entries. Its chain parser does not convert a different payment rail into a Stellar request.

### Complete SDK example

This code uses the already selected original intent and the deployment's known asset configuration:

~~~js
import { Buyer } from '@stellar-forge/native-buyer';
import {
  openAgentLedgerSnapshot,
  previewAgentLedgerTask,
  createAgentLedgerTask,
} from '@stellar-forge/native-buyer/agents/agentledger';

const buyer = new Buyer({
  runtimeDirectory: installation.sf88Directory,
  stateDirectory: installation.nodeStateDirectory,
});
const inbox = buyer.inbox(customer.originalInboxDirectory);
const snapshot = await openAgentLedgerSnapshot({
  directory: customer.originalLedgerCapture,
  expectedSha256: customer.originalLedgerSha256,
});
const job = (await inbox.show(customer.originalIntentId)).native;
const decision = snapshot.entry(customer.decisionSequence);

const input = {
  inbox,
  snapshot,
  agent: { id: decision.agentId, tenantId: decision.tenantId ?? null },
  task: {
    system: 'agentledger',
    id: customer.businessTaskId,
    revision: customer.taskRevision,
    title: customer.taskTitle,
    purpose: customer.requestedOutcome,
    service: customer.serviceName,
  },
  selections: [{
    intentId: job.operation.intentId,
    decisionSequence: decision.seq,
    decisionHash: decision.hash,
    serviceOrigin: new URL(job.operation.url).origin,
    assetDecimals: customer.assetDecimals,
    role: customer.resultRole,
    sourceEdition: customer.sourceEdition ?? null,
    facilitator: customer.selectedFacilitator ?? null,
  }],
};

const preview = await previewAgentLedgerTask(input);
const task = await createAgentLedgerTask({
  ...input,
  directory: customer.callerTaskDirectory,
  expectedPreviewSha256: preview.previewSha256,
});
const state = await task.inspect();
const delivered = await task.receive({
  directory: customer.receivedWorkbenchDirectory,
});
console.log(delivered.toJSON());
~~~

The preview binds every choice. If the source, decision, original request or selected terms changed before creation, creation rejects the changed selection. A completed task reopens from its original directory. Existing tasks carry their own complete ledger capture.

The task.originalTask property is the original InboxTask. Its native review, execute, recover and response methods remain available to the application's existing operator. The new adapter provides the caller/ledger/result relationship around that original workflow.

## CLI task specification

The CLI takes the same selection in a JSON file:

~~~json
{
  "snapshot": "/private/agentledger/captures/current",
  "snapshotSha256": "EXACT_CAPTURE_SHA256",
  "agent": {
    "id": "ORIGINAL_AGENT_ID",
    "tenantId": "ORIGINAL_TENANT_ID"
  },
  "task": {
    "system": "agentledger",
    "id": "CUSTOMER_TASK_ID",
    "revision": "CUSTOMER_TASK_REVISION",
    "title": "CUSTOMER_TASK_TITLE",
    "purpose": "CUSTOMER_REQUESTED_OUTCOME",
    "service": "ORIGINAL_SERVICE_NAME"
  },
  "selections": [{
    "intentId": "ORIGINAL_INBOX_INTENT",
    "decisionSequence": 1,
    "decisionHash": "EXACT_RECORDED_DECISION_HASH",
    "serviceOrigin": "https://ORIGINAL_SERVICE_HOST",
    "assetDecimals": 7,
    "role": "CUSTOMER_RESULT_ROLE",
    "sourceEdition": "ORIGINAL_SOURCE_EDITION",
    "facilitator": "https://ORIGINAL_SELECTED_FACILITATOR"
  }]
}
~~~

Replace the marked values, sequence and asset precision with the actual original records. The module validates them; placeholder values will not create a task.

~~~sh
starforge buyer-agentledger preview \
  --runtime /private/installation/sf88-operator-buyer-cli \
  --state /private/buyer/node-state \
  --inbox /private/buyer/inbox \
  --spec /private/caller/task-spec.json \
  --output /private/caller/task-review.json

starforge buyer-agentledger create \
  --runtime /private/installation/sf88-operator-buyer-cli \
  --state /private/buyer/node-state \
  --inbox /private/buyer/inbox \
  --spec /private/caller/task-spec.json \
  --directory /private/caller/task \
  --preview-sha256 ACTUAL_PREVIEW_SHA256
~~~

For the existing native task operation, use starforge buyer-inbox-task with **--directory /private/caller/task/original** and the same original runtime, state and Inbox.

## Receive and reopen the full result

~~~sh
starforge buyer-agentledger receive \
  --runtime /private/installation/sf88-operator-buyer-cli \
  --state /private/buyer/node-state \
  --inbox /private/buyer/inbox \
  --directory /private/caller/task \
  --output /private/delivery/customer-workbench

starforge buyer-agentledger delivery \
  --directory /private/delivery/customer-workbench
~~~

Receiving copies every selected complete response through the original verified file receiver. Existing complete copied files are verified and reused if the process was interrupted. The same output directory continues the original receiving operation.

The full received directory contains the top-level index.html, manifest.json, task.json and receiving-intent.json; the entire original ledger capture under ledger/; and the original InboxTask receiving plan, manifest, task, report and complete response files under results/.

Open the top-level index.html. The entry table links the selected decision to its complete result, recorded settlement entries, and actual original HTTP/native outcome. Received bytes can include a complete error response; its native outcome remains visible. Complete file transfer and service outcome stay independently inspectable in the original task.

The delivery opener authenticates the ledger body, task bindings, original receiving plan, all complete response files and the workbench before returning. The received directory can be moved or restored as one complete unit. Opening it offline requires no original signer, merchant listener, Inbox root or provider connection.

Continue future buying through the existing installation and original working roots. The received folder is the customer's finished result, while the original workspace retains operation state.

## Later useful work and comparison

Keep each capture and task edition. Obtain a later ledger window in another directory, create a new useful original request through the existing application, then create its caller task with an explicit predecessor:

~~~js
const nextInput = {
  ...newTaskInput,
  predecessor: {
    taskSha256: previousTask.originalTask.taskSha256,
    system: previousTask.originalTask.manifest.task.system,
    id: previousTask.originalTask.manifest.task.id,
    revision: previousTask.originalTask.manifest.task.revision,
  },
};
~~~

The task comparison explains the original request/source/facilitator changes together with the selected decision and settlement-history changes. The snapshot comparison shows overlap, newly captured sequences, entries outside the later window and direct chain continuity.

An entry outside a later limited window remains in its original capture. The comparison calls this outsideNextWindow; it does not treat pagination as a deleted financial event.

## Operational failures with a concrete continuation

| Error | Meaning and continuation |
|---|---|
| AGENTLEDGER_CHAIN_MISMATCH | The retained bytes do not match the documented chain. Read the exact source response and selected window before intake. |
| AGENTLEDGER_SEQUENCE_OUTSIDE_CAPTURE | The chosen decision is outside these captured rows. Use its original retained capture or obtain the relevant actual window. |
| AGENTLEDGER_REQUEST_RESOURCE_MISMATCH | The explicit original service origin, path or method differs. Compare the original request and selected decision. |
| AGENTLEDGER_ORIGINAL_STELLAR_TERMS_MISMATCH | The network, asset, recipient or current native rail differs. Use the matching original buyer request. |
| AGENTLEDGER_AMOUNT_NOT_EXACT_AT_ASSET_DECIMALS | The supplied precision would require rounding. Read the actual asset configuration. |
| AGENTLEDGER_SOURCE_CHANGED_SINCE_REVIEW | The selected source changed after preview. Inspect the current source and create its reviewed edition. |
| AGENTLEDGER_ORIGINAL_CAPTURE_BYTES_REQUIRED | The original capture intent survived but its full body did not. Continue from the existing original response bytes. |
| TASK_RESULTS_PENDING | One selected original request has not yet published a complete native response. Continue that original operation, then receive at the same output path. |
| AGENTLEDGER_EXISTING_FILE_CHANGED | A retained destination differs from the selected byte identity. Preserve it and inspect its original source; receiving will not overwrite it. |

The original Inbox worker's private diagnostic path remains available if its runtime fails. Its current native diagnostic retains the complete underlying error next to the original private request, native output, stdout and stderr. Caller code should use that actual operation directory when repairing a source/runtime join.
