# Native receiver contract

The workbench passes a complete UTF-8 JSON file to a receiving process. Its request digest covers the exact file bytes, including the final newline.

## Commands

- `python3 receiver.py describe --database PATH --contract PATH` initializes the built-in SQLite target and returns its actual table and field metadata.
- `python3 receiver.py apply --database PATH --request PATH` receives the complete frozen request in one transaction.
- `python3 receiver.py lookup --database PATH --request-id ID` recovers the original saved result.
- `python3 receiver.py extract --database PATH --project-id ID` reads complete current target records, assets and relationships.
- `python3 receiver.py form-map --input PATH` extracts the original DOCX controls, tables, repeated groups, choices, footer/header content and embedded asset references.

## Frozen request

`schema`: `tjlabs.accreditation-native-request.v1`. Top-level members: `request_id`, `project_id`, `project_revision`, `mapping`, `tables`, `relations`, `assets`.

`mapping` retains `mapping_id`, `version`, `target_product` and `target_environment_id`.

Each table retains `entity`, `table`, `external_key_field`, `columns` and complete `records`. Each column has `canonical`, `name`, `type`. Each record has `external_key`, `native_id`, `expected_native_version`, and `values` keyed by actual selected native column. Composite external keys use canonical JSON arrays of the original values. Exact decimals remain strings.

Each relationship has `from_entity`, `from_external_key`, `field`, `target_entity`, `target_external_key`. Native association storage happens after all base records have actual IDs.

Each asset has `path`, `bytes`, `sha256`, `media_type`, `base64`, `visibility` and `associations`. An association has `entity`, `external_key`, `field`.

## Returned result

`schema`: `tjlabs.accreditation-native-result.v1`. Members: `request_id`, `request_sha256`, `project_id`, `status`, `tables`, `relations`, `assets`, `counts`.

Each table has `entity`, `table`, and complete records with `external_key`, `native_id`, `native_version`, `values`. Returned values come from native reads. Asset extracts retain full bytes as base64, original paths, byte counts, hashes, visibility and associations. Unselected existing target records remain visible in extracts.

SQLite target columns `_native_id`, `_external_key`, `_project_id`, `_native_version` are separate from the source's 191 canonical fields. Canonical foreign keys remain source keys; the second-pass relation table also retains actual target IDs. Arrays and objects use canonical JSON in native TEXT storage, booleans round-trip as booleans, and exact decimal strings preserve precision.

Request identity, full source hash and original result are committed atomically with target changes. Repeating the same request ID and exact bytes returns the original result. Reusing the ID with different bytes fails. Native version guards protect updates. Receiver work never silently deletes an unexpected target record.
