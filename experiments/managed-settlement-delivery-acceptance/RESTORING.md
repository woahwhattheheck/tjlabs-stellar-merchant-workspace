# Restore the original merchant-delivery continuation

This helper restores the saved output of operation
**SCF-MANAGED-SF98-DELIVERY-E49D-20261012** from the original
`merchant-delivery-continuation/v2` archive. It restores data only. It does not
start a job, installer, worker, merchant, browser, or application.

Use Linux and Python 3.11 or newer. No third-party Python package is required.

## Restore command

Use the archive SHA256 and the exact `originalOutput` printed by the completed
receiving controller. Obtain the helper from this pinned source or use the exact
`RESTORE.py` supplied with that archive after checking the delivered archive
against its independently retained SHA256.

```sh
python3 -B /absolute/restore-continuation.py \
  --archive /absolute/merchant-delivery-continuation.zip \
  --expected-sha256 THE_CONTROLLER_RECORDED_64_HEX_SHA256 \
  --output /the/exact/original/output
```

When using the archive's copy of this same source, replace the script path with
`/absolute/RESTORE.py`. The three flags and their meaning remain unchanged.
An output path selected for convenience is refused: it must equal the manifest's
original absolute path exactly.

Close the original receiving operation and its application owners before restoring
their state. The helper serializes participating restorers on the output parent's
directory lock. This is not an application shutdown mechanism.

## What is verified

Before creating directories or writing output, the helper reads the complete
archive and verifies:

- The externally recorded archive SHA256, exact format, original operation and
  original output path.
- Unique and complete membership: the listed output entries plus exactly
  `CONTINUATION.json`, `RESTORE.py` and `RESTORE.md`.
- Both helper files against their recorded source paths, UTF-8 byte lengths,
  SHA256 values and Git blob identities.
- Every retained file's bytes and SHA256, every Unix ZIP type and permission mode,
  explicit parent directories, and the literal contents of each link.
- Existing output entries for matching types and identical file bytes or literal
  link targets. Parent paths are opened without following symbolic links.
- Every retained link and link chain stays within the original
  `installation-receiving` subtree, including existing target components.

Only regular files, directories and the recorded internal installation links are
accepted. This Linux helper preserves ordinary permission bits; an archive with
special set-user-ID, set-group-ID or sticky bits, or nonstandard symlink modes is
refused before writes.

## Partial restore and repeated use

Missing files are streamed into private temporary files in their destination
directory. Their bytes are checked again, permissions are applied, and data is
flushed before atomic publication without replacement. Existing identical files
are reused. A differing existing file, link or entry type is refused.

Empty directories and retained directory permissions are preserved. The helper
temporarily enables owner access while filling an owned directory, then restores
its recorded permissions from the leaves upward. Exact existing file bytes with
different ordinary permission bits receive the recorded mode; mode changes through
existing hard links are refused. Symbolic links retain their literal relative or
original absolute target. Directory traversal never relies on those links.

A repeated command with the same archive and original output is supported after
an interrupted copy. Already restored entries must still match. Unlisted existing
files are left in place, and changed application state is never overwritten.
The helper has no replacement or deletion switch. A conflict therefore requires
the original owner to select the correct continuation or retain the changed state
separately before retrying. A forced process kill may leave an unreferenced private
temporary file; it is never treated as a completed retained entry.

Successful output is one JSON result with `status: "RESTORED"`, the archive hash,
original operation/output, entry counts and `applicationsStarted: false`.
The helper verifies the restored entries and modes before returning success.
A failed command returns nonzero with `status: "RESTORE_FAILED"`; a valid partial
restore remains safe to inspect and retry.

## Continue the same operation

Restore the exact original source checkouts separately, at the absolute paths
recorded by `originalSourceRoot`, `originalCampaignSourceRoot` and the source
identities in `CONTINUATION.json`. This helper neither downloads source nor edits
those paths, request bodies, workspace IDs, runtime IDs or receipt bindings.

The entire phase-owned selected installation is retained in the archive, including
its package resources, dependency tree, internal links, modes and empty directories.
The original installation phase must still inspect the actual installed source
and loadable dependencies before handing its READY binding to Applications.
A restored receipt alone is not an installation or application PASS claim.

Resume through the original receiving controller and its saved operation after
source restoration. Preserve the managed, direct, installation, Applications and
campaign receipts. The controller owns all execution and returns the actual
receiving results.
