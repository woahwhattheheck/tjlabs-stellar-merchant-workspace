# PrivacyBench Review Workspace

An offline operator for original native PrivacyBench evaluation outputs: receive exact result and supporting bytes, select explicit protocol/candidate/run definitions, prepare immutable editions through the complete Research engine, compare all metric rows, record named reviews, adopt returned reviews and export an editable handover.

## Build and open

From this directory, using Node.js:

    node build.mjs --out /absolute/privacybench-delivery

Open the resulting Open_PrivacyBench_Review.html directly in a desktop browser. All application source is embedded and the application operates offline. WORKBENCH_GUIDE.md explains the full workflow.

The build produces five files: the complete source JSON, self-contained editable HTML, initial working JSON, operating guide and Python source materializer. A repeated build in the same owned output directory verifies the exact same files; a different source requires a new output directory.

The initial workspace is a clearly marked authored software fixture. Start a new workspace for independently produced evaluator outputs and enter their actual dataset, protocol, candidate and run context.

## Architecture

- src/privacybench-workspace.js implements immutable source-backed operations, complete replay and reviewer-return adoption.
- src/native-privacybench.js preserves the maintained native result projection, including exact original number spellings and denominators.
- src/native-research.js contains the complete maintained Research preparation and validation engine.
- src/controller.mjs handles unfinished forms, preview/commit, exact complete-handover capacity and exports.
- web/app.mjs supplies nine operator views, typed metadata and independent IndexedDB branches.
- src/report.mjs and src/io.mjs produce complete reports, safe original paths and portable ZIP files.
- source-build.mjs, build.mjs and native/materialize-source.py compose, materialize and reproduce the complete application.

Complete native sources are under source/research-dossiers and source/node. The static adapters can be reproduced from these sources:

    node integration/build-native-privacybench.mjs --check
    node integration/build-research-factory.mjs

## Receive and inspect

    node commissioning/receive-privacybench-domain.mjs /absolute/privacybench-native-receiving
    node native/privacybench-workspace.mjs inspect examples/complete-authored-workspace.json

commissioning/COMPLETE_RECEIVING_COURSE.md covers native source reproduction, actual browser operation, all exports, returned-review adoption and independent editable reopening. It includes desktop and 390-pixel inspection. Native domain execution and actual browser rendering have separate observations.

Every original file is limited to 32 MiB. Complete handover admission measures the entire portable ZIP against 128 MiB before accepting a structural operation. Originals, native runs, source, reports and editable copies all count. Rejected intake preserves the previous workspace and unfinished forms.

The producer contract is pinned to TonicAI/privacy_bench_metrics commit 5dfcaf57f0dae69b77d819ef04558944d31015de. The operator receives its outputs; external evaluation uses its original rules and environment.

## Source maintenance

PRIVACYBENCH-SOURCE-MANIFEST.json lists the complete shipped source, modes, lengths and SHA-256 values. After reviewing changes to listed source, build with --accept-edits to regenerate the bootstrap and shipped manifest. Add any new source member explicitly to the source manifest. Preserve prior user working copies and originals when updating the application.

## License

MIT. The complete repository license is included in LICENSE and in every built source handover. The maintained Research and PrivacyBench integration sources retain their original notices.
