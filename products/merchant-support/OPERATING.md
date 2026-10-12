# Operate Merchant Support

Merchant Support keeps the working case, implementation, Service and Commercial records together. Choose one installed runtime and its actual private case, source and package directories. The browser and agent should point to those same directories when they operate that collection.

## Prepare the application

In Runtime workspace, attach the READY runtime, open **Applications**, and choose **Merchant support**. Select the existing managed home or the original new-home operation offered by Applications.

| Application field | Value to select |
| --- | --- |
| Private merchant case directory | The existing SF74 case collection, or a new private folder in an existing private parent |
| Private incident source profiles | An original `stellar-forge.support-incident-sources.v1` file |
| Private source edition directory | Existing native commissioning storage; the default is `CASE_DIRECTORY/source-bundles` |
| Private complete-package directory | Existing export/input/receiving storage; the default is the sibling `CASE_DIRECTORY_NAME-packages` |
| Private accounting configuration | Optional original accounting workspace configuration for Service adjustments and accountant work |
| Private buyer expense connection | Optional original buyer workspace connection for purchase/credit coding and period close |
| Private handoff source profiles | Optional original `stellar-forge.support-handoff-sources.v1` file for remote receiving |
| Private environment JSON | The original environment mapping, including a selected `SCF_PYTHON` executable or the bearer environment names required by configured Handoffs sources |
| Local port | Use `0` for the original application to select a free local port |
| Allow local seller captures | Enable when the selected merchant actually uses an original loopback seller |

Use [application.example.json](application.example.json) as the settings shape for the corresponding original Applications API. Replace each example path with the actual private directory or file. The review/save/start calls belong to the existing Runtime workspace lifecycle.

A new case-only installation can start with [incident-sources.example.json](incident-sources.example.json):

```json
{
  "schema": "stellar-forge.support-incident-sources.v1",
  "sources": []
}
```

Save this as a private file. Add existing initialized SF93 stores when the merchant has incident sources to operate. Their source IDs, labels and actual directories remain in that original configuration.

**Review**, **Save**, **Start** and **Open** use the original Applications controls. The native launch binds the selected case, source and package paths, incident source identity, any selected Handoffs profile, and the selected accounting/buyer configuration files. Its private startup announcement is reconciled with the actual local Support listener. Changing a profile or installation source produces a new current review before the existing application starts again.

When the application is open, its **Complete delivery** desk can receive a complete customer folder. Configured Handoffs profiles also expose the original remote source aliases. The same aliases serve the complete remote package workflow.

## Work from the original case

In **Cases**, open the actual merchant case. Review its title, owner, status, current revision and original source. A completed receiving operation has its own retained receiving case identity; reopen that identity for continued work.

**Incidents** reads the original configured SF93 store. It presents retained captures, ownership, notification progress and watcher state. Select the actual incident and route when creating or attaching case work. The case's original runtime Support handoff carries the selected source bytes and metadata.

**Diagnose**, **Runtime** and **Review** preserve the existing capture, route selection, runtime import and repair comparison. Saving uses the original case writer. If another process saved a revision, reload its actual current state and carry the intended change forward from there.

The complete [Case desk](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/CASE_DESK.md), [incident sources](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/INCIDENT_SOURCES.md), [runtime Support](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/RUNTIME_SUPPORT.md) and [Handoffs](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/HANDOFF_DESK.md) guides describe these original operations.

## Carry out implementation

Prepare the native workorder from the case's selected original diagnostic or runtime source and its real terms. The original SF77 implementation owns the packet, HTML and acceptance checklist.

In **Implementation**, prepare the work from that packet. Assign the actual tasks, attach materials, and record receiving observations and measurements with their references and accountable operator. The original implementation keeps source editions and an immutable event history. A source edition has a distinct identity even when two editions produce the same workorder packet.

Use **Source delivery** for complete original source files. Native attachment records bind their bundle, manifest SHA and member path. Files remain independently downloadable. Retained historical and unassigned originals continue into the complete case package.

The source service uses the native SF49 preparation, inspection, archive, receiving and reopening operations. Its original streaming archive engine handles large files without expanding them into repeated workspace JSON copies.

Command-line work uses the same records:

```sh
starforge merchant-implementation read \
  --cases-dir /absolute/private/merchant-cases --case ACTUAL_CASE_UUID

starforge merchant-implementation --help
```

Use the current case and implementation revisions returned by the reader for mutations. Keep the request ID, actor and original body when continuing an interrupted operation. [Implementation](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/IMPLEMENTATION.md) and [Source bundles](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/SOURCE_BUNDLES.md) describe the complete commands and record fields.

## Operate Service and quotations

**Service** records the actual service commitments, calendars, incident observations and exclusions. Its preview and report use the native calculation over the selected saved sources. Save the original terms and source association before delivering the monthly report.

```sh
starforge merchant-services --help
```

**Commercial** retains selected pricing inputs, quotation editions and customer responses with the same saved case. A quotation uses the original SF97 calculation and its source/plan identities. Edition comparisons keep the terms and original work used for each quotation.

```sh
starforge merchant-commercial --help
```

The complete [commercial receiving programme](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial/RECEIVING.md) captures the selected original pricing files and full pricing-workspace backup, attaches them through the original case writer, exports the complete case, and restores that exact pricing workspace at the receiver. Use `starforge merchant-commercial receiving --help` for its installed commands; the native entry remains `stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial/receiving-cli.mjs`.

## Configure the installed agent

The dedicated setup command attaches the existing Support provider to an original merchant host. It requires the real private case collection and a host-authored Support connection. It uses the native release initializer and original immutable file publisher for repeatable setup.

Copy [support-connection.example.json](support-connection.example.json), choose the actual case/source/package paths and the same incident profile used by the browser, then save the file privately. To enable the existing remote package sources, add `packageSourcesFile` with the same Handoffs profile selected by the browser.

```sh
starforge merchant-support-agent setup \
  --out /absolute/private/support-agent \
  --connection /absolute/private/support-connection.json \
  --name "Merchant Support"

starforge merchant-support-agent inspect \
  --config /absolute/private/support-agent/merchant-mcp.json
```

Choose an agent directory separate from the case, source and package stores. A repeated setup uses the same output, original connection bytes and name; the original release initializer resumes its retained state. The first Support connection identity and exact merchant configuration remain saved in that directory. After deliberately editing the host connection, use **inspect** to read its current native configuration.

Start the original merchant server with the returned configuration:

```sh
starforge merchant-mcp serve \
  --config /absolute/private/support-agent/merchant-mcp.json \
  --port 8785
```

Supply authentication through the existing private environment or the original OAuth resource configuration described in [MCP OAuth](../../stellar/scf-starforge-20261009/distribution/MCP_OAUTH.md). The [original merchant guide](../../stellar-forge/mcp-merchant-operator/README.md) covers HTTP, stdio and client configuration. The selected source retains those original launchers and complete provider modules.

The Support provider exposes case, incident, implementation, Service and quotation operations, plus the sixteen Complete delivery tools. Begin package work with `merchant_case_package_catalog`; prepare its actual case/revision, run the retained operation ID and inspect its status. A completed receive returns the original receiving case. The [Complete delivery guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/CASE_PACKAGE_WORKSPACE.md) gives every package tool and original file-reader field.


## Connect adjustments, buyer work and the accountant

The **Adjustments** page starts from a saved Service report in the current case. It connects that report to an actual accounting event, a reviewed monetary basis and the original adjustment workspace. Buyer work continues from the resulting complete native capture into the original expense workspace, issued period and accountant handoff.

### Select the original owners

Use [accounting.example.json](accounting.example.json) and [buyer-expenses.example.json](buyer-expenses.example.json) as configuration shapes. Replace their paths with the actual existing accounting and buyer directories. The accounting selection also names its original outbox, proof directory and terms file. Keep any existing declared recovery, source or accountant settings from that native configuration.

The managed application has two optional connection fields:

| Field | Native selection |
| --- | --- |
| Private accounting configuration | The original accounting JSON containing named `workspaces`, including the selected directory, outbox, proofs and terms |
| Private buyer expense connection | The original `stellar-forge.buyer-expense-connection.v1` JSON containing the selected buyer workspace and Python executable |

Applications reads those files through the native configuration readers, retains their paths and SHA-256 values in the review, and compares them with the configuration loaded by the Support listener. Re-review the same application after deliberately changing a connection. The retained case and native workspace directories stay with that application's operation.

For direct operation, add the same original connections to the Support command:

```sh
starforge support-console \
  --cases-dir /absolute/private/merchant-cases \
  --incident-sources /absolute/private/incident-sources.json \
  --accounting-config /absolute/private/accounting.json \
  --buyer-expense-connection /absolute/private/buyer-expenses.json \
  --port 8784
```

Open **Adjustments**, choose the saved case and inspect the declared accounting and buyer aliases. **Open accounting** and the buyer workspace control open the selected native owners. The Support server, its HTTP API and the CLI share those owners for all subsequent actions. A merchant MCP host shares its own accounting and buyer providers with Support. Close a separately running accounting, buyer, Support or MCP session before handing that same native directory to another process; the native lease remains the authority for the selected store.

### Review and record the adjustment

1. Open the case and select its immutable Service report. Select the actual incident rows that explain the proposed adjustment. The report retains its original terms, calendar, exclusions and calculations.
2. Open the declared accounting alias, then select its actual run and event. Review the returned network, asset, payer, recipient and amount. Enter the monetary basis, reference, description, reason, effective time and accountable operator. Amounts use the original event's atomic asset units.
3. Preview the proposal. The complete preview binds the case report, selected incidents, native event, original term/report hashes and the explicit monetary basis.
4. Save that exact prepared proposal as an original commissioning material. Select it, prepare the native record intent, save the intent, and execute its retained ID. Read the returned original adjustment and current case revision.
5. For an already executed reverse transfer, enter its actual transaction reference and use **Prepare verification**. The native workspace reads that transaction through its original network verification path. Refresh the original verification job until its returned state is complete. A retry uses the selected original job and retained transaction.
6. Prepare and save a capture intent, then execute it. The capture retains the selected original native export and buyer source bytes. Download the native JSON, CSV, HTML and buyer source from that saved result.

Every proposal, intent and outcome remains in the original case material history. The browser retains the original request before a save or native execution. After an interrupted reply, reopen the same case and use **Retry pending request** to reconcile that original request ID and body. The saved native intent is the continuation for a lost execution response.

The [complete Service adjustment guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/SERVICE_ADJUSTMENT_HANDOVER.md) describes the material schemas, exact preview and execution contracts, record/verification/capture actions, and complete delivery format.

### Code the purchase and credit, close the period, and receive the return

In the buyer section, select the saved capture and the declared buyer alias. Inspect the original source and keep the returned event, source hash, purchase item and selected credit identities. The same buyer owner imports the capture's unchanged native source.

Choose the actual recognition date and period. Use the native cost centers and labels, enter the reviewed purchase and credit allocations, and inspect the current issues. The page presents the original allowed disposition kinds for each issue. Save and execute the prepared buyer intents with their current workspace revision.

Preview the period from its current native state, review its original source and coding, then close it. The issued edition keeps the selected purchase, credit, dimensions and report files. Prepare the accountant handoff using the declared accounting alias and selected issued period. Download each original accountant file and the complete buyer project. An accountant return is retained against its original handoff and revision; reopening a period preserves its previously issued edition.

The [buyer and accountant handover guide](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/SERVICE_BUYER_HANDOVER.md) covers inspection, centers and labels, allocations, native issue dispositions, period close/reopen, accountant capture/return and receiving the complete original project.

### Use the same agent and CLI contracts

To configure a dedicated Support agent with the same native selections:

```sh
starforge merchant-support-agent setup \
  --out /absolute/private/support-agent \
  --connection /absolute/private/support-connection.json \
  --accounting-config /absolute/private/accounting.json \
  --buyer-expense-connection /absolute/private/buyer-expenses.json \
  --name "Merchant Support"

starforge merchant-support-agent inspect \
  --config /absolute/private/support-agent/merchant-mcp.json
```

Setup retains the selected connection identities and writes the original merchant configuration. Accounting paths are normalized into that configuration; the buyer file remains its declared connection. An identical setup resumes the same output. If accounting aliases are deliberately changed afterward, update the original merchant configuration or create a new reviewed setup directory. **Inspect** reads the current host configuration and reports its configured accounting and buyer aliases.

The selected source registers the original Accounting and Buyer providers as Support dependencies. Start with `merchant_service_adjustment_sources` and `merchant_service_buyer_sources`. The adjustment tools cover read, preview, prepare, retain, execute and original file reading. The buyer tools cover read, inspect, native workspace actions, accountant preview, prepare, retain, execute and file reading. These calls use the same case and owner callbacks as the browser.

The installed CLI connects to the already running Support listener:

```sh
starforge merchant-service-adjustments \
  --url http://127.0.0.1:8784/ \
  --request-file /absolute/private/service-adjustment-request.json \
  --out /absolute/private/service-adjustment-operation
```

A read request is:

```json
{
  "method": "read",
  "args": {"id": "ACTUAL_CASE_UUID"}
}
```

Mutation request files retain the exact original method arguments and request ID returned or prepared by that operation. For a whole selected delivery, use `method: "delivery"` with the actual case ID and proposal ID. The CLI freezes the selected case revision and full file plan in its output directory, writes every original file, and publishes the completion manifest last. Continue with the same request file and output directory after an interrupted delivery.

The original `merchant-accounting-adjustments` and `buyer-expenses` commands remain available for their native workspaces. The product's [installation and receiving guide](RECEIVING.md) explains how their complete state and customer artifacts travel with the case.

## Stop, reopen and upgrade

Stop through the original Applications control or the foreground command's normal signal handling. Support settles its package, adjustment and buyer operations and readers before closing the native source service, Handoffs desk and owned accounting/buyer connections. Keep the selected case, source and package directories.

Reopen the same saved application, case and retained operation. Package progress, source manifests, complete files and later case edits remain at their original paths. A source upgrade uses a new selected runtime and the existing managed adoption workflow; the customer stores continue as that application's inputs.

For a transferred customer, follow [Installation and receiving](RECEIVING.md). Its complete package contains the original sender history, while the native receiving checkpoint names the case to use for the receiver's continuing work.
