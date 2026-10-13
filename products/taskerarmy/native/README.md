# Installed TaskerArmy notification workspace

This directory supplies the native installation and JSON operation interface for the complete TaskerArmy notification application. The installed worker, operator console, routing configuration and SQLite history form one application. The source selection, editable installed application and original source baseline remain available through a complete handover.

The worker's event contract, route selection, channel pacing and delivery recovery are described in [the application guide](../README.md). Tenant and connection setup, delivery inspection and job history are described in [the operator guide](../OPERATOR.md). The complete machine interface is in [API.md](API.md).

## Prepare an installation

Use Python 3.11 or later on a Linux or another POSIX host with SQLite and file locks. The application uses the Python standard library. Choose an ordinary, complete product source directory, a private routing configuration file, and a separate new private installation directory.

The supplied configuration.empty.json is an actual empty configuration accepted by the original loader. Copy it to the intended private configuration path, then configure tenants and routes through the operator or configuration.save. It contains no connection credentials.

From the selected product source:

~~~sh
python3 -B native/manage.py prepare \
  --application /SELECTED/products/taskerarmy \
  --configuration /PRIVATE/notices.json \
  --directory /PRIVATE/taskerarmy-installation \
  --operation-id YOUR-RETAINED-INSTALLATION-ID
~~~

The original preparer copies every selected source file into the original source baseline and the editable application, captures the selected configuration, initializes the original SQLite tables, and records the interpreter and directory identity. Retain the exact operation ID and source selection. Repeating that same completed selection returns its original installation.

The installation record contains its UUID, operation ID, complete source-manifest identity, selected Python executable and version, and absolute application/configuration/database paths. Directory binding includes the actual canonical path, device and inode. An installation should be received through the archive operation when moving to another directory or host.

Read the complete installed source and database inventory with:

~~~sh
python3 -B native/manage.py inspect --directory /PRIVATE/taskerarmy-installation
~~~

Inspect verifies the complete original source baseline and all original database tables. The application remains editable, while its original baseline is retained separately.

## Use the installed JSON operations

The stable entrypoint accepts one UTF-8 JSON request through stdin or an explicitly selected file:

~~~sh
python3 -B native/operations.py --request /PRIVATE/operation.json
~~~

A request has the taskerarmy.operation-request.v1 schema, a declared operation, its arguments, and the selected installation when applicable. Configuration writes, event receiving and recovery mutations require a retained request_id. The success or error response is one JSON document; the process exits 0 or 2.

For example, a saved installation can be inspected without starting any services:

~~~json
{
  "schema": "taskerarmy.operation-request.v1",
  "operation": "installation.inspect",
  "installation": "/PRIVATE/taskerarmy-installation",
  "arguments": {}
}
~~~

Use installation.prepare and installation.receive for initial materialization. All installed operations load native/manage.py, native/archive.py, notification_outbox.py and operator_server.py from that installation's selected application. The original installation lock spans source selection and the operation. Original lifecycle methods reuse that held lock; the operator and worker retain their original configuration and SQLite concurrency.

The shared application supervisor can call commands.describe and run the returned executable, argument array and working directory. No separate delivery or process queue is introduced by this adapter.

## Run the three original services

The services may run together against the same prepared installation.

| Role | Original source command | Readiness |
| --- | --- | --- |
| Operator | native/launch_operator.py | Exact private process record; original authenticated local browser |
| Ingress | notification_outbox.py serve | Loopback /healthz on the selected nonzero port |
| Worker | notification_outbox.py run | Existing managed process lifecycle and retained outbox status |

An operator descriptor requires a new, caller-selected private ready-file path. The descriptor is stable across review and launch; it never invents a new ready filename during preparation.

~~~json
{
  "schema": "taskerarmy.operation-request.v1",
  "operation": "commands.describe",
  "installation": "/PRIVATE/taskerarmy-installation",
  "arguments": {
    "roles": ["operator", "ingress", "worker"],
    "ready_file": "/PRIVATE/run/operator-ready.json",
    "operator_port": 0,
    "ingress_port": 8094,
    "worker_interval": 2,
    "operator_token_env": "TASKER_OPERATOR_TOKEN"
  }
}
~~~

The returned argv contains the executable as its first element. A process API such as Node spawn should use executable and argv.slice(1). The descriptor's working directory is the actual installed application.

The original operator launcher writes its private ready record before announcing readiness. Its public stdout contains the instance ID, installation ID, operation ID, PID, start time, origin, selected paths and exact operator/HTML hashes. The private ready file additionally contains the authenticated browser URL. It is a private process input to the browser observer; the operation adapter does not include the URL or session token in its JSON response. The descriptor supplies the ready-file path separately.

Verify the original child PID, installation identity, selected application/database/configuration, source hashes and loopback origin against the ready record before opening that browser. Stop and reopen the operator through the existing managed lifecycle; use a fresh ready file for the new process. Ingress has an explicit nonzero port because its original server does not announce a kernel-selected ephemeral port.

The environment references listed with each role are names and presence booleans. Install the actual values through the host's ordinary private environment or secret mechanism. A missing worker webhook remains an original route configuration failure; the adapter does not infer a connection from a product name or channel label.

## Configure and receive events

configuration.read returns the entire validated configuration, its exact byte revision and environment-reference availability. Edit that selected document and pass it with the same revision to configuration.save. The original writer validates the complete document, compares the current file revision, preserves unchanged references, and atomically replaces it.

A material routing change requires a higher route generation. The source tenant, store selection, Slack installation/channel, event-state selection and credential reference belong to that original route. Older queued notices retain their original route fingerprint.

Send actual product transitions to the original authenticated ingress or invoke events.receive with their original event IDs and job versions. The JSON adapter uses the same event validator and Outbox.record method. Job versions and SQLite delivery IDs use exact decimal strings at the JavaScript boundary. The adapter converts selected values into Python integers immediately before the original business method.

events.render returns the original Slack payload for an actionable source event. It does not transmit a message. The managed worker owns transmission, dispatch leases, channel spacing, retries and provider outcomes.

## Read and recover the existing queue

queue.status returns counts, current route failures and a selected recent-delivery window. queue.list traverses the complete original delivery table with a descending ID cursor and optional tenant, status, route and job filters. The returned counts and selected page come from one SQLite read snapshot.

jobs.history traverses every saved revision for the selected original tenant/job, including quiet and stale events, with each revision's retained deliveries. Follow next_before_version until null. queue.get returns the saved original event/message and operator recovery fields for an exact delivery ID.

Use deliveries.resolve to record an actual sent, retry or cancelled decision for a recoverable delivery. Use routes.resume after the original connection has been repaired. Both call the original Outbox methods; they do not bypass current fingerprints, expiry or newer job revisions.

Named mutations retain their exact request and result in the existing SQLite database. A completed request replays its original result before consulting later routing. Queue changes and their results commit in the same original transaction. A configuration request first retains the selected previous/target revisions, then calls the original configuration CAS writer. If the file replacement completes before its response, the same request receives that exact target revision and completes its retained result. A definitive validation or CAS refusal from the original configuration writer is also retained and replayed as the same error; an I/O interruption keeps the original prepared selection for receiving. requests.get exposes the original request record for recovery.

The adapter's request journal is an additional table in the same workspace database. It is not a second event or delivery queue.

## Adopt a complete source successor

Select the complete successor source directory and a new operation ID:

~~~sh
python3 -B native/manage.py adopt-source \
  --directory /PRIVATE/taskerarmy-installation \
  --application /SELECTED/complete-successor \
  --operation-id YOUR-RETAINED-SOURCE-CHANGE-ID
~~~

The original adoption operation materializes and verifies the full successor before selecting it. It retains the prior source and application lineage while preserving the current routing and SQLite state. Stop or reconcile any managed service that still runs a prior source edition, then start its reviewed successor through the same managed lifecycle. After adoption, inspect the installation and use its new source_identity in subsequent bound operation requests.

The JSON equivalent is installation.adopt_source. It invokes the actual currently installed native implementation and uses the same original adoption journal. If its reply is lost after source selection, the original bound request can receive that exact transition: the adapter verifies its complete target source, operation ID, original input path and retained before/after installation before letting the native receiver continue. This exception applies to that selected adoption only; other stale source bindings remain conflicts.

## Export the complete customer workspace

Select a new archive path outside the active installation:

~~~sh
python3 -B native/manage.py export \
  --directory /PRIVATE/taskerarmy-installation \
  --output /PRIVATE/delivery/taskerarmy-workspace.tar.gz \
  --operation-id YOUR-RETAINED-HANDOVER-ID
~~~

The archive carries the entire selected original source, the editable application, exact routing configuration, a native consistent SQLite backup, source manifest, installation/snapshot records and prior receiving/source lineage. Every table, including named operation requests, participates in the original database inspection. The archive manifest records every member's type, length and content hash.

Keep the original snapshot operation ID and output path if observation is interrupted. A completed archive is checked and received before a new snapshot attempt is materialized. Replaying a completed snapshot returns the same verified original archive.

Live environment values, dispatch leases held by another host and operator session URLs are not configuration data. The archive carries the original retained dispatch records and receiving lineage; the receiving implementation reconciles incomplete dispatch ownership using its existing journal.

## Independently receive and reopen

~~~sh
python3 -B native/manage.py receive \
  --archive /PRIVATE/delivery/taskerarmy-workspace.tar.gz \
  --directory /PRIVATE/received-taskerarmy \
  --python /SELECTED/python3
~~~

Receiving verifies the complete archive before selecting its independent installation. The received workspace has its own installation ID, interpreter and canonical paths; original source IDs, event/message bytes, configuration and request records remain retained. The original receiving journal makes the exact archive/directory/interpreter selection repeatable.

The --directory value above is the receiving container. Its retained payload and receiving journal surround the independent installation at /PRIVATE/received-taskerarmy/installation. Select installation.paths.directory from the returned native result for all installed operations and service launches. The JSON operation envelope exposes that same canonical directory. Preserve the outer /PRIVATE/received-taskerarmy path and original archive/interpreter inputs for replaying this exact receiving operation.

~~~sh
python3 -B native/manage.py inspect \
  --directory /PRIVATE/received-taskerarmy/installation
~~~

A caller that receives through a client selected on the outer directory must open its installed client on the returned installation.paths.directory before requesting queue/history, named requests, onward export or managed operator services. The original receive client keeps its outer selection for the unchanged receiving replay. If the receive reply is interrupted, repeat those original receive arguments and use the returned installation record; retain the complete original payload and existing journals.

Requests retained in a received database keep their originating installation namespace. Read one with requests.get and its original installation_id. Start a new mutation in the received installation's own namespace, while preserving source event IDs when the intended operation is replaying an original event.

Inspect the received installation, start its own operator/worker/ingress through commands.describe, and reopen the original queue, message and job history. A later handover includes its retained lineage and independently receives through the same native operation.

## Source files and provenance

The complete reusable product includes the original worker, server, browser, guides and native lifecycle/archive code, plus this JSON adapter and installation documentation. [PROVENANCE.json](PROVENANCE.json) records the complete source identities and public primary contracts. The original operator source, event validation and channel delivery implementation remain the authoritative business behavior.

Customer configuration, live credentials, actual event data, private commissioning selections and case outputs belong to their selected private installations and handovers.
