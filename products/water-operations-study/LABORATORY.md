# Water laboratory handover engine

This is the complete laboratory component for the Water Operations Study Desk. It keeps the physical sample, custody chain, laboratory accession, result and report selection as separate records. Its twelve source families bind to the whole application's system, location, approved schedule, people and report records through the historical callbacks in ADAPTER_CONTRACT.md.

The source implements actual collection and sequential custody, accepted or rejected laboratory receipts, exact laboratory sample identity, requested analyte/method/unit/resolution, original result qualifiers, immutable human review and the selected report source. A nondetect retains its original text and limits. A partial corrected laboratory report must explicitly replace, withdraw or carry forward every earlier result.

Historical report selections stay intact after later amendments. Current analysis identifies which earlier selections need reconciliation, including a later rejecting review. Source editions and record availability are explicit, with complete declared populations and original source references. Conflict detection covers both version IDs and business identities.

## Run

In Node, from this folder:

    node -e "const v=require('./verify-lab.cjs').run(); console.log(JSON.stringify(v,null,2))"
    node -e "const c=require('./lab-course.cjs').course(); console.log(JSON.stringify(c.late.result,null,2))"

The maintained source was executed in the available JavaScript runtime using its actual module code and supplied historical context/source callbacks. The verifier records twenty substantive paths covering chronology, rejected samples, duplicate identities, custody gaps, nondetects, reporting resolution, amendments, review changes and report populations.

## Complete authored course

Six samples span three example systems. Four reach accepted laboratory accessions, one damaged container is rejected and followed by a separately collected resample, and one remains with its field collector. Four analytical results are available for reporting. A later corrected report replaces one chemical result and explicitly carries forward its unchanged qualitative result.

At the early cutoff all four report inputs are historically valid. At the later cutoff those same inputs remain historical facts, with one needing amendment reconciliation. The full input, source documents, context objects, both analyses and all twelve filled CSVs are retained. These are authored example records, separate from prospect research.

## Integration

Call analyze(records, options) as described in the adapter contract. Do not substitute latest context for the passed historical instant. Import the canonical templates, keeping original scalar text and source documents. The whole application supplies actual approved schedules and role authority. This component does not choose a treatment setting or infer a compliance rule from a public marketing page.

Use source_metadata for population status, records for individual outcomes, custody_chains for physical handover and report_result_sets for effective laboratory report contents. The summary reports effective and usable result counts separately. Each record result carries the source document, source reference and canonical record hash.

## Independent chronology and mapping review
The successor retains null/missing canonical cells as unknown, distinct from explicitly mapped blank. The accepted laboratory accession must be known when its analysis occurs. A later faithful source export retains each row's original availability. These paths join the complete six-sample course and original amendment/custody cases.
