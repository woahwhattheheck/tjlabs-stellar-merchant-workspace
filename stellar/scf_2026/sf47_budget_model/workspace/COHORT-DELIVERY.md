# Cohort delivery

Cohort delivery connects a saved customer adoption plan to its original frozen Cohort acceptance review. It gives the operator a complete view of scheduled purchase opportunities, original customer intents, delivery dates, accountable buyer operators, and remaining work.

Open **Grant Operations → Cohort delivery** in the original operating case. The same calculation is available through the installed `grant-cohort-delivery` command and the typed `@tokenjunkielabs/starforge-merchant/grant/cohort-delivery` module.

## Open the original plan and review

1. Save the current adoption plan from **Customer adoption plan** as an edition in the case.
2. Select the original completed or in-progress review in **Cohort acceptance** and freeze that review using its existing workflow.
3. Open **Cohort delivery**, choose the saved adoption plan and frozen cohort review, and select **Compare selected sources**.

A complete comparison JSON file can also be opened with **Open JSON**. The CLI also accepts the complete saved delivery schedule report and selects its retained candidate plan. The selected documents must retain the same original case and tranche. A different source plan revision or UTC window remains visible in the comparison's source differences.

The comparison receives the whole saved plan edition and whole native `COHORT_EVALUATION` review, including its snapshot, original purchase history, selected participants, source metadata, and rule. Download either original document from **Saved editions and sources**.

## Read the delivery report

The overview shows planned paid purchases, recorded cohort completions, recorded independent completions, remaining due opportunities, unmatched intent groups, and work completed after its planned time.

The opportunity table separates each scheduled acquisition date and named funding group. Use the search box or filter to find due work, late delivery, or adjusted outcomes. Each row retains its original opportunity identity and associated intent groups. A funding group is one acquisition with its original useful uses attached. Prepaid uses retain the planner's original acquisition count. Planned useful tasks remain a separate workload measure.

**Due remaining** means planned complete purchases due by the frozen review's observation cutoff minus the recorded complete purchases placed with that opportunity, floored at zero. Original intents that have not been associated remain visible in **Original intent placement**. Inspect those placements before treating a remaining figure as undelivered work.

The daily view gives two dates their proper roles:

- Recorded first attempts and completed-from-attempts use the original intent's first-attempt UTC date.
- Delivered-on-date uses the current completed output's actual UTC date. It includes work that finished after the original cohort window.
- Planned purchases retain their scheduled date; the comparison never shifts a plan window to fit the observations.

Recorded completions and independent completions retain the classifications from the original frozen review. That review's original targets, coverage findings, team-operated population, later completions, refunds, and cancellations remain available. The source case's **WALKTHROUGH** or **LIVE** mode is displayed prominently.

## Associate original identities

Original buyer and merchant deployment IDs match automatically when their accountable operator IDs agree. Facilitators use their original IDs and accountable operators. A useful operation also retains its original merchant, agreed scope, and expected complete output.

When the adoption plan used a proposed identity or the recorded deployment has a different original ID, open **Identity associations**. Choose the planned and recorded identities and enter the source basis linking them. This annotation belongs to the comparison; it retains both original IDs and source documents.

The comparison can use an operator's explicit association without changing the native cohort's independent-participant classification. The original review continues to supply that classification.

## Place original intent groups

One original intent group appears once even when its history contains repeated purchase observations. Automatic placement requires a single planned opportunity with:

- the associated original buyer, merchant, and useful operation;
- the same network and asset;
- the selected facilitator, when the plan names one; and
- the original first-attempt UTC date.

Two matching schedules on the same day remain ambiguous. An intent on a different date stays visible as a date mismatch. Choose **Place** beside the original intent, select the appropriate opportunity with matching identities, and record why it belongs there. The original attempt and completion times are retained.

The comparison never allocates a single intent to several opportunities. All additional original intents remain visible, including those beyond the planned count. Payment and completion amounts retain the original network, asset, and atomic-unit strings.

For a later refund or cancellation, the original gross completion remains visible alongside the current cohort result. The comparison does not revive an earlier delivered state into a current independent completion.

## Save, export, and reopen

**Save comparison edition** attaches one full comparison JSON source to the existing Operations case using its current version and recording operator. The original `source.add` journal writer owns this save. The attached JSON contains the complete original documents, associations, assignments, calculated report, and operator note.

After the writer returns, the desk reads the original source bytes again and reopens the complete comparison. It checks the source's retained byte count and SHA-256 and compares the downloaded text with the same submitted request.

If a return is interrupted, **Resume same save** reuses the retained request ID and complete original payload. **Reopen accepted source** finishes the original readback. An accepted write is retained through navigation and browser-session reload. A source/version rejection leaves the full comparison available for revision.

| Export | Contents |
| --- | --- |
| JSON | Complete editable comparison, original plan, native frozen review, and calculated report |
| CSV | Opportunities, original intents, daily measures, operators, associations, native amounts, outcomes, products, and findings |
| Readable HTML | Full operator report with original source documents embedded as readable JSON |
| Editable comparison input | Full original documents and the operator's identity and intent-placement choices |
| Original cohort archive | Existing native cohort export, including original source files |
| Complete case | Existing Operations export with original history and attached comparison editions |

The desk shows 40 opportunity or intent rows per page while exports retain every row. On a narrow screen, controls stack vertically and data tables scroll horizontally.

## Installed command

Prepare the comparison from the actual saved files:

```sh
starforge grant-cohort-delivery seed \
  --plan original-adoption-plan.json \
  --review original-cohort-review.json \
  --name "Customer rollout — recorded delivery" \
  --output cohort-delivery-input.json

starforge grant-cohort-delivery compare \
  --input cohort-delivery-input.json \
  --output cohort-delivery.json

starforge grant-cohort-delivery html \
  --input cohort-delivery.json \
  --output cohort-delivery.html

starforge grant-cohort-delivery csv \
  --input cohort-delivery.json \
  --output cohort-delivery.csv

starforge grant-cohort-delivery reopen \
  --input cohort-delivery.json \
  --output reopened-cohort-delivery.json
```

The source command is `node stellar/scf_2026/sf47_budget_model/workspace/cohort_delivery_cli.mjs` with the same subcommands and options. Existing output files are preserved. Use a new destination or stdout.

To add explicit choices, edit the complete input's `links` and `assignments` arrays. Each choice needs its original source basis in `note`:

```json
{
  "links": [
    {
      "kind": "buyer",
      "plannedId": "planned-customer",
      "observedId": "original-buyer-deployment",
      "note": "The original installation handover names this proposed buyer as the receiving deployment."
    }
  ],
  "assignments": [
    {
      "intentId": "original-native-intent-group-id",
      "targetId": "occurrence:original-schedule:2026-10-12",
      "note": "The original order retained the scheduled scope and moved its start to the following business day."
    }
  ]
}
```

The example describes the field shape. Select actual identifiers from the complete comparison's `joins`, `records`, and `rows`; each record's `candidateGroupId` selects a complete `candidateGroups` entry with its valid `targetIds`. Candidate lists are shared across matching original intents so a large cohort retains one full list per source identity group.

## Native integration and receiving

The original authenticated routes supply the input:

- `GET /api/operations/{caseId}` lists current sources and frozen reviews.
- `GET /api/operations/{caseId}/sources/{sourceId}` downloads the saved adoption edition.
- `GET /api/operations/{caseId}/reviews/{reviewId}` returns the full frozen cohort review.
- `POST /api/operations/{caseId}/command` with `action: "source.add"` records the new comparison.
- The original `cohort-reviews/{reviewId}/export.zip` and case `export.zip` routes provide complete receiving sources.

For the existing native SCF receiving case, use its already requested full review return and adoption edition: `operation-ce7a44c92e754424bbe9e7547a0d98c9`, original plan `plan-884f92ceac834ec588b3271011f1e0e1`. Its native owner can feed those same retained files to the command above, save the comparison in that same case, and reopen it after restart. The application adds a delivery view to the original operation.

The comparison engine is pure ESM and shared by the browser and Node command. It imports the maintained original cohort planner for all prospective schedules, funding quantities, and economics.

| Source | Purpose |
| --- | --- |
| `cohort_delivery_comparison.mjs` and `.d.mts` | Complete calculation, identity joins, deterministic reopening, exports, and typed contract |
| `operations_cohort_delivery.mjs` and `.css` | Installed operator desk and original case journal receiving |
| `cohort_delivery_cli.mjs` | Local complete-file interface |
| `COHORT-DELIVERY.md` | This operator guide |

The standard launch source rosters, authenticated static registration, Operations navigation, and distribution contribution include this complete arm.

## Merchant agent workflow

The installed Merchant MCP and typed client operate the same saved-source comparison as the desk and command above. The source module is `cohort_delivery_agent.mjs`; the public typed export is `@tokenjunkielabs/starforge-merchant/grant/cohort-delivery-agent`.

Start with the current original case. Select its saved adoption source by source ID and SHA256 and its complete frozen `COHORT_EVALUATION` review by review ID. The seed downloads the whole saved plan, verifies its recorded length and SHA256, and reads the original review. An optional `expectedReviewBusinessSha256` pins the selected review's business identity. The original comparison engine verifies the case and tranche and retains both complete documents.

All nine tools use the existing configured `workspace` alias:

| Tool suffix after `merchant_grant_cohort_delivery_` | Operation |
| --- | --- |
| `seed` | Read `caseId`, `expectedVersion`, `planSourceId`, `expectedPlanSha256`, `reviewId`, optional review business SHA, title and note; retain the full initial comparison |
| `edit` | Apply explicit identity associations, intent placements, title or note to the complete document and retain its complete predecessor |
| `review` | Read the current `caseId` and `expectedVersion`; verify the full original plan source and frozen review against the selected comparison |
| `refresh` | Read the newly selected current plan source and frozen review using the same source fields as seed; retain the previous explicit choices and full predecessor |
| `prepare` | Prepare one original source request using `caseId`, `expectedVersion`, `requestId`, `actor`, `note`, `createdAt` and the complete reviewed document |
| `save` | Commit the verified prepared file using its returned `preparedSha256`; retain the original response and recover its complete saved source |
| `request` | Reopen the retained request by case, request ID and prepared SHA; inspect its original native event and accepted response |
| `open` | Reopen the complete saved comparison using `caseId`, `sourceId` and `expectedSourceSha256` |
| `export` | Retain all JSON, CSV or readable HTML bytes from the complete document |

For document-taking tools, supply the full `inputs` object or the existing verified `input` reference with `expectedInputSha256`. A reference can select an original host input, retained snapshot or completed transfer. `inputPointer` selects a complete document inside an original response. The returned snapshot identifies the retained whole file; read its complete bytes through `merchant_grant_file_read`. Saving uses a verified reference to the entire prepared object and its separate `expectedPreparedSha256`.

### Associate and place the actual recorded work

The complete comparison exposes `document.joins`, `document.records`, `document.rows` and `document.candidateGroups`. Use their original identifiers to build the edit:

```js
const changes = [
  {
    action: 'LINK_IDENTITY',
    kind: 'buyer',
    plannedId: selectedPlannedBuyer.id,
    observedId: selectedRecordedBuyer.id,
    note: sourceBasisForBuyerAssociation
  },
  {
    action: 'PLACE_INTENT',
    intentId: selectedOriginalIntent.id,
    targetId: selectedOriginalOpportunity.id,
    note: sourceBasisForPlacement
  }
];
```

Other identity kinds are `merchant`, `operation` and `facilitator`. `UNLINK_IDENTITY` removes a selected explicit association using its kind and planned ID. `CLEAR_PLACEMENT` removes a selected original intent placement. `TITLE_NOTE` changes the comparison title or note.

Select valid opportunities from the candidate group named by the record's `candidateGroupId`. Its `targetIds` preserve the complete original opportunity list. A same-date ambiguity between purchased funding groups remains explicit until the operator chooses the actual group. Identity associations retain their basis and do not change the frozen review's native completion, refund, independence or team-operated classifications. Planned funding identities, useful-result quantities, exact amounts and original timestamps remain in their complete source documents.

An edit or source refresh that invalidates an existing choice returns `state: "EDITABLE_INPUT"` with the whole editable input, complete previous document and precise finding, such as `UNKNOWN_IDENTITY_LINK` or `INTENT_IDENTITY_CONFLICT`. Use `edit` on that result to correct the original association or clear the obsolete placement. The same workflow then recalculates the complete comparison. The retained inputs make the constraint repairable without dropping the original intent or silently changing its participant, network or asset.

### Review, save and reopen

Review and prepare verify that the comparison still contains the exact saved plan and the complete frozen review selected from the current case. Preparation records a named comparison edition inside `input.recording`, while retaining its original `planSourceId`. The source filename begins `sf47-cohort-delivery-` and the saved document uses the existing `stellar-forge.sf47-cohort-delivery-comparison.v1` schema, so the original Cohort delivery desk and command reopen it directly.

The existing adoption request owner retains the prepared bytes and source attachment request before sending. It uses the original client's `attach` operation and the current case's native actor/action handling. Retain the same request ID, complete input, creation time and prepared SHA across retries. Repeating the same MCP prepare reopens that original prepared request after its accepted source attachment advances the case version. A changed operation uses a newly selected current case version and its own request.

The owner retains the complete accepted response before downloading the source. If that read is interrupted, `save` resumes from the same original response and case event; `request` can inspect that retained operation. The returned source ID, length and SHA256 identify the complete saved comparison. Export its JSON, CSV and HTML, and carry the original case through the existing case export/import operation. On the receiving case, select its actual current source ID and SHA and call `open`, or open the same saved source in the Cohort delivery desk.

### Typed operation

Use the existing configured `GrantWorkspaceClient`. The source selection and edited document are the same as the MCP sequence:

```js
import {
  seedGrantCohortDelivery, editCohortDelivery,
  reviewGrantCohortDelivery, prepareGrantCohortDelivery,
  saveGrantCohortDelivery, openGrantCohortDelivery,
  exportGrantCohortDelivery
} from '@tokenjunkielabs/starforge-merchant/grant/cohort-delivery-agent';

const seeded = await seedGrantCohortDelivery(client, caseId, sourceSelection);
const edited = editCohortDelivery(seeded, changes);
const reviewed = await reviewGrantCohortDelivery(
  client, caseId, sourceSelection.expectedVersion, edited
);
const prepared = await prepareGrantCohortDelivery(client, caseId, {
  expectedVersion: sourceSelection.expectedVersion,
  requestId, actor, note, createdAt, document: reviewed
});
await retainPrepared(prepared);
const saved = await saveGrantCohortDelivery(
  client, prepared, prepared.preparedSha256,
  {retainResponse: retainOriginalNativeResponse}
);
const opened = await openGrantCohortDelivery(
  client, caseId, saved.source.id, saved.source.sha256
);
const json = exportGrantCohortDelivery(opened, 'JSON');
const csv = exportGrantCohortDelivery(opened, 'CSV');
const html = exportGrantCohortDelivery(opened, 'HTML');
```

`retainPrepared` and `retainOriginalNativeResponse` are the caller's durable original-file retention callbacks. The Merchant MCP supplies that ownership automatically. A direct-client retry passes the same prepared object and, when retained, `acceptedResponse` to `saveGrantCohortDelivery`. The module also exports `inspectGrantCohortDeliveryRequest` and `refreshGrantCohortDelivery` for that same saved operation and subsequent source review.

JSON retains the complete selected wrapper, including the full original plan and frozen review and any retained predecessor. CSV and HTML use the original comparison engine's complete exports.
