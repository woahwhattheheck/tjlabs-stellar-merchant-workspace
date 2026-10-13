# The bank statement that balanced but could not close

The arithmetic was correct: 84,856,700.74 minus 25.95 equalled 84,856,674.79. Our parser had recovered both entries and the reported closing amount. It would have been easy to turn that result into a green check mark and let the operator close the statement.

The document also said it was page one, with another page still to come. Its balance was intermediate. The useful result was therefore two separate answers: the supplied page balanced, and the supplied page did not establish a complete account-period close.

I encountered this while running our maintained CAMT.053 reader against original bank-published examples. That distinction shaped how I wanted the import review to work. A parser should retain enough structure for the next operation to make its own decision. If it collapses everything into a list of amounts and a success flag, the next operation inherits assumptions it cannot inspect.

This article follows the actual source-reading work in TokenJunkieLabs’ Merchant workspace. The parser runs discussed here used the unchanged source logic in V8 with the existing byte and hash adapters. The companion command uses that same reader through its normal Node interface.

## The first mistake would have been choosing the wrong row

CAMT is XML, but the interesting problem is the unit of work. A statement contains entries; an entry can contain further transaction details. Those layers have different responsibilities. Our import model takes its cash amount from the entry and retains the details beneath it. The distinction is visible in the entry and transaction-detail sections of the SIX implementation guide. [1]

The tempting shortcut is to flatten every detail into a transaction and feed that table into an existing importer. It produces convenient rows. It also forces an accounting interpretation before the review screen has shown the operator what the bank reported.

I prefer a representation that keeps the parent available. A detail needs its original entry identity, its own source location, and any amount the bank supplied for that detail. Then the application can explain a batch, inspect remittance information or compare detail totals without accidentally creating additional cash.

One published itemized example made that choice concrete. The entry amount was a debit of 10, while its selected detail amount was 50. Our optional comparison reported the difference and retained cash at −10. Replacing the entry with the detail would have changed the source amount during import. [2]

```
{
  "amount": "-10",
  "detailTieOut": {
    "signedAmount": "-50",
    "entryAmount": "-10",
    "matches": false,
    "status": "DIFFERENCE"
  }
}
```

That output gives the operator a useful discrepancy to investigate. Silently selecting whichever amount makes a downstream check pass would erase the discrepancy and make the transformed data look more certain than its source.

## Direction and reversal need separate fields

A second easy mistake is to read a debit, give it a negative sign, notice a reversal flag and negate it again. In the CAMT interpretation used here, the debit/credit indicator describes the current entry. The reversal indicator carries additional information about that entry. The SIX guide documents those fields separately. [1]

Our reader derives the signed amount from the current direction once and retains reversal as a boolean. The itemized example has five reversal entries. That gave me concrete records to inspect instead of relying on a reassuring variable name. [2]

This is also why I would not route every unfamiliar source field through a generic correction interface. Our existing OFX support has its own replacement and deletion semantics. Reusing that behavior for a CAMT reversal merely because both concern earlier activity would connect two different instructions.

The code review question is specific: which original field authorizes this transformation? If the answer is only a similarity between two field names, preserve the source value and leave the interpretation explicit.

## Keep exact arithmetic useful without making it the whole decision

The reader keeps monetary amounts as decimal strings. That makes a statement comparison inspectable: the reported opening amount, signed booked total, calculated close and reported close can all be shown in the same exact representation. A browser rendering choice should not decide whether the source arithmetic matches.

Once the arithmetic matches, though, the parser still has work to do. The Goldman Sachs CBPR example supplies the balanced page that opens this article. Its pagination and intermediate balance mean the result is incomplete for a final close. [3]

| Question | Result for the supplied page |
| --- | --- |
| Does opening plus the booked entries equal its reported boundary? | Yes: difference is exactly zero. |
| Is this the final page? | No: the source marks another page. |
| Does its balance establish a complete period close? | No: the retained balance is intermediate. |
| What can the application retain? | The original entries, source page, arithmetic result and precise closing issues. |

I find this a useful pattern beyond bank imports. An aggregate may be internally consistent while covering the wrong scope. A migration can preserve the count of the rows it happened to read; a report can reconcile the selected partitions while omitting another partition. The scope belongs next to the arithmetic in the data model.

For our review screen, the consequence is straightforward. Show the page result and the closing candidate independently. Keep the reason beside the unavailable close action so the operator knows which missing source information would change the decision.

## An empty statement still has an account and a boundary

The itemized publisher example includes an account with no entries and equal opening and closing balances of 4,200. It is still a complete statement. A transformation beginning with entries.flatMap would have lost that account before it reached the review screen. [2]

The companion implementation begins with statements.map. Inside each statement it combines posted, pending and other retained entries for display, while keeping their categories visible. The statement itself survives when that combined list is empty.

```
const entries = [
  ...statement.rows,
  ...statement.pendingRows,
  ...statement.excludedRows.map(item => item.row)
].sort((a, b) => a.source.charStart - b.source.charStart);
```

The important choice is outside those four lines: the containing account, reporting period and balance candidates belong to the statement. They do not need a transaction to exist. The same distinction makes the accountant export intelligible when an account had no activity.

## Let a reviewer return to the exact original

A discrepancy becomes much easier to resolve when the application can open the original entry. Our source locations carry a document path, byte range and decoded character range. That gives the interface a precise original fragment instead of requiring someone to search a large XML file for a repeated amount.

I also kept the original file identity beside the report. The interpretation includes the message version and the chosen detail-check policy. Those are part of what the operator reviewed. A receive action should be bound to that source and interpretation, so an edited mapping cannot quietly reuse an earlier approval.

There is a practical limit here: preserving the source does not require duplicating the entire XML document inside every projected row. Keep one original file, stable locations and the relevant structured fields. That supports both a compact review interface and a full downloadable report.

Malformed input takes a different path. The reader returns its original structural error, with the source retained for correction. The importer should never repair a tag and then present the repaired document as the unchanged bank input. If someone provides a corrected edition, that edition becomes a new source with its own identity.

## Use the same reader in the example

I added a small read-only command and a separate projection module to the Merchant product. The command accepts an original XML file, invokes the maintained source reader and prints the information discussed above. It makes no network request and opens no accounting workspace.

```
node products/merchant-bank-statements/examples/review-camt053.mjs \
  /absolute/path/original-statement.xml
```

If the file lacks an institution identity, the optional second argument supplies the existing stable institution namespace used for that account. The format guide explains that selection and the full receiving workflow. The example keeps the parser’s original namespace-based version selection.

I ran the projection against the complete retained reports from the two readable Goldman Sachs examples. It preserved four statements, fifteen entries, fifteen details, the zero-entry statement and the matching-but-incomplete close. The −10 entry retained its −50 detail comparison. These are observations about the original source reports, which the complete receiving programme carries into the application’s separate import and close operations.

The useful end state is a reviewer who can point to an amount, identify the exact source entry, inspect its details and explain whether the available statement can close. That is the contract I want a bank importer to make: each transformation has a source, each discrepancy stays visible, and each account keeps its own boundary.

## Source and reproduction

1. [SIX Swiss Payment Standards 2025, version 2.2: entry, direction/reversal, pagination and transaction details](https://www.six-group.com/dam/download/banking-services/standardization/sps/ig-cash-management-sps-2025-en.pdf)
2. [Goldman Sachs itemized CAMT.053 publisher example](https://developer.gs.com/docs/services/transaction-banking/camt-053-itemized-eu-txn)
3. [Goldman Sachs CBPR publisher example](https://developer.gs.com/docs/services/transaction-banking/camt053-cbpr-sample)
4. [Maintained source reader and CAMT adapter at the inspected application revision](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/933219ca2f66ebbaf28d5a7ef69cefe278de2a98/stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements)
5. [Complete original-bank receiving programme and operating instructions](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/tree/4c5bdd3d4c227f43af4d8987d690286266dd9ffe/operations/merchant-bank-camt053-receiving-dff77-20261013)

Companion files: examples/review-camt053.mjs and examples/camt-review-summary.mjs in this product directory. The article describes the source behavior inspected on 13 October 2026. Source ownership and prior contributors are preserved in the maintained code. TokenJunkieLabs engineering; prepared with AI-assisted engineering and source review.
