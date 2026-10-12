# Complete gRPC receiving

Receiving starts with an **already-created original export**. Retain its export
ID and manifest SHA-256 before downloading. Reuse that same descriptor and
private directory when a transfer is interrupted.

The product calls the original merchant file transport and native manifest
readers. Files keep their original bytes and nested layout. Reopening a
received export works after the original server has closed.

## Receive through the installed Merchant Console

The product's returned `operatorUrl` and **Merchant operator** Applications
link open the original persistent Console. Select a named profile, inspect and
bind the current Host, then open **Customer files → gRPC / Customer workspace**.
Choose the original configured workspace and already-retained preparation,
revision, call, upgrade review or health observation.

Inspect the returned export manifest before **Receive complete files**.
The retained receiving selection binds the original workspace alias, export ID,
complete manifest SHA-256, profile and configured host fingerprint. The native
file transport uses the same export ID and original file selections. A paused
transfer resumes its byte checkpoint after reopen.

Completed receiving exposes individual original files and a complete tar.gz
archive. That archive has this native layout:

| Archive path | Original content |
| --- | --- |
| grpc/grpc-workspace-export.json | The complete original export manifest bytes |
| grpc/methods.json and grpc/openapi.json | Native generated customer definitions |
| grpc/client/ | All five original generated client package files |
| grpc/grpc-revision.json | Complete captured source and merchant plan for a revision export |
| grpc/grpc-attempt.json and, when present, grpc/grpc-stream.ndjson | Original call metadata and durable stream bytes |
| grpc/grpc-upgrade-*.json | The four original contract review/base/candidate/plan files |
| grpc/grpc-health.json | Complete selected frozen service-health history |

Each archive contains the members declared by its selected native export.
The checkpoint's internal flat transport names stay inside the downloader;
the delivered archive restores each original native `files[].path`.

After extracting a completed archive, the original product inspector accepts
its `grpc/` directory directly:

~~~sh
starforge grpc-product inspect-received --out /srv/private/received-archive/grpc \
  --export-id ORIGINAL_EXPORT_SHA256 --manifest-sha256 ORIGINAL_MANIFEST_SHA256
~~~

The inspector reads `grpc-workspace-export.json`, hashes every complete original
member and invokes the native health or upgrade reader when selected. It works
after the merchant and Console have closed.

The four saved customer/source, contract-upgrade, health and retained-call
procedures pause at the original manifests so receiving can complete before
continuation. Profile export/import preserves the exact retained manifest text
and its identity alongside the workflow and customer record. The receiving
Console uses its own private download directory for those original files.

The [Console customer guide](../../stellar-forge/mcp-merchant-operator/console/CUSTOMER_GRPC.md)
describes saved requests, snapshot paging, recipe review and complete archive
delivery.

## Create the original export

The browser's customer download uses its original preparation. Through the
agent, select the original export operation and save its returned descriptor:

~~~sh
starforge grpc-product tools --name merchant_grpc_export
starforge grpc-product call --dir /srv/private/grpc-product \
  --tool merchant_grpc_export --input /srv/private/customer-export-request.json
~~~

A customer request contains the actual original preparation UUID:

~~~json
{"kind":"customer","preparation":"ORIGINAL_PREPARATION_UUID"}
~~~

Other native export kinds select their actual revision or operation UUID:

| Export kind | Original selection | Complete files |
| --- | --- | --- |
| customer | Saved preparation and its source revision | All seven generated customer files |
| revision | Saved revision SHA | Full captured protobuf/descriptor closure, connection references and merchant plan |
| attempt | Native application operation UUID | Original attempt and retained response; streaming attempts also carry exact NDJSON |
| stream | Native streaming operation UUID | Original attempt metadata and complete durable NDJSON prefix |
| upgrade | Saved upgrade review UUID and review SHA | Review, original base, captured candidate and complete candidate plan |
| health | Original health UUID and selected frozen event prefix | Complete native health snapshot with source/protocol/operation identity and chained history |

Upgrade and health use their original dedicated export tools:
`merchant_grpc_upgrade_export` and `merchant_grpc_health_export`.
Use `grpc-product tools --name ...` for the exact native request fields.
Large source/review values remain complete exported files.

## Download and resume

~~~sh
starforge grpc-product receive --dir /srv/private/grpc-product \
  --export-id ORIGINAL_EXPORT_SHA256 \
  --manifest-sha256 ORIGINAL_MANIFEST_SHA256 \
  --out /srv/private/received-grpc
~~~

If interrupted, run the same command. The native transport retains
`transfer/` as its private partial/completed transfer directory and
materializes the original native paths beside it. Finishing a client directory
does not conflict with a repeated download.

~~~sh
starforge grpc-product inspect-received --out /srv/private/received-grpc \
  --export-id ORIGINAL_EXPORT_SHA256 --manifest-sha256 ORIGINAL_MANIFEST_SHA256
~~~

Offline inspection parses the original manifest, opens every declared file and
checks the full byte count and SHA-256. Stream files are hashed incrementally.
Health and upgrade additionally run their original domain readers against the
retained operation, revision and snapshot/review identity.

## Seven customer files

A complete customer export contains:

| Path | Purpose |
| --- | --- |
| methods.json | Exact retained methods and native request/response metadata |
| openapi.json | Original seller routes, schemas and full advertised payment options |
| client/seller-client.mjs | Original generated JavaScript client |
| client/seller-client.d.mts | Original generated TypeScript declarations |
| client/seller-openapi.json | Complete client-side OpenAPI source |
| client/package.json | Native generated client package metadata |
| client/README.md | Original generated client usage and payment-handler contract |

Use the original README in `client/` for constructing a typed request and
supplying the customer's selected transport/payment handler. The published
`./buyer` package export retains the original SF31 buyer implementation.
The client and its schemas contain the merchant's advertised HTTP route, not
the supplier's TLS secrets or private metadata values.

The same preparation can be staged into its original SF82 store. Preserve its
release ID, selection generation and actual running instance through the
customer's deployment and rollback workflow.

## Frozen health receiving while Watch is live

`merchant_grpc_health_export` freezes a specific complete event prefix.
Save the returned **export ID, manifest SHA and snapshot SHA** before receiving.
Continue that same export after a live Watch grows, stops or reconnects.
A newer observation uses a new explicit export and receiving directory.

The saved `grpc-health.json` contains original operation UUID, source
revision, protocol identity, request, deadline, durable ordered history and
summary. The native reader validates the full snapshot. Receiving it never
opens a gRPC channel or replays a health call.

For a direct original CLI export:

~~~sh
starforge grpc-product health export --dir /srv/private/grpc-product \
  --id ORIGINAL_HEALTH_UUID --out /srv/private/health-snapshot.json
starforge grpc-product health inspect --file /srv/private/health-snapshot.json \
  --section summary
~~~

Repeating the same export path retains its original frozen prefix.

## Complete contract upgrade receiving

The original upgrade export contains:

- grpc-upgrade-review.json
- grpc-upgrade-base.json
- grpc-upgrade-candidate.json
- grpc-upgrade-plan.json

The native review SHA binds the immutable review and its original
base/candidate/plan closure. An export also records the first selected
current/adoption observation. Repeated receiving retains those already accepted
bytes while preserving later observations in the original workspace's review
history.

~~~sh
starforge grpc-product upgrade export --dir /srv/private/grpc-product \
  --id ORIGINAL_REVIEW_UUID --review-sha ORIGINAL_REVIEW_SHA256 \
  --out /srv/private/received-upgrade
starforge grpc-product upgrade inspect --directory /srv/private/received-upgrade \
  --review-sha ORIGINAL_REVIEW_SHA256 --section summary
~~~

The product's generic `receive` path also downloads and validates a
merchant upgrade export, using its existing manifest and original native reader.

## Receive a source for continued authoring

A revision export includes its complete captured source and plan. Declare
the received `grpc-revision.json` as a native `files` handle with
`kind: "revision"` in the receiving product's original connection file.
Use `merchant_grpc_import` with that handle and the receiving workspace's
actual base revision, or use the native browser's source receive operation.

The receiving native compiler validates the full protobuf or descriptor closure
before creating the receiving revision. Preserve the source packet and original
supplier environment references. The receiving host supplies its own authorized
values through its private environment.

## Installed source and operational handover

Keep the source archive, its exact SHA-256, selected runtime profile/lock and
received customer export together. The original runtime transfer command carries
an equipped installation through its own manifest and recovery process.

The private native workspace and the product's `operator-console/` retain
operational history beyond a single customer/source export. Reopen that **same original workspace** when continuing
its operation. A customer export, revision export, upgrade review and health
snapshot each state their exact scope above; use their native receiving
operation and original IDs.

The standalone product and the public SCF engine share the same source-native
health receiving operation:
`SCF-GRPC-SERVICE-HEALTH-20261012-9B23`.
Its actual retained native result, installation source and later customer
receiving are joined to that original operation, so installation adoption does
not create a competing service-health run.
