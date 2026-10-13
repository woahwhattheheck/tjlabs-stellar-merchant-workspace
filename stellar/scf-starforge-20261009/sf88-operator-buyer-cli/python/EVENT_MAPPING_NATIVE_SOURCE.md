# Complete mapping work in the native Analysis workspace

The original Event programme can retain a whole offline mapping working copy, including its accepted and current source windows, colleague assignments, complete returns, receiving decisions and unfinished history. The selected native Review validates that whole file against its actual comparison and saves an editable HTML copy from the same installed implementation. Both complete files live in the original workspace database and travel in its existing whole-workspace archive.

This follows the original [colleague review workflow](EVENT_MAPPING_COLLEAGUE.md) and [agent receiving course](EVENT_MAPPING_RECEIVING.md). Use the actual acquired customer source and its existing Analysis programme. The original native Review, customer approval, Apply, report/workbook continuation and delivery remain separate operator decisions.

## Retain and review through the operator page

1. Open the existing private Analysis launch link, then Event programmes. Select the original programme and complete received input.
2. In **Continue the mapping across source editions**, choose the complete working JSON under **Complete working source**. This can be the plain original working file or the complete colleague working copy after receiving a return.
3. Select **Retain whole work and open**. The operator reads the complete file using its original parser, verifies its whole comparison against the current native programme, and uploads exact 64 KiB chunks. Every original byte and the full digest must match before completion. The workspace retains a stopped upload; choosing the same complete file resumes it.
4. The original field choices, reviewer, reason and every required decision open in the native form. Select **Review complete source window** to continue the same native decision. Before that Review runs, the installed validator reopens the full colleague graph and recomputes its recorded receiving results. The native comparison and selected compact attribution must match exactly.
5. Open the saved action. **Download original whole working JSON** receives the exact input bytes. **Download saved editable HTML** receives the exact editor generated during validation. Each full download is hash-checked after receiving all ranges.
6. Continue the original customer approval and Apply. Prepare the existing fresh linked delivery when the customer result is ready.

Changing native fields or attribution after selecting a whole file requires selecting a corresponding changed whole file. The native form refuses to silently associate different choices with its retained source. **Clear whole-source selection** is an explicit choice for a separate native-only draft; the earlier source remains in the database and in any saved action that selected it.

If the native baseline advances before Review, keep the complete working file and compare its next edition using the original workflow. If validation or Review is interrupted, reopen the exact saved action and continue its original request. A different working file has a different full digest and requires its own selected action.

## Agent and installed CLI

Newly prepared `event-mapping-receiving review` requests retain their complete raw working file in the original native workspace before dispatch. The original helper still keeps its full private source and implementation copy. It transfers the complete working file through four named operations:

| Operation | Complete purpose |
| --- | --- |
| `event-mapping-working-create` | Retain original workspace/programme/input, canonical file label, byte count and full SHA-256. |
| `event-mapping-working-status` | Read the immutable identity and exact accepted offset. |
| `event-mapping-working-chunk` | Receive or replay one original contiguous chunk, up to 64 KiB. |
| `event-mapping-working-file` | Receive exact source or saved HTML ranges by selected full digest, including after restore. |

The complete Review request stays within its original compact ceiling and carries `mapping_working_source: {id, bytes, sha256}`. Source IDs are the full SHA-256; they are separate from the original 32-character native action and operation IDs. The existing compact-request receiver and ordinary MCP message limits remain unchanged.

Prepare and run the original source-bound review using actual IDs and directories:

```sh
event-mapping-receiving review-prepare \
  --workspace customer --workspace-id ORIGINAL_WORKSPACE_ID \
  --programme customer_events --input ORIGINAL_INPUT_ID \
  --dir /private/customer/mapping-review \
  --capture-dir /private/customer/mapping-capture \
  --working /private/customer/received-colleague-working.json \
  --action ORIGINAL_ACTION_ID --operation ORIGINAL_OPERATION_ID

event-mapping-receiving review \
  --workspace customer --workspace-id ORIGINAL_WORKSPACE_ID \
  --programme customer_events --input ORIGINAL_INPUT_ID \
  --dir /private/customer/mapping-review \
  --action ORIGINAL_ACTION_ID --operation ORIGINAL_OPERATION_ID \
  --url ORIGINAL_MCP_URL
```

The values in capitals identify actual existing selections; obtain them from the original captured comparison and retained action. Credentials use the existing environment-variable option. If the reply is uncertain, use the original `review-receive` observation. Use explicit `--resume true` only to continue the selected interrupted or failed action after inspecting its saved state.

Existing prepared requests retain their original identities and behavior. Their exact recovery never rewrites a historic request to add a source descriptor. New preparation uses the complete native source path automatically and rejects a BOM-prefixed JSON before retaining a new source/request, matching the native strict decoder.

## Recover after restoring the workspace

Receive and inspect the existing complete workspace archive, restore it through the original Analysis restoration controls and open the restored database with its preserved workspace identity. Register that actual restored directory under the intended agent alias.

The database snapshot contains both source tables, complete BLOB chunks, source descriptors, rendered HTML and evidence, together with the original input chunks and action records. Restoration needs no producer-side receiving folder and no new external payload path.

Use a new private receiving directory and select the exact saved native Review action:

```sh
event-mapping-receiving saved-source \
  --workspace restored_customer --workspace-id ORIGINAL_WORKSPACE_ID \
  --programme customer_events --input ORIGINAL_INPUT_ID \
  --action ORIGINAL_ACTION_ID --operation ORIGINAL_OPERATION_ID \
  --dir /private/customer/restored-mapping \
  --url ORIGINAL_MCP_URL

event-mapping-receiving saved-source-reopen \
  --workspace restored_customer --workspace-id ORIGINAL_WORKSPACE_ID \
  --programme customer_events --input ORIGINAL_INPUT_ID \
  --action ORIGINAL_ACTION_ID --operation ORIGINAL_OPERATION_ID \
  --dir /private/customer/restored-mapping
```

The first command receives the complete selected native action, original working JSON and frozen editable HTML. The same action and source remain pinned across an interrupted range transfer. After the local completed file index is retained, continuation verifies those whole files without querying the producer.

The second command independently checks every retained complete file offline. Keep the original alias in this local download's later reopen command; a different alias is a different receiving endpoint identity. A separate receiving directory can select the same preserved workspace through another actual alias.

| Retained path | Complete content |
| --- | --- |
| `mapping-native-action.json` | The full original saved native action snapshot, including source selection and validation evidence. |
| `saved-source/mapping-native-index.json` | Exact workspace, action, operation, input, source and both file identities. |
| `saved-source/mapping-working.json` | Every exact byte of the original submitted working file. |
| `saved-source/mapping-working.html` | The complete original editable HTML, including its own saved working source and implementation. |
| `saved-source/download-state/` | Original retained-writer progress and endpoint identity for interruption recovery. |

Open the received HTML, inspect the actual source windows and receiving history, edit a complete draft, request a saved successor and reopen that saved file. Keep the whole JSON and HTML together. The original saved HTML retains its own implementation even when the installed product later advances. Server validation always uses its fixed installed source; received or archived JavaScript is never executed by the native service.

## Source and transaction boundaries

The source store uses only additive tables `sf_event_mapping_sources` and `sf_event_mapping_source_chunks` in the existing customer database. Source completion and final full UTF-8/hash checking share one SQLite transaction. A rejected final chunk leaves preceding original chunks available for exact continuation. All rendered HTML chunks and their deterministic evidence commit in one transaction; changed replay cannot replace an earlier rendered edition.

The original programme executor owns validation. It snapshots seven fixed installed modules into its private temporary directory, compares the parser to the exact native receiver identity, validates every complete source/history/receipt, renders the same full working file and checks that installed source did not change during the operation. Validation evidence binds the full original bytes, native context, exact comparison, selected mapping, original reviewer/note/reasons and local assignment/receipt identities. The same action keeps its original source receipt across recovery.

Complete JSON is bounded at 192 MiB; complete editable HTML at 256 MiB; a chunk at 64 KiB. Evidence and fixed renderer descriptors fit the separate 2 MiB metadata bound. The original archive's complete database limits and storage requirements continue to apply to these retained source and HTML bytes.

## Original native and producing-operator course

Continue the already-owned Mercury/A66C/22B7 operation with its actual acquired source, programme, original comparison and customer workbook. Preserve the original receiving controller and source selection. The complete course is:

- Issue a whole colleague assignment from that actual comparison; review and return it through the complete editor, then resolve a genuine overlap with the producer's current work.
- Retain that exact received whole file through the native operator or original typed agent. Reopen the original saved action and check both complete downloads against their selected identities.
- Continue the explicit original customer acceptance and full delivery. Restore the exact whole workspace into the separately chosen original receiving location.
- Remove the producer-side mapping capture/review directory from the receiving context. From the restored native workspace, open the same action and obtain its whole JSON and saved HTML through the operator and `saved-source`.
- Finish an interrupted download using the same retained directory. Close the service and run `saved-source-reopen`; open, edit, save and reopen the downloaded editor.
- The producing operator must open and operate the exact outgoing files and inspect the actual screen: normal width, relevant narrow width, source populations, current and returned decisions, saved action, both full downloads and the reopened saved copy. Return actual screenshots and complete retained results to the existing source owner for inspection and direct repair.

The owner handoff at 1791908979.290839 quotes Bryce's release of the temporary local in-app browser reservation. Preserve existing tabs, saved state and all other owner instructions while following the original equipped operator course.
