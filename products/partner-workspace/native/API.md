# Original partner installation API

The native adapter selects a complete mobility or education application. It uses the original workbench.core.Workspace and workbench.app APIs for the saved SQLite workspace, source objects, reports, archives and loopback server. Lifecycle records identify installation preparation and transfer; business edits remain in the original record/history tables.

## Complete source selection

Supply an absolute source root and JSON manifest:

{
  "schema": "stellar-forge.partner-product-source.v1",
  "title": "Mobility source review",
  "product": "mobility",
  "files": [{"path":"run.py","bytes":64,"sha256":"ACTUAL_FULL_FILE_SHA256"}],
  "provenance": {"reference":"Original selected full runtime source"}
}

The displayed row illustrates the shape. Generate every row from the actual selected bytes. Required members are workbench/__init__.py, core.py, app.py, mobility.py, education.py, run.py, static/app.js, index.html, style.css, README.md and LICENSE. Include every additional original runtime member under workbench/ and static/. The complete original source, license and its relative layout stay together. Commercial proposals, customer input, operating programmes and contact material remain in the original private case.

The adapter receives every selected file by size and SHA256 into an immutable source edition. The edition identity binds the complete manifest and five original native bridge files. A copied edition records its actual receiving directory while retaining the same source identity. Python 3.11 or later with its standard-library SQLite is the runtime.

## JSON transport

Invoke the installed native/operations.py with one complete UTF-8 JSON object on stdin:

{"schema":"stellar-forge.partner-operation-request.v1","operation":"installation.inspect","installation":"/PRIVATE/installation","arguments":{}}

Named lifecycle writes add request_id, retaining the same UUID for the same exact input. Installed requests can add binding: {installation_id,source_identity}. A reply has schema stellar-forge.partner-operation-result.v1, ok, operation, request_id, installation summary, result, replayed and adapter_sha256. Errors return ok:false with code/message and exit2. Integers larger than JavaScript's exact range are decimal strings in the transport.

| Operation | Arguments | Original behavior |
|---|---|---|
| source.inspect | source_root, source_manifest | Receive every full original source identity. |
| installation.prepare | source_root, source_manifest, directory; optional python, workspace_archive | Create the original empty product workspace or restore its exact original archive into a new installation. |
| installation.inspect | none | Verify source/bridge, UUID/product and actual original database/source objects. |
| installation.adopt_source | source_root, source_manifest | Retain a complete successor edition; validate and reopen the same original workspace. |
| installation.snapshot | output | Complete installation ZIP containing every source edition, original whole workspace archive and named lifecycle/lineage records. |
| installation.receive | archive_path, directory; optional python | Receive a complete snapshot independently, preserving workspace UUID/product, original source and originating operations. |
| workspace.state | none | Actual original staff state. |
| workspace.record | kind,id | Original current record/revision. |
| workspace.history | kind,id | Every original historical record/event. |
| workspace.source | id | Complete original source metadata and verified retained file identity. |
| workspace.compare | ids | Actual mobility import comparison. |
| workspace.stations | id | Actual original station-flow analysis. |
| workspace.export | kind:workspace/report/csv,output | Original full workspace/application ZIP or editable native report/CSV. |
| requests.get | request_id; optional origin_installation_id | Receive the named request and complete result, including prior installation lineage. |
| commands.describe | ready_file; optional port | Actual selected executable, argv, cwd, source hash and fresh private readiness path. |

Prepare, adoption, snapshot, receive and export require request_id. The typed client uses UUIDv4. Paths come from the host-selected private configuration; model-visible catalog operations select existing aliases.

## Original state and independent receiving

The original archive has schema partner-delivery-archive.v1. It snapshots SQLite with the original backup API, takes source objects from that committed database snapshot and carries the complete runnable application. The manager uses that exact original archive and restore implementation. The independently restored database is under the returned inner workspace directory; application files are in the receiving archive's application directory.

The installation snapshot has schema stellar-forge.partner-installation-archive.v1. It contains Original_Workspace.zip, INSTALLATION.json, all original source editions, complete named lifecycle requests/results/commit records and prior installation lineage. Duplicate materialization attempts and temporary archive copies remain in their producing operation; the complete current source, editable state and original business history are delivered.

A received installation has a new installation UUID and retains its originating installation, archive hash and snapshot operation. Its actual workspace UUID and product remain unchanged. Onward receiving preserves earlier lineage without merging it into a new business store.

## Process and interruption behavior

Applications owns the actual child process and inherited descriptor3. The native launcher takes one operator lease and invokes the original blocking app.serve. It receives that server's own {url,workspace} announcement and writes a private ready file bound to the actual child PID, installation/source IDs, original workspace UUID/product, selected source bytes and real loopback origin.

The original server enforces its exact loopback Host and same-origin JSON POST contract. It does not use a bearer token. The complete ready URL is returned only to the managed application's browser startup path.

Close the selected managed service before source adoption, snapshot or export. Source editions are immutable and retain their original files. The same service entry can reopen the same selected installation after inspection and review.

Each lifecycle operation keeps REQUEST.json before work and a complete COMMIT.json before publishing installation.json. A continuation receives a committed marker/result before requiring retired temporary inputs. Surviving donor files must still match. An interrupted original restore remains as its own attempt; the continuation uses a new original restore destination. Named exports keep their complete generated original bytes before copying to the requested output.
