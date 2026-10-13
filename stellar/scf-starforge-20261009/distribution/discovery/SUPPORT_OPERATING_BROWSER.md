# Support procedures in Operating Plans

Open **Support procedure** from Command Finder or from the existing Operating Plans workspace. The page prepares and retains an ordinary customer operating plan. The original Support workspace continues to own observations, authority, response work, recovery, and its returned artifacts.

## 1. Retain the selected source

Use the compact source descriptor from the original Support source exporter. Choose its JSON file or enter its complete JSON, then select **Review source**.

The review shows the original case ID and selected revision, its ancestor chain, source artifacts, original observations and available returned evidence. A selected file also shows its exact byte count and SHA-256. A failed observation can have null native identity fields; the interface retains those nulls and never manufactures an observed session or timestamp.

**Download entered source** retains the exact entered JSON. Keep this descriptor with the full native source package and eventual complete plan. The descriptor is not a replacement for its referenced original artifacts.

The browser accepts UTF-8 JSON up to 32 MiB. It does not ask for credentials, open another Support listener, or run the selected commands.

## 2. Review a complete procedure

Enter the stable plan ID, title, customer, operating owner and period. The generated ID remains fixed while you preview and create this plan.

The procedure contains seven phases:

1. Retain original sources.
2. Review authority and scope.
3. Review original observations.
4. Perform the selected response.
5. Verify recovery and continuation.
6. Retain the customer case.
7. Receive the complete handover.

Each phase can select an actual current Command Finder registration or remain a manual step. The complete selected registration, source records and declared runtime groups remain with that step. Its exact command argument array is entered separately. **Use selected command help** copies only that registration’s existing help arguments; review and enter the intended operation and paths before performing work.

**Select for Support procedure** in a Command Finder result highlights that exact registration in every phase selector. It does not choose a phase for you.

Choose **Preview procedure**. Review the source binding, all seven ordered steps, owner, expected outcomes, registrations and commands. All new steps are planned. **Create reviewed procedure** saves the reviewed plan through the original Operating Plans transaction. Inputs or catalog changes invalidate the preview. The same ID cannot silently replace an existing plan.

Continue normal step editing, draft recovery and saved revisions in the original editor. Change individual step owners there if different people perform different phases. Readable handovers and complete editable JSON keep the original plan format.

## 3. Record actual returned evidence

Open the saved Support plan and load the returned compact source descriptor. The source must refer to the original case revision or retain that revision in its ancestor chain. A different case or unsupported revision is rejected by the original adapter.

Select the exact receiving step and a recorded work status. Enter a reviewing operator where applicable. The returned result is a compact reviewed JSON value:

~~~json
{
  "summary": "The operator's reviewed result and continuation",
  "evidenceIds": []
}
~~~

Use **Include this reference** beside an actual evidence row to add its exact ID. Inspect its complete artifact identity before using it. You can also choose a supplied returned-result JSON file. The interface does not infer completion from an artifact name, a queue row or a manual status choice. Recording completed work requires at least one valid returned evidence reference.

Choose **Review result revision** to inspect the complete proposed plan and its original history. The preview freezes the source, selected plan, step, status, result and operator. If any changes, review again.

**Save reviewed result revision** retains the existing local working draft, rechecks the selection, then uses the same complete-history receiving transaction. It does not overwrite concurrent divergent revisions. If receiving reports a conflict, the reviewed result plan remains available to download and the original editor can retain it as a separate copy. No native action or case mutation is replayed.

## 4. Reopen and receive

Use **Complete editable JSON** in Operating Plans, or **Download current saved plan** in the Support section, to retain every saved revision. Keep its compact Support source descriptor and original source/result package alongside it.

Use **Import complete plan** for a returned complete plan. Identical history is reused, an older identical prefix preserves the newer local head, and divergent shared revisions require a separate copy. The existing browser origin, IndexedDB store, session drafts and recovery controls continue to apply.

Use the same local listener address to reopen browser plans. The complete plan JSON is the portable source for another computer or browser; the native package retains the original artifacts, case and continuation separately.

## Maintained integration

The additive browser controller is `public/support-operating-plan.mjs`. It uses the browser-safe `support-operating-plan.mjs` adapter through `/support-operating-core/support-operating-plan.mjs`. That static subtree serves the exact maintained adapter, OperatingPlan model and import-free catalog at their original relative paths; Node module imports remain unchanged.

The original editor supplies its catalog, current saved plan, busy/error boundary, draft retention and existing `addPlan` / `receivePlan` transactions. There is no second plan database, scheduler, case store or execution route. Existing toolkit catalog export, Command Finder search, generic plans, customer integrations and original revision semantics remain in their existing source.

A recorded plan status describes the operator’s work. Native observation identity, source completeness and original returned artifacts remain separate, explicit facts in the selected source and result.
