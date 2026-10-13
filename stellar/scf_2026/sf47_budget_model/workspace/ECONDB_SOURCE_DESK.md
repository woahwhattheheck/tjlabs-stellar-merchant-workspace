# Econdb customer installation

## What the customer receives

This workflow delivers a complete maritime project with the commercial Workshare and customer Installation that commission it. The customer can open the original data, read the selected reports, inspect exact observations, reopen the editable project, receive the full operating case and continue work in an independently received Econdb workspace.

The delivery has two required parts:

| Part | Contents and purpose |
| --- | --- |
| Complete customer case | The original Installation edition, Workshare source and phase checks, source attachments, assignments, payment selections, saved history and other native case material. The original case exporter and importer own this format. |
| Complete Econdb preparation | The entire original operator workspace ZIP, original transfer manifest, selected project and all its files, source and commercial reports, preparation inputs and additional selected attachments. The original Econdb transfer receiver owns the workspace format. |

Keep both parts together. The selected project report alone does not contain the complete workspace history. A case archive alone does not replace its separately retained large source sidecar.

The technical preparation copies the original commercial plan, fees, payment stages, schedule, phase effort and acceptance checks. Select actual source-use authority, merchant/buyer deployments, receiving host, named operator and payment terms in the existing case. An unselected field remains visible for completion in that case.

## 1. Install the complete application

The `econdb-customer` source selection combines the complete maintained `econdb-maritime` and `grant-operations` applications, their original providers and runtime support. It adds the customer preparation and receiving commands. The existing Grant Operations selection also carries the Econdb customer desk.

Build through the maintained distribution workflow from the full reviewed source commit:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref FULL_REVIEWED_COMMIT \
  --selection econdb-customer --out /absolute/econdb-customer-release
```

Use that package's existing runtime profile, installer and Applications launcher. The original **Build a product**, **Source & profile**, installation, transfer and recovery workflows remain the entry points. Keep the complete package manifest and original dependency locks with the installation. The source builder retains original file paths and includes the original customer case application as well as the Econdb operator.

The direct source commands below require the maintained Node runtime (Node 22 or later) and Python with its standard library. Use the installed profile's selected executables. The streaming archive helper uses the existing Linux file-locking facilities. `ECONDB_SOURCE_PYTHON` may identify the selected Python executable when invoking the Node source commands. Create private working directories outside the installed source and use private input files; on Linux, start a receiving shell with `umask 077`.

Source entry points:

| Entry | Use |
| --- | --- |
| `installation-workorders/econdb-installation.mjs` | Pack, catalogue, inspect, template, prepare and reopen the complete source preparation. |
| `installation-workorders/econdb-installation-receiving.mjs` | Operate the original native Installation and independently receive the case and full Econdb workspace. |
| `workspace/operations_econdb_sources.py` | Original authenticated case and source-service bridge. |
| `workspace/operations_econdb_sources.mjs` | **Econdb customer handover** within the existing source desk. |
| `workspace/econdb-source-desk-agent.mjs` and its type declarations | Typed application client for the same source operations. |
| `workspace/installation-source-desk.py` | Existing native source-desk CLI, including the `econdb-*` commands. |

The paths in the first two rows are beneath `stellar/scf_2026/sf49_data_commissioning/`. Workspace paths are beneath `stellar/scf_2026/sf47_budget_model/`. This complete guide is also served as `/ECONDB_SOURCE_DESK.md` in the application.

## 2. Select the original workspace and customer case

Use the existing Econdb operator to receive or capture original source editions, build the desired maritime project and save its record. Select a saved `project-build` or `project-import` record, including its original UUID, record revision and project input SHA-256. The project's human-readable ID differs from its saved operation UUID; retain both.

Each project entry preserves:

- The actual source role, capture time and original response and descriptor.
- Port, endpoint, query, measure, population and declared or undeclared frequency.
- Its current and explicitly selected prior edition.
- The half-open date window: from inclusive, until exclusive.
- Selected observations, exact decimal strings and original numeric lexemes.
- Separate known, null, absent and unsupported-value states.
- Original coverage, period comparisons and edition comparisons.

The existing project engine owns those calculations. Monthly coverage is inferred only where the original engine supports it. An unassigned port or undeclared frequency stays unassigned or undeclared. Different measures and source populations retain separate values; the project summary has no combined cross-measure total.

Select the complete original commercial Workshare and commissioning source in the operating case. Use **Read fresh original Workshare seed** in the customer desk to obtain the native seed. Preserve every original phase and its acceptance criterion. Re-read a fresh seed if the case or pinned plan changes before a new preparation. A previously saved Installation is edited through its existing current draft.

### Export the whole Econdb workspace

The new `pack` command calls the original operator export, verifies its transfer and wraps that unchanged directory in a streamed ZIP transport:

```sh
node stellar/scf_2026/sf49_data_commissioning/installation-workorders/econdb-installation.mjs pack \
  --workspace /absolute/original-econdb-workspace \
  --directory /absolute/original-econdb-transfer \
  --archive /absolute/econdb-workspace.zip
```

Retain the returned archive byte count and SHA-256, workspace ID and revision. The ZIP carries the original `operator-transfer.json` and its complete `workspace/` population. Every source, saved request, result, project and history member stays in that population.

Catalogue the available saved projects and inspect the chosen original record:

```sh
node stellar/scf_2026/sf49_data_commissioning/installation-workorders/econdb-installation.mjs catalogue \
  --archive /absolute/econdb-workspace.zip \
  --archive-sha256 ACTUAL_ARCHIVE_SHA256 \
  --directory /absolute/econdb-source-inspection

node stellar/scf_2026/sf49_data_commissioning/installation-workorders/econdb-installation.mjs inspect \
  --archive /absolute/econdb-workspace.zip \
  --archive-sha256 ACTUAL_ARCHIVE_SHA256 \
  --directory /absolute/econdb-source-inspection \
  --project ACTUAL_SAVED_PROJECT_UUID \
  --project-revision ACTUAL_RECORD_REVISION \
  --input-sha256 ACTUAL_PROJECT_INPUT_SHA256
```

Inspection uses the original `inspectOperatorTransfer` and `verifyProject` implementations. It verifies the complete original workspace and selected project before presenting their compact source report. The saved request digest, artifact-manifest digest, project-manifest digest and project-input digest remain distinct identities.

## 3. Prepare through the customer desk

Open the original case, its existing Installation Source Desk and **Econdb customer handover**. Keep the normal staff sign-in and CSRF session. The preparation stays associated with that case.

1. Import the complete Econdb workspace ZIP. The application retains its complete bytes and original request identity, then catalogues its saved projects. Select the exact project record and inspect it.
2. Select the original Workshare. Read its fresh native seed or open the complete original seed JSON. Import the complete commercial commissioning JSON.
3. Create the native binding template. Review the original source reference, source-use authority, merchant/buyer deployments, payment selections, receiving host and named operator. Keep the original phases and commercial terms.
4. Add the complete additional working files required for the customer handover. Each attachment retains its name, purpose, byte count and digest.
5. Prepare the complete Installation and source sidecars. Open the full project report, source summary, workorder and commercial documents. Review the actual selections still required by the original case.
6. Use the existing Installation **Preview** and **Save** controls. The native case writer owns version checks, request recovery and the resulting Installation edition.
7. Download the complete source preparation and the complete native case. Independently receive both parts, then operate their applications and files as described below.

The browser retains the selected working files and pending request before dispatch. An interrupted or uncertain response is recovered through that same saved request. Preserve the pending UUID and original input bytes; use the original recovery control before starting another preparation. A current case/version change is resolved against the fresh original case after the uncertain request has been reconciled.

### Equivalent direct preparation

Create a binding template from the actual fresh Workshare seed:

```sh
node stellar/scf_2026/sf49_data_commissioning/installation-workorders/econdb-installation.mjs template \
  --seed /absolute/workshare-seed.json \
  --directory /absolute/econdb-bindings
```

Review `/absolute/econdb-bindings/bindings.json` with the existing customer case. The template carries the selected original case and plan identity. Its blank fields are explicit selections for that case.

Prepare the complete retained delivery:

```sh
node stellar/scf_2026/sf49_data_commissioning/installation-workorders/econdb-installation.mjs prepare \
  --directory /absolute/econdb-preparation \
  --archive /absolute/econdb-workspace.zip \
  --archive-sha256 ACTUAL_ARCHIVE_SHA256 \
  --project ACTUAL_SAVED_PROJECT_UUID \
  --project-revision ACTUAL_RECORD_REVISION \
  --input-sha256 ACTUAL_PROJECT_INPUT_SHA256 \
  --seed /absolute/workshare-seed.json \
  --bindings /absolute/econdb-bindings/bindings.json \
  --commissioning /absolute/commissioning.json
```

Use `--attachments /absolute/attachments.json` when there are additional working files. That document uses schema `stellar-forge.econdb-customer-installation.v1.attachments` and a `files` array. Each row contains `name`, `purpose`, absolute `path`, original integer `bytes` and lowercase SHA-256 `sha256`. Names become `attachments/<name>`; preserve their full content.

Reopen the same preparation and verify all retained source and generated output bytes:

```sh
node stellar/scf_2026/sf49_data_commissioning/installation-workorders/econdb-installation.mjs reopen \
  --directory /absolute/econdb-preparation
```

Retain the returned `preparationSha256`. An interrupted preparation resumes in its original directory against the saved `prepare-request.json`. A completed preparation recomposes its reports from the retained original inputs and checks the complete output population.

## 4. Read and deliver the complete outputs

| Retained path | Content |
| --- | --- |
| `source/econdb-workspace.zip` | Mandatory complete original operator workspace. |
| `source/operator-transfer.json` | Original whole-workspace inventory and identity. |
| `source/seed.json`, `source/bindings.json`, `source/profile.json`, `source/commissioning.json`, `source/attachments.json` | Complete original inputs to the preparation. |
| `delivery/files/` | Every selected project member, including the project manifest, analysis, configuration, state, browser workspace, source editions, producing source and entry-level reports. |
| `ECONDB_CUSTOMER_SOURCE.json` and `.md` | Complete selected project/source description with original analysis summaries and case binding. |
| `ECONDB_SOURCE_SELECTION.json` | Whole source selection with archive, transfer, project and report identities. |
| `installation-input.json` | Complete native Installation document. |
| `installation-preview-input.json` | Original case/version-bound preview input. |
| `derived-bindings.json` | Explicit bindings with the technical source reference used for composition. |
| `WORKORDER.md` | Complete phases, acceptance criteria, assignments, required selections and operating instructions. |
| `commercial.json`, `COMMERCIAL.md`, `commercial.html` | Original commercial plan, schedule, effort, payment milestones and complete retained terms. |
| `attachments/` | Additional selected complete working files. |
| `prepare-request.json`, `preparation.json` | Original preparation request and its complete retained result. |

Open `delivery/files/report.html` for the project overview and each `entries/<id>/report.html` for detail. Use `project-analysis.json` for complete exact analysis and `observations.csv` for selected observations. The original response and descriptor for each current or prior edition are under `originals/<entry>/<edition>/`. The project includes its own `REOPEN.md` and editable `browser-workspace.json`.

Check the customer's requested port, endpoint/query, measure, population and date windows against the original source. Inspect missing states, coverage and comparison limits in their actual reports. Keep original decimal strings in JSON when downstream spreadsheet software would otherwise round them.

The whole workspace ZIP streams through the source service and archive transport. The selected original project retains its existing 2 GiB, 48-entry and 500,000-cell contracts. The native Installation document retains its 128 KiB limit. The typed convenience client explicitly limits buffered transfers to 256 MiB; use the browser's native file route or the streaming Python source client for larger complete files.

## 5. Authenticated client and API operation

All source operations use the existing case prefix:

`/api/operations/{original-case-id}/econdb-sources`

| Operation | Original input or result |
| --- | --- |
| `POST import` | Raw octet-stream with request UUID, file kind/name and full byte/hash identity. The source service retains the complete original file. |
| `POST catalogue` | Request UUID and archive ID. Returns the saved project population from the original complete workspace. |
| `POST inspect` | Request UUID, archive ID, saved project UUID/revision and expected project-input SHA-256. |
| `POST template` | Request UUID, inspection ID, seed ID, commissioning ID, original native case ID and expected case version. |
| `POST prepare` | Same original case/source selection with bindings ID and optional complete attachments. |
| `GET requests/{UUID}` | Reconcile the original saved request. |
| `GET requests/{UUID}/archive.zip?describe=1` | Describe the complete retained preparation archive before downloading its exact bytes. |
| `GET files/{fileId}?describe=1` | Describe an original retained input or output file. |
| `GET sources/{inspectionUUID}/file?path=RELATIVE_PATH&describe=1` | Describe the selected original project member. |

Use the existing session, staff role and CSRF handling supplied by the application client. Keep credentials in the original account custody. The full streaming Python client is `EcondbSourceDeskClient` in `installation_source_desk_client.py`; the typed JavaScript client is `econdb-source-desk-agent.mjs`.

The existing native `installation-source-desk.py` adds `econdb-import`, `econdb-catalogue`, `econdb-inspect`, `econdb-template`, `econdb-prepare`, `econdb-request`, `econdb-list`, `econdb-file-describe` and `econdb-archive-describe`. Use its maintained `--help` for the exact current flags. It operates the same private case directory and source service. Preparation and case save retain separate original request identities.

## 6. Independently receive both applications

The complete receiving command reopens the exact preparation, verifies its source and commercial documents, uses the original native Installation writer or a selected existing saved edition, exports the entire customer case, independently imports it, receives the original Econdb operator workspace and reopens the selected project.

Create a private receiving input JSON with these fields:

| Field | Required original value |
| --- | --- |
| `preparationDirectory` | Absolute path to the complete retained preparation. |
| `expectedPreparationSha256` | SHA-256 returned by its complete reopen. |
| `operationsWorkspace` | Absolute original sending customer Operations directory. |
| `caseId` | Actual original customer case ID. |
| `receivingOperationsDirectory` | Independent receiving Operations directory. |
| `receivingEcondbDirectory` | Independent receiving Econdb workspace directory. |
| `outputDirectory` | Original owned receiving output directory. |
| `actor` | Actual receiving operator identity. |
| `python` | Absolute selected Python executable. |
| `installationId` and `installationRevision` | Actual saved Installation identity and edition from the original case. |

All five working directories must be separate, with no directory containing another. Receiving and output directories must be outside the installed source.

For an explicit first save, replace the two saved Installation fields with `save: {"requestId": "ACTUAL_ORIGINAL_UUID", "note": "Actual purpose of this first save"}`. The command durably retains the complete preview and exact original request before invoking the existing writer. It preserves the same request through uncertain responses. Do not choose both save forms.

Run:

```sh
node stellar/scf_2026/sf49_data_commissioning/installation-workorders/econdb-installation-receiving.mjs \
  --input /absolute/private/econdb-receiving.json
```

The course retains the original arguments, exact source/executable identities, complete preparation, original save/import requests and command outputs. It exports `Complete_Original_Installation.zip`, receives the mandatory Econdb archive through its original receiver, imports the case into the independent Operations directory and verifies the selected Installation and source history. Its final record is `Econdb_Installation_Complete_Receiving.json`.

The original importer intentionally gives the receiving case and plan new native IDs. Original source identities, immutable saved Installation editions and prior history remain intact. Later legitimate receiving work is retained and compared. Resume an interrupted course in its original output directory with unchanged arguments and original requests.

### Operate and view the delivered application

Complete the following course on the exact source and actual receiving directories:

1. Open the original Econdb application and the customer case at desktop width and 390 px. Use populated workspace/project selections, source reports and the customer handover controls. Personally view the captured images for clipping, long paths/hashes, readable tables, focus and usable buttons.
2. Open every current and selected prior source response/descriptor and all project outputs. Read the project and entry reports, complete analysis and CSV. Open the editable browser workspace through its maintained application and follow its original reopening instructions.
3. Operate original source import, project catalogue, inspection, fresh Workshare seed, binding template, preparation, native preview/save and their downloads. Exercise the actual saved-request recovery route when a real interruption occurs.
4. Open the complete preparation archive and native case archive. Inspect their complete inventories and actual documents. Verify the large workspace ZIP remains a complete usable part of the handover.
5. Open the independently received customer case and Econdb workspace. Reopen the selected project, reports and editable working state. Close the owned applications normally, then reopen the same directories and saved browser working copy.
6. Retain the actual source revision, account/host, saved request IDs, application lifetimes, screenshots, downloaded file identities and concise observations of what was opened and used. Correct observed defects in the original product and rerun only the affected continuation.

The native receiving result includes a separate `renderedUse` section. Populate any later viewing record from actual operated screens and attachments. The native source/case comparison and the rendered application course describe different completed work.

## 7. Continue the customer work

Later data captures and analysis requirements use the original Econdb command journal, source editions and saved projects. Preserve the earlier project and customer delivery while selecting the later source. Revise the existing Installation through its current native editor; retain accepted checks, work assignments, funding sources and independent edits.

Use the original Workshare for implementation fees, phase effort, support and payment milestones. Resource purchases retain their selected merchant offer, network, asset, recipient, atomic price and buyer-approved task budget. A source cell, project entry, report edition, implementation phase and paid task keep their separate meanings.

Name the customer reviewer, source owner, data engineer, merchant, buyer, receiving engineer and support owner in the case. Keep acquisition and refresh expectations, source-use authority, retention, withdrawal, backup and support arrangements with the delivered workspace. The customer handover is complete when the receiving team can operate the original data project and its commercial case with the full source and working history available.
