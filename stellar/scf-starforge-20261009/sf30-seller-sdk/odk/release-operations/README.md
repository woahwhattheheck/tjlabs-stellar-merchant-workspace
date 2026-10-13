# Software release operations

This desk joins an application release and its ODK Central version in the existing field workspace. Retain the original GitLab pipeline, jobs, deployments and complete artifact files; select the original Central host and release sources; review dependencies and recovery; freeze an immutable plan; then receive the actual operator outcomes and acceptance observations.

The existing application operator performs the deployment and the existing Central host owner performs the upgrade or isolated restore. This desk maintains their shared plan, exact original results, source-bound decisions and handover. Its GitLab adapter issues authenticated GET requests only. It creates no deployment, pipeline, job retry, manual-job play, Central upgrade, form publication or restore.

## Open the same workspace

The ordinary managed application mounts **Software releases** at `/release-operations/`, beside **Form releases**, **Commissioning** and **Warehouse**. Navigation carries the same operator token in the URL fragment. All desks share the original Store, listener, writer lease and archive.

To enable native GitLab source receiving, the host operator supplies its existing configured connection file:

```sh
starforge odk-central-workspace serve \
  --workspace /absolute/private/field-workspace \
  --operator "Field operations" \
  --release-connections /absolute/private/release-connections.json
```

The file is an array, or an object with schema `stellar-forge.central-release-connections.v1` and a `connections` array. Each entry is `{id,name,url,tokenEnv,projectIds?}`. The URL is the actual GitLab instance origin, the environment alias supplies the existing private token, and optional project IDs restrict the configured source. The browser receives only the connection's public label, origin and allowed projects. It cannot choose another credential alias or provider origin. The private file's SHA256 is included in managed startup metadata; credentials remain in the host environment.

Original file receiving is usable without a GitLab connection. A separately received GitLab artifact must select its original retained GitLab source and actual job ID. It remains an operator-supplied original archive; a failed redirected artifact GET remains recorded with its own outcome. If a combined GitLab capture stopped at an unsupported artifact redirect, retain that failed capture and receive a new metadata-only selection for the same original provider/project/pipeline/job IDs without an artifact GET. Select the complete metadata edition as the candidate and the separately uploaded original archive as its artifact. The original failed GET is preserved; it is not rewritten as success.

## Receive complete originals

Give each source edition a clear name. Select the actual GitLab project and pipeline and the specific job, deployment and artifact job IDs needed for this release. The receiver retains project, pipeline, paginated pipeline jobs and all selected resources, with their original response bytes, hashes, timestamps and continuation. Open the retained source shelf to inspect actual facts and download every complete original.

An accepted source request can continue in the background. **Refresh saved work** shows its current source state. **Resume same source request** continues its original queue and retained selection. A provider's Retry-After deadline remains effective. Failed originals stay attached to that source. A later native pipeline, retry job or deployment is a new source edition with its actual IDs.

Upload the actual Central handover, upstream release descriptor, completed snapshot manifest and isolated restore result from the original host operation. Other accepted originals include upgrade instructions, original form-publication receiving results and operator evidence. The source receiver validates recognized native formats and stores full original bytes before saving their source record.

A snapshot manifest describes retained backup custody; it is not the backup archive itself. Keep private runtime environment, keys, database dumps and attachment payloads in the original host's complete backup. The existing Central host guide and restore command own those files and target validation.

## Prepare and review a coupled release

1. **Select the editions.** Choose application baseline and candidate, exact project/environment IDs and the full candidate artifact resources. Choose the actual saved Central connection and original service origin, baseline host handover and candidate upstream release.
2. **Record dependencies.** Retain each original compatibility requirement or intervening Central upgrade instruction, name its owner and state the actual version requirement. No compatibility is inferred from a product label.
3. **Define recovery.** Bind the completed backup manifest and actual isolated restore rehearsal. Record its custodian, existing procedure, write quiescence and acceptable loss window. Record separate coverage for database, external attachments and Web Form configuration as applicable.
4. **Sequence the original operations.** Each release/recovery step names its owner, phase, original procedure, predecessor steps, expected source edition and exact returned evidence kind. Application deployment steps bind the selected candidate or recovery baseline. A form-publication step selects an already approved form plan from the same workspace.
5. **Specify acceptance.** Define actual application, Central and joint checks with their original source requirement, expected observation and operator procedure. Each phase needs an actual joint acceptance check.
6. **Save and assess.** The desk compares source identities, artifacts, versions, recovery coverage and dependencies. Blocking source mismatches must be corrected in the definition or originals. Review items take an explicit disposition and note.
7. **Freeze the reviewed plan.** The immutable plan includes the full selected definition, source hashes, assessment and staff decisions. Download its JSON or print the complete saved operator plan. Changes after freezing use **Prepare successor**, preserving the original operation and results.

Definition changes and decisions use the original saved revision. Local unsaved text is retained in the tab and can be downloaded. A newer shared revision exposes a conflict; it does not silently relabel old local decisions as current. Reload saved definitions or decisions explicitly after preserving the local work that should continue.

## Receive actual deployment and recovery outcomes

The original operators execute their existing tools. Retain the returned pipeline/job/deployment, host handover, form-publication result or operator observation as a new complete source. Select that exact original resource under the corresponding step.

Provider success must match the selected connection, project, environment, source commit and actual job lineage. A reported UI success does not override a mismatched or failed native result. Previous rehearsal sources do not establish post-plan execution. Failed and unknown results remain in history; later actual returns append new outcomes.

Receive predecessor steps in their declared order. Each accepted step records the original predecessor-result identities. Record final check observations only after the phase's required successful steps, selecting the complete observation source. Checks bind those actual result IDs. A later changed result requires the affected checks to be reviewed again.

**Begin planned recovery** changes the active phase of the same frozen operation. Its actual isolated restore must belong to the original backup and source roster and occur after recovery starts. Application rollback and Central recovery remain separate declared steps. Accept the phase only when its current exact outcomes and required observations are complete.

## Interrupted requests and source receiving

Before a mutation, the browser retains its complete request, original ID and expected revision. **Check and resume** first reads the saved request. It accepts it only when the action and full original input match, then reopens the actual operation. If no saved request exists, it replays that same request.

For interrupted source receiving, the browser compares the saved source's exact original selection. For uploads it compares kind, name, complete byte length, SHA256 and any original artifact source/job binding. If the source does not yet exist, reselect the same full file; different bytes are rejected before another upload. Do not create a replacement operation to work around an uncertain response.

Local receiving selections, observed-result text and review notes remain attached to the selected operation between refreshes and source uploads. Later local edits made between uncertain attempts remain recoverable when the original saved response is received.

## Handover and native customer receiving

The handover contains the frozen plan, actual operation history, selected complete source references, original request records and received outcomes. Download original files from the source shelf. The existing complete workspace archive retains the database and full original bodies, and the original restore/reopen course preserves later editions and pending source operations.

For the equipped receiving owner, open this exact composed source version on the existing saved workspace and listener. Use the customer's actual configured source and existing host receipts. Complete one real candidate plan through original operator result receiving and the agreed acceptance check, and one recovery continuation using an actual isolated restore return if that is the selected customer course. Preserve the original writer and deployment/restore owners.

Inspect the actual desk at desktop, 390px and 320px; use source receiving, source download, definition editing, revision conflict recovery, decisions, frozen-plan download, full print, actual outcome receiving and reopen. Save the actual images and original result/file identities with the producing source version. Existing source reviews and syntax parsing establish source properties; the equipped course establishes the actual displayed and operated customer version.

## Provider semantics retained

- [Central upgrade](https://docs.getodk.org/central-upgrade/): read all intervening notes; Central cannot be downgraded in place. A multi-version change benefits from rehearsal on the original production clone.
- [Central backup and restore](https://docs.getodk.org/central-backup/): a restore replaces target data and cannot target an older Central version. Current direct backup, external S3 media and Web Form state have separate custody requirements.
- [GitLab deployments](https://docs.gitlab.com/ci/environments/deployments/): rollback creates a new deployment/job and does not rerun earlier artifact-generation jobs.
- [GitLab jobs API](https://docs.gitlab.com/api/jobs/) and [deployment API](https://docs.gitlab.com/api/deployments/): retain actual IDs and statuses. A retry is a distinct native job; accepting a manual job is not deployment completion.
- [GitLab resource groups](https://docs.gitlab.com/ci/resource_groups/): preserve the deployment owner's existing environment coordination.

The repository's Central host is pinned to its actual supported release and image/source roster. A later-version original may be reviewed here, but its actual upgrade/restore execution remains with a host that supports that source. No generic receipt is substituted for the native host outcome.

## Integration surface

`composeCentralReleaseOperations({workspace,store,formReleases,fetchImpl,gitlabConnections})` returns `{operations,extension}`. The managed launcher composes it in the existing warehouse extension callback after form reviews. The model's close wrapper settles receiving work before closing the same original workspace.

Read routes are `/api/release-operations/state`, `operations/:id`, `sources/:id`, `requests/:requestId`, `plans/:id`, `operations/:id/handover` and `files/:sourceId/:resourceKey`. Original file POST streams to `originals/:id?kind=...&name=...`. JSON actions are `receiveGitLab`, `resumeSource`, `createOperation`, `reviseOperation`, `successorOperation`, `decide`, `freeze`, `receiveStep`, `recordCheck`, `beginRecovery` and `acceptOperation`.

All operation writes retain the same request ID and full input, and use revision checks. Source bytes are retained before record publication. Record, decision and request-result publication share the original Store transaction. The source adapter and browser add no independent server, scheduled poller or deployment writer.

## Complete inherited rendered-delivery instruction

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

