# Source intake and canonical CSV guide

## Agree a bounded source population

Choose one real plant area, machine family and incident-open period. Ask the source owner for the consecutive incident inventory, including unresolved cases, no-output attempts, abstentions, failures and explicitly excluded records.

Retain actual machine/type/configuration identity and dated change history. A retrofit, firmware change, control rebuild or updated hydraulic arrangement can make an old symptom/procedure context non-comparable. Record it explicitly; do not create a single undifferentiated group-wide machine population.

## Canonical headers

The files in templates/ are generated directly from core.FIELDS and contain the exact accepted canonical headers. The complete authored examples/input/ files demonstrate quoting and relationships. Prospect discovery and study-planning worksheets may have different columns; map actual source columns explicitly in the operator.

Every canonical field maps to one original CSV header or remains unobserved. A source blank remains an empty string. Identifiers, serials, references, likelihood text and quantities preserve original text rather than being guessed or normalized silently.

## Minimum useful evidence chain

1. machine_types, machines and machine_configs establish physical/type/configuration identity.
2. incidents and incident_events retain opening, actual dated state and explicit population selection.
3. observations and diagnosis_inputs retain the exact symptoms and state actually used, including observed and recorded times.
4. diagnoses and candidates retain the actual supplied result, original file, model/release and ranked/abstained/failed state.
5. causes, cause_aliases and confirmations establish a sourced canonical vocabulary and the later outcome set.
6. knowledge, knowledge_reviews, activities and handovers retain exact content editions, source approval and dated work context.
7. effort and downtime retain separate active-work and machine-stop observations.

Missing families remain explicitly unobserved. A blank template demonstrates that the extraction was supplied with zero rows only if the source owner actually declared that scope; it is not a substitute for a missing source.

## Original output files

Retain the actual original ranking/output, even when its CSV representation is complete. Link it to the exact diagnosis record. Preserve reported labels, scores and score units. Aliases require explicit source evidence and time/type validity.

The input snapshot must name immutable observation editions with the actual used value and state. Do not overwrite an earlier symptom with the later confirmed value. Retain the initial unverified/conflicting state and a new sourced observation if it changed.

## Cause sets and knowledge editions

For a multi-cause outcome, use one confirmation row per cause with the same set ID and matching status/time/reviewer/supersession metadata. A later replacement set explicitly names the earlier set. Retraction is a retained source event, not deletion.

Knowledge content has an exact text digest. Source review binds the complete edition plus linked original hashes, effective and recorded before its use. Use the ordinary digest helper to prepare the binding, then enter the actual source decision and reviewer. An unreviewed LLM suggestion stays unapproved source material.

## Time and source availability

Use real UTC ISO instants. Preserve local timezone/context in source references or notes where needed. Effective, observed, produced, recorded, captured and available times have different meanings.

The desk cannot recover an earlier historical state from a consolidated export that became available later. Select a genuinely earlier edition, or use the later cutoff and label the study design accordingly. A historical source availability correction needs the actual source evidence and retained before-metadata.

## Work and downtime definitions

Active person-minutes are the sum of disjoint observed person-time for the declared work phases. Two workers each working five minutes contribute ten person-minutes. Five elapsed minutes with no active work does not automatically contribute five.

Repeated same observer/time/phase within an incident/method is ambiguous regardless of filename. Retain the true distinct observation intervals or a source-backed aggregate. Include recurring confirmation, review, correction, reconciliation, duplicate entry and handover.

Downtime rows represent the declared machine-stop scope. Retain an event key and machine/incident identity. Blank ended_at means ongoing, right-censored at cutoff. No downtime rows means unobserved, not zero. Multiple overlapping records on one machine are unioned.

## Complete export

Transfer selected CSVs with selected/availability.json, the complete session, exact originals and readable report. An isolated normalized table loses original column availability, source lines, mappings, prior editions and pending work.
