# Merchant fleet: setup, Applications and complete handoff

Use **Merchant fleet** in the installed **Applications** catalog to open the original managed fleet. The saved application selects an existing fleet release plan, its private manager directory and a READY Starforge runtime. Its console operates the original merchant releases, gateway, customer SDK exports, discovery and settlement delivery.

The application uses the same fleet and SF82 leases as the foreground CLI and merchant MCP. Stop the current owner before opening another interface over those directories. Closing the runtime workspace's browser tab or HTTP server leaves its original managed worker running; **Stop** acts on that selected application operation.

The source-owned entry is declared in [merchant-fleet-gateway.json](../../stellar/scf-starforge-20261009/distribution/contributions/merchant-fleet-gateway.json). The full native lifecycle remains in the [fleet guide](../../stellar/scf-starforge-20261009/merchant-fleet-gateway/RELEASE_OPERATOR.md). The [runtime workspace](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/README.md) supplies installation, original Applications request history and connection recovery.

## 1. Select the existing installation and actual merchant sources

Use a complete current Starforge runtime that contains this provider and the original fleet delivery/recovery source. Its retained runtime profile specifies Node, Linux operator tools and each selected merchant adapter. The runtime workspace requires Linux, Node 22.16 or later, Python 3.11 or later, npm and the existing `flock` command; the chosen source may require a newer Node version. This application adds no separate database, service framework, npm dependency or build step.

Inspect the installed contribution and command:

~~~sh
starforge registrations --source merchant-fleet-gateway
starforge registrations --command merchant-fleet-configure
starforge merchant-fleet-configure --help
~~~

The contribution includes the `merchant-fleet` Applications provider, the existing fleet browser asset manifest and the configuration command. An older runtime without `workspace/managed.mjs` cannot supply the new entry. Receive and review the complete current runtime through the original runtime workflow rather than copying an individual launcher into an older installation.

Two kinds of directories are involved:

| Selection | Original contents and purpose |
| --- | --- |
| Installed runtime | `runtime-install.json`, its selected profile and complete original package/source. Applications uses that installation's retained source and dependencies. |
| Runtime workspace | Registered runtime IDs, Applications settings, reviewed operations, private worker logs and observed URLs. |
| Fleet manager | Original `fleet-plan.json`, setup record, release-to-gateway links, discovery and client context. The default gateway state is its `gateway/` subdirectory. |
| Each SF82 slot store | Native release versions and selections, original customer SDKs, settlement source/outbox and destination history. |
| Configuration output | The helper's prepared application request, MCP configuration fragment and read-only source observation. Keep it separate from all the operating stores. |

Prepare the actual merchant sources with their existing native workspaces. Each source's public HTTPS origin must match its declared fleet host. Input credentials and signing secrets remain in the original host environment; source registrations carry paths and environment-variable names.

The original [bootstrap guide](../../stellar/scf-starforge-20261009/merchant-fleet-gateway/BOOTSTRAP.md) explains the supported source registrations:

| Original source selector | Selected source |
| --- | --- |
| `workspace` | An existing prepared API merchant workspace. |
| `python` and optional `pythonRoot` | The original Python merchant declaration and application root. |
| `duckdbPackage` and optional `duckdbPython` | The original prepared DuckDB data package and selected interpreter. |
| `sqlitePackage` | The original prepared SQLite merchant package; staging captures its native committed snapshot. |
| `mysqlPackage` | A prepared live MySQL/MariaDB merchant package and its host environment references. |
| `postgresPackage` | The reviewed original PostgreSQL package, including its optional exact `postgresInputManifestSha256`. |
| `clickhousePackage` | The reviewed original package, including its explicit ordered `clickhouseColumnTypes` review. |
| `s3Package` | The original S3 object merchant package. |
| `jsonrpcPackage` | The original JSON-RPC merchant package. |

Choose the source actually produced by that adapter. Original limits, runtime declarations and source-review requirements remain effective. A source path is an input selection; it does not establish that a release has been staged, started or paid for.

## 2. Bootstrap a new fleet, or keep the received one

For a new fleet, copy [bootstrap.example.json](examples/bootstrap.example.json) to the host's private input area and replace both example workspace paths and public hostnames with actual prepared merchant sources. The example contains two source aliases, two slots per tenant and explicitly separated ports. It is configuration syntax, not a supplied merchant dataset or deployment.

The original declaration supports 2–32 tenants, 2–4 common slots and 1–32 package aliases per tenant. IDs, hosts and all gateway/admin/slot ports must be distinct. The first common slot is the startup slot. Original source origins are checked before the initial release is selected.

Run the original setup:

~~~sh
starforge fleet-release setup \
  --declaration /srv/starforge/inputs/fleet-setup.json \
  --directory /srv/starforge/fleet

starforge fleet-release setup-status \
  --directory /srv/starforge/fleet
~~~

Read the actual returned `planFile`, `directory`, `planDigest`, store progress and `mcpFleet`. Setup retains its normalized intent before staging, creates the original SF82 stores, stages and selects initial releases, and publishes the ordinary fleet release plan. Its port probes are released at completion; opening the fleet later acquires the actual listeners.

An interrupted setup continues through that same declaration, directory and output plan. Inspect `setup-status`, then repeat the original setup command. Completed native releases and selections are reused through their retained identities. Changing the initial declaration is a different setup; later merchant changes belong to the existing release operator.

For a completed received fleet, use its original returned plan and manager directory directly. Do not bootstrap again. Preserve the original absolute paths when the native receiving plan binds them. [Recovery and receiving](#11-recover-and-receive-the-complete-fleet) describes that route.

## 3. Attach the existing runtime

If a runtime workspace has already registered the selected installation, use its existing directory and returned runtime ID. For a first workspace, choose a new private directory with an existing parent:

~~~sh
starforge runtime-workspace init \
  --workspace /srv/starforge/runtime-workspace \
  --runtime-home /srv/starforge/runtimes
~~~

Attach the actual installed runtime, then read its returned `runtimeId`:

~~~sh
starforge runtime-workspace attach \
  --workspace /srv/starforge/runtime-workspace \
  --runtime /srv/starforge/runtimes/merchant-fleet \
  --label "Fleet installation"

starforge runtime-workspace status \
  --workspace /srv/starforge/runtime-workspace
~~~

Attach registers that exact installation; it does not copy, reinstall or move it. Use the original ready-runtime inspection and selected adapter profile before starting merchants.

Open the runtime workspace:

~~~sh
starforge runtime-workspace serve \
  --workspace /srv/starforge/runtime-workspace
~~~

Use its complete private loopback URL on the same host. Select **Applications** and **Merchant fleet**.

## 4. Prepare complete application settings

Copy [application.example.json](examples/application.example.json) to a private input file. Replace `runtimeId` with the actual 24-character ID returned above. Select the exact runtime workspace, installed runtime, fleet plan and manager paths.

The helper's selection fields are:

| Field | Meaning |
| --- | --- |
| `runtimeWorkspace` | Existing private runtime workspace in which the installation is registered. |
| `runtimeId` | Actual registered installation ID. |
| `runtimeDirectory` | The same original installed runtime directory. |
| `label` | A display label, 1–120 characters. |
| `planFile` | Actual published `stellar-forge.fleet-release-plan.v1` plan. |
| `directory` | Its initialized original private fleet manager directory. |
| `gatewayStateDirectory` | Optional original gateway path. Omit it for `directory/gateway`. Preserve a custom path used by the original host. |
| `port` | Operator console port. `0` requests an available loopback port. An explicit port must differ from every declared gateway, admin and slot port. |
| `environmentFile` | Optional private JSON file containing the original process environment's names and string values. The helper checks its metadata and preserves its path without reading secret values. Applications performs its native environment review. |
| `applicationId`, `expectedRevision` | Both actual values are required when intentionally changing a stopped saved application. Omit both for a new entry. |
| `homeId` | Optional actual existing managed-release home ID. The original Applications workflow otherwise chooses or creates the appropriate home. |

Choose a separate private output parent and run:

~~~sh
starforge merchant-fleet-configure configure \
  --selection /srv/starforge/inputs/fleet-application.json \
  --out /srv/starforge/application-inputs/fleet-current
~~~

The helper reads the original fleet plan and SF82 stores through their native readers and checks the chosen installed source. It writes four complete JSON files plus `configuration-manifest.json`:

| Prepared file | Use |
| --- | --- |
| `application-review.json` | Exact request for native `application-review`. This contains settings, not a saved application or start approval. |
| `merchant-mcp-fleet.fragment.json` | Supported `fleet` object for an existing merchant MCP host configuration. Merge this field while preserving all other original host settings. |
| `original-fleet-selection.json` | Read-only plan, stable state identity, current native slot observations and selected launch-source hashes at preparation. |
| `selection.json` | The normalized original operator configuration. |
| `configuration-manifest.json` | Source selection digest and each prepared file's exact byte count/SHA-256. |

A complete matching directory reopens unchanged and verifies all four files. Its retained source observation remains historical; Applications reads the current native selection before starting. A partial, changed or unrelated output is preserved. Inspect it and choose a new private configuration directory when preparing a new selection.

The helper does not start the fleet, select a release, generate a customer export, execute a payment or send settlement events.

From a source checkout, the same command is:

~~~sh
node products/merchant-fleet/configure.mjs configure \
  --selection /srv/starforge/inputs/fleet-application.json \
  --out /srv/starforge/application-inputs/fleet-current
~~~

## 5. Review, save, connect, start and open

In **Applications**, select the registered runtime and **Merchant fleet**. Enter the label, original plan and manager directory, optional original gateway directory, console port and optional private environment file from the prepared selection.

Use the existing controls in order:

1. **Review** reads the original plan and stable manager/slot identities together with the runtime's selected source. Inspect the exact paths, command and source identity.
2. **Save** retains those settings and their original request ID. The original workflow also starts or resumes the runtime connection/adoption when needed.
3. **Connect** observes or continues that existing connection. Wait for the selected original release to be available.
4. **Review Start** reads the current native inputs and selected installed release again.
5. **Start** retains one original operation UUID, then opens the original managed fleet worker.
6. **Open** appears after the worker's typed startup announcement matches the reviewed plan, source, operation UUID and authenticated live console identity.

Open uses the native console's bare loopback URL. Its browser obtains the current token from its original same-origin `/api/session` route. The Applications observer checks `/api/identity` using that same session capability before recording the URL. It compares the actual process/instance identity, plan digest, manager/gateway paths and selected/executed source bytes.

A merchant ingress URL, an earlier worker's stdout line, or an unrelated listener on the same port does not establish this application's readiness. The original worker's retained state and native listener determine what can be opened.

Normal fleet work changes release generations, active/previous selections, customer exports, discovery history and settlement journals. Those remain original mutable operating records. They are not copied into the saved launch settings. A changed plan, replaced manager/slot directory or different source release needs a new native review. A received workspace with new filesystem identities is reviewed as that received selection.

## 6. Use the same workflow from the CLI

The following uses actual returned reviews and stable request files. Save each command's complete JSON output in a private file using the host's normal file handling. Names such as `APP_ID` below mean the actual returned identity, not a literal placeholder.

Review the helper's exact request:

~~~sh
starforge runtime-workspace application-review \
  --workspace /srv/starforge/runtime-workspace \
  --request /srv/starforge/application-inputs/fleet-current/application-review.json
~~~

Save its complete returned review as `/srv/starforge/application-inputs/fleet-review.json`. Then prepare a single save request:

~~~sh
starforge merchant-fleet-configure request \
  --review /srv/starforge/application-inputs/fleet-review.json \
  --out /srv/starforge/application-inputs/fleet-save-request.json

starforge runtime-workspace application-save \
  --workspace /srv/starforge/runtime-workspace \
  --request /srv/starforge/application-inputs/fleet-save-request.json
~~~

The saved response supplies the real `applicationId`, revision and connection state. Continue that connection if required:

~~~sh
starforge runtime-workspace application-connect \
  --workspace /srv/starforge/runtime-workspace \
  --application-id APP_ID

starforge runtime-workspace application-start-review \
  --workspace /srv/starforge/runtime-workspace \
  --application-id APP_ID
~~~

Retain the complete returned start review as `fleet-start-review.json`, then prepare and dispatch one start request:

~~~sh
starforge merchant-fleet-configure request \
  --review /srv/starforge/application-inputs/fleet-start-review.json \
  --out /srv/starforge/application-inputs/fleet-start-request.json

starforge runtime-workspace application-start \
  --workspace /srv/starforge/runtime-workspace \
  --request /srv/starforge/application-inputs/fleet-start-request.json
~~~

The request helper generates the UUID once and writes the complete private request. Repeating it with the same original review and request file returns those retained bytes. It never silently generates a second UUID over an existing request. For a deliberately new operation or review, select a new request file.

Inspect the actual application and operation:

~~~sh
starforge runtime-workspace applications \
  --workspace /srv/starforge/runtime-workspace

starforge runtime-workspace application-output \
  --workspace /srv/starforge/runtime-workspace \
  --application-id APP_ID --operation-id OPERATION_UUID

starforge runtime-workspace application-history \
  --workspace /srv/starforge/runtime-workspace \
  --application-id APP_ID --limit 30
~~~

Follow the actual history cursor when another page is returned. Use the exact retained operation in `application-recover` after an uncertain response or interrupted worker; do not create another start request to investigate the first one.

The native `managed` arguments displayed by Applications include source/plan identities and its operation UUID. These are generated from the original review. Ordinary direct fleet use continues to accept its existing `--releases` and `--release-state` command line.

## 7. Stage and operate a merchant release

In the fleet console, read **Managed releases** and the gateway's current revision before acting. Each tenant and slot shows its declared port, selected and running releases, original generation, instance identity and routing/drain state.

Use the existing native stages:

- Select the declared tenant, unused slot and registered package alias.
- Stage the original source with a new release ID. Inspect its exact source kind, original public origin, routes, payment requirements and dependencies.
- Compare that release with the current one. Review the replacement for the observed release generations and gateway revision.
- Apply the returned review while it remains current. The native operator starts the selected SF82 session, checks its identity and prepares/activates the original gateway mapping.
- Observe actual routing and drain state. Retire the old slot only when the original state marks it eligible.
- Use the retained original revision to review and apply a rollback. Read back the resulting gateway and release mapping.

The original operator rejects a reused review, changed release generation or changed gateway revision. After an uncertain mutation response, refresh the same native status and inspect its pending/retained mapping before deciding whether another operation is needed. The [release operator guide](../../stellar/scf-starforge-20261009/merchant-fleet-gateway/RELEASE_OPERATOR.md) retains the complete command/API contract.

Use **Operations** for the exact owned merchant instance to inspect its existing native records. A staged package, a running seller and a gateway-routed seller are distinct states. Payment and settlement outcomes remain those produced by the original merchant; the Applications entry does not infer them from startup.

## 8. Deliver the complete customer SDK

Select **Customer SDKs** beside the intended tenant/slot. Read the owned release and instance line. Enter a new export ID and choose **Generate customer SDK**. The original exporter reads that exact live instance's health, offer catalog and OpenAPI source.

Inspect the completed receipt and its public operations/payment terms. Download the complete original archive, or all of its individual files: JavaScript client, TypeScript declarations, OpenAPI document, package metadata, README and `client-export.json`. The receipt binds the release, instance, source offers and every file's size and SHA-256.

A completed export remains available after the slot stops or another release serves. Preserve tenant, slot and export ID together; the same text ID in another tenant/slot is a different export. An interrupted response is recovered by inspecting that original ID. Changed source or a new customer edition uses a new ID.

For a host-side complete receiving operation, stop the Applications owner first and open the original foreground fleet session:

~~~sh
starforge fleet-release start \
  --plan /srv/starforge/fleet/fleet-plan.json \
  --directory /srv/starforge/fleet
~~~

Inside that session, use the actual retained export:

~~~text
client-manifest catalog blue CUSTOMER_EXPORT_ID
client-download catalog blue CUSTOMER_EXPORT_ID ACTUAL_MANIFEST_SHA256 "/srv/starforge/customer-deliveries/Customer A"
~~~

The exact destination spaces are retained. The original writer creates or reopens that same download, verifies retained offsets and hashes, and publishes completion after every original payload is present. Repeat the same tenant/slot/export/manifest/destination after an interruption. Do not regenerate the SDK to resume its transfer.

The complete [customer handover guide](../../stellar/scf-starforge-20261009/merchant-fleet-gateway/CLIENT_HANDOVER.md) also covers explicitly reviewed adoption of legacy original exports and the existing MCP file reader. Customer delivery is complete only with the received files and their original manifest; generating an archive alone is a source-side state.

## 9. Discovery and settlement delivery

### Discovery

In **Discovery**, select the current serving tenant and inspect its release, slot, instance and gateway revision. Review its original enrollment, create it with that returned review, then start its existing catalog/buyer explorer. Review publication against the actual serving source and original payment requirements; apply that review and inspect the committed catalog and resource history.

Enrollment and signed history remain with the tenant across blue/green releases and rollback. A route removed by a replacement uses the original withdrawal review. A changed seller permission or payment recipient is handled by the existing enrollment/policy workflow. The [discovery guide](../../stellar/scf-starforge-20261009/merchant-fleet-gateway/DISCOVERY.md) describes the exact source-bound actions and original buyer preparation.

### Settlement delivery

In **Settlement delivery**, select the merchant and slot, then **Open destination controls**. This is the original SF98 destination application mounted in the same fleet origin.

Enroll the actual HTTPS consumer, its explicitly allowed host and signing environment-variable name. Select all retained history or only new events, with the actual route/network scope. Synchronize the original events, inspect the retained delivery rows, then deliver once or start its original worker when that operation is intended. Pause or requeue against the current native revisions.

Each slot's original store owns its source outbox and destination cursors. A retired sibling can retain pending deliveries while another slot serves traffic. The same source event is not evidence that a remote consumer has received it. Inspect the native attempt/receipt state and any journal warning; the original merchant accounting workflow resolves an actual settlement warning.

Export the original complete destination workspace when handing it to another host. Inspect its actual source fingerprint and transfer ID; receive that exact transfer through the existing `delivery-destinations` route, retaining source, cursors, destination configuration and original records. Reopening the destination and an actual resumed delivery remain separate recorded outcomes.

The [complete delivery guide](../../stellar/scf-starforge-20261009/merchant-fleet-gateway/DELIVERY.md) supplies the existing CLI/MCP commands, original retained-file transfer and receiving syntax. Secrets are provisioned through the host's existing environment mechanism on the receiver.

## 10. Use the original merchant MCP

The fleet's native MCP provider already operates its original release, customer, discovery and delivery workflows. The Applications entry gives the operator a managed browser lifecycle over those same engines.

For a new merchant MCP host configuration:

~~~sh
starforge merchant-mcp init-fleet \
  --dir /srv/starforge/merchant-mcp-fleet \
  --plan /srv/starforge/fleet/fleet-plan.json \
  --fleet-directory /srv/starforge/fleet
~~~

This initializer has no custom gateway-state CLI flag. If the original fleet uses a custom gateway state, explicitly merge the helper's supported `fleet` fragment into the original host configuration:

~~~json
{
  "fleet": {
    "planFile": "/srv/starforge/fleet/fleet-plan.json",
    "directory": "/srv/starforge/fleet",
    "gatewayStateDirectory": "/srv/starforge/gateway-state"
  }
}
~~~

Preserve all other host fields and its original private authentication/environment selection. The native [configuration reader](../../stellar-forge/mcp-merchant-operator/config.mjs) accepts exactly these fleet fields and resolves relative paths against the host configuration.

Start the existing authenticated merchant MCP transport using its original guide. Call `merchant_fleet_plan`, inspect the actual returned plan digest, then use `merchant_fleet_start` with that `expectedPlanDigest`. Keep the actual tenant/slot/release/instance identities on later requests and follow the original paged metadata/file responses.

The Applications worker, foreground release owner and MCP fleet owner must take turns over the same native lease. Closing only a browser tab is not a handoff. Stop and observe the previous owner's native drain before the other interface starts.

## 11. Recover and receive the complete fleet

A whole deployed fleet recovery uses the existing [SF101-backed fleet recovery workflow](../../stellar/scf-starforge-20261009/merchant-fleet-gateway/RECOVERY.md). The installed `merchant-fleet-recovery` command and original SF101-backed engines own the capture, restore and placement. This application neither creates an alternative recovery journal nor changes those receiving actions.

Start from the actual generated host bundle. Stop the original service and finish the selected external input writers. Inspect the source and prepare its exact recovery plan:

~~~sh
starforge merchant-fleet-recovery inspect-source \
  --bundle /srv/stellar-hosts/fleet-original

starforge merchant-fleet-recovery prepare-plan \
  --bundle /srv/stellar-hosts/fleet-original \
  --plan /srv/stellar-recovery/fleet-current/plan.json \
  --quiesced
~~~

Use the returned plan SHA and the original private passphrase environment mechanism to capture. Retain the complete encrypted bundle and exact returned snapshot/manifest identity. After transfer, the receiver authenticates and restores that same bundle, inspects its encrypted self-plan and declares the original destination parents.

The native receiver preserves original absolute paths and numeric service UID/GID, verifies retained source/deployment identities, places only its selected original files and regenerates the new host bundle through the original deployment engine. It preserves unrelated existing targets and supports the same retained receiving operation after interruption. Use the original generated runbook to reopen the received service and read its actual health.

The receiving stages have different meanings:

| Native evidence | What it establishes |
| --- | --- |
| Completed authenticated capture | The selected stopped source and encrypted bundle match the retained plan. |
| `FLEET_RESTORED` | The original encrypted manifest and restored trees verified in a separate private restore directory. |
| Original receiving review | The target parents, source, service identity, operation and new host bundle were explicitly selected. |
| `FLEET_RECEIVING_COMPLETE` | The original target placement and generated bundle passed native verification. |
| Actual native health and operating readback | The received original fleet was reopened and its retained merchant/customer/delivery state was observed. |

### Review a restored fleet in the recovery workspace

The installed **Merchant recovery** application now carries the complete
receiving workflow in its original browser, connected CLI and merchant
provider. Its [operating guide](../../stellar/scf-starforge-20261009/sf101-merchant-recovery/workspace/GUIDE.md#receive-an-original-merchant-fleet)
contains the full host setup; the [fleet adapter guide](../../stellar/scf-starforge-20261009/sf101-merchant-recovery/workspace/FLEET_ADAPTER.md)
explains the native receiving boundary.

Use the existing private recovery-host configuration and recovery workspace.
In the selected profile, declare the original encrypted bundle and completed
plaintext restore in `fleetRestores`, and the existing receiving target file
and native operation directory in `fleetTargets`. For example, these are
additional fields on an already configured profile:

~~~json
{
  "fleetRestores": [
    {
      "id": "accepted-fleet",
      "label": "Accepted original fleet restore",
      "bundleDirectory": "/private/fleet-backups/accepted",
      "restoreDirectory": "/private/fleet-restored/accepted"
    }
  ],
  "fleetTargets": [
    {
      "id": "original-host",
      "label": "Original fleet receiving host",
      "targetFile": "/private/fleet-recovery/targets.json",
      "operationDirectory": "/private/fleet-recovery/native-receiving"
    }
  ]
}
~~~

Replace these example paths and IDs with the retained original selections.
Keep the encrypted bundle within that profile's declared bundle or download
parents, the existing plaintext strictly within its restore parent, and the
operator state outside those source parents. The target file keeps the actual
captured recovery-plan digest, original destination parents and new deployment
bundle. It does not remap the fleet's captured data paths. A local profile
can use this workflow without an S3 configuration.

Run the recovery workspace under the captured nonzero Linux UID/GID with its
existing private passphrase environment. Open **Merchant recovery** through
Applications using the actual configured runtime and private paths, or start
its existing listener:

~~~sh
starforge merchant-recovery-remote workspace serve \
  --config /private/fleet-recovery/workspace.json \
  --directory /private/fleet-recovery/operator \
  --port 8481
~~~

Open the actual URL returned by that listener. The current session belongs to
this recovery workspace; it is separate from the fleet console's session.

Choose **Prepare restored merchant fleet** or **Review fleet recovery** beside
the existing restore. Select the original restore and receiving target, retain
the request ID, and confirm that the fleet and selected writers remain stopped.
A completed original remote cold restore can supply the source instead of a
host-declared `fleetRestoreId`.

**Review restored fleet** shows the authenticated snapshot, source plan and
target hashes, original service account, every root and destination, merchant
slots, active and previous releases, generation/history counts and full native
review. Review these actual returned values before choosing **Prepare restored
fleet**. The workspace's `reviewHash` binds the whole selected request; the
native `reviewSha256` binds the original receiving engine's review. Keep both
with their own meanings.

The native engine retains the receiving lease, partial placement and generated
deployment. The operator records that same result and its original completion
time. It can adopt an already completed native receiving result without
preparing the deployment again.

### Use the same request through the CLI and merchant tools

Keep the original recovery listener running. A complete private selection for
the example profile and declarations above is:

~~~json
{
  "profileId": "fleet-local",
  "action": "fleet-prepare",
  "id": "original-fleet-receiving",
  "fleetRestoreId": "accepted-fleet",
  "fleetTargetId": "original-host",
  "quiesced": true
}
~~~

Here `fleet-local` must be the selected existing profile ID. When selecting a
completed remote cold restore, replace `fleetRestoreId` with its original
`restoreId`; supply exactly one source selector.

~~~sh
starforge merchant-recovery-remote workspace review \
  --config /private/fleet-recovery/workspace.json \
  --directory /private/fleet-recovery/operator \
  --selection /private/fleet-recovery/selection.json

starforge merchant-recovery-remote workspace start \
  --config /private/fleet-recovery/workspace.json \
  --directory /private/fleet-recovery/operator \
  --selection /private/fleet-recovery/selection.json \
  --expected-review-hash ACTUAL_WORKSPACE_REVIEW_HASH

starforge merchant-recovery-remote workspace request \
  --config /private/fleet-recovery/workspace.json \
  --directory /private/fleet-recovery/operator \
  --profile fleet-local \
  --id original-fleet-receiving
~~~

Use the actual outer hash returned by `review`. After a lost response, read
this same request before continuing it. The connected `resume` command and
browser **Continue operation** preserve its original selection and native
journal. A completed request returns its retained result; cancellation can
stop a stage before preparation, while a native preparation already in progress
may finish and retain that outcome.

The original `recovery-workspaces` merchant provider offers the same eleven
status, inventory, request, review, start, resume and cancel operations. Its
private connection names the original recovery directory and configuration;
the merchant reads the listener's current instance and session. Follow
[MCP.md](../../stellar/scf-starforge-20261009/sf101-merchant-recovery/workspace/MCP.md)
for the full connection, setup, tool, typed-client and CLI contracts. The
browser and these callers use one recovery writer and one request history.

### Hand over the returned deployment and reopen

The completed outer request retains the original native `prepared` object.
Use its actual values:

| Retained result | Receiving action |
| --- | --- |
| `prepared.deploymentBundle` and `originalDeploymentBundle` | Keep the new generated host bundle beside the captured deployment history. |
| `prepared.serviceUid` and `serviceGid` | Reopen with the captured service account. |
| `prepared.runtime` | Follow the returned unit, workspace port, Node executable and installed source. |
| `prepared.roots` and `summary` | Inspect the received original paths, merchant slots and retained release state. |
| `prepared.operationId`, `reviewSha256` and `operationDirectory` | Reopen or continue the original native receiving journal. |

The recovery operator does not start the received fleet. Use the returned
deployment's existing launch/runbook and inspect its actual native health.

The original source owner's
[receiving continuation](../../stellar/scf-starforge-20261009/sf101-merchant-recovery/workspace/receiving/README.md)
can then open the complete operator over its already completed, closed native
case. It consumes that case's actual `journey.json`, encrypted/plaintext paths,
target file, service account and operation, and retains its browser, CLI,
merchant calls and cold reopen under the same case. Its executable and exact
inputs are supplied in that guide. It starts no second fleet journey. A
published continuation or installed source is not an execution receipt; retain
the original owner's returned result when that stage actually completes.

For an Applications-managed received fleet, first finish the original native receiving/placement. Attach the actual supported runtime on that host, configure the returned original plan and directory, then Review/Save/Connect/Review Start/Start as above. Re-review its new physical identities; do not transplant an earlier Applications operation's PID, private URL or saved start approval. If the generated host service is already the fleet owner, use that service's existing console or stop it before selecting Applications as the owner.

Keep the complete encrypted source, receiving receipt, original/current deployment bundles, host input declarations, environment provisioning reference and subsequent native reopen evidence together. SDK customer downloads and settlement destination transfers retain their own original identities inside that operating handoff.

## 12. Stop, reopen and resolve an interrupted response

Use **Stop** for the exact selected application operation. The original fleet cancels its owned pending captures/transfers, drains the HTTP workspace and closes discovery, destination workers, gateway and owned SF82 sessions through their native close implementations.

A failed native close can retain lease ownership. The managed launcher keeps its signal handlers and clears the failed stopping attempt so the same owner can retry the original cleanup. It removes those handlers only when close succeeds. Preserve that original operation and its output; a failure is not evidence that another owner may start.

Headless stop and recovery use the same recorded operation:

~~~sh
starforge runtime-workspace application-stop \
  --workspace /srv/starforge/runtime-workspace \
  --application-id APP_ID --operation-id OPERATION_UUID

starforge runtime-workspace application-recover \
  --workspace /srv/starforge/runtime-workspace \
  --application-id APP_ID --operation-id OPERATION_UUID
~~~

Use recovery to reconcile the original request/worker state, not as a substitute for reading why shutdown is incomplete. The native host owns process identity and lease checks. After a completed stop, Review Start prepares a new launch from current source and settings; a later start gets its own retained UUID. Existing fleet releases and customer/delivery history remain in the same stores.

| Current observation | Continue the existing work |
| --- | --- |
| Settings review rejects an old runtime | Select the complete current installed source containing the fleet Applications provider. |
| A declared console port collides | Keep original fleet ports; choose another console port or `0`, then review again. |
| Another native owner holds the fleet lease | Observe and finish that owner's original shutdown/recovery. |
| Save/start reply was lost | Read Applications/output/history and reuse the exact retained request file or original recover operation. |
| Input/source identity changed | Keep the earlier review and prepare a current review for the same intended selection. |
| Native close is incomplete | Retain the current process/lease owner, inspect its error and retry its original cleanup. |
| SDK/delivery download stopped | Continue the same native transfer ID, source digest and destination; preserve accepted bytes. |
| Received state has different physical directory identities | Review the actual received original plan/state before launching it. |

A useful final operator handoff contains the original runtime installation identity, application ID and current operation result, exact fleet plan/digest, declared stores/ports, current native release/gateway state, completed customer files and receiving receipts, delivery/discovery history and the current host/recovery runbook. Keep private configuration and credentials in their original host custody. Report which native operations actually completed and which remain prepared or pending.
