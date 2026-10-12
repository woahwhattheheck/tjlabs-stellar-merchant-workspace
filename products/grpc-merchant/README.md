# gRPC merchant product

Open an existing gRPC service as a reviewed Stellar merchant, keeping its original
protobuf contract, typed requests, calls, merchant editions and customer files.

The product combines the original **gRPC authoring browser** and its
**authenticated merchant agent** in one owned session. It includes native
reflection v1/v1alpha, unary and server-streaming methods, client and bidirectional
message sequences, saved contract upgrade review, and standard Check/List/Watch
service-health observations.

The command is `starforge grpc-product`. The standalone executable is
`grpc-merchant`. In the Runtime workspace, select **Applications → gRPC merchant
product**. The original **gRPC merchant authoring** entry also remains available.

## Start an installed product

Use the [complete install guide](../../stellar/scf-starforge-20261009/distribution/selections/GRPC_MERCHANT.md).
Select the original native, grpc, schema, openapi, mcp and operator runtime
features from that archive.

~~~sh
starforge grpc-product init --dir /srv/private/grpc-product \
  --workspace /srv/private/original-grpc-workspace --alias service --name "Service merchant"
starforge grpc-product review --dir /srv/private/grpc-product
starforge grpc-product open --dir /srv/private/grpc-product --port 0
~~~

The parent directories must already exist and be private. Omit `--workspace`
to create the product's native workspace beneath its private directory. Reusing a
saved workspace preserves its contract revisions, original request IDs, attempts,
prepared customer files, release history, upgrade reviews and health journals.

Provide the selected upstream credentials and `MCP_ACCESS_TOKEN` through the
original process environment. Startup returns the original private browser URL,
agent endpoint and stable `connection.json` file. The URL capability belongs
to this native session; the client rereads the file after a later reopen.

The [operating guide](OPERATING.md) covers the full source, merchant and customer
workflow. The [receiving guide](RECEIVING.md) covers all seven generated customer
files, contract/review transfers, exact stream bytes and frozen health history.
The [typed client](client.d.mts) calls the original 47 gRPC tools.

## Useful commands

~~~sh
starforge grpc-product status --dir /srv/private/grpc-product
starforge grpc-product tools
starforge grpc-product call --dir /srv/private/grpc-product \
  --tool merchant_grpc_status
starforge grpc-product receive --dir /srv/private/grpc-product \
  --export-id ORIGINAL_EXPORT_SHA256 --out /srv/private/received-grpc
starforge grpc-product inspect-received --out /srv/private/received-grpc
~~~

Save native operation UUIDs and the returned immutable export IDs before
continuing. Stop drains the original merchant agent and native workspace.
A later Open keeps the same authoring and receiving state.
