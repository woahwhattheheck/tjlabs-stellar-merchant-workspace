# Receive and review a returned Research dossier

The dossier-return workflow continues a copy of an existing Research dossier after the sender and recipient have both worked on it. It retains the complete returned file, finds the common saved ancestor, shows the current and returned values together, and saves an explicit reviewed result through the original dossier revision check.

The current dossier, its returned branch and their common base each have a revision number **and** a SHA256. Revision numbers alone do not identify a branch. Keep the complete returned portable file and its original digest throughout review.

The implementation uses the original [dossier store](../dossier.mjs), [source receiver](source.mjs), [return engine](engine.mjs), [return store](store.mjs), [return contracts](contracts.mjs) and [authenticated client](client.mjs). The [command family](cli.mjs) and [Merchant tools](../../../../../stellar-forge/mcp-merchant-operator/DOSSIER_RETURNS.md) operate that same saved state.

## What the review means

Every differing item has an original item ID, the three branch sides, native allowed choices, a treatment and the supplied choice labels/effect. A side records whether the value exists. An absent value is different from a present JSON null.

| Native treatment | What a reviewed choice does |
|---|---|
| `AUTHORED_VALUE` | Selects an allowed current or returned authored value, or an explicit edited value where `EDIT` is allowed. The original engine validates references and dependent state. |
| `RETAINED_TYPED_PROPOSAL` | Retains the reviewed returned proposal with its exact source binding. The current typed history remains authoritative. Adopt that proposal through the original eligibility, extraction, appraisal, citation or other applicable workflow. |
| `RETAINED_EXTENSION` | Retains the returned extension for review while preserving the current extension value. Unknown fields are not silently activated. |

Use the actual item `allowedChoices`, `choiceLabels` and `effect`. A suggested choice is still a suggestion. The completed decision list explicitly selects every differing item once.

Selecting `RETURNED` for an item whose returned side is absent can remove an authored current question, selection or finding. Read the supplied removal label and full effect first. There is no additional removal flag. Native dependency validation can reject a set of individually understandable choices if their combined result would reference removed or incompatible state.

The return workflow preserves typed proposals without pretending that a union of event arrays is a valid native history. A retained proposal remains available for the relevant original review operation.

## Open the existing product

Use the already installed Research application and its private managed connection record. The client verifies the original listener and workspace identity before operating on the selected dossier.

~~~sh
starforge registrations --command research-dossier-returns
starforge research-dossier-returns returns-help
~~~

The same commands are available under `starforge research-client`. A source checkout can run the exact selected module directly:

~~~sh
node /absolute/engine/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/dossier-returns/cli.mjs returns-help
~~~

Every working command requires:

~~~text
--connection-file /absolute/private/application-url.json
--directory /absolute/original/dossier-store
--id ORIGINAL_DOSSIER_ID
~~~

These are the original listener connection, store and dossier. Client attachment does not start a replacement server. Keep connection records and credentials outside a delivery archive.

The examples below use descriptive placeholders. Replace them with values from the actual source descriptor, frozen review and saved receipt. Prepare a private working directory before selecting output paths; the file writer does not create missing parent directories.

## 1. Retain the complete returned file

Obtain the original full Research portable JSON or gzip file and its independently supplied or locally verified SHA256. Keep its actual filename and content type when known. This step validates and retains the returned source; it does not overwrite the current dossier.

~~~sh
starforge research-dossier-returns returns-source \
  --connection-file /absolute/private/application-url.json \
  --directory /absolute/original/dossier-store \
  --id ORIGINAL_DOSSIER_ID \
  --source-file /absolute/received/Research_Dossier.json.gz \
  --sha256 ORIGINAL_RETURNED_FILE_SHA256 \
  --filename Research_Dossier.json.gz \
  --content-type application/gzip \
  --result-file /absolute/private/return-review/source-result.json
~~~

The complete result contains `source.id`, `source.sha256`, `source.bytes`, `source.filename`, `source.contentType` and `source.incomingHead`. Preserve it with the input file. A source ID has the form `drs_` followed by 64 lowercase hexadecimal characters.

The source must be a compatible full portable dossier with valid original history. A ZIP containing a portable file is not itself the source file for this command. Select the actual portable member using the original package receiving instructions.

## 2. Freeze the comparison against the current head

Read the current dossier metadata through the original client and retain its revision:

~~~sh
starforge research-client metadata \
  --connection-file /absolute/private/application-url.json \
  --directory /absolute/original/dossier-store \
  --id ORIGINAL_DOSSIER_ID
~~~

Save the following complete native input as a private JSON file, using the actual source ID and current revision:

~~~json
{
  "sourceId": "ACTUAL_DRS_SOURCE_ID",
  "expectedRevision": 7
}
~~~

Then create the frozen review:

~~~sh
starforge research-dossier-returns returns-preview \
  --connection-file /absolute/private/application-url.json \
  --directory /absolute/original/dossier-store \
  --id ORIGINAL_DOSSIER_ID \
  --input /absolute/private/return-review/preview-input.json \
  --input-sha256 ACTUAL_PREVIEW_INPUT_SHA256 \
  --result-file /absolute/private/return-review/preview-result.json
~~~

Retain `reviewId` (`drv_` plus 64 hexadecimal characters), `comparisonSha256`, the full source descriptor, and all three branch descriptors. The preview includes paged item information and the total. No return has been applied by this preview.

If no common ancestor exists, the native engine reports `RETURN_NO_COMMON_ANCESTOR`. Keep both full dossiers and the reported source identity. The return workflow does not manufacture a base or replace the original dossier to make that error disappear.

## 3. Review every item and its complete values

Inspect the saved review in pages. The default page size is 25 and the maximum is 100.

~~~sh
starforge research-dossier-returns returns-inspect \
  --connection-file /absolute/private/application-url.json \
  --directory /absolute/original/dossier-store \
  --id ORIGINAL_DOSSIER_ID \
  --review ACTUAL_DRV_REVIEW_ID \
  --offset 0 --limit 100 \
  --result-file /absolute/private/return-review/items-000000.json
~~~

Continue with the returned page information until all `total` items are accounted for. Keep the same review ID and comparison digest. Each differing item has an ID beginning `dri_`. The item sides include presence, digest and summary information; the full value remains available separately.

Download each large or detailed side that is needed for the decision:

~~~sh
starforge research-dossier-returns returns-value \
  --connection-file /absolute/private/application-url.json \
  --directory /absolute/original/dossier-store \
  --id ORIGINAL_DOSSIER_ID \
  --review ACTUAL_DRV_REVIEW_ID \
  --item ACTUAL_DRI_ITEM_ID \
  --side returned \
  --out /absolute/private/return-review/item-returned.json \
  --result-file /absolute/private/return-review/item-returned-file.json
~~~

Repeat with `base` or `current` as required. The streamed JSON preserves `reviewId`, `itemId`, `side`, `present`, the value digest and the complete value when present. Keep the value digest separate from the SHA256 of the serialized JSON file; they identify different things.

## 4. Keep the full reviewer draft

Read the original saved draft:

~~~sh
starforge research-dossier-returns returns-draft \
  --connection-file /absolute/private/application-url.json \
  --directory /absolute/original/dossier-store \
  --id ORIGINAL_DOSSIER_ID \
  --review ACTUAL_DRV_REVIEW_ID \
  --result-file /absolute/private/return-review/draft-read-01.json
~~~

An absent draft returns `draftVersion: 0` and `draft: null`. Saving uses the exact native input shape `{reviewId, expectedDraftVersion, draft}`. Keep the full draft object, including its original review, comparison, selections and any pending request information. Do not replace it with a summary of the decisions.

~~~sh
starforge research-dossier-returns returns-save-draft \
  --connection-file /absolute/private/application-url.json \
  --directory /absolute/original/dossier-store \
  --id ORIGINAL_DOSSIER_ID \
  --input /absolute/private/return-review/full-versioned-draft.json \
  --input-sha256 ACTUAL_DRAFT_INPUT_SHA256 \
  --result-file /absolute/private/return-review/draft-save-01.json
~~~

`RETURN_DRAFT_CONFLICT` means the expected version is no longer current. Read the saved full draft, preserve both versions and choose the reviewed successor. If a save response was interrupted, first read the original draft and compare its full content/version before another versioned write.

Native drafts and browser recovery files are continuation material. Include their complete exports explicitly when transferring an unfinished review; a regular dossier portable file is not a substitute for an unsubmitted draft.

## 5. Preview the complete decision set

A decision is `{itemId, choice}`, with `value` only when required for `EDIT`. Preserve the original item ID and use only choices allowed for that item. Do not add invented event or source identifiers.

Save a complete choice-preview input:

~~~json
{
  "reviewId": "ACTUAL_DRV_REVIEW_ID",
  "expectedRevision": 7,
  "comparisonSha256": "ACTUAL_COMPARISON_SHA256",
  "decisions": [
    {
      "itemId": "ACTUAL_AUTHORED_ITEM_ID",
      "choice": "CURRENT"
    },
    {
      "itemId": "ACTUAL_RETAINED_PROPOSAL_ITEM_ID",
      "choice": "RETURNED"
    }
  ]
}
~~~

The two rows illustrate the shape only. The real file must cover the full actual item inventory exactly once.

~~~sh
starforge research-dossier-returns returns-preview-choices \
  --connection-file /absolute/private/application-url.json \
  --directory /absolute/original/dossier-store \
  --id ORIGINAL_DOSSIER_ID \
  --input /absolute/private/return-review/complete-choices.json \
  --input-sha256 ACTUAL_CHOICES_INPUT_SHA256 \
  --result-file /absolute/private/return-review/choices-preview.json
~~~

A valid result retains the review and comparison identities, current branch, complete decisions, `valid: true`, empty requirements and the proposed result digest/change count. Missing or invalid choices return the native 422 error and `details.requirements`. Resolve those exact requirements before committing.

## 6. Save one reviewed request

Add the explicit request ID and reviewer record to the complete choices:

~~~json
{
  "requestId": "return-review-20261012-001",
  "reviewId": "ACTUAL_DRV_REVIEW_ID",
  "expectedRevision": 7,
  "comparisonSha256": "ACTUAL_COMPARISON_SHA256",
  "reviewedBy": "Named programme reviewer",
  "reviewNote": "The complete branch comparison and selected effects were reviewed.",
  "decisions": [
    {
      "itemId": "ACTUAL_ITEM_ID",
      "choice": "CURRENT"
    }
  ]
}
~~~

Again, use the actual complete decision array. The request ID is an operator-selected stable identity, up to 200 characters. Keep this original full request file and its hash before dispatch.

~~~sh
starforge research-dossier-returns returns-review \
  --connection-file /absolute/private/application-url.json \
  --directory /absolute/original/dossier-store \
  --id ORIGINAL_DOSSIER_ID \
  --input /absolute/private/return-review/reviewed-request.json \
  --input-sha256 ACTUAL_REVIEWED_REQUEST_SHA256 \
  --result-file /absolute/private/return-review/review-result-01.json
~~~

The native result is `{return, replayed}`. Its return receipt includes the original return/request/review/source IDs, comparison digest, saved revision and revision SHA256, reviewer record, complete decisions and all branch descriptors. Keep that full receipt. A return ID begins `drr_`.

The original store reconciles an identical saved request before attempting a new revision CAS. An identical retry recovers that actual receipt. A changed body with the same request ID reports `RETURN_REQUEST_CONFLICT`; it cannot silently replace an earlier reviewed request.

## Recover interruption or a changed current revision

| Condition | Continue the original operation |
|---|---|
| Review response was interrupted | Run `returns-request --request ORIGINAL_REQUEST_ID`. Compare the complete saved receipt with the unchanged pending request: review/source/comparison, reviewer, decisions and original current/base/returned branches. |
| Request lookup returns `return: null` | The lookup found no saved return for that ID. Retain the original pending request and follow the native current revision result before an exact retry. A missing response alone is not permission to create another ID. |
| `REVISION_CONFLICT` | Read the current dossier, retain the old complete review, then explicitly preview the same source against the new current revision and review the new comparison. Do not relabel the old comparison digest or copy choices without examining their new effects. |
| `RETURN_COMPARISON_MISMATCH` | Reopen the exact saved review and compare the source/branch/comparison identities with the selected input. |
| `RETURN_REQUEST_CONFLICT` | Inspect the saved request and both full inputs. Preserve the original accepted request. A genuinely new reviewed intent needs its own explicitly selected request after the required review. |
| `RETURN_DRAFT_CONFLICT` | Read the current native draft and retain both full versions before selecting a successor. |
| CLI result file or stdout fails after a native response | The CLI reports `nativeResultAvailable` with original IDs and a recovery instruction. Read the saved result file if present; otherwise recover the same native request/draft/source. A completed download retains its original path and digest. |
| Existing output contains different bytes | Keep that file. Use a new explicit output name for the later result. The CLI never overwrites a different saved result. |

For request recovery:

~~~sh
starforge research-dossier-returns returns-request \
  --connection-file /absolute/private/application-url.json \
  --directory /absolute/original/dossier-store \
  --id ORIGINAL_DOSSIER_ID \
  --request ORIGINAL_REQUEST_ID \
  --result-file /absolute/private/return-review/request-recovery-01.json
~~~

A repeated review can report `replayed: true`; a previously saved result file may contain the earlier `replayed: false` response. Those are distinct response bytes. Preserve the original file and select a new result filename for the recovery read.

## Export the complete review, return and source

The export selection is explicit:

| Selection | Meaning |
|---|---|
| `--review REVIEW_ID` without `--return` | The immutable comparison and its original branch values. It never incorporates a later adoption. |
| `--review REVIEW_ID --return RETURN_ID` | That exact accepted return receipt, which must belong to the selected review. |
| `--format source` | The complete original uploaded portable bytes, with the original source digest and length. |

Formats are `json`, `md`, `html` and `source`. Every download returns the original file path, filename, content type, byte count and SHA256. Retain the file receipt and its native selection independently of the file's content digest.

~~~sh
starforge research-dossier-returns returns-export \
  --connection-file /absolute/private/application-url.json \
  --directory /absolute/original/dossier-store \
  --id ORIGINAL_DOSSIER_ID \
  --review ACTUAL_DRV_REVIEW_ID --return ACTUAL_DRR_RETURN_ID \
  --format json \
  --out /absolute/private/return-review/accepted-return.json \
  --result-file /absolute/private/return-review/accepted-return-file.json
~~~

Repeat for HTML and Markdown if needed. Export the source separately using `--format source`, a filename matching the original JSON/gzip representation, and `--sha256 ORIGINAL_RETURNED_FILE_SHA256`.

After the return is saved, export the exact accepted dossier revision through the original general portable command:

~~~sh
starforge research-client export \
  --connection-file /absolute/private/application-url.json \
  --directory /absolute/original/dossier-store \
  --id ORIGINAL_DOSSIER_ID \
  --revision ACTUAL_ACCEPTED_REVISION \
  --format json.gz \
  --out /absolute/private/return-review/Research_Dossier_Accepted.json.gz
~~~

The native return receipt identifies the accepted revision. Keep any later dossier edits as their own later revisions. The [installed receiving guide](../../../../../products/research/RECEIVING.md#21-receive-a-reviewed-dossier-return) explains the complete editable handover and original reopen command.

## Limits and full source retention

| Boundary | Native limit |
|---|---:|
| Returned portable wire bytes | 256 MiB |
| Decoded returned portable | 256 MiB |
| Complete native portable with retained branches | 256 MiB |
| Original saved envelope | 8 MiB |
| Original internal blob chunk | 64 MiB |
| Review or draft request | 16 MiB |
| Small control request | 1 MiB |
| Complete native JSON return response | 64 MiB |
| Review page | 25 by default; 100 maximum |
| Request ID | 200 characters |
| Reviewer label | 512 characters |
| Review note | 16,000 characters |

These limits apply together. The original portable validators enforce valid full history and all source/state requirements. Before the reviewed return commits, the original engine checks that the complete portable, including retained branches and sources, still fits the native 256 MiB limit. If it does not, `PORTABLE_SIZE_LIMIT` leaves the current dossier unchanged.

For a large plain JSON input, use an existing original gzip portable from the producing Research workspace when one is available and explicitly select its actual file identity. The receiver retains the selected upload byte for byte. It does not silently recompress, replace or relabel that source. A smaller wire representation does not waive the decoded or complete-portable limits. Large item values and original source files have streamed download paths.

The CLI reads full JSON review/draft inputs up to the 16 MiB request ceiling. The native route applies its specific control or review limit. Reports and source exports travel as complete streamed files. Keep raw source, complete review/decision/draft files and original native receipts together; none should be reconstructed from clipped terminal output.
