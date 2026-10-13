# Whole-host handoff through the Merchant agent connection

This source-owned provider connects an agent to the existing offline recovery-workspace host-handoff engine. It preserves the original source-selection plan, encrypted bundle, capture operation, receiving review and adoption operation. The live recovery workspace and its launch token are not used by this provider.

Use a dedicated operator configuration. The host chooses every file path, operation directory, environment-variable name and optional Python executable in advance. Agent calls select only a declared host alias and the original SHA-256 confirmations. They cannot supply arbitrary paths or secret values.

For the complete native format, original absolute-path receiving rule, source selection, private external inputs and Linux publication requirements, read [HOST_HANDOFF.md](HOST_HANDOFF.md). The direct CLI remains available through the original installed `merchant-recovery-host` command.

## Configure the host

Create a private connection JSON outside every selected application/state root and every receiving destination. The connection schema is `stellar-forge.recovery-host-handoff-connection.v1`; its only top-level members are `schema` and `hosts`. There are at most 100 host aliases. Each alias is one to 64 lowercase letters, digits, underscores or hyphens, beginning with a letter or digit.

Each host has a nonempty `label` of at most 160 characters, `bundleDirectory` and `passphraseEnv`. Declare at least one of these complete groups:

| Capability | Required host-selected members |
| --- | --- |
| Source capture | `selectionFile`, `planFile`, `captureOperationDirectory` |
| Receiving | `restoreDirectory`, `targetFile`, `adoptionOperationDirectory` |

A partial group is rejected. A receiving declaration may also select an absolute `python` executable. A receiving declaration may select optional `restoreOperationDirectory` for interrupted cold-restore continuation. It requires the complete receiving group and must remain disjoint from every alias's source/target/control path and trusted executable. Its stage and the final restore's parent must share a filesystem. The capture, cold restore and adoption directories are distinct original operations. Keep original directories and IDs when reconnecting; do not create replacements to recover a missing response.

This source-host example selects capture only:

~~~json
{
  "schema": "stellar-forge.recovery-host-handoff-connection.v1",
  "hosts": {
    "source": {
      "label": "Original merchant workspace",
      "selectionFile": "/srv/handoff-control/source-selection.json",
      "planFile": "/srv/handoff-control/original-plan.json",
      "bundleDirectory": "/srv/handoff-output/original-bundle",
      "captureOperationDirectory": "/srv/handoff-control/original-capture",
      "passphraseEnv": "MERCHANT_HANDOFF_PASSPHRASE"
    }
  }
}
~~~

This cold receiving-host example selects the complete original encrypted bundle and a separately prepared native target file:

~~~json
{
  "schema": "stellar-forge.recovery-host-handoff-connection.v1",
  "hosts": {
    "receive": {
      "label": "Original workspace receiving host",
      "bundleDirectory": "/srv/handoff-input/original-bundle",
      "restoreDirectory": "/srv/handoff-staging/original-restore",
      "restoreOperationDirectory": "/srv/handoff-control/original-cold-restore",
      "targetFile": "/srv/handoff-control/original-target.json",
      "adoptionOperationDirectory": "/srv/handoff-control/original-adoption",
      "passphraseEnv": "MERCHANT_HANDOFF_PASSPHRASE",
      "python": "/usr/bin/python3"
    }
  }
}
~~~

These paths are examples. Use the real original source selection and explicit native receiving mappings. Version 1 adoption preserves original absolute state paths; it does not rewrite saved journals to fit a new layout. The original passphrase environment variable must exist in the operator process on each host. Its value does not belong in the JSON, agent tool arguments, plans or chat.

Connection reading normalizes and checks host paths before setup creates any state. Keep the dedicated operator directory, release store, export directory and any optional console directory outside selected source roots and receiving destinations. Keep the connection and native control inputs in their own private custody. The original engine also enforces its complete source/target, private-file, lease and bundle constraints.

## Initialize the dedicated operator

Use the distribution's normal provider initializer with provider ID `recovery-host-handoffs`, an absolute new `directory`, an absolute existing `connection`, and an optional `name`. The exported initializer contract is:

~~~js
import { initializeMerchantProvider } from
  './stellar-forge/mcp-merchant-operator/providers.mjs';

const result = await initializeMerchantProvider('recovery-host-handoffs', {
  directory: '/srv/handoff-operator',
  connection: '/srv/handoff-control/connection.json',
  name: 'Merchant whole-host handoffs'
});
console.log(JSON.stringify(result, null, 2));
~~~

Run that example from the complete maintained source root with its existing runtime dependencies. The maintained source CLI provides the same initializer. Save these complete setup options to a private `/srv/handoff-control/setup.json`:

~~~json
{
  "directory": "/srv/handoff-operator",
  "connection": "/srv/handoff-control/connection.json",
  "name": "Merchant whole-host handoffs"
}
~~~

With `SOURCE` set to the complete selected distribution source root, initialize and serve through the existing entry:

~~~sh
node "$SOURCE/stellar-forge/mcp-merchant-operator/serve.mjs" \
  init-provider recovery-host-handoffs \
  --options /srv/handoff-control/setup.json

node "$SOURCE/stellar-forge/mcp-merchant-operator/serve.mjs" \
  serve --config /srv/handoff-operator/merchant-mcp.json \
  --port 3211 --token-env MCP_ACCESS_TOKEN
~~~

The shell examples use the same existing process environment for the MCP access token and original handoff passphrase. Configure those variables through the host's existing private secret mechanism before launch; do not put their values into tool calls. An optional console is selected with `--operator-console-dir /absolute/disjoint/console`; the actual selected path is passed to provider custody checks. Existing serve owns signals and awaits the original session close.

The initializer checks custody before its first directory creation, creates a fresh private operator directory, initializes the original empty release store, and writes `merchant-mcp.json` plus its original customer-export directory. It then reads the resulting configuration through the maintained Merchant configuration loader. Directory creation is exclusive: after an interrupted setup, inspect the existing result before deciding how to proceed.

The resulting ordinary Merchant configuration has empty `sources` and `hostHandoffConnection` pointing to the selected connection file. No other provider family is configured in this dedicated operator. The adapter checks the complete configured operator, not just the providers that happened to precede its configuration reader.

The release store must remain untouched and empty, with no current/previous release, release history, staged release, invalid release entry or observed runtime. Native handoff operations recheck this condition. The existing core controls remain owned by their original provider and serialize with native handoff mutations. Do not repurpose this operator as a seller release host.

## Inspect and resume the original setup

Setup supports `operation: "initialize"` (the default), `"inspect"`, and
`"resume"` through the same initializer and `init-provider` command.
Use the original absolute directory, complete connection file and name.

`inspect` is read-only. It does not create a directory, acquire a writer lease,
initialize releases or start a host. It returns recorded setup status, the full
retained initialization intent, the intended configuration and original result.
The connection file may be missing or changed while you inspect the retained
original intent. Inspection does not assert fresh source validity.

For explicit continuation, use the same options with `"operation": "resume"`:

~~~json
{
  "directory": "/srv/handoff-operator",
  "connection": "/srv/handoff-control/connection.json",
  "name": "Merchant whole-host handoffs",
  "operation": "resume"
}
~~~

Save these options privately and run the same `init-provider` command shown
above. A complete connection-byte match is required, including whitespace.
Changing an alias, path, name or source file does not silently change the
interrupted operation. If the connection changed, inspect and preserve both
editions, restore the intended complete source at its original path when that
is the operator's decision, then explicitly resume. Do not edit retained intent
or completion records to make another input look like the original.

| Recorded status | Continuation |
| --- | --- |
| `NOT_STARTED` | Initialize the selected new private directory. |
| `BEFORE_INTENT` | The control directory exists but no operator root was published. Repeat initialize with the intended inputs. |
| `INCOMPLETE` | Resume the exact retained initialization. |
| `COMPLETE` | Resume revalidates the original source/configuration and dedicated empty release store, then returns the same result with `reused: true`. |
| `UNMANAGED_EXISTING_DIRECTORY` or `UNBOUND_EXISTING_DIRECTORY` | Preserve that unrelated directory; setup will not adopt or overwrite it. |

The initializer retains a deterministic private sibling named
`.merchant-host-setup-<directory digest>`. Keep this directory together with
the original operator root. It contains complete source and configuration
bytes, directory identity and completion history. These controls are also
excluded from selected source and receiving roots by the original provider's
custody checks. Keep backups of both original directories in their existing
authorized locations. The setup does not relocate either directory.

Initialization requires Linux, util-linux `flock`, and `/usr/bin/python3`.
It uses the existing delivery lease and the original host-adoption
`renameat2(RENAME_NOREPLACE)` primitive. A private stage's exact device and inode
are recorded before final-path publication; an unrelated destination is never
replaced, including an empty directory. A parent interruption retains every
earlier stage and the inherited lease until its publication child exits.
Incomplete private publication files remain as original interruption history;
continuation does not remove someone else's entries or reset a release store.

Both initial completion and completed resume require the dedicated release
store to remain at generation zero with no active/previous release, release
history, or retained release directories. Customer exports must be empty until
initialization completes. A completed resume preserves subsequent original
customer export files. The handoff provider retains its normal empty-release
admission rule.

## Receive this setup through the original provider

The complete source includes `receiving/HOST_SETUP_RECEIVE.mjs`. On the
equipped Linux host, select the same private setup options and a separate new
private observation directory:

~~~sh
node "$SOURCE/stellar/scf-starforge-20261009/sf101-merchant-recovery/workspace/receiving/HOST_SETUP_RECEIVE.mjs" \
  --options /srv/handoff-control/setup.json \
  --output /srv/handoff-observations/setup-receive
~~~

The course inspects before continuing, initializes or resumes the exact setup,
reopens the actual Merchant provider twice, reads its host inventory, closes
the original owners and confirms the original configuration/release bytes
survive another completed resume. It retains complete inputs and observations
in a unique invocation directory. It does not capture, restore or adopt a host,
start a seller, replace an existing operator, or create a second handoff job.

Source-level interruption observations cover control creation, retained intent,
unbound staging, bound staging, final-root publication, original release state,
configuration publication and completion publication. They used the actual
JavaScript initializer and original release functions with explicit filesystem
and native-call interface adapters. Actual Linux filesystem, Python publication
and provider receiving require the equipped course above; adapter execution
does not claim those native outcomes.


## Source capture

1. Stop the selected original recovery workspace listener and all other selected source writers through their normal controls. Keep them stopped through plan and capture. Reconcile a stale launch or lease through its original owner; the adapter does not delete it.
2. Call `merchant_host_handoff_hosts` with `{}`. Select the exact source-capable alias.
3. Call `merchant_host_handoff_selection` with `{"host":"source"}`. Read the complete source selection and retain its exact SHA-256.
4. Call `merchant_host_handoff_plan` with the same host, `expectedSelectionSha256` equal to that observed digest, and `quiesced:true`. Read the returned native plan metadata and digest. Then call `merchant_host_handoff_saved_plan` with the same host and that `expectedPlanSha256` to inspect the complete original saved JSON bytes before export.
5. If the plan response is missing, call `merchant_host_handoff_saved_plan` with the same host. It reads the already retained complete plan, bytes and SHA. Do not call plan again as a recovery strategy: creation is exclusive. When a digest is already known, pass `expectedPlanSha256` to require it.
6. Review the complete plan. Call `merchant_host_handoff_export` with its `expectedPlanSha256` and `quiesced:true`. Both assertions must still describe the original stopped sources.
7. Retain the complete original export result and its bundle/manifest identity. After a missing response, read `merchant_host_handoff_capture` with the same host and plan SHA. Any explicit continuation uses that same original capture directory and selection.

The capture readback is recorded evidence. It does not authenticate the current ciphertext or prove a live export finished after the recorded state was written. Follow the original engine's complete status and reconciliation semantics.

## Cold restore and adoption

Transfer the complete original encrypted bundle through the existing binary transfer route. Preserve every native bundle member and the exact manifest SHA-256 returned by the original operation. Avoid moving ciphertext through model text. The original private external inputs must be supplied on the receiving host according to the target's explicit original paths and expected hashes.

1. Configure the receiving alias on the cold host and initialize its separate dedicated operator.
2. Call `merchant_host_handoff_restore` with the receiving `host` and `expectedManifestSha256`. When the alias declares `restoreOperationDirectory`, the original native restore owns its private staged plaintext, exact bundle/output binding and no-replace publication. The host wrapper first authenticates the bounded handoff plan without writing and rejects operation overlap with captured roots, external private files or retained absent paths. It then verifies the complete current restored tree and application before returning `HOST_HANDOFF_RESTORED`. After a missing response or interruption, call `merchant_host_handoff_restore_operation` with the same host and manifest SHA before explicitly continuing the original restore. This read never dispatches restore or authenticates current bytes.
3. Call `merchant_host_handoff_review` with the same host and manifest SHA. Inspect the full native receiving review: original source identity, every path, target availability, external-file bindings, operation directory and review SHA.
4. Keep the reviewed receiving producers stopped. Call `merchant_host_handoff_adopt` with the same manifest SHA, the returned `expectedReviewSha256`, and `quiesced:true`.
5. Read the original complete adoption result. After a missing response, call `merchant_host_handoff_operation` with the same host and review SHA. It reads original recorded progress; it does not dispatch a second adoption.
6. Use the existing original workspace opening/startup workflow only after the actual native adoption result permits it. Handoff adoption itself does not start a listener or replay completed transfers.

Restore and review are original native operations, not recorded-only reads. They may retain state. The provider does not automatically retry them after an uncertain response. Inspect the original selected paths/result and use the native engine's existing continuation rules. The cold-restore record distinguishes `ABSENT`, `PREPARED`, `STAGING`, `PUBLISHED` and `RECORDED_COMPLETE`, with `RECORDED_ONLY_NOT_FRESH_TREE_OR_NATIVE_VALIDATION`. Keep the same alias configuration and original manifest. A saved completion is not a fresh current-tree result. Aliases without `restoreOperationDirectory` keep legacy restore behavior and cannot use the restore-operation read. An unrelated final tree or legacy partial output is never claimed as a resumable operation.

## Agent tool contract

Every tool rejects additional arguments. Digests are lowercase 64-character hexadecimal SHA-256 values.

| Tool suffix after `merchant_host_handoff_` | Required arguments | Optional arguments | Effect |
| --- | --- | --- | --- |
| `hosts` | None | None | Read configured inventory. |
| `selection` | `host` | None | Read exact complete source selection. |
| `plan` | `host`, `expectedSelectionSha256`, `quiesced:true` | None | Create the original plan once. |
| `saved_plan` | `host` | `expectedPlanSha256` | Read original complete saved plan. |
| `export` | `host`, `expectedPlanSha256`, `quiesced:true` | None | Original capture/reconciliation. |
| `capture` | `host`, `expectedPlanSha256` | None | Read recorded capture evidence. |
| `restore` | `host`, `expectedManifestSha256` | None | Original authenticated restore and current-tree validation; original continuation when declared. |
| `restore_operation` | `host`, `expectedManifestSha256` | None | Read original recorded cold-restore progress/result; requires a declared restore operation. |
| `review` | `host`, `expectedManifestSha256` | None | Original receiving review. |
| `adopt` | `host`, `expectedManifestSha256`, `expectedReviewSha256`, `quiesced:true` | None | Original operation-backed adoption. |
| `operation` | `host`, `expectedReviewSha256` | None | Read recorded adoption progress/result. |

Only inventory, selection, saved plan, recorded capture, recorded cold restore and recorded adoption tools are marked read-only. All five tools that invoke native operations, including create-only plan creation, are not advertised as automatically retryable. Native errors keep their original code/message and a same-host readback suggestion where an original saved record exists.

## Close and recovery

The provider owns admission and its native-call lifetime. Closing stops new calls and shares one close promise across repeated close requests. It requests cancellation for an active operation-backed adoption or declared resumable cold restore. Every original call is then drained before provider shutdown completes. Legacy cold restore and other native operations can finish during close; do not describe them as cancelled because the agent disconnected.

After reconnecting, read the same saved plan, capture, cold-restore operation or adoption operation using the same host alias and original digest. Keep the complete native result and original operation directories. Do not replace a journal or generate a new operation ID to make a missing response look complete.

## Installed receiving check

Use the existing original host-handoff receiving operation and real source selection. Confirm that the maintained installed distribution includes this provider declaration, catalog, adapter, setup, types and guide, and that ordinary source-owned provider discovery lists the eleven tools. The installed source includes the original native restore operation and adjacent Linux publication helper.

Complete one original source selection → create-only plan → saved-plan readback → capture → recorded capture readback → complete binary transfer → cold restore → full receiving review → original adoption → recorded operation readback journey. Include loss of the initial plan response, the original cold restore's partial-member and publication-before-receipt interruption/reopen, and the existing adoption operation's supported interruption/reopen. Keep original source bytes, IDs, paths and full native results. Recheck dedicated operator and optional console custody against the actual roots.

Metadata/JavaScript execution with reference filesystem boundaries establishes the adapter contract only. Native execution must come from the actual original receiving course with its real filesystem, leases, Python publication helper and complete installed source. Actual rendered UI acceptance, where that existing course includes a browser, stays with the producing operator using the exact final interface and complete downloads.
