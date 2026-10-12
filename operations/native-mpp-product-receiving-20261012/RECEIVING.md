# Continue the original MPP product receiving operation

This operation attaches the already operated native customer workspace to the
standalone MPP product. It selects the exact merchant profile retained by the
original merchant workspace and the existing customer-private.json configuration.
The private console publishes that original merchant contract; the agent reviews
the same customer configuration and receives all twelve original generated files.
The managed product then closes and reopens with the same workspace identity,
retained customer review, export and purchase files.

## Original owner and inputs

The existing SCF-MPP-APPLICATIONS-NATIVE-20261012-EB459 owner retains the native
runtime, TLS/CONNECT lifetime, original SDK execution and Applications receiving.
Append this product operation after that owner's active console and merchant
have closed. Select the full standalone product source containing this driver and
its recorded source files. The driver uses Node's built-in modules and the
already selected native runtime.

The original Product4 source defines these paths below its run directory:

| Input | Original path |
|---|---|
| Merchant workspace | merchant/ |
| Customer workspace | customer/ |
| Native SDK dependencies | runtime/ |
| Original customer configuration | customer-private.json |
| Governor policy and ledger | original-policy.json and original-ledger.json |

Save one private receiving-input.json with the actual absolute paths:

~~~json
{
  "schema": "stellar-forge.mpp-product-receiving-input.v1",
  "sourceDirectory": "/srv/merchant-source",
  "operationDirectory": "/srv/private/mpp-product-receiving",
  "productDirectory": "/srv/private/mpp-product",
  "merchantWorkspace": "/srv/private/original-mpp-run/merchant",
  "customerWorkspace": "/srv/private/original-mpp-run/customer",
  "dependencyRoot": "/srv/private/original-mpp-run/runtime",
  "customerConfiguration": "/srv/private/original-mpp-run/customer-private.json",
  "name": "Native MPP merchant and customer"
}
~~~

Replace the example paths with the original receiver's actual directories. The
product and operation parent directories must already exist and be private.
The selected customer configuration remains the original complete object,
including its workspace, policy, ledger, public signer identity, runtime and
transport settings.

~~~sh
node --max-old-space-size=128 \
  operations/native-mpp-product-receiving-20261012/execute.mjs \
  /absolute/private/receiving-input.json
~~~

The full original source and dependencies stay under the selected owner's
custody. A retained public transport can finish its original native lifetime;
this continuation obtains its handoffs and reviews through the local product
console.

## Receiving record

The driver retains result.json under operationDirectory before opening a product.
It binds the input bytes, original source Git objects, both original workspace
creation identities, merchant profile, customer configuration and native runtime.
Repeating the same input reuses its setup, customer selector, review and export
IDs. A completed rerun reopens and checks the same two received customer packages.

Its actual phase results include:

- Retained setup and original customer workspace identity.
- Managed browser/agent opening and authenticated identity.
- Complete local twelve-file receiving and original receiving resume.
- The original merchant MCP customer review, selected profile and native request preview.
- Original retained MCP export, manifest, downloaded payload and twelve-file receiving.
- Managed close/reopen, recovered review/export, and preserved original purchase files.

The console and agent use the original running product owner. All file downloads
use their original manifests, exact bytes and trusted native customer generator.
The output record keeps loopback origins and public source identities; the
private console authentication fragment remains in the product's session file.

If a native call returns an error, the same operation retains its phase record
and source selection. Reconcile that retained product before repeating this
input. The original receiving owner publishes the resulting result.json and its
actual source pin into the existing MPP and standalone product threads.
