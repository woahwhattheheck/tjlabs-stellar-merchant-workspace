# Complete SeaTable receiving on the original provider operation

This entry takes two real, already retained SeaTable observations through the complete installed merchant workflow. It opens the original authoring and publication engines, preserves their source and native identities, receives the actual generated customer files, and finishes with a verified private archive of the whole operation.

The installed command is **seatable-receive**. Source entry: **seatable/receiving.mjs**. It is included by the existing **seatable-authoring** contribution in the original **seatable-merchant** selection.

## What the operation does

| Stage | Original product used | Retained outcome |
| --- | --- | --- |
| Input preparation | SeaTable declaration and complete capture reader | Exact declaration/capture hashes, actual SQL and view row counts, explicit public aliases and native identity order |
| Browser source review | SeaTable authoring model/server/UI | Each original capture imported, all rows previewed, actual reviewer/version request retained, immutable source version reopened |
| Native-view publication | Original source dataset publisher | One reviewed public edition containing every selected native-view row and only the chosen public columns |
| SQL publication | The same original publisher and typed source | Two complete editions of the same observation, with explicit ascending and descending native record identity order |
| Seller and customer | Original SF82 console, dataset versions, SF88 configuration and client exporter | Real development HTTP 402 terms, retained earlier cursor, changed terms/restart/rollback, pinned configuration, all six generated customer files and an offline generated request |
| Installed Applications | Original runtime workspace and SeaTable application provider | Review/save/start/Open/Stop, lost Start reply recovery, console reopen and a second managed lifetime over the same authoring directory |
| Agent authoring | Source-owned SeaTable MCP adapter | A new explicitly reviewed source version over the same capture, exact receipt replay, borrowed publisher, private packet download across process restart |
| Merchant staging | Original SeaTable deployment and SF82 lifecycle | Both original publication packages, complete five-file reads, compare/activate/Run/Stop/rollback under exact console/generation/instance guards |
| Private delivery | Native directories after owners close | Every regular file in the closed receiving tree, a frozen archive inventory, a complete verified tar.gz and delivery receipt |

This is a development source and merchant receiving operation. HTTP 402, a snapshot-pinned buyer configuration, and an offline generated request do not establish a payment. This entry has no signer or settlement action and records zero additional payments. It also makes no provider extraction. Its source inputs must already use the original capture connection.

The SQL and native-view observations retain different provider completeness evidence. The SQL capture has actual native opening/closing counts. A native-view capture has complete original terminal-page enumeration and does not invent a matching native count endpoint. Both retain the provider's explicit non-atomic snapshot qualification. The receiver compares every projected value in every emitted row; it does not convert either observation into an atomic snapshot claim.

## Use one installed selection

Build the final reviewed source revision using the maintained distribution builder:

~~~sh
SEATABLE_DIST="$SEATABLE_REPO/stellar/scf-starforge-20261009/distribution"
node "$SEATABLE_DIST/build.mjs" \
  --repo "$SEATABLE_REPO" --ref "$SEATABLE_COMMIT" \
  --selection seatable-merchant --out "$SEATABLE_RELEASE"
~~~

All four variables are explicit operator paths or the exact selected Git commit. The commit must include this complete receiving entry, the authoring contribution, and the original provider. Preserve that choice in the original build receipt. An interrupted build uses the same arguments and its original --resume option.

The build writes the actual archive identity into release/distribution.json. Follow the complete [workspace installation guide](WORKSPACE.md) using that receipt's archive path and SHA256. The original runtime installer must select:

~~~text
--native --feature mcp --operator
~~~

The original four native pins are @x402/core 2.28.0, @x402/stellar 2.28.0, @x402/extensions 2.28.0, and @stellar/stellar-sdk 16.3.0. The selected original MCP feature supplies its own declared compatible SDK and supporting packages. Use the original installer, its saved pins and installation recovery; do not construct another dependency tree or rely on NODE_PATH to resolve sibling ESM modules.

For a newly prepared runtime, use prepare, install, and inspect --load --source. A prepared interrupted installation uses the original resume --dir SAME_RUNTIME. The receiver requires the actual READY source root and manifest returned by that installation:

| Input | Actual installed location |
| --- | --- |
| sourceRoot | RUNTIME/package/source |
| sourceManifest.file | RUNTIME/package/manifest.json |
| sourceManifest.sha256 | SHA256 of the complete original manifest bytes |
| runtimeDirectory | The same RUNTIME |
| installed dispatcher | RUNTIME/package/source/stellar/scf-starforge-20261009/distribution/cli.mjs |

The manifest is checked against every selected source file before the receiving engines open. The current original source must contain the SeaTable model, capture reader, publisher, MCP and Applications providers, all four receiving modules, and the original shared runtime/release modules. Source paths must be actual installed files, not symlinks into an older donor closure.

## Obtain the original capture-backed sources

The provider owner supplies two exact source declarations from the existing SeaTable operation:

- **sql**: a complete constructed SQL observation, including original metadata, row identity, count/version observations, pages and terminal evidence.
- **view**: a complete native selected-view observation, with the provider's real view ID, inherited view filter/order and complete terminal-page evidence.

Use the provider's [input and acquisition guide](PROVIDER_INPUT.md) for those original paths and source identities. Preserve its old observations and actual source history. This receiver does not start a replacement provider operation or turn a partial page bundle into a complete capture.

The full reader validates the original capture manifest, selection, resources and field/type union. SQL requires at least three actual rows for the retained cursor comparison. The native view requires at least one actual row. These are receiving mechanics, not invented fixture or customer counts. The actual counts are read from the returned capture and checked against all actual records.

Each selected query must already expose the reviewed native row identity as a public alias whose original source is $recordId. Use that alias as orderColumn. The receiver publishes the SQL records in both ascending and descending order of that alias. It publishes the selected view records in an explicitly reviewed ascending order. Native-view selection and source observation remain unchanged.

The query and publicColumns values are actual aliases from the provider's capture-backed declaration. Choose the customer projection deliberately. Omitted source columns remain in the private capture and private source packet; they are absent from the published dataset. All captured rows of the chosen query are emitted. This operation adds no new post-capture row filter.

## Prepare the exact private operation input

Save an owned 0600 JSON selection in an existing owned 0700 directory. The following is a field template, not a fabricated service or data source. Replace paths, hashes, query/alias names, recipient, asset, origin and reviewer with the actual original values. The operating identity shown is the existing SeaTable provider operation; keep that original assigned identity unchanged.

~~~json
{
  "schema": "stellar-forge.seatable-receiving-selection.v1",
  "operationId": "SEATABLE-PROVIDER-OPERATOR-20261012-14F5",
  "sourceRoot": "/absolute/installed/runtime/package/source",
  "sourceManifest": {
    "file": "/absolute/installed/runtime/package/manifest.json",
    "sha256": "SHA256_OF_THE_COMPLETE_INSTALLED_MANIFEST"
  },
  "runtimeDirectory": "/absolute/installed/runtime",
  "outputDirectory": "/absolute/private/sea-table-receiving",
  "inputFile": "/absolute/private/sea-table-receiving-input.json",
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
      "asset": "ACTUAL_REVIEWED_TESTNET_ASSET",
      "payTo": "ACTUAL_REVIEWED_PUBLIC_TESTNET_RECIPIENT",
      "amount": "1000"
    },
    "nextAmount": "2000"
  },
  "sources": [
    {
      "id": "sql",
      "sourceFile": "/absolute/original/sql-source.json",
      "sourceSha256": "ACTUAL_ORIGINAL_SQL_DECLARATION_SHA256",
      "captureSha256": "ACTUAL_ORIGINAL_SQL_CAPTURE_SHA256",
      "query": "actual_query",
      "publicColumns": ["actual_record_id_alias", "actual_selected_public_alias"],
      "orderColumn": "actual_record_id_alias"
    },
    {
      "id": "view",
      "sourceFile": "/absolute/original/view-source.json",
      "sourceSha256": "ACTUAL_ORIGINAL_VIEW_DECLARATION_SHA256",
      "captureSha256": "ACTUAL_ORIGINAL_VIEW_CAPTURE_SHA256",
      "query": "actual_query",
      "publicColumns": ["actual_record_id_alias", "actual_selected_public_alias"],
      "orderColumn": "actual_record_id_alias"
    }
  ],
  "sourceRefs": {
    "selectedCommit": "ACTUAL_COMPLETE_REVIEWED_SOURCE_COMMIT",
    "providerOperation": "ORIGINAL_PROVIDER_OPERATION_REFERENCE"
  }
}
~~~

sourceSha256 and captureSha256 can be omitted during preparation only when the owner is intentionally selecting the exact current file at the supplied original path. When supplied, both are checked. The final receiving input always contains both exact hashes and the actual expectedRows derived by the original reader. It never accepts a claimed row count in place of reading the complete retained capture.

The public development recipient and asset are terms only. No private key belongs in this selection. The source reader needs no live provider credential because both inputs are capture-backed. The program does not place credentials into the generated customer files.

Run preparation through the installed dispatcher:

~~~sh
node "$SEATABLE_RUNTIME/package/source/stellar/scf-starforge-20261009/distribution/cli.mjs" \
  seatable-receive --prepare /absolute/private/sea-table-receiving-selection.json
~~~

Or invoke the same selected source entry directly:

~~~sh
node "$SEATABLE_RUNTIME/package/source/stellar/scf-starforge-20261009/sf30-seller-sdk/seatable/receiving.mjs" \
  --prepare /absolute/private/sea-table-receiving-selection.json
~~~

Preparation verifies the installed source/runtime, original source declarations and complete captures, the public query aliases, actual row identity and SQL/view semantics. It writes a complete private input with exact consumer/source/capture identities. A retry reopens the same exact input bytes. It does not overwrite a changed selection or open a native authoring/publisher workspace.

Use the actual Python and browser executables already assigned to the provider operation. The runtime requires Node 24 or later on POSIX, Python standard-library fcntl/tarfile, system tar/gzip and an existing compatible Playwright/Chromium pair. Preserve the one host's declared whole-operation resource allocation and any required persistent artifact retention. /dev or another invocation-private output path requires the host's existing same-lifetime checkpoint/transfer procedure before the invocation ends; this source does not create another worker or allocator.

## Run or continue the same operation

~~~sh
node "$SEATABLE_RUNTIME/package/source/stellar/scf-starforge-20261009/distribution/cli.mjs" \
  seatable-receive --input /absolute/private/sea-table-receiving-input.json
~~~

The entry creates or reopens one private output directory, acquires its permanent operation.lock through the original POSIX file-lock mechanism, and retains the exact input/source basis before native dispatch. A live original wrapper or direct receiving child retains that descriptor. Another invocation cannot replace the lock inode or enter the same receiving operation concurrently.

The top entry runs three sequential child stages: core, Applications and MCP. It passes the same operation descriptor to each direct native child. MCP also passes it to its owned original MCP process. The original seller, publisher and managed worker engines retain their own native lifecycle and store locks. A detected existing unowned listener or unresolved original native process requires its supported original recovery; this receiver does not seize that process by matching its port.

Each stage persists its native input before dispatch. The original model/HTTP/MCP UUIDs, numeric native plan IDs, UUID plan directories, selected source versions, candidate/review identities, target generations, release digests, seller instance IDs and file checkpoints remain authoritative. Numeric plan IDs are never replaced by their storage-folder UUIDs.

After a successful child closes, its exact result is saved as the completed stage identity. A later entry invocation verifies and keeps that stage. It does not rerun Applications after the following MCP leg creates a later reviewed source version. A caller failure before a stage result is acknowledged re-enters that same original stage and reconciles its saved native requests and state.

## Original authority during MCP receiving

The generic MerchantPublishers factory does not claim a SeaTable kind slot. The selected recipe includes the original generic publisher/tool services because the SeaTable adapter borrows those services.

The receiver opens the host-declared SeaTable authoring workspace through merchant_seatable_open. It uses merchant_seatable_publisher_open with the actual selected source version and a retained UUID, then invokes merchant_seatable_publisher_* on that same publisher/scheduler. The adapter returns the original native result inside its source-owned envelope. Closing the authoring host drains borrowed publisher work, retained packet reads, original deployment ownership and the original model lease.

Direct openSeaTablePublisher calls occur only while the authoring owner is closed. They use the exact publisher directory already created by that source workspace. There is no second publisher database, shadow schedule, additional source family factory or substitute payment engine.

The MCP leg retains a private packet download after its first chunk, closes the actual original MCP process, and resumes the remaining bytes from the same version/hash/offset on the new host. It verifies the original packet through the provider-owned async validator. A new process may allocate a new read ID while keeping the exact file and manifest hash; it never assumes the old read ID is portable.

## Recovery behavior

| Observed state | Continuation |
| --- | --- |
| Prepared input exists, no receiving intent | Use the same --input. Preparation and the receiving input remain unchanged. |
| The operation lock is held | Keep the original owner. Do not unlink the lock or start another output directory to bypass it. |
| A native child returned no complete result | Inspect its retained log and current original source/publisher/release request, then continue the same input. |
| An original publisher or SF82 command is uncertain | Use its saved original receipt/state and supported recovery before another reviewed command. |
| Browser Start/version/publish/client response was lost | The original request UUID/receipt resolves it. The controlled receiving scenarios each retain the actual response/state before testing reopen. |
| Applications stopped a failed owned launch during cleanup | The original run/terminal identity is retained. A following deliberate original review/UUID is used only after that exact old run is stopped. |
| Core or Applications is complete | The outer entry verifies the saved stage result and skips that native stage. |
| MCP file download stopped | Keep the durable file prefix/hash/offset and resume its same original version or package. |
| All native stages passed but archive creation failed | Keep result.json and archive-plan.json. The next invocation verifies the completed stages and finishes the archive only. |
| Final archive exists but delivery.json was not retained | Reopen the existing archive, verify every saved member against the original frozen inventory, then retain the delivery receipt. |
| Selected input, source manifest or original capture changed | Preserve the prior operation. Review a deliberate new selection; never rewrite the old capture or input hashes in place. |

The receiving source does not silently recapture provider data, repay a buyer, create a replacement runtime or normalize a damaged partial store into an empty one.

## Returned files and custody

A successful native result is output/result.json. A finished full delivery also requires output/delivery.json with state COMPLETE and the exact result/archive/inventory identities.

The private archive is **SeaTable_Complete_Receiving.tar.gz**. It contains the closed authoring captures and source versions, original publisher plans/runs/reviews/dataset editions, original SF82/customer exports, Applications state, MCP request/download history, screenshots, logs and receiving inputs. The operation lock and the archive itself are excluded. A frozen archive-plan.json inventories every included regular file. The archive is read back member by member, checking complete SHA256/byte identities and refusing links, unexpected entries or missing members.

The archive preserves original paths inside native metadata. Reopen it through the maintained original source/publisher/packet and workspace recovery APIs, or at the original declared location when the native store requires that location. Do not rewrite absolute private bindings or UUIDs inside SQLite or manifests to fabricate a move.

**Merchant staging is private.** The original five-file SF82 package includes the real dataset binding and its native absolute path. It is retained inside the private operator archive. It is not relabeled as a public portable customer source.

**Customer files are separate.** The original exporter produces five payloads plus manifest. Their received directory is core/received-client and their original complete customer archive is retained beside it. The receiver verifies each file, a byte-range download, the full archive and an offline request built by the actual generated module. This is the customer-facing source projection; the whole private capture archive requires separate authorized custody.

Return the actual installed source commit/manifest identity, complete result.json, delivery.json, original capture/source hashes, native source versions, publication snapshots, Applications IDs/terminal state and the private archive through the existing provider operation's approved receiving path. Report HTTP 402/configuration and zero payments accurately. Do not replace these observed outputs with source-review or packaging-only claims.

## Source lineage and current execution status

The complete browser/publisher/customer, Applications and MCP receiving flows are composed from the maintained NocoDB receiving programs at standalone cc0f9a8b860005b4cb8767974fee231c5151b835. Those donor programs and their original paid/provider operation remain unchanged. SeaTable-specific changes bind actual v2 SQL/native-view captures, derive their counts, use the source-owned borrowed adapter, await the original SeaTable packet validator and retain the single source operation without a payment leg.

The outer preparation/lease/stage/archive entry composes those original engines. Its operation journals describe receiving progress; they do not replace a publisher, seller, application or source database. MIT source notices are preserved.

Source publication is not an execution receipt. Until the existing provider operation returns actual input and native results, installed/browser receiving remains pending.

## Continue through the maintained whole-workspace controls

The original native receiving programme can now exercise the in-product complete editable handover described in [HANDOVER.md](HANDOVER.md) and the [SeaTable commissioning course](../../../../products/seatable/COMMISSIONING.md). After the original live SQL/native-view capture and authoring/publisher/deployment course, prepare a full `.stwh` archive, download its exact bytes, receive a named independent workspace, operate that project, and reopen its complete later handover. Preserve the existing source acquisition, selected release and original operation.

The private external receiving archive produced by this programme remains its full run material. The new in-product archive additionally provides supported relocation, original request/version history and independent project receiving through the maintained browser, CLI and customer-agent tools.

## Original customer review continuation

Continue the same `SEATABLE-PROVIDER-OPERATOR-20261012-14F5` source and receiving operation after whole-workspace handover. Use an actual original SQL or native-view draft: keep its frozen source unchanged, make a useful independent customer alias/type/null/order decision, and retain a concurrent author edit. Export and receive that progressed child through the supported `.stwh` controls. In the original author, capture the named returned draft, inspect the exact common record and every comparison page, save explicit decisions, and apply to the draft. Reconcile the same original request after an uncertain reply; do not replace it with a new UUID.

Then run the ordinary complete-row preview, save the reviewed version, produce the original customer output, export the complete return revision and whole editable workspace, and reopen them independently. A second return must retain the first incoming ancestry while comparing the author's later work. Follow [HANDOVER.md](HANDOVER.md) and the complete [commissioning course](../../../../products/seatable/COMMISSIONING.md), including the producing-owner rendered inspection instruction already carried there. Operate and LOOK at the exact desktop and narrow UI, conflict/deletion/order controls, saved and stale choices, error/recovery states and reopened downloads. Return the actual source/native result and viewed output in this original case. This source continuation is not an observed native or rendered outcome.
