# Continue the original delivery receiving through a saved fleet rollout

This continuation uses the four original release stores produced by the managed SF98 receiving operation. It completes a saved two-merchant rollout through the actual browser, terminal and MCP provider, then restores the original whole mapping after its native gateway snapshot has aged out.

The selected product is standalone commit `e316fc9db6ef67949938b560a36c4700bf38410b`, merged in [PR 354](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/pull/354). The original operation remains `SCF-MANAGED-SF98-DELIVERY-E49D-20261012`. This phase is appended after managed receiving, direct single-store receiving, and the actual installed Applications continuation have finished and closed their owned processes.

## Required retained inputs

The function `runFleetCampaignPhase(context)` and the command `journey.mjs --context FILE` use the same context.

| Field | Required value |
| --- | --- |
| `sourceRoot` | Absolute canonical source directory containing the exact selected e316 product and its original import/runtime dependencies. An installed source directory may be used if its actual bytes match. |
| `sourcePin` | `e316fc9db6ef67949938b560a36c4700bf38410b`. |
| `operation` | `SCF-MANAGED-SF98-DELIVERY-E49D-20261012`. |
| `managedOutput` | Original private managed receiving output, including its complete `receipt.json`, fleet plan, four stores, relocated Python packages and `private-environment.json`. |
| `directOutput` | Original private direct receiving output and its complete receipt bound to this exact managed receipt and blue release store. |
| `applicationsOutput` | Original private Applications phase output and its complete receipt bound to both earlier receipts. |
| `output` | This phase's own private output directory. Keep the same directory on continuation. Its parent must already exist. |
| `node` | Absolute path of the original selected Node executable running this phase. |
| `python` | Exact Python interpreter retained in the original merchant declarations. |
| `playwrightModules` | Existing Node modules directory containing the original Playwright installation. |
| `chromium` | Existing Chromium executable used by the original browser receiving. |
| `signal` | Optional native AbortSignal for an in-process caller. CLI SIGINT/SIGTERM use this same cancellation path. |

The source must provide the original x402 packages through normal Node resolution. This module creates no dependency installation. Its browser uses the selected existing Playwright and Chromium. The original private environment is loaded into the same process through `applicationEnvironment`; inherited values are restored after all children close.

The three input receipts must be real completed receipts:

- Managed receiving has `state: "PASS"`, native/browser/MCP completion and `ownedProcessesClosed: true`.
- Direct receiving has its actual local/browser/MCP completion and exact managed receipt SHA-256, directory and original release-store binding.
- Applications has actual browser/customer reopen completion, closed owned processes, selected product `8b08a9333af070df0e96b6f09f6612eb07eab1ad`, and the exact two earlier receipt hashes.

The Applications phase itself requires a real READY installed runtime. Its original selection stays at 8b08; this later phase uses the e316 rollout source after Applications closes. A checkout does not replace that READY prerequisite.

The phase verifies 29 exact original source blobs, including all 22 merged rollout files and the specific SF82 release, Python, outbox, Applications environment, MCP server and provider-contract seams it imports. Complete original dependencies remain necessary beyond those verification rows.

## Append it to the same receiving controller

The existing managed/direct/Applications controller owns source preparation, admission and final artifact saving. After its actual Applications receipt passes, invoke this phase in that same admitted foreground. Use a new source view for e316 and preserve the earlier source selections and receipt bytes.

An in-process extension is:

```javascript
const { runFleetCampaignPhase } = await import(campaignJourneyURL);
await runFleetCampaignPhase({
  sourceRoot: selectedCampaignSource,
  sourcePin: 'e316fc9db6ef67949938b560a36c4700bf38410b',
  operation: 'SCF-MANAGED-SF98-DELIVERY-E49D-20261012',
  managedOutput,
  directOutput,
  applicationsOutput,
  output: campaignOutput,
  node: selectedNode,
  python: selectedPython,
  playwrightModules: existingPlaywrightModules,
  chromium: existingChromium,
  signal
});
```

For a sequential child, first save that exact context as private JSON, then use the original selected executable:

```sh
"$NODE" "$CAMPAIGN_SOURCE/experiments/fleet-campaign-receiving/journey.mjs" \
  --context "$ORIGINAL_OUTPUT/campaign-context.json"
```

Set `TMPDIR`, `TMP` and `TEMP` to the original admitted output's private temporary directory before launching Node or Chromium. Run materialization, receiving, this phase and final artifact persistence within one retained foreground lifetime. A private `/dev` source/output may disappear when that lifetime closes.

The phase acquires one original Applications `operationLease` on its own `campaign-phase.lock`. It does not create another fleet manager while the browser, terminal or MCP manager is active. Each owner closes before the next opens the same fleet directory. It creates no additional admission record or supervisor.

## What the complete continuation does

### 1. Retain source identity and stage the next releases

It reopens the original moved Python packages and checks their exact merchant/application hashes. It copies those original two-file packages into its own output and changes only their native declared prices:

| Original store | Additional release | Price |
| --- | --- | --- |
| Reference / green | `campaign-reference-v2` | 30000 |
| Python / blue | `campaign-python-v3` | 40000 |
| Reference / blue | `campaign-reference-v3` | 45000 |

The existing Python / green `python-v2` remains 25000. Both original blue baseline releases remain 20000.

Each additional release uses the original `preparePythonRelease` and `stageRelease` APIs, fixed slot port and original local facilitator setting. Staging verifies that it has not changed the store's active release or generation. An interrupted stage adopts an existing exact immutable release ID only after matching its prepared Python identity, label, source origin, runtime and release digest.

New fixture and request files are written through private temporary files, fsync and create-only links. A partial write cannot become the selected final file. Existing final input bytes must match exactly.

### 2. Save and pause the first whole wave in the browser

The proposal contains 17 ordered waves, each replacing both merchants in one original mapping. Odd waves select green; even waves select the newer blue releases.

The actual browser imports the proposal and saves it. The driver retains the exact successful native Save response, then drops that response to the browser. It reopens and replays the same original request and verifies the original journal result.

A real review displays both merchants. During original native preparation, the local fixture holds a single `/supported` response. The browser's Pause button must remain usable and commit its original pause control before that response is released. The wave finishes preparation while remaining paused: the pending request is retained, and native revision 3 is unchanged. The downloaded proposal retains that exact request.

Desktop and 390-pixel mobile views are captured. Horizontal page overflow fails the phase.

### 3. Resume the approved request through MCP and drain the original paid call

The same managed MCP configuration reopens the fleet and exposes all ten campaign tools. The original typed client reuses that initialized call function, selected plan digest and actual manager ID.

The first browser request is resumed exactly after reopen. While original preparation is held, an independent MCP Pause must reach the same owner. Continuing retains the same reviewed request.

The original Python blue release then accepts one original x402 payment request. Its local `/settle` response is held while the first whole wave activates. The driver loses the returned MCP activation response after the original commit, reconciles the saved request as COMMITTED, and replays it without another activation.

The old blue process must remain owned with a draining request. Its original retirement must refuse with `FLEET_CAMPAIGN_DRAIN_REQUIRED`. After the held settlement is released, the HTTP response must contain the original Python result: count 4, mean 5, rolling means [2, 3, 5, 7]. The corresponding original SF98 event is located by its retained order reference and verified at amount 20000. Only then is the drained original process retired.

The second wave is applied through the same MCP client. A held, already returned export response also verifies that client disconnect waits for its own accepted call while the original fleet owner remains running.

The facilitator is the original explicitly local receiving fixture. Its deterministic HTTP responses are recorded as fixture execution; the phase sends no public-chain transaction.

### 4. Show why an occupied serving slot cannot be restored yet

At wave 2, both blue ports serve the newer releases. The baseline mapping points to those occupied ports. The original browser must show both serving-slot blockers and disable restoration review. It explains that the serving release must first move through a reviewed wave to free the slot. It does not offer retirement of the serving process.

### 5. Finish 17 waves through the actual terminal

The phase starts the original `release-cli.mjs start --plan ... --directory ...` process and uses its real stdin/stdout protocol.

The third wave exercises the same terminal's concurrent status and pause while its advance is held in native preparation. All mutations use retained exact JSON request files. Their directory name contains repeated spaces, exercising the CLI's original `@FILE` parsing without splitting and rejoining the path.

Waves 3–17 alternate the same original green and newer blue releases. Each advances the native mapping exactly once, records two merchants, and retires only drained inactive owned processes. The final native revision is 20.

After 17 real waves, the original 16-entry gateway history no longer contains baseline revision 3. The campaign must still offer that whole saved mapping as `RETAINED_RELEASES` with usable slots. The terminal exports and reopens the same create-only campaign document at a filename containing repeated spaces; file hash and canonical campaign checksum must match.

### 6. Restore the retained whole mapping and reopen it

The original browser reviews baseline revision 3 using the retained release restoration path. The review and downloaded approval must contain the exact original two-merchant mapping. It applies that approval and deliberately loses the returned successful response.

The result must be one `ROLLED_BACK` history entry, native revision 21, and both original 20000 prices. A final MCP reopen reconciles and replays the exact saved rollback request, verifies the complete 17-wave/one-rollback export, and reads both original paid-route challenges.

## Interruption and close behavior

Keep the same output, original state directories and original source selections when repeating the context. The phase preserves its exact request bodies before native calls, binds its own receipt to all original input receipt hashes, and reuses already completed milestones.

A saved request whose original review has expired is replayed first. Only a definite original missing-review refusal plus absence from the native request journal permits a fresh review. The old request and refusal remain retained. Pause recovery likewise retains previous accepted controls and uses the current original control revision; it cannot mistake an old replayed pause result for the current pause state.

A paused or prepared native request remains the original request on reopen. The native manager is allowed to re-prepare its original candidate after its previous owner has closed. A committed activation is reconciled from the original journal and does not become another wave.

Cleanup starts the original owner cancellation before releasing any held fixture response. It then drains accepted browser/MCP/terminal calls, closes its browser and facilitator, and checks every original SF82 store. All four native runtime states must actually be STOPPED with no live child before `ownedProcessesClosed` becomes true. The terminal's owned child must really exit; a timeout is not recorded as closure.

A missing or contradictory original paid-drain observation remains an unfinished phase requiring examination of that retained request/event. The module does not silently repeat a paid request to make an interrupted observation look complete.

## Retained outputs

The separate `receipt.json` records source hashes, earlier receipt bindings, exact request bodies and hashes, native mappings/revisions, pause gates, original event identity, browser captures, terminal exit/transcript identity and final closure. The earlier three receipts and original operator plan are checked again byte-for-byte at close.

Useful review files include:

- `original-rollout-proposal.json` and `browser-paused-proposal.json`.
- Exact request JSON under `Requests  and approvals/`.
- `completed  seventeen-wave-plan.json`.
- `retained-release-restoration-review.json`.
- `completed-campaign-export.json`.
- `terminal-last-transcript.json` and desktop/mobile PNGs.

The original outer controller should persist the complete receiving summary and a continuation archive before closing its foreground. Keep original data, requests, stores and receipts. Browser temporary profiles and runtime dependencies are reproducible inputs; screenshots can be saved separately.

A source parse establishes grammar. The complete receiving result is established only by this original native/browser/terminal/MCP sequence and its actual retained receipt.
