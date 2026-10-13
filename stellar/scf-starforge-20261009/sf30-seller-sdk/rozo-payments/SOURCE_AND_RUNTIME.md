# Original source and optional native runtimes

## Application source

The ROZO product requires Node 24 or later and Python 3 for complete archive operations. Its own package has an empty dependencies object. The maintained distribution builder/profile preserve this engine-only requirement and emit the selected Node engine in the installed package; no dummy package is introduced.

INSTALLED_SOURCE.json uses:

~~~json
{
  "schema": "stellar-forge.rozo-installed-source.v1",
  "files": [
    {"path": "original/repository/path.mjs", "bytes": 1234, "sha256": "64_lowercase_hex_digits"}
  ]
}
~~~

Paths are relative to the selected original repository root. Every ordinary application member, provider, contribution, source-selection recipe, shared runtime dependency, dynamic worker and browser/data resource belongs to that selection. The manifest excludes itself.

inspectRozoSource(sourceRoot, sourceManifest, expectedSha256) verifies every full file and returns manifestSha256, selectionSha256, the full files array, fileCount and total bytes. The same inspector is used by Applications prepare/startup, the server and complete delivery. A review cannot silently use a different runtime tree.

## Full licensed publishers

publishers.json identifies these complete retained editions and capsule hashes:

| Publisher | Original commit | Files | Capsule SHA-256 |
| --- | --- | ---: | --- |
| RozoAI/rozo-checkout-skill | 51f086eb7661fe4d8137eac3cac37a775cbf14a3 | 135 | 99542818bb8cdb16b657140c238db40c492f06c335e00434a3f0463cd7328880 |
| RozoAI/intent-pay | 263f53c3a89975adcec7ce48b0a3d2bc33b89251 | 40 | e2363875fe802922cf483b3637ebac976712746bdac4e994f8b88f9f65d434c5 |
| RozoAI/rozo-intents-contracts | 9487ae0557507b09631bced1b6c58bb540eda0e8 | 136 | 00d9bde0a2853efdfde3d19b17f225732d38cfacf3dd13b72cda375d6f3691ec |

Each capsule is stellar-forge.rozo-publisher-capsule.v1, gzip+base64, with exact decoded JSON bytes/hash. The decoded source packet retains all selected original files and source provenance. Source identities and licenses remain original. Full source can be materialized using:

~~~sh
starforge rozo-payments publisher --publisher checkout --directory /private/publishers/checkout
starforge rozo-payments publisher --publisher intent-common --directory /private/publishers/common
starforge rozo-payments publisher --publisher contracts --directory /private/publishers/contracts
~~~

Existing destination members must match their original bytes. A changed original-source binding is rejected.

## Checkout 0.1.21

Original source: [RozoAI/rozo-checkout-skill](https://github.com/RozoAI/rozo-checkout-skill/tree/51f086eb7661fe4d8137eac3cac37a775cbf14a3).

The worker imports original scripts/src/quote.mjs, create-order.mjs, status.mjs and resume.mjs, plus their original ID/output/receipt helpers. Native operation state and full request/response captures stay under the original workspace. Child process lifetime follows its parent, signal and bounded deadline.

A production connection identifies:

~~~json
{
  "type": "checkout-mpp-0.1.21",
  "publisher": "RozoAI/rozo-checkout-skill",
  "sourceRoot": "/private/publishers/checkout",
  "mppBase": "https://apiserver.mpprouter.dev/v1/services/rozo-agent-api",
  "intentsBase": "https://intentapiv4.rozo.ai/functions/v1/payment-api"
}
~~~

The original source selection is verified before native work. Its entire original source is included in a complete delivery. Quote/create preserve the publisher's payability and fresh-quote checks. Read-only resume supplies the original payment ID and does not pass its confirm/send flag.

The native fixture reads actual original quote/create/payable/payment fixtures. Their base bytes/hashes remain retained; local expiry/timestamp derivations are separately recorded.

## Common SDK 0.1.43

Original package: [packages/pay-common](https://github.com/RozoAI/intent-pay/tree/263f53c3a89975adcec7ce48b0a3d2bc33b89251/packages/pay-common).

The retained package declares @rozoai/intent-common 0.1.43, TypeScript 5.5.2 for compilation, its original runtime dependencies and the viem peer requirement. Its original build script runs the package tests and tsc. Use that maintained package/toolchain and retained source; the complete repository root's aggregate build is unnecessary for this SDK profile.

Runtime dependencies declared by the selected source are @scure/base ^1.2.4, @solana/web3.js ^1.98.4, @stellar/stellar-sdk ^14.4.3 and zod ^3.25.76, with viem ^2.52.0 as peer. Preserve the actual resolved package versions and lock/build provenance alongside the compiled module.

The configured connection needs:

- type intent-common-0.1.43 and publisher RozoAI/intent-pay.
- sourceRoot for the verified original publisher selection.
- modulePath for the actual compiled packages/pay-common/dist/index.js, with moduleSha256.
- runtimeRoot and runtimeFiles containing every ordinary compiled/dependency file as {path,bytes,sha256}.
- baseUrl, normally https://intentapiv4.rozo.ai/functions/v1; the original SDK appends its payment routes.
- apiTokenEnv identifying an existing host environment variable, or an explicit usePublishedToken decision when the original publisher's documented public token is the intended scope.

The complete runtime selection must contain the module. Runtime paths may move on receiving while file identities remain bound. Native use verifies every selected runtime file and module hash. Both native CommonJS and ESM export shapes are supported through their actual module exports. The original SDK setApiConfig and getFee/createPayment/getPayment/updatePaymentPayInTxHash functions run unchanged in an isolated child.

A missing compiled module or dependency selection is an actionable missing runtime, not a reason to replace the SDK with an approximate HTTP implementation.

## Stellar original-source observation

Contract sources are retained under:

| Profile | Original source | Meaning |
| --- | --- | --- |
| rozo-payment-v1 | v1/stellar/payment/src/lib.rs | Original payment transfer and separate flush |
| rozo-forwarder-v2 | v2/stellar/forwarder/src/lib.rs | Forward to proxy, plus memo/proxy configuration history |
| rozo-intent-bridge-v2 | v2/stellar/intent_bridge/src/lib.rs | Escrow created, filled to relayer, or refunded |

[Original contract source](https://github.com/RozoAI/rozo-intents-contracts/tree/9487ae0557507b09631bced1b6c58bb540eda0e8).

The profile explicitly selects connection, actual network passphrase, deployed contract ID and first ledger. The RPC connection uses type stellar-rpc and its actual rpcUrl; horizonUrl is optional.

capture.stellar takes {id,profileId,startLedger,endLedger?,limit?,transactions?}. It retains original RPC requests/responses and raw event/transaction XDR. Contract/network and transaction identities are checked. Failed contract-call observations cannot alter effective configuration.

Optional decoded evidence uses an actual installed @stellar/stellar-sdk **15 or later**, separate from Common's original SDK dependency. The connection identifies decoderModule, decoderModuleSha256, decoderPackageJson, decoderRuntimeRoot and complete decoderRuntimeFiles. The original package/module and full runtime are verified before decoding. Without a selected decoder, raw source remains available; it is not reported as decoded proof.

A forwarder event retains sender/proxy/token/amount/destination/memo and the original event timestamp. It proves its original proxy transfer meaning. The intent bridge's created amount is the actual source balance delta; filled releases escrow to the relayer. Destination payment and merchant fulfilment require their own evidence.

## Portable runtime inventory

Full receiving requires ordinary files within the selected runtime root. Retain all resolved dependencies, package metadata, actual entry points and their file hashes. Materialize symlink-based package layouts into an owned ordinary-file runtime only through the original installation/export process, preserving original contents and provenance; complete receiving rejects symlinks and paths outside the declared root.

Runtime configuration retains private host paths before handover and generates relocated paths for receiving. Environment-variable names are carried; credential values stay with the receiving host's existing credential owner.

## Evidence and release status

A source identity proves the selected bytes. Native completion separately records what actually executed and against which original inputs. The local exercise proves the real product and original Checkout implementation using labelled development inputs. Production merchant acceptance, Common SDK execution, deployed Stellar evidence and any external funds movement each require their own observed provider result; none is inferred from a source build.
