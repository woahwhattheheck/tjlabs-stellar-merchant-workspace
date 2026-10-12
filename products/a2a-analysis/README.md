# A2A analytical services and merchant delivery

Operate an original analytical workspace, expose selected saved queries and reports through A2A, and deliver the complete resulting files through the merchant workspace. One source-selected product contains the Python application, analytical agent, merchant browser, SDK client, original seller/release integration and customer receiving tools.

The workflow starts with the operator's retained source editions and saved procedures. An A2A caller can discover its permitted procedures, start a query or report, follow the original task and receive every output file. The merchant operator reviews that result, freezes an edition, prepares the existing seller's terms and delivers a portable customer result. Saved work and original task IDs remain available across reopening.

## Install one complete product

Select **a2a-analysis** from one immutable commit of this repository:

~~~sh
node stellar/scf-starforge-20261009/distribution/build.mjs \
  --repo /absolute/merchant-checkout \
  --ref ORIGINAL_COMMIT \
  --selection a2a-analysis \
  --out /private/a2a-release
~~~

The completed build returns the actual archive path and SHA-256. Install those returned bytes with the original runtime installer:

~~~sh
node products/a2a-analysis/cli.mjs runtime prepare \
  --dir /private/a2a-runtime \
  --archive /private/a2a-release/RETURNED_ARCHIVE.tgz \
  --sha256 RETURNED_ARCHIVE_SHA256 \
  --feature a2a --feature a2a-analysis --operator

node products/a2a-analysis/cli.mjs runtime install --dir /private/a2a-runtime
node products/a2a-analysis/cli.mjs runtime inspect \
  --dir /private/a2a-runtime --load --source
~~~

Use Linux, Node 24 or newer, Python 3.11 or newer, npm and flock. The selected SQLite binding may use its original prebuilt binary or a matching local compiler/Node-header toolchain. The installer puts the selected source at `RUNTIME/package/source` and one dependency tree at `RUNTIME/node_modules`. Both the merchant and analytical agent resolve from that same installation.

The [operating guide](OPERATING.md) covers installation, source preparation, procedure capture, service operation, merchant publication and upgrades. The [receiving guide](RECEIVING.md) covers complete task files, result packets, editable merchant workspaces and original analytical workspace restore.

## Product commands

Use the installed original dispatcher:

~~~sh
starforge runtime-install run --dir /private/a2a-runtime -- a2a-product --help
~~~

| Component | Command after `a2a-product` | Work |
| --- | --- | --- |
| Installation | `runtime` | Prepare, install, inspect, resume, upgrade and recover the original runtime |
| Analytical workspace | `workspace` | Open the original Python browser, register retained sources, inspect state and export the workspace |
| Analytical workspace receiving | `archive` | Inspect and receive a complete original workspace ZIP |
| Analytical A2A service | `agent` | Capture saved query/report revisions, initialize the SDK store, inspect selections and serve |
| Merchant Agent workspace | `merchant` | Operate agents/tasks/results, create publications, stage releases and receive editable work |
| Standalone A2A customer | `receive` | Discover procedures, run, read, resume and cancel original tasks; retain their complete files |

Each component keeps its original command contract. Append `--help` to read it. The Python entries select the source and Node executable of this same product; `A2A_ANALYSIS_PYTHON` selects the Python executable.

## Runtime and source ownership

| Capability | Original implementation |
| --- | --- |
| A2A wire protocol and task persistence | [A2A JavaScript SDK 1.3.0](https://github.com/a2aproject/a2a-js/tree/29417a5bb4038f804f310ce4fffd267a9375aa90) |
| Source editions, SQL, reports and files | [Analysis Workspace](../../stellar/scf-starforge-20261009/sf88-operator-buyer-cli/python/WORKSPACE.md) |
| A2A analytical service | [Native analytical agent](../../stellar-forge/a2a-analysis-agent/README.md) |
| Agent/task/result browser and SDK | [Merchant Agent workspace](../../stellar/scf-starforge-20261009/sf30-seller-sdk/a2a/OPERATOR.md) |
| Fixed result publication and activation | Original SF30 seller and SF82 release engine |
| Installation and dependencies | [Maintained runtime installer](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) |

The package includes both runtime features, the full original analytical Python package, browser sources, native commissioning entry points, systemd and explicitly selected Nginx deployment configuration. Its source selection and original file identities travel through build, installation and recovery.
