# Operate the selected prepaid API installation

This is the complete native operating entry for the merged prepaid API product. It builds the original selected distribution, installs its declared native dependencies, prepares and publishes the merchant offer, receives a complete customer handoff, opens the original customer workspace and its agent setup, reopens the same merchant/customer records, and drains their original owners.

The operating entry creates an isolated merchant setup and a new **unpaid** customer order. It opens the customer in existing-access mode. It does not execute a purchase. The separately completed original funded merchant operation remains the paid application example and keeps its original order, request and allowance.

## Source and entrypoints

| Item | Exact original source |
| --- | --- |
| Repository | `woahwhattheheck/tjlabs-stellar-merchant-workspace` |
| Selected source commit | `6e4a2bebf22cf809587406087efbce9c11d4e449` |
| Published product merge | `e7876f5a3499686a46f039850a0fdf22f22da830` / PR88 |
| Included customer portfolio | Original PR84 / `e11d08cc5f143049be385db80c6178c3c4611620` |
| Source selection | `prepaid-api` |
| Operating entry | [operate.mjs](operate.mjs) |
| Input/source manifest | [source-inputs.json](source-inputs.json) |
| Complete product guide | [products/prepaid-api/OPERATING.md](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/6e4a2bebf22cf809587406087efbce9c11d4e449/products/prepaid-api/OPERATING.md) |
| Original build entry | `stellar/scf-starforge-20261009/distribution/build.mjs` |
| Original installer | `stellar/scf-starforge-20261009/distribution/runtime-install.mjs` |
| Installed command | `prepaid-api` |
| Typed product API | `@tokenjunkielabs/starforge-merchant/prepaid-api` |

The selected commit is the actual feature head accepted by PR88. All eleven product leaves and the final nine customer workspace leaves are identical in that merged product. The operating entry requires a clean actual Git checkout at this commit: the existing builder reads the original Git objects and resolves the selected import, command, native worker and browser-asset closure itself.

The entry and this guide may be received from their immutable operations carrier separately from that source checkout. Keep this directory's three files together. The manifest identifies the entry's Git blob and the original source inputs; it is not a substitute for the original source selection engine.

## 1. Keep a private operating directory and the original checkout

Use the maintained Linux runtime with Node22.16 or newer, Python3.11 or newer, Git, npm and original Linux flock support. The original installer performs the actual runtime/dependency readiness checks.

Use an existing maintained checkout containing the selected commit, or receive that exact public repository through the existing Git connection. With a separate checkout:

~~~sh
git clone https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace.git \
  /srv/source/prepaid-api

git -C /srv/source/prepaid-api checkout --detach \
  6e4a2bebf22cf809587406087efbce9c11d4e449
~~~

The driver checks the actual commit, HEAD and tracked working-tree state before importing its original modules. Do not edit that checkout or replace its Git metadata with an extracted source directory.

Keep the operation directory and input outside the checkout:

~~~sh
umask 077
mkdir -p /srv/prepaid-inputs

node /srv/source/prepaid-api/products/prepaid-api/cli.mjs template \
  --out /srv/prepaid-inputs/request.json
~~~

Select the real merchant terms in that template before the first invocation. The original product compiler validates the public HTTPS origin, API origin, original network/asset/payee/atomic price, allowance and per-request units, source route, selected ports and executables. The [complete product guide](https://github.com/woahwhattheheck/tjlabs-stellar-merchant-workspace/blob/e7876f5a3499686a46f039850a0fdf22f22da830/products/prepaid-api/OPERATING.md) describes every field.

For a local installed-workspace receiving operation, keep the original testnet payment terms and an actual loopback API origin with its matching selected port. The merchant/customer workspace listeners select fresh port0 listeners. The driver does not start the offer's worker or API listener, submit a payment, or dispatch an allowance-consuming application request. It publishes and receives the complete original offer/order/customer records.

The exact request file bytes are retained by SHA256. Resume with those same bytes and the same operation directory.

## 2. Run the complete original installation and opening

With the existing maintained npm cache:

~~~sh
node /received/prepaid-api-installed-921ba0-20261012/operate.mjs \
  --repo /srv/source/prepaid-api \
  --directory /srv/prepaid-installed-operation \
  --request /srv/prepaid-inputs/request.json \
  --python python3 \
  --npm-cache /srv/original-npm-cache
~~~

The cache option is forwarded to the original installer. That installer owns dependency selection, downloads, native preparation, lock identity and readiness.

A complete already installed dependency graph can instead be received through the original adoption path:

~~~sh
node /received/prepaid-api-installed-921ba0-20261012/operate.mjs \
  --repo /srv/source/prepaid-api \
  --directory /srv/prepaid-installed-operation \
  --request /srv/prepaid-inputs/request.json \
  --python python3 \
  --dependencies /srv/original-complete-runtime
~~~

The selected dependency directory must contain its complete ordinary `node_modules` directory and original `package-lock.json`. The entry preserves that layout through one selected link and copies only the exact original lock bytes into the new runtime. It then calls the maintained `installRuntime({adoptExisting:true})`. The original inspector verifies every selected version, import and native requirement. An incomplete or incompatible graph reports its original findings; it is not converted into a new lock or silently replaced.

The entry uses the existing native/operator profile with the original `schema`, `openapi` and `mcp` features. No manually assembled dependency profile is substituted.

## 3. What the complete operation receives

The original operation has one UUID, one request SHA and the following eight retained phases:

| Phase | Original work and retained result |
| --- | --- |
| SELECTED_PRODUCT_BUILT | Build `prepaid-api` through `buildDistribution`; retain the actual archive, SHA256, source commit, source-selection ID and file count |
| ORIGINAL_RUNTIME_INSTALLED | Prepare/install the original native/operator profile; inspect its complete source and native dependency readiness; retain installation/profile/source/dependency identities |
| RETAINED_MERCHANT_SETUP | Run the installed template command, prepare the original numeric-series application and merchant terms, and reopen the exact generated setup and files |
| ORIGINAL_OFFER_PUBLISHED | Open the original merchant console, complete its saved offer preparation/publication operations, and retain the original plan file SHA |
| COMPLETE_CUSTOMER_HANDOFF_RECEIVED | Prepare one stable original customer order, then receive every original handoff member with its export identity, bytes and SHA |
| ORIGINAL_CUSTOMER_OPENED | Prepare one original access-mode customer profile, open its customer browser and generated agent setup, receive its three original browser assets and bind the actual profile/workspace |
| SAME_WORKSPACES_AND_HANDOFF_REOPENED | Stop/reopen the same original merchant and customer owners; reopen publication, order and file receiving with the original IDs and bytes |
| ORIGINAL_WORKSPACES_DRAINED | Drain the retained original owners and read their final STOPPED launch records |

The order reference is derived once from the operation UUID. It remains unchanged across continuation. The saved offer, order, customer bootstrap, profile and export IDs are reused, and each already completed phase must reopen with the same result.

After completion, the operating directory includes:

| Path | Complete retained content |
| --- | --- |
| `operation.json` | Original source/request identity, phase results, status and every selected runtime preparation attempt |
| `result.json` | Exact complete eight-phase result, archive/runtime/setup/workspace/profile/order/export identities |
| `selected-release/` | Maintained builder journal, exact selected package and original source-selection metadata |
| `runtime/` or its recorded recovery successor | Original source package, installation plan/profile/state, dependency graph and lock |
| `merchant/` | Original prepaid setup, merchant application/state, retained publication/order operations and merchant launch |
| `customer-files/` | Complete original exported customer handoff and receiving identity |
| `customer/` | Original customer setup, profile/workspace, saved bootstrap and launch |
| `customer-agent/` | Original generated connection, merchant registration and client settings |

The command's completion line gives the actual result and archive paths. Reopening a COMPLETE operation verifies the original result SHA and phase identities and returns that same result.

## 4. Resume the original operation

Use the same command, original request file and directory, adding `--resume`:

~~~sh
node /received/prepaid-api-installed-921ba0-20261012/operate.mjs \
  --repo /srv/source/prepaid-api \
  --directory /srv/prepaid-installed-operation \
  --request /srv/prepaid-inputs/request.json \
  --python python3 \
  --dependencies /srv/original-complete-runtime \
  --resume
~~~

The operation acquires the existing original kernel lease. It reopens the named operation record before choosing any next action. It preserves accepted results and compares every resumed phase with its original identity.

If the initial operation-record write was interrupted, the entry adopts an exact complete original `.write-UUID` record under that same lease. It preserves incomplete candidates as the operation's retained interrupted-write history. Conflicting complete candidates or different original request/source identities stop with an error.

### Runtime preparation interrupted before installation

Every runtime destination is recorded before the original installer may create it. The first is `runtime`; later destinations are `runtime-recovery-001`, `runtime-recovery-002` and so on, all inside the same original operation directory.

On explicit resume, an existing runtime without a complete named installation plan/state remains intact:

1. The entry reads and retains the original preparation's observed state, bytes and SHA together with the exact selected archive.
2. A valid compatible original `preparation.json` continues through `recoverRuntime({from,directory,install:false})` into the newly recorded destination.
3. If the preparation write itself left an absent, empty or invalid-JSON record, the old directory and bytes stay in place. The already saved driver archive and fixed original selection are used by `prepareRuntimeInstall` at the newly recorded destination, retaining the original predecessor.
4. A valid but incompatible preparation fails. Its terms, archive or source selection are not rewritten.
5. A crash after recording the next destination resumes that same attempt. Before dispatch, the observed predecessor state and exact bytes must still match. A further partial preparation gets its own recorded successor only on a subsequent explicit resume.

No preparation file is manufactured inside the failed runtime. A previously completed ORIGINAL_RUNTIME_INSTALLED phase cannot be silently moved to another source path. Later dependency installation uses the original plan and normal installer continuation at the recorded current runtime.

### Original workspace admission interrupted or rejected

Merchant publication and customer-order work use the product's existing retained workflow. An uncertain response keeps the original request and reconciles its native operation before resending. A definite pre-admission stale-revision rejection must be followed by an absent-operation read; only explicit resume records the next admission attempt with the current original workspace revision. Both original request/history and current native operation remain inspectable.

The customer setup uses one saved original bootstrap operation. The original profile and handoff are not replaced when the browser or caller restarts.

### Shutdown

Ctrl-C or SIGTERM cancels the current original child/action and follows its actual exit/drain. Native child retirement remains TERM then bounded KILL when required, followed by actual close. Customer and merchant cleanup use their returned original owner handles in reverse order.

A failed retryable workspace close retains that same owner and its signal handlers. A later explicit signal resumes that owner's unfinished drain. The raw original kernel-lease close is one-shot; an ambiguous failure is retained and never retried through a possibly reused descriptor. STOPPED launch publication is owned by the original staged workspace lifetime before its lease retires.

## 5. Operate the completed installation

Read the selected runtime directory from `result.json`; a recovered installation may use a recorded successor. Invoke the existing maintained launcher:

~~~sh
node /srv/source/prepaid-api/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs \
  run --dir /srv/prepaid-installed-operation/runtime -- prepaid-api help
~~~

Replace that `--dir` value with the recorded current installation directory. Follow the complete selected product guide for merchant start/drain, original purchase-mode customer configuration, Buyer/Inbox review and approval, application requests, saved results, original payment recovery, history, typed agent clients and complete encrypted backup receiving.

The operator's complete private configuration, claim and authority remain with the original workspaces. For an actual customer, deliver the intended original handoff/export through its maintained receiving path; keep merchant configuration and private capability files private.

## Actual completed foundation

The original funded API merchant operation completed ten stages, including original paid-order adoption, the same 279-byte application result, encrypted application/merchant backup, downloaded restore-bundle receiving and cold reopen. It retains eight purchased units, two consumed, zero reserved and six available:
https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791797426907289

The separate original customer portfolio operation completed all nine reported phases at12:33:59UTC on12October2026 with two actual upstream executions, including saved-request/default independence, replay without another charge, original response recovery, replacement lineage, history, cold reopen and staged shutdown:
https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791808699174559

This entry owns the separate selected build/install/open operation. Its native completion is reported only when its original `result.json` is actually committed and read back. The funded workspace's existing33-tool receiving remains the separate original operation described in [the merchant continuation guide](../api-merchant-agent-receiving-921ba0-20261012/README.md).

## 6. Continue this original host directly from Git

The complete original host entry is [receive-from-git.py](./receive-from-git.py):

~~~sh
python3 receive-from-git.py
~~~

It creates or reopens the genuine private checkout at
`/workspace/scratch/921ba0f574ac/prepaid-selected-source`, fetches the exact
`6e4a2bebf22cf809587406087efbce9c11d4e449` commit from the maintained standalone
repository, and verifies its origin, HEAD and unchanged tracked source. Sparse
checkout reduces the initial working files; the original Git object selection
remains available to the maintained distribution builder.

The entry reads only the original TESTNET checkout's public origin and payment
terms from `/dev/shm/921ba0-api-native-20261011/checkout.json`. It retains the
starter request and exact original driver in
`/dev/shm/921ba0-prepaid-installed-inputs-20261012`, then runs this same operation
at `/dev/shm/921ba0-prepaid-installed-native-20261012`. An existing operation is
continued with `--resume`. No purchase execution is requested.

Both initial driver and request files use the selected original
`sf88-operator-buyer-cli/node/store.mjs` writer and full byte comparison.
An interrupted first write therefore preserves the original private temporary
without leaving a partial named driver that a later continuation mistakes for
complete source. Different existing named bytes are rejected.

The original child is retained through real exit. SIGINT or SIGTERM received
during dispatch is relayed to that same child. The selected driver then owns the
documented installation-preparation recovery, source/receipt identity, native
merchant/customer lifetime and complete result publication above. This entry
does not change the already paid merchant's request or start a replacement
purchase.
