## GridFabric customer procedures and complete operating handover

An energy-integration team needs to carry the complete customer job from the selected Plaid workspace through measurement review, event and device work, report delivery and an editable handover. The shipped GridFabric product now does this through one nine-stage customer procedure in its existing authenticated browser, typed SDK and installed CLI. The operator retains the original records and files behind each assessment, and a recipient can reopen the whole captured procedure independently.

The complete public release is [PR3656](https://github.com/woahwhattheheck/public-commons-sprint-2026/pull/3656), commit `1e28cff54113f5c0b8ed39ff1783074926a9ad63`. It carries the existing native product together with the complete customer procedure desk, saved request recovery, portable archives and all selected dependencies. The [installed product source](https://github.com/woahwhattheheck/public-commons-sprint-2026/tree/1e28cff54113f5c0b8ed39ff1783074926a9ad63/stellar/scf-starforge-20261009/sf30-seller-sdk/gridfabric-plaid) retains the original GridFabric application and its SQLite, callback, dispatch and restore owners. The [Energy operating guide](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/1e28cff54113f5c0b8ed39ff1783074926a9ad63/products/energy-operations/OPERATING.md) gives the full source-build, installation and application-opening instructions.

### The complete customer job

The procedure is created against the customer's actual workspace ID, source hash, selected Plaid instance and reviewed native revision. Its editable plan carries customer, period, owner, instructions, expected result and explicit assessment for every stage. Each stage can retain complete original responses, dependent pages and files.

| Stage | Work the operator completes | Material retained for the recipient |
| --- | --- | --- |
| Workspace | Open the selected customer's original application and confirm its source and native revision. | Original workspace and source identities, installed command registration and runtime declarations. |
| Configuration | Review the selected instance and its configuration editions. | Complete instance records and relevant retained configuration history. |
| Sources | Receive measurement sources, inspect original rows and issues, and retain reviewed corrections. | Original source bodies, dependent rows, issue records and selected native files. |
| Mappings | Review report definitions and the selected mappings. | Full mapping records and the operator's recorded assessment. |
| Callbacks | Inspect original callbacks and the complete response history. | Callback records, delivery pages and original dependent files. |
| Events | Review event intervals, targets, revisions, distributions and opt decisions. | Complete selected event and decision history, preserving each original native status. |
| Dispatch | Reconcile original management, provider and device work. | Management operations, receipts, device actions and original operation results. |
| Reports | Inspect the actual report calculation and its rows. | Complete report records, dependent report rows and retained report files. |
| Delivery | Select the completed customer material and prepare the editable handover. | Whole plan history, complete capture and every selected file; the native workspace export when the operator has explicitly selected it. |

The [complete procedure guide](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/1e28cff54113f5c0b8ed39ff1783074926a9ad63/stellar/scf-starforge-20261009/distribution/discovery/GRIDFABRIC_PROCEDURES.md) defines the stable stage IDs, record selections and original relationship rules. Selecting one original record for several relevant stages retains its identity. Successful retrieval preserves the current step assessment; the operator explicitly records progress or completion with its explanatory note. Native acknowledgement, management processing, later VTN outcomes and the customer's assessment remain separately readable.

### Save and continue the same work

**Customer procedures** opens from the existing GridFabric console. The operator browses original collections, reviews their continuation pages, selects records and files, prepares the complete plan, edits it and saves a revision. The browser retains full history and raw working drafts in its workspace-specific IndexedDB record.

Before capture, it saves the complete request: one UUID, normalized input, selected catalog, full plan and capture time. The server binds that same request before reading the original SDK. The capture checks the selected source and native revision before and after reading the entire selected record graph. An advancing workspace requires a new reviewed selection.

A lost response can be resolved by opening the saved request and reading its original outcome. Completed requests return their original capture. An incomplete attempt can be continued explicitly with the same frozen body when its selected state is still current. A different body receives a separate request identity after review. Previous attempts and errors stay in the record.

Complete browser-work backups carry plan revisions, raw drafts, command text, requests and earlier source bindings. Compatible work can be merged; conflicting drafts or histories can be retained as a separate recovery journal. Larger original archive files remain declared by exact identity alongside the backup and are reselected before import. The [complete procedure and browser-work recovery guide](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/1e28cff54113f5c0b8ed39ff1783074926a9ad63/stellar/scf-starforge-20261009/distribution/discovery/GRIDFABRIC_PROCEDURES.md) describes storage failures, cross-tab changes, compatible backup receiving and separate recovery journals. The [browser operating guide](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/1e28cff54113f5c0b8ed39ff1783074926a9ad63/stellar/scf-starforge-20261009/sf30-seller-sdk/gridfabric-plaid/BROWSER_PROCEDURES.md) covers original-outcome recovery and complete archive reopening.

### Complete source and customer receiving

A completed capture includes the normalized input, full catalog, original and final plan history, readable HTML and Markdown, whole original HTTP bodies and metadata, selected and dependent native files, and the original declared native and capture-helper sources. The capture manifest is committed after its declared members are durable.

The customer receives that complete material as a streamed `.gridprocedure.jsonl.gz` archive. The archive reader checks the compressed file's byte count and SHA-256, ordered member contents, footer and original capture graph. It uses the same original offline validator as native receiving. The original CLI exposes the entire sequence:

```sh
starforge gridfabric-procedure archive \
  --directory /private/customer/capture-2026-10-13 \
  --out /private/customer/GridFabric_Procedure.gridprocedure.jsonl.gz

starforge gridfabric-procedure receive \
  --archive /private/customer/GridFabric_Procedure.gridprocedure.jsonl.gz \
  --sha256 ARCHIVE_SHA256 \
  --bytes ARCHIVE_BYTES \
  --out /private/customer/received-gridfabric-procedure

starforge gridfabric-procedure show \
  --directory /private/customer/received-gridfabric-procedure
```

The sender's actual returned hash and length fill the two archive fields. The receiving directory is new and private. The recipient opens the complete recorded plan and files without starting the original customer workspace. Its editable JSON enters the existing Operating Plans receiver, which retains compatible extending history and provides the existing explicit review/copy route for divergent work. The original GridFabric native export/restore commands transfer the operating database when that full database is needed.

The [native capture and offline receiver](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/1e28cff54113f5c0b8ed39ff1783074926a9ad63/stellar/scf-starforge-20261009/distribution/discovery/gridfabric-procedure-native.mjs), [streamed archive implementation](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/1e28cff54113f5c0b8ed39ff1783074926a9ad63/stellar/scf-starforge-20261009/sf30-seller-sdk/gridfabric-plaid/procedure-archive.mjs) and [complete installed CLI](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/1e28cff54113f5c0b8ed39ff1783074926a9ad63/stellar/scf-starforge-20261009/distribution/discovery/gridfabric-procedure-cli.mjs) are the executable source for this handover. The browser's writable-file route streams large downloads; its in-memory fallback has a 64 MiB allowance. The existing server defaults to 4 GiB compressed import, while expanded receiving defaults to 16 GiB. The installed CLI uses streamed receiving with an explicit allowance for a larger known customer delivery.

### Install and embed the original product

The [public source selection](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/1e28cff54113f5c0b8ed39ff1783074926a9ad63/stellar/scf-starforge-20261009/distribution/selections/gridfabric-plaid.json) includes GridFabric, the original Utility and Leap products, discovery and Operating Plans, and the complete procedure dependencies. The [command and typed-export registration](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/1e28cff54113f5c0b8ed39ff1783074926a9ad63/stellar/scf-starforge-20261009/distribution/contributions/gridfabric-procedures.json) exposes the customer procedure alongside the original product.

An application can use the [pure procedure model](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/1e28cff54113f5c0b8ed39ff1783074926a9ad63/stellar/scf-starforge-20261009/distribution/discovery/gridfabric-procedure.mjs) to validate a complete selection and prepare or extend the same Operating Plan. Native capture borrows an already-connected original SDK client; its embedding application retains that client's lifecycle. The original authenticated Grid server remains responsible for live domain operations. Its procedure controller drains owned capture reads before listener shutdown, while the main application retains its workspace lease.

The shipped public recipe was composed through its original source-selection, metadata, composer and catalog functions with all twelve selected contributions. The resulting selected catalog contains 36 commands, 62 exports and 127 entries. Every declared support path was read successfully, and all 23 source files in PR3656 were independently read back from the merged destination. The public OperatingPlan, catalog, SDK HTTP client and browser asset loader match the dependency bodies used in the completed native receiving.

### Operated results and the receiving programme

The existing native filesystem, gzip and HTTP course exercised complete capture, identical-request recovery, changed-request rejection, explicit continuation and cold reopening. The installed archive → receive → show course retained every original member and the full customer history. The actual Chromium course rendered the customer controls and downloaded a whole browser-work journal retaining raw drafts and external-file identities. The subsequent cold-reopen browser interaction remains the existing receiving owner's continuation after the recorded host interruption.

The [original complete delivery and operated results](https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791871430722459) and [public integration delivery](https://tokenjunkielabs.slack.com/archives/C0BTB4SUCP9/p1791880074556099) join this source to that same original operation. The private full catalog result of 3,826 entries from 424 sources and the new selected public catalog result of 127 entries describe different selections; the public installation uses its own complete selected recipe.

### Contribution to the funded installations

This supplies a concrete starting product for the application's existing customer commissioning, recurring operation and complete receiving work. A selected installation defines its source contract, actual instance and receiving environment, reviewed mappings, operational owners and acceptance outputs. The original installation and support work then adapts and commissions this shipped source within the existing six-package plan.

The grant remains USD 38,000 for 400 prospective hours over 150 days from actual award acceptance. The Grid product is an existing implementation available to that plan; its source does not create a seventh funded package or add its commercial price to the grant. The original separate Grid implementation workshare is proposed at USD 14,800 over 18 business days, with USD 4,400 / 6,000 / 4,400 milestones, one licensed Plaid VEN, one VTN/environment and one device platform. The [original complete scope and receiving package](https://github.com/woahwhattheheck/commons/pull/35321) defines its source intake, corrections, report mappings, native callbacks and opt decisions, retained-request recovery, two walkthroughs and complete source handover.

The funded customer outcome is a working selected installation with its original inputs, reviewed operating decisions, exact result files and editable procedure. Its receiving operator can reopen the whole completed job, inspect the original material behind each step, and continue the same customer work.
