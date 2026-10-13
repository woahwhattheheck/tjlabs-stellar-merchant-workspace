# Economic Research customer returns and author decisions

This workflow completes a return from an editable customer Research edition to its original author. It belongs to the Research tab of the existing FRED economic workspace and retains the same source catalogue, original captured files, reviews, product definitions, issued editions and project journal.

The original customer package remains the comparison baseline. A return records what the customer changed in that editable project. The producer reviews the issued, current producer and returned versions together, saves working decisions, and explicitly applies a selected following product definition. Issuing that definition is a separate original Research action.

## Use the correct original projects

The customer begins with the project created by the original Research package receiver. Its retained Research commerce receiving record identifies the complete original package SHA256, source project, product and issued edition. The native received file is retained under the customer project's `research/receivings/PACKAGE_SHA/research-package.json.gz`.

The producer uses its original project, which still contains that product and issued edition. The return cannot become a different product or a different original author's package. Existing quantitative FRED, DDP and QCEW records, unrelated Research products and later local edits remain within their original projects.

The return contains the selected product graph and its complete source records. It does not transmit the whole customer's unrelated economic project. The original issue and every selected original file retain their IDs and hashes. Source definitions, captured bodies, reviews and product histories are available to the reviewer; a customer narrative alone does not create an accepted source review.

Keep these identities separately:

| Identity | Meaning |
| --- | --- |
| Customer package SHA256 | Exact originally received compressed Research edition. |
| Customer return ID | Exact compressed return file's SHA256, as returned by the native writer. |
| Comparison SHA256 | The selected issued/current/returned comparison used for explicit choices. |
| Project revision | Native transaction concurrency guard in the selected producer or customer project. |
| Draft revision | The selected return's saved working-review revision, starting at zero before the first save. |
| Operation ID | Stable original journal request for a create, import, save or apply. |
| Work ID | Immutable saved working edition, retaining its comparison context and choices. |

## Customer: prepare and retain the complete return

Open the actual editable customer project through its existing Research application or installed workspace connection. Read its original receiving inventory. Select the original package and product, then make the intended product/source changes using the maintained Research controls. Retain genuine source files through the existing upload or source-acquisition actions and record source reviews explicitly.

Create the return with `research-return-create` and:

```json
{
  "action": "research-return-create",
  "id": "customer-research-return-01",
  "expectedRevision": 12,
  "packageSha256": "ACTUAL_ORIGINAL_RECEIVED_PACKAGE_SHA256",
  "author": "Actual customer reviewer",
  "note": "Literal explanation of the requested changes."
}
```

The revision and hash above are placeholders: use the actual current project revision and receiving record. Store the complete original request before dispatch. Creation freezes the selected current graph and exact original package once. Its result includes the return identity and retained record. Download the original compressed packet and keep its returned filename, byte count and SHA256.

A retry uses that same operation and request. Later customer edits do not rewrite an already created return. Create a new explicitly named return when the customer intends a following response.

## Producer: import the exact original file

Receive the complete `.research-return.json.gz` or native generated `research-return-SHA.json.gz` file, preserving its original bytes. Open the original producer project and read its current revision. The import request keeps a new stable native operation ID, original filename and complete file bytes.

Native CLI:

```sh
node fred/research/cli.mjs return-import \
  --project /absolute/original-producer-project \
  --request /absolute/retained/import-request.json \
  --file /absolute/received/research-return-SHA.json.gz
```

The request JSON contains `id`, `expectedRevision`, `action: "research-return-import"` and the exact `filename`. The command reads the original file and supplies its full base64 bytes without modifying the request file. A supplied original body must agree with that selected file.

The producer retains the received packet and its original package. Import validates its selected issued product and source graph. It records receipt in the same original project journal and does not automatically overwrite the current product definition.

## Review the issued, current and returned values

Open the received return, then its comparison. Every comparison item has a stable `field`, a readable label, a kind and the complete `issued`, `current` and `returned` values.

Product fields are title, audience, purpose, format, notes and retired state. A requirement row is compared as one complete requirement, including source entry selections. Source rows retain the actual source definition and selected history context. Null values represent a row absent from that side.

A decision maps each field to exactly one of `issued`, `current` or `returned`. The requirement `order` contains exactly the IDs of non-null requirements selected for the completed adoption, in their intended order. Up to100 requirements retain the original product capacity. The model validates all required choices, ordering, source membership and source coverage.

Do not infer a choice from a visually similar title or replace an unavailable returned source with another URL. Open the actual original source files listed by the return, inspect their content and meaning, and compare source histories. The source review remains separate from accepting the customer's wording.

Read every comparison page with the same view SHA. Retain `comparisonSha256` in the working request. If another author changes the producer while review is in progress, open the fresh comparison and consciously reconcile the preserved choices. A stale draft is retained as its original working edition; it is not silently applied to a newer context.

## Save a working draft, preview, then apply

A partial review can be saved using `research-return-draft-save`. It retains the original comparison context, literal choices, current order, note and label as an immutable working edition. Use both the current project revision and `expectedDraftRevision`.

```json
{
  "action": "research-return-draft-save",
  "id": "producer-return-review-01",
  "expectedRevision": 28,
  "returnId": "ACTUAL_RETURN_SHA256",
  "expectedDraftRevision": 0,
  "comparisonSha256": "ACTUAL_COMPARISON_SHA256",
  "choices": {
    "product/title": "returned",
    "product/notes": "current"
  },
  "order": [],
  "note": "Partial review; original source and requirement choices remain to be completed.",
  "label": "First author review"
}
```

This example is intentionally partial. It is appropriate only for a draft and must be replaced with the actual comparison field IDs and current revisions.

Read any saved working edition by its return ID and draft revision. The native result wraps the immutable work and its actual saved comparison with the current project ID/revision; the work retains its own saved draft revision and complete original context. The browser preserves editable drafts and exact pending requests through reload; the native saved working history is portable with the project.

Use the read-only `research-return-preview` after completing choices. It returns the proposed product document, source selection and coverage at the exact comparison identity. Inspect these actual values before applying.

Apply through `research-return-apply` with a new original operation ID, current project revision, current saved draft revision, same comparison hash and complete choices/order. The writer saves the working edition and records the explicit adoption in one native transaction. It preserves prior product editions, source definitions, captured files and reviews. Returned source additions join their complete original history; unrelated current producer records remain intact.

Application creates/selects a following product definition and returns its definition ID and coverage. It does not issue a customer product automatically. Use the existing `research-product-issue` action after the selected source requirements are covered and the author is ready to issue. Publishing or taking payment remains the existing separate Research commerce operation.

## Original operation recovery

Retain the full request and result. After a connection failure, read the original project operation using its existing ID before deciding what remains. A completed action is replayed by its original identity without duplicating the change. A pending action resumes from its retained native payload.

Native CLI continuation:

```sh
node fred/research/cli.mjs return-resume \
  --project /absolute/original-project \
  --request /absolute/retained/original-pending-request.json
```

The request must retain the original action, ID and expected revision. The command adds only the explicit resume flag in memory. Do not allocate a replacement operation to escape a conflict. A project revision conflict requires reviewing the current project; a draft revision conflict requires reopening the saved draft history. Preserve the author's unsaved choices while reconciling either.

A source-code repair may continue an unfinished programme through the original controller's retained source-edition mechanism. Keep its business selection, operation directory, requests, accepted native results, source files and ownership unchanged. An accepted running process keeps its selected source. Do not rerun completed scientific, data-acquisition or paid work merely to receive a code correction.

## Native CLI surfaces

All commands operate on the selected original project directory.

| Command | Complete operation |
| --- | --- |
| `returns` | Page sent, received, drafts or adoptions with section/offset/limit. |
| `return` | Full selected return detail, original package and file descriptors. |
| `return-compare` | Full original/current/returned comparison. |
| `return-work` | Full immutable working edition at `--draft-revision`. |
| `return-preview` | Read-only preview from complete choices JSON. |
| `return-create` | Freeze a customer's selected original-package-bound return. |
| `return-import` | Receive the exact compressed original return. |
| `return-draft-save` | Save partial or complete working choices. |
| `return-apply` | Explicitly adopt the complete selected following definition. |
| `return-resume` | Continue the original retained pending request. |
| `return-file` | Save packet, original-package or a selected original source to a new file. |

Read commands accept `--project` and the named selection. Mutation/preview commands use `--request` for complete literal JSON. Downloads require `--out` and create a new private file without overwriting an existing result. Full project `export` and `receive` keep their existing command names.

## Installed agent and typed client

Use the existing provider `fred-workspaces`, configured host and original private connection. The caller uses `FredWorkspaceClient`; it does not start a parallel workspace server.

The installed tools are:

- `merchant_fred_research_returns`
- `merchant_fred_research_return`
- `merchant_fred_research_return_compare`
- `merchant_fred_research_return_preview`
- `merchant_fred_research_return_work`
- `merchant_fred_research_return_create`
- `merchant_fred_research_return_import`
- `merchant_fred_research_return_draft_save`
- `merchant_fred_research_return_apply`
- `merchant_fred_research_return_resume`

The configured source alias for an incoming packet has kind `research-return`. Its path belongs to the existing native host and its optional configured SHA must match the actual file. First inspect the input alias, then supply its complete expected SHA to the import tool. The tool reads the full file on that host and retains its real filename; binary content does not need to be copied into the tool call.

Inventory pages use `expectedRevision` when continuing. Detail pages select complete `files` or top-level `fields`; comparison pages select whole comparison items or complete top-level fields (including saved draft/adoption context). Saved work pages expose complete immutable fields; their full JSON includes the original saved comparison. Continue `nextOffset` with the exact `expectedViewSha256` returned by the first page. No record is silently cut to fit a tool response. A record exceeding the page capacity is available as its complete JSON file.

Use existing `merchant_fred_file_read` with:

| Kind | Selection |
| --- | --- |
| `research-return` | `returnId`, `file: packet\|original-package\|source`, and `sourceId` for a source. |
| `research-return-view` | `returnId`, `view: detail\|compare\|work`, and saved `revision` for work. |
| `project` | Complete current economic project, including all return histories. |

Preserve the returned read ID and offsets until the exact full length is received, then verify its full SHA256. A metadata view can change when the producer changes; a new selection must be opened deliberately. The downloaded immutable packet and original source hashes remain fixed.

The installed CLI uses the same tools:

```sh
fred-workspace research-return-compare \
  --connection /absolute/private-connection.json --workspace producer \
  --return ACTUAL_RETURN_SHA256 --offset 0 --limit 20

fred-workspace research-return-draft-save \
  --connection /absolute/private-connection.json --workspace producer \
  --args-file /absolute/retained/complete-draft-request.json

fred-workspace download \
  --connection /absolute/private-connection.json --workspace producer \
  --kind research-return --return ACTUAL_RETURN_SHA256 --file packet \
  --sha256 ACTUAL_RETURN_SHA256 --out /absolute/new-original-return.json.gz
```

Installed request files use the declared tool fields without the native `action` property, because the selected command identifies that action. They may include `workspace` only when it agrees with the selected connection alias. Explicit flags must match the retained complete JSON. Use `--work-revision` for an immutable work-file revision, `--draft-revision` for a save/apply expected draft revision and `--revision` for the original project revision.

## Complete project receiving and capacities

A project containing this exchange exports `stellar-forge.fred-project-bundle.v9`. It retains the Research source family, optional Research commerce, all sent/received compressed return files, their embedded original packages, immutable working-review files and comparison contexts. It retains the original native project and operation identities.

Projects without return work keep their appropriate earlier schema. The installed receiver continues accepting versions1–8; v9 may include commerce when that family is present. Validation recomputes the complete canonical bundle identity and checks each original return/source/work graph through the same native validators before materializing it.

A compressed return may be at most256MiB. The full project receiver retains its existing480MiB aggregate capacity; a large individual return still has to fit with all original project records and sources. Native source capture16MiB and selected catalogue128MiB capacities remain unchanged. Keep the complete source; do not truncate packets, strip history or silently split a single declared return. Native explicit save/apply choices retain the original 2MiB transaction capacity. The installed tool envelope retains its existing128KiB request capacity; for a larger complete authored choice document, use the native CLI request file or the typed client against the same original host. The configured binary alias avoids placing a compressed return in that tool envelope.

Export the complete producer project to a new file, receive it into an independent empty directory, and reopen it through the original workspace launcher. Check the same source/edition/return IDs, saved draft revisions, explicit adoption and following product. Operate an editable continuation in the received project and retain the original programme's complete output. A source-ready release is not evidence that this native receiving or its browser rendering has run.


## Complete native and browser receiving course

The complete browser course commands and configuration are in [RETURN_BROWSER.md](RETURN_BROWSER.md). The installed source includes `fred/research/return-journey.mjs`, `fred/research/return-browser.mjs`, `fred/ui/research-returns.css` and both return UI modules. Keep the developer portal's original `developer/index.html`, `developer/browser.mjs` and `developer/style.css` with this complete SDK: the application imports those static assets during startup. Both distribution contributions explicitly carry these files.

Continue the original equipped operation with its absolute saved configuration JSON. The native and browser course CLIs each take that complete configuration file; retain the original project/customer directories, operation IDs and every completed output. The phase order is **native prepare → browser operate → native finish → browser receive → native seal**. Preparation selects the actual customer's retained Research package and the existing producer. Browser operation uses the real return controls and keeps its original requests; native finishing preserves the complete project and its return/review source before the browser reopens the independent received project. Sealing retains the full outcome only after that receiving course.

Use the actual HTTP localhost origins provided by the original workspace servers. The course does not require opening `file:` URLs. Use the selected, permitted Chromium/Playwright runtime and preserve its existing browser policies. If a report's separately required PDF renderer is unavailable, retain the actual HTML/JSON and the concrete renderer result in the original operation; do not relabel an unproduced PDF or source-only inspection as complete rendering.

The source includes the whole course, not only a callback. Source changes belong to an explicitly retained following source edition at the same operation boundary; they do not authorize another customer/producer project or a repeat acquisition/payment. The full original Econsult receiving owner remains responsible for executing and viewing the exact outgoing application and files.


## Original Econsult programme and outgoing inspection

This extension joins the original ECONSULT-REGIONAL-PRODUCTION operation and its existing equipped-host request. Its actual source catalogue, quarterly reports, complete PDFs, selected Research issued product, payment intent and already completed stages retain their identities. Continue the original programme at an accepted source boundary. Do not start another source acquisition, seller, payment or business contact.

The producing owner must run/open the exact outgoing application, LOOK at the actual desktop and narrow displays, operate important controls and view the screenshots taken. Include populated, empty, loading, error, stale-comparison, pending-recovery and saved-draft states. Open every downloaded return/package, source attachment, readable report and complete independently received project. Fix concrete presentation or functional defects in the maintained source and continue the original operation. Source hashes, successfulHTTP, DOM counts and another agent's source review do not replace that use.


## Complete repository owner instruction

# Repository delivery instructions

Use the current README and the existing product's build/receiving guide. Coordinate through the original implementation and receiving owners, preserve concurrent source, and carry work through its authorized delivery.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

## GitHub Actions zero spend — existing owner instruction

Keep GitHub Actions disabled in this repository's provider settings and preserve the disabled source policy in [.github/hosted-ci-policy.json](.github/hosted-ci-policy.json). Every workflow job must retain the established literal-false condition, including manual dispatch and reusable jobs. Preserve its original condition inside the wrapper, and preserve the complete steps, commands, source and delivery artifacts.

Run focused product work in the existing cloud Linux or original local receiving operation. A public repository, available free minutes, cloud admission failure or a missing green check does not authorize enabling or dispatching hosted Actions. Do not set `HOSTED_CI=on`, add scheduled hosted runs or choose a paid runner. Keep source-native receiving moving with its original owner and saved operation.

Before publishing workflow changes, use the maintained Commons `tools/hosted_ci_gate.py --zero-spend REPO_ROOT` and `--check REPO_ROOT` source operation where that existing runtime is available. Its canonical wrapper is `${{ (false) && (ORIGINAL_CONDITION) }}`; the original condition is retained for native continuation. Provider disablement, the whole-account spending budget and dated billing remain separate controls; preserve current artifacts and their original custody.

This carries Bryce's existing zero-spend instruction from [Commons RULES, CI and spend](https://github.com/woahwhattheheck/commons/blob/main/RULES.md#4-ci-and-spend) into this repository's consumed entry guidance. Original cost coordination: https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791755765336589 .
