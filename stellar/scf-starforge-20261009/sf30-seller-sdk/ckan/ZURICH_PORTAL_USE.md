# Zürich portal-use customer workflow

This extension carries the original Statistik Stadt Zürich package dictionary
through the maintained CKAN workbench, reviewed publication, dataset pages and
customer Analysis workspace. It retains both complete selected date editions.

## Selected source

| Item | Selected value |
| --- | --- |
| Catalogue | https://data.stadt-zuerich.ch |
| Package | prd_ssz_ogd_katalog_downloads |
| Package ID | e9daec62-5224-4698-87c4-a48644aee724 |
| Resource ID | 35b3d9e2-966f-40fd-a3fc-0daeeae0d66b |
| Selected dates | 2026-10-10 and 2026-10-11 |
| Complete selected records | 3,821 and 4,389 |
| Original download requests | 9,627 and 10,427 |
| Original source licence | CC0 |

The original package and all DataStore page responses are retained with each
capture. The programme consumes those saved captures; it does not download the
whole annual resource. Its fixed capture hashes identify this original programme.

The source describes daily download/API request records derived from NGINX logs.
Internal portal requests are filtered; external crawlers remain. IP addresses are
not stored. Preserve the original date labels: the package does not declare a
separate timezone for these fields.

## Meaning and projection

The source profile applies only to https://data.stadt-zuerich.ch packages carrying
the original JSON string sszFields. It binds entries by their explicit technical
field name. All entries remain visible with their original label, description,
binding state and dictionary identity.

The existing CSVW annotation and DataStore fields[].info keep their precedence.
A conflicting original annotation becomes a review issue and remains retained.
Unknown, malformed and ambiguous package entries remain review issues. The
extension does not infer data types from German labels or descriptions.

The programme examines both complete periods before selecting one stable
projection. The original _id maps to record_id. All other technical names remain
unchanged. Where null and empty string coexist, the existing JSON encoding
preserves them separately. Source count strings remain source count strings.

The customer SQL decodes the selected scalar representation explicitly and uses
an integer conversion for hit_count only after the complete source values have
been checked as nonnegative exact integers.

hit_count counts download requests within the source's recorded grouping.
Repeated requests remain requests. distinct_ips retains its exact original
per-record meaning. It is not summed across rows or periods into a count of
people or unique cross-period users.

Resource comparison uses the CKAN resource UUID when it is present. A missing
UUID uses the exact dataset_name/resource_name pair and is labelled accordingly.
The complete resource export preserves every resulting group, including the
missing-UUID rows. Label variants are reported explicitly.

## Operate the retained publisher programme

Use the maintained checkout with Node 24 and the original system utilities.
Keep the source capture directory together with its original capture.json,
publisher metadata and pages. The source capture archive expands to
liip-zurich-source-captures/.

From the repository root:

    node stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/examples/zurich-portal-use.mjs \
      --captures /srv/liip/liip-zurich-source-captures \
      --directory /srv/liip/portal-project \
      --out /srv/liip/publisher-delivery

Use private directories. Reuse the same arguments to continue this original
programme. The workbench remains the authority for original edition, source,
publication, export and refresh IDs. Completed pages are reopened through SF100;
their original cursor, snapshot and semantic binding must match.

The programme imports both saved editions, reviews their common projection,
publishes the first original dataset, and accepts the second through the existing
reviewed refresh. That comparison explicitly retains the changed date selection.
Added and removed _id values describe those selected windows.

Each original merchant package is compiled using the unchanged public SF61
onboarding selection in service-selections.example.json. The local programme
then obtains all customer pages from that package's original retained handler.
A customer deployment uses the merchant's own published terms and service URL.

The publisher output includes both complete SF100 deliveries, raw handler
responses, per-period scan records and Zurich_Publisher_Workspace.ckanw. The
native archive/receiving API opens the complete publisher history at a second
directory and rechecks both published datasets and their source meaning.

## Operate the editable customer report

Set PYTHONPATH to the original Python package in this checkout. Use a Python
runtime with the original workbook dependency, openpyxl.

    PYTHONPATH=stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python \
    python stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/examples/zurich_portal_use.py \
      --programme /srv/liip/publisher-delivery/publisher-programme.json \
      --database /srv/liip/customer-workspace \
      --out /srv/liip/customer-delivery

This is the existing AnalysisWorkspace, DatasetDatabase, AnalysisReports,
QueryExport, AnalysisWorkbooks and WorkspaceArchives workflow. Its stable
request IDs reuse the completed original jobs when the command resumes.

The customer gets five editable saved queries:

| Query | Purpose |
| --- | --- |
| PortalObservations | Every original selected source record with its explicit decoded meaning |
| PortalDaily | Daily records, download requests, resource groups and source coverage |
| PortalResources | Complete resource comparison for both days |
| PortalResourceMovements | Forty largest absolute request changes, with stable group identifiers |
| PortalRequestShape | Original SQL-field presence and request counts by date |

The report keeps both complete dictionaries and exact imported source versions.
Its introduction records the counting and grouping decisions. The complete
observation export contains all 8,210 records. The separate resource export
contains all comparison groups. Both carry JSONL, CSV, SQLite and source lineage.

The original workbook engine uses the runtime's temporary directory while
streaming worksheet XML. Set TMPDIR to a private writable location with enough
space for the full worksheet data when operating on a constrained host. After
correcting a terminal workbook failure, add --retry-workbook to this customer
command. It retains the failed original job and builds one new child attempt
against the same saved workbook definition. Later invocations reuse that
selected attempt and all completed import, query and report jobs.

Saved report and workbook definition files contain their immutable definition
and content hash. A previously delivered full definition wrapper keeps its
original bytes when that definition and hash match.

The three-sheet workbook contains source observations, the full resource
comparison and daily totals. Its editable XLSX travels with its original
definition, sources and complete workbook handover. Spreadsheet text safety and
type handling remain owned by the original workbook engine.

The customer output also includes HTML/JSON/CSV report exports, editable SQL,
the original report/workbook definitions, and Zurich_Customer_Workspace.zip.

## Receive and reopen the complete customer application

Use the native receiver against the exact delivered archive hash:

    PYTHONPATH=stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python \
    python -m stellar_forge_buyer.workspace_archive_receive receive \
      /srv/liip/customer-delivery/Zurich_Customer_Workspace.zip \
      /srv/liip/customer-received --sha256 ARCHIVE_SHA256

The destination is an absent private directory. Preserve the returned receiving
operation ID to resume that same transfer. The original receiver preserves later
customer changes after a completed receiving.

Open the editable application:

    PYTHONPATH=stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python \
    python -m stellar_forge_buyer.analysis_workspace \
      --database /srv/liip/customer-received serve --open

The application creates its ordinary new local launch capability. Saved source
versions, queries, report publications, workbook definitions and complete output
files keep their original identities. The included programme cold-reopens the
archive and checks both meanings, daily totals, every complete query export and
the workbook before marking the customer delivery COMPLETE.

Use the saved query and report revision controls for subsequent edits. For a
new source period, capture the actual selected source once and use the existing
reviewed CKAN refresh and customer version controls. Keep this programme's two
original captured periods and completed outputs intact.
