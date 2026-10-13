# GovHub retained cutover workspace domain

## Carrier and source composition

`govhub.open_workspace(workspace_path, source_root_path=None, assessment_core_path=None, create=False, name="GovHub cutover", mode="SUPPLIED")` returns `GovHubWorkspace`. It composes the unchanged published two-file assessment core in `vendor/assessment-core` (or `GOVHUB_ASSESSMENT_CORE` / the explicit argument). The original `../cutover.py` remains the unchanged six-column CSV and exact-change comparison authority.

The core `authenticate(name,password)`, `user(name)`, `add_user`, `save(kind,id,payload,user)`, `record`, `upload`, `file`, `activity`, `backup`, and `service_lease` APIs remain available. An actor is `{name,role}`, with `operator`, `reviewer`, or `admin`. `govhub_disabled_users(username,disabled)` is shared with the HTTP session carrier. Every domain mutation rechecks the current actor and role. Domain exceptions expose `code`, `message`, `status`, and `fields`; original core exceptions expose `status` and `fields` and use `str(error)` as the message.

The HTTP carrier delegates `GET /api/govhub/snapshot` to `snapshot()` and `POST /api/govhub/<operation>` to `dispatch(operation,payload,user)`. Both `.` and `/` operation separators are accepted. `export_file(export_id,filename)` returns `{path,mime,name,sha256,size}` after exact retained file verification; the carrier authenticates before calling it. `operation_file(operation_id,filename)` has the same shape. The server holds `service_lease()` and starts `worker = workspace.start_worker()`, then calls `workspace.stop_worker()` before closing. Jobs have durable checkpoints; the worker never repeats an uncertain native mutation automatically.

The workspace and input directory are distinct private paths. Browser source uploads use the original retained file API. `sources.retain` streams an explicitly selected regular file under the configured source root into the same original content-addressed blob store; it does not base64 or load a Drupal backup into memory. Source files never become entity attachments without an explicit reference. Scope declarations distinguish the issuer's more than 90 agencies from the service page's more than 80 sites. Every operating cohort is an explicit list of supplied comparison identifiers.

The dated current-estate source is Attachment A §1.2, page 2: **92 sites and Drupal 11**. Its retained original PDF is 331,928 bytes, SHA-256 `779a36c310bddf0b03deb8728e1e96a384ea4d586deccfdc7697695446e44934`, retrieved `2026-10-11T19:27:00.394216Z` from the original GPR/Jaggaer solicitation document link. The notice's agency count and the public service page's site description use distinct units and source dates; neither replaces the explicitly supplied operating cohort.

## Common shapes and concurrency

Core entity records remain `{kind,id,revision,data,archived,origin,author,created_at,updated_at}`. The additive schema registry exposes `sites`, `environments`, and `migration_issues` with `govhub:true`; the existing assessment schemas stay available. All schema forms come from `schemas[kind].fields`.

Domain plans and operations have opaque string revisions. A changing action requires `expected_revision` from the exact displayed record. Immutable source snapshots, audits, reviewer decisions, operation events and handovers never change. A `request_key` is required for starting an operation and creating a handover. Reusing an identical key and payload returns the original result; reusing it for different input is a 409 conflict. A deliberate new key creates a fresh captured result, even when editable records are unchanged.

`snapshot()` retains `{workspace,head,mode,entities,schemas,files,imports,source,...}` and adds:

```json
{
  "govhub": {
    "settings": {"input_mode":"SUPPLIED","scope_file_id":"","scope_reference":""},
    "summary": {"sites":0,"environments":0,"snapshots":0,"plans":0,"open_issues":0,"active_operations":0,"handovers":0},
    "snapshots": [],
    "plans": [],
    "operations": [],
    "exports": [],
    "worker": {"running":false},
    "observed_at":"UTC ISO time"
  }
}
```

Snapshot summaries are `{id,label,kind,sha256,file_id,source_sha256,observed_at,created_at,author,row_count,bound_exports,bound_backups}`. Plan summaries are `{id,revision,name,baseline_id,candidate_id,agency_ids,min_agencies,status,latest_audit_id,latest_audit_status,latest_review,updated_at,author}`. Operation summaries are `{id,revision,plan_id,plan_revision,type,state,environment_id,source_snapshot_id,created_at,updated_at,author,progress,error}`. Export summaries are `{id,name,created_at,author,plan_ids,sha256,files}`; each file is `{name,sha256,size,mime}`.

## Source intake and exact inventory versions

| Operation | Input | Output |
| --- | --- | --- |
| `sources.list` | `{}` | `{root_configured,files:[{path,name,bytes,modified_at}]}`; regular allowed source files under the explicit root |
| `sources.retain` | `{path,source_label,category?}` | Original retained file record, streamed and SHA-256 checked |
| `sources.get` | `{file_id}` | `{file,format,headers?,rows?,preview?,metadata?}`; metadata and a bounded preview of retained bytes |
| `sources.capture` | `{environment_id,authorization_reference?,request_key}` | `{operation}`; read-only native capture with its own retained artifacts and history |
| `scope.save` | `{file_id,reference,expected_head}` | `{settings,head}`; original solicitation/source retained without inventing site inventory |
| `inventories.preview` | `{file_id,label,kind,observed_at,bindings?}` | `{intake}`; immutable original-source intake plan described below |
| `inventories.commit` | `{intake_id,request_key}` | `{snapshot}`; idempotent acceptance of the complete retained preview |
| `inventories.intake` | `{intake_id}` | `{intake}`; reopen the original immutable preview after navigation or restart |
| `inventories.get` | `{snapshot_id}` | `{snapshot}` including all rows and bindings |
| `inventories.compare` | `{before_id,after_id}` | `{before_id,after_id,added,removed,changed,unchanged}` with per-field original values |

`kind` is `BASELINE`, `CANDIDATE`, or `RESTORED`. `observed_at` is the supplied actual source-observation time with an explicit offset, separate from ingestion time. The original CSV fields are `agency_id,canonical_url,export_sha256,backup_sha256,route_count,observed_http_status`. Original `read_manifest` validation is preserved exactly, including unique comparison identifiers and HTTPS canonical URLs.

An optional binding is `{agency_id,capture_operation_id?,export_file_id?,backup_file_id?,files:[{role,file_id,relative_path?}]?}`. Selecting a completed native capture binds its single export and backup plus all original supplementary artifacts together; explicit main file selections remain available. Native relative paths and provider environment/database/backup identifiers are copied from the retained capture. A manually supplied relative path must agree with any original captured path. An export or backup binding must hash to the corresponding exact manifest field. Extra native files keep their actual roles, including `database_dump`, `configuration_file`, and provider captures. Source hashes and full original CSV bytes remain in every snapshot. Actual artifact bytes are verified at intake and native consumption; ordinary field audits compare the retained original manifests without repeatedly hashing the same large backups for each reviewer decision.

An intake is `{id,fingerprint,label,kind,file_id,source_sha256,observed_at,row_count,rows:[original typed rows],bindings:[resolved file references],created_at,author}`. A committed snapshot adds `{id,sha256,intake_id}`. The original `agency_id` column is the native comparison key. The `sites` register separately retains `agency_id` (owning agency) and `comparison_id` (matching this source key), so multiple sites for one agency remain representable.

## Cohort plans, exact findings and reviewer decisions

`plans.create` accepts `{name,baseline_id,candidate_id,agency_ids,min_agencies?,owner?,window_start?,window_end?,rollback_reference?,notes?}`. `agency_ids` must be explicit, unique native comparison IDs. `min_agencies` defaults to their count. `plans.revise` takes the same fields plus `{plan_id,expected_revision,reason}`; a revision preserves every older plan and decision. Dates are actual offset-bearing instants. `plans.get {plan_id,revision?}` returns `{plan,versions,baseline,candidate,approvals,audits,reviews,operations}`. `plan` contains the creation fields and summary fields above.

`audits.run {plan_id,expected_revision}` invokes unchanged `cutover.audit` on the pinned selected source rows and applicable exact field approvals. It returns `{audit}` with `{id,plan_id,plan_revision,sha256,created_at,author,status,summary,scope_issues,inputs,report}`. `summary` is the unchanged native summary with its per-site checks; `report` is the original tool report, not a rewritten score. `scope_issues` separately identifies any declared comparison IDs missing from both sources. The combined status is `PASS` only when the original audit and declared scope both pass. HTTP failure and missing sites stay visible as actual defects.

`approvals.save {plan_id,expected_revision,agency_id,field,before,after,reason}` requires a reviewer and exact currently pinned differing values. `field` is one of `canonical_url`, `export_sha256`, `backup_sha256`, `route_count`. `before` and `after` are the exact native string values shown by the findings. It returns `{approval,plan}`; approval records include immutable `{id,plan_id,plan_revision,agency_id,field,before,after,reason,approved_by,created_at}`. `approvals.revoke {approval_id,reason}` preserves the original and appends a revocation. New plan revisions can reuse an earlier exact field decision only when the same plan's source values and comparison ID still match; every reused decision retains its original plan revision and author.

`reviews.save {plan_id,expected_revision,audit_id,decision,reason}` requires a reviewer; `decision` is `APPROVE` or `RETURN`. Approval applies only to the exact current successful audit and full plan revision. The returned immutable review is `{id,plan_id,plan_revision,audit_id,decision,reason,author,created_at}`. A source or plan correction leaves the earlier decision readable and requires a new current decision for cutover.

## Native operation lifecycle

`operations.create` accepts `{plan_id,expected_revision,type,environment_id,authorization_reference,request_key,agency_ids?,backup_sha256?,target_fingerprint?,native_action?}`. Types are `REHEARSAL`, `CUTOVER`, and `ROLLBACK`. Rehearsal and rollback select the plan's baseline; cutover selects its candidate. A cutover requires the current pinned audit and reviewer approval. `agency_ids` is the explicitly selected nonempty subset of the plan for this native environment; it defaults to the whole cohort. A backup selector identifies one exact retained backup. `target_fingerprint` is the actual Drush target fingerprint returned by capabilities and is checked again by the native adapter. `native_action` is pinned as `drush-restore` or `acquia-restore` and must match the profile. A `sources.capture` operation has type `CAPTURE` and action `drush-capture` or `acquia-capture`; it completes with source artifacts separately from restoration. Environment configuration explicitly identifies the real target and its operating authority.

`operations.get {operation_id}` returns `{operation,events,files}`. The operation preserves the complete selected plan, source snapshot, target record revision, authorization reference and native adapter configuration fingerprint. `progress` is `{completed,total,stage,detail}`. States are `QUEUED`, `RUNNING`, `PAUSED`, `WAITING_NATIVE`, `FAILED`, `CANCELLED`, and `COMPLETE`.

`operations.cancel {operation_id,expected_revision,reason}` records cancellation and cooperatively interrupts owned work. `operations.resume {operation_id,expected_revision,reason,request_key}` resumes retained safe checkpoints. The worker rehashes retained source files before use. A lost or interrupted mutating native call enters `WAITING_NATIVE`; a second restore or cutover is not silently submitted. Its original target/result must be reconciled first.

An accepted Acquia restore keeps its exact original notification URL and automatically continues notification reads at a persisted five-second interval. Restart resumes that notification; it does not submit another restore request. Cancellation stops owned polling while preserving the actual already-submitted provider action and its continuation identity.

`operations.observe {operation_id,expected_revision,capture_file_id,restored_snapshot_id,actual_started_at,actual_finished_at,notes}` attaches an actual provider/native execution capture and a new original-format observed result snapshot. The backend checks source/target/operation identity and runs the unchanged original comparator between the operation's selected source and observed result. It retains the capture and resulting audit. Completion follows the actual successful capture plus the exact source comparison. A failed result remains an actionable operation with full per-site findings and its original artifacts.

`operations.configure {environment_id,expected_revision,config}` is admin-only; `expected_revision` is the displayed environment entity revision. It retains an immutable native profile and revisions that environment's `native_profile` field. Return is `{environment,profile:{revision,config}}`. Profile values use the adapter's current `configuration_schema()` types, including numeric backup ID/timeouts/artifact limits and actual Drush project/public-files paths. Secrets are environment-variable names or native existing session references. `operations.capabilities {environment_id}` returns `{environment,profile,current_config,configured,capabilities,configuration_schema}`. The native adapter source and original provider contracts are documented in `NATIVE_SOURCES.md`. Operation summaries include the actual native action and explicit comparison-ID subset. Plan `execution` reports verified cutover/rollback IDs and remaining IDs using each current revision's latest actual completed operations.

`operations.compare {before_id,after_id}` compares retained operation source/result snapshots and timing with exact revisions. A rollback is its own operation linked to the original plan and baseline; it does not overwrite a cutover's result.

## Complete handover and preserved history

`exports.create {name,plan_ids,include_sources,request_key}` creates an immutable handover at a single captured observation time. `plan_ids` is the explicit selected set; `include_sources` includes each referenced original artifact exactly once. Output includes a readable `handover.html`, full `handover.json`, exact per-plan original baseline/candidate/approval CSVs and audit JSON/HTML, selected operations and native result captures, site/environment registers, full relevant revisions and decisions, file hash manifest, and `handover.zip`.

`exports.get {export_id}` returns `{export}`; `exports.list {}` returns `{exports}`. `exports.compare {before_id,after_id}` compares the immutable selected plans, current site registers, audits, decisions and operation result identities. Every output is registered in the original core's file catalog, so a full private `backup()` includes the handover bytes as well as the retained source/database state. Generated handover outputs are excluded from future source intake listings and subsequent handover source snapshots.

All native data remains in the selected operator environment. Provider writes and DNS changes are represented only by actual configured operations or retained original execution captures. Customer-specific site inventory, account access, hosting configuration, acceptance authority, and recovery objectives are supplied by the operating prime.

`workspace.backup {destination}` requires an admin and creates the original full private-backup format at a new absolute directory. It copies the SQLite snapshot, reconciliation key, every registered source/output blob, and the complete `native-operations/` tree: original command/state/event records, stdout/stderr, native source/staging files and displaced public-file custody. Copies stream in fixed chunks, retain exact original journal bytes and record native relative paths/hashes in `backup.json.native_storage`. The private backup includes staff credentials.

A shared native-storage lease spans each worker claim and execution. Backup takes its exclusive side; actual active or unreconciled running work returns `409 BACKUP_NATIVE_ACTIVE` before creating the destination. The idle worker resumes claiming work after the copy releases its lease. Source or copy failure retains `BACKUP_INCOMPLETE`, which the original core refuses to open. Completed copies reopen at a new directory. `workspace_relocations:[{from,to}]` supplies the original private workspace roots to the native adapter; it resolves only private source/operation paths in memory when consuming existing records. Original command and source capture bytes, native target paths, profile identities, environment IDs, intent hashes and operation IDs remain unchanged. Accepted remote operations continue from their original notification after relocation.

A cohort handover also includes the original CAPTURE operations referenced by its selected snapshot bindings, with their original events, result envelopes and artifacts, as well as that plan's restores and observations. Unrelated capture operations are excluded by their retained file and comparison-ID relationships.
