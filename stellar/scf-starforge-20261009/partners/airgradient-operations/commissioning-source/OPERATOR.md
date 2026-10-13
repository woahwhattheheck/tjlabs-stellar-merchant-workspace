# AirGradient complete source reports and receiving

This directory supplies the complete reporting layer for the existing AirGradient customer application. It includes the original 41-member public Map source packet, both fully generated thirty-day reports, all selected hourly readings, measure coverage and gap intervals, contributor attribution, and the commands that reproduce and receive the whole report collection.

The existing application is one directory above this package. Its project, retained-source intake, saved plans, delivery destination and editable application receiving remain the original product workflow. This command also produces a complete independently readable report collection from the exact retained source. It makes no HTTP requests and requires no provider token.

## Open the delivered result

Open **reports/operator-report.html** in a browser. It shows all twenty selected locations and all sixty requested measurement series side by side for the two periods. The report links the complete JSON and CSV exports, classified gap intervals, source attribution, window comparison and the original source packet.

| Period | UTC bounds, end excluded | Expected location-hours | Returned hourly records | Missing location-hours | Valid measured values |
| --- | --- | ---: | ---: | ---: | ---: |
| Initial | 12 September–12 October 2026 | 14,400 | 13,833 | 567 | 37,015 |
| Later | 13 September–13 October 2026 | 14,400 | 13,876 | 524 | 37,144 |

Each interval has 720 hours per location. The selection contains ten public outdoor locations and ten public indoor locations. The captured outdoor history requested PM2.5 only. Each indoor history returned the five fields PM2.5, PM10, temperature, relative humidity and CO2. Consequently there are sixty requested measure series in each report.

The original combined capture contains 14,311 hourly records over 12 September–13 October UTC. The initial and later reports select their own half-open intervals from those same original responses. In the window comparison, 435 records leave, 478 enter and 13,398 remain. This comparison describes movement of the reporting window; it does not assert a subsequent provider data revision.

## Build the complete receiving directory

Use the Node runtime provided with the original Merchant installation. This reporting command needs only Node built-ins; no npm installation, Python dependency or hosted job is required.

From this source directory:

    node report-cli.mjs build --out /absolute/private/airgradient-reports

To select a later complete source packet explicitly:

    node report-cli.mjs build --source /absolute/private/next-source-packet.json --out /absolute/private/airgradient-reports-next

The import contract is **commons.delivery.source_packet.v1** with complete UTF-8 member bodies. The included **source-scope.json** declares the selected public Map locations, one-hour UTC capture, original history requests and two report windows. The retained measurement catalogue supplies the exact default units. Each source body is checked against its declared bytes and SHA-256 before use.

The command writes a complete usable collection:

- **input/source-packet.json**: the exact original packet.
- **source/**: all 41 original member bodies materialized unchanged, including definitions, source pages, location metadata, current snapshots, histories, original manifests and original guide.
- **reports/**: both full JSON datasets, all readings and summary CSVs, gap intervals, window comparison, attribution, operator HTML and deterministic report manifest.
- **reports.mjs**, **report-cli.mjs**, **OPERATOR.md**: the complete reporting program and guide.
- **delivery.json**: the complete receiving manifest, published after every selected member exists.

Existing matching files are retained and reopened. An interrupted export can resume into the same directory when its existing selected members match. A different existing body is never replaced; use another output directory for a different source packet or generator edition. Individual member publication uses atomic create-only hard links on the selected local filesystem. The final manifest appears only after all members are present. A directory without that complete manifest is an unfinished export.

The command reopens every selected member and prints the source identity, period counts, member count and report path after successful completion.

## Receive and reopen elsewhere

Move or copy the whole generated directory, including input, source, reports, both program files and the guide. Open its report immediately, or use its included command:

    node /received/airgradient-reports/report-cli.mjs verify --directory /received/airgradient-reports

Receive the complete selected collection into an independent directory:

    node /received/airgradient-reports/report-cli.mjs receive --from /received/airgradient-reports --out /absolute/private/airgradient-reports-received

Then reopen the new copy:

    node /absolute/private/airgradient-reports-received/report-cli.mjs verify --directory /absolute/private/airgradient-reports-received

Receiving recomputes both reports from the original packet and compares every expected original, generated and program member before completing the destination. No network acquisition occurs. All relative references work after the move. The command transfers the complete manifest-selected report collection; unrelated files an operator placed beside it remain outside that manifest.

Keep the original application's editable package for continuing its saved projects, review decisions, plans and delivery history. This report collection preserves the original source and all report outputs. The original application receiving operation, described in **../README.md**, carries its separate editable SQLite work and native project history.

## Use the complete source in the original application

The canonical source is **input/source-packet.json**, operation **AIRGRADIENT-API-SOURCE-6A62-20261013**, captured packet timestamp **2026-10-13T00:31:11Z**.

The complete packet is 1,939,630 bytes with SHA-256:

    5465e53d831cedae734f9f4225b97fc683ea49eed038190c80271ff01fa1d99f

Its 41 embedded member bodies total 1,688,975 bytes. The exact original delivery is available in the [commissioning source return](https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791851973806789?thread_ts=1791730220.899469).

Use the original application's retained-source intake to receive this packet and its declared selection. It must retain the actual wider history requests and source provenance when creating the two shorter reporting periods. The original Sep12–Oct13 request URL is never relabelled as a Sep12–Oct12 or Sep13–Oct13 acquisition.

The pure **reports.mjs** module provides:

    import {readSourcePacket, compileSourceReports} from "./reports.mjs";
    import {createHash} from "node:crypto";

    const hashText = text => ({
      bytes: Buffer.byteLength(text, "utf8"),
      sha256: createHash("sha256").update(text, "utf8").digest("hex")
    });

    const report = compileSourceReports(completeOriginalPacketText, hashText);
    // report.periods: both complete report objects
    // report.outputs: every complete report/export body keyed by relative path
    // report.manifest: original member and generated artifact identities
    // report.input: exact retained source objects, selection and history maps

The module performs no acquisition or filesystem writes. A caller can integrate the returned complete outputs with the original selected customer destination while keeping the original source request, saved project and receiving history. The original app's own report IDs and review decisions come from its maintained saved-state workflow; they are not invented by this reporting module.

## Interpret the values and gaps

| State | Meaning | Numeric CSV cell |
| --- | --- | --- |
| REPORTED_NUMBER | A finite JSON number was returned. Zero is a valid number. | Original numeric value |
| REPORTED_DECIMAL_STRING | A complete finite decimal string was returned. Its exact string remains in JSON. | Parsed numeric value |
| NULL | The requested field is explicitly null in a returned hourly record. | Empty |
| ABSENT_FIELD | The requested field is absent from a returned hourly record. | Empty |
| NO_BUCKET | The expected hour has no returned record. | No fabricated readings row; represented in gaps and summary |
| NOT_REQUESTED | This measurement was not included in the selected history request. | Empty |
| INVALID | The original field is neither a finite number nor a complete finite decimal string. | Empty; original value retained |

The readings CSV contains one row per actual returned bucket. Every row carries the source-qualified Location ID, original timestamp, original history member and zero-based row position in that member. Numeric value and state columns occur together. It does not fill missing hours with invented observations.

The complete report JSON preserves each original row object, including every raw decimal string, explicit null and any extra provider fields. Its per-history source metadata links each selected row back to its original complete response. **source_row** is an index, not an additional provider field.

Coverage is valid reported values divided by the 720 expected hours for that particular requested measurement. Missing bucket hours, null fields, absent fields and invalid values are counted separately. Gap CSV rows group consecutive hours of the same state for the same location and measure; both start and end are UTC, with end excluded.

Six indoor PM10 series contain no reported PM10 values. Their null PM10 values must not be described as full device outages. Other fields in those same returned records still contribute to their own reports.

Public indoor Location ID **102112443** first appears in this capture on 23 September at 16:00 UTC. It has 440 of 720 reported hours in the initial window and 464 in the later window, so its actual period coverage remains visible. No earlier readings are filled in.

A separate current observation may contain a field that the history request did not select. The current snapshot remains in location metadata and never fills a historical gap. In particular, current outdoor PM10, temperature, humidity or CO2 values do not turn the PM2.5-only history into a five-measure history.

## Arithmetic and units

The mean is the equally weighted arithmetic mean of available provider hourly aggregates. It is displayed to six decimal places. Minimum and maximum use the same available numeric values. The calculation uses no interpolation, no zero filling and no sample-count weighting, since these retained hourly records do not provide the underlying raw sample weights.

The default public Map catalogue units are:

| Measurement | Unit |
| --- | --- |
| PM2.5 / pm25 | μg/m³ |
| PM10 / pm10 | μg/m³ |
| Temperature / atmp | °C |
| Relative humidity / rhum | % |
| CO2 / rco2 | ppm |

The original provider aggregation and any upstream processing remain the source meaning. This report applies no additional provider correction. It does not merge private Dashboard fields or units into the public Map result.

Values outside a catalogue range are counted and retained. They are not clamped or silently removed. No health threshold or operating threshold has been invented for this public source selection.

Numeric CSV cells remain numeric, including negative values and zero. Text cells beginning with a spreadsheet formula prefix receive a leading apostrophe. Their unchanged text remains in the source packet and JSON.

## Source attribution and location meaning

The complete source metadata retains the provider, datasource, original owner name and ID where supplied, source details, licence names and licence links. The selected locations declare CC BY-SA 4.0. The derived reports keep that attribution and share-alike licence; see **reports/ATTRIBUTION.md**.

Public indoor coordinates retain the source's coarse precision. No household, street address, building name or occupancy is inferred. Outdoor names remain the provider's actual supplied labels. A missing owner name stays missing. A supplied owner URL without a scheme stays the original text rather than becoming an asserted verified link.

The retained page-1 metadata/current responses are candidate pages used to select these twenty records. They are not a complete world roster. The separate pagination responses and full current API definitions remain among the original source members.

## Source contract changes and later use

This module follows the captured one-hour UTC, public Map, one-to-twenty-location source contract. It requires two report windows fully contained in the declared capture. The full original packet and scopes remain available when making a later edition.

A duplicate history hour or a mismatched source identity is reported at import because silently selecting a row would change the result. An invalid measurement value stays in the original data and appears separately in the report. New source contract support belongs in the maintained acquisition/intake and reporting implementation together, preserving existing reported editions.

The complete original application, independent receiving, commercial scope and ongoing installation coordination remain in the [AirGradient commissioning thread](https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791850296790379?thread_ts=1791730220.899469).
