# Bank accountant receiving

This workbench opens the complete `account.tar` exported by an original retained Bank close. It presents the statement, bank transaction, posting, receipt, refund, allocation and customer-document records from that edition. Accountant notes are kept in a separate private review with a complete edition history.

The Bank operator exports a retained close from **Close statement → retained close → account.tar**, or uses the original Bank command:

```sh
starforge bank-statements file --directory /private/accounting --kind close --id ORIGINAL_CLOSE_UUID --name account.tar --out /private/bank-close.tar
```

Keep the original close identifier and the complete file. Several exports from one account can be received together to compare earlier closes and corrections.

## Open the workbench

In Bank reconciliation, choose **Accountant receiving**. The installed route is `/bank-statements/accountant-receiving/`. The same reader is available independently:

```sh
starforge bank-accountant serve --port 8458
```

Open the printed local address. The nested command `starforge bank-statements accountant` accepts the same commands. With a complete source checkout, use `node accountant-receiving/cli.mjs`.

The browser requires a current browser with IndexedDB, Web Crypto and JavaScript modules. Its private database is scoped to the browser profile and origin. A different server port, a different browser or a different computer has its own private review store. Export the complete review before changing computers, browser profiles or addresses. Browser storage can be removed by clearing site data; keep the exported review with the customer's private files.

The native command requires Node.js 22 or newer and the ordinary Linux `flock` utility. It uses a private directory and a kernel lease across each complete receiving, edit or export. The browser and offline reader need no external service.

## Receive an original close

Choose **Receive original files** and select one or more original Bank close TARs. Each original archive may be at most 128 MB; one selection and a complete saved review may be at most 384 MB. A review can retain up to 24 close archives within the same 384 MB complete-export limit. Each added archive and retained note edition is checked against the exact projected full TAR size before saving. Large archives need enough browser memory for their complete bytes.

Receiving checks the original ustar headers, regular-file names, padding and ending. The original Bank manifest must describe the exact complete file set; every named member's length and SHA-256 must match. The retained report, editable snapshot, account, original reviewed reconciliation, statement imports and nested customer archives must agree. Each nested customer manifest and its original documents are checked as part of that same operation.

The reader retains all original bytes. The original source parser's import, interpretation, currency precision and source-row identity are carried in the close. Decimal cash amounts use the original explicit currency scale and integer minor units. The reader verifies the retained posting and closing totals.

After receiving, the **Original close edition** selector opens a specific saved edition. Its archive digest distinguishes two exports even if their display names match. Receiving the same exact bytes again reuses that archive identity.

## Read the financial lineage

### Close

The opening, incoming, outgoing, closing and difference values are the original retained report. The same page shows the original operator, time, close identifier, accounting workspace, balance basis and prior close.

**Close history** exposes the related closes and reopenings included in this saved snapshot. Later accounting changes appear when their own original close is received.

### Transactions

Search by date, payee, reference, amount, status or original identifier. The table pages through the complete transaction set, including excluded, duplicate, superseded and deleted rows retained by the original exporter.

Choose **View lineage** to inspect:

- Original bank amount and any explicit account-currency valuation.
- Every original statement copy, source-row identity and saved interpretation.
- Posting parts, matched receipt or refund, accounting classification and match history.
- Receipt replacement lineage, refunds and original invoice allocations.
- Participating customer accounts and the original documents retained in those accounts.

The original receipt and refund records remain distinct. A receipt's gross amount, allocation history and later replacement are read from the native records; a net bank amount is not substituted for them.

### Sources and files

The original statement list shows its received name, format, byte count and source digest. **Download** returns the unchanged original file. **Read source** displays a text preview; the preview is limited to 500,000 bytes and may require the original file's encoding reader.

The complete close file table includes reconciliation JSON and HTML, transaction and posting CSVs, the editable snapshot, original statements, receipt-intake documents, nested customer TARs and the original manifest. Downloaded HTML remains a file. Original source text is displayed as text.

### Customer accounts

Open a customer to inspect the original account date, invoices, receipts, allocations, credits, refunds and credit dispositions. Download the original customer account TAR or individual retained documents. The file table preserves the original document names and full bytes.

The customer snapshot uses the close's original account date. It is a historical account export; later customer activity belongs to a later original source.

## Compare close editions

Open the later selection, then choose **Compare closes** and select the earlier selection. Both must come from the same original workspace, bank account, source identity and currency.

The comparison distinguishes two editions of the same period from different periods. It shows exact balance changes and additions, removals or changes to transactions, posting parts, receipts, refunds, allocations and source imports. Expand a change to read both original records. Download the complete comparison JSON when handing findings back to the Bank operator.

A different-period comparison includes actual period differences. Use the original period labels when describing its result.

## Keep an accountant review

Choose **Add review note** on a close, transaction, posting part, statement source or customer. Each note binds the original archive, close, record identifier and source digest.

Enter the reviewer name, status, note and an edition summary. Available statuses are:

| Status | Meaning in this private review |
| --- | --- |
| Open | A retained review item awaits further work. |
| Question | A source-bound question is recorded for follow-up. |
| Examined | The reviewer has recorded their examination. |
| Resolved | The reviewer has recorded the resolution. |

These are accountant review labels. They do not change bank posting states, invoice balances or the underlying financial workspace.

Draft edits are saved in this browser as you type. Retain or discard the current draft before opening another record for editing. **Retain review edition** saves the complete note set with the reviewer, timestamp, summary and digest. **Remove note in a new edition** removes it from the current note set while preserving earlier editions.

The **Review edition** selector opens all earlier retained note sets. **Edit current note** always edits the latest review, even when an older edition is on screen. Two tabs cannot silently replace one another's saved review: if the private desk advanced, the attempted save stops and the typed draft remains available. Choose **Reopen saved review** to receive the current saved desk before applying the draft. Draft requests are stored separately: one tab's successful edit clears only its own acknowledged draft. Reopening keeps the current tab's typed draft. After a page reload, its retained draft is reopened as a separate copy; **Other saved drafts** lets you recover or explicitly discard earlier copies.

Notes should name the original source and the action requested from the original Bank operator. The operator performs any financial correction in the accounting workspace and returns its new retained close for comparison.

## Export and cold receive

Choose **Download complete review**. Its TAR contains:

- `review.json`, including all retained review editions.
- Every unchanged original Bank close TAR named by its complete digest.
- A manifest with the exact review file and original-archive lengths and hashes.

The review's nested original Bank archives retain all statement files and customer documents. This legacy review TAR contains committed review history. Use **Download working** or **Download populated reader** to preserve all unfinished drafts without turning them into review editions.

On a different browser or computer, open the reader and select the saved review TAR through **Receive original files**. The entire source and review history are checked before they enter the local desk.

An already received review is reused. A later compatible edition advances its original review. If two computers have different edits, the browser offers **Receive parallel review**. This keeps both complete histories under separate private desk identities. The original received review identity and bundle digest remain recorded. A repeated import of that same parallel bundle opens the already retained branch.

## Native private review

Create a private review from the actual original close:

```sh
starforge bank-accountant create --directory /private/october-accountant-review --name "October close review" --archive /private/october-close.tar
starforge bank-accountant add --directory /private/october-accountant-review --archive /private/october-corrected-close.tar
starforge bank-accountant show --directory /private/october-accountant-review
```

The private directory retains exact archives under their SHA-256 names, `review.json`, all immutable note editions, original edit requests and the receiving lock. Receiving and publication use complete temporary files, file synchronization and an atomic final publication.

Inspect and compare directly without creating a review:

```sh
starforge bank-accountant inspect --archive /private/october-close.tar --out /private/october-summary.json
starforge bank-accountant compare --before /private/october-close.tar --after /private/october-corrected-close.tar --out /private/october-comparison.json
```

Add a source-bound note:

```sh
starforge bank-accountant note --directory /private/october-accountant-review --archive ORIGINAL_ARCHIVE_SHA256 --kind TRANSACTION --id ORIGINAL_TRANSACTION_UUID --status QUESTION --note-file /private/accountant-note.txt --actor "Accountant name" --summary "Question about original source" --request ORIGINAL_EDIT_REQUEST_UUID
```

Use `CLOSE`, `TRANSACTION`, `POSTING`, `SOURCE` or `CUSTOMER` as the kind. The posting identifier is the original match identifier followed by its zero-based part index, as shown by the reader. A source identifier is its original statement import UUID. Keep the same request UUID and unchanged values when recovering an uncertain edit. An optional `--parent` binds the expected original review edition.

Export and receive the complete review:

```sh
starforge bank-accountant export --directory /private/october-accountant-review --out /private/october-accountant-review.tar
starforge bank-accountant receive --bundle /private/october-accountant-review.tar --directory /private/reopened-accountant-review
```

An existing compatible native review can receive a later edition. A divergent review is received into a new private directory so its original edits remain available. Existing output files are reused only when their bytes match; otherwise choose a new output path.

## Complete offline handover

```sh
starforge bank-accountant prepare --directory /private/october-accountant-review --out /private/october-accountant-handover
```

The handover contains a self-contained `reader.html`, the complete `review.tar`, full browser and native source, this operating guide, opening instructions and a file manifest. Open `reader.html` directly: the complete selected working review is already embedded. The adjacent `working.tar` is the same full working source; `review.tar` remains available for the original committed-review receiving flow. A browser that restricts file-origin storage can use the included native `serve` command at a stable local address.

The handover file manifest binds the exact original review edition. Use a new handover directory for a later review so earlier delivered packages remain intact.

## Selected source installation

The source-owned `bank-accountant-receiving` selection carries this complete product, its browser routes, types, operating guide and manual receiving course. From a checkout that already has the selected commit's Git objects:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs --repo /absolute/merchant-checkout --ref FULL_SOURCE_COMMIT --selection bank-accountant-receiving --out /absolute/private/accountant-package --offline
```

The maintained builder returns the actual package path and original source manifest. Reuse that output with `--resume` for the same source selection if the original build is interrupted. The resulting package registers `starforge bank-accountant`; its source remains under the package's original `source/stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/accountant-receiving/` path.

A complete Bank distribution also mounts the same reader inside the original Bank HTTP boundary. The accountant receiving selection can be built independently because its local review and archive reader use Node/browser built-ins.

## Manual whole receiving course

The source includes `EXERCISE.mjs`, a manually invoked complete receiving course. It consumes actual exported original close TARs; it does not create or mutate an accounting ledger.

```sh
node accountant-receiving/EXERCISE.mjs --source /absolute/accountant-receiving --operation /absolute/private/accountant-receiving-case --archive /absolute/original-close.tar --archive /absolute/original-later-close.tar --chromium /absolute/existing/chromium --playwright-root /absolute/node_modules
```

The selected original archives, source digests and case identifier are retained in that one operating directory. The course exercises source inspection, compatible close comparison, private native review, complete export and cold receiving, the actual desktop and phone browser controls, saved browser review, original file downloads and the standalone handover. Reuse the same directory to continue its retained operation. It is independent of the default test suite and hosted CI.


## Complete unfinished working handover

The Accountant receiving desk now retains a complete working copy separately from the original committed review. A working copy contains every unchanged close TAR, every retained review edition, all unfinished note requests, the active note, selected close/transaction/customer, current tab, transaction search and page, comparison close, historical edition, and original CAMT page-entry filter and page. Working files from the preceding eight-field view reopen with the all-page/first-page defaults without altering their original input bytes. Blank reviewer names, unfinished statuses and literal whitespace remain unfinished fields. Downloading never applies a note or posts money.

**Download working** exports a standard TAR. **Download populated reader** exports a self-contained HTML with that same complete working content and the full running source. Open the actual downloaded HTML directly; no second input selection is needed. Its original review, draft and selected view reopen together. The source remains inspectable in `source-<sha256>.json` members of the working TAR. The current running edition and all earlier received source editions remain distinct.

Browser working copies use an IndexedDB transaction with a generation comparison. Another tab cannot silently overwrite a working head. A conflicting write retains its entire attempted working snapshot and source/archive bindings in the same IndexedDB transaction, leaves visible fields untouched, and pauses further automatic saving. The working selector exposes each retained conflicting draft. Opening one creates a separate working copy while its exact received bytes remain available through Original working files. A storage quota or unavailable database can still prevent durable retention; the visible copy and export remain available. Download them immediately if needed, then choose **Save visible work as another copy** to preserve the losing draft under a separate working identity. The other tab's copy is unchanged. Reopening another desk remains blocked until the current visible copy is safely saved. If storage remains unavailable, full working TAR/HTML downloads continue from memory; **Download draft fields** is a smaller rescue containing the current review and all visible draft fields, but it does not replace the original close files or constitute a complete source handover.

A working file never silently replaces its committed private review. If that original review ID has a different saved history, both histories remain available. Choose **Keep as a parallel private review** to retain a separately named private review before applying its note; this does not change financial records. Selecting an already received working file opens its existing local copy including later local work. Normal browser reload follows that tab's selected working identity. A populated HTML reopens its embedded original input or its already retained later local copy.

Each received working input retains its original name, complete hash and a flat snapshot of its contents. **Accountant review → Original working files → Original file** reconstructs the exact original bytes and verifies their original length/hash before downloading. Shared original close/source members are retained once; incoming histories refer to earlier snapshots rather than recursively embedding old TARs. A differently repackaged TAR is rejected instead of being claimed as the original working export.

Limits are explicit: 24 original close archives per review, 128 MB per close, 384 MB per complete working TAR, 1,000 unfinished drafts, 1,000 received input snapshots, and 64 full source editions. Each source edition includes the complete 13 named source members. Populated HTML is bounded at 530 MB because it also embeds base64 working bytes; large files may remain more practical through the installed reader. Prospective working size is checked before saving. At capacity, keep the visible fields with the rescue download and use another private review for additional closes; nothing is truncated automatically.

### Original CAMT page coverage

When the original retained close uses `CAMT_PAGE_ASSEMBLY`, **Close → Original CAMT page coverage** displays its actual complete assembly: selected source files and page numbers, page/statement scope, periods, first opening and last closing, page-to-page balance continuity, reported-versus-calculated summary checks, duplicates/gaps/issues and all booked/pending entry counts. Every entry keeps its original import and source-row identity and its link to a retained transaction where one exists. Page filters and pagination affect the view only; **Download complete page assembly** retains the whole original assembly. Expand the original source records to investigate a disagreement. The desk uses the original reviewed assembly and exact source file hashes; it does not recompute a close or infer a missing page.

### Native custody and populated handover

```sh
starforge bank-accountant working-inspect --bundle /private/accountant-working.tar --out /private/working-summary.json
starforge bank-accountant working-receive --directory /private/accountant-working-custody --bundle /private/accountant-working.tar
starforge bank-accountant working-export --directory /private/accountant-working-custody --out /private/reopened-working.tar
starforge bank-accountant prepare-working --directory /private/accountant-working-custody --out /private/working-handover
```

These commands use the original private-directory lock. `working-files/<sha256>.tar` retains exact immutable received inputs; `working-current.json` selects one verified input. Receiving another file preserves every earlier original. It does not advance `review.json` or execute any financial action. `prepare-working` includes populated HTML, working and committed-review TARs, every complete source member, opening guidance and an exact file manifest. The original `prepare` command now produces the same populated handover from its current committed native review, with no invented unfinished drafts.

The generated `working-source.json` is built from the complete installed source selection and is served through both the standalone and original Bank routes. When maintaining this product, regenerate it after changing any of its 13 members. The source bank omits only itself to avoid recursive content. Source-project exports remain complete because the generated bank is reproducible from all original member bodies.

### Continue the original receiving course

The existing DFF77/RD12 course and original operation remain authoritative. `EXERCISE.mjs` now includes a complete unfinished working download, original native custody/export, literal replacement characters and Unicode, direct populated HTML opening/reload, and desktop/390px screenshot capture. It still consumes actual original close TARs. Preserve an earlier case's immutable source selection and coordinate its explicit source continuation with that original receiver; never edit an old intent to make a new source appear to have run. No new native operation is implied by publishing this source. The exact outgoing screens and every saved attachment must actually be opened and viewed under the owner instruction below; source checks or screenshot creation alone are not product acceptance.

## Current repository delivery instruction (complete original text)

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
