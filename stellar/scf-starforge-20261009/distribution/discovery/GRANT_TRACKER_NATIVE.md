# Grant tracker: complete source and native receiving

The tracker extends the existing OperatingPlan and OperatingPlanReturn models. Its browser is part of the maintained Command finder, at `/operating-plan.html`. The same original plans open through the standalone CLI; there is no new native SF47 case or database.

## Native commands

Run `node distribution/discovery/grant-tracker-cli.mjs --help` from the installed toolkit's matching root. In the source tree the prefix is `stellar/scf-starforge-20261009/`.

- `create --input creation-request.json --out plan.json` saves a complete initial tracker. The request has stable `id`, `title` and an explicit UTC `savedAt`, with optional customer, owner, purpose, period, receiving and notes.
- `import-source --input import-request.json --out plan-next.json` takes the full `plan`, its `expectedRevision`, an explicit `savedAt`, and `source`: stable id, kind, original file path, expectedSha256, name, mediaType, format, URL/note and, for CSV/TSV, encoding/headerRow/positional mapping. Every mapped field is present; null means no selected column.
- `review-row --input row-request.json --out plan-next.json` receives the full original plan, its expected revision, explicit save time, exact `rowId` and complete `review`. Use the complete row record returned by the model; retain unedited fields and original relationship/obligation identity.
- `details --input details-request.json --out plan-next.json` edits the plan's operating details through the same original revision writer.
- `show --file plan.json` returns every physical row and current source/review coverage.
- `export --file plan.json --out handover-directory` saves complete JSON, both reviewed CSV projections, the full review JSON and a complete offline HTML report. It binds the exact plan and all output hashes in selection.json before publishing any member; manifest.json closes the directory.
- `receive --input receive-request.json --out received-plan.json` takes complete `incoming` and optional `existing` original plans. Matching history reopens or extends; divergent history remains for explicit return review.
- `return-create --input return-request.json --out review.json` takes complete current/incoming plans and options with stable id, reviewer, notes and createdAt.
- `return-show --file review.json` projects every original return choice and domain issue.
- `return-decide --input decision-request.json --out review-next.json` takes review, key and original engine decision: take current/incoming/base/custom, optional value and a note.
- `return-apply --input apply-request.json --out completed.json` takes review, exact actual current plan and explicit savedAt. It returns the complete retained review and plan. Replaying the same completed review accepts its exact result or a later history already containing it.

Input plan limits remain 32 MiB. Return review limits follow the original 128 MiB return model; CLI wrapper limits additionally allow the full current plan and request metadata. Source files remain limited to 24 MiB by the original OperatingFile model. No command truncates inputs or rows.

All writes use the unchanged atomic no-overwrite export writer. An existing complete output is accepted only when its entire bytes match. Interrupted export directories resume their exact selection. A retained UUID-named writer temporary is preserved only when its complete existing bytes match a prefix of the expected member; a hardlinked published alias must match the entire final member. Unrelated or mismatching files are preserved and rejected. The receiving receipt lists retained interrupted temporaries; no arbitrary file is deleted.

## Exact original preparation

`grant-tracker-preparation.mjs` accepts the original `commons.summitflow-prospect-preparation.v1` carrier through `prepareGrantCustomers(sourceText,{expectedSha256})`. It verifies every original member, customer association and original commercial selection. Each customer receives its four exclusive supporting files and the common START_HERE file. The two aggregate internal research ledgers remain outside every customer plan and export.

The original owner’s twelve-column review CSV supplies physical tracker rows. Full history CSV/JSON and walkthrough documents remain exact supporting files. Source record IDs in notes connect each review row to its original funding-history record. Each initial row stays unresolved: no current awarded amount, requested amount, obligation date, owner or contact is invented. Existing programme stages remain Researching. Separate historical years, project purposes and pass-through funders remain distinct.

The complete native course is:

```sh
node stellar/scf-starforge-20261009/distribution/discovery/grant-tracker-receiving.mjs \
  --input ORIGINAL_COMPLETE_SOURCE.json \
  --expected-sha256 EXACT_ORIGINAL_SOURCE_SHA256 \
  --out OWNED_RECEIVING_DIRECTORY
```

The course reads and hashes its actual full static source closure, verifies the complete original preparation, generates all six independent customer plans, calls the real CLI for receiving, export and same-output replay, reads every complete export back, and exercises the original returned-plan engine. Its labelled AART branch is a software receiving exercise only. That branch is stored separately from customer starters; it asserts no customer approval or current award. It checks an explicit returned row edit, independently reopened result, same completed-return replay and stale-destination rejection.

The emitted RECEIVING.json distinguishes native CLI execution from browser execution. This course does not claim a browser run, acquire provider data, send a message or schedule reminders. Browser and filesystem results should be reported only from their actual execution receipts.
