# Pirate Weather customer forecast reports

This product keeps one customer's report contract, exact original Pirate Weather responses, named report reviews, native dataset releases and complete receiving history in one private workspace. It supports one to three locations, an explicit provider unit system, a 48-hour reporting window and two agreed daily review slots.

The source is integrated into the maintained Starforge merchant product. The browser, CLI, typed client and MCP provider use the same workspace and saved operation UUIDs. Applications owns the original Start/Open/Stop lifecycle. Existing SF30, SF82 and SF88/SF100 implementations own dataset versioning, merchant release operation and Buyer receiving.

## What an operator can complete

1. Save the actual customer, purpose, destination, locations, units and review slots as a versioned contract.
2. Preview one explicit forecast request, or select an already retained original response file and its actual HTTP metadata.
3. Retain the response bytes, original headers, provider usage/deadline, requested and returned coordinates, flags, timestamps and every original response block.
4. Select one complete source for each contract location and prepare a named 48-hour report.
5. Inspect coverage, missing or duplicate hours and exact source values; compare retained report editions and make a named approval or changes-required decision.
6. Download the approved JSON, CSV and HTML outputs, or prepare that approved table through the original versioned dataset publisher.
7. Inspect, stage, activate, start, stop and reconcile the original merchant release. Receive selected original Buyer Inbox results without creating a purchase.
8. Export a complete source-inclusive project, preview and receive its exact bytes, then reopen the received original workspace.

The two daily slots describe the agreed review cadence. This application does not silently schedule provider calls or send messages to the described destination. A host operator can use the same explicit CLI/client actions in an independently approved schedule.

## Start the installed application

Use a source-selected `pirate-weather` package built by the maintained distribution builder. The original runtime installer prepares and installs its dependency profile. The package manifest binds every included source path, byte count, SHA256 and Git blob.

```sh
PIRATE_INSTALL=/absolute/private/pirate-installation
PIRATE_WORKSPACE=/absolute/private/customer-forecast
PIRATE_CLI="$PIRATE_INSTALL/package/source/stellar/scf-starforge-20261009/sf30-seller-sdk/pirate-weather/cli.mjs"

node "$PIRATE_CLI" init --workspace "$PIRATE_WORKSPACE" --name "Pirate Weather" --api-key-env PIRATE_WEATHER_API_KEY
node "$PIRATE_CLI" serve --workspace "$PIRATE_WORKSPACE" --application-source "$PIRATE_INSTALL/package"
```

The initialization creates an empty workspace. It does not create a forecast or contact the provider. Supply the actual API-key value through the selected environment variable only when an explicit `capture.fetch` is authorized. The key value is never stored in the workspace, request URL, report or complete-project archive.

The server emits one compact startup object containing its private browser URL, original workspace and instance identities, source identity and connection-file path. Open that exact URL. The API accepts the current bearer token only over its original loopback authority; it checks origin and cross-site request context. The token is removed from the visible URL fragment after the browser receives it.

An already initialized project can also be selected in the original Applications manager as **Pirate Weather forecast reports**. Start/Open/Stop and saved launch recovery remain with that manager. Do not start a second CLI owner against the same project.

## Source and scientific meaning

Forecast values remain forecasts. Report preparation does not establish independently observed weather, derive an alert severity or infer a missing value.

Numeric values retain their exact original JSON number token as text, accompanied by `valueType=number-token`. UTC timestamps are converted only when they are safe integral Unix times. Requested and returned coordinates, the provider time zone, unit system, source row ordinal, response digest and flags digest travel with each row.

The report selects the inclusive start and exclusive end of an explicit UTC 48-hour window. Missing fields and hours remain missing. Duplicate and non-hourly records remain visible. Currently, daily, alerts and every other original block remain in the complete source response.

Spreadsheet CSV protects formula-like text with one leading apostrophe. Negative numeric tokens remain numeric literals. JSON and original response bytes retain the original text. Native machine-readable dataset CSV uses the original projected strings without spreadsheet substitution.

[The source contract](SOURCE_CONTRACT.md) explains the exact source formats and provenance. [The operating guide](OPERATING.md) provides the complete workflow, original-request recovery, native release and receiving commands.

## Decisions and recovery

Every mutation includes a fresh UUID and the displayed workspace revision. The original request is retained before execution. After a lost reply, inspect that UUID through **Request recovery**, `recover` or the client. Do not create a replacement UUID just to find out whether an accepted action completed.

Report approval binds the exact report edition. A later report or review does not inherit approval implicitly. Contract revisions preserve the original contract ID and history.

A returned provider limit retains its actual status, headers and deadline. Calls remain held until the known deadline permits another explicit operation. An undated hold can be released only by a named decision based on a later complete original response with positive remaining quota. This does not repeat the limited invocation.

An unknown provider invocation is never replayed. Retain its original outcome or reconcile it with the authentic saved response and its original metadata. Unknown native activation/start/stop/rollback replies use the original release-state observation and generation proof, with a separate named reconciliation.

## Complete project and trusted receiving

A complete project contains the exact selected application package, original workspace identity/revision, retained request and review history, source bodies, report outputs, all stored dataset generations, publisher drafts and SF82 release history. Original active connection tokens, process controls and kernel-lock files are omitted.

Export requires all native releases to be explicitly stopped. The copy uses the original publisher, release and dataset writer locks. Source preparation finishes before the export request is accepted, so a lost reply can return the already issued exact archive without re-exporting a changed source tree.

Receiving validates the complete archive and requires the same trusted application edition. It verifies included source; it never executes arbitrary uploaded code. The original publisher relocation API and a source-bound SF82 installation sidecar bind the copied dataset to its new location while preserving immutable release source, original IDs and all prior decisions.

Dependency modules are installed through the maintained runtime installer. A retained source archive/profile/lock is provenance for that lifecycle; copied absolute installation metadata does not become a live installation. The prepare-runtime CLI verifies the retained source archive against the trusted package manifest, prepares a new installation and receives the exact original lock before any npm call. The original installer then performs dependency installation under its own lease. Follow the cold-install instructions in the operating guide.

## Current delivery status

This is the complete source implementation for the original Pirate Weather product arm. It does not contain a fabricated forecast, API key, customer contract, paid receipt or provider acceptance. An actual customer source/key and designated operator inputs are required to operate the provider/report/native delivery workflow. Source publication, application validation and any real customer operation must be reported separately.

## Main source files

| File | Purpose |
| --- | --- |
| `contract.mjs`, `provider.mjs` | Exact input/source contract, bounded original request and usage evidence |
| `core.mjs`, `reports.mjs` | One saved workspace, original requests, report editions and named reviews |
| `dataset.mjs` | Original SF30 publisher, SF82 release and SF88/SF100 receiving composition |
| `package.mjs`, `portable.py` | Complete source/state export, inspection, resumed receiving and relocation |
| `server.mjs`, `public/` | Private browser workflow and retained file transfers |
| `cli.mjs`, `client.mjs`, `client.d.mts` | Operator CLI and typed original-instance client |
| `operator*.mjs`, `application-provider.mjs` | Maintained MCP and Applications registration |
| `source-files.json` | Explicit application and dynamic-source selection |

MIT-licensed application source. Original provider responses retain their source attribution and applicable provider terms; the application does not substitute a new provider license.
