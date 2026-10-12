# Native MPP customer and response receiving

The product uses two existing receivers. The native customer receiver materializes a complete twelve-file contract/client package. The retained MCP downloader transfers an original SHA-pinned bundle or paid response from its existing export record.

## 1. Receive a customer package from the live product

Inspect the native merchant catalog and select its actual profile ID. Then receive the complete original package:

```sh
starforge mpp-workspace catalog --dir /absolute/private/mpp-product

starforge mpp-workspace customer-export --dir /absolute/private/mpp-product \
  --profile-id ORIGINAL_MERCHANT_PROFILE_SHA256 \
  --out /absolute/private/customer-handoff
```

The native console returns the package for that exact merchant profile. The original receiver checks the complete bundle and regenerates every companion file from the same retained contract before writing it. An existing destination must belong to that same original receiving operation.

The files are:

| File | Purpose |
|---|---|
| `merchant-contract.json` | Original offer/economic/request contract |
| `merchant-openapi.json` | Original routes and dynamic MPP challenge documentation |
| `merchant-client.mjs` | Generated Node customer wrapper over the original native buyer |
| `merchant-client.d.mts` | Generated TypeScript customer interface with exact offer IDs |
| `merchant-client-bridge.mjs` | Original retained configuration/purchase bridge for Python |
| `merchant_client.py` | Generated Python customer wrapper |
| `merchant_client.pyi` | Generated Python type interface |
| `customer.example.json` | Actual contract’s configuration shape for operator completion |
| `package.json` | Original customer companion package metadata |
| `examples/node.mjs` | Original Node customer example |
| `examples/python.py` | Original Python customer example |
| `README.md` | Contract-specific customer operation and recovery instructions |
The authoritative file list comes from the native bundle/receiving manifest. Each file has its original byte count and SHA-256. Keep the complete generated package together.

## 2. Receive a retained bundle file

A merchant can hand over the original bundle JSON through its existing delivery channel. Save those exact bytes and run:

```sh
starforge mpp-workspace customer-receive \
  --file /absolute/private/mpp-package.json \
  --out /absolute/private/customer-handoff
```

If the process stopped while receiving, continue the same input and destination:

```sh
starforge mpp-workspace customer-receive \
  --file /absolute/private/mpp-package.json \
  --out /absolute/private/customer-handoff --resume
```

Once its receiving manifest is retained, the original generator can continue directly:

```sh
starforge mpp-workspace customer-inspect --out /absolute/private/customer-handoff
starforge mpp-workspace customer-resume --out /absolute/private/customer-handoff
```

The receiver keeps matching files and writes missing files. A different contract/bundle or changed existing file produces an explicit original receiving conflict. The original files remain available for inspection.

Open the received README and complete the customer configuration with the actual payer, signing-key environment, original governor and private workspace/runtime paths. Use its original Node/Python client. The generated client retains the contract, selected offer, exact request and purchase ID; execution and recovery call the existing buyer and accounting implementation.

## 3. Receive through the merchant agent

The original MPP agent exposes `merchant_mpp_catalog` and `merchant_mpp_handoff_file` to inspect the current profile and first file digest. Retain an export using a stable export ID:

```json
{
  "console": "native",
  "exportId": "customer-handoff-20261012",
  "kind": "package",
  "profileId": "ORIGINAL_MERCHANT_PROFILE_SHA256",
  "expectedSha256": "ORIGINAL_PACKAGE_FILE_SHA256"
}
```

Submit that object to `merchant_mpp_export`. The original service captures the complete original package JSON and a transport manifest. Reusing that export ID reopens its same bound console/workspace/profile/file selection.

Download it with the maintained receiver:

```sh
starforge mpp-workspace agent-download --dir /absolute/private/mpp-product \
  --export-id customer-handoff-20261012 \
  --out /absolute/private/customer-transfer \
  --manifest-sha256 ORIGINAL_MANIFEST_SHA256
```

The downloader retains the original export ID, endpoint, manifest and file digests. It rehashes a retained partial prefix before continuing. Each file read stays bound to the same original digest and offset.

The transferred package is a single complete bundle JSON. Run `customer-receive` on that file to materialize the native nested examples and all twelve client files. Keep the transport directory separate from the native customer receiving directory.

The exact payload filename is recorded in the returned manifest. Select that original name rather than renaming or flattening the generated paths.

## 4. Receive an original paid response

Inspect the original purchase. A completed resource is tied to its original native receipt, transaction, offer, contract and response digest. Download that retained response:

```sh
starforge mpp-workspace response --dir /absolute/private/mpp-product \
  --id accounts-2026-10-12-001 \
  --out /absolute/private/received-period.json \
  --sha256 ORIGINAL_RESPONSE_SHA256
```

The client compares the current original preview, full response length and exact bytes. It publishes the complete private file atomically. An identical existing file is retained. A sidecar records the original workspace identity, purchase, receipt, transaction, offer, contract and observed accounting outcome. A later accounting observation receives a separate sidecar while the immutable response bytes remain the same.

The original response can also be retained as an MCP export:

```json
{
  "console": "native",
  "exportId": "response-accounts-20261012-001",
  "kind": "response",
  "purchaseId": "accounts-2026-10-12-001",
  "expectedSha256": "ORIGINAL_RESPONSE_SHA256"
}
```

Call `merchant_mpp_export`, retain its original manifest SHA and use `agent-download`. Receiving the retained bytes performs no new purchase.

## 5. Continue the original accounting and application

Resource delivery and finality have their own retained states. If the response is ready and finality is still pending, run `finalize` on the original purchase ID. A response-loss recovery uses `resume` and the saved original credential. An incomplete preparation uses `retry-prepare`.

Close and reopen the managed product using its same private product/native workspace and original environment selections. Original purchase IDs survive a console restart; transient job IDs may be replaced by `JOB_NOT_RETAINED` plus the saved purchase.

For continued operation on another host, retain the complete native workspace, product configuration, customer file versions, original governor records and source resource files together with the corresponding installed source/runtime. A customer-facing generated bundle contains the original client contract and examples; the merchant’s private workspace remains with its operator.
