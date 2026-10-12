# Captured API merchant

Turn a network capture from an API you operate into a reviewed, priced data
service. This product opens the original merchant browser and its HAR and
OpenAPI agent connections against one private project library.

The complete workflow keeps the original capture, observed inventory, authored
source decisions, exact atomic prices, merchant packages, releases and receiving
files together. Reopening uses the same native workspaces.

## Open the product

Use the complete TokenJunkieLabs Stellar merchant package on Linux with Node.js
22.16 or later and util-linux flock. The
[installation guide](../merchant-workspace/OPERATING.md) and
[runtime installer](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
describe the maintained archive and dependency installation.

~~~sh
starforge captured-api init --dir /private/merchant/captured-api \
  --name 'Supplier API'

starforge captured-api open --dir /private/merchant/captured-api --browser-only
~~~

Create the private parent directory first. Open the complete browser URL printed
by the second command. Its access token belongs to this local session.

From the source checkout, replace `starforge captured-api` with
`node products/captured-api/cli.mjs`.

In the browser, open **Captured API sources**, upload the original HAR, inspect
the observed operations, author safe source decisions, and save the review.
Use that source in the merchant form. Configure the public seller URL, payment
terms, backend references and response policy, review the complete route
worksheet, and save the original merchant package.

The same browser starts the merchant, checks its routes, opens operations and
continues its release workflow.

## Open it from Applications

Initialize the private product, then select **Captured API merchant** in
**Applications** for the installed READY runtime. Choose its retained product
directory, browser and agent settings, and original private environment.
Review and save the application, review its start, then open the same browser
and native merchant agent from the managed operation.

Applications binds the existing product and configuration before launch.
Its Stop action drains the owned agent and browser; starting the saved
application again reopens the same captured sources, merchant packages and
releases. The [operating walkthrough](OPERATING.md#run-the-retained-product-from-applications)
covers initialization, managed review/start, both listeners and recovery.

## Add the merchant agent

Set the incoming MCP bearer token in the host's existing environment, then open
the same product without `--browser-only`:

~~~sh
starforge captured-api open --dir /private/merchant/captured-api \
  --token-env MCP_ACCESS_TOKEN --mcp-port 3211
~~~

The result includes the existing merchant MCP URL and workspace alias
`merchant`. The agent can intake and review captures, continue source editions,
configure the merchant, apply the same source-bound pricing worksheet, retain
complete downloads, and stage original packages.

Close the first product process before opening another against that directory.
Ctrl-C drains the agent's accepted work, then closes the product's owned original
browser and seller. Retained operating files stay in place.

## Complete operating paths

| Work | Operating path |
| --- | --- |
| Capture and review an API | Browser upload and integrated review; original offline HAR commands are also available |
| Author and price routes | Native merchant form and shared route worksheet |
| Operate the same source through an agent | Both original providers attached to workspace `merchant` |
| Manage the full product in Applications | Select the initialized product, review/save/start both original listeners, and reopen through its retained operation |
| Use an existing managed browser | Initialize with its exact projects directory and private Applications URL record |
| Update from a later capture | Select the previous saved source review and continue the native refresh workflow |
| Hand over a complete merchant collection | Merchant handover browser: saved selection and full native review → complete file download/upload → receiving-name review → native receive and merchant reopen |
| Compare and receive an incoming merchant edition | Saved installed/incoming comparison → complete receiving-name decision → native receive and reopen |
| Recover an interrupted setup or session | Reopen the same private product, source identity, saved package and release |
| Recover the complete operating workspace | Reviewed source selection → native encrypted snapshot → complete restore → original-path receiving → ordinary cold reopen |

Choose **Merchant handover** in the original browser to prepare a complete
collection or receive one. Draft editions, native operations, resumable uploads
and received merchants stay with the same product across restarts. The original
terminal workflow can also export and import the complete handover file.

The [complete handover guide](HANDOVER.md) covers source/merchant selection,
full native file delivery, package-name review and resumable receiving with the
original saved plans and exact prices.

The [complete operating guide](OPERATING.md) follows these paths through
installation, first source, exact prices, release, customer receiving and
upgrades.

## Move a complete collection through the agent

The existing merchant agent now operates saved handover drafts, native review
jobs and complete archives through `merchant_handover_*` tools. It can stream
an entire published collection between declared original product workspaces,
resume the saved receiving upload, review destination names and reopen the
received merchants and source histories. The same operation is available with
`starforge captured-api handover remote` and the typed streaming client.

The [agent and terminal walkthrough](AGENT.md) carries the complete selection
through publication, full-file transfer, native receiving and merchant reopen.

## Collaborate on a handover draft

**Combine saved and working edits** compares a retained working form with the
current saved draft. Independent merchant, source-review and receiving-name
changes combine; conflicting values receive explicit current or working
choices. The exact reviewed result saves through the original edition writer
and continues into the existing package and receiving operations.

Complete working-edit files retain the original product, draft and saved base.
The same reconciliation is available through four merchant tools, the typed
client and the original terminal’s working-export/import commands. The
[collaboration walkthrough](COLLABORATION.md) covers two operators, full file
exchange, conflict choices, saved-request recovery and native receiving.

## Compare and receive an incoming merchant edition

Open **Incoming editions** on a saved receiving draft. Choose the installed
merchant baseline, compare complete routes, exact prices, API declarations and
native files, then review and save the receiving name for the incoming version.
The ordinary native REVIEW, RECEIVE and REOPEN operations use that saved edition.

The browser, five edition tools and typed client share the same retained
comparison. The original terminal's edition-export command keeps the complete
index and both native snapshots for every merchant, with interrupted
publication recovery and offline reopening. The [incoming editions
walkthrough](EDITIONS.md) follows the full comparison-to-received-merchant path.

## Recover the complete operating workspace

The recovery commands capture the complete retained product, source and review
histories, release/export stores, operator procedures, handover drafts/jobs and
original authorization files through SF101's native encrypted snapshot engine.
Explicit additional roots include provider data outside the original configured
source selection.

Review and save a complete source plan, retain the encrypted capture and its
manifest hash, restore into a private staging operation, then review and receive
the original absolute paths. Exact saved requests resume interrupted capture,
restore and receiving. Native completed archives and partial uploads keep their
original records while explicit recovery bindings follow the restored files.
Ordinary product and Applications opening continue from the same received state.

The [operating recovery guide](RECOVERY.md) covers the full source selection,
capture, authenticated restore, receiving and cold-reopen sequence, with the
complete terminal commands and typed API.
