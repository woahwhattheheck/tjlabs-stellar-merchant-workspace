# Retained STAM asset build

This is the asset-specific continuation of `DATACOVE-STAM-ASSETS-5403-20261012`. It uses the unchanged pinned builder `db63569e695cb6230efb77237293eb59c6e95d73` and input `ed2488c2767b1769f48cb55c5889f654b45bb1d8`. It does not install or operate FROST, PostGIS, a seller, a buyer or a second map implementation.

## Original observed attempt

The first actual native foreground was 68849. Its materialization verified all seven original source/helper leaves and returned original native record `/dev/datacove-stam-assets-5403/native/77d2d9db0734e5ff81d3532ef551a0fb9bb7a920441ad600d2023e9c33f26eaf`, state `queued_disk`, supervisor alive and no child. The connection was then lost. A later actual read found that invocation-local record absent; neither shared memory nor disk ledger retained a matching STAM operation. No asset return was found in the original account. Those observations do not establish that the dependency install or compilation completed.

The complete original observation travels as `ORIGINAL_ATTEMPT.json`. Do not create substitute request, process, completion or result files for the lost record.

## Storage and execution

`run_retained_stam.py` uses the existing `swarm_cloud_job` and `ForegroundLaunch` from the selected immutable host. It receives one byte-length-prefixed JSON source packet over its original TTY, verifies every Git blob, parses every Python module, and preserves original source before invoking admission.

The business operation remains unchanged. Its native continuation is `DATACOVE-STAM-ASSETS-5403-20261012-RETAINED-CONTINUATION`.

* Persistent source, native records, worker metadata and sealed output: `/workspace/scratch/5403360e55a4/datacove-stam-native`.
* Invocation-local dependency/build work: `/dev/datacove-stam-assets-5403-retained`.
* Existing Node: `/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node`.
* Original shared memory/disk/runtime-consumer providers remain authoritative.

Planning declarations are 1,536 MiB memory plus 128 MiB reserve, 1,024 MiB private work and 20 MiB shared control/output, 80,000 private/3,000 shared inodes, with 4 MiB and 128 inodes of filesystem reserve. The shared budget covers a strictly bounded 16 MiB sealed archive, approximately 0.2 MiB selected source and the original native/return records. These are explicit bounds for this placement, not measured build peaks. The original build still caps Node old-space at 640 MiB and uses its original restrained package concurrency. Admission is not bypassed when the shared filesystem cannot satisfy these bounds.

## Preserve the sealed result before return

`retain_stam_build.py` keeps the original package builder unchanged and runs it without its optional interactive return flags. The original builder creates the complete success or failure ZIP and its exact size/SHA receipt.

The wrapper:

1. Retains immutable source, input, runner and operation bindings on shared storage.
2. Records the start binding before dispatch and the actual subprocess exit after return. Immutable records contain no freshly generated timestamps; actual timing is emitted separately in the original native log. A fully written original terminal, copy-identity or final-receipt part can be promoted, while an incomplete or absent outcome remains unresolved and never automatically replays a build.
3. Retains the original sealed artifact identity before copying bytes.
4. Copies only the exact original archive. An interrupted copy may resume only when its entire retained prefix matches the same original file; a complete partial is verified before rename. Missing source or changed bytes produces an explicit unresolved outcome.
5. Syncs the completed archive and its receipt onto shared storage, then invokes the original hosted-artifact retention helper with unchanged business return identity `DATACOVE-STAM-ASSETS-5403-20261012-RETURN`.

After a return interruption, the same wrapper reads the retained archive and verifies its binding and every byte. It resumes the original return operation without rebuilding. Existing completed native records are not replayed through `resume-capacity`; the native owner uses the maintained original continuation semantics after observing the actual record state.

## Complete artifact and browser handoff

The artifact remains `STAM_0e414_Leaflet_1_9_4_Complete_Browser_Assets.zip`. It includes all actual output assets, original build logs, the exact upstream source members, original build input/programme, and the actual success or failure result. The generated browser manifest includes every selected STAM ESM dependency, original Leaflet UMD/CSS-relative assets, exact licence notices and CSP hashes for the original style text. A failed archive is evidence of the actual failure, not a successful asset build.

Root joins the actual successful manifest/assets into the existing SensorThings commissioning source. SCF's map and 0C7A's provider/native workflow keep their existing identities and owners.
