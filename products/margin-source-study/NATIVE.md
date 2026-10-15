# Native command line — Node 18+

Run from the complete extracted application directory. No dependency installation is required.

    node native/margin-desk.cjs new --label "Agreed plant study" --out work/initial.json
    node native/margin-desk.cjs course --kind corrected --out work/authored.json
    node native/margin-desk.cjs inspect --in work/authored.json

Every modifying command writes a new full session to --out. A different existing file is preserved and the command returns an error. Full browser sessions retain their unfinished forms, history and recovery bank through native edits.

## Import originals

    node native/margin-desk.cjs import-csv --in work/initial.json --kind sites --side source --file supplied/sites.csv --available-at 2026-10-14T18:00:00Z --out work/sites.json

--mapping accepts a JSON object mapping every canonical field to an original header or the empty string. Without it, exact canonical header names are mapped. --at sets actual capture time; --available-at is required and records when the complete source edition existed.

Use select with --kind, --side and --extract for a retained edition. crosswalk accepts a CSV containing source_id,target_id; match-ids adds only unique exact-ID pairs for --kind.

## Study configuration and records

set-config accepts label, data_class, source_scope, returned_scope or authority_notes.

margin-plan accepts --file with one or more known plan fields: as_of, side, currency, basis_unit, accounting_basis, scope_notes, comparability_notes and required_review_roles. comparisons accepts a complete comparison array and --reason; previous plans remain in history.

record accepts --file containing kind, side, row_index (null for new), and a complete value object with canonical fields. Supply --reason and optionally --at. Unmapped fields remain null until an explicit mapping is supplied. A source correction's new complete edition becomes available at that recording time.

## Supporting files and reviews

add-document accepts --file, optional --type and --notes. link-document and unlink-document use --side, --kind, --record and --document. Unlinking retains original bytes.

review requires --digest, --role, --reviewer and --decision accepted|revise; optional --notes and --at. Obtain the digest from inspect. Both configured operations and finance roles must accept the same current study to show complete recorded acceptance.

## Recovery and complete export

import-session accepts --file with a validated full session or study, retaining the old session. restore-edition uses --index from history; open-branch uses --hash from the recovery bank.

    node native/margin-desk.cjs export --in work/authored.json --out work/complete.zip
    node native/margin-desk.cjs export-directory --in work/authored.json --out work/readable-export
    node native/margin-desk.cjs build-html --out work/Margin_Source_Study_Desk.html
    node native/margin-desk.cjs source-zip --out work/application-source.zip
    node operator/run-course.cjs

build-html and source-zip verify every source-manifest member before producing the full offline artifact. The generated HTML embeds the source needed for its application-source download. Export-directory requires a new destination; an interrupted partial directory remains available for recovery and a fresh destination can be selected.

The whole-course runner executes production model, generated HTML handlers with injected browser services and native command source with injected filesystem services. Actual OS/rendered browser receiving is a separate exercise described in RECEIVING.md. Emergency envelopes containing pending memory-only input reopen through the browser recovery flow.
