# Original comparison tools and returned-work adoption

Use the existing authenticated Research attachment. This interface operates the original saved dossier, complete comparison history, retained returned branches and explicit author adoption. It reuses the existing native store, private export directory and file reader.

The operator first reads the current question, source editions and selected protocol. Whole producer run files retain their actual runtime, population, denominator, undefined reasons and artifacts. Named scientific judgments remain separate records. A returned colleague's source remains available alongside the author's new accepted operations.

## Complete comparison workflow

The attached Research client exposes comparison, comparisonReport, reviewComparison, exportCaseComparison and comparisonFile. The original store exposes the same native writer and exportComparison.

| Merchant tool | Operation |
| --- | --- |
| merchant_research_comparison_read | Page cases, protocol editions, candidate editions, runs, judgments, decisions and original operations |
| merchant_research_comparison_report | Read the whole selected report and source identities |
| merchant_research_comparison_review | Submit or receive one complete original native request |
| merchant_research_export | Retain the selected report, original run or artifact as a complete file |
| merchant_research_exports | Recover a retained file receipt after interruption |
| merchant_research_file_read | Read every chunk of that same retained file |
| merchant_research_file_release | Release the owned temporary read |

Page responses identify their dossier revision, offset, limit, total, nextOffset and complete flag. Carry the returned revision through later pages. The selected protocol controls which original runs and judgments appear; an older protocol remains explicitly selectable.

Native review input retains requestId, expectedRevision, actor, action and complete payload. The actions are case.save, candidate.save, run.import, judgment.save and decision.save. Keep the original request before sending it. Repeating that same request receives the original native operation before the revision check. A transport failure keeps request identity and outcome uncertainty; inspect the saved operations before selecting a new request.

## Receive a colleague's complete branch

Use the existing merchant_research_dossier_return_source tool with a host-declared portable source. It verifies the full source/history and returns source.id. The returned branch stays separate while ordinary question/source differences are reviewed through the original Returned work desk.

Use merchant_research_comparison_adoption_list to find retained sources and adoption plans. Use merchant_research_comparison_adoption_source for the source's cases, then select a caseVersionId and page candidates, runs, judgments, decisions and sources. The response includes the original ancestor, incoming head, target cases/protocols/candidates and complete source bindings.

Every selected run brings its candidate dependency. A judgment brings its candidate and runs. A decision brings its candidate, run and judgment dependencies. The preview expands the full selected graph and displays all required records, even when the reviewer began by selecting only a decision.

EXACT source bindings match the author's retained edition. MISSING and DIFFERENT bindings lead to the original question/source review workflow. Original run bytes stay intact while new author comparison identities are mapped explicitly. The original question must match as well.

## Preview, accept and recover the complete adoption

The first request contains:

- requestId, expectedRevision, actor, reviewedAt and reviewNote.
- sourceId and the exact returned caseVersionId.
- selection arrays candidateVersionIds, runIds, judgmentVersionIds and decisionVersionIds.
- caseTarget, choosing NEW_CASE, NEW_PROTOCOL or EXISTING. The latter two name the exact author caseId and caseVersionId.
- candidateTargets, one for every candidate in the expanded dependency graph, choosing NEW or an exactly equivalent EXISTING targetVersionId.

Generate and preserve requestId before preview. The preview validates the complete source and target graph. Its eligible flag and issues describe the concrete source or selection work required. An eligible preview includes previewSha256 and the entire fixed plan. Review the source, mapped targets, ordered native steps and actual named attribution.

merchant_research_comparison_adoption_review takes that same original request with previewSha256. It saves the reviewed plan and original source descriptor, then uses the native comparison writer one operation per dossier revision. New author IDs map back to the original returned IDs. The original producer metrics, raw run and artifacts remain exact, while original judgment reviewer fields stay visible alongside the accepting actor.

After interruption, call merchant_research_comparison_adoption_inspect with exactly one requestId or planId. The complete result includes accepted native operations, mappings, the original request, source and remaining progress.

| Status | Operator action |
| --- | --- |
| COMPLETE | Inspect and download the completed adoption and current dossier |
| NEEDS_REVIEW | Inspect the accepted prefix and current author revision; replay the same request to recover a still-current prepared course, or preview an explicit continuation after another author edit |
| SUPERSEDED | Open successorPlanId; the older source, accepted prefix and plan remain retained |

A continuation is a new reviewed request with requestId, current expectedRevision, actor, reviewedAt, reviewNote and continuationOf: the original plan ID. Its source and original selections are inherited. Accepted native mappings remain fixed; preview recalculates the remaining commands against the current author head. Retain the new preview hash before accepting it. A later legitimate dossier edit does not invalidate a completed adoption.

## Complete retained exports

Use merchant_research_export. It pins the selected native report revision before downloading, verifies original file identities and returns the existing content-addressed retained export receipt.

| kind | Required selection beyond workspace/dossierId |
| --- | --- |
| comparison-case-json, comparison-case-html, comparison-case-csv | caseId; optional caseVersionId and revision |
| comparison-run | runId; optional revision |
| comparison-artifact | runId, artifactId; optional revision |
| comparison-adoption-json, comparison-adoption-html | adoptionPlanId; optional revision |
| comparison-adoption-source | adoptionPlanId; optional revision |
| comparison-adoption-run | adoptionSourceId, caseVersionId, runId; optional revision |
| comparison-adoption-artifact | adoptionSourceId, caseVersionId, runId, artifactId; optional revision |

expectedSha256 may pin an already selected file. Raw-run/member receiving checks the complete producer descriptor. Adoption source export verifies the exact retained returned portable bytes and SHA-256. Report exports preserve their reviewed generation while the author dossier continues to advance.

Use the existing complete portable-json or portable-gzip export for the author's full resulting dossier. It carries original history, source and accepted operations for independent receiving. Keep the original returned-source export beside that author handover.

The file reader reports actual chunk continuation. Read through completion with the same export and read identity. A byte mismatch retains the completed file and its exact descriptor for inspection; use the original receipt to reconcile the outcome.

## Installed commands and client

The top-level original command delegates to the installed comparison course:

```sh
node research-dossiers/cli.mjs comparison read --store "$RESEARCH_STORE" --id "$DOSSIER"
node research-dossiers/cli.mjs comparison adoption list --store "$RESEARCH_STORE" --id "$DOSSIER"
node research-dossiers/cli.mjs comparison adoption source --store "$RESEARCH_STORE" --id "$DOSSIER" --source-id "$RETURN_SOURCE"
node research-dossiers/cli.mjs comparison adoption preview --store "$RESEARCH_STORE" --id "$DOSSIER" --file "$ORIGINAL_REQUEST" --out "$PREPARED_REVIEW"
node research-dossiers/cli.mjs comparison adoption review --store "$RESEARCH_STORE" --id "$DOSSIER" --file "$PREPARED_REVIEW"
node research-dossiers/cli.mjs comparison adoption lookup --store "$RESEARCH_STORE" --id "$DOSSIER" --request-id "$ORIGINAL_REQUEST_ID"
node research-dossiers/cli.mjs comparison adoption export --store "$RESEARCH_STORE" --id "$DOSSIER" --plan-id "$PLAN_ID" --format html --out "$REPORT_FILE"
```

These variables come from the operator's original saved dossier, source and request. Preview writes the exact prepared review file only when eligible, using exclusive creation. The command also prints the complete preview with its issues and selected steps. Review reads that original prepared file. It never generates another request ID.

Replace --store with --connection-file and optional --workspace-directory to attach the existing authenticated listener. The command closes its own client and signal handlers. The original listener, store and browser remain with their existing owner.

The installed comparison/adoption-client.mjs and corresponding .d.mts declare all seven native methods. Request normalization uses the original adoption contracts. Complete false previews retain their issues and null preview hash. Response identity checks preserve the selected dossier, revision and request. An invalid response after a review is treated as an uncertain write, with the original request ID retained for receiving.

The client exposes two unambiguous export methods: exportCaseComparison for a case/protocol report, and exportDossierComparison for the existing before/after revision comparison. The legacy exportComparison alias dispatches by the explicit case selection and rejects mixed case and before/after selectors. The installed comparison export command uses exportCaseComparison directly. This preserves the old revision-export API and repairs the former duplicate method definition that shadowed case exports.

## Receiving the outgoing work

The complete native and browser courses accompany the product. Use the same original source selection, store and saved operation. Exercise the full returned-source intake, dependency selection, target mapping, partial acceptance, intervening edit and explicit continuation; export the author dossier, reopen it independently, and recover a pending course as well as a completed one.

Open and use the actual operator desk at desktop and 390 pixels. View its populated records, source differences, pending and completed states, original downloads, reports and reopened working copies. Open every outgoing HTML/JSON/CSV/source archive and its usable contents, and look at the captured images. Record the actual reviewer and concrete repairs in that original receiving result. Source-function checks and the native/browser receiving outcome keep their separate execution records.
