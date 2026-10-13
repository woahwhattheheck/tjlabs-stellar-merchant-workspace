# TaskerArmy installed operation API

## Transport

Run the selected complete product's native/operations.py with Python 3.11 or later. It accepts one UTF-8 JSON request through stdin, or --request /ABSOLUTE/request.json. --request - also selects stdin. The size limit is 2,097,152 bytes. Duplicate JSON keys and non-finite JSON constants are rejected.

The request schema is taskerarmy.operation-request.v1:

~~~json
{
  "schema": "taskerarmy.operation-request.v1",
  "operation": "queue.list",
  "installation": "/PRIVATE/taskerarmy-installation",
  "arguments": {"limit": 100},
  "request_id": "OPTIONAL-RETAINED-REQUEST",
  "binding": {
    "installation_id": "SELECTED-INSTALLATION-UUID",
    "source_identity": "SELECTED-64-CHARACTER-LOWERCASE-SHA256"
  }
}
~~~

Use the actual selected UUID and source identity. The binding is optional; when supplied, each supplied field must equal the selected original installation. The schema and operation are required. arguments defaults to an empty object. Undeclared request or argument fields are rejected.

request_id is required for configuration.save, events.receive, deliveries.resolve and routes.resume. It is an identifier of at most 200 ASCII characters beginning with a letter or digit and then using letters, digits, dot, underscore, colon, slash or hyphen. Native prepare/adopt/snapshot require an operation_id either in arguments or through request_id.

A successful result exits 0:

~~~json
{
  "schema": "taskerarmy.operation-result.v1",
  "ok": true,
  "operation": "queue.list",
  "request_id": null,
  "installation": {},
  "result": {},
  "replayed": false,
  "adapter_sha256": "EXACT-ENTRYPOINT-SHA256"
}
~~~

The installation summary is:

~~~text
installation_id: UUID string
operation_id: original string
source_identity: 64 lowercase hexadecimal characters
paths: {directory, application, configuration, database} — absolute strings
python: {path: absolute string, version: [major, minor, patch]}
binding: {directory: absolute string, device: decimal string, inode: decimal string}
~~~

The result field contains the original operation result described below. Installation lifecycle results also carry the complete original native records; use the stable envelope summary for the selected identity.

Errors exit 2 and use the same result schema with ok:false, operation, request_id, adapter_sha256 and error:{code,message}. They do not echo the submitted request, an environment or a traceback. The caller retains the original request and can read its existing result before deciding how to continue.

Local paths must be absolute. Selected paths and existing ancestors cannot be symbolic links. Initial installation and independent receiving select a separate private directory. Snapshot output is outside the active installation.

## Exact numeric values

Queue/history delivery IDs and job versions, delivery_id and returned next cursors are decimal strings. Input delivery_id, before_id, before_version and event.version accept a positive decimal string or a JavaScript-safe JSON integer. They are converted to the original Python integer only at the business boundary. Never coerce returned IDs or cursors through JavaScript Number.

Any other returned integer outside JavaScript's safe range is also a decimal string. Configuration version remains numeric 1. A routing generation may be an exact decimal string on input; it is validated and written as the original integer. Limits, ports, TTL and the interpreter's version tuple remain ordinary bounded numeric settings.

## Installation lifecycle

| Operation | Arguments | Result and original implementation |
| --- | --- | --- |
| installation.prepare | application, configuration, directory; optional manifest_path, python, operation_id | Complete original installation record from manage.prepare; repeating the original selection sets replayed |
| installation.inspect | none; installation required | schema taskerarmy.installation-inspection.v1, installation, configuration, configuration_sha256, application_files, database, outbox |
| installation.adopt_source | application; optional manifest_path, operation_id; installation required | Complete original source-adoption result; envelope selects the resulting installation |
| installation.snapshot | output; optional operation_id; installation required | schema taskerarmy.snapshot-result.v1, snapshot, archive, attempt; original completed-output recovery/replay |
| installation.receive | archive_path, directory; optional python | Complete original receiving result including installation and its retained archive/lineage; exact selection replay |

Prepare and receive do not require a top-level installation. Their destination is arguments.directory. The public entrypoint's native implementation performs initial materialization. Installed inspect/adopt/snapshot load native/manage.py and native/archive.py from the selected installation.

database contains schema_sha256, integrity and a complete tables array. Each table record has name, columns, rows and sha256. Original SQLite tables and the named-operation journal are included. Source and archive results carry their complete file manifests and original identifiers.

## Configuration

configuration.read takes no arguments. configuration.save takes:

~~~text
revision: exact 64-character revision returned by configuration.read
configuration: complete selected configuration document
~~~

Both return:

~~~text
configuration:
  version: 1
  product_name: string
  tenants:
    tenant-id:
      ingress_token_env: environment-reference name
      review_origins: canonical HTTPS origins
  routes: array of
    id, tenant_id, store_ids, states, team_id, channel_id, webhook_env,
    generation, enabled
revision: exact SHA256 of the selected configuration bytes
credentials:
  tenants: {tenant-id: environment-reference-present boolean}
  routes: {route-id: environment-reference-present boolean}
~~~

The configuration contains names of environment variables, not their values. The returned booleans report the reference availability observed by that operation. A completed named replay retains its original result; configuration.read obtains the current host's availability. Save the complete document you opened. Unchanged references stay unchanged; the original CAS and route-generation rules govern concurrent updates.

For a named configuration request, the same SQLite database retains the exact request and its intended previous/target revisions before the original configuration writer runs. A repeated completed request returns its retained result. A repeated prepared request continues only from its retained previous or target file revision. configuration_outcome_changed identifies a current file that matches neither selection.

## Queue status and complete listing

queue.status arguments are optional tenant and limit (1–1000, default100). It returns the original:

~~~text
counts: [{status, count}]
deliveries: recent original delivery summaries, descending by ID
route_failures: [{route_id, reason, failed_at}]
~~~

queue.list arguments:

~~~text
tenant?: original tenant ID
status?: original saved status
route_id?: original route ID
job_id?: original job ID
before_id?: exclusive descending delivery-ID cursor
limit?: integer1–1000, default100
~~~

Result:

~~~text
deliveries: [{
  id, tenant_id, route_id, event_id, job_id, version,
  channel_key, message_sha256, status, attempts,
  due_at, expires_at, created_at, updated_at,
  http_status, last_error, sent_at, resolution
}]
counts: [{status, count}] — complete matching collection, before the page cursor
total: sum of the matching counts
next_before_id: exact decimal string, or null
filters: the selected tenant/status/route_id/job_id values
~~~

All filters combine. Counts and the selected page are read in one original SQLite transaction. Continue with the same filters and returned next_before_id until it is null. A new page is a new database snapshot: concurrent worker transitions remain current, while the cursor follows stable original row IDs.

queue.get takes delivery_id and returns the original operator's safe projection of the saved delivery. It includes the saved event, exact Slack message, message hash, resolution and can_resolve flag. Private dispatch lease tokens are excluded.

## Complete job history

jobs.history takes tenant, job, optional before_version, and limit (1–1000, default100).

~~~text
job: {
  tenant_id, job_id, store_id, version, event_id, state, updated_at
} or null
events: [{
  event_id, version, state, received_at, outcome, payload_hash,
  deliveries: [{
    id, route_id, channel_key, status, attempts, http_status,
    last_error, sent_at, resolution, message_sha256
  }]
}]
next_before_version: exclusive descending decimal-string cursor, or null
~~~

The original job head is returned with every page. Each page preserves recorded revisions including quiet and stale outcomes. Continue the same original tenant/job and next_before_version through the full history.

## Original event and recovery operations

| Operation | Arguments | Result |
| --- | --- | --- |
| events.receive | tenant, event, optional ttl_seconds | Original Outbox.record result: outcome, queued and original_outcome for an original duplicate |
| events.render | tenant, event | Original Slack Block Kit payload for an actionable event |
| deliveries.resolve | delivery_id, outcome, note | delivery_id and resulting status |
| routes.resume | route_id | route_id and resumed original delivery count |

events.receive defaults ttl_seconds to86400 and accepts60–604800. The source event includes event_id, job_id, store_id, version, state, occurred_at, title, review_url and optional reason. The original worker validates the exact tenant/review-origin contract and event fields. The state vocabulary and source publisher hook are documented in the application guide.

Rendering does not save or transmit. Receiving saves through the original Outbox method. The managed original worker performs delivery.

A resolution outcome is sent, retry or cancelled. note is the operator's original resolution explanation. The original delivery must be in a recoverable state; retry keeps its original route identity. Resume requires a corrected and enabled original route.

Each named queue mutation calls the unchanged original method inside one original SQLite transaction and commits its request result with the business change. The adapter does not implement a parallel event or delivery state machine.

## Read a retained request

requests.get takes request_id and optional installation_id. The default namespace is the selected installation. The result is {request:null} when absent, or:

~~~text
request:
  installation_id, request_id, operation, request_sha256,
  request_json: exact canonical original UTF-8 request as a string
  request: decoded original request
  state: prepared or completed
  result: retained preparation or completed operation result
  created_at, completed_at, source_identity, adapter_sha256
~~~

A completed result may contain a definitive original configuration validation/CAS refusal with schema taskerarmy.operation-rejection.v1, error:{code,message}, previous_revision and target_revision. Replaying that named operation returns the same original error. Filesystem or transport uncertainty remains prepared so the exact target can still be received after an interrupted replacement.

The journal remains in the original database and survives full snapshot/receiving. A received installation has a new namespace; supply the originating installation_id to inspect that original request. Completed responses are received before later routing or configuration validation. The exact original request_json remains available for a byte-consistent replay through stdin.

## Managed command descriptions

commands.describe takes:

~~~text
roles?: distinct selection of operator, ingress, worker; defaults to all three
ready_file: required absolute private output path when operator is selected
operator_port?: 0–65535, default0
ingress_port?: 1–65535, default8094
worker_interval?: 0.1–60 seconds, default2
operator_token_env?: supported environment-reference name, default TASKER_OPERATOR_TOKEN
~~~

It returns {commands,installation}. Each command contains:

~~~text
role: operator | ingress | worker
executable: actual absolute selected Python executable
argv: complete array including that executable as argv[0]
cwd: actual installed application
script: absolute original Python source entrypoint
script_sha256: exact selected source-file SHA256
ready_file: selected private path for operator, otherwise null
health: readiness descriptor
environment_references: [{name, present}]
~~~

Original command forms:

~~~text
operator:
  PYTHON -B APP/native/launch_operator.py --directory INSTALL
  --ready-file PRIVATE_FILE --port PORT --token-env ENV_NAME

ingress:
  PYTHON -B APP/notification_outbox.py --db DB --config CONFIG
  serve --host 127.0.0.1 --port PORT

worker:
  PYTHON -B APP/notification_outbox.py --db DB --config CONFIG
  run --interval SECONDS
~~~

The operator health descriptor is {kind:"private-ready-file",path,schema:"taskerarmy.operator-process.v1"}. Ingress is {kind:"http",url:"http://127.0.0.1:PORT/healthz"}. Worker is {kind:"managed-process"}.

The original operator ready record has schema, instance_id, installation_id, operation_id, pid, started_at, origin, application, database, configuration, operator_source_sha256 and html_sha256. The private file additionally has the authenticated browser URL. Stdout announces every listed identity field and omits that URL. Neither the descriptor nor the operation result includes session tokens, webhook values or environment contents.

An existing managed supervisor owns the child and its inherited process lease. It should select one resource key per installation/role, verify exact source and child identity, consume the private operator URL in its browser observer, and close or restart the same managed service through its original lifecycle.

## Local error handling and replay

Preserve a mutation's request ID, full arguments and selected binding before dispatch. A matching completed request returns the retained result with replayed:true. Reusing the ID for another operation or request body returns request_conflict. A changed supplied installation binding returns installation_changed. Source adoption has one narrow continuation: the original prior source binding can receive that exact already-selected adoption when its operation ID, complete target source/manifest, original input path, retained prior request and full selected before/after transition all match. Its original native adoption receiver handles the completed result or a selected-pointer/result-write interruption. A different input, operation, installation or later source edition remains a binding conflict.

The adapter reports original validation and local source/database errors in one JSON result. Read requests.get after an uncertain response. The original snapshot and receiving journals own archive replay; their identities remain in the returned native records. Configuration CAS and uncertain Slack transmission require their original reconciliation paths, as described in the application and operator guides.
