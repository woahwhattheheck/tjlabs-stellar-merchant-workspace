# Complete assigned discrepancy review and onward receiving

This continuation belongs to the original Property Continuity commissioning operation. It carries actual reconciliation findings and source files to an independent reviewer, receives the complete edited file, compares issued/current/proposed decisions, adopts a supervisor's explicit selections, and carries the resulting history through editable onward handover.

The original operation remains in its original directory and keeps its original input, journal, lock, workspace and command requests. Its earlier completed native results and source selection remain historical editions. Each following reviewer stage selects the complete current installed source edition separately.

## Ordinary customer workflow

Open the original Property Continuity application and select its actual physical workspace. The assigned-review screen lists retained issues, returned files and adoptions. Choose the existing reconciliation, complete findings and named reviewer. The application prepares the full issue and standalone HTML, retains every original file as one capacity-checked batch, and executes the exact compact command through the original Saved requests workflow. The Issue complete reviewer copy action commits the assignment; interrupted execution remains available in Saved requests. CLI and SDK preparation return the compact command for separate explicit execution.

Download the issued HTML. The reviewer opens that file directly in a browser. It contains the original issue JSON bytes, full reconciliation context, original source files, mapping approvals, findings and prior decision evidence. Review the assigned findings and source context, enter an actual proposed disposition and reason, and choose the full evidence supporting it. Structural blocking findings continue to require correction. Every chosen disposition follows the original native finding rules.

The reviewer can retain unfinished form text and evidence, save named complete editions, keep independent working copies, and export the complete JSON or HTML. Reopening a saved device version is explicit. Concurrent device changes preserve both candidate and current work with complete recovery downloads. The return includes the whole original issue and every required attached file.

Back in the original application, select the complete returned file. Preparation validates its issue, attributed named editions, parent history, immutable named identities and whole evidence before retaining the batch. The Record this complete return action saves and executes the original receive command through Saved requests. The returned draft remains available alongside named editions.

Select a named edition for comparison. The application shows every assigned finding with its issued, current and returned decision. Choose KEEP/CURRENT or APPLY/RETURNED for each finding. Adoption uses the exact current comparison hash and original expected workspace revision. The original Workspace transaction applies the selected decisions through finding.decide and records the attributed adoption together. A historical comparison can later reproduce the exact adoption basis while displaying later current decisions separately.

## Native continuation entry point

Use the existing equipped operation and selected installed Python. The original command gains one optional argument:

~~~sh
PYTHONPATH=/absolute/installed/products/property-continuity/app \
  /absolute/python -m bluewave.receiving_program \
  --input /absolute/original-operation/input.json \
  --operation-directory /absolute/original-operation \
  --source-root /absolute/installed/products/property-continuity/app \
  --review-exchange-input /absolute/review-stage.json
~~~

The same Programme acquires operation.lock. Each reviewer stage uses its original phases under review-exchange/<stageId>, saves exact input and first results, and queries original native commands after execution. Repeating a stage uses its retained input and original requests. The full stage result and complete ZIP are retained under the same operation directory.

Use the original source selection hash from the installed app/source-selection.json in the review stage. Keep the earlier operation input and its historical source hash exactly as retained. A stage's sourceSha256 identifies the newer complete source that actually implements review.

The full stage input has these fields:

| Field | Meaning |
| --- | --- |
| schema | bluewave.discrepancy-review-receiving.v1 |
| operationId | The original commissioning operation UUID |
| stageId | A distinct stage UUID, retained unchanged on retry |
| mode | ISSUE, BROWSER, RECEIVE, COMPARE, ADOPT or ONWARD |
| sourceSha256 | Exact current installed native source selection |
| workspace | {id,directory} for the actual original or received physical branch |
| expected | {revision,sha256} from the selected complete original workspace state |
| filesRoot | Absolute original directory holding selected complete returned files |
| files | Complete descriptors described below; an empty array is valid when no file is selected |
| body | The explicit stage-specific input described below |

Every business command is the original full envelope: requestId, kind, actor:{id,name}, at and body. Use the actual actor, observation time and command identity. The continuation obtains no decisions or evidence from invented sample records.

A selected file descriptor has path, bytes, sha256, name and mediaType. path is a portable relative path within filesRoot; the other four fields are the original complete descriptor. Selected input bytes are copied unchanged into the stage's retained inputs before application work. Once those bytes are retained, recovery can use them even if the original external file is moved.

## ISSUE: produce the actual independent review

The ISSUE body is {command}. Its command has kind review.issue and this preparation body:

~~~text
{
  id,
  reconciliationId,
  findingIds: [complete selected finding SHA-256 identities],
  reviewer: {id, name},
  note
}
~~~

The native shared prepare_issue function reads the actual original state, full reconciliation and exact source/evidence. It retains the issue JSON, rendered reviewer HTML and all embedded files together in the existing blob table. It returns the compact same-request command with body {id,issued,html}; the continuation retains and executes that exact envelope at the selected revision.

The stage delivers Property_Review_Issued.json and Property_Review_Issued.html plus the full preparation and original command result. Open and use the exact HTML before giving it to the reviewer. Each assigned finding retains its complete relevant rows and full original report, rather than a truncated extract.

## BROWSER: complete reviewer operation through the existing browser owner

After ISSUE, select the actual post-issue workspace revision and hash. The BROWSER stage body is exactly {issuedHtmlPath,reviewer,decisions,attachmentFile}, with the actual absolute issued HTML and complete attachment paths. decisions contains the two explicit complete named editions described below.

The continuation copies both complete browser inputs into its retained stage, invokes the original Programme _browser helper with an optional reviewer_copy frame, and launches the same app/tools/receiving_browser.cjs under the same inherited operation lock. The stage’s exact expected revision and state hash become the frozen browser basis, including a retry before first browser launch. Its original plan schema remains unchanged. The optional reviewerCopy field belongs to the following retained bluewave.commissioning-browser.v1 input. The prior native browser input and result keep their exact historical identities.

The optional reviewer browser course requires the selected Playwright package version 1.55 or later, whose public persistent-context browser connection supports a second context in the same owned browser. The actual version and package path are retained before launch. The existing browser process supplies a persistent context for named editions, concurrent edits and recoveries. A temporary context from that same browser provides independent cold reopening. The continuation retains every original screenshot/download and whole reviewer return in the stage delivery. Its details.returnFile and details.editionId feed RECEIVE and COMPARE.

### Complete reviewer browser continuation

The installed app/tools/reviewer-copy-browser.mjs exports runPropertyReviewerCopy for the original browser owner. It borrows the owner's page and independent browser context. The owner keeps its existing browser process, profile custody and operation.

Supply the actual issuedHtmlPath, an absolute outputDirectory under the same operation, its original operationId, the assigned reviewer, an actual attachmentFile and two explicit complete named-edition decisions. Each decision has name, at, note and items. Each item retains findingId, disposition, reason and the selected complete evidence SHA-256 list. The complete item population must match the original assignment. The helper operates exactly those supplied values.

The course opens the actual standalone file, retains an unfinished draft, saves two named editions, downloads complete original source and evidence, exercises two concurrently edited views, retains both sides and a separate working copy, and reopens the selected complete return. It records desktop and narrow screenshots of all reviewer screens and retains the complete browser artifacts. Its returnFile and last named editionId feed RECEIVE and COMPARE.

The producing owner opens and looks at every recorded screenshot and all applicable downloaded files, fixes the actual product if needed, and continues the same original operation. The complete rendering instruction is included below.

## RECEIVE: retain the actual returned JSON or HTML

The RECEIVE body is {command}. The original command has kind review.receive and body {id,file}, where file is the exact descriptor {sha256,bytes,name,mediaType}. The same descriptor must appear in the stage's selected files with its actual relative path.

Preparation reads and validates the complete returned JSON or inert HTML data, original issue bytes, attributed named history, unfinished draft and full evidence. It retains the raw return and every evidence file as a single original Workspace blob batch. The command then records the complete return under its original ID. The stage retains the returned file and a full preparation/command result.

Receiving retains unfinished reviewer work. Adoption chooses a complete named edition. Separate returned files may preserve divergent named-edition histories, even from the same working copy. Select the actual return ID and named edition explicitly.

## COMPARE: select the complete adoption basis

The COMPARE body is {returnId,editionId,adoptionId}. Use null for adoptionId to compare the selected return against the current original decisions. For a completed adoption, use its original ID to reproduce the historical basis.

The continuation saves Complete_Review_Comparison.json and Complete_Review_Comparison.html. The HTML contains the full issued/current/returned decision table and complete comparison data; every finding is present. Open the actual HTML at normal and narrow width and inspect the underlying source/evidence through the application. The exact reviewSha256 and workspaceRevision bind the adoption.

A later original state change requires a fresh explicit comparison stage. Keep earlier comparison files and their selected historical meaning.

## ADOPT: apply explicit original supervisor choices

The ADOPT body is {command}. Its original command has kind review.adopt and body:

~~~text
{
  id,
  returnId,
  editionId,
  reviewSha256,
  choices: [
    {findingId, action: "KEEP", resolution: "CURRENT"},
    {findingId, action: "APPLY", resolution: "RETURNED"}
  ]
}
~~~

Supply exactly one explicit choice for each assigned finding. The shown alternatives describe the two available choices; construct the actual complete list from the comparison. An undecided returned item can be kept but cannot be applied. APPLY keeps the returned reason and original evidence and passes through finding.decide, including its structural blocking restrictions.

The original Workspace applies every child decision and the outer adoption inside one existing transaction and records one original request result. It validates the whole resulting state and replay history before commit. A failure leaves the business state unchanged. Retrying the same original envelope returns its first result.

The stage retains the native adoption result and the complete historical comparison. Later original findings remain available separately from the frozen adoption basis.

## ONWARD: complete editable handover and cold receiving

The ONWARD body has receivingDirectory, followingDirectory, commands and comparisons. Both directories are explicit distinct physical branches within:

~~~text
<original-operation>/review-exchange/workspaces/
~~~

commands is the exact complete array of recipient edits, each {command,expectedRevision}. It may be empty when the intended recipient does not edit. comparisons is an array of {returnId,editionId,adoptionId} selections. Include the actual received named editions and historical adoptions that must be reopened.

The continuation performs this complete course:

1. Export the selected original revision with the complete installed native source, source objects, all retained issue/return/evidence files and original command/state/publication history.
2. Receive that complete archive into the selected recipient branch with a deterministic child identity derived from the stage UUID.
3. Run the supplied actual recipient commands through its original Workspace.
4. Retain every complete original reconciliation report, source pagination result and full command history through the existing report function.
5. Reopen the selected reviewer comparisons and historical adoption bases.
6. Repeat the original receive and check that the recipient's actual later edits remain intact.
7. Export the edited recipient branch, receive it into the explicit following branch, and reopen its full state and selected review history.
8. Compare the exact following state and complete review comparisons with the retained recipient edition.

The stage delivers Reviewed_Workspace.zip and Received_Reviewed_Workspace.zip, the complete report files, Received_Complete_Review_History.json, exact stage input/result and all selected original input files. Property_Review_Complete_Stage.zip includes each applicable member and its exact whole-file manifest. The continuation reopens every archive member to check complete byte identity after creation and on a repeated stage.

## Recovery and operating boundaries

While the original native programme is unfinished, continue reviewer mutations in an explicit received branch. Run ONWARD on the selected current original basis with commands=[] and distinct receiving directories, then use its receivingDirectory for ISSUE, BROWSER, RECEIVE and ADOPT. This preserves the baseline's fixed business revisions while substantial reviewer work proceeds in the same operation. After the original native programme completes, its baseline branches are also available for direct review continuation.

The continuation reconstructs lost exact stage outputs from their retained original authorities: issue and returned files from the Workspace blobs, comparisons from the frozen phase result, reports from original report blobs, and archives from their original publication intent. Completed stages enumerate their frozen selected inputs, retain every original file identity, and reopen the exact stage archive. Browser screenshots and downloaded outputs are copied into the complete stage delivery; their retained original browser files can restore the corresponding stage copies.


Keep the original stage input unchanged after first execution. A lost response after a native command is reconciled through the same request UUID, full envelope and expected revision. A changed input belongs to an explicit new stage and new original command, following review of current state. The original request journal determines whether a business write committed.

Preparations retain complete files before the command; the original command is the business mutation. The issue command reconstructs its selected issue from actual source and state, so a change between preparation and execution cannot silently replace its basis. Return preparation preserves all evidence before the receive command. The comparison hash and native revision protect adoption.

Individual whole files and complete issue/return documents use the existing 64 MiB allowance. Original retained source objects share the existing 256 MiB aggregate workspace allowance. The host preflights the full unique blob batch before inserting any member. The continuation carries complete archives within their original native capacity and caps its overall stage delivery at 1 GiB. Choose a smaller complete assignment if the full source-bearing issue exceeds capacity; preserve source bytes and complete findings.

The original child browser owner receives a graceful stop when its interval ends. The caller allows its pending launch and close to drain for 120 seconds. If closure is still in progress, it records CLOSURE_PENDING and the actual child PID; that child retains the inherited operation lock until it closes. Reentry uses the same retained browser-owner identity and actual process state. The caller does not kill the owner during its browser-close reconciliation.

The original Programme retains its preceding overall state while its reviewExchangeStages entry records this following stage. The accepted original input, completed-journal.json, native-result.json and earlier archives remain intact. The same live journal records new reviewer phases and their exact results.

## Source and ownership

The native review model is app/bluewave/review_exchange.py and the existing domain.py. Atomic complete-file preparation is app/bluewave/review_host.py and the existing Workspace blob table. The original browser application, CLI, native client and Merchant agent all call these same operations.

This continuation is app/bluewave/review_receiving.py, invoked through the existing receiving_program.py. The standalone reviewer files and borrowed browser course remain included in the same complete source selection and exported application archive. The original operation 8d3c7888-4b66-4db5-9a3f-a628ce63e844 and its Bluewave parent remain the equipped receiving route.


## Complete rendered-product owner instruction

Rendered product inspection — owner instruction, 2026-10-13
This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

