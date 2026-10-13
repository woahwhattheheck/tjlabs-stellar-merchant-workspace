# Upsun environments in the existing GovHub project

This application operates the current Upsun API from the original GovHub environment register, queue, source history and handover. Select the existing project and an authorized environment, retain its complete source, perform the selected native work, and reopen the same project with its activity and recovery history.

The provider label is **Upsun (current API)**. The API authority is https://api.upsun.com and the API-token exchange is https://auth.upsun.com/oauth2/token. Existing Platform.sh or Upsun Fixed accounts must have their actual origin and current API contract established before this provider is selected. A historical provider case study does not establish access to a customer's account.

## Scope and original source


Primary product sources:

- Complete official OpenAPI from upsun/meta at commit 486957153711c62f206b9e950af4c5406d1a6559; original Git blob c956c8b7c5e1b41d61a4452e9c4ff3228f17ff0f, 1,632,400 bytes. The provider source package retains the unchanged document and its source notice.
- The official Upsun PHP client describes a mutation result containing zero, one or multiple embedded activities and an optional embedded entity. The provider retains the actual returned collection and follows every original activity.
- Native CLI and source/export command contracts are recorded with the complete helper in UPSUN_SOURCE.md.
- https://support.platform.sh/hc/en-us/articles/11992296645650-Can-I-download-a-backup explains the native backup distinction. A provider snapshot is restored by the provider; complete downloadable project data comes from the separately retained Git, database and mount exports.

Read the complete provider and source guides shipped with this application for the exact pinned native endpoints, fields, response and command semantics.

## Open the selected environment

Use the existing installed application and staff account. In **Environments**, open the selected environment and choose **Native tools**. A workspace administrator can choose **Upsun (current API)** and save the native profile.

The environment's provider-resource identity and the profile environment_id must agree. The latter binds the actual project/environment pair. Keep the existing operating authorization reference on the environment; record the specific selected work when queuing an operation.

The profile form is generated from the provider's actual schema. Its fields cover:

| Selection | Meaning |
| --- | --- |
| environment_id | Actual project and environment identity. |
| api_token_env or access_token_env | The name of an existing environment variable holding the selected credential. |
| site_root and native executable references | The actual source checkout and installed tools on this host. |
| source_revision | The actual selected source revision when the operation requires it. |
| source_app, source_database and source_database_schema | The selected application, native relationship and database schema. |
| source_mounts_json | Explicit original mount selection; the helper documents how an empty selection includes the actual application mounts. |
| parent_environment_id, branch_name, branch_title, branch_type and clone_parent | Explicit native branch selections. |
| backup_id | The actual provider snapshot selected for a restore. |
| synchronize_code, synchronize_data, synchronize_resources and rebase | The selected native synchronization behavior. |
| restore_code and restore_resources | The selected restore components. |
| deployment_strategy and resources_init | Native deployment selections supported by the current contract. |
| timeout_seconds and max_artifact_bytes | Native command limits for this selected operating project. |

Credential **values** stay in the original host environment or native account setup. The project retains credential reference names. The source exports and provider responses are private project material: they may contain customer content, database rows and native configuration. Keep the existing project's receiving and access arrangements.

## Read the actual native inventory

The **Observed native capability** panel displays the selected original project, environment, current deployment, available environments, native backups and activities. It also preserves the complete original response material with the source operation.

The native backup table displays the actual provider ID and available metadata. **Use this backup** copies a restorable snapshot's actual ID into the profile editor. Review and save that configuration before queuing a restore. Selecting a row does not itself start a provider operation.

Refresh the native observation when the account or environment has changed. A missing credential, provider deadline, unavailable source tool or native permission result stays visible as an actionable receiving condition. Supply the actual required account/tool reference in the same project.

## Capture the complete original source

Choose **Capture original source**. Review the actual environment and operating authority and queue the original CAPTURE operation. The existing worker owns it.

The capture retains native project/environment/deployment observations, the actual Git source and working-tree changes, the selected database dump, and full selected mount content through the current native source helper. The complete package carries file identities, native command results and before/after deployment observations. Read UPSUN_SOURCE.md for its exact package and independent receiving commands.

A coherent source export and a native backup snapshot are separate assets. The native source operation's downloadable artifacts appear on its **Original native artifacts** panel and in the existing Sources history. Download those complete original files through the application; their displayed hashes identify the retained bytes.

If the selected environment is inactive or an operation cannot access its running database or mounts, the native result states the actual source condition. An activity's completion does not manufacture a complete downloadable source package.

## Select native work

The operation-purpose selector shows only the actual actions supported by the selected provider:

| Existing purpose | Upsun actions |
| --- | --- |
| Capture original source | Capture the native source and inventory. |
| Create native backup | Create a native provider snapshot. |
| Operate environment | Branch, activate or redeploy the selected environment. |
| Rehearse the baseline operation | Synchronize, restore a snapshot, deploy or redeploy against the selected reviewed cohort. |
| Apply approved candidate | Merge, deploy or redeploy with the current plan's required review. |
| Return to original baseline | Restore the selected native snapshot against the original reviewed source. |

Read the selected action's profile and operating description before queuing it. The complete original instruction is retained with its configuration hash, environment revision, authorization and source/cohort selection.

REHEARSAL, CUTOVER and ROLLBACK use the original GovHub plan and inventory mechanisms. CUTOVER retains the current required audit and approval. The completed provider activity and the actual restored content observation are distinct stages: retain and attach the real RESTORED inventory through the existing observation form. The original six-column comparison determines the resulting cohort outcome.

A backup-create result may contain several new observed backup rows. Use the actual returned entity when it identifies the snapshot, or select the intended snapshot from the retained native collection. Never infer the restore target from an arbitrary first row, newest timestamp or a fabricated ID.

## Follow every original activity

A single native write can return multiple activities. The provider retains all actual activity IDs and observes each until the whole native outcome is known. The operating page exposes the complete original progress, response material and event history.

Provider deadlines remain attached to the original operation/account as defined by the adapter. An elapsed local polling interval does not remove a later provider deadline. The existing worker resumes eligible reads; a receiving host can reopen the same saved operation.

If the write response was lost, the application retains the original request and its uncertainty. In **Operating continuation**, supply the actual original Upsun activity ID when the provider has not reconciled the result. If that original write returned several activities, supply their complete JSON array in the adjacent field. Controlled deployment can release previously staged activities; preserve their original IDs and staged cohort. The adapter verifies that association against the original project, environment, action, request and available native arguments. It does not replay an uncertain mutation merely because the local caller ended.

For a received project, open **Receiving host**, select its checkbox, and supply the current source/tool paths and existing credential reference names. Those runtime bindings leave the provider identity and reviewed instruction intact. Supply an operating reason and choose **Resume retained work**. Explicit cancellation remains an operator decision.

## Save and independently reopen the whole project

Use the original application package builder and workspace private backup. The Upsun receiving programme composes these maintained mechanisms with the complete supplied-input directory:

1. Finish the selected native operating course and reconcile its real restored inventory where applicable.
2. Build and verify the complete original GovHub application ZIP.
3. Select a new private receiving directory and run the handover command in UPSUN_RECEIVING.md.
4. Receive the complete original input tree, verified application ZIP and coherent private workspace backup.
5. Reopen that received project in a separate process with the existing staff account.
6. Compare the complete retained operation population and continue any later authorized work using the actual receiving-host references.

The private backup preserves the actual database, original source blobs, native artifacts, response history and operation IDs. The application ZIP carries the whole maintained product and its original vendor sources. The standalone source-export receiver supplies the native Git/database/mount payload independently of the provider snapshot.

## Actual rendered delivery

Before calling this customer-facing application, its dashboard, report or export ready, the producing peer must open and run the **exact outgoing version**, look at the actual rendered screen or real screenshots, and operate its important controls. Capturing screenshots without looking at them is insufficient.

Use the existing equipped browser with the full browser course in native/upsun/browser_receive.cjs. Inspect desktop and narrow layouts, populated and actual empty collections, loading and error states, the profile and backup selection, native action choices, original continuation controls, complete downloads and independent reopening. Read the whole native result and view every returned screenshot.

Fix broken, cramped, clipped, overflowing, unstyled or unreadable output as part of this same product. Use readable tables, clear hierarchy, consistent typography and spacing, restrained controls and useful labels. Preserve the real workflow and computation. Source review, grammar checks, HTTP success, DOM counts and another peer's approval do not replace viewing the product. This is part of delivery, not a new approval gate, broad suite, watcher or separate verification project.

Continue the original authorized source work while its actual native/rendered receiving runs. Preserve the same owner, workspace, provider account, operation and original input. Record actual received outcomes and concrete remaining inputs with the company case.
