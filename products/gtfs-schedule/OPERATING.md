# Operate and hand over the GTFS Schedule merchant

This guide carries a complete original feed through a selected installation,
saved source review, dataset publication, merchant operation and receiving on
another host. The native GTFS model, publisher, merchant provider, SF82 release
store and runtime installer remain the owners of their existing state.

## 1. Select a complete runtime

Build the committed gtfs-schedule recipe from an existing complete source
repository, using one immutable commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --ref FULL_SELECTED_COMMIT \
  --selection gtfs-schedule \
  --out /absolute/private/gtfs-release
~~~

Retain the original build directory and its receipt. After an interrupted
materialization or pack, use that same output with --resume. Omit --ref to use its
retained commit, or supply that exact commit; --offline uses already acquired
original Git objects:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --out /absolute/private/gtfs-release --resume --offline
~~~

The completed distribution.json identifies the archive, exact SHA-256 and source
commit. package/manifest.json maps the complete original files and source
selection. Prepare and install that exact archive:

~~~sh
starforge runtime-install prepare \
  --dir /absolute/private/gtfs-runtime \
  --archive /absolute/private/gtfs-release/ORIGINAL_ARCHIVE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

starforge runtime-install install --dir /absolute/private/gtfs-runtime
starforge runtime-install inspect --dir /absolute/private/gtfs-runtime --load --source
starforge runtime-install run --dir /absolute/private/gtfs-runtime -- source
starforge runtime-install run --dir /absolute/private/gtfs-runtime -- registrations --source gtfs
starforge runtime-install run --dir /absolute/private/gtfs-runtime -- merchant-providers inspect gtfs-workspaces
~~~

The maintained source checkout can run
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs
in place of starforge runtime-install. Use its original resume, runtime-profile
and offline-cache operations after an interrupted installation. A changed
product or source selects a new runtime directory.

Required host capabilities are Linux, Node 24, Python 3.11 or later with zoneinfo
and timezone data, and util-linux flock. SF_GTFS_PYTHON selects the actual
installed Python executable. Runtime installation supplies the original selected
schema, OpenAPI, MCP, Stellar SDK and native x402 dependencies.

The recipe declares the complete GTFS/Frictionless/publisher sources, native
Python archive implementation, browser manifests, source-owned provider and
Applications adapter, installer workers, seller release children and the buyer
receiving implementation. Source metadata and static imports are resolved by
the existing builder. The full customer feed and private workspaces are runtime
inputs.

## 2. Create or reopen the managed workspace

Initialize the existing runtime-management workspace, attach the installed GTFS
runtime and open its original browser:

~~~sh
starforge runtime-workspace init \
  --workspace /absolute/private/runtime-console \
  --runtime-home /absolute/private/runtimes

starforge runtime-workspace attach \
  --workspace /absolute/private/runtime-console \
  --runtime /absolute/private/gtfs-runtime \
  --label "Transit schedule"

starforge runtime-workspace serve \
  --workspace /absolute/private/runtime-console
~~~

In Applications select **GTFS Schedule merchant** and the attached runtime.
Choose a new private workspace directory or an existing GTFS workspace. Use the
ordinary Review, Save, Connect, Review Start and Start actions. The product's
source-owned adapter supplies these original settings:

| Setting | Use |
| --- | --- |
| Private GTFS workspace | New or saved canonical private directory |
| New workspace title | Initial title; saved work keeps its original title |
| Private complete-archive directory | Optional external destination for whole-workspace exports |
| Existing seller release store | Original SF82 destination used by release-stage |
| Original running seller URL and public resource URL | Supply both when the publisher buyer controls should address that actual service |
| Port and environment file | Original Applications host settings |

A new managed Start assigns the workspace UUID from that same retained
operation. The CLI receives --expected-workspace-id and reuses it if initial
publication was interrupted. Reopening a saved workspace checks its original
UUID before taking ownership.

The original GTFS_WORKSPACE_READY announcement contains its canonical directory,
UUID, PID and private URL. Applications verifies the live /api/gtfs/identity
response against that same identity before showing the link. The GTFS source
controls and original publisher panels share one browser and saved model.

For terminal operation, use the same installed product:

~~~sh
starforge gtfs init --workspace /absolute/private/transit --title "Transit schedule"
starforge gtfs status --workspace /absolute/private/transit
starforge gtfs serve --workspace /absolute/private/transit --port 0
~~~

Each command can be invoked through runtime-install run with the selected
runtime. One process owns a workspace at a time. Stop a separately running
Application or terminal server before invoking a one-shot command against the
same directory. MCP and its browser share one model inside their existing
process.

## 3. Retain the actual source

Record the publisher URL, original retrieval time, rights/attribution, customer
task, receiving application and selected service period. Keep the publisher's
complete ZIP. A later download is a new source edition.

Use the browser's complete ZIP upload, or inspect and import the exact file:

~~~sh
starforge gtfs inspect-feed --archive /absolute/original/feed.zip

starforge gtfs import \
  --workspace /absolute/private/transit \
  --archive /absolute/original/feed.zip \
  --sha256 ORIGINAL_ZIP_SHA256 \
  --request IMPORT_UUID \
  --revision CURRENT_REVISION \
  --title "Original publisher feed"
~~~

Use the SHA-256 returned by inspection, a new lowercase UUID and the current
root revision. Import retains the complete original ZIP and every original
member. Read its agency timezone, routes, table counts, source field names,
calendar dates and explicit publication limits.

The source row reader pages the complete original table. Convenience route
catalogs also expose returned and total counts. An unavailable or unselected
table remains inside the original retained feed. UTF-8 physical values, empty
optional cells, original stop sequences and source times remain recoverable.

The complete input ZIP can be up to 16 MiB and expand to 128 MiB. A saved
publication resource can contain at most 1,000,000 rows and 64 columns; select
up to 64 resources including derived schedules. The source compiler checks
derived resource counts before expensive expansion.

## 4. Save, compare and select editions

A saved action uses the original request envelope:

~~~json
{
  "requestId": "NEW_LOWERCASE_UUID",
  "expectedRevision": 1,
  "payload": {
    "feedId": "ORIGINAL_FEED_UUID",
    "recipe": {
      "schema": "stellar-forge.gtfs-selection.v1",
      "title": "Reviewed service week",
      "feedSha256": "ORIGINAL_ZIP_SHA256",
      "startDate": "2026-10-12",
      "endDate": "2026-10-18",
      "agencyIds": [],
      "routeIds": [],
      "tables": ["agency.txt", "routes.txt", "trips.txt", "stops.txt", "stop_times.txt"],
      "includeSchedule": true,
      "authority": {
        "sourceUrl": "https://original-publisher.example/feed.zip",
        "licenseUrl": "",
        "licenseName": "",
        "attribution": "Original publisher",
        "retrievedAt": "ORIGINAL_RETRIEVAL_TIMESTAMP"
      },
      "note": "Agreed source period and receiving task"
    }
  }
}
~~~

Replace every placeholder with the actual saved identity or source value and
set expectedRevision from current status. The displayed dates are an editable
example. Select only tables present in the inspected ZIP. Empty agency/route
arrays mean the complete derived schedule; an explicit selection filters the
derived resources while the selected original tables remain complete.

Use up to 367 inclusive dates. Calendar exceptions override weekly service.
Times above 24 hours keep their original service date. Absolute instants use
local noon in the agency timezone, converted to UTC and shifted back twelve
elapsed hours, then add the original event seconds. Exact frequency departures
are start-inclusive and end-exclusive. Other frequency rows remain original
headway windows.

~~~sh
starforge gtfs edition --workspace /absolute/private/transit \
  --input /absolute/private/edition-request.json

starforge gtfs edition-read --workspace /absolute/private/transit \
  --id SAVED_EDITION_UUID
~~~

Read the saved edition JSON SHA-256 and preview its resources. Create another
edition from the same or later retained feed when the customer needs a comparison.
The browser offers full source/derived row paging and exact before/after review.

| Operation | Payload |
| --- | --- |
| Compare | beforeId, afterId, beforeSha256, afterSha256 |
| Decision | subject:{kind:"edition" or "comparison", id, sha256}, verdict:"accept", "reject" or "defer", reviewer, note |
| Select | editionId, editionSha256 |

Run the original compare, decision and select commands with their complete
request JSON files. A decision retains the named operator's assessment.
Selection explicitly changes the source for subsequent publisher plans.
Previously saved plans retain their original source/capture and remain
inspectable after later source selection.

Use gtfs status for current paginated histories. A successful save with a lost
reply recovers by repeating the exact original UUID and payload, before current
revision checks. Reusing that UUID with different input is rejected. gtfs
operation --request ORIGINAL_UUID reads the saved record; gtfs recover
--request ORIGINAL_UUID continues its retained input. If upload stopped before
the original ZIP was completely retained, repeat the same import with those
same original bytes and UUID.

## 5. Publish the complete reviewed dataset

The original publisher operates below the GTFS source controls. Select one exact
resource, such as Derived_ScheduledTrips or Derived_ScheduledCalls, then create
an editable native plan:

~~~sh
starforge gtfs template --workspace /absolute/private/transit \
  --query Derived_ScheduledCalls \
  --out /absolute/private/schedule-plan.json
~~~

The template preserves the selected source hash, physical projection, original
row count and native extraction order. Review its query, columns and complete
output scope. Save it with input {"plan": THE_REVIEWED_PLAN_OBJECT}:

~~~sh
starforge gtfs publisher --workspace /absolute/private/transit \
  --operation plan_save --input /absolute/private/plan-save.json

starforge gtfs extract --workspace /absolute/private/transit \
  --plan SAVED_PLAN_NUMBER --plan-sha256 SAVED_PLAN_DIGEST \
  --run ORIGINAL_RUN_UUID
~~~

The original extract command waits for its native completion. Inspect that
same run with {"runId": ORIGINAL_RUN_UUID}; inspect supports the original query
options when needed. Verify the complete row count, column/physical value
mapping and candidate digest in its original response.

Save the original publication review with the actual runId, candidateDigest,
reviewer and note. For a new empty target, set initialize:true. For a refresh,
use the original expected target snapshot and revision shown by target/review.
The original publisher catalog defines those exact fields.

~~~sh
starforge gtfs publisher --workspace /absolute/private/transit \
  --operation inspect --input /absolute/private/inspect-run.json

starforge gtfs publisher --workspace /absolute/private/transit \
  --operation review --input /absolute/private/review-run.json

starforge gtfs publisher --workspace /absolute/private/transit \
  --operation publish --input /absolute/private/publish-run.json
~~~

publish-run.json contains the exact runId and reviewId returned by the native
review. Publication retains its original dataset snapshot/version and complete
candidate. The browser uses those same original operations.

Schedule/save/enable/pause remain the original publisher scheduler. A scheduled
run uses its selected native plan and original retained capture. To refresh a
feed, retain the actual new ZIP, save/select its new edition and explicitly save
the corresponding new plan before updating the schedule. One-shot reads leave
the timer closed; serve and MCP resume enabled schedules while owning the
workspace. schedule-run and schedule-continue wait for their actual original
operation before the terminal exits.

## 6. Prepare, select and operate the merchant

After the run is published, release-prepare takes a saved request envelope with
payload {runId,payment,origin,path?}. payment is the original dataset seller's
complete explicit native payment configuration. Use the reviewed network,
asset, recipient and atomic amount; origin and path identify the actual public
resource.

~~~sh
starforge gtfs release-prepare --workspace /absolute/private/transit \
  --input /absolute/private/release-prepare.json
~~~

The retained package includes the original source/capture, plan, candidate,
dataset CSV/configuration, seller terms and binding. Save the returned release
ID and exact release SHA-256. Configure the existing release store in the GTFS
host settings, or pass --release-store to the same original terminal invocation.

release-stage uses payload {releaseId,releaseSha256,id,label?,runtime?}.
runtime accepts the original port, facilitator and allowLocalFacilitator fields.

~~~sh
starforge gtfs release-stage --workspace /absolute/private/transit \
  --release-store /absolute/private/transit-releases \
  --input /absolute/private/release-stage.json

starforge releases inspect --store /absolute/private/transit-releases --id RELEASE_NAME
starforge releases diff --store /absolute/private/transit-releases --to RELEASE_NAME
starforge releases activate --store /absolute/private/transit-releases \
  --id RELEASE_NAME --expect CURRENT_GENERATION --reason "Reviewed service edition"
starforge releases run --store /absolute/private/transit-releases --expect SELECTED_GENERATION
~~~

Activation selects the next run. A running seller retains its selected release
until its original owner stops it. Use the existing release console or CLI for
Stop, next-run selection and rollback; original customer output retains its
published source and terms.

## 7. Operate the same workspace through MCP

Create a private original GTFS connection using the saved workspace UUID:

~~~json
{
  "schema": "stellar-forge.gtfs-workspace-connection.v1",
  "workspaces": {
    "transit": {
      "directory": "/absolute/private/transit",
      "workspaceId": "ORIGINAL_WORKSPACE_UUID",
      "label": "Transit schedule",
      "inputs": {
        "publisher-feed": {
          "file": "/absolute/original/feed.zip",
          "label": "Original publisher ZIP"
        }
      },
      "exportsDirectory": "/absolute/private/transit-archives",
      "releaseStore": "/absolute/private/transit-releases"
    }
  }
}
~~~

The host retains actual connection paths and its configured access environment.
Source inputs are named by aliases; tools receive those original aliases and
explicit hashes, rather than arbitrary new host filenames.

~~~sh
starforge gtfs init-merchant \
  --directory /absolute/private/transit-operator \
  --connection /absolute/private/gtfs-connection.json \
  --release-store /absolute/private/transit-releases

starforge merchant-mcp serve \
  --config /absolute/private/transit-operator/merchant-mcp.json \
  --port 3211 --token-env EXISTING_MCP_ACCESS_TOKEN_ENV
~~~

Use the host's existing environment variable named by --token-env. The original
merchant-mcp-stdio and merchant-mcp-client-config commands support local agent
integration with that same configuration.

merchant_gtfs_workspaces lists configured aliases without opening their
workspaces. merchant_gtfs_open takes ownership of the original model, publisher,
scheduler and browser. Its returned instanceId identifies the exact open owner.
The status, inputs, import, edition, comparison, decision, selection and recovery
tools operate the same saved records described above.

merchant_gtfs_publisher_* borrows that open publisher and scheduler. Its plan,
run, candidate, review and target identities remain the native publisher's.
merchant_gtfs_close with the exact instanceId drains its original model and file
reads before releasing the workspace.

The catalog exposes the complete original request schemas through the installed
provider. Inspect gtfs-workspaces to obtain the current tools and input fields.
The five GTFS package exports support direct source, saved model, browser,
merchant and tool-catalog integration under
@tokenjunkielabs/starforge-merchant/seller/gtfs and its original subpaths.

## 8. Receive the complete useful customer output

For a paid dataset, use the existing buyer configuration or saved buyer
workspace that already selects the actual seller URL, original query, payment
authority and reservation owner. Determine the task's complete page/row scope
and aggregate atomic cap from the reviewed offer; retain the expected original
dataset snapshot.

~~~sh
starforge buyer-dataset init \
  --session /absolute/private/transit-purchase \
  --workspace /absolute/private/existing-buyer \
  --max-pages REVIEWED_PAGE_CAP \
  --max-total-atomic REVIEWED_TOTAL_ATOMIC_CAP \
  --snapshot ORIGINAL_DATASET_SNAPSHOT

starforge buyer-dataset run --session /absolute/private/transit-purchase \
  --workspace /absolute/private/existing-buyer

starforge buyer-dataset status --session /absolute/private/transit-purchase
starforge buyer-dataset deliver --session /absolute/private/transit-purchase \
  --out /absolute/private/transit-customer-result
~~~

Each new page uses the original quote review and durable reservation. Complete
pages are reused on continuation. Retain unresolved original attempts for the
native accounting/recovery operation; continue that same saved session after
the original outcome is reconciled. The complete dataset delivery carries its
manifest and all selected page/data bytes into the customer's application.
Count the original approved purchase identities once while measuring the
customer's full useful task and its total cost.

For retained merchant artifacts, merchant_gtfs_manifest returns paginated file
records. Save every record, the original manifest SHA-256, artifact kind and ID.
merchant_gtfs_file_read binds the relative file name, expected SHA-256, original
readId and offset. Continue the same readId and nextOffset; after an expired
reader, reopen the same file/hash at the retained offset. Chunks are at most
64 KiB and full immutable files may be up to 8 GiB.

Write every returned byte before advancing the local checkpoint. Verify full
byte count and SHA-256 before publishing the received file to its final private
destination. Preserve the complete artifact inventory and its original source
identity. Feed archives, source editions, comparisons, decisions, release
packages and whole-workspace archives remain separate declared artifact kinds.

## 9. Export and receive the whole operating workspace

Stop a separate owner before one-shot export, or use the open browser/MCP's
original export action. Read the current root revision and assign one export
request UUID:

~~~sh
starforge gtfs export --workspace /absolute/private/transit \
  --request ORIGINAL_EXPORT_UUID --revision CURRENT_REVISION
~~~

Use the actual archive path and SHA-256 returned by that operation. The default
external export directory is adjacent to the workspace; a configured
exportsDirectory retains the selected destination.

~~~sh
starforge gtfs inspect-archive \
  --archive /absolute/private/transit.exports/ORIGINAL_EXPORT_UUID.tar.gz \
  --sha256 ORIGINAL_ARCHIVE_SHA256

starforge gtfs receive \
  --archive /absolute/private/transit.exports/ORIGINAL_EXPORT_UUID.tar.gz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --output /absolute/private/transit-received \
  --workspace-id ORIGINAL_WORKSPACE_UUID

starforge gtfs serve \
  --workspace /absolute/private/transit-received \
  --expected-workspace-id ORIGINAL_WORKSPACE_UUID --port 0
~~~

Export keeps its request journal outside the archived workspace. It closes the
idle native scheduler and takes the original dataset writer.lease exclusion
before reading its complete state. A live writer or unquiescent SQLite journal
remains with that original owner for drain and continuation.

The archive contains all ordinary retained source ZIPs, source/capture files,
editions, plans, runs, review/decision records, release packages, SQLite histories,
schedules and dataset versions. Its manifest binds complete bytes and empty
directories. Runtime listener/lock exclusions are recorded explicitly. The
compressed ceiling is 8 GiB.

Receive verifies the whole manifest and every member in private staging, then
atomically creates a new destination. It retains the original root UUID,
revision and saved histories. Only the publisher's runtime sourceFile and
targetDirectory paths relocate to that receiving root; the exact original
settings and receiving receipt remain under .gtfs-receive/ARCHIVE_SHA/.

A same-archive retry at the same destination returns its saved receipt and the
destination's current revision/hash. Later operator decisions remain in place.
A new valid workspace can also export before its first source selection.

A live external SF82 release store and the source runtime retain their separate
owners. Keep the original runtime archive/profile and use the release store's
native retention procedure for its active service. GTFS export contains its
retained prepared release packages; it does not traverse arbitrary external
host directories.

## 10. Complete the receiving handover and continue

Give the receiving engineer the original selected runtime archive/profile,
complete workspace archive and hash, actual source-rights context, customer
input/output contract, configured host paths and the original operation records.
Keep secret values in the receiving host's existing authorized environment.

Reopen the received source and its original publisher. Verify the selected
edition, complete published resource and current dataset snapshot. Record a
new decision or save the agreed next source selection, then export the received
workspace. Repeating the earlier receive must recover its original receipt
while preserving that later work.

For a service change, use a new source edition and native plan/review rather
than changing retained bytes. For a price change, retain the explicit new
payment terms in a new seller release. Earlier customer files remain tied to
their original source, request and terms.

The original full NWConnector receiving operation is
SCF-GTFS-SCHEDULE-MERCHANT-6200-20261012. Its source-native driver and original
input selection are published under
[operations/scf-gtfs-schedule-merchant-20261012](https://github.com/woahwhattheheck/public-commons-sprint-2026/tree/047b23972cafaf801772d8fd63be8bca57203095/operations/scf-gtfs-schedule-merchant-20261012).
Its sole existing equipped continuation retains that same operation and request
identities. The selected standalone package uses its own actual immutable
manifest when the installed product receives that completed source workflow.

The original [GTFS guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/gtfs/README.md),
[publisher tool schema](../../stellar-forge/mcp-merchant-operator/catalog/publisher.mjs),
[merchant provider contract](../../stellar-forge/mcp-merchant-operator/MERCHANT_PROVIDERS.md),
[runtime installation](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
and [source selections](../../stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md)
travel with this selected product.
