# Refresh a Loaded Bikes source edition

The existing Loaded Bikes workbench uses an exact retained catalogue capture. This command refreshes an explicitly selected family from the public WooCommerce Store API and saves every original response, every declared variant and a new self-contained capture. It uses Node 24 built-in HTTP and filesystem facilities; it does not run a migration, connect to an ERP, change the seller's site or regenerate catalogue interpretations.

## Run

Use the same complete adaptation and original workbench dependencies:

~~~sh
node products/migration-acceptance/adaptations/loaded-bikes/refresh-catalogue.mjs \
  --output /chosen/new-catalogue-edition \
  --parent-id 192 \
  --parent-id 436 \
  --slug l-track-flush-rail \
  --slug l-track-surface-mounted-rail
~~~

The IDs and slugs above are the published mount, spare adaptor, flush-rail and surface-rail family selection. They are source identities, not ERP identifiers. Repeat --parent-id or --slug for the actual family under review. A selected ID must identify a parent; a slug query may also return a child sharing that slug, but that child must belong to a selected parent's declared variation set.

The output directory must be new. Never replace a prior capture in place.

To keep earlier interpretation alongside a new source edition:

~~~sh
node products/migration-acceptance/adaptations/loaded-bikes/refresh-catalogue.mjs \
  --output /chosen/new-catalogue-edition \
  --parent-id 192 --parent-id 436 \
  --prior-capture /chosen/original/catalogue-capture.json \
  --prior-claims /chosen/original/source-claims.json
~~~

Prior capture and claim bytes are validated and copied unchanged under prior-edition/. They remain explicitly bound to that earlier source. The command does not relabel old descriptions, component claims or review findings as current. Even unchanged response identities are reported only as a comparison fact; a current semantic companion still requires its own source review.

## Exact output

- catalogue-capture.json: the same tjlabs.loaded-bikes.catalogue-capture.v1 used by the original adapter. It includes original URLs, retrieval times, requested and resolved parent identities, complete response bytes as Base64, SHA-256 identities, the declared child population and acquisition attempts.
- originals/: every successful original UTF-8 JSON response, without reserialization or HTML editing.
- REFRESH.json: complete capture and file identities, observed populations, selected-table row counts and explicit prior-claim status.
- prior-edition/: unchanged earlier capture and semantic companion when supplied.

The complete successful capture can be imported into the maintained source/mapping/review flow. Its independent expected-table projection validates original field types and every parent/variant binding before native selection. A new current capture does not imply a native load or accepted cutover.

## Complete source acquisition

Requests are serial and bounded. Parent ID selections use batches of at most 100; slug selections use batches of at most 20. Every original declared variation is then requested as a complete variation record. Full pagination is read using the original X-WP-Total and X-WP-TotalPages headers; without those headers, a full page requires the next page. Page totals must remain consistent. Empty results and missing requested parents are not accepted as a complete family.

The command rejects conflicting complete snapshots of one product, missing declared child records, a child attached to another parent, unexpected parents or unrelated variations. It checks all exact source fields through the existing independent catalogue projector. Retail availability stays separate from stock on hand, and published kits remain source claims rather than an approved production BOM.

The captured HTTP responses are separate requests, not an atomic database transaction. Conflicting duplicate records and inconsistent pagination are detected and rejected; the tool does not claim that a publisher could not change an otherwise non-overlapping record during acquisition. Retrieval times and original bytes make that boundary visible.

Default limits are 200 selected parent IDs/slugs, 10,000 declared variations, 100 pages per query, 8 MiB per response and 64 MiB overall. The public origin is limited to the Loaded Bikes HTTPS site. Redirects are rejected rather than followed to a different destination.

## Provider recovery

Only read requests are made. HTTP 429/502/503/504 and transport failures receive at most two retries by default. Retry-After seconds or an HTTP date are honored. If the requested interval is longer than the 30-second retry budget, the command stops and reports the required interval; it never retries early. Each request has a 30-second timeout that remains active through complete response-body reading.

An interrupted or failed acquisition retains already received originals in a distinct .partial-* directory with FAILED_REFRESH.json and complete:false. It does not publish catalogue-capture.json or claim current acceptance. Preserve that incomplete source evidence, follow the actual provider interval, and use a new output directory for the next acquisition. Previously completed native jobs and source editions remain untouched.

The complete project should retain the refreshed capture and its review history, then run the existing native pipeline and acceptance course. The receiving owner must open, use and inspect the outgoing application and actual downloaded artifacts at desktop and narrow width. Source acquisition and pure compilation do not establish native or human acceptance.
