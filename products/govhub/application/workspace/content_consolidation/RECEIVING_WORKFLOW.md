# Content consolidation: native execution and independent receiving

This workflow carries complete original feed editions through GovHub's mapping
review, Drupal Migrate operation, actual target readback, corrected refresh and
full customer handover. The recipient opens an editable copy, compares retained
identities, records a continuation note and exports a successor handover.

The runnable composition is [examples/native_receiving.py](examples/native_receiving.py).
It calls the same application methods as the industrial browser. The original
worker, Drupal plugins, map tables, command journal, account roles and backup
implementation own the operation throughout.

## Prepare a dedicated native site and receive the whole case

[The complete native setup guide](NATIVE_SITE.md) and
[one-command Federal Register runner](examples/run_native_federal_register.py)
join the original installed runtime, private native accounts, schema, application
configuration, three-stage migration case, independent editable receiving and
existing desktop/mobile browser. Use that entrypoint when preparing a dedicated
native target; the configured-workspace commands below remain the same original
receiving methods.

## Start from the configured application

Use the complete current GovHub source, including its unchanged ../cutover.py and
vendor/assessment-core/ pair. Run commands from the workspace/ source directory:

~~~sh
python3 content_consolidation/examples/native_receiving.py --help
~~~

The original private workspace must already have staff accounts, its selected
target environment and configured Drush profile. The actual Drupal site supplies
the content bundles, fields, languages and JSON:API resources declared by the
mapping. Profile and environment selection use the existing application.

Review the native profile and installed capabilities in the original browser.
The same read is available through the maintained CLI:

~~~sh
python3 cli.py --workspace "$GOVHUB_WORKSPACE" \
  --source-root "$GOVHUB_INPUTS" --username "$GOVHUB_USER" \
  call operations.capabilities --input target.json
~~~

The target.json file names the selected original environment_id. That target
record retains its original operating instruction and provider identity.

Original input belongs in a separate absolute source directory, outside the
private workspace and its containing directory. Retain the exact CSV, JSON or
complete JSON:API pages and every selected media file there.

## Define the complete source case

The input schema is govhub.content-consolidation.receiving-case.v1. A stable case
identity and its canonical JSON digest bind the caller receipts. Declare both
the first and corrected stages before the case's first use. A corrected stage
names previous_stage and keeps the original feed identities, migration IDs,
source-ID order and native entity types.

The machine-readable format is described in
[examples/receiving_inputs/README.md](examples/receiving_inputs/README.md).
Each case has:

| Field | Selection |
|---|---|
| schema | govhub.content-consolidation.receiving-case.v1 |
| id | Stable case name containing letters, digits, underscores or hyphens. |
| family | An existing family_id, or the complete original content.families.save input. |
| stages | The ordered original and corrected source/mapping stages. |
| stage.files | Each original file's name alias, relative path or existing file_id, complete bytes and SHA-256. |
| stage.feeds | Original source_id, observed_at, format, record_keys, selected files and source metadata. |
| stage.mapping | The complete original native mapping, selected files and routes. |
| stage.previous_stage | The first mapping stage for a corrected edition. |
| stage.operation_reason | The actual instruction for executing the reviewed stage. |
| stage.content_row_limit | Optional nonnegative native row count per import continuation; zero completes the full pass. |
| stage.content_selection | Optional exact migration/source-ID selection for a native rollback. |

For a new family, supply label, environment_id, owner, notes, comparison_id,
limits and recovery_instruction. Limits use migrations, records, files,
file_bytes and routes. An existing family retains its original target.

The receiving caller resolves edition_name and file_name aliases to original
retained IDs before invoking the existing compiler. Per-migration file_bindings
resolve original ordered source_ids to the selected retained file; file_name
aliases are also resolved there. Stable migration IDs begin with govhub_ and use
at most 56 characters. Original feed bytes and row lineage are unchanged.

### Source and mapping semantics

| Input | Exact retained behavior |
|---|---|
| JSON | Select the original array with records_pointer using RFC 6901 JSON pointer syntax. The default is the root array. |
| JSON:API | Use format JSON_API, retain every original page in order, and supply each page's exact request_url. Native next links must join that sequence. |
| CSV | Supply complete UTF-8 CSV with unique nonempty headers and unchanged field values. |
| Source keys | Keep record_keys in exact order. String keys retain leading zeros; key_encoding decimal explicitly selects original integer keys. |
| Destination | Select the installed native entity plugin, bundle, fields and translation behavior. |
| Relationships | Use native migration_lookup with no_stub true and complete original migration dependencies. For a required reference, follow a missing lookup with skip_on_empty(method row) or the target's required-field validation. |
| Selected files | Retain full original bytes, source URL, license reference, media type and exact relative delivery path. |
| Corrected source | Keep source_id and record_keys; compare the first and corrected original editions before review. |
| Existing target updates | Select REVIEWED_FIELD_UPDATE, exact overwrite_properties, original target backup and explicit approval. |

The compiler returns actionable missing-key, duplicate-key, source-count,
mapping, reference and selected-scope findings. Resolve those in the original
source/mapping review before approval.

## Prepare and review the first edition

Choose a private receipt directory outside the application workspace. Use the
same case file and receipt directory for each continuation. Passwords use the
original CLI prompt, standard input or a named private environment variable;
they never enter the case definition or receipts.

~~~sh
python3 content_consolidation/examples/native_receiving.py \
  --workspace "$GOVHUB_WORKSPACE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_USER" --case "$RECEIVING_CASE" \
  --receipts "$RECEIVING_RECORDS" prepare first
~~~

Preparation retains complete original files and feed editions, opens the native
mapping preview, saves that exact mapping and returns its ID, SHA-256, selected
counts and issues. A repeated preparation reopens its original request records.

Use the original reviewer account to approve the exact mapping inspected in the
browser and returned by preparation:

~~~sh
python3 content_consolidation/examples/native_receiving.py \
  --workspace "$GOVHUB_WORKSPACE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_REVIEWER" --case "$RECEIVING_CASE" \
  --receipts "$RECEIVING_RECORDS" review first \
  --mapping-sha256 "$REVIEWED_MAPPING_SHA256" \
  --reason "Selected sources, fields, relationships and receiving scope reviewed."
~~~

The original service checks the account role, mapping digest, source issues and
current native profile. Its approved plan is retained unchanged.

## Execute through the original worker

~~~sh
python3 content_consolidation/examples/native_receiving.py \
  --workspace "$GOVHUB_WORKSPACE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_USER" --case "$RECEIVING_CASE" \
  --receipts "$RECEIVING_RECORDS" execute first --worker
~~~

The worker option obtains the existing service and native-worker leases for this
local process. When the application server already owns the worker, omit that
option: the request enters the same queue for its current owner.

The caller waits on the original operation and saves its unchanged result when
the operation revision advances. A timeout returns the current native state and
operation ID. Exit code 3 means the original operation has not reached COMPLETE.

The native result carries its installed Drupal/Drush state, core migration
definitions, source/destination map records, row hashes, original messages and
actual JSON:API/media/route responses. Full result files stay in the existing
private store and complete receiving records.

## Capture the target and review a corrected edition

The complete case should declare a corrected stage with previous_stage first.
Its source changes have new exact file identities, while original source_id,
record_keys and native migration identity remain stable. The source comparison
records added, removed, changed and unchanged keys with explicit field-presence
differences.

Capture the actual selected target before a reviewed update:

~~~sh
python3 content_consolidation/examples/native_receiving.py \
  --workspace "$GOVHUB_WORKSPACE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_USER" --case "$RECEIVING_CASE" \
  --receipts "$RECEIVING_RECORDS" capture-backup corrected --worker
~~~

This calls the original sources.capture operation. Keep its native operation ID.
After it completes:

~~~sh
python3 content_consolidation/examples/native_receiving.py \
  --workspace "$GOVHUB_WORKSPACE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_USER" --case "$RECEIVING_CASE" \
  --receipts "$RECEIVING_RECORDS" prepare corrected

python3 content_consolidation/examples/native_receiving.py \
  --workspace "$GOVHUB_WORKSPACE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_REVIEWER" --case "$RECEIVING_CASE" \
  --receipts "$RECEIVING_RECORDS" review corrected \
  --mapping-sha256 "$CORRECTED_MAPPING_SHA256" \
  --backup-operation-id "$ORIGINAL_CAPTURE_ID" \
  --reason "Reviewed the correction, exact update fields and retained target backup."

python3 content_consolidation/examples/native_receiving.py \
  --workspace "$GOVHUB_WORKSPACE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_USER" --case "$RECEIVING_CASE" \
  --receipts "$RECEIVING_RECORDS" execute corrected --worker
~~~

When the native capture supplies several backups, select the exact original
backup-file-id instead of guessing between them. Whole-site recovery and selected
content rollback preserve their distinct original operation types.

## Reopen and continue the same native operation

~~~sh
python3 content_consolidation/examples/native_receiving.py \
  --workspace "$GOVHUB_WORKSPACE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_USER" --case "$RECEIVING_CASE" \
  --receipts "$RECEIVING_RECORDS" inspect "$ORIGINAL_OPERATION_ID"

python3 content_consolidation/examples/native_receiving.py \
  --workspace "$GOVHUB_WORKSPACE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_USER" --case "$RECEIVING_CASE" \
  --receipts "$RECEIVING_RECORDS" resume "$ORIGINAL_OPERATION_ID" \
  --reason "Continue the retained native checkpoint after the recorded correction." \
  --worker
~~~

A declared positive stage.content_row_limit yields through the installed Migrate
runner after that many rows. Resume the returned original operation ID until its
selected migrations and receiving readback finish. The native map retains each
completed row; the caller keeps the original request and checkpoint.

The original worker evaluates the actual checkpoint. Completed command output,
migration IDs, configured target and source hashes remain retained. Active or
complete operations reopen directly. An uncertain native mutation keeps its
original command reconciliation path.

The cancel command calls the original cancellation action with the current
revision and an explicit reason. It preserves native results and map state.

To refresh actual readback of the same reviewed plan:

~~~sh
python3 content_consolidation/examples/native_receiving.py \
  --workspace "$GOVHUB_WORKSPACE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_USER" --case "$RECEIVING_CASE" \
  --receipts "$RECEIVING_RECORDS" execute corrected \
  --kind CONTENT_RECEIVE --worker
~~~

CONTENT_STATUS is available through the same command. Selected native rollback
uses the original map actions and an explicit ordered source-ID selection:

~~~json
[
  {"migration_id": "govhub_selected_documents", "source_ids": ["ORIGINAL_DOCUMENT_KEY"]}
]
~~~

Save the actual selection to a private JSON file, then use the same entry point:

~~~sh
python3 content_consolidation/examples/native_receiving.py \
  --workspace "$GOVHUB_WORKSPACE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_USER" --case "$RECEIVING_CASE" \
  --receipts "$RECEIVING_RECORDS" execute corrected \
  --kind CONTENT_ROLLBACK --selection "$ORIGINAL_ROLLBACK_SELECTION" \
  --reason "Roll back these explicitly selected original migrated records." \
  --worker
~~~

The native runner reverses selected dependencies and retains the actual map
rollback action. The complete selection is bound into this operation's original
request key. Repeating the same selection reopens the same operation. An
explicit request-suffix names a distinct operation, such as an approved
post-rollback import on the same plan or a later rollback of the same selected
keys. Keep that suffix for every retry. The operation's exact reason and source
selection are saved before dispatch.

The existing GovHub whole-site restore retains its normal original operation
and comparison.

## Full customer receiving and successor handover

Use an original admin account for the complete private backup. Finish or
reconcile the selected imports before receiving. The native backup keeps its
existing active-writer check.

~~~sh
python3 content_consolidation/examples/native_receiving.py \
  --workspace "$GOVHUB_WORKSPACE" --source-root "$GOVHUB_INPUTS" \
  --username "$GOVHUB_ADMIN" --case "$RECEIVING_CASE" \
  --receipts "$RECEIVING_RECORDS" receive \
  --destination "$NEW_CUSTOMER_DELIVERY" \
  --name "Accepted content consolidation" \
  --note "The receiving operator opened both editions and retained the next correction instruction."
~~~

This completes nine connected steps:

1. Create a source-inclusive immutable handover for the selected content family.
2. Transfer every original export file through the unchanged CLI file copier.
3. Create the complete workspace backup: SQLite, staff accounts, full original
   file store and native command journals.
4. Open that backup with the same application and authenticate against its
   original account/password store.
5. Compare all edition, mapping, review, plan, operation, checkpoint and selected
   source identities with the original workspace.
6. Verify complete source/media and native artifact bytes through the recipient's
   original file verification.
7. Save the actual continuation note as a new family revision.
8. Export and transfer a successor source-inclusive handover from the recipient.
9. Compare both retained handovers through the original exports.compare action.

| Customer path | Contents |
|---|---|
| handover/ | Original accepted handover, source manifest/archive, content editions, native plans, lineage and actual operation artifacts. |
| editable-workspace/ | Full private backup for continued editing and original checkpoint recovery. |
| recipient-handover/ | Successor handover created by the independently authenticated recipient. |
| receiving-result.json | Complete original identity comparison, both immutable exports and the native handover comparison. |

The editable backup carries operational records and the original authentication
store; deliver it privately to the intended operator under the selected source
terms.

Completed transfers and backups reopen after a lost final caller reply. Export
hashes identify the same original bytes. An incomplete transfer keeps its native
marker; preserve it and use a new destination after correcting the interruption.
The recipient edit is saved before dispatch so a retry reuses its original
request and does not append the note again.

Open the independently received workspace through the existing server:

~~~sh
python3 server.py --workspace "$NEW_CUSTOMER_DELIVERY/editable-workspace" \
  --source-root "$GOVHUB_INPUTS" --port 8792
~~~

The server prints its loopback URL. Open Content consolidation and inspect the
original and corrected sources, approved mapping, native operation and retained
receiving responses. The original target/profile still names the configured
Drupal project.

## Browser receiving in the same native run

The owner-provided [web/receiving_browser.mjs](web/receiving_browser.mjs) opens the
existing local server with its actual account. It visits all original editions,
mappings, plans, native operations and first-to-corrected comparisons at desktop
and mobile widths, then downloads the existing handover.

Supply its JSON input through standard input:

~~~json
{
  "base_url": "http://127.0.0.1:8792/",
  "family_id": "content-original-family-id",
  "credentials_file": "/private/selected-staff.json",
  "output_dir": "/private/browser-receiving",
  "export_id": "export-original-handover-id",
  "visual": true
}
~~~

The staff file has name and password. It stays private. Use the actual equipped
browser through chromium_executable when required. Run against the original
server in the same native environment; preserve the resulting
content-browser-receiving.json with the case.

## Complete Federal Register native workflow

The maintained [sources/federal_register.py](sources/federal_register.py) retains
two independently observed original source captures and builds the complete
initial, enrichment and restored case. Its case preserves all agency/document
responses and selected full official PDFs. The publisher's document type is the
explicit enrichment; original source IDs and complete titles remain intact.

After the selected native target and staff accounts are configured, use
[examples/federal_register_receiving.py](examples/federal_register_receiving.py)
to carry that case through the complete original workflow:

~~~sh
python3 content_consolidation/examples/federal_register_receiving.py \
  --workspace "$GOVHUB_WORKSPACE" --source-root "$GOVHUB_INPUTS" \
  --case "$RECEIVING_CASE" --receipts "$RECEIVING_RECORDS" \
  --destination "$NEW_CUSTOMER_DELIVERY" \
  --accounts "$EXISTING_STAFF_ACCOUNTS" \
  --name "Federal Register content receiving" \
  --review-reason "$ORIGINAL_SOURCE_AND_MAPPING_REVIEW" \
  --native-reason "$ORIGINAL_NATIVE_EXECUTION_INSTRUCTION" \
  --recipient-note "$RECIPIENT_CONTINUATION_NOTE"
~~~

The private accounts file selects the existing operator, reviewer and admin
accounts, each as an object with name and password. These values authenticate
against the original application and are never copied into the receiving result.
Use --existing-worker when the original server already owns that worker.

This command prepares and reviews the initial mapping, completes its original
native import, captures the selected target, reviews and imports document-type
enrichment, applies the case's exact source-ID rollback, and restores the
selected migration-owned records through the original map. Native row-boundary
pauses continue with the same operation IDs. It then releases its owned worker
and completes the full independent backup, edit, source-inclusive successor
handover and original export comparison.

The actual source capture IDs, publication day, mapping identities, full native
operation records and receiving result are retained in
federal-register-receiving.json. An active operation that exceeds the selected
wait time returns its original state and exit code 3; repeat the same command to
continue its saved intent. Other original native errors keep their recorded
state and must be resolved through that operation. The same original browser
receiving command can inspect and download this completed case.

## Host application composition

~~~python
from content_consolidation.examples.native_receiving import ReceivingCase

with ReceivingCase(workspace, signed_in_operator, selected_case, receipt_directory) as case:
    prepared = case.prepare("first")
    # Display the original mapping, source records and issues for review.
    approved = case.review(
        "first", inspected_mapping_sha256, actual_review_reason, signed_in_reviewer
    )
    with case.worker():
        queued = case.operation("first")
        result = case.wait(queued["operation"]["id"], timeout=600)

    # Complete the declared correction through the same original methods.
    received = case.receive(
        customer_directory,
        handover_name,
        recipient_auth=lambda receiver: receiver.authenticate(username, password),
        note=actual_receiving_note,
        assessment_core=original_assessment_core,
    )
~~~

Use existing authenticated accounts and the exact reviewed case. Credentials
remain in memory. The complete actual runtime versions, original operation IDs,
native result and receiving outcome belong in the resulting case delivery.

## Original source contracts

- [Source and review service](service.py)
- [Original source parsing and edition comparison](model.py)
- [Native mapping compiler](compiler.py)
- [Content handover composition](delivery.py)
- [Maintained Drupal adapter](drupal/adapter.py)
- [Original operation and command recovery](../govhub_operations.py)
- [Original backup and export](../govhub_delivery.py)
- [Original CLI authentication and full file transfer](../cli.py)
