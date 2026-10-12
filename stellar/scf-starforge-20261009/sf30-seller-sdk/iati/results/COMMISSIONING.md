# Programme commissioning on the original IATI Results workspace

This module adds the complete programme mapping and evidence review used by the Akvo workbench. It accepts an already-open original Results domain, keeps the exact publisher source selection, and prepares the unchanged native Results save request. The application owner supplies the UI, authenticated operator, retained action journal and full programme receiving packet.

It does not call Akvo, change RSR permissions, approve results, unlock periods, import a child framework, or calculate a programme total. Those remain separately selected native operations and professional judgements. Every selected actual remains visible, including values whose approval or programme mapping is unknown.

## Source and ownership

The original integration contract is IatiResults.preview/save in results/workspace.py and the original report in results/model.py, inspected at Merchant commit 779dae9c38ac7aafebe91f0042678bb512832c33. The commissioning files are additive under the same iati/results directory. Use the actual current cumulative owner source when integrating; do not replace later Results files with the inspected predecessor.

The coordinated Akvo work is in the original Sales parent 1791826822.459129, channel C0BTTA66TK3. 24EA owns the whole company engagement and staff application, 14F5 the CLI and full customer receiving, 018A this commissioning model, 6966 the original Results domain, and 9B23 the original complete SNV publisher source acquisition. No additional company case, provider capture or sender is created by this module.

The original SNV activity export already discussed by the owners is an activity representation, not the complete publisher feed. An IATI value or a local Results review does not establish an RSR approval, object permission or programme parent. The selected native evidence must establish those observations independently.

## Files and public API

| File | Purpose |
| --- | --- |
| commissioning.py | Pure validation, complete review, selected source/evidence comparison, and native save-payload preparation |
| commissioning.schema.json | Commissioning envelope and field shapes; the actual Python model adds semantic and complete-byte checks |
| COMMISSIONING.md | Integration, staff review, recovery and full receiving contract |
| examples/commissioning_integration.py | Callable adapters that consume an already-open original Results domain and actual caller values; no workspace setup or fixtures |

The five public functions are:

    load_commissioning_bytes(raw: bytes) -> dict

    new_commissioning_document(results, definition, programme) -> dict

    preview_commissioning(results, document, *, evidence_files=None) -> dict

    prepare_results_request(
        results, document, *,
        expected_preview_sha256, request_id,
        project_id=None, expected_revision=None,
        evidence_files=None
    ) -> dict

    compare_commissioning(before, after) -> dict

Use imports from results.commissioning in the existing IATI application's module path. Do not create another Results database or move the selected workspace.

new_commissioning_document calls the original results.preview(definition), retains its normalized definition and actual projection/source identities, and starts with empty evidence, record scopes, hierarchy, field and value mappings. It does not fill unknown IDs, units, approval states, dates or roles. The programme reference and title come from the operator's existing selected programme.

preview_commissioning validates the full document, hashes and checks any selected evidence bytes, calls the original Results.preview, compares every source pin, and returns the full native preview with its complete commissioning review. The original native preview may retain its normal source projection; the commissioning module itself has no persistence layer.

prepare_results_request reconstructs that exact preview and requires its SHA256 to equal the actual reviewed preview. It then returns the existing native Results.save payload, with the original requestId and, for an edit, the selected id and expectedRevision. Both edit values are required together. The complete document and preview hashes are appended to the original notes within its 16,000-character limit.

compare_commissioning verifies both complete retained preview hashes before producing all declared document changes, original source selection changes, native report changes and evidence availability changes. It does not adopt an edition or advance a head. List order and complete before/after values are retained.

## Document envelope

The top-level schema is stellar-forge.iati-programme-commissioning.v1. All nine fields are required:

| Field | Meaning |
| --- | --- |
| schema | Exact commissioning schema |
| programme | Caller-selected id, title, organisationRef and note |
| definition | Unchanged original Results definition: name, sources, and its optional notes/selection/review/interpretations/bindings |
| sourcePins | Actual sourceId, raw bytes and projectionSha256 from the original preview |
| evidence | Complete selected source-file identities and their original observation text |
| recordScopes | Exact native record and relationship selections inside those original files |
| projects | Explicit native project IDs, source activity keys and declared programme hierarchy |
| fields | Field-specific current child, parent, record-presence and permission review |
| values | Selected actual-value approval, reporting-period and contribution interpretation |

The input JSON is bounded to 16 MiB. No duplicate JSON keys, invalid UTF-8 or non-finite numbers are repaired. Canonical hashes are SHA256 over UTF-8 JSON with sorted object keys, compact separators, original array order, non-ASCII characters retained and non-finite numbers disallowed. This canonical identity is distinct from the raw SHA of the original uploaded document.

The JSON Schema documents the envelope. Native Results remains responsible for the complete selection, interpretation and numerical binding semantics of definition. Cross-record relationships and evidence bytes must be checked by commissioning.py; JSON Schema alone is insufficient.

Use the constructor against the actual selected Results definition instead of writing invented source IDs. It copies actual normalized native source identities and leaves all RSR-specific mappings unresolved until supplied.

## Evidence and exact native records

Each evidence item has id, kind, name, sha256, bytes and observedAt. The kinds are rsr-json, rsr-ui, framework and operator-statement. The caller may pass evidence_files as a mapping from each selected id to its complete immutable bytes. An individual file is at most 8 MiB and the complete selected evidence set at most 32 MiB, with at most 256 files.

Every supplied file must match its declared length and SHA256 exactly. A changed or undeclared file is rejected. Missing files remain unverified references. RSR JSON is parsed strictly only after its whole-file identity passes. An image, PDF, UI observation or operator statement can establish a retained file, but it does not automatically become a machine-verified JSON fact.

observedAt is retained original source text. A file hash proves the selected bytes are unchanged; it does not prove that an old permission or approval is still current. The operator must make an explicit new source selection when current native state is needed.

A record scope contains:

| Field | Required interpretation |
| --- | --- |
| id | Unique local scope reference |
| kind | project, result, indicator, period, actual or disaggregation |
| objectId | Original native string or integer ID, or null while unknown |
| evidenceId | Original declared file, or null while unknown |
| pointer | Absolute RFC6901 pointer to the complete native record object |
| idPointer | Non-root pointer relative to that record identifying its native ID |
| ownerScopeId / ownerPointer | Selected owning record and the relative field containing its exact ID, together or both null |
| parentScopeId / parentPointer | Selected inherited parent record and the relative field containing its exact ID, together or both null |

The complete record must exist as a JSON object and its native ID must match exactly before objectMatched becomes true. A numeric ID and its text spelling remain different; booleans are not IDs. When a selected known scope is used by a field or value, its explicit objectId must agree with the scope.

The supported ownership chain is actual -> period -> indicator -> result -> project. A disaggregation selects its indicator owner. A result selects its project owner. A project has no container owner; its programme parent uses the separate parent relationship. Same-kind inherited parent records must be selected explicitly. An owner or parent relationship becomes matched only when the child record's original relation field exactly names the selected target record's verified ID.

The model derives the native project only through this verified ownership chain. A field from a different project, an approval from a different actual, or a reporting-period fact from a different native period cannot silently clear a review.

For a source that presents another shape or an unrecognized relationship representation, retain the selected file and unresolved record references. Do not guess an API schema, infer IDs from names or fabricate an owner chain.

## JSON facts and state encodings

A non-null fact has evidenceId, pointer, expectedPresent, expectedValue and scopeId. The fact pointer is absolute in that exact original file. Every supporting field must lie within its selected record scope; identity facts must select that record's original ID field. Parent-field facts use the explicitly selected parent record scope.

expectedPresent distinguishes absent from present null. An absent fact has expectedValue:null. Exact JSON value comparison preserves booleans, integers, strings, nulls and arrays without coercion. A literal zero, string "0", empty string, whitespace and null therefore remain different.

A matching raw value is reported separately as rawValueMatched. It only becomes valueMatched when the complete original native record scope is established. Unscoped matching values remain interpretations.

Declared approval, period and permission states additionally require an explicit state binding:

    {
      "encoding": "<one documented encoding>",
      "nativeValue": "<exact original JSON value, with original type>",
      "note": "<operator's source/encoding basis>"
    }

The bindings support only:

| State kind | Encoding | Accepted meaning |
| --- | --- | --- |
| Approval | canonical-text | Exact unknown, draft, submitted, approved or rejected text |
| Period | canonical-text | Exact unknown, locked or unlocked text |
| Period | locked-boolean | true means locked; false means unlocked |
| Period | unlocked-boolean | true means unlocked; false means locked |
| Permission | canonical-text | Exact unknown, allowed or denied text |
| Permission | permission-boolean | true means allowed; false means denied |
| Any | unmapped | Preserve the original value without verifying the declared state |

The caller explicitly selects the applicable encoding and retains its basis. Unknown numeric status codes, localized terms and other strings remain unmapped. The module does not assume that an arbitrary field named status follows these encodings.

The binding's nativeValue must equal the referenced original fact. A decoded state that contradicts the declared state is rejected. Thus approved cannot be justified by an actual draft fact, locked cannot be justified by unlocked:true, and allowed cannot be justified by false. A known state with a missing, unscoped or unmatched fact remains an interpretation.

approvalObservedFromVerifiedJSON requires a matching scoped actual, validated state encoding and verified project chain. periodStateObservedFromVerifiedJSON also requires the exact actual-to-period relationship. These are observations of the selected original bytes, not provider authorization or newly issued approvals.

## Programme hierarchy

Each project row keeps its actual native id, parentId, declared role, exact selected IATI activityKeys, recordScopeId, idFact, parentFact and note. IDs preserve their native type. The complete declared parent chain must be present and acyclic. Roles are core, contributing, sub-contributing, standalone or unknown.

Activity keys must already exist in the complete selected original Results report. The module never matches a programme or project by title. Zero or multiple project mappings remain explicit findings; they are not silently selected. Multiple declared core projects and inconsistent role/parent combinations are also retained for review.

The hierarchy output keeps the original ID and parent facts, the native relationship observation and the declared role. RSR role assignment is outside this module.

## Field authority and inheritance

Each field row binds an actual source subjectKey and declared project, the native child and parent object IDs/scopes, separate child-record presence, the specific entity/field/action, complete child and parent observations, and a permission state/fact/binding.

Child-record presence is independent of the presence of one field. That distinction controls reimport: an existing child record retains its data even when its particular description or other field is absent. A missing field does not mean the whole child record can be recreated.

The supported review rules reflect Akvo's documented inheritance behavior:

| Situation | Review outcome |
| --- | --- |
| Parent changes result title/type/aggregation status | Parent change propagates |
| Parent changes disaggregation title/value name | Parent change propagates |
| Parent changes result description, listed indicator metadata or listed period values/comments | Copy only when the corresponding child field is absent or a literal empty string |
| Child contains zero, whitespace or another populated value | Preserve that child value |
| Child contains null with unknown native meaning | Keep an unresolved emptiness review |
| Initial inheritance of a period target | Target is not inherited |
| Reimport with an existing child record | Preserve existing child records and data |
| Reimport of a proven missing result | May import that missing parent result through the separately selected native workflow |
| Other initial inheritance, record kind or field | Require field-specific native review |

The model retains exact current observations and the rule explanation. Before a non-inspection action can clear its evidence reasons, it must have the selected original object, matching project chain and validated allowed permission. Parent-dependent actions also need the actual native parent-record relationship and selected programme parent. Reimport checks the whole record identity/presence.

nativeMutationPrepared is always false. A cleared evidence reason is not a dispatched PATCH/PUT or an automatic instruction to overwrite a value. The existing native permissions and current state must still govern any separately authorized RSR operation.

## Actuals, periods and programme totals

Every selected native report actual is returned in full review. Values without an explicit mapping remain unknown, retaining raw presence, raw value, source SHA, activity/indicator/period keys, dimensions, locations and original context identity.

An explicit value mapping selects the exact valueKey, native project/object/period scopes, approval and period bindings, and an optional coreIndicatorId, contributionRole, aggregateGroup and includesValueKeys.

Component data requires an observed approved state before its upward programme interpretation is established. This module produces no upward sum. A reported parent aggregate and its selected components remain separate rows. Any explicit group containing both totals and components gets an overlap finding. Included components must retain their original context, period, core-indicator reference and declared project ancestry; unresolved differences are listed, not normalized away.

A local definition.review.status of reviewed is not native RSR approval. A reporting period being unlocked does not prove the particular user can edit it. An actual minus a baseline is not a target percentage, and a selected undimensioned aggregate must not be added to its female/male or other component observations.

## Application and staff journey

The existing staff UI should expose one continuous workflow:

1. Open the actual selected Results source edition and complete report.
2. Start the programme document with the constructor; preserve its exact source pins.
3. Retain the original RSR/framework evidence files and select exact native record scopes.
4. Map the programme projects and source activity keys, then inspect inheritance/permission fields and actual approvals/periods.
5. Show the complete preview: source coverage, original values, raw evidence, mapped state meanings, unknowns and every finding. A summary is accompanied by the complete downloadable packet.
6. Record the actual operator's decision on that exact preview hash. The UI must not prefill an approval or replace unknowns to make the workflow pass.
7. Prepare and persist the exact original native save request, then dispatch it once through the existing Results caller.
8. Reopen the returned original id/revision, export the complete native project, and receive the outer full programme packet independently.
9. For a later source or evidence edition, retain both complete documents/previews, compare all changes, and require an explicit new selection. Preserve previous accepted editions.

The separate commissioned delivery scope, commercial acceptance, fees and staffing are owned by the original Akvo engagement. This module records technical programme evidence and does not create customer acceptance.

## Original mutation recovery

The original Results.save implementation checks its retained request before current-head/revision validation. Use that behavior:

- Before the first save, retain the exact returned payload and its requestId in the existing application journal together with the complete document, evidence-file IDs and actual reviewed preview.
- If save was issued and its response is missing, recover or replay that exact retained payload through the same original Results action. Do this before reconstructing another commissioning preview or reading a later head as the baseline.
- A completed original native request returns its original result even after later edits. Preserve that result and exact revision.
- An unfinished edit with a changed current revision must stop at the original conflict; do not rebase it automatically.
- Only a new explicit operator selection can prepare a new request.
- prepare_results_request is a payload constructor. Calling it again is not the recovery API.

No app-specific journal class, request identifier or workspace UUID is invented here. The application owner must use its actual current journal and authenticated Workspace.

## Complete export and independent receiving

The native Results project ZIP has a strict manifest. Export it unchanged through the existing Results API. Do not add commissioning files inside that ZIP or modify its native manifest.

The full programme package should wrap:

- The exact native Results project ZIP and its original export receipt.
- The complete original commissioning-input.json bytes and their raw file identity.
- The complete commissioning-preview.json with the verified canonical hash.
- Every selected evidence original with declared raw byte/SHA identity.
- The model/schema/guide source used for the review.
- The actual native request and result, selected project id/revision, and the original receiving decision.

The receiver verifies the full outer manifest, every exact member and all referenced evidence. It then calls the unchanged native `Results.receive(path, expected_sha256=..., expected_bytes=...)` with the received ZIP's original byte identity. Receiving identity and replay come from the original transfer. The original receiving API preserves existing local heads and does not replay imported sender requests.

After import, rerun preview_commissioning on the received exact definition/document/evidence and compare the complete preview hash to the selected original. Report any difference instead of rewriting the packet. Reopen the actually returned native project id/revision and compare the full original report, not merely row counts.

## Limits and failure handling

| Boundary | Limit or behavior |
| --- | --- |
| Original commissioning document | 16 MiB complete UTF-8 JSON |
| One evidence original | 8 MiB |
| All evidence originals | 32 MiB, up to 256 files |
| Native record scopes | 100,000 |
| Declared projects | 512 |
| Field reviews | 20,000 |
| Explicit actual mappings | 100,000; all selected native actuals still returned |
| Complete preview/comparison JSON | 128 MiB |
| Original Results source selection | Existing 1-32 complete source IDs |
| Native IDs | Nonempty original strings or nonnegative signed-64-bit integers; no booleans |
| JSON pointers | Exact RFC6901 syntax, bounded to 4,000 characters |

CommissioningError denotes a malformed, changed or inconsistent commissioning selection. Missing evidence or a genuinely unknown native state normally remains an explicit unresolved review. Native Results errors remain native; they are not converted into a successful empty report. Size limits must not be met by silently truncating evidence or findings.

## Primary operational references

The implementation uses the following original Akvo documentation. The selected source evidence and actual deployed API remain authoritative for a particular operation.

- Inheritance: https://akvo.freshdesk.com/support/solutions/articles/153000135498-rules-for-inheriting-a-results-framework-from-a-lead-project-
- Programme aggregation: https://akvo.freshdesk.com/support/solutions/articles/153000135482-aggregated-indicator-results-data-for-programs
- Reporting-period unlocking: https://akvo.freshdesk.com/support/solutions/articles/153000135500-unlocking-reporting-periods
- RSR write methods and permissions: https://akvo.freshdesk.com/support/solutions/articles/153000135530-rsr-write-api

This source delivery includes source-only/native syntax validation status separately from the application's actual Results save, provider state and customer receiving. No provider operation or completed Akvo programme is implied by publishing these files.

## Source verification of this delivery

The preceding source edition passed its isolated native AST and eight semantic checks (chunk 41d19e). Independent source review then identified the record-scope and native-state-binding defects. Both are corrected in commissioning.py 57,763 bytes, SHA256 a66bec5790a5237ba003d33c07ef863de676674f87e4ab3ccd929781fd93b071, independently source-reviewed in Git blob 69963d114370b96314dc771f4c069c61ad9c2aa5. The successor's first isolated AST/semantic attempt failed before process creation with environment_offline; it did not execute. This source handoff therefore claims the completed source review, with current native execution and the original application receiving still to be performed by the existing owners.
