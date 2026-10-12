# Grist merchant

This product turns an explicitly selected Grist document/table into a reviewed data product. It retains the original typed API observations, validates a public field projection, saves immutable source versions, and publishes through the existing Stellar Forge dataset publisher. The same saved work opens in a browser, through merchant MCP, or as a managed Application. Its original SF82 release controls provide merchant staging, activation, restart, rollback, customer configuration and client exports.

A Grist source is identified by its exact site, original document ID or URL ID, native table, membership filter, source order and selected field/type union. It is not identified by a copied spreadsheet title or a saved UI view name. Private account credentials remain with the merchant host.

The capture reads the complete typed records response twice. It retains both full response bodies, the visible column metadata, native document metadata, and the document history head before and after. The two bodies, schema and head must agree. This is a non-atomic observation of the rows visible to the declared account. It does not claim an independent database count, an atomic database snapshot, historical completeness, or original database-cell byte equivalence.

## Complete operator path

| Step | Product action | Retained result |
| --- | --- | --- |
| Connect | Declare an existing read-token environment reference, or explicitly allow anonymous access to a public document. | Private connection selection and original document identity. |
| Discover | Inspect actual document/table metadata through the original reader. | Field IDs, complete Grist type names, visible schema and a request UUID. |
| Capture | Select actual fields and native order ending in row ID; read the original typed API. | Both complete record responses, surrounding metadata/history, exact bytes and SHA256. |
| Author | Choose public aliases, scalar or typed encodings, and null/empty handling. | Draft revision with the fixed original capture binding. |
| Review | Validate every captured row and review capture time, source/emitted rows and column rules. | Preview and reviewer-bound immutable source version. |
| Publish | Select the final public columns and extraction order in the existing publisher. | Original numeric plan, candidate, review, publication and versioned dataset. |
| Deploy | Review the exact published edition, prepare private staging, operate the original SF82 store. | Original release identity, generation, instance, commands and customer exports. |
| Reopen | Close the owner, then reopen the same browser, CLI, MCP or managed Application. | Original requests, saved source, publisher and release history. |

Source authoring does not apply an additional row filter. Every retained row is validated for each configured query. The publisher selects the final public column subset and its extraction order. The source API's native filter, the preview order and the publisher order are separate recorded choices.

## Guides

- [WORKSPACE.md](WORKSPACE.md): browser, CLI, request recovery, private source packets, MCP, managed Applications and release operation.
- [PROVIDER_INPUT.md](PROVIDER_INPUT.md): real Grist access, complete capture, typed-cell rules, anonymous public sample acquisition and packet custody.
- [PROVENANCE.md](PROVENANCE.md): original code lineage and the pinned primary Grist API source used for the implementation.
- The original [publisher source and operating entry](../postgres/publisher/) and [SF82 source](../../sf82-seller-pilot/) define the maintained publication and release engines. Grist supplies an additive driver and operator.

The source entry is this directory. The distribution adds the following commands and providers without changing the shared loaders:

| Installed entry | Source |
| --- | --- |
| grist-source | cli.mjs |
| grist-publisher | publisher/cli.mjs |
| grist-deployment | deployment-cli.mjs |
| grist-workspace | workspace/cli.mjs |
| Applications: grist-authoring | workspace/application-provider.mjs |
| Merchant MCP provider: grist-workspaces | workspace/merchant-provider.mjs |
| Source selection: grist-merchant | ../../distribution/selections/grist-merchant.json |

The two contributions are grist and grist-authoring. The selected recipe also includes the existing publisher and generic merchant-tool providers. The original generic publisher factory does not acquire a new independent Grist workspace: Grist MCP borrows the authoring-owned publisher through its original lifetime.

## Build and install the selected product

Use Node.js 24, Git, and the original distribution builder. A selected source archive and an installed native runtime are distinct artifacts. Preserve the exact commit, build directory and runtime installation receipt.

~~~sh
GRIST_REPO=/absolute/path/to/tjlabs-stellar-merchant-workspace
GRIST_DIST="$GRIST_REPO/stellar/scf-starforge-20261009/distribution"
GRIST_COMMIT="$(git -C "$GRIST_REPO" rev-parse HEAD)"
GRIST_RELEASE=/absolute/private/grist-release

node "$GRIST_DIST/build.mjs" \
  --repo "$GRIST_REPO" --ref "$GRIST_COMMIT" \
  --selection grist-merchant --out "$GRIST_RELEASE"
~~~

The original build writes distribution.json with the actual archive path and SHA256. For an interrupted build, use the same command and original --resume; do not choose a different source commit in an existing build directory.

Use the archive and digest from that receipt. The complete browser/MCP/Applications and SF82 path uses the original native and MCP feature groups:

~~~sh
node "$GRIST_DIST/runtime-install-cli.mjs" prepare \
  --dir "$GRIST_RUNTIME" \
  --archive "$GRIST_ARCHIVE" --sha256 "$GRIST_ARCHIVE_SHA256" \
  --native --feature mcp --operator --pins "$GRIST_PINS_FILE"

node "$GRIST_DIST/runtime-install-cli.mjs" install --dir "$GRIST_RUNTIME"
node "$GRIST_DIST/runtime-install-cli.mjs" inspect \
  --dir "$GRIST_RUNTIME" --load --source
~~~

Set those variables to the intended private runtime, actual archive and digest, and the existing selected pins file. The reviewed original native dependency selection is:

~~~json
{
  "@x402/core": "2.28.0",
  "@x402/stellar": "2.28.0",
  "@x402/extensions": "2.28.0",
  "@stellar/stellar-sdk": "16.3.0"
}
~~~

The mcp feature also resolves its original declared MCP dependencies. The installer supplies them at the common runtime ancestry used by the original ESM modules. A separate node_modules under a sibling buyer directory does not satisfy imports from other components.

For an existing prepared runtime, invoke runtime-install-cli.mjs resume --dir SAME_RUNTIME. Reopen its original profile and receipt; do not create another dependency tree or manually replace its lock.

The installed source and whole source manifest are:

~~~sh
GRIST_SOURCE="$GRIST_RUNTIME/package/source/stellar/scf-starforge-20261009/sf30-seller-sdk/grist"
GRIST_FORGE="$GRIST_RUNTIME/package/source/stellar/scf-starforge-20261009/distribution/cli.mjs"

node "$GRIST_FORGE" grist-workspace --help
~~~

The original package/manifest.json binds the complete selected source. Managed Applications also verifies the exact Grist workspace source and immutable original workspace identity before announcing a live URL.

## Start with a complete retained source

If an original capture-backed source already exists, no provider access is needed to author it:

~~~sh
install -d -m 700 /absolute/private/grist
GRIST_WORK=/absolute/private/grist/catalog

node "$GRIST_SOURCE/workspace/cli.mjs" init --directory "$GRIST_WORK"
node "$GRIST_SOURCE/workspace/cli.mjs" import-source \
  --directory "$GRIST_WORK" \
  --source /absolute/private/original-grist/source.json \
  --title "Original Grist observation" --expected-revision 0 \
  --request 33333333-3333-4333-8333-333333333333
node "$GRIST_SOURCE/workspace/cli.mjs" serve --directory "$GRIST_WORK" --port 0
~~~

Use the returned current request and draft revision when continuing. The literal UUID illustrates one fresh operation; do not reuse an unrelated example UUID in an existing workspace. The current process prints the private local browser URL.

In the browser, inspect the saved fields, save the draft, validate every row, enter the reviewer/change note and freeze the version. Then use Open original publisher. The publisher browser and the Grist operator share the same publisher and native lease.

For live setup, use WORKSPACE.md and PROVIDER_INPUT.md. The official public Task Management sample is a candidate input, not an already executed result. Its actual returned table IDs, column types, document heads, row count and capture hashes must be retained by the real reader before any receiving claim.

## Data and authority boundaries

Private capture packets include every visible field in the original record response, including fields that the published projection omits. They also include native metadata and the exact source selection. They are private merchant/operator recovery material. They omit credential values, token environment references and arbitrary host files.

A source version freezes the capture and its explicit projection. An old publisher plan keeps its original source and capture even after the current authoring selection changes. Numeric plan IDs and plan-directory UUIDs are separate original identities.

The five-file SF82 preparation is private merchant staging. Its original binding includes the actual absolute dataset path. Deliver customer material through the original release/client exporter, which supplies the public projected dataset, terms and client configuration. Do not relabel the private raw capture packet or staging binding as a public customer package.

HTTP 402 and generated buyer configuration establish payment-required terms and request compatibility. They do not demonstrate a wallet signature, settled transfer or paid delivery. This product does not automatically create accounts or submit a payment.

## Implemented source and execution status

The source contains the real Grist REST reader, exact typed-value projection, complete capture/packet recovery, original publisher/SF82 driver, full browser/CLI/MCP/Application operator and selected install recipe. Source publication does not establish successful access to a particular Grist document or a completed installed receiving run. Report those only from the actual native capture and receiving receipts, preserving the original operation and private workspace.
