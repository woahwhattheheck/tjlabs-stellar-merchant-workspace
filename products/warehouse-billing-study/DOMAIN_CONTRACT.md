# Warehouse Activity and Billing Study Desk

Independent supplied-record billing review for an existing WMS export. The source product remains the system that issues invoices and records accounting actions. Exact original source files, mappings, source/month replacement chains, dated rates, observed storage counts, explicit source-backed dispositions, actual invoice editions and accounting responses remain retained. Twenty canonical table families support ordinary record forms and arbitrary-column CSV mapping.

Amounts are decimal-string inputs, exact rational calculations and half-away-from-zero rounding once per charge to currency cents. No foreign exchange conversion. Missing days, rates, source partitions and eligibility are unresolved; they never become zero. Separate source IDs add, same source/month replacement selects only the explicit unsuperseded edition. Order reference alone is not shipment identity.

The public Tahona 41-row example will be retained unchanged and evaluated with explicitly authored rate-card fixtures. Its 1,152 pallet-days cost 844.80 at 22/month for September; 570 pallet-days at 22 plus 582 at 24 cost 883.60. This is source-data arithmetic, not a live customer invoice or observed software run.

Primary rules: https://tobalasoftware.com/tobala-billing/docs.html and https://tobalasoftware.com/tahona.html .

## Complete source and row meanings

The raw activity importer retains the exact supplied CSV text as a document, its captured and source-available timestamps, a frozen source mapping and digest, the original row locator and every generated activity. It commits the complete file or none. A separate source configuration declares canonical event, shipment row, order row or fulfilled line items. Line items require an explicit fulfilment group; a reused order reference never serves as a deduplication key. Canonical economic event keys are optional but, when supplied, must be unique across active additive sources. ShipStation item quantities are retained while a shipment row produces one order event.

Each client/source alias is explicit. Own-brand stock can be marked nonbillable. Client, warehouse, order, shipment and inventory ownership are reconciled; missing and conflicting identities remain visible. Storage scope is declared separately so a missing whole storage source cannot disappear. A complete source inventory original and locator must support the month scope.

Rate cards are complete effective-date versions. Matching warehouse and wildcard rates cannot both apply silently. Storage is daily, daily-prorated monthly, or one declared monthly snapshot; missing counts are never carried. Rounding is half away from zero once per exact charge, with the exact fraction retained. A client/month minimum is explicit, including a zero minimum; no imported minimum or additional-pick rows are accepted. The month-end card supplies the one client-wide minimum.

Source-backed waivers bind the exact billing input context and issue identity. Only explicitly waivable missing-rate or unknown-code exceptions can be waived; missing daily counts, invalid units and ambiguous economic identity remain unresolved. Actual source changes invalidate an earlier waiver.

The current month cannot be re-imported after a retained issued invoice. A signed next-period adjustment references the earlier actual invoice and approval source. Actual invoice lines, retained document bytes and accounting responses remain separate from proposed charges. The operator never performs issue, send, ledger writes or collection.

Effort includes all declared recurring phases for both methods. Missing phases remain unknown; identical observer/time/phase slices are not made distinct by renaming a source. Signed current-minus-baseline active person-minutes are reported without cash extrapolation.

## Exact canonical headers

### clients

```csv
id,name,currency,billing_email,billable,source_ref
```

### warehouses

```csv
id,name,source_ref
```

### source_systems

```csv
id,name,row_basis,date_format,client_column,date_column,code_column,fixed_code,quantity_column,unit_column,fixed_unit,child_column,reference_column,order_column,shipment_column,group_column,event_column,partition_notes,source_ref
```

### source_imports

```csv
id,source_id,month,warehouse_id,available_at,recorded_at,supersedes_id,original_document_id,mapping_json,mapping_sha256,row_count,complete_month,source_ref
```

### client_aliases

```csv
id,source_id,raw_client,client_id,source_ref
```

### code_aliases

```csv
id,source_id,raw_code,code,source_ref
```

### activities

```csv
id,import_id,source_row,raw_client,client_id,warehouse_id,date,raw_code,code,quantity,unit,child_quantity,reference,order_id,shipment_id,group_key,event_key,source_ref
```

### orders

```csv
id,client_id,warehouse_id,channel,reference,status,ordered_at,recorded_at,source_ref
```

### order_lines

```csv
id,order_id,client_id,warehouse_id,sku,quantity,source_ref
```

### shipments

```csv
id,order_id,client_id,warehouse_id,reference,status,shipped_at,recorded_at,source_ref
```

### shipment_lines

```csv
id,shipment_id,order_line_id,client_id,warehouse_id,sku,quantity,source_ref
```

### inventory

```csv
id,client_id,warehouse_id,sku,location,on_hand,allocated,observed_at,recorded_at,source_ref
```

### rate_cards

```csv
id,client_id,currency,effective_from,recorded_at,supersedes_id,label,source_ref
```

### rate_lines

```csv
id,card_id,code,warehouse_id,unit,basis,rate,included_units,additional_code,snapshot_day,source_ref
```

### dispositions

```csv
id,context_sha256,issue_id,decision,reviewer,recorded_at,reason,source_ref
```

### adjustments

```csv
id,client_id,warehouse_id,billing_month,original_invoice_id,code,amount,currency,original_service_date,effective_date,recorded_at,approved_by,reason,source_ref
```

### invoices

```csv
id,client_id,billing_month,number,currency,issued_at,recorded_at,subtotal,tax,total,status,source_ref
```

### invoice_lines

```csv
id,invoice_id,charge_key,code,description,quantity,unit,amount,source_ref
```

### accounting_events

```csv
id,invoice_id,account_id,external_invoice_id,status,invoice_total,balance,currency,observed_at,recorded_at,provider_ref,source_ref
```

### effort

```csv
id,client_id,billing_month,method,phase,active_person_minutes,observed_at,recorded_at,observer,source_ref
```

Actual invoice lines must map one-to-one to explicit proposed charge keys, including code, unit, exact quantity and rounded amount. Grouped source invoice lines require a supplied explicit allocation before this comparison; the current desk does not infer a grouping. Invoice currency binds the source client and study currency before comparison. Original service dates on next-period adjustments stay distinct from their posting date. Observation time cannot follow its recorded time.
