# QuickBooks allocation worksheets for an accounting agent

Use the existing merchant accounting connection to take an issued buyer period
through a complete worksheet return and a reviewed native QuickBooks draft.
The worksheet preserves every allocation, original native unit, expense or credit
direction, current accountant assignment, and selected company/chart. Its editable
fields carry the operator's include/exclude decisions, exact home-currency
valuation and account choices.

This workflow uses the four native worksheet methods in
[QBO_WORKSHEETS.md](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/QBO_WORKSHEETS.md)
and the existing [platform client and saved CLI operation](ACCOUNTING-PLATFORMS-CLIENT.md).
The journal, review, native posting, response and accountant-return records remain
owned by the original accounting workspace. A worksheet create retains a DRAFT.
The following journal review and any provider posting remain separate explicit
operations in the [original QuickBooks workflow](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/QBO_WORKFLOW.md).

## Start with the existing workspace and company

For an issued buyer period, complete [buyer startup](ACCOUNTING_BUYER.md) and
select its original accountant handoff. Use the same configured workspace alias
and original QuickBooks company. A retained company/chart snapshot is sufficient
for worksheet preparation; these worksheet tools do not fetch credentials,
refresh company data, contact a merchant, post a journal or send a payment.

Add named inputs to the existing accounting workspace's platformInputs map.
Paths resolve relative to the private merchant configuration. This example is
an addition inside that existing definition:

~~~json
{
  "platformInputs": {
    "qbo-company": "../accounting/company-source.json",
    "worksheet-export": "../accounting/worksheet-export-input.json",
    "worksheet-open": "../accounting/worksheet-open-input.json",
    "worksheet-inspect": "../accounting/worksheet-inspect-input.json",
    "worksheet-returned": "../accounting/returned-allocations.csv",
    "worksheet-plan": "../accounting/worksheet-plan-input.json"
  }
}
~~~

Keep the existing aliases too; each source map supports up to 64 declared aliases.
The agent sends aliases and hashes, not arbitrary filesystem paths or large CSV
bodies. The operator retains these files on the existing host. A source edit
requires another read and review. The host rejects a source whose exact bytes no
longer match a pinned SHA256.

Open the original workspace once. Read
merchant_accounting_qbo_worksheet_status for its actual
binding.workspaceId, binding.sourcesSha256, current revision and reopenRequired.
If reopenRequired is true, close and reopen that same original workspace before
using its source or reconciling a create. Keep the original retained request.

The export JSON contains:

| Field | Required meaning |
| --- | --- |
| binding | The complete two-field workspace/source binding returned by worksheet_status |
| id, createdAt | The operator's saved worksheet UUID and timestamp, selected before export |
| handoffId | The original buyer accountant handoff |
| expectedParentId | Its exact current accountant return UUID, or null |
| environment | sandbox or production, matching the selected company workflow |
| companySnapshot | The complete retained native snapshot, when not using companySource |
| draft | valuationBasis and exactly one complete editable row for every original allocation |

A complete draft row has rowId, decision, amount, debitAccountId,
creditAccountId, valuationNote, reason and description. All these values are
strings. Use pending for an undecided allocation; keep empty text fields as
empty strings. An excluded row still remains in the worksheet.

A tool call can instead supply companySource and its optional initial
companySourceSha256. That source contains the same original CompanyInfo,
Preferences and accounts input accepted by qbo_company_preview. Do not also
embed a companySnapshot. The native normalizer and worksheet compiler validate
the exact company data.

## Export and keep the original base

Read merchant_accounting_qbo_worksheet_export with workspace and source.
The response carries the source pins, native binding, worksheet identity, row
and account counts, and three complete file descriptors:

| File | Contents |
| --- | --- |
| worksheet.json | The full sealed native worksheet record, including every original base decision |
| allocations.csv | The full original worksheet CSV, including all protected source columns and the JOURNAL row |
| account-reference.csv | The complete selected company account reference |

Use view:rows or view:accounts with offset and limit to inspect all entries.
Pages contain at most 200 items. The complete files never depend on collecting
or reconstructing a summary. Each descriptor contains its exact byte count,
SHA256 and original file selection.

Download through merchant_accounting_file using the returned selection and
expectedSha256. Keep every selector unchanged while following readId and
offset. The existing file reader verifies the original source once and then
serves a private immutable snapshot for that read. It releases the snapshot at
EOF; release an unfinished read through merchant_accounting_file_release.
The client does this automatically when an iterator ends early.

The selection's kind is qbo-worksheet. It retains worksheetAction, the input,
returned-file and company aliases with their applicable digests, the complete
worksheet result digest and the filename. Use the returned selection exactly.
The file source is revalidated when opening a new read; subsequent chunks use
that read's retained original snapshot.

After reloading or changing tools, use worksheet_open with a JSON input holding
binding, the complete original worksheet record, companySnapshot or a separate
companySource, and environment. It reproduces the unchanged base CSV. A changed
accountant parent, buyer source or company requires a new worksheet exported
from the actual current source. Preserve the old worksheet as its prior edition.

## Inspect the returned CSV and resolve each field

The returned CSV is a separate declared input. Keep its actual UTF-8 bytes,
including any BOM. Only CSV parsing removes the BOM; the returned-file SHA256
covers the original complete bytes.

The editable row fields are decision, amount, debitAccountId, creditAccountId,
valuationNote, reason and description. The JOURNAL row carries valuationBasis.
Preserve every allocation row and all protected source columns. Deleting a row,
changing nativeAmountAtomic, swapping the company, altering original source
hashes, or silently changing an included row to zero is rejected by the native
compiler. Enter home-currency amounts as exact positive two-decimal text;
native atomic units remain their original strings, including values beyond
JavaScript's exact integer range.

Retain a complete inspection-input JSON with binding, worksheet,
companySnapshot when embedded, environment, currentDraft and resolutions.
currentDraft is the operator's complete current editable draft. It can differ
from the exported worksheet.base because another operator edit may have
occurred while the CSV was away. Start resolutions as an empty array.

For example, the operator can assemble the actual retained input files without
copying a large worksheet through a tool response:

~~~javascript
import {readFile, writeFile} from 'node:fs/promises';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const worksheet = await read('/private/accounting/worksheet.json');
const input = {
  binding: await read('/private/accounting/workspace-binding.json'),
  worksheet,
  environment: worksheet.binding.environment,
  companySnapshot: await read('/private/accounting/retained-company-snapshot.json'),
  currentDraft: await read('/private/accounting/current-draft.json'),
  resolutions: []
};
await writeFile('/private/accounting/worksheet-inspect-input.json',
  JSON.stringify(input, null, 2) + '\n', {flag: 'wx', mode: 0o600});
~~~

Call worksheet_inspect with source:worksheet-inspect and
returnedSource:worksheet-returned. Pin the returned sourceSha256 and
returnedSourceSha256 on subsequent reads. Its views are summary, rows,
conflicts, changes, source-issues, draft-issues and resolutions.
Download worksheet-review.json for the complete native comparison and candidate.

The comparison is a field-by-field three-way merge of the original base, current
draft and returned file. When both current and returned values differ from the
base and from one another, keep the exact conflict ID and select current or
returned. Each resolution is an object with id and choice. Retain those decisions
in the inspection input, inspect that complete input again, and keep the new
preview integrity SHA256. No draft is silently changed by these reads.

readyToAdopt means the source checks and field conflicts permit a candidate
draft. readyForPlan additionally describes whether the draft is complete for a
native journal. Pending allocations, invalid account selections or missing
valuation explanations can leave a useful draft that is not ready for a journal.
The original native plan compiler makes the final admission decision.

If the operator adopts the candidate into their working draft, keep the
complete worksheet-review.json and explicitly retain that candidate. That
changes the current draft basis for later inspection. Do not silently replace
the currentDraft inside an already reviewed native creation input.

## Prepare one exact original journal request

Copy the final inspection input into a distinct declared worksheet-plan input.
Keep its same worksheet, currentDraft, resolutions, company and environment.
Add previewSha256 equal to the final inspection's preview.integrity.sha256 and
plan containing the original stable journal metadata:

~~~json
{
  "id": "11111111-2222-4333-8444-555555555555",
  "name": "Reviewed buyer allocation journal",
  "actor": "Named accounting operator",
  "createdAt": "2026-10-13T09:00:00.000Z",
  "txnDate": "2026-10-13",
  "docNumber": "BUYER-PERIOD-01"
}
~~~

The UUID and timestamp above are illustrative. Select and retain the real
operation's identity before its first preview. Do not generate a replacement
after an uncertain outcome.

Read worksheet_plan_preview with that source and the exact returned CSV alias.
The native method rechecks the original worksheet comparison, then calls the
original plan compiler with every included/excluded allocation and valuation.
Page rows, excluded, lines and accounts, and inspect the complete source and
journal before accepting the returned command. Download plan-input.json and
journal-preview.json for the full native request and plan.

The response's binding and command contain the original workspace/source,
native plan UUID, complete normalized native request hash, plan preview hash,
worksheet and inspected-return hashes, exact source digests and admission
revision. The command remains small even when the worksheet contains many
allocations. Retain that whole response through the existing client or CLI
before any mutation.

worksheet_create uses QboWorkspace.create and its original saved request hash.
It does not install a new request ledger. The native journal retains the
normalized complete journal input; the saved client operation retains the
worksheet command and its provenance. Keep the worksheet files alongside that
operation for the complete operator handoff.

## Existing SDK and full file receiving

Connect with connectAccountingPlatformClient from
accounting-platform-client.mjs, selecting the existing alias and platform:qbo.
An in-process or stdio customer can use createAccountingPlatformClient with its
existing structured-result call function.

The following methods reuse that same client:

| Method | Original operation |
| --- | --- |
| worksheetStatus() | Read the actual workspace binding and native limits |
| worksheetExport(args) | Export the complete original base |
| worksheetOpen(args) | Reopen the same sealed base |
| worksheetInspect(args) | Inspect exact returned bytes and current choices |
| worksheetPlanPreview(args) | Read the native journal preview |
| worksheetRequest({planId}) | Read the original native create identity |
| worksheetPages(action,args,options) | Read every item while holding one result and its exact source pins |
| worksheetFile(inventory,name,options) | Read one complete original file with its descriptor SHA256 |
| preview('worksheet-create',args) | Validate the native command for the existing saved-operation path |
| command(preview), reconcile(preview) | Dispatch or reconcile that same original native request |

worksheetPages accepts export, open, inspect or plan-preview. Put view and
pageSize in its options, not inside args. An optional expectedResultSha256 pins
an already reviewed comparison. Every later page carries the first input
digests and must retain the same result digest and total; a changing source
ends the read instead of combining editions.

~~~javascript
const inventory = await client.worksheetExport({
  source: 'worksheet-export', companySource: 'qbo-company'
});
for await (const result of client.worksheetPages('export', {
  source: inventory.source, sourceSha256: inventory.sourceSha256,
  companySource: inventory.companySource,
  companySourceSha256: inventory.companySourceSha256
}, {view: 'rows', expectedResultSha256: inventory.resultSha256})) {
  consumeOriginalRows(result.page.items);
}
for await (const chunk of client.worksheetFile(inventory, 'allocations.csv')) {
  await ownedOutput.writeFile(chunk.bytes);
}
~~~

The example's output owner must fsync and publish its complete file. The
maintained CLI downloader handles that publication. Its output is create-only.

## Existing CLI: read, prepare, execute and reconcile

Use starforge merchant-accounting-platforms, or invoke
accounting-platform-cli.mjs with Node. Connection options below refer to the
existing MCP listener. Keep the token in its named environment variable.

~~~text
starforge merchant-accounting-platforms worksheet
  --url MCP_URL --workspace buyer --platform qbo
  --action export --request /private/export-arguments.json
  --out /private/export-inventory.json

starforge merchant-accounting-platforms download-worksheet
  --url MCP_URL --workspace buyer --platform qbo
  --inventory /private/export-inventory.json --file worksheet.json
  --out /private/worksheet.json

starforge merchant-accounting-platforms download-worksheet
  --url MCP_URL --workspace buyer --platform qbo
  --inventory /private/export-inventory.json --file allocations.csv
  --out /private/allocations.csv

starforge merchant-accounting-platforms worksheet
  --url MCP_URL --workspace buyer --platform qbo
  --action inspect --request /private/inspection-arguments.json
  --out /private/inspection-inventory.json

starforge merchant-accounting-platforms preview
  --url MCP_URL --workspace buyer --platform qbo
  --action worksheet-create --request /private/plan-arguments.json
  --out /private/reviewed-native-preview.json

starforge merchant-accounting-platforms prepare
  --dir /private/original-worksheet-operation
  --url MCP_URL --workspace buyer --platform qbo
  --preview /private/reviewed-native-preview.json

starforge merchant-accounting-platforms execute
  --dir /private/original-worksheet-operation

starforge merchant-accounting-platforms reconcile
  --dir /private/original-worksheet-operation
~~~

Each multiline block is one command. Argument files are small private JSON
objects such as {"source":"worksheet-export","companySource":"qbo-company"}.
The full native inputs and returned CSV stay in their host-declared files.
The plan argument file also selects returnedSource and its inspected digest.

worksheet writes the complete native inventory to the private --out file.
download-worksheet reads that exact inventory or the saved preview and verifies
the complete file through the maintained original reader. Existing files are
preserved. Generic read, preview and download commands remain compatible with
the same tools and selections.

prepare retains the exact original command and binding in the existing private
request.json/state.json directory. It does not submit. execute first reconciles
the original ID, then may dispatch the retained command. reconcile performs
the original lookup and never creates a journal, new request ID or provider
operation.

After a lost reply, worksheet_request reads the native plan UUID and complete
request/plan hashes before any former source alias is reopened. A matching
retained create remains recoverable after those input files move or change.
A different request under the same UUID is a conflict. NOT_FOUND means the
lookup found no retained plan; retain the same operation and resolve the
original outcome. A transport error or uncertain workspace commit never
authorizes another ID.

Finish the journal's ordinary review and explicit response/posting path using
the same platform client. Retain its native accountant-return files and use the
original buyer workspace's reviewed return acceptance. For a changed chart,
continue the existing [source-change workflow](accounting-source-changes.md).
Close the original MCP workspace before opening its directory in the desktop
application. Whole-workspace encrypted backup and restore stay in the original
[maintenance workflow](ACCOUNTING-MAINTENANCE-CLIENT.md).

## Complete native receiving

examples/qbo-worksheet-client-receiving.mjs exercises this complete client path
with a separate fictional issued buyer input, original native accounting owner,
the actual worksheet compiler, retained file reader and saved-operation CLI.
It covers a concurrent draft conflict, exact returned CSV/BOM, every explicit
allocation decision, complete downloads, same-request create recovery after
input changes, independent native journal review and stopped-workspace reopen.
It does not open a retained customer financial case or contact a provider.
Its result records which native stages actually completed. A source parse alone
is not a completed receiving run.

Run the example against the completed fictional worksheet fixture, with a
separate private output directory:

~~~text
node stellar-forge/mcp-merchant-operator/examples/qbo-worksheet-client-receiving.mjs \
  /private/completed-fictional-worksheet /private/client-receiving
~~~

The input RESULT.json and every consumed fixture file are verified. The example
retains its original request directories, exact inputs, full downloads and native
accountant-return files. Restart the same command with those same directories to
reconcile the original IDs. No browser, listener or token is needed: the real
platform/client pair shares one owned native workspace within this finite process.
The provider transport is explicitly unavailable throughout the fictional run.
