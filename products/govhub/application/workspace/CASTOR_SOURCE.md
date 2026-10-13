# Complete native Castor source receiving

This helper accompanies the existing GovHub Castor operation. The existing Castor adapter selects and runs the application's actual tasks through its original Session. Source capture reads that selected native project and produces one complete private archive for the selected capture phase.

## What is retained

Each capture includes the full original Git bundle, refs, HEAD archive, staged and unstaged binary patches, current index listing, exact tracked/untracked worktree bytes and recursively initialized submodules. The submodule's actual checkout HEAD remains distinct from the parent index gitlink, so a deliberately changed submodule checkout remains visible. Index conflicts and unavailable submodules need explicit operator attention.

Original Compose files, Castor entrypoint, release PHAR/binary/configuration files, recovery input files/directories and task output files/directories are retained exactly as selected. Directory identities use the same canonical complete list of file path, byte length and SHA256 as the native provider. Directory archives additionally retain directory modes and empty directories. Selected files may be Git-ignored; unrelated ignored caches and host secrets are not copied implicitly. The actual selected Castor executable is retained separately with its original bytes and mode, including when it lives outside the project.

Docker Compose's original image rows are retained unchanged. Their short IDs are resolved through the selected Docker engine's native image inspection to full immutable image IDs and repository digests. The helper saves those actual full IDs using native Docker image-save and retains the complete resulting tar bytes. An explicit image selection uses full IDs or repository digests; an empty selection uses the complete current image cohort reported by the selected Compose project. A Compose project without created containers may have no current images: that actual empty census remains explicit, and the helper does not pull or build images.

The original provider inventory, Docker engine identity, Compose configuration, native commands, complete stdout/stderr and command receipts remain archive members. The helper adds archive, manifest and each command file through the existing Session. The provider carries those same actual artifacts into its completed result and full GovHub handover.

## Source selection and phases

The caller supplies the original profile and inventory:

- Existing site_root, Git/Docker/Castor executable paths and optional existing PHP launcher.
- Original environment_id, docker_context, compose_project and castor_context.
- Full actual source_revision, relative castor_file when applicable, ordered compose_files_json and explicit release_files_json.
- source_images_json containing explicit immutable images or an empty array for the native Compose cohort.
- task_outputs_json with complete path/role/kind records.
- backup_inputs_json with original path/role/kind/SHA256 records; kind defaults to file.
- Existing timeout_seconds and max_artifact_bytes.

The helper adds capture_phase equal to capture, before or after. Each phase receives its own immutable selection, command labels and source directory even when Git HEAD is unchanged. Only before may use allow_missing_task_outputs=true; a missing pre-task output is recorded as absent. An after capture retains the actual newly produced output without running the original task again.

The source target declares environment_id, source_revision, capture_phase, castor_file, castor_context, docker_context, compose_project, compose_files, release_files, task_outputs, backup_inputs, original image_selection and canonical image_ids. The image part retains original Compose rows plus each selected value, full inspection, full image ID and repository digests. No display tag is silently treated as an immutable ID.

## Complete package

The outer file is castor-source.zip. Its MANIFEST.json uses schema govhub-castor-source/v1 and contains the exact target, source_revision, complete members with bytes/SHA256/modes, repositories, selected source/output/input parts, image archive details and original command references.

The whole archive, including its manifest and ZIP framing, must fit the original max_artifact_bytes. Overflow retains the original partial capture in ATTENTION rather than marking it complete. Raising the selected intake bound is an explicit original profile/runtime decision; the helper does not omit large files.

The archive is private. It can include complete application data, explicit backup contents, Compose configuration and native command output. Keep it in the existing private GovHub workspace and original authorized project handover. Public application source contains no native archive data or credentials.

The files are acquired at their actual native observation times. Their application/database consistency is established only by the selected original backup task and its actual verification result. Capturing file hashes and Docker images does not assert a transactional database snapshot.

## API

capture_source(session, inventory, selection) returns state COMPLETE with target, source_revision, archive and manifest paths, exact archive_identity, complete files, repositories and parts. It uses Session.command, Session.add and the original checkpoint/state. It creates no second task executor, remote account or operation queue.

verify_source(archive_path, max_bytes=...) validates the complete member set and every byte/hash without extracting files or contacting Docker.

receive_source(archive_path, new_private_directory, max_bytes=...) copies all exact members into a private directory. The original archive SHA binds continuation; a different archive cannot reuse that receiving directory. The original complete package is retained independently of the source host.

reopen_source(session, received_directory, new_checkout_directory) reconstructs original Git refs, detached HEAD, staged changes, exact local files and initialized submodules. It fetches HEAD and detaches the fresh checkout before restoring original branch refs, preserving the initialized branch safety rule. It compares the native final index, status and binary patches with the original retained outputs. It also restores the explicitly selected release/configuration/input/output files and verifies their original hashes. Complete image-save bytes stay in the received package.

A receiving-only Session may use a validated Git executable, the original timeout/max-size values, an empty private host directory and existing relocation mappings. It does not need a fabricated Castor entrypoint or Compose files. Apply the full Castor provider profile only after the original checkout exists.

receive_command_receipt(session, actual_receipt_path) reconciles an interrupted command in that independent source Session. It requires the original argv, working directory, start time, PID, stdin and mutation flag, actual completed exit and complete original stdout/stderr hashes. Both the unchanged incoming receipt and original interrupted record are retained. The enclosing course supplies this through its original request-bound continuation; it does not change the frozen archive or checkout selection. After receipt, call reopen_source again on that same Session. An unknown Git exit is never inferred or replaced by a new task.

Receiving does not load images, start containers, overwrite a live database or invoke a deployment/restore/verification task. Those are separately selected native actions owned by the existing operation. The result explicitly records image_load_performed=false and native_task_performed=false. Later legitimate edits to a completed independent checkout remain the receiving engineer's edits.

## Native continuation and verification

Original command admission and uncertain exit recovery remain Session's responsibility. An interrupted native command resumes by its original record/receipt; it is not relabeled as another task. Private source copies and selection declarations preserve their original hashes. Each incomplete capture rechecks current Git/index/worktree, selected original outputs, Compose configuration/cohort and Docker engine against its retained inventory before it can finish.

Keep the full application, actual Castor/Docker/Git runtime identities, selected profile and original source archive together. Use the complete Castor receiving course for actual source capture, original task/verification result, backup, separate application/workspace reopen and rendered product inspection. Source parsing alone does not establish a completed native commissioning.

## Primary source contracts

- Docker image-save: https://docs.docker.com/reference/cli/docker/image/save/
- Docker image-inspect: https://docs.docker.com/reference/cli/docker/image/inspect/
- Docker Compose images: https://docs.docker.com/reference/cli/docker/compose/images/
- Castor v1.8.1: https://github.com/jolicode/castor/tree/058feddafd0b977eebf33364d02cd553ae26854a

The authored helper is Apache-2.0 as part of GovHub. Original separately retained Castor and other upstream sources keep their original licenses.
