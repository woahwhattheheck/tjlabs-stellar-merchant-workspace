# GovHub native Pantheon bridge

This is the original Pantheon Terminus integration used by the complete GovHub operator application. It submits one selected native model action, receives the returned Workflow immediately, and saves its exact identity before the operator waits for the workflow. The application's existing worker performs later observations. A resumed command reads its original operation receipt.

## Receive the executable source

Receive this entire directory with the application's source lock:

- composer.json
- src/GovHubBridgeCommand.php
- src/ReceiptJournal.php
- src/SingleAttemptRequest.php
- PHP_BRIDGE.md
- LICENSE

The native runtime is PHP 8.2 or newer and Terminus 4.3.3, source commit 4cd1810ad892157131cec5919baf3036ab457d57. The published 12,336,985-byte Terminus PHAR has SHA-256 e7ca9bcad3acbb1cfc0cec32550eeb2351e578dc6d5f79cd3a5303201893bade:

https://github.com/pantheon-systems/terminus/releases/download/4.3.3/terminus.phar

The application's pantheon_receive.py prepares and verifies that release. Its returned profile_runtime values select a PHP launcher and native plugin installation for the exact received source. The native account selection and TERMINUS_BASE_DIR continue to come from the receiving host. Preparation uses its existing Composer and installs the retained bridge source into that installation. Use the returned PHP and launcher paths for direct native reads:

    "$GOVHUB_PHP" "$GOVHUB_TERMINUS" govhub:bridge-info

The runtime record retains the unchanged release PHAR identity separately from the generated launcher. Older same-name plugin installations remain available to their own applications.

Terminus discovers GovHubBridgeCommand through the plugin's PSR-4 source directory. bridge-info opens the loaded native classes, checks their original Git blob identities, and reports every received PHP source member with its byte count and SHA-256. It performs no account login. Its schema is govhub-pantheon-bridge-info/v1; request_schema is govhub-pantheon-bridge/v1, plugin_version is 1.1.0, and terminus_version is 4.3.3. The plugin_root is the actual installed source location. A package-installed path can differ from the editable application directory; compare source_files against the received package.

Native contracts are checked for the original Request, request result, model and collection base classes, Site, Environment, Workflow, Backup, Commit, Environments, Workflows, Backups, Commits and Authorizer. A different native version needs a deliberate adapter revision and receiving run.

## One original instruction

The provider writes one private UTF-8 JSON request and selects one private receipt filename per original operation step. The request file must be ordinary, readable, at most 1 MiB, and have no group or other permissions. The receipt's parent directory must exist. Run:

    "$GOVHUB_PHP" "$GOVHUB_TERMINUS" govhub:bridge --request=/private/operation/request.json --receipt=/private/operation/receipt.json

The receipt and its .d directory contain native source data and temporary signed backup locators. Keep them in the application's private operation custody. The operator exports the retained application artifacts through the established handover flow.

Required request fields:

| Field | Exact meaning |
| --- | --- |
| schema | govhub-pantheon-bridge/v1 |
| operation_id | The saved GovHub operation ID; letters, digits, underscore, dot, colon or hyphen, up to 200 characters |
| step_id | The provider's original step label, with the same character rules |
| intent_sha256 | Lowercase SHA-256 of the provider's immutable original operation intent |
| action | One action from the table below |
| site_id | Original lowercase Pantheon site UUID |
| environment_id | Native environment name, for example test; the UUID is a separate field |

The complete original request bytes, their SHA-256, the operation, step and intent are retained. Reusing a receipt with different original request bytes fails before a new provider request.

Optional shared timeout_seconds is an integer from 10 to 7200; its default is 300. run_updatedb, clear_cache and allow_initialize are JSON booleans. All source and target environments refer to the selected original site.

## Native action mapping

| Bridge action | Additional input | Original native behavior |
| --- | --- | --- |
| inventory or pantheon-capture | Required fields only | Read actual site and environments, selected and promotion-parent code logs, original backup catalog, native SSH and Git connection coordinates |
| backup-list | Required fields only | Read the selected environment's native backup catalog and retain every returned member |
| pantheon-backup-download | backup_file; optional backup_element | Select the exact finished original backup and request its private native HTTPS archive locator |
| workflow-inspect | workflow_id; optional expected_workflow_type | Fetch that exact native Workflow UUID with operation logs through the Site-owned Workflow model |
| pantheon-backup-create | backup_element: all/code/files/database; backup_keep_days: 1–3650, default 365 | Backups.create starts the native do_export workflow for the selected components |
| pantheon-deploy-code | source_environment_id; optional source guards, deploy_note, run_updatedb, clear_cache, allow_initialize | Environment.deploy promotes Dev to Test or Test to Live; explicitly selected initialization uses original initializeBindings |
| pantheon-clone-files | source_environment_id; optional source guards | Environment.cloneFiles starts clone_files from the selected original environment |
| pantheon-clone-database | source_environment_id; optional source guards, run_updatedb, clear_cache and paired WordPress replacement text | Environment.cloneDatabase starts clone_database with the native framework-specific behavior |
| pantheon-restore-backup | backup_file; optional backup_element | Select the exact finished original file, then Backup.restore starts restore_code, restore_files or restore_database |

A complete content clone is two original steps, files and database. A full restore selects all three exact files as three original steps. The existing GovHub provider sequences those operations and retains their own pre-change backups.

backup_file is the actual catalog filename, without a directory. backup_element defaults to all. For download and restore, a specific component is checked against that file's native type; no newest-file fallback is used. Native archive contents are transferred and hashed by the existing Python provider. The bridge retains their original selected catalog identity and signed locator.

Deploy source_environment_id must be dev for target test, or test for target live. The command checks the original native hasDeployableCode behavior and returns a completed no_change result when the native environment has nothing to promote. Initializing an uninitialized Test or Live environment also clones its native database and files; allow_initialize must explicitly be true for that selected instruction. The application's pre-change backup and operator selection remain in its normal operation plan.

wordpress_from_url and wordpress_to_url contain paired native search/replacement text, up to 2048 UTF-8 bytes each. They accept bare hostnames, complete URLs and path-bearing values, as the original env:clone-content command does; the selected strings pass unchanged to Environment.cloneDatabase. For example, www.example.com can be replaced by test.example.com. They apply to a native WordPress site. When omitted, the original model determines its native platform addresses. Control characters are rejected before dispatch.

Primary command behavior: <https://docs.pantheon.io/terminus/commands/env-clone-content>.

## Reviewed source binding

Optional expected_source_code_sha256 is the exact SHA-256 supplied by the existing provider's promotion source observation. The bridge obtains the original Commits.serialize output and keeps the native returned row order with array_values. Its canonical encoding sorts object keys, has no whitespace separators, and preserves Unicode and slashes. This matches the provider's Python json.dumps(sort_keys=True, separators=(',', ':'), ensure_ascii=False) over those native code-log rows.

Optional expected_source_commit is the exact lowercase Git SHA-1 at the first returned native code-log row. A changed digest or head stops the selected step before workflow dispatch. The receipt includes the actual observed rows, digest and head.

## Native account and request behavior

Before the first new provider operation, the command invokes Terminus's original Authorizer.ensureLogin. It uses the existing session, configured user and native saved-token selection. This happens after local receipt recovery, so an already completed receipt remains readable while signed out.

Every new bridge model request is bound to SingleAttemptRequest, including the selected environments, their parent environments, commit collections, backup collections and workflow collections. That transport uses the original native path construction, session token, request JSON and result parser. Its client has one transfer, no retry middleware, no redirects and no 401 reissue. An identity content-encoding request preserves the original returned entity bytes for the parser and private custody.

The actual native site endpoint must match the selected site UUID. Reads are GET. The only allowed workflow POST is the one original collection endpoint and native workflow type authorized by the selected model action. A backup archive-token POST retains its native read-locator purpose. The dispatch record is synchronized before sending a target-changing native workflow request.

## Validation before receipt creation

A request-read or request-validation failure can occur before the private receipt journal is created. Its native stdout result carries `state: rejected`, `dispatched: false`, `request_phase` and the original `request_sha256` when bytes were read. Receipt-open failures have their own phase so the consumer can preserve existing journal custody.

The Python provider retains this completed native return with its exact original command and stdout. A manual continuation after correction can start a distinct attempt for the same business instruction when the original command ended with the validation result and no receipt or sidecar directory exists. Existing 1.0.0 validation returns follow the same ended-command association. The original error and argv remain retained with the prior attempt; real workflow receipts continue through their original UUID.

## Immediate outcome and continuation

The receipt schema repeats the request schema and original operation identities. It includes:

- state: submitted, completed, failed, rejected or uncertain
- dispatched: whether the original target-changing workflow dispatch was durably recorded
- workflow: exact returned ID, environment, native type if present, status, finished, successful, complete parsed native attributes, native serialized form and operation logs
- data: the actual catalog, source observations, selected backup or inspection detail
- runtime: loaded source identities and native runtime versions for a new run
- native_http: original request/response metadata with paths, byte counts and hashes identifying their private exact events
- artifacts: the custody filenames, byte counts and SHA-256 values
- request_sha256, intent_sha256, operation_id and step_id

A create response can initially contain only its new workflow UUID. The receipt explicitly marks whether its environment came from native workflow attributes or the original environment-specific native request path. An exact workflow-inspect response must identify its own environment and must match the selected target.

Each HTTP request and response event is an individually immutable, atomically published, synchronized file. A response envelope saves its HTTP status, safe response headers, complete original body bytes in base64, byte count and SHA-256 before the native model parser runs. The original body is retained once in that private envelope; sidecar and final receipts carry its event path, size and hash. The workflow.json sidecar is published immediately after receiving the native Workflow model. The final receipt is published before JSON is emitted on stdout.

An invocation with the same original request and receipt follows this order:

1. Read and return the existing immutable final receipt.
2. Complete the final receipt from its existing workflow.json sidecar.
3. Recover the original workflow model from the exact successfully received native HTTP response, then publish its sidecar and final receipt.
4. Preserve the original dispatched request and actual rejection or unsettled outcome for continuation through its original workflow identity.

These paths create no new workflow request. To inspect original entity bytes, decode body_base64 from that retained response event and compare body_bytes and body_sha256. The old append-journal format is also readable: a killed final line remains retained as original bytes while complete earlier events can be recovered. New event files avoid that append failure mode.

Once a workflow UUID has been received, the existing provider creates a distinct workflow-inspect request/receipt for each later observation, retaining the same operation ID and intent and an observation-specific step ID. A repeated submitted receipt is an original submission receipt; the worker polls the exact native workflow in a later observation. A failed workflow remains the original failed workflow. The application's Resume form binds an exact original UUID when a process ended before an ID could be durably received.

The command exits 0 for completed or submitted, 2 for failed or rejected, and 3 for uncertain. Read the saved receipt even when the command exits nonzero or its stdout was interrupted. Keep the .d directory with the receipt through the editable application handover.

## Receiving and packaging

Use the complete application's PANTHEON_RECEIVING.md for native prepare/discover, existing staff workspace inspection, selected command execution, worker continuation, handover, native backup and cold reopen. Its receiver compares bridge-info against these exact source files.

The selected site, environment, original step, intent and native workflow stay attached to the saved operation. Receiving-host PHP, Terminus and source-directory locations are separate runtime bindings maintained by the original provider. Existing private receipt paths remain original custody references and are resolved through the application's handover relocation mechanism.

build_application.py locks every tracked source member, packages the complete application with this plugin, and reopens the finished ZIP to verify all members. It can include the exact original release PHAR. Retain workspace/native/TERMINUS-LICENSE.txt with the native runtime.

## License and primary contracts

This new bridge is Apache-2.0, with the complete license in LICENSE. The original Terminus release remains under its own MIT terms and notices. No provider source is copied into the bridge; its installed native classes perform the operations.

Primary native source at the pinned release:

- https://github.com/pantheon-systems/terminus/tree/4cd1810ad892157131cec5919baf3036ab457d57/src/Models
- https://github.com/pantheon-systems/terminus/tree/4cd1810ad892157131cec5919baf3036ab457d57/src/Collections
- https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Request/Request.php
- https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Hooks/Authorizer.php
- https://github.com/pantheon-systems/terminus/blob/4cd1810ad892157131cec5919baf3036ab457d57/src/Plugins/PluginInfo.php
- https://docs.pantheon.io/terminus/commands
