# Author request collections and repeat them by period

Use **Request plans** in the existing Collections workspace to choose saved merchant offers, configure several requests together, and prepare a separate collection for each reporting period.

A plan retains the request definitions and parameter names. A saved revision is immutable. A period binds one revision to concrete values, source files, operator settings and a collection reference. Its reviewed requests enter the original collection, inbox, payment approval and delivery workflow.

## Open the existing Collections workspace

Use the complete installed toolkit on Linux with Node 22 or newer and the existing `flock` command. Keep the inbox, operator workspaces and collection state in private persistent directories outside the software installation.

For a new inbox and collection store:

```sh
starforge inbox init --root /srv/operator/buyer-inbox

starforge buyer-collections serve \
  --directory /srv/operator/request-collections \
  --queue-root /srv/operator/buyer-inbox \
  --port 8474
```

Open the complete private URL printed by the command. An existing collection store remembers its original inbox; reopen it with its existing directory. The [Collections guide](README.md) covers the original browser and terminal operation, and the [buyer guide](../README.md) covers complete operator preparation and saved discovery inputs.

Choose **Request plans** in the sidebar. The plan library lists saved revisions with their request counts and save times. **Open plan** opens the selected revision. **Refresh plans** updates the library and saved period list.

## Add catalog and body files from this device

**Saved inputs** in the request-plan library retains actual files in this Collections workspace. Use it when a saved provider catalog or request body is on your phone or desktop rather than at an existing server path. Existing absolute file paths continue to work.

Choose the input kind, select the actual local file, and review its name before uploading. A catalog may contain up to 1 MiB; a request body may contain up to 16 MiB. These are the same limits used by the original catalog and request-body readers. Body files preserve all original bytes, including a zero-byte body. Catalogs must contain an original supported discovery envelope and pass the existing catalog inspector before they become ready.

Uploads use 1 MiB binary chunks, with a shorter final chunk. The workspace retains a manifest with the file kind, name, byte length and ordered chunk hashes. A repeated upload of the same file and name resumes that manifest and skips chunks already present. If the connection ends, reopen **Saved inputs**, inspect its progress, and select the same local file to resume. Selecting different bytes or a different name creates a separate input identity. An interrupted upload cannot be chosen as a request source.

Search and page through the saved input library to inspect retained inputs, original catalog rows and upload progress. A ready input can be downloaded as its original file. The browser checks the download against the retained chunk hashes before exposing the saved file. The server checks the complete retained file through a held descriptor before streaming it.

In a request editor, use **Choose catalog** to select a ready catalog or **Upload from this device** to add one. Choosing it writes the retained server path into the existing request field and clears the old offer and payment selection. Choose the actual row and advertised terms again from that catalog. The original operator, request headers and body selection remain explicit. The equivalent body controls write the ready body's path into the original request-body field. A file choice edits the current plan; save a revision when the complete request definition is ready.

The library stores immutable inputs under the collection directory's private `authoring/local-inputs` subtree. An upload becomes ready only after all its chunk hashes, assembled file and, for catalogs, original discovery structure have been checked. The ready file remains stable when the original file on your device is moved or removed. Completed chunks are removed after the full ready source and its metadata are durable, so they do not double the size of a completed backup.

Saved input files and partial uploads travel with the original full-root encrypted Collections recovery. The existing recovery process still needs its original operator configuration and state-root containment; uploading a file alone does not provision an operator or create a collection. A saved period retains its own source capture through the original authoring flow, so ready-input selection, plan revision, period preparation, collection creation and execution retain their existing identities.

A retained input represents exact bytes. To change a reporting period's request body or catalog, upload the actual new file, select it in the plan, and save another revision before preparing that period. Editing a URL parameter does not rewrite a retained body.

### Local input commands

Import directly from an existing file on the Linux host:

```sh
starforge buyer-collection-plans input-import \
  --directory /srv/operator/request-collections \
  --kind catalog \
  --file /srv/operator/downloads/provider-catalog.json

starforge buyer-collection-plans input-import \
  --directory /srv/operator/request-collections \
  --kind body \
  --file /srv/operator/downloads/monthly-request.json \
  --name monthly-request.json

starforge buyer-collection-plans input-list \
  --directory /srv/operator/request-collections \
  --kind body --query monthly --offset 0 --limit 25
```

The complete import result has `phase: "READY"` and an `input` object. Use its `path` as the request's `discoveryFile` or `bodyFile`. Its `id` is the upload identity; its `sha256` is the digest of the actual whole source file. Repeating `input-import` uses the existing manifest and retained chunks. The command reads one held regular file in bounded chunks, rechecks its identity before completion, and returns metadata without printing file contents.

Inspect a retained input, ask for its original file descriptor, or inspect a catalog by the exact returned identity:

```sh
starforge buyer-collection-plans input-show \
  --directory /srv/operator/request-collections --input INPUT_SHA256

starforge buyer-collection-plans input-file \
  --directory /srv/operator/request-collections --input INPUT_SHA256

starforge buyer-collection-plans input-catalog \
  --directory /srv/operator/request-collections --input INPUT_SHA256
```

Replace `INPUT_SHA256` with the 64-character input ID returned by import or list. `input-file` returns the retained original file's path, download name, byte length and digest; it does not copy or print its body. `input-catalog` returns the same actual rows and accepted terms as the original catalog inspector.

### Input API and client

The existing authenticated listener exposes these fixed routes:

| Method and route | Request | Result |
| --- | --- | --- |
| `GET /api/composer/inputs` | none | First page of saved inputs |
| `POST /api/composer/inputs/list` | Optional `kind, query, offset, limit` | Filtered page with total and limits |
| `POST /api/composer/inputs` | `{manifest}` | Start or resume the exact input |
| `GET /api/composer/inputs/:id` | none | Manifest, complete chunk indexes and ready metadata |
| `POST /api/composer/inputs/:id/chunks/:index` | Raw `application/octet-stream` | Compact chunk receipt |
| `POST /api/composer/inputs/:id/complete` | `{}` | Verified ready status |
| `GET /api/composer/inputs/:id/catalog` | none | Original saved catalog view |
| `GET /api/composer/inputs/:id/file` | none | Original file bytes |

The HTTP client's `inputs` methods are `begin, list, inspect, receiveChunk, complete, catalog, downloadFile`. Each accepts the existing optional `{signal}`; the download returns a streaming fetch response. `receiveChunk` takes `{uploadId,index,source}`, where source is a bounded `Uint8Array`, `ArrayBuffer` or `Blob`. It sends binary data directly through the same private origin and session.

For custom uploaders, use the exported `input-format.mjs` constants and `validateInputManifest`. Hash the UTF-8 bytes of `inputManifestJson(manifest)` to obtain the upload ID. Hash each original source chunk separately and validate every returned chunk receipt against the expected input, index, length and hash. Reopen status to resume, then call `complete`. A returned ready input is usable by the original plan model and editor.

## Build a reusable request plan

Choose **New request plan** and enter a name. The workspace suggests a plan reference from the name; retain that reference when saving another revision of the same plan. Add a short description that explains the business task or expected delivery.

For each request:

1. Enter a useful request name, such as the report or source it will deliver.
2. Choose a ready catalog from **Saved inputs**, upload it from this device, or enter the absolute path of an existing saved catalog file and choose **Read saved catalog**.
3. Search the returned offers and select the actual resource. The selected offer supplies its saved row, URL and method.
4. Select the advertised payment terms. Open **Selected payment terms** to inspect the original network, asset, recipient and advertised maximum.
5. Review the concrete request URL and method.
6. Select an existing operator workspace or operator configuration file. Its account, signer settings and spending limits remain attached to the request.
7. Choose the response destination and, when required, the actual request body file.
8. Use **Request references and optional headers** for a stable request reference, existing row and terms indexes, headers, or an access ticket.

Use **Add request**, **Duplicate**, **Move up**, **Move down** and **Remove** to assemble the full ordered set. The request list can be searched by name, reference or URL. A plan can contain up to 500 requests.

Each request reference must be distinct within the plan. A period derives a stable original intent from its collection reference and request reference. Keep those references when resuming the same period.

The catalog inspector reads the file you selected. Changing the catalog path clears its prior offer view. The period preparation reads and validates the selected sources again against the saved plan and operator settings.

### Period parameters

Open **Period parameters** to declare the values that change between editions. Each parameter has a name, optional display label and optional default.

For example, a parameter named `month` can select:

```text
/srv/operator/catalogs/{{month}}/discovery.json
/srv/operator/inputs/{{month}}/request.json
/srv/operator/results/{{month}}/report.json
https://merchant.example/report?month={{month}}
```

These paths and URL demonstrate the substitution format. Choose your actual saved source files, resource and operator before preparing a period.

File substitutions are single path segments. URL substitutions are limited to query values and are percent-encoded during preparation. Operator bindings stay fixed in the plan. A request body comes from the real selected body file for that period.

A default value lets the catalog inspector resolve a parameterized catalog path while editing the plan. Each period has its own explicit parameter form, populated with the declared defaults. Preparation rejects missing or unexpected values.

### Save, revise, import and export

Choose **Save plan revision** after completing the request definitions. Every save retains the exact normalized plan and its SHA-256 revision. Saving an identical definition reuses its same content revision.

The library preserves previous revisions. Choose the intended saved revision before preparing a new period. Unsaved edits remain in the current form until saved or discarded.

**Import plan JSON** opens an exported plan definition in the editor. Review its actual source paths and operator bindings, then save it as a revision in the current workspace. To carry the actual source inputs into an independent buyer's workspace, use the shared-plan workflow below.

**Download saved plan** exports the selected saved definition. It includes the parameter declarations and complete request configuration for every member.

## Share a prepared plan with another buyer

A prepared period can become a portable `.request-plan.jsonl` file. It carries the complete saved plan, the actual retained catalog and request-body inputs, and the original source and period references. Each independent buyer selects its own operator workspaces, access inputs and delivery destination for the adopted revision.

### Export the selected source edition

Open the original **Saved periods** record and choose **Share plan and inputs**. The export uses the selected period's exact prepared edition.

Review the included request list and header choices. Representation headers such as content type and accepted language travel with the request. Select any other noncredential custom header values that the recipient should use. Access tickets and credential headers are represented as local-input requirements.

Choose **Create and download shared plan**. Retain the resulting file with its package identity. The download contains the catalog and body bytes used by that source edition, so choose the prepared period that represents the work being shared.

### Receive and adopt

In the recipient's existing Collections workspace:

1. Open **Request plans**, then **Shared plans**.
2. Choose **Receive shared plan** and select the complete downloaded file.
3. Inspect its original plan, source period, requests, input sizes and operator groups.
4. Choose **Adopt plan** and enter the recipient's plan reference, name and description.
5. For every original operator group, select an existing local operator workspace or local operator configuration file. One group binding applies to all requests in that group.
6. Choose the absolute output directory, delivery parameter name and initial delivery value.
7. Supply each required local access-ticket file. For a header marked as local, enter the recipient's value or explicitly choose to omit that header.
8. Choose **Review local plan**. Inspect the complete request list, local operator configuration, selected payment terms, access-ticket metadata and response destinations.
9. Choose **Save adopted revision**. The original editor opens the newly saved plan.

The review reads the recipient's real local inputs and existing operator settings. Saving checks that the reviewed inputs still match. The adoption record retains the original package and source mapping alongside the new immutable plan revision.

Continue with **New period** and **Prepare and review period**. Give the recipient's period its own collection reference, inspect the original spending preview, and use **Create reviewed collection**. The original collection controls handle queueing, payment approval, running, delivery and recovery.

### Resume and use another period

If receiving is interrupted, choose the same package file again. The workspace resumes its retained object chunks and verifies the complete input objects before marking the package ready. The shared plan remains listed with its original package identity.

The adopted plan retains the sender's URL query parameters and uses the source edition's values as their initial defaults. Catalog and request-body paths resolve to the complete retained package inputs. The delivery parameter produces distinct destinations of the form:

```text
/srv/recipient/results/{{delivery}}--request-key.response
```

Use a new delivery value for another set of outputs. Select the actual query values required for the next business period. If the business request requires a different body or catalog edition, select those real source files in the original editor and save a new plan revision before preparing that period.

Open an existing adopted period to resume its original collection. Use the saved adoption's source references to trace a request back to the sender's source collection and request key.

## Prepare and review a period

Open **New period**, then choose **Set up period**.

Enter a descriptive period name and a collection reference. The workspace suggests a reference based on the plan and current month. Use a fresh reference for a different reporting period; retain the same reference when continuing a preparation whose response was interrupted.

Enter the declared period values and choose **Prepare and review period**. Preparation:

- Resolves the selected saved plan revision and period values.
- Reads the actual discovery, request-body and ticket inputs.
- Joins each request with its existing operator configuration.
- Uses the original buyer preparation function to produce the request configurations.
- Obtains the original collection preview from those retained configuration files.
- Saves the period's preparation and its exact source references.

Review **Included requests**, their resource URLs, methods, response destinations and maximums. The spending table keeps separate groups for each network, payment flow, asset and recipient. Maximums remain integer strings in the original asset's atomic units.

Choose **Create reviewed collection** when the complete preview matches the intended work. Creation carries the inspected edition and preview revisions into the original collection controller.

The browser opens the resulting collection. If the plan selected operator workspaces, their exact per-request mapping is supplied to the existing run controls. For a plan using standalone operator configuration files, use the original run workflow's appropriate operator workspace or configured host environment.

## Run and receive the original requests

In the saved collection, choose **Queue retained requests**, inspect the original request states, and select the requests to run.

**Run selected here** opens the existing payment review for each selected request. The original operator supplies the signer, spending ledger, transport and payment behavior. The existing terminal command remains available in the same collection screen.

Use the original collection controls to pause a run, recover an interrupted attempt, cancel queued requests and download completed responses. **Export results** retains the collection's result index and original delivery references.

See [Customer request collections](README.md), [Browser operation](WORKSPACE.md) and [Operating recovery](RECOVERY.md) for the complete original execution and receiving flow.

## Reopen the same period or start the next one

**Saved periods** lists the retained preparations for the selected plan. Open a period to inspect its original plan revision, parameter values, request inputs and collection state.

| Displayed state | Action |
| --- | --- |
| Preparing requests | Use **Continue original preparation** with the same saved period. |
| Ready to review | Inspect the complete original spending preview, then create the collection. |
| Collection created | Use **Open collection** to continue its existing queue, payment and delivery workflow. |
| Inputs need attention | Inspect the saved request references, resolve the actual source or operator issue, and refresh the same period. |

If the connection drops after preparation or creation, keep the collection reference and reopen **Saved periods**. **Refresh status** reads that original record. Continuing the same plan revision, values and collection reference preserves its original intents. If the original collection was only partially created, **Complete reviewed collection** finishes that same saved collection's retained inputs.

A different plan revision or parameter set belongs to a new period reference. The server reports a conflict when an existing reference is reused for different inputs.

For the next month or quarter, open the intended saved plan revision and choose **Prepare another period**. Supply that period's actual saved source and body files, choose distinct response destinations, and review its fresh original collection preview.

## Source retention and backup

A saved plan contains the definitions needed to author later periods. Keep the referenced discovery inputs and operator workspaces available for the period you intend to prepare.

A prepared period retains its materialized request configurations and the discovery, body and ticket inputs selected for that preparation under the collection store's authoring directory. Its record identifies the original operator dependencies. Signer custody and the live spending ledger remain with the existing operator.

Use the original complete encrypted backup and receiving workflow for prepared periods and created collections. **Backup and receiving** includes the authoring subtree together with the collection store. Recovery discovers completed authoring captures and feeds their verified request configurations into the existing operator and dependency capture. This includes the original operator workspaces needed by a prepared period before its collection is created, alongside the dependencies of created collections and queued requests.

Use the [complete recovery guide](RECOVERY.md) to capture, transfer and reopen the customer operation, including its operator state and saved deliveries. Use a shared-plan package when an independent buyer will adopt the source inputs with its own operator. Use the native encrypted backup when transferring the complete existing operating workspace.

After receiving an existing collection store through the original recovery screen, reconnect to the same private server and open **Request plans**. The authoring view binds to the recovered collection directory.

## Private workspace API

The authoring routes use the same private session, host checks and original collection store as the existing browser.

| Method and route | Input | Result |
| --- | --- | --- |
| `GET /api/composer/plans` | — | All saved revision summaries, newest first |
| `POST /api/composer/plans` | `{plan}` | Saved full plan, reference, revision and save time |
| `GET /api/composer/plans/:id/:sha` | — | The exact saved plan revision |
| `POST /api/composer/catalog` | `{path}` | Original saved catalog rows and accepted terms |
| `GET /api/composer/editions` | — | Saved period summaries |
| `POST /api/composer/editions/prepare` | Plan reference/revision, collection reference, name and values | Saved period and original collection preview |
| `GET /api/composer/editions/:id` | — | Current saved period and source references |
| `POST /api/composer/editions/:id/create` | Expected edition and preview revisions | The same period with its original created collection |

A plan uses schema `stellar-forge.sf88.collection-plan.v1`. Its top-level fields are `id`, `name`, optional `description`, `parameters` and `requests`.

Every request contains `key`, `name`, `discoveryFile`, `rowIndex`, `acceptIndex`, `url`, `method`, and exactly one of `operatorWorkspace` or `operatorConfigFile`. Optional fields are `bodyFile`, `headers`, `ticketFile`, `ticketHeader` and `responseOut`.

Each period identifies its exact `planId`, `planSha256`, `collectionId`, `values`, `editionSha256` and current `phase`. Its request list supplies the retained configuration and source paths; `workspaceByIntent` carries original operator workspace mappings. The original collection preview and created collection remain available as their native objects.

### Shared-plan API

These routes use the same private session and original authoring store. Package references are lowercase SHA-256 values.

| Method and route | Input | Result |
| --- | --- | --- |
| `GET /api/composer/sharing/packages` | — | Received/exported package summaries and progress |
| `POST /api/composer/sharing/export` | `collectionId`, `expectedEditionSha256`, optional `headerSelections` | Complete source package file descriptor and manifest |
| `POST /api/composer/sharing/packages` | `{manifest}` | Retained manifest and resumable object status |
| `GET /api/composer/sharing/packages/:sha` | — | Full original manifest and current object status |
| `POST /api/composer/sharing/packages/:sha/chunks` | `objectSha256`, `offset`, `base64` | Compact receipt for that object's saved bytes |
| `POST /api/composer/sharing/packages/:sha/complete` | `{}` | Verified complete package and original manifest |
| `POST /api/composer/sharing/packages/:sha/file` | `{}` | Prepare/reopen a complete portable file from a received package |
| `GET /api/composer/sharing/packages/:sha/file` | — | Authenticated download of the prepared portable file |
| `POST /api/composer/sharing/packages/:sha/review` | Recipient plan, operator/request bindings and output selection | Complete local review and `reviewSha256` |
| `POST /api/composer/sharing/packages/:sha/adopt` | Same selection plus `expectedReviewSha256` | Original saved plan revision and full adoption record |

The package contains one manifest record, ordered object chunk records, and a completion record. Each raw chunk is at most 64 KiB; the final chunk of an object can be smaller. A package allows up to 128 MiB of unique source objects and a 16 MiB manifest. The shared `parsePlanPackage` function in `collection-composer/package-format.mjs` checks framing, identities and chunk order. Exhaust the parser before calling completion. The receiver verifies the original object hashes before the package becomes ready.

The typed client exposes these operations through `client.sharing`. Its `downloadPackage` method returns the authenticated fetch response for streaming. `packageFile` returns the descriptor needed to prepare a downloaded copy of a previously received package.

## Command-line authoring

The complete installed toolkit includes `buyer-collection-plans`. It opens an existing collection store and uses the same retained plan and period records as the browser.

Save a complete plan JSON file and inspect its returned `planSha256`:

```sh
starforge buyer-collection-plans save \
  --directory /srv/operator/request-collections \
  --file /srv/operator/plans/monthly-source-review.json

starforge buyer-collection-plans list \
  --directory /srv/operator/request-collections

starforge buyer-collection-plans show \
  --directory /srv/operator/request-collections \
  --id monthly-source-review \
  --revision RETURNED_PLAN_SHA
```

Inspect the actual catalog source when selecting its row and advertised terms:

```sh
starforge buyer-collection-plans catalog \
  --file /srv/operator/catalogs/2026-10/discovery.json
```

Prepare a named period using the exact saved plan revision. Supply one `--value key=value` argument for each selected parameter:

```sh
starforge buyer-collection-plans prepare \
  --directory /srv/operator/request-collections \
  --id monthly-source-review \
  --revision RETURNED_PLAN_SHA \
  --collection monthly-source-review-2026-10 \
  --name "October source review" \
  --value month=2026-10
```

Inspect the returned original collection preview. Use its `preview.previewSha256` and the period's `editionSha256` to create that reviewed collection:

```sh
starforge buyer-collection-plans create \
  --directory /srv/operator/request-collections \
  --collection monthly-source-review-2026-10 \
  --edition-sha256 RETURNED_EDITION_SHA \
  --preview-sha256 RETURNED_PREVIEW_SHA
```

List or reopen the original periods:

```sh
starforge buyer-collection-plans editions \
  --directory /srv/operator/request-collections

starforge buyer-collection-plans edition \
  --directory /srv/operator/request-collections \
  --collection monthly-source-review-2026-10
```

Commands return JSON. Keep the exact collection reference, saved revision and values when repeating an interrupted preparation or creation. Continue the resulting collection with the original `buyer-collections` commands.

### Transfer and adopt from the command line

Export the sender's exact prepared period:

```sh
starforge buyer-collection-plans share-export \
  --directory /srv/sender/request-collections \
  --collection monthly-source-review-2026-10 \
  --edition-sha256 RETURNED_EDITION_SHA
```

The JSON result includes the actual portable file's `path`, `name`, `bytes`, `sha256`, `packageSha256` and complete manifest. Transfer that file to the recipient's chosen input directory. To include selected noncredential custom headers, add `--headers /absolute/path/header-selections.json`; that file contains an array such as `[{"key":"report","names":["x-report-language"]}]`, using actual request keys and header names from the selected plan.

Receive and inspect the same package in the recipient's existing collection store:

```sh
starforge buyer-collection-plans share-receive \
  --directory /srv/recipient/request-collections \
  --file /srv/recipient/transfers/monthly-source-review.request-plan.jsonl

starforge buyer-collection-plans share-list \
  --directory /srv/recipient/request-collections

starforge buyer-collection-plans share-show \
  --directory /srv/recipient/request-collections \
  --package RETURNED_PACKAGE_SHA
```

Receiving streams the complete source file. Repeating `share-receive` with that file reuses already retained chunks. To recreate a transferable copy later, use `share-file --directory /srv/recipient/request-collections --package RETURNED_PACKAGE_SHA`; its result gives the actual retained file path.

Create a local adoption-input JSON file. The following is an example for one original operator group; copy the actual group IDs returned by `share-show`:

```json
{
  "planId": "partner-source-review",
  "name": "Partner source review",
  "description": "Source review through our existing buyer operator",
  "operatorBindings": [
    {
      "groupId": "operator-1",
      "operatorWorkspace": "/srv/recipient/operators/report-buyer"
    }
  ],
  "requestBindings": [],
  "outputDirectory": "/srv/recipient/results",
  "deliveryParameter": "delivery",
  "deliveryValue": "received-october"
}
```

A group can instead bind `operatorConfigFile`. Supply exactly one local binding for every returned operator group. Use `requestBindings` entries when a request needs local access inputs. Each entry identifies the original request `key` and can supply `ticketFile`, a `headers` object, or an `omitHeaders` array. Header choices apply to the package's actual local-header requirements.

Review those bindings, then save the exact reviewed result:

```sh
starforge buyer-collection-plans adopt-review \
  --directory /srv/recipient/request-collections \
  --package RETURNED_PACKAGE_SHA \
  --file /srv/recipient/plans/adoption-input.json

starforge buyer-collection-plans adopt \
  --directory /srv/recipient/request-collections \
  --package RETURNED_PACKAGE_SHA \
  --file /srv/recipient/plans/adoption-input.json \
  --review-sha256 RETURNED_REVIEW_SHA
```

Use the result's `saved.id` and `saved.planSha256` with the original `prepare` command. For the example monthly plan, provide its actual query period and a distinct delivery value:

```sh
starforge buyer-collection-plans prepare \
  --directory /srv/recipient/request-collections \
  --id partner-source-review \
  --revision RETURNED_ADOPTED_PLAN_SHA \
  --collection partner-source-review-received-october \
  --name "Received October source review" \
  --value month=2026-10 \
  --value delivery=received-october
```

Supply the parameter names actually declared by your adopted plan. Continue with the original `create`, collection queue, payment approval and run commands after inspecting the returned preview.

## Resolve input issues

| Issue | Resolution |
| --- | --- |
| A catalog, body or ticket file is missing | Restore or select the actual source for that period, then continue its original preparation. |
| The advertised terms differ from the operator configuration | Review the selected network, asset, recipient and operator policy; choose compatible original settings. |
| The selected maximum exceeds the operator limit | Review the offer and existing operator policy before preparing the collection. |
| Two requests share a response destination | Give each request a distinct destination in the plan. |
| A new period's response file already exists | Open the original period that owns it or choose a fresh destination for the new period. |
| The plan or values conflict with an existing collection reference | Open that saved period, or use a new reference for the new work. |
| The prepared source or spending review changed | Inspect the original saved period and its actual inputs before creating the collection. |
| A shared package is still receiving | Select the same complete package file again; retained object chunks resume. |
| A local access ticket or header choice is required | Complete that request's local binding in the adoption form, then review again. |
| An adoption review changed | Reopen the same local selection, inspect the changed input, and save its fresh reviewed revision. |
| The private session ended | Reopen the current workspace URL and select the same saved plan or period. |
| Another collection or recovery action is active | Let that original operation finish, then refresh the same record. |

Continue completed periods through their existing collection controls so every original payment, response and recovery record stays with the customer delivery.
