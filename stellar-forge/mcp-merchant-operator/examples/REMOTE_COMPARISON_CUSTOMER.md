# Operate a complete remote comparison customer

This operation takes an existing OData comparison through the HTTP merchant, the customer command line, complete file download, independent native receiving, and the original Analysis workspace. It retains the same 830 Orders entities and the comparison's 4,150 changed cells while adding a customer's own review history and published edition.

The customer interface is `starforge odata-comparison-customer`, provided by `./operator/odata-comparison-client`. [The customer guide](../ODATA_COMPARISON_CUSTOMER.md) describes individual commands and connection settings. The two entry points here carry a whole customer operation and retain its original requests, results and completed output.

| Entry point | Selected input | Completed output |
| --- | --- | --- |
| `remote-comparison-customer.mjs` | Complete source checkout, original workspace transfer, worked comparison identity and private output directory | Original HTTP merchant operation, four review scopes, publication, complete download, independent comparison and merchant receiving, whole workspace transfer |
| `remote-comparison-analysis.py` | That completed customer directory and the same source/runtime | Original source registration, explicit mapping, preview/import, every comparison row, complete Analysis archive and reopened receiving |
| `operations/odata-remote-comparison-native-host.py` | The original customer ZIP plus the complete selected source packet | Both phases, full source edition, file manifest, retained command logs and durable delivery result |

## Select the original customer edition

Use the complete comparison customer ZIP already delivered with this project. Its original reference edition is `OData_Complete_Comparison_Customer_Edition.zip`, 12,405,771 bytes, SHA256 `bac079568f9a4d73133540b7db6e0831307bd7daf016d87c2e57a40363d4d2d8`.

That edition contains the whole original runtime under `SOURCE/`, the complete OData workspace transfer, worked comparison result, original reviews and analytical customer outputs. The worked operation selects the original `orders` live service and `orders-projection-review` comparison.

The native host verifies the complete 1,452-member ZIP, every declared member's bytes and digest, all 1,433 source files, and each selected full postimage before opening the merchant. Its source packet adds the complete merged MCP and customer client to the retained runtime and supplies the two receiving entry points. The source inventory records each selected file and the original customer archive identity.

Source admission accepts either the original `commons.source-packet/v1` envelope or that same packet's complete decoded JSON bytes. Both forms have fixed byte counts and SHA256 identities. This lets an existing worker include the whole operation in its initial command while keeping the source selection unchanged.

The reference host uses an existing Node 24 runtime and its installed dependency view. It creates a private operation directory and opens existing dependencies without changing their installation.

## Operate from an already prepared source directory

For another authorized runtime, prepare a complete source checkout and the original customer transfer files, then supply this descriptor. Paths are absolute and belong to the selected operation.

```json
{
  "schema": "stellar-forge.odata-remote-comparison-customer-input.v1",
  "operationId": "ODATA-REMOTE-COMPARISON-CUSTOMER-F971-20261012-R1",
  "checkout": "/absolute/SOURCE",
  "outputDirectory": "/absolute/CUSTOMER",
  "workspaceTransfer": "/absolute/INPUT/OData_Comparison_Workspace.json",
  "workspaceTransferSha256": "<SHA256 of that exact transfer>",
  "worked": "/absolute/INPUT/worked-comparison-customer.json",
  "archiveSha256": "bac079568f9a4d73133540b7db6e0831307bd7daf016d87c2e57a40363d4d2d8",
  "comparisonSha256": "<comparison_sha256 from the original worked result>",
  "liveServiceId": "orders",
  "comparisonId": "orders-projection-review"
}
```

Select an existing Node executable and the same original checkout for both phases:

```sh
umask 077
"$NODE" "$SOURCE/stellar-forge/mcp-merchant-operator/examples/remote-comparison-customer.mjs" "$INPUT/remote-customer-input.json"
python3 -B "$SOURCE/stellar-forge/mcp-merchant-operator/examples/remote-comparison-analysis.py" --checkout "$SOURCE" --operation "$CUSTOMER" --node "$NODE"
```

The first phase creates its own merchant workspace from the supplied transfer and starts the original MCP service on loopback. It retains the actual chosen port and private bearer material for the selected operation. Subsequent command invocations use the maintained customer CLI and that same connection.

## Customer work retained by the operation

The operator pages both collections and comparisons, opens the selected comparison, reads its first and final row pages and retains every pre-existing published edition. It then saves one review at each of the comparison, entity, column and cell scopes.

Each review has a saved request ID and complete request body. The operation deliberately retries its first request after the later reviews have been saved. The returned original version must be reused while the later history stays intact. Publication explicitly selects the resulting review revision.

The customer downloads the published source and every declared file through the original ranged-file interface. A second open uses the same complete download checkpoint. Offline verification checks that exact source edition and payload inventory; native receiving opens the downloaded comparison, replays its original source and exposes the final changed-cell page.

The same complete source is then received through the original merchant into `orders-remote-customer-received`. Reopening that destination retains the selected comparison and review history. The final merchant workspace transfer includes both the original comparison and this received customer copy.

## Analytical receiving

The Analysis phase registers the actual downloaded `source.json` as an original source document. The CLI produces the mapping against the returned source alias and revision; all 13 declared CSV columns retain their original textual representation.

Original Analysis preview and import must receive every one of the 4,150 rows. The operator activates the imported dataset, queries all columns in original row order and compares the entire query result with the selected source CSV. It retains the JSON and CSV exports, exports the complete Analysis workspace, restores it independently and reads the same complete rows again.

The source document digest, selected mapping, dataset version, workspace identity, original job IDs and first successful restore receipt are retained in `remote-analysis-operation.json` and `remote-analysis-result.json`.

## Continue the same operation

Keep the descriptor, source selection and output directory together. The Node journal stores each original CLI argv, attempt, PID observation, stdout/stderr and exact completed return. A completed step verifies and reopens its retained result. An interrupted review keeps its original request file and request ID.

Child error and close handlers are attached immediately after launch, before asynchronous process or journal reads. The enclosing native host retains the output lease and owns its child process group through close.

The Analysis journal preserves the original requests and job IDs. Completed jobs are reopened; a failed or interrupted job retains its prior result before the same selected analytical request gets a further attempt. An already restored workspace reuses its first accepted receipt and verifies the stable native identity.

Inside the attached reference host, `run_original_remote_customer()` continues the selected directories after the concrete failure has been corrected. It reloads the original host receipt and keeps the original descriptor, source inventory, requests, selected port and completed result identities.

The host saves a complete `native-complete` checkpoint after the merchant/client/independent receiving phase has closed, before starting Analysis. A caught failure first closes the owned child process group and preserves the full selected source, input, customer state and logs in a separate failure checkpoint. Checkpoint and final-edition saves have separate retained request and result records. The host advances only after the unchanged file helper returns one successful result for the exact checkpoint path. A selected save keeps its original identity for reconciliation. If the helper completed before its parent recorded success, the host adopts the retained complete provider results by matching the original immutable request, every selected path and returned file identity; it does not invoke the helper again or invent a process exit code. An incomplete or failed return stays explicitly unresolved.

A failure after final packaging also retains the finished root customer ZIP, result, file manifest and opening instructions. Receiving reopens that same final artifact and reconciles its original save.

The checkpoint ZIP is a private operation continuation. It includes the original worker's private connection and provider state. The customer edition has its separate, narrower file manifest and opening instructions.

To receive a saved checkpoint in the same original private root, provide its exact selected file before executing this host:

```python
from pathlib import Path
_remote_checkpoint = {
    "path": "/absolute/retained/OData_Remote_Comparison_native-complete_Checkpoint.zip",
    "bytes": 123456,
    "sha256": "<the complete saved checkpoint SHA256>"
}
_receiving_host_source = Path("/absolute/operations/odata-remote-comparison-native-host.py").read_text()
exec(compile(_receiving_host_source, "remote-customer-native-host.py", "exec"))
```

The receiving path verifies every declared member before writing, accepts only regular files beneath the original selected roots, restores private modes, and preserves different or later existing files. The checkpoint binds the exact host source, original customer archive, decoded source packet and operation ID. Its selected phase is adopted as an already received checkpoint; it is not uploaded again.

Initial, failure and final observations retain `/proc/meminfo`, the current cgroup memory limit/current/events where available, and filesystem free/available bytes. These observations accompany the original run so a worker can distinguish a source failure, resource failure and missing transport result.

## Complete customer edition

The finished `OData_Remote_Comparison_Customer_Edition.zip` contains the exact complete runtime source, the original customer requests and returns, the complete download and independently received comparison, the merchant workspace transfer, the analytical source/mapping/row exports and the restored Analysis archive.

Every member is selected in the customer file manifest and verified before publication. The native host streams the selected source and files into one archive, then reopens that complete archive before saving it. The concise `OData_Remote_Comparison_Customer_Result.json` records the original archive and comparison identities, the new review revision and edition, source document digest, Analysis workspace and final archive identity.

The private bearer material and provider delivery journals remain with the operation's original worker. The completed edition opens from its own `SOURCE/` directory and includes its own operating instructions.
