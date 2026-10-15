# Open and edit

## Scope first

Open Biomedical_Onboarding_Desk.html. The initial study is empty. In **Scope & plan**, identify the source owner, source system, extraction dates and exact included population. Define the matching returned trial population. Record approved procedure/schedule references as source authority, not inferred instructions.

Keep the first cohort administratively useful: one completed service week or an approved existing PM cohort, with the actual related customers, sites, assets, jobs and reports. Preserve excluded records and unresolved identity decisions in the scope notes.

## Import exact originals and map ordinary columns

In **CSV intake & mapping**, select a record kind and **Original source** or **Returned trial**. Choose an authorised UTF-8 CSV. Its complete original is staged before any applied study changes. Map the original headers to canonical fields and save.

The ID column is required. Other blank mappings are explicitly unobserved. The original header must be unique, and every row must have the declared number of columns. Quoted commas and quoted CR/LF/CRLF line breaks are supported. Source row spans refer to the original physical lines.

Do not manufacture a serial number, turn an invoice date into completion or populate a missing PM interval with a default. Store the actual text exactly. Extract a workbook/PDF to CSV only through an authorised, recorded transformation; keep the binary original in **Original documents** and describe the relationship in study notes and extract labels.

Each kind/side has its own complete pending file and mapping. Switching sections keeps these drafts. **Prepare mapping revision** opens a retained original in normal controls and keeps the earlier extract. New mapping editions select a new extract; previously selected editions remain available.

## Select exact editions

**Selected editions** lists every retained extract. Choose one per kind and side. New record kinds may remain unselected while intake progresses, but comparison will show that coverage as incomplete. A header-only authorised CSV represents a known empty table; an unselected table does not.

## Pair identities

In **Identity maps**, choose a kind and pair each original ID with its returned ID. Add or remove draft pairs, then apply the complete map. **Add unique exact-ID pairs** only adds unique identical IDs that do not conflict with already applied maps. It does not infer identity from names, tags or serial numbers.

A parent relationship has its own map. A moved asset's current facility can differ from a previous service event's facility; the desk compares those source facts independently. Duplicate printed tags are harmless when stable IDs distinguish the assets. Duplicate or blank stable IDs remain unresolved findings.

## Retain and compare report files

In **Original documents**, retain the exact original file, then link it to the relevant original or returned report ID. No text extraction is performed. The file's original bytes, filename, media type, byte count and SHA-256 are retained.

For explicitly paired reports, comparison shows the SHA sets of linked source and returned bytes. A changed report creates missing/additional-byte findings. A legitimate amendment should remain visible and receive an explanation. If neither side provides bytes, attachment comparison is **unobserved**, even when record references match.

If a document was linked to the wrong report, use **Remove this link; retain earlier edition**, then add the correct exact link. The document bytes and previous relationship remain in complete study history. Review the complete current link list before acceptance.

## Review and save

**Comparison** displays row counts, exact field/link differences, missing columns and report-byte comparison. It names the original file and line span for each row finding. Read column availability alongside ordinary canonical CSV exports: CSV blank alone cannot represent an unobserved column.

**Review** records the reviewer's name, timestamp, decision and notes against the whole current study digest. Changing sources, mapping, selections, links, scope or notes makes earlier decisions historical. An unfinished review also remains bound to the earlier digest. **Start current review** preserves its earlier notes and starts a fresh decision. A later request to revise supersedes an earlier acceptance for the same study; acceptance does not hide findings.

**Save complete file** downloads the complete portable session, including pending mappings and original files, every prior study edition, reviews and retained branches. **Download complete working export** produces the session, report, comparison JSON, selected CSVs, field-availability manifest, identity maps and all originals/documents. **Download application source ZIP** provides the entire runnable source closure.

## Recovery and multiple tabs

Browser storage is local to the current browser/origin. Keep an independent complete-session download. Do not rely on copying only the HTML file to move work.

Each saved update compares the previously acknowledged saved identity. If another tab changed it, this tab retains its local work and the competing complete branch. In **Save & recover**, explicitly choose **Keep this browser branch; retain saved copy** or **Open saved copy; retain this branch**. Later unseen changes still create a conflict; adopting a branch is not permanent permission to overwrite another tab.

Opening a different session first downloads the current session, validates the incoming complete successor and retains both preimages. Every retained branch can be downloaded or reopened. Restoring a study edition retains the current complete session, including its unfinished forms.

The portable session has a 40 MiB limit. A source file is limited to 24 MiB; full-session input is limited to 64 MiB before complete validation. Retained binary bytes and history contribute to the session size. If storage or size limits reject a pending input, the status switches to memory-only/emergency recovery. Download that complete emergency file before leaving. The desk keeps complete rejected readable import candidates and unfinished forms. A replacement action must preserve the old pending form successfully before clearing it.

For a first-edition v1 study/session, opening asks explicitly to migrate. The exact original file is retained as a document. All prior study editions, complete branches and unfinished forms are preserved. Added record kinds remain unselected and added columns remain unobserved.
