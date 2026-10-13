# Risk study evaluation — operator and integration guide

This component evaluates a researcher's retained cost observations and model-output files. It belongs inside the existing comparison workspace: that application continues to own cases, investigator decisions, revisions, files and publication. The component creates no database, contacts nobody and invokes no model.

The implementation is Python 3.11 standard library. The complete result contains the selected research definition, exact input identities, coverage, exclusions, all row locations, all-model and pairwise comparisons, subgroup metrics and, when selected, paired patient-cluster bootstrap results.

## 1. Select the question and source population

Record the investigator, question, population, market, timing, cost basis, currency, cost unit and limitations in the plan's research object. Market is an explicit selected value. Medicare Advantage CMS-HCC and Marketplace HHS-HCC are different model families and should not be exchanged because both publish risk scores.

For prospective analysis, the predictor window must end before the target outcome window starts. For concurrent analysis, the two declared windows must match. OTHER_EXPLICIT retains the investigator's stated timing rationale. These checks validate the declared plan; they do not prove that an outside engine excluded later claims or fitted its parameters on the correct data. Preserve the original engine configuration and native output as evidence.

A period is represented by inclusive YYYY-MM-DD start and end values. Cost basis is a selected description such as allowed medical-plus-pharmacy cost or paid medical cost. Every monetary candidate must name exactly the same basis, currency and unit. A prepared annual amount, PMPM amount and annualized amount are distinct units. This component does not silently annualize costs, change currency, inflate claims, remove negative adjustments or convert plan-liability scores into total cost.

Use allowNegativeCosts to make the actual handling of negative costs explicit. A negative allowed observation remains a negative value; it is not silently clipped to zero. Any cap is separately selected, with amount, reason and whether it applies only to actual costs or to both actual and predicted costs. Both capped and uncapped common-cohort summaries are retained.

## 2. Retain and map complete files

Each file descriptor is:

    {name, sha256, bytes, mediaType}

The blob resolver must return the complete original bytes for the requested SHA256. The component verifies both byte count and digest before interpretation. This permits the parent workspace to retain existing blob custody without another file store.

Tables support UTF-8 CSV, JSON arrays and JSONL. A JSON table may select an array through rowsPointer. Field references and identity fields are explicit JSON pointers. For CSV, a column named person_id has pointer /person_id; a literal slash or tilde in a header is escaped according to JSON Pointer. CSV retains original text, including leading zeros and empty strings. A selected nonempty nullToken may explicitly identify nulls. Empty string is not a supported automatic null token.

CSV headers must be nonempty and unique. Every row must match the header width. JSON with duplicate object keys, nonfinite numbers, nonobject selected rows or blank JSONL records fails explicitly. There is no silent malformed-row deletion. Logical row references are one-based records in the selected table; they are not PDF page numbers or physical CSV line numbers.

Each table specifies:

- file: the full descriptor.
- format: CSV, JSON or JSONL.
- keys: one to eight distinct identity pointers.
- scope: description, authority, asOf, complete, expectedRows.
- value: the amount or prediction pointer where applicable.
- rowsPointer for JSON, or csv.delimiter and csv.nullToken for CSV.

Identity cells are nonempty strings or JSON integers. Their types are retained. String "001", string "1" and integer 1 identify different values. The component does not join by a display label, trim IDs or infer a crosswalk. Use explicit prepared mappings in the parent application when original source systems require a crosswalk.

The cohort table is the denominator. It additionally specifies cluster, an explicit patient identity pointer. An optional eligible pointer must include eligibilityValues {true: <exact source value>, false: <exact source value>}. For a CSV using Y/N, select those exact strings; for JSON booleans, select true/false. Values outside that mapping become findings. Do not use loose truthiness.

Weighting is UNIT or COHORT_FIELD. The latter requires cohort.weight, a positive exact numeric value, and weightMeaning. For PMPM analysis, an investigator may deliberately select member-month weights; the tool does not infer that choice. Group dimensions are explicit cohort pointers with IDs and labels. Original missing, null, empty, numeric and textual group values remain distinguishable.

## 3. Identify each genuine candidate output

A candidate records id, label, family, version, modelYear, market, timing, nativeRunReference, engineSource, nativeResult, outputs and outputKind. IDs are stable canonical UUIDs. engineSource and nativeResult are full retained file descriptors, not invented assertions that a model ran.

COST outputs require costBasis, currency and costUnit to match the research definition. They are used unchanged. Any external transformation should produce a separately retained output edition with its actual lineage.

RELATIVE_RISK outputs require an explicit scale object:

    {
      factor, evidence, method, fitPopulation, fitWindow,
      independenceBasis, reference, evaluationOutcomesUsed,
      training, trainingOutcomeEnd, costBasis, currency, costUnit
    }

The factor is positive exact decimal text. The evidence file retains the original normalization/calibration calculation or authoritative source. The complete training table uses the ordinary table schema and the same sampling-unit identity structure as the evaluation cohort. It must be complete, have a declared matching row count and contain no duplicate or invalid identities. Training sampling-unit identities must not overlap the evaluation cohort. For prospective evaluation, trainingOutcomeEnd must precede the target outcome period. evaluationOutcomesUsed must be false.

These checks preserve the selected training sample, dates, evidence and separation. They do not independently recreate an arbitrary external fitted coefficient. The component records that distinction. It does not estimate a monetary factor from the evaluation outcomes. If the investigator selects a published normalization or a fitted calibration, retain its actual complete procedure and training-only result. For cross-validation, preserve fold-specific native fitting/tuning/calibration and produce separate selected fold evaluations or externally assembled genuinely out-of-fold predictions with their full evidence. This evaluator does not claim to perform cross-validation itself.

An available official CMS package is a computational source, not proof that the investigator has selected that market, release or methodology. The complete original package/manual is read before an invocation adapter chooses filenames, arguments and output columns. This evaluator accepts actual retained outputs; it is not a substitute scoring algorithm.

## 4. Read coverage before comparative metrics

The report retains:

- Complete physical table row counts and declared expected counts.
- Invalid identities and every duplicate identity's source rows.
- Explicit cohort exclusions.
- Missing unique outcomes and missing candidate predictions.
- The number with valid actual outcome and weight.
- Every candidate's individually usable row count.
- The same all-model common cohort used for every candidate's headline comparison.
- Every pair's own common identities, denominator and both metric sets.
- Extra identities present in outcome/prediction tables but outside the cohort.

A duplicate never overwrites an earlier record. Those observations cannot contribute a unique paired value, but remain explicit findings with the original source bytes available. A missing prediction is never treated as zero.

populationComplete is true only when all selected coverage claims have matching known denominators, no input findings remain and every eligible unique cohort row is included in the all-model comparison. Otherwise the full observed-subset analysis is retained and its incomplete-population status is explicit. A report may be computationally complete while not establishing accuracy for the entire intended population.

Pairwise and all-model denominators answer different questions. If a third candidate has missing outputs, the common three-model cohort shrinks, while an otherwise complete first-versus-second pair keeps its larger denominator. Both populations and their exact identities remain visible. Avoid presenting different pairwise populations as a single ranking.

## 5. Interpret the metrics and arithmetic

All input decimals are parsed without binary floating-point conversion. Finite decimal arithmetic and metric sums use exact rational numbers. Each result retains numerator and denominator plus a labelled 16-significant-digit display. RMSE necessarily has a displayed square root and retains its exact squared quantity.

For positive selected weights w, actual y, prediction p:

- Weighted mean is sum(w × value) / sum(w).
- Bias is sum(w × (p − y)) / sum(w).
- MAE is sum(w × abs(p − y)) / sum(w).
- MSE is sum(w × (p − y)^2) / sum(w); RMSE is its square root.
- R² is 1 − weighted squared error / weighted variation around the actual weighted mean. It may be negative.
- Predictive ratio is weighted predicted sum / weighted actual sum.
- Normalized MAE is weighted absolute error / weighted actual sum.

Zero actual variance makes R² unavailable. Zero actual total makes the ratio metrics unavailable. These are explicit reasons, not fabricated zeros. Negative totals remain mathematically signed where negative costs were selected; interpretation belongs to that stated research cost basis.

The historical SOA comparison discusses individual fit and subgroup predictive ratios. Its 2012–2013 commercially insured data, exclusions, recalibrations and model editions are not automatically this study's population or design. The current component implements ordinary selected arithmetic; it does not reproduce that paper's performance claims or import its licensed claims data.

Subgroup metrics use exactly the same all-model complete-case rows as the headline comparison and the original group values. Small subgroups remain visible with their actual n and weight; there is no unsupported significance label or universal accuracy threshold.

## 6. Paired patient-cluster bootstrap

An optional bootstrap specifies replicates, seed and confidence. Patients are sampled with replacement from the all-model common cohort. Every candidate receives the same patient draw in each replicate; all rows for that sampled patient receive its multiplicity. The report retains sampled and distinct row/cluster counts, each draw's complete sorted cluster-frequency list and digest, complete metrics, paired differences and percentile intervals. `clusterFrequencies` contains `[canonical typed patient identity JSON string, positive multiplicity]` pairs. Its canonical JSON bytes reproduce `sampleSha256` exactly; no redraw or inferred frequency is needed.

The stored n in a replicate is sampled row count with multiplicity, while distinctRows records how many original rows appeared. Weight sums also include multiplicity. The original common cohort is never changed.

For every candidate pair and metric, the interval records `requestedReplicates`, `validReplicates` and `undefinedReplicates`. Undefined metric causes are retained for each original draw and summarized in `undefinedReasons`; each summarized cause combination counts one paired draw, even when both candidate metrics are undefined. Zero actual variance makes R² undefined. Zero actual total makes predictive ratio and normalized MAE undefined.

When some draws are undefined, the interval status is `CONDITIONAL_ON_DEFINED_REPLICATES`; its bounds use exactly the defined draws and must be described with that qualification. If no draws are defined, the interval remains present with `UNAVAILABLE`, reason `NO_DEFINED_REPLICATES`, null bounds and all original causes/counts. A fully defined interval is `COMPLETE`. The bootstrap execution status is `COMPLETE_WITH_UNDEFINED_REPLICATES` whenever any paired metric contains undefined draws; this means the selected draw plan completed, with the interval qualifications shown separately. The report's primary estimates and whole original draw records remain intact. There is no arbitrary minimum valid count, replacement draw, changed seed or hidden deletion of a pair/metric.

These intervals condition on supplied predictions. The bootstrap does not rerun model fitting, tuning or calibration. It is not uncertainty for a complete training-and-selection pipeline. A research design requiring that outer uncertainty needs its actual source-native training procedure inside the declared resampling or validation design.

Fewer than two patient clusters makes the bootstrap unavailable. If the selected complete bootstrap exceeds the declared work capacity, it returns NEEDS_RESOURCES and retains the complete primary, pairwise and subgroup results. It does not replace the cohort with a slice or silently reduce the replicate count. Python random.Random with sorted typed identities and the retained seed determines the original draws.

## 7. Embed in the existing comparison workspace

The selected application path is `stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/comparison/`. Run the commands below from that directory (the directory containing `risk_study`). Complete measurement intake is documented in the accompanying [RISK_STUDY_IMPORT.md](RISK_STUDY_IMPORT.md), using the maintained case/candidate/criterion/source-edition records and original run.import writer.

Public functions in risk_study.evaluation:

    validate_plan(plan) -> plan
    evaluate(plan, read_blob) -> complete report dict
    report_html(report) -> complete standalone HTML
    canonical(value) -> stable UTF-8 JSON bytes
    retain_output(path, bytes) -> immutable local publication

StudyError exposes code, message and context through as_dict(). No function opens a case database or changes a parent's record. The parent records its exact selected plan, original blob references and returned report through its existing command/revision path. When an input, model release or investigator choice changes, save a new plan/report edition using that original writer.

Report schema is commons.risk-study-evaluation.v1. It includes planSha256, source input digests, selected research, counts, candidate metrics, pairwise comparisons, bootstrap, all source findings, all row details and its own SHA computed before adding the sha256 field. engineInvoked is false because this component evaluates retained outputs. A later actual CMS adapter should preserve its original native receipt separately.

The complete JSON remains the portable computational result. Parent receiving should retain the plan and every original source/model/output/calibration blob, then rerun evaluate and compare the full canonical report. The arithmetic fixture below exercises that exact independent receiving path.

## 8. Command-line use

From the actual complete source directory:

    cd /absolute/source
    python3 -m risk_study.evaluation \
      --plan /absolute/case/plan.json \
      --files /absolute/case/files.json \
      --input-root /absolute/case/originals \
      --report /absolute/case/evaluation.json \
      --html /absolute/case/evaluation.html

files.json is an array of the complete descriptors plus path, relative to input-root. Each original SHA occurs once in that inventory. Absolute paths and paths escaping the selected root are rejected. The original contents are verified again when read.

The output path's permanent flock serializes its immutable publication. Complete output bytes are written and fsynced before publication. Reentry reuses an identical completed file and settles only its own same-inode publication alias. Different bytes require a new report edition; existing outputs are not overwritten. An interrupted private partial is reconstructed under that same selected output lock.

Current explicit capacity is 34 unique source/evidence files, 64 MiB per file, 256 MiB aggregate, 200,000 rows per file, 16 candidates, eight subgroup dimensions, 2,000 subgroup cells, 250,000 cohort-row/candidate cells and 256 MiB per report output. Numeric inputs support 38 significant digits and up to 12 fractional places. These are selected-component limits, not a claim that a full national claims study fits in this runtime. An oversized complete study must use the original research workflow's larger selected runtime or an explicitly engineered whole-data successor.

## 9. Run the complete arithmetic fixture

    cd /absolute/source
    python3 -m risk_study.arithmetic_fixture \
      --directory /absolute/private/ARITHMETIC_FIXTURE

This authors clearly labelled inputs, executes the actual evaluator, receives the whole original plan and bytes independently, and retains full reports and a course result. It covers explicit CSV eligibility, all-model and pairwise coverage, duplicate predictions, paid/allowed-basis refusal and prospective time-window refusal.

The authored four-person eligible example has actual costs 100, 200, 0, 300. Candidate A is 90, 210, 10, 290; B is 100, 250, 0, 250. Its exact expected MAEs are 10 and 25, R² values 124/125 and 9/10, and both predictive ratios 1. These are arithmetic fixtures. They say nothing about CMS, a vendor model, research performance or patient outcomes.

No fixture execution is claimed merely because this source is published. The actual course-result.json and command exit are the execution evidence.

## Source basis and continuing integration

- Official 2026 Medicare model release listing: https://www.cms.gov/medicare/payment/medicare-advantage-rates-statistics/risk-adjustment/2026-model-software-icd-10-mappings
- Actual Python download href recovered from that original HTML: https://www.cms.gov/files/zip/2026-midyear-final-model-software-python.zip
- CMS CY2026 implementation memorandum: https://www.cms.gov/files/document/cy-2026-risk-adjustment-implementation-memo-g.pdf
- Official Marketplace model instructions/software listing: https://www.cms.gov/marketplace/resources/regulations-guidance
- SOA current research call: https://www.soa.org/research/opportunities/2026/health-care-trends-risk-adjustment/
- SOA 2016 accuracy study, particularly study design and measures of fit: https://www.soa.org/globalassets/assets/files/research/research-2016-accuracy-claims-based-risk-scoring-models.pdf
- SOA primer, timing and intended population discussion: https://www.soa.org/globalassets/assets/files/research/research-2016-risk-scoring-health-insurance.pdf

Original commercial and research-selection owners remain with their existing cases. The maintained Research comparison application owns the reusable case interface and record writer. The component contributes evaluation and retained-result intake to that application.

## Bootstrap edge fixtures

The existing arithmetic receiving course includes an authored two-patient 0/1 outcome case. It checks conditional R² intervals, per-draw undefined causes, exact cluster frequencies and reproducible sample hashes. A separate all-zero outcome case checks that R², predictive-ratio and normalized-MAE intervals remain explicitly unavailable with all 20 requested draws retained. These are software arithmetic fixtures, not patient data, model performance or research results. A saved COMPLETE course result is evidence only after the actual Python course has run; source publication does not establish that execution.
