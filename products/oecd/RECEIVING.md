# Receive the complete OECD economic edition

The product supplies two complete executable programmes. The original source-only programme creates and reopens a revised analyst/customer edition. The configured economic programme continues the same source model through the original native merchant, buyer, accounting, dataset delivery and separate customer workspace.

## Full source-only programme

Use the original completed **oecd** runtime and a private project directory:

~~~sh
starforge oecd-product create \
  --runtime /srv/starforge/runtimes/oecd \
  --project /srv/starforge/projects/oecd \
  --operation oecd-original-briefing-20261013 \
  --python /actual/python3
~~~

That one command runs the original **examples/create-briefing.mjs** from the inspected runtime's own source tree. Its complete operation is:

1. Open or create the selected original private OECD workspace.
2. Retain all fifteen original OECD data/structure responses and their acquisition receipts.
3. Save the seven-country briefing and corresponding native SDMX/Macrobond customer edition.
4. Save a notes-only following project revision for customer handover.
5. Export the native dataset with its source-rights companion and complete revised project ZIP.
6. Start a separate customer workspace and import that revised ZIP through the original importer.
7. Compare every restored report byte, original source row, source snapshot and native edition identity.
8. Print the original artifact paths, full ZIP identity, retained customer directory and actual commands to open both workspaces.

The same command and operation ID recover their retained original results. The source-only programme uses the bundled original responses; a live provider refresh is a separate explicit acquisition operation in the same application.

| Returned field | Native meaning |
| --- | --- |
| capture | Actual retained original data/metadata capture |
| initial | First saved native source project/customer edition and complete report |
| saved | Following editorial revision on that same source project |
| dataset | Original dataset export and separate source-rights companion |
| packet | Complete revised project ZIP path, bytes and SHA-256 |
| reopened | Exact revised briefing imported in the separate customer workspace |
| customerWorkspace | Actual separate workspace directory and ID |
| browser / customerBrowser | The original native Node command and argv for each saved workspace |

The customer project is **PROJECT/reopened-customer-project/**. The full report is under **PROJECT/reports/SAVED_BRIEFING_ID/**, with five files for current report version 2. Open **briefing.html** directly or use the returned actual customer-browser command.

## Complete configured merchant/buyer programme

Retain the equipped operator's existing resources and private configuration. Start from the original [examples/receiving.json](../../stellar/scf-starforge-20261009/sf30-seller-sdk/sdmx/oecd/examples/receiving.json), replacing its explicit template values with actual configured inputs.

| Configuration | Original resource |
| --- | --- |
| id | Stable ASCII native receiving operation, at most 70 characters |
| selection | Original selected countries, report window, title and analyst notes |
| merchant.paymentFile | Existing actual public payment terms accepted by the maintained seller |
| merchant.directory / stateDirectory | Original release and merchant state directories |
| merchant.origin / path / port | Actual configured merchant endpoint and process binding |
| merchant.controlTransport | Original supported process control transport |
| buyer.id / configFile | Original buyer operation and configured account/signer/reservation policy |
| buyer.operatorWorkspace | Existing native operator workspace and ledger |
| buyer.acceptIndex | Exact accepted offer index |
| buyer.maxTotalAtomic | Authorized amount in the actual accepted asset's atomic units |
| buyer.maxPages / maxPageBytes | Explicit selected page count and response-size bounds |

For the retained 231-row seven-country source, page size **150** yields two native data pages. The original template sets **maxPages: 2**. Use the actual accepted terms to set the total atomic spending limit. Preserve any original explicit facilitator selection needed by the maintained merchant.

~~~sh
starforge oecd-product receive \
  --runtime /srv/starforge/runtimes/oecd \
  --project /srv/starforge/projects/oecd \
  --config /srv/starforge/private/oecd-receiving.json \
  --python /actual/python3
~~~

The product first inspects the native READY installation and its exact package manifest. It invokes that installation's original entrypoint with **oecd receive**, so the merchant and buyer use the same installed source and locked dependencies.

The original receiver saves the analyst edition and all report files, materializes the native dataset, prepares and starts the configured merchant, reads its actual offer, and prepares the original buyer selection. It runs or continues that same buyer dataset, drains its native accounting cursor through **Dataset.finalizeAll**, and produces the complete **DatasetDelivery**.

Every delivered original series, monthly period, value, presence, action, dimension and attribute is compared against the retained catalog observations. The complete original project ZIP and reports accompany the delivery. A following editorial revision is saved on the same source project and imported into a separate named customer workspace; its exact reports and rows are compared after reopening. The maintained published Macrobond provider is read through its original methods.

## Continuation and complete results

The original checkpoint is:

~~~text
PROJECT/receiving/OPERATION/receiving.json
~~~

It retains the original configuration and source/payment/buyer identities, release, snapshot, native dataset session, process results and accounting pages. Continue with that same project, configuration and operation. Keep the running buyer attempt with its actual original native session. The original buyer owns payment intents, reservation and accounting.

The complete revised customer workspace is:

~~~text
PROJECT/receiving/OPERATION/reopened-customer-project/
~~~

The actual buyer-delivery directory is returned by the original native result. Its **revised-briefing/** directory retains the full editorial report and complete revised project packet. The original delivery report reopens through **DatasetDelivery.open**, which verifies its retained artifact identities and complete row count.

After an interrupted host session, the equipped original owner resumes the checkpoint and its actual child processes. The complete source-only report and saved customer project remain useful in that same product while native buyer continuation proceeds.

## Source transport and original operation ownership

The application originated in **public-commons-sprint-2026** and was delivered as the complete 290-file source projection **7f50967f05c943c4ae9eb2c02b1c375e147a1cb8**. That original carrier includes the exact fifteen provider responses, revised-project reopening corrections and merged source attribution. This installed product imports the same forty OECD application/contribution files and the three reviewed maintained SDMX compatibility postimages into the current standalone repository.

Use the installed package's source receipt and original runtime transfer when sending this product to another equipped host. Keep the existing F1CB source-only receiving operation and its selected project/operation; the standalone package is the following source edition for that same programme. A configured economic run uses its existing buyer/payment resources.

The receiving owner returns the actual native command/process handle, complete source-only JSON result, saved report/project paths and full configured buyer result to the original SCF product thread. The exact programme above lets that owner execute the whole workflow from the received source, including fresh customer reopening.

## Primary source and attribution

All original sources and access receipts are in [sources/bundle.json](../../stellar/scf-starforge-20261009/sf30-seller-sdk/sdmx/oecd/sources/bundle.json). The retained bundle was read back at **2026-10-12T12:01:14.820Z**. Its publisher XML Prepared field remains a separate timezone-less original field.

Every new report carries the same source acknowledgment in HTML/JSON/CSV and both SOURCE_RIGHTS files. The original customer ZIP carries acknowledgment in its standard ZIP comment; the full OECD project includes both explicit rights files. Distribute the native dataset's returned attribution companion with the unchanged data/configuration/lineage files. [SOURCE_RIGHTS.md](../../stellar/scf-starforge-20261009/sf30-seller-sdk/sdmx/oecd/SOURCE_RIGHTS.md) gives the complete retained citation and downstream acknowledgment requirement.
