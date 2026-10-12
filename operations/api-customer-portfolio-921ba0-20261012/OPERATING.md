# API customer portfolio: original native customer journey

This operation runs the complete customer pass workflow against the original SF101 receiver, pass store, gateway, API client, workspace model and HTTP application. It uses isolated local merchant orders, original SQLite accounting and a local HTTP upstream.

Operation: `api-customer-portfolio-921ba0-20261012`.

## Source and runtime

The product source is pinned to commit `5c210c0be7d1ea5e3e6b87625e7bc9d389d42334` in `woahwhattheheck/tjlabs-stellar-merchant-workspace`. The nine complete customer files are listed by byte length and SHA-256 in `source-inputs.json`.

The receiver downloads the original 671-file source packet from commit `72e196999c60927a8e211d0b31388c04ac803334`, checks its 5,582,383 bytes and Git blob `0c1df5bf8c20b8b534060d67399d9b0a9b751bc7`, verifies every contained source file, then overlays the nine exact customer files. The original merchant source and customer runtime execute together. The adjacent readable `customer-journey.mjs` is also checked against its recorded byte length and SHA-256 before Node loads it.

Use an existing Linux worker with Python 3, Node and the original SF101/Buyer runtime dependencies. The worker needs at least 32 MiB of free receiving space and access to public GitHub raw source. The operation starts its gateway, console and upstream on operating-system-assigned loopback ports.

Set the following values to the actual existing runtime and destination:

| Environment variable | Purpose |
| --- | --- |
| `API_PORTFOLIO_WORK_ROOT` | Existing writable parent for the isolated working directory; defaults to `/dev` in the ChatGPT Linux worker. |
| `API_PORTFOLIO_NODE_MODULES` | Existing original Node dependency directory, linked beneath the materialized source. |
| `API_PORTFOLIO_NODE_PATH` | Existing supplemental dependency path required by the original Buyer runtime, when applicable. |
| `API_PORTFOLIO_NODE` | Existing Node executable; defaults to `node`. |
| `API_PORTFOLIO_RESULT_DIRECTORY` | Durable writable destination for the complete result and exported customer history; defaults to `result/` beside this receiver. |

The ChatGPT runtime defaults refer to the existing shared dependency installations at `/workspace/scratch/9345d3fc660b/native-runtime/node_modules` and `/workspace/scratch/2d589b11f06d/scf-oauth-deps/node_modules`. Select the receiving worker's own original installations when running elsewhere. Python is passed through to the customer application using the actual executing interpreter.

Run the complete operation from this directory:

```bash
python3 receive.py
```

Keep the returned operation identity and process/session handle. If a matching invocation is already active, continue that invocation and read its output before starting another. A completed matching customer run can be adopted by its full output and source identity.

## Customer workflow

The receiver enrolls three isolated local orders using the original merchant enrollment and pass attachment functions. Two fixture orders receive original-schema entitlement events to make 4 and 12 allowance units available. Their route costs two units per request. The third order supplies a 20-unit replacement handoff. These fixture inputs exercise original product behavior; the replacement step saves and reviews its original handoff, and the separate Buyer payment workflow retains its own native receiving.

The customer journey performs these operations through the actual configured HTTP application:

1. Connect two original API passes and refresh their exact saved batch. Read 4/12 available units and 2/6 remaining route calls.
2. Select the first pass, save a call bound to it, select the second pass, and send the saved first-pass call. Read 2/12 units, the low-balance state and the downloaded response hash.
3. Replay the same saved call and the original batch intent. Confirm that the original result is reused and the allowance remains 2/12.
4. Make a second request through the original API client, adopt that request into the customer recovery queue, and recover its original bytes. Read 0/12 units, exhausted status and an empty queue.
5. Save a reviewed replacement handoff, repeat its same intent under another mutation ID, and adopt the same replacement profile with its parent/child lineage.
6. Archive the selected old pass, clear its default selection, preserve its original result download, and select the second pass.
7. Close the configured workspace, read its stopped state, and reopen it with the same workspace identity, portfolio settings, lineage and retained result.
8. Exercise an occupied listening port, continue the same retained close owner, and reopen that workspace after startup cleanup.
9. Reject a newly supplied cleanup callback after a direct model has closed.
10. Continue a retained before-release callback after its first failure, while the original lease remains held, and finish the same close operation.

The report also records the complete customer-history export, exact source commit, phase details, native exit code, actual upstream execution count and original merchant allowance rows. A passing complete journey performs exactly two upstream requests. The receiver owns its child process group through timeout, signals and final gateway cleanup.

## Receiving and adoption

The process prints `RECEIVING_STARTED`, then `SOURCE_READY`, then the complete customer report and `NATIVE_COMPLETED`. Read the terminal status and report together. The complete files are:

- `portfolio-journey-result.json`
- `customer-history.json`

The history bytes are checked against the report before preservation. Existing result files are never overwritten. If the selected result volume fills, the receiver still prints the complete report so the same operation's result can be retained through its existing source-owner thread.

The original root claim is in the SCF coordination thread at https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791731375272819. Deliver the complete result there, including the exact product commit, actual execution host, process exit and the result/history files. The customer portfolio is PR84; the complete prepaid product is PR88.

## Current source review

Two independent source reviews accepted the portfolio arithmetic, immutable saved-call and batch identities, replacement lineage, browser draft guards, and retained CLI/server/model close ownership. This receiving packet is the portable execution of that reviewed source and can be run by the root Linux worker or an existing Commons Linux/Muse owner.
