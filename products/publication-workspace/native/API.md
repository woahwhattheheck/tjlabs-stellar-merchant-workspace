# Publication installation native API

The adapter calls the selected original publication Store, procurement module, delivery packager and WordPress runner. Source records, review revisions, jobs, releases, original backups and native returns stay in their existing database and files.

## Complete request and response

Run the selected Python with:

~~~sh
python3 -B products/publication-workspace/native/operations.py --request /PRIVATE/request.json
~~~

Standard input is also supported. The complete request is:

~~~json
{
  "schema": "stellar-forge.publication-operation-request.v1",
  "operation": "installation.inspect",
  "installation": "/PRIVATE/installed-publication",
  "request_id": "91ff9f9b-d024-45f9-bc0b-b26848cf2f54",
  "arguments": {}
}
~~~

An optional binding contains the actual installation_id and source_identity returned by inspect. Retain the same version-four UUID and exact authored arguments for a lifecycle operation. The Python native identifier also accepts existing original lifecycle keys; the typed client uses UUIDs for new work.

Successful replies use stellar-forge.publication-operation-result.v1 with ok, operation, request_id, installation summary, result, replayed and adapter_sha256. The summary names the **actual exact selected installation directory** for preparation, receiving and cold reopen. A received installation lives directly at arguments.directory. It has a new UUID and retains the originating UUID, snapshot, source edition and prior receiving lineage.

Errors retain operation and request_id, return ok:false and a stable error.code/message, and exit nonzero. An interrupted process may have completed its operation; read requests.get before selecting another mutation. Reading a prior result never submits another source publication.

## Native operations

| Operation | Arguments | Result |
| --- | --- | --- |
| source.inspect | source_root, source_manifest | Complete selected original manifest, file count and exact byte total |
| installation.prepare | source_root, source_manifest, directory; optional python, workspace_archive, actor, native | Original source edition and original initialized or restored workspace |
| installation.inspect | none | Original database integrity, complete table counts, source history and current installation |
| installation.adopt_source | source_root, source_manifest | Complete source successor on the same original workspace, retaining old editions |
| installation.snapshot | output | Full installation ZIP, original source identity and whole snapshot identity |
| installation.receive | archive_path, directory; optional python, actor, native_runtime | Independent original Store restore and new installation with retained lineage |
| workspace.export | kind, output, actor | Original workspace, operator, native-tools or procurement ZIP |
| native.configure | node, playground_module, wordpress_zip | Existing original host/runtime selection and retained exact core archive |
| commands.describe | ready_file; optional roles, port, release_id | Actual absolute executable, argv, cwd, source hashes, role and private ready-file path |
| requests.get | request_id; optional origin_installation_id | Original retained lifecycle input and result |
| workspace.state | none | Original complete staff state |
| workspace.record / workspace.history | id | Original editable record / every retained revision |
| workspace.job | id | Existing original source job |
| procurement.state | none | Original controlling documents, requirements and review state |
| procurement.document / procurement.requirement | id | Complete original selected document / requirement |
| native.return | id | Original native WordPress comparison and receiving state |

All integer identifiers larger than JavaScript's exact integer range are returned as decimal strings. Native original JSON arrays and field meanings remain unchanged.

## Selected source layout

The full source manifest has schema stellar-forge.publication-product-source.v1. It contains title, original HTTPS origin, interface, every ordinary source file's relative path/byte count/SHA256, and optional original provenance. Keep the original relative layout and root LICENSE. The interface selects the original entry, model, exported store_class, delivery, native_runner, complete local import_names, operator_package_schema, workspace_archive and native_tools_archive filenames.

Preparation verifies all source members, copies the complete selected application and all six maintained native bridge files, then calls the original Store.initialize or restore_archive. The edition identity binds the whole source manifest and all bridge bytes. Installing or adopting source does not rewrite source origins, reviews, captured bytes or native publication decisions.

Source adoption holds the original installation and three service leases. Stop the original selected services before adopting. A completed exact adoption can receive its prior source binding only for that retained transition. Another installed edition requires a new inspected selection.

## Whole snapshot and receiving

Snapshot takes the original SQLite-backed operator_package, complete selected source editions, bridge files, exact WordPress core, closed native runtime files and original lifecycle history. It retains the original package's complete workspace/native-tools ZIPs inside the outer archive. The outer FILES.json binds every original member and the exact installation selection.

Close the staff and WordPress roles before the whole installation snapshot, and close the staff role before an original export. The manager takes their existing role leases so its separately opened original Store cannot race browser edits while copying the SQLite backup and object/release files. Reopen the same managed entries after export.

Receiving verifies every archive member before materializing it. It restores the original operator backup through the selected original Store into a fresh workspace, keeps every prior source edition and namespaces copied request records by their originating installation UUID. Each incomplete original restore remains retained; continuation selects a new empty restore attempt. The original native site marker is rebound only from its archived site path to the receiving site's actual new path. Its previous bytes are retained in lineage.

The native core archive is content-addressed. Host Node and Playground paths can be reattached through native.configure after receiving; that uses the same original service and core, with exact selected module bytes. Existing installation directories are never silently replaced with another received case.

## Original managed services

The original staff and resident Python servers run directly in the managed process. Their own URL announcement creates the private ready record; the adapter does not replace their HTTP handlers. WordPress uses the original source runner and setup, with a maintained exercise that keeps the existing engine active until managed shutdown. The original runner disposes the engine on termination.

Each ready record identifies actual PID, role, installation, source edition, executable source hashes, original workspace/release/native runtime and startup instance. The selected original WordPress login remains TJL_LOCAL_WP_PASSWORD in the private service environment. It is never returned by the operation adapter, command descriptions or MCP configuration.

An MCP client closing drains only its own in-flight native calls. Applications retains ownership of the running original services.

A multi-role `commands.describe` request derives separate `-operator`, `-resident`, and `-wordpress` ready-file names from its selected filename. A single-role request retains the exact selected path. Receiving through a private connection forwards its selected Node and Playground runtime references; the complete archived core remains the original source.
