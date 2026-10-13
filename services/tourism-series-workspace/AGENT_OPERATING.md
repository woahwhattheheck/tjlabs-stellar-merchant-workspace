# Tourism series: original agent and merchant operations

This installed contribution lets an agent operate the same complete Tourism workspace that a person can download, reopen and edit in the existing offline application. It retains source files, registry and mapping editions, raw rows, attributed corrections, qualified calculations, frozen reports, actual target CSVs and observed returns. It preserves the working recovery's unfinished forms, selected controls and browser copy ID. The original pure engine and the original kernel-held CLI writer remain authoritative.

## Select the complete existing workspace

Use Node 20+ on the original Linux or Windows runtime. The existing CLI uses a kernel-held local IPC lease; do not substitute an uncoordinated JSON writer. Select a complete workspace JSON or the browser's complete working recovery JSON. Give an explicit absolute file path and its original logical genesis: ID, title and createdAt. A reused ID with another title or creation time is another workspace.

A private connection file has this shape; replace every illustrative path, ID, time and byte identity with the actual selected file. No source credentials or recipient contacts belong in this public example.

```json
{
  "schema": "stellar-forge.tourism-series-agent.v1",
  "workspaces": {
    "original": {
      "label": "Original source series",
      "workspacePath": "/absolute/private/Working_Recovery.json",
      "operationsDirectory": "/absolute/private/tourism-operations",
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
import {initializeTourismMerchant} from './agent-setup.mjs';
const setup = await initializeTourismMerchant({
  directory: '/absolute/private/tourism-merchant',
  connection: '/absolute/private/tourism-connection.json',
  name: 'Original Tourism source work'
});
```

This uses the maintained native release-store initializer, original private lock and ordinary merchant configuration loader. A repeated identical setup resumes the same retained intent. A different name, connection or release-store path conflicts with that original setup. The generated merchant-mcp.json uses tourismSeriesConnection; the original source-owned provider discovers and loads it through the installed contribution. Continue the existing merchant MCP host using that actual configuration. No extra server, watcher, credential store or parallel workspace is created.

## Operate the original selection

The typed host class is TourismSeriesClient from agent-client.mjs; agent-client.d.mts describes every native input. readTourismConfiguration reads and pins the actual genesis. The source-owned merchant prefix is merchant_tourism_series_.

| Operation | Original behavior |
| --- | --- |
| workspaces / status | Configured aliases, pinned available inputs, exact logical genesis, revision/head, browser copy, selected controls and unfinished form names |
| section / rows | Complete, paged original collections or raw CSV records at a selected revision/head |
| project / calculate | Actual engine projection and qualified arithmetic, with source dimensions, findings, coverage and original operand IDs |
| import_file / import_csv | Complete configured original bytes, physical metadata and all raw records |
| save_registry / save_mapping | Explicit source-backed declaration edition and full canonical column/constant mapping |
| save_correction | Attributed cell overlay with original row/column; raw CSV remains retained |
| save_analysis / save_report | Immutable calculation and readable report editions, including actual original operands |
| prepare_target | Every selected row mapped to an actual retained template, including explicit key columns |
| record_target_return | Complete observed target CSV compared to its original prepared export; extra native fields retained |
| apply_input | Whole pinned operation JSON for a request larger than the tool argument budget |
| operation / replay_operation | Original prepared request, original committed receipt, and exact continuation after interruption |
| file_read / file_release | Every byte of complete files through the host's retained read ID/SHA/offset protocol |

Read status, retain its expectedRevision and headSha256, and supply these as expectedRevision and expectedHead for reads. Every mutation supplies the caller's stable operationId, expectedRevision and at. Keep those values and the full body when retrying. A successful operation's receipt revision is its original commit revision; current describes the later workspace separately. A new request over stale state is rejected. A completed exact request is replayable after later work.

A source import selects an input alias and its configured expectedSha256 plus the actual original filename. Raw file bytes are not tool arguments. For a large registry or other operation, place complete {action,input} JSON in a configured kind:operation file, then call apply_input with its original operationId, alias and SHA. That full selected source file and the complete dispatch body are retained before the writer runs. The full prepared request, including its retained source and exact body, must fit within 128 MiB; the check occurs before dispatch.

A new original request is create-only and durable before native dispatch. If the caller loses a response, inspect operation and call replay_operation using the same ID. Reopening a client does not require the old staging file for an already prepared import. Changed input under the same ID remains a conflict; do not generate another ID merely to evade it. A refusal leaves the original prepared request available for inspection. Corrected new work is an explicitly new operation against the new selected revision.

The same workspace may be used by several clients. Each process uses the original CLI kernel lease and complete content comparison before replacement. A busy original writer may return the native address-in-use error; repeat the same saved operation once that existing writer has finished. No timer, stale-lock deletion or alternate file writer is installed.

## Complete downloads and source closure

file_read kinds are workspace, source, original, report, target, returned, working-html, handover and operation. Select id for one source/original/report/target/return, or operationId for an original request. Every non-operation selection pins expectedRevision and expectedHead.

The actual retained-file response is {readId,file:{name,contentType,bytes,sha256},offset,bytesRead,nextOffset,encoding:"base64",data}. Decode data, append at offset, and retain all selection fields. Continue with the same readId and expectedSha256. nextOffset:null completes and releases the read. On expiry/restart, reopen the same selection with the same expectedSha256 and next offset. Compare the assembled whole byte count and SHA. file_release releases an unfinished read.

Pages are limited to 200 records and 512 KiB. Individual values are never cut off. If a complete row/registry/report is too large for a page, download the full workspace or file; the host response maximum is 1 MiB. Working recovery remains within 128 MiB including drafts. Four active original file reads share 512 MiB of snapshot capacity. Finish/release earlier reads before another complete file. These are explicit acceptance limits, not measured performance guarantees.

The original CLI handover also saves exact Working_Recovery.json alongside every engine member and returns its complete byte identity. Working HTML and ZIP come from the maintained portable builder with the complete source selection. A saved recovery keeps all drafts, their old baseRevision/baseHead, selection and copyId. A later agent edit does not silently rebase the person's unfinished writing: the original browser shows its existing current-revision review path. Reopen a downloaded working HTML or recovery in the original application; different histories remain independent copies. A browser file and a native file are explicit separate saved editions, not a background live synchronization channel.

The installed product source now carries the native agent client/setup, typed declarations and this complete operating/receiving guide in addition to the original offline application. Merchant integration imports the existing installed host modules; run that layer inside the complete selected merchant distribution. The offline HTML remains self-contained for browser work and exports the full selected source. The original frozen customer attachment edition remains separately identified until its owner selects the new installed build.

## Native source and commercial authority

Registry declarations control legitimate metric/geography/period/method/population/unit comparisons. A local calculation cannot infer supplier data rights, a vendor API, a missing target schema or an authorized external import. A prepared target is a complete export; record_target_return requires the actual original returned CSV. The separate Installation/Workshare programme continues to hold its original case, source and commercial selections.

Use AGENT_RECEIVING.md for the full same-programme native and rendered receiving. The producing peer must use and LOOK at the exact outgoing files before presenting them.
