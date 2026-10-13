# Portable Object recovery bundles

This module transfers the complete encrypted SF101 bundle produced by the original standalone Object-session recovery engine. It preserves the original record digest, full Object-session identity and optional Support lineage. It does not snapshot a running session, restore a state root, initialize a managed workspace, acquire data or make a payment.

## Complete operation

1. Select an existing successful Object recovery request in the SF101 workspace. Its original review and evidence supply the expected recovery-record SHA-256 and complete native Object-session identity.
2. Export the complete encrypted bundle. The original SDK independently verifies the retained copy before the transport archive is published.
3. Transfer the resulting recovery.tar and its SHA-256 to the receiving host. The passphrase stays in its separate environment custody.
4. Declare that private archive and a new bundle destination in the receiving host's trusted profile. Structural inspection reads every archive byte, checks all member digests and exposes the original identity and lineage without using the passphrase.
5. Receive with that exact archive SHA-256, record SHA-256 and complete native Object-session identity. The original SDK verifies the extracted bundle, then the receiver publishes the complete directory without replacing an existing target.
6. Open the same operation after an interruption or lost reply. It resumes the retained edition or reopens the already published, owned destination. The existing original Object recovery restore command remains the explicit subsequent action.

Support attachment is optional. A standalone zero-cap Object session can use the whole flow without commissioning terms or a Support case. When the existing Support producer attaches this archive, it uses the actual saved case revision and original SF49 source-delivery service. One complete archive remains one native source file.

## API

Import from recovery-bundle.mjs:

- exportObjectRecoveryBundle({directory,bundle,expectedRecordSha256,objectSession,lineage,passEnv,environment,runtimeDirectory,signal})
- inspectObjectRecoveryBundle({directory,archive,expectedArchiveSha256,signal})
- receiveObjectRecoveryBundle({directory,archive,expectedArchiveSha256,expectedRecordSha256,objectSession,bundleOut,passEnv,environment,runtimeDirectory,python,signal})

The directory is a private retained subdirectory of the original transfer or request. Each operation has its own directory and an immutable selection. Reopening with a different selection fails instead of changing the original request. The original host queue owns the operation and cancellation. A Linux kernel flock protects its retained files from a second process.

The bundle is the original encrypted native bundle directory. The archive is a normalized absolute private regular file. The bundleOut is a new absolute destination under an existing private parent directory; browser input never supplies it directly. The operation directory, source and destination must not contain one another.

The objectSession is the entire original native identity, including its original session and directory, definition/configuration digests, source intent and URL, delivery mode, bytes/chunks, expected snapshot/digest and limits. The receiver compares the whole value with the original SDK verification result, without projecting it down to only a session ID.

Optional lineage contains workspaceId, profileId, requestId, reviewHash, requestSha256, caseId and caseRevision. Standalone fields may be null. Lineage identifies the originating request; it is not a new Support case or an authorization to change one.

The default passphrase environment variable is SF88_BACKUP_PASSPHRASE. The environment is passed to the original SDK without being written to the transfer. The runtimeDirectory defaults to the adjacent original SF88 operator runtime.

Receiving also uses Linux libc renameat2(RENAME_NOREPLACE) through the explicitly selected Python 3 executable (default /usr/bin/python3) for atomic publication. This small, waited-for process cannot overwrite even an empty destination created between inspection and publication. It starts no service or background worker.

## Return value and retained evidence

Every successful operation returns:

- schema: stellar-forge.sf101.object-recovery-transfer-result.v1.
- operation: export, inspect or receive, with the corresponding explicit status.
- archive: the exact local path, byte length and SHA-256.
- manifest: schema, transport manifest SHA-256, original record SHA-256, full native Object-session identity, lineage, original file count and byte count.
- recordSha256 and objectSession, also at the top level for caller selection.
- authenticated: false for structural inspection; true for export and receiving.
- verification: the immutable full native SDK result's path, length and SHA-256, or null for inspection.
- report: the immutable full report's path, length and SHA-256.
- bundleOut for receiving, and reopened when the same completed operation is opened.

The original native result includes both its completion report and process outcome. It is saved in full before the transfer interprets the record and Object identity. A failed SDK verification with a result also saves that entire result and exposes its file identity on the error. Publication subprocess failures retain their full bounded process outcome. An error after publication does not silently delete the destination; reopening the same retained operation resolves the actual state.

A reopened result retains the original successful cryptographic verification. It checks the full retained archive and, for receiving, every published bundle member and the exact private ownership receipt. It does not label that reopened result as a newly executed native verification.

## Archive format

The archive is uncompressed canonical USTAR:

1. recovery-transfer.json: exact UTF-8 transport manifest.
2. export-verification.json: the complete original exporting SDK result.
3. Every original native bundle directory and file below bundle/, including manifest.json, every cipher object, the capture marker when present and any prior transfer ownership receipts.
4. Exactly two zero blocks end the archive.

All original member paths, types, byte lengths and SHA-256 values are enumerated. The original encrypted manifest and object bytes are preserved exactly. Unknown regular files within the declared limits are retained, not silently omitted.

Unrepresentable paths, symlinks, hard links, devices, PAX entries, duplicate names, missing parents, undeclared members, inconsistent sizes, nonzero padding and trailing bytes fail inspection. Member names are bounded printable ASCII paths with no traversal; native cipher paths already fit this format.

This module does not replace SF101's scrypt, AES-256-GCM, manifest authentication or full decrypted-record verification. Structural hashes establish the received transport edition. The original recovery SDK independently authenticates its encrypted contents and original absent-ledger/session rules.

## Streaming and disk use

Cipher files are streamed in at most 1 MiB chunks. No archive or multi-gigabyte cipher is buffered in memory. The transport manifest and native verification result are bounded metadata.

The original engine's limits remain authoritative: at most 9,500 source entries, 2 GiB per source file and less than 4 GiB of original source data. The transport permits at most 11,000 bundle entries, 4 GiB plus 32 MiB of retained bundle bytes and a 4 GiB plus 64 MiB archive. These allowances carry manifests and ownership records; they do not increase the native snapshot limits.

Export retains a complete encrypted copy and the complete archive in addition to the caller's original bundle. Receiving retains its complete archive and one extracted bundle. Provision local disk for those complete editions and the original verifier's temporary decrypted contents. Native verification removes its own temporary contents; this module does not remove the caller's original backup or successfully received bundle.

All retained directories are private, canonical, owned by the current user and free of symlink components; files are private, regular and single-linked. Downloaded files must be placed under the declared private host directory with mode 0600.

## Interrupted operations

Export records the immutable selection first, copies and authenticates one retained edition, then writes its complete archive. An incomplete owned copy or archive can be reconstructed from the same original selection. Once the retained copy is complete, later changes to the caller's source do not change the edition being exported.

Receiving retains and validates the original archive before extracting. A stage beside the destination allows a single same-filesystem publication. The operation records its publication intent and successful native verification before publishing. A unique private receipt inside the bundle binds that destination to this exact operation, archive and original Object identity. It is preserved by later exports.

An existing unrelated destination is never emptied or overwritten. Cancellation before publication leaves the retained transfer available for the same queue's resume action. Cancellation or a failed reply after publication is resolved by reopening that same operation, checking its ownership receipt and all original members.

## Integration and validation status

The module joins the existing SF101 local request queue, trusted host profiles, browser/CLI and optional original SF49 Support attachment. It creates no new server, remote control channel, scheduled task or hosted CI workflow.

Source composition includes a syntax parse and focused review of archive bounds, complete-member preservation, original SDK identity binding, private publication and same-operation recovery. A native run must report the actual archive, original SDK outcome and receiving result from its executing host; source review alone is not a native execution result.
