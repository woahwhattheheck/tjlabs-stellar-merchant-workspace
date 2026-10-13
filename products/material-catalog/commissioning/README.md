# Material catalogue → original Customer Installation

Prepare a complete customer commissioning handover from the actual retained material catalogue and the existing Operations Workshare. The original material operator remains the catalogue/business writer; the original SF47 Customer installations desk remains the Installation writer.

This component reuses the maintained v1/v2 recipient integrity reader, the supplier-catalogues profile, bindingTemplate/prepareInstallation/renderWorkorder, and commercialWorkshare. It keeps every original commercial phase, owner, dependency, fee, milestone, start condition, funded assignment and OPEN acceptance observation. It introduces no customer, task, payment or deal database.

The output is a full private directory: exact bundle/source/Workshare inputs, complete reusable source, an independently usable populated catalogue reader, readable terms and task guide, native input/preview, and a deterministic reopening path. Customer-specific inputs stay outside the public repository.

## Original input contract

Obtain these files through the existing Operations owner, after attaching the selected original sources:

| Input | Original authority |
| --- | --- |
| Complete customer JSONL bundle and SHA-256 | The material operator's actual complete export; v1 or v2, LF terminated |
| Complete installation-workshare-seed | Fresh original Operations case, pinned plan and exact commercial Workshare |
| Complete current case JSON | Same case ID, version and plan as the seed, including its full source catalogue |
| Original commissioning JSON | Exact attachment named by seed.document.workshare.sourceId/sourceSha256 |
| Original receiving packet, when selected | Exact distinct packetSourceId/packetSha256 from the seed |
| Explicit bindings and catalogue selection | Derived template, edited as a complete original selection |
| Optional additional source manifest/files | Full documented input/recipient/rights evidence, already attached to the same original case |

The original complete catalogue bundle must be present among the case's sources with matching bytes and SHA-256. Additional selected documents must match complete case attachments too. Their original filenames/purpose and raw bytes stay retained. Individual feeds already inside the verified bundle are extracted exactly under original-sources/; the whole bundle remains the native attached source.

The commissioning source must be one of the complete formats already accepted by the existing Workshare reader: dealscout.workshare-commissioning-inputs.v1 or sec-workshare.commissioning-inputs.v1. Its selected complete plan is dealscout.workshare-plan.v1. Do not turn a contact summary or proposed fee into a synthetic native seed. First use the original Workshare source intake and installation-workshare-seed described in [the maintained original Workshare source guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/6a5f62badd94f507cf5cac8c4fde13d4437dd8bf/stellar/scf_2026/sf49_data_commissioning/installation-workorders/SUPPLIER_WORKSHARES.md).

This prepares a new Installation from a fresh PLANNED seed. A previously saved or operated Installation retains its own edition, observations and original receiving flow. Use the existing native source-refresh/draft APIs for that record.

## Inspect the retained customer

With an existing Node.js 22.16+ installation, use the complete source:

~~~sh
node products/material-catalog/commissioning/cli.mjs inspect \
  --bundle /private/original/customer-catalog.jsonl \
  --sha256 ACTUAL_COMPLETE_BUNDLE_SHA256
~~~

The material product wrapper also accepts:

~~~sh
starforge-materials material-installation inspect \
  --bundle /private/original/customer-catalog.jsonl \
  --sha256 ACTUAL_COMPLETE_BUNDLE_SHA256
~~~

Inspection verifies the original envelope/footer, source bytes, table identity, material seals, retained edition/reference closure and supplier history. It reports the complete selected declaration. It does not rerun recipient profile/business evaluation or infer a later customer decision from a separate report.

## Template and explicit scope

Use one stable operation identity. The output parent must already exist and be an owned real directory.

~~~sh
node products/material-catalog/commissioning/cli.mjs template \
  --bundle /private/original/customer-catalog.jsonl --sha256 ACTUAL_SHA256 \
  --seed /private/original/installation-seed.json \
  --case /private/original/complete-case.json \
  --commissioning /private/original/commissioning.json \
  --packet /private/original/receiving-packet.json \
  --operation ORIGINAL_MATERIAL_CUSTOMER_INSTALLATION_OPERATION \
  --out /private/material-template
~~~

Omit --packet only when the original seed has no packet binding. Template contains:

- bindings.json: existing native binding fields, source matches and the complete original plan-derived scoped task;
- selection.json: exact original bundle/catalogue/revision/active edition and stable operation;
- TEMPLATE.json: full source match/missing-source list and available supplier plan/review identities.

Edit a copy of bindings.json to name the actual scoped task, source-use authority, documented target contract, receiving host/operator and deliberately selected deployment/payment fields. Keep required inputs and unresolved selections visible. The whole original Workshare remains authoritative for commercial scope. This preparer requires explicit nonblank task name, purpose, request and complete output; the original plan's phase descriptions supply the initial request.

Select an actual supplier plan/revision and optional review in selection.json only when that original history is part of this commissioning scope. A v1 catalogue has none. A v2 catalogue with unselected plans remains fully retained; it does not silently select the latest review or treat it as accepted. The complete reader still shows all contained history.

If a source is missing, attach it through the original case, obtain a fresh matching case/seed and derive a fresh template. The old preparation remains a historical selection. Do not edit its version fields to fit a new case.

### Additional complete documents

An optional --attachments path selects this original manifest:

~~~json
{
  "schema": "stellar-forge.material-customer-installation.v1.attachments",
  "files": [
    {
      "filename": "recipient-contract.pdf",
      "path": "/private/original/recipient-contract.pdf",
      "bytes": 1234,
      "sha256": "REPLACE_WITH_ACTUAL_64_HEX_SHA256",
      "purpose": "The selected customer's original documented receiving contract."
    }
  ]
}
~~~

Replace the illustrated filename, length/hash and purpose with actual files. Relative paths resolve against the manifest directory. Each full file must match a source in the same case. No file or field is truncated to fit. Original locators remain in the retained manifest; reopening uses the received bytes without fetching those paths.

## Prepare the complete usable handover

~~~sh
node products/material-catalog/commissioning/cli.mjs prepare \
  --bundle /private/original/customer-catalog.jsonl --sha256 ACTUAL_SHA256 \
  --seed /private/original/installation-seed.json \
  --case /private/original/complete-case.json \
  --commissioning /private/original/commissioning.json \
  --packet /private/original/receiving-packet.json \
  --bindings /private/reviewed/bindings.json \
  --selection /private/reviewed/selection.json \
  --out /private/material-customer-prepared
~~~

The complete result is assembled in a private sibling, every file and directory is synced, and the full directory is atomically published. Repeating the same request verifies the existing output. A changed input, application source or operation requires a deliberate new output; it never replaces a completed package.

| Output | Use |
| --- | --- |
| START_HERE.html | Readable source/terms/phase/receiving handover, searchable full-file inventory and download links |
| Material_Catalog_Reader.html | Same original recipient engine with the exact whole bundle embedded |
| source/ | Complete original bundle, seed, case, Workshare, optional packet, profile, bindings, selection and attachment manifest |
| original-sources/ | Every original feed stream extracted byte-exact from the bundle |
| attachments/ | Every explicitly selected additional complete source |
| MATERIAL_CUSTOMER_SOURCE.json | Full source annex, catalogue/edition/profile identities and matching native source IDs |
| COMMERCIAL_WORKSHARE.json/.md/.html | Complete retained commercial terms, original phases and source case |
| WORKORDER.md | Complete scoped task, required inputs, roles and native OPEN acceptance criteria |
| installation-input.json | Existing SF47 native document; import through Load input file |
| installation-preview-input.json | Original full preview envelope |
| application/ | Exact complete commissioning/reader/preparer/profile source closure |
| PREPARATION.json | Full original request and every other member's bytes/SHA-256 |
| REOPEN.md | Exact received-source command and original native continuation |

The manifest lists every other complete file, including START_HERE.html. It does not include an impossible self-hash. The browser file table lists the complete usable source/outputs available before its own assembly; PREPARATION.json is the authoritative whole inventory.

The input limit is 256 MiB for the complete bundle, 8 MiB for each JSON input, 64 MiB per additional attachment and 512 MiB for the whole produced directory. The complete declared source/application/attachment total is checked before reading additional files, and each file read is bounded by its own declared byte count. Parsing and recipient assembly use memory proportional to the actual complete selection; use the original equipped process's measured capacity. These are bounds, not a promise that every maximal input fits a small host.

## Existing browser and native continuation

Open START_HERE.html and the populated reader from the received directory. The handover's relative links require that complete directory to be available through the browser's supported file/resource route. Supplied HTML at about:blank is supported for the standalone embedded catalogue reader; it does not make the handover's sibling files available. Keep the selected browser policy and use its existing file/resource-capable course for the whole handover. Inspect the actual catalogue, source editions, selected supplier history, original scope and all unresolved inputs. Links download the actual full files. Full original commercial JSON remains editable as source; changing a proposal creates a deliberate new native source edition through its owner.

In the existing Operations application, select the original case and **Customer installations → New installation** with its original Workshare. Use **Load input file** to select installation-input.json. The maintained UI calls the original current-case preview and protects any later form edits made during the read. Inspect the full preview and save through that same writer and request. A current-case conflict needs the original fresh seed/selection; do not relax it.

Use the saved Installation's **Export complete handover** and original independent **Import complete case** path. Its actual source/phase acceptance and current state remain authoritative. This source preparer does not mark a commercial proposal commissioned, accept a phase, buy a service or convert a professional fee into atomic payment.

## Independent source receiving

Copy the entire prepared directory to a distinct private location. Run its own retained application:

~~~sh
node /private/received-material/application/products/material-catalog/commissioning/cli.mjs \
  reopen --directory /private/received-material
~~~

The command checks the complete file roster/hashes, original source references and bundle, exact retained application, and deterministic recreation of all derived files. It performs no source acquisition or native case save. The receiving course in [RECEIVING.md](RECEIVING.md) adds same-request preparation replay and actual copied-source execution under the original existing receiving operation.

## Authority and retained history

The bundle selection describes exactly the exported catalogue and decision history. A later separate native result is not substituted into that earlier source. Supplier profile evaluation, customer import, named acceptance and production release use their original owners and recorded results. Generic product capability does not widen the selected Workshare's price, roles or contracted deliverables.

The prepared case snapshot can contain an entire internal operating case. Keep this preparation private and select its intended recipient accordingly. The material product's selected-customer bundle and reader are separate usable outputs. Never publish private customer, correspondence or commercial files with the generic implementation.


## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

