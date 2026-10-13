# Collections customer packages for MCP agents

This component makes the existing Request Collections customer package available to a registered MCP agent. The sender selects existing Inbox outputs and the complete installed source tree. The customer receives every selected response, the fixed offline review, and that source in one original NDJSON package.

The two host roles are explicit. A sender registration points at an already running original Collections listener and its complete approved source manifest. A recipient registration points at an already running original receiving listener. Remote callers use those names. They cannot supply arbitrary host paths, tokens, a different source tree, or a new buyer command.

The original buyer still owns purchase approval, execution, settlement and recovery. This component does not start a Collection, retry a paid request, make a quote, create a wallet, or turn a missing output into a completed result. Incomplete packages require the caller's explicit original allowIncomplete choice; the complete receiving programme requires every selected response.

## What the customer gets

The original package contains each complete selected response under its fixed response path, original job/configuration/source-record identities, the exact captured observation, complete source, a JSON review, and an inert offline HTML review. The original reader validates the declared member population, lengths, SHA256 values and final completion frame. It preserves the original observations rather than inferring payment or settlement from a successful download.

The agent download adds a small manifest for that whole package. Its SHA256 is the review identity used by the durable transport. It is distinct from both the package byte SHA256 and the package's internal manifest SHA256:

| Identity | Meaning |
| --- | --- |
| previewSha256 | Exact saved original output/source selection before preparation |
| files.manifest.sha256 | Small MCP download manifest; pass this to the download command |
| package.sha256 | Every byte of the original complete NDJSON package |
| package.manifestSha256 | Original package member/source/response inventory |
| member.sha256 | Every byte of one original response, review or source member |

The original package filename is retained in its descriptor. The local durable downloader consistently stores it as customer-delivery.ndjson.

## Register the original hosts

Use the existing native workspace, or the existing standalone Collections MCP receiver. The standalone receiver exposes Collections, recovery and customer delivery without a Bazaar wallet or generic payment action.

First launch the original sender or recipient through its maintained Collections command or Applications entry. Keep the resulting private launch record. The record includes the original loopback URL and operator token, directory, queue or receiving selection, approval mode and process identity. Do not put that record into a customer package.

For a sender, create a private registration JSON:

~~~json
{
  "name": "monthly_sender",
  "connectionFile": "/private/operator/sender-launch.json",
  "sourceRoot": "/installed/merchant/source-selection",
  "sourceManifest": "/private/operator/customer-source.json"
}
~~~

Use the existing buyer-customer-delivery source-manifest command to create that complete manifest outside the source tree. The source selection may be the original repository-shaped tree or the actual installed package containing source/. It must include the executing native adapter and all actual source leaves. Dependencies under node_modules and repository metadata are omitted by the original source inventory; credentials and symlinked leaves are rejected. Source, queue, recipient and private MCP directories must remain disjoint.

A recipient registration contains only the existing connection record:

~~~json
{
  "name": "customer_recipient",
  "connectionFile": "/private/customer/recipient-launch.json"
}
~~~

Register through the existing host:

~~~sh
node stellar-forge/mcp-paid-agent/native-workspace-cli.mjs collection-delivery-register --dir /private/native-workspace --description /private/operator/sender-registration.json
~~~

Or use the standalone original Collections receiver:

~~~sh
node stellar-forge/mcp-paid-agent/native-collections-receiver-cli.mjs init --dir /private/collections-agent
node stellar-forge/mcp-paid-agent/native-collections-receiver-cli.mjs collection-delivery-register --dir /private/collections-agent --description /private/operator/sender-registration.json
node stellar-forge/mcp-paid-agent/native-collections-receiver-cli.mjs collection-delivery-register --dir /private/collections-agent --description /private/customer/recipient-registration.json
node stellar-forge/mcp-paid-agent/native-collections-receiver-cli.mjs serve --dir /private/collections-agent --port 8794
~~~

Use the existing MCP_ACCESS_TOKEN environment binding or original MCP_OAUTH_CONFIG on the host. Never copy a credential into a registration description, source manifest, request body or result. Network clients use a bearer-token environment variable, default MCP_ACCESS_TOKEN. The host supports its maintained authorization configuration; the provided command-line file client uses its original bearer transport.

Registration borrows the listener. Closing MCP closes only its own requests and HTTP listener. It does not stop the original Collections/receiving listener or cancel its jobs. If the operator restarts an original listener, update its original connection record through the maintained owner, keeping the exact registered directory/queue/approval selection. The next live operation reopens and validates that record.

## Select and review a package

The original sf43_discover_review_and_pay tool now accepts action collection-delivery. The action name of this existing tool does not make the delivery operations payment requests.

A complete preview request is:

~~~json
{
  "id": "customer-monthly-2026-10",
  "collectionId": "monthly-customer-handoff",
  "expectedManifestSha256": "REPLACE_WITH_ORIGINAL_COLLECTION_SHA256",
  "title": "October customer outputs",
  "note": "Complete original responses for the reviewed customer period.",
  "intentIds": ["ORIGINAL_INTENT_ID"],
  "maxVerifyBytes": 1073741824,
  "allowIncomplete": false
}
~~~

Use only IDs obtained from the actual original Collection. The example is a template, not a statement that a particular customer job exists. Prices, source periods and settlement observations remain those of the original job.

Save preview.json privately, then run the installed command or source entry:

~~~sh
node stellar-forge/mcp-paid-agent/native-collection-delivery-cli.mjs preview --url http://127.0.0.1:8794/mcp --workspace monthly_sender --input /private/operator/preview.json --state /private/operator/preview-operation
~~~

The local operation retains the exact body and original endpoint before sending. Read the complete returned preview, including output availability and complete source selection. A repeated preview with the same delivery ID returns that exact retained preview; it does not silently select later job observations.

Create reviewed-prepare.json from that identical body, adding only expectedPreviewSha256 from the saved preview:

~~~sh
node stellar-forge/mcp-paid-agent/native-collection-delivery-cli.mjs prepare --url http://127.0.0.1:8794/mcp --workspace monthly_sender --input /private/operator/reviewed-prepare.json --state /private/operator/prepare-operation
~~~

After a timeout or lost reply, rerun the same command and state directory. Never generate a replacement ID merely because the response was lost. The original package writer resumes the same saved capture and selected complete source. Different input for an existing ID is a conflict.

The host chooses sourceRoot and sourceManifest. Neither field is accepted from the remote caller. Sanitized result metadata removes those host paths while retaining complete source identities.

## Download every byte and reopen offline

Inspect the small download manifest:

~~~sh
node stellar-forge/mcp-paid-agent/native-collection-delivery-cli.mjs inspect --url http://127.0.0.1:8794/mcp --workspace monthly_sender --id customer-monthly-2026-10
~~~

Review its manifestSha256 and package descriptor. Download through the original retained-file transport:

~~~sh
node stellar-forge/mcp-paid-agent/native-collection-delivery-cli.mjs download --url http://127.0.0.1:8794/mcp --workspace monthly_sender --id customer-monthly-2026-10 --manifest-sha256 REVIEWED_SMALL_MANIFEST_SHA256 --directory /private/customer/download
~~~

The typed download option chunkSize must be an integer from 1 through 65,536; larger values are rejected before connecting. The transport saves exact verified prefixes and its original checkpoint. Repeat that command to resume. It rechecks the original endpoint/alias, selected manifest, prefix and complete final hash; it never substitutes a new current export. A changed endpoint or alias is a different transport selection and must not overwrite the retained operation.

After completion, reopen without a listener or token:

~~~sh
node stellar-forge/mcp-paid-agent/native-collection-delivery-cli.mjs reopen --workspace monthly_sender --id customer-monthly-2026-10 --manifest-sha256 REVIEWED_SMALL_MANIFEST_SHA256 --directory /private/customer/download
~~~

The adapter runs the original full package inspector after transport completion and again on offline reopen. A valid small manifest alone is not evidence of a complete customer package.

## Upload, explicitly receive, and read original members

Upload to the operator-registered recipient:

~~~sh
node stellar-forge/mcp-paid-agent/native-collection-delivery-cli.mjs upload --url http://127.0.0.1:8794/mcp --workspace customer_recipient --file /private/customer/download/customer-delivery.ndjson --sha256 ORIGINAL_PACKAGE_SHA256 --filename customer-monthly-2026-10.ndjson --state /private/customer/upload-operation
~~~

This retains the closed local file identity and uses the original recipient's committed contiguous offset. Each chunk is at most 65,536 bytes and has its own digest. Updated registered hosts advertise `uploadBatchChunks` in status and upload responses. The standalone Collections MCP receiver explicitly enables two contiguous chunks per call within its declared 256 KiB ingress limit. The generic native workspace and older hosts retain one chunk; both now use compact recipient progress when available. Older retained responses without a capability field also use the original single-chunk route. Both modes use the same saved upload intent, file, filename, package digest and committed offsets.

The MCP batch is deliberately limited by both the original recipient and its registered MCP host. The adapter defaults to one chunk. Only a host that declares the two-part allowance enables two chunks, as the standalone receiver does with its existing 256 KiB ingress limit. A complete two-part JSON request fits that limit including the MCP envelope. The original HTTP recipient may advertise a larger browser batch; that does not enlarge the MCP transport limit. Raw callers can use `upload-chunks` with `{sha256, chunks:[{offset, base64, chunkSha256}, ...]}`, with at most two entries and the advertised recipient limit. Every member and contiguous offset is validated before forwarding the batch.

The adapter requests compact progress from the original recipient, avoiding a growing list of prior parts in each response. The original offset-named part files, metadata, private-directory checks and kernel lease remain authoritative. Explicit upload-status inspection and cold receiving verify retained bytes; final upload-finish verifies every part and the complete sender digest.

After a lost reply or interrupted batch, rerun the identical upload command with the same state directory. Upload-start obtains the original recipient's committed contiguous offset, which may include only a durable prefix of the last batch. The client resumes there from the same held, hash-verified local file; it does not allocate a replacement upload or guess which parts were accepted. Exact committed chunk replays read the saved bytes. A changed file, filename, package digest or existing intent is rejected.

Sealing an upload does not receive it. Receive deliberately:

~~~sh
node stellar-forge/mcp-paid-agent/native-collection-delivery-cli.mjs receive --url http://127.0.0.1:8794/mcp --workspace customer_recipient --sha256 ORIGINAL_PACKAGE_SHA256 --state /private/customer/receive-operation
~~~

The original receiver publishes only after validating every original member, fixed review and source inventory. Repeat the same request after uncertainty. Source remains inert.

For independent local receiving, no MCP host is required:

~~~sh
node stellar-forge/mcp-paid-agent/native-collection-delivery-cli.mjs receive-local --file /private/customer/download/customer-delivery.ndjson --sha256 ORIGINAL_PACKAGE_SHA256 --directory /private/independent/customer-delivery
~~~

The native received operation pages all original files. received-file accepts only a member of that retained manifest, its original path and expected digest. result-file reads the full sanitized original sender result; manifest-file and package-file read the complete sender files. All use the maintained saved-file verifier with at most 65,536 returned bytes. Request every range through nextByteOffset until null; a first chunk is not a complete file.

After the original HTTP listener closes, the MCP host can still inspect its previously retained completed sender result and read those closed files. Likewise it can reopen a previously retained recipient inventory and its member files. New previews, preparation, uploads and first-time receiving still require the original listener.

## Typed client

The adjacent .d.mts declarations cover request/response mappings. The client calls the existing MCP tool and validates its native envelope.

The typed delivery client captures its registered workspace alias when the connection opens. The retained-request helper snapshots the complete canonical intent before its first asynchronous operation, writes those exact original bytes, and dispatches a separate copy of the retained body. Later edits to the caller’s options or request object cannot select another workspace or replace the saved original request. Retried requests retain the same original canonical identity.

~~~js
import {
  openNativeCollectionDeliveryClient,
  retainNativeCustomerRequest
} from './stellar-forge/mcp-paid-agent/native-collection-delivery-client.mjs';
import {
  inspectNativeCustomerPackage,
  downloadNativeCustomerPackage
} from './stellar-forge/mcp-paid-agent/native-collection-delivery-download.mjs';

const connection = {
  url: process.env.CUSTOMER_MCP_URL,
  deliveryWorkspace: 'monthly_sender',
  tokenEnv: 'MCP_ACCESS_TOKEN'
};
const client = await openNativeCollectionDeliveryClient(connection);
const prepared = await retainNativeCustomerRequest({
  client,
  directory: '/private/operator/prepare-operation',
  operation: 'prepare',
  body: reviewedOriginalRequest
});
const inspected = await inspectNativeCustomerPackage({
  ...connection, id: prepared.value.id
});
// The caller reviews inspected.manifest and retains inspected.manifestSha256.
const result = await downloadNativeCustomerPackage({
  ...connection,
  id: prepared.value.id,
  expectedManifestSha256: reviewedSmallManifestSha256,
  directory: '/private/customer/download'
});
~~~

The raw read CLI permits only read operations. Mutating CLI commands retain their exact original selection before dispatch. Low-level client.call is available for an application's already-owned journal; its caller must preserve the same ID/body and committed offsets.

## Complete original receiving programme

native-collection-delivery-receiving.mjs exports receiveNativeCustomerDelivery and receiveCollectionsCustomerProgramme. They consume the existing owner's actual Collections object, queue, complete selected source and original completed intent IDs.

receiveCollectionsCustomerProgramme first invokes the existing browser customer-delivery programme with its actual supplied Playwright and Chromium. It then invokes the complete native MCP journey, serially. The native journey owns only its temporary original sender/recipient listeners and one original MCP receiver, while the caller keeps the existing Collections/queue ownership.

~~~js
const result = await receiveCollectionsCustomerProgramme({
  directory: originalOperationDirectory,
  collections: originalCollections,
  sourceRoot: actualCompleteInstalledSource,
  sourceManifest: exactSourceManifestOutsideSource,
  collectionId: originalCollectionId,
  intentIds: originalCompleteOutputIntentIds,
  playwright: originalPlaywright,
  chromium: observedChromiumExecutable,
  onProgress: originalProgressRecorder
});
~~~

The native sequence retains credentials privately before use, binds all executing source, persists the original request, obtains and reviews the original preview, prepares the same package, retains a real interrupted download prefix and resumes it, retains an original upload offset and its actual batch progress, then resumes the same upload, explicitly receives the full archive, enumerates every original member, downloads a complete original response, and performs independent local receiving. It then closes both original borrowed listeners, reopens only MCP, and verifies retained metadata/member access. Its final result is saved only after all owners close.

The programme saves the full NDJSON package, complete remote result, full recipient inventory, original response and receiving evidence in its files directory. Result descriptors bind every file by bytes and SHA256. Reopening a completed programme verifies those files and the whole package rather than rerunning preparation or a purchase.

Native execution has not yet been claimed for this addition. The existing owner's actual complete output selection, source edition and admitted runtime must be used for its one original receiving continuation.
