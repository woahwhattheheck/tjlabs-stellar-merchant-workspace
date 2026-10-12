# Native DQA customer work

The IATI application now carries an entire data-quality engagement: select the original provider, capture actual assessments, review individual findings, compare a refreshed assessment, save customer case revisions, and deliver the complete customer package to another installed workspace.

Open **Data quality** in the original IATI browser. The same saved records are available through its CLI, typed client, merchant source MCP and existing Applications launch. The console owns one private workspace, SQLite database and process lease.

## Original service and data

The supported protocol is Zimmerman's [IATI.cloud DQA](https://github.com/zimmerman-team/iati-cloud.dqa/tree/61a5e02420b936a39ebaf79dea7212fc0ce36683), selected commit `61a5e02420b936a39ebaf79dea7212fc0ce36683`. The complete original README, rule documentation and MIT notice are included under `dqa-provider/` and in every customer ZIP.

The original service owns its validator, Solr selection, hierarchy, related-activity handling, closed-activity window, budget filter, cache and configurable document exemptions. The operating layer calls that service's actual `POST /dqa` and observes its `GET /dqa/config` catalogue and named configuration collections before and after acquisition.

For the documented public IATI.cloud source, use the complete [native source launcher and transport](receiving/dqa-source/README.md). It joins the original DQA engine to the public activity endpoint and retains the actual upstream calls. It preserves the original search queries, form bodies and responses. Its health observation is an actual source query. The provider source output supplies the complete receiving request and evidence locations.

A selected endpoint must be HTTPS, or HTTP on the operator's own loopback host. Redirects are rejected. Save the name of an existing host environment variable in `authorizationEnv`; its value is sent unchanged as the native Authorization header. This is distinct from the original IATI console's own private bearer capability. The credential value is never placed in a provider record, request record or customer package.

## Capture the complete assessment

In **Provider settings**, save the service name, endpoint, authorization variable and timeout. Changing a provider creates another immutable edition; select its predecessor to preserve the chain. Existing assessments retain their original provider edition.

In **Assessments**, choose that provider, enter a label and receiving analyst, and select the actual organisation identifiers. Optional country, region and sector selections, funding/accountable requirement, acronym rule, budget-date filter, cache request and returned finding detail flag go to the original provider. Every submitted flag remains in the saved request. A new acquisition receives a new request ID.

An assessment retains:

- The complete original POST request and response bytes, HTTP status, selected response headers and both acquisition timestamps.
- The complete configuration catalogue and every named configuration call, with their original bytes.
- Original activity totals, pass/fail activity counts, not-applicable rule-result count, generation time, financial year, available segmentations and all percentage fields.
- Every returned failed activity and every native attribute/document result within it.
- The analyst label and notes, selected provider edition, complete attempt history and stable original request identity.

Use the response and configuration download buttons for the complete original files. Finding pagination and search use a derived SQLite index built once from the complete original response. Pages read their selected rows without repeatedly parsing the entire provider response. The raw response remains authoritative and is retained in full.

The native `not_applicable_count` counts rule results. Pass and fail counts count activities. The returned `failed_activities` set is the provider's failure list; passing activities need not appear in it. A response whose requested finding list is omitted cannot provide individual finding review for those absent records.

The provider's `summary.total_budget` is retained as the exact numeric literal from its JSON response, alongside its financial year. The application displays that provider value separately from the existing IATI finance portfolio's exact currency/type/date groups. It does not assign a missing currency or recompute the provider's budget from the finance view.

The upstream's published request model includes `include_exemptions`; the selected engine commit determines how that option is implemented. The full request documents what was sent. Cache freshness is represented by the native request and observable response; an unreported cache-hit claim is not added.

## Review a named customer case

Open **Customer cases**, enter its name and client, and select one or more complete assessment editions. Optionally select existing IATI finance portfolio revisions. A case can retain 256 assessment editions and 32 complete finance portfolio selections.

Each save creates a complete historical revision with a review status, named reviewer, note and assessment selections. Updates require the original case ID and the revision being edited. If another analyst advanced it, open the current revision and apply the retained decision there. Opening an older revision continues to display its original selection and decisions.

Open an actual finding in **Assessments**, then select **Review this finding in the selected case**. Save an open, investigate, addressed or accepted decision with an owner, note and optional due date. The decision refers to the exact assessment and native finding identity. Removing it creates another case revision. Existing historical decisions remain in their earlier revisions.

A finding identity includes the original activity identifier, hierarchy, duplicate occurrence, native rule kind and native rule occurrence. The full rule object remains available beside the analyst's decision. Up to 1,000 edits can be applied in one case request; a case can accumulate more decisions across revisions while retaining its complete history.

## Compare a refresh

Choose the earlier and refreshed saved assessments in **Compare refreshes**. The comparison retains both original result files and all changed activity records.

The comparison classifies returned activity-list membership as **newly listed**, **no longer listed**, **changed** or **unchanged**. A no-longer-listed activity describes the difference between those particular returned lists. Its original before record is retained.

Inspect original request-scope changes, provider edition changes, captured configuration changes, generation times and native outcome totals alongside the activity changes. A naturally unchanged refresh keeps its actual unchanged result. The complete original before and after activity objects are available for every changed row.

## CLI and typed client

Use the existing selected Python and the original IATI CLI:

```sh
python3 stellar/scf-starforge-20261009/sf30-seller-sdk/iati/cli.py \
  --workspace /absolute/private/iati-workspace dqa-providers

python3 stellar/scf-starforge-20261009/sf30-seller-sdk/iati/cli.py \
  --workspace /absolute/private/iati-workspace dqa-provider-save --file /absolute/provider.json
```

Provider selection JSON requires `requestId`, `name`, `endpoint` and `authorizationEnv`; optional fields are `timeoutSeconds`, `notes` and `previous`. An assessment JSON requires `requestId`, the returned `provider` ID, complete `parameters`, `label` and `operator`, with optional `notes`.

| Command | Complete selection |
| --- | --- |
| `dqa-provider-save`, `dqa-capture`, `dqa-case-save` | `--file` with the complete original JSON request |
| `dqa-providers`, `dqa-assessments`, `dqa-cases` | Saved inventory |
| `dqa-assessment` | `--id` |
| `dqa-findings` | `--id`, optional `--offset`, `--limit`, `--status`, `--search` |
| `dqa-case` | `--id`, optional `--revision` |
| `dqa-history` | `--id` |
| `dqa-compare` | `--before`, `--after` |
| `dqa-comparison` | `--id`, optional `--offset`, `--limit` |
| `dqa-operations` | Optional `--offset`, `--limit` |
| `dqa-export` | `--id`, `--out`, optional `--revision` |
| `dqa-file` | `--id`, `--kind`, `--out`; kind is response, request, configuration-before or configuration-after |
| `dqa-receive` | `--file` with the complete customer ZIP |

Stop the original console before opening that workspace with its CLI. The exclusive original workspace lease prevents two writers. Applications still owns Start, Open, Stop, reconnect and adopted source verification.

The existing `client.mjs` and `client.d.mts` define every DQA operation and native result type. Connect through the original private connection file:

```js
import { connectIatiWorkspace } from './stellar/scf-starforge-20261009/sf30-seller-sdk/iati/client.mjs';

const client = await connectIatiWorkspace({
  consoleUrlFile: process.env.IATI_CONSOLE_FILE,
  timeoutMs: 900000
});
try {
  const { assessments } = await client.dqaAssessments();
  for (const edition of assessments) {
    console.log(edition.id, edition.label, edition.generatedAt, edition.counts);
  }
} finally {
  await client.dispose();
}
```

Typed methods are `dqaProviders`, `dqaSaveProvider`, `dqaCapture`, `dqaAssessments`, `dqaAssessment`, `dqaFindings`, `dqaCases`, `dqaCase`, `dqaHistory`, `dqaSaveCase`, `dqaCompare`, `dqaComparison`, `dqaOperations`, `dqaExport`, `dqaFile` and `dqaReceive`. File/export methods return the complete original response stream; consume or cancel it. `dispose()` closes this client's requests and leaves the borrowed console under its original owner.

## Agent operation and complete file delivery

Configure the existing merchant source workspace as format `iati` with its original private console connection. The DQA family is registered in the original source-workspace MCP catalogue.

Use `merchant_source_iati_dqa_provider`, `capture` or `save_case` with `workspace` and a complete `definition`. The definition includes its stable `requestId`. Use the returned original assessment/case IDs for the corresponding read, findings, history and comparison tools.

Inventory tools preserve the original snapshot paging contract. `merchant_source_iati_dqa_operations` exposes the retained original requests and attempt states after an interrupted reply. The native configuration and response files are delivered by `merchant_source_iati_dqa_file`; `merchant_source_iati_dqa_export` retains the full customer ZIP.

Both use the existing retained export directory, complete file metadata and `merchant_source_file_read`/release lifecycle. The customer package has export kind `dqa`; individual original files have kind `dqa-file`. Continue every returned file chunk through the final original byte count and digest. Receive the complete ZIP through `merchant_source_import`, selecting its export ID and original workspace or a declared complete packet file.

## Full receiving and interruption recovery

The customer ZIP includes the complete case history through the selected revision, every referenced assessment and provider predecessor, original completed request histories, all raw request/response/configuration files, saved comparisons, readable CSV reports, full original guides and selected complete IATI finance portfolio packets.

Receiving verifies all archive members and complete file identities before publishing DQA rows. It reconstructs every native assessment from its raw response/configuration bytes, binds completed requests to their original results, reconstructs comparisons and reports from the packet's exact record selection, and validates all saved finding decisions. Unrelated newer local comparisons remain separate. Re-receiving an older valid package keeps its original result.

Complete nested IATI portfolio receiving uses the existing portfolio receiver. These independently valid portfolio revisions and immutable source files are prepared before the single DQA domain transaction. If later DQA validation fails, retrying the same full package reuses that preparation. DQA case, assessment, request and comparison rows publish together.

File publication uses private staged files, full original digests, fsync and atomic rename. A process interruption cannot leave a referenced partial response or final customer archive. Retrying a completed provider/case/assessment request returns its original historical result even after later work. A stored successful native response is completed from its saved bytes. A failed HTTP acquisition retains the original attempt and can make a later attempt under the same unchanged request.

A complete native source file, JSON selection, case revision or report is limited to 64 MiB; the complete customer package is limited to 4 GiB and 32,768 members. Full-response finding and comparison pages contain up to 250 rows. Capacity checks reject an oversized complete result before publishing it.

The full installed native receiving workflow and its actual source-exchange requirements are documented in [DQA receiving](receiving/DQA.md). Its customer export is the same archive produced by the normal browser, CLI and MCP operation.
