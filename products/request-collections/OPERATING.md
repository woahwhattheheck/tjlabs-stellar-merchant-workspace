# Request Collections: operating and receiving

Use Request Collections to retain a group of existing buyer requests, review their exact spending caps, operate selected intents, receive the saved response files, and reopen the same work after an interruption. The browser, terminal and MCP agent use the original collection store and SF88 inbox. Complete backup and receiving uses the original SF88/SF101 encrypted state and its retained operation journal.

This guide connects the installed entry points to that whole workflow. [The configuration example](examples/layout.example.json) and [its setup command](examples/configure.mjs) prepare the original host registration and recovery profile files. They contain operator-selected paths and environment-variable names; they do not create request bodies, start a service or run a recovery operation.

## Choose the operation

| Work | Entry point | Retained result |
| --- | --- | --- |
| Review and operate a collection | Applications → Request collections, or `starforge buyer-collections-workspace` | Original collection, inbox intents, attempts, approvals and delivery references |
| Hand over a result index | Collection **Export results**, or `starforge mcp-collections-download` | Five exact JSON/CSV/HTML files; delivered response bodies remain separate |
| Preserve complete operating state | **Backup and receiving**, or the original collection recovery actions | Encrypted manifest and every encrypted member, including the original application record |
| Restore on a receiving host | Applications receiving mode, or a separate `--receiving-directory` listener | Verified state at its exact original root, followed by an explicit Open |
| Operate collections and recovery through MCP | `starforge mcp-collection-receiver` | Original listener registrations and exact operation identities, with no buyer binding in this MCP host |

A finished collection describes progress across its members. Inspect each original buyer outcome and its saved response before reporting delivery success. A completed encrypted download reports received bytes. Native verification authenticates their contents; successful restoration and **Open restored collections** make the retained workspace available again.

## 1. Use the complete installed source

Use the existing Linux installation, Node.js 22.16 or later, util-linux `flock` and the original native buyer dependencies. Backup verification and receiving also require the existing Python 3.11+ runtime with its standard-library sqlite3, selected by the recovery profile. Encryption uses Node's built-in crypto; the original ledger recovery uses the source-owned SF36 governor and Python standard library. No separate Python cryptography package is needed for this recovery path. Keep the full source release and the original required runtime/module paths available on both hosts; the source review lists those paths.

From this checkout, replace `starforge` with:

~~~sh
node stellar/scf-starforge-20261009/distribution/cli.mjs
~~~

For example:

~~~sh
node stellar/scf-starforge-20261009/distribution/cli.mjs buyer-collections-workspace --help
~~~

Inspect the installed command and source registrations:

~~~sh
starforge source
starforge registrations --source collection-recovery-agent
starforge registrations --command buyer-collections-setup
starforge mcp-collection-receiver --help
starforge mcp-collection-recovery-download --help
~~~

The recovery contribution supplies `mcp-collection-receiver` and `mcp-collection-recovery-download` together with the control, receiver and download SDK exports. The product setup command comes from the separate `request-collections-product` contribution. Select a complete source edition when an older installation lacks one of these registrations. The [product installation guide](../../README.md#create-and-install-a-source-archive) covers the original archive, dependency selection and runtime reopening.

Keep the software checkout separate from private operating state. A practical layout is:

| Selection | Example absolute path | Meaning |
| --- | --- | --- |
| Original state root | `/srv/request-collections/customer-state` | The exact root preserved by recovery |
| Collection store | `/srv/request-collections/customer-state/collections` | Retained original collection manifests and run history |
| Original inbox | `/srv/request-collections/customer-state/inbox` | Original queued jobs, permanent attempt IDs and outcomes |
| Original request files | `/srv/request-collections/customer-state/requests/` | Actual complete operator configurations |
| Original buyers | `/srv/request-collections/customer-state/buyer-reference` and `buyer-reports` | Their existing configurations, ledgers and authentication keys |
| Capture bundle | `/srv/request-collections/backups/monthly` | A new encrypted backup outside the original state root |
| Received bundle | `/srv/request-collections/received/monthly` | Complete encrypted bytes and receiving checkpoints |
| Receiving journal | `/srv/request-collections/receiving-journal` | Separate retained verification, restore and Open operations |
| MCP host state and launch files | `/srv/request-collections/control/` | Separate registrations and the actual private listener announcements |

These are configurable example paths. Select the original paths in your operating installation. Recovery restores the exact root recorded in the backup; changing a path in an example does not relocate the original buyer or its ledger.

## 2. Open the normal collection workspace

### Applications

In the existing runtime workspace, select **Applications → New application → Request collections**. Choose the READY runtime containing the complete collection source.

For normal operation, leave **Receive an encrypted original workspace** unselected. Select the private collection store and its original initialized inbox. A new store needs that inbox; an existing store already retains its binding. Port `0` selects an available loopback port. The optional private environment JSON supplies the existing operator environment, including the chosen backup passphrase variable when recovery will be used.

Follow **Review application → Save application → Review start → Start reviewed application → Open application**. The saved operation retains the actual private URL in `application-url.json`. Opening it uses that original process. Closing a tab leaves the managed application available. **Stop application** drains its owned work; a later reviewed start announces its new private URL and reopens the same state.

The [Applications guide](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/COLLECTIONS_APPLICATIONS.md) documents the exact normal and receiving selections.

### Direct original command

If this is a genuinely new source workspace, initialize its inbox through the original command. Reuse an existing inbox when it already exists:

~~~sh
starforge buyer-inbox init \
  --root /srv/request-collections/customer-state/inbox
~~~

Start the collection listener from the terminal that owns the intended environment:

~~~sh
umask 077
starforge buyer-collections-workspace \
  --directory /srv/request-collections/customer-state/collections \
  --queue-root /srv/request-collections/customer-state/inbox \
  --approval-mode browser \
  --startup-format json \
  --port 0 \
  > /srv/request-collections/control/source-launch.json
~~~

Keep that process running and open the exact private URL from its launch JSON. The output contains the real directory, inbox, approval mode, process identity and token-bearing URL. Retain it privately. A subsequent start writes its actual replacement announcement to the selected connection file. An Applications-managed listener can supply its actual `application-url.json` instead; select that file in the example layout.

For a previously initialized store, `--queue-root` can be omitted. The private URL is bound to the current listener; the browser stores its capability in that tab's session storage. **Lock workspace** clears the tab's capability. Use the current complete URL to reconnect.

Do not start a second direct listener merely to attach MCP to an Applications-owned listener. Registration consumes the existing private announcement and verifies its live source binding.

## 3. Review and operate the original requests

Prepare the actual buyer configurations with the [original buyer guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/README.md). Each configuration supplies its stable intent, concrete method and resource, accepted payment terms, original operator and signer, evidence directory, and response destination. Configure bodies and tickets in their existing source format.

In the collection browser:

1. Select **New collection**, give it a stable ID and name, and select the existing absolute operator-configuration paths.
2. Select **Review requests**. Inspect each original method, URL, body/ticket identity, response destination and maximum amount. The totals group by network, asset, recipient, scheme and payment flow; amounts remain exact atomic-unit strings.
3. Select **Save reviewed collection**. The controller checks that the selected files still match the review. Browser previews expire after 15 minutes; changed inputs require a fresh review.
4. Select **Queue retained requests**. Matching original inbox jobs are adopted; partially completed enqueue work continues without replacing those original jobs.
5. Select the intended queued requests and **Run selected here**. Choose an existing shared buyer workspace, or the original workspace for each selected intent.
6. Use the original payment review for each active request. Approval remains bound to its run, intent, approval identity and request digest. Inspect the resulting native outcome and saved-file status.
7. Use **Pause run** to stop the owned run and drain its current work. Inspect its retained attempts before starting a later explicit selection of still-queued requests.

The terminal uses the same store. A source review can be prepared with:

~~~sh
starforge buyer-collections preview \
  --config /srv/request-collections/customer-state/requests/reference.json \
  --config /srv/request-collections/customer-state/requests/report.json
~~~

Save with the returned preview digest and the same original input files:

~~~sh
starforge buyer-collections create \
  --directory /srv/request-collections/customer-state/collections \
  --queue-root /srv/request-collections/customer-state/inbox \
  --id monthly-customer-handoff \
  --name "Monthly customer handoff" \
  --preview-sha256 RETURNED_PREVIEW_SHA256 \
  --config /srv/request-collections/customer-state/requests/reference.json \
  --config /srv/request-collections/customer-state/requests/report.json
~~~

Use `show` to obtain the collection's `manifestSha256`, then carry that exact digest into `enqueue`, `run`, `cancel`, `recover` and `export`. The complete selections and per-intent workspace flags are in the [collection controller guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/collections/README.md).

### Read the state before continuing

| Original state | Operator interpretation |
| --- | --- |
| `QUEUED` | Available for its first execution |
| `RUNNING_OR_INTERRUPTED` | An attempt began; inspect its original execution and recovery evidence |
| `ATTEMPT_RECORDED` | A terminal attempt exists; inspect its result and delivery status |
| `RECOVERED` | Original recovery recorded an observation |
| `CANCELLED` | Cancelled before execution |
| Collection `FINISHED` | Every member has an attempt, cancellation or recovery record; individual outcomes still determine success |

After a lost run reply, retain the same request UUID and selection. Use the saved run or MCP `run-status` to read it. Reopening an old launch does not dispatch it again. **Recover selected** follows the original request's evidence; restoring a backup has a different purpose and does not settle an unresolved purchase.

## 4. Prepare the host configuration examples

Copy [layout.example.json](examples/layout.example.json) into private storage and edit it to the actual original paths and aliases. `sources` maps aliases to existing complete request files. `buyers` maps aliases to the original buyer directories. Both maps are explicit; use `{}` when intentionally registering none.

Choose a new private configuration directory outside the original state, bundles, journals and MCP host directories. The receiving journal and receiving MCP directory must also be separate, non-overlapping roots. Its parent must already exist with private permissions. Then run:

~~~sh
starforge buyer-collections-setup \
  --selection /srv/request-collections/control/layout.json \
  --out /srv/request-collections/control/monthly-config
~~~

The equivalent source command is:

~~~sh
node products/request-collections/examples/configure.mjs \
  --selection /srv/request-collections/control/layout.json \
  --out /srv/request-collections/control/monthly-config
~~~

The command writes these original inputs as mode `0600` files in a new mode `0700` directory:

| Generated file | Original consumer |
| --- | --- |
| `source-collection-registration.json` | `mcp-collection-receiver collections-register` or `mcp-native collections-register` |
| `source-recovery-profile.json` | The registered source listener's SNAPSHOT/VERIFY selection |
| `receiving-recovery-profile.json` | The receiver's VERIFY/RESTORE selection and explicit `afterRestore` aliases |
| `source-recovery-registration.json` | `mcp-collection-receiver register` or `mcp-native collections-recovery-register` |
| `receiving-recovery-registration.json` | The corresponding receiving host registration |
| `source-profiles.call.json` and `receiving-profiles.call.json` | Read the registered profile hashes using the original `call --input` command |
| `collections.call.json` | Page the registered original source collections |
| `configuration-manifest.json` | Exact generated file lengths and SHA-256, plus the selected layout's digest |

The setup command creates configuration files only. Native registration subsequently checks the actual listener, store/inbox binding, profile bytes, request files and buyer configuration. It never marks generated configuration as a successful native registration.

A repeated invocation refuses the existing output directory. Keep a completed configuration edition for the operations already bound to it. Prepare a new directory and new registration aliases when deliberately changing a retained profile. After an interrupted configuration write, inspect that retained directory and manifest; no native operation has been started.

On a separate receiving computer, place the selected receiver profile and registration at the private paths named in the registration. The example registration refers to the configuration directory's absolute path. Before first registration you can select another private location explicitly. Once registered, preserve the profile bytes and operation bindings.

## 5. Attach the standalone MCP host

The standalone host is useful on a fresh receiver: it retains collection and recovery registrations without binding a separate SF88 buyer. The original collection/recovery listener remains owned by Applications or its original terminal.

Initialize a new source MCP directory whose private parent already exists:

~~~sh
starforge mcp-collection-receiver init \
  --dir /srv/request-collections/control/source-mcp

starforge mcp-collection-receiver register \
  --dir /srv/request-collections/control/source-mcp \
  --description /srv/request-collections/control/monthly-config/source-recovery-registration.json

starforge mcp-collection-receiver collections-register \
  --dir /srv/request-collections/control/source-mcp \
  --description /srv/request-collections/control/monthly-config/source-collection-registration.json

starforge mcp-collection-receiver call \
  --dir /srv/request-collections/control/source-mcp \
  --input /srv/request-collections/control/monthly-config/source-profiles.call.json
~~~

The last response returns the retained profile name and SHA-256. Keep that digest with the profile selection. Inspect the host's retained registrations with `mcp-collection-receiver inspect --dir ...`.

For an MCP client or the receiving SDK, supply the existing protected `MCP_ACCESS_TOKEN` or `MCP_OAUTH_CONFIG` through the host environment, then:

~~~sh
starforge mcp-collection-receiver serve \
  --dir /srv/request-collections/control/source-mcp \
  --port 0
~~~

Use the actual announced `/mcp` URL. This listener exposes the existing `sf43_discover_review_and_pay` tool with `collections` and `collection-recovery` actions. It does not own the separately running collection listener. Closing it drains its HTTP requests and readers; inspect the same recovery UUID after reopening.

### Existing native buyer MCP installation

An existing `mcp-native` installation can register the same descriptions through `collections-register` and `collections-recovery-register`. Its original buyer and native MCP directory must both remain outside the chosen restore target. If the only buyer is inside the target being restored, use the standalone collection receiver described above.

Profiles carry only `passEnv`, the name of the passphrase variable. Keep the actual passphrase in the original collection/recovery listener's environment. The MCP bearer token and archive passphrase are separate values with separate consumers.

## 6. Capture the complete original state

Before starting the source listener, provide the chosen passphrase variable through the operator's existing private environment. The original engine requires at least 16 UTF-8 bytes. The receiver needs the same value under its selected variable name.

In **Backup and receiving**, review the actual state root and choose a new encrypted output directory outside it. The source review includes the complete original inbox, collection manifests, retained requests and tickets, operator checkpoints, available saved responses, missing original references and required runtime paths.

Stop or quiesce the other writers to that same original state through their existing owners. The collection controller drains its own admitted mutations using its root lease. The capture's `quiesced: true` records that source-owner assertion; setting the field does not stop another process.

For MCP, call the same original tool with:

~~~json
{
  "action": "collection-recovery",
  "recoveryWorkspace": "monthly_source",
  "recoveryOperation": "review",
  "recoveryRequest": {
    "profile": "monthly",
    "expectedProfileSha256": "RETURNED_SOURCE_PROFILE_SHA256",
    "offset": 0,
    "limit": 25
  }
}
~~~

Follow the returned collection page offsets and inspect the complete review before capture. Retain its `reviewSha256`. Generate one new lowercase UUID for this intended snapshot, save it with the exact request JSON, and start:

~~~json
{
  "action": "collection-recovery",
  "recoveryWorkspace": "monthly_source",
  "recoveryOperation": "start",
  "recoveryRequest": {
    "profile": "monthly",
    "expectedProfileSha256": "RETURNED_SOURCE_PROFILE_SHA256",
    "requestId": "ORIGINAL_SNAPSHOT_UUID",
    "kind": "SNAPSHOT",
    "expectedReviewSha256": "RETURNED_REVIEW_SHA256",
    "quiesced": true
  }
}
~~~

The uppercase labels in these request examples are substitution points, not returned identities. Replace them with actual hashes and the one retained UUID before invoking the original tool or `call --input`.

Use `recoveryOperation: "inspect"` with the same workspace, profile, profile hash and request UUID until the journal reports its actual terminal state. Retain the completed snapshot's `recordSha256`. A lost HTTP reply leaves the request identity unchanged. Inspect it before any explicit same-ID resume.

For a terminal-only capture, the original equivalent is:

~~~sh
starforge buyer-collections backup-review \
  --directory /srv/request-collections/customer-state/collections \
  --state-root /srv/request-collections/customer-state

starforge buyer-collections backup-create \
  --directory /srv/request-collections/customer-state/collections \
  --state-root /srv/request-collections/customer-state \
  --out /srv/request-collections/backups/monthly \
  --review-sha256 RETURNED_REVIEW_SHA256 \
  --request-id ORIGINAL_SNAPSHOT_UUID \
  --quiesced
~~~

## 7. Receive and verify every encrypted member

Inspect the original completed snapshot through the retained-file receiver. The source MCP endpoint must be running for the online receiving calls. Its retained original journal and encrypted bundle supply the saved files; the collection listener may be stopped once the terminal result is available:

~~~sh
starforge mcp-collection-recovery-download inspect \
  --url ORIGINAL_SOURCE_MCP_URL \
  --token-env MCP_ACCESS_TOKEN \
  --workspace monthly_source \
  --profile monthly \
  --profile-sha256 RETURNED_SOURCE_PROFILE_SHA256 \
  --request-id ORIGINAL_SNAPSHOT_UUID \
  --record-sha256 ORIGINAL_RECORD_SHA256
~~~

Use the returned encrypted `manifest.json` SHA-256 for the download:

~~~sh
starforge mcp-collection-recovery-download download \
  --url ORIGINAL_SOURCE_MCP_URL \
  --token-env MCP_ACCESS_TOKEN \
  --workspace monthly_source \
  --profile monthly \
  --profile-sha256 RETURNED_SOURCE_PROFILE_SHA256 \
  --request-id ORIGINAL_SNAPSHOT_UUID \
  --record-sha256 ORIGINAL_RECORD_SHA256 \
  --manifest-sha256 ENCRYPTED_MANIFEST_SHA256 \
  --dir /srv/request-collections/received/monthly
~~~

Keep the same original URL/selection, output directory and manifest hash when resuming an interrupted online transfer. The retained-download engine owns the receiving lease, verified partial prefixes, file hashes and create-only publication. It receives `manifest.json` and every numbered `objects/NNNNNN.gcm` member in chunks of at most 65,536 bytes.

Reopen the completed encrypted bytes while the source services are stopped:

~~~sh
starforge mcp-collection-recovery-download reopen \
  --workspace monthly_source \
  --profile monthly \
  --profile-sha256 RETURNED_SOURCE_PROFILE_SHA256 \
  --request-id ORIGINAL_SNAPSHOT_UUID \
  --record-sha256 ORIGINAL_RECORD_SHA256 \
  --manifest-sha256 ENCRYPTED_MANIFEST_SHA256 \
  --dir /srv/request-collections/received/monthly
~~~

Its `COMPLETE` result verifies the received original bytes and retains `decrypted: false`, `restored: false` and `executionStarted: false`. Native verification is the next operation.

The browser's encrypted download controls are also available. Its directory picker streams large members. Where that API is unavailable, individual files up to 32 MiB can be checked in the tab. Preserve the exact directory layout and use native verification before restoration. The download engine's separate `download-state` directory is receiving metadata; SF101 reads the original manifest and encrypted members.

## 8. Restore and open on the receiving host

On the receiving host, leave the exact original state root absent or empty. Keep the receiver journal and encrypted bundle outside that root. Select the same original required runtime/module paths and provide the passphrase in the receiving listener's environment.

In Applications, select **Receive an encrypted original workspace**. The **Private collection workspace** field now selects the separate receiver journal; leave **Original buyer inbox** empty. Follow the normal review/save/start controls. Applications binds the ready announcement to that receiver and exposes its actual private URL.

The direct equivalent is:

~~~sh
umask 077
starforge buyer-collections-workspace \
  --receiving-directory /srv/request-collections/receiving-journal \
  --approval-mode browser \
  --startup-format json \
  --port 0 \
  > /srv/request-collections/control/receiving-launch.json
~~~

Keep this original listener running. Initialize a new standalone receiving MCP host and register the generated receiving description:

~~~sh
starforge mcp-collection-receiver init \
  --dir /srv/request-collections/control/receiving-mcp

starforge mcp-collection-receiver register \
  --dir /srv/request-collections/control/receiving-mcp \
  --description /srv/request-collections/control/monthly-config/receiving-recovery-registration.json

starforge mcp-collection-receiver call \
  --dir /srv/request-collections/control/receiving-mcp \
  --input /srv/request-collections/control/monthly-config/receiving-profiles.call.json
~~~

Read this receiving profile's actual SHA-256. It differs from the capture profile because it selects the received bundle, allowed kinds and `afterRestore` registration.

When using an MCP client or the result-download CLI, start this receiving MCP endpoint in its own terminal with the existing protected MCP access configuration:

~~~sh
starforge mcp-collection-receiver serve \
  --dir /srv/request-collections/control/receiving-mcp \
  --port 0
~~~

Keep its announced URL for the restored collection's agent calls and customer-file downloads. Host-local `call --input` can operate the same registrations without starting this HTTP listener.

Start `VERIFY` with one new verification UUID, the receiving profile/hash and the selected original record hash:

~~~json
{
  "action": "collection-recovery",
  "recoveryWorkspace": "monthly_receiver",
  "recoveryOperation": "start",
  "recoveryRequest": {
    "profile": "monthly",
    "expectedProfileSha256": "RETURNED_RECEIVING_PROFILE_SHA256",
    "requestId": "ORIGINAL_VERIFICATION_UUID",
    "kind": "VERIFY",
    "expectedRecordSha256": "ORIGINAL_RECORD_SHA256"
  }
}
~~~

Inspect that UUID until the original journal confirms successful verification. Then start a separate `RESTORE` operation bound to that completed verification in the same receiving profile and journal:

~~~json
{
  "action": "collection-recovery",
  "recoveryWorkspace": "monthly_receiver",
  "recoveryOperation": "start",
  "recoveryRequest": {
    "profile": "monthly",
    "expectedProfileSha256": "RETURNED_RECEIVING_PROFILE_SHA256",
    "requestId": "ORIGINAL_RESTORE_UUID",
    "kind": "RESTORE",
    "expectedRecordSha256": "ORIGINAL_RECORD_SHA256",
    "verifiedRequestId": "ORIGINAL_VERIFICATION_UUID"
  }
}
~~~

The target check belongs to the original restore engine. A populated target is refused; retain that existing state and select the correct receiving host or resolve its ownership through the original procedure. Changing the profile does not authorize an overwrite or relocation.

After a successful restore, use **Open restored collections** in the browser, or the original MCP action:

~~~json
{
  "action": "collection-recovery",
  "recoveryWorkspace": "monthly_receiver",
  "recoveryOperation": "open",
  "recoveryRequest": {
    "profile": "monthly",
    "expectedProfileSha256": "RETURNED_RECEIVING_PROFILE_SHA256",
    "requestId": "ORIGINAL_RESTORE_UUID",
    "expectedRecordSha256": "ORIGINAL_RECORD_SHA256"
  }
}
~~~

The adapter checks the restored header, inbox and collection manifests against the original record, then retains the actual current private connection. With the example profile it registers `monthly_restored` using the explicit original request and buyer paths.

Inspect Open's returned registration result as well as `opened`. If Open succeeds but registration reports a separate failure, correct that concrete host binding and retry the same Open. Restoration and queued requests are not repeated.

The host-only command below identifies the retained private connection file without printing its token:

~~~sh
starforge mcp-collection-receiver opened \
  --dir /srv/request-collections/control/receiving-mcp \
  --name monthly_receiver \
  --request-id ORIGINAL_RESTORE_UUID
~~~

Use the existing `collections` action with `collectionWorkspace: "monthly_restored"` to inspect the same original collection ID and manifest. Review its queued, cancelled, attempted and recovered entries and saved response hashes. Execute remaining requests only through the ordinary explicit collection run and payment-review workflow.

Stopping the receiving application drains its owned work. Reopening the same receiving application restores its journal view; select the completed original restore and Open the same collection. The saved receiving application does not silently become a new normal-source configuration.

## 9. Receive the customer result files

For a customer index, **Export results** retains:

| File | Contents |
| --- | --- |
| `collection.json` | Original manifest and request bindings |
| `results.json` | Complete original queue outcomes, recovery records and run history |
| `requests.csv` | Exact request, spending and delivery rows |
| `review.html` | Offline readable review |
| `manifest.json` | Original member lengths and hashes |

The ordinary MCP `collections` action uses an explicit stable 32-character lowercase hexadecimal `exportId`. Keep it after a lost reply. A deliberate later snapshot uses a new export ID.

The installed result receiver uses these original identities:

~~~sh
starforge mcp-collections-download inspect \
  --url ORIGINAL_MCP_URL \
  --workspace monthly_restored \
  --id monthly-customer-handoff \
  --collection-sha256 COLLECTION_MANIFEST_SHA256 \
  --export-id ORIGINAL_EXPORT_HEX32

starforge mcp-collections-download download \
  --url ORIGINAL_MCP_URL \
  --workspace monthly_restored \
  --id monthly-customer-handoff \
  --collection-sha256 COLLECTION_MANIFEST_SHA256 \
  --export-id ORIGINAL_EXPORT_HEX32 \
  --manifest-sha256 RESULT_EXPORT_MANIFEST_SHA256 \
  --dir /srv/request-collections/customer-handoffs/monthly
~~~

Use `reopen` with the same selection, manifest and directory, omitting `--url`, to inspect all five files offline after the source services stop. The receiver's default token variable is `MCP_ACCESS_TOKEN`.

A saved purchased response has its own byte count and SHA-256. Use **Download response** on the original request, or the original `response-file` collection operation with `expectedResponseSha256`. Its verified byte ranges read the existing saved file without another merchant request. A missing original response remains missing; a result index or restored reference does not create its body.

## 10. MCP, SDK and identity reference

All collection and recovery agent calls use `sf43_discover_review_and_pay`:

| Action | Selection | Common operations |
| --- | --- | --- |
| `collections` | `collectionWorkspace`, `collectionOperation`, `collectionRequest` | `preview`, `create`, `inspect`, `enqueue`, `run`, `run-status`, `pause`, `approval`, `cancel`, `recover`, `export`, `export-file`, `response-file` |
| `collection-recovery` | `recoveryWorkspace`, `recoveryOperation`, `recoveryRequest` | `profiles`, `review`, `start`, `inspect`, `cancel`, `resume`, `open`, `files`, `file` |

List operations expose their own offsets. Follow returned next offsets instead of treating a first page as the full collection or backup. Paths, new source definitions and passphrase values belong to host configuration; the model-facing recovery calls accept only registered aliases and original IDs/hashes.

Keep the different identities distinct:

| Identity | What it binds |
| --- | --- |
| Preview SHA / browser review ID | The reviewed source requests before collection creation |
| Collection `manifestSha256` | The retained original collection membership and inputs |
| Run UUID | One exact selected execution and workspace mapping |
| Recovery profile SHA | Exact host-selected profile bytes |
| Recovery review SHA | The original capture selection |
| Snapshot / verification / restore UUID | One operation in the original recovery journal |
| Recovery record SHA | The original encrypted application/state record |
| Encrypted manifest SHA | Exact encrypted `manifest.json` bytes |
| Result export ID and manifest SHA | One five-file customer result snapshot |
| Response SHA | One original saved purchased response |

The installed SDK exports are:

~~~js
import {
  initializeCollectionReceiver,
  openCollectionReceiver,
  startCollectionReceiver
} from '@tokenjunkielabs/starforge-merchant/buyer/mcp/collection-receiver';

import {
  inspectNativeCollectionRecovery,
  downloadNativeCollectionRecovery,
  reopenNativeCollectionRecovery
} from '@tokenjunkielabs/starforge-merchant/buyer/mcp/collection-recovery-download';
~~~

`openCollectionReceiver(directory)` opens its existing manifest and provides `registerRecovery`, `registerCollections`, `call`, `openedConnection` and `close`. `startCollectionReceiver` additionally owns its MCP HTTP listener and authenticator; the original collection listener remains separately owned.

The encrypted receiver SDK's selection keys are `recoveryWorkspace`, `profile`, `profileSha256`, `requestId` and `recordSha256`. Downloads and offline reopening add `directory` and `expectedManifestSha256`. Online calls select the original `url` and `tokenEnv` or one existing client. For example, using actual retained values:

~~~js
const received = await downloadNativeCollectionRecovery({
  url: originalMcpUrl,
  tokenEnv: 'MCP_ACCESS_TOKEN',
  recoveryWorkspace: 'monthly_source',
  profile: 'monthly',
  profileSha256: retainedSourceProfileSha256,
  requestId: retainedSnapshotUuid,
  recordSha256: retainedRecordSha256,
  expectedManifestSha256: retainedEncryptedManifestSha256,
  directory: receivedBundleDirectory,
  signal
});
~~~

The variables in that snippet come from the operator's actual selection and retained responses. The SDK uses the same download directory, checkpoints and native files as the installed CLI.

## Continue after an interruption

| Observation | Next action on the same original work |
| --- | --- |
| Lost reply after starting a collection run | Inspect the saved run UUID and original inbox; retain its original selection |
| Lost reply after recovery start | Inspect that recovery UUID before an explicit same-ID resume |
| `LIVE_STATE_UNOBSERVED` | Reconnect the original listener and inspect; this is an unavailable live observation |
| Interrupted encrypted download | Repeat the exact download selection and directory |
| Completed encrypted download | Offline reopen for byte verification, then native VERIFY on the receiver |
| Definitive failed or cancelled recovery result | Keep that result; after correcting its cause, choose a new explicit operation |
| Successful restore, failed collection registration | Retry the same Open after correcting its stated host binding |
| Original target occupied | Preserve it; restoration does not overwrite it |
| Collection `FINISHED` with a missing response | Read the individual original outcome and saved-file evidence |
| MCP host closed while the original recovery listener remains | Reopen MCP and inspect the same operation; host shutdown did not replay or cancel it |

The setup example and this guide add operator configuration and navigation. The native release already supplies request execution, encryption, verification, restoration, receiving and lifecycle ownership. There is no alternate queue, restore script or example purchase to run before using existing work.

## Original source guides

- [Normal collection browser and private API](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/collections/WORKSPACE.md)
- [Collection controller, exact caps and original request lifecycle](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/collections/README.md)
- [Complete SF88/SF101 recovery and direct CLI](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/collections/RECOVERY.md)
- [Normal and receiving Applications modes](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/COLLECTIONS_APPLICATIONS.md)
- [Collection agent and original result receiving](../../stellar-forge/mcp-paid-agent/COLLECTIONS.md)
- [Recovery profiles, standalone MCP host and encrypted SDK](../../stellar-forge/mcp-paid-agent/COLLECTION_RECOVERY.md)
- [Exact recovery input schema](../../stellar-forge/mcp-paid-agent/native-collections-recovery-schema.mjs)

The guide and example configuration were composed against feature source `37917333f458de701329ead8662dfd11bfeb3464` and the recipient's existing Applications and distribution interfaces. Original source/runtime receipts retain their own identities; generating configuration is not a new native execution result.
