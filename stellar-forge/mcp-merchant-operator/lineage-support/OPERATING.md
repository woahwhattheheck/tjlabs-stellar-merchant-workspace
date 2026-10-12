# Lineage incidents in the original Support case

This application carries a saved OpenLineage Service Levels incident into the existing merchant Support workspace, records the operator’s reviewed return decision in that same case, and sends the saved decision through the original Lineage owner. The handover contains every original source file required by the retained Service Levels history, the exact native reports, the reviewed case and source revisions, and the actual native result. The existing commissioning material journal preserves these records through case saving, reopening and customer export.

The module uses the existing Service Levels engine, configured Lineage HTTP client, Support case store, commissioning command and private export writer. Its nine MCP tools and installed command operate those original components. The full application requires the selected distribution’s Lineage and Support source components and their existing owner dependencies.

## Build the complete installed source selection

The maintained `lineage-support` source selection combines the complete original
Merchant Support and OpenLineage selections, including the bridge contribution
and the existing Support, accounting, buyer and Lineage owners. The original
`merchant-support` and `openlineage-operations` recipes remain available for
their separate installations.

Build the selected committed source with the existing distribution builder:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/original-checkout \
  --ref ACTUAL_SELECTED_COMMIT \
  --selection lineage-support \
  --out /absolute/private/lineage-support-package \
  --offline
```

The checkout must contain that commit and its Git objects. The builder retains
the complete original source, recipe, contribution identities, declared native
resources and package archive. If the original build is interrupted, use the
same output, commit and selection with `--resume`. Continue with the returned
archive through the existing Runtime installation and managed-profile workflow.

The package's ordinary `starforge` entry provides the same application commands
and configuration readers. Inspect its actual installed registrations:

```sh
starforge registrations --source lineage-support
starforge registrations --command lineage-support
starforge registrations --source openlineage-workspace
starforge lineage-support sources --config /private/original-merchant.json
```

Use the original runtime profile and credential-file selections. The async
producer's prepared Python SDK environment is selected separately through its
existing `--python` argument; the bridge continues through the configured
native Lineage client and original Support case store.

## Prepare the existing host

Use the host’s original merchant configuration. Its supportConnection points to the existing private Support configuration and cases directory. Its openlineageWorkspaceConnection points to the original Lineage workspace configuration. Choose an alias returned by merchant_lineage_workspaces or merchant_lineage_support_sources.

The Lineage alias retains the original workspace UUID, private connection.json, token-file selection, input aliases and client timeout. The original HTTP server remains its owner. A restarted server advertises its new instance in that same connection file; inspect merchant_lineage_connection and use the existing explicit merchant_lineage_reconnect operation when needed. Repeating a saved decision retains its original operation ID and body even after a connection changes.

The Support configuration retains its current casesDirectory, source selections, commissioning, service, commercial, adjustment and customer-file settings. Accounting and buyer owners are the existing Support dependencies. A Lineage case can start with a diagnostic workspace containing the new commissioning material. Adding a capture to an existing case preserves its other workspace arms and original runtime Support bytes.

The source-owned distribution contribution declares the lineage-support command and the lineageSupport provider family. The provider depends on openlineageWorkspaces and support. Both owners remain responsible for their admitted calls and closing. The bridge drains its accepted calls, Support drains admitted case borrowers, and Lineage drains admitted multi-action workspace borrowers before closing their underlying clients. Regular Lineage call cancellation keeps its original owner behavior.

Install or select the complete distribution containing all of these files together:

- lineage-support/model.mjs, controller.mjs, catalog.mjs, provider.mjs, cli.mjs, receiving.mjs and this guide under stellar-forge/mcp-merchant-operator/.
- The current complete Support owner with withCaseStore, preserving all current commercial, service and case-package integrations.
- The current complete OpenLineage owner with withWorkspace and its borrower drain.
- distribution/contributions/lineage-support.json, plus the existing Lineage and Support contributions.

The contribution exports the controller, model, native receiving helper and operating guide. Use the original Applications or managed source selection to install their complete import/resource closure. A single copied bridge leaf does not provide that installed application.

## Inspect a real incident

Call merchant_lineage_support_sources with an empty object. It reports the original configured Lineage workspaces, Support configuration state and byte/range limits. It does not start another collector.

Open the selected workspace with merchant_lineage_service_levels_read. An incident has a 64-character ID, a saved policy ID, its original entity and evidence, current active flag, operator status and complete retained history. Its workspace UUID is distinct from its configured alias. The Support case is identified by its own original lowercase version-4 UUID.

The incident’s active flag comes from the original saved assessment. An operator status such as acknowledged, assigned ownership, accepted or resolved is a separate record. A resolution requires a saved clear assessment. An explicit acceptance records the operator’s reason while preserving the observed condition.

The capture includes the complete Service Levels state and the original source union used by its saved assessments. This retains earlier policy and assessment evidence that an incident’s current status alone would omit. Each original source keeps its exact stored wire bytes, including gzip when that is the captured encoding. The module reconstructs every source event, checks its original positions and metadata, validates all saved assessments against the original engine, and regenerates the selected native report files for byte comparison.

## Capture into the existing case

Choose the actual case UUID, its current revision, case name, metadata and incident. For a new case use a new version-4 UUID and expectedRevision:null. For an existing case read its current name and metadata and pass the values you intend to save.

The capture preview arguments are:

| Field | Meaning |
| --- | --- |
| id | Original Support case UUID. |
| expectedRevision | Current 64-character case revision, or null for a new case. |
| workspace | Existing configured Lineage alias. |
| incidentId | Exact original Service Levels incident ID. |
| name | Saved case name. |
| metadata | Original merchant, owner, status, followUpOn, nextAction and notes fields. |
| actor | Operator recording this case action. |
| reference | Optional original business or source reference. |

Call merchant_lineage_support_preview. Review its original workspace UUID and revision, policy, incident, assessment selections and full file manifest. The preview SHA binds the complete normalized request, current case identity and complete native context. It is specific to that case and original source selection.

Preview also prepares the exact eventual material shape in memory. It checks the pretty UTF-8 material bytes, applies the existing pure commissioning add_material command, and serializes the complete Support workspace with the original codec. These operations enforce the original per-material, commissioning-record and complete-workspace capacities before offering a save. They do not write a case or native decision.

To save, use the same preview arguments and add:

- requestId: one new version-4 UUID, retained with the complete request before dispatch.
- expectedPreviewSha256: the exact reviewed preview digest.

Call merchant_lineage_support_save. Its result contains the actual saved case revision and immutable capture material ID/SHA. If the response is interrupted, repeat the exact original request. The controller looks for that request in the retained case material before checking newer case or source revisions. Reusing the UUID with different arguments is a conflict.

A changed source or case before an unaccepted save requires another current preview and a new request UUID. The exact original request remains the recovery path when completion is uncertain.

## Review and return a native decision

Read merchant_lineage_support_read for the case. Retain the capture ID and SHA, and open its files when needed. Page until nextOffset is null.

A return preview takes:

| Field | Meaning |
| --- | --- |
| id, expectedRevision | Original case UUID and current case revision. |
| captureId | One of this case’s original saved Lineage captures. |
| workspace | The configured owner of that same physical Lineage workspace. |
| decision | acknowledge, assign, resolve, accept or reopen. |
| owner | Current intended owner; required for assign. |
| reason | The operator’s actual explanation. |
| actor | Operator preparing this case decision. |
| reference | Optional original case or business reference. |

Call merchant_lineage_support_return_preview. This reads the current original workspace and incident. It requires the workspace UUID and original creation identity to match the saved capture. The current native revision may be later than the capture’s original revision; both remain visible. The complete current source context is retained again with the reviewed return.

Resolution is refused while the selected native incident is active. Continue the original assessment workflow to record an observed clear condition, or prepare a separately reasoned acceptance if that is the intended operator decision.

Call merchant_lineage_support_return_prepare with the same reviewed fields plus a new retained requestId and expectedPreviewSha256. Preparation saves an immutable intent in the existing case. It contains the exact native action, operation ID, expected native revision, incident ID, decision, owner and reason. The native reason also names the original case, reviewed case revision and saved intent. The operation ID is derived from the case UUID and that original request UUID.

Preparation saves the case record. Execution is a separate explicit action:

    merchant_lineage_support_return_execute {
      id,
      intentId,
      expectedIntentSha256,
      workspace
    }

Use the saved intent ID/SHA; do not recreate the native body from an edited form. The controller confirms the original physical workspace and sends exactly that saved native request. It deliberately allows the existing native command journal to resolve a prior accepted operation before applying a stale expected-revision check.

After the native call, the controller reopens the latest same case and appends the exact result through the existing commissioning writer and case compare-and-save. It preserves concurrent unrelated case changes. An already retained result is returned by identity.

The two recorded outcomes are:

- CONFIRMED: the original native workspace and operation returned its saved incident result and actual new revision.
- REJECTED: the native owner explicitly bound a definite validation/version rejection to this operation and workspace. The rejected intent remains available for review.

A connection failure or unbound server error leaves the saved intent pending. It is not converted into a native rejection. Retry that original intent after reconnecting. If the native call completed but the case append was interrupted or temporarily unavailable, the same intent reopens the original native command receipt and finishes the case append. A completed outcome remains in the original Lineage journal even while its case append needs recovery.

## Complete original files

merchant_lineage_support_file takes the case UUID, exact saved case revision, material ID, expected material SHA and an original filename from the material manifest. Use offset and length to receive all bytes. The maximum range is 262,144 bytes.

The response repeats the case/material/file identity, whole-file SHA and size, range offset and length, base64 bytes, complete and nextOffset. The bridge’s file reader uses nextOffset:null at completion. Its internal original Lineage object reader follows the native numeric end offset, including on the complete final range.

material.json is the entire sealed capture, intent or outcome. Capture and intent source files retain their original bytes and SHA. Native service report JSON, CSV and HTML remain attached to the exact original report/assessment selection.

The current limits are:

| Item | Limit and admission |
| --- | --- |
| Original selected source wire bytes | 16 MiB across the complete capture union. |
| Compact capture context | 24 MiB. |
| Complete serialized case material | 25 MiB, below the original commissioning per-material ceiling of 48 MiB. |
| Complete commissioning record | Original 64 MiB validator, including all existing case history. |
| Complete Support workspace | Original workspace codec’s complete limit, including its other source/service arms. |
| Tool request | 128 KiB; requests select retained native sources rather than carrying their bytes. |
| One material-file range | 262,144 bytes. |

Save performs the same complete preparation checks as preview. Later independent case growth can still invalidate an old case revision. The original compare-and-save then requires a current review.

## Installed command

The installed command is:

    starforge lineage-support <command> --config /private/merchant.json ...

Its source entry can also be run directly:

    node stellar-forge/mcp-merchant-operator/lineage-support/cli.mjs \
      sources --config /private/merchant.json --out /private/source-selection.json

Use the complete original MCP arguments as private UTF-8 JSON in --request:

    starforge lineage-support preview \
      --config /private/merchant.json \
      --request /private/capture-preview.json \
      --out /private/capture-preview-result.json

    starforge lineage-support save \
      --config /private/merchant.json \
      --request /private/original-capture-save.json \
      --out /private/original-capture-save-result.json

The same syntax supports read, return-preview, return-prepare, return-execute and export. Keep the complete request file and UUID before each write. For another live read, choose a new output path. An existing --out is the immutable response to the original tool/request and selected configuration-file identity. Reopening it returns that receipt.

Receive one complete original material file:

    starforge lineage-support file \
      --config /private/merchant.json \
      --request /private/original-file-selection.json \
      --destination /private/received-original.json

The file-selection JSON contains id, revision, materialId, expectedMaterialSha256 and name. The CLI validates the first original response even when the destination already contains the expected bytes. It checks every range and the complete hash, then atomically publishes or verifies the private destination.

Receive the whole original Support customer export:

    starforge lineage-support deliver \
      --config /private/merchant.json \
      --request /private/original-case-export.json \
      --directory /private/customer-case

The export request is {id,expectedRevision,exportId}. Choose one stable original exportId. The CLI calls the original case exporter, reads its original manifest, and streams every declared file from that same configured native export directory. It preserves the original filenames and verifies their sizes and hashes. Repeating the same request and directory verifies the retained output.

The delivery contains case.json, merchant-workspace.json and support-export.json. A commissioning case also includes merchant-commissioning.json, merchant-implementation.html and merchant-implementation-tasks.csv. Existing runtime Support, service reports and other native export files are carried when present. The complete capture/intent/outcome records remain inside the original commissioning data; the handover does not replace them with summaries.

The original case exporter freezes the selected case revision, files plan and generated time under its export request. It resumes an incomplete original export and reopens a complete one after later case edits. See the original Support guide for its full export-status and case-package operations.

For the complete Lineage workspace and editable native application, use merchant_lineage_workspace_export with includeApplication:true, then its original export-read operation. The CLI module’s downloadLineageWorkspace helper streams that actual export selection and validates its whole hash. The receiving entry below performs both complete customer deliveries together.

## Native receiving on the original operated workspace

receiving.mjs exports:

    receiveLineageSupport({
      operator,
      configuration,
      directory,
      selection
    })

operator is the existing MerchantReleaseOperator. configuration is its original loaded configuration. The helper leaves the supplied operator with its existing caller. selection names the real workspace alias and incident ID, actor and 40-character selected source commit. It accepts an original caseId, caseName, metadata, assignmentOwner, assignmentReason, resolutionReason and reference.

The original Service Levels owner must have completed the clear assessment before this full resolution journey starts. The live bridge can capture and assign an active incident during ordinary operation; this complete receiving programme follows the original owner’s clear assessment so it can operate and verify the final resolution.

Run the installed complete source on that equipped original host:

    node stellar-forge/mcp-merchant-operator/lineage-support/receiving.mjs \
      --config /private/original-merchant.json \
      --selection /private/original-lineage-incident-selection.json \
      --directory /private/original-lineage-support-receiving

The full selection file is a private JSON object with workspace, incidentId, actor and sourceCommit. Omitted caseId creates one new original UUID, retained before dispatch. A supplied caseId reuses that existing case. Omitted caseName and metadata preserve the existing case values. Use the same selection and directory on continuation.

The programme:

1. Reads the actual configured native workspace and saved incident, retaining their original identities.
2. Captures the complete current source/report context into the original Support case and downloads its full sealed material.
3. Prepares and saves a reasoned native assignment intent.
4. Saves an unrelated case note through merchant_case_update.
5. Sends that exact saved native intent once through the original Lineage provider. The native operation really commits. Its returned result is retained in the receiving journal before the bridge is allowed to see it.
6. Executes the same saved intent through the bridge. The original native journal supplies the already accepted result, and the case writer appends it while preserving the unrelated note. A second exact execution returns the same case outcome.
7. Reviews, prepares and executes the original clear incident’s resolution.
8. Verifies that the original native command journal has exactly one entry per reviewed operation.
9. Exports the selected complete Support case and original Lineage workspace/application, and receives every original material file by its exact ranged reader.
10. Opens the same case UUID in a named fresh Support store and compares the entire workspace, original Support bytes, metadata and immutable materials.
11. Receives the full native Lineage application and workspace into a fresh directory, checks all original object/application bytes, loads its received store module, and replays the saved native operation bodies. The received state remains byte-equivalent to the original export.
12. Retains the complete result and artifact manifest. Reopening a completed receiving verifies its actual artifacts and both original received projects.

The interrupted return exercise is at the original native-operation boundary: the native action has actually committed before the bridge executes its saved intent. It uses that same original provider, operation ID and command journal. The result identifies this stage as nativeAcceptedBeforeCaseRecovery. It does not claim a network fault that was not introduced.

operation.json and the phases directory preserve the original selection, every exact request before dispatch, and each accepted result. A failed or interrupted step continues those same requests. The result distinguishes the source case revision from the receiving store’s revision while preserving the same case UUID and complete original bytes.

The helper uses the already configured original Lineage server. Fresh receiving opens the named recipient stores and their received application source. It neither invents service observations nor launches a replacement collector. Follow the existing native owner’s interval and selected source when operating it.

## Delivery and current source status

The complete source is prepared as one product with its original owner hooks, installed command, source-owned provider, native receiving and guide. The source review checks cover original event completeness, native file metadata binding, request replay, definite versus uncertain native errors, concurrent case preservation, exact material capacity, client lifetime and full-file output recovery.

A successful source parse or review is separate from the actual equipped receiving result. Record the actual source commit, original operation directory, case/workspace IDs, phase outcomes and final artifact hashes when the original native receiving completes. Continue the existing original Service Levels/SDK/Quality owner operation; its other receiving programmes retain their own selected editions.

The customer uses the saved Support case to review the original evidence and intended action, the retained native outcome to confirm the actual decision, and the complete received Lineage project to continue from its original sources and journal.
