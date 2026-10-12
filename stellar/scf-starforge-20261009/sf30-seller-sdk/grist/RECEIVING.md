# Complete Grist receiving on the original source operation

The installed **grist-receive** command takes one real, complete Grist table capture through the original merchant product. It reviews the saved source in the browser, publishes two exact editions, runs the original seller and customer export, reopens the same source through installed Applications and merchant MCP, and retains a verified private archive after every native owner has closed.

Source entry: **grist/receiving.mjs**. The existing **grist-authoring** contribution includes this command in the maintained **grist-merchant** selection. Use the full selected runtime described below; the four receiving programs alone are not an installed merchant engine.

## Scope and actual evidence

| Stage | Existing product | Retained outcome |
| --- | --- | --- |
| Prepare | Grist declaration and complete capture readers; installed runtime inspector | Exact original declaration/capture/manifest hashes, observed row count, selected public aliases and native row-identity projection |
| Browser review | Grist authoring model, HTTP service and UI | Original capture imported, every row previewed, actual reviewer and request payload retained, immutable source version reopened |
| Publish | Original source dataset publisher | Two reviewed editions of one captured observation, with explicit ascending and descending public row-identity order |
| Seller and customer | Original SF82 console, dataset version store, SF88 configuration and client exporter | Actual development HTTP 402 terms, earlier cursor continuity, changed terms/restart/rollback, snapshot-pinned configuration, all six generated customer files and an offline generated request |
| Applications | Original installed runtime workspace and Grist application provider | Review/save/Start/Open/Stop, original lost Start reply recovery, console reopen and a second managed lifetime over the same source directory |
| Agent authoring | Source-owned Grist MCP provider | New explicitly reviewed source edition over the same capture, exact version-request replay, borrowed publisher and complete private packet download across process restart |
| Merchant staging | Original Grist deployment and SF82 lifecycle | Both published editions, complete five-file staging reads, compare/activate/Run/Stop/rollback with the original console/generation/instance guards |
| Delivery | Closed native directories and original receiving history | Complete regular-file inventory, verified private tar.gz, result and delivery identities |

This receiving entry performs no provider extraction, signing or settlement. HTTP 402, a pinned buyer configuration and an offline generated request do not establish a payment. The result records zero additional provider reads and zero additional payments. Live provider acquisition is a preceding stage of the same assigned source operation, through the original [provider reader](PROVIDER_INPUT.md).

The selected capture is a **COMPLETE_TYPED_RECORDS_READ**. It retains eight original resources: document, recent document states and visible columns before; one complete typed records response; a second complete typed records response; visible columns, states and document after. The two records bodies must have identical bytes. The visible schema and the observed history head's action number and hash must match before and after. The manifest reports documentStateVerified and repeatReadVerified as true, countVerified as false and atomicSourceSnapshot as false.

There is no fabricated pagination or independent count. pageCount 1 denotes the primary complete records response; the repeat response is a separate retained resource. The native API may normalize cells, including null list cells, before returning typed JSON. The product preserves and validates those API bytes and typed values; it does not claim original database-cell byte equivalence, an atomic database snapshot, unrestricted visibility, or a complete eternal action history.

The receiver compares every projected value in every emitted row against the original typed reader. No sample replaces the complete comparison. Source record order, preview order and publication order remain separate recorded choices.

## Select the full installed product

Use one exact reviewed repository commit that includes the provider, authoring, all four receiving modules, this guide and the grist-receive contribution:

~~~sh
GRIST_DIST="$GRIST_REPO/stellar/scf-starforge-20261009/distribution"
node "$GRIST_DIST/build.mjs" \
  --repo "$GRIST_REPO" --ref "$GRIST_COMMIT" \
  --selection grist-merchant --out "$GRIST_RELEASE"
~~~

GRIST_REPO is the original repository checkout, GRIST_COMMIT its exact selected revision, and GRIST_RELEASE a new private build destination. Preserve those values in the original build receipt. An interrupted build uses the same arguments with the builder's original --resume option. Do not change the source pin inside an existing build directory.

The complete builder writes the actual archive path and SHA256 into **release/distribution.json**. Read that receipt rather than guessing an archive name. Follow the full [workspace installation guide](WORKSPACE.md). The maintained runtime installer must use:

~~~text
--native --feature mcp --operator
~~~

Retain the original four native pins:

| Package | Exact selection |
| --- | --- |
| @x402/core | 2.28.0 |
| @x402/stellar | 2.28.0 |
| @x402/extensions | 2.28.0 |
| @stellar/stellar-sdk | 16.3.0 |

The original MCP feature supplies its declared compatible SDK and supporting dependencies. Use the same original runtime-install preparation, install, inspect and recovery. The packages belong in the installed source's common dependency ancestry; a separate sibling node_modules or NODE_PATH does not provide ESM resolution for all original engines.

For a new runtime:

~~~sh
node "$GRIST_DIST/runtime-install-cli.mjs" prepare \
  --dir "$GRIST_RUNTIME" --archive "$GRIST_ARCHIVE" --sha256 "$GRIST_ARCHIVE_SHA256" \
  --native --feature mcp --operator --pins "$GRIST_PINS"
node "$GRIST_DIST/runtime-install-cli.mjs" install --dir "$GRIST_RUNTIME"
node "$GRIST_DIST/runtime-install-cli.mjs" inspect --dir "$GRIST_RUNTIME" --load --source
~~~

GRIST_ARCHIVE and GRIST_ARCHIVE_SHA256 come from the actual PACKAGED receipt, and GRIST_PINS is a retained private JSON mapping of the four exact versions above. A prepared interrupted runtime uses **resume --dir SAME_RUNTIME**. Do not prepare a second runtime to evade its saved install state.

| Receiving field | Original installed value |
| --- | --- |
| sourceRoot | RUNTIME/package/source |
| sourceManifest.file | RUNTIME/package/manifest.json |
| sourceManifest.sha256 | SHA256 of all original manifest bytes |
| runtimeDirectory | The same RUNTIME |
| installed dispatcher | RUNTIME/package/source/stellar/scf-starforge-20261009/distribution/cli.mjs |

Before any source workspace opens, the receiver checks the complete manifest against every selected source file and the original READY runtime identity. It requires actual installed regular files, without symlinks into an older donor source closure. The four receiving modules, Grist source/model/MCP/Application providers, and original release/runtime modules must all be selected.

## Receive the real table declaration

The provider owner returns one **capture-backed source.json**, its exact SHA256, the referenced complete capture manifest and resources, and the capture SHA256. Preserve those original paths and bytes. A source using a live REST connection is rejected by receiving preparation; it cannot cause a hidden fresh extraction.

The existing public acquisition is **SCF-GRIST-PUBLIC-SOURCE-20261012-14F5**. Its official candidate is the Task Management document at public.getgrist.com, URL ID hik1whAV5snj. This identity describes the assigned acquisition; it is not a claim that a provider response or native result already exists. Use the actual returned canonical document/table identity and declaration, without inventing the table name or row count from the example page.

The source declaration binds the exact server, unversioned API, document ID or URL ID, native table, native membership filter, source order ending in id, field/type union and typed encodings. A Grist UI view is not used as a REST table selection. Referenced row IDs remain IDs; the product does not resolve names, join another table or fetch attachment bodies.

The receiver requires at least three actual rows so it can retain a first-page cursor and compare continuation across the two published editions. This minimum is a receiving mechanic, not a fixture count. A customer table with fewer rows is still a valid product source; it needs a deliberately selected receiving scenario that does not claim the same cursor comparison.

Each selected query must expose the native record identity through a public alias whose projection source is **$recordId**. Choose that alias as **orderColumn**. The receiver retains the complete observation and publishes the selected projected values twice, ascending and descending by that public alias. If the alias uses identity-text, that public ordering is string ordering, not a claim of native numeric row-ID ordering. Nulls are last in either direction, and the original retained ordinal breaks equal values.

**publicColumns** lists the exact reviewed aliases to publish. Omitted native columns remain in the private capture and source packet; they are absent from the public dataset. Every row in the retained API-visible, membership-filtered capture is emitted. This receiving entry adds no post-capture row filter.

## Prepare one immutable private input

Save the selection as an owned 0600 JSON file inside an existing owned 0700 directory. The following is a field template. Replace paths, hashes, query and alias names, reviewer, public asset/recipient and development origin with the actual chosen values. No private key belongs in this file.

~~~json
{
  "schema": "stellar-forge.grist-receiving-selection.v1",
  "operationId": "SCF-GRIST-PUBLIC-SOURCE-20261012-14F5",
  "sourceRoot": "/absolute/installed/runtime/package/source",
  "sourceManifest": {
    "file": "/absolute/installed/runtime/package/manifest.json",
    "sha256": "SHA256_OF_THE_COMPLETE_INSTALLED_MANIFEST"
  },
  "runtimeDirectory": "/absolute/installed/runtime",
  "outputDirectory": "/absolute/private/grist-receiving",
  "inputFile": "/absolute/private/grist-receiving-input.json",
  "python": "/absolute/existing/python3",
  "browser": {
    "module": "/absolute/existing/playwright-core/index.mjs",
    "executable": "/absolute/existing/chromium"
  },
  "reviewer": "Actual operator",
  "merchant": {
    "origin": "https://YOUR_REVIEWED_DEVELOPMENT_ORIGIN",
    "path": "/dataset",
    "payment": {
      "scheme": "exact",
      "network": "stellar:testnet",
      "asset": "ACTUAL_REVIEWED_PUBLIC_TESTNET_ASSET",
      "payTo": "ACTUAL_REVIEWED_PUBLIC_TESTNET_RECIPIENT",
      "amount": "1000",
      "maxTimeoutSeconds": 300
    },
    "nextAmount": "2000"
  },
  "sources": [
    {
      "id": "table",
      "sourceFile": "/absolute/original/grist/source.json",
      "sourceSha256": "ACTUAL_ORIGINAL_DECLARATION_SHA256",
      "captureSha256": "ACTUAL_ORIGINAL_CAPTURE_SHA256",
      "query": "actual_query",
      "publicColumns": ["actual_record_id_alias", "actual_selected_public_alias"],
      "orderColumn": "actual_record_id_alias"
    }
  ],
  "sourceRefs": {
    "selectedCommit": "ACTUAL_COMPLETE_REVIEWED_SOURCE_COMMIT",
    "providerOperation": "SCF-GRIST-PUBLIC-SOURCE-20261012-14F5"
  }
}
~~~

The original source hash and capture hash may be omitted during preparation only when the operator is intentionally selecting the exact current original files. If supplied, both must match. The prepared input always records both exact hashes and the row count derived from the fully validated original capture. A claimed expectedRows does not replace reading its records.

The merchant recipient and asset are **public development terms**. This receiving entry does not require a testnet secret, funding call, native signer or facilitator settlement. The seller binds its existing local loopback service to the supplied reviewed resource metadata. Choose distinct positive amount and nextAmount values for the two original release terms. The program checks actual 402 responses; it does not send a purchase.

Prepare through the selected dispatcher:

~~~sh
node "$GRIST_RUNTIME/package/source/stellar/scf-starforge-20261009/distribution/cli.mjs" \
  grist-receive --prepare /absolute/private/grist-receiving-selection.json
~~~

The equivalent direct entry is:

~~~sh
node "$GRIST_RUNTIME/package/source/stellar/scf-starforge-20261009/sf30-seller-sdk/grist/receiving.mjs" \
  --prepare /absolute/private/grist-receiving-selection.json
~~~

Preparation validates the complete installed source/runtime, original source/capture hashes, all eight resources, exact document-state/repeat-read evidence, the selected aliases and public row identity. It writes the exact private receiving input. It makes no provider request and does not open an authoring, publisher or seller store. Repeating preparation reuses only the identical saved input.

The host requires Node 24 or later on POSIX, Python standard-library fcntl and tarfile, system tar/gzip, and the existing compatible Playwright/Chromium pair. Use the actual executable paths belonging to this original host operation. Preserve the existing full resource admission and persistent retention requirements. An invocation-private output path requires the host's maintained same-lifetime checkpoint or complete transfer before that lifetime ends. This entry does not create a host, queue, allocator or background worker.

## Execute or continue the same receiving

~~~sh
node "$GRIST_RUNTIME/package/source/stellar/scf-starforge-20261009/distribution/cli.mjs" \
  grist-receive --input /absolute/private/grist-receiving-input.json
~~~

The top entry creates or reopens one private output directory, takes a permanent **operation.lock** through POSIX flock and retains the complete input/source basis before dispatch. It never unlinks the lock inode. The wrapper and each direct native child share that descriptor, so an independently surviving original child excludes a second receiving writer.

Three child stages run sequentially: **core**, **applications** and **mcp**. Each input is written before its original command starts. The core and MCP stages use the original source, publisher, seller and application store locks. MCP passes the same receiving descriptor to its owned original MCP process. The original engines retain their own lifecycle authority.

A recorded existing seller or application process is not seized by matching its listener. Its native ownership, current generation, instance and retained receipt determine the original recovery path. The receiving program closes HTTP/MCP admission, waits for original pending work and children, and releases the source workspace only after its owner drains.

Native request UUIDs, source version numbers, integer publisher plan IDs, UUID plan folders, candidate/review identities, dataset snapshots, release generations/digests, seller instances and file offsets remain authoritative. Storage-folder UUIDs never substitute for native plan IDs.

When a child completes and closes, the outer entry records its exact result identity. Reopening the same input verifies and retains completed stages. Applications is not rerun after the later MCP stage intentionally adds a new reviewed source edition. A failure before a stage result is acknowledged reopens that same stage and its original request journal.

## One source owner across browser and MCP

The installed **grist-workspaces** provider registers the source-owned tools. The generic MerchantPublishers service does not acquire a Grist factory or a second source store in this change.

The receiver opens the declared original workspace through **merchant_grist_open**, then starts its original publisher using **merchant_grist_publisher_open** with the exact selected source version and retained request UUID. **merchant_grist_publisher_*** operations borrow that same publisher and scheduler. The adapter returns the original result within its source-owned envelope. Status retains the original native runs/history; review and recover return their original run objects.

Direct **openGristPublisher** calls occur only after the authoring owner has closed. They reuse the exact publisher directory already created by that workspace. No second publisher database or schedule is introduced.

The browser source review retains the actual preview/version requests before dispatch. The following MCP source review preserves all captured native fields and encodings, saves its own explicitly reviewed edition and verifies the prior publications remain unchanged.

For private packets, the receiver retains the first chunk, whole-file identity and offset, closes the actual original MCP process, then resumes the same version/hash from a new process. A new process may allocate a new read ID. The final whole bytes must match and pass the original Grist packet validator; a prefix alone is never a complete packet.

MCP merchant staging uses the same source-owned deployment methods and original SF82 console. Its commands bind the actual console ID, generation, digest and owned seller instance. An uncertain command is reconciled through the original request/state before a later reviewed action.

## Two named tables on one host

The product can manage two independent table declarations from one customer document. Use a separate original authoring workspace, publisher/dataset output and MCP alias or named Application for each table. Each retains its own capture, explicit field mapping, review, versions and SF82 release history.

If both tables map to the same approved public schema, the mapping must be explicit for each native field/type union. No automatic join, reference resolution or cross-table atomicity is implied. Multiple observations can be retained as editions, but two concurrently usable merchant outputs need two original output bindings.

This complete receiving input deliberately covers **one** table. A second named output can be received sequentially on the same installed host under its own immutable output/input binding and a distinct table-specific receiving identity linked to the same customer work. Do not reuse the first table's receiving identity with changed source hashes or overwrite its closed output. No second provider job or payment follows from selecting the second already captured declaration.

## Recovery and interrupted delivery

| Observed state | Supported continuation |
| --- | --- |
| Prepared input exists, receiving has not dispatched | Use the same --input; preparation and its source/capture choice remain unchanged. |
| operation.lock is held | Keep the original owner. Do not unlink the lock or switch output directories to bypass it. |
| Child ended without a complete result | Read its retained log and original source/publisher/release request, then continue the same input. |
| Publisher or SF82 command is uncertain | Reconcile its saved original receipt and observed state before another reviewed command. |
| Browser version/publish/client or Application Start response was lost | Read/replay the retained original request UUID as appropriate; no new UUID merely because the reply was lost. |
| Applications stopped an incomplete owned launch during cleanup | Keep its run and terminal identity. Only after the exact old run is positively stopped may the original reviewed workflow create a following deliberate launch UUID. |
| Core or Applications is complete | Verify the saved result and preserve that native stage. |
| MCP packet or staging download stopped | Keep its durable prefix/hash/offset and continue the same original version or package. |
| Native stages passed but whole archive failed | Keep result.json and archive-plan.json; resume verifies completed stages and finishes the archive. |
| Archive exists but delivery.json is absent | Verify every complete archive member against the frozen inventory, then retain the delivery receipt. |
| Input, original capture or selected source changed | Preserve the old operation and review a new explicit selection. Never rewrite old hashes or native IDs to manufacture continuity. |

The source publisher performs the same original request recovery as normal operation. The receiving journal does not replace it. No recovery path silently recaptures Grist records, signs a purchase, clears a partial native store or creates an empty replacement database.

## Complete result and private custody

A successful native workflow writes **output/result.json**. Complete delivery also requires **output/delivery.json** with state **COMPLETE**, binding the result, full archive and frozen inventory.

The whole private archive is **Grist_Complete_Receiving.tar.gz**. It includes closed source captures and immutable editions, original publisher plans/runs/reviews and both dataset snapshots, SF82 releases and customer exports, Applications state, MCP requests and downloaded private packets, screenshots, logs and the receiving inputs. The operation lock and archive itself are excluded.

The archive plan records every regular member's exact bytes and SHA256. The archive is read back member by member before publication. Links, missing files, unexpected members and changed identities are refused. A completed archive with a lost response can be reopened without re-running the native workflow.

Native stores can retain original absolute paths in metadata. Reopen through the maintained original packet, source, publisher and workspace recovery APIs, or restore at the original declared location when the store requires it. Do not rewrite those paths, UUIDs or SQLite contents to fabricate a portable store.

**Merchant staging is private.** The five-file Grist/SF82 package includes the real dataset binding and original absolute merchant path. The full private archive retains it as operator material. It is not a public portable source export.

**Customer files use the original exporter.** The customer-facing projection is received into **core/received-client**. The exporter supplies five payloads plus its manifest. The receiver verifies those complete file identities, a byte-range download, the whole archive and a request built by the actual generated client module. Omitted raw fields and private host paths do not become public because the operator archive contains them.

Return the actual installed source commit and manifest, result.json, delivery.json, complete source/capture identities, both publication snapshots, source versions, Application identities/terminal state and verified private archive through the existing assigned operation's receiving channel. Report HTTP 402/configuration and zero payments accurately. Source review, prepared input and archive construction are distinct from actual native completion.

## Source lineage and execution status

The complete receiving continuation composes the maintained SeaTable programs published in standalone PR134 at **7199d25a** and their original NocoDB lineage. The original donor and its existing provider/paid operation remain unchanged. Grist-specific changes bind one original unversioned typed-table capture, verify its eight-resource document-state/repeat-read contract, derive the actual row count, use original typed projection values and route all publisher work through the source-owned Grist adapter.

The original publisher, SF82, generated client, runtime workspace, Applications and MCP engines are reused. Receiving journals record progress around those engines. MIT notices remain intact.

This guide documents complete implemented source. Actual provider acquisition, selected installation and browser/native receiving remain pending until the original operation returns their real receipts. No payment is claimed by this challenge-only continuation.
