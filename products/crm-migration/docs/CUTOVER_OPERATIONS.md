# Cutover operations

## Working states

Originals, configuration editions, plans, decisions, packets, recorded executions and observations are separate retained states. Changing a configuration does not rewrite an earlier plan. A later decision does not alter an already issued packet; issue another packet from that plan when appropriate.

Plans classify:
- source_change: source changed while destination stayed at baseline.
- target_only: destination changed while source stayed at baseline.
- conflict: both changed differently.
- converged: both now agree.
- baseline_mismatch / baseline_gap: the original common comparison basis is absent or different.
- create: new source record without an observed destination identity.
- source_removed / target_missing: requires explicit preservation or corrected observations.
- relationship additions, removals, destination-only changes and baseline mismatches.

## Named decisions

Every decision retains actor, timestamp, exact change identity and reason. Choose source, destination, explicit custom target value or defer. Missing/removed records can be preserved or deferred while the owner obtains a corrected complete snapshot; a packet does not infer destructive record deletion.

Unresolved decisions prevent a packet. Default source-only changes are selected in the issued packet, destination-only changes are preserved, and the packet names its issuing operator.

## Packet and execution

The ordered proposal creates new records, updates selected properties, removes selected relationship labels and then adds selected labels. Every update retains a before-value; associations retain their before-presence. New records keep source identities until the platform returns actual IDs. Relationship work follows creation and ID assignment.

The files are an implementation handover for the platform lead. Before execution, confirm object types, writable properties, permissions, required fields, automation/enrollment effects and retry behavior in the actual portal. Empty-string property clears are explicit. Record actual job references and completed step IDs afterward. No sample execution is prepopulated.

## Observations and reversal

Post-change reconciliation checks the complete selected destination population and updated crosswalk. It checks all selected fields, retained destination-only work, expected new records and directed relationships. A difference remains visible even if a job reports success.

A guarded reversal permits a property reversal only if the observed value still equals the packet after-value. It refuses to overwrite a later edit. Existing-record reversals also require the current crosswalk to retain the exact target IDs pinned in the issued packet. Swapping a source identity to a different target is a conflict even when that target happens to have the expected value or relationship. Relationship reversals involving a newly created endpoint remain a manual review until its assigned target identity is separately retained. Relationship reversals require their observed after-presence and are ordered with removals before additions. Created records remain a manual review item because later work may depend on them. Reversal is a reviewable proposal; the platform lead controls execution and current-value checks.

## Saving and recovery

Save workspace produces the complete portable JSON with original CSVs and operation history. Download complete working ZIP also includes readable change tables, packet files, expected after-state and observations. Import validates the full operation replay before replacing the open workspace.

Local browser writes compare the previously opened saved hash in one IndexedDB transaction. A different tab's branch is not overwritten. Use Save workspace, then Saved versions to adopt explicitly. Prior branches remain retained; adoption does not invent an extra business revision. If storage is unavailable, work stays in memory and the status requests a download.
