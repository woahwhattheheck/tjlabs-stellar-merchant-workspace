# Read-only HubSpot acquisition

The installed CRM migration desk can now acquire its target exports directly from a declared HubSpot account. The same physical workspace, Applications listener, writer lease and customer-agent connection own capture, continuation, intake and download.

## Prepare the host

Use an existing CRM workspace and its ordinary private directory. Copy examples/hubspot-host.example.json into a private working file, replace the example portal ID, and select the exact internal property names and directed object pairs needed for this migration. The supported contract is 2026-09, active contacts/companies/deals and non-sensitive properties. Select 1–94 properties per object; both ends of each directed pair must be selected. The example property list is a starting point, not a claim about a particular account.

Configure an authorized HubSpot access token with the read scopes for the selected objects and property schemas. The published scopes include crm.objects.contacts.read, crm.objects.companies.read, crm.objects.deals.read and the corresponding crm.schemas.*.read permissions. The token must also be able to read account details and the selected association endpoints. Supply the token only through the host environment variable named by tokenEnv. Use the ordinary host secret mechanism; keep tokens out of commands, config files, browser forms, agent arguments and source archives. Token refresh/rotation is handled by the host's credential owner, and a resumed capture rechecks the account identity.

With Applications closed, install the declaration using:

    crm-migration hubspot-configure /ABSOLUTE/WORKSPACE /ABSOLUTE/PRIVATE/HOST.json

The command validates and retains hubspot.json as an owner-private file. Start Applications in the environment that contains the access token. Open Capture HubSpot, read the displayed account and scope, and start a new capture with a distinct ID. The browser continues through the complete plan until completion, an operator pause or a saved error. Pause takes effect after the current complete page.

## What is retained

Each capture retains the original plan and expected portal ID, current page state, individual association cursors, complete response bytes in base64, response SHA-256, request path/body, status, selected non-secret HTTP headers and request start/end times. Failed complete responses remain beside accepted responses. A process loss before checkpoint advancement can repeat a read; the earlier original response remains retained and neither read mutates HubSpot.

Every source acquisition step first checks account identity. Properties are verified against actual current non-sensitive schema definitions before records are requested, because HubSpot can ignore unknown requested property names. Directed association labels are captured separately. Object pages use the opaque after value; association batches retain a separate after cursor for each source record and ignore deprecated next links. Every requested source must return an explicit complete result, including an empty association list where appropriate.

The host requests one source page per advance operation, with sequential pacing. HTTP 429 retains Retry-After as a saved next eligible time; other failed or incomplete responses pause at the same original cursor. Browser and native continuation use the saved state. Missing scopes, unexpected schema or repeated record/cursor identities remain explicit errors with retained originals.

Capture is a recorded read window, not an atomic database snapshot. Arrange the data change window with the implementation lead. New live changes may require a new complete capture and comparison. The model refuses duplicate IDs or repeated edges encountered across a moving capture rather than silently selecting a version.

## Finish the migration intake

After all selected object and association pages finish, choose Import target edition. The desk derives one CSV per object and directed association family, retaining exact record IDs and property strings. Metadata columns record portal ID, timestamps and archived status. Missing and null property values become empty CSV cells; complete original responses preserve that distinction. Raw import CSVs retain the original values for machine comparison; they are not sanitised presentation spreadsheets.

The host validates the complete response replay before intake. It retains one complete adoption request containing the original workspace SHA, named operator, timestamp and every original ingest operation. All target files commit together through the existing workspace writer. If the process stops after persistence but before the browser receives its reply, Recover original intake uses exactly that retained request. Identical committed retries return the later current workspace; an uncommitted request cannot be silently applied to a different base or sibling branch.

Map the newly named target sources in Mapping configuration, retain your original source exports and explicit crosswalks, and continue the existing compare/review/decision workflow. Existing configurations, original sources and decisions remain retained.

Download originals exports a ZIP containing the capture checkpoint, complete raw response envelopes and derived CSVs when complete. Export working bundle also includes all captures alongside the original CRM workspace, mappings, reports and operation history. Each downloaded archive is retrieved in retained byte ranges and verified against its complete SHA.

## Native continuation

Close Applications before standalone writer commands. The native run command continues the saved capture, including persisted retry timing:

    crm-migration hubspot-list /ABSOLUTE/WORKSPACE
    crm-migration hubspot-start /ABSOLUTE/WORKSPACE production cutover-oct14
    crm-migration hubspot-run /ABSOLUTE/WORKSPACE cutover-oct14
    crm-migration hubspot-adopt /ABSOLUTE/WORKSPACE cutover-oct14 CAPTURE_SHA BASE_WORKSPACE_SHA "Named operator" 2026-10-14T12:00:00.000Z
    crm-migration hubspot-recover-adoption /ABSOLUTE/WORKSPACE cutover-oct14
    crm-migration hubspot-export /ABSOLUTE/WORKSPACE cutover-oct14 CAPTURE_SHA /ABSOLUTE/PRIVATE/capture.zip

Retain the original capture and workspace hashes from the list/inspect output. The recovery command reads the original adoption's operator, time and base instead of creating a replacement.

Customer agents use merchant_crm_hubspot on the existing configured workspace alias. Actions are list, status, start, advance, adopt, adoption and export. status/adoption identify the saved capture by id. advance and export require expectedSha256. adopt also requires baseSha256, actor and at; adoption returns the retained original request for an uncertain retry. merchant_crm_file reads a retained capture export by SHA using the same ordinary download route. The typed CrmClient.hubspot method exposes these same operations.

## Receiving example and production receiving

examples/hubspot-course.cjs runs the maintained capture planner over a fully authored example. It preserves two object pages, an opaque cursor containing punctuation, a string ID above the safe integer range, three distinct association types/edges, an empty source association result and a second page for one source. The saved result is examples/hubspot-course.json. It is not a customer capture.

The focused host receiving course executes the actual host module with explicit in-memory transport/file substitutes to exercise restart, complete source replay, atomic intake and uncertain commit recovery. Actual filesystem, local HTTP and browser receiving use the installed host procedure in RECEIVING.md. Live account receiving uses the operator-declared portal and token; the distributed examples do not contain credentials.

## Official contracts checked 14 October 2026

- Version and API root: https://developers.hubspot.com/docs/api-reference/latest/overview
- Account identity: https://developers.hubspot.com/docs/api-reference/latest/account/account-information/get-account-details
- Object pages and ignored unknown properties: https://developers.hubspot.com/docs/api-reference/latest/crm/objects/contacts/get-contacts
- Current property definitions: https://developers.hubspot.com/docs/api-reference/latest/crm/properties/get-properties
- Direction-specific labels: https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associations-schema/guide
- Batch completion, per-source cursors and deprecated links: https://developers.hubspot.com/docs/api-reference/latest/crm/associations/associate-records/batch/get-associations
- Read scopes: https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/scopes

The collector has fixed https://api.hubapi.com routes: account details, property reads, label reads, object lists and POST association batch/read. POST here performs a documented read. Redirects and caller-supplied endpoint URLs are not accepted.
