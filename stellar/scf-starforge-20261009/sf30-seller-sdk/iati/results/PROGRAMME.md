# Programme reporting in the IATI Results console

The Programme desk extends the existing Results application. It operates the original retained XML, Results definitions, immutable editions, comparisons, request journal and receiving archive. The HTTP, Python, client and merchant contracts remain the native Results contracts.

## Open a complete programme

Open the original private IATI console and select **Results → Programme desk**. Choose one or more retained activity sources, select **Use selected sources**, then **Build programme report**. Selecting a different source set starts a fresh source-bound selection, interpretation and comparison set in the draft. Earlier saved editions remain available in project history.

The header shows the complete selected activity, result, indicator, reporting-period, baseline, target and actual counts. The framework table retains every selected indicator. Tables page through all their rows, including baseline and observation lists, calculation tables and source correspondence; displayed counts describe the whole selected table.

The **Framework** view groups the original activity, result and indicator wording with its measure and observation coverage. **Observations** displays each original baseline, target and actual separately with the exact reported string, baseline year or period, dimensions, locations, comments and original source context. View filters select visible rows without changing the saved Results definition.

## Interpret one indicator

Open an indicator from either table. The worksheet preserves the original title, description, result, reported direction and aggregation attributes. Name the unit meaning and record the source basis for the interpretation. An explicit higher/lower direction also requires that basis.

Select the original reporting period. Choose an exact actual and, when appropriate, an exact target and baseline. Stage the comparison with a recorded selection basis, then build the current programme report. Multiple distinct actual/target pairs in the same period remain separately editable. Editing a comparison replaces its original period/target/actual selection; choosing a pair already used by another comparison asks you to edit that existing row. Start another comparison creates a separate selection. The original Results model validates dimensions, locations, calendar placement, measure type and formula requirements before calculating.

Available operations are inspection, actual minus target, actual/target percentage, baseline-to-target progress and actual minus baseline. The UI sends the unchanged native binding:
~~~json
{"periodKey":"original period key","targetKey":null,"actualKey":"original actual key","baselineKey":"original baseline key","operation":"baseline-change","note":"Original source relationship and selected meaning"}
~~~
A period without a target can use the separate baseline-change operation with targetKey:null. An absent observation stays absent. The source's unit values remain decimal strings throughout the display.

## Prepare and save programme reports

**Report and handover** displays each selected comparison with its actual, target, baseline, exact calculated result and comparability findings. Baseline change is displayed explicitly as actualMinusBaseline. The original model supplies the calculations; the browser does not recompute them.

Enter the named reviewer, review state and conclusion, then save the programme. The original Results writer rebuilds and retains the complete report in an immutable edition. Local review records local authorship; RSR hierarchy, role permissions, period unlock, submission approvals and contribution aggregation observations belong to the separately retained commissioning source.

Downloads select the displayed saved revision. The readable report includes HTML, JSON and complete selected CSV tables. The editable project carries original XML, all saved editions, source comparisons, request provenance and receiving history using the original Results export/receive methods.

## Review a following edition

The **Following edition** view opens two saved original reports. Identical source-bound indicator keys correspond directly. For replacement XML sources, select each earlier and following original indicator and record the relationship. The structured editor retains explicit one-to-one source correspondence; its saved comparison exposes additions, removals, activity differences and original-value, selection and interpretation changes.

The browser retains the selected programme, revisions, original edition digests, staged correspondence and unfinished mapping note in its workspace draft. Reopening reads both exact original reports and verifies their identities and digests before restoring the correspondence. Opening the same reports again preserves the draft. Changing the programme or revision selection starts a fresh correspondence for those editions. The original comparison writer receives only id, beforeRevision, afterRevision, pairs and requestId.

## Continue after a lost response

The browser saves the complete pending request in IndexedDB before forwarding it. Its key is bound to the original Results workspace. Each tab also retains its complete draft, worksheet selection, view filters and unfinished comparison; reopening restores that work and can recover the pending original operation. Opening a different programme or selecting different publisher sources resets view filters. A retained activity filter absent from the current report is cleared.

A read/write IndexedDB transaction preserves the existing request when another tab tries to submit. **Read original result** reads that exact original request. **Continue exact request** forwards the same full payload and identity if it has not committed. **Cancel uncommitted request and edit draft** uses the original Results cancellation journal.

A committed response is applied and its resulting draft is saved before the pending browser request is cleared. Reconciliation remains available if report refresh or browser persistence fails after the server commits. Existing session-storage drafts and pending requests are migrated into the same durable browser store.

## Compose with programme commissioning and receiving

The operator UI's application state is the original Results definition and edition. Programme metadata is not inserted as unknown Results fields. The commissioning contribution validates its own source-bound programme document and prepares a normal Results save request; its document/review sidecars and identity references travel in the complete programme bundle.

The complete runtime writer composes these UI leaves with the current Results, organisation and refresh shared source. Apply full postimages only after checking the selected original UI base. Preserve later concurrent UI work by composing it before publication.

The accompanying programme browser journey operates the existing selected programme case and private console. It resumes its original stages and request IDs, exercises the source worksheet and report, saves the named review, reads the exact accepted edition, inspects the visible desktop/mobile programme, and exports the full original project.


## Operate the selected programme in the browser

Run programme_browser.mjs from the same installed source and private console used
by the programme CLI. Its selection file uses the schema
stellar-forge.iati-programme-browser-selection.v1 and these fields:

| Field | Selected value |
|---|---|
| sourceRoot | Absolute original sf30-seller-sdk directory containing iati/client.mjs |
| output | Private persistent directory for this existing browser operation |
| playwright | Absolute installed Playwright module entry |
| chromium | Absolute available Chrome executable |
| connectionFile | Existing private console URL file |
| operationId | Original programme operation identity |
| project | Existing Results project ID produced by the programme operation |
| revision | Its exact selected immutable revision |
| editionSha256 | The original selected edition digest |
| source | Object with the retained source's sha256 and bytes |
| expectedUiSha256 | Exact complete results/ui/app.js digest from this source selection |
| reviewer | Named internal operator responsible for the local review |
| reviewNote | Source wording discrepancy, agreed interpretation and disposition |

Execute with the installed Node binary:

```sh
node iati/results/programme_browser.mjs /absolute/private/programme-browser-selection.json
```


This receiving workflow selects the actual retained 21,249-byte SNV D-Portal
activity representation already held by the original source owner. It opens all
12 indicators and 22 baseline/actual records, retains the undimensioned comparison
0 to 2348.00, records the title/description review and carries all gender records.

The browser saves its exact request before forwarding it. The first reviewed save
is committed by the original server before the test delivery path drops its HTTP
reply; a fresh persistent browser context recovers that same operation through the
visible Results action. A following local review edition refines the population
interpretation. The saved comparison records unchanged original source values
and changed interpretation. These two editions are explicitly local reviews of
one retained publisher-derived source.

The driver also edits an existing observation selection, closes and restores its unfinished replacement, and reopens the exact following-edition draft with its retained note. The native source and full reviewed result remain selected throughout.

The driver resumes its own original progress and requests, keeps the prior source
edition in history, downloads the saved report and complete editable project,
opens the report and worksheet at desktop/mobile sizes, and reopens the final
saved review. It writes programme-browser-progress.json and the completed
programme-browser-result.json in the selected private output directory. The
programme CLI can select the returned finalRevision directly for its full
independent receiving operation.

Keep the browser profile and private console URL in their existing private
runtime. Include the complete source, exported project, reports and receiving
outcomes in the programme delivery through its established private route.
