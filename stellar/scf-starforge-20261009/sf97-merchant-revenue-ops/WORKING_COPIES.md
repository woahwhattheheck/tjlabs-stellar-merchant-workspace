# Retain and hand over unfinished scenario decisions

The merchant Scenario planning page can retain work before its alternatives are
ready to calculate. A working copy preserves raw assumptions, the original
pricing review, selected scenario and service page, comparison name, optional
targets and an original pending comparison-save request. Finished comparisons
continue through the existing analyzer and immutable plan store.

## Continue a decision over more than one sitting

1. Open **Scenario planning**, select an original saved review and choose
   **Load review**. Enter a **Decision name** in **Unfinished decision work**.
2. Add, duplicate and edit up to twelve alternatives as usual. A partly entered
   volume, unfinished cost or target can remain raw text while the decision is
   being prepared. The calculator validates those values when you choose
   **Calculate comparison**.
3. Choose **Save working copy**. The native workspace retains the full editor
   position against its exact original pricing source. The label in the list
   is shortened for navigation; the complete entered name remains in the
   working record.
4. Close and reopen the same workspace. Select the named record and choose
   **Open working copy**. Its original review, unfinished values, scenario and
   service page return together. A direct link uses
   `/planning#working/WORKING_COPY_ID`.
5. Continue editing and save another working revision. **Original revision**
   reopens an earlier retained position. **Save as new copy** creates an
   independent working decision from the current form.
6. When the inputs are ready, calculate through the existing scenario engine,
   inspect its exact results and target suggestions, and **Save comparison**.
   A working copy and a finished comparison have distinct identities. Editing
   a working copy leaves every finished comparison intact.

Choosing a different source review or reopening a finished comparison starts
a separate working position. The existing confirmation protects unsaved form
edits. Working copies keep one original review throughout their revision
history; use a new copy for another source.

## Conflicting saves and interrupted responses

Each save retains the exact working-copy ID, expected revision and request ID.
Two windows can retain separate copies. If both change the same saved copy,
only one can publish the next revision. The other form remains available:
choose **Save as new copy** to keep it independently, or explicitly reopen
the newer original before applying changes.

If a working-save response is interrupted, **Retry working-copy save** uses
its original request. It recovers that saved revision if publication already
completed. Newer edits in the current form remain available for a following
save. A failed save also leaves **Download unfinished inputs** available.

Before the finished comparison is dispatched, its exact request is retained in
the working copy. This includes its plan request ID, original source, normalized
scenario inputs, selected scenario and reviewed calculation hash. If its
response is lost, reopen the working copy and choose **Recover pending
comparison save**. It continues that original immutable save; the request's
inputs remain protected while its outcome is unresolved.

An explicit validation rejection returns those raw inputs to the editor for
correction and a fresh calculation. The prior working revision retains the
rejected request. Interrupted, filesystem and unknown failures keep the exact
pending request available for recovery.

A recovered finished comparison appears in the original saved-plan list and
its downloads. If a received working document separately contains different
unfinished inputs, those inputs stay in the editor for their own calculation.

## Download, receive and recover

**Download unfinished inputs** writes the current raw editor values and source
binding directly from the page. It remains available if the native save is
unavailable. This file is an unfinished-input package.

**Export saved revision** downloads the selected retained working revision,
its original record identity and source binding. It exports that saved
revision; separately edited form values remain in the editor.

Use **Receive unfinished work** to select either JSON form and choose
**Receive as new copy**. The receiver requires the exact original pricing
review and its seller, terms and observation hashes. It assigns a new local
working-copy identity. An exported saved revision also retains its original
copy, revision and package identity as receiving context. Retrying an
interrupted receive uses the same receiver request and local copy ID. An explicit
package or input rejection lets you select a corrected file.

A working-copy JSON contains the decision inputs and source identities. To
move the actual pricing originals and complete working history to another
host, use **WORKSPACE_BACKUP** from Supplier costs. The existing full TAR now
captures every selected working-copy revision before capturing its referenced
pricing source prefix, together with finished scenario plans, costs and
performance records. Restore the original complete archive into a new private
directory through the existing Applications or workspace CLI flow.

Earlier backups remain supported. Their existing saved comparisons and pricing
records reopen through the same source readers. A restored working copy can
then continue in that received workspace with its original chain identity.

## Readable finished decision handover

A saved comparison offers **Complete decision review** alongside its Plan JSON,
Comparison CSV and selected merchant terms. The script-free HTML includes:

- the original pricing source and observed scope;
- every baseline and alternative's normalized assumptions and exact totals;
- all original service contribution, coverage and unknown-input results;
- requested targets, attained results and the original target suggestions;
- complete saved terms, payment bindings, changed inputs and source identities.

The report reads the saved comparison and verifies its original pricing
provenance. It preserves exact decimal strings and unknown values. Open or
print it for a commercial review; use the original JSON and terms exports when
the receiving application needs the maintained schemas. Applying a selected
scenario still opens the existing merchant pricing draft against its current
operations source.

## Native commands without a live merchant listener

The existing workspace CLI operates unfinished copies directly against their
retained private state:

```sh
node stellar/scf-starforge-20261009/sf97-merchant-revenue-ops/workspace/cli.mjs \
  --scenario-working list \
  --state /private/merchant/pricing-workspace \
  --output /private/merchant/working-copies.json
```

Use `load`, `save`, `export` or `import` with
`--working-request /private/merchant/working-request.json`. Omit
`--output` to return the native JSON on standard output. Output files are
private and must not already exist. These commands read the saved original
pricing source; they do not need seller configuration or a live operations
URL.

A load or export request contains the actual `workingCopyId` and an optional
original `revision`. An import request contains the complete `package`,
a fresh receiver `workingCopyId` and retained `requestId`. A save contains:

```json
{
  "workingCopyId": "ACTUAL_WORKING_COPY_UUID",
  "expectedRevision": null,
  "requestId": "ACTUAL_SAVE_REQUEST_UUID",
  "version": "ACTUAL_SAVED_PRICING_REVIEW_UUID",
  "document": {
    "label": "Unfinished commercial decision",
    "scenarios": [
      {
        "id": "scenario-one",
        "label": "First alternative",
        "routes": {}
      }
    ],
    "selectedScenarioId": "scenario-one",
    "routePage": 0,
    "selectedReviewVersion": "ACTUAL_SAVED_PRICING_REVIEW_UUID",
    "detailScenarioId": null,
    "basePlanId": null,
    "pendingPlanSave": null
  }
}
```

Replace each labeled identity with its actual returned UUID. Use
`expectedRevision: null` only for a new copy; otherwise retain its current
original revision. Monetary and volume edits can remain raw text in a working
document. The existing calculator validates actual commercial requests.

## Native interface and storage

`openScenarioWorkingCopies({directory,source})` in
`planning/working-copies.mjs` uses the original saved-pricing source reader.
The existing planning workspace exposes the resulting `working` handle.

| Operation | Original authenticated route |
| --- | --- |
| List named working copies | `POST /api/planning/working/list` |
| Open current or historical revision | `POST /api/planning/working/load` |
| Save the retained raw document | `POST /api/planning/working/save` |
| Export a selected saved revision | `POST /api/planning/working/export` |
| Receive into a new local copy | `POST /api/planning/working/import` |
| Read a complete finished decision | `GET /planning-files/PLAN_ID/review.html` |

POST requests retain the existing origin checks and
`x-sf97-workspace` token. Working-copy request bodies support 8 MiB; raw
editor documents support 4 MiB and committed records 8 MiB.

Records are private canonical-hash envelopes beneath
`scenario-working/COPY_ID/successors/PREVIOUS_REVISION.json`, beginning with
`root.json`. A flushed pending file is published with the same create-only
hard-link pattern used by the original finished-plan store. The successor,
new copy directories and workspace root are synchronized before successful
acknowledgement. Reads verify the record envelope, original predecessor,
request identity, fixed pricing source and route binding. Complete backup
pins the exact bytes of every selected record; the receiving allow-list
accepts only the original UUID and revision paths.
