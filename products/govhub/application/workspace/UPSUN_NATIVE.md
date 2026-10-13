# Current Upsun native provider

This provider is part of the existing GovHub application. It operates one selected current Upsun project and environment through the published current API, keeps its original activities and source files in the same workspace, and continues an interrupted operation from its retained response or actual native activity.

The profile is labelled **Upsun (current API)**. A historical Platform.sh customer example does not establish that a particular account uses this API. Select the actual current product, project and environment before configuring it. The provider uses https://api.upsun.com. It does not silently substitute a Fixed API.

## Complete application and native inventory

Use the normal GovHub launcher and authenticated operator. Open **Native operations**, select the existing environment record, and configure its Upsun profile. The environment's provider resource ID must be the exact **project ID/environment ID** reference. The complete source, plan, comparison, authorization reference and native operation stay in the original GovHub model.

The profile schema supplies the real fields and receiving-host bindings. Save the profile and inspect its actual capability result: original project, selected environment, all returned environments, backups, activities, deployments, and deployments/current. A native 404 for current deployment is retained explicitly alongside a null current deployment.

One native mutation may return several activities. The provider accepts and polls the complete **_embedded.activities** list and preserves **_embedded.entity** and the full response. The operation screen exposes every retained activity ID and original status.

## Credentials and native host

Set exactly one environment-variable **name** in the profile:

- **api_token_env** names an existing API-token variable. Immediately before an actual request, the provider exchanges its value at the published OAuth endpoint using grant_type=api_token and Basic client platform-api-user:. The access token stays in process memory.
- **access_token_env** names an existing short-lived bearer-token variable. Its value is used directly.

Profiles and source journals retain names rather than token values. No credential enters an API URL, operation body, command-line argument or source artifact. OAuth response bodies contain credentials and stay in memory; nonsecret status, expiry and reference are retained. A 401 never silently repeats a content-changing POST.

**site_root** is the existing absolute native source directory. **git_path**, **upsun_path**, **ssh_path** and **rsync_path** select actual installed executables, by absolute path or a command name resolved on the original native host. See **UPSUN_SOURCE.md** for the complete native source receiver and its exact commands. The API-token reference is mapped to the CLI's expected variable inside its child process.

The runtime binding set is declared by provider_schema().runtime_fields. A receiving host can rebind original paths and credential references while preserving project, environment, reviewed source and immutable native instruction. When explicitly switching between API-token and access-token references, supply an empty old field and the new reference together.

## Receive the original source

**source_revision** is the full reviewed native Git commit. Capture first to discover and receive actual source. Mutations compare that selection with the environment's actual head immediately before dispatch. A changed head needs a newly reviewed instruction.

For complete source receiving, select **source_app**, **source_database**, **source_database_schema** and **source_mounts_json**. The database selection is the actual relationship; schema is explicit. An empty mount array means every original mount of the chosen application. A nonempty array is an explicit subset and stays labelled as such. The helper retains complete Git, SQL and mount bytes with actual command output and source identities.

Capture retains full API inventory before and after source receiving. Head commit and deployment ID must remain equal. Database and mounted files are independently observed captures; this check does not turn them into a transactional DB/files snapshot. The manifest preserves their actual receiving order and times.

The source helper owns exact private members, command journals, package and reopening verification. Every artifact joins the original GovHub source packet. Reopening a complete native operation checks each retained artifact's size and SHA-256.

## Native actions and effects

| Existing purpose | Native action | Actual effect |
| --- | --- | --- |
| CAPTURE | upsun-capture | Complete selected source receiving and native inventory. |
| BACKUP_CREATE | upsun-backup-create | Create a provider-side snapshot of the selected environment. |
| PREVIEW | upsun-branch | Create a development or staging child. |
| PREVIEW | upsun-activate | Activate the selected nonproduction environment. |
| PREVIEW, REHEARSAL, CUTOVER | upsun-redeploy | Run the selected environment's native redeployment. |
| REHEARSAL | upsun-synchronize | Synchronize selected code, data and/or resources from current parent to child. |
| REHEARSAL, ROLLBACK | upsun-restore-backup | Restore an exact selected native snapshot to its original environment. |
| REHEARSAL, CUTOVER | upsun-deploy | Release the selected environment's staged changes. |
| CUTOVER | upsun-merge | Merge child code into its reviewed parent and rebuild/deploy that parent, retaining the parent's existing data. |

The existing GovHub plan, source snapshot, rehearsal purpose, comparison and approval rules apply to their operation purposes. For merge, the parent is the affected target although the native action is invoked on the child. Retain the parent's recovery capture in the existing cohort before cutover.

Complete source receiving precedes synchronize, restore, merge, deploy and redeploy. Branch and activate may involve an inactive environment whose database and mounts are unavailable; those actions retain exact inventory, source head and request. Explicit CAPTURE remains the full source handover action.

The provider checks the resource's original HAL action link before a mutation. Missing native capability is reported with the actual resource; no alternate route is invented.

### Branch, synchronize and resource options

Branch requires branch_name, branch_title, branch_type and source_revision. Type is development or staging. clone_parent is explicit. An existing name is not overwritten or silently adopted by a new request; continue its retained original operation or select that environment.

For synchronize or merge, parent_environment_id must match the actual current parent. Synchronization requires at least one code, data or resources selection. Rebase requires code synchronization. Native data synchronization overwrites the child's data.

Optional resources_init is validated against the original action schema:

| Action | Native values |
| --- | --- |
| Branch, activate | default, minimum, parent |
| Merge | child, default, manual, minimum |
| Restore | backup, default, minimum, parent |

Deployment strategy is stopstart by default, matching the released native CLI. Rolling is available only when the actual environment exposes can_rolling_deploy=true. Controlled deploy retains the complete original staged activity set; those activity IDs can legitimately predate this dispatch. Defaults cannot change an already-dispatched request.

### Native snapshots and restore

Native Upsun snapshots remain with the provider. Official support states that they cannot be downloaded, so no upsun-backup-download action is offered. Git/SQL/mount receiving is a separate operation with actual exported bytes.

Backup creation retains every observed before/after snapshot and native activity. **observations.new_backups** is the observed new cohort, not a guessed association with a concurrent snapshot. Select an actual snapshot ID from the native inventory for restore; do not automatically choose a newest or positional row.

Restore requires backup_id from the selected environment, status CREATED, restorable=true, and its complete current detail response. restore_code and restore_resources are explicit. This provider restores to the snapshot's original environment. A code restore compares the resulting actual head with the snapshot's original commit_id.

## Request, response and activity continuity

The existing Session owns private output, events, artifacts, checkpoints, cancellation and process continuation. Before mutation, the provider saves the exact method/path/body and request SHA, reviewed profile/source, full inventory and previous activity/snapshot IDs, and dispatch record.

Every actual API call retains original input, response headers, raw bytes, size/hash, status, timestamps and errors. Completion uses the original declared HTTP body length, including the native pre-read length. A truncated response remains incomplete even if its status began successfully.

The transport does not follow redirects or automatically repeat mutations. Regional HAL references resolve onto the same selected central project authority, matching the original PHP client's authority binding; the original link remains in source. Credentials never go to a response-supplied host.

A complete 429 saves its account deadline and permits the same rejected instruction after that deadline. A 5xx or lost/ambiguous mutation reply keeps uncertainty and requires its original activity; no second POST occurs. A complete 4xx rejection becomes a retained terminal native result.

Every returned activity is polled, with project, environment membership and ID checked. The provider waits for the whole set, receives every complete native log, and retains all actual failures. Native documentation says an activity can report success despite a failed deploy command; failed commands remain material failures in the operator result.

### Recover an interrupted original operation

Resume the same GovHub operation. If its original complete response was saved, it is reopened and its full activity list adopted.

Otherwise select the actual **Original activity ID**, or supply **Original activity IDs JSON** for the complete native activity set. The continuation binds the original request SHA, reason, project, environment and action. It rejects unrelated earlier activities and contradictory native parameters. Controlled deploy preserves its entire original already-staged activity cohort, preserving which request parameters the provider exposed and which it did not. This is explicit original-operation association, not mutation replay.

The accepted response's whole activity list cannot be replaced by another single ID. Both **native_resume.activity_ids** and **resume_checkpoint.native_poll.ids** expose it. Cancelling a local wait retains any dispatched remote activity; it does not claim the remote operation was cancelled.

## Complete native and rendered receiving

Use **UPSUN_RECEIVING.md** and **upsun_receive.py** in the existing GovHub workspace. The course request is immutable; its separate continuation supplies actual original activities and host references under the same operation IDs.

Useful original result bindings:

- Source head: observations.native_inventory.environment.head_commit.
- Completed branch: observations.affected_environment.id and .parent.
- Accepted activity set: observations.activity_ids.
- Restore selection: an explicitly chosen row from observations.native_inventory.backups.

Open the exact outgoing application, report and downloads. Inspect wide and narrow rendered states, operate important controls, receive original native files, and reopen the same project. Read the actual screenshots and downloads before customer-ready status. Source parsing alone does not complete rendered receiving.

## Primary source identity

The complete current API is retained unchanged at native/upsun/openapispec-upsun.json:

- Repository upsun/meta.
- Commit 486957153711c62f206b9e950af4c5406d1a6559.
- Git blob c956c8b7c5e1b41d61a4452e9c4ff3228f17ff0f.
- 187 documented paths; this provider implements only the selected workflow above.

Original selected PHP sources establish deployments/current, multiple embedded activities, embedded entity, and the activity log route. Their complete bodies, native Git identities and original licences accompany native/upsun/SOURCE.json.

Primary references:

- https://developer.upsun.com/api
- https://developer.upsun.com/api/rest/authentication
- https://github.com/upsun/meta/blob/486957153711c62f206b9e950af4c5406d1a6559/resources/openapi/openapispec-upsun.json
- https://github.com/upsun/upsun-sdk-php/tree/dd0150c58f8a49663bbd1b828d77b72bae1458d9
- https://github.com/platformsh/platformsh-client-php/tree/a263eb88563b3aeb1f9fdcae627144e2acb51e30
- https://developer.upsun.com/docs/integrations/activity/reference
- https://support.platform.sh/hc/en-us/articles/11992296645650-Can-I-download-a-backup

New provider code is Apache-2.0 with the application. Original selected sources retain their native licences. The acquired specification repository tree has no root licence; its original identity is retained without assigning a new licence.

The provider retains the selected child deployment and, for merge/synchronize, the parent's actual head/deployment across full source receiving. Any change is surfaced before dispatch. Successful resource Retry-After values apply to that resource; 429/503 deadlines apply to the account. The OAuth response has its own complete-body check and respects its actual returned account deadline.

### Restart-safe polling

The saved native resume checkpoint carries `provider_request_not_before` as an absolute Unix timestamp for the request selected by `provider_request_url`. It is the maximum of the actual account deadline and that exact resource deadline. Receivers use this absolute value and the original operation's `next_poll_at`; `poll_after_seconds` is an observed display interval and must not be turned into a new deadline after restarting. Deadlines for unrelated URLs remain separate in `provider_resource_deadlines`.
