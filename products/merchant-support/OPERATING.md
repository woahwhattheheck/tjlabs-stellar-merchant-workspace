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

**Review**, **Save**, **Start** and **Open** use the original Applications controls. The native launch binds the selected case, source and package paths, incident source identity, and any selected Handoffs profile. Its private startup announcement is reconciled with the actual local Support listener. Changing a profile or installation source produces a new current review before the existing application starts again.

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

The complete [commercial receiving programme](../../stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial/RECEIVING.md) captures the selected original pricing files and full pricing-workspace backup, attaches them through the original case writer, exports the complete case, and restores that exact pricing workspace at the receiver. Its native entry is `stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial/receiving-cli.mjs`.

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

## Stop, reopen and upgrade

Stop through the original Applications control or the foreground command's normal signal handling. Support settles its package operations and readers before closing the native source service and Handoffs desk. Keep the selected case, source and package directories.

Reopen the same saved application, case and retained operation. Package progress, source manifests, complete files and later case edits remain at their original paths. A source upgrade uses a new selected runtime and the existing managed adoption workflow; the customer stores continue as that application's inputs.

For a transferred customer, follow [Installation and receiving](RECEIVING.md). Its complete package contains the original sender history, while the native receiving checkpoint names the case to use for the receiver's continuing work.
