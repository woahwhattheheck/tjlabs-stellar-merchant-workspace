# Installed Turnover Workbench

The original frame and cue engine, command history, standalone workbench and authored examples remain complete. The installed workbench adds Applications create/open/resume, one private writer, complete editor backup and recovery, original-request reconciliation, and a complete source handover.

## Open and continue

Select **Turnover Workbench** in Applications. Choose a physical private workspace directory. Supply a new label only for an unused directory; existing saved sessions resume. Applications starts and owns the private listener. Open its returned browser link. **Stop** drains the writer. Agent disconnect releases its attachment while Applications retains the listener.

The workbench edits original source drafts, creates immutable comparison editions, inspects frame mappings, appends source-bound cue decisions, and records receiving returns for an exact recorded review. Every original desk field survives full working JSON, editable HTML and reopen. The operation actor identifies whole managed requests; reviewer and receiver remain distinct original domain fields.

Source, review, receiving, replacement and prior-session transitions prepare and validate the complete successor including its retained preimage before replacing the selected session. A rejected transition leaves current forms available. Previous sessions carry independent complete snapshots. Browser recovery shares immutable original command workspaces across proposals, preserving pending requests and competing branches. Every save or branch adoption uses an expected browser head. Download complete recovery before changing browser/device.

## Domain contract

Both cuts declare integer frame intervals and one rational frame rate. Intervals are half-open and source speed is 1:1. The original engine identifies persistent occurrence IDs, ambiguous repeated clips, moved or partially covered cues, source replacements and removed ranges. Review decisions bind exact source-pair and cue identities. A review correction preserves prior reviews and receiving history; an earlier receiving return remains visible but no longer counts as current.

Read **docs/TURNOVER.md** for exact original columns and limitations. Retain the complete original old-cut, new-cut and cue files including UTF-8 BOM and CRLF. Native media work remains in the original editor/mixer application; record its actual returned file/session reference and evidence in the receiving form.

## Native operations

Use absolute private paths. Close Applications before standalone writer operations. Connected operations attach to the existing Applications writer.

```sh
node cli.mjs init /private/turnover "Project label"
node cli.mjs course /private/authored-turnover
node cli.mjs receive /private/received-turnover /private/Turnover_Working.json
node cli.mjs desk /private/turnover /private/Turnover_Editable.html
node cli.mjs connected /private/turnover /private/Original_Request.json
node cli.mjs connected-status /private/turnover /private/Original_Request.json
node cli.mjs export /private/turnover EXPECTED_SAVED_SHA /private/Turnover_Handover.zip
node native/receive-installed.mjs
```

A standalone intake reads metadata plus three pinned originals, writes the complete original request before applying it, and retains every exact body:

```sh
node cli.mjs ingest /private/turnover /private/Intake_Request.json /private/Old.csv /private/New.csv /private/Cues.csv /private/Original_Request.json
```

The metadata is an ordinary action request below; each `operation.payload.old/next/cues` starts as `{name,sha256}` without substituted text. The command validates each complete original hash, decodes exact UTF-8, replaces those metadata objects with `{name,text}`, writes the complete request and applies it. Original request replay returns its original result while preserving later saved work.

## Agent configuration

```json
{"schema":"stellar-forge.turnover-host.v1","workspaces":{"edit":{"directory":"/private/turnover","inputs":{"old":{"file":"/private/Old.csv","sha256":"FULL_SHA256"},"next":{"file":"/private/New.csv","sha256":"FULL_SHA256"},"cues":{"file":"/private/Cues.csv","sha256":"FULL_SHA256"}}}}}
```

Configure the Merchant host's `turnoverConnection` with this original configuration path. Declare one alias per physical workspace. Input files are hash-bound and rechecked at receiving time.

Call `merchant_turnover_connect`, then status. Pin the current saved edition SHA for every paged read/preview/export. Use `merchant_turnover_inspect` for source editions, original bytes, source rows, event changes, added events, cue mappings, complete reviews, receiving history, drafts, backups and requests. Page until `nextOffset` is null.

`merchant_turnover_ingest` accepts `sources.old/next/cues={sourceInput,sha256}`, `edition={id,label,rate:{numerator,denominator},notes}`, `expectedHead` and `request={id,baseSha256,actor,at}`. It creates one immutable comparison from all three originals. Action kinds are `receive`, `review` and `receiving`, with payloads matching the original core. Each operation repeats request ID, actor and time and binds the original workspace head. Save whole working carriers through `merchant_turnover_receive`, which also accepts original desk/domain files and complete original requests.

A full request has schema `stellar-forge.turnover-request.v1`, installationId, id, baseSha256, actor, at, kind and carrier or operation. Retain exactly those bytes before sending. Recover ambiguous outcomes using the same original request; a changed request must have a new identity. A stale base is retained as a rejection and preserves the current carrier.

## Complete handover and build

**Save complete handover ZIP** on an installed managed desk exports the host's retained selected edition. Save unfinished work first; independently export complete working JSON/recovery for unresolved browser proposals. The ZIP contains every maintained source file, original core and desk, full current editor and prior sessions, standalone editable HTML with an exact source bank, each comparison/report/CSV, exact source and review/receiving evidence, and retained host request/edition history.

Read retained exports by `merchant_turnover_file` through every byte range; verify total bytes and whole SHA-256. The retained file remains available after the Applications listener stops.

Use the existing distribution build with selection `turnover-workbench`; its declared contribution installs `turnover-workspace` and `turnover-managed`, Applications provider and Merchant provider. Source selection includes the exact shared runtime dependencies. GitHub Actions remains disabled.

## Repeated reads

Installed read projections use a bounded 32 MiB / 24-entry cache keyed by the complete serialized input and read arguments. Every first result comes from the unchanged original engine. Results are copied when returned; edits cannot mutate cached originals. Every changed source, command or argument selects a different exact key. This keeps repeated full-history rendering and validation responsive without weakening original replay.
