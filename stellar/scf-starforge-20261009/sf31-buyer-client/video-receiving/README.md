# Receive an existing x402engine video job

This workspace takes an already accepted x402engine asynchronous video job through
complete local receiving, interruption recovery, browser playback, downloads and
portable handover. It keeps the original accepted document, every received status
response and the complete video in one private directory.

The installed command is `starforge x402-video`. The maintained source command is:

~~~sh
node stellar/scf-starforge-20261009/sf31-buyer-client/video-receiving/cli.mjs help
~~~

Use Linux, Node 22.16 or later, util-linux `flock`, and `tar` for browser archive
downloads. The receiving path uses the maintained SF31 response-file writer,
public HTTPS transport, SF88 verified-file interface and SF98 delivery lease.
The new command has no extra package dependencies.

## Start from the accepted response

x402engine's [official video documentation](https://x402engine.app/docs/) describes
`/api/video/seedance-2.5` and `/api/video/minimax-h3` as asynchronous POST
operations. A successful submission returns HTTP 202 and a private `status_url`.
Keep that full response when the original paid request finishes. The provider
documents status polling every five seconds, an uncharged GET to that URL, and
a completed response containing `status: "completed"` and `video.url`.
The issued status URL is documented to remain available for 24 hours.
The [machine-readable guide](https://x402engine.app/llms.txt) carries the current
provider contract.

Retain the complete original accepted JSON response in a private ordinary file.
Use an absolute private parent on a volume with room for the video and exports:

~~~sh
install -d -m 700 /private/video-jobs /private/video-exports
starforge x402-video retain \
  --directory /private/video-jobs/job-01 \
  --acceptance-file /private/original-accepted-response.json
starforge x402-video receive --directory /private/video-jobs/job-01 \
  --output /private/video-exports/received-video.mp4
starforge x402-video inspect --directory /private/video-jobs/job-01
~~~

The default complete-video limit is 256 MiB. Select a different positive byte
limit during `retain` with `--max-video-bytes`. Receiving waits up to 30 minutes;
`receive --deadline-ms` accepts a positive value up to 24 hours. Reopening the
same directory preserves the original acceptance, status cadence and delivery.

A saved document records its original file provenance. Applications with an
original SF88 HTTP 202 `BuyerResult` can retain that complete native record:

~~~js
import { retainX402VideoJob } from
  '@tokenjunkielabs/starforge-merchant/buyer/x402engine-video';

const job = await retainX402VideoJob({
  directory: '/private/video-jobs/job-01',
  result: originalAcceptedBuyerResult
});
const video = await job.receive();
await video.saveAs('/private/video-exports/received-video.mp4');
~~~

The adapter does not create the paid video request. The original wallet,
network, quote, budget and submission stay in the caller's existing purchase
implementation. Status and video receiving use ordinary unpaid GET requests.
A follow-up HTTP 402 returns `VIDEO_FOLLOW_UP_PAYMENT_REQUESTED`; it never
authorizes another payment.

## Browser operation

~~~sh
starforge x402-video serve --directory /private/video-jobs/job-01 \
  --exports-directory /private/video-exports --port 0
~~~

Open the private local URL printed by the command. The operator listens on
loopback, converts the URL fragment to its own private HttpOnly session cookie,
then removes the fragment from the address bar. Independent operators retain
independent cookies even when both run on the same local hostname.

**Check status** records one complete provider status response when the original
five-second interval permits it. **Receive video** starts receiving in the
operator process and updates the same saved workspace. **Pause receiving**
interrupts this receiver; the original provider job continues. The completed
video supports normal browser playback and seeking, **Download video**, and
**Export workspace** followed by **Download workspace**.

The status view displays only the receiving identity, provider state, local
file metadata and operation errors. Private status URLs and issued media URLs
remain in the private workspace. All result and workspace downloads require the
operator session. Closing a download cancels its local stream and closes the
verified file; closing the server cancels its active receiving operation.

A browser refresh leaves the server's receiving operation running. Restart
`serve` against the same directory and open its new printed URL to continue.

## Interruption and recovery

A complete response is published only after the original SF31 writer has read
every byte, verified the response framing, calculated its digest, synced and
closed the file. Receiving attempts retain their original request, full response
headers and complete body, or their original partial file and failure details.

If a process stops after publishing a complete body and before publishing the
final state, the next operation adopts that same body. If only a partial body
exists, the next operation requests the same issued media URL again. The
completed local output remains create-only. A received video is reused after a
full hash check; another paid submission is unnecessary.

`poll` and `receive` reuse the original persisted five-second status interval.
The selected status origins default to x402engine's published site and gateway.
Media redirects remain on public HTTPS and are capped at five redirect hops.
HTTP 401, 403 or 410 retains the complete error response and reports access
expiry or denial. Existing completed local videos remain usable offline.

For a runtime with an approved public proxy, pass the original public-transport
profile through `--transport-file`. Its original origin restriction applies
to every selected destination, including media hosts. A caller may supply an
authorized fetch implementation to the JavaScript API when its deployment has
separate approved status and media routes.

## Complete handover and offline reopening

~~~sh
starforge x402-video export --directory /private/video-jobs/job-01 \
  --output /private/video-exports/handover-01
starforge x402-video open-export \
  --directory /private/video-exports/handover-01
~~~

The exported directory contains `export-plan.json`, `complete.json` and a
complete `workspace/` tree. It preserves the original acceptance, provenance,
status bodies, receiving attempts, partial files and completed result. Every
file has a byte length and SHA-256 entry. A repeated export to the same target
resumes only that exact saved source revision; a different source revision uses
a new target.

Move the whole exported directory to the recipient's private volume. For a
downloaded archive, extract it into a new mode-0700 directory before opening it.
`open-export` verifies the completed manifest and every file, then opens the
same workspace. For browser playback of a received handover:

~~~sh
starforge x402-video serve \
  --directory /private/received-handover/workspace \
  --exports-directory /private/recipient-exports
~~~

JavaScript applications can open the same handover and stream its result:

~~~js
import { openX402VideoExport } from
  '@tokenjunkielabs/starforge-merchant/buyer/x402engine-video';

const job = await openX402VideoExport({
  directory: '/private/received-handover'
});
const video = await job.result();
for await (const chunk of video.chunks()) {
  // Consume every chunk before committing an external side effect.
}
~~~

`bytes({ limit })`, `chunks({ signal })`, `verify()` and create-only
`saveAs(destination)` are the original SF88 verified-file operations.
Receiving and exports reject symbolic-link aliases and overlapping source and
destination trees. Keep the handover private: it includes the provider-issued
capability URLs needed to resume an unfinished original job.

## Command surface

| Command | Required inputs | Result |
| --- | --- | --- |
| `retain` | directory, acceptance-file | Original response and durable job state |
| `inspect` | directory | Safe local status |
| `poll` | directory | Complete status observation when due |
| `receive` | directory | Complete verified video; optional output copy |
| `serve` | directory | Private browser operator |
| `export` | directory, output | Complete resumable workspace handover |
| `open-export` | directory | Verified offline receiving and local status |

The source-owned `x402engine-video.json` contribution registers the original
command, API imports, browser assets and guide in the maintained distribution.
It preserves the original source layout for the existing builder and installer.

## Maintainer receiving check

`native-receiving.mjs` exercises the documented provider response contract using
a locally generated five-second video: pending/completed status, persistent
poll timing, interrupted receiving, reopening, completed-body adoption, complete
offline export, both CLI paths, independent browser sessions, real video
playback, file download and archive download. The complete native report names
its fixture and all delivered file hashes. The fixture contract check has no
purchase or provider settlement side effect.

The file writer, verified-file reader, original delivery lease, HTTP operator,
CLI and browser assets all run from the selected source bytes. Inspect its
retained report for the executed source identity and desktop/mobile results.
