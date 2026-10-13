# Prepare the complete HILA operator runtime

This source-owned preparation function builds the committed `hila-operator` selection with the original distribution builder, prepares and installs its original runtime profile, and returns the actual verified `READY` installation. It is the installation step for the same HILA round-review product described in [../README.md](../README.md).

The complete original questionnaire and any response data remain in the operator's private HILA workspace and its private delivery packets. The distribution contains the software, guides and original Dataset/Applications dependencies. Questionnaire permission and respondent-data approval remain explicit source metadata.

## Original entry point

Run this module from the complete selected repository source tree:

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/hila/receiving/runtime.mjs /absolute/hila-runtime-input.json
```

Or import the same callable:

```js
import { prepareHilaOperatorRuntime } from './runtime.mjs';
const ready = await prepareHilaOperatorRuntime(input);
```

The input is:

```json
{
  "repository": "/absolute/retained-source-cache/repository.git",
  "sourceRoot": "/absolute/complete-repository-source",
  "sourceCommit": "FULL_IMMUTABLE_GIT_COMMIT",
  "outputDirectory": "/absolute/hila-installation",
  "operationId": "HILA-ROUND-REVIEW-7108-20261012-INSTALL",
  "pythonExecutable": "/absolute/existing/python3",
  "npmExecutable": "/absolute/existing/npm",
  "sourceOffline": true,
  "dependencyOffline": true
}
```

`sourceRoot` must be the real repository root containing this exact module. `repository` is the original Git source repository or verified object cache. `sourceCommit` selects its complete immutable Git tree. The selected Python must be Python 3.11 or newer for the HILA application; the original builder and installer use that same supplied executable for their Python components.

The output directory is a separate, private, operator-owned directory. It must not overlap the source tree, repository or source donors. The function retains the full input before preparation and rejects a different input at the same output directory.

The runtime profile is exactly:

```json
{"native":false,"features":[],"pins":{},"operator":true}
```

This profile uses the original zero-dependency JavaScript operator installation. HILA's selected existing Python starts the unchanged native Dataset process through the original XML Workspace and the selected Node executable.

## Complete source acquisition

A complete local repository can be selected directly. For the original offline Git-object receiving route, include:

```json
{
  "sourceReceiving": {
    "directory": "/absolute/retained-source-cache",
    "metadata": "/absolute/original-git-metadata.json",
    "donorRepositories": [],
    "donorSources": ["/absolute/verified-complete-source-donor"],
    "donorArchives": [],
    "incoming": []
  }
}
```

In this form `repository` must be exactly `sourceReceiving.directory + "/repository.git"`. Each donor archive, if selected, is an object with its absolute `path` and exact full-file `sha256`.

The metadata and donor formats are those of the original distribution `git-object-receiving.py`, documented in its `GIT_OBJECT_RECEIVING.md`. The complete provider response, commit/tree identity and full source objects are retained by that receiver. The HILA preparation function invokes the existing receiver directly and leaves donor files unchanged.

The original builder can return a concrete list of missing objects. The function maps those objects back to their original tree paths, retains the expanded selection in `source-additions.json`, invokes the same source receiver and resumes the same build. A still-unavailable source body remains a reported source-acquisition requirement with its original missing-object file.

## Full builder and installer lifecycle

The preparation holds the original operation lease throughout source selection, distribution build, runtime preparation, install and final readback. It does not open a HILA model or an application server.

Before the build, it verifies the complete bootstrap source against the selected Git tree. The original builder produces the selected package and archive. The function checks the actual archive size and SHA-256, source commit, source-selection ID, complete manifest and all HILA product and receiving sources. It also verifies the original XML/Workspace/Dataset source files.

The original `prepareRuntimeInstall`, `recoverRuntime` and `installRuntime` functions own runtime state. A retained complete installation is inspected and reused. A valid partial original preparation resumes through the original installer. An incomplete preparation is retained in its original directory, and the original supported recovery creates the next recorded attempt using the same archive and profile.

Readiness requires both original inspections:

- `inspectRuntimeInstall({load:true, source:true})` reports `READY`, a matching lock and verified complete source.
- `inspectMerchantRuntime({load:false, source:true, expectedManifest})` reports the same source commit, manifest, zero-dependency profile and `READY` state.

Every selected critical file is read and hashed again from the installed source. The complete returned runtime binding is retained in `runtime-ready.json`.

## Returned installation

The result has schema `stellar-forge.hila-runtime-ready.v1` and includes:

- `state: "READY"`, the original operation ID and source commit;
- `runtimeDirectory` and `installationDirectory`, selecting the actual original installation;
- `sourceRoot`, `dependencyRoot`, installation and profile IDs;
- the complete original runtime binding and full source/load inspection;
- the complete distribution result and archive identity;
- the source manifest SHA-256, source selection and every verified critical source;
- the original input, source, release, attempt and readiness record paths.

A completed retry returns that same verified result with `reused: true`. The runtime's current source and binding are checked before reuse.

## Open the original application

Use the installed runtime's existing Applications workflow. The source-owned `hila` provider contributes the `dataset-hila` command and the HILA round-review application. Its settings select the original private workspace and an existing absolute Python executable.

For a new workspace, initialize it through the installed original command before application review. For an existing native receiving workspace, keep its original marker, SQLite database, source files and request history intact. The HILA provider inspects this saved identity without acquiring its SQLite writer.

Application review binds the complete selected source, original workspace marker and directory identity, selected Python and its version. The original Applications save/start/stop lifecycle owns the server. Startup is accepted only after the live authenticated `/api/launch` record matches the original startup record, binding, source root and selected runtime.

The native receiving procedure in [NATIVE_RECEIVING.md](NATIVE_RECEIVING.md) closes its source and detached models before an installed operator takes either workspace. Keep the same workspace's model and application ownership sequential. A later operator change is a new saved review revision with its own original request; it does not rewrite the retained core receiving result.

## Retained records and continuation

Keep `input.json`, `bootstrap.json`, `source-release.json`, `selected-source.json`, source request/results, `installation-attempts.json`, original installation directories and `runtime-ready.json`.

A retry calls this same module with the identical input. It acquires the same operation lease, verifies retained selections, resumes the original builder/install attempt and performs full readiness checks. The original preparation error retains the actual stage, error and source-missing information.

The caller retains the original native operation, and the complete runtime archive remains the original builder's unchanged output. Hand it over with the original profile, installation guide and private HILA review/report packets.
