# Open-Meteo Weather in Applications

The **Open-Meteo Weather** application opens an existing customer Weather
workspace. It keeps sites, requests, original forecast/history/ensemble
responses, editable decisions, frozen reports, receiving history and report
renewal together in the original browser.

The saved settings choose one of the existing operating modes:

| Settings mode | Customer workflow |
| --- | --- |
| Review | Receive a delivered report, inspect its original sources, edit decisions, renew against retained source editions, export the complete report and continue the received workspace. |
| Operator | Use the same review and report workflow, acquire a provider response, or prepare, execute and recover the existing native buyer request. |

The managed entry uses the same Weather store and server as the existing
weather-operations serve command. Review reads the saved settings and original
directories. Start opens that existing workspace and takes its original state
lease. The managed process returns its own private loopback browser session.

## Install the complete selected product

Build from the complete commit containing this guide and the
weather-operations recipe. Use the original distribution builder:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --ref FULL_ORIGINAL_COMMIT \
  --selection weather-operations \
  --out /private/weather-product-release
~~~

The returned receipt identifies the original archive and its SHA-256. The
selected source contains the original Weather command, merchant/customer
modules, report receiving and renewal, private browser assets, managed
Applications provider and this guide. It also carries the original native
buyer, operator, seller and recovery source required by those operations.

Prepare and install that exact archive through the maintained runtime
installer:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /private/weather-runtime \
  --archive /private/weather-product-release/ORIGINAL_ARCHIVE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /private/weather-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /private/weather-runtime --load --source

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /private/weather-runtime -- source
~~~

Keep the returned original profile, lock, archive and source selection together.
A continued installation uses the same runtime directory. The maintained
installer's transfer, offline receiving and existing-dependency adoption
operations also apply to this selected product.

The product uses the original Node runtime with node:sqlite. Complete report
ZIP conversion and export use the original Python 3 helper. The native operator
profile supplies the original Stellar payment dependencies and human approval
workflow. Configure provider key and proxy environment references in the
original settings when that operator workspace uses them.

Register the READY runtime in Runtime Workspace, then open **Applications**.

## Choose the existing customer settings

Choose **Open-Meteo Weather** and supply the original absolute settings path:

~~~json
{
  "settingsFile": "/private/weather-customer/settings.json"
}
~~~

The review displays the operating mode, saved settings SHA-256, source runtime,
Weather state root, Weather store directory, and any original buyer/operator
directories. It also displays the configured provider mode and environment
variable names for credentials or a proxy.

The settings must be the existing settings.json inside its original state
root. Its Weather database, buyer/operator directories and generated seller
client stay at their original locations. Review verifies these paths and the
saved client hash without opening the Weather database or acquiring its lease.

Save the reviewed application. **Start** opens those settings, **Open** enters
its private Weather browser, and **Stop** closes the original workspace and
releases the lease. Starting the saved entry again reopens its same customer
records and report revisions.

Each start checks the reviewed settings hash, original directory/database identities and selected installed runtime. If the
settings change, review and save the changed application before starting it.
A different customer workspace receives its own application entry and original
settings path.

The managed entry includes the original approval terminal in both workspace modes. Set terminalPython when Python 3 lives outside /usr/bin/python3. An operator workspace uses that channel for
native buyer execution. The Weather browser's Prepare and Execute controls
continue the original operator request. Use its retained intent and Recover
action after an uncertain response; opening or restarting Applications does not
dispatch that request.

## Create a review workspace for a delivered report

Use the existing review initializer with a private state root. Its parent
directory must already exist:

~~~sh
starforge weather-operations review-init \
  --state-root /private/weather-customer
~~~

When using an installed runtime without a global command, invoke the same
operation through its original launcher:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /private/weather-runtime -- \
  weather-operations review-init --state-root /private/weather-customer
~~~

Save /private/weather-customer/settings.json in Applications and open it.
The browser's receiving workflow accepts a complete .weather.json handover.
For an original report ZIP, first use the maintained converter:

~~~sh
starforge weather-operations from-report-zip \
  --input /private/incoming/ORIGINAL_REPORT.zip \
  --archive-sha ORIGINAL_ZIP_SHA256 \
  --output /private/incoming/ORIGINAL_REPORT.weather.json
~~~

In the browser, select the complete handover, review its original sources,
decision revisions and report, then receive that reviewed selection. The
original archive/source identities and local receiving mappings remain in the
customer store. Each source family retains its original request, response,
model, dates, units and attribution.

The corresponding direct commands are:

~~~sh
starforge weather-operations handover-review \
  --settings /private/weather-customer/settings.json \
  --input /private/incoming/ORIGINAL_REPORT.weather.json

starforge weather-operations handover-receive \
  --settings /private/weather-customer/settings.json \
  --input /private/incoming/ORIGINAL_REPORT.weather.json \
  --expected-sha ORIGINAL_REVIEW_SHA256
~~~

The receiving review's returned SHA belongs to those exact handover bytes.
Continue a previously accepted receiving with that same handover and original
review identity.

## Edit and renew a report

Open a received decision to edit its instructions, explanation, selected
variable, threshold or date window. Saving creates a new local revision. The
original received revision and its source remain available. The editor uses
the selected decision's exact unit for its source series, chart and threshold.

Freeze a report with the intended decision revisions. A report keeps that
selection even when the working decisions later change.

To renew an existing report:

1. Open the saved report and choose renewal.
2. Select the retained next source editions and compatible windows for the
   report's decisions.
3. Review the full original-to-next source and decision selection.
4. Accept that exact review to create the next frozen report.
5. Download the complete report ZIP and its editable handover.

The existing direct renewal interface is also available:

~~~sh
starforge weather-operations renewal-choices \
  --settings /private/weather-customer/settings.json \
  --report ORIGINAL_REPORT_ID \
  --output /private/outgoing/renewal-selection.json

starforge weather-operations renewal-review \
  --settings /private/weather-customer/settings.json \
  --input /private/outgoing/renewal-selection.json \
  --output /private/outgoing/renewal-review.json

starforge weather-operations renewal-commit \
  --settings /private/weather-customer/settings.json \
  --input /private/outgoing/renewal-selection.json \
  --expected-sha ORIGINAL_RENEWAL_REVIEW_SHA256
~~~

A new report records the previous report and the exact accepted source,
decision and window bindings. Receiving the complete onward package preserves
the prior selected decision revisions as well as the next report.

Follow [the full receiving workflow](RECEIVING.md) and
[the report renewal contract](REPORT_RENEWAL.md) for the original selection,
source, revision and receiving formats.

## Continue an operator workspace

Select the settings file already created by the original Weather initializer.
The existing initializer supports an original SF88 operator, or its accepted
offline review and private operator preset with explicit budgets. See
[the complete Weather operating guide](README.md) for those original commands.

The managed selection retains:

- The original Weather state and SQLite store.
- The buyer application state and original operator workspace.
- The saved generated seller client and its SHA-256 when configured.
- The provider mode and its credential/proxy environment references.
- The original request, native intent, review, outcome and receiving history.

In the browser, inspect the original request and captured response before
continuing it. Provider capture, native buyer delivery and an HTTP outcome keep
their existing meanings. The original model/date/variable selection and full
response bytes determine the Weather analysis. Use a new request when choosing
a different source.

Professional provider credentials remain environment references in the
settings. Supply them through the existing managed application environment;
the settings review and launch record contain their names. A saved application
does not copy secret values into the Weather settings.

## Close, recover and reopen

Stop the application before another process opens the same Weather store.
A saved Runtime Workspace application and the Weather customer state are
distinct retained objects: keep the original customer settings and data through
runtime upgrades.

For an operator workspace, use its existing complete recovery commands:

~~~sh
starforge weather-operations recovery review \
  --settings /private/weather-customer/settings.json

starforge weather-operations recovery snapshot \
  --settings /private/weather-customer/settings.json \
  --output /private/weather-backups/ORIGINAL_BACKUP \
  --passphrase-env OPEN_METEO_BACKUP_PASSPHRASE
~~~

The original recovery selection includes Weather state, buyer state, settings,
the original operator and any saved seller-client/setup files. Verify and
restore through the same original native recovery interface and its recorded
archive SHA. Native restoration uses the original absolute roots. Review the
restored settings in Applications and reopen that same workspace.

For a review customer, retain its complete report handovers for independent
receiving and preserve the stopped private workspace for continued local work.
A complete .weather.json handover carries editable source and report history;
an HTML report is the readable presentation of its frozen selection.

## Source and typed launch interface

The managed provider is registered as open-meteo-weather. Its source-owned
browser manifest carries the original Weather HTML, JavaScript and stylesheet.
The weather-operations source-selection recipe retains both report receiving
and report renewal contributions.

The typed managed launch export provides:

- inspectWeatherApplication(settingsFile) for the existing private settings
  and original directory selection.
- startWeatherApplication({settingsFile, expectedSettingsSha256,
  expectedSelectionSha256, expectedRuntimeRoot, port, environment}) for the original workspace/server
  lifecycle.
- weatherManagedOptions(args) for the shared command and observer argument contract.
- The exact startup announcement, selected mode, original roots and private
  browser URL for the Applications observer.

The launcher announces only after the original workspace is open and the
loopback server is listening. Its close operation drains the same workspace.
The provider uses the shared Applications review, retained definition, process
identity, lifecycle and terminal support.
