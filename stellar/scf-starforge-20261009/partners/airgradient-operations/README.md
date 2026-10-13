# AirGradient customer operations

A complete customer installation for one organisation and up to twenty selected AirGradient locations: original source acquisition, a thirty-day first report, later editions, one selected customer directory, and independent editable receiving. It runs within the maintained Merchant distribution and its existing Applications lifecycle.

The product keeps the provider's existing API and dashboard as the source. The installation adds the customer's location selection, reporting period, operating rules, retained work, recurring comparison and handover. The commissioning scope remains the original environmental work package in [the internal customer package](https://tokenjunkielabs.slack.com/docs/T0BRETUB5TK/F0C8R9S783B).

## Open the installed application

Use the complete current Merchant distribution with Node's node:sqlite available. No extra npm or Python dependency is introduced by this product.

Initialise one canonical absolute private customer directory. Its parent must already exist; this command creates the customer directory with mode 0700. Keep this same workspace for later editions.

    starforge airgradient-operations init --workspace /absolute/private/airgradient-customer
    starforge airgradient-operations serve --workspace /absolute/private/airgradient-customer --port 0

The original command prints one startup JSON record containing its private loopback URL. Open that URL. In the existing **Applications** host, select **AirGradient customer operations**, use the initialised customer directory, and follow its ordinary Review, Save, Review Start, Start, Open and Stop flow. An optional private environment JSON supplies a Dashboard token by its selected environment variable. The source-owned adapter verifies the actual listener and original workspace before Open is retained.

Direct source use is the same command through:

    node stellar/scf-starforge-20261009/partners/airgradient-operations/cli.mjs

The contribution registers the command, browser assets, typed imports and Applications provider together.

## Complete the customer installation

1. **Select the actual customer project.** Enter the organisation, report title and operating owner. The public indoor and outdoor catalogues read the provider's own pages. Select the required Location IDs and labels, choose measurements, bucket and local display timezone, and save the project revision. Up to twenty locations share one customer project. Save customer operating thresholds with their stated purposes when useful.
2. **Save the explicit period.** The browser initially selects the last thirty complete UTC days. Choose the period that serves the customer. UTC bounds must align to the selected 15-minute, hourly, eight-hour or daily bucket. The saved plan retains its exact project revision, connection and every source request.
3. **Acquire the source.** Each HTTP request has a retained attempt before it starts, and each returned body and its attempt/task reference are saved together before interpretation. Progress remains readable while acquisition runs. Reopen the same workspace after interruption; completed selections retain their original responses. **Acquire / resume** continues pending selections. Selecting **Retry failed or interrupted requests** also continues those original tasks. Supplier Retry-After values remain attached to the actual response and are obeyed. **Reopen saved responses** reinterprets a retained successful HTTP body after an actual parser correction, without fetching it again.
4. **Review the complete report.** Every chosen location and measurement appears, including missing values, gaps and acquisition responses. The review shows returned bucket coverage, the selected threshold, arithmetic mean of returned bucket means and comparison with the chosen prior edition. Commit binds exactly that review. A repeated accepted commit opens the same immutable report.
5. **Deliver the full package.** Download the complete ZIP, editable JSON, standalone HTML, summary CSV, full series CSV or report JSON. To install the agreed customer destination, enter its canonical private directory and choose **Deliver complete package**. The manifest is published last. Reopening an accepted directory reads back its retained file identities before returning the original delivery receipt, even after later attempts or receiving have advanced the workspace. A fresh destination can receive the report with current operational history. A different edition uses its own directory. The saved delivery receipt joins the original report and file identities.
6. **Receive and continue.** On an independent installation, initialise its own workspace. Select the complete ZIP or editable JSON, review its real source/edition summary, then receive it. Select **Use received project**, choose the next actual reporting period and retain the prior edition as baseline. The receiver preserves frozen reports, original successful and failed response bytes, provider definition, project revisions, acquisition attempts, current task state and receiving history. A partial received study retains its actual Retry-After deadline and can reopen a captured HTTP 200 body after a parser correction. Newer incoming completion advances unfinished local tasks; completed or running local work and newer local task states remain selected. Existing local project selections remain available.

The ZIP is directly receivable. Its directory, entry sizes, CRCs, file hashes, manifest, selected report and embedded editable package are read before receiving. Receiving then recomputes the report from the retained original sources and source contract. An exact reimport reopens its existing receipt. Multi-edition archives retain baseline source history under the shared 128 MiB package limit and the regular ZIP entry bound; the third full twenty-location edition remains directly receivable.

## What the returned data means

The public Map connection bundles the exact current [Map OpenAPI original](sources/map-openapi-original-20261013.json): 79,954 bytes, 37 paths and 62 schemas. Its original SHA-256 is f25b2cf80b1148c3fe5a80abc926da0b31009dd27e21b6c9fa19aab4bcb70922. The connection verifies its actual metadata/history operations and retains that full definition in independent receiving.

A customer project can combine public indoor and outdoor locations. Select the actual source type beside each provider ID. The two API families retain separate identities throughout the saved project, tasks, normalized series, report rows, CSV exports and comparisons with a prior edition. Customer labels and display timezones are explicit project choices.

| Source | Metadata | History |
| --- | --- | --- |
| Outdoor Map | /map/api/v1/locations/{id} | /map/api/v1/locations/{id}/measures/history with the selected measure, start, end and bucketSize |
| Indoor Map | /map/api/v1/indoor/locations/{id} | /map/api/v1/indoor/locations/{id}/measures/history with start, end and bucketSize; one response supplies all available fields |

Outdoor history has one timebucket/value series per requested measurement. Indoor history returns timebucket and its available pm25, pm10, atmp, rhum and rco2 fields. An absent indoor measurement remains null for that returned timestamp. Both histories use ISO timestamps with timezone and an explicit provider bucket. The application selects fixed fifteen-minute, hourly, eight-hour or UTC-day intervals. Its source requests follow the current declared parameters.

The parser retains each original response before interpreting it. Returned decimal strings remain original strings beside their numeric arithmetic value. Zero stays zero; missing observations stay null. Repeated or misaligned time buckets identify an actual source-contract change. A period is half-open [start, end) in UTC, so boundary observations belong to one selected report interval.

For public Map data, report means weight returned non-null provider buckets equally. Coverage counts those buckets against the selected UTC interval. Customer thresholds apply to the returned bucket values and retain the operating purpose supplied by the customer. Original source aggregation remains visible in the response files.

Provider, datasource, contributor and licence metadata remain attached to their actual source location. Indoor metadata does not invent an outdoor location name, owner or timezone. Returned licenseDetails and dataSourceDetail links appear in the customer HTML, alongside the original flat licence names and coarse source coordinates.

For twenty outdoor locations and all five measurements, a plan has 120 requests: twenty metadata selections plus one history per location/measurement. Ten outdoor and ten indoor locations with all five measurements need 80 requests, because each indoor history supplies its available fields together. A mixed twenty-location PM2.5 study needs forty requests. Catalogue reads retain their own original source captures and one-based pagination; the returned total is the current page’s record count.

The existing [complete source intake](https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791851973806789?thread_ts=1791730220.899469) supplies the actual ten-outdoor/ten-indoor location selection and its two successive thirty-day periods. Its complete original source packet preserves 14,311 hourly rows across the combined 12 September–13 October UTC span, including the later-starting indoor series. Continue that same selection and its retained source/report reconciliation through the installed product.

## Authorised Dashboard connection

The built-in Dashboard connection is ready to select in the customer project. It retains the complete 18,361-byte official OAS 2.0 source in [sources/dashboard-openapi-original-20261013.json](sources/dashboard-openapi-original-20261013.json), acquired from [the exact Swagger URL](https://api.airgradient.com/public/docs/api/v1/swagger.json). The private Dashboard and public Map keep separate connections and parsers.

Set AIRGRADIENT_TOKEN through the existing Applications private environment setting, or in the native process environment. That token is used only for the exact Dashboard origin. The stored request URL and complete customer package retain the token-free URL, provider definition and host variable name.

The implementation follows **getPastMeasures** at:

    GET /public/api/v1/locations/{locationId}/measures/past?from=BASIC_ISO&to=BASIC_ISO

The provider requires BASIC ISO 8601 bounds with UTC offset, for example 20261001T000000Z, and limits an interval to ten days. The whole requested reporting period is partitioned into useful balanced segments. Each source query includes a one-second margin at both boundaries while remaining inside that ten-day limit. The original overlapping response bytes are retained; each timestamp is assigned to exactly one half-open interpretation segment. This accommodates either endpoint inclusion convention without duplicating measurements across the customer report. A thirty-day installation uses four balanced history requests per location plus one current-metadata request per location: 100 planned requests for twenty locations.

The response is the source-defined Measures array. Its provider-selected aggregates may be five or sixty minutes depending on availability. The application retains every received provider timestamp, corrected measurement field, original value and returned datapoints value. The selected reporting bin is an equally weighted mean of the returned aggregate values whose timestamps fall in that bin. The report mean weights populated reporting bins equally. Dashboard coverage therefore counts populated reporting bins, with the provider rows available in the full series and original responses. Thresholds apply to the displayed reporting-bin means.

The default corrected measurement fields are pm02_corrected, pm10_corrected, atmp_corrected, rhum_corrected and rco2_corrected. The separate rolling aggregate operation advertises last-24-hour, last-48-hour and last-seven-day windows; the installation uses the per-location historical operation for an arbitrary complete customer period.

To retain a fresh official definition in the same customer source history:

    starforge airgradient-operations definition --workspace /absolute/private/airgradient-customer --output /absolute/private/dashboard-swagger.json

The **Dashboard connection setup** section can read that source or open the retained file. Its optional connection settings contain an ID, title and host token variable, for example a customer-specific AIRGRADIENT_CUSTOMER_TOKEN. The compiler resolves the actual response schemas and checks the original operation, BASIC-ISO parameter format, history limit, fields and authentication contract before saving that connection. Select the saved connection in the project and save its next revision. Existing reports retain their original source connection and bytes.

## Original command workflow

All command input/output paths are canonical absolute private files. Browser uploads use the selected file bytes directly. For command use, receive downloaded files into a private directory and set their mode to 0600.

**project-save --input PROJECT.json** accepts:

    {
      "organisation": "Customer organisation",
      "title": "Air quality operating report",
      "owner": "Customer operating owner",
      "connectionId": "map-public",
      "locations": [
        {"id": "ACTUAL_PROVIDER_LOCATION_ID", "sourceType": "outdoor", "label": "Customer location", "timezone": "UTC"}
      ],
      "measures": ["pm25", "atmp", "rhum"],
      "bucket": "1h",
      "minimumCoverage": 0.9,
      "thresholds": {},
      "notes": ""
    }

Select the real location from **catalogue** before saving this input. An update also supplies **--expected-current ORIGINAL_PROJECT_REVISION_ID**. **plan --input PLAN.json** takes the returned project revision ID, explicit start/end timestamps, title, notes and optional original baselineReportId.

Continue the same operation:

    starforge airgradient-operations acquire --workspace DIR --plan PLAN_ID
    starforge airgradient-operations review --workspace DIR --plan PLAN_ID
    starforge airgradient-operations commit --workspace DIR --plan PLAN_ID --expected-review REVIEW_SHA
    starforge airgradient-operations deliver --workspace DIR --report REPORT_ID --destination CUSTOMER_DIRECTORY
    starforge airgradient-operations receive-inspect --workspace RECEIVER_DIR --input CUSTOMER_ZIP
    starforge airgradient-operations receive --workspace RECEIVER_DIR --input CUSTOMER_ZIP

The review response contains the exact reviewSha256 for commit. Reopening an interrupted acquisition uses the same PLAN_ID; explicit **--retry-failed true** includes interrupted or failed original tasks. Reopening a frozen report uses the same REPORT_ID. A later customer edition is a new saved plan with the intended period and prior report.

The original private files, SQLite state lease, public HTTPS transport, explicit proxy configuration and installed Applications lifecycle come from the maintained Merchant source. Initialisation optionally accepts a private **--network** JSON with the existing transport's trustedProxy or explicitly selected managed-cloud sandboxGatewayIPv4. A routes object can provide separate exact settings keyed by https://map-data.airgradient.com and https://api.airgradient.com when those provider origins use different configured transport paths. The original provider origin, DNS policy, TLS connection and source request are preserved.

## Native customer receiving

Continue this same installation in an equipped cloud or native workspace. Use the actual public catalogues and the original twenty-location intake to select the same indoor and outdoor AirGradient locations, operate the initial thirty-day report and a second actual period, then deliver the full package into its customer directory. Receive both the editable JSON and complete ZIP in a separate workspace, select the received project, make the next saved plan, and reopen the same workspaces after stopping their native processes. Desktop and narrow browser views expose the same complete operation.

Retain the original chosen locations, periods, source responses, report IDs, customer ZIP and the receiving workspace. Feed an actual product correction back to this source arm in the existing [commissioning thread](https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791850296790379?thread_ts=1791730220.899469). The native operation joins the original environmental customer package, including the already retained complete Dashboard definition.

## Continue from an original source collection

A complete retained public Map source collection can supply several reporting periods. Import the original Commons source packet through **Open an original source collection**, review its complete source and location counts, and retain that exact selection. The collection includes the complete provider definition, all original source files, source manifest, original location pages and complete history responses.

Choose the collection in **Reporting period and source**. **Use source locations and measures** fills the twenty-location selection, actual source type and available common measurements into the customer form. Review the proposed labels, explicit display timezones and operating criteria, then save the project revision. The public source packet's indoor locations have no provider location name or timezone; their editable customer label uses the indoor ID and their initial display timezone is explicitly UTC.

The existing 6A62 collection contains ten outdoor PM2.5 histories and ten indoor all-field histories. PM2.5 is the common measurement across all twenty. Indoor-only selections can use the other retained indoor fields, including original decimal strings and nulls. Select the desired measurements for the saved project. A measurement or period outside the selected collection identifies a source selection to change.

Use the retained **initial** period, or enter any aligned contained interval. Saving its plan selects the original documents and prepares the report immediately. Its task URLs remain the original thirty-one-day URLs. The reporting interval separately selects the half-open thirty-day period; the original source files retain their complete observations before and after that selection. Original metadata pages are retained whole, with each selected location's actual row.

The retained record carries the original reader, content basis and retrieval window. Its HTTP status, network attempt and exact acquisition timestamp stay empty because this collection supplies reader-retained documents and a recorded retrieval interval. The HTML and full-series CSV expose that source basis. A live source acquisition keeps its actual HTTP response, network attempt and exact retrieval timestamp.

Commit and deliver the first report through the usual customer workflow. Receive its complete ZIP or editable JSON into another workspace, select the same retained collection and the **later** reporting period, use the first report as baseline, and commit the later edition. The whole original collection travels in the editable package and as **original-source-PACKET_SHA256.json** in the customer delivery. It remains available for another contained reporting period after cold reopening.

### Complete original-source customer operation

The maintained native programme operates the entire saved-source customer journey:

    node stellar/scf-starforge-20261009/partners/airgradient-operations/examples/receive-original-source.mjs \
      --input /absolute/private/AirGradient-complete-source.json \
      --project /absolute/private/customer-settings.json \
      --output /absolute/private/airgradient-original-customer

The output parent must already exist. The programme creates its private customer output directory, preserves the exact input packet, saves the project, produces the first report and its whole delivery, receives the actual ZIP into another saved workspace, produces the later report from the same original source with the first as baseline, returns the complete later package to the first workspace, reopens the original accepted destination, and cold reopens the receiving workspace. Both native SQLite workspaces and all report packages remain under the selected output directory.

Use the existing source operation **AIRGRADIENT-API-SOURCE-6A62-20261013** and its unchanged original packet. The complete logical JSON is **1,939,630 bytes**, SHA256 **5465e53d831cedae734f9f4225b97fc683ea49eed038190c80271ff01fa1d99f**. It contains **41 original files / 1,688,975 source bytes**. The source operation's original nine-part gzip transport is **273,728 bytes**, SHA256 **5f771ecf53d879cff3a6bef8f0e61e62ad117833511430df3312e5a8b0279ae6**. Decode that transport into the full JSON input using the existing Commons source receiver.

A customer settings file supplies the real organisation and operating owner. For this internal public-source operation:

~~~json
{
  "organisation": "TokenJunkieLabs environmental operations",
  "title": "Public monitor reporting operation",
  "owner": "Bryce Muhlnickel",
  "minimumCoverage": 0.9,
  "thresholds": {},
  "notes": "Original public AirGradient source operation and independent customer receiving."
}
~~~

Omitting locations and measures selects the collection's original twenty locations and its common PM2.5 history. Explicit customer locations and measures can select a subset. A customer's operating threshold includes its chosen purpose; the programme supplies no health or certification criterion.

The first period is September 12–October 12, 2026 UTC. The later period is September 13–October 13 UTC. Both select 720 possible hourly bins per location from the original September 12–October 13 source requests. The retained source's coverage table records 13,833 initial and 13,876 later returned PM2.5 rows across the twenty locations, including the later-starting indoor 102112443 history. The operating programme writes the actual report rows, means, counts, readiness and source relationships into **operation-result.json**, together with complete customer paths and file hashes.

The programme is resumable in the same output directory. It retains the original intent and source packet, reuses its saved project and exact edition plans, opens the original ZIP identities and accepted delivery receipts, and continues the same receiving operations. A prior customer selection in either workspace remains available. An explicit **projectId** can select an original project revision for a plan without changing the workspace's current project.

### Source collection commands and interfaces

    starforge airgradient-operations source-inspect --workspace /absolute/private/customer --input /absolute/private/source.json
    starforge airgradient-operations source-import --workspace /absolute/private/customer --input /absolute/private/source.json --expected-packet PACKET_SHA256
    starforge airgradient-operations source-project --workspace /absolute/private/customer --source-set SOURCE_SET_ID --input /absolute/private/customer-settings.json --output /absolute/private/project.json

The source-project command writes the complete proposed customer project. Save that project with the existing project-save command, then include **sourceSetId** in each plan input. The normal review, commit, deliver, export and receiving commands continue the same workflow.

The authenticated HTTP operations are **POST /api/source/review** and **POST /api/source/import?expected=PACKET_SHA256**, both with the complete original packet body. The latter binds the selected packet from the review. **POST /api/plan** accepts sourceSetId and an optional explicit projectId beside expectedProjectId, period and baselineReportId. Installed imports include **./partners/airgradient/source-intake** and the complete typed Workspace methods.

The saved collection is immutable. Importing the same original packet reopens its existing identity. Report plans retain the exact collection, definition, selected source file, original request URL and metadata selector. Receiving reconstructs those selections against the whole original collection before reopening the reports, then retains the full collection for continued work.
