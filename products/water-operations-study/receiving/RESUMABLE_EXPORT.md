# Complete export that survives runtime interruption

The ordinary buildWaterOperationsStudyExport API remains complete and synchronous. createWaterOperationsStudyExportJob adds resumable progress for the same source population, paths, JSON bytes, exact originals, manifest and ordinary ZIP.

## Receiver sequence

1. Recover and verify the complete existing compact input checkpoint and exact installed source commit. Use its verified compact-input SHA-256 as options.verifiedInputSha256. Water's complete45 input is e34088ed7acfcf98080549920a358936becfd0db8e9c836fe7538ce5d84dacac; Fleet's whole35/36 input is retained in its receiving manifest.
2. Supply the same production dependencies used by the existing complete exporter. Source inventory content hashes, installation/state/carrier identities, request and edition ID order, implementation version and verified input digest bind the job.
3. Create the job with options.checkpoint when resuming. ZIP restore verifies each prepared payload's size/CRC and full path constraints. The receiver must verify the durable checkpoint parts' bytes and SHA before passing the parsed checkpoint, as for its existing complete source/workload checkpoints.
4. Call job.run({maxGroups:1,maxMilliseconds:25000}) or an appropriate group batch. A group is a complete source file, working artifact, current source export, retained branch/study export, emergency export, request or managed edition. These progress limits never reduce the final population.
5. At a successful group boundary, persist job.checkpoint(). Save compressed payloads as individually sized/hash-verified chunks; reuse unchanged payload chunks from the prior checkpoint and publish a new metadata index only after every new chunk is durable. Do not repeatedly upload the entire prior payload bank.
6. Continue until run().done. Persist the completed checkpoint, then call finish() and perform the existing full ZIP member/readback checks. The completed checkpoint can regenerate the same ZIP without repeating any source factory.

A reset loses only progress since the last durable source-group checkpoint. Restoring skips completed group factories; it does not recompute or recompress their outputs. A failed or interrupted source group cannot produce a new valid checkpoint: restore the previous completed checkpoint and retry the actual source problem.

## API

createPreparedExportJob(groupFactory,{zip,zipOptions,identity,checkpoint,manifest,observeEntry}) is the reusable group engine. The group iterator yields {key,create}; create returns a complete [{name,value}] entry array. value is exact text, Uint8Array bytes, or a JSON value serialized with the existing two-space/newline convention. Group keys and order must remain stable for the same exact input.

job.run returns done, completedGroups and archive statistics. job.checkpoint returns schema commons.complete-export-job.v1, the exact identity, completed group cursor, complete member byte/SHA manifest and commons.prepared-zip.v1 archive. job.finish requires all groups complete.

The caller-supplied verifiedInputSha256 is the digest of the independently verified complete receiving input; it is not a substitute for verifying changed input bytes. Root's whole886-source verification covers fresh-job restore, skipped factories, exact byte output, every decoded member, changed identity/cursor rejection and complete-checkpoint finalization. The installed Water/Fleet receiver owns full application workload execution and durable chunk persistence.

## Fleet integration

Preserve Fleet's original file names, product schemas and emergency schema. Apply the same group engine and factory conversion to its existing exporter; do not globally rename fields in retained source records. Use Fleet's exact verified complete input SHA and unchanged live source dependencies. The common prepared ZIP writer is unchanged.

## Retained historical inventory

Version v2-inventory adds zero-output inventory groups to the same complete job. Each original study reference is reconstructed and hashed once, then its ordered hash/reference catalog is retained in checkpoint.metadata. Branch headers provide study_ref and history directly from the already verified compact archive. Restoring a later group reads those small headers and the saved catalog; completed study/branch factories are not expanded again. The current source group's factory alone reconstructs its needed full branch/study. Source paths, bytes, distinct-study ordering and the export manifest remain identical to the original complete exporter.

Iterator advancement and source-group validation are part of the same interruption boundary. Any exception poisons the live job; run, checkpoint and finish reject it. Restore the last durable completed checkpoint before retrying. A generator failure cannot be mistaken for a clean end of the complete source population.


Run the installed complete receiver with `node receiving/run-resumable-export.mjs --input-manifest /absolute/manifest.json --input-root /absolute/repository --output /absolute/export-directory`. Repeat that command after interruption to resume verified, content-addressed source groups. The output retains every checkpoint object, the complete ZIP and its exact member readback receipt.
