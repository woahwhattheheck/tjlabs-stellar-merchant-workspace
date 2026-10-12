# Google catalog delivery from an OpenLineage workspace

This companion carries a reviewed source edition into Google's Data Lineage API and retains the complete customer handover. It uses the existing OpenLineage application for source intake, saved editions, original event interpretation and portable workspace receiving. Its separate delivery record joins the approved Google project and location, original event bodies, stable request identifiers, API resource names, table-link receiving and editable application.

The installed product exposes `starforge openlineage-google`. From a source checkout or received application, run `node dataplex-cli.mjs` with the same arguments.

## Prepare the customer operation

Identify the customer-controlled project and region, the producer jobs being commissioned, their exact input/output assets, the Google service identity, and the receiving engineer. The production workshare records the source authorization, instrumentation, review points, active delivery effort and release responsibility.

Use the existing producer interface to receive the original events. Save the selected source edition and export the full workspace:

```sh
starforge openlineage export --workspace /absolute/customer/lineage \
  --out /absolute/customer/openlineage-workspace.json

starforge openlineage-google prepare \
  --directory /absolute/customer/google-delivery \
  --input /absolute/customer/openlineage-workspace.json \
  --project customer-project --location us-central1 \
  --edition ORIGINAL_SAVED_EDITION_ID \
  --title "Customer pipeline lineage"

starforge openlineage-google report \
  --directory /absolute/customer/google-delivery \
  --out /absolute/customer/google-review.html
```

The preparation returns the complete plan and its SHA-256. The report presents the selected jobs and runs, expected Google asset identities, source corrections, approval and receiving state in a plain operator table. Repeating the identical preparation in the original directory reuses its saved operation. The input package remains byte-for-byte intact.

### Preserve the real producer contract

Google's documented importer accepts OpenLineage major version 1 RunEvents. This companion uses the existing application's pinned 1-0-1 and 1-0-5 interpreters. A source declaring core 2, a JobEvent, a DatasetEvent or an unsupported schema remains in the complete source package with a specific diagnostic. Configure the original producer to emit its genuine supported contract before commissioning that stream.

The request body is the original event's JSON value with canonical key ordering. Its original wire bytes, compression, source positions, every facet and the full source application remain in the workspace package. The companion retains the original schema URL, run UUID, event time, event type, job and dataset names.

Each message is limited to 5,000,000 bytes in this companion. Input/output fully qualified names are limited to 4,000 characters. The plan checks the documented aggregate limit of 1,000 table links. Google groups the returned links into named lineage events, with at most 100 links in each; receiving reads all the names returned by the API.

### Review exact catalog identities

The plan shows each original dataset namespace/name alongside its expected Google fully qualified name. It includes documented BigQuery, Cloud Storage, S3, Kafka, MySQL, PostgreSQL, file and Pub/Sub forms. Preserve the customer's existing identities when configuring native producer integrations.

For another documented system or an existing customer convention, pass an explicit expected-FQN file. This records the receiving assertion; it does not rewrite the producer payload.

```json
[
  {
    "namespace": "snowflake://organization-account",
    "name": "WAREHOUSE.PUBLIC.ORDERS",
    "fullyQualifiedName": "snowflake:organization-account.WAREHOUSE.PUBLIC.ORDERS"
  }
]
```

Add `--expected-fqns /absolute/customer/expected-fqns.json` to preparation. The receiving operation compares actual Google links with these exact expected names. A mismatch remains attached to the original delivery with both actual and expected endpoints, ready for the producer/catalog correction.

Google's custom-event graph is table-level. Original custom column-lineage facets and detailed metadata remain available in the full customer workspace. The receiving record reports the table edges actually returned by Google.

## Approve the saved plan

Review the destination, complete source edition, jobs/runs, original event payloads and expected catalog assets. Approve that exact plan SHA-256:

```sh
starforge openlineage-google approve \
  --directory /absolute/customer/google-delivery \
  --plan-sha256 EXACT_RETURNED_PLAN_SHA256 \
  --operator "Receiving engineer"
```

The default approves every selected event and requires each one to be eligible. To commission an explicitly selected subset, supply `--events /absolute/customer/selected-event-ids.json`, containing an array of the original event IDs. The complete original source still travels with the handover. Source or mapping changes receive a new saved source/plan review; an already dispatched plan keeps its original approval and request identities.

## Use the customer's Google identity

The Google resource project and the reviewed client/quota project must have the Data Lineage API enabled. Preparation defaults the quota project to the selected resource project; use `--quota-project PROJECT` for a different customer-owned client project. The plan and HTML review show both. Every POST and GET supplies this approved quota project in `X-Goog-User-Project`.

Sending requires `datalineage.locations.processOpenLineageMessage` on the selected project/location and the cloud-platform OAuth scope. Receiving requires `datalineage.events.get`. The identity also needs `serviceusage.services.use` on the quota project, supplied by Service Usage Consumer or an equivalent role. A raw ADC access token does not itself convey the ADC file's quota-project choice into a REST request.

The CLI uses the current host's Google Application Default Credentials through:

```sh
gcloud auth application-default print-access-token
```

Select another installed gcloud executable with `--gcloud /absolute/gcloud`. A short-lived `GOOGLE_OAUTH_ACCESS_TOKEN` environment value can be supplied by the host's existing credential owner. The library accepts an asynchronous `accessToken` callback for an existing Google authentication client. Tokens are obtained immediately before dispatch and stay in process memory. Source exports and delivery journals contain no credential value or authorization header.

The companion uses Google's fixed HTTPS API origin. It does not accept a caller-selected remote HTTP origin or redirect credentials to another host.

## Publish and recover

```sh
starforge openlineage-google publish \
  --directory /absolute/customer/google-delivery

starforge openlineage-google status \
  --directory /absolute/customer/google-delivery
```

Each event has a deterministic UUIDv8 `requestId` derived from its original payload SHA-256 and selected Google project/location. That identifier is saved before the first HTTP call and remains the same across interrupted responses, retries, repeated source editions and receiving on another host. A changed event or destination gets a different identity. Google's REST contract makes the request idempotent when this parameter is supplied.

The journal records dispatch before sending. It retains the exact process, run and lineage-event resource names returned by Google. A completed event is reused on the next invocation. A retryable response records its status and Retry-After time; later work continues through the original directory when the provider permits it. A rejected request retains its full API response for correction. A lost response remains unresolved against the original request UUID; repeating the original publish uses that same idempotent request.

Publishing returns exit code 0 when every approved event is confirmed and 2 while work remains. Authentication or input failure returns 1. A per-request timeout can be selected from 1,000 to 60,000 milliseconds.

An exclusive writer protects the delivery journal. Its saved identity records both the local PID and the mounted procfs PID and PID namespace. An interrupted writer can be recovered in its original host/namespace by inspecting and supplying the exact saved lock ID after that process has exited:

```sh
starforge openlineage-google recover-lock \
  --directory /absolute/customer/google-delivery --id ORIGINAL_LOCK_ID
```

Whole-package receiving creates a new local operation directory without carrying the old host's writer lock.

## Receive the actual Google table graph

```sh
starforge openlineage-google reconcile \
  --directory /absolute/customer/google-delivery

starforge openlineage-google report \
  --directory /absolute/customer/google-delivery \
  --out /absolute/customer/google-received.html
```

The operation reads every lineage-event resource returned by each confirmed import. It retains full responses, compares the returned source/target FQNs with the plan and identifies missing or unexpected table links. Empty repeated API fields are read as empty arrays. Field-specific edges keep their complete source/target field paths and do not satisfy a planned table edge. Successfully received events are reused. Every previous receiving attempt remains in the journal when an incomplete event is read again, including its successful partial reads and provider responses.

This API receiving accompanies the customer's own Google console review: locate both selected jobs and the intended input/output table paths, confirm the actual project/location and ownership, and record the receiving engineer's acceptance in the existing customer workorder.

For a two-job commissioning, acceptance includes actual START/terminal emissions from both selected native producers, correct job/run/parent relationships in the original event archive, correct Google table paths, a controlled interruption with the same request identifier, review of a changed source edition, and a second engineer reopening the complete installation.

Google retains lineage for 30 days and stores selected original facets. Export the complete workspace and receiving package as part of the customer handover so the original source, metadata and remote response history remain available beyond that service retention period.

## Complete editable export and independent reopening

```sh
starforge openlineage-google export \
  --directory /absolute/customer/google-delivery \
  --out /absolute/customer/google-lineage-delivery.json

starforge openlineage-google verify \
  --input /absolute/customer/google-lineage-delivery.json

starforge openlineage-google receive \
  --input /absolute/customer/google-lineage-delivery.json \
  --out /absolute/receiving/google-lineage

node /absolute/receiving/google-lineage/application/dataplex-cli.mjs \
  status --directory /absolute/receiving/google-lineage

node /absolute/receiving/google-lineage/workspace/application/cli.mjs \
  serve --workspace /absolute/receiving/google-lineage/workspace --port 0
```

The complete delivery includes:

- The unchanged original workspace package with all source/result objects, saved editions, review history and original application.
- The Google plan, explicit approval, every retained dispatch outcome and complete API receiving responses.
- The complete current OpenLineage runtime and four Google companion source files, each with its byte length and SHA-256.
- The original operation and workspace identities, stable request UUIDs, expected assets and actual remote resource names.

Receiving verifies all original object hashes using the existing workspace receiver, writes the complete companion application, and reopens the original workspace separately. The existing portable workspace format and its historical application versions stay under their original owner. This companion's complete package carries the additional Google operating state and source alongside them.

Select current Google credentials on the receiving host to continue an unfinished send. A completed confirmed/received event stays attached to its original remote names. Customer source data and private operating packages are delivered through the original customer channel; reusable application source remains in the maintained product.

## Source and API basis

Reviewed October 12, 2026:

- [Google: integrate with OpenLineage](https://docs.cloud.google.com/knowledge-catalog/docs/open-lineage) — supported event contract, table-level projection, message/FQN/link limits and retained facets.
- [Google: processOpenLineageRunEvent](https://docs.cloud.google.com/knowledge-catalog/docs/reference/data-lineage/rest/v1/projects.locations/processOpenLineageRunEvent) — exact REST body, parent, idempotent requestId, returned resource names and sender permission.
- [Google: OpenLineage mapping](https://docs.cloud.google.com/knowledge-catalog/docs/openlineage-mapping) — job/run identities and dataset naming.
- [Original producer intake and native receiving](PRODUCERS.md).
- [Original source and event contract](SOURCE_CONTRACT.md).

Additional Google REST operating references:

- [Client project and lineage ingestion configuration](https://docs.cloud.google.com/knowledge-catalog/docs/configure-lineage-ingestion)
- [Quota-project selection](https://docs.cloud.google.com/docs/quotas/set-quota-project)
- [LineageEvent and EntityReference fields](https://docs.cloud.google.com/knowledge-catalog/docs/reference/data-lineage/rest/v1/projects.locations.processes.runs.lineageEvents)
- [Named lineage-event receiving permission](https://docs.cloud.google.com/knowledge-catalog/docs/reference/data-lineage/rest/v1/projects.locations.processes.runs.lineageEvents/get)
- [Lineage retention](https://docs.cloud.google.com/knowledge-catalog/docs/about-data-lineage)

## Complete development receiving

The maintained `tools/openlineage-google-receiving.mjs` programme uses the original completed OpenLineage archive. Unpack that archive into `original/` beneath a new owned receiving root, then select this complete application directory:

```sh
node tools/openlineage-google-receiving.mjs \
  /absolute/google-receiving \
  /absolute/checkout/stellar/scf-starforge-20261009/sf30-seller-sdk/openlineage-workspace
```

The programme reopens the original version 1 baseline and both version 2 operating packages, prepares their actual saved source editions, and writes complete Google delivery packages and HTML reports. Its injected REST transport exercises a lost-response retry, quota-project headers, omitted repeated fields, table/column receiving and preservation of earlier responses. It then independently reopens each complete package with the exact carried application. The original standalone facet objects also pass through source review and complete export. `native-result.json` records actual source identities, application counts, receiving states and package hashes. Keep its whole output with the original development operation.
