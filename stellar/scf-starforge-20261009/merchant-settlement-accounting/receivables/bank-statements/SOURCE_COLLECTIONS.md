# Original statement collections

A bank delivery often contains several original account statements or the pages of one daily statement. **Statement collections** keeps the entire delivery, every working interpretation and each inclusion decision together while the existing bank source editor performs the financial intake.

The collection contains complete originals. Its browser storage and downloaded JSON preserve original basenames, byte lengths, SHA-256 identities and canonical base64, plus each file's source format, text encoding, bank namespace, CAMT message version, original namespace and booking-reference interpretation, detail policy or complete CSV mapping. The original account, source review, request journal, transaction matching and account close remain the same maintained bank workflow.

## Receive a whole delivery

Open Bank reconciliation and select **Statement collections**. Create a named collection, then select all the original OFX, QFX, CAMT.053 XML or CSV files. A filename extension chooses an initial format; review the actual source before financial intake. A collection supports up to 1,000 original files, 16,000,000 bytes per file and 128,000,000 original bytes in total. The complete compact JSON transfer also stays within 192,000,000 UTF-8 bytes, enforced as originals, mappings and preview summaries change. This same limit applies when receiving the collection in the browser or CLI.

The table pages every 25 originals. Search covers the original filename, note and reviewed account/date fields. A status filter separates files awaiting source review, partially retained statements, complete current imports, previous interpretations and exclusions. Each row downloads its complete original file.

Select **Review original**. The existing source editor opens that file and its saved interpretation. For CSV, choose its exact original headings or column positions, amount/date conventions, account fields, balance records and exclusions. For CAMT.053, review the supported namespace, institution identity and entry/detail policy. Your unfinished mapping stays with that original when you return to the collection or open another file.

Select **Review original source**, inspect every account statement section and use the existing account/source controls. A file with three account sections remains one original file, with three separate source sections to retain. Adding a bank account and retaining a statement use the existing original financial requests. A lost response continues through the same saved operation on the Bank page.

**Return to all original files** opens the same working collection. Its progress comes from the current bank workspace's retained imports, matched by original file hash, statement identity and exact interpretation digest. A new interpretation invalidates the preceding working preview. An import superseded by a later interpretation is shown as earlier history; it does not count as a current imported section.

The collection's progress describes source intake. Continue transaction review, matching and statement closing through the original Bank pages. For a paginated CAMT statement, select its retained original pages in **Close statement**, review the complete sequence and original opening/final closing, and continue through the existing close and accountant receiving workflow.

## Keep exclusions and unfinished work

An excluded original remains in the collection and in its full download. Record why it belongs outside the current intake. An unfinished exclusion without a note remains visible as **Exclusion note needed**. Reinclude it when its source question is resolved. Exclusion here changes a working intake choice; it never deletes an already retained bank statement.

Each original keeps its own CSV/CAMT choices. Editing a file in the standalone import picker detaches that editor from the collection item, so later changes cannot overwrite an unrelated collection mapping. Returning to a collection item opens its own complete saved interpretation.

Collection saves use the existing browser's IndexedDB under the original workspace identity. The collection and its catalogue entry commit in one transaction. If saving fails, the current complete working collection remains available for download; the page reports the failure. Download a completed collection before moving browsers or clearing site data.

## Download, transfer and reopen

**Download complete collection** exports every original byte, mapping, note and inclusion choice in one JSON document. Opening that file creates a separate collection copy and retains the originating collection, workspace and revision. Existing collections remain selectable.

The receiver verifies every original byte length and SHA-256 before selecting the complete incoming copy. It clears prior preview decisions and composes fresh source reviews in the receiving workspace. Existing financial import progress is then derived from that workspace's actual retained imports. The original source file can be reopened on a different bank installation without copying another workspace's financial requests.

An original source collection is useful before all source review is complete. It carries the original data and preparation choices through an engineer/accountant handover. Issued financial closes and their accountant archives continue through the existing complete account export.

## Native preparation and receiving

The installed command exposes the same original-file model and interpretation builder:

~~~sh
starforge bank-statements collection prepare \
  --manifest /private/bank/original-files.json \
  --out /private/bank/complete-collection.json

starforge bank-statements collection inspect \
  --input /private/bank/complete-collection.json \
  --out /private/bank/complete-source-review.json

starforge bank-statements collection extract \
  --input /private/bank/complete-collection.json \
  --out /private/bank/received-originals
~~~

All outputs are create-only. The manifest names existing original paths and explicit interpretations:

~~~json
{
  "workspaceId": "ORIGINAL_ACCOUNTING_WORKSPACE_SHA256",
  "name": "Original bank delivery",
  "files": [
    {
      "path": "/private/bank/original-statement.xml",
      "mapping": {
        "format": "CAMT053",
        "columns": {},
        "accountNamespace": "",
        "camtDetailPolicy": "PRESERVE_ONLY"
      },
      "included": true,
      "note": "Original bank-issued statement"
    }
  ]
}
~~~

Replace the workspace marker with the exact 64-character SHA-256 identity returned by the existing Bank state, and the path with the actual original. Collection and item IDs retain their own UUIDs. CSV mappings use the same working fields exported by the browser. Preparing a collection reads each complete original file, verifies its regular-file size and stability, and creates the portable collection without opening an accounting writer.

Inspection runs every included file through the installed original bank source parser. It retains each account/statement preview and the exact source-review digest. An original parser error stays attached to that source item, while the command continues the remaining original files. This makes a complete delivery usable even when one original requires source correction.

Extraction creates a private directory, one original-ID directory per item, an original subdirectory holding the exact original basename/bytes, the item's interpretation.json and the complete collection.json. Separate directories preserve same-name originals and keep metadata filenames independent. Every written file's full byte count and SHA-256 is returned by the command.

## Original-source receiving

Continue the existing Bank receiving operation with its retained original files. Use the native preparation, inspection and extraction above, compare the extracted files to their original byte identities, then open the complete collection in the installed Bank browser. Save an unfinished mapping, switch between originals, return to it, preview every supported account section, retain its existing source requests and review the resulting collection progress.

Download the full working collection, open it as a separate copy, and verify that all originals, mapping fields, inclusion choices and notes remain. Reprepare the source previews in the same original bank workspace; its existing imports should resolve through the original file/statement/review identities. A current superseding interpretation must remain visible as later history.

The implemented model and exact existing preview/digest domain have already been exercised against the three retained Goldman Sachs originals. Both accepted original reports preserve all four statement sections; the original malformed structured sample remains an explicit source exclusion. Complete transfer preserves every byte and working field, changing a mapping requires fresh source review, and altered recorded file lengths are rejected. Controlled import-interface inputs exercise complete, partial and superseded progress. Continue the installed browser and native file commands in the same original operation for their actual host results.

## Complete Bundesbank original delivery

The [Bundesbank receiving guide](BUNDESBANK.md) opens both complete original ZIPs and all22XMLfiles as one collection. Its two CAMT.053 statements retain explicit `camtNamespaceMode: "UNQUALIFIED"`, `camtMessageVersion: "camt.053.001.08"` and `camtReferencePolicy: "SOURCE_ENTRY"`; the twenty CAMT.052 reports travel with explicit exclusions. These fields restore into the same source editor and pass through `sourceInputForItem` in both browser and CLI. The example keeps the original cheque and fee separate despite their repeated bank reference, and carries the entire delivery through preparation, review, original extraction and independent collection receiving.
