# Grist complete editable workspace handover

This course continues the existing Grist source workspace. It carries the original captured observations, saved draft, reviewed source versions, request and event history, publisher work and original SF82 release records into an independent working copy. It uses the same native source model, private file controls and installed application. It does not create a new publisher, seller, payment route or receiving programme.

The whole workspace is private operator material. Its original OperatingPlan procedures, returned files, source and merchant records can contain information that does not belong in a public dataset or prospect attachment. Use the original publisher and customer release exporters for customer-facing data. Give the complete working archive only to the intended operator.

## Prepare the original saved work

Open the current installed Grist workspace through its existing Applications entry, Merchant connection or local CLI. Keep its actual source, connection aliases, runtime and original capture IDs. Finish or explicitly reconcile the current source operation. Save source draft and OperatingPlan edits before export; text still in an unsaved browser form is not part of the saved workspace. The original complete-editor download retains unsaved procedure work for recovery in the same original workspace identity and directory; it cannot be imported into a differently placed received copy. Save the desired procedures before creating the workspace archive.

A whole-workspace export stops and drains the publisher and release consoles owned by this workspace before freezing the complete saved work. Review this consequence with the operator. Export does not start a seller, publish a dataset or send a payment. The original source and release identities remain preserved.

The archive is a private binary .grwh file containing up to 32 GiB of working material, plus at most 32 MiB for the manifest and 13 bytes for the header. Source rows and archive bytes never enter browser recovery storage. Upload uses 1 MiB file slices. The original host compares retained ranges on retry and verifies the complete archive. Downloads stream through a one-use, five-minute link bound to the exact retained export.

## Browser course

Open **Workspace handover** in the original Grist browser.

1. Save the current source draft or reload its saved revision. Save desired OperatingPlan edits through the existing plan controls; use **Download complete working editor** only as separate recovery for that original workspace identity and directory. Save procedure changes before receiving them at a different location. The source draft has no equivalent complete-editor download; save it or reload its saved revision.
2. Under **Create complete workspace file**, select the confirmation explaining that export closes the owned publisher and release consoles. Choose **Close consoles and create workspace file**.
3. Keep the original request UUID visible in the recovery panel until the receipt is saved. If the response is lost, use **Check original handover receipt** or **Retry original request**. Those controls keep the exact UUID and draft/selected-version input.
4. In the saved export list, inspect the filename, byte length, counts and complete SHA256. Choose **Download complete workspace**. A lost browser download can request another link to that same immutable archive.
5. Under **Receive a complete workspace**, select the entire .grwh file and choose **Upload complete workspace file**. The progress display counts the compared/uploaded bytes.
6. If upload is interrupted or paused, reselect the same complete file in the retained request panel and choose **Resume with the same file**. The original host compares each retained range from offset zero before adding bytes. A changed file is rejected even when its name and size match.
7. After upload finishes, inspect the full verified SHA256 and byte length. Enter an independent workspace name: a lowercase letter followed by lowercase letters, digits, hyphens or underscores, at most 48 characters. Select the confirmation and choose **Receive independent workspace**.
8. Keep the exact receive request on uncertainty. The saved request reuses the same upload, SHA256 and destination name. It does not create another destination.
9. In **Saved independent receiving**, choose **Open received workspace**, then follow the displayed private local link. The original parent stays open in its own tab; the recipient has a separate workspace and saved identity.
10. Operate the received copy: inspect its original captures and source versions, edit and save a draft, inspect original publisher/release history and create a new complete archive from this received work. Close and cold-reopen it using its original saved identity.

Use **Refresh saved handovers** to read current archive and receiving history. A definitely rejected request is retained in local recovery history and can be corrected as a new explicit action only after the original native status confirms it was never accepted. An unknown network response keeps its original request.

A received workspace lives under the original parent's received-workspaces/NAME. The host records local placement explicitly. Immutable source/version/plan/candidate/release bytes remain unchanged; the received original dataset is bound through the maintained SF82 installation API. The archive records the original placement as history. Do not rewrite old source hashes to make a copied path appear original.

## Original CLI

Use the installed Node 24 CLI and the actual original private workspace path. Keep the original receiver's runtime and package selection. The commands below are examples of variable names, not a new host or operation.

~~~sh
GRIST_CLI=/absolute/installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/grist/workspace/cli.mjs
GRIST_WORK=/absolute/private/original-grist
node "$GRIST_CLI" status --directory "$GRIST_WORK"
~~~

Read the current draftRevision and selectedVersion from that actual status. An empty selected version is the literal null. Choose and retain one UUID for the complete export before invocation.

~~~sh
node "$GRIST_CLI" workspace-export \
  --directory "$GRIST_WORK" \
  --expected-revision ACTUAL_DRAFT_REVISION \
  --expected-selected-version ACTUAL_VERSION_OR_null \
  --request ORIGINAL_EXPORT_UUID \
  --out /absolute/private/delivery/Grist-workspace.grwh
~~~

This command closes the owned consoles, obtains the native immutable export and streams it into the private output. It verifies the exact byte length and SHA256, fsyncs the file and publishes without replacing another writer's output. An existing byte-identical output is accepted with the same result shape; different bytes are rejected. Repeat the original command with the same UUID and arguments after an uncertain response.

List retained exports or redownload the original selected file without making a new snapshot:

~~~sh
node "$GRIST_CLI" workspace-exports --directory "$GRIST_WORK"
node "$GRIST_CLI" workspace-download \
  --directory "$GRIST_WORK" --request ORIGINAL_EXPORT_UUID \
  --out /absolute/private/delivery/Grist-workspace.grwh
~~~

Receive the full archive through the original host model. Use its actual full SHA256 and a stable receiving UUID:

~~~sh
node "$GRIST_CLI" workspace-receive \
  --directory "$GRIST_WORK" \
  --archive /absolute/private/delivery/Grist-workspace.grwh \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --name customer-received \
  --request ORIGINAL_RECEIVE_UUID

node "$GRIST_CLI" workspace-received --directory "$GRIST_WORK"
~~~

Repeat the same receive command after uncertainty. Its original native receipt owns the operation; do not substitute a new UUID or a different destination name. Archive bytes remain complete and streamed, not parsed into a 32 GiB JavaScript object.

After the original listener releases a received workspace, open that exact existing copy through the same source CLI:

~~~sh
node "$GRIST_CLI" serve \
  --directory "$GRIST_WORK/received-workspaces/customer-received" --port 0
~~~

Use the private local URL printed by that process. Do not start a second writer while the parent's child listener is still holding it. Closing the original parent drains its owned child listeners; a separately operated received copy has its own native ownership.

## Original 14F5 receiving continuation

Continue **SCF-GRIST-PUBLIC-SOURCE-20261012-14F5** and its original installed product course. The engineering parent is C0BTB4SUCP9/1791730288.879869; the original source-acquisition continuation is D0C1U7TUZEC/1791815154.329759. Preserve its actual accepting host, original source and output when returned. The official Task Management example identifies document `hik1whAV5snj`; its original `/tables` response determines the actual user table and fields. The current original thread contains the source request and merged-code continuation, but no actual capture or accepting native result. Do not describe the prepared source course as a completed capture.

The full [RECEIVING.md](RECEIVING.md) course consumes the real capture-backed declaration and original installed `grist-merchant` manifest through `grist-receive`. It observes the complete typed capture, original source versions, publication plans, seller/customer exports, Applications and MCP before retaining a closed private receiving archive. Continue those stages at their original saved boundary. The new .grwh course receives the complete saved authoring/publisher/dataset/release workspace independently. Source-only packets and the original receiving archive remain supported; their purpose and identities stay distinct.

Retain native document/table/record IDs, captured formulas and column metadata, document states and exact typed record responses. Preserve Grist number tokens, dates/timezones, references, encoded lists, API-null and API-empty semantics. Do not replace native types with formatted display strings or turn API-normalized values into unobserved original database facts. One configured workspace remains bound to one captured table and source selection; the original two-table commercial course uses two independent workspaces.

The complete snapshot carries saved `operating_plans` and `operating_plan_requests` in the original `sources.sqlite`, including procedure ancestry, source bindings, observations, file-bearing returned reviews and accepted request results. Their original settings-data identity remains intact when host paths are projected onto the receiving location. Do not rewrite original procedure origins, plan histories or return decisions. Continue B617/828A/493D's existing Operating plans tab and [OPERATING_PLANS.md](OPERATING_PLANS.md) course. Unsaved browser working-editor state is separate from the native snapshot. Its existing **Download complete working editor** control binds recovery to both the original workspace identity and its original directory; preserving the settings identity does not make that backup importable into a relocated child. Save desired procedure edits before whole-workspace export so they travel in the native history. Source-projection forms must be saved or reloaded through their own existing controls.

Operate the exact new browser at desktop/screenshare and narrow widths and view the actual screenshots. Exercise empty and populated handover lists; export with saved source and procedure work; streamed download; paused upload and exact-file continuation; changed-byte rejection; independent receiving; a lost-response replay using its original UUID; received source editing; procedure history and original request recovery; re-export; close and cold reopen. Confirm original OperatingPlan controls and returned-file downloads still work in the received copy. Compare original capture/version/plan/release and procedure identity values. If a saved prepared-but-unstaged package exists, operate its same stage request against the received local dataset without rewriting original package/source bytes.

The original commercial case remains **grist-customer-integration-workshare-20261012-14f5**, C0BTTA66TK3/1791816787.176929. Its proposed USD 4,800 over ten active working days covers one customer document, up to two independent table outputs, one Linux host and one API/MCP consumer, two review rounds, a 90-minute staff handover and fourteen days of in-scope defect correction. Proposed milestone payments are USD 1,200 / 2,400 / 1,200. The prior commercial archive and single sent introduction remain unchanged; this implementation does not establish a customer order, payment or completed deployment.

Return the actual command/result, installed source and .grwh identities, original request receipts, independent workspace identity, desktop/narrow images and cold-reopened result to the same case. Source review and emulated control-flow checks do not establish native SQLite or rendered-product completion.

## Current producing-owner instruction

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949



## Retained browser requests and interrupted private outputs

The browser restores the original source request and whole-workspace request selection before reading optional saved-handover lists. An unavailable list does not remove an original request or enable a competing mutation. Unreadable or inconsistent local recovery storage keeps write controls closed. **Download complete recovery records** remains available for the complete readable originals and in-memory selection; after resolving the storage problem, **Reload local recovery records** retries local restoration without sending a request.

**Retained handover requests** lists the original UUIDs separately. Each complete request, confirmed result and definite rejection is retained under its own identity, while each browser window keeps its selected request in session storage. Opening another window or starting another original request does not replace an earlier window's request. Cold reload restores that window's selection; another window can use **Open retained request** to select an earlier original for receipt lookup and its existing exact-input recovery controls. Selection itself sends nothing. **Review recorded result** shows an acknowledged result and its complete input/history; it does not create another operation. Rejected inputs remain readable and downloadable and are not silently retried.

The earlier directory-wide browser record is preserved unchanged and its original requests are retained in the new inventory when opened. A completed, fully checked upload can be selected under **Previously verified complete uploads**. Receiving still checks the actual native upload's SHA256 and byte length before using it. An upload whose response was uncertain continues to require the original complete file: replay checks every retained range from offset zero before its verified result becomes a local accepted selection.

The recovery-record JSON is a private record of request inputs, receipts, rejections and local selection, including readable prior-format originals. It contains no connection token or archive bytes and is not a replacement for the complete .grwh archive. It does not import or execute requests on another host. Whole-workspace export still carries the saved native draft and history only; save ordinary source-editor changes before exporting.

Both the direct workspace CLI and the native archive saver preserve create-only output publication. If interrupted immediately after publication, a retry can finish cleanup only when the final file and exactly one original .grist-workspace-UUID.partial temporary name refer to the same private inode and the entire byte length and SHA256 match the original descriptor. It removes only that verified publisher temporary, synchronizes the directory and applies the ordinary strict private-file check again. A different file, unexpected hard link, altered permission or changed original is rejected; no output is overwritten.

Continue the same original 14F5/EA70/Scout receiving course. In the actual installed browser, open and use the retained-request panel, reload two windows with distinct original requests, inspect a failed optional list read with a source request still pending, and open the complete recovery download alongside the original archive. Keep original UUIDs, saved source and receiving names throughout. The source-level focused execution reproduces the two former lifecycle failures and confirms their corrected control flow; it does not replace the producing owner's actual desktop/narrow viewing and use of the exact final version.

The original Grist document-table request is also restored before optional inventories. OperatingPlan keeps its own unchanged complete-editor and native request recovery. The handover controls continue to respect its active work, and an unreadable handover recovery record blocks new source/procedure actions until explicit local recovery succeeds. Saved procedures travel in the native archive; unsaved editor backups remain original-directory recovery as described above.
