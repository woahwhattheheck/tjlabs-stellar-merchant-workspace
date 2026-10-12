# Organisation budgets, planning documents and reviewed release

This module extends the existing IATI workspace. Original source intake, the SQLite database, workspace lease, private file custody and portable archive writer remain the same. There is no publisher API call, payment, external document fetch, additional dataset engine or background worker in this workflow.

The editable source is a complete unqualified IATI 2.03 organisation XML document. Activity files continue through the existing activity inventory and operator. A source ID is the SHA-256 of its original bytes. The source remains in the original sources table and sources/<SHA>.iati file, including after a candidate is saved or a packet is received.

## Exact source and supported limits

The source support directory retains the original organisation XSD and its two dependencies, complete referenced code lists, original mapping, all licence notices and the dated FCDO/PWYF methodology profiles. support-manifest.json binds every byte. The native validator uses the original protected XML adapter and lxml/libxml2 with networking, entities and external schema loading disabled.

Organisation XML has the original publisher editor's 32 MiB capacity. One original XML scalar has a 1 MiB parsing capacity. Calculation accepts XML decimal tokens up to 4,096 characters and uses adequate Decimal precision without changing the retained original token. Larger or unsupported values remain visible with a finding; no approximate financial number is substituted. Complete analysis, report and request objects have a 64 MiB capacity. The original full archive limit is 4 GiB expanded and 16,384 data members. Page size is 1–500; exports contain every selected record independently of browser pagination.

Expat 2.6 or later and lxml are requirements of the selected native runtime. If lxml is unavailable, a draft records UNAVAILABLE schema validation. It cannot receive approval or a release. No fallback validator declares a document valid.

## Open and retain one original file

Use the installed original IATI CLI, HTTP source intake or Python workspace. This example uses the existing workspace and does not create a second reader or source database:

~~~python
from pathlib import Path
from iati_workspace import IatiWorkspace

workspace = IatiWorkspace(Path("/absolute/original-workspace"))
try:
    with Path("/absolute/actual-organisation.xml").open("rb") as source:
        retained = workspace.add_source(source, "Selected original organisation publication",
                                        "actual-organisation.xml")
    profile = workspace.organisation.profile(retained["id"])
    # Select exact profile["organisations"][...]["key"] values.
finally:
    workspace.close()
~~~

For a new original workspace, use the existing create=True option only with a new destination. Continue an already open workspace through its current server. The original lease remains the sole writer boundary. The product does not treat an activity source as an organisation file or manufacture a missing publisher response.

A profile returns the root attributes, every organisation's identifier/reporting organisation/names/default currency and language, original budget and document counts, opaque organisation keys and source findings. An opaque key binds the original source plus its exact position. Duplicated organisation identifiers remain distinct observations and are flagged.

## Save the complete definition

save accepts requestId, optional existing id/expectedRevision, name, sourceId, organisationKeys, assessment, acquisition, edits, notes and optional actor. requestId uses the existing 1–160-character identifier grammar. IDs for plans, rows, targets and reviews are 64 lowercase hexadecimal characters.

assessment contains an explicit asOf date, fiscalYearStart date, forwardYears from 1 to 10, methodology (iati203, fcdo2023 or pwyf2026) and optional operatingCountries. Both dates are exact YYYY-MM-DD. The fiscal start is a real year-specific date, not a month number or MM-DD shorthand. An omitted country baseline is different from an explicitly supplied empty list. The application never obtains a denominator merely by counting countries present in this XML.

acquisition accepts sourceUrl, retrievedAt, licenceUrl, licence and notes. Supplied strings are retained exactly. Original retrieval URLs, observed time, licence and exceptions belong here; the operator does not claim that filling these fields performed an HTTP acquisition.

A save produces an immutable revision, full baseline/candidate analysis, exact CSV outputs, a complete HTML report and the original XSD result. Existing revisions remain readable. sourceId always identifies the original byte stream; candidateSha256 identifies the exact candidate in the same original source store. A changed original source is first saved with cleared cumulative corrections. A correction or definition change clears the preceding approval/release.

## Record snapshots and precise corrections

rows uses either sourceId with view=source, or id plus an explicit positive revision with view=source or candidate. Select budgets, documents or issues. Its result contains rows, total, offset, limit and snapshotSha256. Supplying expectedSnapshot binds later pages to the same exact snapshot. Detail has the same selector plus rowId, an optional organisationKey filter, and returns row, exact XML, targets and snapshotSha256. A supplied organisation filter must match the actual selected row. Optional targetId selects one target belonging to that row and adds selectedTarget with its exact owning element XML plus the existing target metadata. This retrieves one complete descendant element for replacement without duplicating every descendant XML in the target list.

rowId may be an organisation key. This exposes header fields and an insertion target for missing budgets or documents. Budget and document details also include all original descendants. No XPath or arbitrary filesystem selector is accepted.

Each target has id, kind, label, path, beforeSha256, nodeSha256, and, where applicable, value, attribute, present and allowedOperations.

- Element guards bind every original byte in that node.
- Text guards bind the exact inner source bytes. The original node hash is retained separately.
- Attribute guards bind that precise attribute's name, presence and decoded value. Other independently corrected attributes do not invalidate that scalar guard.
- IDs bind the original source, organisation, path and target kind. The path is diagnostic output, not an evaluated user query.
- Unqualified original IATI fields are editable. Foreign extension data is retained; a deliberate full native element replacement can carry it unchanged.

Each edit contains targetId, beforeSha256 and operation. text and attribute use value; attribute may also repeat its exact bound attribute name. Attribute value=null removes the selected attribute, while value="" preserves an explicit empty value. replace and append use one complete xml element. remove carries no body.

edits is the complete cumulative sequence from the immutable source. The engine replays it in order. New targets come from the actual selected candidate detail. A stale guard fails with the original source/revision intact. Organisation identifiers and their order must remain unchanged, including after full organisation replacement. Unselected organisations retain their exact bytes.

Appending to an organisation uses the actual original XSD sequence: identifier/name/reporting-org; total-budget; recipient-org-budget; recipient-region-budget; recipient-country-budget; total-expenditure; document-link. A missing budget is inserted before later document links. Budget and document children also use their original order. No application-generated budget amount, date, currency or recipient is supplied.

## Financial meaning

The native projection retains five distinct families: total-budget, recipient-org-budget, recipient-country-budget, recipient-region-budget and total-expenditure. Expenditure uses original expense-line elements; budget families use budget-line.

Every original amount stays text. Arithmetic uses compatible organisation identity, family, recipient scope, currency, status, exact fiscal period and value-date. Default currency applies only when the value's currency attribute is absent. An explicit empty currency is unresolved. Missing budget status is the standard's indicative default; expenditure has no inferred budget status.

Recipient-organisation budgets describe core funding, excluding earmarked funding handled at activity level. Recipient-region budgets must not be constructed by adding already reported recipient-country budgets. Their vocabulary, optional custom URI and raw code are preserved. The OECD DAC Region codelist is applied only to its original vocabulary condition.

Repeated rows with an identical monetary context are retained and flagged for review. The engine does not silently choose a duplicate, add the duplicates or use zero for an unavailable value. Different currencies, value dates, statuses, families and recipients do not create a common headline total.

Budget and expense lines can be partial breakdowns. The report shows comparable listed-line sums and the parent-minus-listed-lines value without imposing equality. Differently valued or differently denominated lines remain unresolved; they are not converted.

Fiscal reports show explicit calendar windows. Only one exact-period financial row supplies a fiscal amount. Overlap, partial-period coverage and absent rows remain visible without annualisation, proration or interpolation.

## Dated methodology and document review

The selected native standard and methodology are separate evidence. Schema validity does not establish financial accuracy, publication availability, content suitability or an official Aid Transparency Index score.

The FCDO 19 April 2023 guideline applies to relevant ODA funding agreements. It requires organisation forward budgets for current/future years where known and organisation documents. Funded-organisation and country budgets are optional. It does not impose an unconditional PWYF-style three-year mandate. The product edits version 2.03 even though the broader guideline also accepts 2.02.

The PWYF 2026 technical paper's budget timing text is at zero-based PDF index 62, human PDF page 63. It says the first end is at least 230 days after the last test date and subsequent years are 365 days later. Its original example instead begins 213 days after its assessment date, and one consecutive year-end gap is 366 days. Both source statements and observed arithmetic are retained. The report presents threshold dates and actual consecutive periods for human interpretation; it does not invent an official scoring algorithm, reuse one late budget as three years, or enforce equality to 365 days as an official test.

The later technical paper's country baseline and the earlier published issue definitions are different dated evidence. Supply and describe the reviewed actual operating-country list in the saved assessment/acquisition or review notes. An absent denominator is not a zero score. Exclusions and applicability require their original evidence and reviewer reasoning.

Document links retain URLs, MIME type, all multilingual titles/descriptions, categories, languages, document dates and recipient countries. A source URL is not fetched by this module. accessState=NOT_CHECKED remains explicit. B01/B02/B04/B05/B06 indicate evidence categories requiring human content review; code presence alone does not approve a document. The complete report and named review note retain the operator's decisions.

Country and Language code lists are explicitly incomplete upstream. A code absent from them is a review observation, not proof that it is invalid. Complete codelists, missing required fields and original XSD errors remain separate findings. Original external codelist descriptions keep their original licences.

## Review and release

review requires requestId, id, expectedRevision, decision=approve or request_changes, a named actor, a note and acknowledgedIssueIds. Approval requires actual VALID original XSD validation, no unresolved error-level findings and explicit acknowledgement of each review-level finding across the complete source. Unselected source findings remain visible.

An accepted review binds the original/candidate sources, acquisition, edits, complete assessment definition, exact analysis, schema/codelist/methodology identity, name and notes. It creates a new immutable revision.

release requires requestId, id, expectedRevision and exact reviewId; actor may be included. The current original runtime revalidates the whole candidate against the exact retained schema. A changed definition requires a new save and review. A release creates another revision and immutable source/report descriptors. publicationState=READY_FOR_PUBLISHER and published=false are deliberate: preparing a release performs no external publication.

A timed-out response is not evidence that a save failed. request(requestId) returns RECORDED with the original input/result/plan, or NOT_RECORDED. Reusing an ID with changed complete input fails. A successful replay returns the original immutable result while leaving later revisions current.

## Compare exact editions

compare binds requestId, before:{id,revision}, after:{id,revision}, optional one-to-one rowPairs, actor and notes. Rows in the same original source use their source-bound identities while the divergent cumulative edits preserve those positions. A row removal or whole-organisation replacement in either divergent edit sequence withholds automatic pairing, because another record may occupy the former ordinal path. Different original sources also require explicit reviewed row pairs. Supplying rowPairs:[] explicitly suppresses automatic pairing. The result exposes the selected pairing mode and reason. Organisation identifier/reporting reference and all monetary context must agree before a delta is calculated.

The result retains complete paired and unpaired records. An absent or incompatible amount never becomes zero. The original comparison JSON is immutable. Comparisons are associated with their selected after-plan; its export includes relevant comparisons and the complete linked before-history required to reconstruct them.

## Full files, export and independent receiving

file({id,revision,kind}) accepts source, candidate, report, budgets or documents and returns path, name, media, bytes and sha256. Paths are native server-owned descriptors; browser/MCP routes retain their original authentication, same-origin and hash checks.

export({id,revision,output}) calls the existing IATI packet writer. It preserves complete selected history, source requests, original source/candidate XML, baseline/candidate analyses, reports/CSV, review/release state, relevant comparisons and required linked plan history. The archive also contains all organisation source, schema/codelist/methodology/licence files and the original Python IATI/XML host modules. The complete installed IATI component supplies browser/CLI/MCP entrypoints; install the matching delivered component before native packet receiving.

Draft packets are explicitly drafts. A draft export does not imply an approved release. The original writer publishes atomically and reuses an exact completed output; a different existing file is never overwritten. Use a real output parent and preserve original source/asset directories.

receive({path}) accepts the complete original private ZIP. It checks every member name/type/expanded length/hash, complete histories, source identities, request/result bindings and selected revision. It reconstructs every save, correction, review, release and comparison through the same native transition functions without creating a second application or executing code from the ZIP. Complete actual XSD results are checked again; an earlier unavailable-runtime observation remains an observation. Install the exact retained schema/methodology/Python source edition for this verification.

Only after complete verification are original sources/assets and immutable rows joined to the receiving workspace. Conflicting original revisions or request IDs fail. A re-import preserves later recipient-owned revisions. The result distinguishes the imported plan from currentPlan and retains the exact packet SHA/size.

Close the original workspace when done. Independent reopening uses its same private directory and original source. No provider credentials or external request journals are added to these packets.

## Method-specific missing evidence and organisation country scope

Selecting fcdo2023 creates review findings when a selected organisation declares no total-budget or no organisation document. The operator must consider the applicable funding agreement and current/future budgets where known; these findings are not XSD failures or automatic compliance judgments. Optional country and recipient-organisation budgets are not made mandatory. Selecting pwyf2026 exposes absent total-budget or B01/B02/B04/B05/B06 document categories as manual-review acknowledgements, without inventing an Index score.

Country coverage is returned per organisation in summary.countryCoverage.organisations. Each entry keeps its exact identifier, declared country-budget codes and the explicitly supplied operating-country denominator. Two organisations' separate budgets are never pooled into one assessed numerator. The top-level combined country-code list is explicitly COMBINED_INVENTORY_ONLY. If no independently reviewed denominator was supplied, no coverage denominator is manufactured.
