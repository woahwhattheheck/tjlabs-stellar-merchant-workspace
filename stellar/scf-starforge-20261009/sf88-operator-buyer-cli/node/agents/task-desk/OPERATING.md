# InboxTask desk

The InboxTask desk brings prepared Inbox jobs into one operator workflow: choose the original requests, save an exact task revision, review the selected action, execute or recover it, receive complete responses, and open a portable result packet.

A task records the caller's purpose and each selected role alongside its original intent and request fingerprints. Its received packet keeps the complete response files, source and request lineage, native outcomes, and a readable report.

## Start the desk

Run the command from the original SF88 runtime root, supplying the existing runtime and the directories assigned to this inbox:

~~~sh
node node/agents/task-desk/cli.mjs \
  --runtime /absolute/path/to/original-runtime \
  --state /absolute/path/to/original-state \
  --inbox /absolute/path/to/original-inbox \
  --tasks /absolute/path/to/original-state/tasks \
  --outputs /absolute/path/to/received-packets \
  --workspace /absolute/path/to/original-workspace \
  --port 0
~~~

The installed distribution provides `starforge buyer-task-desk`; the standalone Node package provides `starforge-task-desk`. Both accept the same launch options shown above.

Replace the example paths with this operation's actual absolute directories. `--runtime` is the complete original SF88 runtime directory, for example `/srv/starforge/sf88-operator-buyer-cli`. `--state` is the private Node buyer application-state directory. Put `--tasks` below that existing app state so its normal backup includes the task revisions.

`--inbox` is the original Inbox directory, permanently recorded in each task. Keep that same absolute root when reopening native work. The optional `--workspace` is the original native operator workspace directory used by execution. Set `--outputs` to a separate private root outside the task and Inbox directories; continue receiving into the same assigned destination.

The server listens on `127.0.0.1`. With `--port 0`, it selects an available port. Open the URL printed by the command. Keep the task and output directory values when restarting so the desk can reopen saved revisions, commands, and result packets.

| Option | Purpose |
| --- | --- |
| `--runtime` | Complete original SF88 native runtime directory. |
| `--state` | Existing private Node buyer application-state directory. |
| `--inbox` | Original Inbox jobs available for task selection. |
| `--tasks` | Saved task revisions and retained desk command records. |
| `--outputs` | Complete received task packets and response files. |
| `--workspace` | Optional original native operator workspace directory used by execution. |
| `--existing-task` | Optional original task directory containing `task.json`; pair with `--existing-output`. |
| `--existing-output` | That task's original receiving destination, or its complete delivered packet. |
| `--port` | Local listening port; `0` selects an available port. |

## Open through Applications

The installed runtime workspace includes **Applications → New application → Inbox tasks** when its source contains the `buyer-task-desk` contribution. This opens the same desk through the maintained application lifecycle.

Choose the READY installed runtime containing the desk, then enter the original operating directories:

| Application selection | Desk option |
| --- | --- |
| Original SF88 runtime | `--runtime` |
| Private Node buyer state | `--state` |
| Original buyer Inbox | `--inbox` |
| Saved task revisions | `--tasks` |
| Complete result packets | `--outputs` |
| Existing task revision | Optional `--existing-task`; select both existing-directory fields. |
| Original receiving or delivered packet | Optional `--existing-output`. |
| Original operator workspace | Optional `--workspace` |
| Local port | `--port`; `0` chooses an available port |

The installed runtime supplies the desk code. **Original SF88 runtime** selects the complete native buyer directory already used for these requests. **Private Node buyer state** and **Original buyer Inbox** select their existing private directories. Saved tasks and output packets can use new child directories in existing private parents. Keep the same task and output roots when reopening a previous desk.

Use **Review application → Save application → Review start → Start reviewed application → Open application**. The review retains the source, original Inbox marker, directory selections, and private environment choice. The managed launch reads the native CLI's formatted JSON announcement, checks the live desk's instance and roots, and saves that actual private URL in its original application operation. The desk's session token stays with the live listener.

Closing the browser leaves accepted work running. **Stop application** sends the normal managed stop request; the native desk waits for its accepted commands before closing. A later reviewed start uses the same saved roots and retains the task and command history. An interrupted command is reopened by its original command ID inside the desk before a further explicit recovery or receiving action.

For a task created before this desk, select its actual **Existing task revision** and **Original receiving or delivered packet** directories. Applications review uses the same original task, destination, and packet checks as desk launch. A recorded receiving destination can be absent after interruption; its original marker binds the continuation. A moved complete packet is opened and checked as a delivered packet.

The provider reserves the selected task and output directories, including the existing task and result pair, through the existing Applications resource mechanism. For another view of the same saved desk, use **Open application** on its current run.

Inspect the installed registration with:

~~~sh
starforge registrations --source buyer-task-desk
starforge registrations --command buyer-task-desk
~~~

For a maintained source-selection recipe that should include this workflow, add `buyer-task-desk` to that recipe's existing `contributions` list. The complete distribution and standalone Node package already carry the desk's browser, typed client, and guide.

## Continue an existing native task and receiving

An original task can live in a directory named by its caller, such as `delivery/task`. The desk opens that directory directly alongside its own saved tasks. Set both `--existing-task` and `--existing-output`; the original manifest must name the selected Inbox.

The task keeps its exact record and directory. Its task details show the actual task and result locations, while the browser uses the stable identity of that caller revision. A conflicting revision already stored under that identity is rejected. The private `--tasks` root retains the desk's command history, and `--outputs` remains the result root for other tasks created in the desk.

| Selected result location | Desk behavior |
| --- | --- |
| Original destination named in this task's retained receiving record | Open the existing packet or explicitly continue that same receiving. The original destination can be absent after interruption. |
| Complete packet moved to its delivery folder | Open, refresh, inspect, and download through the original packet reader. The browser identifies it as a delivered packet and keeps receiving unavailable at that moved path. |
| Partial or unknown location without the task's receiving record | Choose the recorded destination or the complete delivery folder shown by the original operation. |

The original destination binding is kept in `task/receivings/<destination-hash>.json`. Its hash covers the absolute destination path, and its record binds the original task hash. The desk rechecks this record before accepting receiving and again before the native receiver runs. A moved complete packet is matched to the original task and checked through `openInboxTaskPacket`.

~~~sh
starforge buyer-task-desk \
  --runtime /original/native-runtime \
  --state /original/node-buyer-state \
  --inbox /original/buyer-inbox \
  --tasks /original/node-buyer-state/desk-tasks \
  --outputs /original/desk-result-packets \
  --existing-task /original/delivery/task \
  --existing-output /original/delivery/received \
  --port 0
~~~

For a finished packet moved to `delivery/customer-packet`, select that actual complete folder as `--existing-output`. **Refresh packet**, metadata, report, individual response downloads, and the full archive all read the selected packet. Continued buying and recovery still use the original task and Inbox.

Keep both existing-directory options when reopening the desk. Each accepted command retains its selected locations in `operation.locations`, so its history identifies the original task and destination even after a later launch selects a delivery folder.

### Launch from a retained receiving record

An existing driver can retain its actual `runtime`, `state`, `inbox`, `task`, and `output` paths in `same-receiver.json`. Read that exact file from the original operation. Desk code can come from the upgraded installed source while the record selects the original native runtime and state.

This example passes recorded values as Node arguments. Supply the real record, updated desk CLI, and assigned desk history/result roots. Add a final complete-packet directory argument when deliberately opening the delivery folder shown by that original operation.

~~~sh
node --input-type=module - \
  /original/operation/same-receiver.json \
  /maintained/source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/agents/task-desk/cli.mjs \
  /original/node-buyer-state/desk-tasks \
  /original/desk-result-packets <<'NODE'
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { spawn } from "node:child_process";

const [recordFile, deskCli, deskTasks, deskOutputs, deliveredPacket] = process.argv.slice(2);
const original = JSON.parse(await readFile(recordFile, "utf8"));
for (const name of ["runtime", "state", "inbox", "task", "output"]) {
  if (typeof original[name] !== "string" || !isAbsolute(original[name]))
    throw new Error("The original receiving record needs its absolute " + name + " path.");
}
for (const value of [deskCli, deskTasks, deskOutputs, ...(deliveredPacket ? [deliveredPacket] : [])]) {
  if (typeof value !== "string" || !isAbsolute(value))
    throw new Error("Use the selected absolute desk and receiving paths.");
}
const child = spawn(process.execPath, [
  deskCli, "--runtime", original.runtime, "--state", original.state,
  "--inbox", original.inbox, "--tasks", deskTasks, "--outputs", deskOutputs,
  "--existing-task", original.task, "--existing-output", deliveredPacket ?? original.output,
  "--port", "0",
], { stdio: "inherit" });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
NODE
~~~

The command prints the actual local URL after opening the selected task and destination. Use the coherent native runtime retained by the original operation; keep its native runtime files together when restoring or upgrading the installation.

## Operate a task

### 1. Select the original jobs

Start with the job list and current process information. Choose the original intent for each role in the task. A role gives a response a clear purpose within the work, such as the selected report, invoice, or source package.

The caller fields describe the business work:

| Field | Meaning |
| --- | --- |
| `system` | Caller system that owns the work item. |
| `id` | Stable identifier in that system. |
| `revision` | Caller revision being prepared. |
| `title` | Short name shown to the operator. |
| `purpose` | What the assembled results will be used for. |
| `service` | Service associated with the caller task. |

Each selection supplies an `intentId` and a `role`. Where applicable, carry the actual `sourceEdition`, `facilitator`, `decisionRef`, and `reservationRef` associated with the original selection. These fields preserve the selected source and decision context through receiving.

### 2. Preview and save the exact revision

Preview the complete selection. The returned manifest shows the caller task, selected intents, request bindings, and predecessor. Save with the exact `previewSha256` returned for that preview.

When the selection changes, preview the revised selection before saving. The save request contains `expectedPreviewSha256` so the desk can detect a changed preview or underlying selection.

A saved task is an immutable revision. To change its work, create a successor with `predecessorId` set to the saved task being revised. The comparison view identifies reused original intents, source or request changes, and removed roles. The earlier revision and its results remain available.

### 3. Review a saved intent

Open a saved task and choose its original intent. Request a review and read the native request and payment or receipt information it presents.

The desk returns a `reviewId` together with the original review. Execution refers to this saved review through `reviewId`; the desk retains the reviewed native object on the server. When an action requires a fresh review, reopen the same saved task and review its current original intent.

### 4. Execute or recover the original action

Use Execute for the reviewed intent. The command includes the intent, saved review, and a caller-retained `requestId`. The desk returns an operation record that can be reopened throughout the command's lifetime.

Use Recover when the original intent has an uncertain or interrupted action. Recovery operates on the original request and returns its retained native state.

Read the native result together with the desk operation state. A native result with `dispatched: false` means the original attempt was retained. The native result determines the action's outcome.

| Desk state | Operator action |
| --- | --- |
| `queued` | Keep the operation open while it waits to run. |
| `running` | Read its retained status and current task inspection. |
| `succeeded` | Read the native result, then receive available result files. |
| `failed` | Read the structured error and original task history to choose the appropriate recovery or receiving action. |
| `interrupted` | Reopen the original task and command, inspect the native state, and explicitly continue the original recovery or receiving work. |

A server restart marks unfinished desk operations `interrupted`. The restarted desk retains their records and waits for an explicit operator action.

A completed command can also expose `persistenceError` when its final journal update could not be saved, for example because the disk filled. Read the returned native result and restore storage capacity. After a restart, reopen the same command identity and inspect the original native request before choosing recovery or receiving. A journal-write issue does not change the returned native outcome.

### 5. Receive complete results

Receive writes the selected task's complete results to its assigned packet destination. The packet records the original task, exact response files and hashes, request lineage, native outcomes, and report.

A receiving attempt can encounter a result that is still pending. Inspect the operation's error and current task state. To continue a terminal `TASK_RESULTS_PENDING` or interrupted receiving attempt, issue an explicit Resume receiving command with a fresh `requestId`. Keep the same saved task and existing destination. The original receiver continues that task and reuses its retained files.

Keep these identifiers distinct:

| Identifier | Lifetime |
| --- | --- |
| Caller task `system`, `id`, and `revision` | Business identity of one immutable task revision. |
| Saved task `id` | Desk identity used to reopen that revision. |
| Original `intentId` | Existing native request selected for a task role. |
| `reviewId` | Exact saved review used for an execution command. |
| Command `requestId` | Caller identity of one execute, recover, or receive command. |
| Desk operation `id` | The exact same value as the original command `requestId`, retained before dispatch. |

If a POST response is lost, reopen its original operation directly with `getOperation(requestId)`: the command and operation identifiers are the same value. The browser checks this reference after an interrupted handoff and when reopening the task. Use **Refresh progress** to read it again. If the complete saved command remains unmatched, **Send original command once** submits that same task, intent, review, and `requestId`. The server returns the original operation if it already accepted the command, or accepts that original command if it had not arrived. A definite session or review rejection leads to reconnecting or preparing the current native review. A new command identity belongs to an explicit subsequent action, such as resuming a terminal receiving attempt.

### 6. Open and export the packet

Open the metadata or readable HTML report. A saved packet remains useful when a live task inspection is unavailable; the task detail retains its packet alongside any `inspectionError`. `packetOpenedAt` records when the desk last opened the complete packet metadata. The task list reports unreadable records separately in `issues`. The packet separates two useful views of the result:

- The response file list gives each original intent, file path, byte count, SHA-256, and content type.
- The native outcomes show the original service status, HTTP status, native error, and related receiving information.

Use the native outcomes to evaluate the service result. Use the file list to evaluate the captured response bytes.

Download an individual intent's complete response when you need that file. For a complete handoff, download the TAR archive and extract it into a dedicated directory:

~~~sh
mkdir received-task
tar -xf received-task.tar -C received-task
~~~

Open `received-task/review.html` and keep the extracted response files in their original relative locations. This complete directory opens independently of the live service runtime. A separately downloaded HTML report contains relative response links, so include the complete packet whenever the recipient needs those files.

The desk's HTTP packet routes open the saved task before opening its received packet. Keep the original saved-task and Inbox state available when using those routes. For independent offline access, use the extracted complete packet. Restore ongoing native work to its original absolute roots; the complete result packet can be copied to a new receiving path.

The original packet CLI can inspect that extracted directory and verify one selected response:

~~~sh
starforge buyer-inbox-task packet-inspect --packet ./received-task
starforge buyer-inbox-task packet-read --packet ./received-task --intent ORIGINAL_INTENT --format file
~~~

Use an actual selected intent in place of `ORIGINAL_INTENT`. Add `--task-sha256` with the saved task hash to `packet-inspect` when matching the handoff to a known task. `packet-read --format file` verifies the selected response and prints its file metadata. The `json` and `text` formats print decoded content; `csv` prints the parsed rows. Use the complete saved response file for its original bytes. The standalone executable is `starforge-inbox-task`; from source, use `node node/agents/inbox-task-cli.mjs` from the original SF88 runtime root with the same subcommand and options.

## Use the typed client

`client.mjs` exports `TaskDeskClient` and `TaskDeskError`. Its companion `client.d.mts` reuses the original InboxTask and Inbox types: caller tasks, selections, inspections, native execute and recover results, comparisons, and received packet metadata.

The source examples below run from the original SF88 runtime root. Installed consumers can import `TaskDeskClient` from `@stellar-forge/native-buyer/agents/task-desk`, with its TypeScript declarations resolved through that package export.

Connect using the URL printed by the desk. The client obtains the current CSRF token from `/api/status`, includes `X-Task-Desk-Token` on POST requests, and sends the desk origin for Node fetch. Browser requests use the browser's own origin.

### Preview and save

The selection file in this example contains the actual `task`, `selections`, and optional `predecessorId` for the operation:

~~~js
import { readFile, writeFile } from "node:fs/promises";
import { TaskDeskClient } from "./node/agents/task-desk/client.mjs";

const desk = new TaskDeskClient(process.env.INBOX_TASK_DESK_URL);
const draft = JSON.parse(await readFile("./task-selection.json", "utf8"));

const preview = await desk.previewTask(draft);
await writeFile(
  "./task-preview.json",
  JSON.stringify({ draft, preview }, null, 2),
  { flag: "wx" },
);

const saved = await desk.createTask({
  ...draft,
  expectedPreviewSha256: preview.previewSha256,
});
await writeFile("./saved-task.json", JSON.stringify(saved, null, 2), { flag: "wx" });
console.log(saved.id);
~~~

These examples use `wx` to retain any existing saved command or task file. Choose the operation's own filenames when continuing a separate revision.

### Review and issue one command

Retain the command identifier before its POST. Here, `saved-task.json` and `task-selection.json` are the records from the preceding step:

~~~js
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { TaskDeskClient } from "./node/agents/task-desk/client.mjs";

const desk = new TaskDeskClient(process.env.INBOX_TASK_DESK_URL);
const saved = JSON.parse(await readFile("./saved-task.json", "utf8"));
const draft = JSON.parse(await readFile("./task-selection.json", "utf8"));
const intentId = draft.selections[0].intentId;

const reviewed = await desk.reviewTask(saved.id, { intentId });
await writeFile("./saved-review.json", JSON.stringify(reviewed, null, 2), { flag: "wx" });
console.log(reviewed.review);
~~~

After inspecting that review, issue the retained command:

~~~js
const command = {
  intentId,
  reviewId: reviewed.reviewId,
  requestId: randomUUID(),
};
await writeFile("./execute-command.json", JSON.stringify(command, null, 2), { flag: "wx" });

const accepted = await desk.executeTask(saved.id, command);
await writeFile("./execute-operation.json", JSON.stringify(accepted, null, 2), { flag: "wx" });

const operation = await desk.waitForOperation(accepted.operation.id);
console.log(JSON.stringify(operation, null, 2));
~~~

The client sends the mutation once. `waitForOperation` reads retained metadata and returns at `succeeded`, `failed`, or `interrupted`, preserving the native result and structured error.

To choose a wait limit, pass `timeoutMs` or an `AbortSignal`:

~~~js
const controller = new AbortController();
const operation = await desk.waitForOperation(operationId, {
  pollIntervalMs: 1000,
  timeoutMs: 60_000,
  signal: controller.signal,
});
~~~

A timeout or aborted wait affects only the client's waiting interval. Reopen the operation with `getOperation(operationId)` to continue reading its state.

### Recover and receive

Each explicit command keeps its own retained identifier:

~~~js
const recovery = await desk.recoverTask(taskId, {
  intentId,
  requestId: retainedRecoveryRequestId,
});
const recovered = await desk.waitForOperation(recovery.operation.id);
console.log(recovered);

const receiving = await desk.receiveTask(taskId, {
  requestId: retainedReceiveRequestId,
});
const received = await desk.waitForOperation(receiving.operation.id);
console.log(received);
~~~

Inspect each original result when choosing the following action. Read all commands for a task with `listOperations({ taskId })`. Reopen its saved revision with `getTask(taskId)`, compare it with `compareTask(taskId, previousId)`, or export its received packet.

### Stream a complete download

Download methods return the fetch `Response` so large responses and archives can stream directly to a destination:

~~~js
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const response = await desk.downloadPacketArchive(taskId);
if (!response.body) throw new Error("The packet archive response has no body");
await pipeline(
  Readable.fromWeb(response.body),
  createWriteStream("./received-task.tar", { flags: "wx" }),
);
~~~

Use `downloadIntentResponse(taskId, intentId)` for an individual complete response. `getPacketReview(taskId)` returns the complete HTML report as text. `getPacket(taskId)` returns the saved packet metadata.

### Preserve errors and reconnect deliberately

`TaskDeskError` exposes `code`, `status`, the original structured `details`, and any original `nativeResult` included with a server error. An explicit `null` detail from the server stays `null`. Command errors also retain the submitted `requestId`, including a lost response body or invalid JSON after command acceptance. A failure before response headers has status `0`; a failure while reading the body preserves the received HTTP status.

Aborting a command request preserves its identity in a `TASK_DESK_REQUEST_ABORTED` error. The original native command may still be running. Reopen `getOperation(error.requestId)` or use the command file saved before the POST. Polling cancellation affects the client wait; it does not send a native cancellation request.

~~~js
import { TaskDeskError } from "./node/agents/task-desk/client.mjs";

try {
  const operation = await desk.getOperation(operationId);
  console.log(operation);
} catch (error) {
  if (error instanceof TaskDeskError) {
    console.error(JSON.stringify(error.toJSON(), null, 2));
  }
  throw error;
}
~~~

| Situation | Continuation |
| --- | --- |
| POST response lost, response body interrupted, or command request aborted | Read the saved command or the error's `requestId`, then reopen the original operation. If it remains unmatched, explicitly submit the same retained command and identity once; the browser provides **Send original command once**. |
| Desk restarted or rejected a stale session token | Reconnect to the printed URL, call `clearSession()` and `getStatus()`, then reconcile the original command before a further mutation. |
| Selection or preview changed | Preview the intended revision again and save with its returned hash. |
| Review no longer applies | Inspect the original task and obtain its current native review. |
| `TASK_RESULTS_PENDING` during receiving | Inspect current results, then explicitly resume the same task and destination with a new command identity after the terminal attempt. |
| `TASK_DESK_WAIT_TIMEOUT` | Use the retained operation ID in the error details to read the same operation. |
| Operation `interrupted` after restart | Open its task and native history, then choose the original recovery or receiving continuation. |
| Complete packet moved to its delivery folder | Select that original task and complete delivered folder. Refresh or download the packet; select its recorded destination for a further receiving continuation. |

## HTTP interface

The client preserves the native response shapes. The status response includes the current CSRF token. Mutating routes use JSON bodies.

| Method and route | Input | Returned material |
| --- | --- | --- |
| `GET /api/status` | — | Desk status and `csrfToken`. |
| `GET /api/jobs` | — | `{ jobs, process }` from the original Inbox. |
| `GET /api/tasks` | — | `{ tasks, issues }`; each task has `id`, `record`, `locations`, and optional `{ requests }` summary. |
| `POST /api/tasks/preview` | `{ task, selections, predecessorId? }` | Original `{ previewSha256, manifest, process }`. |
| `POST /api/tasks` | Preview input plus `expectedPreviewSha256` | `{ id, record, inspection, inspectionError, packet, packetError, packetOpenedAt, locations }`, with nullable inspection and packet. |
| `GET /api/tasks/:id` | Saved task ID | `{ id, record, inspection, inspectionError, packet, packetError, packetOpenedAt, locations }`, with nullable inspection and packet. |
| `POST /api/tasks/:id/review` | `{ intentId }` | `{ reviewId, review }`. |
| `POST /api/tasks/:id/execute` | `{ intentId, reviewId, requestId }` | HTTP 202 with `{ operation }`. |
| `POST /api/tasks/:id/recover` | `{ intentId, requestId }` | HTTP 202 with `{ operation }`. |
| `POST /api/tasks/:id/receive` | `{ requestId }` | HTTP 202 with `{ operation }`. |
| `GET /api/operations` | Optional `taskId` query | `{ operations }`. |
| `GET /api/operations/:id` | Retained operation ID | `{ operation }`. |
| `GET /api/tasks/:id/compare` | `previousId` query | Original task comparison. |
| `GET /api/tasks/:id/packet` | Saved task ID | Complete received packet metadata. |
| `GET /api/tasks/:id/packet/download` | `intentId` query | Complete response byte stream. |
| `GET /api/tasks/:id/packet/review` | Saved task ID | Readable `text/html` report. |
| `GET /api/tasks/:id/packet/archive` | Saved task ID | Complete `application/x-tar` packet archive. |

HTTP errors have the form `{ error: { code, message, details?, nativeResult? } }`. A successful command acceptance includes its retained operation. Read the native result and error fields to follow the original work through receiving.

`locations` records `{ taskDirectory, outputDirectory, retained, mode, receiveAllowed }`. Its mode is `desk`, `original-receiving`, or `delivered-packet`. Status roots include `existingTask` and `existingOutput` when an original pair is selected. These fields preserve the actual operating paths while the API continues to use its stable task ID.
