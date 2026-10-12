# CoCart merchant and customer receiving

This selected Starforge package carries the complete CoCart customer setup,
native Woo checkout, merchant operations, Applications lifecycle, merchant MCP
connection and full customer receiving workflow.

## Open customer setup

From the installed package:

~~~sh
starforge cocart-setup --port 8787
~~~

From a prepared retained runtime:

~~~sh
starforge runtime-install run \
  --dir /absolute/private/runtimes/cocart -- cocart-setup --port 8787
~~~

Open the exact local URL printed by the listener. Import the original saved
Woo product profile or complete CoCart receiving JSON, set the customer's
actual private paths, review the saved product and exact terms, and download
the complete setup ZIP. Keep the same local hostname/port for saved browser
drafts; downloaded draft JSON moves the complete source to another browser.

The ZIP contains original input bytes, setup.json, cocart.mjs and INSTALL.md.
From the extracted directory, select the complete checkout or installed
package root:

~~~sh
TOOLKIT=/absolute/path/to/checkout-or-installed-package
node cocart.mjs inspect --toolkit "$TOOLKIT"
node cocart.mjs prepare --toolkit "$TOOLKIT"
node cocart.mjs status --toolkit "$TOOLKIT"
node cocart.mjs open --toolkit "$TOOLKIT"
~~~

The original runner invokes the maintained native validators and managed
workspace. It retains the actual source/SDK identity, saved customer history
and original connection. Repeat receiving keeps subsequent native changes;
repeat profile preparation retains the original creation transport and later
recorded rebinds.

## Runtime selection

Use Linux, Node.js 22.16 or later, Python 3.11 or later and util-linux flock.
The CoCart component pins @cocartheadless/sdk 1.2.1 and the original CoCart
Community 4.9.7/v2 source contract.

Prepare the original runtime with the archive and SHA returned by the
source builder:

~~~sh
starforge runtime-install prepare \
  --dir /absolute/private/runtimes/cocart \
  --archive /absolute/private/downloads/cocart-merchant.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 \
  --native \
  --feature schema --feature openapi --feature mcp --feature cocart \
  --operator

starforge runtime-install install --dir /absolute/private/runtimes/cocart
starforge runtime-install inspect --dir /absolute/private/runtimes/cocart \
  --load --source
~~~

The recipe is **cocart-merchant**. Its original builder invocation is:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/path/to/checkout --ref ORIGINAL_COMMIT \
  --selection cocart-merchant --out /absolute/private/packages/cocart
~~~

Each original output keeps its selected commit and recipe through Resume.

## Operate and hand over the same customer

Attach the READY runtime in the original Runtime workspace and use
**Applications → CoCart** with the prepared workspaceDirectory, optional
sdkModule, connectionFile and original workspaceAlias. Review/Save,
Review start, Start, Open and Stop use the existing application manager.

The native customer retains real catalog/cart requests, exact totals, mapped
checkout eligibility, Woo checkout and its original handoff. Seller,
refund and purchased-file work use the existing Woo/SF98 workflows in this
same selection. The original native profile currently selects one mapped
simple virtual product at quantity one.

Export the complete customer from its original setup:

~~~sh
node cocart.mjs export --toolkit "$TOOLKIT" \
  --out /absolute/private/delivery/CoCart_Receiving_Workspace.json
~~~

Import that complete JSON in the setup page for the receiving operator,
prepare their actual private directory and reopen the same customer.
The original cart/order history and all referenced objects travel together.

For an existing shop that needs the saved-profile control:

~~~sh
node cocart.mjs plugin --toolkit "$TOOLKIT" \
  --out /absolute/private/new-profile-companion
~~~

Install its original starforge-cocart-profile.php alongside the shop's
selected WooCommerce, CoCart and SF104 plugins, save the native product
mapping and download the product's saved headless profile.

## Complete guides

The installed archive retains these files under source/:

- **products/cocart/OPERATING.md** — installation, original-file intake,
  customer operation, Applications, MCP, complete receiving and support.
- **stellar-forge/developer-site/COCART.md** — setup packet and native runner.
- **stellar/scf-starforge-20261009/sf104-woocommerce-merchant-bridge/cocart/MANAGED.md**
  — original connection, source binding and managed lifecycle.
- **stellar/scf-starforge-20261009/sf104-woocommerce-merchant-bridge/cocart/README.md**
  — native profile, cart, checkout and receiving contracts.
- **stellar/scf-starforge-20261009/sf104-woocommerce-merchant-bridge/GATEWAY.md**
  and **OPERATIONS.md** — existing shop, order and merchant operations.

Inspect the original declarations with:

~~~sh
starforge registrations --source cocart
starforge registrations --source merchant-provider-cocart-workspaces
~~~

Copyright TokenJunkieLabs. Original source and third-party notices are retained.
