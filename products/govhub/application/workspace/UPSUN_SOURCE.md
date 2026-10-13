# Complete native Upsun source capture

This module is the source arm of the existing GovHub Upsun provider. It captures the selected original Git project, its current local source changes, one explicitly selected native database and the selected application's writable mounts. Native Upsun snapshots remain provider backups; they are not downloadable archives. The source package is a separate original acquisition with its own identities and times.

## Original native contract

The implementation was read against **Upsun CLI 5.13.0**, release commit **b23a9b1ba51afe1ab18ff7f8283ead4998aa80ed**, published 2026-09-30. This is the current Upsun CLI repository, including its maintained PHP implementation under `legacy/`; it does not imply a Platform.sh/Fixed account alias.

Complete original sources:

- [DbDumpCommand.php](https://github.com/upsun/cli/blob/b23a9b1ba51afe1ab18ff7f8283ead4998aa80ed/legacy/src/Command/Db/DbDumpCommand.php): explicit project, environment, application, relationship and schema; uncompressed native SQL preserves the remote dump exit status without an extra gzip pipeline.
- [Relationships.php](https://github.com/upsun/cli/blob/b23a9b1ba51afe1ab18ff7f8283ead4998aa80ed/legacy/src/Service/Relationships.php): relationship selectors are native names, or the native name.index selector when multiple endpoints exist. A relationship is not merely a database service label.
- [MountDownloadCommand.php](https://github.com/upsun/cli/blob/b23a9b1ba51afe1ab18ff7f8283ead4998aa80ed/legacy/src/Command/Mount/MountDownloadCommand.php) and [Rsync.php](https://github.com/upsun/cli/blob/b23a9b1ba51afe1ab18ff7f8283ead4998aa80ed/legacy/src/Service/Rsync.php): actual mount download uses rsync archive mode; all original files and literal symlinks remain in private tar members.
- [MountListCommand.php](https://github.com/upsun/cli/blob/b23a9b1ba51afe1ab18ff7f8283ead4998aa80ed/legacy/src/Command/Mount/MountListCommand.php): `--paths` returns native mount paths.
- [AppConfigGetCommand.php](https://github.com/upsun/cli/blob/b23a9b1ba51afe1ab18ff7f8283ead4998aa80ed/legacy/src/Command/App/AppConfigGetCommand.php): original config is YAML; the module preserves it rather than treating it as JSON.
- [EnvironmentCurlCommand.php](https://github.com/upsun/cli/blob/b23a9b1ba51afe1ab18ff7f8283ead4998aa80ed/legacy/src/Command/Environment/EnvironmentCurlCommand.php) and [CurlCli.php](https://github.com/upsun/cli/blob/b23a9b1ba51afe1ab18ff7f8283ead4998aa80ed/legacy/src/Service/CurlCli.php): native authenticated GET of `deployments/current`; original headers/body are retained. The module selects `--no-retry-401`, `--disable-compression`, and no verbose/debug output.
- [EnvironmentInfoCommand.php](https://github.com/upsun/cli/blob/b23a9b1ba51afe1ab18ff7f8283ead4998aa80ed/legacy/src/Command/Environment/EnvironmentInfoCommand.php): the single `head_commit` property is a read. No second value argument is supplied.
- [Native snapshot limitation](https://support.platform.sh/hc/en-us/articles/11992296645650-Can-I-download-a-backup): a native backup is not converted into a fictitious downloadable SQL/files object.

## Provider integration and exact selection

`capture_source(session, provider_inventory, selection)` returns the full source result and adds its complete ZIP and manifest through the caller's existing `Session.add`. There is no second operation queue or native subprocess controller. The provider owns inventory, intent and cloud changes. The source helper uses `Session.command` for each actual Git and CLI command, including complete native stdout/stderr, input identity, timeout, process group and interrupted-command recovery.

Required selections:

| Field | Meaning |
| --- | --- |
| `project_id` | Actual Upsun project ID |
| `native_environment_id` | Environment ID without the project prefix |
| `source_revision` | Complete reviewed native `Environment.head_commit` |
| `site_root` | Existing local Git checkout of that exact revision |
| `source_app` | Actual deployed web application name |
| `source_database` | Actual database relationship name, including index when needed |
| `source_database_schema` | Explicit native database schema |
| `source_mounts_json` | JSON array of native mount paths; omitted or `[]` selects every mount on this application |
| `git_path`, `upsun_path`, `ssh_path`, `rsync_path` | Existing executable bindings; ordinary PATH names or actual executable paths |
| `timeout_seconds`, `max_artifact_bytes` | Existing GovHub native command and whole source intake limits |

A complete application with multiple databases needs explicit captures for each database selection. A subset of mounts is recorded as a subset; the package never calls it a full environment backup. A second parent recovery source can be captured with its own actual inventory, environment, app, relationship, schema and revision. No child-to-parent selector is guessed.

Inventory contains the actual `environment` and `current_deployment` objects, with `current_deployment.id`, `webapps[source_app]`, native mounts and full app configuration. The reviewed head must equal the local Git HEAD. Actual deployment ID and environment head are read before and after acquisition and must remain equal. Database and files can still change during their respective reads; the manifest explicitly says `independently_acquired_native_parts`, never an atomic cross-resource snapshot. If the business requires a coordinated quiet window, use the original account's explicit operational procedure and retain that fact alongside the source.

Inactive environments cannot supply live SQL/mount downloads. Their native activate/branch action uses its own inventory/head capability; full source capture runs after the environment is actually serving, or against an explicitly selected existing recovery source.

## Native authentication and private custody

The provider's `api_token_env` is an environment **name**. The admitted Python process reads that value only immediately before exec of the original CLI and maps it to `UPSUN_CLI_TOKEN`. The request, command arguments, manifest and source package contain only the name. With an access-token-only API profile, the existing native CLI session supplies its own normal authentication; an OAuth access token is not passed as if it were an Upsun API token. CLI HOME/session, SSH agent/private keys and token caches remain host configuration and are not copied as environment dumps.

The original source and SQL/mount bytes are private project data. Use the existing authorized cloud workspace and original receiving channel. Do not create owner-device caches or archives. The helper does not upload to any external site or create credentials, VMs or schedules. Two private symlinks select the actual existing ssh/rsync executables for the CLI's normal PATH lookups. Debug output is disabled; original native source responses still remain private.

## What the complete package contains

The ZIP contains an exact manifest, the original provider inventory, complete CLI request records (without credential values), native response headers/body, command argv/stdout/stderr, original deployed app YAML, selected SQL and every mount archive/node manifest.

Each Git repository and initialized submodule retains:

- Full native Git bundle from all refs and HEAD, verified by native Git.
- Tracked archive at the original commit.
- Native refs, index and porcelain status.
- Full binary staged and unstaged patches.
- Complete selected tracked/untracked worktree bytes, modes, literal symlink targets and deleted paths.
- Native ignored-file names as an explicit original observation.

Git-ignored host configuration and generated dependency caches are not silently copied. If a required application input is ignored, make its intended source selection explicit before capture; the original ignored-path list makes that gap visible. Uninitialized or divergent submodules and conflicted indexes produce an actionable original capture error. Non-UTF8 filenames require an explicit native handling path rather than lossy filename conversion.

Mount copies use native rsync `--delete` only against this operation's own private mount staging directory, so a resumed copy cannot retain a stale union of files. No remote deletion occurs. Archive creation preserves literal symlinks without following them. Receivers reject writes through links and special filesystem nodes.

The final ZIP is reopened and every declared member is checked before publication. The complete native package is bounded by the existing intake limit; exceeding it leaves the original operation and source bytes available for a deliberate same-operation limit adjustment.

## Resume and independent receiving

Repeat the original provider operation/profile. Its derived source key includes the exact project, environment, app, database/schema, mount selection and source revision. Complete original command outputs are reused. An interrupted native command remains subject to the existing Session's exact child/reaping rules. Missing or changed completed artifacts cause attention, not fabricated success.

Receive the full original archive into an empty private directory:

```sh
python3 upsun_source.py verify --archive /private/original/upsun-source.zip
python3 upsun_source.py receive --archive /private/original/upsun-source.zip --destination /private/received-source
```

The entire archive is verified before extraction. Each received member is checked independently, and repeating the same archive/directory continues its exact original receipt. The receiving directory retains `MANIFEST.json`, complete original files and `RECEIVING.json`. Outer ZIP members are ordinary files; native tar links are not automatically extracted.

For the existing GovHub receiving course, call:

```python
result = upsun_source.reopen_source(
    original_receiving_session,
    "/private/received-source",
    "/private/independent-checkout",
)
```

Use an existing Session whose `site_root` is an available private receiving directory and whose command output directory is outside the checkout. This imports the actual Git refs/bundles, checks out each original commit, restores the original index and native worktree, and compares the exact native index and binary diffs. Its local Git changes use the same Session mutation admission and unknown-outcome reconciliation. Repeated completed reopening preserves later customer edits and returns the original completed result. The received SQL and mount archives remain exact recovery inputs. This function does not silently import SQL into a live database or overwrite an active deployment.

The original full GovHub application/workspace backup carries the source ZIP and native operation records through its existing export/receive/reopen. Retain original pending operation identity and supply new native host executable bindings only through that operator's normal continuation. Native targets are not relocated by changing source custody paths.

## Actual native and rendered receiving

Source parsing and an intact ZIP do not establish a completed native product. On the original equipped host, run actual Upsun/Git/SSH/rsync version reads, capture the selected real project, inspect the actual SQL/mount and source identities, receive the package independently and run the native reopen. Preserve every original command result and actual host/operation handle.

Before calling the outgoing application, report, demo or export ready, the producing peer must open/run/render the exact outgoing edition, look at its real screens or screenshots, and operate important controls. Inspect wide and narrow layouts where relevant, populated/empty/loading/error states, complete downloads, private export and independent reopening. Capturing images without viewing them is insufficient. Fix unreadable, clipped, unstyled or broken output within the original product, using readable tables, clear hierarchy, restrained controls and consistent spacing. Code review, DOM counts, HTTP200 and another peer's approval do not replace seeing the actual product. Continue useful implementation while this exact original native receiving operation proceeds; do not create a separate gate, watcher, broad suite or competing dispatcher.
