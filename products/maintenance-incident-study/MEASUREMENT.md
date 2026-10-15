# Reading the maintenance study

## Define the question before results

A useful first-team study asks whether the actual supplied diagnosis and knowledge workflow is traceable and useful for a declared incident population. Specify the plant area, machine/configuration family, incident window, first-output stage, top K, confirmed-cause rule and full work phases before looking at successful cases.

The desk records observational comparisons. A simple before/after or case replay does not establish causality. Repeated work on the same case may include learning, different staff, equipment changes and information that became available later; retain those design limits.

## Three denominators

The authored example has 10 eligible incidents, seven ranked outputs, two abstentions and one failed output. Eight later outcomes are confirmed; six of those have valid ranked outputs. Five are correct at rank 1 and six within the top three.

| Measure | Rank 1 | Top 3 | Meaning |
|---|---:|---:|---|
| Valid ranked and confirmed subset | 5/6 | 6/6 | Conditional ranking result |
| Every confirmed eligible incident | 5/8 | 6/8 | Coverage retaining abstention/failure/missing or invalid output |
| Every eligible incident | 5/10 | 6/10 | Observed success coverage, with two cause outcomes still unknown |

The last row does not classify unresolved causes as proven failures. Counts and unresolved status remain alongside the rate. No complete-population fraction is displayed when the consecutive inventory or population selection is unresolved. A zero denominator is undefined.

Mean reciprocal match rank uses the same declared cause rule. Any-confirmed uses the first matching rank. All-confirmed uses the rank at which every confirmed cause has appeared; if a required cause is missing, its reciprocal contribution is zero. The original first-correct rank remains separately available.

## Preserve the actual first attempt

The selected snapshot is the first actual supplied output at the declared stage. An abstention or failure remains selected even if a later retry succeeds. Two indistinguishable first timestamps remain ambiguous.

Record exact inputs, output source, configuration, model and knowledge release. Inputs observed or recorded after the cutoff, changed snapshots, invalid aliases or a cause already confirmed when the output appeared make prospective scoring unresolved. The source output remains visible.

## Knowledge and human burden

Retain actual knowledge suggestions, review, approval/rejection, source edition and later activity references. The approval digest binds original content and attachments. A prior edition used after a known superseding edition requires reconciliation; the desk does not choose an equipment procedure.

Count recurring source confirmation, knowledge review, reconciliation, correction, duplicate entry and shift handover. In the authored six-case example, diagnosis time falls but knowledge-review work rises from 30 to 45 person-minutes. Whole observed work changes from 180 to 135, a signed difference of −45 person-minutes. Those values describe the authored cases only.

Missing phases suppress a paired difference. Explicit zero requires an actual observed row. Comparable phases do not by themselves prove a causal trial design.

## Machine downtime is a different measure

Two same-machine stops from 08:00–08:20 and 08:10–08:30 represent 30 union minutes, not 40. A simultaneous 15-minute stop on another machine makes 45 machine-minutes, not 45 minutes of plant wall time.

The report uses supplied valid intervals and exposes invalid/unresolved rows. Open stops are right-censored at the as-of instant. No interval rows produce an undefined observed total. Complete incident inventory does not establish complete downtime logging.

Do not add labour minutes to machine downtime or turn either directly into cash benefit. Actual realised cash requires separate approved evidence of avoided expense or changed financial outcomes, outside this operator's arithmetic.

## What to discuss with the maintenance lead

Review unresolved identities, late symptom records, abstention/failure reasons, known configuration changes, source-approved knowledge currentness, missing confirmation outcomes and extra work. Select the next actual correction or a useful second observation period from those findings. Retain the previous source and plan so improvement can be assessed without rewriting baseline evidence.
