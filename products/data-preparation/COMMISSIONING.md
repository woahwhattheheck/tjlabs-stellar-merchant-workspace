# Commission a complete saved SQL pipeline

A customer selects an original pipeline project and its saved edition, reviews the complete SQL and source bindings, then purchases its execution through the existing Jobs checkout. The result contains the complete HTML report, execution record and independently editable pipeline project. A successful execution also includes the complete selected result files.

The original Jobs service owns sealed input receiving, native purchase, settlement association, worker execution, cancellation and result publication. The original preparation engine owns every source, SQL recipe, stage attempt, result and review.

## Install the complete selected product

Select the maintained recipe **stellar/scf-starforge-20261009/distribution/selections/data-preparation-jobs.json**. It combines the original preparation Applications workspace and its 40 typed merchant tools with the complete paid Jobs, Request workspace, Buyer, named outputs and payment runtime.

The contribution registers the installed command **pipeline-jobs** and the typed exports **stellar-forge/seller/data-preparation/jobs** and **stellar-forge/seller/data-preparation/jobs/customer**.

Use the [source-selection guide](../../stellar/scf-starforge-20261009/distribution/SOURCE_SELECTIONS.md) to build the selected archive, then the [runtime installer](../../stellar/scf-starforge-20261009/distribution/RUNTIME_INSTALL.md) to prepare/install that exact archive and SHA-256. Select **--native --feature schema --operator**; add the release's MCP feature for merchant agent operation. The archive includes this complete Jobs directory, the original preparation/pipelines source and the original paid Jobs source.

Run on Linux with Python 3.11 or newer and a Node version meeting the installed release's dependencies; the maintained client requires Node 22.16 or newer. Native SQL uses the original Python standard-library engine. The original Jobs install guide covers payment dependencies and flock.

Bind commands to the actual READY installation. The private installer does not add a global command to PATH:

~~~sh
PIPELINE_RUNTIME=/srv/starforge/runtimes/pipeline-jobs
PIPELINE_SOURCE="$PIPELINE_RUNTIME/package/source"

starforge() {
  node "$PIPELINE_SOURCE/stellar/scf-starforge-20261009/distribution/runtime-install-cli.mjs" \
    run --dir "$PIPELINE_RUNTIME" -- "$@"
}

starforge pipeline-jobs --help
starforge data-pipelines --help
starforge jobs --help
starforge jobs-buyer --help
~~~

Use the installation's returned sourceRoot if different. Keep the complete selected source and dependencies together; the deployed application selects that immutable release until the operator adopts another one.

## Configure the actual merchant

Use the existing configured HTTPS public origin and actual payment option supported by its native runtime. Save that payment declaration as a private JSON file. Its fields are the original scheme, network, asset, payTo, amount, maxTimeoutSeconds and any required extra options. Configuration compiles this exact option through the original Jobs compiler.

~~~sh
starforge pipeline-jobs configure \
  --directory /srv/starforge/applications/pipeline-execution \
  --origin https://YOUR_CONFIGURED_MERCHANT_ORIGIN \
  --payment /srv/starforge/config/pipeline-payment.json \
  --python /absolute/path/to/python3
~~~

The new directory contains merchant.json and runtime.json. Configuration is create-only. It selects the installed application module, the executePipeline function at /preparation-pipeline, its original Request intake, one worker, and the declared Python/native temporary-root environment variables.

The default function timeout is ten minutes. The **--timeout-ms** option selects another original Jobs timeout, up to its one-hour limit. **--input-storage-bytes** selects the existing sealed-file storage allowance. Size the host for its actual expanded project, complete exports and in-memory package buffers.

The service wrapper loads the saved Python path, then invokes the original Jobs service:

~~~sh
starforge pipeline-jobs service \
  --directory /srv/starforge/applications/pipeline-execution -- \
  serve \
  --state /srv/starforge/workspaces/pipeline-execution \
  --seller-port 8423 \
  --customer-port 8477 \
  --operator-port 8478 \
  --operations-port 8479 \
  --native-factory /absolute/path/to/the-existing/native-factory.mjs \
  --start-worker
~~~

Use the actual existing native factory and facilitator configuration. The returned private operator URL exposes the original Jobs, input receiving and worker controls.

Route the exact public HTTPS origin's paid /preparation-pipeline path to the seller listener, and /jobs/ID plus /jobs/ID/result to the customer listener. Preserve the original method, headers, body and response. The [paid Jobs installation guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/jobs/INSTALL.md) covers routing and account/runtime setup.

Applications manages the same original paid-jobs provider with the generated merchant configuration and stable state directory. Supply SF30_PREPARATION_PYTHON to the Applications process from the saved runtime record before Review and Start. The configured allowlist carries it into the worker. If selected, SF30_JOB_TEMP must name a private existing directory; otherwise the original host selects its normal private root. One owner opens each merchant state directory.

## Freeze the customer's saved selection

Open the customer's actual preparation workspace using the [operating guide](OPERATING.md). Retain the original files, save the pipeline and inspect its complete SQL, parameters, named input bindings, stage order and outputs. Export the complete project through Handover or the original data-pipelines command, retaining its returned digest.

~~~sh
starforge pipeline-jobs prepare \
  --project /srv/customer/originals/period-project.zip \
  --sha256 COMPLETE_ORIGINAL_PROJECT_SHA256 \
  --directory /srv/customer/orders/period-01 \
  --pipeline ORIGINAL_SAVED_PIPELINE_ID \
  --revision 3 \
  --report "Period 01 account reconciliation" \
  --python /absolute/path/to/python3
~~~

The command receives and verifies the project in a private temporary workspace and writes the complete prepared order.

| File | Purpose |
| --- | --- |
| project.zip | Exact original archive selected by its complete byte count and SHA-256. |
| selection.json | Complete saved definition, parameters, source editions and optional retained reuse selection. |
| input.json | Ordinary Jobs request: customer report name and complete selection file digest. |
| review.html | Readable full SQL, parameters, source filenames, row counts and bindings. |
| prepared.json | Selected identities, named input slots and complete prepared-file records. |

Open review.html before checkout. It contains every stage's full SQL and saved parameters, and the actual selected source filenames and row counts. Preparation does not execute SQL.

The default selection uses the saved definition's input IDs. To commission another source edition with the same SQL, provide **--inputs /absolute/path/to/bindings.json**, mapping every named input to an existing source ID in this project. No input follows the latest alias.

Optional **--reuse-execution ORIGINAL_EXECUTION_ID** freezes one saved execution and its complete record digest. The original engine compares each stage's query, parameters, source/result identities and native engine identity before reusing a complete result; it computes unmatched stages. The selected prior execution and its complete results must be in the project.

Repeating preparation checks the original intent and every complete prepared file. A different source, revision, binding, report name or reuse selection requires another order directory.

## Purchase through the existing Request and Buyer

In the existing Request workspace, select executePipeline. Supply the prepared project.zip in the **project** slot with application/zip, and selection.json in the **selection** slot with application/json. Use the exact input.json object as ordinary input.

The original input receiver seals both files and adds its reserved $files binding. Preserve the returned private handoff with its original job identity. Review the existing quote and original Buyer operation, then execute that operation with its configured operator profile and spending approval. The handoff supplies the exact URL, payment terms, headers and purchase body. The native settlement journal associates that payment with the job before its worker starts.

The [Buyer guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/jobs/BUYER.md) gives the original Buyer.fromRequest, review and execute sequence. Preserve its intent ID and state. On recovery, reopen the same operation and recover its saved accepted result.

The application streams and verifies both sealed files, then invokes the original Python pipeline through the original native-process supervisor. It receives the project into the job's private workspace and checks the entire approved definition and source selection before executing. Its stable execution request key derives from the original job ID.

Timeout and cancellation reach the original worker and native process group. The original host waits for the owned process to retire before releasing temporary state or publishing its outcome. The application returns complete named file bodies to the original Jobs writer, which creates the package with the retained native settlement.

## Receive the complete output

Follow the original accepted job and download its complete result. This example runs inside the existing original purchase operation:

~~~js
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const sourceRoot = process.env.PIPELINE_SOURCE;
if (!sourceRoot) throw new Error('Set the actual installed sourceRoot');
const selected = relative => import(pathToFileURL(join(sourceRoot, relative)).href);
const { createJobBuyer } = await selected(
  'stellar/scf-starforge-20261009/sf30-seller-sdk/jobs/buyer.mjs');
const { receivePipelineJob } = await selected(
  'stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation/jobs/customer.mjs');

const buyer = await createJobBuyer({
  directory: '/srv/customer/jobs/period-01',
  result: await originalOperation.recover(),
  handoff,
});
await buyer.wait({ deadlineMs: 900000, pollMs: 2000 });
const delivery = await buyer.download({
  destination: '/srv/customer/downloads/period-01.zip',
});
const received = await receivePipelineJob({
  source: '/srv/customer/downloads/period-01.zip',
  expected: delivery,
  job: { id: buyer.jobId },
  packageDirectory: '/srv/customer/deliveries/period-01',
  directory: '/srv/customer/projects/period-01',
  python: '/absolute/path/to/python3',
});
console.log(received.workspace);
~~~

The download parent must already exist. Scripts outside the installed npm package use the explicit selected source imports shown above. An npm consumer installed with this package can use its typed exports.

For a complete original download with a saved expected descriptor:

~~~sh
starforge pipeline-jobs receive \
  --source /srv/customer/downloads/period-01.zip \
  --expected /srv/customer/downloads/period-01-expected.json \
  --job /srv/customer/downloads/period-01-job.json \
  --package-directory /srv/customer/deliveries/period-01 \
  --directory /srv/customer/projects/period-01 \
  --python /absolute/path/to/python3
~~~

The expected object contains the actual completed package's bytes, sha256, contentType and filename; its content type is application/vnd.stellar-forge.job-result+zip. Optional **--job** supplies retained expected original job fields. The original verifier checks the full canonical package and every member before publishing the editable workspace.

| Output slot | Complete content | Limit |
| --- | --- | --- |
| report | Full original report with the selected customer title and saved pipeline label/edition. | 2 MiB |
| project | Whole editable source, recipes, pipeline history, attempts, complete results and reviews. | 28 MiB |
| execution | Complete approved selection, execution record, report name and original output identities. | 2 MiB |
| results | Complete selected CSV, JSON Lines, schemas, original result manifest and report, after successful execution. | 28 MiB |

The declared members total at most 60 MiB, leaving 4 MiB within the original 64 MiB package limit. The input project is limited to 28 MiB compressed, its complete selection to 1 MiB, and expanded receiving to 512 MiB. A returned project includes new results and may be larger than its input. Select actual retained history and complete result sizes within these limits.

**COMPLETE** means every selected native stage finished and the complete results archive is present. **REVIEW_REQUIRED** retains an original failed, cancelled or waiting execution with the whole report and editable project. This product status differs from the original Jobs state: a job can successfully deliver a complete review package for an unfinished SQL execution.

## Continue independently and reopen offline

Keep the package directory's package.zip, job-result.json, files/, receive-intent.json and received.json together. The editable directory contains the native received project and commissioned-job.json, binding it to that original delivery. The original delivered execution remains unchanged in the verified package.

Open the editable project with the preparation Applications provider or original browser:

~~~sh
starforge data-pipelines \
  --workspace /srv/customer/projects/period-01 \
  serve --port 8777
~~~

Inspect complete stage rows and reviews. Save another pipeline edition, select another source edition or create another execution. For an unfinished delivered execution, the original Resume control continues its original execution and native attempt history while retaining completed stages.

A later session verifies and reopens this customer locally:

~~~sh
starforge pipeline-jobs reopen \
  --package-directory /srv/customer/deliveries/period-01 \
  --directory /srv/customer/projects/period-01 \
  --python /absolute/path/to/python3
~~~

Reopen retains later work. An originally complete execution stays exactly preserved. An originally unfinished execution permits valid continuation while preserving the original immutable selection, completed stages and original attempt identities. Changed original source bytes or completed delivered work rejects reopening.

Package and editable directories must be canonically disjoint. Repeating the same receive verifies and reuses the original files and editable workspace. Another package cannot take over that directory. Copy both whole directories when moving the customer; receiving resolves their new absolute locations.

## Recover the original operation

Keep the same Buyer intent, private handoff and accepted job. Inspect the merchant's original retained state and settlement journal. Use its revision-checked retry/cancel controls for a failed worker attempt. A retry receives the same sealed project and selection; its actual job and attempt identities remain in the package.

Preparation and customer receiving own their Python child through process closure. They publish complete directories atomically. After interruption, repeat the same original selection or receiving command. Preserve completed preparation, package and editable state.

The [named-output guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/jobs/outputs/README.md), [Jobs installation guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/jobs/INSTALL.md) and [pipeline guide](../../stellar/scf-starforge-20261009/sf30-seller-sdk/data-preparation/pipelines/README.md) define the original underlying recovery contracts.

## SCF customer use

This product implements the useful paid unit in the existing preparation chapter: commission a concrete reporting edition from actual selected sources, receive its complete result and continue independently. Customer-specific source authority, merchant accounts, runtime, price, destination and original acceptance belong to the existing funded package or a separately commissioned workorder.

The current grant manuscript supplies the scope, funding, customer targets and milestones. This source contributes the reusable complete operation; the original paid customer receiving outcome joins the existing preparation and Jobs owners' recorded case.
