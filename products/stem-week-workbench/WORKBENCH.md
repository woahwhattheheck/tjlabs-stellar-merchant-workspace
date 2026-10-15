# Stem Week Workbench

## Receive an actual week

1. Choose a real Monday week with the grower. A completed growing-season week is useful when the advertised season has ended. Keep the accepted order system authoritative.
2. Import all four original CSVs: varieties, supply, recipes and commitments. UTF-8 file receiving is strict, and the original BOM and line endings are retained. Textarea display may normalize newlines visually, but the original imported text stays untouched until that text field is deliberately edited.
3. Name the source edition and record useful context, including undated membership balances or uncertain calendar assumptions. Create the immutable source edition. The four files validate together; invalid drafts stay available for correction and full-workspace export.
4. Select an edition, its real week and exactly one basis: projected or actual. The header explicitly shows known shortage and the count of varieties whose selected supply is incomplete.
5. Inspect the variety table and the selected target’s original supply rows and origin totals. Missing actual observations are not zero. A literal zero means the grower actually counted zero. Own-grown and received buy-in sources remain distinct.
6. Export the reconciliation, priority-ordered harvest/packing pull and CSA commitment sheet. Tentative scenarios and cancelled orders remain visible in the full plan but do not consume firm supply. CSA rows retain their status explicitly.
7. Select a variety or commitment, enter a grower/reviewer, action, reason and actual reference, and retain the decision. An optional quantity must be a canonical nonnegative integer; its interpretation follows the selected target. Keep human context in the reason/evidence field.
8. Use the correction selector to revise the same decision; prior revisions stay in the history. A changed week, source edition, supply basis or target has its own draft and decision context.
9. When sources change, copy selected originals into a new draft, edit the changed table and create a new edition. A buy-in intention alone does not increase stock; a substitution note alone does not rewrite a recipe.
10. Save and download the complete workspace. Open it independently and confirm the selected source, quantities and review context before resuming later.


## The authored example

The original actual view has 56 firm stems of demand, 39 known actual stems, 19 known shortages, five separate surplus stems and one variety with missing actual observations. Rose supply is 30 own-grown plus four local bought-in; rose demand is 40. Zinnia actual is explicitly zero against 13 required. Basil has three required but no actual observation. Five dahlias are surplus; a tentative wholesale request does not consume them.

The example records an initial six-rose buy-in note and its correction to hold while checking a later cut. That note does not change quantities. The corrected source edition records later actual supply and produces 67 actual stems, zero shortage and 11 surplus, with all counts complete. The original decision remains in the original edition’s history. Every number in this example is authored, and no researched farm supplied those figures.


## Browser recovery

The weekly workbench uses IndexedDB transactions. Each save retains an independent complete proposal; the head advances only if it still matches the opened head. Opening another workspace retains the dirty current body first. If storage fails, keep the current workspace, download its full JSON, confirm the file is saved and retry adoption. Invalid incoming source or selection is rejected before replacement. Full JSON includes original source, every edition and decision, current selection and unfinished source/decision drafts. Ordinary reports contain the complete core workspace and originals; unfinished forms are retained in full desk JSON.

Native --workspace accepts full desk JSON directly. It retains that exact once-read input as browser-input-workspace.json in the new package, preserving unfinished writing separately from the continued core result in workspace.json. CSV originals can be downloaded individually. New CLI output directories are exclusive and COMPLETE.json is written last.

## Continue with the same original sources

Use the full operating guide for field names and commands. Build with node build-workbench.mjs NEW_DIRECTORY; open both output apps directly. Run native receiving in a new directory. Keep the upstream MIT notice with redistributed source. Public examples contain authored production records; actual farm orders and inventory should stay in a private working directory.
