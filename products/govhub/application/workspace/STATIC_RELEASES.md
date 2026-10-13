# Static releases

Use the original GovHub workspace to retain a complete Tome build, compare it with the selected local release, review every changed path, and publish through the existing worker. Each output edition keeps the original generated files and their byte counts, SHA-256 values, build report, source inputs and native operation identity. Release operations retain the selected target, comparison, review and predecessor so an interrupted publication can be reconciled and an earlier release can be selected deliberately.

Open **Static releases** in the existing application (`#static`). The original environment records, native configuration, build pages, operation history and workspace backup remain part of the same application.

## Start with the original complete build

Use the existing environment and native profile with `source_kind: tome`. Complete its original **CAPTURE** operation, then select that operation when retaining an output edition. A failed Tome command, incomplete native result or missing generated file prevents a complete edition from being created.

The receiver requires exactly one original static build report and the complete matching `static_asset` inventory. Each report path must identify one retained file with the same original path, byte count and SHA-256. Repeated paths, missing assets and additional unreported assets are errors. Retaining the same completed operation and report again returns the original edition.

Open the retained edition at `#static-edition?id=EDITION_ID`. Inspect its file count, total bytes, production URI, generator, source inputs and original build identity. Page or search the inventory to inspect individual paths. Inventory paging does not reduce the edition: publication and export use the complete retained set.

A build edition is immutable. To deliver changed generated content, complete another native capture and retain its new edition. Keep the earlier edition because it supplies the comparison and recovery history.

## Configure the actual local target

Create a target from `#static-target-new`, using the original environment and an existing absolute release directory on the machine that runs the worker. Select the ordinary filename used for its current-release symlink, usually `current`. The selected directory must be separate from the private workspace and its ancestors.

The target records the environment identity, absolute directory, filesystem identity and current-pointer name. Those bindings remain fixed. Label and notes have retained revisions and can be edited at `#static-target-edit`. Configure a separate target when the receiving location changes; changing a label does not relocate a release.

Open `#static-target?id=TARGET_ID` and inspect the actual target before preparing a release:

| Observed state | Required continuation |
| --- | --- |
| Current symlink absent | Configure the target without a baseline. The first comparison treats the candidate files as additions. |
| Current symlink present | Select an exact retained baseline edition from the same environment. The complete current tree must match every baseline path, size and hash before it is adopted. |
| Current path is unsuitable, resolves differently, or its contents do not match the selected baseline | Resolve the actual target or select the correct original baseline before proceeding. An unmatched existing tree is not silently adopted or replaced. |
| Another active operation belongs to this target | Continue, inspect or cancel that original operation through the existing operation controls. |

An existing release is adopted only after its complete bytes match the selected baseline. Its current pointer and baseline become the initial retained release. The application does not infer a baseline from a partial directory listing or from the candidate you intend to publish.

## Compare and review the complete output

Choose the retained candidate from the target's original environment and create a comparison against the target's current retained release. Give the plan a useful label and record the reason for the change.

Open `#static-plan?id=PLAN_ID`. The plan binds the exact target revision, candidate, baseline, current release and comparison hash. Inspect the full counts and browse the paths using `all`, `added`, `removed`, `changed` and `unchanged` filters. Review removals as well as changed pages: publication selects the entire candidate tree, so a baseline file absent from the candidate is absent from the new selected release.

Retain the existing review decision, **APPROVE** or **RETURN**, with its reason. The review identifies the exact plan and comparison SHA-256. This is the application's original release review, using its existing account roles. A Return decision keeps the plan and comments available for correction. A later candidate or changed target needs a comparison against the actual current state.

If the page reports that the plan is no longer current, reopen the target and create the appropriate new comparison. The old plan remains a useful historical record; its review does not authorize publication against a different baseline.

## Stage, publish and inspect the result

Stage the selected plan with an operating reason. The original worker creates the complete immutable candidate output under the configured target and verifies the staged files. Staging leaves the current symlink unchanged. Its retained stage record is attached to the original plan.

After the complete comparison is approved and staging has completed, publish that same plan. Use the original operation page (`#static-operation?id=OPERATION_ID`) to follow progress, the native result and retained files. Closing the page does not create a replacement operation or change the worker's ownership.

Publication verifies the configured target and its previous selection, retains the immutable release intent, and atomically replaces the current symlink. It then verifies the selected complete tree and records the release and native receipt. The receipt identifies the target, edition, manifest, plan, review, predecessor and actual selected pointer.

A successful release is established by the original completed operation and the selected target readback. Reopen the target to inspect its current release and release history. Keep the operation ID with the handoff so another operator can recover the exact result rather than repeat a publication from memory.

The output is a local filesystem release. Any web server that serves that current path remains configured through its existing operating arrangement. This workflow does not perform an external CDN deployment or restore a Drupal database.

## Roll back the retained predecessor

From the current target, choose rollback when the current retained release has a predecessor. The operation selects that exact predecessor's complete edition, verifies its files, and retains a new operation and release record. Supply the operating reason and follow the original worker through completion.

Rollback moves the current symlink to the retained predecessor. It preserves the newer immutable edition and its history. It does not delete generated files, rebuild an old site, choose an arbitrary older folder or restore database content. Reopen the target after completion and verify the selected release and predecessor chain.

## Recover the original action

The browser retains each action's stable UUID, action name and exact body in IndexedDB, scoped to the current account and workspace, before submitting it. A completed response is retained before navigation. Use **Recover original action** for an uncertain response and **Open saved result** when the action succeeded but opening or refreshing the next page failed.

Keep the same action identity and body during recovery. Request replay returns the recorded result for that original request before treating later revision changes as a new action. Editing the body belongs to a separate intentional action after the earlier outcome has been resolved.

The original operation controls own cancellation and resumption. A cancellation request is not itself evidence that a symlink was never changed. Once pointer replacement may have been attempted, the worker first reconciles the retained publication intent with the actual exact pointer. It records an already-performed publication before acting on cancellation or changed-current context. This prevents an interrupted successful release from being repeated or misreported as an untouched cancellation.

Use the existing operation's status, cancel and resume controls. Preserve its ID, native checkpoints, retained source and target binding. Do not launch another worker to reinterpret an uncertain publication.

| Situation | Original recovery path |
| --- | --- |
| Response lost after submitting an action | Look up the original request or recover its exact retained envelope. |
| Action completed, next page failed to open | Open its saved result; do not submit the action again. |
| Worker stopped while staging | Inspect and resume the same operation through the existing worker controls. |
| Worker stopped near current-pointer replacement | Let the same operation reconcile its retained intent and actual pointer before another action. |
| Target or current selection changed before publication | Read the original operation outcome, reopen the current target, and prepare a new comparison when required. |
| Local JSON or download publication failed | Recover the original native request/result, then write the returned file to a new output path. |

## Command-line operation

Run the CLI from the installed workspace source. Supply the existing private workspace, separate original supplied-input directory and account. `--source-root` names that retained input directory; it does not select the installed application code. Use the existing password environment variable or stdin support rather than a password in a command argument. Add `--assessment-core ABS` when required by that installation.

```bash
python3 static_release_cli.py \
  --workspace /absolute/operator-workspace \
  --source-root /absolute/supplied-inputs \
  --username operator \
  --password-env GOVHUB_OPERATOR_PASSWORD \
  list
```

The commands use the same native records and worker as the application:

| Command | Purpose |
| --- | --- |
| `list` | List retained editions, targets and release work. |
| `edition EDITION_ID` | Read a complete edition's metadata and a page of its file inventory. |
| `plan PLAN_ID` | Read the comparison, review/stage history and whether its baseline is still current. |
| `target TARGET_ID --inspect` | Read the retained target and observe its actual local selection. |
| `target TARGET_ID --revision OBJECT_ID` | Read a particular saved target configuration. |
| `request REQUEST_KEY` | Recover the completed original account-bound request. |
| `call static.ACTION --input FILE.json` | Submit an explicit native action from its prepared JSON body. |
| `replay EXACT_REQUEST.json` | Replay the original persisted request envelope without changing its identity or body. |
| `download FILE_ID --out NEW_FILE` | Save the exact retained file to a new local path. |
| `worker --until-idle` | Run the original workspace worker until its admitted work is idle. |

`edition` and `plan` accept `--offset N`, `--limit N`, `--query TEXT` and `--status all|added|removed|changed|unchanged`. Use the plan's comparison filters to inspect the complete change inventory across pages.

The mutation actions are `static.editions.receive`, `static.targets.save`, `static.plans.create`, `static.reviews.save`, `static.operations.create` and `static.exports.create`. Original `operations.get`, `operations.cancel` and `operations.resume` remain available through `call`.

Prepare the action JSON from the actual current record. Include its stable `request_key` and the actual `expected_revision` required by that action. Target actions bind the saved target revision; retaining a build binds its original operation revision. Plans and release operations also retain the expected current release, and reviews bind the exact comparison hash. Do not substitute a timestamp or a locally incremented revision.

For a mutation, retain the exact envelope and use a new result filename:

```bash
python3 static_release_cli.py \
  --workspace /absolute/operator-workspace \
  --source-root /absolute/supplied-inputs \
  --username operator \
  --password-env GOVHUB_OPERATOR_PASSWORD \
  --request-file /absolute/operator-requests/publish-original.json \
  --output /absolute/operator-results/publish-original.json \
  call static.operations.create --input /absolute/prepared/publish-body.json
```

The CLI saves the request envelope before native dispatch. If output writing fails after a successful operation, look up the same request key. Replay the exact retained envelope when needed and use a new result path; existing output files are not overwritten. Inspect the returned native state before resuming any worker operation.

## Export the complete operating handoff

Create an export from the selected target and open it at `#static-export?id=EXPORT_ID`. The export pins a retained snapshot: target revisions, release history, all candidate/baseline editions referenced by its plans and releases, complete comparisons, reviews, stages, build records, operation events and original source files. Later workspace changes are separate records and do not rewrite that captured export.

The complete `Static_Release_Handover.zip` contains:

| Path | Contents |
| --- | --- |
| `handover.json` | Complete captured target, edition, build, comparison and release operating record. |
| `report.html` | Readable comparison and release history. |
| `START_HERE.md` | Receiving instructions. |
| `manifest.json` | Path, byte count and SHA-256 for the accompanying files; it excludes its own recursive hash. |
| `editions/EDITION_ID/edition.json` | Exact edition identity and complete generated-file inventory. |
| `editions/EDITION_ID/site/ORIGINAL_PATH` | Every generated output file at its original relative path. |
| `comparisons/PLAN_ID.json` | Complete comparison, retained review decisions and stage records. |
| `original/FILE_ID/LITERAL_FILENAME` | Original reports, source inputs, manifests, native captures and retained interrupted-operation material. |

The exporter streams retained files and verifies their complete bytes and digests. Recovering an interrupted export keeps its original captured snapshot and request. An existing completed archive is reused only when all expected members and their exact bytes match.

Open `report.html` to review the handoff and inspect the manifest before using the generated output. Preview a generated site in a separate static location selected by the receiving engineer, outside the private authenticated operator application.

## Restore and reopen the operating workspace

Use the original GovHub whole-workspace backup and restore flow with the matching application source to resume the same accounts, object identities, SQLite journal, registered files, request results and native operation checkpoints. The static handoff ZIP supplies the complete operating/source/output record; it is not a replacement workspace database.

After restoring, open Static releases and read the retained target, latest operation and request results before continuing. Local release paths remain explicit. On a different receiving host, configure its actual existing local target and current baseline rather than assuming a saved path names the same filesystem object. Restoring a workspace or unpacking a handoff does not publish a site.

Keep the whole-workspace backup and static handoff together with the matching application source. The former reopens the original operating state; the latter gives the receiver the complete generated site editions, source and review history in ordinary files.

## Complete input limits

A native build report may contain up to 250,000 output files and 64 MiB of report JSON. The retained manifest limit is 128 MiB. File contents are streamed and retain their original paths, sizes and hashes. A limit or identity failure leaves the original build and operation material available for correction; it does not create a shortened edition, partial release or reduced export.
