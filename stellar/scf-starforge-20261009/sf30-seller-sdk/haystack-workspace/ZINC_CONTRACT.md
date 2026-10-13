# Zinc native grid contract

The original Haystack workspace now accepts **Zinc 3.0** alongside JSON v4. Import, source-local indexing, tag proposals, saved editions, source-byte downloads, native-grid delivery and portable receiving all use the same maintained workspace. JSON v4 remains the default when a format is omitted.

## Select the actual format

In **Source files**, choose **Zinc 3.0** under **Format of these files**, then import the complete original files. A batch uses one selected format. The **Point-list modelling** page accepts a Zinc file through its original native-grid intake; it does not reinterpret Zinc as a CSV point list.

The maintained CLI selects the same format explicitly:

~~~sh
node cli.mjs import --directory ORIGINAL_WORKSPACE \
  --file original.zinc --format zinc \
  --source-url ORIGINAL_SOURCE_REFERENCE --request-file import-zinc.request.json

node cli.mjs native-grid --directory ORIGINAL_WORKSPACE \
  --source-id ORIGINAL_SOURCE_SHA256 --format zinc \
  --request-file export-zinc.request.json --out selected-grid.zinc

node cli.mjs source-download --directory ORIGINAL_WORKSPACE \
  --source-id ORIGINAL_SOURCE_SHA256 --out original-source.zinc
~~~

Use the existing operation ID/revision options and retained request recovery described in [OPERATING.md](OPERATING.md). The first two commands mutate through those original requests. `source-download` returns the complete original bytes; `native-grid` derives the selected current or saved edition and preserves accepted edits. Add `--edition SAVED_EDITION_SHA256` to select a retained edition.

The original HTTP/SDK/MCP action is `source.import` with `format: "zinc"`. For `delivery.prepare`, choose `kind: "native-grid"`, the original `sourceId`, and `format: "zinc"`. Native JSON delivery continues to use `format: "json"`. Register, diagnostics and semantic reports retain their original supported formats.

A Merchant host input with `kind: "source"` can declare `format: "zinc"` with its original local path and SHA-256. Omitted source format stays `json-v4`. The managed importer verifies those complete original bytes before dispatching its original action. No external Haystack server request is introduced.

## Original bytes and typed values

Import requires valid UTF-8 and retains every original byte, including a UTF-8 BOM when supplied. Source identity remains the SHA-256 of those exact bytes. The original Haystack validator checks decoded values, calendar values, reference syntax, number units and nested grid structure. Parser errors identify the affected path and character offset; retained numeric precision or underflow diagnostics also carry the original literal.

Zinc supports the original marker, remove, NA, Boolean, reference, symbol, string, URI, finite/special number, date, time, datetime, coordinate, XStr, list, dictionary and nested-grid kinds. Signed zero is preserved. Explicit original timezones are retained; a non-Z datetime without its required zone is rejected rather than inferred. URI reserved-character escapes retain their backslashes according to the pinned Zinc specification.

Derived Zinc uses standard semantic normalization:

- Unitless typed-number wrappers become native numbers.
- Explicit dictionary wrappers become plain dictionaries.
- Empty column metadata and absent column metadata have the same Zinc representation.
- A blank cell decodes to an absent row member; literal `N` decodes to explicit null. The specification treats them as equivalent, while this codec preserves the syntactic distinction in a multi-column grid.

Encoding rejects values that Zinc cannot represent without losing material content: additional typed members, undeclared row tags, invalid tag names, zero-column grids, a one-column absent cell, units on special numbers, ambiguous leading-underscore units, and datetime/time strings outside the grammar. Export the complete original source or use JSON-v4 when those representations matter. No source file or saved edition is rewritten by an export.

## Portable application and cold receiving

New complete workspace exports use `commons.haystack.package.v6` and include the Zinc codec, this guide and the complete pinned source references. Receiving continues to validate the exact original v1, v2, v3, v4 and v5 application inventories. Zinc source history requires the v6 inventory; a caller cannot label a Zinc workspace as an older package. The original receiving marker, complete member verification, request identity and create-only file publication are unchanged.

## Primary source and scope

The full documents in [zinc-sources.json](zinc-sources.json) are pinned to Project-Haystack/haystack-defs commit `d042781e7031c125332920c9800e3d04e8f16cf7`:

| Original document | Contract used |
| --- | --- |
| [Zinc.fandoc](https://github.com/Project-Haystack/haystack-defs/blob/d042781e7031c125332920c9800e3d04e8f16cf7/src/docHaystack/doc/Zinc.fandoc) | Complete Zinc 3.0 grammar, typed literals, URI escapes and datetime zones |
| [HttpApi.fandoc](https://github.com/Project-Haystack/haystack-defs/blob/d042781e7031c125332920c9800e3d04e8f16cf7/src/docHaystack/doc/HttpApi.fandoc) | Default grid media type text/zinc and explicit alternative format negotiation |
| [Csv.fandoc](https://github.com/Project-Haystack/haystack-defs/blob/d042781e7031c125332920c9800e3d04e8f16cf7/src/docHaystack/doc/Csv.fandoc) | Distinction between tabular CSV and typed native exchange |

The existing [fixtures.json](fixtures.json) retains the complete JSON/Kinds contracts and original Charlie example provenance. Upstream documents remain under the retained [Academic Free License 3.0](HAYSTACK_LICENSE.txt). This integration adds format interoperability. Actual Niagara or other consumer selection, ontology mapping, native validation and commissioning remain the original customer's explicit work.
