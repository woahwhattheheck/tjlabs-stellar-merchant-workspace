# QuestDB time-series data products

Operate reviewed QuestDB reports as complete retained editions and versioned
customer datasets. The browser, command line and MCP client share one private
workbench. Its saved reports, source captures, correction review, original
publisher, recurring policy and buyer handoff remain together when it reopens.

The product includes native table and timestamp discovery, fixed UTC windows,
SAMPLE BY aggregates, keyed ASOF reports, full-file receiving, and the original
Applications lifecycle. Its industrial browser keeps the source, reports,
captures and publications in one operating view.

## Install the selected product

Use Linux, Node 22.16 or newer, Python 3.11 or newer, Git, npm and util-linux
flock. The private operating filesystem must support file locks, atomic rename,
hard links and fsync. Keep state outside the source checkout.

Build one committed source revision from this repository:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . --ref HEAD \
  --selection questdb \
  --out /absolute/private/packages/questdb
~~~

Retain the returned archive, SHA-256 and manifest. The committed selection
preserves this repository's identity and the original installer, merchant,
buyer, release and Applications implementations. It selects the QuestDB
registration with its five commands and nine API exports. The builder follows
the actual static module dependencies and preserves browser assets and guides.

Install the source archive in a new application directory:

~~~sh
npm install --ignore-scripts --offline --omit=optional /absolute/path/to/package.tgz
npx --no-install starforge doctor
~~~

Throughout this guide, use the installed starforge executable; a local npm
installation can invoke it with npx --no-install starforge. From an uninstalled
checkout, the equivalent dispatcher is:

~~~sh
node stellar/scf-starforge-20261009/distribution/cli.mjs
~~~

Prepare the native merchant runtime using the actual archive and its returned
hash:

~~~sh
starforge runtime-install prepare \
  --dir /absolute/private/runtimes/questdb \
  --archive /absolute/path/to/package.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --operator

starforge runtime-install install \
  --dir /absolute/private/runtimes/questdb

starforge runtime-install inspect \
  --dir /absolute/private/runtimes/questdb --load --source
~~~

The original installer records the selected dependency profile, lock, source
manifest and installation state. Proceed when that installation is READY.
Its install/resume and existing-cache options are documented in the
[runtime installation guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md).

The QuestDB HTTP source and its dedicated MCP transport use Node built-ins.
Native dataset sellers use the original x402 payment packages. The selected
schema and OpenAPI dependencies support the accompanying merchant and client
tools. Use the dependency choices saved in this installation when upgrading.

## Connect and discover

Create a private source declaration. It stores the names of environment
variables; supply their values through the launching environment or the
existing private runtime environment file.

~~~json
{
  "schema": "stellar-forge.questdb-source.v1",
  "endpointEnv": "QUESTDB_HTTP_URL",
  "maxInFlight": 4,
  "startupTimeoutMs": 10000,
  "queries": {}
}
~~~

Set QUESTDB_HTTP_URL to the selected HTTPS database base URL. A proxy-mounted
path needs its trailing slash. Optional userEnv/passwordEnv or tokenEnv selects
the existing database credentials. The source guide gives the complete schema
and the explicit local HTTP option.

A queryless source can inspect the actual database before report authoring:

~~~sh
starforge questdb discover \
  /absolute/private/questdb-inputs/source.json \
  --tables trades \
  --out /absolute/private/questdb-inputs/catalogue.json
~~~

Replace trades with the actual selected table. Discovery retains the server
build, native table and column metadata, designated timestamps, partitions and
original request references. Review that result before selecting column names,
timestamp precision, source windows and capture limits.

The [native source guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/questdb/README.md)
contains complete fixed-window, sampling and keyed-ASOF declarations, typed
input rules, exact-value representations and the native HTTP contract.

## Open one workbench

Start the original server from the READY runtime:

~~~sh
umask 077
starforge runtime-install run \
  --dir /absolute/private/runtimes/questdb -- \
  questdb-workspace \
  --state /absolute/private/questdb-workbench \
  --source /absolute/private/questdb-inputs/source.json \
  > /absolute/private/questdb-launch.json
~~~

The foreground process owns this workbench. Open the questdbWorkspace URL from
its private launch file in a browser on the same host. The listener uses
127.0.0.1 and an automatically selected port; the URL contains its access
fragment. CLI and MCP clients connect through that same launch file.

After a normal stop, reopen with the same --state directory and omit --source.
Use the new launch file from that start. The workspace retains the imported
first revision and each later immutable source and merchant revision.

Use the Source panel to discover selected tables and review the complete
metadata. Save source edits against the displayed revision. If another client
saved first, load that revision and reconcile the draft. Earlier saved
revisions can be loaded as a new draft.

## Author and retain a complete edition

The Reports panel exposes three native report forms:

| Report | Selection |
| --- | --- |
| Fixed window | Table, designated timestamp and precision, inclusive start, exclusive end, projected columns and typed filters |
| SAMPLE BY | Window plus native interval, timestamp output name, grouping keys, aggregate expressions, fill and alignment |
| Keyed ASOF | Left and right timestamps, explicit join keys, right-side filters, projected fields and optional native tolerance |

The selected server must actually retain the chosen time range. Save all
required startup probe values with the report. Additional execution values are
reviewed separately from the saved declaration. A raw named SELECT remains
editable as complete Source JSON.

Preview returns the actual count and truncation state. Capture complete edition
has independent row, byte and deadline settings. Its retained operation ID is
available immediately, and the Captures panel follows that original request
through completion or a specific failure.

A complete canonical capture contains:

| File | Contents |
| --- | --- |
| response.json | Exact complete native JSON response |
| rows.ndjson | Ordered typed rows with exact numeric and timestamp text |
| data.csv | Canonical CSV from the same native response |
| capture.json | Original selection, server metadata, counts, column observations, file sizes and hashes |
| native.csv | Optional separate native CSV response and its retained comparison |

Canonical completeness requires the returned row count to match the native
reported count. Plan capacity for each representation and the separate
publisher candidate. The default full limit is 64 MiB per representation;
JSON, NDJSON and CSV can each reach that limit.

SQL NULL is JSON null and an unquoted empty CSV field. Quoted empty CSV is an
empty string. LONG, DECIMAL and microsecond/nanosecond values retain their exact
text. Select string dataset columns for those values unless an explicit
numeric conversion preserves the original value.

Select two captures for an all-row comparison. Use unique row identity fields
for added, removed, changed and unchanged counts, or ordered row positions when
that is the intended comparison. The comparison retains both report/input
selections so a wider coverage window can be distinguished from corrected
source data.

## Receive the entire capture

In a second terminal, use the original connection and completed capture ID:

~~~sh
starforge questdb-workbench receive \
  --connection /absolute/private/questdb-launch.json \
  --capture capture-RETAINED-ID \
  --directory /absolute/private/customer-edition
~~~

The receiver downloads every selected capture file, checks each complete byte
count and SHA-256, and reopens the received native capture. receiving.json binds
the original source, capture and file descriptors.

After interruption, repeat the command with the same capture and destination.
The original partial transfer continues from its retained file sizes.
Completed files are checked and reused. Select a new directory for a different
capture.

The received edition can reopen without the database:

~~~sh
starforge questdb reopen /absolute/private/customer-edition
~~~

## Publish and operate the data product

Add merchant terms in the workbench: public HTTPS origin, service name,
description, tags and either one payment or the complete paymentOptions
selection. Keep each choice's exact amount, scheme, network, asset, recipient,
timeout and supported additional fields.

Create a dataset publication from the selected saved report and public resource
path, then open its original publication and refresh console.

1. Review the report input and dataset columns. Save an extraction plan with
   the source's native query order and the intended full-capture limits.
2. Extract the plan. The original publisher retains one complete native
   capture and streams its exact rows into the candidate.
3. Review that candidate against the current target snapshot and revision, or
   choose initialization for the new target.
4. Publish the reviewed candidate into the original version store.
5. Start its native seller, inspect the snapshot-pinned offer, select the
   intended payment option, and prepare the original customer request.
6. Operate the next edition through the same publisher. Existing buyer requests
   retain their original snapshot while new buyers can select the new offer.

The publisher's recurring policy provides save, enable, pause, run-now and
continuation operations. Each complete edition retains its own source and
capture identity. A saved fixed time window stays fixed; explicitly review new
source or input selections when the intended coverage changes.

Use the workbench's product operations while its browser owns the publication.
The standalone questdb-publisher command owns its selected publisher directory
for its invocation. The
[workbench guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/questdb/WORKBENCH.md)
provides all publication actions, expected revisions, original run IDs, seller
operations and buyer handoff commands.

## Agent and Applications operation

The installed command mappings are explicit:

| Installed command | Role |
| --- | --- |
| starforge questdb | Native discovery, query, full capture, compilation and offline reopen |
| starforge questdb-workspace | Original browser and retained product services |
| starforge questdb-workbench | Same-workbench operations and full-file receiving |
| starforge questdb-publisher | Original standalone extraction, review, publication and recurrence |
| starforge questdb-mcp | Dedicated MCP client for the running original workbench |

Configure an MCP host with the installed dispatcher:

~~~json
{
  "command": "starforge",
  "args": [
    "questdb-mcp",
    "--connection",
    "/absolute/private/questdb-launch.json"
  ]
}
~~~

The host must resolve the selected installation's executable. The 22 MCP tools
use the same model as the browser. Tools and resources expose saved revisions,
native discovery, report compilation and preview, complete captures and
receiving, comparison, publications, seller operation and original buyer
preparation. Closing the MCP client leaves the workbench's owned operations
available.

In the Runtime Workspace, select the READY QuestDB installation. Under
Applications, select **QuestDB source and dataset publishers** and the existing
workbench directory containing workspace.json. Review and save that
application, then use its original Start, Open, Stop and reopen controls.
Close a separately started workbench before transferring its ownership to
Applications.

The application binds the actual source release and native runtime, original
source revision, publications, merchant choices, seller intent and buyer files.
Supply the existing environment references and intended facilitator through
that application's settings.

The [complete managed receiving operator](../../stellar/scf-starforge-20261009/sf30-seller-sdk/questdb/MANAGED_WORKBENCH.md)
continues an actual completed native source case through two managed launches,
browser callbacks, the original MCP process, candidate and buyer file
receiving, and a fresh-process Applications reopen. Its selection and progress
files preserve the same native result and installed runtime across a
continuation.

## Recover and hand over

Read the original capture or publisher run after a lost response. A repeated
stable capture ID with the same selection returns its existing operation;
different inputs under that ID are rejected. After a workspace restart,
recover a completed native capture from its original files. An incomplete
native request retains its partial response and specific failure.

Stop the owning application before backing up the complete private workbench.
Keep revisions, source captures, comparisons, publications, version stores,
schedules and original buyer files together, with their private permissions.
Retain separately received customer directories as well.

For an upgrade, prepare a new runtime from the intended committed archive and
attach this same operating state through Applications. Keep the prior runtime
and release available until the new application is operating. The original
runtime transfer and installation guides describe complete package receiving
and recovery.

## Source and operation references

- [Native source, declarations and complete native operation](../../stellar/scf-starforge-20261009/sf30-seller-sdk/questdb/README.md)
- [Browser, CLI, MCP, publication and receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/questdb/WORKBENCH.md)
- [Installed Applications and managed receiving](../../stellar/scf-starforge-20261009/sf30-seller-sdk/questdb/MANAGED_WORKBENCH.md)
- [Runtime installation and upgrades](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
- [Runtime Workspace](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/README.md)
- [QuestDB native REST interface](https://questdb.com/docs/connect/compatibility/rest-api/)
- [QuestDB SAMPLE BY](https://questdb.com/docs/query/sql/sample-by/)
- [QuestDB ASOF JOIN](https://questdb.com/docs/query/sql/asof-join/)

Copyright TokenJunkieLabs. MIT; retained upstream components keep their original
licenses and source identities.
