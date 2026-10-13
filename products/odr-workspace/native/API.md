# Source-selected ODR native operation contract

This bridge operates the complete original ODR workbench selected by APPLICATION_SOURCE.json. Every notification, definition, source, review, measurement, mapping, prepared request, response and revision remains in the original core handover. It makes no tenant HTTP requests.

## Native boundary

Run the selected Python with `-B native/operations.py`, sending one UTF-8 JSON object to stdin. The request schema is `stellar-forge.odr-operation-request.v1`; fields are `operation`, `arguments`, optional `installation`, optional `binding:{installation_id,source_identity}`, and the retained version-four `request_id` for mutations. The complete response schema is `stellar-forge.odr-operation-result.v1`, with matching operation/request, actual installation summary and full result. Never retry a mutation with a fresh request identity merely because its response was lost.

| Operation | Complete arguments |
|---|---|
| source.inspect | application: original full APPLICATION_SOURCE.json |
| installation.prepare | application, directory, node; optional python, handover |
| installation.inspect | {} with installation |
| installation.adopt_source | application, with installation and retained request |
| installation.snapshot | output: complete ZIP |
| installation.receive | archive_path, directory, node; optional python |
| workspace.state / workspace.handover | {} |
| workspace.record / workspace.history | kind, id |
| workspace.comparison | ids: original measurement IDs, baseline_id selected from them |
| workspace.receive | file: whole onward handover, expected_digest: original saved payload SHA256 |
| workspace.export | kind: workspace/report/application, output |
| requests.get | request_id; optional origin_installation_id |
| commands.describe | ready_file: new private path; optional port |

The response installation summary names exact installation/source/workspace IDs, selected Python and Node file identities, canonical directory/device/inode, original source and bridge paths, HTML path and sender lineage. It excludes private ready URLs and session tokens.

## Original source and workspace

APPLICATION_SOURCE.json has original schema `commons.odr-alpha-application.v1`, complete text `files` and matching SHA256 `manifest`. Source paths must remain ordinary original runtime paths. The selected original builder must reproduce the same complete membership; missing dependencies are refused. Every edition retains complete source, native bridge, original application JSON and built standalone HTML. Node 20+ and Python 3.10+ are selected by exact installed path and hash. No dependency installation is performed.

An optional original handover is received through the selected core's `receiveHandover`; its complete history, source accounts and working drafts survive. Source changes preserve the original application under `received_application`. A blank workspace is created only when the operator explicitly omits a prior handover.

## Installed browser saves

The host sets `window.ODR_INSTALLED` before the original application starts. The descriptor includes schema `commons.odr-installed-host.v1`, installationId, sourceIdentity, initialHandover, currentDigest, selectedApplication and save(handover,expectedDigest). selectedApplication.sha256 is the original core canonical hash of the immutable base APPLICATION, not a file serialization hash.

The explicit Save to installed workspace control retains the exact pending handover and expectedDigest before sending. The host validates all original source and workspace hashes, UUID, immutable history/event prefix and non-rewound current heads. A successful response has schema `commons.odr-installed-save.v1`, installationId, workspaceId, sourceIdentity, payloadDigest/currentDigest, original workspace revision and committedAt. Matching saved payload replay returns its original receipt; later drafts remain editable.

A conflict returns ODR_REVISION_CONFLICT plus complete verified currentHandover/currentDigest. The UI preserves pending and working editions and offers explicit receiving. It does not silently merge or overwrite either side. No business mutation queue is introduced: the private host serializes whole original handover commits and journals exact request/commit/result for lost-response receiving.

## Managed service

commands.describe returns the actual executable, whole argv, cwd, selected launch script/hash, service role and new private ready-file path. The original Applications supervisor owns the direct child and inherited fd3 lease. The Python launcher holds the original installation operator lease, verifies selected source/runtimes and execs the installed Node host, retaining PID and lease. The startup observer compares private ready-file and stdout identity, child PID, installed directory/source/workspace and script hashes.

The loopback service exchanges the private ready URL for an HttpOnly SameSite session cookie. Only the exact local Host is accepted; writes require the same Origin. Ready URLs/tokens never appear in native operation summaries. Stop drains active original saves before exit. Managed Applications owns normal stop/restart; no second supervisor is introduced.

## Complete recovery

Lifecycle methods use installation and operator flock leases. Stop the managed application before snapshot, source adoption, original export or file-based receiving. All read methods delegate to the original core.

A complete snapshot contains selected and prior source editions, original full current handover, exact save requests/results, original lifecycle records, selected original inputs and prior installation lineage, indexed by every file hash and size. Independent receiving verifies the whole ZIP before writing, retains its original bytes, assigns a new installation UUID and preserves the original workspace UUID/history/source. Sender save receipts remain under sender lineage; new installed saves receive the new installation's identity.

Committed transitions and completed request results are reconciled before requiring donor temporary paths. Any surviving donor must still match the exact original bytes. Incomplete source materialization remains retained for the same original operation. A different request or input under that operation is refused.
