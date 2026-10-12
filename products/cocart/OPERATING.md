# CoCart merchant and customer receiving

This product connects an existing WooCommerce shop to the original CoCart
customer application. An operator imports the shop's saved headless product
profile or a complete customer receiving file, reviews the exact source and
payment terms, prepares the native workspace, and continues the same customer
through cart activity, Woo checkout, merchant handling and full receiving.

The local setup page, managed Applications, merchant MCP tools and CLI all
select the same original CoCart workspace. The setup package preserves the
imported bytes and supplies the native runner and a complete installation
handover.

## Start with the appropriate saved source

| Starting point | File to select | Result |
| --- | --- | --- |
| A shop has an approved mapped simple virtual product | The product's original saved headless profile JSON | A new customer workspace bound to those exact saved product and merchant terms. |
| A preceding operator has already worked with the customer | Complete CoCart receiving JSON | The same cart history, source objects, checkout previews and retained order handoffs in the receiving directory. |
| The shop needs its initial Woo merchant setup | The existing Woo setup page and original SF104 source | The maintained merchant, payment, order, buyer and fulfillment configuration. Save the product mapping before exporting its CoCart profile. |

The selected native contract is CoCart Community **4.9.7**, its original v2
API, and **@cocartheadless/sdk 1.2.1**. Its mapped checkout currently selects
one simple virtual product at quantity one with the exact saved Woo total and
Stellar terms. The original cart still supports quantity, removal, clear,
calculation and retained response inspection. The separate Woo merchant
workflow retains its own basket, refund and delivery operations.

A receiving file contains the original customer workspace and every referenced
source object. Keep customer files and their working directories in the
operator's private storage. The setup listener serves installed source assets;
selected customer files are processed in the browser and copied into the
operator's downloaded setup package.

## Install the selected product

Use the maintained Linux operator host: **Node.js 22.16 or later**, Python 3.11
or later, Git and util-linux flock. Working directories need original local
file locking, atomic rename and fsync behavior.

Build the committed source selection in a distinct output directory:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/path/to/tjlabs-stellar-merchant-workspace \
  --ref ORIGINAL_COMMIT \
  --selection cocart-merchant \
  --out /absolute/private/packages/cocart-merchant
~~~

Use the archive path and SHA-256 returned by that operation. The original
builder retains the selected commit, source-selection bytes, contribution
inventory, original browser assets, command registrations and each source
file's identity. A resumed output keeps its original commit and selection;
a different selected product uses a new output directory.

The archive is the maintained **@tokenjunkielabs/starforge-merchant** package.
Its version ends with **.selection.cocart-merchant**, and its executable is
**starforge**. The selection includes the original Woo merchant and delivery
workflow, CoCart's native and managed commands, the local setup page, the
CoCart Applications provider and the merchant workspace provider.

Use the existing runtime installer with that archive:

~~~sh
starforge runtime-install prepare \
  --dir /absolute/private/runtimes/cocart \
  --archive /absolute/private/packages/cocart-merchant/ORIGINAL_ARCHIVE.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native \
  --feature schema --feature openapi --feature mcp --feature cocart \
  --operator

starforge runtime-install install \
  --dir /absolute/private/runtimes/cocart

starforge runtime-install inspect \
  --dir /absolute/private/runtimes/cocart --load --source
~~~

The **cocart** feature uses the original component manifest, which pins SDK
1.2.1. The existing schema, OpenAPI, MCP and native groups retain their actual
dependency declarations and probes. The static setup page itself uses Node's
built-in modules and browser APIs.

A source checkout can invoke the same commands through:

~~~sh
node stellar/scf-starforge-20261009/distribution/cli.mjs cocart-setup --help
node stellar/scf-starforge-20261009/distribution/cli.mjs cocart-managed --help
~~~

[Runtime installation](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md)
and [source selections](../../stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md)
describe the retained installer, complete dependency installation and original
recovery options.

## Open the local customer setup page

From the prepared runtime:

~~~sh
starforge runtime-install run \
  --dir /absolute/private/runtimes/cocart -- cocart-setup --port 8787
~~~

Or from the already installed package:

~~~sh
starforge cocart-setup --port 8787
~~~

Open the exact URL printed by the listener. The default address is
**http://127.0.0.1:8787/cocart.html**. The listener is bound to the local host
and serves the original declared setup assets. Ctrl+C closes it.

Keep the same hostname and port when reopening saved browser drafts. Browser
storage is scoped to that origin; **--port 0** intentionally selects an
available port and may use another draft store. Download the original draft
JSON when moving to another browser, host or port.

The same source includes the existing **/woo.html** setup and **/index.html**
front door. The full referenced pages, shared ZIP writer, draft store, original
source downloads and existing public example travel with this selection.

### Prepare the customer package

1. Import the original saved product profile or complete receiving JSON.
2. Set a useful customer label and the real absolute private workspace directory.
   Its parent must already exist.
3. Select the installed original SDK entry if an explicit path is needed.
   Leave it empty when the maintained runtime resolves its pinned SDK normally.
4. Optionally select the native merchant connection path, workspace alias and
   existing merchant agent directory. These select the same original customer.
5. Add the actual original Woo handoffs or extra receiving files under distinct
   aliases when they belong to this customer. They remain named source inputs
   for later explicit native operations.
6. Review the imported product, exact decimal and atomic values, currency,
   native route, original file lengths/hashes and retained receiving history.
7. Save the draft, then download the complete setup ZIP. Preserve the original
   draft and ZIP together with the customer handover.

The setup ZIP carries **setup.json**, **cocart.mjs**, **INSTALL.md**, every
selected original input byte and its source manifest. Reopen the downloaded
draft to revise the selected host paths or label before creating another
package. A stale tab reports its actual saved revision conflict; Save as new
creates an intentional separate draft.

A separately selected initial receiving transport can map the saved profile
to an actual local receiving store. That original JSON has **store_url**,
**checkout_url** and **reason**. The native validator compares the retained
source profile and creation transport. Later transport changes use the
existing **transport.rebind** operation and retain their reason in history.

## Inspect and prepare with the original native runner

Extract the setup ZIP into its own private directory. Set **TOOLKIT** to the
actual complete checkout or installed package directory. For an installed
package, that is the directory containing its package.json and source/
directory. The runner resolves the original CoCart module beneath that root.

Run from the extracted setup directory:

~~~sh
TOOLKIT=/absolute/path/to/checkout-or-installed-package

node cocart.mjs inspect --toolkit "$TOOLKIT"
node cocart.mjs prepare --toolkit "$TOOLKIT"
node cocart.mjs status --toolkit "$TOOLKIT"
node cocart.mjs open --toolkit "$TOOLKIT"
~~~

**Inspect** checks the original setup manifest, every regular source file,
saved byte count and SHA-256, and invokes the original profile, receiving,
handoff and SDK validators. It reports the selected native source and real SDK.

**Prepare** invokes the original managed setup. A profile creates or reopens
its bound workspace; a complete receiving export selects the native receiving
operation and imports the original reachable objects. Optional connection and
merchant fields are passed to the existing provider. Original source bytes
are checked again after preparation.

**Status** rereads the actual current workspace. **Open** starts its original
private customer listener, using the saved workspace, selected SDK and native
connection. Open the printed URL. Ctrl+C closes this direct listener; use the
managed Applications lifecycle below when the application belongs to a saved
runtime.

Repeat Prepare only with the same original packet and selected directories.
A repeated receiving packet validates its original receiving marker and keeps
later customer activity. The result reports both the input export's version
and the actual current workspace version.

A repeated initial profile transport is compared with its original recorded
creation selection. It preserves later cart changes, later transport rebinds
and the original private connection. A different creation transport reports
the actual conflict; use the native transport action to change the current
connection.

## Operate the customer and original Woo order

The native customer application keeps the source catalog, guest cart,
original CoCart requests/responses, operation IDs and checkout review.

| Operation | What the operator reviews |
| --- | --- |
| Load the catalog and create or load the cart | Actual selected store, native product data and the original cart/session identity. |
| Add, change quantity, calculate, remove or clear | Original response, exact totals and the current cart revision. |
| Review checkout | The saved mapped product, quantity, currency, total, route and merchant terms. |
| Open native Woo checkout | The actual selected Woo checkout and the original cart-loading integration. |
| Attach its SF104 handoff | The actual order and original handoff against the same native checkout preview. |
| Continue seller and fulfillment work | The existing Woo merchant, native buyer and SF98 delivery state. |

The checkout review uses the original selected mapping. Preserve the actual
ineligible result when quantity, product, total or terms differ; change the
real cart or approved merchant mapping through its owning workflow.

After a transport interruption, inspect the same original operation and
retained request/response. The workspace keeps interrupted exchanges and
current cart history for recovery. Continue the original cart and checkout
identity instead of creating a replacement order to stand in for an uncertain
one.

[Native CoCart operation](../../stellar/scf-starforge-20261009/sf104-woocommerce-merchant-bridge/cocart/README.md),
[Woo gateway](../../stellar/scf-starforge-20261009/sf104-woocommerce-merchant-bridge/GATEWAY.md)
and [Woo merchant operations](../../stellar/scf-starforge-20261009/sf104-woocommerce-merchant-bridge/OPERATIONS.md)
contain the exact source contracts and retained order behavior.

## Use managed Applications

Attach the READY runtime directory in the original Runtime workspace.
Open **Applications**, select the existing CoCart application and enter:

| Field | Value from the customer setup |
| --- | --- |
| workspaceDirectory | The prepared original customer directory. |
| sdkModule | The optional explicit pinned SDK entry. |
| connectionFile | The same native merchant connection, if configured. |
| workspaceAlias | The original alias in that connection. |
| Local port | The existing common setting; zero selects a free local port. |

Review and save the application. **Review start → Start → Open** uses the
original manager, native source/SDK/workspace selection and actual startup
readback. The existing manager retains the listener identity, resource lease,
private environment and saved application record.

**Stop** closes that original child. Reopening the saved application selects
the same workspace, carts, source objects, preview and order history. Native
mutations retain the original per-operation lock and revision checks. The
customer listener and the original MCP can share this saved workspace.

The original
[managed CoCart guide](../../stellar/scf-starforge-20261009/sf104-woocommerce-merchant-bridge/cocart/MANAGED.md)
contains the full source binding, native identity and startup/shutdown contract.
The selected package retains the original CoCart application adapter and shared
manager rather than introducing another application store.

## Use the same merchant agent connection

The setup's optional merchant fields prepare the original provider connection.
The existing merchant configuration selects **cocartWorkspaceConnection**.
Its **cocart-workspaces** provider and CoCart tools use the same CartWorkspace
as the customer application.

The provider's named handoff and receiving inputs are original local files.
Actual attach, receiving, download and export actions remain tied to their
original operation and customer identity. The optional merchant directory is
initialized through the maintained merchant provider during native setup.

Inspect the installed source registrations:

~~~sh
starforge registrations --source cocart
starforge registrations --source merchant-provider-cocart-workspaces
starforge registrations --command cocart-setup
starforge registrations --command cocart-managed
~~~

The source-native [MCP CoCart module](../../stellar-forge/mcp-merchant-operator/cocart-workspace.mjs)
and [Applications adapter](../../stellar/scf-starforge-20261009/distribution/runtime-workspace/application-cocart.mjs)
remain the implementation for these operations.

## Export, receive and keep working

Export the complete current customer from the extracted setup:

~~~sh
node cocart.mjs export --toolkit "$TOOLKIT" \
  --out /absolute/private/delivery/CoCart_Receiving_Workspace.json
~~~

The original CartWorkspace creates the receiving bundle; the runner validates
its complete envelope before saving. The result identifies the actual
workspace version, revision, receiving digest, cart count and source-object
count. An existing output with different bytes is preserved; choose a new
filename for a later edition.

To hand it to the next operator:

1. Keep the complete receiving JSON and its actual returned byte/hash identity.
2. Open the local CoCart setup page and select that original receiving JSON.
3. Choose the receiving operator's new real private workspace and connection
   paths. Select that installation's actual pinned SDK.
4. Download the setup ZIP and run Inspect, Prepare and Status there.
5. Open the original customer and inspect the retained cart, checkout and
   handoff. Stop and reopen through the same selected lifecycle.
6. Continue future customer work in that receiving workspace and retain its
   next complete export as another edition.

Receiving preserves original objects and history. It does not need a new
upstream cart request to read the saved customer. Subsequent explicit native
actions use the receiving installation's selected transport.

## Install the saved-profile companion in the existing shop

The original Woo source owns its complete SF104 merchant plugin and setup.
The CoCart setup adds its original product-profile export companion:

~~~sh
node cocart.mjs plugin --toolkit "$TOOLKIT" \
  --out /absolute/private/new-profile-companion
~~~

This operation works without setup.json. It copies the exact original
profile-export.php as **starforge-cocart-profile.php**, plus the original
CoCart, managed and gateway guides. The returned file hashes identify the
complete four-file handover.

Install that companion alongside the selected WooCommerce, CoCart and SF104
plugins in the existing shop. Save the approved product mapping and use the
native **Download saved headless profile** control. The companion uses the
original Woo product-edit permission and nonce.

Keep the shop's original database, products, orders, customer records and
merchant configuration when upgrading its source. A runtime upgrade selects
a new installed source package and reattaches the original customer workspace
through the existing application lifecycle.

## Customer handover

A complete operating handover keeps these items together:

- The selected source package, its original commit/selection and archive hash.
- The installed READY runtime and pinned SDK identity.
- The shop/product mapping and complete saved profile or receiving input.
- The generated setup ZIP, original draft, installation guide and native
  Inspect/Prepare results.
- The current private customer directory and native merchant connection.
- Actual cart/order/checkout identities, original outcome and complete current
  receiving export.
- Named shop, application and support owners, the selected backup destination
  and the receiving operator's original reopen result.

Use the customer's actual records for support. A changed merchant mapping,
a transport move or a new runtime source produces its own native action and
retained edition. The next operator can reopen the delivered original case
and continue from its current state.

## Source and package composition

This selection adopts the completed original customer setup and native
reopen corrections from public source PR1980, merge
**348db17039ed48bbaf716d42bb89ae05312e79bd**. The retained native application
and managed integration originate in PR1618 and PR1708. The frontend uses
the original shared draft store and byte-preserving ZIP writer.

The native customer workflow has already operated the real selected
WordPress/Woo/CoCart checkout through order 13, complete receiving,
managed Stop/reopen and desktop/narrow browser use. The subsequent setup
workflow operated original-file import, saved draft reload, complete package
download, native Prepare/Status, transport-preserving repeat preparation and
receiving of the original returned customer. Source installation still
selects the actual target runtime and customer files described above.

The local setup host uses the maintained browser-assets contract. Its manifest
names each served original file; the same declaration drives the distribution
collector. Public source/example files remain in the source package, while
customer files enter only the operator's own setup and receiving package.

Copyright TokenJunkieLabs. Retain the original MIT and applicable third-party
source notices.
