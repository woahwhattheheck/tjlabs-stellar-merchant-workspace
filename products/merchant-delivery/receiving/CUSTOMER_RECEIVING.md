# Customer delivery receiving

**Received merchant delivery** opens a completed customer transfer in the original SF98 destination workspace. The customer keeps the received source events, destination enrollments, cursors, delivery attempts and later local changes in one private directory. Applications owns the process that serves its original browser and signed delivery controls.

The application kind is `delivery-receiving`. The seller's **Merchant delivery and releases** application continues to use its own original release store. Both applications are available in the `merchant-delivery` source selection.

## 1. Receive the completed transfer

Use the original transfer ID and exchange fingerprint from the seller's returned manifest. The complete download contains `delivery-files.json`, the retained download state and `exchange/`. Its downloader has retained the exact source and destination journal members.

~~~sh
starforge delivery-receive receive \
  --download /srv/starforge/downloads/customer-handover-v1 \
  --id ORIGINAL_TRANSFER_ID \
  --fingerprint ORIGINAL_EXCHANGE_SHA256 \
  --received /srv/starforge/customer/received-delivery
~~~

The receiving parent must be a private, canonical directory owned by the current operator. Choose a new receiving directory on its first use. `ORIGINAL_TRANSFER_ID` and `ORIGINAL_EXCHANGE_SHA256` are values from that transfer's actual manifest.

This command reopens the original retained download, verifies every selected member and delegates to the original SF98 receiver. The result identifies the original exchange, receiving receipt and current workspace.

| Received path | Authority |
| --- | --- |
| `received.json` | Original exchange fingerprint, source identities and receiving timestamp |
| `source/` | Captured original settlement event journal |
| `workspace/workspace.json` | Original binding to that received source |
| `workspace/destinations/` | Customer destination enrollments, cursors and delivery history |
| `workspace/worker.json` and original owner files | Native worker history and current ownership |

If the receive response is lost, repeat the same command with the same download, ID, fingerprint and receiving directory. The original receipt reopens and the current customer destination state is preserved. A different exchange or conflicting receipt returns an error while retaining the existing directory.

The received source is the captured journal at that handover. Ongoing seller receipts arrive through a subsequent deliberate seller transfer.

## 2. Inspect and reopen the same state

After receiving, inspect using the original receipt alone:

~~~sh
starforge delivery-receive inspect \
  --received /srv/starforge/customer/received-delivery \
  --fingerprint ORIGINAL_EXCHANGE_SHA256
~~~

The original download and seller connection can be elsewhere after receiving. Inspection uses `received.json`, its bound source and the current original SF98 model. It reports the receipt hash, source fingerprint, current destination revisions, continuity and worker ownership.

Keep `received.json`, `source/` and `workspace/` together. The native workspace binds its original absolute source path. Use the original portable export and receiving commands in the final section when moving current customer state to another root or host.

## 3. Install and attach the product

Use the completed `merchant-delivery` package and original native installer described in [Merchant delivery and releases](../OPERATING.md#installed-product-and-original-source). That selection includes this receiving leaf and the original SF98 UI, signed transport, receiver, runtime and Applications modules.

Attach the READY runtime to the existing runtime workspace:

~~~sh
starforge runtime-workspace attach \
  --workspace /srv/starforge/runtime-workspace \
  --runtime /srv/starforge/runtimes/delivery-01 \
  --label "Customer delivery"

starforge runtime-workspace serve \
  --workspace /srv/starforge/runtime-workspace --port 8465
~~~

Retain the actual `runtimeId` returned by attach or status. In **Applications**, select that runtime and **Received merchant delivery**. Set:

| Setting | Value |
| --- | --- |
| Received delivery directory | The root containing `received.json`, such as `/srv/starforge/customer/received-delivery` |
| Local port | `0` chooses an available loopback port |
| Private environment JSON | Optional existing private file containing the original signing environment names and their values |

The application asks for the receiving root. Its native destination workspace is the `workspace/` directory inside that root.

Review, save, review start and start through the original Applications workflow. The **Open** action is published after the adapter verifies the installed source, received receipt, private directory identities, original operation ID, actual child PID, original HTML and live `/api/state` response. The destination controls are served by the original SF98 handler, including its original session and origin checks.

The managed process has one lease beside the received receipt. Applications also retains its original per-resource operation ownership. Normal destination edits, synchronized events, delivery attempts and worker updates remain usable because they are outside the immutable receipt binding. A replaced receiving directory, receipt, source binding or installed source requires a fresh original review.

## 4. Prepare a reusable Applications configuration

For a file-based handover, prepare the same original review input from a private selection file. This example uses an illustrative runtime ID; replace it with the actual returned 24-character ID and use your actual paths:

~~~json
{
  "schema": "tjlabs.delivery-receiving.application-selection.v1",
  "runtimeWorkspace": "/srv/starforge/runtime-workspace",
  "runtimeId": "000000000000000000000000",
  "runtimeDirectory": "/srv/starforge/runtimes/delivery-01",
  "label": "Customer delivery",
  "receivedDirectory": "/srv/starforge/customer/received-delivery",
  "port": 0,
  "environmentFile": "/srv/starforge/private/customer-delivery-environment.json"
}
~~~

Omit `environmentFile` when the original process environment supplies the required references. To update a saved application, include its actual `applicationId` and `expectedRevision`. An optional `homeId` selects an existing original managed home.

~~~sh
starforge delivery-receiving-configure configure \
  --selection /srv/starforge/private/customer-delivery-selection.json \
  --out /srv/starforge/configurations/customer-delivery
~~~

The output parent must already be private. Keep the output separate from the received directory, installed runtime and runtime workspace.

| Prepared file | Use |
| --- | --- |
| `selection.json` | Exact operator selection |
| `application-review.json` | Input to the original Applications review |
| `original-receiving.json` | Immutable receiving receipt, source and directory identities |
| `configuration-manifest.json` | Exact byte counts and hashes of the three prepared files |

A complete matching configuration reopens unchanged. A matching interrupted preparation verifies every existing file before creating only the missing files. Later destination edits and worker observations are read from the original model; they do not change the retained configuration identity. Changed or unrelated files remain available for inspection. Applications obtains a current review before a later start.

### Retain original save and start requests

~~~sh
starforge runtime-workspace application-review \
  --workspace /srv/starforge/runtime-workspace \
  --request /srv/starforge/configurations/customer-delivery/application-review.json \
  > /srv/starforge/private/customer-delivery-save-review.json

starforge delivery-receiving-configure request \
  --review /srv/starforge/private/customer-delivery-save-review.json \
  --out /srv/starforge/private/customer-delivery-save-request.json

starforge runtime-workspace application-save \
  --workspace /srv/starforge/runtime-workspace \
  --request /srv/starforge/private/customer-delivery-save-request.json
~~~

Retain the actual saved application ID:

~~~sh
starforge runtime-workspace application-start-review \
  --workspace /srv/starforge/runtime-workspace \
  --application-id ACTUAL_APPLICATION_ID \
  > /srv/starforge/private/customer-delivery-start-review.json

starforge delivery-receiving-configure request \
  --review /srv/starforge/private/customer-delivery-start-review.json \
  --out /srv/starforge/private/customer-delivery-start-request.json

starforge runtime-workspace application-start \
  --workspace /srv/starforge/runtime-workspace \
  --request /srv/starforge/private/customer-delivery-start-request.json

starforge runtime-workspace application-connect \
  --workspace /srv/starforge/runtime-workspace \
  --application-id ACTUAL_APPLICATION_ID
~~~

Each request file retains one generated UUID and the exact original review ID. A repeated helper invocation reopens that matching request. After a lost save/start response, resend the same file; the original runtime workspace reconciles its retained operation. A new reviewed change gets its own request file.

Use the original Applications output, recovery and stop controls with the saved application and operation IDs. The managed command installs its signal handlers before opening. Closing aborts this model's native work, drains its handler and listener, and then releases its lease. An independently owned native worker remains visible under the original worker ownership rules; the explicit native Stop action addresses that worker.

## 5. Review and operate signed delivery

The original destination page presents the received source count, route and network filters, each current enrollment, source continuity, delivery states, signing reference availability and actual worker ownership.

Use its original workflow:

1. Review each destination URL, allowed host, signing environment name and selected routes/networks. New enrollments explicitly choose all retained history or future events.
2. Supply the named signing secrets in the existing private process environment. Applications retains the environment file's identity; secret values stay on the runtime host.
3. Synchronize selected source events into the destination's original journal.
4. Deliver one cycle, or explicitly start the native worker with its bounded concurrency and timeout settings.
5. Inspect failures in the original event table. Pause/resume uses the current destination revision. Requeue uses both the original event ID and current delivery revision.
6. Stop the original worker and inspect its retained outcome before handing the workspace to another operator.

Opening Applications starts the operator listener. Native delivery begins through the explicit delivery controls.

The original CLI operates the same received workspace:

~~~sh
starforge delivery-destinations status \
  --workspace /srv/starforge/customer/received-delivery/workspace

starforge delivery-destinations events \
  --workspace /srv/starforge/customer/received-delivery/workspace \
  --id ACTUAL_DESTINATION_ID --state EXHAUSTED --offset 0 --limit 50

starforge delivery-destinations handoff \
  --workspace /srv/starforge/customer/received-delivery/workspace
~~~

For a terminal-owned worker, use the original `delivery-destinations run` command in the intended signing environment. Its original leases coordinate sends and its stop command records the selected worker's stop request. Reopening the application keeps the current enrollments and delivery history.

## 6. Hand over current customer state

The original portable destination export captures the customer's current descriptors, source, cursors and delivery journals under their native leases:

~~~sh
starforge delivery-destinations export \
  --workspace /srv/starforge/customer/received-delivery/workspace \
  --to /srv/starforge/handovers/customer-delivery-current

starforge delivery-destinations inspect \
  --workspace /srv/starforge/handovers/customer-delivery-current
~~~

Use the returned original fingerprint when receiving that exchange into a new private root on the destination host:

~~~sh
starforge delivery-destinations receive \
  --workspace /srv/starforge/customer/received-delivery-next \
  --from /srv/starforge/handovers/customer-delivery-current \
  --fingerprint ACTUAL_EXPORTED_FINGERPRINT

starforge delivery-receive inspect \
  --received /srv/starforge/customer/received-delivery-next \
  --fingerprint ACTUAL_EXPORTED_FINGERPRINT
~~~

The original receiver creates the destination host's new `received.json` and correct source path. Prepare or review **Received merchant delivery** for that returned root. Retain the export, its fingerprint, the receipt and the original Applications request files with the customer handover.

## Source integration

The source-owned contribution `merchant-delivery-receiving.json` registers:

| Entry | Original capability |
| --- | --- |
| `delivery-receive` | Completed retained transfer receive/reopen |
| `delivery-receiving-configure` | Applications settings and retained save/start request preparation |
| `delivery-receiving-workspace` | The owned original SF98 browser process |
| Application `delivery-receiving` | Receipt-bound received workspace in the original Applications catalog |

Programmatic callers can use `receiveDeliveryWorkspace` and `inspectReceivedDelivery` from `receive.mjs`. `createManagedReceiving` returns its close owner before opening; `start`, `close` and `closed` share the same lifetime. The provider supplies reviewed arguments and verifies the original child's startup before Applications offers its URL.

The original native contracts remain in [SF98 destinations](../../../stellar/scf-starforge-20261009/sf98-merchant-delivery/destinations/) and [the seller delivery guide](../../../stellar/scf-starforge-20261009/sf82-seller-pilot/DELIVERY.md). This leaf uses those engines and their existing receiving, revision, signing and shutdown behavior.
