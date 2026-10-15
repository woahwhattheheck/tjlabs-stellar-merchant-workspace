# Water Operations Study Desk — operating contract

This independent desk evaluates supplied operational records. It does not operate treatment equipment, prescribe sampling frequencies, determine statutory compliance or replace an operator's approved procedures. All examples are authored.

## Original source and historical meaning

Import the actual complete CSV for a selected family and map its columns. Keep original filenames, exact UTF-8/BOM content, literal decimal values, line spans and source references. A mapped blank is observed; an unmapped column is null and cannot silently become an observed zero or an open date. Retain supporting PDFs, scans, images and other original bytes separately. New corrections create retained editions; named decisions bind exact source hashes.

Each version has an immutable id, stable record_key, positive revision and explicit supersedes_id. The same business identity cannot have two unresolved current claims. recorded_at describes when the record was entered; available_at describes when that original fact could be used. Observed, collected, analysed, reviewed, generated, sent and received instants have separate fields. A later faithful export may carry earlier documented row availability, but must itself be available by the study cutoff. A frozen report additionally binds the exact export edition available by its generation instant. Changing a source cutoff does not rewrite the original.

## Context and supplied schedules

Organisations, systems, locations, assets, people, authorities and schedules have effective periods. A system retains its literal PWS identifier, class, connection count and connection-count date. Current registry asset status is separate from a period's observed source use. A registered active or standby well is not assumed to have supplied water in a given period. source_use records retain actual intervals, used/not_used/unknown, optional actual quantity and unit. Overlapping observations for the same asset are unresolved rather than added twice.

Named permissions are system-scoped and effective at the actual action instant. Board membership does not imply an operator credential or a laboratory permission. Retain any credential reference as supplied. A schedule must have actual approval and source, location, purpose, activity, parameter, unit and literal cadence. No regulatory default is generated.

Obligations are actual scheduled occurrences. They bind the exact schedule row and SHA, window, due instant and required record kind. The desk does not expand cadence text into invented deadlines. Actual cancellations require a named authorised source and reason. Tasks record assigned responsibility and dated started/completed/blocked/reopened/cancelled events. A reported completion is assessed against the bound evidence, and an unknown state does not become overdue=false.

## Complete population and field readings

population_members enumerates every eligible scheduled occurrence for the declared system/portfolio, interval and population key. Explicit exclusions need a reason; unknown dates, identities or inclusion remain unresolved. The expected count and population-complete assertion supplement the actual retained rows, not replace them. Fractions are unavailable until the population is reconciled. Unfulfilled work and rejected samples remain visible.

Field readings retain parameter, original value text, qualifier, unit, observation instant, actual observer, instrument/method and original document. A later sync is not treated as evidence that the office knew the reading earlier. Numeric qualifiers use exact rational values; nondetect, present, absent and invalid remain literal states. There is no unapproved unit conversion or health threshold calculation. A named review binds the exact reading hash; a later source correction requires a new review.

## Laboratory chain

The twelve included lab_* families preserve orders and requested resolution, physical samples and resamples, consecutive custody, accepted/rejected accessions, original reports/results, partial amendments, exact result reviews and target-report selections. The complete laboratory operating and adapter guides are included. Rejected or field-only samples remain in the observed population. Nondetect is not zero. A partial amended report must explicitly replace, withdraw or carry forward each earlier usable result.

The earlier target-report input remains historically valid when it was supported at its selection instant. The current view separately flags superseded results and changed review decisions. Current packet assembly cannot silently reuse a stale input after the amendment is known.

## Reports, filing and handover

A report's document label, claimed period, source cutoff and actual row dates remain separate. A report may begin as a retained draft identity before its final generated_at/document fields exist. Final reports bind exact retained input rows and original bytes, with meaningful source roles. Out-of-period rows need an explicit period-context explanation. Full eligible population records must be represented, including unresolved work. A prepared report and its named operator/board reviews are distinct from actual sending and receipt.

Report acceptance binds the complete header and input set. Send/publication events check the packet at that event instant. A late review or source arrival cannot retroactively justify an earlier send. A receipt/rejection/withdrawal identifies its prior actual dispatch, recipient and original document. External event identities are reconciled before counts. An actual sending event is not proof of regulator acceptance.

Handovers retain the actual outgoing/incoming person, system, preparation/effective instants, exact packet items, responsibility and supplied next due dates. The incoming person's acknowledgement binds the full packet digest. Actual authority periods and amendments remain visible. A handover acknowledgement is not an automatic change to treatment authority.

## Observed work

The required effort phases are editable and include field capture, sync reconciliation, laboratory coordination, report preparation, review, dispatch, correction and handover. Record active person-minutes separately from elapsed waiting. A stable work_key prevents a renamed file from creating new labour. Overlapping active work by one person is unresolved. Every included member must have both methods and every declared phase, including explicit observed zero, before a whole-population comparison is produced. The signed current-minus-baseline change preserves increases. Matched subsets and all observed current work remain separate; no capacity-to-cash extrapolation is made.

## Exact inputs and complete recovery

DOMAIN_HEADERS.json, base-schema.cjs, lab-schema.cjs and all 36 templates contain the actual canonical headers. Planning worksheets from any customer programme are separate from these imports. All full source/session exports preserve originals, selected and historical editions, supporting bytes, mapping drafts, unresolved references, named reviews and retained browser branches.
