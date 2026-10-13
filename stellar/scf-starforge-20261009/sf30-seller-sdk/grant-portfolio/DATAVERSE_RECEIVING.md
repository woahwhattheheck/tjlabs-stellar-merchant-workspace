# Dataverse solution deployment and complete receiving

This module extends the existing grant-portfolio application. Its source editions, portfolio revisions, native actions, received originals and support references live in the same private Workspace. Start the maintained application and use its authenticated connection, or run the Python operator against the same closed workspace. The original exclusive writer lock prevents a CLI and a running console from independently opening that workspace.

The compiler and archive inspector work without a tenant. Actual deployment, export, import, configuration and staff-history capture require an administrator-provided target profile and the target's real metadata and access. A saved definition, compiled plan, proposed pilot or local fixture is not a completed tenant installation.

## Issued work and acceptance

The issued RFQ26-10663 requires a complete managed solution and an editable unmanaged solution, deployment settings, source and technical/admin handover. Pilot acceptance covers at least three selected CCS projects and one Climate Change Flagship aggregation. The selected projects, environments, licences, native role assignments, integration interfaces and inception decisions must be supplied and reviewed in that original programme.

The Business Central interface is a separately owned financial integration. Task 4 allows the agreed PMRS-side layer to be implemented and exercised while Business Central provisioning or access is unavailable. Label that result with the actual agreed interface and supplied input; do not describe it as a live Business Central deployment. Keep soft pipeline records in PMRS. Annex C is an example workflow and must not silently replace the inception-approved rules.

The defect-support module records its own agreed calendar and sourced acceptance. A successful Dataverse import does not establish customer acceptance or start the twelve-month support period.

Issuer source: https://spc.global.ssl.fastly.net/sites/default/files/tenderfiles/2026-10/RFQ26-10663%20-%20Readvertised%20-%20Consultancy%20for%20PMRS%20Power%20Platform.pdf

## Complete application installation

Retain the complete existing SDK roster in grant-portfolio/source-files.json, including its original IATI/360Giving projectors, original managed application and these added modules. The installed roster is the complete source authority for delivery. Do not copy only the new Python files next to an older Workspace: its action registry and native file routes must match.

The added operating surface is:

| File | Responsibility |
| --- | --- |
| dataverse_contract.py | Exact JSON, source bytes, target profile, actual CSDL and native metadata contracts |
| dataverse_security.py | Actual table privilege metadata, selected-role constraint validation and retained publication checks |
| dataverse_solution.py | Pure specification validation, preflight query plan and reviewed component compiler |
| dataverse_client.py | Original native HTTP requests, complete responses and unknown-result handling |
| dataverse_runtime.py | Component creation/update, actual membership, validation, publication and role joins |
| dataverse_packages.py | Original managed/unmanaged export, asynchronous import and target configuration |
| dataverse_workspace.py | Same-Workspace records and native request/event journal |
| dataverse_portable.py | Complete native/portfolio/application archive and original-store receiving |
| workspace_extensions.py | Explicit original action dispatch and per-module revision policy |
| dataverse_http.py | Authenticated native record/evidence/file views |
| dataverse_cli.py | Native operator commands and complete file receiving |
| staff_native.py | Read-only capture of one completed native staff command and immutable history |
| client.mjs / client.d.mts | Original authenticated typed client, same action IDs and verified streamed downloads |

Python 3.11 or newer and its standard library support the ALM modules. The inherited source projectors retain their original runtime requirements. Staff plugin compilation has its separately pinned C#/.NET SDK contract. Include an actual built DLL only after that build completes, with its byte count and SHA-256; retaining C# source does not create a plugin binary.

No credential is embedded in application source or an ALM archive. A target profile contains the name of a token environment variable. The original native client reads that variable at execution. Receiving retains the profile as historical evidence; it does not activate that profile for the recipient.

## Select the original portfolio and target

Inspect the original Workspace state and the full selected portfolio revision. Every source-bound ALM payload includes:

    {
      "actor": "actual operator",
      "portfolio": {
        "id": "original portfolio UUID",
        "revision": 1,
        "snapshot": "original 64-character SHA-256"
      }
    }

These are explicit selectors, not example tenant or project data. Use the exact returned values. A later portfolio edit creates its next original revision; it does not relabel a completed native capture.

The target profile format is:

    {
      "schema": "tjlabs.pmrs.dataverse-contract/v1.profile",
      "environment_url": "https://actual-environment.crm.dynamics.com",
      "organization_id": "actual organization GUID",
      "api_version": "v9.2",
      "token_environment": "PMRS_DATAVERSE_TOKEN",
      "name": "administrator-selected target",
      "source_refs": []
    }

The illustrated URL and identifiers are placeholders. Supply the actual environment and approved API version. Do not put a token value in this document. The complete original WhoAmI return must match the selected organization. Target CSDL, component definitions, role bindings and complete paginated responses are retained as observed, with separate request and reception times.

Use the existing native upload to retain complete profile, specification, solution ZIP and deployment-settings bytes. It returns the original SHA-256 and byte count. The legacy upload filename is not a file-type assertion: the ALM handler validates the selected object's actual format when used.

## Native specification and compilation

Run the installed contract command to inspect the current specification schema:

    python3 -B dataverse_cli.py contract

The specification schema is tjlabs.pmrs.dataverse-solution-spec/v1. It declares the actual publisher, four-part solution version, original resource bytes, complete component definitions, dependencies, app membership, reviewed role privileges, app role bindings, deployment settings and source references.

Supported component families include tables, attributes, relationships, forms, views, web resources, sitemaps, model-driven apps, plugin assemblies/types, SDK steps/images, Custom APIs and their parameters, environment variables and connection references. The actual target CSDL and option metadata determine accepted fields, navigation names and component-type membership. The compiler does not invent a tenant schema from a generic example.

Native references identify existing read-only metadata such as SDK messages and message filters. They are resolved from actual target results and never created as a substitute for a missing platform definition. Staff guard registration must use the target's exposed message/filter inventory and the reviewed source definition. For an already accessible project table, register and verify its guard steps before adding the protected staff state and phase columns; adding those columns first would expose an unguarded transition. Express this ordering through the complete specification's depends_on bindings. New internal history tables receive no business-role grants before their mutation and read guards are registered and verified. The resulting sequence is existing project guards, protected staff metadata and native API/resources, then actual app/role validation. Do not grant a business role before its governed mutation/read guards and resulting app components are present and verified.

Definitions default to create-or-match. If an existing component differs, the action stops with its original evidence. A selected merge requires an explicit expected_original_sha256 and review of the complete retained original definition. Metadata updates preserve unselected native fields and labels through the original merge/full-PUT contract and actual ETag. Record-row changes preserve their original concurrency conditions.

Use a retained snapshot to compile locally:

    python3 -B dataverse_cli.py compile --spec solution-spec.json --snapshot target-snapshot.json --output reviewed-plan.json

A local compile performs no tenant mutation. The normal saved-plan action binds its source specification and target snapshot records. Inspect the complete plan before selecting dataverse.apply. A plan derived from a different source record, target, selected portfolio revision or changed original definition cannot be silently adopted.

## Original actions and payloads

Submit each action through the existing action endpoint or CLI. Supply one stable operationId and preserve its exact complete payload. An optional expectedRevision selects the original workspace revision at admission.

| Action | Fields in addition to actor and portfolio |
| --- | --- |
| dataverse.spec.save | object |
| dataverse.profile.save | object |
| dataverse.preflight | specId, profileId |
| dataverse.plan | specId, snapshotId |
| dataverse.apply | planId, profileId |
| dataverse.export | snapshotId, profileId, solutionName, managed |
| dataverse.import | snapshotId, profileId, archiveObject, options |
| dataverse.configure | snapshotId, profileId, settingsObject, solutionName |
| dataverse.delivery.prepare | recordIds |
| dataverse.staff.capture | profileId, entity, projectRecordId, commandOperationId, historyStateVersion |

The sole exception is dataverse.delivery.receive: its payload is {actor, object}. Its selected portfolio comes from the fully verified received archive.

Native record IDs returned in action results have the form alm- followed by a SHA-256. These wrappers retain the actual native ID separately. Use the returned wrapper ID for specId, profileId, snapshotId and planId; do not substitute a native solution GUID or a source-calculation identifier.

A complete action input is:

    {
      "operationId": "your-original-operation-id",
      "action": "dataverse.preflight",
      "expectedRevision": 3,
      "payload": {
        "actor": "actual operator",
        "portfolio": {
          "id": "original portfolio UUID",
          "revision": 1,
          "snapshot": "original snapshot SHA-256"
        },
        "specId": "returned native spec record ID",
        "profileId": "returned native profile record ID"
      }
    }

The original action body is limited to 1 MiB. Large definitions and archives enter through the existing object upload, not an oversized action body.

    python3 -B dataverse_cli.py --workspace /absolute/private/workspace upload --file solution-spec.json --sha256 ORIGINAL_SHA256
    python3 -B dataverse_cli.py --workspace /absolute/private/workspace action --input exact-action.json

The command prints the admitted operation ID, input SHA, workspace ID and PID before execution. Its final state distinguishes complete, failed and retained pending native work.

## Complete deployment sequence

1. Receive the original source editions and save the selected portfolio/review in the existing application.
2. Retain and save the complete native specification and administrator-provided target profile.
3. Run dataverse.preflight. Inspect WhoAmI, complete CSDL, existing component definitions, message/filter references, app membership and role evidence.
4. Save the plan with dataverse.plan. Inspect the full native operations, original definition hashes, dependencies and reviewed changes.
5. Apply that exact plan with dataverse.apply. Native requests are reserved durably before dispatch. Target reads reconcile the original component IDs after an uncertain response. They do not authorize a different payload or a second provider write.
6. Configure the selected environment variables and connection references using the actual deployment-settings object and reviewed target capture.
7. Read actual app validation, selected publication, published component membership and role results. A created row or compilation success is not a published usable app.
8. Execute the separately supplied three-project and one-aggregation pilot against the joined staff, operations and financial contracts. Capture the actual role/action/source results and corrections.
9. Export both managed and unmanaged packages from the actual selected solution. Inspect each native ZIP and its complete source/readback bracket.
10. Perform the selected target import, configuration, validation and receiving review with original operation IDs. Capture the resulting actual import/async/job evidence.
11. Prepare the complete handover, download it, receive it into a separate original Workspace, and continue an ordinary portfolio edit there.

Steps depend on their actual inputs. Do not fill missing tenant access, project data, licensing approval, role membership or customer acceptance with a simulated result. A local fixture may exercise source code if it is explicitly labelled and retained separately from native evidence.

## Import and interrupted-result recovery

Import options are explicit:

    {
      "overwrite_unmanaged_customizations": false,
      "publish_workflows": false,
      "review": {
        "actor": "actual reviewer",
        "reason": "reviewed target and original package choice",
        "source_refs": []
      }
    }

Both booleans are required. This interface does not invent an overwrite preference from the managed flag. Native ImportSolutionAsync retains the actual returned AsyncOperationId and opaque ImportJobKey; the original ImportJobId remains deterministic for the same admitted operation and exact package.

A PENDING result records the actual original native job. The parent request may appear FAILED with NATIVE_OPERATION_PENDING and a result_id because the synchronous caller has yielded its observation. Read that original request and result. Resume the same operation to observe the same job; do not construct a fresh action ID to poll it.

    python3 -B dataverse_cli.py --workspace /absolute/private/workspace request --operation-id ORIGINAL_OPERATION
    python3 -B dataverse_cli.py --workspace /absolute/private/workspace resume --operation-id ORIGINAL_OPERATION

The durable journal distinguishes reserved, dispatched, complete returned and unknown native requests. Reopening an interrupted Workspace never makes an unknown provider write undispatched. Complete original responses recovered after a save interruption remain associated with their original request. Publication and other writes without a conclusive reconciliation remain explicit; they are not automatically issued again.

The Dataverse module checks optional workspace revision at original admission so an interrupted native operation can reconcile its original IDs after unrelated local receipt bookkeeping. Support mutations have their own expected record revision and commit-time workspace check. Neither policy permits changing the original admitted payload.

If the original native import returned a terminal failure, retain that failure and its complete log. A different reviewed corrective import is a new explicit operation with a new source decision. It must not overwrite or rename the failed attempt into success.

## Rollback and restoration

The handover preserves original definitions, role memberships, settings, both native solution ZIPs and all returned actions. It makes a reviewed restoration decision possible; it does not claim that reimporting an unmanaged ZIP reverses arbitrary existing changes.

Before deployment, agree the target's supported environment backup/restore or reviewed forward-correction procedure, owner and recovery point. Native managed upgrade/uninstall, environment restoration and destructive removal are outside the automatic actions in this module. The executor performs only the compiled, selected original actions. Keep the original failed deployment and its evidence when carrying out an approved correction.

A local archive receive restores source/portfolio/native evidence into the existing Workspace format and enables later edits. It does not restore a tenant database, reinstall a solution or recreate security access.

## Staff history and support evidence

dataverse.staff.capture invokes only the original project-scoped native staff read Custom API. It selects one actual completed command and retains the command/result plus all five immutable before/after/source/policy/receipt members. It does not call the staff command API or create a correction.

The original history must bind the selected project, operation GUID, state version and portfolio id/revision/snapshot through its retained policy/source context. Capture uses the same WorkspaceJournal and dataverse_records family as the other native actions. Complete native source and exact-number JSON remain available as files.

The support resolver takes the exact correctionId, operationId, projectRecordId, stateVersion and historySha256. It resolves an actual original correction.resolve result, not a later unrelated project observation. A corrected support closure also needs its separately retained target import, tested result and customer closure evidence. A captured staff correction alone does not prove that a corrected package reached the target.

## Complete handover and editable receiving

dataverse.delivery.prepare selects original recordIds. The complete closure includes all retained native records and related original parent/provider requests, steps and chained events for the selected portfolio history, plus previously received original evidence. At least one actual managed/unmanaged pair for the same native solution/version/publisher is required.

Each export's opening and closing source bracket must agree. Separate exports remain separate actual observations; the package does not assert that two independently returned native ZIPs were one atomic server snapshot.

The handover contains:

- The original complete portfolio ZIP, including source records, reviews and revision history.
- Exact original native managed and unmanaged ZIPs and their full export/import/configuration evidence.
- All declared source/evidence object bytes and original received handovers needed by retained records.
- Complete native request/result/event families, including pending and uncertain outcomes.
- Every file in the installed maintained application roster, frozen once before packaging.
- A canonical manifest binding the complete relative member list, byte counts and SHA-256 values.

The SQLite read snapshot used during preparation is an internal consistency mechanism. Receiving uses the original portfolio receiver and Workspace tables; it does not introduce a second editable database or alternate store.

Archive validation rejects duplicate members, unsafe paths, missing objects, changed canonical manifests, incorrect source plans, mismatched native ZIPs and broken local event/parent identities. Failed extraction/publication prefixes remain evidence. Complete matching publications can be reused; subsequent received portfolio edits are preserved.

Inspect and download through the existing application or CLI:

    python3 -B dataverse_cli.py --workspace /absolute/private/workspace records --kind delivery
    python3 -B dataverse_cli.py --workspace /absolute/private/workspace download --record-id ORIGINAL_DELIVERY_RECORD --output /absolute/receiving/PMRS_Complete.zip
    python3 -B dataverse_cli.py inspect-delivery --file /absolute/receiving/PMRS_Complete.zip --output /absolute/receiving/PMRS_Inspection.json

Create a separate ordinary private Workspace with init, then receive the complete downloaded archive:

    python3 -B dataverse_cli.py --workspace /absolute/private/recipient init
    python3 -B dataverse_cli.py --workspace /absolute/private/recipient receive --file /absolute/receiving/PMRS_Complete.zip --sha256 ORIGINAL_ARCHIVE_SHA256 --operation-id ORIGINAL_RECEIVING_OPERATION --actor "actual recipient"

Use the recipient's returned portfolio id/revision/snapshot for its next original review or portfolio edit. Repeat completion of the same operation preserves that later history.

Historical target profiles remain evidence. A recipient must explicitly save its own reviewed local profile before an authorized tenant call. No captured provider request, source capture, native staff command, import, publication, payment or customer acceptance is replayed by archive receiving.

The support handover may wrap this complete ALM archive. Its original support action prepares the exact nested archive, then calls adopt_receiving inside the same outer support transaction. That helper adopts the verified original source/portfolio/native histories without creating a synthetic ALM child request. Ordinary dataverse.delivery.receive uses the same helper and adds its normal local receiving receipt.

## Authenticated application and typed client

The existing console owns bearer authentication and origin/host checks. Read routes expose bounded views; complete exact JSON is a SHA-pinned file:

| Route | Original selection |
| --- | --- |
| GET /api/dataverse/schema | Current compiler/action contract |
| GET /api/dataverse/records | portfolioId, revision, kind, offset, limit |
| GET /api/dataverse/record | id |
| GET /api/dataverse/record-file | id |
| GET /api/dataverse/events | operationId, offset, limit |
| GET /api/dataverse/evidence | operationId, kind, key |
| GET /api/dataverse/delivery | id |
| POST /api/dataverse/upload | Complete application/octet-stream object |

The original POST /api/action and POST /api/resume remain the mutation and continuation routes. The original portfolio ZIP upload is unchanged.

GrantPortfolioClient adds dataverseSchema, dataverseRecords, dataverseRecord, dataverseEvents, dataverseAction and complete native record/evidence/delivery open/download methods. Each download uses the existing held-file receiving publisher, checks returned bytes and SHA, and preserves a different existing destination. The client borrows the console; dispose closes only its own HTTP work.

A complete record file preserves original decimal tokens. A JavaScript view does not promise arbitrary-precision numeric reconstruction. Use those exact source bytes and the native Python reader for source calculations.

## Readable receiving review

The recipient should be able to identify the original portfolio/source editions, selected native solution/version, source and target organizations, both native export formats, actual import status, configured environment variables and connection references, app publication/membership, reviewed roles, unresolved native outcomes, pilot cases, known corrections and the next original operation.

Keep proposed, source-compiled, actually executed, customer-reviewed and accepted stages distinguishable. In particular, the presence of a definition or a package is not evidence of a working tenant installation, effective user access, a passed financial interface, completed three-plus-one UAT or customer acceptance.

## Primary native API references

- Solution import/export actions: https://learn.microsoft.com/power-apps/developer/data-platform/webapi/reference/importsolutionasync
- Export response field: https://learn.microsoft.com/power-apps/developer/data-platform/webapi/reference/exportsolutionresponse
- Model-driven app creation, validation, publication and roles: https://learn.microsoft.com/power-apps/developer/model-driven-apps/create-manage-model-driven-apps-using-code
- Native solution operations: https://learn.microsoft.com/power-apps/developer/data-platform/work-solutions
- PAC solution tooling and deployment settings: https://learn.microsoft.com/power-platform/developer/cli/reference/solution

## Reviewed internal-table role constraints

The staff module declares its two internal tables and the exact reviewed business-role GUIDs through the optional `role_constraints` specification field. Each entry contains `table` (the existing authored component key), `role_ids`, `forbid`, and `review: {actor, reason, source_refs}`. The forbidden operations are selected explicitly from Create, Read, Write, Delete, Append, AppendTo, Assign and Share. The staff composer supplies the deduplicated union of reviewed policy roles and non-administrative staff application roles; the compiler does not fabricate that population.

Preflight retains the actual target's EntityDefinitions Privileges collection and each selected role's complete RetrieveRolePrivilegesRole return. Existing direct-grant conflicts stop compilation. A newly created table has no preflight privilege IDs; its constraint remains pending until the runtime reads that actual table. The runtime checks the returned MetadataId and original privilege IDs before role writes, checks planned grants against that same native population, and reads the constraints again immediately before app validation/publication. An interrupted continuation reads a new observation before any remaining grant/publication step. It does not reuse a prior security observation as a current target check.

A conflict remains an explicit original result. The programme neither removes grants nor infers effective access for other roles, teams or administrators. Native staff writes use the initiating user's access to the original project. Only the two fixed internal operation/history tables use the staff plugin's narrow custody after the project access check; business roles must have none of their direct CRUD/association privileges. Guard steps on the existing project precede protected staff columns in the authored dependency graph.

Microsoft documents that the Dataverse SQL/TDS endpoint uses Dataverse table access controls and does not execute Retrieve or RetrieveMultiple plugins. Read guards therefore cannot substitute for the reviewed internal-table privilege restrictions. The source contract uses the actual target CSDL and native IDs rather than generated privilege names.

Primary contracts:

- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/dataverse-sql-query
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/entitymetadata?view=dataverse-latest
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/securityprivilegemetadata?view=dataverse-latest
- https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveroleprivilegesrole?view=dataverse-latest

