# Commission a Treasury source workflow

Commission one explicitly selected public-source workflow against the customer's
source and editorial requirements. The initial result is a reproducible analyst
operation with a complete editable handover. This document defines the work and
acceptance; it does not assert a customer contract or publication approval.

## Agree the source meaning before setup

Record these decisions together:

| Decision | Required record |
| --- | --- |
| Source | Official dataset page, exact supported endpoint, metadata and selected fields |
| Period | Date field, inclusion boundaries, reporting frequency and publication lag |
| Measures | Meaning, native units and scale annotation for each selected measure |
| Row identity | Full source key, dimensions and handling of duplicate or ambiguous rows |
| Missing values | Source nulls and retained reviewed marker, without numeric substitution |
| Comparison | Pinned baseline/candidate, keys/measures and the meaning of unmatched rows |
| Revisions | Which source changes require review and who can promote a baseline |
| Delivery | Complete raw source, review, native dataset, report and editable source package |
| Operator | Named analyst, customer reviewer and the host/workspace/source identities |
| Publication | Customer's own editorial sign-off and any later merchant/release decision |

A daily nominal balance, a monthly period-end series and an inflation-adjusted
series are different source definitions. This product can retain and compare
supported Treasury observations, but it must not claim that one definition
reproduces another. For a new adjustment, frequency conversion or join, agree
the method and source first and use an appropriate separately reviewed native
capability. Do not silently add those transformations to a field label.

The [initial profile](profiles/treasury-debt-source-review.json) selects public
Debt to the Penny daily nominal USD stock observations. Its example windows are
1–8 October and 2–8 October 2026. Actual captured pages and metadata determine the
result; source selection does not promise a fixed current row count.

## Proposed work packages

These work packages are a commissioning template. Insert an agreed price,
capacity and schedule in the customer's separate workshare; the source product
does not invent a contract price or approval.

| Package | Work and output | Completion evidence |
| --- | --- | --- |
| F1 — Source agreement | Select one source definition, date policy, measures, row keys and named reviewer | Source/meaning worksheet with official links and customer-selected interpretation |
| F2 — Installation | Build the original selected source; prepare/install and inspect its real runtime | Original archive, source manifest, selected dependency profile and READY receipt |
| F3 — Capture | Execute the exact source query and preserve every response and receipt | Complete paged capture, counts and original metadata/SHA |
| F4 — Native edition | Review all fields, nulls and units; build and query a READY edition | Immutable edition, full CSV/JSONL/query configuration and actual query result |
| F5 — Comparison and briefing | Compare a selected second edition and produce full analyst reports | Complete row changes, exact dated measures, original source delivery and briefing |
| F6 — Saved refresh | Save/preview/run one period, review changes and explicitly select the next baseline | Frozen plan/run, source URL, actual review and promotion history |
| F7 — Customer receiving | Select/download all files, continue one interrupted download, receive and reopen source | Verified file receipt and independently reopened workspace with original records |
| F8 — Operating handover | Rehearse named browser/client, Stop/reopen and an unresolved-review recovery | Complete guides, actual identities and customer-owned remaining decisions |

Source and field review can reveal a materially different data definition. Return
that finding to F1 with the original source retained; do not declare the pipeline
accepted merely because an HTTP request succeeded.

## Roles and decision boundaries

The implementation operator prepares the runtime, captures source, documents
field meaning and returns complete evidence. The customer reviewer accepts the
intended source definition and comparison, resolves editorial questions and
authorizes baseline promotion in their operating process. The existing software
records the actor, request, input and native result.

A single model owner serves the browser and tools. Installation source is
immutable for an operation, while the saved workspace can advance through its
reviewed actions. Separate source receipts from customer private connection
files, access tokens, signing material and paid-buyer state.

No purchase is needed for the public-source analyst demonstration. A later paid
dataset/customer workflow uses the existing configured original payer and its
actual approval. Proposal acceptance, payment approval and editorial publication
are independent decisions.

## Acceptance walkthrough

Open the actual commissioned READY runtime and original workspace. Display the
source definition and all captured metadata, including excluded fields. Inspect
one full record and its date/unit context. Reopen the saved field review and
query the actual native edition.

Compare the selected two editions, read the whole changed/unmatched-row result
and the exact dated measure cards. Download the complete source delivery and
briefing; independently verify every selected file's length and SHA.

Show the saved refresh plan, its exact next query preview, one retained run and
its review state. If the source metadata changed, demonstrate that the run
requires the original reviewed candidate. Inspect explicit baseline promotion
instead of assuming completion changed it.

Finally close the source owner, inspect the sealed package, receive it into an
independent private directory and reopen it. Confirm the exact source,
editions, comparison, report, refresh plan and retained unfinished-run state.
The recipient can continue authoring with the original source rather than
depending on the implementation machine.

Use the complete [receiving guide](RECEIVING.md) for commands and required files.
The customer's acceptance record should identify what actually completed, what
was intentionally deferred and the remaining named decision owner.

## Source references

The original Treasury dataset and API documentation are the authority for each
source's coverage, metadata and interpretation:
[Debt to the Penny](https://fiscaldata.treasury.gov/datasets/debt-to-the-penny/debt-to-the-penny),
[Fiscal Data API documentation](https://fiscaldata.treasury.gov/api-documentation/).
The product's exact source/refresh/client contracts and original release blobs
are linked from [SOURCE_RELEASES.json](SOURCE_RELEASES.json).
