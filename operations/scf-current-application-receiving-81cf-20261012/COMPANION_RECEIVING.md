# Receive the complete companion on the original Page

Call this continuation from the existing full SCF receiving programme, while
its saved reader is open at the original /grant.html. It uses the caller's
Chromium Page, served application and current source edition. The original
editor and technical-review journey can continue when status is complete.

## Call

The callback is receiveGrantCompanion from receive-companion.mjs.

~~~js
const { receiveGrantCompanion } = await import('./receive-companion.mjs');
const result = await receiveGrantCompanion(page, {
  sourceRoot,
  expectedOrigin: origin,
  outputDirectory: path.join(receivingDirectory, 'companion'),
  sourceCommit,
  markdownText: fullCurrentCompanion,
  indexText: fullCurrentSourceIndex,
});
if (result.status !== 'complete') throw new Error('Companion receiving is incomplete.');
~~~

| Input | Required value |
| --- | --- |
| page | The existing Chromium Page at /grant.html, with an explicit viewport and downloads enabled in its existing context. |
| sourceRoot | Absolute repository source root containing stellar-forge/developer-site/dist/grant-companion-core.mjs. |
| expectedOrigin | Actual origin returned by the caller's running application, such as http://127.0.0.1:8787. |
| outputDirectory | Absolute output directory reserved by the caller for this complete receiving operation. |
| sourceCommit | The selected complete application source commit, as a forty-character Git SHA. |
| markdownText | Complete current grant-data/product-and-finance.md as a UTF-8 string. |
| indexText | Complete current grant-data/source-index.json as a UTF-8 string. |

The Node process and its Chromium browser must share the selected output
filesystem, so the browser can reopen its downloaded HTML through file://.
The callback uses node:crypto, node:fs/promises, node:path and node:url.
It imports parseCompanionMarkdown from the caller's selected original
grant-companion-core.mjs. The caller supplies Playwright through the Page.

## Complete customer journey

The continuation opens the selected source edition, verifies its declared
companion identity and all current chapters, and reads the funded-work chapter.
It searches the entire companion, follows a subsection outside that filter,
and receives the same reader at a 390-pixel viewport.

It downloads the full original Markdown and source index through the actual
reader controls. It also saves the one-file offline reader and receives both
complete embedded sources. Read all chapters opens every current chapter for
Chromium's complete A4 PDF, using the reader's own print stylesheet.

The same Page then opens the actual saved HTML file with Page-specific HTTP(S)
routing disabled. Search and chapter navigation continue from that offline
document, followed by original Markdown and index downloads and a phone
capture. The full hosted and offline source downloads must match the supplied
current strings exactly.

Finally, cleanup removes only this continuation's network route, restores the
original viewport and returns to the original grant URL. Route and viewport
cleanup each allow five seconds; return navigation allows fifteen seconds.
A PDF deadline applies to the returned bytes, before writing its output file.

## Artifacts and result

All outputs are written below outputDirectory:

| File | Actual output |
| --- | --- |
| companion-desktop.png | The hosted funded-work chapter on desktop. |
| companion-phone.png | The same hosted chapter at 390 × 844. |
| companion-offline-phone.png | Search and chapter reading from the saved offline HTML. |
| complete-product-and-financing.pdf | Every current chapter rendered through Chromium with A4 print media. |
| hosted-product-and-finance.md | Full original hosted Markdown download. |
| hosted-source-index.json | Full original hosted index download. |
| stellar-forge-product-and-financing.html | Complete offline reader downloaded from the actual application. |
| offline-product-and-finance.md | Full original source downloaded after offline reopening. |
| offline-source-index.json | Full original index downloaded after offline reopening. |
| companion-receiving.json | Selected source identity, actual stages, artifact identities and restored-Page result. |

The returned object has status, sourceCommit, source, stages, artifacts and
cleanup. Each artifact gives its path, bytes and SHA-256. The source section
retains the selected original Markdown and index identity, actual renderer
identity and complete chapter/table/code-block counts.

On failure the callback retains its result and any completed files, attempts
one failure screenshot, restores the owned Page, and throws with the retained
result on error.result. The caller preserves the whole output directory in
its original archive and stops the dependent editor/review continuation until
the actual current companion completes.

## Served routes

The original application manifest must serve these selected paths:

- /grant.html
- /grant-companion.html
- /grant-companion.css
- /grant-companion-core.mjs
- /grant-companion-workspace.mjs
- /grant-data/product-and-finance.md
- /grant-data/source-index.json

The full current authoring source also retains grant-companion.mjs and its
join in grant-compose.mjs. The canonical publisher supplies the actual
composition; this callback receives that same edition.

Playwright contracts used here: [Page PDF](https://playwright.dev/docs/api/class-page#page-pdf),
[Page routes](https://playwright.dev/docs/api/class-page#page-route) and
[download saving](https://playwright.dev/docs/api/class-download#download-save-as).
