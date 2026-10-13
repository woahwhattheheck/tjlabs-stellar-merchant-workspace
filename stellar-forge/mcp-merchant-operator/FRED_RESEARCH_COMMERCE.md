# Paid Research editions in the installed economic workspace

This workflow carries an issued Research product from its original reviewed sources through publication, a retained paid customer intent and an editable customer project. It uses the existing FRED workspace, native SF30 seller and SF88 Buyer. The original catalogue, quantitative FRED/DDP/QCEW work and project history remain available in the same economic project.

## Select the issued edition and original host

Open the existing private workspace connection. The installed provider is `fred-workspaces`; its owner is `MerchantFredWorkspaces`, and direct integrations use `FredWorkspaceClient`. The original private startup record and project binding identify the running host. A client disconnect closes the borrowed connection and its retained file reads; it leaves the original host running.

Use `merchant_fred_workspaces`, `merchant_fred_status` and `merchant_fred_inputs` to read the actual selected workspace, current revision, configured merchant profiles and source aliases. Keep the returned original project ID. Research product inventory and product-edition pages remain under `merchant_fred_research_products` and `merchant_fred_research_product`.

Choose an already issued edition. Its original product definition, explicit source requirements, source captures and reviews determine the package. Native publication validates that selection; it does not turn an unfinished product into an issued one. If the product needs work, use the existing catalogue, source upload/acquisition, review, product save and product issue workflow described in [FRED_RESEARCH_WORKSPACE.md](FRED_RESEARCH_WORKSPACE.md).

The provider retains compact pages. Follow every `nextOffset`. Catalogue and time-sensitive product pages keep their original `expectedRevision` and `asOf`. Commerce inventory pages keep `section` and `expectedRevision`. Publication and received-product pages keep `section` and `expectedViewSha256`, because prepared customer requests can advance independently of the economic project revision.

## Publish the complete selected product

`merchant_fred_research_publish` accepts:

| Field | Selection |
| --- | --- |
| `workspace` | Existing configured workspace alias. |
| `id` | Stable native operation ID: letters, numbers, underscore or hyphen, at most 96 characters. |
| `expectedRevision` | The current original economic project revision. |
| `productId`, `editionId` | The exact original issued product and edition. |
| `profile` | Existing configured merchant profile containing origin, path and complete payment terms. |
| `note` | Optional literal publication note. |

The native writer freezes the original selected source graph, readable files, package, complete file descriptors and payment terms. The result returns the publication identity and original merchant plan. Publication uses one native project transaction. Retain that result and the original request. After an interrupted response, inspect `merchant_fred_operation` using the same ID. `merchant_fred_research_commerce_resume` accepts the original `research-publish` or `research-receive` action and resumes its retained payload.

Use `merchant_fred_research_commerce` to page either `publications` or `receivings`. The response includes the current project revision, both collection counts and any original pending commerce operation.

Use `merchant_fred_research_publication` to read one publication. Sections are `files`, `sources` and `requests`. Each page retains the publication terms, edition identity and complete selected row values. The `files` section lists the original package, manifest and every offered member with byte count and SHA256. The `requests` section preserves each prepared intent and its original purchase digest.

Native source captures retain their existing 16 MiB per-source and 128 MiB total limits. The complete retained Research package supports 256 MiB. The paid seller separately enforces its existing asset capacity: 16 MiB for each complete offered file and 64 MiB total. Publication reports an actual capacity error when a complete selected product exceeds those paid delivery limits. Keep the complete original product; choose a suitable complete issued product for the paid offer.

## Buy and recover the original customer intent

Use the existing `merchant_fred_merchant_start` with the publication ID. Its original configured seller/facilitator owns the listener and payment processing.

Call `merchant_fred_prepare` with the same publication, a new stable `intentId`, and the selected advertised `file`. Omitting the file selects the complete `research-package.json.gz`. Research files do not use observation-page query or previous-cursor arguments.

Read the returned original purchase. It contains the exact file descriptor, original edition/plan and `purchaseSha256`. Call `merchant_fred_buy` with that same publication and intent; carry `expectedPurchaseSha256`. This enters the maintained Buyer approval/finality flow under the host's actual configured payment policy. After any interrupted result, use `merchant_fred_recover` on the same intent and digest. A retry keeps the original payment operation and response destination.

A successful result includes the delivered byte count, SHA256 and original resource metadata. Download `kind: "customer"` with `merchant_fred_file_read`, using that publication and intent. Keep its returned `readId` and successive offsets until the exact complete length is received. The native file remains retained; every complete download can also be saved directly with `saveFredFile`.

Use `merchant_fred_merchant_stop` with the original running publication when the owner finishes serving that offer. Receiving and saved project history remain durable after the listener closes.

## Receive and reopen editable customer work

There are two existing-native receiving paths.

For a paid package, call `merchant_fred_research_purchase_receive` with the original publication, intent and required `expectedPurchaseSha256`. An optional absolute `receivingDirectory` selects the original destination; omission retains the native default. Repeating the request reopens the same selected receiving operation.

For an already supplied complete package, configure a host input with `kind: "research-package"`, its absolute original file path and optional exact SHA256. Inspect it with `merchant_fred_input_inspect`. Call `merchant_fred_research_receive` with that configured input alias, its required `expectedSha256`, the stable operation ID/revision and a separate absolute receiving directory. The provider reads the whole original file, checks its configured and selected hashes, and sends strict base64 through the original native action. The 256 MiB package limit includes every byte; the HTTP request allowance accommodates its full base64 encoding.

A host input entry follows the existing configuration form:

```json
{
  "kind": "research-package",
  "path": "/absolute/original-delivery/research-package.json.gz",
  "label": "Original issued research product",
  "sha256": "EXACT_ORIGINAL_64_CHARACTER_SHA256"
}
```

Keep this entry in the existing workspace's `inputs` object under its selected alias. Private startup records and Buyer configuration remain in their original host configuration.

The native receiver retains the package bytes and restores the selected definition/source/review/issued-edition graph in the customer economic project. Reopen that project through the original workspace owner and current private startup record. The customer can continue its own research work and issue a successor edition while preserving the received original.

For a paid receiving, `merchant_fred_research_received` returns `files` or `sources` pages. Its file inventory includes the exact original package and manifest as well as every complete source/readable member. Download these with `kind: "research-received"`, original publication/intent, and the exact advertised `file`; an optional `editionId` keeps the selected received edition explicit.

`kind: "research-publication"` downloads an original offered file directly from the private operator workspace. This is the operator's own retained source route. The customer payment route remains the prepared native Buyer intent.

## Full project and Operating handovers

A project containing Research commerce exports as `stellar-forge.fred-project-bundle.v8`. It includes the full Research graph and a `researchCommerce` extension containing complete original publication packages, plans, customer requests, selected receiving destinations and received package bytes. Every extension member must match its original project record.

A project without Research commerce continues to export the existing version 7 Research bundle. Earlier FRED/DDP/QCEW project versions remain supported. The complete project receiver retains its existing 480 MiB capacity.

The installed client inspector uses the native Research commerce validators before accepting a version 8 file. It checks the complete bundle identity together with the existing source graph. The native receiver restores the original source bytes and customer selections, then re-export can retain the same complete project identity.

Existing Operating handovers carry the same version 8 project as their original project artifact. Their source descriptor adds the complete Research commerce inventory and precise publication/receiving references. Existing research source/review/handover phases include that retained context. The established capture, upload, inspect, receive and open operations continue to own archive transfer; no second plan or archive format is required.

## Installed command interface

The installed `fred-workspace` command exposes the same provider calls and exact request fields. Its original connection file selects the actual running host, input aliases and payment profiles. Read the full command help with `fred-workspace --help`. The complete original Research catalogue, source, review and product commands are available alongside the commerce commands.

For a saved request, put the complete tool argument object in a private JSON file and pass `--args-file`. Additional flags must agree with that object. Keep the same operation ID, revision, selected edition and literal note after interruption.

```sh
fred-workspace research-products --connection /absolute/private-connection.json --workspace macro
fred-workspace research-product --connection /absolute/private-connection.json --workspace macro \
  --product ORIGINAL_PRODUCT_ID --section editions --revision ORIGINAL_REVISION
fred-workspace research-publish --connection /absolute/private-connection.json \
  --args-file /absolute/original-publish-request.json
fred-workspace research-publication --connection /absolute/private-connection.json --workspace macro \
  --publication ORIGINAL_PUBLICATION_SHA --section files
fred-workspace merchant-start --connection /absolute/private-connection.json --workspace macro \
  --publication ORIGINAL_PUBLICATION_SHA
fred-workspace prepare --connection /absolute/private-connection.json --workspace macro \
  --publication ORIGINAL_PUBLICATION_SHA --intent ORIGINAL_INTENT_ID --file research-package.json.gz
fred-workspace buy --connection /absolute/private-connection.json --workspace macro \
  --publication ORIGINAL_PUBLICATION_SHA --intent ORIGINAL_INTENT_ID \
  --purchase-sha ORIGINAL_PREPARED_PURCHASE_SHA
fred-workspace research-purchase-receive --connection /absolute/private-connection.json --workspace macro \
  --publication ORIGINAL_PUBLICATION_SHA --intent ORIGINAL_INTENT_ID \
  --purchase-sha ORIGINAL_PREPARED_PURCHASE_SHA
fred-workspace research-received --connection /absolute/private-connection.json --workspace macro \
  --publication ORIGINAL_PUBLICATION_SHA --intent ORIGINAL_INTENT_ID --section files
fred-workspace download --connection /absolute/private-connection.json --workspace macro \
  --kind research-received --publication ORIGINAL_PUBLICATION_SHA --intent ORIGINAL_INTENT_ID \
  --file EXACT_RECEIVED_PATH --sha256 ORIGINAL_FILE_SHA --out /absolute/new-complete-file
```

Replace each identity and revision with its actual prior response. The prepared response supplies the exact purchase digest. Continue metadata pages with their original revision or view SHA and returned offset. A timed-out paid call uses `recover` with the same publication, intent and purchase SHA.

`research-receive` selects a configured `research-package` input alias, exact original SHA and separate absolute receiving directory. `research-commerce-resume` takes the original publish/receive action, ID and revision. Local `bundle-inspect` and `receive` retain the complete version 8 project path and original SHA; `download --kind project` saves the full workspace.

For catalogue authoring, `--definition-file` supplies the whole entry/product definition; source uploads keep their original alias, hash, filename, media type and optional retrieval time. `--note-file` keeps the complete literal review/publication note. Remote command calls use the existing owner lifecycle and close their borrowed client after the original result or error.

## Installed complete operating course

The distribution command `fred-research-commerce-receive` points to the maintained `research/commerce-journey.mjs`. Select the existing completed economic project, exact issued product and edition, and a separate durable operation directory:

```sh
fred-research-commerce-receive \
  --directory /absolute/original-research-commerce-operation \
  --project /absolute/existing-economic-project \
  --product ORIGINAL_PRODUCT_ID \
  --edition ORIGINAL_ISSUED_EDITION_SHA256 \
  --operation FRED-PAID-RESEARCH-9B2C-20261013
```

The complete course packages the selected actual sources, receives an editable customer project, operates a successor edition and restores/re-exports the complete version 8 source. Its optional existing Buyer, payment, public origin, facilitator and merchant-port selections continue the actual paid programme on the same equipped host. The browser-course and browser-config options join the complete original application operating course and actual installed browser.

Preserve the original operation directory and retained request/result files after interruption. The same command and original arguments continue its journal. Source changes must be composed into the current owner-selected edition before another invocation; an already accepted native process keeps its current source and ownership.

The producing owner opens and uses the exact outgoing application, selected source/readable attachments and editable project. Inspect actual desktop and narrow layouts, loading/empty/error/received states, all important controls, downloads and save/reopen. View the real captured images and normal recipient-facing files. Carry any concrete presentation or functional correction back into the maintained source and continue the original course.
