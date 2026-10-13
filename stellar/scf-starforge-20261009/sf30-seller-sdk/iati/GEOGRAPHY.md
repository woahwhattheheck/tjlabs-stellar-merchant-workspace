# IATI geography reviews

The Geography panel turns complete IATI 2.03 activity locations into a saved review.
It uses the same publisher source store, native dataset builder, private server,
typed client, CLI and merchant agent connection as the existing IATI console.
The work product is a named review with exact source editions, coverage, location
findings, revision history and a complete portable handover.

## Operator workflow

1. Retain the publisher's original IATI 2.03 XML through the existing Sources panel
   or source command. The source ID is the SHA-256 of the complete original bytes.
   Record the actual publisher, source URL, retrieval time, licence and citation.
2. Create a Geography review with one or more source editions. Select exact activity
   identifiers and narrative language if needed. A linked financial portfolio
   supplies its exact source editions and activity selection.
3. Inspect the coverage report, reported-coordinate map and complete location
   register. Search by activity, title, organisation or location; filter coordinate
   status, exactness, class, reach and finding decision. Open the full location
   details to inspect the original narratives, gazetteer IDs, administrative areas,
   point, classifications, extensions and activity context.
4. Record a named finding against the exact source and row: accepted,
   needs-correction or note. Review status, reviewer and review note describe the
   whole saved review separately. Saving appends a revision.
5. Compare earlier and later revisions. Identical publisher sources pair
   automatically. Select explicit before/after pairs for replacement sources.
   Unpaired sources remain complete additions or removals. Inspect complete
   native row changes and source-bound finding changes.
6. Export the complete packet for another workspace, the offline interactive HTML,
   GeoJSON, CSV or JSON. Receive the packet in the original IATI application and
   continue the same review. The handover includes original source XML, every
   preceding review revision, original requests, saved comparisons and any linked
   portfolio.

The map displays every returned valid reported point. The register retains
locations with administrative, gazetteer or narrative evidence and activities
with no location. The offline HTML also supports reviewing these complete records
and downloading a full review-update request for the original application.
GEOGRAPHY_UI.md documents the console controls and typed client.

## Geographic source contract

The implementation follows the official IATI 2.03
[location element](https://iatistandard.org/en/iati-standard/203/activity-standard/iati-activities/iati-activity/location/),
[point element](https://iatistandard.org/en/iati-standard/203/activity-standard/iati-activities/iati-activity/location/point/)
and [position](https://iatistandard.org/en/iati-standard/203/activity-standard/iati-activities/iati-activity/location/point/pos/).
One location is one complete associated record. Repeated gazetteer IDs and
administrative classifications remain attached to their original location.

| State | Meaning in this product |
| --- | --- |
| valid | One point, one position, the IATI CRS, and two finite in-range coordinates |
| missing | A reported location has no point |
| invalid | A reported point contradicts the CRS, position, numeric, range or cardinality rules |
| not-reported | The activity has no location; one explicit absence record keeps it in coverage |

The source position is latitude then longitude, in
http://www.opengis.net/def/crs/EPSG/0/4326. Latitude must lie between −90 and 90;
longitude between −180 and 180. Zero is a valid coordinate. Other CRSs and
ambiguous multiple positions remain visible for review. Original numeric text
and full XML association travel with the record.

[GeoJSON RFC7946](https://www.rfc-editor.org/rfc/rfc7946) uses longitude then
latitude. The export writes that order with the source decimal precision and
uses null geometry for records that cannot be mapped. Every such record remains
in the FeatureCollection and its complete properties.

Publisher [exactness](https://iatistandard.org/en/iati-standard/203/codelists/geographicexactness/)
code 1 means Exact and 2 means Approximate.
[Location class](https://iatistandard.org/en/iati-standard/203/codelists/geographiclocationclass/)
codes identify administrative region, populated place, structure and other
topographical feature.
[Location reach](https://iatistandard.org/en/iati-standard/203/codelists/geographiclocationreach/)
distinguishes activity from intended beneficiaries. Coordinate decimal places
do not establish the publisher's exactness or beneficiary reach.

The mapper preserves the complete location object, including extension elements.
Unknown or repeated classifications produce review issues while their originals
remain available. Gazetteer IDs and administrative entries keep vocabulary and
code. Activities with no location remain explicit in coverage. Source filenames
and source labels are inventory metadata; acquisition records carry the actual
publisher attribution chosen by the operator.

## Identity and revision behavior

A unique publisher location ref within an activity identifies the row. When a
ref is missing or repeated, identity uses the complete associated location
content and its occurrence. Formatting-only whitespace between known structural
elements does not create a new content identity; original record text is still
retained. The full publisher source ID remains a separate part of every finding.

A finding selects source plus rowId. It belongs to that exact immutable edition.
Changing the selected source or activity set requires the operator to review
which findings remain applicable. A repeated IATI activity identifier across
selected publisher editions is rejected so one review cannot silently duplicate
the same activity. Multiple locations within one activity are expected.

All original save requests carry a requestId. The complete request body has one
retained SHA-256. An exact replay returns its original historical revision,
including after independent packet receiving. Reusing a requestId for another
body is rejected. Editing requires the review ID and current expectedRevision.
The saved request lookup returns its original body and result, or NOT_RECORDED.

A linked financial portfolio is identified by its exact ID and revision.
Geography uses that portfolio's full source editions and activity selection;
its report links to the portfolio's financial review and counts. Amounts retain
their original activity, currency, transaction type and financial grouping.
Location rows contain activity context without allocating amounts across points.

## CLI

Use the existing private workspace and Python/Node installation. The original
mapper locates the shared XML modules. SF30_XML_NODE can select the original
Node 22+ executable where it is not already on PATH.

~~~bash
python iati/cli.py --workspace /absolute/private/iati-workspace geography-state
python iati/cli.py --workspace /absolute/private/iati-workspace geography-save --file geography-request.json
python iati/cli.py --workspace /absolute/private/iati-workspace geography-review --id REVIEW_ID
python iati/cli.py --workspace /absolute/private/iati-workspace geography-history --id REVIEW_ID
python iati/cli.py --workspace /absolute/private/iati-workspace geography-report --id REVIEW_ID --revision 2
python iati/cli.py --workspace /absolute/private/iati-workspace geography-request --request-id ORIGINAL_REQUEST_ID
python iati/cli.py --workspace /absolute/private/iati-workspace geography-rows --file rows-query.json
python iati/cli.py --workspace /absolute/private/iati-workspace geography-points --file rows-query.json
python iati/cli.py --workspace /absolute/private/iati-workspace geography-compare --file compare-request.json
python iati/cli.py --workspace /absolute/private/iati-workspace geography-comparison --id COMPARISON_ID
python iati/cli.py --workspace /absolute/private/iati-workspace geography-changes --id COMPARISON_ID --native NATIVE_COMPARISON_ID
python iati/cli.py --workspace /absolute/private/iati-workspace geography-export --id REVIEW_ID --format packet
python iati/cli.py --workspace /absolute/private/iati-workspace geography-export --id REVIEW_ID --format geojson --out /absolute/output/locations.geojson
python iati/cli.py --workspace /absolute/private/iati-workspace geography-receive --file /absolute/input/geography.zip
~~~

The uppercase identifiers and paths in these examples select the actual values
returned by the original source/review operations. Creating a new private
workspace uses the existing init command before receiving.

### Save request

A create request omits id and expectedRevision. An edit supplies both and a new
requestId. All sources are actual original source hashes.

~~~json
{
  "requestId": "geography-review-operator-001",
  "name": "Publisher location review",
  "notes": "",
  "sources": ["SOURCE_SHA256"],
  "selection": {"activityIds": [], "language": "en"},
  "portfolio": null,
  "acquisition": [{
    "source": "SOURCE_SHA256",
    "publisher": "Original publisher name",
    "url": "Original source URL",
    "retrievedAt": "2026-10-12T12:00:00Z",
    "license": "Actual publisher licence",
    "citation": "Actual source citation"
  }],
  "review": {"status": "draft", "reviewer": "", "note": ""},
  "baselineRevision": null,
  "findings": []
}
~~~

The acquisition values above illustrate field placement. Enter the actual
source's attribution and retrieval time. An omitted acquisition value remains
empty. A reviewed or needs-correction status requires a named reviewer.

~~~json
{
  "id": "REVIEW_ID",
  "revision": 2,
  "search": "clinic",
  "coordinateStatus": "valid",
  "decision": "unreviewed",
  "offset": 0,
  "limit": 100
}
~~~

Rows and points return rows, total and nextOffset. Continue nextOffset until
null. A points response contains compact map labels and coordinates; a rows
response contains all original associations. Full exports contain the complete
selected review, independently of interactive search or paging.

~~~json
{
  "id": "REVIEW_ID",
  "beforeRevision": 1,
  "afterRevision": 2,
  "pairs": [{"before": "EARLIER_SOURCE_SHA256", "after": "LATER_SOURCE_SHA256"}]
}
~~~

The comparison returns complete counts, definition changes, finding changes and
native comparison IDs. Native changes can be paged through geography-changes;
all changes are also retained in the complete packet.

## HTTP and typed agent access

All routes use the original server's local bearer-authenticated connection and
existing request/body protections. The base is /api/iati/geography/.

| Method and route | Result |
| --- | --- |
| GET state | Workspace identity, source contract and saved review summaries |
| GET reviews/ID?revision=N | Complete selected saved review |
| GET reviews/ID/history?revision=N | Full chronological history through the selection |
| GET reviews/ID/report?revision=N | Recomputed original coverage and finding report |
| GET requests/REQUEST_ID | Original save request and historical result |
| POST reviews | Save a complete review request |
| POST rows / points | Query one exact saved revision |
| POST compare | Save an original native revision comparison |
| GET comparisons/ID | Complete saved comparison |
| GET comparisons/ID/changes?native=ID&offset=0&limit=50 | Page native record changes |
| POST export | Create or reuse the full requested export |
| GET download/ARTIFACT_ID | Stream the completed original file |
| POST receive | Receive JSON with an original path, or an application/zip body |

An export request selects id, optional revision, format and optional output.
Its descriptor includes artifact ID, original filename, exact bytes, SHA-256,
content type, review/revision, full selection SHA and download URL. The artifact
ID identifies the original selection, format and output path; the file SHA
identifies the complete bytes. The completed download response also carries X-Content-SHA256.

The existing merchant agent connection provides fourteen geography tools:
state, reviews, review, history, report, request, save, rows, points, compare,
comparison, changes, export and receive. All use the existing workspace alias.
Save and compare take the complete definition object. Rows and points take the
complete query object. Export retains the whole returned file through the
original file carrier, so it can be downloaded with merchant_source_file_read
or received into another configured workspace.

The original generic merchant_source_import also accepts a retained geography
packet. File paths in the host connection configuration remain host-selected.
Agent export/receive uses the configured original file handles and retained
export IDs.

## Portable handover and reopening

The packet schema is stellar-forge.iati-geography-packet.v1. manifest.json
identifies the complete selected review and every member's byte count and
SHA-256. The archive contains:

- review.json, history.json, requests.json and comparisons.json;
- source-contract.json and acquisition.json;
- locations.jsonl, locations.csv, locations.geojson and review.html;
- every complete original publisher XML and source inventory under sources/;
- every selected and preceding original native location packet under packets/;
- complete linked financial portfolio packets under portfolios/;
- complete original native comparison changes under changes/;
- a handover README.

Receiving verifies the complete member inventory, reconstructs native editions
with the original engine, normalizes each original definition, recomputes all
coverage/findings and complete comparisons, and reproduces the human-readable
handover. It then adds the coherent history and original save requests to one
database transaction. Existing divergent revisions are preserved and must be
reconciled by a new edit against the current review. Additional comparisons
already saved in the receiving workspace remain intact.

The exact incoming archive is retained as its original completed export.
Receiving it in a fresh workspace and exporting the same unchanged selection
therefore returns the same whole archive bytes. A later edit or additional
comparison produces another selection. Interrupted file publication uses the
existing export lock and complete staged file; an existing different handover
requires a different output filename.

Current capacities are inherited from the original product: 256 MiB publisher
XML, 64 MiB complete review/request metadata, up to one million selected native
rows, interactive pages up to 1,000 rows within 8 MiB, and 4 GiB expanded
portable handovers. Native comparison pages use the original 250-row/2 MiB
carrier. The complete native mapper bounds each projected cell at one million
UTF-16 code units. Exceeding a capacity returns an explicit original operation
error while the retained source remains available.

## Original source exercise

The repository includes the complete 2016 AidData Nigeria publisher XML,
its original source metadata and attribution at examples/aiddata-nigeria-2016/.
The native geography journey uses those actual bytes through the original
parser, dataset engine, saved review, HTTP/CLI/agent connection and independent
packet receiving. Deliberate boundary inputs exercise zero coordinates,
unlocated and invalid positions, changed selections, original request replay and
a cold reopen. The runtime result belongs to the executed journey and its
returned complete output.

## Receiving publisher metadata and spreadsheet text

Each saved review retains the complete original publisher source inventory, label,
filename and creation timestamp. The complete packet binds those values into its
selection identity and reconstructs the inventory from the original XML on receive.
Later edits and exports keep that source metadata within this review, while an
existing receiving workspace keeps its own source labels. Derived CSV text uses
the application's spreadsheet neutralization; JSON and publisher XML retain the
original strings. The original export lease finishes its exact private publication
stage after interruption, so the same complete export can continue.

Run the complete original workflow from the repository root:

```sh
python3 -B stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/geography.py \
  --output /absolute/private/geography-receiving \
  --browser-driver /absolute/repository/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/geography-browser.mjs
```

The receiving directory holds the complete owner and independent workspaces,
actual native reports, portable files, typed-client and agent transfer results,
and browser handover. Select a new private output directory for a changed source
edition; retain the earlier run and its complete publisher and request identities.
