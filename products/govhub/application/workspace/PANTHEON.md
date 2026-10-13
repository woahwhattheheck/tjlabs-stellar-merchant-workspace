# Pantheon native operations

GovHub can operate an existing Pantheon site through the host's installed Terminus CLI. The complete journey uses the original operating environment, native profile, source intake, cohort comparison, review, operation queue, retained files and handover. Pantheon appears alongside Drupal/Drush, Acquia and Lagoon in the same application.

Receive the complete GovHub application, including `pantheon_adapter.py`, `pantheon_receive.py` and all six files in `pantheon_bridge/`. The provider uses Python's standard library and the existing `native_adapter.Session`; the native bridge runs inside the original Terminus 4.3.3 release. Its three PHP classes retain native requests and returned workflow UUIDs before process output is delivered. Read [PANTHEON_RECEIVING.md](PANTHEON_RECEIVING.md) for the complete preparation, original-account discovery, queue, browser and editable handover commands, and [PHP_BRIDGE.md](pantheon_bridge/PHP_BRIDGE.md) for the request and receipt contract.

Run the receiver's `prepare` command on the actual selected host. It checks the PHP runtime, exact original PHAR, installed plugin and every installed PHP source hash, then records the three local runtime paths. The returned Terminus path selects an immutable launcher with native plugin/dependency directories for this received source. Updated or moved applications can prepare and resume while earlier installations retain their own source. It can finish before a provider operation is selected. The original Terminus session supplies its account context. The GovHub profile retains the reviewed native target and operating settings.

## 1. Select the actual site and environment

Create or open the operating environment record and choose **Pantheon** as its provider. Set **Provider resource ID** to the exact site UUID followed by the native environment, such as `SITE_UUID.test`. Retain its actual canonical URL, purpose and operating authorization. Native site IDs, GovHub environment record IDs and site comparison IDs are separate identities.

Open **Native tools** and select **Pantheon / Terminus**.

| Profile field | Operating value |
| --- | --- |
| Exact site UUID and environment | The same native resource as the operating environment |
| Prepared Terminus launcher or existing PHAR | Absolute `profile_runtime.terminus_path` from the receiver, or the existing CLI |
| Existing PHP executable | Paired `profile_runtime.php_path` for a prepared launcher or PHAR |
| Native CLI working directory | Existing directory on that same authenticated host |
| Reviewed content source environment | Same-site source for database/files sync |
| Reviewed promotion source code-log SHA-256 | The value from the native capability observation for code promotion |
| Selected original backup filenames | Separate exact code, database and files filenames |
| Deployment note | The operator's actual release note |
| Drupal updates / clear cache | Explicit Yes/No choices for deploy and database sync |
| WordPress replacement text | Optional paired search/replacement text, including bare hostnames or URLs, for database sync |
| Backup retention | Native days to retain backups created by this journey; default 30 |
| Timeout and artifact limit | Limits suitable for the actual command and original source archives |

**Observed native capability** verifies the original site UUID and permitted environment population. It shows the selected environment, native backup filenames and the code-log SHA-256 for the promotion source. A Test target reads Dev as its promotion source; a Live target reads Test. The fingerprint binds the exact site and target environment.

The configured native paths identify the original executing host. Receiving relocates private source and operation custody paths through the existing workspace backup metadata. A saved operation can also select its receiving machine's three actual executable/working-directory paths through **Operating continuation → Receiving machine**. That explicit runtime binding stays separate from the pinned native profile and reviewed business intent. The same site, environment, original operation, native workflow UUID and prior command records remain attached.

## 2. Capture inventory and retain exact backups

Choose **Capture original source**. The completed operation retains the actual site and environment metadata, selected environment's complete finished backup lists, native code logs and original Terminus command/output files. The source manifest distinguishes code, database and files backups.

Terminus returns backup size as rounded MB display text. Each downloaded archive gets its own exact byte count and SHA-256 from the retained bytes. Its native site, environment, filename and component identity stay attached.

There are two separate backup purposes:

- **Download selected native backup** fetches each filename already selected in the native profile. At least one component must be selected. Each command uses the exact filename and writes its bytes directly into the operation's private directory.
- **Create and retain a native backup** creates a complete environment backup, identifies its new code/database/files members, and downloads those exact original archives. It retains the before and after native backup populations and the original creation command.

Use the completed backup operation when binding a source inventory. The inventory's export and backup hashes must match their retained files. The automatic operation binding carries additional native files and metadata with it; a component can also be bound explicitly as additional native material.

## 3. Review a staging, release or rollback operation

Prepare the original six-column source inventories and cohort plan in GovHub. Choose the comparison IDs belonging to this native target. The operation retains the selected source snapshot, cohort revision, target environment, native profile revision and operating authorization.

The existing purposes remain:

| Purpose | Original source |
| --- | --- |
| Rehearsal | Baseline, using a designated rehearsal environment |
| Cutover | Candidate with its completed audit and approval for that exact revision |
| Rollback | Original baseline |

For a Pantheon target, **Native action** is a selector with the following complete actions:

### Promote reviewed code

Select **Promote reviewed code to Test or Live**. A Test operation promotes Dev code. A Live operation promotes Test code. Copy the observed promotion source code-log SHA-256 into the native profile before preparing the operation.

The adapter compares the current source with that reviewed value before preparing the target backup and immediately before dispatch. It retains the actual target code log after the native deployment. The deployment note, optional Drupal update and optional cache-clear choices are part of the pinned native profile.

### Sync content, database or files

Select the exact source environment in the native profile. **Sync reviewed database and files** operates files and database as two separately recorded native commands. The database-only and files-only actions operate their named component.

The source and destination are explicit, distinct environments on the same site. Each must be initialized. The adapter uses Terminus's original `env:clone-content` semantics, including native WordPress search/replace behavior and the optional paired replacement text.

### Restore exact backup components

Select the original native backup filenames in the profile and bind their downloaded bytes into the cohort source snapshot. Restore validates the native site, environment, component and filename of every selected bound archive and verifies its retained bytes.

Pantheon restores a backup to its original environment. To transfer content between environments, select the explicit content-sync action. Code restoration in Dev or Multidev requires the native environment's Git mode.

Each selected restore component runs in a separate retained step. The command passes its exact `--file` value. Terminus rejects a non-default element option together with a selected file, so GovHub lets the filename determine the original component.

Every target-changing journey first creates and retains its own complete pre-change backup. The pre-change backup artifacts remain available for source binding and a reviewed rollback.

## 4. Continue the original provider work

Every native command has a durable argv, working directory, stdout, stderr and exit record under the original operation. New target-changing steps call the received `govhub:bridge` command through that same Session. Inventory and original archive reads continue to use the released native commands.

### Immediate native workflow retention

Before a new native mutation, the provider verifies the installed bridge against the three PHP source files in this exact application. It writes a private request with mode0600 that binds the original operation, step, immutable intent, site UUID, native environment and selected action. That request and its byte hash stay in the original operation directory.

The bridge persists the original dispatch before sending the native workflow request. It retains the complete native HTTP response and returned workflow UUID in its original receipt directory before returning process output. The provider consumes that same final receipt, immediate workflow sidecar or complete settled command result after an interrupted receiving write. Every retained native event and its bytes remain available with the operation.

An accepted workflow is followed by a separate read-only `workflow-inspect` request for the same UUID. The provider checks its original site, environment and workflow type. A running workflow keeps the existing operation pollable; a succeeded workflow finishes its original step; a failed workflow retains its actual failed result. A completed no-change code deployment retains the native observation without manufacturing a workflow.

If the command response is lost after native dispatch, the bridge's existing local recovery runs before login or another provider request. The provider retains the original command record and uses a distinct read command to obtain that same receipt. A dispatched step with no received native UUID stays attached to its original request and sidecars for the original workflow association.

A native validation failure before journal creation retains its completed stdout, command and request association. After correcting the receiving source or local request conditions, the same operation's manual continuation can create a distinct attempt. The original return remains in its command history. Receipt acquisition and actual dispatch recovery continue through their retained journal or workflow.

### Original operating continuation

Open **Operating continuation** when a provider command requires its original outcome. Select **Original provider workflow UUID** for the displayed pending command and retain the operating reason. GovHub checks that:

- The UUID is the actual native workflow selected by the operator.
- It was absent from the retained pre-command workflow population.
- Its current native status identifies the same site, target environment and expected native step type.
- It does not replace a workflow already verified and bound to that step.

The first valid native observation retains the association. A wrong-target candidate can be corrected on the same operation. Operations created before the bridge integration preserve their original native command, argv hash, prior workflow list and explicit UUID continuation; receiving the new source does not replace that history.

A complete rejected bridge receipt that confirms no native dispatch can be resumed after its actual configuration or input correction. That explicit continuation retains the previous rejected request and receipt and creates a separate next attempt for the same original step. A dispatched write remains associated with its original outcome.

A failed or interrupted archive read keeps its original command, output and partial file. A later continuation retries that same selected backup in a separate retained download attempt. A failed read-only bridge or inventory command can likewise be observed again after the native installation or account context is corrected. Completed successful observations keep their original output.

A native command can finish before the local receiving write. Recovery reads the retained completion, verifies its original artifacts, and finishes the same operation. It also recovers a completed final manifest before issuing fresh provider reads.

### Receive an original operation on another machine

First run `pantheon_receive.py prepare` with the receiving host's actual PHP, Terminus and CLI working directory. In the existing continuation form, enable **Use this receiving machine** and enter its prepared paths. The underlying `operations.resume` payload accepts:

```json
{
  "operation_id": "the-existing-operation-id",
  "expected_revision": 7,
  "request_key": "the-existing-continuation-request-key",
  "reason": "Continue the original workflow from the received workspace",
  "runtime_bindings": {
    "terminus_path": "/actual/receiving/installations/received-source-id/terminus.php",
    "php_path": "/actual/receiving/php",
    "site_root": "/actual/receiving/native-working-directory"
  }
}
```

Use the operation's actual current revision and original continuation identity; add its original workflow or backup-selection fields when requested by that operation. The example paths and identifiers are explanatory values. The receiver's `call operations.resume --bind-runtime` fills the binding from its successful preparation and preserves both original and applied request payloads. `operations.capabilities` accepts the same binding for a receiving-host observation.

Only `terminus_path`, `php_path` and `site_root` belong in a runtime binding. An empty PHP value chooses a directly executable Terminus installation. The provider validates those actual local paths before Session begins, then records the receiving selection in the original native checkpoint. Site UUID, environment, source selection, restore filenames, code expectations, action and options remain pinned in the original business intent.

Historical raw argv and outputs remain intact. A completed original command is reused through its original record. A confirmed unstarted command or a failed settled read may select a distinct receiving-host command attempt with unchanged native arguments. An unresolved write continues through its original receipt or workflow. The original request/receipt private paths use the workspace's existing relocation map.

### Concurrent backup completion

A completed backup whose catalog is still appearing is followed through the original catalog observation without repeating creation. If more than one new backup per component appears while a backup command runs, the operation retains all candidates. **Operating continuation** then shows the original code, database and files filename choices. Select the exact three-member set belonging to that backup and resume. The selection is retained with the operating reason; the completed backup workflow is reused.

The workflow association, receiving runtime and backup selection fields all belong to the same original operation. Its reviewed source snapshot and pinned native profile remain available throughout continuation.

## 5. Observe, deliver and reopen

Native backup creation/download completes as a source operation. A target-changing cohort operation advances to **Attach the actual restored observation** after its native steps and readback complete.

Retain the original native execution capture and the actual RESTORED six-column inventory, then select them in that operation. GovHub compares the observed result to the pinned cohort source and retains the final comparison. The source, result and reviewer history stay attached to the operation.

Open **Complete handover**, select the cohort and any accompanying content consolidations or visitor editions, and include original source files. The existing handover carries bound capture/backup operations, exact native artifacts, operating observations, source inventories and reviews.

Use **Back up the complete workspace** to preserve the editable application state after its writer is quiescent. Reopen that backup through the existing GovHub receiving flow. It retains the same operation IDs, commands, workflow associations, source bytes and completed handovers. The complete source distribution includes the Pantheon module and this guide.

The existing command-line interface uses the same actions:

```bash
python3 cli.py \
  --workspace /absolute/private/workspace \
  --source-root /absolute/original-sources \
  --username OPERATOR \
  --password-env GOVHUB_PASSWORD \
  call operations.capabilities --input environment-request.json

python3 cli.py \
  --workspace /absolute/private/workspace \
  --source-root /absolute/original-sources \
  --username OPERATOR \
  --password-env GOVHUB_PASSWORD \
  worker --until-idle
```

Use the existing environment record ID for capability calls. The native profile contains its separate provider resource ID. Create/continue operations with their original request keys and expected revisions.

## Native source contract

The installed native contract is Pantheon's original Terminus **4.3.3**, source commit `4cd1810ad892157131cec5919baf3036ab457d57`. The unchanged PHAR is 12,336,985 bytes with SHA-256 `e7ca9bcad3acbb1cfc0cec32550eeb2351e578dc6d5f79cd3a5303201893bade`. The bridge checks the original Terminus classes at that release and retains their source guard with its actual installed PHP source identities. The complete receiver checks the release before native preparation.

The source package includes the original Terminus license, all three bridge PHP classes, its Composer package and license, the provider, receiver, existing application and receiving guides. The original complete-package builder locks each source byte and verifies this required population.

- [Complete Terminus command directory](https://docs.pantheon.io/terminus/commands)
- [Backup creation](https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Commands/Backup/CreateCommand.php)
- [Selected backup download](https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Commands/Backup/GetCommand.php)
- [Selected component restore](https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Commands/Backup/RestoreCommand.php)
- [Native backup identity and rounded display size](https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Models/Backup.php)
- [Code deployment](https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Commands/Env/DeployCommand.php)
- [Separate database/files workflows](https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Commands/Env/CloneContentCommand.php)
- [Original workflow UUID selection](https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Commands/Workflow/Info/InfoBaseCommand.php)
- [Native running/succeeded/failed status](https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Models/Workflow.php)
- [Environment backup restoration guidance](https://docs.pantheon.io/guides/environment-configuration/restore-environment-backup)
