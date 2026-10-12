# Grant Operations — installed operating and receiving guide

Grant Operations carries one retained grant plan through contributor delivery, invoices and cash, dated forecasts, resource allocation, original buyer and merchant-support evidence, complete customer installations, original implementation reviews, measured cohort reviews, tranche preparation and a complete receiving handoff. The browser, command line and Merchant MCP client operate the same original SF47 workspace and its revisioned records.

The maintained source selection is **grant-operations**. Open **Applications → Grant planning and delivery**, or use **starforge grant-workspace**. The selection includes the complete SF47 model and operator, the original Node and Python buyer receiving sources, merchant-support readers, the Grant Application, its Merchant MCP provider, and the existing installation and transfer controls. It uses the canonical [Stellar merchant workspace repository](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace).

This guide is also retained at `package/source/products/grant-operations/OPERATING.md` in the selected archive. The relative source links below resolve from that file.

## 1. What the operator retains

| Work | Retained source and decisions |
| --- | --- |
| Grant planning | Original scenario, Decimal calculations, named plan, immutable revisions, staffing, work packages, pricing, contributor payment timing and explanatory notes. |
| Delivery and cash | The exact selected plan revision; contributors, submitted and accepted work, invoices, disputes, actual payment observations, allocations, deployments, source attachments and original history. |
| Forecast and Portfolio | Complete input, case version and source snapshot; dated cash assumptions, every remaining task, capacity calendars, alternatives, selected work dates and the original reviewed event release. |
| Buyer and Support receiving | Exact exported files, original job/purchase/deployment identities, selected associations, reader results, native previews and same-request receipts. |
| Customer installations | Complete commissioning and commercial source, useful task and priced unit, source population, exact payment and aggregate task budget, receiving application and maintainer, original funded assignments and acceptance records; immutable editions and complete selected-edition handover. |
| Implementation evidence | Exact commissioning/workspace/Support source, complete original-file inventory, source cutoff and producer fingerprints, explicit observation-to-case links, selected Installation editions and immutable reviews. |
| Cohort and Completion | Explicit measurement populations and cutoff, original observations, immutable frozen evidence, payment-derived completion clocks, assignments, prepared forms and actual issuer receipts when supplied. |
| Receiving | A complete planning or operating-case export with its manifest, source bytes, history, forecasts, portfolios and reviews, reopened through the original importer. |

A plan revision, case version, installed source commit and original request ID identify different things. Record each from its native response. The installed source can advance without rewriting an older plan or review. A case remains pinned to the plan revision chosen when it was created.

Use named recording and reviewing operators. A contributor invoice, a prospective customer's quote, an issuer submission and an observed receipt retain their separate native meanings. Enter unknown facts as unknown; a testnet observation remains visibly testnet.

## 2. Receive and install one selected source edition

### Select the original release

For an already supplied release, retain its TGZ, complete manifest and exact archive SHA-256. Confirm that the manifest's sourceSelection.id is grant-operations, sourceRepository is the canonical repository, and sourceCommit is the intended immutable edition.

The release producer uses the existing committed recipe and builder:

~~~sh
node /absolute/maintained/source/stellar/scf-starforge-20261009/distribution/build.mjs --repo /absolute/original-git-cache/repository.git --ref FULL_IMMUTABLE_COMMIT --selection grant-operations --out /absolute/new-grant-release --offline
~~~

The repository argument must be a real Git object database containing that commit and its required blobs. A directory of copied source is not a substitute. Use --offline only when those original objects are already retained. A resumed build reuses its original output directory, commit and selection with --resume; a different edition receives a new output directory.

The builder records the recipe's original Git blob, SHA-256 and bytes, every packaged source file, registration inputs, package metadata and resulting archive. It follows the maintained static ESM closure and the recipe's complete components and explicit dynamic support files. The original SF47 Python modules, HTML/CSS, buyer SDK, support reader and managed worker files travel together.

### Install and inspect

Use Linux, Node.js 22.16 or newer, Python 3.11 or newer, npm and util-linux flock. Choose a Node version satisfying the resolved profile. Prepare private parent directories under the receiving operator's account. Keep runtime source, mutable workspace, working inputs and delivery exports in separate named directories.

The examples below use absolute paths. Set them to the selected host's actual locations; the archive name and hash come from its original receipt.

~~~sh
GRANT_TOOLKIT=/absolute/maintained/source/stellar/scf-starforge-20261009/distribution
GRANT_RUNTIME=/srv/grant-operations/runtimes/edition-01
GRANT_DATA=/srv/grant-operations/private/grant
GRANT_RECEIVING=/srv/grant-operations/private/receiving
GRANT_PYTHON=/usr/bin/python3

node "$GRANT_TOOLKIT/runtime-install-cli.mjs" prepare --dir "$GRANT_RUNTIME" --archive /absolute/downloads/ORIGINAL_GRANT_ARCHIVE.tgz --sha256 EXACT_ARCHIVE_SHA256 --operator --feature mcp
node "$GRANT_TOOLKIT/runtime-install-cli.mjs" install --dir "$GRANT_RUNTIME"
node "$GRANT_TOOLKIT/runtime-install-cli.mjs" inspect --dir "$GRANT_RUNTIME" --load --source
~~~

The mcp feature uses the selected archive's original pinned dependency declaration. The browser and Python operator alone can be installed with --operator and without --feature mcp. Installation readiness is established by the actual inspect result. Keep its profile, lock, source inspection and installation receipt.

For an existing complete npm cache, the same install supports --offline --cache /absolute/cache. If installation is interrupted, use resume on that same prepared directory. An upgrade or recovery creates a new runtime and keeps the prior edition available; follow the original [runtime installation guide](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md).

Use the original installed dispatcher for subsequent commands:

~~~sh
grant() {
  node "$GRANT_TOOLKIT/runtime-install-cli.mjs" run --dir "$GRANT_RUNTIME" -- grant-workspace --python "$GRANT_PYTHON" "$@"
}
grant --help
grant init --workspace "$GRANT_DATA"
grant serve --workspace "$GRANT_DATA" --port 8467
~~~

The explicit --python option precedes the grant subcommand. The original launcher also accepts SF47_PYTHON and passes its running Node executable to native buyer/support readers. Keep the private access file and access-fragment URL returned by the original server within the operator's custody.

### Use managed Applications

The existing runtime workspace can attach that READY installation:

~~~sh
node "$GRANT_TOOLKIT/cli.mjs" runtime-workspace init --workspace /srv/grant-operations/private/runtime-workspace
node "$GRANT_TOOLKIT/cli.mjs" runtime-workspace attach --workspace /srv/grant-operations/private/runtime-workspace --runtime "$GRANT_RUNTIME" --label "Grant Operations"
node "$GRANT_TOOLKIT/cli.mjs" runtime-workspace serve --workspace /srv/grant-operations/private/runtime-workspace --port 8465
~~~

In Applications, select **Grant planning and delivery** and the attached runtime. Enter the private grant workspace, the actual Python executable and, only when initializing an empty workspace, an optional original scenario file. Review the prepared source and path selection, save the application, review its start, start it and open the actual verified grant listener.

The existing Application binds the workspace, scenario, Python, installed source and native launch identity. Its start reader verifies the original managed-launch.json and authenticated listener. Select the same explicit application port when reopening browser drafts or pending browser requests: browser storage is scoped to the origin, including that port.

Stop the application through its original lifecycle before opening that workspace with a headless CLI. The workspace lock belongs to its original server or CLI owner. A Merchant MCP client can borrow an already running managed service; it does not open a competing SQLite writer. See [Applications](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/APPLICATIONS.md).

## 3. Establish and review the planning baseline

An empty workspace opens the original source scenario. Review that scenario and its source reference before using it as your own delivery plan. Import the agreed scenario or complete original planning ZIP when one already exists. Preserve the actual source URL and note; a normal plan edit keeps the original source.

~~~sh
grant list --workspace "$GRANT_DATA"
grant show --workspace "$GRANT_DATA" --plan PLAN_ID
grant history --workspace "$GRANT_DATA" --plan PLAN_ID
grant import-scenario --workspace "$GRANT_DATA" --file /absolute/inputs/scenario.json --name "Agreed delivery plan" --note "Original agreed scope and assumptions" --request-id ORIGINAL_SCENARIO_REQUEST --source-url ORIGINAL_SOURCE_URL
~~~

Use the returned plan ID and current revision. Review requested funds, milestone timing, costs, contributor hours, rates or fixed-price assumptions, payment timing and available capital together. A desired work-package list is the complete desired list: unlisted rows can be removed by the original patch semantics. Read the [planning CLI contract](../../stellar/scf_2026/sf47_budget_model/workspace/CLI.md) before preparing a partial update.

The browser supports editable alternatives, estimate comparison, saved revisions, cloning and restoration. The headless equivalent first exports the exact planning object, then estimates and saves the same reviewed input:

~~~sh
grant show --workspace "$GRANT_DATA" --plan PLAN_ID --revision REVISION --part planning --output /absolute/working/planning.json
grant estimate --workspace "$GRANT_DATA" --plan PLAN_ID --expected-revision REVISION --patch /absolute/working/scenario-patch.json --planning /absolute/working/planning.json --output /absolute/working/estimate.json
grant save --workspace "$GRANT_DATA" --plan PLAN_ID --expected-revision REVISION --patch /absolute/working/scenario-patch.json --planning /absolute/working/planning.json --note "Reviewed scope, staffing and payment timing" --request-id ORIGINAL_PLAN_SAVE_REQUEST
~~~

Keep a named baseline and clone it for alternatives. Restoring an earlier revision creates a new current revision while retaining the intervening history. A stale revision requires a fresh review of the current source. A lost save response requires the same request ID and exact original payload.

## 4. Open delivery operations from the exact revision

Create the operating case from the selected plan ID, revision and content SHA returned by the original workspace:

~~~sh
grant operations --workspace "$GRANT_DATA" create --plan PLAN_ID --selected-revision REVISION --expected-content-sha256 PLAN_CONTENT_SHA256 --name "Grant delivery" --mode OPERATIONS --actor "Recording operator" --request-id ORIGINAL_CASE_REQUEST
~~~

OPERATIONS holds actual source-backed work. WALKTHROUGH is the native labeled mode for an illustrative scenario. Preserve that distinction when receiving an existing case.

Follow the same case through the browser's Delivery operations controls:

1. Record contributors and the agreed work, scope and acceptance evidence. Submit and review work through its original states.
2. Retain invoices and their source bytes. Review, dispute or reopen them with the named operator and reason.
3. Record observed cash from its original payment or statement source. Allocate actual receipts or payments against the selected invoices; inspect partial allocations, refunds and remaining balances.
4. Record deployments with the accountable operator, role, environment, participant class and actual lifecycle. Keep source work-package links and the receiver/date for a handed-over deployment.
5. Attach original grant correspondence and record the actual stage. Submission, award agreement and received funding remain distinct events.
6. Freeze a review when it is ready to be handed to another operator. Reopening work preserves the old review.

Atomic asset quantities remain exact native strings. A non-USD observation needs a separate explicit USD valuation for a USD cash report. An order state alone is insufficient evidence of cash receipt or refund. Use the original sources and report findings to resolve the difference.

The [Operations guide](../../stellar/scf_2026/sf47_budget_model/workspace/OPERATIONS.md) and [API](../../stellar/scf_2026/sf47_budget_model/workspace/OPERATIONS-API.md) describe complete record fields and actions. The original command interface accepts the complete native data object:

~~~sh
grant operations --workspace "$GRANT_DATA" show --case CASE_ID --output /absolute/working/case.json
grant operations --workspace "$GRANT_DATA" report --case CASE_ID --output /absolute/working/report.json
grant operations --workspace "$GRANT_DATA" command --case CASE_ID --expected-version CASE_VERSION --action work.save --data /absolute/working/work.json --actor "Recording operator" --note "Actual work and source" --request-id ORIGINAL_WORK_REQUEST
~~~

Source-intake packets use the original [Workshare intake](../../stellar/scf_2026/sf47_budget_model/workspace/WORKSHARE_INTAKE.md) and native source-intake workflow. Inspect their full actual scope before import; a quoted workshare does not become paid cash through intake.

## 5. Forecast cash and allocate the whole remaining workload

Open the same case's Forecast view. Select the actual opening-cash basis and review existing obligations, paid invoice allocations, grant conditions and customer commercial assumptions. The original forecast keeps planning costs, committed obligations and conditional commercial receipts distinguishable.

Save the complete input only after inspecting its dated curves, remaining-work rows, cash deficit, invoice obligations and findings:

~~~sh
grant operations --workspace "$GRANT_DATA" forecast-preview --case CASE_ID --expected-version CASE_VERSION --inputs /absolute/working/forecast-inputs.json --output /absolute/working/forecast-preview.json
grant operations --workspace "$GRANT_DATA" forecast-save --case CASE_ID --expected-version CASE_VERSION --inputs /absolute/working/forecast-inputs.json --expected-preview-sha256 PREVIEW_SHA256 --actor "Recording operator" --request-id ORIGINAL_FORECAST_REQUEST
~~~

The saved forecast retains its source snapshot and exact input. A changed case does not rewrite that old forecast; it changes the native current-source comparison.

From that saved forecast, open Portfolio and seed the complete remaining task set. Enter real resource availability, working weekdays, dated exceptions, effort and dependencies. Review every alternative's allocation, unfinished work, lateness and resulting cash assumptions. Saving an incomplete alternative preserves its findings; selecting dates for a new forecast requires an original READY alternative.

The selection returns an editable native forecast input. Carry that exact object into a new forecast preview, then save its reviewed result. Keep the original portfolio and first forecast intact. The source field is taskId; selection does not create unrelated work rows.

### Preserve event-dependent timing

When a quoted project starts only after a real trigger, use the native EVENT_DEPENDENT timing object. Its work dates and receipt dates can remain unentered. The full cost, hours and scope still remain visible outside the dated cash and capacity curves.

The reviewedReleaseDate is the original reviewed commercial trigger. A later resource allocation can defer the work start without resetting that contractual clock. The original calendar counts the quoted delivery business days from the reviewed release, including an earlier release before the visible planning horizon. The delivery window is a deadline; it is not a minimum effort duration.

Record each receipt condition separately. A quoted kickoff milestone does not acquire an actual cash date until the source establishes it. Subsequent Portfolio selections and forecast seeds retain the original reviewed release and derive the due date from it. See [Forecast](../../stellar/scf_2026/sf47_budget_model/workspace/FORECAST.md) and [Portfolio](../../stellar/scf_2026/sf47_budget_model/workspace/PORTFOLIO.md) for the native input and calendar semantics.

## 6. Receive actual buyer and merchant-support work

### Buyer observations

Use the existing original SF88 Inbox and its retained response closure. Export the selected native observation once, retaining the intent IDs and exact result files:

~~~sh
node /absolute/installed/source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/operations-handoff/cli.mjs export --inbox /absolute/original-inbox --intent ORIGINAL_INTENT --output /absolute/working/buyer-operations.json
node /absolute/installed/source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli/operations-handoff/cli.mjs inspect --file /absolute/working/buyer-operations.json
grant operations --workspace "$GRANT_DATA" buyer-preview --case CASE_ID --expected-version CASE_VERSION --file /absolute/working/buyer-operations.json --output /absolute/working/buyer-preview.json
~~~

A public result-only archive does not establish the complete Inbox source required by that exporter. For a received original handoff, use its unchanged bytes directly.

In Buyer receiving, review the full source and choose the association for each selected job. The selections JSON is an array of 1–100 explicit objects containing the original jobId and a selected purchaseId or null for a new native purchase record. The separate unpaid Node path requires null and creates no purchase. Preserve existing purchase, merchant-order and deployment observations that the handoff itself does not establish.

~~~sh
grant operations --workspace "$GRANT_DATA" buyer-receive --case CASE_ID --expected-version CASE_VERSION --file /absolute/working/buyer-operations.json --expected-preview-sha256 PREVIEW_SHA256 --selections /absolute/working/buyer-selections.json --deployment DEPLOYMENT_ID --actor "Receiving operator" --note "Original buyer observation and reviewed association" --request-id ORIGINAL_BUYER_RECEIVING_REQUEST
~~~

For a new deployment, use --deployment-file with complete original BUYER or BOTH fields instead of --deployment. Read the [Buyer Operations contract](../../stellar/scf_2026/sf47_budget_model/workspace/BUYER_OPERATIONS.md).

A historical source replay keeps its original observation time and association. It must not overwrite a newer observation as though it were current. An OVER_LIMIT verification finding describes that bounded observation, and does not by itself mean the saved result was lost. Receipt, settlement, delivered output and merchant order remain separately inspectable.

### Original Node accounting carrier

The same Buyer receiving entry accepts an existing `Operation_Accounting.json` with schema `stellar-forge.node-operation-accounting-export.v1`. Use its exact original bytes in `buyer-preview` and then the unchanged `buyer-receive` command. The original validator retains the producing attempt, checkout evidence, command/context identity and saved accounting result; this operation does not start a buyer, reopen a signer or query a provider.

For `UNPAID_RESPONSE / NO_PAYMENT_REQUIRED`, choose the actual deployment and a selection with `purchaseId:null`. The result is an immutable operational source observation with no payment asset, amount, reservation or purchase. Its HTTP status is separate from response-file coverage: this carrier embeds no response body. Existing paid outcomes keep original approved terms and saved SF36 finality; an accounting-only carrier preserves independently known Inbox output and settlement facts. A historical source keeps its actual times without moving the current purchase clock backward.

The original Node identity retains its deployment and any established purchase across source editions. Repeat the exact saved request after an uncertain reply. The page reopens each original source and its native review; the report shows these observations separately from financial and purchase totals. Complete case export/receive preserves their JSON/CSV projections, native source bytes, accepted event bindings and frozen review copies. The installed receiver revalidates the original carrier before import. See the [complete Node source, CLI, MCP and receiving contract](../../stellar/scf_2026/sf47_budget_model/workspace/BUYER_OPERATIONS.md#receive-an-original-node-accounting-export).

### Merchant Support

Select an original SF74 portable handoff. Its exact filename and full bytes are inputs to the native preview. Choose an existing deployment or enter the complete reviewed new deployment fields.

~~~sh
grant operations --workspace "$GRANT_DATA" support-preview --case CASE_ID --expected-version CASE_VERSION --file /absolute/working/merchant-support.json --output /absolute/working/support-preview.json
grant operations --workspace "$GRANT_DATA" support-receive --case CASE_ID --expected-version CASE_VERSION --file /absolute/working/merchant-support.json --expected-preview-sha256 PREVIEW_SHA256 --deployment DEPLOYMENT_ID --actor "Receiving operator" --note "Original merchant support and deployment" --request-id ORIGINAL_SUPPORT_REQUEST
~~~

The original reader validates the support/workspace source, creates its receiving-time report and retains both raw handoff and rendered result with the deployment association. An existing deployment keeps its accountable operator and business fields. A new deployment uses --deployment-file; generated IDs, sourceIds, recordedBy and version remain native fields.

A preview binds the case version, original filename and bytes, installed reader and factual review. Recalculate it after a source or version conflict. Recover a lost receiving response with the identical original request. See [Support delivery](../../stellar/scf_2026/sf47_budget_model/workspace/SUPPORT_DELIVERY.md).

Both handoff inputs retain their native 8 MiB file bound. The case's aggregate source limit is 24 MiB and 200 attachments. Choose an appropriate original capture period or original product split when necessary; preserve full selected files.


### Commission and hand over the complete customer installation

Open **Customer installations** in the same operating case. Choose **New installation** to start from its pinned plan's original funded work packages and measurable criteria. The desk carries the whole customer assignment: commissioning payer and original terms, useful request and complete output, source population and change procedure, selected merchant and buyer deployments, payment design, aggregate spending, receiving application and ongoing maintenance.

Select the original commissioning attachment and retained source files. State whether the source is a snapshot, live or mixed; describe its keys, types, units, time meaning and rights. Enter the exact network, asset, recipient, atomic unit price and expected priced units. The review computes the aggregate task amount in the entered asset. Retain the buyer's actual spending authority and facilitator choices with that same assignment.

Name the receiving application, host and accountable operator. Complete the output acceptance rule, second-operator change or withdrawal procedure, recovery and maintenance destination. Assign the original funded work packages and the separate commercial reference. Each acceptance step can select the original work, purchase, outcome and source records; an accepted step records its actual observing operator, time and result.

Choose **Review complete installation**, read the configuration decisions, work/funding report, source references and purchase amounts, then enter a save reason and **Save reviewed edition**. The original case transaction appends one immutable installation edition, case event and request receipt. Planning and commissioning editions may retain open decisions; their stage and accepted-step count remain separately visible.

Use the original CLI against the same retained workspace:

~~~sh
grant operations --workspace "$GRANT_DATA" installation-seed --case CASE_ID --expected-version CASE_VERSION --output /absolute/working/installation-seed.json
grant operations --workspace "$GRANT_DATA" installation-preview --case CASE_ID --expected-version CASE_VERSION --expected-revision 0 --document /absolute/working/installation-input.json --output /absolute/working/installation-preview.json
grant operations --workspace "$GRANT_DATA" installation-save --case CASE_ID --expected-version CASE_VERSION --expected-revision 0 --document /absolute/working/installation-input.json --expected-preview-sha256 PREVIEW_SHA256 --actor "Recording operator" --request-id ORIGINAL_INSTALLATION_SAVE --note "Complete commissioning and receiving assignment"
grant operations --workspace "$GRANT_DATA" installation-show --case CASE_ID --installation INSTALLATION_ID --revision SAVED_REVISION
grant operations --workspace "$GRANT_DATA" installation-history --case CASE_ID --installation INSTALLATION_ID --limit 25
grant operations --workspace "$GRANT_DATA" installation-export --case CASE_ID --installation INSTALLATION_ID --revision SAVED_REVISION --output /absolute/delivery/complete-installation.zip
~~~

The seed response wraps the complete **document** object. Save and edit that object as installation-input.json. A new installation uses expected revision zero and omits its ID. To revise an existing installation, supply its original --installation ID and current --expected-revision to both preview and save. Retain the current case version and exact reviewed document. The [Installation guide](../../stellar/scf_2026/sf47_budget_model/workspace/INSTALLATIONS.md) supplies the complete fields and receiving command.

A later edition keeps earlier editions readable. **Export complete handover** includes the selected original edition, readable installation.html, installation-selection.json and the complete operating case with all editions, original attachments, planner history and case history. Import that ZIP through **Import complete case** or the original operations import command; the receiver opens the selected installation edition. The receiving case gets its own native destination ID while retaining the original installation, source and review lineage.

The six typed Merchant calls—merchant_grant_installations, merchant_grant_installation, merchant_grant_installation_history, merchant_grant_installation_seed, merchant_grant_installation_preview and merchant_grant_installation_save—operate this same service. Use merchant_grant_export with kind installation and the saved revision for the complete selected handover. Continue large responses through the existing exact snapshot, byte and row paging operations.

The selected product includes both matching managed-launch readers and the complete original runtime files they bind, including the Installation and implementation-evidence modules. After adopting a new source edition, review and reopen the managed application, then continue its original case and saved request identities.


### Review original implementation evidence

Open **Implementation evidence** in the same operating case. Attach the complete original commissioning JSON, merchant workspace or Merchant Support handoff through the existing Sources intake. Select it by its actual filename, byte count and SHA-256, then **Read original implementation**. The installed SF74 producer supplies the original tasks, measurements, receiving records, comparisons and readable report.

Enter the observation cutoff as canonical UTC with milliseconds, such as `2026-10-12T12:00:00.000Z`. Both an observation's effective time and recorded time must fall at or before that cutoff. The source retains its complete current task and workorder definitions and later history; the review labels those definitions explicitly.

**Original files** contains the complete source-bundle inventory, including earlier editions and files without a task assignment. Embedded bytes are already retained. Attach each missing external original through Sources, then select the exact SHA-256 and byte-count match. The draft records these bindings as `originalFileRefs:[{sha256,sourceId}]`. Identical bytes can share a retained source while each original manifest path remains visible. A missing original stays an explicit finding. A complete evidence export requires the frozen review itself to contain every required binding; adding an attachment later does not rewrite an earlier review.

Inspect **Tasks**, **Receiving** and **Measurements**, open the complete original observations, and select **Use evidence** or **Keep as context**. Associate the actual existing deployment, work, purchase and outcome records and enter the reason for each link. Choose any applicable saved Installation editions by their exact ID, revision and SHA. The selection can contain up to 200 distinct observations and 20 Installation editions.

Technical receiving, customer receiving, task completion and measured outcomes keep the producer's separate meanings. A purchase link records the entered association. It does not establish settlement, approval of work, customer acceptance or an issuer decision. Negative and changes-required observations remain useful evidence of what occurred.

Choose **Preview selected evidence**, read the full findings and current-link snapshots, then **Freeze evidence review**. The original transaction retains the current case version, exact inputs, preview SHA, operator, note and request ID. A review can be saved with findings; its later use in Completion evaluates those findings and the current source again.

The same workflow is available through the installed CLI:

~~~sh
grant operations --workspace "$GRANT_DATA" implementation-source --case CASE_ID --source SOURCE_ID --as-of 2026-10-12T12:00:00.000Z --expected-version CASE_VERSION --output /absolute/working/implementation-source.json
grant operations --workspace "$GRANT_DATA" implementation-preview --case CASE_ID --expected-version CASE_VERSION --inputs /absolute/working/implementation-inputs.json --output /absolute/working/implementation-preview.json
grant operations --workspace "$GRANT_DATA" implementation-prepare --case CASE_ID --expected-version CASE_VERSION --inputs /absolute/working/implementation-inputs.json --expected-preview-sha256 PREVIEW_SHA256 --actor "Reviewing operator" --note "Original implementation observations and explicit case associations" --request-id ORIGINAL_IMPLEMENTATION_REQUEST
grant operations --workspace "$GRANT_DATA" implementation-export --case CASE_ID --review REVIEW_ID --output /absolute/delivery/implementation-evidence.zip
grant operations --workspace "$GRANT_DATA" implementation-original --case CASE_ID --source SOURCE_ID --sha256 ORIGINAL_FILE_SHA256 --output /absolute/delivery/original-file
~~~

Use the source response's initial review inputs as the entered input object and retain its exact `sourceId`, `sourceSha256` and `asOfAt`. Its selections identify the original observation `kind` and `id`, `use`, explicit link arrays and note. Preserve native IDs from the original source and existing case. Read the current case version after each committed mutation.

An interrupted freeze continues through **Continue original freeze** or the identical CLI request. **Read back accepted review** retrieves the first committed result. A case-version conflict preserves the draft and source; explicitly adopt the current version and preview the reconciled draft. An already frozen review remains immutable. **Use as new draft** provides the deliberate successor workflow.

**Download complete evidence** includes the full review and inputs, original producer report, every source-bundle manifest and original file, linked source attachments, CSV tables and the exact member manifest. The source attachment bound is 8 MiB, the native projection bound is 16 MiB, and an individual frozen review has an 8 MiB bound. The complete evidence ZIP and its expanded selected members retain the original 32 MiB bound. An over-limit or incomplete export retains its actual error and original files.

Keep the installed producer and reader identity with each frozen review. A new case import, current Completion use and review export re-run the original inspector over the retained bytes and cutoff, then compare its complete projection and reader fingerprints. A reader mismatch requires the original published reader edition to verify that historical review. An already committed identical import recovers its original request before requiring a current reader. The complete operating case retains these reviews, source files and history.

## 7. Measure a cohort and prepare completion

### Freeze the actual measurement population

Open Cohort acceptance in the same case. Its proposed targets come from the pinned scenario's deployment_acceptance_plan. Select the tranche, exact source population and UTC cutoff. The original proposal uses a seven-date window for tranche 2 and fourteen dates for tranche 3; a case lacking that original rule remains visibly unconfigured.

Review accountable operators, useful operations, facilitator independence, intended purchases, first-attempt membership, actual settlement and output completion, repeat use, fees, exact asset quantities, deployed recovery outcomes and source coverage. Team-operated systems remain classified accordingly. Multiple technical hosts do not establish multiple independent operators. Duplicate transaction proofs and partial source coverage remain visible findings.

The cutoff and original completion times determine measurement membership. A late output is not moved back into an earlier window. The deployed-recovery observation window and its source-defined proposed deadline remain separate from the purchase cohort window. Actual award dates, customer acceptance and refunds require their own original records.

~~~sh
grant operations --workspace "$GRANT_DATA" cohort-seed --case CASE_ID --expected-version CASE_VERSION --tranche 2 --output /absolute/working/cohort-seed.json
grant operations --workspace "$GRANT_DATA" cohort-preview --case CASE_ID --expected-version CASE_VERSION --inputs /absolute/working/cohort-inputs.json --output /absolute/working/cohort-preview.json
grant operations --workspace "$GRANT_DATA" cohort-prepare --case CASE_ID --expected-version CASE_VERSION --inputs /absolute/working/cohort-inputs.json --expected-preview-sha256 PREVIEW_SHA256 --actor "Reviewing operator" --request-id ORIGINAL_COHORT_REQUEST
grant operations --workspace "$GRANT_DATA" cohort-export --case CASE_ID --review REVIEW_ID --output /absolute/delivery/cohort-evidence.zip
~~~

The seed response wraps an inputs object. Save that complete object as the --inputs file, not the surrounding response envelope. Freeze can retain an unmet result with its findings. The immutable review and exported ZIP include the exact sources, measurements, histories, CSVs and manifest. Frozen reviews expose current-source comparison and can seed a new reviewed draft.

After an uncertain freeze, continue its original request. After an accepted write with interrupted readback, read the same saved review. The [Cohort guide](../../stellar/scf_2026/sf47_budget_model/workspace/OPERATIONS-COHORT.md) gives the complete denominators, source requirements and export structure.

### Complete the original tranche lifecycle

Open Tranche completion. The original recorded previous payment and any issuer-confirmed extension govern its completion clock. Proposal phase dates, forecast work allocations and cohort cutoff dates do not substitute for those records.

Seed the assignments for the selected tranche. Retain owners, the original work-package IDs, work dates, completed work, deployments, source IDs and explanatory notes. Preview against the actual payment-derived calendar and save the reviewed assignments.

Prepare the original completion files with its native data object. Optionally select exact frozen cohortReviewIds and implementationReviewIds. The original preview checks the cohort's tranche, cutoff, measurement source and proposed-target findings; implementation evidence also verifies the original producer, complete files, saved Installation editions, current links and retained findings. Select up to 20 distinct implementation reviews in the intended order. The two optional fields compose, and requests that omit them retain their earlier input semantics. Preparation retains the chosen evidence; it does not submit an issuer form.

~~~sh
grant operations --workspace "$GRANT_DATA" completion-calendar --case CASE_ID --as-of YYYY-MM-DD --output /absolute/working/completion-calendar.json
grant operations --workspace "$GRANT_DATA" completion-seed --case CASE_ID --tranche 1 --expected-version CASE_VERSION --output /absolute/working/completion-seed.json
grant operations --workspace "$GRANT_DATA" completion-save --case CASE_ID --expected-version CASE_VERSION --inputs /absolute/working/completion-inputs.json --actor "Recording operator" --request-id ORIGINAL_COMPLETION_SAVE
grant operations --workspace "$GRANT_DATA" completion-preview --case CASE_ID --expected-version CASE_VERSION --data /absolute/working/completion-preview-input.json --output /absolute/working/completion-preview.json
grant operations --workspace "$GRANT_DATA" completion-prepare --case CASE_ID --expected-version CASE_VERSION --data /absolute/working/completion-prepare-input.json --actor "Reviewing operator" --request-id ORIGINAL_COMPLETION_PREPARE
grant operations --workspace "$GRANT_DATA" completion-export --case CASE_ID --review REVIEW_ID --output /absolute/delivery/prepared-completion.zip
~~~

Read current case versions after each committed mutation. Completion's prepare data is its original action object; it is not interchangeable with the assignment seed or cohort input. Record actual submission, issuer decision and received funding through their original controls and source receipts. See [Completion](../../stellar/scf_2026/sf47_budget_model/workspace/COMPLETION.md).

## 8. Continue through the same Merchant MCP service

The mcp runtime profile exposes the existing typed client and Merchant provider. Configure only host-declared workspace aliases and private input files. Keep the connection JSON mode 0600 and private directories owned by the receiving operator.

~~~json
{
  "schema": "stellar-forge.sf47-workspace-connection.v1",
  "workspaces": {
    "grant": {
      "label": "Grant delivery",
      "directory": "./grant",
      "pythonExecutable": "/usr/bin/python3",
      "allowStart": true,
      "inputs": {
        "received-case": {
          "file": "./inputs/complete-operating-case.zip",
          "kind": "case",
          "mediaType": "application/zip",
          "sha256": "EXACT_ORIGINAL_FILE_SHA256"
        }
      }
    },
    "receiving": {
      "label": "Received operating cases",
      "directory": "./receiving",
      "pythonExecutable": "/usr/bin/python3",
      "allowStart": true
    }
  }
}
~~~

Replace the hash with the original actual SHA-256 and resolve paths relative to the connection file. The example is a configuration shape. Declare only the aliases and startup authority intended for that host.

~~~sh
node "$GRANT_TOOLKIT/runtime-install-cli.mjs" run --dir "$GRANT_RUNTIME" -- merchant-mcp init-grant-workspaces --dir /srv/grant-operations/private/merchant --connection /srv/grant-operations/private/grant-connection.json
node "$GRANT_TOOLKIT/runtime-install-cli.mjs" run --dir "$GRANT_RUNTIME" -- merchant-mcp-stdio --config /srv/grant-operations/private/merchant/merchant-mcp.json
~~~

An existing Merchant configuration can add grantWorkspaceConnection with that same absolute connection path. The original [Merchant Grant guide](../../stellar-forge/mcp-merchant-operator/GRANT_WORKSPACES.md) and [typed client guide](../../stellar/scf_2026/sf47_budget_model/workspace/AGENT.md) describe the current complete tool catalog.

Start with merchant_grant_workspaces and inspect the selected source hash. Open the exact alias with its expectedSelectionSha256, then read plans or cases and their native current versions. Use original preview/save pairs for forecasts, portfolios, buyer and support receiving, customer installations, implementation evidence, cohort preparation and completion. Each deliberate mutation has its own stable request ID and exact reviewed payload.

Successful responses retain the full original bytes, size, SHA and launch/source identity. Compact arrays refer to explicit original JSON pointers. Use merchant_grant_rows for array pages and native history cursors for further history responses. A large row remains available in the complete source file.

For source-based inputs, verify the whole retained file's SHA before using an optional inputPointer. The pointer selects the original object after verification; it does not replace the whole-file identity. Buyer and Support consume the complete handoff bytes and filename. Implementation source inspection reads the selected original case attachment. Use merchant_grant_implementation_source, merchant_grant_implementation_preview and merchant_grant_implementation_prepare for the same source, preview and immutable review; merchant_grant_export supports implementation and implementation-original. Preserve the exact preview, original request ID and native case version.

Use merchant_grant_file_read with the exact snapshot/SHA and returned offsets for full binary or JSON downloads. Receive larger files through the original begin/chunk/status/commit transfer path, then explicitly import the completed transfer. A successful transfer alone does not change a plan or operating case.

Closing a borrowed Application connection leaves its owning Application running. Closing an MCP-started service drains that original service and releases its workspace lock. The next deliberate open reuses the same saved workspace and a new native launch.

## 9. Export, receive and reopen the complete work

Choose the native export matching the intended scope:

| Export | Scope |
| --- | --- |
| Plan ZIP | Selected immutable planning revision, scenario, reports, full plan history and manifest. |
| Planning collection ZIP | All native planning packages; it is not the operating-case export. |
| Forecast or Portfolio ZIP | Exact selected input, source, calculation and readable/CSV result. |
| Implementation evidence ZIP | Exact immutable review and producer report, source-bundle manifests, complete original files, selected source attachments, linked snapshots, CSVs and manifest. |
| Cohort or Completion ZIP | The selected frozen review/preparation and all included original evidence. |
| Customer installation ZIP | The exact selected immutable edition and readable handover, plus the whole operating case, all installation editions, sources and history. |
| Complete operating-case ZIP | Pinned planning package, case records and sources, full history, forecasts, portfolios, installation editions, implementation evidence, cohort/completion work and reviews. |

For a whole delivery, export the complete operating case after reading its current version. Preserve the exact output bytes and import them through the original receiving workspace:

~~~sh
grant operations --workspace "$GRANT_DATA" export --case CASE_ID --expected-version CURRENT_CASE_VERSION --output /absolute/delivery/complete-operating-case.zip
grant operations --workspace "$GRANT_RECEIVING" import --file /absolute/delivery/complete-operating-case.zip --name "Received grant delivery" --actor "Receiving operator" --request-id ORIGINAL_COMPLETE_CASE_IMPORT
grant serve --workspace "$GRANT_RECEIVING" --port 8468
~~~

The importer validates the whole archive before creating its retained plan/case records. Receiving plan and case IDs are native destination identities; original source, purchase, deployment, review and history lineage remain inspectable. Repeating the same import request recovers its original result. Existing export filenames remain preserved; inspect them or choose a new name for a genuinely new export.

A planning-only handoff uses export/import-bundle, or export-all/import-all for the full plan collection. The original per-plan/operating-case ZIP limit is 32 MiB; the full planning collection has its separate 128 MiB bound. Refer to the installed CLI for its actual format and limits.

Runtime transfer and business export have different purposes. Use the maintained [runtime transfer](../../stellar/scf-starforge-20261009/distribution/RUNTIME_TRANSFER.md) for the selected installed source and dependencies. Transfer private operating cases through their existing authorized receiving destination. The public selected source archive contains no customer's private workspace, invoice, credential or paid response.

## 10. Recovery in the original operation

| Observed condition | Continue |
| --- | --- |
| Build interrupted | Inspect its existing output and resume with its original commit and grant-operations selection. |
| Installation incomplete | Inspect/resume the same prepared runtime; retain its original package, profile and lock. |
| Workspace already open | Use the existing server or stop its original owner before a headless command. |
| Lost save/import/receive response | Reuse the exact original request ID, version and payload to recover the native receipt. |
| Request ID conflicts | Read the original request; keep its existing meaning. A deliberate changed action needs a new ID. |
| Stale plan/case or changed preview | Read current source, reconcile the concurrent work, then preview the intended change again. |
| Snapshot retention failed after a known response | Restore storage and retain the same native result through its original read or exact request. |
| Native outcome uncertain | Inspect the original records/request before continuing. A timeout is not proof of nonexecution. |
| File read expired | Reopen the same snapshot and SHA at the required byte offset. |
| Transfer incomplete | Resume only missing original offsets, then commit the same declared file. |
| Browser or managed process restarted | Reopen the same workspace and explicit port; recover the saved request and verify the new actual launch. |
| Implementation reader differs from a frozen review | Keep the original source and review; select its published reader edition for new import, current Completion use or evidence export. |
| Required source-bundle original is unavailable | Attach the actual complete file and create a newly reviewed draft with its exact binding; preserve the earlier frozen review and its findings. |
| Source selection changed | Review the intended scenario, Python and installed source edition against the retained host binding. |

Keep the request files, selected inputs, exact source hashes and original result receipts. An error or incomplete report remains part of its actual history. Original applications, client APIs and immutable exports provide the recovery seams; no replacement business store is required.

## 11. Complete installed receiving and handover

The release owner runs the original receiving workflow against the exact installed source, selected runtime profile and actual authorized input case. Reuse an accepted result when its exact source/input scope already covers a step. An archive or source publication alone is not a native receiving result.

For the full buyer/cohort continuation, use the maintained [Buyer receiving journey](../../stellar/scf_2026/sf47_budget_model/workspace/BUYER_RECEIVING_JOURNEY.md), its buyer-receiving-runtime.json and original buyer-operations-receiving.mjs. Its private configuration can enable cohortReceiving and the source owner's implementationReceiving phase. That phase consumes the actual complete implementation carrier, external originals and explicit observation IDs in the same original case, browser and agent continuation. Only the original receiving owner selects a new complete configuration before dispatch or through its supported continuation; retain any already-started configuration and operation. The complete original Inbox and operating-case inputs remain with their existing owner. Preserve the selected manifest's explicit Git blobs and the receiving helper's current provider binding; update those through the original source owner when integrating an intentional new provider edition.

One completed installed handover should establish:

1. The exact archive/source-selection manifest, resolved profile and actual READY inspection.
2. Managed Review/Save/Start/Open on the selected private workspace, plus Stop and reopen of its retained state.
3. A reviewed planning alternative and a case pinned to the chosen revision, with the original baseline preserved.
4. Contributor/invoice/cash work and its source-linked report; actual and conditional values remain distinguishable.
5. A saved forecast, full Portfolio allocation and selected forecast with the original commercial release clock preserved.
6. Original buyer and support handoff preview/receive/readback, including an exact same-request recovery and preserved peer records.
7. A complete customer installation through original source/commissioning, payment and aggregate budget, funded assignment, receiving/maintenance, reviewed immutable editions and selected-edition receiving; then a reviewed original implementation source with all required files, unchanged underlying case facts and saved evidence, the actual cohort result and deliberate Completion evidence selection.
8. Full CLI and Merchant client reads, original row/byte pages and exact downloaded source identities.
9. Complete case export, original import into the receiving workspace, reopened history/source/review checks and closed owned services.

Retain the actual case and plan IDs, versions, original operation/request IDs, source/preview/measurement hashes, export paths and digests, reviewed findings and final receiving outputs. Record any unfinished step explicitly. Preserve prior attempts and their actual outcomes beside the successful continuation.

The delivered set consists of the selected TGZ and manifest, installation/profile receipts, this guide and original source/API guides, the complete authorized case export, any separately requested frozen evidence, and the actual installed receiving report. Its report distinguishes prepared source, executed native work, buyer payment observations, issuer submission and customer acceptance.

## Original source references

| Area | Maintained source |
| --- | --- |
| Recipe | [grant-operations.json](../../stellar/scf-starforge-20261009/distribution/selections/grant-operations.json) |
| Builder and immutable source | [source selection](../../stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md), [build](../../stellar/scf-starforge-20261009/distribution/BUILDING.md), [Git object receiving](../../stellar/scf-starforge-20261009/distribution/GIT_OBJECT_RECEIVING.md) |
| Planning | [workspace](../../stellar/scf_2026/sf47_budget_model/workspace/README.md), [CLI](../../stellar/scf_2026/sf47_budget_model/workspace/CLI.md) |
| Delivery, API and intake | [Operations](../../stellar/scf_2026/sf47_budget_model/workspace/OPERATIONS.md), [API](../../stellar/scf_2026/sf47_budget_model/workspace/OPERATIONS-API.md), [Workshare intake](../../stellar/scf_2026/sf47_budget_model/workspace/WORKSHARE_INTAKE.md) |
| Resource and cash assumptions | [Forecast](../../stellar/scf_2026/sf47_budget_model/workspace/FORECAST.md), [Portfolio](../../stellar/scf_2026/sf47_budget_model/workspace/PORTFOLIO.md) |
| Customer installation | [Commissioning, editions and complete handover](../../stellar/scf_2026/sf47_budget_model/workspace/INSTALLATIONS.md) |
| Implementation source and receiving | [Complete implementation contract](../../stellar/scf_2026/sf47_budget_model/workspace/IMPLEMENTATION_EVIDENCE.md) |
| Native evidence | [Buyer](../../stellar/scf_2026/sf47_budget_model/workspace/BUYER_OPERATIONS.md), [Support](../../stellar/scf_2026/sf47_budget_model/workspace/SUPPORT_DELIVERY.md), [Cohort](../../stellar/scf_2026/sf47_budget_model/workspace/OPERATIONS-COHORT.md), [Completion](../../stellar/scf_2026/sf47_budget_model/workspace/COMPLETION.md) |
| Agent and installed lifecycle | [Grant client](../../stellar/scf_2026/sf47_budget_model/workspace/AGENT.md), [Merchant MCP](../../stellar-forge/mcp-merchant-operator/GRANT_WORKSPACES.md), [Applications](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/APPLICATIONS.md) |

The canonical manifest selects the actual edition of every source. This operating product has its own grant-operations selection; the separately maintained grant-reviewer product and its reviewer workflow retain their original ownership and selection.
