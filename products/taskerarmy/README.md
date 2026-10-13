# TaskerArmy Slack notification component

This component turns an actionable job revision into a concise Slack notice with a link to its current review page. It includes authenticated event receiving, a persistent delivery queue, tenant/store/channel routing, saved delivery outcomes and operator recovery commands. It runs with Python 3.11 or later and SQLite from the standard library.

The integration follows TaskerArmy's [planned Slack workflow](https://taskerarmy.com/integrations/slack/): notify the people who need to act, then return them to the product to review the job. The source event envelope below belongs to this component. TaskerArmy's existing job publisher maps its actual internal events into that envelope.

## What the merchant receives

Each notice contains the job title, store identifier, actionable state, a short reason, the job revision and an authenticated review link. Titles and reasons render as plain text. The review link uses a standard Slack link, so the webhook installation needs no interactive-button callback.

|Event state|Notice|Review action|
|---|---|---|
|clarification_required|Clarification required|Provide clarification|
|execution_blocked|Execution needs attention|Review the next step|
|qa_failed|QA needs attention|Review the failed check|
|preview_ready|Preview ready|Review the preview|
|approval_requested|Approval requested|Review in the dashboard|
|quiet|Retires queued notices for an older job revision|Current job state stays in the product|

A route selects the tenant, one or more stores, allowed event states and an installed Slack channel. One event produces at most one notice per matching workspace/channel, even when multiple rules match. Newer job revisions supersede older queued notices. A request already in flight can finish; every notice retains its revision and points to the current product review.

## Install and initialize

Save `notification_outbox.py` and this guide together. Use an ordinary persistent directory on the application host.

```sh
python --version
python notification_outbox.py --config notices.json --db state/notices.sqlite3 init
```

The initialization command creates an empty private configuration and database. It refuses to overwrite an existing configuration. The program uses no package installation, cloud queue or recurring third-party service.

Deploy the receiver and worker against the same local SQLite database. SQLite WAL and an immediate write transaction coordinate multiple processes on that host. Keep the database on local persistent storage and use the application's existing process supervisor.

### Configure an actual Slack installation

In the customer's Slack app, enable Incoming Webhooks and install the webhook into the intended channel. Record the workspace ID and channel ID returned by that installation. Put its secret URL in the application's secret environment as `TASKER_SLACK_WEBHOOK`. Put a separate random ingress token of at least 32 characters in `TASKER_INGRESS_TOKEN`.

The service's environment also needs these ordinary values while creating the configuration:

|Environment value|Value from the actual installation|
|---|---|
|TASKER_TENANT_ID|Product tenant identifier|
|TASKER_STORE_ID|Product store identifier|
|TASKER_SLACK_TEAM_ID|Installed Slack workspace ID|
|TASKER_SLACK_CHANNEL_ID|Installed Slack channel ID|
|TASKER_REVIEW_ORIGIN|Canonical HTTPS dashboard origin, such as the product's current https://dashboard.taskerarmy.com origin|

Use those actual values to fill the initialized configuration:

```sh
python - <<'PY'
import json
import os
from pathlib import Path

tenant = os.environ["TASKER_TENANT_ID"]
config = {
    "version": 1,
    "product_name": "TaskerArmy",
    "tenants": {
        tenant: {
            "ingress_token_env": "TASKER_INGRESS_TOKEN",
            "review_origins": [os.environ["TASKER_REVIEW_ORIGIN"]],
        }
    },
    "routes": [{
        "id": "merchant-review",
        "tenant_id": tenant,
        "store_ids": [os.environ["TASKER_STORE_ID"]],
        "states": [
            "clarification_required", "execution_blocked", "qa_failed",
            "preview_ready", "approval_requested",
        ],
        "team_id": os.environ["TASKER_SLACK_TEAM_ID"],
        "channel_id": os.environ["TASKER_SLACK_CHANNEL_ID"],
        "webhook_env": "TASKER_SLACK_WEBHOOK",
        "generation": 1,
        "enabled": True,
    }],
}
Path("notices.json").write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
PY
python notification_outbox.py status
```

A webhook is bound to the channel selected during installation. The route's IDs describe that actual installation; changing an event cannot change its destination. Use another installed webhook and route for a different channel. Multiple tenants use separate ingress-token environment references and server-owned routes. Use `store_ids: ["*"]` only when that tenant has chosen to receive notices for all its stores.

The configuration stores environment references, not webhook secrets. Its review origins are exact HTTPS origins without trailing slashes. Event review URLs must use one of those origins and contain the actual authenticated job path. The URL accepts no credentials, query or fragment. The source application supplies the real path from its router.

## Connect the job publisher

The source application emits one normalized envelope for each relevant job revision. It authenticates the tenant from its existing job context and retains the event in its existing durable event publisher until the receiving operation is acknowledged.

|Field|Source meaning|
|---|---|
|event_id|Stable event ID, reused unchanged when the same event is retried|
|job_id|Actual stable job ID|
|store_id|Actual store belonging to the authenticated tenant and job|
|version|Positive, monotonically increasing job revision|
|state|One of the six states listed above|
|title|Customer-safe job title, at most 180 characters|
|reason|Optional short explanation, at most 500 characters|
|review_url|Actual HTTPS job-review URL on a configured tenant origin|
|occurred_at|Source event time in ISO 8601 with a timezone|

Do not include a tenant, webhook, Slack channel, source code or credentials inside the envelope. Tenant identity comes from the authenticated receiving header or the trusted local caller. State changes that make an older notice irrelevant should emit a newer `quiet` revision. Replaying an old event does not create a new notice.

### Option A: authenticated HTTP receiving

Run the receiver:

```sh
python notification_outbox.py serve --host 127.0.0.1 --port 8094
```

The source publisher sends `POST /v1/events` with JSON, a correct Content-Length, `X-Notification-Tenant` set to its authorized tenant, and `Authorization: Bearer` followed by that tenant's ingress secret. Receiving allows bodies up to 32,768 bytes. Keep the listener on loopback; a separate host uses the application's existing HTTPS ingress and network controls.

An HTTP 202 response means the envelope was durably classified and committed. The body identifies `recorded`, `duplicate`, `stale` or `expired`, together with the number of queued notices. The source publisher can acknowledge that event for all four outcomes. An invalid envelope receives 400; fix its source mapping. An unavailable receiver responds 503. If the publisher loses its HTTP response, it retries the exact same event ID and content.

The source job transaction and this component's SQLite transaction are separate. The source application's durable event publisher is what preserves a job transition across that boundary; enqueue the event with the job change or use the application's existing transactional event mechanism.

### Option B: same-host Python caller

Import the component in the product's existing durable event consumer:

```python
from notification_outbox import Outbox

notices = Outbox("state/notices.sqlite3", "notices.json")
result = notices.record(authenticated_tenant_id, normalized_job_event)
```

Both arguments come from that consumer's actual job event and authorized tenant context. The return value has the same classification as HTTP receiving. Reuse a stable source event ID across consumer retries.

### Operate a retained actual event

Save a normalized actual event as `job-event.json`, then inspect its message and receive it:

```sh
python notification_outbox.py render --tenant "$TASKER_TENANT_ID" --event job-event.json
python notification_outbox.py ingest --tenant "$TASKER_TENANT_ID" --event job-event.json
python notification_outbox.py status --tenant "$TASKER_TENANT_ID"
```

The render command prepares the message without sending it. The ingest command commits the event and its immutable message to SQLite. Repeating the ingest command with the same bytes resolves as a duplicate and queues zero additional messages. Reusing the ID for different content returns an error.

## Run delivery

Start the persistent worker with the same configuration, database and secret environment:

```sh
python notification_outbox.py run
```

For a supervised one-pass operation:

```sh
python notification_outbox.py deliver --limit 100
python notification_outbox.py status
```

The worker posts the exact message saved at ingest time and retains its SHA-256, event, route fingerprint, workspace/channel, attempt count and outcome. It reserves each destination for at least 1.1 seconds between posts. Slack HTTP 429 responses defer that channel until Retry-After has elapsed. Work for other channels can continue.

A normal successful incoming-webhook response is HTTP 200 with the plain body `ok`. The queue records that acknowledgement and time. The webhook response does not contain a Slack message timestamp. When support needs the message link, retrieve it from the actual channel history or the installation's Events API receiving.

The complete message is retrievable with:

```sh
python notification_outbox.py inspect "$TASKER_DELIVERY_ID"
```

This command includes the actual retained event, message, destination and delivery outcome. Its output is suitable for the customer's own operating record; it contains the short job summary and review URL.

Read the complete job history in pages, including quiet revisions and each revision's receiving outcomes:

```sh
python notification_outbox.py timeline --tenant "$TASKER_TENANT_ID" --job "$TASKER_JOB_ID"
```

When `next_before_version` is present, pass that value as `--before-version` on the following call. The history preserves every recorded revision.

## Recover an interrupted operation

The worker commits a dispatch lease before transmitting. A post that loses its response becomes `uncertain`. If the process stops while a request is active, an expired dispatch lease becomes `uncertain` on the next worker pass. Such a message stays available for reconciliation, preserving its exact body and destination.

Inspect the actual channel at the retained attempt time. When the message exists, record its actual link in the resolution note:

```sh
python notification_outbox.py resolve "$TASKER_DELIVERY_ID" sent --note "$TASKER_ACTUAL_MESSAGE_LINK"
```

When the receiving history establishes that replay is appropriate, use:

```sh
python notification_outbox.py resolve "$TASKER_DELIVERY_ID" retry --note "$TASKER_REPLAY_REASON"
python notification_outbox.py deliver
```

A deliberate cancellation uses `cancelled` with a short reason. Slack incoming webhooks cannot retract messages already posted; the product review remains the current source of job state.

|Saved state|Meaning and operating action|
|---|---|
|pending|Queued or waiting for channel timing; the worker continues it|
|dispatching|One worker currently owns the transmit lease|
|sent|Slack acknowledged the post, or an operator reconciled its actual receiving|
|uncertain|Transmitted operation needs receiving reconciliation before replay|
|route_failed|Slack rejected a route or payload; repair its installation or content|
|route_changed|The original route changed; retain it for explicit reconciliation|
|failed|A delivery needs operator repair after a terminal response or exhausted server retries|
|superseded|A newer job revision retired this queued notice|
|expired|The notice exceeded its event lifetime|
|cancelled|An operator ended this delivery with a recorded reason|

HTTP 5xx responses use a capped exponential retry schedule; eight failed server attempts require operator repair. A definitive invalid-payload, archived-channel, prohibited-action or invalid-installation response stops that route until it is corrected. Pending notices for that route remain saved while the other routes continue.

After restoring the same channel's webhook secret or correcting its installation, resume it:

```sh
python notification_outbox.py resume-route merchant-review
```

When a route changes tenant, store selection, channel, event selection or installation identity, update its configuration and increment `generation`. Older queued notices keep their original destination fingerprint. A new destination receives a new product revision through the normal event publisher.

Default event lifetime is 24 hours from the source event time. A local consumer can pass `ttl_seconds` between 60 and 604800 to `record`. Replayed expired events still advance the recorded job revision, preventing an older queued message from becoming current again.

## Operating console

The complete package includes the local operator console, with tenant/channel setup, route and event preferences, a delivery queue, explicit recovery and paginated job history. Start it alongside the existing receiver and worker:

~~~sh
python operator_server.py --database state/notices.sqlite3 --config notices.json --port 8095
~~~

Open the local link printed by the process. The console uses the same saved outbox and the same live configuration. Its separate operator token authorizes local administration; each tenant retains its own ingress credential. Follow [the complete operator guide](OPERATOR.md) for first setup, configuration changes and daily recovery.

## Operate and hand over

The deployed service consists of the complete Python source, this guide, the customer's private configuration, the SQLite database and the launching environment. Back up SQLite using its native backup API or the host's consistent database snapshot procedure. Preserve the configuration beside that backup and restore secrets through the customer's existing secret service.

The status output supplies delivery counts, recent outcomes and failed route summaries. Use the existing application monitor to surface `uncertain`, `route_failed`, `route_changed` and terminal `failed` counts. Keep job detail in TaskerArmy; Slack receives the short actionable summary.

A completed installation follows an actual job revision from its durable publisher into this queue, shows the selected notice in the installed Slack channel, follows its real review link, and reopens the saved receiving record after a worker restart. A second ingestion of the same source event leaves the message count unchanged. This operating sequence is the handover result.

## Primary contracts used

- [TaskerArmy Slack integration scope](https://taskerarmy.com/integrations/slack/)
- [TaskerArmy roadmap](https://taskerarmy.com/roadmap/)
- [TaskerArmy private API and tenant model](https://taskerarmy.com/developers/api/)
- [Slack incoming webhooks, installation and acknowledgement](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/)
- [Slack message pacing and Retry-After](https://docs.slack.dev/apis/web-api/rate-limits/)
- [Slack webhook error responses](https://docs.slack.dev/changelog/2016-05-17-changes-to-errors-for-incoming-webhooks/)
- [Slack URL-button acknowledgement behavior](https://docs.slack.dev/reference/block-kit/block-elements/button-element/)

## Complete installed workspace

The [native installation guide](native/README.md) provides complete source selection, private installation, managed operator/ingress/worker commands, source adoption, full source/SQLite handover and independent receiving. The [installed operation API](native/API.md) connects that same application to typed workspace and managed service clients. Its queue, history, configuration and recovery operations use the original application methods and saved database.
