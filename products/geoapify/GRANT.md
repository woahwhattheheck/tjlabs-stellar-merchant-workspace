## Geoapify address review and independent customer delivery

### Customer value and adoption route

A data customer needs a complete path from its original address records to a reviewed, transferable dataset. The source identity, competing geocoding candidates, coordinate decisions and interrupted provider jobs must remain available when another operator reopens the work. This implementation adds that path to the existing merchant product, using Geoapify's documented batch service and the original Stellar SF30 publisher, release and buyer engines.

Geoapify already provides an API and an MCP server. This customer arm adds retained source operations and handover around that existing capability: one original customer source and authorized provider account, explicit candidate review, an immutable data edition, a merchant destination and an independent customer receiving workspace. The proposed installation workshare is $4800 for40hours over10business days, with one source format/edition, one authorized account and one receiving customer. Its complete scope, source qualification, payer/owner selections and receiving course are in the [customer onboarding plan](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/a8af7ba7f8f2c03ff6fac732b867c0b58a07b3f7/products/geoapify/CUSTOMER_ONBOARDING.md).

The existing source-qualified pilot/customer plan remains authoritative for its already owned company relationships. This additional provider arm uses the same merchant/payer/source-owner/buyer selections and the application's six work packages. It does not change the proposed $38000/400-hour/150-day grant schedule or count an internal installation as independent customer adoption.

### Original source and provider operation

The [complete operator](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/a8af7ba7f8f2c03ff6fac732b867c0b58a07b3f7/stellar/scf-starforge-20261009/sf30-seller-sdk/geoapify/README.md) imports original CSV or JSON records with explicit address, identity and coordinate mapping. It retains original bytes and all source ordinals, including repeated business identities and unusable address records. Identical address parameters share a provider query without merging their separate customer records. The original JSON parser preserves numeric identifier lexemes.

Prepared jobs retain the exact endpoint, body, priority, candidate limit, geographic options and source query IDs. The generic batch API preserves those caller IDs and complete per-input FeatureCollections. The operator handles immediate200 completion and202 pending jobs, saves its original sending state before the provider call, and resumes the returned job instead of repeating an uncertain POST. Explicit polls obey the original job clock and returned provider retry floor. The actual returned response, partial/missing/duplicate identities, errors, original byte identity and any removed credential-bearing URL fields remain in retained history.

The provider normally retains completed results for24hours; the local workspace retains them for customer operation and reopening. Both submission and polling consume provider calls, so the browser exposes one deliberate poll and its next allowed time. The implementation's [source/identity module](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/a8af7ba7f8f2c03ff6fac732b867c0b58a07b3f7/stellar/scf-starforge-20261009/sf30-seller-sdk/geoapify/source.mjs) and [durable workspace](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/a8af7ba7f8f2c03ff6fac732b867c0b58a07b3f7/stellar/scf-starforge-20261009/sf30-seller-sdk/geoapify/workspace.mjs) contain this complete lifecycle.

### Human review and frozen customer data

The reviewer opens every original linked row and complete provider candidate. Confidence, address result level, match type, geometry, property coordinates and underlying-source attribution remain separate. Original coordinate pairs and displacement are shown for each original business row. No provider score automatically approves an address.

An accepted candidate records the actual response and feature identities, reviewer, reason and coordinate policy. The operator can preserve each original coordinate pair, use the selected provider pair, or fill an unusable original pair. Keeping the original source is also an explicit retained decision. Later results cannot silently apply an earlier candidate approval.

The browser preserves unfinished address-operation forms and source-bound decision drafts, including the selected job/request and query/response. A native editor save includes those forms in the complete workspace package. Paging and failed reads preserve the last displayed source selection; reopening a saved query restores its actual current context.

A completed edition uses the existing typed SF30 dataset and snapshot engine. It freezes CSV/config, complete GeoJSON, complete candidate-review JSON, an offline HTML report and its original decision basis. All original rows or the explicitly reviewed subset can be selected; review status and missing geometry stay visible. Original, provider and selected coordinates remain different fields. Each edition retains source attribution and the returned licence/URL fields.

### Original merchant and customer handover

The selected edition is exported with its original source, exact file identities, query, complete workspace and optional validated merchant offer. The original publisher prepares that same dataset, stages/selects/runs the seller release, publishes retained versions and reads the actual customer offer. The original buyer workspace retains the selected request, account, payment terms and acquisition limits. These operations reuse the established payment, versioning and recovery engines.

The [installed product selection](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/a8af7ba7f8f2c03ff6fac732b867c0b58a07b3f7/stellar/scf-starforge-20261009/distribution/selections/geoapify.json) carries the complete source/UI, CLI, typed interface, merchant tools, publisher, release/customer dependencies and operating guides. Its [native merchant guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/a8af7ba7f8f2c03ff6fac732b867c0b58a07b3f7/stellar-forge/mcp-merchant-operator/GEOAPIFY_WORKSPACES.md) exposes17 tool families on the same private operator and writer, including declared source imports, original jobs, candidate decisions, complete chunked downloads, publisher/customer continuation and the borrowed browser. Closing a borrowed browser preserves the original agent-owned workspace.

The complete address package reopens original source, job IDs, candidate results, decisions, working forms and native editions. It validates retained bytes/hashes, reparses the original input to check the source mapping and verifies native dataset snapshots. Seller and buyer workspaces retain their own commercial deployment identity and original backup process.

### Grant work and actual receiving

This arm supplies a concrete source/account/customer implementation for the existing merchant integration, authority/handover, provider/ledger and production recovery work. Commissioned customer installation and grant work are allocated once under the original budget/capacity rules. The proposed paid workshare commissions the customer's actual source/account/host configuration and independent handover.

The original receiving operation must use the exact installed source, actual authorized Geoapify account and selected complete customer input. Its course is original intake → exact job and returned result → all candidate/coordinate review → unfinished-draft reopen → immutable edition and native query → complete report/data inspection → original publisher/customer acquisition → independent complete workspace reopen. The producing peer inspects actual desktop and narrow screens, important controls, returned files and every outgoing attachment. The source chapter and technical publication stay linked to that same course as actual native results return.

### Primary provider contract

- [Generic batch API](https://apidocs.geoapify.com/docs/batch): caller IDs, full per-input results, maximum1000 inputs, retained job continuation and24-hour completed-result lifetime.
- [Batch OpenAPI3.1 / API1.1.1](https://apidocs.geoapify.com/assets/openapi/specs/batch/batch-api-openapi-specs.json): x-api-key authentication, priority, exact paths and response shapes.
- [Forward geocoding](https://apidocs.geoapify.com/docs/geocoding/): original parameters, confidence, match level, coordinates and datasource meaning.
- [Provider terms](https://www.geoapify.com/terms-and-conditions/): account access, underlying-source attribution and intended redistribution.
