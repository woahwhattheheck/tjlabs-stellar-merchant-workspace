# Named material review and author receiving

This extends the existing offline recipient and original material-catalogue operator. A colleague can keep a named working review, propose customer/material approvals or rejections, return the complete proposal history, and let the author explicitly compare it with current decisions. Adoption uses the original catalogue transaction and request Journal. No server, account or network is needed to prepare the offline review.

## Prepare the complete customer delivery

Use the maintained reader builder from the repository root:

```sh
node products/material-catalog/recipient/build.mjs \
  --bundle /private/delivery/catalog-bundle.jsonl \
  --output /private/delivery/Material_Catalog_Complete.html
```

Keep the exact original JSONL bundle alongside the HTML. The builder validates the whole bundle and refuses to overwrite an existing output. Use a new explicit filename for a later delivery. The catalogue must have a selected edition before a colleague can start a review.

Open the HTML, inspect Overview, Materials, Customer decisions, Supplier records and Original sources, then open **Review and return**. Existing author records remain complete and separate from proposals.

## Colleague: save and return reviewed work

1. Enter the named reviewer and choose **Start named review**.
2. Enter the exact customer identifier and original customer description. This pair defines the existing author decision context. Description comparison uses the same Unicode, case and whitespace normalization as the original operator; the original typed description is retained.
3. Find and select a material from the original selected edition. Choose Approve or Reject and explain the reason. **Save proposed decision** adds a complete sealed proposal revision; editing a proposal retains all earlier revisions.
4. Use **Save complete working review** for the complete original bundle, proposal history and unfinished form. **Save complete working HTML** carries that same working state in a directly reopenable browser file. Both files can contain the customer's complete dataset and belong in the original authorized private delivery.
5. **Download complete review return** produces the named return for the author. It contains the original catalogue/edition identities, each complete proposed material, the original decision reference and full proposal history. Keep the original complete bundle with the handover.

**Restore complete working review** opens the saved working JSON after validating its whole original bundle and retained review references. The working HTML opens itself. Opening another bundle or closing with unsaved work asks you to preserve the current review first. The browser does not automatically store private work or send a return.

## Author: review against the actual current catalogue

Export a fresh complete bundle from the existing author workspace, open it in the reader, and choose **Review and return → Open named recipient return**. The author workspace must still retain the exact original catalogue revision, edition, material and original decision history referenced by the return.

Each returned context displays its complete proposed material, status and note beside the current author decision. Make one explicit choice for every context:

- **Keep current** leaves that context unchanged.
- **Adopt returned proposal** is available only when the current selected material is unchanged and the proposed decision is not already identical.
- A newer author decision is shown as a conflict and still requires an explicit choice.
- Missing or changed current materials require a new review of the current catalogue. The earlier return remains retained; its proposal is not silently remapped.

Enter the receiving operator and reason, then download the reviewed receiving request. The full comparison hash binds the actual catalogue, current decisions, selected materials and all choices. Repeated downloads of unchanged choices use the same request ID. Changing a choice, actor, reason or comparison creates a new explicit request.

You can save the complete author working review before receiving. This includes the return, comparison, unfinished actor/reason fields, every selected choice and the exact receiving request identity.

## Apply through the original installed operator

The following commands use the existing source configuration and existing author workspace. Substitute their actual paths; do not create a replacement database for live customer work.

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/cli.mjs \
  catalog-review-return --return /private/returns/Material_Review_ID.json \
  --source /private/author/source.json --workspace /private/author/workspace
```

This previews the return against the native current database. If it differs from the browser comparison, export the current complete catalogue and review again. Do not edit a saved comparison hash to force acceptance.

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/cli.mjs \
  catalog-receive-review --request /private/returns/Material_Review_Receive_ID.json \
  --source /private/author/source.json --workspace /private/author/workspace
```

The original transaction checks the exact request, comparison and selected material/decision revisions before committing all adopted decisions and the Journal result together. Any failure rolls back the whole adoption. Existing `catalog-decision` behavior remains unchanged. Supplier interpretation, supplier corrections, prices and stock values are not changed by a customer-match review.

After a lost response, inspect the same original request ID:

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/cli.mjs \
  catalog-operation --request-id ORIGINAL_REQUEST_ID \
  --source /private/author/source.json --workspace /private/author/workspace
```

An exact reissue of the unchanged receiving request returns its original completed result. Do not create a different ID to repeat an uncertain adoption. A changed request with the same ID is rejected.

## Deliver the complete adopted catalogue onward

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/cli.mjs \
  catalog-export --catalog ORIGINAL_CATALOGUE_ID --format catalog-bundle.jsonl \
  --output /private/delivery/catalog-after-reviewed-return.jsonl \
  --source /private/author/source.json --workspace /private/author/workspace
```

Inspect the completed export receipt, build a new complete reader from this exact file, then close and reopen it. The original decision history contains every prior author revision. The first adopted decision in a receiving transaction carries the complete review text, comparison, choices, actor and reason; any other decisions adopted together reference that exact retained receipt. Existing v1/v2 export/import preserves these full records without a new database schema. A later normal decision edit leaves the earlier adoption receipt in history.

If every choice keeps current, the full request and result remain in the original Journal and no artificial business decision is added. Keep that receiving request and Journal result with the return; an ordinary catalogue bundle does not contain the operator's whole Journal.

## Limits and complete-file behavior

Named return files are bounded at 4 MiB, 2,000 contexts and 5,000 complete proposal revisions. Receiving requests are bounded at 8 MiB after JSON encoding. Each resulting decision and history frame must fit the original 8 MiB portable frame contract before any adoption commits. A large complete return can still exceed that nested frame bound; preserve it and split the proposed work into separate named reviews rather than dropping history.

Original catalogue bundles remain bounded at 256 MiB in the browser. A complete working review, including JSON escaping of its original bundle, is bounded at 400 MiB. The reader retains complete original and parsed data in memory. For larger catalogues, use the original streaming native importer and split actual named review work without claiming that a partial source is a complete catalogue.

## Same original customer receiving course

The existing `recipient/receive.mjs` is the one browser course. Its optional `--review-return` suffix operates this feature on the same selected complete bundle and same browser context after the original seven-section course. It creates two private receiving workspaces below that course's owned directory; these are declared receiving copies, not the live author database.

```sh
node products/material-catalog/recipient/receive.mjs \
  --bundle /private/original-course/exports/supplier-customer-workspace-v2.jsonl \
  --sha256 ACTUAL_COMPLETE_FILE_SHA256 \
  --directory /private/original-course/offline-recipient \
  --playwright /actual/installed/playwright/index.mjs \
  --executable /actual/installed/chromium --review-return
```

The current supplied-HTML/existing-context route is preserved. Its `receiveRecipientBrowser` API accepts `reviewReturn: true` or `resumeReviewReturn: true`, and opens every complete working/onward attachment through the same selected transport. Use the full published source with the optional native suffix; a browser-only source closure does not need that native import.

Use the existing equipped owner and original operation. The first original programme requires a new output directory. Its named-review suffix holds the original directory's flock through browser and native work (use the existing Linux host's flock executable). If the seven original browser sections completed and a later response was lost, use the same command, input, source and directory with `--resume-review-return` instead of `--review-return`. It verifies the exact source binding and built HTML before opening the original files. A live original guard rejects a second runner. Earlier browser-phase failures still require reconciliation of that original phase; they are not silently replaced by a new case.

Each suffix attempt retains its own screenshots/downloads in a distinct subdirectory. Before any native adoption it durably saves the full original request plus return and working-file identities. Continuation reopens those exact files and reuses the original Journal request; it never regenerates a request that may already have committed. Every continuation freshly exports the actual current author and independent-recipient databases into new attempt-specific files, then compares their complete tables and source identities against the retained intended result. Prior exports stay intact; old equal files alone never establish a current reopened result. Missing or changed retained input stops continuation with that original case intact. The report is published atomically with file and directory sync.

The suffix uses actual browser controls to create two proposal revisions, preserve a pending draft, download complete working JSON/HTML, cold reopen, compare the full return, and save the exact receiving request. It imports the original bundle through the maintained CLI into the declared author receiving copy, applies/replays the same request, exports the complete onward catalogue, imports it into an independent recipient, then verifies all original sources/history and the complete adopted return. It captures desktop and 390-pixel screens.

Open and inspect all retained images, the working HTML, return, receiving request and onward reader before recording rendered completion. Source parsing and a pure source exercise do not establish browser or native completion. The original raw-XML supplier course remains EE290/ISO's single pending native operation; this suffix does not start another supplier run.


## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

