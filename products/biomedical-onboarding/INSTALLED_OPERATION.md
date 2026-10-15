# Installed Biomedical Onboarding Desk

Applications provides **Biomedical Onboarding Desk** with a physical private workspace directory and optional new-workspace label. New creates an unused installation; reopening resumes its complete selected editor. Native equivalent:

```sh
node products/biomedical-onboarding/managed.mjs --workspace /absolute/private/onboarding --new-label "Onboarding study"
```

The product distribution exposes `biomedical-managed` and `biomedical-workspace`. Browser and Merchant MCP clients attach to the same Applications-owned private writer. Stop Applications before using standalone writer commands.

## Complete original workflow

Use all eight original record families: customers, facilities, assets, approved PM references, work orders, service events, reports and billing. Import exact CSV originals, map columns explicitly, select source and returned extracts, deliberately pair exact identities, retain report/document bytes and link them to source/returned report IDs. Inspect differences and record a named review bound to the entire selected study digest.

The original core remains authoritative. Unknown columns remain unobserved; mapped empty cells remain observed blanks. A current asset location never rewrites its historic service site. Source due-date, procedure, signature and amount literals remain exact. A comparison review retains findings and does not modify operational equipment, schedules, accounting or signatures.

## Complete installed working file

The installed carrier contains the complete original compact session, all original forms, view/selection, original study/history/branches/object bank, operation actor, emergency-only pending forms/imports and retained emergency preimages. The original standalone session and emergency formats remain available. Explicit v1 migration retains the exact original envelope before selecting the expanded record chain.

The installed ordinary working limit is128MiB and the original compact session limit remains40MiB. A successor is validated before selection or input clearing. At a capacity rejection, the selected study and incoming original remain available; **Save complete working file** falls back to a full emergency carrier containing the original session, pending input and installed metadata. The explicit **Download and clear pending input** route exports that same complete carrier, then clears only the just-exported pending input. It preserves the operation actor and all pre-existing retained emergencies, frees capacity, and leaves the save queue usable for continued work. That exact downloaded file remains the complete original pending input.

Browser recovery uses immutable original session objects and transactional expected-head publication. A competing proposal is retained. Explicit adoption keeps both complete preimages. Applications recovery also preserves the original pending request, selected base and current browser branch.

## Native workspace commands

```sh
node products/biomedical-onboarding/installed-cli.mjs --help
node products/biomedical-onboarding/installed-cli.mjs course /absolute/private/authored-course
node products/biomedical-onboarding/installed-cli.mjs inspect /absolute/private/authored-course
node products/biomedical-onboarding/installed-cli.mjs desk /absolute/private/authored-course /absolute/private/Onboarding.html
```

`receive DIRECTORY WORKING.json` creates an unused installation from an installed carrier, original v2/legacy session, study or emergency file. `session` exports its complete selected carrier. `export DIRECTORY EXPECTED_EDITION_SHA OUTPUT.zip` retains and copies a full source handover.

`request` and `request-status` operate through the standalone writer. `connected` and `connected-status` attach to the Applications writer. Retain the exact original request and use its original ID/content to reconcile an uncertain result. A retry recovers the original outcome while returning the current complete state.

For a declared original file:
```
ingest DIRECTORY INTAKE_META.json ORIGINAL_FILE ORIGINAL_REQUEST_OUTPUT.json
```
The metadata is an action request with operation kind `import`, `document` or `migrate-v1`; payload includes `originalSha256` plus the original core fields. The CLI verifies the original file, expands its exact UTF-8 content or binary base64, writes the complete original request to the requested private output, then applies it.

Original standalone commands remain in `native/onboarding-desk.cjs`; NATIVE.md documents their complete source/model and v1 migration workflow.

## Native and MCP actions

Requests retain installationId, id, baseSha256, actor, at and kind. Save carries the entire installed carrier. Action carries an operation with the same id/actor/at, kind, expectedHead and payload. The saved-state SHA and complete original session head bind different layers.

Supported domain actions are import, choose, crosswalk, match-ids, document, link-document, unlink-document, review, configure, notes and migrate-v1. Their payloads use the original core contract. Document uses contentBase64 plus original filename/media type/capture time. Explicit migration carries originalText and filename. Every native domain action retains the complete original editor before selection.

## Merchant MCP

A separate private Merchant configuration declares `biomedicalConnection`. Its source file uses schema `stellar-forge.biomedical-host.v1` and maps workspace aliases to physical directories, installation identity and declared input aliases. Each input supplies file and exact SHA-256. The actual file length/hash is checked again at use.

Tools cover status/connect/disconnect/browser, inspect/preview/action, ingest/receive and export/file. Ingest selects a declared CSV, binary document or v1 original. CSV additionally supplies recordKind, source/returned side and complete explicit mapping. The shared writer applies the same original core.

Pin expectedSha256 on each read. Page rows with offset/limit1–50. Read collections include full originals/extracts, selected canonical rows with source spans, availability, ID maps, report documents/links, findings, document comparisons, complete assessment, named reviews, drafts, history, retained branches and request outcomes. Each comparison includes the exact selected study identity.

## Complete handover

Full export retains every maintained source, editable HTML, original standalone and installed sessions, current selected tables/reports, exact original CSV and binary documents, every retained study/history/branch, pending emergency input, all host request and edition records, and a per-member byte/SHA manifest. Retained exports remain readable through the declared installation after its listener stops.
