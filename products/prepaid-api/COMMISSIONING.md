# Commission a prepaid API offer

The commissioning desk turns the installed prepaid API starter into a complete operator workflow. Open the generated HTML, select the merchant's original payment and host terms, save a configuration edition, and pass that complete document to the original native preparer. Receive the resulting full application source, continue publication and customer delivery in the maintained workspaces, and keep the complete editable document for another operator.

The desk uses the existing numeric-series starter. It accepts JSON values and a rolling-window size and returns the existing numeric summary and rolling means. A different application is configured through the original merchant tools. The desk does not turn the example into a new service implementation.

## Open the installed desk

Use a ready installation containing the existing prepaid-api selection. Create the private output parent on the selected host, then run:

~~~sh
umask 077
mkdir -p /srv/starforge/commissioning
chmod 700 /srv/starforge/commissioning

starforge prepaid-api commissioning \
  --directory /srv/starforge/number-api \
  --out /srv/starforge/commissioning/number-api-draft \
  --actor merchant-operator
~~~

Open the returned Prepaid_API_Commissioning.html in a browser. The initial offer title and allowance are the original starter template. The checkout origin, API origin, asset contract, merchant recipient and atomic price require the operator's actual selections. Creating this document does not create an offer, launch a service, or purchase a pass.

The output is a complete directory:

| File | Contents |
| --- | --- |
| commissioning-operation.json | Original selected build input, complete source identities, operation UUID and creation time |
| commissioning.json | Editable configuration editions and all received original results |
| Prepaid_API_Commissioning.html | Complete offline desk with the same state and full authoring source |
| prepaid-request.json | Exact selected original starter request |
| source.json | Complete implementation and operating source bodies with byte counts and SHA-256 |

The output directory and setup directory must be disjoint. Repeating the same command and selected source reopens its exact output. Changed input or a changed installed source edition uses a new output directory. Differing existing files remain protected by the original exact writer and output lease.

## Select the actual terms

The form covers every original starter field: service and offer names, public checkout/API origins, checkout/function routes, Stellar network and asset contract, original recipient, positive price in atomic asset units, payment timeout, total allowance, units charged per successful analyze call, worker/API ports, request timeout, original merchant actor, native Python executable and backup passphrase environment name.

The price is an integer string in atomic asset units. The desk never converts it to USD or guesses asset decimals. Allowance and per-request units are separate. For a single route costing three units, an allowance of ten provides three full calls and one remaining unit. It does not establish three purchases. Native settlement counts each purchased pass once; later calls and retries belong to its original usage.

The initial examples use testnet. Select the actual network intentionally. A production host, public routing, original signer/facilitator configuration, service costs and purchase funds belong to the existing operating arrangement. Secret values are not form fields; the backup field is only its existing environment variable name.

Save the form as a complete edition. Every edition records the operator, note, time, parent and exact request. Repeated identical input does not add an edition. The desk displays a preliminary field check; the original native compiler remains authoritative for payment addresses, checkout, application source and actual host configuration.

## Prepare the real application

Download complete JSON from the desk to a private file on the selected host. Use a new private output directory:

~~~sh
starforge prepaid-api commissioning-prepare \
  --document /srv/starforge/commissioning/commissioning.json \
  --out /srv/starforge/commissioning/number-api-prepared
~~~

The command retains the exact selected document, then calls preparePrepaidApi with its original request and selected directory. It reopens inspectPrepaidApi against the created application. The original setup.json, inspected setup-complete.json and their exact relationship are received back into the commissioning document.

The native original seven files remain under the selected setup directory:

- application/numeric-series.mjs
- application/jobs.json
- checkout.json
- backup-selection.json
- merchant-workspace.json
- offer-draft.json
- examples/analyze.json

The returned originalSetup identifies setupId, inputSha256, planSha256, configuration path/hash, selected source hash, private workspace, original launch file, complete source members and offer draft. Use those returned paths; do not construct alternative IDs from a title.

The preparation output additionally retains original-commissioning.json, setup.json, setup-complete.json and prepared.json. The complete prepared HTML/JSON includes all seven generated source bodies inside the exact original setup plan. It can be received without the donor browser or original incoming file.

An interrupted prepare remains in its same output and same selected setup directory. Repeating the identical command retains the original operation and calls the original preparer's first-record/file recovery. It does not create a different setup to resolve a lost response. Original source or request mismatches remain explicit. Preserve the entire output and selected setup directories.

## Use the existing Applications lifecycle

The commissioning command can produce the original complete Applications setup document when supplied with the actual runtime workspace and ready runtime IDs:

~~~sh
starforge runtime-workspace status --workspace /srv/starforge/runtime-workspace

starforge prepaid-api commissioning-prepare \
  --document /srv/starforge/commissioning/commissioning.json \
  --out /srv/starforge/commissioning/number-api-managed \
  --runtime-workspace-id ACTUAL_WORKSPACE_ID \
  --runtime-id ACTUAL_READY_RUNTIME_ID
~~~

Both IDs come from the existing runtime workspace, not the examples. The output's merchant-application-setup.json selects API merchant console and the actual generated merchant-workspace.json. It uses the original setup codec and native application catalog. The preparation command does not save or start an Application.

In the existing runtime browser, open Applications → Complete setup snapshots and receiving, import that complete JSON and receive it through the existing editor. Choose the actual ready runtime if receiving as new, inspect the native configuration review, then Save and Start. For headless operation use the original application-setup-inspect, application-setup-prepare and application-setup-save commands described in APPLICATION_SETUP.md under the distribution's runtime-workspace source.

The original Applications reviewer re-reads the installed command, configuration, merchant/checkout source, original workspace and selected code. It retains that original run and publishes its original authenticated launch. The commissioning document carries no launch capability or credential.

A new host gets explicit host bindings and a newly prepared native setup, or receives the original complete application through its established restore/receiving workflow. Copying this authoring document does not move a running owner. The original paid order and its journals remain with their original receiving operation.

## Publish and operate the original merchant

For a direct local console:

~~~sh
starforge prepaid-api serve --directory /srv/starforge/number-api --port 0
~~~

Keep that original process running. Use its returned launch file in another terminal:

~~~sh
starforge prepaid-api publish \
  --directory /srv/starforge/number-api \
  --launch /srv/starforge/number-api/merchant-workspace/api-merchant-launch.json
~~~

This is the maintained publication workflow. It retains the original offer_prepare and offer_publish operation IDs and exact requests. A response with READY contains the original offer, workspace, publication workflow, export files and operation IDs. An incomplete result remains incomplete. --resume continues the original ATTENTION or definite rejected-admission path; a lost response does not call for a new purchase or workspace.

Receive the full publication JSON in the desk under publication, choosing the current setup-result as its parent. Start the published worker/gateway through the original merchant browser's Start action. All later service, allowance, execution, access, recovery and encrypted backup actions remain in that original browser or its installed merchant tools.

## Prepare and receive the customer handoff

Choose the original order reference and customer label in the existing operation:

~~~sh
starforge prepaid-api customer \
  --directory /srv/starforge/number-api \
  --launch /srv/starforge/number-api/merchant-workspace/api-merchant-launch.json \
  --order ORIGINAL_ORDER_REFERENCE --label 'Customer access'

starforge prepaid-api receive \
  --directory /srv/starforge/number-api \
  --launch /srv/starforge/number-api/merchant-workspace/api-merchant-launch.json \
  --order ORIGINAL_ORDER_REFERENCE \
  --out /srv/starforge/number-api-customer-files
~~~

Customer preparation returns READY only from the actual original order_prepare. Its manifest includes the original handoff, API pass and private credential file. The maintained downloader receives every byte and verifies the original member inventory. Keep the credential-bearing customer directory private.

In the desk receive customer-handoff with its publication parent, then customer-files with that handoff parent. The latter must match the exact workspace, offer, order reference, export UUID and every original member name, content type, byte count and SHA-256. The desk retains the complete result JSON, not the private credential bytes. It does not infer settlement from a prepared order or a complete download.

Configure the existing customer workspace:

~~~sh
starforge prepaid-api customer-configure \
  --handoff-directory /srv/starforge/number-api-customer-files \
  --directory /srv/starforge/number-api-customer \
  --mode purchase \
  --buyer-workspace /absolute/original/buyer-workspace \
  --intent ORIGINAL_STABLE_INTENT
~~~

Use the returned configurationFile in customer-serve. The original customer browser performs its existing purchase review and approval, allowance/usage view, calls, replacement purchase, result receiving and recovery. When the original pass is already connected, the existing access mode is available through the maintained command. Receiving the customer-setup result in this desk preserves its full original handoff binding.

The complete current product guide OPERATING.md remains the authority for customer approval modes, source/runtime configuration, agent connections, original host recovery and full encrypted receiving.

## Editions, incoming branches and first receiving

Open complete JSON as a separate local branch to continue it independently. Every opened tab gets its own browser storage key. Save this branch in browser is explicit; it never overwrites another tab's selected branch. Download JSON or HTML for portable custody because browser storage can be unavailable or cleared.

Compare with this commission requires the same commissioning UUID and a shared exact original edition. It compares each top-level request field, each payment field and the selected setup directory. A change from one side is retained when the other side kept the common value. Different changes to the same field require an explicit current/incoming choice. Absent optional fields remain absent; null, zero and empty string are not silently replaced by defaults. Both complete edition histories and all original captures remain in the merged result.

All request changes create a new selected edition. Prior generated setup and publication results stay under their exact prior edition. They do not become evidence for changed pricing, routes, recipients, origins or host paths.

The browser guards asynchronous file reads against a changed file, selected state/head, other form activity or changed parent/result type. Save current edits before importing original results or comparing branches. Opening a different complete document asks before discarding unsaved form edits. Cancel retains the form.

## Original result receiving contract

| Result kind | Exact prerequisite and retained source |
| --- | --- |
| setup-plan | Same selected original request/input hash and directory, all seven full generated files with original byte/hash inventory |
| setup-result | Exact setup-plan bytes/hash, setup ID, source/configuration hashes and complete member inventory |
| publication | That setup result, original READY publication, workspace and offer |
| customer-handoff | That publication, original order reference and complete native export manifest |
| customer-files | Same order/offer/workspace/export and every original completed member |
| customer-setup | Same received customer files and complete member binding in the original customer workspace configuration |

Imported JSON is documentary source supplied by the operator. Hashes bind exact bytes and relationships; they do not authenticate an external party. The native preparation adapter actually inspects the selected host files. Further native publication, payment, service and receiving outcomes remain established by their original owners and results.

The complete portable JSON is limited to 32 MiB, at most 512 configuration editions and 1,024 original captures. Validation and size admission happen before adoption. Each successful document export can reopen through the same source. The generated HTML is larger because it includes complete authoring source and escaped JSON; the native exact-output writer checks its actual byte length on replay.

## Programmatic and source interfaces

~~~js
import {
  buildPrepaidCommissioning,
  preparePrepaidCommissioning,
  inspectPrepaidCommissioning
} from '@tokenjunkielabs/starforge-merchant/prepaid-api';

const prepared = await preparePrepaidCommissioning({
  document: '/srv/starforge/commissioning/commissioning.json',
  out: '/srv/starforge/commissioning/number-api-prepared'
});
// prepared.originalSetup is the original inspected native result.
~~~

The browser core exports createCommission, reviseCommission, compareCommission, mergeCommission, receiveOriginal, openCommission and exportCommission. It performs no network request. The native adapter delegates to original setup, inspection, private file/lease and Applications codec modules. The selected distribution includes the complete core/browser/renderer/assets/types/guide alongside the existing product; the full source packet records exact bodies.

The implementation's source course exercises the actual pure functions for authoring, separate-field merge, explicit conflicts, complete original-file receiving, exact byte rejection and offline document roundtrip. Such a source course is labelled as authored data. It does not replace the separately completed testnet merchant or customer programmes, and it adds no purchase or independent buyer to the grant register.

## Save-state and branch decisions

Saving a form creates an edition in the working document. Until a complete JSON/HTML download or browser save, the desk warns before closing or replacing that changed document. A request-only or individual-result download does not save the whole document. Reopening a complete file or saved browser branch establishes that complete document as the saved baseline.

If two operators independently merge the same branches, both maximal shared editions remain visible. When those independently reconciled heads are later compared, every differing field requires an explicit current/incoming decision. No array ordering chooses a baseline for the operator.

The operational command panel selects launchFile and configurationFile from the current edition's retained original setup and customer-setup results. Before those results arrive it shows ORIGINAL_RETURNED_LAUNCH_FILE and ORIGINAL_RETURNED_CONFIGURATION_FILE; replace them with the actual returned paths. The optional Applications document retains the full offer title and uses its first120 characters for the original Applications display-name field, whose limit is120.
