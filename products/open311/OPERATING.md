# Open311 municipal service operations

Capture an official municipal service catalog and its published requests, keep the complete original responses, assign internal reviews, compare later observations, and deliver a workspace another operator can receive and reopen. The browser, command line and sixteen merchant tools share the same saved SQLite workspace.

This product is installed through the original Stellar merchant distribution. Its application is **Open311 service operations**, its command is **open311**, and its merchant provider is **open311-workspaces**. The [source adoption record](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/open311/SOURCE_ADOPTION.json) names every original source blob. The original [source guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/open311/README.md), [browser guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/open311/workspace/WORKSPACE.md), and [merchant guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/open311/MCP.md) travel in the package.

## What the operator can complete

| Work | Saved result |
| --- | --- |
| Select an official endpoint and jurisdiction | Named connection, provider limits, declared extensions and attribution |
| Capture a service catalog, service definition, request window, individual request, token or discovery document | Complete original response bytes, parsed document, source URL and observation receipt |
| Search and review captured cases | Exact source identity, original fields, internal assignment, status, due date and review history |
| Compare two captures | Added records and field changes, with missing-from-capture reporting only for comparable fixed scopes |
| Deliver a selected edition | Original response, JSON with reviews, CSV or printable HTML |
| Hand over the whole project | Complete workspace bundle with original captures, review history and saved operation results |
| Reopen through Applications or merchant tools | The same workspace identity and operating state |

Source status remains visible exactly as the provider supplied it. Internal review status is new, assigned, in_progress or done. Saving a review updates the local workspace. The source client reads civic endpoints with GET.

## Install the selected merchant product

Use Linux, Node 22.16 or newer, Python 3.11 or newer, Git and npm for the maintained package builder and installer. The existing host setup uses util-linux flock. The direct Open311 modules use the Node built-in SQLite API and require Node 22.13 or newer; the packaged merchant uses the higher 22.16 baseline from the original distribution.

From a checkout of this repository at the intended immutable commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . \
  --ref "$(git rev-parse HEAD)" \
  --selection open311-operations \
  --out /absolute/private/open311-package \
  --offline
~~~

The new output directory receives one original archive and its package/manifest information. Keep the returned archive path and SHA-256 with the delivery. The selected recipe retains the Open311 browser assets, typed interfaces, merchant provider, Applications adapter, installation and receiving infrastructure.

Install that archive in a private working directory:

~~~sh
install -d -m 700 /absolute/private/open311-install
cd /absolute/private/open311-install
npm install --ignore-scripts --offline --omit=optional \
  /absolute/private/open311-package/*.tgz
npx --no-install starforge doctor
npx --no-install starforge registrations --source open311-operations
npx --no-install starforge merchant-providers inspect open311-workspaces
~~~

The source-only install makes the Open311 browser, CLI and direct SDK available. Use the maintained runtime workspace to prepare the selected mcp feature when attaching an external MCP client. Its original runtime profile selects dependency versions from this source edition. The complete source build and runtime receiving procedures are documented in [BUILDING.md](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/BUILDING.md) and [SOURCE_SELECTIONS.md](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md).

In the remaining examples, run npx from that installation directory. All private workspace, host configuration and export paths are outside the source checkout.

## Create the desk and select a source

Initialize the durable workspace:

~~~sh
npx --no-install starforge open311 state \
  --workspace /absolute/private/open311-desk
~~~

Save the included Helsinki profile, or prepare the complete equivalent connection in a private JSON file. The original example is at:

~~~text
node_modules/@tokenjunkielabs/starforge-merchant/source/stellar/scf-starforge-20261009/sf30-seller-sdk/open311/examples/helsinki.connection.json
~~~

For Helsinki, the example selects the public API at https://palautteet.hel.fi/public-api/open311-public-service/v1, a response limit of 200, native READY and PROCESSING status values, and the documented extended attributes. It carries the city's source attribution and CC BY 4.0 license. The city's [API description](https://www.hel.fi/static/avoindata/kanslia/Open311_API_description_011025.pdf) describes the returned set as the last 90 days or at most 200 first responses; its [HRI catalog](https://hri.fi/data/en_GB/dataset/helsingin-kaupungin-palauterajapinta) provides the source attribution.

Copy the profile to the private operation area, then apply it with a stable operation ID:

~~~sh
cp node_modules/@tokenjunkielabs/starforge-merchant/source/stellar/scf-starforge-20261009/sf30-seller-sdk/open311/examples/helsinki.connection.json \
  /absolute/private/helsinki.connection.json
chmod 600 /absolute/private/helsinki.connection.json

npx --no-install starforge open311 connection-put \
  --workspace /absolute/private/open311-desk \
  --file /absolute/private/helsinki.connection.json \
  --request-id helsinki-connect-01 \
  --expected-revision 0
~~~

A new desk begins at revision 0. For an existing desk, read state and use that current revision. A connection's endpoint and jurisdiction remain tied to its capture history; a different source uses a new connection ID. A private source can specify apiKeyEnv, naming an environment variable available to the launched host.

Start the desk:

~~~sh
npx --no-install starforge open311 serve \
  --workspace /absolute/private/open311-desk \
  --port 0
~~~

The command prints a single startup JSON line containing the actual loopback URL, workspace identity and binding. Open that URL. Save connections, capture source data, search requests, assign reviews, compare captures and download files through the same browser.

### Use the managed Applications launcher

For a maintained installed runtime, open the original runtime workspace and choose **Applications → Open311 service operations**. Select the initialized private desk directory, review and save the application, then start it. The provider binds the saved workspace UUID and directory to the actual startup response. Start, Open, Stop and recovery remain part of the shared Applications workflow.

The maintained runtime workspace entry point is:

~~~sh
npx --no-install starforge runtime-workspace serve \
  --workspace /absolute/private/merchant-runtime-workspace \
  --port 8465
~~~

Use its existing runtime installation or attach the selected Open311 runtime through the workspace's original installation workflow. The Open311 workspace directory is the directory containing open311.sqlite.

## Capture complete source observations

Capture the English catalog with a private query file containing:

~~~json
{ "locale": "en" }
~~~

Then run:

~~~sh
npx --no-install starforge open311 capture \
  --workspace /absolute/private/open311-desk \
  --connection helsinki-public \
  --kind services \
  --query /absolute/private/catalog-query.json \
  --request-id helsinki-catalog-01 \
  --expected-revision 1
~~~

For requests, choose the actual operating interval. This example names a fixed interval and requests the provider's extended attributes:

~~~sh
npx --no-install starforge open311 capture \
  --workspace /absolute/private/open311-desk \
  --connection helsinki-public \
  --kind requests \
  --start 2026-10-08T08:00:00Z \
  --end 2026-10-08T12:00:00Z \
  --extensions true \
  --request-id helsinki-window-20261008-01 \
  --expected-revision 2 \
  --out /absolute/private/helsinki-window-01.json
~~~

The mutation response carries result.capture.id. Keep that ID for case search, review context, comparison and selected exports. Operation results also retain the request ID and expected revision.

The original source client follows [Open311 GeoReport v2](https://wiki.open311.org/GeoReport_v2/), [declared extensions](https://wiki.open311.org/GeoReport_v2/Extensions/), and [service discovery](https://wiki.open311.org/Service_Discovery/). Fixed date intervals must be timezone-qualified and at most 90 days. Individual request IDs take the protocol's precedence over other filters. Pagination is available only when the source profile declares support.

Each capture stores the actual normalized request query as query and the operator's original selection as requestedQuery. Inspect its coverage to see the documented limit and possible saturation. If a provider returns the limit, choose smaller fixed windows appropriate to that provider's documented date semantics. The [FixMyStreet documentation](https://www.fixmystreet.com/open311) describes its own exclusive end date and response cap; those endpoint details belong in the selected source's operating procedure.

A Helsinki request may have a null service_code and an empty service_name. Those source values remain intact. The request desk can operate such records without assigning a catalog category.

## Search, assign and compare

Search one saved capture:

~~~sh
npx --no-install starforge open311 requests \
  --workspace /absolute/private/open311-desk \
  --capture CAPTURE_ID \
  --status READY \
  --q street \
  --offset 0 \
  --limit 100
~~~

The result contains items, total, offset and limit. Page the same capture through its entire saved population. Use request for the full original case and current review:

~~~sh
npx --no-install starforge open311 request \
  --workspace /absolute/private/open311-desk \
  --capture CAPTURE_ID \
  --id SERVICE_REQUEST_ID
~~~

Prepare a review file with the actual assignee and note:

~~~json
{
  "status": "assigned",
  "assignee": "Operations",
  "note": "Review the source response and route maintenance follow-up.",
  "dueDate": "2026-10-15"
}
~~~

Read the current desk revision, then save the review:

~~~sh
npx --no-install starforge open311 state \
  --workspace /absolute/private/open311-desk

npx --no-install starforge open311 review-put \
  --workspace /absolute/private/open311-desk \
  --connection helsinki-public \
  --id SERVICE_REQUEST_ID \
  --file /absolute/private/review.json \
  --request-id municipal-review-01 \
  --expected-revision CURRENT_REVISION
~~~

A review keeps its saved capture/source association and history. Parallel browser and merchant users retain each other's successful review changes through the transactional workspace.

Capture a second source observation with a new operation ID. Compare the selected editions:

~~~sh
npx --no-install starforge open311 diff \
  --workspace /absolute/private/open311-desk \
  --before FIRST_CAPTURE_ID \
  --after SECOND_CAPTURE_ID
~~~

Compare field changes from the source. Treat missingFromCapture as an observation about comparable scope. The comparison only reports it for equal fixed, unsaturated populations; source disappearance does not itself change an internal review or classify a request as complete.

## Attach the merchant tools

The Open311 provider uses an existing merchant release store and the same desk directory. Prepare a private host file with mode 0600:

~~~json
{
  "schema": "stellar-forge.open311-workspace-host.v1",
  "workspaces": {
    "desk": {
      "label": "Municipal service operations",
      "directory": "/absolute/private/open311-desk",
      "connectionProfiles": {},
      "inputs": {}
    },
    "received": {
      "label": "Received municipal workspace",
      "directory": "/absolute/private/open311-received",
      "connectionProfiles": {},
      "inputs": {}
    }
  }
}
~~~

Initialize the receiving directory with the state command as above. Save the host file as /absolute/private/open311-host.json. The complete [merchant guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/stellar/scf-starforge-20261009/sf30-seller-sdk/open311/MCP.md) shows how to add source profiles and source-bundle input aliases.

Save /absolute/private/open311-setup.json with:

~~~json
{
  "directory": "/absolute/private/open311-merchant",
  "connection": "/absolute/private/open311-host.json",
  "name": "Municipal service operations"
}
~~~

Run the existing provider initializer:

~~~sh
npx --no-install starforge merchant-providers init open311-workspaces \
  --options /absolute/private/open311-setup.json
~~~

Setup returns the original merchant configuration path and retains its initialization operation. The same arguments resume the same setup. An existing merchant can supply its original releaseStore path in the setup options.

The original MCP subprocess command uses the resulting configuration:

~~~sh
npx --no-install starforge merchant-mcp-stdio \
  --config /absolute/private/open311-merchant/merchant-mcp.json
~~~

Register that command with the operator's existing MCP client. Its host environment supplies any apiKeyEnv values. The provider's sixteen tools cover desk discovery, status, complete records, source configuration, captures, catalogs, case search/detail, comparison, review, operation recovery, selected input receiving, complete file reading and reader release.

The typed SDK is exported as:

~~~js
import { Open311MerchantClient } from
  '@tokenjunkielabs/starforge-merchant/merchant/open311/client';

const desk = new Open311MerchantClient(
  (name, args) => transport.callTool({ name, arguments: args }),
  'desk',
);
const state = await desk.status();
const worklist = await desk.requests({
  capture: 'CAPTURE_ID',
  expectedRevision: state.revision,
  offset: 0,
  limit: 100,
});
~~~

Here transport is the already connected MCP client. Mutations carry their saved request ID and revision. Source response downloads use immutable capture IDs; workspace and reviewed exports use the selected business revision. The provider drains its own active work before closing its SQLite handles and retained readers, allowing the independent browser to continue.

## Deliver and reopen

The [receiving guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/open311/RECEIVING.md) gives the complete transfer procedure and original-file checks. From the same desk, export the selected source bytes or the full workspace:

~~~sh
npx --no-install starforge open311 export \
  --workspace /absolute/private/open311-desk \
  --kind source \
  --capture CAPTURE_ID \
  --out /absolute/private/municipal-original.json

npx --no-install starforge open311 export \
  --workspace /absolute/private/open311-desk \
  --kind workspace \
  --out /absolute/private/municipal-workspace.json
~~~

Use kind json, csv or report with the capture ID for reviewed data or a printable HTML report. The HTML retains the source attribution from the connection. Output files are created with exclusive creation so each delivered edition keeps its own filename.

The complete workspace includes all connections, source captures, original response bytes, review histories, operation intents and saved results. Its receiving operation validates the original bundle and source digests, retains the workspace identity, and reopens the captured source and internal work together.

## Recover an interrupted operation

The CLI prints a mutation's request ID and original expected revision before submitting it. If the caller loses the response, read the retained operation:

~~~sh
npx --no-install starforge open311 operation \
  --workspace /absolute/private/open311-desk \
  --id ORIGINAL_REQUEST_ID
~~~

Repeat the same request ID, original expected revision and unchanged inputs for that same intended operation. Use a new ID and current revision for a new intended change. A failed source acquisition preserves its available original response and receipt in the operation; it can be exported through the merchant operation file.

## Run the whole commissioning workflow

The included commission.mjs executes one operated journey: original catalog and request capture, review, repeat capture/diff, source/JSON/CSV/report/full exports, merchant attachment and multichunk original-file reading, independent browser continuity, complete receiving and reopen.

From the installation directory:

~~~sh
node node_modules/@tokenjunkielabs/starforge-merchant/source/stellar/scf-starforge-20261009/sf30-seller-sdk/open311/commission.mjs \
  --connection /absolute/private/open311-install/node_modules/@tokenjunkielabs/starforge-merchant/source/stellar/scf-starforge-20261009/sf30-seller-sdk/open311/examples/helsinki.commission.json \
  --start 2026-10-08T08:00:00Z \
  --end 2026-10-08T12:00:00Z \
  --output /absolute/private/open311-commission
~~~

Use a new private output directory. For retained original source responses, add --retained with the complete original-source manifest described in the browser guide. The journey records the actual retained bytes, source observation metadata, operating results and receiving outcome in its output directory.
