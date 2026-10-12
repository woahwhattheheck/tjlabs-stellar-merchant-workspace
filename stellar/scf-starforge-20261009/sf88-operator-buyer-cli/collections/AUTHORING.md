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

## Build a reusable request plan

Choose **New request plan** and enter a name. The workspace suggests a plan reference from the name; retain that reference when saving another revision of the same plan. Add a short description that explains the business task or expected delivery.

For each request:

1. Enter a useful request name, such as the report or source it will deliver.
2. Enter the absolute path of an existing saved catalog file and choose **Read saved catalog**.
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

**Import plan JSON** opens a plan exported from another workspace. Review its actual source paths and operator bindings, then save it as a revision in the current workspace.

**Download saved plan** exports the selected saved definition. It includes the parameter declarations and complete request configuration for every member.

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

Use the [complete recovery guide](RECOVERY.md) to capture, transfer and reopen the customer operation, including its operator state and saved deliveries. A plan or period JSON download is useful for inspecting and exchanging the definition; use the native encrypted backup when transferring the complete operating workspace.

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
| The private session ended | Reopen the current workspace URL and select the same saved plan or period. |
| Another collection or recovery action is active | Let that original operation finish, then refresh the same record. |

Continue completed periods through their existing collection controls so every original payment, response and recovery record stays with the customer delivery.
