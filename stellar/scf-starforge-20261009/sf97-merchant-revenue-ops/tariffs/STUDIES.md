# Named tariff studies

A tariff study keeps unfinished merchant pricing work in the original private workspace. Save partially entered band quantities, decimal prices, labels and monthly volumes before they are ready for calculation. Each study retains one original Pricing review; its payment-valuation editor may retain a different saved Pricing review from the later quote workflow.

The existing tariff calculator, completed plans, fixed-quote selection, scenario and Pricing writers, native amount review and retained seller release remain the operations behind this page.

## Work through a customer tariff

1. Open Tariffs from the original Pricing workspace, or use its existing standalone launch URL. Choose the merchant's saved review.
2. Give the study a useful name. Enter alternatives and quantities. **Save study** accepts raw unfinished values, including incomplete decimal text; **Calculate comparison** applies the existing tariff validation and exact arithmetic.
3. Reopen a named study from the sidebar. Its original source, raw tariff editor, payment valuations and retained requests return together. Refreshing the current source list preserves an older selected review even when it is outside the latest 100.
4. Calculate the comparison, save the completed tariff plan and review a quantity's uniform quote. Before a native plan, quote or price-decision save, the page saves the exact original request in the study. The original native operations then run with those same IDs.
5. After committing the quote into the original scenario and Pricing flow, choose its saved Pricing review in **Prepare native payment amounts**. Load payment options and enter explicit valuation inputs. Saving the study preserves selected and unselected rows, unfinished inputs, the source review and original payment amounts.
6. Open a saved study or choose **New study** to work on another alternative. The page first saves the current study. Choosing another Pricing source resolves that source before replacing the editor, then initializes a tariff from that source's routes and prices.
7. Use **Save as new study** to fork the current raw inputs and source under a new local identity. The original study and its history remain available.

A study name and a completed plan name are separate fields. A raw editor can contain newer work than its selected completed plan. **Download plan** and **Download comparison CSV** refer to the completed plan; calculate the changed inputs to produce their comparison.

## Reopening, concurrency and interrupted operations

Every native study revision is immutable. A save supplies the working-copy ID, exact expected revision and request UUID. Reusing the same request with the same document recovers the original revision. A concurrent change returns a conflict and keeps the editor intact: open the newer study or save the current inputs as a new study.

The study history opens an exact earlier revision. Saving over an earlier revision does not replace later history; fork it if another revision has already been published.

Browser recovery is scoped to the original workspace identity as well as its local origin. A storage failure appears beside the study controls. The raw editor remains available for a native save or download. **Recover earlier browser work** explicitly imports the preceding single-draft browser format after the original Pricing source can be read.

A lost response retains the exact working-save request. **Recover original study save** resends it. If the editor has newer inputs, recovery preserves those inputs and identifies them as unsaved, ready for the next revision. A known validation or revision rejection releases that rejected save body so current inputs can be corrected or forked.

Original plan, quote and native-price requests stay attached to the study until their original operation returns successfully. Use **Retained operations** to resume them. Switching studies first saves these pending bodies with the current study; it does not change their IDs or dispatch them automatically.

Study imports retain their exact create-only request while a response is uncertain. **Recover original import** receives that same identity. Successful receiving adds the study to the list and leaves the current editor in place.

## Receiving and complete workspace backup

| Action | Contents | Receiving use |
| --- | --- | --- |
| Export saved study | Exact selected immutable working revision and source binding | Receive as a new study after restoring matching original sources |
| Download raw inputs | Current raw editor, original source binding and pending native bodies | Receive unfinished work that has not yet become a study revision |
| Original complete workspace backup | Selected study histories, tariff plans and quote intent/result journals, scenario plans, Pricing reviews, native-price decisions and existing cost/performance records | Restore into a new private directory and continue the original studies |

The completed tariff portfolio remains available for its original selective receiving workflow.

Complete backup selects working histories and dependencies before the Pricing prefix. It requires every referenced original tariff plan and both tariff/payment Pricing sources. Tariff intent/result records are captured before the scenario/Pricing stores they refer to. Each selected file is checked against its captured bytes when written into the backup.

Restore admits the existing original files plus exact original UUID/hash paths under tariff-working, tariff-plans, tariff-plans/selections and tariff-plans/selection-results. The shared working store preserves the preceding scenario schema, directory layout, envelope bytes, hashes and recovery semantics. Tariff and scenario adapters have separate document schemas and source checks.

## CLI and HTTP client

Working-study commands need only the original private state directory. They read saved source reviews without a live operations source or current seller configuration:

~~~sh
node tariffs/cli.mjs working-list --state /absolute/private/pricing
node tariffs/cli.mjs working-save --state /absolute/private/pricing --input study-save.json --output saved-study.json
node tariffs/cli.mjs working-load --state /absolute/private/pricing --input selected-study.json --output opened-study.json
node tariffs/cli.mjs working-export --state /absolute/private/pricing --input selected-study.json --output tariff-study.json
node tariffs/cli.mjs working-import --state /absolute/private/pricing --input receive-study.json --output received-study.json
~~~

Outputs use a new exclusive path, synced before success is acknowledged. If output fails after an operation succeeds, the CLI error retains the complete operationResult. Reuse the original request UUID when recovering.

A selection contains workingCopyId and optional revision. Omit revision to open the latest. A save contains workingCopyId, expectedRevision (null for a new copy), requestId, version, optional original sourceBinding, and document. The full document is available from the browser raw export or working-load. Import contains package, a new local workingCopyId, and a stable requestId.

Authenticated HTTP uses GET /api/working and POST /api/working/load, /save, /export and /import. The integrated operator uses the existing /api/tariffs prefix and authorization. The typed client exposes workingList, workingLoad, workingSave, workingExport and workingImport with complete document and envelope types.

## Original customer receiving course

Continue the existing saved SF97 merchant operation on the installed source:

- Save an incomplete band/price, raw volumes and selected original source; reopen the study and an earlier revision.
- Switch between two real saved reviews with different routes. Confirm the new study uses its selected source while the previous study reopens unchanged.
- Retain a completed plan, reopen the browser and verify its original downloads and quote continuation alongside newer raw inputs.
- Save unfinished payment valuations, reopen and continue the original quote/native-price workflow with the same request IDs.
- Receive a selected study; restore the complete workspace backup into a new private directory and reopen its history, original plan and pending continuation.
- Operate the exact sidebar, recovery, export/import and comparison controls at desktop and narrow widths. Return actual rendered frames for source-producer inspection before presenting the customer handover.

Use the original case, source files and operator receiving thread.
