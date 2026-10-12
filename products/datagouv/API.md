# Publisher workspace API and saved inputs

The browser and CLI use the same workspace implementation. Open exactly one owner of a workspace at a time; the native Linux lock protects its files and SQLite state.

## Local service

Start with:

```sh
node start-publisher.mjs serve --directory /absolute/workspace --port 8429
```

Use the exact printed 127.0.0.1 URL. Requests carrying an Origin must use that origin. Browser fetch metadata must describe a direct or same-origin request.

For mutations, first GET `/api/session`. The JSON body has a `token` property. Send it as `X-Workspace-Token` on each POST, with `Content-Type: application/json`. A server restart creates a new session token; refresh it and retain the original business request ID and input.

The session token is a local request token. Provider API credentials are process environment inputs and are not accepted in an HTTP request body.

## Read routes

| Method and route | Input | Result |
| --- | --- | --- |
| GET /api/status | None | Workspace, current selection/revision, captures, local publications, comparisons, provider operations, active task and recent history. |
| GET /api/session | None | Local request token. |
| GET /api/source | capture, optional offset and limit | Original capture record, manifest, metadata, suggested projection, selected source rows and next offset. Maximum limit250. |
| GET /api/publication | publication, optional query | Original native run inspection and its query preview. |
| GET /api/comparison | comparison, optional offset | Saved comparison, selected changes and next offset. |
| GET /api/history | Optional offset | Operation events and next offset. |
| GET /api/query | Optional publication plus native query parameters | Native dataset-page JSON with the handler's actual status and headers. |
| GET /api/download | kind and id | Whole file with an attachment filename. |
| GET /api/export | None | Complete publisher-workspace.datawork attachment. |
| GET /api/portal/schema | None | Actual publication input schema. |
| GET /api/portal/status | operation | Original native provider-operation inspection. |

The query route removes only the `publication` selector before invoking the maintained dataset handler. It does not reshape source rows, cursor state, schema or snapshot identifiers.

Query parameters include `limit`, `cursor`, `fields`, `sort` and exact predicates such as `where_cog_commune=01001`. Keep the publication and the rest of the query unchanged while following `page.nextCursor`. A changed query requires a fresh first page.

### Download kinds

| kind | id selects | File |
| --- | --- | --- |
| original | Capture manifest SHA-256 | Complete original provider resource.csv |
| manifest | Capture manifest SHA-256 | Complete capture.json |
| comparison | Comparison SHA-256 | Complete comparison JSON with every changed row |
| csv | Local publication UUID | Complete native data.csv |
| config | Local publication UUID | Native dataset.json |
| candidate | Local publication UUID | Original candidate.json |

## Mutation identity

A local business mutation uses a version-4 UUID `requestId`. Generate it once, save the complete JSON request and reuse both for an exact retry. Reusing an ID with a changed kind or changed input fails. Extraction and recovery address a saved publication and its retained native run, so they do not take a new request UUID.

Every POST returns its operation's complete result as JSON. A failure uses `error` and `message` with the actual status where available. Read the result of the original operation before making a different request.

## Import a retained capture

POST `/api/import`:

```json
{
  "requestId": "5c3972a6-830b-44a7-bbc2-ae64e999ad03",
  "manifest": "/absolute/path/to/capture.json",
  "expectedSha256": "COMPLETE_MANIFEST_SHA256",
  "label": "Original source edition"
}
```

Returns the retained capture record. Its `hash` is the manifest identity; `originalSha256` is the raw resource identity. The path must refer to the full original capture on the service machine.

## Prepare a publication

POST `/api/prepare`:

```json
{
  "requestId": "dd1452ca-23cf-4c12-b7cf-31a4b1467918",
  "captureHash": "RETAINED_CAPTURE_HASH",
  "label": "Municipal classification",
  "projection": {
    "nom_commune": {"field": "nom_commune", "type": "string", "nullable": false, "encoding": "native"},
    "cog_commune": {"field": "cog_commune", "type": "string", "nullable": false, "encoding": "native"},
    "siren_commune": {"field": "siren_commune", "type": "string", "nullable": false, "encoding": "native"},
    "nuance_politique": {"field": "nuance_politique", "type": "string", "nullable": false, "encoding": "native"},
    "famille_nuance": {"field": "famille_nuance", "type": "string", "nullable": false, "encoding": "native"}
  },
  "order": [{"column": "cog_commune", "direction": "asc"}]
}
```

The source route supplies a suggested complete projection. Aliases are reviewed operator inputs. Preserve source string values and blank semantics.

Optional extraction limits are `maxRows`, `maxBytes`, `maxRowBytes`, `timeoutMs` and `maxCellChars`. Defaults are1,000,000 rows,256MiB source bytes,1MiB per row,300,000ms and65,536 characters per cell. A limit failure retains the native result.

Returns the saved local publication, including `id`, `captureHash`, `planId`, `planDigest`, `runId`, state and original inputs.

## Build, inspect and recover

POST `/api/extract` or `/api/recover`:

```json
{"publicationId": "ORIGINAL_PUBLICATION_UUID"}
```

Extraction returns the retained local publication after the native operation settles. An existing original run is inspected or recovered; it is not recreated behind the operator's back.

POST `/api/retry-extraction` is an explicit continuation for a stopped run:

```json
{
  "requestId": "c2f8ef30-cbcb-49ad-830b-3071f3a9aa31",
  "publicationId": "ORIGINAL_PUBLICATION_UUID",
  "reason": "Specific correction and reason for continuing"
}
```

The saved plan and publication remain the same. A new run identity is retained alongside the previous one. Then POST `/api/extract` for that original publication.

## Review and publish

POST `/api/review`:

```json
{
  "requestId": "0051ed77-1b8c-45cb-82e8-bbe42f35db11",
  "publicationId": "ORIGINAL_PUBLICATION_UUID",
  "captureHash": "EXACT_RETAINED_CAPTURE_HASH",
  "reviewer": "Operator name",
  "note": "Source meaning, schema, values and complete candidate review"
}
```

The returned publication includes `reviewId`. POST `/api/publish`:

```json
{
  "requestId": "f23c3985-b8b5-4b53-868f-c468cefa1145",
  "publicationId": "ORIGINAL_PUBLICATION_UUID",
  "reviewId": "ORIGINAL_REVIEW_UUID"
}
```

The exact review must belong to the saved original candidate. A successful result has state PUBLISHED and its immutable dataset snapshot. Original ambiguous publication outcomes are reconciled before another publication is attempted.

## Select a current edition

Read `selection.revision` from status, then POST `/api/select`:

```json
{
  "requestId": "2465d3a9-d356-491a-ab1f-413341bc0e24",
  "publicationId": "PUBLISHED_PUBLICATION_UUID",
  "expectedRevision": 0,
  "reviewer": "Operator name",
  "note": "Reason this edition should serve current customer requests"
}
```

The result contains the new revision, publication ID and update time. The expected revision is a real observed value, not a fixed number to reuse after the selection has changed.

## Compare complete editions

POST `/api/compare`:

```json
{
  "requestId": "48709157-aeb3-4c52-b4b6-49173b8bdfe7",
  "before": "CURRENT_CAPTURE_HASH",
  "after": "FOLLOWING_CAPTURE_HASH",
  "keys": ["cog_commune"]
}
```

Returns the saved comparison record. Its ID addresses the full comparison; its summary includes the original source identities and complete row counts. Source keys must be nonblank and unique in each complete edition.

POST `/api/decide`:

```json
{
  "requestId": "332d4d2f-f058-4d04-afbb-a9293184cd4a",
  "comparisonId": "COMPARISON_SHA256",
  "action": "keep",
  "expectedRevision": 1,
  "reviewer": "Operator name",
  "note": "Decision and its reason"
}
```

Action may be keep, accept or withdraw. Accept additionally requires `publicationId` for a fully published local edition built from the comparison's after capture. A comparison beginning with a different current source is rejected. The saved decision contains its before/after selection and reviewer.

## Provider routes

Provider operations retain their own explicit `operationId`; they use the workspace's durable compare-and-set record store.

| POST route | Adapter method |
| --- | --- |
| /api/portal/prepare | prepareDraft |
| /api/portal/draft | saveDraft |
| /api/portal/review | reviewDraft |
| /api/portal/publish | publish |
| /api/portal/reconcile | reconcile |

The exact input schema, resource/file handling and release/recovery contracts are in the [portal guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/datagouv/PUBLICATION.md). The returned saved record uses `operation.operation_id`. Draft review addresses `operation.draft.sha256`; release addresses the saved review ID.

## CLI correspondence

| CLI command | Workspace operation |
| --- | --- |
| import | Import complete source request |
| plan | Prepare publication request |
| extract | Run original publication extraction |
| retry-extraction | Explicit stopped-run continuation request |
| inspect | Native publication inspection |
| review, publish, select | Their saved JSON requests |
| compare, decide | Complete comparison and edition decision |
| recover | Reconcile original native publication |
| query | Native dataset query |
| status, history | Workspace and operations |
| download | Full selected file |
| export | Complete application/workspace archive |
| receive | Full archive validation, independent installation and reopen |

Use `--directory` for the original workspace and `--input` for JSON mutations. Extraction/inspection/recovery take `--publication`. Query takes `--query` and an optional publication. Download takes `--kind`, `--id` and a new `--output` file. Export takes a new output file. Receive takes `--file`, a new `--directory` and an optional expected `--sha256`.

Portal CLI names are portal-prepare, portal-draft, portal-review, portal-publish, portal-reconcile, portal-inspect, portal-access and portal-locate. Their JSON inputs go directly to the maintained adapter method; API base and credential environment name are optional process configuration.
