# Tasker notification installations in Stellar Forge

The installed product includes the original Python notification outbox, tenant-routed event receiver, browser operator, complete application and SQLite archive, and independent receiving workflow. The SCF integration adds a typed local client, source-owned MCP provider, CLI and three Applications entries around that same installation.

Python 3.11 or later runs the native product. The JavaScript integration uses the installed Stellar Forge Node runtime and Node built-ins. The standalone Python application needs no additional packages.

## Prepare the complete original application

Keep the application source, installation directory and transfer directory separate. Select an owned private parent and a complete configuration file. The included configuration.empty.json is a useful starting document; configure the actual tenants, review origins and routes in the operator. It contains environment-reference names and no credential values.

Run the distributed taskerarmy command through the existing forge command runner, or run its complete CLI directly:

~~~sh
node products/taskerarmy/cli.mjs prepare \
  --application /ABSOLUTE/SELECTED_SOURCE/products/taskerarmy \
  --configuration /PRIVATE/notices.json \
  --directory /PRIVATE/tasker-installation \
  --python /ABSOLUTE/python3 \
  --request-id 3d9e3935-7c02-4fd5-86d3-2b719571a9c0

node products/taskerarmy/cli.mjs inspect \
  --directory /PRIVATE/tasker-installation \
  --python /ABSOLUTE/python3
~~~

Use the actual absolute Python executable and a newly selected UUID for your operation. Keep that UUID and complete source/configuration selection when continuing the same request. Preparation retains both the original source and editable application, the complete source manifest, selected interpreter, tenant configuration and SQLite database.

The native application and its public operation adapter are documented in README.md, OPERATOR.md, native/README.md and native/API.md. Those guides describe the actual event states, publisher mapping, route-generation rules, retry policy and uncertain-send recovery.

## Open the three original services in Applications

Select the current installed Stellar Forge runtime containing the Tasker distribution contribution. Add these entries against the same prepared installation:

| Entry | Purpose | Selection |
| --- | --- | --- |
| Tasker notification operator | Edit the original tenant/route configuration and inspect events and delivery recovery | Prepared private directory, Python, loopback operator port; 0 chooses an available port |
| Tasker event receiver | Accept authenticated source events into the original database | The same directory and environment; blank or 0 selects fixed port 8094 |
| Tasker delivery worker | Dispatch the original eligible queue and recover its retries/circuits | The same directory and environment; interval defaults to 2 seconds |

Use a different fixed ingress port for each installation. Its original GET /healthz reports readiness. Operator and ingress listen on loopback.

Select the required credential references through Applications' existing private environment JSON. Each tenant's ingress token and each enabled route's Slack webhook are supplied only to the original service environment. The operator generates a private session token unless TASKER_OPERATOR_TOKEN is selected.

Review, Save and Start retain the actual installation UUID, original source identity, current application inventory, configuration revision and Python selection. Each installation/role has one Applications resource identity, allowing all three roles to coexist. The existing managed worker launches the original Python process directly and passes its held worker lease through descriptor 3.

Each actual operator launch receives a fresh private ready-file path inside that same managed operation. Its exact argv is retained in the existing command-process record. The startup observer checks the actual child PID, complete private/public identity, selected installation paths and original Python/HTML hashes. Applications receives the authenticated browser URL through its existing private URL record. The public process announcement contains the origin and original identity.

Stop and restart each role through its saved Applications entry. The original database and source history remain in that installation. A changed source or configuration is reviewed through the current saved selection.

## Use the host-selected MCP workspace

Create a private JSON connection file, for example:

~~~json
{
  "schema": "stellar-forge.tasker-workspace-connection.v1",
  "workspaces": {
    "operations": {
      "label": "Notification operations",
      "directory": "/PRIVATE/tasker-installation",
      "sourceDirectory": "/ABSOLUTE/SELECTED_SOURCE/products/taskerarmy",
      "application": "/ABSOLUTE/SELECTED_SOURCE/products/taskerarmy",
      "python": "/ABSOLUTE/python3",
      "configurationFile": "/PRIVATE/notices.json",
      "transferDirectory": "/PRIVATE/transfers"
    }
  }
}
~~~

Set the actual absolute paths. The connection file must be owned and private (0600), with canonical source and installation paths. A new installation path is permitted below its existing private parent. transferDirectory must already be private. A receiving alias can select receiveArchive and its separate new destination. Optional binding selects an original installation_id and source_identity.

The distribution declares merchant provider tasker-workspaces, family/configuration key taskerWorkspaces, and the host configuration input taskerWorkspaceConnection. The original merchant registry discovers its metadata and loads its native implementation when configured. Its configuration reader is readTaskerWorkspaceConfiguration.

For direct use of the same configured provider:

~~~js
import {readTaskerWorkspaceConfiguration, MerchantTaskerWorkspaces}
  from './products/taskerarmy/workspace.mjs';

const taskerWorkspaces = await readTaskerWorkspaceConfiguration('/PRIVATE/tasker-connection.json');
const owner = new MerchantTaskerWorkspaces({taskerWorkspaces});
try {
  const selected = await owner.call('merchant_tasker_status', {workspace: 'operations'});
  const page = await owner.call('merchant_tasker_queue', {workspace: 'operations', limit: 100});
  console.log(selected.installation, page.result);
} finally {
  await owner.close();
}
~~~

Closing this adapter drains its pending native calls. Applications continues to own its running services.

### Complete operation surface

| MCP tools | Original operation |
| --- | --- |
| merchant_tasker_status / prepare / adopt_source | Inspect or prepare the original complete installation and adopt a selected source edition |
| merchant_tasker_snapshot / receive | Export complete original application and SQLite state, then independently receive that archive |
| merchant_tasker_configuration / save_configuration | Read the complete environment-reference configuration and save it at its exact revision |
| merchant_tasker_queue_status / queue / delivery | Read the original summary, fully paginated filtered queue and complete selected delivery |
| merchant_tasker_job_history | Follow the original tenant/job's complete version history |
| merchant_tasker_receive_event / render_event | Save or render the exact validated publisher event |
| merchant_tasker_resolve_delivery / resume_route | Apply the original operator's actual delivery decision and corrected-route recovery |
| merchant_tasker_request | Read a retained original request; select originInstallationId for a journal copied from another installation |
| merchant_tasker_commands | Describe the actual original native service argv and credential-reference presence |

Mutations use a retained UUID in the host adapter. The original operation API also accepts its documented plain request identifiers. Queue/history delivery IDs, event versions and cursors travel as exact decimal strings. A JavaScript caller must not convert those returned values to Number. Follow next_before_id and next_before_version with the same filters until null.

The queue change and named request result commit in the original SQLite transaction. Configuration saving uses the original configuration revision and writer, with the named request retaining its selected previous and target file revisions. After an interrupted result, inspect that same original request before deciding how to continue.

## Full local client and CLI

The typed TaskerInstallation client exposes every native operation, including install/receive/snapshot, configuration, queue/history, events, delivery recovery and named requests. client.d.mts retains the installation and exact-decimal result shapes.

~~~js
import {TaskerInstallation} from './products/taskerarmy/client.mjs';
const client = new TaskerInstallation({
  directory: '/PRIVATE/tasker-installation',
  sourceDirectory: '/ABSOLUTE/SELECTED_SOURCE/products/taskerarmy',
  python: '/ABSOLUTE/python3'
});
try {
  const configuration = await client.configuration();
  const page = await client.queue({limit: 100});
  console.log(configuration.result.revision, page.result.next_before_id);
} finally {
  await client.close();
}
~~~

For an exact native operation from the CLI, save its arguments as one private JSON object and use:

~~~sh
node products/taskerarmy/cli.mjs call \
  --directory /PRIVATE/tasker-installation \
  --operation jobs.history \
  --arguments /PRIVATE/history-arguments.json
~~~

history-arguments.json contains the complete selected tenant, job and optional before_version/limit. A mutation additionally uses --request-id. The CLI also exposes the original services directly; the operator requires a fresh --ready-file, ingress defaults to fixed port8094, and the worker interval defaults to2. Applications provides the shared supervision and retained launch selection.

## Complete receiving and onward export

The native archive format is TAR.GZ. It carries the complete selected original and editable application sources, configuration, original SQLite backup, manifest, snapshots, lineage and native operation journal.

~~~sh
node products/taskerarmy/cli.mjs snapshot \
  --directory /PRIVATE/tasker-installation \
  --output /PRIVATE/transfers/tasker-complete.tar.gz \
  --request-id 27e1da41-8b44-4dc2-b175-86f8ebef51d6

node products/taskerarmy/cli.mjs receive \
  --directory /PRIVATE/tasker-received \
  --archive /PRIVATE/transfers/tasker-complete.tar.gz \
  --python /ABSOLUTE/python3 \
  --request-id 95d2cc18-f615-4f1e-bce3-c73f025e4f67
~~~

Keep the complete original archive and its returned byte count, digest and native manifest. Receiving creates a new installation identity while preserving the original lineage and database. Inspect the copied operation journal with the originating installation UUID, then open the received operator, inspect the actual queue/history and export the received installation onward. The native receiving request and completed outputs govern retries.

## Installation workorder

The installed profile taskerarmy-notifications is discovered by the existing installation-workorder catalogue. It covers source publisher mapping, tenants/review origins, route generations, event states, native service operation, uncertain-delivery decisions and complete independent receiving.

Prepare that workorder from the actual existing Workshare/Installation seed and its selected bindings through installation-workorders/prepare.mjs. Keep the original scope, actual receiving requirements and selected operator/source owners with the delivered complete application.
