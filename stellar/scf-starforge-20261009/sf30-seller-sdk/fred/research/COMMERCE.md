# Research product editions: publish, purchase and receive

This product extends the Research tab of the existing economic workspace. It turns a saved, issued Research product into a complete customer edition, publishes that edition through the existing SF30 asset seller and retains the native Buyer transaction. A customer receives both the readable edition and a separate editable economic project.

Use the maintained installed application and original project directories. The Research catalogue, publication, customer intent and receiving selection retain their stable identities through reload, interruption and whole-project transfer. The original FRED, QCEW and DDP work remains in the same economic workspace.

## What the selected edition contains

An issued product freezes its title, audience, purpose, format, notes and source requirements. Every requirement binds the exact original source definition, captured file and ACCEPT review selected when the edition was issued.

The delivery includes only that issued product definition and edition, its bound source-definition versions, its original captured files and the accepted reviews. Later seller drafts, unrelated products, private transaction history, unrelated economic captures and the seller's current project revision do not enter the selected package. All source bodies, original filenames, requested/final URLs, status, retrieval times, definition save times, review IDs, issuer details and issued timestamps are retained.

| File | Recipient use |
| --- | --- |
| research-package.json.gz | Complete compressed edition, selected editable graph, readable members and original source bytes. |
| manifest.json | Exact file inventory with sizes and SHA256 digests, source project and selected product/edition identities. |
| research-report.html | Plain readable product, requirements, accepted review notes, source downloads and recorded source rights. |
| research-product.json | Complete selected product and source/review records, with links to the original source members. |
| source-catalogue.csv | Source definitions, publisher locations, scope, capture identity and accepted-review references. |
| source-rights.csv | Recorded publisher/licence statements, original source notes and file identity. |
| source-SNAPSHOT-FILENAME | Each full original captured source file, with a safe flat transport name. The original name remains in its capture and manifest. |

CSV cells are escaped and formula-prefixed values are presented as text. The HTML is a static document with escaped source text and no active script. It links the complete delivered sources and the original publishers. Recorded licences remain the source authority: payment for the assembled product does not replace publisher terms.

The semantic reader verifies the original catalogue rules, accepted-review/source bindings, every captured byte/hash, the exact selected graph, all regenerated readable files and the complete delivery identity. The separate gzip-byte digest identifies the actual purchased file.

## Operator sequence in the existing workspace

1. Open **Research** and maintain the original source definitions. Retain the complete original files through the existing retrieval/upload controls. Review the selected current source editions, preserving their coverage and limitations.
2. Open the saved Research product. Resolve every source requirement and record ACCEPT reviews through the original controls. Save the product and choose **Issue reviewed product edition**. The issued edition remains immutable when staff later edit the product.
3. Use the issued edition's publication action to open the existing Merchant controls with that exact product and edition selected. Retain the publication note, HTTPS origin, resource path and the existing payment terms. Submit once and retain the original request.
4. Inspect the publication's complete file inventory and download the edition, manifest, readable report, CSVs and original sources. The publication belongs to the native SF30 seller; its actual configured facilitator and the existing Buyer provide payment operations.
5. In **Customer**, prepare the intended publication/member once. Retain that intent ID, exact terms and original native request. Execute the purchase or recover its existing result after interruption.
6. Receive the delivered complete package into a new private customer directory. Reopen the same receiving selection to access the readable files and the independently initialized economic project.
7. Continue the customer product in that new project: original source/product/review IDs stay intact while a new working definition and a following issued edition can be saved. Export the complete customer project when handing over its editable continuation.

A publication operation never silently changes an issued edition. Repeating the same selection uses the retained original package bytes. A new selected edition or different note/terms is an explicit new publication selection.

## Exact package and receiving identities

The package schema is `stellar-forge.research-edition-delivery.v1`. Its `deliverySha256` is the canonical identity of the complete selected delivery, excluding that field itself. `manifestSha256` is SHA256 of UTF-8 `JSON.stringify(manifest,null,2)+'\\n'`. The gzip package's SHA256 is independent and is retained exactly through purchase, receiving and full project export.

The delivery module exports:

- `createResearchEditionDelivery({state,sources,productId,editionId,note})`: complete deterministic selected edition.
- `validateResearchEditionDelivery(delivery)` and `decodeResearchEditionDelivery(bytes)`: `{delivery,edition,files}`.
- `encodeResearchEditionDelivery(delivery)`: complete gzip bytes.
- `retainResearchDeliveryBytes(directory,bytes)`: exclusive exact-byte retention of `research-package.json.gz`.
- `receiveResearchEditionDelivery({directory,bytes})`: the complete original receipt and absolute customer/project paths.
- `readResearchEditionReceiving(directory)`: `{receipt,delivery,edition,files,bytes,directory,projectDirectory}`.

The edition summary has `productId, editionId, definitionId, title, sourceProjectId, sources, files, deliverySha256, manifestSha256`. The two counts are numbers. Each decoded file has `path, bytes, sha256, contentType, bodyBase64`.

The receiving directory contains:

- `research-package.json.gz`: exact incoming bytes.
- `research-receiving-selection.json`: original package and initialized project binding.
- `research-received.json`: committed receipt, including the source project, package/edition hashes, customer project ID, absolute directory paths and original native operation ID.
- `files/`: every readable/original member plus the original manifest.
- `project/`: the independently initialized economic project, selected Research records and complete original source captures.
- `project/research/receivings/PACKAGE_SHA/research-package.json.gz`: the exact received package retained before the native project commit.

The directory is bound to one package. A different incoming package cannot replace it. The original `research-delivery-PACKAGE_SHA` transaction starts at the reserved project's first revision, stores the source captures and original package, installs the selected Research graph, and records its Research commerce receiving in that same transaction. After a crash, repeating the same operation resumes its existing files or reopens its committed result. Later customer revisions, current-definition choices and new editions are preserved.

The host requires a FRED selection when initializing any economic project. Research receiving uses a dormant GDP selection dated to the issued edition, with no acquisition. It does not copy an unrelated seller series selection or retrieve new observations. The customer may configure normal economic work afterwards.

A whole customer-project export uses the maintained v8 extension and carries the original received package with its commerce record. Restore retains the original IDs and bytes. The selected-product package and the full private economic-project export serve different scopes; choose the artifact appropriate to the receiving person.

## Capacity and complete products

Each original Research source file remains within the existing 16MiB capture limit; the full selected source graph may retain up to128MiB. The pure complete package reader allows up to512MiB expanded JSON and256MiB compressed bytes, accommodating original source bytes in both the source graph and readable-file inventory.

The native paid seller keeps its existing limits: **16MiB per served asset and64MiB across the complete publication**. The complete package, manifest and all individual original/readable members count toward this budget. Publication rejects an edition that exceeds those limits. Select a complete appropriately scoped product; never silently omit source files or shrink captured data. The saved native configuration/offer inventory also retains its existing256KiB limit.

## CLI on the selected installed source

Run these from the installed seller SDK root, replacing the example paths and IDs with the original operation's retained values. Request JSON files carry the actual current revision when first prepared; retries use the original saved request.

```sh
node fred/research/cli.mjs commerce --project /absolute/original-project
node fred/research/cli.mjs publish --project /absolute/original-project --request /absolute/publication-request.json
node fred/research/cli.mjs publication --project /absolute/original-project --publication PUBLICATION_ID
node fred/research/cli.mjs publication-file --project /absolute/original-project --publication PUBLICATION_ID --member research-package.json.gz --out /absolute/new-package.json.gz
```

Publication request fields are `{id,expectedRevision,productId,editionId,note,origin,path,payment}`. Supply the existing authorized payment object and actual configured HTTPS origin. Never put private Buyer credentials into this request, a public package or a source carrier.

```sh
node fred/research/cli.mjs merchant --project /absolute/original-project --publication PUBLICATION_ID --port ORIGINAL_PORT --facilitator ORIGINAL_FACILITATOR
node fred/research/cli.mjs prepare --project /absolute/original-project --publication PUBLICATION_ID --intent ORIGINAL_INTENT
node fred/research/cli.mjs buy --project /absolute/original-project --publication PUBLICATION_ID --intent ORIGINAL_INTENT --buyer-config /absolute/private-buyer.json
node fred/research/cli.mjs recover --project /absolute/original-project --publication PUBLICATION_ID --intent ORIGINAL_INTENT --buyer-config /absolute/private-buyer.json
node fred/research/cli.mjs purchase-receive --project /absolute/original-project --publication PUBLICATION_ID --intent ORIGINAL_INTENT --receiving-directory /absolute/customer-receiving --buyer-config /absolute/private-buyer.json
node fred/research/cli.mjs purchase-received --project /absolute/original-project --publication PUBLICATION_ID --intent ORIGINAL_INTENT
node fred/research/cli.mjs purchase-received-file --project /absolute/original-project --publication PUBLICATION_ID --intent ORIGINAL_INTENT --member research-report.html --out /absolute/new-report.html
```

For an already held complete package, use the source project's original receiving action:

```sh
node fred/research/cli.mjs receive-edition --project /absolute/original-project --request /absolute/receiving-request.json --file /absolute/research-package.json.gz
node fred/research/cli.mjs commerce-resume --project /absolute/original-project --id ORIGINAL_REQUEST --revision ORIGINAL_REVISION
```

The receiving request is `{id,expectedRevision,receivingDirectory}`. The destination is a separate private customer directory outside the original project. The complete package is retained before dispatch and remains associated with that original request.

After customer work, export and independently receive the full editable project:

```sh
node fred/research/cli.mjs export --project /absolute/customer-receiving/project --out /absolute/complete-customer-project.json
node fred/research/cli.mjs receive --project /absolute/empty-restored-project --file /absolute/complete-customer-project.json
```

## Complete native and browser course

Use the existing Research receiving owner and its actual issued product. `commerce-journey.mjs` owns one retained programme directory and original request IDs. It packages the selected edition, receives a separate customer project, makes an explicitly authored customer continuation, exports/receives the whole project, and retains every original source and receiving record. With the existing private Buyer, selected payment terms, facilitator and HTTPS/port binding, it also runs the actual paid seller/purchase/receiving path and restores the native publication/customer state.

The browser course is `fred/research/commerce-browser.mjs`. Its private browser configuration contains absolute `playwrightModule` and `chromium` paths; include the actual installed document-render paths required by its complete course. Use the selected original source tree.

```sh
node fred/research/commerce-journey.mjs \
  --directory /absolute/original-research-commerce-operation \
  --project /absolute/original-project \
  --product ORIGINAL_PRODUCT_ID \
  --edition ORIGINAL_ISSUED_EDITION_ID \
  --operation ORIGINAL_OPERATION_ID \
  --buyer-config /absolute/private-buyer.json \
  --payment /absolute/original-public-payment.json \
  --origin https://original-configured-origin.example \
  --merchant-port ORIGINAL_FIXED_PORT \
  --facilitator ORIGINAL_FACILITATOR \
  --browser-course /absolute/installed/fred/research/commerce-browser.mjs \
  --browser-config /absolute/private-browser.json
```

Preserve the original operator's actual invocation and credentials paths. `--allow-local-facilitator` applies only when that already selected local configuration is authorized. The source-only package/customer continuation can run through the same course without financial arguments, while the full accepted commerce operation retains its paid continuation. Do not start another programme against a live accepted case.

A source repair may overlay the complete maintained controller/browser helper while continuing this same programme. The controller retains each complete code edition separately from its immutable business selection. Preserve all completed stage outputs, original request/result IDs, selected product/package and native receiving state; apply the repaired full source and resume only the unfinished stage. A new source path or corrected helper does not authorize a new payment intent or replacement business case.

The course stores original requests/results, all complete package/member files, full project exports and actual screenshots in its retained directory. On interruption, rerun that same directory/operation/source selection. Recover the original native Buyer result; do not create a new intent to compensate for a lost HTTP return.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949


Keep the original receiving operation and equipped owner. Return its actual version, opened files and viewed output with the original project handoff. Preserve the repository's existing GitHub Actions zero-spend controls.
