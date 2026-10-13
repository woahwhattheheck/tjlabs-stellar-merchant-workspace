# Receive customer material decisions in the installed workspace

This continues the existing offline named-review workflow in the installed material catalogue. It uses the original catalogue, customer decisions, full decision history and request Journal.

## Review a complete return

Open **Material catalogs**, select the original saved catalogue, then **Returned customer reviews**. Choose the complete recipient return JSON and click **Compare with current catalogue**.

Read every context's original reviewed decision, current author decision and returned proposal. Expand the full record to inspect the original material and reason. Select **Keep current decision** or, where the original model permits it, **Adopt returned proposal** for every context. An absent material, changed edition or conflicted decision remains explicit. An unchanged proposal does not need another adoption.

Enter the receiving operator and reason. **Save author review choices** downloads the complete return, full comparison, all current choices and unfinished actor/reason fields. Reopen this file in its original workspace and catalogue. Reopening performs a fresh native comparison and requires the same comparison hash before restoring choices. If the author catalogue changed, the saved file remains intact; compare its original return afresh.

**Download reviewed receiving request** creates the original complete request with one retained request ID. An unchanged second download returns that same request. Keep this file. **Apply saved reviewed request** submits those exact bytes through the original catalogue transaction. The browser saves only the request ID, filename, byte count and SHA-256 in its existing pending-request record; it does not put the full return into local storage.

## Continue an interrupted request

Read **Read saved outcome** before retrying an uncertain request. After a browser reload, select the original saved request in **Original request file for interrupted receiving**, then use **Retry original request**. The file must have the retained byte count and SHA-256.

If the original request was created in the offline reader or another browser session, select it and choose **Resume original saved request**. This preserves its ID and complete file bytes. The original Journal returns an existing completed result, or carries out that exact request if it has not yet been recorded. A different payload under the same ID is rejected. This is an explicit receiving action; do not select a different request because a prior response is slow.

Before dispatch the browser writes and reads back the small pending identity. If browser storage is unavailable it stops before submission. The complete downloaded request remains usable with the existing source CLI:

~~~sh
starforge opensearch-catalog catalog-operation \
  --source /private/materials/source.json --workspace /private/materials/workspace \
  --request-id ORIGINAL_REQUEST_ID

starforge opensearch-catalog catalog-receive-review \
  --source /private/materials/source.json --workspace /private/materials/workspace \
  --request /private/materials/Material_Review_Receive_ORIGINAL_REQUEST_ID.json
~~~

The unchanged CLI preview is `catalog-review-return --return COMPLETE_RETURN.json`, with the same source/workspace arguments.

## File boundaries and onward history

The named return is bounded at 4 MiB. Its complete serialized receiving request is bounded at 8 MiB, including escaped return text. The installed interface transfers actual files as octet-stream bodies, verifies the complete SHA-256 and byte count, and uses the original authenticated workspace endpoint. Ordinary JSON requests remain limited to 1 MiB. Saved author-choice files are bounded at 32 MiB and reopen from a selected file.

The page guards hashing, API results and preparation against changes of workspace, catalogue, revision, edition and selected file. A new source invalidates request preparation while preserving the earlier comparison for an explicit save. No keep/adopt choice is supplied automatically.

An adopted request retains the complete original return, reviewed comparison, choices, actor and reason in the first adopted decision's history; other adopted contexts refer to that receipt. The full onward `catalog-bundle.jsonl` carries this history. An all-keep request remains complete in the original Journal; the portable catalogue bundle does not export that Journal. Retain the request and full native operation result separately when every choice is keep.

## Use the existing material MCP client

Configure the complete return and downloaded request as existing host-owned `materialInputs` aliases. Each selection keeps its real path, filename, byte count and SHA-256. Tools receive an alias and expected hash, never a caller-supplied filesystem path. The normal 2 MiB client argument limit and tool reply limits remain unchanged.

`materialRecipientPreview` / `merchant_opensearch_material_recipient_preview` accepts:

~~~json
{"workspace":"catalog","inputId":"customer-return","expectedInputSha256":"ACTUAL_RETURN_FILE_SHA256","offset":0,"limit":50}
~~~

Read every page before making choices. Pages contain complete rows and the original whole-comparison SHA-256. `comparisonSha256` (also the original `sha256` field) identifies the full comparison, not a separately sealed partial page. The typed client's `pages('materialRecipientPreview', ...)` pins the first hash and sends `expectedComparisonSha256` on each continuation. A changed catalogue or decision causes an explicit mismatch.

Direct tool callers retain the first hash and supply it on subsequent offsets. Never concatenate pages from different hashes. The normal reply budget can end a page earlier than the requested count. An indivisible record larger than the budget returns the existing explicit too-large error; inspect the complete local CLI preview or original source file.

Create the complete reviewed request in the existing offline reader or installed UI. Configure that exact downloaded file, then call:

~~~json
{"workspace":"catalog","requestId":"ORIGINAL_REQUEST_ID","inputId":"reviewed-request","expectedInputSha256":"ACTUAL_COMPLETE_REQUEST_FILE_SHA256"}
~~~

Use `materialRecipientReceive` / `merchant_opensearch_material_recipient_receive`. A completed Journal request can reopen after the transient alias file is retired: the host checks the supplied hash against the retained request's exact pretty-JSON bytes and requires the original operation kind. A new request reads, validates and hashes the complete selected file before mutation.

The original `operation` method reads request state. Large results retain full Journal content while returning the established bounded projection; use the existing full operation-file read to obtain that content. No record is deleted to fit a reply.

~~~sh
starforge opensearch-materials-client material-recipient-preview \
  --url MCP_URL --workspace catalog --input preview.json --all-pages
starforge opensearch-materials-client material-recipient-receive \
  --url MCP_URL --workspace catalog --input original-request-selection.json
starforge opensearch-materials-client operation \
  --url MCP_URL --workspace catalog --input original-request-id.json
~~~

These small selection JSON files omit `workspace`; the CLI binds the selected alias. Keep the endpoint's existing token environment and source configuration.

## Continue the original installed receiving course

`receive-installed.mjs` provides an additive browser continuation of the **same completed** offline/CLI review course. It reads its `RECEIVING.json`, exact saved return/request and freshly exported author state. It selects the existing installed server and caller-owned fresh Page, inspects the full current comparison, downloads/reopens author choices, and resumes the already-completed request through the UI. Fresh exports before and after must preserve every table and source byte. It creates no catalogue or adoption request.

Pass the original receiving directory and operation ID. Keep the existing operator's server and workspace lifetime; do not launch another server over its active database. Each invocation keeps a unique attempt directory, complete source/input binding, downloads, screenshots and full saved outcome. Changed source or original input requires an explicit receiving successor, not overwriting the retained intent. An optional MCP continuation uses the existing selected host after the browser/model lifetime is closed, replaying that same request.

Source review is not rendered completion. The equipped operator must OPEN, LOOK and USE the actual UI at desktop and narrow widths, inspect every screenshot, and open all downloaded JSON/HTML/bundles in their complete readers. Check legibility, customer identities, full reasons, explicit choices, keyboard/file controls, pending recovery and cold reopen. Preserve the complete original case and outputs before reporting the actual native/browser result.

### Call the existing browser continuation

After the original review suffix is complete and its CLI lifetimes have closed, the equipped owner can reopen that same author directory using the retained source. The caller already owns its browser context:

~~~js
import {createOpenSearchWorkspace} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/workspace/service.mjs';
import {startOpenSearchWorkspace} from '../../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/workspace/server.mjs';
import {receiveInstalledRecipientReturn} from './receive-installed.mjs';

// This example is relative to products/material-catalog/recipient.
// directory is the ORIGINAL completed receiving directory, not a new case.
const workspace = await createOpenSearchWorkspace({
  sourceFile: directory + '/review-source.json',
  directory: directory + '/review-author',
  env: {...process.env, RECIPIENT_COURSE_ENDPOINT:'http://127.0.0.1:9200'}
});
const running = await startOpenSearchWorkspace({workspace, port:0});
const page = await context.newPage();
try {
  await receiveInstalledRecipientReturn({page, serverUrl:running.url,
    directory, operationId:ORIGINAL_OPERATION_ID});
} finally {
  await page.close();
  await running.close(); // Releases this original author model.
}
~~~

If server startup itself fails, close the newly opened workspace before leaving that producer. Once that model is closed, the same selected private directory can be reopened by its existing configured MCP host. After `client.open()`, call `receiveInstalledRecipientMcp({client,directory,operationId:ORIGINAL_OPERATION_ID,returnInputId:ORIGINAL_RETURN_ALIAS,requestInputId:ORIGINAL_REQUEST_ALIAS})`, then close the client workspace in the caller's finally block. Configure those aliases with the complete original saved return/request file hashes before opening the host. No external search service call is required for this local comparison or Journal replay.

## Complete original owner instruction for this receiving continuation

### Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

