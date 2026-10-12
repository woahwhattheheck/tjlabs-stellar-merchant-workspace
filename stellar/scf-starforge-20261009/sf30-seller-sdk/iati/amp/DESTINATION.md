# AMP destination semantics and complete receiving

This component supplies the configured destination checks used by the existing IATI AMP commissioning workspace. It is an original Python implementation of the documented integration behavior. It does not start another AMP server, create a workspace, acquire credentials, perform a network request, write a database, send a commercial message, or issue an approval.

The source selection is [devgateway/amp e067f9115fbe0ad0ef19bf5d9cc6fff061b8378e](https://github.com/devgateway/amp/tree/e067f9115fbe0ad0ef19bf5d9cc6fff061b8378e). The customer's installed version, workspace, authenticated user, field metadata, value lists and full original projects remain separate, explicit inputs. The published architecture and installation guides describe different named versions; a guide cannot substitute for the selected installation's actual layout.

## Integration

Place destination.py beside the existing amp/codec.py, domain.py and native.py. It uses the original exact Decimal JSON decoder/encoder and iati_source.InputError. Keep the existing workspace, operation IDs, SQLite transaction, revision checks, original body hashes, raw HTTP responses and source-file archive.

The four entry points are:

| Function | Input | Result and original join |
|---|---|---|
| required_value_fields(fields_json) | Complete original /activity/fields UTF-8 JSON | Sorted full native paths for the existing authenticated field-values capture. |
| analyse_capture(capture) | Original connection, metadata, values, projects, session/layout, acquisition and declared coverage | Every configured field, exact original JSON identities, selected project IDs, value coverage and complete findings. |
| validate_project(project_json, capture) | Complete prepared request JSON and the selected capture | Required/importable/type/value/date/length findings, original update identity/version checks, unknown fields and remaining native business predicates. |
| compare_project(request_json, received_json, capture) | Complete prepared request and the full original project read after its write | matched, differences, generatedFields, exact original JSON, pairings, configuration/request findings and source identities. |

All JSON arguments remain original UTF-8 strings or bytes. Numbers are parsed with Decimal, never through a browser or Python binary float. Output contains JSON-safe exact numeric text with explicit value types, while the complete request and response strings retain their original lexical representation.

The capture has the original shape:

- connection: baseUrl ending in /rest, workspaceId, installedVersion and optional expectedUserId.
- fieldsJson, valuesJson and projectsJson: full original JSON strings.
- sessionJson and layoutJson: full native source strings; their user-id, workspaceId and ampVersion are compared with the selection.
- coverage: kind explicit-projects or native-export, the exact projectIds and a source-bound scope note.
- acquisition and exchanges: the original acquisition description and response records supplied by the existing source receiver.

A source inspection can exist without an authenticated session. The report says so. Actual authorization and permission remain the original native session's responsibility.

## Capture the installed configuration completely

Run required_value_fields on the exact installed field array before the original native values request. The public APIField does not serialize the Java PossibleValuesProvider class. Therefore this function requests every importable scalar or primitive-list leaf, plus explicit id_only and common-possible-values fields. A known field with no enumerable provider returns an empty list in the pinned source. Such an explicit response is retained; an unreceived field is not treated as an empty list.

The original client may divide that returned list into bounded requests when the full field-values response would exceed its existing 64 MiB response limit. Retain every complete raw response and selected request path. Combine only matching response keys from that same installation; do not overwrite a conflicting repeated key. Values from another workspace or another field name are not interchangeable even when their numeric IDs happen to match.

Use native keys exactly. Full paths use the tilde separator. Native PossibleValue records retain id, value, translated-value, extra_info and children. Tree and flat representations both retain all selectable parent/child IDs. Conflicting records for the same ID are reported.

The original /activity/projects enumerator at this source selection excludes its last list element. This adapter therefore compares the explicit declared full-project selection with the retained full records. It never infers complete country coverage from an apparently exhausted page. The integration owner retains the original selected project reads or original native export.

## Prepare a whole project

The upstream required statuses are Y (always), ND (non-draft) and N. They are not Boolean flags. Dependencies are names of Java business predicates; their executable conditions are not supplied by APIField. The local report preserves them as native checks rather than inventing a predicate.

An update keeps the captured internal_id, the same amp_id and the original activity_group.version. A create has no preexisting amp_id. The native importer verifies the existing business identifier even though that field is not ordinarily importable.

ObjectImporter skips non-importable fields and emits warnings for unknown fields. Accordingly, an attempted change to a read-only source value remains visible, and an unknown customer field remains in the original request. Neither is silently stripped. A subsequent full return comparison shows whether that field survived.

All supplied collections are whole collections. The native importer matches existing child records by the metadata id child and removes old members omitted from a supplied collection. Do not replace a complete original funding collection with only newly mapped IATI rows. Keep the original projects and the mapping owner's exact collection-preservation logic.

The module validates native JSON types, signed-long IDs, original possible-value IDs, required values, string lengths using Java-compatible UTF-16 code-unit counts, percentages and exact date forms. The pinned formats are:

- date: YYYY-MM-DD, exactly 10 characters.
- timestamp: YYYY-MM-DDTHH:mm:ss.SSS±HHmm, exactly 28 characters, including milliseconds and the numeric UTC offset.

The timestamp format is not the more permissive general ISO 8601 grammar. Original strings remain unchanged; equivalent returned timestamp instants are reported separately from substantive changes.

Native locale/default-language checks, Java regex constraints, conditional requiredness, collection percentage/tree/uniqueness rules, workspace feature visibility and permissions remain attached to the full report. They are actually evaluated by the original native importer. Foreign Java expressions are not executed as Python expressions. The module's ready flag means no known local error; it is not an AMP approval or an assurance that undisclosed business rules will accept a write.

Under the original native client flags, ActivityImporter restores created_by and approval fields from the prior project. Keep intended changes to those values visible and review the actual return. An HTTP success status alone does not establish complete field acceptance.

## Reconcile the actual return

The write response can be an ActivitySummary or an API error/warning object. Obtain the full project from the original /activity/projects/{internal_id} route before compare_project. Retain the write response and subsequent full read together. Never turn a summary into a full project by inventing omitted fields.

Comparison covers every requested and returned field recursively, including the complete funding and transaction objects, unknown customer fields and duplicate record multiplicities. It does not reduce a record to amount/date/currency or infer identity from a title.

Configured object collections are paired in this order:

1. Unique retained native identity, including the stable group_versioned_funding for funding records when the captured metadata contains it.
2. Complete semantic content of all remaining fields, excluding declared generated/read-only identities and empty exporter defaults only for pairing.
3. Unreconciled original and received records remain explicit, each with its full content.

The comparison retains original request/received array positions and every pairing basis. Several fully identical records can be reconciled as a multiset, preserving their exact count. That does not prove a unique source-row-to-new-native-ID lineage. equivalentRecordLineageAmbiguous and the per-pair equivalentMultiplicity/uniqueNativeLineage fields preserve that distinction. A following-edition mapping should use the actual retained IDs and the original owner's explicit source-row decision; do not manufacture a unique mapping from equal money.

The native create/save path initializes activity_group. Its generated version is compared inside that known container even when the parent metadata marks the object read-only. Every full received project must include a nonnegative integer version, and an update cannot regress the selected version. Other added nonempty children remain explicit differences; a read-only parent cannot hide an absent or malformed version.

Funding versions can generate new funding_id and transaction_id values. The pinned clone code preserves group_versioned_funding and clears child database IDs. Returned generated identifiers and audit fields are listed with original and actual values. A changed existing group_versioned_funding or amp_id is substantive. A regressed version or a missing/duplicated received child identity is an error.

An omitted optional request field returned as null or an empty collection is an explicit empty-export observation. A supplied null collection returned as [] reflects the original importer's clearing behavior. Nonempty additions, missing supplied fields, changed nested business values, altered exact numbers and unreconciled records remain substantive differences. Reordered configured collections retain their original ordinals and do not silently become source identities.

Exact numeric equivalence and equivalent timestamp instants are reported as representation changes. No tolerance, exchange-rate substitution, amount rounding or currency/period/family aggregation is introduced.

## Original lifecycle and handover

The commissioning owner calls analyse_capture after the original source capture, validate_project before each saved prepared request, and compare_project after each actual complete native return. Store each complete report beside that operation's unchanged source/request/response identities. Existing ambiguity and transport recovery continue to read the original operation before any native retry.

A following publisher edition uses the original refresh and AMP mapping records. Carry the actual preceding native IDs, full projects and explicit source-row mapping forward. Revalidate against a newly captured installation configuration when the version, workspace or field/value source changes. Do not rewrite an earlier report to make a newer result look like the prior selection.

The existing portable archive includes destination.py, this guide, DESTINATION_UPSTREAM.json, all original configuration/project/request/response strings, source IDs, full findings and actual native write/read receipts. Restore through the existing workspace receiver. This component creates no parallel persistence or receiving protocol.

Inputs retain the original codec's 64 MiB JSON limit and 96 nesting levels. Metadata is bounded at 20,000 distinct fields. Reports and pairing lists fail explicitly above 200,000 items instead of claiming a truncated result is complete. Select a smaller original scope if a complete report cannot fit; keep the original source bytes.

## Primary source references

DESTINATION_UPSTREAM.json gives exact Git blob IDs, UTF-8 sizes and SHA-256 values for the inspected source selection. The principal originals are APIField/APIType/FieldType, ObjectImporter/ObjectExporter, ActivityImporter, PossibleValuesEnumerator/PossibleValue, InputTypeValidator/ValueValidator/RequiredValidator/ConditionalRequiredValidator, DateTimeUtil/EPConstants, AmpFunding/AmpFundingDetail and ActivityVersionUtil.

Upstream AMP is published under GPL-3.0. The adapter is original integration code; no copied upstream Java implementation is bundled in this component. Preserve the original licence and notices when the full AMP source or distribution is supplied separately. This source-defined analysis is distinct from the customer's actual installed native acceptance and any accepted commercial engagement.

## Complete collection receiving

The comparison traverses complete native objects and configured collections even when their values are unchanged. This preserves the original request-position/native-child pairings and checks missing or duplicated native child identities on every received collection. The same traversal retains the full activity-group version rules: an actual nonnegative version is required, a returned older version remains a difference, and unexpected nonempty children are compared individually.
