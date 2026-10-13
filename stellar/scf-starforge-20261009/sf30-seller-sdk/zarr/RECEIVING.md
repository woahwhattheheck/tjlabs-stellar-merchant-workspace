# Complete Zarr receiving and handover

This entry completes the retained Zarr source workspace, original dataset publisher, SF82 merchant and customer lifecycle, source-owned Merchant MCP tools, installed Applications, and independent receiving. It continues one selected operation. The original source stage and every later publisher request keep their saved identities.

The full source stage uses the original Zarr v3 and v2 interoperability archives from zarr-developers/pizzarr. The original generators, exact archive hashes, source path mapping and MIT notices are included. The native application uses zarr-python 3.4.1 and the exact component requirements. The complete comparison covers 40 arrays and 338 cells, plus a four-cell strided temperature selection. These are upstream interoperability examples, not a new environmental measurement or a customer dataset.

The merchant continuation keeps those accepted results. It publishes the 35 original ragged-array cells in ascending and descending ordinal order, and the four temperature cells with their source coordinates. The first publication uses the real browser controls; the second uses the same publisher through MCP. SF82 preserves an old snapshot cursor across publication and exports the six original customer files. Applications starts, opens, stops and reopens the same native workspace. The final receiver opens the copied workspace and all three publications.

## Source responsibilities

| File | Responsibility |
| --- | --- |
| receiving.mjs | Exact selection, original permanent operation lease and serial full workflow. |
| receiving/source-stage.py | Original imports, all-array comparisons, review/freeze, packet and independent source receiving. |
| receiving/original-expectations.json | Complete original generator-derived populations and example path mapping. |
| receiving/common.mjs | File identities, native calls, exact pagination and retained captures. |
| receiving/merchant.mjs | Browser, publisher, SF82 and borrowed MCP continuation. |
| receiving/customer.mjs | Original six-file export, lost reply recovery, range read and offline request. |
| receiving/applications.mjs | Installed Applications review/start/Open/Stop/reopen sequence. |
| receiving/package.py | Complete closed archive, immutable member plan and completed-partial recovery. |
| receiving/START.py | Whole ZIP verification and original native packet adoption. |
| receiving/reopen.mjs | Actual received app, publisher and browser reopening. |

The deployment.mjs module prepares the original five-file SF82 package from a reviewed, published native candidate. Original SF82 schema, target store, release and runtime behavior remain authoritative. It does not decode arrays or create a replacement dataset engine.

The zarr-merchant selection includes the complete component and its original publisher, dataset-refresh, buyer, SF82, MCP, Applications and installer dependencies. Both original binary example ZIPs are explicit support entries. The maintained builder keeps its normal source filters and size limits.

## Existing environment and exact source installation

Use an existing Linux/POSIX host with Node 24 or later, Python 3.12 or later, flock, and actual Chromium/Playwright. No paid host or remote database is required for these retained sources.

Install requirements-native.txt in the selected Python environment, or a private dependency directory selected through pythonPaths. Its exact versions are zarr 3.4.1, numpy 2.5.4, numcodecs 0.17.0, donfig 0.8.1.post1, google-crc32c 1.9.0, msgspec 0.22.0, packaging 26.3, typing_extensions 4.16.0 and PyYAML 6.0.3. The whole operation inherits that selected PYTHONPATH.

Build the committed whole selection with the original builder:

~~~sh
node "$ZARR_REPO/stellar/scf-starforge-20261009/distribution/build.mjs" \
  --repo "$ZARR_REPO" --ref "$ZARR_SOURCE_COMMIT" \
  --selection zarr-merchant --out "$ZARR_RELEASE"
~~~

For an interrupted build, add the original --resume only with the same commit, selection and output. Read the actual distribution.json receipt. Use its archive and sha256 fields, not a guessed filename or a source hash.

~~~sh
node "$ZARR_REPO/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" prepare \
  --dir "$ZARR_RUNTIME" --archive "$ZARR_ARCHIVE" --sha256 "$ZARR_ARCHIVE_SHA256" \
  --native --feature mcp --operator --pins "$ZARR_NATIVE_PINS"

node "$ZARR_REPO/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" install \
  --dir "$ZARR_RUNTIME"

node "$ZARR_REPO/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" inspect \
  --dir "$ZARR_RUNTIME" --load --source
~~~

Use resume for the same prepared runtime. An existing complete dependency tree can be adopted only through the installer's own --adopt-existing contract. The original profile selects exact native dependencies and locks; a packet does not itself install those peers. The Stellar peers used by this source are @x402/core, @x402/stellar and @x402/extensions 2.28.0 and @stellar/stellar-sdk 16.3.0.

The READY sourceRoot is ZARR_RUNTIME/package/source. Its exact manifest is ZARR_RUNTIME/package/manifest.json. The receiving entry checks the actual state, sourceRoot and sourceManifestSha256 returned by the original inspectMerchantRuntime API. Applications independently checks that same installation before a managed start.

## Preserve the original source operation

For an already completed source stage, keep its exact native-source-selection.json, source-stage/result.json, workspace, packet and operation ID. The source stage adopts its completed result and verifies the packet; it does not repeat the arrays.

For a fresh receiving host, use the complete sources and cuts from receiving/original-expectations.json. Resolve each source file against the installed Zarr component, retaining the archive SHA, store root, full expected populations and provenance. Choose one private outputRoot and workspace. Save the declaration before execution with schema stellar-forge.zarr-native-source-selection.v1 and the selected operationId. The source-stage result path is always outputRoot/source-stage/result.json.

The exact original expectations are a complete input artifact. Do not substitute one example row, a shortened array list, regenerated ZIPs, or a fabricated provider response. Every source-stage mutation delegates to the original application and stores its request before dispatch.

## Whole receiving selection

Create one private selection outside the source and receiving output directories. All paths are canonical absolute paths. The native source workspace and the receiving output are separate roots.

The following JSON shows the complete structure. Replace host paths and reviewed merchant terms with actual values; placeholder strings are not runnable credentials or verified terms.

~~~json
{
  "schema": "stellar-forge.zarr-receiving-selection.v1",
  "operationId": "YOUR_ORIGINAL_ZARR_OPERATION",
  "sourceRoot": "/private/zarr-runtime/package/source",
  "sourceManifest": {
    "file": "/private/zarr-runtime/package/manifest.json",
    "sha256": "ACTUAL_READY_SOURCE_MANIFEST_SHA256"
  },
  "runtimeDirectory": "/private/zarr-runtime",
  "engineArchive": {
    "file": "/private/zarr-release/ACTUAL_ORIGINAL_ARCHIVE.tar.gz",
    "sha256": "ACTUAL_ORIGINAL_BUILD_ARCHIVE_SHA256"
  },
  "operationDirectory": "/private/zarr/whole-receiving",
  "workspaceDirectory": "/private/zarr/source-workspace",
  "python": "/absolute/original/python3",
  "pythonPaths": ["/private/zarr-python-dependencies"],
  "browser": {
    "module": "/absolute/installed/playwright/index.mjs",
    "executable": "/absolute/existing/chromium"
  },
  "sourceStage": {
    "inputFile": "/private/zarr/native-source-selection.json",
    "resultFile": "/private/zarr/source-stage-output/source-stage/result.json"
  },
  "frozenSelection": {
    "primary": {"source": "v3", "array": "ragged_2d"},
    "secondary": {"source": "v3", "array": "var_group/temperature", "cut": "temperature-strided"}
  },
  "merchant": {
    "origin": "https://YOUR_REVIEWED_DEVELOPMENT_ORIGIN",
    "path": "/YOUR_REVIEWED_ZARR_RESOURCE",
    "payment": {
      "scheme": "exact",
      "network": "stellar:testnet",
      "asset": "EXISTING_REVIEWED_TESTNET_ASSET",
      "payTo": "EXISTING_REVIEWED_TESTNET_RECIPIENT",
      "amount": "10000",
      "maxTimeoutSeconds": 60
    },
    "nextAmount": "20000"
  },
  "inputFile": "/private/zarr/whole-receiving-input.json"
}
~~~

The receiving scope is local development challenges and offline buyer/client configuration. It does not create, fund, sign with, or settle through an account. Select development terms from the existing authorized configuration. A placeholder asset or recipient is not evidence of a funded account or a usable production service.

Preparation pins the actual source manifest, original engine archive, full entry source, original source declaration, and any already completed source-stage result. It makes no import, array extraction, publisher or payment call.

~~~sh
node "$ZARR_RUNTIME/package/source/stellar/scf-starforge-20261009/distribution/cli.mjs" \
  zarr-receive --prepare "/private/zarr/whole-receiving-selection.json"

node "$ZARR_RUNTIME/package/source/stellar/scf-starforge-20261009/distribution/cli.mjs" \
  zarr-receive --input "/private/zarr/whole-receiving-input.json"
~~~

The entry acquires the permanent operation lock and runs the stages serially. Progress is emitted as JSON lines. A result.json with state NATIVE_COMPLETE means the source, merchant and Applications legs finished. A delivery.json with state COMPLETE additionally requires the whole archive, independent native receiving, and actual received app/publisher/browser reopening.

## Native sequence

1. The original source stage retains complete raw stores, metadata, scalar classes, coordinates, revisions, reviews and frozen bytes. Its independent receiver keeps the same UUID and history.
2. The browser displays the original hierarchy and four-cell temperature result. Preparing/applying the completed native selection UUID twice returns its original result, without another array result.
3. The completed original packet is opened after the packet source update. Its export ID, manifest and bytes remain unchanged.
4. The browser saves the primary plan, extracts and inspects all 35 cells, reviews the exact candidate and publishes it. A separate native publication retains the four-cell temperature projection.
5. MCP borrows the same publisher from the existing server. It reads the same frozen/result identities, adopts the original request, prepares a pinned buyer configuration and publishes the explicit descending ordering.
6. SF82 stages the two reviewed packages. The current dataset advances while the earlier cursor remains bound to its original snapshot. Development challenge terms change only as explicitly selected.
7. The customer browser recovers a withheld successful generation reply, downloads all six original files, verifies a range and builds an offline snapshot-pinned request.
8. MCP streams the complete current source packet with both chunk and whole-file hashes. The original source receiver adopts it independently.
9. Earlier owners close. Installed Applications uses the reviewed source/runtime identity, starts and opens the real workspace, resolves retained start state, stops, reopens, and performs its second explicit reviewed start/stop.
10. The closed whole archive is independently received. The original app opens its native UUID, revision and results; each original publication is reopened and all values compared. Actual received browser captures are retained.

## Full private handover

The final handover/Zarr_Complete_Receiving.zip contains the complete current native packet; all original source-stage requests and receipts; the original publisher workspaces, dataset version stores and publisher action receipts; merchant/customer and Applications histories; actual captures; the original selected engine archive and manifest; and the complete Zarr source, examples, licenses and guides.

HANDOVER.json lists every regular member, byte count, SHA256, executable mode and role. The archive plan freezes that selection before writing. A completed archive is verified and reused even if its receipt was lost. A complete unpublished attempt can be adopted under the same plan. Incomplete partials and unrelated files remain available for recovery.

This ZIP is private operator material. The six generated files under receiving/merchant/received-client are the separate customer handover. Do not publish private workspaces or runtime declarations as customer source.

## Independent receiving

Use the complete receiving/START.py from the selected source, or the included START.py alongside the archive. Select the exact archive hash from the package result.

~~~sh
python3 START.py inspect \
  --archive "/private/Zarr_Complete_Receiving.zip" \
  --sha256 "ACTUAL_COMPLETE_ARCHIVE_SHA256"

python3 START.py receive \
  --archive "/private/Zarr_Complete_Receiving.zip" \
  --sha256 "ACTUAL_COMPLETE_ARCHIVE_SHA256" \
  --directory "/private/received-zarr"
~~~

The script validates the entire archive before extraction. The included original packet receiver owns native SQLite/history adoption. Only the selected publisher, dataset and publisher-request additions are then restored. No service starts automatically. A repeated completed receive preserves later native and publisher work instead of recopying an old database.

The full automated entry additionally opens this received workspace with the same original installed runtime, validates every original publication, captures the real browser and closes services. On another host, install the included original engine with the maintained installer, select matching Python/browser dependencies, and create explicit private connections as described in [WORKSPACE.md](WORKSPACE.md).

Publisher source/target paths are relative to their workspace. The public resource, local seller listener and historical SF82 declarations retain their original values. Review the intended listener and deployment before starting them on a new host; the receiver does not silently rebind or reactivate an old runtime.

## Interruptions and source updates

Keep the exact prepared input and operation directory. Resume the same --input command. The permanent lock rejects another active owner. Native source UUIDs, browser publisher requests, customer exports and managed application runs retain their original journals.

When NATIVE_COMPLETE exists, completed native legs are skipped and package/receiving continues. When delivery.json is complete, the entry verifies its archive and result identities and returns them. No array stage is repeated.

Do not change the prepared input, source manifest or native request under the same operation. A source correction must explicitly preserve and continue its original saved state. The native packet implementation separately supports completed export replay after a code upgrade: it validates the original retained intent/application/manifest first. A new application edition receives a new export ID.

Completion claims follow the actual receipts. Authored source, a READY runtime, a complete source packet, complete merchant/customer work and a fully received archive are separate observations.

## Continue the original workspace with retained-result comparison

Use the existing 14F5 receiving owner and its original workspace. The earlier source course already retained forty original upstream arrays / 338 cells, plus a four-cell strided temperature result, at workspace `fd072b35-cafe-4e00-93bd-cee34265c5bc` revision 166. Those are original interoperability example results; this addition is a comparison of retained results, not a new array extraction or environmental measurement.

The original complete packet has a known existing file reference: `Zarr_Original_Source_Workspace_20261012.zip`, `libfile_9ace9a199b488191b1b637689b2f6de1` / `file_00000000c44081f7a575bf2c5bfe7027`, 335,104 bytes, saved 2026-10-12T21:49:58Z. That metadata supplies no version or whole-file SHA. Materialize through the existing supported file route, verify the full packet/manifest and reconcile its original 14F5 identity before use. Do not invent a hash or regenerate the forty arrays because only metadata was available to the source author.

The comparison source extension is `SCF-ZARR-RETAINED-COMPARISON-B3909-20261013`. It joins the existing source workspace and same native receiving course. The new source has been authored and independently reviewed; actual comparison execution, generated report inspection and receiving completion require the original equipped operator's actual receipts.

### A concrete continuation over the existing complete and strided results

1. Receive or reopen the verified original workspace with its full saved sources, selections, result files, reviews and UUID/revision. Select the actual complete temperature result and its actual saved four-cell strided result from status. Retain both exact result IDs/content hashes. If either is absent, ask the original source owner for its existing complete packet rather than reconstructing observations or rerunning extraction.
2. Load the full selected current application. Use **Compare results** to choose the two retained results, title and interpretation note, then create the saved comparison through the existing retained UUID/revision prepare/apply flow. Pairing must be explicitly `source-index`.
3. Read the complete saved comparison population and both full source/selection/metadata contexts. Reconcile every original cell: equal typed representations are `same`, different representations are `changed`, and a tuple present on only one side remains `left-only` or `right-only`. Record actual counts from the output; do not prefill expected counts from an assumed array shape.
4. Operate the original request recovery where needed. Lost response means inspect/resume the same UUID and complete body. Preserve original results and source history. No new array run, controller, watcher or competing issuer is needed.
5. Open the complete generated HTML as a recipient and look at it at screenshare and narrow widths. Operate its source-context disclosures; inspect long typed values, absent-side labels, table scrolling and print output. Download and open all JSON/CSV/HTML exports. CSV must retain complete original-row JSON, including integers/compound values, rather than spreadsheet-coerced replacements.
6. Record a named comparison decision with the actual interpretation/limitations in the original review operation. Read the comparison hash and review receipt back. Reports remain frozen at creation; the later review lives in the retained workspace/packet. Accepted comparison review does not change either native result's acceptance or publish/freeze a scalar source.
7. Export a new complete current source-workspace packet with its retained export UUID. Check its actual member inventory, then independently receive it into the declared destination using the original complete packet receiver. Reopen the saved comparison and later review, open all three reports, and confirm the same original source/results and complete request history. Keep prior historical export bytes and inventories exact.
8. Continue the established complete merchant/publisher handover only where it is already selected. A native source packet is not the full publisher/dataset/deployment delivery.

Include both original typed result bodies, saved comparison/review receipts, whole generated reports, current complete application/guide source, the actual full source packet and receiver observations in the existing operation's delivery. Use the established complete file-saving step. Preserve the original operation/host/recipient handles and report actual closure. When no runtime is available, hand the whole current source and known existing input reference to the existing equipped receiver, then continue independent work.

### Exact new limits and packet application inventory

The new native comparison limit is 96 MiB of complete JSON and two million union positions; each complete report is bounded at 384 MiB. Reads use 1–500 rows or byte ranges up to 1 MiB. The original whole packet remains limited to 2 GiB and 200,000 entries. Capacity rejection retains the original task and source; it does not authorize truncation.

A current native packet contains six Python files, adding `comparison.py` to the original `files.py`, `native.py`, `workspace.py`, `packet.py` and `cli.py`. Complete historical five-file packets remain accepted. An already completed historical export stays its own original application edition; a new current export includes its complete six-file inventory and comparison reports. The package preserves the original source-workspace scope and its declared exclusions.



## Current delivery and receiving owner instructions

# Repository delivery instructions

Use the current README and the existing product's build/receiving guide. Coordinate through the original implementation and receiving owners, preserve concurrent source, and carry work through its authorized delivery.

## Rendered product inspection — owner instruction, 2026-10-13

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Bryce's standing rule is: “that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it”.

Before presenting a client/prospect-facing application, website, dashboard, demo, report, presentation, export or any attachment, the producing peer must open/run/render the exact outgoing version, LOOK at it and normally use it as the recipient would. View the actual screenshots you capture. Inspect the actual presentation/screenshare width and relevant narrow/mobile width, important user controls, populated/empty/loading/error states, downloads and reopened exports. Open the usable contents of ZIPs/projects and every applicable report/PDF page. Source review, schemas, HTTP 200, DOM counts, tests, checklists and another worker's approval cannot substitute for observing and using the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and continued delivery; it must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk. Do not run broad test sweeps, repeat accepted checks, build a verification product or create review bureaucracy or an approval queue.

For video and audio, Bryce directs: “also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them”. Use available high-quality generative voice/TTS and useful generative media, with natural professional delivery. Actually watch/listen to the final outgoing export, including pacing, pronunciation, timing and audio alignment. Preserve existing spending, voice and attribution controls.

Include this complete instruction in delegated assignments and the active owner-controlled provider/project/cloud policy, boot, build and receiving guidance those workers actually read. Reuse already updated copies and return exact updated paths/version in the original policy thread with the next substantive result. Delivery of source does not establish that every runtime loaded it. Preserve all other owner controls and original operation identities; leave historical records and third-party/vendor policies intact. This instruction creates no restarts, watchers, credential gate or new release permission and does not revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

Owner instruction and coordinated propagation: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791881496221999
Canonical attachment/media clarification: https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791885532614949

## GitHub Actions zero spend — existing owner instruction

Keep GitHub Actions disabled in this repository's provider settings and preserve the disabled source policy in [.github/hosted-ci-policy.json](.github/hosted-ci-policy.json). Every workflow job must retain the established literal-false condition, including manual dispatch and reusable jobs. Preserve its original condition inside the wrapper, and preserve the complete steps, commands, source and delivery artifacts.

Run focused product work in the existing cloud Linux or original local receiving operation. A public repository, available free minutes, cloud admission failure or a missing green check does not authorize enabling or dispatching hosted Actions. Do not set `HOSTED_CI=on`, add scheduled hosted runs or choose a paid runner. Keep source-native receiving moving with its original owner and saved operation.

Before publishing workflow changes, use the maintained Commons `tools/hosted_ci_gate.py --zero-spend REPO_ROOT` and `--check REPO_ROOT` source operation where that existing runtime is available. Its canonical wrapper is `${{ (false) && (ORIGINAL_CONDITION) }}`; the original condition is retained for native continuation. Provider disablement, the whole-account spending budget and dated billing remain separate controls; preserve current artifacts and their original custody.

This carries Bryce's existing zero-spend instruction from [Commons RULES, CI and spend](https://github.com/woahwhattheheck/commons/blob/main/RULES.md#4-ci-and-spend) into this repository's consumed entry guidance. Original cost coordination: https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791755765336589 .
