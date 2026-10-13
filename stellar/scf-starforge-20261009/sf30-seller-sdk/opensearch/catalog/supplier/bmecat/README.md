# Original BMEcat XML source intake

This arm reads the original ETIM BMEcat5.0 XML into the existing material catalogue. It preserves the supplied XML as the catalogue's immutable source, projects explicit supplier fields through the existing mapping/submission APIs, and keeps every unprojected field available for review. It does not replace the supplier profile rule engine.

## Actual format and original source

The supported XML envelope is BMEcat version2005 in namespace https://www.etim-international.com/bmecat/50, with HEADER/USER_DEFINED_EXTENSIONS/UDX.EDXF.VERSION equal to5.0. These are distinct version labels. The retained XSD is file version5.0.1 inside the publisher's BMEcat Guideline5.0.2 archive dated2024-12-12.

The existing originals remain under ../../../examples/supplier-etim/:

| Original | Bytes | SHA-256 |
| --- | ---: | --- |
| SampleFile_bmecat_etim_V5_T_NEW_CATALOG_ETIM10.xml | 18,076 | 50568f0357c982a853eaf523475d18d6f2a594d0c8a392143a4df50007cddf8e |
| bmecat_etim_501.xsd | 99,041 | 821e4dbcec9fa32b64df4298531adc5d3cdab68507686317dd08e8266378b005 |
| etim10-supplier-products.jsonl | 5,123 | e8903a41da5ddbaef6bbaa9b6a585aef051488400c02ff5538d364bba0f72903 |

Publisher archive: https://www.etim-international.com/wp-content/uploads/2021/09/ETIM-BMEcat-Guideline-V5-0-2-2024-12-12.zip . Retained archive identity is3,242,056bytes/SHA256 aa0fdcfae703005eeeebfe542f877b4167c4e4b04594f2095fc105364d224de4. The original SOURCES.md and SHA-locked convert-published-etim10.py remain unchanged. The new general parser uses that established projection as its original-data comparison, rather than treating the one-file converter as a generic importer.

The original example contains one product411061, 30 ETIM10 features, 301 source fields, and dated example values. Its existing supplier projection contains203 mapped fields, with98 retained outside that projection. Expiry dates, unknown feature markers, price lexemes, relative MIME locators and the external product relation stay as published. No feature definitions, image bodies or current commercial dates are supplied by this example.

## Module and integration contract

parser.mjs is the pure incremental XML parser. createBMEcatParser({limits,onEvent}) accepts decoded UTF-8 chunks through write(text), then end(). It emits header/product events followed by one complete event. Product events are provisional until EOF.

input.mjs exports readBMEcat(filename,{signal,expectedBytes,expectedSha256,limits}). It opens an original regular file without following a leaf symlink, reads262KiB chunks, uses fatal UTF-8 decoding, hashes the entire original byte stream, checks final file identity and only then returns the complete event with bytes and SHA-256. A UTF-8 BOM is included in the source hash and excluded from XML text.

source.mjs exports readBMEcatSourceRows(filename,context). The original catalogue supplies its SQLite db, optional cancellation signal, and expected original length/hash. Owned TEMP tables stage every product and reject repeated supplier identifiers. The complete document and every projected row must pass before optional await context.onDocument(metadata) is invoked once, and before the first {ordinal,record} is yielded. This closes the original upload's eight-row sampling boundary. Early sampling return, cancellation and failure drop only the owned TEMP table. Native SQLite receiving remains part of the single original customer workflow.

Records expose materialId, title, description, partNumber, manufacturer, unit, supplier and bmecat. materialId is the exact original SUPPLIER_PID. The bmecat object retains the root attributes, header/product trees, expanded namespaces, original mode, transaction, source ordinal/path/hash, field mappings, language inheritance and unmapped fields. XML text/attributes follow XML normalization; exact lexical bytes remain in the immutable original XML.

projection.mjs exports bmecatInputProfile(metadata=null), returning catalogMapping, supplierBindings, sourceProfile, supplierProfile (the same original-header profile), transactionModes and a note. Bindings use the existing supplier product fields under /attributes/supplier. Profile suggestions preserve buyer/supplier identities, original language and country selections, currency and catalogue envelope. receiverAccepted and subsetAgreed remain false; no recipient agreement is inferred. Multiple conflicting source values remain in the original tree with explicit projection issues.

The default material map intentionally does not assert a content-unit conversion. The supplied order/content/price-quantity fields remain exact in the supplier projection for explicit existing rules and operator review. No BMEcat-to-xChange business transformation is asserted by this source adapter.

## Transaction meaning

| Original transaction | Catalogue preview |
| --- | --- |
| T_NEW_CATALOG | full only; original PRODUCT mode defaults to new |
| T_UPDATE_PRODUCTS | delta only; each PRODUCT requires new, update or delete |
| T_UPDATE_PRICES | retained source/lookup only; partial prices cannot replace full material records |
| T_NEW_PRODUCTDATA | retained source/lookup only; partial product data cannot silently remove accepted commerce fields |

The parent catalogue preview must call assertBMEcatCatalogMode(metadata,mode) from its onDocument callback before applying rows. The original full/delta mapping uses /bmecat/mode, upsertValues new/update, and deleteValues delete. A full-mode product deletion is refused by both the transaction guard and parser's transaction-specific mode restrictions.

An update's prev_version is retained as source text; it is the original update sequence, not an invented comparison against CATALOG_VERSION. The operator must choose the correct existing catalogue/base and review its source identity. No merge policy for price-only or product-data-only files is introduced. Those files remain downloadable and available for explicit lookups.

## Integrity and limits

The parser rejects DTD/entity declarations, external resolution, undeclared/reserved namespace bindings, duplicate expanded attribute names, mismatched tags, invalid XML characters, unknown entities and trailing document content. Comments and processing instructions do not change product values; their original bytes remain retained. Namespaces are interpreted by their expanded names, so a publisher's namespace-prefix spelling does not change the supplier projection.

The default maximum original document is8GiB, matching the existing source store. Individual tokens are bounded to2MiB characters, headers/products to8MiB characters including a separately bounded parsed representation, depth64, attributes128, names512, group nodes65,536 and products10million. Callers may reduce these bounds. Native staging processes at most one projected row at a time and accepts at most2MiB serialized projected-row content, matching the existing material limit. These are protective limits; oversized products require an explicit workflow change rather than silent truncation.

The conformance receipt states its actual scope: XML1.0 structure and ETIM transaction envelope. Full XSD validation, classification metadata, recipient business rules, related asset acquisition and acceptance remain distinct. Existing native supplier validation and any installed original XSD validator remain authoritative for those checks.

## Original receiving join

official-source.mjs exports receiveOfficialBMEcatSource({db,fixtureDirectory}). Import it from the complete original customer receiver; it verifies the three retained original identities, reads through native EOF/TEMP staging, compares the entire supplier object to the established original JSONL, checks1product/30features/301fields/203mapped/98unmapped, and returns the actual source receipt plus input profile.

Continue with the same original catalogue upload, named mapping, preview/select, supplier plan/review, complete workspace export and cold reopen. A source-only receipt is not a customer or rendered-product acceptance receipt.

Before an outgoing client/prospect product is ready, its producer must open and run the exact outgoing version, render and look at the pixels, operate important controls at desktop and narrow widths, and inspect meaningful populated, empty, loading and error states. Open, view, play or use every outgoing attachment as its recipient; exercise downloads and reopened packages. Returned screenshots must reach the producing seat and actually be viewed. Keep the design plain and industrial, make concrete repairs, and preserve original operation custody. Source review, HTTP checks and a peer's pass cannot substitute for producer viewing. Apply this instruction in current/future receiving assignments, preserve original spending/voice restrictions and actual task-specific cutoffs, and do not introduce broad suites, restarts or watchers.
