# CKAN and DCAT data products

This installed product captures and publishes complete CKAN resources and
operates saved DCAT-US catalogue migrations. Each project retains its source
documents, reviews, accepted editions and complete handover history. The browser,
installed commands and managed Applications entries use the same original
workspace engines.

## Install the received product

Use Node 24 on Linux with the existing `flock` utility. Keep the received archive,
its complete SHA-256 and source manifest together. Install into a new private
application directory:

~~~sh
CKAN_PRODUCT_DIR=/absolute/private/apps/ckan-merchant
install -d -m 700 "$CKAN_PRODUCT_DIR"
cd "$CKAN_PRODUCT_DIR"
npm install --ignore-scripts --offline --omit=optional /absolute/path/to/package.tgz
starforge() { (cd "$CKAN_PRODUCT_DIR" && npx --no-install starforge "$@"); }
starforge doctor
~~~

Use the actual received archive path. The shell function keeps commands bound to
this product when the working directory changes; define it again in a new shell.
Prepare its native runtime through the original
[runtime installation guide](source/stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
and the full [product operating guide](source/products/ckan/OPERATING.md).

## Open a catalogue migration

For DCAT-US migration, prepare the original Python 3.13 converter dependencies in
[DCAT_ENGINE.md](source/stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/DCAT_ENGINE.md).
Set `SCF_DCAT_PYTHON` to that prepared interpreter when it has a specific path.
An actual Python 3.12 host can instead follow the complete locked setup in
[PORTABLE_RUNTIME.md](source/stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/PORTABLE_RUNTIME.md)
and explicitly set `SCF_DCAT_RUNTIME_PROFILE=portable-python312` together with
its interpreter path. The default profile remains `original`.
Then initialize the project with its actual publisher origin:

~~~sh
starforge dcat init \
  --workspace /absolute/private/catalogue-project \
  --origin https://open.gsa.gov

starforge dcat serve --workspace /absolute/private/catalogue-project
~~~

Open the private URL returned by the application. In **Catalogue migration**,
receive complete source JSON, prepare a review, inspect validation and every
dataset or series change, and receive corrected candidates as separate original
documents. A preceding publisher edition can be compared independently of
conversion. Release selection and restoration retain immutable history.

The complete
[catalogue migration operating guide](source/stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/MIGRATION_OPERATING.md)
covers errors, typed identifier repairs, successive editions, cutover, customer
deployment, rollback and the exact browser, CLI, HTTP and merchant-agent workflow.
The existing merchant host can operate this same project through its DCAT tools,
using declared catalogue input aliases and exact retained review/file identities.
Its complete workspace archive continues through the original receiving tools.

For managed operation, choose **DCAT catalog migration** in Applications. Select
the initialized workspace and prepared runtime, set the common port and private
environment file, then use **Review → Save → Start → Open**. The saved selection
binds the original project, installed source and Python executable. Use **Stop**
before running a separate writer against the same project.

## Open a CKAN data project

The original CKAN workflow uses the actual CKAN catalogue origin:

~~~sh
starforge ckan init \
  --project /absolute/private/ckan-project \
  --origin https://data.svk.se

starforge ckan serve --project /absolute/private/ckan-project --port 0
~~~

Its existing catalogue, editions, publication, merchant, reviewed-refresh and
Workspace sections retain the complete capture-to-customer flow. The
**CKAN data merchant** Applications entry also opens its bound browser and
merchant agent using the original configuration and project alias. Follow
[OPERATING.md](source/products/ckan/OPERATING.md) for capture, fields, publication,
buying, reviewed successors and all installed interfaces.

## Hand over and reopen the complete project

Use the browser's **Workspace** handover to export the whole saved project.
Retain the archive's actual byte count and SHA-256. Receive into a new private
directory, reopen it and continue the original saved history.

For a DCAT-US project:

~~~sh
starforge dcat archive \
  --workspace /absolute/private/catalogue-project \
  --out /absolute/private/delivery/catalogue-project.ckanw

starforge dcat receive \
  --file /absolute/private/delivery/catalogue-project.ckanw \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --workspace /absolute/private/received-catalogue

starforge dcat serve --workspace /absolute/private/received-catalogue
~~~

Use the hash from that archive's actual export. The migration guide describes
review/report downloads, the selected release and its external deployment
continuation. The original
[CKAN receiving guide](source/products/ckan/RECEIVING.md) covers capture,
publication, customer requests, following editions and independently reopened
merchant projects.

## Source and guide locations

Links in this installed entrypoint start at this package's `source/` directory.
The complete checkout-oriented guides also remain in that source tree:

| Guide or source | Installed location |
| --- | --- |
| Product operation | [source/products/ckan/OPERATING.md](source/products/ckan/OPERATING.md) |
| CKAN receiving | [source/products/ckan/RECEIVING.md](source/products/ckan/RECEIVING.md) |
| Migration operation | [MIGRATION_OPERATING.md](source/stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/MIGRATION_OPERATING.md) |
| Original converter setup | [DCAT_ENGINE.md](source/stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/DCAT_ENGINE.md) |
| Original CKAN application | [ckan/README.md](source/stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/README.md) |
| Original converter source manifest | [source-manifest.json](source/stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/vendor/gsa-dcat-us/source-manifest.json) |

Run `starforge registrations --source ckan` to inspect the selected interfaces
and `starforge source` to retain the installed source revision with the customer
handover.
