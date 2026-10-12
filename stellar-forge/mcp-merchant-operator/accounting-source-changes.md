# Chart changes through the accounting agent connection

The accounting agent, customer CLI and browser use the same leased workspace, source-change records and QuickBooks/Xero controllers. A source change retains the original economic source and replaces a selected unused plan after the operator reviews its target chart, account mappings and home-currency values.

Use the existing merchant MCP endpoint and configured accounting workspace alias. Declare input files in that workspace's existing platformInputs map. Keep tokens in the configured environment variable. A chart-change input carries the original workspace binding; workspaceId is its SHA256 identity, while change, plan, successor and application IDs are the original lowercase UUIDs.

## Complete workflow

| Stage | Read or preview | Explicit saved action |
| --- | --- | --- |
| Choose source | source-change-status, with plans, contexts or changes pages | None |
| Compare charts | source-change-inspect using the original SourceChangeInspectInput alias | None |
| Review successor | source-change-preview using the complete SourceChangePrepareInput alias | source-change-prepare |
| Approve replacement | source-change-apply-preview with the saved change ID, native preview, current revision, application ID, operator note and all three confirmations | source-change-apply |
| Recover | source-change-detail and the original application identity | source-change-resume |
| Receive handoff | The existing accounting file reader | A new private output file |

The tool prefix is merchant_accounting_qbo_ or merchant_accounting_xero_. Direct MCP tool names use underscores; the client and CLI action names use hyphens. Both platforms expose the same chart-change actions.

Inspect the original comparison and every account or economic-source page that affects the successor. The inspect response includes nativeBinding, predecessor identity, comparison SHA256, target source metadata and paged row or entry defaults. QuickBooks targets use the exact normalized company snapshot; Xero targets use the original retained context ID and digest. Existing native company and context tools can receive those original sources.

Complete the native SourceChangePrepareInput using the existing source-change SDK types. Preserve its original review and successor IDs/timestamp, predecessor and comparison digests, target chart, rationale and explicit valuation confirmation. Buyer requests also retain every inclusion/exclusion decision and valuation basis. Do not convert native token units into home-currency amounts without the accountant's actual valuation.

The preview calls the native compiler without saving. Its returned command pins the source alias bytes, original input digest, workspace identity and native successor preview. The saved review is PREPARED; preparing it does not cancel the predecessor.

For application, review the saved change and supply unusedConfirmed:true, noExternalImport:true and mappingConfirmed:true together with the current revision and exact native preview. The original controller checks the plan's actual use and reservations again, retains one application intent, cancels the unused predecessor and creates the preserved successor. Native posting, comparisons and accountant returns continue through the existing accounting tools.

## CLI operation directories

The existing command is merchant-accounting-platforms. Its prepare command saves an exact reviewed request locally; execute sends it through the original merchant connection. Use a separate private operation directory for the review save and for its application.

A complete review save uses:

~~~sh
merchant-accounting-platforms preview \
  --url "$MCP_URL" --workspace "$WORKSPACE" --platform qbo \
  --action source-change-prepare --request review-alias-arguments.json \
  --out saved-review-preview.json

merchant-accounting-platforms prepare \
  --url "$MCP_URL" --workspace "$WORKSPACE" --platform qbo \
  --preview saved-review-preview.json --dir review-operation

merchant-accounting-platforms execute --dir review-operation
~~~

The private review-alias-arguments.json contains the configured source alias and, when already reviewed, its sourceSha256. The underlying host file contains the complete native request. Use --platform xero for the same Xero workflow.

Next read source-change-detail for the saved change ID. Use preview with --action source-change-apply and a private arguments file containing changeId, workspaceId, sourcesSha256, the original application id, previewSha256, revision, actor, note and the three explicit confirmations. Prepare that returned preview in a new application-operation directory, then execute it.

The actions command prints the actual fields and required inputs from the wire catalog. Use read --action source-change-status, source-change-inspect or source-change-detail with an optional private arguments file to select views and pages.

## Recovery and completion

The client reconciles the retained review or application before dispatch. It checks the exact native workspace, predecessor, successor and request digests. A lost prepare reply is recovered by its saved change ID and input digest; it does not reopen a changed input alias.

For a retained application, reconcile may finish only its existing cancellation/successor operation. It records that recovery command separately before dispatch and does not make a provider request. PREPARED is a saved review, APPLYING is a retained application, CANCELLED_PENDING_SUCCESSOR preserves the original cancellation while successor creation finishes, and COMPLETED means the same successor is retained. An original rejected application is returned as a rejection and is not reported as successful completion.

~~~sh
merchant-accounting-platforms reconcile --dir application-operation
~~~

If a durable save requires reopening, close and open the same original accounting workspace through its existing commands, then reconcile that same operation directory. Retain its request.json and state.json. Existing review/application IDs and send history are not reset.

The browser can reopen and continue these same records after the MCP owner releases its original lease. No separate agent-side accounting database or provider connection is created.

## Complete handoff download

Receive the original chart-change handoff through the existing owned file reader:

~~~sh
merchant-accounting-platforms download-source-change \
  --url "$MCP_URL" --workspace "$WORKSPACE" --platform qbo \
  --change-id "$CHANGE_ID" --out chart-change-handoff.json
~~~

An optional --sha256 pins a previously observed file digest. Otherwise the first retained chunk establishes the original file identity; all later chunks and the complete file must match it. The CLI publishes the output only after receiving all verified bytes and never overwrites an existing file.

The handoff contains the saved source-change review, native record, current state and original predecessor/successor files available through their existing export rules. QuickBooks' original journal export rule remains in effect; any withheld native request is identified in the handoff. The complete operating backup remains the recovery format for the private workspace.

Client applications can use sourceChangeStatus, sourceChangeInspect, sourceChange, preview, command and reconcile on createAccountingPlatformClient. Its fileChunks method accepts the detail response's handoff.selection, with kind qbo-source-change or xero-source-change and the original changeId. The CLI module also exports downloadAccountingSourceChange for applications that need the same complete private-file workflow.
