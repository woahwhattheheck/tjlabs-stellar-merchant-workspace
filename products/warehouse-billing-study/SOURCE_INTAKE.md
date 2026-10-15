# Original source intake

Retain actual whole-month source exports, agreed customer rate cards and inventory scope before calculating. Customer research and proposed adoption worksheets are separate planning inputs, not operational billing records.

## Canonical raw activity CSV

```csv
client,date,code,quantity,unit,child_quantity,reference
```

Raw activity import can map arbitrary column names using a retained source_systems configuration. It freezes that mapping in source_imports, keeps the exact raw original as a document, records its SHA-256 and original row locators, and creates canonical activities. The entire file is adopted atomically or retained as an unapplied candidate.

The retrieved public example in examples/public-activity.csv is the text extracted from the public template, not an original HTTP-byte capture. examples/public-source.json retains its URL and retrieval description. It has 41 activity rows. All rates, clients' operational scope, invoice records and observed-work data in the executable example are expressly authored fixtures.

## Twenty source families

Exact headers are in templates/ and DOMAIN_CONTRACT.md. Use the ordinary record editor for normal corrections, preserving the source reference and actual recorded time. Use complete CSV mapping for larger extracts. Do not edit generated selected CSVs without retaining their original extraction context and explicit re-import.

- Clients and warehouses establish billing and physical ownership.
- Source systems, imports and aliases establish whole-month partitions and frozen mapping.
- Activities retain imported event quantities, child quantities and references.
- Orders, order lines, shipments, shipment lines and inventory establish actual ownership and references.
- Rate cards and lines retain effective date, currency, billing basis and source.
- Dispositions retain actual source-backed, digest-bound waivers.
- Adjustments keep prior invoice, original service date, later posting date and named approval.
- Invoices, lines and accounting events retain actual issued and downstream observations.
- Effort retains observed disjoint active work by client, method and phase.

## Row basis is part of the source contract

A ShipStation-style shipment row produces one billable order event even when quantity and child_quantity both contain Items. Retain the shipment identity and reference; a reshipment can legitimately share an earlier order reference.

Fulfilled Shopify-style line items require an explicit fulfilment group. A repeated order reference alone cannot establish that rows are the same shipment or fulfilment. Blank dates reject the complete import. An explicit canonical event key shared across additive exports can identify the same economic event; duplicates require source reconciliation.

Storage rows are whole observed counts for a client/warehouse/code/day. Keep explicit zeros. Missing days remain unknown. Importing additional-pick or minimum rows is invalid because those charges are derived from declared rules.

## Known-at and chronology

Choose the exact selected source edition and the study cutoff. Extract availability, original capture, business date, effective date and observation/recording time are separate. A later selected extract is not silently available at an earlier cutoff: select the appropriate retained edition when reconstructing historical knowledge. Same-source/month import chains preserve previous versions. Actual observation cannot follow its recorded timestamp.

Supporting originals can be arbitrary binary files. Same filenames with different bytes remain separate. Document availability corrections bind the exact prior metadata, retain the previous value, and leave bytes unchanged. Removing a link retains the original file and prior study.

A raw append to a nonempty prior canonical activities or source_imports extract with unmapped fields is refused. Supply an explicit complete mapping first. This preserves unavailable prior values as null instead of silently converting them to observed blanks; the complete new file stays an unapplied recoverable candidate.
