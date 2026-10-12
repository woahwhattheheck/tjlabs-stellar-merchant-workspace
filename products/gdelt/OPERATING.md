# GDELT article and event desk — installed product

The `gdelt-events` source selection packages the complete original GDELT application: Events and Mentions, GKG article research, reviewed merchant datasets, native agent access, complete customer files, and portable project receiving. It uses the maintained Starforge source builder, runtime installer and Applications workspace.

The application and all 32 files under `sf30-seller-sdk/gdelt/` retain the source identities from [the merged GKG product, PR2084](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/2084). [SOURCE_ADOPTION.json](SOURCE_ADOPTION.json) identifies every original file and the local protocol example dependency. The product's complete source/API guide is [GDELT article and event desk](../../stellar/scf-starforge-20261009/sf30-seller-sdk/gdelt/README.md); [RECEIVING.md](RECEIVING.md) carries installation, offline transfer, original customer files and upgrades together.

## What the selected product includes

| Surface | Installed entry |
| --- | --- |
| Browser application | **GDELT article and event desk**, application provider `gdelt-events` |
| Operator and customer CLI | `starforge gdelt` |
| Native merchant agent | Provider `gdelt-workspaces`, tools named `merchant_gdelt_*` |
| Complete row acquisition | Original SF88 Dataset, native page intents, budgets, accounting and recovery |
| Delivered files | Original SF100 CSV, typed JSONL, review HTML, manifest and published semantics |
| Original sources | SHA-bound source-file chunks, full capture/review/schema files and offline reconstruction |
| Project transfer | Full original captures, reviews, source operations and publication snapshots |
| Installation | Original Runtime workspace, source recipe, profile, dependency lock and offline transfer |

Events and Mentions remain distinct source records. GKG has four views: `articles`, `article-entities`, `article-measures` and `article-details`. A review selects one table and its explicit fields, filters and sorts. Repeated article or entity occurrences retain their original row and occurrence identities. The [original meanings and operating envelope](../../stellar/scf-starforge-20261009/sf30-seller-sdk/gdelt/README.md#source-and-interpretation) travel in the package.

The selection retains the complete Python buyer source, SF100 output engine, both GDELT Python entrypoints, the shared `source_file_delivery.py` contract, UI assets, all six example policies, and the original native customer example. These files are required at runtime even when their paths are constructed dynamically.

## Build one immutable source selection

Use the existing Runtime workspace's **Build a product** view and select `gdelt-events` at the desired full commit in this repository. Review the selected source, build it, and open the returned archive in **Source & profile**. The [maintained source-build guide](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/SOURCE_BUILDS.md) covers the same browser and CLI operation.

For a terminal build, run the maintained builder from the selected checkout:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace-checkout \
  --ref ORIGINAL_FULL_COMMIT \
  --selection gdelt-events \
  --out /absolute/gdelt-release
```

Retain its complete `PACKAGED` receipt, archive and SHA256. The package's source manifest binds the actual commit, original recipe bytes, contributions, every packaged source file and package metadata. Its version ends in `.selection.gdelt-events`.

The source builder resumes the same output and selected commit:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace-checkout \
  --out /absolute/gdelt-release --resume
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --out /absolute/gdelt-release --status
```

An omitted selection on resume uses the retained selection. A different selection or commit belongs to a different output. An offline build uses `--offline` after the selected Git objects have already been acquired.

## Install the complete merchant profile

The maintained package declares Node 22.16 or later. GDELT ZIP decoding and source receiving require an existing Python 3.11 or later executable. The original Python buyer package has no required third-party dependencies for this source-file workflow; its complete package source is included. Workbook, database or agent extras belong to their existing optional workflows.

Use the exact returned archive and digest:

```sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/gdelt-runtime \
  --archive /absolute/gdelt-release/ORIGINAL_PACKAGE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/gdelt-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/gdelt-runtime --load --source

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/gdelt-runtime -- gdelt --help
```

The native merchant, schema, OpenAPI and MCP dependency versions come from the selected source declarations and retained package lock. Reuse an existing dependency tree only through the original installer's supported adoption path after it satisfies this profile. The complete [runtime installation and recovery guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) remains authoritative for dependency acquisition, interruption and readiness.

The command examples below use the installed `starforge` executable. Where it is not on the operator's PATH, use the same `runtime-install-cli.mjs run --dir /absolute/gdelt-runtime --` prefix and then the shown command after `starforge`.

Inspect `starforge source` and `starforge registrations` to retain the installed source commit, selection, `gdelt` command, application provider and merchant provider. A selected package has explicit named exports; its broad fleet root index is intentionally outside the source selection.

## Open or reopen the customer's application

Initialize a new project once:

```sh
starforge gdelt init --project /absolute/article-desk --title "Article and event desk"
starforge gdelt serve --project /absolute/article-desk \
  --python /absolute/python3.11-or-later
```

Register the READY runtime in the existing Runtime workspace. In **Applications**, select **GDELT article and event desk**, the original project directory and the selected Python executable. An existing buyer configuration and facilitator can be selected for paid customer work. The provider binds the project identity, configuration and exact launch before admitting its running application.

The browser exposes source discovery/capture, table fields and rows, saved reviews, window comparison, publication, customer acquisition, complete files and operation history. A received project opens through the same application. Keep each project, buyer store, receiving directory and runtime as its original record through restarts.

A project with an unfinished receiving record must continue its original receiving command. Initialization will preserve that directory for the retained original project rather than create a second identity over it.

## Select an official source family and retain its discovery

GKG article source selection is explicit:

```sh
starforge gdelt discover --project /absolute/article-desk \
  --format gkg --out /absolute/private/gkg-discovery.json

starforge gdelt capture --project /absolute/article-desk \
  --id article-window-1 --revision ORIGINAL_REVISION \
  --format gkg --discovery ORIGINAL_DISCOVERY_SHA

starforge gdelt show --project /absolute/article-desk
starforge gdelt fields --project /absolute/article-desk --table articles
starforge gdelt fields --project /absolute/article-desk --table article-entities
```

For Events/Mentions use `--format events-mentions`. Select the returned discovery identity or a complete retained manifest, and keep the same original capture ID, revision and request if interrupted. `discovery --id ORIGINAL_DISCOVERY_SHA` reopens the saved manifest without another provider request. A new discovery is an intentional source request.

The original source code retains the requested update, response metadata, ZIP bytes and decoded table identities. It preserves provider retry intervals and source errors. Source acquisition does not deduplicate different updates or silently merge GKG with an Events/Mentions capture.

## Review, compare and publish

Copy the appropriate complete policy from the installed `gdelt/examples/` directory into the customer's working files before editing it. Use the source root returned by the runtime inspection to locate that original directory.

| Policy | Table |
| --- | --- |
| `event-policy.json` | `events` |
| `mention-policy.json` | `related-mentions` |
| `gkg-article-policy.json` | `articles` |
| `gkg-entity-policy.json` | `article-entities` |
| `gkg-measure-policy.json` | `article-measures` |
| `gkg-detail-policy.json` | `article-details` |

Preview the selected fields, then save the complete review:

```sh
starforge gdelt rows --project /absolute/article-desk \
  --captures ORIGINAL_CAPTURE_SHA \
  --policy /absolute/private/article-policy.json --offset 0 --limit 100

starforge gdelt review --project /absolute/article-desk \
  --id article-review-1 --revision ORIGINAL_REVISION \
  --captures ORIGINAL_CAPTURE_SHA \
  --name "Reviewed article window" --policy /absolute/private/article-policy.json

starforge gdelt compare --project /absolute/article-desk \
  --before ORIGINAL_BEFORE_CAPTURE_SHA --after ORIGINAL_AFTER_CAPTURE_SHA \
  --out /absolute/private/window-comparison.json
```

A GKG window comparison describes the exact retained article windows. Original number/code text, occurrence ordinals and source identifiers remain available. Tone score is expressed in percentage points; the other tone dimensions are percentages and word count is a count. Sparse GCAM dimensions retain their original keys and values.

Publish the saved review using the existing merchant origin and payment configuration:

```sh
starforge gdelt publish --project /absolute/article-desk \
  --id article-publication-1 --revision ORIGINAL_REVISION \
  --review ORIGINAL_REVIEW_SHA \
  --origin https://YOUR_CONFIGURED_MERCHANT \
  --payment /absolute/private/original-payment.json

starforge gdelt publication --project /absolute/article-desk \
  --publication ORIGINAL_PUBLICATION_SHA
```

Publication preserves the exact reviewed source set and exposes both reviewed rows and complete source-file delivery. Challenge-only serving can run without a buyer configuration. Actual acquisition uses the customer's existing buyer runtime, approvals, page intents and spending limits.

## Native agents use the same application

The original `gdelt-workspaces` provider borrows the running authenticated loopback application. Host configuration selects the original connection file, project identity, binding digest, complete input-file aliases and merchant profiles. Agent tools select those aliases; they do not invent filesystem destinations or payer credentials.

Initialize the existing native merchant host with a complete private options JSON:

```sh
starforge merchant-mcp init-provider gdelt-workspaces \
  --options /absolute/private/gdelt-native-setup.json
```

The options and connection schema are documented in [Native agents share the application](../../stellar/scf-starforge-20261009/sf30-seller-sdk/gdelt/README.md#native-agents-share-the-application). Continue the returned host setup and configuration through the original merchant serve/stdio commands.

The provider includes full record pagination, source discovery and import, review/publication, purchases, Dataset actions and retained-file reads. `merchant_gdelt_cancel` can reach the running action. Host closure aborts and drains its own client/file-reader resources while the original application's recoverable work remains in its project.

After a host restart, obtain a new retained-file handle for the same complete SHA-bound selection and requested byte offset. Preserve original capture, project, purchase and Dataset IDs after uncertain responses.

## Complete delivery and upgrades

Use [RECEIVING.md](RECEIVING.md) to carry the READY runtime, complete source/customer outputs, portable project and original operation receipts to the recipient. The source package and a customer project are separate deliverables. A complete customer handover includes the actual saved files and their byte identities, not just a source commit or a screenshot.

The shipped native example remains the original Events/Mentions customer case, with the existing local protocol fixture clearly identified in its results. Its presence is executable source, not a claim that this standalone release has run a new customer or completed funded settlement. Continue an existing case in its original directory and recorded operation. GKG source semantics and receiving are part of the complete product; source provenance and actual native outcomes remain separately recorded.
