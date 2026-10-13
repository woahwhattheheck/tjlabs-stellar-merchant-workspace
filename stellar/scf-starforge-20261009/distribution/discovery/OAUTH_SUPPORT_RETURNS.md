# OAuth Support: receive complete returned work

This extension lets a customer return an editable Support procedure with the actual selected result files, compare it against the operator's current work, resolve conflicts and retain the completed review alongside the full resulting plan. It uses the existing OperatingPlan and OperatingPlanReturn models, the original SF74 source package inspector, and the configured Merchant Support MCP provider.

The original Support case, its incident captures and its native delivery remain the source of evidence. The operating plan records the reviewed work and carries selected complete files for the recipient. The original case receiver continues to verify the complete native companion and its case history.

## What to retain

Keep these objects together for the selected customer engagement:

| Object | Purpose |
| --- | --- |
| Complete ordinary OperatingPlan JSON | Original plan ID, source binding and every saved revision |
| Compact SOURCE.json descriptor | Selected original case revision, prior case ancestors, capture identities and artifact references |
| Complete SF74 source directory and native case delivery | Original case, full source inventory and receiving authority |
| Complete returned-work JSON | Both selected plan histories, all required source descriptors, explicit decisions and eventual completion |
| Resulting full plan JSON | The actual plan received after review, including preserved later compatible work |
| Optional readable HTML | Review values, source details and downloads of complete carried files |

Each selected artifact has an original path, byte count and SHA-256. A carried OperatingFile additionally has its own stable ID, name, media type, Base64 content and note. These are complete bytes, not an external download URL. Recording verifies the byte count and digest against the selected descriptor.

The descriptor is not proof by itself that a native action ran. Retain and receive the original native companion when the customer needs the full case and source provenance.

## Installed entry points

The existing `merchant-support-operating` contribution includes the complete discovery and SF74 components. The original `support-operating-plan` command gains the returned-work actions below. Two typed exports extend the original package:

- `@tokenjunkielabs/starforge-merchant/merchant/support-operating-returns` exports the browser-safe model.
- `@tokenjunkielabs/starforge-merchant/merchant/support-operating-return-source` exports the native read-only evidence reader.

The model needs WebCrypto SHA-256. The native helper uses Node's original filesystem and crypto APIs and the existing SF74 package inspector. No new case store or verifier is created.

## 1. Start with the original plan and verified source

Use the maintained capture and receive-source operations described in [OAUTH_SUPPORT_OPERATING_PLANS.md](./OAUTH_SUPPORT_OPERATING_PLANS.md). Retain the original request and output identities.

```sh
starforge support-operating-plan capture --request CAPTURE.json --out CAPTURE-RESULT.json
starforge support-operating-plan receive-source --request RECEIVE.json --out RECEIVE-RESULT.json
starforge support-operating-plan create --request PLAN-INPUT.json --out ORIGINAL-PLAN.json
```

Use the exact previously retained requests when acknowledging an interrupted result. A source package can be inspected and selected after the original OAuth host has closed; current live inspection and new execution remain separate explicit operations.

The plan's first revision retains the original source selection. Each result source must be that original case revision or a later selected revision whose complete descriptor includes the original revision among its ancestors. Retain the exact original descriptor as well as every later descriptor used by returned results.

## 2. Record actual complete result files

### Read selected files from the existing native source package

Prepare SOURCE-WORK.json with the actual absolute retained directory, selected step, outcome and original evidence IDs:

```json
{
  "directory": "/absolute/private/retained-support-source",
  "stepId": "support-recovery",
  "status": "completed",
  "result": {
    "summary": "Describe the observed returned result and the review performed.",
    "evidenceIds": ["THE_ACTUAL_SELECTED_EVIDENCE_ID"]
  },
  "owner": "The reviewing operator",
  "savedAt": "2026-10-13T08:00:00.000Z"
}
```

The values above illustrate the shape. Select evidence IDs from the actual SOURCE.json and freeze the actual timestamp before the write. An optional `expectedSource` artifact reference pins SOURCE.json to the already reviewed bytes.

```sh
starforge support-operating-plan record-source-work --plan ORIGINAL-PLAN.json --request SOURCE-WORK.json --out RETURNED-PLAN.json
```

This action inspects the complete retained source package, reads the selected files through regular-file descriptors, verifies each length and digest, and records those bytes on the original Support step. It returns a create-only full ordinary plan. Its command receipt names the source and exact source/manifest file identities.

The reader rejects paths outside the selected root, symlink paths, changed files, missing evidence and artifacts above the ordinary 24 MiB carried-file limit. Every opened file closes in a finally block. The complete native package remains available for larger artifacts.

The native API is:

```js
import { recordSupportOperatingWorkFromSource }
  from '@tokenjunkielabs/starforge-merchant/merchant/support-operating-return-source';

const result = await recordSupportOperatingWorkFromSource(plan, {
  directory, expectedSource, stepId, status,
  result: { summary, evidenceIds }, owner, savedAt, signal
});
// result.source, result.sourceFile, result.manifestFile, result.plan
```

### Supply already retained complete OperatingFiles

Browser and MCP callers can supply the complete files without permitting a host path read:

```js
import { recordSupportOperatingWork }
  from '@tokenjunkielabs/starforge-merchant/merchant/support-operating-returns';

const returnedPlan = await recordSupportOperatingWork(plan, {
  source, stepId, status,
  result: { summary, evidenceIds }, owner, savedAt,
  files: [{ evidenceId, file }]
});
```

The original OperatingFile shape is:

```json
{
  "id": "a-stable-file-id",
  "name": "result.json",
  "mediaType": "application/json",
  "bytes": 123,
  "encoding": "base64",
  "content": "THE_COMPLETE_ORIGINAL_BASE64",
  "note": "Original selected artifact and review context"
}
```

Use the original `createOperatingFile` helper on the actual bytes when constructing it. The record operation preserves unrelated existing step files and rejects a reused file ID with different content. Every selected evidence ID needs one complete matching file. A completed Support step needs at least one actual selected evidence item.

The equivalent local command reads a complete JSON request with `source` and `files`:

```sh
starforge support-operating-plan record-work --plan ORIGINAL-PLAN.json --request WORK.json --out RETURNED-PLAN.json
```

Saving a result appends one ordinary plan revision. It does not execute the command written in a step, update the incident, or change the native case.

## 3. Prepare the complete customer return

Use the actual current local plan, the complete customer-returned plan and the original source descriptors. REVIEW-INPUT.json contains `sources`, a stable `id`, the `reviewer`, review `notes` and the original `createdAt`. The source array contains full descriptors, not paths.

```sh
starforge support-operating-plan return-create --plan CURRENT-PLAN.json --incoming RETURNED-PLAN.json --request REVIEW-INPUT.json --out REVIEW.json
starforge support-operating-plan return-inspect --return REVIEW.json
starforge support-operating-plan return-compare --return REVIEW.json --out COMPARISON.json
starforge support-operating-plan return-show --return REVIEW.json --format html --out REVIEW.html
```

The package uses:

```text
schema: stellar-forge.oauth-support-operating-return.v1
sources: [all selected compact Support source descriptors]
review: the original complete OperatingPlanReturn
```

The original review retains both full histories, their shared revision, the reviewing operator, decisions, notes and completion. The Support inspector verifies the first source binding, case lineage and all source-bound results across both histories. For carried work it additionally verifies every selected complete artifact and its file association.

Existing reference-only Support results remain readable with their original descriptor and separate native companion. The new `oauth-support-operating-work.v1` result carries complete selected files in addition to those references. Historical revisions are preserved in their original form.

## 4. Review changes and choose deliberately

The comparison uses the maintained returned-work engine. It displays exact base, current and incoming values. Progress, recorded result and attached files are one grouped change so a result cannot accidentally be combined with another result's files. Procedure text, ownership, commands and order retain their original review behavior.

Each row has a stable `key`, its `kind`, `label`, values, conflict status and proposed or explicit choice. Copy the exact key from the current comparison. A decision request is:

```json
{
  "key": "/steps/support-recovery/@progress",
  "decision": {
    "take": "incoming",
    "note": "Explain why this complete returned result is the selected one."
  }
}
```

```sh
starforge support-operating-plan return-decide --return REVIEW.json --request DECISION.json --out REVIEW-DECIDED.json
starforge support-operating-plan return-compare --return REVIEW-DECIDED.json
```

Choices are `current`, `incoming`, `base` or `custom`. Only a custom choice supplies `value`. A null decision removes the explicit choice. Use the full grouped value for a custom progress decision; changing a carried body or detaching it from its evidence creates a source-integrity issue and prevents completion.

Review details can be updated before completion with `return-details --return REVIEW.json --request DETAILS.json --out REVIEW-UPDATED.json`, where DETAILS.json contains only `reviewer` and/or `notes`.

The reviewing operator must be named. Resolve every conflict and invalid value before completion. An unrelated case, a changed first source binding or missing complete source descriptor is rejected rather than silently adopted.

## 5. Complete the review and preserve the actual destination

Freeze COMPLETE.json with the exact intended completion timestamp:

```json
{"savedAt":"2026-10-13T08:15:00.000Z"}
```

Then apply against the actual current full plan:

```sh
starforge support-operating-plan return-apply --return REVIEW-DECIDED.json --plan CURRENT-PLAN.json --request COMPLETE.json --out COMPLETED-REVIEW.json --plan-out RECEIVED-PLAN.json
```

The CLI writes the completed review first and then the resulting full plan. Both paths are create-only. If acknowledgement is lost after either write, repeat the same retained request and exact paths; identical existing bytes are acknowledged. Different bytes at either output are left untouched and require a new explicit path. Keep the completed review when the second publication is interrupted.

The original engine checks the current selected history. A changed destination is not overwritten. Begin a new review against the current full plan if its changes are not already represented by the completed result.

Replaying an already completed review against a later compatible plan preserves that actual later head. The old package validates its own frozen completion and original sources. It does not claim that later appended Support descriptors were part of that older review. When the later actual plan produces different output bytes, select a new plan output path while retaining the identical completed-review file.

A browser caller saves the completed wrapper before using the original destination's plan transaction:

```js
const result = await applySupportOperatingReturn(value, { current, savedAt });
await persistCompleteReview(result.value);
await receiveThroughOriginalPlanTransaction(result.plan);
```

The original browser transaction re-reads the current stored plan, applies the maintained prefix-history receiver and preserves a later compatible head. If a concurrent divergent write prevents receipt, keep the completed wrapper and reconcile the actual current plan. The pure model and MCP operations compute these values; they do not create a hidden destination store.

## 6. Deliver and reopen

Deliver the completed Support return JSON, the actual resulting plan, optional readable HTML, the original compact descriptors and the separate complete native case/source delivery. The HTML contains downloadable carried files and escaped full package JSON.

The recipient can inspect the package with `return-inspect`, inspect the actual plan with the existing `show`, and receive a complete ordinary plan through the existing `receive` action. Reopen the native companion using the original source/case receiving instructions. No OAuth host restart is required to inspect retained work; any new live observation remains an explicit original operation.

The full returned-work package is limited to 128 MiB. Each complete ordinary plan retains the original 32 MiB limit and each carried file the original 24 MiB limit. An HTML export is also bounded by its command's output limit; retain the complete JSON and native companion where readable expansion would exceed it.

## MCP actions

These actions are exposed by the original configured Merchant Support provider. Each operates only on supplied complete values and returns the actual result.

| Tool suffix after merchant_support_operating_ | Input | Result |
| --- | --- | --- |
| record_work | plan, input | Full ordinary plan with complete selected files |
| return_create | current, incoming, input | Complete Support return |
| return_inspect | value | Validated complete Support return |
| return_compare | value | Original comparison with source-integrity issues |
| return_details | value, updates | Return with revised reviewer/notes |
| return_decide | value, key, decision | Return with an explicit original decision |
| return_apply | value, current, savedAt | value, plan, alreadyPresent, addedRevisions, reviewedRevisions |
| return_render | value, format: json or html | Complete JSON value or readable text |

The existing inspect/create/record/compare/receive/render tools remain available. The async Support handler is awaited by the maintained provider. There is no arbitrary filesystem path input in these MCP actions.

## Implementation and validation record

The pure model imports the maintained Support source/result and ordinary plan/return modules. The native helper imports the original SF74 source inspector only when a local evidence read is requested. Source contribution exports retain their matching TypeScript declarations.

Source review covered full-history binding, complete byte verification, original case ancestry, grouped comparison, current-head checks, completion replay and file/lease ownership boundaries. Functional checks execute the actual pure modules with explicit UTF-8 and SHA-256 bindings, including conflicting complete results, forged carried bytes, another case, legacy results, readable downloads and preservation of a later compatible plan. These checks establish model behavior; native case execution and original host acceptance retain their separate receiving records.
