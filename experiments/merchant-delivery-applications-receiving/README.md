# Merchant delivery Applications receiving

This continuation operates the installed standalone seller and customer products through the original Runtime Workspace Applications interface. It follows the existing managed settlement delivery and direct store receiving journeys. It does not create another seller release store, destination model, installer, or native job.

The selected product is [standalone merge 8b08a9333af070df0e96b6f09f6612eb07eab1ad](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/8b08a9333af070df0e96b6f09f6612eb07eab1ad). Its `merchant-delivery` selection includes both `merchant-delivery` and `delivery-receiving` Applications providers. The continuation checks the installed source bytes before importing those providers or opening state.

## Original operating sequence

Run the original managed receiving journey first, then its direct store companion. Only their actual successful, closed receipts permit this continuation to proceed.

1. Reopen the actual READY merchant-delivery installation and bind it to an original Runtime Workspace used as the Applications control plane.
2. Prepare the seller configuration against the existing managed receipt's `stores.blue` release store. Use Applications to Review, Save, Review start, Start, and Open that seller console.
3. Read the original seller console and its delivery view, capture the actual Applications link navigation and managed startup binding, then stop the original seller application.
4. Prepare customer receiving against the direct journey's existing `received-customer` root. Review, Save, Review start, Start, and Open that same received destination workspace through Applications.
5. Select the retained audit destination and pause it through the original destination UI. Record the actual destination revision, source identity, cursor, and retained delivery state.
6. Stop the customer application and close the Runtime Workspace HTTP console. Reopen the same control workspace, select the saved customer application, review and start it again, and verify that the destination edit remains.
7. Reuse the original completed download and exact transfer identity with `receiveDeliveryWorkspace`. This original receive retry must return the same customer workspace and preserve the later audit edit.
8. Close all owned applications and browser/server handles, verify the original application leases are released, and confirm that the managed and direct receipts have not changed.

The native destination worker is not started to send outbound deliveries in this continuation. The earlier original phases own those provider and delivery behaviors. This phase completes the installed Applications operating path and the customer's later local edit/reopen behavior.

## Required context

The module exports:

```js
export async function runDeliveryApplicationsPhase({
  installedRoot,
  managedOutput,
  directOutput,
  output,
  operation,
  sourcePin,
  node,
  python,
  playwrightModules,
  chromium,
  signal
})
```

| Field | Required original value |
| --- | --- |
| `installedRoot` | The actual READY runtime-install directory created by the original selected installation. It contains `runtime-install.json`, `runtime-profile.json`, and `package/source`. A source checkout is insufficient. |
| `managedOutput` | The completed managed journey's output directory, containing its actual `receipt.json`, private environment reference, and original seller store. |
| `directOutput` | The completed direct journey's output directory, ordinarily `managedOutput/single-release-receiving`. It contains `receipt.json`, `remote-download`, and `received-customer`. |
| `output` | A private, caller-owned directory for this Applications receipt, control workspace, configuration, and screenshots. Retain it for retries. |
| `operation` | `SCF-MANAGED-SF98-DELIVERY-E49D-20261012`, the original receiving operation. |
| `sourcePin` | `8b08a9333af070df0e96b6f09f6612eb07eab1ad`. It must match the actual installed source selection. |
| `node` | The original selected Node executable; defaults to the current process executable. |
| `python` | The original selected Python executable, where supplied by the receiving controller. |
| `playwrightModules` | The original equipped Node dependency root containing Playwright. |
| `chromium` | The original equipped Chromium executable. |
| `signal` | Optional cancellation signal owned by the same receiving controller. |

The managed receipt must actually report `PASS` and `nativeComplete`, `browserComplete`, `mcpComplete`, and `ownedProcessesClosed` as true. The direct receipt must actually report `PASS`, its expected schema and operation, `browserComplete`, `localComplete`, `mcpComplete`, and `ownedProcessesClosed` as true. Its retained managed-receipt SHA-256 and seller path must match the current original managed receipt. These are runtime gates; a source example or an expected completion descriptor does not satisfy them.

The existing private environment file remains in the managed output. The continuation passes its path to the original seller configuration. It does not copy environment values into its receipt or source package.

## Join the existing controller

Call the exported function after both original drivers have returned their successful closed receipts:

```js
const { runDeliveryApplicationsPhase } = await import(applicationsPhaseModule);

await runDeliveryApplicationsPhase({
  installedRoot: actualReadyInstallation,
  managedOutput: originalManagedOutput,
  directOutput: originalDirectOutput,
  output: originalApplicationsOutput,
  operation: 'SCF-MANAGED-SF98-DELIVERY-E49D-20261012',
  sourcePin: '8b08a9333af070df0e96b6f09f6612eb07eab1ad',
  node: selectedNode,
  python: selectedPython,
  playwrightModules: selectedPlaywrightRoot,
  chromium: selectedChromium,
  signal: originalControllerSignal,
});
```

The same module also accepts one retained JSON context file:

```sh
node journey.mjs --context /absolute/original/applications-context.json
```

The controller supplies actual paths after installation and receiving. Keep its existing native operation, admission, source transfer, runtime declarations, and output custody. Include the actual READY installation and existing browser/Node roots in that operation's consumed paths. This module is a sequential phase, not a second scheduler or independent browser job.

## Original request recovery

The original Applications interface creates its own reviewed save and start bodies. The continuation observes those real POSTs and writes each exact request body to its private receipt before allowing the original request to proceed. It retains the response before returning it to the browser. It does not generate a parallel operation key, replace native responses, or mock an application endpoint.

If a browser response is lost, a later invocation reopens the same control workspace and restores the exact pending body to the original Applications recovery UI. The original Recover action then reconciles or replays that request. Saved application IDs are selected from their actual `saveRequestId`, and starts use the original reviewed request. A changed source or conflicting operation fails visibly instead of selecting a replacement store.

Customer pause recovery is bound to the exact destination and expected revision. A resumed phase first compares the retained native response/current destination before considering another edit. JSON-normalized comparison records retain the same meaning after saving and reopening.

Keep the complete `output` directory and original receipts when a phase fails. Do not remove the original Applications journal or issue fresh request IDs to clear an uncertain state. The next invocation of the same phase uses its saved requests, application IDs, and milestones. A completed PASS receipt returns without replaying the UI.

## Interrupted control initialization

The receipt binds the phase-owned `runtime-workspace` and `runtime-home` paths before initialization. A completed `workspace.json` always reopens through the original model. When initialization stops before that record exists, recovery requires an unused control workspace: no workspace ID, runtime ID, saved application or dispatched request has been adopted.

The phase inspects the original six empty initialization directories and bounded private `workspace.json.pending-UUID` files. It saves the complete file hashes and directory identities plus one reserved sibling retention path before atomically moving that partial directory. It then fsyncs the parent, records retention, and calls the original creator on the same selected control path. A later invocation reconciles a move that completed before its receipt write. Unexpected files or populated state stay available for inspection.

## Ownership and shutdown

The phase owns one original Runtime Workspace control directory, its two saved application entries, and its browser/server handles. It does not own the seller's earlier managed/direct receipts or any other application.

Applications workers can outlive their HTTP console. Cleanup first awaits every already-issued POST, discovers the exact saved applications and retains each original `managed-adopt` request. It stops owned application starts through the original model, then waits for each adoption worker's actual `worker.lock` to close. During a long adoption, the phase saves progress and keeps the same worker and request selected. A queued, failed or interrupted adoption with a released worker lease remains available through the original Applications Connect/Recover action. Seller and customer application leases are verified before completion.

Cancellation is propagated through the selected phase. Failure to confirm owned application closure prevents PASS. The receipt retains the failure and original operation IDs for continuation.

## Retained outcome

The phase writes its own `receipt.json` with source selection, original receipt hashes, exact Applications requests and responses, application IDs, browser navigation metadata, customer state observations, milestones, screenshots, attempts, and closure status.

A successful result requires both `browserComplete` and `customerReopenComplete`, confirmed owned-process closure, and unchanged original managed/direct receipt hashes. The state is `PASS` only after those conditions are satisfied.

Private loopback capabilities remain in their original native journals/browser context. Diagnostic strings redact those URL fragments. The receiving controller preserves the completed output alongside the original managed and direct outputs using its existing artifact route.

## Maintained source

- [Seller operation and configuration](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/8b08a9333af070df0e96b6f09f6612eb07eab1ad/products/merchant-delivery)
- [Customer receiving and same-workspace operation](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/8b08a9333af070df0e96b6f09f6612eb07eab1ad/products/merchant-delivery/receiving)
- [Original Runtime Workspace Applications](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/8b08a9333af070df0e96b6f09f6612eb07eab1ad/stellar/scf-starforge-20261009/distribution/runtime-workspace)
- [Original managed receiving source](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/525455c816a49de52e729a15f52d4f9adf9deeb6/experiments/managed-settlement-delivery-acceptance/journey.mjs)
- [Original direct store receiving source](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/263248f386833637ab1cd8caf479904fb655cff6/experiments/single-release-delivery-acceptance/journey.mjs)
