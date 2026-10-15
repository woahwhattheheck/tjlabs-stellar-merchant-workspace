# Using the Construction Progress Study Desk

## Scope, source and exact originals

Begin with one actual site or a clearly defined group of projects. Record the source boundary and the returned trial boundary. An extract can be a full system report, a deliberately scoped CSV or a new edition prepared from an earlier retained record. The scope must describe which one it is.

Each CSV is retained exactly, including its original filename, UTF-8 byte order mark, quoting and line endings. The mapping selects original columns; extra source columns remain in the original. Family-specific record IDs are text. Leading zeros and punctuation are preserved. Do not change an identifier merely to make a join succeed.

The application offers every actual canonical field through the ordinary record editor. Select the table and source side, prepare a correction, explain its source and save. A correction creates a later extract and retains the previous original, mapping and row. It does not overwrite issued accounting evidence.

## Complete claim population

In the plan, set the claim-period start window as a half-open interval: the starting boundary is included and the ending boundary is excluded. Keep the complete original inventory and identify its page, section or row. Explicit project selection narrows the scope and remains visible.

A claim with an unknown project, identity or period remains unresolved. It is not reclassified as an excluded clean record. The complete population denominator is suppressed while those entries are unresolved. Draft, rejected and unpaid claims remain visible.

The ordinary plan has two distinct boundaries. **Decision boundary** controls what had happened. **Known as of** controls what evidence had been recorded and was available. A report also carries its own actual decision and knowledge boundaries. A later invoice line cannot bypass its parent invoice's issue time.

## Contracts, measured work and milestones

Import the accepted contract version and its actual source document. Preserve the original signature time, effective interval and supersession link. Permission is evaluated at the actual signature or decision time. A later departure of the signer does not automatically invalidate a prior signature.

Use the actual billing basis: measured progress, milestone, lump sum or mixed. Set certification, retention and deposit applicability explicitly from the agreement. An unknown setting remains unresolved.

For measured work, retain actual quantities, units, measurement intervals, authors, approvals and replacements. Quantity and pricing approval of a variation are distinct. Work may be instructed and quantity approved while the payable price is still unknown.

For milestone work, retain the actual signature, start, reception, dated or other condition, its amount basis, sequence, source and approval. A schedule entry is not evidence that the condition occurred. The milestone report shows expected scheduled amount and actual eligibility separately.

## Monetary reading

The report keeps claimed, certified, invoiced and received amounts separate. Cumulative values are not added across periods. The second cumulative certificate is compared with the prior actual certified position for the same project, scope and unit. An opening zero is used only when complete history is explicitly declared; otherwise the actual opening balance must be supplied.

Actual invoice line totals, tax and document totals remain unchanged. Expected calculations and discrepancies appear alongside them. Retention deductions and deposit applications are already part of an invoice's line arithmetic; they are not subtracted a second time from that same invoice.

A supplier invoice consumes only its explicitly linked commitment quantity. Higher actual unit price does not make unrelated units disappear. Delivered-uninvoiced work remains commitment exposure. Supplier payments are shown separately from recognised cost.

## Editing and recovery

Every form is retained while switching sections. Starting a different record, replacing a mapping or preparing another review retains the preceding form. A document unlink retains the document bytes and the preceding study.

Browser storage uses compare-and-swap. If another tab saves a different branch, the desk keeps both complete copies and asks you to choose explicitly in **Save & recover**. Selecting your local branch retains the saved branch before continuing. It does not manufacture a business revision.

When browser storage fails or a session reaches its configured size limit, the status changes to memory-only recovery. **Save complete file** includes every pending emergency form and rejected import. Import is staged and validated before replacing the selected session. An unsuccessful import remains recoverable.

Adding a currency preserves and reconciles an unfinished plan, including an emergency-only plan. The old overlay clears only after the full successor validates and becomes selected.

## Reviews and exports

Operations and finance reviews bind the full study digest, including selected records, mappings, original documents and plan. Notes prepared for a prior edition cannot silently approve a new one. Start a new review explicitly; prior notes remain retained.

Download the complete session for future editing. The study ZIP includes ordinary JSON, CSV and Markdown reports, original documents, exact source text and the complete session. The application-source ZIP includes all maintained modules, guides, templates, authored examples and source courses. It is suitable for handing the work to another operator or developer without relying on this browser.
