# Receive the installed product from the original native operation

The complete gRPC health operation retains its original source, workspace,
native call, merchant preparation, release history and downloaded customer
files. The installed receiving command opens that saved workspace with the
selected product and completes its handover through the actual installed
merchant client. The same product session opens the persistent Merchant Console;
its workspace UUID and installed source identity remain in the receiving journal
and are checked again after a resumed open.

The command is `grpc-product-receive`. Ordinary customer downloads continue
to use `grpc-product receive`, described in [RECEIVING.md](RECEIVING.md).

## Select the completed original work

Keep the original operation:

`SCF-GRPC-SERVICE-HEALTH-20261012-9B23`

Its `result.json` and private native workspace remain under the original
worker's work directory. Run this continuation through that same owner after
the original service-health core, merchant call, release workflow and frozen
health receiving have completed and their native listeners have closed.

The command consumes these actual saved inputs:

| Original path | Retained purpose |
| --- | --- |
| result.json | Original operation/run IDs, completed phases, source selection, preparation and native call |
| workspace/ | Original source revisions, native attempts, health journal and merchant releases |
| downloads/customer-base/ | All seven original customer files and their immutable export manifest |
| downloads/health-first/ | The original frozen health prefix and immutable export manifest |
| operator/native-calls.json | The original durable endpoint call observations |
| operator/credentials/ | Existing TLS and metadata values used privately by that original native operation |

The command keeps the source revision, completed Summary operation UUID,
preparation UUID, generated-client intent UUID and both original export IDs.
It preserves the selected health event prefix even if later observation history
has grown.

A completed core may have a separately retained browser continuation. This
installed handover preserves the original core's identities and uses the same
workspace lease. The original controller schedules its browser and installed
receiving continuations sequentially.

## Use the actual equipped installation

Build the source selection and receive its runtime using the original
[installation guide](../../stellar/scf-starforge-20261009/distribution/selections/GRPC_MERCHANT.md).
Use the existing original Git checkout, archive, package lock and installed
dependency cache.

The installed source must contain `grpc-product`,
`grpc-product-receive`, the product Applications provider and original gRPC
merchant provider. The receiver calls the maintained READY/profile/lock
inspector and validates the selected product source files before it opens the
workspace.

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /srv/private/grpc-runtime -- grpc-product-receive \
  --runtime /srv/private/grpc-runtime \
  --native-work /srv/private/original-grpc-health-work
~~~

The default receiving directory is:

`ORIGINAL_WORK/operator/installed-product-receiving`

It remains beneath the original operation's existing private checkpoint
closure. To choose a different private directory, supply `--directory` and
retain that exact path for every continuation.

## Complete installed receiving

The command carries the whole original operation into the installed product:

1. It binds the actual installed archive/profile/lock and original native
   operation, then initializes a product that adopts the original workspace.
2. It opens the product's native console and merchant agent together, reads the
   original source and completed call, pages every original merchant route and
   retains the original release selection/generation.
3. It publishes the original customer preparation and exact frozen health prefix
   through the installed agent. Both returned export IDs and manifest hashes
   must equal the originals.
4. It receives all seven customer files and the complete health snapshot through
   the original byte transport, then repeats receiving into the same directories.
5. It imports the complete generated customer client and builds its original
   request using the saved intent and example.
6. It closes the aggregate owner, reads every received file offline with its
   original native manifest/domain reader, and retains the unchanged endpoint
   call journal.

The upstream service stays stopped during this receiving continuation. Reads,
exports, client request construction and file receiving operate on the original
saved source and outcomes.

## Continue an interrupted handover

Run the same command with the same runtime, native work directory and receiving
directory. The receiver retains its input and phase journal before effects.
Original export descriptors are saved before the first download. The native
transport resumes the same byte directory and preserves completed files.

The product retains its own setup UUID and native workspace binding. Reopening
uses its original configuration and refreshes the private local connection.
The native workspace lease preserves ownership if its original operator is
already open.

A completed handover still reads both receiving directories and checks their
complete files when opened again.

## Retained delivery

| Receiving path | Complete content |
| --- | --- |
| receiving.json | Original input, selected runtime/source identities, phase results and close/session state |
| original-native-result.json | The first original native result used by this installed handover |
| product/ | Original installed product setup, native connection and private agent configuration |
| exports.json | The two retained original immutable export descriptors |
| customer/ | Original manifest, transfer state and all seven generated customer files |
| health/ | Original manifest, transfer state and complete frozen health snapshot |
| original-routes.json | Every retained route from the same source revision and snapshot |
| customer-request.json | The complete request built by the original generated client |

The public progress output contains the original operation/run identity,
source commit, installation identity and completed phase names. Credentials
remain in the original private host files and in the process environment.
