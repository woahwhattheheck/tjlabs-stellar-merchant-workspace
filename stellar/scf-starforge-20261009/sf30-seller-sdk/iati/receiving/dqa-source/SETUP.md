# Run the original DQA engine and complete customer receiver together

This is the native setup and lifecycle arm of the IATI/DQA customer workflow. It acquires the exact original Zimmerman engine, installs its frozen Python environment, prepares the original merchant runtime, runs the full customer receiver against that live engine, and shuts down only its owned services.

Run this complete command inside the existing native resource admission. It composes the original application, installer and receiver.

## Full source and installation

Select the complete IATI/DQA application at one immutable Git edition with the original source receiver. The maintained installation entry is:

    node stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/runtime.mjs /ABS/runtime-input.json

The runtime input contains the original repository, sourceRoot, sourceCommit, separate outputDirectory, stable operationId, pythonExecutable and npmExecutable. When the selected full source is already present and the zero-dependency operator profile is used, sourceOffline and dependencyOffline are both true. If the original receiver supplied sourceReceiving, retain that complete selection.

The maintained entry invokes the existing distribution builder, installation preparation, installation, and READY inspections. Its preparation/runtime-ready.json binds the actual runtime and installation directories, source root/commit, distribution and source manifest. The DQA callback consumes that exact result.

## One complete profile

Copy complete.example.json to the private operation input. Replace every /ABS/... locator with the actual selected path. Keep one stable operation_id and private directory. This directory contains the original upstream Git checkout, frozen Python environment, setup records, provider data, and customer receiving outputs.

The python_executable, uv_executable, git_executable and redis_executable fields select already installed executables. Python virtual-environment symlinks and Redis multicall symlinks retain their original invocation paths. If Redis needs an existing library directory, redis_library_directory applies that directory only to its version observation and owned server process.

Select distinct available loopback transport, Redis and API ports. The public source is the documented HTTPS IATI.cloud activity endpoint. Both complete assessments select broad GB-GOV-1. The original engine retains its H1/H2 logic, current-clock cutoff, exemptions, percentages and financial-year semantics.

The authorization_env field is an environment variable name. A supplied value is inherited by both the original engine and customer receiver. If absent, this owning process generates a random local key and retains it only in memory and child environments. The key is not written into profiles, argv, source evidence or setup records.

### Original command vectors

runtime_prepare and callback contain exact executable argument vectors and absolute cwd values. They are passed directly to process creation. The only substitutions are complete argv elements:

| Token | Actual value |
|---|---|
| {operation_directory} | Selected private complete-operation directory |
| {ready_file} | Original retained upstream READY JSON |
| {provider_file} | Original provider-input JSON |
| {assessments_file} | Original full two-assessment input JSON |

READY tokens are available only to the callback. The first resolved callback argv is frozen in callback-binding.json. On a later same-operation continuation, those original paths remain unchanged.

The maintained receiver CLI is:

    node dqa.mjs --input /ABS/dqa-input.json --runtime-ready /ABS/preparation/runtime-ready.json --upstream-ready {ready_file} --provider-file {provider_file} --assessments-file {assessments_file}

Its base input selects the customer directory/outputDirectory, stable operationId, actor, Python, Chromium and Playwright paths. Runtime READY supplies the original installed source identity. Upstream READY supplies the provider, assessment inputs and original source-evidence export command.

The callback profile's operation_id must equal that original callback operationId. Its result_file is the final callback result relative to the complete-operation directory. required_outputs lists actual ordinary files relative to that same directory. The example uses customer/result.json, customer/completed-workflow.json, the complete customer ZIP and both source-evidence manifests.

## Exact upstream and frozen Python environment

The wrapper uses the original public repository:

https://github.com/zimmerman-team/iati-cloud.dqa

It fetches only engine commit 61a5e02420b936a39ebaf79dea7212fc0ce36683. A matching existing private checkout is reused after original remote, HEAD and tracked-source checks. Changed tracked source or another edition is rejected.

Dependencies come from the unmodified original uv.lock:

    uv sync --frozen --no-dev --no-editable --no-cache --project /ABS/upstream-repository --python /ABS/selected-python --link-mode copy

The environment and temporary download/build storage stay inside the declared private operation directory. The original lock is hashed before and after installation. Every tracked upstream Git blob is verified independently. The actual uv version and complete command outputs are retained.

This uses uv's documented frozen synchronization contract: https://docs.astral.sh/uv/concepts/projects/sync/ and https://docs.astral.sh/uv/reference/cli/#uv-sync .

Before services start, the original upstream.py probe checks the actual selected modules, pinned pysolr 3.11.0, Redis version and exact engine commit.

## One provider and one resumable customer workflow

The wrapper runs upstream.py serve and retains complete stdout/stderr plus original process identity. READY is accepted only when stdout matches the original saved READY bytes, the operation and engine match, and the owned provider is alive.

The original customer callback uses that real endpoint for both full assessments. It owns saved profiles, configuration lists, findings/reviews/actions, comparisons, customer package and independent receiving, browser, CLI and MCP. Its source-evidence stage exports each actual capture's complete public query interval. The second interval excludes the first capture's original exchange IDs.

The public transport retains each request, response, headers, raw bytes, timing, closure and failure. H1/H2 source acceptance uses the actual unchanged-native-search queries and complete row counts. The original engine can swallow Solr errors into an empty list; a nominal successful DQA HTTP response is therefore joined to its real source-evidence result.

After the receiver has completed its own browser/Applications/MCP cleanup, the parent sends SIGTERM to its provider. The provider performs its owned API/transport/Redis shutdown and writes stopped.json. The wrapper verifies that original stop record and the ended process before publishing COMPLETE.

## Same-operation recovery

Every command retains a selected argv/cwd, process identity, complete logs and actual wait outcome. The wait outcome is stored separately from log fsync/hash/completion publication. If those later writes fail, the original recording can finish without losing or inventing the process exit.

A definite log-open or Popen failure is recorded as NOT_STARTED and can continue the same command preparation. Missing process metadata alone remains uncertain: an owner may have disappeared after process creation. That case uses the original native controller's identity reconciliation.

The first callback selection remains frozen across provider restart. The wrapper verifies the restarted endpoint, authorization environment name, exact engine/source/runtime and shared source journal against the ORIGINAL READY selection, then invokes the same saved callback argv. It does not replace the original READY file.

The original callback's selection.json and progress.json retain requests before dispatch, completed native capture results, source-evidence stages, file offsets and original Applications IDs. Its own continuation reuses completed captures and resumes incomplete stages. A complete-workflow candidate remains a candidate until the callback reconciles its original Application shutdown and publishes the final result.

When the callback's final result is already COMPLETE, the wrapper independently checks its exact operation ID, every full regular-file descriptor and complete customer handover. It then finishes the retained provider shutdown and wrapper publication without invoking the callback again. The completed result's receiver file, full outputs and upstream stop record are also verified on a subsequent read.

An active retained callback/setup process prevents another owner. A live retained provider is stopped only after checking its original PID/start/boot identity and process group. If an ended provider lacks its own child-shutdown record, the same native provider is reconciled before restarting; unknown shutdown is not relabeled complete.

### PID namespaces

Current Popen IDs are resolved through the matching PID namespace and NSpid mapping. Retained identities contain the canonical procfs PID, start ticks, boot ID, PID-namespace identity, procfs view and actual local PID. Later liveness checks read that retained canonical identity directly, even when the reader has a different local PID namespace.

Signals to a current Popen child use its actual local process group. A retained provider signal first verifies the same caller namespace and its exact local mapping. If a later caller cannot address the original namespace, the original native controller supplies that owning-context continuation.

The Linux contracts are documented at https://man7.org/linux/man-pages/man5/proc_pid_status.5.html and https://man7.org/linux/man-pages/man7/pid_namespaces.7.html .

## Capacity and existing runtime custody

Run the complete wrapper through the maintained native start/foreground interface. Retain as consumed runtime the original host source, full application/receiver, selected Python/uv/Git/Node/npm, existing Playwright/Chromium, and original Redis binary/libraries.

Declare the whole additional writable workload:

- Frozen Python environment and temporary installation storage.
- Original Git objects and selected source, distribution and runtime.
- Redis cache/AOF and both full public source-response intervals.
- Verified evidence copies, customer workspaces, original case and complete receiving ZIPs.
- Browser images and full CLI/MCP/log/manifest outputs.

The receiver's initial planning estimate is approximately 512 MiB of writable storage, excluding upstream/setup/public-source originals. Actual file sizes are retained by the completed operation. The upstream transport permits complete raw replies up to the configured limit; the number of activities alone is not a reliable output-size estimate.

When the operation is stored on tmpfs, use the maintained additional memory/storage contract: a process-only memory estimate plus the full declared tmpfs growth, or a measured whole-operation included peak. Keep original shared ledgers and reserves. Free filesystem space alone does not establish available joint memory/disk capacity.

## Complete retained output

The callback result schema is stellar-forge.iati-dqa-operator-receiving.v1, state COMPLETE, with original operationId and selectionSha256. Its files array contains absolute original path/bytes/sha256 descriptors. customerHandover identifies the complete receiving ZIP and its member inventory. The wrapper verifies all of these before its final publication.

The wrapper result.json records its operation/profile/source identity, original and live READY paths, actual upstream stop record, complete receiver result descriptor, required output hashes and command outcomes. Original source, cache, public exchanges, setup logs and customer output remain in the selected private operation for normal native receiving and recovery.
