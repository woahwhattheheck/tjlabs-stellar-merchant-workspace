# Local Placement Study Desk — source and operating contract

This application compares supplied original and returned records, then evaluates the recorded placement workflow. It retains actual agreements, physical inventory, creative editions, display observations, customer reports, issued invoices, payment observations and recurring work. The offline application performs no outreach, booking, signing, payment, remote publishing or signage control.

## Original source and selected editions

The canonical contract has 25 families. The exact field lists are in DOMAIN_HEADERS.json, the 25 templates under templates/, and Core.FIELDS in core.cjs. Imported CSVs may have different headings: map each supplied column explicitly. Unmapped fields are null/unobserved; an empty cell in a mapped column is an observed blank. Every original text, BOM, line ending, source line span, mapping edition and selected source/returned crosswalk remains retained. Corrections create later extracts with complete before/after context. Exact original binary files and record/document link availability are separate retained evidence.

The selected source and returned comparison is independent of the placement assessment. Equal row counts do not establish equal content. Exact parent crosswalks, unmapped columns, duplicate identities, changed fields, missing original attachment bytes and additional returned bytes remain visible. An operations or finance acceptance does not erase those findings.

The study plan chooses its evidence side, a whole scheduled-start window [start,end), a separate as-of instant, actual provider organisation, campaign and format scope, the original complete inventory file and locator, required approval/review roles, complete recurring phases, method identities and currency precision. Missing or unresolved population records suppress the overall denominator. Failed, cancelled, unavailable and no-log schedules remain. A future pending window remains visible; later additions do not retroactively increase the original denominator.

## Identities and time

Record IDs are supplied stable text. Report and creative editions are distinct identities. An exact external asset reference identifies a physical asset; duplicate internal records cannot create extra inventory. A display event, response or accounting transaction has its own actual external identity, independently of CSV filenames and row IDs.

All model timestamps are real UTC ISO instants such as 2026-10-12T09:00:00Z. Venue timezone is retained separately. Effective time says when the source statement applies; recorded time says when that statement was available in its source. Later data cannot silently become knowledge available at an earlier booking, display or report. Capture into this desk is separate from original source availability. A subsequent consolidated extract does not itself prove an earlier unknown value.

Actual observed facts such as completed plays and cleared payments must not be recorded before their observed completion/effective time. Prospective authority and contract intervals can be recorded before their effective start. Signed host agreements additionally carry signed_at: authority is assessed at actual signing, while the resulting agreement has its own subsequent effective term. A later expiry of the signatory's authority is not a retrospective cancellation of an earlier valid agreement.

## Actual authority and agreements

organisations and people retain actual lineage. authorities binds a person, organisation, optional venue, pipe-delimited scope, effective interval, recorded time and retained original payload. Supported scopes include host_placement, creative_approval, booking and finance. A title or name alone does not establish authority.

host_agreements binds actual venue, version, predecessor, signatory, authority, signed time, term, notice days, earliest notice instant and exact signed payload. The desk uses supplied actual terms; it does not infer an annual lock, cancellation date, renewal charge, refund or make-good from marketing text. A later edition remains retained and its predecessor is explicit.

host_events records actual notice and termination separately from scoped creative or placement refusal. General events use notice_requested, notice_acknowledged, continued, terminated or removed. Scoped events use refusal_requested, refused, approved or withdrawn_request. Actual authority, actor and effective/recorded history control their interpretation. A request is not automatically an effective refusal or termination.

## Inventory and reservations

assets belongs to a venue and agreement and declares screen, bench or planter. Merely describing an asset does not make it installed. asset_events retains installed, operational, offline, restored and removed observations with actor, source, actual time and exact payload. Current availability requires a supported agreement and actual operating state. Original installation facts remain visible even when a payment or authority exception exists.

A slot identifies an actual face or screen rotation position, with a stable slot key, capacity, loop and effective interval. Bench placements have one physical advertiser position. Planter face identities cannot be duplicated to create capacity. Screen reservations must fit actual positive capacity and loop duration plus screen_ad_share_limit, the supplied fraction of the loop allocated to advertising. No infinite or fabricated frequency follows from missing duration values.

An actual placement has a campaign, slot, future service interval, booked/recorded times, intended creative, booking actor and authority. Its booking assessment checks the known reservation terms and overlapping conflicts separately from live delivery. Ordinary advance booking does not require a future asset to be operational at the booking instant or the creative's final approval to exist already. The later display assessment requires actual installation, operational state, effective permission and exact approved creative at display time.

Campaign required_venue_count counts distinct venues, not screens, faces or placements. A three-location agreement cannot be satisfied by three assets at two locations. Current bundle support is an at-cutoff view; historical display and report evidence remains separately assessed.

## Matching and creative

Pipe-delimited categories and service areas are exact trimmed sets. Duplicate or empty members are unresolved. HVAC is a category identifier, not a substring match in a company name. A declared venue service-area identifier must be present in the actual advertiser's supplied areas. The model never infers geographic reach from a street address.

category_rules records supplied host/asset/nearby-group exclusions or allowances. A separate active exclusion is not cancelled by an unrelated allowed row. nearby_group is an explicitly surveyed commercial grouping for the nearby-bench rule; the desk invents no distance threshold. Competing advertisers with overlapping category sets cannot be treated as unrelated merely because each has a second trade. Same-advertiser category overlap is distinct from physical slot capacity.

creatives contains an immutable campaign/version/predecessor, positive duration, exact categories, original payload, creation and recorded instants. approvals binds exact creative bytes, venue, required role, actor, authority and actual decision. Required host/advertiser/provider roles are declared in the plan. approved and revoked are dated decisions; an earlier creative or another venue's approval cannot satisfy the current display. A later revocation does not rewrite an earlier authorised play.

## Scheduled and actual display

schedules is the complete operating population. Each row records placement, exact creative, half-open window, expected plays/seconds, allowed modes and planned/recorded times. Counts remain distinct for campaigns, placements, venues, assets and windows.

play_events uses player_ack, play_started, play_completed, failed or cancelled. Its actual asset, creative, external event reference, mode, start/end, recorded time and payload remain literal. Only a supported play_completed observation in an ad-visible mode counts as completed delivery. player_ack remains a technical acknowledgement. host_only and override do not establish a visible ad, even if a player reports completion. Short plays, failed events, cancellation and no log remain exceptions.

Exact repeated observations of one external event count once. Conflicting observations of the same actual event remain unresolved. A play referenced through two schedules cannot count twice. Completed-display count uses unique physical event identity; ad-visible seconds use interval unions on each asset. Asset operating seconds, planned opening time, acknowledgement, ad-visible runtime and completed plays are separate measures.

Actual display eligibility is assessed throughout the supplied play interval at known permission/inventory changes. Later data may change a later current view but does not retrospectively repair an earlier report.

## Estimates, responses and reports

exposure_estimates retains the supplied method, input reference, value, period and calculation/recording time. The report presents estimates individually. It does not automatically add overlapping methods or convert plays, business hours or traffic into unique viewers.

outcome_events retains actual enquiry, booking or other source-defined response events with external identity and attribution method. Duplicate or conflicting identities are handled explicitly. Responses do not imply causal incrementality or cleared money.

reports is an immutable source document edition with generated, actual published and recorded times. A blank publication is unobserved. report_inputs binds each exact typed record and payload hash; records without a payload use the exact canonical row hash. Input recording and exact original byte/link availability are evaluated by generation, not by the study's final cutoff. The first report and a later corrected edition remain separately readable. The course's R1 predates a late display observation; R2 retains its corrected inputs.

## Invoice and installation payment

Invoices are actual issued observations, not draft pricing or automatic bill generation. Each header binds campaign, currency, issue/recorded time, total and exact original bytes. Lines bind actual placements, periods, kind and signed decimal amount. Supported kinds are placement, panel, adjustment and credit. Credits are negative lines; totals reconcile exactly at the plan's supplied currency precision. No exchange rate is invented.

Accounting retains payment_cleared, refund_cleared, reversal, payment_failed, payment_pending and credit_issued. Refund/reversal amounts are positive source observations whose effect is negative cash. Exact repeated transactions count once; contradictory external references suppress the affected cash total. Transaction identity is reconciled globally before per-invoice projection. A transaction reused across two invoices cannot appear as full cash on both. Future observations remain retained outside an earlier cutoff without erasing prior valid cash.

For prepaid_installation=yes, installation_required_line_kinds lists actual required positive invoice categories. The check requires fully cleared linked invoices whose lines cover every category, such as placement and panel. A partial first-month payment cannot also pay an unpaid panel. This observation reports the actual timing and exception; it never initiates payment, fabricates a balance settlement or erases the installation.

## Complete work, review and recovery

effort records actual placement, method, phase, stable disjoint work_key, active person-minutes, complete period, cohort_key, observer and source timing. Current and baseline pairs need the same declared cohort, equal period durations, every required phase, valid rows and unique actual work identities. Explicit zero is observed zero; a missing phase is unknown. Duplicate work suppresses the affected pair and complete all-current total rather than inflating either. Signed change is current minus baseline: negative means less observed work and positive means more. Capacity is not payroll saving.

Operations and finance reviews bind the complete selected study digest, including configuration, originals, maps and document context. Changed inputs require a fresh review; prior decisions and unfinished review drafts remain recoverable. Whole portable sessions retain unfinished forms, source revisions, prior complete branches and pending import candidates. Browser storage uses atomic compare-and-swap and explicit branch adoption. Native commands use the same source model and refuse to overwrite a different existing output.

## Authored receiving course

The supplied example is explicitly authored. Eight windows span two venues and three assets, with two supported completed displays, one acknowledgement, overridden content, an offline no-log window, an overlapping competing trade, failure and cancellation. Two overlapping estimates remain separate. USD 249 in actual authored clearing covers the first-month and panel terms. Two full matched work pairs move from 60 to 52 person-minutes including an increased review phase. These are source-model examples, not customer operating results.
