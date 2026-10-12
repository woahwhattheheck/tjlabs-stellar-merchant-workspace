# Datactivist customer installation and adoption

This package gives a customer a complete, editable copy of a reviewed data publication: its original source, field mapping, saved editions, comparisons, publication decisions and customer query interface. The publisher and the receiving customer keep their existing workspace identities and original history.

## The reference dataset

The included reference is Datactivist's published municipal aggregate, **Communes enrichies avec la nuance politique (France)**. Its classification describes the 2020 municipal elections. A later download does not change that reference period.

Primary publication: https://www.data.gouv.fr/datasets/communes-enrichies-avec-la-nuance-politique-france
Dataset identifier: 672de493bf9bd19deda0c563
Resource identifier: ea5d6bc3-37d0-4884-a437-155a90c3e05f
Source licence: Licence Ouverte / Open Licence 2.0, as recorded in the original publication metadata.

The original resource contains these five fields:

| Exact field | Meaning | Customer handling |
| --- | --- | --- |
| nom_commune | Published municipality name. | Preserve spelling and accents. |
| cog_commune | COG / INSEE municipality identifier. | Keep as a string, including leading zeroes. |
| siren_commune | Published SIREN identifier for the municipality. | Keep as a string. An empty cell stays empty. |
| nuance_politique | Political classification from the published 2020 municipal reference. | Preserve the published value; an empty cell stays empty. |
| famille_nuance | Simplified family from the original published method. | Preserve the original value and its method attribution. |

The dataset page uses a plural label in its explanatory prose; the actual CSV header is **nom_commune**. The installed schema follows the actual source header.

The retained capture contains 34,844 records. cog_commune is nonempty and unique; 3,127 codes contain leading zeroes. The actual source includes 86 empty SIREN values and 1,718 empty values in each political-classification column. Preserve these original values and string identifiers throughout the customer workflow.

Keep three dates separate in every customer-facing analysis:

1. The period represented by the observations: the published 2020 municipal reference.
2. The publication's metadata dates, including the page's December 8, 2025 update.
3. The time this package captured the resource, October 12, 2026.

The primary publication suggests producing following versions around municipal elections and provides its maintenance source. It does not commit Datactivist to a future update schedule. A following edition in this workspace means a newly received or published source edition with its own retained metadata.

## The customer package

The handover contains the complete selected application source, the original workspace archive, this operating guide, the Python client and the installation launcher. The native archive carries both application/ and workspace/, including the original captured inputs, editions, publications and decision history.

The installer retains the source packet used to open the transfer, then activates the application embedded in the native archive. The customer continues with that received application and workspace. Original publication and workspace identities remain attached to queries and decisions.

The original reference capture is also retained as Datactivist_Public_Source_20261012_018A.zip: 12 members, 986,236 bytes, SHA-256 29243826152473ea4c82455905f340b629f30760e7ad27bcf3cf5fd0600e9e6f.

| Original capture member | Bytes | SHA-256 |
| --- | ---: | --- |
| CSV | 1,515,512 | fec6338a55ea2c4eaaa76d63e8e4d97d9c1e7d8d5666924b8a292eb58a830e05 |
| rows.jsonl | 4,721,016 | 58dbeeb17bc8acfb55e373bb4e68e74e19b7acc33886f70bc72ea45c806ff4c0 |
| dataset.json | 10,340 | ab9611b3a76ecd152c39ea6902abd27a9e3f7ac0401f9b9dea99b74a59e8ce20 |
| capture.json | 120,708 | 815ee03eb81019b9abc8fd7092c1bbcb8928363dbc6e86e6c926ae1ae22768e1 |

These identities identify the delivered reference. Each later source edition retains its own identity and metadata.

## 1. Install and receive

Use Linux with Node 24 or newer, util-linux flock, and Python 3.10 or newer. The Python tools use the standard library. Choose the actual installed Node executable in the command.

Run from the delivery directory containing install.py, source.json, workspace.datawork and their handover.json. For an initial repository delivery, the launcher is datagouv/python_customer/install.py. SOURCE_SHA256 and WORKSPACE_SHA256 below are the actual values recorded in the delivery's handover.json.

~~~sh
SOURCE_SHA256=$(python3 -c 'import json; print(json.load(open("handover.json"))["source"]["sha256"])')
WORKSPACE_SHA256=$(python3 -c 'import json; print(json.load(open("handover.json"))["workspace"]["sha256"])')

python3 install.py install \
  --directory /srv/datactivist/customer-a \
  --source ./source.json \
  --source-sha256 "$SOURCE_SHA256" \
  --archive ./workspace.datawork \
  --archive-sha256 "$WORKSPACE_SHA256" \
  --node /usr/bin/node
~~~

The source packet must be complete decoded JSON. If a retained source carrier is compressed, first use its supplied maintained decoder. The installer accepts complete files or allSources selections and checks the original file bytes and declared hashes before materializing them.

Choose a new or empty installation directory. The command retains the original inputs, installs the source selection, invokes the original DataGouv receiver, and opens the workspace through the embedded application. The native receiver verifies the complete application and workspace members and reopens each published snapshot before recording its completion.

Continue an interrupted installation from its retained inputs:

~~~sh
python3 install.py resume --directory /srv/datactivist/customer-a
~~~

A completed native receiving.json is reopened directly. The native receiver requires a new destination for an incomplete receive, so the launcher preserves the incomplete attempt and receives the same archive into a fresh private directory. The installation record retains both attempt paths. The active application and workspace are selected only after the original receive has completed.

For a complete source installation used with an independently retained native dataset configuration, omit both archive arguments. Later, repeat install with the same source selection and add the original archive and hash to complete that installation.

## 2. Locate the received source and dataset

Read the installation status before starting the browser server:

~~~sh
INSTALLATION=/srv/datactivist/customer-a
python3 install.py status --directory "$INSTALLATION" > "$INSTALLATION/customer-paths.json"

CUSTOMER_SOURCE=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["source"]["directory"])' "$INSTALLATION/customer-paths.json")
CUSTOMER_WORKSPACE=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["workspace"])' "$INSTALLATION/customer-paths.json")
DATASET_CONFIG=$(python3 -c 'import json,sys; print(next(x["config"] for x in json.load(open(sys.argv[1]))["datasets"] if x["selected"]))' "$INSTALLATION/customer-paths.json")

CUSTOMER_CLIENT="$CUSTOMER_SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/datagouv/python_customer/client.py"
DATASET_HANDLER="$CUSTOMER_SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/dataset-handler.mjs"
~~~

The status result identifies the active source directory, workspace directory, workspace ID, current selection and every published dataset configuration. It also lists local source changes relative to the received application.

The configuration belongs beside the original publication's data.csv. Its actual path is workspace/publication.nativePath/runs/publication.runId/dataset.json. Keep that relationship when opening the native Python adapter. A separately downloaded config file is a useful original export; its relative CSV reference still needs the original sibling data.csv.

The command above selects the current publication. If the current selection is empty, choose a specific published entry from the status result's datasets list. Its config and snapshot identify the historical edition you are opening.

Customer outputs belong under the received workspace's customer directory. This makes complete exports, comparison reviews and retained operation requests part of later native workspace archives.

## 3. Open the browser and the customer API

In a second terminal, open the existing received application:

~~~sh
python3 install.py serve --directory /srv/datactivist/customer-a --port 8429
~~~

Open the URL printed by the original server. Use that same displayed loopback URL with the Python client. The example below uses the selected port 8429.

~~~sh
PUBLISHER_URL=http://127.0.0.1:8429

python3 "$CUSTOMER_CLIENT" status --url "$PUBLISHER_URL"

python3 "$CUSTOMER_CLIENT" page --url "$PUBLISHER_URL" \
  --query 'limit=250&sort=cog_commune&where_cog_commune=01001'
~~~

The client obtains the original local session token when it records a mutation. The server and native decision engine retain the workspace's original identity and operation history.

Inspect the published source metadata, source edition, field mapping, original review and current selection in the browser. The initial reference uses all five original fields as non-nullable strings. Empty source cells remain empty strings.

While the server is open, use the HTTP client or browser for workspace operations. Stop that server before using the installer's native status or archive commands; the native workspace is owned by the running service.

## 4. Receive every query page

Receive the complete current publication through the running application:

~~~sh
python3 "$CUSTOMER_CLIENT" download --url "$PUBLISHER_URL" \
  --query 'limit=250&sort=cog_commune' \
  --out "$CUSTOMER_WORKSPACE/customer/queries/municipal-reference"
~~~

For a particular historical or following edition, add --publication with its original publication ID. A download captures that publication and snapshot; later changes to the current pointer do not silently move an in-progress export to another edition.

The client follows every returned native cursor, retaining the original schema, field meaning, filters and ordering. It writes all rows, the selected query and the final result identity. An unfiltered complete reference publication yields 34,844 records. Filtered queries retain their own complete result set.

Resume an interrupted download with its original output directory:

~~~sh
python3 "$CUSTOMER_CLIENT" download --url "$PUBLISHER_URL" \
  --out "$CUSTOMER_WORKSPACE/customer/queries/municipal-reference"
~~~

Omitting publication and query during this continuation uses the saved original selection and request. A changed query or different publication belongs in a new output directory. Cursors are original continuation values and should be passed back exactly as received.

The original publication enables string filters and sorts for its mapped fields and a maximum page size of 250. For an empty-string equality filter, preserve the equals sign, for example where_nuance_politique=. A missing parameter and an explicit empty value have different meanings.

## 5. Use the native dataset directly from Python

The native adapter opens the installed original dataset handler and the saved publication configuration in one Node process. It holds the actual dataset in memory and returns that engine's pages and cursors.

~~~sh
python3 "$CUSTOMER_CLIENT" native-describe \
  --node /usr/bin/node --handler "$DATASET_HANDLER" --config "$DATASET_CONFIG"

python3 "$CUSTOMER_CLIENT" native-page \
  --node /usr/bin/node --handler "$DATASET_HANDLER" --config "$DATASET_CONFIG" \
  --query 'limit=250&sort=cog_commune&where_cog_commune=01001'

python3 "$CUSTOMER_CLIENT" native-download \
  --node /usr/bin/node --handler "$DATASET_HANDLER" --config "$DATASET_CONFIG" \
  --query 'limit=250&sort=cog_commune' \
  --out "$CUSTOMER_WORKSPACE/customer/queries/native-municipal-reference"
~~~

Use a separate query directory for the native workflow. HTTP receiving records a publication identity; direct native receiving records the original immutable dataset snapshot. The native command can also retain the original workspace ID with --workspace-id.

A repeated native-download command with the same directory continues the saved query. The original configuration and CSV stay together throughout this operation. Check the native description when selecting a different publication's allowed fields or query limits.

The Python interface supports complete downstream processing:

~~~python
from pathlib import Path
from client import (
    DatactivistClient, NativeDatasetSession,
    saved_rows, profile_query, value_counts, export_csv,
)

client = DatactivistClient("http://127.0.0.1:8429")
dataset = client.dataset()  # Captures the currently selected published edition.

query_directory = Path("/absolute/received/workspace/customer/queries/python-analysis")
completed = dataset.download(query_directory, "limit=250&sort=cog_commune")

profile = profile_query(query_directory)
families = value_counts(query_directory, "famille_nuance")

for row in saved_rows(query_directory):
    municipality_code = row["cog_commune"]
    # Pass the original string into the customer's downstream operation.

export_csv(query_directory, query_directory.parent / "python-analysis.csv")
~~~

Place the script beside client.py or add the delivered python_customer directory to the Python import path. Use the actual received workspace path in the script.

For direct access, replace the HTTP dataset selection with this context manager:

~~~python
with NativeDatasetSession(
    node="/usr/bin/node",
    handler="/absolute/received/application/stellar/scf-starforge-20261009/"
            "sf30-seller-sdk/dataset-handler.mjs",
    config="/absolute/received/workspace/publications/PUBLICATION_ID/"
           "native/runs/RUN_ID/dataset.json",
) as dataset:
    description = dataset.describe()
    completed = dataset.download(query_directory, "limit=250&sort=cog_commune")
~~~

Use the actual saved config path reported by installation status. NativeDatasetSession also exposes page(), pages() and rows() for callers that need the original page boundaries or a streaming row iterator.

## 6. Profile and export the original values

These commands read the entire completed saved query:

~~~sh
python3 "$CUSTOMER_CLIENT" profile \
  --directory "$CUSTOMER_WORKSPACE/customer/queries/municipal-reference"

python3 "$CUSTOMER_CLIENT" values \
  --directory "$CUSTOMER_WORKSPACE/customer/queries/municipal-reference" \
  --field famille_nuance

python3 "$CUSTOMER_CLIENT" csv \
  --directory "$CUSTOMER_WORKSPACE/customer/queries/municipal-reference" \
  --out "$CUSTOMER_WORKSPACE/customer/municipal-reference.csv"
~~~

The profile reports native types, empty strings separately from JSON null, leading-zero strings, distinct values and key uniqueness. Literal strings such as NA, NULL and N/A remain ordinary values. The values command returns every distinct original value and its complete count.

Preserve cog_commune and siren_commune as strings in later CSV or spreadsheet work. Choose text import types for these identifiers when opening a CSV in a spreadsheet. Keep the original source alongside any separately named transformation.

For the complete reference capture, cog_commune is unique and includes 3,127 leading-zero strings. Empty SIREN and political-classification values are part of the source. An empty classification, a missing municipality and a later changed classification are different observations.

## 7. Review a following edition

The publisher retains the actual following capture and, when offering it for acceptance, builds and publishes its complete local edition. The customer uses those original IDs from status. Each source keeps its own capture metadata and observed meaning.

Set AFTER_CAPTURE to the retained following capture hash. Set FOLLOWING_PUBLICATION to the fully published local edition made from that same capture.

~~~sh
python3 "$CUSTOMER_CLIENT" review-adoption --url "$PUBLISHER_URL" \
  --after-capture "$AFTER_CAPTURE" \
  --following-publication "$FOLLOWING_PUBLICATION" \
  --key cog_commune \
  --directory "$CUSTOMER_WORKSPACE/customer/adoptions/following-edition"
~~~

The command retains the original current selection and revision, current publication, following source metadata and candidate publication. It invokes the native comparison and receives its complete change list into comparison.json before marking review.json ready.

Review added, removed and changed rows; changed field values; source and schema changes; and the original key coverage. Inspect comparison.json in full, or use the native browser's complete comparison pages. Keep source-date and coverage changes attached to the change interpretation.

A review intended only to keep or withdraw can omit --following-publication. Acceptance needs a fully published candidate made from the compared following source.

## 8. Record the native decision

Set REVIEWER to the actual operator's name and NOTE to the actual decision reason. Choose one of these actions:

| Action | Native result |
| --- | --- |
| accept | Selects the published following edition made from the compared following capture. |
| keep | Retains the current publication and records consideration of the following source. |
| withdraw | Clears the current selection and retains the original publications, comparison and reason. |

For example, to record the reviewed acceptance:

~~~sh
python3 "$CUSTOMER_CLIENT" adopt --url "$PUBLISHER_URL" \
  --directory "$CUSTOMER_WORKSPACE/customer/adoptions/following-edition" \
  --action accept --reviewer "$REVIEWER" --note "$NOTE"
~~~

Use keep or withdraw for those actual decisions. Each decision goes through the original workspace engine with the saved comparison identity, source selection revision and one retained version-4 request UUID.

If the connection fails, repeat the same command with the same review directory, action, reviewer and note. The client continues the saved request body and UUID. When the original result is already complete, it returns that retained result.

If another operator has changed the current selection, prepare a new review directory against that current selection and record the intended decision there. The previous comparison and request remain in history.

Read the resulting status and full operation history:

~~~sh
python3 "$CUSTOMER_CLIENT" status --url "$PUBLISHER_URL"
python3 "$CUSTOMER_CLIENT" history --url "$PUBLISHER_URL"
~~~

After acceptance, make a query against the selected following publication. After keep, confirm the original publication remains selected. After withdrawal, the current selection is empty; historical editions remain queryable by explicit publication ID.

## 9. Transfer the continuing customer workspace

Finish current customer commands, then stop the browser server. Export the complete continuing workspace and its current editable application together:

~~~sh
python3 install.py archive \
  --directory /srv/datactivist/customer-a \
  --out /srv/delivery/customer-a-following-handover
~~~

The native exporter creates workspace.datawork with the full application and workspace. The launcher copies its exact application source members into source.json for the next installation and includes install.py and handover.json. The handover records the actual archive-file byte count and SHA-256 separately from the native decoded-member totals.

Source files listed in the maintained application inventory travel with the archive, including local edits to those files. Add any deliberate new application file to products/datagouv/application-files.json before creating its delivery. The customer directory inside the workspace carries complete query results, adoption reviews, original request IDs and analysis products.

On the receiving machine, run the new handover's install.py with source.json, workspace.datawork, their recorded hashes, and a new installation directory. The receiver opens the archive's embedded application and original workspace. Inspect the current selection, complete history and original saved query, then continue with the next actual edition.

A repeated archive command with the same completed handover directory returns that delivery after checking its recorded file identities. An incomplete archive attempt is retained before the original exporter creates a complete replacement.

## Original file and API access

The full Python client exposes the original publication/source exports and operation history:

| Need | Customer command |
| --- | --- |
| Original captured CSV | file --url URL --kind original --id CAPTURE_HASH --out FILE |
| Complete capture manifest | file --url URL --kind manifest --id CAPTURE_HASH --out FILE |
| Published dataset CSV | file --url URL --kind csv --id PUBLICATION_ID --out FILE |
| Original dataset configuration | file --url URL --kind config --id PUBLICATION_ID --out FILE |
| Full publication candidate | file --url URL --kind candidate --id PUBLICATION_ID --out FILE |
| Full comparison file | file --url URL --kind comparison --id COMPARISON_ID --out FILE |
| All comparison changes as JSON | comparison --url URL --comparison COMPARISON_ID |
| Complete operation history | history --url URL |
| Native archive from a running service | archive --url URL --out FILE.datawork |

Prefix the command with python3 and the installed client.py path. File outputs are new files. The original dataset configuration retains its original relative file references.

## Operating completion

A customer can finish this workflow with an independently usable application and workspace, a complete query export, source attribution and dated meaning, a full following-edition comparison, and its actual native adoption decision. The continuing handover retains these products and the original operation identities so the next operator can pick up the same workspace.

For redistribution and analysis, retain the publication's Open Licence attribution and its original generation-method references. Preserve the distinction between the 2020 municipal reference, the publication metadata dates and the actual capture date.

## Maintained sources

- Publication, licence and original method: https://www.data.gouv.fr/datasets/communes-enrichies-avec-la-nuance-politique-france
- Native DataGouv CLI and request formats: [cli.mjs](cli.mjs)
- Original unchanged-string projection: [publisher.mjs](publisher.mjs)
- Current workspace decisions and portable receiver: [workspace.mjs](workspace.mjs)
- Maintained product API: [API.md](../../../../products/datagouv/API.md)
- Maintained publisher operating guide: [OPERATING.md](../../../../products/datagouv/OPERATING.md)
