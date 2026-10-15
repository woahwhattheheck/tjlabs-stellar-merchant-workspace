# Studio Session Workbench

An offline workbench for a complete studio-declared session source study: eight original CSV tables, immutable source editions, exact charge and payer comparisons, crew/report attention, source-bound review corrections and full browser/native continuation.

Open **Studio_Session_Workbench.html** or **Studio_Session_Worked_Example.html** directly. The latter includes a clearly authored overnight-session example with two complete source editions and review history. Original-file bytes, unfinished source/review/name drafts and native attempts travel in full workspace JSON and complete working HTML.

- [Browser and receiving guide](WORKBENCH.md)
- [Source semantics and native operations](OPERATE_SESSION_STUDY.md)
- [Exact CSV and API contract](INTAKE_CONTRACT.json)

Regenerate both apps with `node build.mjs NEW_DIRECTORY`. Continue an exported complete desk with `node studio-session-native.mjs --workspace workspace.json --command command.json --out NEW_DIRECTORY`. The command file selects eight actual original sources. Every output directory is create-only.

The receiving/source-course.mjs and receiving/native-course.mjs helpers exercise the actual source and whole-wrapper native flow. The controller course executes the original browser handler functions using explicit DOM/storage/file adapters; it preserves the difference between source execution and rendered browser use. Use WORKBENCH.md for the equipped receiver's complete view, download and reopen.

Amounts are declared integer minor units and dates retain their explicit offsets. The original booking, creative, crew, invoice, payment and media authorities remain separate. No package dependencies, remote scripts, hosted Actions or provider credentials are required for the offline workbench.
