# Municipal asset migration and target receiving

Open the complete municipal asset workspace through the existing SCF Applications operator. It retains source/target asset editions, explicit identifier and relationship mappings, geometry, repair decisions, original work-order requests and returned outcomes. The same project can receive complete public GIS source captures and configured Maximo target observations.

The installed application is the maintained McPherson/Belleville Python workspace and its unchanged acceptance checker, composed with the current complete Maximo addon. Its original source, SQLite transactions, named actors, stable mutation IDs and expected project revisions remain the operating contract.

## Install the complete selected product

Use the existing maintained Linux distribution builder with Node 22.16+ and Python 3.11+ with standard SQLite. The municipal application itself needs no downloaded Python packages. Existing merchant dependencies and runtime preparation remain the selected distribution's ordinary installation.

From this repository at the intended immutable commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo . --ref SELECTED_IMMUTABLE_COMMIT \
  --selection municipal-assets --out /absolute/private/municipal-package --offline
~~~

Retain the actual returned archive path and SHA256. Install that original archive through the existing [installation and runtime guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md). The source-only CLI can be used from the package installation with `npx --no-install starforge`; Applications uses the same archive's prepared READY runtime. Do not point a managed application at a source checkout while selecting a different installed runtime.

The selected archive includes the entire native workspace, original checker, original development example, complete Maximo target modules, public capture/geometry/refresh, static browser assets, all operating guides, the source-owned Applications adapter and source manifest. The labelled development files remain distinct from operator-loaded municipal records. Actual customer captures, Maximo credentials and private workspaces are loaded from their existing custody.

## Open the actual saved project

For the original D1CC workspace, stop its existing operator before changing the selected application process. Keep the physical directory and original project IDs. The new managed entry supplements the original app; it does not create another project or import source data on launch.

Select the actual installed Python executable. From the installation directory:

~~~sh
npx --no-install starforge municipal-assets --python /absolute/installed/python adopt /absolute/private/municipal-workspace
npx --no-install starforge municipal-assets --python /absolute/installed/python inspect /absolute/private/municipal-workspace
~~~

`adopt` adds one stable managed identity in the existing SQLite settings transaction. Repeating it retains the same value. Original records, mappings, input hashes, revisions and operation receipts remain unchanged. `inspect` is read-only and shows the actual logical identity, physical database binding, selected source digest and project list. The original private password stays at `operator-password.txt`.

For a genuinely new empty workspace, run `init DIRECTORY` before `adopt DIRECTORY`. The original `restore BACKUP.zip DIRECTORY` command receives a SQLite-only native backup. The complete `receive` command below includes the retained filesystem source history as well.

In the existing managed runtime:

1. Attach the prepared READY runtime containing this source selection.
2. Open **Applications → Municipal asset migration and target receiving**.
3. Choose the initialized/received private workspace, actual Python executable, optional original environment JSON and port. Use port 0 for an available loopback listener.
4. **Review → Save → Review Start → Start → Open**.
5. Sign in with the original private password and your operator name. Select the existing project.

Review retains the exact source manifest, Python executable, credential-file identity and stable native database binding. Start rechecks those before the original server opens. Open is published only after the original listener authenticates and returns its exact instance, workspace and source identity. Mutable project revisions remain under the original application engine, so ordinary editing does not invalidate the saved launch entry.

Use the normal Applications Stop and recovery controls. Restart selects the same saved app and directory. A separately received directory gets its own Applications entry, with the retained logical workspace identity and its new physical database binding. The original process and received process have independent private authentication.

## Operate the complete application

| Work | Existing application flow |
|---|---|
| Source intake | Import original CSV, JSON, JSONL, GeoJSON/Esri or a complete Belleville source carrier as source assets. Retain full source-qualified identifiers and original typed attributes. |
| Mapping | Review actual columns and save the explicit identity, label, status, parent/location, geometry and attributes mappings. Source and target remain separately selected editions. |
| Inventory and repair | Search/paginate all records, inspect exact relationships and actual geometry, review omissions and prepare correction files. Original target values change only when an actual corrected target edition is received. |
| Work orders | Select an actual order/revision, prepare a named status request, then receive the adapter's original result. The unchanged engine applies the original return once and retains conflicts and rejected outcomes. |
| Public source refresh | The original project keeps its mapping/settings and stable refresh operation while complete metadata, before/after IDs, attributes and provider-transformed WGS84 geometry are acquired. Continue the original saved request at provider retry times. |
| Maximo target | Save the real tenant profile, read actual schema and full target pages, review compound identity/source linkage and receive the selected target into this same project. Prepare a source-bound load, receive the original native result and collect the following actual target edition. |
| Delivery | Read the complete report, exact proposed repairs, original acceptance packet, selected source and retained release. Save the full stopped-workspace handover for independent editable receiving. |

The complete retained native guides are [workspace operation](../../stellar/scf-starforge-20261009/sf30-seller-sdk/municipal-assets/native/workspace/README.md), [public capture and refresh](../../stellar/scf-starforge-20261009/sf30-seller-sdk/municipal-assets/native/workspace/BELLEVILLE.md) and [Maximo operation](../../stellar/scf-starforge-20261009/sf30-seller-sdk/municipal-assets/native/workspace/MAXIMO.md). Their direct `python -m workspace ...` commands are also available through the installed entry point:

~~~sh
npx --no-install starforge municipal-assets --python /absolute/installed/python capture DIRECTORY CAPTURE_FILE --output OUTPUT_DIRECTORY --actor OPERATOR --operation ORIGINAL_ID --project PROJECT_ID
npx --no-install starforge municipal-assets --python /absolute/installed/python refresh DIRECTORY --project PROJECT_ID --actor OPERATOR --operation ORIGINAL_ID --expected-revision CURRENT_REVISION
npx --no-install starforge municipal-assets --python /absolute/installed/python refresh-resume DIRECTORY --operation ORIGINAL_ID
npx --no-install starforge municipal-assets --python /absolute/installed/python maximo --workspace DIRECTORY status --project PROJECT_ID
~~~

Use actual saved identifiers and source inputs. For a fresh authorized Maximo read, the private environment contains the selected API-key variable. The profile contains only its variable name. The original Maximo collector performs GET requests; the prepared target mutation remains a complete file for the prime's actual integration and original response receiving.

## Complete editable handover and receiving

The original browser **Workspace backup** and CLI `backup` provide the native SQLite snapshot. SQLite includes original inputs, mappings, all project history, work-order replay, Maximo profiles/captures/load/return records and the managed identity.

A complete SCF handover also retains the public-refresh and capture journals, original provider attempts, complete source files, exact output byte copies and preceding receiving provenance. Stop the managed application and any separately launched original worker first. Then:

~~~sh
npx --no-install starforge municipal-assets --python /absolute/installed/python handover /absolute/private/municipal-workspace --output /absolute/private/delivery/Municipal_Workspace.zip --operation ORIGINAL_HANDOVER_ID

npx --no-install starforge municipal-assets --python /absolute/installed/python receive /absolute/private/delivery/Municipal_Workspace.zip /absolute/private/municipal-received
npx --no-install starforge municipal-assets --python /absolute/installed/python inspect /absolute/private/municipal-received
~~~

The full handover uses the original consistent SQLite backup and the selected capture-operations, public-refresh and receiving-provenance files. It retains its first complete ZIP before publishing the requested output; replay of the same handover request republishes those exact bytes. A different current edition uses its own handover ID and output. The receiving command verifies every selected member and native database before publishing the whole directory atomically. Repeating that receiving reopens the original result and preserves later edits in the received project.

Receive generates a fresh private operator password. Keep this handover private: it contains complete original customer source and project data. It contains no copied operator password. The selected original source archive and supplier runtime/license obligations travel with the delivery through the existing installation workflow.

Original sidecar journal paths and request identities remain byte-exact historical provenance. A completed refresh's relative output files reopen in the received directory. Continue an in-flight external source operation at its original saved physical workspace; independently received projects can start a following explicit refresh using their current project revision. Original source rows and prior review history remain selectable in both.

## Source identity and current receiving

[SOURCE_ADOPTION.json](../../stellar/scf-starforge-20261009/sf30-seller-sdk/municipal-assets/SOURCE_ADOPTION.json) binds the complete original source and each installed launch dependency. The original D1CC programme remains `MCPHERSON-ASSET-WORKORDER-WORKSPACE-20261011-D1CC`; SCF installed adoption is its same-workspace continuation `SCF-MUNICIPAL-ASSET-ADOPTION-90ED-20261013`. The complete current operator course is in [RECEIVING.md](RECEIVING.md).

Actual native results from the original product remain separate from operation of this new installed source edition. The equipped original receiver opens and uses the exact composed product and all outgoing files, and returns the actual desktop/narrow views and complete receiving result to the same original thread.
