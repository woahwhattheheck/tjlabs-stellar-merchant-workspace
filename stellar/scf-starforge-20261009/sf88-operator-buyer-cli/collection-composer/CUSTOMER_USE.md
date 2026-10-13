# Calendar to Buyer Collections commissioning

Customer-use commissioning connects a saved Grant Installation calendar to the original Request plans, prepared periods and buyer results. Open **Customer-use commissioning** in the existing private Collections workspace. The same saved workflow is available through `buyer-customer-use` and the typed client.

A calendar supplies useful tasks and dates. An original Request plan supplies the actual provider catalogue row, accepted terms, operator configuration and complete request. The commission records the operator's explicit join between them. Preparing or creating a period does not enqueue, sign or execute a request. Run the selected requests through the existing Collections controls.

## Complete operating sequence

1. In Grant Operations, open the original saved Installation editions and export the selected **Customer-use calendar** as JSON. This is the full `stellar-forge.sf47-customer-use-calendar.v1.selection` document, including original buyer/task/funding references, report, receipts and current changes.
2. Open the original Collections workspace and select **Customer-use commissioning → Import saved Calendar export**. The exact UTF-8 bytes and SHA-256 are retained. A new source import does not replace another saved selection.
3. In **Request plans**, select the actual original provider catalogues, rows, accepted payment options, operator bindings, request bodies and output destinations. Save the reusable plan through the existing authoring interface.
4. Return to the commission. In **Periods and review**, select an exact saved Request plan revision and enter the original named period and parameter values. A collection reference remains attached to that one plan/name/value selection.
5. In **Useful tasks**, choose the original dated use and select the request keys that supply its whole useful output. An allowance use keeps its original prepaid funding group. A reopen selects an already retained collection, intent and response digest. Cancelled uses remain visible and do not enter the active request selection.
6. Name the responsible operator and save the commission. Every save creates an immutable revision or adopts an identical current definition. The original Calendar bytes and all prior plan bindings remain available.
7. Prepare each selected period. Review **all** requests in its original period and the existing spending groups, including requests not bound to an active Calendar entry. Creating the original collection retains the whole period. **Open active bound requests** selects only the active bound requests for subsequent operator review; it never runs them.
8. Use the existing collection's queue, approval, signer, budget, pause, recovery and receiving controls. Each request keeps the native `collectionId:requestKey` intent and original job ID.
9. In **Buyer results**, refresh the current original records. Select the saved use bindings whose results belong in a return, and choose **Capture selected original buyer results**. Capture invokes the maintained read-only Inbox exporter. It verifies retained evidence and response files without a provider or ledger request.
10. Download the exact saved buyer return. In the original Grant **Native buyer receiving** screen, review that file, select the original buyer deployment and existing purchase associations, then receive it through the normal version-bound command.
11. Save/export/reopen the complete Grant case through its existing receiving workflow. Use **Backup and receiving** in Collections to transfer the whole editable buyer workspace, including source calendars, commission history, saved plans, original prepared inputs, native operator state and retained responses.

### Dates, planned funding and actual observations

A planned date does not trigger execution. The operator chooses the useful period and selected original requests when they are ready. Calendar repeat-use projections and Cohort targets remain in the saved Grant source. Buyer capture preserves actual payment, settlement, output and order evidence; receiving and Cohort review establish the observed outcome.

One prepaid purchase can fund several allowance dates. Reopening a retained response preserves its original intent and response digest. Neither the number of bindings nor the number of Calendar dates is a new payment count. A native request may supply several uses; the review displays repeated request bindings and the return carries one original Inbox row per distinct intent.

For a weekday planning example, twenty purchase events and thirty useful requests can be different quantities. Bind each useful task to its real request; keep the original direct or prepaid funding relationship. These are plans until the original evidence and receiving operation establish actual activity.

## Saved definition

```json
{
  "schema": "stellar-forge.sf88.customer-use-commission.v1",
  "id": "weekly-source-review",
  "name": "Weekly source review",
  "calendarSha256": "<exact imported Calendar SHA-256>",
  "note": "Original saved customer task and provider plan selection.",
  "periods": [
    {
      "collectionId": "source-review-2026-10-19",
      "name": "19 October source review",
      "planId": "<existing plan ID>",
      "planSha256": "<exact saved plan SHA-256>",
      "values": {"period": "2026-10-19"}
    }
  ],
  "bindings": [
    {
      "id": "review-use",
      "entry": {
        "installationId": "<original Installation ID>",
        "revision": 1,
        "installationSha256": "<exact historical edition SHA-256>",
        "entryId": "<original use ID>"
      },
      "kind": "PERIOD_REQUESTS",
      "requests": [
        {"collectionId": "source-review-2026-10-19", "requestKey": "<original key>"}
      ],
      "responses": [],
      "note": "The selected request supplies the original useful output."
    }
  ]
}
```

The angle-bracket values above are selectors to replace with actual retained identities. The example is not a customer receipt. The source's buyer, task, date, state and funding relationships are immutable. To change the customer plan, save a following Installation/Calendar edition through Grant Operations, import that exact export and save a new commissioning revision.

A `RETAINED_RESPONSES` binding uses an original REOPEN entry, an empty `requests` array, and `responses` containing `{collectionId, manifestSha256, intentId, responseSha256}`. The original response is reverified by capture before the return is accepted.

## Local command line

Run `starforge buyer-customer-use --help`, or use the maintained source:

```sh
node stellar/scf-starforge-20261009/sf88-operator-buyer-cli/collection-composer/customer-use-cli.mjs --help
```

All paths below are absolute private paths. The Collections workspace must already exist.

```sh
starforge buyer-customer-use import --directory /private/collections --file /private/calendar.json
starforge buyer-customer-use sources --directory /private/collections
starforge buyer-customer-use save --directory /private/collections --file /private/commission.json --expected-head none --actor Operator --request-id UUID
starforge buyer-customer-use show --directory /private/collections --id COMMISSION --revision REVISION_SHA256
starforge buyer-customer-use prepare --directory /private/collections --id COMMISSION --revision REVISION_SHA256 --collection PERIOD --actor Operator --request-id UUID
starforge buyer-customer-use create --directory /private/collections --id COMMISSION --revision REVISION_SHA256 --collection PERIOD --edition-sha256 EDITION_SHA256 --preview-sha256 PREVIEW_SHA256 --actor Operator --request-id UUID
```

Copy actual returned hashes into the next reviewed action. Use a new UUID for a new action. Reuse the same UUID and complete exact input when continuing an interrupted action.

After the original buyer operation:

```sh
starforge buyer-customer-use capture --directory /private/collections --id COMMISSION --revision REVISION_SHA256 --bindings BINDING_A,BINDING_B --actor Operator --request-id UUID
starforge buyer-customer-use download-return --directory /private/collections --id COMMISSION --request-id UUID --out /private/buyer-return.json
starforge buyer-customer-use action --directory /private/collections --id COMMISSION --request-id UUID
starforge buyer-customer-use export --directory /private/collections --id COMMISSION --revision REVISION_SHA256 --format json --out /private/commission-complete.json
starforge buyer-customer-use verify-receiving --directory /private/collections
```

`capture --max-verify-bytes N` changes only the original per-file verification bound, from zero through 1 GiB. A response above the selected bound remains OVER_LIMIT; an unavailable response remains unavailable. The exporter does not claim those bytes were verified.

## Client and authenticated HTTP

`createCustomerUseClient({url, fetch?})` in `customer-use-client.mjs` accepts the existing private Collections URL. Full types are in `customer-use-client.d.ts`. Each method accepts a final `{signal}`.

| Method | Purpose |
| --- | --- |
| `importSource`, `listSources`, `source` | Retain/read exact original Calendar exports |
| `save`, `list`, `inspect` | Edit/reopen immutable commission history and current original results |
| `prepare`, `create` | Invoke original Request plan period APIs with retained reviews |
| `capture`, `returnedFile` | Retain/read original Inbox evidence joined to saved useful tasks |
| `action` | Inspect the exact original request and returned result after interruption |
| `export` | Complete JSON inspection history or dated-use CSV |
| `verifyReceiving` | Reopen retained source/history/return files and original native period references |

All routes are mounted under `/api/customer-use/` in the original listener, after its bearer-session, Host, Origin and same-origin checks. Source import sends raw original bytes to `sources/:sha256`; ordinary action bodies are JSON. Download responses carry actual byte count, SHA-256 and the original commission revision. The client verifies download bytes before returning them.

`openCustomerUseCommissioning({collections, composer?})` borrows the existing native owners. Its `close()` blocks new work and drains its own calls. It closes only a composer it opened; the caller still owns the original Collections controller. The shared server closes this facade before closing any adopted Collections store.

## Buyer return and original Grant receiving

The explicit `stellar-forge.sf88.customer-use-return.v1` file retains the complete original SF88 handoff bytes and digest, a saved commissioning identity, exact historical Installation/use references, and the original collection/intent/job/configuration/result bindings. Native payment rows are interpreted by the unchanged original Inbox reader. The wrapper's source digest identifies the whole return; `buyerSource` separately identifies the original inner capture.

Grant preview reopens each exact saved Installation edition under the current case and verifies its complete original dated-use entry. It checks the native job and both source/execution configuration hashes. Selected results must retain the use's original buyer deployment. Original purchase/transaction identity rules and current authorized records remain authoritative.

Editable case import creates a new case identity. Historical Installation editions and their original case/source IDs stay intact. The receiver classifies the observed case relationship while binding each use to the exact immutable edition held by the received case. It does not rewrite old IDs to the new case ID.

The original command remains `buyer.receive`, with original current case version, preview SHA-256, actor, note, request ID, deployment and explicit `{jobId,purchaseId}` selections. Existing native purchases are reused. A partial or uncertain response is reconciled through that original command with its same exact input. The new carrier does not call the buyer or create a second purchasing engine.

Complete case receiving rechecks the retained return, original HTML review sources, selected buyer/job/purchase associations and receiving history against the saved Installation editions. Complete Collections recovery includes the original private native state and response files; the buyer return itself does not embed response bodies or private execution configuration.

## Interruption and concurrent editing

Each commissioning action retains its exact request before calling the original period or capture owner. The browser retains the same UUID/input before dispatch and exposes **Inspect original result** and **Continue exact request**. A lost response is not an invitation to create another period or capture ID.

An immutable revision save compares the selected expected head. Editing an old historical revision does not silently overwrite a newer saved edition. Reopen the current head and incorporate the intended change. A completed original save can still be recovered after another revision was saved; its receipt names the original revision and separately reports the current head.

Capture retains the first complete original Inbox file before packaging. Re-entering that same action reads and verifies those exact bytes; it does not recapture a changed native outcome. A later explicit observation uses a new request UUID and remains a separate retained return.

The original Collections root shared recovery lease is acquired before the commissioning directory lease. Backup uses the original exclusive recovery boundary. No second private database, signer, ledger, scheduler or native execution lock is introduced.

## Limits and complete handover

| Boundary | Limit |
| --- | --- |
| Original Calendar import | 32 MiB exact JSON |
| Commission definition | 2 MiB |
| Complete immutable action/revision record | Original 16 MiB initialization-record limit |
| Selected Installation editions / uses per Installation | 100 / 500 |
| Periods / use bindings | 500 / 2,000 |
| Captured original intents | 1–100 distinct intents |
| Original embedded Inbox handoff | Existing 8 MiB |
| Compact saved-use context / whole return | 2 MiB / 16 MiB |
| Original output verification | Up to 1 GiB per file and 1 GiB total |
| JSON inspection export | 64 MiB; larger complete history uses encrypted backup |
| Grant source/case limits | Existing total 24 MiB source custody and 32 MiB complete case bundle |

The 16 MiB admission applies only to the validated new return. Existing SF88/Node handoff source limits stay 8 MiB. A complete return plus other retained sources must fit the original case capacity. Select a smaller complete group of original intents when it does not; never remove original evidence to make a partial carrier appear complete.

Use the existing encrypted Collections backup for an independently editable operating handover. JSON and CSV exports are inspection and planning artifacts; they do not initialize another buyer workspace. Reopen the restored original Collections directory and run `verify-receiving`, then inspect the saved commission, original periods and retained buyer returns before continuing any selected native work.

### A save rejected before admission

The browser retains the complete action before dispatch. After a definitive validation or stale-head rejection, **Inspect original result** reads admission while the original Collections directory lease excludes all in-flight commissioning writers. An absent journal is returned as `NOT_ADMITTED`. Only this result together with the actual rejection enables **Return to editing and review current head**. That action archives the exact rejected input and error in the browser, preserves the full edited definition, and opens the current saved head for comparison. The next explicit save uses a new request identity and that reviewed head. A retained action, network timeout, server failure or uncertain inspection keeps the original request for continuation.

The Grant buyer receiving screen accepts the complete customer-use return up to 16 MiB and displays the exact Installation, dated useful task, commission revision and original buyer beside the unchanged native job evidence. Existing Inbox and Node files keep their 8 MiB limit. Its original HTTP body ceiling is 32 MiB, enough for the bounded base64 carrier; the existing complete-case 24 MiB source and 32 MiB bundle ceilings remain in force. A return containing several original buyers is received through explicit selections for each original buyer, while the complete source stays retained.
