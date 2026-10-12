# Install the Fiscal Data analyst

Build the complete original source selection, install it with the maintained
runtime workflow, then commission its original Fiscal workspace. The named agent
and remote client use the existing JSON-only authenticated MCP transport and
need no MCP SDK or signing dependency for analyst operations.

## Build the selected archive

Use the original builder and a checkout containing the exact reviewed commit:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --ref ORIGINAL_COMMIT \
  --selection fiscaldata-analyst --out /absolute/fiscal-release
~~~

Retain the returned original archive path, size and SHA-256, full source manifest
and sourceSelection identity. If source acquisition or packaging is interrupted,
use that same output and its saved source:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/checkout --out /absolute/fiscal-release --resume
~~~

The original source-selection builder follows module imports. This recipe also
retains complete Fiscal browser/receiving sources, the original publisher and
runtime-loaded developer, source-workspace, operations, availability, support,
JSON-RPC, OGC and commerce assets. These are the original files; the analyst
product introduces no replacement publisher or transport.

The original runtime workspace's **Build a product** view can select the same
recipe and retain the same package through its existing build/recovery workflow.

## Prepare, install and inspect the runtime

The analyst profile uses the original operator runtime, with no native payer or
additional feature group:

~~~sh
node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs prepare \
  --dir /absolute/fiscal-runtime --archive /absolute/fiscal-release/ORIGINAL.tgz \
  --sha256 ORIGINAL_ARCHIVE_SHA256 --operator

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs install \
  --dir /absolute/fiscal-runtime

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs inspect \
  --dir /absolute/fiscal-runtime --load --source

node stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs run \
  --dir /absolute/fiscal-runtime -- registrations
~~~

Require the actual READY inspection, source commit/manifest and selected profile.
Use the returned runtime launch path for the original starforge commands; do not
substitute another checkout after review. Original dependency-cache, installer
lease, partial publication and recover commands retain their existing behavior.

A separately selected native publisher/buyer profile can include the original
native dependencies through the same installer. Adding those dependencies does
not authorize a purchase. The analyst commissioning works without a payer.

## Included operating surface

| Entry | Original capability |
| --- | --- |
| fiscaldata | Browser, source/model actions, worker, complete file export, checkpoint and receiving |
| fiscaldata-agent | Source/connection/workspace binding, one named adapter, authenticated MCP and borrowed browser |
| fiscaldata-remote | Complete typed actions, refresh controls, file selection, interrupted download and independent receive/reopen |
| fiscaldata-briefing | Original full offline report and source handover |
| Applications → Fiscal Data operations | Existing managed review, Start/Open/Stop and same-workspace reopen |
| Named package exports | Original model/server/source/portable/refresh/briefing, MCP adapter, typed client/download/operations and agent |

The source archive carries every selected contribution. Registration inspection
shows fiscaldata, fiscaldata-briefing, fiscaldata-refresh, fiscaldata-remote-client
and fiscaldata-agent. A source archive alone is not a READY runtime.

## Open the commissioned workspace

Follow the complete [operating guide](../../../../products/fiscaldata-analyst/OPERATING.md)
to initialize or receive a workspace, configure the named operator and private
source-package directory, inspect its binding and start the original host.

For installed Applications, register this exact READY runtime in the original
Runtime workspace and use its existing Fiscal Data operations entry. Keep its
workspace private and separate from installation source.

Use the [commissioning guide](../../../../products/fiscaldata-analyst/COMMISSIONING.md)
to agree period, measures, source meaning, review roles and acceptance. Use the
[receiving guide](../../../../products/fiscaldata-analyst/RECEIVING.md) to deliver
and reopen the complete source workspace and every original file.

## Same-operation recovery

An original build or install has its own retained source, output and request.
Resume that operation with its saved selection. The analyst source workspace
has separate original capture, refresh, report and portable operation IDs.
Do not use a new build ID to mask an interrupted source request, or a new source
capture to mask an incomplete file transfer.

The full toolkit also receives these same source-owned registrations. This
selection provides a coherent analyst installation while preserving the exact
original module bodies and interfaces.
