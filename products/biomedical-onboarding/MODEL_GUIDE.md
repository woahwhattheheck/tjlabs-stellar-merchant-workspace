# Comparison model and interpretation

## Exact text and explicit availability

All imported canonical field values are text or null. Leading zeros, punctuation, whitespace and date/amount representations are preserved. There is no implicit trimming, currency conversion, date inference, fuzzy identity match or clinical interpretation.

A selected original column containing an empty cell produces an observed empty string. A field without a selected original column produces null, meaning unobserved. selected/availability.json declares each field's availability and original header. Keep it with selected CSV tables.

Source originals are immutable. An import creates a content-bound original and a kind/side/mapping extract. Each side selects one retained extract per kind. Changes to mapping or selected source create ordinary history rather than overwriting the source.

## Identity and historical relationships

Crosswalks map source IDs to returned IDs for each record kind. Duplicate source mappings are rejected. Many-to-one returned mappings, dangling maps, duplicate IDs, missing parents and unexpected returned rows are review findings. Parent references are compared through their own maps.

The asset's current facility, the work order's facility and the event/report's historical facility are separate facts. A moved device does not cause historical report references to be rewritten. Approved PM source records, repair visits, return visits, inspections and upholstery jobs remain distinct.

The desk preserves source amounts, status, dates, findings text, procedure references, technician references and signature references. It does not approve a procedure, assign a maintenance interval, interpret an electrical safety reading, authenticate a signature or release equipment.

## Report attachments

Every retained binary document has its exact SHA-256, original filename, media type, byte count and notes. Explicit links associate documents with source or returned report IDs.

For each uniquely paired report, the comparison evaluates distinct linked SHA sets. Missing source bytes and additional returned bytes are independent findings; an altered file commonly produces both. Identical SHA sets mean exact retained bytes match, including their original encoding. Neither-side bytes is unobserved. A matching report_ref value does not by itself establish attachment fidelity.

The SHA-set comparison does not distinguish duplicate identical attachments by count or authenticate the source's legal signature. The complete link and document indexes retain those records for inspection. A legitimate new signed version is a difference to review against its actual source authority.

## Comparison and decisions

incomplete means one or more kinds/sides lack selected extracts. differences_for_review means the selected scope has missing evidence, unresolved identities or changed values. selected_fields_match means the selected canonical field values match through explicit maps and any linked attachment differences are absent; the separate attachment table still identifies unobserved files.

A named review binds the entire current study, including all retained sources, mapping selections, identity maps, files and notes. Historic decisions remain retained. The latest chronological review for the same digest controls the displayed decision. A recorded acceptance leaves differences visible.

## Source-native authored course

The complete fictional example has one customer, two facilities, three assets, two approved-source PM records, three work orders/events/reports and two billing records. Two assets share printed tag 001 across different facilities; one has an observed blank serial. One asset has moved, with its previous event/report retaining the prior location.

The first returned edition has equal counts but nine actual field/link changes. The corrected edition has zero differences while preserving every first return and original. Twenty-four CSV originals and three exact authored report documents remain. An additional course changes returned attachment bytes and confirms that the document mismatch is visible.

## Source-system boundary

The canonical fields are an independent study dictionary. Confirm the actual source and destination import contracts before a production transfer. Relevant owners select and authorise that transfer. This application produces comparisons and portable working records through retained administrative data.
