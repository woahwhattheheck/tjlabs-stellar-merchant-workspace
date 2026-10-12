# County wage report production

This contribution adds BLS Quarterly Census of Employment and Wages (QCEW) source editions and repeatable county reports to the existing FRED project. Original county, regional, state and national files, CPI observations, saved production profiles, report editions and the operation journal travel together in the complete project export.

The default family contains a cover, an overview with two charts, four tables, five industry pages with two charts each, and a methods page. The HTML is self-contained, uses a grayscale layout and works offline. A configured local Chromium produces the PDF from that exact HTML. Complete calculation and original selected-row CSVs accompany every edition.

## Open the installed product

Use Node 22.16 or newer on Linux with `flock`, Python 3 and sufficient storage for the selected original archives. PDF production also uses a local Chromium executable; the complete commissioning command uses `pdfinfo` to read the resulting page count.

From the directory containing the installed Starforge package:

```sh
npx --no-install starforge fred qcew --help
npx --no-install starforge fred qcew show --project /absolute/existing-fred-project
```

The Python source collector is included relative to the installation's recorded source root:

```
stellar/scf-starforge-20261009/sf30-seller-sdk/fred/qcew/source_fetch.py
```

The runtime installer records the absolute `sourceRoot` in its installation plan; its prepared source lives under `package/source/`. Use that original source root for the Python command. In a maintained source checkout, run `node stellar/scf-starforge-20261009/sf30-seller-sdk/fred/qcew/cli.mjs` in place of `npx --no-install starforge fred qcew`. All source-checkout paths below are relative to the repository root.

An existing project remains the production workspace. To start a new project through the original FRED initializer, use:

```sh
npx --no-install starforge fred qcew init \
  --project /absolute/county-report-project \
  --title "County report production" \
  --price-source /absolute/cpiaucsl.public-table.json
```

This selects the original price-series metadata. The following import retains its complete original source in the project.

## Retain the original price source and QCEW history

The existing FRED source family includes the complete official CPIAUCSL public table at `fred/sources/cpiaucsl-20261012.public-table.json`. Supply a complete public-table wrapper with its original URL, retrieval time, metadata and table body to import a later edition. The existing FRED source reader validates that wrapper.

```sh
npx --no-install starforge fred qcew cpi \
  --project /absolute/county-report-project \
  --id county-cpi-20261012 --expected-revision 1 \
  --source /absolute/cpiaucsl.public-table.json
```

Save the returned capture SHA and revision. In an existing project, use the current revision from `show`.

Acquire the complete original QCEW files in one persistent source directory:

```sh
python3 stellar/scf-starforge-20261009/sf30-seller-sdk/fred/qcew/source_fetch.py \
  --directory /absolute/qcew-originals-20261012 \
  --years 1990:2026
```

The default request contains eleven exact BLS area codes:

| Region | Original area codes |
| --- | --- |
| San Francisco County | 06075 |
| Nine-county Bay Area | 06001, 06013, 06041, 06055, 06075, 06081, 06085, 06095, 06097 |
| California | 06000 |
| United States | US000 |

The collector first retains the complete current 2025 Q4 San Francisco API slice as a separate diagnostic source. It then retrieves the original quarterly NAICS by-area ZIP for every selected year. It preserves each selected CSV member in full, the original central-directory inventory, member CRC and length, response headers, returned byte ranges and file hashes. HTTP ranges reduce transfer when supported; a server returning the full archive is handled explicitly. Only this operation's temporary archive is removed after its members are retained.

The collector resumes the same directory after interruption. It validates retained complete members, saves a newly returned member before parsing and requires the original archive representation to remain unchanged during continuation. When a publisher revises an unfinished archive, retain that intake and start a new dated source directory for the revised edition. Do not combine different revisions inside one original archive.

The current API uses `qtrly_estabs`; titled historical archives use `qtrly_estabs_count`. The reader maps that one field to the calculation name. The actual 1990 archive repeats an unused taxable-wage-change heading; the complete original header is preserved and calculation keys must remain unambiguous.

Import only after `source-manifest.json` reports `complete: true`:

```sh
npx --no-install starforge fred qcew import \
  --project /absolute/county-report-project \
  --id county-qcew-20261012 --expected-revision 2 \
  --input-directory /absolute/qcew-originals-20261012
```

The resulting capture contains every original compressed CSV and the complete manifest. It is retained under the same FRED project in `qcew/captures/<capture SHA>/capture.json`. The diagnostic API slice remains separate from the annual archive observations used to calculate reports.

## Save a reusable production profile

Generate an editable definition:

```sh
npx --no-install starforge fred qcew profile-template \
  --out /absolute/san-francisco-profile.json
```

Edit that definition, then save it into the existing project:

```sh
npx --no-install starforge fred qcew profile \
  --project /absolute/county-report-project \
  --id county-profile-v1 --expected-revision 3 \
  --source /absolute/san-francisco-profile.json
```

Saving normalizes the complete definition and returns its immutable profile SHA. A later profile change creates a new profile. The reporting quarter is supplied when producing each edition, so one profile can be reused across releases.

| Setting | Default | Available choices and meaning |
| --- | --- | --- |
| Regions | County, named nine-county Bay Area, California, United States | One focus region and up to three explicitly named comparators |
| Industry rows | All covered industries plus twelve BLS supersectors | Original total, supersector, complete NAICS sector or three- to six-digit industry codes |
| Ownership | Total ownership for the total; federal, state, local and private components for industries | Original special totals or disjoint components; overlapping selections are rejected |
| Employment | `quarter_mean` | Mean of the three original monthly counts, or `month3` |
| Weekly wage | `from_totals` | Sum quarterly wages and employment before division, or employment-weighted published weekly wages |
| Disclosure | `complete` | Require every component, or explicitly label `disclosed_components` |
| Comparison baseline | Same quarter of 2019 | Explicit year and same or fixed quarter |
| Historical points | Same reporting quarter from 1990 | Start year and table years are configurable |
| Industry charts | Five highest current weekly wages | Up to five explicit retained industry codes |
| Price adjustment | CPIAUCSL, quarter end, report-quarter dollars | Nominal or constant dollars; quarter end or mean; report-quarter or fixed base |
| Publisher and sponsor | Operator profile | Publisher, methods owner, contact, sponsor name/line and public URL |

These choices are material. A report using third-month employment differs from one using quarterly mean employment. A county/Bay ratio differs from a county/California ratio. A 2019 comparison differs from a 2007 comparison. The saved definition and generated methods make those decisions visible in every edition.

The original NEED San Francisco PDF has differing comparator and baseline labels across its overview, historical tables and methods. Retain that original publication alongside the reviewed profile when matching its house conventions. The default profile states one internally consistent configuration; the source PDF's labels are not silently inferred.

## Produce the first report and its successor

Use the source, CPI and profile SHAs returned by the import commands:

```sh
npx --no-install starforge fred qcew produce \
  --project /absolute/county-report-project \
  --id county-wages-2025-q4 --expected-revision 4 \
  --capture QCEW_CAPTURE_SHA --cpi CPI_CAPTURE_SHA --profile PROFILE_SHA \
  --period 2025-Q4 --chromium /absolute/chromium

npx --no-install starforge fred qcew edition \
  --project /absolute/county-report-project --verify-sources
```

Omit `--chromium` to produce the complete HTML/CSV/JSON/methods edition. A later PDF production request has its own explicit output-format identity and retains the earlier HTML edition. Existing PDF bytes reopen without rerendering.

Produce a later quarter using the same profile and an original source edition that contains the new period:

```sh
npx --no-install starforge fred qcew produce \
  --project /absolute/county-report-project \
  --id county-wages-2026-q1 --expected-revision 5 \
  --capture QCEW_CAPTURE_SHA --cpi CPI_CAPTURE_SHA --profile PROFILE_SHA \
  --period 2026-Q1 --previous FIRST_EDITION_SHA \
  --chromium /absolute/chromium
```

The successor retains its predecessor, both full report models and `changes.json`/`changes.csv`. Different-quarter comparisons explicitly state that QCEW is not seasonally adjusted. When report-quarter dollars are selected, each side retains its own price base.

Every write uses the original FRED operation journal. Retry an interrupted action with the same ID, original revision and unchanged arguments. An already completed action returns its original result. If another writer has changed the project, read its current revision before starting a new action.

## Read, download and hand over the complete project

Each edition directory contains:

| File | Purpose |
| --- | --- |
| report.html | Complete offline report and native print source |
| report.pdf | Native PDF when the edition requested Chromium |
| report.json | Complete exact calculation model and methods |
| data.csv | All calculated region/industry/period values and availability |
| source-rows.csv | The original rows selected for calculations, with source-file identity |
| methodology.md | Editable method statement and original source references |
| changes.json / changes.csv | Full predecessor comparison for a successor |
| manifest.json | Complete file inventory, byte hashes and renderer/input identity |

For example:

```sh
npx --no-install starforge fred qcew download \
  --project /absolute/county-report-project --edition EDITION_SHA \
  --file report.pdf --out /absolute/customer/county-wages-2026-q1.pdf

npx --no-install starforge fred qcew export \
  --project /absolute/county-report-project \
  --out /absolute/handover/complete-economic-project.json

npx --no-install starforge fred qcew receive \
  --project /absolute/received-economic-project \
  --source /absolute/handover/complete-economic-project.json

npx --no-install starforge fred qcew edition \
  --project /absolute/received-economic-project --edition EDITION_SHA --verify-sources
```

Exports are create-only. Use a new filename for a later delivery. The complete project carries existing FRED captures, reviews, recurring templates, release plans and the QCEW original files/profile/report editions. Receiving validates the full original calculations and output packages before committing the project. The same saved report files remain available after independent receive and reopen.

Retrieve an original CSV from its saved source edition:

```sh
npx --no-install starforge fred qcew original \
  --project /absolute/received-economic-project --capture QCEW_CAPTURE_SHA \
  --file ORIGINAL_MEMBER.csv.gz --out /absolute/original-member.csv
```

## Produce multiple editions from one admitted source

Programmatic callers can select every planned report period with `qcewReportRowSelection(profile, period)`, then pass that union to `sealQcewIntakeWithContext`. It returns the complete original capture and a verified `sourceContext`. For an already saved capture, use `readQcewCaptureWithContext`. The installed `./seller/fred/qcew` export includes these helpers and their types.

Pass the same context to source import, report production and source-verified edition reopening. Whole-project export and receiving accept `qcewSourceContexts`, a Map keyed by the original capture SHA. A new export or receiving operation prepares each capture from all of its saved edition selections. This validates each complete original CSV once while retaining only the selected rows and the original classification catalogue. Freshly reopened capture objects still have their complete byte identity checked.

The context remains local to the current process and is never serialized into the saved project or transaction journal. Separate map views cannot modify its verified source. A genuinely new row selection is read from the unchanged complete capture. `qcewCaptureContextStats` reports original files/rows, retained rows and full CSV passes; the complete native journey uses one planned pass across both editions, export, receiving and reopening.

## Run the complete production and receiving journey

The native entry uses the complete original intake and the retained CPI wrapper. It creates or receives the original FRED project, imports both source families, saves the profile, produces 2025 Q4, replays that exact request, produces the 2026 Q1 successor, checks all source calculations, exports the whole project and independently receives/reopens every output.

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/fred/qcew/native-journey.mjs \
  --directory /absolute/county-production-run \
  --intake-directory /absolute/qcew-originals-20261012 \
  --cpi stellar/scf-starforge-20261009/sf30-seller-sdk/fred/sources/cpiaucsl-20261012.public-table.json \
  --profile /absolute/san-francisco-profile.json \
  --chromium /absolute/chromium
```

Use `--original-project /absolute/complete-existing-fred-project.json` to carry an existing exported macro project into the same production journey. Keep the operation directory through any continuation. The command writes the original source and receiving project, complete exports and downloads, `journey.json` and `native-result.json`.

The PDF phase reads the actual native PDF page count and requires four fixed pages plus one page for each selected industry. The default five-industry family therefore requires nine pages. The source files, browser version, HTML input hash and resulting PDF are retained.

## Calculation and original-source conventions

Quarterly mean employment is `(month1 + month2 + month3) / 3`. Average weekly wage from original totals is quarterly wages divided by quarterly mean employment and thirteen weeks. Regional sums use disjoint areas and ownerships before division. Exact rational numerators and denominators are retained; display rounding occurs only at the report boundary.

Government and UI totals use the original special national/state aggregation rows where published. Other combined ownership selections expand into disjoint original components. Before 1995, a reconstructed all-ownership or UI aggregate that would omit unpublished international-government NAICS records remains unavailable. Code/kind validation selects the original sector or three- through six-digit aggregation level.

Publisher disclosure is carried into calculated availability. `N` remains withheld. Historical missing cells in the reconstructed 1990–2000 NAICS records remain unresolved. From 2001, an absent ownership/area cell is treated as no activity only when its complete original area/period source is present and the same industry/aggregation/period classification is observed in the complete retained source catalogue. A missing classification remains unavailable, including a detailed industry code absent from that edition of NAICS. The default complete-coverage policy does not replace a withheld component with zero.

The CPI source retains original frequency, units, seasonal adjustment and missing observations. The included October 2025 CPI observation is missing in the original public table. Quarter-end sampling uses the original December value for 2025 Q4. Selecting quarterly mean preserves the missing October input and marks that quarter unavailable; it does not interpolate.

Original references:

- [BLS original aggregation levels](https://www.bls.gov/cew/classifications/aggregation/agg-level-titles.htm)
- [BLS original ownership definitions](https://www.bls.gov/cew/classifications/ownerships/ownership-titles.htm)
- [BLS supersector and NAICS crosswalk](https://www.bls.gov/cew/classifications/industry/industry-supersectors.htm)
- [BLS original data downloads](https://www.bls.gov/cew/downloadable-data-files.htm)
- [BLS quarterly NAICS field layout](https://www.bls.gov/cew/about-data/downloadable-file-layouts/quarterly/naics-based-quarterly-layout.htm)
- [BLS open-data CSV slices](https://www.bls.gov/cew/additional-resources/open-data/csv-data-slices.htm)
- [BLS disclosure and historical data questions](https://www.bls.gov/cew/questions-and-answers.htm)
- [BLS average weekly wage calculation](https://www.bls.gov/cew/publications/factsheets/fluctuations-in-average-weekly-wages.htm)
- [Original CPIAUCSL public table](https://fred.stlouisfed.org/data/CPIAUCSL)
- [Original NEED San Francisco county wage report](https://www.needecon.org/RegionalReports/San_Francisco_County/QCEWWages_San_Francisco_County.pdf)
