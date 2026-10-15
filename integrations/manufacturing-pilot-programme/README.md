# Manufacturing pilot programme and retained customer editions

This workbench turns a complete ten-manufacturer research programme into a usable qualification and single-station study desk. It preserves full research, editable setup, observations, buyer briefs and the exact selected five-profile customer deliveries. The source accepts an explicit programme or a saved complete workspace. It contains no private company data.

## Open and use

Run the native builder below with the current private programme or workspace, then open `Manufacturing_Pilot_Desk.html`. The application is self-contained; profile source links open their public sites only when selected.

Search and Group select the current view. Each profile retains its published contact, production facts, current-tool qualifications, editable opening, questions and proposed study. Edit stage, next review, contact issue and notes. Expand Single-station manufacturing study to record all31 fields: actual station and product/process revision; responsible reviewer and source owner; permission/data handling; selected analysis product, version and licence; original footage or observations and timebase; baseline, changeover, manual, machine and waiting definitions; quality outcome; paired comparison and limitations; receiving/review/handover checks; evidence and continuation.

Blank text means unanswered. Selecting a status does not create a measured observation. The manufacturer supplies technical interpretation and retains its production and quality release authority. The workbench does not analyse video, generate a time study, operate machinery or claim cycle-time savings.

Keep two comparisons separate. The same approved footage or observation subset can compare the existing analysis method with the chosen software, recording actual analyst preparation, labelling, review and export effort. A proposed production change requires a separately approved same-job comparison with declared conditions and unchanged quality criteria. Manual and machine work may overlap: retain original interval references and the reviewer's overlap treatment rather than summing every track as elapsed cycle time.

## Save and recover the entire working project

Save in browser first retains a uniquely named complete proposed copy and then preserves the previous saved head. A changed saved head prevents replacement; both the proposal and prior bodies remain downloadable from Recovery copies. Opening another workspace or restoring the saved head retains unfinished current work first, or requires a confirmed complete export when storage is unavailable.

The storage namespace includes the exact operation ID, so different buyer programmes have independent heads. Export full workspace carries all profiles, study fields, unfinished observation fields, search/group and delivery-control drafts, observations, buyer-brief history and every customer edition. Export working CSV/report is internal; it includes the current working notes. Search filtering never truncates the complete workspace.

A repeated observation ID appends a correction. Complete earlier observations remain, while the summary counts only the latest revision of each ID. Retain an actual timestamp with explicit UTC offset, source reference, recorder and description. The supported events cover agreement, prepared sources, station/revision review, timebase review, paired comparison, quality, handover and continuation.

The complete embedded workspace is gzip-compressed with a byte count and SHA256 identity. It is decoded and verified locally. This reduces the standalone HTML while preserving all original editions and output bodies. Normal full-workspace JSON remains readable and portable. Packed and unpacked workspace inputs are both accepted by the builder.

## Prepare the exact five to deliver

Select First five or Additional five, supply a new edition ID and recorder, and choose Prepare complete edition. That edition freezes its five full profiles in exact order, the complete current internal buyer brief, public commercial terms, and the exact JSON, CSV and HTML outputs with hashes. Exporting a retained edition returns its original body even after subsequent working edits.

The customer JSON includes the brief ID/digest, selected profiles and public terms. Private working notes and the full internal buyer brief stay in the workspace. CSV/report also identify the retained edition and brief. Preparation is not sending or payment; actual correspondence is retained in the original buyer case.

## Complete input contract

The programme schema is `tjlabs.prospect-programme.v3`: operation_id, prepared_on, buyer (company and commercial firstDelivery/followOn/replacement), ten complete profiles, and buyer_brief. Exactly five profiles use cohort `free-first-five` and five `paid-follow-on`.

Each profile has id, company, website, location, cohort, contact, observations, currentTools, fit, qualification, opening, proposedPilot and sources. contact has role, published route and HTTPS URL plus the actual email, phone or explicit form kind; a person's name may be null. observations are sourced factual text; currentTools has observed and retain strings; opening has subject/body; proposedPilot has scope, steps and acceptance. Optional `manufacturingStudy` retains and renders the complete source-qualified commissioning proposal. Proposed actions remain distinguishable from actual plant observations.

The buyer brief uses `tjlabs.revenue-buyer-brief.v1`: case_id equal to operation_id, a unique brief_id, parent_brief_id null initially, buyer, request, commercial, selection.free_family_ids and selection.prepared_follow_on_family_ids in exact delivery order, and customer_terms equal to buyer.commercial. Extra complete evidence and ownership fields are preserved.

An actual changed request can be recorded as a successor brief: export the current internal brief, give the successor a new ID and the current parent ID, and retain the same case. Commercial amount changes require changed public offer wording. Earlier briefs and customer editions stay immutable. A changed cohort requires a complete updated research programme and correctly joined brief. Favorable human replies go to the established relationship owner; this desk sends nothing.

## Native build

```sh
node build.mjs complete-programme-or-workspace.json NEW_DIRECTORY
```

The output directory must be new. The original JSON bytes are retained separately, including a BOM when present. The builder validates the complete input, creates the compact standalone desk, full workspace JSON, internal working CSV/report, every retained customer edition, edition index and build manifest. It does not send messages, create accounts or call a vendor API.

The pure `buildProgrammeArtifacts` function and unchanged source core can run in the caller's existing native operation. Main methods are create, reopen, pack, unpack, prepareDelivery, delivery, reviseBrief and observe. The gzip codec is the exact maintained dependency.

## Existing receiving continuation

Use the current complete buyer programme and source in the existing equipped operation. Rebuild the new directory; compare generated members with its manifest and unchanged Original_Input.json. Operate search/group, notes, all31 study fields and a complete observation. Retain an unfinished observation and delivery ID/recorder, export the whole workspace, reopen it and confirm all literal fields. Prepare both five-profile editions, change the current brief through a valid successor, and verify the old customer JSON/CSV/report remain exact.

With two opened windows, preserve a conflicting proposed save without overwriting the saved head; export the retained proposal. Exercise storage-unavailable current export and guarded adoption. Inspect the actual final desk and working/customer reports at desktop and narrow widths, open all outgoing downloads, and retain actual rendered observations in the same operation.

Source/function execution is distinct from native build and rendered inspection. Follow the full owner instruction in AGENTS.md; the absence of an equipped runtime creates no duplicate controller or new approval gate. Continue useful source work while the original receiver operates the complete artifact.

## Provenance

Adapted from the maintained contractor-pilot-programme at317ff30e4a2afb2fd11e55609affb9a4690629e9. Full prior source bodies are retained in the private complete programme bank. The retained delivery/history/save logic is reused; domain fields, observation vocabulary, generic branding and source study have been changed for manufacturing. No original customer records are included in generic source.

## Current source execution

The exact production core, builder and operator handlers passed fifteen focused continuation checks with explicit in-memory DOM/storage/download adapters. The complete callable source and result are retained under verification/ in the private complete programme bank. These checks include separate proposed/conflicting saves, full unfinished delivery-control reopening and immutable earlier customer outputs. They are not a rendered-browser or native-filesystem claim.

The callable browser chapter is `receiveManufacturing({page,url,outputDirectory,expectedOperation})` from `native/browser-receiving.mjs`. Supply the existing caller-owned page and exact final desk URL, a new output directory and the original case ID. It downloads/reopens the complete unfinished working file, opens the visible study fields, compares every retained customer output exactly and captures desktop/narrow desk and report views. The same operator must actually LOOK at those captured images and opened exports. This chapter creates no independent browser host or duplicate receiving operation.

## Companion source-based study processor

Use [STUDY_PROCESSOR.md](STUDY_PROCESSOR.md) for the separate actual-observation workflow. `node native/study.mjs template NEW_INPUT_DIRECTORY` creates an empty configuration and four CSVs. `node native/study.mjs run INPUT_DIRECTORY NEW_OUTPUT_DIRECTORY` receives those exact originals, computes declared cycle spans/track overlap and comparable analyst effort, and returns complete JSON, CSV, report and original files. Keep its study/output references in the prospect's31-field study record. The desk does not import calculated values as claimed customer outcomes automatically. The blank report and four original templates are in study-template/; no performance measurements are prefilled.
