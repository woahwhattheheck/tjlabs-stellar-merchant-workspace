# Merchant tools for complete dossier returns

This family operates the original Research dossier-return workflow through an existing authenticated Merchant attachment. It retains the exact returned portable file, freezes the common-base/current/returned comparison, carries complete reviewer drafts, validates explicit choices and saves the original reviewed request.

Use the current [Research client and Merchant setup](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/RESEARCH_CLIENT.md) for the existing listener, private connection file and provider configuration. The full [dossier-return operating guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/dossier-returns/OPERATING.md) explains the native choices, original command family and complete receiving sequence.

## Select the original attachment and source

The existing Research workspace configuration uses `stellar-forge.research-workspaces.v1`. A returned full dossier uses the already supported `portable` source kind:

~~~json
{
  "schema": "stellar-forge.research-workspaces.v1",
  "workspaces": {
    "research": {
      "label": "Selected Research programme",
      "consoleUrlFile": "/absolute/private/application-url.json",
      "directory": "/absolute/original/dossier-store",
      "sources": {
        "returned": {
          "file": "/absolute/received/Research_Dossier.json.gz",
          "kind": "portable",
          "sha256": "ACTUAL_ORIGINAL_FILE_SHA256"
        }
      }
    }
  }
}
~~~

Replace all placeholders with the actual host-selected paths and digest. The tool receives a source handle; it does not accept an arbitrary host path.

1. Call `merchant_research_workspaces` to read the configured aliases.
2. Call `merchant_research_attach` with the selected `workspace`.
3. Retain its attachment ID and verified workspace identity.
4. Select the original dossier with the existing `merchant_research_list` and `merchant_research_dossier` tools.

The attachment uses the existing Applications listener and its original store. It does not create a replacement service or dossier.

## Complete tool family

All ten tools require the explicit `workspace` alias and original `dossierId`.

| Tool suffix after `merchant_research_dossier_return_` | Additional input | Original operation |
|---|---|---|
| `source` | `source`; optional original `filename`, `contentType` | Retain the exact configured portable bytes and their source descriptor. |
| `preview` | `sourceId`, `expectedRevision` | Freeze the original common-base/current/returned comparison. |
| `list` | Optional `offset`, `limit` | Page saved return history. |
| `inspect` | `reviewId`; optional `offset`, `limit` | Page the same immutable comparison and read OPEN/APPLIED status. |
| `request` | `requestId` | Read the actual saved return after an interrupted reply. |
| `value` | `reviewId`, `itemId`, `side` | Read a complete base/current/returned value through the bounded JSON path. |
| `preview_choices` | Full native `input` | Validate every explicit choice without saving a return. |
| `review` | Full native `input` | Save the complete reviewed request through the original revision CAS. |
| `save_draft` | Full native `input` | Save a complete reviewer draft with its expected version. |
| `draft` | `reviewId` | Read the original saved draft and version. |

The original source upload accepts `application/json`, `application/gzip`, `application/x-gzip` or `application/octet-stream`. Original filenames are at most 512 characters and contain no path separators or control characters. Omitted content type uses the client's original octet-stream default.

For example, retain the declared source:

~~~json
{
  "workspace": "research",
  "dossierId": "ACTUAL_DOSSIER_ID",
  "source": "returned",
  "filename": "Research_Dossier.json.gz",
  "contentType": "application/gzip"
}
~~~

The result's `source.id`, byte count and SHA256 refer to the complete original upload. Preview uses that exact source ID and the actual current revision from the original dossier metadata.

## Review both branches without losing meaning

The frozen review carries `reviewId`, `comparisonSha256`, source and branch descriptors, items, offset, limit and total. Keep all three revision/SHA pairs. The default page size is 25; the maximum is 100. Continue until the complete item inventory is retained.

Items preserve source identity, presence and the original allowed choices, treatment, labels and effect:

- `AUTHORED_VALUE` permits the allowed current, returned or edited value and validates its dependencies.
- `RETAINED_TYPED_PROPOSAL` preserves a reviewed returned proposal while keeping the current native typed history authoritative. Use the applicable original workflow to adopt that proposal.
- `RETAINED_EXTENSION` keeps the returned extension available for review while preserving the current extension value.

Use the supplied `choiceLabels` and `effect`. Selecting a returned absent side can remove an authored current item; read the removal label and dependent-state effect. A suggested choice is not an applied decision. No tool invents a removal flag, unions event histories or silently changes typed state.

For each needed full value, select `side: "base"`, `"current"` or `"returned"`. A present JSON null differs from an absent side. If the full JSON value exceeds the response path's limit, select the streamed `dossier-return-value` export below. The value's own digest and the serialized JSON file digest remain distinct.

## Full choice, draft and reviewed-request inputs

`preview_choices` passes this complete native shape unchanged:

~~~text
{
  reviewId,
  expectedRevision,
  comparisonSha256,
  decisions: [{itemId, choice: CURRENT | RETURNED | EDIT, value?}, ...]
}
~~~

The actual payload is JSON with strings for the choices. Every differing item must be covered exactly once. `value` is supplied only where required for an allowed `EDIT`.

A valid choice preview returns the complete normalized native decision result, the current branch, `valid: true`, empty requirements and the proposed state digest/change count. Incomplete or incompatible choices preserve the native error and `details.requirements`.

`review` passes the complete native save request:

~~~text
{
  requestId,
  reviewId,
  expectedRevision,
  comparisonSha256,
  reviewedBy,
  reviewNote,
  decisions
}
~~~

Use the same original request ID and full body after an uncertain reply. The native store checks an existing request before attempting another revision CAS. A changed body under an accepted ID is a conflict.

The result is `{return, replayed}`. Retain the complete receipt: return/request/review/source IDs, comparison, saved revision and revision SHA256, reviewer record, full decisions and original branch descriptors. A `request` read returns `{return: null | receipt}`; compare the full receipt with the retained pending input before resolving uncertainty.

`save_draft` passes `{reviewId, expectedDraftVersion, draft}` unchanged. An absent draft has version 0 and null content. After a lost draft-save reply or version conflict, read the current full draft and preserve both versions before selecting a successor.

## Complete retained exports

Use the original `merchant_research_export` tool. It downloads a complete file into the existing private attachment, retains the exact byte descriptor and native selection, then exposes the original chunk reader.

| Export kind | Required return selectors | Complete representation |
|---|---|---|
| `dossier-return-json` | `returnReviewId`; optional `dossierReturnId` | Complete immutable comparison or selected accepted return JSON. |
| `dossier-return-markdown` | Same | Complete readable Markdown report. |
| `dossier-return-html` | Same | Complete readable HTML report. |
| `dossier-return-source` | Same | The exact original uploaded JSON/gzip bytes. |
| `dossier-return-value` | `returnReviewId`, `returnItemId`, `returnSide` | Complete serialized JSON for one original branch value. |

Every export also requires `workspace`, `dossierId` and `kind`. `expectedSha256` can pin a known file digest. The source kind always verifies its original source SHA256 and byte count.

A review-only report never incorporates an adoption that happens later. `dossierReturnId` explicitly selects an actual saved return belonging to that same review. The native export identity carries the review, selected return or null, source, comparison and accepted revision SHA256 or null independently of the content digest.

Example accepted-return JSON selection:

~~~json
{
  "workspace": "research",
  "dossierId": "ACTUAL_DOSSIER_ID",
  "kind": "dossier-return-json",
  "returnReviewId": "ACTUAL_DRV_REVIEW_ID",
  "dossierReturnId": "ACTUAL_DRR_RETURN_ID"
}
~~~

Example full returned value selection:

~~~json
{
  "workspace": "research",
  "dossierId": "ACTUAL_DOSSIER_ID",
  "kind": "dossier-return-value",
  "returnReviewId": "ACTUAL_DRV_REVIEW_ID",
  "returnItemId": "ACTUAL_DRI_ITEM_ID",
  "returnSide": "returned"
}
~~~

Keep the complete export receipt, including its `kind`, `exportId`, byte count, content type and source/native selection. `exportId` is the file SHA256. Source exports are retained under the generic binary extension, but their original content type, source filename and exact bytes preserve the JSON or gzip representation.

Read the full file with `merchant_research_file_read`:

~~~json
{
  "workspace": "research",
  "kind": "dossier-return-json",
  "exportId": "ACTUAL_EXPORTED_FILE_SHA256",
  "offset": 0,
  "limit": 65536
}
~~~

Continue with the returned `readId`, same kind/export ID and next offset. Preserve the exact ordered decoded bytes and verify their complete length/SHA256 against the export receipt. After a read expires or the attachment restarts, omit the old read ID and continue from the retained export ID and offset.

`merchant_research_file_release` releases the temporary read. The complete retained export remains. A lost export reply can be reconciled through `merchant_research_exports`, using the original dossier ID and returned inventory snapshot; retain every selected file receipt.

## Recover and finish the same operation

An interrupted mutating call preserves original workspace/dossier, request/review/source, comparison and expected revision/draft-version information when available. Keep the unchanged full input.

- For a review, read the same `requestId` before another write.
- For a draft, read its full version and content.
- For a source, retain the exact configured file, hash and filename; use the same source bytes.
- For `REVISION_CONFLICT`, retain the old review and explicitly compare the same source against the new current revision. Re-review the changed effects before choosing a new request.
- For a request conflict, preserve the accepted original and both complete inputs.
- For an export, recover the same complete retained file and read every chunk; do not replace missing source bytes with a summary.

When the reviewed return has an actual saved receipt, export the accepted dossier revision through the existing `portable-json` or `portable-gzip` export kind. Include the complete original returned source, immutable comparison, accepted-return report, full reviewed request and any unfinished drafts in the handover. Open the actual accepted portable through the original receiving workflow and verify its dossier/revision identity.

Finally detach the attachment with its original attachment ID. Detachment drains that attachment's pending calls and temporary reads; the original Research application and saved dossier keep their existing owner.

## Source and operating limits

The native source wire and decoded portable caps are 256 MiB, with the original 8 MiB saved-envelope and 64 MiB internal blob-chunk limits. Before applying a reviewed return, the engine also checks the complete portable with retained branches against the original 256 MiB portable limit; `PORTABLE_SIZE_LIMIT` leaves the current dossier unchanged. Review/draft requests are at most 16 MiB, small control requests 1 MiB, and complete return JSON responses 64 MiB. Large values and file exports have streamed paths. Request IDs are at most 200 characters, reviewer labels 512 and notes 16,000.

For large plain input, select an existing original gzip portable from its producing Research workspace when available, retaining that file’s own exact source identity. No source is silently recompressed. The decoded and complete-portable limits still apply.

These tools use the [original adapter](research-dossier-returns.mjs), [catalog](catalog/research-dossier-returns.mjs), [shared attachment and retainer](research-workspace.mjs) and [native client](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/dossier-returns/client.mjs). Keep the complete selected installed source and original notices with a portable delivery.
