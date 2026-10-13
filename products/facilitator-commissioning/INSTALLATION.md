# Commission one complete service in the original Customer Installation

This product joins the complete two-facilitator commissioning job to the existing Grant Operations **Customer installations** workflow. The preparer receives the original native transfer, preserves every file, matches those files to actual case source records, and creates the native Installation input from the existing Workshare seed.

The existing Installation writer owns preview, saving, acceptance and case export. The existing commissioning operator owns service and provider decisions; SF82 and SF88 retain release, seller and buyer authority. Preparation keeps the actual workorder, funded assignments, original checks, Workshare, periods and coordination unchanged.

## The complete customer result

The customer receives the original useful service, its complete source edition, the entire request/page set and both selected independent facilitator records. The Installation links that actual work to the commissioned scope, responsible operators, agreed fees, funded work and acceptance criteria. Independent receiving carries the original job, every output and the complete operating case into its next authorized environment.

Use these existing surfaces together:

| Task | Maintained entry |
| --- | --- |
| Operate the original service and providers | facilitator-commissioning and its eight-screen operator |
| Customer agent access and complete downloads | facilitator-commissioning-customer |
| Prepare source-bound Installation input | facilitator-installation |
| Browse the complete Installation profiles | starforge grant-installation-workorder profiles |
| Save and operate the existing Installation | SF47 Customer installations or original Operations CLI |
| Receive the complete Workshare and case | starforge grant-installation-receive and original native import |

The complete operating contracts are [the product guide](OPERATING.md) and [the customer-agent guide](CUSTOMER_AGENT.md). The original case/source preparation and complete receiving remain documented in the [Installation workorder guide](../../stellar/scf_2026/sf49_data_commissioning/installation-workorders/README.md).

## 1. Select the actual original work

Open the customer's existing Workshare and Grant Operations case. Retain the original case and plan IDs, current version, plan/source digests, commissioned phase owners, actual effort and fees, dependencies, receiving scope and source authority. Use the existing Installation draft when this work already has an Installation; the new-input preparer accepts a fresh planned seed.

Select the commissioning job by its original ID and selection SHA256. Its actual job includes:

- One original seller release, its source edition and route contracts.
- The complete customer scope, schema and acceptance files.
- Exactly two independently operated facilitator profiles, with distinct operator IDs and origins.
- Their original authority and supported-response files, reviewed/staged release records and selected native payment alternatives.
- Every agreed request, page, body and expected output.
- The existing commands/results, seller observations, buyer files, returned outcomes and unresolved work.

The profile uses those actual records. The original HPD case remains customer a3618289-2faa-4634-9ab6-f063995229ed and acquisition socrata-hpd-queens-paid-customer-1fb3-20261011, with its original 100+44-row paid pages. Its publisher population and paid customer selection retain their separate original meanings. Another customer supplies its own actual job and Workshare.

A named receiving host, customer operator and source-use authority come from the original case. Keep secrets in their existing private configuration. The Installation stores the usable configuration and source references.

## 2. Receive the complete original transfer

Export the selected original job through its existing owner. Use its complete native transfer directory, containing TRANSFER.json, job.json, selection.json and all declared folders. An operator TAR can first be received through the original portable receiver; retain its actual archive and source manifest identities.

Use a complete immutable exported source cut. An actively changing job directory is continued through its existing owner and exported before this preparation.

Record the actual SHA256 of the complete TRANSFER.json bytes. This is distinct from the complete TAR hash and from the job selection hash. Every preparation command requires that explicit original manifest SHA.

The installed command is:

~~~sh
facilitator-installation inputs \
  --transfer "$ORIGINAL_NATIVE_TRANSFER" \
  --expected-transfer-sha256 "$TRANSFER_SHA256" \
  --out "$PRIVATE_SOURCE_PREPARATION"
~~~

Create the parent private directory with mode 0700 first. Source, seed, case and binding files stay private. The selected output must be separate from the original transfer.

The command invokes the unchanged native transfer inspector, verifies the original job/selection hash, and receives every original member into commissioning-source/. It writes:

| File | Use |
| --- | --- |
| commissioning-source/TRANSFER.json | The complete unchanged native manifest |
| commissioning-source/* | Every complete original native source member |
| source-files.json | Exact source paths, bytes and SHA256 for case attachment |
| inputs/profile.json | The complete selected installed profile |
| PREPARATION_INTENT.json | Immutable original mode and input identities |
| INSTALLATION_PREPARATION.json | Complete retained output inventory |

Original members are copied one complete file at a time, checked against the retained manifest, and published privately through the maintained atomic file writer. The complete native inspector reopens the prepared source. Repeating an exact input reuses its original complete files. A different input or source edition uses another named preparation directory.

## 3. Attach the actual source to the same case

Use the current **Source preparation** or source-attachment workflow in the original Operations case to receive the complete files listed in source-files.json. Retain the original native attachment request/result for each file. The complete original job remains available in the preparation directory for independent source inspection.

The native attachment command used by the existing whole-case receiver is:

~~~sh
python3 workspace/cli.py operations --workspace "$SCF_WORKSPACE" \
  attach --case "$SCF_CASE" --expected-version "$CURRENT_CASE_VERSION" \
  --actor "$RECORDING_OPERATOR" --request-id "$ORIGINAL_ATTACH_REQUEST" \
  --file "$EXACT_ORIGINAL_FILE" --kind work \
  --media-type "$ACTUAL_MEDIA_TYPE" --source-url "$ORIGINAL_SOURCE_REFERENCE" \
  --observed-at "$ACTUAL_SOURCE_OBSERVATION_TIME" \
  --note "$ORIGINAL_ATTACHMENT_NOTE"
~~~

Each variable refers to a real source or original request. Read the current case after an attachment. Preserve an uncertain attachment's original UUID and reconcile it through the original request journal before another write.

Retain every listed member, including TRANSFER.json. Identical source bytes already attached to this case can be reused. The preparer matches the actual full byte count and SHA256; when several case records carry identical bytes it selects the lexically first source ID and retains every matching ID in its source mapping.

The original complete private transfer includes native buyer and operating configuration material. Use the case's existing authorized staff and private source custody. Customer-facing reports expose the source references and useful results; credentials remain in the original authorized private surfaces.

After attachments, read the full current case:

~~~sh
python3 workspace/cli.py operations --workspace "$SCF_WORKSPACE" \
  show --case "$SCF_CASE" > "$PRIVATE_OUTPUT/original-case.json"
chmod 600 "$PRIVATE_OUTPUT/original-case.json"
~~~

This original response contains program and the complete sources array. Keep its actual case version. Any later case change requires the corresponding current seed.

## 4. Receive the Workshare's planned Installation seed

Use the same original commercial packet and source records:

~~~sh
python3 workspace/cli.py operations --workspace "$SCF_WORKSPACE" \
  installation-workshare-seed \
  --case "$SCF_CASE" --expected-version "$CURRENT_CASE_VERSION" \
  --source "$COMMISSIONING_SOURCE" \
  --expected-source-sha256 "$COMMISSIONING_SHA256" \
  --packet-source "$PACKET_SOURCE" \
  --expected-packet-sha256 "$PACKET_SHA256" \
  --workshare-case "$COMMERCIAL_CASE" --expected-revision 0 \
  --output "$PRIVATE_OUTPUT/original-seed.json"
~~~

The original seed supplies its existing workorder, assignments, checks, Workshare, workflow periods and coordination. It remains PLANNED, with open checks and no manufactured work/purchase/outcome observations.

Prepare the actual service-bound template:

~~~sh
facilitator-installation template \
  --transfer "$ORIGINAL_NATIVE_TRANSFER" \
  --expected-transfer-sha256 "$TRANSFER_SHA256" \
  --seed "$PRIVATE_OUTPUT/original-seed.json" \
  --case "$PRIVATE_OUTPUT/original-case.json" \
  --out "$PRIVATE_BINDING_PREPARATION"
~~~

The output includes the whole original source, input files, bindings.json and source-mapping.json. Its basis records the actual case/version, plan/revision/digests, Workshare case, job/selection, release/source edition, request count and transfer identity. The source mapping lists every matched case source and any remaining exact attachment.

When an attachment is missing, use its precise source descriptor to finish the existing source intake, then read the new case and seed and create the corresponding new binding preparation. Earlier planned inputs retain their original case basis.

## 5. Complete actual deployment, authority and payment choices

Copy bindings.json into a private editable file. Preserve its original selection object and Workshare case. Review the actual choices:

| Binding | Original authority |
| --- | --- |
| merchantDeploymentId | The accountable merchant already recorded in this case |
| buyerDeploymentIds | The actual independent buyer deployments |
| source.authority | The customer's real source-use permission and scope |
| source.reference | The complete job/source/transfer reference already populated |
| receiving.host | The actual authorized receiving environment |
| receiving.operator | The responsible recipient, initially the job's selected receiver |
| payment network/asset/recipient | The original approved merchant/buyer selection |
| priceAtomic/taskUnits/taskBudgetAtomic | Actual approved integer unit price, useful unit count and whole-task budget |
| payment.facilitators | The exact two original operator IDs, configured URLs and matching source IDs |

The service-bound template fills both provider records from the complete original job. Changing either operator/endpoint or omitting its original authority source is rejected. Additional original case source references and reviewed notes remain available.

Keep exact native payment alternatives in their original provider reviews and buyer plans. A common Installation field does not replace per-provider terms or approve a different amount. Preserve the original single-task budget and actual distinct paid requests. Different prices, approved options or network selections require explicit customer review in their original writer.

Task purpose/name and the compact full-request reference are taken from the selected job. The complete individual requests and all request/output bytes remain in the original job and source attachments. This keeps the original native Installation fields readable without dropping requests from the full delivered source.

Prepare the full native input:

~~~sh
facilitator-installation prepare \
  --transfer "$ORIGINAL_NATIVE_TRANSFER" \
  --expected-transfer-sha256 "$TRANSFER_SHA256" \
  --seed "$PRIVATE_OUTPUT/original-seed.json" \
  --case "$PRIVATE_OUTPUT/original-case.json" \
  --bindings "$PRIVATE_OUTPUT/selected-bindings.json" \
  --out "$PRIVATE_INSTALLATION_PREPARATION"
~~~

Every declared transfer member must now match an actual case source. The command preserves the original funded and commercial assignment objects and every native acceptance check. It delegates the Installation document to the maintained prepareInstallation function.

Additional output:

| File | Meaning |
| --- | --- |
| installation-input.json | Complete original-native Installation document |
| installation-preview-input.json | Exact original preview envelope |
| WORKORDER.md | Full maintained readable operating workorder |
| installation-source-binding.json | Complete source/provider/request binding and actual mapped case records |
| preparation.json | Original preparation fields, full steps, inputs and remaining selections |
| bindings.json | The complete effective original customer choices |

The native 128 KiB document limit remains enforced. Full source stays in its original files instead of being truncated to fit the document. The completion receipt verifies the full source and all output files before publication.

## 6. Preview, save and operate the original Installation

Open Customer installations in the existing Operations application. Load the full input, inspect its source, both facilitator selections, original funding/work assignments and every acceptance criterion. The preview resolves actual source/deployment ownership under the existing case.

The native equivalents are:

~~~sh
python3 workspace/cli.py operations --workspace "$SCF_WORKSPACE" \
  installation-preview --case "$SCF_CASE" --expected-version "$CURRENT_CASE_VERSION" \
  --expected-revision 0 \
  --document "$PRIVATE_INSTALLATION_PREPARATION/installation-input.json" \
  --output "$PRIVATE_INSTALLATION_PREPARATION/native-preview.json"

python3 workspace/cli.py operations --workspace "$SCF_WORKSPACE" \
  installation-save --case "$SCF_CASE" --expected-version "$CURRENT_CASE_VERSION" \
  --expected-revision 0 \
  --document "$PRIVATE_INSTALLATION_PREPARATION/installation-input.json" \
  --expected-preview-sha256 "$NATIVE_PREVIEW_SHA256" \
  --actor "$RECORDING_OPERATOR" --request-id "$ORIGINAL_SAVE_REQUEST" \
  --note "$INSTALLATION_REASON"
~~~

Retain the actual returned preview digest, saved Installation ID and new case/Installation revision. Reconcile a lost response through the original request before continuing. Open the saved edition in the application.

For existing operated work, use its original current draft and history. The new-input preparer protects the original checks by accepting a planned seed; native observations are recorded only when the corresponding original work actually occurs.

## 7. Complete the original provider and customer course

Use the eight-screen commissioning operator or its existing customer-agent interface:

1. Open the original service/source and all agreed requests. Inspect the full scope, schema and expected outputs.
2. Review the two actual providers' original authority and native capabilities. Select their exact supported payment alternatives.
3. Stage the reviewed original releases. Explicitly select and start one native seller through its existing owner.
4. Prepare the actual customer's original buyer plan. The existing buyer authority approves and executes its exact request and spending.
5. Receive the actual attempt, independently observed transfer and every returned body. Keep an unresolved original attempt available for deliberate recovery.
6. Inspect each complete output and record the named recipient's actual decision. Keep partial and rejected results visible.
7. Stop the selected seller through its original owner before changing the active provider, then complete the other original provider's course.
8. Open the paired-service report. Its complete request set and original attempt histories govern useful completion.
9. Record the real observed work, source, purchase and output in the original Installation checks. Preserve original tranche and commercial phase allocation.
10. Export the complete job and case, receive both independently, and reopen their original source and pending/completed work.

The same-service comparison holds source, schema and useful task constant. A retry, reopening or source read retains the original purchase. T1/T2/T3 counting, operator independence and actual selected periods remain in the original grant/application and customer records.

## 8. Receive all files and continue the case

The preparation itself can be copied completely to another private directory and inspected:

~~~sh
facilitator-installation inspect --directory "$RECEIVED_PREPARATION"
~~~

Inspection validates every declared file and the complete required inventory for its original mode, input identities, full original profile and native commissioning transfer. The original input and output bodies stay available for the recipient to examine.

Use the original commissioning TAR receiver for the full operator workspace. It preserves its exact original export/job/selection/manifests and archive identity. Keep that receiving result with the full Installation case export.

The original grant-installation-receive command continues its complete Workshare/source/preparation/save/export/import course for selected customer inputs. An already saved case uses its original native export/import controls and saved operation. Preserve the original Workshare/Installation IDs, source attachments, funded assignments, observed checks and audit history.

Deliver the actual source/install edition, full editable job and operating case, workorder and report, every source/output, complete manifests and original operation results, private configuration references, recovery instructions and named support ownership.

## Producer and recipient review: open every outgoing artifact

Bryce's instruction applies to every producing and delegated worker. Before presenting a customer/prospect-facing application, website, dashboard, demo, report, presentation or export as ready, open/run/render the exact outgoing version, look at its rendered screen or actual screenshots, and operate important controls. Inspect desktop/screenshare and narrow/mobile widths, populated/empty/loading/error states, full downloads and reopening. Capturing screenshots without viewing them is insufficient.

Open, view, play or use every final attachment in its actual format: HTML, PDF, reports, slides, spreadsheets, maps, images, video, audio, archives and project files. Extract archives and open their contained deliverables and working project. Watch/listen to applicable video/audio exports. Review the actual workorder and source-binding files and operate both the commissioning and Installation screens as the recipient.

Repair broken, unstyled, cramped, clipped, overflowing or unreadable output in the same source before presentation. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls and useful labels. Keep inspection tied to actual operating defects.

Carry these instructions, exact source and original operation IDs into the existing equipped receiver. Review its actual rendered result and repair concrete findings. Preserve current owner controls, original customer relationships and the shared receiving lifetime.


## Use the complete authenticated desk

The same preparer is available through **Customer Installation**, the ninth screen of the original paired-service operator. It binds an original complete transfer to uploaded current Operations case and Workshare seed, presents all source matching and a complete typed editor, and retains every output inside the existing operator handover. Follow [INSTALLATION_DESK.md](INSTALLATION_DESK.md) for the complete browser and Merchant customer course. The CLI interfaces above remain available; native Installation preview/save is unchanged.
