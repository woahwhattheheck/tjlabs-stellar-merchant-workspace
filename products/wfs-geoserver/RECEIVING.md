# WFS receiving and original-operation continuation

Use this guide to receive a complete WFS project, an original native vector delivery, or the complete source-file dataset already acquired by a customer. Each route uses the maintained receiver and keeps the original project, source and request identities.

The [operating guide](OPERATING.md) covers the named `wfs-geoserver` installation, original Applications selection, source acquisition and merchant connection. The source files for all receiving routes are included in that selection.

## Choose the existing delivery

| Existing item | Original receiving interface | Preserved identity |
| --- | --- | --- |
| Complete `stellar-forge.wfs-project-bundle.v1` JSON | `wfs inspect-bundle`, then `wfs receive` | Bundle SHA, original project UUID, source index, exact file inventory and original revision |
| GeoPackage/Shapefile delivery ZIP or native comparison ZIP | `wfs vector-receive` | Complete archive SHA, native manifest, source captures and native request |
| Original SF88 Dataset delivery report | `wfs source-receive --source` | Original publication, immutable snapshot, nine-column source projection and complete source manifest |
| Original completed SF100 native scan | `wfs source-receive --native-scan` | The same complete source-file contract and source set |
| Dataset already retained in the original WFS merchant | `dataset-receive`, then `customer-reopen` | Existing dataset plan, acquisition/session, source publication and project |
| Retained GeoSolutions customer operation | Original `launch_wfs_customer.py` and its complete packet | `SCF-WFS-GEOSOLUTIONS-CUSTOMER-7DE2-20261012` and the original two-edition source capture |

Choose the exact file or existing operation being handed over. Keep its original byte count, SHA-256 and returned descriptor. A displayed row preview is a useful inspection surface; its full original file remains the receiving input.

## Receive a whole project

Export from the existing producer, then inspect and receive that complete file:

~~~sh
starforge wfs export --project /private/wfs/producer \
  --out /private/wfs/exports/complete-project.json

starforge wfs inspect-bundle \
  --source /private/wfs/exports/complete-project.json

starforge wfs receive --project /private/wfs/customer-project \
  --source /private/wfs/exports/complete-project.json \
  --id receive-project-1 \
  --python /absolute/gis-venv/bin/python

starforge wfs show --project /private/wfs/customer-project
starforge wfs serve --project /private/wfs/customer-project \
  --python /absolute/gis-venv/bin/python
~~~

Use a new receiving directory or the same original target of this handover. The target belongs to the retained receiving intent; a different existing project is preserved.

The portable inspector validates the complete canonical bundle hash, original project ID/name/revision and exact original index bytes. Its sorted inventory contains every selected path, length, SHA-256 and full payload. Source documents, response pages, orders, comparisons, selected publication files and native vector histories travel together.

The default complete compact-JSON allowance is 256 MiB. `--max-bytes` selects an explicit allowance below 512 MiB with the original encoding reserve. The inventory supports up to 100,000 selected members, with the source project index limited to 8 MiB. Use the actual complete file and the capacity selected by its receiving operation.

Receiving validates all source and native bindings before exposing the project. It retains one private intent and the completed receiving record before publication of the original index. Interrupted extraction or final index publication continues using the same file, ID and target.

A repeated completed receive checks the immutable original closure and reports `reused`. Later legitimate customer revisions and continued partial source orders remain intact. The result distinguishes the handover's original `revision` from `currentRevision` on the receiving project.

Use `project-import --project HOST_PROJECT --source COMPLETE_PROJECT_JSON` when the receiving project is to live under an existing host project's original received-project tree. `project-open --project HOST_PROJECT --bundle-sha ORIGINAL_BUNDLE_SHA` opens that same saved edition.

### Verify the working handover

Open the source, query, order, comparison, publication and native-vector sections in the received desk. Select representative original files for complete download, using their actual retained IDs:

~~~sh
starforge wfs capabilities-file --project /private/wfs/customer-project \
  --source SOURCE_SHA --out /private/wfs/customer-exports/capabilities.xml

starforge wfs features-file --project /private/wfs/customer-project \
  --order ORDER_SHA --out /private/wfs/customer-exports/features.geojson

starforge wfs vector-document --project /private/wfs/customer-project \
  --id NATIVE_OPERATION_ID --document manifest \
  --out /private/wfs/customer-exports/native-manifest.json
~~~

Continue all selected paged records using their returned next offset. Compare the full downloaded bytes and original source identities to the handover's descriptors. The same received project is available to the original application API, installed CLI and merchant attachment.

Keep authorization and runtime configuration as the receiving operator's private selections. The portable project retains its persistent source and business records; live Buyer credentials, source authorization and earlier nested project bundles remain outside its selected closure.

## Receive native GIS files

Use an initialized or already received WFS project and the same selected Python with Fiona/GDAL:

~~~sh
starforge wfs vector-receive --project /private/wfs/customer-project \
  --id receive-native-1 \
  --source /private/wfs/incoming/parcels-native.zip \
  --manifest-sha ORIGINAL_NATIVE_MANIFEST_SHA \
  --python /absolute/gis-venv/bin/python

starforge wfs vector-show --project /private/wfs/customer-project \
  --id receive-native-1 --python /absolute/gis-venv/bin/python

starforge wfs vector-document --project /private/wfs/customer-project \
  --id receive-native-1 --document receiving \
  --out /private/wfs/customer-exports/native-receiving.json
~~~

The request pins the complete ZIP SHA-256. `--manifest-sha` also checks a separately supplied original manifest identity. The receiver accepts complete native deliveries and comparison packages, validates the selected members and reopens the actual GeoPackage/Shapefile contents.

Native files retain their source features, geometry, original properties, field mappings, chosen physical types, coordinate binding and feature-to-native-row mapping. Comparison packages retain both complete source editions and the original change records.

If receiving stopped after the request was saved but before the archive was copied, repeat `vector-receive` with the same ID and original file. Once the archive is retained, use:

~~~sh
starforge wfs vector-resume --project /private/wfs/customer-project \
  --id receive-native-1 --python /absolute/gis-venv/bin/python
~~~

Capture, export and comparison also continue through `vector-resume` on their original IDs. Native history lives under the project's `native-vectors/` tree and keeps its immutable requests, actual engine results and full files.

The browser's request journal preserves the complete body before submission. **Retry saved request** continues that body after an interrupted response. **Keep in history** preserves it while allowing a deliberate new request with corrected inputs. A completed server receipt remains authoritative when a reply is lost.

## Receive a complete source-file dataset

When the original WFS Dataset operation is already delivered, reuse its publication and dataset ID:

~~~sh
starforge wfs dataset-receive --project /private/wfs/producer \
  --publication PUBLICATION_SHA --id ORIGINAL_DATASET_ID \
  --buyer-config /private/wfs/operator/buyer.json \
  --python /absolute/gis-venv/bin/python

starforge wfs customer-reopen --project /private/wfs/producer \
  --publication PUBLICATION_SHA --id ORIGINAL_DATASET_ID \
  --python /absolute/gis-venv/bin/python

starforge wfs customer-open --project /private/wfs/producer \
  --publication PUBLICATION_SHA --id ORIGINAL_DATASET_ID \
  --python /absolute/gis-venv/bin/python
~~~

These steps consume the original completed delivery. The original Dataset plan already binds its immutable snapshot, expected source manifest, explicit budgets, original configuration and session. Recovery and delivery remain actions on that retained dataset.

A receiving operator with the complete SF88 report can instead use:

~~~sh
starforge wfs source-receive --project /private/wfs/customer-sources \
  --source /private/wfs/incoming/original-delivery.json \
  --capture-manifest ORIGINAL_MANIFEST_SHA --source-set ORIGINAL_SOURCE_SET_SHA \
  --python /absolute/gis-venv/bin/python

starforge wfs sources-open --project /private/wfs/customer-project \
  --source /private/wfs/customer-sources --id receive-sources-1 \
  --python /absolute/gis-venv/bin/python

starforge wfs source-file --source /private/wfs/customer-sources \
  --file project-bundle.json \
  --out /private/wfs/customer-exports/original-project.json \
  --python /absolute/gis-venv/bin/python
~~~

Select `--native-scan ORIGINAL_SCAN_JSON` instead of `--source` for an already completed original SF100 scan.

The receiver validates all nine original source-file columns: capture ID, source set, path, file SHA, file bytes, chunk index, chunk count, chunk SHA and complete Base64 content. It checks the original publication, immutable snapshot, exact manifest, all reconstructed bytes and the complete project binding. The JavaScript portable inspector then validates the original project before reopening it.

`source-file` reads an exact retained member after source inspection. `dataset-file` selects the actual delivered `dataset.csv`, `dataset.jsonl`, `review.html`, `manifest.json` or `semantics.json`. These exports stay bound to their original delivery.

## Continue an interrupted source operation

Read `wfs show --project ORIGINAL_DIRECTORY` before choosing a continuation.

| Observed original state | Same-operation continuation |
| --- | --- |
| Pending source discovery, schema capture, order or publication | `wfs resume --project DIR --id ORIGINAL_ID` uses retained inputs and expected revision |
| Order stopped at its declared capacity | The same `resume` can accept a reviewed `--limits` file while preserving its source selection and accepted prefix |
| Source action committed but reply was lost | The original ID returns its retained completed result and current project revision |
| Native capture/export/receive interrupted | `vector-resume` uses the same ID and retained native inputs |
| Buyer reply or paid request uncertain | `recover` uses the original publication and intent |
| Dataset acquisition or delivery interrupted | `dataset-inspect` and `dataset-recover` use the existing Dataset ID and original budget |
| Complete project receive interrupted | Repeat `receive` with the same full bundle, ID and target |
| Merchant client restarted | Read the same current WFS connection, preserve project/binding, and obtain a current retained-read handle for the same file/digest/offset |

An operator who deliberately abandons a pending source action uses `abandon` with a new decision ID, current revision, original pending ID and a retained note. Source history remains available for later analysis.

## Use an installed merchant attachment for receiving

The host configuration selects complete inputs under stable aliases. A vector profile and a native ZIP can be declared as:

~~~json
{
  "profile-reviewed": {
    "kind": "vector-profile",
    "path": "/private/wfs/incoming/reviewed-profile.json",
    "sha256": "ORIGINAL_PROFILE_FILE_SHA256"
  },
  "native-delivery": {
    "kind": "vector",
    "path": "/private/wfs/incoming/native-delivery.zip",
    "sha256": "ORIGINAL_NATIVE_ZIP_SHA256",
    "manifestSha256": "ORIGINAL_NATIVE_MANIFEST_SHA256"
  }
}
~~~

Place these entries inside the selected workspace's `inputs` map and replace the digest placeholders with actual values. The host reads the complete selected file and verifies its original SHA before an action. `merchant_wfs_input` inspects the alias; `merchant_wfs_vector_receive` uses its exact input and expected SHA.

For a portable project, declare `kind:"project"` and use `merchant_wfs_import` with the original alias and full-file digest. The original application receives it under its existing received-project tree.

`merchant_wfs_file_read` returns complete original files in verified chunks. Keep the expected digest and offset across a host restart, then acquire a current read handle. `merchant_wfs_file_release` releases that handle. The host's read lease and the underlying immutable file have different lifetimes.

## Continue the original GeoSolutions customer programme

The existing operation is:

- Customer: `SCF-WFS-GEOSOLUTIONS-CUSTOMER-7DE2-20261012`.
- Source: `OGC-WFS2-GEOSOLUTIONS-20261012-7DE2`.
- Original source/native owner: 7DE2.
- Original cumulative product: `b7225cd0a84d554ba1973a0d2734433033178d11`, preserving PR1978, native-vector PR2054 and complete customer PR2087.

The maintained package contains the complete original guide and source carrier:

~~~text
source/stellar/scf-starforge-20261009/sf30-seller-sdk/wfs/examples/native-runtime/RUN_CUSTOMER.md
source/stellar/scf-starforge-20261009/sf30-seller-sdk/wfs/examples/native-runtime/source-packet.json
~~~

The source carrier is 3,044,274 bytes, Git blob `299787bcabe9a6f94cb80c17cc29f79cd61473c5`. Its eleven complete UTF-8 members include the original donor receiver and 538-file donor packet, 53-file WFS overlay, exact local protocol fixture, customer driver, foreground owner, launcher, artifact publisher and original source-capture receiver/validator. Verify each member's byte count and Git blob identity before materializing its original basename. The complete guide specifies the original helper identities and source selection.

The two original retained source editions are separate customer inputs. Use the source owner's actual `commons.wfs-capture-library-source.v1` descriptor and complete original `source_delivery`, or its existing exact captured directory and manifest SHA. That capture includes capabilities, schema, hits, every page, request/response metadata and interrupted-attempt history.

An equipped original receiver selects its actual runtime paths before the original native input is prepared, retaining the original launcher and any reviewed host-path mapping. An already prepared input continues from its exact retained source selection and record.

With all original packet members materialized at `PROJECT`:

~~~sh
python3 -B PROJECT/launch_wfs_customer.py \
  --family wfs --project PROJECT \
  --source-library ACTUAL_CAPTURE_DESCRIPTOR
~~~

The alternative existing-directory input uses `--source-capture ORIGINAL_CAPTURE_DIRECTORY --source-manifest-sha256 ACTUAL_MANIFEST_SHA256`. The two input forms are mutually exclusive. Reconcile any existing customer foreground/native placement before a continuation.

The programme performs the full original source/MCP cancellation and resume, two-edition comparison, native field mapping in the browser, GeoPackage/Shapefile export and native reopening. It interrupts one committed HTTP export response, resumes that same saved browser request, publishes the original source and feature products, and receives the full customer project through the original SF30/SF88 engines and local protocol fixture.

The original driver then reopens the installed CLI and customer browser. Replaying the source bundle preserves a legitimate later customer review revision. Native manifests, original request hashes, exact profiles and all selected files remain attached to the same customer history.

## Retain the complete original outcome

The original foreground drains its child processes before reading the returned customer output. Its `customer-custody` directory retains the exact native result, original exit, artifact identity and save state.

The complete `WFS_Customer_20261012_<manifest-edition-prefix>.zip` contains the original source/customer workspaces, request and step records, received project, native files, output files, source selection and outcome. When the saved-source descriptor is used, its complete received capture and original receiving receipt travel with the private customer handover.

Keep the complete ZIP and its `delivery-manifest.json` together. Return the original native record/session, actual customer outcome, exact artifact byte count/SHA and saved-custody result to the existing WFS coordination thread. The following maintained installation can then consume the same original project and source edition through the receiving routes above.
