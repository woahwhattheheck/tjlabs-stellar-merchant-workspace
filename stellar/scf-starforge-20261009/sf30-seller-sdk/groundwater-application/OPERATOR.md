# Groundwater Scientific Workspace: managed launch and complete receiving

This application opens an existing groundwater study in the maintained Merchant **Applications** workspace. It uses the original scientific UI and Python Workbench. Its additive receiving page turns a complete original backup into an independently editable working copy, then opens that copy through the same managed listener.

The source contract in [SCIENTIFIC_SOURCE.json](SCIENTIFIC_SOURCE.json) retains all 64 original scientific files, including publisher source and notices, Tethys adapter source, command surfaces and the complete original UI. The application also retains the maintained Groundwater Report Desk's original database/Python identity readers. The separate Report Desk continues to own report publication, merchant offers, buyer Inbox and Operations receiving.

## Install and choose the application

Use a complete scientific distribution that includes the source-owned `groundwater-application` contribution and the existing `groundwater` / `groundwater-reports` components. The scientific source selection is `groundwater-reports`. The report-only selection `groundwater-report` remains separate.

In the original Runtime Workspace:

1. Select the actual **READY** installed runtime that contains **Groundwater Scientific Workspace**.
2. Open **Applications**, choose **Groundwater Scientific Workspace**, and select its existing private scientific workspace directory.
3. Select an existing private receiving directory outside the scientific workspace and installed source.
4. Select the actual existing Python 3.11+ executable. An existing virtual environment is supported; its executable target and configuration are bound to the review.
5. Enter the operator name and optional local port. Review and save the application, connect its original installed source when requested, then start the saved application.
6. Open the URL returned by that exact managed run.

The workspace must already contain its original private `groundwater.sqlite` and native metadata/schema. Startup refuses a missing, empty, replaced or unrelated database. It does not initialize a new study. A receiving directory can be prepared explicitly before selection, for example with `install -d -m 700 /private/groundwater-receiving`.

Opening the application needs Python's standard library and the selected installed Node runtime. Running scientific models remains a separate explicit action in the original scientific UI. That action keeps the original runtime configuration, source edition, review and run ID. This adapter does not install dependencies or acquire a solver.

The saved launch binds the selected source tree, executed release tree, Python identity, receiving directory and original database inode plus immutable workspace metadata. Ordinary project changes, appended operation history and increasing workspace versions do not invalidate that identity. Replacing the database or selecting a different source requires a new explicit Applications review.

## Work in the original study

The original UI retains its source, scenario, native comparison, review, frozen report, delivery and operation-history controls. The added navigation link is **Receive & reopen backup**.

Original scientific requests still pass unchanged to the Workbench. Its existing request IDs, compare-and-swap versions, native execution ownership and frozen outputs remain authoritative. The gateway does not repeat a scientific POST after a lost response. Use **Original operations** and the original UI's retained request recovery to inspect that exact request.

The local application URL includes a private access fragment. Its bootstrap consumes the fragment, keeps access in the current browser session and removes it before the scientific UI reads its own route. Keep that URL private. The listener binds only to `127.0.0.1`; this is an operator application on the selected host, not a public multi-user deployment. The existing Tethys product supplies its own portal account and permission model.

## Create and receive a complete backup

Create a complete backup in the original scientific UI's **Backup & reopen** section. The existing core freezes the whole workspace, source, operation history, inputs, native outputs, report exports and application source according to its original backup contract. Download the resulting ZIP.

On **Receive & reopen backup**:

1. Enter the absolute path of the delivered original ZIP on this host. The receiving page reads that file; it does not interpret a browser-local path as a remote upload.
2. Choose **Inspect complete backup**. The original reader verifies the ZIP's complete manifest, member set, sizes and SHA-256 digests. The page shows the workspace ID, backup ID, archive size, expanded size, file count and complete manifest.
3. Enter the receiving operator and purpose. Select **Receive this complete backup**.
4. The browser retains the complete request before sending it. The adapter retains the same request, full archive and destination before invoking the original create-only restore.
5. Open the resulting record. The receiver verifies the complete retained ZIP, every original received member, native restore control files and current working database.
6. Select **Open received scientific workspace**.

The new working copy retains the original workspace UUID and history. Its independent directory and database inode produce a different browser API namespace. Pending scientific requests and drafts cannot silently move from the original study to that copy, or between independently restored copies with the same UUID.

The original scientific restore retains an immutable received package beside the editable working directory. It preserves original committed requests and results, records restoration provenance, and marks interrupted native work according to its own recovery contract. It never automatically reruns a model. The archived application remains part of the original package; the managed launcher executes the currently installed, reviewed source.

If the supplied backup predates a selected operation, that operation will not appear in the received copy. The native receiving continuation checks its explicit selected operation IDs on both sides and stops on such a mismatch.

## Continue interrupted receiving

Each receiving uses one UUID and one destination:

```text
<selected receiving directory>/
  groundwater-receivings/
    <original receiving UUID>/
      request.json
      archive.zip
      restored/
        restore-request.json
        restored.json
        working-copy.json
        received/
          manifest.json
          receiving-request.json
          receiving.json
          application/
          workspace/
        workspace/
          groundwater.sqlite
          ...
      result.json
      observations/
```

The browser shows **Original request retained** until the complete result is verified and retained there. **Read or continue original receiving** first reads that receiving UUID. It dispatches the original request only when the request publication itself is absent, or continues an existing incomplete receiving through the same native helper. A missing file in an already completed receiving is reported as unavailable.

A copy interrupted before archive publication retains its exact verified prefix. The same request can continue that copy only against the same original bytes. If the complete private staging file survived, it can publish those exact bytes without reacquiring the incoming file. A partial file with different bytes is preserved and rejected.

New requests retain both the full application/Python binding and the stable 64-file scientific contract. An unfinished restore requires its exact original full binding. Completed history can be read and opened after a compatible adapter, UI or Python change when the scientific contract, original workspace and receiving directory identities still match. The original request and completion keep their historical source/Python identities; current compatibility observations are reported separately.

After native restore commits, a later read never substitutes a fresh snapshot or silently recreates missing completed files. Restore receipts and the immutable received package remain separately verified from the working database. Later edits in the working copy are retained and reported as current state.

Use **Download retained request** before moving browsers if local browser storage is constrained. The server's receiving history also retains each original request. A list row reports its saved state; selecting it performs the complete current verification.

Keep the complete operation directory together. The original incoming ZIP remains available through **Download original complete backup**, and **Download complete receiving record** provides the original request, native receipt and current identity. The JSON record alone is not the complete data handover.

## Stop and reopen

Stop the original run from **Applications**. The gateway stops accepting new requests, waits for in-flight scientific and receiving requests, then signals every original scientific server that it opened and waits for those processes to finish. Repeated signals share the same close operation. No forced process exit is used by the adapter.

Each Python host also holds its parent's lifetime pipe. If the launcher disappears, EOF invokes the original scientific server's signal handler. The original server waits for its own request threads. The launcher does not deliberately detach an unowned scientific server.

Reopen the saved Applications entry through its original lifecycle. It verifies the selected database, source and Python again. The receiving history is read from the selected receiving directory. Explicitly open a completed received record to reopen its independent working copy; startup does not open every historical copy or rerun restoration.

To operate a received copy as its own saved Applications entry, select that existing `restored/workspace` directory and a separate existing private receiving directory, then review/save it. Its original UUID remains the same; its path and database identity distinguish the working copy.

## Direct CLI

The installed source-owned command is `groundwater-application`. An exact source invocation is:

```sh
node /absolute/installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/groundwater-application/cli.mjs help
```

Direct launch supports the same selection:

```sh
groundwater-application serve \
  --workspace /private/original-study \
  --receiving-root /private/groundwater-receiving \
  --source-root /absolute/installed/source \
  --python /absolute/existing/python \
  --actor "Receiving operator" \
  --port 0
```

The CLI prints one schema-first startup JSON record after the original scientific listener and current source have been verified. It contains the private URL, actual workspace identity, receiving identity, source digest and process identity. Applications consumes that same record and independently reads authenticated state before retaining the URL.

For a portable reviewed selection, write the explicit existing inputs to a private JSON file:

```json
{
  "workspaceDirectory": "/private/original-study",
  "receivingDirectory": "/private/groundwater-receiving",
  "sourceRoot": "/absolute/installed/source",
  "python": "/absolute/existing/python",
  "actor": "Receiving operator",
  "port": 0
}
```

Run `groundwater-application inspect --selection /private/selection.json` and retain its complete returned JSON. That result includes the four expected identity digests. Supply that complete reviewed selection to the remaining CLI commands:

| Command | Original input and result |
|---|---|
| `inspect-backup --selection FILE --archive ZIP` | Full native package verification and complete review object. |
| `receive-backup --selection FILE --request REQUEST` | `{operationId, actor, reason, preview}`; preview is the full exact inspected object. Retains one archive/destination and restores it through the original core. |
| `continue-receiving --selection FILE --operation UUID` | Reopens the original saved request and destination. |
| `receiving --selection FILE --operation UUID` | Verifies a completed original or reports its retained incomplete state. |
| `receivings --selection FILE` | Lists saved request identities; rows explicitly remain unverified until inspected. |

No CLI command selects new scientific runtime binaries, creates a model edition or calls a solver as part of receiving.

## Complete native receiving continuation

`groundwater-application-native /private/original-native-input.json` runs the maintained Applications lifecycle and actual browser against an explicitly supplied existing study and backup. [native-input.schema.json](native-input.schema.json) defines the full input.

The input selects:

- the existing initialized Runtime Workspace and actual READY installation;
- its exact source commit and the existing scientific workspace UUID;
- the existing Python and browser package/executable;
- the complete original backup path, size and SHA-256;
- the original committed scientific operation IDs that the backup must preserve;
- one private output directory and the separate private receiving directory;
- a named operator, receiving purpose and original parent operation ID.

The caller verifies both the selected and executing source before any completed replay. It retains the original input and operation/result digests, attaches the original installation, reviews/saves one Applications entry, and uses that entry's actual source adoption. It starts a managed run, opens the original scientific history, receives the exact supplied backup through the actual receiving form, and opens the received history. It then stops/drains the run, starts the planned reopen leg, and verifies the same completed receiving through that new listener.

Each managed start request is retained before native dispatch. An interrupted active run is recovered by its original ID. A run that conclusively ended before its browser observation is preserved. The explicit `allowClosedLaunchRetry` option permits a next numbered managed launch; it never replaces the earlier run or creates a new scientific operation or backup. At most 32 such launch attempts are selected per leg.

The caller owns only its saved application runs, associated original source-adoption operation and browser. It waits for their native state and worker lock to drain before completion. If native work remains pending, keep the same producing lifetime and original operation available; a pending error is not proof that detached work has stopped.

The caller saves `native-result.json` only after both browser legs and complete drain. It contains exact evidence-file identities, both original managed run IDs, the original receiving UUID, the complete archive identity and the full receiving directory. On completed replay it verifies original archive/member/control files, the selected scientific requests/results, the current independent database, and the stopped managed runs. Current workspace observations are separate from the frozen original result.

The caller saves no browser screenshots. It creates no new study, no new publisher baseline, no solver attempt, no replacement scientific report and no fresh backup. Its required backup is the original completed scientific programme's actual delivery.

## Source and receiving boundaries

The full source and original licensing remain in the installed distribution. This adapter's provider and commands are additive; the frozen 64 scientific files are unmodified. The original Report Desk, Tethys deployment and shared Applications/runtime/transfer engines keep their own source and operation ownership.

Record scientific run, portal and receiving outcomes from their actual original operation records. Source publication and the completed native receiving result each retain their own evidence.
