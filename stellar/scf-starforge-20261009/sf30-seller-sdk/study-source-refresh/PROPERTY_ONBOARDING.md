# Property survey spreadsheets

The **Survey spreadsheets** area imports retained CSV and XLSX exports into the existing Property Research workflow. The same application owns document retention, study identities, complete survey editions, source revisions, staff review, purpose-specific comparable selections and receiving packages.

Use this workflow for a property's profile export, its separate unit/rent schedule export and any published comparable-purpose table. A flat export can be selected twice: one table maps the repeated property fields; another maps schedule fields with the original property key. Repeated property rows must agree in their mapped values. Conflicting values are shown for correction before an edition is created.

## Complete operator workflow

Open the original installed Study application and select **Survey spreadsheets** in the sidebar.

1. Retain each original CSV or XLSX. Enter a stable source key, title and exporting system/report reference. A customer export uses an explicit local source reference; a published original keeps its real URL. Keep the same source key for a later export from that source. Retaining a new edition produces a separate content identity and preserves the previous bytes.
2. Enter the study name, stable key, effective date and market-area basis, or use an existing survey's study. Bind any retained published PDF or other cited documents in the complete mapping JSON. The original Property source-document import remains available for those files.
3. Add property, schedule and published-purpose tables. Select the exact retained source, CSV encoding/dialect or XLSX sheet, header row and data range. Inspect the original headers and cells. Column numbers are one-based; duplicate or blank header labels do not determine identity.
4. Map each target field explicitly. **Map exact matching headers** adds visible proposals only for exact field-name matches. Review the proposed columns and conversion settings. Add constants for values that apply to the complete selected table, such as the original rent basis, currency or a source citation.
5. Preview the complete selection. The preview shows included, excluded and invalid source rows; raw cells; formula/cache metadata; each conversion; exact typed values; property/schedule/purpose counts; and changes against the previous survey. Page through the results. Exclusions require a reason. Missing selected row numbers are errors.
6. Save the immutable mapping and create the survey at the exact preview identity. Receiving retains the complete plan and row map as original Property documents, calls the existing survey intake, then creates its original change review. A changed mapping or source requires a new preview.
7. Open the original change review, record source decisions, and freeze the staff-selected comparable cohort separately for each study purpose. Use the existing Property report, CSV/JSONL and complete package export.
8. Receive that complete package through **Delivery & reopen**. Its original documents include the raw exports, saved mapping, complete row map, source projection and transitive survey editions. **Open retained row map** works in the receiving workspace. **Continue revised source** opens the same mapping against the received edition.

The original published comparable-purpose rows and the operator's own selection remain distinct. A property's operating unit count, schedule unit counts, programme subsets and the units selected for a particular market-rate or assisted-housing comparison retain their separate meanings.

## Table and conversion contract

The saved value uses schema `stellar-forge.property-onboarding-plan.v1`.

| Plan field | Meaning |
| --- | --- |
| `name` | Operator label for this immutable mapping |
| `study` | Original Property study object, including stable key, market area, effective date and subject |
| `document_ids` | Original document key → retained document ID; includes every table source and every cited report |
| `previous_id` | Existing survey edition for the source-revision comparison, or null for an initial survey |
| `omitted_records` | `review_removed`: candidate omissions enter the original removed-record review |
| `tables` | Ordered source selections and explicit property, schedule or purpose mappings |
| `note` | Mapping notes; the receiving action separately records its operator and revision note |

Each table has a stable `key`, `kind` (`properties`, `units`, `comparables`), exact `document_id`, `reader`, `fields`, `hidden` policy and `selection`.

A schedule table maps `property_key` and schedule `key`. A published-purpose table maps `purpose`, `property_key`, strict Boolean `selected` and `reason`. These keys join the original property record. A missing parent, duplicate schedule or duplicate purpose/property pair is an error.

Property fields include the original profile fields, observation dates/label, status, programmes, amenities, waitlist, parking, citations, original reported fields and optional complete schedule JSON. Schedule fields include separate size/rent bounds, raw rent/AMI expressions, rent basis/period/currency, units/vacancies, utilities and original citations. The authoritative field/type list is returned by `property.onboarding.fields`.

### CSV source

The reader uses Python's standard CSV parser with explicit dialect and encoding. It retains logical row numbers and physical line spans, including multiline quoted fields. Supported encodings are UTF-8, UTF-8 with BOM, UTF-16 and Windows-1252. No delimiter or number-format guessing occurs.

```json
{
  "kind": "csv",
  "encoding": "utf-8-sig",
  "delimiter": ",",
  "quotechar": "\"",
  "escapechar": null,
  "doublequote": true,
  "header_row": 1,
  "start_row": 2,
  "end_row": null,
  "first_column": 1,
  "last_column": null
}
```

The inspected header/first data row determines an omitted last-column bound. Set an explicit bound when the export has additional trailing columns. The complete original file remains retained, including records outside the chosen range.

### XLSX source

The application imports the maintained `dataset-refresh/workbook/reader.py` and uses its held-file `Workbook` API. It preserves the original workbook epoch, sheet metadata, raw numeric tokens, cell types, formulas, saved caches, hidden rows/columns and merged ranges. It evaluates no formula and fetches no external workbook connection.

```json
{
  "kind": "xlsx",
  "sheet": "Property survey",
  "header_row": 1,
  "start_row": 2,
  "end_row": null,
  "first_column": 1,
  "last_column": 24
}
```

The first source inspection may choose the original first sheet for display. A saved mapping requires the explicit actual sheet name. Merged-cell values are not filled into other cells. Inspect their original coordinates and map the intended data cells or an explicit constant.

### Field conversion

Each field chooses exactly one original `column` or an explicit `constant`.

```json
{
  "rent_min": {
    "column": 8,
    "type": "decimal",
    "nullable": true,
    "trim": false,
    "null_values": [""],
    "lookup": [{"from": "Subsidized", "to": null}],
    "formula": "reject",
    "decimal_mark": ".",
    "group_mark": null
  },
  "rent_raw": {
    "column": 8,
    "type": "text",
    "nullable": true,
    "trim": false,
    "null_values": [""]
  },
  "currency": {"constant": "USD", "type": "text", "nullable": false}
}
```

| Type or option | Behavior |
| --- | --- |
| `text` | Retains the string exactly, unless explicit trim/lookup was selected |
| `decimal` | Uses native decimal-string semantics; no binary floating-point conversion |
| `integer` | Requires an exact integral token; original count/year bounds still apply |
| `date` | Exact ISO date, or `date: "excel"` using the original workbook's epoch and date converter |
| `boolean` | Actual Boolean, or exact `true`/`false`; other tokens require explicit lookup |
| `strings` | Explicit separator (`strings_format: "split"`) or a complete JSON array (`strings_format: "json"`) |
| `json` | Complete original object/array/scalar, useful for citations, waitlist, source differences and original fields |
| `null_values` | Explicit source strings that become null; zero remains a value |
| `lookup` | Ordered exact source-token replacements; the before/after value is retained |
| `formula` | `reject`, original saved `cached` value, or original formula `text`; missing caches are errors |
| `decimal_mark`, `group_mark` | Explicit numeric punctuation; grouping must be valid groups of three digits |

Month-only observations remain `observation_label` values. Do not manufacture day bounds. Retain original rent ranges as separate minimum and maximum strings. A subsidized-rent label can remain in `rent_raw` while its numeric bounds stay null. Use separate fields for publication date, observation period, study effective date, construction and renovation.

Map a complete citation array when the table carries original published-report references. Otherwise the importer creates a citation to that exact retained CSV/XLSX row. Spreadsheet cell provenance is kept separately in the row map; it never replaces a supplied PDF page/printed-page citation.

### Row selection and omissions

```json
{
  "hidden": "exclude",
  "selection": {
    "mode": "all",
    "rows": [],
    "exclude": [{"row": 18, "reason": "Summary row, not a property record"}]
  }
}
```

Use `mode: "only"` with explicit row numbers to select a subset. Hidden and blank rows receive recorded exclusions. Every processed row, including invalid and excluded rows, is written to the complete row map. Included rows with conversion or join errors prevent receiving. Excluded originals remain in the raw file and row map.

The candidate is a complete proposed survey edition. Properties omitted from it appear as removed in the original change review; the previous edition is retained. A staff reviewer must resolve that comparison before a purpose selection can be exported.

## CLI and agent operations

All calls go through the existing application dispatcher:

```sh
starforge study-source-refresh --python /usr/bin/python3 \
  --workspace /private/studies/customer call property.onboarding.preview \
  --arguments /private/study-inputs/mapping-preview.json
```

That arguments file contains `{"value": COMPLETE_PLAN, "offset": 0, "limit": 20}`. The corresponding save arguments contain `value` and `operator`. The receiving arguments are:

```json
{
  "plan_id": "EXACT_SAVED_DOCUMENT_ID",
  "expected_projection_sha256": "EXACT_PREVIEW_SHA256",
  "operator": "Study operator",
  "label": "Reviewed source edition",
  "note": "Reason for this source revision and row exclusions"
}
```

| Native operation | Merchant tool suffix |
| --- | --- |
| `property.onboarding.fields` | `property_onboarding_fields` |
| `property.onboarding.source` | `property_onboarding_source` |
| `property.onboarding.plans` | `property_onboarding_plans` |
| `property.onboarding.plan.save` | `property_onboarding_plan_save` |
| `property.onboarding.plan.read` | `property_onboarding_plan_read` |
| `property.onboarding.preview` | `property_onboarding_preview` |
| `property.onboarding.prepare` | `property_onboarding_prepare` |
| `property.onboarding.retained` | `property_onboarding_retained` |
| `property.onboarding.rows` | `property_onboarding_rows` |
| `property.onboarding.continuation` | `property_onboarding_continuation` |

Merchant names begin `merchant_study_`. The original host-declared workspace, private connection, input aliases and retained-file transfer remain the agent interfaces. Mapping save/preview accept the complete value inline or the same verified retained JSON input. The original property-document import receives large source files. The ten onboarding operations bring this component's complete Merchant surface to 61 tools.

## Receiving and recovery

The immutable plan and projection are ordinary records in `property_documents`; there is no additional database or receiving schema. The original Property package already carries all edition-bound documents and all original packets. A package's frozen selection remains independent of a later local review.

Identical prepare calls recreate the same content identities and reopen the existing native survey and current review. A changed source, mapping or projection hash cannot be received under the old preview. Plan lookup and retained row-map reads verify the original document bytes, original projection/packet hashes and source bindings.

The generic Study exporter also repairs its original export-index entry when the complete package rename survived but the SQLite commit did not. It verifies the existing package and original operation identity before restoring that missing row and its recovered event. Existing completed export entries are preserved.

## One complete original-source journey

`examples/property_onboarding_journey.py` accepts real retained baseline and revised intake files, the original document map and the existing purpose-selection plan. It creates explicitly labelled authored CSV/XLSX projections of those exact inputs, runs the original mappings and correction review, exports the original purpose selections, receives a full package and reopens the retained mapping/row map. It also exercises the original HTTP and CLI read paths.

```sh
python3 -B examples/property_onboarding_journey.py \
  --intake /private/originals/baseline-intake.json \
  --updated-intake /private/originals/revised-intake.json \
  --documents /private/originals/document-map.json \
  --selections /private/originals/purpose-selections.json \
  --out /private/studies/onboarding-operation
```

The inputs remain original customer/publication evidence. Generated CSV/XLSX files are labelled projections of those original intake bytes. A retained native result records actual phase outcomes and input hashes. Reuse the same selected operation/output directory after interruption; the original content identities preserve completed receiving.

When a completed generic Study package is available, `--study-package` adds the same native export-recovery case using its actual source/comparison. This intentionally raises at the SQLite commit boundary after a completed rename, then reopens and adopts that same verified package through the maintained exporter.
