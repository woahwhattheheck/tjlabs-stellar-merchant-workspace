# Install the gRPC merchant product

This selected product delivers the maintained gRPC source engine, native
authoring browser, merchant agent, persistent Merchant Console, original seller
release lifecycle, contract upgrades, durable service health and complete
customer receiving.

Its recipe is `grpc-merchant.json`, schema
`stellar-forge.distribution-source-selection.v1`. It selects complete
original contributions and keeps the existing distribution builder, installer,
source manifest, runtime lock and Applications lifecycle. The selected original
contributions include `merchant-console` together with the nine gRPC product
contributions. The complete `stellar-forge/mcp-merchant-operator/console`
component carries the customer page, saved recipes, pure receiving records,
archive implementation, styles and full guide. Its maintained launch source
binds all 39 Console files, alongside the original gRPC managed source.

## Build the selected source

From the existing source repository, use a full committed SHA and one private
release directory:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --ref FULL_ORIGINAL_COMMIT --selection grpc-merchant \
  --out /absolute/grpc-release --offline
~~~

Use `--offline` after the required original Git objects are present. The
result contains the archive path, exact SHA-256, source commit, recipe identity,
source bytes and installed bytes. Retain those returned values with the
customer's release. An interrupted build continues in that original output:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace \
  --out /absolute/grpc-release --resume --offline
~~~

## Receive the original runtime

The complete edition uses **native + grpc + schema + openapi + mcp + operator**.
The archive's own gRPC package manifest supplies its selected protobuf runtime;
the source profiles supply the original payment, schema and MCP dependencies.

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /srv/private/grpc-runtime --archive /absolute/grpc-release/ORIGINAL.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 --native --feature grpc \
  --feature schema --feature openapi --feature mcp --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /srv/private/grpc-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /srv/private/grpc-runtime --load --source

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /srv/private/grpc-runtime -- grpc-product --help
~~~

Use the existing npm cache and `--offline` when the selected lock is already
available. A complete retained dependency tree can be received with the original
`install --adopt-existing` path; its real versions, native probes and lock must
satisfy this selected archive. Runtime transfer and cold receiving use the
original [runtime transfer guide](../RUNTIME_TRANSFER.md).

The installer returns the exact `sourceRoot` and `dependencyRoot`.
An installed command can be launched through `runtime-install run --dir ... --`
as shown above. The generated package also exposes `starforge` and
`grpc-merchant` executables and explicit product/client exports.

## Select one existing workspace

~~~sh
starforge grpc-product init --dir /srv/private/service-product \
  --workspace /srv/private/original-grpc-workspace --alias service \
  --name "Service merchant"
starforge grpc-product review --dir /srv/private/service-product
starforge grpc-product open --dir /srv/private/service-product --port 0
~~~

Set the existing upstream TLS/metadata environment references and the original
MCP token in the process environment. For OAuth, use the original
`MCP_OAUTH_CONFIG` host file. The profile retains names and paths; credential
values stay with the native host configuration.

Register the READY runtime in the Runtime workspace. In **Applications**, choose
**gRPC merchant product**, select the initialized private product directory and
its private environment file, then **Review → Save → Start → Open**. Review
binds the product inputs, native directory inode, current contract revision,
original managed source, complete Console source, its selected private store,
agent port and authorization configuration.

The product opens one native gRPC owner and connects its merchant provider to
that owner's private URL. The same merchant listener owns the persistent
Console at `operator-console/` beneath the private product. **Merchant operator**
opens its returned `operatorUrl`; `connection.json` also retains its directory,
workspace UUID and reviewed source SHA. **Stop** drains the Console and its
receiving, both original listeners, release work and native channels. **Start** opens the same state and refreshes its connection
file. The original gRPC authoring-only application remains registered for
operators who already manage its agent separately.

## Work and hand over

In Merchant operator, select a named profile and bind the configured Host.
**Customer files → gRPC / Customer workspace** loads the original configured
workspace and its retained preparations, sources, calls, reviews and health
observations. Saved Workflow Recipes carry complete customer/source delivery,
contract-upgrade delivery, a selected frozen health prefix and retained-call
receiving. Review the original definitions and saved inputs, then complete each
manifest pause through the same native customer downloader.

The resulting tar.gz keeps `grpc/grpc-workspace-export.json` and every native
member path, including the complete `grpc/client/` package. Original individual
files, profile export, saved request recovery and the CLI's offline inspector
use that same manifest and full source bytes. The installed [Console customer
guide](../../../../stellar-forge/mcp-merchant-operator/console/CUSTOMER_GRPC.md)
provides the full procedure and receiving flow.

Use the installed [operating guide](../../../../products/grpc-merchant/OPERATING.md)
for source capture/reflection, message authoring, merchant preparation, release
control, upgrade review and standard health operations. Use the
[receiving guide](../../../../products/grpc-merchant/RECEIVING.md) to retain the
complete original customer files, source revisions, native attempts, NDJSON
streams, four-file upgrade review and frozen health snapshot.

A product runtime upgrade uses a **new runtime directory**, preserving this
private product/native workspace. Select the new reviewed runtime through the
same Applications flow. Open its original receiving directory with the retained
manifest/export ID; its saved files and original operation histories remain
authoritative across installation changes.
