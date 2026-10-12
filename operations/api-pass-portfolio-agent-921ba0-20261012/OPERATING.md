# API customer portfolio: complete agent receiving

Operation: SCF-API-PASS-PORTFOLIO-AGENT-921BA0-20261012.

This receiving operation runs the original merchant gateway and customer application, then opens the original merchant MCP provider over its authenticated HTTP transport. The same original customer state is used by the typed JavaScript client and the installed command entry. It retains the whole customer, merchant and agent workspace after all writers stop.

## Selected product source

The customer portfolio is the nine original source files at commit 5c210c0be7d1ea5e3e6b87625e7bc9d389d42334, merged through PR84. Its unmodified customer journey is included here.

The complete twenty-file agent family is pinned to PR114 head 216e40d21c7264a7bb39351af8a7efce94f624fa. The source packet includes the complete files, Git blob identities, SHA256 values and lengths. In particular it selects:

| Component | Git blob |
| --- | --- |
| Portfolio protocol | 9815ebe39626b3b0208eba84e950186ef31b9659 |
| Original workspace adapter | 43b260d8a49724c4a92df455986a74680d00144a |
| Typed client with synchronous request capture | 83806cee7b42491410716e8fcd7459cdf34b7fcd |
| Retained CLI | 36e60e6359d649ee621f2d56bc5cd35e87685f93 |
| Lazy provider | 604a06e002f89d052fc62dd00d574a7cf9312568 |
| Current complete-file transport | f8c2e1917772c0b2c6bfdaa681073854104c9673 |
| Current authenticated MCP HTTP handler | c17f82d142bb51c3d3d3f8c214bfbaf35a0524cb |

The base is the original 671-file receiver source packet from 72e196999c60927a8e211d0b31388c04ac803334. The receiver verifies all 671 original Git blobs before applying the selected customer and agent source. Node dependencies remain the original installed runtime dependencies selected by the operator; the complete checkpoint records their paths and Node/Python versions.

## Run the complete workflow

Keep all six files in this operation directory together. Select a writable working volume and an existing installed Node dependency directory:

~~~sh
API_PORTFOLIO_WORK_ROOT=/private/receiving \
API_PORTFOLIO_NODE_MODULES=/installed/runtime/node_modules \
API_PORTFOLIO_NODE_PATH=/installed/runtime/node_modules \
API_PORTFOLIO_RESULT_DIRECTORY=/private/completed-receiving \
python3 receive.py
~~~

The existing cloud receiving defaults are /dev for the private work root, /workspace/scratch/9345d3fc660b/native-runtime/node_modules for dependencies, and /workspace/scratch/2d589b11f06d/scf-oauth-deps/node_modules for Node's additional dependency path. Select the actual original installed dependencies on another host.

The full operation starts the original Python gateway, its real SQLite allowance store and a local HTTP upstream. The three retained fixture plans grant 4, 12 and 20 units respectively, with a route costing 2 units per execution. Original local receiving events entitle the first two plans. The third remains the original separately reviewed replacement purchase.

The unmodified customer journey runs first. It connects the first two original passes, changes the default, executes and replays an original saved call, recovers a second retained upstream response, prepares and reopens the replacement, archives the predecessor and cold reopens the workspace. It also exercises the original failed-start and close-owner continuation.

The agent journey then performs the following work against that same customer:

1. Open the original provider's authenticated MCP endpoint, read the actual 33-tool catalogue, and open the typed client and real CLI command entry.
2. Configure the saved default and refresh a selected original batch. Mutating the caller's argument object or nested selected-pass array immediately after submission must leave the submitted request unchanged. The exact adapter operation and task IDs are reopened.
3. Prepare a new saved request through the retained CLI, change the default, and execute the saved request through MCP. The original second pass pays its 2 units. The first pass remains exhausted and the second has 10 available units.
4. Pause complete-file receiving after its first written chunk, resume the same original directory, reopen and hash the completed response, and replay the same API call without additional consumption.
5. Reopen the original replacement handoff and intent through the CLI. Read complete original request history and the attention inventory, retaining the original predecessor and successor identities.
6. Capture and download both retained responses and the predecessor, current-pass and replacement histories. Download an already retained response after the customer stops. Cold reopen the customer, MCP provider, exact adapter journal, saved CLI result and all five completed exports.

The full run expects exactly three actual local upstream executions: the two from the customer journey and the one agent-authored request. Replays retain the original response and allowance.

The entry prints RECEIVING_STARTED, SOURCE_READY, the two complete journey reports, NATIVE_COMPLETED and COMPLETE_WORKSPACE_RETAINED. Exit zero requires both original journeys to pass and exactly three upstream executions. A failed agent phase keeps its original error and complete state in the checkpoint.

## Complete retained handoff

The final ZIP is created after the Node process group, MCP/customer listeners, Python gateway and upstream have stopped. It contains the entire original receiving root:

- The complete application source, selected agent source packet and the full receiving operation.
- The original merchant SQLite store, plan files, gateway configuration and local receiving inputs.
- Every customer configuration, customer journal, request body/result, purchase input and replacement lineage.
- The original agent connection, export store, request journal, file snapshots and saved CLI operation directories.
- All five manifest-pinned completed downloads and the extra response downloaded while the customer was stopped.
- The customer and agent journey reports, combined result and complete file inventory.
- The private local fixture claim and MCP access values needed to reopen this local fixture.

The whole-workspace manifest records each regular file's length and SHA256 and each symlink target. The archive retains source node_modules as its original dependency symlink; its referenced installed dependencies are recorded separately. Keep the checkpoint with its private receiving owner. The reports expose the source and result identities needed by the coordinating product and grant work.

A receiving host can copy the ZIP to API_PORTFOLIO_RESULT_DIRECTORY. When that volume cannot accept the bytes, the original ZIP remains at the exact path printed in COMPLETE_WORKSPACE_RETAINED so the owning process can transfer it before its private execution volume retires.

## Reopen the retained files

Restore the complete private root at the workspaceRoot path recorded by complete-workspace-manifest.json. Authenticate the archive and all regular files against that inventory, preserve private file modes and use the recorded runtime dependencies. A cold workspace retains its original absolute file bindings.

The saved CLI preparation and completed result can be reopened without a running merchant:

~~~sh
node SOURCE/stellar-forge/mcp-merchant-operator/api-pass-cli.mjs \
reopen --directory ROOT/agent/client-operations/reopen-original-replacement
~~~

A complete downloaded response can likewise be reopened from its original manifest:

~~~sh
node SOURCE/stellar-forge/mcp-merchant-operator/api-pass-cli.mjs \
reopen-download --directory ROOT/agent/downloads/portfolio-agent-response \
--workspace customer --workspace-id ORIGINAL_WORKSPACE_UUID \
--manifest-sha256 ORIGINAL_MANIFEST_SHA256
~~~

Use the actual root, workspace UUID and manifest SHA from the saved result. The original customer configuration reopens the customer model; its gateway retains its recorded original fixture address and claim environment. New provider requests use the private connection and current original launch record. Completed exports and completed exact-request results remain readable through their original journals after their producing customer instance stops.

## Product integration

The customer product is PR84, the full prepaid product is PR88 and the agent portfolio family is PR114. The original SCF receiving coordination thread is:

https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791807540908059

Return the complete combined result to that thread so the product and grant owners can adopt the actual native result. The complete private checkpoint carries the local runtime state, while this repository contains the reusable operation and original selected product source.
