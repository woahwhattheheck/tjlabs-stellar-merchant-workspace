# Complete Fleet Availability repaired working archive

This archive contains the complete installed source, populated editable desk, retained requests, every edition, original input bytes, managed state and working history. The browser persistence repair preserves memory-only edits and recovery guidance when IndexedDB is unavailable. It retains every historical archive member and compressed payload except the explicit source, current working HTML and export-manifest replacements recorded in PUBLICATION_SOURCE.json.

From a checkout of this branch, assemble the ordinary ZIP:

node receiving-checkpoints/fleet-availability-study/memory-fallback-archive/assemble-archive.mjs /absolute/path/Fleet_Availability_Complete_Source.zip

The assembler verifies exact independent part bytes and the ordered whole archive hash. Extract the ZIP and open working/Fleet_Availability_Study_Editable.html. Follow source/README.md and source/INSTALLED_OPERATION.md for the application, and source/receiving/RESUMABLE_EXPORT.md for native export continuation.

Every original member is reopened from actual acknowledged immutable Git blobs before this final manifest and receipt are published. The receipt carries ordinary CRC32/SHA-256, complete export-manifest and whole ZIP results. PUBLICATION_SOURCE.json binds the original prepared index, repaired installed source and exact working HTML.

Repaired source merge: cfc0ade43456f3ad18d9878ce3a1cdec4bc13139
Populated HTML: 7766287 bytes / SHA-256 5cf133ac7259b1a0a4cc042b647f6c09ee6e138e768e26503948b7341450767b
