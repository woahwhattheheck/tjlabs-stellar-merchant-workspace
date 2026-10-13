# Commission the same useful service through two facilitators

This component operates a complete two-provider commissioning job over the existing seller releases and buyer workflows. The operator chooses one retained service, all requests or pages in the useful task, the exact source edition and output the customer expects, and two separately operated facilitator profiles. The same job reviews and stages both providers, selects and runs the original seller, prepares complete buyer request files, receives the actual returned attempts, and hands over its complete records.

The job uses the existing SF82 release engine, the native x402 requirements builder, SF88 buyer configuration and SF52 outcome interpretation. Provider selection, seller startup, approval, reservation, signing, settlement and recovery retain their existing engines and identities.

## Install and open

Use a complete current Starforge installation with the original native seller and buyer dependencies and Linux flock support. The source-owned contribution registers:

~~~sh
starforge registrations --source facilitator-commissioning
starforge facilitator-commissioning --help
~~~

From a complete source checkout, replace the command prefix with:

~~~sh
node products/facilitator-commissioning/cli.mjs
~~~

For a new installation, build the standard complete distribution from the exact committed source that includes this contribution:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/source-checkout \
  --ref ACTUAL_IMMUTABLE_SOURCE_COMMIT \
  --selection all \
  --out /absolute/new-distribution-output
~~~

Continue that archive through the original distribution's runtime installation and native dependency profile. The standard source declaration includes the complete SF30 seller, SF31 buyer, SF36 spending, SF43 observation, SF52 outcomes, SF54/SF62/SF81 approval bridge, SF82 releases/evidence/reconciliation and SF88 operator components. The maintained builder also follows actual static ESM imports recursively. Complete component selection carries the original spawned seller modules and Python helpers that static imports alone cannot discover. The native profile retains the original x402 2.28.0 and Stellar SDK dependencies.

A previously installed selected product has its own exact contribution inventory. To add this command, rebuild a source selection that explicitly includes facilitator-commissioning and that same native operating closure, or use the standard complete distribution above. Keep the resulting archive's original source commit, manifest and installed profile with the commissioned workspace.

The component provides a private authenticated local operator application, the original command-line workflow and a readable complete HTML report. The application supports the full operating course on desktop and phone. All source, commands and receiving records stay in the same original private job.

## 1. Choose the original useful task

First prepare and stage the service through its original source adapter. Keep the actual original SF82 store and source release ID. For Socrata Publisher, use its existing complete-edition publication and [facilitator operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/socrata/FACILITATORS.md). SQL, API, file and other seller families retain their own source preparation and retained-release rules.

Prepare three customer documents alongside the selection:

- **Source scope:** the original source, authorization, selected edition or reporting period, population, all filters and pagination, expected total, units and exclusions.
- **Output schema:** every field, original type, units, null behavior, ordering and interpretation needed by the receiving application.
- **Acceptance:** the useful task, all required files/pages, the receiving application/operator and the decision that completes the task.

These documents retain their exact original bytes. Keep the complete baseline output for every selected HTTP request or page, acquired from the actual chosen source. A two-page edition must list both pages. The commissioner compares the exact whole returned bytes with these retained files. For an evolving live source, first select a stable source snapshot or edition through its existing adapter. A changed edition becomes a new commissioning selection.

The current component accepts literal retained route paths. Each request keeps its exact query string. A templated route needs an existing concrete published resource before this job can select it. Each file is limited to 64 MiB; use the source's existing complete page/file partitioning for a larger task.

A host provider file uses the existing schema:

~~~json
{
  "schema": "stellar-forge.seller-facilitators.v1",
  "providers": {
    "vellar": {
      "label": "Vellar testnet",
      "url": "https://vellar-facilitator-testnet-production.up.railway.app",
      "timeoutMs": 10000
    },
    "periplo": {
      "label": "Periplo testnet",
      "url": "https://periplo-testnet.fly.dev",
      "timeoutMs": 10000
    }
  }
}
~~~

These endpoints come from the maintained Publisher profile. The native review reads the selected provider's actual capabilities. A complete previously received supported-response document can be selected explicitly; the native SDK interprets its recorded original bytes through the existing [response contract](../../stellar/scf-starforge-20261009/sf82-seller-pilot/FACILITATOR_RESPONSES.md).

Each chosen provider also needs its actual operator identity, name, primary reference and complete retained authority document. The two aliases, proposed release IDs, operator identities and endpoint origins must differ. Keep the actual operator/source relationship in those documents; different aliases alone do not establish independent operation.

Prepare a selection file. This example illustrates the fields; replace its source paths, identifiers, customer details and route with the actual retained service:

~~~json
{
  "schema": "stellar-forge.facilitator-commissioning.v1",
  "id": "customer-edition-two-providers",
  "title": "Customer edition on two payment providers",
  "store": "/private/original-seller-releases",
  "releaseId": "original-edition",
  "profilesFile": "/private/facilitators.json",
  "providers": [
    {
      "alias": "vellar",
      "releaseId": "edition-vellar",
      "operatorId": "actual-vellar-operator",
      "operatorName": "Actual Vellar operator",
      "authorityReference": "Original primary operator reference",
      "authorityFile": "/private/source/vellar-operator.txt"
    },
    {
      "alias": "periplo",
      "releaseId": "edition-periplo",
      "operatorId": "actual-periplo-operator",
      "operatorName": "Actual Periplo operator",
      "authorityReference": "Original primary operator reference",
      "authorityFile": "/private/source/periplo-operator.txt",
      "supportedResponseFile": "/private/source/periplo-supported-response.json"
    }
  ],
  "service": {
    "purpose": "Deliver the complete agreed customer edition for its receiving application.",
    "sourceReference": "Actual authorized source reference",
    "sourceEdition": "Actual original edition identifier",
    "scopeFile": "/private/source/scope.md",
    "schemaFile": "/private/source/schema.json",
    "acceptanceFile": "/private/source/acceptance.md",
    "receiver": {
      "name": "Actual commissioning customer",
      "system": "Actual receiving application",
      "operator": "Named receiving operator"
    }
  },
  "requests": [
    {
      "id": "page-one",
      "routeId": "actual-retained-route",
      "url": "https://actual-merchant.example/data?page=1",
      "method": "GET",
      "outputFile": "/private/source/page-one.json",
      "mediaType": "application/json"
    },
    {
      "id": "page-two",
      "routeId": "actual-retained-route",
      "url": "https://actual-merchant.example/data?page=2",
      "method": "GET",
      "outputFile": "/private/source/page-two.json",
      "mediaType": "application/json"
    }
  ]
}
~~~

For a POST/PUT/PATCH/DELETE request, add its original bodyFile. The job retains its complete bytes and SHA-256. GET and HEAD have no body file.

Create the job in a new private directory with an existing parent:

~~~sh
starforge facilitator-commissioning init \
  --selection /private/commissioning-selection.json \
  --directory /private/customer-commissioning
starforge facilitator-commissioning status \
  --directory /private/customer-commissioning
~~~

Initialization reads and verifies the original retained release and captures the complete selected contract and output files. Repeating the same selection in the same directory reopens it. A changed selection requires a separate job; the original remains available.

## 2. Save commands once, then continue those exact commands

Every mutating job command has an operation UUID and expected job revision. The request helper writes that complete command file once. Keep it after an interrupted reply.

For example, put {"provider":"vellar"} in review-vellar.json, then prepare and apply:

~~~sh
starforge facilitator-commissioning request \
  --directory /private/customer-commissioning \
  --action review --payload /private/review-vellar.json \
  --out /private/review-vellar-command.json

starforge facilitator-commissioning apply \
  --directory /private/customer-commissioning \
  --command /private/review-vellar-command.json
~~~

Apply receives a completed result unchanged. A pending review reopens its saved native review if that observation was already retained. A pending stage asks the original release engine to reconcile that same reviewed release. A pending selection looks for its exact original generation, target and operation reason in the release history. Reusing a UUID with a different body is rejected.

A new command uses the current job revision. Commands prepared before another completed mutation may need a fresh explicit command after inspecting the new state. The original rejected/pending command stays retained.

One process owns the job directory. Run, status, mutation and export use that same private lifetime. Stop the running seller before another process opens this job; buyers use their own original workspaces and the merchant's actual ingress.

## 3. Review and stage each selected provider

Repeat the review workflow with the second provider's alias and its own command file.

For the already operated HPD or another existing service, consume its original completed native review instead of creating a second observation. Set the selected provider releaseId to that actual staged ID, then use a review payload with provider and reviewFile pointing to the complete original review JSON. The original readFacilitatorReview validates it; the job compares the source release/digest, full source identity, provider configuration and proposed release ID. Stage then receives that exact original already committed release through its native derived-from binding, including when the current selection generation has advanced. Each result contains the complete original SF82 review: source digest, selection generation, provider definition, observed supported metadata, all ordered native payment alternatives and any compatibility error.

Review every retained route and alternative. The provider's native SDK-generated terms may contain extensions that differ from the stored draft. Network, asset, recipient, atomic amount and timing remain separate fields.

To stage a completed review, use its original commissioning operation UUID:

~~~json
{"reviewOperationId":"ACTUAL_ORIGINAL_REVIEW_COMMAND_UUID"}
~~~

Prepare it with --action stage and apply that exact command. The stage calls the original stageReleaseFacilitator interface. New staging rechecks the original source and selected capabilities. If staging already committed, the native derived-from review identity recovers the exact retained release.

Complete both reviews and both stages before switching the serving selection. A selection generation change invalidates an older uncommitted review; keep that observation and prepare a new native review against the current original selection.

The full job preserves incompatible reviews, successful stages and all later source/provider observations. A new supported response or a different service edition is an explicit new selection.

## 4. Prepare all original buyer requests

Use a complete existing SF88 buyer configuration with the customer's actual actor, service, signer module, spend ledger, evidence directory and explicit accepted terms. Keep its existing limits and private key provisioning. This component reads the configuration and validates it through the original buyer parser; it does not load the signer or change the spend journal.

Select one native payment alternative for every agreed page/request:

~~~json
{
  "provider": "vellar",
  "templateFile": "/private/existing-buyer-config.json",
  "outputDirectory": "/private/customer-response-files",
  "requests": [
    {"requestId":"page-one","intentId":"customer-vellar-page-one","paymentOption":0},
    {"requestId":"page-two","intentId":"customer-vellar-page-two","paymentOption":0}
  ]
}
~~~

The paymentOption is the zero-based alternative in that route's complete native review. Each choice must fit the existing buyer template's network, asset, recipient, cap, timeout and timing. An omitted timing choice means authorization in the original buyer. The generated configuration narrows the amount, timeout and timing to the displayed native alternative while preserving the original operator authority. It also checks that the original buyer's predicates match exactly that one alternative; indistinguishable or still ambiguous alternatives require an explicit source-offer review. Every original request must be listed once. Buyer intents are distinct across both providers and all pages.

Prepare/apply this payload with --action buyer-plan. The completed result returns complete private SF88 configuration files, exact body files when present, expected output identities and the quoted aggregate atomic amount grouped by network/asset.

These files pin each response's complete expected bytes, hash and content type. The customer's original approval still applies to every native request and its existing aggregate budget. Keep the job at its selected path while these requests operate.

Private-ticket, order-specific and custom-header operations continue through their existing merchant handoff rather than this plain-resource template. Their normal private capability and original request identities remain with that workflow.

## 5. Select and operate the first provider

Read status and inspect originalSelection.generation. Prepare a select payload with the actual current generation:

~~~json
{
  "provider":"vellar",
  "expectedGeneration":0,
  "reason":"Operate the complete selected customer task on the first provider."
}
~~~

Use the actual generation rather than the illustrative zero. Prepare/apply --action select. Selection chooses the next original seller run; a different process already serving the store keeps its original lifetime. Stop that original owner before starting this job's seller.

Choose one stable UUID for the actual provider run:

~~~sh
starforge facilitator-commissioning run \
  --directory /private/customer-commissioning \
  --provider vellar \
  --operation-id ACTUAL_ORIGINAL_RUN_UUID \
  --expect ACTUAL_SELECTED_GENERATION
~~~

The command starts runActiveRelease from the original SF82 engine. It retains the actual source, provider, selected generation, native observation, readiness URL and the native readyAt timestamp. The original native startedAt remains in that complete observation. Keep this foreground owner alive while the customer executes the prepared requests through the configured merchant ingress.

On the customer's existing host, review and execute each returned config with the original buyer:

~~~sh
starforge buyer --review --config ACTUAL_PREPARED_CONFIG
starforge buyer --execute --config ACTUAL_PREPARED_CONFIG
~~~

Use the installed inventory to confirm the existing buyer command. From source, its exact entrypoint is stellar/scf-starforge-20261009/sf88-operator-buyer-cli/cli.mjs.

Retain each complete emitted summary, its original evidencePath and the actual saved output. An uncertain attempt continues through the existing buyer/inbox/chain reconciliation under its original intent. Its later observation can then be received into this same commissioning job.

Ctrl-C invokes the original seller's shutdown and drain. The job records the original completion. A retained run UUID is never silently relaunched; inspect the native original state before choosing a subsequent run.

If the process ended between native readiness and the local started receipt, use the original release status to select its actual native instance. Prepare/apply --action receive-run with {"runOperationId":"ORIGINAL_RUN_UUID","nativeInstanceId":"ACTUAL_SF82_INSTANCE"}. This reads and retains the original SF82 observation after matching source, release, generation and readiness. A stopped observation supplies its original end time. It neither starts nor adopts control of another process. A different or unready native instance remains an explicit mismatch.

## 6. Receive every returned attempt and the useful output

After the provider run is stopped, prepare a receive payload for each original attempt:

~~~json
{
  "provider":"vellar",
  "requestId":"page-one",
  "runOperationId":"ACTUAL_ORIGINAL_RUN_UUID",
  "summaryFile":"/private/customer-results/page-one-summary.json",
  "evidenceFile":"/private/customer-results/original-sf82-evidence.json",
  "outputFile":"/private/customer-results/page-one-response",
  "receiving":{
    "operator":"Actual receiving operator",
    "decision":"ACCEPTED",
    "note":"The complete agreed page reopened in the receiving application.",
    "receivedAt":"2026-10-13T12:00:00.000Z"
  }
}
~~~

Use the actual returned time, not the illustrative value. The decisions are ACCEPTED, CHANGES_REQUIRED and INCOMPLETE. Omit outputFile when the response was incomplete or never saved. The complete native summary and evidence remain required to classify that returned attempt.

Prepare/apply --action receive. The commissioner:

1. Matches the original SF88 intent and SF82 observation.
2. Uses the original SF52 interpretation of its approved network and observed transfer.
3. Binds a qualifying paid result to the exact SF81-approved URL, method and request-body bytes.
4. Matches the observed native alternative to the selected provider release.
5. Places the original attempt time within that actual recorded provider run.
6. Verifies the complete saved response against the original buyer's file identity and the agreed useful output.
7. Retains the actual customer decision and source files.

An accepted page retains its exact destination; a different output remains available with its CHANGES_REQUIRED decision. All failed, pending and incomplete payment/output states remain visible.

A later reconciliation of the same original intent uses supersedesOperationId equal to its latest receiving command UUID, while preserving provider, page and run. Earlier native observations stay in history. The original SF82 observedAt is fixed before the buyer call; recoverCheckoutEvidence preserves that timestamp and records its later recovery.recoveredAt separately. A result can therefore be received after the seller has stopped while still belonging to its original run. The commissioning result retains both the original attempt time and the later recovery time. A reused transaction cannot count as two separate transfers.

Repeat the existing selection/start/buyer/receive workflow for the second provider. Its requests use distinct original buyer intents. The source, page set, schema and useful output remain the same.

## 7. Review the complete task and hand it over

~~~sh
starforge facilitator-commissioning report \
  --directory /private/customer-commissioning

starforge facilitator-commissioning report-html \
  --directory /private/customer-commissioning \
  --out /private/customer-review.html
~~~

A provider task completes only when every selected request has an independently observed transfer, the original successful delivery, matching approved request, exact complete useful output and an accepted customer receiving decision. PAIRED_SERVICE_RECEIVED requires both selected provider tasks.

The report retains every request, provider authority, native review, original intent, incomplete outcome and network/asset total. Whole-task receiving is separate from the number of paid pages. The grant's independent-merchant/buyer and observation-window rules remain with the original cohort plan.

Export the closed job:

~~~sh
starforge facilitator-commissioning export \
  --directory /private/customer-commissioning \
  --out /private/commissioning-handover

starforge facilitator-commissioning inspect-transfer \
  --directory /private/commissioning-handover
~~~

The transfer includes the complete original selection, all captured contract and output bytes, provider documents, native reviews, commands/results, run history and prepared buyer configs/bodies. Its manifest verifies every member and rejects unlisted operating files. Protect this directory as private customer and operator data.

The original service store and buyer spend workspace retain their existing encrypted recovery workflows. Capture and transfer those original stores through the maintained merchant and buyer recovery tools alongside the commissioning job. Signing secrets remain in the receiving host's existing provisioning mechanism.

After the original merchant store has been received, reopen the transferred job against that explicit store:

~~~sh
starforge facilitator-commissioning status \
  --directory /private/commissioning-handover \
  --store /private/received-original-seller-releases
~~~

The commissioner verifies the original retained release digest, routes and full source identity before operating. Its historical source paths and commands remain unchanged. Already prepared buyer configurations retain their original byte representation. The interactive operator's current-host execution copy resolves verified body locations and response destinations while preserving the original buyer intent and terms.

## Implementation and programme placement

This component completes a reusable operating job above the already delivered provider review and stage interfaces. The Queens HPD programme has already exercised compatible Vellar/Periplo native reviews and same-source staging; keep that original operation as the starting installation when applicable.

For the existing SCF programme, the selected customer commissioning belongs in the T2 provider-and-ledger package: one complete useful service through two separately operated providers, actual approved buyer work, observed transfers, full customer output and maintainable handover. The existing programme retains its two independent merchants, two independent buyers, ten useful testnet purchases during seven consecutive days, later mainnet thresholds and six original budget packages. Existing source development stays the starting product; customer-specific integration and acceptance use the original workorders.

The public interfaces are createCommissioningJob, openCommissioningJob and inspectCommissioningTransfer. The original source files retain their normal module paths in the installed distribution. No separate database or payment dependency is introduced.


## Interactive operator application

The foreground operator gives the same retained native job a complete local interface. It includes service setup, complete source-file upload, both provider reviews and staging, selected seller operation, original buyer-plan preparation, actual customer receiving, full history and portable handover. The source engine remains the authority for release identity, command replay, payment interpretation and full service completion.

### Host setup and foreground ownership

Create a private host setup file. Paths are interpreted relative to that file, and the browser sees the configured aliases.

~~~json
{
  "store": "/private/original-release-store",
  "profilesFile": "/private/original-facilitators.json",
  "buyerTemplates": {
    "original-customer": {
      "title": "Original customer buyer configuration",
      "file": "/private/original-buyer-template.json"
    }
  }
}
~~~

The buyer template uses the existing SF88 configuration and approval boundaries. The interface prepares complete request configurations; execute them through the original installed buyer workflow.

Start the application in the foreground:

~~~sh
starforge facilitator-commissioning serve \
  --directory /private/commissioning-job \
  --setup /private/operator-setup.json \
  --exports /private/commissioning-exports \
  --port 0
~~~

The job directory and export directory must be private, ordinary directories owned by the current operator. The export directory must be outside the job. A newly selected export directory is empty; its owner descriptor then binds it to this original operator instance. The default export directory is a sibling named after the job with the suffix `-commissioning-exports`.

Open the exact private URL printed by the command. The listener binds to 127.0.0.1 and exchanges the fragment token for an HttpOnly same-site session. The fragment is removed from browser history. Keep this foreground owner alive while reviewing or serving. Refreshing the browser reads its current saved job; it does not restart a seller. Ctrl-C or SIGTERM closes the listener, drains pending operations, and closes the original seller owned by that job.

An already prepared job can open with `--directory` and, after transfer, explicit `--store`. A setup file supplies the provider configuration for new service setup and the host-selected buyer template aliases. Existing source-bound commands retain their captured original template bytes.

### Operating course

1. **Files.** Upload the complete scope, schema, acceptance criteria, authority documents and original expected outputs. Add existing native reviews and actual buyer summaries/evidence/output files when applicable. Every file retains its complete byte count and SHA256. Files are limited to 64 MiB. Select the same file again after an interrupted upload; the original server offset determines continuation.
2. **Service setup.** Enter the retained release ID, source edition, receiving operator and exactly two provider profiles. Add every agreed request or page, with its literal route, full URL, method, content type and original expected output. Review the complete saved command, then apply it. The native source rules validate the release and whole request set.
3. **Providers.** Review each actual provider or receive its complete existing native review. Stage the selected completed review. Select the desired provider at the current saved generation with an explicit reason. Start only that selected provider and generation. Current runtime state and the owned original run remain visible. Stop closes only this foreground owner’s selected seller. A separately recovered native observation uses its original run UUID and native instance ID.
4. **Buyer plans.** Load the actual staged provider’s native payment alternatives. Choose one displayed alternative and a distinct original intent for each request, plus a host-declared buyer template. The engine validates the full request set, exact terms, cap and native matching rules. Download the original configurations and, when needed, their current-host execution copies.
5. **Receiving.** Select the original provider, request and run. Receive the actual complete buyer summary, evidence and returned output together with the receiving operator, decision, time and note. A later observation explicitly names the prior receiving operation it supersedes. The original observed-at time and later recovery time remain distinct.
6. **Overview and History.** Inspect both providers’ complete service position, every original request, payment outcomes, source observations and saved commands. History is paginated by its retained job revision and exposes each complete original record. Pending work stays available for explicit continuation.
7. **Handover.** Stop the owned seller, review a complete export, and apply it once. Download the complete TAR and its source manifest. Download the readable full HTML report for the recipient. Each completed transfer retains its exact original source cut; a later operating state receives a new export operation.

All action forms first save their full original request on the host. The review panel displays that request before applying it. Before the first send, the browser atomically retains the full exact request in IndexedDB under the stable operator instance. Another tab cannot replace its pending UUID. The host retains the same complete payload, source references, original revision, native command binding and receipt. A NOT_FOUND host result reuses the complete browser request. Per-tab screen drafts preserve values, original revision and selected service/provider basis across reloads; an explicit review applies the current basis to a stale draft. Navigation and form editing are locked during asynchronous capture, uploads and operations. Completing a command clears only the matching saved request and unchanged submitted draft. A draft edited after preparation stays saved.

### Interrupted command and cold receiving

| Saved state | Continuation |
| --- | --- |
| Complete operator receipt | Receive that exact result; no action is repeated. |
| Original request prepared, native action absent | Apply the same request and original revision. A stale first application reports the actual revision conflict for an explicit new decision. |
| Native command complete, operator receipt absent | Apply the same saved request. The unchanged original native command hash recovers its exact result before the operator receipt is completed. |
| Native command prepared, result absent | Continue the original command. Its source reads are resolved through the retained complete input binding; original command content and hash remain unchanged. |
| Original seller intent already recorded | Inspect its exact provider and generation. The original run UUID is received, not restarted. |
| Host has no saved request | Retry preparation with the exact complete request retained in IndexedDB. |
| A rejected or superseded request needs a replacement | Keep the original request pending, return to the preserved form, review the current source basis, and deliberately prepare a new command. The original request remains in local and host history. |

The operator captures a `native-requests` record before invoking a native command. It binds the exact logical request, complete native command, original root, and the byte identity of each original input file. During cold receiving, the native engine’s narrow input resolver verifies the original command hash and complete source bytes before resolving those reads at the received location. It changes neither command semantics nor the saved command representation. It does not create directories at historical host paths.

Buyer-plan recovery preserves its original configuration byte representation, including the original path strings. The **current-host execution copy** maps only a verified original request body to the received job’s actual body file and selects the current private response destination. When its original host-declared template alias is configured on the receiving machine, the copy also maps the current Python, policy, ledger, signer-module and evidence-directory paths. That template must retain the original buyer actor, service and trusted payer. The original SF88 execution validator checks the resulting complete configuration. Its buyer intent, URL, method, payment terms, limits and expected output remain the original plan. Download that copy on the host where the original buyer will run, then use the existing SF88 review and execution commands. The original configuration remains separately downloadable.

The optional `resolveCommandInputs` function on `openCommissioningJob` is a host receiving adapter. Its result binds `commandSha256`, `originalRoot` and the permitted input fields. Each field carries the original path, current read path, complete SHA256 and byte count. The engine allows only `reviewFile` for review, `summaryFile/evidenceFile/outputFile` for receiving, and `templateFile` for a buyer plan. All hashes are checked before source interpretation. Other payload fields remain unchanged.

### Receive the complete package on another host

Keep the complete installed application and the original native release-store transfer with the operator TAR. The operator TAR contains the job’s original source, reviews, commands, results, runs and buyer files; the operator’s complete input files, logical requests, native input bindings and results; both full manifests; and the original completed export receipt.

The complete package uses uncompressed POSIX ustar. The receiver accepts ordinary files and directories, rejects links and special files, validates every source byte/hash against both complete manifests, and rejects unlisted files. It supports packages up to 8 GiB, 100,000 members and 64 MiB per member. The selected receiving parent must be private and owned by the receiving operator.

~~~sh
starforge facilitator-commissioning receive-operator \
  --archive /private/incoming/commissioning-ORIGINAL-UUID.tar \
  --directory /private/received-job

starforge facilitator-commissioning serve \
  --directory /private/received-job \
  --store /private/received-original-release-store \
  --setup /private/received-operator-setup.json \
  --exports /private/received-job-exports
~~~

Receiving stages the complete source under an archive-bound private operation and atomically publishes the new job directory only after full validation. An interrupted receive reuses that exact staging and original archive. An exact repeated completed receive validates the originally received members while preserving later legitimate job files. A different archive cannot replace the original destination.

The received job retains the same operator instance. Its completed export receipt is reconstructed from the exact receipt carried by the archive, so an interrupted response to the original export does not create a new source cut. The browser recovery store is local to its browser profile. The transferred server-side requests and native bindings remain sufficient to recover prepared operations from the Pending commands screen on another browser. The receiving receipt under `.operator/received-transfer` records the complete original archive and source identities. Original release-store selection remains explicit; receiving alone does not contact a provider or launch a seller or buyer.

### Typed client and authenticated routes

The package exports `./facilitator/commissioning-client`, `./facilitator/commissioning-operator`, `./facilitator/commissioning-server` and `./facilitator/commissioning-receive`, with matching declaration files. The existing native engine export remains available.

`CommissioningClient` accepts the original origin and optional private bearer token. Browser use shares the same-site session. Every server response is no-store. All API actions require the original authenticated loopback session, exact host, and same origin when supplied.

| Route | Complete operation |
| --- | --- |
| GET /api/state | Current job, report, native runtime, complete uploads, pending commands and saved transfers |
| GET /api/history | Full original result/run/pending records with offset, limit and expected revision |
| GET /api/release | Exact native release review and payment alternatives |
| POST /api/uploads | Begin or recover a file with its original UUID, name, bytes and SHA256 |
| GET /api/uploads/UUID | Recover the actual retained upload offset |
| PUT /api/uploads/UUID?offset=N | Retain a complete original chunk, at most 1 MiB |
| POST /api/uploads/UUID/complete | Verify and retain the full input once |
| POST /api/requests | Prepare the complete original command without applying it |
| POST /api/action | Apply or reconcile that exact retained command |
| GET /api/receive?operationId=UUID | Receive its current original request/receipt state |
| GET /api/file | Download a complete source, original buyer configuration, current-host execution copy, command, report or transfer member |
| GET /api/archive?operationId=UUID | Download the completed original full TAR package |

The HTTP request/JSON limit is 1 MiB; complete file inputs use the retained chunk route. Downloads carry their complete byte count and SHA256 response header. Source hashes and complete JSON records are available under disclosures in the interface, while ordinary operating screens keep the main labels, states and decisions readable on desktop and phone.

### Inspect the exact outgoing product

The producing operator must open and view the exact outgoing application and generated report before presenting them. On the original populated commissioning job, operate all eight screens, complete source downloads, original buyer configuration and current-host execution copy, report download, complete TAR handover and reopened received job. Inspect desktop/screenshare and narrow/mobile widths, and relevant empty, loading and error states. View the actual screenshots if the browser operates on another host; filenames or DOM measurements alone do not complete this inspection.

Fix unreadable, clipped, overflowing, cramped, unstyled or broken output in the same source edition, retaining the original service data and native operation. Use readable tables, clear hierarchy, consistent typography and spacing, restrained controls and useful labels. Source review, HTTP success and another peer's approval supplement the actual rendered inspection. Keep the existing focused operating course; no broad test suite or separate verification product is required.

This rule is also retained in this component's AGENTS.md and applies across local/cloud providers and delegated workers. Its owner source is [Bryce's persistent instruction](https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791881463183449?thread_ts=1791724121.853269).


## Complete Merchant customer and agent operation

The installed facilitator-commissioning-customer command and source-owned Merchant provider operate this same authenticated foreground application. The complete [Customer agent guide](CUSTOMER_AGENT.md) covers configured instance/job aliases, original source import and chunk receiving, retained full commands, explicit apply/recovery, complete file/TAR capture, typed client and independent receiving. Both interfaces use the original native engine and preserve its payment, seller and source authority. The original populated HPD course receives this additive interface; its important controls, actual desktop/phone screens, complete downloads and reopened received job follow the rendering instructions above.


## Open every outgoing attachment

The producing worker must literally open, view, play or use every final attachment in its intended form: HTML, PDF, reports, slides, spreadsheets, maps, images, video, audio, archives and working projects. Extract outgoing archives and open their actual contained deliverables and the working project. Inspect the exact final edition and important controls; screenshots that were captured but never viewed do not satisfy this requirement. Repair concrete defects in the original source and delivery before presentation, preserving all other owner controls and the original operating case.

## Original Customer Installation

Use [the complete paired-service Installation course](INSTALLATION.md) to bind a full original commissioning transfer to its actual Workshare/Grant case and unchanged native Installation seed. The installable facilitator-installation command retains every original source file, maps exact case source identities, preserves both provider selections and prepares the original preview/save input. The original Installation writer retains funding, work assignments, actual acceptance and full case receiving.
