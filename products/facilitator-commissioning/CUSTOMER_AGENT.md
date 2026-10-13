# Complete commissioning through the Merchant customer interface

## Purpose

This component lets an authorized customer agent operate the same complete commissioning case as the browser and native CLI: receive the original source, select one service and two independent providers, review and stage native releases, prepare every buyer request, receive actual outcomes, and hand over the continuing job.

The existing commissioning listener owns its original job and seller. The Merchant interface borrows that authenticated listener. The native SF82 release and provider SDK, SF88 buyer approval/signing, original payment records and complete receiver remain the implementation authorities. A saved buyer plan is a prepared input for the original buyer.

The same configured customer has eighteen tools, an installed command and a typed client. Their complete requests and captured files remain in the host's existing private exports directory. After process restart, the customer can recover the same original operation and deliver the same retained file without inventing another seller run or purchase.

## Install with the original application

Select the existing facilitator-commissioning contribution through the maintained distribution builder and installer. The contribution includes the full product component and declares:

- facilitator-commissioning: the original job/server/receiver command.
- facilitator-commissioning-customer: the installed customer operation and complete-file receiving command.
- ./facilitator/commissioning-customer: the typed customer client.
- ./facilitator/commissioning-customer-provider: source-owned Merchant provider metadata.

The existing Merchant registry loads the provider declaration. Its configuration key is facilitatorCommissioningConnection. Discovery reads metadata only. Provider construction and private connection reading stay behind the existing host's lazy hooks and lifecycle.

The source dependency closure includes the original immutable Console stream/file publisher, private host-file reader, retained source range reader, Merchant declaration contract, native commissioning receiver and their maintained dependencies. Use the selected installed source; copying only this guide and one JavaScript file does not install the application.

## Connect an existing foreground owner

Start or continue the original operator from its retained job, original release store and current host setup. Keep its foreground owner running. A private launch file holds the exact complete JSON printed by the existing serve command:

~~~sh
umask 077
facilitator-commissioning serve \
  --directory /private/customer/original-job \
  --store /private/customer/original-release-store \
  --setup /private/customer/host-setup.json \
  --exports /private/customer/operator-transfers \
  --port 0 > /private/customer/operator-launch.json
~~~

This is the existing application operation. When a listener is already owned by the original browser/native course, receive its current private launch file instead of starting another owner. The launch file contains the private session address. Keep it private and out of messages, logs, archives and tool arguments.

The host administrator supplies a private connection JSON. The example accompanying this guide has this form:

~~~json
{
  "schema": "stellar-forge.facilitator-customer-connection.v1",
  "instances": {
    "customer": {
      "label": "Original customer commissioning",
      "jobId": "original-customer-job",
      "launchFile": "./operator-launch.json",
      "inputs": {},
      "receivers": {
        "handover": "./received-customer-job"
      }
    }
  }
}
~~~

jobId must be the actual original selected job ID, or the selected ID for a not-yet-initialized case. The connection is a host declaration, not an observation of successful commissioning. The listener's actual state and retained source selection are checked on use. After the first populated state, the customer retains that job's selection SHA256 and rejects a different original selection under the same alias.

Host-declared input entries add original local source files with path, name, bytes and sha256. Every source import reads the complete actual file, checks the declared identity and transfers the original bytes. Relative paths resolve from this private connection file. Receivers are explicit private destination directories whose parent already exists. The original receiver owns staging, source validation, publication and identical replay.

Add the connection to the existing Merchant host configuration:

~~~json
{
  "facilitatorCommissioningConnection": "/private/customer/commissioning-connection.json"
}
~~~

This is an additional field in the existing complete Merchant configuration. Keep its original schema, release store, export directory, source definitions, authentication and other provider connections. The tool caller can select configured aliases, original IDs and complete source bytes; it cannot substitute a listener URL, token, filesystem destination or executable.

The native listener binds only 127.0.0.1. The existing authenticated Merchant host may be reached through its normal authorized transport. The customer process and listener therefore run on the same equipped host.

## Source custody and complete case selection

Start with merchant_commissioning_instances and merchant_commissioning_state. Read the configured instance, actual job and setup. The original service selection includes useful purpose, source authority and edition, complete schema/scope/acceptance files, receiving operator/system and every agreed request or page.

For a host-declared original file, call merchant_commissioning_source_import with instance, source alias and one uploadId UUID. Save that UUID before the first call. On interruption, repeat that exact call: the original source is verified again, and the upload continues at the listener's actual offset.

A remote caller can instead transfer its complete original file using:

1. source_begin with upload {id, name, bytes, sha256}.
2. source_chunk with that same uploadId, actual returned offset and canonical base64 bytes, up to 196,608 bytes per chunk.
3. source_status to reconcile an uncertain chunk.
4. source_complete after the complete declared length is present.

The host retains a SHA-bound original file reference only after all bytes agree. Retrying a completed chunk compares its original bytes. The customer journals the original upload intent before its first native send. Changed content needs its own new original selection.

Use the resulting {sha256, bytes} references in the same typed command used by the browser. Initialization selects exactly two independently operated provider profiles, their authority sources, the original source release and all requests. Source method/route and payment alternatives remain native release facts. Review every required original file before initialization.

## Prepare, apply and recover one exact command

Every command is:

~~~json
{
  "operationId": "THE-ORIGINAL-UUID",
  "expectedRevision": 0,
  "action": "DOCUMENTED-ACTION",
  "payload": {}
}
~~~

The actual typed tool catalog supplies the full payload schema for initialize, review, stage, select, start, stop, receive-run, buyer-plan, receive and export. Its fields match client.d.mts and the original operator. Use actual UUIDs and current revision, not the illustrative placeholders above.

Call merchant_commissioning_prepare first. It retains the complete request locally before contacting the operator. The native host then retains the same original command under its original UUID. Preparation does not apply the domain action.

Call merchant_commissioning_apply with the instance and that original operationId after reviewing the prepared action. The customer reads the already retained full command, re-prepares exactly those bytes if necessary, and applies the original native request. It never reconstructs an operation from only its action name or supplies a fresh revision to hide a conflict.

After a lost response, call merchant_commissioning_receive:

| Actual state | Continuing action |
| --- | --- |
| COMPLETE | Use the complete original command and receipt. Local completed receiving reopens without a running listener. |
| NOT_FOUND | The local full command remains available. Deliberately prepare or apply that same original command; no new UUID is needed. |
| PENDING | Inspect the original saved request. Deliberately apply that same command to continue. |
| RECONCILIATION_REQUIRED | The native engine already has a result. Applying the exact original command reconciles its complete command hash and retains the outer outcome. |

A stale revision or changed native selection is an explicit decision to review. Keep the rejected original request. A materially revised action gets its own new UUID with the reviewed current revision. Exact retries retain the original one.

merchant_commissioning_pending lists complete locally saved requests and accepted receipts after client restart. Native history is separately paged with jobId and a fixed revision. Read all pages at that same revision; a changed revision requires a fresh complete snapshot. The typed client's allHistory method enforces the original job, revision, total and each cursor.

## Complete two-provider customer operation

Keep one original service definition and useful customer output throughout this course.

1. **Review the selected service.** Read the original release, complete sources, public origin, routes, native payment alternatives and all agreed outputs. Retain the authority and actual provider operator identities.
2. **Review both providers.** Prepare and apply review for each configured provider. Where the original course already retained a complete response, use its SHA-bound review file. Read the full original native review and unresolved requirements.
3. **Stage each compatible reviewed release.** Apply stage with the actual original reviewOperationId. Native staging retains the same source and current selection constraints.
4. **Select and start deliberately.** Apply select using the provider's current expectedGeneration and an operating reason. Start the selected native seller under its original run UUID/generation. The foreground listener remains its sole owner.
5. **Prepare every buyer request.** buyer-plan selects the configured original SF88 template and one distinct approved intent/payment choice for every agreed request ID. Retain both original buyer configuration and the explicit current-host execution copy. The latter resolves local source/body and environment paths while preserving original actor, service, payer, intent and terms.
6. **Continue the existing buyer.** Use its current native approval, spending and signing path. Preserve source, summary, evidence and complete output from the original attempt. The agent provider does not authorize payment or replace the buyer.
7. **Receive actual outcomes.** Upload the full original summary/evidence/output. Apply receive with actual provider, request, original run, receiving operator, decision, note and time. A superseding recovery references the previous original operation. Original attempt time and later observation time retain their native meanings.
8. **Read the complete result.** Inspect all original requests, outcomes, unresolved work, runs and history. A whole useful task includes every agreed page. The original HPD course retains its 100-row and 44-row pages as two purchases within one complete 144-row task.
9. **Close or continue the owned seller deliberately.** stop uses the exact original owned run. A foreign or already interrupted owner is reconciled through the original run observation and receive-run route.
10. **Export and receive the whole job.** Prepare/apply export, retain its original complete receipt, capture the full TAR, and receive it in the configured independent destination.

Changing providers does not change the agreed source population, schema or useful output. Real provider incompatibility, incomplete output, declined review or uncertain settlement remains original customer work for explicit resolution.

## Capture and deliver every original byte

merchant_commissioning_capture retains the full response from the original authenticated file or archive route. It takes a new captureId UUID, configured instance/jobId and exact file selection. Available kinds are input, blob, buyer, buyer-execution, command, report, transfer and archive.

For a current report, supply reportRevision from the selected job. The original revision is checked before and after capture. A changed report remains its own source selection rather than silently replacing a prior saved result.

For an archive, id is the original completed export operation UUID. The customer first receives that exact native export receipt and checks the job and original selection. It then downloads the complete original TAR. File headers must carry actual Content-Length and X-Content-SHA256. The streamed body must match them exactly before its complete manifest is published.

The saved manifest retains the full capture request, source metadata, original export receipt where applicable, original filename/media type and complete byte/SHA256 identity. A retry of the same capture ID uses those same original bytes. Completed capture reopens from local custody; a server restart or expired listener session does not erase it.

Use merchant_commissioning_manifest to reopen that complete manifest. Use merchant_commissioning_file with its expectedManifestSha256 and expectedSha256, following nextOffset to null. The original retained-file reader checks the file, keeps one read-only handle and detects changes during delivery. When a read handle expires, omit readId and resume the same offset and SHA. Verify the complete received hash before using the result.

The installed command writes a complete file and its full manifest:

~~~sh
facilitator-commissioning-customer download \
  --connection /private/customer/commissioning-connection.json \
  --exports /private/customer/merchant-exports \
  --instance customer \
  --capture-id ORIGINAL-CAPTURE-UUID \
  --out /private/customer/delivery/commissioning.tar
~~~

The output parent is an existing private directory. A saved request sidecar binds that output name to its original capture. A complete matching file reopens; different bytes at the same name are rejected. An interrupted temporary write is not presented as a complete customer file.

Source inputs are limited to the original operator's 64 MiB allowance; upload chunks are 192 KiB through the agent and remain within its native 1 MiB chunk limit. Complete TAR capture and receiving allow up to 8 GiB. Downloads are streamed, not loaded as one archive-sized buffer. Each HTTP operation has a bounded connection lifetime, and a client interruption preserves its original command for subsequent receiving.

## Independent receiving and resumed work

merchant_commissioning_receive_archive selects the captured complete TAR, both expected hashes and a host-declared receiver alias. It invokes the existing receiveOperatorTransfer function. The adapter supplies the expected original job ID, export UUID, selection SHA, whole operator-manifest SHA and exact TAR byte count/SHA256. The actual archive byte identity is checked before staging or destination publication; all selected identities are checked before the received job is published and on completed replay.

The native receiver validates ordinary archive members, original manifests, every full source file, the original export receipt and required receiving metadata. It stages in a private directory and publishes the completed original job atomically. A repeated complete receive verifies its original inventory while preserving later legitimate additive work in that received job.

Receiving does not start a seller, buyer or replacement application. The existing receiving owner selects the original release-store mapping and current host setup, opens the received job with the same native serve command and records its actual current launch file. Reconfigure the same expected job under an appropriate host alias. Original native command hashes remain fixed while verified source inputs resolve to their received locations.

The customer cache is separate from the original application TAR. The TAR contains the native/operator source and completed request history; the configured Merchant exports retain agent requests, complete captured bytes and delivery manifests. Preserve both in the host's normal private handover/backup when transferring the customer-side continuation. Each can be reopened without rewriting original result identities.

## Installed tools, CLI and typed integration

List the complete typed input catalog without reading private configuration or opening the service:

~~~sh
facilitator-commissioning-customer tools
~~~

To call one tool through the installed same-host client:

~~~sh
facilitator-commissioning-customer call \
  --connection /private/customer/commissioning-connection.json \
  --exports /private/customer/merchant-exports \
  --tool merchant_commissioning_receive \
  --input /private/customer/receive-original-request.json
~~~

The input file is private UTF-8 JSON containing that tool's complete arguments. This native command uses the same customer agent class and source-owned catalog as Merchant MCP. It prints the complete actual result and exits only after its own file/HTTP reads are drained. Shutdown aborts its borrowed network reads, retains local requests and closes its own temporary file handles. It leaves the original listener and seller with their original owner.

For embedded use, import CommissioningCustomerClient from ./facilitator/commissioning-customer. Supply the existing authenticated Merchant transport as callTool(name, args), resolving its normal unwrapped tool value, and the configured instance. The helper preserves original arguments/IDs and offers instances, state, release, complete history, all source operations, prepare/apply/receive, pending, capture/manifest/file and receiveArchive. It creates no account, session, endpoint or seller.

## Continue the original native and rendered receiving

Join the existing original paid HPD/customer course. Retain its actual release/configuration, provider response captures, full source population, paid-page summary/evidence and existing operating results. The additive agent flow uses that same listener and job:

- Read the original populated case and all history.
- Import its actual full source under an original upload ID, including recovery after a deliberately interrupted source reply.
- Prepare one real remaining original customer action, receive its original UUID, apply it and reopen the same completed result.
- Capture the complete original buyer plan/configuration and useful report.
- Export the whole original job, download it through EOF, and receive it in the existing selected independent destination.
- Reopen the stopped received job under its original current-host source mapping and compare the original selection, complete files and saved outcome.
- View the actual populated eight-screen product, report and receiving output at desktop and narrow widths; operate the important controls and downloads.

Record the source edition, original job/operation/export IDs, actual result files and native outcome together. An offline admission before process creation leaves this original course pending. Source parsing or an earlier provider-only result does not replace the new application's actual operating result.

## Producing and reviewing the exact outgoing product

Bryce's owner instruction applies to local and cloud workers across providers and to delegated workers. Before calling an outgoing client/prospect-facing application, report, demonstration or export ready, open/run/render the exact outgoing version, view the actual screen or its real screenshots, and operate its important controls. Inspect the real desktop/screenshare width and narrow/mobile width, relevant populated/empty/loading/error states, downloads/exports and reopening. Taking screenshots without viewing them is insufficient. Code review, DOM counts, HTTP success, unit checks and another peer's approval do not replace seeing the product.

Repair ugly, broken, unstyled, cramped, clipped, overflowing or unreadable output in the authorized work. Use plain industrial design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve the actual workflows, source data and computation. Inspection must lead directly to repairs; keep focused validation and do not create broad suites or a separate verification product.

Include this instruction in child assignments and the current build/receiving guides. Maintain it in owner-controlled instruction surfaces that this component's workers read; preserve existing owner controls and third-party policies. Continue original operating ownership, with no forced restarts, new watchers or revival of owner-stopped work.

Source: the published transport of Bryce's instruction in #sales, October 13, 2026, message 1791881463.183449, parent 1791724121.853269:
https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791881463183449?thread_ts=1791724121.853269



## Open every outgoing attachment

The producing worker must literally open, view, play or use every final attachment in its intended form: HTML, PDF, reports, slides, spreadsheets, maps, images, video, audio, archives and working projects. Extract outgoing archives and open their actual contained deliverables and the working project. Inspect the exact final edition and important controls; screenshots that were captured but never viewed do not satisfy this requirement. Repair concrete defects in the original source and delivery before presentation, preserving all other owner controls and the original operating case.

## Original Customer Installation

Use [the complete paired-service Installation course](INSTALLATION.md) to bind a full original commissioning transfer to its actual Workshare/Grant case and unchanged native Installation seed. The installable facilitator-installation command retains every original source file, maps exact case source identities, preserves both provider selections and prepares the original preview/save input. The original Installation writer retains funding, work assignments, actual acceptance and full case receiving.


## Customer Installation through the same operator

The customer now exposes 20 operations. `merchant_commissioning_installations` reads the original source cuts and saved preparations; `merchant_commissioning_installation` reads the selected summary or all paged original sources/files. The existing typed `prepare`/`apply` protocol accepts `installation-template` with `{sourceTransferId,seed,caseSnapshot}` and `installation-prepare` with `{templateOperationId,bindings}`. Each file reference is the original `{sha256,bytes}`. Capture uses `{kind:'installation',id:operationId,name:originalMemberPath}` or `{kind:'installation-archive',id:operationId}`. The complete operator archive retains all preparations and pending source bindings for the existing receiver. Follow [the complete Installation desk course](INSTALLATION_DESK.md) through the actual native preview, every attachment and received working project.
