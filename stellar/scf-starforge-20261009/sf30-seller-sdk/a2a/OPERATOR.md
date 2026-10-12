# A2A merchant task workspace — operator guide

This workspace turns an explicitly reviewed upstream A2A task into a retained result edition and an original Starforge seller publication. It retains the Agent Card, selected interface and skills, exact reviewed message, HTTP observations, native task states, complete output parts, and the operator's result review. The public paid route serves a fixed, complete result file.

The protocol implementation is the official [A2A JavaScript SDK](https://github.com/a2aproject/a2a-js), selected at version **1.3.0**, source commit **29417a5bb4038f804f310ce4fffd267a9375aa90**, for the [A2A 1.0 specification](https://a2a-protocol.org/latest/specification/). Payment terms, native verification and settlement remain in the original SF30 seller and SF82 release service. The A2A connection is an upstream acquisition authority; it never authorizes a payment by itself.

## 1. Select the actual runtime and private workspace

Use the complete selected repository source or installed Starforge archive, Node 24 with its original SQLite support, and one dependency installation that resolves `@a2a-js/sdk@1.3.0` and `jose@6.2.12`. The component declares both packages in `runtime-package.json`. The maintained distribution contribution adds feature `a2a`, its SDK imports, the `a2a` command, and the managed Applications provider.

The original runtime-profile API can create a profile for the selected source:

~~~js
import { createRuntimeProfile } from './stellar/scf-starforge-20261009/distribution/runtime-profile.mjs';
const profile = await createRuntimeProfile({
  directory: '/absolute/private/runtime-profile',
  sourceRoot: '/absolute/selected/repository',
  features: ['a2a', 'a2a-analysis'],
  native: false,
  operator: false
});
~~~

Use that profile's original installation workflow or install its generated package manifest with the selected Node/npm. Inspect the resulting package identities before running. Select only `a2a` when an upstream service is already running elsewhere. The `a2a-analysis` feature additionally declares Express, Kysely and the original better-sqlite3 native readiness probe; its complete source and runtime instructions are in [A2A analysis agent](../../../../stellar-forge/a2a-analysis-agent/README.md). Keep one actual dependency closure for the client and that agent when commissioning them together.

The private workspace has an original Dataset writer lease, SQLite metadata/history, SHA-256 object storage, and a private workspace identity file. A CLI command and the browser server cannot independently own the same workspace. Stop the owned server before opening the same workspace through a separate CLI process. The server closes its local captures, merchant listeners, SQLite connection and lease on shutdown.

## 2. Configure a host connection

The host selects the Agent Card URL, exact allowed origins, any explicit local origin, and a credential reference. Keep this file private. Credentials are environment values; neither the browser nor the portable package contains the connection's secret value.

~~~json
{
  "schema": "stellar-forge.a2a-connections.v1",
  "connections": [{
    "id": "research-agent",
    "label": "Approved research agent",
    "cardUrl": "https://agent.example/.well-known/agent-card.json",
    "allowedOrigins": ["https://agent.example"],
    "trustedOrigins": [],
    "artifactOrigins": ["https://artifacts.example"],
    "credential": {"scheme": "Bearer", "env": "RESEARCH_AGENT_TOKEN"},
    "timeoutMs": 30000,
    "streamMs": 120000
  }]
}
~~~

For an explicitly selected loopback receiving agent, place its exact `http://127.0.0.1:PORT` origin in both `allowedOrigins` and `trustedOrigins`. This is a host review, not an origin supplied by a remote card. Public connections use the existing SF31 public HTTPS transport and its DNS/address checks. The selected interface URL must be within the reviewed origins and must have no query string, user information or unsupported protocol.

The credential applies only to the selected native agent origin. Artifact URL downloads are anonymous, restricted to the configured artifact origins, and reject redirects. A remote attachment or redirect cannot inherit the agent's authorization header. Configure the original artifact service appropriately if it requires a separately governed acquisition; do not put secrets in URLs.

Known selected credential bytes found in an original response are marked private. The ordinary browser view replaces those private records with a custody notice; publication and ordinary portable export reject a source population containing them. Explicit local `source --private --out` retains the original private bytes. Redaction is not treated as the same source identity.

## 3. Open the application

From a source checkout:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/cli.mjs workspace \
  --workspace /absolute/private/agent-workspace \
  --connections /absolute/private/connections.json \
  --port 0
~~~

From the selected installed distribution, use `starforge a2a workspace` with the same arguments. The command prints the actual private listener URL and startup identity. The server binds loopback, checks the original Host and request origin, and uses a private bearer token injected into its page. The token is not placed in a URL.

The Applications provider uses the same entry point. It pins the workspace identity file and connection-file SHA before launch, passes those expected identities to the child, waits for the child's original ready receipt, checks the actual process identity and private readiness file, and probes the authenticated application. A port responding to an unrelated page does not satisfy this launch.

The six working panes are:

| Pane | Operator work |
| --- | --- |
| Agent | Retain the full card; review one supported interface, required extensions and selected skills. |
| Messages | Prepare exact native Parts and configuration, review the input, then send that saved message once. |
| Tasks | Read/list native tasks, retain a stream, stop a local capture or explicitly cancel a retained remote task. |
| Results | Retain every output part, inspect original bytes and hashes, review completeness, freeze a named result. |
| Merchant and handoff | Prepare original seller terms, run the fixed publication, export named workspace handoffs and receive an existing package. |
| History and source | Inspect a retained project revision, its original sources and named editions without changing current state. |

The browser stores complete pending request bytes, their SHA, the original request ID and selected project revision in IndexedDB before sending. It cannot create a new mutation until pending storage has been read successfully. After a broken response, **Inspect original request** reads the original local receipt; **Retry original request** submits the same saved envelope. Retrying a completed local send does not send a second message to the upstream agent.

Forms retain their own drafts. A late response can clear only the exact draft that initiated it, and a response for another project cannot navigate back over the operator's current selection. Source and historical downloads carry the displayed revision.

## 4. Review a real Agent Card and prepare native input

Create a project using a configured host connection. Capture its card, inspect the original JSON, then explicitly select one A2A 1.0 `JSONRPC` or `HTTP+JSON` interface. Each required extension must be reviewed and selected; undeclared extensions and unsupported interfaces are rejected.

The message editor accepts the native ProtoJSON shape used by the selected SDK:

~~~json
{
  "messageId": "a-new-native-message-id",
  "role": "ROLE_USER",
  "parts": [{
    "data": {
      "action": "run",
      "procedureId": "query_observations_complete",
      "parametersText": "[]"
    }
  }]
}
~~~

That example is the input contract of the maintained analysis agent. Other agents publish their own skills and task inputs; inspect their actual card and operator contract. Parts may contain exactly one of `text`, `raw`, `url` or `data`. A `raw` Part is complete base64. Optional `filename` and `mediaType` retain the original declared values.

The workspace saves the normalized original SDK message and configuration before any send. A native message ID may be prepared only once per project. Each saved message has one network attempt. The default `returnImmediately:true` lets a native task remain independently inspectable; the operator can explicitly review another value. Push notification registration is not configured in this component; use the retained native read and subscription workflow.

For an input-required task, create a new reviewed message using its original `taskId` and `contextId`. This is a deliberate continuation with a new message ID. It does not replace the task's previous message or outcome.

## 5. Observe and recover the original task

**Send original message** invokes the SDK's native message API. **Send and retain stream** captures the native stream and its original Task/Message envelopes. Stream deltas remain recorded as deltas; the workspace does not synthesize a completed Task from partial events. Use **Get task** to retain a complete authoritative native task snapshot.

Task listing preserves page tokens and explicit page completeness. A page is not the whole remote task population when a next page token exists. The UI does not run an unbounded remote polling loop.

Stopping a local stream aborts its local reader and retains the actual bytes/events already received. It does not imply remote cancellation. **Cancel remote task** is a separate reviewed native action with a reason and a task already observed under the selected interface.

If the local caller ended after a send or cancellation may have reached the agent, the workspace records `unknown`. It does not convert a timeout into proof that no remote work happened. Read/list the original agent state. To adopt an identified task for an uncertain sent message, supply the saved local message ID, native task ID and an explanation. Adoption performs the original GetTask and requires its history to contain the exact native message ID and reviewed message content.

Closing and reopening the local workspace preserves all original request IDs and task evidence. Local reads interrupted by shutdown are marked interrupted. A replay returns the original request record, including unknown state, instead of silently repeating network work.

## 6. Retain and review the complete result

Select an original Task or Message observation and **Retain all output parts**. Every original text, JSON data, raw byte or approved anonymous URL Part becomes a complete SHA-bound object. The capture records the native artifact identity, original part index, declared filename/media type, actual download media type, complete bytes and source reference.

The result is eligible for an accepted review only after every selected output Part is retained. Freezing a paid result additionally requires an original completed Task or an original Message response. A failed, cancelled, partial or unobserved task cannot become a completed result edition.

A frozen edition includes the selected card, reviewed messages, native task observation, original HTTP source evidence, complete output files and explicit review. Download `a2a-result-EDITION.json.gz` for an independent recipient. Inspect it with:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/cli.mjs inspect-result \
  --input /absolute/received/a2a-result-EDITION.json.gz \
  --out /absolute/new/result-inspection.json
~~~

The inspector checks the complete gzip/JSON population, original hashes and the card/observation/capture/review/edition bindings. A result package carries a reviewed deliverable; the full workspace package separately carries editable project history and request receipts.

## 7. Publish through the original seller

Enter the actual merchant HTTPS origin, fixed route, price, asset, network and payee from the original reviewed seller configuration. The workspace validates those payment terms with `compileHttpSellerOffer` before saving the publication. A route serves the frozen edition as a single complete `application/gzip` response asset.

The original seller permits a response asset of at most **16 MiB**. A larger result remains fully retained/exportable, but publication is rejected until an actual supported delivery route is chosen. The application never truncates the paid file to meet that limit.

Materialize a selected publication:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/cli.mjs publication \
  --workspace /absolute/private/agent-workspace \
  --id PROJECT --publication PUBLICATION
~~~

The original publication directory contains `seller.json`, `source.json` and the exact `result.json.gz`. Start the original seller:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/cli.mjs merchant \
  --workspace /absolute/private/agent-workspace \
  --id PROJECT --publication PUBLICATION --port 0
~~~

Without a configured native facilitator this is explicitly **CHALLENGE_ONLY**. Its 402 offer/readback verifies routing and terms; it is not a settled-payment receipt. For native verification/settlement, select the original facilitator with `--facilitator https://…` and the original required x402 runtime. The optional local facilitator flag is limited to the explicitly selected receiving host. This component does not create a wallet, spend funds or invent a settlement result.

Paid requests read only the fixed retained response file. They do not send another A2A message or run the analysis procedure again.

## 8. Stage, activate, reopen and roll back with SF82

The added A2A result source family uses the original SF82 release store, change generation, staged source validation, child process, readiness observer, settlement delivery and rollback history.

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/cli.mjs release-stage \
  --workspace /absolute/private/agent-workspace \
  --id PROJECT --publication PUBLICATION \
  --releases /absolute/private/releases --release result-v1

node stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/cli.mjs release-status \
  --releases /absolute/private/releases

node stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/cli.mjs release-activate \
  --releases /absolute/private/releases --release result-v1 \
  --generation CURRENT_GENERATION --note "Reviewed full result and seller terms"

node stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/cli.mjs release-run \
  --releases /absolute/private/releases --generation CURRENT_GENERATION
~~~

Use the actual generation returned after activation for the run. A new release stages the complete fixed result with its source record and compiled original service configuration. Reusing the same release ID is permitted only for that exact edition, runtime and label.

After staging and activating a later edition, the original rollback action selects the recorded previous release at the current generation:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/cli.mjs release-rollback \
  --releases /absolute/private/releases \
  --generation CURRENT_GENERATION --note "Restore the previously reviewed result"
~~~

Rollback changes the selected release through the original state/history. Observe/close the original running child and reopen the selected generation using the maintained release workflow. Do not edit an active release directory or start a second manager for the same store.

## 9. Hand off and receive a whole workspace

Create a named handoff after all local captures have reached a retained state. Export it with `export --handoff ID`. The package includes complete project revisions, original request receipts and all selected source bytes. Its name and created time bind the selected revision; subsequent project edits do not change those named package bytes.

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/cli.mjs export \
  --workspace /absolute/private/agent-workspace --id PROJECT \
  --handoff HANDOFF --out /absolute/new/agent-workspace.json.gz

node stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/cli.mjs receive \
  --workspace /absolute/private/received-workspace \
  --input /absolute/new/agent-workspace.json.gz \
  --request-id ORIGINAL_RECEIVING_REQUEST
~~~

Fresh receive imports the original project/history. A compatible newer package advances it. Receiving the same package reopens the original receipt. An older compatible package preserves a later local head. Divergent history is rejected. Each packet object and history link is verified before metadata is adopted.

The received workspace is initially offline even when its source's execution-workspace identifier matches local metadata. A **local host connection binding** is an independent permission. Explicitly configure/review a connection and use `bind_connection` before any native continuation on the receiving host. Importing an untrusted packet cannot confer local upstream credentials.

The original request result remains historical. A replay can return that original operation and the separately read current project without rewriting the sealed request.

## 10. CLI/API use and declared bounds

The CLI `action` command reads one complete UTF-8 JSON file with `{action,payload}`. Every mutation has a stable `requestId`. Except create, it also has `id` and `expectedRevision`. Store the exact payload before invocation when a caller may disconnect. Source/output writes use a new file or verify that an existing file already contains the exact selected bytes.

The JavaScript facade is `openA2AWorkspace({directory,operator,connections})`. It returns `list`, `get`, `request`, `dispatch`, `readSource`, `exportPacket`, `exportResult`, `receivePacket`, `stop` and owned `close`. Typed declarations accompany the package. `dispatch` returns a retained request with its action/state/result/error and the current project; it does not discard native failure evidence.

| Bound | Selected value |
| --- | ---: |
| Reviewed request JSON | 1 MiB |
| Agent Card body | 2 MiB |
| One retained native HTTP response | 32 MiB |
| One output Part | 32 MiB |
| Complete output population | 128 MiB |
| Whole portable uncompressed packet | 256 MiB |
| Original seller response asset | 16 MiB |
| Captured stream events | 2,000 |
| Local stream lifetime | 120 seconds maximum |
| One native task-list page | 100 tasks maximum |

A limit ends that local capture explicitly. It never labels a truncated stream or partial output population complete.

## 11. Full commissioning and receiving record

`receiving/commission.mjs` exports `commissionA2AMerchant` for the maintained native analysis-agent commissioning programme. It accepts the actual live agent URL/token, original approved procedure, selected repository source and a private directory. It uses the same original service/runtime lifetime, retains exact request envelopes, and publishes a final result only after all owned workspaces and seller/release children close.

The complete workflow covers the real Agent Card; reviewed catalog and complete saved query task; original task reads and all artifact bytes; result review/freezing; source and CLI reads; original merchant challenge; two SF82 staged selections and rollback; named portable fresh/same/forward/older receiving; and desktop/mobile application receiving. The actual result distinguishes task completion, file/hash checks, challenge-only seller state and any separately observed native payment result.

A commissioning result is complete only when its original journal says complete and every referenced artifact reopens with the recorded hash. A source-only parse, pending admission, successful package installation or proposed agent call is reported separately. Keep the original directory and exact request IDs when continuing an interrupted programme.

### Complete output verification

Portable result receiving enumerates the original completed task’s artifact parts, or its original message/status parts when no artifacts exist. It requires each original artifact ID and part index exactly once. Text, raw and structured data are compared to their exact retained bytes. Each URL part retains its literal declared URL and a reference to the successful, complete original HTTP response and body hash. Files with identical bytes retain their distinct original names. The commissioning journey checks this boundary against the real completed analysis by rejecting a claimed complete packet with one original part omitted.

### One joint installation and complete output custody

The original joint receiving worker is `receiving/run_joint.py`. The maintained foreground caller prepares one private root with the complete selected repository under `source/`, the verified `SOURCE_MANIFEST.json`, the actual executable selection in `runtime-selection.json`, and the original 28-response Hamburg `native-recording.json`. Invoke the worker only through that caller's original resource admission:

~~~sh
python3 receiving/run_joint.py --root /absolute/private/original-a2a-operation
~~~

The worker reads the original client and upstream service dependency declarations, requires their exact reviewed five-package union, and installs it once in `runtime/`. The selected source's root `node_modules` points to that shared installation so both sibling components resolve the same SDK. It retains the npm lockfile, verifies every direct package version, opens the actual better-sqlite3 native binding, and records the selected Node/Python/Playwright/Chromium paths in `work/runtime-ready.json`. Original source parsing and both complete commissioning programmes use those same interpreters and private lifetime.

Successful completion produces `work/joint-result.json`, the upstream and merchant results, and two complete ZIPs beneath `work/delivery/`: the exact editable source/lockfile closure and the original received files/source recording/screenshots. Each ZIP includes a complete member manifest. The result delivery selects only completed native file sets and the merchant's verified export list. Host bearer credentials, live database control files, browser profiles and package caches remain private operating state.

Keep that invocation alive until the complete ZIPs and their identities are preserved outside its private storage. Source materialization, installation, queue admission and scientific/business task completion are separate recorded stages. Resume the original owner, source and request journal after a confirmed interruption; do not start a second analytical task population.
