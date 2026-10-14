## Record Mastering: source decisions, customer deliveries and retained-edition comparison

Record Mastering turns overlapping source lists into an explicitly reviewed master dataset and a complete editable handover. A customer can keep the original CRM and billing files, decide which records represent the same entity, resolve individual field values, and deliver a saved edition with its source evidence. The retained-edition comparison answers the next practical question: **what changed between the two lists we actually delivered?**

The current source is the complete 47-file maintained product, adopted into the existing Merchant repository at `7d86cb3153e42951ea98cab837f91c041f4c217e`. It adds comparison to the original Deliveries desk, CLI, typed client and Merchant read tool. The same SQLite workspace owns source activation, decisions and delivery editions; the existing Runtime Applications lifecycle owns its listening process. The [complete source package](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/62b2c75caf7f96ffb255e82176901c9ebe8e4a8d/operations/record-mastering-delivery-comparison-20261014/source.json) contains every maintained product member, including the original example inputs and receiving implementation. Its complete identity is 596,968 bytes, SHA-256 `58be0737d1b833e8aea840d437636efb4e6ead44f0bab6012d13a1e12bf8f630`.

### From original lists to an explicit customer edition

An operator imports the complete CSV bytes and selects the source columns and source key. A refreshed file becomes a retained edition before the operator activates it. Matching groups support explicit merge and split decisions; field choices retain the selected candidate or authored value and its original evidence. Every mutation uses the observed workspace revision and retained request identity.

Text remains text throughout mastering and delivery. Account codes with leading zeroes, long decimal strings, spelling, whitespace and blank values retain their original values. A field chosen from a source can remain chosen after a later source edition if its text is unchanged; the original decision and the current source candidates are both kept. A changed candidate is available for review instead of silently rewriting the saved choice.

A saved delivery selects its fields and either ready-only or all-active membership. It includes the actual delivered rows, omitted-record and unresolved-field counts, original source-edition descriptions and full field provenance. The complete customer package contains `master.csv`, `dataset.json`, `delivery.json`, `conflicts.csv`, `field-provenance.jsonl` and `READING.md`. The original CSV seller can serve the chosen dataset through its existing pricing and payment workflow; mastering itself does not create a purchase or prove settlement.

### Read a change without losing its meaning

The operator selects a Before edition and an After edition. The selected direction is retained; dates do not silently reorder the pair. The comparison reads both immutable editions inside the original SQLite read transaction and produces no revision, decision or native event.

| Customer question | What the comparison preserves |
| --- | --- |
| Which delivered records appeared or disappeared? | Literal stable master IDs and each edition's actual membership. An absent row means absent from that delivery, not proof that an entity was deleted. |
| Did the selected scope change? | Both saved modes, selected columns, delivered and omitted counts, and unresolved-field counts. Ready-only mode can omit a master because of an unresolved field outside the delivered columns. |
| Is a blank value the same as a missing field? | Separate row and column presence. Empty text is a delivered empty string; an absent row or unselected column has no delivered value. |
| Did the field text change? | Exact before and after strings, without number coercion, whitespace cleanup or inferred identity matching. |
| Did its resolution or evidence change? | Independent text, status and provenance flags, with the complete saved decision and current candidate evidence on each side. Equal text can still have changed provenance. |
| What caused a membership difference? | The two retained delivery facts. The original private workspace supplies any further explanation, such as an exclusion, source withdrawal, merge or split. |

Merge and split history matters. A merge can retain one selected master ID and archive another; a split creates a new master ID. The comparison aligns the literal IDs rather than trying to infer continuity from names, normalized values or row positions. Original source-edition arrays retain their full entries; duplicate feed names are not collapsed into a single source.

### A review that remains complete after handover

The Deliveries desk offers the complete scope table, summary, record filter, text search, pagination and original field evidence. Its downloads include every compared record and selected field, even when the current browser filter shows only a subset.

* **Comparison JSON** contains both complete original delivery file sets, their byte identities, both selection descriptions, every compared row and the comparison digest.
* **Readable HTML report** contains the scope, summary, original source editions and all compared records with their field evidence.
* **All-field CSV** contains a row for every compared master and selected field, including presence flags, exact text/status, independent change flags and complete original evidence in JSON cells.
* **Original before and after archives** use the existing customer-package downloads.

CSV consumers should import fields as text. The export preserves original formula-like strings, leading zeroes and long numbers rather than changing customer data for a spreadsheet display.

The saved comparison can reopen in the same workspace or its independently received complete private workspace. The receiver checks the native workspace UUID, both immutable editions, the saved comparison digest and the complete reconstructed result. It does not depend on the sender's absolute folder path, so normal moved-folder receiving remains valid. Later unrelated work cannot change the two saved editions.

The private workspace packet is a different deliverable from a customer dataset archive. It carries the original source bytes, decisions, operations, editions and deliveries needed for independent editing. A customer delivery alone does not supply that private working history. Reopening a comparison does not import or merge it into a different workspace.

### Use the maintained browser, command or agent connection

The installed product selection retains the original Runtime Workspace Applications, source installation, release store and Merchant provider. The operator uses the existing reviewed setup to start, recover and stop the same saved application. The whole product keeps the preceding lifecycle and export-replay repairs: an interrupted export resumes its retained bytes, and an uncertain start is reconciled through its original application/request history before another owner may open the workspace.

The standalone command requires Node 22.16 or newer with `node:sqlite`; the installed Applications profile retains its original Linux, Python and `flock` requirements. Merchant MCP uses the selected original SDK dependencies. A separately supplied private customer archive and runtime configuration remain authorized inputs, outside this public implementation source.

The original command writes complete outputs to new files:

~~~sh
record-mastering compare --workspace /absolute/customer-workspace \
  --before ORIGINAL_BEFORE_ID --after ORIGINAL_AFTER_ID \
  --format json --output /absolute/new-comparison.json

record-mastering compare --workspace /absolute/received-customer \
  --input /absolute/new-comparison.json \
  --format html --output /absolute/new-comparison.html
~~~

Use `--format csv` for the all-field table. Run these through the original installed dispatcher or the maintained `record-mastering/cli.mjs`; use real retained IDs and paths. The source guide documents the exact installed prefix and full setup.

The typed client reads `delivery.compare` with `beforeId` and `afterId`. The existing `merchant_mastering_query` exposes that same read. Optional `workspaceId` and `expectedSha256` bind a saved result. Full results include the original files and complete HTML/CSV, so large outputs belong in the CLI's file output or the Merchant's existing retained-file chunk reader, followed to its final offset and verified against its complete digest.

### Source delivery and current acceptance

The complete source and installed adoption are merged and their full bodies have been read back. Independent reviews covered the original immutable delivery format, comparison semantics, original read transaction, browser lifetime, source-byte verification and moved-folder receiving. A source-level execution read the actual committed fictional delivery package: all six files verified, with 11 records, six fields and 66 provenance rows. Those fictional examples demonstrate structure; they are not customer records or revenue.

**Native installation, SQLite execution of the new comparison, actual browser operation and viewed output acceptance remain with the existing `record-mastering-installed-receiving-9c14-20261013` course. They are not claimed complete by this chapter.** The producing operator must use the exact outgoing product at desktop and narrow widths, inspect populated/loading/error states, operate the comparison controls, and open the full HTML, CSV, JSON and both original archives before recipient-ready presentation. This source contribution adds no parallel receiving job.

The current 47-file edition preserves the preceding complete 44-file public source and its original 40-file ancestry. The historical source below remains selected as a separate record; it is not relabeled as the comparison edition. Existing preparation, migration and source-desk products retain their own scopes and source IDs. This chapter adds a concrete record-review and repeat-delivery workflow to the established product foundation without changing the original application answers or funded plan.

### Complete selected source

The declaration `grant-products/record-mastering.json` selects all 47 maintained product members below, the exact installed adoption, the complete public source package and its preceding lineage. These are full immutable files. Shared installation/runtime dependencies remain those selected by the original product recipe; the 47-file bank is the complete product contribution, not a replacement for every shared Merchant application file.

| Original selected file | Retained role |
| --- | --- |
| [stellar/scf-starforge-20261009/distribution/selections/record-mastering-workspace.json](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/distribution/selections/record-mastering-workspace.json) | selections/record-mastering-workspace.json |
| [stellar/scf-starforge-20261009/distribution/contributions/record-mastering.json](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/distribution/contributions/record-mastering.json) | contributions/record-mastering.json |
| [stellar/scf-starforge-20261009/distribution/contributions/record-mastering-workspace.json](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/distribution/contributions/record-mastering-workspace.json) | contributions/record-mastering-workspace.json |
| [products/record-mastering/receiving/README.md](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/products/record-mastering/receiving/README.md) | receiving/README.md |
| [products/record-mastering/OPERATING.md](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/products/record-mastering/OPERATING.md) | OPERATING.md |
| [products/record-mastering/cli.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/products/record-mastering/cli.mjs) | cli.mjs |
| [products/record-mastering/workspace.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/products/record-mastering/workspace.mjs) | workspace.mjs |
| [products/record-mastering/receiving/installed-receiving.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/products/record-mastering/receiving/installed-receiving.mjs) | receiving/installed-receiving.mjs |
| [products/record-mastering/receiving/preparation.example.json](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/products/record-mastering/receiving/preparation.example.json) | receiving/preparation.example.json |
| [products/record-mastering/receiving/prepare-installed.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/products/record-mastering/receiving/prepare-installed.mjs) | receiving/prepare-installed.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/EXERCISE.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/EXERCISE.mjs) | EXERCISE.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/LICENSE](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/LICENSE) | LICENSE |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/README.md](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/README.md) | README.md |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/application-provider.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/application-provider.mjs) | application-provider.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/application.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/application.mjs) | application.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/browser-assets.json](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/browser-assets.json) | browser-assets.json |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/cli.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/cli.mjs) | cli.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/client.d.mts](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/client.d.mts) | client.d.mts |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/client.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/client.mjs) | client.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/core.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/core.mjs) | core.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/csv.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/csv.mjs) | csv.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/example-workspace.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/example-workspace.mjs) | example-workspace.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/launch-example.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/launch-example.mjs) | launch-example.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/mcp-tools.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/mcp-tools.mjs) | mcp-tools.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/mcp.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/mcp.mjs) | mcp.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/merchant-provider.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/merchant-provider.mjs) | merchant-provider.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/package.json](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/package.json) | package.json |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/packet-reader.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/packet-reader.mjs) | packet-reader.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/portable.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/portable.mjs) | portable.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/projection.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/projection.mjs) | projection.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/schema.sql](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/schema.sql) | schema.sql |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/server.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/server.mjs) | server.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/example/EXAMPLE.md](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/example/EXAMPLE.md) | example/EXAMPLE.md |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/example/billing-corrections.csv](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/example/billing-corrections.csv) | example/billing-corrections.csv |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/example/billing.csv](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/example/billing.csv) | example/billing.csv |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/example/crm.csv](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/example/crm.csv) | example/crm.csv |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/example/customer-delivery.gz](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/example/customer-delivery.gz) | example/customer-delivery.gz |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/ui/app.js](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/ui/app.js) | ui/app.js |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/ui/index.html](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/ui/index.html) | ui/index.html |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/ui/style.css](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/ui/style.css) | ui/style.css |
| [products/record-mastering/receiving/application-lifetime.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/products/record-mastering/receiving/application-lifetime.mjs) | receiving/application-lifetime.mjs |
| [products/record-mastering/PACKAGE_README.md](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/products/record-mastering/PACKAGE_README.md) | PACKAGE_README.md |
| [products/record-mastering/AGENTS.md](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/products/record-mastering/AGENTS.md) | AGENTS.md |
| [products/record-mastering/PUBLIC_SOURCE.json](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/products/record-mastering/PUBLIC_SOURCE.json) | PUBLIC_SOURCE.json |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/delivery-comparison.mjs](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/delivery-comparison.mjs) | delivery-comparison.mjs |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/ui/delivery-comparison.js](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/ui/delivery-comparison.js) | ui/delivery-comparison.js |
| [stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/DELIVERY_COMPARISON.md](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/stellar/scf-starforge-20261009/sf30-seller-sdk/record-mastering/DELIVERY_COMPARISON.md) | DELIVERY_COMPARISON.md |
| [products/record-mastering/SOURCE_ADOPTION.json](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/7d86cb3153e42951ea98cab837f91c041f4c217e/products/record-mastering/SOURCE_ADOPTION.json) | Exact installed adoption of the complete public 47-file edition |
| [operations/record-mastering-delivery-comparison-20261014/source.json](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/62b2c75caf7f96ffb255e82176901c9ebe8e4a8d/operations/record-mastering-delivery-comparison-20261014/source.json) | Complete 47-file original product and comparison source |
| [products/record-mastering/PUBLIC_SOURCE.json](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/8332857124fc0fd2b8b4409be9ee83ee3fb163f7/products/record-mastering/PUBLIC_SOURCE.json) | Retained preceding 44-file source and original 40-file lineage |

### Receive this chapter through the existing application composer

Use this complete H2 and its matched declaration with the existing canonical manuscript and the complete current declaration set. The original product source receiver selects the immutable links above, carries the whole chapter into the existing companion, and adds this product's source IDs while retaining unrelated records and financial content. The cumulative publisher owns the current application source, saved draft and reviewer delivery.

Generated application manuscripts and commercial source packages remain in that existing internal delivery course. This file is the generic technical product chapter and its source selection. Preserve earlier application editions and issued receiving operations; adoption of this new source is a deliberate later edition.
