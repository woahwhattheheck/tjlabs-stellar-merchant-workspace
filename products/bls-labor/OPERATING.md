# BLS regional labor workspace

The labor workspace turns complete original Bureau of Labor Statistics captures into an editable regional analysis project. It keeps LAUS resident labor and QCEW workplace employment and wages as separate original projections, with their source files, dictionaries, footnotes, capture receipts and source identities.

An analyst can receive a retained ZIP or capture the selected official files, keep several source editions, read every selected observation, save revisioned notes, produce complete county briefings, compare releases, publish original datasets and hand the full editable project to another operator. The browser and typed client use the same saved requests and workspace.

## Install and open

Use the existing Linux environment with Node.js 22.16 or newer, Python 3.11 or newer, npm and util-linux flock. Keep the source checkout, installed runtime, private working project and customer output in separate directories.

In Runtime workspace, choose **Build a product → BLS regional labor workspace**. Select the full source commit and a new output directory. The equivalent source command is:

~~~sh
node /absolute/checkout/stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout \
  --ref ORIGINAL_FULL_COMMIT \
  --selection bls-labor \
  --out /private/releases/bls-labor
~~~

Receive the actual archive and SHA-256 returned by that operation:

~~~sh
node /absolute/checkout/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /private/runtimes/bls-labor-01 \
  --archive /private/releases/bls-labor/ACTUAL_ARCHIVE.tgz \
  --sha256 ACTUAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node /absolute/checkout/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /private/runtimes/bls-labor-01

node /absolute/checkout/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /private/runtimes/bls-labor-01 --load --source
~~~

The installed command forwards to the selected original source:

~~~sh
starforge bls-labor-workspace --python /absolute/python \
  --workspace /private/bls-region init --name "Regional labor analysis"

starforge bls-labor-workspace --python /absolute/python \
  --workspace /private/bls-region serve --port 8895
~~~

Use init once, then reopen the same directory with serve. The launch result gives the current private console URL. The same connection is written to bls.connection.json inside the working project. The URL opens the complete local browser; the typed client reads the connection file directly.

### Managed Applications

Choose **BLS regional labor workspace** in Applications. Select the original private analyst directory, actual Python executable, desired port and existing environment file where needed. Review, Save, Connect, Review Start and Start retain the selected runtime, original source files, Python identity and workspace marker. Open uses the authenticated native listener returned by that same process.

Applications reserves the original BLS workspace. A source upgrade receives a new runtime and is reviewed through the existing lifecycle. The workspace marker remains stable while analysts add source editions, notes, reports and publication history.

## Receive the retained Northeast Kingdom source

The original source archive is NEK_Vitality_Official_Sources_20261011.zip:

- 21,024,420 bytes.
- SHA-256: 3473bd56195b486c41a5042f5d9be4cfbf82bcf0d257528fe724b18caea9a28e.
- Retained download: https://chatgpt.com/api/library/files/libfile_768d988847e08191afe7f0b0fbb8cf16/download.
- The original source catalog selects Caledonia, Essex and Orleans counties: FIPS 50005, 50009 and 50019.
- The original receiving result contains 408 LAUS observations and 96 QCEW observations. These are the expected complete source counts for the retained archive.

Use the complete existing file on the native host:

~~~sh
starforge bls-labor-workspace --python /absolute/python \
  --workspace /private/bls-nek receive-original \
  --archive /dev/shm/NEK_Vitality_Official_Sources_20261011.zip \
  --sha256 3473bd56195b486c41a5042f5d9be4cfbf82bcf0d257528fe724b18caea9a28e \
  --out /private/bls-nek-customer \
  --name "Northeast Kingdom labor analysis"
~~~

This command continues the same saved intake if restarted. It imports the original files through the maintained capture engine, selects the source edition, produces six complete county briefings and one complete resident-labor change report, saves the original analyst note, exports the editable project, and reopens it in a separate received-workspace directory. The output names the complete original-receiving.json, source counts, report files, archive and reopened workspace.

The case retains these seven outputs:

| Customer output | Original content |
| --- | --- |
| Caledonia resident labor | All selected LAUS observations for 50005 |
| Caledonia workplace employment and wages | All selected QCEW observations for 50005 |
| Essex resident labor | All selected LAUS observations for 50009 |
| Essex workplace employment and wages | All selected QCEW observations for 50009 |
| Orleans resident labor | All selected LAUS observations for 50019 |
| Orleans workplace employment and wages | All selected QCEW observations for 50019 |
| Northeast Kingdom resident-labor changes | Each selected LAUS observation and its comparable prior-year source period |

The complete source catalog and original capture receipts remain with the acquisition. The customer reports include the original values and full source manifest; analyst note revisions remain in the editable working project.

### Browser intake

Open **Source editions → Receive or capture an original source edition**. Either select the complete ZIP from disk and upload it, or enter its existing path on this host. Retain the supplied original ZIP SHA-256. The upload returns its actual complete byte count, hash and native path.

The original capture engine accepts an explicit selection of counties, LAUS years, periods, measures and seasonal status, and QCEW periods, ownership, industry, size and metrics. The current complete selection is prefilled. For a new official acquisition, select the actual LAUS state-file URLs. The engine receives the selected official dictionaries and county/quarter slices through its existing acquisition operation.

Each edition has a stable ID and a separate original source declaration under sources/EDITION/source.json. Selecting an edition changes the active root source.json using its expected current SHA-256. Existing source editions remain available for reports and comparisons.

## Read original observations

The **Observations** table pages through all rows. Exact filters use arrays of original source values. For example:

~~~json
{"county_fips":["50005"],"year":[2025],"period":["M13"]}
~~~

LAUS accepts county_fips, measure_code, year, period, seasonal and value_status. QCEW accepts area_fips, ownership_code, industry_code, size_code, year, quarter, metric and value_status. Years and quarters are integers; original codes remain strings.

~~~json
{"area_fips":["50005"],"year":[2026],"quarter":[1],"metric":["avg_wkly_wage"]}
~~~

Each row retains the original raw value, original physical-record hash and line, capture identity, URL, release detail, dictionary references and statistical basis. The detail panel exposes the complete original record.

### Statistical interpretation

LAUS labor-market measures use the place of residence. QCEW employment and wages use the place of employment. They remain separate tables and publication targets. Their source dictionaries, units and population definitions travel with the original records.

The source engine resolves original LAUS footnotes from the captured dictionary. A 2025 annual observation with code G has eleven months of coverage excluding October. Unavailable values retain null numeric values and their original status. QCEW disclosure N remains withheld even when the raw source token is zero.

See the [original BLS contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/bls-labor/contract.json), [source projector](../../stellar/scf-starforge-20261009/sf30-seller-sdk/bls-labor/project.py) and captured original dictionaries. Official source locations include the [LAUS state files and definitions](https://download.bls.gov/pub/time.series/la/) and [QCEW data files](https://www.bls.gov/cew/downloadable-data-files.htm).

## Save analyst notes and customer briefings

An analyst note belongs to an edition or original observation. Every save checks the note's current revision and retains the previous text. Browser drafts are saved by workspace and subject, so a saved source revision can be compared with a pending draft before editing.

A customer briefing uses the currently selected source edition, projection and exact filters. Its narrative is editable customer commentary. The saved JSON, CSV and printable HTML contain every selected row. The screen can read successive pages of a saved report.

Choose **Original source values** for the original observations. Choose **LAUS change from the same period one year earlier** to retain the exact prior original observation and decimal difference. Matching requires the same series, period, unit, residence basis, seasonal status and annual coverage. Rate changes use percentage points. Incomparable or unavailable observations retain the reason; no missing month is filled.

**Compare complete source editions** joins original observation identities across the two selected editions. The result retains added, removed, changed and unchanged observations, complete before/after rows and changed field names. Acquisition identity is separate from a changed original value or footnote.

## Publish and receive original datasets

The active source can open the maintained native publisher for LAUS, QCEW or complete original files. Each retains its typed plan, extraction run, candidate inspection, review, dataset version store and customer handoff.

Publication paths remain inside the editable workspace:

| Relative path | Purpose |
| --- | --- |
| source.json | Selected original capture declaration |
| publishers/laus | Resident-labor plans and runs |
| publishers/qcew | Workplace plans and runs |
| publishers/source_files | Complete source-file plans and runs |
| datasets/laus | Original resident-labor dataset versions |
| datasets/qcew | Original workplace dataset versions |
| datasets/source_files | Original file dataset versions |
| native-publications/OPERATION | Restartable publication and customer receiving state |

**Publish and receive complete original datasets** runs the maintained native engines sequentially. Select the projections, actual reviewing operator, review note and optional existing plan or run IDs. The source SHA-256 binds the saved request to the selected edition. The controller adopts the original matching work, retains native review/publication results, and resumes the same saved operation after interruption.

Optional source receiving, original Vitality importing and customer release use the existing private host configuration in bls-native.connection.json. The browser shows that configuration's location and whether it is present. Keep the original seller, session and Vitality source/workspace paths there. See [native publication and customer receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/bls-labor/workspace/NATIVE_RECEIVING.md) for its exact original interface and restart sequence.

The complete editable handover retains portable publication source and target paths. A receiving host uses its own original native connection file when continuing customer activity.

## Complete editable handover

Choose **Prepare complete workspace ZIP**. The exporter closes publisher children owned by the workspace, takes a consistent SQLite backup, and copies every retained source edition, original source file, report, note revision and local native publication file. It checks each complete file before and after copying.

Download the ZIP and its actual SHA-256. The browser streams to a chosen file handle where supported. The typed Node client always streams the complete download. Receive the ZIP into a separate editable directory:

~~~sh
starforge bls-labor-workspace --python /absolute/python receive \
  --archive /private/received/bls-workspace.zip \
  --sha256 ACTUAL_COMPLETE_ZIP_SHA256 \
  --destination /private/customer-bls

starforge bls-labor-workspace --python /absolute/python \
  --workspace /private/customer-bls serve --port 8896
~~~

Receiving checks the full archive and all declared file hashes, restores the original workspace identity, reopens every original source edition through the BLS source reader and makes the same notes and reports editable. Complete project archives allow up to 8 GiB expanded content, with a 4 GiB individual-file allowance for native databases.

Completed historical exports remain visible in operation history. Available complete archive files have download controls. Preparing a fresh export in the received workspace uses the received project's current original data.

## Saved requests and interruption

Every mutation is a complete request:

~~~json
{
  "id":"retained-operation-id",
  "kind":"report",
  "expected_revision":4,
  "input":{
    "edition_id":"nek-original",
    "projection":"laus",
    "filters":{"county_fips":["50005"]},
    "title":"Caledonia resident labor",
    "narrative":"Complete original source observations.",
    "calculation":"original"
  }
}
~~~

The server saves the ID, exact input and expected workspace revision before work starts. A repeated ID must contain the same kind and input. New changes use the current workspace revision. The browser preserves a request before sending it and requires that request to be resumed after an unknown network result.

**Recent operations** can recover the complete saved request after the listener's port changes. Download that request and run it through the same CLI:

~~~sh
starforge bls-labor-workspace --python /absolute/python \
  --workspace /private/bls-region operate --input /private/original-request.json

starforge bls-labor-workspace --python /absolute/python \
  --workspace /private/bls-region operation --id retained-operation-id
~~~

Source-file uploads stream separately from JSON operations. The complete JSON body limit is 8 MiB and operation input is limited to 7 MiB. Browser storage can have a smaller quota; if it cannot retain the request, download the exact request and run it through the original command.

## Typed customer and operator client

The installed package exports ./seller/bls-labor/workspace and ./seller/bls-labor/workspace/native-receiving. The latter exposes the original native controller and its typed saved request/result; `starforge bls-native-receiving` runs the same complete saved operation directly. The adjacent client.d.mts declares the original state, observations, requests, reports, upload receipts and complete-file methods.

~~~js
import {openBlsLaborWorkspaceClient}
  from '/absolute/installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/bls-labor/workspace/client.mjs';

const client = await openBlsLaborWorkspaceClient({
  connectionFile:'/private/bls-region/bls.connection.json'
});
const current = await client.state();
const request = {
  id:'cal-original-briefing',
  kind:'report',
  expected_revision:current.revision,
  input:{
    edition_id:'nek-original',
    projection:'laus',
    filters:{county_fips:['50005']},
    title:'Caledonia resident labor',
    narrative:'Complete original source observations.',
    calculation:'original'
  }
};
await client.save(request,{requestFile:'/private/requests/cal-original-briefing.json'});
const result = await client.wait(request.id);
if(result.state !== 'complete') throw new Error(result.error || result.state);
await client.download({
  kind:'report',
  id:request.id,
  name:'report.csv',
  destination:'/private/customer/Caledonia-labor.csv'
});
~~~

After an interrupted request, client.resume reads the retained complete request file. A saved upload ID retrieves the original upload receipt. Download destinations are created without replacing an existing customer's file.

## Recurring regional service

The saved project supports a practical recurring analyst service: receive the next official source edition, compare it with the previous release, update the customer's county commentary, publish the selected complete datasets and deliver the new briefings with the same original definitions and source files. The receiving workspace lets a customer or another analyst continue that work with all original records and edits.
