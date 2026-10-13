# NocoDB complete editable workspace handover

This course continues the existing NocoDB source workspace. It carries the original captured observations, saved draft, reviewed source versions, request and event history, publisher work and original SF82 release records into an independent working copy. It uses the same native source model, private file controls and installed application. It does not create a new publisher, seller, payment route or receiving programme.

The whole workspace is private operator material. Its source and merchant records can contain information that does not belong in a public dataset or prospect attachment. Use the original publisher and customer release exporters for customer-facing data. Give the complete working archive only to the intended operator.

## Prepare the original saved work

Open the current installed NocoDB workspace through its existing Applications entry, Merchant connection or local CLI. Keep its actual source, connection aliases, runtime and original capture IDs. Finish or explicitly reconcile the current source operation. Save draft edits before export; text still in an unsaved browser form is not part of the saved workspace.

A whole-workspace export stops and drains the publisher and release consoles owned by this workspace before freezing the complete saved work. Review this consequence with the operator. Export does not start a seller, publish a dataset or send a payment. The original source and release identities remain preserved.

The archive is a private binary .ncwh file containing up to 32 GiB of working material, plus at most 32 MiB for the manifest and 13 bytes for the header. Source rows and archive bytes never enter browser recovery storage. Upload uses 1 MiB file slices. The original host compares retained ranges on retry and verifies the complete archive. Downloads stream through a one-use, five-minute link bound to the exact retained export.

## Browser course

Open **Workspace handover** in the original NocoDB browser.

1. Save the current draft or reload its saved revision.
2. Under **Create complete workspace file**, select the confirmation explaining that export closes the owned publisher and release consoles. Choose **Close consoles and create workspace file**.
3. Keep the original request UUID visible in the recovery panel until the receipt is saved. If the response is lost, use **Check original handover receipt** or **Retry original request**. Those controls keep the exact UUID and draft/selected-version input.
4. In the saved export list, inspect the filename, byte length, counts and complete SHA256. Choose **Download complete workspace**. A lost browser download can request another link to that same immutable archive.
5. Under **Receive a complete workspace**, select the entire .ncwh file and choose **Upload complete workspace file**. The progress display counts the compared/uploaded bytes.
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
NOCODB_CLI=/absolute/installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/nocodb/workspace/cli.mjs
NOCODB_WORK=/absolute/private/original-nocodb
node "$NOCODB_CLI" status --directory "$NOCODB_WORK"
~~~

Read the current draftRevision and selectedVersion from that actual status. An empty selected version is the literal null. Choose and retain one UUID for the complete export before invocation.

~~~sh
node "$NOCODB_CLI" workspace-export \
  --directory "$NOCODB_WORK" \
  --expected-revision ACTUAL_DRAFT_REVISION \
  --expected-selected-version ACTUAL_VERSION_OR_null \
  --request ORIGINAL_EXPORT_UUID \
  --out /absolute/private/delivery/NocoDB-workspace.ncwh
~~~

This command closes the owned consoles, obtains the native immutable export and streams it into the private output. It verifies the exact byte length and SHA256, fsyncs the file and publishes without replacing another writer's output. An existing byte-identical output is accepted with the same result shape; different bytes are rejected. Repeat the original command with the same UUID and arguments after an uncertain response.

List retained exports or redownload the original selected file without making a new snapshot:

~~~sh
node "$NOCODB_CLI" workspace-exports --directory "$NOCODB_WORK"
node "$NOCODB_CLI" workspace-download \
  --directory "$NOCODB_WORK" --request ORIGINAL_EXPORT_UUID \
  --out /absolute/private/delivery/NocoDB-workspace.ncwh
~~~

Receive the full archive through the original host model. Use its actual full SHA256 and a stable receiving UUID:

~~~sh
node "$NOCODB_CLI" workspace-receive \
  --directory "$NOCODB_WORK" \
  --archive /absolute/private/delivery/NocoDB-workspace.ncwh \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --name customer-received \
  --request ORIGINAL_RECEIVE_UUID

node "$NOCODB_CLI" workspace-received --directory "$NOCODB_WORK"
~~~

Repeat the same receive command after uncertainty. Its original native receipt owns the operation; do not substitute a new UUID or a different destination name. Archive bytes remain complete and streamed, not parsed into a 32 GiB JavaScript object.

After the original listener releases a received workspace, open that exact existing copy through the same source CLI:

~~~sh
node "$NOCODB_CLI" serve \
  --directory "$NOCODB_WORK/received-workspaces/customer-received" --port 0
~~~

Use the private local URL printed by that process. Do not start a second writer while the parent's child listener is still holding it. Closing the original parent drains its owned child listeners; a separately operated received copy has its own native ownership.

## Original 14F5 receiving continuation

Continue **SCF-NOCODB-SOURCE-PUBLISHER-CUSTOMER-20261012-14F5** and its existing standalone product receiving. The original engineering parent is C0BTB4SUCP9/1791730288.879869. Its current original provider/TESTNET/Applications course is D0C1U7TUZEC/1791797640.000139, followed by the same-workspace standalone continuation at1791808800.730409. Keep their original operation, saved runtime, accounts, source and output. The original host is `~/workspace/sim-work/scf-nocodb-20261012-14f5`; its NocoDB 0.301.3 source is base `p980z5spvar39sq`, Film table `mva6bgg4tqjqs30` and Actor table `mmdz20fl5j0mw6s`. The original provider source includes 48 pages in 52 retained files. Use the original actual authoring/publisher paths and result; a catalogue, source ZIP or commercial handoff is not that live database.

This whole-workspace course follows the original completed stages at a saved boundary. It adds no provider extraction, seller activation or payment. Preserve the current provider and native operator. Reuse the actual source versions, integer plan IDs, published run UUIDs, snapshots, saved draft and release history from the same operation. Do not fabricate missing receipts or repeat an upstream stage merely to populate a handover.

The existing standalone `products/nocodb-merchant/README.md` and `receive.mjs` course verifies and reopens that same original database and retains complete source packets. The new .ncwh course additionally freezes the complete saved authoring/publisher/dataset/release history and receives it independently. Source packets remain supported for source-only portability. Their import can create new capture/version identities; it is not a full historical-workspace transfer.

Operate the exact new browser at desktop/screenshare and narrow widths. View the actual screenshots. Exercise saved and empty handover lists; export with a current saved draft; streamed download; paused upload and exact-file continuation; changed-byte rejection; independent receiving; a lost-response replay using the original UUID; received draft editing; full re-export; close and cold reopen. Inspect all downloaded archive identities and reopened working contents. Compare original source, publisher, target and release identities. If the received workspace contains an original prepared-but-unstaged package, operate its same saved stage request through the original local dataset binding, retaining the unchanged package/source bytes.

Keep this course within the original `sf49-nocodb-merchant-data-integration-14f5` customer work. Its original proposal is USD 4,800 over ten business days, with a 60-minute handover and one consolidated correction. These remain proposed terms; this implementation does not establish acceptance, a payment or a completed customer engagement.

Return the actual native command/result, source and archive identities, original operation requests, independent receiving identity, desktop/narrow images and reopened result to the same case. Source review and emulated control-flow checks are not native SQLite or rendered-product completion.

## Current producing-owner instruction

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949



## Review a customer's returned draft

Use the existing complete workspace handover for both directions. A customer edits its independent received workspace, exports that saved workspace, and the author receives the returned file under a new named child. The original author and child may both have advanced independently. A draft revision number by itself does not establish shared ancestry.

The **Returned review** tab compares the exact common original draft, the current author draft and the frozen returned draft. It retains the original source/capture identity. NocoDB native field IDs and provider types remain bound to that source. Decimal number-text/identity-text encoding, nullable and empty-value policy, filters, and ordered query/column choices remain explicit; the returned review never substitutes a fresh capture or rewrites frozen provider bytes. A different source edition, missing common ancestry or an invalid combined schema stays visible as a blocking issue. Do not replace that evidence with a fresh capture merely to make the comparison pass.

### Browser course

1. In **Review columns**, save any unsaved author edits. In **Workspace handover**, receive the customer's complete file under its own independent name. The child remains independently editable; the original author is not overwritten.
2. Open **Returned review** and select that saved child. **Capture returned draft** freezes this particular return under an original request UUID. Further edits in the child do not silently change the captured review.
3. Use **Open returned review**. Check the common/current/returned revision and SHA identities, the exact source details and any blocking issue. **Previous changes** and **Next changes** page through every changed field, at most 100 per page.
4. Each change displays the full original/current/returned value and whether a value is absent. For conflicts choose **Keep current author value**, **Use returned value** or **Use common original value**. Nonconflicting rows may retain automatic comparison. An empty selector removes an explicit choice. Order rows select the full saved order, without silently sorting columns.
5. Add a review note and choose **Save review decisions**. This sends the complete choices map, including choices made on other pages; omitted entries remove prior explicit choices. Partial review is allowed. The browser then reads the new saved revision and preview digest.
6. **Apply reviewed draft** is available only when the current comparison is applicable, review choices are saved and the author editor has no unsaved changes. The operation checks the original review and local draft again. It changes the author draft only. Open **Review columns**, run the original complete-row preview, save a new source version and use existing publication controls separately.
7. **Download frozen review** selects the exact displayed saved review revision, including incoming ancestry and decisions. This is private review material. Keep the complete workspace archive for editable full-workspace continuation.

The browser keeps only review IDs, revision/digest, field choices and notes in local storage. It does not store the incoming workspace or source rows there. Choices persist across pages and reopening. If the saved review, source or local draft has changed, the browser blocks save/apply and shows **Local decisions need reconciliation**. **Download local choices** preserves the complete local envelope. **Use saved review** explicitly replaces the local editor with saved decisions. **Carry local choices to current comparison** reads all current change pages and retains choices only for fields that still appear; it reports exclusions and preserves the full prior map in local history. Review the carried map and save it explicitly.

A local-storage failure is an error, not a saved decision. Do not clear browser storage while recovering a pending request or unsaved review. The download envelope contains a choices property; the CLI expects that property's map, not the entire envelope.

### CLI

The existing workspace CLI supplies the same original methods:

```text
return-capture --directory PRIVATE_DIR --name RECEIVED_NAME --expected-revision N --request UUID
returns --directory PRIVATE_DIR
return --directory PRIVATE_DIR --review UUID
return-preview --directory PRIVATE_DIR --review UUID [--offset N] [--limit 1..100]
return-review --directory PRIVATE_DIR --review UUID --expected-review-revision N --preview-sha256 SHA --choices CHOICES.json --note TEXT --request UUID
return-apply --directory PRIVATE_DIR --review UUID --expected-review-revision N --preview-sha256 SHA --request UUID
return-export --directory PRIVATE_DIR --review UUID [--revision N] --out FROZEN_REVIEW.json
```

Choose each write UUID once and retain the exact command inputs. The original operation/resume commands with --directory DIR --request UUID recover the same saved action. An unknown network/process outcome never authorizes a replacement request UUID.

A choices file contains the complete JSON-pointer map, for example:

```json
{"/title":"returned","/queries/catalog/columns/customer_name/type":"local"}
```

Use the actual paths returned by your preview; the example does not assert any particular captured field. Values are exactly local, returned or base. Read all pages using nextOffset, then write the complete chosen map. Saving returns a new review revision; read return-preview again and use its new digest and revision for apply. A map with zero entries is {}. Include a meaningful --note.

The CLI's return-export publishes a private complete JSON file without overwriting different existing bytes. An identical repeated export returns the same byte/hash result; use --revision to pin the reviewed edition. A different saved revision requires a different output path.

### Original request and conflict recovery

Capture, review and apply use the existing operation journal. The browser retains the exact request before dispatch, including the complete choices map for review. **Check original receipt**, **Resume retained request** and **Retry identical request** keep that identity after a lost response. The saved action result is reconciled before stale guards.

NOCODB_RETURN_CHANGED, NOCODB_RETURN_PREVIEW_CHANGED and NOCODB_DRAFT_CHANGED indicate definite preaccept conflicts only when the host confirms there is no saved operation for that UUID. Refresh the same review, preserve/reconcile local choices and deliberately issue a new reviewed action. A failed receipt read remains uncertain and keeps the original request.

This course supports the original proposed single consolidated correction. It does not assert a paid order, an accepted commercial proposal or a completed native receiving result. Continue the same original 14F5 programme with its actual source, private host and full rendering instruction already included above. Operate and inspect this exact new tab at desktop and narrow widths, with populated and empty comparisons, a conflict, partial choices, stale author edits, interrupted-response recovery, frozen review download and whole-workspace reopening. Return the actual rendered results to that existing case.


## Retained browser requests and interrupted private outputs

The browser restores the original source request and whole-workspace request selection before reading optional saved-handover lists. An unavailable list does not remove an original request or enable a competing mutation. Unreadable or inconsistent local recovery storage keeps write controls closed. **Download complete recovery records** remains available for the complete readable originals and in-memory selection; after resolving the storage problem, **Reload local recovery records** retries local restoration without sending a request.

**Retained handover requests** lists the original UUIDs separately. Each complete request, confirmed result and definite rejection is retained under its own identity, while each browser window keeps its selected request in session storage. Opening another window or starting another original request does not replace an earlier window's request. Cold reload restores that window's selection; another window can use **Open retained request** to select an earlier original for receipt lookup and its existing exact-input recovery controls. Selection itself sends nothing. **Review recorded result** shows an acknowledged result and its complete input/history; it does not create another operation. Rejected inputs remain readable and downloadable and are not silently retried.

The earlier directory-wide browser record is preserved unchanged and its original requests are retained in the new inventory when opened. A completed, fully checked upload can be selected under **Previously verified complete uploads**. Receiving still checks the actual native upload's SHA256 and byte length before using it. An upload whose response was uncertain continues to require the original complete file: replay checks every retained range from offset zero before its verified result becomes a local accepted selection.

The recovery-record JSON is a private record of request inputs, receipts, rejections and local selection, including readable prior-format originals. It contains no connection token or archive bytes and is not a replacement for the complete .ncwh archive. It does not import or execute requests on another host. Whole-workspace export still carries the saved native draft and history only; save ordinary source-editor changes before exporting.

The direct workspace CLI, its frozen returned-review export and the native archive saver preserve create-only output publication. If interrupted immediately after publication, a retry can finish cleanup only when the final file and exactly one original .nocodb-workspace-UUID.partial temporary name (or .nocodb-return-UUID.partial for a frozen review) refer to the same private inode and the entire byte length and SHA256 match the original descriptor. It removes only that verified publisher temporary, synchronizes the directory and applies the ordinary strict private-file check again. A different file, unexpected hard link, altered permission or changed original is rejected; no output is overwritten.

Continue the same original 14F5/EA70/Scout receiving course. In the actual installed browser, open and use the retained-request panel, reload two windows with distinct original requests, inspect a failed optional list read with a source request still pending, and open the complete recovery download alongside the original archive. Keep original UUIDs, saved source and receiving names throughout. The source-level focused execution reproduces the two former lifecycle failures and confirms their corrected control flow; it does not replace the producing owner's actual desktop/narrow viewing and use of the exact final version.

The current returned-review workflow retains `/api/return/capture`, `/api/return/review` and `/api/return/apply` in the same original source-request recovery. Full saved choices and note are restored before optional return or handover inventories. This correction preserves the complete returned-review controls and their original draft-only apply contract.
