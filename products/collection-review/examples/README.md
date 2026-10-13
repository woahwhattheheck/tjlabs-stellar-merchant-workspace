# ArchiveBlack institution review input

This is an actual source-backed preparation example for Collection review. The published workspace is a **credential-redacted derivative**, not a byte-exact copy of either captured website page and not an institutional publication or an RFI requirement.

Open `ArchiveBlack_Institution_Review.json` with Collection review. It retains two institution sources and all 44 ordered occurrences (19 TMU and 25 Museum London). Every occurrence remains unreviewed and every rights observation remains unknown. The model, original titles, links, institutional metadata, anchor text and byte coordinates are unchanged.

## Why this publication has new identities

The original retained HTML included a third-party Google Maps browser key in two script locations on each page. This public example replaces all four occurrences with the nonfunctional 39-byte marker `REDACTED_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`. No credential request, validity test, rotation or revocation occurred.

The replacement has the same UTF-8 length as the removed strings. Every original catalogue anchor and its byte range is unchanged. Complete sanitized HTML is embedded and separately exportable. Its filenames explicitly identify the redaction. Source observation times still describe the retained original captures; the derivative's creation time is recorded separately.

The sanitized sources have new source/occurrence identities, and the publication uses a new workspace and two new native revisions. Open it as a separate workspace. Do not merge it as if it were an unchanged continuation of the original workspace. `PUBLICATION_REDACTION.json` retains the original workspace, revision and source hashes, the exact source-to-derivative mapping, and the updated packet/report identities without retaining the removed value.

## Sources

- [Toronto Metropolitan University](https://archiveblack.ca/archives/toronto-metropolitan-university-ryerson/): 127,506 UTF-8 bytes. Original capture SHA-256 `876c468733f278e6d720d752dfe6a52e2738f4df967684b7598cde9c1b0c3e88`; sanitized source SHA-256 `8fb9e88288bb3cc60f9a7abb1c2d17c27baccd5e1e496eda5c4d62dd2f67a851`.
- [Museum London](https://archiveblack.ca/archives/museum-london/): 127,389 UTF-8 bytes. Original capture SHA-256 `7bf9e050d5786bce5db91fc8668ca28cdec89fe8c2f39c5603aabce776daa623`; sanitized source SHA-256 `92196d63685211b567a0f7889459cb2ce15eeaa776eb5a675b48e661de7fefb8`.

No linked media was downloaded. Duplicate targets remain separate occurrences. Dates remain combined with their published titles. The original capture's observation time is when that retained capture was consumed, not a fresh website request.

## Continue the review

The paired JSON projection and printable HTML were regenerated from this same sanitized workspace through the maintained model and renderer. Complete-packet reopen, every native source/revision hash, all 44 occurrence fields and the exact anchor byte coordinates were checked in a pure JavaScript exercise. Native CLI, browser operation and visual rendering were not run for this repair.

Use the existing Collection review controls and [operating guide](../OPERATING.md). The optional Source Tables export continues to use the existing generator and its nonpayable testnet example. Configure deliberate original route/payment terms before any real service use.

For future public examples, inspect captured HTML and other supplied source files for embedded credentials before publication. Any redaction must be declared and re-admitted as a derivative through the native model; do not silently alter a hashed retained source. Removing a value from the current example does not remove historical Git objects or establish the credential owner's restrictions or rotation status.

## Attributed editorial edition

The credential-redacted initial packet/projection/report above remain unchanged. The original authored editorial request was recorded by **TJLabs assistant — editorial proposal** at **2026-10-13 08:21:54 UTC**. A separate publication request recorded at **08:40:39 UTC** maps its unchanged editorial fields to this derivative's verified source and occurrence identities. The new UUID and expected revision are explicit; all three derivative workspace history revisions are retained.

| File | Purpose |
| --- | --- |
| ArchiveBlack_Editorial_Request.json | Exact original authored request, retained as provenance; it refers to the earlier original workspace |
| ArchiveBlack_Editorial_Publication_Request.json | New exact request mapped to the current derivative workspace |
| ArchiveBlack_Editorial_Derivation.json | Original-to-derivative request and source identity mapping |
| ArchiveBlack_Editorial_Review.json | Complete editable packet, including both credential-redacted HTML sources and every prior revision |
| ArchiveBlack_Editorial_Projection.json | Selected review, institutional ordering, rights fields, story order and qualified relationships |
| ArchiveBlack_Editorial_Review.html | Printable complete review and separately ordered proposed story |
| ArchiveBlack_Editorial_Native.zip | Byte-exact 27-file model export, including the original Source Tables/native example |
| ArchiveBlack_Editorial_Package.zip | Complete 33-file portable delivery with all model files, original and mapped requests, redaction/derivation provenance, explanation and a full file inventory |
| ArchiveBlack_Editorial_Edition.json | Exact output byte identities and the recorded verification boundary |

The edition includes **28 internal metadata proposals**, **16 records requiring clarification**, a **14-link proposed story**, and **19 qualified relationships**. All **44 rights statuses remain unknown**; no replacement titles, linked media, institutional approvals or rights grants are introduced. “Include” means selected for internal metadata preparation. Underlying object records did not supply additional verified facts for this edition.

The proposed route groups source labels about performance, interview parts, sporting awards and civic campaign objects. It distinguishes exact observations (for example, two TMU occurrences with the same target but different date labels) from proposed thematic relationships. Museum London occurrences 10 and 13 retain 2024, and occurrence 22 retains 1984, with clarification questions instead of substituted dates. Repeated source labels/targets preserve distinct occurrence identities.

### Open and receive

Open **ArchiveBlack_Editorial_Review.json** in Collection review to select this complete edition. To preserve an existing colleague's selected local revision, use **Receive**: all incoming revisions are retained, while local selection remains unchanged. Select the received editorial revision explicitly from history when preparing a new draft.

The ZIP contains the same complete packet at `collection-review/workspace.json`, credential-redacted source bytes, HTML/JSON review, CSV occurrences and relationships, story JSON, and a hashed file manifest. The native example retains the original Source Tables nonpayable testnet defaults; no deployment or paid service was performed.

### Reproduce with the published CLI

Run from a checkout containing the original component and these files. The output filenames below must not already exist; every CLI write is create-only.

```sh
node stellar-forge/developer-site/collection-review-cli.mjs save \
  --project products/collection-review/examples/ArchiveBlack_Institution_Review.json \
  --request products/collection-review/examples/ArchiveBlack_Editorial_Publication_Request.json \
  --out /absolute/new-directory/ArchiveBlack_Editorial_Review.json

node stellar-forge/developer-site/collection-review-cli.mjs report \
  --project /absolute/new-directory/ArchiveBlack_Editorial_Review.json \
  --out /absolute/new-directory/ArchiveBlack_Editorial_Review.html

node stellar-forge/developer-site/collection-review-cli.mjs export \
  --project /absolute/new-directory/ArchiveBlack_Editorial_Review.json \
  --native --out /absolute/new-directory/ArchiveBlack_Editorial_Native.zip
```

Expected editorial revision: `revision-63c330e37c70b5f12a4df6b414a2b6688376789ed4a92a4ee94b5aca7d264a5f`. The checked-in ZIP is **1,658,920 bytes**, SHA-256 `f96ea3c03ca7f0290ac6279e30fe173cf97396e3430ff9cc5a29b5049b0ed4c9`.

The exact published functions saved, reopened, replayed and received this actual data in V8 with controlled platform adapters. This establishes the retained model/output behavior; it is not a native browser, installed CLI or customer acceptance claim. The earlier native invocation did not start because the environment was offline. No public catalogue was changed and no RFI response was submitted.

The installer includes the editable packet, both requests, projection, HTML, redaction/derivation provenance and edition identity. The already-generated ZIP is available in this repository; installed users can generate it with the same original `collection-review export --native` command.

The complete **ArchiveBlack_Editorial_Package.zip** is 1,749,794 bytes, SHA-256 `580c78fc9436f3b3a9576e05c384565d1e8550ad11c0e6a63090d0cb78b0379c`. Its 27 model-generated files are unchanged from the native export; the six added entries carry the two requests, redaction record, derivation record, publication explanation and complete publication file inventory. The existing `zipWorkspace` function assembled it. For colleague handover, use this complete package so the source-redaction record travels with the workspace.
