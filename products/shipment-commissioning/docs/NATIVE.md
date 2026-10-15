# Native receiving

Requires Node.js 18 or later on Linux/macOS. No install step, third-party packages, network calls or service credentials. Keep the complete folder together.

Use absolute paths. Start an empty workspace:

```sh
node native/shipment-commissioning.cjs new /absolute/work/workspace.json evaluation-1 "Shipment commissioning"
node native/shipment-commissioning.cjs inspect /absolute/work/workspace.json
node native/shipment-commissioning.cjs desk /absolute/work/workspace.json /absolute/work/desk.html
```

Open the emitted HTML in a normal browser. It contains the same core and complete authored example. Browser edits save to browser storage and exported JSON; they do not modify the native file automatically. Import the downloaded workspace.json explicitly for native continuation.

## Original commands

Create a command JSON using docs/CONTRACT.md. Keep its original ID, expected_revision and expected_hash unchanged across retries. `apply` replays and validates the workspace, locks the selected file, applies the original command and writes through a synchronized temporary file. A repeated exact request returns the current state even after later operations; reuse of its ID with changed content is rejected.

```sh
node native/shipment-commissioning.cjs apply /absolute/work/workspace.json /absolute/work/command.json
node native/shipment-commissioning.cjs import-original /absolute/work/workspace.json /absolute/source/document.pdf /absolute/work/original-command.json
node native/shipment-commissioning.cjs export /absolute/work/workspace.json /absolute/export-directory
node native/shipment-commissioning.cjs zip /absolute/work/workspace.json /absolute/work/handover.zip
node native/shipment-commissioning.cjs course /absolute/work/authored-course.json
```

The import-original command specification retains the normal command fields and a value containing id, description, origin and media_type. The actual file supplies the retained bytes and filename. The original remains at most 20 MiB. Workspace inputs are at most 180 MB.

The export folder is bound to an exact workspace hash and full member plan. Repeating an interrupted export resumes only identical members. An existing changed member or another plan is rejected. A crash before its first plan publication can resume only identical EXPORT_PLAN.json.partial-* bytes. Ordinary files and physical parent directories are required. A leftover workspace lock includes its process ID and token; establish that the prior writer has stopped before removing it.

## Execution coverage

The production core, authored 32-command course, replay, renderer and ZIP roundtrip are exercised in V8 in this prepared source. Native filesystem execution and a real browser receiving pass are separate receiving steps. Run the commands above on the intended host and retain the actual outputs with the programme.

## Workspace and browser session distinction

The native CLI intentionally accepts replayable workspace JSON only. It rejects a full browser session instead of silently discarding unfinished forms or prior browser branches. Use Handover → Save workspace JSON for domain operations and separately retain the complete session JSON for browser editing. Native exports use hash-derived safe paths for originals and reports; index files retain original IDs and filenames.
