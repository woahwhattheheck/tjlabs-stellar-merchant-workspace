# OpenAQ study → original Buyer → complete customer delivery

Use one reviewed OpenAQ study through its existing merchant release and the original SF88 Dataset Buyer. The customer selects the exact snapshot and query, reviews the existing Buyer’s payment terms and page budget, acquires the original Dataset pages, and receives all of the resulting work: typed data, readable review, source study, native page attempts, and accounting.

The scientific study and the purchased Dataset are distinct parts of the same handover. The study contains the original capture, HTTP source and receipts, source review, and reports. The Dataset contains the rows returned for the customer’s exact query. Filters can select fewer rows than the full study. The receiving manifest binds both to the same reviewed publication.

## Complete a customer delivery

1. **Handoff:** finish the seller’s original stage and study export, then run `handoff`. Keep its returned `handoffSha256` and exact output directory.
2. **Acquire:** pass that file digest into `prepare` with the existing Buyer, original intent, selected requirement and budget. Use `inspect` to review the returned native request, then `run` through the original approval channel.
3. **Export:** after the native session is `COMPLETE`, run `export`. Keep the returned full delivery directory and `manifestSha256`.
4. **Receive:** transfer that complete directory, use its exact digest in `receive`, then use `reopen` on the returned receiving directory.

Take identifiers, native statuses and digests directly from each command’s JSON result. The detailed steps below explain the original seller and Buyer inputs, full file contents, and continuation after an interruption.

## Installed command and source entry

The OpenAQ distribution contribution registers `openaq-buyer` and exports `./buyer/openaq-study` with adjacent TypeScript declarations. Keep the complete selected distribution and its original native dependencies. The source entry is:

~~~sh
node stellar/scf-starforge-20261009/sf88-operator-buyer-cli/openaq-study/cli.mjs help
~~~

The existing `openaq-studies` selection installs the `starforge` executable. The examples below use `starforge openaq-buyer` for the registered command. When working directly from a source checkout, substitute `node /ABS/SOURCE/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/openaq-study/cli.mjs`.

Node runs the original Buyer and output engines. The original OpenAQ/Frictionless tooling and portable Dataset receiver also use the selected Python runtime. `--python` chooses Python for the Dataset session archive; the OpenAQ source command retains the installation’s original source-runtime configuration.

Choose an existing private parent for all output directories. The integration accepts canonical absolute paths, directories owned by the running account with mode 0700, and private files. Create a new parent explicitly, for example `mkdir -m 700 /ABS/PARENT/openaq-customer`. Keep the original merchant, Buyer operator, handoff, acquisition, export, and receiving directories separate. Original input locations stay unchanged.

## 1. Finish the original seller edition

Use the original OpenAQ project to select the completed capture and accepted source review. The review must permit derived delivery. Finish the existing Frictionless extraction, candidate review and publication, then the original release preparation and stage. The original merchant console owns activation, running, stopping, rollback and facilitator configuration.

The seller supplies these actual retained values:

| Input | Original authority |
| --- | --- |
| Project directory | Existing private OpenAQ workspace |
| Stage request UUID | Completed `release.stage` operation |
| Export request UUID | Completed `export` operation containing this capture and review |
| Release digest | Exact staged original SF82 release |
| Optional connection file | Existing OpenAQ managed listener connection |

The export selects exactly this capture and source review, plus its chosen reports. A different source edition needs its own original reviewed publication and handoff. The handoff does not stage, activate, or replace the seller.

Read [the merchant operating guide](../../sf30-seller-sdk/openaq/MERCHANT_OPERATIONS.md) for that original console. The seller’s `stageRequestId` identifies both the retained preparation and staged release; the current active release is a separate runtime selection.

## 2. Produce the complete source-bound handoff

~~~sh
starforge openaq-buyer handoff \
  --project /ABS/PRIVATE/original-openaq \
  --stage ORIGINAL_STAGE_UUID \
  --export ORIGINAL_EXPORT_UUID \
  --release-sha256 ORIGINAL_RELEASE_SHA256 \
  --out /ABS/PRIVATE/handoff \
  --connection /ABS/PRIVATE/original-openaq-connection.json
~~~

The connection option selects the original authenticated OpenAQ download helper. It verifies the actual workspace, configuration, instance and source identity, then receives the complete original study archive with its native download checkpoint. Without that option, handoff reads the already completed archive in the original project.

The handoff reads the saved preparation, stage, capture, review and export; reopens the actual SF82 Dataset release; and checks the retained CSV, source references, candidate, publication and seller offer. It receives the complete original study through the existing OpenAQ package receiver before publishing:

- `handoff.json`: exact selected original offer, release and snapshot, capture and review identities, publication/source metadata and the complete study file inventory.
- `study.tgz`: the complete original scientific study archive.

The command returns `handoffSha256`, the SHA-256 of the entire `handoff.json` file, along with both file descriptors. Preserve that exact file digest. The `sha256` inside the JSON is its canonical semantic identity; the file digest is the command’s input for later receiving.

~~~sh
starforge openaq-buyer handoff-inspect \
  --dir /ABS/PRIVATE/handoff \
  --sha256 HANDOFF_FILE_SHA256
~~~

Repeating the same handoff command reconciles its exact retained request and files. A changed original release, capture, review, project configuration, or exported member is an error. A later listening instance may be selected through the current original connection file if it still binds the same original project and configuration.

The handoff’s public Dataset query is HTTPS and uses the original advertised payment requirements. Original signing keys, merchant capabilities and approval credentials remain with their existing owners. The original study/source terms accompany the delivered bytes.

## 3. Select the existing Buyer and exact query

Choose the actual existing SF88 operator workspace that is configured for this network, asset, payer/signing source, transport, policies, budgets and approval channel. Preparation uses the original `workspaceConfiguration` binding without opening its keys. Execution uses the original `workspaceExecution` and native approval/signing path.

The Buyer’s operator directory here is the SF88 operator workspace. It is not the OpenAQ project, the merchant release store, a browser connection file, or an empty substitute directory. Use the original [SF88 workspace instructions](../README.md) and its existing owner to configure that workspace.

A complete-source query can retain all fields and page over the study:

~~~sh
starforge openaq-buyer prepare \
  --dir /ABS/PRIVATE/acquisition \
  --handoff /ABS/PRIVATE/handoff \
  --handoff-sha256 HANDOFF_FILE_SHA256 \
  --workspace /ABS/PRIVATE/original-buyer \
  --intent ORIGINAL_CUSTOMER_INTENT \
  --accept 0 \
  --query 'limit=50' \
  --max-pages 3 \
  --max-total-atomic ACTUAL_APPROVED_TOTAL_ATOMIC
~~~

`--accept` is the zero-based index of the exact retained offer’s accepted requirement. Choose the actual scheme/network/asset/recipient and decimal atomic-unit budget; the example does not select a price. The original per-page cap cannot exceed the existing operator’s cap, and the saved total caps all page allocations.

For a supported filtered query, use the actual native query names:

~~~sh
starforge openaq-buyer prepare \
  --dir /ABS/PRIVATE/pm25-acquisition \
  --handoff /ABS/PRIVATE/handoff \
  --handoff-sha256 HANDOFF_FILE_SHA256 \
  --workspace /ABS/PRIVATE/original-buyer \
  --intent DISTINCT_REVIEWED_QUERY_INTENT \
  --accept 0 \
  --query 'where_parameter=pm25&limit=50&sort=datetime_utc' \
  --max-pages 1 \
  --max-total-atomic ACTUAL_APPROVED_TOTAL_ATOMIC
~~~

These are alternative reviewed acquisitions. Choose one intended query. Creating a distinct intent for a later paid acquisition is a new purchase decision.

The source-native query supports `fields`, `limit`, advertised `where_COLUMN` equality filters, advertised range filters, and an advertised sort column. This OpenAQ publisher enables equality filters for location, sensor, parameter, unit, resolution, local day and archive day, and sorts for UTC time and source row. Use `where_parameter` rather than `parameter`. The saved handoff supplies `snapshot` itself; callers cannot override it or supply an initial cursor. The original page engine produces each subsequent cursor and stable page intent.

The initial request retains:

- the exact handoff file and complete study bytes;
- original operator directory and concrete native GET;
- accepted requirement and prepared discovery origin;
- immutable configuration and its file/semantic digests;
- max pages, total cap, max rows and max page bytes;
- the original native Dataset session and preparation lineage.

Default row and response bounds are one million rows and 1 MiB per page. Select tighter bounds with `--max-rows` and `--max-page-bytes` when appropriate. The native exporter’s actual limits remain authoritative.

Preparation returns the selected session directory and native status. It performs no page request or payment.

## 4. Review, approve, and acquire

~~~sh
starforge openaq-buyer inspect --dir /ABS/PRIVATE/acquisition
starforge openaq-buyer run --dir /ABS/PRIVATE/acquisition
~~~

Inspect shows the original release, source review, exact URL, payment terms, limits, native page state and next page. The run invokes the unchanged native Dataset executor using the retained original operator. Each page reaches the existing approval channel and original SF36 ledger before any paid dispatch. Use the existing local terminal/browser approval mode and configured environment. A command cannot change that mode or signer on the fly.

Completed pages retain their original intent, response and evidence. Repeating run on a complete acquisition reopens its native complete state. The total cap and page limit are fixed by the original prepared request. Reaching either limit preserves the existing acquired pages; it does not silently increase the budget or start a replacement acquisition.

The process retains the wrapper lease while the original native page engine owns its session lock. Interruptions propagate through the accepted native operation. Wait for that original owner to retire before continuing. The integration creates no parallel Buyer listener.

### Original interrupted-attempt continuation

Use `inspect` first. If the original native run lock belongs to a proven-dead process, the existing native recovery command reads its host/PID/nonce and existing files:

~~~sh
starforge openaq-buyer recover --dir /ABS/PRIVATE/acquisition
~~~

The recovery command does not replay the page. A native `RECONCILIATION_REQUIRED` result can describe paid-but-unconfirmed, lost-output, unpaid or expired-generation work. Continue through that original result and the existing SF36/SF88 recovery authority.

For an actual original unpaid continuation with the reviewed attempt digest:

~~~sh
starforge openaq-buyer run --dir /ABS/PRIVATE/acquisition \
  --retry-unpaid --expected-attempt-sha256 ORIGINAL_ATTEMPT_SHA256
~~~

For an original released/expired generation, retain the full native continuation selection in a private JSON file, including its original history/source/proof fields:

~~~sh
starforge openaq-buyer run --dir /ABS/PRIVATE/acquisition \
  --retry-expired /ABS/PRIVATE/original-expired-selection.json \
  --expected-attempt-sha256 ORIGINAL_ATTEMPT_SHA256
~~~

Both paths use the original continuation and approval engine. An uncertain paid result is not an unpaid retry. The original [Dataset session](../dataset-session.mjs), lost-output tools and accounting commands retain the evidence and finality decisions. Use their recorded page directory and exact attempt identity when deeper reconciliation is required.

If the first native initialization was interrupted before a complete session definition, repeat the exact prepare command with `--resume-preparation`. A complete original pending definition is adopted with its exact bytes. A partial first write is preserved and an explicit following preparation attempt is recorded before creating its new native directory. A parseable incompatible record is an error. An existing complete session never relocates through this preparation path.

## 5. Receive the original accounting and full data room

~~~sh
starforge openaq-buyer account --dir /ABS/PRIVATE/acquisition
starforge openaq-buyer account --dir /ABS/PRIVATE/acquisition --finalize
starforge openaq-buyer deliver \
  --dir /ABS/PRIVATE/acquisition \
  --out /ABS/PRIVATE/dataset-output
~~~

`account` reads all original native accounting pages, including unresolved outcomes. `--finalize` explicitly continues the original SF36 finalizer on the existing operator. The page cap is an allocation rather than an actual charge. The native ledger, retained reservation and original chain evidence determine accounting.

`deliver` runs the original SF100 data-room builder on a complete acquired session. It returns the original native report and verified outputs:

| Output | Use |
| --- | --- |
| `dataset.jsonl` | Exact original JSON scalar types and complete query rows |
| `dataset.csv` | Corresponding complete tabular output |
| `review.html` | Readable query, page and data review |
| `manifest.json` | Original source page, evidence, chain and output hashes |
| `semantics.json`, when present | Original published semantic dictionary |

The original builder binds its output directory to the selected complete session. A lost reply after a complete build reopens those same files. A native `DATASET_DELIVERY_PARTIAL_NATIVE_EXPORT` preserves a partial finalization; choose a new explicit output directory and run the same complete session through the original builder. Preserve the earlier directory. This is output receiving from already acquired pages.

## 6. Export the complete customer handover

~~~sh
starforge openaq-buyer export \
  --dir /ABS/PRIVATE/acquisition \
  --out /ABS/PRIVATE/customer-delivery \
  --id ORIGINAL_CUSTOMER_EXPORT_ID
~~~

The command finishes the native SF100 output and original Dataset session archive, captures all original accounting pages, and binds them with the full scientific archive. It returns `manifestSha256`, the SHA-256 of the complete `delivery.json` file.

The complete directory includes:

| Member | Retained content |
| --- | --- |
| `delivery.json` | Full member inventory, exact byte/hash identities and source joins |
| `handoff.json` | Original selected release, source and query offer |
| `study.tgz` | Complete original OpenAQ project/source/report archive |
| `session.zip` | Original SF88 portable Dataset session, including page attempts and evidence |
| `session-export.json` | Original archive result and source inspection |
| `native-session.json` | Complete acquired native session inspection |
| `dataset-delivery.json` | Original unmodified SF100 delivery report |
| `accounting.json` | All original accounting pages and entry views |
| `customer-selection.json` | Original selected request, terms, limits and operator/session identities |
| `OPERATING.md` | Receiving and interpretation guide for this exact export |
| `dataset/*` | Every original SF100 output listed above |

`session.zip` is the native Dataset ZIP format. `study.tgz` is the native OpenAQ/Frictionless source format. Keep both files complete. The directory is a complete private handover, not merely a report or hash receipt.

Inspect before transfer:

~~~sh
starforge openaq-buyer export-inspect \
  --dir /ABS/PRIVATE/customer-delivery \
  --sha256 DELIVERY_MANIFEST_FILE_SHA256
~~~

Copy the whole directory through the chosen file-transfer mechanism and provide the exact `delivery.json` file digest to the recipient. All declared members are required. Each file is rechecked on receiving. Copying only `dataset.csv` loses source review, native evidence and editable project context.

Repeated export with the same directory, ID and request reopens its completed manifest. If the original data-room’s finalization is incomplete, preserve that export directory and choose a new explicit export destination/ID for the same completed acquisition. The native pages, paid intents and ledger remain the original ones.

## 7. Receive and reopen independently

On the receiving host, keep the copied complete delivery in its private directory. Choose a new private receiving directory:

~~~sh
starforge openaq-buyer receive \
  --source /ABS/PRIVATE/copied-customer-delivery \
  --sha256 DELIVERY_MANIFEST_FILE_SHA256 \
  --dir /ABS/PRIVATE/received \
  --id ORIGINAL_RECEIVING_ID
~~~

Receiving verifies the complete manifest, every file’s length/hash, original source/release joins, full Dataset page lineage and native report. It receives `session.zip` through the existing Dataset archive receiver and `study.tgz` through the existing OpenAQ receiver. Partial file copies resume only after verifying their exact retained prefix against the same complete source file.

The returned paths contain:

- `files/`: complete original delivery files and unchanged original reports;
- `session/`: the original Dataset session with its native storage mapping;
- `study/selected/`: exact original capture, source receipts, reviews and reports;
- `received.json`: the first completed receiving result.

The receiver preserves the original logical source and page identities. Its typed Dataset view points to the actual local output files without rewriting the original native report. It verifies the original source-page intent, body hash, evidence hash, row count and cursor sequence against every acquired page.

~~~sh
starforge openaq-buyer reopen --dir /ABS/PRIVATE/received
~~~

After the first complete receiving, reopen uses its retained `files/` and works after the donor directory is gone. The receiver’s original records and native engines own subsequent replay. Choose a new explicit receiving directory when moving a completed receiving to another host; do not relabel an old live process or mutate its local paths to resemble a new owner.

Open `files/dataset/review.html` and the original HTML report under `study/selected/reports/REPORT_UUID/report.html`. Both the purchased-query result and scientific interpretation travel together.

### Continue the editable scientific project

Use the existing OpenAQ CLI’s original receive action with a new private project directory and its selected project configuration:

~~~sh
starforge openaq receive \
  --workspace /ABS/PRIVATE/editable-openaq \
  --config /ABS/PRIVATE/project.json \
  --archive /ABS/PRIVATE/received/files/study.tgz \
  --sha256 ORIGINAL_STUDY_TGZ_SHA256 \
  --request ORIGINAL_IMPORT_REQUEST_UUID
~~~

That action imports the retained capture, review and report into the maintained workspace, preserving their IDs. The project can then continue through its ordinary review, reporting, publication and export workflow. Original measurements and unknown fields remain source evidence.

## Typed application use

Import the registered `./buyer/openaq-study` export from the installed distribution, or the adjacent `index.mjs` in the selected source:

~~~js
import {
  prepareOpenAQBuyer, inspectOpenAQBuyer, runOpenAQBuyer,
  accountOpenAQBuyer, exportOpenAQBuyerDelivery,
  receiveOpenAQBuyerDelivery, openOpenAQBuyerDataset
} from './sf88-operator-buyer-cli/openaq-study/index.mjs';

const prepared = await prepareOpenAQBuyer({
  directory: acquisition,
  handoffDirectory: handoff,
  handoffSha256,
  operatorDirectory: originalBuyer,
  intentId,
  acceptIndex,
  query: 'limit=50',
  maxPages: 3,
  maxTotalAtomic
});
const review = await inspectOpenAQBuyer({directory: acquisition});

// Invoke when the existing original operator is ready for this acquisition.
const acquired = await runOpenAQBuyer({
  directory: acquisition, environment: process.env, signal
});
const accounting = await accountOpenAQBuyer({directory: acquisition});
const exported = await exportOpenAQBuyerDelivery({
  directory: acquisition, destination: deliveryDirectory, exportId, signal
});

const received = await receiveOpenAQBuyerDelivery({
  sourceDirectory: exported.directory,
  manifestSha256: exported.manifestSha256,
  directory: receivedDirectory,
  receivingId,
  signal
});
const dataset = await openOpenAQBuyerDataset({
  directory: received.directory + '/files',
  manifestSha256: received.manifestSha256,
  signal
});
const rows = await dataset.readRows({maxRows: 1000, signal});
const csv = await dataset.file('dataset.csv').bytes({limit: 8 * 1024 * 1024, signal});
for await (const row of dataset.rows({signal})) {
  // Values retain the original string/number/boolean/null types.
}
~~~

Retain the caller’s original intent, caps and complete preparation values. The typed interface returns original native session and accounting records rather than a reconstructed payment result. Large files use the original verified file’s `chunks` iterator; completion verifies the full byte count and hash.

## Historical Del Norte example

The complete original sample is in [completed-del-norte](../../sf30-seller-sdk/openaq/examples/completed-del-norte/). Its [reading guide](../../sf30-seller-sdk/openaq/examples/completed-del-norte/READING_GUIDE.md) explains the original source and coverage.

The sample is Del Norte, Albuquerque, OpenAQ location 2178, archive local day 2022-05-03, America/Denver. It contains 140 observations from six sensors: 24 rows each for CO, NO2, O3 and SO2, and 22 each for PM10 and PM2.5. Gases retain ppm and particulates retain µg/m³. The difference in row counts alone does not establish missing hours or a completeness percentage.

Retain period-end timestamps, measurement periods, source timezone, retrieval time and unknown quality/coverage/averaging fields separately. The original source and license context remain attached. A historical study does not represent another location, a new capture, or regulatory acceptance. Scientific interpretation and any customer acceptance remain with the appropriate reviewer.

The original complete study archive is 13,807 bytes, SHA-256 `9fcc10bd1c91816c51c790a45d6f6aa76053ea375092ff5a802c655a19acc0b6`. The original HTML report is 9,237 bytes, SHA-256 `fc0b59f85bbb7a610a0ff46007012b47a2026a198c2c38d6329271b6fbfd7445`. These source files are reusable examples; a paid merchant run uses its actual staged release, active service, facilitator and existing Buyer approval.

## Native authorities and maintenance

The implementation imports the maintained original engines:

| Responsibility | Original source |
| --- | --- |
| OpenAQ project source/export/import | `sf30-seller-sdk/openaq/{workspace,package}.mjs` |
| Authenticated original study download | `sf30-seller-sdk/openaq/{managed,download}.mjs` |
| Reviewed publication and release | Original Frictionless publisher, SF82 releases and Dataset release |
| Native offer preparation | `sf88-operator-buyer-cli/prepare.mjs` |
| Existing operator binding and execution | `sf88-operator-buyer-cli/queue.mjs` |
| Page attempts, approval, recovery and accounting | `sf88-operator-buyer-cli/dataset-session.mjs` |
| Complete typed data room | Original `dataset-delivery.mjs` and SF100 delivery engine |
| Private native session transfer | `dataset-session-portable.mjs` and its original Python receiver |
| Typed output reads | `sf88-operator-buyer-cli/node/dataset.mjs` |

The private wrapper records the customer’s selection and joins the original outputs. The seller owns its release/listener; the original Buyer owns approvals/signing; SF36 owns financial state; each archive engine owns its own receiving. Continue source changes through these existing owners and retain their complete distribution dependencies.
