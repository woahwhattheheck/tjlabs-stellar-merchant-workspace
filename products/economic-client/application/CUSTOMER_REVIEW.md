# Complete customer review and analyst receiving

Use Node 24 or later for the analyst application. The customer HTML uses an
ordinary current browser with JavaScript, Web Crypto and IndexedDB. Its report,
original files, review model and editor are all embedded; it needs no server,
installation, API credential or network connection.

## Prepare the original briefing

Open the existing analyst project using Applications → Economic client briefing
and customer review, or:

```sh
starforge economic-client serve --project /private/original-economic-project
```

Use Sources and Client briefing to retain the actual selected data and save a
complete report edition. The existing OECD companion operation remains available.
A source-only OECD briefing can be reviewed without an EconData credential. A
selected EconData acquisition uses the existing named credential and provider
terms. Read the complete source terms and attribution before delivering data.

The Customer reviews view requires a saved briefing, intended reviewer and label.
Create the package once, then download review.html and its complete review.json.
Keep the operation ID after an interrupted creation; the same input returns the
same package. A new requested package is a new original operation.

Every package includes the complete original report JSON, HTML, observation CSV
and SOURCE_RIGHTS.json. It also includes all original selected companion files,
including its source rows, rights and saved project archive, plus each selected
native EconData decoded response, numeric lexemes, wrapper type tags and original
wire body. Source periods, historical duplicates and exact values are unchanged.
The package ID binds the entire content; the complete files are verified before
an editor or receiving workspace accepts them.

The operational bound is 512 MiB for the complete JSON input and aggregate
decoded review files/source bodies. Base64 and JSON increase document size.
A full project also has its existing 512 MiB uncompressed packet bound. The
application reports an over-limit result and retains the original source project;
it never substitutes a truncated report.

## Customer's offline operation

Open the exact downloaded review.html. First inspect the original full report
and source/companion downloads. The editor offers the report, its original
series, individual original observations and companion editions as review targets.
Search and paging change only the visible target list; all original data remains
inside the same document.

For a selected target, record Approved, Question or Change requested and comments.
The report summary/editorial notes and a series's title, interpretation or
methodology accept an explicit proposed text. Observation values, units, source
classification, periods and original captures are read-only. A question about
them remains bound to the original observation, including its absolute native
position, so repeated historical periods are not confused.

The browser retains the working draft by package and review identity. Save
revision adds a content-bound edition containing all current decisions and notes.
Repeated saving without a semantic change returns the same edition. The document
retains the full parent-linked edition chain, up to 1,000 saved editions, and an
unfinished draft. Download Working HTML before moving to another browser or
machine; IndexedDB by itself is local browser state.

Return JSON saves the complete current revision before exporting. Send that
original file back through the agreed customer channel. It contains every
original package member and the complete review history, not a list of comments
separated from their source. The intended-reviewer label describes the operation;
it is not a digital signature or proof of a person's identity.

## Analyst's returned-file operation

Select the complete Return JSON in Customer reviews. Its original bytes and
receiving operation are retained locally before upload. Continue original return
receiving after an interrupted transport; the same file and operation reopen the
same saved return. Different branches or later review editions receive distinct
return identities. Nothing replaces an earlier return.

Save any open editorial draft before comparing the return. The comparison shows
the original editorial text, current draft text, customer proposal and complete
original target/source binding. Choose explicit dispositions:

- Acknowledge records that the analyst read the decision.
- Use proposal applies the selected editorial text to the current draft.
- Defer records a remaining decision.
- Reject records the analyst's disposition and notes.

A changed current value is displayed as a conflict. Applying a proposal over it
requires its explicit checkbox as well as the retained current-value hash. A
proposal for an original series no longer present in the draft cannot be applied
to another capture automatically. Refresh and compare again after another draft
save; an old project revision or comparison digest is rejected.

Only selected decisions on the visible page are submitted. Save those dispositions
before changing pages. The complete received review remains available and every
disposition operation records the original return, comparison, current values,
proposal, reason, and before/after draft. The application does not send mail,
publish a briefing, change source observations or infer acceptance from a comment.

Save the resulting draft as a new complete report edition. The former editions,
return bytes, working package and disposition history remain available in the
same project. Export complete project carries every corresponding object and the
original EconData and OECD source histories. A fresh receiving workspace verifies
them all before adoption; repeating its identical received packet returns the
current project without discarding later edits.

## CLI and installed client

All normal action inputs are JSON files; retain the original operation ID and
exact input after a lost response.

```sh
starforge economic-client review-create --project /private/project --operation client-review-01 --input /private/review-create.json --output /private/package-receipt.json
starforge economic-client review-download --project /private/project --id ORIGINAL_PACKAGE_ID --name review.html --output /private/review.html
starforge economic-client review-receive --project /private/project --operation client-return-01 --input /private/customer-return.json --output /private/return-receipt.json
starforge economic-client review-preview --project /private/project --input /private/selected-return.json --output /private/comparison.json
starforge economic-client review-resolve --project /private/project --operation client-disposition-01 --input /private/dispositions.json --output /private/disposition-receipt.json
```

Create input is {briefing_id, recipient, label}; selected-return is {return_id}.
Disposition input contains return_id, expected_revision, comparison_sha256 and
decisions[]. Each selected decision supplies target_id, current_sha256, action,
reason and optional confirm_conflict:true. Use the actual values returned by
review-preview. Do not invent a current hash or reuse a different return.

For an active operator, use its existing private connection:

```js
import {readConnection,createClient} from "./client.mjs";
const connection=await readConnection("/private/project/connection.json");
const client=createClient({baseUrl:connection.base_url,token:connection.token});
const packageReceipt=await client.action("review-create",selection,originalOperation);
const html=await client.reviewFile(packageReceipt.id,"review.html");
const accepted=await client.receiveReview(originalReturnBytes,originalReceivingOperation);
const comparison=await client.action("review-preview",{return_id:accepted.id});
```

Do not open a second file owner while the browser owns the project. The server
serializes its original actions, raw returned-file receiving and full exports.

## Complete actual receiving course

Use receive-review.mjs with examples/review-receiving.json adapted to the actual
existing project and saved briefing. Every named directory and input is private.
Set return_file and resolution_file to the real files the customer and analyst
will produce; they may not exist on the first invocation.

```sh
node products/economic-client/application/receive-review.mjs --input /private/original-review-course.json
```

The first run creates and downloads the complete offline review and returns
WAITING_CUSTOMER_REVIEW. Open and use it. Save actual review choices, close/reopen
the working HTML, inspect the retained decisions and export the Return JSON to
the selected path. Repeat the same command.

The course receives that complete original return, confirms same-operation replay
and writes comparison.json, then returns WAITING_ANALYST_DISPOSITION if the
actual dispositions are not present. Read the current original comparison and
save its explicit selected choices to resolution_file. Repeat the same command.

It applies those choices, saves a following report, retains every report file,
exports the whole reviewed project, receives it into the configured separate
customer directory twice using the same packet, closes it and independently
reopens the original return, dispositions and report bytes. Source acquisition
and buyer operations are not replayed by this course.

The result RECEIVED_AWAITING_RENDERED_INSPECTION describes the remaining real
work. Open the exact received project and review files, inspect all applicable
attachments and exercise them as described below. It is not a source-only READY
label. The course journals each completed native result; after process loss keep
its original input, working directory and output archive.


## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

