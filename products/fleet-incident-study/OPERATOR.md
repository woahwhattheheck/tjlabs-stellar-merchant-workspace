# Operate the complete study

## Start and retain your work

Open Fleet_Incident_Study_Desk.html. The new study is empty. Set the study name, data class, original and returned source scope, and actual authority notes. The authored course is a separate explicit action. Save a complete session JSON at the start of real work, then save a new copy after important review or intake stages.

The application uses this browser's local storage through IndexedDB. The visible status distinguishes saved work, pending writes, storage errors and another tab's newer branch. A downloaded complete session is portable; another browser or a different origin does not automatically share the same saved state.

Every ordinary form is retained as unfinished work, including pasted CSV, field mappings, record edits, historical bindings and review notes. An operation that cannot fit within the session limit retains an emergency form and exposes recovery rather than silently claiming it was saved. Export that recovery before closing the page.

## 1. Bring in complete originals

In CSV intake, choose one of the actual 24 families and the source or returned side. Read the original file or paste its exact text, enter a useful source name and record its actual first availability. Map each canonical field to the real source heading. A field left unmapped is unobserved; a mapped empty cell is an observed blank. They remain different in comparisons and exports.

Inspect the mapping before importing. The original text, including a UTF-8 BOM and line endings, is retained. A corrected mapping creates another extract rather than replacing the original. Use Selected editions to choose which retained source edition is current for each family and side.

The actual acquisition timestamp is separate from first availability. Use first availability only when supported by the source's history. A file collected today is not automatically evidence that every row was available at the earlier incident cutoff.

## 2. Resolve records and parent identities

Use Records for normal add and correction forms. Choose family and side, then a retained row or a new row. The form carries the study and selected-extract identity. If another action changes that source selection, prepare the edit against the current edition before applying it.

The canonical id identifies the exact version row. Each family also has a business identifier such as asset_id, assignment_id or cost_id. A continuing object's changed state uses a new version id, the same record_key, an increasing revision and an explicit supersedes_id. Keep the predecessor in the supplied source. Setting record_status to void records an explicit removal without deleting its history.

Crosswalks pair source version ids to returned version ids. Add unique identical IDs only when they refer to the same records; otherwise enter explicit pairs. Source and returned business IDs may differ, so check their parent relationships as well as visible values. Unknown selected values stay visible in the forms until deliberately reconciled.

## 3. Retain supporting material

Supporting originals accepts actual document bytes and links them to a selected side, family and version record. Retain photographs, work-order PDFs, machine specifications, contracts, returned analyses and accounting originals in their actual formats. Two files sharing a name remain distinct when their bytes differ.

Use the original digest helper to fill the exact source-document hash and size. Correcting a document's availability requires its current metadata and byte identity; a stale correction is rejected. Removing a link preserves the document and the preceding study edition. Linked source/returned attachments are compared by retained byte identity.

## 4. Define the whole application and question

The Fleet plan sets the selected side, source knowledge cutoff, decision instant, actual question IDs, currency precision, required review roles and recurring effort phases. Declare the comparison population in review_questions and list every eligible assignment in comparison_members, including failures, explicit exclusions and unresolved members.

Use application_profiles to state what counts as useful output and the working context: load, route, configuration, terrain or floor, acceptance requirements and actual units. Record a named context reviewer. An arbitrary model label does not establish comparable work.

In a review-question or incident record, the historical-selection controls copy an exact family-to-extract map into the retained source-selection field. This preserves an earlier complete snapshot while the current study continues. A current export acquired later cannot silently serve as that earlier snapshot.

## 5. Inspect the resulting account

Timeline and study views show questions, useful output and cost rates, rental/operational/meter measures, asset and job downtime, incidents, pre-event evidence, current outcome labels, telemetry, actual cash, recurring work and issues. Read unresolved findings alongside the retained known subtotal. Null means that the claimed complete measure is not established; it is not zero.

A report-input form can select an actual family, retained extract and exact row. The binding helper fills the row id, revision, extract, source document and canonical-row hash. Add the required parent records to the frozen source set. The report checks historical availability and approval; changing today's selection does not rewrite the old row.

## 6. Record review and export

Complete the actual operations, engineering and finance reviews under the configured roles. Review drafts bind the full current study digest. If the study changes, start a new review while retaining the old notes; an earlier acceptance does not approve changed source data.

Use the ordinary exports to download the full session, complete study bundle, readable comparison report or application source. The full session includes pending forms, history and retained branches. The study bundle includes source originals, selected canonical CSVs, explicit column-availability information, documents, lineage, comparison and domain results.

## Recovery and conflicting tabs

If another tab has saved a different branch, ordinary saving stops rather than overwriting it. Inspect the saved copies and choose explicit branch adoption; both complete preimages remain in recovery. Importing a session also retains the preceding full session and its unfinished forms. Export before replacement so an additional independent copy is available.

The recovery list opens prior studies and complete retained branches. Review the study label and source scope after opening one. A prior branch may contain a different pending form or source selection; those are preserved as that branch's work, not silently merged into the selected current form.
