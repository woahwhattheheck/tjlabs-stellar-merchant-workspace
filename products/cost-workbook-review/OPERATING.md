# Operate and receive a complete cost-workbook review

This directory is a complete local Python/browser application. Its engine, HTTP service, CLI, browser, styles and operating documents travel together in every portable handover. Python 3.11 or later and an ordinary browser are sufficient. The application uses only the Python standard library and serves the local interface on loopback.

## Select an actual review

Keep the authorised original files on private storage outside the source checkout. Select two genuine workbook editions and record their title, financial period, units and exact applicable methodology. When two templates implement different methodologies, record that distinction in the title and mapping; do not describe them as consecutive revisions of one financial statement.

A useful intake contains the original filenames and source/acquisition context, the exact comparison scope, the source of the applicable cost method, and the named person who will decide what changes mean. Leave unknown financial classifications unresolved. The application keeps the actual workbook bytes and does not substitute generated rows or a default cost-allocation rate.

Run from this complete source directory:

```sh
python3 serve.py serve --workspace /absolute/private/workbook-review --port 8865
```

Open the printed local URL. The browser uses the same persistent case and methods as the CLI. Choose **New comparison**, select both original .xlsx files and enter the selected mapping. Focus fields name actual worksheet/cell coordinates for totals, denominators, allocations or explanatory cells. A complete explicit sheetPairs mapping can preserve an actual sheet rename; README.md describes the exact JSON structure.

Keep the source directory and workspace distinct. A portable packet includes original financial files; give it the same access and retention treatment as those files.

## Read the complete source and changes

Open the two original workbook download controls and inspect the files in their original spreadsheet application. In the review interface, inspect named fields, every relevant worksheet, formula changes, sheet changes and complete package-part changes. The original-cell viewer retains stored cells from each selected workbook. Table pagination changes only the visible page; the full comparison remains in the case.

Formula caches remain the values stored in the supplied file. Shared formulas retain their stored master and member definitions. The software does not recalculate formulas or execute external data links. If the selected spreadsheet needs recalculation or correction, perform that in its original spreadsheet application, save the actual new edition and create the resulting review from those genuine files.

A changed XML part can reflect presentation or spreadsheet-save metadata. A named reviewer decides whether the change alters the reviewed financial meaning. The interface supports an explanation and optional cost-category label alongside each decision without modifying either source workbook.

## Named decisions and save recovery

Supply the actual reviewer's name and a useful review note. Acknowledge a understood change, request a correction, or request information using the available decision controls. No approval is created automatically. Unresolved counts include unacknowledged changes and open correction/information requests.

A save binds its complete decisions to the case ID, actual revision and exact comparison digest. The browser retains the exact pending request before sending. After a transport failure, repeat that same request or reload and reconcile it with retained history. If the server definitively rejects validation with HTTP 400, the interface clears only the rejected pending request and preserves the local decisions so they can be corrected. A stale revision requires the current saved case and preserves the draft for reconciliation.

The CLI consumes the exact browser-downloaded decision file:

```sh
python3 serve.py review --workspace /absolute/private/workbook-review --case ACTUAL_CASE_ID --decisions /absolute/private/Workbook_Review_Decisions.json
```

An exact replay returns the original accepted revision. A changed request with the same ID is rejected. A subsequent intentional change uses a new named review at the real current revision, retaining the prior review in history.

## Export and hand over the whole case

After the named review, close and reopen the source application. Inspect the same saved case, original files and immutable review history. Export to a fresh retained path:

```sh
python3 serve.py export --workspace /absolute/private/workbook-review --case ACTUAL_CASE_ID --output /absolute/private/delivery/Workbook_Review.zip
```

The result names the complete archive, byte count, SHA256 and member manifest. Preserve that returned result with the original case. The archive contains both exact original workbooks, comparison and mapping, named decisions and history, saved requests, a readable offline index.html and the seven complete source files.

Extract the whole archive privately. Open its index.html, inspect the selected case and decisions, open both original workbook links, and use its ordinary filtering and original-cell controls. The offline application can export an explicit new decision request for submission to the original authoritative workspace; that file is a proposed request until the original workspace accepts it.

## Independently receive and continue

Use the complete source included in the exported packet, rather than mixing a newer parser or guide into that historical source edition:

```sh
cd /absolute/private/unpacked/source
python3 serve.py receive --workspace /absolute/private/independent-review --packet /absolute/private/delivery/Workbook_Review.zip
python3 serve.py list --workspace /absolute/private/independent-review
python3 serve.py show --workspace /absolute/private/independent-review --case ACTUAL_CASE_ID
python3 serve.py serve --workspace /absolute/private/independent-review --port 8866
```

The receiving operation verifies every original member and the complete source, recomputes the full comparison from the actual workbook bytes, validates the original decisions and restores the same case. An exact repeat preserves the accepted case. An existing different receiving revision is not overwritten; choose the appropriate retained workspace or a separate receiving directory.

Open the independent local URL and use the restored case. Inspect the original mapping, named fields, decisions and history, open original downloads, and export the case again. Retain the original and received outcomes and the exact files that were actually opened.

## Source installation and historical packets

The published engine has the same complete workbook parsing, comparison, revision and replay behavior as its predecessor. This public edition replaces a company-specific commercial document with this generic operating guide and carries generic source-method notes. That source-list choice is part of portable source equality.

A historical packet must continue with its own seven source bodies. Receiving a historical packet through a different source edition intentionally returns the exact source mismatch rather than silently adopting a changed programme. Keep historical applications and workspaces as distinct retained source selections. The public SOURCE_MANIFEST.json covers all seven current application files and is useful for installing this exact edition; each exported packet supplies its own full manifest.

## Actual product use and delivery

Operate the exact selected source with the real original files. Use intake, mapping, cell/change filters, original downloads, named review, replay, close/reopen, export and independent receiving. Look at desktop and narrow layouts and all important populated, empty, loading and error states. Open and use the final archive and each delivered attachment. If a field, table, control or output is broken or unreadable, fix the source through the original owner and continue the same intended delivery. Record the actual source/input/output identities with the observed outcome.

The repository's complete standing delivery instruction follows and applies to this operating procedure.

---

# Repository delivery instructions

Use the current README and the existing product's build/receiving guide. Coordinate through the original implementation and receiving owners, preserve concurrent source, and carry work through its authorized delivery.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

## GitHub Actions zero spend — existing owner instruction

Keep GitHub Actions disabled in this repository's provider settings and preserve the disabled source policy in [.github/hosted-ci-policy.json](.github/hosted-ci-policy.json). Every workflow job must retain the established literal-false condition, including manual dispatch and reusable jobs. Preserve its original condition inside the wrapper, and preserve the complete steps, commands, source and delivery artifacts.

Run focused product work in the existing cloud Linux or original local receiving operation. A public repository, available free minutes, cloud admission failure or a missing green check does not authorize enabling or dispatching hosted Actions. Do not set `HOSTED_CI=on`, add scheduled hosted runs or choose a paid runner. Keep source-native receiving moving with its original owner and saved operation.

Before publishing workflow changes, use the maintained Commons `tools/hosted_ci_gate.py --zero-spend REPO_ROOT` and `--check REPO_ROOT` source operation where that existing runtime is available. Its canonical wrapper is `${{ (false) && (ORIGINAL_CONDITION) }}`; the original condition is retained for native continuation. Provider disablement, the whole-account spending budget and dated billing remain separate controls; preserve current artifacts and their original custody.

This carries Bryce's existing zero-spend instruction from [Commons RULES, CI and spend](https://github.com/woahwhattheheck/commons/blob/main/RULES.md#4-ci-and-spend) into this repository's consumed entry guidance. Original cost coordination: https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791755765336589 .

