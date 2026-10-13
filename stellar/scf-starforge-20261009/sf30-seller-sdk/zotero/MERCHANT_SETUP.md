# Register the existing Zotero library for customer-agent tools

The installed Zotero product declares the source-owned `zotero-workspaces`
provider. It connects the existing Merchant host to the same saved library,
collection projects and Research handoffs used by the browser and CLI. It
does not create a second library ledger or change the remote Zotero account.

## Select the original library and listener

Create an operator-owned private UTF-8 JSON connection with schema
`stellar-forge.zotero-agent-connection.v1`. Each alias selects an existing
canonical private workspace directory.

```json
{
  "schema": "stellar-forge.zotero-agent-connection.v1",
  "workspaces": {
    "osf-library": {
      "label": "Original OSF library and Research project",
      "mode": "managed",
      "directory": "/private/original-zotero-workspace",
      "connectionFile": "/private/original-zotero-workspace/connection.json",
      "files": {
        "original-source": "/private/zotero-inputs/original-source.json",
        "complete-project": "/private/zotero-inputs/Zotero_Complete_Workspace.json"
      }
    }
  }
}
```

The paths above are examples. Select the actual retained workspace, private
connection and complete source files. Managed mode attaches to the original
authenticated live connection and verifies its directory, workspace and
listener identity. A restarted listener requires opening its new original
connection; do not reuse an earlier instance binding. The connection token
stays in its private source file. API-key environment references stay with the
original host and source profile.

Owned mode requires the existing `workspace.sqlite` and starts the same
maintained `startZoteroWorkspace` Node service over that original directory.
If the original setup uses an independently located Research store, declare
its actual existing `researchDirectory` in owned mode. Managed mode uses the
listener's existing Research binding and does not accept a replacement
`researchDirectory`. There is no executable selection, automatic library
creation or remote account mutation in this setup.

Use configured `files` aliases for source intake and complete project
receiving. Tools do not accept an arbitrary local input path. Keep the
selected original bytes at their configured paths until the saved operation
has received them; a changed source must remain a distinct explicit edition.
The runtime validates the complete file and its retained source identity.

## Initialize or reopen the same Merchant host

Place the Merchant directory beneath an existing canonical private directory.
Use the existing source-owned initializer through the maintained host:

```javascript
import {initializeMerchantProvider}
  from './stellar-forge/mcp-merchant-operator/providers.mjs';

const result = await initializeMerchantProvider('zotero-workspaces', {
  directory: '/private/zotero-merchant',
  connection: '/private/zotero-workspaces.json',
  name: 'Original Zotero library service'
});
```

Use the returned `merchant-mcp.json` with the normal Merchant launcher.
Initialization validates the installed source contribution and connection
reader. It creates only its own release store and private customer export
directory. It does not start the Zotero listener, acquire a catalogue, create
a Research dossier or receive a replacement project.

An optional `releaseStore` selects an existing original store. Its complete
history remains intact. A completed host configuration is preserved
byte-for-byte, including other configured provider families and its original
export directory. The export directory belongs to that host configuration,
not to the Zotero connection's file aliases.

Setup binds the exact connection-file bytes, original store and name under
the maintained state lease. Repeating unchanged inputs reopens the completed
configuration or finishes its interrupted setup. Only this initializer's
unchanged empty release-store stage may be promoted after interruption.
Supplied and previously saved stores must exist. Changed setup inputs require
a deliberately selected new setup directory; mismatched retained stages are
not removed or silently adopted.

## Continue the complete original customer workflow

Use `merchant_zotero_workspaces` to inspect configured aliases, then open the
selected alias with `merchant_zotero_open`. Verify the actual workspace and
listener identity before operating it. Read complete paginated records through
`merchant_zotero_view`, including the saved library profile, capture edition,
collection membership and selected project. Continue every inventory to its
reported end.

Use the existing native save and request interfaces for library profiles,
collection projects, evidence decisions and comparisons. Preserve original
record revisions and saved request UUIDs. The agent's durable request history
is stored inside the original SQLite workspace and travels in whole-project
delivery. After an uncertain response, inspect that same native request before
using `merchant_zotero_resume`; do not manufacture a replacement request to
repeat work whose result may already be saved.

The original capture preserves complete Web API response documents, accepted
page history, collection and parent identities, source terms and library
version. A changing source edition, backoff or interruption stays visible.
Original source imports enter through `merchant_zotero_import` and the
configured file alias. The source limit is 64 MiB; control requests retain a
1 MiB bound. Complete files are not placed in a control message.

Keep the original Research handoff linked to its existing dossier, question,
reviewed source selection and accepted revision. Research tools continue
downstream dossier and programme work; these Zotero tools operate the separate
library workspace that supplies that source. Neither interface turns an
attachment metadata record into downloaded attachment content or expands its
rights. Linked full-text bodies require their own actual source and access.

## Download, receive and reopen the whole project

Use `merchant_zotero_export` for the selected original artifact or complete
editable project. Retain the returned file identity, byte length and SHA-256.
Read it with `merchant_zotero_file_read` in chunks of at most 196,608 bytes,
using the returned next offset until the reported end. Verify the total bytes
and SHA-256 before using or handing over the file. Release a finished reader
with `merchant_zotero_file_release`.

The original complete workspace transfer remains a JSON document bounded at
256 MiB. It carries original immutable record revisions, full referenced
objects, native saved request history, library/project decisions and linked
Research history. A display preview or the first output chunk is not a
complete delivery.

Select that whole project through its configured file alias for
`merchant_zotero_receive`. The original operator creates or resumes its
named receiver under `directory/received/name`, preserving its original
receipt and private child connection. Agent tools do not accept an arbitrary
destination or overwrite the source workspace. Use
`merchant_zotero_receiver` to open the exact returned child. Both receiving tools return `childWorkspace`, a derived alias attached to that actual child listener. Use this alias in the same view/save/export tools; it preserves the child's canonical directory and original workspace/listener IDs without changing the host configuration. The original parent still owns its child listener. Verify the child's original capture/project and linked Research revisions. Continue an editable
customer action there, export the complete progressed project and cold-reopen
the same received workspace.

## Cancellation, ownership and restart

Ordinary tools are serialized by the provider for each alias.
`merchant_zotero_cancel` and `merchant_zotero_close` remain concurrent
controls. Cancellation targets the selected original saved request/capture
operation, preserves already accepted source and native history, and leaves
its actual resumable state visible. It does not establish that a lost reply
means no work occurred.

Managed close detaches this agent from the existing listener; Applications
and the original operator retain that listener and saved work. Owned close
drains the same service object created by this runtime. Parent close first drains its derived child attachments and retained file readers, then the original listener closes the child services it owns. Both paths retain
accepted-call and file-reader ownership until their cleanup finishes. A
failed close keeps its exact original owner for a subsequent close attempt.
Do not start a substitute listener to hide an incomplete close.

## Use the original OSF receiving case

Continue `SCF-ZOTERO-LIBRARY-RESEARCH-DELIVERY-20261012` with its original
SDK12 / Root2D58 receiving owner. Its real public OSF group479248 source
retains 5,503 items, 18 collections and 58 official API responses at library
version11212. The original complete four-root project contains 1,254 items;
its Research handoff has 1,255 original occurrences, 1,236 normalized sources
and five source-linked findings. Preserve the actual library, capture,
project, dossier and progressed revision from the saved case.

The existing native guide is [NATIVE_RECEIVING.md](./NATIVE_RECEIVING.md).
It distinguishes the local protocol exercise from the original live OSF
catalogue. Use the completed original catalogue and saved workspace for this
customer-agent continuation; do not recapture it or relabel protocol examples
as scholarly evidence. The original owner has the complete native archive,
public-source archive and exact source selection.

Complete the same installed course: authenticated agent open, actual source
and project review, saved request and original replay, complete file download,
named independent receiving, linked Research continuation, full progressed
handover and cold reopen. Open the real desktop and narrow browser views,
operate the important controls and inspect the actual returned images. Keep
the original source, current runtime, saved results and rendered observations
together. Source publication alone does not claim that this new agent course
has completed on the native host.
