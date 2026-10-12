# Customer remittance receiving through the accounting MCP

The native remittance workflow uses the merchant's existing accounting owner, source planner, invoice and receipt records, dated balance checks, request journal and durable writer. It is available through the installed **starforge merchant-accounting-receivables** command and the existing typed **/merchant/accounting-receivables** client.

## Receive the complete original remittance

1. Read remittance_list. Its workspaceId binds the review to the original private accounting directory and creation identity; workspace is the configured MCP alias.
2. Preview the original UTF-8 CSV with its stable sourceId and actual filename. Select complete inline source.csv, a configured receivablesInputs sourceAlias, or the CLI's private --source file.
3. Save the complete preview, including its actual CSV. The response contains source bytes and SHA-256, workspace identity and revision, every payment/customer/invoice match, allocations and conflicts.
4. Prepare remittance_apply from that complete preview and operator/request identity. The existing operation directory retains the actual CSV in its immutable request.
5. Execute the prepared operation. The original owner rechecks the source and ledger, then saves the complete batch, receipts and allocations in one accounting transaction.
6. Open the retained batch and its files. Recover an interrupted response through the same prepared directory or request_lookup with the original request ID.

Existing matching receipts preserve their full Stellar or bank source, transaction references and native asset amounts. Allocations use the receipt's invoice currency and exact precision. Receipt accounting dates, future allocations and refund reservations remain part of the calculation. The [underlying CSV guide](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/REMITTANCES.md) defines all eleven fields and matching rules.

## Native methods

These suffixes use the merchant_accounting_receivables_ prefix.

| Suffix | Operation |
| --- | --- |
| remittance_list | Page saved batches; return current workspaceId and revision. Search filters IDs and filenames before paging. |
| remittance_preview | Read inline or configured source and return the complete CSV and original review. |
| remittance_apply | Apply the reviewed source through the original mutation and request journal. |
| remittance_detail | Read a batch summary/file inventory, or page its original groups and errors. |
| request_lookup | Recover the result and retained original operation by requestId. |

Pages accept offsets and limits from 1 to 200. A detail summary exposes file identities and review totals. Select groups or errors for original review rows. The typed listAll reader retains the original revision, total and accounting-date observation across pages.

File reads use merchant_accounting_file with kind receivables-remittance, batchId and file. The existing reader pins its original snapshot and SHA-256 across every chunk, then releases its read handle.

## CLI from a private source file

Use the actual configured endpoint, accounting alias and access-token environment name. The token value remains in that process environment.

~~~bash
remittance_connection=(--url http://127.0.0.1:8464/mcp --workspace merchant --token-env MCP_ACCESS_TOKEN)
starforge merchant-accounting-receivables remittance-list "${remittance_connection[@]}"
~~~

Put the exact 64-character workspaceId from the response into a private options JSON. The placeholder below represents that returned identity.

~~~json
{
  "workspaceId": "the-exact-returned-workspaceId",
  "source": {"sourceId": "customer-remittance-system"}
}
~~~

With --source, the CLI reads one original private regular file, supplies its actual basename, decodes UTF-8 strictly, and preserves its BOM and line endings. The source limit is 500,000 bytes.

~~~bash
starforge merchant-accounting-receivables remittance-preview "${remittance_connection[@]}" \
  --request /private/remittance/source-options.json \
  --source /private/remittance/customer-remittance.csv \
  --out /private/remittance/review.json

starforge merchant-accounting-receivables prepare "${remittance_connection[@]}" \
  --dir /private/remittance/receive-operation \
  --action remittance-apply \
  --preview /private/remittance/review.json \
  --actor "Accounting operator" \
  --request-id remittance-2026-10-12-original

starforge merchant-accounting-receivables execute \
  --dir /private/remittance/receive-operation
~~~

Preparation requires a review with its conflicts resolved. It preserves the complete source, native review and original identity in the existing operation directory. Execution consumes those reviewed bytes even if the input file subsequently changes.

After an interrupted reply, reconcile that same directory:

~~~bash
starforge merchant-accounting-receivables reconcile \
  --dir /private/remittance/receive-operation
~~~

An exact recorded request returns its retained result. An absent request remains the same prepared operation, which the existing runner can execute. If the native response requires reopening, the operation retains its reopenRequired and commitUncertainty fields. Reopen the original accounting owner and reconcile the same request.

## Configured and inline sources

The original owner's receivablesInputs map can supply the CSV:

~~~json
{
  "workspaceId": "the-exact-current-workspaceId",
  "sourceAlias": "october_remittance",
  "source": {
    "sourceId": "customer-remittance-system",
    "filename": "customer-remittance.csv"
  }
}
~~~

Choose sourceAlias or source.csv. Configured sources are read during preview; the returned preview includes the full CSV, and apply retains that CSV inline. Recovery uses the saved request and source.

Inline callers provide all eleven CSV columns in source.csv along with sourceId and filename. Preserve the whole string. Its actual UTF-8 bytes determine the source SHA-256.

## Typed client and durable operation

The client validates the native review digest, source byte count/hash, source identity, workspace binding and revision. The original owner validates the financial operation again at apply.

~~~js
import {readFile, writeFile} from 'node:fs/promises';
import {
  connectAccountingReceivablesClient,
  accountingRemittancePreview
} from '@tokenjunkielabs/starforge-merchant/merchant/accounting-receivables';
import {
  prepareAccountingReceivablesOperation,
  runAccountingReceivablesOperation
} from '@tokenjunkielabs/starforge-merchant/merchant/accounting-receivables/operations';

const connection = {
  url: 'http://127.0.0.1:8464/mcp',
  workspace: 'merchant',
  tokenEnv: 'MCP_ACCESS_TOKEN'
};
const client = await connectAccountingReceivablesClient(connection);
try {
  await client.open();
  const inventory = await client.remittances();
  const bytes = await readFile('/private/remittance/customer-remittance.csv');
  const csv = new TextDecoder('utf-8', {fatal: true, ignoreBOM: true}).decode(bytes);
  const preview = accountingRemittancePreview(await client.previewRemittance({
    workspaceId: inventory.workspaceId,
    source: {
      sourceId: 'customer-remittance-system',
      filename: 'customer-remittance.csv',
      csv
    }
  }));
  await writeFile('/private/remittance/review.json', JSON.stringify(preview, null, 2) + '\n',
    {flag: 'wx', mode: 0o600});

  const directory = '/private/remittance/receive-operation';
  await prepareAccountingReceivablesOperation({
    ...connection, directory, kind: 'remittance_apply', preview,
    actor: 'Accounting operator', requestId: 'remittance-2026-10-12-original'
  });
  const received = await runAccountingReceivablesOperation({directory, client, execute: true});
  const batchId = received.remittanceBatch?.id ?? received.observation?.remittanceBatch?.id;
  if (batchId) {
    const detail = await client.remittance({batchId});
    const groups = await client.listAll('remittance_detail', {batchId, view: 'groups'});
    const sourceFile = detail.files.find(file => file.name === 'source.csv');
    const original = await client.remittanceFile({batchId, file: 'source.csv'},
      {expectedSha256: sourceFile.sha256});
    await writeFile('/private/remittance/received-source.csv', original.bytes,
      {flag: 'wx', mode: 0o600});
    console.log({batchId, sourceSha256: sourceFile.sha256, groups: groups.items.length});
  }
} finally {
  await client.disconnect();
}
~~~

For resumed receiving, run the existing operation directory. Its retained request is the input. Disconnect drains this caller's file reads. The separate closeWorkspace operation closes the accounting owner before opening that same directory in the browser.

## Retained file delivery

A batch summary returns actual lengths, SHA-256 hashes and complete native file selections.

| File | Contents |
| --- | --- |
| source.csv | Exact received CSV bytes, including BOM and line endings. |
| review.json | Complete original customer/payment/invoice matching and allocation review. |
| review.csv | Tabular original references, amounts, dates and row outcomes. |
| batch.json | Batch identity, source, review, timestamps and original record identifiers. |
| manifest.json | Exact byte counts and hashes of the source, review and batch files. |

Use a private selection with kind receivables-remittance, the original batchId and the exact file name:

~~~json
{
  "kind": "receivables-remittance",
  "batchId": "the-original-batch-uuid",
  "file": "source.csv"
}
~~~

~~~bash
starforge merchant-accounting-receivables download "${remittance_connection[@]}" \
  --selection /private/remittance/source-selection.json \
  --out /private/remittance/received-source.csv \
  --sha256 ORIGINAL_SOURCE_SHA256
~~~

The original downloader creates the destination once and checks the complete received length and SHA-256. The same selection works through the typed maintenance reader.

Customer history includes the remittance operation belonging to that customer or its original receipt. Repeat source instructions preserve the original result. An identical active dated allocation from another source is reported with its original allocation ID. Explicit corrections and additional allocations use the existing receipt/invoice operation history.

## Product integration

The feature extends the maintained receivables provider, native catalog, typed client, CLI and accounting file selectors. The planner and atomic batch controller remain the implementations shipped with the [browser and HTTP desk](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/REMITTANCES.md). Bank statements, receipt corrections, Stellar receiving and paid-credit workflows share that original accounting owner.
