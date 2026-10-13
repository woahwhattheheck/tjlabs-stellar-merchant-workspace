# OECD leading-indicator economic editions

Create an exact cross-country economic briefing, publish its retained dataset through the existing Stellar merchant, and deliver a complete customer project that reopens with its original sources and reports.

The complete product includes the original OECD analyst application, industrial browser, typed Node client, MCP interface, SDMX/Macrobond catalog, merchant and buyer receiving workflow. It includes all fifteen original OECD responses for the bundled seven-country edition: **231 monthly observations and 236,642 source bytes**, with the exact dataflow, structure, twelve code lists and acquisition receipts.

## Create and reopen the complete briefing

From the installed **oecd** product:

~~~sh
starforge oecd-product create \
  --runtime /srv/starforge/runtimes/oecd \
  --project /srv/starforge/projects/oecd \
  --operation oecd-original-briefing-20261013
~~~

This invokes the original full source programme. It imports the retained source, saves the first analyst/customer edition and a following editorial revision, exports the native dataset and complete revised project ZIP, and reopens that revised ZIP in a separate named customer workspace. It compares every report byte and original source row, and prints the saved report, dataset, packet and customer-workspace identities.

The runtime argument verifies the original READY installation, locked dependencies, source and exact **oecd** package selection. Keep the project outside that immutable runtime. A source checkout can run the same command through **node products/oecd/cli.mjs create** without a runtime argument; its complete source and native prerequisites must already be present.

Open the same saved project:

~~~sh
starforge oecd-product workspace --project /srv/starforge/projects/oecd
~~~

Use the actual private URL printed by that process. The original browser reviews source coverage, selects countries and dates, saves notes and project revisions, compares editions, selects publication or rollback, and downloads complete reports and project packets. The existing Applications catalog exposes **OECD analyst and customer workspace** with the same private project binding.

## What the customer receives

| Artifact | Complete content |
| --- | --- |
| briefing.html | Offline report with tables, gap-aware charts, exact displayed source values and dataset acknowledgment |
| briefing.json | Source-bound report, native labels/units, exact decimal calculations, capture and edition identities |
| observations.csv | Original observations and metadata, with acquisition date, citation and terms fields |
| SOURCE_RIGHTS.json and SOURCE_RIGHTS.md | The same dataset acknowledgment and downstream acknowledgment requirement, bound to this edition |
| Native dataset | The maintained original CSV/configuration/lineage files plus the returned attribution companion |
| Complete project ZIP | Original customer catalog/source history, revised briefing, report files and source-rights files for a fresh customer workspace |

The report window controls the briefing’s selected months. The native customer edition retains every captured observation for the selected country series. Missing values and calendar gaps remain explicit. New reports use the complete five-file version 2; existing saved version 1 editions reopen with their original three files.

## Run the configured native merchant and buyer

Bind the original seller terms, merchant process, buyer/signer configuration, operator workspace and exact spending limit in a private copy of the application's [receiving configuration](../../stellar/scf-starforge-20261009/sf30-seller-sdk/sdmx/oecd/examples/receiving.json). Then run:

~~~sh
starforge oecd-product receive \
  --runtime /srv/starforge/runtimes/oecd \
  --project /srv/starforge/projects/oecd \
  --config /srv/starforge/private/oecd-receiving.json
~~~

This invokes the installed original distribution entrypoint and its existing **oecd receive** workflow. It prepares the native edition and merchant, uses the original configured buyer, completes dataset accounting and delivery, compares the delivered rows to the source, and reopens the revised report/project in a separate customer workspace. The bundled 231-row edition takes two data pages at page size 150. Repeat with the same project, configuration and operation to continue its retained original session.

## Install and operate

- [OPERATING.md](OPERATING.md): product selection and installation, browser/CLI/MCP operation, source revisions, publication and customer reopening.
- [RECEIVING.md](RECEIVING.md): complete source-only and configured economic receiving, actual artifact paths and continuation.
- [SCF_PRODUCT.md](SCF_PRODUCT.md): customer workflow and direct grant engineering demonstration.
- [SOURCE.json](SOURCE.json): exact original application/projection identities and the three maintained SDMX compatibility postimages.
- [Original application guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/sdmx/oecd/README.md): full typed client, source and native provider contracts.
- [Source rights](../../stellar/scf-starforge-20261009/sf30-seller-sdk/sdmx/oecd/SOURCE_RIGHTS.md): actual OECD dataset acknowledgment and customer distribution.

## Source interpretation

The retained flow is **OECD.SDD.STES:DSD_STES@DF_CLI(4.1)** and its corresponding DSD is version **4.1**. The product keeps the original dimension order, unit/adjustment basis, status, decimals, multiplier and source action. One-, three- and twelve-month changes are Decimal differences in index points at matching calendar positions.

OECD describes the amplitude-adjusted composite leading indicator as a qualitative turning-point indicator with long-term average 100. Use the original [indicator definition](https://www.oecd.org/en/data/indicators/composite-leading-indicator-cli.html), [methodology and revision explanation](https://www.oecd.org/en/data/insights/data-explainers/2024/04/composite-leading-indicators-frequently-asked-questions.html), and [retained source record](../../stellar/scf-starforge-20261009/sf30-seller-sdk/sdmx/oecd/SOURCE.md) when interpreting a briefing.

Application code is MIT. The OECD observations retain [OECD Data Terms, section 3](https://www.oecd.org/en/about/terms-conditions.html), their dataset-specific annotations and the acknowledgment carried in every new customer report.
