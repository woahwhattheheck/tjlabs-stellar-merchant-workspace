# Edition-specific BDNB dictionary normalization

This source completes the dictionary seam between the original Nord source acquisition and the existing Ntico ten-stage receiving programme. The operation remains **BDNB-NORD-SOURCES-2769-20261013**. The receiving owner is 2769; acquisition and native admission stay with that original owner.

## Delivered source

- `normalize_dictionary.py` reads the complete acquired original workbook and its `dictionary-members.json`, resolves actual sheet titles, preserves exact schema-cell references, validates the result with `bdnb_source.source_dictionary`, and publishes through `bdnb_source.publish`.
- `dictionaries/2026-02-a-v0.7.11-official.json` contains all 46 columns of the five current official tables, original SQL display types/sizes/nullability, documented primary keys, geometry/weight meanings, and separately labelled logical references.
- `prepare_receiving.py` remains the existing complete acquisition-to-importer join. Its `editions[].dictionary` field receives the normalizer's exact `dictionary` result object, unchanged.

The current HTML mapping supplies the source definition. The normalizer binds it to the actual selected workbook and produces the existing join's file identity and provenance. It does not initiate acquisition, a product process, a cloud worker, or a new receiving operation.

## Official source and version boundaries

Official schema: https://bdnb.io/schema/latest/

At the 2026-10-13 retrieval it identifies **2026-02.a, v0.7.11**, generated 2026-06-04 15:11 GMT. The `/latest/` URL is mutable. The mapping retains that explicit edition and the digest of each retrieved table extraction.

| Table | Complete columns | Original primary key | Published geometry |
| --- | ---: | --- | --- |
| batiment_groupe | 10 | batiment_groupe_id | geom_groupe: multipolygon, Lambert-93 |
| adresse | 12 | cle_interop_adr | geom_adresse: point, Lambert-93 |
| rel_batiment_groupe_adresse | 12 | batiment_groupe_id + cle_interop_adr | geom_bat_adresse: geometry, SRID 2154 |
| passage_millesime_batiment_groupe_id | 7 | transformation_id | None |
| metadonnees_bdnb_version | 5 | No published primary key | None |

Complete official table pages:

- https://bdnb.io/schema/latest/bdnb_v07/tables/batiment_groupe.html
- https://bdnb.io/schema/latest/bdnb_v07/tables/adresse.html
- https://bdnb.io/schema/latest/bdnb_v07/tables/rel_batiment_groupe_adresse.html
- https://bdnb.io/schema/latest/bdnb_v07/tables/passage_millesime_batiment_groupe_id.html
- https://bdnb.io/schema/latest/bdnb_v07/tables/metadonnees_bdnb_version.html

The SchemaSpy constraints report at https://bdnb.io/schema/latest/bdnb_v07/constraints.html reports zero foreign-key constraints; table parent/child cells are blank. Its relationship report states no detected relationships. The relation-table prose documents the many-to-many links to building groups and addresses. The mapping records these as `logical_references` with `sql_constraint: false`. A matching column name is not a database constraint. Cross-edition old/new IDs are edition-qualified logical links, not foreign keys into today's building table.

The six `poids_*` fields are numeric(7,3). Their denominator is the total area or number of premises served **by the address**, across the corresponding buildings. They are not generic building-normalized shares. `fiabilite` has a documented 0–20 score, retained as a documented range. Fictive building geometries retain their flag. The crosswalk omits unchanged IDs; absence alone does not establish creation or deletion.

### The predecessor is independent

Official 2025 catalogue: https://bdnb.io/archives_data/bdnb_millesime_2025_07_a/

This is **2025-07.a, v0.7.10**. Its own changelog removes `lien_valide` and `classe` from `rel_batiment_groupe_adresse`. Their removal predates the current 2026 dictionary. The normalizer rejects those removed columns for either selected edition.

The remaining historical fields come from the actual 2025 workbook cells. Current HTML is not relabelled v0.7.10. Historical field types/nullability must come from observed workbook columns. The importer's primary-key identity contract is retained and labelled as that contract; it is not presented as an independently observed historical SQL constraint. Historical geometry type and foreign-key declarations are not copied from the current edition.

## Original workbook custody

Both full XLSX files are retained on the original source page:
https://app.notion.com/p/3f8dd772310081068f0ce0edc01f2eb7

| Edition directory | Millésime | Structure | Complete XLSX bytes |
| --- | --- | --- | ---: |
| 2025-07-a | 2025-07.a | v0.7.10 | 176304 |
| 2026-02-a | 2026-02.a | v0.7.11 | 202737 |

Immutable original URLs:

- https://open-data.s3.fr-par.scw.cloud/bdnb_millesime_2025-07-a/millesime_2025-07-a_doc/documentation.xlsx
- https://open-data.s3.fr-par.scw.cloud/bdnb_millesime_2026-02-a/millesime_2026-02-a_doc/documentation.xlsx

The current workbook's retained publisher SHA256 is `c4ef2411cd5f9848430786ba6ee2eca24204ffd99063ed00395a0fe6121bdbec`. The predecessor's whole digest is computed from its received binary.

The mutable data.gouv resource identifier can change editions. Use the immutable versioned workbook URLs and complete acquisition receipts. Carrier `89faaca6bf933b37b9ba2ba18ab8dad305fbf11b` retains all four original catalogue/YAML bodies and both XLSX references. Acquisition's existing `workbook()` banks the entire cell index before the large ZIP download. Dictionary preparation can advance before `complete.json` exists; full source joining still requires the original complete acquisition.

## Run in the original receiving checkout

Use the actual complete selected canonical checkout, with the normalizer added to its exact source roster. The original 150-file feature carrier does not replace the whole base checkout. Every roster member is verified before the maintained API is imported; every loaded local dependency must belong to that roster. Retain original support modules and `bdnb_dictionary.json`.

These commands describe the same original owner's continuation. Resolve variables to actual retained paths before running.

```sh
python3 "$checkout/products/ntico/bdnb-territory/normalize_dictionary.py" \
  --input "$dictionary_input" --output "$dictionary_output" --inspect

python3 "$checkout/products/ntico/bdnb-territory/normalize_dictionary.py" \
  --input "$dictionary_input" --output "$dictionary_output"
```

`--inspect` publishes `workbook-inspection.json`: actual worksheet member/title, row counts, first 12 rows, and every row matching a known table or current field name. Current names are search hints, not an asserted predecessor schema. All original cells remain in the complete source index.

Use the actual inspection to select worksheet layouts, then run normalization. Header positions, nullable tokens, historical definitions and CSV serialization must be observed from the source. The original receiver can make these selections directly from the cells.

### Complete input contract

Schema: `commons.bdnb-dictionary-normalization.v1/input`.

| Field | Required content |
| --- | --- |
| checkout | Canonical absolute original complete checkout |
| source_files | Exact complete roster: path, bytes, sha256 per repository-relative file |
| acquisition_root | Canonical absolute original retained source root |
| edition | Exactly 2025-07-a or 2026-02-a |
| selection | Actual absolute edition/selection.json path, bytes, sha256 |
| workbook | Actual absolute original edition XLSX path, bytes, sha256 |
| index | Actual absolute edition/dictionary-members.json path, bytes, sha256 |
| layouts | Actual complete table ranges; required for normalization |
| table_semantics | Optional unchanged source-bound CSV interpretation |

`selection.json` must identify the same directory, millésime, structure and immutable dictionary URL. The index's `original` member must match the whole workbook's root-relative path, bytes and SHA. Its complete inventory and worksheets are retained. Actual sheet titles come from `xl/workbook.xml` and worksheet relationships. Formulas remain unevaluated; selected schema properties must be direct cell values.

Each layout has `member`, inclusive positive `first_row` and `last_row`, `field_column`, and exactly one of `table_column` or `table_name`. A fixed name must appear as the exact original sheet title or direct cell value in that sheet. For a common multi-table sheet, select its observed table-name column. Blank table cells are not filled down implicitly.

Optional property columns: `sql_type_column`, `size_column`, `nullable_column`, `description_column`. Values are actual Excel column letters. `nullable_column` requires `nullable_values` with distinct, nonempty `true` and `false` string-token lists. These are workbook property tokens, not source CSV null markers.

For v0.7.10, actual SQL type and nullable columns are required for every field. Supported observed PostgreSQL types: varchar/character, text, int2/int4/int8, numeric/decimal, bool, date, geometry. A separate size column can supply varchar length or numeric precision,scale. Declared geometry SRIDs other than 2154 require the original importer's source repair; coordinates are not silently transformed.

For v0.7.11, all 46 names must be covered without extras or duplicates. Provided type/size/nullability properties are checked against the current HTML definitions. If a property column is absent, the current HTML supplies it and the original selected cells remain in provenance. A name-only workbook crosscheck does not become an independent workbook type/nullability claim.

Select whole schema row ranges, excluding headings/commentary. Duplicate rows or fields fail. The output retains the selected row roster, table/field/property cells, worksheet title, full workbook/index hashes and exact input.

### CSV interpretation

`table_semantics` uses the existing join's fields for each actually received table:

- `null_values`: explicitly selected string tokens; an empty list is allowed.
- `geometry_encoding`: wkt, ewkb-hex, geojson-text, or opaque.
- `extra_fields`: original importer extra-field declarations.
- `provenance`: actual nonempty source/interpretation record.

SQL nullability and the HTML display `default null` do not establish CSV null markers. The compiler does not automatically select empty strings, NULL or another token. PostgreSQL geometry and EPSG:2154 do not establish CSV serialization.

Supplied semantics are carried unchanged. `prepare_receiving.py` checks them against all actually acquired tables, preserves original parser representation and validates the complete descriptor through the maintained importer. Without supplied semantics the dictionary is still produced, and the result retains `table_semantics: null` until that original receiving input is completed.

## Outputs and original programme integration

Normal publication writes:

1. `<edition>-dictionary.json`: complete `stellar-forge.bdnb-dictionary.v1`, all five tables.
2. `<edition>-dictionary-binding.json`: exact dictionary path/bytes/SHA/workbook SHA/provenance, unchanged supplied semantics, complete source roster and verified inputs.

Publication uses the original create-only API. An identical rerun reuses exact bytes; changed inputs use a new explicit output directory. The binding file is published last. Failures return nonzero before a successful complete receipt is printed.

Copy each binding's complete `dictionary` object into the corresponding original `editions[]` entry of `commons.bdnb-acquisition-receiving-join.v1/input`. Preserve its `directory`, `request_id` and `edition_id`. Carry actual table semantics for precisely the tables received by acquisition. Preserve all original producer/customer actions.

Run the already shipped `prepare_receiving.py --input ... --output ...` from the same checkout. It replaces the two matching original `bdnb.import` bodies, preserves the other ten-stage actions, and calls `bdnb_receiving.validate_input`. Continue `receiving.py` with the original saved IDs/resume state, as described in `INPUT_JOIN.md` and `RECEIVING.md`.

Original source intake:
https://tokenjunkielabs.slack.com/archives/C0BU51F1PL3/p1791883403619349

Original Ntico owner case:
https://tokenjunkielabs.slack.com/archives/C0BTTA66TK3/p1791891315000469?thread_ts=1791871336.425939

The Action Logement chapter remains in this case and existing offer F0C8KGNBAPM. Detailed requirements come through the original portal document request; dictionary definitions do not substitute for the buyer's technical DCE.

# Rendered product inspection policy

## Standing lab rule: inspect the rendered product before presenting it

Bryce's direct owner instruction, October 13, 2026. This applies to every current and future lab peer, provider, model, harness, local session, cloud session, and delegated or child worker.

Before calling a client/prospect-facing app, site, dashboard, demo, report, presentation, or export ready, or putting it before a client/prospect, the responsible producing peer MUST open/run/render the exact outgoing version and visually LOOK at the actual result. Inspect at the actual screenshare/presentation width and at narrow/mobile widths where relevant. Operate critical controls; inspect applicable loaded, empty, loading, and error states; exercise downloads/exports and reopen the delivered files. Capture real screenshots or rendered page images and actually VIEW them. Capturing without viewing does not satisfy this rule.

This includes ALL attachments. Literally observe the actual thing the way a user or recipient would see and use it: open and view downloaded HTML, every relevant PDF/report page, slides, spreadsheets, maps, images, video/audio, archives and project attachments in their normal recipient-facing viewer or application; play audiovisual media and inspect the usable contents of archives/projects. Metadata, schemas, source text, and a browser link do not substitute for opening the attachment and using the delivered result normally.

Fix ugly, cramped, broken, unstyled, clipped, overflowing, or unreadable results within the authorized task before presenting them. Favor simple industrial/plain presentation, consistent spacing and typography, readable tables, and working controls. Do not add decorative template slop. Source review, unit tests, HTTP 200, DOM counts, a reviewer/model approval, or an evidence form do not substitute for looking at and operating the real outgoing product.

This is focused internal product validation, never permission to build or submit a proof, test, or verification product, run broad suites, or repeatedly recheck an unchanged accepted version. Building and integrating the actual deliverable remains the main work; do not substitute endless reviews for delivery. Retain an exact-version visual receipt in the handoff: source/head or artifact hash, URL/file, viewport sizes, screenshots actually viewed, controls/states/export files exercised, fixes, and any precise unresolved gap. A changed outgoing version needs inspection of the affected result.

Bryce explicitly clarified: "that includes all attachments and this does not become review theatre or test theatre you need to literally observe the actual thing the way a user would see and use it". A checklist, screenshot folder, receipt, passing test, or parallel review bureaucracy is not the requirement or a substitute for actual observation and normal use. Perform focused fixes and keep shipping the main work; create no review or approval gate.

Bryce also instructed: "also add that if u make a video use voice gen tts not robot voices, use generative stuff we have models, use them". For video/media narration, use available high-quality generative voice/TTS and applicable generative visual/media capabilities when helpful, with natural professional delivery instead of robotic default voices. Actually play/listen/watch the final exported attachment and inspect clarity, pronunciation, pacing, timing, and audio alignment. Reviewing a text script does not substitute for experiencing the final video/audio. This adds no paid-service purchase or real-person voice-cloning authorization; preserve lab attribution and third-party copyright/license controls.

Pass this rule to child/delegated workers and persist it in owner-controlled provider/project/cloud instruction copies. Record delivery and readback coverage; never claim every running session loaded it without evidence. This rule creates no hooks, watchers, restarts, approval queue, credential restrictions, or new publication authority. Preserve all existing owner rules, including no llama.cpp, no private GitHub repositories or Actions, focused validation, attribution, incident communication, personal meeting approval, contact holds, demo pauses, bounty restrictions, and owner cutoffs.

Canonical local policy: `C:/Users/lucys/.commons/rendered-product-inspection-policy.md` and `.json`. Portable repository copy: `docs/policies/rendered-product-inspection-policy.md` and `.json` when present. Only Bryce can change this standing rule.

