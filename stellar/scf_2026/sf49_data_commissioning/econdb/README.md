# Econdb maritime period delivery

This application receives complete original Econdb port responses, keeps their exact source bytes, compares explicitly selected periods and source editions, and produces a complete analyst export. It joins the existing SF30 dataset merchant and SF88/SF100 buyer delivery instead of implementing another payment or serving system.

Original operation: **ECONDB-MARITIME-PERIOD-WORKSHARE-BBBD-20261013**.
Coordination: https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791883018277929

Commercial proposals, named customer inputs and correspondence belong in the original private business case. This folder contains reusable product source and original public API documentation.

## Open the application

Open **maritime-workbench.html** directly in a browser. It is a self-contained offline page: no network calls, third-party scripts, credentials or installation are needed. Start with either published issuer example or load a retained original response together with its descriptor. Use **OPERATOR_GUIDE.md** for the complete opening, comparison, export and receiving course.

The workbench begins empty. Example selection is explicit and identifies the documented source role and unknown port. The displayed table pages through 100 cells at a time; CSV, JSON, the standalone HTML report and saved workspace contain the complete applied selection. A workspace includes original current/prior response content, descriptors and applied choices. Changing a draft date without applying it does not change the saved accepted view.

## Runtime and native receiving

Use Node.js 22 or newer, as required by the maintained SF30 SDK. The source capture, analysis and offline workbench need no npm packages. Existing native Stellar payment operation uses the already-maintained SF30 native factory and original x402 2.28.0 packages described in **SF30_PUBLICATION.md**.

Run commands from this directory. The examples are exact JSON transcriptions of named examples in the retained issuer YAML. They have no selected port identity and do not represent a live acquisition.

~~~sh
node maritime-cli.mjs receive --source examples/capacity.response.json --descriptor examples/capacity.descriptor.json --out /absolute/private/econdb-editions
node maritime-cli.mjs analyze --edition /absolute/private/econdb-editions/issuer-doc-capacity-by-operator --from 2022-02-01 --until 2022-04-01 --before-from 2022-02-01 --before-until 2022-03-01 --after-from 2022-03-01 --after-until 2022-04-01 --out /absolute/private/econdb-capacity-review
node maritime-cli.mjs receive --source examples/traffic.response.json --descriptor examples/traffic.descriptor.json --out /absolute/private/econdb-editions
node maritime-cli.mjs analyze --edition /absolute/private/econdb-editions/issuer-doc-container-traffic --from 2022-02-01 --until 2022-04-01 --out /absolute/private/econdb-traffic-review
node maritime-cli.mjs list --root /absolute/private/econdb-editions
~~~

The analysis directory includes a standalone report, the selected JSON/CSV, complete original current response and descriptor, comparison results when requested, and a file manifest. A source-revision review additionally includes the complete earlier response and descriptor. It can therefore be transferred without depending on the first operator's absolute source directory.

For an authorized capture, supply the existing API credential through the process environment variable **ECONDB_TOKEN**. It is never written into retained descriptors or exposed in the offline browser. A capture job file is an array of **{id, request}**. Request.kind is **ports**, **capacity-by-operator**, or **container-traffic**. Choose actual LOCODEs from the complete retained original port catalogue and the actual commissioning scope.

The capacity request accepts **flow**, **operator** and **top**. Its default here is explicit **flow=throughput&top=0**, so a complete operator request does not silently inherit the issuer's top-eight grouping. With an operator selected, omit top because the source ignores it. Container traffic and the port catalogue declare no query parameters.

~~~sh
node maritime-cli.mjs capture --requests /absolute/private/selected-requests.json --out /absolute/private/econdb-editions
~~~

An existing edition ID reopens the retained original; it does not make another network request. Use a distinct explicit edition ID for a later acquisition. Requests preserve the fixed official HTTPS origin, reject redirects, and retain capture time, URL, response hash and selected response headers. A complete successful HTTP response that fails UTF-8, JSON or structural interpretation is still saved with its descriptor and an explicit receiving error. Repair the interpretation against those retained bytes. Complete acquisition never depends on a second fetch merely to recover a rejected shape.

## Source meaning

The original 45,151-byte OpenAPI is retained under **sources/** at SHA-256 **c271e5e1799a7a47b3f598cdf286d25c7bb68108cd9f3e466231f4f95a82c915**, retrieved from https://api.econdb.com/v1/schema/.

The port directory describes the issuer's top 400 ports by traffic, not every port worldwide. Nullable or missing catalogue identity fields remain in the retained source and appear as unusable selection rows; they do not discard the complete catalogue.

Calling-vessel TEU capacity and estimated container TEU are different measures. Capacity/operator rows have a declared monthly frequency. Container-traffic observations keep their original Date labels with no inferred monthly aggregation. Import, export, transshipment and cargo request meanings stay explicit in the request, report and dataset metadata. Dwell-time examples have an unresolved schema/example name discrepancy and are outside this initial calculation course.

Port resources do not declare server-side date filters. All analysis windows are local, half-open **from <= original Date < until** selections over complete retained originals. Whole-month comparisons use equal numbers of disjoint months within the same source series. Missing months, duplicate dates and unknown cells prevent a complete total; no missing value becomes zero. Partial-month selections remain available for observation review, with monthly completeness deliberately uncomputed.

The parser preserves every original JSON numeric lexeme and performs addition, differences and ratios with exact integer decimal arithmetic. Source null, missing field and unsupported value remain distinct states. Repeated JSON keys are rejected. Per-series percent change has a declared zero-baseline state; displayed percentages round half away from zero to four decimal places. No cross-measure total is created.

Comparing two editions requires the same exact request and source role and a later capture timestamp. It reports observation revisions separately from title, source metadata, series identity/metadata and coverage changes. The two monthly rows in the capacity documentation example are periods inside one response, not two source editions.

## Existing merchant and buyer path

**sf30-publication.mjs** reads the original response and descriptor afresh, derives the selected dataset and retains typed decimal strings plus all source identifiers. It uses the original dataset compiler, version store and configuration builder. It preserves original paid request approval, aggregate spending, facilitator, settlement and buyer export semantics.

Follow **SF30_PUBLICATION.md** for the complete commands and maintained native source dependencies. A source publication or retained-analysis export is useful independently of whether the actual merchant selects a paid resource route. Reopening a source, downloading a report or receiving a workspace does not create a purchase.

The source edition and selection are retained in the Econdb release manifest. A physical dataset snapshot alone cannot distinguish two empty publications; the separate publication identity and original source binding provide that distinction.

## Source layout and maintenance

| Source | Responsibility |
| --- | --- |
| maritime-analysis.mjs | Exact JSON/decimal interpretation, original request planning, period/revision analysis, CSV and report |
| maritime-native.mjs | Authorized capture, immutable original receiving/reopen, complete analysis directories |
| maritime-cli.mjs | Capture, receive, analyze and list commands |
| maritime-workbench.html | Complete offline operator UI with source import and review continuation |
| build-workbench.mjs | Refresh the embedded analysis module after an authorized source edit |
| sf30-publication.mjs | Existing native dataset/version/merchant/buyer integration |
| OPERATOR_GUIDE.md | Complete actual operator receiving and handover course |
| PERIOD_ACCEPTANCE.md | Source/business meaning and continuing delivery contract |
| sources/ | Original issuer OpenAPI and named documented examples |
| examples/ | Exact source/descriptor pairs used by the workbench and native example course |

The full in-memory analysis limit is 500,000 date-by-series cells; the bound is applied before expansion. The native receiver still retains a complete over-limit response for a partitioned receiving adaptation. Capture and local source receiving accept up to 128 MiB per response; the existing SF30 publication path has its own original 64 MiB and 250,000 selected-row limits. These are explicit receiving limits, not changes to the issuer's data population.

After changing the analysis module, run **node build-workbench.mjs** so the outgoing offline file contains that same module. Preserve original editions, operation IDs and the established customer/application state.

## Actual outgoing-product use

Before calling the application, report, dataset export or any attached package ready, open/run/render the exact outgoing version and use the important controls. Inspect actual desktop and narrow/mobile views, empty/populated/loading/error behavior where relevant, complete downloads and reopening. See every rendered page and exported result in the application the recipient will use. Open every outgoing archive and its contained attachments; read documents, operate workspaces and use exports. If audio or video is produced, listen to and watch its final export. A source review, screenshot without viewing, DOM count, HTTP success or checklist does not replace that use.

Repair unreadable tables, clipped content, missing styling or broken behavior directly while preserving original data, computations, IDs and history. Keep the design plain, restrained and industrial. Continue through the original equipped receiver when a runtime is unavailable; provide the complete exact source and opening steps and continue independent implementation.

Current execution evidence is in **EXAMPLE_RESULTS.md**. Source delivery and an observed native/rendered receiving run are distinct milestones recorded in the original case.
