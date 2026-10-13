# Continue a customer programme with reviewed collaborator returns

This continuation takes the complete ZIP produced by the original Research customer programme, the actual original workspace, and one or more complete collaborator return files. It prepares the native three-way comparison, retains every differing item and complete value, and applies only an explicit native review request. After the selected returns are accepted, it produces a new complete customer ZIP and opens the accepted dossier in an independent editable workspace.

The original baseline ZIP stays byte-for-byte intact. Its source editions, chronology, citation decisions, analyst workbooks, Merchant and browser reports remain available inside that original delivery. The successor's current dossier report and portable carry the accepted returns. A baseline workbook remains a baseline workbook; this continuation does not silently rerun scientific analysis or recalculate its conclusions.

The command is part of the existing customer-programme implementation:

~~~sh
node stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-programme/programme.mjs --returns --help
~~~

The original customer programme remains available with its unchanged options. The new exported entry is `runCustomerReturnProgramme(options)`; `runCustomerReturnsCli(args)` implements this terminal command.

## Native source and runtime

Use the complete maintained source containing both the customer programme and the original dossier-return implementation. The required source is the existing Research server, store, client, portable validator, return engine/source/store/contracts/client/routes, and their complete declared dependencies and assets. Keep the original LICENSE and every source member selected by the engine manifest.

The engine selector accepts the original RIS source manifest and the original Merchant distribution manifest. It verifies every selected file's complete bytes, byte count and SHA-256. It also compares the executing source tree with the selected tree when the roots differ. The current customer-programme implementation includes `returns.mjs` and this guide; those complete bodies are packaged alongside the original engine and checked against any matching manifest members. Assemble the exact current implementation in the selected engine before invoking it. An old manifest that claims different bytes for a changed implementation file must be regenerated through the original source builder or explicitly composed source selection.

Node 24 and Python 3 are the runtime for this programme. Preserve the original engine's declared runtime dependencies, including the installed packages used by its server and validators. The ZIP contains source, assets, licensing and native outputs; it does not claim that host-installed Node/Python packages or browser binaries are bundled. This return continuation does not start Playwright. The original browser, source inspection, compare/review and editable workspace remain available when the final package is opened.

The original `receive-customer.py` builds, verifies and receives the final ZIP. Its original limits remain in force: at most 256 MiB per member and final archive, 1 GiB total uncompressed membership, 20,000 selected members, and a 16 MiB package manifest. The selection can impose a smaller final archive limit. All original portable and dossier-return limits also remain active, including the 256 MiB wire/decoded source ceilings, 8 MiB native state boundary and 16 MiB reviewed-request limit. Do not split or trim an original branch to evade these limits.

## What must already exist

Start from a completed customer-programme ZIP and its actual final native receipt. Supply the complete original archive, not a report-only extract. The continuation independently verifies and receives that ZIP using its packaged original receiver. It retains its exact archive identity, package manifest, selected dossier, complete revision history and original operation identity.

The destination is the actual existing Research workspace in which the returns will be reviewed. The selection binds its native `workspace_id` and original `dossier_id`; portable copies can share a dossier ID while having different workspace identities. The first comparison requires the exact selected current revision and revision SHA. That current history must contain the complete baseline history as an identical prefix.

A later selected return is compared against the actual current head when its preview request is first retained. This includes any legitimate intervening staff edits. Its history must still contain the baseline and every previously accepted return revision. Once a comparison is prepared, its current/base/returned identities are immutable. The programme will not change that comparison to work around a revision conflict.

Each collaborator supplies the complete original JSON or gzip portable. Keep its exact filename, content type, byte count and SHA-256. A content hash identifies bytes; it does not establish who authored or approved them.

## Select the existing workspace and head

Use the original client connection and actual metadata/history methods. There is no `connect()` call.

~~~js
import {ResearchWorkspaceClient} from
  '/absolute/checkout/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/workspace-client.mjs';

const client = ResearchWorkspaceClient.fromFile('/absolute/private/connection.json');
try {
  const status = await client.status();
  const dossierId = 'ACTUAL_NATIVE_DOSSIER_ID';
  const metadata = await client.metadata(dossierId);
  const history = [];
  let offset = 0;
  do {
    const page = await client.section(dossierId, {
      section: 'revisions', revision: metadata.revision, offset, limit: 100
    });
    if (page.revision !== metadata.revision) throw new Error('History changed');
    history.push(...page.items);
    offset = page.nextOffset;
  } while (offset !== null);
  if (history.length !== metadata.revision) throw new Error('Incomplete history');
  console.log({
    workspace_id: status.workspaceId,
    dossier_id: dossierId,
    expected_revision: metadata.revision,
    expected_revision_sha256: history.at(-1).sha256
  });
} finally {
  await client.close();
}
~~~

The caller owns that already-running connection. The programme itself starts and closes an original local Research listener for the explicitly selected workspace, reusing its retained port on continuation. It rejects another workspace identity and does not silently choose another store. Its private listener selection contains no public authentication token. Use one operating owner for the same continuation directory.

## Write the complete return selection

The following is a shape example. Replace every placeholder with measured original input and actual native identities before computing its SHA-256.

~~~json
{
  "schema": "sf88.research-customer-returns.v1",
  "operation_id": "customer-evidence-return-20261013",
  "customer_label": "Customer evidence workstream",
  "baseline": {
    "file": "baseline/Complete_Customer_Programme.zip",
    "bytes": 1234567,
    "sha256": "ACTUAL_BASELINE_ARCHIVE_SHA256"
  },
  "workspace_id": "ACTUAL_RESEARCH_WORKSPACE_ID",
  "dossier_id": "ACTUAL_NATIVE_DOSSIER_ID",
  "expected_revision": 12,
  "expected_revision_sha256": "ACTUAL_CURRENT_REVISION_SHA256",
  "maximum_total_items": 100,
  "returns": [
    {
      "key": "collaborator-one",
      "source": {
        "file": "returns/collaborator-one.research.json.gz",
        "filename": "collaborator-one.research.json.gz",
        "contentType": "application/gzip",
        "bytes": 234567,
        "sha256": "ACTUAL_COMPLETE_RETURN_SHA256"
      },
      "maximum_items": 100
    },
    {
      "key": "collaborator-two",
      "source": {
        "file": "returns/collaborator-two.research.json",
        "filename": "collaborator-two.research.json",
        "contentType": "application/json",
        "bytes": 345678,
        "sha256": "ACTUAL_COMPLETE_RETURN_SHA256"
      },
      "maximum_items": 100
    }
  ],
  "output": {
    "filename_stem": "Customer_Reviewed_Returns",
    "maximum_archive_bytes": 100663296
  }
}
~~~

Relative input paths resolve against the original selection file's directory. Absolute input paths must be canonical. Symlinks and source changes are rejected through the original source readers. The complete selection and each exact original file are retained before customer mutations; subsequent continuation can reuse those retained inputs even if the incoming transport copy is no longer present.

A selection has one to 32 uniquely named return stages. Every selected source must already exist as a complete original file; future collaborator bytes are never represented by placeholders. `maximum_total_items` is the combined explicit bound across inherited accepted returns from a prior continuation ZIP and all newly selected returns. The example limits that complete continuation chain to 100 differing items. It is checked from the verified original receipts and complete retained comparisons before review or apply. Their order is explicit. `maximum_items` is an explicit whole-comparison bound, not a page limit or permission to omit differences. It may be zero for a return with no differing items; even then the native review request must explicitly contain an empty decisions array. The original native validator remains authoritative for limits and coherent choices.

The operation does not infer a buyer, price, scientific appraisal, source ownership or a missing commissioning agreement. Those belong to the original customer selection and existing relationship owner. Return choices must be within the actual authority of the operator.

## Prepare the first comparison

Hash the complete UTF-8 selection file, then invoke the complete continuation. Keep this command and directory for all subsequent stages.

~~~sh
sha256sum /absolute/incoming/return-selection.json

node /absolute/checkout/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-programme/programme.mjs \
  --returns \
  --selection /absolute/incoming/return-selection.json \
  --selection-sha256 ACTUAL_SELECTION_SHA256 \
  --directory /absolute/private/customer-return-programme \
  --workspace /absolute/private/original-research-workspace \
  --engine-root /absolute/checkout \
  --engine-manifest /absolute/ENGINE_SOURCE.json \
  --engine-manifest-sha256 ACTUAL_ENGINE_MANIFEST_SHA256 \
  --python python3 \
  --node node
~~~

The programme verifies the baseline archive and complete selected engine, opens the exact workspace, verifies the first selected head against the baseline history, retains the incoming source through the native source API, and freezes the native comparison. Before asking for decisions it exports the complete comparison in JSON, Markdown and HTML, the original source stream, and every present base/current/returned full value.

When no exact reviewed request has been supplied, the command returns `state: "REVIEW_REQUIRED"`. This means that explicit choices are missing. It does not create a new human-only approval policy. An authorized person or authorized agent can inspect the actual complete values and author the native request. No choice, reviewer name or review note is auto-filled.

The current response identifies the exact stage, original workspace/dossier, comparison hash, all three native heads, complete comparison path and available files. Files for each stage are under:

~~~text
delivery/returns/STAGE/original-return.bin
delivery/returns/STAGE/COMPARISON.json
delivery/returns/STAGE/SOURCE_RECEIPT.json
delivery/returns/STAGE/comparison.json
delivery/returns/STAGE/comparison.md
delivery/returns/STAGE/comparison.html
delivery/returns/STAGE/comparison.source.bin
delivery/returns/STAGE/values/ITEM_ID-base.json
delivery/returns/STAGE/values/ITEM_ID-current.json
delivery/returns/STAGE/values/ITEM_ID-returned.json
delivery/returns/STAGE/REVIEW_INSTRUCTIONS.json
~~~

A value file is present only for a side whose `present` field is true. The complete comparison records absent sides explicitly. Each full value JSON retains `reviewId`, `itemId`, `side`, `present`, the native value digest and the complete value. The file descriptor SHA-256 identifies the full serialized JSON bytes; the digest within that JSON identifies the original component. They are different identities and must not be substituted.

The original HTTP download selection binds review/source/comparison and item/side. Full file bytes are checked against the original native descriptor before public publication. Download attempts and receipt recovery stay in the private operation directory; the final archive contains only the explicit public outputs and source.

## Inspect and author the native review request

Read every differing item's actual `allowedChoices`, `choiceLabels`, `effect`, `treatment`, status and full values. A summary is not a replacement for a large original field or record.

Use the original helper if further inspection is needed:

~~~js
const returns = client.dossierReturns(actualDossierId);
const page = await returns.list({reviewId: actualReviewId, offset: 0, limit: 100});
const full = await returns.value({
  reviewId: actualReviewId, itemId: actualItemId, side: 'returned'
});
~~~

Follow every page when reading directly; the continuation already exports the complete comparison. All explicit decisions must be represented exactly once.

The native meanings matter:

- `CURRENT` keeps current authority. If the current authored row is absent, it declines the incoming addition.
- `RETURNED` on an authored value adopts that value. If the returned authored row is absent, the supplied native choice label identifies the explicit removal.
- `RETURNED` on a typed history or unknown extension retains a source-bound reviewed proposal. It does not replace the current typed history or replay foreign events as local operations.
- `EDIT` is available only where the native engine permits it. For a native member edit, supply the complete original object with only allowed authored fields changed; preserve unknown fields and binding identities. Ordinary field edits use the field value.

Do not add a `remove` flag or rewrite a typed event sequence. The native decision schema remains `{itemId, choice, value?}`.

A complete request has this shape:

~~~json
{
  "requestId": "one-retained-request-id",
  "reviewId": "ACTUAL_DRV_ID",
  "expectedRevision": 12,
  "comparisonSha256": "ACTUAL_COMPARISON_SHA256",
  "reviewedBy": "Actual authorized reviewer",
  "reviewNote": "Reason and disposition of the reviewed changes",
  "decisions": [
    {"itemId": "ACTUAL_DRI_ID", "choice": "CURRENT"},
    {"itemId": "ACTUAL_DRI_ID", "choice": "RETURNED"}
  ]
}
~~~

Replace the example decisions with one permitted explicit choice for every actual item. Preserve their submitted order and values. `reviewNote` is optional; omission stays omitted in the retained/submitted file, while receipt verification recognizes the native empty-string default. Request IDs may be at most 200 characters, reviewer at most 512 and review note at most 16,000. The whole reviewed request is bounded at 16 MiB.

## Apply, recover, and continue to the next return

Hash the exact request file. Repeat the original command with these three additional options:

~~~sh
  --review-key collaborator-one \
  --review-file /absolute/review/collaborator-one.request.json \
  --review-sha256 ACTUAL_EXACT_REQUEST_FILE_SHA256
~~~

The programme retains those original bytes before sending anything. It validates the complete item selection, checks the original request ID for an already accepted result, and otherwise obtains the original choice preview before applying the unchanged request.

If the response is lost, rerun the same command in the same directory. The programme queries that request ID before any new CAS attempt. It verifies the full accepted receipt: source/review/comparison, current/base/returned branches, reviewer/note, exact decision array and accepted revision hash. A later local edit does not invalidate an already accepted receipt. The accepted historical revision remains the archive selection.

The submitted request file is immutable within the stage. Supplying a different file, even for a seemingly equivalent set of decisions, is rejected. If choices have not yet been submitted, finish reviewing them before selecting that file. If the native request has an unknown result, reconcile that request; do not choose a replacement ID or silently prepare another comparison.

After an accepted stage, the programme retains the original receipt and complete accepted report/source exports. It then prepares the next selected return against the actual current head. That head must still include the previous accepted revision with the same hash. It returns the next `REVIEW_REQUIRED` selection when its reviewed request is absent. Repeat with that stage's exact request file.

A revision conflict before acceptance leaves the original comparison and request intact. Resolve the actual workspace/request state using the native APIs. Do not edit the retained operation or its comparison to suppress the conflict. A new comparison requires an explicitly new continuation selection and directory, preserving the incomplete operation as lineage.

## A later collaborator round

If the second return does not exist when the first is reviewed, complete a one-return plan first. Keep its complete ZIP/hash and actual accepted receipt. When the next full return arrives, create a new explicit plan and private operation directory. Select the first completed ZIP as this plan's baseline, select the same actual workspace/dossier and its actual current revision/hash, and keep the agreed `maximum_total_items` cumulative bound (for example 100). The first ZIP and every earlier nested baseline remain unchanged.

A continuation ZIP carries `PROGRAMME.json.returnHistory`: one complete source identity and accepted native receipt for each previous return, together with the operation/key, comparison, exact reviewed-request hash and actual decision count. It also records `reviewedItemCount` and `maximumTotalItems`. The next continuation validates every inherited accepted revision against the baseline history, rejects duplicate request/return IDs, requires the baseline's own stage receipts to be the exact final history suffix, and derives counts from the retained native decision arrays. It then queries every original native request ID and immutable review in the selected workspace; the exact receipt, source SHA/length, comparison, item count and branch identities must agree before a new stage begins.

No manual prior-count field can replace those receipts. The code counts each inherited receipt once and adds every new complete comparison before apply. A later staff edit may advance the actual selected head, but it cannot remove or change a previously accepted revision. A new plan therefore cannot reset the agreed cumulative bound merely by selecting the previous delivery as its baseline.

The first continuation of an original customer-programme baseline starts its return history at zero. Historical work that predates that original commissioning baseline is preserved in its native history; it is not silently counted as a newly commissioned collaborator round. A return continuation baseline must contain its complete cumulative return history; an incomplete or manually assembled replacement is rejected.

## Completed successor

After all selected returns are accepted, the programme obtains the exact final accepted historical metadata, complete revision history, HTML/Markdown reports and JSON/gzip portable. It preserves later local revisions in the operating workspace. The final ZIP selects the last accepted return revision.

The new delivery contains:

- The complete unchanged original customer-programme ZIP, including its original engine, inputs, citation/analyst/browser outputs and prior editable dossier.
- Every original collaborator return wire, native source receipt, immutable comparison, all full present side values, exact original request bytes and native accepted receipt.
- Complete comparison and accepted JSON, Markdown, HTML and original-source exports for each stage.
- The final accepted dossier metadata/history, complete editable portable and current reports.
- Every member of the selected complete original engine manifest, original licenses/assets, and the exact current customer-programme implementation and guides.
- `PROGRAMME.json`, the explicit original source manifest, readable `START_HERE.html` and the complete package inventory.

Native source metadata and hash identities are retained without claiming they prove authorship. Private listener selections, authentication tokens, process logs, download attempts and live workspace internals stay outside the public archive.

The original packager verifies all members while writing, verifies the complete candidate ZIP before exclusive publication, and reuses an already identical complete archive. Existing different outputs remain preserved and cause an explicit error.

The original receiver extracts the complete selected archive, runs the engine actually included in that archive, opens the portable into a separate editable workspace, and compares the accepted metadata and complete history. Only after receiving verification and owned listener/client closure does the continuation retain `COMPLETE.json`.

The result identifies the archive, manifest hash, selected native revision, original return receipts, receiving workspace and complete result files. This is execution evidence only when the command has actually completed; source publication or an example selection alone does not claim a customer run.

## Independently inspect and open a delivery

Use the original Python receiver to verify and open the complete ZIP:

~~~sh
python3 /absolute/checkout/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-programme/receive-customer.py \
  inspect --archive /absolute/Customer_Reviewed_Returns.zip --sha256 ACTUAL_ARCHIVE_SHA256

python3 /absolute/checkout/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-programme/receive-customer.py \
  receive --archive /absolute/Customer_Reviewed_Returns.zip --sha256 ACTUAL_ARCHIVE_SHA256 \
  --directory /absolute/private/independent-receiving --node node --python python3 \
  --result /absolute/private/independent-receiving/RECEIVED.json
~~~

Then use the extracted original engine to serve that editable workspace:

~~~sh
node /absolute/private/independent-receiving/package/engine/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-programme/receiving.mjs \
  --open --serve \
  --package-directory /absolute/private/independent-receiving/package \
  --workspace-directory /absolute/private/independent-receiving/editable-research \
  --manifest-sha256 ACTUAL_PACKAGE_MANIFEST_SHA256
~~~

The authenticated URL is printed only to the owning terminal. Open it locally, inspect the saved return history and full source, and continue editing through the original Research application. Reopening the same archive uses the original identical-history rules and preserves a newer compatible local head. A divergent same-revision history remains a native conflict; it is not silently overwritten.

To work separately on a collaborator's branch, use its complete original source export through the original portable receiver in a different selected workspace. Retained typed proposals can then be considered through their own original typed review operations. This continuation records the collaborator disposition; it does not manufacture those later typed decisions.

## Recovery boundaries

| Boundary | Retained authority | Continuation behavior |
| --- | --- | --- |
| Incoming source disappears | Exact selected input already retained | Reuse and verify the original retained bytes. |
| Source response is lost | Exact source hash/filename/content type | Retry the same native source intake. |
| Preview response is lost | Saved source ID and exact expected current revision/hash | Retry that preview; do not move to a new head implicitly. |
| Reviewed request response is lost | Exact original request bytes and request ID | Query original request receipt before CAS; verify full accepted selection. |
| Native download exists but its receipt was not saved | Preserved private attempt | Obtain a fresh same-selection native export and retain its descriptor before public publication. |
| Public export already exists | Retained original native descriptor | Verify every complete byte and reuse; never overwrite a differing file. |
| Retained candidate is missing | Original native descriptor and immutable export selection | Export to a fresh private attempt and require the same complete identity. |
| Final ZIP already exists | Original complete package manifest | Verify full membership and hashes before reuse. |
| A later staff edit exists after acceptance | Accepted revision and full native history | Export the accepted historical revision; preserve the later local head. |

Keep the same original operation, selection hash, engine identity and private directory during reentry. Preserve failed attempts and their original files. Source-only fixes or an explicitly new customer selection belong in a separate reviewed successor, with the original operation retained.
