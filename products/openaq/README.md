# OpenAQ station studies

Operate a complete air-quality source study: original observations, a named
source review, attributed reports, native dataset publication, customer analysis
and portable delivery. The installed product preserves the source and operator
decisions throughout this workflow.

## Install the selected product

Use Linux, Node.js 22.16 or newer, Python 3.11 or newer, Git, npm and util-linux
flock. Private operating directories must support original file locks, atomic
publication and fsync. Keep projects and credentials outside the source checkout.

From the repository source containing this edition:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . --ref HEAD --selection openaq-studies \
  --out /absolute/private/packages/openaq-studies
~~~

The selection extends the maintained complete local-dataset installation with
the OpenAQ contribution. It includes the original publisher, dataset/customer
and runtime commands, browser assets, seven OpenAQ package exports, and the
OpenAQ Applications and merchant providers. Keep the returned archive, SHA-256
and resolved original source manifest together.

Install that actual archive in a new application directory:

~~~sh
npm install --ignore-scripts --offline --omit=optional /absolute/path/to/package.tgz
npx --no-install starforge doctor
~~~

For managed Applications/MCP, use the original runtime installer and actual hash:

~~~sh
starforge runtime-install prepare \
  --dir /absolute/private/runtimes/openaq-studies \
  --archive /absolute/path/to/package.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

starforge runtime-install install \
  --dir /absolute/private/runtimes/openaq-studies

starforge runtime-install run \
  --dir /absolute/private/runtimes/openaq-studies -- source
~~~

The [original installer](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
retains archive identity, dependency selection and interrupted-install recovery.
Python CSV capture uses its standard library. An optional independent DuckDB
customer has its own selected Python environment; its complete setup is in the
[local-dataset guide](../local-dataset/OPERATING.md).

## Initialize and open the actual project

Copy the installed example to a private JSON file and enter the actual
customer/team, project name and purpose:

~~~sh
install -m 600 \
  /absolute/installed/source/stellar/scf-starforge-20261009/sf30-seller-sdk/openaq/examples/project.json \
  /absolute/private/openaq-project.json

starforge openaq init \
  --workspace /absolute/private/station-study \
  --config /absolute/private/openaq-project.json

starforge openaq serve --workspace /absolute/private/station-study --port 0
~~~

Keep the returned project UUID and configuration SHA-256. Open the private URL
printed by serve. Its fragment token moves to browser session storage and is
cleared from the address; it is not a provider API key. Project configuration
is immutable. Reusable monitoring plans have separate saved revisions.

For managed operation, attach the installed runtime:

~~~sh
starforge runtime-workspace init \
  --workspace /absolute/private/runtime-workspace

starforge runtime-workspace attach \
  --workspace /absolute/private/runtime-workspace \
  --runtime /absolute/private/runtimes/openaq-studies \
  --label 'OpenAQ station studies'

starforge runtime-workspace serve \
  --workspace /absolute/private/runtime-workspace --port 0
~~~

In Applications choose **OpenAQ station studies**, select the initialized
project and review its configuration and installed source. The original
Applications owner controls Start/Open/Stop. Restart preserves source editions
and request IDs, with a fresh listener instance. Use direct serving or
Applications through the project's original one-writer lock.

## Source selection and the complete operator workflow

| Screen | Complete result |
| --- | --- |
| Capture | Complete archive/local-day or API sensor/period scope, saved monitoring-plan edition and retained original responses |
| Source review | Actual named reviewer, decision, intended use, provider attribution and applicable license dates |
| Reports | Exact capture/review pairs, separate sensor/unit series and complete attributed report |
| Dataset merchant | Original Frictionless candidate/review/publication and optional staged SF82 package with actual public seller terms |
| Customer | Existing complete local receiving, reviewed mappings, independent DuckDB editions, analysis and report exports |
| Delivery | Full accepted source/report archive, original retained download and independent receiving/reopen |
| Operations | Retained exact input/result, full-history lookup and explicit recovery after interruption |

Public archive capture needs the actual location/local days and explicit source
metadata/rights context. The bundled example selects location 2178 on
May 3, 2022 from the [official archive guide](https://docs.openaq.org/aws/quick-start).
Its station/rights context is labeled as the original
[Locations documentation example](https://docs.openaq.org/resources/locations),
not an authenticated current API response.

API capture uses the host's authorized account, selected sensors and an
explicit-offset period. Keep the key in the environment and only its environment
variable name in private configuration. Use one original account/quota directory
across projects. The conservative local ceiling and actual provider rate
responses are displayed separately.

The [full source guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openaq/README.md)
contains the exact account, customer and merchant-provider configurations.
The [complete operating contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openaq/OPERATING.md)
supplies every CLI/typed request, publisher review, customer preparation,
download and receiving command.

## Preserve source meaning and receiving continuity

Observation datetimes are exclusive period ends; a local midnight row can belong
to the previous local day's archive. Both identities remain saved. Raw
measurements, hourly and daily API aggregates keep their distinct meanings.
Absent archive intervals, coverage and flags remain unknown.

Reports preserve decimal text, negative and missing values, and separate
captures, sensors, parameters and units. Optional means are explicit unweighted
expressions. No unit conversion, zero substitution, regulatory AQI or monitoring
completeness is inferred. The
[source contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/openaq/SOURCE_CONTRACT.md)
links those meanings to their official sources.

Agents use the same original merchant provider and actual listener/project
identities. Every mutation retains its original UUID and reviewed payload.
After a lost response, read that operation first; explicitly resume an
interrupted operation. A completed source capture reopens without another HTTP
request. Agent disconnect closes its own resources, while Applications keeps
process ownership.

Retain the complete delivery archive and SHA-256. The original Frictionless
receiver validates its source bundle; OpenAQ checks every selected member and
imports the same capture/review/report IDs into a recipient's initialized
private project. Reopening needs no provider key and performs no provider
request. Attribution, source editions, applicable license dates and named
reviews travel with the files; a review does not grant additional rights.

For paid deployment use actual public SF30 terms and the intended HTTPS origin.
Original Merchant Releases owns activation, supervision and rollback. A local
study or import is separate from a Stellar payment and from the independent
merchant/customer operating-state backups.
