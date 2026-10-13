# Harbour migration: original agent and merchant operations

This installed contribution lets an agent operate the same complete Harbour workspace that a person can download, reopen and edit in the existing offline application. It retains complete original evidence and CSV files, neutral-role mappings, raw rows, attributed corrections, scope/review history, actual supplier contracts, prepared CSVs and observed returned comparisons. It preserves the working recovery's unfinished forms, selected controls and browser copy ID. The original pure engine and the original kernel-held CLI writer remain authoritative.

## Select the complete existing workspace

Use Node 22.16+ on the original Linux or Windows runtime. The existing CLI uses a kernel-held local IPC lease; do not substitute an uncoordinated JSON writer. Select a complete workspace JSON or the browser's complete working recovery JSON. Give an explicit absolute file path and its original logical genesis: ID, title and createdAt. A reused ID with another title or creation time is another workspace.

A private connection file has this shape; replace every illustrative path, ID, time and byte identity with the actual selected file. No source credentials or recipient contacts belong in this public example.

```json
{
  "schema": "stellar-forge.harbour-source-agent.v1",
  "workspaces": {
    "original": {
      "label": "Original harbour source",
      "workspacePath": "/absolute/private/Working_Recovery.json",
      "operationsDirectory": "/absolute/private/harbour-operations",
      "genesis": {
        "id": "original-workspace-id",
        "title": "Actual original title",
        "createdAt": "2026-10-13T00:00:00.000Z"
      },
      "inputs": {
        "original_csv": {
          "path": "/absolute/private/Actual_Source.csv",
          "filename": "Actual_Source.csv",
          "bytes": 1234,
          "sha256": "REPLACE_WITH_COMPLETE_ACTUAL_SHA256",
          "kind": "csv",
          "label": "Original complete CSV"
        }
      }
    }
  }
}
```

Input kinds are original (complete binary/template/source file), csv (complete UTF-8 text, preserving a BOM), or operation (complete original JSON request). Each input is at most 32 MiB. Its actual filename, byte count and SHA256 are checked before new intake. The connection configuration is at most 1 MiB. No arbitrary caller-selected host path is a tool argument.

Use the existing merchant initialization hook or import the setup function:

```js
import {initializeHarbourMerchant} from './agent-setup.mjs';
const setup = await initializeHarbourMerchant({
  directory: '/absolute/private/harbour-merchant',
  connection: '/absolute/private/harbour-connection.json',
  name: 'Original Harbour source work'
});
```

This uses the maintained native release-store initializer, original private lock and ordinary merchant configuration loader. A repeated identical setup resumes the same retained intent. A different name, connection or release-store path conflicts with that original setup. The generated merchant-mcp.json uses harbourSourceConnection; the original source-owned provider discovers and loads it through the installed contribution. Continue the existing merchant MCP host using that actual configuration. No extra server, watcher, credential store or parallel workspace is created.

## Operate the original selection

The typed host class is HarbourSourceClient from agent-client.mjs; agent-client.d.mts describes every native input. readHarbourConfiguration reads and pins the actual genesis. The source-owned merchant prefix is merchant_harbour_source_.

| Operation | Original behavior |
| --- | --- |
| workspaces / status | Exact logical genesis, observed revision/head, browser copy, unfinished forms and configured complete original files |
| section / rows | Paged complete original collections or effective CSV cells with retained original headers and correction IDs |
| analyse | Source-qualified records, findings, relationship edges/cycles, document/permission/history witnesses for a saved scope |
| save_operating_profile / save_financial_profile | Freeze the selected policy files, declared dates/codes/consent and exact amount/sign/currency/account/period/coverage basis for the original source scope |
| target | Actual supplied target preview, full prepared row witnesses, keys, crosswalks and unresolved mappings |
| import_file / import_csv | Every original byte and explicit representation, neutral role and source/target/reference side |
| save_mapping / save_correction | Exact compound-key/reference mapping and attributed expected-cell changes |
| save_selection / save_review | Explicit coverage/basis for all roles and an attributed full source review |
| save_contract / prepare_target | Actual template columns, source-key/reference/crosswalk mapping for every selected source; frozen full CSV output |
| record_return | Actual returned files compared to the exact frozen preparation, with missing/changed/duplicate/unreported fields |
| apply_input | Whole pinned operation JSON for requests larger than tool arguments |
| operation / replay_operation | Original request and exact committed receipt, preserved across later operations and response loss |
| file_read / file_release | Complete original bytes through the existing retained read ID/SHA/offset protocol |

Read status, retain its expectedRevision and headSha256, and supply these as expectedRevision and expectedHead for reads. Every mutation supplies the caller's stable operationId, expectedRevision, at and named actor. Keep those values and the full body when retrying. A successful operation's receipt revision is its original commit revision; current describes the later workspace separately. A new request over stale state is rejected. A completed exact request is replayable after later work.

A source import selects an input alias and its configured expectedSha256 plus the actual original filename. Raw file bytes are not tool arguments. For a large scope, supplier contract or other operation, place complete {action,input} JSON in a configured kind:operation file, then call apply_input with its original operationId, alias and SHA. That full selected source file and the complete dispatch body are retained before the writer runs. The full prepared request, including its retained source and exact body, must fit within 128 MiB; the check occurs before dispatch.

A new original request is create-only and durable before native dispatch. If the caller loses a response, inspect operation and call replay_operation using the same ID. Reopening a client does not require the old staging file for an already prepared import. Changed input under the same ID remains a conflict; do not generate another ID merely to evade it. A refusal leaves the original prepared request available for inspection. Corrected new work is an explicitly new operation against the new selected revision.

The same workspace may be used by several clients. Each process uses the original CLI kernel lease and complete content comparison before replacement. A busy original writer may return the native address-in-use error; repeat the same saved operation once that existing writer has finished. No timer, stale-lock deletion or alternate file writer is installed.

## Original operating and financial profiles

The eleven mutation contracts include saveOperatingProfile and saveFinancialProfile. Their complete typed inputs are in agent-client.d.mts and the unchanged API.md. Each selects actual mapping IDs and original policy files from one current source scope. A successor scope requires its own profiles. A new profile leaves every earlier preparation and observed return unchanged and requires a fresh source review before another preparation.

Operating bindings retain explicit date-only or offset timestamps, original code meanings, required fields, units, local-contact consent and original evidence, and recorded waiting-date decisions. They do not calculate eligibility, make a Harbour Master decision, allocate a mooring, issue a permit or synthesize an offer deadline. Missing declarations remain unconfirmed.

Financial bindings retain original amount strings and actual source code/sign multipliers. Charge/payment/allocation endpoints remain original compound identities. Namespace, account, currency and period stay separate; permitted namespace/period triples require exact declarations. Qualified remaining amounts require all four completeness flags and the actual evidence. Selected totals do not establish a debtor balance. No tariff calculator, invoice or money movement is added.

section includes complete operatingProfiles and financialProfiles. analyse accepts optional operatingProfileId and financialProfileId belonging to the selected scope, and pages operatingRows, operatingIssues, financialRows, financialIssues, financialTotals, allocations and residuals alongside the original structural collections. The result always identifies both actual selected profiles/statuses. file_read kind analysis accepts the same explicit profile IDs and returns the whole analysis; kind section returns complete original profile histories. A historical preparation/return report uses its exact original scope and frozen preparation. Do not substitute a current profile's interpretation for the retained original preparation.

## Complete downloads and source closure

file_read kinds are workspace, source, original, section, analysis, target-preview, report, target, returned, working-html, handover and operation. Select id for an original file/source, target contract/preparation or observed return. Target CSV additionally requires tableId. Analysis uses selectionId; a report uses selectionId, preparationId or returnId, and an explicit preparation/return pair must share the same original preparation. A section uses its exact collection name. An original operation uses operationId. All other reads pin expectedRevision and expectedHead.

The actual retained-file response is {readId,file:{name,contentType,bytes,sha256},offset,bytesRead,nextOffset,encoding:"base64",data}. Decode data, append at offset, and retain all selection fields. Continue with the same readId and expectedSha256. nextOffset:null completes and releases the read. On expiry/restart, reopen the same selection with the same expectedSha256 and next offset. Compare the assembled whole byte count and SHA. file_release releases an unfinished read.

Pages are limited to 200 records and 512 KiB. Individual values are never cut off. If a complete row/registry/report is too large for a page, download the full workspace or file; the host response maximum is 1 MiB. Working recovery remains within 128 MiB including drafts. Four active original file reads share 512 MiB of snapshot capacity. Finish/release earlier reads before another complete file. These are explicit acceptance limits, not measured performance guarantees.

The original CLI handover also saves exact Working_Recovery.json alongside every engine member and returns its complete byte identity. Working HTML and ZIP come from the maintained portable builder with the complete source selection. A saved recovery keeps all drafts, their old baseRevision/baseHead, selection and copyId. A later agent edit does not silently rebase the person's unfinished writing: the original browser shows its existing current-revision review path. Reopen a downloaded working HTML or recovery in the original application; different histories remain independent copies. A browser file and a native file are explicit separate saved editions, not a background live synchronization channel.

The installed product source now carries the native agent client/setup, typed declarations and this complete operating/receiving guide in addition to the original offline application. Merchant integration imports the existing installed host modules; run that layer inside the complete selected merchant distribution. The offline HTML remains self-contained for browser work and exports the full selected source. The original frozen customer attachment edition remains separately identified until its owner selects the new installed build.

## Native source and commercial authority

Explicit source declarations retain opaque identities, relationship meanings and coverage. Neutral roles are not supplier-native tables. Permission rows are source assertions, not effective local authorization. A structurally accepted review is not an operating decision or financial signoff or vendor acceptance. No vendor write API, target schema, native version or authorized external import is inferred. A prepared target is a complete file export; record_return requires the actual original returned CSV. The separate Installation/Workshare programme continues to hold its original case, source and commercial selections.

Use AGENT_RECEIVING.md for the full same-programme native and rendered receiving. The producing peer must use and LOOK at the exact outgoing files before presenting them.
