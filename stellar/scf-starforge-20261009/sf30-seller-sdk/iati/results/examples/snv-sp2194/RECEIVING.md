# SNV SP2194: complete source-bound Results receiving

This programme uses the complete retained D-Portal activity-export representation
for SNV activity **NL-KVK-41152786-SP2194**. It prepares a reviewed baseline
comparison, carries the whole activity into a later report edition, receives the
complete editable project twice, preserves the review and request histories,
and continues that same receiving workspace through the original browser,
typed client and Merchant tools.

The original operation is
**iati-results-snv-sp2194-6966-20261012**. There is one case root and one native
programme. Source preparation is separate from a completed receiving outcome.

## Complete original input

Retain both files from this directory together:

| File | Exact identity |
| --- | --- |
| SNV_SP2194_DPortal_Source_20261012.zip | 17,001 bytes; SHA-256 1ef7186ef080158ab15c0815ae1c18107cea7d981d0567a069912a7fa5935b9d |
| THIRD_PARTY_NOTICES.md | 3,039 bytes; SHA-256 72e0fb7d2f8f6ad4f87a427c461eaba0f330f3f28bb684f48573556376a4518a |
| XML inside the ZIP: snv-sp2194-dportal-activity-export.xml | 21,249 bytes; SHA-256 2bbc8f8a367f304c186a69e7e9b3a399118a472dcfd093a35dad1672a2347539 |

The source ZIP preserves the entire published JSON response, the original
D-Portal structural exporter and its source pins, the consulted schema-order
data, the reproducible recipe, the declared local XML encoding dependency
adapter and the resulting XML. Its original activity-tree comparison was
completed when the source was recovered. This is a **D-Portal activity export**;
its bytes are not represented as the publisher's complete XML file.

Original published source:
https://d-portal.org/q.json?aid=NL-KVK-41152786-SP2194

Publisher organisation source:
https://rsr.akvo.org/organisation/3210/iati/

Original structural exporter:
https://github.com/IATI/D-Portal

Keep the complete third-party notice with redistributed exporter source.
Do not regenerate or reserialise the retained XML for this receiving operation.

## What the actual source reports

The full source has one activity, four results, twelve indicators, ten
baselines, six periods, twelve actual values and **no targets**. The source has
nine zero-valued quantitative baselines, one qualitative year-only baseline and
two indicators without baselines. The normal Results projection retains those
differences and all original narratives, references, document links, source
locations and element identities.

The reviewed comparison is the first indicator of the second original result:

| Original field | Retained value |
| --- | --- |
| Activity | NL-KVK-41152786-SP2194 |
| Indicator locator | /iati-activities/iati-activity[1]/result[2]/indicator[1] |
| Title | Number of people trained in sustainable livelihoods |
| Measure / direction | measure=1; ascending=1 |
| Baseline | value="0", year="2025"; no ISO date, dimensions or location |
| Period | 2025-04-01 through 2026-02-01 |
| Female actual | value="882.00", dimension Gender=Female |
| Male actual | value="1466.00", dimension Gender=Male |
| Undimensioned actual | value="2348.00", no dimension or location |
| Target | None reported |

The source description refers to people with improved awareness of their rights
to land and natural resources. That wording differs from the indicator title.
The report preserves both, with the receiving operator's explicit interpretation.

The selected operation is **baseline-change**. It binds only the original
undimensioned baseline and undimensioned actual in their same dimension/location
context. Its exact decimal result is **2348.00 people above the selected
baseline**. There is no target attainment percentage or baseline-to-target
denominator. The Female and Male observations remain distinct and are never
added to the reported undimensioned actual. The source's year-only baseline
keeps its original precision; no ISO baseline date is supplied.

This is an authored analysis and receiving exercise against real published
data. The named receiving review is not a publisher endorsement.

## Prepare the exact original selection

Use the complete source edition and installed runtimes chosen by the existing
receiving operator. The helper needs only Python's standard library and the
original IATI application source. It downloads nothing.

From the repository root, with a private owned absolute case directory:

~~~sh
python3 -B stellar/scf-starforge-20261009/sf30-seller-sdk/iati/results/examples/snv-sp2194/prepare_snv.py \
  --source-zip /ABS/retained/SNV_SP2194_DPortal_Source_20261012.zip \
  --root /ABS/private/iati-results-snv-sp2194-6966-20261012 \
  --operator "Actual receiving operator"
~~~

Preparation checks every ZIP member's original path and bytes, retains the
complete source and notice, reads the actual XML through the original
Results projection, and verifies the exact selected records. It calls the
original report model to verify the source-matched baseline change before
writing a create-only controller selection. It creates no IatiWorkspace.

The resulting files are:

- controller-selection.json: the immutable exact native input and review basis;
- source-preparation.json: original member hashes, projection identity, reported
  coverage and selected baseline calculation;
- source-inputs/: unchanged source ZIP, full third-party notice and original
  extracted members.

Repeat preparation with the same root, operator and input to recover those
same files. A changed existing original is rejected without replacement.

## Run the whole existing native and browser programme

Add **--run** to continue the existing Results programme. To finish the
coupled original browser/client/Merchant receiving in the same execution
context, provide all four original installed runtime/source paths:

~~~sh
python3 -B stellar/scf-starforge-20261009/sf30-seller-sdk/iati/results/examples/snv-sp2194/prepare_snv.py \
  --source-zip /ABS/retained/SNV_SP2194_DPortal_Source_20261012.zip \
  --root /ABS/private/iati-results-snv-sp2194-6966-20261012 \
  --operator "Actual receiving operator" \
  --run \
  --node /ABS/actual/node \
  --playwright /ABS/actual/playwright \
  --chromium /ABS/actual/chromium \
  --merchant-root /ABS/source/stellar-forge/mcp-merchant-operator
~~~

Use actual canonical runtime paths. The original console validates path identity;
a different source or runtime selection is not an interchangeable continuation.
Use the existing host's normal operation and foreground. This helper creates no
scheduler, independent service, publisher capture or second case.

The programme retains the full original XML, creates the source-bound report,
records the configured named review, resolves an exact lost-reply replay,
expands to all twelve source indicators, and compares that coverage change
without calling it a change to source values. It reconciles a delayed tab,
exports the complete project and report, receives into the original second
workspace, adds the local receiving review, explicitly inspects an older head,
and confirms a repeat import does not replace that selection. A second-generation
export is received and reopened with the complete original edition and receipt
history.

The browser then uses that same receiver. It inspects original source values,
saves the next review, exercises the original request journal, compares
editions, downloads and receives the full project, retains the selected local
head, and reopens at desktop and phone widths. The original typed client and
Merchant complete-file reader consume the same underlying console and exports.

## Retained outputs and recovery

The original native result is **result.json**, with state COMPLETE only after
the whole native receiving programme succeeds. Its exact final editable project
and report ZIPs are listed under artifacts. The separate original browser
continuation records its own outcome in console-receiving/ and performs a cold
reopen after closing the original browser/server handles.

On interruption, keep the same root, controller selection, source bytes and
operation ID. Continue the same command. The native programme reads its retained
requests and exported identities before any state change; a completed result is
verified and returned. Do not create another case to conceal a partial stage.

Return the native result, browser result, complete editable project/report ZIPs,
original source/provenance and the source/runtime manifests to the existing
receiving owner. Private console tokens, browser selections containing those
tokens and browser profiles remain in console-private/ or the original private
runtime surface; they are not customer source attachments.

The full project ZIP is the editable receiving product. A report-only ZIP is
readable output and is not a substitute for the full original-source project.

## Composition

Both original installed source bindings retain the same complete IATI, refresh
and Results source paths: iati/managed.py and
distribution/runtime-workspace/application-iati.mjs. The complete selected
source retains the current refresh UI/CLI/client/Merchant hooks. The Merchant
transport also consumes the original Node HTTP stream correction from A5F3,
preserving full-body timeout and retained-file ownership on Node 24.

The whole programme has one original source, one configured review basis and
one local receiving history. No financial dataset build, settlement operation,
new publisher request or external publication is performed by these commands.
