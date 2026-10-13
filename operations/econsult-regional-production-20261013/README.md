# Econsult regional production and complete customer receiving

This operation delivers a complete regional employment and wage reporting workspace for the five-county Philadelphia region, Pennsylvania and the United States. It operates the original 2025 Q1 and 2026 Q1 source selections, produces both full report editions and PDFs, reopens the complete economic project, and composes its research source catalogue, complete customer-agent workflow and original MTC regional sources into the same customer project.

Original operation: ECONSULT-REGIONAL-PRODUCTION-9B2C-20261013.

## Maintained source

- run-econsult-native.py receives an exact complete application source packet and runs the existing QCEW production, browser and Research catalogue, customer-agent and optional MTC source programmes.
- materialize-econsult-originals.py receives the fourteen complete original CSV attachments using the original provider metadata and stable file identities.
- econsult-profile.json contains the complete selected report definition.
- econsult-programme.json contains the original two-period production selection.

The maintained QCEW programme is under stellar/scf-starforge-20261009/sf30-seller-sdk/fred/qcew. Its full quarterly source support is merged in PR1346; the preceding selected-programme and annual-replay changes are PR1283 and PR1313. Research sources and products run inside the same economic project through fred/research, its existing project journal and the complete v7 project receiver.

The complete source-transfer carrier, original attachment receipts and commercial scope are indexed in the original company coordination:
https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791871492210889

The complete eleven-file kit is maintained alongside this guide at execution-kit.json. Its 4241871 bytes have SHA256 a84a29757d6a1dabe50234f847ceeccbe20097f87c49ec3e63be288ed1db9462. It includes the complete 285-file application donor, original source references, complete Research agent workflow, original MTC catalogue integration, commercial workshare, full receiving guide and selected Research commerce course. Decode every complete files[] member into an owned private kit directory and use the commands below. Its application member is econsult-complete-source.json: 4034074 bytes, SHA256 4b6fe9cd3ebb970e49680d293381d699d5d2919491a933b0011c4b2a77527d8f, Git blob 63206da96ea959a71498775b7f1417b656d5dada. This commons.complete-source-transfer.v1 packet retains every complete UTF-8 body, full-file identity and inventory count. The controller validates the whole source before receiving its application tree.

## Existing native runtime

Use an existing Linux worker with Python 3, Node 22.16 or newer, Chromium, Playwright and pdfinfo. Pass the installed executable and complete Playwright module paths explicitly. Browser profiles and temporary files stay within the operation's private runtime directory.

The original company course uses one private directory and an inherited operation lock. If a process or retained result already exists for it, continue that original directory. The complete source selection and inputs remain part of its identity.

## Receive the fourteen original CSV files

The full matrix contains two periods × seven geographic selections:

| Selection | BLS area |
| --- | --- |
| Philadelphia County | 42101 |
| Bucks County | 42017 |
| Chester County | 42029 |
| Delaware County | 42045 |
| Montgomery County | 42091 |
| Pennsylvania | 42000 |
| United States | US000 |

The original attachments total 6,208,094 bytes. All ownership, industry and aggregation rows remain in the saved files.

From the complete kit, use acquisition-metadata.json and original-file-references.json. Resolve fresh provider URLs for those exact stable references when the receiving host is ready. Save the filename-to-URL mapping in an owned private provider-downloads.json. These temporary transport URLs stay outside the repository and delivered public documents.

~~~sh
python3 materialize-econsult-originals.py \
  --metadata acquisition-metadata.json \
  --metadata-sha256 cbe36fd668b154d4a24f197671c559ab97b8a02b9da45f50b36c19ce80146001 \
  --downloads /private/provider-downloads.json \
  --directory /private/econsult-originals
~~~

The materializer verifies the complete original byte counts, computes full-file SHA256 values, retains each complete body and provider receipt, and emits received-slices.json. On interruption, continue the same directory. Refresh expired transport URLs only for originals that still need to be received.

## Operate reports, catalogue and the complete handover

From the complete kit directory, select the current carrier SHA256 and actual runtime paths:

~~~sh
PYTHONDONTWRITEBYTECODE=1 python3 -B run-econsult-native.py \
  --packet econsult-complete-source.json \
  --packet-sha256 4b6fe9cd3ebb970e49680d293381d699d5d2919491a933b0011c4b2a77527d8f \
  --directory /private/econsult-regional-production \
  --profile econsult-profile.json \
  --programme econsult-programme.json \
  --received-slices /private/econsult-originals/received-slices.json \
  --research-catalogue \
  --research-agent \
  --node /existing/node \
  --chromium /existing/chromium \
  --playwright-module /existing/playwright/index.mjs \
  --pdfinfo /existing/pdfinfo
~~~

The selected complete kit contains the research input at receiving/esi-research-catalog-4593/input.json, its complete original BLS methods representation and original CPI table, and the full catalogue source. The --research-catalogue option binds that exact input and its operation to the original company identity.

The programme performs five complete stages:

1. Admit every original CSV and produce the full retained source manifest.
2. Operate both regional report editions, PDFs, calculations, source-row exports and independent whole-project receiving.
3. Open the original production project in the installed browser and operate its report, source and complete-project receiving flow.
4. Receive that actual complete economic project into the research course; retain the selected source inventory and files, review the sources, issue both research-product editions, download and reimport the full catalogue CSV, capture desktop and phone views, and export, receive and reopen the complete v7 project.

5. Operate the complete Research agent against that same project: browse every revision-bound catalogue/source/review/product page, recover saved native requests, download and reopen original chunked source bytes, then independently receive, reopen and reexport the complete project.

The controller checks that the final catalogue project preserves the original economic project identity, complete QCEW source extension, QCEW state and every FRED capture. It identifies that combined complete project in completeCustomerProject. The original two-edition report programme remains available when --research-catalogue is omitted.

## Continue an already-started original operation

Keep its ROOT/operation.json, ROOT/source-packet.json, ROOT/source, input files, original research directory and all completed journals. Supply the original retained packet and original packet hash as the base selection. Add this complete source edition explicitly:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B run-econsult-native.py --packet /private/econsult-regional-production/source-packet.json --packet-sha256 ORIGINAL_PACKET_SHA256 --source-edition-packet econsult-complete-source.json --source-edition-sha256 4b6fe9cd3ebb970e49680d293381d699d5d2919491a933b0011c4b2a77527d8f --directory /private/econsult-regional-production --profile econsult-profile.json --programme econsult-programme.json --received-slices /private/econsult-originals/received-slices.json --research-catalogue --research-agent --node /existing/node --chromium /existing/chromium --playwright-module /existing/playwright/index.mjs --pdfinfo /existing/pdfinfo
```

Read ORIGINAL_PACKET_SHA256 from that operation's retained operation.json packetSha256 field. The original selected profile, programme and received-slices files must be the same files used for its first run. The controller validates the complete original source, receives this full successor separately at ROOT/source-editions/4b6fe9cd3ebb970e49680d293381d699d5d2919491a933b0011c4b2a77527d8f/source, verifies that every original selected receiving input and FRED source capture is unchanged, and uses the successor application to continue unfinished stages. Completed stage files retain their original byte identities.

The separate source-edition record identifies the actual executable source used. Customer-agent receiving has its own journal under the same company root; the original controller retains orchestration and archive ownership. A completed agent journal is reused unchanged.

## Add the complete original MTC regional sources

The source packet also includes operations/econsult-regional-production-20261013/mtc-source-catalogue. It retains the original two-page forecast PDF selection (152937 bytes), four-page agency FAQ selection (777707 bytes), all28 published regional table values in JSON and CSV, full catalogue definitions, the complete importer and operating guide. Retain the published nine-county regional aggregate, units, years and forecast interpretation when using these sources.

Resolve the two PDF stableReference values in catalogue-input.json through the existing Notion file download action. Save its exact files/unresolved result to private mtc-current-download-map.json. Read ORIGINAL_RECEIVING.md and run:

```sh
python3 SOURCE/operations/econsult-regional-production-20261013/mtc-source-catalogue/receive-mtc-originals.py --catalogue-input SOURCE/operations/econsult-regional-production-20261013/mtc-source-catalogue/catalogue-input.json --download-map /private/mtc-current-download-map.json --directory /private/econsult-regional-production/mtc-original-files
```

Use the materialized complete SOURCE directory. When continuing an older company operation, SOURCE is the complete successor under ROOT/source-editions/4b6fe9cd3ebb970e49680d293381d699d5d2919491a933b0011c4b2a77527d8f/source; receive that edition with the existing controller first, or materialize its full source packet into a separate private kit source directory before this acquisition. Retain the existing source selection and complete received files across retries. View all six rendered pages and both exact source PDFs. Add --mtc-originals /private/econsult-regional-production/mtc-original-files to either complete company command above. The controller requires --research-catalogue --research-agent and continues the same ROOT/research/project after the complete customer-agent course. It imports every original source and its complete product definition, opens each saved source through the maintained native project, independently receives the whole project and verifies the reopened originals and full reexport.

ROOT/mtc-source-receiving/receiving-result.json identifies the exact source selection, original native requests, complete project, independent receiving and reexport. The controller selects that whole received project as completeCustomerProject. Existing native source-review and product-issue controls remain available for reviewing these originals and issuing the regional product. View all original PDF pages, source rows, table values, coverage, downloads and reopened complete project in the actual browser before presenting this edition.

## Continue the issued Research product through customer receiving

The complete application now includes Research publication, its existing native asset seller and Buyer, an independent editable customer receiver, complete commerce project transfer, the Merchant/Customer browser controls, the research CLI and installed customer-agent tools. Continue this as another stage of the same company programme after the retained catalogue and installed Research agent have completed.

The supplied `research-commerce-selection.json` selects the already-issued `regional-source-menu` product. Its first run freezes the actual latest issued edition ID from the existing company project in `ROOT/research-commerce/original-selection.json`. An explicit `editionId` selects a particular retained edition. Later runs keep the original frozen edition even if staff have since issued another. The complete original selection file is retained in `ROOT/inputs`.

Add these arguments to the same complete company command, retaining its original root, inputs and base source packet and selecting this complete source edition:

```sh
--research-commerce-selection research-commerce-selection.json --pdftoppm /existing/pdftoppm
```

The stage operates the existing `ROOT/research/project`. It carries the selected original product definition, issued edition, original source definitions, complete captured files and accepted reviews into one complete product package. The package supplies a readable standalone report, structured edition, source catalogue, source-rights information and all selected original files. Other company research and the private economic programme stay in the full private project handover.

It then creates an independent native customer project, reopens the original graph and source files, saves a following editable product definition, issues a following edition through the maintained native controls, and transfers that complete customer project to another directory. Original IDs and issued definitions remain available throughout. The browser course opens the producer, customer and restored workspaces at desktop and narrow widths, operates the actual important controls, downloads the complete selected files and opens the outgoing readable reports and PDF attachments. Receive the captured images and page renders in the original company thread and LOOK at them under the inspection instruction below.

The original regional source menu is already issued by the catalogue course. The separate MTC source catalogue remains available alongside it. To select the MTC product, finish its actual source review and issue its edition in the original project, then use its exact product and edition IDs in a deliberate separate product receiving selection. Preserve the completed regional course and its original selection.

### Use the existing native payment installation

The same selection can include the complete existing payment installation. Supply all five native payment fields together:

```json
{
  "schema": "commons.econsult-research-commerce-selection.v1",
  "productId": "regional-source-menu",
  "buyerConfig": "/existing/private/buyer.json",
  "paymentFile": "/existing/private/research-public-payment.json",
  "origin": "https://existing-merchant.example",
  "facilitator": "https://existing-facilitator.example",
  "merchantPort": 4317,
  "path": "/research-products",
  "acceptIndex": 0,
  "allowLocalFacilitator": false
}
```

Replace the example paths, public HTTPS endpoints and fixed proxy port with the original installed selections. The payment file supplies the existing seller terms and Stellar testnet network for this operating course. The course reads the configured native Buyer and binds its settings, original payment bytes, public resource and selected port before dispatch. It retains its prepared request and executes the original intent once. On interruption, continue the same selection and course directory so the Buyer recovers that original intent.

The native payment arm publishes the exact same selected product package, receives the paid result and every original member, and carries the publication, prepared customer requests and receiving selections through complete private project export and independent reopening. The browser then reopens that same paid intent, recovers its original result, resumes its original receiving destination and downloads its retained files. Its additional deliberately unstarted prepared request stays unstarted and travels in the final complete project.

The complete selected gzip and each offered member must fit the existing native seller's 16 MiB per-file and 64 MiB aggregate asset capacities. The full selected source graph, all original files and source-rights information remain complete. Publication resolves package and offer capacity before reserving the native project transaction; an operator can retain a rejected selection, correct the selected product or terms, and submit a new original request through the Merchant controls.

### Keep the full result in this company programme

`ROOT/research-commerce/result.json` identifies the exact selected product and package, independent editable customer, following edition, restored customer, optional native financial result and actual browser result. `ROOT/research-commerce/complete-original-project.json` is the final complete original company project after the browser course, including any saved browser-prepared request. The controller checks this exact file against its retained descriptor and selects it as `completeCustomerProject`.

`researchCommerce` in the original `archive-result.json` joins the frozen selection, native result file, independent customer, restore and optional financial course. The original controller continues to own logs, child process IDs and the full operation archive. Accepted previous stages reuse their original outputs. A started Research commerce stage requires its original selection on continuation. Native and browser journals retain each complete executable source edition separately from the original business selection. A repaired application can continue its unfinished stage from a deliberate controller source edition while preserving the completed source, receiving and payment steps.

Read `SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/fred/research/COMMERCE.md` for the full operator and installed-agent instructions. The maintained browser helper is `fred/research/commerce-browser.mjs`; the native course is `fred/research/commerce-journey.mjs`. Both ship in the same complete source packet used by this original controller.

## Inspect the actual delivered application and reports

Before presenting this customer-facing workspace, report, PDF or export as ready, the producer opens or renders the exact outgoing version, looks at its actual screens or screenshots, and operates the important controls. This requirement applies to current, future, resumed and delegated workers across providers and local or cloud runtimes.

For this programme, inspect both populated regional report editions and their complete PDFs, the source catalogue and its two issued research products, and the reopened complete customer project. Use the actual presentation width and a narrow/mobile width. Operate source selection, report navigation, catalogue review, file attachments, CSV download and reimport, full-project export and reopening. Inspect the relevant empty, loading and error states as well as populated screens. Open the final attachments and exports so missing files, clipped tables, broken links and unreadable pages are repaired before delivery.

Capture desktop and narrow-width screenshots with the existing receiving programme and return the actual images and rendered report pages to the producer in the original company thread. The producer must view those images; capturing them alone, code review, DOM counts, HTTP success, unit checks or another worker's approval do not replace seeing the rendered product.

Fix visible and functional faults in the authorized source and repeat only the affected receiving step with its existing operation identity. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve the original data, calculations and complete project. Keep inspection tied to actual repairs; avoid broad suites, repeated checking or a separate verification product.

Carry this complete requirement into assignments and the active build and receiving guidance used by every delegated worker. Preserve the original operation, retained directories, completed work and other owner controls. Historical records and third-party policies retain their original form. Use existing workers without forced restarts or new watchers. If the local runtime is unavailable, give the existing equipped receiver the complete exact version and these opening steps, review its actual rendered results, and continue independent implementation while it runs.

Owner instruction: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999

## Completion and continuation

Each child inherits the original operation lock. Logs stream into the retained private operation directory. A completed stage is reused only while its complete result bytes match the saved identity. An interrupted stage retains its original directories, requests, source and logs for continuation.

The final archive includes the entire materialized application, original inputs and CSV intake, all project directories, complete report and research files, browser output and full logs. archive-result.json names its actual archive, length and hashes. completeCustomerProject names the final portable customer JSON and its complete byte identity. researchAgent identifies its complete customer-agent receiving; mtcSources identifies the original MTC source receiving and independent reexport when selected.

Return archive-result.json and the full archive to the original company thread. Keep the native operation directory available for the same continuation and receiving work.

## Source and methodology

The selected regional profile sums five disjoint counties and compares the result with Pennsylvania and the United States. Quarterly employment uses the mean of three monthly counts. Regional weekly wages use summed original quarterly wages divided by summed quarterly mean employment and thirteen weeks. Disclosure states remain visible. The selected report is nominal and compares the same quarter across the two years.

The original CPI table is retained separately as national price context. The research catalogue retains BLS publication methods and that original CPI source with distinct geographic and analytical roles. Its source and review histories travel inside the complete economic project.

Original source documentation:
https://www.bls.gov/cew/additional-resources/open-data/home.htm
https://www.bls.gov/cew/overview.htm
https://fred.stlouisfed.org/data/CPIAUCSL
