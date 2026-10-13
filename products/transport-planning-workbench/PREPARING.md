# Prepare the Transportation Planning Workbench

This preparation command receives the complete original application into private custody, records the actual Python and Node executables, and checks both independently copied applications against one exact source authority. It does not initialize a planning workspace, run an analysis, start an HTTP listener, alter a saved project, or dispatch a second receiving programme.

Use the selected application's existing operator and receiving owner for the subsequent working-state and browser course. Preparation supplies that owner with the real paths and complete files needed to operate the original application.

## What the preparation produces

The command retains:

- The complete literal source authority and every file named by the original application's `delivery.py` `SOURCE_FILES` declaration.
- Separate `primary/source/` and `receiving/source/` directories containing the same exact original files.
- The actual CPython executable, version, platform, ABI and selected standard-library file identities.
- The actual Node executable, complete version/platform/architecture observation and closed command receipt.
- Independent Python imports of each copy's original workspace, operations, intake, exports, delivery, server and command module.
- Independent imports of each copy's original Node evaluator, confirming its two declared callable exports without executing a planning calculation.
- Full command arguments, complete stdout/stderr, actual child completion and source identities for those observations.
- One immutable request and one complete `PREPARED.json` result, with explicit recovery of interrupted private copies and complete export candidates.
- An optional private source-transfer ZIP containing all original source bytes, the literal authority and the full originating runtime/import observations.

The two source copies do not share a live workspace. The receiving course chooses its own separate original working-state destination and preserves the original native archive and command journal.

## Host requirements and source custody

Use an organization-controlled Linux host with CPython 3.12 or later and Node.js 18 or later. The selected original application has no third-party Python or npm dependencies. This command does not install an alternative engine, create a virtual environment, download a new interpreter, or relocate an existing runtime.

Choose the actual absolute Node binary path, with symlinks resolved. The Python path is an explicit absolute invocation of the interpreter that runs the helper; its resolved binary is recorded separately. Both executables must remain available and unchanged for replay and inspection of this preparation. A different recipient machine performs a new independent receiving preparation with its own explicitly selected compatible interpreters.

Private source and commercial documents stay in their authorized private location. The public product contains generic preparation and operating adapters. It does not contain the privately supplied application, customer data, donor identifiers or commercial documents. The full source authority is a private input, not an automatically discovered download.

Keep these directories distinct:

| Selection | Purpose |
|---|---|
| Installed public Merchant runtime | Generic adapters, command dispatcher and this helper |
| Original private source directory | Complete supplied application, unchanged |
| Private preparation directory | Frozen request, runtime observations, two exact source copies and recovery records |
| Original live workspace directory | Created or received by the original operating course, outside the source copies |
| Private portable output directory | Complete source-transfer ZIP and any separately retained native application/workspace handovers |

Create the parent of the private preparation directory before selecting it. The helper creates its own final directory with mode 0700, then requires owned ordinary directories and private files for its records. It rejects symlinked or overlapping preparation/public-source paths. Source files may use their original readable modes; the private received copies use ordinary files with mode 0600.

## Exact private source authority

Supply one UTF-8 JSON file with exactly this shape:

~~~json
{
  "schema": "stellar-forge.transport-planning-workbench-source.v1",
  "files": [
    {
      "path": "relative/application/member",
      "bytes": 1234,
      "sha256": "64-lowercase-hexadecimal-characters"
    }
  ]
}
~~~

The example is a shape illustration, not an executable source manifest. Each row must describe the complete actual member. The original `SOURCE_FILES` declaration supplies the full required population. The current application selection has 24 members; the wrapper validates the actual declared set rather than silently truncating to that count.

The authority must include the original source manifest, licence, programme evaluator, metric definitions, delivered rule catalogue, operator guide, public source catalogues, original workflow and every other declared file. Preserve each original file's full bytes. Do not replace the original application manifest with this external authority; they serve different purposes.

The wrapper rejects missing, repeated, undeclared, linked or changed source members. It ignores generated `__pycache__` directory content during an existing source inventory, but invokes imports with isolated Python and bytecode writing disabled. The complete selected original source is limited to 32 MiB, with at most 25,000 declared files. The source transfer has a separate 48 MiB capacity for those source files and complete metadata. These are source-intake limits; they do not reduce the original application's separate CSV, project or business-archive contracts.

Measure the literal external authority SHA-256 before passing it. The request binds that exact file and digest. A receiving source transfer can retain a supplied authority with a different row order only when its complete path-to-byte-identity map equals the embedded authority; it preserves the supplied literal authority rather than rewriting it.

## Prepare from the complete original source

Through the installed command dispatcher:

~~~sh
transport-planning-workbench-prepare prepare \
  --directory /absolute/private/preparation \
  --python /absolute/selected/python3 \
  --node /absolute/canonical/node \
  --source /absolute/private/original-application \
  --source-manifest /absolute/private/SOURCE.json \
  --source-manifest-sha256 COMPLETE_AUTHORITY_SHA256
~~~

Or invoke this exact installed module with the existing Node runtime:

~~~sh
/absolute/canonical/node \
  /absolute/merchant-runtime/products/transport-planning-workbench/prepare.mjs \
  prepare \
  --directory /absolute/private/preparation \
  --python /absolute/selected/python3 \
  --node /absolute/canonical/node \
  --source /absolute/private/original-application \
  --source-manifest /absolute/private/SOURCE.json \
  --source-manifest-sha256 COMPLETE_AUTHORITY_SHA256
~~~

Replace every placeholder with the actual selected value. Keep the original source and authority outside the preparation directory. The helper verifies the complete source before copying, verifies every copied member, checks the declared population, and rechecks the selected source after imports.

The Node wrapper uses the chosen Python with `-I -B`. Child environments remove inherited Python import overrides and Node `NODE_OPTIONS`/`NODE_PATH`. The original Node evaluator is imported by its full selected file URL. Neither observation instantiates the original `Workspace`, `Operations` or server.

## Inspect the complete preparation

~~~sh
transport-planning-workbench-prepare inspect \
  --directory /absolute/private/preparation \
  --python /absolute/selected/python3 \
  --node /absolute/canonical/node
~~~

Inspection reopens the original result and request, verifies the helper and both executable identities, checks all selected source bytes in both copies, and validates the complete saved successful import receipts and logs. It rejects an altered executable, changed source, missing receipt, changed authority, different invocation or another helper version.

Inspection returns an envelope:

~~~json
{
  "schema": "stellar-forge.transport-planning-preparation.v1",
  "state": "READY",
  "result": {
    "schema": "stellar-forge.transport-planning-preparation.v1",
    "state": "READY"
  },
  "verifiedAt": "actual-UTC-time"
}
~~~

The illustration omits fields only for readability. The actual `result` is the complete original saved result; it is never a summarized replacement.

## Result fields used by Applications and the agent setup

The complete result is saved at:

~~~text
/absolute/private/preparation/.preparation/PREPARED.json
~~~

Its top-level fields include `schema`, `state`, `directory`, `resultPath`, the full request descriptor, `source`, `runtime`, `origin`, `packageImports`, `primary`, `receiving` and the actual completion time.

Both `primary` and `receiving` have exactly these fields:

~~~json
{
  "applicationDirectory": "/absolute/private/preparation/primary/source",
  "sourceManifestFile": "/absolute/private/preparation/.preparation/SOURCE.json",
  "sourceManifestSha256": "actual-literal-authority-sha256",
  "python": "/absolute/selected/python3",
  "node": "/absolute/canonical/node"
}
~~~

The receiving copy uses `receiving/source`. Use the returned values verbatim. There is no separate `runtimeReadyFile` or relocated virtual environment.

The source summary is:

~~~json
{
  "manifestSha256": "actual-literal-authority-sha256",
  "files": 24,
  "bytes": 219947
}
~~~

Those counts describe the currently selected source version, not a hard-coded replacement for the manifest. A legitimate complete successor has its own measured values.

`runtime.python` contains the actual executable invocation, resolved binary descriptor, version, implementation, platform, architecture, cache tag, ABI and selected standard-library identities. `runtime.node` contains the actual canonical executable, full binary descriptor, actual version/platform observation and the complete closed command/log bytes that produced it.

`packageImports.primary` and `packageImports.receiving` each contain separate `python` and `node` observations. Each retains the full successful original command receipt and parsed result. Export additionally carries literal receipt/stdout/stderr content, so another recipient can inspect the originating observation without access to the sender's filesystem.

## Connect the prepared application to the maintained operator

Configure the installed Applications provider using the actual returned `applicationDirectory`, `sourceManifestFile`, `sourceManifestSha256`, `python` and `node`, plus the independently selected private workspace, connection file and original named actor.

The maintained managed launcher binds `TRANSPORT_NODE` to the selected actual executable. The original `Operations.engine` remains the sole evaluator entry point for actual services and metrics. Retain the original request IDs, working-state database, source revisions and application receipt when reconnecting.

The agent setup is provided by `initializeTransportPlanningMerchant({directory,connection,name})`. Its `connection` argument is the path to the complete private host-alias declaration, for example `/absolute/private/transport-host.json`. Each alias in that declaration points to an actual managed connection file. It is not the live connection file itself.

~~~json
{
  "schema": "stellar-forge.transport-planning-host.v1",
  "workspaces": {
    "planning": {
      "directory": "/absolute/private/transport-workspace",
      "connectionFile": "/absolute/private/connections/transport.json",
      "inputs": {},
      "destinations": {}
    }
  }
}
~~~

Use the actual selected workspace and managed connection paths in this private declaration. Add complete immutable input descriptors and explicit fresh receiving destinations when that operator journey needs them. Setup writes the Merchant configuration with `transportPlanningConnection` pointing to this declaration; it does not copy the private original source or authentication material into public configuration. The manager reads the declaration through `readTransportPlanningConfiguration`; its `MerchantTransportPlanningWorkspaces` instance uses the same declared aliases, complete input descriptors, retained requests/files and explicit destination aliases.

The Installation profile and operating guide select this same preparation command, original CLI, Applications provider, source authority and complete receiving route. Do not create a parallel controller or reinitialize a completed native case merely to obtain a new preparation receipt.

For a fresh authorized workspace, use the existing original initialization command through the maintained CLI. For an existing project, receive its complete original working-state/application handover and reopen the returned workspace identity. The source-transfer ZIP below is not a native working-state archive.

## Export the complete private source transfer

~~~sh
transport-planning-workbench-prepare export \
  --directory /absolute/private/preparation \
  --python /absolute/selected/python3 \
  --node /absolute/canonical/node \
  --output /absolute/private/outgoing/transport-source.zip
~~~

The output directory must already be private and owned. The output must stay outside the preparation and installed public runtime.

The ZIP contains:

- `SOURCE.json`: the complete literal selected external authority.
- `source/<original path>`: every original source member, unchanged.
- `runtime-observation.json`: complete original Python/Node and both application-import observations, including literal command and log content.
- `TRANSFER.json`: the complete exact member inventory, schema and source-authority digest.

The transfer schema is `stellar-forge.transport-planning-source-transfer.v1`. The export writes a persistent candidate, closes and fsyncs it, verifies every member and descriptor, then publishes the same complete candidate. A partial candidate is preserved with an interrupted identity before a new attempt. An already closed original output is reopened and verified rather than overwritten.

The result has `state: "EXPORTED"`, `portable: {path,bytes,sha256}` and the exact selected source summary. Retain the full result with the ZIP. This transfers source and runtime observations; it does not package system interpreter binaries or assert that the recipient already has them.

## Independent receiving on another private host

Choose the recipient's actual Linux CPython 3.12+ and canonical Node.js 18+ executables. Transfer the full ZIP without changing its bytes, then use its exact returned digest:

~~~sh
transport-planning-workbench-prepare receive \
  --directory /absolute/private/recipient-preparation \
  --python /absolute/recipient/python3 \
  --node /absolute/recipient/node \
  --archive /absolute/private/incoming/transport-source.zip \
  --archive-sha256 COMPLETE_TRANSFER_SHA256
~~~

If a separately approved original source authority accompanies it, add both:

~~~sh
  --source-manifest /absolute/private/incoming/SOURCE.json \
  --source-manifest-sha256 COMPLETE_AUTHORITY_SHA256
~~~

The helper validates the whole transfer inventory and originating runtime/import observations, extracts only complete ordinary declared source members, creates independent primary and receiving source copies, and performs its own actual local Python and Node imports.

The recipient keeps the originating observations as origin evidence. Its own returned paths, executable identities, import receipts and preparation request are newly observed on that selected host. They do not replace or pretend to be the sender's observations.

Inspect the received preparation with the same recipient `--directory`, `--python` and `--node`. Export from it only when the selected original source and both local runtime observations reopen successfully.

The original application's complete native delivery or workspace-recovery ZIP remains a separately selected artifact. Receive that through the maintained original application/CLI route under its original writer lifetime, then inspect the actual restored source/record/command/report populations. Never pass a preparation source-transfer ZIP to the native workspace receiver or treat a business archive as a source-transfer ZIP.

## Interruption, replay and Stop

For an incomplete source or archive preparation, repeat the same command and every same selected input with `--resume`. The existing request binds the source/archive, authority, helper, Python and Node identities. A changed selection must not be disguised as a resume.

The preparation owns `.preparation/lifetime.lock` throughout source custody, actual child inspection, receipt publication and final result. The actual child inherits the same lock descriptor. Signal handling retains that ownership until the child has really closed. The Node wrapper waits for the Python child's close event even when a spawn/stream error has been observed.

Every import attempt retains its own full log and command record. A failed import is not a prepared application. A later explicit continuation preserves that attempt and executes only the still-uncompleted source inspection. Completed inspection results reopen their original receipt and logs. Source copies are verified rather than silently overwritten.

Incomplete copy candidates remain under `.preparation/copy-candidates` with their target, complete selected identity and interrupted bytes. They do not contaminate either immutable source inventory. A complete renamed source directory is reconciled by its full declared inventory.

The final result uses the original complete candidate and timestamp. If publication is interrupted after that candidate is saved, continuation verifies the same source/runtime observations and republishes the same result. Preserve failed or interrupted output rather than deleting it to force a new apparent success.

If the helper or executable changed, inspect the concrete difference and retain the existing preparation evidence. An authorized new source/runtime selection uses a new explicitly chosen preparation directory; the original workspace and native receiving operation are not automatically replaced.

## JavaScript API

~~~js
import {
  prepareTransportPlanningRuntime,
  receiveTransportPlanningRuntime,
  inspectTransportPlanningPreparation,
  exportTransportPlanningRuntime,
} from './prepare.mjs';

const prepared = await prepareTransportPlanningRuntime({
  directory: '/absolute/private/preparation',
  python: '/absolute/selected/python3',
  node: '/absolute/canonical/node',
  source: '/absolute/private/original-application',
  'source-manifest': '/absolute/private/SOURCE.json',
  'source-manifest-sha256': authoritySha256,
  resume: true,
  signal,
});

const reopened = await inspectTransportPlanningPreparation({
  directory: prepared.directory,
  python: prepared.primary.python,
  node: prepared.primary.node,
  signal,
});

const transfer = await exportTransportPlanningRuntime({
  directory: prepared.directory,
  python: prepared.primary.python,
  node: prepared.primary.node,
  output: '/absolute/private/outgoing/transport-source.zip',
  signal,
});

const recipient = await receiveTransportPlanningRuntime({
  directory: '/absolute/private/recipient-preparation',
  python: '/absolute/recipient/python3',
  node: '/absolute/recipient/node',
  archive: transfer.portable.path,
  'archive-sha256': transfer.portable.sha256,
  resume: true,
  signal,
});
~~~

The hyphenated option names are intentional and match the actual command-line interface. `inspectTransportPlanningPreparation` returns the envelope with `result`; the other preparing/receiving functions return the full result directly. Every action supports the selected AbortSignal and retains the actual child close before returning.

## Complete installed receiving and outgoing inspection

Continue the existing original equipped receiving operation with the exact prepared source, current public adapters and original working-state result. The practical course must operate the original source intake and correction, service/rule comparison, full metrics, scenario/action/report workflow, complete exports and independent receiving. Preserve original example/teaching data as such; do not invent observed journeys or promote missing coverage to zero.

Read the actual installed receiving guide and retain the complete native result, source authority, working-state archive, agent response/file populations, browser downloads, desktop/narrow captures and complete onward handover. Inspect the actual returned screens and every outgoing attachment. A source preparation result alone does not establish the application's rendered state or a customer's acceptance.

The following complete owner instruction applies to this work and any delegated receiving owner:

This applies to every current, future, resumed and delegated worker, across providers and local or cloud runtimes. Before calling any customer/prospect-facing application, website, dashboard, demo, report, presentation or export ready, open/run/render the exact outgoing version, look at the rendered screen or its actual screenshots, and operate the important user controls. Inspect the actual screenshare width and narrow/mobile width where relevant, populated/empty/loading/error states, downloads/exports and reopening. Capturing screenshots without viewing them is insufficient. Code review, DOM counts, HTTP 200, unit checks and another worker's approval do not replace seeing the actual product.

Fix broken, unstyled, cramped, clipped, overflowing or unreadable output within the authorized work before presenting it. Use plain industrial software design: readable tables, clear hierarchy, consistent typography and spacing, restrained controls, useful labels and responsive layouts. Preserve real workflows, source data and computations. Inspection must lead directly to repairs and must not replace implementation/integration or become repeated checking. Keep validation focused on the actual remaining risk; do not run broad suites or build a verification product.

Include this complete instruction in delegated assignments and the active owner-controlled policy, boot, build and receiving guidance those workers actually read. Preserve all other owner controls and original operation identities. Leave historical records and third-party/vendor policies intact. Do not force restarts, create watchers or revive owner-stopped work. When a runtime is unavailable, join the existing equipped receiver with the complete exact version and opening steps, review its actual rendered result, and continue independent implementation while it runs.

The current owner addition includes every attachment: inspect complete ZIP contents and all PDF pages, not just the main application screen. New videos require natural generative speech and actual watching/listening. Customer-specific source stays in authorized private custody. Any positive human reply goes to Bryce; every subsequent external message and its exact attachments require his individual approval. Preparation and internal engineering continue under the existing product owner.

The next accountable output is the complete operated original workspace and its independently reopened handover, using the exact source and runtime paths retained in this preparation.
