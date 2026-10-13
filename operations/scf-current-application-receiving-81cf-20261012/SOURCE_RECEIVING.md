# Current source receiving through the original SCF controller

Operation: `SCF-GRANT-CURRENT-REVIEW-81CF-20261012`

Phase: `SCF-SUBMISSION-SOURCE-PACKAGE-A8CE-20261012`

This source continues the equipped owner's saved case through the existing PR854 native process controller. It supplies the complete current editor and browser dependencies, the source receiving and review comparison programme, the Python preparation branch and a local input composer.

## Select the existing local inputs

The equipped owner already holds the completed review case, its full reviewer source package and the original `receive-original-grant-review.py` controller. Keep those documents in that workspace. The local composer reads them directly, obtains the unchanged official transfer helper from the original controller, and writes a complete executable continuation in the same workspace.

The selected source package has 131 source records and four complete reviewer files. Its published source is `b412f1ea76bd3f243c2ef78eeb4360730b65ef80`. The complete package identity and the exact current reader HTML identity are in `source-assets-selection.json`; that manifest contains source metadata. All other 33 current source assets are supplied under `assets/`.

Use the actual existing local paths and saved case metadata:

```sh
python -B compose-current-source.py \
  --case /absolute/existing/SCF-Current-Application-and-Review.zip \
  --expected-case-sha256 ACTUAL_SELECTED_CASE_SHA256 \
  --source-package /absolute/existing/source-package.json \
  --reader-html /absolute/existing/current/grant.html \
  --original-controller /absolute/existing/receive-original-grant-review.py \
  --prepared-review /absolute/existing/following-application-review.json \
  --library-file-id ACTUAL_ORIGINAL_LIBRARY_ITEM \
  --library-file-version-id ACTUAL_SELECTED_FILE_VERSION \
  --library-version ACTUAL_SELECTED_VERSION_NUMBER \
  --expected-review-actions 135 \
  --output /absolute/existing/receiving-parent/current-source-runtime
```

The composer verifies the complete original source, source package and review binding; it parses the completed wrapper before writing it. Its output includes all eight native and browser runtime files, the full locally composed source input, the executable wrapper and `LOCAL-COMPOSITION.json`.

Prepare the transfer for the actual same saved case, then invoke the complete local wrapper:

```sh
python -B /absolute/existing/receiving-parent/current-source-runtime/receive-original-grant-source.py \
  --parent /absolute/existing/receiving-parent \
  < /absolute/private/original-case-transfer.json
```

The wrapper uses the original materializer and receiving writer. It selects the installed Node from the runtime or PATH; `--node /absolute/installed/node` can select its existing executable. It records and runs two sequential native phases, each with the original 256 MiB Node heap and one shared timeout. The original writer saves the complete ZIP back to the same item using the actual selected version guard.

## Complete source, prepared output and review

The first native phase opens the actual saved draft, browser binding and completed review. It preserves complete edited answer text and notes, receives current source into untouched answers, and retains every original version, source, field mapping, planning choice, prepared output and observation.

The original selected source stays in `source/`. Current source is composed in `source-editions/<selection>/source`, with its complete actual manifest. Runtime editions and prior attempt configuration are preserved in the same case.

The original exporter produces the complete submission and four-file source package, application, form map, prepared text and JSON, review page and individual fields. The existing review model compares the current prepared draft. Decisions with identical target and source bindings carry forward; changed targets reopen through the normal review lifecycle. All 135 preceding actions and original reviewed editions remain attached to the same review.

The local prepared-review input contains the original authors’ nineteen decisions and five request resolutions for this exact 131-source edition. The programme matches its complete application, companion and index to the selected source, applies each note to the current target through the existing review model, and records the supplied resolutions on the original requests. A preserved edited answer that differs from the reviewed text remains in the current review queue. The programme completes the original review when its actual readiness checks pass.

The second native process independently opens the full source package, draft and review, checks the complete authored history and saved bindings, opens the original prepared edition, and re-exports the full submission and review.

## Use the saved result

The case retains `receiving/source-package-continuation/`:

| Output | Use |
| --- | --- |
| `RESULT.json` | Actual completed source phase and current review status |
| `source-comparison.json` | Full prior, incoming and received answer text |
| `source-review-comparison.json` | Current targets and native carry/reopen choices |
| `draft.json` | Complete current submission for the original editor |
| `source-package.json` | All four reviewer files and their original source |
| `prepared.txt`, `prepared.json`, `review.html` | Complete outputs from the original exporter |
| `downloads/Current_Complete_Review.json` | Same review selecting the current draft |
| `downloads/Current_Review_Report.md` | Current review and full selected application text |
| `downloads/Independently_Received_Review.json` | Independent native review re-export |
| `downloads/Independently_Received_Submission.json` | Independent native draft re-export |
| `browser-receiving-input.json` | Exact selected source and binding for the existing browser journey |
| `current-authored-review-receiving.json` | Exact received decisions, resolutions and remaining authored differences |
| `native-process.json` | Original controller's current process and exit record |

The source result exposes the review model's actual status. Open the full target comparison and current review report to complete any reopened review work against that selected edition.

The current editor opens saved drafts and source packages while its automatic published-source read is pending. Its source button cancels that read. A later response preserves the selected saved record, authored draft and view.

Continue the browser journey with the case's existing server and browser: open the saved record during the pending read, receive the complete package through Source editions, save the same local record, inspect the full review, export, and reopen the current draft and review in another browser store. The receiving input supplies exact paths and original bindings.

## Resume the same retained attempt

The direct `receive_review.py` entry point accepts `--source-input` and `--expected-source-input-sha256` alongside its normal native arguments. Use the actual retained case hash, original Library item and current saved version. Keep the same local source input. It preserves the phase time, current review checkpoint and complete prior attempts; source-specific actions already present in the same review are reused.

The initial local wrapper is pinned to its selected case. After a partial result is saved, use the direct receiver with the saved partial case and its actual current version. Continue a subsequently selected draft before choosing another source phase if another operator has advanced that same review.

## Continue through the already running browser

The original equipped receiver can call `receiveCurrentSourceBrowser` from
`receive-current-source-browser.mjs` with its existing Playwright page. Keep the
current native case and source-selected listener open:

```js
const { receiveCurrentSourceBrowser } = await import(
  pathToFileURL(path.join(runtimeDirectory, 'receive-current-source-browser.mjs'))
);
const result = await receiveCurrentSourceBrowser(page, {
  inputPath: path.join(currentCase, 'receiving/source-package-continuation/browser-receiving-input.json'),
  outputDirectory: path.join(currentCase, 'receiving/source-package-continuation/browser'),
  expectedOrigin: new URL(existingListener.url).origin,
});
```

This is the following phase of the same receiving operation. The function uses
the page, browser and listener already owned by that receiver. It opens the
actual completed native draft, review, full source package and source manifest,
then checks that the listener is serving their selected current files. Reopening the
same saved case in another workspace remaps its retained local paths from the
actual browser-input file; source and document identities remain unchanged.

The browser opens a saved draft while its actual published-source response is
pending. It receives the late response, opens and exports the complete four-file
source package, saves the same local record through the original revision check,
exports all answers and reopens that record. When the original local record still
exists, its exact prior body and revision are checked before receiving the native
edition. Another browser store creates its own normal binding and retains the
origin separately.

The original review controls then save, export and reopen the entire current
review and its selected full draft. A second browser store independently opens,
saves, exports and reopens both documents. Each real working save adds its normal
saved version; the original review model compares those working versions and
confirms every reviewed target remains unchanged. The exact reviewed draft and
the later working versions are retained together.

Outputs live in the same case under
`receiving/source-package-continuation/browser/`: complete source-package,
application, submission and review downloads; both actual local records; the
reviewed-content comparison; and `RESULT.json`. The receiver's original archive
and version-guarded writer save this whole continuation back to the same case.
