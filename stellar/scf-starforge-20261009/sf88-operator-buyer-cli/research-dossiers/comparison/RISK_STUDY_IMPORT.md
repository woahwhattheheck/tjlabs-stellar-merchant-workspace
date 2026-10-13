# Import complete risk-study measurements into the original Research comparison

This adapter connects retained evaluation output to the maintained Research application's existing comparison records. It creates no dossier, candidate, source edition, model or alternate database. The researcher selects actual existing records, and the application remains the only writer of the eventual run.

The module is `comparison/risk_study/comparison_adapter.py`. It uses Python 3.11 and the same standard-library evaluation component. It is based on the original `contracts.mjs` blob `47fb2bf74cba8245659ac5755c0fe45ea9fbf455` and `model.mjs` blob `ae4b2dc45c7b7e6d6be5f04791b0366e1281cafc`, from Research PR1659 head `b5d2f7660cd7c219e05bfc357f1b8eb5ba641266`.

## What is received

The complete original evaluator report remains an artifact, including its plan, all candidates, original inputs, every observation and exclusion, cohort coverage, exact rational metrics, subgroup and pairwise populations, all bootstrap draws and every uncertainty status. The adapter also includes the parsed full result in the native run result. It does not drop other candidates merely because the current import selects one candidate edition.

The adapter checks the producer report hash and plan hash. It verifies every supplied file's complete byte count and SHA256. Every input in the report must be included among the original execution's declared input artifacts. Every execution input must have an explicit binding to a retained source edition for the case's research question.

A selected destination report must be the actual complete result of the original application's `comparisonReport`, not a newly authored imitation. It includes `dossierId`, `revision`, `case`, `candidateEditions` and `sourceEditions`. This report is retained as an original artifact. The selected case version, candidate version, criteria and source editions must exist in that report. The native application checks these references again at import.

An original execution receipt is also required. Its actual start, finish, elapsed duration, engine version, command, runtime, configuration and complete input/output artifact references come from the operator that performed the execution. The adapter does not generate a successful execution clock from the current time. Published source, a model ZIP, or an authored arithmetic fixture is not a successful execution receipt.

## Public API

```python
prepare_import(selection, artifacts, read_blob)
# -> {"result": complete_preparation, "rawText": str | None,
#     "request": original_run_import_request | None}

publish_import(directory, selection, artifacts, read_blob)
# -> complete_preparation_with_originals_directory
```

`read_blob(sha256)` returns exact complete `bytes`. The adapter freezes the supplied selection and artifact metadata before calling it. It verifies the contents on each required read. A changed or missing original fails explicitly.

`prepare_import` does no file mutation or provider invocation. `publish_import` uses the evaluator's existing immutable output writer to retain the same complete selection, inventory and every original file, then the eligible run/request and final preparation result. Identical reentry reuses exact bytes. Different selections require a new output directory; the first immutable `selection.json` is the operation's local identity.

`StudyError` remains the ordinary component exception, with `code`, message and `context`. No import is sent on an exception.

## 1. Select actual destination records

Use the existing comparison application to obtain the complete report for the actual case edition. Keep its original UTF-8 response body in the input inventory.

The case record uses the original `id`, `versionId` and `definition`. A candidate edition uses `id`, `versionId`, `caseId`, `caseVersionId` and `definition`. The candidate must belong to that exact case edition. A shared label does not bind editions.

Record the current dossier revision and the intended original request identity. Do not silently refresh either after preparation. If the application's final CAS rejects a stale revision, inspect the original request/result and current record before preparing a deliberate new request. Keep the previous preparation and all files.

The application binds measurements to saved criteria. Select a criterion of kind `MEASURED`. When the criterion names a unit, the mapped measurement must use exactly that unit. The adapter does not infer equivalence between an annual amount and PMPM, between currencies, or between ratio and percentage displays.

## 2. Retain every original file

The artifact inventory is an array with these exact fields:

```json
{
  "id": "operator-selected-stable-id",
  "path": "original/relative-name.json",
  "role": "actual-output-or-source-role",
  "mediaType": "application/json",
  "bytes": 123,
  "sha256": "the-actual-64-lowercase-hex-sha256"
}
```

IDs and paths are unique. IDs follow the native identifier rule: one to 200 characters, beginning with an alphanumeric character, followed by alphanumerics or `_.:-`. Paths are relative, contain no empty/dot/parent components, backslash or control characters, and retain the actual selected filename.

Include:

- The original comparison report used for destination selection.
- The original actual execution receipt.
- The complete evaluation JSON and any produced HTML, logs or other outputs.
- Every cohort, outcome, candidate prediction, engine source, native result and calibration file read by the evaluator.
- Any further producer outputs declared by the original operator.

The adapter preserves all supplied files. It cannot independently discover an output that the original producer never identified; complete input/output inventory is the producer's responsibility. It checks every declared file and every evaluator-reported input rather than accepting a list of unverified locators.

The CLI resolves each path under the selected input root, verifies it remains inside that root, and checks the full bytes. An embedded file's source URL or model-release description belongs in its retained source edition and original metadata, not in an invented artifact identity.

## 3. Retain the actual execution receipt

Use this exact schema:

```json
{
  "schema": "sf88.risk-study-execution.v1",
  "externalRunId": "the-original-producer-run-id",
  "kind": "SOURCE_NATIVE",
  "status": "SUCCEEDED",
  "startedAt": "2026-10-13T12:00:00.000Z",
  "finishedAt": "2026-10-13T12:00:01.250Z",
  "elapsedMs": 1250,
  "engine": {
    "name": "actual-executed-evaluator",
    "version": "actual-selected-source-version",
    "command": ["the", "actual", "argv"],
    "runtime": {},
    "configuration": {}
  },
  "inputArtifactIds": ["actual-input-artifact-id"],
  "outputArtifactIds": ["actual-report-artifact-id"],
  "limitations": ["the original producer's limitations"]
}
```

The timestamps and duration above illustrate the representation, not an execution claim. Use actual canonical UTC timestamps with three fractional digits. An unavailable duration is `null`; it is not inferred from a desired runtime.

The native kinds are `SOURCE_NATIVE`, `IMPORTED_MEASUREMENT` and `TRAINING_FIXTURE`. The original producer selects the truthful kind. In particular, a deliberately authored arithmetic course remains `TRAINING_FIXTURE` even when its Python code really ran. The statuses are `SUCCEEDED`, `FAILED` and `CANCELLED`.

A successful evaluation requires a complete report artifact declared in the execution outputs. A failed or cancelled run may have `reportArtifactId:null` and an empty metrics mapping while retaining its complete returned diagnostics and other output artifacts. Its selected study-candidate ID remains an explicit operator reference; the adapter does not fabricate unavailable measurements.

A native evaluation of retained predictions is distinct from invoking the original CMS scoring package. The full report's own `engineInvoked:false` is preserved; this adapter never upgrades that field or calls a scoring engine.

## 4. Freeze the import selection

The selection has exactly these fields:

```json
{
  "schema": "sf88.risk-study-import-selection.v1",
  "request": {
    "requestId": "the-original-selected-request-id",
    "expectedRevision": 12,
    "actor": {"id": "actual-operator-id", "name": "Actual operator"}
  },
  "dossierId": "actual-dossier-id",
  "caseId": "actual-case-id",
  "caseVersionId": "actual-case-version-id",
  "candidateVersionId": "actual-candidate-version-id",
  "studyCandidateId": "original-evaluator-candidate-uuid",
  "reportArtifactId": "actual-report-artifact-id",
  "destinationArtifactId": "actual-comparison-report-artifact-id",
  "executionArtifactId": "actual-execution-receipt-artifact-id",
  "sourceRefs": [{
    "editionId": "existing-dossier-source-edition-id",
    "locator": "original source location or retained file reference",
    "note": "the operator's explicit source correspondence",
    "artifactIds": ["actual-input-artifact-id"]
  }],
  "metrics": [{
    "id": "selected-measurement-id",
    "criterionId": "existing-measured-criterion-id",
    "label": "Selected original metric",
    "unit": "the exact saved criterion unit",
    "definition": "The selected metric's research meaning",
    "scope": {"kind": "COMMON", "index": null},
    "metric": "mae",
    "cohortRef": "operator's explicit cohort reference"
  }],
  "candidateMappingRationale": "Why this original output belongs to that actual saved candidate edition",
  "cohortId": "original-selected-cohort-id",
  "protocolId": "original-selected-protocol-id"
}
```

Values above are schema examples. The adapter never creates those IDs. The `sourceRefs[].artifactIds` join is retained in the run's complete definition; the native source reference itself uses only its actual `editionId`, `locator` and `note` fields.

Every source edition must exist in the selected comparison report and belong to the case's research question. Every execution input must be covered by at least one explicit source reference. If an original source is not yet retained by the dossier, use the existing source-intake workflow first and obtain a new complete comparison report. Do not invent an edition to satisfy this check.

## 5. Map exact metric populations

Each mapping selects one numeric field from one original metric dictionary for the chosen study candidate.

| Scope | Index | Original population |
|---|---:|---|
| `COMMON` | `null` | Candidate's `commonCohort`, with the original selected cap |
| `UNCAPPED_COMMON` | `null` | Same original common cohort, before the selected cap |
| `SUBGROUP` | Original zero-based subgroup index | Exact original group ID and typed value |
| `PAIRWISE` | Original zero-based pair index | Chosen candidate's side of that pair's actual common population |

Allowed metric names are `n`, `weight`, `actualWeightedSum`, `predictedWeightedSum`, `actualMean`, `predictedMean`, `bias`, `mae`, `mse`, `rmse`, `rSquared`, `predictiveRatio` and `normalizedMAE`.

No pairwise difference is silently relabelled as one candidate's absolute metric. The full original pair differences and bootstrap output remain in the complete report and run result.

The imported scalar is the producer's existing display string. For exact rational metrics this is the evaluator's labelled 16-significant-digit display. The adapter does not turn that display into a new supposedly exact decimal. It retains the full original metric object, including numerator/denominator or RMSE's exact squared quantity, in `denominator.metricOriginal`. Each measurement also carries its original report SHA, exact metric-set pointer, count, weight, group or pair identity, cost-cap selection and full-report artifact reference.

An undefined original metric stays `value:null` with its actual reason. Empty populations, zero actual variance and zero actual totals are not converted to zero measurements. Later bootstrap conditional/unavailable interval summaries remain unmodified in the full result.

The complete original identities and findings are referenced by their report locations and preserved in the report artifact. The adapter does not copy a large identity list into every metric denominator merely to imitate a separate cohort. The native denominator object remains at most 1 MiB.

## 6. Measure the full import before offering it

The native run accepts at most 64 MiB of UTF-8 run JSON, including Base64 artifact bodies, and at most 64 MiB of decoded artifact bytes. Individual artifacts are also limited to 64 MiB. The original engine/runtime/configuration, input-definition and each metric-denominator object have their own 1 MiB limits.

The adapter measures the complete sorted compact run JSON, including the exact Base64 expansion of every original file, without first allocating an oversized Base64 string. It checks every original file before either outcome.

The native object limits use the original `node/store.mjs` representation: `JSON.stringify(value, null, 2)` followed by a newline, encoded as UTF-8. Compact transport size is a separate calculation. Preparation measures a safe upper bound for every native metadata object and for the complete result's 64 MiB native object limit. Structure, keys, text, safe integers, booleans and null use their exact native byte lengths. A finite floating-point value reserves 32 bytes so differences between Python and JavaScript number spelling cannot admit an oversized native object. This conservative bound may refuse an otherwise valid float-heavy object near its capacity; the preparation retains all original files and identifies the capacity outcome. No numeric original is changed to satisfy a limit. `nativeResultBytesUpperBound` and `maximumNativeResultBytes` make that result check explicit; `oversizedMetadata` names `result` when it exceeds its own bound.

All native text limits count JavaScript UTF-16 code units, including actor names, source descriptions, command arguments and limitations. An astral character uses two units. Input JSON keys and strings must contain Unicode scalar text; isolated surrogate code points receive an explicit `JSON_UNICODE` error before canonical UTF-8 encoding. These text lengths remain separate from UTF-8 file and HTTP byte lengths.

`READY` means the complete native run fits all these source-backed limits. The result includes the exact encoded byte count, raw SHA, full original inventory, selected original record IDs and the final request's encoded byte count. It does **not** mean the native application accepted the import.

`COMPLETE_OUTPUT_TOO_LARGE` means no partial request is offered. `rawText` and `request` are `None`. The complete original files, report, selection and exact measured size remain available. Metadata sub-limit failures are named. No cohort, bootstrap draw, finding, output or artifact is dropped. The original store currently exposes no comparison-specific external-artifact shortcut.

The preparation component can verify and publish up to 2,000 original files, 256 MiB each and 768 MiB aggregate. These are explicit preparation bounds, not an expansion of the native 64 MiB import contract. Larger source deliveries remain the original producer's complete handover and require a separately supported whole-data path.

Unsafe JSON integers are rejected before a JS run can silently round them. The evaluator's explicit typed numeric originals and rational strings are supported. Raw source files always remain exact binary artifacts.

## 7. Publish locally without changing a case

From the original application's directory that contains the `risk_study` package:

```bash
python3 -m risk_study.comparison_adapter \
  --selection /absolute/original/import-selection.json \
  --artifacts /absolute/original/artifacts.json \
  --input-root /absolute/original/files \
  --output /absolute/original/prepared-import-edition
```

The output contains:

- `selection.json`: exact frozen original import choice.
- `artifacts.json`: complete original artifact inventory.
- `originals/<path>`: every verified original file at its selected relative path.
- `run.json` and `request.json` only for an eligible complete import.
- `preparation.json`: final preparation outcome and full inventory.

The existing immutable writer uses permanent per-output locks, complete fsynced bytes and atomic publication. The adapter does not delete source files or replace completed outputs. If output publication interrupts, rerun the identical command and selection; identical files are reused, changed bytes are refused.

## 8. Use the original application writer

After inspecting `READY`, send the returned `request` through the original authenticated route:

```text
POST /api/dossiers/:id/comparison/reviews
```

Use the original bearer and workspace headers. The request is exactly:

```text
{requestId, expectedRevision, actor, action:"run.import",
 payload:{caseId, caseVersionId, candidateVersionId, rawText}}
```

The adapter does not send this request. The original application owns the request identity, CAS, uncertain-return recovery, retained response, original dossier ZIP and native receiving.

Keep the request and its exact result. If transport is uncertain, reconcile the same original request rather than assigning a new ID. The native run identity additionally binds the external run ID to the selected case/candidate versions and refuses different bytes under that identity.

An eligible raw run can produce a larger outer HTTP request because JSON must escape the `rawText` string. The actual original `comparison/routes.mjs` blob `351855579b1ada94206e1c2f32a594fdf8955985` declares `COMPARISON_REQUEST_LIMIT = 128 * 1024 * 1024 + 65536` (134,283,264 bytes). The original server imports that constant and routes the request through its exact handler. The adapter analytically measures every outer escape as well as every Base64 body, retains `encodedRequestBytes` and `maximumRequestBytes`, and requires both limits before READY. Actual encoded bytes are checked against those measurements once more before returning the request.

## Completion evidence

Source publication proves only that the adapter and its guide are delivered. A successful preparation requires an actual `preparation.json`; a successful dossier import additionally requires the original application's returned run record. A CMS execution requires its own actual source-native receipt and remains separate from this measurement import.
