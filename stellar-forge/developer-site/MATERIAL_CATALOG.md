# Material Catalog: supplier source to customer handover

Use the existing Material Catalog and Grant Operations workspace to carry original supplier files into reviewed editions, a complete customer catalogue and its source-bound Workshare and Customer Installation. The offline recipient reads the complete catalogue, saves proposed customer decisions and can re-review those proposals against a following author edition.

## Choose the input you have

| Your starting point | Open this maintained workflow | What you retain |
| --- | --- | --- |
| Original supplier CSV, TSV, JSON rows/JSONL, ETIM xChange JSON or BMEcat XML | [Original supplier intake](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/stellar/scf_2026/sf47_budget_model/workspace/MATERIAL_SUPPLIER_INTAKE.md) | Full original bytes and provenance, named mapping drafts, full or explicit-base delta previews, exact native requests and the first verified complete catalogue capture |
| A complete author-exported catalogue JSONL bundle and an existing Operations Workshare | [Material Source Desk](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/stellar/scf_2026/sf47_budget_model/workspace/MATERIAL_CATALOGUE_OPERATOR.md) | Full catalogue/source history, edition comparison, the original commercial document, explicit source bindings, preparation and complete customer package |
| A catalogue to inspect or review without running a server | [Offline recipient](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/products/material-catalog/recipient/README.md) | All editions, original feeds, material/customer/supplier histories, saved working review and proposed return |
| A previous complete working review plus the author's following complete catalogue | [Following-edition re-review](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/products/material-catalog/recipient/FOLLOWING_EDITION_REVIEW.md) | Both original catalogues, all previous work, explicit carry/revise/omit choices, unfinished fields and separately retained new returns |
| A fresh original case/Workshare seed and catalogue for a portable commissioning directory | [Customer Installation source preparation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/products/material-catalog/commissioning/README.md) | Original terms, roles, phases, required inputs, OPEN acceptance observations, complete source annex and independent reopening |

These are different openings into the same product. The catalogue's original operator owns edition and customer-decision mutations. The original Installation editor owns saving the Installation.

## Obtain the complete source and package

[Open the complete selected source tree](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/3722647aa837fe0aa1cad461577470e2f9538130). This October 13 source edition includes the raw supplier integration, author review matrix and following-edition recipient. Its customer preparer carries 19 complete application members and assembles the recipient from eight original sources. The distribution selection is `material-catalogue-installation`; its [complete recipe](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/stellar/scf-starforge-20261009/distribution/selections/material-catalogue-installation.json) includes the catalogue runtime, SF47, original commercial preparation, recipient and their operating/receiving guides.

The [maintained distribution guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md) describes exact-commit builds and installed source layout. Build from a complete Git checkout with Node.js 22.16+:

~~~sh
git clone https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace.git material-catalog-source
cd material-catalog-source
git checkout --detach 3722647aa837fe0aa1cad461577470e2f9538130
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . --ref 3722647aa837fe0aa1cad461577470e2f9538130 \
  --selection material-catalogue-installation \
  --out /absolute/new-material-customer-release
~~~

Choose a new output directory. Use the returned complete archive and SHA-256 with the [original runtime installer](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md). Preserve an existing accepted runtime's source selection and owned workspace; receive an upgrade at its deliberate next-source boundary. The source checkout is also usable through the original commands below. The native local catalogue uses Node's built-in SQLite; the SF47 host uses its original Python runtime. Follow the product's selected schema/MCP dependency setup in [the original product guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/products/material-catalog/README.md) and runtime guide.

### Open an original catalogue and the selected Operations case

Use the actual existing source/merchant-plan files and original private workspace directories. Review the source declaration and public merchant terms before any merchant use. Local catalogue/source work is available without dispatching an OpenSearch query; configured search and merchant operations use their original account and runtime.

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/workspace/server.mjs \
  --source /absolute/private/source.json \
  --plan /absolute/private/merchant-plan.json \
  --workspace /absolute/private/original-material-catalog --port 8447
~~~

If this catalogue already has a running host, use it. Read its actual workspace UUID, and place that UUID, its actual loopback origin and the selected Operations case ID in the server-owned [connection declaration](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/stellar/scf_2026/sf47_budget_model/workspace/material-catalogue-connections.example.json). Replace every illustrated value with the original observed selection.

~~~sh
GRANT_MATERIAL_CATALOGUE_CONNECTIONS=/absolute/private/material-connections.json \
  python3 stellar/scf_2026/sf47_budget_model/workspace/server.py \
  --workspace /absolute/private/original-grant-workspace --port 8790
~~~

Use the original host's access controls and current staff identity. Open the correct plan/case and its complete commercial Workshare in a **new, unsaved Installation draft**, then **Material catalogue → Original supplier intake**. The browser selects an opaque configured connection; its token, origin credentials and SQLite path remain with the existing server. The [complete intake guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/stellar/scf_2026/sf47_budget_model/workspace/MATERIAL_SUPPLIER_INTAKE.md) and [CLI/receiving guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/stellar/scf_2026/sf47_budget_model/workspace/MATERIAL_SUPPLIER_INTAKE_RECEIVING.md) give the original request objects, command flags, session checks and recovery behavior.

## Review the supplier edition and freeze the complete capture

Retain the exact original file and provenance in **Supplier files**. Review its complete mapping and actual transaction semantics, then save the mapping through the original catalogue. For BMEcat, **Read original BMEcat profile** supplies source-derived suggestions; selecting a suggestion is an explicit operator action. BMEcat price-only/product-data transactions remain source-only under the [original BMEcat contract](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/products/material-catalog/BMECAT.md); they cannot silently replace complete materials.

In **Edition review**, choose complete replacement or explicit upsert/delete processing and its exact retained base. Inspect full native preview/counts, materials and changes before selecting the preview's exact review hash at the current catalogue revision. Pages of inspected records are views of the complete source.

**Capture complete selected bundle** validates the full export and its workspace, catalogue, revision, tenant, mapping and active edition. The first fully verified bytes are frozen before **Attach and open separate source review** sends them through the existing case source writer. A new native export can have a different timestamp/hash; use the retained capture to recover the original attachment.

Native requests are retained before dispatch. Read the same original journal after interruption; COMPLETE, FAILED, INTERRUPTED and RUNNING stay distinct. A preflight refusal proves only that proxy attempt was unsent. Preserve any earlier unknown attempt until its original result is reconciled. The CLI offers the same operating interface; it is an alternative to the browser's mutation sequence.

The raw bridge accepts a complete supplier file up to 16 MiB and a catalogue capture up to 128 MiB. Other product layers have their own complete-input/working/package limits in their guides; do not truncate or assume that a maximal source fits an unmeasured runtime.

## Prepare and save the customer's Installation

The Material Source Desk preserves the full attached catalogue, original feed downloads, edition comparisons and every retained supplier record. Receive the complete actual Workshare, review its scoped task and source bindings, and select any supplier plan/review deliberately. A recipient evaluation does not become accepted merely because it is present in the source.

**Prepare and review complete Installation** produces the source-bound native preview and customer package. Keep the Workshare's original price/status, phases, owner roles, required inputs and acceptance observations. **Open as separate Installation draft** rechecks the preparation against the current case. Use the original editor's **Review complete installation** and **Save reviewed edition**. A proposed Workshare remains proposed until its original workflow records a different status.

The full customer directory includes its original bundle/feeds, commercial files, task guide, original native input, complete source and a populated recipient. Open `START_HERE.html` with the entire directory available so its real sibling-file links work. A supplied-HTML/about:blank page can operate the standalone embedded recipient; it does not provide the handover's sibling files.

To inspect a complete author export directly:

~~~sh
node products/material-catalog/commissioning/cli.mjs inspect \
  --bundle /absolute/private/customer-catalog.jsonl \
  --sha256 ACTUAL_COMPLETE_BUNDLE_SHA256
~~~

The [complete commissioning guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/products/material-catalog/commissioning/README.md) provides template/prepare commands using the fresh original seed, case snapshot, commissioning attachment and optional receiving packet. These inputs come from their original owner; a contact summary or proposed fee is not a native seed. The Source Desk provides this preparation through the existing case without requiring a manual substitute ledger.

## Deliver a usable reader and receive customer proposals

[Download the complete standalone reader source](https://raw.githubusercontent.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/3722647aa837fe0aa1cad461577470e2f9538130/products/material-catalog/recipient/Material_Catalog_Reader.html) and save it as HTML, or use the same file in the checked-out product. Open it and choose the complete original catalogue JSONL. To produce one customer HTML with that exact catalogue embedded:

~~~sh
node products/material-catalog/recipient/build.mjs \
  --bundle /absolute/private/customer-catalog.jsonl \
  --output /absolute/private/new-customer-reader.html
~~~

Inspect all seven original sections and download the actual original files. **Review and return** retains named proposed decisions and complete working state. Keep the working JSON/HTML as well as the named return. A recipient return is a proposal: the author opens it with the actual current catalogue, compares every context, explicitly chooses Keep current or Adopt and uses the original saved request/transaction. The [author worklist guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/products/material-catalog/recipient/AUTHOR_WORKLIST.md) explains comparison across multiple reviewers, missing proposals and original adoption. Keep missing distinct from an explicit Keep current choice.

For a following edition, restore the whole previous working review, then choose **Open following catalogue for re-review**. The same catalogue/tenant must have a different active edition and retain prior immutable history. Explicitly carry eligible unchanged proposals, revise against actual current material, or leave a proposal out of the new return. Omission preserves the old proposal and means neither rejection nor deletion. The full working output retains both source catalogues, earlier work, unfinished fields, every choice revision and complete returns.

## Reopen the whole delivery

Copy the entire commissioning directory and run its own retained source:

~~~sh
node /absolute/received-material/application/products/material-catalog/commissioning/cli.mjs \
  reopen --directory /absolute/received-material
~~~

This verifies the exact roster/hash identities and deterministically reopens the complete selected inputs and derived files. Reopen the actual saved recipient HTML/working JSON, and use the original Installation's **Export complete handover** and existing **Import complete case** route for native case receiving. Preserve the exact source/request/actor and any accepted earlier output.

## Source edition and actual receiving state

This opening uses the merged raw-intake edition [PR2015 / 3722647a](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/2015), including the complete author matrix and following-edition recipient already joined there. [The maintained grant chapter](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/85904ae1f9936b358bb811eb00f895cf0259a9ba/stellar-forge/developer-site/GRANT_OPENSEARCH_MATERIALS.md) and [88-source measured declaration](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/85904ae1f9936b358bb811eb00f895cf0259a9ba/stellar-forge/developer-site/grant-products/opensearch-material-customer.json) preserve the earlier measured native results and every selected source edition.

At this source publication, complete source review, original pure-model preservation and eight-module reader assembly have results. The whole raw supplier→Installation/customer native/browser course and producing-seat visual acceptance remain pending in the existing EE290/ISO/38F0 receiving operation. This guide does not promote those source checks into a received customer or rendered result.

For that same existing receiving course, use the [whole original receiver](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/3722647aa837fe0aa1cad461577470e2f9538130/stellar/scf_2026/sf47_budget_model/workspace/MATERIAL_SUPPLIER_INTAKE_RECEIVING.md) with its actual selected source/input and host. The SAP examples are two original full snapshots; their separately declared upsert policy is an operator interpretation, not a supplier-issued delta. Use actual customer inputs when receiving a customer. Keep the current operation, source selection and browser ownership.

For the existing front-door publisher, receive this entry into the same Site and source edition. At its original rendered boundary, open `/index.html`, use **Material catalogues →** under Other sources, select the Material workflow directly, copy/download its actual commands, search Components for supplier/BMEcat/renewal/Installation, follow the complete guides and standalone reader download, and inspect desktop/narrow output. Preserve every other component/workflow. Return actual images and operated-download identities to the producing seat for viewing.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949
