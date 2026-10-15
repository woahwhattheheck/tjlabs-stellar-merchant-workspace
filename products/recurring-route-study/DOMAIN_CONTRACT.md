# Recurring Route Study Desk — source and operating contract

## Purpose and product context

This independent companion evaluates supplied route records and preserves the complete source chain. MIE Solutions describes RouteProof as an early-access concept; the listed features and interface are being explored and the displayed records are sample data. This desk is a separate working study application. It accepts authorised exports from the operator's existing systems and the records produced during an agreed trial. It does not schedule a live route, send a customer report, operate accounting software or determine that a service actually happened.

Primary product: https://miesolutions.us/routeproof
Primary technical reference: https://www.w3.org/TR/geolocation/

## Whole scheduled population

Use one consecutive scheduled-start window [population_start, population_end), the actual as-of cutoff, the complete scheduled-stop inventory and a precise original locator. Every scheduled obligation has a stable stop ID. A blocked attempt followed by a revisit retains that one stop ID and has two attempt IDs. Missed, cancelled, incomplete and no-attempt stops remain in the denominator. A source-backed explicit exclusion has included=no and a reason. Unknown selection, missing identity or unresolvable scheduled times remain unresolved and suppress the overall fraction. A revisit is not an extra completed obligation.

The study may select company IDs and service kinds. Unobserved scope values are not silently treated as outside scope. Each site, customer, asset and route has a literal relationship; site versions preserve the location coordinate context. An assignment references the exact dispatched route and requirement editions, technician and effective window. Superseding assignments retain previous rows. The assignment must already be recorded by dispatch, and must be effective when the actual attempt starts. Approved requirements and site coordinates must likewise be known at dispatch. A later office change cannot retrospectively authorise an earlier dispatch.

## Record families

### companies

Canonical CSV header:

```csv
id,name,currency,source_ref
```

### users

Canonical CSV header:

```csv
id,company_id,name,role,source_ref
```

### customers

Canonical CSV header:

```csv
id,company_id,name,source_ref
```

### sites

Canonical CSV header:

```csv
id,customer_id,site_key,name,latitude,longitude,coordinate_uncertainty_m,effective_from,recorded_at,source_ref
```

### assets

Canonical CSV header:

```csv
id,site_id,asset_ref,service_kind,source_ref
```

### routes

Canonical CSV header:

```csv
id,company_id,service_date,version,supersedes_id,name,recorded_at,source_ref
```

### stops

Canonical CSV header:

```csv
id,route_id,customer_id,site_id,asset_id,service_kind,scheduled_from,scheduled_until,planned_at,recorded_at,included,exclusion_reason,source_ref
```

### assignments

Canonical CSV header:

```csv
id,stop_id,route_id,supersedes_id,technician_id,requirement_id,dispatch_at,effective_from,effective_until,recorded_at,reason,source_ref
```

### requirements

Canonical CSV header:

```csv
id,company_id,version,before_photos,after_photos,signature_required,position_required,note_required,geofence_radius_m,max_position_age_seconds,effective_from,effective_until,recorded_at,source_ref
```

### attempts

Canonical CSV header:

```csv
id,stop_id,assignment_id,technician_id,started_at,recorded_at,source_ref
```

### attempt_events

Canonical CSV header:

```csv
id,attempt_id,supersedes_id,status,effective_at,recorded_at,actor_id,notes,source_ref
```

### proofs

Canonical CSV header:

```csv
id,attempt_id,kind,role,acquired_at,captured_at,recorded_at,payload_sha256,latitude,longitude,accuracy_m,provider,signer_name,note,source_ref
```

### proof_receipts

Canonical CSV header:

```csv
id,proof_id,stage,recipient_ref,payload_sha256,available_at,recorded_at,source_ref
```

### exceptions

Canonical CSV header:

```csv
id,attempt_id,code,opened_at,recorded_at,notes,source_ref
```

### dispositions

Canonical CSV header:

```csv
id,exception_id,supersedes_id,decision,followup_attempt_id,decided_at,recorded_at,actor_id,reason,source_ref
```

### reports

Canonical CSV header:

```csv
id,stop_id,supersedes_id,version,attempt_id,generated_at,recorded_at,payload_sha256,source_ref
```

### report_inputs

Canonical CSV header:

```csv
id,report_id,proof_id,payload_sha256,source_ref
```

### report_events

Canonical CSV header:

```csv
id,report_id,event,effective_at,recorded_at,actor_id,recipient_ref,source_ref
```

### billing_decisions

Canonical CSV header:

```csv
id,stop_id,report_id,supersedes_id,decision,effective_at,recorded_at,actor_id,reason,source_ref
```

### invoices

Canonical CSV header:

```csv
id,customer_id,number,currency,issued_at,recorded_at,total,payload_sha256,source_ref
```

### invoice_lines

Canonical CSV header:

```csv
id,invoice_id,stop_id,billing_decision_id,amount,source_ref
```

### accounting_events

Canonical CSV header:

```csv
id,invoice_id,event,amount,currency,effective_at,recorded_at,external_ref,source_ref
```

### effort

Canonical CSV header:

```csv
id,stop_id,method,phase,work_key,active_person_minutes,observed_at,recorded_at,observer,source_ref
```


Each CSV is mapped explicitly from its original columns. IDs and all numeric/date values remain strings. Unmapped fields are null/unobserved; a mapped empty cell is an observed blank. All original UTF-8 text, BOM, CRLF and line locations remain retained. A correction adds a later complete extract and its exact predecessor; original records are never rewritten in place. Original and returned IDs have explicit crosswalks. Parent relationships require their own crosswalks. Exact linked document hash sets are compared separately from record fields.

## Dates, source availability and historical interpretation

Timestamps are real UTC ISO instants. Device acquisition, file capture, record creation, office receipt, report generation, publication and customer access are separate fields. An imported source's capture time is the intake event; available_at declares when the supplied edition was available for the study. Select the actual complete edition available by the as-of cutoff. Importing an old source today does not make it known to a past operational decision.

The engine examines dated state chains, including supersession and ties. Unknown state, invalid chronology, missing predecessor or multiple competing terminal rows stays unresolved. Future records are retained but do not enter an earlier cutoff. Status rows must have actual actors and source locators. A report can retain a historically complete proof set while a later reopening makes current billing readiness stale.

## Supplied proof and office receipt

The supported proof kinds are photo, signature, position and note. Photographs have explicit before/after roles. Requirement editions contain before/after counts, signature/position/note requirements and position freshness/fence values. Use actual approved rules; the application creates no service policy.

Each proof row links exact retained bytes by SHA-256. Identical filenames with different bytes are retained separately. Duplicate photo hashes do not satisfy multiple required images, and photo bytes reused across attempts are surfaced. A signature needs the actual named signer and retained payload, but the software makes no identity-authentication claim. Before images must precede or coincide with attempt start; after images must be acquired at or after the recorded completion. The service operator must choose an appropriate operational interpretation and supply source-correct timestamps.

Office receipt rows identify the stage, recipient, exact proof hash and actual available time. A report is complete only when its explicitly listed inputs contain the required proof and matching bytes available to the office by report generation. A late offline image cannot support an earlier report. Publish a later report edition with an explicit predecessor; retain both actual original reports. A photo, geolocation result or signature does not by itself establish completion.

## Reported location uncertainty

Latitude and longitude use WGS84 decimal degrees. The original position payload retains its provider, acquisition time and reported accuracy in metres. W3C Geolocation defines accuracy as a position radius associated with a 95% confidence level, and its timestamp as acquisition time. The API is source-agnostic and does not guarantee actual device location. The desk also accepts a declared site-coordinate uncertainty radius. It does not infer that this second radius has the same statistical confidence, or combine two confidence levels.

Distance uses a WGS84 Vincenty inverse calculation; failure to converge produces unknown. Let d be reported centre-to-centre distance, a the position accuracy radius, s the declared site uncertainty and g the declared fence radius. Classification is within_reported_radius when d+a+s <= g, outside_reported_radius when d-(a+s) > g, otherwise overlap. Any missing or invalid input gives unknown. This is a conservative geometric comparison of reported regions, not a probability of true presence.

Freshness separately compares actual service completion with acquired_at and the configured maximum age. A future or stale position cannot satisfy the required position record. No location is requested automatically; only the authorised supplied payload is imported. The original provider result and original bytes remain available for review.

## Exceptions, reports and billing

Attempts may be started, completed, blocked, missed, cancelled or reopened. Actual state changes retain superseding row identities. Blocked/missed/cancelled outcomes need an actual exception record; dispositions retain the named owner, decision, reason and any follow-up attempt. A revisit references the same scheduled obligation. Open exceptions and unresolved states remain visible.

Report rows carry exact output hashes and explicit input links. Reports have separate published, sent, customer_accessed and withdrawn observations. Presence of a report does not imply delivery or customer access. Current readiness refers to the selected actual report edition and source-backed owner decision; a later report revision or reopened service exposes the need to review that decision.

Issued invoice headers and exact lines are separate supplied records. Lines bind the stop and its actual ready decision; customer, currency, amount and chronology are reconciled. The application never issues or alters an invoice. Corrections to the study's observation of an invoice retain previous source editions. Accounting payment/refund/sent/void records retain actual external references. Missing payment observations give unavailable net receipts, not a zero-payment conclusion.

## Effort and study interpretation

Retain active person-minutes for dispatch, capture, service documentation, office review, correction, customer handoff and billing reconciliation, or explicitly configured phases. Work keys identify actual disjoint work slices independently of filenames and source locators. Renaming an export cannot create another slice. Each paired stop must have every declared phase in both methods; explicit measured zero is a row with zero minutes, not an absent row.

The report gives paired baseline/current totals and their signed change, plus all observed current work including unmatched stops. Negative change means less observed work; it is not realised payroll savings. Device time and wall-clock waiting must not be entered as active labour. Mixed service kinds, crew sizes, distances and case difficulty should be matched in the agreed study selection, and visible context retained. No uncontrolled pre/post result establishes causality or a confidence score.

## Reviews, recovery and exports

Operations and billing reviewers record acceptance or revision against the full applied-study digest. Changed data, document availability, selected source or plan makes older acceptance historical. Unfinished forms and source candidates are retained separately. Complete session exports include forms, selected study, prior editions and saved branches. Ordinary exports include selected canonical CSVs, field-availability metadata, complete original text and bytes, crosswalks, source comparisons, readable domain report, location worksheet and source code.

The authored eight-stop course is identified as authored everywhere. It has five completed source statements, four device-proof-complete stops, three current complete office reports and three current ready observations. A blocked visit and revisit remain one obligation. The historical early report misses an offline image and its later successor is complete. Three paired stops retain 84 baseline versus 72 current person-minutes, with 96 total observed current minutes once unmatched work is included. The actual supplied invoice fixture is USD100 with a separately recorded USD100 receipt.

## Historical-state and duplicate-observation rules

Report proof is evaluated at report generation, including the proof record creation time and actual office receipt. Attempt state is evaluated independently at each report, ready decision and invoice issuance. A later conflicting event cannot rewrite earlier knowledge. At issuance, recheck the report, service state and every same-stop exception; an old ready decision alone is insufficient. A completed revisit only resolves the earlier exception when its actual disposition actor, chronology and follow-up link are valid.

Report withdrawal invalidates current and subsequent issuance support while preserving the earlier ready observation. A later explicit valid publication event can establish a later publication state; unknown or tied publication chronology remains unresolved. Duplicate accounting external identities remain retained and suppress receipt totals. Future accounting rows remain separate from earlier cutoff counts and amounts. Known duplicate current work slices suppress the complete current total, while valid paired stops remain reportable. The UI exposes historical readiness and current readiness separately.
