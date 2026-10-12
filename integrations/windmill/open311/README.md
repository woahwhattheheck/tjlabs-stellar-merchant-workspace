# Open311 service operations for Windmill

A complete operator workspace for public service requests: capture original data, assign work through a native approval, compare saved source editions, and deliver a portable workspace another operator can reopen.

The project installs one maintained Bun script, three Windmill flows and a full-code React app. It uses the existing Open311 SQLite workspace in this repository. The source service and independent receiving service run as their original Node servers. Windmill's worker shares their private network namespace; the Open311 API keeps its loopback binding.

## Operator workflow

1. Open **Service operations** in Windmill and choose **Source workspace**.
2. Select **Capture source**. The flow saves the service catalogue and the fixed-window request response, with their original bytes and receipt.
3. Select requests, enter an internal status, assignee, due date and note, then select **Review selected**. Open the native Windmill run, inspect the proposed assignment and approve or reject it.
4. Open **Transfer** to download the delivery files. The pack contains original source, normalized JSON, CSV and HTML for requests and services, plus the complete workspace export.
5. Capture the same source window again and use **Comparison** to inspect added, changed, unchanged and missing rows. The original workspace decides whether the query scopes support a missing-row comparison.
6. Receive the complete workspace into the independent destination and open **Received workspace**. Captures, reviews, history and original operations remain available under the original workspace identity.

**Activity** keeps native job links and interrupted submissions. Before dispatch, the app saves the complete input and a new job UUID in this browser's IndexedDB. Its launch action reopens that exact job or submits the declared flow with that UUID, checking the saved flow path and input. A browser refresh restores pending actions; select **Resume submission** to continue the original action. Once Windmill confirms the job, the app removes the local input and retains the job link. The app retains every active job and the 30 most recent completed jobs. A partially completed assignment batch retains one original operation per request.

## Included source

| File or directory | Purpose |
| --- | --- |
| compose.yaml | Private Windmill server, worker, PostgreSQL and original Open311 services |
| start-workspaces.mjs | Starts the original source and receiver with separate persistent directories |
| workspace/f/tjlabs_open311/workspace.ts | Original HTTP operations, retained native job launch, prepared actions, review plans, exports and receiving |
| workspace/f/tjlabs_open311/refresh.flow | Service and request capture |
| workspace/f/tjlabs_open311/review_delivery.flow | Review, native approval, assignments and complete delivery |
| workspace/f/tjlabs_open311/transfer.flow | Original workspace receive and reopen |
| workspace/f/tjlabs_open311/operations.raw_app | Complete React operator app and fixed backend bindings |
| commission.py | Pull, pin, start, deploy and read back the complete native installation |
| native-journey.py | Execute the full customer journey through Windmill jobs and its actual approval endpoint |
| adapter-journey.mjs | Execute the underlying service/adapter journey directly on Node |
| fixtures/helsinki-retained-source.json | Complete original Helsinki response bytes and source-import receipts |

All flow and metadata files use JSON syntax, which is valid YAML. The installer reads them with Python's standard library. The same workspace tree is suitable for Windmill's CLI.

## Install on an existing Docker host

Use a checkout of this repository, Python 3 and Docker Compose v2. The worker follows Windmill's published privileged-worker configuration. This project uses its own Compose project and named volumes.

From this directory:

    python3 commission.py prepare
    python3 commission.py up
    python3 commission.py deploy

The first command pulls the official images and records their actual immutable repository digests in the private installation. The server and worker use the same pinned Windmill image. PostgreSQL 18 stores its data under /var/lib/postgresql, matching the current upstream layout.

The default native app address is:

    http://127.0.0.1:8079/apps/get/f/tjlabs_open311/operations?workspace=open311_operations

The generated local operator email and password are in .private/installation.json. Use them on the local Windmill login page. The installer creates this local account without sending email. Keep the private directory with the installation; it also contains image identities, deployment readbacks and job continuity records.

For another loopback port, pass the same --port value to the initial prepare command. Use --private /absolute/private/directory when keeping installation state outside the checkout.

Only the Windmill UI port is published, on loopback. The source API uses 7311 and the receiver uses 7312 inside the shared namespace. A public deployment needs the host's normal authenticated routing and deployment configuration.

To stop or resume the same installation:

    python3 commission.py stop
    python3 commission.py up

Named volumes retain PostgreSQL, the source workspace, the receiving workspace, worker cache and native worker logs.

## Complete native commissioning

Run the full workflow on a fresh installation:

    python3 native-journey.py --approve-review
    python3 commission.py logs

The journey creates real Windmill jobs for source capture, reads, review, comparison, delivery and transfer. Its approval call submits an event to the exact URL returned by the native approval step. Omit --approve-review to approve from the native run page while the journey waits.

The journey selects the three retained requests, assigns all three, downloads the complete delivery, repeats the same source window, replays a flow under the same source operation identities, and receives the workspace independently. It compares every original request/service export and every original workspace operation after receive.

A prepared native job UUID is saved before submission. If a client connection is interrupted, rerun the same command with the same private directory: it inspects that job and collects or continues the existing operation. Original inputs are kept in .private/journey/jobs. Complete downloads and result files are in .private/journey.

For a walkthrough, use the built app after commissioning. Show the queue and assignment history, open the actual approval run, compare the two saved captures, download a report, and switch to the received workspace. Follow WALKTHROUGH.md for a short recording that covers the complete operator journey.

## Original source and data

The included public Helsinki responses were observed on 8 October 2026. They contain five services and three requests for the exact request window 08:00–12:00 UTC. The manifest retains the original URLs, source observation times, bytes, hashes and actual import provenance. The original origin HTTP status and headers remain null where the source import did not supply them.

The default service mode replays those original responses through the repository's original Open311 client. It requires an exact request-URL match. The capture receipt retains the original observation and records the replay time separately.

To use the actual network client, prepare a separate installation with --source-mode live and supply the appropriate query inputs when running the capture flow. The included app presents the retained Helsinki window. Service credentials, where needed for another connection, belong in the host environment referenced by the connection's apiKeyEnv.

Publisher: City of Helsinki — Helsingin kaupunginkanslia. Dataset: [The Issue Reporting API of the City of Helsinki](https://hri.fi/data/en_GB/dataset/helsingin-kaupungin-palauterajapinta). License: [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).

## Integration contracts

Prepared capture inputs include the original request ID, workspace UUID, observed revision and payload hash. Windmill keeps preparation and application in separate steps, so a retained apply step can resume the exact input. The original service handles operation replay and revision conflicts.

Review plans retain selected source hashes and prior review identities before approval. Application checks current source and review identities before each mutation. Completed rows replay their original operation result if a batch resumes.

The app's backends fix their action in Windmill's execution policy. Read bindings expose the selected original read operation. The launch binding permits only the declared capture, review and transfer paths. It fixes the flow run key to the saved job UUID and verifies any existing job's path and full input before continuing. Worker credentials come from Windmill's native job environment. The native approval uses the community approval mechanism; the assignment form is part of this React app.

Receiving uses the original complete-workspace format and validation. It requires an empty destination. After receiving, the destination exposes the original workspace UUID; refresh or reopen the receiving view before the next operation.

## Upstream references

- [Windmill self-hosting](https://www.windmill.dev/docs/advanced/self_host)
- [Full-code apps](https://www.windmill.dev/docs/apps/full_code_apps)
- [OpenFlow](https://www.windmill.dev/docs/openflow)
- [Suspend and approval](https://www.windmill.dev/docs/flows/flow_approval)
- [Windmill native OpenAPI](https://github.com/windmill-labs/windmill/blob/main/backend/windmill-api/openapi.yaml)
- [Implementation partners](https://www.windmill.dev/docs/enterprise/partners)
