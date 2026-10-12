# SensorThings commissioning operator

This component adds a complete commissioning destination to the installed SensorThings Operations Desk. It retains sources, target profiles, mapping versions, exact plans, reviews, native FROST jobs, verified target results and complete handoffs in the original workspace. Open **Commissioning** from the original Desk after the host has installed the complete commissioning source.

## Open the existing workspace

Use the installed application's private Start/Open session. The Commissioning link opens a separate window using the same host session. Its initial fragment is removed immediately. The browser keeps the token only in the active session closure; provider credentials remain on the selected host.

The original Desk client continues to own every mutation. The request is saved before dispatch with its original operation ID, action, payload and workspace revision. If a reply is lost, the saved-request banner provides **Inspect original outcome**, **Replay exact request**, and the explicit latest-revision review for an operation that is still unobserved. A confirmed failed or ended validation request can be kept in history before its browser slot is cleared.

The header identifies the original workspace and its actual revision. Choose the commissioning project separately from the source, mapping, plan and native job. Browser editing drafts are scoped to the workspace and project. Moving between screens preserves those drafts; saving a mapping creates an immutable version in the original project.

## 1. Retain and inspect complete sources

Create a project with a descriptive label and intended operating outcome. Select one existing project to keep all of its subsequent work together.

For an original SensorThings edition, choose it from the existing workspace's edition list. The original source review and complete raw page/entity closure govern its use. Commissioning does not create a second source capture or substitute a constructed observation set.

For a private file, use the same configured source inbox as the Operations Desk. The upload retains the original filename, total bytes and SHA256, and resumes its same partial upload. The browser supports complete inputs up to128MiB; the installed retained-file receiver can place larger supported files into that exact inbox. Select **Verify and select** to inspect an existing received file.

Choose the actual CSV, SensorThings JSON or data-array format, the native collection when the source requires it, the original source URL and its real license/attribution. The source importer verifies the complete declared file before retaining the source. Its configured limits remain authoritative.

Use **Inspect source** to open the complete source metadata, file references and source-row pages. Inspect original source references when a repeated entity or observation has conflicting occurrences. A page is a view over the retained source; it does not silently discard the rest of the source.

Keep source meaning intact:

- Preserve explicit null, missing values and original result types.
- Keep phenomenonTime, resultTime and validTime separate.
- Use the declared native units and MultiDatastream component order.
- The Hamburg source's categorical status results remain categorical. No duration, interpolation or availability is inferred from those observations.
- Keep original source IDs distinct from IDs assigned by the target service.

## 2. Select a target and map the source

Save a versioned target profile with its actual service URL. Production targets use HTTPS. The deliberately selected loopback reference installation may use HTTP when explicitly enabled. Enter only the existing host environment variable name for authorization; the browser does not receive its secret value.

Target timeout and complete-response limits are explicit profile values. **Inspect the selected native target** creates a retained read-only FROST job. Optional selected entities use the native collection name and an exact identifier encoded as JSON text in idJson. Review the actual returned service/entity result in Native operation.

Create a mapping version from an original source and a selected target profile. The complete editor includes:

| Selection | Meaning |
| --- | --- |
| Namespace | Reviewed project namespace for the selected target additions |
| Stream keys and occurrence IDs | Exact retained source selection; empty arrays select all original records |
| CSV encoding, delimiter and header row | The actual original file representation |
| CSV column map | Native property name to original CSV column name |
| CSV result type and null token | Explicit result interpretation; an empty-string null token requires the explicit checkbox |
| CSV relationships | Native relation to an original source key or an exact targetIdJson |
| Native entity definitions | Complete authored target definitions in the original mapper schema |
| Source-to-target bindings | create, bind or update; original source key, exact target identifier, overrides, relations and explicit conflicting occurrence selection |
| Provenance property | Reviewed metadata addition displayed in the eventual plan |
| Native batch size | Selected original native processing size within the host's limits |

Edition sources ignore CSV configuration. Source numeric/time/body representations remain retained by the original mapper. For authored JSON, the browser rejects numeric literals it would change during the ordinary JSON request. Keep native identifiers as exact JSON text in targetIdJson and import precise original results through their source file. Do not derive a native write selection from the map's display identifier.

**Load editable configuration** opens an existing mapping as the basis for a new version. It does not change the prior version. **Prepare plan** materializes the explicit source-to-target graph and the corresponding exact payloads.

## 3. Review the complete plan

Choose a plan and inspect its identity, mapping version, target version, counts, source selection, authored metadata and issues. Plan pages expose every native step, its source references, source row count, create/bind/update mode, exact target ID, native relationships and exact authored body.

Record the actual reviewer's acceptance or return-for-revision decision and note. Issue acknowledgment is explicit. The original manager decides whether the plan satisfies its native review requirements.

To execute, choose the actual accepted review for that exact plan, enter the exact target service URL shown in the plan and confirm the displayed target writes. The original manager commits the job immediately and owns the background native work. It retains graph order: Locations; Things/Sensors/ObservedProperties/FeaturesOfInterest; Datastreams/MultiDatastreams; HistoricalLocations/Observations, resolving links through original source bindings and actual preceding native results.

The native package is the unchanged FROST-Python-Client1.1.53 at9f41f7794725fced63fcb07e6b33dbc1f897f2bc. Its SensorThingsService.execute transport receives the exact original JSON body through data, preserving explicit null and source timestamp/decimal text that its entity serializer would otherwise transform.

## 4. Operate, reconcile and verify the original native job

Select the job to see its retained state, progress, exact plan/target identities and paged step history. The progress display polls only the original read facade, pauses while the document is hidden and stops at terminal states. Reading the job never creates another native worker.

| Control | Effect |
| --- | --- |
| Refresh saved progress | Reads the retained job and current workspace |
| Resume original job | Continues its existing plan and step journal |
| Cancel original job | Records cancellation before signalling the same native process; completed and uncertain steps remain |
| Reconcile original outcomes | Uses retained responses and selected target identities to settle original attempts |
| Resolve an uncertain step | Records the operator's actual adopt or retry decision for the same step |
| Verify actual target | Runs and retains the actual selected target verification |
| Prepare compensating plan | Creates a separate reviewable rollback plan from original identities, before-images and current target comparison |
| Record commissioning outcome | Retains the actual result, reviewer and remaining work |

Open **Request, response and provenance** to inspect the complete attempt history and exact retained files. An HTTP result that is missing remains uncertain until reconciled; it is not automatically reposted.

For **Adopt**, supply the actual native target identifier as JSON text and the observed finding. For **Retry**, retain the explicit reason for retrying this same step. A map display ID is never a native identifier.

When a pending job arrived in a portable package and has no local binding, use **Resume a received pending job on this host**. Confirm its original target service and the selected host execution. The extra confirmation is needed for that received, unbound job; ordinary same-host resume retains its existing binding.

Review every compensating plan before execution. The native manager compares the selected managed target set and before-images; it does not delete bind-only entities or silently overwrite unrelated later changes.

## Retained target map and exact native inspection

The map uses the original DataCove STAM source pinned to0e414f3441a8773619f242c797fe75e9af3fc04d and the host's actual built Leaflet/STAM assets. Assets and data are served from the same authenticated host; no external basemap or provider call is made by this viewer.

The map is a read-only projection of actual retained successful target read bodies, scoped to the selected job, plan, verification and immutable snapshot SHA. Positive view IDs are display-only identifiers. The sidecar retains the original native kind/idJson, source identity, response SHA, source pointers, relations, fields and observation pages.

**Inspect native result** opens that exact sidecar and its retained response files. Source coverage, unavailable reads and missing or ambiguous geometry remain visible. Entity and issue tables continue to work while map assets are unavailable; the UI does not substitute a new map engine or invent target geometry. Refreshing the map selects the new retained snapshot explicitly.

Every SensorThings continuation link remains in the same scoped service. The session bearer is never forwarded to a provider nextLink. Popup fields use text nodes; source text is not interpreted as HTML. Preserve the pinned source's actual license/notice files with its built assets.

## 5. Prepare, receive and reopen complete work

Prepare a complete project package after reviewing the desired project edition and its actual results. The original exporter carries:

- selected original SensorThings edition archives or complete raw input files;
- project history and immutable source/target/mapping/plan versions;
- native request/response journals, typed target bindings and actual verification;
- source/license provenance, operator guide and complete editable source closure.

Paths inside the package are relative. Credential values and session tokens are omitted; source URLs and host environment references remain provenance.

Download a listed file from its original immutable file ID. The server opens and hashes the selected held descriptor before streaming it, returns its complete SHA/byte identity and supports same-file byte ranges. Small downloads also check the complete SHA in the browser. Large files use the browser's file picker when supported, or the installed retained-file receiver.

To receive a project, upload its complete package into the original inbox, review its filename/bytes/SHA and choose **Receive original project**. The importer validates the package and original source archives before adoption:

- A repeated package reuses the original receiving identity.
- A compatible newer history advances the same project.
- An older package preserves work completed later.
- Divergent history requires its own receiving workspace.
- Pending native jobs keep their original history and require explicit host/target binding before execution.

Reopen the selected project and inspect sources, mappings, plans, native results, reviews and handoff history. Continue edits from the retained current version. Preparing or downloading a package does not assert that another recipient has imported it.

## Complete browser receiving phase

Use the original source integrator's selected native workspace, original retained edition, native reference target and declared operation. One receiving owner performs this whole sequence:

1. Open the installed Desk and Commissioning through the original private session.
2. Open the real project and inspect its source closure and representative original rows/types/time/units.
3. Load the selected mapping, review the entire native plan and record its actual accepted review.
4. Start the original native job on the explicitly selected reference target, or reopen its existing result if already dispatched.
5. Inspect actual request/response/typed-target records, reconciliation/verification and retained STAM entity/observation views.
6. Prepare and download the complete package, verifying actual returned bytes/SHA.
7. Receive through the original receiving workspace and reopen the same selected source/mapping/plan/history.
8. Repeat that same receive to check actual reuse, then make one meaningful subsequent project edit and verify that receiving an older package preserves it.

Keep the real native request and project IDs. The complete source can be reviewed before this phase; that is separate from an actual browser/native/customer outcome.

## Server integration

Await createCommissioningHttp({workspace,origin}) once for the existing workspace manager. Mount staticHandler before the original Desk static handler; mount handleApi only after the original Bearer, Host, Origin and X-SensorThings-Workspace checks. All writes remain the original /api/action path. Closing the HTTP facade drains only its own active reads; the original workspace owns manager/worker closure.

The host exposes its same manager at workspace.commissioning. Its existing workspace.schema() advertises the eighteen commissioning actions and current pure schema. The static source inventory is commissioning/browser-assets.json. Complete STAM vendor assets and their source/license identity must be included in the selected source closure before native map receiving.

Core routes are /api/commissioning/schema, view, projects/:id, sources/:id, sources/:id/rows, plans/:id, jobs/:id and files/:id. Files use ?metadata=1 for a path-free descriptor and ?expectedSha256=HASH for its complete bytes. The map uses /api/commissioning/map/:jobId/manifest, entities, issues and v1.1 under the same original auth and snapshot scope.

The existing Desk error adapter preserves the actual source error code, message, details and currentRevision, including the server's {error:CODE,message,...} response form. It retains the original saved request after a failed response so the operator can reconcile that same outcome.
