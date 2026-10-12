# Saved fleet rollouts from the terminal and MCP

This guide operates the saved campaign desk in the original merchant fleet release operator. A campaign records ordered waves of retained tenant, slot and release identities. Each wave receives its own review before the original manager prepares and activates it. The same private fleet directory holds campaign decisions, accepted request bodies, pause controls and native outcome history.

The terminal, browser and MCP interfaces share that manager implementation. Choose one foreground owner for a fleet directory. Opening a second interface as another owner does not bypass its original lease. The browser's saved-rollout guide is [CAMPAIGNS.md](../../stellar/scf-starforge-20261009/merchant-fleet-gateway/CAMPAIGNS.md); source and native release behavior remain in [RELEASE_OPERATOR.md](../../stellar/scf-starforge-20261009/merchant-fleet-gateway/RELEASE_OPERATOR.md).

## Open the original installation and fleet

If the fleet is already initialized, keep its existing plan and directory. Start its terminal with the installed command:

~~~sh
starforge fleet-release start \
  --plan /srv/starforge/fleet/fleet-plan.json \
  --directory /srv/starforge/fleet
~~~

An existing separate gateway state directory can be selected with the original --state option. For first initialization, the original bootstrap reads the declared packages, stores and ports:

~~~sh
starforge fleet-release setup \
  --declaration /srv/starforge/inputs/fleet.json \
  --directory /srv/starforge/fleet

starforge fleet-release setup-status \
  --directory /srv/starforge/fleet
~~~

Repeating that setup command resumes the retained setup. Do not initialize a substitute directory to recover an existing campaign.

The existing MCP configuration command is:

~~~sh
starforge merchant-mcp init-fleet \
  --dir /srv/starforge/mcp \
  --plan /srv/starforge/fleet/fleet-plan.json \
  --fleet-directory /srv/starforge/fleet
~~~

Open that configuration through the original stdio launcher:

~~~sh
starforge merchant-mcp-stdio \
  --config /srv/starforge/mcp/merchant-mcp.json
~~~

Its source equivalent is node stdio.mjs --config /absolute/merchant/merchant-mcp.json; the original MCP_MERCHANT_CONFIG environment variable is also supported. The examples below use the already initialized structured call(name, arguments, options), where successful tools return their structured object and errors reject. They do not open an extra connection.

Read merchant_fleet_plan, then merchant_fleet_status. If the original configured fleet is stopped, an explicitly selected merchant_fleet_start call takes the exact plan digest:

~~~js
const plan = await call('merchant_fleet_plan', {});
const status = await call('merchant_fleet_status', {});

// Start only as the selected owner of this retained fleet directory.
const started = status.running ? status : await call('merchant_fleet_start', {
  expectedPlanDigest: plan.digest
});
~~~

Keep started.managerId for the original stop/restart workflow. Campaign tools require that running owner. Reopening after a completed stop obtains a new manager ID; the saved campaigns and accepted requests remain in the same directory.

## Keep the three revisions distinct

| Field | Meaning | Used by |
| --- | --- | --- |
| campaign.revision | Edition of the saved campaign, including approved requests and their outcomes | Save edits, review, advance, rollback and retirement |
| campaign.controlRevision | Independent durable pause control | Pause and unpause |
| campaign.native.revision / inspection.observed.revision | Original gateway revision, expected or currently observed | Native mapping comparisons and exact old-instance retirement |

A campaign may advance while its pause control retains the same revision. A pause changes the control revision without changing the reviewed campaign edition. Use the field named by each operation.

## Save complete ordered waves

First inspect the original fleet plan, status and retained catalogs. Every target must identify a declared tenant and its other slot, with an existing retained release. Use the original stage command if that release still needs preparation:

~~~text
status
catalog TENANT SLOT
stage TENANT SLOT PACKAGE RELEASE_ID
~~~

The following request illustrates two waves. Replace the example release selections with those actually returned by the catalogs. It is input syntax, not a record of an executed deployment.

~~~json
{
  "id": "october-rollout",
  "title": "October  customer rollout",
  "requestId": "october-save-01",
  "waves": [
    {
      "id": "early",
      "label": "First reviewed merchant",
      "targets": [
        {"tenant": "rpc", "slot": "green", "releaseId": "rpc-v2"}
      ]
    },
    {
      "id": "remaining",
      "label": "Remaining reviewed merchant",
      "targets": [
        {"tenant": "python", "slot": "green", "releaseId": "python-v2"}
      ]
    }
  ]
}
~~~

Save the complete request once in a local JSON file before submission. Keep its requestId on every retry. The original request hash includes the supplied field values, including spaces inside strings and an explicitly supplied null; it does not depend on JSON indentation or property order.

In the running terminal:

~~~text
campaign-save @/srv/starforge/requests/october-save.json
campaign-list
campaign-inspect october-rollout
~~~

The filename suffix is preserved. For a filename containing spaces, use a JSON string after @:

~~~text
campaign-save @"/srv/starforge/requests/October  rollout.json"
~~~

Inline JSON is also accepted. Its entire suffix is parsed without splitting and rejoining string contents.

An initial save omits expectedRevision or supplies null. Revising an existing, unstarted campaign requires its observed expectedRevision and a new request ID for the newly selected request. Once a campaign has started, its waves cannot be overwritten. Save another deliberately named campaign when another plan is needed.

The original limits are 32 waves, 256 targets across the waves and 128 saved campaigns. The terminal accepts request JSON up to 8 MiB; the existing MCP fleet provider retains its 128 KiB request limit. A rejected limit does not authorize partial wave submission.

## Review and approve one wave

Read the saved campaign, then request a review at that exact revision:

~~~text
campaign-inspect october-rollout
campaign-review october-rollout OBSERVED_CAMPAIGN_REVISION
~~~

Inspect the complete before/after mapping and source/payment comparisons. The review identifies the wave, current native selection, reviewId and expiresAt. Its approval is held by the current original manager and expires after the native review window.

Only after reviewing that result, retain the approved request:

~~~json
{
  "id": "october-rollout",
  "expectedRevision": 1,
  "requestId": "october-early-01",
  "reviewId": "COPY_THE_ACTUAL_REVIEW_ID"
}
~~~

The number above must be the actual reviewed revision. Submit the saved body with:

~~~text
campaign-advance @/srv/starforge/requests/october-early.json
~~~

The original operator saves the accepted approval before continuing native preparation and activation. A successful response includes its original requestId, the resulting campaign edition, nextWave and native identity. Inspect again before reviewing the next wave.

Changing another fleet route or source can invalidate a review. Read the concrete rejection and current mapping. A new review is appropriate for a request that has not been accepted. An already accepted pending request continues through its exact original body, even if the original short-lived review has since expired.

## Pause during an active request

Pause is the one concurrent campaign mutation. Its separate control revision lets it reach the original manager while an advance or rollback waits for native work. In the terminal, it bypasses the foreground mutation queue. Current status, inspection, list and export reads also remain available while a campaign advance or rollback is active. Other terminal commands retain their input order.

Read controlRevision, retain this exact request, then submit it:

~~~json
{
  "id": "october-rollout",
  "expectedControlRevision": 1,
  "requestId": "october-pause-01",
  "paused": true,
  "reason": "Review the current merchant result"
}
~~~

~~~text
campaign-pause @/srv/starforge/requests/october-pause.json
campaign-inspect october-rollout
~~~

Pause takes effect at the original continuation boundaries. Already accepted native work and its receipts remain intact. An active request may return awaiting: CONTINUE_APPROVED_REQUEST.

Unpause is another explicitly retained request using the current controlRevision:

~~~json
{
  "id": "october-rollout",
  "expectedControlRevision": 2,
  "requestId": "october-unpause-01",
  "paused": false,
  "reason": ""
}
~~~

Unpausing changes only the control. Continue by resubmitting the original advance or rollback file, with its original requestId, expectedRevision and reviewId. Do not replace its revision with the current campaign revision.

Wait for a first save to return before sending pause. An input stream can deliberately send pause while later commands are queued; the pause control does not wait for a queued campaign creation.

## Recover an uncertain response

A transport timeout, aborted caller or process loss does not establish whether the native operation committed. Preserve the exact request file and inspect the original campaign.

| Observed state | Next operation |
| --- | --- |
| Saved request has phase COMPLETE | Use its exact saved result; a repeated identical mutation returns that result |
| Saved request has phase PENDING | Reuse its exact original input to reconcile or continue the accepted operation |
| Inspection says COMMITTED_REQUEST_AVAILABLE | Native activation is observed; replay the original request so its campaign journal records that outcome |
| No matching saved request | Keep the same request ID and original body for an explicitly selected retry; current guards still apply |
| Same ID has a different request hash | Keep both inputs for review; do not replace the original body under that ID |
| Current fleet differs from the saved expected mapping | Inspect the actual relationship and source/rollback options; the client does not rewrite the saved decision |
| Another caller changed the pause control | Inspect the current control; replay an already accepted control request unchanged, or retain a new explicitly reviewed control request |

Pause requests have their own original control journal. Their saved result may show an earlier controlRevision after later pause changes. The replay result is the historical result for that request. Read current inspection separately.

CLI quit and shutdown use the original manager's close lifecycle. The MCP provider requests campaign cancellation before awaiting active calls, alongside its existing staging, client-transfer and delivery shutdown hooks. Accepted native outcomes remain available in the original journals. Reopen the same fleet directory and inspect before continuing.

## Review rollback against the actual current fleet

campaign-inspect returns rollbackTargets with the retained native revision and complete mapping. Each target identifies:

- mode NATIVE_HISTORY or RETAINED_RELEASES;
- availability REVIEW_REQUIRED or SLOT_IN_USE;
- the exact slot-use blockers, including serving/candidate state, draining requests and the running release ID.

REVIEW_REQUIRED means a new review is needed; it is not an approval. SLOT_IN_USE names a conflict that must be resolved through the original slot lifecycle. No rollback request automatically sweeps or stops unrelated slots.

Request a fresh rollback review at the observed campaign revision:

~~~text
campaign-review-rollback october-rollout OBSERVED_CAMPAIGN_REVISION
campaign-review-rollback october-rollout OBSERVED_CAMPAIGN_REVISION TARGET_NATIVE_REVISION
~~~

Omitting the target selects the original baseline. The result's restoreMode identifies the actual restoration path. Its before mapping includes intervening fleet changes, and its comparisons cover the full current mapping.

After reviewing it, save a rollback body with id, expectedRevision, requestId and reviewId, then:

~~~text
campaign-rollback @/srv/starforge/requests/october-rollback.json
~~~

Rollback uses the same exact-request recovery rules as advance. Restoration records a new native revision. Retained release source remains necessary when the original native history path is unavailable.

## Retire only the original drained instance

Old slots remain available while their routed requests drain. Inspection lists the exact instanceId and canRetire decision for each old retained release. Retire only a row whose canRetire is true, using the current campaign revision and inspection.observed.revision:

~~~json
{
  "id": "october-rollout",
  "expectedRevision": 5,
  "requestId": "october-retire-rpc-blue-01",
  "tenant": "rpc",
  "slot": "blue",
  "instanceId": "COPY_THE_ACTUAL_OLD_INSTANCE_ID",
  "expectedNativeRevision": 3
}
~~~

~~~text
campaign-retire @/srv/starforge/requests/october-retire-rpc-blue.json
~~~

The numbers and instance identity must come from the actual inspection. The native routing guard spans the close. Repeating the same accepted retirement request reconciles that original instance; it does not select a replacement child now using the slot.

## MCP tools and typed caller

All ten tools route to the same original campaign desk.

| Tool suffix after merchant_fleet_campaign_ | Typed method | Purpose |
| --- | --- | --- |
| list | list() | Complete saved campaign summaries |
| inspect | inspect({id}) | Plan, pause control, history, pending request, native relationship and retirement/rollback choices |
| save | save(input) | Retain an initial or revised unstarted plan |
| review | review(input) | Review the next exact wave |
| advance | advance(input) | Apply or replay an explicitly approved wave |
| pause | pause(input) | Independent pause/unpause control, callable during advance |
| rollback_review | rollbackReview(input) | Review the selected retained restoration target |
| rollback | rollback(input) | Apply or replay that approved rollback |
| retire | retire(input) | Close one guarded old instance |
| export | export({id}) | Full canonical decision/control document |

The module exports createFleetCampaignClient, fleetCampaignRequestSha256, verifyFleetCampaignExport and FLEET_CAMPAIGN_TOOL_PREFIX. Its adjacent .d.mts file declares all inputs, summaries, native mapping identities, rollback blockers, original request records and discriminated reconciliation results.

The example below belongs in the existing caller that already owns call:

~~~js
import { readFile } from 'node:fs/promises';
import {
  createFleetCampaignClient,
  fleetCampaignRequestSha256,
  verifyFleetCampaignExport
} from './fleet-campaign-client.mjs';

export async function inspectApprovedRequest(call, requestFile) {
  const nativePlan = await call('merchant_fleet_plan', {});
  const owner = await call('merchant_fleet_status', {});
  if (!owner.running) throw new Error('Open the original fleet owner first.');

  const campaigns = createFleetCampaignClient({
    call,
    expectedPlanDigest: nativePlan.digest,
    expectedManagerId: owner.managerId
  });
  try {
    const exact = JSON.parse(await readFile(requestFile, 'utf8'));
    const requestSha256 = fleetCampaignRequestSha256(exact);
    const saved = await campaigns.reconcile('advance', exact);
    const inspected = await campaigns.inspect({id: exact.id});
    return {requestSha256, saved, inspected};
  } finally {
    await campaigns.disconnect();
  }
}
~~~

reconcile is a read-only client convenience over original campaign inspection and request/control records. It returns COMMITTED with the exact saved result, PENDING with the original accepted operation, or NOT_FOUND. It never submits a request, unpauses a campaign, replaces a revision or creates an approval.

The optional expected bindings check the original status before dispatch and verify returned identities. They do not create an atomic lease across other callers; the original provider and manager continue to own operation serialization. Recreate the client only after deliberately selecting the actual new manager following a restart.

Input is copied before asynchronous dispatch. The client refuses non-JSON data instead of dropping undefined fields, converting non-finite values or stripping additional properties. It preserves all valid supplied values and never generates a request ID. Source/business validation stays in the original core.

To apply a previously reviewed request and pause it concurrently:

~~~js
// Both objects were retained before either call. Use actual observed revisions.
const advancing = campaigns.advance(exactApprovedRequest, {timeoutMs: 120000});
const pauseResult = await campaigns.pause(exactPauseRequest);
const waveResult = await advancing;
~~~

The client does not serialize those calls together. The MCP provider permits concurrent campaign pause while other native mutations retain their original serialization. A caller-side timeout or requestSignal abort can leave a saved operation pending or committed; reconcile the same body afterward.

disconnect() rejects new calls and drains this client's already accepted operations. It does not stop the shared fleet or close the provided transport. The original caller still owns merchant_fleet_stop with its exact managerId, or the MCP session's original close. Do not close that owner merely to discard a read-only client.

## Export, verify and reopen the handover

The original export contains the complete campaign plan, waves, pinned releases, approved request bodies, native history and separate pause-control journal:

~~~text
campaign-export october-rollout
campaign-export october-rollout "/srv/starforge/handover/October  rollout.json"
~~~

The file command writes a private 0600 file atomically and syncs it. It returns the exact file path, byte count, byte SHA-256, plan/control revisions and original canonical document SHA-256. Reusing a destination succeeds only when the existing bytes match; it does not overwrite another export edition. Parent directories must already exist.

The full export is also returned by the original MCP tool. Keep the existing connection's response budget large enough for the whole document; do not treat a truncated response as a valid handover. No extra reporting store or export job is created.

~~~js
const captured = await campaigns.export({id: 'october-rollout'});
const verified = verifyFleetCampaignExport(captured);
console.log({
  campaign: verified.plan.id,
  revision: verified.plan.revision,
  controlRevision: verified.control.revision,
  canonicalSha256: verified.sha256
});
~~~

verifyFleetCampaignExport checks the canonical SHA-256 of {schema,planDigest,plan,control}, excluding the checksum field and the MCP managerId. It also checks that the plan and control share their original identity. It preserves all captured fields. A file's SHA-256 additionally covers its serialization and whitespace, so it is a different checksum.

The JSON document is a portable decision and outcome record. Continuing the operation requires the original fleet plan, private fleet/gateway state and retained release/source directories. Reopen those original paths through the installed terminal or original MCP owner; inspect the campaign; then replay only the exact accepted request that remains pending. The exported JSON is not an instruction to initialize a replacement fleet or import an old approval into a different manager.

Keep the accepted request files, campaign export and actual release/source handover together. After a later change, export another named edition so earlier approval and outcome records remain reviewable.

## Source and ownership

The implementation adds the campaign catalog leaf to the existing fleet provider, routes its ten methods through the original MerchantFleet object, and reuses the original release-cli foreground. Pause uses only the provider's declared concurrent-tool seam. The typed client imports Node's SHA-256 implementation and uses the already initialized call; it introduces no provider, payment producer, process controller, database or native request replay engine.

The original campaign core owns decision persistence and exact request replay. The original fleet manager owns routing, child instances, native revisions, source identity, drain and shutdown. These ownership boundaries also apply after a failed response or a receiver restart.
