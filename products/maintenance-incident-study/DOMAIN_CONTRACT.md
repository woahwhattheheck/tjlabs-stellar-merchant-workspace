# Maintenance Incident Knowledge Study Desk

This independent, source-preserving study desk compares supplied original and returned records, then examines actual supplied diagnosis outputs against later confirmed causes. Its first-team scope is one declared plant area, machine family and consecutive incident population. Actual supplied model outputs and symptom records retain their original provenance.

The initial operator opens empty. The optional worked course is explicitly authored. Every person, diagnosis, knowledge record and approval in that course is fictional.

## Product context and source boundary

Retain the actual exported output, model version, knowledge release, input snapshot and source reference. A supplied likelihood is copied as supplied; this desk does not generate a probability or substitute a diagnosis. Actual CMMS, maintenance and approved procedure records remain authoritative.

## Canonical input contract

There are 18 independently selected table families. Each family has an original and a returned CSV edition, arbitrary original header mapping, explicit identity crosswalks and exact retained original UTF-8 text. The generated templates are the canonical import headers; supplementary prospect planning worksheets are not assumed to be importer-compatible.

- machine_types: machine-type identity and source.
- machines: physical machine identity, type, plant/site/line and asset reference.
- machine_configs: immutable dated configuration edition for a machine and type.
- incidents: immutable opening record, machine/configuration, initial status/assignee and explicit inclusion or sourced exclusion.
- incident_events: later dated full status/assignee states, including reassignment, resolution, reopening and cancellation.
- observations: immutable symptom observations, observer/source role, observed and recorded times, confirmed/conflicting/unverified state and explicit superseded observation.
- diagnoses: actual supplied output snapshot, incident/configuration, stage, request/production/recording times, input cutoff, model/release and ranked/abstained/failed status.
- diagnosis_inputs: exact observation editions and the value/state actually used by one output.
- causes: stable type-scoped canonical vocabulary.
- cause_aliases: explicit source-code-to-canonical mappings, type scope, validity period and recording time.
- candidates: supplied integer ranks, canonical cause or explicit alias, original label, reported score and score unit.
- confirmations: later cause-set members, status, confirmation/recording times, named confirmer, basis and explicit prior-set supersession.
- knowledge: immutable type/configuration-scoped content edition, exact text SHA-256, optional cause, effective/recorded times and explicit predecessor.
- knowledge_reviews: named, dated approval/rejection of an exact edition digest, including its linked original document hashes.
- activities: actual recorded attempt/step/outcome referencing the exact knowledge edition.
- handovers: actual sender/receiver, referenced prior activity/knowledge, effective/recorded and acknowledgement times, and context.
- effort: disjoint active person-minutes by incident, method and phase, with observer and source.
- downtime: supplied machine intervals, incident/event identity, start/end/recording time and declared operational scope.

Identifiers and quantities remain source text. Blank mapped fields and unmapped fields are distinct: an unmapped canonical field is null/unobserved. Selected CSV exports therefore travel with selected/availability.json, which retains original column availability and file/line provenance. IDs must be exact; no fuzzy identity matching or guessed alias mapping occurs.

## Originals, attachments and revisions

Original text, byte SHA, filename and capture time are retained. Binary originals carry exact bytes, media type, byte SHA, capture time and separately recorded source-availability time. Multiple same-named files with different bytes remain distinct. Typed links bind the specific kind, side, record and document; link availability is separate from file capture.

Original/returned comparison checks every selected mapped field, explicit parent crosswalk, duplicate/orphan identity and linked original document hash set. An unlinked document is not silently discarded. Absence of linked bytes on both sides is explicitly unobserved, not a proven document match.

An ordinary row correction creates a derived extract edition and retains the preceding original. Its actual correction time is its availability time. It does not rewrite a historical export. Selecting an old edition is explicit. Availability metadata corrections require the current study ID, document byte hash, full prior metadata hash and a recorded reason.

## Historical observation

The study uses one explicit UTC as-of instant and an incident-open interval [start,end). A selected extract must itself be available by the cutoff. A later consolidated export cannot silently reconstruct an earlier state. Within an available edition, event effective time and recording time must both be known by the queried instant. A late-recorded offline event may describe an earlier effective action; it becomes visible only after its recording time.

Machine configuration is the edition effective and known when an incident opened. A diagnosis naming a different configuration is unresolved. Explicit pre/post-retrofit populations must be separated or qualified; the study does not equate symptoms across changed equipment configurations.

The complete consecutive incident inventory is a retained original with a locator and a completeness declaration. Explicit exclusions retain their reason. Missing identity, chronology or inclusion remains unresolved and suppresses population fractions; it does not become a convenient excluded case.

## Actual-output evaluation

Declare the evaluation stage, top K and cause-match rule before inspecting results. The selected snapshot is the first supplied output at that stage. Abstained and failed outputs remain selected; a later improved ranking cannot replace them. Simultaneous first outputs remain ambiguous rather than being ordered by convenient IDs.

An output is traceable only with its actual linked original, source/model/release fields, valid chronology, exact input observations and supplied ranking. Observations must have been observed and recorded by the input cutoff. Later evidence, a changed value/state, an explicitly superseded input or a diagnosis produced after the cause was already confirmed is visible and not scored as a clean prospective output.

Candidate ranks must be unique positive consecutive integers; partial lists and tied ranks remain unresolved. Cause aliases must be explicit, type-scoped and effective/recorded by output production. Original labels and likelihood values remain available even when canonical mapping is unresolved.

Confirmed causes are explicit later sets. Multi-cause sets are supported. One declared rule chooses any-confirmed or all-confirmed top-K matching. Retractions and replacement sets retain earlier sets. Multiple unsuperseded sets, conflicting set metadata or missing confirmation evidence remain unresolved.

Report distinct denominators:

1. Valid ranked outputs with a confirmed cause: conditional ranking rate and mean reciprocal match rank. With any-confirmed matching, use the first matching rank; with all-confirmed matching, use the last required matching rank, and no match if any required cause is missing. Top-one uses the same declared rule.
2. All confirmed eligible incidents: successful ranking coverage, including abstentions, failures and invalid/missing outputs.
3. All eligible incidents: observed successes divided by the full population, with unresolved outcomes explicitly unknown.

The third measure is observed coverage, not a claim that unknown causes were proven failures. Top-1 and top-K counts remain separate. A denominator of zero yields undefined, never zero percent.

## Knowledge and handover evidence

Knowledge review binds the complete canonical edition plus linked original document hashes. Changed text or changed attached content cannot reuse an earlier approval. The exact edition and linked original hashes must also have been available at the actual source review time. A later known superseding edition is shown when an activity still refers to its predecessor; the study requests reconciliation rather than deciding which procedure a plant should execute.

Actual activities and handovers retain the exact knowledge/step reference and dated context. Acknowledgement is a separate observed event. The operator produces no maintenance procedure, safety release, equipment control or permission to perform an intervention.

## Effort and downtime

Active work uses actual person-minutes, not elapsed downtime. Declare all recurring phases: diagnosis, confirmation, knowledge review, reconciliation, handover and any additional duplicate-entry, correction or founder-feedback burden. Explicit zero is a sourced observation; a missing phase is unobserved. Different named slices must describe disjoint work; changing a filename is not evidence of disjointness. Repeated observer/observation-time/phase within an incident and method remains ambiguous regardless of source locator. Preserve actual distinct work intervals or a sourced aggregation instead of splitting the same observation into renamed files.

Paired differences require both methods, every required phase and identical observed phase coverage. Signed current-minus-existing values preserve increased work. This is a descriptive matched-work comparison; no causal claim, annual extrapolation, labour elimination or cash-saving inference follows automatically.

Downtime is interval-unioned within each machine so overlapping incident rows do not double count the same machine stop. Simultaneous stops on different machines produce machine-minutes, not plant wall time. Open intervals are right-censored at the study cutoff. The aggregate covers supplied valid intervals only. Missing downtime rows yield an undefined observed total; the incident inventory alone does not prove complete downtime capture. Active work and downtime are reported separately and never added into an economic benefit.

## Review and portable work

Study review binds the complete current data, configuration, originals and document links. A changed plan, source or mapping expires current acceptance while retaining prior reviews. Required roles are configured locally; historical review roles remain retained.

A complete portable session includes current study, unfinished ordinary forms, selected records, prior study versions, recovery branches and pending import candidates. The 40 MiB expanded-session limit applies to ordinary retained state. Emergency forms that exceed the bound remain exportable and visibly unsaved; replacement actions retain the exact form before clearing it. No code path may declare a rejected draft saved.

## Authored course and execution scope

The course contains 10 eligible incidents: seven ranked, two abstained and one failed, with eight later confirmed causes. Five are correct at rank 1 and six within the top three. Conditional top-three rate is 6/6; confirmed-cohort coverage is 6/8; observed whole-cohort successes are 6/10 with two unresolved causes. Six fully paired work observations show 180 existing versus 135 study person-minutes, including knowledge-review effort increasing from 30 to 45. Same-machine overlapping intervals union to 30 minutes plus 15 on another machine: 45 machine-minutes.

The maintained source course also exercises exact original/returned corrections, changed linked bytes, alias binding, late symptom rejection, already-known causes, unresolved population, knowledge approval expiry, historical source cutoff, missing phases, review expiry and complete session reopen. It is an authored source-native run, not a live plant result.
