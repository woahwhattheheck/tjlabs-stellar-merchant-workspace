# Econdb maritime operations and complete handover

Use this installed product to receive complete original maritime responses, review their periods and revisions, assemble port projects, publish reviewed datasets through the original merchant, and continue the same saved work with another operator.

The installed operator, browser and typed client share one private operating directory. The source, project and publication commands remain the existing implementations. This guide carries operation **ECONDB-MARITIME-PERIOD-WORKSHARE-BBBD-20261013**; retain its original commissioning scope and customer history.

## Install the selected product

Use the existing Linux host with Node.js **22.16 or later**, util-linux **flock**, and a filesystem supporting private directories, atomic rename and fsync. Select disk capacity for the complete original source and outgoing projects. The original native project limit is **2 GiB**; a browser workspace and individual source response have their own smaller limits. A paginated table is a viewing choice, not a reduction of the retained data.

Build from the full immutable source commit that contains this guide, the contribution and the operator:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace --ref ORIGINAL_COMMIT \
  --selection econdb-maritime --out /absolute/releases/econdb-maritime
~~~

Use the full 40-character commit and the actual archive path and SHA-256 returned by the builder. The recipe keeps the complete Econdb component, original public documentation and examples, the source/project receivers, dataset publisher, SDK source dependencies and this operating guide. It does not copy private customer directories into the software archive.

Prepare and install through the existing runtime:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /srv/starforge/runtimes/econdb \
  --archive /absolute/releases/econdb-maritime/ORIGINAL_ARCHIVE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /srv/starforge/runtimes/econdb

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /srv/starforge/runtimes/econdb --load --source

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /srv/starforge/runtimes/econdb -- registrations --source econdb-maritime
~~~

The profile retains the original native dependency versions. Use the maintained installer's existing-dependency adoption route when the receiving host already has the exact supported installation. Source capture, local analysis and the offline pages use Node built-ins; actual Stellar merchant/payment operation uses the selected native profile and the existing provider configuration.

Dispatch subsequent commands through that runtime:

~~~sh
starforge() {
  node /absolute/merchant-workspace/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs \
    run --dir /srv/starforge/runtimes/econdb -- "$@"
}
~~~

| Command | Existing implementation |
| --- | --- |
| starforge econdb | Retained operator workspace, local browser, client and complete handover |
| starforge econdb-source | Original response capture/receiving, period analysis and edition inventory |
| starforge econdb-project | Complete project build, inspection, browser-workspace import and independent reopen |
| starforge econdb-publication | Original source/project publication and maintained merchant/buyer joins |

An interrupted distribution build resumes at its original output:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-workspace --out /absolute/releases/econdb-maritime --resume
~~~

A different commit or selection uses a separately intended build output. Preserve the original runtime for rollback. Read the maintained [runtime installation](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) and [source selection](../../stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md) guides for the actual install and transfer contracts.

## Open the original saved operator

Create the intended private workspace once, then open that same directory:

~~~sh
starforge econdb init --directory /srv/starforge/projects/econdb --title "Maritime source review"
starforge econdb status --directory /srv/starforge/projects/econdb
starforge econdb serve --directory /srv/starforge/projects/econdb --port 0
~~~

The server binds **127.0.0.1** and prints its actual local URL as JSON for the original Applications startup observer. Open that printed URL; its private capability is access material, not a public service address. Keep it out of source reports and exported examples.

In the installed **Applications** catalog, select the **econdb** provider and the intended operator directory. Use the maintained Review/Save, Start/Open/Stop and reopen controls. An existing directory keeps its original state; restarting the application is not another source capture or project initialization.

| Working area | Work to complete |
| --- | --- |
| Sources | Receive complete original responses (capture uses the original source CLI), reopen editions and inspect the retained source identity |
| Analyses and projects | Select the actual retained editions, inspect periods/revisions, build complete projects and open their full outputs |
| Dataset publication | Choose the retained source/project and explicit edition roles, then continue the original typed publication workflow |
| Original buyer return | Join a real existing buyer inbox and its original selected intents to the matching publication |
| History and handover | Reconcile original requests, inspect saved outcomes and transfer the complete editable workspace |

The browser and typed client operate the same saved state. A direct operator command consumes the exact operation request from a file:

~~~sh
starforge econdb command \
  --directory /srv/starforge/projects/econdb \
  --request /absolute/private/original-operator-request.json

starforge econdb request \
  --directory /srv/starforge/projects/econdb --id ORIGINAL_REQUEST_UUID
~~~

Use the actual command input produced by the operator/client contract, including its original request UUID. Retain that complete input after a timeout, then inspect the same request before any continuation. Do not generate a new ID merely because the tool lost its response. Changed input under an existing request identity is not a retry.

Keep one operation owner for the workspace and respect its original lock/recovery result. Use the running listener for browser/client work; when switching to direct CLI or a complete transfer, choose the original operator's quiet boundary. Existing source editions, project outputs, publication identities and buyer histories remain authoritative.

## Receive original sources and choose a period

The installed package keeps its original sources under **source/stellar/scf_2026/sf49_data_commissioning/econdb/**. Set **SOURCE** below to that exact directory and **WORK** to the receiving operation's private directory. Paths are explicit; a local output is not inferred from another customer's project.

The included examples are exact transcriptions of the issuer's published OpenAPI examples. They have **no assigned port** and are not a live authenticated capture. Receive both unchanged originals:

~~~sh
starforge econdb-source receive \
  --source "$SOURCE/examples/capacity.response.json" \
  --descriptor "$SOURCE/examples/capacity.descriptor.json" \
  --out "$WORK/editions"

starforge econdb-source receive \
  --source "$SOURCE/examples/traffic.response.json" \
  --descriptor "$SOURCE/examples/traffic.descriptor.json" \
  --out "$WORK/editions"

starforge econdb-source list --root "$WORK/editions"
~~~

Reopening the same edition verifies and reuses its retained identity. Do not change its descriptor or assign a customer port to a documentation example.

The capacity example has a declared monthly frequency. Review its actual February and March observations and compare those two periods within the same source edition:

~~~sh
starforge econdb-source analyze \
  --edition "$WORK/editions/issuer-doc-capacity-by-operator" \
  --from 2022-02-01 --until 2022-04-01 \
  --before-from 2022-02-01 --before-until 2022-03-01 \
  --after-from 2022-03-01 --after-until 2022-04-01 \
  --out "$WORK/capacity-review"

starforge econdb-source analyze \
  --edition "$WORK/editions/issuer-doc-container-traffic" \
  --from 2022-02-01 --until 2022-04-01 \
  --out "$WORK/traffic-review"
~~~

The traffic source keeps its native Date labels. Its contract does not declare a monthly frequency, so do not assign monthly completeness or a monthly comparison to it. The two examples' complete selected population contains **15 cells, including one null**.

Open the actual HTML, JSON and CSV in each review directory. Inspect source/request meaning, coverage and unavailable states alongside the values. Each complete analysis retains its response, descriptor and producing source identity. A revision comparison additionally retains the selected earlier edition.

For actual authorized acquisition, select real LOCODEs from the complete retained original port catalogue and supply an existing credential in **ECONDB_TOKEN** through the original private environment. The source CLI accepts a file containing a nonempty array of **{id, request}**:

~~~sh
starforge econdb-source capture \
  --requests /absolute/private/selected-requests.json \
  --out "$WORK/editions"
~~~

The supported request kinds are **ports**, **capacity-by-operator** and **container-traffic**. Retain the exact endpoint-specific request shape from [OPERATOR_GUIDE.md](../../stellar/scf_2026/sf49_data_commissioning/econdb/OPERATOR_GUIDE.md). Capacity requests preserve flow, operator and top; the complete-operator choice is explicit **top=0**, and top is omitted when an operator is selected because the issuer ignores it. Catalogue and traffic endpoints declare no query parameters. Date windows are local selections over complete retained responses, not invented server filters.

An existing edition ID reopens its original response without a second GET. Use a new explicit edition ID for a later source acquisition. A complete HTTP response that fails decoding or interpretation remains retained with its original descriptor and receiving error; recover from those bytes. Keep credentials outside response descriptors, portable exports and browser files.

## Interpret the source faithfully

Calling-vessel TEU capacity and estimated container TEU are different measures. Imports, exports, transshipment, flow, operator selection and population stay attached to their original request. The issuer's port directory describes its top 400 ports by traffic; it is not every port worldwide. Missing/null catalogue identities remain visible but cannot select a source port.

Period selection is half-open: **from <= original Date < until**. Equal disjoint whole-month windows can be compared only within the same capacity series. Missing months, duplicate dates and unknown cells prevent a complete total. Partial-month selection remains available with monthly completeness uncomputed. A missing value never becomes zero.

The engine keeps original numeric lexemes and exact decimal calculations. Source null, missing and unsupported values remain distinct. Source-edition comparison requires the same request/role and a later capture timestamp; it reports observation changes separately from metadata and coverage changes. February and March rows inside one response are periods, not separate source editions. Dwell-time ambiguity remains outside this calculation scope.

Retain the original [OpenAPI and source guide](../../stellar/scf_2026/sf49_data_commissioning/econdb/sources/ECONDB_SOURCE_RECEIVING.md). Provider access, source/user rights, intended redistribution, merchant/payer identity and the customer selection are actual commissioning decisions. Software installation or an example run does not establish them.

## Assemble, edit and independently reopen a project

A project contains 1–48 explicitly selected entries. Each selects a current original edition, optional earlier edition, local date range and optional period comparison. The engine bounds the complete current-plus-previous source population at 500,000 cells before expanding it. The native handover retains the full source directories, original receiving manifests, per-entry reports, annotated CSV/JSON, offline overview, editable browser workspace and producing modules.

Copy the included **examples/project.json** beside the existing **editions/** directory so its two relative source paths resolve:

~~~sh
starforge econdb-project build \
  --project "$WORK/project.json" --out "$WORK/project-delivery"

starforge econdb-project inspect --project "$WORK/project-delivery"

starforge econdb-project reopen \
  --project "$WORK/project-delivery" --out "$WORK/received-project"
~~~

The source configuration is **econdb.maritime-project.v1**. Select actual customer entries when commissioned; the included configuration preserves the unassigned example ports. Combined counts count entry-level source cells, including repeated views of one source. The project never adds capacity and container volume or different source populations into a purported total.

Open **report.html**, every detailed entry report and each original/source attachment. Inspect **project-analysis.json**, **observations.csv**, **project-manifest.json** and **browser-workspace.json**. In the included offline workbench, reopen that complete browser workspace, change an entry's explicit selection, apply it, inspect the actual result and save it. Unapplied draft controls do not change the saved applied workspace. Undo and source/engine checks preserve the original input binding.

A complete saved browser project can enter the same native workflow:

~~~sh
starforge econdb-project import-workspace \
  --workspace /absolute/returned/browser-workspace.json \
  --out "$WORK/returned-project"
~~~

Rerunning an exact build reopens its verified completed target or resumes the original bound stage. A changed or incomplete published directory remains retained and refused. Keep the original request and lock identity through interruption; a persistent lock pathname alone is not an active lease. The complete [project guide](../../stellar/scf_2026/sf49_data_commissioning/econdb/PROJECT_GUIDE.md) describes source limits, staging, complete file preservation and independent continuation.

## Publish the reviewed dataset through the original merchant

Build a single-source publication from the original response and descriptor, or publish a complete verified project. Project publication requires an explicit role choice:

~~~sh
starforge econdb-publication build-project \
  --project "$WORK/project-delivery" --editions current \
  --name "Reviewed maritime project" --out "$WORK/publications/project-current"

starforge econdb-publication inspect \
  --publication "$WORK/publications/project-current"

starforge econdb-publication merchant-init \
  --publication "$WORK/publications/project-current" \
  --state "$WORK/merchant-state"
~~~

Use **--editions current-and-previous** only when the selected previous source rows belong in the delivered dataset. Rows carry entry, port/request, role, edition and original source identities. Original null states stay explicit, decimal values retain exact text, and every original project member remains bound to the publication. A completed publication reopens with its original binding.

**merchant-init** initializes the original typed dataset version store. It does not create a payment, grant redistribution rights or choose a customer. Existing stores use **merchant-refresh** with their actual expected snapshot and revision. Keep the original compare-and-swap checks.

For an explicitly selected real paid service, use **merchant-configure** with its existing public payment terms, HTTPS origin and route. The original version service owns serving, activation and retained history. **original-version-cli** delegates to that unchanged service. Existing native x402/settlement/provider configuration and spending rules remain authoritative.

An actual completed buyer return uses **buyer-export** with the original inbox and selected original intents. It retains the original SF88/SF100 delivery, validates its source/snapshot/query/page binding and adds the Econdb source connection. A lost response reopens that same completed destination; incomplete receiving remains retained for its original continuation. A filtered buyer package does not silently acquire the complete private raw-source archive.

Read [SF30_PUBLICATION.md](../../stellar/scf_2026/sf49_data_commissioning/econdb/SF30_PUBLICATION.md) for exact configuration, source capacities and customer receiving. Reuse the original paid operation only when its actual terms, payer, resource and purchase authority exist.

## Interrupted operator commands

The browser commits the complete original request to IndexedDB before sending it. Resume that same UUID and exact input after an uncertain response. The native journal compares the original request before reconciling a completed result, even when the workspace revision has advanced. Another tab cannot replace a pending request.

A failed incomplete command retains its original files and error. The operator can record a deliberate preservation decision and continue with a corrected new request; this never describes the incomplete operation as successful:

~~~sh
starforge econdb preserve-failed --directory /srv/starforge/projects/econdb \
  --id ORIGINAL_REQUEST_UUID --revision CURRENT_REVISION \
  --note "Original incomplete output retained; corrected selection will use a new request."
~~~

Managed Applications uses **serve --create** only for an explicitly selected new workspace. Existing identities reopen through their original workspace.json and state.json. There is no purchase or external source capture in the installed operator's HTTP command surface.

## Interfaces and complete handover

The selected package exports the original **./seller/econdb** operator, **/server**, typed **/client**, **/analysis**, **/native**, **/project**, **/project-native**, **/project-workspace**, **/publication** and Applications **/provider**. Import them through the installed package's declared export map. The client uses the same actual running operator; it does not create another business workspace.

Export the complete operating workspace to a new intended directory, inspect its manifest-bound contents, then receive it into a separate editable workspace:

~~~sh
starforge econdb export \
  --directory /srv/starforge/projects/econdb \
  --destination /absolute/handovers/econdb-complete

starforge econdb inspect-transfer \
  --directory /absolute/handovers/econdb-complete

starforge econdb receive \
  --directory /absolute/handovers/econdb-complete \
  --destination /srv/starforge/projects/econdb-received

starforge econdb status --directory /srv/starforge/projects/econdb-received

starforge econdb serve \
  --directory /srv/starforge/projects/econdb-received --port 0
~~~

This is the original manifest-bound **directory streaming** handover. Transfer every declared file with its original relative path and exact bytes; a newly improvised JSON or ZIP wrapper is not its receiving format. Preserve the complete export and original workspace while the independent destination is verified. The receiver preserves original record/request identities and all retained originals.

In the received workspace, open the same edition and complete project, inspect its original source and output files, then continue an intended new selection. Inspect the complete publication and retained buyer-return evidence where present. The receiving result must identify the actual new workspace and reused original identities; an exported manifest alone does not establish that another operator reopened it.

A software runtime transfer and an operating-data handover are separate retained objects. The maintained **runtime-transfer** workflow carries the installed source archive and exact dependency profile. Use the operator's documented complete-workspace handover for original editions, project outputs and publication history. Keep source credentials and any native payer/signing custody in their original authorized systems; do not place them in source examples or a portable browser workspace.

## Use the exact outgoing product before presenting it

The original [source-owned receiving course](../../stellar/scf_2026/sf49_data_commissioning/econdb/receiving/NATIVE_RECEIVING.md) remains the operation for native source/project/publication and offline-browser receiving. Continue its existing working directory and retained journals. The installed operator adds its own actual Applications/start/open/stop/reopen and complete-data receiving work to that same product delivery.

Before presenting this application, a report, dataset export, archive or any attachment as ready, the producing operator must open/run/render the exact outgoing version, look at the actual screenshots or screen, and use it as the recipient would. Inspect desktop and narrow layouts; use important controls, empty/populated/loading/error states, original downloads and reopening. Open the complete ZIP/project, inspect its usable files and each report, and continue work in the independently received copy. Read all outgoing documents in their rendered form. If audio/video is created, actually watch and listen to its final export and use suitable generative voice/TTS where requested.

Source parsing, HTTP success, screenshot counts, an unviewed capture or another worker's assurance do not establish rendered readiness. Repair clipped, unstyled, unreadable or broken output while preserving original data and history. Keep verification focused on completing the real workflow; do not create broad suites, a second receiver, a review queue or a new paid runtime.

Retain the actual source commit, command/runtime identities, output hashes and observed receiving result in the original case. Source publication and actual native/browser/attachment use remain separately recorded. GitHub Actions stays disabled under the original zero-spend policy; a source build or missing runtime never authorizes hosted CI.
