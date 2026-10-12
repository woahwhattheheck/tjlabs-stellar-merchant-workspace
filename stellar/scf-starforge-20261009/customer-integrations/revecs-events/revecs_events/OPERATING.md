# Event workspace

This workspace receives the complete Biotech Catalyst Sentinel event stream and turns it into a source-linked monitor for one customer. It keeps the event cursor, every response body, the current watchlist and prior receiving editions in one private SQLite database.

## Start with the public preview

Use Python 3.11 or later on Linux. The browser operator, preview, replay, export and restore use the Python standard library. Run these commands from the folder containing the revecs_events package:

```sh
python3 -m revecs_events init ./preview --preview --name "Biotech event preview"
python3 -m revecs_events preview ./preview ./examples/provider-events-sample.json --metadata ./examples/provider-meta.json
python3 -m revecs_events watchlist ./preview --set XPRTN XEXTD
python3 -m revecs_events serve ./preview
```

Open the private operator link printed by the final command. The published sample contains fictional records. Its original six events demonstrate a date assignment, an FDA extension, a complete response letter, a stale filing, a vendor correction and a merged record. The full body and the provider's source quote for each event remain available.

The three screens cover day-to-day review, complete receiving history and handover. Search by company, drug or any co-filer ticker. The current-date panel links to the source that established the served date; the full timeline keeps other observations. Withdrawn records appear when Include withdrawn records is selected. A merged record points to its surviving catalyst.

## Receive a customer's event stream

Install the payment integration into an isolated environment:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r revecs_events/payment-requirements.txt
.venv/bin/python -m revecs_events init ./customer --name "Research event monitor"
```

Set PAYER_PRIVATE_KEY in the receiving process environment through the customer's existing secret management. The operator has no field for a wallet key. The payer is the customer's Base wallet; x402 2.25.0 performs the original EVM exact-payment signing and HTTP retry. The default asset is native Circle USDC on Base.

Receive a first full history:

```sh
.venv/bin/python -m revecs_events receive ./customer --pages 40 --max-usdc 2.00 --max-page-usdc 0.05 --operation first-history
.venv/bin/python -m revecs_events serve ./customer
```

Each operation has an explicit number of new page requests, total authorization and per-page authorization. The provider's current payment challenge determines the actual amount; the client signs only a matching x402 v2 exact requirement for the configured network, asset, exact request URL and available authorization. The default price allowance is 0.05 USDC for an event request. Page count and price are separate controls.

A current event page is a paid request even when it contains no new events. Local searches, watchlist changes, replay, export and source-body downloads use the saved workspace. Read free provider metadata records the public /v1/meta response separately. The receiver leaves at least one second between event pages; a paid page normally uses an initial challenge request and one signed request.

The same controls are available in Receiving history. Stop after this response lets the current request finish receiving before ending the operation. Reopening the browser reads the saved workspace; it does not create a payment.

## Cursor identity and watchlists

The provider sends ascending cursor pages when since is present. Every request in a workspace includes since and its fixed page limit. Event IDs may have gaps; a gap is not itself a missing record. The next cursor is the complete page's highest event ID. An empty page must echo the requested cursor and declare no remaining page.

The default workspace receives the unfiltered stream. A local watchlist matches every co-filer and does not change the provider cursor. To receive a provider-filtered stream, create a separate workspace:

```sh
.venv/bin/python -m revecs_events init ./single-ticker --ticker XEXTD --name "Selected company events"
```

The API origin, provider ticker and page limit belong to the workspace identity and cannot be changed in place. A different server filter needs a different workspace; it must start with its own since=0 history. The preview uses its own unfiltered workspace.

## Restart and interrupted receiving

Each request has an attempt record before dispatch. Response headers and payment metadata are retained, and each response chunk commits to SQLite before the SDK or application consumes it. The complete successful response and its receiving state commit together. The event rows and cursor then advance in a separate atomic transaction after complete-body and contract validation.

After a process exit, the next receiving operation applies a complete saved response before making a new provider request. An incomplete response remains available in Receiving history, with its received bytes and full error chain retained in the database. Its cursor does not advance.

The provider settles before the response reaches the caller and uses a single-use payment authorization. If a paid response is lost, fetching that page again requires a fresh authorization. The workspace reserves the amount once before signing, retains the original attempt and uses a new attempt for the next request. It does not treat a partial body as a complete event page.

Use a stable operation name for a logical command. Repeating that exact name and the same options returns its recorded result with zero new request. To continue beyond an earlier limit, stopped operation or interrupted attempt, supply a new name and explicit limits:

```sh
.venv/bin/python -m revecs_events receive ./customer --pages 40 --max-usdc 2.00 --operation history-continuation-2
.venv/bin/python -m revecs_events status ./customer --timelines
```

A kernel receiving lease allows one receiver per workspace. Reading, source inspection and a consistent backup remain available while receiving. A crashed process releases the kernel lease. Saved operation identities and prior errors remain in the complete history.

## Corrections, mergers and complete reconciliation

The served date is the new_date on the latest observed event whose applied flag is true. A stale recovered filing with applied=false stays in the timeline. An unchanged-date restatement updates its provenance without inventing a move. A provider corrected event is a vendor data repair and remains distinct from an FDA extension.

A complete response letter describes the rejected review cycle. A later assigned goal date can reopen that review; a restatement of the same date does not erase the prior outcome. Decision events may carry a date. An unfamiliar future event type is retained, and its date is applied only when the provider marks it applied; it is not counted as an FDA action.

The provider can re-parent earlier events after a merge and change a prior merge after restoration. A forward-only cursor cannot revisit those older rows. After a merge or restoration appears in an incremental update, the operator asks for a full history reconciliation:

```sh
.venv/bin/python -m revecs_events receive ./customer --refresh --pages 200 --max-usdc 10.00 --operation full-reconciliation-2
```

A new edition starts at since=0. The prior completed edition remains current while this new edition is being received. The new edition becomes current only after its final complete page. If it takes several operations, the next operation continues the pending edition. Earlier editions, original pages, partial responses and watchlist revisions remain in the database and the complete export.

During incremental review, a merged record has an explicit successor, and the surviving card includes its observed co-filers and nonduplicate history. The complete fresh edition is authoritative for re-parenting and restoration. The local display computes whether a date is upcoming from the current UTC calendar date instead of reusing a stale provider request-time flag.

## Complete handover and moving the workspace

Create an export from Workspace & handover, or run:

```sh
python3 -m revecs_events export ./customer ./customer-event-workspace.zip
python3 -m revecs_events verify-export ./customer-event-workspace.zip
python3 -m revecs_events restore ./customer-event-workspace.zip ./received-workspace
python3 ./received-workspace/open.py
```

The ZIP includes the entire SQLite database, every complete and partial original body with metadata, all local operator source, static assets, the current edition's offline HTML reader and a complete file inventory with sizes and SHA-256 values. Restore checks every member and reopens the moved database. Existing export names and restore destinations are preserved; choose a new name for another delivery.

Open index.html directly to review the saved current edition without a server or network request. Its searches, local watchlist filter, full timelines and source-body downloads work from the extracted package. Use python3 open.py for prior editions, replay, continued receiving or changes to the saved watchlist. The local operator creates a fresh private access token on each start.

The payment dependencies are optional for viewing, replaying, exporting and restoring. Continued paid receiving also needs the customer's own payer environment. Keep customer responses and exports within that customer's intended use and distribution; the provider's license permits customer-product display subject to its terms.

## Original bodies and local replay

Every response has a download in Receiving history. The JSON status output also exposes its saved response ID for a script:

```sh
python3 -m revecs_events response ./customer RESPONSE_ID ./original-response.json
python3 -m revecs_events replay ./customer
python3 -m revecs_events verify ./customer
```

Replay derives the selected edition from its complete stored pages and leaves the original responses unchanged. Its body checks and cursor continuity run before replacing derived events. The complete handover includes the original database and operator, so a receiver can repeat this process after moving the package.

## Implementation and source references

The store and operator use SQLite, fcntl receiving leases and Python's standard-library HTTP server. Paid receiving subclasses only the original x402 requests adapter's response construction to retain streamed bodies before either consumer. Signing, payload creation and the signed retry remain in the published SDK. The browser uses local static assets and a loopback-only token-protected API.

- Provider API 0.8.0 contract: https://api.biotechcatalystsentinel.com/openapi.json
- Public event example: https://api.biotechcatalystsentinel.com/v1/events/sample
- Provider freshness and source guidance: https://api.biotechcatalystsentinel.com/v1/meta
- Provider terms: https://biotechcatalystsentinel.com/terms.html
- Original Revecs starter and payment example: https://github.com/revecs-hq/x402-paid-api-starter/tree/f3c8c0306a7d946ed55603e5a7050f80aa904192
- Published x402 2.25.0: https://pypi.org/project/x402/2.25.0/
- Circle USDC on Base: https://www.circle.com/blog/usdc-now-available-natively-on-base
