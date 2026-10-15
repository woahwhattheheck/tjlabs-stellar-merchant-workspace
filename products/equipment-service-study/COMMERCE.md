# Service commerce reconstruction

This module joins actual equipment service records to their commercial decisions. It evaluates explicit quotation-line approval, performed-work allocation, purchased-unit service benefits, replacement-related credits, manufacturer warranty decisions, rental custody and observed payment. It is the commercial arm of the complete distributor service workbench.

The module contains no prospect identities or private customer material. Its complete operating example is authored and fictional. Technical inspection results and serviceability decisions are supplied by the broader service model; this module preserves their relationship to the commercial record.

## Run the complete source

Load commerce-course.cjs and call course() in JavaScript, or from a Node project:

    node -e "const c=require('./commerce-course.cjs').course();process.stdout.write(JSON.stringify(c.result,null,2)+'\n')"

The maintained course uses the actual engine and complete input records. It covers a partial repair approval, first-service use, a failed repair and replacement, a posted credit, a partially settled warranty claim and a two-hour rental.

The complete example reports CAD176 quoted, CAD88 approved repair scope, CAD1,158 across four issued invoice purposes, CAD50 posted credit, CAD88 observed receipt and CAD20 modelled rental accrual. These categories describe different events and must not be added into one revenue total. The warranty records separately retain CAD40 approved and CAD20 actually paid.

## Join to the service workbench

service-commerce.cjs exports FIELDS, IDS, KINDS, hashRow and analyze. Its fifteen namespaced canonical families can be merged into the workbench schema. Every input includes ordinary immutable record and revision fields.

Call analyze(records, options), supplying as_of, extract_available_at for every family, expected_counts and population_complete, plus historical resolve and document callbacks. ADAPTER_CONTRACT.md specifies the exact interface. Missing observations remain unresolved; do not silently manufacture a callback result.

Retain the source CSVs, their mappings, raw originals and documents in the complete workbench session. The engine returns the selected current records, linked results, exact per-currency amounts and issues. A complete application export should carry this source module and the original input alongside the result.

## Commercial authority

Authority records identify the actual person, role, customer scope, source document and validity interval. A customer approval binds one immutable quote line and its canonical field hash. A revised quote does not inherit an earlier approval automatically.

The engine performs source reconstruction. Its output supports an operator review and does not execute orders, issue credits, send quotations, contact customers or release equipment. Those actions have their own actual operating workflow.

## Independent review corrections

The maintained course includes missing warranty amounts, duplicate work/sale invoicing, late-entered warranty approval, policy availability at benefit approval, and completed work recorded before its later allocation. These changes preserve the observed sequence without backdating source availability. The operating example's original commercial amounts are unchanged.
