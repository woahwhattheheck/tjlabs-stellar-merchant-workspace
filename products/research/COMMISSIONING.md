# Commission Research customer delivery

Commission one original Research application with its customer cases, observed pricing, paid-delivery configuration and existing source connections. The retained setup produces the complete quotation configuration and the original Applications request. The Research browser, local client and Merchant tools then operate that same listener, dossier directory and native customer history.

The complete workflow is to select the existing sources, prepare and save the configuration review, start the original Research application through Applications, perform the customer work and paid delivery, then reopen or receive through the same native workflows.

The [Research receiving guide](RECEIVING.md) covers source installation and the completed runtime. The [quotation operating guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-quotes/OPERATING.md) covers every customer, pricing and delivery control.

## Select the existing native sources

| Selection | Original owner and retained data |
| --- | --- |
| Research directory | Dossiers, customer projects, briefs, work, source editions, reviews and frozen deliveries. |
| Customer case directory | The original SF74 case store, full customer records, quotations, responses and revisions. |
| Pricing profile | The original SF97 configuration, pricing directory and one saved observation snapshot or history file. |
| Paid Research host | Original SF101 merchant checkout selections and original Buyer application aliases. |
| Research source settings | Existing Object, Documents, Pipeline, OpenAlex, Crossref, Zotero and extraction selections. |
| Installed runtime | The original READY Research source/dependency installation selected in Applications. |

An existing case directory is reopened. A new selected case directory is created by the original case writer when Research starts. The setup reader only inspects that selection.

For each pricing profile, use the original private configuration and full saved observation file. Select exactly one of `snapshot` or `history`. The original pricing directory must already exist. Optional native outbox, source package, release store and runtime options stay attached to that profile.

The private paid-delivery host is a separate source selection. The existing [Buyer setup workflow](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-commerce/BUYER_SETUP.md) can serve the original Buyer application or attach its existing Applications launch, then retain the agent connection and Research commerce host. Use that host path as `settings.customerCommerceHost`. The Buyer keeps its original approval, signing, spending and purchase operation.

## Write the complete commissioning input

Keep one private input and one separate retained setup directory per configuration edition. This is an example shape; replace its paths and identifiers with the selected original values.

~~~json
{
  "schema": "sf88-research-quotation-commissioning/v1",
  "requestId": "11111111-1111-4111-8111-111111111111",
  "workspaceDirectory": "/srv/starforge/research",
  "runtimeDirectory": "/srv/starforge/research-runtime",
  "label": "Research customer delivery",
  "configurationFile": "/srv/starforge/private/original-research-quotes.json",
  "settings": {
    "customerCommerceHost": "/srv/starforge/private/research-commerce.json",
    "connectionFile": "/srv/starforge/private/research-connection.json",
    "port": 0
  },
  "application": {
    "runtimeId": "111111111111111111111111"
  }
}
~~~

`runtimeDirectory` is the completed runtime installation. `application.runtimeId` is its existing 24-character ID in the Applications runtime workspace. Read the actual current runtime selection with:

~~~sh
starforge runtime-workspace status --workspace /srv/starforge/operator
~~~

The `application` object is optional. Include it to generate the exact terminal review request. Without it, the setup still produces complete settings for the Applications browser and the ordinary direct Research command.

To update an existing application, include its current `applicationId` and `expectedRevision` together. Preserve `homeId` when the original selection uses an explicit managed home. The existing Applications writer performs its native revision check.

`settings` accepts the maintained Research Applications fields:

- `connectionFile`, `objectStateDirectory`, `zoteroStateDirectory` and `extractionPython`.
- `customerCommerceHost`.
- `openalexWorkspaceDirectory`, `openalexModule` and `editionAdapter`.
- `crossrefState` and `crossrefConfig`.
- `documentSourceConfig` and `pipelineSourceConfig`.
- `port` and `environmentFile`.

Copy the full settings of an existing application when preparing a revised configuration. The setup preserves these selections, sets the original Research directory and selects its generated complete quotation host. If no connection file is selected, it uses `research-connection.json` inside the Research directory.

### Complete native quotation configuration

The selected host file uses the original native schema:

~~~json
{
  "schema": "sf88-research-customer-quotes-host/v1",
  "casesDirectory": "/srv/starforge/customer-cases",
  "pricing": {
    "research": {
      "label": "Research delivery",
      "config": "/srv/starforge/merchant/seller.json",
      "directory": "/srv/starforge/merchant/pricing",
      "snapshot": "/srv/starforge/merchant/observations.json",
      "nativeOutbox": "/srv/starforge/merchant/outbox",
      "sourcePackage": "/srv/starforge/merchant/source",
      "releaseStore": "/srv/starforge/merchant/releases",
      "releaseRuntime": {}
    }
  }
}
~~~

The complete `pricing` map can contain up to sixteen profiles. Each profile retains all its original optional settings. `releaseRuntime` is the original native options object, including its nested semantics.

Relative paths in an existing `configurationFile` resolve beside that original host file. The setup retains those exact host bytes and writes a complete configuration with absolute paths. Its normalized configuration remains usable after the donor host file moves.

Alternatively, put the entire native host object in `configuration` and omit `configurationFile`. Inline relative paths resolve beside the commissioning input file. A library caller supplying an object resolves them beside the setup's retained `input.json`. Absolute paths make a receiving host's selections clear.

## Prepare and save the complete setup

Use the installed `starforge` command. Its source-checkout equivalent is `node stellar/scf-starforge-20261009/distribution/cli.mjs`.

~~~sh
starforge research-quotes-setup prepare \
  --input /srv/starforge/private/research-commissioning-input.json \
  --run-directory /srv/starforge/private/research-commissioning
~~~

The same command is available through the Research client dispatcher:

~~~sh
starforge research-client quotes-setup-prepare \
  --input /srv/starforge/private/research-commissioning-input.json \
  --run-directory /srv/starforge/private/research-commissioning
~~~

Preparation retains the complete input before inspecting the runtime. It reads the original configuration, complete pricing sources and actual directory identities. It opens no case store, pricing model, Buyer purchase or listener.

Open `review.md` in the retained directory or read the complete returned review. It includes the original runtime/source commit, case selection, every pricing profile, full source filenames, byte counts and SHA-256 values, and the exact launch binding.

| Retained file | Use |
| --- | --- |
| `input.json`, `request.json` | Complete original input bytes and stable request identity. |
| `source-host.json` | Complete original selected host bytes. |
| `configuration-source.json` | Original filename, path interpretation and full normalized host. |
| `research-quotes.json` | Complete native host file for this setup. |
| `application-settings.json` | Full settings for the Applications browser. |
| `application-review.json` | Original Applications review request when `application` is selected. |
| `direct-launch.json` | Ordinary Research command arguments and reviewed binding. |
| `review.md`, `review.json` | Readable review and complete retained source selection. |
| `result.json` | The original completed commissioning result after save. |

Save with the `reviewSha256` returned by preparation:

~~~sh
starforge research-quotes-setup save \
  --run-directory /srv/starforge/private/research-commissioning \
  --review-sha256 ACTUAL_REVIEW_SHA256
~~~

Save reopens the runtime and verifies its original source/dependency identity and selected native modules. It hashes the pricing sources again and checks the same quotation launch binding. It then retains the first complete result.

Current case contents are outside the startup fingerprint. Customers can respond, revise quotations and complete work while the same original store remains selected. A pricing observation or configuration change produces a different binding and requires a new review.

| Identity | Use |
| --- | --- |
| Commissioning request UUID | Reopening this exact setup operation. |
| Commissioning `reviewSha256` | Saving the complete selected configuration and sources. |
| Quotation launch binding SHA-256 | Native startup verification of the selected host and pricing sources. |
| Applications review ID | The original Applications save request. |
| Applications start review ID | The original managed start request. |
| Native case/Research revision | Customer work in the running application. |

## Start through the existing Applications desk

Open **Applications** and choose **Research dossiers**. Keep the original runtime and application when continuing an existing installation.

Use the full values from `application-settings.json`. **Original customer quotation host configuration** selects the generated `research-quotes.json`. Keep **Original paid Research host configuration** and the existing source fields selected for this application.

The existing review panel shows the complete quotation configuration, case selection and pricing-source sections. Applications pins the selected native modules, configuration, pricing files and directory inputs. It saves those settings through its original writer.

Start the saved application through its existing review and start controls. The original Research process receives `--customer-quotes-host` and `--customer-quotes-binding-sha256`. Before opening the quotation case store, it rechecks that complete source binding. Its startup announcement includes the bound hash.

The observer then uses the original private Research connection to verify the same directory, workspace and listener instance, the selected quotation host and launch binding, and the existing configured source, extraction and paid-delivery joins. Open the resulting private URL. Applications retains the original start operation, output, stop and recovery controls.

### Terminal Applications flow

Use the generated original request:

~~~sh
starforge runtime-workspace application-review \
  --workspace /srv/starforge/operator \
  --request /srv/starforge/private/research-commissioning/application-review.json
~~~

Place the returned review ID in a private save request. The following IDs are placeholders for the original values:

~~~json
{
  "requestId": "22222222-2222-4222-8222-222222222222",
  "reviewId": "ACTUAL_APPLICATION_REVIEW_ID"
}
~~~

For an existing application, include its actual `applicationId` in the same request.

~~~sh
starforge runtime-workspace application-save \
  --workspace /srv/starforge/operator \
  --request /srv/starforge/private/application-save.json

starforge runtime-workspace application-start-review \
  --workspace /srv/starforge/operator \
  --application-id ACTUAL_APPLICATION_ID
~~~

Use the returned start review ID in the original start request:

~~~json
{
  "applicationId": "ACTUAL_APPLICATION_ID",
  "requestId": "33333333-3333-4333-8333-333333333333",
  "reviewId": "ACTUAL_START_REVIEW_ID"
}
~~~

~~~sh
starforge runtime-workspace application-start \
  --workspace /srv/starforge/operator \
  --request /srv/starforge/private/application-start.json

starforge runtime-workspace application-connect \
  --workspace /srv/starforge/operator \
  --application-id ACTUAL_APPLICATION_ID
~~~

Repeat the same retained native request after a lost reply. Read the original application's operation and output before starting another listener.

### Ordinary direct launch

`direct-launch.json` contains the original command and full argument array, including the expected quotation binding. Direct launch uses those ordinary `research-workspace` arguments. Its optional `environmentFile` identifies the existing private environment selection; the Applications launcher already loads that file.

Both launch paths use the same source selections. Continue the existing Applications process when it owns the Research directory.

## Complete the customer journey

Open **Customer quotations**. The embedded editor is the original SF74 commercial desk, preserving complete quote drafts, published revisions, customer responses, pricing-source receiving, implementation plans, backups and exports.

1. Open the original customer case or create it from the selected Research project and brief.
2. Review observed pricing, supplier costs and the published pricing version.
3. Write and publish the complete quote, then record the actual customer response.
4. Select the exact case revision, published quote and Research brief in **Customer brief**.
5. Review and save the quote-bound brief revision.
6. Perform the evidence update in **Customer updates**, retaining source editions, work and frozen delivery.
7. Use **Paid delivery** to publish that exact frozen delivery through its existing merchant.
8. Let the original Buyer review, approve and execute the native purchase.
9. Receive the complete delivered dossier and reports through the existing Research receiving path.
10. Prepare the realized report using the quote, publication, actual purchase IDs and original pricing/cost edition.

The customer quotation keeps its original monetary and unit fields. The compiled merchant offer supplies the actual Stellar payment terms. Both originals remain visible through the brief and paid-publication reviews.

The [full quotation guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-quotes/OPERATING.md) supplies all twenty-one quotation commands, sixteen Merchant tools, original JSON fields, complete native downloads and recovery behavior.

## Stop, reopen and change a configuration

Stop through the existing Applications controls. Accepted quotation publication and receiving calls drain while the original paid-delivery and source owners remain available. Successful owners stay closed and the same failed closer can retry.

Read the retained setup:

~~~sh
starforge research-quotes-setup status \
  --run-directory /srv/starforge/private/research-commissioning
~~~

After interrupted preparation, repeat `prepare` with the same directory. It reopens saved input even if the donor input file moved. If a supplied original input file remains present, it must have the same bytes.

After a lost save reply, repeat `save` with the same review hash. A completed result opens before querying the old runtime or pricing sources.

For an intentional configuration edition, copy the complete old input, preserve every source setting/profile, select the changed native paths, and use a new request UUID and setup directory. Prepare and save that complete review, then update the existing Applications record at its current revision. The original case, Research and payment histories stay with their native directories.

## Export and receive the complete configuration history

~~~sh
starforge research-quotes-setup export \
  --run-directory /srv/starforge/private/research-commissioning \
  --out-directory /srv/starforge/private/research-commissioning-copy
~~~

The copy contains every complete file and `commissioning.json`, binding their names, lengths and SHA-256 values to the original request, review and result. Interrupted copy resumes the same roster. Repeating the command reopens a completed copy before reading the donor setup.

The export records the original host's selections. For another host, use the existing Research dossier/customer handover, commercial case backup and pricing receiving operations to place the complete native state, then install the original Research runtime. Prepare a new commissioning input with those actual received paths.

The [Research receiving guide](RECEIVING.md), [customer handover guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-updates/CUSTOMER_UPDATES.md) and original quotation backup controls carry the dossier, cases, source history and pricing data. The setup export carries the complete configuration and review history beside them.

## Typed local API

The package exports `./buyer/research-dossiers/quotes/setup` and `./buyer/research-dossiers/quotes/launch`.

~~~js
import {
  prepareResearchQuotationSetup,
  saveResearchQuotationSetup,
  readResearchQuotationSetup,
  exportResearchQuotationSetup
} from './source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/research-dossiers/customer-quotes/setup.mjs';

const prepared = await prepareResearchQuotationSetup({
  directory: '/srv/starforge/private/research-commissioning',
  inputFile: '/srv/starforge/private/research-commissioning-input.json',
  signal
});
const saved = await saveResearchQuotationSetup({
  directory: prepared.directory,
  reviewSha256: prepared.reviewSha256,
  signal
});
const reopened = await readResearchQuotationSetup(saved.directory);
const copied = await exportResearchQuotationSetup({
  directory: saved.directory,
  outputDirectory: '/srv/starforge/private/research-commissioning-copy',
  signal
});
~~~

Complete declarations accompany the source. The library uses the original private publisher and operation lock. Cancellation stops at retained boundaries; an already published input or result remains available to the same original request.
