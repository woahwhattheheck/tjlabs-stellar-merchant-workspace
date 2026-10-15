# Multi-site cutover operations

A complete local operating workspace for the original GovHub cutover audit. Staff retain original inventories and native material, prepare explicit migration cohorts, review exact source changes, operate an actual Drupal or Acquia target, reconcile the restored observation and deliver a complete successor handover.

The application has a Python service, an industrial browser interface, a terminal operator and a durable native worker. Its state lives in a private SQLite database with content-addressed source files. The original six-column comparison engine in `../cutover.py` remains unchanged.

## Open the workspace

Use Python 3.11 or newer on Linux or macOS and a current browser. The operating workspace itself uses the Python standard library. Native Drupal work uses the PHP, Drush, database access and site configuration already installed on the selected host. Acquia work uses the published Cloud API and a token supplied through an environment variable.

Keep these paths separate:

| Path | Purpose |
| --- | --- |
| Application directory | This `workspace` directory, its unchanged vendor core, and the adjacent original `cutover.py` |
| Private workspace directory | Database, retained source versions, native results, staff credentials and handovers |
| Original input directory | Files supplied by the actual source operator, including large native backups |
| Backup or delivery directory | A new destination for an explicitly requested complete transfer |

Run the following from this application directory, substituting the operator's absolute paths. Initialization prompts for a new administrator password.

```bash
python3 cli.py \
  --workspace /srv/govhub/state \
  --source-root /srv/govhub/inputs \
  --username operations-admin \
  init --name "GovHub cutover operations" --mode SUPPLIED

python3 server.py \
  --workspace /srv/govhub/state \
  --source-root /srv/govhub/inputs \
  --port 8792
```

Open the local URL printed by the service. The service binds to `127.0.0.1`. It verifies the request host and origin, uses opaque authenticated sessions, and starts the same durable native worker used by the terminal operator. Starting a second service for the same workspace returns its existing ownership conflict.

Use `PILOT` at initialization for an operator's isolated rehearsal. The selected input mode remains visible in the workspace and retained outputs. It is separate from the source observation, environment identity and actual native execution.

The default assessment core is supplied under `vendor/assessment-core`. To compose a separately installed copy of the exact original core, use `--assessment-core /absolute/core/path` or `GOVHUB_ASSESSMENT_CORE`. The vendor guide records its source identities.

## Staff and operating ownership

Create named staff in **Staff access**.

| Role | Operating responsibility |
| --- | --- |
| Operator | Original source intake, operating registers, cohorts and native work |
| Reviewer | Exact field-change decisions and the cohort review |
| Administrator | Staff access, native target configuration and complete workspace backup, with the operating capabilities above |

Each record and retained decision has its original author. Staff access can be disabled and passwords replaced. The service retains an active administrator. Disabling an account or changing its role invalidates its existing sessions.

Use the **Sites** register for the real site, its owning agency, contacts, environments, dependencies and recovery objectives. The site's `comparison_id` is the exact `agency_id` found in the source CSV. The separate owning-agency fields allow several sites to belong to one agency.

Use **Environments** for each incumbent, candidate, rehearsal or production target. Retain its actual provider resource identifier, purpose, owner and operating authority reference. Use **Migration issues** to assign defects, dependencies and corrective work with their source and resolution.

Every saved register revision retains the previous edition. Open the history beside a record to inspect the original values and source lineage. A concurrent correction requires reopening the current edition before saving another change.

## Retain original source material

In **Original sources**, upload an original file or retain a selected file from the configured input directory. The browser accepts files up to 128 MiB. The input-directory route streams larger native material into the original content-addressed store and computes its SHA-256 without loading an archive into browser memory.

Record the source description and export context. Downloads return the complete retained bytes after hash verification. The source preview helps staff inspect the original CSV or native response; acceptance uses the complete source.

In **Scope & backup**, select the original issuer document and record the operating instruction. The current source pointers are:

* [Georgia Technology Authority event GTA-98000-eRFP-1022027](https://ssl.doas.state.ga.us/gpr/eventDetails?eSourceNumber=GTA-98000-eRFP-1022027&sourceSystemType=jag)
* [Georgia's GovHub service](https://digital.georgia.gov/services/govhub)

The notice's count of agencies and the service page's count of sites describe different units. Prepare each cohort from the actual comparison identifiers supplied for that operating wave.

The complete Attachment A recovered on October 11, 2026 identifies the current estate in section 1.2, page 2: **92 sites, Drupal 11, 800 GB disk, 64 GB RAM, memcache, Cloudflare WAF with 30 days of analytics, and New Relic**. Use this original technical baseline when preparing the prime's operating plan and selecting a representative native rehearsal.

Its section 1.5 schedule, page 3, gives November 9 at 16:00 Eastern for responses; the current GPR/event summary gives 15:00 Eastern that day. Retain both source versions and use the earlier 15:00 time in the working schedule while the sourcing event resolves the discrepancy. The optional conference is October 14 at 11:00 Eastern; written questions are due October 20 at 16:00 Eastern. [Original issuer event and attachment packet](https://ssl.doas.state.ga.us/gpr/eventDetails?eSourceNumber=GTA-98000-eRFP-1022027&sourceSystemType=jag).

### Accept an inventory observation

The original inventory columns are:

```csv
agency_id,canonical_url,export_sha256,backup_sha256,route_count,observed_http_status
```

Each row carries the source comparison ID, HTTPS canonical URL, original export and backup hashes, observed route count, and observed HTTP status. The unchanged original importer validates the source format and unique comparison IDs.

In **Inventory versions**:

1. Choose the retained original CSV, name the observation and select `BASELINE`, `CANDIDATE` or `RESTORED`.
2. Enter the actual source observation time, including its UTC offset. This is distinct from the time the file is retained.
3. Preview the complete original inventory.
4. Bind the matching retained export and backup for each comparison ID. Their hashes must match the original CSV.
5. Add the native database, public files, private files, configuration and execution captures needed for that site. Repeated roles and original relative configuration paths are supported.
6. Accept the complete inventory.

Native captures retain their original artifact metadata. Choosing one of those files preserves its native role and provider identity. An accepted inventory keeps its original CSV, resolved file bindings and immutable snapshot identity. The preview can be reopened before acceptance, and an identical acceptance retry returns its original result.

Use **Compare two observations** to inspect added or removed comparison IDs and each changed original field. The individual inventory view always opens the retained source observation.

## Prepare and review a migration cohort

Create a cohort from one baseline and one candidate snapshot. Enter the explicit comparison IDs, minimum baseline coverage, accountable owner, operating window, rollback instruction and relevant context.

**Run source audit** invokes the unchanged `cutover.audit(before, after, approvals, min_agencies)`. The native audit retains:

* Unpaired source sites.
* Canonical URL, export hash, backup hash and route-count differences.
* The candidate's observed HTTP status.
* Minimum baseline coverage.
* Exact field approvals and any stale or mismatched decisions.

The workspace separately checks that every declared comparison ID occurs in the selected sources. Its combined source status passes when the original audit and the explicit cohort scope both pass.

A reviewer can retain a decision for an exact observed field change. That decision records the original comparison ID, field, before and after values, reason, author and cohort revision. Saving it reruns the source audit. A revocation retains the original decision and records the reason for withdrawing its applicability.

The reviewer then retains **Approve** or **Return** against the current audited cohort revision. Approval requires the current successful audit. Revising the cohort preserves its previous source pair, audits and review, then requires a decision for the new operating revision. Earlier exact field decisions are applicable only when the same source values still match.

The plan history and audit history remain available beside the current operating record.

## Configure the native environment

Open an environment and choose **Native configuration**. The form is generated from the adapter's actual configuration schema, and the capability view shows the native host's observed result.

### Drupal and Drush

Configure the actual environment reference, existing Drush executable, optional PHP executable, Drupal webroot, site URI and optional existing local Drush alias.

The **project restore directory** and **Drupal webroot** are separate. Set the actual public-files path relative to the selected project directory. The operating form retains the observed target fingerprint for restoration.

The adapter captures the installed versions and actual `core:status` result, exports configuration, produces a SQL dump and retains the source material. Restoration uses the installed Drush commands described in `NATIVE_SOURCES.md`, including `sql:query --file`, `config:import --source` and `cache:rebuild`, with the retained source files. The selected native target and source backup remain pinned to the operation.

### Acquia Cloud

Configure the exact compound environment ID, database name, selected backup ID where applicable, and the name of the local access-token environment variable. The token value stays on the native host.

The adapter uses the original Cloud API contracts for native inventory, backup download and restoration. A restore's accepted notification URL and provider identities are retained before subsequent polling. Continuing that checkpoint polls the original notification.

The full native contract, source references, configuration fields, artifact roles and checkpoint shapes are documented in [NATIVE_SOURCES.md](NATIVE_SOURCES.md).

## Capture, rehearse, cut over and restore

**Capture original source** operates directly on the configured native environment and retains the original native artifacts. It has its own operation record and `CAPTURE` purpose.

The restore purposes are:

| Purpose | Selected source |
| --- | --- |
| `REHEARSAL` | The cohort's baseline snapshot |
| `CUTOVER` | The reviewed candidate snapshot |
| `ROLLBACK` | The cohort's original baseline snapshot |

For a restore, choose the actual target, the comparison IDs restored by that operation, the exact retained source backup where several are present, and the operating authority reference. The underlying native action is displayed separately, such as `drush-restore` or `acquia-restore`.

A multi-site cohort can have several environment-specific operations. Each operation retains its own site subset and native backup identity. A cutover requires the current cohort's successful audit and reviewer decision.

The durable worker records its stage, selected files, original command or provider result, and checkpoint. The operation page updates native progress while retaining text being entered in its forms. Download original native artifacts directly from the operation.

Use **Cancel remaining work** to stop the owned work cooperatively and retain its checkpoint. Use **Resume retained work** after correcting the recorded operating condition. The worker distinguishes a safely repeatable checkpoint from a provider mutation whose outcome requires reconciliation.

### Reconcile the actual restored observation

Retain the original completed native execution capture and a new `RESTORED` inventory produced from the actual destination. On the operation, select both and record the exact native start and finish times.

The workspace matches the capture to the operation, source snapshot, cohort revision, environment and native configuration. It then runs the unchanged comparator between the selected source and the actual restored site subset. The completed result retains its comparison, elapsed native time and source identities.

If the destination differs, the operation keeps the original findings. Correct the actual result, retain its new observed inventory and reconcile that observation. Earlier captures and observations remain available in the operating history.

## Deliver a complete handover

In **Handover**, select the complete set of cohorts to transfer and create a named edition. Include original source files when the receiving operator needs the full original material.

Each edition includes:

* Readable `handover.html` and complete `handover.json`.
* Original per-cohort baseline, candidate and exact-approval CSVs.
* Original audit JSON and HTML.
* Relevant site and environment registers, revisions and reviewer decisions.
* Native operation records, execution captures and result identities.
* A complete file hash manifest and portable `handover.zip`.

The complete archive and readable handover appear first. Individual original files and hashes remain available underneath. An identical request retry returns the same edition. Creating another edition captures a new observation time, even when the editable registers are unchanged.

**Compare retained handovers** shows the selected editions' original source and operating changes. Generated delivery files are excluded from later source intake and source inclusion.

### Export from the terminal

The terminal operates on the same private workspace and credentials:

```bash
python3 cli.py \
  --workspace /srv/govhub/state \
  --source-root /srv/govhub/inputs \
  --username operations-admin \
  call exports.list

python3 cli.py \
  --workspace /srv/govhub/state \
  --source-root /srv/govhub/inputs \
  --username operations-admin \
  export RETAINED_EXPORT_ID \
  --destination /srv/govhub/deliveries/selected-edition
```

The destination must be a new absolute directory. Each file is streamed, hashed and flushed to storage. An interrupted or changed-file transfer retains a `TRANSFER_INCOMPLETE` marker.

Use `call OPERATION --input /absolute/request.json` for the same structured operations documented in [DOMAIN.md](DOMAIN.md). The JSON file carries the displayed revision and original request key when the operation requires them.

### Run the native worker from the terminal

Stop the local web service before using the terminal as the worker owner:

```bash
python3 cli.py \
  --workspace /srv/govhub/state \
  --source-root /srv/govhub/inputs \
  --username operations-admin \
  worker --until-idle
```

Omit `--until-idle` to keep the worker available for queued work. A shutdown retains the native operation's current checkpoint. Reopening the web service or terminal worker resumes its retained operating state.

## Back up and reopen the complete workspace

Use **Scope & backup** or:

```bash
python3 cli.py \
  --workspace /srv/govhub/state \
  --source-root /srv/govhub/inputs \
  --username operations-admin \
  backup --destination /srv/govhub/backups/complete-edition
```

The new destination contains the complete database, staff authentication state, original source blobs, revisions and generated handovers. An incomplete backup is marked. Keep the original source-input directory available separately when continuing to import new files.

To reopen a complete backup, stop its current service owner and start `server.py` with the backup directory as `--workspace`. The restored staff accounts, source observations, earlier reviewer decisions and handovers retain their original identities.

## Source layout

| File | Responsibility |
| --- | --- |
| `../cutover.py` | Unchanged original source importer, comparator and audit HTML |
| `govhub.py` | Original-source intake, immutable observations, cohort revisions and reviewer decisions |
| `govhub_operations.py` | Native configuration, durable queue, checkpoints and actual-result reconciliation |
| `govhub_delivery.py` | Complete immutable handovers and edition comparison |
| `govhub_schema.py` | Site, environment and migration-issue registers |
| `native_adapter.py` | Actual Drupal/Drush and Acquia requests, native material and original results |
| `server.py` | Local authenticated service, streaming downloads, staff access and worker lifecycle |
| `cli.py` | Initialization, structured operations, native worker, full export and backup |
| `web/` | Industrial operator interface |
| `vendor/assessment-core/` | Original unchanged assessment storage and schema core |

The private workspace is independent of the application source. Updating the application preserves the original source files, retained records, operating history and completed handovers in that private directory.

## Content and dataset consolidation

Open **Content consolidation** to carry complete source feeds through retained editions, reviewed Drupal field/relationship/media/translation/URL mappings, original Migrate operations and complete receiving. The original worker, source store, operation checkpoints, backup and unchanged site cutover comparator remain the shared application services. The [complete operator and domain guide](content_consolidation/README.md) documents source intake, native mapping, first import, corrected refresh, selected rollback, JSON:API receiving and editable recipient reopen.

A consolidation uses the target’s original Drush profile and the supplied native `govhub_consolidation` module. Its handover includes every selected source/mapping/review/native-plan edition, original Drupal map/messages/receiving artifacts and full selected source/media bytes.


## Lagoon migration operations

The existing native queue also supports Lagoon project capture, selected backup download, active/standby switching, source comparison, original-task continuation and editable receiving. See [LAGOON.md](LAGOON.md) for the complete native workflow and its required existing host profile. Install `lagoon_adapter.py` with the complete workspace. Provider-specific operation purposes and profile fields appear in the original Native tools and Native operations views.

## Visitor journeys and combined receiving

Open **Visitor journeys** to retain original page and search sources, reviewed goals, complete outcome comparisons and corrective history in the same workspace. The operating queue opens the appropriate content, visitor or native operation. **Handover** can include cutover cohorts, content consolidations and visitor editions together; its report, source files, original operation history, edition comparison and editable backup preserve all selected domains.


## Pantheon / Terminus operations

The existing native queue supports Pantheon site and environment inventory, exact backup creation/download, reviewed code promotion, explicit database/files sync, selected component restore and original-workflow continuation. Install `pantheon_adapter.py` beside the other native providers. [PANTHEON.md](PANTHEON.md) covers the complete staff journey, target configuration, source binding, concurrent-backup selection, handover and editable receiving. The same original cohort, authorization, source store and operation lease own execution.

## Publishing playbooks

The existing Content operations navigation also opens Publishing playbooks. Capture the installed Drupal content model, author field instructions and publishing responsibilities, link the complete task population to original Visitor journeys, and retain editor/native receiving for each release or restore. Playbooks join the existing combined handover and editable workspace backup.

See [the complete publishing operating guide](editorial_playbook/README.md) for the native inventory command, original CLI operations, editorial receiving and reopen workflow.


## Static output releases

Open **Static releases** in this same application for complete retained Tome output, full baseline/candidate comparisons, a configured local release target, original worker staging/publication, and retained predecessor rollback. The source/build owner provides the native `tome_native.py` adapter; provider discovery and capture use the original native configuration and operation journal. Existing Drupal, Acquia, Lagoon, Pantheon, content and visitor workflows remain on their original routes.

[STATIC_RELEASES.md](STATIC_RELEASES.md) covers the complete operator, CLI, interrupted-request recovery, output/source export and whole-workspace receiving journey. `static_release_cli.py` uses the same workspace, accounts and native worker. Generated pages are downloaded as retained source files; the private application does not execute them as its own interface. The configured local pointer is distinct from an external CDN deployment and from Drupal database restoration.

## Skpr native operating projects

The complete native Skpr workshare is part of the existing environment profile, operation queue, original source comparison and handover. It uses Skpr CLI v1.9.4 for full environment/release discovery, original Git and .skpr source capture, environment backup creation, complete mounted restic archive receiving, native restore and reviewed deployment. The browser retains original backup/component/snapshot selections and receiving-machine continuation paths on each saved operation.

[SKPR.md](SKPR.md) covers the complete operating and receiving journey. `skpr_receive.py` prepares the existing native account's host, reconstructs the original captured Git project, runs the original queue, and receives the complete built application and private workspace. Handover opens the copied workspace in a separate process from the delivered application and compares the same original saved operations.


## Current Upsun operating and receiving workflow

Use UPSUN.md for the complete current Upsun profile, native inventory,
snapshot creation, branch/activate/synchronize/deploy/merge/restore operations and
original activity continuation. UPSUN_NATIVE.md retains the exact API
and native activity contracts; the complete original specification and selected
official clients are included under native/upsun/.

Native snapshots remain provider restore resources. UPSUN_SOURCE.md
documents the separate complete Git, SQL and mount export, exact receiving and
independent original source reopening. The original credentials remain host
references and each native response/source keeps its complete identity.

UPSUN_RECEIVING.md gives the whole saved native course and independent
application/project handover. Its receiver preserves the original request and
uses a separate continuation for actual activity associations and current host
references. The complete browser course opens the actual installed source at
desktop and narrow widths, operates its important controls, receives complete
downloads and reopens the original operation in a separate authenticated session.

The producing peer must look at the actual rendered screens or returned images,
open/use every final attachment and extracted deliverable, and fix concrete
presentation or workflow problems before calling this outgoing application ready.
Source checks and an unviewed screenshot capture do not replace that delivery.
Use the current equipped owner's same account, workspace, operation and native
lifetime; this feature does not allocate a second receiving host.


## Reviewed staging target expectations

The complete source now includes [TARGET_ENVIRONMENTS.md](TARGET_ENVIRONMENTS.md). From a cohort, open **Review target expectations** to retain and approve the explicit staging URL map. Source and actual restored observations remain unchanged; artifact/route/presence/HTTP requirements stay enforced. The complete native course continues the same authenticated workspace and original native queue.
