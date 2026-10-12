# Complete native IATI DQA customer receiving

This receiving procedure takes the original DQA product through a complete analyst workflow: two full native assessments, their original source exchanges, saved finding actions and review revisions, a complete comparison, authenticated file delivery, independent receiving, and reopening the saved work.

The caller runs the maintained `zimmerman-team/iati-cloud.dqa` engine at commit `61a5e02420b936a39ebaf79dea7212fc0ce36683`. The original engine supplies its request model, validators, configuration observations, cache behavior, and complete raw assessment. The selected source launcher supplies actual public IATI.cloud responses and the original Redis process. Each accepted assessment must have complete successful source evidence.

## Run the complete receiving stage

The [complete setup and lifecycle guide](dqa-source/SETUP.md) joins this stage
to the original upstream installation and owned shutdown. Start from its
[complete profile](dqa-source/complete.example.json) to run the whole customer
workflow in one selected native operation.

The exported API is `runIatiDqaReceiving` in:

`stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/dqa.mjs`

The file also contains the actual command-line entry point used by the upstream setup wrapper:

```bash
node /absolute/selected-source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/dqa.mjs \
  --input /absolute/dqa-receiving.json \
  --runtime-ready /absolute/runtime-preparation/runtime-ready.json \
  --upstream-ready /absolute/original-upstream-attempt/ready.json \
  --provider-file /absolute/original-upstream-attempt/provider.json \
  --assessments-file /absolute/original-upstream-attempt/assessment-requests.json
```

The receiving configuration contains:

```json
{
  "directory": "/absolute/private-project/dqa-workspace",
  "outputDirectory": "/absolute/private-project/dqa-receiving",
  "operationId": "IATI-DQA-CUSTOMER-RECEIVING-EXAMPLE",
  "actor": {
    "id": "named-receiving-operator",
    "label": "Named receiving operator"
  },
  "portfolios": [],
  "pythonExecutable": "/absolute/existing/python3",
  "chromiumExecutable": "/absolute/existing/chrome-headless-shell",
  "playwrightModule": "/absolute/existing/playwright/index.js"
}
```

The CLI maps the actual READY result to its original installed source and runtime directory. It maps the original provider input's name, endpoint and authorization environment, then maps each assessment source row's `id`, `name`, and `request` to the callback's retained `sourceId`, `label`, and `parameters`. The original READY, provider input and complete assessment-request envelope are copied unchanged into the receiving record and complete customer handover.

The current native source file has schema `commons.iati.dqa.assessment-requests.v1`. Its two selections are `gb-gov-1-initial` and `gb-gov-1-fresh`, named “GB-GOV-1 initial complete assessment” and “GB-GOV-1 fresh complete assessment”. Both select all of `GB-GOV-1`, with no country restriction, `skip_cache: true`, and `failed_activities: true`. Both retain the same native rule flags. This deliberately allows an unchanged comparison as a valid real result.

The authorization value is inherited from the caller's selected environment variable. Provider records retain the variable name. The caller keeps its actual upstream processes alive through both captures and then closes its owned processes after this callback returns.

## Prepare the real installed runtime

Use the original complete runtime preparer from the final selected source:

```bash
node /absolute/selected-source/stellar/scf-starforge-20261009/sf30-seller-sdk/iati/receiving/runtime.mjs \
  /absolute/runtime-input.json
```

The input selects an actual Git source repository, its immutable commit, the selected source root, and a separate private preparation directory:

```json
{
  "repository": "/absolute/original-git-repository",
  "sourceRoot": "/absolute/selected-source",
  "sourceCommit": "FINAL_MERGED_40_CHARACTER_COMMIT",
  "outputDirectory": "/absolute/runtime-preparation",
  "operationId": "IATI-DQA-RUNTIME-PREPARATION-EXAMPLE",
  "pythonExecutable": "/absolute/existing/python3",
  "npmExecutable": "/absolute/existing/npm",
  "sourceOffline": true,
  "dependencyOffline": true
}
```

Replace the commit placeholder with the exact complete published source selection. The original source receiver can supply missing Git objects through its existing `sourceReceiving` input and original donor repositories. Preserve that receiver's actual metadata, missing-object result, cache and operation identity.

The preparer invokes the original distribution builder, runtime preparation and installation, then the native installation and Merchant runtime inspectors. Its `runtime-ready.json` records the actual archive, profile, lock, source manifest, installed source root and installation directory. The DQA recipe includes the complete IATI directory, its original XML/native dependencies, the source MCP adapter, and the complete original Applications import and asset closure.

The receiving stage requires the actual READY zero-dependency operator profile. It compares the selected and installed DQA/IATI modules, its own complete callback and browser helper, the original Applications controller, native source adapter and public assets before opening the workspace.

## Callable API

An embedding caller may invoke the same procedure directly:

```js
await runIatiDqaReceiving({
  directory: "/absolute/original-closed-iati-workspace",
  outputDirectory: "/absolute/private-dqa-receiving",
  sourceRoot: "/absolute/selected-repository-source",
  runtimeDirectory: "/absolute/original-ready-installation",
  operationId: "IATI-DQA-CUSTOMER-RECEIVING-EXAMPLE",
  actor: { id: "receiving-operator", label: "Named receiving operator" },
  upstreamReadyFile: "/absolute/original-upstream-attempt/ready.json",
  provider: {
    name: "Selected original DQA deployment",
    endpoint: "http://127.0.0.1:5500/dqa",
    authorizationEnv: "IATI_DQA_AUTHORIZATION",
    timeoutSeconds: 900
  },
  assessments: [
    {
      sourceId: "gb-gov-1-initial",
      label: "GB-GOV-1 initial complete assessment",
      parameters: {
        organisation: "GB-GOV-1",
        require_funding_and_accountable: false,
        include_exemptions: true,
        optional_rules: { check_acronyms: false },
        skip_cache: true,
        failed_activities: true,
        use_budget_date_filter: false
      }
    },
    {
      sourceId: "gb-gov-1-fresh",
      label: "GB-GOV-1 fresh complete assessment",
      parameters: {
        organisation: "GB-GOV-1",
        require_funding_and_accountable: false,
        include_exemptions: true,
        optional_rules: { check_acronyms: false },
        skip_cache: true,
        failed_activities: true,
        use_budget_date_filter: false
      }
    }
  ],
  portfolios: [],
  pythonExecutable: "/absolute/existing/python3",
  chromiumExecutable: "/absolute/existing/chrome-headless-shell",
  playwrightModule: "/absolute/existing/playwright/index.js"
});
```

The browser submits all its supported native fields explicitly. Missing country, region and sector arrays become empty selections; omitted original Boolean controls use the documented UI defaults. The original input request remains in the immutable selection, and the actual browser-generated request is separately retained before dispatch. Unsupported fields are rejected before capture.

| Input | Meaning |
| --- | --- |
| `directory` | A closed original IATI workspace, or a new selected path initialized through the original CLI. |
| `outputDirectory` | A separate private receiving directory holding the original selection, progress, full files and browser views. |
| `sourceRoot`, `runtimeDirectory` | Complete selected source and an actual READY original installation. |
| `operationId` | One stable receiving identity, preserved on continuation. |
| `actor` | The named operator used in retained assessment and analyst review records. |
| `upstreamReadyFile` | The first selected original upstream READY record, with its exact evidence helper and source/runtime paths. |
| `provider` | Original name, endpoint, authorization environment name, timeout and optional notes or predecessor. |
| `assessments` | Two complete native selections. Optional `sourceId` preserves the upstream request-list identity. |
| `portfolios` | Optional exact original IATI portfolio IDs and revisions available in the source workspace and browser selection. |
| `pythonExecutable` | Existing Python selected for the original IATI server and CLI. |
| `chromiumExecutable`, `playwrightModule` | Existing browser runtime for actual desktop and narrow mobile receiving. |

If a new workspace initialization is interrupted before publication, the procedure preserves its owned partial directory and continues through the same original CLI. It will not initialize over an existing unrelated directory or replace an originally selected workspace whose header has disappeared.

## Full workflow and retained observations

1. **Open the real installed application.** Attach the verified runtime to the original Applications workspace, review and save the IATI application, connect its source release, Start it, validate the actual native workspace binding and use its saved Open link.
2. **Save the original provider.** Submit the browser form and retain the exact request before it reaches the original API. The same completed request must reopen the original provider edition.
3. **Capture both complete assessments.** Submit each complete original selection through the actual browser. Read the same native assessment through the typed client and replay the saved request. Retain the exact request, raw response, configuration-before and configuration-after files.
4. **Accept the actual public-source evidence.** Invoke the selected upstream's original evidence command after each capture. Verify every complete listed source file, both H1 and H2 search requests, all downstream searches and their full returned records. Preserve the original query cutoffs and acquisition observations.
5. **Read all findings and save analyst work.** Read the entire paginated native finding set. Create a customer case from the two retained assessments, save a named finding action when the original response contains a finding, then save its named review revision. Keep the initial request replay bound to its historical first revision.
6. **Compare the original assessments.** Save the complete comparison and read every activity-change page. The original comparison records request-scope changes, provider/configuration observations, generation times, exact assessment totals and full before/after activity records.
7. **Download complete native files.** Use the actual browser, authenticated HTTP client and original MCP retained-file reader. Interrupt one durably written MCP archive prefix, close the descriptor and HTTP adapter, reconnect and resume the same SHA-addressed file. Byte-identical files shared by two captures must still return the requested assessment and file kind.
8. **Inspect the complete customer packet.** Verify every manifest member, full size and SHA-256, extract every original member, and compare the selected case/history/assessment/comparison records with the saved source.
9. **Reopen through the original CLI.** Stop the source Application. Read provider, assessment, case, history, findings, comparison and operation records through the original CLI. Replay the first case request and export the full case twice into the same destination, retaining the original complete-output retry result.
10. **Receive independently.** Initialize one separate original IATI workspace. Receive the complete packet through the typed API and generic original MCP import, retain all linked finance portfolios, create one separate local reverse comparison, then receive the old packet again and verify both comparisons remain.
11. **Complete the receiving browser lifecycle.** Use the actual file-input receiving form, inspect the received case and assessment at desktop and 390-pixel width, Stop, reopen through the original CLI, restart the same Application and inspect the same saved work again.
12. **Return the complete handover.** Close owned Applications, browser and MCP sessions. Publish the full customer receiving ZIP and final result after complete-file verification and original session cleanup.

Each browser request is persisted before route continuation. If the request file is durable but its progress update was interrupted, the same exact request and any retained response are reconciled under the output lease before another action is selected. The receiver preserves the original source operator's live-service authority; it does not create another provider, scheduler or controller.

## Evidence is required for a complete assessment

The selected original DQA engine can return an empty list after a swallowed Solr search error. An HTTP 200 native assessment is therefore insufficient by itself.

The upstream READY record contains:

```json
{
  "source_evidence": {
    "schema": "commons.iati.dqa.source-evidence-contract.v1",
    "export_argv": [
      "/absolute/selected/python3",
      "-B",
      "/absolute/selected/upstream.py",
      "evidence",
      "--ready",
      "/absolute/original-upstream-attempt/ready.json",
      "--output",
      "ABS_OUTPUT_DIRECTORY"
    ]
  }
}
```

The callback replaces only the final output placeholder. Capture two appends `--after-evidence` with capture one's complete manifest. The selected helper must be byte-identical to its installed original.

The exporter retains original requests, complete public responses and headers, source/runtime metadata, failures, and native cutoff query strings. The callback requires a COMPLETE manifest, no failed exchanges, complete delivery of every selected exchange, and successful original search queries containing both `hierarchy:1` and `hierarchy:2`. The startup health request does not count as either hierarchy search.

A SOURCE_ERRORS outcome remains a retained failure with all available source evidence. The procedure will not relabel a partial public query as an empty successful native assessment.

## Meaning of the saved comparison and finance values

The native comparison describes membership and complete record changes in the service's returned failed-activity lists. A no-longer-listed activity must be read with the selected request, service counts and configuration observations.

The default full-publisher requests retain the same rules and force fresh captures. They may produce an unchanged comparison. If a caller explicitly selects different rules or segmentation, the comparison retains that scope change.

Provider budget values preserve the exact numeric text from the original response. The assessment's financial-year label stays with its own aggregate budget. Linked IATI finance portfolios separately retain source, currency, reporting organisation, hierarchy, period, selection and review identities.

## Complete files

The original native DQA case ZIP includes its full manifest, all case revisions through the selected revision, provider predecessor chains, assessments, completed operation records, comparisons, all referenced native blobs, complete reports, linked finance portfolio packages and product/provider guides.

The outer `DQA_Complete_Customer_Receiving.zip` adds:

- The complete original DQA ZIP and every fully extracted native member.
- Both original source-evidence manifests and every listed evidence file.
- Unchanged original upstream READY, provider input and assessment-request source.
- The receiving summary, exact saved browser requests/results and complete original CLI request/stdout records.
- The complete product, receiving and upstream-source guides.

The outer archive is built from a retained immutable selection under the receiver's output lease. It verifies every input, writes a private fully fsynced archive, verifies every archived member, then publishes it atomically. An interrupted stage remains in the operation directory; a retry reuses the same selection and original file identities.

Browser PNGs and private authenticated connection files remain beside the result as native operating material. They are not selected into the customer ZIP.

## Continue the same work

Retain the same source, actual installation, original operation ID, workspace, output directory, actor and input files. Call the same function or command again.

`selection.json` binds those inputs. `progress.json` records the original browser request bodies, completed native results, Applications identities, source-evidence selections and committed file offsets. Captures that already completed replay their original request result, without fetching a replacement assessment. Incomplete local file copies resume from their recorded durable offsets.

If the caller must restart its original upstream processes, it preserves the first resolved callback argv and original READY file. Before continuing, the caller checks the fresh process READY against the original endpoint, authorization-environment name, engine/source/runtime and shared source journal. The callback continues using the original READY and prior evidence manifest. The new process READY remains a separate real lifecycle record.

`completed-workflow.json` records a complete customer result awaiting any remaining owned-session cleanup. Its full files are reverified and its original Applications are stopped before the final `result.json` is published. A caller that already has a verified COMPLETE `result.json` completes its own shutdown and durable return without invoking the callback again.

The final result has schema `stellar-forge.iati-dqa-operator-receiving.v1`, state `COMPLETE`, the original `operationId`, `selectionSha256`, actual completion time, full source/case/comparison/receiving identities and absolute `files` descriptors. Each file names `path`, `bytes` and `sha256`; a `gitBlob` observation may also be present. The `customerHandover` descriptor names the complete outer ZIP.

The caller retains the whole source, original native operation, complete outputs and actual runtime/capacity observations through its existing durable delivery workflow.
