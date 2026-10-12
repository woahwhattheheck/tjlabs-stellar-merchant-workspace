# Install, receive and reopen GIS migration

This guide installs the selected product, binds the original native environment, opens its existing Applications flow, and receives a complete GIS project into an independent workspace. The original source and merchant receivers keep their own identity, revisions, request history and complete file checks.

## 1. Build the selected product from its original source

Use the complete maintained repository and the intended source commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --ref FULL_SOURCE_COMMIT \
  --selection gis-migration \
  --out /absolute/gis-migration-release
~~~

The source-owned [gis-migration selection](../../stellar/scf-starforge-20261009/distribution/selections/gis-migration.json) composes the original runtime/merchant platform with:

- `migration-workspaces`: the existing 44-tool native merchant attachment, typed client and complete receiver.
- `migration-operator`: the original server lifecycle, private connection setup, Applications registration and this product guide.
- `stac-qgis`: the existing native QGIS command and desktop integration.

The named recipe selects these contributions directly from the maintained contribution directory. It retains their source paths and exact registrations in the generated product manifest. Its Python/QGIS portable application has 57 declared files, including `source-files.json`; the five Field dependencies accompany the original plugin and canonical PostGIS namespace. The installed Node Applications and merchant code use the complete selected distribution.

The builder follows selected static imports, browser maps and declared source components. Use Node 22.16 or newer as required by the original distribution. A different source commit gets its own output. An interrupted build resumes through the same output:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --out /absolute/gis-migration-release --resume

node stellar/scf-starforge-20261009/distribution/build.mjs \
  --out /absolute/gis-migration-release --status
~~~

Use the actual returned package path and SHA-256 for installation. The completed manifest retains the recipe, source commit, contribution and every packaged file identity. [SOURCE_ADOPTION.json](SOURCE_ADOPTION.json) records the native producer and adopted source leaves.

## 2. Install the existing runtime profile

Use the maintained installer and the exact package returned above:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/gis-migration-runtime \
  --archive /absolute/gis-migration-release/RETURNED_ARCHIVE.tgz \
  --sha256 RETURNED_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/gis-migration-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/gis-migration-runtime --load --source

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/gis-migration-runtime -- source
~~~

The original profile, lock, native probes, cache and READY state own installation. The existing `--adopt-existing` path can use a complete matching dependency tree on an equipped host. Reopen that same installer directory after interruption.

Register the READY installation in the existing Runtime workspace. Its Applications catalogue then contains **GIS migration**. Inspect the original installed commands when needed:

~~~sh
starforge registrations --command migration-operator
starforge registrations --command migration-workspace
starforge migration-operator --help
starforge migration-workspace --help
~~~

The [runtime installation guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) covers the maintained installer and Runtime workspace; [source selections](../../stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md) covers complete source acquisition and package recovery.

## 3. Select the host's native environments

The product requires the original Python environment for ordinary workspace operations, Fiona/GDAL for vector capture and generation, and native QGIS for project, layout and receiving work. Choose the actual installed executables on the receiving host. Separate Vector and QGIS environments are supported.

The original QGIS [operations guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/qgis/OPERATIONS.md), [vector receiving guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/qgis/VECTOR_RECEIVING.md) and [Field operations](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/qgis/FIELD_OPERATIONS.md) describe the native source. The canonical PostGIS package remains alongside the original QGIS plugin.

Keep any required native module paths and environment in the receiving host's private configuration. The merchant connection accepts actual `pythonPath` directories. The Applications entry accepts an existing private environment JSON, whose values are retained by the original local controller. A virtual environment's selected executable path is preserved during launch.

The installed product, selected Python executables, private workspaces and source inputs remain separate. Record the actual runtime paths and versions with the completed receiving result.

## 4. Adopt an existing workspace in Applications

Describe the original working directory:

~~~sh
starforge migration-operator describe \
  --workspace /srv/starforge/private/migration \
  --python /absolute/path/to/operator-python
~~~

The returned `workspaceId` comes from the original engine. Set these fields in **Applications → GIS migration**:

| Field | Original value |
| --- | --- |
| Original migration workspace | The existing working directory |
| Operator Python | Selected executable for ordinary workspace operations |
| Vector Python | Selected executable for native capture and data generation |
| QGIS Python | Selected executable for maps, publication and receiving |
| Complete handover directory | Existing or new private directory outside the workspace |
| Private environment JSON | Optional current native environment file |
| Local port | Existing assignment or 0 |

Review, save and start the original application. The review includes the actual workspace ID and selected executables. Launch checks that workspace ID before serving, and every native command carries it into the original engine. An externally replaced workspace at the same path produces a source identity error that requires re-review.

The original authenticated server announces its local address. Applications reads the actual State response before retaining that address as ready. Open the returned address for this run. The original browser then owns its saved drafts and request recovery.

Use Stop on that same Applications operation before changing the runtime selection. The wrapper forwards the stop to its own server; the server stops and waits for its admitted native child groups, shuts down its accepted HTTP connections, closes the listener and joins the request handlers before returning. This also releases a client that disconnected during a response or supplied only part of a request body. Source data and native checkpoints remain available for the next open.

During original operator receiving, keep one authenticated `/api` request open after supplying only part of its declared JSON body, then use that same Applications Stop. Confirm the operation returns and the connection closes, then reopen the original workspace and read its unchanged ID. Use the existing operator and selected source for this check; a body that has not been fully received must never start a native command.

## 5. Receive the complete native handover

For a completed browser/Python export, retain the entire original ZIP and its returned byte count, SHA-256, manifest SHA-256, workspace ID and revision. Select a separate receiving directory. The native receiver verifies the original archive and its selected application before publishing that directory.

The source owner's full [receiving guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/migration/RECEIVING.md) and executable `migration/examples/receiving_journey.py` operate the complete path:

1. Select the retained original edition and build its native maps through the unchanged QGIS engine.
2. Save the full workspace archive with its original source, mapping, projects, styles, publications, event history and software selection.
3. Verify and independently receive that archive.
4. Run from the application included in the received workspace, verify its complete source and reopen its actual maps/publications.
5. Export that received workspace onward and independently reopen the onward delivery.

The original journey's configuration records its actual source/workspace/output paths and IDs. Preserve its current operation directory and complete result. If it has already begun, continue its original configuration instead of creating a second operation.

When moving that existing journey to another host, use its documented `--remap` input. Keep the original saved snapshot and complete action inputs. The helper checks workspace identity, original edition bytes, source files, event prefix and committed requests before continuing. Copy each completed archive with its receipt; the saved old path remains historical metadata while the remap supplies its current location.

## 6. Download and receive through the original merchant

The original SDK produces a small `migration-export.json` and complete `handover.zip`. The export manifest binds the selected native workspace/revision, original request, native package manifest and complete archive.

From an existing merchant connection:

~~~sh
starforge migration-workspace inspect-export \
  --url ORIGINAL_MERCHANT_MCP_URL \
  --workspace delivery --workspace-id ORIGINAL_WORKSPACE_ID \
  --export-id ORIGINAL_HANDOVER_ID

starforge migration-workspace download \
  --url ORIGINAL_MERCHANT_MCP_URL \
  --workspace delivery --workspace-id ORIGINAL_WORKSPACE_ID \
  --export-id ORIGINAL_HANDOVER_ID \
  --expected-manifest-sha256 ORIGINAL_MANIFEST_SHA256 \
  --directory /srv/starforge/private/received-handover
~~~

Copy all original returned selectors, including the manifest hash. Use the existing merchant authentication environment through its `--token-env` option when configured.

The maintained file receiver binds the manifest, exact offset, chunk and complete hash. It resumes the same verified prefix after interruption and reopens an expired reader against the same original immutable file. It publishes the final local manifest only after the complete archive verifies.

Inspect and independently receive the completed files:

~~~sh
starforge migration-workspace inspect-received \
  --directory /srv/starforge/private/received-handover \
  --expected-manifest-sha256 ORIGINAL_MANIFEST_SHA256

starforge migration-workspace receive-local \
  --directory /srv/starforge/private/received-handover \
  --expected-manifest-sha256 ORIGINAL_MANIFEST_SHA256 \
  --destination /srv/starforge/private/independent-migration \
  --runtime /srv/starforge/private/independent-migration-tasks \
  --python /absolute/path/to/qgis-python \
  --request-id ORIGINAL_RECEIVING_REQUEST
~~~

Use the same receiving request ID, manifest and directories on recovery. The original receiver's default native reopening mode is `required`. It checks the complete selected package, actual saved maps/publications and incoming workspace identity before completing the receive.

For a host-declared remote destination, retain a `handover` input alias with its exact original file, bytes, SHA-256 and incoming workspace ID. Its destination alias selects the independent directory and that same ID. The existing `receive` tool invokes the original native receiver; both caller and engine preserve the expected workspace ID.

See the [merchant source guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/stac/migration/merchant/MERCHANT.md) for exact typed functions, tool arguments, native-result downloads, input aliases and shutdown behavior.

## 7. Reopen the received project

Run Describe against the actual returned receiving directory. Its workspace ID should match the original delivered identity. Review that directory and the receiving host's selected environments in a separate **GIS migration** Applications entry.

Open the original source rows, selected plan and issue result, generated editions, QGIS projects and publication files. Read the original event and request history. Native reopening uses the maps, styles, data and resources included in the archive.

To attach merchant tools to that received workspace, create its own external native request directory and private connection:

~~~sh
starforge migration-operator connect \
  --workspace /srv/starforge/private/independent-migration \
  --python /absolute/path/to/operator-python \
  --vector-python /absolute/path/to/vector-python \
  --qgis-python /absolute/path/to/qgis-python \
  --runtime /srv/starforge/private/independent-merchant-tasks \
  --connection /srv/starforge/private/independent-migration-connection.json \
  --alias received

starforge migration-workspace init \
  --directory /srv/starforge/private/independent-migration-merchant \
  --connection /srv/starforge/private/independent-migration-connection.json
~~~

This records the received workspace's actual ID. Existing source, native editions and journal remain in their original received directory. Keep its native request directory with its original merchant connection for asynchronous request and complete result recovery.

A following correction belongs to that reopened workspace. Retain the current original revision and complete source decisions, then export its full successor with a new handover identity. Earlier source, maps, publications and history remain part of the complete onward delivery.

## 8. Preserve the operated result

Keep these complete outputs together:

| Output | What the next operator can recover |
| --- | --- |
| Selected distribution package and source manifest | Exact installed Node platform, native source and registrations |
| Original migration workspace | Inputs, captures, plans, issues, editions, maps, publications and journal |
| Complete native handover ZIP and receipt | Portable original project and selected Python/QGIS application |
| Merchant export manifest and handover ZIP, when used | Exact retained transfer and complete archive identity |
| Original native request directory | Input bodies, attempts, logs, results and download continuation |
| Actual receiving result | Runtime/source identities, original and received IDs, complete file hashes and reopen outcomes |
| Private connection and Applications selection | Current host's native paths and original operating entry |

Close the original producing application and retained readers, then save the completed archive through the existing durable file route before its temporary owner ends. On a transport interruption, retain the same archive, operation and work directory while resolving that original save. The next native stage continues the saved original source and outcome.
