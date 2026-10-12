# Install and operate the commissioning application

This guide uses the original SensorThings workspace, FROST-Python-Client and FROST/PostGIS services. It covers a receiving engineer's complete runtime and launch path. Customer endpoint credentials stay in the selected host environment; retained source, reviewed plans and native request receipts stay in its private workspace.

## Select the application source

Use a complete checkout or installed source distribution containing the SensorThings workspace and its original shared dependencies. The commissioning component is:

~~~text
stellar/scf-starforge-20261009/sf30-seller-sdk/sensorthings/commissioning/
~~~

Do not copy only the component into an unrelated directory: its module imports deliberately use the maintained workspace, original private store, source adapter and file transport. The reference programme also verifies every file in the selected complete source manifest and binds its own module tree to that repository.

Choose a Node runtime supported by the maintained Merchant Workspace, an existing CPython 3.12 executable, and private canonical directories owned by the operator. The original private-store lease requires the host's existing util-linux `flock` command. A running Desk owns its workspace until its native work and file transfers have drained.

In the examples below, replace the absolute paths with the selected existing installation and private operation directory:

~~~sh
DATACOVE_SOURCE=/absolute/merchant-source
DATACOVE_COMPONENT="$DATACOVE_SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/sensorthings/commissioning"
DATACOVE_PRIVATE=/absolute/private/datacove
~~~

## Install the original Python client once

The bundled capsule contains all 47 original source files from Fraunhofer IOSB/FROST-Python-Client commit `9f41f7794725fced63fcb07e6b33dbc1f897f2bc`, version 1.1.53. The installer checks each original Git blob and byte count before installation. It installs that unchanged package into its own Python 3.12 virtual environment and verifies the actual imported package origin, every installed original Python file and the selected distribution versions.

~~~sh
/absolute/python3.12 "$DATACOVE_COMPONENT/runtime/install.py" \
  --root "$DATACOVE_PRIVATE/runtime"
~~~

The original bundled capsule is the default first-install source. Existing source custody can instead be selected through exactly one of:

~~~sh
/absolute/python3.12 "$DATACOVE_COMPONENT/runtime/install.py" \
  --root "$DATACOVE_PRIVATE/runtime" \
  --upstream-source /absolute/original/FROST-Python-Client
~~~

~~~sh
/absolute/python3.12 "$DATACOVE_COMPONENT/runtime/install.py" \
  --root "$DATACOVE_PRIVATE/runtime" \
  --git-cache /absolute/existing/git-cache
~~~

~~~sh
/absolute/python3.12 "$DATACOVE_COMPONENT/runtime/install.py" \
  --root "$DATACOVE_PRIVATE/runtime" \
  --source-capsule /absolute/original/frost-upstream-source.json
~~~

The Git-cache route reads exact local blobs and does not fetch a provider or move a branch. A complete existing wheelhouse can be selected with `--wheelhouse /absolute/existing/wheelhouse`; this uses pip's offline no-index installation. Otherwise the host's configured package route supplies the original declared dependencies. Preserve the actual install report and resolved versions from this installation.

The returned READY response identifies the exact interpreter and `runtime-ready.json`. Repeating the same command reopens and verifies that environment; it does not reinstall a ready environment. A changed original-source manifest, imported package or distribution set is reported explicitly.

The installer keeps its original lock open in actual install children. Its private logs, install report, resolved constraints and `reproduction.json` retain actual outcomes. Keep the selected virtual-environment interpreter path unchanged, including its venv prefix.

## Prepare the original browser assets

Use [build/STAM_ASSETS.md](build/STAM_ASSETS.md) with its exact `stam-input.json` and original builder. This selects DataCoveEU/STAM commit `0e414f3441a8773619f242c797fe75e9af3fc04d`, its frozen package lock, the original tsdown build and Leaflet 1.9.4. The declared browser asset manifest and source/license identities are part of the complete application.

The receiving host must supply the completed original assets before the full map/browser programme. Preserve the original asset-build operation if it is already running or queued. Its complete output and build result establish readiness; a source file or a queued job does not.

## Choose a customer target

For actual customer work, create or reopen the project in the installed Desk, retain its sources, and use the target form to select the agreed existing SensorThings endpoint and host-held authorization reference. Keep source and target identities separate. Inspect the target before approving its plan.

The operator remains responsible for selecting the target, allowed entity set, mapping, change window and reviewer. Existing target state is retained as an actual native inspection. A later plan is reviewed against that state, rather than treating previously observed remote data as permanently current.

## Optional private FROST reference target

The full reference programme uses one private original FROST/PostGIS service. The helper in `runtime/reference_target.py` realizes the original client's published Compose example while retaining the selected images and private target identity.

It requires an already equipped Docker engine and existing immutable FROST/PostGIS image IDs. It does not download or build images. Select the actual image identities returned by that engine:

~~~sh
/absolute/python3.12 "$DATACOVE_COMPONENT/runtime/reference_target.py" up \
  --root "$DATACOVE_PRIVATE/reference-target" \
  --engine /absolute/docker \
  --frost-image sha256:ACTUAL_EXISTING_FROST_IMAGE_ID \
  --postgis-image sha256:ACTUAL_EXISTING_POSTGIS_IMAGE_ID \
  --port 8784 \
  --startup-timeout 180
~~~

The example image values are placeholders for actual existing engine identities. The helper verifies the selected images, retains the generated database password before starting Compose, labels its own resources, and binds the HTTP service to 127.0.0.1. It exposes neither the database nor MQTT ports. The selected realization enables MultiDatastream support, assigns 1,536 MiB to FROST and 512 MiB to PostGIS, and retains the complete Compose selection and actual health-response bytes.

The target receipt is `reference-target/target.json`. READY requires an actual HTTP 200 SensorThings root response containing Things. A failed startup retains the same selected target and original logs for continuation.

~~~sh
/absolute/python3.12 "$DATACOVE_COMPONENT/runtime/reference_target.py" status \
  --root "$DATACOVE_PRIVATE/reference-target" --engine /absolute/docker
~~~

~~~sh
/absolute/python3.12 "$DATACOVE_COMPONENT/runtime/reference_target.py" stop \
  --root "$DATACOVE_PRIVATE/reference-target" --engine /absolute/docker
~~~

Stopping retains the original database volume. Reopening uses the same receipt and selected images. The complete reference programme never selects Hamburg's public service as its writable target.

## Launch the installed operator

~~~sh
/absolute/node "$DATACOVE_COMPONENT/cli.mjs" serve \
  --workspace "$DATACOVE_PRIVATE/workspace" \
  --source-inbox "$DATACOVE_PRIVATE/source-inbox" \
  --frost-python "$DATACOVE_PRIVATE/runtime/venv/bin/python" \
  --runtime-ready "$DATACOVE_PRIVATE/runtime/runtime-ready.json" \
  --host 127.0.0.1 --port 8783 \
  --session-file "$DATACOVE_PRIVATE/operator-session.json"
~~~

Startup writes the original private access URL to the selected session file. Open that URL in the operator's browser. Standard output carries only the workspace ID, origin, route and session-file path. The session token is not a customer source field.

The runtime can also be supplied through `SENSORTHINGS_FROST_PYTHON` and `SENSORTHINGS_FROST_RUNTIME_READY`. Supply the two references together. The runtime receipt is checked before native work; target authorization values remain in the host environment.

Follow [OPERATOR.md](OPERATOR.md): retain source, inspect rows/entities, review mapping and target, approve the exact plan, run, inspect actual verification, retain corrections and decisions, then prepare and receive the complete handoff.

## CLI operating and recovery path

The CLI uses the same original workspace writer and action request as the browser:

~~~sh
/absolute/node "$DATACOVE_COMPONENT/cli.mjs" overview \
  --workspace "$DATACOVE_PRIVATE/workspace"
~~~

~~~sh
/absolute/node "$DATACOVE_COMPONENT/cli.mjs" action \
  --workspace "$DATACOVE_PRIVATE/workspace" \
  --source-inbox "$DATACOVE_PRIVATE/source-inbox" \
  --frost-python "$DATACOVE_PRIVATE/runtime/venv/bin/python" \
  --runtime-ready "$DATACOVE_PRIVATE/runtime/runtime-ready.json" \
  --input /absolute/private/original-request.json
~~~

The request is the retained `{operationId, expectedRevision, action, payload}` from [CONTRACT.md](CONTRACT.md). Keep those exact bytes after interruption and reconcile that original operation. Native action commands wait for the same job to close. They return exit status 2 when its final observed native state is not COMPLETE.

Do not open a second CLI writer against an active Desk. Use that Desk's authenticated HTTP actions and reads, or close it after its actual work drains. Ctrl-C on the CLI asks the current process to drain; it does not manufacture a successful native outcome.

Use `project`, `source`, `rows`, `plan`, `job`, `history` and `map` with exact retained IDs. Paged reads use `--offset` and `--limit`. Complete file download uses its SHA ID and a new private destination:

~~~sh
/absolute/node "$DATACOVE_COMPONENT/cli.mjs" download \
  --workspace "$DATACOVE_PRIVATE/workspace" \
  --id ORIGINAL_FILE_SHA256 \
  --output /absolute/private/complete-handoff.ndjson.gz
~~~

An already present identical output is reopened. A different file at that destination is reported rather than replaced.

## Receiving on another host

Receive through the original handoff action in a separate private workspace. The receiving host can inspect the retained source, plans, native receipts, reviews and map without installing FROST or contacting the target. Continuing native work requires its explicitly selected local runtime and target binding.

Compatible later project history advances the original project. Repeated input is idempotent. An older package preserves later work, while divergent history is reported for explicit handling. Live native owners and in-flight observations drain before a forward receive; older local journal observations cannot overwrite the received descendant.

For the complete source-selected original demonstration and its artifact checks, use [RECEIVING.md](RECEIVING.md).
