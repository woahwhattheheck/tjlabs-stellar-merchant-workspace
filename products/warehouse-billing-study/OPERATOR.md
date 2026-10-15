# Operating the complete billing study

## Select a real study boundary

Choose one actual warehouse/client billing month and list every additive source partition. A source is a business-defined export stream, not a filename. A repeated download of the same source/month is a replacement; a genuinely different source is additive. Preserve a complete inventory original and a precise locator explaining which clients, warehouses, storage scopes and source streams are included.

The study distinguishes source evidence from returned or independently mapped records. The billing plan chooses which side supplies the calculation. The Return comparison checks exact fields and explicit identity maps separately. It can remain incomplete when only one side has been supplied, while the independent billing calculation is complete for its declared evidence side.

## Prepare the source model

Use Observed records to create clients, warehouses, source systems, aliases and rates, or map complete CSV exports through CSV intake & mapping. Every canonical field is either mapped to an actual source column or explicitly unavailable. A mapped empty cell is an observed blank; an unmapped field is unobserved. The selected availability manifest preserves that distinction.

Source systems declare row_basis and date_format, then literal column names or fixed code/unit values. Supported row bases are canonical_event, shipment_row, order_row and line_items. Supported dates are yyyy-MM-dd, M/d/yyyy and iso_timestamp. The original timestamp text remains in the raw source; timestamp imports use its explicit local calendar date.

For the public seven-column template, map client, date, code, quantity, unit, child_quantity and reference to the same names. Use canonical_event. Add an explicit client alias for each actual raw label. Source-system records also carry optional order, shipment, fulfilment-group and canonical economic-event columns.

## Import without losing the previous month edition

Raw activity import loads the whole UTF-8 file into a retained draft before applying anything. Review filename, source, warehouse, month, availability, capture time and complete-month declaration. A missing or invalid date/quantity rejects the whole file; the full candidate remains recoverable. The explicit predecessor must still be the current source/month head when the import is applied.

If the source selection or study changed while preparing the import, use Refresh binding and predecessor. That action retains the complete old draft and deliberately prepares a new binding. It does not silently apply an older candidate to a different study. All original source-month files remain retained after replacement.

A supplied actual issued invoice closes raw re-import for that billing month. Preserve later corrections as signed adjustments in a later billing period with the earlier invoice and original service date, or retain a source discrepancy for the responsible billing owner.

## Review calculations and actual records

Billing & actual records shows complete proposed subtotals separately from observed partial amounts. Missing coverage makes the complete subtotal unresolved. The charge table retains exact quantity, applicable card/line, decimal amount, rounding result and contributing activity IDs. The daily storage table retains each count and applicable rate.

Resolve a wrong mapping, missing rate or incorrect ownership through the source-backed record editor or a corrected complete source import. Every correction creates a new selected extract with its previous source and reason retained. An actual source waiver is available only for specified exceptions. Prepare waiver fills the exact issue and current source-context digest; enter the real reviewer, reason and source. A changed calculation input expires that waiver.

Enter actual invoice and line records with exact charge keys. The current comparison expects one actual line per proposed charge; an aggregated real invoice requires a supplied explicit allocation before comparison. It never invents allocation. Retain the original invoice file and type its link to that invoice record. Accounting observations carry account ID, external invoice ID, actual status, amount, balance and observed/recorded timestamps. Reported paid is an observed source state, not a payment action by this desk.

## Complete review and handover

Named source and billing reviews bind the complete selected study. A retained unfinished review cannot be applied after the source changes. Start current review to preserve the old notes and prepare a new review. Each configured role must record its own decision; a later decision for the same role and digest supersedes the earlier decision.

Download the readable report for review and the complete working archive for continuation. Save complete file carries all forms, branches, originals and history. The archive also includes editable selected CSVs, availability metadata, source documents, exact calculation JSON and CSV traces.

## Recovery

The status line distinguishes saved, unsaved, memory-only, conflicting-branch and emergency-pending states. File reads reserve the operation before asynchronous decoding. Browser persistence compares the saved state in one IndexedDB transaction. A different tab's branch is retained; explicitly choose which branch to continue. Both full preimages remain downloadable.

Every replaced draft and explicit reset retains the preceding complete form. Source and document replacements retain exact bytes. If the forty-MiB session limit or browser storage prevents persistence, the pending form remains in emergency recovery. Download it before leaving. Imported complete sessions are validated before replacement and the current complete session is downloaded first. Rejected import originals remain available.

The browser file is offline. It contains no network dependencies or automatic publishing. Browser-managed storage can be cleared by the browser or user, so keep independent complete session files.
