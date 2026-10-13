# Receive and continue a complete CKAN merchant


For the original incident watcher, saved merchant case, portable handoff and
independent case receiving, follow [CKAN Support](SUPPORT.md). Its native
receiving programme uses the same complete original workspace archive.
A receiving operator needs the complete workspace archive, its compressed
SHA-256, the selected source/runtime and the original project records. The
archive carries the working product: captures, saved source declarations,
semantic reviews, candidates, dataset generations, merchant packages, release
history, buyer requests, full comparisons and decisions.

Keep the original source bundle and its acquisition companions beside the
workspace when the data arrived through retained public-source receiving.
The native archive and the complete source delivery serve the same operator
handover.

## Select the original source and runtime

Build and install `ckan-merchant` using [the operating guide](OPERATING.md).
For a new receiving shell, bind the commands to that same installed application:

~~~sh
CKAN_PRODUCT_DIR=/absolute/private/apps/ckan-merchant
starforge() { (cd "$CKAN_PRODUCT_DIR" && npx --no-install starforge "$@"); }
~~~

Select the resulting complete source archive and its original runtime profile.
The original receiving programmes use Node 24 on Linux, the project locks and
the declared native/MCP dependencies.

Use one actual private output root for each receiving operation. Keep the same
root and parameters on continuation. Product records contain the original
source, publication and receiving identities; source paths under an installed
package are rooted at that package's `source/` directory.

The four original programmes cover complementary complete operations:

| Programme under sf30-seller-sdk/ckan/examples | Required starting product | Whole operation |
| --- | --- | --- |
| `workspace_transfer.mjs` | Completed published project with a merchant export and customer configuration | Full project archive and receiving, preserved source/publication/release identity, original browser and release reopen |
| `agent_workspace_transfer.mjs` | Original configured merchant host and published project | Complete managed agent archive reads, declared sibling receiving, source and publication querying, host close and reopen |
| `managed-receiving.mjs` | Original configured host, saved source, publication and export | Managed browser and authenticated MCP, complete dictionary and merchant archive, owner shutdown and original project reopening |
| `reviewed_refresh.mjs` | Published project and a complete following capture or actual live selection | Every change page, successor review/publication, complete authenticated JSONL, whole-project receiving, seven refresh tools and second-operator decision history |

The source guides beside those programmes specify their exact arguments and
preserve their current implementation. Use the actual selected source and data.

## Receive an existing published baseline

Give the original archive a private input path, then inspect and receive it:

~~~sh
starforge ckan inspect-workspace \
  --archive /absolute/private/inputs/publisher-workspace.ckanw \
  --sha256 ORIGINAL_ARCHIVE_SHA256

starforge ckan receive-workspace \
  --archive /absolute/private/inputs/publisher-workspace.ckanw \
  --project /absolute/private/receiving/project \
  --sha256 ORIGINAL_ARCHIVE_SHA256

starforge ckan status --project /absolute/private/receiving/project
~~~

Retain the returned original source and publication IDs for the following
operation. Use the archive SHA-256, which differs from the embedded manifest
digest. The original receiver checks the complete archive and its retained
members, relocates the mutable project locations, and retains the original
relocation records. Its [workspace transfer guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/WORKSPACE_TRANSFER.md)
explains complete original source and release identity.

After receiving finishes, close the standalone owner before opening the
project through the original Applications or agent host. Both reuse the same
project directory.

## Supply the complete following source

For data already acquired by a connected worker, keep all original response
bodies and the complete acquisition receipt in their source bundle. The
selection JSON must describe the actual catalogue, resource, query, filters,
schema and pagination used in those original requests.

~~~sh
starforge ckan capture-received \
  --bundle /absolute/private/inputs/source-bundle.json \
  --bytes ORIGINAL_BUNDLE_BYTES \
  --sha256 ORIGINAL_BUNDLE_SHA256 \
  --operation ORIGINAL_OPERATION_ID \
  --selection /absolute/private/inputs/selection.json \
  --out /absolute/private/inputs/following-capture
~~~

The result is the ordinary complete capture and its original acquisition
binding. Keep `source-input.json`, `source-acquisition.json` and
`source-acquisition-binding.json` with that capture and the complete input
bundle. The [retained-source contract](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/RETAINED_PUBLIC_SOURCE.md)
defines all required members.

A following capture can instead be acquired directly by the original native
engine. The programme below accepts `--after-selection` in place of
`--after-capture` for that actual provider request.

## Complete the original refresh and second-operator journey

Run the selected source's original programme with the actual baseline IDs:

~~~sh
node /absolute/source/stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/examples/reviewed_refresh.mjs \
  --project /absolute/private/receiving/project \
  --source ORIGINAL_SOURCE_UUID \
  --previous-publication ORIGINAL_PUBLICATION_UUID \
  --after-capture /absolute/private/inputs/following-capture/capture.json \
  --out /absolute/private/receiving/output \
  --received /absolute/private/receiving/second-operator \
  --keys _id \
  --reviewer "Receiving operator"
~~~

Choose the actual unique source key or ordered composite keys appropriate to
the selected data. The original programme keeps the same retained input and
receiving journal on a repeated invocation.

The programme consumes the full comparison in seven-row pages and verifies the
complete JSONL. It previews and accepts the successor, runs the original
candidate review/publication, queries the predecessor and successor, and
receives the project into the independent operator directory. It then opens
the actual browser and managed MCP path, reads the full change file in
4,096-byte chunks, exercises the seven refresh tools, and records keep-current
and withdrawal decisions on the receiving copy. The accepted successor and
earlier publications stay readable. The original CLI reopens the saved
accepted decision and the complete receiving history.

A changed time selection remains explicit in the comparison. Use its source
selection interpretation together with the retained change counts.

## Receive the publisher and its editable customer application

The complete [Zürich portal-use example](../../stellar/scf-starforge-20261009/sf30-seller-sdk/ckan/ZURICH_PORTAL_USE.md)
adds a customer-analysis continuation to the same source and publisher workflow.
It retains both complete original date captures and publishes their reviewed
editions before receiving all original dataset pages into the Python customer
workspace. Both dictionaries and source-version identities travel with those
pages.

The original programmes are:

| Source programme | Retained starting point | Complete customer work |
| --- | --- | --- |
| `sf30-seller-sdk/ckan/examples/zurich-portal-use.mjs` | Both original captures and the same private publisher project/output roots | Reviewed meanings, two native publications, every SF100 page, complete publisher archive and independent publisher reopening |
| `sf88-operator-buyer-cli/python/examples/zurich_portal_use.py` | The original `publisher-programme.json` and the same private customer database/output roots | Both source imports, five editable queries, complete exports, saved report/workbook definitions, native customer archive and cold reopening |

Both paths are under `stellar/scf-starforge-20261009/` in the selected source.
The full operating guide gives the exact arguments and original fixed capture
hashes. Keep the complete captured source, selected executable source and native
project outputs together. Repeated invocations use the same original request
and source identities.

The two native workspace archives have different receiving commands:

- `Zurich_Publisher_Workspace.ckanw` uses the existing CKAN
  `inspect-workspace` and `receive-workspace` commands above.
- `Zurich_Customer_Workspace.zip` uses the original Python
  `stellar_forge_buyer.workspace_archive_receive` command with its delivered
  SHA-256 and an absent private destination.

Open the received customer directory through the normal
`stellar_forge_buyer.analysis_workspace` server. The new local launch capability
is supplied by that application, while its imported versions, queries, report,
workbook and output files retain their original saved identities. The complete
programme verifies all original query exports and the workbook after that cold
receive before recording customer completion.

On a constrained host, select a private writable `TMPDIR` for the original
workbook engine. After correcting a terminal workbook failure, the customer's
`--retry-workbook` option records one explicit child build against the same
saved definition and preserves the failed parent. Subsequent continuation uses
that selected child and reuses completed imports, queries and report jobs.

## Keep the entire completed delivery

Retain the original complete result directory with these outputs:

| File or directory | Retained work |
| --- | --- |
| `output/receiving.json` | Original parameters, phase progression and complete receiving outcome |
| `output/comparison.json` | Full returned comparison identity, counts and source/meaning interpretation |
| `output/accepted-refresh.ckanw` | Published predecessor and accepted successor at the completed first-operator state |
| `output/received-refresh-history.ckanw` | Complete receiving project and subsequent operator decisions |
| Original source bundle, selection and following capture | Every acquired response, native capture file and acquisition binding |
| Selected source archive and manifest | Exact executable source, assets, native entrypoints, guides and original dependencies |

Keep the complete compressed archives and their returned hashes. A whole
handover may package these files together with the original native logs and
source/runtime selection. On an ephemeral worker, save the complete result
while the producing filesystem is still available. An interrupted programme
needs that same retained working tree and original native records for its
continuation.

## Reopen and continue

Inspect `received-refresh-history.ckanw` with its original complete hash, then
receive it into a new private directory using the same `receive-workspace`
command. Open that directory through Applications or `ckan serve`.
The original source, published predecessor, accepted successor and reviewed
history are available for the next operator.

When a comparison or decision was interrupted, inspect its saved refresh
before continuing it:

~~~sh
starforge ckan refresh \
  --project /absolute/private/receiving/project --id ORIGINAL_REFRESH_UUID

starforge ckan refresh-resume \
  --project /absolute/private/receiving/project --id ORIGINAL_REFRESH_UUID
~~~

A source decision saved before process interruption completes its original
allocated successor. A workspace receive uses the original archive hash and
destination. A retained-source capture uses the same bundle, operation,
selection and capture directory. Preserve those existing records through the
same complete native programme, then save and open its completed handover.
