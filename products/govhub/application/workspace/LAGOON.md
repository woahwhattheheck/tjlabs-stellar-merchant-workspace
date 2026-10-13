# Lagoon native operations

GovHub uses the selected existing Lagoon CLI to capture a complete project inventory, download an original backup, and operate an active/standby migration or rollback. These actions run through the same private operation queue, source bindings, review records, worker lease, progress view, handover and editable backup as Drupal/Drush and Acquia.

Install `lagoon_adapter.py` beside `native_adapter.py` with the complete workspace. Python's standard library is the runtime dependency. The existing Lagoon CLI and its native account remain on the host that executes the queue.

## Configure the actual target

Create or open the operating environment record and retain its actual Lagoon integer environment ID as text in **Provider resource ID**. Choose **Lagoon** as the provider. Its operating authorization identifies the actual project, permitted work and responsible operator.

In **Native tools**, choose **Lagoon native CLI** and supply:

| Field | Value |
| --- | --- |
| Exact Lagoon environment ID | The same original ID as the operating environment record |
| Exact Lagoon project name | Its actual native name |
| Existing Lagoon executable | Absolute path to the installed executable |
| Existing configured Lagoon instance | The explicit native `--lagoon` selection |
| Existing native configuration file | Optional absolute path to the operator's existing configuration |
| Native CLI working directory | An existing directory on that same host |
| Reviewed production / standby route URLs | Complete comma- or newline-separated HTTP(S) origins for a switch; use `[]` for a deliberately empty set |
| Selected original backupId | The opaque native backup string when downloading a backup |
| Native timeout / artifact limit | Capacity suitable for the actual operation and complete source population |

The configuration contains references to the existing native account. The CLI resolves its own authentication. Retain its token and key material within that host's existing custody.

The exact command prefix is `lagoon --skip-update-check --lagoon INSTANCE`, optionally followed by `--config-file EXISTING_PATH`. Each request uses `raw --raw GRAPHQL_DOCUMENT`. The pinned CLI prints the decoded GraphQL data object; GovHub retains the actual stdout, stderr, command and exit record. HTTP status and headers are available only for the actual archive download.

Capability discovery checks the configured project's actual identity and permitted environment population. The operation's target fingerprint binds the instance, project name and ID, and environment name and ID. The configured native paths remain on their original host when an editable workspace moves to another receiving directory.

## Capture and bind the full source

Choose **Capture original source**. The native query retains the project, its current authorized environment array, services, volumes, routes, API-route bindings, backups, tasks and Lagoon version. It omits native array limits and retains all returned members.

The pinned backup resolver ignores its `includeDeleted` argument. The captured backup population therefore retains every returned backup and its original `deleted` value; it is not relabeled as a provider-filtered live-only population. The inventory also omits credentials, private keys, environment-variable values and task command/log bodies.

The completed capture includes `lagoon-source-inventory.json` and its original CLI source. Use the retained source files to build the actual six-column cohort inventories and per-site bindings. Existing site comparison IDs, owning-agency IDs and native environment IDs remain separate identities.

## Download the original backup

Select the opaque native `backupId` in the profile, then choose **Download selected native backup**. This purpose does not require a cohort plan.

Lagoon's `addRestore` prepares the original backup for downloading. The resulting archive is retained as a source artifact; application restoration is a separate native operation. GovHub first observes the original backup's existing restore row and reuses it when present. Otherwise it submits one original preparation command and retains its native restore ID.

Accepted work is observed by that same restore ID. `SUCCESSFUL` permits retrieval of the native download link. The provider's `restoreSize` is a byte count. The completed archive must be nonempty and match that declared count when one is available. The manifest retains its backup and restore identities, SHA-256, byte count and original locator source.

The backup resolver can remove an expired restore row after a failed object-store check. An absent later row does not authorize another preparation request. The original mutation, retained ID and any response gap remain available for operating continuation.

A completed archive response is recovered before requesting another native locator. If the process ended after the download but before the manifest or final checkpoint, GovHub verifies the retained original response record and exact bytes and finishes that same operation. Expired signed links do not invalidate an already retained complete archive.

Signed download locations and full native responses remain in the private operation material. The ordinary progress display retains the destination without its query string. Each incomplete or failed download attempt keeps its own original request and response path.

## Switch, observe and roll back

Choose a reviewed cohort and an environment which is the project's actual current standby. **Cutover** uses the approved candidate; **Rollback** uses the original baseline; **Rehearsal** uses the designated rehearsal target. A native command applies to the complete selected site cohort on that environment.

The adapter reads the complete project immediately before dispatch. It resolves the active and standby by their actual native names, normalized selectors and integer IDs, checks matching service names, and verifies that the reviewed target and API-route assignments remain the same. Native `makeSafe` lowercases the environment name and replaces each non-ASCII letter/digit/hyphen UTF-16 unit with a hyphen; its separate namespace truncation helper is not used for switch selection.

A switch retains the original native task ID on the reviewed standby environment. The provider can insert that task before a queue or response failure. If its response is lost, use **Operating continuation → Original Lagoon task ID**, with the actual task and operating reason. GovHub checks the task's identity, name, environment and pre-operation task population before following it. An ID returned by the original switch response is retained immediately. A manually supplied ID becomes authoritative only after native identity verification; an unverified or mistyped candidate remains correctable, with its prior attempts retained. It never creates a replacement switch to rediscover an earlier result.

A successful task is followed by a complete project readback. Completion requires:

- The active and standby roles resolve to the expected original environment IDs.
- The complete production and standby URL memberships match their separately reviewed sets.
- The original API-route IDs retain their domain, service, source and type, with attached ACTIVE/STANDBY routes on their expected new environments.
- Unattached and STANDARD routes retain their original assignments; missing, changed or additional routes remain visible as exact findings.

Lagoon rebuilds its route strings from migrated ingress rules. GovHub retains those raw values and compares URL membership, so native order changes or previously stale strings do not produce a false mismatch.

### Keep the native rollback selectors usable

The pinned provider's completion handler can write an environment's original name into the project's selector fields, while its next switch resolver expects `makeSafe(name)`. This matters for names containing slashes or other replaced characters.

When needed, the operation records a native `updateProject` step that writes only the two equivalent production/standby selectors for the same original environment IDs. It retains the exact preimage, project ID, originating switch task, command and readback. This step may require the native account's `project:update` permission in addition to the switch permissions. It does not move routes, deploy an application or rewrite environment variables.

The same correction is available before a switch when the existing selectors came from an earlier native completion. An unknown correction response is reconciled against the current native values; the original command identity remains retained. A later continuation can finish an already applied correction without another switch or project write.

After the native task and readback complete, the cohort operation remains at **Attach the actual restored observation**. Select the completed original execution capture and the actual RESTORED inventory for the same source cohort. The existing auditor compares that observed inventory against the pinned source and records the final result.

## Continue and receive the same work

The existing worker serializes operation ownership. Polling uses the retained task or restore ID. Cancellation stops remaining work and preserves any already attempted native action for reconciliation. A restart follows the original command journal and verified completed responses. Unchanged native artifacts reuse their original retained file identity instead of creating another copy on each poll.

A completed backup download can be selected as an original native source operation when binding an inventory. Its actual backup bytes must match the inventory's recorded hash. The cohort handover includes the bound download operation, its events, original locator and HTTP request, and retained command outputs, including failed or interrupted attempts. Native operation artifacts remain cumulative across continuation.

Create the complete handover through the existing **Handover** view. Create the editable workspace backup through the existing backup flow after its native writer is quiescent. The backup retains the SQLite state, original sources, operations, commands and checkpoints. Receiving relocates private custody paths while preserving the original native target and CLI configuration references. Install the complete application on the receiving host and reselect that host's authorized existing target before operating it.

The original command-line interface remains available:

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

Use the retained environment ID in the capabilities request, and the existing operation request keys and revisions when continuing work. The web interface supplies those same fields.

## Native source contracts

- [Lagoon schema, 7ffbadcf](https://github.com/uselagoon/lagoon/blob/7ffbadcf159988952a9c7dddde3329935bd279ec/services/api/src/typeDefs.js)
- [Original backup and download behavior](https://github.com/uselagoon/lagoon/blob/7ffbadcf159988952a9c7dddde3329935bd279ec/services/api/src/resources/backup/resolvers.ts)
- [Original active/standby dispatch](https://github.com/uselagoon/lagoon/blob/7ffbadcf159988952a9c7dddde3329935bd279ec/services/api/src/resources/deployment/resolvers.ts)
- [Native task names and makeSafe](https://github.com/uselagoon/lagoon/blob/7ffbadcf159988952a9c7dddde3329935bd279ec/node-packages/commons/src/tasks.ts)
- [Actual ingress migration and returned selectors](https://github.com/uselagoon/lagoon/blob/7ffbadcf159988952a9c7dddde3329935bd279ec/taskimages/activestandby/dioscuri/dioscuri.go)
- [Project and API-route completion handling](https://github.com/uselagoon/lagoon/blob/7ffbadcf159988952a9c7dddde3329935bd279ec/services/actions-handler/handler/controller_tasks.go)
- [Native CLI raw output, 38a7b36e](https://github.com/uselagoon/lagoon-cli/blob/38a7b36e6b1f13cabcc01a5009ddd01f51f2ca29/cmd/raw.go)

The native documents are validated against that exact provider schema. An existing authorized Lagoon project and its original CLI account supply execution data; the source contract itself is not a deployed-project capture.
