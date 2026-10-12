# External agent tasks and complete Inbox receiving

Connect an outside agent's task to the buyer requests already saved in its original Inbox. A task may need one response, several pages, or a report and its source files. The task retains that whole selection, the caller's decision references and the intended use. It operates the original Inbox and receives every complete result into one portable customer packet.

This module is part of the existing Node buyer. It uses the original queue, review, approval, native execution, response verification and financial history. The caller keeps its own governor and signer. Task metadata connects that caller to the original operation.

## Select the caller's real operation

Start with the existing Inbox described in [INBOX.md](INBOX.md). Prepare and enqueue the actual requests with the normal generated client, merchant packet or original operator configuration. The returned intents identify the original purchases.

Create a task specification using those actual intents:

~~~json
{
  "task": {
    "system": "your-existing-agent-system",
    "id": "customer-source-review",
    "revision": "2026-10-12",
    "title": "Customer source review",
    "purpose": "Receive the complete selected edition into the customer's existing analysis.",
    "service": "the-installed-source-service"
  },
  "selections": [
    {
      "intentId": "the-first-original-inbox-intent",
      "role": "selected-data-page-one",
      "sourceEdition": "the-actual-source-edition",
      "facilitator": "https://the-selected-facilitator.example",
      "decisionRef": "the-callers-original-decision-reference",
      "reservationRef": "the-callers-original-reservation-reference"
    },
    {
      "intentId": "the-second-original-inbox-intent",
      "role": "selected-data-page-two",
      "sourceEdition": "the-actual-source-edition",
      "facilitator": "https://the-selected-facilitator.example",
      "decisionRef": "the-callers-second-original-decision-reference",
      "reservationRef": "the-callers-second-original-reservation-reference"
    }
  ]
}
~~~

The example names identify fields to fill from the installation. A selection's facilitator is the selected merchant/provider context. The merchant's actual configuration controls routing, and the original buyer reviews the live offer. The task preserves the configured request and its accepted network, asset, recipient and maximum.

Each task contains 1–500 distinct original intents. Its stable identity is the caller system, task ID and revision, together with the exact reviewed selection. Different results may share a role only when a later comparison will not need to pair that role. For a recurring task, use stable unique roles such as data-page-one and source-document.

Keep task state inside the customer's existing private Node application state so the same complete workspace backup carries it. Keep received packets in a separate private output directory.

## Review and retain the task

The commands below use the original runtime, Node application state and Inbox. The source executable is node/agents/inbox-task-cli.mjs. The Node package supplies starforge-inbox-task; the full installed product exposes buyer-inbox-task when its contribution is selected.

The full merchant package exports the same interface at `@tokenjunkielabs/starforge-merchant/buyer/node/agents/inbox-task`. Its source-owned `buyer-inbox-task` registration keeps the command, help, ordered TypeScript/import export and guide together. Run `starforge registrations --source buyer-inbox-task` to inspect the installed original source selection. The offline report presents a table on desktop and labeled result sections on narrow screens; each result link downloads its entire retained response.

~~~sh
starforge buyer-inbox-task preview \
  --runtime /srv/starforge/sf88-operator-buyer-cli \
  --state /srv/customer/buyer-state --inbox /srv/customer/inbox \
  --spec /srv/customer/task-spec.json \
  --output /srv/customer/task-preview.json

starforge buyer-inbox-task create \
  --runtime /srv/starforge/sf88-operator-buyer-cli \
  --state /srv/customer/buyer-state --inbox /srv/customer/inbox \
  --spec /srv/customer/task-spec.json \
  --directory /srv/customer/buyer-state/tasks/source-review-2026-10-12 \
  --preview-sha256 THE_RETURNED_PREVIEW_DIGEST
~~~

Preview reads the original jobs and presents the complete selected requests. Creation checks that those requests still match the review, then retains one immutable task record. Repeating the identical create reopens it. A changed caller task or selected request requires its own current preview and new task directory.

The record pins each original job, configuration, body, operation ticket and complete request. Caller decision and reservation references remain outside-party context attached to those same requests. The original Inbox remains the execution authority.

## Operate one selected original request

Review and execute are explicit commands for one intent:

~~~sh
starforge buyer-inbox-task review \
  --runtime /srv/starforge/sf88-operator-buyer-cli \
  --state /srv/customer/buyer-state --inbox /srv/customer/inbox \
  --directory /srv/customer/buyer-state/tasks/source-review-2026-10-12 \
  --intent the-first-original-inbox-intent \
  --output /srv/customer/original-payment-review.json

starforge buyer-inbox-task execute \
  --runtime /srv/starforge/sf88-operator-buyer-cli \
  --state /srv/customer/buyer-state --inbox /srv/customer/inbox \
  --directory /srv/customer/buyer-state/tasks/source-review-2026-10-12 \
  --intent the-first-original-inbox-intent \
  --review-file /srv/customer/original-payment-review.json \
  --workspace /srv/customer/original-operator
~~~

Execution invokes the original approval and buyer. A task whose selected job already has an attempt returns that retained job. An interrupted native command stays associated with its original intent and command directory. Use inspect and the original recovery/finalization procedure for that job.

The recover command delegates to Inbox.recover. The Inbox's existing finalize command retains financial continuation. Each return preserves the native job and current command outcome.

## Receive the whole customer result

Once all required responses are saved, receive them together:

~~~sh
starforge buyer-inbox-task receive \
  --runtime /srv/starforge/sf88-operator-buyer-cli \
  --state /srv/customer/buyer-state --inbox /srv/customer/inbox \
  --directory /srv/customer/buyer-state/tasks/source-review-2026-10-12 \
  --output /srv/customer/exports/source-review-2026-10-12
~~~

The receiver first retains its exact task and output-directory intent in the task's own state, then saves a complete original source snapshot before copying. If the process stops while publishing that plan, the same receiver preserves the original temporary and continues from its retained destination. It uses the native response receiver for every output and publishes each file after its full byte count and digest match. A repeat into the same output directory verifies completed copies and continues missing files. If a complete packet is already there, it reopens that packet locally.

The receiving directory contains:

|File|Customer use|
|---|---|
|task.json|The caller's complete task and original request bindings.|
|responses/|Every complete saved response, with stable filenames and original byte identities.|
|receiving.json|Original jobs, native outcomes and the exact source snapshot used by this receiving operation.|
|review.html|Clean offline review, complete output links, original task and readable request/outcome details.|
|manifest.json|The completed packet's file identities and original task binding.|

A saved response can contain a merchant HTTP error. The main report table and the returned outcomes preserve the native HTTP status, state and recorded errors alongside the complete bytes. Receiving every file describes delivery; the caller uses those actual native outcomes and the contents to decide whether its useful task succeeded.

A result that is still being acquired remains visible through inspect and the original Inbox. Complete receiving begins when every required response is saved. The original response API remains available for explicitly selected partial streams.

## Use the result in another application

The complete packet opens without the original buyer runtime:

~~~sh
starforge buyer-inbox-task packet-inspect \
  --packet /srv/receiving/source-review-2026-10-12

starforge buyer-inbox-task packet-read \
  --packet /srv/receiving/source-review-2026-10-12 \
  --intent the-first-original-inbox-intent --format json
~~~

Open review.html in a browser to follow the full files and original history. A Node application can read JSON, CSV, byte chunks or a verified file through the original VerifiedFile interface:

~~~js
import { openInboxTaskPacket } from '@stellar-forge/native-buyer/agents/inbox-task';

const received = await openInboxTaskPacket({
  directory: '/srv/receiving/source-review-2026-10-12',
  expectedTaskSha256: theTaskDigestSavedByTheCaller,
});
const file = received.response(theOriginalIntent);
const result = await file.json({ limit: 64 * 1024 * 1024 });
await file.saveAs('/srv/receiving/application/complete-input.json');
~~~

A copied packet retains its exact original task identity. Opening it checks every declared output and the complete review/source record. For continued purchasing and editing, buyer.workspaceRecovery() restores the original operator, application state and selected Inbox at their original absolute roots. Include the task's state and receivings directory in that authenticated backup, then reopen the task with the original Inbox path in the restored installation. This follows the native recovery contract described in RECOVERY.md. Complete output packets open at their receiving destination independently of those operating roots.

## Compose with the caller's existing task system

~~~js
import { Buyer } from '@stellar-forge/native-buyer';
import { previewInboxTask, createInboxTask } from '@stellar-forge/native-buyer/agents/inbox-task';

const buyer = new Buyer({ runtimeDirectory, stateDirectory });
const inbox = buyer.inbox(originalInboxDirectory);
const preview = await previewInboxTask({ inbox, ...selectedCallerTask });

const task = await createInboxTask({
  inbox, ...selectedCallerTask, directory: originalTaskDirectory,
  expectedPreviewSha256: preview.previewSha256,
});

const current = await task.inspect();
// The existing agent/governor decides which original request to operate.
// Explicit native review and task.execute operate that selected original intent.
const received = await task.receive({ directory: originalReceivingDirectory });
return { callerTask: received.task, nativeTask: received.taskSha256,
  completeResultDirectory: received.directory, files: received.files };
~~~

The caller can save this return under its original job or checkpoint. It can open the same task after process restart and continue receiving into the same directory. The interface does not require a new framework, hosted service or external API.

For AgentLedger, the commissioning adapter maps its actual task, decision and reservation references into this specification. Its currently documented Base-hosted Privy configuration and chosen Stellar buyer are separate deployment selections. The commissioning work uses its actual Stellar governor/signer connection and the selected service's live offer.

## Later useful tasks and provider changes

A later source edition or newly approved request gets a new original Inbox intent. The new task's predecessor names the earlier taskSha256, caller system, task ID and revision. The service field identifies the same logical service.

compareInboxTasks(previousRecord, nextRecord) returns the selected roles' source-edition, facilitator and request changes, together with the original and new intents. It also reports a reused original intent explicitly. This lets the customer explain a later acquisition without counting a reopened response as a new purchase.

The current task receiver always follows its original Inbox and response. Provider switching is commissioned at the merchant and newly reviewed request. Previous tasks retain their original context and complete files.

## Operation and receiving errors

The CLI returns zero after the requested operation completes, two when complete results are pending or unavailable, and 130 when interrupted. Native runtime/argument errors return one. Read the original native fields alongside a current command's exit status.

An existing destination with different bytes remains intact. Reopen the original source and chosen receiving operation to resolve the changed file. Preserve original Inbox state, application state, task records and completed customer files together.

This product supplies the caller/task and full-output receiving join. It composes the maintained Collections, Inbox, native approval, response reader and complete workspace recovery into one useful customer operation.
