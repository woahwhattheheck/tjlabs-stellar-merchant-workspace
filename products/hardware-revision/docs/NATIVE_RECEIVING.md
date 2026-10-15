# Native hardware review and complete receiving

## Requirements and commands

Use an installed Node.js 20 or newer with no package installation. The CLI imports only Node built-ins and the complete maintained source next to it. It never calls an external API or starts a background worker. Start from the full materialized application whose `source-manifest.json` uses `tjlabs.hardware-review-source-manifest.v1`. Every listed source is byte/hash checked before an operation.

Create a blank workspace, preserving the exact command and chosen timestamp:

```sh
node native/hardware-cli.mjs blank --at 2026-10-15T00:00:00Z --out /work/hardware-blank
node native/hardware-cli.mjs demo --out /work/hardware-authored
node native/hardware-cli.mjs course --out /work/hardware-receiving
node native/hardware-cli.mjs capacity --components 500 --out /work/hardware-capacity
```

The demo is explicitly authored, includes all seven original files, and is separate from the blank workspace. It is not a native KiCad export or customer result. `course` executes the complete received-error→correction→comparison→named-review→reopen sequence, plus meaningful error/retry handling. `capacity` retains both full 500-component/2,000-connection/2,000-contract revisions and returns the actual workspace. Progress is emitted to stderr; the final JSON line names the completed directory and digest.

## Own original files and explicit mappings

Export the actual selected KiCad schematic with its installed version recorded:

```sh
kicad-cli --version
kicad-cli sch export netlist --format kicadxml --output /work/board.net.xml /work/project/board.kicad_sch
```

Keep the full schematic/project separately in the owning CAD workflow. This selected adapter reads the exported XML, not a different S-expression netlist or PCB routing. Native execution and ERC/DRC remain separate evidence.

Retain one exact input:

```sh
node native/hardware-cli.mjs source --workspace /work/hardware-blank/Hardware_Review_Workspace.json --file /work/board.net.xml --name board.net.xml --type application/xml --operation receive-netlist-A --at 2026-10-15T00:05:00Z --out /work/hardware-source-1
```

Repeat from the previous output workspace for the BOM and the owner-declared pin contract. `Result.json` supplies each retained source ID. Source names are preserved in the workspace; materialized filenames are indexed and sanitized without changing original bytes.

Use `inspect` for CSV/TSV/JSON and `netlist` for XML. Example:

```sh
node native/hardware-cli.mjs inspect --workspace /work/hardware-source-3/Hardware_Review_Workspace.json --source-id ACTUAL_BOM_SOURCE_ID --format csv --out /work/hardware-inspection
```

Edit the complete `Selected_Input.json` from the blank workspace. Supply product/revision/source owner, three actual source IDs, selected part-number field, table formats and exact mappings. For JSON mappings use RFC6901 pointers relative to each selected row. Source numbers retain their original numeric lexemes. For optional absent fields select an empty mapping rather than silently inventing a column. The default BOM header contract is child_part_number/qty/uom/refdes/notes; omitted uom maps explicitly to defaultUnit each. Parts are reconciled per one assembly.

Preview with `analyse`; save separately with `freeze`:

```sh
node native/hardware-cli.mjs analyse --workspace /work/hardware-source-3/Hardware_Review_Workspace.json --input /work/Selected_Input.json --out /work/hardware-preview
node native/hardware-cli.mjs freeze --workspace /work/hardware-source-3/Hardware_Review_Workspace.json --input /work/Selected_Input.json --name "Received revision A" --prepared-by "Named source owner" --note "Original received mappings" --operation freeze-A --at 2026-10-15T00:10:00Z --out /work/hardware-edition-A
```

An edition may retain invalid received inputs and findings. Add corrected original files and freeze a separate named candidate with `--parent ACTUAL_EDITION_ID`; the received error edition and all original bytes remain in history. Do not edit the workspace JSON to change a frozen report or source.

## Compare, propose and review

`compare --left ID --right ID` exports the full comparison without changing workspace. `propose` creates a named frozen change package:

```sh
node native/hardware-cli.mjs propose --workspace /work/hardware-edition-B/Hardware_Review_Workspace.json --left ACTUAL_BASE_EDITION_ID --right ACTUAL_CANDIDATE_EDITION_ID --name "Board revision review" --prepared-by "Named preparer" --reason "Selected source revisions" --operation propose-board-B --at 2026-10-15T00:15:00Z --out /work/hardware-proposal
```

Review binds the actual `proposalId` and complete `comparisonSha256` from Result.json. The CLI records the supplied human name; it does not authenticate that person's organizational authority.

```sh
node native/hardware-cli.mjs review --workspace /work/hardware-proposal/Hardware_Review_Workspace.json --proposal ACTUAL_PROPOSAL_ID --comparison-sha ACTUAL_COMPARISON_SHA --discipline EE --decision approved --reviewer "Named EE reviewer" --note "Specific reviewed findings" --operation review-EE-B --at 2026-10-15T00:20:00Z --out /work/hardware-reviewed-EE
```

Continue from each latest output for FW/MFG as actually required. A later needs-work decision blocks completeness while preserving earlier approvals. Exact same-operation retries are idempotent only with the original payload, time and previous root. Changed input must use a new operation ID.

`handoff --proposal ID` returns full base/candidate/report/comparison/reviews/originals. REVIEW_COMPLETE means the specified source-review package is complete. It remains NOT_APPLIED to native CAD/PLM and is not a manufacturing release.

## Complete transport and restart

Every CLI operation writes:

- Complete compact Hardware_Review_Workspace.json.
- Complete exact maintained source, including its manifest, as Hardware_Complete_Source.json.
- Every retained original file, extracted byte-for-byte.
- Every frozen input/report in JSON, readable Markdown/HTML and a reconciliation CSV.
- Every proposal, exact comparison and current review status.
- Selected command result and optional input/preview.
- COMPLETE.json only after materialized files have been read back and the workspace independently reopened.

Output is create-only. An owned same-input directory can resume after interruption; different final members are never overwritten. Files publish via a unique private temporary, fsync and create-only hard link. Existing symlinks and unowned occupied directories are refused. A filesystem must support hard links; POSIX directory fsync is used where supported. Abandoned temporary files remain diagnostic; a matching partial ownership-marker prefix is recognized without treating unrelated files as ours.

Open the full working record through `receive` in a new destination to reproduce the source/human reports:

```sh
node native/hardware-cli.mjs receive --workspace /work/hardware-reviewed/Hardware_Review_Workspace.json --out /work/hardware-independent-reopen
```

CSV report cells beginning with formula-control characters are apostrophe-prefixed for spreadsheet display. Exact original CSV bytes remain separately retained. Reports include all rows; no preview truncation is substituted for the complete source.

## Observed evidence and installation limits

The maintained pure core and complete course were source-executed in an isolated JavaScript runtime using exact UTF-8/Base64/SHA functions. The final small course has 28 checks and independently reopens the complete received/corrected/review history. The complete 500/2,000 course passed in58,786ms with a14,986,449-byte workspace; its full actual artifact is retained separately. These are source-runtime measurements, not installed Node, browser, KiCad or ProductFlo performance claims.

At the selected receiving host, run the same native commands with real files, retain stdout/stderr and COMPLETE.json, and check the actual GUI/reopen behavior in the operator's browser course. Record the installed Node/KiCad versions. No provider registration, OAuth, cookie acquisition or live API invocation is included here. Actual ProductFlo export/dry-run must be separately authorized in the selected installation.
