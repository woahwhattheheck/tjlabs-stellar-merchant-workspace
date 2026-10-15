# Marine job and weekly approval workbench

Open the worked browser desk to inspect the five original source editions, or start a blank desk and receive the nineteen source tables together. Every CSV keeps its original name, BOM, newlines, bytes and SHA-256. Use a new edition for a corrected export; earlier accepted editions, decisions and selected records remain intact.

## What the operating example does

Two boats and three jobs exercise a revised quote, two technicians, corrected offline labour, an explicitly returned/replaced part, supplied material units and independent cost/bill rates. At the latest edition JOB-A has NZD 305.00 of supplied record costs, NZD 550.00 of supplied billable amounts and a NZD 1,000.00 quote. Those are separate from its original invoice and actual receipt/refund allocations, which leave NZD 650.00 outstanding. JOB-C keeps an unfinished timer and NZD 150.00 allocated deposit; cost stays unknown. The original receipt retains NZD 50.00 available credit.

The original approved week retains 10,800 seconds even after the current time becomes 9,000 seconds. A new submission receives its own approval and source-bound accounting request. Open current time remains visible beside that snapshot. Accounting success does not create a payment. Later observation of an older unknown result does not replace a later occurred success.

The original customer handover retains selected original versions. Its bounce remains visible after a delayed older delivered event. The corrected handover selects corrected time, replacement materials and only the customer-approved diagram; the internal diagram stays in the private operating archive. Acknowledgement is independent of subsequent transport.

## Bringing original records

Use the exact headers in MARINE_SOURCE_CONTRACT.json. Retain stable company IDs and original source references; quoted money, invoice money, receipts and job-cost entries use explicit currency and integer minor units. Material quantity_milli expresses thousandths of its literal supplied unit. Labour cost and bill rates are independent per-hour inputs. A blank rate stays unknown; supplied zero stays zero. Entry arithmetic rounds half up per record to minor units. The comparison uses supplied records and does not estimate unrecorded costs, taxes, overhead or payroll rules.

Record version chains contain a stable entry ID, unique version ID and explicit predecessor. Correct an entry through the next full source edition. Calendar instants include seconds and UTC offsets. Running timers retain an empty end and never accrue guessed duration. Source events have both occurrence and observation instants. Full original malformed sources remain in the desk draft for correction; accepted editions are validated before adoption.

## Technician weeks and customer selections

week_periods declares actual offset-bearing boundaries and the company's boundary basis. Each week_submission lists exact final time-version IDs. Reviews flag current corrections, omitted current final entries, unfinished timers and entries that cross its boundary. Original submissions/approvals remain independently inspectable; no automatic boundary split occurs.

customerReport(workspace, editionId, handoverId) creates a standalone selected customer record. It includes only the selected durations, material descriptions/quantities, media references/digests and explicit customer notes. Use the complete operator report only inside the business: it contains the full original archive. External send outcomes must come from actual source observations.

## Continuing and running the source

The browser wrapper uses tjlabs.marine-job-desk.v1 around core tjlabs.marine-job-study.v1. Keep the entire saved desk when moving to native tools so unfinished source text, notes, received editions, all reviews and native continuation survive. Core factory is createMarineJobCore({codec}); create takes {id,label}. The module is self-contained apart from its archive codec. Native supported Node execution: `node run-operating-course.mjs`.

The actual 18-check operating course runs one five-edition journey with 12 retained reviews. It covers original-source byte reopen, correction history, money distinctions, approval snapshots, selective sharing, uncertain accounting and meaningful cross-job rejection. These are authored software examples. Current public VesselOne pages advertise an early-access founding-company workflow; they are not input records for this example.

## Product source

https://www.vesselone.io/ and https://www.vesselone.io/terms were directly read on 15 October 2026. The homepage describes technician boat/job time/photos, quoted versus actual amounts, invoice/payment exchange with Xero, selected customer history and weekly approval. It labels the displayed numbers as an example. The product's API/import contract and company-specific accounting settings require actual authorized exports when commissioning.
