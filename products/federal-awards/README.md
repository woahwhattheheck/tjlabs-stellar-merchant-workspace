# Federal awards and workshares

This product turns original federal award records and funding actions into a saved research workspace, a complete prime workshare, and a portable customer dossier. The operator browser, native merchant tools and managed application share the same private workspace. Original source pages, award editions, transaction history and assessment revisions remain available when another operator receives and reopens the work.

## Complete a workshare

1. Import retained original award records, or save and run an official USAspending query.
2. Select the prime award and inspect the original recipient, awarding agency, funding agency, dates and separately reported monetary fields.
3. Capture the award's transaction history. Review modification numbers, chronological funding changes and federal fiscal-year totals against each action's original source page.
4. Save the proposed workshare, deliverables, acceptance, relationship owner and next action against the completed source capture.
5. Export the complete private workspace and workshare brief, or receive the original award edition into a dossier with its question, findings and source citations.
6. Reopen the delivered workspace through the same browser, native merchant connection or saved Applications entry. When a reviewed award dataset is part of the service, prepare and operate it through the original SF30 merchant and receive its finalized customer delivery.

The original [USAspending transaction contract](https://github.com/fedspendingtransparency/usaspending-api/blob/master/usaspending_api/api_contracts/contracts/v2/transactions.md) supplies the provider fields and pagination. Source amounts retain their exact decimal values. Award obligations, transaction obligations, exercised contract value, all-options value and outlays remain distinct throughout analysis and delivery.

## Publish and receive a funding report

Choose **Funding reports** in the original browser to turn a completed transaction history and saved assessment into a full report. Review its public narrative, exact funding totals, chronology and any comparison, then publish the selected edition. Its original SF30 file-product merchant and SF88 buyer carry the complete report, source pages and editable receiving. The [funding-report guide](FUNDING_REPORTS.md) covers the complete browser, CLI, native tools, merchant, customer and recovery workflow.

## Install the selected product

The maintained distribution selection is **federal-awards**. Build it from one immutable commit of this repository:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout --ref ORIGINAL_COMMIT \
  --selection federal-awards --out /private/federal-awards-release
~~~

The original build receipt identifies the package archive and its SHA256. Use those returned values with the maintained installer:

~~~sh
starforge runtime-install prepare \
  --dir /private/federal-awards-runtime \
  --archive /private/federal-awards-release/RETURNED_ARCHIVE.tgz \
  --sha256 RETURNED_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

starforge runtime-install install --dir /private/federal-awards-runtime
starforge runtime-install inspect --dir /private/federal-awards-runtime --load --source
~~~

Use Linux and Node 22.16 or later, the original Git checkout, and the toolchain required by the selected runtime dependencies. The [operating guide](OPERATING.md) covers first installation, the source command before an installed `starforge` is available, private workspace setup, the complete analyst workflow and native merchant operation. The [receiving guide](RECEIVING.md) covers complete editable handover and the original native receiving programs.

## Open the saved work

From the installed product:

~~~sh
starforge usaspending-research init --workspace /private/federal-awards
starforge usaspending-research serve --workspace /private/federal-awards --port 0
~~~

Open the returned private browser URL. Use **Transactions & modifications** or an award's **Research transaction history** action to work from its original edition.

For managed operation, attach the READY runtime in the original runtime workspace, open **Applications**, and select **Federal awards and workshares**. Save the private research folder and optional customer delivery folder, then use its reviewed start, open, stop and reopen actions. The [application guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/APPLICATION.md) describes the full source-owned launcher and saved application lifecycle.

## Product interfaces

| Interface | Original entry |
| --- | --- |
| Award and transaction browser, source acquisition, workshares and workspace receiving | `starforge usaspending-research` |
| Source-bound dossier authoring and original edition recovery | `starforge usaspending-dossier`, `starforge research-dossiers`, `starforge research-workspace` |
| Standalone and managed private application | `starforge usaspending-application`; Applications provider `usaspending` |
| Native merchant research, transaction operations, complete export transfer and customer receiving | Provider `usa-spending-workspaces`; `merchant_usaspending_*` tools |
| Dataset service preparation and original customer delivery adoption | `usaspending-research merchant-prepare`, `merchant-preview`, `merchant-serve`, `adopt-delivery` |
| Original source package, dependency profile, runtime and recovery | `runtime-profile`, `runtime-install`, `runtime-workspace`, `runtime-transfer` |

The product includes its original source, browser assets, source-owned provider registrations, native receiving programs and operating guides. The committed selection travels in the package manifest and through installation and recovery.

## Detailed guides

- [Complete funding report and customer delivery](FUNDING_REPORTS.md)
- [Operating the complete product](OPERATING.md)
- [Receiving and reopening the work](RECEIVING.md)
- [Award transactions and modifications](../../stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/TRANSACTIONS.md)
- [Original award research and merchant delivery](../../stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/README.md)
- [Research dossier receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/DOSSIER.md)
- [Native merchant tools](../../stellar-forge/mcp-merchant-operator/USASPENDING-WORKSPACE.md)
- [Source selections and resumable builds](../../stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md)
