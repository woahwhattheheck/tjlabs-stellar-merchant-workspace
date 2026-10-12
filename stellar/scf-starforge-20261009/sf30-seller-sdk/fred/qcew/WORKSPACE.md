# County report workspace

The County reports section is part of the installed Economic editions application.
It uses the same saved FRED project as the native county-report commands, recurring
briefings, release planning and project handovers. It reads the original BLS
Quarterly Census of Employment and Wages (QCEW) source and the retained monthly
price index.

## Open the existing economic project

Start the installed application through Applications, or use the original command:

```sh
starforge fred serve --project /absolute/economic-project
```

Choose **County reports**. The private session and local-origin checks are the
same as the other economic workspace sections. Existing buyer, facilitator,
merchant, DDP, briefing and release selections continue in that project.

For PDF production, configure the existing Chromium executable when launching
the workspace:

```sh
FRED_QCEW_CHROMIUM=/usr/bin/chromium starforge fred serve --project /absolute/economic-project
```

Use the executable installed on that host. The browser shows whether PDF
production is configured. The PDF is generated from the same finished HTML
report and its native rendering result stays with the report edition.

## Retain the original sources

Acquire the complete original source intake using the included collector and the
exact areas and years required by the report profile. The standard county report
uses the eleven Bay Area, California and United States areas in the collector
and the requested 1990–2026 interval:

```sh
python3 stellar/scf-starforge-20261009/sf30-seller-sdk/fred/qcew/source_fetch.py \
  --directory /absolute/bls-intake --years 1990:2026
```

In **Retain the original sources**, select that complete intake directory on the
workspace host and choose **Import BLS source**. The alternative is a complete
sealed QCEW capture JSON from another economic project. The source engine checks
the original annual archive inventories, compressed CSV members, original
headers, rows, disclosure flags, periods and hashes.

The native intake directory is useful for a large historical source. A sealed
capture upload is retained as its original browser Blob before the HTTP action;
the browser does not convert it into another base64 copy. The source engine's
224 MiB portable capture limit applies to the complete sealed capture. Project
handover input capacity is 480 MiB.

Import the complete original CPI public table or sealed economic capture under
**Import the original price index**, or select a capture already in the economic
project. Production shows captures containing the saved profile's price series.
The report engine uses the original monthly values and its saved quarterly and
dollar-basis selections.

## Save and reuse the report profile

Open the San Francisco template or an existing saved profile. The ordinary form
sets the report name and title, focus-region name and source area codes, baseline
year, historical start, employment and wage methods, regional coverage, price
series and quarterly selection, publisher and sponsor.

The complete definition remains available under **Advanced profile definition**.
Use it for comparator regions, industry and ownership selections, historical
tables and a fixed price base. Choose **Apply definition** to bring those values
into the form, then save the reusable profile. Every saved profile has its own
immutable content identity. Opening an earlier profile and saving a changed
definition creates another profile while keeping its earlier report editions.

The standard profile contains the named nine-county Bay Area, California and
United States comparators, the original industry groupings and same-quarter
2019 baseline. A changed region or definition still uses the source engine's
actual original coverage and classification rules.

## Produce and inspect successive editions

Select the original BLS capture, saved report profile, price-index capture and
reporting quarter. Choose an earlier edition from the same profile when producing
a successor. PDF is an explicit selection.

**Produce complete edition** saves the report and its complete files through the
original FRED transaction. The report engine keeps regional numerators and
denominators together, preserves exact arithmetic, handles original disclosure,
recognizes classification availability and applies the saved CPI convention.

Open any saved report. The browser includes the current industry summary, two
overview charts, paged regional history, original source rows with disclosure
status, the original source-file inventory and predecessor comparisons.
Filtering and pagination affect the browser view; downloads contain all retained
rows. Original CSV downloads come from the retained source capture.

Available report members are:

- report.html: the complete offline report, charts and tables;
- report.pdf: the native PDF when selected;
- report.json: the complete calculated report and source context;
- data.csv: the full calculated regional/industry history;
- source-rows.csv: the original selected source values and disclosure;
- methodology.md: the saved calculation choices;
- changes.json and changes.csv: the complete predecessor comparison for a successor.

**Use as the next edition's predecessor** selects the earlier profile and report
and advances the quarter. Select the next retained source and price capture
before producing that quarter.

## Continue an interrupted browser action

Before a mutating request, the browser retains its original action, ID, project
revision, selected values and complete input Blob in IndexedDB. The workspace
also saves the complete original request in the private project directory before
calling the original economic transaction. One host input is retained at a time,
with its original request identity and operation history.

After a server restart, the new workspace session reads that host input even when
its local port or browser profile changed. **Continue saved action** uses the
same original ID, revision, source and profile. Once the original project
transaction completes, its saved result provides recovery and the temporary
host input is released. The actual sources, profiles and reports remain in the
economic project.

Choose **Continue saved action** to receive the completed history result or send
the same original request again. The native transaction matches the original
ID and payload and returns its saved result. A pending import still uses the
same original source; a pending PDF keeps the selected edition and renderer.

The browser distinguishes an unsent preparation, a fully returned error and an
unresolved request. Clearing removes an ended browser and host input after the
original project operation has completed or been explicitly abandoned. The existing History section retains the
original explicit abandonment operation when an operator chooses to abandon a
failed project action. A server-side action begun by another browser or command
is continued by its original source selection.

The profile definition, local intake and receiving-directory choices, and chosen
reporting quarter are saved separately as editable browser work. They never
replace a retained submitted action.

## Hand over and receive the whole project

**Download complete project** uses the original FRED project exporter. It carries
the full selected source families and existing economic work, every QCEW source,
all report profiles and report files, and the original predecessor history.

Select the complete handover and a new absolute private directory under
**Hand over the complete project**. **Receive complete project** calls the
maintained whole-project receiver from an original project transaction. Its
deterministic receiving record and completed source project operation recover a
lost response without creating another project. Receiving validates the
original bundle and source families, reopens the received project and returns
its report inventory.

Choose that received directory in Applications to continue its report work.
The same original project ID, reports, source captures and source-family
receiving histories remain available there.

## Integration

The HTTP adapter is qcew/workspace.mjs; the browser controller is ui/qcew.js.
The existing workspace owns authentication, the single active action and
shutdown. The adapter calls the original QCEW project APIs and FRED transaction
and receiving functions. The process-local QCEW source context never travels in
HTTP requests, browser records or project JSON.

The report read endpoint serializes the selected report table and small metadata,
rather than every saved file body. Complete files are downloaded individually
through the maintained member reader. Original file and whole-project downloads
use the original source and export APIs.
