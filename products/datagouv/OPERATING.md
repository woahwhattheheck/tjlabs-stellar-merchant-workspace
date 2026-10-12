# Publisher operations for data.gouv.fr

This application gives a publication team one local workspace for complete source editions, reviewed publication, customer queries, edition decisions and customer handover. It uses the maintained native dataset publisher. The optional portal adapter speaks the native data.gouv.fr API.

## Start the workspace

Use Node.js 24 on Linux, with the system `flock` command available. Python 3 is used for source capture, customer installation and Linux service administration. The application does not need a package installation or a paid CI runner.

From the application root:

```sh
node start-publisher.mjs init --directory ../publisher-workspace --title "Publisher operations"
node start-publisher.mjs serve --directory ../publisher-workspace --port 8429
```

Open the exact loopback URL printed by the service. The service binds to 127.0.0.1. Keep that process open while using the browser. Stop it before opening the same workspace with the CLI. Reopen an existing workspace without `init` or `--create`.

The default browser has six sections:

| Section | Work performed |
| --- | --- |
| Overview | Inspect the current edition, sources and recent operations. |
| Sources | Import and inspect a complete retained capture, download its original CSV, and select field aliases and ordering. |
| Local publications | Save and build a native plan, review the source and candidate, publish the local edition, select it, query it and export its files. |
| Edition decisions | Compare complete source editions, examine changes and record keep, accept or withdraw. |
| Portal delivery | Prepare and inspect an original data.gouv organisation operation, save a private draft, review it and explicitly release it. |
| Handover | Download the complete application/workspace archive and inspect operation history. |

Local publication creates a customer-queryable edition on this computer. Portal delivery uses a separately selected organisation and the native provider API.

## Install for a customer or an operations team

The application includes two complete installation paths.

Use the [customer installation and Python guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/datagouv/CUSTOMER.md) to receive a native `.datawork` archive with its embedded application, continue an interrupted installation, serve the received workspace and query complete saved editions. The Python client supports the maintained HTTP and native dataset contracts, complete cursor receiving, edition comparisons and recorded adoption decisions. Retain the original archive, source and installation state when continuing a delivery.

Use [Linux administration](ADMINISTRATION.md) for an unattended service managed by an operations team. It covers verified source packages, immutable installed releases, the unprivileged publisher service, reviewed application updates, stopped-service backup and restore, and rollback. Administrative installation records and retains its original workspace attempt before activation, so an interruption can be resumed without replacing another workspace. The administrator and running publisher coordinate through the same service and workspace locks.

The service remains on loopback. Organisation credentials are supplied only to an explicitly selected portal operation; the service unit and portable source package do not contain those credentials.

## Retain a complete source

A capture consists of a manifest and all original members named by it: original dataset metadata, the entire original resource CSV and the full parsed JSONL rows. Import the manifest from an already captured directory. The importer checks file membership, byte lengths and hashes, parses the entire original CSV, and compares every decoded value against the full JSONL rows.

For a CLI import, save a request file:

```json
{
  "requestId": "43d6609e-0b51-4d62-a246-956452df41f1",
  "manifest": "/absolute/path/to/capture/capture.json",
  "expectedSha256": "THE_COMPLETE_CAPTURE_MANIFEST_SHA256",
  "label": "Municipal classification — retained provider edition"
}
```

Run:

```sh
node start-publisher.mjs import --directory ../publisher-workspace --input import.json
```

Use one fresh version-4 UUID for a new request. Preserve the exact request file for a retry. An existing request ID with different input is rejected; an exact replay returns its retained result.

The supplied worked source is Datactivist's published municipal classification:

| Identity | Value |
| --- | --- |
| Provider dataset | 672de493bf9bd19deda0c563 |
| Provider resource | ea5d6bc3-37d0-4884-a437-155a90c3e05f |
| Original rows | 34,844 |
| Original CSV bytes | 1,515,512 |
| Original CSV SHA-256 | fec6338a55ea2c4eaaa76d63e8e4d97d9c1e7d8d5666924b8a292eb58a830e05 |
| Complete capture manifest SHA-256 | 815ee03eb81019b9abc8fd7092c1bbcb8928363dbc6e86e6c926ae1ae22768e1 |
| Published licence | Open Licence 2.0, provider code lov2 |
| Historical coverage | 15–22 March 2020 |
| Acquisition date | 12 October 2026 |

The complete capture preserves `nom_commune`, `cog_commune`, `siren_commune`, `nuance_politique` and `famille_nuance`. All are strings with `nullable: false`. Empty cells remain empty strings; codes retain their leading zeroes. Literal text such as NA or NULL is not silently reclassified. The commune code is complete and unique in this retained source.

Historical coverage, dataset modification, resource modification, HTTP Last-Modified and acquisition time are different observations. Keep them separate when labelling this edition. This application does not infer a current political classification or republish personal mayor records.

Primary source:
https://www.data.gouv.fr/datasets/communes-enrichies-avec-la-nuance-politique-france/

The original complete public capture is already retained for the worked operation. For a genuinely new source edition, the explicit acquisition command is:

```sh
node start-publisher.mjs capture --out /absolute/new-capture-directory --dataset DATASET_ID --resource RESOURCE_ID --operation NEW_ACQUISITION_ID
```

A later comparison uses two actual acquired editions. Comparing the same retained edition is supported and must be described as an unchanged-source comparison.

## Build and review a local publication

In Sources, open the retained source, inspect its original fields and values, select aliases and ordering, and save a plan. The native source declaration and original complete capture become part of that plan.

Build the complete publication. Source row, byte, cell and time limits apply to the whole dataset. An interrupted build retains its plan, run identity and files. It does not silently replace the original run.

When the candidate is ready, record the reviewer and the source/candidate review. Publish that exact reviewed candidate, then select the resulting edition as current. Publication and current selection are separate decisions: a complete published edition can exist without becoming the default customer edition.

The CLI uses saved JSON files for plan, review, publication and selection:

```sh
node start-publisher.mjs plan --directory ../publisher-workspace --input plan.json
node start-publisher.mjs extract --directory ../publisher-workspace --publication PUBLICATION_UUID
node start-publisher.mjs review --directory ../publisher-workspace --input review.json
node start-publisher.mjs publish --directory ../publisher-workspace --input publish.json
node start-publisher.mjs select --directory ../publisher-workspace --input selection.json
```

The complete HTTP and request-field contracts are in [API.md](API.md).

## Deliver and query the selected edition

Each published edition has an immutable dataset snapshot. A query can select a specific publication or use the current selection:

```sh
node start-publisher.mjs query --directory ../publisher-workspace --query "limit=250"
node start-publisher.mjs query --directory ../publisher-workspace --publication PUBLICATION_UUID --query "where_cog_commune=01001&limit=25"
```

The HTTP equivalent is:

```text
GET /api/query?publication=PUBLICATION_UUID&limit=250
GET /api/query?publication=PUBLICATION_UUID&where_cog_commune=01001&limit=25
```

The response retains the maintained dataset-page contract: dataset identity and snapshot, schema, rows and page continuation. Continue with the exact returned `page.nextCursor` while preserving the selected publication, filters, selected fields and ordering. Stop when the cursor is null. The row limit is at most250.

Download the full original CSV from Sources. Local Publications also exports the native CSV, dataset configuration and candidate. These are whole files, even when the visible table is paginated.

## Decide what to do with a following edition

Import the next actual complete capture, then compare it with the source underlying the current edition. Select one or more source fields that form a complete unique key. The engine rejects missing, blank or duplicate keys rather than choosing an arbitrary row.

A comparison retains all added, removed and changed rows, plus unchanged counts and source/metadata differences. Page through the browser view or download the complete comparison file.

- **Keep** retains the selected edition and the decision reason.
- **Accept** selects an already published local edition built from the compared following source.
- **Withdraw** clears the default selection while retaining the original edition and history.

Every decision includes the expected selection revision. If another operator has changed that selection, review the current state before issuing a new decision. The original decision is never silently redirected to a different current edition.

## Native data.gouv portal delivery

Use [the complete portal operating guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/datagouv/PUBLICATION.md) for organisation access, metadata, file and remote resources, private drafts, review and release.

Select an API key through the process environment, normally `DATAGOUV_API_KEY`. The UI and API do not accept a credential field. Organisation, dataset/resource identities and the original operation ID are explicit saved inputs.

A local candidate is not itself a provider publication. Portal release follows a separate private-draft and exact-review operation. The adapter retains intent before dispatch, reads back original identities after an interrupted request, and respects provider retry deadlines. An ambiguous creation is reconciled using its original operation marker and returned provider identities. Completed publication receipts remain available after later provider changes.

The product's local operating example makes no provider organisation writes.

## Recover an interrupted operation

Inspect the original publication and its history first:

```sh
node start-publisher.mjs inspect --directory ../publisher-workspace --publication PUBLICATION_UUID
node start-publisher.mjs recover --directory ../publisher-workspace --publication PUBLICATION_UUID
node start-publisher.mjs history --directory ../publisher-workspace
```

A stopped extraction may be given an explicit new retained run under the same saved publication and plan:

```json
{
  "requestId": "4da783ba-a26d-4cc4-b9f3-799120ff08a5",
  "publicationId": "ORIGINAL_PUBLICATION_UUID",
  "reason": "The original extraction stopped; continue after correcting the recorded source or runtime issue."
}
```

```sh
node start-publisher.mjs retry-extraction --directory ../publisher-workspace --input retry.json
node start-publisher.mjs extract --directory ../publisher-workspace --publication ORIGINAL_PUBLICATION_UUID
```

This is available only for a definitively failed, cancelled or interrupted extraction. The previous run and reason remain attached to the publication. Original publication ambiguity is handled by reconciliation, not by discarding the workspace or starting another company project.

## Export, receive and continue

The complete archive includes the operations database, full captures, saved native plans/runs, current selection, decisions, provider-operation records and all application files in `application-files.json`. Application files are selected explicitly, so a checkout's other projects, hidden configuration and Git directory are not swept into the handover.

```sh
node start-publisher.mjs export --directory ../publisher-workspace --output ./publisher-workspace.datawork
node start-publisher.mjs receive --file ./publisher-workspace.datawork --directory ../received-publisher --sha256 ARCHIVE_SHA256
```

The receiving directory must be new. Receiving checks every member's path, size and hash, then opens the copied database, retained captures and published dataset snapshots. The original workspace ID and publication identities remain the same.

Continue from the received application:

```sh
cd ../received-publisher/application
node start-publisher.mjs serve --directory ../workspace --port 8429
```

Retain the source archive and its digest. A failed receive does not authorize replacing an unrelated existing directory. Choose the original attempt and inspect its actual result before another receiving attempt.

## Complete retained-data operation

The included `datagouv/examples/operate.mjs` driver performs one substantial application journey against the complete original34,844-row capture. It covers native publication, every customer row over140 pages, every original cell, leading-zero queries, full exports, a clearly labelled same-retained-edition decision, cold reopen, HTTP, desktop/mobile browser views, complete archive and independent customer reopening.

Save a configuration file with actual installed paths:

```json
{
  "root": "/absolute/path/to/original-operation",
  "applicationRoot": "/absolute/path/to/application",
  "captureManifest": "/absolute/path/to/retained-capture/capture.json",
  "playwrightModule": "/absolute/path/to/playwright/index.mjs",
  "browserExecutable": "/absolute/path/to/chrome-headless-shell"
}
```

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/datagouv/examples/operate.mjs /absolute/path/to/operation-config.json
```

The operation saves its original input IDs and its actual result in the selected root. A completed operation is identified by `complete: true` in that result. A runtime or browser error remains an actual incomplete result. The original source-acquisition success and the whole application result are recorded separately.
