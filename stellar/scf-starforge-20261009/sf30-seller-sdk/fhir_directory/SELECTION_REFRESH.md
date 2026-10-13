# Review a saved service choice against a later source

Use **Service choices → Review later source**, or open **Later-source review** in the same Human Services Directory workspace. This continues a retained choice and its source lineage. It does not fetch a provider, change a referral, reserve a place or establish current availability.

## Complete operating workflow

1. Choose the exact saved service choice. Every original candidate remains in the working review. The previous source edition and selection stay immutable.
2. Choose a different, already retained Directory edition. The helper clears prior candidate references, chosen services, dispositions, FHIR conversion, location references and legacy schedule interpretations. It preserves the other criteria as an editable starting point.
3. For each old candidate, either select its actual later service row or record why it is not carried forward. The product does not infer a match from a name or a publisher identifier. One later row cannot silently absorb two original candidates.
4. Add other later-edition candidates explicitly. Review every proposed candidate’s disposition and reason. Selected dispositions and chosen references must agree; reserve and needs-contact dispositions require their operating owner.
5. Review the complete target criteria. Select location and schedule references from the later edition, retain capacity unit/time/age, and explain the current source scope and criterion changes. An omission in a partial source does not establish closure. Unknown capacity or hours remain unknown.
6. Evaluate and retain the complete review. Read every row and criterion, source scope and full original/current evidence. Large rows remain available in the complete JSON even when they exceed the interactive page budget.
7. Open **Accept this exact saved review**, confirm the reviewed scope and choices, and enter the actual accepting operator and note. This calls the existing immutable selection writer. The successor retains the original selection as predecessor and the saved refresh ID. Retrying the exact accepting request recovers the same successor; it does not overwrite the old selection.
8. Open the successor in Service choices. Its ordinary mapping, referral and handoff workflows remain separate explicit actions.

The browser preserves a pending accepting request in the same workspace’s session storage before sending it. After an uncertain response, open that saved review and retry its unchanged actor and note. Preparing another review is required if the target criteria, candidates or dispositions change.

## Saved product

Every review retains seven complete files:

| File | Meaning |
| --- | --- |
| `Input.json` | Complete original preparation input and normalized target selection |
| `Refresh.json` | Full source editions, old/current candidates, explicit match decisions, criteria and source-value changes |
| `Proposed_Selection.json` | Exact target input before separate acceptance |
| `Service_Choices.csv` | Every matched, omitted and added candidate and its recorded reason |
| `Criteria.csv` | Original and proposed criterion states with complete retained context |
| `START_HERE.html` | Readable report, source scope, decisions and full expandable evidence |
| `Service_Choice_Refresh.zip` | The six ordinary files above with working relative links |

A successor’s ordinary private handoff includes `Service_Choice_Refresh.zip` and links to it from the existing handoff opening page. The full editable workspace retains every review record and file. The receiver accepts older workspaces without this new collection and preserves their original records.

## Native CLI

The existing `human-services-directory` command exposes the original main input catalogue:

```sh
human-services-directory selection-refresh-prepare --workspace /absolute/original-directory --input /absolute/review-input.json
human-services-directory selection-refresh-report --workspace /absolute/original-directory --id SAVED_REFRESH_ID
human-services-directory selection-refresh-rows --workspace /absolute/original-directory --id SAVED_REFRESH_ID --offset 0 --limit 50
human-services-directory selection-refresh-file --workspace /absolute/original-directory --id SAVED_REFRESH_ID --member Service_Choice_Refresh.zip --out /absolute/Service_Choice_Refresh.zip
human-services-directory selection-refresh-apply --workspace /absolute/original-directory --input /absolute/accept-input.json
```

Preparation uses `selection_refresh_prepare` in `directory-schema.json`. It includes label, actor, original selectionId, complete target selection, one binding per old candidate, scopeNote and criteriaReason. A binding is `{beforeRef, afterRef: originalRefOrNull, reason}`. All references retain the original source ID, record ID and optional exact row SHA. The target cannot contain a refresh ID and must retain the selected old choice as predecessor.

Acceptance uses `selection_refresh_apply`:

```json
{
  "refreshId": "ACTUAL_SAVED_REFRESH_ID",
  "expectedReportSha256": "ACTUAL_REFRESH_JSON_SHA256",
  "confirm": true,
  "actor": "Actual accepting operator",
  "note": "Actual reason for accepting this complete saved review"
}
```

The strings above name fields to fill from the actual saved record; they are not fabricated native IDs. Complete member files use the original 64 MiB per-file limit, connected complete-file delivery uses 512 MiB, and native editable archives retain the original 2 GiB limit.

## Full receiving and cold reopening

Continue the existing `SCF-HUMAN-SERVICES-DIRECTORY-RECEIVING-450E-20261012` programme and its original workspace UUID. Use the actual retained later edition from its source/correction course; author the explicit service matches and criterion decisions there. Preserve completed clinical, mapping, conformance, correction and operating-plan histories.

The additive runner takes one **already saved review**. Without an accepting input it exports and reopens that exact review only. Supplying the original complete accepting input performs the separately authorized successor step:

```sh
python3 -B stellar/scf-starforge-20261009/sf30-seller-sdk/fhir_directory/operate_selection_refresh.py \
  --workspace /absolute/original-directory \
  --expected-workspace-id ORIGINAL_WORKSPACE_UUID \
  --refresh-id ACTUAL_SAVED_REFRESH_ID \
  --output /absolute/service-choice-refresh-receiving
```

For a reviewed successor, add `--apply-input /absolute/accept-input.json` and use a distinct output directory. The output is bound to the original workspace path/UUID, saved review and exact accepting-file bytes. It retains all seven report files, original and successor selections, a complete editable workspace ZIP and a separately restored/reopened native workspace. Files are create-only or byte-identical resumes. It never initializes the original workspace. Its final `COMPLETE.json` records actual returned identities and hashes; it explicitly leaves visual review pending.

After an interrupted runner, keep its exact source/output and command. A leftover `.selection-refresh.lock` requires checking that its original PID has ended before an operator removes that stale lock. The runner never removes another live or replacement owner’s lock. A failed exact archive receive continues through the original native receiving journal.

## Connected SDK and MCP

The typed client adds `prepareDirectorySelectionRefresh`, `getDirectorySelectionRefresh`, `directorySelectionRefreshReport`, `directorySelectionRefreshRows`, `directorySelectionRefreshFile` and `applyDirectorySelectionRefresh`. Native actions are `directory_selection_refresh_prepare`, `directory_selection_refresh_apply`, `directory_selection_refresh_report`, `directory_selection_refresh_rows` and `directory_selection_refresh_file`. Preparation and acceptance use their exact named native input wrappers. Complete-file helpers bind the returned connected payload to the saved member’s byte count and SHA-256.

The installed Directory selection carries the backend, browser module, CLI, SDK declarations, this guide and native receiving runner through its existing contribution/source recipe. No new application, customer workspace identity or provider transport is introduced.

## Producing operator’s recipient-use course

Before calling any client- or prospect-facing app, site, dashboard, demo, report, presentation or export ready, the producing peer must actually open, run or render the exact outgoing version, **look at the real screen or actual screenshots**, and operate its important controls. Use the actual screenshare/laptop width and a narrow/mobile width; inspect populated, empty, loading and error states, downloads and cold reopening. Captured-only screenshots, source/code/DOM inspection, HTTP 200, unit tests, peer approval and completed checklists are not substitutes for looking at and using the rendered product. Repair the actual issues found. Keep a plain, industrial interface with readable tables, hierarchy, typography, spacing, restrained controls, clear labels, responsive layouts and real workflows/data/computation. Do not add a broad test suite or a separate verification product.

**All attachments means all attachments:** literally open, view, play or use the final HTML, PDF, report, slides, spreadsheet, map, image, video, audio, archive and project as the recipient will. Extract archives and open their contained deliverables or project. A capture or test is not a substitute for recipient use. If media is part of a delivery, use available high-quality generative media and natural TTS appropriately, then watch/listen to the final pronunciation, pacing, timing and audio alignment. Carry this full instruction into the active original owner’s receiving/build guide and child tasks, preserving existing controls, histories and vendor policies. Do not restart stopped work or add watchers.

For this Directory continuation, actually inspect the old choice and later edition; make a matched service and a qualified omission; inspect a changed source value and current capacity/schedule checks; exercise an unfinished-reason error; save and reopen the review; apply the same exact confirmation twice and observe the same successor; download/open all seven files; extract/open the readable ZIP; export/receive/cold-reopen the complete workspace; and inspect the original choice and successor there. Use ordinary desktop and approximately390px widths. A source-only execution or published PR must remain described as source work until this actual course returns. Keep screenshots/recording with the same original receiving result rather than creating a second programme.

TJLabs attribution and the existing private clinical/customer boundaries remain in force. This reusable public source contains no patient record, credential or customer payload.
