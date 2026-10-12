# Receive the complete selected Buyer Expenses product

This foreground runs the original selected source acquisition, package builder,
runtime installer and customer SDK/MCP financial receiving operation on an
existing Linux worker. It starts from F232's retained complete project and carries
its saved source, issued periods, accountant returns and request identities
through export, a second receiving, and merchant restart.

## Retained operation and input

The operation is `BUYER-FINANCE-STANDALONE-6200-20261012`. Its selected product is
`buyer-expenses` in `woahwhattheheck/tjlabs-stellar-merchant-workspace`, at commit
`27347f1b1a9ae0f1ab7979803dd471f26c5185cf` and tree
`ab96fa5fe8686f7f8461d18c0f65a5ebc33ff7df`. That source was integrated by merge
`b86b7da8a72aed4ebd9f38aef7c2c37129940410`. The exact source selection stays
fixed as the containing repository gains later product features.

Obtain the original receiving ZIP from the existing F232 financial handoff.
Keep that financial input in the operator's private receiving directory.

| Original input | Identity |
| --- | --- |
| Complete F232 receiving ZIP | SHA-256 `31f88f9daa0d4f4d65bc23b463dbd3e90c7c80182f19cd7c41e1722b8731b880` |
| Included complete Buyer Expenses project | 497,098 bytes; SHA-256 `46329775e2298e49fbf9deb1dc6300f63db798f10e252ac3e727ab4e0f815c7b` |

The launcher recovers the included project by its exact length and digest. An
operator may instead pass that same extracted project with
`--original-project`. The original `case/operation.json` supplies the saved
workspace UUID, revision, successful-request count and accountant-return count;
the receiving driver compares against those original values.

`SOURCE.json` records the byte length and SHA-256 of each executable/input
file. `source-input.json` retains the original complete Git metadata, exact raw
commit body, selected path set, source-reader implementation and acquired
original blobs. The launcher verifies that packet before decoding it. The
unchanged Git object receiver verifies the commit, complete tree and every
selected object against their Git identities.

## Choose the existing worker and source inputs

Use one actual receiving worker for this original operation. Retain its
`accepted-original-financial-operation` record, directory and PID before moving
execution to another host; reconcile any existing active receiving first.

The worker needs Linux, Python 3.11 or newer, Node 24, Git and the dependencies
required by the original selected runtime profile. The runtime installer uses
the existing npm installation route. A complete operator-owned npm cache and
matching Node headers can supply its original offline mode.

The source receiver consumes existing inputs through its maintained interface:

| Input | Launcher flag |
| --- | --- |
| Existing Git object database, including the retained original receiving cache | `--donor-repository /absolute/repository.git` |
| Installed original source tree | `--donor-source /absolute/installed/source` |
| Exact original source/release archive | `--donor-archive FULL_SHA256 /absolute/archive.tgz` |
| Additional original blobs supplied by exact object ID | `--incoming /absolute/original-blobs` |
| A concrete source path requested by the selected builder | `--additional-path stellar/original/path` |

These flags may be repeated. Donor repositories, source trees and archives are
read-only inputs to the original receiver. The retained previous operation ZIP
contains `retained-original-source-cache.zip`; its
`source-receiving/repository.git` is a reusable donor after that archive has
been received into a private directory. The new receiving owns its separate
object database.

The acquired object set includes the original eleven builder/installer modules,
the three original VGI receiving files, the source-job resolution limit and OAuth
browser, and the 97 runtime dependency files requested by the selected builder's
actual receiving. It also carries the complete 814-body original reference cache
acquired from that same signed tree. The packet retains 1,130 original required
paths, adds 814 exact paths through the receiver's existing additional-path
interface, and carries 950 acquired original source bodies. Every body retains
its unchanged Git blob identity.

This broader cache includes the maintained accounting-provider and merchant-host
modules, original managed-workspace helpers, native seller dependencies, readers
and their shared browser inputs. It supplies original objects before the full
selected builder runs. The unchanged Node builder follows its actual static and
runtime source declarations and produces the packaged file inventory; the
reference cache does not choose or add product registrations.

The original launcher verifies the packet's exact compressed and decoded
identities with a bounded 64 MiB decoded-source ceiling, matching the maintained
source-receiving capacity. Saved additional paths are kept when repeated
`--additional-path` arguments are supplied. Existing packets without that optional
list retain their original behavior.

If the chosen worker's donors lack other selected
objects, the receiver reports their exact IDs and paths in
`missing-objects.json`, and preserves its full cache in the operation output.
Supply those exact original blobs through `--incoming`, or use an existing
complete donor. A selected builder dependency discovered later is retained in
`build-source-issue.json` and can be supplied through the same original source
path and object mechanism.

The selected customer package explicitly includes its product README and
operating guide. This repository receiving directory carries the complete frozen
source input and execution entrypoint; it stays outside that customer package's
component selection, so the packet does not become a nested source dependency.

## Run the complete operation

Use a durable private archive directory for all results. The temporary
directory holds this receiving's source cache, package, native runtime and
project; choose its capacity for those complete outputs and the selected
runtime dependencies.

~~~sh
python3 products/buyer-expenses/receiving/run_native_receiving.py \
  --original-receiving /absolute/private/GOVERNED_BUYER_FINANCE_Receiving_20261012.zip \
  --temporary-directory /absolute/private/native-work \
  --archive-directory /absolute/private/financial-receiving-archives \
  --donor-repository /absolute/retained/source-receiving/repository.git \
  --donor-source /absolute/installed/original/source
~~~

For the original installer's complete offline npm route, append:

~~~sh
  --npm-cache /absolute/private/complete-npm-cache \
  --npm-offline \
  --node-headers /absolute/existing/node-headers
~~~

A connected worker that already has the original Library upload helpers can
replace `--archive-directory` with
`--library-helpers /absolute/existing/library-helpers`. The selected-product
archive and complete native operation are preserved by that existing uploader
before the foreground exits.

The command prints structured progress as each actual phase starts. The
original operation records its child PID and command, captures complete stdout
and stderr, and waits for that child before proceeding. Every native child has an owned
process group. An interruption or journal/result failure ends that group and
reaps its leader before artifact construction; the original PID, group and
cleanup result remain in the operation. If shutdown cannot complete, retain
that same active identity for reconciliation before packaging its files.

The full sequence is:

1. Verify the complete original source through `git-object-receiving.py`.
2. Run the original `buildDistribution` with `selection: 'buyer-expenses'`
   and `offline: true`.
3. Verify and retain the exact selected archive, then prepare, install and
   inspect the original native MCP/schema runtime to its `READY` state.
4. Inspect installed source and the original Buyer Expenses registrations.
5. Receive F232's original project through the installed SDK; open the same
   source, requests, issued periods and accountant returns through MCP.
6. Export the complete project, inspect its retained manifest, and download
   the exact original file in the maintained chunks with its SHA-256 check.
7. Close that project, receive the exported project into a new private
   destination, and verify its original state and history.
8. Drain the merchant, restart it, reopen the received project, compare the
   saved request and accountant-return identities, and drain the original
   host.

The first artifact receipt identifies the selected distributable archive.
The final operation archive includes the complete case directory, original
project, source metadata and cache, selected build/runtime records, every
phase's output, and the original financial receiving record. Archive-directory
retention uses a SHA-qualified filename, fsynced complete bytes, create-only
publication and readback. Existing identical archived bytes are reused.

## Continue the retained result

The terminal JSON includes the exact operation/source, per-phase exit results,
archive paths or upload receipts, and the original receiving outcome. A
successful complete run exits zero after preservation. Source-needed and other
failed phases retain their source/error records and full available output.
If the financial sequence completes but artifact retention fails, the terminal
record identifies `receivingOutcome: 'PASS'` with
`outcome: 'RETENTION_NEEDED'`; preserve that existing native result before
choosing any subsequent execution.

Use the saved directory and process records to reconcile an interrupted
foreground. The complete project remains the original private financial
artifact. Subsequent customer work uses the product's maintained
[operating workflow](../OPERATING.md), source reattachment and same-request
recovery.
