# Installed migration cutover

Cutover planning is a companion workspace inside the existing CRM application. It shares that application's private directory, writer lease, authenticated listener, retained exports and customer-agent attachment. It keeps its own full operation history and original state identity.

Open the CRM desk through Applications, then choose **Cutover planning**. The first opening creates an empty companion for that CRM workspace. The original CRM comparisons, HubSpot captures and mapping/review history remain in the same host.

## Complete working sequence

1. Retain four editions for each selected object and directed relationship: baseline source, current source, baseline target and current target. Retain the explicit source-to-target identifier crosswalk.
2. Choose **Import retained CRM sources** to select existing originals or completed HubSpot target captures from the CRM desk. Read the source IDs, editions and hashes; give each received cutover original a distinct ID. All selected originals are copied byte-for-byte in one transaction. The original request retains the selected CRM edition and full source data.
3. Configure objects, compared fields, source/target enum mappings and directed relationship types using the normal forms. Every relationship type carries its actual category, type ID and direction; primary-company behavior is explicit.
4. Build the four-snapshot plan. Review source-only changes, target-only work, conflicting edits, added or removed identities and relationship changes against their retained original rows. Record named choices and reasons for decisions.
5. Issue an ordered packet. The packet keeps the selected plan, complete decisions, before-values, expected after-state and ordered proposal. Record actual platform execution references and dates separately when work has occurred.
6. Import complete observed target exports and crosswalks, then reconcile against the issued packet. Retain each observed edition and reconciliation.
7. Check reversal conditions against selected observed originals. Existing endpoint identities must match the packet's retained target IDs; changed mappings and changed after-values become conflicts. New record endpoints require separately retained assignment before automatic reversal eligibility. The installed host saves the entire reversal check, original observation selections, packet/workspace hashes, operator and time.

The operator prepares and reviews cutover work. Actual platform changes remain with the implementation lead and their existing execution process. Source acquisition through the HubSpot connector reads the selected portal; it does not execute these proposed changes.

## Restart and receiving

Every managed operation is saved locally as its full original request and base-workspace SHA before dispatch. **Recover saved operation** reconciles an uncertain outcome. A committed identical retry preserves later work. An uncommitted request can only apply to its original base edition. The same protection covers complete source intake from CRM, whose staged original request is also retained on the host.

Use **Save pending request** to preserve an unfinished request outside the current browser origin. **Open pending request** verifies its exact digest, CRM/cutover identities and original branch through the actual host before receiving it. The ordinary Save workspace action also saves a pending request. Save offline desk retains the workspace and any unfinished request continuation; its ordinary offline editor keeps independent explicit local versions.

The managed complete ZIP is created and retained by the host at the selected cutover SHA. Its download is read in byte ranges and checked against the complete SHA. It includes original CSVs, all configurations/plans/decisions/packets, actual execution records, post-change reconciliations, original source-intake requests and saved reversal checks. Ordinary CRM working-bundle export also includes this companion under cutover/.

## Native commands

Use the installed crm-migration command. Close Applications for standalone writer commands. All paths are absolute physical host paths; output directories and files are owner-private.

    crm-migration cutover-inspect /ABSOLUTE/CRM
    crm-migration cutover-course /ABSOLUTE/NEW_CRM
    crm-migration cutover-receive /ABSOLUTE/NEW_CRM /ABSOLUTE/PRIVATE/cutover.workspace.json
    crm-migration cutover-apply /ABSOLUTE/CRM BASE_CUTOVER_SHA /ABSOLUTE/PRIVATE/operation.json
    crm-migration cutover-workspace /ABSOLUTE/CRM /ABSOLUTE/PRIVATE/current-cutover.json
    crm-migration cutover-desk /ABSOLUTE/CRM /ABSOLUTE/PRIVATE/cutover.html
    crm-migration cutover-export /ABSOLUTE/CRM CURRENT_CUTOVER_SHA /ABSOLUTE/PRIVATE/cutover.zip
    crm-migration cutover-reversal /ABSOLUTE/CRM /ABSOLUTE/PRIVATE/reversal-request.json

A new CRM host must first be initialized through the ordinary init/course/receive command. Receive/course will only initialize an absent cutover companion or reuse the exact already-received archive. It will not replace an existing different companion. This preserves its original identity and history.

With Applications running, use cutover-connected DIRECTORY REQUEST.json. The request is {action,args}; the typed CrmClient.cutover method accepts the same declared operations. state reads the full archive; summary, action, requestStatus, crmSources, reversal, reversalState and export use the existing authenticated listener.

A managed action request is:

    {
      "action": "action",
      "args": {
        "baseSha256": "THE_ORIGINAL_CUTOVER_SHA",
        "operation": {
          "id": "one-stable-operation-id",
          "actor": "Named operator",
          "at": "2026-10-14T12:00:00.000Z",
          "expected_revision": 0,
          "kind": "bridge_crm_sources",
          "payload": {
            "crmSha256": "THE_SELECTED_CRM_SHA",
            "sources": [
              {"crmSourceId": "contacts-first", "sourceId": "contacts-baseline"}
            ]
          }
        }
      }
    }

Retain that exact request for retry. New source IDs must be unused, and the selected original source bytes are retained without rewriting their values.

## Customer-agent operation

merchant_crm_cutover uses the existing configured CRM workspace alias and connection:

- status: current companion identity, revision and summary.
- browser: original private cutover application link.
- crm_sources: retained CRM source IDs, metadata and current CRM SHA.
- action: configure, plan, decide, issue_packet, reconcile, record_execution or bridge_crm_sources with the complete original operation and baseSha256.
- request_status: verify a saved request against its original branch or identical committed operations.
- inspect: hash-bound pages of sources, original rows, configurations, plans, changes, issues, decisions, packets, steps, reconciliations, findings, operations and executions.
- reversal: retain a full check for exact expectedSha256, packet id, observed source selections, actor and at; returns its retained SHA and result counts.
- reversal_result: read ready, conflicts or manual rows from the retained reversal check by id and offset.
- export: retain the exact current companion ZIP; merchant_crm_file receives every byte using the existing file route.

## Authored complete course

The retained donor course has 32 complete originals and 41 operations. It produces 15 changes, four named decisions and ten ordered proposal steps. A late target edit produces one reconciliation finding; the complete expected observation produces zero. Identity-bound reversal retains existing target IDs and separates newly created endpoints for assignment review. These are authored examples.

cutover/examples/workspace.json and Cutover_Desk.html are complete portable starting points. source-history/generic-cutover.gzip.json retains all 94 original generic donor files, with their original identities and dependency closure. The installed source composes the same model and forms with the maintained CRM writer and recovery behavior.
