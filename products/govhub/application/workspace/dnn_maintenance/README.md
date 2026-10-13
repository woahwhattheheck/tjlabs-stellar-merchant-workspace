# DNN Maintenance Desk

A private staff application for an existing DNN production installation and its paired staging installation. It keeps service requests, actual environment inventories, exact platform and extension packages, release review, native execution returns, paired backup recovery and monthly client reports in one versioned workspace.

The desk runs on Python 3.11+ on Linux, macOS or a Linux receiving VM/WSL environment. Its Windows receiver runs beside the agreed IIS application and uses the actual SQL Server and DNN native upgrade services. The package includes the maintained storage/session engine, dedicated staff interface, all three Windows source modules and complete receiving guide.

## Open the desk

Extract the source ZIP. From DNN_Maintenance_Desk, initialize two distinct absolute private directories:

~~~sh
python3 application/engine/dnn_maintenance/desk.py \
  --workspace /absolute/private/dnn-workspace \
  --intake /absolute/private/dnn-intake \
  --username operator init --name "DNN Maintenance Desk"
~~~

The command prompts for a private password of at least 12 characters. Start the local interface:

~~~sh
python3 application/engine/dnn_maintenance/desk.py \
  --workspace /absolute/private/dnn-workspace \
  --intake /absolute/private/dnn-intake serve
~~~

Open the returned localhost address. An administrator manages operator/reviewer accounts in Staff. The service uses the receiving workstation's loopback interface and existing same-origin/session protections. Use the receiving environment's established authenticated remote-desktop or forwarding arrangement when the team works from another machine.

## Full maintenance workflow

1. **Register the actual installations.** Record the production/staging identity, actual IIS site/application, base URL, technical owner and client reference. The Windows inventory collects technical versions, modules, aliases and runtime settings.
2. **Receive native inventories.** Prepare Inventory for each site, download its complete request ZIP and run native.ps1 on the Windows operator host with its private connection. Receive each complete return ZIP into its original operation.
3. **Establish paired staging.** Receive a production Backup. A reviewer can restore its exact original files/database pair into staging with the complete PortalAliasID mapping and data-handling note. Existing staging SQL and machine-key bindings are retained while the selected production generation is restored. Receive the actual staging inventory.
4. **Prepare the agreed release.** Retain original platform/extension ZIPs and publisher references. Select actual inventories, precise target, ordered packages, compatibility decisions, related service requests, maintenance window, rollback plan and real HTTP acceptance checks. The desk computes the published intermediate hops and identifies missing prerequisites/packages.
5. **Execute reviewed staging.** Save the staging review, export the exact Upgrade request and run it on staging. It creates a new paired backup before mutation, runs the version-specific native file/database upgrade, installs selected extensions and retains actual installer status and checks.
6. **Rehearse recovery.** Restore the paired generation made by that same staging Upgrade. Its complete pre-release file tree and database are restored together. The failed tree remains separately retained on the host.
7. **Execute reviewed production.** The production review requires the same implementation's actual completed staging upgrade and paired restore rehearsal. Export and run production in the agreed window. A production rollback uses its own explicit rollback review and original paired backup.
8. **Finish staff handover.** Accept related service requests with actual resolutions, create the monthly report, export the whole workspace, restore it to a new receiving directory and open the same saved requests, native returns and reports.

NATIVE_OPERATOR.md documents the Windows command and original interrupted-operation recovery. RECEIVING.md maps the complete deliverables and package restoration.

## Daily staff use

Service requests retain the client's ticket reference, owner, priority, actual incident times and accepted result. Every edition remains available. A changed record is reopened before applying a draft. Drafts survive navigation; an interrupted response retains its original request identity so retry adopts the saved result.

Packages and sources streams original files into immutable storage. Large SQL backups and native return ZIPs use the same complete-byte receiving path. Native operations shows each original request, exact returned result, backup pair and requested HTTP checks. A completed operation's original return remains immutable.

Monthly report ZIPs contain readable HTML, the service queue CSV, full JSON record and original monitoring inputs. Measured availability uses actual non-overlapping provider intervals. Calendar coverage is separate. Cross-month totals need the provider's actual month-specific measurements before aggregation. Recorded incident intervals stay separately identified. A measurement correction names its original edition.

## Reopen a saved workspace

Use the complete workspace ZIP and its included source:

~~~sh
python3 application/engine/dnn_maintenance/desk.py \
  --workspace /absolute/private/restored-dnn-workspace \
  --intake /absolute/private/restored-dnn-intake \
  restore --archive /absolute/private/DNN_Workspace_original.zip
~~~

Restoration verifies every source/data member, reopens the original SQLite generation, checks all immutable files and publishes a new private workspace. It returns the launch command for its included exact source. Staff sign in again with their retained accounts.

A complete workspace can contain actual site/database content. Keep its saved archive under the receiving team's existing protected backup/access controls. Live Windows connection files and authentication headers remain separately configured on the operating host.

## Build from source

~~~sh
python3 products/govhub/application/workspace/dnn_maintenance/build.py \
  --engine-source /absolute/source/products/govhub/application/workspace \
  --out /absolute/delivery/DNN_Maintenance_Desk_Source.zip
~~~

The builder validates every engine file in engine-lock.json and includes the original auditor dependency, all runnable source and applicable license notices. PRIMARY_SOURCES.json records the DNN and SQL contracts. The build runs on the receiving machine and needs no hosted CI execution.

## Begin with the known customer scope

A site can be retained as receiving setup while its private host reference, IIS name or staging URL is being supplied. Staff requests and the service report work immediately. The Windows operation becomes available when the receiving technician supplies the actual target; the desk then captures its technical version and extension inventory. This keeps the initial work queue useful without inserting assumed installation details.
