# Recurring catalogue browser continuation

This companion continues the existing installed customer operation after
runDcatRecurringCatalog has retained its actual publisher acquisition,
following-edition review and complete archive. It uses the installed
application, its authenticated loopback listener, the existing Playwright
library and the selected native Chromium executable.

## Owned lifecycle

The existing customer controller remains the sole owner of project leases,
server start/stop, source/runtime selection, publisher acquisition and archive
receiving. This module exports runDcatRecurringBrowser and starts no publisher
download, second server, scheduler or competing customer process.

Call full mode against the original saved project after the domain programme
has closed its lease and the original server is running. Pass its actual
private startup URL directly in-process. The listener's directory, creation
identity, origin, instance and saved source are verified. The URL and token
are redacted from saved failure text.

~~~js
const { runDcatRecurringBrowser } =
  await import('./browser-recurring-catalog.mjs');

const browser = await runDcatRecurringBrowser({
  url: startup.url,
  sourceRoot: installedSourceRoot,
  projectDirectory: startup.directory,
  projectCreatedAt: startup.projectCreatedAt,
  outputDirectory: absolutePrivateBrowserOutput,
  receivingResult: actualRecurringResult,
  mode: 'full',
  playwrightModule: existingPlaywrightModule,
  chromiumPath: existingHeadlessExecutable,
});
~~~

An existing Playwright library may be passed as playwright, or a browser
context as browserContext. The function creates a separate page and closes
that page. It closes only contexts and browsers it created. The controller
preserves the complete output directory through its original artifact
delivery.

The sourceId, catalogue and preceding review come from the actual
runDcatRecurringCatalog result. The baseline defaults to result.baseline and
its selectedMappingIndexes. Optional baselineReleaseId, reuseMappingIndexes,
candidateId and normalizeV3 explicitly choose the browser review. Their exact
saved IDs and accepted hashes are checked against the live original project.
Mapping indexes remain zero-based original accepted-report indexes.

An uploaded candidate can be selected together with accepted mapping
decisions. The browser retains that candidate's exact SHA-256 and checks the
result against its unchanged bytes. Typed identifiers, complete report
values and source bytes use the installed original exact JSON codec.

## Full continuation

The browser inspects the complete source configuration, unique versions and
selection history; traverses every acquisition page; searches each saved
attempt by UUID; and downloads each available original HTTP receipt and
response with its retained byte count and SHA-256. Failed or incomplete
attempts keep their original status, error and body.

It opens the actual saved following-edition review, downloads its original,
candidate, comparison and full report where available, and traverses all
validation and record-change pages using the original browser receiving
readers. Desktop and 390px screenshots retain the actual layout.

For a successfully checked complete catalogue, full mode selects the accepted
baseline, inspects every exact typed mapping row, checks only the requested
indexes, and submits one source-edition review through the actual browser
controls. It binds source configuration, latest catalogue and both accepted
baseline hashes. A publisher failure without a newly checked complete
catalogue leaves that preparation deferred while the retained error/history
and workspace handover remain available.

The browser's source-review operation preserves the active release. The
preceding original domain programme owns its actual cutover and restoration
rehearsal. Full browser mode exports a new complete workspace after its new
review has been saved.

## Receive the post-browser archive

Use browser.workspaceArchive.file and browser.workspaceArchive.sha256 for
the following receive. This is the complete archive created after the browser
review. The earlier domain archive precedes that new saved review.

Close the original server through its existing lifecycle, receive this archive
with the original receiveCkanWorkspaceArchive or dcat receive operation into
the selected new private project, then start the original installed or managed
application for that received project. Pass its new authenticated startup URL:

~~~js
const reopened = await runDcatRecurringBrowser({
  url: receivedStartup.url,
  sourceRoot: installedSourceRoot,
  projectDirectory: receivedStartup.directory,
  projectCreatedAt: receivedStartup.projectCreatedAt,
  outputDirectory: absolutePrivateReopenOutput,
  receivingResult: actualRecurringResult,
  expectedBrowserResult: browser,
  mode: 'reopen',
  playwrightModule: existingPlaywrightModule,
  chromiumPath: existingHeadlessExecutable,
});
~~~

Reopen verifies the original source, acquired catalogue, domain review and
new browser review identities. It inspects full history and original downloads,
records desktop/mobile views, and confirms that opening the received project
leaves its catalogue, source, review and release decisions unchanged. A
workspace archive does not contain its own later export-index entry; the
controller's original receive result binds that received archive.

## Preserved results

recurring-browser-result.json records named phases, source/runtime identities,
actual selected IDs, mutations, full inventory, artifact SHA-256s and layout
measurements. Exact source/history, paged view records, operation requests and
responses, original downloads, screenshots and failure state remain beside
it. On failure the function preserves its record, reports outputDirectory and
reportPath on the thrown error, and releases only browser resources it owns.

The installed original source pin is selected by the surrounding customer
operation. The earlier frozen browser-customer.mjs/9de4db32 and its complete
customer controller remain unchanged.
