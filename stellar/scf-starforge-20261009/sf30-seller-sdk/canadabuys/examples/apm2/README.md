# Continue the original APM2 procurement customer

This example continues the original CanadaBuys customer created from the complete 908-notice, 67-column federal open-tender capture. It operates the retained APM2 qualification, engineering workshare, reports, receiving workspace and merchant publication. The customer archive and its exact source capture are delivered in the original internal opportunity thread.

The HTTP and browser phases run in separate Node processes so that report/export buffers from the first phase can be released before Chromium starts. Both phases use the same original SQLite workspaces.

## Restore the retained customer

Restore the latest original customer archive with the authorized file service, verify its recorded byte count and SHA256, and retain its original root directory. Preserve these existing members:

- `operator-workspace/workspace.sqlite` and `receiving-workspace/workspace.sqlite`;
- `case-result.json`, `case-input.json` and the complete original open CSV;
- `apm2-operating-content.json`, which contains the source-linked qualification and the internal CAD 7,200 engineering workshare;
- existing `operator-api-journey`, `operator-journey`, `tool-journey` and merchant publication directories.

Materialize the selected complete repository source and original dependency closure under `<customer-root>/source`. Keep the selected source commit and original file hashes with the receiving record. The continuation reads the saved customer; it does not import a fresh substitute feed.

Set `CANADABUYS_CASE_ROOT` to that original customer root. Set `TMPDIR` to a private temporary directory inside it. Use the existing customer operation lock while the programme owns these databases, and keep one receiving owner for this operation.

## Finish the HTTP, merchant and Applications workflow

With Node 24 or a compatible runtime providing `node:sqlite`, run:

```sh
node --max-old-space-size=256 --max-semi-space-size=4 --expose-gc \
  source/stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/examples/apm2/continue-customer.mjs

node --max-old-space-size=256 --max-semi-space-size=4 --expose-gc \
  source/stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/operator/OPERATING_TOOLS.mjs \
  --source-root source --case-root "$CANADABUYS_CASE_ROOT"
```

Run these commands from the original customer root, with absolute executable paths where required by the caller's runtime. The first command:

1. Reopens the existing operator and receiving databases and verifies the original source capture.
2. Continues the saved HTTP operation, reconciling its original review, workshare and receiving identities.
3. Downloads complete HTML, CSV and JSON reports and the same full workspace package used by the receiver.
4. Prepares and previews the source-preserving merchant publication.
5. Closes and reopens both SQLite workspaces, retaining the 908 notices, complete original source and saved workshare.

The native API helper checkpoints each write intent and provider result using atomic files. The customer driver records the start and completion of each client call, together with actual process memory. A lost response is reconciled against the saved workshare or content-derived package receipt when the same operation resumes.

The second command loads the actual Applications registration and the registered 37-tool MCP provider, pages the original notice collection, downloads the complete original CSV through retained-file chunks, and reassembles the original merchant payload. Retain its completed `tool-journey/operating-*/result.json`; an already completed result belongs to this customer and should be reused on a later browser continuation.

## Continue the visible browser workflow

After the HTTP customer is complete, use the existing supported Chromium/Headless Shell runtime and Playwright installation. Set `CODEX_PRIMARY_RUNTIME_NODE_MODULES` to the installed module directory. Set `CANADABUYS_BROWSER_EXECUTABLE` when the accepted browser is at a different path.

```sh
node --max-old-space-size=256 --max-semi-space-size=4 --expose-gc \
  source/stellar/scf-starforge-20261009/sf30-seller-sdk/canadabuys/examples/apm2/continue-browser.mjs
```

This phase opens the original saved workshare through the industrial operator UI, downloads its source, reports and package, and uses the visible receiving form in the same receiving workspace. The existing source-owned `operateCanadaBuysDesk` helper captures the notice, source, qualification, partner-workshare, report and receiving screens. The driver checks the full source hash, receiving review/workshare agreement, original workshare identity, engineering fee and browser errors.

The browser phase retains its own completion or failure in `case-result.json` while preserving the completed HTTP/merchant result. It closes only the browser and servers it started. Actual screenshots remain under the original journey directory, with an inspection copy when the shared workspace can accept one.

## Preserve the completed customer

After each admitted programme ends, preserve the updated original databases, operating records, reports, source bytes, publication and browser captures in the same customer archive. Replace the known artifact version only after reconciling the previous save result. Record the actual executed source commit, phase results and artifact identity in the original internal opportunity thread. Open the resulting browser captures before presenting the visual handoff.

## Capacity and cost planning

Open **APM2 capacity planner** from the procurement navigation, or open [the standalone planner](capacity/index.html) with its sibling assets. The [operating guide](capacity/GUIDE.md) covers complete editable multi-scenario telemetry, measured transfer/storage/queue factors, explicit currencies and cost periods, JSON receiving and the source-linked report. Each project retains its own measurements and authored decisions as portable JSON.
