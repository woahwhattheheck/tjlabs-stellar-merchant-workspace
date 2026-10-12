# Complete video receiving in x402engine MCP

This integration adds paid video creation, retained receiving, recovery, offline
exports and the existing browser operator to the published x402engine MCP server.
It uses that server's original payment fetch and configuration. Its two original
host changes are the registration hook in src/index.ts and packaging/runtime
entries in package.json.

The selected upstream is x402engine-mcp 1.1.1 at
[dd1c2745](https://github.com/agentc22/x402engine-mcp/tree/dd1c2745ea5d7d2331a0e18990cc43195780f0ca).
The installer verifies the complete original index, payment implementation,
CLI, package metadata and TypeScript configuration before integration.
It packages the exact receiving source and browser assets alongside the existing
MCP server, so the existing npm command and server factory both gain the tools.

## Install into the original source

Use a Linux checkout of the exact upstream source with Node 22.16 or later,
util-linux flock and tar. The installer records the Node requirement in the
resulting package. It keeps the original payment implementation, existing tools,
TypeScript settings and dependencies.

From the maintained receiving source:

~~~sh
node stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving/install-mcp.mjs \
  --directory /absolute/x402engine-mcp-checkout
~~~

The installed Starforge distribution exposes the same operation as
starforge x402-video-install-mcp --directory /absolute/x402engine-mcp-checkout.

The installer writes the complete source under vendor/tjlabs-video, adds its
import and registration immediately after the original MCP server construction,
and includes the vendor directory in npm packaging. Its installation.json binds
the original inputs, every runtime source file and both resulting host files
with full hashes. Running it again accepts those same original or installed
postimages and completes that same integration.

Build the original package in that checkout using its existing dependency setup:

~~~sh
npm ci --ignore-scripts
npm run build
node dist/cli.js
~~~

The original x402engine-mcp command starts this server. Packaging also exposes
x402engine-video for the receiving CLI described in README.md. The browser assets,
complete receiving modules and TypeScript declarations are included in the
vendor directory.

For an already configured server, keep the original wallet variables,
X402_PAYMENT_NETWORK, X402_PAYMENT_HEADER, X402_DEV_BYPASS and X402_BASE_URL.
X402_VIDEO_DIRECTORY selects the private persistent receiving directory; its
default is the video directory within the user's x402engine configuration.
Choose a volume with room for complete media, retained attempts and exports.

## Payment behavior

The registration passes the original getRequestFetch closure to the video
workspace. That closure still resolves the original createPaymentFetch from
src/payment.ts and shares the server's existing lazy fetch instance with the
other tools. The new modules never parse a wallet key, choose a replacement
signer, change a payment requirement or raise a spending limit.

The original package's default X402_MAX_PAYMENT_USD is 1.00. Its published
selector admits exact USDC payments on its configured Base/Solana networks
only when the offered amount is at or below that cap.
The [provider documentation](https://x402engine.app/docs/) and
[machine-readable guide](https://x402engine.app/llms.txt) give the video service
prices and supported requests. Select the desired cap in the existing server
configuration before creating a video; the integration uses that selection
as supplied. The documented video services currently exceed the original
one-dollar default.

A creation operation invokes the original payment fetch once. Its existing
x402 challenge and payment handshake remain inside that implementation.
The complete final HTTP response and its original headers are retained.
The receiving path performs ordinary unpaid GETs to the issued status and
video URLs. A follow-up HTTP 402 becomes a receiving error and preserves
the original response.

## One video from creation to complete handover

Call generate_video with an operation_key, a model of seedance-2.5 or
minimax-h3, and the prompt. The provider contract accepts at most 2,000 UTF-8
prompt bytes. Reuse that operation_key for the whole original job.

~~~json
{
  "operation_key": "product-walkthrough-20261012",
  "model": "minimax-h3",
  "prompt": "A slow, steady shot of a clean industrial machine operating in a bright workshop."
}
~~~

A normal HTTP 202 response is saved in full before the receiving job opens.
The returned operation includes the local identity, selected model, creation
status, response byte length and digest, and current receiving state.
Provider-issued capability URLs remain in the private saved documents.

Call receive_video with that operation_key to wait for the original job and
receive its complete media:

~~~json
{
  "operation_key": "product-walkthrough-20261012",
  "deadline_ms": 1800000,
  "output": "/absolute/delivery/product-walkthrough.mp4"
}
~~~

The result gives the actual complete local path, byte length, content type
and SHA-256. The optional output copy is create-only. Reopening the original
operation reuses the completed result after verification.

Call export_video_workspace with the same key and a new absolute destination.
It exports the complete request, final creation response, original acceptance,
every status response, interrupted receiving attempts and full video.
open_video_workspace verifies every manifest entry in a transferred export.
The reopened MCP result includes the complete verified local media path. A completed local video remains usable offline.

## Tool surface

| Tool | Purpose | External operation |
| --- | --- | --- |
| generate_video | Create or reopen one original paid video operation | Original payment fetch on the first dispatch |
| list_video_jobs | Page through retained operations | Local read |
| video_status | Inspect and optionally refresh original status | One unpaid status GET when due |
| receive_video | Wait for and save the full video | Unpaid status and media GETs |
| video_result | Verify and identify the completed local file | Local read |
| recover_video_acceptance | Attach the recovered original accepted document | Local recovery |
| export_video_workspace | Export the entire operation and media | Local read and write |
| open_video_workspace | Verify a complete transferred workspace | Local read |
| open_video_operator | Start the existing local browser workspace | Local server; its controls continue the original receiving job |

The x402engine://video-jobs resource returns the first page with an explicit
nextCursor and complete field. Use list_video_jobs with each returned cursor
until complete is true. The list is stable by operation identity; each page
contains at most the selected limit.

video_status refreshes by default. Set refresh to false for a local inspection.
Status polling retains the provider's five-second minimum interval through
server restarts. receive_video accepts a wait deadline up to 24 hours.
The provider documents a 24-hour lifetime for the original status URL.

## Restart and recovery

The source-bound operation directory is selected by a SHA-256 digest of its
stable key. Its immutable request includes the model, original prompt body,
gateway and request digest. Reusing a key with different input fails before
another payment fetch invocation.

Each local preparation has its own retained directory and response reservation. A process that stops before dispatch can prepare a new local generation while retaining the abandoned generation and its full diagnostic history. Before calling the original payment fetch, the operation persists dispatch.json, bound to the selected preparation and response path.
The provider has not documented an idempotency key for video creation, so a
dispatch without a complete response is treated as an uncertain original
creation. Repeating generate_video then returns that saved state.

If the full response file was already published and the process stopped before
the receiving state was registered, video_status with refresh enabled adopts
the original bytes and completes the registration. It does not issue another
creation request.

If the original accepting response was recovered from the original call's logs
or delivery file, use recover_video_acceptance with its full local JSON document
and original source reference:

~~~json
{
  "operation_key": "product-walkthrough-20261012",
  "acceptance_file": "/absolute/original-call/accepted-response.json",
  "source_reference": "Original request log entry and retained response path"
}
~~~

The recovery records the document's exact bytes, digest and provenance in the
same operation. It then opens the original issued status URL. It preserves
the original dispatch and response history.

During media receiving, the existing SF31 writer publishes a result only after
the complete body has been received, synced, closed and hashed. It retains an
interrupted partial and the original issued URL. A later receiver adopts an
already completed body or resumes through that same original job.

The private mcp-creation directory retains complete preparation or request
exceptions, including their cause chains. MCP error results contain stable
codes and the operation identity. Native status and local file inspection
provide the detailed operational context.

## Browser and lifecycle

open_video_operator returns the private local URL for this same job. Open it
for status, receiving, pause, playback, full file download and complete archive
export. It uses the existing clean desktop/mobile interface and independent
HttpOnly sessions.

For a transferred handover, supply export_directory instead of operation_key to open_video_operator. It verifies and opens the exported workspace directly. Repeated calls for the same source directory reuse that operator. Closing the MCP
transport cancels active receiving calls and closes the operators while retaining
the original filesystem state. The next server process can reopen those jobs
using X402_VIDEO_DIRECTORY.

## Existing host registration and JavaScript use

The installer adds this registration to the original server factory:

~~~ts
registerX402VideoTools(server, {
  z,
  getRequestFetch,
  baseUrl: BASE_URL,
  paymentHeader: PAYMENT_HEADER,
  devBypass: DEV_BYPASS,
  paymentContext: {
    network: process.env.X402_PAYMENT_NETWORK || "auto",
    maxPaymentUsd: process.env.X402_MAX_PAYMENT_USD || "1.00"
  }
});
~~~

Applications with an existing payment implementation can open the same complete
operation workspace directly:

~~~js
import { openX402VideoMcpWorkspace } from
  '@tokenjunkielabs/starforge-merchant/buyer/x402engine-video/mcp-workspace';

const videos = await openX402VideoMcpWorkspace({
  directory: '/private/persistent/video',
  getRequestFetch: originalGetRequestFetch
});
await videos.create({
  operationKey: 'product-walkthrough-20261012',
  model: 'minimax-h3',
  prompt: 'A steady view of the operating workshop.'
});
const { result } = await videos.receive('product-walkthrough-20261012');
~~~

The returned VerifiedFile supports full verification, create-only copying and
streaming through the original SF88 methods. Transport and receivingFetch
options let an authorized deployment use its existing public HTTPS route for
the unpaid receiving requests.

## Receiving the integration

native-mcp.mjs runs the exact installer, original package build and MCP protocol
tools, then takes a documented local video contract through creation, same-key
reopening, uncertain-call recovery, full receiving and portable reopening.
It exercises the original package's payment selector without a funded wallet
and retains the full result report and source identities. The maintained
native-receiving.mjs remains the detailed browser and media transport journey.

The installer can resume after a complete atomic write was interrupted before publication. It recognizes only private temporary files whose full bytes match an expected installation file, retains them locally, and excludes temporary writes and delivery locks from the npm package.
