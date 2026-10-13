# Receive a complete DCAT application on the selected host

This workflow receives an original catalogue archive, preserves its full project and native history, and prepares a new managed DCAT application using the recipient’s actual Runtime workspace, installed merchant runtime and prepared semantic Python environment. It uses the existing catalogue archive receiver and Applications setup Review/Save transaction.

A receiving operation does not launch an application, validate a catalogue, acquire a remote source, accept a release or replay a historical native request. After inspecting and saving its configuration, the operator uses the original Applications controls to start and open it and deliberately selects any following catalogue operation.

The generic Runtime workspace backup and host-binding workflow remains the owner of complete Runtime workspace recovery. This domain receiver consumes an already-open original or received Runtime workspace and one READY installed runtime. It also consumes a prepared semantic environment; it does not replace the original Python/wheel installer.

## Complete source and recipient selections

Keep these original files and identities together:

| Selection | Meaning |
| --- | --- |
| Original complete Application setup JSON | Exported from the original saved DCAT application, preserving every variant, form, baseline, source catalogue and reconciliation. |
| Original complete `.ckanw` archive and its SHA-256 | All catalogue source bytes, editions, reviews, release choices, semantic requests/results, report files and original receiving history. |
| Recipient Runtime workspace | The existing private operator workspace that will own the new Application and its native save/start history. |
| Recipient installed runtime ID | A READY maintained merchant runtime in that workspace, containing the original DCAT provider and full product source. |
| Recipient semantic runtime directory and receipt SHA-256 | The actual READY runtime prepared at its final path using the original semantic preparation command. |
| Optional recipient environment input and SHA-256 | The complete private JSON environment used on this host, including its actual migration Python/profile and any existing variable values. |
| New catalogue directory | An absent private destination outside the operation, Runtime workspace and semantic runtime directories. |

The original setup’s catalogue path must match the archived project’s original source path. That comparison prevents pairing an unrelated setup with a different source project. The recipient is explicitly bound to a new path. The original setup and archived source identities stay unchanged.

The semantic runtime is host-specific. Do not move a prepared virtual environment or edit its old receipt to name another location. Prepare a new environment at its final destination. A retained wheelhouse can supply every exact dependency without contacting an index. Wheels must be compatible with the selected base Python and host platform.

Read [the original semantic preparation guide](../../sf30-seller-sdk/ckan/SEMANTIC_RUNTIME.md), [complete Application setup receiving](APPLICATION_SETUP.md), and [the original catalogue guide](../../sf30-seller-sdk/ckan/SEMANTIC_CATALOGS.md) alongside this domain workflow.

## Export the original setup and complete catalogue

Use the maintained installed `starforge` executable. These are original commands:

```sh
starforge runtime-workspace application-setup-export \
  --workspace /srv/private/source-runtime-workspace \
  --application-id ORIGINAL_APPLICATION_ID \
  --output /srv/private/delivery/dcat-application-setup.json \
  --name "Complete DCAT application"

starforge dcat archive \
  --workspace /srv/private/source-catalogue \
  --out /srv/private/delivery/catalogue.ckanw

starforge dcat inspect-archive \
  --file /srv/private/delivery/catalogue.ckanw
```

Stop or complete the original catalogue’s active operation before exporting. Preserve the returned archive SHA-256 and full manifest. Compute the SHA-256 of the exact setup JSON bytes as well. Do not substitute a summary or a regenerated setup that has lost draft or reconciliation history.

Receive these files through the established private source transfer. Keep owner-only permissions. Neither archive reception nor this application receiver sends credentials or source files to an external service.

## Prepare and inspect the recipient runtime

Use the existing recipient installation and original source/wheel selection:

```sh
starforge dcat semantic-runtime-prepare \
  --directory /srv/private/recipient-semantic-runtime \
  --python /usr/bin/python3.12 \
  --wheelhouse /srv/private/received-original-wheels

starforge dcat semantic-runtime-inspect \
  --directory /srv/private/recipient-semantic-runtime

starforge runtime-workspace applications \
  --workspace /srv/private/recipient-runtime-workspace
```

Omit `--wheelhouse` only when the original preparation’s explicit package-index resolution is intended. Its full locked dependency selection and receipts remain the preparation owner’s record. The receiver performs no resolution.

Select the actual installed runtime ID returned for the recipient Runtime workspace. The full Applications native review verifies its installation identity, source manifest, selected provider, migration interpreter, private environment and semantic receipt. A known old runtime ID or a matching display label is insufficient.

The migration interpreter and semantic interpreter are distinct. The optional private environment input should contain the recipient’s actual `SCF_DCAT_PYTHON` and `SCF_DCAT_RUNTIME_PROFILE` when the migration configuration needs them. Preserve all other selected original string variables. Do not copy an old host’s absolute Python path without checking the actual receiving host.

## Freeze the complete receiving request

Create an owner-only UTF-8 JSON request. Replace the illustrative IDs, paths and hashes below with the exact actual selections; all hashes are lowercase SHA-256, and the request ID is a real UUID retained for this one operation.

```json
{
  "schema": "stellar-forge.dcat-application-receiving-request.v1",
  "requestId": "3f5ad0ec-45cb-4ba2-87e2-6b07624a0230",
  "setup": {
    "file": "/srv/private/delivery/dcat-application-setup.json",
    "sha256": "EXACT_SETUP_FILE_SHA256"
  },
  "archive": {
    "file": "/srv/private/delivery/catalogue.ckanw",
    "sha256": "EXACT_COMPLETE_ARCHIVE_SHA256"
  },
  "catalogueDirectory": "/srv/private/recipient-catalogue",
  "runtimeId": "ACTUAL_24_CHARACTER_RUNTIME_ID",
  "semanticRuntime": {
    "directory": "/srv/private/recipient-semantic-runtime",
    "sha256": "EXACT_RUNTIME_JSON_SHA256"
  },
  "environmentInput": {
    "file": "/srv/private/recipient-environment-input.json",
    "sha256": "EXACT_ENVIRONMENT_INPUT_SHA256"
  },
  "label": "Received DCAT catalogue",
  "port": 0
}
```

`environmentInput`, `label` and `port` are optional. Omitting the environment input selects an empty input object; the runtime writer then supplies the three semantic variables, and the original Applications environment reader supplies its normal host environment. Omitting label or port retains the original setup’s selected value.

The input environment has the original Applications format: a plain object with string values, at most 125 names before adding semantic bindings, no NUL values and no reserved `HOME` or `CODEX_HOME` replacement. Its complete selected bytes are retained privately. The resulting complete file must fit the original 64 KiB environment limit.

## Receive, inspect the native review, then save

```sh
starforge runtime-workspace dcat-receiving-prepare \
  --workspace /srv/private/recipient-runtime-workspace \
  --operation /srv/private/dcat-receiving-operation \
  --request /srv/private/dcat-receiving-request.json

starforge runtime-workspace dcat-receiving-status \
  --workspace /srv/private/recipient-runtime-workspace \
  --operation /srv/private/dcat-receiving-operation
```

Preparation first freezes the complete original request, setup, archive manifest, environment input and selected semantic receipt. It verifies the incoming archive through the original decoder, then uses the original catalogue receiver with the exact archive hash. That receiver preserves source files and histories, retains original relocation records and makes only its maintained current host bindings.

The following stage verifies the prepared semantic runtime again, asks the original environment writer to generate the full recipient environment, and publishes that output atomically in the private operation directory. It carries all original Application settings forward, replacing only the explicitly selected recipient catalogue path, environment path, installed runtime ID and optional label/port.

The existing `prepareApplicationSetup` creates the native Application review. Inspect the returned `setup.review`, original sources, exact settings, command inputs, runtime/source identities and full semantic selection. The saved application has not started.

Save that same reviewed operation:

```sh
starforge runtime-workspace dcat-receiving-save \
  --workspace /srv/private/recipient-runtime-workspace \
  --operation /srv/private/dcat-receiving-operation
```

The original Applications writer owns revision checks, immutable save requests and accepted historical recovery. Its result contains the actual new Application ID and revision. The original setup and old application identity remain as source lineage; the receiver does not present the new application as an old host’s saved history.

The operation’s `nativeOperationStarted: false` means that this domain receiver did not start a catalogue/native operation. The Applications save may perform its existing managed-runtime connection/adoption work. The complete native Application result and connection state remain in `setup.result` and the original Runtime workspace.

## Start and operate through the existing application

Open the recipient Runtime workspace’s original browser:

```sh
starforge runtime-workspace serve \
  --workspace /srv/private/recipient-runtime-workspace \
  --port 8465
```

Use its displayed private local URL. In Applications, select the actual ID returned by the save. Finish any existing runtime connection shown by the native writer, review Start, and use Start/Open. The managed DCAT provider binds the catalogue identity, complete selected product source, both Python selections, prepared semantic receipt, actual child PID and authenticated startup identity.

The CLI equivalents are the existing `application-connect`, `application-start-review` and `application-start` commands; use their original returned request fields. Do not invent a new start request merely because the browser lost the reply. Reopen the original retained operation.

In the opened DCAT application:

1. Review the original source documents, catalogue editions and selected release.
2. Open retained semantic results and saved-snapshot comparisons. Historical operations and findings must remain historical.
3. Deliberately select a following source/profile/context and request only the native validation or comparison now intended.
4. Inspect the resulting actual native status, full findings and downloadable original report.
5. Save any intended operator decision using the original controls.
6. Export the complete catalogue again; independently receive and reopen it through the original archive receiver, then inspect the preserved later edit and full history.

The application can inspect retained results without rerunning semantics. Installing or binding a new runtime does not authorize replaying acquisition, payment, publication or notification operations.

## Continue the same operation after interruption

Run the same prepare command without changing its selection:

```sh
starforge runtime-workspace dcat-receiving-prepare \
  --workspace /srv/private/recipient-runtime-workspace \
  --operation /srv/private/dcat-receiving-operation
```

If `--request` is supplied on resume, its complete original bytes must match. The source setup and environment are read from their frozen private copies. The original archive remains the external full source input until the original catalogue receive is complete. Its exact expected SHA-256 is always passed to that receiver.

| Observed stage | Continuation |
| --- | --- |
| SELECTED | Resume the same full catalogue receive using its retained marker and archive identity. |
| CATALOGUE_RECEIVED | Preserve the received project and its actual history; continue the original environment and native setup review. |
| REVIEWED | Inspect the existing native review, then call the same save. Preparation does not issue a replacement review. |
| SAVED | Reopen the original accepted save. A following Application edit is not overwritten by an old save replay. |
| Interrupted native setup save | Call the same save; the original writer finds the accepted request before current revision checks. |
| Changed file, workspace, receipt or request | Preserve the old operation and inspect the exact mismatch. A deliberately different selection belongs to a new reviewed receiving operation. |

A status response includes both the domain record and, when present, the current original setup record. This distinguishes an accepted native save from an outer response that was interrupted before recording completion.

Do not edit `operation.json`, delete native requests, reset Application history or silently replace a prepared receipt. Do not point an old operation at a different Runtime workspace. A received project may have the same catalogue origin and source IDs as another copy; the operation also pins the actual Runtime workspace ID and directory.

## Private files, complete handover and source limits

The operation contains:

- `selection/request.json`: exact original receiving request.
- `selection/source-setup.json`: complete original setup, including other tool variants and reconciliation.
- `selection/source-environment.json`: complete selected private environment input.
- `selection/semantic-runtime.json`: complete original selected READY receipt.
- `selection/archive-manifest.json`: complete original archive manifest.
- `selection/recipient-environment.json`: complete recipient environment generated by the original writer.
- `selection/host-bindings.json`: explicit recipient settings sent to the native setup receiver.
- `selection/operation.json`: full stage, sources, native review/save and actual errors.
- `application/`: the original Application setup receiver’s complete source, normalized document, bindings, review, request and accepted result.

The catalogue itself remains in its selected destination, with its complete source and receiving history. The prepared environment and installed merchant runtime remain host resources. A catalogue archive does not include the semantic virtual environment or Runtime workspace database. Use the existing original runtime/source-wheel and Runtime workspace backup mechanisms for those resources, preserving their actual identities. Keep private environment values out of public reports, grant material or customer attachments.

The original catalogue receiver’s default budget is 8 GiB of unpacked source and 100,000 files; this domain command does not raise it. Setup/request documents are limited to 2 MiB, environment input to 64 KiB, and full receiving metadata to 32 MiB. Oversized input fails explicitly, without selecting a partial project.

## Installed source and actual product inspection

The source distribution includes the receiving modules and this guide through the maintained CKAN contribution. The existing runtime-workspace CLI calls the same exported functions. Original engine, archive, provider, Application transaction and setup modules remain the sole product writers.

Before presenting the result as a completed customer application, its existing equipped owner must run this full receiving course, open and LOOK at the exact rendered product at desktop and narrow widths, use its actual controls, download and reopen the full original report/project, and inspect all outgoing attachments and usable archive contents. Fix concrete failures in those original paths. Source review, parsing or an unaccepted execution request is not a native or visual completion claim.

This source release adds the full receiving workflow. Its source-only verification must be reported separately from any later actual native and browser result.
