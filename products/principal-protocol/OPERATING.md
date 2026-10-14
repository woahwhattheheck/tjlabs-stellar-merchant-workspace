# Principal operations in Applications

TokenJunkieLabs' installed Principal product opens the original private workspace for contract observations, exact operation preparation, Principal market positions, compliance recovery, request reconciliation and complete editable delivery. Its current source is Accounting edition 3, Market edition 1 and Paired Exit edition 1. The separate original reference is retained for source history; the installed command uses the current 204-method API.

## Build and install the selected source

Use the maintained Merchant builder with the actual merged commit of this product:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/tjlabs-stellar-merchant-workspace --ref FULL_MERGED_COMMIT \
  --selection principal-protocol --out /absolute/principal-release --offline
~~~

Use the archive path and SHA returned by that build in the original runtime installer:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/principal-runtime --archive /absolute/principal-release/ORIGINAL.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 --operator
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/principal-runtime
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/principal-runtime --load --source
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/principal-runtime -- registrations --source principal-protocol
~~~

The product itself uses Node builtins and requires Linux with Node 22.16 or later. Use the actual selected host runtime; the maintained Node 24 receiving host is suitable. Native contracts retain Rust 1.91, the locked Soroban toolchain and their original compiler course. A ready Node installation does not establish a successful Rust build, native lifecycle or deployment.

The contribution carries all 320 current operator files and all 44 original reference files as exact explicit source paths. This includes original Cargo locks, tests, snapshots, hidden configuration and complete source packets that ordinary runtime discovery might omit. PRODUCT_SOURCE.json binds each original byte sequence. Browser manifests describe both original servers' existing routes without changing either server. The shared builder resolves its original module and asset dependencies.

## Initialize or receive an ordinary workspace

Run the installed command through the runtime's original run operation:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/principal-runtime -- principal-protocol init \
  --workspace /absolute/private/principal-workspace --name "Principal operations"
~~~

To continue a delivered project, use the original complete packet and its own receive request ID instead:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/principal-runtime -- principal-protocol inspect \
  --input /absolute/original-principal-workspace.json
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/principal-runtime -- principal-protocol receive \
  --input /absolute/original-principal-workspace.json \
  --workspace /absolute/private/received-principal --request-id ORIGINAL_RECEIVE_ID
~~~

Use an owner-only workspace directory. A current workspace must match this exact API edition. Keep an older workspace with its matching original runtime or use its supported original receiving course; the adapter does not rewrite saved contracts, ABI identities or historical operations.

Choose a private operator token file owned by the host user with mode 0600. It contains at least 24 visible ASCII characters. A new local token can be created with the selected Node runtime using an exclusive write:

~~~sh
node --input-type=module -e 'import {randomBytes} from "node:crypto"; import {writeFileSync} from "node:fs"; writeFileSync(process.argv[1],randomBytes(32).toString("base64url")+"\n",{mode:0o600,flag:"wx"});' /absolute/private/principal-token.txt
~~~

This token opens the local operator. It is separate from a Stellar signer. Keep the file local and select its path in Applications.

## Review, save and open

Attach the READY runtime to the maintained Runtime workspace using its existing attach operation, then open Runtime → Applications. Choose **Principal operations** and the existing private workspace directory, private token file, desired local port (0 chooses an available port), and optional original environment file. Use the maintained Review, Save, Connect, Review Start, Start and Open controls.

Preparation reads the selected runtime's complete source manifest and original SQLite state in read-only mode. It binds the existing workspace ID, API identity, full original source roster and selected token file hash. It does not initialize a workspace, configure a network or invoke a contract. The original Runtime retains those inputs and its normal resource lease.

Start rechecks that binding, launches the unchanged original server on 127.0.0.1 and compares the server's opened workspace identity. Its startup line contains the ordinary local URL and source/workspace identities, without the token. The provider reads the selected private file, calls the actual authenticated original bootstrap and verifies the workspace and API before saving the private Open link. The original browser reads the token fragment and removes it from its address bar. Runtime's private saved Open link is credential-bearing and belongs with the private host operation.

Stop, interruption and restart stay in Runtime's existing lifecycle. An occupied Principal workspace retains its original lock. A changed token, replaced workspace or source mismatch requires a fresh review. Neither failed startup nor Continue dispatches a saved contract operation.

## Operate the original product

| Page | Original work |
| --- | --- |
| Configuration | Select actual RPC, network passphrase, executable/version/digest, signer alias/address and deployed contract IDs/Wasm hashes. |
| Market & contract wiring | Inspect actual Manager/Pool/Router bindings, quote the selected market and prepare the original exact operation. |
| Account positions | Inspect balances, retained yield and exact paired-exit quotes under the current selected contracts. |
| Prepare operation | Keep original ABI integer text and parameters, then retain a request and native plan. |
| Prepared operations | Review original simulated output and exact source before any separately authorized execution. |
| Contract event history | Retain selected original RPC pages, event content and explicit coverage. |
| Export & receive | Download full editable workspace/source and reopen it through the original receiver. |
| Request recovery | Inspect the retained original request and actual host result after interruption. |

New workspaces start with execution disabled. Existing configuration is preserved, including the owner's actual execution setting. Installed preparation and Open never enable it. Simulation uses the original selected executable and contract source; signing and sending remain explicit original operations subject to the selected account, contract and permissioning. An uncertain attempt cannot be automatically replayed.

Paired exit burns equal current PT/YT amounts before maturity and returns current principal SY. Earned yield remains separately claimable, including after the final paired burn. Manager and Router routes retain independent quote/topology bindings; minimum outputs and deadlines remain exact owner choices. Market pricing, all-fee liabilities, oracle freshness, permissions, maturity and losses stay in the original source. Read operator/contracts-source/docs/MARKET_EDITION_1.md and PAIRED_EXIT_EDITION_1.md before using these methods.

## Exact exports and receiving

The original browser downloads complete stored files and the portable workspace. The installed CLI delegates the same native operations:

~~~sh
starforge principal-protocol state --workspace /absolute/private/principal-workspace --out /absolute/new-state.json
starforge principal-protocol export --workspace /absolute/private/principal-workspace --out /absolute/new-principal-workspace.json
starforge principal-protocol source
~~~

Use these commands through the selected runtime run operation if starforge is not on the host PATH. Source returns the verified current/reference inventory; the selected distribution contains the actual files. The original portable workspace carries all current application bytes, saved requests, complete objects and history. The installed runtime archive additionally carries the original reference and Applications adapter. Receive both through their existing receiving owners for a full installed colleague workflow.

Run the original contract build course from operator/native/PAIRED_EXIT_BUILD.md in the same accepted native operation. Then follow RECEIVING.md for the installed lifecycle and actual browser continuation. No deployment or compiler result is inferred from this source adoption.
