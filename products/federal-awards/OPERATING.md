# Operate federal awards and workshares

The complete working record is a private USAspending workspace. Its original award editions, transaction captures, review revisions, source bytes, receiving records and prepared publications stay together in the original SQLite model. The browser and native merchant use that same model; the Applications controller opens the same saved directory.

## Install and open the product

Use the immutable source commit selected for this delivery. The maintained builder packages the **federal-awards** recipe:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout --ref ORIGINAL_COMMIT \
  --selection federal-awards --out /private/federal-awards-release
~~~

Retain the returned archive, archive SHA256 and build receipt. A resumed build uses the same output directory, source commit and selection with `--resume`. Inspect that existing operation with `--out DIRECTORY --status`.

The examples below use the installed `starforge` command. For a first installation, run the original source entry instead:

~~~sh
node /absolute/merchant-checkout/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs --help
~~~

That source entry accepts the same `prepare`, `install`, `inspect` and `run` arguments shown after `starforge runtime-install`:

~~~sh
starforge runtime-install prepare \
  --dir /private/federal-awards-runtime \
  --archive /private/federal-awards-release/RETURNED_ARCHIVE.tgz \
  --sha256 RETURNED_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator
starforge runtime-install install --dir /private/federal-awards-runtime
starforge runtime-install inspect --dir /private/federal-awards-runtime --load --source
starforge runtime-install run --dir /private/federal-awards-runtime -- \
  usaspending-research --help
~~~

Use Node 22.16 or later and the original installer's actual dependency profile. A prepared runtime and the selected package remain paired; original install/resume/status commands preserve that operation. Follow [RUNTIME_INSTALL.md](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) for its retained cache, offline installation and complete transfer options.

Create a private working parent and choose an original research directory. Research directories use mode 0700; connection and exported private files use mode 0600.

~~~sh
starforge usaspending-research init --workspace /private/federal-awards
starforge usaspending-research serve --workspace /private/federal-awards --port 0
~~~

The browser prints an ephemeral loopback URL with its private session token. Open that URL in the operator's browser. Keep the URL with the private operating record. The research directory persists when the server stops; a later session opens the same workspace with a new live process identity.

## Bring in original award records

The browser can save official award queries, run their original pagination, enrich retained awards and select a working edition. Select the correct date semantics, prime-contract award types, agencies, NAICS/PSC and keywords for the research question. The capture retains the request, returned pages, continuation and coverage.

Existing source can be received without repeating its acquisition:

~~~sh
starforge usaspending-research import-detail \
  --workspace /private/federal-awards \
  --file /private/source/award.json --receipt /private/source/award.source.json \
  --name "Original selected award"

starforge usaspending-research import-collection \
  --workspace /private/federal-awards \
  --file /private/source/original-source-collection.json

starforge usaspending-research state --workspace /private/federal-awards
starforge usaspending-research browse \
  --workspace /private/federal-awards --edition EDITION_ID --page 1 --limit 100
~~~

Choose the relevant import for the supplied original files. A collection keeps its original sibling files and hashes; copy the complete source collection when moving it. The result identifies the immutable edition. Select the award's generated `award_key` from that edition, preserving the original recipient and parent-recipient identities.

The award view separates awarding agency from funding agency, original source dates from observation time, and reported monetary fields from analyst notes. Use the source coverage shown beside any count or comparison.

## Capture and review funding actions

Select **Transactions & modifications** in the private browser or use the original award key and edition:

~~~sh
starforge usaspending-research tx-capture \
  --workspace /private/federal-awards \
  --edition EDITION_ID --key ORIGINAL_AWARD_KEY \
  --page-size 250 --max-rows 250000

starforge usaspending-research tx-state --workspace /private/federal-awards
starforge usaspending-research tx-summary \
  --workspace /private/federal-awards --capture CAPTURE_ID
starforge usaspending-research tx-browse \
  --workspace /private/federal-awards --capture CAPTURE_ID --page 1 --limit 100
~~~

The returned capture ID identifies this observation of that award's history. Continue original provider pagination until its terminal page. The workspace commits an accepted response and its normalized rows together. Provider retry timing, accepted pages, interrupted operations and retained row capacity remain visible in the same job and capture controls.

For an interrupted capture, resume that ID. If it reached the selected row capacity, read its current `updated_at`, increase capacity with `tx-capacity --capture ID --max-rows N --updated-at EXACT_TIME`, then use `tx-resume --capture ID`. The original request, pages and continuation remain the operation's inputs.

Already retained transaction pages can be imported with `tx-import --edition ID --key ORIGINAL_AWARD_KEY --file ORIGINAL_PAGES.json`. That file contains the complete native requests, receipts and base64 response bodies defined in [TRANSACTIONS.md](../../stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/TRANSACTIONS.md).

Review chronological funding changes and federal fiscal-year subtotals beside the original agency action descriptions. The analysis preserves negative and zero obligations, unknown monetary values, duplicate occurrences and conflicts. Conflicting source identities remain unresolved until their original records support one interpretation. A later observation can be compared with `tx-compare --before CAPTURE_ID --after LATER_CAPTURE_ID`; coverage accompanies the added, changed and absent records.

## Save the full workshare

Save an assessment after the source capture completes. Include the actual fit, funding change, proposed workshare, deliverables, acceptance, owner, case URL and next action. Statuses are `researching`, `scope_match`, `review_with_owner` and `passed`. The two scope-oriented statuses require fit, proposed workshare, deliverables and acceptance.

A review file can contain:

~~~json
{
  "status": "scope_match",
  "fit": "Describe the specific delivery need supported by this award and the research.",
  "fundingChange": "Explain the original funding actions and their relevance to the proposed work.",
  "proposedWorkshare": "Name the complete implementation or service being offered.",
  "deliverables": "List the working software, editable source, operating materials and handover.",
  "acceptance": "Define the observable customer workflow and delivery completion.",
  "owner": "Relationship or delivery owner",
  "caseUrl": "https://example.com/internal-case",
  "nextAction": "Record the concrete action agreed by the relationship owner.",
  "notes": ""
}
~~~

Save it with the current review revision. The first review uses revision zero:

~~~sh
starforge usaspending-research tx-review \
  --workspace /private/federal-awards --capture CAPTURE_ID \
  --revision 0 --file /private/workshare-review.json

starforge usaspending-research tx-brief \
  --workspace /private/federal-awards --capture CAPTURE_ID \
  --out /private/delivery/workshare.md
~~~

The store binds the saved assessment to the retained source fingerprint and preserves its revision history. Keep commercial price, delivery timing and acceptance grounded in the proposed workshare. The prime award's reported contract values describe the original award.

## Prepare a dossier and complete editable delivery

Receive the selected original award edition into a research dossier using `usaspending-dossier receive`. The original dossier holds the research question, source observations, findings and citations. Its complete portable JSON preserves source blobs and revisions. [DOSSIER.md](../../stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/DOSSIER.md) gives the original create, question, receive, finding, export and reopen commands.

For a full working handover, export the original workspace and transaction capture:

~~~sh
starforge usaspending-research backup \
  --workspace /private/federal-awards --out /private/delivery/complete-workspace.json
starforge usaspending-research tx-export \
  --workspace /private/federal-awards --capture CAPTURE_ID \
  --include-reviews --out /private/delivery/transaction-capture.json
starforge usaspending-research tx-csv \
  --workspace /private/federal-awards --capture CAPTURE_ID \
  --spreadsheet --out /private/delivery/transactions.csv
~~~

The JSON exports retain original receiving information. CSV and Markdown support reading and review. The [receiving guide](RECEIVING.md) follows the actual customer workflow through restoration, source import, dossier reopening and the original native continuations.

## Operate the native merchant

Create an existing private research directory and a mode-0600 connection file. A minimal connection selects that same workspace:

~~~json
{
  "schema": "stellar-forge.usaspending-workspace-connection.v1",
  "workspaces": {
    "federal": {
      "label": "Federal awards and workshares",
      "directory": "/private/federal-awards",
      "operator": "Federal research operator"
    }
  }
}
~~~

Initialize the original merchant configuration:

~~~sh
starforge merchant-mcp init-usaspending-workspaces \
  --dir /private/federal-awards-mcp \
  --connection /private/federal-awards-connection.json \
  --name "Federal awards and workshares"
~~~

Connect the original merchant stdio server to that configuration through its existing MCP instructions. The selected provider is `usa-spending-workspaces`. Call `merchant_usaspending_workspaces`, then `merchant_usaspending_open` for alias `federal`. An open instance returns the original research browser and dossier browser.

The transaction tool family provides inventory, capture, capacity, summary, rows, comparison, review saving and original source access. The existing source-import, job, pause, export and retained-file tools complete the same operation. Page inventories with their returned snapshot and next offset; retain the original export ID and offset through a long file transfer or connection restart.

Connection source kinds `transaction-pages` and `transactions` receive original pages and complete portable captures. The full connection declarations and tool arguments are in [USASPENDING-WORKSPACE.md](../../stellar-forge/mcp-merchant-operator/USASPENDING-WORKSPACE.md).

## Publish a reviewed award dataset when needed

Choose the immutable award edition to publish. The original merchant preparation projects public award fields into an immutable dataset bundle and keeps its source provenance:

~~~sh
starforge usaspending-research merchant-prepare \
  --workspace /private/federal-awards --edition EDITION_ID
starforge usaspending-research merchant-preview --bundle RETURNED_BUNDLE_DIRECTORY
~~~

For the payment-backed service, prepare with the original `--payment PAYMENT.json` and `--origin HTTPS_ORIGIN` together. Serve the retained bundle with `merchant-serve --bundle DIRECTORY` and the selected facilitator settings. The original offer, query, public schema and customer delivery interfaces remain the SF30/SF88/SF100 workflow. Receive an existing finalized customer delivery with `adopt-delivery --directory FINALIZED_DELIVERY_DIRECTORY`.

## Save a managed application

Attach the original READY runtime in the runtime workspace. In **Applications**, select **Federal awards and workshares**, choose the private research folder and optional receiving folder, review the selection, and save it. The shared save action creates approved new private directories. Start review then reopens that selection and launches the source-owned application.

Open the retained application URL. Stop from the same saved application and reopen it to continue the original awards, transactions, assessments and receiving history. The launcher and startup observer verify the same workspace and live process before the URL is retained. The full [application guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/APPLICATION.md) covers the original controller's operations.
