# Original Event mapping source and review receiving

This command-line path retains the complete original accepted/current Event source pair, its exact installed parser and editable working application, then receives an attributed mapping review through the existing named Analysis service. The original programme and native Review writer remain the authority. Review acceptance is distinct from applying an analysis or producing a workbook delivery.

The companion file-only editor is `event-feed/mapping-working-cli.mjs`. It edits or renders a complete captured working file without a service connection. The receiving CLI described here is `event-feed/mapping-receiving-cli.mjs`; it uses the maintained `stellar-forge/mcp-paid-agent/native-analysis-events-mapping.mjs` helper. Use the installed source tree containing both paths. A compact Analysis-only source selection may include the standalone working CLI without this named-agent receiving helper; do not assume that registering one installs the other.

## Select the original operation

Use the caller's actual configured MCP endpoint, registered Analysis workspace alias, native workspace ID, programme name and retained current-input ID. The alias is the existing service registration, not a new workspace. A comparison must be the complete original enriched result selected for that same programme/input, including its native revision, accepted baseline operation, original file identities and parser identity.

Keep the original complete source files and directories private. The maintained file reader requires regular owner-controlled files, and the receiving directories must be private, canonical directories belonging to the current operator. Create any necessary parent directory beforehand. Do not replace an existing source directory with a different comparison, mapping, parser or review. Use an explicitly selected later edition while retaining every original.

For shell examples below, set `MAPPING_CLI` to the actual installed `event-feed/mapping-receiving-cli.mjs` path, and set the other variables from the original receiver's real configuration and records. No command generates replacement action, operation or workspace IDs. Keep the original environment-variable credential route; do not put a token in a URL, argument, working file or guide.

```sh
node "$MAPPING_CLI" --help
```

Every operation requires these five flags:

| Flag | Original value |
| --- | --- |
| `--workspace` | Configured Analysis alias |
| `--workspace-id` | Exact native workspace ID |
| `--programme` | Original programme name |
| `--input` | Exact retained current-input ID |
| `--dir` | Private capture or review directory |

Network commands accept `--url`, `--token-env` and a positive integer `--timeout-ms`. The timeout is forwarded to the helper's corresponding service request; it is not a deadline for completing a whole multi-request source transfer. The exported JavaScript runner also accepts the original `client`, `environment` and `signal`; an explicit client and URL cannot be supplied together.

## Capture the whole original source

First preserve the selected complete comparison and optional unfinished draft before any provider call:

```sh
node "$MAPPING_CLI" capture-prepare \
  --workspace "$ANALYSIS_ALIAS" --workspace-id "$WORKSPACE_ID" \
  --programme "$PROGRAMME" --input "$INPUT_ID" --dir "$CAPTURE_DIRECTORY" \
  --comparison "$COMPLETE_COMPARISON_FILE"
```

An optional `--draft "$COMPLETE_DRAFT_FILE"` retains the complete draft exactly. Its fields are `fields`, `reviewer`, `note` and `decisions`. With no draft, the original comparison fields are used with blank attribution; the operator supplies the actual review later. A prepared capture is not a downloaded source.

Download through the original service:

```sh
node "$MAPPING_CLI" capture \
  --workspace "$ANALYSIS_ALIAS" --workspace-id "$WORKSPACE_ID" \
  --programme "$PROGRAMME" --input "$INPUT_ID" --dir "$CAPTURE_DIRECTORY" \
  --url "$ORIGINAL_MCP_URL" --token-env "$ORIGINAL_TOKEN_ENV"
```

This command can also perform the first preparation when `--comparison` and optional `--draft` are supplied. Once preparation has completed, omit those external paths to resume from the directory's retained bytes. If supplied again, they must still match the original files exactly.

The helper pins the selected comparison before requesting `event-mapping-source`. It retains and transmits the entire compact selection through `event-mapping-request-create`, `event-mapping-request-chunk` and `event-mapping-request-source`, using contiguous 64 KiB pieces. The final call carries only `mapping_request_source:{id,bytes,sha256}`. That source descriptor identifies the complete original selection, including every mapping field; its ID is the first 32 hexadecimal characters of the full request SHA-256, with full-byte and digest checks retaining collision protection. It downloads the complete original record in bounded, verified chunks, preserving its immutable record identity and progress. It then validates both original Event file pairs against the comparison, checks the exact parser and generates the full working JSON and self-contained HTML. The result's `workingFile` and `editableFile` name those actual files when the capture is complete.

| Saved source | Meaning |
| --- | --- |
| `mapping-capture-request.json` | Exact alias, source context, comparison/draft and renderer identities |
| `original-comparison.json`, `original-draft.json` | Complete original selected bytes |
| `renderer/` | Original parser, model, composer and browser controller |
| `mapping-source-record.json` | Immutable native complete-record descriptor |
| `source-download/mapping-source.json` | Complete original source-pair record |
| `source-download/mapping-source-index.json` | Completed verified transfer index |
| `previous-events.ndjson`, `previous-manifest.json` | Exact accepted original file pair |
| `current-events.ndjson`, `current-manifest.json` | Exact selected current original file pair |
| `mapping-working.json`, `mapping-working.html` | Complete source-bound working document and editable application |
| `mapping-capture-complete.json` | Full generated-output identities |

Independently reopen that whole capture without a service call:

```sh
node "$MAPPING_CLI" capture-reopen \
  --workspace "$ANALYSIS_ALIAS" --workspace-id "$WORKSPACE_ID" \
  --programme "$PROGRAMME" --input "$INPUT_ID" --dir "$CAPTURE_DIRECTORY"
```

Reopening verifies every original file, selected record, exact renderer, generated working application and completion record. It does not silently regenerate a missing or changed output as an accepted original.

## Edit the retained working document

Open the actual `mapping-working.html`. Inspect both complete original source windows and the added-event catalogue; inspect field pointers, missing values and exact returned value pages. Edit the mapping and attribution, recompute through the embedded original parser, then deliberately fill every required decision reason for that comparison. Complete working JSON and HTML downloads retain original file pairs, all current unfinished fields and complete earlier comparison/draft editions.

The browser's checkpoint is an explicit choice. It never replaces the embedded original automatically. Keep the current complete working file, and download any separately displaced in-window edition you need before closing that browser window.

For a file-only path, use the installed `mapping-working-cli.mjs` commands `inspect`, `update`, `compare`, `native`, `html` or `sources`. The captured renderer remains available in `renderer/` for independently reopening the exact historical edition. A later installed parser must not be substituted for the parser selected by the original source.

Before preparing a native review, inspect the actual current comparison and its required reasons. The receiving helper requires a ready review; unfinished work remains usable as a complete working document and is not converted into an attributed native decision.

## Prepare the complete original native review

Select the actual returned whole working JSON and its complete capture. Select action and operation IDs once in the original operation. Reuse those exact IDs after interrupted preparation or an uncertain response.

```sh
node "$MAPPING_CLI" review-prepare \
  --workspace "$ANALYSIS_ALIAS" --workspace-id "$WORKSPACE_ID" \
  --programme "$PROGRAMME" --input "$INPUT_ID" --dir "$REVIEW_DIRECTORY" \
  --capture-dir "$CAPTURE_DIRECTORY" --working "$RETURNED_WORKING_FILE" \
  --action "$ACTION_ID" --operation "$OPERATION_ID"
```

The first review preparation requires both `--capture-dir` and `--working`. It independently reopens the complete capture, verifies that the returned working document retains its exact original source, validates the actual comparison and deliberate decisions, and saves all original reader sources before publishing the stable review request.

The review directory owns these complete originals:

| Saved source | Meaning |
| --- | --- |
| `original-capture-working.json` | Whole captured original, independently reopened before preparation |
| `mapping-working.json` | Exact returned working-file bytes |
| `renderer/` | Complete selected original renderer source set; see the four-/five-/six-module compatibility rule below. |
| `mapping-review-request.json` | Full stable context, source identities and native request |

After the preparation marker exists, either external source path may be omitted. If provided again, the full selected source must match. Do not change a prepared directory to a different returned draft or reuse its IDs for a different attributed review.

## Submit and observe the saved original action

```sh
node "$MAPPING_CLI" review \
  --workspace "$ANALYSIS_ALIAS" --workspace-id "$WORKSPACE_ID" \
  --programme "$PROGRAMME" --input "$INPUT_ID" --dir "$REVIEW_DIRECTORY" \
  --action "$ACTION_ID" --operation "$OPERATION_ID" \
  --url "$ORIGINAL_MCP_URL" --token-env "$ORIGINAL_TOKEN_ENV"
```

The helper checks the actual native workspace and retains the entire prepared compact review request as an immutable `stellar-forge.analysis-event-mapping-request-source.v1` source. It transfers all of those bytes through the same named source receiving route in contiguous 64 KiB pieces, then calls the original `event-review` writer with only `mapping_request_source:{id,bytes,sha256}` and the selected resume flag. The provider reconstructs the complete original request locally, preserving its exact action, operation, mapping and attribution, and the helper receives the complete saved action. It validates the full request and, when complete, the original mapping-review evidence against the retained working comparison. The CLI prints the helper's actual state: `PREPARED`, `READY`, `RUNNING`, `COMPLETE`, `ERROR` or `INTERRUPTED` as returned for the selected phase. A zero CLI exit code means that command returned successfully; inspect its state to determine the native outcome.

If the response is lost or uncertain, observe the original action before choosing another dispatch:

```sh
node "$MAPPING_CLI" review-receive \
  --workspace "$ANALYSIS_ALIAS" --workspace-id "$WORKSPACE_ID" \
  --programme "$PROGRAMME" --input "$INPUT_ID" --dir "$REVIEW_DIRECTORY" \
  --action "$ACTION_ID" --operation "$OPERATION_ID" \
  --url "$ORIGINAL_MCP_URL" --token-env "$ORIGINAL_TOKEN_ENV"
```

This calls `event-action` and receives its exact current complete record. It sends no additional Review request. Every received action edition is preserved under `action-records/<SHA256>.json` together with its original descriptor `<SHA256>.record.json`. Later native state does not overwrite an earlier snapshot.

If the original service requires an explicit resume after an interrupted/error action, inspect that saved state first, then use `review` with the same directory, action, operation and `--resume true`. `--resume false` is also passed explicitly when selected. Omitting the flag preserves the native service's ordinary behavior. A changed source or a new intended decision requires its own retained edition.

Independently reopen one exact saved action snapshot:

```sh
node "$MAPPING_CLI" review-reopen \
  --workspace "$ANALYSIS_ALIAS" --workspace-id "$WORKSPACE_ID" \
  --programme "$PROGRAMME" --input "$INPUT_ID" --dir "$REVIEW_DIRECTORY" \
  --action "$ACTION_ID" --operation "$OPERATION_ID" \
  --record-sha256 "$RECEIVED_RECORD_SHA256"
```

Use the actual `record.sha256` returned by the successful receive. Without `--record-sha256`, this command verifies the full prepared review only and returns `PREPARED`; it does not guess which saved native action edition is current. Reopening never contacts the service.

## Interruption, limits and complete receiving

SIGINT, SIGTERM and a supplied parent AbortSignal flow into the existing helper. Keep the same private directory and original IDs. The CLI removes its signal listeners when the invocation settles; it does not close an original caller-owned client. An interruption can leave an incomplete transfer or an already-created native action. Recover through the same selected capture or saved action rather than infer that a missing response meant no work occurred.

Current source-pair/working allowance is 192 MiB. The original comparison and ordinary saved action retain the original 64 MiB record allowance. The narrowly scoped large source kind does not increase every native record's capacity. Installed source modules are each bounded at 2 MiB; the optional complete draft file is bounded at 4 MiB. Each entire compact capture selection or native mapping-review request is at most 1,046,528 bytes (1 MiB minus 2 KiB for the native envelope). These complete compact bytes travel through the immutable named request-source route; they are never emitted as one oversized MCP message. The separate file-only working-review export keeps its original 32 MiB limit. These are distinct contracts; none authorizes dropping original source, unfinished draft fields or history.

Preserve the complete capture and review directories together with the original native case. Their exact original files, working applications, parser/controller source, native request and saved action editions are the portable receiving record. Use the existing original Analysis operation and browser context to open the actual saved action, inspect its full mapping review, and join any later Apply/report/workbook delivery through that original workflow.

## Producing-owner visual inspection

The producing peer must open, use and personally look at the exact human-facing edition and every outgoing attachment. Operate the actual working HTML at desktop and narrow widths, inspect both original windows, field/value controls, unfinished edits, deliberate comparison/reasons, checkpoint inspection, complete downloads and independent reopening. Inspect the original native Saved actions and its complete review source after receiving. Preserve the resulting real images and full outputs in the same operation, and fix visible defects before presentation.

The earlier local in-app-browser meeting reservation was released in owner handoff1791908979.290839, which quotes Bryce's meeting-end direction. Preserve existing user tabs/state and every other actual owner instruction. This source delivery creates no separate browser queue, native workspace, customer message or sender.


## Complete colleague review return

The editable HTML produced by a new capture includes the complete [colleague review workflow](EVENT_MAPPING_COLLEAGUE.md). The original engineer issues an immutable assignment containing both whole source windows and the actual baseline. A reviewing colleague works with that same source, retains all fields and unfinished reasons, and returns a complete file. The original engineer compares the issued baseline, current work and returned work. Mapping fields, their exact comparison and their reasons remain one atomic choice; reviewer and purpose note are separate attributed choices. Genuine overlaps require an explicit selection.

Keep the complete colleague working JSON through native receiving. The existing `review-prepare` command accepts either the original plain working file or `stellar-forge.event-mapping-colleague-working.v1`. It validates the entire wrapper, exact issued/returned source graph and recorded receiving results, then derives the compact native Review from the selected `working` object. The full original input bytes are retained unchanged as `mapping-working.json`; `original-capture-working.json` retains the exact original capture. Neither source is replaced by the compact native request. Every returned Review receipt exposes `workingFile` and `captureFile` so the producer can reopen those two complete sources beside the selected native action.

New captures pin six complete implementation modules: the original parser, working model, composer and controller, plus `mapping-review.mjs` and `mapping-review-ui.mjs`. Earlier four-module capture directories keep their original renderer and continue to reopen independently. When an earlier capture receives its first complete colleague wrapper, the installed helper adds the exact selected complete colleague model to that review directory after checking its bytes; its original four sources stay retained. Once preparation is complete, review reopening uses only that retained source set. A different file at an existing source identity fails instead of silently choosing another implementation.

Continue the original capture, action and operation IDs. After an uncertain native response, use the existing read-only `review-receive`, then select the actual immutable record SHA with `review-reopen`. The saved native action contains the ordinary mapping review; the companion retained working file contains the full assignments, returns, before/after copies, local authority, carried source history and unfinished choices. Native Apply and later report/workbook delivery remain the original deliberate Analysis steps.

The full colleague wrapper/envelope keeps the same 192 MiB allowance as the working source. The compact native request keeps the existing 1,046,528-byte limit and contiguous 64 KiB request-source transfer. A complete wrapper is never sent as one tool message. Preserve complete files when a limit is reached and inspect the selected source; history is not dropped to make a request fit.


## Complete native source and restored-workspace receiving

Newly prepared reviews now retain the exact whole working JSON in the original native workspace, including the full colleague graph when present. The existing compact Review request carries its full source identity; native validation compares that complete source with the actual original comparison and saves its exact editable HTML atomically. Both files travel in the existing whole database archive.

Use `saved-source` with the original workspace/programme/input/action/operation and a new private directory to receive both full files from the original or restored workspace. `saved-source-reopen` checks the complete local result offline. The original producer capture/review folders are unnecessary for this saved-native course. Existing prepared requests keep their original recovery semantics.

The complete operator, CLI, interruption and archive restoration course is [Complete mapping work in the native Analysis workspace](EVENT_MAPPING_NATIVE_SOURCE.md). It includes the actual producing-operator screen, edit/save/reopen and original receiver requirements.
