# Bloccpay in Applications and customer agents

Bloccpay opens its existing operations application from the maintained SCF
Applications workspace. The browser, customer agent, signed SDP event inbox and
Bridge intake use one original company workspace and its original HTTP writer.
The provider does not create another ledger or infer balances from event messages.

The complete company application remains unchanged under `source/`.
The integration files beside it select source and runtime, retain the managed
host lifetime, and expose its original methods to the customer agent. The source
manifest inside that directory remains the original `source-files.json`.

## Select an application

Use the `bloccpay` application kind and command.

| Setting | Selection |
| --- | --- |
| workspaceDirectory | Existing canonical private operations directory. The native application initializes its original schema only when this is an explicitly selected empty workspace. |
| configurationFile | Canonical private JSON containing the original connection/configuration selection. File permissions must exclude group and other access. |
| runtimeDirectory | Complete retained Bloccpay Node 24 runtime, including its original manifest, objects, bindings and launcher. |
| runtimeSha256 | Optional expected runtime manifest SHA-256. The provider always pins the actual verified hash into the retained command. |
| sourceDirectory | Optional complete received application source. Omit to select the complete source inside the chosen SCF runtime. |
| sourceManifestSha256 | Optional expected source manifest hash. The provider verifies every selected original member and pins the actual manifest hash. |
| expectedWorkspaceId | Optional exact original or received native workspace UUID. A mismatch closes the same acquired host before readiness. |
| port | 0 chooses an available loopback port; a fixed local port can be selected explicitly. |
| environmentFile | Existing maintained private environment JSON, if needed. |

The runtime verifier checks every retained object and installed binding, original
launcher bytes/mode and platform. Its reported Node version must have major 24.
The managed child executes that original runtime's `bin/node` launcher; it
does not merely inspect one runtime and then execute another interpreter.
The wrapper stream-hashes its actual executable against the selected original
Node binding and checks its exact version before opening the company writer.

Source verification checks the full original source manifest, all declared
bytes, hashes and modes. Managed compatibility additionally uses the exact
reviewed manifest registry in host-connection.mjs. The initial registry supports
the current complete 61-file edition with manifest SHA-256
071f3aba8eb96517a033c42e3f656dd7157bebdb57b9026794654b4b4442c63b.
A manifest's shape alone does not assert support. Older editions that ignore
automatic-projection selection or lack retryable failed-start custody fail
BLOCCPAY_SOURCE_INCOMPATIBLE before opening a host. Received source remains selected even when this
integration is running from a later SCF product installation. The retained
managed command includes the selected source and runtime hashes.

Applications preparation retains the configuration file and original source
inputs using the existing review mechanism. Mutable SQLite state is not
mistaken for a frozen launch artifact. An explicit expectedWorkspaceId is read from the existing native SQLite
identity through a read-only Node 24 handle before the original server may
start configured collections or event projection. The live startup and
bootstrap still check it again. The selected private directory is the
resource key, so two Applications entries for that same directory share the
existing managed resource exclusion.

## Original managed command

The sibling `cli.mjs` dispatches ordinary native commands to the unchanged
`source/cli.mjs`. Its managed serve form is:

```text
bloccpay serve \
  --directory /private/company-workspace \
  --configuration /private/company-configuration.json \
  --runtime /private/company-runtime \
  --runtime-sha256 ACTUAL_RUNTIME_MANIFEST_SHA256 \
  --source-directory /selected/complete-company-source \
  --source-manifest-sha256 ACTUAL_SOURCE_MANIFEST_SHA256 \
  --expected-workspace-id ACTUAL_WORKSPACE_UUID \
  --port 0
```

Applications supplies these arguments from the reviewed selection and appends
its existing request UUID as `--application-run-id`. The wrapper checks
Node 24, imports that exact selected original CLI, and calls its serve command.
It keeps the acquired original server/worker/SQLite owner, including a
failed-start owner returned on an exception.

After the original host is live, the wrapper writes an immutable private
connection and private token file under:

```text
<workspaceDirectory>/application-connections/<application-run-id>/
  connection.json
  operator-token.json
```

The connection contains schema
`stellar-forge.bloccpay-host-connection.v1`, the exact loopback origin,
workspace ID, source directory/hash, runtime directory/hash, instance ID,
token-file path and actual process identity. It contains no token value.

A distinct `BLOCCPAY_APPLICATION_READY` announcement is emitted only after
these files are saved and the original authenticated bootstrap confirms the
same workspace, origin and source. The Applications observer independently
reads the complete connection file, checks its announced hash and byte count,
then checks the live original bootstrap before retaining the browser URL.
The native CLI's earlier `BLOCCPAY_OPERATIONS_READY` line is not treated as
this adapter's accepted ready announcement.

The browser URL opens the original login view. Read the selected private
operator token through the operator's existing secure workflow when needed;
the ready announcement and customer-agent summaries do not publish it.
The additional links open the original `/sdp-events` and `/bridge`
interfaces.

The wrapper also observes error/close on that same returned native server and
its current inspect state, so a native shutdown cannot leave a stale ready
wrapper or an unreported successful exit.

SIGINT, SIGTERM, output failure and caller cancellation converge on the same
retained owner. The wrapper waits for the original listener, sockets, workers,
intake and workspace to close. An incomplete close is retried on that same
object while the managed child and inherited lease remain alive. No replacement
writer is started for cleanup.

## Received workspaces

The sibling received-workspace consumer is the original receiver's adoption
surface. It preserves the actual received workspace ID, original/received
provenance, complete received source edition and restored runtime. It publishes
a private complete configuration with automatic collections and webhook
projection disabled for inspection.

The wrapper dispatches these commands directly to that consumer:

- `received-inspect --received-directory DIRECTORY`
- `received-prepare --received-directory DIRECTORY --configuration FILE --destination DIRECTORY`
- `received-open --destination DIRECTORY`

The inspect/prepare commands accept `--manifest-sha256 HASH` and
`--workspace-id UUID` to require the exact original delivery and received
workspace. Unsupported flags are rejected for each command.

The prepare/open commands accept `--selection-sha256 HASH` to require
the exact retained selection. Use their returned settings unchanged in
Applications. If the received source edition is incompatible, preserve it and explicitly
select a supported complete edition during received-prepare using the paired
`--source-directory DIRECTORY --source-manifest-sha256 HASH` arguments. The
consumer retains original and effective source identities separately; it does
not rewrite the original package, receipt or database. These flags are accepted
only by received-prepare, and neither may be supplied alone.

Cold open uses the retained private configuration without
requiring the earlier external configuration file. See
`RECEIVED_WORKSPACE.md` for the complete receiving contract.

Merely opening the customer agent performs no provider collection, financial
dispatch or event projection. The underlying server continues to obey the
explicit private configuration supplied by its operator.

## Customer-agent configuration

The maintained Merchant provider ID and family are `bloccpay`. Its host
configuration input is `bloccpayConnection`.

For one live Applications host, this may point directly at its private
`connection.json`. The adapter exposes it as workspace alias
`default`.

For several original hosts, or declared upload sources, use a private file:

```json
{
  "schema": "stellar-forge.bloccpay-agent-connection.v1",
  "hosts": {
    "operations": {
      "label": "Company operations",
      "connectionFile": "/private/company-workspace/application-connections/ACTUAL_RUN_UUID/connection.json",
      "imports": {
        "selected-payroll": {
          "path": "/private/actual-payroll.csv",
          "bytes": 1234,
          "sha256": "ACTUAL_FULL_FILE_SHA256",
          "filename": "actual-payroll.csv",
          "contentType": "text/csv"
        }
      }
    }
  }
}
```

Paths and placeholder descriptors above describe configuration fields, not
supplied provider observations. Replace them with actual selected files and
their complete byte identities. The reader rejects an incorrect descriptor.
A host alias is lowercase letters, digits and hyphens beginning with a letter.
Give each native workspace one alias.

The original Merchant configuration also supplies its normal private
`exportsDirectory`. Agent requests, confirmed results and full received
download bytes live below
`<exportsDirectory>/bloccpay-agent/<workspaceId>/`. These are private
customer operation files and do not belong in a public source contribution.

The connection file is immutable for a particular live host instance. A new
managed launch publishes another connection path. Reconfigure/reopen the
customer agent to select that new host; it does not silently follow a changed
origin or substitute another workspace. Retained request IDs remain native
workspace identities and can be resumed against the same workspace's new
explicitly selected host.

The source-owned Merchant declaration provides its lazy configuration reader,
tool catalogue and runtime. No per-family branch in the common Merchant
configuration or operator dispatcher is needed.

## Agent workflow

| Tool | Original behavior |
| --- | --- |
| merchant_bloccpay_status | Local configured aliases, exact workspace/instance IDs, original source hash and upload aliases. No host acquisition. |
| merchant_bloccpay_bootstrap | Authenticated native workspace, original method schemas, native provider catalogue, connection scope and record counts. |
| merchant_bloccpay_list | Complete original paginated tables or requests; continue the returned nextCursor until null. |
| merchant_bloccpay_item | One actual native record or original request status/result/error. |
| merchant_bloccpay_command | One explicit original command with its exact requestId, expectedRevision, method and args. |
| merchant_bloccpay_request | Read retained local input/result and actual native request; resume:true explicitly replays that exact original command or upload. |
| merchant_bloccpay_upload | One declared complete file through native file.retain, source.import or payroll.import. |
| merchant_bloccpay_download | Original visible file or complete existing archive, fully retained and hashed, then returned in bounded chunks. |

Begin with bootstrap and read the actual method/action schemas. The original
application remains authoritative for scope, state, evidence and native
reconciliation. For example, provider changes retain the existing
`operation.prepare` then `operation.dispatch` sequence and the
workspace's original delivery-enabled setting. No tool substitutes an event
message for a full provider resource or a financial ledger entry.

For every mutation, the adapter first saves the exact selected native command
or upload declaration under the stable request ID. A changed input with that
same ID conflicts locally before dispatch. The native application independently
retains and checks its original method/arguments identity.

On a transport failure, inspect the same request. `resume:true` reuses
the retained input and original native request ID. A COMPLETE native command
returns its original receipt; FAILED remains the original rejection; any
native-specific resumable status follows the original command's own rules.
A received workspace has a new workspace UUID but retains earlier request
receipts unchanged. The adapter accepts an earlier producer UUID only through
the current authenticated host's received provenance and exact COMPLETE
request row: original method, arguments and full result must all agree. It
does not rewrite that historical receipt's workspace identity. Locally
reopened confirmed results are checked against that same native record.

This adapter never invents a new ID to get around a failed or uncertain result.

An actual returned receipt is kept in memory before its durable local result
publication. If that local publication fails, the same provider's close retries
the local write; it does not call the provider again merely to preserve the
result. Request files are create-only and use the original private directory
lease for cross-process serialization.

Uploading selects a configuration alias with exact path, length and SHA-256,
not a path supplied by a remote tool call. The full file streams to the native
route, which verifies its hash and retains it before the original command.
Reserved request/method/file fields cannot be replaced through upload args.
Retain source-import connection/action selectors or payroll programme version
selectors exactly as the original native method requires.

## Full files and delivery archives

Use `merchant_bloccpay_download` with kind `file` and an actual
visible file ID, or kind `archive` and an original existing export ID.
Creating an export remains an explicitly selected native workspace.export or
report.export command with the original destination and request ID.

The file route supplies its original SHA-256. The archive route supplies the
original complete manifest hash; the adapter retains the complete gzip stream
and computes its byte hash. Both use the existing native stream writer and
create-only publication. The first successful download saves immutable
metadata and complete private bytes. The first read, and the first read after
a process restart, stream-hashes the full retained file through the same open
handle used for its chunk. Following chunks reuse that verified edition only
while device, inode, length, nanosecond modification/change times and mode
match, with before/after checks on the same handle. This avoids hashing a large
archive again for every small chunk. Repeated reads need no provider action.

Chunks contain offset, byte length, totalBytes, SHA-256, nextOffset and base64.
Keep the original SHA-256 as expectedSha256 on following calls. A null
nextOffset means the complete original file has been read. Empty files return
one zero-byte final chunk. Maximum chunk length is 1 MiB; the complete retained
download is bounded at 1 GiB.

Transport/body readers, upload streams, downloaded files and directory leases
remain owned through their original close. Closing the customer agent cancels
its outstanding HTTP work, awaits all admitted tasks, finishes local confirmed
result publication and releases its original leases. It does not stop the
borrowed Applications host. If a provider action was already accepted there,
the original native request/operation remains the recovery authority.

## Source registration

The maintained contribution declares:

```json
{
  "applicationProviders": {
    "bloccpay": "stellar/scf-starforge-20261009/bloccpay/application-provider.mjs"
  },
  "merchantProviders": {
    "bloccpay": "stellar/scf-starforge-20261009/bloccpay/customer-agent-provider.mjs"
  }
}
```

The command `bloccpay` selects the sibling `cli.mjs`.
Include the six complete integration modules, this guide, the original full
company source and the received-workspace consumer in the product selection.
The unchanged company source manifest continues to select only its original
application files. The broader SCF contribution carries the integration support
files. The product's installation profile requires Node 24 for the original
SQLite application.

The same maintained invoice-settlement contribution supplies the original SDP
desk and SDK components used by this company application. This integration
does not replace their private company-writer adapter or original command
history.

## Updating a managed source edition

Keep the complete original source and its manifest together. Before adding a
new manifest to MANAGED_SOURCE_EDITIONS in host-connection.mjs, read that whole
edition's original configuration, startup, automatic collection/projection,
failed-start, close and runtime contracts. Add only an actually compatible
reviewed edition with its exact manifest SHA-256; preserve prior entries only
while their stated behavior remains supported. Update source-origin.json and
the complete distribution selection with that same edition. Receiving never
silently substitutes a newer source when an old manifest is incompatible.
