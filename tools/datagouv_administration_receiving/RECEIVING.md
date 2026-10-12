# Data.gouv Linux administration receiving

This directory contains the complete receiver for the original
DATACTIVIST-LINUX-ADMIN-018A-20261012-01 operation. It carries the selected complete
application into a Linux administration environment, operates the maintained
installer, and preserves the whole result even when an administration step fails.

It does not run the public-data acquisition, the publisher's customer exercise,
a browser, a system service, or a data.gouv API write. Those are separate original
operations. The receiver renders the existing production service unit for review.
An administrator can use the production guide to commission that service after
the receiving result is accepted.

## What is selected

The original preserved artifact contains the exact 177-file predecessor and
182-file application capsules. Their full raw JSON identities and inventory
identities are in SOURCE_SELECTION.json. They remain in every successor,
together with the original operation record and original release receipts.

The 182-file inventory omitted seven existing static dependencies. PR499 adds
those exact dependency paths and produces the 189-file inventory. Packaging a
177- or 182-file archive demonstrates its byte integrity; it does not demonstrate
that its native entry point can initialize. A fresh installation therefore
initializes the selected complete current edition. It does not try to initialize
the historical 177 release first.

PR499's exact source head f21a832148266fca295e1113ba3be2c5b8c64b26 contains the earlier
administration source, even though current main subsequently retains PR493's
mapped-account preflight. The receiver preserves the supplied capsule unchanged,
then applies only the two exact, occurrence-checked PR493 amendments if their
known preimages are present. A different administrator or guide is a conflict.
The amended complete capsule gets its own byte/hash selection and source
reference. No source hash is presented as if it were the hash of different bytes.

For a current or later complete edition, supply all four of:

* The absolute local path of the complete raw customer-source JSON capsule.
* Its exact full byte length.
* Its complete lowercase SHA-256.
* The exact source revision associated with that capsule.

The capsule must use datactivist.customer-source.v1, provide complete UTF-8 content
and byte/hash pins for every member, and exactly match its own
products/datagouv/application-files.json. It must retain every original 182 path,
include the seven known dependency paths, and preserve the reviewed
administration source after the exact correction. An inventory count alone is
insufficient. No download, unsigned source substitution, package installation or
dependency installation occurs in receive.py.

This source does not invent a complete189 capsule hash. SOURCE_SELECTION.json
records the observed PR499 inventory and revision separately from the still
caller-selected complete capsule.

## Requirements and ownership

Use the existing accepted Linux administrator/receiving owner. Do not launch a
second instance of the original publisher programme to run this receiver.

The host needs:

* Linux and Python 3.10 or later with the standard library.
* Node 24 or later with node:sqlite, at an actual absolute executable path.
* The existing util-linux flock executable.
* An existing mapped unprivileged service account. A passwd entry alone does
  not establish that its UID and primary GID exist in the current user namespace.
* Administrator authority to create the selected managed installation and give
  the workspace to that service account.
* Persistent space for the exact source, native release archives, workspace
  backup, receiving evidence and complete result ZIP.

The production administrator checks the current UID/GID maps before creating
an installation. A container that maps only UID/GID 0 cannot complete service
commissioning with another passwd account. SERVICE_ACCOUNT_UNMAPPED means that
no installation or workspace was initialized. Keep the complete saved artifact
and move this same pre-install operation to an accepting host where the selected
unprivileged identity is actually mapped. A root service is not a substitute.

The root selected with --root must have an existing ordinary parent, use no
symlink path component and be owned by the invoking administrator. The receiver
creates it with mode 0755. Source/operator directories are 0755 with 0444 source
files. Control, evidence, source capsules, upload journals and history are 0700;
their ordinary private files are 0600. The maintained administrator creates the
service-owned 0700 workspace parent and keeps its own administrator-owned source,
control files and locks. Source parents must be traversable by the selected
service account; do not broadly relax unrelated filesystem permissions.

Every invocation holds root/control/receiver.lock. The same file descriptor is
inherited by operate.py and its native administration subprocesses. A lost
calling transport does not transfer ownership while an original child still
holds that lock. The maintained installer additionally enforces its own
administration and workspace locks. A busy lock is retained with its owner.

## Source closure

Keep these five files together:

| File | Purpose |
| --- | --- |
| receive.py | Artifact intake, exact source preparation, same-operation invocation and durable result packaging |
| operate.py | Native pack, preflight, selected-edition install or actual existing-workspace upgrade, backup, restore and readback |
| SOURCE_SELECTION.json | Original source pins, exact preflight amendment and supported optional preservation-helper pins |
| SOURCE_MANIFEST.json | Exact complete receiver source identities |
| RECEIVING.md | This operating and recovery guide |

receive.py verifies all four manifest-listed source files before using them.
The manifest excludes itself to avoid a recursive hash. Retain the containing
Git revision as the authoritative source selection. These receiver files live
outside the customer's fixed application inventory and do not silently change
its member count.

## Prepare the complete original selection

Select the exact existing receiving artifact, its hash and size. The original
v0 package is 1,296,091 bytes, SHA-256
b14bff25681e4108eac987b2bad18913733ca2ba952ea739e91af9f3e5577103.
A later artifact must be selected using its actual returned identity.

The following example has deliberate input placeholders. Replace them with
actual retained values; do not execute the placeholders as source identities.

~~~sh
python3 -B /opt/datagouv-receiving/receive.py \
  --package /srv/inbox/administration-receiving.zip \
  --package-bytes ACTUAL_PACKAGE_BYTES \
  --package-sha256 ACTUAL_PACKAGE_SHA256 \
  --root /srv/datagouv-receiving/original-operation \
  --node /opt/node-v24/bin/node \
  --service-user datagouv \
  --port 8429 \
  --handoff-reason "Original pre-install operation accepted by this existing Linux owner" \
  --after-source-capsule /srv/inbox/current-complete-source.json \
  --after-source-bytes ACTUAL_CAPSULE_BYTES \
  --after-source-sha256 ACTUAL_CAPSULE_SHA256 \
  --after-source-ref EXACT_SOURCE_REVISION \
  --prepare-only
~~~

Preparation verifies the whole ZIP, bounds and names every member, verifies both
original raw capsules, checks every file and the complete native inventory,
parses Python source, applies the exact administration amendment when required,
and writes the full selected current source. It also retains the exact original
record and an explicit handoff or pre-dispatch source amendment.

PREPARED is source preparation only. It is not a native preflight, installation,
service start or upgrade result. Preparation without a later capsule preserves
the historical 177/182 source and is useful for custody; that historical selection
cannot be dispatched as a current functional installation.

A retained after-selected capsule is reused with its own complete selection
receipt. The receiver does not silently fall back from that edition to182 when
the same artifact moves to another host.

## Operate a fresh installation

Use the same command, same root and same input identities. Omit --prepare-only.
If this root has a preserved PREPARED attempt, include --resume. On a first
invocation, no --resume is needed.

The original native workflow then:

1. Packages the historical predecessor and selected complete current release.
2. Checks the actual service account, Node/SQLite runtime and fixed loopback port.
3. Initializes the selected complete current release in a service-owned workspace.
4. Repeats the exact install operation and verifies the original result is reused.
5. Opens the selected workspace through a new native process.
6. Saves the complete original workspace/application backup and verifies replay.
7. Restores that exact backup into the maintained receiver, verifies replay, and
   opens the restored workspace through a new process.
8. Renders the production systemd unit and verifies that it was neither installed
   nor started.

A fresh install has no existing initialized predecessor workspace. Its result
therefore explicitly reports upgrade_coverage.status:not_exercised. It retains
the original 177/182 source evidence without manufacturing an upgrade result or
requiring startup of an edition already known to have missing imports.

The native installer journals initialization attempts before creating them.
Partial initialization remains in its original staging attempt. A completed
attempt is sealed with full workspace identity and fingerprint before its
guarded move into place. The receiver uses that maintained logic without
introducing another initializer.

## Upgrade an actual existing workspace

Only select this mode when an existing initialized managed installation is
already available, its service is stopped under its existing owner, and its
native status supplied the exact revision, release and workspace identities.

Add all four arguments to the original receiving command:

~~~sh
  --existing-installation /srv/datagouv-production \
  --existing-revision ACTUAL_REVISION \
  --existing-release ACTUAL_RELEASE_ID \
  --existing-workspace-id ACTUAL_WORKSPACE_ID
~~~

This mode performs an actual native status read and checks all four selection
fields, plus the original user, UID/GID, Node identity and port. It saves the
existing complete workspace first, updates it to the selected different current
release, opens it, restores its exact original backup, and opens it again.

Each backup/update/restore uses the original stable administration operation IDs
and actual expected revision. The final state returns to the original release
and workspace content with the maintained revision advanced by two. Provider
operation, publication and capture counts must match the original baseline.
Existing customer data is preserved; a nonempty workspace is not treated as an
error or a fresh empty example.

The complete native backup is included in the result ZIP under
existing-installation/original-workspace.datawork, with the exact original
receipt/hash. The external managed installation stays at its original path.
This receiver does not move or copy an active external database.

## Handoff and interrupted operation

There are three distinct situations.

**No native administration command was requested.** The exact original input
can receive an explicit pre-dispatch amendment binding its old input digest,
new input digest, reason, record identity and complete source selection.

**Both original releases completed and preflight ended with
SERVICE_ACCOUNT_UNMAPPED.** The explicit runtime handoff binds the raw original
record SHA, old and new input SHA, original operation and retained release
locations. It preserves the prior steps and error before proceeding. The native
Bundle reader verifies every original archive member. Every located predecessor
file must equal the original predecessor release manifest. For a runtime-only
move the later files must also equal the original later release. A selected
source_edition handoff may change only the explicitly pinned later source plus
the permitted runtime/lifecycle selection. It cannot substitute the predecessor
or reviewed administrator.

The handoff is accepted only before the first installation or existing-workspace
request. Original archive names include their inventory hash, and retained
earlier archives have separate names. A later source edition cannot overwrite
the old177/182 package with different bytes.

**Installation or existing-workspace maintenance was requested.** Resume on
the original host and root using its original locks and journals. The receiver
refuses to import such a partially commissioned installation into another root.
Inspect the actual native operation before an explicit same-command --resume.
The driver reuses completed step receipts and the maintained administrator
reconciles its original operation IDs. It does not mint a replacement
installation, backup, update or restore operation.

A lost transport is not a terminal result. If the receiver record says
dispatched and no terminal receipt exists, keep the actual host/root and
original native record. The inherited lock first prevents overlapping children.
Once the original owner confirms that the command has ended, preserve the
observed attempt and use --resume at that same root. A completed native result
with a lost outer response is returned from the original driver record.

A frozen result package is reused unchanged on repetition. To continue a
preserved failed or PREPARED attempt, --resume creates a new receiving-attempt
receipt inside the same operation, after the preceding package is retained.
It does not create a new business or native administration operation. A PASS
result is returned unchanged; it is not run again.

The selected receiver root and input identity are immutable. A later host,
account or source choice uses an explicit pre-install handoff from the exact
preserved artifact, after its original owner releases execution. It is not an
in-place edit to a running receiver's configuration.

## Results and complete preservation

The actual native record is:

~~~
operating/evidence/receiving.json
~~~

It holds the original request inputs, source/runtime amendments, every native
argv, observed stdout/stderr/exit, saved result and retained errors. Each outer
attempt also has its own dispatch and terminal outcome under receipts/attempt-N.
The live receiver state remains in control/receiver.json.

After normal completion or a receiving error, the finally path freezes a complete
selection of the usable source, original artifact, native evidence, release
archives, workspace/backup state and actual result. It verifies every ZIP member
against that frozen selection before accepting the artifact. A saved package
selection and completed ZIP are reused after interruption; a new observation
does not overwrite the first package or implicitly trigger another upload.

The emitted complete_artifact_preserved event contains the authoritative local
ZIP path, full byte length, SHA-256, member count and actual outcome. Read the
outcome:

| Outcome | Meaning |
| --- | --- |
| PREPARED | Complete selected source verified and retained; no native operator dispatched |
| PASS | The selected native install or existing-workspace lifecycle completed with all required readbacks |
| NATIVE_INCOMPLETE | The original native operator returned a nonzero result; its exact error and completed work are retained |
| RECEIVER_INCOMPLETE | Intake, materialization or outer execution failed; usable source and observed evidence are preserved |

Packaging does not promote an incomplete outcome to PASS. The result also
records the actual source file counts and exact current selection. A 189-file
input, a correctly constructed release, and successful native installation are
separate facts.

Partial packaging files and their paths are retained until the selected complete
ZIP has been verified. Do not delete an uncertain original before its exact
source and result are preserved. The receiver does not prune other projects,
caches, databases, runtime dependencies or prior operation records.

## Optional same-item remote preservation

A normal Linux customer receives a complete local ZIP and can return that exact
artifact through its existing approved channel. When the current supported
Library helper is already available to this user operation, add:

~~~sh
  --library-helper-dir /absolute/current-supported-helpers \
  --library-file-id EXACT_EXISTING_LIBRARY_FILE_ID \
  --expected-current-version ACTUAL_CURRENT_VERSION
~~~

All three arguments are required together. The optional source pins are in
SOURCE_SELECTION.json. The helper code is not copied into the Git source or
complete customer artifact. The supported import is exactly:

~~~python
from library_upload import (
    LibraryUploadWorkflow, HostedAppsClient,
    LibraryFileMaterializer, SignedUrlUploader,
)
~~~

The receiver provides an explicit writable state_parent inside its private
control/upload-N directory and calls the unchanged supported workflow with
purpose:replace_library_file, the exact existing ID and the actual expected
current version. The artifact's full byte/hash identity is checked immediately
before that call. The exact save request is written first, and the finalized
native result is preserved separately from the ZIP it describes.

A save request without its returned result is an unknown original outcome.
The receiver stops before another save and retains the original helper state.
Reconcile that exact save through its supported metadata/result workflow before
any new dispatch. It does not create a new remote file, guess a version, reuse
an unrelated upload or silently retry an uncertain replacement.

If the execution environment's /dev filesystem is invocation-local, keep
intake, native operation, finally packaging and supported save in one live
invocation. A path that exists inside one namespace is not proof that a later
process can read it. Durable source publication does not substitute for saving
the actual operating result before that namespace disappears.

## Credentials and service administration

No provider credential belongs in an input capsule, JSON state, command line,
unit file, package, source repository, backup or receipt. The receiver's native
children receive only an explicit runtime PATH, language setting and bytecode
setting. It performs no authenticated data.gouv action.

For authorized later portal work, use the maintained production
products/datagouv/ADMINISTRATION.md guide and its explicit stopped-service
environment-variable route. The current administrator remains responsible for
the service account, selected original installation, trusted reverse proxy,
loopback binding, backup schedule and ordinary operational monitoring. This
receiving workflow creates no additional automation or service schedule.
