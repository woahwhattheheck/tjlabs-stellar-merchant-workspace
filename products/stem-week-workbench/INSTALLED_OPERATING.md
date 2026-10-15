# Installed Stem Week Workbench

## Open, work and continue

Applications → **Stem Week Workbench** creates, opens and resumes a private workspace. Choose a physical private directory; supply a new label only to create an unused workspace. The returned link opens the full original weekly editor. Applications owns the private writer; agent/native attachments use that same writer. Disconnect releases an attachment. Stop drains Applications.

Retain complete varieties, supply, recipes and commitments CSVs as one immutable source edition. Source originals preserve BOM and line endings; the original text changes only after deliberate text-field editing. Choose a retained Monday week and projected or actual basis. Inspect exact-variety totals, own-grown and buy-in origins, priority pulls and dated CSA commitments. Missing observation and measured zero stay distinct; an unreceived projected buy-in remains incomplete actual supply.

Review a variety or commitment with a grower/reviewer, action, reason, optional canonical quantity and evidence. A correction keeps the exact edition/week/basis/target and appends decision history. Arithmetic changes only when corrected source originals are received. Use OPERATE_WEEKLY_STEMS.md and WORKBENCH.md for the complete original operating contract.

All original editor fields, basis-specific target/correction drafts, current and prior source editions and complete decisions travel together. Every source import, context change, decision or replacement prepares and validates the whole successor plus retained previous editor before selecting it. A rejected transition preserves the visible work. Complete previous sessions are independently recoverable.

## Save and recover

Managed save retains the exact original request, actor, time, selected base and complete successor. Reopening recovers the same pending request. Competing browser saves retain full proposals; explicitly choose which complete branch to continue. Immutable original workspace objects are shared across browser recovery records. Export full recovery before changing device or listener port.

The maintained source also builds a complete standalone editable HTML. Browser save uses expected-head publication with independent proposed copies. Full working JSON reopens every field and retained prior editor. Original desk and core JSON remain separate ordinary export choices.

## Native interface

The original `cli.mjs` remains unchanged. Installed operations use `installed-cli.mjs`; all paths are absolute and private. Close Applications before standalone writer commands. Connected commands attach to the existing Applications writer.

```sh
node installed-cli.mjs init /private/stems "Farm week"
node installed-cli.mjs course /private/authored-stems
node installed-cli.mjs receive /private/received-stems /private/Stem_Week_Working.json
node installed-cli.mjs desk /private/stems /private/Stem_Week_Editable.html
node installed-cli.mjs connected /private/stems /private/Original_Request.json
node installed-cli.mjs connected-status /private/stems /private/Original_Request.json
node installed-cli.mjs export /private/stems EXPECTED_SAVED_SHA /private/Stem_Week_Handover.zip
node native/receive-installed.mjs
```

Exact four-file receiving writes the complete original request before applying it:

```sh
node installed-cli.mjs ingest /private/stems /private/Intake_Request.json /private/Varieties.csv /private/Supply.csv /private/Recipes.csv /private/Commitments.csv /private/Original_Request.json
```

Metadata is an ordinary action request with `operation.kind=receive`, payload `{id,label,notes,sources}`, and each source initially `{name,sha256}`. The command verifies all four files, decodes exact UTF-8, replaces each metadata object with `{name,text}`, writes the original request and applies it. Complete request fields: schema `stellar-forge.stemweek-request.v1`, installationId, id, baseSha256, actor, at, kind, and carrier or operation. Domain operations repeat id/actor/at and carry expectedHead. Retain that exact request and retry it unchanged when its outcome needs recovery.

## Agent configuration and operations

The Merchant connection has schema `stellar-forge.stemweek-host.v1` and `workspaces` keyed by aliases. Each workspace declares `directory`, optional installationId, and `inputs` keyed by source alias with `{file,sha256}`. Configure the Merchant host's `stemweekConnection` with that file path. One alias names one physical private workspace.

Connect with `merchant_stemweek_connect`, then inspect status. Every paged domain read, preview and export pins the selected saved SHA. Read until nextOffset is null. Available projections include editions, original bytes, source rows, complete selected-basis varieties and origin counts, commitments, priority pull, shares, attention, current decisions, complete decision history, vendor comparison, drafts, prior sessions and requests.

`merchant_stemweek_ingest` accepts four `sources.varieties/supply/recipes/commitments={sourceInput,sha256}`, `edition={id,label,notes}`, expectedHead and `request={id,baseSha256,actor,at}`. Every original is rechecked at use. `merchant_stemweek_action` supports receive and decision; decision payload uses the original core fields and its exact selected edition/week/basis/target. Preview plan accepts that selection. Preview command accepts `{operation,selection}`.

Receive complete working, original desk/core or original request files through `merchant_stemweek_receive`. Exact request retry returns its original outcome while preserving later saved work. A stale request is retained with its rejection and the selected carrier stays unchanged.

## Full handover

The retained host ZIP contains every maintained source file, exact source originals, full current/prior editor, original core and desk, standalone editable HTML with a complete source bank, all editions and every retained week under both bases, ordinary reports/CSVs, complete grower history and all retained host requests/editions.

Managed handover exports the host's saved edition. Save unfinished work first, or independently export the complete working/recovery file for unresolved proposals. Read `merchant_stemweek_file` through every byte range and verify total length and SHA-256. Retained exports remain available after Applications stops.

Build/install source selection `stem-week-workbench`. Its contribution installs commands `stemweek-workspace` and `stemweek-managed` plus the normal Applications and Merchant providers. Repeated read projections use a bounded 32 MiB/24-entry exact-input cache around the unchanged original engine, with fresh copies returned to callers.
