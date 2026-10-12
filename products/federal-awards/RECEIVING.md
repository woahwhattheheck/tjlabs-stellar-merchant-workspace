# Receive and reopen federal award work

A complete delivery includes the selected source package and the working research record. Choose the original complete workspace, portable award/transaction records, and dossier exports that the recipient needs. Keep the private assessments and session URLs inside the intended delivery.

## Delivery contents

| Artifact | Purpose |
| --- | --- |
| Selected federal-awards package, its original build receipt and SHA256 | Install the same source-owned commands, application and native merchant |
| complete-workspace.json | Restore the full award and transaction workspace, original pages, review history and receiving state |
| transaction-capture.json with reviews when selected | Receive one complete award history into the matching retained award edition |
| Original award edition or its complete award/detail source collection | Establish the original award and provenance for separate transaction receiving |
| Original transaction response and receipt exports | Inspect the exact source request, response, observation and identity |
| workshare.md and transactions.csv | Read the workshare and examine spreadsheet-safe transaction rows |
| Complete dossier JSON and optional HTML/Markdown exports | Reopen the original research question, sources, findings, citations and revision history |
| Prepared merchant bundle or finalized customer delivery when part of the work | Continue the original publication and customer receiving workflow |

Retain the complete original source collections, including files referenced by their manifests. Exported JSON and immutable dataset bundles preserve their own source bindings. Output paths are create-only; use a new destination for another delivery edition.

## Restore the complete working research record

Install the selected package as described in [OPERATING.md](OPERATING.md). Choose a new private workspace and restore the original full backup:

~~~sh
starforge usaspending-research restore \
  --workspace /private/received-federal-awards \
  --file /private/delivery/complete-workspace.json

starforge usaspending-research state --workspace /private/received-federal-awards
starforge usaspending-research serve --workspace /private/received-federal-awards --port 0
~~~

Open the new private browser URL and inspect the retained award edition, selected award, completed transaction capture and saved assessment. Source observation times and original monetary values remain attached to that research record. A reopened server has its own live instance while the saved workspace identity persists.

Full restore verifies the original source bytes and their page/row bindings before committing. It also supports original backups created before the additive transaction tables existed.

## Receive a transaction capture into an existing original award workspace

Receive or import the original award edition first, preserving its award row and provenance. Select that resulting edition and then receive the portable transaction capture:

~~~sh
starforge usaspending-research tx-receive \
  --workspace /private/received-federal-awards \
  --file /private/delivery/transaction-capture.json \
  --edition RECEIVING_EDITION_ID --include-reviews

starforge usaspending-research tx-state --workspace /private/received-federal-awards
starforge usaspending-research tx-summary \
  --workspace /private/received-federal-awards --capture RETURNED_CAPTURE_ID
~~~

The receiver checks the copied award row, exact native request/response pages, projected transaction occurrences, coverage and source fingerprint. Included workshare receiving is explicit. The original review provenance remains attached to the receiving record; replay reuses the retained receiving result according to the original receiver.

Use a full workspace restore when the delivery needs all original award editions, source history and assessments together.

## Reopen the original dossier

The complete dossier JSON carries its original question, findings, citations, source observations and blobs. Reopen it into the new private dossier store using the original command:

~~~sh
starforge research-dossiers reopen \
  --store /private/received-dossiers \
  --file /private/delivery/complete.research.json
~~~

Open the dossier with `starforge usaspending-dossier open --store /private/received-dossiers`. Recover a selected original award edition with the source-signature command in [DOSSIER.md](../../stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/DOSSIER.md). This keeps source receiving and the written workshare in one customer workflow.

## Receive through the native merchant

Declare the existing source files in the original workspace connection. A portable transaction source uses `kind: transactions`; retained native request/receipt/response pages use `kind: transaction-pages`. The source-import tool accepts the original award edition and explicit review receiving.

Use the original export and retained-file tools for large deliveries. Preserve the export ID, expected snapshot and returned next offset. After closing and reopening the same owner, continue that original export from its retained offset, receive the complete capture, and reopen the receiving workspace. See the complete [native merchant guide](../../stellar-forge/mcp-merchant-operator/USASPENDING-WORKSPACE.md).

## Run the original end-to-end receiving programs

These programs consume an actual original source packet and the complete source files. They exercise the maintained application and saved workspaces. Retain the full output directories, original inputs, stdout and stderr with the receiving operation.

From the source root of the selected product, run the original award and transaction journey:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/transactions/run-native.mjs \
  --source /private/original-source-packet.json \
  --out /private/receiving/native
~~~

The packet contains the complete original award/detail receipt and transaction request/response records expected by the maintained runner. Its native output includes the working award workspace, original capture, private assessment, transaction exports, complete workspace backup, restored workspace, received capture and receiving-result.json.

Continue that same output through the original merchant owner:

~~~sh
node stellar-forge/mcp-merchant-operator/examples/usaspending-transactions-native.mjs \
  --received /private/receiving/native \
  --out /private/receiving/mcp-native \
  --operation SCF-USASPENDING-AWARD-TRANSACTIONS-64B7-20261012
~~~

The MCP continuation uses the original job controller, snapshot-paged timeline, workshare review and all six complete transaction export formats. It closes and reopens the owner during a retained-file transfer, receives the portable capture, replays receiving and reopens the saved result. Its operation.json retains progress; continuation uses the same operation ID and output directory.

Run the original source-owned application on that same received workspace:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/application-native.mjs \
  --received /private/receiving/native \
  --out /private/receiving/applications-source
~~~

For this source mode, the original source root is the `source` child of its release directory. The selected runtime naturally has that layout. The program reads the source-owned provider registry, launches the real original server, receives its authenticated startup identity and browser assets, verifies saved transactions and assessment, stops with SIGTERM, and reopens the same workspace. It also opens a new workspace, restores the complete original backup and reopens the restored work.

To complete the shared Applications lifecycle, supply the original READY runtime:

~~~sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/usaspending/application-native.mjs \
  --received /private/receiving/native \
  --out /private/receiving/applications-managed \
  --runtime /private/federal-awards-runtime
~~~

That mode uses the maintained runtime inspector and runtime workspace model: attach, application review/save, original adoption, fresh start preparation, managed worker, authenticated private browser, stop, controller reopen and saved application reopen. It covers an existing original workspace and a new workspace whose approved directories are created by the original save flow. Each application receiving run takes its own new output directory.

The original complete receiving directories provide the working customer result and the source errors needed to repair an interrupted run. Preserve them with the operation so further work continues against the same original record.

## Funding-report delivery

The [complete funding-report workflow](FUNDING_REPORTS.md) joins reviewed original award transactions, report publication, SF30 file-product merchant preparation, the original SF88 buyer, full source receiving and report revisions. It uses this same private workspace and portable backup. Open **Funding reports** from the award or transaction browser to continue the saved work.
