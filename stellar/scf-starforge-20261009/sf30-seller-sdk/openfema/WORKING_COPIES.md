# Continue a complete OpenFEMA operator working copy

The existing Public Assistance workspace now keeps named private operator copies across page refresh, browser close and another operator's full-file handover. The native workspace continues to own source editions, immutable portfolios, analyst decisions, customer reconciliations, releases and original operation results.

A working copy holds unfinished mapping JSON, capture criteria, reviewer notes, selected review rows, record-specific forms, publication/payment text, the selected native context, complete original source/customer/schema files and the original browser request history. It does not contain the session token. Use the existing **Handover → Complete workspace ZIP** for the original native project; use **Working copy → Export complete copy** for the preparation that has not yet entered that project.

## Daily operation

1. Open the original private workspace URL. The Working copy panel identifies its native workspace UUID and the browser's saved revision.
2. Name the active copy for the programme or delivery. Work in the ordinary Sources, Portfolios, Review, Data integration, Publication and Customer sections. Edits save in this browser; the status changes to **Saved in this browser** only after the storage transaction completes.
3. Select the complete source bundle, schema or customer CSV through its existing file picker. The adjacent retained-file label gives the exact filename and byte count. After closing the browser, the retained complete file can be used by the same original form without selecting a replacement.
4. Use **Duplicate visible copy** for another preparation, or **New copy** for a blank one. Selecting a copy first saves the departing copy and changes the visible preparation only after the selected copy is retained.
5. Reopen a saved record or receiving to continue its draft. Record forms are tied to their original portfolio version and subject; receiving selections and notes are tied to the original reconciliation. A different native selection does not inherit another record's review.
6. If a copy's recorded portfolio differs from the running service's selection, use **Open this copy's saved selection**. That explicit action invokes the original native portfolio selection. Simply importing or choosing a browser copy does not change the native selection or dispatch a request.

The mapping's complete text remains its authoritative edit. Choosing a saved mapping, starting the default mapping or receiving a destination schema deliberately updates that text. Per-feed publication/payment JSON remains in the original form and passes to the original action unchanged.

The controls are temporarily disabled while a selected copy changes or an original action is being prepared. This preserves the displayed form, selected receiving target and complete file while asynchronous work finishes.

## Complete files and portable copies

**Export complete copy** saves one private JSON file containing:

- The named copy, original native workspace binding, selected context and all retained unfinished forms.
- Every selected original file, with its exact bytes, filename, byte count and SHA-256.
- Complete original pending request payloads.
- The first retained successful outcome, distinct later outcomes and imported receipt observations.
- References from this preparation to the original native operation identities.

The export retains original bytes, including a UTF-8 BOM or gzip input. Parsed source identity and raw-file identity are separate. Native source receiving still performs its original complete-page, metadata, hash and scope validation. Customer CSV receiving still uses the complete original UTF-8 string and filename.

To reopen, first restore/open the corresponding native workspace ZIP with the original CLI or Applications workflow, preserving its UUID. Then choose **Import as separate copy**. The importer validates every complete file before a single transaction installs the new copy and its files. It never overwrites an existing named copy. Existing native operation identities stay single; multiple copies retain explicit references to them.

A copy from another workspace cannot be silently applied to the current workspace. Open its original workspace first. An imported completed receipt remains an imported observation when a locally pending record already exists; continuing that original request asks the native journal for its actual current result.

The native file limits continue to apply: source input and its expanded JSON up to 256 MiB; complete customer CSV up to 16 MiB; supplied schema text up to 2 MiB. The complete source action's serialized envelope must also fit its native 256 MiB limit. Working-copy exports support up to 512 MiB of retained original files and a complete JSON up to 1 GiB. Browser copy metadata supports 32 MiB; large original files and request payloads are stored separately from form edits.

Browser storage is scoped to the application's browser origin and profile. A listener moving to another port or another browser profile can use the full private export to receive the original preparation. Keep that export with the native workspace handover.

## Continue an interrupted native request

The browser retains the original complete payload before the first POST. An interrupted response leaves that original operation in **Handover → Continue retained browser work**. Continue uses its original operation ID and asks **GET /api/operation** for the actual full native record.

The native journal resolves an existing exact action and payload before the current revision check. Source-import and customer-file payloads are recovered through the native object store when the journal holds their object hashes. The same operation then reopens its existing result or continues its original execution. A new browser copy, import or restart does not create a replacement operation.

The accepted outcome is retained before the pending browser record is cleared. Reopening a completed original result keeps the first successful receipt. Different later responses remain separate observations. Complete copy export/import/re-export preserves these request and receipt files.

## Storage errors and concurrent windows

Each save compares the original browser-store revision inside the same IndexedDB transaction that writes the new copy. Another window's save produces a visible conflict rather than silently overwriting its work.

The conflicted window keeps its current fields. Use **Export complete copy** to retain them, then **Reload saved copies** to read the current shared browser state. Importing that export creates a separate preparation. An import or selected-file read that fails validation or storage capacity leaves the preceding stored copy intact.

Do not clear browser storage to repair a conflict. Export useful copies first. Removing a copy preserves shared original request references; its sole pending original operation must be continued before that final referencing copy is removed.

## Installed source and the original receiving programme

The existing OpenFEMA browser manifest serves the two new modules through the same original workspace server. The maintained openfema-portfolios selection includes those assets and this guide through its original contribution. No second native server, source store or publisher is introduced.

The whole receiving entry point is [examples/working-copy-receiving.mjs](examples/working-copy-receiving.mjs). It operates the original completed DR4724 workspace, including its full 195-project exchange, with a retained complete customer CSV. It closes the browser, reopens the same profile, retains an actual native export after its browser response is interrupted, continues the same operation, imports and re-exports its complete copy, observes a real concurrent-window conflict, and saves desktop and narrow screenshots.

Run it on an owned restored receiving workspace after stopping any existing writer of that destination:

~~~sh
node examples/working-copy-receiving.mjs \
  --application /absolute/installed/openfema \
  --workspace /absolute/private/original-received-workspace \
  --workspace-id cd6abeaf-b23e-468d-a3a1-5a24fecef859 \
  --customer-csv /absolute/private/original-complete-customer.csv \
  --out /absolute/private/openfema-working-copy-receiving \
  --playwright /absolute/current/playwright/index.js \
  --chromium /absolute/current/chromium
~~~

Keep the original receiving operation **OPENFEMA-OPERATOR-WORKING-COPIES-22B7-20261013**, full request files, browser profile, source selection and output directory on continuation. The predecessor native programme is **SCF-OPENFEMA-MERCHANT-EXCHANGE-22B7-20261012**. Its completed source, customer data, native results and full archive are reused; this programme does not reacquire the cohort or repeat its completed merchant exchange.

The driver writes complete-copy downloads, actual native operation IDs, progress/result files and actual rendered screenshots into its owned output. Review the images themselves and operate any failed or unclear control in the actual page. A captured image alone does not establish a rendered review.

The original source/package input is the complete merchant exchange archive, 3,992,142 bytes, SHA-256 **6729729eba12d4ad02eecce2fe930e8fbda235dcd90cdc5ca2c8f953522274a6**. Its inner native Workspace ZIP is 31,768,935 bytes, SHA-256 **dc06babfdb1707bb9d418e4a8b39dc9fe8b1fe1530aedb2eaa56a5a4c3481769**. Restore it through the maintained native importer and keep its original UUID and journal.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Before calling any customer/prospect-facing application, website, dashboard, demo, report, presentation or export ready, open/run/render the exact outgoing version, look at the rendered screen or its actual screenshots, and operate the important user controls. Inspect the actual screenshare width and narrow/mobile width where relevant, populated/empty/loading/error states, downloads/exports and reopening. Capturing screenshots without viewing them is insufficient. Code review, DOM counts, HTTP 200, unit checks and another worker's approval do not replace seeing the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk; do not run broad suites or build a verification product.

Include this complete instruction in delegated assignments and the active owner-controlled policy, boot, build and receiving guidance those workers actually read. Preserve all other owner controls and original operation identities. Leave historical records and third-party/vendor policies intact. Do not force restarts, create watchers or revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999

