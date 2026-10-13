# Study Flow through the original Research MCP attachment

This adapter operates the same saved Research dossier, Study Flow editions and source history used by the browser, HTTP client and CLI. The original Research listener authenticates requests and owns its data. The existing merchant Research attachment manages the connection and complete exported files. No separate diagram database, source importer, renderer or download service is introduced.

The core Study Flow implementation is in the maintained Research source at
`stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/study-flow/`.
Its full reporting definition and operating guide are authoritative. This guide covers the MCP receiving and operating sequence.

## Install and attach

Use the maintained merchant package containing this adapter **and** the original Study Flow client/server closure. The six tools join the existing `research-workspaces` provider automatically through its catalog; there is no new provider, host credential or CLI command.

The host declares an existing Research listener through the normal configuration:

```json
{
  "schema": "stellar-forge.research-workspaces.v1",
  "workspaces": {
    "evidence": {
      "label": "Existing evidence workspace",
      "consoleUrlFile": "/absolute/private/research-connection.json",
      "directory": "/absolute/private/original-research-workspace",
      "sources": {}
    }
  }
}
```

These are host-selected paths, never paths supplied to the six tools. `directory` is the actual original Research store directory; the client derives the expected workspace ID from it. It is not a new MCP client-state directory. The original managed Research application writes the startup connection and owns its token and listener. Follow the maintained merchant `README.md` and its initialization/serve commands for the installed version. Keep that startup file with its original private permissions. Do not paste its token into an MCP argument or a source document.

Call `merchant_research_workspaces`, then `merchant_research_attach({"workspace":"evidence"})`.
The original attachment verifies workspace identity and rereads the startup connection after a managed restart. Read `merchant_research_status` and the actual dossier before selecting a source or writing.

## Complete operation surface

| Tool | Original operation | Main selection |
|---|---|---|
| `merchant_research_study_flow` | `studyFlow` | Dossier revision, flow/edition, section, offset and limit |
| `merchant_research_study_flow_sources` | `studyFlowSources` | Question, original eligibility review and work set |
| `merchant_research_study_flow_report` | `studyFlowReport` | Exact saved flow/edition and revision |
| `merchant_research_study_flow_preview` | `previewStudyFlow` | Expected current revision and complete proposed definition |
| `merchant_research_study_flow_import_counts` | `importStudyFlowCounts` | Expected revision and unchanged original CSV body |
| `merchant_research_study_flow_review` | `reviewStudyFlow` | Complete native save/review/withdraw envelope |

Every tool starts with the existing `workspace` alias and `dossierId`. The adapter passes the original fields through unchanged. Native error codes and the current/expected revision conflict remain visible.

The first three tools read retained data. Preview and count import also leave the dossier unchanged. Review commits one original native operation. A reviewed partial report remains a partial report; a review does not establish a complete search, full-text assessment or clinical study identity.

### 1. Inspect complete original sources

Call the source tool for the selected dossier/question. It returns original review and protocol identities, work sets, exact edition hashes and paged occurrences.

```json
{
  "workspace": "evidence",
  "dossierId": "ACTUAL_DOSSIER_ID",
  "questionId": "ACTUAL_QUESTION_ID",
  "offset": 0,
  "limit": 100
}
```

Use the returned `dossier.revision` on each continuation, preserving the other selectors, and continue at the returned `nextOffset` until it is null. The native store requires an explicit retained revision for a nonzero offset. A source edition is a retained acquisition; its provider name does not automatically define its identification route.

For saved flows, the native sections are `overview`, `flows`, `editions`, `records`, `reports`, `studies`, `counts`, `issues` and `operations`. Select a flow or edition for its record/report/count projections. Keep original occurrence IDs, report keys and explicit study IDs distinct.

### 2. Prepare the complete reporting definition

Read an actual saved edition or use the original browser/CLI to compose the complete
`sf88-research-study-flow-definition/v1` object. It includes the selected question, review/work sets/stages, source editions and routes, record treatment, report retrievals, explicit report anchors, attributed reported counts, exclusion reasons, previous-review links and coverage statement.

Call preview with that entire object, `expectedRevision`, and either:

- `sourceMode:"current"` to bind the currently selected original dossier source; or
- `sourceMode:"retained"`, the existing `flowId`, and optionally `basisEditionId` to use an exact earlier source basis belonging to that flow.

Preview returns the complete native report and SVG, including accounting differences, unknown counts, incomplete source coverage and study/report membership issues. Correct the actual source or attributed definition when needed. An unknown count stays null; zero is a known value.

The provider retains its existing **2,097,152-byte request limit**. This is distinct from the original HTTP route's larger limit. Submit the full request within that supported provider budget; do not split one definition or mutation into partially valid calls. Large read reports should use native pagination or the complete export mechanism below.

### 3. Retain an original count CSV

Count import accepts the original `body`, `filename`, `reference`, `reason` and `expectedRevision`. Preserve a UTF-8 BOM, quoted headers, line endings, original unknown blanks and all complete rows. The original parser accepts its documented `data,n` contract and validates duplicate/unknown metric IDs.

The result contains `counts`, `importFile`, the exact byte count and SHA-256. Use its attributed count overrides in the complete definition, then include its unchanged `importFile` in the save data. Import itself does not commit a revision. The original body limit is 1,048,576 JavaScript string units; the surrounding encoded MCP request still must fit the provider byte limit.

### 4. Save, review and recover uncertain replies

Persist the complete envelope before sending:

```json
{
  "workspace": "evidence",
  "dossierId": "ACTUAL_DOSSIER_ID",
  "requestId": "ACTUAL_STABLE_REQUEST_ID",
  "expectedRevision": 15,
  "actor": {"id": "ACTUAL_AUTHOR_ID", "name": "Actual reporting author"},
  "action": "save",
  "flowId": "ACTUAL_EXISTING_FLOW_ID",
  "data": {
    "definition": {"schema": "sf88-research-study-flow-definition/v1"},
    "sourceMode": "retained",
    "basisEditionId": "ACTUAL_SAVED_SOURCE_EDITION",
    "supersedes": "ACTUAL_CURRENT_FLOW_EDITION",
    "reason": "Actual source-attributed reason for the complete changed definition"
  }
}
```

The shortened `definition` above only illustrates envelope placement; submit the **complete original definition**, not that fragment. For a new flow omit `flowId`, use current source and `supersedes:null`. For an existing flow, `supersedes` must be its actual current edition. Historical source reuse does not silently replace the current edition.

Review and withdrawal use the same tool with `action:"review"` or `"withdraw"`, the existing `flowId`, and `data:{"editionId":"ACTUAL_CURRENT_EDITION","reason":"Actual reason"}`.

The result is the original `{dossier,operation,duplicate}` envelope. Keep the returned request and edition IDs. If a response is interrupted, inspect section `operations` at the original dossier and replay **exactly the persisted request** if necessary. Do not regenerate its request ID, replace its expected revision or change its data merely to retry. Native request identity is checked before the current-head conflict, so a genuinely committed exact replay returns its original operation with `duplicate:true`. A changed payload under the same request ID is rejected.

A new later edit is a new action: inspect the fresh dossier, retain the earlier request, prepare a new request ID and explicitly bind the new revision/current edition.

### 5. Export every original report byte

The six tools use the existing `merchant_research_export` and file-read tools rather than returning a file as partial text.

Supported kinds:

| Kind | Complete original output |
|---|---|
| `study-flow-json` | Entire selected native report |
| `study-flow-svg` | Original diagram |
| `study-flow-html` | Complete standalone report and diagram |
| `study-flow-csv` | Selected complete counts/records/reports/studies/reasons/issues table |

Provide `workspace`, `dossierId`, an exact `revision`, and either `flowId` or `flowEditionId`. The distinct export field `flowEditionId` maps to native `editionId`; it avoids confusion with the same export tool's source-edition selector. For CSV, `flowSection` selects one of the six tables and defaults to `counts`.

```json
{
  "workspace": "evidence",
  "dossierId": "ACTUAL_DOSSIER_ID",
  "kind": "study-flow-svg",
  "revision": 15,
  "flowEditionId": "ACTUAL_SAVED_FLOW_EDITION"
}
```

The original export receipt gives the retained export identity, bytes/hash and selection. Read it with `merchant_research_file_read`, keeping `workspace`, `kind`, `exportId`, and the returned byte offset. Reuse the current `readId` while valid; after restart omit it and keep the same export ID and offset. Decode every chunk, require the actual terminal EOF, and verify the complete byte count and SHA-256. Release only that owned temporary reader when finished. The complete export remains retained.

If an export response is lost, page `merchant_research_exports` and reconcile the original selection and hash before issuing another export. Complete files use the existing content-addressed inventory and its original restart-safe reader.

Use the existing `portable-json` or `portable-gzip` kind for the **whole original dossier/history**, then the existing `merchant_research_reopen` on that exact retained portable or host-declared source. A flow report export alone is a report, not the complete dossier.

## Interpretation and source boundaries

The report states whether its arithmetic is consistent and whether reporting is complete. Those are separate properties. Missing full-text retrieval, unknown totals, incomplete search coverage or unestablished report/study membership remain visible even when known accounting equations pass. Previous-review updates retain actual report-to-study membership and source attribution.

This adapter never runs a new search, provider acquisition, paid merchant request or source screening merely to read a diagram. The named author must describe the actual review method and identity. Automated metadata screening is not independent human review or a clinical study assessment.

## Operating and receiving status

The original core source was delivered in standalone PR606, merge `4f863a7bb7e820430043bd5e86198399077e0d64`. Its completed native operation retains two original RIS responses, two explicitly automated title/identifier decisions, three saved flow editions, 15 original dossier revisions and complete portable receiving. The known counts are 2 selected database records, 2 screened and 1 excluded; full-search/full-text/study counts remain unestablished.

The MCP source join and its actual same-dossier receiving result are reported separately. Installing or reading this guide does not mean a new host has exposed the tools. Follow the original installed provider's tool inventory and the retained operation receipt. Keep browser receiving, provider attachment and source-native completion statuses distinct.
