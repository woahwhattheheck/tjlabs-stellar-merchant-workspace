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

Before the original working save, the receiver retains
`working-save-intent.json`: the full native record, original revision, selected
source and actual browser origin. After a response loss or process interruption,
the same command reads that record again. An unchanged preimage may use the
original UI save. An exact next revision is accepted only when its complete
body is the selected model's normal `retainVersion` result with the actual
recorded saved-version timestamp. A different or later edit remains untouched.
The accepted record is retained in `working-save-accepted.json` and
`saved-submission-record.json` before the remaining exports; recovery does not
click Save again for that committed result. Keep this directory with its
original browser profile. A missing record is not permission to create another
binding for an already issued save.

A complete browser result replays locally after checking every retained output
byte and its source selection. It does not repeat browser writes.

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


## Receive a later complete publisher edition

Continue the original case with the current publisher's full source carrier and
four-file reviewer package. The original 131-source directory and its complete
review remain in the archive. Each later receiving directory is derived from
the selected source plus the complete preceding draft, review and browser
binding, so later work does not replace an earlier edition.

Materialize the exact new source locally with the publisher's actual hashes and
commits. The source carrier uses the existing complete `files` entries:
`path`, `content`, `bytes`, `sha256` and `git_blob`. Text members keep the existing
`encoding: "utf-8"` (or omitted) representation. A binary declared browser asset,
such as the original complete FRED example ZIP, uses `encoding: "base64"` with
canonical padded base64 in `content`. Byte counts, SHA-256 and Git identities
always describe the decoded file. The source preparation, original composer and
original case receiver all carry those exact decoded bytes; the source-selection
manifest and later edition identity retain the same complete file metadata.
Keep the four reviewer source objects as their original UTF-8 files.

~~~sh
python -B prepare-source-selection.py \
  --source-packet /absolute/existing/current-publisher-source.json \
  --source-packet-sha256 ACTUAL_FULL_SOURCE_CARRIER_SHA256 \
  --source-package /absolute/existing/current-reviewer-source-package.json \
  --source-package-sha256 ACTUAL_FULL_REVIEWER_PACKAGE_SHA256 \
  --original-source-commit ACTUAL_ORIGINAL_CASE_SOURCE_COMMIT \
  --runtime-source-commit ACTUAL_SELECTED_RUNTIME_COMMIT \
  --application-source-commit ACTUAL_SELECTED_APPLICATION_COMMIT \
  --output /absolute/existing/receiving-parent/following-publisher-selection
~~~

The command verifies and materializes every complete source member, verifies all
four reviewer objects and their source IDs, and requires the four selected
reviewer files to match the same full publisher source. Its result supplies
`source-selection.json`, the complete `source/` directory, the original source
package and the reader HTML path.

Compose the following operation from the actual current saved ZIP and its
existing preceding source directory:

~~~sh
python -B compose-current-source.py \
  --case /absolute/existing/SCF-Current-Application-and-Review.zip \
  --expected-case-sha256 ACTUAL_CURRENT_CASE_SHA256 \
  --selection /absolute/existing/receiving-parent/following-publisher-selection/source-selection.json \
  --source-root /absolute/existing/receiving-parent/following-publisher-selection/source \
  --source-package /absolute/existing/receiving-parent/following-publisher-selection/source-package.json \
  --reader-html /absolute/existing/receiving-parent/following-publisher-selection/source/stellar-forge/developer-site/dist/grant.html \
  --previous-source-directory receiving/source-package-continuation \
  --original-controller /absolute/existing/receive-original-grant-review.py \
  --library-file-id ACTUAL_ORIGINAL_LIBRARY_ITEM \
  --library-file-version-id ACTUAL_CURRENT_FILE_VERSION \
  --library-version ACTUAL_CURRENT_VERSION_NUMBER \
  --output /absolute/existing/receiving-parent/following-source-runtime
~~~

For further editions, use the preceding result's `receivingDirectory`.
The actual preceding event count is derived from the complete review in that
selected ZIP; `--expected-review-actions` can also pin it explicitly.
A following edition receives a new prepared review only when
`--prepared-review` selects the authors' full review of that exact source.

The composer uses a completed retained browser save when available. It opens the
whole working draft, current local record and matching review. Normal later
working versions and authored changes remain in that draft. The original review
model compares them with the retained reviewed edition before it receives the
new source.

A completed native source phase can also continue before its browser journey
has started. A retained partial browser directory, including a legacy interrupted
run without an explicit save journal, must first complete that same browser
phase. The composer never treats an unresolved browser save as an absent one.
Its full current draft remains distinct from the original browser record.
The following native record carries that origin separately; the later browser
journey still checks the actual saved browser record before updating it.

Invoke the produced wrapper through the same local command and original transfer
input described above. The new result and all downloads live under
`receiving/source-package-editions/<receiving identity>/`. The original source,
native results, browser records, review events, source-specific judgments and
prior receiving directories stay in the same archive. Reopened review targets
use the existing original review controls.

Use the new directory's `browser-receiving-input.json` with
`receiveCurrentSourceBrowser` and the existing page/listener. Its portable path
mapping handles both the original directory and subsequent nested editions.
The same original archive writer saves the complete case using its selected
current version.

## Complete native and browser receiving in one command

The original receiver also accepts `--source-browser` with its existing native
source input. Select the installed Playwright directory and Chromium executable:

~~~sh
python -B receive_review.py \
  --engine native \
  --source-input /absolute/existing/complete-current-source-input.json \
  --expected-source-input-sha256 ACTUAL_SELECTED_INPUT_SHA256 \
  --case /absolute/existing/SCF-Current-Application-and-Review.zip \
  --expected-case-sha256 ACTUAL_CURRENT_CASE_SHA256 \
  --parent /absolute/existing/receiving-parent \
  --node /absolute/existing/node \
  --source-browser \
  --node-modules /absolute/existing/node_modules \
  --chromium /absolute/existing/chrome-headless-shell \
  --replace-library-file-id ACTUAL_ORIGINAL_LIBRARY_ITEM \
  --expected-library-version ACTUAL_CURRENT_VERSION_NUMBER \
  --timeout-seconds 1800
~~~

The composed `receive-original-grant-source.py` wrapper accepts the same
`--source-browser`, `--node-modules` and `--chromium` options alongside its
normal local arguments and original transfer input. Compose it with the full
current runtime first. Omitting the flag preserves native-only behavior.

The command first completes the two existing native source phases. Its browser
continuation then starts the selected maintained reader through the same native
process controller, calls `receiveCurrentSourceBrowser`, and completes the
original editor save, source-package export, answers export, review and second
browser-store receiving. Both phases share the selected execution allowance.
The original archive writer saves the complete case once, after these stages.
`nativeSourceState` reports the model result; the overall state is complete only
when the requested browser continuation also completes.

The browser directory retains its original local origin and complete IndexedDB
storage snapshot. Checkpoints surround the original working save, the original
review save and completed stages. A review-save intent records the prior local
IDs; a resumed run reopens the accepted exact review record or reconciles its
single complete saved effect before it can issue another save-copy. Older
retained saved-review records are adopted only when the actual local binding
still matches. The browser snapshot is saved before either acceptance receipt.
The original receipt comparison preserves any later or different local work.

Browser process IDs, host/boot/namespace/start identity and cleanup remain with
the maintained controller. The continuation closes its own Chromium and listener,
and keeps prior process observations in the same case's attempt history.
Before assembling either a complete or partial archive, the caller requires
the original controller to confirm cleanup of every launched native and browser
phase. If any writer's exit is unconfirmed, it returns incomplete with
`archiveState: WAITING_FOR_OWNED_PROCESS_EXIT`, the retained operation directory
and the exact pending phase identities. The equipped owner resumes that
original operation; the command leaves the current saved case intact. The same
check protects the original application and review-continuation receivers. The
composed wrapper reports this retained operation directly, including its exact
pending phases, without expecting an archive that has deliberately not been made.

Use the resulting case's actual current version for a continuation. Its
`browser/RESULT.json`, complete downloads, saved records, browser storage and
both native process records remain together. The selected reviewer source,
original draft and review identities, every previous source edition and all
prior archive members retain their existing history.
