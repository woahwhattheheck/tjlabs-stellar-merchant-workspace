# Receive original tabular output in Research

This component takes an explicitly selected producer table and its complete original files into the maintained Research comparison workflow. It preserves original values, source rows, reviewed exclusions, candidate/protocol editions, accepted requests, reports and editable dossier history. It performs no scientific, financial, model or currency calculation.

Use the complete Research installation. These modules import its original contracts, store, report and portable-stream code. The original application, authenticated listener, scientific evaluator and customer workspace remain authoritative.

## Prepare the actual output contract

Begin in the existing Research workspace. Select the intended dossier and its actual research question. Retain protocol/method sources through the normal source controls and record their actual source-edition IDs. Customer data and private source files stay in the authorized private workspace.

A preparation plan names one original tabular output edition, its SHA256 and byte count, actual candidate release, explicit comparison protocol and producer's original execution metadata. The table contains one measured output per row. Select its exact headers in the mapping. A workbook or SAS report remains an original attachment; select the producer's own tabular export or retain the explicit reviewed conversion and its original workbook together. This importer does not guess spreadsheet cells, run macros or present an undocumented vendor schema as known.

Complete plan-template.json. Its REPLACE_ values are instructions, not accepted identities or example customer data.

| Field | Original meaning |
| --- | --- |
| rowKeyColumns | Complete original key, including period/segment/metric dimensions as needed |
| selection | Exact column/value filters; AND across filters, OR inside each values list |
| fields.criterionId | Existing measured criterion ID in the selected protocol |
| fields.value | Original numeric string column |
| fields.unit | Original unit, exactly matching the criterion's unit |
| fields.label, definition | Readable metric identity and complete definition |
| fields.cohortRef | Actual population/segment reference for the row |
| denominator | Named original fields or explicit reviewed literals defining the denominator |
| missingTokens | Exact original unavailable strings, without trimming or case folding |
| missingReason | Original or reviewed explanation for an unavailable value |

A binding is exactly {"column":"Original header"} or {"literal":"Reviewed definition"}. The value must select a column. Denominator strings stay unchanged; a member-month denominator never becomes a person denominator.

Unformatted decimal lexemes such as 0, -1.25, 1.2500 or 4e-7 remain exact strings. Currency symbols, grouping marks, decimal commas, percent signs and whitespace require a reviewed producer export or conversion before import. Original files remain attached. Unavailable output becomes null with its explanation; missing values never become zero.

Every source row appears in the review, including outside-selection rows. Blank or duplicate keys remain findings. An explicit exclusion requires the complete original key, reason, reviewer and ISO timestamp; unused exclusions are rejected. Selected unmapped criteria, inconsistent units, invalid decimals or missing denominator context require a revised plan. A review-required package has no importable run.

State population, exclusions, market, period, price year/currency, runout and prospective/concurrent use in the case scope. Different definitions can remain separate criteria or cases. A shared label does not justify combining estimates.

## Prepare and inspect

From the complete source checkout:

~~~sh
node stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/comparison/original-output/prepare.mjs \
  --plan /absolute/private/selected-plan.json \
  --out /absolute/private/prepared-output-edition
~~~

Files resolve relative to the selected plan or their explicit absolute paths. The reader checks declared size before reading, streaming size/SHA, and opened descriptor plus named-file identity after reading. Source symlinks are rejected.

Preparation produces the exact plan.json; review.json with every row, value, metric, exclusion and finding; readable review.html with full-record controls, complete-record search and full JSON download; native run.json only when ready; manifest.json with exact output identities; and intent.json for the immutable selected plan.

The original table and every declared workbook/report/log are embedded with exact identities in the native run. Its 64 MiB bound includes JSON/Base64 overhead. Larger material uses the original retained-source workflow and an explicitly reviewed output scope, with full source references. Never silently drop members or rows.

Open review.html and use its search and record controls. Read all findings and original files. A changed plan uses a new edition directory. Repeating an unchanged plan preserves completed bytes. Files publish through fsynced private temporary files and exclusive final links; interrupted writes never overwrite accepted editions.

## Receive complete editions

Complete receiving-template.json with existing dossier ID, actual actor, one original operation ID and selected prepared directories/manifest identities. All packages select the same complete protocol, including original question and criteria. Their candidate releases and original runs may differ.

For an existing case, set existingCase to its exact caseId and caseVersionId; its complete definition must match. Otherwise the course creates one case in the existing dossier. It creates no second customer workspace or scientific engine.

~~~sh
node stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/comparison/original-output/receive.mjs \
  --selection /absolute/private/original-receiving-selection.json \
  --store /absolute/private/existing-research-store \
  --directory /absolute/private/original-output-receiving
~~~

Use a private operation directory (0700) and the existing store. One flock owns this course; the native store retains its original write/revision authority. For a remote application, its authorized operator runs beside that original store. Credentials stay in the original private host configuration.

Before writing, the course retains the complete dossier/actor/operation/protocol/package/source intent. Before each native action it saves the full request, original UUID and expected revision. Repeating the course reuses that exact request. A stale unaccepted request remains for deliberate reconciliation; no automatic rebasing or substitute UUID occurs.

Each candidate/run enters through the maintained API. The course verifies original raw JSON and every member, then exports complete HTML/CSV/JSON at the final accepted revision. It retains the whole native dossier stream, cold-reopens it independently, compares selected report and original bytes, and replays all accepted requests without advancing the received revision.

The operation retains reports, original files, mapping reviews and the complete editable dossier. Its receiving-result.json gives actual accepted IDs, operations, selected revision, source and output identities. Later legitimate dossier work remains intact.

## Finish research review and receiving

Open the actual Research **Comparisons** screen. Inspect candidates, original producer results and source cohort/period/denominator/units. Use **Named judgment** and **Decision** with the actual investigator, rationale, limitations and selected runs.

This course's report snapshot precedes any following investigator decision. After review, export the new accepted revision through the original dossier **Export**, plus its readable comparison reports. Keep the earlier snapshot as its original edition.

After an interrupted accepted native request, rerun the same selection and operation directory. The original engine resolves its hash-bound request. Continue report/file saves from the original accepted generation. On another authorized host, select physical directories explicitly while retaining plan/manifests, dossier ID, implementation identities and original request bytes.

For actual risk-study computation use the original risk_study evaluator and adapter. This output importer does not replace cohort, uncertainty, scaling or scientific methods.

## Actually inspect the product and every attachment

Bryce's instruction applies to every current, future, resumed and delegated worker: literally open/run/render/view/play/use the exact outgoing product and every attachment as its recipient would. Open populated Research at desktop/screenshare size and 390px width. Use important controls, errors, original-file downloads and the reopened project. Look at captured screenshots. Open the HTML review/report, CSV in a spreadsheet, JSON originals and each workbook/PDF/report. Extract an outgoing archive and open its usable contents and working project. Source parsing, hashes, HTTP success or another worker's approval cannot substitute for actual use.

Fix unreadable, clipped, cramped or broken output and continue the same operating case. Use restrained industrial design and preserve source calculations. Avoid broad test sweeps, verification products, service restarts and GitHub Actions. If the runtime is unavailable, join the existing equipped receiver with complete exact source and opening steps, while continuing useful engineering. Record rendered inspection only when it occurs.

For generated video/audio use high-quality available generative voice/media, then actually watch/listen to the final export, preserving current spending and voice controls. Private datasets, credentials and commercial terms stay on authorized private surfaces.

Owner instruction: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
All-attachment clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949
