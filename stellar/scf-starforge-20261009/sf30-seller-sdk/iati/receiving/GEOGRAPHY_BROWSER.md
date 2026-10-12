# Complete native geography browser receiving

This module is the browser leg of the original IATI geography receiving operation. The parent owns the original workspace, source preparation, server, complete native financial and geographic calculation, installed runtime and final customer package. This leg borrows that server and creates and closes only its own persistent Chromium context and typed-client handle.

Run the complete selected source. The application, typed client, geography engine, portable receiver, offline renderer, this module and this guide must come from the same composed product edition. The receiver writes an exact file identity inventory for those selected files.

## Parent invocation

The command takes one private absolute JSON path:

~~~sh
/ABS/EXISTING/node /ABS/SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/geography-browser.mjs /ABS/PRIVATE/browser-input.json
~~~

The exported function has the same input:

~~~javascript
import {runGeographyBrowserReceiving} from './geography-browser.mjs';
const result = await runGeographyBrowserReceiving(input);
~~~

Build the input from the actual native saved review and its complete original HTML export. In the parent Python workflow, the equivalent selection is:

~~~python
browser_input = {
    "sourceRoot": str(selected_source_root),
    "outputRoot": str(original_output_root / "browser"),
    "consoleUrl": original_console_url,
    "ownerWorkspace": str(original_workspace),
    "source": selected_publisher_sha256,
    "review": {
        "id": original_review["id"],
        "revision": original_review["revision"],
    },
    "offlineHtml": str(original_full_html),
    "expected": {
        key: original_review["report"]["counts"][key]
        for key in ("rows", "activities", "mapped")
    },
}
~~~

All filesystem values are absolute. Source and review identifiers are complete lowercase SHA-256 values. The selected source must be among the review's original sources. Expected counts come from the actual saved native report, with no sampling or estimated geography totals. The selected source needs at least one unreviewed native row for the one explicit receiving finding.

The console URL is the original private loopback URL with its complete authentication fragment. The parent writes it in its private input file; this module does not copy it into the public source inventory, progress, observations or final report. Keep that input private.

The offline HTML is the complete report for the input review and revision, before this browser leg adds its single finding. The parent should retain both that original report and the subsequent complete report downloaded from the new browser revision.

The parent keeps the same source root, workspace, output root, source, baseline review/revision and count selection on continuation. The private loopback server may restart on another port; the persistent native workspace identity and retained request still have to match. A different dataset or review is a separate explicitly selected operation.

## Existing browser runtime

The receiver inspects installed resources in the same namespace in which it will run. Optional SF30_PLAYWRIGHT_MODULE and SF30_CHROMIUM_EXECUTABLE select exact existing absolute module and executable paths for an equipped fleet host. An explicit override must resolve successfully; it is not silently replaced with another runtime. Without a module override, it tries the retained Playwright module at:

- /workspace/scratch/00697d85ae60/rea-runtime/node_modules/playwright-core/index.mjs
- the runtime-owned CODEX_PRIMARY_RUNTIME_NODE_MODULES/playwright/index.js
- /opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js

It then selects an existing executable from the supplied environment's PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, the original 705ebf headless-shell path, the selected Playwright module's configured executable, or the installed system Chromium paths. Selected module, executable and actual Node version are retained in selected-runtime.json.

No browser, Node package or Python dependency is installed or downloaded. Missing runtime resources return an actual error from this same invocation. The parent can supply the existing dependency cohort through its original environment and continue the original operation. Browser memory and writable profile/download space belong inside the parent's actual capacity admission; this module creates no scheduler, new worker or independent resource reservation.

The browser launches with a private output-root/browser-profile directory, at 1360 by 980 pixels initially, and uses disk-backed temporary resources rather than requiring additional shared-memory browser storage. That does not remove the need for actual RAM and disk headroom.

## Complete UI journey

The receiver first obtains the native persistent geography workspace identity and exact saved baseline review. It verifies the supplied rows, activities and mapped counts against that complete native report.

The actual browser then opens the original Geography application and the selected saved revision. It reads the location register, follows the returned next-page cursor and returns to the actual preceding page start. It loads every valid coordinate page, checks the full mapped count, zooms the original SVG coordinate map, fits the loaded extent and opens a source-bound record.

One original unreviewed row from the selected publisher becomes a named receiving note. The complete source, activity selection, language, portfolio, provenance, baseline and existing findings remain intact. The receiving note states what was received and makes no independent claim that the publisher's reported coordinates have been geographically validated.

The browser prepares one new reviewed edition. Before its original POST can be forwarded, the receiver retains the entire request body and workspace identity. It then forwards that exact native request once and retains the complete actual response. Only the browser's receipt of that response is withheld. This exercises a real completed save followed by a lost browser return; it does not fabricate a native response.

The browser reloads its original persistent profile and uses the application's retained-request continuation. The new geography request-lookup API must return the identical original request and historical review. The receiver checks that the review advanced exactly once. It does not generate another save request or replay a completed native mutation to demonstrate recovery.

The journey then:

- Opens the earlier historical revision and verifies that the save controls are disabled and its complete native view remains unchanged.
- Reopens the new revision, compares the complete original native editions and verifies zero added, removed or changed location rows with exactly one added analyst finding.
- Reads the native comparison page through the original browser control.
- Downloads the complete packet, GeoJSON, CSV, JSON and HTML exports through the actual UI. Every saved file must match its exact original native descriptor's size and SHA-256.
- Selects that same complete downloaded packet through the browser's native receiving form, then verifies that receiving it again preserves the complete original revision history.
- Captures desktop and 390-pixel mobile views, checks page-level mobile overflow, reloads the original workspace and verifies the same full saved review with no pending request.

The derived CSV receives the product's shared spreadsheet-neutralization transform. The original source XML, source fields and JSON remain unchanged. Native source and financial identities are checked by the parent's full receiving procedure; this browser leg does not distribute activity-level finance among locations.

## Offline report interaction

The receiver opens the parent's complete original HTML report using file:// within its owned browser context. It checks the complete embedded register, saved review/revision and original activity and mapped counts. It opens the complete original record and attribution, exercises the actual canvas map's zoom and fit controls, and edits the overall review status, reviewer and note.

It downloads one complete flat review-update request for the original review and expected revision. The full sources, source selection, portfolio, acquisition metadata, baseline and original findings must remain unchanged. The file is retained for the customer's original application; the receiver does not submit it as a second mutation.

If that download completed before progress publication failed, continuation reads and verifies the same already-saved file rather than generating another UUID. The original browser update remains a complete reusable request.

The offline page is observed for network attempts; any HTTP or HTTPS request is blocked, recorded and fails the offline receiving assertion. The page must run from its embedded source and original data. Desktop and mobile offline screenshots are retained.

## Same-operation recovery

selection.json binds the original resolved paths, source, baseline review/revision and actual native counts. progress.json points to complete original outputs, observations, downloads, screenshots, phases and the persistent native workspace identity.

browser-save-intent.json retains the complete intended definition before the UI save click. browser-save-request.json then retains the UI's actual full request and UUID atomically before the original review request is forwarded. If the parent ends after the UI saves its IndexedDB pending record but before route interception, the receiver can adopt that exact request only after the complete pending definition matches the previously retained intent. After interruption, the receiver reads the exact saved request and uses native geographyRequest(requestId). A recorded action must match the full original request and persistent workspace identity. A completed action returns the original saved review. An unrecorded request is placed back into the original browser pending-request store with the same UUID and full body and is continued through the original UI.

Before any pending-request retry, the receiver reads the actual full current IndexedDB record and checks its kind, key, persistent workspace, local request ID and complete input. A pending packet receive is accepted only under the already-retained browser-packet-intent.json, with the same review, full history and complete original packet; the actual IndexedDB Blob is hashed and checked before retry. An unrelated pending request in the profile is never dispatched or replaced. Unknown native outcomes require the original lookup and same request. A changed workspace identity or an input/body mismatch stops the continuation.

Numbered observations are published atomically. If an observation was complete before the progress pointer was saved, its complete original file is recovered and its sequence preserved. Binary packet requests are retained as exact full-file references when their observed bytes match the original downloaded packet; other exposed binary request bytes are retained in full. A browser that does not expose raw upload bytes is described explicitly rather than being reported as a measured wire-body observation.

Every download/response event promise has an immediate rejection observer, while its original later awaited error remains intact. A failed click or closing context therefore stays inside the owned error/cleanup lifetime.

Screenshots are written only after Playwright returns their full bytes. Completed downloads are size/hash checked before their final filename is published. Already-complete files are verified and reused. Partial local attempt files are not treated as completed observations.

completed-workflow.json is a complete candidate containing all actual UI results and original file descriptors. It is not the final success receipt. browser-cleanup.json is written only after the owned browser context and typed client have actually closed, and it is bound to the exact complete workflow file.

If the workflow is already complete but cleanup publication was interrupted, the complete UI work is not replayed. The receiver uses the original persistent Chromium profile to obtain and close an owned handle. An already-live profile remains with its existing owner; this helper does not kill unknown processes or bypass Chromium's profile ownership. The parent resolves any still-live original child through its original lifetime control.

A saved cleanup receipt permits final publication without opening another browser. A final result is reused only after all retained file sizes/hashes and its workflow-bound cleanup receipt are verified.

## Full output and receiving contract

The final result schema is stellar-forge.iati-geography-browser-receiving.v1. Its state is COMPLETE only after the full journey, full file verification and owned shutdown. It includes:

- The original selection and persistent workspace identity.
- The original baseline and exactly one new review revision.
- The actual retained request ID, original source identity and complete native counts.
- All five complete browser downloads and original native export descriptors.
- The full offline update file.
- Actual JavaScript errors, failed browser requests, complete numbered source observations and screenshot descriptors.
- The exact workflow and owned-cleanup file descriptors.
- files: an array of full absolute original descriptors with path, bytes and sha256.

The deliberately withheld browser save response appears among failed browser requests. It is part of the original request-recovery exercise. The accepted result still requires zero JavaScript page errors, exact native request reconciliation and no duplicate review revision.

The CLI prints a small result-path/review/file-count receipt and returns exit 0 only for COMPLETE. Errors return a nonzero status and retain the available original observations and continuation record. A missing browser, interrupted native server or filesystem failure is not reported as completed QA.

Keep browser-profile, the private input, authentication state and native account material under the parent's private custody. They are not customer source files. The parent can include the complete result.files list and the product source/guide identities in its original customer handover without copying the browser profile.

## Source status

This guide describes the complete executable receiving procedure. Source review and JavaScript parsing establish code readiness only. Actual browser completion is established by the original parent-owned invocation's COMPLETE result, measured file identities, retained native responses and screenshots.
