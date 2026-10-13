# Belleville public-source asset workspace

## Start with the complete source

This is the maintained municipal asset/work-order application with a complete Belleville Waterfront Trails intake. It retains the original public GIS capture, makes every source record and attribute available for mapping review, and carries the selected source through an editable backup and readable handoff. The same application receives the actual target inventory and returned work-order records when those originals are supplied.

The source capture contains the original layer definition, count, two complete OBJECTID reads, all attribute pages, original attributes JSON/CSV, audit and capture manifest. The importer reconciles all provider pages against the complete recorded population. Capture timestamps keep the values actually recorded by the source owner.

The public layer identifies its projection as EPSG:26918. The original attribute capture keeps geometry empty. A later complete geometry edition preserves that entire original capture and adds the City’s explicit WGS84 query responses, with every OBJECTID and typed attribute reconciled before import. The record identity combines the original layer URL and OBJECTID. AM_ID, Asset_ID and Segment_ID remain separate original attributes, including repetitions, blanks and nulls. The application does not interpret Condition as work-order status or sum replacement values across repeated asset labels.

## Open the application

Use Python 3.11 or newer. The package uses the standard library and local browser assets; the capture continuation uses native POSIX or Windows file locks.

From the extracted application directory:

```sh
python -m workspace init /absolute/private/belleville-workspace
python -m workspace serve /absolute/private/belleville-workspace --port 8766
```

The existing application prints its local address and operator-password filename. Open the address and use that locally generated password with your operator name.

Create a project with **Public reference records**, then choose **Inputs & mapping**. Select **Source assets**, **belleville-capture**, and the complete carrier JSON. The importer receives every original byte in that carrier. Review the suggested mapping and press **Save mapping**:

| Mapped field | Original field | Meaning |
| --- | --- | --- |
| id | __source_identity | Source URL plus original OBJECTID |
| label | ParkName | Original park name, including blank |
| attributes | __original_attributes | Every original typed attribute in one complete object |
| geometry | __geometry for a geometry edition; empty for the attribute edition | Complete provider polylines in WGS84 |
| status, parent_id, location_id, updated_at | Empty | Populate only from the agreed actual source contract |

**Overview** shows the full population, source identity, original field definitions, blank counts and repeated occurrences. **Assets & records** searches all mapped values and opens the typed attribute object for each original record. A public source without a selected target stays available for review and export; its overview identifies the target as awaiting selection.

## Receive the complete capture in one command

The capture command accepts the original complete capture directory, its full JSON carrier, the saved LZSS16 transport JSON, or the full saved Canvas Markdown containing that transport. The loader decodes the exact original carrier and checks its whole byte count and SHA256 before importing it. The browser's belleville-capture input accepts the same saved transport files. Initialize the workspace once using the command above, then run:

```sh
python -m workspace capture /absolute/private/belleville-workspace \
  /absolute/private/Belleville_Original_Capture.json \
  --output /absolute/private/belleville-handoff \
  --actor "Public source receiving" \
  --operation BELLEVILLE-ASSET-INTAKE-90ED-20261013 \
  --reopen-at /absolute/private/belleville-received
```

This command imports the complete source, saves the explicit source-qualified identity/label/attribute mapping, includes attributes in subsequent comparison, writes the complete HTML report and handoff, saves an editable database backup, and reopens that backup in the separate destination. The reopened check reads the original input bytes, selected mapping and full unique identity population through the maintained application.

Use the same arguments and operation ID after an interrupted response. Concurrent continuations of that same operation serialize under an operating-system lock before reading the journal. Each original mutation keeps its saved operation and expected revision. The command retains complete output bytes before publishing their journal references; absent output files can be restored from those originals. A changed existing output produces a concrete file conflict. A restored workspace is fully verified in a staging directory before the complete directory is published; interruption leaves the final destination absent or complete.

For a later original source edition in the same case, supply a distinct operation ID and **--project ORIGINAL_PROJECT_ID**. The existing application retains prior input versions and history. It never turns a failed or incomplete capture into the next selected edition.

To use the reopened workspace in a browser, run the existing restore command into a new destination; this generates its normal local operator password:

```sh
python -m workspace restore \
  /absolute/private/belleville-handoff/Belleville_Editable_Workspace.zip \
  /absolute/private/belleville-browser-received
python -m workspace serve /absolute/private/belleville-browser-received --port 8767
```

## Add the complete geometry edition to the same project

The later carrier has schema **municipal-source-geometry.v1**. Its **original_capture** contains the complete unchanged attribute carrier. Its **geometry_manifest** selects geometry/capture.json, and its files array retains every geometry response, the complete derived GeoJSON, the audit and manifest. The recorded whole original-capture identity uses compact UTF-8 JSON with its retained object-key order; individual original members keep their own exact bytes and hashes.

The current public-source edition includes all 2,262 objects, 16 ordered geometry pages and two complete surrounding OBJECTID observations. All ten original typed attributes equal the retained attribute capture. Its 2,296 paths contain 14,821 positions. These are the complete selected public Waterfront Trails objects.

The provider request specifies returnGeometry=true, outSR=4326, returnTrueCurves=false and OBJECTID order, without coordinate rounding, quantization or a maximum-allowable-offset simplification. The importer checks the actual response spatial reference, complete consecutive offsets, original before/after IDs, source attributes and every derived GeoJSON feature. It retains each polyline's separate paths as a MultiLineString. It requires finite two-dimensional longitude/latitude positions, rejects true-curve or quantized responses, and requires separate review of changed Z/M dimensions. It neither interprets a measure as altitude nor projects EPSG26918 coordinates itself.

Every source object remains a row. A native null geometry stays an explicitly counted absence and is never replaced or used to drop the object. The current edition has zero absent geometries. The overview, full map and portable report expose their geometry coverage.

Use the existing initialized workspace and the **project_id** from its original intake-result.json. Select a distinct output/reopen directory and a stable operation ID for this later edition:

~~~sh
python -m workspace capture /absolute/private/belleville-workspace \
  /absolute/private/Belleville_Complete_Geometry_Source.json \
  --project ACTUAL_SAVED_PROJECT_ID \
  --output /absolute/private/belleville-geometry-handoff \
  --actor "Public source receiving" \
  --operation belleville-geometry-edition-1 \
  --reopen-at /absolute/private/belleville-geometry-received
~~~

The saved full Canvas Markdown or LZSS16 transport is accepted in place of the raw source JSON. Use the same arguments after interruption. The prior source selection and its exact SHA are retained in the intake journal. The reopened workspace verifies the prior source bytes, all current source-qualified IDs, original typed attributes and every mapped geometry. The command also writes **Belleville_Original_Geometry.geojson** with its complete original derived file bytes. The backup contains earlier source versions, current selection, mapping and history.

In the browser, choose the existing project → **Inputs & mapping** → **Source assets** → **belleville-capture**, select the complete geometry carrier, then save its suggested mapping. Geometry maps from **__geometry**. Existing input versions remain in the source selector.

Open **Assets & records**. The table and initial map show the current page. **Map all matching records** reads the full matching population under one project revision and displays every geometry; a changing revision causes a clear refresh request. Search and dataset changes discard an unfinished older map. Each path opens its original source-qualified record and full typed attributes. The full map displays absent or unsupported geometry counts.

The portable **Complete report** includes the whole selected source polyline map and all records, independently of table pagination and browser filters. SVG display coordinates fit the page; the source carrier and GeoJSON retain all original coordinate values. Readable source metadata keeps original EPSG26918 and provider-returned EPSG4326 separate.


## Refresh the complete public layer in the same project

**Public refresh** continues this maintained application from the existing saved Belleville project. It receives a fresh complete source edition, preserves that project's explicit field mapping and operational settings, and writes the full report, handoff, editable backup and independently reopened workspace. It uses Python's standard library and the actual City public endpoint.

In the browser:

1. Open the existing Belleville project. Under **Inputs & mapping**, review and save the original source mapping. Keep the source-qualified OBJECTID as the asset identity.
2. Open **Public refresh** and select **Start complete refresh**. The request retains its original operation, operator, project revision and mapping before acquisition starts.
3. The panel shows received attribute/geometry rows, the actual request stage and any provider retry time. Each completed provider response remains durable. The native operator continues while the browser is closed; after the server restarts, choose **Resume original operation**.
4. When acquisition and receiving finish, download **capture**, **source archive**, **report**, **handoff**, **workspace**, **geometry** and **result** under **Complete saved files**. **Open updated project** loads the saved current edition.
5. If the project was edited during acquisition, the complete source remains saved. Reload the current project, inspect/save its mapping, then choose **Use saved source with current mapping** on the retained operation. That creates a distinct receiving request for the same captured bytes and current revision; it performs no further City acquisition.

The browser retains an unresolved start/resume request in local storage before sending it. **Retry original request** uses the identical operation and body after response loss, including after reloading the browser. Requests are retained separately by original operation, actor, project and origin. A definite invalid request is reported, and a network error keeps the original request available.

### Native command and resumption

Run from the installed application's opportunity directory. Use the actual saved project ID and current revision shown by the existing application:

~~~sh
python -m workspace refresh /absolute/private/belleville-workspace \
  --project ACTUAL_SAVED_PROJECT_ID \
  --actor "Public source receiving" \
  --operation belleville-public-refresh-1 \
  --expected-revision ACTUAL_CURRENT_REVISION
~~~

The default attribute page width is 500; geometry width is 100. The service's actual maxRecordCount caps both. Each can be set explicitly with --page-width and --geometry-width when the operation is first prepared; resume keeps that original choice.

After interruption, continue the same operation without reconstructing its saved selection:

~~~sh
python -m workspace refresh-resume /absolute/private/belleville-workspace \
  --operation belleville-public-refresh-1

python -m workspace refresh-status /absolute/private/belleville-workspace \
  --project ACTUAL_SAVED_PROJECT_ID
~~~

The command waits until an actual provider Retry-After time when present, then continues the original GET. Transient network/server errors use retained backoff. Add --no-wait to return the saved waiting state for later resumption. The command exits unsuccessfully for a source/receiving error and prints its complete saved status and directory.

To use a complete saved source after reviewing a newer project revision:

~~~sh
python -m workspace refresh /absolute/private/belleville-workspace \
  --project ACTUAL_SAVED_PROJECT_ID \
  --actor "Public source receiving" \
  --operation belleville-public-receive-2 \
  --expected-revision ACTUAL_CURRENT_REVISION \
  --source-operation belleville-public-refresh-1
~~~

This selects the original complete carrier and acquisition archive from the same project. The source operation remains intact; the new operation records its own original current mapping and exact expected revision.

### Original source and receiving contract

Acquisition retains original HTTP URLs, ordered parameters, actual start/receive times, response status/headers, complete response bodies and all failed/retried attempts. It reads layer metadata, a whole count, complete before/after OBJECTID lists, every ordered attribute page, then complete before/after IDs around every WGS84 geometry page. The final metadata observation is retained with the acquisition archive.

Every selected object retains the ten original typed attributes. The geometry observation must equal its corresponding complete attribute row. The native request specifies outSR=4326, returnTrueCurves=false, returnZ=false and returnM=false; returned projection, plain two-dimensional paths, order and completion are validated by the existing capture contract. Null geometry remains attached to its original OBJECTID and is counted explicitly. No missing object is silently discarded. Original source projection and provider-returned projection stay separate.

The current layer advertises ordered pagination and has no historic-moment snapshot or published lastEditDate. Thus the result describes the complete observed population and cross-observation reconciliation. It records the timing of each page; stable IDs do not establish that every geometry existed at one atomic instant. If an actual future metadata edition publishes lastEditDate, a change between the two observations stops that source selection. Changes to selected field definitions or projection also stop receiving.

The completed carrier is the same accepted municipal-source-geometry.v1 format, with its full nested municipal-source-capture.v1 attribute edition. The maintained parser independently validates all selected bytes, request parameters, row identities, raw attributes and derived GeoJSON before the project is modified.

Receiving chains the original expected revision through input, mapping and contract writes. It reuses the saved original field mapping, whitespace/status choices, comparisons, transitions, attestations, target count and correlation IDs. Only expected source count changes to the newly received population. A changed project revision produces a retained source-ready result for operator review. Previous source versions and operational history remain available.

A process lock serializes continuation of the same operation on POSIX and Windows. Source acquisition, archive publication, original intake and completion have durable checkpoints. Each published output has an immutable retained copy before its journal reference. Resumption restores missing exact output files; an existing changed file remains a visible conflict. The source archive freezes its original acquisition ledger once. A completed replay restores its selected outputs and derived result without dispatching another native project mutation.

### Refresh outputs and preservation

| File | Complete contents |
| --- | --- |
| Belleville_Refreshed_Source.json | Current whole accepted attribute+geometry carrier |
| Belleville_Complete_Public_Source.zip | Every original selected source member, complete carrier, all native HTTP attempt bodies and frozen acquisition journal with metadata/timing/status |
| Belleville_Asset_Handoff.html | Complete selected project, source records, map, explicit mapping, findings and decisions |
| Belleville_Asset_Handoff.zip | Maintained full original/mapped/operational handoff |
| Belleville_Editable_Workspace.zip | SQLite workspace with all retained source versions, mapping, history and native operation results |
| Belleville_Original_Geometry.geojson | Full provider-derived WGS84 population with original attributes |
| refresh-result.json | Original completed receiving selection, file identities and independent reopen location |

The private operation directory is under public-refresh/<operation digest> inside the original workspace. Keep that entire directory together with the workspace to resume an interrupted native acquisition. The normal editable workspace backup carries the complete accepted source and project history; the separate source archive carries raw acquisition attempts and timing. Both belong to the complete handoff. A reopened completed project can start its next new refresh in its own workspace.

The existing D1CC/G2 customer receiving programme and its saved actual project remain the implementation destination. Use this refresh as its next distinct source operation after the maintained source and geometry edition; it does not replace the earlier receiving selection.


## Continue to actual target and work-order receiving

Import the supplier's original target export under **Target assets**. Map its retained source key to the same source-qualified identity carried in the mapped source export. Keep the supplier's own asset ID in its original attributes or supplied cross-reference; it need not replace the source key. Review the actual cross-reference if the supplier uses a different identifier structure.

Map the target's complete original-attribute object when that exchange preserves it. If the agreed target intentionally stores a subset, record the agreed field comparison in **Contract & handoff**, retaining the full source and target originals. Source-only review does not mark a target migration accepted.

The existing **Review & repair** flow shows exact missing keys, different mapped values and relationship issues. Saved repair proposals stay separate from source records; import the vendor's corrected original export to reconcile a repair. Repeated source asset or segment labels never merge rows automatically.

Locations, service requests, work orders and returned records use the maintained documented exchange contract in README.md. An actual work-order return matches its original change ID, asset, requested status and expected revision. Its provider reference is retained. Original status requests, applied/rejected outcomes and later source selections remain in history.

Use the original checker and release action when the actual engagement supplies its original target and round-trip records. For current source review, **Download current handoff**, **Complete report** and **Workspace backup** already provide usable delivery artifacts.

## Deliverables

| File | Contents |
| --- | --- |
| Belleville_Original_Capture.json | Whole selected attribute or geometry carrier with every original provider and source member |
| Belleville_Original_Geometry.geojson | Complete derived WGS84 geometry file for a geometry edition |
| Belleville_Asset_Handoff.html | Complete original source, mapping, all records, findings and saved decisions |
| Belleville_Asset_Handoff.zip | Selected originals, mapped CSVs, full report, proposals, operational changes and history |
| Belleville_Editable_Workspace.zip | Complete persistent workspace with all original inputs and saved selections |
| intake-result.json | Original intake/output identities and reopened project location |

The report includes all selected records, independently of the current browser page/filter. CSVs under mapped/ are machine interchange files preserving mapped values; attributes.csv inside the original capture remains the source's spreadsheet display export.

## Carrier format

```json
{
  "schema": "municipal-source-capture.v1",
  "capture": "capture.json",
  "files": [
    {"path": "capture.json", "bytes": 123, "sha256": "original-sha256", "content_base64": "complete-original-bytes"}
  ]
}
```

The files array includes capture.json and exactly all artifacts named by that original manifest. Each file has its original byte count, SHA256 and complete base64 body. The importer validates those identities, provider request order/parameters, metadata, count, before-and-after IDs, complete pages and attributes. The example above illustrates a file record; use the actual complete capture.

## Build the installed source package

From the current source application's directory:

```sh
python -m workspace.package --output /absolute/private/Belleville_Asset_Workspace.zip
```

The source package includes the full maintained workspace, complete attribute/geometry importers and original acceptance engine, local assets, development operation, this guide, and a manifest of all selected source bytes. Real capture data remains in its private receiving artifacts. The original checker is reused unchanged.

The public dataset is an input for engineering and source mapping. The issued asset-management procurement and any private municipal register retain their own original source and agreed implementation scope.
