# Operate TaskerArmy notification delivery

The operator console works on the same durable outbox and routing configuration as `notification_outbox.py`. It supplies complete tenant and Slack-route setup, a current delivery queue, explicit recovery and the original job's retained event history.

`operator_server.py` imports the maintained `Outbox` and `load_config` directly. `operator.html` is its self-contained browser interface. Python 3.11+ and the standard library are sufficient on the existing Linux host. The console uses the worker's own SQLite methods; each method opens and closes its connection.

## Start on the existing worker host

First follow the main README to initialize the database/configuration and start the ingress and delivery worker. Pass the **same absolute database and configuration paths** to the console:

```sh
python operator_server.py \
  --database /absolute/path/to/state/notices.sqlite3 \
  --config /absolute/path/to/notices.json \
  --port 8095
```

Open the local URL printed by this command. The server binds to `127.0.0.1`. The generated operator token is carried in the URL fragment, read into browser memory, and immediately removed from the address bar. It is sent to local API routes only through the Authorization header. The page does not save it in browser storage.

The process creates a new random token on each launch. An operator can supply an existing URL-safe token of at least 32 characters in `TASKER_OPERATOR_TOKEN`, or name a different environment variable with `--token-env`. Keep that token with the host's existing administrative credentials. The tenant's ingress token has a separate receiving purpose.

For a remote host, use an existing SSH connection and a local port forward. Keep the browser's forwarded address at the same loopback port as the server:

```sh
ssh -N -L 8095:127.0.0.1:8095 user@existing-host
```

Open `http://127.0.0.1:8095/` and enter the operator token from that process. Host and Origin checks expect that exact local address. The console is a host operator interface. A future embedding in TaskerArmy's authenticated product must resolve its own administrative role and tenant membership before exposing the same methods.

## Set up the first tenant and route

An empty initialized configuration is supported. Open **Connections & routing**, then:

1. **Add tenant.** Use the original tenant identity that the product's authenticated job transition resolves. Enter the allowed HTTPS review origin and the name of the host environment variable holding this tenant's ingress credential.
2. **Install the Slack incoming webhook** through the current Slack application/installation workflow. Save its credential in the delivery worker's host environment.
3. **Add route.** Record the actual Slack team and channel returned by that installation, the webhook environment-variable name, the tenant and the desired stores. `*` covers every store in that tenant.
4. Choose the actionable events that the team wants: clarification required, execution blocked, QA failed, preview ready or approval requested. New routes initially select preview ready.
5. Save. The existing delivery worker reads the updated configuration on its next operation.

A Slack incoming webhook has a fixed installed destination. Recording another channel ID in this console does not change the webhook's destination. Install/configure the correct destination first, then record its actual metadata and credential reference.

The UI shows whether referenced credentials exist in **the operator process's environment**. When ingress, worker and operator are separate services, configure each service with the credentials it actually uses. A missing operator environment variable does not by itself describe another process's environment.

The console stores variable names, approved origins and routing metadata. Actual receiving tokens and webhook URLs stay in the host's existing environment/secret management.

## Change routing while work continues

Each configuration read returns the SHA-256 of its exact complete source document. Saving compares that revision under a local writer lock, validates the complete replacement with the maintained worker loader, writes a private temporary file and atomically replaces the original configuration.

If another operator changed the source, the save returns `configuration_changed`. The form stays open with the unsaved values so the operator can compose the change against the current configuration.

A material route edit changes its generation: tenant, store selection, event selection, installed Slack team/channel or webhook-variable reference. The console increments the generation automatically. Enable/disable remains an explicit route setting. A saved route generation cannot decrease. The original worker's routing fingerprint keeps already queued notifications attached to their original destination and routing generation.

The worker also checks each queued notification's original review link against the tenant's current approved origins before dispatch. Revoking an origin retains the queued notice as `route_changed` with `review_origin_changed`; its original event and message remain available for the operator.

Use this console/API or the same `.operator.lock` when multiple configuration writers operate on the host. Atomic replacement gives worker readers a complete document. The current JSON file is retained as the operator's actual configuration; no product deployment or worker restart is needed for its ordinary reloading behavior.

## Operate the delivery queue

The queue reads the newest 200 saved deliveries for the chosen tenant, with counts calculated by the maintained outbox. Filter this receiving window by state, job or route. **Export visible CSV** exports precisely the displayed rows and protects spreadsheet text fields against formula interpretation.

The four summary values are:

| View | Included worker states |
| --- | --- |
| Waiting | `pending`, `dispatching` |
| Delivered | `sent`, including operator-confirmed receiving |
| Needs attention | `uncertain`, `route_failed`, `route_changed`, `failed` |
| Retained history | `superseded`, `expired`, `cancelled` |

Open **Inspect** to see the original event identity/version, route, destination, immutable message digest, attempt count, timing, last response and saved resolution. Where the original event is present, the console renders its concise notification and approved review link.

**Connections need attention** shows the worker's recorded route failures. Repair the original Slack connection, then choose **Resume connection**. This calls `resume_route`; it resumes only failed rows matching the currently enabled route's fingerprint.

### Resolve a saved delivery

The worker permits operator resolution for `uncertain`, `failed`, `route_changed` and `route_failed`. The console uses the original `resolve` method and records an operator note with the decision.

- **Received in Slack — mark sent:** record that the original notification was received.
- **Retry the original notification:** return the retained original message to the worker's ordinary dispatch path.
- **Cancel this notification:** retain the event and close its delivery.

Before retrying an uncertain response, inspect the installed Slack channel. A transport failure may have occurred after Slack accepted the message. The original event/message remains the recovery reference.

Retry requires the unchanged route fingerprint. The worker's claim step still applies expiry, newer job versions and current route availability. A resolution does not manufacture a new event or skip those checks.

The console does not start another delivery loop. The existing worker remains responsible for dispatch, leases, provider responses and due times.

## Reopen a complete job history

Choose **Job history**, select its original tenant and enter the job ID. Clicking a job in the delivery table opens the same view.

The console calls `job_timeline(tenant_id, job_id, before_version, limit)`. Numeric delivery identities and job revisions travel as exact decimal strings in the browser API, preserving SQLite revision cursors beyond JavaScript's integer range. It shows the current job head, retained events including quiet/stale revisions, and each original delivery's status, attempts and resolution. **Load earlier revisions** follows the returned `next_before_version`; it does not assume the recent-delivery window contains the entire job.

A source notification opens the authenticated TaskerArmy review page. Merchant approval and publishing continue in that product workflow.

## Local API

Every `/api/` request uses the current operator Bearer token. All mutation routes are POST and expect JSON.

| Method and path | Actual maintained behavior |
| --- | --- |
| `GET /api/config` | Return validated configuration, exact source revision and environment-reference availability |
| `POST /api/config` | Compare `expected_revision`, validate and atomically replace `configuration` |
| `GET /api/status?tenant_id=…&limit=200` | Call `Outbox.status`; an omitted tenant reads this operator's configured tenants |
| `GET /api/deliveries/{id}` | Call `inspect` and return the saved public delivery fields |
| `GET /api/jobs?tenant_id=…&job_id=…&before_version=…&limit=50` | Call the paginated original job timeline |
| `POST /api/resume-route` | Call `resume_route` for `route_id` |
| `POST /api/resolve` | Call `resolve` for `delivery_id`, `resolution` and `note` |
| `GET /healthz` | Local operator process health |

This is the package's local operator API. TaskerArmy's private production API is integrated through the original authenticated job-transition hook described in the main README.

## Operating controls

The server accepts only its printed loopback Host and a matching browser Origin. Browser API calls use a separate random administrative token. Requests have explicit content types and body limits. Saved configuration carries only supported fields and rejects unexpected fields.

The browser uses a content-security policy with hashes of its actual script and stylesheet, has no external assets, renders event text through DOM text nodes, and strips the launch fragment. Access logs exclude request URLs and authorization material. The server projects delivery fields instead of returning private dispatch leases.

Automatic refresh runs every 15 seconds while the authenticated tab is visible. It pauses while a form/detail dialog is open, stops after authentication failure, and coalesces overlapping refreshes. Close the console process with Ctrl-C when finished; the existing ingress and worker processes continue independently.

## Receiving the complete implementation

Run the completed worker and console together on the original equipped Linux host. Exercise an empty configuration through tenant/route setup, record the five documented job states through the actual ingress/callable boundary, inspect the retained deliveries and job timeline, and reopen after restarting the console. Use the existing controlled transport receiving to exercise provider delay, revocation and uncertain-response resolution before the owner's real installed channel commissioning.

Verify the browser at desktop and phone width, including a real configuration conflict and the recovery form. The module does not introduce dependencies, CI jobs or a separate generated test catalogue. Actual run results and the complete installed source belong in the original TaskerArmy case.
