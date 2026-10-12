# Complete installed federal-awards source archive

This is the complete 36-file carrier for the existing
`SCF-USASPENDING-AWARD-TRANSACTIONS-64B7-20261012` operation.
It continues the original root, merchant, and source Applications outputs through
the canonical selected builder, runtime installer, and managed Applications.

The original source is pinned to `a8ebea9d6f08086db7ec7d2ee62dc26dadb273d8`; the product joins and
complete source carrier are merged in PR233 at `03046324fca76bc788366e86cff2c3ac88b12d8f`.
The complete receiving recovery helpers are merged in PR254 at
`9f7cdf080d88f2cb2e6275b59cdf07c1fe14f227`.
The archive contains all 1,836 retained original source files, full Git tree and
commit metadata, and the original receiving implementations. These original
source bytes were independently verified against their Git blob and tree IDs.

## Receive every original byte

The complete ZIP is 7,205,397 bytes. Whole ZIP SHA256:
`54bcf6f2dad815e0559aad0ab78db9697ee8dbda11cbabf2fea85eb44c868216`.

The nine binary parts are at most 850,000 bytes each so Git file content reads
return every byte. Use the original filenames and order in
`archive-transfer.json`. A Git content tool should request `encoding: "base64"`.
Retain the returned base64 content as `PART_NAME.b64`, then run:

```sh
python3 assemble-installed-source.py \
  --manifest archive-transfer.json --directory SOURCE_PARTS \
  --base64 --extract NEW_PRIVATE_SOURCE_DIRECTORY
```

If the original parts are already binary files, omit `--base64`. The assembler
checks each part, the whole ZIP, every member's CRC, size, and original Git ID.
It creates the complete ZIP and extracts all 36 files under
`NEW_PRIVATE_SOURCE_DIRECTORY/federal-awards-installed/`. Original matching
files can be received again; a different retained source is reported directly.

## Continue the same receiving operation

U12 owns the original root → merchant → source Applications receiving.
F12's installed continuation consumes that one complete original directory,
including `original-source-packet.json`, `native/`, `mcp-native/`, and
`applications-source/`.

```sh
python3 NEW_PRIVATE_SOURCE_DIRECTORY/federal-awards-installed/receive-installed.py \
  --packet NEW_PRIVATE_SOURCE_DIRECTORY/federal-awards-installed/source-transfer.json \
  --directory SAME_ORIGINAL_ROOT --node EXISTING_NODE
```

Use the original Node 22.16+ executable, Python 3.11+, npm, and Git supporting
`--no-lazy-fetch`. The original installer supports retained npm caches and
matching Node headers through `--cache`, `--node-headers`, and `--offline`;
`--adopt-existing` uses its original dependency graph receiver.

The command runs the actual Git object receiver and selected builder, prepares
and installs the full native profile, requires READY with original source
inspection, executes the installed USAspending command, and completes managed
workspace launch, close, reopening, and first launch of a new workspace.

The original source, installation, logs, lock, operation, and result remain in
`SAME_ORIGINAL_ROOT/installed-federal-awards/`. Managed application outputs
remain in `SAME_ORIGINAL_ROOT/applications-managed/`. The completed receiving
archive includes the original operating outputs and installed source/profile/
lock; the producing host retains its actual dependency graph. A receiving host
can install that same graph through the original lock and installer.

This carrier was assembled from the exact published originals and decoded in
full before publication. Native execution results belong to the continuing
original U12/F12 operation.

Large base64 bodies should be streamed as data to an existing native process,
not embedded in a shell command argument. A command argument can hit the host's
argument-size limit even when the complete file-content read succeeded. A
native stdin receiver can accept each original part and write its `.b64` file
before invoking the assembler. On a PTY, disable echo and canonical input before
sending long records. Keep this same source-producing process alive until the
assembled ZIP and resulting output have been retained on its ordinary filesystem.
