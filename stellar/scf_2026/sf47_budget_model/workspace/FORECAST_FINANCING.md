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

## Owner's complete rendered-product instruction

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949


Keep the existing GitHub Actions zero-spend policy. This feature neither enables nor dispatches hosted CI.
