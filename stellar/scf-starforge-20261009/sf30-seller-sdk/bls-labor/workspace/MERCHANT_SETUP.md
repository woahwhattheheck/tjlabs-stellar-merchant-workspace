# Register the existing BLS analyst workspace for customer-agent tools

The complete installed BLS labor product declares the source-owned
`bls-analyst-workspaces` provider. It joins the same saved analyst workspace used
by Applications. The older BLS dataset publisher provider keeps its own original
configuration, candidate review and customer delivery operations.

## Select the original private source

Create an operator-owned private JSON connection file using
`stellar-forge.bls-analyst-connection.v1`. Every workspace entry selects an
already-existing BLS workspace directory. Use `managed` to attach through its
existing `bls.connection.json`; use `owned` only when this merchant is to launch
and own that same product through its maintained `cli.py`.

```json
{
  "schema": "stellar-forge.bls-analyst-connection.v1",
  "workspaces": {
    "nek": {
      "label": "Original Northeast Kingdom analysis",
      "directory": "/private/bls/nek",
      "mode": "managed",
      "files": {
        "original-edition": "/private/bls/inputs/original-nek.zip"
      },
      "destinations": {
        "received-project": "/private/bls/receiving/nek"
      }
    }
  }
}
```

These paths are commissioning examples: select the actual existing workspace,
complete retained source file and intended receiving destination. Optional
`pythonExecutable` chooses the maintained Python executable for owned mode.
File aliases are private source selections; destination aliases permit only
their configured complete receiving paths. The original receiving engine
requires an absent destination or the exact resumable original receiving
operation. This configuration does not authorize replacing another project.

## Initialize or reopen the same merchant host

Keep the connection file private and place the new merchant directory beneath
an existing canonical private directory. Use the common host's source-owned
initializer:

```javascript
import {initializeMerchantProvider}
  from './stellar-forge/mcp-merchant-operator/providers.mjs';

const result = await initializeMerchantProvider('bls-analyst-workspaces', {
  directory: '/private/bls-analyst-merchant',
  connection: '/private/bls-analyst-workspaces.json',
  name: 'Original regional labor service'
});
```

Use the returned `merchant-mcp.json` with the existing MCP host launcher.
The initializer validates the complete installed BLS analyst contribution,
retains the exact connection-file identity and creates only its own merchant
release store and private customer-export directory. It does not create or
initialize a BLS workspace, acquire a dataset, launch the analyst process, or
publish an official edition.

To reuse an existing complete release store, pass `releaseStore` with its
actual private path. Setup validates and preserves that store. Repeating the
same original setup completes an interrupted attempt or reopens the completed
configuration. The existing complete merchant configuration remains
byte-identical, including other provider families and its export directory.
Different original connection bytes, an explicitly different name or release
store require a deliberately selected new setup directory. Existing input,
configuration and release history are retained.

The setup uses the original state lease and private staged writes. Only its
own unchanged empty release-store initialization can be promoted after an
interruption. An explicit store must already exist; it is never recreated.

## Continue the actual analyst and customer journey

Open the configured alias and retain its returned instance identity. Read the
original saved edition and source inventory, continue county/regional analyses
and their explicit definitions, and save commentary or revised reports using
actual request IDs and expected revisions. Browser and agent continue the same
project. Inspect the retained original operation after an uncertain response
before issuing a retry.

Keep the original NEK source's 408 LAUS and 96 QCEW observations and all seven
county/change reports within that same project. Regional outputs preserve
source membership, component calculations, matching-period coverage and
complete history. This interface does not change their formulas or invent a
new edition. Use the exact original receiving programme for new source data.

Retain and fully read each selected customer file, checking its byte count and
SHA256. Resume by its original file identity and offset; reader handles are
temporary across a restart. Receive the whole editable project at the
configured destination and reopen its original sources, definitions, analyst
notes and report revisions alongside JSON/CSV/HTML/analysis ZIP outputs.

The provider owns its serialization, accepted calls and retained readers.
`merchant_bls_analyst_stop` and `merchant_bls_analyst_close` may enter the
provider's explicit concurrent control path. Stop requires the exact saved
native-receive operation ID. In either managed or owned attachment, the original
server and native lock verify ownership of the live receiving subprocess before
sending SIGTERM to that process group. Its saved state remains resumable. Stop
does not terminate Applications or cancel unrelated source captures.
Managed close detaches from the existing Applications process; owned close
drains the listener process it actually owns. A restarted Applications listener
requires a newly opened instance.
The existing dataset publisher and SF88/Vitality customer operations remain
separately selected and unchanged.
