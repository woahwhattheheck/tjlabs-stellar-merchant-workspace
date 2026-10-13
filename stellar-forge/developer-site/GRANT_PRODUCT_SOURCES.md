# Independent product sources in the SCF application

## Add a product without a shared projector edit

The maintained grant composer receives each product's original source declarations from a separate JSON file in `grant-products/`. Product authors keep their own chapter heading, stable source IDs, original repository paths and measured file editions together. The existing canonical manuscript supplies the accepted chapter and the immutable source URLs it selects.

The original customer and A2A source receivers continue to handle their existing registrations. The same composer writes the four established reviewer outputs: `grant.html`, `grant-data/application.md`, `grant-data/product-and-finance.md` and `grant-data/source-index.json`. Its existing manuscript receiver carries complete accepted H2 chapters. The public reader projection, saved submission, review rounds and companion reader retain their current roles.

The default declaration directory is part of the existing `stellar-forge/developer-site` component. The `grant-reviewer` contribution already includes that component, and its existing `grant-compose` command and application-composer export use the maintained composer.

## Author the declaration

Create `stellar-forge/developer-site/grant-products/<product-id>.json` beside the other original product declarations. Use the same exact H2 that the accepted canonical manuscript carries within its current demonstration and operator journey.

```json
{
  "schema": "stellar-forge.grant-product-registration.v1",
  "id": "bls-labor",
  "heading": "## Regional labor analysis and recurring data delivery",
  "sources": [
    {
      "id": "bls-regional-analyst-workspace",
      "label": "Complete BLS regional labor application and editable customer delivery",
      "repository": "woahwhattheheck/tjlabs-stellar-merchant-workspace",
      "kind": "blob",
      "path": "products/bls-labor/OPERATING.md"
    }
  ]
}
```

The shipped `grant-products/bls-labor.json` contains all four BLS sources and their complete measured byte identities. The example above shows the document shape for one entry.

| Field | Meaning |
| --- | --- |
| `schema` | The literal product-registration schema shown above |
| `id` | Stable product ID; one selected declaration per product |
| `heading` | Exact complete H2 heading in the original manuscript and companion |
| `sources` | Complete array of the product's selected original source declarations |
| Source `id` | Stable existing source-index ID, retained across editions |
| Source `label` | Reader label used when the source is first received |
| Source `repository` | Original `owner/repository` |
| Source `kind` | `blob` for a file or `tree` for a source tree; the default is `blob` |
| Source `path` | Original relative Git path; a root source tree can use an empty path |
| Source `commit` | Optional full 40-character commit that selects one explicit edition |
| Source `required` | Optional boolean; a source link is required when its chapter is present unless this is explicitly `false` |
| Source `editions` | Optional measured file identities, each binding one full commit to its known `git_blob`, `sha256` or complete `bytes` |

A source file's measured edition can be included directly:

```json
{
  "commit": "353f917bb4e152b1bced7055b9dbe29c17ff76a8",
  "git_blob": "7b69e910a6ff30bfc9818da86dd307de314e3f24",
  "sha256": "6c6be4112428599bc25e705efa5f519f64bf3277df0b12e71003ffce43970d9c",
  "bytes": 16841
}
```

This is the original BLS operating guide's complete measured identity. The composer applies those fields only when the selected chapter points to that exact source commit and path. A later edition uses its own measured entry. A changed selected source clears obsolete file measurements; a known measured edition then supplies its actual values.

## Use the existing composition command

Keep the original complete dist directory, canonical manuscript and economic/coastal/financial/Datasette source selections. The current command automatically reads all regular JSON files in the default declaration directory in sorted order:

```sh
node stellar-forge/developer-site/grant-compose.mjs \
  --directory stellar-forge/developer-site/dist \
  --manuscript /absolute/path/to/current-canonical.md
```

The original source index supplies previously selected merged product commits unless the existing commit options select replacements. The usual source-pins output remains available.

A publisher can receive an additional complete author declaration before it is part of the installed source:

```sh
node stellar-forge/developer-site/grant-compose.mjs \
  --directory stellar-forge/developer-site/dist \
  --manuscript /absolute/path/to/current-canonical.md \
  --product-registration /absolute/path/to/data-preparation.json \
  --source-pins-output /absolute/path/to/current-reader-pins.json
```

Repeat `--product-registration` for distinct product files. To select another complete declaration set, use `--product-registrations-directory /absolute/path/to/received-grant-products`. Repeating a file path reads it once. Selecting two declarations for the same product or assigning one declared source ID to different products requires the publisher to select one original definition.

The command records each complete selected declaration's filename, byte length, SHA-256 and Git blob inside its source-index composition metadata. External local directory names are omitted from that reader metadata. The original product registration and source IDs stay available in the same index.

The exported pure API accepts the same documents through `composeGrantApplication({ ..., productRegistrations })`. Its existing callers remain valid when this optional array is omitted. `receiveGrantProductSources(index, manuscriptOrCompanion, registrations)` is also available for source intake before the existing public projection.

## Source selection and later editions

A real H2 owns all its H3 and deeper content up to the next real H1 or H2. Fenced source examples do not become product headings. The registry builds the manuscript outline once for the complete declaration set.

A declaration whose chapter is absent leaves the current index unchanged. Once its chapter is present, each required source must select its immutable original Git URL. If a chapter cites more than one edition of the same path, its declaration can select one full `commit`; a separately identified historical source retains its own ID.

Source registration first retains the complete repository, commit and path from the original manuscript. The existing public projection then handles its reader links. For a previously projected private source, the registry can continue the exact retained authenticated-source identity. A new private source is received from its original manuscript link through the same intake.

Existing source IDs can migrate into their product declaration. Keep their original repository and path when adopting them from the legacy receiver. The same declaration owner can subsequently update its path or edition, retaining the source ID and unrelated source-index records. Each source remembers its product registration, so another product cannot silently take over that ID.

## BLS customer contribution

The complete [regional labor customer guide](../../products/bls-labor/GRANT.md) develops the installed analysis, original source, native publication and recurring delivery workflow. The concise accepted chapter remains inside the original canonical application.

| Registered source ID | Customer operating content |
| --- | --- |
| `bls-regional-analyst-workspace` | Installed application, full-row analysis, reports and editable project handover |
| `bls-labor-source-contract` | Original LAUS/QCEW statistical definitions and selected source contract |
| `bls-original-case-receiving` | Original NEK intake, six county/projection briefings, regional change report and independent reopening |
| `bls-native-customer-receiving` | Original publisher plans and dataset versions, SF88 acquisition and Vitality receiving |

The BLS chapter contributes a specific regional source and recurring-service example to the existing six funded packages. The canonical application continues to control USD 38,000, 400 prospective hours, the 150-day schedule, package allocations and customer outcome counts. The existing cumulative publisher receives the complete four outputs into the same saved draft, review, Page and Site.

## Edit declarations in the submission workspace

The existing saved submission now includes **Product sources** for chapter and source selection, registration imports, complete source-index previews, authoring versions and composer-file export. See [GRANT_PRODUCT_AUTHORING.md](GRANT_PRODUCT_AUTHORING.md) for the complete authoring and receiving workflow.
