# Econdb through the original Merchant operator

This chapter completes the existing Econdb Application and source/project/publication workflow through Merchant MCP. The provider uses the original Econdb workspace functions, lock, request UUIDs, revisions, retained files and calculation modules. The browser, CLI and tools operate the same workspace. The adapter does not start or close the existing Econdb Application, native seller or buyer.

Use the complete maintained distribution selected by `selections/econdb-maritime.json`. Its `econdb-maritime` contribution declares the provider, source modules, command and download API. The family is `econdb-workspaces`, normalized configuration key `econdbWorkspaces`, and original host field `econdbWorkspaceConnection`. A host without that connection advertises no Econdb tools. Runtime imports remain lazy.

## Select the original workspace

Read its original `econdb status --directory DIR` output. Retain the actual workspace UUID, source engine identities, current revision, selected records and any pending UUID. Complete a pending original operation before handover; an incomplete failed command can be preserved with its original explicit note.

Create a private, host-owned connection file. All paths are selected by the host. Relative paths resolve beside this file.

~~~json
{
  "schema": "stellar-forge.econdb-workspace-connections.v1",
  "workspaces": {
    "maritime": {
      "label": "Original maritime workspace",
      "directory": "/private/original-econdb",
      "workspaceId": "ACTUAL-ORIGINAL-WORKSPACE-UUID",
      "inputs": {
        "selected_source": "/private/requests/receive-source.json",
        "selected_analysis": "/private/requests/analysis.json",
        "selected_project": "/private/requests/project.json"
      },
      "buyerInboxes": ["/private/original-buyer-inbox"],
      "exportsDirectory": "/private/econdb-handovers",
      "destinations": {
        "independent": "/private/received-econdb"
      }
    }
  }
}
~~~

Replace the uppercase UUID placeholder with the actual original value. Input aliases name complete original operator command files, not snippets or regenerated summaries. These files must be private regular files owned by the current host. Handover storage must already exist as a private canonical directory and remain separate from every configured workspace. Receiving destinations must be independent of all configured workspace and handover roots. No tool accepts a new filesystem path from a caller. Only an explicitly configured existing buyer inbox can supply a buyer-export request.

The connection carries no API tokens. Capture new issuer data through the existing `econdb-source capture` course and preserve its original raw response and descriptor. This adapter receives those completed originals.

Initialize one Merchant host:

~~~sh
starforge econdb-mcp init --directory /private/econdb-mcp \
  --connection /private/econdb-connection.json
starforge merchant-mcp serve \
  --config /private/econdb-mcp/merchant-mcp.json --port 3211
~~~

Supply the existing private MCP token through `MCP_ACCESS_TOKEN`; use the maintained OAuth resource configuration when that is the selected host authentication. The original Merchant server binds loopback. Both HTTP and stdio use the same configured provider and native workspace. The initialization output can be reopened with the same name and connection; a partially prepared host remains in its own initialization sibling and is never published as the final host.

For an existing Merchant configuration, retain its other fields and add `"econdbWorkspaceConnection": "/private/econdb-connection.json"`. Reopen that Merchant operator at its existing safe boundary. The Econdb Application and workspace do not need a second instance.

## Original command files and exact recovery

The original command remains:

~~~json
{
  "id": "ACTUAL-RETAINED-UUID",
  "expectedRevision": 4,
  "action": "analyze",
  "input": {
    "sourceId": "ACTUAL-SAVED-SOURCE-RECORD-UUID",
    "selection": {"from": "2022-02-01", "until": "2022-04-01"},
    "title": "Selected original source period"
  }
}
~~~

The example dates are the existing issuer documentation example, not a current production period. Choose actual saved source records and explicit periods for the real case. Preserve the command file before dispatch.

| Original action | Complete input |
| --- | --- |
| `receive-source` | Exact UTF-8 `raw` response and full original `descriptor`. |
| `analyze` | Saved `sourceId`, optional `previousId`, `selection`, optional paired `before`/`after`, and `title`. |
| `project-build` | Full native project `config`; entries select saved current/previous source-record UUIDs. |
| `project-import` | Entire saved browser project text in `workspace`. |
| `publication-build` | Exactly one saved source plus `selection`, or saved `projectId` plus explicit `editionRoles`; complete dataset `name`. |
| `merchant-prepare` | Saved `publicationId`, explicit original `payment`, `origin`, optional `path`, and `title`. Produces configuration; it does not run a seller. |
| `buyer-export` | Saved `publicationId`, host-declared existing `inboxDirectory`, original ordered `intents`, and `title`. Exports existing returned delivery; it does not purchase. |

Use `merchant_econdb_inputs` to see declared aliases. `merchant_econdb_input_inspect` returns exact byte length/SHA256 and the native request UUID, action and expected revision. Supply that byte SHA to `merchant_econdb_command`.

The inspected file-byte SHA is distinct from the canonical JSON request hash retained inside the native journal. Both are preserved. Whitespace changes the file SHA even when parsed JSON remains identical. No command is regenerated during a retry.

After uncertainty, read `merchant_econdb_request` using the same original UUID. The original status and exact request file are returned. Repeat the same alias and byte SHA. The native operator returns the existing completed record or resumes its original pending operation before applying fresh-revision checks. It rejects changed contents under an existing UUID and unrelated work while another command is pending. An old completed request stays replayable after later revisions.

A failed command with a retained original error and no completed result can be explicitly closed with `merchant_econdb_preserve_failed`, its exact current revision and a substantive note. The native function preserves every byte and records an incomplete disposition. A transport timeout alone is not proof of failure; inspect the original request first.

## Complete tool family

All argument objects are closed. Workspace tools require the configured alias and actual `workspaceId`.

| Tool suffix after `merchant_econdb_` | Use |
| --- | --- |
| `workspaces` | Configured aliases and IDs; no application starts. |
| `status` | Current original revision, pending state, engine compatibility and paged records. |
| `inputs` / `input_inspect` | Declared complete request files and reviewed byte identities. |
| `command` | The exact original operation, with native lock/replay. |
| `request` / `request_file` | Native status/receipt and every original request byte. |
| `preserve_failed` | Reasoned preservation of a native failed incomplete command. |
| `files` / `file_read` / `file_release` | Paged original artifact inventory and bounded exact-file reads. |
| `handover` | Complete native workspace export under a named `exportId`. |
| `handover_manifest` / `handover_file` / `handover_file_release` | Original transfer identity and complete resumable member reads. |
| `receive` | Native independent receiving into the configured destination alias. |

Records and artifact files use `offset`, `limit` and `nextOffset`; continue until null. Pages contain up to100 rows. File chunks contain at most196,608 bytes, use base64 and report original size/SHA, byte offset and nextOffset. The complete source is never replaced by a preview.

Read leases are process-local and expire when idle. After release or host restart, omit `readId` and resume the same original file with its exact SHA and offset. The maintained reader verifies the original descriptor, hash and unchanged inode timestamps; a changed source is refused. Closing the adapter waits for its accepted calls and closes only its own file descriptors.

## Download and independently receive the whole workspace

Call `merchant_econdb_handover` once with a chosen exportId. It uses the original native exporter and retains every workspace member: source responses/descriptors, commands and errors, saved analyses, project inputs, reports, typed publications, merchant terms, existing buyer returns and original history. The complete original `operator-transfer.json` is retained byte-for-byte. A small additional manifest maps those exact files for the maintained downloader.

An already-created export is immutable. If the source workspace has advanced, use `handover_manifest` to download its historical edition; use a distinct explicit exportId only when choosing a new edition. Repeating the export operation after an unchanged interrupted publication reconciles the same original transfer.

~~~sh
starforge econdb-mcp inspect --url http://127.0.0.1:3211 \
  --workspace maritime --workspace-id ACTUAL_UUID --export-id original-delivery

starforge econdb-mcp download --url http://127.0.0.1:3211 \
  --workspace maritime --workspace-id ACTUAL_UUID --export-id original-delivery \
  --manifest-sha256 ACTUAL_MANIFEST_SHA \
  --directory /private/downloaded-econdb

starforge econdb-mcp receive --directory /private/downloaded-econdb \
  --destination /private/independent-econdb
~~~

The downloader is the existing `createRetainedDownload` implementation: original chunk hashes, private checkpoint, create-only publication and complete manifest last. An interrupted download resumes the same directory and endpoint identity. It does not rerun source capture, analysis, export or payment. Each file supports the maintained8GiB immutable-file limit; the entire workspace is not packed into an artificial small JSON backup. The complete manifest has a64MiB bound and the checkpoint128MiB bound. Source engines retain their own existing limits.

Receiving verifies the original native manifest and every file before publishing the independent workspace. Repeating an unchanged receive reopens it; an advanced destination is preserved and refused as a new receiving target. Continue in that received workspace using the original installed Econdb Application/CLI and its actual source version. The original workspace manifest retains calculation source hashes; ship the matching complete application/distribution source alongside the workspace. This transfer is a complete data/work-history handover, not a replacement for the maintained software package.

For native consumers, `./merchant/econdb/download` exports `downloadEcondbHandover`, `inspectEcondbHandover` and `receiveEcondbHandover` with TypeScript declarations. A supplied `{endpoint,call}` client can reuse an existing authorized Merchant connection. Its stable endpoint identity must continue identifying the same actual host/workspace.

## Actual original receiving

This is an additive chapter of operation ECONDB-MARITIME-PERIOD-WORKSHARE-BBBD-20261013. The earlier source, project, SF30 and installed-operator course remains authoritative. Join the currently accepting owner; preserve its browser, native processes, source choices and prior results.

Use the complete source/distribution containing this provider. Once the original populated operator course has delivered an actual completed analysis record, run:

~~~sh
node stellar-forge/mcp-merchant-operator/receiving/econdb-workspace.mjs \
  --workspace /absolute/original-econdb-workspace \
  --analysis ACTUAL_COMPLETED_ANALYSIS_UUID \
  --out /absolute/original-course/econdb-mcp \
  --source-commit ACTUAL_SELECTED_SOURCE_COMMIT
~~~

This program uses the actual existing analysis input and original workspace. It retains one new complete request before dispatch, starts one owned ordinary loopback Merchant endpoint for the receiving chapter, operates the16-tool family through the maintained HTTP client, applies/replays the exact original analysis, replays its older parent, retrieves the original command and files, closes/reopens that same Merchant host, downloads every complete transfer member twice into the same checkpoint, then independently opens the original received workspace. Its `finally` closes only the endpoint it owns. A completed native result can be reopened without rerunning its commands or replacing an independently advanced workspace.

The program records `NATIVE_COMPLETE_PENDING_RENDERED_ATTACHMENT_REVIEW`. That is a precise operating state, not a claim that the product has been visually reviewed.

Continue in the original already-equipped browser. Open the existing Econdb Application on the independent workspace at desktop and390px, inspect the new analysis and prior history, choose an explicit original-source period, save and reopen the resulting analysis. View the actual screenshots you capture. Open the complete downloaded report HTML, observations CSV, JSON, original raw/descriptor pair, editable project/browser workspace where present, source/typed publication and any actual existing buyer return. Use the contents of every outgoing archive/project and reopen the same complete application after a cold restart. Keep actual customer/payment roles and rights unselected when they have not been supplied.

Return the source commit, original/independent workspace IDs, exact native result, full outputs, viewed screenshots and any material failure to the original Econdb case. Repair that same source and operation. Existing source-only checks do not establish native, browser, installed-package or customer completion.

## Source and owner instructions

Current originals are `operator.mjs`, `maritime-analysis.mjs`, `maritime-native.mjs`, `maritime-project-native.mjs`, `sf30-publication.mjs`, the source-owned Merchant registry and the retained-file reader/downloader. Their contracts are reused directly. Provider registration adds to the existing product contribution without editing another family's catalogue or ownership.

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
