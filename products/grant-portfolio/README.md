# Grant portfolio reconciliation

Receive complete IATI and 360Giving publisher editions, review how their organizations,
grants and activities relate, and deliver a portfolio that reopens with its sources and
review history.

The product uses one saved native workspace through its browser console, Applications
launcher, Python CLI, typed client and merchant tools. Its seven tables cover entities,
financial records, links, decisions, candidates, changes and sources. Operators retain
unmatched and coverage-only records and review decisions again when a following edition
changes the source.

Financial records keep the original decimal value, currency, type, date, source and
reporting period. The review interface presents compatible financial groups and links
every record to its source edition.

## Install and operate

Build the committed `grant-portfolio` source selection with the maintained distribution
builder, prepare and install its runtime, then prepare the private product:

~~~sh
starforge grant-portfolio-workspace prepare \
  --runtime /srv/starforge/runtimes/grant-portfolio \
  --directory /srv/starforge/products/grant-portfolio \
  --python /srv/starforge/python/grants/bin/python \
  --title "Grant portfolio reconciliation"

starforge grant-portfolio-workspace open \
  --directory /srv/starforge/products/grant-portfolio --port 0
~~~

The command prints the complete local console link. The same prepared workspace appears
under **Applications → Grant portfolio reconciliation** when selected in the Runtime
workspace. Preparation retains the original runtime, interpreter and workspace identities,
plus the Applications settings and merchant setup files.

| Work | Guide |
| --- | --- |
| Build, install, prepare, use the console and operate through merchant tools | [Operating](OPERATING.md) |
| Run the complete original Comic Relief workflow from the installed package and reopen both customers | [Installed receiving](RECEIVING.md) |
| Understand source coverage, review decisions, later editions and exact financial records | [Native operator guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/OPERATIONS.md) |
| Integrate the typed client, Applications lifecycle or merchant file transport | [Client and merchant interface](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/CLIENTS.md) |
| Inspect the full portable handoff and reopen its original sources and history | [Native handover format](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/RECEIVING.md) |
| Review the selected original engines and their source continuity | [Source lineage](SOURCE_LINEAGE.md) |

The installed archive contains the complete 77-file native source declaration,
the original IATI and 360Giving receiving engines, publisher schemas and assets, and the
product, Applications and merchant interfaces. The distribution manifest identifies every
selected file by its Git blob, byte length and SHA-256.
