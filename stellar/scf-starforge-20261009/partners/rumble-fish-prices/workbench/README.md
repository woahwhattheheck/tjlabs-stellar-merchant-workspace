# Stellar Prices customer workbench

A complete customer integration for the original Rumble Fish Stellar Prices API: choose exact assets, preview native requests, collect current prices and history, inspect provenance and coverage, continue interrupted collections, and hand over the runnable workspace with its retained data.

The implementation calls the provider's published API from the owning Node process. It retains the original response bytes, request plans, cursors and attempts. The industrial browser console reads that workspace through its local operator service.

## Start

Use Node 22.16 or later. The workbench uses its built-in runtime facilities.

    node cli.mjs init --dir /absolute/private/prices-workspace
    node cli.mjs serve --dir /absolute/private/prices-workspace

Open the complete operator link printed by the process. The local listener binds to 127.0.0.1; its random operator capability moves from the link fragment to session storage and then the authorization header.

Saved results, configuration and planning are available independently of provider access. Set the provider's existing key in the owning process for collection:

    STELLAR_PRICES_API_KEY='existing-provider-key' \
      node cli.mjs serve --dir /absolute/private/prices-workspace

Keep the existing key in the process environment or the application's normal secret configuration. The retained workspace and delivery carry public configuration and native results.

Provider references:

- [Live OpenAPI contract](https://prices-api.sorobanscan.rumblefish.dev/api-docs-json)
- [Stellar Prices API source](https://github.com/rumblefishdev/stellar-prices-api)
- [Provider access portal](https://sorobanscan.rumblefish.dev/prices-api/)

The original provider origin is https://prices-api.sorobanscan.rumblefish.dev. An explicitly selected local native-source instance can use a loopback origin.

## Complete operator workflow

### 1. Select the exact assets

Use the catalog's actual identifiers, or enter one per line. XLM is native. Classic assets use CODE:ISSUER, with the original case-sensitive code and its Stellar issuer address. Soroban tokens use their contract address. Token display symbols can overlap; the workbench carries the whole asset identity.

The catalog preserves type, classic-code prefix, sort, order, page size and optional venue-volume filter. Each collection advances through the native opaque cursor. Preview next page retrieves the original request filters before continuing that cursor.

Save selection & preview retains the asset selection and history settings, then creates an immutable plan. The preview shows the exact methods, paths, query values and batch bodies before collection starts.

### 2. Collect the data needed by the consumer

Choose one or more native operations:

| Operation | Original provider interface |
| --- | --- |
| Catalog | GET /v1/assets |
| Current price batches | POST /v1/prices/batch, up to 100 identifiers per native request |
| Individual price and source breakdown | GET /v1/assets/{asset_identifier}/price |
| Asset metadata | GET /v1/assets/{asset_identifier} |
| Price history | GET /v1/assets/{asset_identifier}/ohlcv |
| Oracle readings | GET /v1/oracles/{asset_identifier} |
| Historical coverage | GET /v1/backfill/status |
| Service health | GET /health |

History settings use the provider's exact timeframe, granularity, base currency and optional start/end values. Plan creation fixes the requested time window. Large windows split at the original 5,000-candle limit while retaining the same asset, currency and requested candle size.

Start collection runs the saved requests sequentially through the native client. The default 1,100-millisecond interval fits the published one-request-per-second allowance. The provider's key/429/quota/transient outcomes are recorded on the request that received them.

Pause finishes and retains the current read. Resume continues from the first unfinished request. Completed requests remain completed, and the original response/cursor remains attached to its collection. A process interruption becomes an explicit resumable collection state when the retained workspace reopens.

### 3. Read price age and quality correctly

Current prices preserve their native decimal strings. The age calculation uses as_of, while updated_at remains the snapshot refresh time. The configured age target is displayed separately from the provider's own method and price_status.

| Native field | Operator meaning |
| --- | --- |
| as_of | The price observation's own timestamp |
| updated_at | The time the snapshot row refreshed |
| price_status | priced, carried, unpriced, or temporarily unspecified |
| method | The provider's attribution, such as traded or oracle |
| sources | Native per-venue price and volume breakdown |
| volume_24h_usd | Provider total volume, whose pair-side treatment differs from the source breakdown |

The provider's hourly USD conversion means a carried observation can be normal during that processing cadence. Empty time plus unpriced identifies the original unavailable-price state. A temporarily unspecified status stays unknown.

History retains null OHLC values, original trade and price-forming counts, source, method, quality, derived/divergent flags and the optional backfill note. The browser shows a close-price graph alongside exact decimal rows. The graph uses floating-point coordinates for rendering; retained JSON and CSV preserve the original field values.

Coverage refresh reads the original status endpoint. It displays the provider's realtime ingest tip, SDEX archive progress, Soroban AMM status and earliest available history. Provider coverage and collected price quality remain separate observations.

### 4. Export the actual consumer data

Open a retained request to inspect its original request, status, response, headers and receipt time. Download exact JSON retains the original response text. CSV uses a deterministic column mapping for each native operation and retains price decimal strings. Import decimal columns as text in spreadsheet applications that otherwise round them.

The batch CSV includes rows for the provider's not_found identifiers. History rows carry asset, granularity and currency with the original candle values. Source/quality fields and unavailable values remain visible in the corresponding data.

### 5. Deliver and reopen the workspace

Pause & export complete workspace drains the active read, then captures the saved workspace coherently. The portable JSON includes all runnable source, configuration revisions, original plans, collection attempts/cursors and exact retained responses. Every file has its byte count and SHA-256.

    node cli.mjs export \
      --dir /absolute/private/prices-workspace \
      --out /absolute/private/stellar-prices-workbench.json

    node cli.mjs unpack \
      --file /absolute/private/stellar-prices-workbench.json \
      --out /absolute/new/prices-handoff

    node /absolute/new/prices-handoff/cli.mjs inspect \
      --dir /absolute/new/prices-handoff/workspace

    node /absolute/new/prices-handoff/cli.mjs serve \
      --dir /absolute/new/prices-handoff/workspace

Unpack validates all file identities and relative paths before writing into a new directory. The portable format carries up to 20,000 files and 256 MiB of original data; larger retained workspaces continue from their original directory. Export pauses the collection and leaves the original operator able to resume it.

The delivered source contains its captured live provider contract. Open an existing workspace using its delivered application version so its retained contract identity stays attached to the collected data.

## Native application integration

The typed API is exported from runner.mjs:

    import { openWorkbench } from './runner.mjs';

    const workbench = await openWorkbench({
      directory: '/absolute/private/prices-workspace',
      apiKey: process.env.STELLAR_PRICES_API_KEY,
    });
    const plan = await workbench.plan({
      kind: 'collection',
      name: 'Wallet price integration',
      assets: ['native'],
      operations: ['batch', 'history', 'detail'],
      history: { timeframe: '7d', granularity: '1h', base_currency: 'USD' },
    });
    const run = await workbench.start({ planId: plan.id });

Use snapshot() to observe the active collection and retained projections. result({runId,taskId,format}) reads the original retained result or its CSV mapping. getPlan({planId}) reopens the immutable request plan. pause(), resume({runId}), exportState() and close() control the same native operation.

save({expectedRevision,configuration}) accepts a complete configuration and rejects a stale revision. The console merges an edited section into the current full configuration while preserving the section's expected revision. A concurrent save leaves the operator's draft intact.

The process API key binds to the initial provider origin. Reopen the process with explicitly chosen configuration to change that destination. The API client sends the key through x-api-key, preserves native HTTP outcomes, and retains a selected set of response headers with each original body.

## CLI collections

The CLI provides the same saved plan and collection lifecycle:

    node cli.mjs plan --dir /absolute/workspace --spec /absolute/collection.json
    node cli.mjs collect --dir /absolute/workspace --plan SAVED_PLAN_ID
    node cli.mjs resume --dir /absolute/workspace --run SAVED_RUN_ID
    node cli.mjs result --dir /absolute/workspace \
      --run SAVED_RUN_ID --task SAVED_TASK_ID --format csv --out /absolute/result.csv

The collection command observes completion or a native continuation state. SIGINT and SIGTERM request a pause that retains the active read before the owning process closes. Output files use create-only writes.

Configuration defaults include 250 requests per collection segment, three transient retries, a 30-second request timeout and a 7,200-second price-age target. These are operator settings. The published provider allowance is 100,000 requests per month. Workspace usage counts cover this workspace's attempts; another application can use the same provider allowance.

## Source layout

The original provider contract and retrieval provenance are in sources/. contract.mjs preserves its native identifiers, routes and schemas; client.mjs executes the declared requests; workspace.mjs retains the data; runner.mjs manages the same plan/run lifecycle; analysis.mjs maps original results and their quality into the consumer view.

server.mjs, cli.mjs and ui/ expose that core workflow. delivery.mjs joins the authored source and the coherent retained workspace for handoff.

## Customer values and downstream receiving

Open **Customer values** for the configured asset-book, exact-decimal valuation, source-edition comparison, review and published-feed workflow. The complete [customer consumer guide](./CONSUMER.md) covers the browser, CLI, application API and downstream wallet receiver, including later-source receiving and same-customer reopen/export. Existing discovery, watchlists, historical work and request continuation remain part of the same delivered workspace.
