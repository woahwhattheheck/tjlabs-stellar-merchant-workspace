# Purchased API access

Use a purchased API allowance from one saved customer workspace. The browser, local agent and installed Node client share its passes, exact requests, original purchase history and retained responses.

Open **Applications → API-pass customer**, or start the installed `api-pass-workspace` command. Add a private agent directory to generate the complete local MCP configuration. The same workspace stays responsible for the request queue and purchase lifecycle.

## What you can do

- Connect existing access by its original order and purchased plan, or reopen the original saved purchase.
- Inspect the merchant's actual routes, unit costs and remaining allowance.
- Save a request body, ordered query and stable request ID before execution.
- Reopen that same request after a lost response, keeping its original result and allowance accounting.
- Review and execute an original purchase through its selected browser or terminal approval channel.
- Inspect authenticated payment recovery and complete Buyer history.
- Capture exact responses, reviews, payment records and customer history for complete, resumable downloads.
- Stop and reopen the customer, agent host or receiving client with the same retained identities.

## Start here

The [operating guide](OPERATING.md) covers the selected package installation, customer configuration, browser and Applications startup, generated agent settings, durable client commands, complete downloads and recovery.

The maintained source interfaces remain available:

| Interface | Installed entry |
| --- | --- |
| Customer browser and managed application | `starforge api-pass-workspace` |
| Exact request client | `starforge api-pass-client` |
| Original purchase lifecycle | `starforge api-purchase` |
| Reusable MCP client and retained operations | `starforge merchant-api-pass` |
| Original authenticated MCP host | `starforge merchant-mcp` |
| Local subprocess MCP host | `starforge merchant-mcp-stdio` |

Programmatic integrations use the installed `@tokenjunkielabs/starforge-merchant` package. It exports the customer lifecycle, typed API MCP client, retained command helpers and original host initializer. The [client guide](../../stellar-forge/mcp-merchant-operator/API_PASS_WORKSPACES.md) describes their complete schemas and methods.

Keep the original customer directory and its separate Buyer, Inbox and merchant state with the selected runtime. Complete captured customer files can be delivered independently; their saved manifests identify the exact received bytes.

Authored by TokenJunkieLabs.
