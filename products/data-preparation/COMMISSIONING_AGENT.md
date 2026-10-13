# Pipeline commissioning through the preparation agent attachment

The installed preparation attachment now carries a complete commissioned SQL order from its saved project to its independently editable result. It retains the original forty preparation and pipeline tools and adds nine customer operations. The new operations call the same prepare, receive and reopen functions as the installed `pipeline-jobs` command.

Use the complete **data-preparation-jobs** distribution selection. Its Jobs, Request, Buyer, named-output verifier, pipeline engine, Python helpers and original source are the operating dependencies. The ordinary preparation tools continue to load without starting or importing a Jobs worker. A commissioning call loads its original customer implementation when first selected.

The full [commissioning guide](COMMISSIONING.md) gives merchant configuration, the existing approved purchase, public routing, native runtime and customer receiving. This guide covers the agent attachment and complete-file workflow.

## Declare the original host resources

Use the existing private preparation workspace configuration, passed through the original merchant provider's `preparationWorkspaceConnection` setting. Original source paths and destination paths remain host declarations. Tool arguments select aliases; they do not supply Python executables, arbitrary source paths, receiving directories or merchant secrets.

The optional top-level `python` is the existing absolute Python executable. If omitted, the original customer helper uses `SF30_PREPARATION_PYTHON`. Select Python 3.11 or newer. Set the path in the existing host configuration or environment before launching its MCP owner.

The following is a host configuration example. Replace the three marked original values with the actual existing workspace and project identities before using it:

```json
{
  "schema": "stellar-forge.data-preparation-workspaces.v1",
  "python": "/usr/bin/python3",
  "maxFileBytes": 67108864,
  "maxExpandedBytes": 536870912,
  "workspaces": {
    "reporting": {
      "label": "Original reporting project",
      "directory": "/srv/customer/projects/original",
      "workspaceSha256": "ORIGINAL_WORKSPACE_SHA256",
      "jobCustomers": {
        "original_request": {
          "label": "Original Request and Buyer",
          "customer": {
            "directory": "/srv/customer/paid-jobs",
            "runtimeDirectory": "/srv/install/source/stellar/scf-starforge-20261009/sf88-operator-buyer-cli",
            "operatorWorkspace": "/srv/customer/operator"
          }
        }
      },
      "inputs": {
        "period_project": {
          "kind": "project",
          "file": "/srv/customer/originals/period-project.zip",
          "sha256": "ORIGINAL_PROJECT_SHA256"
        }
      },
      "destinations": {
        "period_order": {
          "label": "Period 01 reviewed order",
          "directory": "/srv/customer/orders/period-01"
        },
        "buyer_downloads": {
          "label": "Existing Buyer downloads",
          "directory": "/srv/customer/downloads"
        },
        "period_package": {
          "label": "Period 01 immutable paid result",
          "directory": "/srv/customer/deliveries/period-01"
        },
        "period_customer": {
          "label": "Period 01 independent editable project",
          "directory": "/srv/customer/projects/period-01"
        }
      }
    }
  }
}
```

Retain owned private parent directories with mode 0700. Each destination is canonically separate from the original workspace. Immutable package and editable customer directories must also be separate from one another. The Buyer download directory must be separate from those two receiving directories.

A source input can alternatively declare `kind: "job-result"` after an original complete Buyer download exists. It retains the original file path and SHA just as project and tabular sources do. The `downloadDestination` route is useful within one MCP lifetime: declare the existing private download directory first, let the original Buyer download there, then select that same alias and the actual completed filename.

The configuration's complete-file limit applies to declared inputs. The pipeline product also enforces its original 28 MiB project, 1 MiB selection, 64 MiB paid-package and 512 MiB expanded-project limits. Use a larger project through its appropriate original service; changing a tool declaration does not change those product limits.

## Inspect the actual saved pipeline

Use the original `merchant_preparation_status` to identify the configured workspace, original input aliases and destinations. Attach its current Applications listener with `merchant_preparation_connect` when reading or editing live source.

The existing tools supply the exact selection:

| Original tool | Use |
| --- | --- |
| `merchant_preparation_pipeline_list` | Page the complete pipeline or execution inventory. |
| `merchant_preparation_pipeline_definition` | Read the explicit saved pipeline ID and revision, complete SQL, parameters and input bindings. |
| `merchant_preparation_records` | Inspect original source IDs and source editions. |
| `merchant_preparation_pipeline_execution` | Inspect an explicit earlier execution selected for native stage reuse. |
| `merchant_preparation_pipeline_export` | Export the complete original project at both reviewed state digests under its stable original operation ID. |
| `merchant_preparation_exports` | Reopen that retained complete delivery after a restart. |

Preserve the selected definition revision and source IDs. A later source alias must not silently replace the source edition reviewed for this order. An optional earlier execution is a selection for the original engine's reuse rules; it does not declare an unfinished or changed stage reusable.

## Freeze the complete order

Call `merchant_preparation_job_prepare` with:

- `workspace`: the original configured workspace alias;
- exactly one `sourceInput` of `project` or retained `fileId` of `pipeline-project`;
- `expectedSourceSha256`: that complete original project's SHA;
- `orderDestination`: one declared destination for this complete order;
- explicit `pipelineId`, `revision` and `reportName`;
- optional complete `inputs` map and original `reuseExecution`.

The adapter calls `preparePipelineJob`. That original helper receives the complete selected project, verifies the definition and bindings, and atomically publishes the original prepared directory. It returns the same complete `PreparedPipelineJob` under `prepared`, together with the configured workspace and order destination.

Repeating identical arguments against the same destination verifies and returns that original preparation. A changed project, revision, source binding, report name or reuse selection belongs to another order destination. Do not reuse the original destination to overwrite the customer's reviewed order.

Preparation preserves these four complete files:

| Selection | Content |
| --- | --- |
| `project.zip` | The exact original complete editable project. |
| `selection.json` | Full saved pipeline definition, inputs, original source records and reuse selection. |
| `input.json` | Original ordinary Jobs input, including report name and complete selection digest. |
| `review.html` | Readable full SQL, saved parameters, source filenames and row counts. |

`merchant_preparation_job_order` reopens the declared order and verifies every retained file. It returns the complete original preparation, its `orderSha256` and all four file descriptors. Retain that order digest if later reopening the same reviewed record.

## Read every complete prepared file

Use `merchant_preparation_job_file` with `kind: "order"`, the original `orderDestination`, an exact selection from the preceding table and its `expectedSha256`.

The file interface is the existing original retained-file reader. It returns:

```json
{
  "readId": "CURRENT_READER_ID",
  "file": {
    "name": "selection.json",
    "contentType": "application/json",
    "bytes": 12345,
    "sha256": "COMPLETE_ORIGINAL_FILE_SHA256"
  },
  "offset": 0,
  "bytesRead": 12345,
  "nextOffset": null,
  "encoding": "base64",
  "data": "ORIGINAL_CHUNK_BASE64"
}
```

Those values illustrate the returned fields; use the actual descriptor and returned offsets. Continue with the same `readId`, `expectedSha256` and `nextOffset` until it becomes `null`. The first read verifies the whole opened descriptor with bounded memory. Later chunks remain bound to that descriptor and source identity; the full original file is not copied into a second buffer or temporary archive.

After process restart or reader expiry, omit the old `readId` and resume at the retained `nextOffset` with the same SHA. A changed complete source rejects that selection. Finish each read or call `merchant_preparation_job_file_release`; the existing four-reader capacity is a resource limit, not a limit on complete source length.

Read the complete review and selection before proceeding to the original purchase. The response is the full original file, including every stage and source record.

## Continue the existing Request and Buyer

The host declares an existing private Request customer under the original workspace's `jobCustomers` map. Each entry has a label and the original customer selection: `directory`, `runtimeDirectory`, and optionally the original `operatorWorkspace` or `operatorProfile`. An optional `expectedInstanceId` binds a particular live instance. Both the agent and browser handoffs call the original `readJobWorkspaceLaunch` reader; its bearer token stays in the existing private host.

Call `merchant_preparation_job_catalog` with the configured customer alias and actual merchant origin. It reads the current full catalog through that existing Request host, validates the original `executePipeline` function and its two required file slots, and returns the catalog's original quote, output declarations and SHA. Review that complete catalog and the prepared SQL/source order.

Call `merchant_preparation_job_request` with:

- the original workspace, declared `customer` and `orderDestination`;
- `expectedOrderSha256` from the complete prepared-order read;
- the actual merchant origin and reviewed `expectedCatalogSha256`;
- one retained `reference` and human-readable `label`.

The operation derives the same request ID as the original Request model. It first reopens that request when present, validating the ordinary input, merchant/function, reference, label and catalog. It creates a draft only when that original ID is absent. This avoids replaying an empty file-input draft after the first attachment has already been saved.

Both complete prepared files are opened as held original descriptors. The existing upload planner computes their full file/chunk identities, which must agree with the reviewed order. The original Request's begin/chunk/seal routes retain those bytes in its own store. Interrupted receiving repeats the same plan and fills only its actual missing chunks. A different file selected on the same request rejects the continuation. A valid existing submitted request retains its original checkout/job and merchant receiving state.

The returned `stellar-forge.preparation-pipeline-request-handoff.v1` record includes the original request ID/reference/revision, catalog and function identities, both complete sealed file descriptors and the Request URL selecting that same request. Open that private URL to continue the original Request, Checkout and Buyer workflow. Keep the URL private: its fragment is the existing customer's bearer session.

The original Request page prepares its merchant ticket and links the existing Checkout. The Buyer reviews the actual quote, configured account, selected runtime and spending approval. Purchase and recovery use that original Buyer intent and accepted job.

Download the whole completed named-result package with the original Buyer. Retain its actual filename, byte count, SHA, content type, original job ID, ordinary input SHA, merchant public origin and native settlement. Those original expectations bind the first receiving operation.

### Native and browser handoff

The same complete helper is available as `jobs/request-handoff.mjs`. `discoverPipelineRequest` returns the original full catalog. `seedPreparedPipelineRequest` returns the complete typed handoff and accepts an AbortSignal. It uses the existing authenticated HTTP host and original upload engine.

The CLI reads an owned private JSON file containing exactly the selected customer object:

```sh
node jobs/request-handoff-cli.mjs catalog \
  --customer /srv/private/customer.json \
  --merchant-origin https://merchant.example

node jobs/request-handoff-cli.mjs seed \
  --customer /srv/private/customer.json \
  --order-directory /srv/customer/orders/period-01 \
  --expected-order-sha256 ORIGINAL_ORDER_SHA256 \
  --merchant-origin https://merchant.example \
  --expected-catalog-sha256 REVIEWED_CATALOG_SHA256 \
  --reference period_01_original_reference \
  --label "Period 01 saved SQL report"
```

The foreground CLI converts SIGINT/SIGTERM to cancellation, waits for the original held-file and HTTP work to close, and returns the original request ID with any failed continuation. Repeat the same selected order, reference and customer after correcting that reported condition.

The Pipeline browser declares the same customer objects in `SF30_PREPARATION_JOB_CUSTOMERS`, a JSON object mapping aliases to `{label, customer}`. Its existing listener presents those aliases, retains the reviewed catalog/reference against the saved order, and invokes this same fixed CLI through its owned native lifetime. See the complete [browser commissioning guide](COMMISSIONING_BROWSER.md).

## Receive the paid result and editable project

Call `merchant_preparation_job_receive` with the original workspace and:

- exactly one declared `sourceInput` of `job-result` or `downloadDestination`;
- `expectedBytes`, `expectedSourceSha256` and `expectedFilename` from the complete original Buyer download;
- `packageDestination` for the immutable whole result;
- `destination` for the independent editable project;
- `job` containing the original `id`, `functionId: "executePipeline"`, `inputSha256`, `publicOrigin` and `nativeSettlement: {id,at}`.

If retained, include original `configSha256`, `applicationSha256` and `attemptId` as well. The original package verifier compares every supplied field with its actual complete manifest.

The `downloadDestination` route uses only the declared private directory and the basename from the original completed descriptor. Relative paths, separators and control characters are rejected. The complete package verifier checks its bytes and hash before publishing the receiving directory.

The adapter calls the original `receivePipelineJob`. Its output retains the original `package` and `workspace` result objects, and adds `workspaceAlias`, `packageDestination` and `destination` for the host selection. The returned workspace object contains its actual package, job, pipeline, execution, status, files and reuse state.

The original package owns the full report, independently editable pipeline project and execution record. Complete executions also return the selected results archive. An original `REVIEW_REQUIRED` delivery remains a useful full report and editable project; its unfinished SQL work retains its actual state and history.

Repeat the same source, descriptor, job and destinations after an interruption. The original helpers own their locks, source checks, complete atomic directory publication and Python process closure. The adapter does not introduce a second operation store or replace the original receipt.

## Read the complete paid files

`merchant_preparation_job_result_files` takes the declared `packageDestination` and optional retained original `job` expectation. It reopens and verifies the original package, checks the pipeline's exact named-output contract and returns all complete file descriptors.

Use `merchant_preparation_job_file` with `kind: "result"`, `packageDestination`, an original selection and its exact SHA:

| Selection | Complete original output |
| --- | --- |
| `package` | Whole paid Jobs result ZIP. |
| `report` | Full pipeline report. |
| `project` | Whole independently editable project archive. |
| `execution` | Complete approved selection and execution record. |
| `results` | Complete selected result files, when present. |

All files use the same restartable byte reader. The complete package and individual files retain their exact source identities and native settlement association.

## Continue and reopen offline

Call `merchant_preparation_job_reopen` with the same package and editable destination aliases. Optional package descriptor fields must be supplied as a complete group. Retain the original job expectation when checking that same accepted customer operation.

The original `reopenPipelineJob` verifies the immutable result and independently editable project. Valid later customer edits and original unfinished-execution Resume remain. Changed delivered source bytes or completed original work reject reopening.

Open that editable project through the original Applications provider or `data-pipelines serve`. Declare its actual new private connection in a separate customer attachment to continue the complete original forty-tool preparation/pipeline workflow. Its sources, saved recipes, result editions and execution histories remain the original received records.

The immutable package and editable directory can move together. Update their host-declared absolute aliases to their new owned directories; the original helper resolves and verifies the moved package. Do not substitute a new package in an existing customer's directory.

## Operation lifetime and compatibility

All nine tools share the original per-workspace serialization in `MerchantPreparationWorkspaces`. Closing the MCP owner first drains its accepted operations, then closes both original and commissioning file readers. The existing disconnect closes that workspace's active readers and retains completed original files for later offline reads.

The original customer helper owns each preparation/receiving Python child through process close and cancellation. The adapter does not spawn its own process, start another listener, purchase a job, or create an alternate database.

The complete original tool catalog is preserved in its previous relative order. Commissioning is an additive group. A preparation installation can continue its existing local operations; an explicit commissioning call requires the full selected Jobs dependency closure and returns a definite installation error if it is absent.

The typed argument/result maps in `data-preparation/mcp.d.mts` include every new operation and retain the original native result types. Complete file chunks have the same shape as the maintained original retained-file reader.

## Recover the selected original action

| Situation | Continuation |
| --- | --- |
| Preparation response was lost | Repeat the same original project SHA, selection and order destination. |
| A different order is desired | Declare/select another order destination and preserve the earlier order. |
| Buyer purchase response was lost | Recover its original Buyer intent and accepted job. |
| Result receiving was interrupted | Repeat the same complete downloaded package, job expectation and two destination aliases. |
| A file reader expired or its process stopped | Keep the original SHA and nextOffset; open a new read without the old `readId`. |
| The same original package needs independent continuation | Reopen its original immutable package and editable project; preserve later valid local work. |
| A source, package or completed delivered result differs | Select the actual retained original or a separately reviewed following operation; keep the original receiving directory intact. |

All commissioning file and source identities remain inspectable in the complete native records and original guides.
