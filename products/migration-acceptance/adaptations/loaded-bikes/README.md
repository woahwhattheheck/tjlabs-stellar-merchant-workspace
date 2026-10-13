# Loaded Bikes catalogue migration

This customer adaptation prepares the complete retained fork-mount, adaptor, rail and fixing catalogue for the existing Migration Acceptance Workbench. It adds a plain browser review application, explicit destination mappings, source-linked corrections, an independent expected-data projection, business acceptance selections and native intake/receiving continuation. The original workbench source remains unchanged.

## Open the complete working edition

Use the delivered source packet and the native materializer described in [OPERATING.md](OPERATING.md). The source capture is \`tjlabs.loaded-bikes.catalogue-capture.v1\`; its semantic companion is \`tjlabs.loaded-bikes.source-claims.v1\`.

Place \`catalogue-capture.json\` and \`source-claims.json\` beside \`index.html\`, or open a saved \`tjlabs.loaded-bikes-project.v1\` project from the application. A complete project embeds both source packets. Customer source data and review editions are delivered in the original internal opportunity; this public source directory contains the reusable implementation.

Serve the containing product directory over localhost:

\`\`\`sh
python3 -m http.server 8080 --bind 127.0.0.1
\`\`\`

Open \`http://127.0.0.1:8080/adaptations/loaded-bikes/\` when the server starts in \`products/migration-acceptance\`. For a browser-exported intake ZIP, start the server in the extracted root and open \`http://127.0.0.1:8080/application/adaptations/loaded-bikes/\`.

The application first opens a browser-saved edition. With no saved edition it opens the packaged \`project.json\`, then falls back to the original capture and semantic companion. **Open project** explicitly selects another complete edition. Browser storage failures leave the in-memory project usable and prompt a file save.

## Work through the catalogue

- **Overview** shows the retained populations, source questions and working sequence.
- **Catalogue & corrections** searches every source field, displays all rows across pages, opens complete cell values and records a correction with reviewer, reason and original value. Source key and parent/category ID values retain their original identity. Restoring a source value preserves earlier review events.
- **Published relationships** exposes the complete variant, compatibility and published kit-content inventory, its conditions and each original JSON pointer. It also exports the complete companion, including the full product inventory and source discrepancies.
- **Destination mapping** selects each native table and column name, type, nullability and primary key. Decimal precision and scale are explicit. All selected source columns remain mapped. Invalid conversions fail preparation rather than silently round or coerce source values.
- **Business review** records catalogue interpretation separately from measured migration parity. Keep the published source, record a correction, or identify the specific customer input needed. The original workbench evaluates native parity and business acceptance after its actual load.
- **Original sources** downloads every unmodified response, including the exact referenced-component lookup retained by the semantic companion.
- **History & handover** preserves each mapping, correction, source restoration and interpretation decision as a new project revision.

The initial complete edition contains 20 parent products, 70 variants, 70 variant-option rows and 49 product-category rows. The model keys are original product/variant IDs, the original option index and category IDs; slugs, labels and blank SKUs do not replace identity.

Prices remain exact integer strings in original minor units with the declared currency and scale. Availability booleans and unknown low-stock values remain distinct. Published kit contents and compatibility prose remain source claims with their exact references.

## Export and continue

**Save project** downloads the complete editable source/review/history JSON.

**Export intake package** includes:

- the complete unchanged workbench source and this customer adaptation;
- the exact saved project and its original capture/semantic companion;
- every original response;
- reviewed staging NDJSON and independent typed expected tables;
- original per-cell source assertions and the selected mapping;
- the native operating instructions.

Application members are fetched from the same serving source and verified against both complete source manifests. An unavailable or changed member aborts package creation while the editable project remains available. The exporter never substitutes a partial application.

CSV downloads contain all reviewed rows of the selected destination table. Import identifiers and SKUs as text. The editable project and native NDJSON/typed expectations preserve types and null distinctions that a spreadsheet may otherwise change.

Follow [OPERATING.md](OPERATING.md) to retain the project in the original Workspace, compile/review its selected native plan, run the existing dlt engine, verify complete parity, evaluate the original business acceptance, select the named consumer and create the complete editable handover. The source-provenance projection does not replace the original native comparator.

## Developer contracts

\`catalogue.mjs\` is browser compatible and exports \`sourceTables(capture)\`, \`defaultReview(capture)\`, \`prepareCatalogue({capture,review})\` and the actual retained-source binding used by the native intake.

\`acceptance.mjs\` independently projects the original responses, validates source claims and builds the original workbench business acceptance input. Browser interpretation issues use \`sourceIssues(capture, claims)\`.

The project schema is \`tjlabs.loaded-bikes-project.v1\`:

\`\`\`js
{
  schema, id, title, createdAt, updatedAt, revision,
  capture, claims, review, issueDecisions, history
}
\`\`\`

\`review.tables\` retains each \`sourceTable\`, destination \`tableName\`, complete \`columns\` mapping and destination \`primaryKey\`. Each column declares \`source\`, \`name\`, \`data_type\`, \`nullable\` and optional decimal \`precision\`/\`scale\`.

An active correction is \`{table, sourceKey, column, previousValue, value, reviewer, reason}\`. \`sourceKey\` is an object of original key names/values. There is one active correction per original cell; the original value remains fixed while earlier corrections survive in the revision history.

## Receiving the actual product

Use the exact outgoing edition at desktop and narrow width. Open all sections, search/filter and paginate the complete tables, inspect long descriptions and source references, apply a reasoned correction and mapping revision, restore a source value and save/reopen the project. Download original responses, a complete reviewed CSV and the intake ZIP; open the extracted source application and independently reopen the same project there.

Continue through the original native load, verification, business acceptance and complete handover, then open that received application. Observe the actual rendered product and repair any clipping, broken control, missing member or inaccurate explanation before presenting the customer-facing edition. The existing repository operating instructions and zero-spend Actions policy apply.
