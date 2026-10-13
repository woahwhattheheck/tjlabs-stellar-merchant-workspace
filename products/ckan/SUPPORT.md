# CKAN operations and merchant Support

The CKAN merchant includes the original Support console, incident watcher,
merchant case store, portable handoff and MCP Support tools. An operator can
review a saved catalogue project, monitor its source and publication workflow,
and carry an incident with its complete original files into a customer case.

The Support source is the existing private CKAN workbench. Its original capture,
reviewed refresh, publisher and customer receiving operations remain available
through the same CKAN application described in [Operating](OPERATING.md).
Support reads that workbench and retains the selected records in its own
original incident store.

## Install the complete product

Build the `ckan-merchant` selection from one immutable source revision using the
existing distribution builder and install its returned package as described in
[Operating](OPERATING.md). The recipe composes the original CKAN merchant and
Merchant Support selections. It includes the Support application, case and
incident commands, commercial/implementation workflow, accounting dependencies
and their source-owned MCP providers.

Use Node 24 on Linux with `flock`. Run the console as the operating-system
user that owns the private project and incident stores. Retain source packages,
live workspaces and exported customer handoffs in their own selected locations.

## Review the project and initialize its watcher

A reviewed CKAN registration pins the catalogue origin, project creation time,
selected source/refresh/publication IDs and observation limits. Start with the
actual saved project. The following uses the original APIs from the product
root; replace the two paths before running it.

~~~js
import {writeFile} from 'node:fs/promises';
import {reviewCkanSource} from './stellar/scf-starforge-20261009/sf93-seller-support-bundle/ckan-source.mjs';
import {initializeIncidentStore} from './stellar/scf-starforge-20261009/sf93-seller-support-bundle/incident-store.mjs';

const reviewed = await reviewCkanSource({
  directory: '/absolute/private/ckan-project',
  requirePublication: true
});
console.log(JSON.stringify(reviewed, null, 2));

const configuration = {
  schema: 'stellar-forge.seller-watch-config.v1',
  pollMs: 10000,
  failurePolls: 2,
  recoveryPolls: 2,
  merchants: [{
    id: 'catalogue-source',
    label: 'Catalogue publication',
    ckan: reviewed.ckan
  }],
  notification: null
};
await initializeIncidentStore({
  directory: '/absolute/private/ckan-incidents',
  config: configuration
});
~~~

The incident directory is created once; its parent must already be a private
directory owned by the operator. For an existing incident store, use its
current configuration revision and the existing configure operation. Preserve
the other registered merchants and the selected notification destination.

A new project with no source is a valid observed workbench. For a selected
original workflow, provide its actual `sourceId`, `refreshId` and/or
`publicationId` to the review API. A related accepted refresh supplies the
effective successor source. The review rejects unrelated record selections.

## Open the original browser workflow

Create an operator-owned mode `0600` source file. Its named workspaces connect
the private server configuration to the browser's source choices:

~~~json
{
  "schema": "stellar-forge.support-incident-sources.v1",
  "sources": [{
    "id": "catalogue-operations",
    "label": "Catalogue operations",
    "directory": "/absolute/private/ckan-incidents",
    "ckanWorkspaces": [{
      "id": "published-catalogue",
      "label": "Published catalogue",
      "directory": "/absolute/private/ckan-project"
    }]
  }]
}
~~~

Start the installed original Support command:

~~~sh
starforge support-console \
  --incident-sources /absolute/private/incident-sources.json \
  --cases-dir /absolute/private/merchant-cases \
  --port 8784
~~~

Open the printed loopback URL and select **Catalogue operations**. In **Watcher
registration and notification settings**, choose **Published catalogue**,
inspect its saved source, review the returned selection and limits, add it to
the configuration draft and apply the displayed revision.

**Start watcher here** runs the original SF93 watcher for that configuration.
**Stop this watcher** drains the process owned by this console. The worker
panel shows the original saved process and actual console ownership. Existing
external watchers continue to use their own original process lease.

The same command can be selected in the existing Applications workspace.
Keep its configured source file and cases directory in the application
arguments. The managed application binds the named CKAN selections into the
existing startup identity, so changing a private workspace selection requires
reviewing that application's updated launch configuration.

## Understand the observation

Each poll reads the workbench before and after the complete selected file set.
The original source, refresh and dataset/package readers check their own
formats and byte identities. The observation includes the selected editions,
original DataStore pages and metadata, complete refresh changes and index,
saved decision, original candidate and publication, and retained merchant
package files.

The live incident and Runtime support views show the recorded source, refresh,
publication, pending ages and original JSON documents. Large numeric values
retain their original JSON tokens in browser delivery and exported HTML.
The handoff also keeps every original file as complete encoded bytes.

| Condition | What the original watcher observes |
| --- | --- |
| `CKAN_SOURCE_UNAVAILABLE` | A registered private project or required retained file cannot be read completely. |
| `CKAN_IDENTITY_CHANGED` | The saved workbench conflicts with its reviewed project or selection. |
| `CKAN_SOURCE_INTEGRITY` | A source, comparison, decision, candidate or package fails its original consistency checks. |
| `CKAN_OPERATION_FAILED` | The saved original operation reports failure. |
| `CKAN_OPERATION_OVERDUE` | A saved running operation exceeds the reviewed age threshold. |
| `CKAN_REVIEW_PENDING` | An original refresh remains ready for review beyond its selected threshold. |
| `CKAN_PUBLICATION_PENDING` | The effective reviewed source lacks its required completed publication beyond the selected threshold. |

Failure and recovery follow the incident store's existing configured poll
counts. Recovery requires fresh complete observations. The saved operation
record and its age remain visible alongside their original timestamps.
An intentional source withdrawal is retained as the original decision.

The default observation reads at most 4 MiB of selected retained files, 256
files and 2 MiB for each workbench read. The browser and MCP review allow the
original supported limits to be selected explicitly. A workload limit produces
an incomplete observation; source bytes are kept whole. See
[CKAN monitoring](../../stellar/scf-starforge-20261009/sf93-seller-support-bundle/CKAN_MONITORING.md)
for every threshold, range and original validator.

A refresh comparison describes its own selected query windows. Review its
original scope and interpretation when assessing added or missing rows. The
Support comparison carries those records forward with their original source
identities.

## Carry the incident into a customer case

Open the incident, acknowledge the work through its current revision, and
select the original registered route. The existing **Prepare case** workflow
attaches the before and after captures to the current merchant workspace.

Complete the ordinary case fields and save the case. Its Runtime support view
shows the catalogue project, effective source, refresh decision and publication
records, along with the complete original file inventory. The existing export
produces a portable handoff JSON and readable HTML.

Receive that handoff in another original Support workspace. The receiving case
validates the source hashes and reopens the retained records without requiring
the old project directory. Its saved scope remains the operator-selected case
scope. Original input windows and publication identities remain in the
attached source.

For manual attachment, select **CKAN workbench** and supply exactly:

- `ckan-observation.json`
- `ckan-workbench.json`
- `ckan-files.json`

Keep the three files from one original capture together. Each complete file
has an 8 MiB upload limit. The normal case and handoff size checks apply to the
actual encoded wrapper.

## Use the same operation through MCP

`merchant_support_incident_sources` lists the configured source IDs and named
CKAN choices. Inspect the original current profile/configuration, then call:

~~~json
{
  "incidentSource": "catalogue-operations",
  "ckanSourceId": "published-catalogue",
  "expectedConfigRevision": 1
}
~~~

Pass that object to `merchant_support_ckan_inspect`, replacing revision 1 with
the actual observed revision. The result carries the reviewed `ckan`
registration, complete operational summary and an opaque `originalJson`
document for lossless display. Optional source, refresh and publication IDs and
the supported read limits use the same names as the browser review.

Configuration, watcher control, acknowledgments, notifications and case handoff
continue through the existing Support tools and their original revisions.
Notification delivery uses the destination already selected in the private
watcher configuration.

Configure a private `recoveryDirectory` on the original incident source to use
its complete snapshot and receiving operations. The merchant catalog exposes
`merchant_support_recovery` and the snapshot, inspect, receive, open,
reconcile and abandon tools. Retain the original workspace identity, operation
names and exact manifest hashes. Opening a received store returns its stable
source ID for the ordinary incident, CKAN and case tools. See the complete
[merchant recovery workflow](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/RECOVERY_MCP.md)
for the host configuration and original notification reconciliation.

## Receive a complete archive and exercise Support

`support-receiving.mjs` is a complete native receiving programme. It uses an
existing original `.ckanw` archive and its SHA-256, creates a new private
receiving directory, starts the original watcher, attaches its source to the
original CaseStore and reopens the complete exported handoff in a second
CaseStore.

Prepare a request with the real archive, its hash and the case inputs you
selected for that original source. The directory must be new. A minimal request
has this shape:

~~~json
{
  "schema": "stellar-forge.ckan-support-receiving-request.v1",
  "operationId": "catalogue-support-receiving",
  "archive": "/absolute/private/publisher-workspace.ckanw",
  "archiveSha256": "REPLACE_WITH_THE_ORIGINAL_64_CHARACTER_SHA256",
  "directory": "/absolute/private/received-catalogue-support",
  "inputs": {
    "resource": "REPLACE_WITH_THE_ORIGINAL_SELECTED_RESOURCE",
    "catalog": "REPLACE_WITH_THE_ORIGINAL_CATALOGUE",
    "origin": "REPLACE_WITH_THE_SELECTED_ORIGIN",
    "network": "",
    "payTo": "",
    "method": "GET",
    "credentialed": false
  },
  "exerciseAvailability": true
}
~~~

Use original values for `sourceId`, `refreshId`, `publicationId` and
`expectedRows` when selecting a particular published workflow. Empty
network/payTo fields are suitable for a source-review case; use the actual
merchant terms when mapping the capture to a merchant endpoint.

~~~sh
node products/ckan/support-receiving.mjs \
  /absolute/private/ckan-support-request.json
~~~

With `exerciseAvailability: true`, the programme temporarily moves only its
newly received copy to an adjacent private directory. The original watcher
observes that real source outage, opens an incident, records the programme's
acknowledgment, and observes recovery after that same copy is restored. The
original archive stays at its selected input path. On a programme error, the
owned watcher is drained and the received copy is restored.

With the option omitted or false, the programme carries two complete original
observations through the same case receiving path.

The programme then opens the original merchant MCP operator against the received
project and incident store. It verifies that all seven recovery operations are
in the configured catalog, creates and inspects a complete snapshot, receives
that original store, and reviews its queue and configuration through the
existing reconciliation action. It replays the same receiving request after
that receiver edit, closes and reopens the actual MCP owner, and selects the
same recovered source. Its named CKAN workspace remains inspectable. When the
availability exercise produced an incident, the ordinary MCP case operation
creates another case with the same complete workspace and capture bytes.

The Support comparison reports incomplete source coverage when the before
observation records the temporary outage. The missing project observation does
not establish an identity change; observed contradictory identities continue
to report their original identity condition.

The final directory includes the received project, original incident store,
both case stores, complete capture files, portable handoff JSON/HTML, merchant
workspace, Runtime support, original recovery snapshots and received stores,
MCP host configuration, native phase results and a file inventory. The
final phase compares the original workbench hash with its initial received
state. Retain this complete directory and its original source edition when
handing operation to another seat.
