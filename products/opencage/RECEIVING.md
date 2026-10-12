# Receive and reopen the OpenCage product

This procedure receives the named `opencage` product through the original
distribution builder, runtime installer, Applications and merchant interfaces.
It preserves the provider, release and Buyer histories already produced by the
maintained source. Use [OPERATING.md](OPERATING.md) for everyday work and
[SOURCE_ADOPTION.json](SOURCE_ADOPTION.json) for the exact adopted source map.

## Source and package identity

Build the recipe from one full commit in
`woahwhattheheck/tjlabs-stellar-merchant-workspace`. Retain the original build
receipt, TGZ, archive SHA-256, package manifest and dependency lock. The selected
manifest must identify `sourceSelection.id: "opencage"` and the same original
recipe in `distributionInputs`. Reopen that build with its original output and
`--resume`; a completed build returns its verified archive.

The product's original contribution registers its CLI, SDK exports and existing
Applications provider. The selected merchant-provider contribution binds the
unchanged `opencage-workspaces` factory to the adopted catalog and workspace.
The recipe keeps complete provider/browser, developer-generation, deployment
and financial components because several inputs are loaded by filename at
runtime rather than by static ESM imports.

| Required retained source | Purpose |
| --- | --- |
| Complete `sf30-seller-sdk/opencage/`, including `ui/batch.js` | Original capture, CSV, decision, customer, CLI, managed launch and receiving |
| Original OpenCage MCP workspace and catalog, with its existing provider registration | Same workspace ownership, 23 tools and original retained-file receiving |
| Complete `sf30-seller-sdk/developer/` | Portal HTML/CSS/JavaScript and generated-client runtime |
| Complete `sf82-seller-pilot/` and its original browser asset registration | Release generation, compare, activate, restart, rollback and customer delivery |
| Complete `sf99-merchant-deploy/`, including `generation.mjs` | Original host review, generated bundle and same-directory recovery |
| Complete `sf88-operator-buyer-cli/` and original SF36/SF86/SF103 components | Existing Buyer attempt, financial worker, `networks.json`, reviewed profile and accounting recovery |
| Original runtime-workspace components and source-owned providers | READY runtime, Applications review/save/start/stop and source adoption |

The source selection explicitly exposes named package exports; its broad toolkit
root export is excluded through the original selection contract. The existing
builder still computes static imports and manifest seeds. A selected-file count
alone does not establish a complete receiving workflow.

## Install and inspect the actual archive

Use the original prepare/install/inspect sequence in the operating guide with
`--native --feature schema --feature openapi --feature mcp --operator`. Confirm
the resulting runtime is READY and its inspected source is the same selected
archive. Retain actual archive and installed-byte measurements from the original
receipts; source-level counts are not memory or storage measurements.

Run the included CLI help and registration reads through that runtime:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/opencage-runtime -- registrations --source opencage
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/opencage-runtime -- opencage-workbench --help
~~~

The commands include `batch-review`, `batch-prepare`, `batch-run`,
`batch-read`, `host-review`, `host-bundle` and `host-check`. The package
exposes `seller/opencage/batch`, `seller/opencage/batch-delivery` and
`seller/opencage/deployment` alongside the original OpenCage exports and
`buyer/node`.

Inspect the existing merchant-provider catalog and the Runtime workspace's
Applications list. The original OpenCage entry is `opencage-workspace`
(**OpenCage geocoding**). Review an initialized private workspace, save that
application, start it and use its returned browser URL. The source review
retains every file returned by the provider's current managed selection.

## Complete the source-to-customer workflow

Use the customer's actual selected source and terms, or explicitly reuse an
available original retained response. A retained response must keep its genuine
query/product identity, request, HTTP observation, original timestamps and full
body. The bundled `fixtures/native-reverse.json` is an original public response
body; a body alone is not a newly observed request.

1. Reopen the original workspace and inspect its configuration, request IDs,
   provider results and candidate history. Import only a genuinely matching
   original observation when reconciling an incomplete capture.
2. Save one response-bound candidate decision and export its complete customer
   delivery. Open the exported manifest with the original customer reader and
   download each original file.
3. Inspect and review a CSV that includes the intended source columns. Prepare
   the exact review and retain the resulting batch ID.
4. Run one named batch. Where retained captures are available, bind their
   original IDs through the existing review's `--reuse` selection. Keep repeated
   rows separate and verify that their decisions can differ.
5. Inspect a current row before selecting a candidate. Retain invalid input,
   successful zero-result responses, provider exceptions and unreviewed rows
   as distinct outcomes. An intentional retry keeps its reviewed predecessor
   and complete immutable receipt chain.
6. Export the selected batch revision. Reopen it with `batch-read --verify true`
   and the customer browser. The verifier must reproduce the all-row CSV,
   exceptions CSV, selected GeoJSON, licenses, counts and delivery summary from
   its original retained objects.
7. Stop the managed application, then reopen the same saved application and
   workspace. Confirm the source, batch, request, response and decision
   identities still select the same work.

Record actual returned identities and errors. A native run that ends before
source import, browser initialization or file generation retains that partial
outcome; a later continuation binds its original result instead of replacing it.

## Receive through the original agent

Load the same host-reviewed workspace connection into the original merchant
operator. Its CSV source aliases identify exact private files and hashes.
Open the workspace with `merchant_opencage_open` and use the original eight CSV
tools against that same model.

Open the saved customer delivery with `kind: "batch-delivery"`. Page its row
index using the returned identity and continuation offset. Download the original
manifest, CSV, GeoJSON and object files through `merchant_opencage_file_read`.
The retained-file client checks the exact descriptor, offset and completed hash
when continuing a transfer. Reopen the merchant operator and repeat reads against
that same completed delivery; this stage requires no repeated provider capture.

The complete interface is described by the original
[MCP guide](../../stellar-forge/mcp-merchant-operator/OPENCAGE_WORKSPACES.md) and
[CSV guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/opencage/BATCH.md).
These are the maintained agent/browser contracts, with named host inputs and
original process ownership.

## Merchant, host and Buyer receiving

Prepare and inspect the original merchant package under the receiving compiler.
Compare its staged release before activation. Exercise start, stop, reopen and
rollback through actual release generations. Preserve the original application
entries and earlier released versions.

For host preparation, retain the selected host settings and source-bound review,
generate the SF99 bundle, and run `host-check`. Inspect an interrupted generation
and continue through the original same-directory generation journal. A valid old
package that no longer reproduces under the receiving compiler remains an old
package: explicitly regenerate from its retained plan and terms, record both
package identities and use the new inspected package for a new host review.

The original
[host receiving driver](../../stellar/scf-starforge-20261009/sf30-seller-sdk/opencage/receiving/run-host-deployment.mjs)
and
[launcher](../../stellar/scf-starforge-20261009/sf30-seller-sdk/opencage/receiving/launch-host-deployment.py)
carry that linked package/native history. Select an actual source/input manifest
and available original native host according to their guide. Their default
arguments and existing native lifecycle remain unchanged.

When a retained Buyer result already exists, reopen its original state and intent
and adopt it through the OpenCage workspace. Keep that result's raw response and
operation evidence. A new paid purchase uses its own reviewed source, exact
public terms, allowed amount and original operator/signing/accounting custody.
An installed package or generated host bundle by itself does not establish that
a purchase occurred.

For generic Node accounting, select the complete accounting runtime and the
same retained ordinary attempt. Use `Operation.finalize()`, then recover and
export the returned accounting command. A `fromConfig`/SF103 profile supplies
the explicit matching original accounting workspace; the historical producing
runtime and signer profile remain identifiable. Recovery/export inspect that
saved command without another financial invocation.

The
[accounting receiving guide](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/node/receiving/OPENCAGE_ACCOUNTING.md)
and its original launcher retain the first source-import failure, the complete
financial-source successor and the unchanged free response. They also document
the exact completed receiving result.

## Retained evidence and remaining receiving

This source adoption preserves the following original outcomes. These are
producing-source results, not a claim that this newly selected standalone
archive has already completed all receiving phases.

| Original source leg | Retained outcome |
| --- | --- |
| Per-query provider, merchant, customer, MCP and managed lifecycle | The completed `d3acc3c0…` continuation retained eight phases and 12 artifacts. Its predecessor `1a9f98c9…` retained the successful Buyer/customer files and its actual failed release stage. Both histories remain authoritative. |
| Generic Node accounting of the original free response | `ce79e072…` completed with 25 artifacts. `finalize-o4ICVV` returned `UNPAID_RESPONSE / NO_PAYMENT_REQUIRED / ORIGINAL_UNSIGNED_RESPONSE`; recover and export used the same original `071b7639…` attempt. |
| Complete CSV receiving | The released browser/MCP/core source and driver are adopted. Original `d18b3cae…` failed during startup because its selected source omitted the developer portal. That failure was finalized; the next original receiving continuation must include those assets. |
| Host receiving under the newer compiler | The released regeneration/recovery source is adopted. Earlier selected-source and package/compiler failures remain retained; no successful newer host result is asserted here. |
| New paid reverse geocoding | The reviewed preparation and allowance are separate from a paid Buyer outcome. This source adoption records no new payment. |

The exact completed result and artifact hashes are in
[SOURCE_ADOPTION.json](SOURCE_ADOPTION.json). The signed or unsigned outcome
must come from the original native result and retained attempt, not from a
source merge, a prepared input or an absent output file.

For this selected standalone edition, retain the actual following build/archive,
READY installation, Applications lifecycle, CSV/customer, host and accounting
receipts as they are produced. Reuse an existing accepted operation with the
same source/input selection. A different receiving source or corrected
prerequisite uses the original linked-continuation mechanism while preserving
the earlier terminal result.

## Handback and continued authoring

A customer delivery includes the complete export manifest, all rows and
exceptions, chosen GeoJSON, licenses, original request/response objects and
review history. Reopen it using the receiving edition's original reader and
verify every selected member. Retain the file descriptors and actual download
receipts with the handover.

Continued authoring also needs the closed private workspace and its original
source/request/retry/release stores. Stop its owner, retain SQLite and its journal
together, and use the original private runtime/Applications transfer and source
adoption workflow. The receiving host provides its own selected environment
references. Reopen the saved workspace and check its exact identities before
starting new work. Preserve original Buyer and accounting state separately from
the public customer files.
