# Support procedures in Operating Plans

Open **Support procedure** from Command Finder or from the existing Operating Plans workspace. The page prepares and retains an ordinary customer operating plan. The original Support workspace continues to own observations, authority, response work, recovery, and its returned artifacts.

## 1. Retain the selected source

Use the compact source descriptor from the original Support source exporter. Choose its JSON file or enter its complete JSON, then select **Review source**.

The review shows the original case ID and selected revision, its ancestor chain, source artifacts, original observations and available returned evidence. A selected file also shows its exact byte count and SHA-256. A failed observation can have null native identity fields; the interface retains those nulls and never manufactures an observed session or timestamp.

**Download entered source** retains the exact entered JSON. Keep this descriptor with the full native source package and eventual complete plan. The descriptor is not a replacement for its referenced original artifacts.

The browser accepts UTF-8 JSON up to 32 MiB. It does not ask for credentials, open another Support listener, or run the selected commands.

## 2. Review a complete procedure

Enter the stable plan ID, title, customer, operating owner and period. The generated ID remains fixed while you preview and create this plan.

The procedure contains seven phases:

1. Retain original sources.
2. Review authority and scope.
3. Review original observations.
4. Perform the selected response.
5. Verify recovery and continuation.
6. Retain the customer case.
7. Receive the complete handover.

Each phase can select an actual current Command Finder registration or remain a manual step. The complete selected registration, source records and declared runtime groups remain with that step. Its exact command argument array is entered separately. **Use selected command help** copies only that registration’s existing help arguments; review and enter the intended operation and paths before performing work.

**Select for Support procedure** in a Command Finder result highlights that exact registration in every phase selector. It does not choose a phase for you.

Choose **Preview procedure**. Review the source binding, all seven ordered steps, owner, expected outcomes, registrations and commands. All new steps are planned. **Create reviewed procedure** saves the reviewed plan through the original Operating Plans transaction. Inputs or catalog changes invalidate the preview. The same ID cannot silently replace an existing plan.

Continue normal step editing, draft recovery and saved revisions in the original editor. Change individual step owners there if different people perform different phases. Readable handovers and complete editable JSON keep the original plan format.

## 3. Record actual returned evidence

Open the saved Support plan and load the returned compact source descriptor. The source must refer to the original case revision or retain that revision in its ancestor chain. A different case or unsupported revision is rejected by the original adapter.

Select the exact receiving step and a recorded work status. Enter a reviewing operator where applicable. The returned result is a compact reviewed JSON value:

~~~json
{
  "summary": "The operator's reviewed result and continuation",
  "evidenceIds": []
}
~~~

Choose **Choose original evidence file** beside each selected evidence row. The browser checks the complete file against that original artifact’s byte count and SHA-256, carries its bytes in the established OperatingFile format, and adds the evidence ID to the result. Each file may be up to 24 MiB, within the existing 32 MiB complete-plan capacity. You can also choose a supplied returned-result JSON file, then attach every named original. Recording completed work requires at least one valid reference and its complete matching file. Other existing step files remain in the saved history.

Choose **Review result revision** to inspect the complete proposed plan and its original history. The preview freezes the source, selected plan, step, status, result, operator and every carried file. If any changes, review again.

**Save reviewed result revision** retains the existing local working draft, rechecks the selection, then uses the same complete-history receiving transaction. It does not overwrite concurrent divergent revisions. If receiving reports a conflict, the reviewed result plan remains available to download and the original editor can retain it as a separate copy. No native action or case mutation is replayed.

## 4. Review and receive customer returned work

Open the original saved plan as the receiving destination, then choose the customer's complete returned plan. Enter the receiving reviewer and notes. Keep the original first-plan source descriptor selected above and add every later case-descendant descriptor used by the customer's recorded results with **Add original source descriptor files**.

**Create returned-work review** verifies the two complete histories, original Support case binding and every selected source/evidence/file association. It retains the full review before presenting the comparison. Changes show the shared original value, current destination value and returned customer value. Review any unresolved difference; choose current, returned, shared original or a custom JSON value, add a note and save that exact choice. A progress choice keeps the recorded result and its associated files together.

The original OperatingPlanReturn engine calculates the proposed revision. Support-specific validation also checks that the choices preserve each source-bound result and its matching carried file. Changing the reviewer or notes saves them with this same review. Full plan and wrapper JSON remain downloadable; long displayed values use a readable preview with a complete-value download.

**Receive accepted work** first retains the local working draft. It then saves the complete accepted return, including its fixed completion time and plan, before calling the existing Operating Plans receiving transaction. That transaction compares against the actual stored head, preserves every earlier revision and reopens the saved result. A concurrent different history is retained for review.

If the tab closes between those two saves, open the same saved review and choose **Receive accepted work** again. The retained completion is applied to the freshly opened original plan. An already received completion is reused, and later compatible saved revisions stay in place.

## 5. Reopen and hand over

Use **Download complete returned work** to transfer the exact source descriptors, both full histories, decisions, carried files and completion. **Download readable review and files** produces the original readable return with file downloads and its complete Support wrapper. A recipient can open the complete JSON with **Open complete returned-work package**, select the original destination plan, review and finish receiving.

Use **Complete editable JSON** in Operating Plans or **Download current saved plan** to transfer every saved plan revision. For a complete delivery, use the portable handover below to retain the full native companions with those editable documents.

Use the same local listener address to reopen browser work. Saved Support return reviews live in the dedicated browser document store `starforge-support-returned-work-v1`; plan saves and working drafts remain in the existing Operating Plans store. Each review save compares its local version and exact prior value so a second tab cannot silently replace a later review. The complete JSON is the portable copy for another computer or browser.

## 6. Transfer a complete customer handover

Open the saved Support plan, enter the handover ID, title and preparing operator, then use **Add original companion directory** for each full native source export. Choose the directory containing its original SOURCE.json, MANIFEST.json and every listed member. The directory must match the manifest inventory exactly. Repeat for each later source used by the plan or a review.

The currently opened returned-work review is included by default; clear its checkbox when that review belongs to another delivery. **Add complete returned-work reviews** accepts additional complete review JSON files. The package retains every selected review and its source descriptors. Different editions under one review or source identity need an explicit selection; they cannot silently replace each other.

**Create and retain complete package** verifies all saved plan revisions, carried evidence, reviews and source associations. It checks every original companion member against its byte count and SHA-256 and creates one portable TAR containing HANDOVER.json and the complete indexed companion directories. The exact generated archive is reopened and checked before saving.

The full archive Blob, editable document and initial receiving state are committed together in the dedicated browser store `starforge-support-handovers-v1`. A storage error leaves the selected complete archive available for download; **Retain this complete package** retries that same local save. Receiving requires a completed package save. **Request persistent browser storage** asks the browser to protect local data from ordinary eviction; keep a downloaded archive for transfer or independent recovery.

**Open portable handover archive** verifies and saves an incoming archive before changing a plan. **Open saved complete package** reopens the exact retained Blob and verifies its recorded archive identity. Each original file is available to download, with 40 inventory entries shown per page. The complete TAR, exact HANDOVER.json and readable HTML are also downloadable.

**Receive editable plan** retains the original editor's working draft and saves RECEIVE_PENDING before invoking the existing Operating Plans receiving transaction. It reopens the actual result and then records COMPLETE. If the page closes between those steps, open the same saved package and receive it again. A compatible later plan keeps its later saved work; a divergent history returns through the original conflict handling. Concurrent tabs compare the saved package version before changing its receiving state. The immutable archive is written once; phase updates write only compact state.

Native companion bytes remain complete inside the retained archive. To receive the full source into a native CaseStore, use the maintained native Support handover receiver. Browser plan receiving imports the editable procedure; the native receiver performs the original case/history checks and source receiving.

Metadata limits remain separate from native files: source and manifest JSON each allow 32 MiB, returned reviews allow 128 MiB, complete handover metadata allows 256 MiB, original files allow 512 MiB, each original companion allows 4 GiB, and the complete TAR allows 16 GiB. Up to 100 sources and 100 reviews are supported. Headers and SHA-256 are processed in bounded slices; the browser never converts the whole TAR into JSON, Base64 or one ArrayBuffer. The browser's available storage can be smaller than the archive format's limit.


## Maintained integration

The original controller is `public/support-operating-plan.mjs`, with the returned-work interface in `public/support-operating-return.mjs` and complete handovers in `public/support-operating-handover.mjs`. The browser-safe source and returned-work models are served through `/support-operating-core/`. That subtree retains the exact adapter, original OperatingPlan and OperatingPlanReturn engines, and import-free catalog at their original relative paths.

The original editor supplies its catalog, current saved plan, busy/error boundary, draft retention and existing `addPlan` / `receivePlan` transactions. Returned-work documents have their own saved review and compact index records. Accepted plans continue through the existing plan database and transaction. Toolkit catalog export, Command Finder search, generic plans, customer integrations and revision semantics retain their existing source.

A recorded plan status describes the operator’s work. Native observation identity, source completeness and original returned artifacts remain separate, explicit facts in the selected source and result.
