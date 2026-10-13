# Rialto customer receiving

Receive a complete original Rialto catalogue, choose a useful HTTP request, prepare its actual merchant challenge through the original Stellar Forge buyer, and hand the whole operation to another operator.

## Original published path inputs

The installed request editor reads each HTTP resource's published path declaration through the same maintained route helper used by the original buyer. For a route with parameters, open **Review source**, fill its required path values and choose **Apply path values**. The complete request URL updates while retaining its query parameters. Concrete segments already present in the original advertised resource stay fixed. Published examples remain source context; the editor asks for the customer's actual values.

The downloaded request retains those explicit path values with the complete catalogue identity, original row and payment option. The native `select` operation binds the concrete URL against the original template, validates fixed values and retains its full `pathBinding`. The actual merchant challenge is independently bound to the same concrete request. The original SF88 preparation, payment approval and receiving then continue unchanged.

A CLI selection may supply `pathValues` alongside its complete concrete `url`. Omit it when entering an already concrete URL directly; the maintained helper still validates and derives the original binding. The pure SDK exports `describeRequestPath`, `prepareRequestPath` and `bindRequestPath` for applications using these same source declarations. Conflicting top-level and Bazaar route templates are reported explicitly.

Saved browser drafts retain unfinished path fields, body, headers, task, useful output and current URL. Previously saved native requests continue reopening after upgrade; their original request is validated again, and their retained selection remains intact. Existing captured catalogue reports also remain intact. To generate the updated editor from an existing catalogue, choose a new report path:

```sh
starforge rialto-customer report \
  --directory /absolute/private/catalogue-001 \
  --out /absolute/private/catalogue-001-path-editor.html
```

Continue the original selected customer directory for challenge recovery and native receiving. A distinct customer request starts its own request directory and explicit intent.

## Installation

Use Node.js 22 or later and Linux `flock`. The receiving modules use Node built-ins. The original buyer retains its own native dependencies, account configuration and authorization.

The full Merchant installation discovers the source-owned `rialto-customer` contribution. For a selected package, use the existing source builder from a checkout containing this contribution:

```sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout --ref ORIGINAL_COMMIT \
  --selection rialto-customer --out /absolute/private/rialto-package --offline
```

Use the builder’s returned archive and the maintained runtime receiving procedure. The selected manifest retains the original commit, complete source files, contribution and selection identity. Its commands are `starforge rialto-customer` and `stellar-rialto-customer`; `starforge buyer` is the original SF88 entrypoint. The full Merchant product exposes the same `starforge rialto-customer` command alongside its other products.

```sh
starforge registrations --source rialto-customer
starforge rialto-customer help
starforge rialto-customer capture --directory /absolute/private/catalogue-001
starforge rialto-customer inspect --directory /absolute/private/catalogue-001
```

Capture defaults to the original Rialto testnet discovery and facilitator. A plan can select the original endpoints, Stellar network, page limit and source filters. Each completed catalogue contains every returned offset page through its reported total, complete original HTTP records, all resource/payment metadata, and `report.html`. The report shows the observation interval and any changed-total or duplicate-identity findings.

## Complete customer task

1. Open `report.html` from the actual received catalogue. Search or page through original resources, choose an HTTP listing and payment option, enter the useful task, concrete URL/method, intent and atomic cap, then download the selection.
2. Receive that selection together with the complete source catalogue. Include a body file and ordinary header file when the actual request requires them.
3. Capture the merchant’s actual unsigned challenge using the original request. Each capture keeps a durable request-attempt marker before dispatch. A reused interrupted capture preserves its attempt; a deliberate new request uses an explicit new capture ID.
4. Review the retained challenge and choose its exact option. Prepare it through the original SF88 buyer. The installed command resolves its own source installation automatically; `--checkout` explicitly selects another complete original installation.
5. Continue the original buyer’s account, authorization, execution, useful-output and recovery workflow. Preserve its native result with the original customer operation.
6. Pack the whole private receiving edition, transfer it and receive it into a new private directory. Import the retained original buyer operation into another new native directory to rebase machine-local paths; review the resulting config with an explicit new response destination. Continue that same original task.

```sh
starforge rialto-customer select \
  --source /absolute/private/catalogue-001 \
  --selection /absolute/private/downloaded-selection.json \
  --directory /absolute/private/customer-request-001
starforge rialto-customer challenge --directory /absolute/private/customer-request-001
starforge rialto-customer prepare --directory /absolute/private/customer-request-001 --accept 0
starforge rialto-customer pack --directory /absolute/private/customer-request-001 \
  --out /absolute/private/customer-request-001.packet.json
starforge rialto-customer receive --file /absolute/private/customer-request-001.packet.json \
  --directory /absolute/private/received-request-001
starforge buyer --import-operation \
  --file /absolute/private/received-request-001/native/buyer-operation.json \
  --dir /absolute/private/received-native-001 --accept 0
starforge buyer --review --config /absolute/private/received-native-001/review.json \
  --response-out /absolute/private/received-native-001/customer-result
```

The examples’ option index `0` must be replaced by the actual reviewed option index. Header/body arguments, retry capture IDs, changed challenge terms and full native receiving behavior are covered in the [operating guide](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/7b2c8e94a9dc08124c75e372c802839db18ebb15/stellar/scf-starforge-20261009/partners/rialto/OPERATING.md).

## Source and receiving

| Source | Responsibility |
|---|---|
| [Complete operating guide](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/7b2c8e94a9dc08124c75e372c802839db18ebb15/stellar/scf-starforge-20261009/partners/rialto/OPERATING.md) | Catalogue, customer request, original challenge, native preparation, complete receiving and reopen |
| [Merchant workshare](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/7b2c8e94a9dc08124c75e372c802839db18ebb15/stellar/scf-starforge-20261009/partners/rialto/WORKSHARE.md) | Service-specific implementation, acceptance and prospective commercial terms |
| [Source contracts](https://github.com/woahwhattheheck/public-commons-sprint-2026/blob/7b2c8e94a9dc08124c75e372c802839db18ebb15/stellar/scf-starforge-20261009/partners/rialto/SOURCE_CONTRACT.md) | Exact original Rialto and buyer interfaces |
| [Grant chapter](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/main/products/rialto/GRANT.md) | The complete product chapter and immutable application sources |

The selected source recipe explicitly carries the original native buyer’s dynamic modules, Python helpers and recovery components. The package exposes typed pure catalogue contracts at `@tokenjunkielabs/starforge-merchant/partners/rialto` and the offline report function at `@tokenjunkielabs/starforge-merchant/partners/rialto/report`.

MCP resources remain fully visible in the catalogue; their original Rialto tools retain execution. This customer path operates concrete HTTP resources. The original buyer and original authorization flow remain attached throughout.

In the received package, the complete local operating guide is `source/stellar/scf-starforge-20261009/partners/rialto/OPERATING.md`; source and product guides remain in the same source inventory.
