# WQX water-quality scientific editions

Operate a complete water-quality study from retained source through reviewed receiving choices, reporting-unit summaries and a second operator's editable project. This selected application includes the original WQX capture and sample joins, Open Waters receiving, the complete concentration worksheet, paired scientific editions, the managed browser, 39 WQX MCP tools, the native customer workflow and the original file-backed scientific job.

The [scientific guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/wqx-water-quality/SCIENTIFIC.md) explains grouping, eligibility, exact arithmetic and comparison semantics. The [merchant guide](../../stellar-forge/mcp-merchant-operator/WQX_WORKSPACE.md), [concentration operations](../../stellar-forge/mcp-merchant-operator/WQX_CONCENTRATIONS.md) and [paired-science operations](../../stellar-forge/mcp-merchant-operator/WQX_SCIENTIFIC.md) give complete agent and typed-client requests.

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

## Original Potomac result and receiving state

The complete retained Q1 2025 Chain Bridge population contains 1,035 results, 13 activities, one station and 1,112 reported limits. Source-module execution preserves 452 censored results, 146 qualified results and 10 estimates, with 413 default arithmetic rows across 279 scientific groups. It converts 749 result representations and 1,089 independently reported limits while retaining all original values and labels. The selected March-versus-January analysis compares 64 matched groups.

Those calculations were executed on the original complete modules and retained source in connected V8. The maintained native receiving program additionally exercises the original source/CLI operation, native scientific exports, desktop/mobile browser receiving and the 39-tool MCP/client flow in four serial phases. Consult its actual retained phase receipts for completion; the source archive does not claim an unexecuted native browser or customer run.

The [full receiving guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/wqx-water-quality/standardized-analysis/RECEIVING.md) gives the exact same-operation configuration, resource declaration, phase commands, expected observations and output files. Retain that complete source and input together through a runtime interruption.
