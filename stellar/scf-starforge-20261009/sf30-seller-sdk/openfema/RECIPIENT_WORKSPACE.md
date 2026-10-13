# Complete recipient workspace

The project delivery ZIP includes a complete offline review workspace for the recipient. It opens the exact issued project register, preserves the original source and customer files, and produces a returned CSV for the existing native reconciliation. The same original workspace continues to own the source editions, target mapping, selected analyst decisions, merchant delivery and complete archive.

## Operate the complete delivery

1. In **Data integration**, select the reviewed mapping and complete portfolio version. When continuing a customer file, select its retained reconciliation as the customer base. Save the complete delivery and extract its ZIP.
2. Read `recipient-availability.json`, then open `recipient.html`. Its first view shows the full register, original delivery ID, source selection, reviewed destination schema and complete issued-file list.
3. Select a project by its disaster number and GM project ID. The source cells stay visible and read-only. Edit the analyst columns included in the mapping and any customer-owned columns, enter the receiving reviewer and reason, then record the prepared cells.
4. Save named editions as the review develops. Restore retains the preceding current edition. Raw unfinished cells remain separate from recorded decisions and travel in every complete JSON or standalone HTML download.
5. Download the returned CSV after completing the recorded analyst values. Return it to the original operator, who selects this exact delivery under **Receive customer CSV**, examines the original reconciliation and explicitly applies selected proposals to the current portfolio version.
6. Retain the complete editable project or standalone workspace for continuation. Import a downloaded JSON as a separate copy; source identities, full files, original history and saved editions travel with it.

A recipient can use the workspace without a server or network. Browser storage is convenient continuation, while the complete downloaded files carry the project between browsers and hosts. When browser storage fails or another window advances a copy, the current preparation stays visible. A complete rescue download preserves that exact preparation before the operator replaces it with another saved or imported copy.

## Editable and retained information

| Information | Recipient behavior |
| --- | --- |
| Disaster and GM project identity | Retained exactly for every issued row; native return joins both identities |
| Published source values and four financial measures | Read-only and retained with their original row/source bindings |
| Analyst status, disposition, priority, owner, due date and note | Editable when present in the reviewed mapping; native annotation rules apply before return |
| Columns whose mapped source is `null` | Editable customer-owned values; retained as customer data |
| Original customer-only or unlinked records | Kept in the complete original customer file and project; the returned CSV covers the exact issued project register |
| Unfinished or invalid typed decisions | Preserved in full JSON/HTML; an invalid recorded analyst proposal must be completed before returned CSV |
| Named editions | Complete snapshots bound to their original revision, reviewer and reason |
| Restored edition | Becomes current while retaining the previous current edition and the full before/after history |

The returned file keeps the issued target column order and every issued row, including excluded projects. It is a machine CSV: values are retained without spreadsheet-specific apostrophe insertion. The native receiver identifies source differences, duplicate identities, unlinked rows and analyst proposals using the original delivery contract.

Original file names remain metadata; browser download names are ordinary local basenames. The complete original name and original text remain in the recipient project.

## Files in the same native ZIP

All pre-existing native delivery members remain: target CSV, delivery manifest, mapping, mapping review, full portfolio, report, target schema, start guide, and any original customer CSV/reconciliation.

The recipient extension adds:

- `recipient.html`: the self-contained editor with the exact core factory, industrial layout and complete issued project.
- `recipient-project.json`: the initial complete editable working file.
- `RECIPIENT_README.txt`: the concrete review, return and continuation workflow.
- `recipient-availability.json`: original delivery ID, declared capacity and actual availability.

The original native `delivery.export` action, retained operation ID, result and archive remain authoritative. Repeating a completed old export returns its original retained archive. A subsequent useful delivery action includes the recipient workspace.

## Complete-file capacity

The recipient model receives complete UTF-8 CSV up to 16 MiB, 250,000 rows and the original CSV parser's 2,000 header columns; the reviewed mapping contains at most 200 columns. The complete project and its own integrity envelope are limited to 128 MiB. The outer working file is compact JSON and supports up to 512 MiB, including escaped inner project text and up to 128 MiB of raw preparation.

When an otherwise valid native delivery exceeds only these declared recipient bounds, the original native ZIP still contains every existing complete member. Its availability state is `CAPACITY_EXCEEDED`, with the original delivery identity, exact observed sizes, limits and reason. Its receiving guide directs the operator through the existing complete CSV workflow. Mapping, original-file, row-identity and source-integrity errors remain explicit failures; they are not reclassified as capacity.

The core is the same exported `createRecipientCore()` factory in Node and in the offline HTML. It validates the original manifest text/hash, mapping/schema/row/CSV hashes, immutable source cells, all before/after history and each saved edition at its original revision. Complete export/import retains unfinished strings and validates the complete content digest. The supplied optional SHA256 function must return a synchronous lowercase digest; the default portable implementation requires no dependency or network.

## Installed source

`recipient-core.mjs` supplies the pure model/parser and `recipient.mjs` supplies the complete HTML and native ZIP entries. Both are reached from the original native `core.mjs` and declared in the existing OpenFEMA distribution contribution. This offline HTML needs no additional browser asset registration, server, account or remote script. Its content security policy allows only its embedded code and style and disables connections.

The original browser app, CLI, MCP tools, typed client and Applications provider all continue through the same native `delivery.export` and `delivery.reconcile` actions. No separate customer database, action queue or payment path is introduced.

## Whole original receiving course

Operate the exact original 195-project workspace received by the existing full exchange receiver. The original workspace UUID is `cd6abeaf-b23e-468d-a3a1-5a24fecef859`. Preserve its complete source, original request history and restored destination.

```sh
node /absolute/openfema/examples/recipient-receiving.mjs \
  --application /absolute/openfema \
  --workspace /absolute/original-received-workspace \
  --workspace-id cd6abeaf-b23e-468d-a3a1-5a24fecef859 \
  --out /absolute/owned-recipient-receiving \
  --playwright /absolute/playwright/index.js \
  --chromium /absolute/chromium
```

The course uses a single original native workspace and stable operation
`OPENFEMA-COMPLETE-RECIPIENT-WORKSPACE-22B7-20261013`. It receives the current reviewed mapping and portfolio, issues the complete native ZIP, verifies its full originals, runs the actual offline recipient controls, records one analyst review, saves an edition and preserves raw unfinished input. It closes and reopens the browser, imports the complete reviewed project as a separate copy, downloads and reopens the full standalone HTML, receives the actual returned CSV through the original native action, applies its selected proposal, reissues and compares the next complete delivery, and exports/restores the complete original workspace.

Every native request is retained before dispatch. An interrupted course uses the same original operation IDs and exact payloads. Each browser attempt has its own explicit output/profile directory, so an interrupted UI attempt remains distinguishable from a cold reopen within that attempt. The final full workspace archive is pinned before restoration and reused at the same destination after interruption. A completed course reuses its result only after every full output-file length and digest matches.

The course captures actual desktop, narrow, empty-search and receive-error screens and downloads every original attachment. The receiving operator must inspect those actual outputs and operate the complete final version before describing it as ready. Keep the existing native controller or caller's exclusive lease for the whole operation, including its child browser; do not launch a concurrent second course against this workspace.

## Original source exercise

The exact original 195-row delivery and customer file have been exercised through the pure source model: four analyst edits, named save, unfinished invalid note, full JSON reopen, return refusal, retained-edition restore and native reconciliation yielded 194 matched rows, one review change and zero source differences. The complete zero-row DR 4935 delivery also retains and returns its exact header-only CSV. Those are source-model results; the full native/browser course above records its actual execution separately.

## Rendered-product inspection — owner directive, 2026-10-13

**Applies to every current and future peer, provider, local session and cloud worker.** Before calling a client/prospect-facing app, website, dashboard, demo, report, presentation or export ready, the producing peer must open, run or render the exact outgoing version, look at its actual rendered screen or real screenshots, and operate its important user controls. Capturing screenshots without viewing them is insufficient. Inspect the actual screenshare width and narrow/mobile width where relevant; inspect populated, empty, loading and error states, downloads, exports and reopening.

**All attachments are part of this rule.** Literally open, view, play and use the exact final HTML, PDF, report, slides, spreadsheet, map, image, video, audio, archive and project as the recipient would. Extract archives and open their actual contained deliverables and working project; inspect every applicable report/PDF page. Tests, checklists, source/schema inspection and screenshots merely captured are not substitutes. Fix observed defects within the authorized work and continue delivery.

**Final media must be seen and heard.** For videos, use available high-quality generative media and natural voice generation/TTS instead of robotic default voices. Watch and listen to the final export for pronunciation, pacing, timing and audio alignment. Preserve existing spending, voice and attribution controls. This instruction adds no review queue, restart, watcher or new release permission.

Owner clarification and complete canonical attachment: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949 (operation RENDERED-PRODUCT-POLICY-SWARM-20261013-01, original file F0C8RJVMF54). Carry these attachment and final-media clauses in the instructions actually consumed by delegated workers, alongside the complete standing rule below.

Fix ugly, broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized product work before presenting it. Code review, DOM counts, HTTP 200, unit checks and another peer's approval do not replace seeing the actual product. Use plain industrial design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve the real workflows, data and computation.

This inspection is part of delivery and leads directly to concrete repairs. It must not replace implementation and integration, become endless rechecking, create a peer-approval gate, launch broad suites or become a separate verification product. Continue useful authorized source and product work while the exact native/rendered receiving operation proceeds; preserve the actual execution state and existing operation identity.

Persist this rule in every active owner-controlled instruction surface that the provider and workers actually read: global/project AGENTS, CLAUDE, GEMINI and rules files, provider boot instructions, Commons source mirrors, cloud repository instruction copies, and current build/receiving guides. Include it in child assignments. Preserve other owner controls, historical evidence and third-party/vendor instructions. Do not force restarts, add watchers or restart owner-stopped work. Existing project-specific owner cutoffs remain in force.

Bryce's placement instruction: “that rule goes in every policy file the agents read not just a slack ping” and “and not just local sessions or ones from this provider”. Original coordination transport: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999 .


