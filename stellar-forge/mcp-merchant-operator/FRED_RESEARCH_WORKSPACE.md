# Research customer-agent workspace

The Research tools use the original FRED economic workspace and its saved project. A customer agent can find an original source, read its complete definition and review history, receive its actual file, inspect research-product requirements, and download an issued edition with its retained source inventory. The same project continues to hold the original county reports, economic observations, customer publications and receiving history.

This guide covers the maintained Research client, installed merchant provider and complete operating course in fred-research-journey.mjs. The Econsult course follows the existing source and quantitative programme. Its original Research sources are the complete BLS QCEW methods representation and original national CPI table. These remain separate from the fourteen original quarterly QCEW CSVs in the quantitative project.

## Install and attach the complete maintained source

Use the complete merchant distribution or complete active source edition selected by the existing Econsult controller. The earlier 230-file ESI SDK donor does not contain the merchant provider/client runtime. Copying this entry point alone does not supply its original owner, tool catalogue, retained-file reader or SDK dependencies.

The provider remains fred-workspaces. Its owner is MerchantFredWorkspaces; every Research action uses the existing FredWorkspaceClient and original workspace transaction. Closing a borrowed provider or client leaves the original workspace server with its owner.

The full native controller starts and closes the original application. A separately installed agent attaches using a private connection JSON file:

~~~json
{
  "schema": "stellar-forge.fred-workspace-connection.v1",
  "workspaces": {
    "regional-research": {
      "label": "Original regional Research workspace",
      "projectId": "THE-ACTUAL-ORIGINAL-PROJECT-UUID",
      "consoleUrlFile": "./original-workspace-startup.json",
      "inputs": {
        "methods": {
          "kind": "research-source",
          "label": "Original QCEW methods",
          "path": "./received/qcew-overview.web-reader.txt",
          "sha256": "THE-FULL-ORIGINAL-SHA256"
        },
        "catalogue": {
          "kind": "research-catalogue",
          "label": "Complete original catalogue CSV",
          "path": "./received/research-source-catalog.csv",
          "sha256": "THE-FULL-ORIGINAL-SHA256"
        }
      }
    }
  }
}
~~~

Replace the labelled values with the existing project's actual identity and complete file hashes. The startup file is the private record produced by that original workspace, including its loopback URL and session fragment. Keep it private. The host reads source files through configured aliases; an agent supplies an alias and the reviewed complete SHA256.

An upload receives original bytes through a research-source alias. An import receives a complete UTF-8 catalogue CSV through a research-catalogue alias. The maintained model validates the full content. Catalogue CSV contains definitions; original source bodies travel through source downloads and the full project bundle.

## Work through complete records

| Work | Installed tool | Continuation |
| --- | --- | --- |
| Locate sources | merchant_fred_research_catalogue | Keep filters, asOf, expectedRevision and returned nextOffset. |
| Read taxonomy | merchant_fred_research_taxonomy | Select topics or geographies; retain the project revision. |
| Read a source | merchant_fred_research_entry | Select versions, sources or reviews; retain entry ID, revision and coverage time. |
| Locate products | merchant_fred_research_products | Page the complete product inventory. |
| Read a product | merchant_fred_research_product | Select versions, editions, requirements or coverage at the same revision and time. |
| Download originals | merchant_fred_file_read | Retain exact selection, full SHA256, read ID and byte offset. |

A collection is complete when nextOffset is null and accumulated records equal its declared total. Catalogue rows do not contain every product or taxonomy record; those collections have their own tools. A changed revision means that the selected live view changed. Reopen at its new revision and retain the completed older export separately.

A source definition's currentId selects its exact saved version. A snapshot records original bytes, filename, media type, retrieval evidence and definition identity. Reviews retain their literal decision, reviewer and note. Product requirements and issued editions identify the actual source and review versions used. National CPI remains national context; QCEW methods remain publication methods.

The client exposes these operations directly:

~~~js
const configuration = await readFredWorkspaceConfiguration(connectionFile);
const client = new FredWorkspaceClient(configuration.workspaces['regional-research']);
const first = await client.researchCatalogue({ limit: 20 });
const next = first.nextOffset === null ? null : await client.researchCatalogue({
  limit: first.limit,
  offset: first.nextOffset,
  expectedRevision: first.revision,
  asOf: first.asOf
});
client.close();
~~~

Use the full record download when an individual record exceeds the tool page capacity.

## Save, review and issue in the original transaction

Before dispatch, persist the complete original request: tool name, arguments, operation ID, expected project revision, selected source hash and exact definition/product identity. Native IDs allow 1–96 letters, digits, underscores and hyphens, beginning with a letter or digit. The course derives deterministic IDs from the original operation and action name.

1. Save or import complete source definitions.
2. Acquire an original public source through its saved URL, or upload a complete original file from its configured alias.
3. Review that retained snapshot with an explicit decision and literal note.
4. Save the product's full definition and source requirements.
5. Inspect requirement coverage, then issue through the existing native product operation.

The mutators are entry_save, import, source_acquire, source_upload, review, product_save and product_issue under the merchant_fred_research_ prefix. Uploads include original entryId, definitionId, filename, contentType, source alias and expectedSha256. Preserve the original retrieval timestamp when the retained source supplies it.

After an interrupted response, first inspect merchant_fred_operation with the same saved ID. A completed operation is already in project history. A pending Research operation resumes through merchant_fred_research_resume with the same action, ID and expected revision. Replaying a completed operation uses its original full request.

The course deliberately withholds one actual successful upload response after the original server produces it. It closes the borrowed agent, inspects the original operation and recovers the same request. If a process dies before response observation is checkpointed, it records the completed history actually found. It preserves that mutation rather than uploading again under another ID.

## Receive every file

Research file selections are:

- research-source with snapshotId: exact original bytes and filename.
- research-catalogue: complete reimportable definitions CSV.
- research-entry with entryId: complete definition history, sources and reviews.
- research-product with productId and optional editionId: complete product history, selected edition and its source/review inventory.
- project: complete economic project, including all source bodies and quantitative reports.

Retained chunks carry readId, file metadata, offset, bytesRead, nextOffset, encoding "base64" and data. Check canonical base64 and exact byte count, assemble the entire file and verify its SHA256. The reader permits four concurrent read sessions. Finish or release existing reads before opening additional files.

Read IDs belong to one provider lifetime. After closing or restarting the owner, reopen the same file selection with its full expectedSha256 and next byte offset, without the expired readId. A later offset does not identify a different file.

saveFredFile writes complete downloads with create-only publication. An existing destination is accepted only when its whole hash and byte count match. receiveFredWorkspaceFile passes a complete retained project through the maintained native receiver. Research uses project bundle v7 within the existing 480 MiB capacity. The course compares a full second export against the first file's exact SHA256.

## Continue the original Econsult course

The original controller first completes its quantitative and Research programmes.

| Existing output | Meaning |
| --- | --- |
| ROOT/native | Original two-edition quantitative production and receiving. |
| ROOT/research/project | Same project with Research catalogue, sources and two original issued product editions. |
| ROOT/research/journey.json | Original Research operation and complete source-input identity. |
| ROOT/research/complete-economic-project.json | Original Research programme's full project handover. |

Select --research-catalogue --research-agent in the cumulative ESI controller. On an existing operation, preserve the original source-packet selection and use its complete source-edition packet option for the added provider runtime. The controller receives the current full dependency closure into a separate source edition and invokes this course after Research completes.

The equivalent entry point is:

~~~sh
node SOURCE/stellar-forge/mcp-merchant-operator/fred-research-journey.mjs \
  --directory ROOT/research-agent \
  --research-directory ROOT/research \
  --input SOURCE/receiving/esi-research-catalog-4593/input.json
~~~

Use absolute paths. The CLI uses installed Linux flock for the course's operation lock. The existing controller retains its separate original lock and passes --controller-lock-fd with its inherited descriptor, so the actual working child also retains that original lease. An existing native caller that already holds the operation lease can use exported runFredResearchJourney({directory, researchDirectory, inputFile}).

The course verifies the original completed journal and raw input-file SHA256, attaches the same project, reads all catalogue/taxonomy/entry/product sections and downloads the originals. It imports the current complete CSV, saves current definitions, uploads and reviews the two retained original sources through configured aliases, and issues one subsequent edition of the same product. The original two editions remain unchanged. Every non-Research project field and original operation-history prefix is compared with the retained original state.

It then downloads the whole project, closes and reattaches the borrowed provider, independently receives the project, opens a second actual workspace on that received copy, downloads every source/product again, replays the original upload request and compares the full second export. The existing engines perform all operations.

### Complete outputs

ROOT/research-agent/journey.json retains the original operation, project ID, raw input SHA256, saved request identities, actual phases, timings and completion. After COMPLETE it is stable: reopening validates the retained whole-file outputs and returns the existing journal unchanged.

The course directory retains:

- Every paginated response and full inventory before, after and following receiving.
- Full request JSON written before dispatch.
- Every original source, complete catalogue CSV, entry record, product record and issued-edition record.
- Actual withheld-response or prior-history recovery metadata.
- Full retained-chunk source and original read offsets.
- complete-economic-project.json, independent receiving receipt, received project directory and exact matching received-complete-economic-project.json.

The controller selects the agent's final complete project for the cumulative customer handover and preserves earlier quantitative and Research editions.

## Render and view the actual outgoing product

The original native/browser owner must open the exact final outgoing application and attachments before delivery. Preserve actual producer VIEW screenshots, readable desktop and narrow layouts, important controls, original report HTML/PDF/CSV/JSON exports, downloaded Research files and full-project reopen. Inspect text and table content as well as layout. Correct concrete failures in the maintained product and repeat the affected actual step.

Use the existing ESI browser programme and its retained source/outputs for this work. This agent course adds actual structured customer operations and receiving; final delivery combines both results. Keep the UI clean and industrial. Private connection records remain inside the private operating directory, separate from customer-facing attachments and reports.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949
