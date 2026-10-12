# Continue an accepted service renewal into billing

This native programme continues the original completed service-renewal case through the existing accounting, receivables and service-agreement owners. It consumes the exact accepted handover produced by the operational case. The companion Merchant Performance programme operates the separate recorded-usage and repricing workflow.

## Original input

Use the complete source of this product revision and the retained `accepted-handover.json` from the original C12 service-renewals journey. That journey's accepted native interval is 1 November 2026 through 1 February 2027 at USD125 for each monthly period.

When retaining the original operational case, call `runServiceRenewalsExercise({caseStore,caseId,workspaceId,casesDirectory})` from a driver that owns its case directory. The journey's standalone command removes its temporary case directory when it exits. Its accepted handover file remains a valid input to this financial continuation.

The `handoverPath` input is the complete original UTF-8 JSON file. Its exact quotation and customer-response material bytes pass to the financial owner along with that unchanged handover string. The source validator checks their original identities, accepted head and service interval.

## Continue the completed case

Use Node22.16 or newer. Choose a fresh private output directory whose parent already exists.

```sh
node experiments/accepted-renewal-financial-84df-20261012/accepted-renewal-financial.mjs \
  /ABS/SOURCE \
  /ABS/NEW_FINANCIAL_OUTPUT \
  /ABS/accepted-handover.json \
  /ABS/RETAINED_CASES \
  /ABS/producer-result.json \
  SOURCE_COMMIT_FROM_THE_RECEIVED_SOURCE
```

The case-directory, producer-result and source-commit arguments are optional. When the retained case directory is supplied, the programme reads and exports the original saved case. It uses the actual supplied source commit in the returned operation record.

The module also exports:

```js
await runAcceptedRenewalFinancial({
  sourceRoot,
  operationRoot,
  handoverPath,
  caseDirectory,
  producerResultPath,
  sourceCommit
});
```

The programme creates a fresh original accounting workspace and linked customer, retains the intended requests, creates the three-period service calendar, bills and issues its first invoice, exports every agreement source and document, closes the workspace, then reopens it through the maintained HTTP server and typed client.

It also exercises exact create-request replay and the controller's existing refusal to assign one accepted renewal head to a second calendar. These use the same original financial owner and operated workspace.

## Retained output

The output includes the unchanged accepted handover, quotation and customer response; the original producer result and optional full saved-case export; accounting terms and the original accounting workspace; retained customer, settings, agreement and invoice requests; complete flat agreement files; the HTTP agreement TAR; the final agreement detail; and `native-result.json`.

New retained files are written and synced to a private adjacent temporary file, atomically linked to their final name, and followed by a directory sync. Existing files are never overwritten. An interrupted operation retains the original workspace and request files for its receiving operator.

To exercise the installed product against that same workspace, build the maintained `merchant-service-agreements` selection from the received source commit and run its installed `starforge service-agreements detail` and `export` commands. Select the returned workspace, agreement UUID and as-of date. Keep the completed accounting workspace and installable archive together in the private delivery.

The original case producer, this financial continuation, and the installed product all refer to the same accepted operational handover. Their source files and complete operated workspaces remain useful inputs to subsequent integration and grant demonstrations.
