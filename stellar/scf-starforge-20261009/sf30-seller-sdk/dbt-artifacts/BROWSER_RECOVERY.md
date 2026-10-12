# Browser working copies and original-operation recovery

This extension stays inside the original dbt project operator. It preserves a working review across reloads, reconnects an interrupted browser to its original native operation, and keeps concurrent operators from replacing each other's working changes.

## Operator workflow

Open the original project and sign in through its existing private session. The working-copy bar shows the last native save revision. Resource selection, the comparison baseline, review metadata, retained decisions, each resource's unfinished note and proposed SQL, the selected resource, search, pagination and tab are saved in the original workspace. Refreshing the page restores the current working copy. A new tab can choose it from the saved working-copy selector.

Use **Save working copy** before intentionally closing the browser. Autosaving follows edits; closing with a pending or unsaved change requests the browser's normal leave confirmation. Select **Keep as separate copy** to preserve your version after another tab saves a competing revision. Neither version overwrites the other. Selecting another edition or reopening a named review first preserves the outgoing working copy and starts a separate one.

Unfinished per-resource editor text stays in the working copy. Use the existing decision action to include it in the review. Saving a named review uses the original checked review writer. Report and project-export actions save changed named-review fields and selection before producing the original delivery. The existing required review name and reviewer must be completed.

The Operations tab shows browser requests awaiting completion alongside the original native journal. **Resume original operation** resends the same saved operation ID and input, then follows the existing job result. This handles a completion response lost after server acceptance without creating another review revision. An unchanged repeated action while it is already running shares that same promise. A new action after a completed result remains a new intentional operation.

## Persistence and composition

`browser_state.py` uses the existing application mutex, project identity and private HTTP directory. Working copies are atomic, revision-checked JSON files under `http/browser-drafts/`; writes use private file permissions and directory synchronization. A repeat of the identical context after a lost save response returns the saved revision. A competing context returns `BROWSER_DRAFT_CONFLICT` and remains available for a new-copy save.

The authenticated routes are `GET /api/browser`, `GET /api/browser/{id}` and `PUT /api/browser/{id}`. A write supplies `{expected_revision, context}`. The context carries edition/baseline, the original immutable review anchor, resource selection and decisions, form values, current and per-resource editors, tab/search/type/page. Older contexts without the optional per-resource `editors` map remain readable. The ordinary request-size ceiling and private session apply unchanged.

`ui/recovery.js` supplies the original-job journal, serialized working-copy client and request-generation checks. Browser session storage contains original request records before dispatch and the selected native working-copy ID. Native job outputs remain in the original job store. Edition, resource and comparison response generations prevent an older response from repainting the newer selection.

Working copies are local operator state, not an alternate review engine. They are outside the existing portable project export. Named review revisions, original artifacts, result bindings and delivery outputs continue through that original export and independent receiving workflow. Save a named review for transfer to another machine.

The four modified files are `dbt_http.py`, `ui/app.js`, `ui/index.html` and `ui/style.css`. The HTTP integration is additive: import/construct `BrowserDrafts`, serve `recovery.js`, and add its three authenticated routes. Preserve newer managed-launch, client, Applications, installation and SQL-publisher changes when composing these postimages.

## Complete native exercise

From the existing source root, use an unused private output directory:

```sh
python stellar/scf-starforge-20261009/sf30-seller-sdk/dbt-artifacts/BROWSER_RECOVERY_EXERCISE.py --work /absolute/new/dbt-browser-recovery
```

Python and Node 22 are used directly; no GitHub Actions job or package installation is added. The command first runs the unchanged original artifact/edition/review/result/export/delete-sender/receive/edit programme. It then starts the original HTTP operator and uses the actual `DraftSession` and `JobJournal` clients for native working-copy saves, reopening, concurrent revision recovery, lost-response resubmission, complete JSON/CSV/HTML output, full project export and independently editable receiving. All owned servers are closed in `finally`.

The input is the original author's local contract fixture and actual SQLite result. The exercise does not invoke a remote warehouse or perform a new dbt build. Its output directory contains the complete retained project, reports, archive and `native-recovery-result.json` for inspection.

The separate desktop/mobile rendering result is explicitly offline Chromium DOM with captured native reads and an in-memory draft transport. Direct localhost browser navigation returned `ERR_BLOCKED_BY_ADMINISTRATOR` in this container. Native HTTP and operation recovery were executed by Node against the original Python server; offline rendering is recorded separately from that execution.
