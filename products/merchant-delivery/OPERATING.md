# Merchant delivery and releases

This selected installation opens one original seller release store in **Applications** and carries the same settlement delivery history through the release console, CLI, MCP and customer receiving. The original SF82 seller continues to own payment handling, release activation and its settlement journal. The original SF98 destination model owns synchronization, signing, retries and delivery workers.

The application is **Merchant delivery and releases** (kind `merchant-delivery`). A saved application selects the existing private release store. Its **Open** action returns the authenticated original console, including **Settlement delivery** and the original destination controls.

## Installed product and original source

Build the named source selection from the complete pinned checkout:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --ref FULL_SOURCE_COMMIT \
  --selection merchant-delivery \
  --out /absolute/merchant-delivery-release
~~~

Use the full commit from the release handoff. The original builder records the selection and source bytes in the package manifest. Its existing `--resume` and `--status` paths retain that same build identity. The output remains the original merchant package, with a version ending in `.selection.merchant-delivery`.

The selection includes the original release console, destination UI and receiver, developer/client tools, merchant MCP host, runtime installation and Applications. Source-owned contribution files register the seller application, delivery provider, CLI and browser assets. The shared Applications dispatcher and MCP provider registry discover those registrations through the same installed manifest.

Use the original runtime installer for the retained package and its published SHA-256:

~~~sh
starforge runtime-install prepare \
  --dir /srv/starforge/runtimes/delivery-01 \
  --archive /srv/starforge/downloads/merchant-delivery.tgz \
  --sha256 FULL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator
starforge runtime-install install --dir /srv/starforge/runtimes/delivery-01
starforge runtime-install run --dir /srv/starforge/runtimes/delivery-01 -- source
~~~

The installer uses its original dependency profile and retained installation state. For an already prepared compatible runtime, follow that installer's existing adoption procedure. The operator profile supplies the original native execution tools; the selected application uses Node and the existing seller family runtime.

## Attach the READY runtime

Create or reopen the original runtime workspace and attach the actual READY runtime:

~~~sh
starforge runtime-workspace init --workspace /srv/starforge/runtime-workspace
starforge runtime-workspace attach \
  --workspace /srv/starforge/runtime-workspace \
  --runtime /srv/starforge/runtimes/delivery-01 \
  --label "Merchant delivery"
starforge runtime-workspace serve \
  --workspace /srv/starforge/runtime-workspace --port 8465
~~~

Retain the actual 24-character `runtimeId` returned by attach/status. In **Applications**, choose that runtime and **Merchant delivery and releases**. Select the initialized SF82 release store, a port (0 chooses an available port), and the existing private environment JSON when the seller or destinations use environment references.

Review, save, review start and start through the original Applications controls. **Open** appears after the child announces its original console and the adapter verifies the selected store, installed source, operation ID, process ID and authenticated native status. The announcement also exposes the original console link.

A store is bound by its canonical private root and releases directory identities plus its original creation identity. Normal generation changes, activations and delivery updates remain usable within that store. Replacing the store or the installed source requires a fresh Applications review.

Applications holds the original runtime operation and process ownership. The managed child holds a private owner lease for this release console. Stopping the application closes the original seller, destination workers and retained reads before releasing that owner. A failed close keeps the same owner available for retry.

## Retain a complete configuration

The configuration helper prepares the original Applications input and a matching merchant MCP configuration in one private directory. It reads the source identities and paths; environment values stay in the selected host file.

Copy [examples/application.example.json](examples/application.example.json) to a private file and substitute the actual runtime workspace, runtime ID, READY runtime directory and original release store. `environmentFile` is optional. The example ID is a placeholder.

~~~sh
starforge merchant-delivery-configure configure \
  --selection /srv/starforge/private/delivery-selection.json \
  --out /srv/starforge/configurations/merchant-delivery
~~~

The output parent must already be private. Keep the configuration separate from the release store, runtime workspace and installed runtime. The helper retains:

| File | Use |
| --- | --- |
| `selection.json` | Original operator selection |
| `application-review.json` | Input for the existing Applications review |
| `merchant-mcp.json` | Original MCP host configuration selecting the same release store |
| `original-delivery-selection.json` | Store, runtime and source identities at preparation |
| `configuration-manifest.json` | Exact identities of the four prepared files |
| `exports/` | Private mutable destination for original customer exports |

Re-running a complete matching configuration reopens those exact files and preserves exports. A matching interrupted preparation completes only missing files. An existing changed file remains available for inspection; use a separate output for a changed selection.

### Save and start from the native CLI

The same original Applications reviews can be retained as files. Use the actual review response and keep each mutation request file for recovery:

~~~sh
starforge runtime-workspace application-review \
  --workspace /srv/starforge/runtime-workspace \
  --request /srv/starforge/configurations/merchant-delivery/application-review.json \
  > /srv/starforge/private/delivery-save-review.json

starforge merchant-delivery-configure request \
  --review /srv/starforge/private/delivery-save-review.json \
  --out /srv/starforge/private/delivery-save-request.json

starforge runtime-workspace application-save \
  --workspace /srv/starforge/runtime-workspace \
  --request /srv/starforge/private/delivery-save-request.json
~~~

Copy the actual saved application ID into the next command:

~~~sh
starforge runtime-workspace application-start-review \
  --workspace /srv/starforge/runtime-workspace \
  --application-id ACTUAL_APPLICATION_ID \
  > /srv/starforge/private/delivery-start-review.json

starforge merchant-delivery-configure request \
  --review /srv/starforge/private/delivery-start-review.json \
  --out /srv/starforge/private/delivery-start-request.json

starforge runtime-workspace application-start \
  --workspace /srv/starforge/runtime-workspace \
  --request /srv/starforge/private/delivery-start-request.json

starforge runtime-workspace application-connect \
  --workspace /srv/starforge/runtime-workspace \
  --application-id ACTUAL_APPLICATION_ID
~~~

The helper generates one UUID when it first writes each request. The same matching request file reopens unchanged. If a save/start response is lost, repeat that exact request; the original runtime workspace reconciles the retained operation. A newly reviewed change uses a new request file.

Use the original `application-output`, `application-recover` and `application-stop` commands with the saved application and operation IDs for that same process. The Applications UI exposes those original controls too.

## Operate the existing seller

In the original release console, inspect the active release and start the seller through its existing action. Its first successful startup initializes the retained settlement delivery binding. The **Settlement delivery** section shows the actual release/instance, journal warnings, source count, destination revisions and worker state.

**Open destination controls** opens the original mounted SF98 workspace. Enroll the actual HTTPS accounting or fulfillment receiver with its allowed host and existing signing environment variable. Choose all retained history or future events. Review and synchronize the destination, then explicitly deliver one cycle or start its original foreground worker.

Each receiver retains its own event state. A signature error, unavailable receiver or exhausted event is visible in the original destination journal. Pause/requeue changes use the current original revisions. The UI's stop action begins native send cancellation.

The full operating contract and all native fields are in [the original delivery guide](../../stellar/scf-starforge-20261009/sf82-seller-pilot/DELIVERY.md). The same commands are available directly:

~~~sh
starforge release-delivery status --store /srv/starforge/merchant/releases
starforge release-delivery events --store /srv/starforge/merchant/releases \
  --id accounting --state EXHAUSTED --offset 0 --limit 50
starforge release-delivery handoff --store /srv/starforge/merchant/releases
~~~

For a terminal-owned continuous worker, stop the saved application before opening another owning control surface, then run:

~~~sh
starforge release-delivery run --store /srv/starforge/merchant/releases
~~~

Ctrl-C drains this original owner. The existing destination lease coordinates signed sends.

## Capture, download and give the customer the retained exchange

Inspect the current source fingerprint, then capture a deliberate transfer ID. The native exporter copies the original source journal and destination descriptors, cursors and delivery histories and verifies them before publishing the exchange.

~~~sh
starforge release-delivery transfer --store /srv/starforge/merchant/releases \
  --id customer-handover-v1 --source-fingerprint ACTUAL_SOURCE_SHA256
starforge release-delivery manifest --store /srv/starforge/merchant/releases \
  --id customer-handover-v1
~~~

The same ID and reviewed source fingerprint reopen the completed capture. After a lost browser response, **Resume saved capture** sends its retained original request. The capture draft can be downloaded and reopened. A fresh capture of new receipts uses a new ID.

Use the actual exchange fingerprint from the returned manifest:

~~~sh
starforge release-delivery download --store /srv/starforge/merchant/releases \
  --id customer-handover-v1 --fingerprint ACTUAL_EXCHANGE_SHA256 \
  --directory /srv/starforge/handovers/customer-handover-v1

starforge release-delivery reopen \
  --directory /srv/starforge/handovers/customer-handover-v1 \
  --id customer-handover-v1 --fingerprint ACTUAL_EXCHANGE_SHA256

starforge release-delivery receive \
  --directory /srv/starforge/handovers/customer-handover-v1 \
  --id customer-handover-v1 --fingerprint ACTUAL_EXCHANGE_SHA256 \
  --workspace /srv/starforge/customer/received-delivery
~~~

The downloader retains durable byte checkpoints and verifies the exact native file hashes. Repeating the same download resumes the same output. Its outer `delivery-files.json` and `download-state/` sit beside the unchanged original `exchange/` receiver layout.

Receiving delegates to original SF98 and writes `received.json`. The same matching receive target reopens its current model, preserving later customer destination changes. The customer sets the retained signing environment references on their host, reviews the received destinations and explicitly resumes delivery. The original `delivery-destinations serve --workspace /srv/starforge/customer/received-delivery/workspace` opens those same native controls.

For remote handover, the same downloader accepts an existing authenticated merchant MCP URL and `--token-env`. Use the exact original ID and exchange fingerprint in the [delivery guide](../../stellar/scf-starforge-20261009/sf82-seller-pilot/DELIVERY.md#download-and-receive).

## Open the customer's received application

The same installed `merchant-delivery` selection includes the customer application. It opens the original received SF98 workspace through **Applications → Delivery receiving**, retaining the receipt and the customer's later destination edits.

Follow [Customer receiving](receiving/CUSTOMER_RECEIVING.md) to receive or reopen a completed download, prepare the saved application configuration, review and start it, supply the original signing environment references, and operate the native Sync, Drain, Start and Stop controls. The customer can reopen this application after the seller connection and original download have moved.

The receiving configuration binds the actual receipt, source, workspace and installed code. It excludes changing destination revisions and worker progress, so ongoing customer operations remain in that same workspace.

## MCP and source-owned installation

`merchant-mcp.json` selects the same original `releaseStore`, an independent private exports directory and the original MCP schema. Open it with the installed merchant MCP host using that host's normal launch command.

The `delivery` provider supplies ten tools: status, control, stop, event pagination, handoff, transfer list, capture, manifest, verified file read and file release. It loads through the existing source-owned provider registry. Stop is callable while delivery is active; host shutdown requests native cancellation before draining and closing the original owner.

The selected contribution leaves are:

- `merchant-delivery-product.json`: seller managed launcher, configuration helper and Applications provider.
- `merchant-delivery-receiving.json`: customer receive/reopen, saved receiving application and original destination controls.
- `release-delivery-console.json`: original CLI/adapter and shared browser asset registration.
- `merchant-provider-delivery.json`: original ten-tool provider and resumable downloader.
- `sf98-managed-delivery.json`: original delivery producer and retained settlement bindings.

The normal managed Fleet and its SF101 recovery product keep their own saved application kinds, stores and source-owned contributions. A single-merchant application operates its selected original SF82 store through the complete native console.
