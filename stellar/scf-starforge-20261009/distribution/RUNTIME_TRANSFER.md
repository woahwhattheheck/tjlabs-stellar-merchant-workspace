# Transfer a ready runtime to an offline host

Move an existing Starforge runtime's original release and exact dependency selection to another operator host. The receiver reconstructs the selected source and public npm package archives, populates its own cache, and installs through the maintained [runtime installer](RUNTIME_INSTALL.md). The original source, profile and dependency lock remain the inputs throughout.

The same workflow is available through `starforge runtime-transfer` and the Runtime Workspace. Use the current maintained toolkit to receive an older original release. The installed merchant's own commands continue to come from that selected release.

## What the transfer contains

| Retained input | Meaning |
| --- | --- |
| `source.tgz` | Exact archive from the selected original runtime. |
| `runtime-profile.json` | Original feature selection, exact dependency declarations and host requirements. |
| `package.json` | Original generated dependency package for that profile. |
| `package-lock.json` | Exact accepted transitive dependency lock from the ready installation. |
| `artifacts/<sha256>.tgz` | Original public npm tarballs selected by the lock, deduplicated by their retained bytes. |

The exported `manifest.json` identifies those files, their byte lengths and SHA-256 values, the npm integrity values, the original runtime identities, the complete payload digest and an ordered list of parts. Its schema is `stellar-forge.runtime-transfer.v1`. Each part has an index, filename, offset, byte length and SHA-256.

Send the exact manifest bytes and the declared parts. With the default `parts` storage, the part files are in `parts/`. With `files` storage, the original files generate those same parts through the existing download API or the `download-part` command. A part is at most 8 MiB; the default maximum complete payload is 2 GiB. The parts are segments of the file payload, so keep the manifest's filenames and indexes. They are not individual compressed archives.

The transfer covers the selected release and its public package dependencies. Merchant configuration, wallets, database contents, provider credentials, saved business requests, private registry packages and operating-system tools continue through their existing installation and backup workflows. An npm source transfer carries the original package archives; a native image is handled by [the image workflow](runtime-workspace/IMAGE_OPERATIONS.md).

## Choose storage for the transfer

A new export or receiver accepts `--storage parts` (the default) or `--storage files`. The choice belongs to that directory's retained request. Omit the option when resuming to use the recorded choice; a legacy directory without a storage field remains in `parts` mode. An explicit conflicting choice is rejected.

| Mode | Sending directory | Receiving directory after completion |
| --- | --- | --- |
| `parts` | Original package archives and metadata, plus all declared part files. | All declared parts and all reconstructed original files. |
| `files` | One complete set of original files, including its own retained `source.tgz`; parts are generated on demand. | One complete set under `files/`; duplicate part files are retired as their full file coverage is durably reconstructed. |

Both modes use the original v1 manifest, file hashes, payload hash, part indexes and part hashes. A files-mode sender can serve a parts-mode receiver, and the reverse also works. Storage does not change package selection, installation identity or the original installer.

In files mode, reconstruction verifies each original file, syncs its content and publishes it before retiring any covered part. The part must also finish its own hash check and close its read descriptor. An interrupted reconstruction can regenerate retired parts from the already-published files and continue using the remaining physical parts. Existing complete files are checked and reused without writing another copy. Repeated part uploads still consume and check their input.

An open generated download uses at most one part's temporary bytes (up to 8 MiB) and the normal streaming buffer. Its native file descriptor owns those bytes until the consumer closes it; the temporary pathname is removed before the handle is returned. Concurrent downloads each have that requirement. The receiver initially accumulates its incoming parts. During reconstruction, its extra file space is bounded by the largest original file plus one part, rather than another entire payload. npm's cache and the separately installed runtime keep their own existing storage requirements.

Inspection reports the transfer's chosen `storage` and each part's current `storage` (`parts` or `files`). `--verify` hashes the available bytes in either mode. Keep the original files and manifest when retaining a files-mode carrier; an empty `parts/` is expected after receiver completion.

## Use the receiving host's existing tools

Use the original installer's Linux host requirements: Node.js 22.16 or later, Python 3.11 or later, npm and util-linux `flock`. A selected profile can require a newer Node version. The selected runtime's `host` and dependency declarations identify that requirement.

Choose real absolute paths whose parents already exist. Keep three distinct locations: the sending runtime, the exported transfer, and the receiving transfer. Prepare the new runtime outside the receiving transfer directory. The commands create private final directories for the current operator; use their returned paths on later calls.

For source-checkout operation, the command entry is:

~~~sh
node /absolute/maintained/source/stellar/scf-starforge-20261009/distribution/runtime-transfer-cli.mjs --help
~~~

The following examples use `starforge runtime-transfer`, the installed alias for that same command. Substitute the actual retained paths and digests supplied by your own operation.

## 1. Review the original installation

~~~sh
starforge runtime-transfer review \
  --runtime /srv/starforge/runtimes/merchant-01
~~~

Review reopens the original runtime inspector, checks its complete source and recorded lock, and returns the selected source, profile, package and dependency inventory. The sender must be an unchanged original `READY` installation. If its original inspector reports a changed lock, source or native binding, complete its existing installation recovery before exporting it.

The response includes:

- `runtime`: original installation ID, source commit, package name/version and archive/profile/package/lock hashes.
- `selection`, `host` and `dependencies`: the original profile and its requirements.
- `inventory`: every retained lock location, distinct public artifacts, bundled locations and concrete unsupported entries.
- `ready`: whether this reviewed inventory can use the transfer format.

Use `runtime.lockSha256` as the exact `--expect-lock` value during export. This binds the export to the installation you reviewed.

The supported npm locks are version 2 or 3 with an explicit `packages` inventory. Public tarballs must resolve to credential-free HTTPS URLs on `registry.npmjs.org` and have a supported integrity value. Bundled and optional locations remain identified. A local link, Git dependency, private or other registry location is returned as a specific unsupported entry; its original source is not silently substituted. Keep the selected lock unchanged and use that dependency's original distribution route.

## 2. Export from the populated source cache

~~~sh
starforge runtime-transfer export \
  --runtime /srv/starforge/runtimes/merchant-01 \
  --directory /srv/starforge/transfers/merchant-01 \
  --cache /srv/starforge/npm-cache \
  --expect-lock EXACT_REVIEWED_LOCK_SHA256
~~~

Export uses the explicitly selected cache in offline mode by default. For each distinct locked public package it asks npm for that exact tarball, verifies the lock's integrity value, retains the original bytes, then streams the complete file payload to calculate the declared parts. In `parts` mode it also writes those part files; in `files` mode it retains the complete original files and calculates the identical part descriptors without another payload copy. It does not repackage the installed dependency folders.

If an approved connected sending host needs to fetch a missing public tarball, select `--online` when creating its export. This enables the exact public-registry acquisition; it does not change the accepted lock or dependency versions. An existing export binds its offline/online mode, cache path, part size and storage choice. To change one of those selections, create a new transfer directory while retaining the prior incomplete export. `--npm` selects an existing npm executable. `--part-bytes` accepts 65,536 through 8,388,608 bytes.

An interrupted export retains its source/profile/lock binding, completed package receipts and progress. Repeat the same export with the same final transfer directory and original inputs to continue it. A changed bound input is an explicit conflict.

Finish with a full part read:

~~~sh
starforge runtime-transfer inspect \
  --directory /srv/starforge/transfers/merchant-01 --verify
~~~

Retain the returned `manifestSha256` and `manifest.transferId`. The sending state reaches `COMPLETE` when this source carrier is complete. That state describes the exported data, not a receiving installation.

Provide the receiver with `manifest.json`, its exact SHA-256 and the declared `part-00000.bin` style files. To retain complete files and generate an offline part from them:

~~~sh
starforge runtime-transfer export \
  --runtime /srv/starforge/runtimes/merchant-01 \
  --directory /srv/starforge/transfers/merchant-files-01 \
  --cache /srv/starforge/npm-cache \
  --storage files

starforge runtime-transfer download-part \
  --directory /srv/starforge/transfers/merchant-files-01 \
  --index 0 \
  --file /srv/starforge/downloads/part-00000.bin
~~~

Use the actual indices from the returned manifest for subsequent parts. The destination's parent must exist. `download-part` publishes the complete verified part atomically, reuses an identical existing destination and rejects a conflicting existing file. It works for both storage modes. The existing authenticated Runtime Workspace download endpoint also supports either mode. Keep the manifest bytes unchanged: reformatting its JSON changes the expected manifest digest. The receiver can obtain parts in several transfers and resume after an interrupted download.

## 3. Receive and reopen the same transfer

With all currently available part files in one directory (add `--storage files` for a new receiver that should retire duplicate parts during reconstruction):

~~~sh
starforge runtime-transfer receive \
  --directory /srv/starforge/receiving/merchant-01 \
  --manifest /srv/starforge/downloads/manifest.json \
  --sha256 EXACT_MANIFEST_SHA256 \
  --parts /srv/starforge/downloads/parts
~~~

The receiver verifies the supplied manifest digest before accepting its identity. It imports the available missing parts by the exact declared names. Missing files stay visible in the result; an intact cohort is reconstructed and its private cache is populated automatically.

Reopen that same receive directory with the same manifest and digest after a lost response. The original transfer ID stays bound to the directory.

To deliver a particular part separately:

~~~sh
starforge runtime-transfer receive-part \
  --directory /srv/starforge/receiving/merchant-01 \
  --index 0 \
  --file /srv/starforge/downloads/parts/part-00000.bin

starforge runtime-transfer inspect \
  --directory /srv/starforge/receiving/merchant-01 --verify
~~~

Use the actual part's index, filename and digest from the manifest. Inspection returns each part's status and explicit `missingParts` and `invalidParts` indexes. With `--verify`, available parts are hashed from their physical part files or complete retained original files. Exact repeats reopen the same retained part.

After all parts are available:

~~~sh
starforge runtime-transfer complete \
  --directory /srv/starforge/receiving/merchant-01
~~~

Completion checks the whole payload, reconstructs only the declared file set, verifies each original file and npm package integrity, and populates `RECEIVER/cache` through explicit npm cache additions. It retains per-artifact cache progress for the same continuation.

Use `complete --files-only` when the immediate handoff should reconstruct the original files without populating the cache. The result is `RECEIVED`; a later ordinary `complete` continues to `CACHE_READY`. Keep the immutable source cohort available even after cache population: npm's cache is a working cache, while these original files and manifest are the retained transfer.

## 4. Install at its final runtime path

~~~sh
starforge runtime-transfer install \
  --directory /srv/starforge/receiving/merchant-01 \
  --runtime /srv/starforge/runtimes/merchant-received-01
~~~

The transfer completes and checks its received files and cache, then calls the original preparer and installer with `offline: true`. It supplies the original archive, selection and exact lock in a new final runtime directory. The retained lock makes the original installer use its existing `npm ci` path with the maintained installation flags.

The result contains `status`, `transferId`, `manifestSha256`, `runtimeDirectory`, the retained transfer installation `record`, and the original installer `result`. Successful installation is followed by the original full source/import/native readiness inspection and exact lock comparison.

Add `--prepare-only` to stop after the original `PREPARED` state. Later, repeat the same transfer `install` with the same target and the same Python/header binding to perform installation. `--python` and `--npm` select the already available executables.

### Native dependencies use the receiving host

For a selected native SQLite dependency, the maintained installer prepares and operates the original binding for the receiving Node version, module ABI, operating system and architecture. The sending host's ready binary is not part of this tarball transfer.

Offline SQLite source preparation needs the original host compiler tools: Python, make, a C/C++ compiler and matching local Node headers. Supply a matching existing header prefix when needed:

~~~sh
starforge runtime-transfer install \
  --directory /srv/starforge/receiving/merchant-01 \
  --runtime /srv/starforge/runtimes/merchant-received-01 \
  --node-headers /srv/toolchains/current-node
~~~

The prefix contains the original `include/node` files, including `node_version.h`, `config.gypi`, `common.gypi`, `node.h` and `node_api.h`. The installer checks their Node version and ABI. Its offline path invokes the supported package's original source-build command without invoking the network prebuild downloader. The original installation log and native preparation state explain missing or mismatched host inputs.

Choose those host inputs before the first transfer installation request; they form part of the retained request binding. A successful dependency receive does not declare a native binding ready. See [Native SQLite preparation and restart](RUNTIME_INSTALL.md#native-sqlite-preparation-and-restart) for the original behavior and readiness operation.

## 5. Recover and hand off the installation

For an interrupted npm/native stage, inspect the original runtime and continue the same target through the same transfer install command. The original installer's kernel lease, attempt log and retained lock decide whether to adopt completed work or continue preparation. Keep an active installation's lock and original operation intact.

If preparation did not commit a usable runtime plan, recover its retained intent into a new final directory:

~~~sh
starforge runtime-transfer recover \
  --directory /srv/starforge/receiving/merchant-01 \
  --from /srv/starforge/runtimes/merchant-received-01 \
  --runtime /srv/starforge/runtimes/merchant-recovered-01
~~~

Supply the same required `--python` and `--node-headers` selections for the receiving host. Recovery checks that its previous runtime belongs to this original transfer, then delegates to the maintained new-directory recovery operation. It does not replace the previous directory or create a second merchant request.

Once the returned status is `READY`, use the original command to inspect and run that installation:

~~~sh
starforge runtime-install inspect \
  --dir /srv/starforge/runtimes/merchant-recovered-01 --load --source

starforge runtime-install run \
  --dir /srv/starforge/runtimes/merchant-recovered-01 -- source
~~~

Open the actual runtime in [Runtime Workspace](runtime-workspace/README.md). Its existing deployment handoff supplies both `sourceRoot` and `dependencyRoot`. The original managed release workflow owns adoption, activation and rollback. Keep those absolute runtime paths when handing them to the host or image operator.

## Read the state at the correct stage

| State or result | Completed work | Continue with |
| --- | --- | --- |
| Export `PACKAGES` / `PARTS` | Original dependency acquisition or part writing is in progress. | Repeat the same export inputs and directory. |
| Export `COMPLETE` | Manifest and complete source carrier exist. | Send exact manifest and declared parts. |
| Receive `RECEIVING` | Manifest retained; some parts may be missing. | Inspect and deliver the identified parts. |
| Receive `RECEIVED` | Original files reconstructed and verified. | Complete cache population. |
| Receive `CACHE_READY` | Received package cohort has populated this receiver's cache. | Install into a new runtime directory. |
| Runtime `PREPARED` | Original archive, profile and lock are prepared. | Original offline installation. |
| Runtime `READY` | Original installed source, dependency lock, imports and selected native binding passed readiness. | Original merchant/deployment operation. |

The receive result's `complete` field describes its declared parts. The original installation result is the authority for runtime readiness.

A manifest mismatch means the supplied bytes do not match the selected manifest SHA. A part hash or length mismatch identifies the exact part to obtain again from its original source. Keep the manifest, its state and any conflict result; if immutable existing bytes conflict, use a new receive directory with that same manifest instead of changing its recorded identities.

## Application API

The CLI and workspace call the same functions from `runtime-transfer.mjs`:

| Function | Purpose |
| --- | --- |
| `reviewRuntimeTransfer({ runtimeDirectory })` | Original readiness, source/profile/lock and supported package inventory. |
| `exportRuntimeTransfer({ runtimeDirectory, directory, cache, expectedLockSha256, storage, ... })` | Original cache acquisition and a streamed immutable carrier in the selected storage mode. |
| `beginRuntimeTransferReceive({ directory, manifest, manifestSha256, storage })` | Bind exact manifest bytes and the initial storage selection to the receiving directory. |
| `receiveRuntimeTransferPart({ directory, index, file })` | Receive one actual declared part; an asynchronous `body` stream is also supported. |
| `inspectRuntimeTransfer({ directory, verify })` | Reopen state, identities, part availability and storage, and received paths. |
| `openRuntimeTransferDownload({ directory, kind, index, signal })` | Return the existing native file handle for an exact manifest or part; the consumer closes it. |
| `copyRuntimeTransferPart({ directory, index, file, signal })` | Atomically publish one declared part to an explicit offline handoff path. |
| `completeRuntimeTransferReceive({ directory, npm, populateCache })` | Reconstruct, verify and populate the receiver's private cache. |
| `installReceivedRuntime({ directory, runtimeDirectory, recoverFrom, ... })` | Original offline preparation, installation or new-directory recovery. |

Use exact UTF-8 manifest bytes or the original manifest string for receiving, and the supplied SHA-256. Export, completion and installation accept an abort signal and progress callback; part receiving accepts an abort signal. Keep the current returned `directory`, `manifestSha256`, `manifest.transferId`, `cacheDirectory` and `filesDirectory`; later requests should reopen that same state.

The source carrier's immutable file set and the receiver's operating state have different lifetimes. Retain the manifest and the complete carrier for receiving or rebuilding the explicit cache: declared part files in `parts` mode, or the complete original file set in `files` mode. Keep the original runtime's installation records for operational recovery. Source transfer does not activate a managed release automatically.

## Original contracts

The npm behavior used here is documented in the official [package-lock format](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/), [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack/), [npm cache](https://docs.npmjs.com/cli/v11/commands/npm-cache/) and [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/) references, checked on 11 October 2026. The original Starforge installer and native preparation remain defined by [RUNTIME_INSTALL.md](RUNTIME_INSTALL.md); feature declarations and effective host requirements remain in [RUNTIME.md](RUNTIME.md).

