# County report publication and customer receiving

The saved economic project can sell a complete QCEW county report through the maintained Stellar Forge merchant and Buyer. The same workspace produces the report, publishes its original files, prepares the customer request and opens the delivered package.

A publication selects one saved county report and its complete predecessor chain. The default resource, **report-package.json.gz**, contains every report edition in that chain, each original manifest, and every original report member. Customers can reopen the current report, inspect an earlier edition and download its original files independently of the merchant.

The current report's HTML, PDF when produced, complete JSON, calculated CSV, source-row CSV, methodology and comparison files are also available as individual paid resources. The original publication lists the exact resources, byte lengths, content types and SHA256 values before the customer prepares a request.

## Operate the installed workspace

Use the existing FRED application in Applications, or start the same saved project with its configured Buyer and facilitator:

~~~sh
starforge fred serve \
  --project /absolute/economic-project \
  --buyer-config /absolute/private/buyer.json \
  --facilitator https://your-configured-facilitator.example \
  --merchant-port 8091
~~~

The command prints the private workspace URL. Open that complete URL in the operator browser. Route the merchant's public HTTPS origin to the selected merchant port through the installation's existing reverse proxy. The workspace and seller have separate listeners; the private workspace URL remains the operator entry.

An original local facilitator can be selected with its http://127.0.0.1 address and the existing **--allow-local-facilitator** option. Use the installation's actual facilitator and Buyer configuration. The Buyer keeps its original review, approval, attempt and settlement behaviour.

### Publish a saved report

1. Open **County reports**, choose the original saved report and review its files, source availability and predecessor comparison.
2. Choose **Publish selected report** to carry that exact edition into the merchant form. The same form is available under **Merchant** by selecting **Complete county report**.
3. Enter the public HTTPS origin, resource path and the merchant's public payment terms. Payment uses the installed scheme, network, token contract, atomic amount, recipient and timeout.
4. Choose **Publish selected edition**. The operation retains its edition, public terms, complete package and original file inventory in the saved project.
5. Open the retained publication and choose **Start original seller**. The merchant status shows the selected publication and its actual listener.

The payment terms apply to each advertised resource. A complete-package purchase includes the entire selected report chain; buying an individual file purchases that exact file. Choose the complete package when the customer needs reports, predecessor comparisons and offline receiving together.

County publication uses the same durable browser operation journal as source production and receiving. If the browser loses a response, choose **Continue saved county publication**. It resumes the same selected edition and terms. The saved report and publication IDs remain available in project history.

Each distinct edition or set of public terms has its own publication ID. Publishing an already retained selection opens the same original merchant files. The previously retained compressed package is reused when the publisher restarts.

### Buy and receive a report

1. Open **Customer** and select the retained county publication.
2. Keep the default complete report package, or choose one exact original file. Review the stable intent and payment alternative.
3. Choose **Prepare this request**. The workspace displays the original URL, expected public terms and expected file identity.
4. Choose **Review and execute original purchase** and complete the configured Buyer's existing approval interaction. The original SF88 operation retains the native attempt and delivered bytes.
5. Choose **Reopen original result** after a lost response or restart. It recovers the same native operation and file.
6. For a complete-package purchase, select an absolute customer receiving directory and choose **Receive or continue original report**.
7. Use **Received report edition** to inspect the current report or an original predecessor. Download the complete package again or any original member shown for that edition.

The customer receiving directory is saved with the same purchase before receiving starts. Repeating the operation continues that destination. The original report package is retained atomically and each report file is reconstructed and checked against the saved manifest. A process interruption can be continued with the same intent and directory.

Saved requests restore the original resource and receiving selection. **New request** creates a new intent for another purchase. The original result remains attached to its original request.

A separately downloaded complete package can be received on another host using the installed commands below. That recipient does not need the seller's project directory or the seller's source-acquisition credentials.

## Installed command workflow

The examples use absolute paths and names chosen for one operator session. Read the actual project revision and edition IDs from the existing project before issuing publication:

~~~sh
starforge fred qcew show --project /absolute/economic-project
starforge fred qcew edition --project /absolute/economic-project --verify-sources
~~~

Save the installation's public payment object in **/absolute/public-payment.json**. It is the same public object accepted by the existing seller definition: scheme, network, asset, amount, payTo and maxTimeoutSeconds. Supply its actual values from the configured merchant.

~~~sh
starforge fred qcew publish \
  --project /absolute/economic-project \
  --id county-publish-2026-q1 \
  --expected-revision CURRENT_REVISION \
  --edition ORIGINAL_EDITION_SHA256 \
  --origin https://your-merchant.example \
  --path /county-reports \
  --payment /absolute/public-payment.json

starforge fred qcew publication \
  --project /absolute/economic-project \
  --publication ORIGINAL_PUBLICATION_SHA256
~~~

Retain the returned publication ID. The publication output contains the complete plan, offers, report identity and saved customer requests.

Run the original native merchant in its foreground process:

~~~sh
starforge fred qcew merchant \
  --project /absolute/economic-project \
  --publication ORIGINAL_PUBLICATION_SHA256 \
  --port 8091 \
  --facilitator https://your-configured-facilitator.example
~~~

SIGINT or SIGTERM drains and closes the listener. Merchant files and prepared requests remain in the saved project.

Prepare and execute the complete-package purchase through the configured original Buyer:

~~~sh
starforge fred qcew prepare \
  --project /absolute/economic-project \
  --publication ORIGINAL_PUBLICATION_SHA256 \
  --intent county-customer-2026-q1

starforge fred qcew buy \
  --project /absolute/economic-project \
  --publication ORIGINAL_PUBLICATION_SHA256 \
  --intent county-customer-2026-q1 \
  --buyer-config /absolute/private/buyer.json

starforge fred qcew recover \
  --project /absolute/economic-project \
  --publication ORIGINAL_PUBLICATION_SHA256 \
  --intent county-customer-2026-q1 \
  --buyer-config /absolute/private/buyer.json

starforge fred qcew receive-purchase \
  --project /absolute/economic-project \
  --publication ORIGINAL_PUBLICATION_SHA256 \
  --intent county-customer-2026-q1 \
  --buyer-config /absolute/private/buyer.json \
  --receiving-directory /absolute/customer/county-2026-q1
~~~

Continue the original receiving by running **receive-purchase** again with the same intent and Buyer. The receiving-directory option can be omitted after its original selection is saved.

For an individual file, prepare another intent with **--file report.pdf**, **--file data.csv** or an exact member listed in the original plan. Use the same buy, recover and delivery commands for that intent.

Export the original paid bytes:

~~~sh
starforge fred qcew delivery \
  --project /absolute/economic-project \
  --publication ORIGINAL_PUBLICATION_SHA256 \
  --intent county-customer-2026-q1 \
  --buyer-config /absolute/private/buyer.json \
  --out /absolute/delivery/report-package.json.gz
~~~

Open a downloaded package independently:

~~~sh
starforge fred qcew receive-report \
  --directory /absolute/customer/received-county-report \
  --source /absolute/delivery/report-package.json.gz

starforge fred qcew received-report \
  --directory /absolute/customer/received-county-report

starforge fred qcew received-file \
  --directory /absolute/customer/received-county-report \
  --file report.html \
  --out /absolute/customer/exports/report.html

starforge fred qcew received-file \
  --directory /absolute/customer/received-county-report \
  --edition ORIGINAL_PREDECESSOR_EDITION_SHA256 \
  --file data.csv \
  --out /absolute/customer/exports/previous-data.csv
~~~

Omit **--file** from **received-file** to export the original complete package. CLI export destinations are create-only. Reopen an existing retained export directly or choose a new destination for a new export.

## Complete project handover

The existing complete FRED project export includes county sources, profiles, report files, original predecessor relationships and retained county publications. Each publication includes its original merchant plan, exact compressed report package and complete saved customer requests. Prepared intents retain their original configuration and purchase identity; a selected customer receiving directory retains its original package binding and selection time.

~~~sh
starforge fred qcew export \
  --project /absolute/economic-project \
  --out /absolute/handover/economic-project.json

starforge fred qcew receive \
  --project /absolute/receiving/economic-project \
  --source /absolute/handover/economic-project.json
~~~

The receiving project reconstructs each county merchant using the retained compressed bytes and original public terms, then restores its original prepared requests and receiving selections. In the Customer desk, choose the saved publication and original request. Review its unchanged intent, expected payment and exact report file, then recover that request using the original configured Buyer. The saved receiving selection reopens the full report and every predecessor when that customer directory remains available.

The project can be received into a different project directory. Its original prepared request, configuration digest and purchase digest stay unchanged. Preparing that same intent again returns the retained request. The original prepared response destination remains part of that request's source identity; SF88 continues to own the actual response file in its original operation directory.

Buyer operation directories remain part of the configured Buyer's own storage. On the same host, reopen the received project with that same Buyer store to recover completed or pending requests. When transferring the operation to another operator host, receive the Buyer's original store through its existing backup procedures and retain the customer's saved receiving directory at its original absolute path. To inspect a report at another customer directory, use the standalone **receive-report** command with the original downloaded package. The existing purchase continues to identify its original selected receiving directory.

Prepared requests are also retained before a Buyer operation starts. After receiving the project, **recover** reports that original request as prepared and not started; the operator can continue it through the existing review and buy commands. Project receiving itself restores the requests and their selected paths. It does not execute the Buyer or write the customer's external report directory.

The complete handover validates every saved purchase against the reconstructed original merchant offer, including its report, source, payment selection, configuration digest and expected bytes. Each receiving selection must belong to its original full-package purchase. Duplicate intent records and conflicting retained requests are rejected before any customer records are written. An interrupted receiving operation can continue the same complete bundle.

Projects without county publications retain QCEW extension v1. New exports with publications use extension v3, carrying the complete customer state inside the existing FRED project envelope. Original publication-only extension v2 bundles still receive successfully; they contain the publication and report bytes recorded by that earlier format. The envelope preserves its original version and all other economic source, release, briefing and DDP content.

## Original files and capacity

| Resource | Contents |
| --- | --- |
| report-package.json.gz | Entire selected report and every original predecessor, including complete manifests and files |
| manifest.json | Current report manifest and exact original member descriptors |
| report.html | Complete offline current report |
| report.pdf | Original generated PDF when the report contains one |
| report.json | Complete original calculated report model |
| data.csv | Complete calculated report rows |
| source-rows.csv | Original source rows selected into the report |
| methodology.md | Original calculation and source methodology |
| changes.json / changes.csv | Original comparison to the saved predecessor when present |

The underlying native asset seller supports a maximum of 16 MiB per paid file and 64 MiB for a publication's complete resource inventory. The report-package reader supports at most 256 MiB of decompressed JSON. Publication checks the complete original files against those capacities and reports the actual capacity error if exceeded.

The paid report package retains the report's full original files and source references. The complete source archives and sealed source captures remain in the complete project handover. The source-production guide describes their acquisition and historical coverage.

## Programme integration

The original-data **native-journey.mjs** creates the full saved county project from the complete retained source intake and CPI capture. **workspace-journey.mjs** opens those complete editions, downloads original report and source files, traverses history and comparisons, and receives the full project through the browser.

**merchant-journey.mjs** continues that same native directory using the installation's actual testnet merchant and Buyer. It selects the last actual native report and follows its entire predecessor chain. Supply the existing public HTTPS proxy origin, public payment JSON, private Buyer configuration, facilitator, fixed merchant port, Chromium and Playwright module:

~~~sh
node fred/qcew/merchant-journey.mjs \
  --directory /absolute/original-operation/native \
  --chromium /absolute/installed/chromium \
  --playwright-module /absolute/installed/playwright/index.js \
  --buyer-config /absolute/private/buyer.json \
  --payment /absolute/public-payment.json \
  --origin https://your-merchant.example \
  --path /county-reports \
  --facilitator https://your-configured-facilitator.example \
  --merchant-port 8091 \
  --accept-index 0
~~~

Run the command from the installed seller source directory or use the complete absolute programme path. The existing local facilitator option is **--allow-local-facilitator**. The supplied payment JSON must name **stellar:testnet**; the configured native Buyer retains its original approval and signing behaviour.

The programme operates the real Merchant publication and Customer preparation, purchase, recovery and receiving controls. It purchases every current advertised resource once, including the complete gzip, and preserves each original Buyer result and downloaded bytes. It withholds the actual complete-package purchase response from the browser, starts a new private workspace origin and browser profile, and recovers that same native intent. It repeats that receiving recovery with the original customer destination.

Every predecessor and current report member is reopened and downloaded. A separate report recipient receives the purchased gzip through the maintained package receiver. The programme then exports the complete outer-v6 economic project through the browser, receives it into its original selected project destination, and reopens the exact merchant plan, original gzip and report files there.

All public terms, publication selections, payment intents and receiving destinations are selected durably before their browser dispatches. A repeated invocation reads those original selections and existing Buyer operations. One rejected payment-alternative preparation also exercises reopening the original request catalogue after a preparation directory was created.

Outputs remain under **native/merchant-workspace**: **journey.json**, **merchant-result.json**, the public payment file, complete native Buyer result records, purchased downloads, all received report members, desktop and phone screenshots, the independent report receiver, and the complete project transfer. The journal records the original launch binding and Buyer settings SHA256; the private Buyer configuration remains in its existing installation.

The original **run_native.py** controller accepts a complete **--merchant-packet** and its **--merchant-packet-sha256** plus these launch options. The default command runs source acquisition, report production, browser receiving and then the paid continuation. **--paid-only** appends the paid phase to the same already-completed native and browser operation. The controller retains its original packet and source, stages the complete paid source separately, and preserves the whole operation archive after completion or interruption.

The programme completes that handover with the original prepared and completed requests and their selected receiving records. It prepares one additional original intent without starting its Buyer operation, saves the full customer inventory in **original-customer-inventory.json**, and includes that inventory in the complete project export. After receiving the project at a different directory, it reopens the pending intent and completed package purchase using the original configured Buyer store. It reuses the pending request's exact original preparation, reopens the saved customer receiving directory, and downloads every predecessor file into **relocated-customer-downloads**. The customer inventory and original request/configuration hashes remain identical after relocation; a partial receiving continuation completes only the same exact inventory.

This continuation uses the original source/report operation before its first paid project export. If an earlier programme has already completed a publication-only v2 handover, preserve that programme's saved **complete-paid-project.json**, original receiving destination and versioned source. Use the maintained project export and receive commands above to produce a new v3 handover from the saved source project and receive it into a new directory. The native programme's existing export is immutable; replacing its completed v2 export would change that original operation.

## Module interface

The installed **./seller/fred/qcew** entry exports publication, purchase and report receiving with TypeScript declarations:

- publishQcewEdition and selectQcewPublication operate the existing saved project.
- prepareQcewMerchant, readQcewMerchant and startQcewMerchant operate the retained native seller.
- prepareQcewPurchase, executeQcewPurchase, recoverQcewPurchase and exportQcewPurchase use the original SF88 Buyer.
- receiveQcewPurchase, readQcewPurchaseReceiving and exportQcewPurchaseReceiving operate a purchase's original receiving selection.
- createQcewReportDelivery, encodeQcewReportDelivery and decodeQcewReportDelivery represent the complete original report chain.
- receiveQcewReportDelivery, readQcewReportReceiving and exportQcewReportReceiving open a downloaded complete package independently.

See **index.d.mts** for complete argument and result types, **WORKSPACE.md** for source production and browser recovery, and **README.md** for original QCEW calculations and intake.
