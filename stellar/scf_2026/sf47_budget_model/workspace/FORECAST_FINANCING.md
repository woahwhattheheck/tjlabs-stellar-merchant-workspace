# Financing options in the original Forecast

This workbench prepares complete alternatives inside the existing SCF operating case. It uses the original Forecast calculator and existing save command. A financing option is a planning proposal: capturing or comparing one records no receipt, award, customer acceptance, invoice, bank balance, or new obligation.

## Prepare useful options

Open the original case and its **Operating forecast**. Keep the current source case and pinned plan selected. The **Financing options** section sits above the original editor.

1. In the normal editor, enter the actual as-of date, day-zero date, opening cash and basis. Preserve original source IDs, invoices and observed cash links. Leave an unknown amount blank; an explicit zero is different.
2. Name the option and enter its capture note. Choose **Capture current editor as option**. The capture keeps every complete input and every raw control value, including a partially typed number or date that is not yet valid for calculation.
3. Change the original editor to a real alternative—for example, a later conditional grant receipt, different selected customer work, an explicitly proposed collection schedule, a supplied cost estimate, an available weekly capacity, an actual FX assumption, or reviewed unspent customer cash attribution. Capture it under another name.
4. Use **Replace from current editor** only when updating the selected original option. Every prior capture, name and note remains in that option's history. **Duplicate** starts another named option from the complete retained capture.
5. **Archive option** removes it from the next calculation, while preserving the option and its history. Restore it when needed. Up to 24 active options can be calculated together; up to 200 archived and active options are retained in one working study. Start another separately named study when a complete edition becomes too large.

An option does not infer an acceptance date from hours completed. Keep the original customer release conditions, grant completion/review requirements, invoice liabilities, payment lags, scope and source evidence. When evaluating a changed agreement or cost rate, label it as proposed until the original counterparty actually accepts it.

There is no automatic 20% effort uplift, award date, financing price, conversion fee or collection delay. Enter each assumption explicitly in the existing fields. The original source-backed five/seven-workshare financial analysis can inform those inputs, but its 66 curves are a separate planning source and do not become observed receipts.

## Calculate and compare

Choose **Compare active options**. The native service reads one original case context under its existing lock, checks the exact case version, and calls the original Forecast calculator for each complete input. If any option is invalid, the entire batch fails with that option's index or name. Earlier captures and comparisons remain unchanged.

Each successful comparison retains:

- the exact raw submitted inputs, including original selected source references;
- the original normalized inputs and complete native report for every option;
- the exact common case/source identity and version;
- every original dated cash and work row, capacity result, source issue and currency coverage result;
- the original digest of each raw option, the complete request, each native preview and the complete batch;
- the full case context used by the desk, with its original source metadata.

A comparison becomes historical whenever the source case version, option membership, name or captured inputs change. Historical editions remain readable and exportable. Recalculate the current case before adopting a calculated result. Saving the study itself adds a source and advances the original case version; this deliberately makes the previous comparison historical.

The table distinguishes these measures:

| Measure | Meaning |
|---|---|
| Grant-only required starting cash | The original conditional-grant scenario's largest modeled cash need, before subtracting opening cash. |
| Combined required starting cash | The original scenario including selected commercial work and its actual modeled costs/receipts. |
| Extra gap after opening cash | The remaining shortfall after the explicitly entered total opening cash. Unknown opening cash leaves this unresolved. |
| Protected customer starting need | The original customer-funding result, when enabled, after protecting attributed customer money for remaining delivery obligations. |
| Protected extra gap | The protected need after known total opening cash. This is a planning restriction, not a statement that a bank or law segregates those funds. |
| Available / peak weekly hours | The original Forecast's seven-day equivalent capacity comparison. It is not a dated staff roster. |
| Overloaded days and issues | The original calculator's recorded capacity/source/date decisions, preserved in full. |

A delta compares exact USD cents with the selected reference option. Missing or incomplete values stay unresolved; the UI does not rank an unknown scenario as cheaper. Different as-of dates or horizons must be considered explicitly: inspect the original dates and complete inputs before drawing a financing conclusion. The comparison does not combine or sum alternative cash savings.

**Inspect report and assumptions** shows every changed input, complete source issues and all dated cash rows in pages of 30. The full original result and source identity remain visible and included in JSON. **Download comparison CSV** produces one complete row per option; blank numeric cells mean unresolved or not applicable, not zero. Text that could be interpreted as a spreadsheet formula is guarded in this derived CSV; the exact original values remain in JSON.


## Complete financing decision handover

The comparison and Planning limits screens now produce a complete readable handover from a **retained native comparison**. Select the intended comparison edition and reference option. Choose **Download complete handover ZIP** for the full delivery, or **Download readable report** for one standalone HTML file. From a retained assessment, **Download assessed handover ZIP** and **Download assessed readable report** use that assessment's original comparison even when another comparison is currently selected. The selected assessment is marked explicitly; every other assessment of the same original comparison remains included.

The export checks the complete study and original preview/request/result digests, obtains and verifies all original source attachments, and checks that neither the study nor the current case changed during preparation. A stale selection, missing source or failed download leaves the current editor, original study, saved comparisons and native records intact. The report states whether the comparison **matches the supplied case context at export** or is historical relative to that supplied context, against its exact case version and active option selection. A downloaded study may contain an earlier native case version. Opening a later copy does not check a newer live case or recalculate that label.

### Read the complete decision

Open `report.html` in an ordinary browser. It contains every option in the selected comparison, its original normalized inputs, input differences from the selected reference, complete calculation basis, scenarios, source issues and original dates. Read the grant-only and combined pooled cash columns separately. When customer-fund protection is enabled, its pooled balance, reserved amount, unreserved amount, unknown reservations and each remaining customer obligation have complete dated tables.

The capacity section retains the native calendar-day distribution, available weekly hours, peak seven-day-equivalent hours and overloaded days. A seven-day equivalent does not establish a staff roster. Missing dates, unvalued or undated obligations, missing opening cash and other original uncertainties remain visible; zero is retained as an entered value. A numeric dated result does not resolve an undated or unvalued obligation. Planning limits retains each exact criterion, MEETS / EXCEEDS / UNRESOLVED result, explanation, scope group and finite shortlist. Read the original included invoices and customer scope before comparing options.

Use the option selector, **Find within complete tables**, **Show all rows** and **Open all sections** to inspect the complete output. Filtering changes only this view. **Print complete report** opens all sections and includes every option and original row, then restores the screen's prior section state. Wide tables scroll horizontally on a narrow display. Long identifiers, source titles and notes wrap without hiding their original values.

### Package contents and exact values

The ZIP uses the original application ZIP writer. It contains:

- `report.html`, the standalone complete readable report;
- `study.json`, the full editable study with all comparisons, earlier option names/notes/captures, raw unfinished controls, criteria, adoptions, source receipts, exact pending requests and original attached bytes;
- `selection.json`, binding the actual study revision/hash, selected comparison/hash, selected assessment, reference option, common source version and export time;
- `comparison.json` and `assessments.json`, the complete original native selection and all associated assessment records;
- `option-summary.csv` and `planning-limits.csv`;
- one `options/NN/` directory per original option, with its complete native preview, every typed input and report field, every assumption difference and separate complete CSVs for dated cash, cash events, work, packages, invoices, grant receipts, customers and original issues; event-dependent work and customer-fund reservation tables are included when present in the original report;
- exact original source files under `sources/<SHA-256>.bin`, with their original filenames, media types, source IDs and comparison membership in `source-index.json`;
- a `manifest.json` listing each other member's exact byte count and SHA-256.

All modeled dollar measures are USD unless an original field explicitly gives another currency; underlying native currency and exchange evidence remain in the exact report. CSV quoting retains commas and multiline text. Finite numeric values and strict signed-decimal USD, hour and criterion fields remain numeric for spreadsheet sums. Formula-like ordinary text is guarded in derived CSV. Blank CSV cells represent a null or absent field; `complete-inputs.csv`, `complete-report-fields.csv`, assumption difference kinds and the complete JSON retain the exact distinction among absent, null, empty, false and explicit zero. No table is truncated. A handover exceeding the supported 512 MiB complete output limit is rejected with the original study still available.

### Reopen and continue the same work

Use **Download complete editable study** inside the standalone report, or take `study.json` from the ZIP. In the original Forecast application, choose **Reopen study**. The existing receiver validates all original identities, history, digests and complete source bytes before replacing the current study. It preserves the prior local study through the original recovery download. A verified direct native-case descendant is supported by the existing receiving contract; the original full case export carries native records and their history.

Read a historical comparison freely. Before adopting a calculated option, restore the intended option selection and calculate against the actual current case. Use the existing before/after adoption review and original Forecast Preview/Save. A report export does not introduce another financial writer or save a new forecast.

The producing peer must open the **exact outgoing HTML and ZIP**, LOOK at the rendered desktop and narrow views, and operate option selection, table filtering, expansion, complete printing and editable-study download. Open the actual CSV/JSON/source members, then receive the exact study into the same original application and inspect its reopened controls and retained values. Include populated, empty, loading and error states and a historical comparison with no active options. Screenshots, source execution and a peer's source review do not substitute for looking at and operating the actual outgoing version. Use F47A's existing receiving continuation and original native case; preserve its accepted runtime and pending request identities.


## Adopt a reviewed option

**Review in editor** restores a captured option, including unfinished raw values. **Review calculated adoption** uses the selected comparison's normalized native inputs and requires the comparison to match the current original source and active options.

Both paths show the complete before/after inputs and the retained raw control values before adoption. The final action verifies that the original editor, option study and case version still match that review. It keeps the displaced original working file in **Download previous working file** and retains the existing workbook return, cash-reconciliation evidence and study history.

Adoption changes only the current Forecast editor. The ordinary native preview then validates the chosen inputs. If an unfinished value is invalid, the entire option stays in the editor for correction; no financial record is saved. Use the normal **Save** action after the original preview succeeds. Its existing preview hash, case version, original request ID and lost-response continuation remain authoritative.

## Save, download and reopen

The complete desk is included in the existing Forecast IndexedDB working file and its download/reopen controls. It is isolated by the original staff/case namespace. Existing Forecast inputs, source workbook review, cash review, and pending native request stay in the same working file.

- **Download complete study** receives and verifies every source byte referenced by every retained comparison's original case context. The JSON contains complete options, raw values, histories, comparisons, original contexts and original source attachments. This is an editable study, not a replacement for the executable application or the native case archive.
- **Download retained working study** downloads the current in-memory state independently of a successful storage write. It includes source bytes already received and exact pending requests. It is explicitly marked \`CASE_RETAINED\`, because some source bytes may still live in the original case. Use this recovery download if storage is unavailable or a network source download fails.
- **Reopen study** validates the entire candidate before replacing the current desk. It binds to the same original case, origin and pinned plan, or the actual verified direct native-case descendant; verifies comparison/preview/input digests and supplied attachment bytes; and checks that its original source identities are present in the case. The prior study is downloaded before replacement. Other current Forecast editor work is preserved.
- **Save study with original case** stores a complete immutable study edition using the original \`source.add\` command. It stores every option and result; source attachments already held by the case are referenced by their complete original metadata instead of recursively embedded again. The ordinary 8 MiB per-source and original case source allowance apply. No data is truncated to fit. A larger study can still be downloaded intact.
- **Reopen selected saved study** receives that exact native source through the original source download route, checks its byte count and SHA, and follows the same atomic candidate validation.
- The original complete **case export/reopen** carries the saved study source, original source attachments, financial records and immutable saved Forecast editions. Native case receiving may allocate a new case ID. Reopening a saved study into that actual direct native descendant is allowed only when the server's original-case ancestry and pinned plan match; all comparison sources, requests and historical IDs remain original, and the receiving lineage records the old complete study digest. A new comparison is required before adoption. Pending source commands are never rebound: recover them in their original case first.

Enter a clear decision/source note before saving a study. The original \`source.add\` request ID and body are persisted before any request is sent. A successful reply is persisted before the case refresh. On an uncertain response, **Continue original study save** sends the same request, preserving native replay. A definite rejection is retained in history; a new save requires a new explicit action after the current case is refreshed. Only one workbook-source, study-source or Forecast-save request can be pending in the same working file.

Do not close the original working copy after a storage failure without downloading it. The recovery download does not require another database write.

## Native integration


The original client provides forecastOptionsPreview(caseId, expectedVersion, options). Each of one through 24 options is {id, name, inputs}, retaining its complete normal Forecast inputs. The authenticated POST route is /api/operations/<case>/forecast-options-preview with {expectedVersion, options}. IDs are unique, one to 100 letters, numbers, dots, underscores or hyphens with an alphanumeric first character; names contain at most 200 characters.

The native Operations method locks the original workspace, checks the reviewed case version once, and calculates every option against the same full original context using forecast.preview. The response schema is stellar-forge.forecast-financing-preview.v1, with one common source identity, every named option's complete native preview each original inputSha256, requestSha256 for the full submitted {expectedVersion, options}, and the original canonical SHA256 of the whole result without its sha256 member. The reviewed version equals the common original case version. Keep the submitted raw inputs beside native normalized inputs; normalization may legitimately change their representation. All original decimal strings, unknown values, currency rules, customer funding attribution, daily cash rows and capacity results remain untouched. Any invalid option rejects the whole batch with its index or name and original error status/code.

Comparison is read-only. Adopting an option copies its full inputs into the existing Forecast draft; saving follows the normal reviewed Forecast save with its exact preview hash and case version. Retain a financing study as a complete ordinary original source through source.add; reopening uses its captured original case and source identity. A changed current case requires a new explicit comparison instead of changing the retained one.

The original CLI exposes the same read-only operation through \`cli.py operations forecast-options-preview\`. Its \`--options\` file is a complete JSON array of \`{id,name,inputs}\`, not a worksheet or partial patch. Use the original existing workspace and actual current case version:

\`\`\`sh
python3 cli.py operations --workspace /actual/original/workspace forecast-options-preview \
  --case operation-actual-original-case-id \
  --expected-version ACTUAL_CURRENT_VERSION \
  --options /actual/private/options.json \
  --output /actual/private/new-comparison.json
\`\`\`

Replace the illustrative path, case ID and version with the existing original invocation's exact selections. Follow the original CLI owner's workspace-lock procedure: use its established headless continuation after closing the original server, rather than opening a second writer beside a running browser server. The command uses the original bounded UTF-8 reader, native batch method and create-only output publisher. It records no financial event.

The new pure Python module is \`forecast_financing.py\`. \`Operations.preview_forecast_options\` owns the original lock/context/version check; the authenticated operations HTTP adapter owns the new route. The existing typed agent client exposes \`forecastOptionsPreview\`. No native mutation action, schema table, cash calculation or saved-Forecast format changes.

The browser leaves are \`forecast-financing.mjs\`, \`forecast-financing-desk.mjs\` and \`forecast-financing.css\`. \`forecast.mjs\` composes the desk into its original editor, complete working session and source recovery. Both source registration and the original managed-source distribution include these complete leaves and this guide.

## Original operating course

Continue the existing F47A / 6BA15 / 70D2 Forecast operation. Use the actual retained v32 archive, 524,761 bytes, SHA256 \`24166a4313e4c3667b75431957f826ce7a28cc2178c03dbdc4dfe06be6713aaf\`, and its original actual receiving case. Do not create another customer or claim these planning inputs as cash observed today.

The original saved Forecast \`forecast-879f1a591c974dbea150951862115229\` retains source version28 within the v32 archive. Its exact retained preview has 186 daily rows; combined starting need USD7,680.00, conditional-grant need USD15,200.00, and unknown opening cash. Those are historical result facts, not expected values for an arbitrarily advanced case or modified assumptions.

For the actual current native operation:

1. Open the exact installed version and original case. View the populated desktop and narrow screen before a long course.
2. Capture the original current full inputs and an intentionally unfinished field. Reload the original working file and confirm that field and its option history survive.
3. Complete that option in the original editor. Create at least one alternative using an explicit existing receipt date or opening-cash assumption, preserving all customer/source/FX references. Compare both against one current version. Check the complete request/source identities and actual native report, without asserting historical money values after a source change.
4. Inspect both complete input differences and all native cash/capacity/unknown results. Archive all options and confirm the historical comparison remains readable; restore the selected original options.
5. Download a complete study and reopen it. Open the actual JSON/CSV and every included source attachment in its usable format. Verify the original case-source byte identities.
6. Review an option, change the current original editor before applying, and verify the stale review preserves current work. Review again and adopt explicitly. Use the actual normal preview/save.
7. Save the study through the original case source command. At the existing native transport boundary, preserve a successful result before simulating response loss; resume the exact original request and verify one source/history event. Retain actual operation IDs and source versions. Do not rerun financial actions already completed.
8. Export and reopen the complete native case through its original receiving flow. Reopen the saved study source and native saved Forecast; preserve its original lineage. The same-case browser pending request is never rebound to the received case.
9. View the actual empty, loading and error states and use the important controls at desktop and narrow width. Inspect rendered reports, exports and attachments. Record actual remaining issues and fix the source directly.

Source-level execution and contract review do not constitute this native product course. Until the producing peer has viewed and used the exact rendered version, describe it as integrated source awaiting its existing equipped receiving operation.


## Assess explicit planning limits and choose a finite option

Open **Financing options → Planning limits** after calculating the active options. The original batch calculator has already produced complete cash, currency, source, work and capacity reports against one case version. Assessment reads those saved reports. It does not adjust a receipt, value an unknown amount, create an invoice or recalculate a financial curve.

Choose the cash scenario and measure deliberately:

| Selection | Meaning |
| --- | --- |
| Conditional grant only | The original grant scenario, retaining its conditional award and tranche assumptions. |
| Combined pooled cash | Original grant and selected commercial flows pooled together; customer delivery obligations retain the original Forecast treatment. |
| Combined with customer funds protected | The original customer-funding projection. Each option must actually enable that projection and supply the necessary attribution and valuation. This is a planning reservation, not a bank or legal restriction. |
| Required starting cash | The original maximum required initial funding over the modeled curve, before using entered opening cash to find a further gap. |
| Extra funding after known opening cash | The original additional gap after the entered opening amount. Unknown opening cash remains unresolved even if required starting cash is known. |

Enter only limits you intend to assess. A blank limit is not selected; `0` is an explicit zero tolerance. Cash accepts exact plain nonnegative decimal values with at most two fractional digits. Peak weekly-equivalent hours accepts up to eight fractional digits. Overloaded days accepts a nonnegative integer. Unfinished text such as `0.` remains in the portable working study and can be corrected later, but cannot be assessed as a finished number.

The peak-hours measure is the native seven-day-equivalent workload derived from calendar-day planning, not an actual staffing roster. The overloaded-day count uses the original weekly capacity of **each option**. Entering a new peak-hours limit does not recalculate that count. If native capacity is unknown, a displayed zero count cannot establish capacity. Selected undated work keeps capacity checks unresolved unless the dated portion already exceeds the entered limit; the dated known value stays visible. Unknown native capacity remains unresolved. Undated delivery costs and unknown currency values cannot support a combined cash pass. Conditional grant-only cash uses its original narrower financial scenario; this does not remove commercial work from the capacity check.

Give the assessment a name and a decision note. Select **Assess selected comparison**. Every original option remains visible:

- **Meets entered limits** means all selected checks are known and no greater than the entered limits.
- **Exceeds entered limits** means at least one selected check exceeds its limit. Other unresolved checks remain visible.
- **Unresolved** means a selected check is unknown and none of the known checks already exceeds its limit.

These labels address only the stated limits under the native conditional assumptions. They do not establish an award, customer payment, accepted work, available staff, completed observation cohort or legal permission. Inspect the original issues and assumptions even when an option meets the entered limits.

### A shortlist with an explicit comparison boundary

An option is shortlisted when it meets the entered limits and another option in the same comparable scope does not have values at least as good on every selected measure and strictly better on one. Lower values are preferred only for the measures you selected; ties remain on the shortlist.

The scope boundary preserves the same as-of date, first and last forecast dates, original package identities/scopes/planned and remaining hours, selected customer identities/scopes/remaining hours/source selections, invoice identities, actual total/open amounts, included/excluded liability coverage, commercial allocation and original native weekly capacity. A changed work population, capacity or date horizon has a separate group. Missing scope cannot enter the shortlist. Unknown or exceeding options are never promoted over a fully known option. A single eligible option can be shortlisted without proving it is globally optimal. This is a finite comparison of the retained options, not a search over every possible financing arrangement.

The comparison still may contain different prices, cost assumptions, cash attribution, payment dates or conditional commitments. Read the original input differences before choosing. Reducing work or extending the horizon does not silently win a shared comparison.

### Retain, inspect, reuse and adopt

Each assessment retains its exact criteria, all original option results, native comparison digest, case version and creation time. Editing the current limits or changing the case leaves the prior assessment intact. Choose a retained assessment to inspect its historical results. **Reuse retained criteria** preserves the displaced unfinished criteria in history before copying the earlier values.

Assessment CSV contains one row per original option and selected check, including the actual value, limit, result, uncertainty reason, scope group and shortlist basis. Assessment JSON retains the complete result. **Inspect assessment detail** includes the exact native option, original batch request and assessment. Spreadsheet-safe CSV text preserves formula-like source names as text; the JSON retains the original names exactly.

**Review original option adoption** opens the same complete before/after review used by Financing options. The original case version and active option inputs must still match that native comparison. Historical or changed options require a new original native batch calculation before adoption. An operator may deliberately review an option that exceeds a limit; its result is visible in the review and the exact assessment identity stays in the adoption history. Adoption is explicit and continues through the normal original Forecast preview and save.

All criteria, unfinished values, assessments, displaced drafts and adoption links travel in the complete study, the original Forecast working file, and the existing saved case source. Export/reopen validates the retained assessment by deriving it again from its exact original native comparison; altered result cells reject before adoption. An adoption linked to an assessment must also retain that exact option’s calculated inputs, source version and empty calculated raw-field map. Old studies without planning-limit state remain unchanged. The same pending-request, full-source, actual case-ancestry and storage-independent recovery rules described above continue to apply.

### Continue the original equipped receiving course

Use the existing F47A/native operation and its actual case. After the earlier complete option course:

1. Select the actual current native comparison, open Planning limits at desktop and narrow width, and look at the real controls and result table. Inspect the empty state before assessment.
2. Retain a partially typed cash limit, reload the full working file and confirm that exact text survives. Complete it with an operator-selected amount. Assess all original options and inspect each result, original issue, source scope and capacity basis.
3. Use an actual retained option's cash requirement as a boundary, then a one-cent-lower limit in another named assessment. Keep both editions. Switch to extra funding with unknown opening cash and confirm unresolved handling; use the actual enabled/disabled customer-protection option as appropriate.
4. Reuse an earlier criterion after typing a different unfinished draft and reopen the complete study. Confirm the displaced draft, original sources and every assessment survive. Open the actual CSV/JSON and detail downloads.
5. Review adoption from a retained assessment. Change the original source or editor at the existing operating boundary and verify stale review protection. Recalculate using the unchanged native batch endpoint, explicitly review the current result, and continue the original normal preview/save.
6. Save the complete study through the original source writer and cold-reopen the original case and complete study. Retain the actual native request identities and inspect the real rendered reports and every outgoing attachment.

The retained V8 source exercise uses the genuine original v32 saved preview: required combined starting cash USD 7,680.00, peak 58.3338 seven-day-equivalent hours, 42 overloaded days, unknown opening cash and disabled customer protection. Exact limits pass those chosen checks; USD 7,679.99 exceeds the cash check; extra-after-opening and protected-fund choices remain unresolved. This exercises the actual new module with original data; it is not a newly calculated multi-option batch, Python execution or rendered browser result. Do not present differing historical case versions as one new same-version batch.


## Owner's complete rendered-product instruction

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949


Keep the existing GitHub Actions zero-spend policy. This feature neither enables nor dispatches hosted CI.

## Installed Grant Operations and Merchant selection

Use the complete original Grant Operations distribution. The selected recipe is `stellar/scf-starforge-20261009/distribution/selections/grant-operations.json`; its `grant-workspace` contribution selects the full SF47 component and `managed-source.json`. The builder includes every managed source, follows original Node/browser dependencies and records complete byte counts and SHA-256 values. This includes the native batch, original calculator, authenticated HTTP/staff route, typed client, CLI, browser host, options desk, Planning limits module, stylesheet and recovery dependencies together. Copying only the browser files into an earlier runtime does not update that native selection.

The release producer uses the existing builder against the deliberately selected immutable public source commit:

```sh
node /absolute/maintained/source/stellar/scf-starforge-20261009/distribution/build.mjs --repo /absolute/original-git-cache/repository.git --ref FULL_IMMUTABLE_COMMIT --selection grant-operations --out /absolute/new-grant-release --offline
```

Use `--offline` when the original Git objects are already retained. A resumed build uses the same output, selected commit and `--resume`; a following source edition uses a new output. Keep the resulting TGZ, archive hash, manifest and original build receipt. Inspect the selected archive's `sourceSelection.id`, `sourceCommit` and complete source entries. The original manifest must contain `forecast_financing.py`, `forecast-financing.mjs`, `forecast-financing-desk.mjs`, `forecast-financing-decision.mjs`, `forecast-financing-handover.mjs`, `forecast-financing.css`, and their complete original host/client/CLI/calculator dependencies at that same release.

Follow [Grant Operations installation and operation](../../../../products/grant-operations/OPERATING.md) and its original runtime installer to prepare, install and inspect that complete release. An upgrade prepares a separate runtime, preserves the earlier installation and does not change the source of an accepted running application. In Applications, select the reviewed runtime with the **same original private grant workspace**, review the actual source/path/selection hash, save the setup, and use the original lifecycle to start it at the selected explicit origin/port. Preserve the original scenario, actual case and all stored financial events; do not initialize a replacement case to demonstrate this feature. The managed launcher verifies the full installed source selection before serving it. Only the original service owner stops or changes an active application.

The installed dispatcher also exposes the existing headless operation:

```sh
node /absolute/maintained/source/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run --dir /absolute/installed/grant-runtime -- grant-workspace --python /absolute/selected/python operations --workspace /absolute/original/private-workspace forecast-options-preview --case ORIGINAL_CASE_ID --expected-version CURRENT_CASE_VERSION --options /absolute/private/options.json --output /absolute/private/new-comparison.json
```

The output path is a new private file. A live service already holding the workspace remains the original owner; use its authenticated browser/client/Merchant connection instead of opening a competing headless writer. Read the actual current version immediately before calculation. The original native endpoint rejects a stale version for the whole batch; do not rewrite a pending request to appear current.

The existing Merchant grant provider exposes `merchant_grant_forecast_options_preview` with the original workspace alias, case ID, expected version and complete `inputs: {options: [{id, name, inputs}]}`, or a verified retained input-file alias/pointer selecting that same wrapper. Its exact retained file SHA is required for an aliased source. The adapter delegates to `GrantWorkspaceClient.forecastOptionsPreview`, retains the complete native result and exposes the original snapshot/rows/file-reading continuation. It neither saves a forecast nor records funding. The provider is part of the same selected `merchant-provider-grant-workspaces` contribution; no separate provider or calculator is installed.

### Original operating course after source adoption

F47A's existing `case_planning_browser.mjs` continuation owns the supplied-page course. Continue the original case, original native requests and actual v32 source through that parent. Compare at least two clearly named, complete authored input alternatives at one actual native case version. Inspect the native source/version and every conditional assumption; replace one option and reopen its full earlier name/note/input; enter exact limits and preserve a partial limit before reopening; retain separate assessments; inspect a historical comparison after all its options are archived. Adopt only the explicitly selected calculated option through the before/after review and original Preview/Save.

Download and reopen the complete study, assessment detail and CSV, original source bytes and native case export. Confirm the selected original report, criteria, unknown/zero values, all source attachments and unchanged pending request survive receiving. A changed source case requires a fresh native comparison before adoption. Preserve earlier completed native phases and every original forecast rather than rerunning financial events.

The producing peer must open the exact installed application and LOOK at the actual desktop and narrow render, operate capture/replace/archive, comparison, filtering, paging, limits, criteria reuse, adoption and download controls, and inspect populated, empty, loading and error states. Open every outgoing attachment and usable archive member, then inspect the cold-reopened application. Source execution or review alone is not evidence that this installed course ran. When the seat lacks a current equipped host, retain the original accepting receiver and complete exact source/input; do not label another callback author as that host or create a duplicate application.
