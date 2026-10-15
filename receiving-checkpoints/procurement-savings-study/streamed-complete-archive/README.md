# Complete Procurement source and retained working archive

This directory contains the complete ordinary ZIP as independently encoded, hash-checked parts. The adjacent manifest.json is published only after the final streaming receipt succeeds.

## Assemble the ordinary ZIP

Keep assemble-archive.mjs, manifest.json and objects/ together, then run:

```sh
node assemble-archive.mjs /path/to/Procurement_Complete_Source_Handover.zip
```

The maintained assembler verifies every original part text, canonical base64 encoding, decoded part size/hash and the complete ZIP size/hash. It writes a temporary file and publishes the final output exclusively after verification. Open the resulting ZIP with an ordinary ZIP application.

## Complete contents

- 25,391 members across 896 completed source groups.
- All 664 current standalone source files, including the native shared helpers and default compressed ZIP codec.
- The actual current working application and session, 37 retained branches, and complete exports for all 38 distinct studies.
- All 39 managed requests and 40 managed editions from the complete actual Merchant course.
- Original EXPORT_MANIFEST.json with every member size and SHA-256.

Expected ordinary archive size: 306,562,228 bytes. Complete expanded member size: 898,154,099 bytes. The exact completed ZIP SHA-256 is in manifest.json and receipt.json.

## Provenance and reproducibility

Original completed course checkpoint: 8d2469b2a27e881afac5a68fba826acf8e034cd5, receiving-checkpoints/procurement-savings-study/complete-archive/checkpoint.json; its pretty JSON plus newline is 7,552,004 bytes / SHA-256 d32fa4458e2e4487b8dad600f17222e14d40feb9c627508d5fa8e46a8ef97538.

Final source successor: 680e054dbf3cd4634bb866175a82e40df9d3483b on a74f/procurement-closed-native-source-archive-20261015, at the same checkpoint path; 7,560,197 bytes / SHA-256 70b1bbfc08d460b84f1e8835e04654897e52e95a358e0d854bdb7bad40ff6a25. Its explicit derivation preserves all 25,374 unaffected member identities and packed references. The 17 explicit changes comprise final source packaging, the generated editable working HTML and the export inventory. Current source commit: 616bf52ded7359b880c01700db6a226ab8cfe35a.

The complete Merchant course provenance remains pinned to its executed source versions; final source assembly and standalone native receiving are recorded separately. Earlier checkpoints remain durable in Git.

The maintained independent range reader is at commit f4214739cabfd8aa2d909f12f427c989c4810f4a, receiving-checkpoints/tools/prepared-export-streaming/. From that checkout, run read-streamed-archive.mjs against this manifest to reopen every member, compare the original export inventory and obtain the whole ZIP SHA without assembling a complete ZIP buffer. Its ORDINARY_ZIP_RANGE.md documents the injected transport and native command.
