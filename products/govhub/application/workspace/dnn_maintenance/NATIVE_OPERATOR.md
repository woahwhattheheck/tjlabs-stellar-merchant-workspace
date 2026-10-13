# DNN native Windows receiving

## Actual host and private connection

Use the agreed Windows IIS operator host. The receiver uses Windows PowerShell 5.1 or PowerShell on Windows with Microsoft.Web.Administration and System.Data.SqlClient available. The account needs approved management access to this IIS application, full file backup/restore and the selected SQL Server database. The distinct COPY_ONLY,CHECKSUM backup preserves the existing backup owner's differential base.

Extract the original DNN_Native_Request ZIP into a new private directory. It contains request.json, its exact SHA256, all three receiver modules, the connection template, selected packages and selected original backup pair.

Copy CONNECTION_TEMPLATE.json to a separate private path. Bind site_id, environment_id, iis_site, application_path and url exactly to request.json. The receiver resolves the actual physical directory and pool from IIS, and the database owner/object qualifier from web.config. A private SQL connection environment reference can supply access when configuration is protected.

sql_backup_directory is the actual SQL Server backup path. sql_backup_read_directory is its readable operator-host counterpart, using an existing approved share mapping if the hosts differ. The two sql_restore_directory fields identify the corresponding original restore-input location. The journal pins the resolved server/database/site root across resume.

host_headers_env names a private JSON environment variable containing the current authorized native Host request headers, cookie and anti-forgery context. host_username_env and host_password_env supply the authorized SuperUser for UpgradeWizard. They remain in the operating host environment and are omitted from returned artifacts.

integration_references records existing monitoring/email/search/SSO references without secrets. The backup-owner/reference/retention fields carry the actual team's operating arrangements into inventory.

## Run and receive

~~~powershell
powershell.exe -NoProfile -File .\native.ps1 -RequestDirectory "D:\PrivateDnnRequests\original-operation" -ConnectionPath "D:\PrivateDnnConnections\production.json" -OutputDirectory "D:\PrivateDnnReturns"
~~~

Retain the complete returned DNN_Return ZIP and printed locator. Receive the ZIP into that same original desk operation. Inventory, Backup and Verify use this receiver. Upgrade and Restore consume their exact saved release/review or standalone staging-restore decision.

## Automatic inventory

The actual result includes IIS site/application/root, pool/runtime/pipeline/bindings and shared-pool consumers; DNN file-version metadata, assembly identity/hash and Version table result; registered packages and versions; portals, aliases and schedules; native Telerik assembly metadata; SQL Server version/edition and target database; and existing integration/backup references.

The receiver compares the chosen pre-mutation versions, registered packages and resolved target with the original baseline. A platform filename is checked against the DLL's FileVersionInfo release version before native use; its assembly-manifest version is retained separately.

## Original platform routes

| Installed version | Native route |
| --- | --- |
| Before 10.2 | Reviewed Upgrade ZIP, application maintenance state, intended file merge, native UpgradeWizard |
| From 10.2 | Reviewed Install ZIP, native Host validation/selected StartUpgrade, native UpgradeWizard |
| Exactly 10.2.3 | Documented App_Data\Upgrade upload workaround followed by the same native selected-package route |

Each request freezes the from/to version and exact original package. The receiver uses returned native PackageName and never invokes StartFirstUpgrade. A StartUpgrade204 covers files/assemblies. Database completion uses ValidateInput, GetSecurityTab and RunUpgrade with the actual server-generated Telerik choice.

The status-log baseline is captured before dispatch. Recovery verifies its unchanged prefix and reads only new records belonging to this invocation. Native Done/error state is paired with the actual selected platform-file/database versions. The completed original log is retained before normal ?complete cleanup removes installer files.

Extensions use native ParsePackage and InstallPackage with POSTFILE multipart. Both the original Success return and actual installed package version are retained. A different package or manifest cannot replace an already dispatched step.

An independent existing app_offline.htm remains attached to its maintenance owner. If native10.4 preparation leaves its own template after an interrupted response, recovery requires the exact dispatched step, complete selected package files and original captured template bytes before restoring availability.

## Paired backup and restore

The receiver retains original availability, isolates this application, performs native SQL backup/VERIFYONLY and captures the entire website tree with original hashes, timestamps and ACLs under one pair ID. A shared pool stays running; isolation uses this application's actual offline file.

Restore verifies the complete pair, retains the entire current failed tree separately, replaces the complete original website tree and restores its paired database. Backup-header identity and actual SQL restore history reconcile an interrupted RESTORE. Original file hashes, restored database version and requested HTTP checks are received together.

For production-to-staging receiving, target root and database must be distinct, every actual source PortalAliasID must have a reviewed staging alias, and the data-handling method is explicit. Staging connection/machine-key bindings are retained. The selected original production generation supplies the data; the receiver applies the exact approved aliases.

If database logical files differ from the target's current files, restore_files explicitly maps logical_name to physical_path in the private connection. Otherwise the existing target database file paths are used. SQL storage and permissions remain those of the selected original server.

## Resume the same operation

~~~powershell
powershell.exe -NoProfile -File .\native.ps1 -RequestDirectory "D:\PrivateDnnRequests\original-operation" -ConnectionPath "D:\PrivateDnnConnections\production.json" -OutputDirectory "D:\PrivateDnnReturns" -Resume
~~~

Use the same request directory, target and receiver source. Every mutation has a durable original dispatch and each native result is retained before dependent work. Operation and target leases prevent concurrent execution. A completed step is reopened; an uncertain step first reads its original output/status.

A missing Install ZIP after a lost StartUpgrade reply is native behavior. Recovery inspects the original selected installed files before attempting upload/list. A missing RunUpgrade reply continues the same log/database observation. It does not automatically post another upgrade.

A completed operation whose return publication was interrupted republishes its retained result. Failed/uncertain returns retain the actual journal and completed backup artifacts. Receive that return, inspect the original action and continue its retained native request or explicitly reviewed paired restore. A changed business intent gets a new review and operation.
