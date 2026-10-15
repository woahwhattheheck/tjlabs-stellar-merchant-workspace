# Hardware revision review — contract v1

This is a source-preserving, independently authored comparison engine. It reads selected originals, freezes explicit mappings and reports, compares two named editions, and binds named EE/FW/MFG decisions to the complete comparison digest. It does not apply CAD/PLM changes, run arbitrary firmware, perform ERC/DRC, establish electrical safety, or authorize production.

## Selected input contract

KiCad 9 CLI exposes `kicad-cli sch export netlist --format kicadxml INPUT_FILE`. Current upstream 9.0 XML exporter emits version E; the manual also retains version D examples. The parser accepts D/E explicitly, preserves original UTF-8 bytes, and projects design, components, libparts, libraries, nets and exact node pin strings. Unknown content remains in the original source but is not interpreted as an additional supported contract. DTD/custom/external entities are rejected. Standard XML entities, CDATA, comments and CR/LF normalization are handled for semantic text; source offsets refer to exact original JavaScript character positions.

Component identity is selected sheetpath plus all sorted unit UUIDs. If those are unavailable, the exact reference is a visible fallback warning. Multi-unit symbols can share one physical package. DNP and exclude-from-BOM components are retained but excluded from the per-assembly count. Exclude-from-board is preserved separately. Net code is only a local export key: code-only renumbering does not create connectivity changes. Named nets, classes, complete endpoint cohorts and pin function/type are compared. A comparison retains each complete endpoint cohort once per net per edition; each changed pin binds its exact endpointsSha256, avoiding quadratic copies on a large shared bus.

BOM input is an explicitly mapped CSV/TSV or JSON table. Required meanings are part number and positive exact quantity. For this selected adapter, quantities represent one assembly and unit must be `each`; other units remain original and produce a finding until a different conversion rule is agreed. The selected component field defaults to `MPN` but the owner must choose the field that corresponds to the BOM's child-part identifier. No automatic manufacturer/internal-part equivalence is assumed. Reference lists use one declared literal separator; ranges are not expanded. Missing, extra, repeated, excluded or differently identified references and aggregate quantities remain visible.

The published ProductFlo Sync CSV contract requires `child_part_number,qty`; its aliases are documented in the installation reference. Optional `uom` defaults to `each`, with `refdes,notes`. This engine keeps explicit field-to-column mapping rather than guessing aliases or stripping original columns. Its supplied example uses those actual headers. A selected deployment must confirm the current contract. No authenticated provider call has been made.

Firmware input is an owner-declared JSON/CSV/TSV pin table, not a claim to parse arbitrary C/C++ or MCU register definitions. Each row declares stable id, component reference, exact physical package pin string, symbol, and connection `net` with exact expected net or `unconnected`. Unconnected means no node occurrence in the supplied netlist; generated net-name prefixes are not interpreted as proof. An unconnected assertion requires a matching library pin inventory. The owner retains the mapping between firmware symbols/GPIO names and physical package pins.

## Pure synchronous API

`createHardwareReviewAPI({sha256,encode,decode,toBase64,fromBase64})` supplies exact hashing and UTF-8/Base64 functions. Node uses built-in crypto and Buffer; a browser may inject an equivalent runtime. Engine `hardware-review-1.0.0`; input `tjlabs.hardware-review-input.v1`; workspace `tjlabs.hardware-review-workspace.v1`.

- `blankInput()` / `fields`: complete editable mapping template.
- `createWorkspace({title,createdAt,id?})`: blank immutable workspace.
- `addSource(workspace,{name,mediaType,content_base64},meta)`: returns `{workspace,sourceId}`. Opaque originals can be retained; semantic parsing requires exact UTF-8.
- `readSource(workspace,id)`: complete exact original record.
- `inspectSource(workspace,id,{format,arrayPointer?})`: original table columns/rows/values/source references; JSON numeric tokens remain lexical strings.
- `parseNetlist(workspace,id)`: full selected KiCad projection and findings.
- `analyse(input,workspace)`: report with summary, all original rows/projections and source-linked findings. Invalid received selections can be frozen and repaired in a separate edition.
- `saveEdition(workspace,{name,input,parentEditionId?,preparedBy?,note?},meta)`: returns `{workspace,editionId,report}`.
- `compare(workspace,leftId,rightId)`: complete component, connectivity, BOM and declared firmware changes; different products or unresolved source errors are visibly incomparable.
- `propose(workspace,{name,baseEditionId,candidateEditionId,preparedBy,reason},meta)`: returns `{workspace,proposalId,proposal}`. Proposal retains the full comparison and digest.
- `review(workspace,{proposalId,comparisonSha256,discipline,decision,reviewer,note},meta)`: returns workspace directly. Discipline is EE/FW/MFG, decision approved/needs-work. The latest explicit review for each required discipline governs status.
- `proposalStatus` and `handoff`: exact source review state and full original-source handoff. Even REVIEW_COMPLETE remains `nativeApplication:NOT_APPLIED`.
- `exportWorkspace`: compact JSON filename/content/SHA. `importWorkspace` independently replays every operation and reproduces every retained source, input, report, comparison and review.
- `validateWorkspace`: validates foreign objects; reuses only deeply frozen core-produced object identities. No caller-owned mutable object is trusted.

Every mutation uses `{operationId,expectedRoot,at}`. Stale roots reject. Repeating one exact operation ID is idempotent only with the exact original payload, time and previous root. Complete originals and all preceding editions remain retained.

## Bounds and interpretation

Originals: 20 MiB each, 64 MiB aggregate. Whole compact workspace: 128 MiB. XML: 200,000 nodes/64 nested levels. Table: 50,000 rows. Structural admission: 10,000 components/50,000 connection occurrences. Commissioning capacity is a separately measured 500-component/2,000-connection two-revision course; admission limits are not a latency claim.

All quantities use exact rational arithmetic from decimal lexemes. Human display is rounded to nine decimal places with the exact numerator/denominator alongside it. BOM row valid and group complete include reconciliation failures. valuesComplete and knownQuantity separately expose arithmetic coverage; declaredQuantity is null when source quantities are incomplete. Reports distinguish input validity, field completeness and named review; no count or approval is a compliance certification.

## Provenance

- https://docs.kicad.org/9.0/en/cli/cli.html
- https://docs.kicad.org/9.0/en/eeschema/eeschema.html
- KiCad/kicad-source-mirror 9.0 `eeschema/netlist_exporters/netlist_exporter_xml.cpp`, Git blob `2e2a292fc89bb86c6e977febf8554147f6a33c61`: current E/version/unit identity/flags/node contract, independently implemented here.
- https://app.productflo.io/docs/developers.html : published API reference, recovered through indexed official text after direct503. Cookie/session authentication. GET BOM export and POST dry-run require actual installed authorization. The current package performs no network writes.
- https://productflo.io/integrations/kicad : advertises available integration; this work is a selected pilot intake/review adapter, not an assertion that an integration is missing.

The authored demonstration originals explicitly identify themselves. They conform to the selected XML/table shapes but have not been generated by an installed KiCad process or used in a physical product.
