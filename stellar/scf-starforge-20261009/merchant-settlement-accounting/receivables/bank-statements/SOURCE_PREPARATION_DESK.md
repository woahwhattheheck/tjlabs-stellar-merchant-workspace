# Bank source preparation desk

Open **Bank reconciliation → Source preparation** in the existing installed accounting workspace. Direct entry is `/bank-statements/source-preparation.html`. This desk connects the original configured-source controller to a usable operator flow: retain complete inputs, review an interpretation, explicitly run the original source transformation, recover its original request, inspect every output and reopen a complete delivered preparation.

The existing Bank statement intake, account matching and period close remain separate actions. Source preparation creates original-source artifacts in the same accounting workspace; it does not import financial transactions or record money.

## Installation and source authority

The installed host receives the original accounting configuration through its existing configuration reader. Select the actual configured workspace and file aliases. The desk never accepts a filesystem path, token, arbitrary server address or new accounting session.

The original same-origin `config.json` supplies `sourcePreparationsApiBase`, `sourcePreparationsWorkspace`, `sourcePreparationsWorkspaceId` and `sourcePreparationsSourcesSha256`. These fields are null when this installation has no configured source connection. In that case the desk explains the missing installed selection and does not offer an improvised connection.

The browser checks the Bank state workspace against the configured source workspace. Every source route keeps the original workspace/source headers and authenticated request boundary. The configuration's accounting `sourcesSha256` is distinct from the controller's `sourceSha256`: the former binds the accounting source selection, while the latter identifies the exact installed source-transform implementation retained in each preparation.

New browser files are `public/source-preparation.html`, `source-preparation.mjs`, `source-preparation-state.mjs` and `source-preparation.css`, with the companion `source-preparation-client.mjs`. The original Bank navigation and browser asset manifest receive additive links. Original `public/app.mjs`, profile/collection models, parser, ledger and financial operations remain their maintained sources.

## Author and retain a complete request

1. Open the desk and read the current installed workspace and source identity.
2. Choose the intended operation and **New request**. This creates its UUID once. Record the actual operator.
3. Add each input under its declared role. Choose a configured alias and original filename, or select one exact file from a completed preparation. **Inspect and add exact input** records the actual complete byte length and SHA-256.
4. Fill the operation choices. Use the original format and account/date/amount/currency interpretation. The mapping dialog retains both structured selections and uncommitted raw JSON across reload. It does not infer a bank account from a filename.
5. **Review exact request** binds the complete request JSON and current controller source. Inspect every input, exclusion and mapping choice. The checkbox acknowledges this selected review.
6. **Retain complete inputs** first commits the full original action to the existing browser recovery store, then invokes the original source controller. Retention alone leaves the source preparation PREPARED.
7. Inspect the retained receipt and choose **Execute retained request** deliberately. The native controller uses the original request hash, source edition, input bytes and frozen creation time.

The browser writes only drafts and action history to the existing `stellar-forge-bank-reconciliation-v1` IndexedDB `records` store. Its namespace binds exact origin and original accounting workspace. All source transforms and artifact custody remain with the maintained native controller.

## Operation guide

| Operation | Inputs | Operator choices and result |
| --- | --- | --- |
| Prepare source collection | One complete input per original source key | Name the collection, retain distinct original item IDs, complete mappings, inclusion flags and notes. Produces complete `collection.json`. |
| Edit retained collection | `collection` | Load the original revision/items, change selected mappings, notes or exclusions. Remove an edit row to keep that original unchanged. Preserves complete original bytes. |
| Receive collection | `collection` | Explicit new recipient collection identity in the actual current workspace; existing receiver retains its origin. |
| Inspect collection | `collection` | Original parser processes included originals; exclusions, source-review problems and all successful reports remain visible. |
| Save profile | Optional `library` | Select the actual library/profile and expected versions, or explicitly create new identities. Record name, reason and complete mapping. |
| Receive profile library | `incoming`, optional `library` | Use the current recipient library identity/revision. Preserve complete incoming version histories and original origins. |
| Review profile | `library`, `collection` | Choose an actual saved profile/version and original item IDs. Retains a review bound to both full input files. |
| Apply reviewed profile | `library`, `collection`, `review` | Original engine verifies the exact original review, identities, full hashes and selected population. Changed material needs a fresh review. |

Input role names are exact. Configured incoming collection/library files can be used through aliases. For retained collection/library outputs, the guided buttons read all original rows with the native paged view and bind the exact output SHA before selecting IDs/revisions. The complete JSON editor remains available for every supported parameter.

Raw request edits are retained as written, including incomplete JSON. **Apply complete JSON to editor** is explicit. A retained native request is read only; **Create a new request from these choices** generates a new request UUID explicitly and retains the original request/history. Review actual prior revisions before running the new selection.

Unapplied complete request JSON disables guided fields until **Apply complete JSON to editor**. Raw edits and mapping drafts remain saved as written. Successful input retention freezes only the matching original request; use the explicit new-request copy control for a changed request.

## Draft conflicts and interrupted responses

Every draft, pending intent and completed observation is saved using an IndexedDB read-and-compare transaction. Two tabs cannot overwrite one another's saved pending request silently. A stale save retains its entire local snapshot under a separate conflict key and blocks dispatch. Every queued snapshot reaches its own conflict save; the latest typed content is preserved. Download **My complete draft**, then **Reopen current saved desk**. The **Retained conflicting drafts** panel enumerates the original snapshots in bounded pages, including after a full page close/reopen. Download the exact retained record or deliberately restore its draft and history. Restoration preserves the current desk in history, is guarded by the current IndexedDB revision, and refuses to displace a pending action. An unfinished action from the restored snapshot is kept under its original request in history for explicit reconciliation; restoration sends nothing.

A source request is committed to browser storage before its remote retain/execute call. Reload never automatically sends it. **Check original saved result** reads the same preparation UUID. **Retry the exact original action** reuses its complete original body/hash; it does not create another request.

The desk distinguishes NOT_FOUND, RETAINING, PREPARED and COMPLETE. Failed native transformations retain original diagnostics and remain PREPARED. A lost successful reply is reconciled through the original receipt. A different request, workspace or source identity is rejected, preserving the original action.

**Keep this request in history** first obtains an actual original observation, then retains its exact action under that operation's history. It does not delete or cancel server work. **Resume original saved action** restores that same action; another deliberate click performs reconciliation or retry. This lets an operator preserve a rejected or unfinished selection while authoring a separate request without silently replacing it.

**Download complete browser working record** retains drafts, original requests, observations and pending action. **Reopen browser working record** accepts only its original workspace and origin, checks request hashes and preserves the prior local desk. It sends nothing. A different installation must retain its own identity and receive source collections/profiles through the explicit original receiving operations.

## Read and deliver complete outputs

The result contains the original request, native intent/source inventory, input copies, complete outputs, any retained failed-attempt diagnostics and result. PREPARED/RETAINING files remain downloadable individually. A complete preparation can be downloaded as one `.source-preparation.json` capsule.

Read output sections through the actual native paged view:

- Collection items show original filenames/hashes, full mappings, inclusion and notes.
- Profile libraries show original profiles and their full version histories.
- Collection inspections preserve exclusions, missing notes and SOURCE_REVIEW problems.
- For a reviewed item, open its actual statement sections and then complete posted, pending or excluded rows. Issues are a separate complete original section.
- Each page binds the same request and full output SHA, advancing by the actual returned population. A short page is not silently treated as the end.

Each original file download validates its complete byte count/SHA. **Download complete preparation** freezes the exact receipt, every listed member and the complete outgoing capsule hash. An intervening changed receipt is rejected rather than mixed into an export.

To use a prepared collection in the original interactive Bank workflow, download its exact `collection.json`, open **Local collections** and use that existing collection receiver. Select and review the original source through Bank statement intake before any financial action. This desk does not mark a parser result as a financial import or reconciliation.

## Reopen the delivered preparation

Use **Reopen a complete delivered preparation**. The browser verifies the exact capsule schema, original COMPLETE receipt, ordered whole-file inventory, every original byte count and SHA, request/intent/result consistency, complete input bindings and original source inventory. Its receiving view preserves the capsule's original workspace even when it differs from the current installed workspace; it never adopts that identity or dispatches work.

Choose any contained original, request or full report. JSON objects and complete array populations are available in the receiving viewer; individual originals are downloadable with their original names and bytes. Binary or large text originals are opened through their intended recipient application after full download. No embedded HTML or source script executes in this viewer.

The browser capsule viewer accepts complete files up to **256 MiB** and keeps its exact original contents. Larger capsules use the installed companion `source-preparation-capsule.py` for complete independent verification and extraction; they are not truncated or replaced with previews. Complete browser working-record export and reopen share one **256 MiB** limit, measured from the actual UTF-8 JSON, including all normal, conflict and prior-desk history. An oversized record remains intact in browser storage and no partial export is offered. Retained conflict records use the same receiving path. Imports acquire the local operation guard before reading, verify the unchanged current desk before adoption, and retain the prior complete desk. These UI limits do not change the native 192 MB file, 320 MB input and 768 MB output limits or the existing whole-accounting backup limits.

## Original equipped receiving continuation

This is an additive source edition for DFF77/RD12's existing Bank course, **SCF-BANK-CAMT053-SOURCE-DFF77-20261013**, under `operations/merchant-bank-camt053-receiving-dff77-20261013`. Preserve any actual admitted source edition, process, files and completed stages. Select this complete new UI/host source deliberately as a following edition; do not start a second issuer.

Use the already retained 22-file Bundesbank collection and full two-version profile history. Operate the eight source transformations through their original source/controller interfaces and the desk's exact user controls. Open the prepared collection and native reports, use meaningful mapping changes/review/application, recover an original interrupted reply if encountered, download the complete preparation and reopen its exact contained originals. Inspect wide/narrow pages and populated/empty/loading/error views. Include one real simultaneous-editor conflict using the same original draft rather than generating a new customer operation.

Actual source parsing and code review do not establish rendered receiving. The producing peer must look at the real screenshots/screens and open the outgoing attachments, then repair concrete issues in this same source. Record only actually operated results. No additional account, source recapture, financial run or native execution is implied by this source delivery.

## Repository receiving instructions

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
