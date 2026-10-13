# Buyer-only accounting through the configured MCP host

## Allocation worksheet return

For periods with many allocations, [ACCOUNTING-QBO-WORKSHEETS.md](ACCOUNTING-QBO-WORKSHEETS.md) provides the complete agent/client/CLI worksheet workflow. It preserves every original buyer allocation, Pending-only exclusions, explicit home-currency values, original company accounts and later local edits. Inspection and draft adoption precede the existing native plan, independent review and accountant-return operations.


A host can now declare the original accountant as a buyer-only workspace. The
same accounting provider retains an issued buyer period, its expense and credit
allocations, the first accountant handoff, returned bookkeeping references and
the original QuickBooks, Xero and encrypted-recovery histories. The input is the native
`stellar-forge.buyer-accountant-source.v1` document produced by the buyer expense
workspace; its validator remains the authority for the exact accepted schema.

## Declare the original source

Use `sourceMode:"buyer"` on the existing accounting workspace declaration. The
workspace directory may be new or an already initialized original buyer-only
accountant. Paths resolve relative to the host's configuration file.

```json
{
  "workspaces": {
    "expenses": {
      "label": "Buyer expense accounting",
      "sourceMode": "buyer",
      "directory": "./buyer-accounting",
      "buyerSources": {
        "issued-period": "../issued/period-accountant-source.json"
      },
      "accountantReturns": {
        "reviewed-return": "../accountant/returned.csv"
      },
      "platformInputs": {
        "qbo-company": "../accountant/original-qbo-company.json",
        "qbo-plan": "../accountant/reviewed-qbo-buyer-plan.json",
        "qbo-response": "../accountant/original-qbo-response.json",
        "qbo-chart-change": "../accountant/reviewed-qbo-chart-change.json",
        "xero-context": "../accountant/original-xero-context-request.json",
        "xero-plan": "../accountant/reviewed-xero-plan.json",
        "xero-response": "../accountant/original-xero-response-request.json"
      },
      "recovery": {
        "stateRoot": ".",
        "backupRoot": "../accounting-backups",
        "passEnv": "STARFORGE_ACCOUNTING_BACKUP_PASSPHRASE"
      }
    }
  }
}
```

Declare only the aliases whose original files are actually available. Empty maps
may be omitted. Keep the state and source directories private (0700) and the
issued file private (0600). The original startup reader accepts a regular,
owner-controlled source up to 64 MiB, checks its exact bytes while reading, and
validates the native issued period and aggregate allocations.

This standalone declaration is accepted by the existing initializer:

```sh
starforge merchant-mcp init-accounting --dir /absolute/private/accounting-operator --accounting /absolute/private/accounting.json
starforge merchant-mcp serve --config /absolute/private/accounting-operator/merchant-mcp.json
```

The ordinary host still uses its configured loopback listener and bearer
credential. Existing stdio and configured-provider clients expose the same
registered accounting tools. Configuring the provider does not initialize the
accounting directory, import a source, contact a bookkeeping service or make a
payment.

An existing merchant configuration can instead include the declaration under
`accounting`; preserve its other provider settings. An omitted sourceMode keeps
the existing merchant contract, including its required outbox, proof and terms
paths. A buyer declaration omits those paths and merchant-only input maps. Its
supported accounting operations are source startup, accountant handoff/returns,
QuickBooks, Xero, chart changes, exact retained files and native operating recovery. The host reports these
capabilities with each alias. Merchant sales, collection, statements, Bitwave,
Cryptoworth and runbook operations continue under their original merchant alias.

## Preview and explicitly initialize

1. Call `merchant_accounting_sources` and select the declared buyer alias.
2. Call `merchant_accounting_buyer_source_preview` with `workspace` and
   `source`. It reads the original private file without opening a workspace.
3. Keep its returned `sourceSha256`. Review the original period, source context,
   exact native totals, credits and outstanding reservations.
4. To read the complete source review, use `view:"allocations"`,
   `"outstanding"` or `"captures"`, with `offset` and `limit` (up to 200).
   Supply the same sourceSha256 on every subsequent page. A changed original
   file rejects that old selection.
5. Submit `merchant_accounting_buyer_initialize` with the same alias and digest,
   plus the actual source name and operator.

Example tool arguments, with the digest copied from that actual preview:

```json
{
  "workspace": "expenses",
  "source": "issued-period",
  "sourceSha256": "<exact SHA256 returned by source_preview>",
  "name": "Reviewed issued expense period",
  "actor": "<operator name>"
}
```

Initialization uses the original Store lease and startup writer. It retains the
complete issued bytes in the accountant's private inputs, source context and
summary, original initialization name/operator, and the native first-handoff
UUID. Its result includes the actual workspace/source binding and that startup
record. The response keeps the original workspace ID and source-binding digest;
host-owned input paths are omitted from the buyer projection. Original source
values and reviewed request text remain unchanged. The configured accounting
session then opens normally, or remains in
the explicitly declared paused-recovery mode.

After an uncertain response, repeat the identical initialization arguments.
An accepted initialization recovers from its retained original source without
rereading the former import file. Changing the source digest, name or operator
does not silently replace that retained initialization. The source alias remains
a host declaration; recovery does not allow arbitrary file paths.

Once initialized, `merchant_accounting_open` reopens the retained directory.
It reads the original source binding and the Store rechecks it under the writer
lease. Reopening does not require the former import path or a new source alias.
The host cannot reinterpret a merchant directory as a buyer directory.

## Prepare and recover the first handoff

Call `merchant_accounting_buyer_startup` after opening. It returns the original
binding, current workspace revision, source identity and first-handoff UUID.
Then call `merchant_accounting_buyer_prepare` with the retained sourceSha256.
This reads the retained issued file and supports the same complete paged review
as the pre-initialization preview.

Use `merchant_accounting_buyer_handoff` with:

| Field | Original value to retain |
| --- | --- |
| workspace | The configured buyer alias. |
| handoffId | The native startup UUID returned by prepare. |
| sourceSha256 | The retained original issued-source digest. |
| revision | The current workspace revision shown by prepare. |
| name | The reviewer's handoff name. |
| actor | The named reviewer. |

Save that full request before submission. The original accountant writer uses
the same startup ID and request identity on every retry. If it accepted the
handoff but the reply was lost, the identical request recovers its original
record before checking the now-old workspace revision. A different name,
operator or source under that same ID remains a request conflict.

The existing `merchant_accounting_accountant`,
`merchant_accounting_accountant_rows`,
`merchant_accounting_accountant_preview` and
`merchant_accounting_accountant_apply` tools inspect and review the original
handoff and its returned editions. The existing
`merchant_accounting_accountant_buyer_prepare/create` path remains available
for an explicitly selected additional issued source; it does not replace the
startup's retained source or first-handoff identity.

## Read exact original files

Use the existing retained file reader with `kind:"buyer-source"` to retrieve the
startup's complete issued bytes. It requires only the workspace selection; do
not attach unrelated handoff, plan or report selectors.

```json
{
  "workspace": "expenses",
  "kind": "buyer-source",
  "offset": 0,
  "limit": 196608
}
```

Keep the returned readId, exact digest and selectors unchanged for subsequent
chunks. The reader supplies the original filename, byte count and base64 data.
Release an incomplete read with `merchant_accounting_file_release`.
`kind:"accountant"` continues to select the exact handoff/return and its
original allowed file, including `buyer-return.json`.
`kind:"qbo"` and `kind:"xero"` select the original native plan and response files.
Chart changes use `kind:"qbo-source-change"` or `kind:"xero-source-change"` with the
saved `changeId` and native handoff filename. The same retained reader verifies
all complete bytes; each file keeps its own digest.

## Continue QuickBooks from the issued buyer handoff

Use `--platform qbo` on this same buyer alias after the original handoff is
retained. The session opens its original QuickBooks and Xero controllers over
the same accountant owner. A host may use imported native company/response files
or configure its existing QuickBooks company through `platforms.qbo`. The
[platform connection guide](ACCOUNTING-PLATFORMS.md) covers both the original
token-environment connection and a reviewed OAuth company selection. The saved
realm, environment, company snapshot and token scope retain that connection's
existing contract.

Read the original handoff with `read --action handoff`, supplying its actual
`handoffId` in the private request JSON. Select `view:"rows"` and page the
complete allocation inventory. Every row retains its expense or returned-credit
kind, original source/economic identities, native amount, recognition date,
cost-center/project coding, source observation and current accountant assignment.

Prepare a `platformInputs` file with the original QuickBooks request fields:
its stable `id`, `createdAt`, `name`, `actor`, `handoffId`,
`expectedParentId`, actual company/realm/base currency/environment, `txnDate`,
optional `docNumber`, `valuationBasis` and `rows`. The native handoff supplies
the current parent and source rows; preserve those observed identities.
For **every** allocation, supply one explicit decision:

- An included row has its original `rowId`, `decision:"include"`, an exact
  positive two-decimal home-currency `amount`, `valuationNote`, and the
  accountant's chosen `debitAccount` and `creditAccount`. These accounts use
  the actual native Account.Id values in their `value` fields.
- An excluded row has its original `rowId`, `decision:"exclude"` and a specific
  `reason`. Its original accountant fields remain unchanged. Zero-native
  allocations and previously booked/excluded allocations require this decision.

Include between 1 and 500 allocations in a journal and retain a decision for
every other issued allocation. State the valuation source and tax treatment in
`valuationBasis`; each included row also retains its own valuation note.
Expense and returned-credit amounts stay positive native-unit facts. The
accountant chooses their debit/credit directions and reviewed home values;
the compiler performs no exchange-rate selection or automatic tax calculation.
Production requires each selected allocation's original operational public-network
matched transfer and observation digest. The existing sandbox path retains
development source as development.

Use `preview --action create` with that source alias and optional imported
`companySource`, save the full returned preview through `prepare`, then
`execute` and `reconcile` the same operation directory. The original native
request is retained before saving; a retry reconciles that exact plan and input.
The saved plan's `rows`, `excluded`, `lines`, `accounts` and response/file
views page the complete review. Same-company reservations preserve original
allocation identity within an issued edition and economic identity across
editions, including the existing accountant's other retained plans.

Continue the normal journal review and explicit provider-posting or original
response-import path in [the customer guide](ACCOUNTING-PLATFORMS-CLIENT.md).
A matched response books only the included original allocations. The saved
accountant return and `buyer-return.json` then go back to the original Buyer
Expenses workspace through its normal reviewed return acceptance.

For a changed company chart, use the same platform's source-change inspection,
preview, saved review and explicit application.
[The complete chart-change guide](accounting-source-changes.md) covers original
request recovery, every native confirmation, excluded-row/mapping pages and
complete retained handoff download. An accepted application resumes its original
predecessor cancellation and successor; it does not post that new journal.

## Continue the existing Xero operation

The same buyer session retains its original Xero controller and accountant
instance. Original source, context, plan, operation, response, comparison and
return APIs keep their existing contract.

Use [the maintained platform guide](./ACCOUNTING-PLATFORMS.md) and
[its existing customer SDK and durable CLI](./ACCOUNTING-PLATFORMS-CLIENT.md) for:

- A retained native Organisation/Accounts context or an explicitly requested
  provider capture under an already configured tenant.
- The selected buyer handoff and exact accountant return revision.
- Explicit dated fiat amounts, chart accounts, source descriptions and reasons.
- A reviewed native draft, original saved operation and response capture.
- The existing accountant-return preview, application and lost-reply recovery.
- Exact handoff/return files for the original buyer workspace to accept.

A zero-native allocation cannot acquire an unrelated positive fiat valuation;
the original Xero decision path retains an explicit exclusion where required.
Unknown prices and currencies retain their original meaning. A provider's draft
or posted status is recorded separately from the original purchase, delivery,
native amount, development/testnet scope and buyer-return acceptance.

Nothing in source preparation, initialization, reopen, first handoff or file
reading performs a provider request. Actual journal posting or refresh remains
the explicitly selected QuickBooks or Xero operation with its original request ID
and lifecycle.

## Pause, back up, receive and reopen the same operation

The existing `merchant_accounting_maintenance_*` tools retain the whole native
buyer accountant using its declared state root and separate backup catalog.
Use the original sequence: pause, review, acknowledge stopped external writers,
capture the encrypted backup, verify the exact selected backup, restore its
original destination, then resume. Keep each native request ID, review identity
and archive digest. The passphrase stays in its host environment variable.

The backup includes the original startup source and binding, native workspace
history, first handoff, QuickBooks plans/responses, Xero contexts/plans/responses,
chart-change reviews/applications, returned editions and source files under the
original recovery rules. An incomplete restore retains
the same native marker; resume that authenticated original backup rather than
initializing over it.

Close the MCP alias before opening the same directory in the original
accountant browser, buyer CLI or managed Applications. All use the existing
exclusive writer lease. Close drains accepted calls and verified readers.
Provider-wide close also finishes any already accepted source previews.

The [original buyer CLI](../../stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/BUYER_ACCOUNTING.md)
and managed Applications source binding use this same retained startup.
Their normal close/reopen does not create another buyer period, handoff or
accounting source.

## Customer SDK and saved CLI operations

Use the existing `starforge merchant-accounting-platforms` command with `--platform buyer` for source review, initialization, retained-source paging, exact first-handoff recovery and original source/accountant downloads. The complete private `request.json` / `state.json` workflow and SDK examples are in [ACCOUNTING-PLATFORMS-CLIENT.md](ACCOUNTING-PLATFORMS-CLIENT.md#buyer-issued-source-startup-and-receiving). Initialization and handoff stay explicit; `reconcile` only observes their original native identities. Use `--platform qbo` or `--platform xero` for bookkeeping on that same alias. The original buyer mode, Store, both bookkeeping controllers and encrypted receiving remain this guide's configuration.
