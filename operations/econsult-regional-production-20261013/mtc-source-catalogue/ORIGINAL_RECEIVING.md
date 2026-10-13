# Receive the original MTC PDFs into the existing ESI project

Operation: MTC-PBA2050PLUS-SOURCE-IMPORT-20261013.

This receiver completes the original source intake already described in catalogue-input.json. It materializes the two existing retained Notion PDF attachments and preserves the complete inline Table 1 JSON. It uses their current provider download mappings, fixes their full byte hashes after actual receiving, parses all pages, renders every page and retains a complete replayable receipt.

The original 48DB source/procurement lane owns these source selections. The maintained importer and ESI controller join the received originals into the existing economic project. No additional company contact or procurement acquisition is part of this operation.

## Exact originals

| Original | Complete bytes | Pages | Original role |
| --- | ---: | ---: | --- |
| MTC_Final_Regional_Growth_Forecast_2024_12_17.pdf | 152,937 | 2 | Published 17 December 2024 forecast attachment. |
| MTC_Regional_Growth_Forecast_FAQ_2026_02_12.pdf | 777,707 | 4 | Published 12 February 2026 methodological FAQ. |
| MTC_PBA2050Plus_Full_Published_Growth_Table_2024_12_17.json | 3,946 | — | Complete source-labelled transcription of Table 1. |

The original catalogue contains the exact stable Notion references, upload IDs, publisher URLs, source dates and filenames. The PDF hashes begin unset because the earlier source carrier did not include the full binary bytes. Actual receiving calculates and freezes them. The table JSON is already hash-bound to 6fce41e3b42febfc38eedb96f79400f7a1745c635d963571349eb50855e81e7c.

Preserve the published geography, years and units. The table is a nine-county Bay Area aggregate with four series and seven labelled years. The separate Plan Bay Area 2060 procurement remains a separate original source. The source receiver does not infer county allocations or convert published forecast values into observations.

## Resolve the existing provider files

Read the complete catalogue-input.json from the original maintained package. Pass the two PDF stableReference strings unchanged to the installed Notion get_file_download_urls action. Both must resolve.

Save the complete returned files/unresolved mapping in a private UTF-8 JSON file. The files array contains each original reference, current signed HTTPS url and expiry_time. Keep that mapping private. It is a transport input, not a public citation or a replacement source identity.

The receiver requires exactly those two references. It records the URL's digest and provider response metadata without publishing the signed URL in its source receipt. If a download has not finished before a mapping expires, resolve the same original references again and continue the same directory. Complete received files never require a new network fetch.

## Run the whole source receiving

Materialize the complete original six-file package together with receive-mtc-originals.py and this guide. Use the actual installed Python 3 and Poppler pdfinfo, pdftoppm and pdftotext. The same original ESI operator owns execution.

~~~sh
python3 SOURCE/operations/econsult-regional-production-20261013/mtc-source-catalogue/receive-mtc-originals.py \
  --catalogue-input SOURCE/operations/econsult-regional-production-20261013/mtc-source-catalogue/catalogue-input.json \
  --download-map /private/mtc-current-download-map.json \
  --directory ROOT/mtc-original-files
~~~

Optional --pdfinfo, --pdftoppm and --pdftotext select existing installed executables. The receiver holds ROOT/mtc-original-files/operation.lock for its whole operation. Keep the original ESI controller lock with that controller; this is the separate source-receiving lock.

The full selected catalogue input and original source identities are recorded before download. Each PDF receives one stable request ID with distinct transport attempts. Each successful complete response must match its original byte count and any declared Content-Length; the response must use the original uncompressed byte representation. The receiver verifies PDF signature/end marker, runs pdfinfo and checks the exact two- or four-page count before publication.

A body reaching disk before its checkpoint is reopened and fully validated. An incomplete body is retained as an interrupted attempt, and the same original request can download its complete original again. Complete bodies publish through a synced temporary file and exclusive link; an unrelated existing destination is never overwritten.

The receiver also copies and verifies the complete original Table 1 JSON. The PDF hashes, byte counts, page counts, native parser output, publisher source identities and response metadata become part of the complete receiving result.

## Actual rendered inspection

All two forecast pages and all four FAQ pages are rendered to PNG at 110 DPI. Full original text is extracted separately using Poppler. Rendering metadata binds every PNG and text file to the exact PDF hash and records its own complete byte count and SHA256.

The receiver leaves producerViewed false. The original producer must actually open every page image and the exact outgoing PDF, inspect content, page order and legibility, then retain its explicit VIEW/screenshot observations alongside the operating result. Capturing a page is not the same as viewing it. Keep the original rendering receipt immutable; an actual producer-view receipt can be retained separately after inspection.

When the original files are imported, also open the actual final Research application at desktop and narrow widths, use its three source rows, product/source-gap controls, PDF/JSON downloads, complete export and receiving/reopen. Fix concrete readability, clipping, missing-file or control errors in the maintained application. Keep the UI industrial and clean.

## Continue the existing importer and controller

A COMPLETE receiving result names originalsDirectory. Pass that exact directory to the existing ESI controller's --mtc-originals selection. Its original research-agent course must already be selected. The controller then invokes the maintained importer on the same saved Research/economic project and retains the full independent receiving.

Direct native invocation, when used by the existing owner, remains:

~~~sh
node SOURCE/operations/econsult-regional-production-20261013/mtc-source-catalogue/import-mtc-sources.mjs \
  --fred-root SOURCE/stellar/scf-starforge-20261009/sf30-seller-sdk/fred \
  --project ROOT/research/project \
  --directory ROOT/mtc-source-receiving \
  --originals ROOT/mtc-original-files
~~~

The importer preserves its native request IDs, completed operation history, source definitions, literal source roles and original economic state. Existing explicit Research review and issue controls decide reviewed coverage and issued editions. Receiving the documents does not silently accept them as a review or invent a human decision.

## Complete durable result

ROOT/mtc-original-files contains the three complete originals; the original catalogue input; per-source request/attempt and complete body receipts under pending; the complete parser output; all six PNG pages and original text under rendered; receiving.json; and stable receiving-result.json.

On COMPLETE reopen, every original file and every rendered member is checked against its saved hash, and the existing result returns unchanged. Refreshing the transport mapping cannot alter the original source identity or completed result.

Keep the complete source directory with the original ESI operating archive. Customer-facing attachments are the original PDFs, source-labelled table and the existing project's selected exports. Keep the signed provider mapping and private operating request files in the private receiving workspace.
