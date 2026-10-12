# Saved merchant fleet rollouts

A saved rollout groups retained merchant releases into ordered waves. Review one wave's complete source, prices and routing changes, then apply that exact decision through the running Fleet manager. Merchants in a wave switch together at one original gateway revision. Later waves wait for their own review.

The **Saved rollouts** desk is part of the existing Fleet workspace. Its terminal and merchant MCP tools use the same plan, source stores, gateway and private manager directory. The [installed Fleet operating guide](../../../products/merchant-fleet/OPERATING.md) covers Applications, installation and host receiving. The [terminal and typed-client guide](../../../stellar-forge/mcp-merchant-operator/FLEET_CAMPAIGN_CLIENT.md) gives complete request examples for each tool.

## Install and open the complete Fleet

Choose **merchant-fleet** in the original runtime workspace's **Build a product** source selection. The committed recipe includes the Fleet Applications entry, original native source workspaces, release operator, saved rollout browser, CLI/MCP client, seller/customer delivery and complete SF101 host recovery. The builder retains the selected recipe, source commit and file identities with the installation.

The same source build is available through the existing distribution command:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace-checkout \
  --ref FULL_SOURCE_COMMIT \
  --selection merchant-fleet \
  --out /absolute/new-fleet-product
~~~

Complete the original runtime profile and installation for the sources you intend to run. Use its READY installed directory in Applications. The recipe carries the native family registrations; the selected runtime profile supplies their actual dependencies and interpreters.

Inspect the installed entries:

~~~sh
starforge registrations --source merchant-fleet-campaigns
starforge registrations --source merchant-fleet-gateway
starforge registrations --command fleet-release
~~~

A new fleet begins with the original bootstrap declaration and private directory:

~~~sh
starforge fleet-release setup \
  --declaration /srv/starforge/inputs/fleet.json \
  --directory /srv/starforge/fleet
~~~

Repeat that exact command to resume interrupted first setup. An existing or received fleet keeps its original plan and manager directory. Follow [BOOTSTRAP.md](./BOOTSTRAP.md) for source declarations, store locations and port allocation.

Open **Merchant fleet** from Applications using [Review → Save → Start → Open](../../../products/merchant-fleet/OPERATING.md#5-review-save-connect-start-and-open). Alternatively, start the original foreground browser:

~~~sh
starforge merchant-fleet-workspace \
  --releases /srv/starforge/fleet/fleet-plan.json \
  --release-state /srv/starforge/fleet \
  --port 8402
~~~

Use one running owner of those directories. Finish the original Applications **Stop**, foreground close or MCP stop before opening the same fleet through another owner. The private Fleet lease and original SF82 store leases establish ownership.

## Prepare the releases and decide the wave order

Use the existing release catalog and **Stage** controls to prepare each target. A rollout target names an actual tenant, another declared slot and an immutable retained release ID. Staging performs the original adapter's source preparation, validation and capture. The saved rollout records that retained release identity.

For a two-slot fleet currently serving blue, a practical first rollout is:

| Wave | Merchant | Target | Operator review |
| --- | --- | --- | --- |
| Pilot | python | green / python-v2 | Check the selected Python source, routes and prices. |
| Remaining | rpc | green / rpc-v2 | Check the JSON-RPC source and prices after observing the first wave. |

Replace these example names with entries in your actual catalogs. Multiple different merchants can share one wave when they should switch together. A wave contains one target per merchant. Later waves may revisit a merchant using its other slot, after the old child has drained and been retired.

The [complete example request](./examples/campaign.json) can be loaded into the terminal or adapted in the browser. It includes a stable request ID:

~~~json
{
  "id": "october-rollout",
  "title": "October merchant release rollout",
  "requestId": "october-save-01",
  "waves": [
    {
      "id": "pilot",
      "label": "First merchant",
      "targets": [
        {"tenant": "python", "slot": "green", "releaseId": "python-v2"}
      ]
    },
    {
      "id": "remaining",
      "label": "Second merchant",
      "targets": [
        {"tenant": "rpc", "slot": "green", "releaseId": "rpc-v2"}
      ]
    }
  ]
}
~~~

Saving pins every target and each expected intermediate mapping against the current whole Fleet. It also records the original baseline revision, snapshot and digest. An unused saved plan can be edited with its observed campaign revision. Once a request has begun, keep that plan's recorded decisions and use its continuation controls.

## Use the browser desk

1. Open **Saved rollouts**, create a proposal, and choose its ID and title.
2. Add waves and choose each target from the original tenant, slot and retained release catalog. Reorder waves before saving.
3. **Save** the complete proposal. Download a local proposal copy if it must move between operator machines.
4. Select the saved plan and choose **Review next wave**. Inspect the full before/after mapping and original route, source and price comparisons. The review expires after ten minutes.
5. Approve that review. The desk retains the complete request before sending it; the manager records the approved comparison and request before native preparation.
6. Read the returned native revision and current serving mapping. Observe the merchant before reviewing the next wave.

The desk pages large comparison lists while retaining the complete review and export. A source or revision change requires a fresh review before a new request is accepted. An already accepted request is continued using its exact original body.

The header keeps three independent observations visible:

| Observation | Meaning |
| --- | --- |
| Campaign revision | Edition of the saved decisions, request progress and history. |
| Control revision | Edition of the separate pause control. |
| Native revision | Original gateway routing revision, with its snapshot and digest. |

Use the revision named by the action. A pause changes the control without replacing a saved approval.

## Pause and continue an accepted wave

**Pause** remains available while a wave is preparing. The manager checks it at native continuation boundaries, including before activation. If the gateway already committed the routing change, that complete native result is retained and pause controls the next continuation.

Pausing preserves the accepted request and its full approved mapping. Unpause that control, inspect the saved pending request, then explicitly continue the same request. Unpausing itself performs no release change.

Closing or restarting the owning workspace can leave an approved or prepared request pending. On reopen:

- Inspect the saved plan and the original current Fleet.
- If the native revision, snapshot digest and complete mapping show the approved commit, the original request reconciles that result.
- If preparation ended before activation, the manager reuses a matching live candidate or prepares the same approved mapping again.
- If the Fleet changed independently, inspect the current mapping and the saved decision before choosing another operation.

A native candidate's lifetime belongs to the original gateway. An expired or lost in-memory candidate does not discard the durable campaign request.

## Recover an interrupted response

The browser stores the exact mutation body locally before dispatch. The campaign journal retains each accepted body and its canonical request hash. Use **Read current state** and **Continue the saved request** after a lost response. A pending operation keeps its original request ID, expected revision and review ID, even when the displayed campaign revision has advanced.

The same rule applies to the terminal and MCP. Retain a request file before submitting it. Repeat its exact contents to reconcile an uncertain result. A completed request returns its recorded result; it does not rerun the wave.

An explicit refused request can be inspected and revised. The browser preserves that refused body and reason in the downloadable proposal. An unreadable or lost response remains attached to its original request until the current native state resolves it.

The relationship field helps choose the next action:

| Relationship | Action |
| --- | --- |
| CURRENT | Review the next saved wave or continue its pending request. |
| COMMITTED_REQUEST_AVAILABLE | Replay the exact pending body to record the matching native outcome. |
| FLEET_CHANGED | Inspect the independent routing change and saved history. A new wave decision needs a plan based on that current mapping. |

A rollback review always compares its selected earlier mapping with the actual whole current mapping, including intervening changes outside the campaign.

## Review and restore an earlier whole mapping

Choose an entry from **Rollback targets** and inspect its availability before reviewing. Targets contain the saved baseline and completed campaign waves. The full mapping includes every merchant, so approving a rollback can restore merchants changed outside the campaign as well.

Two original execution paths are available:

| Review mode | Original behavior |
| --- | --- |
| NATIVE_HISTORY | The gateway still retains that exact snapshot and the Fleet retains its release mapping. The original rollback restores it. |
| RETAINED_RELEASES | The old snapshot has left the gateway's bounded history. The manager verifies the retained release identities, prepares their full mapping through the original release path and activates a new revision. |

The gateway retains sixteen history snapshots. A campaign can have up to thirty-two saved waves, so the desk checks availability against actual current state instead of promising that every earlier snapshot remains in history.

Retained source alone does not establish that its old port is available. The desk distinguishes these cases:

| Slot observation | Required action |
| --- | --- |
| The exact selected release already owns the slot | Review its current source and mapping. |
| A different release is serving on that slot | Choose another available earlier mapping or perform an explicitly reviewed move to a free slot first. |
| A different release belongs to a prepared candidate | Resolve that original candidate before preparing a conflicting mapping. |
| An inactive old child is still draining requests | Wait for its original requests to finish. |
| An inactive old child reports canRetire | Retire that exact instance, then review the retained restoration again. |
| The slot or retained source is unavailable | Restore or select the original required source through its existing workflow, then obtain a fresh review. |

The approval records the exact restoration mode and complete target mapping. Apply that saved request and retain the new native revision. The campaign then records ROLLED_BACK. Further planned changes begin with a new plan based on the restored current Fleet.

## Retire a drained child

Activation changes routing while original in-flight requests finish on the prior child. In **Draining instances**, retire only a row that currently reports canRetire.

The request names its tenant, slot, exact instance ID, campaign revision and observed native revision. The original route guard rechecks that the child is neither serving nor a prepared candidate and has no draining requests before closing it. A repeated accepted retirement reconciles the original instance's completed close.

Retiring a child frees that slot's process and port. Its retained releases, client exports and original delivery state remain in the store. A later approved mapping can reopen a retained release on an available slot.

## Use terminal, MCP and the installed typed client

The original terminal starts with:

~~~sh
starforge fleet-release start \
  --plan /srv/starforge/fleet/fleet-plan.json \
  --directory /srv/starforge/fleet
~~~

Within it:

~~~text
campaign-save @/srv/starforge/requests/october-save.json
campaign-list
campaign-inspect october-rollout
campaign-review october-rollout 1
campaign-advance @/srv/starforge/requests/october-wave-1.json
campaign-pause @/srv/starforge/requests/october-pause.json
campaign-review-rollback october-rollout CAMPAIGN_REVISION TARGET_NATIVE_REVISION
campaign-rollback @/srv/starforge/requests/october-rollback.json
campaign-export october-rollout /srv/starforge/handover/october-rollout.json
~~~

Use actual observed revisions and the returned review ID in each retained request file. Quote a filename with spaces as a JSON string; the CLI preserves its full suffix.

For an existing merchant MCP configuration, use the same fleet directory:

~~~sh
starforge merchant-mcp init-fleet \
  --dir /srv/starforge/mcp \
  --plan /srv/starforge/fleet/fleet-plan.json \
  --fleet-directory /srv/starforge/fleet

starforge merchant-mcp-stdio \
  --config /srv/starforge/mcp/merchant-mcp.json
~~~

The ten merchant_fleet_campaign_* tools call this original desk. The installed typed client is exported from the same package:

~~~js
import {
  createFleetCampaignClient,
  fleetCampaignRequestSha256,
  verifyFleetCampaignExport
} from '@tokenjunkielabs/starforge-merchant/merchant/fleet/campaign-client';

const campaigns = createFleetCampaignClient({
  call,
  expectedPlanDigest: selectedPlan.digest,
  expectedManagerId: runningOwner.managerId
});
try {
  const exact = retainedApprovedRequest;
  const requestSha256 = fleetCampaignRequestSha256(exact);
  const outcome = await campaigns.reconcile('advance', exact);
  const current = await campaigns.inspect({ id: exact.id });
  const exported = verifyFleetCampaignExport(
    await campaigns.export({ id: exact.id })
  );
  // Keep outcome, current, requestSha256 and exported with the operator handoff.
} finally {
  await campaigns.disconnect();
}
~~~

Here call is the caller's already initialized structured MCP call. The client drains its own calls on disconnect; the original caller retains the connection and Fleet lifecycle. See [FLEET_CAMPAIGN_CLIENT.md](../../../stellar-forge/mcp-merchant-operator/FLEET_CAMPAIGN_CLIENT.md) for full mutation, reconciliation, concurrency and file-export examples.

## Export and receive the complete operation

**Download campaign** captures the complete plan, source pins, approvals, exact requests, outcome history and pause control. Its canonical SHA-256 covers the plan and control together. Keep another named export after later changes so earlier decisions remain available.

To move the operating Fleet to another host, use the existing [complete SF101 Fleet recovery](./RECOVERY.md) workflow after all original owners have stopped. Its selected private roots include the manager's campaigns directory, gateway state and original slot stores. The receiver restores the original paths and plan identity together with the retained release sources.

After receiving, review the actual installed runtime and current Applications settings, open the original manager directory, inspect the saved rollout, and continue any exact accepted request. The JSON campaign export provides a portable decision record; execution resumes from the received whole Fleet state.

## Limits and practical recovery

The desk permits 128 saved campaigns per Fleet, 32 waves and 256 total merchant targets per campaign, 256 accepted requests in each plan/control journal, and 2,048 campaign history entries. Each private persisted document is bounded to 8 MiB. Create a new campaign from the current mapping when a completed operation needs a new sequence.

| Original error | Useful next step |
| --- | --- |
| FLEET_CAMPAIGN_REVISION_CHANGED | Inspect the current saved campaign. Reuse an accepted exact request or review a new decision from the observed revision. |
| FLEET_CAMPAIGN_CONTROL_REVISION_CHANGED | Read the current pause control before preparing a new pause/unpause request. |
| FLEET_CAMPAIGN_REQUEST_ID_REUSED | Keep the earlier body and use it for recovery. A different operation needs its own request ID. |
| FLEET_CAMPAIGN_OTHER_CANDIDATE_PRESENT | Resolve the current native candidate before preparing a different mapping. |
| FLEET_CAMPAIGN_APPROVED_SOURCE_CHANGED | Inspect the retained releases and saved source pins before approving replacement work. |
| FLEET_CAMPAIGN_DRAIN_REQUIRED | Read the exact instance's current serving, candidate and draining state. |
| FLEET_CAMPAIGN_COMMIT_UNRESOLVED | Preserve the request and original native/link journals, then inspect their exact revision and mapping relationship. |

The original [release operator](./RELEASE_OPERATOR.md), [operations desk](./FLEET_OPERATIONS.md), [client handover](./CLIENT_HANDOVER.md), [discovery](./DISCOVERY.md) and [settlement delivery](./DELIVERY.md) remain available in the same workspace throughout this lifecycle.
