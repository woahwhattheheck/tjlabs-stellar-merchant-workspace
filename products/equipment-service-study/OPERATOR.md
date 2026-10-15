# Operating the equipment-service study

## Establish the source boundary

Give the study a useful title and declare whether the material is operational or authored. Describe the original and returned systems and the actual rights to use their records. Choose a half-open intake window: its start is included and its end is excluded. Set an actual knowledge cutoff. A period that has not ended by that cutoff cannot be reported as a complete population.

Expected case count and complete-inventory attestation are independent inputs. They should come from a supplied intake register, not from counting only the cases that happened to import successfully. Unknown inclusion, missing case identity and unresolved customer-unit lineage remain in the inventory and suppress its whole-population fraction.

Commercial coverage similarly uses an explicit original-row count for each of the 15 commercial families. Include revisions and voids in those source counts. Zero means an actually observed empty source; blank means the source population has not been established.

## Import and mapping

Each CSV retains its full original text, filename, SHA-256 and source line spans. Use the exact templates as a starting point or map another supplied export explicitly. No proprietary service-system schema or API is assumed. Select the correct source or returned side before importing.

A field that has no mapped source column is unavailable. It must not be converted to an empty observed value merely to complete an import. The record editor shows unmapped fields separately and requires an explicit mapping change before editing them.

A canonical row has an immutable version `id`, a stable `record_key`, a numeric `revision`, an explicit `supersedes_id`, its actual status, source recording time, source availability and source locator. A later correction is another retained extract. Its source version fields must describe actual source history; importing a file today does not backdate source availability.

**Selected editions** controls which retained extract supplies each family. The ordinary record editor and native correction request bind both study identity and selected extract. If another edition becomes selected, the old correction is refused and retained for deliberate reconciliation.

## Customer, site and unit context

Keep customer equipment separate from provider-owned loaners and third-party units. A replacement unit is a new asset identity, not a changed serial number on the old asset. Parent systems and sensors have explicit relationships. Repeated tags, blank serials and ambiguous source IDs require a source-backed identity decision.

Intake context is evaluated at actual receipt. Technical work uses its actual event instant. A legitimate later movement of a unit does not rewrite where the earlier inspection happened. Current context and historical work remain separate observations.

## Procedures and technical observations

Import the actual approved procedure and retained form original, its applicable manufacturer/model/action and explicit item rules. Enter actual observations and document links. Do not infer service eligibility from stock availability or a broad manufacturer name. A supported action requires its exact dated qualification.

For an inspection, work record or certificate, enter the exact procedure version ID and use **Copy exact procedure / configuration / quote hashes**. For an inspection this also binds the unit’s supplied configuration. If several historical unit versions are present, choose an unambiguous appropriate source edition or provide the exact supported binding from your source; the helper will not guess.

A certificate’s technical dependencies must have been available at issue/sign time. A later inspection entry or later-arriving original cannot retrospectively justify an earlier certificate. Repair closure requiring reinspection needs the actual reinspection after completed repair. A signed statement and any actual serviceability decision remain supplied records.

**Supporting originals** retains full binary bytes. Same-name files with different bytes are distinct. Link an original to a typed source row deliberately; matching names do not establish identity. The preview allowlist covers common images, audio and video; other originals remain available for exact download.

## Approval and money

A commercial approval binds an immutable quoted line and its complete hash. The helper copies that exact hash while retaining the preceding pending form. It does not record the approval itself. Enter the actual approver, authority, time, quantity and approval original.

Performed work can become available after completion. Its physical time determines which prior approval applied; the later work observation can be used when a later allocation is recorded. Aggregate allocations and invoice consumption cannot use the same approved work twice.

Purchased-unit first-service eligibility requires its actual policy, purchase and authorised use. A replacement credit remains attached to the original diagnosis charge and the exact purchased replacement. A warranty approval is not a warranty payment. A rental’s physical issue and return concern the distinct rental unit; its modelled accrual does not establish an invoice or cash receipt.

Commercial totals are separate by category and currency. A known subtotal with incomplete source coverage is labelled incomplete. No currency conversion or tax default is invented. Provider transaction identity, rather than source filename, prevents repeated cash observations from becoming additional money.

## Reports and review

Report inputs bind family, retained extract, immutable row and canonical hash. Use the report-input helper to copy these values; set the actual report purpose, source role and dates separately. The complete report population must account for every selected case in its historical window.

A report review binds its complete input list, population and required roles. **Copy current report review basis** prepares that binding; it does not claim a human has reviewed it. Changed source content or report scope requires a new actual review. Ambiguous report identities remain unresolved.

The source-bound review page covers the complete current study and originals. Starting another review retains the preceding draft. Changing the study after a review draft is prepared makes that draft stale.

## Complete recurring work

Record active person-minutes for intake, identity work, inspection, quote preparation, approval handling, service records, customer packet preparation, correction and follow-up, or the explicitly declared phases for your own study. Use distinct actual work keys independent of filenames. Repeated representations and overlapping work by the same person require reconciliation.

A comparable whole result needs the complete eligible case population and matching phase coverage for both methods. The matched subset is shown separately from all observed current work. Missing observations are not zero. Signed current-minus-baseline minutes may be positive or negative; the desk does not extrapolate them into cash savings.

## Save, recovery and export

Pending forms are retained separately from applied records. Failed file imports keep their original candidates. When normal persistence reaches a limit, the complete pending input remains in emergency recovery and the status explicitly says it is in memory.

Download **Save complete file** before replacing a study or closing a browser with unresolved storage status. A complete session includes originals, binary documents, mappings, every unfinished form, historical editions and retained branches. A study-only JSON omits the session’s editor state.

Two browser tabs use a comparison of the exact saved state before writing. If another branch has been saved, both copies are retained. Choose **Keep this browser branch** explicitly to continue from the local branch. Recovery downloads preserve complete competing branches.

The study ZIP contains readable reports, full machine-readable analysis, editable canonical CSVs, mappings, original files, exact binary evidence and session recovery. The application source ZIP contains the whole maintained implementation and authored course. Neither export writes to a customer source system.
