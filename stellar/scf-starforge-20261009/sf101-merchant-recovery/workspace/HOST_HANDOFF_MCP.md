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

A partial group is rejected. A receiving declaration may also select an absolute `python` executable. The source and receiving operation directories are distinct original operations. Keep original directories and IDs when reconnecting; do not create replacements to recover a missing response.

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
2. Call `merchant_host_handoff_restore` with the receiving `host` and `expectedManifestSha256`. It invokes the original restore into the fixed private staging directory.
3. Call `merchant_host_handoff_review` with the same host and manifest SHA. Inspect the full native receiving review: original source identity, every path, target availability, external-file bindings, operation directory and review SHA.
4. Keep the reviewed receiving producers stopped. Call `merchant_host_handoff_adopt` with the same manifest SHA, the returned `expectedReviewSha256`, and `quiesced:true`.
5. Read the original complete adoption result. After a missing response, call `merchant_host_handoff_operation` with the same host and review SHA. It reads original recorded progress; it does not dispatch a second adoption.
6. Use the existing original workspace opening/startup workflow only after the actual native adoption result permits it. Handoff adoption itself does not start a listener or replay completed transfers.

Restore and review are original native operations, not recorded-only reads. They may retain state. The provider does not automatically retry them after an uncertain response. Inspect the original selected paths/result and use the native engine's existing continuation rules.

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
| `restore` | `host`, `expectedManifestSha256` | None | Original authenticated restore. |
| `review` | `host`, `expectedManifestSha256` | None | Original receiving review. |
| `adopt` | `host`, `expectedManifestSha256`, `expectedReviewSha256`, `quiesced:true` | None | Original operation-backed adoption. |
| `operation` | `host`, `expectedReviewSha256` | None | Read recorded adoption progress/result. |

Only inventory, selection, saved plan, recorded capture and recorded operation tools are marked read-only. All five tools that invoke native operations, including create-only plan creation, are not advertised as automatically retryable. Native errors keep their original code/message and a same-host readback suggestion where an original saved record exists.

## Close and recovery

The provider owns admission and its native-call lifetime. Closing stops new calls and shares one close promise across repeated close requests. It requests cancellation for an active operation-backed adoption only. Every original call is then drained before provider shutdown completes. Other native operations can finish during close; do not describe them as cancelled because the agent disconnected.

After reconnecting, read the same saved plan, capture or adoption operation using the same host alias and original digest. Keep the complete native result and original operation directories. Do not replace a journal or generate a new operation ID to make a missing response look complete.

## Installed receiving check

Use the existing original host-handoff receiving operation and real source selection. Confirm that the maintained installed distribution includes this provider declaration, catalog, adapter, setup, types and guide, and that ordinary source-owned provider discovery lists the ten tools.

Complete one original source selection → create-only plan → saved-plan readback → capture → recorded capture readback → complete binary transfer → cold restore → full receiving review → original adoption → recorded operation readback journey. Include loss of the initial plan response and the existing operation's supported interruption/reopen. Keep original source bytes, IDs, paths and full native results. Recheck dedicated operator and optional console custody against the actual roots.

Metadata/JavaScript execution with reference filesystem boundaries establishes the adapter contract only. Native execution must come from the actual original receiving course with its real filesystem, leases, Python publication helper and complete installed source. Actual rendered UI acceptance, where that existing course includes a browser, stays with the producing operator using the exact final interface and complete downloads.
