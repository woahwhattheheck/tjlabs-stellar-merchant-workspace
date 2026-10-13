# Continue the original GSA semantic workspace with graph comparison

This is one source-native customer continuation in the existing DCAT workspace.
It consumes the completed result and **original producer project** from
DCAT-SEMANTIC-VALIDATION-390E-20261013. It invokes the existing comparison model,
unchanged semantic engine, original archive writer and original workspace
receiver. The two original 344-record GSA catalogues, profiles, snapshots,
SHACL attempts and earlier decisions remain unchanged.

Operation identity: **DCAT-SEMANTIC-COMPARISON-390E-20261013**.

Source availability is separate from an execution result. This directory is a
runnable programme; only its actual result.json and original native artifacts
can establish that the customer operation completed. An equipped receiver
should claim this continuation after the existing validation programme completes.
Keep the same operation and one owner; do not start a second validation or
migration programme to feed it.

## Required completed input

Select the complete output directory of the original validation programme:

- result.json has schema commons.dcat-semantic-customer-result.v1 and complete true.
- Both legacy and current cases refer to the original 344-record GSA catalogue
  and a completed native validation run.
- producer/ is the original saved project. The validation programme has closed
  its project owner.
- selection.json retains the actual binding, explicit base IRI and producer
  location.
- All original project files remain intact, including the two saved graph and
  provenance files and every native receipt.

Use the SHA-256 of the **actual complete result.json bytes**. This input hash
binds the entire validation result, its source selections and recorded IDs.
The continuation verifies the selected run/profile hashes and original catalogue
identities again through the existing model.

This programme adds comparison history to that producer project. Keep its
complete original output and this continuation's output directory together
when moving a pending operation. The original validation report itself stays
unchanged; the project gains the explicitly requested following comparisons.

The selected source checkout must include the published comparison successor,
its model/API joins and the unchanged selected semantic runtime. sourceRoot
is the repository root containing stellar/. The selected Python executable
must have the original retained semantic requirements installed; the bridge
verifies the loaded engine and dependency identities at each worker receipt.

Each of the four selected original graph/provenance files must be at most
64 MiB. The domain verifies this before admitting a new native comparison.
The output artifact allowance and interactive reader bounds are separate.

## Configuration and launch

Create a private config file, mode 0600, using actual paths and the actual
validation-result hash:

~~~json
{
  "sourceRoot": "/absolute/merchant-source",
  "semanticOutputDirectory": "/absolute/private/completed-semantic-customer",
  "outputDirectory": "/absolute/private/gsa-comparison-continuation",
  "python": "/absolute/semantic-runtime/bin/python",
  "expectedValidationResultSha256": "ACTUAL_SHA256_OF_COMPLETE_VALIDATION_RESULT",
  "sourceCommit": "ACTUAL_SELECTED_SOURCE_COMMIT",
  "limits": {
    "timeout_seconds": 600,
    "memory_mib": 2048
  }
}
~~~

outputDirectory is separate from the original producer. It contains the new
phase journal, exact downloads and independent receiving project. The program
opens one original project owner at a time. It closes the sender before
receiving, closes and reopens the recipient, and closes all owned resources
before returning.

~~~sh
node operations/dcat-semantic-comparison-customer-390e-20261013/run-gsa-semantic-comparison-customer.mjs \
  --input /absolute/private/comparison-config.json
~~~

The exported function is:

~~~js
await runDcatSemanticComparisonCustomer({
  sourceRoot,
  semanticOutputDirectory,
  outputDirectory,
  python,
  expectedValidationResultSha256,
  sourceCommit,
  limits: { timeout_seconds: 600, memory_mib: 2048 }
});
~~~

sourceCommit is a declared source pin. actual-source.json separately records
the actual loaded application/bridge/manifest file hashes; the native bridge
records the selected original engine and dependency versions. The programme
does not turn a declared commit string into a claim that a Git checkout was
verified.

## Three actual native scenarios

| Scenario | Ordered snapshots | Impact selection | Required observation |
| --- | --- | --- | --- |
| ordered-editions | Original legacy → original current | All resource edges, depth 2, node limit 100,000 | Retain the actual complete graph difference and qualified impact result. |
| same-current-snapshot | Original current → the same original current | All resource edges, depth 2, node limit 100,000 | The unchanged graph engine reports equivalence, zero additions/removals and zero impact. |
| bounded-impact | Original legacy → original current | All resource edges, depth 2, node limit 2 | Graph additions/removals remain identical to the first scenario; the actual impact count is at most two. |

The programme does not assume that the first pair has nonzero graph changes
or that the small cap necessarily causes truncation. It records the actual
engine result. If the engine reports truncated impact, its total remains
unknown and its observed-candidate count remains a lower bound.

Profiles and context treatments can differ between the two original validation
cases. The retained before/after selections include those choices. This is a
comparison of those actual saved graphs; interpretation includes the selected
bindings and base IRIs. It is not a new conversion, a replacement for the
original JSON edition comparison, or a claim that all RDF graph changes came
only from publisher edits.

Each scenario uses the same original model start operation, saves its exact
comparison ID and hash, pages changes/nodes/relationships, and retains all
native artifacts. The programme also checks added/after and removed/before
filters against the actual native counts. Native typed RDF values and original
provenance are retained unchanged.

## Complete rows and original bytes

Rows are saved under rows/ with their actual page offsets, counts and hashes.
For an available section, every unfiltered page is read to the terminal
nextOffset, and the total is checked against the original native summary.

When an original section exceeds the 64 MiB presentation bound, the domain
returns DOWNLOAD_REQUIRED with total null. The programme retains that exact
availability and descriptor and downloads the full original artifact. It
does not label an unavailable page as an empty graph or claim that every row
was presented interactively.

downloads/ contains the complete comparison records, original worker artifacts
and operator review records. Copies stream potentially large files and can
resume only when every existing destination byte is an exact prefix of the
selected original. Complete source and destination lengths and SHA-256 hashes
must match. Partial bytes are preserved when a copy fails.

## Decisions, receiving and cold reopen

Each terminal comparison receives one append-only ACKNOWLEDGE decision with
an operation/scenario-specific note. A failed or interrupted attempt can be
acknowledged while retaining its complete available failure evidence.
Acknowledgement does not change a catalogue release or imply a successful
native comparison.

The programme exports complete-gsa-comparisons.ckanw through the original
archive writer, verifies the complete archive hash, closes the sender and
receives it into outputDirectory/recipient. The entire DCAT state must match
the sender, including the original catalogues, validation evidence, comparison
selections, artifact inventory and review chains.

The recipient reads all three comparison records, original rows and complete
downloads again, then closes and cold-reopens the same project. Its saved
DCAT state must remain identical. It appends a local receiving acknowledgement
to the ordered-editions comparison and creates
received-gsa-comparisons-following.ckanw. The sender is reopened once to verify
that the local receiving decision did not modify it.

No source catalogue, profile, validation run, validation review, migration
review or release is rewritten. Existing comparison history is preserved;
the only new producer records belong to the three named scenarios and their
three acknowledgements.

## Interrupted or lost-reply continuation

Keep the same config, source, project and output directory. Reinvoke the same
programme after the original owner has stopped. Do not create a new directory
as a way to retry an uncertain launch.

Before every mutation, progress.json durably stores its selected request,
request hash, original operation baseline and original item inventory. After
the synchronous original launch, it retains the exact returned operation ID
and comparison/review ID before waiting for completion.

On recovery, the programme uses that exact item ID. If the launch reply was
lost before it could be saved, recovery requires the original operation's
complete result to identify the newly created item. It verifies the operation
kind, baseline, returned ID and full selected source/request binding.

When there is no authoritative original returned ID, it stops with
COMPARISON_CUSTOMER_ADMISSION_UNCERTAIN. The existing intent and original
operation must be reconciled; absence of a reply is not evidence that a
replacement should be launched. A saved baseline without its progress journal
also stops instead of restarting the customer sequence.

An interrupted comparison retained by the original model remains that same
attempt. This programme can collect and transfer its evidence, but complete
remains false. A retry with changed limits or source is a separately selected
original product operation; this continuation does not silently rerun it.

The programme also preserves the receiving decision's exact ID on replay.
It removes only that verified local decision from the sender/recipient
comparison before checking transfer equality. It never removes an unrelated
decision or guesses that a missing receipt means no local mutation occurred.

## Result and practical scope

result.json schema: commons.dcat-semantic-comparison-customer-result.v1.

It includes the original validation-result hash, selected binding/base,
actual application source hashes, all three comparison IDs/hashes/statuses,
native summaries, complete page manifests, original artifact/download
descriptors, acknowledgement records, archive/receiving/cold-reopen outcomes,
cleanup and errors.

complete is true only when all three native comparisons completed and the
full archive, receiving, cold-reopen, local-decision, following-archive and
owner-close journey succeeded. The command returns exit 0 for that complete
outcome and exit 2 for a retained incomplete operation. Input/configuration
errors before the original customer operation fail directly.

This receiving programme exercises the original application API and archive
flow. It does not claim browser execution. The shipped browser, HTTP, CLI and
MCP interfaces expose the same persisted product records and original native
files; their source integration and any separate browser execution retain
their own evidence.
