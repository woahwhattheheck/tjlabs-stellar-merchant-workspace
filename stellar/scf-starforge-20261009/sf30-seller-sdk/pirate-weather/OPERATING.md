# Operate and receive the Pirate Weather project

This guide follows one real customer project from its original response to a reviewed report, native dataset release, retained Buyer outcome and a complete received copy. It also covers an empty source-only project. An empty project establishes application and receiving behavior; it does not establish forecast, provider or customer acceptance.

Use the actual installed merchant package and its original dependency installation. Keep the private workspace, original request files and provider response files with their existing owner. Every identifier and digest below comes from the current application or the selected original file.

## 1. Select the complete product source and installation

The maintained distribution recipe is pirate-weather. From an actual canonical repository checkout, build the selected commit with the original builder:

~~~sh
PIRATE_REPOSITORY=/absolute/canonical/merchant-checkout
PIRATE_BUILD=/absolute/private/pirate-source-build
PIRATE_COMMIT=ACTUAL_SELECTED_COMMIT
node "$PIRATE_REPOSITORY/stellar/scf-starforge-20261009/distribution/build.mjs" \
  --repo "$PIRATE_REPOSITORY" --ref "$PIRATE_COMMIT" \
  --selection pirate-weather --out "$PIRATE_BUILD"
~~~

Use the original builder's returned archive path and SHA256. The source manifest carries the selected contribution, source paths and exact bytes. Do not substitute an archive with the same package name.

Prepare and install that source through the maintained runtime installation command. Its selection retains the original native, schema, OpenAPI and MCP dependencies. Use exact additional feature/pin settings from the selected original host when one already exists.

~~~sh
PIRATE_RUNTIME_CLI="$PIRATE_REPOSITORY/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs"
PIRATE_INSTALL=/absolute/private/pirate-installation
PIRATE_SOURCE_ARCHIVE=/absolute/original/build-output.tgz
PIRATE_SOURCE_SHA=ACTUAL_ARCHIVE_SHA256

node "$PIRATE_RUNTIME_CLI" prepare --dir "$PIRATE_INSTALL" \
  --archive "$PIRATE_SOURCE_ARCHIVE" --sha256 "$PIRATE_SOURCE_SHA" \
  --native --feature schema --feature openapi --feature mcp --operator
node "$PIRATE_RUNTIME_CLI" install --dir "$PIRATE_INSTALL"
node "$PIRATE_RUNTIME_CLI" inspect --dir "$PIRATE_INSTALL" --load --source
~~~

The first command prepares source and a dependency profile. The second uses the original installer; it may need its selected dependency registry/cache and declared native build tools. An existing complete graph and its original package-lock.json can use the maintained install --adopt-existing path. That path checks the full retained graph under the installation lock and invokes no npm process. Offline installation uses the existing --offline, --cache and --node-headers controls.

Keep the returned installation identity, source commit, profile ID, original lock SHA256 and readiness result. An installed package is at INSTALL/package; original repository paths are below INSTALL/package/source; dependencies and their lock are siblings of package at the installation root.

## 2. Initialize once and open the same project

~~~sh
PIRATE_WORKSPACE=/absolute/private/customer-forecast
PIRATE_PACKAGE="$PIRATE_INSTALL/package"
PIRATE_CODE="$PIRATE_PACKAGE/source/stellar/scf-starforge-20261009/sf30-seller-sdk/pirate-weather"
PIRATE_CLI="$PIRATE_CODE/cli.mjs"
PIRATE_CONNECTION="$PIRATE_WORKSPACE/connection.json"

node "$PIRATE_CLI" init --workspace "$PIRATE_WORKSPACE" \
  --name "Pirate Weather" --api-key-env PIRATE_WEATHER_API_KEY
node "$PIRATE_CLI" serve --workspace "$PIRATE_WORKSPACE" \
  --application-source "$PIRATE_PACKAGE"
~~~

Initialization creates an empty workspace with its own ID. Retain it; do not repeat initialization as recovery. The API-key setting is the name of an environment variable. The value remains in the approved host environment and is needed only for an explicit provider fetch.

Serve holds the original workspace lease until it closes. Use its single compact startup record and exact private browser URL. Applications can instead own this lifecycle through the registered Pirate Weather forecast reports entry. Choose one owner. Closing an MCP client or browser tab does not stop that original server.

If this project will receive original Buyer outcomes, start its original host with --inbox pointing to that specific existing Inbox. This is a source selection. It does not purchase, send a payment or operate another buyer.

## 3. Save the actual customer contract

The browser Contract tab accepts the actual contract ID, customer, purpose, output destination, unit system, one to three named locations and two daily review slots in an IANA time zone. The initial save uses previousContractSha256:null. A revision carries the previous displayed contract digest and the same contract ID.

The contract fields are:

| Field | Required value |
| --- | --- |
| id | Stable UUID for this actual contract |
| title, customer, purpose, destination | Actual agreed text |
| units | us, si, ca or uk |
| horizonHours | 48 |
| locations | One to three objects containing id, name, latitude and longitude |
| schedule | timeZone plus two distinct HH:MM slots |

Location IDs are stable lower-case names. Coordinates are finite JSON numbers in the documented latitude/longitude ranges. Preserve the actual submitted request coordinates separately from the provider's returned coordinates.

The daily slots describe the operator's agreed cadence. They do not enable an unattended background request or outgoing report message.

### Common saved-request pattern

Every write uses a request file containing operationId, expectedRevision, action and payload. Save that exact file before invoking the CLI. The browser does this in its request store before POST. With the typed client, the following preparation reads the current revision and writes one new request file exclusively; it invokes no action:

~~~sh
PIRATE_ACTION=contract.save
PIRATE_PAYLOAD=/absolute/private/actual-contract-payload.json
PIRATE_REQUEST=/absolute/private/requests/contract-save.json

node --input-type=module - "$PIRATE_CODE/client.mjs" "$PIRATE_CONNECTION" \
  "$PIRATE_ACTION" "$PIRATE_PAYLOAD" "$PIRATE_REQUEST" <<'JS'
import {readFile,open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
const [modulePath,connectionFile,action,payloadFile,requestFile]=process.argv.slice(2);
const {connectPirateWeather}=await import(pathToFileURL(modulePath).href);
const client=await connectPirateWeather({connectionFile});
try {
  const state=await client.state();
  const request={operationId:randomUUID(),expectedRevision:state.revision,action,
    payload:JSON.parse(await readFile(payloadFile,'utf8'))};
  const output=await open(requestFile,'wx',0o600);
  try {await output.writeFile(JSON.stringify(request,null,2)+'\n');await output.sync();}
  finally {await output.close();}
  const parent=await open(dirname(requestFile),'r');
  try {await parent.sync();} finally {await parent.close();}
  console.log(JSON.stringify({requestFile,operationId:request.operationId,expectedRevision:request.expectedRevision}));
} finally {await client.close();}
JS

node "$PIRATE_CLI" act --connection "$PIRATE_CONNECTION" --request "$PIRATE_REQUEST"
~~~

Create the private requests directory beforehand. Each distinct intended action has a distinct request filename and UUID. On a lost reply, use the saved UUID. Do not overwrite the file or choose a replacement UUID to discover the result.

## 4. Receive the actual provider source

The Sources tab supports both an explicit forecast request and an original saved response. One provider request covers one selected contract location.

### Explicit provider request

Use read method request-preview with the selected contractSha256 and locationId. Inspect its exact request and requestSha256. The capture.fetch payload is contractSha256, locationId, expectedRequestSha256, actor and note.

The original request is recorded before dispatch. The handler makes at most one provider invocation for that request. The key value is used only in the actual authorized request and is excluded from saved URLs, operation metadata and exported projects.

The complete HTTP status, observed headers, response time and retained body/prefix determine the outcome. A non-200 response or partial body stays visible as an exception and is not promoted into a complete forecast.

### Import an original file

Select the actual UTF-8 JSON response and a metadata file containing:

| Field | Source |
| --- | --- |
| contractSha256, locationId | Current reviewed contract and its selected location |
| expectedBodySha256 | SHA256 of the exact original file |
| filename | Original filename |
| actor, note | Operator and source-custody explanation |
| startedAt, observedAt | Actual original UTC timestamps with explicit zone |
| status | Actual returned HTTP status |
| headers | Original ordered array of header-name/header-value pairs |
| bodyComplete | Whether the whole original response body was retained |

Do not use the current time as an invented original observation, infer HTTP200 from JSON content, or manufacture missing quota headers. The source preview and import preserve the metadata the operator supplied as an imported original source.

~~~sh
node "$PIRATE_CLI" source-preview --connection "$PIRATE_CONNECTION" \
  --input /absolute/private/original-response-metadata.json \
  --file /absolute/private/original-response.json

node "$PIRATE_CLI" source-import --connection "$PIRATE_CONNECTION" \
  --request /absolute/private/requests/import-original-response.json \
  --file /absolute/private/original-response.json
~~~

The second file is the saved common request with action capture.import and the same metadata as its payload. The CLI checks the exact file SHA256 and adds its body bytes. A reconcile request uses action capture.reconcile and also names originalOperationId from the interrupted fetch.

The import retains the exact body even when it cannot become a report source. Original status, incomplete body, malformed JSON, unit mismatch, missing hourly data and other source problems remain in the capture record. Reimporting the same response under the same contract reuses its existing capture; using it under a revised contract makes a separate contract-bound capture while reusing the immutable body object.

## 5. Handle quota and interrupted requests

The provider limit view retains the original status, all relevant header values, observation and derived retry deadline. A known future deadline must elapse before another explicit fetch can be accepted.

An undated hold needs positive original evidence. Import a later complete HTTP200 original response with positive remaining quota. Read provider.recovery-preview for its capture ID. If canRelease is true, submit provider.reconcile with the exact hold digest, capture ID, named actor and note shown in that preview. The original limited source and operation stay in history. No limited or unknown invocation is replayed.

If the provider request was recorded as invoked but its reply was lost, inspect its original UUID. Resume cannot blindly send again. Supply the authentic retained response through capture.reconcile, or leave the original result unresolved. Local review, source viewing and other independent project work remain available.

After a storage error, the workspace can require a clean reopen. Stop through its original owner, restore actual writable capacity, reopen that same directory and inspect the saved UUID before resuming.

## 6. Prepare, compare and approve the report

Choose one usable capture per contract location, an explicit UTC hour for windowStart and the report title. windowStart is a safe integer Unix timestamp aligned to an hour. The report covers [start, start + 48 hours). Set previousReportId to the actual prior edition when comparing a successor, or null for the first report.

The report.prepare payload is contractSha256, captureIds, title, windowStart, previousReportId and actor. Its result includes the report ID, original source digests and coverage. Read report with id, offset and limit up to 500. Follow nextOffset until null; the browser does this for the full view.

Coverage preserves missing hours/fields, duplicate times and non-hourly source rows. Each cell retains its original JSON number token or source string, unit system, capture ID and source row ordinal. Forecast values are not independently observed weather. No interpolation, unit conversion or severity inference is performed.

Use compare with beforeId, afterId, offset and limit to inspect retained changes. Comparison is between the selected source editions; it does not overwrite either report.

Make a named report.review decision with reportId, actor, disposition APPROVED or CHANGES_REQUIRED, and note. Every downstream export or dataset preparation selects the exact approved review ID. A later report or changed review requires its own explicit choice.

Use report.export with reportId and reviewId. Its returned file descriptors are the actual CSV, JSON and HTML bytes. Download through the original instance using the descriptor ID and SHA256:

~~~sh
node "$PIRATE_CLI" download --connection "$PIRATE_CONNECTION" \
  --id ACTUAL_FILE_ID --sha256 ACTUAL_FILE_SHA256 \
  --output /absolute/private/delivery/customer-forecast.csv
~~~

Use the filename appropriate to the selected descriptor. A repeated download succeeds only when an existing destination is byte-identical. The client uses retained readers, validates offsets, count and final SHA256, and closes its own readers.

The HTML report is an offline printable output. CSV prefixes formula-like source text once; negative number tokens remain numeric literals. JSON and original source downloads preserve the original values.

## 7. Use the original dataset and merchant release

dataset.prepare accepts reportId, reviewId and an actual dataset name. The native dataset is a string table; the original response files, report, approval, source digest and coverage are included as provenance. Its rows remain tied to the original report.

Read dataset.query with datasetId and query as the original URL query string, such as limit=50&offset=0. The SF30 engine controls supported filters, ranges, sorting and pagination.

release.prepare takes datasetId, the actual merchant origin/path and the original payment configuration. Supply the real existing configuration; this product does not invent a network, asset, amount, merchant destination or approval. The result retains the native SF82 release identity, source digest and original delivery handoff.

Inspect release.inspect before a control action. release.activate, release.start, release.stop and release.rollback each take the original releaseId and currently observed expectedGeneration. These are separate explicit operations; preparation does not automatically activate or start a server.

If a native control reply is lost, read release.recovery-preview with its original operationId. Retain the observationSha256 and inspect whether canReconcile is true. release.reconcile names originalOperationId, expectedObservationSha256, actor, note and either RECONCILE_OBSERVED_STATE or RETAIN_UNRESOLVED. It uses the original native generation/history evidence; it never invents successful activation.

Before a complete project export, explicitly stop every running native release. Export verifies STOPPED and holds the original draft, release and dataset writer leases for the copy. A caller must resolve a conflicting original writer; the exporter does not remove its lock.

## 8. Receive actual Buyer outcomes

The original host must be configured with the selected existing Inbox. Read buyer.inspect with the original intentIds. It reports the native retained records and supported result. buyer.receive uses those same IDs and delegates the original SF88/SF100 receiving workflow.

This action does not create a purchase, allocation, payment or provider call. Unpaid, incomplete or other native results retain their original status. Returned download descriptors refer to the original received outputs.

If an accepted Buyer receive is interrupted before its original native result, resume it only with that same explicitly configured Inbox. Once the original native result is retained, its completed output copies and receipt support normal same-request recovery.

## 9. Export, inspect, receive and reopen the full project

Use project.export with a human-readable title after explicitly stopping native releases. Complete source preparation occurs before the request is accepted. Once accepted, the saved request points to that exact prepared archive, even if the final acknowledgement is lost.

The archive includes the selected complete merchant application, original workspace identity and requests, raw responses, report/review editions, original native data and release history, prior prepared project archives and any original runtime source archive/profile/lock. It omits ephemeral connection credentials, live process controls and kernel-lock files. Every included member is source-hash bound.

Download the returned project descriptor with the same CLI or browser mechanism. Limits are 1 GiB for a selected project archive and expanded project, 512 MiB per included member, and 20,000 members. Large complete files use streaming upload/download; the browser's in-memory transfer UI has a smaller limit and directs the operator to the CLI.

On a receiving host, first select the exact trusted installed application edition. Inspect the original project with:

~~~sh
node "$PIRATE_CLI" inspect-project --file /absolute/original/customer-project.zip \
  --application-source "$PIRATE_PACKAGE"
~~~

Start an existing or explicitly initialized receiving workspace under the original owner, then retain the archive using one saved upload UUID:

~~~sh
node "$PIRATE_CLI" upload-project --connection "$PIRATE_CONNECTION" \
  --id ACTUAL_SAVED_UPLOAD_UUID --sha256 ACTUAL_ARCHIVE_SHA256 \
  --file /absolute/original/customer-project.zip
~~~

Read project.preview with uploadId and expectedArchiveSha256. Inspect the full source, workspace counts, native bindings and previewSha256. Submit a saved project.receive request containing uploadId, expectedArchiveSha256, expectedPreviewSha256, actor and note.

Receiving deduplicates by the original archive digest, keeps the original receiving UUID and resumes exact retained byte prefixes. It checks every included application member against the trusted source. The native publisher appends its authenticated dataset relocation; the SF82 sidecar binds the original immutable release to the copied dataset using the original pointer CAS. These operations do not activate the received release.

The completed receipt names relativeDirectory within the receiving workspace. Open it using the original accepted operation UUID:

~~~sh
node "$PIRATE_CLI" open-received --connection "$PIRATE_CONNECTION" \
  --operation-id ACTUAL_RECEIVING_OPERATION_UUID
~~~

The original host opens a separate original-instance view of that received workspace. It checks its unchanged workspace ID, a revision at least as recent as the original receipt and the complete source. It does not overwrite an advanced received workspace with the original archive.

Exporting this already-received project preserves the original installed sidecar and source histories. A second receiving appends its own checked relocation using the previous pointer bytes; it does not strip earlier receiving evidence.

## 10. Prepare the received runtime and original lock

The included application is trusted through the exact package manifest, but a copied old runtime-install.json still names its original host. It remains evidence. Do not run recover --from against that relocated metadata.

When the complete project contains the original source.tgz, runtime profile and optional package-lock.json, use the new source-bound front door:

~~~sh
PIRATE_RECEIVED=/absolute/private/receiver/project-receiving/ACTUAL_ARCHIVE_SHA256
PIRATE_NEW_INSTALL=/absolute/private/received-pirate-runtime
PIRATE_RUNTIME_OPERATION=ACTUAL_SAVED_PREPARATION_UUID

node "$PIRATE_CLI" prepare-runtime --received "$PIRATE_RECEIVED" \
  --application-source "$PIRATE_PACKAGE" \
  --directory "$PIRATE_NEW_INSTALL" --operation-id "$PIRATE_RUNTIME_OPERATION"
~~~

This command verifies the received source inventory and original source receipt, uses the maintained archive inspector to bind source.tgz to the exact trusted package manifest, then calls original runtime preparation. It uses the original selection and profile. If a lock exists, retainRuntimeLock verifies its exact bytes, root dependency declarations and direct selected versions, then stores the original receipt and lock under the native install.lock. It does not resolve replacement versions.

The result says SOURCE_PREPARED_LOCK_RETAINED or SOURCE_PREPARED_WITHOUT_RETAINED_LOCK. It records zero dependency-install and provider invocations. Only then use the maintained installer:

~~~sh
node "$PIRATE_RUNTIME_CLI" install --dir "$PIRATE_NEW_INSTALL"
node "$PIRATE_RUNTIME_CLI" inspect --dir "$PIRATE_NEW_INSTALL" --load --source
~~~

With a retained lock, the existing installer uses npm ci. With no original lock, the result states that the original installer will resolve and retain a new one. Choose the original offline/cache/native-header controls when applicable.

Start the received workspace with this actual new package after its runtime is ready:

~~~sh
PIRATE_NEW_CLI="$PIRATE_NEW_INSTALL/package/source/stellar/scf-starforge-20261009/sf30-seller-sdk/pirate-weather/cli.mjs"
node "$PIRATE_NEW_CLI" serve --workspace "$PIRATE_RECEIVED/workspace" \
  --application-source "$PIRATE_NEW_INSTALL/package"
~~~

Close its previous owner first. This changes the selected application location, preserving the received workspace and all original project and native release identities.

A project exported from a bare built package can report SOURCE_PACKAGE_ONLY. It contains the full source but no invented original runtime archive/lock. Retain the real source-selected installation or prepare the original built archive through the maintained installation workflow before claiming cold-runtime receiving.

### Preparation and lock interruption

Repeat prepare-runtime with the same UUID, source and destination to recover a completed preparation or a partial lock-import receipt. The retained intent prevents a different source/destination from reusing that UUID. Normal install refuses an incomplete retained-lock intent until its original request finishes.

If native source preparation itself stopped before a complete plan, preserve that directory. The original installer recovers source preparation into an explicitly selected new installation:

~~~sh
node "$PIRATE_RUNTIME_CLI" recover --from /absolute/private/interrupted-install \
  --dir /absolute/private/recovered-install --prepare-only
~~~

This uses the retained original archive/selection and does not install dependencies. Then use the original lock from RECEIVED/runtime/package-lock.json and RECEIVED/source-handover.json with the explicit retained-lock command before normal install:

~~~sh
node "$PIRATE_RUNTIME_CLI" retain-lock --dir /absolute/private/recovered-install \
  --lock /absolute/private/received/runtime/package-lock.json \
  --sha256 ACTUAL_LOCK_SHA256 --profile-id ACTUAL_ORIGINAL_PROFILE_ID \
  --source-manifest-sha256 ACTUAL_APPLICATION_MANIFEST_SHA256 \
  --archive-sha256 ACTUAL_ORIGINAL_SOURCE_TGZ_SHA256 \
  --source-receipt /absolute/private/received/source-handover.json \
  --source-receipt-sha256 ACTUAL_PROJECT_MANIFEST_SHA256 \
  --operation-id ACTUAL_SAVED_LOCK_RECEIVING_UUID
~~~

The expected values come from the same reviewed original runtime inventory and source receipt. Keep its selected request and result. An already populated dependency graph continues through the original adoptExisting workflow; this lock-only command deliberately operates before the first dependency installation.

## 11. Typed client and MCP

The installed package exports seller/pirate-weather/client and its client.d.mts. connectPirateWeather binds the current connection file, original workspace and optional expected source SHA. act, recover and resume use the same original UUID model; read is side-effect free except native inspection required by the selected original engine. close releases only that client's requests/readers, preserving the server owner.

For the maintained merchant MCP host, provide its pirateWeatherConnection input with a private JSON file of this shape:

~~~json
{
  "schema": "stellar-forge.pirate-weather-operator.v1",
  "workspaces": {
    "customer": {
      "connectionFile": "/absolute/private/customer-forecast/connection.json",
      "workspaceId": "ACTUAL_WORKSPACE_UUID",
      "configurationSha256": "ACTUAL_CONFIGURATION_SHA256",
      "sourceSha256": "ACTUAL_APPLICATION_SOURCE_SHA256",
      "projectInputsDirectory": "/absolute/private/selected-project-inputs",
      "label": "Actual customer project"
    }
  }
}
~~~

Obtain the IDs from the original initialized workspace and current startup, not this template. Configure the source directory only when original ZIP uploads are needed. MCP permits a ZIP basename inside that canonical selected directory, with its expected SHA256.

Use merchant_pirate_workspaces, then merchant_pirate_connect. Other tools require the returned original workspace alias and instanceId. Available tools cover state/read/action/recover/resume, retained file read/release, project upload/open and disconnect. A stale instance ID requires reconnecting to the actual original host; the provider does not silently open a replacement workspace.

The MCP configuration and runtime installer are administrative host operations. Browser project receiving never executes an uploaded application's code or invokes npm.

## 12. Final delivery record

Retain the actual contract digest, capture/source digests and source dispositions, report/review IDs, native dataset/release identities, actual Buyer receipt IDs, complete project SHA256, receiving result and runtime readiness result when applicable. Preserve the original requests and source files.

A source-only empty-project acceptance should explicitly say that no forecast was supplied. A complete customer operation should identify its actual source and completed stages. Do not conflate source publication, a local application check, provider usage, merchant settlement or external customer acceptance.
