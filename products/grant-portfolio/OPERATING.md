# Operate the grant portfolio product

Use this workflow for the standalone `grant-portfolio` selection in
`woahwhattheheck/tjlabs-stellar-merchant-workspace`.

## 1. Build the selected source and install its runtime

Choose the complete source commit and use the original distribution builder:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref ORIGINAL_COMMIT \
  --selection grant-portfolio --out /absolute/grant-portfolio-release --offline
~~~

Use the archive path and SHA-256 returned by that build. The builder's original Git
reader resolves static dependencies and includes the source-owned native support files.
If required Git objects are absent, finish their existing acquisition and repeat the
same build directory and source commit. The build and runtime retain their acquisition,
profile and materialization records.

Prepare and install with the original runtime commands:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /srv/starforge/runtimes/grant-portfolio \
  --archive /absolute/grant-portfolio-release/ORIGINAL_ARCHIVE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /srv/starforge/runtimes/grant-portfolio --offline

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /srv/starforge/runtimes/grant-portfolio --load --source
~~~

An offline install uses the operator's existing dependency cache. Use the original
installer's cache and acquisition options for the selected host. Continue until its
actual inspection reports **READY**.

The selected runtime enables the original MCP feature and operator host requirements.
The native portfolio application runs on Linux with Node 22.16 or later, Python 3.11 or
later, SQLite and the existing `flock` process lease. Installed receiving also uses
Linux `/proc`, `os.pidfd_open` and `signal.pidfd_send_signal` to resume the exact
owned console process after interruption. Choose a Python environment
containing the original publisher dependencies in [requirements.txt](requirements.txt):

~~~sh
python3 -m venv /srv/starforge/python/grants
/srv/starforge/python/grants/bin/python -m pip install \
  -r products/grant-portfolio/requirements.txt
~~~

The Comic Relief spreadsheet converter uses its own environment and its
[original converter requirements](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/examples/comic-relief/converter-requirements.txt).
Its conversion run prepares the full native publisher packets before product receiving.

## 2. Prepare a new product or attach a received workspace

Use an existing private parent directory and absolute real paths:

~~~sh
starforge grant-portfolio-workspace prepare \
  --runtime /srv/starforge/runtimes/grant-portfolio \
  --directory /srv/starforge/products/grant-portfolio \
  --python /srv/starforge/python/grants/bin/python \
  --title "Grant portfolio reconciliation"
~~~

This creates the native workspace under the product directory and records the selected
runtime, installed source, Python environment and workspace identity. A repeated command
with the same arguments reopens that preparation and preserves configured packet handles.

To prepare a product around an already received original workspace, use a new private
product directory and select the native workspace explicitly:

~~~sh
starforge grant-portfolio-workspace prepare \
  --runtime /srv/starforge/runtimes/grant-portfolio \
  --directory /srv/starforge/products/customer-portfolio \
  --python /srv/starforge/python/grants/bin/python \
  --workspace /srv/starforge/customer/native-portfolio \
  --title "Customer grant portfolio"
~~~

Preparation produces:

| File or directory | Purpose |
| --- | --- |
| `product.json` | Selected runtime, interpreter, native workspace and interface paths. |
| `PREPARATION.json` and `PREPARED.json` | The original preparation input and completed workspace binding. |
| `application-settings.json` | Workspace, Python, private connection-file path and automatic loopback port. |
| `grant-portfolios.json` | The original merchant workspace alias and declared complete packet handles. |
| `merchant-options.json` | Original provider initializer input for this product. |
| `merchant-overlay.json` | The connection reference for an existing merchant configuration. |
| `workspace/` | Native SQLite workspace, source objects, review history and exports for a newly prepared product. |
| `console.json` | Private live connection announcement created and removed by the original console. |

The files and workspace remain private to the operator. Preserve this directory together
with its selected runtime for reopening. A portable customer handoff uses the native
export workflow below.

## 3. Open the console or launch it through Applications

~~~sh
starforge grant-portfolio-workspace open \
  --directory /srv/starforge/products/grant-portfolio --port 0
~~~

Open the complete local link printed by the native console. Closing the original process
retains the workspace and releases its writer.

For the managed Applications workflow, attach the READY runtime to the existing Runtime
workspace:

~~~sh
starforge runtime-workspace attach \
  --workspace /srv/starforge/operator \
  --runtime /srv/starforge/runtimes/grant-portfolio \
  --label "Grant portfolio"

starforge runtime-workspace serve \
  --workspace /srv/starforge/operator --port 8465
~~~

Create that Runtime workspace with its original `init --workspace` command first
when setting up a new operator. In its browser, select **Applications → Grant portfolio
reconciliation**. Use the saved product's workspace and Python paths and the private
connection-file path from `application-settings.json`. Review, save, connect
the installed release and start the application. Its original observer authenticates
the live console and verifies the reviewed source and workspace before offering **Open**.

Use the existing **Stop** and **Reopen** actions for the managed application. For a new
source release, prepare its runtime and review the same native workspace in Applications
again so the managed source selection follows the reviewed upgrade.

Inspect the prepared product with:

~~~sh
starforge grant-portfolio-workspace status \
  --directory /srv/starforge/products/grant-portfolio
~~~

Status reads the live typed client when the console owns the workspace and uses the native
saved-state command when it is closed. If a process died with its connection file retained,
status reports RECOVERABLE. Open the same product or review/start it in Applications. The
native launcher acquires the original workspace lease, retires that workspace's stopped
connection and atomically publishes its new complete launch.

## 4. Receive and review the complete publisher editions

Open **Source editions**, upload each complete native IATI or 360Giving packet, and retain
its standard, publisher, edition label, authoritative URL, observation time, license and
coverage. The original packet and its complete native records become an immutable source
edition.

Create a portfolio from the selected source IDs. Work through **Entities**, **Candidates**,
**Links**, **Decisions** and **Financial**. Review the original source references and save
the relationship, disposition, reviewer and rationale. Keep records whose programmes or
dates lie outside another publisher edition visible as coverage-only or unmatched.

The seven tables remain pinned to the selected portfolio revision. Page through all rows
for a complete table, and open entity detail to read its original source and financial
records. Amounts remain exact decimal text. Financial groups distinguish source, kind,
currency, type, date and reporting period.

Receive a following edition as another complete source. Select the replacement in a new
portfolio revision, inspect **Changes**, and review decisions whose source references have
changed. Earlier revisions and their source references remain available.

The [native operator guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/OPERATIONS.md)
contains the complete field definitions, decision forms and later-edition workflow.

## 5. Connect the original merchant tools

Edit only the packet-handle collection in `grant-portfolios.json` to declare
complete input files for agent use. A handle names its absolute file path, optional exact
SHA-256 and label. The saved alias `portfolio`, workspace ID and connection-file
path bind this product to its console.

Initialize the source-owned provider using the prepared input:

~~~sh
starforge merchant-providers inspect grant-portfolios

starforge merchant-providers init grant-portfolios \
  --options /srv/starforge/products/grant-portfolio/merchant-options.json
~~~

The initializer returns the created `merchant-mcp.json` path. Use that
configuration with the installed **merchant-mcp**, **merchant-mcp-stdio** or
**merchant-mcp-client-config** command and its original transport setup. An existing
merchant can use the connection reference from `merchant-overlay.json`.

Agents operate the same saved console through `merchant_grant_portfolio_` tools:
select the workspace, read its schema and state, upload a declared native packet, save
source/portfolio/review actions, page exact revisions, export and receive the complete
customer file. Retain the original operation ID and expected revisions through a lost
reply. Read the existing request and explicitly continue its retained operation.

The original console owns the database writer; the merchant owns its retained downloads
and exports. The [client guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/grant-portfolio/CLIENTS.md)
defines the exact tool payloads, typed client and source-owned provider configuration.

## 6. Deliver and reopen a complete portfolio

From the selected portfolio revision choose **Export complete portfolio**. The handoff
contains all earlier revisions, all seven row tables for each revision, original source
packets, review decisions, origin-bound requests and the 77-file native runtime closure.

The equivalent saved CLI operation is available when the console is closed:

~~~sh
starforge grant-portfolio-workspace native \
  --directory /srv/starforge/products/grant-portfolio -- \
  export --portfolio-id ORIGINAL_PORTFOLIO_UUID --revision ORIGINAL_REVISION \
  --operation-id ORIGINAL_EXPORT_OPERATION \
  --out /absolute/private/Grant_Portfolio_Complete.zip
~~~

Repeat the same export operation and destination to reopen its identical completed file.
Use **Source editions → Receive a complete portfolio** in a new original workspace,
or the original `grant-portfolio-receive` merchant receiving command. The recipient
can continue review, export the combined history again, stop and reopen that workspace.

[Installed receiving](RECEIVING.md) exercises this entire path with the original Comic
Relief publisher inputs and two independent received customer workspaces.
