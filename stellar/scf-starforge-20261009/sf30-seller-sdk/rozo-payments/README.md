# ROZO merchant payments workspace

A complete local operator for merchant orders, original ROZO Checkout, payment catch-up, settlement review and customer receiving. It runs inside the maintained Starforge Applications lifecycle or through the same standalone CLI.

The workspace keeps original merchant app/order IDs, ROZO payment IDs, Checkout invoice IDs, source transactions, payout transactions and fulfilment records separate. Every provider read retains the complete returned bytes and capture metadata. Staff corrections are immutable decisions against an exact observed source. Reports and full deliveries carry the original records that support their conclusions.

## Start with the installed application

Select **ROZO payments** in Applications, choose the original workspace and private connection file, then use Review/Save and Start/Open. Applications verifies the selected source and the workspace/origin identities before opening the authenticated local operator. See [APPLICATIONS.md](./APPLICATIONS.md) for the maintained lifecycle, private environment and selected installation.

The same product starts directly:

~~~sh
starforge rozo-payments init --workspace /private/merchant/rozo
starforge rozo-payments serve \
  --workspace /private/merchant/rozo \
  --config /private/merchant/rozo-connections.json \
  --host 127.0.0.1 --port 0
~~~

The server prints a JSON startup receipt with the actual local URL, workspace ID, origin ID and session token. Open its URL on the same trusted host. Keep the receipt private: it contains the session credential. The server binds loopback and requires the session header for operator APIs. An existing gateway can forward the signed provider callback while preserving the raw body and original timestamp/signature headers.

Node **24 or later** supplies the SQLite runtime; Python 3 standard library supplies complete archive packing/receiving. The application itself has no third-party runtime dependencies. Optional Common SDK and Stellar decoding use explicitly selected original installed runtimes. Original Checkout runs from its retained publisher source.

## The seven staff views

| View | Work performed |
| --- | --- |
| Overview | Source, original provider/workspace identity, operational counts and unresolved work |
| Payments | Full paginated register, original transaction lookup, source/payout/fulfilment detail, raw evidence and reviewed corrections |
| Orders | Original order intake with explicit CSV mapping, exact decimal amounts and native Checkout quote/create/status/resume |
| Sources | Complete time-range capture, all retained payment refresh, signed callback history, recurring catch-up and original contract observations |
| Reports | Immutable period reports, native JSON/CSV/HTML downloads and comparison with a following report |
| History | Original requests, complete record editions, source capture and recovery of uncertain operations |
| Delivery | Complete working exports, explicit custody handover and the exact final archive |

The selected provider profile determines the available operations. API-key merchant endpoints, Checkout MPP, Common SDK and testnet reads keep their own contracts and connection bindings.

## Original source selection

| Source | Retained edition | Use |
| --- | --- | --- |
| [ROZO Checkout](https://github.com/RozoAI/rozo-checkout-skill/tree/51f086eb7661fe4d8137eac3cac37a775cbf14a3) | 135 files, CLI 0.1.21 | Native quote/create/status/read-only resume, publisher fixtures and compiled CLI assets |
| [ROZO Common](https://github.com/RozoAI/intent-pay/tree/263f53c3a89975adcec7ce48b0a3d2bc33b89251) | 40 files, package 0.1.43 | Original SDK fee/create/payment/payin-registration functions |
| [ROZO contracts](https://github.com/RozoAI/rozo-intents-contracts/tree/9487ae0557507b09631bced1b6c58bb540eda0e8) | 136 files | Original payment, forwarder and intent-bridge semantics and provenance |

The three licensed full-source capsules retain all 311 selected publisher files with original paths, Git identities and hashes. Publisher sources and licenses stay intact. Source documentation was also reviewed in the original engineering intake; this distribution cites that documentation rather than republishing its documentation repository.

`INSTALLED_SOURCE.json` identifies the complete application, shared Applications/distribution dependencies and resources by repository-relative path, size and SHA-256. It excludes itself from ordinary members. The native inspector, Applications provider, server and full handover verify the same declaration.

## What a settlement report means

Amounts remain decimal strings and integer units. Totals are grouped by chain, actual network, token address and precision; the same symbol on different networks produces separate groups.

The report distinguishes provider source-payment confirmation, provider destination-payout confirmation, the merchant's explicitly configured wallet/memo, reviewed variances, staff fulfilment with its own reference, and independently captured contract/transaction evidence.

An original forwarder event reports forwarding to the configured proxy. An intent-bridge filled event reports escrow release to its relayer. The product preserves those meanings and keeps destination-chain receipts separate.

## Durable operations and complete receiving

Each mutation has an original request ID, actor, expected workspace revision, command and payload. The browser stores the complete exact request before dispatch; the CLI stores it under the original workspace. If a response is lost, the visible recovery action reconciles that same request or resumes its retained intent. Accepted requests replay their original result.

A working export is a complete review snapshot and opens read-only when received. **Handover** is the explicit custody action: pause recurring work, drain native activity, checkpoint and seal the original workspace, build the full archive, then activate it at the receiving owner. The sender remains sealed.

The complete archive carries application and publisher source, selected dependency runtimes, SQLite state, raw objects, records, all histories, original request files, reports and configuration references. See [RECEIVING.md](./RECEIVING.md).

## Native exercise and actual proof

The maintained `native` command uses the original Checkout publisher fixtures and functions, together with a labelled development merchant HTTP fixture. It exercises response-loss recovery, complete pagination, callbacks, decisions, reports, the real browser and cold receiving. It creates no real transfer or signing operation.

Execute and resume the same native directory to obtain its actual completed result. An interrupted run retains the original workspace and completed phases. A missing browser runtime produces an explicit pending result; completed payment phases stay saved.

## Operator references

- [OPERATING.md](./OPERATING.md): profile setup, commands, reports, callbacks and exact-request recovery.
- [SOURCE_AND_RUNTIME.md](./SOURCE_AND_RUNTIME.md): source manifests, publishers, SDK/decoder installation and original contract references.
- [RECEIVING.md](./RECEIVING.md): complete export, custody transfer, customer activation and native receiving.
- [APPLICATIONS.md](./APPLICATIONS.md): maintained Applications integration.
- [examples/](./examples/): editable configuration and original request examples.
