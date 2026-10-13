# Receive the original POTS deployment in GovHub

`capture.php` runs immediately after the existing POTS deployment in its original PHP CircleCI job. It packages the selected checkout inputs, installed POTS source, original native command results, and exact Pantheon site/environment observations into a stable artifact directory. GovHub receives the directory through that job's native CircleCI artifact records and joins it to the existing operating project.

The capture uses the job's installed Terminus and active session. The original POTS scripts keep deployment, approval, backup creation, and content synchronization ownership. The collector's native job/run/workflow records provide the corresponding CircleCI execution state.

## Install the capture source in the existing project

Copy the complete received `pots/capture.php` into a tracked project path such as `.circleci/govhub-pots/capture.php`. Preserve its source hash and the complete application source manifest in the project handover. The capture also stores its own exact executing PHP source in every completed artifact directory.

Use the PHP executable already present in the deployment job. The capture requires PHP8.1 or later with JSON, hash, process and filesystem support. At the reviewed upstream POTS source, the deployment jobs use `cimg/php`, default PHP8.4, and default Terminus4.3.2. The capture records the executable, full file SHA256 and actual version output. The GovHub operator's separate pinned Terminus4.3.3 bridge belongs to the operating host; this post-deployment job continues with its installed POTS toolchain.

One native installation check is sufficient:

```bash
php -l .circleci/govhub-pots/capture.php
php .circleci/govhub-pots/capture.php --help
```

Then add the capture step and artifact step to each selected existing deployment job. Keep its current executor, approval dependencies, installed source, credentials and original deployment command.

### Development and multidev job

The reviewed upstream job is `deploy_to_pantheon`. Its original `deploy-to-pantheon-env` invocation receives `environment: dev`, but the original POTS setup/deployment scripts select the actual `TERMINUS_ENV` for development and multidev work. Add these steps after that command:

```yaml
- run:
    name: Capture the original POTS deployment for GovHub
    when: always
    command: |
      php .circleci/govhub-pots/capture.php \
        --project-root "$PWD" \
        --output-dir /tmp/artifacts/govhub-pots \
        --site "$TERMINUS_SITE" \
        --environment "$TERMINUS_ENV"
- store_artifacts:
    path: /tmp/artifacts/govhub-pots
    destination: govhub-pots
```

The capture step can observe a failed original deployment as well as a successful one. Its `COMPLETE` state describes the completeness of this capture. The CircleCI job and the original native observations retain the deployment outcome.

### Test job

The reviewed upstream job is `deploy_to_pantheon_to_test`. Append the same two steps after its existing `deploy-to-pantheon-env: environment: test` command, passing the literal selected target:

```yaml
- run:
    name: Capture the original POTS test deployment for GovHub
    when: always
    command: |
      php .circleci/govhub-pots/capture.php \
        --project-root "$PWD" \
        --output-dir /tmp/artifacts/govhub-pots \
        --site "$TERMINUS_SITE" \
        --environment test
- store_artifacts:
    path: /tmp/artifacts/govhub-pots
    destination: govhub-pots
```

### Live job

For `deploy_to_pantheon_to_live`, add the step after its original `deploy-to-pantheon-env: environment: live` command and pass `--environment live`. Its original approval and POTS production-backup/deployment sequence stay in the current job. The released `scripts/pantheon/deploy-to-live` calls its native database backup before the native live deployment.

Test and live are explicit because the shared `TERMINUS_ENV` exported during setup may still name another environment. The native test/live scripts target their respective literal environment. The capture must observe the same target.

The complete executable is already part of this application. Projects that generate CircleCI configuration should add these steps in their maintained source for the corresponding jobs, then retain that generated configuration through the original CI source/receiving route. The artifact includes both the original project's `.circleci/config.yml` and the installed POTS `config.yml`.

## Exact CLI selection

```text
php capture.php
  --project-root ABS_CHECKOUT
  --output-dir ABS_DEDICATED_CAPTURE_DIRECTORY
  --site ACTUAL_SITE_NAME_OR_UUID
  --environment ACTUAL_NATIVE_ENVIRONMENT
  [--pots-root vendor/fourkitchens/pots]
  [--terminus terminus]
  [--php php]
  [--workflow-id ORIGINAL_PANTHEON_UUID ...]
  [--all-workflows]
  [--source-file .circleci/EXACT_SOURCE_FILE ...]
  [--capture-id ORIGINAL_CAPTURE_ID]
  [--run-id ACTUAL_CIRCLECI_RUN_UUID]
  [--project-id ACTUAL_CIRCLECI_PROJECT_UUID]
  [--workflow-id-ci ACTUAL_CIRCLECI_WORKFLOW_UUID]
  [--job-id ACTUAL_CIRCLECI_JOB_UUID]
  [--source-revision ORIGINAL_CHECKOUT_SHA]
  [--timeout-seconds 120]
  [--max-output-bytes 16777216]
```

The default `terminus` and `git` names resolve through the existing job's PATH. An absolute executable path is also accepted. `--php` runs a selected readable Terminus PHAR through the chosen PHP executable; omit it for the already executable native Terminus installation. The runtime metadata identifies each selected/resolved executable and its actual bytes.

`--source-file` adds an exact project-owned `.circleci` file to the captured source. Use it for deployment/build overrides called by the project's original CI configuration. For example, a project's additional `.circleci/scripts/build-release` can be selected with that exact relative path. Default original overrides are already included when present.

Repeated `--workflow-id` flags select actual previously created Pantheon workflows. The capture observes each explicit UUID's native status and operations. It also stores the native site workflow catalog. The default catalog scope is the native command's most recent100 site workflows; `--all-workflows` asks that command for all available native pages. The selection metadata states which scope was read. Every selected UUID is compared to the native returned UUID and environment.

A site workflow's timing alone does not assign it to the POTS deployment. The application retains the original job/target/source mapping and explicit workflow selections for the receiving engineer.

## CI identity

The raw `ci` map contains only these selected nonsecret variables when present:

```text
CIRCLE_WORKFLOW_ID
CIRCLE_WORKFLOW_JOB_ID
CIRCLE_JOB_ID
CIRCLE_PIPELINE_ID
CIRCLE_PROJECT_ID
CIRCLE_SHA1
CIRCLE_BUILD_NUM
CIRCLE_JOB
CIRCLE_PROJECT_REPONAME
CIRCLE_PROJECT_USERNAME
CIRCLE_BRANCH
CIRCLE_TAG
CIRCLE_REPOSITORY_URL
```

The current official CircleCI reference documents `CIRCLE_WORKFLOW_JOB_ID` as the current job identifier, `CIRCLE_WORKFLOW_ID` as the workflow instance, `CIRCLE_PIPELINE_ID` as the execution/pipeline identifier and `CIRCLE_PROJECT_ID` as the project identifier. `CIRCLE_JOB_ID` is retained only if supplied; it is not used as the automatic normalized job ID. The documented original repository URL is retained exactly when it has no credential-bearing URL components. SSH's ordinary `git@host:path` form is supported.

The capture creates this explicit mapping:

| Normalized field | Observed source | Optional explicit input |
| --- | --- | --- |
| `ci_identity.run_id` | `CIRCLE_PIPELINE_ID` | `--run-id` |
| `ci_identity.project_id` | `CIRCLE_PROJECT_ID` | `--project-id` |
| `ci_identity.workflow_id` | `CIRCLE_WORKFLOW_ID` | `--workflow-id-ci` |
| `ci_identity.job_id` | `CIRCLE_WORKFLOW_JOB_ID` | `--job-id` |
| `ci_identity.source_revision` | `CIRCLE_SHA1` | `--source-revision` |

Unknown values remain JSON null. An explicit value must agree with an observed value for the same field. The field's origin is stored in `ci_identity_sources`. UUIDs remain UUIDs; a build number or pipeline-definition ID is not substituted for an execution ID.

Current CircleCI documentation distinguishes checkout source, configuration source and trigger/event source. The collector therefore retains separately the run's event revision, this capture's CI source revision, the current Git checkout revision, and Pantheon's native code-log commits. Their relationship is reviewed on the selected release in the original GovHub project. The capture never derives a native built commit from the source repository SHA.

## Original source closure

Each capture preserves these project files if present:

| Source input | Required for a complete capture |
| --- | --- |
| `composer.json` and `composer.lock` | Yes |
| `.circleci/config.yml` | Yes |
| `pantheon.yml` and `pantheon.upstream.yml` | When present |
| `.circleci/scripts/set-environment` | When present |
| `.circleci/scripts/deploy` | When present |
| `.circleci/scripts/deploy-to-test` and `deploy-to-live` | When present |
| `.circleci/scripts/drush-commands` and `drush-config-import` | When present |
| `.circleci/scripts/sync-from-live` | When present |
| Each explicit `--source-file` | Yes |

The installed `fourkitchens/pots` package is enumerated recursively from the selected checkout-owned `--pots-root`. Its actual source scripts, configuration, Composer package file, documentation and license are retained. The package's lock/installed metadata contributes its actual version and source/dist references. The project's complete original `composer.lock` is the retained package-lock source.

The captured checkout source excludes package dependency caches, version-control internals and explicit credential/cache files. In particular, the upstream deployment's `terminus-cache-key.txt` and its `.terminus` cache are outside the selected source closure. The capture does not execute `scripts/set-environment` or read its generated shell environment. It inherits the original process environment for native commands, and serializes only the explicit CI allowlist.

Every copied file retains its checkout-relative path, exact artifact-relative path, byte count, SHA256 and capture time. The source is hashed again after copying to detect a source that changed during the read; any changed copy remains a retained edition with a corresponding failure. A complete source capture supports up to4096 files,16MiB per file and128MiB in total. These defaults cover the actual reviewed POTS package and ordinary Composer/CI inputs; a limit failure is visible in the same context.

Paths are resolved within the selected checkout. Symbolic-link source entries are identified for review instead of silently importing a second source tree. The output directory is dedicated, private and outside the installed POTS source, so enumerating that package cannot ingest its own capture.

## Native command contract

Commands use an argv array through PHP `proc_open`. Standard input is closed, and the original job's session and working directory are retained. Capture-generated arguments contain no authentication token or arbitrary shell command.

| Command record ID | Native read |
| --- | --- |
| `checkout-revision` | `git rev-parse --verify HEAD` |
| `checkout-source-status` | `git --no-optional-locks status --porcelain=v1 --untracked-files=no --` followed by captured source paths |
| `terminus-version` | Selected installed Terminus `--version --no-ansi` |
| `terminus-actor` | `auth:whoami --format=json --fields=id` |
| `site` | `site:info SITE --format=json` with explicit site identity/framework/region fields |
| `environment` | `env:info SITE.ENV --format=json` with explicit nonsecret environment/runtime fields |
| `code-log` | `env:code-log SITE.ENV --format=json` with timestamp/author/labels/hash/message |
| `backups` | `backup:list SITE.ENV --element=all --format=json` with file/size/date/expiry/initiator |
| `workflows` | `workflow:list SITE --format=json` with original workflow identity/status fields |
| `workflow-status-UUID` | `workflow:info:status SITE --id=UUID --format=json` |
| `workflow-operations-UUID` | `workflow:info:operations SITE --id=UUID --format=json` |

Each selected native Terminus observation also receives `--no-interaction --no-ansi`. The workflow operation read selects its native type/result/duration/description fields. The native site UUID, environment identity and explicit workflow target are compared to the request while their original responses remain intact.

Each command retains original argv/cwd, start and finish times, duration, process exit code, execution state, timeout/output limits, and exact standard-output/standard-error files. A `started.json` record is committed before process creation. Complete output files are flushed and renamed before their final `command.json` receipt is published. The context is checkpointed after every command.

The default per-command deadline is120 seconds and the combined stdout/stderr limit is16MiB. A command exceeding the selected limit is terminated, and the actual received output is preserved with `TIMED_OUT` or `OUTPUT_LIMIT`. The collector can inspect that original result and the selected input without treating a partial native response as a complete JSON observation.

## Artifact ABI

The root file is `context.json`, with schema `govhub.pots.deployment-context/v1`. All referenced file paths are relative to the stable output directory.

| Field | Contents |
| --- | --- |
| `capture_id` | Stable original capture identity; normally derived from the current native job UUID and selected environment |
| `state` | `CAPTURING` during work; final `COMPLETE`, `PARTIAL` or recovered `INTERRUPTED` |
| `started_at` / `completed_at` | Actual UTC capture times |
| `ci` / `ci_identity` / `ci_identity_sources` | Raw allowed values, normalized values, and exact field origins |
| `target` | Explicit original site/environment and observed native site UUID when returned |
| `checkout` | Current checkout revision, command reference and exact original source-status output |
| `pots` | Actual installed package location, selected version/reference metadata and source count |
| `runtime` | Capture PHP version/source and actual native executable/version identities |
| `sources` | Complete captured source file identities and original path mapping |
| `source_selection` | Captured, missing or excluded source selections and required flags |
| `commands` | Original read-only command results and exact output/receipt identities |
| `observations` | Parsed native values linked to their original command output |
| `failures` | Concrete source, native process, JSON or target-selection failures |
| `request` / `request_sha256` | Immutable original capture input and its exact hash |
| `artifact_files` | Every committed source, request and command artifact required by this context |

A native observation has this structure:

```text
{
  command: original command ID,
  status: "OK" or "ERROR",
  data: complete parsed native JSON, or null,
  source: {path: exact stdout file, bytes: integer, sha256: lowercase SHA256}
}
```

The keys `site`, `environment`, `code_log` and `backups` follow that structure. `actor` is an additional original native account observation. `workflows` uses the same base structure and adds `scope`, `selected_environment`, and `selected`. A selected entry contains its explicit `workflow_id`, native `status` observation and native `operations` observation.

An empty native catalog remains the parsed empty catalog. Non-JSON or unsuccessful native output remains in its original files and produces an error observation. `context.json` has no circular self-hash: the collector hashes its exact received bytes, while `artifact_files` identifies its complete committed dependency set. The command result's receipt contains the result before its own receipt identity is attached to the parent context.

The application should bind this root artifact to the actual native CircleCI project/run/workflow/job record and each job artifact's native path. Download the whole listed closure. Compare source hashes against the original file bytes before installing the received release into the operating project.

## Existing output and interrupted capture

The same exact capture request can reopen its existing final directory. The script verifies every listed artifact's bytes and SHA256, prints the retained summary, and returns its original completeness result. It does not replace the retained source or response edition.

A previous `CAPTURING` context without an active capture lock is recovered as `INTERRUPTED`. The original pending command paths and any original `.part` files stay in that directory. A fresh observation uses a new capture ID/output directory; the collector can retain both original editions under the same selected CI job.

A request with a different target, source selection, job identity, runtime selection or capture source hash cannot reuse an old output directory. This prevents a second observation from silently overwriting the original job artifact.

Files are0600 and directories0700. The capture refuses an output directory containing unrelated files. The full artifact directory can be transported privately through CircleCI and received by a second engineer with its relative source/output mapping intact.

## Complete native receiving sequence

1. In the original POTS project, install the complete received PHP file and append the capture/store steps to the existing selected deployment jobs.
2. Run the existing native CircleCI/POTS deployment through its current approvals and original account. Receive the resulting job/run/workflow identities and the `govhub-pots/context.json` artifact.
3. Download every file in that context's `artifact_files` through the same native job's artifact records. Preserve the native artifact rows and full provider response alongside the received bytes.
4. In the current GovHub project, bind the received capture to the exact CircleCI job and the actual native Pantheon UUID/environment. Review the event, CI source, checkout, package, and deployed-code identities as distinct source fields.
5. Join the current Pantheon provider observation and any explicitly selected original workflows to that saved release. Carry native backup files, source versions, application state and recovery choices in the existing whole-project handover.
6. Build and reopen the current complete GovHub source ZIP, create its editable operating backup, and open that backup from the receiving process. Retain the original case/operation identities and the source artifact mapping.

The selected installed host owns the native PHP, package and application receiving interval. The maintained `pantheon_receive.py` continues that same host's toolchain/application journey. Its explicit `--bind-runtime` continuation supplies the receiving host's actual PHP/Terminus/cwd through the singular provider's retained operation.

## Primary source references

- [Reviewed POTS source bf496b2](https://github.com/fourkitchens/pots/tree/bf496b2a63aef5bef3d6f60701889244c030b22a): package `config.yml` blob`3fccf151a865c7c4d983d4060b992c1443e8feee`; `scripts/set-environment` blob`780ff99ea2bb887eb572546904149df2590b5566`.
- [Original Pantheon deploy](https://github.com/fourkitchens/pots/blob/bf496b2a63aef5bef3d6f60701889244c030b22a/scripts/pantheon/deploy), [test](https://github.com/fourkitchens/pots/blob/bf496b2a63aef5bef3d6f60701889244c030b22a/scripts/pantheon/deploy-to-test), [live](https://github.com/fourkitchens/pots/blob/bf496b2a63aef5bef3d6f60701889244c030b22a/scripts/pantheon/deploy-to-live).
- [Current CircleCI built-in and pipeline variables](https://circleci.com/docs/reference/variables/), read2026-10-12; current job UUID, project/run/workflow IDs and distinct checkout/configuration/event sources.
- [Terminus native command source4.3.3](https://github.com/pantheon-systems/terminus/tree/4cd1810ad892157131cec5919baf3036ab457d57/src/Commands): original Site/Info, Env/Info, Env/CodeLog, Backup/List, Workflow/List and Workflow/Info/Status/Operations command declarations. The executed job's actual installed version remains in its capture.
