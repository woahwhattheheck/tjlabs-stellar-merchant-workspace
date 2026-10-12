# Paid jobs with named output files

This release contains the complete merchant and buyer workflows for paid jobs that return several named files. A job can produce a report, a CSV and supporting material while retaining one accepted price, payment, attempt and immutable result digest. Existing JSON and single-byte-result functions keep their original behavior.

The merchant declares the permitted outputs, including filenames, media types, size limits and required files. The worker packages those outputs using the existing verified archive writer. Merchant reads, buyer downloads and offline receiving check the same completed attempt and result digest before exposing individual files.

Buyers can receive the whole result archive or selected files into their resource library. The complete collection remains available after the customer service restarts. The merchant agent, HTTP, CLI and offline receiving use those same records. The installed Applications workflow opens the original merchant, verifies completed jobs, stops and drains its services, and reopens it in a second managed lifetime.

See the included guides:

- [Declaring, executing and receiving named outputs](../../sf30-seller-sdk/jobs/outputs/README.md)
- [Agent receiving and offline reopening](../../../../stellar-forge/mcp-merchant-operator/PAID_JOBS_RECEIVING.md)
- [Installing a complete source release](../RUNTIME_INSTALL.md)
- [Git object receiving](../GIT_OBJECT_RECEIVING.md)

## Build the selected release

The source selection is named `paid-job-files`. It is a committed recipe consumed by the existing distribution builder:

~~~bash
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo "$repository" \
  --ref "$release_commit" \
  --selection paid-job-files \
  --out "$release_directory"
~~~

Use the exact commit selected for the receiving operation. The repository may be an existing checkout or a bare Git repository. A configured Git promisor remote allows the original source reader to acquire only the selected blobs. The builder records their Git identities, byte counts and SHA-256 hashes in the release manifest.

The recipe selects complete job, customer, library, accounting, approval, agent and Applications components. The original builder follows their static module imports and browser asset maps. Explicit component and support declarations retain Python modules, example applications, configuration, native receiving helpers and other inputs addressed dynamically by those programs. It does not infer the application from a list of recently changed files.

The source archive retains its original repository-relative paths and installed distribution manifest. Those paths let the original CLI, Python imports and application loaders operate from `package/source`. Dependencies live at the installation's own `node_modules` directory.

To reopen a completed or interrupted build, use its existing output directory and original commit and selection:

~~~bash
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo "$repository" \
  --ref "$release_commit" \
  --selection paid-job-files \
  --out "$release_directory" \
  --resume
~~~

A completed build verifies and returns its existing archive before reading Git or invoking npm. An offline build uses only objects already available in the same source cache; a missing object remains an explicit receiving error.

## One installation for the complete native journey

The existing native driver accepts `--source-selection paid-job-files`. This mode applies to a completed-core receiving operation with the full file and Applications continuation selected. Omitting the flag retains the driver's full-checkout behavior.

For this mode, retain the selected commit, repository, operation ID, original completed-core archive and its expected digest in the native controller's request. Select the actual Node, npm, Python and browser paths from the receiving host. Then include the following options in that original foreground invocation:

~~~bash
python3 cloud-native.py \
  --workspace "$job_directory" \
  --out "$job_directory/results" \
  --source-repository "$source_repository" \
  --source-commit "$release_commit" \
  --source-selection paid-job-files \
  --capsule "$completed_core_archive" \
  --sha256 "$completed_core_sha256" \
  --input-mode completed-core \
  --retained-directory "$job_directory/completed/sf30-paid-jobs-CKQrif" \
  --approval browser \
  --output-files \
  --applications \
  --validation-operation "$job_operation" \
  --node "$node_executable" \
  --node-version "$node_version" \
  --npm "$npm_executable" \
  --browser-module "$playwright_module" \
  --browser-executable "$chromium_executable"
~~~

Keep `native_selection.py` beside the selected standalone `cloud-native.py`, together with the original completed-core helpers required by that driver's source. A complete repository or installed source package already provides this layout. The browser module, browser executable, Git, `flock` and OpenSSL are actual host runtime selections. They are not downloaded or replaced by the source-selection helper.

The selected path performs these existing operations in order:

1. Retain the selected repository, commit, recipe and runtime choices before acquiring source.
2. Create a private bare Git source cache. Fetch the commit with `blob:none`, then use its original Git reader to obtain the ten build and installation toolkit files.
3. Build the committed application selection with the existing distribution builder.
4. Prepare one original runtime installation from that archive and verify the complete extracted source before invoking any customer or checkout program from it.
5. Install the original native and schema dependency profile, including the selected Stellar SDK pin. Verify the source, profile, dependency lock, imports and native readiness.
6. Receive the original completed core and run the customer, file, resolution, accounting, agent and output-file workflows from that same installed source.
7. Reopen the completed source build and the existing READY installation for Applications. This stage requires the installer's `reused` result and the original installation identity before starting its two merchant lifetimes.
8. Drain the original owners and preserve the completed state, result files, logs, screenshots and receiving receipts through the operation's existing artifact delivery.

The first new customer and checkout fixtures select the installed source from the outset. An earlier completed fixture is never relabelled as if it had run from that installation.

The same native controller continues to own admission, cancellation, process lifetime, the operation record and artifact transport. Source selection adds no second job, scheduler or execution route.

## Retained state and recovery

The job directory contains:

| Path | Purpose |
| --- | --- |
| `source-selection.json` | Immutable repository, commit, recipe, runtime executable and dependency-profile choices |
| `source-selection-state.json` | Original acquisition, build, preparation, installation and recovery receipts |
| `source-repository.git/` | Git's private source object cache |
| `source-toolkit/` | Exact original build and installer modules from the selected commit |
| `merchant-release/` | Original resumable distribution build and complete source archive |
| `applications-runtime/` | One prepared source package and dependency installation |
| `npm-cache/` | The original installer's cache |
| `results/source-selection.json` | Delivery copy of the actual receiving and footprint record |
| `results/applications/` | Original installed Applications receiving and reopen records |

If initial runtime preparation stops before producing a usable installation plan, the receiver retains that directory and records a fresh successor through the original runtime preparation or recovery API. The successor must receive the same source archive and runtime selection. Once executable source has been received, the helper does not move that source to a different installation.

An existing complete installed source is verified against its original archive on reopening. The existing runtime installer retains its kernel lease through npm children, can recover a completed interrupted installation, and checks a READY installation before returning it without another npm command. An interrupted source build continues through the original build lease and exact retained source selection.

Do not change the selected recipe, repository, commit, physical source, input archive or operation ID in an existing run record. A supported original-controller amendment must retain the prior request and history before any changed execution selection is used. A missing original native record or an inaccessible process namespace is a custody problem; it is not permission to register a replacement operation.

## Capacity and completion evidence

The receiving record reports actual source-object acquisition, source-file counts, source bytes, archive bytes and observed filesystem allocation for the Git cache, toolkit, release, runtime and npm cache. Allocation is deduplicated by inode within each measured tree. Each measurement carries any read errors and an explicit completeness field.

These measurements describe the files that actually exist. They do not alter a native memory or disk declaration. The original controller still admits the complete requested workload, including output growth and its reserve. Use a supported resource amendment only after measuring the selected workload and retaining the original request history.

A successful whole run must include all of the following:

- The completed-core result and original payment identity are retained.
- The new named outputs match the declared filenames, sizes, media types and member hashes.
- Buyer HTTP, library, CLI and agent receiving reopen the same immutable job result.
- The source release and dependency installation are the same ones used before checkout.
- Applications verifies the completed jobs across both managed merchant lifetimes.
- Every requested browser view and download is recorded by the original receiving program.
- The final original state and nonempty artifacts are saved with verified transfer receipts after their owners drain.

A packaged source release, a READY dependency installation or a queued native record is an intermediate result. Each has its own retained receipt; none substitutes for the completed job and final artifact delivery.
