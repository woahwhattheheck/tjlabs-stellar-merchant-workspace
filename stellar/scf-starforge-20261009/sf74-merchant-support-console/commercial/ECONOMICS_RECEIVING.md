# Private quotation economics and complete receiving

Open the existing Merchant workspace at **/commercial?case=ORIGINAL_CASE_UUID**. Choose **Private economics** on that same case. This assessment belongs to staff delivery planning. The customer quote JSON and Markdown keep their original prices and terms.

The single assessment engine is `commercial/economics.mjs`, which calls the original SF47 workshare calculator. CLI, browser, receiving and SF47 source inspection use that same engine. No forecast entry, payment, customer acceptance or implementation task is created by assessing a quote.

## Review the actual delivery assumptions

Choose a saved quotation. Record the assessment date, delivery effort, cash labor cost, and separately the planning value of an hour. The quote's billed hours/rates establish its fee; internal delivery effort is an independent estimate.

For implementation and care, record every other cost with a stable ID, label, amount and source or explicit assumption. Select COMPLETE coverage only when every other cost within the stated scope is known. A blank amount becomes `null`; it remains unknown. An explicit `"0"` means zero. A known subtotal never establishes complete cost coverage.

The care estimate covers one entire monthly care contract. Its fee excludes route-usage revenue. Available care hours and other committed hours use the same monthly period; other commitments exclude the proposed contract. Capacity is a whole-contract planning ceiling, not booked demand. The original route pricing review remains separate in the complete assessment.

Set explicit effort sensitivity percentages, review the cash and planning-value results, inspect sources and missing inputs, and save a private assessment with a named operator. Cash cost and planning valuation are alternative scenarios; they are not added together.

The original case stores every sealed assessment and the exact quote binding. A new set of assumptions creates a new assessment. Original quote editions, source bundles, earlier assessments and response history remain intact.

## Installed CLI

`merchant-commercial` is the existing installed command. This contribution adds its `economics` subcommand:

```sh
starforge merchant-commercial economics --help

starforge merchant-commercial economics seed \
  --cases-dir /ABS/private/cases --case CASE_UUID --revision CASE_REVISION \
  --quote QUOTE_UUID --quote-sha SEALED_QUOTE_SHA256 \
  --as-of YYYY-MM-DD --out /ABS/private/input.json
```

The seed preserves unknown inputs. Edit the complete input file with the actual scope and source references. Compute its full UTF-8 byte SHA-256 before preview. The file SHA and sealed quote SHA are different identities.

```sh
starforge merchant-commercial economics preview \
  --cases-dir /ABS/private/cases --case CASE_UUID --revision CASE_REVISION \
  --input /ABS/private/input.json --input-sha INPUT_FILE_SHA256 \
  --out /ABS/private/review.json

starforge merchant-commercial economics save \
  --cases-dir /ABS/private/cases --case CASE_UUID --revision CASE_REVISION \
  --input /ABS/private/input.json --input-sha INPUT_FILE_SHA256 \
  --review-sha RETURNED_REVIEW_SHA256 --request-id ORIGINAL_REQUEST_UUID \
  --actor "Recording operator"
```

Keep the exact original input bytes, revision, review SHA, request UUID and actor after a lost response. The existing commissioning writer reopens an identical completed request before its current-revision check. A changed input uses a new reviewed request after the original is reconciled.

`list` reads all assessments at an explicit saved revision. `file` downloads the selected assessment as JSON or REPORT:

```sh
starforge merchant-commercial economics file \
  --cases-dir /ABS/private/cases --case CASE_UUID --revision SAVED_REVISION \
  --assessment ASSESSMENT_UUID --assessment-sha SEALED_ASSESSMENT_SHA256 \
  --kind JSON --out /ABS/private/assessment.json
```

Use `REPORT` for the readable internal report. The sealed assessment digest covers its canonical object. The returned file descriptor covers the complete downloaded bytes. Both are retained. Output files use the original private create-only artifact writer; identical bytes reopen, different bytes are rejected.

## Complete case export and independent receiving

Use `inspect` with the case/revision and the four-field selection:

- `--quote QUOTE_UUID --quote-sha SEALED_QUOTE_SHA256`
- `--assessment ASSESSMENT_UUID --assessment-sha SEALED_ASSESSMENT_SHA256`

It reproduces the selected assessment from the retained quote and inputs, then checks both original downloads.

```sh
starforge merchant-commercial economics export \
  --cases-dir /ABS/private/cases --case CASE_UUID --revision SAVED_REVISION \
  --quote QUOTE_UUID --quote-sha SEALED_QUOTE_SHA256 \
  --assessment ASSESSMENT_UUID --assessment-sha SEALED_ASSESSMENT_SHA256 \
  --source-dir /ABS/private/original-source-service \
  --export-id private-assessment-edition --out /ABS/private/package

starforge merchant-commercial economics inspect-package \
  --from /ABS/private/package --sha256 CASE_SOURCE_MANIFEST_SHA256 \
  --quote QUOTE_UUID --quote-sha SEALED_QUOTE_SHA256 \
  --assessment ASSESSMENT_UUID --assessment-sha SEALED_ASSESSMENT_SHA256

starforge merchant-commercial economics receive \
  --from /ABS/private/package --sha256 CASE_SOURCE_MANIFEST_SHA256 \
  --out /ABS/private/receiving --cases-dir /ABS/private/received-cases \
  --source-dir /ABS/private/received-sources --request-id ORIGINAL_RECEIVE_ID \
  --actor "Receiving operator" \
  --quote QUOTE_UUID --quote-sha SEALED_QUOTE_SHA256 \
  --assessment ASSESSMENT_UUID --assessment-sha SEALED_ASSESSMENT_SHA256
```

The exporter is the original `exportCaseSourcePackage`. It retains the entire original case history, workspace, support, original materials, source archives and complete source inventories. The assessment selector adds no replacement package format. The manifest SHA is the complete `case-source-package.json` byte SHA returned by that exporter.

Receiving first verifies the original full package and selected assessment, retains an immutable selection alongside the native receiving journal, then calls the original case/source receiver. It checks the quote and assessment again at the receiving case's `importedRevision`. Repeating the original receive preserves any later edits and returns their current revision separately. Once the whole source is retained inside the receiver, the original sender can be closed or moved.

Reopen the received case using its returned UUID and imported revision, download JSON/REPORT, compare their full descriptors, then reopen its current head before continuing edits. Re-export from that current head through the same native exporter. Close and restart the original owner process for an actual cold reopen; a second in-process read alone is not a cold-reopen result.

## Private SF47 handoff

`economics handoff` creates one complete private directory from an explicitly selected saved case revision and assessment:

```sh
starforge merchant-commercial economics handoff \
  --cases-dir /ABS/private/cases --case CASE_UUID --revision SAVED_REVISION \
  --quote QUOTE_UUID --quote-sha SEALED_QUOTE_SHA256 \
  --assessment ASSESSMENT_UUID --assessment-sha SEALED_ASSESSMENT_SHA256 \
  --out /ABS/private/sf47-handoff
```

It contains the complete original merchant HANDOFF, immutable quote JSON/Markdown, full private assessment JSON/report, the original SF47 source read and a complete file inventory. Every member is checked after publication. All files stay with staff; use the ordinary quote download for the customer-facing proposal.

For a quote with an actual recorded acceptance, add both `--acceptance ORIGINAL_RESPONSE_UUID` and `--acceptance-sha ORIGINAL_RESPONSE_MATERIAL_SHA256`. The original SF47 reader validates the current recorded response and original accepted task definition. Without those options it produces a source inventory only. It never invents acceptance.

Attach `merchant-handoff.json` through the existing SF47 Sources flow. The original source reader now exposes recomputed private assessments at `economics.assessments` and, for an accepted selection, `selected.economics`. The exact original cost inputs, sensitivity, capacity basis and original route review remain in the original source bytes and their normal source export.

Proceed through **Customer installations → Receive accepted quotation** using its original quote/response selection, preview and saved Installation command. Source inspection alone saves neither an Installation nor a Forecast row. Consult the existing SF47 `COMMERCIAL_INSTALLATIONS.md` for that complete operating flow.

## Receiving in the original owner operation

`economics-receiving-journey.mjs` composes the installed CLI, existing Merchant listener, real browser, complete case export, independent case receiver, SF47 read-only handoff and a separately started Node cold-read child. It requires the original selected case/quote and explicit inputs; it creates no customer acceptance, listener or unrelated case.

Use it inside the existing equipped native customer operation with the complete source selection and existing Node/Playwright/Chromium. Supply the private input described by `--help`. Its output directory is bound to that exact input before any mutation. The CLI request and browser request are retained before dispatch; reopen the same directory and input after interruption. The browser route records and then submits the original actual UI save, and its later continuation restores that exact pending request.

The original merchant owner keeps the listener and case store active. The journey closes only its browser and direct cold-read child. After the receiving result, the owner can stop/restart the Merchant listener on the same case store and view the received assessment there. Keep the returned descriptors, complete source package, private handoff, actual screenshots and receiving log together.

Required rendered review:

1. Open /commercial?case=CASE_UUID, choose Private economics, and inspect the actual selected quote.
2. Import the explicit full input, review the calculation, edit/review through normal fields and save once through the UI. Reopen its retained result.
3. Download/reopen the complete assessment JSON, readable report and working draft. Check a blank unknown field and explicit zero independently, using the chosen real input scope.
4. Inspect all sensitivity and capacity rows on desktop and 390 px widths, use keyboard focus and check page-level overflow, status and error text.
5. Open the received case in the same installed application; verify its exact quote and all earlier assessments before editing.
6. Open every captured screenshot visually. A captured image or successful HTTP result alone does not establish rendered acceptance.

The journey reports screenshots for owner inspection. It does not mark them visually accepted. Authored receiving inputs must be labelled as such; no authored figures should be represented as customer actuals.

## Complete current repository owner instructions

The following complete original repository guidance is included for the delegated receiving operator. Source: root AGENTS.md at be3410549846b3cb55074f5d83ee242592e73676. Preserve current subsequent owner updates.

# Repository delivery instructions

Use the current README and the existing product's build/receiving guide. Coordinate through the original implementation and receiving owners, preserve concurrent source, and carry work through its authorized delivery.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

## GitHub Actions zero spend — existing owner instruction

Keep GitHub Actions disabled in this repository's provider settings and preserve the disabled source policy in [.github/hosted-ci-policy.json](.github/hosted-ci-policy.json). Every workflow job must retain the established literal-false condition, including manual dispatch and reusable jobs. Preserve its original condition inside the wrapper, and preserve the complete steps, commands, source and delivery artifacts.

Run focused product work in the existing cloud Linux or original local receiving operation. A public repository, available free minutes, cloud admission failure or a missing green check does not authorize enabling or dispatching hosted Actions. Do not set `HOSTED_CI=on`, add scheduled hosted runs or choose a paid runner. Keep source-native receiving moving with its original owner and saved operation.

Before publishing workflow changes, use the maintained Commons `tools/hosted_ci_gate.py --zero-spend REPO_ROOT` and `--check REPO_ROOT` source operation where that existing runtime is available. Its canonical wrapper is `${{ (false) && (ORIGINAL_CONDITION) }}`; the original condition is retained for native continuation. Provider disablement, the whole-account spending budget and dated billing remain separate controls; preserve current artifacts and their original custody.

This carries Bryce's existing zero-spend instruction from [Commons RULES, CI and spend](https://github.com/woahwhattheheck/commons/blob/main/RULES.md#4-ci-and-spend) into this repository's consumed entry guidance. Original cost coordination: https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791755765336589 .

