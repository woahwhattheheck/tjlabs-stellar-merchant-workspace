# Native receiving and original form mapping

The accreditation workbench uses this receiver to create and inspect a real SQLite target, receive complete frozen migration requests, recover their original results, and extract the current target for comparison. The same Python program maps an original Word document while retaining its complete bytes and package members.

Use Python 3.11 or later with its standard-library SQLite support. The receiver has no third-party Python dependency. The application invokes this same program; direct commands below are useful for installation, original operation recovery, and receiving a delivered project.

## Installed paths and first native description

Set these paths to the actual installed product, private operation directory, and selected Python executable:

```sh
IANZ_PRODUCT=/absolute/installation/products/accreditation-migration
IANZ_WORKSPACE=/absolute/private/accreditation-operation
IANZ_PYTHON=python3
mkdir -p "$IANZ_WORKSPACE"

"$IANZ_PYTHON" "$IANZ_PRODUCT/receiver.py" describe \
  --database "$IANZ_WORKSPACE/native.sqlite" \
  --contract "$IANZ_PRODUCT/contracts/data-contract.json" \
  --output "$IANZ_WORKSPACE/native-schema.json"
```

The `describe` command initializes the canonical target tables in one transaction, retains the complete original contract, and reads the resulting schema with SQLite `PRAGMA table_xinfo`. Its result has schema `tjlabs.accreditation-native-schema.v1`, target product `SQLite`, a persistent `target_environment_id`, a schema fingerprint, and the actual tables and columns.

The original contract defines 15 entities and 191 canonical fields:

| Entity | Fields | Original identity |
| --- | ---: | --- |
| source_edition | 17 | source_edition_id |
| programme | 7 | programme_key |
| issuer_account | 11 | issuer_namespace + issuer_client_number |
| facility | 11 | facility_key |
| accreditation | 14 | issuer_programme_id |
| scope_item | 15 | scope_item_key + source_edition_id |
| document | 17 | document_key + document_edition_id |
| assessment | 15 | assessment_key |
| participant | 9 | participant_key |
| finding | 10 | finding_key |
| issuer_decision | 10 | decision_key |
| fee_profile | 11 | fee_profile_id |
| charge_line | 18 | charge_line_key |
| mapping_profile | 14 | mapping_id + version |
| receiving_run | 12 | receiving_run_id |

Each native table also has four separate receiving columns: `_native_id`, `_external_key`, `_project_id`, and `_native_version`. The schema response includes those columns with `canonical: null`. Canonical columns retain their source type; `native_type`, `nullable`, primary-key position, default, and generated/hidden metadata come from the actual database.

Select the returned native environment and field mapping in the workbench before preparing a receiving run. Keep that complete schema result with the project. An environment ID persists in the database. A fresh independently initialized database receives its own ID; a complete copied database retains its existing identity and operation history.

Existing entity records remain intact when `describe` runs again. A compatible new optional canonical column can be added. A removed entity, removed field, changed canonical type, or required new field without original values requires an explicit source/schema migration. The command reports that concrete difference and preserves existing records.

## Native command contract

| Command | Input | Complete returned object |
| --- | --- | --- |
| `describe` | Database path and complete data contract | Actual native schema and persistent environment identity |
| `apply` | Database path and frozen UTF-8 request file | Original committed result with all current project rows, relationships and assets |
| `lookup` | Database path and exact original request ID | The result originally committed for that request |
| `extract` | Database path and original project ID | Complete current project rows, relationships and assets |
| `form-map` | Complete original DOCX file | Original package, part inventory, controls, tables, fields, relationships and source locations |
| `form-fill` | Original DOCX and source-bound fill mapping | Complete successor DOCX, original member identities and exact changes |

Without `--output`, stdout contains the complete result as UTF-8 JSON followed by one newline. With `--output PATH`, the receiver writes the complete object atomically to that path and prints a small descriptor containing its absolute path, byte count and SHA-256. The output must be separate from the original input files and database. Treat an existing selected output path as a deliberate replacement.

The application normally consumes full JSON from stdout. Native failures also return JSON, using schema `tjlabs.accreditation-native-error.v1`, `status: "ERROR"`, a stable `code`, a message and details, with a nonzero exit code. Preserve the returned error object with the original operation.

## Apply the original prepared request

The workbench prepares the request after native schema discovery and source/mapping review. Retain that exact request file. Its schema is `tjlabs.accreditation-native-request.v1`.

```sh
"$IANZ_PYTHON" "$IANZ_PRODUCT/receiver.py" apply \
  --database "$IANZ_WORKSPACE/native.sqlite" \
  --request "$IANZ_WORKSPACE/prepared-request.json" \
  --output "$IANZ_WORKSPACE/original-native-result.json"
```

The request includes its original `request_id`, `project_id`, nonempty string `project_revision`, saved mapping ID/version, exact target product/environment, every selected table and field binding, complete source records, original relationships, and full assets as base64. Composite external keys remain the original canonical JSON array strings prepared by the workbench.

The request digest covers **every original UTF-8 byte, including its final newline**. The receiver records that digest, the original request bytes and its complete original result in the same transaction as the native records, assets and associations. Do not reformat a frozen request while retrying it.

All selected base records are written first. Each receives its actual native ID and version. The second pass resolves the original relationships and asset associations to those IDs. Canonical foreign-key values remain the source keys; the association tables also retain actual source and target native identities.

Record values use the selected actual native column names. The receiver checks each canonical type and the native column affinity, writes the values, then reads them back. A native storage conversion that changes an original supplied value rolls back the request.

### Exact replay, interrupted output and successor requests

Repeating the same request ID with identical bytes returns the original stored `APPLIED` result without performing the changes again. A reused request ID with different bytes returns `REQUEST_ID_REUSED`. The original saved result remains available even after a later request updates the target.

Recover that original result directly when output or transport was interrupted:

```sh
"$IANZ_PYTHON" "$IANZ_PRODUCT/receiver.py" lookup \
  --database "$IANZ_WORKSPACE/native.sqlite" \
  --request-id "$IANZ_REQUEST_ID" \
  --output "$IANZ_WORKSPACE/recovered-original-result.json"
```

Set `IANZ_REQUEST_ID` to the exact original ID already retained by the application. A `REQUEST_NOT_FOUND` result means no transaction with that ID was committed in this selected database. Resume the existing frozen request against its original target when its commit needs completing.

A deliberate source or mapping change creates a successor workbench revision and a new request ID. For each existing native row, that new request must carry its previously returned `native_id` and `expected_native_version` from the same target environment. An unchanged native row then advances one version when the successor writes it. New records have no native ID or version until the receiver creates them.

An existing row without its native guard returns `NATIVE_VERSION_REQUIRED`. A different ID or version returns `NATIVE_VERSION_CONFLICT`, including the current native identity. Review a fresh extraction in the application and prepare a deliberate successor from that observation; do not erase the guard on the original request. Mapping versions are likewise immutable: a changed table or field specification needs a new saved mapping version.

SQLite `BEGIN IMMEDIATE` serializes native receiving transactions. A process failure before commit rolls back the changes. A failure after commit preserves the original request/result for `lookup`. The connection waits up to 30 seconds for an existing writer, then returns its actual native database error.

## Preserve exact source values

Arrays and objects are stored as canonical JSON in native TEXT columns and returned as arrays and objects. Booleans are stored as zero/one and returned as booleans. Integer fields remain exact JSON integers within the workbench's safe integer range.

Exact decimal values use TEXT. Decimal and integer-fraction strings such as `"2760"`, `"690.00"`, or `"1/2"` retain their original representation. The receiver does not convert monetary values through floating-point arithmetic, round them, or assign currency units. Units and charge rules remain in the original canonical fields and source editions.

Required text values must be present. Optional blank text remains an empty string; optional null remains null. Dates retain `YYYY-MM-DD`, months retain `YYYY-MM`, and source date/time strings retain their original offset and precision. Source IDs, issuer numbers, classifications, method references, enum labels and external keys retain their original text.

The original asset base64, byte count and SHA-256 must agree. The database keeps the complete BLOB, original path, media type, visibility and associations. Reusing an asset path with changed bytes returns `ASSET_PATH_REUSED`: give the changed original its own edition path and preserve the earlier source edition. Repeating the same path and bytes retains that original content while updating the supplied metadata and association selection.

## Read the complete current native project

```sh
"$IANZ_PYTHON" "$IANZ_PRODUCT/receiver.py" extract \
  --database "$IANZ_WORKSPACE/native.sqlite" \
  --project-id "$IANZ_PROJECT_ID" \
  --output "$IANZ_WORKSPACE/current-native-extract.json"
```

Use the original project ID retained by the workbench. Extraction runs within one native read transaction. The `EXTRACTED` result includes all project rows across the registered entity tables, their actual native versions and values, every retained relationship and asset association, and all original asset bytes.

Unexpected native records remain visible in the complete extract. Receiving never deletes them automatically. For explicitly written and version-guarded records, outgoing relationships are replaced only for source fields supplied by that request; other native records and relationships remain available.

A direct native edit that makes a JSON, boolean or exact text field undecodable remains visible with its original native value and a `decoding_issues` entry. Binary native columns are returned with their complete base64. This lets the application show and reconcile actual target differences.

Retain the first `APPLIED` result and later `EXTRACTED` observations separately. The first answers what the original request committed; each later extraction describes the native target at its own observed boundary. Use the full native record, relationship and decoded asset comparisons in the workbench before accepting a receiving run.

## Extract the actual original Word forms

Select the complete original file already retained in the project. The extractor opens the ZIP package directly, verifies member CRCs, retains every original member and reads the original XML. It resolves the main document through package relationships and accepts transitional and strict Word namespaces.

```sh
"$IANZ_PYTHON" "$IANZ_PRODUCT/receiver.py" form-map \
  --input "$IANZ_WORKSPACE/originals/application-for-accreditation-lab.docx" \
  --output "$IANZ_WORKSPACE/forms/application-for-accreditation-lab.form-map.json"
```

The result uses schema `tjlabs.accreditation-docx-form-map.v1`. Bind an accepted form mapping to `original.sha256`; changing the document bytes creates a distinct source edition.

The complete result contains:

- `original`: actual filename, byte count, SHA-256, declared Word package media type and complete original ZIP base64.
- `members`: every complete original member, byte count, SHA-256, CRC, compression, original ZIP metadata and base64. This also preserves supporting XML, images, embedded objects and document properties.
- `parts`, `content_types` and `relationships`: actual package roles, namespace declarations, relationship IDs, original targets, internal resolved parts, external references and member existence.
- `paragraphs`: original text, runs, properties, styles, numbering, bookmarks, control/table references and stable part/XML locations.
- `tables`: original rows and cells, grid spans, vertical/horizontal merges, headings, widths, properties, nested tables and paragraph/control locations.
- `controls`: original content-control IDs, tags, aliases, kinds, choices, data-binding XPath/store identity, date/checkbox/repeating properties, visible text and complete original control properties.
- `fields`: simple and complex field instructions/results, begin/separator/end locations, nested field relationships, and legacy text, checkbox and dropdown form properties.
- `section_properties`, `document_properties`, `edition_candidates` and `embedded_assets`: original page/header/footer relationships, property values, printed edition/date label locations, and exact embedded member identities.
- `issues` and `counts`: concrete missing relationships, incomplete field markers or malformed grid values, plus complete package/form counts.

Controls and fields are located by original part plus structural XML path. Repeated groups retain their original parent relationships. Table cells retain the actual grid and merge declarations. A symbol-font code stays in the original run event rather than being substituted with an assumed visible character. Track-change source bytes remain in the package; visible text follows the retained current text rather than deleted or moved-from runs.

Headers, footers, footnotes, endnotes, comments and custom XML remain attached to their original package parts. Printed issue/date candidates include their exact text and location. Select the actual authoritative edition in the application after review; a file timestamp or document modified property does not automatically become the issuer's edition date.

The command returns `MAPPED_WITH_ISSUES` when an original relationship or form structure needs attention while preserving the complete document and its extracted structures. A malformed ZIP/XML or incomplete declared main part returns its concrete error. The default capacities are 256 MiB original and 512 MiB total expanded content; `--max-input-bytes` and `--max-expanded-bytes` can be set for a specific larger original operation.

### Original public form cohort

The source register retains these original IANZ locations. Save and hash each actual response as its own source edition before mapping it.

| Original document | Published source |
| --- | --- |
| Laboratory accreditation application | [application-for-accreditation-lab.docx](https://www.ianz.govt.nz/media/002n2sux/application-for-accreditation-lab.docx) |
| Inspection body accreditation application | [application-for-accreditation-ib.docx](https://www.ianz.govt.nz/media/bhsnk5k5/application-for-accreditation-ib.docx) |
| Change notification | [change-notification-form.docx](https://www.ianz.govt.nz/media/ql1lk53p/change-notification-form.docx) |
| Credit terms application | [application-for-credit-terms.docx](https://www.ianz.govt.nz/media/xiron5y4/application-for-credit-terms.docx) |
| Laboratory reassessment application | [application-for-reassessment-lab.docx](https://www.ianz.govt.nz/media/wreneoug/application-for-reassessment-lab.docx) |
| Inspection gap analysis | [ianz-gap-analysis-17020-2026.docx](https://www.ianz.govt.nz/media/me1pcvar/ianz-gap-analysis-17020-2026.docx) |

Run `form-map` on each complete retained DOCX. PDF scopes remain original binary assets with their own editions and source/page references; `form-map` handles Word packages. The application retains the public structured transcription separately from each actual original file and its digest.

## Fill an original template and retain its successor

The same receiver creates actual document output from saved selections in the original form map:

```sh
"$IANZ_PYTHON" "$IANZ_PRODUCT/receiver.py" form-fill \
  --input "$IANZ_WORKSPACE/originals/application-for-accreditation-lab.docx" \
  --mapping "$IANZ_WORKSPACE/forms/saved-fill.json" \
  --output "$IANZ_WORKSPACE/forms/filled-result.json"
```

The workbench saves the selected original location and either the exact canonical source value chosen by the operator or an explicit replacement. The fill mapping has schema `tjlabs.accreditation-docx-fill.v1`:

```json
{
  "schema": "tjlabs.accreditation-docx-fill.v1",
  "original_sha256": "<exact original.sha256 from the form map>",
  "changes": [
    {
      "part": "word/document.xml",
      "locator": "<exact original paragraph, run, text, control or field locator>",
      "text": "<explicit replacement text>",
      "expected_text": "<original visible text at that location>"
    },
    {
      "part": "word/document.xml",
      "locator": "<exact original choice control or dropdown field locator>",
      "choice_value": "<one actual original native choice value>",
      "expected_text": "<original visible text at that location>"
    }
  ]
}
```

The angle-bracket values above describe fields to populate from the actual saved source. Every change uses one of `text` or `choice_value`. `expected_text` is optional; when supplied, it must match the selected original text exactly. The original SHA-256 is always required and binds all part/locator selections to the complete original ZIP bytes.

Supported targets are original text nodes, runs, single paragraphs, plain/rich text content controls with one paragraph, original dropdown/combo controls, and complete original legacy `FORMTEXT`/`FORMDROPDOWN` fields. Use the original content control or field location when its content belongs to that native control. This keeps its choice properties and visible result together.

The receiver resolves every selection against the same original document before writing. Overlapping selections fail as a whole. Text replacements preserve original run properties and other content outside the selected location. Explicit LF newlines and tabs become native line-break/tab elements within a selected run, paragraph or text control. Select the enclosing run or paragraph when a replacement needs those characters; an individual original text node accepts ordinary text.

A dropdown must name one actual original `choice_value`. The original display label becomes its visible text. The native content-control last value or legacy dropdown selected index is updated with that result. A combo box also accepts explicitly entered text. Legacy text fields retain their original field code and honor an original maximum length.

Structural edits, repeating groups, nested controls, custom-XML-bound controls, locked content, tracked structural revisions, calculated fields and unsupported typed controls return their concrete original-location error. A signed package requires its unsigned editable original. The extractor retains all of those original structures; filling applies only the selected supported operation.

The returned schema is `tjlabs.accreditation-docx-fill-result.v1`:

| Member | Retained output |
| --- | --- |
| `original` | Original filename, byte count, SHA-256 and media type |
| `output` | Complete successor DOCX filename, byte count, SHA-256, media type and base64 |
| `mapping`, `mapping_sha256` | Exact saved mapping and digest of its original UTF-8 file bytes |
| `changes` | Original part/locator, target kind, original text, actual replacement and selected native choice where applicable |
| `changed_parts` | Each edited XML part's original and successor byte counts/hashes |
| `preserved_members` | Complete inventory of every other original member, with original bytes/hash |
| `counts` | Applied changes, edited parts, preserved members and total package members |

The edited XML preserves original namespace prefixes and declarations, comments, processing instructions and unaffected elements. The new ZIP retains member order, original member metadata and archive comment. Every unchanged member retains its exact decoded bytes. The receiver reopens the completed successor and compares all members with the intended complete bytes before returning it.

The application saves `output.base64` as a separate original document edition linked to `original.sha256`, together with the saved fill mapping and changes. It keeps the earlier original unchanged. For direct CLI operation, the complete result file can be decoded to a new local file:

```sh
"$IANZ_PYTHON" - "$IANZ_WORKSPACE/forms/filled-result.json" \
  "$IANZ_WORKSPACE/forms/application-for-accreditation-lab.filled.docx" <<'PY'
import base64
import hashlib
import json
from pathlib import Path
import sys

result = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
output = result["output"]
data = base64.b64decode(output["base64"], validate=True)
if len(data) != output["bytes"] or hashlib.sha256(data).hexdigest() != output["sha256"]:
    raise SystemExit("The complete filled document differs from its native output identity.")
with Path(sys.argv[2]).open("xb") as stream:
    stream.write(data)
PY
```

Run `form-map` on that completed successor to reopen its actual controls and visible content. Select its new source edition in the workbench, retain the predecessor link and export the complete project. A later recipient can inspect both originals and repeat or amend the same explicit field mapping against the corresponding source SHA.

Native Word choice behavior follows the original XML properties documented for [content-control last values](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.sdtcontentdropdownlist.lastvalue) and [legacy dropdown selection](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.dropdownlistselection).

## Independent installation and portable continuation

Receive the application's complete handover using its maintained project receiver. Retain the installed source, original contract, complete editable project, source register, frozen requests, native results/extractions, form maps, full original assets and their hashes.

For the same native operation, select the existing database with its persisted environment ID and recover by the original request ID. Keep later extracted observations alongside the original result. When moving that database, use a complete closed database copy or SQLite's online backup API so the retained native rows and request journal belong to one consistent snapshot.

For a new independent target, initialize a new database with `describe`, save its actual returned schema and environment, and prepare a new receiving run in the received project. The new target creates its own native IDs; predecessor IDs stay associated with their original environment. Compare the returned complete records, relationships and all decoded asset bytes with the received source project.

Open each received original form mapping from its original bytes. Make the intended mapping, source selection or field change in the editable project, preserve its predecessor relationship, and prepare a successor request using the applicable observed target IDs/versions. Export the updated full project through the application so the next recipient receives the original delivery, new revision, original document bytes, accepted mappings, native operation history and the actual successor result together.

## Maintained source

The canonical field definitions are in [contracts/data-contract.json](contracts/data-contract.json). The process ABI is [contracts/native-protocol.md](contracts/native-protocol.md). The complete public source cohort is [examples/original-cohort.json](examples/original-cohort.json). The implementation is [receiver.py](receiver.py).

All installation and application entry points should call this maintained receiver. A restored project continues the original source and native identities through the same command contract.
