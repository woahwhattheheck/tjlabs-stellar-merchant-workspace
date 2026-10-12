# Open Contracting workspace

A retained procurement workspace for original OCDS publications: import source packages, inspect each dated edition, compare changes, assign reviews, keep a shortlist, export complete reports, and transfer a working project to another operator. The same source-owned workspace is available through the local browser, CLI, typed client, Applications console and merchant MCP provider.

## Start

Use Node 22.13 or later with the built-in `node:sqlite` module. The local operator, imports, reports, receiving and original SF30 dataset preview use Node built-ins.

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/cli.mjs serve --workspace /absolute/private/procurement --operator procurement-team --port 0
```

Open the `origin` in the startup JSON. The service selects a free loopback port. The startup record uses `stellar-forge.ocds-startup.v1` and includes the workspace identity, revision, operator and process ID for the existing Applications supervisor.

The browser presents processes, original editions, linked parties, tender/award/contract information, documents, amendments, exact changes, reviews and handoffs. Search and filters operate on the retained workspace; process tables paginate at 40 rows. The interface uses neutral colors, compact typography and ordinary industrial software controls.

## Recurring source windows and agency handover

Open **Source windows** in the Procurement desk to save publisher selections, refresh original record families, retain linked documents, review assigned material changes and receive complete editable handoffs. The same lifecycle is available through the CLI, typed client and merchant MCP. The [source-window operator guide](./SOURCE-WINDOWS.md) includes the complete workflow and the reusable five-client agency caller under `agency/`.

## Source and edition model

Import a complete release package, record package, individual release/record, or array of those envelopes. Original UTF-8 source bytes, publisher metadata, original URLs, source pointers and SHA256 identities remain available. BOM and line-ending differences remain part of the original source identity. Empty recognized release/record packages and linked-only records are retained. Releases without a usable process identity remain visible in the retained source and diagnostics rather than becoming a fabricated process.

Each original release remains a separate edition. Publisher-supplied compiled releases and versioned histories remain distinct. The operator compares documents of the same process and compatible representation. Typed object IDs, reordered arrays, omitted values, nulls and unknown extension fields are preserved in the comparison. A versioned history is presented as revision history; it is not silently compiled into a current contract.

Diagnostics cover envelope structure, dates, references, repeated identities and unsafe integers. They identify source issues alongside the original body. This importer does not replace the publisher's full JSON Schema validation. Values from different currencies or procurement stages are displayed separately.

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/cli.mjs import --workspace /absolute/private/procurement --file /absolute/source.json --label 'Original publication' --url https://publisher.example/original.json
node stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/cli.mjs status --workspace /absolute/private/procurement
```

## Find a Tender acquisition

The capture command follows the published Find a Tender OCDS API: OCID or notice ID is a path segment; update windows, stages and page size are query parameters. Every returned continuation is followed and each complete response is retained with its URL, headers, retrieval time and source hash.

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/cli.mjs capture --workspace /absolute/private/procurement --kind record --ocid ocds-h6vhtk-03c810
node stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/cli.mjs capture --workspace /absolute/private/procurement --updated-from 2026-10-01T00:00:00 --updated-to 2026-10-12T00:00:00 --stages tender,award --limit 100
node stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/cli.mjs resume --workspace /absolute/private/procurement --capture-id SAVED_CAPTURE_ID
```

A failed page leaves completed pages and the next URL in the same capture. Resume continues that capture. Retry-After is retained and observed. Responses and imports have an explicit 256 MiB capacity; exceeding it produces a visible error rather than a partial source.

Official API references: [release packages](https://www.find-tender.service.gov.uk/apidocumentation/1.0/GET-ocdsReleasePackages), [record packages](https://www.find-tender.service.gov.uk/apidocumentation/1.0/GET-ocdsRecordPackages).

## Reviews, exports and handoff

Review state comprises disposition (`unreviewed`, `reviewing`, `pursue`, `passed`), owner, next action, note and shortlist. Save against the review revision returned by the workspace. A conflicting edit returns HTTP 409 and keeps the operator's draft available in the browser.

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/cli.mjs review --workspace /absolute/private/procurement --ocid PROCESS_OCID --expected-revision 0 --disposition reviewing --owner procurement-team --next-action 'Check the published change' --shortlist true
node stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/cli.mjs compare --workspace /absolute/private/procurement --before EARLIER_ENTRY_ID --after LATER_ENTRY_ID --out /absolute/new-comparison.json
node stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/cli.mjs export --workspace /absolute/private/procurement --scope shortlist --format html --out /absolute/new-shortlist.html
node stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/cli.mjs package --workspace /absolute/private/procurement --out /absolute/new-workspace.json
node stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/cli.mjs receive --workspace /absolute/private/receiver --file /absolute/new-workspace.json --expected-revision 0
```

JSON and CSV reports retain all selected original editions and source bodies; HTML includes the complete readable process detail and source sections. Use `--scope all|shortlist` and repeated `--ocid` selections. Original source bodies are preserved whole even when a report or package selects only some processes from a source package.

A portable package includes the selected original editions, sources, saved reviews, operator history, receiving records, publication records and applicable capture checkpoints. Receiving verifies the source/package identities in one SQLite transaction. Repeating the same package leaves the workspace revision unchanged. A differing local review is retained, and the incoming review remains available in Handoffs for use as a draft. Subsequent exports carry the receiving history forward.

SQLite stores the working state in `workspace.sqlite` with WAL and synchronous commits. Read snapshots keep reports, comparisons and exports consistent while another process edits the workspace. CLI output files use create-only writes; choose a new output path for each export.

## Applications, client and MCP

The `ocds` distribution contribution registers the CLI, package exports and Applications provider. In the existing Applications console, create an Open Contracting application in a READY runtime, choose the private workspace directory and operator, then use the normal reviewed start controls.

The browser/Node client is `OcdsClient` from `ocds/client.mjs`, with declaration files for TypeScript. Methods cover workspace, import, source/edition reads, comparison, review, report, package, receiving and capture operations. Configure a suitable `timeoutMs` when driving long source captures.

The native merchant provider is `ocds-workspaces`. Its configuration key is `ocdsWorkspaces`; its connection input is `ocdsWorkspaceConnection`. It supplies 24 `merchant_ocds_*` tools through the original provider loader. The connection is a JSON file:

```json
{
  "schema": "starforge.ocds.workspace-connection.v1",
  "workspaces": {
    "procurement": {
      "directory": "/absolute/private/procurement",
      "operator": "procurement-team",
      "label": "Procurement",
      "inputs": {
        "publication": {
          "file": "/absolute/source.json",
          "label": "Original publication",
          "url": "https://publisher.example/original.json"
        }
      },
      "deliveries": { "purchased": "/absolute/finalized-sf100-delivery" }
    }
  }
}
```

The provider uses declared file aliases and the existing retained resource transfer conventions. It owns the same native workspace/server lifecycle and preserves service ownership if a shutdown fails.

## Native merchant and receiving

Selected processes become complete independently receivable packages in the original SF30 dataset format. Large package payloads use ordered 24 KiB chunks. Original SF30 filtering, cursors, snapshot identity and page capacity remain authoritative.

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/cli.mjs merchant-prepare --workspace /absolute/private/procurement --scope shortlist --expected-revision WORKSPACE_REVISION --out /absolute/new-merchant.json
node stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/cli.mjs merchant-preview --workspace /absolute/private/procurement --merchant /absolute/private/procurement/merchant/MERCHANT_ID --query /absolute/query.json
```

Native query values are strings. An example query is `{"where_ocid":"OCDS-87SD3T-AD-SF-DRM-063-2015","limit":"1"}`. Continue with the exact returned `page.nextCursor` until it is null, keeping all transport columns to reconstruct complete packages.

Add the host's original public payment terms and HTTPS origin when preparing an actual seller (`--payment` and `--origin` together), then use `merchant-serve`. This delegates payment and seller behavior to the existing SF30 service. Its native facilitator dependencies are the repository's existing `@x402/core`, `@x402/stellar` and `@x402/extensions` version 2.28.0.

`delivery-receive --delivery DIRECTORY --expected-revision N` consumes the original finalized SF100 delivery. It checks the original page chain, final output, complete chunks, source hashes and package identities before importing. Publication history records the delivery snapshot and original intents. Merchant packages omit internal reviews, activity and receiving context.

## One original-source native journey

Two unchanged historic CDMX-SEFIN packages are included under `examples/source/`. Each contains two dated releases of one real process. The input manifest records exact upstream commit, URLs, original government URI, byte lengths and SHA256 values.

Run the single combined programme from a fresh output directory:

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/ocds/examples/native-journey.mjs --out /absolute/new-ocds-run
```

It imports both original publications through the HTTP client, compares their exact editions, saves a review, handles a conflicting editor, writes all three complete reports, transfers and reopens the workspace, carries a review conflict through another handoff, prepares a native merchant snapshot, traverses every original SF30 preview page, reconstructs the complete source package, and exercises CLI startup/shutdown. Outputs include usable reports, portable packages and one `journey.json` result.

The same programme also opens the native MCP provider through its original configuration/read/load/create hooks and exports an original source through its tool API.

With an already installed Playwright browser, add `--browser` for the same programme's browser import, comparison, review, download and desktop/mobile pass. Set `OCDS_BROWSER_EXECUTABLE` to an existing Chromium executable when the host uses a shared browser installation. Browser temporary files are placed under the chosen output directory. The programme performs no package installation. The existing host can also materialize a source/dependency carrier with `examples/native-bootstrap.py` before invoking this exact programme.

The IT-equipment process changes only its release date and ID. The Bentley-license process adds the original exchange-rate fields and changes their date from null while its USD 75,464.96 value remains unchanged. Both original packages omit `version` and `license`; those absences remain visible in source metadata.

Source standard: [OCDS record model](https://standard.open-contracting.org/latest/en/schema/records_reference/). Original archived publications: [IT equipment](https://github.com/open-contracting/ocdskit/blob/e6b9bf5ac6ac06ed77157fed01ccfbc974e36687/tests/fixtures/realdata/release-package-1.json), [Bentley licenses](https://github.com/open-contracting/ocdskit/blob/e6b9bf5ac6ac06ed77157fed01ccfbc974e36687/tests/fixtures/realdata/release-package-2.json).
