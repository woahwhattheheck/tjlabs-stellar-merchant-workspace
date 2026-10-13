# Receive an original BMEcat supplier catalogue

The material catalogue accepts the original ETIM BMEcat XML as a retained source. It parses the complete file before suggesting a mapping or previewing a catalogue edition. Original supplier identifiers, transaction modes, headers, prices and unprojected fields remain attached to the source and its reviewed product records.

Use the existing material workspace described in [README.md](./README.md). Select **Material catalogs**, retain your XML with format **BMEcat XML**, and choose **Map original BMEcat products**. The source inspection shows the original transaction and product count. The mapping action fills the existing catalogue mapping editor; review it and save the catalogue before previewing.

## Original transaction and edition mode

| XML transaction | Catalogue operation |
| --- | --- |
| `T_NEW_CATALOG` | Preview a full edition and compare it to the selected earlier edition. |
| `T_UPDATE_PRODUCTS` | Preview a delta against a selected full edition. Each original new/update/delete operation is preserved. |
| `T_UPDATE_PRICES` | Retain and inspect the source, including prices and source paths. A whole material replacement is refused. |
| `T_NEW_PRODUCTDATA` | Retain and inspect the source. Applying its partial fields requires a separately reviewed merge. |

The source's original `SUPPLIER_PID` remains the material identifier. Other identifiers belong in references. An edited mapping that changes that identifier or reverses an original delete/upsert operation is rejected before the new edition is seeded or populated. The complete raw document, every projected row, declared source size and SHA-256 must pass before the first edition write.

The UI selects the permitted edition mode from the source metadata. A partial transaction stays available as an original source while full/delta material preview remains unavailable.

## Supplier mapping and original header

After selecting the reviewed edition, open **Supplier delivery**. For an existing BMEcat recipient profile:

1. Choose **Use original BMEcat supplier fields** to fill the supplier bindings from the catalogue's retained supplier projection.
2. Choose **Use original BMEcat header** when you intend to populate the profile from the supplier's declared catalogue, parties, languages, currency and date. This is a separate explicit action because it changes profile fields.
3. Review the actual recipient agreement and profile. Source declarations do not establish recipient acceptance or a negotiated subset.
4. Save the submission, inspect all product findings, record reasoned corrections where needed and run the original supplier review.
5. Export the reviewed BMEcat XML, complete product/finding files and the whole catalogue bundle.

The original BMEcat supplier shape and native xChange shape have different field contracts. These two BMEcat mapping actions require a BMEcat profile. Native xChange/2BA remain available through their existing reviewed mappings and profiles.

The original row retains the complete XML product tree and detailed field mapping. A large row may exceed the small upload sample budget, so an empty source sample does not mean an empty catalogue. The source header and product count remain visible; the mapping action reads those metadata directly, and preview exposes the complete projected record.

## Installed and HTTP interfaces

The original command family accepts `format: {"kind":"bmecat-xml"}` in the upload request. Hashing and transfer use the same selected regular file.

```sh
starforge-materials opensearch-catalog catalog-upload \
  --source SOURCE.json --workspace PRIVATE_WORKSPACE \
  --file ORIGINAL.xml --request UPLOAD.json

starforge-materials opensearch-catalog catalog-bmecat-profile \
  --source SOURCE.json --workspace PRIVATE_WORKSPACE \
  --source-id RETAINED_SOURCE_ID
```

Omit `--source-id` to inspect the generic mapping shape. With a source ID, the response includes the exact source-derived header/profile and allowed transaction modes. Use the original `catalog-save`, `catalog-preview`, `catalog-select` and supplier commands for mutations; each uses its original request ID and revision guards.

The browser reads the same profile at `GET /api/catalog/bmecat/profile?sourceId=ID` under the original workspace HTTP access rules. Full original XML is downloaded through the existing retained-source route. The complete catalogue bundle embeds its original bytes and source metadata, along with catalogue editions, decisions and supplier histories.

The [offline recipient](./recipient/README.md) opens that complete handover and provides the original source download. Reopen the bundle in the original operator workspace to continue editable supplier work.

## Complete original-source receiving

The existing supplier delivery course accepts the raw XML directly:

```sh
node stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/receiving/supplier-delivery-journey.mjs \
  --directory /private/original-bmecat-delivery \
  --input-format bmecat-xml \
  --operation supplier-bmecat-original
```

Use the same directory and operation to inspect or resume that existing course. The original default JSONL course stays available.

The raw-XML course verifies the retained publisher identities, uploads the unchanged XML, previews/selects it, compares the supplier projection to the original published conversion, resolves the deliberately omitted original price mapping, receives the complete v1 then supplier v2 handovers, preserves newer corrections when receiving an older bundle, exercises the installed CLI and HTTP profile/export routes, and reopens the complete customer workspace. The raw source, complete metadata and source profile must remain identical. The original XML and all delivered XML are validated against the retained publisher XSD.

This command is the native receiving procedure. Source review and parser checks are recorded separately from the actual complete command result. Producer acceptance also operates the rendered catalogue and supplier controls at desktop and narrow widths, opens all relevant downloads, and visually inspects the saved screenshots from the same delivered source.

See the [source contract and official identities](../../stellar/scf-starforge-20261009/sf30-seller-sdk/opensearch/catalog/supplier/bmecat/README.md) for namespace/version boundaries, streaming limits, retained fields and source evidence.
