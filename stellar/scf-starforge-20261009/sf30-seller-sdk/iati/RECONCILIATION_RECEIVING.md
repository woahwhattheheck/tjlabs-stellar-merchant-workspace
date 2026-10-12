# FCDO financial coverage: complete operating and receiving programme

This operation takes the actual FCDO organisation publication and its full activity publication through the original IATI workspace, a reviewed financial comparison and independent receiving. It runs as part of the composed IATI application. The programme uses its original XML, organisation, activity, native dataset, CLI, HTTP, client and merchant implementations.

Operation: `fcdo-financial-reconciliation-cb2a-20261012`
Source workstream: SCF-IATI-FINANCIAL-RECONCILIATION-CB2A-20261012.

## The original records

| Selection | Original publisher context |
| --- | --- |
| Organisation | GB-GOV-1, FCDO |
| Organisation period | 1 April 2026 to 31 March 2027 |
| Organisation amount | GBP6,815,000,000 |
| Organisation value date | 31 March 2026 |
| Organisation status | Reported indicative budget, status 1 |
| Activity | GB-GOV-1-400043-401, one WADI child |
| Activity basis | Four whole original quarterly budgets, type 1, GBP |
| Activity value date | 18 September 2025 |
| Activity status | The raw budgets omit status. The original mapper applies IATI status 1, Indicative, with standard-default provenance. |
| Coverage | This explicitly selected child and its selected periods |

| Whole period | Original nominal GBP amount |
| --- | ---: |
| 1 April–30 June 2026 | 103,192 |
| 1 July–30 September 2026 | 164,543 |
| 1 October–31 December 2026 | 723,056 |
| 1 January–31 March 2027 | 509,209 |
| Four-quarter total | 1,500,000 |

The programme reads these values from the complete retained XML and selects the corresponding rows produced by the original native engines. The source values in the table identify the intended operation; they do not replace the parser or calculation.

The organisation source describes its future amounts as collated planning budgets assembled from approved and pipeline programme plans. It says the future ODA budget has not yet been allocated and that these figures do not reflect expected allocations. The programme extracts the complete original qualification from the selected organisation node and retains it in the comparison scope, source context and complete reports.

A selected child's budget does not establish whole-organisation coverage. The operation keeps the selected scope, both original value dates, original financial eligibility, budget status provenance and complete source editions with every report.

## Input custody

Use the source files already retained by the original input operator. The programme accepts the full activity XML or its exact original gzip and streams the content into the original workspace.

| Input | Complete source identity |
| --- | --- |
| FCDO organisation XML | 99,013 bytes; SHA256 c18e63db2d543eaeb5525a4df21cd16561f0316dab831789bfdd176e1accdfce |
| FCDO activity XML | 8,496,890 bytes; SHA256 98a6bad80d60aa8deaa35fe1a593313515649a9fae7456895d1bfed4ac4a756d |
| Retained activity gzip | 647,227 bytes; SHA256 4df991d0ce8bbcc2ff44d0c71644f9f6fb2f4b10c9edd037294d146634433645 |
| Organisation HTTP acquisition | The original successful publisher receipt within acquisition.json |
| Activity HTTP acquisition | Original examples/fcdo-wadi-2026/publisher-receipt.json |

Original publisher URLs:

- https://iati.fcdo.gov.uk/iati_files/organisation.xml
- https://iati.fcdo.gov.uk/iati_files/solr/FCDO-set-20.xml

The activity publication contains 1,332 activities. The selected child contains six budgets and eleven transactions before financial-year selection. The complete publication remains in the original source store and nested portfolio packet.

The original acquisition owner retains the organisation source under its `publisher/fcdo-organisation.xml` and the corresponding acquisition JSON. The original WADI carrier retains `examples/fcdo-wadi-2026/FCDO-set-20.xml.gz` and its original receipt. Reuse those files when they already exist.

## Run the actual product operation

Install the composed application source, including the original native IATI/XML runtime, current organisation implementation, reconciliation engine and HTTP/CLI hooks, typed client, browser assets and merchant source-workspace bridge. Use the existing equipped native runtime and native executable that already operate this application. Keep the operation output outside the installed application source tree so the original complete-source exporter selects only its installed code.

The programme is `iati/reconciliation_receiving.py`. It embeds its Node continuation and writes that continuation into its own private output directory. The emitted continuation and private configuration use content-hash filenames, so an actual source or runtime correction can continue the same saved operation while preserving its earlier attempt.

Example using existing original absolute paths:

```bash
python3 /absolute/installed/iati/reconciliation_receiving.py \
  --organisation-source /absolute/original/publisher/fcdo-organisation.xml \
  --organisation-acquisition /absolute/original/acquisition.json \
  --activity-source /absolute/original/examples/fcdo-wadi-2026/FCDO-set-20.xml.gz \
  --activity-receipt /absolute/original/examples/fcdo-wadi-2026/publisher-receipt.json \
  --mcp-directory /absolute/installed/stellar-forge/mcp-merchant-operator \
  --playwright /absolute/installed/playwright/index.mjs \
  --chromium /absolute/installed/chromium/chrome \
  --output /absolute/private/fcdo-financial-reconciliation-cb2a-20261012
```

The existing native SF30 executable and Node configuration are inherited from the original application's environment. Supply `--node /absolute/node` when that host has an explicit Node path.

When the original organisation operating case has been exported from this same composed application source edition, add:

```bash
  --organisation-packet /absolute/original/delivery/FCDO_Organisation_Planning.zip
```

The original organisation receiver requires the complete installed Python source edition to match the packet. The earlier 82-member revision-4 packet predates this reconciliation source; its owner must restore and re-export that existing plan from the composed source before using it here. The programme receives the compatible original plan and uses its selected immutable candidate. Without this option, it creates an assessed, unedited baseline from the same complete original publisher XML. The programme retains all source findings and the assessed validation result. Its financial case remains a distinct operation from the original organisation document correction/release case.

The default named reviewer is the actual internal operator identity “Commons financial receiving operator CB2A”. Supply `--actor` with the actual operating reviewer when another operator runs the programme.

The complete browser continuation is embedded in the programme. Supply the accepting host’s existing absolute Playwright module entry and Chromium executable through the required `--playwright` and `--chromium` arguments. It opens the original application, operates the source/match/review/history controls at desktop size, reads the separate dated revision and historical comparison, downloads the complete three report files, recovers the named review by its original request, captures the reviewed case at phone size, and receives the complete packet into the original second workspace. Screens and complete downloaded files are retained under merchant/editions/<source-sha256>/browser/ for the installed source edition used by that operation.

## One case through the complete journey

The initial organisation assessment and native activity portfolio are retained once. The activity portfolio selects all four whole original quarterly budgets for child 401. Subsequent comparison changes reuse those native source editions.

1. **Separate dated contexts.** The first comparison selects the original organisation total budget and all four activity quarters while keeping value dates separate. The four differing-date amounts remain visible as excluded records. The comparison has no additive subtotal or numerical difference for that separate context.

2. **Explicit nominal coverage.** The operator chooses comparison of original same-currency nominal values, keeps both value dates and selects all four quarters. The native engine derives GBP1,500,000 selected coverage and GBP6,813,500,000 difference within that expressly limited scope.

3. **Named full-year review.** The operator records the original issue decisions and reviews the full-year comparison. Replaying the original save and review requests reopens their original saved revisions.

4. **Changed selection and lost acknowledgement.** The operator changes the comparison to the first three whole quarters, retaining the original full-year activity portfolio. The programme deliberately discards the save reply and reads the committed result back using its exact original request ID. The changed selected subtotal is GBP990,791. Its original period-coverage issue identifies the retained fourth quarter outside the current selection.

5. **Reviewed scope change and history.** A named review records that scope. Historical comparison identifies the change over unchanged original organisation and activity editions. The earlier reviewed four-quarter case remains available by its immutable revision.

6. **Complete delivery and independent receiving.** Both reviewed scopes receive complete HTML, CSV and JSON files. The current financial packet retains the complete revision/request histories and both complete original nested organisation and activity packets. After closing the original workspace, the programme uses the actual CLI to reopen it, recover the historical request and receive the packet into a second original workspace. It reopens that receiver, retrieves the earlier full-year review and reproduces the complete current report files.

7. **Original operator continuation.** Borrowed private connections expose those same workspaces to the installed HTTP/client and merchant bridge. The continuation reads complete registers, full files, historical requests and the retained packet using the actual product routes and tool actions. It receives the original nested packet through the merchant route and closes the connections before final independent CLI request readback.

No currency conversion, proration, duplicate activity editions or mixed parent/child rollup is introduced by the programme.

## Retained output

Open delivery/index.html for the current complete financial review and both selected scopes. Its neutral, responsive opening page links the matching reports and portable packet and presents the original publisher qualification. Every complete installed source edition also has an immutable opening page and packet under delivery/editions/<source-sha256>/. The exact directory and file identities appear in operation-state.json.

The private operation directory is the continuation point. It contains:

| Output | Purpose |
| --- | --- |
| operation-state.json | Original operation identity, source/plan/case selections, current sourceEdition, per-edition phases, actual result metadata and continuation attempts |
| publisher/source-context.json | Parsed original financial records, complete FCDO planning qualification, source identities and raw/default status provenance |
| publisher/*-acquisition.json and activity-receipt.json | Original publisher acquisition records |
| requests/ | Exact organisation, portfolio, financial save/review and historical comparison commands |
| reports/full-year-review.json | Complete reviewed four-quarter case |
| reports/final-case.json | Complete current reviewed three-quarter selection |
| reports/historical-comparison.json | Changed selection over the same retained original source editions |
| delivery/index.html | Current readable opening page with both reviewed scopes, their reports, original publisher qualification and matching full receiving packet |
| delivery/editions/<source-sha256>/index.html | Retained opening page for one complete installed source edition |
| delivery/editions/<source-sha256>/FCDO_WADI_Full_Year_Reviewed.html, .csv, .json | Complete full-year review in three usable formats |
| delivery/editions/<source-sha256>/FCDO_WADI_Current_Selection_Reviewed.html, .csv, .json | Complete current-scope review in three usable formats |
| delivery/editions/<source-sha256>/FCDO_WADI_Financial_Reconciliation.zip | Complete financial history and original nested source packets |
| delivery/editions/<source-sha256>/Received_FCDO_WADI_Current_Selection.html, .csv, .json | Reports reproduced through independent native receiving |
| sender-workspace/ and receiver-workspace/ | Both original native application workspaces |
| merchant/editions/<source-sha256>/operation-result.json | Complete actual client, merchant and browser continuation result for this source edition |
| merchant/editions/<source-sha256>/browser/ | Desktop and phone views, original separate-dates view, and complete browser-downloaded HTML/CSV/JSON |
| reports/editions/<source-sha256>/installed-source.json | Exact original managed source map and complete nested organisation packet source map |
| reports/editions/<source-sha256>/receiver-final-request.json | Committed final review readback after operator disposal and native reopen |

The complete JSON files preserve every source row, issue, decision, date, financial dimension and selected immutable revision. The human-readable reports retain the selected scope and publisher planning qualification.

## Continue an interrupted operation

One process lock covers the complete operation, including source preparation, native workspace close/reopen, browser continuation and final reports. A second caller can continue after the original process exits. Retained requests, reports and copied files are written to a private temporary file, closed and verified before they are atomically published. A failed write, including a full disk, leaves the final path available for the same original request to resume; that invocation removes its own incomplete temporary file. Existing complete files and all original request/revision identities remain intact.

Rerun the same command with the same original output directory and inputs. The programme keeps the original organisation assessment, activity portfolio, all five financial comparison revisions and exact request inputs. Original product request IDs recover already committed operations. It records native receiving and operator completion separately for each complete installed source edition, so completed phases from an earlier edition cannot skip the current receiving journey.

A nonzero continuation result records its exact phase and a local diagnostic under reports/editions/<source-sha256>/. Resolve that specific operation failure in the composed original source and rerun the same operation. The programme reopens the original saved case and exports its existing reviews and complete request history into a new source-edition directory. It then receives the new compatible packet into the same original receiver and continues the full client, Merchant and browser operation. Source changes do not create replacement organisation plans, portfolios or financial revisions.

The source-edition key combines the original managed.inspect_binding(...)["source"] map with organisation.portable.source_files(), using the programme's digest_file to retain each installed source member's byte count and SHA256. The first map is the application's maintained installed source inventory; the second includes every organisation support asset and all recursive IATI/XML Python bodies retained by the nested organisation packet. Workspace inode, path and Python process identities do not enter this key. Complete HTML/CSV/JSON files, packets, native receiving reports and Merchant outputs use that exact source directory. Earlier completed source editions remain available, and delivery/index.html is updated to the current edition.

An operation created by an earlier programme with a single fixed delivery path can resume in the same output directory. Its previous packet and output metadata are retained under previousDeliveries in the operation state, and its saved case is re-exported into the current source-edition directory. A source change while a process is running is recorded as a continuation point; rerunning the same command completes the new edition with the same saved work. The final COMPLETE operation state names completedSourceEdition; the CLI result prints sourceEdition and the current packet explicitly.

The private connection files are transient product credentials. The deliverable reports and final result contain stable selections and file identities; they do not require the bearer-token contents.

## Source integration and adoption

Add this programme and guide with the reconciliation source closure. The composed runtime should include the current original source-workspace transport update from the organisation receiving owner and all existing application features.

The source package for this operation is published to the original IATI workstream thread alongside the cumulative engine and operator source. Native execution should return the actual operation-state.json, complete delivery packet, full-year/current reports and merchant operation result to that same workstream. Preserve the original operation directory until its deliverables have been adopted by the cumulative source owner.
