# Operate the CoinGecko product

Use one retained market project from request authoring through customer reopening.
The local browser, CLI and merchant MCP use the same original model and queue.

## Configure and open the project

~~~sh
starforge coingecko-product workspace \
  --state /absolute/private/market --port 0 \
  --config /absolute/private/operator-config.json
~~~

The optional configuration names existing buyer profiles:

~~~json
{
  "buyerProfiles": [{
    "id": "existing-stellar-buyer",
    "name": "Existing Stellar operator",
    "network": "stellar:testnet",
    "configPath": "/absolute/original/buyer-config.json",
    "workspacePath": "/absolute/original/buyer-workspace"
  }]
}
~~~

The browser shows profile names and original operation results. Signing keys,
active ledgers, budgets and native workspaces remain at their original private
paths. Create a project with a useful research name. Select the actual merchant
origin and prefix when that additional route exists; an empty origin still
supports collections, source intake, research and delivery.

One server owns a state directory. Multiple users work through its HTTP
interface and retained revision checks. Stop that server before a separate
mutating CLI command against the same directory. The original browser binds to
loopback and checks Host, Origin and the custom write header. The managed
Applications entry provides the saved runtime start/open/stop/reopen workflow.

## Define the complete request collection

| Family | Native path | Identity to retain |
| --- | --- | --- |
| Coin prices | /simple/price | IDs, names or symbols and selected quote currencies |
| Onchain token prices | /onchain/simple/networks/{network}/token_price/{addresses} | Original data network, address selection and query |
| Pool search | /onchain/search/pools | Search text, filters, included entities and page |
| Trending pools | /onchain/networks/{network}/trending_pools | Data network, duration, included entities and page |
| Token details | /onchain/networks/{network}/tokens/{address} | Data network, native address and optional top-pool composition |

Import the original collection.example.json for editable definitions from all
five families. It contains request definitions, with no current observations.
The request editor and original contracts retain lookup priority, selected
fields and original merchant request-target notices.

Collections preserve request order and stable references. The exact request
query is retained independently of the advertised 402 resource URL. Data
network and payment network remain separate. Original Base/Solana requirements
stay those native options; an additional Stellar route has its own requirements.

## Retain and inspect original sources

Use an original HTTP response, selected unsigned probe, original native result
or deliberately extracted provider Bazaar example.

When metadata references a separate original body/header file, supply the
complete original files. The importer verifies declared byte counts and
hashes and retains the source URL, status and observation time. An imported
challenge keeps the original resource and ordered requirements unchanged.

The source view exposes files, original basis, source pointers, missing tokens
and indexing errors. Download any original file directly. Extract Bazaar
example creates a separately labelled provider_bazaar_example capture linked
to its original challenge. The export retains that distinction and the original
observation time.

Unsigned probes use the original retained queue. Continue or cancel unfinished
requests on the resulting job. A new page or refresh is an explicit request
and source observation. The customer delivery commands read a completed archive;
they do not issue provider requests.

## Develop the research

Create a named snapshot by selecting one response per request. It pins captures,
request versions, rows and source hashes. Compare two saved snapshots.

The exact-decimal engine preserves source spelling and separately records
numeric and formatting changes. Missing, null and zero remain distinct.
Address/network identity, ordered relationships, requested-token reserves,
full-pool reserves, market capitalization and FDV retain their original meaning.

Attach notes to a request, capture, row, snapshot or comparison. Notes retain
title, text, status, assignee and versions. Resolve a concurrent-write response
against the current record returned by the original model, then apply the
reviewed change.

Before handover, name the snapshots and comparisons the recipient should use,
finish notes belonging to this edition and retain unresolved questions as notes.
The complete original export includes every current record, earlier version,
retained row, original source and event.

## Configure the provider's additional route

A provider plan identifies the controlled origin, prefix, five-family selection,
original native terms and licensed upstream. This structural example leaves
accepts empty for the provider's actual requirements:

~~~json
{
  "name": "Provider market service",
  "publicOrigin": "https://market.provider.example",
  "pathPrefix": "/api/v3/stellar",
  "endpointIds": [
    "simple-price", "token-prices", "search-pools",
    "trending-pools", "token-data"
  ],
  "accepts": [],
  "endpointAccepts": {},
  "upstream": {
    "origin": "https://pro-api.coingecko.com",
    "basePath": "/api/v3",
    "apiKeyEnv": "COINGECKO_PRO_API_KEY"
  }
}
~~~

Select actual ordered requirements from an original provider-controlled
challenge or the provider's configuration. The compiler requires valid native
terms before producing the deployment. Review the selected origin, network,
asset, amounts, settlement account and per-family choices.

~~~sh
starforge coingecko-product provider compile \
  --plan /absolute/private/provider-plan.json \
  --out /absolute/private/reviewed-deployment.json

starforge coingecko-product provider serve \
  --plan /absolute/private/provider-plan.json --port 8423 \
  --facilitator https://facilitator.provider.example \
  --data-module /absolute/provider/market-data.mjs
~~~

The trusted module exports resolveData({endpoint,request,context,signal}) and
returns an original Response or status/headers/body. Preserve raw JSON text or
bytes; floating-point parse/stringify changes exact market values.

When using the configured upstream directly, the API key comes from the named
environment variable. The plan retains its name, not the secret. The original
provider preserves its prepayment admission, cancellation, native facilitator,
response status and relevant cache/content headers.

## Continue an original buyer operation

Select the saved collection, current merchant challenge and exact native option.
Original SF88 intake retains its review, signer binding, budget record and terms.
Execute uses that original review.

Controls reflect the original job's allowed actions. A returned response becomes
a capture only after the native writer's saved bytes and hash match. Cancel,
resume and recover use the retained operation and attempt. Reopening an
interrupted project does not create a replacement payment.

~~~sh
starforge coingecko-product operator status \
  --state /absolute/private/market --project ORIGINAL_PROJECT_ID

starforge coingecko-product operator list \
  --state /absolute/private/market --project ORIGINAL_PROJECT_ID \
  --kind jobs --offset 0 --limit 25

starforge coingecko-product operator recover \
  --state /absolute/private/market --job ORIGINAL_JOB_ID \
  --actor "Original operator" --op-id ORIGINAL_RECOVERY_OPERATION
~~~

operator forwards arguments unchanged to the maintained CoinGecko CLI. Its
--help exposes every original command.

## Produce the complete customer edition

Export from Handover, or stop the server and use the original CLI:

~~~sh
starforge coingecko-product operator export \
  --state /absolute/private/market --project ORIGINAL_PROJECT_ID \
  --name "Reviewed market edition" \
  --out /absolute/private/reviewed-market.json.gz \
  --actor "Delivery operator" --op-id ORIGINAL_EXPORT_OPERATION

starforge coingecko-product delivery create \
  --archive /absolute/private/reviewed-market.json.gz \
  --out /absolute/private/customer-delivery
~~~

A different source archive belongs in a new delivery directory.

| File | Complete content |
| --- | --- |
| research.html | Industrial printable overview, source identity, research summaries and links to the complete files |
| project.json, records.json | Original current project and every current record |
| requests.json, collections.json | Native request definitions, path/query and ordered collections |
| captures.json | Source basis, HTTP identity, observation times, files and analysis notices |
| snapshots.json, comparisons.json | Named source selections and comparison summaries |
| notes.json, provider-plans.json | Research notes and provider work |
| jobs.json | Original native job history |
| market-rows.jsonl | Every retained row with identity, relations, pointers and notices |
| market-fields.csv | Source fields with exact text, original type, value state and capture identity |
| comparison-fields.csv | Before/after presence and spelling, exact decimal deltas and formatting changes |
| versions.json, events.json | Earlier record versions and the full operator history |
| source-files.json, sources/ | Original file IDs/names/types and deduplicated exact source blobs |
| market-handover.json.gz | Verbatim original complete project archive |
| source/, SOURCE_RUNTIME.json | Original runnable source closure and retained inventory |
| delivery.json, START_HERE.md | Complete file hashes, edition identity and customer instructions |

A blank CSV text cell does not decide whether a value is null or missing. Read
its explicit value_state or presence columns. Import value columns as text to
preserve long decimals and timestamps. The JSON/JSONL keep the complete typed
structure.

## Receive, reopen and keep working

~~~sh
starforge coingecko-product delivery receive \
  --directory /absolute/private/customer-delivery \
  --state /absolute/private/recipient-market \
  --actor "Recipient operator" --operation original-customer-delivery
starforge coingecko-product workspace \
  --state /absolute/private/recipient-market --port 0
~~~

Receiving uses a separate private directory, which can already contain other
market projects. The original transactional restore adds a distinct project.
The result names the received project and returns its current counts.

Continue with the same directory, archive, actor, name and operation ID. A
completed repeat reuses the saved restore, verifies original source files and
preserves later notes, requests, snapshots and other work. A new archive edition
uses a separately named operation.

Select the returned project in the browser and continue ordinary authoring.
Historical native jobs remain historical through the original restore engine.
Configure current buyer profiles through the normal recipient configuration
when preparing new work.
