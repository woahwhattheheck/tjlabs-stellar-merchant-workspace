# WQX water quality: scientific editions and KiWIS commissioning

Operate a complete water-quality study from retained source through reviewed receiving choices, reporting-unit summaries and a second operator's editable project. The selected application includes original WQX capture and sample joins, Open Waters receiving, concentration worksheets, paired scientific editions, KiWIS monitoring and native laboratory correspondence, and complete customer receiving through the existing paid Water Quality job.

The same private project holds the original source families and each immutable saved decision. Operators can inspect complete records, compare editions, export their full work and continue it in an independent installation. This guide joins the installed application, scientific work, commissioning and paid delivery into one operating workflow.

## Install the complete selected application

Build the maintained source selection from the intended commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref ORIGINAL_COMMIT \
  --selection wqx-water-quality --out /absolute/wqx-release
~~~

The build receipt gives the actual archive, source revision, selection, file count, byte count and SHA-256. A resumed build uses the same output and `--resume`; omitting the selection on resume inherits the original selection. Use the actual receipt's archive and hash with the included `runtime-install prepare`, `install` and `inspect` operations. Configure native dependencies and the `schema`, `openapi` and `mcp` feature groups; the original Linux/Python operator is selected with `--operator`.

~~~sh
starforge runtime-profile catalog
starforge doctor --native --feature schema --feature openapi --feature mcp
starforge source
starforge registrations --source wqx-water-quality
~~~

The package keeps the original installer, dependency versions, installation lock and recovery behavior. Node 22 or later runs the application; the full retained receiving operation uses Node 24, Python 3 and an existing Playwright/Chromium installation. Selecting this source does not download or start a browser. Keep private project, merchant, customer, input and output directories outside the immutable installed source.

A separately delivered [complete source application with paid scientific delivery](https://github.com/woahwhattheheck/public-commons-sprint-2026/tree/main/deliveries/wqx-paid-scientific-editions-20261012) contains 668 exact source files, the original Potomac input carrier, the complete four-phase scientific receiving entrypoints and the original paid-mode receiver. Its source manifest records the preceding 664-file scientific application and every merged paid-mode postimage. The installed product recipe uses this standalone repository’s current compatible shared runtime and preserves its other source-owned providers.

## Open the same saved project

In Runtime workspace, select a READY installation and open **Applications → WQX water quality**. Attach or create the private project through the original application form, save that selection, then Start and Open. The managed application keeps its own source, selection and process binding. Its browser and merchant tools address the same project. Stopping an MCP client releases that client's resources; it does not discard or replace the managed application's state.

The original command surface remains available:

~~~sh
starforge water-quality --help
starforge water-quality-managed --help
starforge water-quality-decisions --help
starforge merchant-wqx --help
~~~

Capture the intended organization, station, activity, result and date selection, or receive an existing original capture. Retain every successful native response and status receipt. Review completeness and source issues before interpreting results. The sample join preserves organization-scoped identities, original fields, activity/station context, duplicate findings and every supplied or embedded detection-limit record. Reopening a retained capture requires no new provider request.

Create the ordinary scientific review and original Open Waters plan. Review exact field mappings, reference values and native constraints in the receiving desk. Save and reopen their original IDs and hashes. Source acquisition, source review, receiving choices and analysis selection have distinct saved identities, so a narrower analysis window never silently shortens the captured population or a merchant edition.

## Review reporting units across the full population

Open the original saved receiving plan in the receiving worksheet. Its complete target table supports CSV and TSV export/import, Keep, Set and Clear decisions, explicit reasons and source-bound preview. Select the original concentration group and intended reporting unit in the concentration panel. The proposal identifies every affected result and each independently represented limit. Review it before applying those choices to the worksheet.

A mass-per-volume conversion changes the exact decimal representation using the original converter. It retains the result's inequality, qualification and detection condition. Each limit keeps its original type, value, unit, comment and source pointer alongside the reviewed representation. Blank nondetect results and unspecified result units stay blank when only their supported limits are converted. Unsupported dimensions need their own explicit receiving decision; they are not added to a concentration cohort by assumption.

The complete Potomac cohort demonstrates 298 populated mass/volume results plus 451 supported blank-result rows with convertible limits. One optical NTRU record remains an explicit Keep with both original limits unchanged. Its 750 reviewed choices cover 749 conversions and that retained optical exception. The original source still contains all 1,035 result identities and all 1,112 reported limits.

Export the full worksheet, inspect the proposal/audit report, preview the complete native plan and save its new immutable decision-review and receiving-plan IDs. A changed source or draft invalidates the old preview. After an uncertain save, reopen the selected ID and compare its request/document/preview binding before continuing the same operation.

## Save paired scientific editions

Open **Scientific analysis**, select the saved decision review, and choose the title, optional analysis window and baseline window. Keep estimated and otherwise qualified measurements visible while selecting only scientifically justified arithmetic eligibility. Preview returns the complete original and reporting-unit summaries, source-bound observations and the exact scientific identity that Save requires.

Save an original-unit scientific edition first when the handover needs a clear baseline. Save the reviewed edition with that earlier review selected. The complete earlier scientific record travels with the new edition, so the receiver verifies the declared earlier review hash and recomputes both source-bound analyses before accepting the comparison.

Groups retain original site, characteristic, fraction, speciation, unit, method and sampling/laboratory context. Reporting-unit groups use reviewed concentration representations while keeping those other scientific distinctions. The result table presents original and reviewed values together. Qualified, censored, missing and nonnumeric records remain visible even when excluded from means. Relative change is supplied only for supported ratio scales; the source guide describes absolute and scale-specific changes.

Use the observation and group filters to inspect the saved analysis, then open a result's original source/limit context. A period comparison and a comparison between saved editions are different operations. The first compares matched groups across chosen time windows; the second also reports additions, removals, source changes and receiving-choice changes. Neither by itself establishes a causal environmental trend.

## Complete merchant and customer operations

The WQX provider contributes **39 WQX tools** to the maintained merchant. Shared provider tools may also appear in the selected installation. Initialize the original WQX merchant with its workspace connection file; use configured workspace aliases, not arbitrary injected project paths.

`merchant_wqx_scientific_preview` and `merchant_wqx_scientific_save` accept the native scientific request through the typed client's `{request}` envelope. Save includes the original `expectedPreviewSha256`. Inventory selects `kind: "scientific"`; record and file retrieval select the scientific family; complete project intake selects the scientific receive kind. These operations join the existing concentration proposal, worksheet, inventory, source, edition and buyer tools.

Large results return an exact retained-file descriptor. Use the included WQX client or CLI to receive every chunk and verify the full byte count and SHA-256. The original transfer limit remains 128 MiB and the chunk size 65,536 bytes. Upload interruption resumes from the server's authoritative `receivedBytes`; download interruption retains the local prefix and original descriptor identity. Managed-host restart uses the same configured application and retained files.

The existing paid function remains `waterQualityReview` at `/water-quality-review`, implemented by the original [Water Quality job application](../../stellar/scf-starforge-20261009/sf30-seller-sdk/wqx-water-quality/jobs/README.md). Its default review mode keeps complete source-review and Open Waters behavior. Explicit `mode: "scientific"` receives a complete saved paired scientific bundle. The request requires the exact saved `reviewId` and `expectedScientificReviewSha256`; optional source hashes also bind the original capture and review. The existing native receiver reproduces both selected source editions before delivering all seven scientific exports, the sealed input, selected identities and complete result manifest.

The [paid scientific operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/wqx-water-quality/jobs/PAIRED_SCIENTIFIC.md) provides the complete input example, original checkout/job interfaces, file limits, archive members and native receiving command. Save analysis windows, reporting-unit choices and the earlier edition in the original private operator before checkout. The paid job retains those reviewed choices; it rejects separate legacy choices and plan IDs in scientific mode. Its original input-file service accepts the complete scientific source up to 128 MiB, while legacy review input stays at 64 MiB.

The shared jobs merchant, sealed-input store, native SF88 customer and original payment/recovery records remain the paid delivery path. A new quote, customer request or payment uses the original reviewed merchant terms and buyer operation. The source-native paid receiver verifies same-job output, independent project receiving and cold reopening of all seven exports; publishing this source is separate from its actual execution receipt.

## Export, receive and continue the study

A scientific edition provides seven full exports: JSON, observation CSV, observation TSV, grouped summaries, changes, HTML report and complete receiving bundle. The bundle includes the exact current source graph, decision review, source-bound analysis and the complete prior scientific identity when selected.

Download and verify all required files before handover. Receive the bundle into the intended project through its native scientific receive operation. The receiver binds the operation before importing either source, resumes interrupted imports under that same binding, verifies source and review identities, recomputes the scientific result, and saves the immutable edition only after those comparisons pass. A different input cannot reuse an existing receiving ID.

Reopen the received edition, compare all seven exported byte hashes, and cold-restart the receiving project. Continue the next study or decision review from that received project through the original source interfaces. Preserve the original request, review IDs, export descriptors and operation receipts with the customer handover.


## Commission monitoring and native laboratory results

Open the installed **WQX water quality** application on the intended private project and select **KiWIS commissioning**. The command equivalent opens the same workspace:

~~~sh
starforge water-quality serve --project /private/commissioning-project --port 0
~~~

### Select and retain the complete programme

Choose the actual KiWIS QueryServices endpoint, datasource, response timezone and original time-series identifiers. A null datasource explicitly selects the provider default. Choose either the complete history or explicit date windows with offsets. If the service needs consecutive requests, the selected programme retains every returned physical row and each request's original inclusive boundary.

Use **Acquire** to retain the selected series metadata, original quality and release catalogues, stations and time-series values. A saved acquisition records the full response bytes and their original URL, status, retrieval time and content identity. Resume that same source name and selection to continue unfinished requests. Original JSON number tokens, string values, nulls, duplicate timestamps and quality codes remain available for inspection.

A programme can also import already retained original response packets. Pair the monitoring source with one complete counterpart:

| Counterpart | Original input used by the receiver |
| --- | --- |
| WQX review | Complete native review bundle, including its original capture and records. |
| WQX scientific edition | Complete saved scientific bundle, including selected current and previous source editions. |
| Laboratory EDD result | Complete original result ZIP, including its documents, tables and staff decisions. |
| KiWIS WQM samples | Complete original sample-value response packet, including full JSON or ZIP bytes and all physical rows. |

Use the [complete KiWIS operator guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/wqx-water-quality/kiwis/GUIDE.md) for the selection and packet schemas, original field paths and every acquisition/import command. The existing WQX and Laboratory readers receive their respective native inputs.

### Review the actual correspondence

Choose the counterpart's original station and parameter fields and the actual target values. Select the source date, time and offset fields separately. For a timestamp without an offset, record the intended time interpretation and its reason. A WQM timestamp and sample timestamp are independent original fields; choose the field that represents the agreed relationship.

Define the native record key from the actual provider or laboratory fields. The complete original rows remain independently identifiable even when visible keys or timestamps repeat. Select the allowed time window and review the full candidate population.

Quality dispositions retain each original service code and its catalogue meaning. Give an explicit reason for retaining an unknown value or excluding a value from candidate selection. The original observation remains in the source and export when its quality disposition changes.

The interface shows four correspondence states:

| State | Operator meaning |
| --- | --- |
| UNRESOLVED | The record still needs an explicit link or separation choice. |
| LINKED | The selected original observation is a current candidate under the saved mapping, time and quality choices. |
| SEPARATE | The operator keeps the records separate and saves the reason. |
| REVIEW_REQUIRED | A changed choice puts an earlier selected link outside the current candidate population; its original selection and reason stay visible. |

Inspect the full original record before deciding an ambiguous match. A unique candidate can be selected explicitly with the programme's recorded reason. Multiple candidates remain available for review. An explicit separation also forms part of the complete decision record.

### Save, compare and hand over the full edition

Preview the current source and choices, then save a new immutable review name. The saved record binds the complete source pair, field mappings, time interpretations, quality decisions and correspondence reasons. Changes to the draft produce a new preview; save another review name to retain a later edition.

Open the current saved review, select the earlier review and choose **Compare editions**. The operator sees both complete count sets, count changes, state transitions and every added, removed or changed mapping, quality choice, time interpretation and link. Search and filter the full before/after record table; each entry opens its original candidates, selected times and explicit reason. Download the complete comparison to retain both decision documents, every physical review record and both saved identities.

For identical source editions, the original physical row IDs pair exactly, including independently retained replicates. Across changed sources, the original source comparison supplies only unique physical matches and keeps ambiguous or unpaired records visible. Its proposal to carry unchanged earlier decisions is available separately and creates an editable draft when applied.

~~~sh
starforge water-quality-kiwis compare --project /private/commissioning-project \
  --review commissioning-review-02 --previous-review commissioning-review-01 \
  --out /private/complete-saved-review-comparison.json
~~~

Deliver all eight outputs:

| Output | Complete contents |
| --- | --- |
| Complete bundle | Both original source families, saved review and editable decisions for another project. |
| Review JSON | Full saved review, source bindings, candidates and counts. |
| Decisions JSON | Editable field mappings, time interpretations, quality choices and correspondence reasons. |
| Observations CSV | Every original monitoring observation, retained scalar types, duplicate rows and request pointers. |
| Counterparts CSV | Every original native counterpart record and its source context. |
| Correspondences CSV | Every record's state, all candidates, selected choice and reason. |
| Series CSV | Complete selected series, metadata, programme windows and quality/coverage counts. |
| HTML report | The complete human-readable review, counts, choices and source bindings. |

Transfer the **Complete bundle** to the receiving operator. The native receiver reconstructs the selected source pair and saved review in an independent project. Reopen that project through the same managed application, inspect the original records, and continue with a newly named edition when more work is required.

## Deliver a commissioning review through the paid Water Quality job

Use the existing **waterQualityReview** function with explicit `mode: "commissioning"`. Select the exact saved review name and both saved-record and native-review hashes. The complete source bundle is the function's original `source` file slot; it carries the full programme and counterpart already used by the operator.

Prepare the input selection with the installed command:

~~~sh
starforge water-quality-commissioning-job source \
  --source /absolute/complete-commissioning.json \
  --expected-source-sha256 ACTUAL_COMPLETE_FILE_SHA256 \
  --out /private/commissioning-request.json
~~~

The [paid commissioning guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/wqx-water-quality/jobs/COMMISSIONING.md) supplies the exact saved-selection arguments, merchant configuration, customer Request workflow, typed MCP result download and independent receiving commands. The configuration belongs to the actual merchant: use its real origin, payment network, asset, recipient, price and facilitator.

The customer supplies the complete source through the existing Request application, prepares its checkout, follows the resulting original job and receives the complete result ZIP. The original sealed input store retains the declared filename, media type, length, source hash and policy binding. The shared worker consumes that source and invokes the native commissioning receiver.

Commissioning source files can contain up to 128 MiB. The result ZIP limit is 64 MiB compressed, with an expanded archive limit of 512 MiB. The installed input receiver and native file stream handle the full accepted source. The complete ZIP includes the original sealed bundle, complete saved selection, all eight native exports, manifest and operating instructions.

Use the maintained `water-quality-commissioning-job` commands to download, receive and reopen the exact result. Its typed paid-job client carries the original job/file identity into the download and records the archive's actual bytes. Independent receiving verifies the original source and saved review, reproduces all eight exports and retains a private customer project. A cold reopen checks that same complete project after shutdown.

The original 39 WQX merchant tools remain available for source, worksheet and scientific operations. Commissioning delivery uses the existing paid-job MCP operations and the maintained commissioning customer client.

## Receive a complete commissioning installation

Select the entire agreed source programme in the included [receiving configuration](../../stellar/scf-starforge-20261009/sf30-seller-sdk/wqx-water-quality/kiwis/receiving.example.json). Set its actual original capture or provider packets, complete counterpart, saved review names, mappings, explicit reasons and private project directories.

The browser phase uses the actual installed Playwright ESM entry and Chromium executable. Supply the browser runtime's required library environment and launch arguments. The configured reviews open at desktop and mobile sizes, expose original records, save an operator edition and download all eight outputs through the actual workspace. The receiving project repeats the native exports and reopens independently.

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/wqx-water-quality/kiwis/receiving.mjs \
  --programme /absolute/complete-receiving-programme.json
~~~

Keep the programme, original inputs and output directory together. Completed phases retain their source and saved-review bindings. Continuing the same programme uses those saved phases. `COMPLETE.json` records the complete selected programme, reviews, browser downloads and independently received editions.

For paid receiving, pass that complete saved bundle to the original `jobs/receive-commissioning.mjs` driver as described in the paid guide. It uses the native sealed-file store, canonical request and original worker, receives the complete archive, repeats the same job and input, and performs independent and cold receiving of all eight outputs. Retain the full customer project and result archive for the continued installation.

## Original Potomac result and receiving state

The complete retained Q1 2025 Chain Bridge population contains 1,035 results, 13 activities, one station and 1,112 reported limits. Source-module execution preserves 452 censored results, 146 qualified results and 10 estimates, with 413 default arithmetic rows across 279 scientific groups. It converts 749 result representations and 1,089 independently reported limits while retaining all original values and labels. The selected March-versus-January analysis compares 64 matched groups.

Those calculations were executed on the original complete modules and retained source in connected V8. The maintained native receiving program additionally exercises the original source/CLI operation, native scientific exports, desktop/mobile browser receiving and the 39-tool MCP/client flow in four serial phases. Consult its actual retained phase receipts for completion; the source archive does not claim an unexecuted native browser or customer run.

The [full receiving guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/wqx-water-quality/standardized-analysis/RECEIVING.md) gives the exact same-operation configuration, resource declaration, phase commands, expected observations and output files. Retain that complete source and input together through a runtime interruption.

